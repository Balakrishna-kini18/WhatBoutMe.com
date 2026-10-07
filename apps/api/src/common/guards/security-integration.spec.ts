import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { Permission, ALL_PERMISSIONS } from '../../config/permissions.config.js';
import {
  PermissionsGuard,
  PERMISSIONS_KEY,
} from './permissions.guard.js';
import {
  BatchAccessGuard,
} from './batch-access.guard.js';
import { RolesGuard } from './roles.guard.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('D1-029: End-to-End Authorization & Security Integration Tests', () => {
  let reflector: Reflector;
  let rolesGuard: RolesGuard;
  let permissionsGuard: PermissionsGuard;
  let batchAccessGuard: BatchAccessGuard;
  let prismaMock: {
    batch: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    userSession: {
      updateMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
    };
  };

  const createMockContext = (
    user?: {
      role?: any;
      sub?: string;
      userId?: string;
      id?: string;
      email?: string;
    } | null,
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
      userSession: {
        updateMany: vi.fn(),
        findUnique: vi.fn(),
      },
    };

    rolesGuard = new RolesGuard(reflector);
    permissionsGuard = new PermissionsGuard(reflector);
    batchAccessGuard = new BatchAccessGuard(
      prismaMock as unknown as PrismaService,
      reflector,
    );
  });

  describe('1. Unauthenticated Request Rejection & Fail-Closed Gate', () => {
    it('denies unauthenticated requests at RolesGuard when roles are required', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
        if (key === ROLES_KEY) return [Role.ADMIN, Role.SUPER_ADMIN];
        return undefined;
      });

      const context = createMockContext(null);
      expect(rolesGuard.canActivate(context)).toBe(false);
    });

    it('denies unauthenticated requests at PermissionsGuard with ForbiddenException', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
        if (key === PERMISSIONS_KEY) return [Permission.PROGRAMS_READ];
        return undefined;
      });

      const context = createMockContext(null);
      expect(() => permissionsGuard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => permissionsGuard.canActivate(context)).toThrow(
        'Access denied: Authentication required',
      );
    });

    it('denies unauthenticated requests at BatchAccessGuard with ForbiddenException', async () => {
      const context = createMockContext(null, { id: 'batch-100' });
      await expect(batchAccessGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
      await expect(batchAccessGuard.canActivate(context)).rejects.toThrow(
        'Access denied: Authentication required',
      );
    });
  });

  describe('2. SUPER_ADMIN Universal Authorization', () => {
    it('grants SUPER_ADMIN access across all roles and all 54 platform permissions', () => {
      for (const perm of ALL_PERMISSIONS) {
        vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([perm]);
        const context = createMockContext({ role: Role.SUPER_ADMIN, sub: 'super-admin-1' });

        expect(permissionsGuard.canActivate(context)).toBe(true);
      }
    });

    it('grants SUPER_ADMIN unrestricted batch access to any batch without database lookup', async () => {
      const context = createMockContext(
        { role: Role.SUPER_ADMIN, sub: 'super-admin-1' },
        { batchId: 'any-batch-999' },
      );

      expect(await batchAccessGuard.canActivate(context)).toBe(true);
      expect(prismaMock.batch.findUnique).not.toHaveBeenCalled();
    });

    it('grants SUPER_ADMIN exclusive permissions (USERS_EDIT_ROLE)', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Permission.USERS_EDIT_ROLE]);
      const context = createMockContext({ role: Role.SUPER_ADMIN, sub: 'super-admin-1' });

      expect(permissionsGuard.canActivate(context)).toBe(true);
    });
  });

  describe('3. ADMIN Capabilities and SUPER_ADMIN Boundary Enforcement', () => {
    it('allows ADMIN to perform LMS management operations', () => {
      const adminOperations = [
        Permission.PROGRAMS_CREATE,
        Permission.PROGRAMS_PUBLISH,
        Permission.CONTENT_UPLOAD,
        Permission.BATCHES_CREATE,
        Permission.BATCHES_ARCHIVE,
        Permission.CERTIFICATES_APPROVE,
        Permission.PAYMENTS_REFUND,
        Permission.AUDIT_EXPORT,
        Permission.USERS_DELETE,
      ];

      for (const perm of adminOperations) {
        vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([perm]);
        const context = createMockContext({ role: Role.ADMIN, sub: 'admin-1' });
        expect(permissionsGuard.canActivate(context)).toBe(true);
      }
    });

    it('strictly denies ADMIN from performing SUPER_ADMIN-exclusive role alterations', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Permission.USERS_EDIT_ROLE]);
      const context = createMockContext({ role: Role.ADMIN, sub: 'admin-1' });

      expect(() => permissionsGuard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => permissionsGuard.canActivate(context)).toThrow(
        'Access denied: Insufficient permissions',
      );
    });

    it('allows ADMIN platform-wide batch access across all batches', async () => {
      const context = createMockContext(
        { role: Role.ADMIN, sub: 'admin-1' },
        { id: 'batch-target-abc' },
      );

      expect(await batchAccessGuard.canActivate(context)).toBe(true);
      expect(prismaMock.batch.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('4. MANAGER Role Scoping & Cohort Isolation Enforcement', () => {
    it('allows MANAGER trainer operations', () => {
      const managerOperations = [
        Permission.STEPS_UNLOCK,
        Permission.STEPS_LOCK,
        Permission.CONTENT_UNLOCK,
        Permission.QUIZZES_GRADE,
        Permission.QUIZZES_RESET_ATTEMPTS,
        Permission.ATTENDANCE_MARK,
        Permission.ATTENDANCE_CORRECT,
        Permission.ORAL_ASSESSMENTS_GRADE,
        Permission.BATCHES_ANNOUNCEMENT,
        Permission.BATCHES_READ_ASSIGNED,
      ];

      for (const perm of managerOperations) {
        vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([perm]);
        const context = createMockContext({ role: Role.MANAGER, sub: 'mgr-1' });
        expect(permissionsGuard.canActivate(context)).toBe(true);
      }
    });

    it('denies MANAGER administrative platform mutations', () => {
      const administrativeMutations = [
        Permission.PROGRAMS_CREATE,
        Permission.PROGRAMS_DELETE,
        Permission.CONTENT_CREATE,
        Permission.CONTENT_UPLOAD,
        Permission.BATCHES_CREATE,
        Permission.BATCHES_DELETE,
        Permission.CERTIFICATES_APPROVE,
        Permission.PAYMENTS_REFUND,
        Permission.USERS_CREATE,
        Permission.USERS_DELETE,
        Permission.USERS_EDIT_ROLE,
      ];

      for (const perm of administrativeMutations) {
        vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([perm]);
        const context = createMockContext({ role: Role.MANAGER, sub: 'mgr-1' });
        expect(() => permissionsGuard.canActivate(context)).toThrow(ForbiddenException);
      }
    });

    it('allows MANAGER to access their assigned batch (via Batch.managerId)', async () => {
      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'batch-alpha',
        managerId: 'mgr-assigned',
        trainers: [],
      });

      const context = createMockContext(
        { role: Role.MANAGER, sub: 'mgr-assigned' },
        { id: 'batch-alpha' },
      );

      expect(await batchAccessGuard.canActivate(context)).toBe(true);
    });

    it('allows MANAGER to access their assigned batch (via BatchTrainer relation)', async () => {
      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'batch-beta',
        managerId: 'mgr-lead',
        trainers: [{ id: 'bt-1', trainerId: 'mgr-assigned-trainer' }],
      });

      const context = createMockContext(
        { role: Role.MANAGER, sub: 'mgr-assigned-trainer' },
        { id: 'batch-beta' },
      );

      expect(await batchAccessGuard.canActivate(context)).toBe(true);
    });

    it('denies MANAGER from accessing an unassigned batch (Manager assigned to Batch A, requests Batch B)', async () => {
      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'batch-B',
        managerId: 'mgr-owner-B',
        trainers: [{ id: 'bt-2', trainerId: 'trainer-other' }],
      });

      const context = createMockContext(
        { role: Role.MANAGER, sub: 'mgr-assigned-only-to-A' },
        { id: 'batch-B' },
      );

      await expect(batchAccessGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
      await expect(batchAccessGuard.canActivate(context)).rejects.toThrow(
        'Access denied: You are not assigned to this batch',
      );
    });
  });

  describe('5. USER (Learner) Role Boundary Enforcement', () => {
    it('allows USER learner-facing operations', () => {
      const learnerOperations = [
        Permission.PROGRAMS_READ,
        Permission.STEPS_READ,
        Permission.CONTENT_READ,
        Permission.QUIZZES_READ,
        Permission.SESSIONS_READ,
        Permission.SESSIONS_BOOK,
        Permission.SESSIONS_CANCEL,
        Permission.ATTENDANCE_READ,
        Permission.ORAL_ASSESSMENTS_READ,
        Permission.CERTIFICATES_READ,
        Permission.AGREEMENTS_READ,
        Permission.AGREEMENTS_SIGN,
        Permission.INVOICES_READ,
        Permission.CHAT_READ,
        Permission.CHAT_SEND,
      ];

      for (const perm of learnerOperations) {
        vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([perm]);
        const context = createMockContext({ role: Role.USER, sub: 'learner-1' });
        expect(permissionsGuard.canActivate(context)).toBe(true);
      }
    });

    it('strictly denies USER access to all administrative, override, and grading operations', () => {
      const privilegedOperations = [
        Permission.PROGRAMS_CREATE,
        Permission.STEPS_UNLOCK,
        Permission.CONTENT_UNLOCK,
        Permission.QUIZZES_GRADE,
        Permission.QUIZZES_RESET_ATTEMPTS,
        Permission.BATCHES_CREATE,
        Permission.ATTENDANCE_MARK,
        Permission.ATTENDANCE_CORRECT,
        Permission.ORAL_ASSESSMENTS_GRADE,
        Permission.CERTIFICATES_APPROVE,
        Permission.CERTIFICATES_ISSUE,
        Permission.PAYMENTS_REFUND,
        Permission.USERS_CREATE,
        Permission.USERS_EDIT_ROLE,
      ];

      for (const perm of privilegedOperations) {
        vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([perm]);
        const context = createMockContext({ role: Role.USER, sub: 'learner-1' });
        expect(() => permissionsGuard.canActivate(context)).toThrow(ForbiddenException);
      }
    });

    it('denies USER from batch management scoping guard', async () => {
      const context = createMockContext(
        { role: Role.USER, sub: 'learner-1' },
        { id: 'batch-1' },
      );

      await expect(batchAccessGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
      await expect(batchAccessGuard.canActivate(context)).rejects.toThrow(
        'Access denied: Role does not have batch management access',
      );
    });
  });

  describe('6. Multiple Required Permissions (AND Semantics) Integration', () => {
    it('allows access when authenticated user possesses ALL required permissions', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([
        Permission.STEPS_UNLOCK,
        Permission.ATTENDANCE_CORRECT,
        Permission.ORAL_ASSESSMENTS_GRADE,
      ]);

      const context = createMockContext({ role: Role.MANAGER, sub: 'mgr-1' });
      expect(permissionsGuard.canActivate(context)).toBe(true);
    });

    it('denies access when user possesses some permissions but lacks even one required permission', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([
        Permission.STEPS_UNLOCK,
        Permission.ATTENDANCE_CORRECT,
        Permission.PROGRAMS_CREATE, // MANAGER lacks PROGRAMS_CREATE
      ]);

      const context = createMockContext({ role: Role.MANAGER, sub: 'mgr-1' });
      expect(() => permissionsGuard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('7. Security: Request Parameter Tampering & Spoofing Immunity', () => {
    it('ignores client-supplied managerId in request body to prevent privilege escalation', async () => {
      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'batch-target',
        managerId: 'victim-manager',
        trainers: [],
      });

      // Attacker is logged in as 'attacker-manager' but supplies { managerId: 'victim-manager' } in body
      const context = createMockContext(
        { role: Role.MANAGER, sub: 'attacker-manager' },
        { id: 'batch-target' },
        {},
        { managerId: 'victim-manager' },
      );

      await expect(batchAccessGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
      expect(prismaMock.batch.findUnique).toHaveBeenCalledWith({
        where: { id: 'batch-target' },
        select: {
          id: true,
          managerId: true,
          trainers: {
            where: { trainerId: 'attacker-manager' }, // Uses JWT sub, not spoofed body
            select: { id: true, trainerId: true },
          },
        },
      });
    });

    it('fails closed when batch ID does not exist in database', async () => {
      prismaMock.batch.findUnique.mockResolvedValue(null);

      const context = createMockContext(
        { role: Role.MANAGER, sub: 'mgr-1' },
        { id: 'nonexistent-uuid' },
      );

      await expect(batchAccessGuard.canActivate(context)).rejects.toThrow(NotFoundException);
    });
  });
});
