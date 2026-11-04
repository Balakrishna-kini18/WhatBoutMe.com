import { describe, it, expect } from 'vitest';
import { Role } from '@prisma/client';
import {
  Permission,
  ALL_PERMISSIONS,
  PERMISSION_SET,
  PERMISSIONS_BY_DOMAIN,
  ROLE_PERMISSIONS,
  roleHasPermission,
  getRolePermissions,
  isValidPermission,
  parsePermission,
  getPermissionsByDomain,
} from './permissions.config.js';

describe('D1-025: Granular Named Permissions Configuration', () => {
  describe('Permission identifiers and structure', () => {
    it('defines non-empty permission identifiers', () => {
      expect(ALL_PERMISSIONS.length).toBeGreaterThan(0);
      expect(Object.keys(Permission).length).toBe(ALL_PERMISSIONS.length);
    });

    it('ensures every permission string is unique with no duplicates', () => {
      const values = Object.values(Permission);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });

    it('ensures every permission follows the "<domain>:<action>" format', () => {
      const permissionPattern = /^[a-z_]+:[a-z_]+$/;
      for (const perm of ALL_PERMISSIONS) {
        expect(perm).toMatch(permissionPattern);
      }
    });

    it('includes specific required permissions cited in D1-025 specification', () => {
      expect(Permission.PROGRAMS_CREATE).toBe('programs:create');
      expect(Permission.CONTENT_UNLOCK).toBe('content:unlock');
      expect(Permission.ATTENDANCE_CORRECT).toBe('attendance:correct');
      expect(Permission.CERTIFICATES_APPROVE).toBe('certificates:approve');
    });

    it('covers all core LMS operational domains', () => {
      const expectedDomains = [
        'programs',
        'steps',
        'content',
        'quizzes',
        'batches',
        'enrolments',
        'sessions',
        'attendance',
        'oral_assessments',
        'certificates',
        'agreements',
        'users',
        'payments',
        'invoices',
        'reports',
        'audit',
        'chat',
      ];

      for (const domain of expectedDomains) {
        expect(PERMISSIONS_BY_DOMAIN).toHaveProperty(domain);
        expect(PERMISSIONS_BY_DOMAIN[domain].length).toBeGreaterThan(0);
      }
    });
  });

  describe('PERMISSIONS_BY_DOMAIN mapping', () => {
    it('exhaustively categorizes all permissions without omissions or duplicates', () => {
      const allGroupedPermissions: string[] = [];

      for (const [domain, perms] of Object.entries(PERMISSIONS_BY_DOMAIN)) {
        for (const p of perms) {
          expect(p.startsWith(`${domain}:`) || (domain === 'sessions' && p.startsWith('session:'))).toBe(true);
          allGroupedPermissions.push(p);
        }
      }

      // Check count matches
      expect(allGroupedPermissions.length).toBe(ALL_PERMISSIONS.length);

      // Check no duplicates across domains
      const uniqueGrouped = new Set(allGroupedPermissions);
      expect(uniqueGrouped.size).toBe(ALL_PERMISSIONS.length);

      // Check all defined permissions are accounted for
      for (const p of ALL_PERMISSIONS) {
        expect(uniqueGrouped.has(p)).toBe(true);
      }
    });
  });

  describe('isValidPermission', () => {
    it('returns true for all valid defined permissions', () => {
      for (const perm of ALL_PERMISSIONS) {
        expect(isValidPermission(perm)).toBe(true);
      }
    });

    it('returns false for unrecognized strings and invalid formats', () => {
      expect(isValidPermission('unknown:permission')).toBe(false);
      expect(isValidPermission('programs.create')).toBe(false);
      expect(isValidPermission('programs:')).toBe(false);
      expect(isValidPermission(':create')).toBe(false);
      expect(isValidPermission('')).toBe(false);
      expect(isValidPermission('   ')).toBe(false);
      expect(isValidPermission('PROGRAMS:CREATE')).toBe(false);
    });

    it('returns false for non-string types', () => {
      expect(isValidPermission(null)).toBe(false);
      expect(isValidPermission(undefined)).toBe(false);
      expect(isValidPermission(123)).toBe(false);
      expect(isValidPermission({})).toBe(false);
      expect(isValidPermission([])).toBe(false);
      expect(isValidPermission(true)).toBe(false);
    });
  });

  describe('parsePermission', () => {
    it('correctly splits permission into domain and action', () => {
      const parsed = parsePermission('programs:create');
      expect(parsed).toEqual({ domain: 'programs', action: 'create' });

      const parsedOverride = parsePermission('attendance:correct');
      expect(parsedOverride).toEqual({ domain: 'attendance', action: 'correct' });

      const parsedCert = parsePermission('certificates:approve');
      expect(parsedCert).toEqual({ domain: 'certificates', action: 'approve' });
    });

    it('returns null for malformed or missing colon format', () => {
      expect(parsePermission('programs.create')).toBeNull();
      expect(parsePermission('programs')).toBeNull();
      expect(parsePermission('programs:create:extra')).toBeNull();
      expect(parsePermission(':create')).toBeNull();
      expect(parsePermission('programs:')).toBeNull();
      expect(parsePermission('')).toBeNull();
    });
  });

  describe('getPermissionsByDomain', () => {
    it('returns all permissions for a valid domain', () => {
      const programPerms = getPermissionsByDomain('programs');
      expect(programPerms).toEqual([
        Permission.PROGRAMS_CREATE,
        Permission.PROGRAMS_READ,
        Permission.PROGRAMS_UPDATE,
        Permission.PROGRAMS_DELETE,
        Permission.PROGRAMS_PUBLISH,
      ]);
    });

    it('returns an empty array for an unknown domain', () => {
      expect(getPermissionsByDomain('nonexistent_domain')).toEqual([]);
    });
  });

  describe('PERMISSION_SET', () => {
    it('contains all permissions with fast lookup size', () => {
      expect(PERMISSION_SET.size).toBe(ALL_PERMISSIONS.length);
      for (const p of ALL_PERMISSIONS) {
        expect(PERMISSION_SET.has(p)).toBe(true);
      }
    });
  });
});

