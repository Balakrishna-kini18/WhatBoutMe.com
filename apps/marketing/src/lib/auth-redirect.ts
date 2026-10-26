/**
 * Stateful Enrollment Intent Preservation & Open-Redirect Sanitizer
 *
 * Implements a 3-layer persistence strategy across Marketing, Auth, and LMS:
 *  1. URL Query Parameter (?redirect=... / ?returnTo=... / ?portal=...)
 *  2. Cross-Tab localStorage Fallback (`wbm_enrollment_intent` with 30-min TTL)
 *  3. Auth Flow Link Threading (/signup <-> /login <-> /forgot-password <-> /verify-email)
 */

export const ENROLLMENT_INTENT_STORAGE_KEY = "wbm_enrollment_intent";
export const ENROLLMENT_INTENT_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface EnrollmentIntentInput {
  returnUrl: string;
  programId?: string;
  slug?: string;
  batchId?: string;
  couponCode?: string;
  autoEnroll?: boolean;
  ttlMs?: number;
}

export interface StoredEnrollmentIntent {
  returnUrl: string;
  programId?: string;
  slug?: string;
  batchId?: string;
  couponCode?: string;
  autoEnroll?: boolean;
  createdAt: number;
  expiresAt: number;
}

/**
 * Auth routes that must never be used as a post-authentication return destination
 * to prevent infinite redirect loops.
 */
const AUTH_LOOP_PATH_PREFIXES = [
  "/login",
  "/signup",
  "/register",
  "/verify",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
  "/logout",
  "/sso",
];

function isAuthLoopPath(pathname: string): boolean {
  const normalized = pathname.trim().toLowerCase();
  return AUTH_LOOP_PATH_PREFIXES.some(
    (prefix) =>
      normalized === prefix ||
      normalized.startsWith(`${prefix}/`) ||
      normalized.startsWith(`${prefix}?`) ||
      normalized.startsWith(`${prefix}#`),
  );
}

function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

/**
 * Strictly validates and sanitizes a candidate return URL to prevent Open Redirect
 * vulnerabilities (`https://evil.com`, `//evil.com`, `/\evil.com`, `javascript:...`)
 * and infinite auth loops (`/login`, `/signup`, etc.).
 *
 * @param rawUrl   Untrusted candidate return URL or path
 * @param fallback Safe internal fallback route (defaults to `/courses`)
 */
export function sanitizeReturnUrl(
  rawUrl: string | null | undefined,
  fallback = "/courses",
): string {
  const safeFallback =
    fallback === ""
      ? ""
      : typeof fallback === "string" && fallback.startsWith("/") && !fallback.startsWith("//")
      ? fallback
      : "/courses";

  if (!rawUrl || typeof rawUrl !== "string") {
    return safeFallback;
  }

  let candidate = rawUrl.trim();
  if (!candidate || hasControlChars(candidate)) {
    return safeFallback;
  }

  // Decode up to 2 times to inspect any encoded open-redirect payloads (%2f%2fevil.com, %2f%5cevil.com)
  let decoded = candidate;
  for (let i = 0; i < 2; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      return safeFallback;
    }
  }

  decoded = decoded.trim();
  if (!decoded || hasControlChars(decoded)) {
    return safeFallback;
  }

  // If the caller passed a single-encoded relative path (e.g. %2Fprograms%2F123%3FautoEnroll%3Dtrue),
  // normalize candidate to the first-level decoded value so we return a clean path.
  if (!candidate.startsWith("/") && decoded.startsWith("/")) {
    candidate = decoded;
  }

  // Reject backslashes anywhere in the path/authority prefix (browsers normalize /\evil.com to //evil.com)
  if (candidate.includes("\\") || decoded.includes("\\")) {
    return safeFallback;
  }

  // Reject protocol-relative URLs (//evil.com) or scheme-prefixed strings (http:, https:, javascript:, data:, etc.)
  if (
    candidate.startsWith("//") ||
    decoded.startsWith("//") ||
    /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate) ||
    /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(decoded)
  ) {
    return safeFallback;
  }

  // Must start with a single forward slash `/`
  if (!candidate.startsWith("/")) {
    return safeFallback;
  }

  // Parse against a dummy internal origin to verify host and pathname integrity
  try {
    const parsed = new URL(candidate, "https://internal.whatboutme.local");
    if (parsed.origin !== "https://internal.whatboutme.local") {
      return safeFallback;
    }
    if (parsed.pathname.startsWith("//") || parsed.pathname.includes("\\")) {
      return safeFallback;
    }
    if (isAuthLoopPath(parsed.pathname)) {
      return safeFallback;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return safeFallback;
  }
}

/**
 * Extracts a validated redirect path from URLSearchParams or a query string,
 * checking `redirect`, `returnTo`, and `portal` in priority order.
 */
export function extractRedirectParam(
  searchParams?:
    | URLSearchParams
    | { get(name: string): string | null }
    | string
    | null,
): string | null {
  if (!searchParams) return null;

  const params =
    typeof searchParams === "string"
      ? new URLSearchParams(searchParams.startsWith("?") ? searchParams.slice(1) : searchParams)
      : searchParams;

  const raw =
    params.get("redirect") ??
    params.get("returnTo") ??
    params.get("portal");

  if (!raw) return null;
  const sanitized = sanitizeReturnUrl(raw, "");
  return sanitized || null;
}

/**
 * Builds the canonical LMS course enrollment return path, preserving optional
 * batchId, couponCode, and autoEnroll flags.
 */
