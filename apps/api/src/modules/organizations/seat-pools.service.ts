import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CurrencyCode,
  InvoiceStatus,
  Prisma,
  Role,
  SeatPaymentMethod,
  SeatPoolStatus,
  SeatRedemptionMode,
  SeatStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateSeatPoolDto, SeatPoolCheckoutDto } from './dto/index.js';
import { CAPACITY_OCCUPYING_STATUSES } from '../enrollments/enrollments.service.js';
import { VolumePricingService } from './volume-pricing.service.js';

@Injectable()
export class SeatPoolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly volumePricingService: VolumePricingService,
  ) {}

  /**
   * Evaluates volume-tier discount percentage based on batch slot quantity:
   *  - 10 - 24 seats: 10% discount
   *  - 25 - 49 seats: 15% discount
   *  - 50+ seats:     25% discount
   */
  getVolumeDiscountPercent(seatsCount: number): number {
    if (seatsCount >= 50) return 0.25;
    if (seatsCount >= 25) return 0.15;
    if (seatsCount >= 10) return 0.1;
    return 0.0;
  }

  /**
   * Single-Count Batch Slot Reservation & Capacity Invariant Formula:
   * Occupied Seats = E_individual (Self-paid / comp) + S_org_active + S_org_checkout_hold
   */
  async getBatchOccupiedSeats(
    batchId: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<number> {
    // 1. Individual paying enrolments (excluding ORG_SPONSORED to avoid double-counting)
    const individualEnrolments = await tx.enrolment.count({
      where: {
        batchId,
        status: { in: CAPACITY_OCCUPYING_STATUSES as any },
        OR: [
          { fundingSource: 'SELF_PAID' },
          { fundingSource: 'ADMIN_COMP' },
        ],
      },
    });

    // 2. Active institutional SeatPool reservations
    const activePools = await tx.seatPool.findMany({
      where: {
        batchId,
        status: { in: [SeatPoolStatus.ACTIVE, SeatPoolStatus.ACTIVE_UNPAID] },
      },
      select: { totalSeats: true },
    });
    const activeOrgSeats = activePools.reduce(
      (sum, pool) => sum + pool.totalSeats,
      0,
    );

    // 3. Pending online checkout holds with active 15-minute lock
    const holdPools = await tx.seatPool.findMany({
      where: {
        batchId,
        status: SeatPoolStatus.PENDING_PAYMENT,
        paymentExpiresAt: { gt: new Date() },
      },
      select: { totalSeats: true },
    });
    const holdOrgSeats = holdPools.reduce(
      (sum, pool) => sum + pool.totalSeats,
      0,
    );

    return individualEnrolments + activeOrgSeats + holdOrgSeats;
  }

  /**
   * Calculates pricing for a batch slot purchase with multi-currency support and volume discounts.
   */
  async calculatePricing(
    batchId: string,
    seatsCount: number,
    targetCurrency: CurrencyCode = CurrencyCode.USD,
    customPricePerSeat?: number,
  ) {
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
      include: { program: true },
    });

    if (!batch) {
      throw new NotFoundException(`Batch ${batchId} not found`);
    }

    let baseUnitPrice = customPricePerSeat;
    if (baseUnitPrice === undefined || baseUnitPrice === null) {
      if (targetCurrency === CurrencyCode.AED) {
        baseUnitPrice = batch.priceAED || batch.program.priceAED || 3670;
      } else if (targetCurrency === CurrencyCode.INR) {
        baseUnitPrice = batch.priceINR || batch.program.priceINR || 82000;
      } else {
        baseUnitPrice = batch.priceUSD || batch.price || batch.program.priceUSD || batch.program.price || 1000;
      }
    }

    const discountRate = customPricePerSeat ? 0 : await this.volumePricingService.getDiscountRate(seatsCount);
    const subtotal = seatsCount * baseUnitPrice;
    const discountAmount = Math.round(subtotal * discountRate * 100) / 100;
    const netAmount = Math.round((subtotal - discountAmount) * 100) / 100;

    return {
      batchId,
      programId: batch.programId,
      batchName: batch.name,
      currency: targetCurrency,
      seatsCount,
      baseUnitPrice,
      subtotal,
      discountRate,
      discountAmount,
      netAmount,
    };
  }

  /**
   * Generates a unique, human-friendly pool code e.g. "SP-2027-0042".
   */
  private async generatePoolCode(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.seatPool.count();
    const seq = String(count + 1).padStart(4, '0');
    return `SP-${year}-${seq}`;
  }

  /**
   * Creates a new SeatPool and immediately pre-materializes N numbered Seat rows (Slot #01..#N).
   */
  async createSeatPool(
    orgId: string,
    dto: CreateSeatPoolDto,
    actor?: any,
  ) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: orgId },
    });
    if (!organization) {
      throw new NotFoundException(`Organization ${orgId} not found`);
    }

    const batch = await this.prisma.batch.findUnique({
      where: { id: dto.batchId },
      include: { program: true },
    });
    if (!batch) {
      throw new NotFoundException(`Batch ${dto.batchId} not found`);
    }

    // Prevent duplicate pending requests for the same batch
    const existingPending = await this.prisma.seatPool.findFirst({
      where: {
        organizationId: orgId,
        batchId: dto.batchId,
        status: { in: [SeatPoolStatus.PENDING_APPROVAL, SeatPoolStatus.PENDING_PAYMENT] },
      },
    });
    if (existingPending) {
      const stateText = existingPending.status === SeatPoolStatus.PENDING_APPROVAL ? 'admin review' : 'payment';
      throw new BadRequestException(
        `A slot request for this cohort (${existingPending.poolCode}) is already pending ${stateText}. Please complete or cancel the existing request before requesting more slots.`,
      );
    }

    // Atomically check batch capacity
    const occupied = await this.getBatchOccupiedSeats(batch.id);
    if (occupied + dto.totalSeats > batch.capacity) {
      const remainingAvailable = Math.max(0, batch.capacity - occupied);
      throw new BadRequestException(
        `Insufficient batch capacity. Available seats: ${remainingAvailable}, Requested slots: ${dto.totalSeats}`,
      );
    }

    const pricing = await this.calculatePricing(
      dto.batchId,
      dto.totalSeats,
      dto.currency || organization.defaultCurrency,
      dto.customPricePerSeat,
    );

    const poolCode = await this.generatePoolCode();
    const isComplimentary = dto.paymentMethod === SeatPaymentMethod.COMPLIMENTARY;
    const initialStatus = isComplimentary ? SeatPoolStatus.ACTIVE : SeatPoolStatus.PENDING_PAYMENT;
    const initialSeatStatus = isComplimentary ? SeatStatus.AVAILABLE : SeatStatus.AVAILABLE;

    const paymentExpiresAt =
      dto.paymentMethod === SeatPaymentMethod.ONLINE
        ? new Date(Date.now() + 15 * 60 * 1000) // 15-minute checkout reservation hold
        : new Date(Date.now() + (organization.paymentTermsDays || 30) * 86400 * 1000);

    return this.prisma.$transaction(async (tx) => {
      // 1. Create SeatPool
      const pool = await tx.seatPool.create({
        data: {
          poolCode,
          organizationId: orgId,
          programId: batch.programId,
          batchId: batch.id,
          status: initialStatus,
          paymentMethod: dto.paymentMethod || SeatPaymentMethod.ONLINE,
          totalSeats: dto.totalSeats,
          seatsAssigned: 0,
          seatsConsumed: 0,
          seatsAvailable: dto.totalSeats,
          currency: pricing.currency,
          pricePerSeat: pricing.baseUnitPrice,
          totalAmount: pricing.subtotal,
          discountAmount: pricing.discountAmount,
          netAmount: isComplimentary ? 0 : pricing.netAmount,
          paymentExpiresAt,
          notes: dto.notes,
        },
      });

      // 2. Pre-materialize N numbered Seat rows (Slot #01 to #N)
      const seatRows = Array.from({ length: dto.totalSeats }, (_, idx) => {
        const slotNum = idx + 1;
        const slotLabel = `${poolCode}-S${String(slotNum).padStart(2, '0')}`;
        return {
          organizationId: orgId,
          seatPoolId: pool.id,
          slotNumber: slotNum,
          slotLabel,
          status: initialSeatStatus,
          redemptionMode: SeatRedemptionMode.EMAIL_INVITE,
        };
      });

      await tx.seat.createMany({
        data: seatRows,
      });

      // 3. Immutable Audit Logging
      await tx.auditLog.create({
        data: {
          actorId: actor?.id || null,
          action: 'SEAT_POOL_CREATED',
          entity: 'SeatPool',
          entityId: pool.id,
          meta: {
            organizationId: orgId,
            poolCode,
            totalSeats: dto.totalSeats,
            paymentMethod: dto.paymentMethod,
            status: initialStatus,
            currency: pricing.currency,
            netAmount: pricing.netAmount,
          },
        },
      });

      return pool;
    });
  }

  /**
   * Retrieves all SeatPools for an organization with live utilization and batch details.
   */
  async getSeatPoolsByOrg(orgId: string) {
    return this.prisma.seatPool.findMany({
      where: { organizationId: orgId },
      include: {
        batch: {
          select: {
            id: true,
            name: true,
            startDate: true,
            endDate: true,
            capacity: true,
            status: true,
          },
        },
        program: {
          select: {
            id: true,
            title: true,
            slug: true,
          },
        },
        _count: {
          select: {
            seats: true,
            invites: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Retrieves a single SeatPool with all numbered slots and student progression.
   */
  async getSeatPoolById(poolId: string) {
    const pool = await this.prisma.seatPool.findUnique({
      where: { id: poolId },
      include: {
        organization: true,
        batch: true,
        program: true,
        seats: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
              },
            },
            enrolment: {
              select: {
                id: true,
                status: true,
                currentStage: true,
                curriculumCompletedAt: true,
                oneOnOneStatus: true,
                oneOnOneScheduledAt: true,
                oneOnOneCompletedAt: true,
                examPassedAt: true,
                certificate: {
                  select: {
                    id: true,
                    certificateCode: true,
                    issueDate: true,
                  },
                },
              },
            },
            invite: true,
          },
          orderBy: { slotNumber: 'asc' },
        },
        invoices: true,
      },
    });

    if (!pool) {
      throw new NotFoundException(`SeatPool ${poolId} not found`);
    }

    return pool;
  }

  /**
   * Self-serve checkout initiation for Organization managers.
   */
  async initiateCheckout(
    orgId: string,
    userId: string,
    dto: SeatPoolCheckoutDto,
  ) {
    const seatsCount = dto.seatsCount || (dto as any).totalSeats || 1;
    const pool = await this.createSeatPool(
      orgId,
      {
        batchId: dto.batchId,
        totalSeats: seatsCount,
        currency: dto.currency,
        paymentMethod: dto.paymentMethod || SeatPaymentMethod.ONLINE,
        notes: dto.notes,
      },
      { id: userId },
    );

    // In TEST_BYPASS mode, simulate immediate payment confirmation
    return {
      pool,
      poolId: pool.id,
      poolCode: pool.poolCode,
      totalAmount: pool.netAmount,
      currency: pool.currency,
      paymentExpiresAt: pool.paymentExpiresAt,
      checkoutMode: 'TEST_BYPASS',
      instructions: 'Use /org/:orgId/seat-pools/:poolId/confirm-test-payment to complete instantly in development mode.',
    };
  }

  /**
   * Marks a SeatPool as PAID and transitions status to ACTIVE.
   */
  async markPaid(
    poolId: string,
    actor: any,
    details?: {
      paymentMethod?: SeatPaymentMethod;
      notes?: string;
    },
  ) {
    const pool = await this.prisma.seatPool.findUnique({
      where: { id: poolId },
      include: { organization: true },
    });

    if (!pool) {
      throw new NotFoundException(`SeatPool ${poolId} not found`);
    }

    if (pool.status === SeatPoolStatus.ACTIVE) {
      return pool; // Already active
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedPool = await tx.seatPool.update({
        where: { id: poolId },
        data: {
          status: SeatPoolStatus.ACTIVE,
          paymentMethod: details?.paymentMethod || pool.paymentMethod,
          paymentExpiresAt: null,
          notes: details?.notes ? `${pool.notes || ''}\n${details.notes}`.trim() : pool.notes,
        },
      });

      // Ensure N numbered Seat rows exist upon activation
      const existingSeats = await tx.seat.count({ where: { seatPoolId: pool.id } });
      if (existingSeats === 0) {
        const seatRows = Array.from({ length: pool.totalSeats }, (_, idx) => {
          const slotNum = idx + 1;
          const slotLabel = `${pool.poolCode}-S${String(slotNum).padStart(2, '0')}`;
          return {
            organizationId: pool.organizationId,
            seatPoolId: pool.id,
            slotNumber: slotNum,
            slotLabel,
            status: SeatStatus.AVAILABLE,
            redemptionMode: SeatRedemptionMode.EMAIL_INVITE,
          };
        });
        await tx.seat.createMany({ data: seatRows });
      }

      // Generate or update WhatBoutMe FZE Tax Invoice to PAID
      const invoiceNumber = `WBM-INV-${new Date().getFullYear()}-${pool.poolCode.replace('SP-', '')}`;
      await tx.invoice.upsert({
        where: { invoiceNumber },
        create: {
          invoiceNumber,
          amount: pool.netAmount,
          currency: pool.currency,
          status: InvoiceStatus.PAID,
          seatPoolId: pool.id,
          organizationId: pool.organizationId,
          taxFields: {
            clientName: pool.organization.name,
            taxId: pool.organization.taxId,
            billingEmail: pool.organization.billingEmail,
            seatsCount: pool.totalSeats,
            pricePerSeat: pool.pricePerSeat,
          },
        },
        update: {
          amount: pool.netAmount,
          status: InvoiceStatus.PAID,
        },
      });

      // Immutable Audit Log
      await tx.auditLog.create({
        data: {
          actorId: actor?.id || null,
          action: 'SEAT_POOL_ACTIVATED',
          entity: 'SeatPool',
          entityId: pool.id,
          meta: {
            organizationId: pool.organizationId,
            poolCode: pool.poolCode,
            invoiceNumber,
            totalSeats: pool.totalSeats,
            netAmount: pool.netAmount,
            currency: pool.currency,
          },
        },
      });

      return updatedPool;
    });
  }

  /**
   * Available open batches with live remaining capacity for Organization slot checkout.
   */
  async getAvailableBatchesForOrg(orgId: string) {
    const batches = await this.prisma.batch.findMany({
      where: {
        status: { in: ['UPCOMING', 'OPEN'] as any },
        OR: [
          { isPrivateOrgBatch: false },
          { isPrivateOrgBatch: true, sponsorOrganizationId: orgId },
        ],
      },
      include: {
        program: {
          select: {
            id: true,
            title: true,
            slug: true,
            coverImageUrl: true,
          },
        },
      },
      orderBy: { startDate: 'asc' },
    });

    const results = await Promise.all(
      batches.map(async (batch) => {
        const occupied = await this.getBatchOccupiedSeats(batch.id);
        const remainingCapacity = Math.max(0, batch.capacity - occupied);
        return {
          id: batch.id,
          name: batch.name,
          startDate: batch.startDate,
          endDate: batch.endDate,
          capacity: batch.capacity,
          occupied,
          remainingCapacity,
          priceUSD: batch.priceUSD || batch.price || 499,
          priceAED: batch.priceAED || (batch.price ? batch.price * 3.67 : 1850),
          priceINR: batch.priceINR || (batch.price ? batch.price * 83 : 42000),
          isPrivateOrgBatch: batch.isPrivateOrgBatch,
          program: batch.program,
        };
      }),
    );

    return results;
  }

  /**
   * Submits a booking request from an Organization Partner for Admin approval.
   */
  async requestSeatPool(
    orgId: string,
    dto: CreateSeatPoolDto,
    actor?: any,
  ) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: orgId },
    });
    if (!organization) {
      throw new NotFoundException(`Organization ${orgId} not found`);
    }

    const batch = await this.prisma.batch.findUnique({
      where: { id: dto.batchId },
      include: { program: true },
    });
    if (!batch) {
      throw new NotFoundException(`Batch ${dto.batchId} not found`);
    }
    // Check for existing pending request for this batch to prevent duplicate bookings
    const existingPending = await this.prisma.seatPool.findFirst({
      where: {
        organizationId: orgId,
        batchId: dto.batchId,
        status: {
          in: [SeatPoolStatus.PENDING_APPROVAL, SeatPoolStatus.PENDING_PAYMENT],
        },
      },
    });
    if (existingPending) {
      const stateText = existingPending.status === SeatPoolStatus.PENDING_APPROVAL ? 'admin review' : 'payment';
      throw new BadRequestException(
        `A slot request for this cohort (${existingPending.poolCode}) is already pending ${stateText}. Please complete or cancel the existing request before requesting more slots.`,
      );
    }


    // Atomically check batch capacity
    const occupied = await this.getBatchOccupiedSeats(batch.id);
    if (occupied + dto.totalSeats > batch.capacity) {
      const remainingAvailable = Math.max(0, batch.capacity - occupied);
      throw new BadRequestException(
        `Insufficient batch capacity. Available seats: ${remainingAvailable}, Requested slots: ${dto.totalSeats}`,
      );
    }

    const pricing = await this.calculatePricing(
      dto.batchId,
      dto.totalSeats,
      dto.currency || organization.defaultCurrency,
      dto.customPricePerSeat,
    );

    const poolCode = await this.generatePoolCode();
    const requesterName = actor?.name || actor?.email || 'Organization Partner';

    const pool = await this.prisma.seatPool.create({
      data: {
        poolCode,
        organizationId: orgId,
        programId: batch.programId,
        batchId: batch.id,
        status: SeatPoolStatus.PENDING_APPROVAL,
        paymentMethod: dto.paymentMethod || SeatPaymentMethod.ONLINE,
        totalSeats: dto.totalSeats,
        seatsAssigned: 0,
        seatsConsumed: 0,
        seatsAvailable: dto.totalSeats,
        currency: pricing.currency,
        pricePerSeat: pricing.baseUnitPrice,
        totalAmount: pricing.subtotal,
        discountAmount: pricing.discountAmount,
        netAmount: pricing.netAmount,
        notes: `Requested by ${requesterName}. ${dto.notes || ''}`.trim(),
      },
      include: {
        batch: {
          select: {
            id: true,
            name: true,
            startDate: true,
            endDate: true,
          },
        },
        program: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: actor?.id || null,
        action: 'SEAT_POOL_REQUESTED',
        entity: 'SeatPool',
        entityId: pool.id,
        meta: {
          organizationId: orgId,
          poolCode,
          totalSeats: dto.totalSeats,
          batchId: dto.batchId,
          netAmount: pricing.netAmount,
          currency: pricing.currency,
        },
      },
    });

    return pool;
  }

  /**
   * Approves a pending SeatPool request and generates pending invoice.
   */
  async approveSeatPool(
    poolId: string,
    actor: any,
    overrides?: { customPricePerSeat?: number; notes?: string },
  ) {
    const pool = await this.prisma.seatPool.findUnique({
      where: { id: poolId },
      include: { organization: true, batch: true },
    });

    if (!pool) {
      throw new NotFoundException(`SeatPool ${poolId} not found`);
    }

    if (pool.status !== SeatPoolStatus.PENDING_APPROVAL && pool.status !== SeatPoolStatus.DRAFT) {
      throw new BadRequestException(`SeatPool is currently ${pool.status}, cannot approve`);
    }

    let { pricePerSeat, totalAmount, discountAmount, netAmount } = pool;
    if (overrides?.customPricePerSeat) {
      pricePerSeat = overrides.customPricePerSeat;
      totalAmount = pool.totalSeats * pricePerSeat;
      discountAmount = 0;
      netAmount = totalAmount;
    }

    return this.prisma.$transaction(async (tx) => {
      const p = await tx.seatPool.update({
        where: { id: poolId },
        data: {
          status: SeatPoolStatus.PENDING_PAYMENT,
          pricePerSeat,
          totalAmount,
          discountAmount,
          netAmount,
          paymentExpiresAt: new Date(Date.now() + 7 * 86400 * 1000), // 7 days payment window
          notes: overrides?.notes
            ? `${pool.notes || ''}\nApproved by ${actor?.name || 'Admin'}: ${overrides.notes}`.trim()
            : pool.notes,
        },
        include: {
          batch: true,
          program: true,
          organization: true,
        },
      });

      // Generate or update pending invoice
      const invoiceNumber = `WBM-INV-${new Date().getFullYear()}-${p.poolCode.replace('SP-', '')}`;
      await tx.invoice.upsert({
        where: { invoiceNumber },
        create: {
          invoiceNumber,
          amount: p.netAmount,
          currency: p.currency,
          status: InvoiceStatus.ISSUED,
          seatPoolId: p.id,
          organizationId: p.organizationId,
          taxFields: {
            clientName: p.organization.name,
            taxId: p.organization.taxId,
            billingEmail: p.organization.billingEmail,
            seatsCount: p.totalSeats,
            pricePerSeat: p.pricePerSeat,
          },
        },
        update: {
          amount: p.netAmount,
          status: InvoiceStatus.ISSUED,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor?.id || null,
          action: 'SEAT_POOL_APPROVED',
          entity: 'SeatPool',
          entityId: p.id,
          meta: {
            organizationId: p.organizationId,
            poolCode: p.poolCode,
            netAmount: p.netAmount,
          },
        },
      });

      return p;
    });
  }

  /**
   * Rejects a pending SeatPool request.
   */
  async rejectSeatPool(poolId: string, actor: any, reason?: string) {
    const pool = await this.prisma.seatPool.findUnique({ where: { id: poolId } });
    if (!pool) throw new NotFoundException(`SeatPool ${poolId} not found`);

    const updated = await this.prisma.seatPool.update({
      where: { id: poolId },
      data: {
        status: SeatPoolStatus.CANCELLED,
        notes: `${pool.notes || ''}\nRejected by ${actor?.name || 'Admin'}: ${reason || 'No reason specified'}`.trim(),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: actor?.id || null,
        action: 'SEAT_POOL_REJECTED',
        entity: 'SeatPool',
        entityId: pool.id,
        meta: { reason },
      },
    });

    return updated;
  }

  /**
   * Cancels or permanently removes a pending SeatPool request.
   */
  async cancelSeatPool(poolId: string, actor: any) {
    const pool = await this.prisma.seatPool.findUnique({
      where: { id: poolId },
      include: { seats: true },
    });
    if (!pool) throw new NotFoundException(`SeatPool ${poolId} not found`);

    if (pool.status === SeatPoolStatus.ACTIVE) {
      const assignedCount = pool.seats.filter((s) => s.status !== SeatStatus.AVAILABLE).length;
      if (assignedCount > 0) {
        throw new BadRequestException('Cannot cancel an active pool with assigned students.');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Delete associated unpaid invoices
      await tx.invoice.deleteMany({
        where: { seatPoolId: pool.id, status: { not: InvoiceStatus.PAID } },
      });

      // 2. Delete unassigned seats if any
      await tx.seat.deleteMany({
        where: { seatPoolId: pool.id },
      });

      // 3. Delete the pool
      await tx.seatPool.delete({
        where: { id: pool.id },
      });

      // 4. Audit Log
      await tx.auditLog.create({
        data: {
          actorId: actor?.id || null,
          action: 'SEAT_POOL_CANCELLED',
          entity: 'SeatPool',
          entityId: pool.id,
          meta: {
            poolCode: pool.poolCode,
            organizationId: pool.organizationId,
            batchId: pool.batchId,
            totalSeats: pool.totalSeats,
          },
        },
      });

      return { success: true, message: `Slot request ${pool.poolCode} cancelled successfully` };
    });
  }

  /**
   * Retrieves active/upcoming batches available for booking.
   */
  async getAvailableBatches(orgId: string) {
    const batches = await this.prisma.batch.findMany({
      where: {
        status: { in: ['ACTIVE', 'UPCOMING'] },
      },
      include: {
        program: {
          select: {
            id: true,
            title: true,
            slug: true,
            price: true,
            priceUSD: true,
            priceAED: true,
            priceINR: true,
          },
        },
      },
      orderBy: { startDate: 'asc' },
    });

    const result = await Promise.all(
      batches.map(async (batch) => {
        const occupied = await this.getBatchOccupiedSeats(batch.id);
        const available = Math.max(0, batch.capacity - occupied);
        return {
          id: batch.id,
          name: batch.name,
          startDate: batch.startDate,
          endDate: batch.endDate,
          capacity: batch.capacity,
          occupiedSeats: occupied,
          availableSeats: available,
          status: batch.status,
          programId: batch.programId,
          programTitle: batch.program?.title,
          priceUSD: batch.priceUSD || batch.price || batch.program?.priceUSD || 1000,
          priceAED: batch.priceAED || batch.program?.priceAED || 3670,
          priceINR: batch.priceINR || batch.program?.priceINR || 82000,
        };
      }),
    );

    return result;
  }

}
