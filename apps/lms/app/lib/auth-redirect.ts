/**
 * Stateful Enrollment Intent Preservation & Open-Redirect Sanitizer (LMS Portal)
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

  if (!candidate.startsWith("/") && decoded.startsWith("/")) {
    candidate = decoded;
  }

  if (candidate.includes("\\") || decoded.includes("\\")) {
    return safeFallback;
  }

  if (
    candidate.startsWith("//") ||
    decoded.startsWith("//") ||
    /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate) ||
    /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(decoded)
  ) {
    return safeFallback;
  }

  if (!candidate.startsWith("/")) {
    return safeFallback;
  }

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
    // Ignore storage errors
  }

  return record;
}

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

export function clearEnrollmentIntent(): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(ENROLLMENT_INTENT_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export function consumeEnrollmentIntent(
  queryRedirect?: string | null,
  fallback = "/courses",
  now = Date.now(),
): string {
  const fromQuery = sanitizeReturnUrl(queryRedirect, "");
  const stored = peekEnrollmentIntent(now);

  clearEnrollmentIntent();

  if (fromQuery) {
    return fromQuery;
  }

  if (stored?.returnUrl) {
    return stored.returnUrl;
  }

  return sanitizeReturnUrl(fallback, "/courses");
}

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