export function buildCourseEnrollmentReturnUrl(params: {
  programId: string;
  batchId?: string | null;
  couponCode?: string | null;
  autoEnroll?: boolean;
  basePath?: "/agreement" | "/programs" | "/checkout";
}): string {
  const cleanId = (params.programId || "").trim();
  if (!cleanId) return "/courses";

  const basePath = params.basePath ?? "/agreement";
  const query = new URLSearchParams();

  if (basePath === "/programs") {
    if (params.autoEnroll !== false) query.set("autoEnroll", "true");
    if (params.batchId?.trim()) query.set("batchId", params.batchId.trim());
    if (params.couponCode?.trim()) query.set("coupon", params.couponCode.trim());
    const qs = query.toString();
    return `/programs/${encodeURIComponent(cleanId)}${qs ? `?${qs}` : ""}`;
  }

  query.set("programId", cleanId);
  if (params.autoEnroll !== false) query.set("autoEnroll", "true");
  if (params.batchId?.trim()) query.set("batchId", params.batchId.trim());
  if (params.couponCode?.trim()) query.set("coupon", params.couponCode.trim());
  return `${basePath}?${query.toString()}`;
}

/**
 * Saves the learner's enrollment intent in `localStorage` with a 30-minute TTL.
 * Survives cross-tab email verification or OTP flows on the same origin.
 */
export function saveEnrollmentIntent(
  intent: EnrollmentIntentInput,
  now = Date.now(),
): StoredEnrollmentIntent | null {
  const sanitizedUrl = sanitizeReturnUrl(intent.returnUrl, "");
  if (!sanitizedUrl) return null;

  const ttl =
    typeof intent.ttlMs === "number" && intent.ttlMs > 0
      ? intent.ttlMs
      : ENROLLMENT_INTENT_TTL_MS;

  const record: StoredEnrollmentIntent = {
    returnUrl: sanitizedUrl,
    ...(intent.programId ? { programId: intent.programId } : {}),
    ...(intent.slug ? { slug: intent.slug } : {}),
    ...(intent.batchId ? { batchId: intent.batchId } : {}),
    ...(intent.couponCode ? { couponCode: intent.couponCode } : {}),
    createdAt: now,
    expiresAt: now + ttl,
  };

  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(ENROLLMENT_INTENT_STORAGE_KEY, JSON.stringify(record));
    }
  } catch {
    // Ignore storage quota / SSR errors
  }

  return record;
}

/**
 * Reads the stored enrollment intent without consuming it.
 * Automatically purges expired or tampered entries.
 */
export function peekEnrollmentIntent(now = Date.now()): StoredEnrollmentIntent | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(ENROLLMENT_INTENT_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredEnrollmentIntent>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.returnUrl !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) {
      localStorage.removeItem(ENROLLMENT_INTENT_STORAGE_KEY);
      return null;
    }

    if (now >= parsed.expiresAt) {
      localStorage.removeItem(ENROLLMENT_INTENT_STORAGE_KEY);
      return null;
    }

    const sanitized = sanitizeReturnUrl(parsed.returnUrl, "");
    if (!sanitized) {
      localStorage.removeItem(ENROLLMENT_INTENT_STORAGE_KEY);
      return null;
    }

    return {
      ...parsed,
      returnUrl: sanitized,
      createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : now,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    try {
      localStorage.removeItem(ENROLLMENT_INTENT_STORAGE_KEY);
    } catch {}
    return null;
  }
}

/**
 * Explicitly clears any stored enrollment intent from `localStorage`.
 */
export function clearEnrollmentIntent(): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(ENROLLMENT_INTENT_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Consumes the learner's post-auth redirect destination in priority order:
 *  1. Validated `queryRedirect` parameter from the URL
 *  2. Non-expired `wbm_enrollment_intent` from `localStorage`
 *  3. `fallback` route
 *
 * Always clears `wbm_enrollment_intent` from `localStorage` upon consumption
 * so stale redirects never fire on future logins.
 */
export function consumeEnrollmentIntent(
  queryRedirect?: string | null,
  fallback = "/courses",
  now = Date.now(),
): string {
  const fromQuery = sanitizeReturnUrl(queryRedirect, "");
  const stored = peekEnrollmentIntent(now);

  // Always clear stored intent once consumed
  clearEnrollmentIntent();

  if (fromQuery) {
    return fromQuery;
  }

  if (stored?.returnUrl) {
    return stored.returnUrl;
  }

  return sanitizeReturnUrl(fallback, "/courses");
}

/**
 * Builds an auth page link (`/login`, `/signup`, `/forgot-password`, `/verify-email`)
 * that preserves the active redirect parameter across auth screen transitions.
 */
export function buildAuthHref(
  authPath: "/login" | "/signup" | "/register" | "/forgot-password" | "/verify-email",
  redirectUrl?: string | null,
  extraParams?: Record<string, string | null | undefined>,
): string {
  const sanitized = sanitizeReturnUrl(redirectUrl, "");
  const params = new URLSearchParams();
  if (sanitized) {
    params.set("redirect", sanitized);
    params.set("portal", sanitized);
  }
  if (extraParams) {
    for (const [k, v] of Object.entries(extraParams)) {
      if (v !== undefined && v !== null && v !== "") {
        params.set(k, v);
      }
    }
  }
  const qs = params.toString();
  return qs ? `${authPath}?${qs}` : authPath;
}
