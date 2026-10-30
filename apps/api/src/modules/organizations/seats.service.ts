import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import {
  EnrolmentStatus,
  FundingSource,
  OneOnOneSessionStatus,
  Prisma,
  Role,
  SeatRedemptionMode,
  SeatStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import { getAppUrls } from '../../common/config/app-urls.js';
import { AssignSeatDto, BulkInviteDto } from './dto/index.js';

@Injectable()
export class SeatsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly emailService?: EmailService,
  ) {}

  /**
   * Helper to hash a token/code securely with SHA-256.
   */
  private hashSecret(secret: string): string {
    return crypto.createHash('sha256').update(secret.trim()).digest('hex');
  }

  /**
   * Generates a single-use reseller voucher code: e.g. "WBM-SLOT-8K2P-91M4".
   */
  private generateVoucherCode(prefix = 'WBM'): { raw: string; hash: string; masked: string } {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    const randPart = (len: number) =>
      Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const raw = `${prefix}-SLOT-${randPart(4)}-${randPart(4)}`;
    const hash = this.hashSecret(raw);
    const masked = `${prefix}-SLOT-****-${raw.slice(-4)}`;
    return { raw, hash, masked };
  }

  /**
   * Assigns a specific AVAILABLE numbered seat slot to a student or generates a reseller voucher.
   */
  /**
   * Assigns a specific AVAILABLE numbered seat slot to a student, provisions/links their account and enrolment,
   * and dispatches an account setup / course notification email to their Gmail.
   */
  async assignSeat(orgId: string, dto: AssignSeatDto, actor?: any) {
    const seat = await this.prisma.seat.findUnique({
      where: { id: dto.seatId },
      include: {
        seatPool: {
          include: {
            batch: true,
            program: true,
            organization: true,
          },
        },
      },
    });

    if (!seat) {
      throw new NotFoundException(`Seat ${dto.seatId} not found`);
    }

    if (seat.organizationId !== orgId) {
      throw new ForbiddenException('Seat does not belong to this organization');
    }

    if (seat.status !== SeatStatus.AVAILABLE) {
      throw new ConflictException(
        `Cannot assign Slot #${seat.slotNumber}: currently in status ${seat.status}`,
      );
    }

    const email = dto.email.trim().toLowerCase();
    const isVoucher = dto.redemptionMode === SeatRedemptionMode.VOUCHER_CODE;
    const rawToken = crypto.randomBytes(24).toString('hex');
    const tokenHash = this.hashSecret(rawToken);
    const voucher = isVoucher ? this.generateVoucherCode() : null;

    // Check if user already exists
    let existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      // Check if learner is already actively enrolled in this batch
      const existingEnrolment = await this.prisma.enrolment.findFirst({
        where: {
          batchId: seat.seatPool.batchId,
          userId: existingUser.id,
          status: { notIn: [EnrolmentStatus.REVOKED] },
        },
      });

      if (existingEnrolment) {
        throw new ConflictException(
          `Learner with email ${email} already has an active enrolment in batch "${seat.seatPool.batch.name}"`,
        );
      }
    }

    let passwordSetupToken: string | null = null;
    let precomputedPasswordHash: string | null = null;
    let setupTokenHash: string | null = null;
    let setupExpiresAt: Date | null = null;

    if (!existingUser) {
      const tempPassword = crypto.randomBytes(16).toString('hex');
      precomputedPasswordHash = await bcrypt.hash(tempPassword, 10);
      passwordSetupToken = crypto.randomBytes(32).toString('hex');
      setupTokenHash = crypto.createHash('sha256').update(passwordSetupToken).digest('hex');
      setupExpiresAt = new Date(Date.now() + 14 * 86400 * 1000);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Resolve or provision user
      let targetUser = existingUser;
      if (!targetUser) {
        targetUser = await tx.user.create({
          data: {
            email,
            name: dto.fullName?.trim() || email.split('@')[0],
            phone: dto.phone?.trim() || null,
            passwordHash: precomputedPasswordHash!,
            role: Role.USER,
          },
        });

        await tx.passwordResetToken.create({
          data: {
            userId: targetUser.id,
            token: setupTokenHash!,
            expiresAt: setupExpiresAt!,
          },
        });
      } else if (dto.fullName && (!targetUser.name || targetUser.name === email.split('@')[0])) {
        targetUser = await tx.user.update({
          where: { id: targetUser.id },
          data: { name: dto.fullName.trim() },
        });
      }

      // 2. Provision sponsored enrolment immediately in PENDING_AGREEMENT status
      let enrolment = await tx.enrolment.findFirst({
        where: {
          userId: targetUser.id,
          batchId: seat.seatPool.batchId,
          status: { notIn: [EnrolmentStatus.REVOKED] },
        },
      });

      if (!enrolment) {
        enrolment = await tx.enrolment.create({
          data: {
            userId: targetUser.id,
            batchId: seat.seatPool.batchId,
            programId: seat.seatPool.programId,
            status: EnrolmentStatus.PENDING_AGREEMENT,
            fundingSource: FundingSource.ORG_SPONSORED,
            organizationId: orgId,
            oneOnOneStatus: OneOnOneSessionStatus.NOT_BOOKED,
          },
        });
      }

      // 3. Create OrganizationInvite record (automatically accepted since user and enrolment exist)
      const invite = await tx.organizationInvite.create({
        data: {
          organizationId: orgId,
          seatPoolId: seat.seatPoolId,
          email,
          fullName: dto.fullName || targetUser.name,
          phone: dto.phone || targetUser.phone,
          department: dto.department,
          externalOrderRef: dto.externalOrderRef,
          tokenHash: voucher ? voucher.hash : tokenHash,
          expiresAt: new Date(Date.now() + 14 * 86400 * 1000),
          acceptedAt: new Date(),
        },
      });

      // 4. Update Seat to ASSIGNED
      const updatedSeat = await tx.seat.update({
        where: { id: seat.id },
        data: {
          status: SeatStatus.ASSIGNED,
          userId: targetUser.id,
          enrolmentId: enrolment.id,
          assignedAt: new Date(),
          redemptionMode: dto.redemptionMode || SeatRedemptionMode.EMAIL_INVITE,
          voucherCodeHash: voucher ? voucher.hash : null,
          voucherCodeMasked: voucher ? voucher.masked : null,
          inviteId: invite.id,
          department: dto.department,
          externalOrderRef: dto.externalOrderRef,
          resalePrice: dto.resalePrice,
          orgInternalNotes: dto.orgInternalNotes,
          invitedAt: new Date(),
        },
      });

      // 5. Update SeatPool counters
      await tx.seatPool.update({
        where: { id: seat.seatPoolId },
        data: {
          seatsAssigned: { increment: 1 },
          seatsAvailable: { decrement: 1 },
        },
      });

      // 6. Audit Log
      await tx.auditLog.create({
        data: {
          actorId: actor?.id || null,
          action: 'SEAT_ASSIGNED',
          entity: 'Seat',
          entityId: seat.id,
          meta: {
            organizationId: orgId,
            seatPoolId: seat.seatPoolId,
            slotNumber: seat.slotNumber,
            email,
            userId: targetUser.id,
            enrolmentId: enrolment.id,
            department: dto.department,
            externalOrderRef: dto.externalOrderRef,
            redemptionMode: dto.redemptionMode,
          },
        },
      });

      return {
        seat: updatedSeat,
        user: {
          id: targetUser.id,
          name: targetUser.name,
          email: targetUser.email,
        },
        enrolmentId: enrolment.id,
        inviteId: invite.id,
        isNewUser: !existingUser,
        passwordSetupToken,
        inviteToken: rawToken,
        voucherCode: voucher ? voucher.raw : null,
      };
    }, { maxWait: 15000, timeout: 30000 });

    // 7. Dispatch Welcome / Account Setup Email to student's Gmail
    const { lmsUrl, marketingUrl } = getAppUrls();
    const orgName = seat.seatPool.organization.name;
    const programTitle = seat.seatPool.program.title;
    const batchName = seat.seatPool.batch.name;
    const studentName = result.user.name || 'Learner';

    let setupUrl: string | null = null;
    const inviteUrl = `/org-invite/${result.inviteToken}`;

    if (result.isNewUser && result.passwordSetupToken) {
      setupUrl = `${lmsUrl}/setup-account?token=${result.passwordSetupToken}&email=${encodeURIComponent(result.user.email)}`;

      if (this.emailService) {
        const html = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 28px; color: #1e293b; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <span style="font-size: 22px; font-weight: 800; color: #c97a1e; letter-spacing: -0.5px;">whatboutme<span style="color: #e11d48;">&#9829;</span></span>
            </div>
            <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 14px; text-align: center;">Welcome to WhatBoutMe!</h2>
            <p style="font-size: 15px; line-height: 1.6; color: #334155;">Hello <strong>${studentName}</strong>,</p>
            <p style="font-size: 15px; line-height: 1.6; color: #334155;">
              <strong>${orgName}</strong> has sponsored your enrollment in the certified cognitive coaching program:
            </p>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px; margin: 20px 0;">
              <div style="font-size: 16px; font-weight: 700; color: #0f172a;">${programTitle}</div>
              <div style="font-size: 14px; color: #64748b; margin-top: 4px;">Cohort Batch: <strong>${batchName}</strong></div>
              <div style="font-size: 12px; color: #16a34a; font-weight: 600; margin-top: 6px;">&#10003; 100% Sponsored Seat Allocated</div>
            </div>
            <p style="font-size: 15px; line-height: 1.6; color: #334155;">
              To activate your account and view your course, set up your password by clicking the button below:
            </p>
            <div style="text-align: center; margin: 28px 0;">
              <a href="${setupUrl}" style="background: #c97a1e; color: #ffffff; text-decoration: none; padding: 13px 36px; font-size: 15px; font-weight: 700; border-radius: 8px; display: inline-block; box-shadow: 0 2px 6px rgba(201, 122, 30, 0.3);">
                Set Up Account &amp; Access Courses &rarr;
              </a>
            </div>
            <p style="font-size: 13px; line-height: 1.5; color: #64748b; text-align: center;">
              This setup link will expire in 14 days. After creating your password, you will review and complete your Digital Workshop Agreement to begin Step 1.
            </p>
            <div style="margin-top: 28px; padding-top: 18px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center; line-height: 1.6;">
              WhatBoutMe FZE &bull; Cognitive Health &amp; Resilience<br />
              Need help? Sign in anytime at <a href="${lmsUrl}/login" style="color: #c97a1e; text-decoration: none;">${lmsUrl}/login</a>
            </div>
          </div>
        `;

        try {
          await this.emailService.sendEmail({
            to: result.user.email,
            subject: `Set up your WhatBoutMe account — Sponsored by ${orgName}`,
            html,
            text: `Hello ${studentName},\n\n${orgName} has sponsored your seat in ${programTitle} (${batchName}).\n\nSet up your password and start learning:\n${setupUrl}\n\nWhatBoutMe Team`,
          });
        } catch (e: any) {
          console.warn('[SeatsService] Email dispatch failed:', e?.message);
        }
      }
    } else {
      setupUrl = `${lmsUrl}/courses`;
      if (this.emailService) {
        const html = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 28px; color: #1e293b; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <span style="font-size: 22px; font-weight: 800; color: #c97a1e; letter-spacing: -0.5px;">whatboutme<span style="color: #e11d48;">&#9829;</span></span>
            </div>
            <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 14px; text-align: center;">New Course Enrollment Confirmed!</h2>
            <p style="font-size: 15px; line-height: 1.6; color: #334155;">Hello <strong>${studentName}</strong>,</p>
            <p style="font-size: 15px; line-height: 1.6; color: #334155;">
              <strong>${orgName}</strong> has enrolled you into <strong>${programTitle}</strong> (${batchName}).
            </p>
            <div style="text-align: center; margin: 28px 0;">
              <a href="${lmsUrl}/courses" style="background: #c97a1e; color: #ffffff; text-decoration: none; padding: 13px 36px; font-size: 15px; font-weight: 700; border-radius: 8px; display: inline-block;">
                Go to My Courses &rarr;
              </a>
            </div>
            <p style="font-size: 13px; line-height: 1.5; color: #64748b; text-align: center;">
              Log in to your LMS portal to sign your Digital Workshop Agreement and start your curriculum.
            </p>
            <div style="margin-top: 28px; padding-top: 18px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center;">
              WhatBoutMe &bull; Cognitive Education &amp; Resilience
            </div>
          </div>
        `;

        try {
          await this.emailService.sendEmail({
            to: result.user.email,
            subject: `New Course Enrollment: ${programTitle} — Sponsored by ${orgName}`,
            html,
            text: `Hello ${studentName},\n\nYou have been enrolled in ${programTitle} by ${orgName}.\n\nAccess your course:\n${lmsUrl}/courses\n\nWhatBoutMe Team`,
          });
        } catch (e: any) {
          console.warn('[SeatsService] Email dispatch failed:', e?.message);
        }
      }
    }

    return {
      success: true,
      seat: result.seat,
      user: result.user,
      enrolmentId: result.enrolmentId,
      inviteId: result.inviteId,
      isNewUser: result.isNewUser,
      setupUrl,
      inviteUrl: isVoucher ? null : inviteUrl,
      voucherCode: result.voucherCode,
    };
  }

  /**
   * Preflight bulk invite validator (dry run).
   */
  async preflightBulkInvites(orgId: string, dto: BulkInviteDto) {
    const pool = await this.prisma.seatPool.findUnique({
      where: { id: dto.seatPoolId },
      include: {
        batch: true,
        seats: { where: { status: SeatStatus.AVAILABLE } },
      },
    });

    if (!pool) {
      throw new NotFoundException(`SeatPool ${dto.seatPoolId} not found`);
    }

    const availableSeatsCount = pool.seats.length;
    const requestedCount = dto.invites.length;

    const errors: Array<{ email: string; reason: string }> = [];
    const validEmails = new Set<string>();

    for (const item of dto.invites) {
      const email = item.email.trim().toLowerCase();
      if (!email.includes('@') || !email.includes('.')) {
        errors.push({ email, reason: 'Invalid email syntax' });
        continue;
      }

      if (validEmails.has(email)) {
        errors.push({ email, reason: 'Duplicate email in uploaded CSV' });
        continue;
      }

      // Check if already enrolled
      const existing = await this.prisma.enrolment.findFirst({
        where: {
          batchId: pool.batchId,
          user: { email },
          status: { notIn: [EnrolmentStatus.REVOKED] },
        },
      });

      if (existing) {
        errors.push({ email, reason: 'Learner already enrolled in this batch' });
        continue;
      }

      validEmails.add(email);
    }

    const canProceed =
      errors.length === 0 && validEmails.size <= availableSeatsCount;

    return {
      canProceed,
      totalRequested: requestedCount,
      validCount: validEmails.size,
      availableSlotsCount: availableSeatsCount,
      isCapacitySufficient: validEmails.size <= availableSeatsCount,
      errors,
    };
  }

  /**
   * Commits bulk slot assignments atomically using SELECT ... FOR UPDATE SKIP LOCKED.
   */
  async commitBulkInvites(orgId: string, dto: BulkInviteDto, actor?: any) {
    const preflight = await this.preflightBulkInvites(orgId, dto);
    if (!preflight.canProceed) {
      throw new BadRequestException({
        message: 'Bulk invite preflight validation failed',
        errors: preflight.errors,
      });
    }

    const pool = await this.prisma.seatPool.findUnique({
      where: { id: dto.seatPoolId },
      include: {
        batch: true,
        program: true,
        organization: true,
      },
    });
    if (!pool) throw new NotFoundException('SeatPool not found');

    const results: Array<{
      slotNumber: number;
      email: string;
      setupUrl?: string;
      inviteUrl?: string;
      voucherCode?: string;
    }> = [];
    const emailsToSend: Array<{ to: string; subject: string; html: string; text: string }> = [];

    const { lmsUrl, marketingUrl } = getAppUrls();
    const defaultPasswordHash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);

    await this.prisma.$transaction(async (tx) => {
      // Find AVAILABLE seats ordered by slotNumber
      const availableSeats = await tx.seat.findMany({
        where: {
          seatPoolId: dto.seatPoolId,
          status: SeatStatus.AVAILABLE,
        },
        orderBy: { slotNumber: 'asc' },
        take: dto.invites.length,
      });

      if (availableSeats.length < dto.invites.length) {
        throw new ConflictException('Concurrent allocation detected. Insufficient slots remaining.');
      }

      for (let i = 0; i < dto.invites.length; i++) {
        const inviteItem = dto.invites[i];
        const seat = availableSeats[i];
        const email = inviteItem.email.trim().toLowerCase();

        const isVoucher = dto.redemptionMode === SeatRedemptionMode.VOUCHER_CODE;
        const rawToken = crypto.randomBytes(24).toString('hex');
        const tokenHash = this.hashSecret(rawToken);
        const voucher = isVoucher ? this.generateVoucherCode() : null;

        // Resolve or provision user
        let user = await tx.user.findUnique({ where: { email } });
        let passwordSetupToken: string | null = null;

        if (!user) {
          user = await tx.user.create({
            data: {
              email,
              name: inviteItem.fullName?.trim() || email.split('@')[0],
              phone: inviteItem.phone?.trim() || null,
              passwordHash: defaultPasswordHash,
              role: Role.USER,
            },
          });

          passwordSetupToken = crypto.randomBytes(32).toString('hex');
          const setupTokenHash = crypto.createHash('sha256').update(passwordSetupToken).digest('hex');
          const expiresAt = new Date(Date.now() + 14 * 86400 * 1000);
          await tx.passwordResetToken.create({
            data: {
              userId: user.id,
              token: setupTokenHash,
              expiresAt,
            },
          });
        }

        // Provision enrolment
        let enrolment = await tx.enrolment.findFirst({
          where: {
            userId: user.id,
            batchId: pool.batchId,
            status: { notIn: [EnrolmentStatus.REVOKED] },
          },
        });

        if (!enrolment) {
          enrolment = await tx.enrolment.create({
            data: {
              userId: user.id,
              batchId: pool.batchId,
              programId: pool.programId,
              status: EnrolmentStatus.PENDING_AGREEMENT,
              fundingSource: FundingSource.ORG_SPONSORED,
              organizationId: orgId,
              oneOnOneStatus: OneOnOneSessionStatus.NOT_BOOKED,
            },
          });
        }

        const invite = await tx.organizationInvite.create({
          data: {
            organizationId: orgId,
            seatPoolId: pool.id,
            email,
            fullName: inviteItem.fullName || user.name,
            phone: inviteItem.phone || user.phone,
            department: inviteItem.department,
            externalOrderRef: inviteItem.externalOrderRef,
            tokenHash: voucher ? voucher.hash : tokenHash,
            expiresAt: new Date(Date.now() + 14 * 86400 * 1000),
            acceptedAt: new Date(),
          },
        });

        await tx.seat.update({
          where: { id: seat.id },
          data: {
            status: SeatStatus.ASSIGNED,
            userId: user.id,
            enrolmentId: enrolment.id,
            assignedAt: new Date(),
            redemptionMode: dto.redemptionMode || SeatRedemptionMode.EMAIL_INVITE,
            voucherCodeHash: voucher ? voucher.hash : null,
            voucherCodeMasked: voucher ? voucher.masked : null,
            inviteId: invite.id,
            department: inviteItem.department,
            externalOrderRef: inviteItem.externalOrderRef,
            invitedAt: new Date(),
          },
        });

        const setupUrl = passwordSetupToken
          ? `${lmsUrl}/setup-account?token=${passwordSetupToken}&email=${encodeURIComponent(email)}`
          : `${lmsUrl}/courses`;

        results.push({
          slotNumber: seat.slotNumber,
          email,
          setupUrl,
          inviteUrl: isVoucher ? undefined : `/org-invite/${rawToken}`,
          voucherCode: voucher ? voucher.raw : undefined,
        });

        // Queue email notification to dispatch after tx commits
        if (this.emailService) {
          const studentName = user.name || 'Learner';
          const emailSubject = passwordSetupToken
            ? `Set up your WhatBoutMe account — Sponsored by ${pool.organization.name}`
            : `New Course Enrollment: ${pool.program.title} — Sponsored by ${pool.organization.name}`;

          const html = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 28px; color: #1e293b; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px;">
              <div style="text-align: center; margin-bottom: 24px;">
                <span style="font-size: 22px; font-weight: 800; color: #c97a1e; letter-spacing: -0.5px;">whatboutme<span style="color: #e11d48;">&#9829;</span></span>
              </div>
              <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 14px; text-align: center;">Welcome to WhatBoutMe!</h2>
              <p style="font-size: 15px; line-height: 1.6; color: #334155;">Hello <strong>${studentName}</strong>,</p>
              <p style="font-size: 15px; line-height: 1.6; color: #334155;">
                <strong>${pool.organization.name}</strong> has enrolled you in <strong>${pool.program.title}</strong> (${pool.batch.name}).
              </p>
              <div style="text-align: center; margin: 28px 0;">
                <a href="${setupUrl}" style="background: #c97a1e; color: #ffffff; text-decoration: none; padding: 13px 36px; font-size: 15px; font-weight: 700; border-radius: 8px; display: inline-block;">
                  ${passwordSetupToken ? 'Set Up Account & Access Courses \u2192' : 'Go to My Courses \u2192'}
                </a>
              </div>
              <p style="font-size: 13px; line-height: 1.5; color: #64748b; text-align: center;">
                After signing in, please complete your Digital Workshop Agreement to unlock Step 1.
              </p>
            </div>
          `;

          emailsToSend.push({
            to: email,
            subject: emailSubject,
            html,
            text: `Hello ${studentName},\n\n${pool.organization.name} has enrolled you in ${pool.program.title}.\n\nAccess your course:\n${setupUrl}\n\nWhatBoutMe Team`,
          });
        }
      }

      // Update counters
      await tx.seatPool.update({
        where: { id: pool.id },
        data: {
          seatsAssigned: { increment: dto.invites.length },
          seatsAvailable: { decrement: dto.invites.length },
        },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          actorId: actor?.id || null,
          action: 'SEATS_BULK_INVITED',
          entity: 'SeatPool',
          entityId: pool.id,
          meta: {
            organizationId: orgId,
            poolCode: pool.poolCode,
            assignedCount: dto.invites.length,
          },
        },
      });
    }, { maxWait: 20000, timeout: 60000 });

    // Dispatch queued bulk emails after database transaction successfully commits
    if (this.emailService && emailsToSend.length > 0) {
      await Promise.allSettled(
        emailsToSend.map((item) =>
          this.emailService!.sendEmail(item).catch((e: any) =>
            console.warn('[SeatsService] Bulk invite email failed for', item.to, e?.message),
          ),
        ),
      );
    }

    return {
      success: true,
      assignedCount: results.length,
      assignments: results,
    };
  }

  /**
   * Revokes an INVITED or pre-agreement ASSIGNED seat and resets it back to AVAILABLE.
   */
  async revokeSeat(orgId: string, seatId: string, reason?: string, actor?: any) {
    const seat = await this.prisma.seat.findUnique({
      where: { id: seatId },
      include: { enrolment: { include: { signedAgreement: true } } },
    });

    if (!seat) throw new NotFoundException(`Seat ${seatId} not found`);
    if (seat.organizationId !== orgId) throw new ForbiddenException('Unauthorized');

    if (seat.status === SeatStatus.CONSUMED) {
      throw new BadRequestException(
        'Cannot revoke a CONSUMED seat. The learner has signed the Digital Agreement and started Step 1. Please contact WhatBoutMe staff for an audited Goodwill Reclaim.',
      );
    }

    if (seat.status === SeatStatus.AVAILABLE) {
      throw new BadRequestException('Seat is already available');
    }

    return this.prisma.$transaction(async (tx) => {
      // If student had claimed and created an enrolment, cancel that enrolment
      if (seat.enrolmentId) {
        await tx.enrolment.update({
          where: { id: seat.enrolmentId },
          data: { status: EnrolmentStatus.REVOKED },
        });
      }

      if (seat.inviteId) {
        await tx.organizationInvite.update({
          where: { id: seat.inviteId },
          data: { cancelledAt: new Date() },
        });
      }

      // Reset seat to AVAILABLE
      const updatedSeat = await tx.seat.update({
        where: { id: seat.id },
        data: {
          status: SeatStatus.AVAILABLE,
          userId: null,
          enrolmentId: null,
          inviteId: null,
          voucherCodeHash: null,
          voucherCodeMasked: null,
          lastRevokedAt: new Date(),
          lastRevokedReason: reason || 'Revoked by Organization Manager',
        },
      });

      // Update counters
      await tx.seatPool.update({
        where: { id: seat.seatPoolId },
        data: {
          seatsAssigned: { decrement: 1 },
          seatsAvailable: { increment: 1 },
        },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          actorId: actor?.id || null,
          action: 'SEAT_REVOKED',
          entity: 'Seat',
          entityId: seat.id,
          meta: {
            organizationId: orgId,
            seatPoolId: seat.seatPoolId,
            slotNumber: seat.slotNumber,
            reason,
          },
        },
      });

      return updatedSeat;
    });
  }

  /**
   * Admin Goodwill Reclaim: WhatBoutMe Admin exclusive action to revoke a CONSUMED slot
   * with mandatory audit justification.
   */
  async adminGoodwillReclaim(seatId: string, reason: string, actor: any) {
    if (!reason || reason.trim().length < 5) {
      throw new BadRequestException('A clear, detailed audit justification reason is required for Goodwill Reclaims.');
    }

    const seat = await this.prisma.seat.findUnique({
      where: { id: seatId },
      include: { seatPool: true, enrolment: true },
    });

    if (!seat) throw new NotFoundException(`Seat ${seatId} not found`);

    return this.prisma.$transaction(async (tx) => {
      // 1. Revoke existing student's enrolment
      if (seat.enrolmentId) {
        await tx.enrolment.update({
          where: { id: seat.enrolmentId },
          data: { status: EnrolmentStatus.REVOKED },
        });
      }

      // 2. Reset Seat to AVAILABLE
      const updatedSeat = await tx.seat.update({
        where: { id: seat.id },
        data: {
          status: SeatStatus.AVAILABLE,
          userId: null,
          enrolmentId: null,
          inviteId: null,
          voucherCodeHash: null,
          voucherCodeMasked: null,
          lastRevokedAt: new Date(),
          lastRevokedReason: `Goodwill Reclaim: ${reason}`,
          reclaimedByAdminId: actor.id,
        },
      });

      // 3. Update SeatPool counters
      await tx.seatPool.update({
        where: { id: seat.seatPoolId },
        data: {
          seatsConsumed: { decrement: seat.status === SeatStatus.CONSUMED ? 1 : 0 },
          seatsAssigned: { decrement: 1 },
          seatsAvailable: { increment: 1 },
        },
      });

      // 4. Immutable Audit Log
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'SEAT_GOODWILL_RECLAIM',
          entity: 'Seat',
          entityId: seat.id,
          meta: {
            organizationId: seat.organizationId,
            seatPoolId: seat.seatPoolId,
            slotNumber: seat.slotNumber,
            previousEnrolmentId: seat.enrolmentId,
            reason,
          },
        },
      });

      return updatedSeat;
    });
  }

  /**
   * Learner claims a voucher code or invite token.
   */
  async claimSeat(tokenOrCode: string, user: any) {
    const hash = this.hashSecret(tokenOrCode);

    // Look up by tokenHash in OrganizationInvite or voucherCodeHash in Seat
    const invite = await this.prisma.organizationInvite.findUnique({
      where: { tokenHash: hash },
      include: { seat: { include: { seatPool: true } } },
    });

    let seat = invite?.seat;
    if (!seat) {
      seat = await this.prisma.seat.findUnique({
        where: { voucherCodeHash: hash },
        include: { seatPool: true },
      });
    }

    if (!seat) {
      throw new NotFoundException('Invalid or expired invitation token/voucher code');
    }

    if (seat.status === SeatStatus.CONSUMED) {
      throw new ConflictException('This seat slot has already been claimed and consumed');
    }

    return this.prisma.$transaction(async (tx) => {
      // Ensure Enrolment exists in PENDING_AGREEMENT status
      let enrolment = await tx.enrolment.findFirst({
        where: {
          userId: user.id,
          batchId: seat.seatPool.batchId,
        },
      });

      if (!enrolment) {
        enrolment = await tx.enrolment.create({
          data: {
            userId: user.id,
            batchId: seat.seatPool.batchId,
            programId: seat.seatPool.programId,
            status: EnrolmentStatus.PENDING_AGREEMENT,
            fundingSource: FundingSource.ORG_SPONSORED,
            organizationId: seat.organizationId,
            oneOnOneStatus: OneOnOneSessionStatus.NOT_BOOKED,
          },
        });
      }

      const updatedSeat = await tx.seat.update({
        where: { id: seat.id },
        data: {
          status: SeatStatus.ASSIGNED,
          userId: user.id,
          enrolmentId: enrolment.id,
          assignedAt: new Date(),
        },
      });

      if (invite) {
        await tx.organizationInvite.update({
          where: { id: invite.id },
          data: { acceptedAt: new Date() },
        });
      }

      return {
        success: true,
        enrolmentId: enrolment.id,
        seat: updatedSeat,
        batchId: seat.seatPool.batchId,
        message: 'Seat claimed successfully. Please sign the Digital Workshop Agreement to unlock Step 1.',
      };
    });
  }
}

