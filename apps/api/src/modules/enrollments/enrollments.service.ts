import { getAppUrls } from '../../common/config/app-urls.js';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { BatchStatus, EnrolmentStatus, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CacheHelperService } from '../../common/cache/cache-helper.service.js';
import { EmailService } from '../email/email.service.js';
import {
  CreateEnrolmentDto,
  PaymentMode,
  QueryEnrolmentsDto,
  TransferBatchDto,
  TransitionEnrolmentStatusDto,
} from './dto/index.js';

/**
 * Capacity-occupying enrolment states.
 * Learners in these states hold an allocated, confirmed seat in the batch.
 * PENDING_PAYMENT is an in-flight checkout/provisional intent and does not
 * consume hard capacity to avoid blocking paying learners.
 */
export const CAPACITY_OCCUPYING_STATUSES: readonly EnrolmentStatus[] = [
  EnrolmentStatus.ACTIVE,
  EnrolmentStatus.PENDING_AGREEMENT,
  EnrolmentStatus.COMPLETED,
] as const;

/**
 * Non-capacity-occupying enrolment states.
 * Learners in these states do not consume a seat.
 */
export const NON_OCCUPYING_STATUSES: readonly EnrolmentStatus[] = [
  EnrolmentStatus.PENDING_PAYMENT,
  EnrolmentStatus.WAITLIST,
  EnrolmentStatus.REVOKED,
] as const;

