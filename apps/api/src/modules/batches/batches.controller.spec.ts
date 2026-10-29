import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { BatchesController } from './batches.controller.js';
import { BatchesService } from './batches.service.js';
import { PermissionsGuard, PERMISSIONS_KEY } from '../../common/guards/permissions.guard.js';
import {
  BatchAccessGuard,
  BATCH_ACCESS_PARAM_KEY,
} from '../../common/guards/batch-access.guard.js';
import { Permission } from '../../config/permissions.config.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('D1-031: BatchesController & Authorization Tests', () => {
  let controller: BatchesController;
  let serviceMock: any;
  let reflector: Reflector;
  let permissionsGuard: PermissionsGuard;
  let batchAccessGuard: BatchAccessGuard;
  let prismaMock: any;

  beforeEach(() => {
    serviceMock = {
      findAll: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue({ id: 'b-1' }),
      create: vi.fn().mockResolvedValue({ id: 'b-1' }),
      update: vi.fn().mockResolvedValue({ id: 'b-1' }),
      transitionStatus: vi.fn().mockResolvedValue({ id: 'b-1' }),
      assignTrainer: vi.fn().mockResolvedValue({ assigned: true }),
      removeTrainer: vi.fn().mockResolvedValue({ removed: true }),
      remove: vi.fn().mockResolvedValue({ deleted: true }),
    };

    prismaMock = {
      batch: {
        findUnique: vi.fn(),
      },
    };

    controller = new BatchesController(serviceMock as unknown as BatchesService);
    reflector = new Reflector();
    permissionsGuard = new PermissionsGuard(reflector);
    batchAccessGuard = new BatchAccessGuard(prismaMock as unknown as PrismaService, reflector);
  });

  const createMockContext = (
    handler: Function,
    user?: { role: Role; sub?: string } | null,
    params: Record<string, any> = {},
  ): ExecutionContext => {
    return {
      getType: () => 'http',
      getHandler: () => handler,
      getClass: () => BatchesController,
      switchToHttp: () => ({
        getRequest: () => ({ user, params, query: {}, body: {} }),
      }),
    } as unknown as ExecutionContext;
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. ROUTE METADATA & PERMISSION ANNOTATIONS
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Route Metadata & Security Annotations', () => {
    it('read endpoints require BATCHES_READ', () => {
      expect(reflector.get(PERMISSIONS_KEY, controller.findAll)).toEqual([Permission.BATCHES_READ]);
      expect(reflector.get(PERMISSIONS_KEY, controller.findOne)).toEqual([Permission.BATCHES_READ]);
    });

    it('mutation endpoints require appropriate named permissions', () => {
      expect(reflector.get(PERMISSIONS_KEY, controller.create)).toEqual([Permission.BATCHES_CREATE]);
      expect(reflector.get(PERMISSIONS_KEY, controller.update)).toEqual([Permission.BATCHES_UPDATE]);
      expect(reflector.get(PERMISSIONS_KEY, controller.transitionStatus)).toEqual([Permission.BATCHES_UPDATE]);
      expect(reflector.get(PERMISSIONS_KEY, controller.remove)).toEqual([Permission.BATCHES_DELETE]);
    });

    it('trainer assignment endpoints require BATCHES_ASSIGN_TRAINER', () => {
      expect(reflector.get(PERMISSIONS_KEY, controller.assignTrainer)).toEqual([Permission.BATCHES_ASSIGN_TRAINER]);
      expect(reflector.get(PERMISSIONS_KEY, controller.removeTrainer)).toEqual([Permission.BATCHES_ASSIGN_TRAINER]);
    });

    it('findOne has RequireBatchAccess metadata set to id parameter', () => {
      expect(reflector.get(BATCH_ACCESS_PARAM_KEY, controller.findOne)).toBe('id');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. PERMISSIONSGUARD RBAC ENFORCEMENT
  // ─────────────────────────────────────────────────────────────────────────────
  describe('RBAC & PermissionsGuard Boundary Checks', () => {
    it('denies learner (Role.USER) on all batch management endpoints', () => {
      const learner = { role: Role.USER, sub: 'learner-1' };

      expect(() => permissionsGuard.canActivate(createMockContext(controller.findAll, learner))).toThrow(ForbiddenException);
      expect(() => permissionsGuard.canActivate(createMockContext(controller.findOne, learner))).toThrow(ForbiddenException);
      expect(() => permissionsGuard.canActivate(createMockContext(controller.create, learner))).toThrow(ForbiddenException);
      expect(() => permissionsGuard.canActivate(createMockContext(controller.update, learner))).toThrow(ForbiddenException);
      expect(() => permissionsGuard.canActivate(createMockContext(controller.assignTrainer, learner))).toThrow(ForbiddenException);
      expect(() => permissionsGuard.canActivate(createMockContext(controller.remove, learner))).toThrow(ForbiddenException);
    });

    it('allows manager (Role.MANAGER) to read batches', () => {
      const manager = { role: Role.MANAGER, sub: 'mgr-1' };
      expect(permissionsGuard.canActivate(createMockContext(controller.findAll, manager))).toBe(true);
      expect(permissionsGuard.canActivate(createMockContext(controller.findOne, manager))).toBe(true);
    });

    it('denies manager (Role.MANAGER) from mutating, assigning trainers or deleting batches', () => {
      const manager = { role: Role.MANAGER, sub: 'mgr-1' };

      expect(() => permissionsGuard.canActivate(createMockContext(controller.create, manager))).toThrow(ForbiddenException);
      expect(() => permissionsGuard.canActivate(createMockContext(controller.update, manager))).toThrow(ForbiddenException);
      expect(() => permissionsGuard.canActivate(createMockContext(controller.transitionStatus, manager))).toThrow(ForbiddenException);
      expect(() => permissionsGuard.canActivate(createMockContext(controller.assignTrainer, manager))).toThrow(ForbiddenException);
      expect(() => permissionsGuard.canActivate(createMockContext(controller.removeTrainer, manager))).toThrow(ForbiddenException);
      expect(() => permissionsGuard.canActivate(createMockContext(controller.remove, manager))).toThrow(ForbiddenException);
    });

    it('allows ADMIN and SUPER_ADMIN full access to all endpoints', () => {
      const admin = { role: Role.ADMIN, sub: 'admin-1' };
      const superAdmin = { role: Role.SUPER_ADMIN, sub: 'super-1' };

      expect(permissionsGuard.canActivate(createMockContext(controller.create, admin))).toBe(true);
      expect(permissionsGuard.canActivate(createMockContext(controller.assignTrainer, admin))).toBe(true);
      expect(permissionsGuard.canActivate(createMockContext(controller.remove, admin))).toBe(true);

      expect(permissionsGuard.canActivate(createMockContext(controller.create, superAdmin))).toBe(true);
      expect(permissionsGuard.canActivate(createMockContext(controller.remove, superAdmin))).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. BATCHACCESSGUARD INTEGRATION
  // ─────────────────────────────────────────────────────────────────────────────
  describe('BatchAccessGuard Scoping on findOne', () => {
    it('allows manager assigned directly via managerId', async () => {
      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'b-1',
        managerId: 'mgr-1',
        trainers: [],
      });

      const ctx = createMockContext(controller.findOne, { role: Role.MANAGER, sub: 'mgr-1' }, { id: 'b-1' });
      await expect(batchAccessGuard.canActivate(ctx)).resolves.toBe(true);
    });

    it('allows manager assigned via BatchTrainer relation', async () => {
      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'b-1',
        managerId: 'other-lead',
        trainers: [{ id: 'bt-1', trainerId: 'mgr-1' }],
      });

      const ctx = createMockContext(controller.findOne, { role: Role.MANAGER, sub: 'mgr-1' }, { id: 'b-1' });
      await expect(batchAccessGuard.canActivate(ctx)).resolves.toBe(true);
    });

    it('denies manager not assigned to the batch', async () => {
      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'b-1',
        managerId: 'other-lead',
        trainers: [{ id: 'bt-1', trainerId: 'other-trainer' }],
      });

      const ctx = createMockContext(controller.findOne, { role: Role.MANAGER, sub: 'unassigned-mgr' }, { id: 'b-1' });
      await expect(batchAccessGuard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('allows ADMIN to access any batch unconditionally', async () => {
      const ctx = createMockContext(controller.findOne, { role: Role.ADMIN, sub: 'admin-1' }, { id: 'b-999' });
      await expect(batchAccessGuard.canActivate(ctx)).resolves.toBe(true);
      expect(prismaMock.batch.findUnique).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. CONTROLLER DELEGATION
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Controller Handler Invocation', () => {
    it('findAll forwards req.user and query', async () => {
      const req = { user: { role: Role.ADMIN } };
      const query = { programId: 'p-1' };
      await controller.findAll(req, query);
      expect(serviceMock.findAll).toHaveBeenCalledWith(req.user, query);
    });

    it('create calls service.create with dto', async () => {
      const dto = { name: 'New Cohort', programId: 'p-1', startDate: '2026-11-01', capacity: 20 };
      const req = { user: { id: 'u-1' } };
      await controller.create(dto as any, req as any);
      expect(serviceMock.create).toHaveBeenCalledWith(dto, 'u-1');
    });

    it('assignTrainer calls service.assignTrainer with id and dto', async () => {
      const dto = { trainerId: 'tr-1' };
      await controller.assignTrainer('b-1', dto);
      expect(serviceMock.assignTrainer).toHaveBeenCalledWith('b-1', dto);
    });

    it('removeTrainer calls service.removeTrainer with id and trainerId', async () => {
      await controller.removeTrainer('b-1', 'tr-1');
      expect(serviceMock.removeTrainer).toHaveBeenCalledWith('b-1', 'tr-1');
    });

    it('transitionStatus calls service.transitionStatus with id and dto', async () => {
      const dto = { status: 'ACTIVE' as any };
      const req = { user: { id: 'u-1' } };
      await controller.transitionStatus('b-1', dto, req as any);
      expect(serviceMock.transitionStatus).toHaveBeenCalledWith('b-1', dto, 'u-1');
    });
  });
});
