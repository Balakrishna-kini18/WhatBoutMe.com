import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CouponsService } from './coupons.service.js';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  CouponDiscountType,
  CouponScope,
  CouponCurrency,
} from '@prisma/client';

describe('CouponsService - Module 2 of 8 (Coupons Management)', () => {
  let service: CouponsService;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      coupon: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      couponRedemption: {
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
      },
      program: {
        findUnique: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
      $executeRaw: vi.fn(),
    };

    service = new CouponsService(prismaMock);
  });

  describe('1. Coupon Creation & Input Normalization', () => {
    it('normalizes coupon code to uppercase and trims leading/trailing whitespace', async () => {
      prismaMock.coupon.findUnique.mockResolvedValue(null);
      prismaMock.coupon.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'c1', ...data }),
      );
      prismaMock.auditLog.create.mockResolvedValue({ id: 'a1' });

      const result = await service.createCoupon(
        {
          code: '   roweena_discount20   ',
          discountType: CouponDiscountType.PERCENTAGE,
          discountValue: 20,
        },
        'admin-1',
      );

      expect(result.code).toBe('ROWEENA_DISCOUNT20');
      expect(prismaMock.coupon.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            code: 'ROWEENA_DISCOUNT20',
            discountType: CouponDiscountType.PERCENTAGE,
            discountValue: 20,
          }),
        }),
      );
    });

    it('throws ConflictException if coupon code already exists', async () => {
      prismaMock.coupon.findUnique.mockResolvedValue({ id: 'c1', code: 'EXISTING_CODE' });

      await expect(
        service.createCoupon({
          code: 'existing_code',
          discountType: CouponDiscountType.PERCENTAGE,
          discountValue: 15,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects percentage discount greater than 100%', async () => {
      prismaMock.coupon.findUnique.mockResolvedValue(null);

      await expect(
        service.createCoupon({
          code: 'OVER100',
          discountType: CouponDiscountType.PERCENTAGE,
          discountValue: 101,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects percentage discount of 0 or negative', async () => {
      prismaMock.coupon.findUnique.mockResolvedValue(null);

      await expect(
        service.createCoupon({
          code: 'ZERO_PCT',
          discountType: CouponDiscountType.PERCENTAGE,
          discountValue: 0,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects fixed amount coupon if currency is missing or ALL', async () => {
      prismaMock.coupon.findUnique.mockResolvedValue(null);

      await expect(
        service.createCoupon({
          code: 'FIXED_NO_CURR',
          discountType: CouponDiscountType.FIXED_AMOUNT,
          discountValue: 50,
          currency: CouponCurrency.ALL,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects specific courses coupon if programIds list is empty', async () => {
      prismaMock.coupon.findUnique.mockResolvedValue(null);

      await expect(
        service.createCoupon({
          code: 'SPECIFIC_EMPTY',
          discountType: CouponDiscountType.PERCENTAGE,
          discountValue: 10,
          scope: CouponScope.SPECIFIC_COURSES,
          programIds: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('2. Validation & Checkout Logic', () => {
    it('calculates percentage discount accurately without floating-point artifacts', async () => {
      prismaMock.coupon.findUnique.mockResolvedValue({
        id: 'c-pct',
        code: 'SAVE33',
        discountType: CouponDiscountType.PERCENTAGE,
        discountValue: 33.33,
        currency: CouponCurrency.ALL,
        scope: CouponScope.ALL_COURSES,
        maxTotalUses: 100,
        currentUses: 5,
        maxUsesPerUser: 2,
        validFrom: new Date(Date.now() - 3600000),
        expiresAt: new Date(Date.now() + 3600000),
        isActive: true,
        appliesToInstalments: true,
        programs: [],
      });

      const res = await service.validateCoupon({
        code: 'save33',
        programId: 'prog-1',
        currency: 'USD',
        amount: 299.99,
      });

      expect(res.valid).toBe(true);
      expect(res.discountAmount).toBe(99.99);
      expect(res.finalAmount).toBe(200);
      expect(res.isFree).toBe(false);
    });

    it('handles 100% discount cleanly as free checkout with 0 final amount', async () => {
      prismaMock.coupon.findUnique.mockResolvedValue({
        id: 'c-free',
        code: 'FULL100',
        discountType: CouponDiscountType.PERCENTAGE,
        discountValue: 100,
        currency: CouponCurrency.ALL,
        scope: CouponScope.ALL_COURSES,
        maxTotalUses: null,
        currentUses: 0,
        maxUsesPerUser: 1,
        isActive: true,
        appliesToInstalments: false,
        programs: [],
      });

      const res = await service.validateCoupon({
        code: 'FULL100',
        programId: 'prog-1',
        currency: 'USD',
        amount: 450,
      });

      expect(res.valid).toBe(true);
      expect(res.discountAmount).toBe(450);
      expect(res.finalAmount).toBe(0);
      expect(res.isFree).toBe(true);
    });

    it('rejects currency mismatch on fixed amount coupon with explicit error', async () => {
      prismaMock.coupon.findUnique.mockResolvedValue({
        id: 'c-inr',
        code: 'DIWALI1000',
        discountType: CouponDiscountType.FIXED_AMOUNT,
        discountValue: 1000,
        currency: CouponCurrency.INR,
        scope: CouponScope.ALL_COURSES,
        maxTotalUses: null,
        currentUses: 0,
        maxUsesPerUser: 1,
        isActive: true,
        programs: [],
      });

      await expect(
        service.validateCoupon({
          code: 'DIWALI1000',
          programId: 'prog-1',
          currency: 'USD',
          amount: 200,
        }),
      ).rejects.toThrow('This coupon is only valid for purchases in INR');
    });

    it('rejects expired coupon code', async () => {
      prismaMock.coupon.findUnique.mockResolvedValue({
        id: 'c-exp',
        code: 'EXPIRED_CODE',
        discountType: CouponDiscountType.PERCENTAGE,
        discountValue: 10,
        isActive: true,
        expiresAt: new Date(Date.now() - 60000), // 1 min ago
        programs: [],
      });

      await expect(
        service.validateCoupon({
          code: 'EXPIRED_CODE',
          programId: 'prog-1',
          currency: 'USD',
          amount: 100,
        }),
      ).rejects.toThrow('This coupon has expired');
    });

    it('rejects coupon when maxTotalUses is exhausted', async () => {
      prismaMock.coupon.findUnique.mockResolvedValue({
        id: 'c-exhausted',
        code: 'LIMITED_CAP',
        discountType: CouponDiscountType.PERCENTAGE,
        discountValue: 20,
        isActive: true,
        maxTotalUses: 5,
        currentUses: 5,
        programs: [],
      });

      await expect(
        service.validateCoupon({
          code: 'LIMITED_CAP',
          programId: 'prog-1',
          currency: 'USD',
          amount: 100,
        }),
      ).rejects.toThrow('This coupon has reached its maximum usage limit');
    });

    it('enforces per-learner usage limit maxUsesPerUser', async () => {
      prismaMock.coupon.findUnique.mockResolvedValue({
        id: 'c-once',
        code: 'ONCE_PER_USER',
        discountType: CouponDiscountType.PERCENTAGE,
        discountValue: 15,
        isActive: true,
        maxUsesPerUser: 1,
        programs: [],
      });
      prismaMock.couponRedemption.count.mockResolvedValue(1); // User already used once

      await expect(
        service.validateCoupon({
          code: 'ONCE_PER_USER',
          programId: 'prog-1',
          currency: 'USD',
          userId: 'user-already-redeemed',
          amount: 100,
        }),
      ).rejects.toThrow('You have already redeemed this coupon the maximum allowed times');
    });

    it('rejects course-scoped coupon for unauthorized program', async () => {
      prismaMock.coupon.findUnique.mockResolvedValue({
        id: 'c-course',
        code: 'MINDFULNESS_ONLY',
        discountType: CouponDiscountType.PERCENTAGE,
        discountValue: 25,
        isActive: true,
        scope: CouponScope.SPECIFIC_COURSES,
        programs: [{ id: 'prog-mindfulness' }],
      });

      await expect(
        service.validateCoupon({
          code: 'MINDFULNESS_ONLY',
          programId: 'prog-sleep-coaching',
          currency: 'USD',
          amount: 150,
        }),
      ).rejects.toThrow('This coupon is not valid for this course');
    });

    it('rejects coupon if applied to instalment plan when appliesToInstalments is false', async () => {
      prismaMock.coupon.findUnique.mockResolvedValue({
        id: 'c-no-inst',
        code: 'LUMP_SUM_ONLY',
        discountType: CouponDiscountType.PERCENTAGE,
        discountValue: 30,
        isActive: true,
        appliesToInstalments: false,
        programs: [],
      });

      await expect(
        service.validateCoupon({
          code: 'LUMP_SUM_ONLY',
          programId: 'prog-1',
          currency: 'USD',
          amount: 100,
          paymentPlanType: 'INSTALMENT',
        }),
      ).rejects.toThrow('This coupon cannot be applied to instalment payment plans');
    });
  });

  describe('3. Concurrency & High-Scale Atomic Redemption (100,000,000 Users Scale)', () => {
    it('prevents race conditions on the last available coupon use with atomic conditional update', async () => {
      const mockTx: any = {
        $executeRaw: vi.fn().mockResolvedValue(0), // Concurrently claimed by another checkout thread
      };

      await expect(
        service.redeemCouponAtomic(mockTx, {
          couponId: 'c-last',
          userId: 'user-concurrent-loss',
          orderAmount: 100,
          discountAmount: 20,
          finalAmount: 80,
          currency: 'USD',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('successfully processes atomic redemption on valid transaction', async () => {
      const mockTx: any = {
        $executeRaw: vi.fn().mockResolvedValue(1),
        couponRedemption: {
          create: vi.fn().mockResolvedValue({
            id: 'red-success',
            couponId: 'c1',
            userId: 'user-winner',
            finalAmount: 80,
          }),
        },
      };

      const res = await service.redeemCouponAtomic(mockTx, {
        couponId: 'c1',
        userId: 'user-winner',
        orderAmount: 100,
        discountAmount: 20,
        finalAmount: 80,
        currency: 'USD',
      });

      expect(mockTx.$executeRaw).toHaveBeenCalled();
      expect(res.id).toBe('red-success');
    });
  });

  describe('4. Deletion Protection (Historical Accounting Integrity)', () => {
    it('hard deletes an unused coupon with 0 redemptions', async () => {
      prismaMock.coupon.findUnique.mockResolvedValue({
        id: 'c-unused',
        code: 'ZERO_USAGE',
        currentUses: 0,
        _count: { redemptions: 0 },
      });
      prismaMock.coupon.delete.mockResolvedValue({ id: 'c-unused' });
      prismaMock.auditLog.create.mockResolvedValue({ id: 'a1' });

      const res = await service.deleteCoupon('c-unused', 'admin-1');
      expect(res.archived).toBe(false);
      expect(prismaMock.coupon.delete).toHaveBeenCalledWith({ where: { id: 'c-unused' } });
    });

    it('soft-deactivates coupon with existing redemptions to protect past invoices', async () => {
      prismaMock.coupon.findUnique.mockResolvedValue({
        id: 'c-used',
        code: 'USED_CODE',
        currentUses: 12,
        _count: { redemptions: 12 },
      });
      prismaMock.coupon.update.mockResolvedValue({ id: 'c-used', isActive: false });
      prismaMock.auditLog.create.mockResolvedValue({ id: 'a2' });

      const res = await service.deleteCoupon('c-used', 'admin-1');
      expect(res.archived).toBe(true);
      expect(prismaMock.coupon.update).toHaveBeenCalledWith({
        where: { id: 'c-used' },
        data: { isActive: false },
      });
      expect(prismaMock.coupon.delete).not.toHaveBeenCalled();
    });
  });

  describe('5. Multi-Currency Accounting Breakdown', () => {
    it('groups total discounts by currency without raw arithmetic corruption', async () => {
      prismaMock.coupon.count
        .mockResolvedValueOnce(8)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1);
      prismaMock.couponRedemption.count.mockResolvedValue(15);
      prismaMock.couponRedemption.findMany.mockResolvedValue([
        { currency: 'USD', discountAmount: 50 },
        { currency: 'USD', discountAmount: 100.5 },
        { currency: 'INR', discountAmount: 4999 },
        { currency: 'INR', discountAmount: 1000 },
        { currency: 'AED', discountAmount: 350 },
      ]);

      const kpis = await service.getSummaryKpis();

      expect(kpis.activeCount).toBe(8);
      expect(kpis.totalRedemptions).toBe(15);
      expect(kpis.totalDiscountGiven.USD).toBe(150.5);
      expect(kpis.totalDiscountGiven.INR).toBe(5999);
      expect(kpis.totalDiscountGiven.AED).toBe(350);
    });
  });
});
