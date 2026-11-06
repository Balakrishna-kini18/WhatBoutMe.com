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
import { renderEmailTemplate } from '../email/template-renderer.js';
import { getAppUrls } from '../../common/config/app-urls.js';
import { AssignSeatDto, BulkInviteDto, ReassignSeatDto } from './dto/index.js';

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
  async assignSeat(orgId: string, dto: AssignSeatDto, actor?: any, req?: any) {
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

    // Duplicate check 1: Has this email already been assigned to another slot in this batch/seat pool?
    const duplicateSeat = await this.prisma.seat.findFirst({
      where: {
        id: { not: seat.id },
        status: { in: [SeatStatus.ASSIGNED, SeatStatus.INVITED, SeatStatus.CONSUMED] },
        seatPool: {
          batchId: seat.seatPool.batchId,
        },
        OR: [
          { user: { email: { equals: email, mode: 'insensitive' } } },
          { invite: { email: { equals: email, mode: 'insensitive' } } },
        ],
      },
      include: { seatPool: { include: { batch: true } } },
    });

    if (duplicateSeat) {
      throw new ConflictException(
        `Student with email "${email}" is already assigned to Slot #${duplicateSeat.slotNumber} (${duplicateSeat.slotLabel}) in batch "${duplicateSeat.seatPool.batch.name}". A student cannot be enrolled twice in the same batch.`,
      );
    }

    // Duplicate check 2: Check if learner already has an active enrolment in this batch
    const existingEnrolment = await this.prisma.enrolment.findFirst({
      where: {
        batchId: seat.seatPool.batchId,
        user: { email: { equals: email, mode: 'insensitive' } },
        status: { notIn: [EnrolmentStatus.REVOKED] },
      },
      include: { batch: true },
    });

    if (existingEnrolment) {
      throw new ConflictException(
        `Student with email "${email}" already has an active enrolment in batch "${existingEnrolment.batch.name}". A student cannot be enrolled twice in the same batch.`,
      );
    }

    // Check if user already exists
    let existingUser = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });

    // Generate a 14-day password setup/reset token for both new and existing users
    // This allows new users to set their password, and existing users to easily reset if forgotten
    const passwordSetupToken = crypto.randomBytes(32).toString('hex');
    const setupTokenHash = crypto.createHash('sha256').update(passwordSetupToken).digest('hex');
    const setupExpiresAt = new Date(Date.now() + 14 * 86400 * 1000);

    let precomputedPasswordHash: string | null = null;
    if (!existingUser) {
      const tempPassword = crypto.randomBytes(16).toString('hex');
      precomputedPasswordHash = await bcrypt.hash(tempPassword, 10);
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
      } else if (dto.fullName && (!targetUser.name || targetUser.name === email.split('@')[0])) {
        targetUser = await tx.user.update({
          where: { id: targetUser.id },
          data: { name: dto.fullName.trim() },
        });
      }

      // Record setup / reset token in DB for the target user
      await tx.passwordResetToken.create({
        data: {
          userId: targetUser.id,
          token: setupTokenHash,
          expiresAt: setupExpiresAt,
        },
      });

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
    const { lmsUrl, marketingUrl } = getAppUrls(req);
    const orgName = seat.seatPool.organization.name;
    const programTitle = seat.seatPool.program.title;
    const batchName = seat.seatPool.batch.name;
    const studentName = result.user.name || 'Learner';

    const loginUrl = `${lmsUrl}/login?email=${encodeURIComponent(result.user.email)}&redirect=/dashboard`;
    const passwordResetUrl = `${lmsUrl}/setup-account?token=${result.passwordSetupToken}&email=${encodeURIComponent(result.user.email)}`;

    const setupUrl = result.isNewUser ? passwordResetUrl : loginUrl;
    const inviteUrl = `/org-invite/${result.inviteToken}`;

    if (result.isNewUser && result.passwordSetupToken) {
      if (this.emailService) {
        try {
          await this.emailService.sendTemplateEmail({
            to: result.user.email,
            subject: `Set up your WhatBoutMe account — Sponsored by ${orgName}`,
            template: 'CorporateSeatInviteEmail',
            props: {
              learnerName: studentName,
              orgName,
              courseTitle: programTitle,
              programTitle,
              batchName,
              isNewUser: true,
              setupUrl: passwordResetUrl,
            },
          });
        } catch (e: any) {
          console.warn('[SeatsService] Email dispatch failed:', e?.message);
        }
      }
    } else {
      if (this.emailService) {
        try {
          await this.emailService.sendTemplateEmail({
            to: result.user.email,
            subject: `New Course Enrollment: ${programTitle} — Sponsored by ${orgName}`,
            template: 'CorporateSeatInviteEmail',
            props: {
              learnerName: studentName,
              orgName,
              courseTitle: programTitle,
              programTitle,
              batchName,
              isNewUser: false,
              setupUrl: loginUrl,
              dashboardUrl: `${lmsUrl}/dashboard`,
            },
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
      loginUrl,
      passwordResetUrl,
      inviteUrl: isVoucher ? null : inviteUrl,
      voucherCode: result.voucherCode,
    };
  }

  /**
   * Edits or reassigns an already allocated/assigned student slot.
   * If email is unchanged: updates name, phone, department, and order reference.
   * If email is changed (e.g. correcting typo or replacing student):
   *  - enforces duplicate email prevention in the same batch
   *  - revokes previous unstarted enrolment
   *  - provisions or resolves new user & enrolment
   *  - dispatches account setup/invitation email to new Gmail
   *  - creates immutable AuditLog record
   */
  async reassignSeat(orgId: string, seatId: string, dto: ReassignSeatDto, actor?: any, req?: any) {
    const seat = await this.prisma.seat.findFirst({
      where: { id: seatId, organizationId: orgId },
      include: {
        seatPool: {
          include: {
            batch: true,
            program: true,
            organization: true,
          },
        },
        user: true,
        invite: true,
        enrolment: {
          include: {
            lessonProgress: true,
            attempts: true,
            examAttempts: true,
            certificate: true,
          },
        },
      },
    });

    if (!seat) {
      throw new NotFoundException(`Slot with ID ${seatId} was not found in this organization.`);
    }

    if (seat.status === SeatStatus.AVAILABLE) {
      throw new BadRequestException(`Cannot edit or reassign an unallocated slot. Please use Assign Student instead.`);
    }

    const newEmail = dto.email.trim().toLowerCase();
    const currentEmail = (seat.user?.email || seat.invite?.email || '').trim().toLowerCase();
    const emailChanged = Boolean(currentEmail && newEmail !== currentEmail);

    // If email changed, enforce duplicate checks in this batch
    if (emailChanged) {
      const duplicateSeat = await this.prisma.seat.findFirst({
        where: {
          id: { not: seat.id },
          status: { in: [SeatStatus.ASSIGNED, SeatStatus.INVITED, SeatStatus.CONSUMED] },
          seatPool: {
            batchId: seat.seatPool.batchId,
          },
          OR: [
            { user: { email: { equals: newEmail, mode: 'insensitive' } } },
            { invite: { email: { equals: newEmail, mode: 'insensitive' } } },
          ],
        },
        include: { seatPool: { include: { batch: true } } },
      });

      if (duplicateSeat) {
        throw new ConflictException(
          `Student with email "${newEmail}" is already assigned to Slot #${duplicateSeat.slotNumber} (${duplicateSeat.slotLabel}) in batch "${duplicateSeat.seatPool.batch.name}". A student cannot be enrolled twice in the same batch.`,
        );
      }

      const existingEnrolment = await this.prisma.enrolment.findFirst({
        where: {
          batchId: seat.seatPool.batchId,
          user: { email: { equals: newEmail, mode: 'insensitive' } },
          status: { notIn: [EnrolmentStatus.REVOKED] },
        },
        include: { batch: true },
      });

      if (existingEnrolment && existingEnrolment.id !== seat.enrolmentId) {
        throw new ConflictException(
          `Student with email "${newEmail}" already has an active enrolment in batch "${existingEnrolment.batch.name}". A student cannot be enrolled twice in the same batch.`,
        );
      }
    }

    // SCENARIO 1: Same email, updating metadata (name, phone, department, order ref)
    if (!emailChanged) {
      const updatedUser = seat.userId
        ? await this.prisma.user.update({
            where: { id: seat.userId },
            data: {
              name: dto.fullName?.trim() || seat.user?.name,
              phone: dto.phone?.trim() ?? seat.user?.phone,
            },
          })
        : seat.user;

      const updatedSeat = await this.prisma.seat.update({
        where: { id: seat.id },
        data: {
          department: dto.department?.trim() ?? seat.department,
          externalOrderRef: dto.externalOrderRef?.trim() ?? seat.externalOrderRef,
          orgInternalNotes: dto.orgInternalNotes?.trim() ?? seat.orgInternalNotes,
        },
        include: {
          user: true,
          seatPool: { include: { batch: true, program: true } },
        },
      });

      if (seat.inviteId) {
        await this.prisma.organizationInvite.update({
          where: { id: seat.inviteId },
          data: {
            fullName: dto.fullName?.trim() || seat.invite?.fullName,
            phone: dto.phone?.trim() ?? seat.invite?.phone,
            department: dto.department?.trim() ?? seat.invite?.department,
            externalOrderRef: dto.externalOrderRef?.trim() ?? seat.invite?.externalOrderRef,
          },
        }).catch(() => {});
      }

      await this.prisma.auditLog.create({
        data: {
          actorId: actor?.id || null,
          action: 'SEAT_UPDATED',
          entity: 'Seat',
          entityId: seat.id,
          meta: {
            organizationId: orgId,
            seatPoolId: seat.seatPoolId,
            slotNumber: seat.slotNumber,
            email: currentEmail,
            department: dto.department,
            externalOrderRef: dto.externalOrderRef,
            resendEmail: Boolean(dto.resendEmail),
          },
        },
      });

      const { lmsUrl } = getAppUrls(req);
      const orgName = seat.seatPool.organization.name;
      const programTitle = seat.seatPool.program.title;
      const batchName = seat.seatPool.batch.name;
      const studentName = updatedUser?.name || 'Learner';

      let passwordResetUrl: string | undefined = undefined;
      let setupUrl = `${lmsUrl}/login?email=${encodeURIComponent(currentEmail)}&redirect=/dashboard`;
      let emailSent = false;

      // If resendEmail requested or account setup requested:
      if (dto.resendEmail && seat.userId) {
        const passwordSetupToken = crypto.randomBytes(32).toString('hex');
        const setupTokenHash = crypto.createHash('sha256').update(passwordSetupToken).digest('hex');
        const setupExpiresAt = new Date(Date.now() + 14 * 86400 * 1000);

        await this.prisma.passwordResetToken.create({
          data: {
            userId: seat.userId,
            token: setupTokenHash,
            expiresAt: setupExpiresAt,
          },
        });

        passwordResetUrl = `${lmsUrl}/setup-account?token=${passwordSetupToken}&email=${encodeURIComponent(currentEmail)}`;
        setupUrl = passwordResetUrl;

        if (this.emailService) {
          try {
            await this.emailService.sendTemplateEmail({
              to: currentEmail,
              subject: `Set up your WhatBoutMe account — Sponsored by ${orgName}`,
              template: 'CorporateSeatInviteEmail',
              props: {
                learnerName: studentName,
                orgName,
                courseTitle: programTitle,
                programTitle,
                batchName,
                isNewUser: true,
                setupUrl: passwordResetUrl,
                dashboardUrl: `${lmsUrl}/dashboard`,
              },
            });
            emailSent = true;
          } catch (e: any) {
            console.warn('[SeatsService] Email re-dispatch failed:', e?.message);
          }
        }
      }

      return {
        success: true,
        reassigned: false,
        seat: updatedSeat,
        user: updatedUser,
        emailSent,
        setupUrl,
        passwordResetUrl,
        loginUrl: `${lmsUrl}/login?email=${encodeURIComponent(currentEmail)}&redirect=/dashboard`,
        message: emailSent
          ? `Student details updated and account setup email dispatched to ${currentEmail}.`
          : 'Student details updated successfully.',
      };
    }

    // SCENARIO 2: Email changed (reassigning slot to new student or correcting typo email)
    const oldUserId = seat.userId;
    const oldEnrolmentId = seat.enrolmentId;

    let existingTargetUser = await this.prisma.user.findFirst({
      where: { email: { equals: newEmail, mode: 'insensitive' } },
    });

    const passwordSetupToken = crypto.randomBytes(32).toString('hex');
    const setupTokenHash = crypto.createHash('sha256').update(passwordSetupToken).digest('hex');
    const setupExpiresAt = new Date(Date.now() + 14 * 86400 * 1000);

    let precomputedPasswordHash: string | null = null;
    if (!existingTargetUser) {
      const tempPassword = crypto.randomBytes(16).toString('hex');
      precomputedPasswordHash = await bcrypt.hash(tempPassword, 10);
    }

    const rawToken = crypto.randomBytes(24).toString('hex');
    const tokenHash = this.hashSecret(rawToken);

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Resolve or provision the new user
      let targetUser = existingTargetUser;
      if (!targetUser) {
        targetUser = await tx.user.create({
          data: {
            email: newEmail,
            name: dto.fullName?.trim() || newEmail.split('@')[0],
            phone: dto.phone?.trim() || null,
            passwordHash: precomputedPasswordHash!,
            role: Role.USER,
          },
        });
      } else if (dto.fullName && (!targetUser.name || targetUser.name === newEmail.split('@')[0])) {
        targetUser = await tx.user.update({
          where: { id: targetUser.id },
          data: { name: dto.fullName.trim() },
        });
      }

      await tx.passwordResetToken.create({
        data: {
          userId: targetUser.id,
          token: setupTokenHash,
          expiresAt: setupExpiresAt,
        },
      });

      // 2. Revoke previous enrolment if exists
      if (oldEnrolmentId) {
        await tx.enrolment.update({
          where: { id: oldEnrolmentId },
          data: { status: EnrolmentStatus.REVOKED },
        }).catch(() => {});
      }

      // 3. Provision new sponsored enrolment for the target user in this batch
      let newEnrolment = await tx.enrolment.findFirst({
        where: {
          userId: targetUser.id,
          batchId: seat.seatPool.batchId,
          status: { notIn: [EnrolmentStatus.REVOKED] },
        },
      });

      if (!newEnrolment) {
        newEnrolment = await tx.enrolment.create({
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

      // 4. Create new organization invite record for the new student
      const newInvite = await tx.organizationInvite.create({
        data: {
          organizationId: orgId,
          seatPoolId: seat.seatPoolId,
          email: newEmail,
          fullName: dto.fullName || targetUser.name,
          phone: dto.phone || targetUser.phone,
          department: dto.department ?? seat.department,
          externalOrderRef: dto.externalOrderRef ?? seat.externalOrderRef,
          tokenHash,
          expiresAt: new Date(Date.now() + 14 * 86400 * 1000),
          acceptedAt: new Date(),
        },
      });

      // 5. Update Seat with new student and enrolment
      const updatedSeat = await tx.seat.update({
        where: { id: seat.id },
        data: {
          userId: targetUser.id,
          enrolmentId: newEnrolment.id,
          status: SeatStatus.ASSIGNED,
          assignedAt: new Date(),
          department: dto.department ?? seat.department,
          externalOrderRef: dto.externalOrderRef ?? seat.externalOrderRef,
          orgInternalNotes: dto.orgInternalNotes ?? seat.orgInternalNotes,
          inviteId: newInvite.id,
        },
        include: {
          user: true,
          seatPool: { include: { batch: true, program: true } },
        },
      });

      // 6. Audit Log
      await tx.auditLog.create({
        data: {
          actorId: actor?.id || null,
          action: 'SEAT_REASSIGNED',
          entity: 'Seat',
          entityId: seat.id,
          meta: {
            organizationId: orgId,
            seatPoolId: seat.seatPoolId,
            slotNumber: seat.slotNumber,
            previousEmail: currentEmail,
            newEmail,
            previousUserId: oldUserId,
            newUserId: targetUser.id,
            newEnrolmentId: newEnrolment.id,
            department: dto.department,
            externalOrderRef: dto.externalOrderRef,
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
        enrolmentId: newEnrolment.id,
        isNewUser: !existingTargetUser,
        passwordSetupToken,
      };
    }, { maxWait: 15000, timeout: 30000 });

    // 7. Dispatch Welcome / Account Setup Email to new student
    const { lmsUrl } = getAppUrls(req);
    const orgName = seat.seatPool.organization.name;
    const programTitle = seat.seatPool.program.title;
    const batchName = seat.seatPool.batch.name;
    const studentName = result.user.name || 'Learner';

    const loginUrl = `${lmsUrl}/login?email=${encodeURIComponent(result.user.email)}&redirect=/dashboard`;
    const passwordResetUrl = `${lmsUrl}/setup-account?token=${result.passwordSetupToken}&email=${encodeURIComponent(result.user.email)}`;
    const setupUrl = result.passwordSetupToken ? passwordResetUrl : loginUrl;
    const shouldSendEmail = dto.resendEmail !== false;
    let emailSent = false;

    if (shouldSendEmail && this.emailService) {
      try {
        await this.emailService.sendTemplateEmail({
          to: result.user.email,
          subject: result.isNewUser
            ? `Set up your WhatBoutMe account — Sponsored by ${orgName}`
            : `You have been enrolled in ${programTitle} — Sponsored by ${orgName}`,
          template: 'CorporateSeatInviteEmail',
          props: {
            learnerName: studentName,
            orgName,
            courseTitle: programTitle,
            programTitle,
            batchName,
            isNewUser: result.isNewUser,
            setupUrl: result.passwordSetupToken ? passwordResetUrl : loginUrl,
            dashboardUrl: `${lmsUrl}/dashboard`,
          },
        });
        emailSent = true;
      } catch (e: any) {
        console.warn('[SeatsService] Email dispatch failed on reassign:', e?.message);
      }
    }

    return {
      success: true,
      reassigned: true,
      seat: result.seat,
      user: result.user,
      enrolmentId: result.enrolmentId,
      isNewUser: result.isNewUser,
      emailSent,
      setupUrl,
      loginUrl,
      passwordResetUrl,
      message: emailSent
        ? `Slot #${seat.slotNumber} (${seat.slotLabel}) successfully reassigned to ${result.user.email} and invitation email dispatched.`
        : `Slot #${seat.slotNumber} (${seat.slotLabel}) successfully reassigned to ${result.user.email}.`,
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

          try {
            const html = await renderEmailTemplate('CorporateSeatInviteEmail', {
              learnerName: studentName,
              orgName: pool.organization.name,
              courseTitle: pool.program.title,
              programTitle: pool.program.title,
              batchName: pool.batch.name,
              isNewUser: Boolean(passwordSetupToken),
              setupUrl,
              dashboardUrl: `${lmsUrl}/dashboard`,
            });
            emailsToSend.push({
              to: email,
              subject: emailSubject,
              html,
              text: `Hello ${studentName},\n\n${pool.organization.name} has enrolled you in ${pool.program.title}.\n\nAccess your course:\n${setupUrl || `${lmsUrl}/dashboard`}\n\nWhatBoutMe Team`,
            });
          } catch (e: any) {
            console.warn('[SeatsService] Error rendering bulk email template:', e?.message);
          }
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