describe('D1-026: ROLE_PERMISSIONS Matrix & Authorization Utilities', () => {
  const allRoles: Role[] = [
    Role.SUPER_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
    Role.USER,
  ];

  describe('Role matrix completeness and immutability', () => {
    it('ensures every defined application role has an explicit permission set', () => {
      for (const role of allRoles) {
        expect(ROLE_PERMISSIONS).toHaveProperty(role);
        expect(ROLE_PERMISSIONS[role]).toBeInstanceOf(Set);
        expect(ROLE_PERMISSIONS[role].size).toBeGreaterThan(0);
      }
    });

    it('ensures no undefined or invalid permission strings exist in any role set', () => {
      for (const role of allRoles) {
        const perms = ROLE_PERMISSIONS[role];
        for (const perm of perms) {
          expect(typeof perm).toBe('string');
          expect(isValidPermission(perm)).toBe(true);
        }
      }
    });
  });

  describe('SUPER_ADMIN role capabilities', () => {
    it('grants SUPER_ADMIN all 54 platform permissions', () => {
      expect(ROLE_PERMISSIONS.SUPER_ADMIN.size).toBe(ALL_PERMISSIONS.length);
      for (const perm of ALL_PERMISSIONS) {
        expect(ROLE_PERMISSIONS.SUPER_ADMIN.has(perm)).toBe(true);
      }
    });

    it('evaluates roleHasPermission to true for SUPER_ADMIN on any valid permission', () => {
      for (const perm of ALL_PERMISSIONS) {
        expect(roleHasPermission(Role.SUPER_ADMIN, perm)).toBe(true);
        expect(roleHasPermission('SUPER_ADMIN', perm)).toBe(true);
      }
    });

    it('grants SUPER_ADMIN exclusive role-editing permission', () => {
      expect(ROLE_PERMISSIONS.SUPER_ADMIN.has(Permission.USERS_EDIT_ROLE)).toBe(true);
      expect(roleHasPermission(Role.SUPER_ADMIN, Permission.USERS_EDIT_ROLE)).toBe(true);
    });
  });

  describe('ADMIN role capabilities and boundaries', () => {
    it('grants ADMIN operational LMS and management permissions', () => {
      expect(ROLE_PERMISSIONS.ADMIN.has(Permission.PROGRAMS_CREATE)).toBe(true);
      expect(ROLE_PERMISSIONS.ADMIN.has(Permission.PROGRAMS_PUBLISH)).toBe(true);
      expect(ROLE_PERMISSIONS.ADMIN.has(Permission.CONTENT_UPLOAD)).toBe(true);
      expect(ROLE_PERMISSIONS.ADMIN.has(Permission.BATCHES_CREATE)).toBe(true);
      expect(ROLE_PERMISSIONS.ADMIN.has(Permission.BATCHES_ARCHIVE)).toBe(true);
      expect(ROLE_PERMISSIONS.ADMIN.has(Permission.CERTIFICATES_APPROVE)).toBe(true);
      expect(ROLE_PERMISSIONS.ADMIN.has(Permission.CERTIFICATES_REVOKE)).toBe(true);
      expect(ROLE_PERMISSIONS.ADMIN.has(Permission.PAYMENTS_REFUND)).toBe(true);
      expect(ROLE_PERMISSIONS.ADMIN.has(Permission.AUDIT_EXPORT)).toBe(true);
      expect(ROLE_PERMISSIONS.ADMIN.has(Permission.USERS_DELETE)).toBe(true);
    });

    it('does NOT grant ADMIN the SUPER_ADMIN-exclusive USERS_EDIT_ROLE permission', () => {
      expect(ROLE_PERMISSIONS.ADMIN.has(Permission.USERS_EDIT_ROLE)).toBe(false);
      expect(roleHasPermission(Role.ADMIN, Permission.USERS_EDIT_ROLE)).toBe(false);
    });
  });

  describe('MANAGER role capabilities and boundaries', () => {
    it('grants MANAGER trainer & cohort operational permissions', () => {
      // Progression & content overrides
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.STEPS_UNLOCK)).toBe(true);
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.STEPS_LOCK)).toBe(true);
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.CONTENT_UNLOCK)).toBe(true);

      // Quiz grading & attempt resets
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.QUIZZES_GRADE)).toBe(true);
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.QUIZZES_RESET_ATTEMPTS)).toBe(true);

      // Session & Attendance
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.SESSIONS_CREATE)).toBe(true);
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.SESSIONS_UPDATE)).toBe(true);
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.ATTENDANCE_MARK)).toBe(true);
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.ATTENDANCE_CORRECT)).toBe(true);

      // Oral Assessment
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.ORAL_ASSESSMENTS_GRADE)).toBe(true);
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.ORAL_ASSESSMENTS_REVIEW)).toBe(true);

      // Assigned cohort queries & chat
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.BATCHES_ANNOUNCEMENT)).toBe(true);
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.BATCHES_READ_ASSIGNED)).toBe(true);
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.ENROLMENTS_READ_ASSIGNED)).toBe(true);
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.USERS_READ_ASSIGNED)).toBe(true);
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.CHAT_REPLY)).toBe(true);
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.CHAT_ASSIGN)).toBe(true);
    });

    it('strictly denies MANAGER platform-level administrative mutations', () => {
      // Programs & Content authoring
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.PROGRAMS_CREATE)).toBe(false);
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.PROGRAMS_UPDATE)).toBe(false);
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.PROGRAMS_DELETE)).toBe(false);
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.PROGRAMS_PUBLISH)).toBe(false);
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.CONTENT_CREATE)).toBe(false);
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.CONTENT_DELETE)).toBe(false);
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.CONTENT_UPLOAD)).toBe(false);

      // Quizzes authoring
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.QUIZZES_CREATE)).toBe(false);
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.QUIZZES_DELETE)).toBe(false);

      // Batches lifecycle & assignments
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.BATCHES_CREATE)).toBe(false);
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.BATCHES_DELETE)).toBe(false);
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.BATCHES_ARCHIVE)).toBe(false);
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.BATCHES_ASSIGN_TRAINER)).toBe(false);

      // Enrolment state transitions
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.ENROLMENTS_CREATE)).toBe(false);
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.ENROLMENTS_CANCEL)).toBe(false);
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.ENROLMENTS_OVERRIDE)).toBe(false);

      // Certificate approval & issuance
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.CERTIFICATES_APPROVE)).toBe(false);
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.CERTIFICATES_REJECT)).toBe(false);
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.CERTIFICATES_ISSUE)).toBe(false);
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.CERTIFICATES_REVOKE)).toBe(false);

      // Agreement templates & audits
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.AGREEMENTS_CREATE_TEMPLATE)).toBe(false);
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.AGREEMENTS_AUDIT)).toBe(false);

      // User & role management
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.USERS_CREATE)).toBe(false);
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.USERS_UPDATE)).toBe(false);
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.USERS_DELETE)).toBe(false);
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.USERS_EDIT_ROLE)).toBe(false);

      // Financials & Audit
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.PAYMENTS_READ)).toBe(false);
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.PAYMENTS_REFUND)).toBe(false);
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.INVOICES_READ)).toBe(false);
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.AUDIT_READ)).toBe(false);
      expect(ROLE_PERMISSIONS.MANAGER.has(Permission.AUDIT_EXPORT)).toBe(false);
    });
  });

  describe('USER role capabilities and boundaries', () => {
    it('grants USER only learner-facing capabilities', () => {
      expect(ROLE_PERMISSIONS.USER.has(Permission.PROGRAMS_READ)).toBe(true);
      expect(ROLE_PERMISSIONS.USER.has(Permission.STEPS_READ)).toBe(true);
      expect(ROLE_PERMISSIONS.USER.has(Permission.CONTENT_READ)).toBe(true);
      expect(ROLE_PERMISSIONS.USER.has(Permission.QUIZZES_READ)).toBe(true);
      expect(ROLE_PERMISSIONS.USER.has(Permission.SESSIONS_READ)).toBe(true);
      expect(ROLE_PERMISSIONS.USER.has(Permission.SESSIONS_BOOK)).toBe(true);
      expect(ROLE_PERMISSIONS.USER.has(Permission.SESSIONS_CANCEL)).toBe(true);
      expect(ROLE_PERMISSIONS.USER.has(Permission.ATTENDANCE_READ)).toBe(true);
      expect(ROLE_PERMISSIONS.USER.has(Permission.ORAL_ASSESSMENTS_READ)).toBe(true);
      expect(ROLE_PERMISSIONS.USER.has(Permission.CERTIFICATES_READ)).toBe(true);
      expect(ROLE_PERMISSIONS.USER.has(Permission.AGREEMENTS_READ)).toBe(true);
      expect(ROLE_PERMISSIONS.USER.has(Permission.AGREEMENTS_SIGN)).toBe(true);
      expect(ROLE_PERMISSIONS.USER.has(Permission.INVOICES_READ)).toBe(true);
      expect(ROLE_PERMISSIONS.USER.has(Permission.CHAT_READ)).toBe(true);
      expect(ROLE_PERMISSIONS.USER.has(Permission.CHAT_SEND)).toBe(true);
    });

    it('strictly denies USER all management, grading, and override permissions', () => {
      // Progression & content overrides
      expect(ROLE_PERMISSIONS.USER.has(Permission.STEPS_UNLOCK)).toBe(false);
      expect(ROLE_PERMISSIONS.USER.has(Permission.STEPS_LOCK)).toBe(false);
      expect(ROLE_PERMISSIONS.USER.has(Permission.CONTENT_UNLOCK)).toBe(false);

      // Quiz grading
      expect(ROLE_PERMISSIONS.USER.has(Permission.QUIZZES_GRADE)).toBe(false);
      expect(ROLE_PERMISSIONS.USER.has(Permission.QUIZZES_RESET_ATTEMPTS)).toBe(false);

      // Attendance marking (USER transmits presence heartbeats / self check-in)
      expect(ROLE_PERMISSIONS.USER.has(Permission.ATTENDANCE_MARK)).toBe(true);
      expect(ROLE_PERMISSIONS.USER.has(Permission.ATTENDANCE_CORRECT)).toBe(false);
      expect(ROLE_PERMISSIONS.USER.has(Permission.ATTENDANCE_RECONCILE)).toBe(false);

      // Oral assessment grading
      expect(ROLE_PERMISSIONS.USER.has(Permission.ORAL_ASSESSMENTS_GRADE)).toBe(false);
      expect(ROLE_PERMISSIONS.USER.has(Permission.ORAL_ASSESSMENTS_REVIEW)).toBe(false);

      // Certificate approval
      expect(ROLE_PERMISSIONS.USER.has(Permission.CERTIFICATES_APPROVE)).toBe(false);
      expect(ROLE_PERMISSIONS.USER.has(Permission.CERTIFICATES_ISSUE)).toBe(false);

      // User & Batch management
      expect(ROLE_PERMISSIONS.USER.has(Permission.USERS_CREATE)).toBe(false);
      expect(ROLE_PERMISSIONS.USER.has(Permission.USERS_EDIT_ROLE)).toBe(false);
      expect(ROLE_PERMISSIONS.USER.has(Permission.BATCHES_CREATE)).toBe(false);
      expect(ROLE_PERMISSIONS.USER.has(Permission.REPORTS_READ)).toBe(false);
      expect(ROLE_PERMISSIONS.USER.has(Permission.AUDIT_READ)).toBe(false);
    });
  });

  describe('roleHasPermission helper function', () => {
    it('returns true when a role possesses the requested permission', () => {
      expect(roleHasPermission(Role.ADMIN, Permission.PROGRAMS_CREATE)).toBe(true);
      expect(roleHasPermission(Role.MANAGER, Permission.ATTENDANCE_CORRECT)).toBe(true);
      expect(roleHasPermission(Role.USER, Permission.AGREEMENTS_SIGN)).toBe(true);
    });

    it('returns false when a role does not possess the requested permission', () => {
      expect(roleHasPermission(Role.USER, Permission.PROGRAMS_CREATE)).toBe(false);
      expect(roleHasPermission(Role.MANAGER, Permission.CERTIFICATES_APPROVE)).toBe(false);
      expect(roleHasPermission(Role.ADMIN, Permission.USERS_EDIT_ROLE)).toBe(false);
    });

    it('returns false for unknown or falsy roles', () => {
      expect(roleHasPermission(null, Permission.PROGRAMS_READ)).toBe(false);
      expect(roleHasPermission(undefined, Permission.PROGRAMS_READ)).toBe(false);
      expect(roleHasPermission('NON_EXISTENT_ROLE', Permission.PROGRAMS_READ)).toBe(false);
      expect(roleHasPermission('', Permission.PROGRAMS_READ)).toBe(false);
    });

    it('supports string role representations matching enum values', () => {
      expect(roleHasPermission('ADMIN', Permission.PROGRAMS_CREATE)).toBe(true);
      expect(roleHasPermission('MANAGER', Permission.ATTENDANCE_CORRECT)).toBe(true);
      expect(roleHasPermission('USER', Permission.AGREEMENTS_SIGN)).toBe(true);
      expect(roleHasPermission('USER', Permission.PROGRAMS_CREATE)).toBe(false);
    });
  });

  describe('getRolePermissions helper function', () => {
    it('returns the permission Set for each valid role', () => {
      const adminPerms = getRolePermissions(Role.ADMIN);
      expect(adminPerms).toBe(ROLE_PERMISSIONS.ADMIN);
      expect(adminPerms.has(Permission.PROGRAMS_CREATE)).toBe(true);

      const managerPerms = getRolePermissions('MANAGER');
      expect(managerPerms).toBe(ROLE_PERMISSIONS.MANAGER);

      const userPerms = getRolePermissions(Role.USER);
      expect(userPerms).toBe(ROLE_PERMISSIONS.USER);
    });

    it('returns all permissions for SUPER_ADMIN', () => {
      const superPerms = getRolePermissions(Role.SUPER_ADMIN);
      expect(superPerms.size).toBe(ALL_PERMISSIONS.length);
    });

    it('returns an empty Set for invalid or nullish roles', () => {
      expect(getRolePermissions(null).size).toBe(0);
      expect(getRolePermissions(undefined).size).toBe(0);
      expect(getRolePermissions('UNKNOWN_ROLE').size).toBe(0);
    });
  });
});
