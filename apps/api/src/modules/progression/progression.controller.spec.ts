import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ProgressionController } from './progression.controller.js';
import { ProgressionService } from './progression.service.js';
import { StepOverrideDto } from './dto/index.js';
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

  describe('D1-034: Administrative Step Overrides', () => {
    it('manualUnlockStep delegates to service and enforces STEPS_UNLOCK permission', async () => {
      serviceMock.manualUnlockStep = vi.fn().mockResolvedValue({
        enrolmentId: 'enrol-1',
        stepId: 'step-1',
        overrideState: 'MANUAL_UNLOCKED',
        isUnlocked: true,
      });

      const req = {
        user: { sub: 'admin-1', role: Role.ADMIN },
        ip: '127.0.0.1',
      };
      const dto = { reason: 'Learner granted special early access' };

      const res = await controller.manualUnlockStep('enrol-1', 'step-1', dto, req);

      expect(serviceMock.manualUnlockStep).toHaveBeenCalledWith(
        'enrol-1',
        'step-1',
        req.user,
        'Learner granted special early access',
        '127.0.0.1',
      );
      expect(res.isUnlocked).toBe(true);

      // RBAC: Admin allowed, Manager allowed, Super Admin allowed, User denied
      const adminCtx = createMockContext(controller.manualUnlockStep, { role: Role.ADMIN, sub: 'admin-1' });
      expect(permissionsGuard.canActivate(adminCtx)).toBe(true);

      const mgrCtx = createMockContext(controller.manualUnlockStep, { role: Role.MANAGER, sub: 'mgr-1' });
      expect(permissionsGuard.canActivate(mgrCtx)).toBe(true);

      const superCtx = createMockContext(controller.manualUnlockStep, { role: Role.SUPER_ADMIN, sub: 'super-1' });
      expect(permissionsGuard.canActivate(superCtx)).toBe(true);

      const userCtx = createMockContext(controller.manualUnlockStep, { role: Role.USER, sub: 'user-1' });
      expect(() => permissionsGuard.canActivate(userCtx)).toThrow(ForbiddenException);
    });

    it('manualRelockStep delegates to service and enforces STEPS_LOCK permission', async () => {
      serviceMock.manualRelockStep = vi.fn().mockResolvedValue({
        enrolmentId: 'enrol-1',
        stepId: 'step-1',
        overrideState: 'MANUAL_LOCKED',
        isUnlocked: false,
      });

      const req = {
        user: { sub: 'admin-1', role: Role.ADMIN },
        ip: '192.168.1.1',
      };
      const dto = { reason: 'Step paused pending attendance review' };

      const res = await controller.manualRelockStep('enrol-1', 'step-1', dto, req);

      expect(serviceMock.manualRelockStep).toHaveBeenCalledWith(
        'enrol-1',
        'step-1',
        req.user,
        'Step paused pending attendance review',
        '192.168.1.1',
      );
      expect(res.isUnlocked).toBe(false);

      // RBAC: Admin allowed, Manager allowed, Super Admin allowed, User denied
      const adminCtx = createMockContext(controller.manualRelockStep, { role: Role.ADMIN, sub: 'admin-1' });
      expect(permissionsGuard.canActivate(adminCtx)).toBe(true);

      const mgrCtx = createMockContext(controller.manualRelockStep, { role: Role.MANAGER, sub: 'mgr-1' });
      expect(permissionsGuard.canActivate(mgrCtx)).toBe(true);

      const userCtx = createMockContext(controller.manualRelockStep, { role: Role.USER, sub: 'user-1' });
      expect(() => permissionsGuard.canActivate(userCtx)).toThrow(ForbiddenException);
    });

    it('resetStepOverride delegates to service and enforces STEPS_UNLOCK permission', async () => {
      serviceMock.resetStepOverride = vi.fn().mockResolvedValue({
        enrolmentId: 'enrol-1',
        stepId: 'step-1',
        overrideState: 'AUTOMATIC',
        isUnlocked: true,
      });

      const req = {
        user: { sub: 'mgr-1', role: Role.MANAGER },
        ip: '10.0.0.1',
      };
      const dto = { reason: 'Reverting manual override to resume standard progression' };

      const res = await controller.resetStepOverride('enrol-1', 'step-1', dto, req);

      expect(serviceMock.resetStepOverride).toHaveBeenCalledWith(
        'enrol-1',
        'step-1',
        req.user,
        'Reverting manual override to resume standard progression',
        '10.0.0.1',
      );
      expect(res.overrideState).toBe('AUTOMATIC');

      // RBAC: Admin allowed, Manager allowed, User denied
      const mgrCtx = createMockContext(controller.resetStepOverride, { role: Role.MANAGER, sub: 'mgr-1' });
      expect(permissionsGuard.canActivate(mgrCtx)).toBe(true);

      const userCtx = createMockContext(controller.resetStepOverride, { role: Role.USER, sub: 'user-1' });
      expect(() => permissionsGuard.canActivate(userCtx)).toThrow(ForbiddenException);
    });
  });

  describe('D1-034: StepOverrideDto Validation', () => {
    const toDto = (plain: any) => plainToInstance(StepOverrideDto, plain);

    it('accepts valid reason between 5 and 500 characters', async () => {
      const dto = toDto({ reason: 'Valid override reason' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects blank or missing reason', async () => {
      const dto = toDto({});
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects whitespace-only reason (trimmed to empty)', async () => {
      const dto = toDto({ reason: '     ' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects reason shorter than 5 characters', async () => {
      const dto = toDto({ reason: 'four' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects reason longer than 500 characters', async () => {
      const dto = toDto({ reason: 'a'.repeat(501) });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
