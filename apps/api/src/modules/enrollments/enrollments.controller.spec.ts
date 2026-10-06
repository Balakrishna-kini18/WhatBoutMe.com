import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EnrolmentStatus, Role } from '@prisma/client';
import {
  AdminEnrolmentsController,
  BatchWaitlistController,
  LearnerEnrolmentsController,
} from './enrollments.controller.js';
import { EnrollmentsService } from './enrollments.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { BatchAccessGuard } from '../../common/guards/batch-access.guard.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PaymentMode } from './dto/index.js';

describe('D1-032: EnrollmentsController & RBAC Authorization Tests', () => {
  let adminController: AdminEnrolmentsController;
  let waitlistController: BatchWaitlistController;
  let learnerController: LearnerEnrolmentsController;
  let serviceMock: any;
  let reflector: Reflector;
  let permissionsGuard: PermissionsGuard;
  let batchAccessGuard: BatchAccessGuard;
  let prismaMock: any;

  beforeEach(() => {
    serviceMock = {
      create: vi.fn().mockResolvedValue({ id: 'enrol-1', status: EnrolmentStatus.PENDING_PAYMENT }),
      findAll: vi.fn().mockResolvedValue({ data: [], total: 0 }),
      findOne: vi.fn().mockResolvedValue({ id: 'enrol-1' }),
      transitionStatus: vi.fn().mockResolvedValue({ id: 'enrol-1', status: EnrolmentStatus.ACTIVE }),
      transferBatch: vi.fn().mockResolvedValue({ id: 'enrol-1', transferred: true }),
      cancel: vi.fn().mockResolvedValue({ id: 'enrol-1', revoked: true }),
      promoteNextWaitlisted: vi.fn().mockResolvedValue({ id: 'enrol-waitlist', promoted: true }),
      findForLearner: vi.fn().mockResolvedValue([{ id: 'enrol-me-1' }]),
      findOneForLearner: vi.fn().mockResolvedValue({ id: 'enrol-me-1' }),
    };

    prismaMock = {
      batch: {
        findUnique: vi.fn(),
      },
    };

    reflector = new Reflector();
    permissionsGuard = new PermissionsGuard(reflector);
    batchAccessGuard = new BatchAccessGuard(prismaMock as unknown as PrismaService, reflector);

    adminController = new AdminEnrolmentsController(serviceMock as unknown as EnrollmentsService);
    waitlistController = new BatchWaitlistController(serviceMock as unknown as EnrollmentsService);
    learnerController = new LearnerEnrolmentsController(serviceMock as unknown as EnrollmentsService);
  });

  const createMockContext = (
    handler: Function,
    controllerClass: any,
    user?: { role: Role; sub?: string } | null,
    params: Record<string, any> = {},
  ): ExecutionContext => {
    return {
      getType: () => 'http',
      getHandler: () => handler,
      getClass: () => controllerClass,
      switchToHttp: () => ({
        getRequest: () => ({ user, params, query: {}, body: {} }),
      }),
    } as unknown as ExecutionContext;
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. ADMIN CONTROLLER DELEGATION & RBAC
  // ─────────────────────────────────────────────────────────────────────────────
  describe('AdminEnrolmentsController Delegation & Permissions', () => {
    it('delegates create to EnrollmentsService and verifies ENROLMENTS_CREATE', async () => {
      const dto = {
        userId: 'u-1',
        programId: 'p-1',
        batchId: 'b-1',
        paymentMode: PaymentMode.STRIPE,
      };

      const res = await adminController.create(dto);
      expect(serviceMock.create).toHaveBeenCalledWith(dto);
      expect(res.id).toBe('enrol-1');

      // Admin has permission
      const adminCtx = createMockContext(adminController.create, AdminEnrolmentsController, {
        role: Role.ADMIN,
        sub: 'admin-1',
      });
      expect(permissionsGuard.canActivate(adminCtx)).toBe(true);

      // Manager lacks permission
      const mgrCtx = createMockContext(adminController.create, AdminEnrolmentsController, {
        role: Role.MANAGER,
        sub: 'mgr-1',
      });
      expect(() => permissionsGuard.canActivate(mgrCtx)).toThrow(ForbiddenException);

      // Learner lacks permission
      const userCtx = createMockContext(adminController.create, AdminEnrolmentsController, {
        role: Role.USER,
        sub: 'user-1',
      });
      expect(() => permissionsGuard.canActivate(userCtx)).toThrow(ForbiddenException);
    });

    it('delegates findAll and verifies ENROLMENTS_READ allows ADMIN and MANAGER but denies USER', async () => {
      const req = { user: { role: Role.ADMIN, sub: 'admin-1' } };
      await adminController.findAll(req, {});
      expect(serviceMock.findAll).toHaveBeenCalledWith(req.user, {});

      // Admin has permission
      const adminCtx = createMockContext(adminController.findAll, AdminEnrolmentsController, {
        role: Role.ADMIN,
        sub: 'admin-1',
      });
      expect(permissionsGuard.canActivate(adminCtx)).toBe(true);

      // Manager has ENROLMENTS_READ permission
      const mgrCtx = createMockContext(adminController.findAll, AdminEnrolmentsController, {
        role: Role.MANAGER,
        sub: 'mgr-1',
      });
      expect(permissionsGuard.canActivate(mgrCtx)).toBe(true);

      // Learner lacks permission
      const userCtx = createMockContext(adminController.findAll, AdminEnrolmentsController, {
        role: Role.USER,
        sub: 'user-1',
      });
      expect(() => permissionsGuard.canActivate(userCtx)).toThrow(ForbiddenException);
    });

    it('delegates transitionStatus and verifies ENROLMENTS_UPDATE is denied for MANAGER', async () => {
      const dto = { targetStatus: EnrolmentStatus.ACTIVE };
      await adminController.transitionStatus('enrol-1', dto);
      expect(serviceMock.transitionStatus).toHaveBeenCalledWith('enrol-1', dto);

      // Admin allowed
      const adminCtx = createMockContext(adminController.transitionStatus, AdminEnrolmentsController, {
        role: Role.ADMIN,
        sub: 'admin-1',
      });
      expect(permissionsGuard.canActivate(adminCtx)).toBe(true);

      // Manager denied
      const mgrCtx = createMockContext(adminController.transitionStatus, AdminEnrolmentsController, {
        role: Role.MANAGER,
        sub: 'mgr-1',
      });
      expect(() => permissionsGuard.canActivate(mgrCtx)).toThrow(ForbiddenException);
    });

    it('delegates transfer and verifies ENROLMENTS_UPDATE', async () => {
      const dto = { destinationBatchId: 'b-2' };
      await adminController.transfer('enrol-1', dto);
      expect(serviceMock.transferBatch).toHaveBeenCalledWith('enrol-1', dto);

      const adminCtx = createMockContext(adminController.transfer, AdminEnrolmentsController, {
        role: Role.ADMIN,
        sub: 'admin-1',
      });
      expect(permissionsGuard.canActivate(adminCtx)).toBe(true);
    });

    it('delegates cancel and verifies ENROLMENTS_CANCEL', async () => {
      await adminController.cancel('enrol-1');
      expect(serviceMock.cancel).toHaveBeenCalledWith('enrol-1');

      const adminCtx = createMockContext(adminController.cancel, AdminEnrolmentsController, {
        role: Role.ADMIN,
        sub: 'admin-1',
      });
      expect(permissionsGuard.canActivate(adminCtx)).toBe(true);

      const mgrCtx = createMockContext(adminController.cancel, AdminEnrolmentsController, {
        role: Role.MANAGER,
        sub: 'mgr-1',
      });
      expect(() => permissionsGuard.canActivate(mgrCtx)).toThrow(ForbiddenException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. WAITLIST PROMOTION CONTROLLER
  // ─────────────────────────────────────────────────────────────────────────────
  describe('BatchWaitlistController Delegation & RBAC', () => {
    it('delegates promoteNextWaitlisted and validates ENROLMENTS_UPDATE requirement', async () => {
      await waitlistController.promoteNextWaitlisted('batch-1');
      expect(serviceMock.promoteNextWaitlisted).toHaveBeenCalledWith('batch-1');

      // Admin allowed
      const adminCtx = createMockContext(
        waitlistController.promoteNextWaitlisted,
        BatchWaitlistController,
        { role: Role.ADMIN, sub: 'admin-1' },
        { batchId: 'batch-1' },
      );
      expect(permissionsGuard.canActivate(adminCtx)).toBe(true);

      // Manager denied
      const mgrCtx = createMockContext(
        waitlistController.promoteNextWaitlisted,
        BatchWaitlistController,
        { role: Role.MANAGER, sub: 'mgr-1' },
        { batchId: 'batch-1' },
      );
      expect(() => permissionsGuard.canActivate(mgrCtx)).toThrow(ForbiddenException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. LEARNER CONTROLLER DELEGATION
  // ─────────────────────────────────────────────────────────────────────────────
  describe('LearnerEnrolmentsController Delegation', () => {
    it('delegates findMyEnrolments using req.user.sub', async () => {
      const req = { user: { sub: 'learner-1', role: Role.USER } };
      const res = await learnerController.findMyEnrolments(req);
      expect(serviceMock.findForLearner).toHaveBeenCalledWith('learner-1');
      expect(res).toHaveLength(1);
    });

    it('delegates findMyEnrolment using param id and req.user.sub', async () => {
      const req = { user: { sub: 'learner-1', role: Role.USER } };
      const res = await learnerController.findMyEnrolment('enrol-me-1', req);
      expect(serviceMock.findOneForLearner).toHaveBeenCalledWith('enrol-me-1', 'learner-1');
      expect(res.id).toBe('enrol-me-1');
    });
  });
});
