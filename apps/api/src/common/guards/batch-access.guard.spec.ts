import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  BatchAccessGuard,
  RequireBatchAccess,
  BatchAccess,
  BATCH_ACCESS_PARAM_KEY,
  isManagerAssignedToBatch,
} from './batch-access.guard.js';

describe('D1-028: BatchAccessGuard - Manager / Trainer Batch Scoping', () => {
  let guard: BatchAccessGuard;
  let reflector: Reflector;
  let prismaMock: {
    batch: {
      findUnique: ReturnType<typeof vi.fn>;
    };
  };

  const createMockContext = (
    user?: { role?: any; sub?: string; userId?: string; id?: string; email?: string } | null,
    params: Record<string, any> = {},
    query: Record<string, any> = {},
    body: Record<string, any> = {},
    type: string = 'http',
  ): ExecutionContext => {
    const mockRequest = { user, params, query, body };
    return {
      getType: vi.fn().mockReturnValue(type),
      getClass: vi.fn().mockReturnValue(class MockController {}),
      getHandler: vi.fn().mockReturnValue(function mockHandler() {}),
      switchToHttp: vi.fn().mockReturnValue({
        getRequest: vi.fn().mockReturnValue(mockRequest),
        getResponse: vi.fn().mockReturnValue({}),
        getNext: vi.fn().mockReturnValue({}),
      }),
      switchToRpc: vi.fn(),
      switchToWs: vi.fn(),
      getArgs: vi.fn(),
      getArgByIndex: vi.fn(),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    reflector = new Reflector();
    prismaMock = {
      batch: {
        findUnique: vi.fn(),
      },
    };
    guard = new BatchAccessGuard(
      prismaMock as unknown as PrismaService,
      reflector,
    );
  });

  describe('1. Platform Administrative Access (SUPER_ADMIN & ADMIN)', () => {
    it('allows SUPER_ADMIN unrestricted access to any batch without DB query', async () => {
      const context = createMockContext(
        { role: Role.SUPER_ADMIN, sub: 'super-1' },
        { id: 'batch-any-123' },
      );

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      expect(prismaMock.batch.findUnique).not.toHaveBeenCalled();
    });

    it('allows ADMIN unrestricted access to any batch without DB query', async () => {
      const context = createMockContext(
        { role: Role.ADMIN, sub: 'admin-1' },
        { batchId: 'batch-any-456' },
      );

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      expect(prismaMock.batch.findUnique).not.toHaveBeenCalled();
    });

    it('allows string representation of SUPER_ADMIN and ADMIN', async () => {
      const superCtx = createMockContext(
        { role: 'SUPER_ADMIN', sub: 'super-str' },
        { id: 'b-1' },
      );
      const adminCtx = createMockContext(
        { role: 'ADMIN', sub: 'admin-str' },
        { id: 'b-2' },
      );

      expect(await guard.canActivate(superCtx)).toBe(true);
      expect(await guard.canActivate(adminCtx)).toBe(true);
      expect(prismaMock.batch.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('2. Authentication & Non-Manager Role Boundaries', () => {
    it('throws ForbiddenException when request has no authenticated user', async () => {
      const context = createMockContext(null, { id: 'batch-1' });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(context)).rejects.toThrow('Access denied: Authentication required');
    });

    it('throws ForbiddenException when user has role USER (Learner)', async () => {
      const context = createMockContext(
        { role: Role.USER, sub: 'learner-1' },
        { id: 'batch-1' },
      );

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Access denied: Role does not have batch management access',
      );
    });

    it('throws ForbiddenException when manager sub/userId is missing from user object', async () => {
      const context = createMockContext(
        { role: Role.MANAGER },
        { id: 'batch-1' },
      );

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Access denied: Authenticated user identifier missing',
      );
    });
  });

  describe('3. Batch ID Resolution & Parameter Extraction', () => {
    it('throws BadRequestException when no batch ID is provided anywhere in the request', async () => {
      const context = createMockContext(
        { role: Role.MANAGER, sub: 'mgr-1' },
        {},
        {},
        {},
      );

      await expect(guard.canActivate(context)).rejects.toThrow(BadRequestException);
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Batch ID is required for batch scoping verification',
      );
    });

    it('resolves batch ID from params.batchId', async () => {
      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'batch-p1',
        managerId: 'mgr-1',
        trainers: [],
      });

      const context = createMockContext(
        { role: Role.MANAGER, sub: 'mgr-1' },
        { batchId: 'batch-p1' },
      );

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      expect(prismaMock.batch.findUnique).toHaveBeenCalledWith({
        where: { id: 'batch-p1' },
        select: expect.any(Object),
      });
    });

    it('resolves batch ID from params.id as fallback', async () => {
      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'batch-p2',
        managerId: 'mgr-1',
        trainers: [],
      });

      const context = createMockContext(
        { role: Role.MANAGER, sub: 'mgr-1' },
        { id: 'batch-p2' },
      );

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      expect(prismaMock.batch.findUnique).toHaveBeenCalledWith({
        where: { id: 'batch-p2' },
        select: expect.any(Object),
      });
    });

    it('resolves batch ID from query.batchId', async () => {
      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'batch-q1',
        managerId: 'mgr-1',
        trainers: [],
      });

      const context = createMockContext(
        { role: Role.MANAGER, sub: 'mgr-1' },
        {},
        { batchId: 'batch-q1' },
      );

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      expect(prismaMock.batch.findUnique).toHaveBeenCalledWith({
        where: { id: 'batch-q1' },
        select: expect.any(Object),
      });
    });

    it('resolves batch ID from body.batchId', async () => {
      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'batch-b1',
        managerId: 'mgr-1',
        trainers: [],
      });

      const context = createMockContext(
        { role: Role.MANAGER, sub: 'mgr-1' },
        {},
        {},
        { batchId: 'batch-b1' },
      );

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      expect(prismaMock.batch.findUnique).toHaveBeenCalledWith({
        where: { id: 'batch-b1' },
        select: expect.any(Object),
      });
    });

    it('resolves batch ID from custom parameter key specified by @RequireBatchAccess decorator', async () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue('cohortId');

      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'cohort-custom-99',
        managerId: 'mgr-1',
        trainers: [],
      });

      const context = createMockContext(
        { role: Role.MANAGER, sub: 'mgr-1' },
        { cohortId: 'cohort-custom-99' },
      );

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      expect(prismaMock.batch.findUnique).toHaveBeenCalledWith({
        where: { id: 'cohort-custom-99' },
        select: expect.any(Object),
      });
    });
  });

  describe('4. Manager & Trainer Batch Assignment Scoping Logic', () => {
    it('allows MANAGER assigned directly via Batch.managerId', async () => {
      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'batch-101',
        managerId: 'mgr-alice',
        trainers: [],
      });

      const context = createMockContext(
        { role: Role.MANAGER, sub: 'mgr-alice' },
        { id: 'batch-101' },
      );

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('allows MANAGER / Trainer assigned via BatchTrainer relation table', async () => {
      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'batch-102',
        managerId: 'mgr-lead',
        trainers: [{ id: 'bt-1', trainerId: 'trainer-bob' }],
      });

      const context = createMockContext(
        { role: Role.MANAGER, sub: 'trainer-bob' },
        { id: 'batch-102' },
      );

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('denies MANAGER when batch exists but manager is NOT assigned in managerId or trainers', async () => {
      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'batch-103',
        managerId: 'mgr-charlie',
        trainers: [{ id: 'bt-2', trainerId: 'trainer-dave' }],
      });

      const context = createMockContext(
        { role: Role.MANAGER, sub: 'mgr-eve-unassigned' },
        { id: 'batch-103' },
      );

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Access denied: You are not assigned to this batch',
      );
    });

    it('denies MANAGER assigned to Batch A attempting to access Batch B', async () => {
      // Manager is assigned to Batch A ('batch-A'), but requests Batch B ('batch-B')
      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'batch-B',
        managerId: 'mgr-other',
        trainers: [],
      });

      const context = createMockContext(
        { role: Role.MANAGER, sub: 'mgr-assigned-only-to-A' },
        { id: 'batch-B' },
      );

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Access denied: You are not assigned to this batch',
      );
    });

    it('throws NotFoundException when batch does not exist in database', async () => {
      prismaMock.batch.findUnique.mockResolvedValue(null);

      const context = createMockContext(
        { role: Role.MANAGER, sub: 'mgr-1' },
        { id: 'nonexistent-batch-id' },
      );

      await expect(guard.canActivate(context)).rejects.toThrow(NotFoundException);
      await expect(guard.canActivate(context)).rejects.toThrow('Batch not found');
    });
  });

  describe('5. Security: Client Parameter Spoofing Prevention', () => {
    it('prevents bypass when client injects a spoofed managerId in request body', async () => {
      // The batch belongs to 'legit-mgr'. The attacker is authenticated as 'attacker-mgr'
      // Attacker passes { managerId: 'legit-mgr' } in the body
      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'batch-target',
        managerId: 'legit-mgr',
        trainers: [],
      });

      const context = createMockContext(
        { role: Role.MANAGER, sub: 'attacker-mgr' }, // Authenticated token identity
        { id: 'batch-target' },
        {},
        { managerId: 'legit-mgr' }, // Spoofed body param
      );

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Access denied: You are not assigned to this batch',
      );

      // Verify the query was performed with the authenticated sub, NOT the spoofed body managerId
      expect(prismaMock.batch.findUnique).toHaveBeenCalledWith({
        where: { id: 'batch-target' },
        select: {
          id: true,
          managerId: true,
          trainers: {
            where: { trainerId: 'attacker-mgr' },
            select: { id: true, trainerId: true },
          },
        },
      });
    });

    it('prevents bypass when client injects a spoofed trainerId in query string', async () => {
      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'batch-target-2',
        managerId: 'lead-mgr',
        trainers: [],
      });

      const context = createMockContext(
        { role: Role.MANAGER, sub: 'attacker-mgr' },
        { id: 'batch-target-2' },
        { trainerId: 'assigned-trainer' }, // Spoofed query param
      );

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('6. Execution Context & Decorators', () => {
    it('bypasses checks for WebSocket execution contexts', async () => {
      const context = createMockContext(null, {}, {}, {}, 'ws');

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      expect(prismaMock.batch.findUnique).not.toHaveBeenCalled();
    });

    it('sets metadata correctly via RequireBatchAccess / BatchAccess decorators', () => {
      class TestController {
        @RequireBatchAccess('customCohort')
        handlerA() {}

        @BatchAccess()
        handlerB() {}
      }

      const instance = new TestController();
      const metaA = Reflect.getMetadata(BATCH_ACCESS_PARAM_KEY, instance.handlerA);
      const metaB = Reflect.getMetadata(BATCH_ACCESS_PARAM_KEY, instance.handlerB);

      expect(metaA).toBe('customCohort');
      expect(metaB).toBe('batchId');
    });
  });

  describe('7. isManagerAssignedToBatch standalone helper function', () => {
    it('returns true when user is direct batch manager', async () => {
      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'b-1',
        managerId: 'u-1',
        trainers: [],
      });

      const result = await isManagerAssignedToBatch(
        prismaMock as unknown as PrismaService,
        'u-1',
        'b-1',
      );
      expect(result).toBe(true);
    });

    it('returns true when user is assigned as batch trainer', async () => {
      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'b-2',
        managerId: 'u-other',
        trainers: [{ id: 'bt-1', trainerId: 'u-trainer' }],
      });

      const result = await isManagerAssignedToBatch(
        prismaMock as unknown as PrismaService,
        'u-trainer',
        'b-2',
      );
      expect(result).toBe(true);
    });

    it('returns false when user is neither manager nor trainer', async () => {
      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'b-3',
        managerId: 'u-other',
        trainers: [],
      });

      const result = await isManagerAssignedToBatch(
        prismaMock as unknown as PrismaService,
        'u-unassigned',
        'b-3',
      );
      expect(result).toBe(false);
    });

    it('returns false when batch is null or inputs are falsy', async () => {
      prismaMock.batch.findUnique.mockResolvedValue(null);

      expect(
        await isManagerAssignedToBatch(
          prismaMock as unknown as PrismaService,
          'u-1',
          'nonexistent',
        ),
      ).toBe(false);

      expect(
        await isManagerAssignedToBatch(
          prismaMock as unknown as PrismaService,
          '',
          'b-1',
        ),
      ).toBe(false);

      expect(
        await isManagerAssignedToBatch(
          prismaMock as unknown as PrismaService,
          'u-1',
          '',
        ),
      ).toBe(false);
    });
  });
});
