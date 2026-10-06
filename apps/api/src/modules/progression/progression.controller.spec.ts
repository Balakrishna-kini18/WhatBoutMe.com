import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ProgressionController } from './progression.controller.js';
import { ProgressionService } from './progression.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';

describe('D1-033: ProgressionController & Authorization Tests', () => {
  let controller: ProgressionController;
  let serviceMock: any;
  let reflector: Reflector;
  let permissionsGuard: PermissionsGuard;

  beforeEach(() => {
    serviceMock = {
      getMyProgression: vi.fn().mockResolvedValue({ enrolmentId: 'enrol-1', steps: [] }),
      getEnrolmentProgression: vi.fn().mockResolvedValue({ enrolmentId: 'enrol-1', steps: [] }),
      getStepProgression: vi.fn().mockResolvedValue({ stepId: 'step-1', isUnlocked: true }),
      recalculateProgression: vi.fn().mockResolvedValue({ enrolmentId: 'enrol-1', steps: [] }),
    };

    reflector = new Reflector();
    permissionsGuard = new PermissionsGuard(reflector);
    controller = new ProgressionController(serviceMock as unknown as ProgressionService);
  });

  const createMockContext = (
    handler: Function,
    user?: { role: Role; sub?: string } | null,
    params: Record<string, any> = {},
  ): ExecutionContext => {
    return {
      getType: () => 'http',
      getHandler: () => handler,
      getClass: () => ProgressionController,
      switchToHttp: () => ({
        getRequest: () => ({ user, params, query: {}, body: {} }),
      }),
    } as unknown as ExecutionContext;
  };

  describe('Learner Self-Service Endpoints', () => {
    it('delegates getMyProgression using authenticated user id from req.user.sub', async () => {
      const req = { user: { sub: 'learner-1', role: Role.USER } };
      const res = await controller.getMyProgression('prog-1', req);

      expect(serviceMock.getMyProgression).toHaveBeenCalledWith('learner-1', 'prog-1');
      expect(res.enrolmentId).toBe('enrol-1');
    });
  });

  describe('Scoped Progression Tree Endpoints', () => {
    it('delegates getEnrolmentProgression and verifies STEPS_READ allows ADMIN and MANAGER', async () => {
      const req = { user: { sub: 'admin-1', role: Role.ADMIN } };
      await controller.getEnrolmentProgression('enrol-1', req);

      expect(serviceMock.getEnrolmentProgression).toHaveBeenCalledWith('enrol-1', req.user, { persist: true });

      const adminCtx = createMockContext(controller.getEnrolmentProgression, { role: Role.ADMIN, sub: 'admin-1' });
      expect(permissionsGuard.canActivate(adminCtx)).toBe(true);

      const mgrCtx = createMockContext(controller.getEnrolmentProgression, { role: Role.MANAGER, sub: 'mgr-1' });
      expect(permissionsGuard.canActivate(mgrCtx)).toBe(true);

      const userCtx = createMockContext(controller.getEnrolmentProgression, { role: Role.USER, sub: 'user-1' });
      expect(permissionsGuard.canActivate(userCtx)).toBe(true); // User has STEPS_READ
    });

    it('delegates getStepProgression and passes stepId and enrolmentId', async () => {
      const req = { user: { sub: 'mgr-1', role: Role.MANAGER } };
      const res = await controller.getStepProgression('enrol-1', 'step-1', req);

      expect(serviceMock.getStepProgression).toHaveBeenCalledWith('enrol-1', 'step-1', req.user);
      expect(res.stepId).toBe('step-1');
    });
  });

  describe('Administrative Recalculation', () => {
    it('delegates recalculateProgression and validates STEPS_UNLOCK permission', async () => {
      const req = { user: { sub: 'admin-1', role: Role.ADMIN } };
      await controller.recalculateProgression('enrol-1', req);

      expect(serviceMock.recalculateProgression).toHaveBeenCalledWith('enrol-1', req.user);

      // Admin has STEPS_UNLOCK
      const adminCtx = createMockContext(controller.recalculateProgression, { role: Role.ADMIN, sub: 'admin-1' });
      expect(permissionsGuard.canActivate(adminCtx)).toBe(true);

      // User lacks STEPS_UNLOCK
      const userCtx = createMockContext(controller.recalculateProgression, { role: Role.USER, sub: 'user-1' });
      expect(() => permissionsGuard.canActivate(userCtx)).toThrow(ForbiddenException);
    });
  });
});
