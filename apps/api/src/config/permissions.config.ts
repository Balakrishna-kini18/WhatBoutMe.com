/**
 * D1-025: Granular Named Permissions Configuration
 *
 * This configuration defines the central, granular named permissions for the
 * WhatBoutMe LMS platform following the `<domain>:<action>` convention.
 *
 * Architecture Reference:
 * - DEVELOPER_SPLIT_PLAN.md (§C. Authorization & Permissions, Task D1-025)
 * - ARCHITECTURE_BASELINE_V3.md (§D.3 Named Permissions Architecture)
 * - WhatBoutMe LMS Development Plan PDF (§1.3 Roles & Permissions)
 *
 * Granular permissions allow fine-grained access control across all LMS domains
 * (programs, steps, content, quizzes, batches, enrolments, sessions, attendance,
 * oral assessments, certificates, agreements, users, payments, reports, audit, chat).
 */

export const Permission = {
  // Programs Domain
  PROGRAMS_CREATE: 'programs:create',
  PROGRAMS_READ: 'programs:read',
  PROGRAMS_UPDATE: 'programs:update',
  PROGRAMS_DELETE: 'programs:delete',
  PROGRAMS_PUBLISH: 'programs:publish',

  // Steps Domain (Hybrid progression, step releases, overrides)
  STEPS_CREATE: 'steps:create',
  STEPS_READ: 'steps:read',
  STEPS_UPDATE: 'steps:update',
  STEPS_DELETE: 'steps:delete',
  STEPS_UNLOCK: 'steps:unlock',
  STEPS_LOCK: 'steps:lock',

  // Content / Lessons Domain (Lesson authoring, uploads, manual unlocks)
  CONTENT_CREATE: 'content:create',
  CONTENT_READ: 'content:read',
  CONTENT_UPDATE: 'content:update',
  CONTENT_DELETE: 'content:delete',
  CONTENT_UPLOAD: 'content:upload',
  CONTENT_UNLOCK: 'content:unlock',

  // Quizzes & Question Bank Domain
  QUIZZES_CREATE: 'quizzes:create',
  QUIZZES_READ: 'quizzes:read',
  QUIZZES_UPDATE: 'quizzes:update',
  QUIZZES_DELETE: 'quizzes:delete',
  QUIZZES_GRADE: 'quizzes:grade',
  QUIZZES_RESET_ATTEMPTS: 'quizzes:reset_attempts',

  // Batches Domain (Cohorts, lifecycle, trainer assignment)
  BATCHES_CREATE: 'batches:create',
  BATCHES_READ: 'batches:read',
  BATCHES_READ_ASSIGNED: 'batches:read_assigned',
  BATCHES_UPDATE: 'batches:update',
  BATCHES_DELETE: 'batches:delete',
  BATCHES_ARCHIVE: 'batches:archive',
  BATCHES_ASSIGN_TRAINER: 'batches:assign_trainer',
  BATCHES_ANNOUNCEMENT: 'batches:announcement',

  // Enrolments Domain (State machine, overrides)
  ENROLMENTS_CREATE: 'enrolments:create',
  ENROLMENTS_READ: 'enrolments:read',
  ENROLMENTS_READ_ASSIGNED: 'enrolments:read_assigned',
  ENROLMENTS_UPDATE: 'enrolments:update',
  ENROLMENTS_CANCEL: 'enrolments:cancel',
  ENROLMENTS_OVERRIDE: 'enrolments:override',

  // Sessions Domain (1-on-1 coaching, live cohorts, Outlook clash checks)
  SESSIONS_CREATE: 'sessions:create',
  SESSIONS_READ: 'sessions:read',
  SESSIONS_UPDATE: 'sessions:update',
  SESSIONS_DELETE: 'sessions:delete',
  SESSIONS_BOOK: 'sessions:book',
  SESSIONS_CANCEL: 'sessions:cancel',

  // Attendance Domain (Auto/manual attendance, corrections, Zoom reconciliation)
  ATTENDANCE_READ: 'attendance:read',
  ATTENDANCE_MARK: 'attendance:mark',
  ATTENDANCE_CORRECT: 'attendance:correct',
  ATTENDANCE_RECONCILE: 'attendance:reconcile',

  // Oral Assessments Domain (Scoring rubrics, qualitative feedback)
  ORAL_ASSESSMENTS_READ: 'oral_assessments:read',
  ORAL_ASSESSMENTS_GRADE: 'oral_assessments:grade',
  ORAL_ASSESSMENTS_REVIEW: 'oral_assessments:review',

  // Certificates Domain (Approvals, QR-signed PDFs, revocations)
  CERTIFICATES_READ: 'certificates:read',
  CERTIFICATES_APPROVE: 'certificates:approve',
  CERTIFICATES_REJECT: 'certificates:reject',
  CERTIFICATES_ISSUE: 'certificates:issue',
  CERTIFICATES_REVOKE: 'certificates:revoke',

  // Agreements Domain (Templates, learner gating, signing audit)
  AGREEMENTS_READ: 'agreements:read',
  AGREEMENTS_CREATE_TEMPLATE: 'agreements:create_template',
  AGREEMENTS_SIGN: 'agreements:sign',
  AGREEMENTS_AUDIT: 'agreements:audit',

  // Users & Learners Domain (Role management, profile updates)
  USERS_CREATE: 'users:create',
  USERS_READ: 'users:read',
  USERS_READ_ASSIGNED: 'users:read_assigned',
  USERS_UPDATE: 'users:update',
  USERS_DELETE: 'users:delete',
  USERS_EDIT_ROLE: 'users:edit_role',

  // Payments & Invoices Domain
  PAYMENTS_READ: 'payments:read',
  PAYMENTS_REFUND: 'payments:refund',
  INVOICES_READ: 'invoices:read',

  // Reports & Analytics Domain
  REPORTS_READ: 'reports:read',
  REPORTS_EXPORT: 'reports:export',

  // Audit Logs & Security Domain
  AUDIT_READ: 'audit:read',
  AUDIT_EXPORT: 'audit:export',

  // Communications & Chat Domain
  CHAT_READ: 'chat:read',
  CHAT_SEND: 'chat:send',
  CHAT_REPLY: 'chat:reply',
  CHAT_ASSIGN: 'chat:assign',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

/**
 * Array of all defined permissions in the platform.
 */
export const ALL_PERMISSIONS: readonly Permission[] = Object.values(Permission);

/**
 * Set of all defined permissions for fast O(1) membership lookup.
 */
export const PERMISSION_SET: ReadonlySet<Permission> = new Set(ALL_PERMISSIONS);

/**
 * Grouped permissions by functional domain.
 */
export const PERMISSIONS_BY_DOMAIN: Record<string, readonly Permission[]> = {
  programs: [
    Permission.PROGRAMS_CREATE,
    Permission.PROGRAMS_READ,
    Permission.PROGRAMS_UPDATE,
    Permission.PROGRAMS_DELETE,
    Permission.PROGRAMS_PUBLISH,
  ],
  steps: [
    Permission.STEPS_CREATE,
    Permission.STEPS_READ,
    Permission.STEPS_UPDATE,
    Permission.STEPS_DELETE,
    Permission.STEPS_UNLOCK,
    Permission.STEPS_LOCK,
  ],
  content: [
    Permission.CONTENT_CREATE,
    Permission.CONTENT_READ,
    Permission.CONTENT_UPDATE,
    Permission.CONTENT_DELETE,
    Permission.CONTENT_UPLOAD,
    Permission.CONTENT_UNLOCK,
  ],
  quizzes: [
    Permission.QUIZZES_CREATE,
    Permission.QUIZZES_READ,
    Permission.QUIZZES_UPDATE,
    Permission.QUIZZES_DELETE,
    Permission.QUIZZES_GRADE,
    Permission.QUIZZES_RESET_ATTEMPTS,
  ],
  batches: [
    Permission.BATCHES_CREATE,
    Permission.BATCHES_READ,
    Permission.BATCHES_READ_ASSIGNED,
    Permission.BATCHES_UPDATE,
    Permission.BATCHES_DELETE,
    Permission.BATCHES_ARCHIVE,
    Permission.BATCHES_ASSIGN_TRAINER,
    Permission.BATCHES_ANNOUNCEMENT,
  ],
  enrolments: [
    Permission.ENROLMENTS_CREATE,
    Permission.ENROLMENTS_READ,
    Permission.ENROLMENTS_READ_ASSIGNED,
    Permission.ENROLMENTS_UPDATE,
    Permission.ENROLMENTS_CANCEL,
    Permission.ENROLMENTS_OVERRIDE,
  ],
  sessions: [
    Permission.SESSIONS_CREATE,
    Permission.SESSIONS_READ,
    Permission.SESSIONS_UPDATE,
    Permission.SESSIONS_DELETE,
    Permission.SESSIONS_BOOK,
    Permission.SESSIONS_CANCEL,
  ],
  attendance: [
    Permission.ATTENDANCE_READ,
    Permission.ATTENDANCE_MARK,
    Permission.ATTENDANCE_CORRECT,
    Permission.ATTENDANCE_RECONCILE,
  ],
  oral_assessments: [
    Permission.ORAL_ASSESSMENTS_READ,
    Permission.ORAL_ASSESSMENTS_GRADE,
    Permission.ORAL_ASSESSMENTS_REVIEW,
  ],
  certificates: [
    Permission.CERTIFICATES_READ,
    Permission.CERTIFICATES_APPROVE,
    Permission.CERTIFICATES_REJECT,
    Permission.CERTIFICATES_ISSUE,
    Permission.CERTIFICATES_REVOKE,
  ],
  agreements: [
    Permission.AGREEMENTS_READ,
    Permission.AGREEMENTS_CREATE_TEMPLATE,
    Permission.AGREEMENTS_SIGN,
    Permission.AGREEMENTS_AUDIT,
  ],
  users: [
    Permission.USERS_CREATE,
    Permission.USERS_READ,
    Permission.USERS_READ_ASSIGNED,
    Permission.USERS_UPDATE,
    Permission.USERS_DELETE,
    Permission.USERS_EDIT_ROLE,
  ],
  payments: [Permission.PAYMENTS_READ, Permission.PAYMENTS_REFUND],
  invoices: [Permission.INVOICES_READ],
  reports: [Permission.REPORTS_READ, Permission.REPORTS_EXPORT],
  audit: [Permission.AUDIT_READ, Permission.AUDIT_EXPORT],
  chat: [
    Permission.CHAT_READ,
    Permission.CHAT_SEND,
    Permission.CHAT_REPLY,
    Permission.CHAT_ASSIGN,
  ],
};

/**
 * Type-guard verifying if a given value is a recognized Permission.
 */
export function isValidPermission(permission: unknown): permission is Permission {
  if (typeof permission !== 'string') return false;
  return PERMISSION_SET.has(permission as Permission);
}

/**
 * Parses a permission string into its domain and action components.
 * Returns null if the string does not follow `<domain>:<action>` format.
 */
export function parsePermission(
  permission: string,
): { domain: string; action: string } | null {
  const parts = permission.split(':');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }
  return {
    domain: parts[0],
    action: parts[1],
  };
}

/**
 * Returns all permissions belonging to a given domain.
 */
export function getPermissionsByDomain(domain: string): readonly Permission[] {
  return PERMISSIONS_BY_DOMAIN[domain] ?? [];
}
