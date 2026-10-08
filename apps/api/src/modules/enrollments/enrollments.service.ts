import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BatchStatus, EnrolmentStatus, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CacheHelperService } from '../../common/cache/cache-helper.service.js';
import {
  CreateEnrolmentDto,
  PaymentMode,
  QueryEnrolmentsDto,
  TransferBatchDto,
  TransitionEnrolmentStatusDto,
} from './dto/index.js';

/**
 * Capacity-occupying enrolment states.
 * Learners in these states hold an allocated seat in the batch.
 */
export const CAPACITY_OCCUPYING_STATUSES: readonly EnrolmentStatus[] = [
  EnrolmentStatus.PENDING_PAYMENT,
  EnrolmentStatus.PENDING_AGREEMENT,
  EnrolmentStatus.ACTIVE,
] as const;

/**
 * Non-capacity-occupying enrolment states.
 * Learners in these states do not consume a seat.
 */
export const NON_OCCUPYING_STATUSES: readonly EnrolmentStatus[] = [
  EnrolmentStatus.WAITLIST,
  EnrolmentStatus.COMPLETED,
  EnrolmentStatus.REVOKED,
] as const;

@Injectable()
export class EnrollmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. ENROLMENT CREATION (ADMIN / SYSTEM)
  // ─────────────────────────────────────────────────────────────────────────────

  async create(dto: CreateEnrolmentDto) {
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
      // Pessimistic advisory lock per batch ID to serialize concurrent seat allocations
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${dto.batchId}))`;

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

      // Count currently occupied seats in the locked batch
      const occupiedSeats = await tx.enrolment.count({
        where: {
          batchId: dto.batchId,
          status: { in: [...CAPACITY_OCCUPYING_STATUSES] },
        },
      });

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

      return created;
    });

    await this.invalidateEnrolmentCaches(dto.userId);
    return enrolment;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. ENROLMENT STATE MACHINE TRANSITIONS
  // ─────────────────────────────────────────────────────────────────────────────

  async transitionStatus(id: string, dto: TransitionEnrolmentStatusDto) {
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
            // Valid: payment completed/verified
            break;
          }
          if (target === EnrolmentStatus.REVOKED) {
            // Valid: cancelled/abandoned
            break;
          }
          if (target === EnrolmentStatus.ACTIVE) {
            throw new BadRequestException(
              'Cannot transition directly from PENDING_PAYMENT to ACTIVE: agreement must be signed first',
            );
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
            const occupiedSeats = await tx.enrolment.count({
              where: {
                batchId: enrolment.batchId,
                status: { in: [...CAPACITY_OCCUPYING_STATUSES] },
              },
            });
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

      return tx.enrolment.update({
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

      // Check current capacity
      const occupiedSeats = await tx.enrolment.count({
        where: {
          batchId,
          status: { in: [...CAPACITY_OCCUPYING_STATUSES] },
        },
      });

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

  async transferBatch(id: string, dto: TransferBatchDto) {
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

      const occupiedInDest = await tx.enrolment.count({
        where: {
          batchId: dto.destinationBatchId,
          status: { in: [...CAPACITY_OCCUPYING_STATUSES] },
        },
      });

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

  async cancel(id: string) {
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

      return {
        id: updated.id,
        status: updated.status,
        revoked: true,
      };
    });

    await this.invalidateEnrolmentCaches();
    return cancelled;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. ADMINISTRATIVE QUERIES & MANAGER SCOPING
  // ─────────────────────────────────────────────────────────────────────────────

  async findAll(user: any, query?: QueryEnrolmentsDto) {
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
            priceINR: true,
            priceUSD: true,
            priceAED: true,
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
      where: { userId },
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
      where: { id, userId },
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
