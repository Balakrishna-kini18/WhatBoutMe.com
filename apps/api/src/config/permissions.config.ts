import { Role } from '@prisma/client';

/**
 * D1-025 & D1-026: Granular Named Permissions and Role Matrix Configuration
 *
 * This configuration defines:
 * 1. The central, granular named permissions for the WhatBoutMe LMS platform
 *    following the `<domain>:<action>` convention (D1-025).
 * 2. The canonical role-to-permission mapping dictionary (ROLE_PERMISSIONS)
 *    mapping SUPER_ADMIN, ADMIN, MANAGER, and USER roles (D1-026).
 *
 * Architecture Reference:
 * - DEVELOPER_SPLIT_PLAN.md (§C. Authorization & Permissions, Tasks D1-025, D1-026)
 * - ARCHITECTURE_BASELINE_V3.md (§D.3 Named Permissions Architecture)
 * - WhatBoutMe LMS Development Plan PDF (§1.3 Roles & Permissions)
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
  SESSION_SCHEDULE: 'session:schedule',
  SESSIONS_SCHEDULE: 'sessions:schedule',
  SESSIONS_READ: 'sessions:read',
  SESSIONS_UPDATE: 'sessions:update',
  SESSIONS_DELETE: 'sessions:delete',
  SESSIONS_BOOK: 'sessions:book',
  SESSIONS_CANCEL: 'sessions:cancel',

  // Attendance Domain (Auto/manual attendance, corrections, Zoom reconciliation)
  ATTENDANCE_READ: 'attendance:read',
  ATTENDANCE_VIEW: 'attendance:view',
  ATTENDANCE_MARK: 'attendance:mark',
  ATTENDANCE_CORRECT: 'attendance:correct',
  ATTENDANCE_RECONCILE: 'attendance:reconcile',
  ATTENDANCE_EXPORT: 'attendance:export',

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
    Permission.SESSION_SCHEDULE,
    Permission.SESSIONS_SCHEDULE,
    Permission.SESSIONS_READ,
    Permission.SESSIONS_UPDATE,
    Permission.SESSIONS_DELETE,
    Permission.SESSIONS_BOOK,
    Permission.SESSIONS_CANCEL,
  ],
  attendance: [
    Permission.ATTENDANCE_READ,
    Permission.ATTENDANCE_VIEW,
    Permission.ATTENDANCE_MARK,
    Permission.ATTENDANCE_CORRECT,
    Permission.ATTENDANCE_RECONCILE,
    Permission.ATTENDANCE_EXPORT,
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

// ─── D1-026: Role → Permission Mapping Matrix ─────────────────────────────────

/**
 * Canonical Role-to-Permissions Matrix (D1-026).
 *
 * Defines the static capability set granted to each system role:
 * - SUPER_ADMIN: Unrestricted access to all capabilities across all domains.
 * - ADMIN: Full management access across LMS content, batches, quizzes, attendance,
 *   certificates, payments, and users, excluding SUPER_ADMIN-exclusive role editing.
 * - MANAGER: Cohort trainer and corporate manager operational capabilities (progression
 *   unlocking, quiz grading, session management, attendance marking/correction, oral assessment,
 *   assigned learner monitoring, and chat). Batch-level isolation is enforced separately by BatchAccessGuard (D1-028).
 * - USER: Learner capabilities (viewing programs/steps/lessons, taking step quizzes,
 *   booking coaching sessions, signing agreements, downloading certificates/invoices, and chat).
 */
