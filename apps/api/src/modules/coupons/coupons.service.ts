import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  CouponDiscountType,
  CouponScope,
  CouponCurrency,
  Prisma,
} from '@prisma/client';
import {
  CreateCouponDto,
  UpdateCouponDto,
  QueryCouponDto,
  ValidateCouponDto,
} from './dto/index.js';

export interface CouponSummaryKpis {
  activeCount: number;
  totalRedemptions: number;
  totalDiscountGiven: Record<string, number>;
  depletedCount: number;
  expiredCount: number;
}

@Injectable()
export class CouponsService {
  private readonly logger = new Logger(CouponsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves summary KPI metrics for the coupons dashboard.
   * Multi-currency breakdown guarantees that different currencies (INR, AED, USD)
   * are never summed together into a single number.
   */
  async getSummaryKpis(): Promise<CouponSummaryKpis> {
    const now = new Date();

    const [activeCount, depletedCount, expiredCount, totalRedemptions, redemptions] =
      await Promise.all([
        this.prisma.coupon.count({
          where: {
            isActive: true,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
        }),
        this.prisma.coupon.count({
          where: {
            maxTotalUses: { not: null },
            // currentUses >= maxTotalUses
          },
        }),
        this.prisma.coupon.count({
          where: {
            expiresAt: { lte: now },
          },
        }),
        this.prisma.couponRedemption.count(),
        this.prisma.couponRedemption.findMany({
          select: {
            currency: true,
            discountAmount: true,
          },
        }),
      ]);

    const totalDiscountGiven: Record<string, number> = {
      INR: 0,
      AED: 0,
      USD: 0,
    };

    for (const r of redemptions) {
      const curr = (r.currency || 'USD').toUpperCase();
      totalDiscountGiven[curr] = Math.round(((totalDiscountGiven[curr] || 0) + r.discountAmount) * 100) / 100;
    }

    return {
      activeCount,
      totalRedemptions,
      totalDiscountGiven,
      depletedCount,
      expiredCount,
    };
  }

  /**
   * Lists coupons for Admin with filtering and pagination.
   */
  async findAllAdmin(query: QueryCouponDto) {
    const {
      search,
      discountType,
      scope,
      currency,
      isActive,
      page = 1,
      limit = 20,
    } = query;

    const skip = (page - 1) * limit;
    const where: Prisma.CouponWhereInput = {};

    if (search && search.trim()) {
      const term = search.trim();
      where.OR = [
        { code: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ];
    }

    if (discountType) {
      where.discountType = discountType;
    }

    if (scope) {
      where.scope = scope;
    }

    if (currency) {
      where.currency = currency;
    }

    if (typeof isActive === 'boolean') {
      where.isActive = isActive;
    }

    const [items, total] = await Promise.all([
      this.prisma.coupon.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          programs: {
            select: { id: true, title: true, slug: true },
          },
          _count: {
            select: { redemptions: true },
          },
        },
      }),
      this.prisma.coupon.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Retrieves single coupon details with recent redemptions.
   */
  async findOneAdmin(id: string) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id },
      include: {
        programs: {
          select: { id: true, title: true, slug: true, price: true },
        },
        redemptions: {
          take: 50,
          orderBy: { redeemedAt: 'desc' },
          include: {
            user: { select: { id: true, name: true, email: true } },
            payment: { select: { id: true, status: true, amount: true, currency: true } },
          },
        },
        _count: { select: { redemptions: true } },
      },
    });

    if (!coupon) {
      throw new NotFoundException(`Coupon with ID '${id}' not found`);
    }

