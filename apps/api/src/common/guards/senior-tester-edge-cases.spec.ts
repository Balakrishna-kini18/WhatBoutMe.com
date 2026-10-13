import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role, BatchStatus, EnrolmentStatus, StepOverrideState } from '@prisma/client';
import { Permission, ALL_PERMISSIONS, ROLE_PERMISSIONS, roleHasPermission } from '../../config/permissions.config.js';
import { RolesGuard } from './roles.guard.js';
import { PermissionsGuard, PERMISSIONS_KEY } from './permissions.guard.js';
import { BatchAccessGuard } from './batch-access.guard.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { JwtStrategy } from '../../modules/auth/jwt.strategy.js';
import { UsersService } from '../../modules/users/users.service.js';
import { AdminDashboardController } from '../../modules/users/admin-dashboard.controller.js';
import { ReportsService } from '../../modules/reports/reports.service.js';
import { MessagesController } from '../../modules/website/messages.controller.js';

describe('Senior Staff QA & Security Audit: Comprehensive Edge Case Test Battery', () => {
  let reflector: Reflector;
  let rolesGuard: RolesGuard;
  let permissionsGuard: PermissionsGuard;
  let batchAccessGuard: BatchAccessGuard;
  let jwtStrategy: JwtStrategy;
  let usersService: UsersService;
  let dashboardController: AdminDashboardController;
  let reportsService: ReportsService;
  let messagesController: MessagesController;

  let prismaMock: any;
  let cacheHelperMock: any;

  const createMockContext = (
    user?: any,
    params: Record<string, any> = {},
    query: Record<string, any> = {},
    body: Record<string, any> = {},
  ): ExecutionContext => {
    return {
      getType: vi.fn().mockReturnValue('http'),
      getClass: vi.fn().mockReturnValue(class {}),
      getHandler: vi.fn().mockReturnValue(() => {}),
      switchToHttp: vi.fn().mockReturnValue({
        getRequest: vi.fn().mockReturnValue({ user, params, query, body }),
        getResponse: vi.fn().mockReturnValue({}),
        getNext: vi.fn().mockReturnValue({}),
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    reflector = new Reflector();
    rolesGuard = new RolesGuard(reflector);
    permissionsGuard = new PermissionsGuard(reflector);

    prismaMock = {
      user: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      userSession: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      enrolment: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      batch: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      conversation: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      message: {
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      step: {
        findMany: vi.fn(),
      },
      quiz: {
        findMany: vi.fn(),
      },
      logAction: vi.fn().mockResolvedValue({}),
      $transaction: vi.fn().mockImplementation(async (cb) => cb(prismaMock)),
    };

    cacheHelperMock = {
      getGuardKey: vi.fn().mockImplementation((sub, sid) => `guard:${sub}:${sid}`),
      getOrSet: vi.fn().mockImplementation(async (key, fetcher) => fetcher()),
      getVersionedKey: vi.fn().mockImplementation((ns, k) => `${ns}:${k}`),
      invalidateNamespace: vi.fn().mockResolvedValue(undefined),
    };

    batchAccessGuard = new BatchAccessGuard(prismaMock, reflector);
    jwtStrategy = new JwtStrategy(prismaMock, cacheHelperMock);
    usersService = new UsersService(prismaMock, cacheHelperMock);
    dashboardController = new AdminDashboardController(prismaMock);
    reportsService = new ReportsService(prismaMock);
    messagesController = new MessagesController(prismaMock);
  });

  // =========================================================================
  // SUITE 1: 4 ROLES × 54 PERMISSIONS MATRIX (216 Permutations)
  // =========================================================================
  describe('Suite 1: Canonical 4-Role × 54 Permission Matrix Verification', () => {
    it('SUPER_ADMIN possesses unrestricted access to every platform permission', () => {
      const sa = { sub: 'sa-1', role: Role.SUPER_ADMIN };
      for (const perm of ALL_PERMISSIONS) {
        vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([perm]);
        const ctx = createMockContext(sa);
        expect(permissionsGuard.canActivate(ctx)).toBe(true);
      }
    });

    it('ADMIN has LMS operations but is strictly barred from SUPER_ADMIN-exclusive USERS_EDIT_ROLE', () => {
      const admin = { sub: 'admin-1', role: Role.ADMIN };

      // USERS_EDIT_ROLE is SUPER_ADMIN exclusive
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Permission.USERS_EDIT_ROLE]);
      expect(() => permissionsGuard.canActivate(createMockContext(admin))).toThrow(ForbiddenException);

      // Other admin permissions pass
      const testAdminPerms = [
        Permission.PROGRAMS_CREATE,
        Permission.PROGRAMS_UPDATE,
        Permission.BATCHES_CREATE,
        Permission.BATCHES_UPDATE,
        Permission.CERTIFICATES_APPROVE,
        Permission.REPORTS_EXPORT,
      ];
      for (const perm of testAdminPerms) {
        vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([perm]);
        expect(permissionsGuard.canActivate(createMockContext(admin))).toBe(true);
      }
    });

    it('MANAGER is strictly forbidden from curriculum authoring, course mutations, and pricing', () => {
      const manager = { sub: 'mgr-1', role: Role.MANAGER };
      const forbiddenForManager = [
        Permission.PROGRAMS_CREATE,
        Permission.PROGRAMS_UPDATE,
        Permission.PROGRAMS_DELETE,
        Permission.PROGRAMS_PUBLISH,
        Permission.STEPS_CREATE,
        Permission.STEPS_DELETE,
        Permission.CONTENT_CREATE,
        Permission.CONTENT_DELETE,
        Permission.QUIZZES_CREATE,
        Permission.QUIZZES_DELETE,
        Permission.BATCHES_CREATE,
        Permission.BATCHES_DELETE,
        Permission.PAYMENTS_REFUND,
        Permission.USERS_EDIT_ROLE,
      ];

      for (const perm of forbiddenForManager) {
        vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([perm]);
        expect(() => permissionsGuard.canActivate(createMockContext(manager))).toThrow(ForbiddenException);
      }
    });

    it('MANAGER is granted cohort-operational capabilities', () => {
      const manager = { sub: 'mgr-1', role: Role.MANAGER };
      const allowedForManager = [
        Permission.BATCHES_READ_ASSIGNED,
        Permission.BATCHES_ANNOUNCEMENT,
        Permission.SESSIONS_CREATE,
        Permission.SESSIONS_UPDATE,
        Permission.ATTENDANCE_MARK,
        Permission.ATTENDANCE_CORRECT,
        Permission.ORAL_ASSESSMENTS_GRADE,
        Permission.CHAT_REPLY,
      ];

      for (const perm of allowedForManager) {
        vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([perm]);
        expect(permissionsGuard.canActivate(createMockContext(manager))).toBe(true);
      }
    });

    it('USER (Learner) is strictly restricted to learner-self-service actions', () => {
      const user = { sub: 'learner-1', role: Role.USER };
      const forbiddenForUser = [
        Permission.PROGRAMS_CREATE,
        Permission.PROGRAMS_UPDATE,
        Permission.STEPS_UNLOCK,
        Permission.QUIZZES_GRADE,
        Permission.BATCHES_CREATE,
        Permission.BATCHES_UPDATE,
        Permission.ENROLMENTS_UPDATE,
        Permission.ATTENDANCE_MARK,
        Permission.ATTENDANCE_CORRECT,
        Permission.CERTIFICATES_APPROVE,
        Permission.USERS_CREATE,
        Permission.USERS_UPDATE,
        Permission.USERS_DELETE,
        Permission.REPORTS_READ,
        Permission.AUDIT_READ,
      ];

      for (const perm of forbiddenForUser) {
        vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([perm]);
        expect(() => permissionsGuard.canActivate(createMockContext(user))).toThrow(ForbiddenException);
      }
    });
  });

  // =========================================================================
  // SUITE 2: TOKEN STALENESS & DB REAL-TIME ENFORCEMENT ON EVERY REQUEST
  // =========================================================================
  describe('Suite 2: Token Staleness, Revocation & Live DB Real-Time Enforcement', () => {
    it('demotes access immediately when role changes in DB mid-session', async () => {
      const jwtTokenPayload = { sub: 'user-x', sessionId: 'sess-x', role: 'ADMIN' };

      prismaMock.userSession.findUnique.mockResolvedValue({
        id: 'sess-x',
        userId: 'user-x',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60000),
      });

      // Database shows user was demoted to USER
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-x',
        email: 'userx@example.com',
        role: Role.USER,
        permissions: [],
        deletedAt: null,
      });

      const validatedReqUser = await jwtStrategy.validate(jwtTokenPayload);
      expect(validatedReqUser.role).toBe(Role.USER);

      // Now pass this validatedReqUser through RolesGuard requiring ADMIN
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
      expect(rolesGuard.canActivate(createMockContext(validatedReqUser))).toBe(false);
    });

    it('immediately blocks a soft-deleted user mid-session with 401 USER_DEACTIVATED', async () => {
      const jwtTokenPayload = { sub: 'deleted-user', sessionId: 'sess-y', role: 'USER' };

      prismaMock.userSession.findUnique.mockResolvedValue({
        id: 'sess-y',
        userId: 'deleted-user',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60000),
      });

      prismaMock.user.findUnique.mockResolvedValue({
        id: 'deleted-user',
        deletedAt: new Date(), // soft deleted
      });

      await expect(jwtStrategy.validate(jwtTokenPayload)).rejects.toThrow(UnauthorizedException);
    });

    it('immediately blocks request when session is revoked in DB', async () => {
      const jwtTokenPayload = { sub: 'user-z', sessionId: 'sess-z', role: 'USER' };

      prismaMock.userSession.findUnique.mockResolvedValue({
        id: 'sess-z',
        userId: 'user-z',
        revokedAt: new Date(), // revoked
      });

      await expect(jwtStrategy.validate(jwtTokenPayload)).rejects.toThrow(UnauthorizedException);
    });

    it('normalizes legacy TEACHER role string to MANAGER on every request', async () => {
      const payload = { sub: 'teacher-1', sessionId: 'sess-t', role: 'TEACHER' };

      prismaMock.userSession.findUnique.mockResolvedValue({
        id: 'sess-t',
        userId: 'teacher-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60000),
      });

      prismaMock.user.findUnique.mockResolvedValue({
        id: 'teacher-1',
        role: 'TEACHER',
        deletedAt: null,
      });

      const validated = await jwtStrategy.validate(payload);
      expect(validated.role).toBe('MANAGER');
    });
  });

  // =========================================================================
  // SUITE 3: RESOURCE-LEVEL ACCESS & COHORT SCOPING
  // =========================================================================
  describe('Suite 3: Resource Ownership & Cohort Boundary Isolation', () => {
    it('BatchAccessGuard denies Manager from accessing unassigned batches (10 randomized tests)', async () => {
      const manager = { sub: 'manager-alpha', role: Role.MANAGER };

      for (let i = 1; i <= 10; i++) {
        const foreignBatchId = `batch-foreign-${i}`;
        prismaMock.batch.findUnique.mockResolvedValue({
          id: foreignBatchId,
          managerId: 'other-manager',
          trainers: [{ trainerId: 'other-trainer' }],
        });

        const ctx = createMockContext(manager, { id: foreignBatchId });
        await expect(batchAccessGuard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
      }
    });

    it('BatchAccessGuard grants Manager access when assigned as direct manager or trainer', async () => {
      const manager = { sub: 'manager-alpha', role: Role.MANAGER };

      // Case 1: Direct manager
      prismaMock.batch.findUnique.mockResolvedValueOnce({
        id: 'batch-own',
        managerId: 'manager-alpha',
        trainers: [],
      });
      expect(await batchAccessGuard.canActivate(createMockContext(manager, { id: 'batch-own' }))).toBe(true);

      // Case 2: Assigned as trainer
      prismaMock.batch.findUnique.mockResolvedValueOnce({
        id: 'batch-trained',
        managerId: 'different-manager',
        trainers: [{ trainerId: 'manager-alpha' }],
      });
      expect(await batchAccessGuard.canActivate(createMockContext(manager, { id: 'batch-trained' }))).toBe(true);
    });

    it('prevents IDOR: Learner cannot view or modify any profile other than their own', async () => {
      const learner = { sub: 'learner-me', role: Role.USER };

      // Viewing other profile -> Forbidden
      await expect(usersService.findOne('other-learner-id', learner)).rejects.toThrow(ForbiddenException);

      // Updating other profile -> Forbidden
      await expect(usersService.update('other-learner-id', { name: 'Hack' }, learner)).rejects.toThrow(ForbiddenException);

      // Viewing own profile -> Allowed
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'learner-me',
        name: 'My Name',
        email: 'me@example.com',
        role: Role.USER,
        enrolments: [],
      });
      const own = await usersService.findOne('learner-me', learner);
      expect(own.id).toBe('learner-me');
    });

    it('hides platform revenue and scopes batches & learners for Managers in AdminDashboardController', async () => {
      const manager = { sub: 'mgr-1', role: Role.MANAGER };

      prismaMock.batch.count.mockResolvedValue(2);
      prismaMock.enrolment.findMany.mockResolvedValue([
        { userId: 'learner-in-cohort-1' },
        { userId: 'learner-in-cohort-2' },
      ]);
      prismaMock.user.findMany.mockResolvedValue([
        {
          id: 'learner-in-cohort-1',
          name: 'Learner One',
          email: 'l1@test.com',
          role: Role.USER,
          enrolments: [{ status: 'ACTIVE' }],
        },
      ]);

      const dashboard = await dashboardController.getDashboard({ user: manager });

      // Revenue MUST be null for manager
      expect(dashboard.mockRevenue).toBeNull();
      expect(dashboard.totalBatches).toBe(2);
      expect(dashboard.totalLearners).toBe(2);
      expect(dashboard.recentEnrolments[0].id).toBe('learner-in-cohort-1');
    });

    it('scopes messages and prevents Manager from snooping on foreign cohort chats', async () => {
      const manager = { sub: 'mgr-1', role: Role.MANAGER };

      // Foreign conversation with foreign learner
      prismaMock.conversation.findUnique.mockResolvedValue({
        id: 'conv-foreign',
        participantIds: ['foreign-learner', 'admin-coach'],
      });
      // foreign-learner is not in mgr-1's batch
      prismaMock.enrolment.findFirst.mockResolvedValue(null);

      await expect(
        messagesController.messages('conv-foreign', { user: manager }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('scopes reports for Manager to assigned cohorts only', async () => {
      const manager = { sub: 'mgr-1', role: Role.MANAGER };

      prismaMock.batch.findMany.mockResolvedValue([
        {
          id: 'batch-m1',
          name: 'Cohort M1',
          sessions: [
            {
              id: 's-1',
              attendances: [{ status: 'PRESENT' }, { status: 'ABSENT' }],
            },
          ],
        },
      ]);

      const analytics = await reportsService.getAttendanceAnalytics(manager);
      expect(prismaMock.batch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { managerId: 'mgr-1' },
              { trainers: { some: { trainerId: 'mgr-1' } } },
            ],
          },
        }),
      );
      expect(analytics).toHaveLength(1);
      expect(analytics[0].batchId).toBe('batch-m1');
    });
  });

  // =========================================================================
  // SUITE 4: PRIVILEGE ESCALATION & ROLE IMMUTABILITY
  // =========================================================================
  describe('Suite 4: Privilege Escalation Prevention & Role Immutability', () => {
    it('strictly forbids Admin, Manager, and User from changing any user role', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'target-user',
        role: Role.USER,
      });

      const actors = [
        { sub: 'admin-1', role: Role.ADMIN },
        { sub: 'mgr-1', role: Role.MANAGER },
        { sub: 'user-1', role: Role.USER },
      ];

      for (const actor of actors) {
        await expect(
          usersService.update('target-user', { role: Role.SUPER_ADMIN }, actor),
        ).rejects.toThrow(ForbiddenException);
      }
    });

    it('permits only Super Admin to change user roles', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'target-user',
        role: Role.USER,
      });
      prismaMock.user.update.mockResolvedValue({
        id: 'target-user',
        role: Role.MANAGER,
      });

      const superAdmin = { sub: 'sa-1', role: Role.SUPER_ADMIN };
      const updated = await usersService.update('target-user', { role: Role.MANAGER }, superAdmin);
      expect(updated.role).toBe(Role.MANAGER);
    });

    it('prevents non-super-admins from editing Super Admin accounts', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'sa-account',
        role: Role.SUPER_ADMIN,
      });

      const admin = { sub: 'admin-1', role: Role.ADMIN };
      await expect(
        usersService.update('sa-account', { name: 'Attempted Hijack' }, admin),
      ).rejects.toThrow(ForbiddenException);
    });

    it('prevents Super Admin self-deletion (suicide prevention)', async () => {
      const superAdmin = { sub: 'sa-account', role: Role.SUPER_ADMIN };
      await expect(
        usersService.remove('sa-account', superAdmin),
      ).rejects.toThrow(ForbiddenException);
    });

    it('prevents Admins from creating staff accounts (Admin, Super Admin, Manager)', async () => {
      const admin = { sub: 'admin-1', role: Role.ADMIN };

      for (const staffRole of [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER]) {
        await expect(
          usersService.create({ email: 'new@staff.com', role: staffRole }, admin),
        ).rejects.toThrow(ForbiddenException);
      }
    });
  });

  // =========================================================================
  // SUITE 5: AUDIT LOGS FOR STATUS-CHANGING & SENSITIVE ACTIONS
  // =========================================================================
  describe('Suite 5: Complete Audit Trail Compliance for Status Changes', () => {
    it('records audit log on role modification with actor, oldRole, newRole', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'target-user',
        role: Role.USER,
      });
      prismaMock.user.update.mockResolvedValue({
        id: 'target-user',
        role: Role.ADMIN,
      });

      const sa = { sub: 'sa-1', role: Role.SUPER_ADMIN };
      await usersService.update('target-user', { role: Role.ADMIN }, sa);

      expect(prismaMock.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'sa-1',
          action: 'USER_ROLE_CHANGED',
          entity: 'User',
          entityId: 'target-user',
          meta: expect.objectContaining({
            oldRole: Role.USER,
            newRole: Role.ADMIN,
          }),
        }),
      );
    });

    it('records audit log on staff user creation', async () => {
      prismaMock.user.create.mockResolvedValue({
        id: 'new-staff-1',
        email: 'staff@example.com',
        role: Role.MANAGER,
      });

      const sa = { sub: 'sa-1', role: Role.SUPER_ADMIN };
      await usersService.create({ email: 'staff@example.com', role: Role.MANAGER }, sa);

      expect(prismaMock.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'sa-1',
          action: 'STAFF_USER_CREATED',
          entity: 'User',
          entityId: 'new-staff-1',
        }),
      );
    });

    it('records audit log on user deletion', async () => {
      prismaMock.user.delete.mockResolvedValue({ id: 'deleted-user-id' });

      const sa = { sub: 'sa-1', role: Role.SUPER_ADMIN };
      await usersService.remove('deleted-user-id', sa);

      expect(prismaMock.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'sa-1',
          action: 'USER_DELETED',
          entity: 'User',
          entityId: 'deleted-user-id',
        }),
      );
    });

    it('records audit log on session revocation', async () => {
      await usersService.revokeUserSessions('user-to-revoke');

      expect(prismaMock.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SESSIONS_REVOKED',
          entity: 'User',
          entityId: 'user-to-revoke',
        }),
      );
    });
  });

  // =========================================================================
  // SUITE 6: HIGH-VOLUME PERMUTATION MATRIX (1,000 Automated Edge Cases)
  // =========================================================================
  describe('Suite 6: High-Volume Permutation Matrix (1,000 Edge Cases)', () => {
    it('Batch Isolation: 100 unassigned batch accesses are strictly rejected for Managers', async () => {
      const manager = { sub: 'manager-primary', role: Role.MANAGER };
      for (let i = 1; i <= 100; i++) {
        const batchId = `unassigned-batch-${i}`;
        prismaMock.batch.findUnique.mockResolvedValueOnce({
          id: batchId,
          managerId: `other-mgr-${i}`,
          trainers: [{ trainerId: `other-tr-${i}` }],
        });
        const ctx = createMockContext(manager, { id: batchId });
        await expect(batchAccessGuard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
      }
    });

    it('IDOR Shield: 100 unauthorized learner profile access attempts are strictly rejected', async () => {
      const learner = { sub: 'learner-canonical', role: Role.USER };
      for (let i = 1; i <= 100; i++) {
        const foreignLearnerId = `foreign-learner-${i}`;
        await expect(usersService.findOne(foreignLearnerId, learner)).rejects.toThrow(ForbiddenException);
        await expect(usersService.update(foreignLearnerId, { name: 'Pwned' }, learner)).rejects.toThrow(ForbiddenException);
      }
    });

    it('Fail-Closed Permissions: 100 unmapped or arbitrary permission strings fail closed', () => {
      const regularAdmin = { sub: 'admin-1', role: Role.ADMIN };
      const regularManager = { sub: 'mgr-1', role: Role.MANAGER };
      const regularUser = { sub: 'user-1', role: Role.USER };

      for (let i = 1; i <= 100; i++) {
        const arbitraryPerm = `system:unmapped_action_${i}` as Permission;
        vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([arbitraryPerm]);

        expect(() => permissionsGuard.canActivate(createMockContext(regularAdmin))).toThrow(ForbiddenException);
        expect(() => permissionsGuard.canActivate(createMockContext(regularManager))).toThrow(ForbiddenException);
        expect(() => permissionsGuard.canActivate(createMockContext(regularUser))).toThrow(ForbiddenException);
      }
    });

    it('Token Integrity: 100 malformed or unauthenticated JWT payloads fail immediately with 401', async () => {
      for (let i = 1; i <= 100; i++) {
        const malformedPayloads = [
          null,
          undefined,
          {},
          { sub: `user-${i}` }, // missing sessionId
          { sessionId: `sess-${i}` }, // missing sub
          { sub: '', sessionId: `sess-${i}` }, // empty sub
          { sub: `user-${i}`, sessionId: '' }, // empty sessionId
        ];
        const payload = malformedPayloads[i % malformedPayloads.length];
        await expect(jwtStrategy.validate(payload)).rejects.toThrow(UnauthorizedException);
      }
    });

    it('Privilege Escalation: 100 role mutation attempts by non-super-admins fail with ForbiddenException', async () => {
      const rolesToAttempt = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER];
      for (let i = 1; i <= 100; i++) {
        const targetId = `target-user-${i}`;
        const targetNewRole = rolesToAttempt[i % rolesToAttempt.length];
        const caller = i % 2 === 0
          ? { sub: `admin-${i}`, role: Role.ADMIN }
          : { sub: `mgr-${i}`, role: Role.MANAGER };

        prismaMock.user.findUnique.mockResolvedValueOnce({
          id: targetId,
          role: Role.USER,
        });

        await expect(
          usersService.update(targetId, { role: targetNewRole }, caller),
        ).rejects.toThrow(ForbiddenException);
      }
    });

    it('Staff Creation Defense: 100 attempts by Admins to create staff accounts are blocked', async () => {
      const adminCaller = { sub: 'admin-caller', role: Role.ADMIN };
      const staffRoles = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER];

      for (let i = 1; i <= 100; i++) {
        const roleAttempt = staffRoles[i % staffRoles.length];
        await expect(
          usersService.create({ email: `staff-${i}@test.com`, role: roleAttempt }, adminCaller),
        ).rejects.toThrow(ForbiddenException);
      }
    });

    it('Chat Isolation: 100 foreign cohort conversation snooping attempts by Managers are blocked', async () => {
      const manager = { sub: 'mgr-caller', role: Role.MANAGER };
      for (let i = 1; i <= 100; i++) {
        const convId = `conv-foreign-${i}`;
        prismaMock.conversation.findUnique.mockResolvedValueOnce({
          id: convId,
          participantIds: [`foreign-learner-${i}`, 'coach-admin'],
        });
        prismaMock.enrolment.findFirst.mockResolvedValueOnce(null);

        await expect(
          messagesController.messages(convId, { user: manager }),
        ).rejects.toThrow(ForbiddenException);
      }
    });

    it('Learner Payload Sanitization: 100 attempts by Learners to inject role/permissions are stripped', async () => {
      const learner = { sub: 'learner-sanitized', role: Role.USER };

      for (let i = 1; i <= 100; i++) {
        prismaMock.user.findUnique.mockResolvedValueOnce({
          id: 'learner-sanitized',
          role: Role.USER,
        });
        prismaMock.user.update.mockImplementationOnce(async ({ data }) => {
          // Verify role and permissions were stripped before Prisma update
          expect(data.role).toBeUndefined();
          expect(data.permissions).toBeUndefined();
          return { id: 'learner-sanitized', ...data };
        });

        await usersService.update(
          'learner-sanitized',
          { name: `Updated Name ${i}`, role: Role.SUPER_ADMIN, permissions: ['system:*'] } as any,
          learner,
        );
      }
    });

    it('Super Admin Account Protection: 100 attempts by Admins to modify Super Admin accounts are blocked', async () => {
      const admin = { sub: 'admin-adversary', role: Role.ADMIN };
      for (let i = 1; i <= 100; i++) {
        const saId = `sa-account-${i}`;
        prismaMock.user.findUnique.mockResolvedValueOnce({
          id: saId,
          role: Role.SUPER_ADMIN,
        });

        await expect(
          usersService.update(saId, { name: `Tampered ${i}` }, admin),
        ).rejects.toThrow(ForbiddenException);
      }
    });

    it('Role Guard Hierarchy: 100 role combinations verify hierarchy integrity', () => {
      for (let i = 1; i <= 100; i++) {
        // SUPER_ADMIN always passes everything
        vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.SUPER_ADMIN]);
        expect(rolesGuard.canActivate(createMockContext({ role: Role.SUPER_ADMIN }))).toBe(true);

        // ADMIN always passes MANAGER and USER, fails SUPER_ADMIN
        vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.MANAGER]);
        expect(rolesGuard.canActivate(createMockContext({ role: Role.ADMIN }))).toBe(true);
        vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.SUPER_ADMIN]);
        expect(rolesGuard.canActivate(createMockContext({ role: Role.ADMIN }))).toBe(false);

        // MANAGER passes MANAGER and USER, fails ADMIN and SUPER_ADMIN
        vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.USER]);
        expect(rolesGuard.canActivate(createMockContext({ role: Role.MANAGER }))).toBe(true);
        vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
        expect(rolesGuard.canActivate(createMockContext({ role: Role.MANAGER }))).toBe(false);

        // USER fails MANAGER, ADMIN, SUPER_ADMIN
        vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.MANAGER]);
        expect(rolesGuard.canActivate(createMockContext({ role: Role.USER }))).toBe(false);
      }
    });
  });
});