export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  SUPER_ADMIN: new Set<Permission>(ALL_PERMISSIONS),

  ADMIN: new Set<Permission>([
    // Programs (Full management)
    Permission.PROGRAMS_CREATE,
    Permission.PROGRAMS_READ,
    Permission.PROGRAMS_UPDATE,
    Permission.PROGRAMS_DELETE,
    Permission.PROGRAMS_PUBLISH,

    // Steps (Full management & override)
    Permission.STEPS_CREATE,
    Permission.STEPS_READ,
    Permission.STEPS_UPDATE,
    Permission.STEPS_DELETE,
    Permission.STEPS_UNLOCK,
    Permission.STEPS_LOCK,

    // Content / Lessons (Full authoring & uploads)
    Permission.CONTENT_CREATE,
    Permission.CONTENT_READ,
    Permission.CONTENT_UPDATE,
    Permission.CONTENT_DELETE,
    Permission.CONTENT_UPLOAD,
    Permission.CONTENT_UNLOCK,

    // Quizzes & Question Bank (Full authoring, grading & resets)
    Permission.QUIZZES_CREATE,
    Permission.QUIZZES_READ,
    Permission.QUIZZES_UPDATE,
    Permission.QUIZZES_DELETE,
    Permission.QUIZZES_GRADE,
    Permission.QUIZZES_RESET_ATTEMPTS,

    // Batches (Full lifecycle, archiving, assignments & broadcasts)
    Permission.BATCHES_CREATE,
    Permission.BATCHES_READ,
    Permission.BATCHES_READ_ASSIGNED,
    Permission.BATCHES_UPDATE,
    Permission.BATCHES_DELETE,
    Permission.BATCHES_ARCHIVE,
    Permission.BATCHES_ASSIGN_TRAINER,
    Permission.BATCHES_ANNOUNCEMENT,

    // Enrolments (Full state machine & overrides)
    Permission.ENROLMENTS_CREATE,
    Permission.ENROLMENTS_READ,
    Permission.ENROLMENTS_READ_ASSIGNED,
    Permission.ENROLMENTS_UPDATE,
    Permission.ENROLMENTS_CANCEL,
    Permission.ENROLMENTS_OVERRIDE,

    // Sessions (Full scheduling, booking & cancellation)
    Permission.SESSIONS_CREATE,
    Permission.SESSION_SCHEDULE,
    Permission.SESSIONS_SCHEDULE,
    Permission.SESSIONS_READ,
    Permission.SESSIONS_UPDATE,
    Permission.SESSIONS_DELETE,
    Permission.SESSIONS_BOOK,
    Permission.SESSIONS_CANCEL,

    // Attendance (Full attendance management & reconciliation)
    Permission.ATTENDANCE_READ,
    Permission.ATTENDANCE_VIEW,
    Permission.ATTENDANCE_MARK,
    Permission.ATTENDANCE_CORRECT,
    Permission.ATTENDANCE_RECONCILE,
    Permission.ATTENDANCE_EXPORT,

    // Oral Assessments (Full grading & rubric review)
    Permission.ORAL_ASSESSMENTS_READ,
    Permission.ORAL_ASSESSMENTS_GRADE,
    Permission.ORAL_ASSESSMENTS_REVIEW,

    // Certificates (Full approval workflow, issuance & revocations)
    Permission.CERTIFICATES_READ,
    Permission.CERTIFICATES_APPROVE,
    Permission.CERTIFICATES_REJECT,
    Permission.CERTIFICATES_ISSUE,
    Permission.CERTIFICATES_REVOKE,

    // Agreements (Template management, signing & audit)
    Permission.AGREEMENTS_READ,
    Permission.AGREEMENTS_CREATE_TEMPLATE,
    Permission.AGREEMENTS_SIGN,
    Permission.AGREEMENTS_AUDIT,

    // Users (User administration; note: USERS_EDIT_ROLE is SUPER_ADMIN exclusive)
    Permission.USERS_CREATE,
    Permission.USERS_READ,
    Permission.USERS_READ_ASSIGNED,
    Permission.USERS_UPDATE,
    Permission.USERS_DELETE,

    // Payments & Invoices (Financial administration)
    Permission.PAYMENTS_READ,
    Permission.PAYMENTS_REFUND,
    Permission.INVOICES_READ,

    // Reports & Analytics (Full export & reporting)
    Permission.REPORTS_READ,
    Permission.REPORTS_EXPORT,

    // Audit Logs & Security
    Permission.AUDIT_READ,
    Permission.AUDIT_EXPORT,

    // Communications & Chat
    Permission.CHAT_READ,
    Permission.CHAT_SEND,
    Permission.CHAT_REPLY,
    Permission.CHAT_ASSIGN,
  ]),

  MANAGER: new Set<Permission>([
    // Programs & Steps (Curriculum reference & manual progression overrides)
    Permission.PROGRAMS_READ,
    Permission.STEPS_READ,
    Permission.STEPS_UNLOCK,
    Permission.STEPS_LOCK,

    // Content (Viewing lesson materials & manual unlock override)
    Permission.CONTENT_READ,
    Permission.CONTENT_UNLOCK,

    // Quizzes (Viewing benchmarks, grading subjective questions & resetting attempts)
    Permission.QUIZZES_READ,
    Permission.QUIZZES_GRADE,
    Permission.QUIZZES_RESET_ATTEMPTS,

    // Batches (Viewing assigned batch and broadcasting cohort announcements)
    Permission.BATCHES_READ,
    Permission.BATCHES_READ_ASSIGNED,
    Permission.BATCHES_ANNOUNCEMENT,

    // Enrolments (Viewing cohort members in assigned batches)
    Permission.ENROLMENTS_READ,
    Permission.ENROLMENTS_READ_ASSIGNED,

    // Sessions (Scheduling, managing & conducting live cohort / 1-on-1 sessions)
    Permission.SESSIONS_CREATE,
    Permission.SESSION_SCHEDULE,
    Permission.SESSIONS_SCHEDULE,
    Permission.SESSIONS_READ,
    Permission.SESSIONS_UPDATE,
    Permission.SESSIONS_DELETE,
    Permission.SESSIONS_CANCEL,

    // Attendance (Viewing, marking, reconciling & exporting attendance records)
    Permission.ATTENDANCE_READ,
    Permission.ATTENDANCE_VIEW,
    Permission.ATTENDANCE_MARK,
    Permission.ATTENDANCE_CORRECT,
    Permission.ATTENDANCE_RECONCILE,
    Permission.ATTENDANCE_EXPORT,

    // Oral Assessments (Conducting assessments, scoring rubrics & recording qualitative notes)
    Permission.ORAL_ASSESSMENTS_READ,
    Permission.ORAL_ASSESSMENTS_GRADE,
    Permission.ORAL_ASSESSMENTS_REVIEW,

    // Certificates (Viewing certificate status of batch learners)
    Permission.CERTIFICATES_READ,

    // Agreements (Verifying signed agreement status of cohort learners)
    Permission.AGREEMENTS_READ,

    // Users (Viewing assigned learners)
    Permission.USERS_READ_ASSIGNED,

    // Reports & Analytics (Cohort attendance & progression reports)
    Permission.REPORTS_READ,
    Permission.REPORTS_EXPORT,

    // Communications & Chat (Cohort trainer Q&A and assistance)
    Permission.CHAT_READ,
    Permission.CHAT_SEND,
    Permission.CHAT_REPLY,
    Permission.CHAT_ASSIGN,
  ]),

  USER: new Set<Permission>([
    // Programs & Steps (Browsing enroled program curriculum)
    Permission.PROGRAMS_READ,
    Permission.STEPS_READ,

    // Content (Accessing learning materials & lessons)
    Permission.CONTENT_READ,

    // Quizzes (Taking step quizzes)
    Permission.QUIZZES_READ,

    // Sessions (Viewing schedule, booking 1-on-1 coaching & cancelling own bookings)
    Permission.SESSIONS_READ,
    Permission.SESSIONS_BOOK,
    Permission.SESSIONS_CANCEL,

    // Attendance (Viewing own attendance record)
    Permission.ATTENDANCE_READ,
    Permission.ATTENDANCE_VIEW,

    // Oral Assessments (Viewing own assessment booking/status)
    Permission.ORAL_ASSESSMENTS_READ,

    // Certificates (Viewing & downloading own verified certificate)
    Permission.CERTIFICATES_READ,

    // Agreements (Reading & signing required learner agreement)
    Permission.AGREEMENTS_READ,
    Permission.AGREEMENTS_SIGN,

    // Invoices (Viewing & downloading own payment invoices)
    Permission.INVOICES_READ,

    // Communications & Chat (Asking questions in cohort chat)
    Permission.CHAT_READ,
    Permission.CHAT_SEND,
  ]),

  TEACHER: new Set<Permission>([
    Permission.PROGRAMS_READ,
    Permission.STEPS_READ,
    Permission.STEPS_UNLOCK,
    Permission.STEPS_LOCK,
    Permission.CONTENT_READ,
    Permission.CONTENT_UNLOCK,
    Permission.QUIZZES_READ,
    Permission.QUIZZES_GRADE,
    Permission.QUIZZES_RESET_ATTEMPTS,
    Permission.BATCHES_READ,
    Permission.BATCHES_READ_ASSIGNED,
    Permission.BATCHES_ANNOUNCEMENT,
    Permission.ENROLMENTS_READ,
    Permission.ENROLMENTS_READ_ASSIGNED,
    Permission.SESSIONS_CREATE,
    Permission.SESSIONS_READ,
    Permission.SESSIONS_UPDATE,
    Permission.SESSIONS_DELETE,
    Permission.SESSIONS_CANCEL,
    Permission.ATTENDANCE_READ,
    Permission.ATTENDANCE_MARK,
    Permission.ATTENDANCE_CORRECT,
    Permission.ORAL_ASSESSMENTS_READ,
    Permission.ORAL_ASSESSMENTS_GRADE,
    Permission.ORAL_ASSESSMENTS_REVIEW,
    Permission.CERTIFICATES_READ,
    Permission.AGREEMENTS_READ,
    Permission.USERS_READ_ASSIGNED,
    Permission.REPORTS_READ,
    Permission.REPORTS_EXPORT,
    Permission.CHAT_READ,
    Permission.CHAT_SEND,
    Permission.CHAT_REPLY,
    Permission.CHAT_ASSIGN,
  ]),
};

/**
 * Checks whether a given role is granted the specified permission.
 * - SUPER_ADMIN always evaluates to true (universal administrative short-circuit).
 * - For other roles, checks O(1) membership in the ROLE_PERMISSIONS matrix.
 * - Unknown / invalid roles evaluate to false.
 */
export function roleHasPermission(
  role: Role | string | undefined | null,
  permission: Permission,
): boolean {
  if (!role) return false;
  if (role === Role.SUPER_ADMIN || role === 'SUPER_ADMIN') return true;
  const permissions = ROLE_PERMISSIONS[role as Role];
  if (!permissions) return false;
  return permissions.has(permission);
}

/**
 * Returns the immutable Set of permissions assigned to a given role.
 * For SUPER_ADMIN, returns all 54 permissions.
 * For unknown roles, returns an empty Set.
 */
export function getRolePermissions(
  role: Role | string | undefined | null,
): ReadonlySet<Permission> {
  if (!role) return new Set<Permission>();
  if (role === Role.SUPER_ADMIN || role === 'SUPER_ADMIN') {
    return ROLE_PERMISSIONS.SUPER_ADMIN;
  }
  return ROLE_PERMISSIONS[role as Role] ?? new Set<Permission>();
}
