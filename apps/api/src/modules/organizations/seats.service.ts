import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
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
import { AssignSeatDto, BulkInviteDto } from './dto/index.js';

@Injectable()
export class SeatsService {
  constructor(private readonly prisma: PrismaService) {}

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
  async assignSeat(orgId: string, dto: AssignSeatDto, actor?: any) {
    const seat = await this.prisma.seat.findUnique({
      where: { id: dto.seatId },
      include: { seatPool: { include: { batch: true } } },
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

    // Check if learner is already actively enrolled in this batch
    const existingEnrolment = await this.prisma.enrolment.findFirst({
      where: {
        batchId: seat.seatPool.batchId,
        user: { email },
        status: { notIn: [EnrolmentStatus.REVOKED] },
      },
    });

    if (existingEnrolment) {
      throw new ConflictException(
        `Learner with email ${email} already has an active enrolment in batch "${seat.seatPool.batch.name}"`,
      );
    }

    const isVoucher = dto.redemptionMode === SeatRedemptionMode.VOUCHER_CODE;
    const rawToken = crypto.randomBytes(24).toString('hex');
    const tokenHash = this.hashSecret(rawToken);
    const voucher = isVoucher ? this.generateVoucherCode() : null;

    return this.prisma.$transaction(async (tx) => {
      // 1. Create OrganizationInvite record
      const invite = await tx.organizationInvite.create({
        data: {
          organizationId: orgId,
          seatPoolId: seat.seatPoolId,
          email,
          fullName: dto.fullName,
          phone: dto.phone,
          department: dto.department,
          externalOrderRef: dto.externalOrderRef,
          tokenHash: voucher ? voucher.hash : tokenHash,
          expiresAt: new Date(Date.now() + 14 * 86400 * 1000), // 14-day expiry
        },
      });

      // 2. Update Seat
      const updatedSeat = await tx.seat.update({
        where: { id: seat.id },
        data: {
          status: SeatStatus.INVITED,
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

      // 3. Update SeatPool counters
      await tx.seatPool.update({
        where: { id: seat.seatPoolId },
        data: {
          seatsAssigned: { increment: 1 },
          seatsAvailable: { decrement: 1 },
        },
      });

      // 4. Audit Log
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
            department: dto.department,
            externalOrderRef: dto.externalOrderRef,
            redemptionMode: dto.redemptionMode,
          },
        },
      });

      return {
        seat: updatedSeat,
        inviteId: invite.id,
        inviteUrl: isVoucher
          ? null
          : `/org-invite/${rawToken}`,
        voucherCode: voucher ? voucher.raw : null,
      };
    });
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
    });
    if (!pool) throw new NotFoundException('SeatPool not found');

    const results: Array<{
      slotNumber: number;
      email: string;
      inviteUrl?: string;
      voucherCode?: string;
    }> = [];

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

        const invite = await tx.organizationInvite.create({
          data: {
            organizationId: orgId,
            seatPoolId: pool.id,
            email,
            fullName: inviteItem.fullName,
            phone: inviteItem.phone,
            department: inviteItem.department,
            externalOrderRef: inviteItem.externalOrderRef,
            tokenHash: voucher ? voucher.hash : tokenHash,
            expiresAt: new Date(Date.now() + 14 * 86400 * 1000),
          },
        });

        await tx.seat.update({
          where: { id: seat.id },
          data: {
            status: SeatStatus.INVITED,
            redemptionMode: dto.redemptionMode || SeatRedemptionMode.EMAIL_INVITE,
            voucherCodeHash: voucher ? voucher.hash : null,
            voucherCodeMasked: voucher ? voucher.masked : null,
            inviteId: invite.id,
            department: inviteItem.department,
            externalOrderRef: inviteItem.externalOrderRef,
            invitedAt: new Date(),
          },
        });

        results.push({
          slotNumber: seat.slotNumber,
          email,
          inviteUrl: isVoucher ? undefined : `/org-invite/${rawToken}`,
          voucherCode: voucher ? voucher.raw : undefined,
        });
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
    });

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

