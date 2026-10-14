import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecutionContext, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BatchScopeGuard } from './batch-scope.guard.js';

describe('Phase 2: BatchScopeGuard - Manager Batch Isolation', () => {
  let guard: BatchScopeGuard;
  let reflector: Reflector;
  let prismaMock: {
    batch: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    session: {
      findUnique: ReturnType<typeof vi.fn>;
    };
  };

  const createMockContext = (
    user?: { role?: any; sub?: string; userId?: string; id?: string } | null,
    params: Record<string, any> = {},
    query: Record<string, any> = {},
    body: Record<string, any> = {},
  ): ExecutionContext => {
    const mockRequest = { user, params, query, body };
    return {
      getType: vi.fn().mockReturnValue('http'),
      getClass: vi.fn().mockReturnValue(class MockController {}),
      getHandler: vi.fn().mockReturnValue(function mockHandler() {}),
      switchToHttp: vi.fn().mockReturnValue({
        getRequest: vi.fn().mockReturnValue(mockRequest),
        getResponse: vi.fn().mockReturnValue({}),
        getNext: vi.fn().mockReturnValue({}),
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    reflector = new Reflector();
    prismaMock = {
      batch: { findUnique: vi.fn() },
      session: { findUnique: vi.fn() },
    };
    guard = new BatchScopeGuard(prismaMock as unknown as PrismaService, reflector);
  });

  it('allows SUPER_ADMIN full access across any batch without DB query', async () => {
    const context = createMockContext({ role: Role.SUPER_ADMIN, sub: 'super-admin-1' }, { batchId: 'any-batch' });
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(prismaMock.batch.findUnique).not.toHaveBeenCalled();
  });

  it('allows ADMIN full access across any batch without DB query', async () => {
    const context = createMockContext({ role: Role.ADMIN, sub: 'admin-1' }, { batchId: 'any-batch' });
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(prismaMock.batch.findUnique).not.toHaveBeenCalled();
  });

  it('allows MANAGER access when they are the designated manager of the batch', async () => {
    const managerId = 'manager-123';
    const batchId = 'batch-456';
    prismaMock.batch.findUnique.mockResolvedValueOnce({
      id: batchId,
      managerId,
      trainers: [],
    });

    const context = createMockContext({ role: Role.MANAGER, sub: managerId }, { batchId });
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(prismaMock.batch.findUnique).toHaveBeenCalledWith({
      where: { id: batchId },
      select: expect.any(Object),
    });
  });

  it('REJECTS MANAGER with 403 Forbidden when trying to access another manager batch', async () => {
    const currentManagerId = 'manager-attacker';
    const batchId = 'batch-victim';
    prismaMock.batch.findUnique.mockResolvedValueOnce({
      id: batchId,
      managerId: 'manager-legit',
      trainers: [],
    });

    const context = createMockContext({ role: Role.MANAGER, sub: currentManagerId }, { batchId });
    await expect(guard.canActivate(context)).rejects.toThrow(
      new ForbiddenException('Access denied: You are not assigned to manage this batch'),
    );
  });

  it('resolves batchId from sessionId if batchId is not directly in params', async () => {
    const managerId = 'manager-123';
    const sessionId = 'session-999';
    const batchId = 'batch-456';

    prismaMock.session.findUnique.mockResolvedValueOnce({
      batchId,
    });
    prismaMock.batch.findUnique.mockResolvedValueOnce({
      id: batchId,
      managerId,
      trainers: [],
    });

    const context = createMockContext({ role: Role.MANAGER, sub: managerId }, { sessionId });
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(prismaMock.session.findUnique).toHaveBeenCalledWith({
      where: { id: sessionId },
      select: { batchId: true },
    });
  });

  it('throws NotFoundException if batch does not exist', async () => {
    prismaMock.batch.findUnique.mockResolvedValueOnce(null);
    const context = createMockContext({ role: Role.MANAGER, sub: 'm-1' }, { batchId: 'non-existent' });
    await expect(guard.canActivate(context)).rejects.toThrow(NotFoundException);
  });
});