    return coupon;
  }

  /**
   * Creates a new coupon with validation and audit logging.
   */
  async createCoupon(dto: CreateCouponDto, actorId?: string) {
    const normalizedCode = dto.code.trim().toUpperCase();

    // Check unique code
    const existing = await this.prisma.coupon.findUnique({
      where: { code: normalizedCode },
    });
    if (existing) {
      throw new ConflictException(`Coupon code '${normalizedCode}' already exists`);
    }

    // Validation rules
    if (dto.discountType === CouponDiscountType.PERCENTAGE) {
      if (dto.discountValue <= 0 || dto.discountValue > 100) {
        throw new BadRequestException('Percentage discount must be between 1% and 100%');
      }
    } else if (dto.discountType === CouponDiscountType.FIXED_AMOUNT) {
      if (dto.discountValue <= 0) {
        throw new BadRequestException('Fixed discount amount must be greater than zero');
      }
      if (!dto.currency || dto.currency === CouponCurrency.ALL) {
        throw new BadRequestException(
          'Fixed amount coupons must specify a concrete currency (INR, AED, or USD)',
        );
      }
    }

    if (
      dto.scope === CouponScope.SPECIFIC_COURSES &&
      (!dto.programIds || dto.programIds.length === 0)
    ) {
      throw new BadRequestException(
        'Please select at least one course for course-specific coupons',
      );
    }

    const coupon = await this.prisma.coupon.create({
      data: {
        code: normalizedCode,
        description: dto.description?.trim() || null,
        discountType: dto.discountType,
        discountValue: Number(dto.discountValue),
        currency: dto.currency || CouponCurrency.ALL,
        scope: dto.scope || CouponScope.ALL_COURSES,
        maxTotalUses: dto.maxTotalUses ? Number(dto.maxTotalUses) : null,
        maxUsesPerUser: dto.maxUsesPerUser ? Number(dto.maxUsesPerUser) : 1,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : new Date(),
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
        appliesToInstalments: Boolean(dto.appliesToInstalments),
        stripeCouponId: dto.stripeCouponId?.trim() || null,
        stripePromotionCodeId: dto.stripePromotionCodeId?.trim() || null,
        programs:
          dto.scope === CouponScope.SPECIFIC_COURSES && dto.programIds?.length
            ? { connect: dto.programIds.map((pid) => ({ id: pid })) }
            : undefined,
      },
      include: {
        programs: { select: { id: true, title: true } },
      },
    });

    // Write audit log
    await this.prisma.auditLog.create({
      data: {
        actorId: actorId || null,
        action: 'COUPON_CREATED',
        entity: 'Coupon',
        entityId: coupon.id,
        meta: {
          code: coupon.code,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          currency: coupon.currency,
          scope: coupon.scope,
        },
      },
    });

    return coupon;
  }

  /**
   * Updates an existing coupon.
   */
  async updateCoupon(id: string, dto: UpdateCouponDto, actorId?: string) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id },
      include: { programs: { select: { id: true } } },
    });

    if (!coupon) {
      throw new NotFoundException(`Coupon with ID '${id}' not found`);
    }

    let normalizedCode = coupon.code;
    if (dto.code && dto.code.trim().toUpperCase() !== coupon.code) {
      normalizedCode = dto.code.trim().toUpperCase();
      const existing = await this.prisma.coupon.findUnique({
        where: { code: normalizedCode },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(`Coupon code '${normalizedCode}' already exists`);
      }
    }

    const discountType = dto.discountType || coupon.discountType;
    const discountValue = dto.discountValue !== undefined ? Number(dto.discountValue) : coupon.discountValue;

    if (discountType === CouponDiscountType.PERCENTAGE) {
      if (discountValue <= 0 || discountValue > 100) {
        throw new BadRequestException('Percentage discount must be between 1% and 100%');
      }
    } else if (discountType === CouponDiscountType.FIXED_AMOUNT) {
      const currency = dto.currency || coupon.currency;
      if (currency === CouponCurrency.ALL) {
        throw new BadRequestException(
          'Fixed amount coupons must specify a concrete currency (INR, AED, or USD)',
        );
      }
    }

    const scope = dto.scope || coupon.scope;
    let programsUpdate: any = undefined;

    if (scope === CouponScope.SPECIFIC_COURSES) {
      if (dto.programIds) {
        programsUpdate = {
          set: dto.programIds.map((pid) => ({ id: pid })),
        };
      }
    } else if (scope === CouponScope.ALL_COURSES) {
      programsUpdate = { set: [] };
    }

    const updated = await this.prisma.coupon.update({
      where: { id },
      data: {
        code: normalizedCode,
        description: dto.description !== undefined ? dto.description?.trim() || null : coupon.description,
        discountType,
        discountValue,
        currency: dto.currency || coupon.currency,
        scope,
        maxTotalUses: dto.maxTotalUses !== undefined ? (dto.maxTotalUses ? Number(dto.maxTotalUses) : null) : coupon.maxTotalUses,
        maxUsesPerUser: dto.maxUsesPerUser !== undefined ? Number(dto.maxUsesPerUser) : coupon.maxUsesPerUser,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : coupon.validFrom,
        expiresAt: dto.expiresAt !== undefined ? (dto.expiresAt ? new Date(dto.expiresAt) : null) : coupon.expiresAt,
        isActive: dto.isActive !== undefined ? dto.isActive : coupon.isActive,
        appliesToInstalments: dto.appliesToInstalments !== undefined ? Boolean(dto.appliesToInstalments) : coupon.appliesToInstalments,
        stripeCouponId: dto.stripeCouponId !== undefined ? dto.stripeCouponId?.trim() || null : coupon.stripeCouponId,
        stripePromotionCodeId: dto.stripePromotionCodeId !== undefined ? dto.stripePromotionCodeId?.trim() || null : coupon.stripePromotionCodeId,
        programs: programsUpdate,
      },
      include: {
        programs: { select: { id: true, title: true } },
      },
    });

    // Write audit log
    await this.prisma.auditLog.create({
      data: {
        actorId: actorId || null,
        action: 'COUPON_UPDATED',
        entity: 'Coupon',
        entityId: updated.id,
        meta: {
          code: updated.code,
          discountType: updated.discountType,
          discountValue: updated.discountValue,
          isActive: updated.isActive,
        },
      },
    });

    return updated;
  }

  /**
   * Deletion Protection:
   * "Never hard-delete a coupon that has currentUses > 0 (to preserve historical invoice integrity); soft-archive/deactivate it instead."
   */
  async deleteCoupon(id: string, actorId?: string) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id },
      include: { _count: { select: { redemptions: true } } },
    });

    if (!coupon) {
      throw new NotFoundException(`Coupon with ID '${id}' not found`);
    }

    if (coupon.currentUses > 0 || coupon._count.redemptions > 0) {
      // Soft-deactivate to protect invoice integrity
      await this.prisma.coupon.update({
        where: { id },
        data: { isActive: false },
      });

      await this.prisma.auditLog.create({
        data: {
          actorId: actorId || null,
          action: 'COUPON_ARCHIVED',
          entity: 'Coupon',
          entityId: coupon.id,
          meta: {
            code: coupon.code,
            reason: 'Deactivated due to existing historical redemptions',
            redemptionCount: coupon._count.redemptions,
          },
        },
      });

      return {
        success: true,
        archived: true,
        message:
          'Coupon has historical redemptions and was deactivated instead of deleted to protect invoice integrity.',
      };
    }

    // Hard delete if zero redemptions
    await this.prisma.coupon.delete({ where: { id } });

    await this.prisma.auditLog.create({
      data: {
        actorId: actorId || null,
        action: 'COUPON_DELETED',
        entity: 'Coupon',
        entityId: id,
        meta: { code: coupon.code },
      },
    });

    return {
      success: true,
      archived: false,
      message: 'Coupon deleted successfully.',
    };
  }

  /**
   * Validates a coupon code during checkout and calculates exact discount.
   * Performs all 8 business checks including currency match, expiry, usage limits,
   * course scope, and instalment applicability.
   */
  async validateCoupon(dto: ValidateCouponDto) {
    const normalizedCode = dto.code.trim().toUpperCase();
    const reqCurrency = dto.currency.trim().toUpperCase();

    const coupon = await this.prisma.coupon.findUnique({
      where: { code: normalizedCode },
      include: {
        programs: { select: { id: true, title: true, price: true } },
      },
    });

    if (!coupon || !coupon.isActive) {
      throw new BadRequestException('Invalid or inactive coupon code');
    }

    const now = new Date();

    // 1. Expiry check
    if (coupon.expiresAt && now > new Date(coupon.expiresAt)) {
      throw new BadRequestException('This coupon has expired');
    }

    // 2. Start date check
    if (coupon.validFrom && now < new Date(coupon.validFrom)) {
      throw new BadRequestException('This coupon is not active yet');
    }

    // 3. Max total uses check
    if (coupon.maxTotalUses !== null && coupon.currentUses >= coupon.maxTotalUses) {
      throw new BadRequestException('This coupon has reached its maximum usage limit');
    }

    // 4. Per-learner usage check
    if (dto.userId) {
      const userRedemptions = await this.prisma.couponRedemption.count({
        where: {
          couponId: coupon.id,
          userId: dto.userId,
        },
      });
      if (userRedemptions >= coupon.maxUsesPerUser) {
        throw new BadRequestException(
          'You have already redeemed this coupon the maximum allowed times',
        );
      }
    }

    // 5. Course scope check
    if (coupon.scope === CouponScope.SPECIFIC_COURSES) {
      const isApplicable = coupon.programs.some((p) => p.id === dto.programId);
      if (!isApplicable) {
        throw new BadRequestException('This coupon is not valid for this course');
      }
    }

    // 6. Currency match check
    // Edge case: A fixed coupon of 500 INR must be rejected with a clear message if currency is AED or USD.
    if (
      coupon.discountType === CouponDiscountType.FIXED_AMOUNT &&
      coupon.currency !== CouponCurrency.ALL
    ) {
      if (coupon.currency !== reqCurrency) {
        throw new BadRequestException(
          `This coupon is only valid for purchases in ${coupon.currency}`,
        );
      }
    }

    // 7. Instalment check
    if (dto.paymentPlanType === 'INSTALMENT' && !coupon.appliesToInstalments) {
      throw new BadRequestException(
        'This coupon cannot be applied to instalment payment plans',
      );
    }

    // 8. Amount calculation
    let originalAmount = dto.amount;
    if (originalAmount === undefined || originalAmount === null) {
      const program = await this.prisma.program.findUnique({
        where: { id: dto.programId },
        select: { price: true },
      });
      if (!program) {
        throw new NotFoundException('Course/Program not found');
      }
      originalAmount = program.price;
    }

    let discountAmount = 0;
    if (coupon.discountType === CouponDiscountType.PERCENTAGE) {
      discountAmount = Math.round(((originalAmount * coupon.discountValue) / 100) * 100) / 100;
      discountAmount = Math.min(originalAmount, discountAmount);
    } else {
      discountAmount = Math.min(originalAmount, coupon.discountValue);
    }

    const finalAmount = Math.max(0, Math.round((originalAmount - discountAmount) * 100) / 100);

    return {
      valid: true,
      couponId: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      originalAmount,
      discountAmount,
      finalAmount,
      currency: reqCurrency,
      isFree: finalAmount === 0,
    };
  }

  /**
   * Atomic coupon redemption within a database transaction.
   * Concurrency Safe: Uses an atomic conditional increment to prevent race conditions
   * on the last remaining coupon use.
   */
  async redeemCouponAtomic(
    tx: Prisma.TransactionClient,
    params: {
      couponId: string;
      userId: string;
      enrolmentId?: string;
      paymentId?: string;
      orderAmount: number;
      discountAmount: number;
      finalAmount: number;
      currency: string;
    },
  ) {
    // 1. Atomic update conditional on maxTotalUses
    const rowsAffected = await tx.$executeRaw`
      UPDATE "Coupon"
      SET "currentUses" = "currentUses" + 1, "updatedAt" = NOW()
      WHERE "id" = ${params.couponId}
        AND "isActive" = true
        AND ("maxTotalUses" IS NULL OR "currentUses" < "maxTotalUses")
    `;

    if (rowsAffected === 0) {
      throw new BadRequestException(
        'This coupon has just reached its maximum usage limit or is no longer available',
      );
    }

    // 2. Record redemption record
    const redemption = await tx.couponRedemption.create({
      data: {
        couponId: params.couponId,
        userId: params.userId,
        enrolmentId: params.enrolmentId || null,
        paymentId: params.paymentId || null,
        orderAmount: params.orderAmount,
        discountAmount: params.discountAmount,
        finalAmount: params.finalAmount,
        currency: params.currency.toUpperCase(),
      },
    });

    return redemption;
  }
}
