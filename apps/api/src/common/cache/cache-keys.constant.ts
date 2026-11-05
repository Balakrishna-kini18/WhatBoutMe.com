import { createHash } from 'node:crypto';

/**
 * WhatBoutMe LMS - Authoritative Cache Key Registry & TTL Constants
 * Conforms strictly to production specifications:
 * - Environment and domain prefixing: wbm:{env}:lms:{domain}:...
 * - Bounded TTLs with no permanent keys
 * - No PII, passwords, emails, raw search strings, or JWTs in keys
 * - Fail-open Redis caching layer
 */

export function getEnvPrefix(): string {
  const env = process.env.NODE_ENV || 'development';
  if (env === 'production') return 'prod';
  if (env === 'staging') return 'staging';
  return 'dev';
}

/**
 * Approved TTLs (in seconds) for LMS shared Redis cache
 */
export const LMS_CACHE_TTLS = {
  /** Dashboard / enrolled courses summary: 30 seconds */
  DASHBOARD_SECONDS: 30,
  /** Course curriculum & lesson metadata: 15 minutes (900 seconds) */
  CURRICULUM_SECONDS: 900,
  /** Curriculum jitter to prevent mass cache expiry stampede: up to 10% (0-90s) */
  CURRICULUM_JITTER_MAX_SECONDS: 90,
  /** Current course progression and lock state: 15 seconds */
  PROGRESS_SECONDS: 15,
  /** Step-level progression lock state: 15 seconds */
  STEP_PROGRESS_SECONDS: 15,
  /** Resources metadata list: 5 minutes (300 seconds) */
  RESOURCES_SECONDS: 300,
  /** Notes list: 60 seconds */
  NOTES_SECONDS: 60,
  /** Certificates list: 5 minutes (300 seconds) */
  CERTIFICATES_SECONDS: 300,
  /** Public certificate verification: 1 hour (3600 seconds) */
  CERTIFICATE_VERIFY_SECONDS: 3600,
} as const;

/**
 * Calculates a jittered TTL for shared curriculum to prevent thundering herds / cache stampedes
 */
export function getCurriculumTtlWithJitter(): number {
  const jitter = Math.floor(Math.random() * LMS_CACHE_TTLS.CURRICULUM_JITTER_MAX_SECONDS);
  return LMS_CACHE_TTLS.CURRICULUM_SECONDS + jitter;
}

/**
 * Deterministically normalizes and hashes query filters.
 * Returns a short 12-character hex digest of the sorted parameters.
 * Never leaks raw search text, emails, or personal parameters into cache keys.
 */
export function hashFilters(filters: Record<string, any> = {}): string {
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== '') {
      clean[k] = v;
    }
  }
  const sortedKeys = Object.keys(clean).sort();
  const sortedObj: Record<string, any> = {};
  for (const k of sortedKeys) {
    sortedObj[k] = clean[k];
  }
  const json = JSON.stringify(sortedObj);
  return createHash('sha256').update(json).digest('hex').slice(0, 12);
}

// ─────────────────────────────────────────────────────────────────────────────
// APPROVED KEY BUILDERS (Matching Section Required API Cache Keys)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 1. Course curriculum, steps, and lesson metadata:
 * wbm:{env}:lms:curriculum:{programId}:v{version}
 */
export function getCurriculumKey(programId: string, version: number = 1): string {
  return `wbm:${getEnvPrefix()}:lms:curriculum:${programId}:v${version}`;
}

/**
 * 2. Current course progression and locks:
 * wbm:{env}:lms:progress:{userId}:{enrolmentId}:v{version}
 */
export function getProgressKey(userId: string, enrolmentId: string, version: number = 1): string {
  return `wbm:${getEnvPrefix()}:lms:progress:${userId}:${enrolmentId}:v${version}`;
}

/**
 * 3. Step progression lock state:
 * wbm:{env}:lms:step:{userId}:{enrolmentId}:{stepId}:v{version}
 */
export function getStepProgressKey(
  userId: string,
  enrolmentId: string,
  stepId: string,
  version: number = 1,
): string {
  return `wbm:${getEnvPrefix()}:lms:step:${userId}:${enrolmentId}:${stepId}:v${version}`;
}

/**
 * 4. Dashboard / enrolled-course summary:
 * wbm:{env}:lms:dashboard:{userId}:v{version}
 */
export function getDashboardKey(userId: string, version: number = 1): string {
  return `wbm:${getEnvPrefix()}:lms:dashboard:${userId}:v${version}`;
}

/**
 * 5. Resources list:
 * wbm:{env}:lms:resources:{userId}:{programId}:{filterHash}:v{version}
 */
export function getResourcesKey(
  userId: string,
  programId: string = 'all',
  filterHash: string = 'default',
  version: number = 1,
): string {
  return `wbm:${getEnvPrefix()}:lms:resources:${userId}:${programId}:${filterHash}:v${version}`;
}

/**
 * 6. Notes list:
 * wbm:{env}:lms:notes:{userId}:{filterHash}:v{version}
 */
export function getNotesKey(userId: string, filterHash: string = 'default', version: number = 1): string {
  return `wbm:${getEnvPrefix()}:lms:notes:${userId}:${filterHash}:v${version}`;
}

/**
 * 7. Certificates list:
 * wbm:{env}:lms:certificates:{userId}:v{version}
 */
export function getCertificatesKey(userId: string, version: number = 1): string {
  return `wbm:${getEnvPrefix()}:lms:certificates:${userId}:v${version}`;
}

/**
 * 8. Public certificate verification:
 * wbm:{env}:public:certificate-verify:{certificateCode}:v{version}
 */
export function getPublicCertificateVerifyKey(certificateCode: string, version: number = 1): string {
  const normalizedCode = certificateCode.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  return `wbm:${getEnvPrefix()}:public:certificate-verify:${normalizedCode}:v${version}`;
}

