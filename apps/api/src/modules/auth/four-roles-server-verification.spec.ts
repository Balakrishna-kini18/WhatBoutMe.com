import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { JwtStrategy } from './jwt.strategy.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { ROLES_KEY } from '../../common/decorators/roles.decorator.js';
import { UsersService } from '../users/users.service.js';

describe('4 Canonical Roles Server Verification & Edge Case Enforcement', () => {
  let reflector: Reflector;
  let rolesGuard: RolesGuard;
  let jwtStrategy: JwtStrategy;
  let usersService: UsersService;

  let prismaMock: {
    user: {
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    userSession: {
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    enrolment: {
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    batch: {
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
    };
    logAction: ReturnType<typeof vi.fn>;
  };

  let cacheHelperMock: {
    getGuardKey: ReturnType<typeof vi.fn>;
    getOrSet: ReturnType<typeof vi.fn>;
    getVersionedKey: ReturnType<typeof vi.fn>;
    invalidateNamespace: ReturnType<typeof vi.fn>;
  };

  const createMockContext = (user?: any): ExecutionContext => {
    return {
      getType: vi.fn().mockReturnValue('http'),
      getClass: vi.fn().mockReturnValue(class {}),
      getHandler: vi.fn().mockReturnValue(() => {}),
      switchToHttp: vi.fn().mockReturnValue({
        getRequest: vi.fn().mockReturnValue({ user }),
        getResponse: vi.fn().mockReturnValue({}),
        getNext: vi.fn().mockReturnValue({}),
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    reflector = new Reflector();
    rolesGuard = new RolesGuard(reflector);

    prismaMock = {
      user: {
        findUnique: vi.fn(),
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
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      batch: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      logAction: vi.fn().mockResolvedValue({}),
    };

    cacheHelperMock = {
      getGuardKey: vi.fn().mockImplementation((sub, sid) => `guard:${sub}:${sid}`),
      getOrSet: vi.fn().mockImplementation(async (key, fetcher) => fetcher()),
      getVersionedKey: vi.fn().mockImplementation((ns, k) => `${ns}:${k}`),
      invalidateNamespace: vi.fn().mockResolvedValue(undefined),
    };

    jwtStrategy = new JwtStrategy(
      prismaMock as any,
      cacheHelperMock as any,
    );

    usersService = new UsersService(
      prismaMock as any,
      cacheHelperMock as any,
    );
  });

  // =========================================================================
  // 1. Live Server Validation On Every Request (Token Staleness & Deactivation)
  // =========================================================================
  describe('1. Live Server-Side Verification on Every Request (JwtStrategy)', () => {
    it('overrides stale JWT role claim with live database role', async () => {
      // In JWT payload, user claims to be ADMIN (e.g. issued 10 minutes ago)
      const stalePayload = { sub: 'user-1', sessionId: 'sess-1', role: 'ADMIN' };

      // Session is valid
      prismaMock.userSession.findUnique.mockResolvedValue({
        id: 'sess-1',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 1000000),
      });

      // But in the DB, user was demoted to USER
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Demoted User',
        role: Role.USER,
        permissions: [],
        companyId: null,
        deletedAt: null,
      });

      const validatedUser = await jwtStrategy.validate(stalePayload);

      // Server attaches current DB role, NOT the stale JWT claim
      expect(validatedUser.role).toBe(Role.USER);
      expect(validatedUser.sub).toBe('user-1');
    });

    it('rejects deactivated or deleted accounts immediately even with a valid unexpired JWT', async () => {
      const payload = { sub: 'user-2', sessionId: 'sess-2', role: 'USER' };

      prismaMock.userSession.findUnique.mockResolvedValue({
        id: 'sess-2',
        userId: 'user-2',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 1000000),
      });

      // User has been soft-deleted / deactivated
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-2',
        email: 'deleted@example.com',
        deletedAt: new Date(),
      });

      await expect(jwtStrategy.validate(payload)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects revoked sessions immediately', async () => {
      const payload = { sub: 'user-3', sessionId: 'sess-3', role: 'USER' };

      prismaMock.userSession.findUnique.mockResolvedValue({
        id: 'sess-3',
        userId: 'user-3',
        revokedAt: new Date(), // Session was revoked
        expiresAt: new Date(Date.now() + 1000000),
      });

      await expect(jwtStrategy.validate(payload)).rejects.toThrow(UnauthorizedException);
    });

    it('normalizes legacy TEACHER alias to canonical MANAGER', async () => {
      const payload = { sub: 'user-4', sessionId: 'sess-4', role: 'TEACHER' };

      prismaMock.userSession.findUnique.mockResolvedValue({
        id: 'sess-4',
        userId: 'user-4',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 1000000),
      });

      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-4',
        email: 'teacher@example.com',
        role: 'TEACHER',
        permissions: [],
        deletedAt: null,
      });

      const validatedUser = await jwtStrategy.validate(payload);
      expect(validatedUser.role).toBe('MANAGER');
    });
  });

  // =========================================================================
  // 2. Canonical 4-Role Hierarchy (RolesGuard)
  // =========================================================================
  describe('2. Canonical 4-Role Hierarchy (RolesGuard)', () => {
    it('grants SUPER_ADMIN access to ANY role-protected endpoint', () => {
      const superAdminUser = { sub: 'sa-1', role: Role.SUPER_ADMIN };

      // Protected with ADMIN
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
      expect(rolesGuard.canActivate(createMockContext(superAdminUser))).toBe(true);

      // Protected with MANAGER
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.MANAGER]);
      expect(rolesGuard.canActivate(createMockContext(superAdminUser))).toBe(true);

      // Protected with USER
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.USER]);
      expect(rolesGuard.canActivate(createMockContext(superAdminUser))).toBe(true);
    });

    it('allows ADMIN to satisfy MANAGER and USER endpoints, but blocks from SUPER_ADMIN endpoints', () => {
      const adminUser = { sub: 'admin-1', role: Role.ADMIN };

      // ADMIN can access ADMIN
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
      expect(rolesGuard.canActivate(createMockContext(adminUser))).toBe(true);

      // ADMIN can access MANAGER
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.MANAGER]);
      expect(rolesGuard.canActivate(createMockContext(adminUser))).toBe(true);

      // ADMIN can access USER
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.USER]);
      expect(rolesGuard.canActivate(createMockContext(adminUser))).toBe(true);

      // ADMIN is BLOCKED from SUPER_ADMIN exclusive endpoints
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.SUPER_ADMIN]);
      expect(rolesGuard.canActivate(createMockContext(adminUser))).toBe(false);
    });

    it('allows MANAGER to satisfy MANAGER and USER endpoints, but blocks from ADMIN and SUPER_ADMIN endpoints', () => {
      const managerUser = { sub: 'mgr-1', role: Role.MANAGER };

      // MANAGER can access MANAGER
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.MANAGER]);
      expect(rolesGuard.canActivate(createMockContext(managerUser))).toBe(true);

      // MANAGER can access USER
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.USER]);
      expect(rolesGuard.canActivate(createMockContext(managerUser))).toBe(true);

      // MANAGER is BLOCKED from ADMIN
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
      expect(rolesGuard.canActivate(createMockContext(managerUser))).toBe(false);

      // MANAGER is BLOCKED from SUPER_ADMIN
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.SUPER_ADMIN]);
      expect(rolesGuard.canActivate(createMockContext(managerUser))).toBe(false);
    });

    it('restricts USER strictly to USER endpoints', () => {
      const learnerUser = { sub: 'learner-1', role: Role.USER };

      // USER can access USER
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.USER]);
      expect(rolesGuard.canActivate(createMockContext(learnerUser))).toBe(true);

      // USER is BLOCKED from MANAGER
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.MANAGER]);
      expect(rolesGuard.canActivate(createMockContext(learnerUser))).toBe(false);

      // USER is BLOCKED from ADMIN
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
      expect(rolesGuard.canActivate(createMockContext(learnerUser))).toBe(false);

      // USER is BLOCKED from SUPER_ADMIN
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.SUPER_ADMIN]);
      expect(rolesGuard.canActivate(createMockContext(learnerUser))).toBe(false);
    });
  });

  // =========================================================================
  // 3. Role Modification Authority & Suicide Prevention
  // =========================================================================
  describe('3. Role Modification Authority & Privilege Escalation Prevention', () => {
    it('allows only Super Admin to change user roles in update()', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'target-1',
        role: Role.USER,
      });
      prismaMock.user.update.mockResolvedValue({
        id: 'target-1',
        role: Role.ADMIN,
      });

      // Super Admin attempting to promote user: SUCCESS
      const saActor = { sub: 'sa-1', role: Role.SUPER_ADMIN };
      const updated = await usersService.update('target-1', { role: Role.ADMIN }, saActor);
      expect(updated.role).toBe(Role.ADMIN);
      expect(prismaMock.logAction).toHaveBeenCalledWith(expect.objectContaining({
        action: 'USER_ROLE_CHANGED',
      }));

      // Admin attempting to promote user: FORBIDDEN
      const adminActor = { sub: 'admin-1', role: Role.ADMIN };
      await expect(
        usersService.update('target-1', { role: Role.SUPER_ADMIN }, adminActor),
      ).rejects.toThrow(ForbiddenException);

      // Manager attempting to change role: FORBIDDEN
      const managerActor = { sub: 'mgr-1', role: Role.MANAGER };
      await expect(
        usersService.update('target-1', { role: Role.ADMIN }, managerActor),
      ).rejects.toThrow(ForbiddenException);
    });

    it('prevents Admins from modifying Super Admin accounts', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'super-admin-target',
        role: Role.SUPER_ADMIN,
      });

      const adminActor = { sub: 'admin-1', role: Role.ADMIN };
      await expect(
        usersService.update('super-admin-target', { name: 'Compromised Name' }, adminActor),
      ).rejects.toThrow(ForbiddenException);
    });

    it('prevents Super Admin from deleting their own Super Admin account', async () => {
      const saActor = { sub: 'sa-1', role: Role.SUPER_ADMIN };
      await expect(
        usersService.remove('sa-1', saActor),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows only Super Admin to create staff accounts', async () => {
      prismaMock.user.create.mockResolvedValue({
        id: 'new-admin-id',
        email: 'staff@example.com',
        role: Role.ADMIN,
      });

      // Super Admin creates Admin: SUCCESS
      const saActor = { sub: 'sa-1', role: Role.SUPER_ADMIN };
      const created = await usersService.create({ email: 'staff@example.com', role: Role.ADMIN }, saActor);
      expect(created.role).toBe(Role.ADMIN);

      // Admin attempts to create Admin: FORBIDDEN
      const adminActor = { sub: 'admin-1', role: Role.ADMIN };
      await expect(
        usersService.create({ email: 'staff2@example.com', role: Role.ADMIN }, adminActor),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // 4. Scoping & Privacy Enforcement (IDOR & Manager Isolation)
  // =========================================================================
  describe('4. Manager Cohort Scoping & Learner Privacy Enforcement', () => {
    it('blocks Learners from viewing other user profiles (IDOR prevention)', async () => {
      const learner = { sub: 'learner-1', role: Role.USER };

      await expect(
        usersService.findOne('other-learner-2', learner),
      ).rejects.toThrow(ForbiddenException);
    });

    it('blocks Managers from viewing learners outside their assigned cohort', async () => {
      const manager = { sub: 'mgr-1', role: Role.MANAGER };

      // Learner is NOT enrolled in any batch managed/trained by mgr-1
      prismaMock.enrolment.findFirst.mockResolvedValue(null);

      await expect(
        usersService.findOne('unassigned-learner', manager),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows Managers to view learners enrolled in their assigned cohort', async () => {
      const manager = { sub: 'mgr-1', role: Role.MANAGER };

      // Learner IS enrolled in a batch managed by mgr-1
      prismaMock.enrolment.findFirst.mockResolvedValue({ id: 'enrol-1', batchId: 'batch-1' });
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'assigned-learner',
        name: 'Learner One',
        email: 'learner1@example.com',
        role: Role.USER,
        enrolments: [],
      });

      const result = await usersService.findOne('assigned-learner', manager);
      expect(result.id).toBe('assigned-learner');
    });

    it('allows Managers to view and edit their own profile', async () => {
      const manager = { sub: 'mgr-1', role: Role.MANAGER };

      prismaMock.user.findUnique.mockResolvedValue({
        id: 'mgr-1',
        name: 'Manager Name',
        email: 'mgr@example.com',
        role: Role.MANAGER,
        enrolments: [],
      });
      prismaMock.user.update.mockResolvedValue({
        id: 'mgr-1',
        name: 'Updated Manager Name',
        role: Role.MANAGER,
      });

      const profile = await usersService.findOne('mgr-1', manager);
      expect(profile.id).toBe('mgr-1');

      const updated = await usersService.update('mgr-1', { name: 'Updated Manager Name' }, manager);
      expect(updated.name).toBe('Updated Manager Name');
    });
  });
});
