import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { AuditLogService } from './audit-log.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('Phase 2: AuditLogService - Mandatory Reason & Transactional Logging', () => {
  let service: AuditLogService;
  let prismaMock: {
    auditLog: {
      create: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    prismaMock = {
      auditLog: {
        create: vi.fn(),
      },
      $transaction: vi.fn(),
    };
    service = new AuditLogService(prismaMock as unknown as PrismaService);
  });

  it('successfully writes audit record with required reason', async () => {
    prismaMock.auditLog.create.mockResolvedValueOnce({ id: 'audit-1' });

    const result = await service.log(undefined, {
      actorId: 'admin-1',
      action: 'ATTENDANCE_MANUAL_OVERRIDE',
      entityType: 'Attendance',
      entityId: 'att-123',
      reason: 'Learner was present in physical venue',
      metadata: { previousStatus: 'ABSENT', newStatus: 'PRESENT' },
    });

    expect(result).toEqual({ id: 'audit-1' });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'admin-1',
        action: 'ATTENDANCE_MANUAL_OVERRIDE',
        entity: 'Attendance',
        entityId: 'att-123',
        meta: expect.objectContaining({
          reason: 'Learner was present in physical venue',
          previousStatus: 'ABSENT',
          newStatus: 'PRESENT',
          recordedAtUtc: expect.any(String),
        }),
      },
    });
  });

  it('rejects status-changing audit log when reason is missing or empty', async () => {
    await expect(
      service.log(undefined, {
        actorId: 'manager-1',
        action: 'ATTENDANCE_MANUAL_OVERRIDE',
        entityType: 'Attendance',
        entityId: 'att-123',
        reason: '   ',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it('executes within provided transaction client', async () => {
    const txMock = {
      auditLog: {
        create: vi.fn().mockResolvedValueOnce({ id: 'tx-audit-1' }),
      },
    };

    await service.log(txMock as any, {
      actorId: 'manager-1',
      action: 'ATTENDANCE_RECONCILED',
      entityType: 'Attendance',
      entityId: 'att-999',
      reason: 'Matched email manually',
    });

    expect(txMock.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects step unlock and quiz overrides when reason is missing (PDF Pages 4 & 8)', async () => {
    await expect(
      service.log(undefined, {
        actorId: 'admin-1',
        action: 'STEP_MANUAL_UNLOCKED',
        entityType: 'StepProgress',
        entityId: 'sp-1',
        reason: '',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.log(undefined, {
        actorId: 'admin-1',
        action: 'QUIZ_OVERRIDE',
        entityType: 'Quiz',
        entityId: 'quiz-1',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.log(undefined, {
        actorId: 'admin-1',
        action: 'REFUND_ISSUED',
        entityType: 'Invoice',
        entityId: 'inv-1',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('redacts sensitive credentials (password, token, jwt, secret) from metadata before database insertion', async () => {
    prismaMock.auditLog.create.mockResolvedValueOnce({ id: 'audit-redacted' });

    await service.log(undefined, {
      actorId: 'admin-1',
      action: 'GENERAL_CONFIG_CHANGE',
      entityType: 'SystemConfig',
      entityId: 'cfg-1',
      metadata: {
        safeField: 'active',
        password: 'plainTextPassword123',
        token: 'eyJhbGciOi...',
        nested: {
          secret: 'stripe_sk_test_123',
          normal: 42,
        },
      },
    });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'admin-1',
        action: 'GENERAL_CONFIG_CHANGE',
        entity: 'SystemConfig',
        entityId: 'cfg-1',
        meta: expect.objectContaining({
          safeField: 'active',
          password: '[REDACTED]',
          token: '[REDACTED]',
          nested: {
            secret: '[REDACTED]',
            normal: 42,
          },
          recordedAtUtc: expect.any(String),
        }),
      },
    });
  });
});