@Injectable()
export class EnrollmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
    @Optional() private readonly emailService?: EmailService,
  ) {}

  /**
   * Single-Count Batch Slot Reservation Formula:
   * Occupied Seats = Individual Confirmed Enrolments + Active Org Pool Seats + Active Checkout Hold Org Seats
   */
  async getBatchOccupiedSeats(batchId: string, tx: any = this.prisma): Promise<number> {
    const individualEnrolments = await tx.enrolment.count({
      where: {
        batchId,
        status: { in: [...CAPACITY_OCCUPYING_STATUSES] },
        OR: [
          { fundingSource: 'SELF_PAID' },
          { fundingSource: 'ADMIN_COMP' },
        ],
      },
    });

    const activePools = await tx.seatPool.findMany({
      where: {
        batchId,
        status: { in: ['ACTIVE', 'ACTIVE_UNPAID'] },
      },
      select: { totalSeats: true },
    });
    const activeOrgSeats = activePools.reduce((sum: number, p: any) => sum + p.totalSeats, 0);

    const holdPools = await tx.seatPool.findMany({
      where: {
        batchId,
        status: 'PENDING_PAYMENT',
        paymentExpiresAt: { gt: new Date() },
      },
      select: { totalSeats: true },
    });
    const holdOrgSeats = holdPools.reduce((sum: number, p: any) => sum + p.totalSeats, 0);

    return individualEnrolments + activeOrgSeats + holdOrgSeats;
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // 1. ENROLMENT CREATION (ADMIN / SYSTEM)
  // ─────────────────────────────────────────────────────────────────────────────

  async create(dto: CreateEnrolmentDto, actor?: any) {
    // 1. Verify Learner exists and is active
    const user = await this.prisma.user.findFirst({
      where: {
        id: dto.userId,
        deletedAt: null,
      },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!user) {
      throw new NotFoundException('Learner not found');
    }

    // 2. Verify Program exists
    const program = await this.prisma.program.findUnique({
      where: { id: dto.programId },
      select: { id: true, title: true, slug: true, status: true },
    });
    if (!program) {
      throw new NotFoundException('Program not found');
    }

    // 3. Atomically lock batch, verify constraints, evaluate capacity, and create enrolment
    const enrolment = await this.prisma.$transaction(async (tx) => {
      // Row-level lock per batch ID to serialize concurrent seat allocations (pooler-safe)
      await tx.$executeRaw`SELECT id FROM "Batch" WHERE id = ${dto.batchId} FOR UPDATE`;

      const batch = await tx.batch.findUnique({
        where: { id: dto.batchId },
        select: {
          id: true,
          name: true,
          programId: true,
          status: true,
          capacity: true,
          startDate: true,
        },
      });

      if (!batch) {
        throw new NotFoundException('Batch not found');
      }

      if (batch.programId !== dto.programId) {
        throw new BadRequestException('Batch does not belong to the specified program');
      }

      if (
        batch.status === BatchStatus.COMPLETED ||
        batch.status === BatchStatus.ARCHIVED
      ) {
        throw new BadRequestException(`Cannot enroll into a ${batch.status} batch`);
      }

      // Registration Cutoff Rule:
      // If a batch has passed its configured registration deadline,
      // automated public self-enrollment cannot place a learner into the cohort.
      // Staff (SUPER_ADMIN, ADMIN, MANAGER) can explicitly override and manually assign.
      const isStaff = actor && ['SUPER_ADMIN', 'ADMIN', 'MANAGER', Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER].includes(actor.role);
      if (!isStaff) {
        const now = Date.now();
        const cutoffTime = (batch as any).registrationDeadline
          ? new Date((batch as any).registrationDeadline).getTime()
          : null;

        if (cutoffTime && now > cutoffTime) {
          throw new BadRequestException(
            'Registration for this cohort has closed as the registration deadline has passed. Please enroll in the next upcoming cohort or join the waitlist.',
          );
        }
      }

      // Check program-level uniqueness constraint
      const existingProgramEnrolment = await tx.enrolment.findUnique({
        where: {
          userId_programId: {
            userId: dto.userId,
            programId: dto.programId,
          },
        },
      });
      if (existingProgramEnrolment) {
        throw new BadRequestException('Learner is already enrolled in this program');
      }

      // Check batch-level uniqueness constraint
      const existingBatchEnrolment = await tx.enrolment.findUnique({
        where: {
          userId_batchId: {
            userId: dto.userId,
            batchId: dto.batchId,
          },
        },
      });
      if (existingBatchEnrolment) {
        throw new BadRequestException('Learner is already enrolled in this batch');
      }

      // Count currently occupied seats using Single-Count Reservation formula
      const occupiedSeats = await this.getBatchOccupiedSeats(dto.batchId, tx);

      const isFull = occupiedSeats >= batch.capacity;
      let initialStatus: EnrolmentStatus;

      if (isFull) {
        initialStatus = EnrolmentStatus.WAITLIST;
      } else if (
        dto.paymentMode === PaymentMode.OFFLINE ||
        dto.paymentMode === PaymentMode.COMPLIMENTARY
      ) {
        // Payment is immediately satisfied for offline/complimentary seats
        initialStatus = EnrolmentStatus.PENDING_AGREEMENT;
      } else {
        initialStatus = EnrolmentStatus.PENDING_PAYMENT;
      }

      const created = await tx.enrolment.create({
        data: {
          userId: dto.userId,
          programId: dto.programId,
          batchId: dto.batchId,
          status: initialStatus,
        },
        include: {
          program: { select: { id: true, title: true, slug: true } },
          batch: {
            select: {
              id: true,
              name: true,
              startDate: true,
              status: true,
              capacity: true,
            },
          },
          user: { select: { id: true, name: true, email: true, role: true } },
          signedAgreement: true,
          payments: true,
        },
      });

      // Record satisfied payment record if offline or complimentary
      if (
        dto.paymentMode === PaymentMode.OFFLINE ||
        dto.paymentMode === PaymentMode.COMPLIMENTARY
      ) {
        await tx.payment.create({
          data: {
            enrolmentId: created.id,
            stripeSessionId: `${dto.paymentMode.toLowerCase()}_${created.id}`,
            amount: 0,
            currency: 'USD',
            status: 'succeeded',
          },
        });
      }

      if (tx.auditLog?.create) {
        await tx.auditLog.create({
          data: {
            actorId: actor?.sub ?? actor?.id ?? null,
            action: 'ENROLMENT_CREATED',
            entity: 'Enrolment',
            entityId: created.id,
            meta: {
              userId: dto.userId,
              batchId: dto.batchId,
              programId: dto.programId,
              initialStatus,
              paymentMode: dto.paymentMode,
            },
          },
        });
      }

      return created;
    }, { maxWait: 15000, timeout: 30000 });

    await this.invalidateEnrolmentCaches(dto.userId);
    return enrolment;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. ENROLMENT STATE MACHINE TRANSITIONS
  // ─────────────────────────────────────────────────────────────────────────────

  async transitionStatus(id: string, dto: TransitionEnrolmentStatusDto, actor?: any) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const enrolment = await tx.enrolment.findUnique({
        where: { id },
        include: {
          batch: true,
          signedAgreement: true,
          payments: true,
        },
      });

      if (!enrolment) {
        throw new NotFoundException('Enrolment not found');
      }

      const current = enrolment.status;
      const target = dto.targetStatus;

      if (current === target) {
        return enrolment;
      }

      // Terminal state protection
      if (current === EnrolmentStatus.COMPLETED) {
        throw new BadRequestException('Enrolment is in terminal state COMPLETED and cannot transition');
      }
      if (current === EnrolmentStatus.REVOKED) {
        throw new BadRequestException('Enrolment is in terminal state REVOKED and cannot transition');
      }

      // Validate transitions against canonical state machine
      switch (current) {
        case EnrolmentStatus.PENDING_PAYMENT:
          if (target === EnrolmentStatus.PENDING_AGREEMENT) {
            // Valid: legacy flow where payment completed before agreement
            break;
          }
          if (target === EnrolmentStatus.ACTIVE) {
            // Agreement-First flow: payment completed after agreement signed
            if (
              !enrolment.signedAgreement ||
              enrolment.signedAgreement.status !== 'SIGNED'
            ) {
              throw new BadRequestException(
                'Cannot transition directly from PENDING_PAYMENT to ACTIVE: program agreement must be signed first',
              );
            }
            break;
          }
          if (target === EnrolmentStatus.REVOKED) {
            // Valid: cancelled/abandoned
            break;
          }
          throw new BadRequestException(
            `Invalid enrolment status transition from ${current} to ${target}`,
          );

        case EnrolmentStatus.PENDING_AGREEMENT:
          if (target === EnrolmentStatus.ACTIVE) {
            // Non-negotiable Agreement Gate
            if (
              !enrolment.signedAgreement ||
              enrolment.signedAgreement.status !== 'SIGNED'
            ) {
              throw new BadRequestException(
                'Enrolment cannot become ACTIVE until program agreement is signed',
              );
            }
            break;
          }
          if (target === EnrolmentStatus.REVOKED) {
            // Valid: refunded or cancelled before signing
            break;
          }
          throw new BadRequestException(
            `Invalid enrolment status transition from ${current} to ${target}`,
          );

        case EnrolmentStatus.ACTIVE:
          if (target === EnrolmentStatus.COMPLETED) {
            // Valid: finished all curriculum requirements
            break;
          }
          if (target === EnrolmentStatus.REVOKED) {
            // Valid: refunded, expelled, or cancelled
            break;
          }
          throw new BadRequestException(
            `Invalid enrolment status transition from ${current} to ${target}`,
          );

        case EnrolmentStatus.WAITLIST:
          if (
            target === EnrolmentStatus.PENDING_PAYMENT ||
            target === EnrolmentStatus.PENDING_AGREEMENT
          ) {
            // Check capacity before moving out of waitlist
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${enrolment.batchId}))`;
            const occupiedSeats = await this.getBatchOccupiedSeats(enrolment.batchId, tx);
            if (occupiedSeats >= enrolment.batch.capacity) {
              throw new BadRequestException(
                'Cannot move learner from WAITLIST into active status: batch is at full capacity',
              );
            }
            break;
          }
          if (target === EnrolmentStatus.REVOKED) {
            // Valid: waitlist withdrawal
            break;
          }
          if (target === EnrolmentStatus.ACTIVE) {
            throw new BadRequestException(
              'Cannot transition directly from WAITLIST to ACTIVE: payment and agreement required',
            );
          }
          throw new BadRequestException(
            `Invalid enrolment status transition from ${current} to ${target}`,
          );

        default:
          throw new BadRequestException(
            `Invalid enrolment status transition from ${current} to ${target}`,
          );
      }

      const updatedEnrolment = await tx.enrolment.update({
        where: { id },
        data: { status: target },
        include: {
          program: { select: { id: true, title: true, slug: true } },
          batch: {
            select: {
              id: true,
              name: true,
              startDate: true,
              status: true,
              capacity: true,
            },
          },
          user: { select: { id: true, name: true, email: true, role: true } },
          signedAgreement: true,
          payments: true,
        },
      });

      if ((tx as any).auditLog?.create) {
        await (tx as any).auditLog.create({
          data: {
            actorId: actor?.sub ?? actor?.id ?? null,
            action: 'ENROLMENT_STATUS_TRANSITIONED',
            entity: 'Enrolment',
            entityId: id,
            meta: {
              userId: enrolment.userId,
              batchId: enrolment.batchId,
              previousStatus: current,
              newStatus: target,
              reason: dto.reason ?? null,
            },
          },
        });
      }

      return updatedEnrolment;
    });

    await this.invalidateEnrolmentCaches(updated.userId);
    return updated;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. WAITLIST PROMOTION (FIFO)
  // ─────────────────────────────────────────────────────────────────────────────

  async promoteNextWaitlisted(batchId: string) {
    const promoted = await this.prisma.$transaction(async (tx) => {
      // Lock batch
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${batchId}))`;

      const batch = await tx.batch.findUnique({
        where: { id: batchId },
        select: { id: true, name: true, capacity: true, status: true },
      });

      if (!batch) {
        throw new NotFoundException('Batch not found');
      }

      if (
        batch.status === BatchStatus.COMPLETED ||
        batch.status === BatchStatus.ARCHIVED
      ) {
        throw new BadRequestException(
          `Cannot promote waitlist for a ${batch.status} batch`,
        );
      }

      // Check current capacity using Single-Count Reservation formula
      const occupiedSeats = await this.getBatchOccupiedSeats(batchId, tx);

      if (occupiedSeats >= batch.capacity) {
        throw new BadRequestException(
          'Cannot promote from waitlist: batch is at full capacity',
        );
      }

      // Select oldest eligible waitlisted learner (deterministic FIFO)
      const candidate = await tx.enrolment.findFirst({
        where: {
          batchId,
          status: EnrolmentStatus.WAITLIST,
        },
        orderBy: { createdAt: 'asc' },
        include: {
          payments: true,
        },
      });

      if (!candidate) {
        throw new NotFoundException('No waitlisted learners found in this batch');
      }

      // Determine correct post-promotion state from existing payment status
      const hasSuccessfulPayment = candidate.payments.some(
        (p) =>
          p.status === 'succeeded' ||
          p.status === 'paid' ||
          p.status === 'COMPLETED',
      );

      const targetStatus = hasSuccessfulPayment
        ? EnrolmentStatus.PENDING_AGREEMENT
        : EnrolmentStatus.PENDING_PAYMENT;

      const updated = await tx.enrolment.update({
        where: { id: candidate.id },
        data: { status: targetStatus },
        include: {
          program: { select: { id: true, title: true, slug: true } },
          batch: {
            select: {
              id: true,
              name: true,
              startDate: true,
              status: true,
              capacity: true,
            },
          },
          user: { select: { id: true, name: true, email: true, role: true } },
          signedAgreement: true,
          payments: true,
        },
      });

      return {
        ...updated,
        promoted: true,
        previousStatus: EnrolmentStatus.WAITLIST,
        newStatus: targetStatus,
      };
    });

    await this.invalidateEnrolmentCaches(promoted.userId);
    return promoted;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. BATCH TRANSFER
  // ─────────────────────────────────────────────────────────────────────────────

  async transferBatch(id: string, dto: TransferBatchDto, actor?: any) {
    const transferred = await this.prisma.$transaction(async (tx) => {
      const enrolment = await tx.enrolment.findUnique({
        where: { id },
        include: { batch: true },
      });

      if (!enrolment) {
        throw new NotFoundException('Enrolment not found');
      }

      if (enrolment.status === EnrolmentStatus.REVOKED) {
        throw new BadRequestException('Cannot transfer a REVOKED enrolment');
      }

      if (enrolment.batchId === dto.destinationBatchId) {
        throw new BadRequestException('Learner is already in this batch');
      }

      const destinationBatch = await tx.batch.findUnique({
        where: { id: dto.destinationBatchId },
      });

      if (!destinationBatch) {
        throw new NotFoundException('Destination batch not found');
      }

      if (destinationBatch.programId !== enrolment.programId) {
        throw new BadRequestException(
          'Destination batch must belong to the same program',
        );
      }

      if (
        destinationBatch.status === BatchStatus.COMPLETED ||
        destinationBatch.status === BatchStatus.ARCHIVED
      ) {
        throw new BadRequestException(
          `Cannot transfer to a ${destinationBatch.status} batch`,
        );
      }

      // Check for duplicate seat constraint in destination batch
      const existingInDest = await tx.enrolment.findUnique({
        where: {
          userId_batchId: {
            userId: enrolment.userId,
            batchId: dto.destinationBatchId,
          },
        },
      });
      if (existingInDest) {
        throw new BadRequestException('Learner is already enrolled in destination batch');
      }

      // Lock destination batch
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${dto.destinationBatchId}))`;

      const occupiedInDest = await this.getBatchOccupiedSeats(dto.destinationBatchId, tx);

      const destIsFull = occupiedInDest >= destinationBatch.capacity;

      // If destination is full, learner moves to WAITLIST; otherwise preserves progress and active status
      const nextStatus = destIsFull
        ? EnrolmentStatus.WAITLIST
        : enrolment.status;

      const updated = await tx.enrolment.update({
        where: { id },
        data: {
          batchId: dto.destinationBatchId,
          status: nextStatus,
        },
        include: {
          program: { select: { id: true, title: true, slug: true } },
          batch: {
            select: {
              id: true,
              name: true,
              startDate: true,
              status: true,
              capacity: true,
            },
          },
          user: { select: { id: true, name: true, email: true, role: true } },
          signedAgreement: true,
          payments: true,
        },
      });

      if (tx.auditLog?.create) {
        await tx.auditLog.create({
          data: {
            actorId: actor?.sub ?? actor?.id ?? null,
            action: 'BATCH_TRANSFERRED',
            entity: 'Enrolment',
            entityId: id,
            meta: {
              userId: enrolment.userId,
              fromBatchId: enrolment.batchId,
              toBatchId: dto.destinationBatchId,
              previousStatus: enrolment.status,
              newStatus: nextStatus,
              reason: dto.reason ?? null,
            },
          },
        });
      }

      return {
        ...updated,
        transferred: true,
        fromBatchId: enrolment.batchId,
        toBatchId: dto.destinationBatchId,
      };
    });

    await this.invalidateEnrolmentCaches(transferred.userId);
    return transferred;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. CANCELLATION / REVOCATION
  // ─────────────────────────────────────────────────────────────────────────────

  async cancel(id: string, actor?: any) {
    const cancelled = await this.prisma.$transaction(async (tx) => {
      const enrolment = await tx.enrolment.findUnique({
        where: { id },
      });

      if (!enrolment) {
        throw new NotFoundException('Enrolment not found');
      }

      if (enrolment.status === EnrolmentStatus.REVOKED) {
        return { id, status: EnrolmentStatus.REVOKED, revoked: true };
      }

      if (enrolment.status === EnrolmentStatus.COMPLETED) {
        throw new BadRequestException('Cannot revoke a COMPLETED enrolment');
      }

      const updated = await tx.enrolment.update({
        where: { id },
        data: { status: EnrolmentStatus.REVOKED },
      });

      if (tx.auditLog?.create) {
        await tx.auditLog.create({
          data: {
            actorId: actor?.sub ?? actor?.id ?? null,
            action: 'ENROLMENT_CANCELLED',
            entity: 'Enrolment',
            entityId: id,
            meta: {
              userId: enrolment.userId,
              batchId: enrolment.batchId,
              previousStatus: enrolment.status,
              newStatus: EnrolmentStatus.REVOKED,
            },
          },
        });
      }

      return {
        id: updated.id,
        status: updated.status,
        revoked: true,
      };
    });

    await this.invalidateEnrolmentCaches();
    return cancelled;
  }

  /**
   * Reconciles expired PENDING_PAYMENT enrollments (older than 48 hours TTL).
   * Transitions abandoned checkouts to REVOKED to automatically free batch holds.
   */
  async reconcileExpiredPendingPayments(): Promise<number> {
    const ttlCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    try {
      if (typeof (this.prisma.enrolment as any)?.updateMany === 'function') {
        const result = await this.prisma.enrolment.updateMany({
          where: {
            status: EnrolmentStatus.PENDING_PAYMENT,
            createdAt: { lte: ttlCutoff },
          },
          data: {
            status: EnrolmentStatus.REVOKED,
          },
        });
        return result.count;
      }
      return 0;
    } catch {
      return 0;
    }
  }

  /**
   * Resends a personalized checkout link to an unpaid learner.
   */
  async resendPaymentLink(id: string, actor?: any) {
    const enrolment = await this.prisma.enrolment.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        program: { select: { id: true, title: true, price: true, currency: true } },
        batch: { select: { id: true, name: true, startDate: true } },
      },
    });

    if (!enrolment) {
      throw new NotFoundException('Enrolment not found');
    }

    if (enrolment.status !== EnrolmentStatus.PENDING_PAYMENT) {
      throw new BadRequestException(
        `Cannot resend payment link for enrolment with status "${enrolment.status}". Only PENDING_PAYMENT enrolments require payment.`,
      );
    }

    const { lmsUrl } = getAppUrls();
    const checkoutUrl = `${lmsUrl}/checkout?programId=${enrolment.programId}&enrolmentId=${enrolment.id}&batchId=${enrolment.batchId}`;
    const currency = (enrolment.program.currency || 'USD') as 'USD' | 'AED' | 'INR';
    const currencySymbol = currency === 'INR' ? '₹' : currency === 'AED' ? 'AED ' : '$';
    const formattedAmount = `${currencySymbol}${enrolment.program.price?.toLocaleString?.() ?? enrolment.program.price}`;

    if (this.emailService) {
      try {
        await this.emailService.sendEmail({
          to: enrolment.user.email,
          subject: `Complete Your Enrolment: ${enrolment.program.title} — WhatBoutMe`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; color: #1c1917; background-color: #faf7f2; border-radius: 16px;">
              <div style="text-align: center; margin-bottom: 24px;">
                <span style="display: inline-block; padding: 4px 14px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #b45309; background-color: rgba(217, 119, 6, 0.15); border-radius: 9999px;">
                  WhatBoutMe Enrolment
                </span>
                <h1 style="font-size: 24px; font-weight: 800; color: #1c1917; margin: 12px 0 6px;">Complete Your Enrolment</h1>
                <p style="font-size: 15px; color: #78716a; margin: 0;">Hi ${enrolment.user.name || 'Student'}, your seat is reserved in ${enrolment.batch?.name || 'Cohort'}.</p>
              </div>

              <div style="background: #ffffff; border: 1px solid #e7e0d6; border-radius: 12px; padding: 24px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <h2 style="font-size: 18px; font-weight: 700; color: #1c1917; margin: 0 0 8px;">${enrolment.program.title}</h2>
                <p style="font-size: 13px; color: #78716a; margin: 0 0 16px;">Cohort: ${enrolment.batch?.name || 'Upcoming Cohort'}</p>
                
                <div style="display: flex; justify-content: space-between; align-items: baseline; border-top: 1px solid #f5ede2; padding-top: 14px;">
                  <span style="font-size: 14px; font-weight: 600; color: #44403c;">Tuition Fee (${currency})</span>
                  <span style="font-size: 22px; font-weight: 800; color: #b45309;">${formattedAmount}</span>
                </div>
              </div>

              <div style="text-align: center; margin-bottom: 24px;">
                <a href="${checkoutUrl}" style="display: inline-block; background-color: #1c1917; color: #faf7f2; padding: 14px 32px; font-size: 15px; font-weight: 700; text-decoration: none; border-radius: 9999px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);">
                  Complete Payment & Join Cohort &rarr;
                </a>
              </div>

              <p style="font-size: 12px; line-height: 1.6; color: #78716a; text-align: center; margin: 0 0 8px;">
                Direct checkout link: <a href="${checkoutUrl}" style="color: #b45309; word-break: break-all;">${checkoutUrl}</a>
              </p>
            </div>
          `,
        });
      } catch (err: any) {
        console.warn(`[EnrollmentsService] Failed to send payment link email to ${enrolment.user.email}:`, err?.message);
      }
    }

    if (this.prisma.auditLog?.create) {
      try {
        await this.prisma.auditLog.create({
          data: {
            actorId: actor?.sub ?? actor?.id ?? null,
            action: 'PAYMENT_LINK_RESENT',
            entity: 'Enrolment',
            entityId: id,
            meta: {
              userId: enrolment.userId,
              batchId: enrolment.batchId,
              checkoutUrl,
            },
          },
        });
      } catch {
        // Soft fail audit log
      }
    }

    return {
      success: true,
      enrolmentId: id,
      userEmail: enrolment.user.email,
      checkoutUrl,
      message: `Payment link successfully sent to ${enrolment.user.email}`,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. ADMINISTRATIVE QUERIES & MANAGER SCOPING
  // ─────────────────────────────────────────────────────────────────────────────

  async findAll(user: any, query?: QueryEnrolmentsDto) {
    await this.reconcileExpiredPendingPayments();

    const isManager = user?.role === Role.MANAGER || user?.role === 'MANAGER' || user?.role === 'TEACHER';
    const userId = user?.sub ?? user?.id;

    const where: any = {};

    if (isManager) {
      // Find batches where user is assigned as manager or trainer
      const assignedBatches = await this.prisma.batch.findMany({
        where: {
          OR: [
            { managerId: userId },
            { trainers: { some: { trainerId: userId } } },
          ],
        },
        select: { id: true },
      });

      const assignedBatchIds = assignedBatches.map((b) => b.id);

      if (query?.batchId) {
        if (!assignedBatchIds.includes(query.batchId)) {
          throw new ForbiddenException(
            'Access denied: You are not assigned to this batch',
          );
        }
        where.batchId = query.batchId;
      } else {
        where.batchId = { in: assignedBatchIds };
      }
    } else if (query?.batchId) {
      where.batchId = query.batchId;
    }

    if (query?.programId) {
      where.programId = query.programId;
    }

    if (query?.userId) {
      where.userId = query.userId;
    }

    if (query?.status) {
      where.status = query.status;
    }

    const page = query?.page ?? 1;
    const limit = query?.limit ?? 50;
    const skip = (page - 1) * limit;

    const [total, enrolments] = await Promise.all([
      this.prisma.enrolment.count({ where }),
      this.prisma.enrolment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
          program: { select: { id: true, title: true, slug: true } },
          batch: {
            select: {
              id: true,
              name: true,
              startDate: true,
              status: true,
              capacity: true,
              managerId: true,
            },
          },
          signedAgreement: {
            select: { id: true, status: true, signedAt: true },
          },
          payments: {
            select: {
              id: true,
              amount: true,
              currency: true,
              status: true,
              createdAt: true,
            },
          },
          stepProgress: {
            where: { isCompleted: true },
            select: { stepId: true, isCompleted: true, completedAt: true },
          },
          examAttempts: {
            orderBy: { startedAt: 'desc' },
            take: 1,
            select: { id: true, score: true, passed: true, status: true, completedAt: true },
          },
          oneOnOneRequests: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              status: true,
              requestedStart: true,
              session: { select: { id: true, status: true, startTime: true, joinUrl: true } },
            },
          },
          missionStatements: {
            orderBy: { version: 'desc' },
            take: 1,
            select: { id: true, status: true, version: true, reviewedAt: true },
          },
          certificate: {
            select: { id: true, status: true, certificateCode: true, issuedAt: true },
          },
          _count: {
            select: {
              stepProgress: true,
              lessonProgress: true,
              attempts: true,
            },
          },
        },
      }),
    ]);

    return {
      data: enrolments,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, user: any) {
    const isManager = user?.role === Role.MANAGER || user?.role === 'MANAGER' || user?.role === 'TEACHER';
    const userId = user?.sub ?? user?.id;

    const enrolment = await this.prisma.enrolment.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        program: {
          select: {
            id: true,
            title: true,
            slug: true,
            price: true,
          },
        },
        batch: {
          include: {
            manager: {
              select: { id: true, name: true, email: true, role: true },
            },
            trainers: {
              select: {
                trainerId: true,
                trainer: {
                  select: { id: true, name: true, email: true, role: true },
                },
              },
            },
          },
        },
        signedAgreement: true,
        payments: true,
        stepProgress: true,
        _count: {
          select: {
            lessonProgress: true,
            attempts: true,
            examAttempts: true,
            oralAssessments: true,
            attendance: true,
          },
        },
      },
    });

    if (!enrolment) {
      throw new NotFoundException('Enrolment not found');
    }

    if (isManager) {
      const isAssigned =
        enrolment.batch.managerId === userId ||
        enrolment.batch.trainers.some((t: any) => t.trainerId === userId);

      if (!isAssigned) {
        throw new ForbiddenException(
          'Access denied: You are not assigned to the batch for this enrolment',
        );
      }
    }

    return enrolment;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. LEARNER SELF-SERVICE QUERIES
  // ─────────────────────────────────────────────────────────────────────────────

  async findForLearner(userId: string) {
    return this.prisma.enrolment.findMany({
      where: {
        userId,
        batch: { status: { not: 'ARCHIVED' } },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        program: {
          select: {
            id: true,
            title: true,
            slug: true,
            description: true,
            price: true,
            status: true,
          },
        },
        batch: {
          select: {
            id: true,
            name: true,
            startDate: true,
            endDate: true,
            status: true,
          },
        },
        signedAgreement: {
          select: {
            id: true,
            status: true,
            signedAt: true,
          },
        },
        payments: {
          select: {
            id: true,
            amount: true,
            currency: true,
            status: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            stepProgress: true,
            lessonProgress: true,
            attendance: true,
          },
        },
      },
    });
  }

  async findOneForLearner(id: string, userId: string) {
    const enrolment = await this.prisma.enrolment.findFirst({
      where: {
        id,
        userId,
        batch: { status: { not: 'ARCHIVED' } },
      },
      include: {
        program: {
          select: {
            id: true,
            title: true,
            slug: true,
            description: true,
            price: true,
            status: true,
          },
        },
        batch: {
          select: {
            id: true,
            name: true,
            startDate: true,
            endDate: true,
            status: true,
          },
        },
        signedAgreement: {
          select: {
            id: true,
            status: true,
            signedAt: true,
          },
        },
        payments: {
          select: {
            id: true,
            amount: true,
            currency: true,
            status: true,
            createdAt: true,
          },
        },
        stepProgress: true,
        _count: {
          select: {
            lessonProgress: true,
            attempts: true,
            examAttempts: true,
            attendance: true,
          },
        },
      },
    });

    if (!enrolment) {
      throw new NotFoundException('Enrolment not found');
    }

    return enrolment;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. BACKWARD-COMPATIBILITY HELPER
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Backward-compatible mock checkout helper for testing concurrency uniqueness.
   * @deprecated Use create() with explicit Batch ID.
   */
  async mockCheckout(userId: string, programId: string) {
    let batch = await this.prisma.batch.findFirst({
      where: {
        programId,
        status: { in: [BatchStatus.UPCOMING, BatchStatus.ACTIVE] },
      },
    });

    if (!batch) {
      batch = await this.prisma.batch.create({
        data: {
          name: 'Default Test Cohort',
          programId,
          capacity: 100,
          startDate: new Date(),
        },
      });
    }

    try {
      return await this.create({
        userId,
        programId,
        batchId: batch.id,
        paymentMode: PaymentMode.OFFLINE,
      });
    } catch (err: any) {
      // If already enrolled in program, return existing
      if (err instanceof BadRequestException && err.message.includes('already enrolled')) {
        return this.prisma.enrolment.findUnique({
          where: { userId_programId: { userId, programId } },
        });
      }
      throw err;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPER: CACHE INVALIDATION
  // ─────────────────────────────────────────────────────────────────────────────

  private async invalidateEnrolmentCaches(userId?: string) {
    await this.cacheHelper.invalidateNamespace('enrollments');
    await this.cacheHelper.invalidateNamespace('batches');
    if (userId) {
      await this.cacheHelper.invalidateNamespace(`auth_user:${userId}`);
    }
  }
}
