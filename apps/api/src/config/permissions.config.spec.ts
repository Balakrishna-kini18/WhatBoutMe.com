import { describe, it, expect } from 'vitest';
import {
  Permission,
  ALL_PERMISSIONS,
  PERMISSION_SET,
  PERMISSIONS_BY_DOMAIN,
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
          expect(p.startsWith(`${domain}:`)).toBe(true);
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
