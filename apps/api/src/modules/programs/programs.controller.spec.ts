import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ProgramsController } from './programs.controller.js';
import { ProgramsService } from './programs.service.js';
import { PermissionsGuard, PERMISSIONS_KEY } from '../../common/guards/permissions.guard.js';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator.js';
import { Permission } from '../../config/permissions.config.js';

describe('D1-030: ProgramsController & Security Guard Tests', () => {
  let controller: ProgramsController;
  let serviceMock: any;
  let reflector: Reflector;
  let permissionsGuard: PermissionsGuard;

  beforeEach(() => {
    serviceMock = {
      findAll: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue({ id: 'p1' }),
      create: vi.fn().mockResolvedValue({ id: 'p1' }),
      update: vi.fn().mockResolvedValue({ id: 'p1' }),
      publishProgram: vi.fn().mockResolvedValue({ id: 'p1' }),
      remove: vi.fn().mockResolvedValue({ deleted: true }),
      getSteps: vi.fn().mockResolvedValue([]),
      getStep: vi.fn().mockResolvedValue({ id: 's1' }),
      createStep: vi.fn().mockResolvedValue({ id: 's1' }),
      updateStep: vi.fn().mockResolvedValue({ id: 's1' }),
      reorderSteps: vi.fn().mockResolvedValue([]),
      publishStep: vi.fn().mockResolvedValue({ id: 's1' }),
      previewStep: vi.fn().mockResolvedValue({ id: 's1' }),
      removeStep: vi.fn().mockResolvedValue({ deleted: true }),
      getLessons: vi.fn().mockResolvedValue([]),
      createLesson: vi.fn().mockResolvedValue({ id: 'l1' }),
      updateLesson: vi.fn().mockResolvedValue({ id: 'l1' }),
      reorderLessons: vi.fn().mockResolvedValue([]),
      publishLesson: vi.fn().mockResolvedValue({ id: 'l1' }),
      previewLesson: vi.fn().mockResolvedValue({ id: 'l1' }),
      removeLesson: vi.fn().mockResolvedValue({ deleted: true }),
      completeStep: vi.fn().mockResolvedValue({ stepId: 's1', completed: true }),
    };

    controller = new ProgramsController(serviceMock as unknown as ProgramsService);
    reflector = new Reflector();
    permissionsGuard = new PermissionsGuard(reflector);
  });

  const createMockContext = (handler: Function, user?: { role: Role; sub?: string } | null): ExecutionContext => {
    return {
      getType: () => 'http',
      getHandler: () => handler,
      getClass: () => ProgramsController,
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. ROUTE METADATA & PERMISSION DECORATION AUDIT
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Route Metadata & Security Annotations', () => {
    it('public catalog endpoints are annotated with @Public()', () => {
      expect(reflector.get(IS_PUBLIC_KEY, controller.findAll)).toBe(true);
      expect(reflector.get(IS_PUBLIC_KEY, controller.findOne)).toBe(true);
      expect(reflector.get(IS_PUBLIC_KEY, controller.getSteps)).toBe(true);
    });

    it('program authoring endpoints have strict named permissions', () => {
      expect(reflector.get(PERMISSIONS_KEY, controller.create)).toEqual([Permission.PROGRAMS_CREATE]);
      expect(reflector.get(PERMISSIONS_KEY, controller.update)).toEqual([Permission.PROGRAMS_UPDATE]);
      expect(reflector.get(PERMISSIONS_KEY, controller.remove)).toEqual([Permission.PROGRAMS_DELETE]);
      expect(reflector.get(PERMISSIONS_KEY, controller.publishProgram)).toEqual([Permission.PROGRAMS_PUBLISH]);
    });

    it('step authoring and preview endpoints have strict named permissions', () => {
      expect(reflector.get(PERMISSIONS_KEY, controller.createStep)).toEqual([Permission.STEPS_CREATE]);
      expect(reflector.get(PERMISSIONS_KEY, controller.updateStep)).toEqual([Permission.STEPS_UPDATE]);
      expect(reflector.get(PERMISSIONS_KEY, controller.reorderSteps)).toEqual([Permission.STEPS_UPDATE]);
      expect(reflector.get(PERMISSIONS_KEY, controller.publishStep)).toEqual([Permission.STEPS_UPDATE]);
      expect(reflector.get(PERMISSIONS_KEY, controller.previewStep)).toEqual([Permission.STEPS_UPDATE]);
      expect(reflector.get(PERMISSIONS_KEY, controller.removeStep)).toEqual([Permission.STEPS_DELETE]);
    });

    it('lesson authoring and preview endpoints have strict named permissions', () => {
      expect(reflector.get(PERMISSIONS_KEY, controller.createLesson)).toEqual([Permission.CONTENT_CREATE]);
      expect(reflector.get(PERMISSIONS_KEY, controller.updateLesson)).toEqual([Permission.CONTENT_UPDATE]);
      expect(reflector.get(PERMISSIONS_KEY, controller.reorderLessons)).toEqual([Permission.CONTENT_UPDATE]);
      expect(reflector.get(PERMISSIONS_KEY, controller.publishLesson)).toEqual([Permission.CONTENT_UPDATE]);
      expect(reflector.get(PERMISSIONS_KEY, controller.previewLesson)).toEqual([Permission.CONTENT_UPDATE]);
      expect(reflector.get(PERMISSIONS_KEY, controller.removeLesson)).toEqual([Permission.CONTENT_DELETE]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. AUTHORIZATION BOUNDARY ENFORCEMENT VIA PERMISSIONSGUARD
  // ─────────────────────────────────────────────────────────────────────────────
  describe('RBAC & PermissionsGuard Boundary Checks', () => {
    it('denies learner (Role.USER) access to create program', () => {
      const ctx = createMockContext(controller.create, { role: Role.USER, sub: 'learner-1' });
      expect(() => permissionsGuard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('denies manager (Role.MANAGER) access to create program', () => {
      const ctx = createMockContext(controller.create, { role: Role.MANAGER, sub: 'mgr-1' });
      expect(() => permissionsGuard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('allows ADMIN to create program', () => {
      const ctx = createMockContext(controller.create, { role: Role.ADMIN, sub: 'admin-1' });
      expect(permissionsGuard.canActivate(ctx)).toBe(true);
    });

    it('allows SUPER_ADMIN to create program universally', () => {
      const ctx = createMockContext(controller.create, { role: Role.SUPER_ADMIN, sub: 'super-1' });
      expect(permissionsGuard.canActivate(ctx)).toBe(true);
    });

    it('denies learner access to reorder steps', () => {
      const ctx = createMockContext(controller.reorderSteps, { role: Role.USER, sub: 'learner-1' });
      expect(() => permissionsGuard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('denies manager access to reorder steps', () => {
      const ctx = createMockContext(controller.reorderSteps, { role: Role.MANAGER, sub: 'mgr-1' });
      expect(() => permissionsGuard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('allows ADMIN to reorder steps', () => {
      const ctx = createMockContext(controller.reorderSteps, { role: Role.ADMIN, sub: 'admin-1' });
      expect(permissionsGuard.canActivate(ctx)).toBe(true);
    });

    it('denies learner access to preview step', () => {
      const ctx = createMockContext(controller.previewStep, { role: Role.USER, sub: 'learner-1' });
      expect(() => permissionsGuard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('denies manager access to preview step', () => {
      const ctx = createMockContext(controller.previewStep, { role: Role.MANAGER, sub: 'mgr-1' });
      expect(() => permissionsGuard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('allows ADMIN to preview step', () => {
      const ctx = createMockContext(controller.previewStep, { role: Role.ADMIN, sub: 'admin-1' });
      expect(permissionsGuard.canActivate(ctx)).toBe(true);
    });

    it('denies learner access to preview lesson', () => {
      const ctx = createMockContext(controller.previewLesson, { role: Role.USER, sub: 'learner-1' });
      expect(() => permissionsGuard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('denies manager access to reorder lessons', () => {
      const ctx = createMockContext(controller.reorderLessons, { role: Role.MANAGER, sub: 'mgr-1' });
      expect(() => permissionsGuard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('allows ADMIN to reorder lessons', () => {
      const ctx = createMockContext(controller.reorderLessons, { role: Role.ADMIN, sub: 'admin-1' });
      expect(permissionsGuard.canActivate(ctx)).toBe(true);
    });

    it('denies learner access to delete lesson', () => {
      const ctx = createMockContext(controller.removeLesson, { role: Role.USER, sub: 'learner-1' });
      expect(() => permissionsGuard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('allows ADMIN to delete lesson', () => {
      const ctx = createMockContext(controller.removeLesson, { role: Role.ADMIN, sub: 'admin-1' });
      expect(permissionsGuard.canActivate(ctx)).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. CONTROLLER DELEGATION VERIFICATION
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Controller Handler Invocation', () => {
    it('findAll forwards caller role to service for draft filtering', async () => {
      const req = { user: { role: Role.USER } };
      await controller.findAll(req);
      expect(serviceMock.findAll).toHaveBeenCalledWith(Role.USER);
    });

    it('findOne forwards caller role to service', async () => {
      const req = { user: { role: Role.ADMIN } };
      await controller.findOne('prog-1', req);
      expect(serviceMock.findOne).toHaveBeenCalledWith('prog-1', Role.ADMIN);
    });

    it('create calls service.create with body', async () => {
      const dto = { title: 'Test Program', price: 100 };
      await controller.create(dto);
      expect(serviceMock.create).toHaveBeenCalledWith(dto);
    });

    it('reorderSteps calls service.reorderSteps with programId and dto', async () => {
      const dto = { stepIds: ['s1', 's2'] };
      await controller.reorderSteps('prog-1', dto);
      expect(serviceMock.reorderSteps).toHaveBeenCalledWith('prog-1', dto);
    });

    it('completeStep sanitizes score and passes learner user id', async () => {
      const req = { user: { sub: 'learner-99' } };
      await controller.completeStep('s1', 85.6, req);
      expect(serviceMock.completeStep).toHaveBeenCalledWith('s1', 'learner-99', 86);
    });
  });
});
