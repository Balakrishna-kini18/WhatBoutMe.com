import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CouponsAdminController } from './coupons-admin.controller.js';
import { CouponsCheckoutController } from './coupons-checkout.controller.js';
import { Role } from '@prisma/client';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../common/guards/roles.guard.js';

describe('Coupons Controllers & RBAC Gate Check', () => {
  let adminController: CouponsAdminController;
  let checkoutController: CouponsCheckoutController;
  let mockCouponsService: any;
  let rolesGuard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    mockCouponsService = {
      getSummaryKpis: vi.fn().mockResolvedValue({ activeCount: 5 }),
      findAllAdmin: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      findOneAdmin: vi.fn().mockResolvedValue({ id: 'c1' }),
      createCoupon: vi.fn().mockResolvedValue({ id: 'c1', code: 'NEW20' }),
      updateCoupon: vi.fn().mockResolvedValue({ id: 'c1', code: 'UPDATED20' }),
      deleteCoupon: vi.fn().mockResolvedValue({ success: true }),
      validateCoupon: vi.fn().mockResolvedValue({ valid: true, discountAmount: 10 }),
    };

    adminController = new CouponsAdminController(mockCouponsService);
    checkoutController = new CouponsCheckoutController(mockCouponsService);
    reflector = new Reflector();
    rolesGuard = new RolesGuard(reflector);
  });

  describe('RBAC Roles Metadata on CouponsAdminController', () => {
    it('restricts admin controller to SUPER_ADMIN and ADMIN', () => {
      const allowedRoles = reflector.get<Role[]>('roles', CouponsAdminController);
      expect(allowedRoles).toBeDefined();
      expect(allowedRoles).toContain(Role.SUPER_ADMIN);
      expect(allowedRoles).toContain(Role.ADMIN);
      expect(allowedRoles).not.toContain(Role.MANAGER);
      expect(allowedRoles).not.toContain(Role.USER);
    });

    const createContext = (role: Role) => ({
      getType: () => 'http',
      getHandler: () => () => {},
      getClass: () => CouponsAdminController,
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: 'test-user-id', role },
        }),
      }),
    });

    it('blocks MANAGER from calling admin coupons endpoints with RolesGuard', () => {
      const contextMock: any = createContext(Role.MANAGER);
      const canActivate = rolesGuard.canActivate(contextMock);
      expect(canActivate).toBe(false);
    });

    it('blocks USER (Learner) from calling admin coupons endpoints with RolesGuard', () => {
      const contextMock: any = createContext(Role.USER);
      const canActivate = rolesGuard.canActivate(contextMock);
      expect(canActivate).toBe(false);
    });

    it('grants SUPER_ADMIN and ADMIN access to admin coupons endpoints with RolesGuard', () => {
      const superAdminContext: any = createContext(Role.SUPER_ADMIN);
      const adminContext: any = createContext(Role.ADMIN);

      expect(rolesGuard.canActivate(superAdminContext)).toBe(true);
      expect(rolesGuard.canActivate(adminContext)).toBe(true);
    });
  });

  describe('Checkout Controller', () => {
    it('allows valid checkout coupon validation requests', async () => {
      const req: any = { user: { sub: 'learner-1' } };
      const dto: any = { code: 'SAVE10', programId: 'p1', currency: 'USD' };

      const res = await checkoutController.validateCoupon(dto, req);
      expect(mockCouponsService.validateCoupon).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'SAVE10',
          programId: 'p1',
          currency: 'USD',
          userId: 'learner-1',
        }),
      );
      expect(res.valid).toBe(true);
    });
  });
});
