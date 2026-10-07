import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { Permission } from '../../config/permissions.config.js';
import {
  PermissionsGuard,
  RequirePermission,
  RequirePermissions,
  PERMISSIONS_KEY,
} from './permissions.guard.js';

describe('D1-027: PermissionsGuard & @RequirePermission() Decorator', () => {
  let guard: PermissionsGuard;
  let reflector: Reflector;

  const createMockContext = (
    user?: { role?: any; id?: string; email?: string } | null,
    type: string = 'http',
  ): ExecutionContext => {
    const mockRequest = { user };
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
    guard = new PermissionsGuard(reflector);
  });

  describe('1. Route Metadata & Context Handling', () => {
    it('allows access when no permission metadata is set on the route', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
      const context = createMockContext({ role: Role.USER });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('allows access when permissions metadata is an empty array', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
      const context = createMockContext({ role: Role.USER });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('bypasses permission checks for WebSocket execution contexts', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Permission.PROGRAMS_CREATE]);
      const context = createMockContext(null, 'ws');

      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('2. Authentication & Role Validation Boundary', () => {
    it('throws ForbiddenException when request has no authenticated user', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Permission.PROGRAMS_READ]);
      const context = createMockContext(null);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow('Access denied: Authentication required');
    });

    it('throws ForbiddenException when user object is undefined in request', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Permission.PROGRAMS_READ]);
      const context = createMockContext(undefined);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow('Access denied: Authentication required');
    });

    it('throws ForbiddenException when user has no role defined', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Permission.PROGRAMS_READ]);
      const context = createMockContext({ id: 'user-1' } as any);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow('Access denied: User has no assigned role');
    });

    it('throws ForbiddenException when user has an invalid/unrecognized role', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Permission.PROGRAMS_READ]);
      const context = createMockContext({ role: 'UNKNOWN_ROLE' });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow('Access denied: Insufficient permissions');
    });
  });

  describe('3. SUPER_ADMIN Universal Bypass', () => {
    it('universally allows SUPER_ADMIN for any single permission', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Permission.PROGRAMS_CREATE]);
      const context = createMockContext({ role: Role.SUPER_ADMIN });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('allows SUPER_ADMIN for exclusive permissions like USERS_EDIT_ROLE', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Permission.USERS_EDIT_ROLE]);
      const context = createMockContext({ role: Role.SUPER_ADMIN });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('allows SUPER_ADMIN when role is passed as string representation', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Permission.CERTIFICATES_REVOKE]);
      const context = createMockContext({ role: 'SUPER_ADMIN' });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('allows SUPER_ADMIN when multiple permissions are required simultaneously', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([
        Permission.PROGRAMS_CREATE,
        Permission.PAYMENTS_REFUND,
        Permission.USERS_EDIT_ROLE,
        Permission.AUDIT_EXPORT,
      ]);
      const context = createMockContext({ role: Role.SUPER_ADMIN });

      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('4. ADMIN Role Permission Enforcement', () => {
    it('allows ADMIN access to authorized administrative operations', () => {
      const allowedAdminPermissions = [
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

      for (const perm of allowedAdminPermissions) {
        vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([perm]);
        const context = createMockContext({ role: Role.ADMIN });
        expect(guard.canActivate(context)).toBe(true);
      }
    });

    it('denies ADMIN access to SUPER_ADMIN-exclusive USERS_EDIT_ROLE', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Permission.USERS_EDIT_ROLE]);
      const context = createMockContext({ role: Role.ADMIN });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow('Access denied: Insufficient permissions');
    });
  });

  describe('5. MANAGER Role Permission Enforcement', () => {
    it('allows MANAGER access to trainer and cohort management operations', () => {
      const allowedManagerPermissions = [
        Permission.STEPS_UNLOCK,
        Permission.STEPS_LOCK,
        Permission.CONTENT_UNLOCK,
        Permission.QUIZZES_GRADE,
        Permission.QUIZZES_RESET_ATTEMPTS,
        Permission.SESSIONS_CREATE,
        Permission.SESSIONS_UPDATE,
        Permission.ATTENDANCE_MARK,
        Permission.ATTENDANCE_CORRECT,
        Permission.ORAL_ASSESSMENTS_GRADE,
        Permission.ORAL_ASSESSMENTS_REVIEW,
        Permission.BATCHES_ANNOUNCEMENT,
        Permission.BATCHES_READ_ASSIGNED,
        Permission.ENROLMENTS_READ_ASSIGNED,
        Permission.USERS_READ_ASSIGNED,
        Permission.CHAT_REPLY,
      ];

      for (const perm of allowedManagerPermissions) {
        vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([perm]);
        const context = createMockContext({ role: Role.MANAGER });
        expect(guard.canActivate(context)).toBe(true);
      }
    });

    it('denies MANAGER access to administrative mutations and authoring', () => {
      const deniedManagerPermissions = [
        Permission.PROGRAMS_CREATE,
        Permission.PROGRAMS_DELETE,
        Permission.PROGRAMS_PUBLISH,
        Permission.CONTENT_CREATE,
        Permission.CONTENT_UPLOAD,
        Permission.QUIZZES_CREATE,
        Permission.BATCHES_CREATE,
        Permission.BATCHES_DELETE,
        Permission.BATCHES_ARCHIVE,
        Permission.CERTIFICATES_APPROVE,
        Permission.CERTIFICATES_ISSUE,
        Permission.CERTIFICATES_REVOKE,
        Permission.PAYMENTS_READ,
        Permission.PAYMENTS_REFUND,
        Permission.USERS_CREATE,
        Permission.USERS_DELETE,
        Permission.USERS_EDIT_ROLE,
        Permission.AUDIT_READ,
      ];

      for (const perm of deniedManagerPermissions) {
        vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([perm]);
        const context = createMockContext({ role: Role.MANAGER });
        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
        expect(() => guard.canActivate(context)).toThrow('Access denied: Insufficient permissions');
      }
    });
  });

  describe('6. USER Role Permission Enforcement', () => {
    it('allows USER access to learner-facing capabilities', () => {
      const allowedUserPermissions = [
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

      for (const perm of allowedUserPermissions) {
        vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([perm]);
        const context = createMockContext({ role: Role.USER });
        expect(guard.canActivate(context)).toBe(true);
      }
    });

    it('denies USER access to administrative, authoring, and grading operations', () => {
      const deniedUserPermissions = [
        Permission.PROGRAMS_CREATE,
        Permission.STEPS_UNLOCK,
        Permission.CONTENT_UNLOCK,
        Permission.QUIZZES_GRADE,
        Permission.QUIZZES_RESET_ATTEMPTS,
        Permission.BATCHES_CREATE,
        Permission.BATCHES_ANNOUNCEMENT,
        Permission.ATTENDANCE_MARK,
        Permission.ATTENDANCE_CORRECT,
        Permission.ORAL_ASSESSMENTS_GRADE,
        Permission.CERTIFICATES_APPROVE,
        Permission.CERTIFICATES_ISSUE,
        Permission.USERS_CREATE,
        Permission.USERS_EDIT_ROLE,
        Permission.REPORTS_READ,
        Permission.AUDIT_READ,
      ];

      for (const perm of deniedUserPermissions) {
        vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([perm]);
        const context = createMockContext({ role: Role.USER });
        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
        expect(() => guard.canActivate(context)).toThrow('Access denied: Insufficient permissions');
      }
    });
  });

  describe('7. Multiple Required Permissions (AND Semantics)', () => {
    it('allows access when user possesses ALL required permissions', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([
        Permission.PROGRAMS_READ,
        Permission.STEPS_READ,
        Permission.CONTENT_READ,
      ]);
      const context = createMockContext({ role: Role.USER });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('denies access when user possesses some but not all required permissions', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([
        Permission.PROGRAMS_READ,
        Permission.STEPS_READ,
        Permission.STEPS_UNLOCK, // USER lacks STEPS_UNLOCK
      ]);
      const context = createMockContext({ role: Role.USER });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('allows MANAGER when all manager permissions are met', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([
        Permission.STEPS_UNLOCK,
        Permission.ATTENDANCE_CORRECT,
        Permission.ORAL_ASSESSMENTS_GRADE,
      ]);
      const context = createMockContext({ role: Role.MANAGER });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('denies MANAGER when even one administrative permission is included', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([
        Permission.STEPS_UNLOCK,
        Permission.ATTENDANCE_CORRECT,
        Permission.PROGRAMS_CREATE, // MANAGER lacks PROGRAMS_CREATE
      ]);
      const context = createMockContext({ role: Role.MANAGER });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('denies ADMIN when USERS_EDIT_ROLE is among multiple permissions', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([
        Permission.PROGRAMS_CREATE,
        Permission.BATCHES_CREATE,
        Permission.USERS_EDIT_ROLE, // ADMIN lacks USERS_EDIT_ROLE
      ]);
      const context = createMockContext({ role: Role.ADMIN });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('8. @RequirePermission() Decorator Metadata Attachment', () => {
    it('correctly sets single permission metadata on target function', () => {
      class TestController {
        @RequirePermission(Permission.PROGRAMS_CREATE)
        testMethod() {}
      }

      const instance = new TestController();
      const metadata = Reflect.getMetadata(PERMISSIONS_KEY, instance.testMethod);
      expect(metadata).toEqual([Permission.PROGRAMS_CREATE]);
    });

    it('correctly sets multiple permissions metadata on target function', () => {
      class TestController {
        @RequirePermission(Permission.STEPS_READ, Permission.STEPS_UNLOCK)
        testMethod() {}
      }

      const instance = new TestController();
      const metadata = Reflect.getMetadata(PERMISSIONS_KEY, instance.testMethod);
      expect(metadata).toEqual([Permission.STEPS_READ, Permission.STEPS_UNLOCK]);
    });

    it('correctly sets permissions on class level with RequirePermissions alias', () => {
      @RequirePermissions(Permission.PROGRAMS_READ)
      class TestController {}

      const metadata = Reflect.getMetadata(PERMISSIONS_KEY, TestController);
      expect(metadata).toEqual([Permission.PROGRAMS_READ]);
    });
  });
});
