import { onThisHost } from "./host";

export const API_URL = onThisHost(
  process.env.NEXT_PUBLIC_API_URL ||
    (typeof window !== "undefined" && window.location.hostname.endsWith(".vercel.app")
      ? "https://what-bout-me-com.vercel.app"
      : "http://localhost:4000")
);

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

export async function parseApiError(
  res: Response,
  fallback: string = "Request failed"
): Promise<{ message: string; status: number; data?: any }> {
  let data: any = null;
  try {
    const text = await res.text();
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  const msg = data?.error?.message ?? data?.message ?? fallback;
  const message = Array.isArray(msg) ? msg.join(", ") : (typeof msg === "string" ? msg : fallback);
  return {
    message: message || `${fallback} (Status ${res.status})`,
    status: res.status,
    data,
  };
}

export interface ApiRequestOptions extends RequestInit {
  timeoutMs?: number;
  skipCache?: boolean;
  ttlMs?: number;
}

export interface CacheEntry {
  bodyText: string;
  status: number;
  statusText: string;
  headers: [string, string][];
  timestamp: number;
  ttlMs: number;
}

export const MAX_CACHE_ENTRIES = 500;

// In-memory LRU SWR cache for idempotent GET requests
export const apiCache = new Map<string, CacheEntry>();

// In-flight request deduplication map
export const inFlightRequests = new Map<
  string,
  Promise<{
    bodyText: string;
    status: number;
    statusText: string;
    headers: [string, string][];
  }>
>();

/**
 * Builds a deterministic cache key for in-memory caching and request deduplication.
 */
export function getCacheKey(url: string, headers?: HeadersInit): string {
  let token = "";
  if (typeof window !== "undefined") {
    token = localStorage.getItem("token") || "";
  }
  if (headers) {
    const h = new Headers(headers);
    const auth = h.get("Authorization");
    if (auth) token = auth;
  }
  return `GET:${url}:${token}`;
}

/**
 * Invalidates cached GET requests matching a specific resource prefix or RegExp pattern.
 * If called without arguments, clears the entire API cache.
 */
export function invalidateCache(resourceOrRegex?: string | RegExp): void {
  if (!resourceOrRegex) {
    apiCache.clear();
    return;
  }
  for (const key of Array.from(apiCache.keys())) {
    if (typeof resourceOrRegex === "string") {
      if (key.includes(resourceOrRegex)) {
        apiCache.delete(key);
      }
    } else if (resourceOrRegex instanceof RegExp) {
      if (resourceOrRegex.test(key)) {
        apiCache.delete(key);
      }
    }
  }
}

/**
 * Tag-based cache invalidation for grouped resource purging
 */
export function invalidateTag(tag: string): number {
  let count = 0;
  for (const key of Array.from(apiCache.keys())) {
    if (key.includes(`/${tag}`) || key.includes(`:${tag}`)) {
      apiCache.delete(key);
      count++;
    }
  }
  return count;
}

export function invalidateTags(tags: string[]): number {
  return tags.reduce((sum, tag) => sum + invalidateTag(tag), 0);
}

export function clearApiCache(): void {
  apiCache.clear();
  inFlightRequests.clear();
}

export function clearApiCacheOnLogout(): void {
  clearApiCache();
}

// One renewal at a time, shared by every request that hits an expired token
let renewing: Promise<string | "signed-out" | null> | null = null;
export function renewOnce(
  rawFetch?: typeof fetch,
  failedToken?: string | null
): Promise<string | "signed-out" | null> {
  const fetchFn =
    rawFetch ||
    (typeof window !== "undefined" && (window as any).__rawOriginalFetch
      ? (window as any).__rawOriginalFetch
      : fetch);

  const current = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  if (current && failedToken && current !== failedToken) {
    return Promise.resolve(current);
  }

  if (!renewing) {
    renewing = (async () => {
      const refreshToken =
        typeof window !== "undefined" ? localStorage.getItem("refresh_token") : null;
      if (!refreshToken) return "signed-out" as const;

      try {
        const res = await fetchFn(`${API_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (res.ok) {
          const data = await res.json();
          const newToken = data.access_token as string;
          if (typeof window !== "undefined" && newToken) {
            localStorage.setItem("token", newToken);
            if (data.refresh_token) {
              localStorage.setItem("refresh_token", data.refresh_token);
            }
          }
          return newToken || null;
        }

        return res.status === 401 ? ("signed-out" as const) : null;
      } catch {
        return null;
      }
    })().finally(() => {
      renewing = null;
    });
  }

  return renewing;
}

/**
 * Automatically purges cached GET responses when mutating endpoints are called.
 */
export function autoInvalidateOnMutation(url: string): void {
  // Routine playback telemetry heartbeats must NEVER flush the cache.
  // Cache is explicitly invalidated on completion (/complete) or quiz submission.
  if (url.includes("/heartbeat")) {
    return;
  }

  const resources = [
    "sessions",
    "bookings",
    "attendance",
    "enrollments",
    "progression",
    "progress",
    "quizzes",
    "exams",
    "certificates",
    "agreements",
    "messages",
    "notifications",
    "checkout",
    "auth",
    "one-on-one",
    "coaching",
    "mission-statements",
  ];

  for (const r of resources) {
    if (url.includes(`/${r}`)) {
      invalidateCache(`/${r}`);
      if (r === "sessions" || r === "bookings") {
        invalidateCache("/sessions");
        invalidateCache("/bookings");
      }
      if (r === "one-on-one" || r === "coaching") {
        invalidateCache("/one-on-one");
        invalidateCache("/coaching");
        invalidateCache("/progression");
        invalidateCache("/stages");
        invalidateCache("/certificates");
      }
      if (r === "mission-statements") {
        invalidateCache("/mission-statements");
        invalidateCache("/progression");
        invalidateCache("/stages");
        invalidateCache("/certificates");
      }
      if (r === "progression" || r === "progress" || r === "quizzes" || r === "exams") {
        invalidateCache("/progression");
        invalidateCache("/stages");
        invalidateCache("/progress");
        invalidateCache("/quizzes");
        invalidateCache("/exams");
        invalidateCache("/certificates");
        invalidateCache("/auth");
      }
      if (r === "certificates") {
        invalidateCache("/certificates");
      }
      if (r === "agreements") {
        invalidateCache("/agreements");
        invalidateCache("/progression");
        invalidateCache("/stages");
        invalidateCache("/auth");
      }
      break;
    }
  }

  if (url.includes("/complete") || url.includes("/submit")) {
    invalidateCache("/progression");
    invalidateCache("/stages");
    invalidateCache("/progress");
    invalidateCache("/quizzes");
    invalidateCache("/exams");
    invalidateCache("/certificates");
    invalidateCache("/auth");
  }
}

/**
 * Triggers a non-blocking background revalidation to keep cached data fresh.
 */
function triggerBackgroundRevalidate(
  url: string,
  init: ApiRequestOptions | undefined,
  cacheKey: string,
  ttlMs: number,
  timeoutMs: number
) {
  if (inFlightRequests.has(cacheKey)) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const p = (async () => {
    try {
      const rawFetch =
        typeof window !== "undefined" && (window as any).__rawOriginalFetch
          ? (window as any).__rawOriginalFetch
          : fetch;

      const res = await rawFetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);

      if (res.ok) {
        const bodyText = await res.text();
        const headersArray: [string, string][] = [];
        res.headers.forEach((val: string, key: string) => headersArray.push([key, val]));

        apiCache.set(cacheKey, {
          bodyText,
          status: res.status,
          statusText: res.statusText,
          headers: headersArray,
          timestamp: Date.now(),
          ttlMs,
        });
      }
    } catch {
      // Silent background revalidation failure
    } finally {
      clearTimeout(timer);
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, p as any);
}

/**
 * Development-only performance logger:
 * Logs a console table whenever an API call takes >500ms so developers
 * and SREs can immediately spot and diagnose slow endpoints in DevTools.
 */
export function logSlowApiCall(
  method: string,
  url: string,
  status: number,
  durationMs: number,
  headers: Headers | [string, string][],
  source: "Network" | "Deduplicated" | "Cache" = "Network"
): void {
  if (process.env.NODE_ENV === "production") return;
  if (durationMs <= 500) return;

  const roundedDuration = Math.round(durationMs * 10) / 10;
  const headerMap = headers instanceof Headers ? headers : new Headers(headers);

  // Parse Server-Timing: db;dur=X, total;dur=Y
  const serverTiming = headerMap.get("server-timing") || headerMap.get("Server-Timing");
  const dbMatch = serverTiming?.match(/db;dur=([\d.]+)/);
  const totalMatch = serverTiming?.match(/total;dur=([\d.]+)/);

  // Read Prisma queries header if available
  const prismaQueries =
    headerMap.get("x-prisma-queries") || headerMap.get("X-Prisma-Queries") || "-";

  console.warn(`[Slow API Warning] ${method} ${url} took ${roundedDuration}ms (>500ms threshold)`);
  if (typeof console.table === "function") {
    console.table([
      {
        Method: method,
        URL: url,
        Status: status,
        "Client Total": `${roundedDuration}ms`,
        "Server Total": totalMatch ? `${totalMatch[1]}ms` : "N/A",
        "Server DB": dbMatch ? `${dbMatch[1]}ms` : "N/A",
        "DB Queries": prismaQueries,
        Source: source,
      },
    ]);
  }
}

function createSafeJsonResponse(bodyText: string, init: ResponseInit): Response {
  const response = new Response(bodyText, init);
  const origJson = response.json.bind(response);
  response.json = async () => {
    if (!bodyText || !bodyText.trim()) return null;
    return origJson();
  };
  return response;
}

/**
 * Upgraded fetch with:
 * 1. In-flight request deduplication for identical concurrent GET requests
 * 2. Lightweight short-lived SWR in-memory caching
 * 3. Automatic cache invalidation on POST/PUT/PATCH/DELETE
 * 4. Configurable request timeouts (default 15s) and AbortController cancellation
 * 5. Dev-mode slow API console table logger for requests > 500ms
 */
export async function cachedFetch(
  input: RequestInfo | URL,
  init?: ApiRequestOptions
): Promise<Response> {
  const startTime = typeof performance !== "undefined" ? performance.now() : Date.now();
  let url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  url = onThisHost(url);

  const method = (init?.method || "GET").toUpperCase();
  const isGet = method === "GET";
  const skipCache = init?.skipCache ?? false;
  const ttlMs = init?.ttlMs ?? 60_000; // 60s default cache TTL
  const timeoutMs = init?.timeoutMs ?? (isGet ? 30_000 : 60_000); // 60s default for mutations, 30s for GET

  // Auto-bust cache on mutations
  if (!isGet) {
    autoInvalidateOnMutation(url);
  }

  const isBinaryUrl =
    /\/media\/(document|pdf|stream)/.test(url) ||
    /\.(pdf|png|jpe?g|gif|webp|svg|mp4|webm|mp3|zip)(\?|$)/i.test(url);

  const cacheKey = isGet && !isBinaryUrl ? getCacheKey(url, init?.headers) : null;

  // 1. SWR / In-Memory Cache Check for GET requests
  if (isGet && !skipCache && cacheKey) {
    const cached = apiCache.get(cacheKey);
    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < cached.ttlMs) {
        // Fresh hit: touch LRU order and serve immediately without network round trip
        apiCache.delete(cacheKey);
        apiCache.set(cacheKey, cached);
        return createSafeJsonResponse(cached.bodyText, {
          status: cached.status,
          statusText: cached.statusText,
          headers: new Headers(cached.headers),
        });
      } else if (age < cached.ttlMs * 2) {
        // Stale-While-Revalidate window: serve cached data immediately, revalidate in background
        apiCache.delete(cacheKey);
        apiCache.set(cacheKey, cached);
        triggerBackgroundRevalidate(url, init, cacheKey, ttlMs, timeoutMs);
        return createSafeJsonResponse(cached.bodyText, {
          status: cached.status,
          statusText: cached.statusText,
          headers: new Headers(cached.headers),
        });
      } else {
        // Stale past SWR window: remove
        apiCache.delete(cacheKey);
      }
    }
  }

  // 2. In-flight Deduplication for identical concurrent GET requests
  if (isGet && cacheKey && inFlightRequests.has(cacheKey)) {
    const inFlight = inFlightRequests.get(cacheKey)!;
    const resPayload = await inFlight;
    if (resPayload instanceof Response) {
      return resPayload;
    }
    const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
    logSlowApiCall(method, url, resPayload.status, durationMs, resPayload.headers, "Deduplicated");
    return createSafeJsonResponse(resPayload.bodyText, {
      status: resPayload.status,
      statusText: resPayload.statusText,
      headers: new Headers(resPayload.headers),
    });
  }

  // 3. Setup AbortController with Timeout and consumer cancellation
  const abortController = new AbortController();
  let timedOut = false;

  const timeoutTimer = setTimeout(() => {
    timedOut = true;
    abortController.abort(
      new DOMException(`Request timed out after ${timeoutMs}ms`, "TimeoutError")
    );
  }, timeoutMs);

  if (init?.signal) {
    if (init.signal.aborted) {
      clearTimeout(timeoutTimer);
      abortController.abort(init.signal.reason);
    } else {
      init.signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timeoutTimer);
          abortController.abort(init.signal?.reason);
        },
        { once: true }
      );
    }
  }

  const fetchPromise = (async () => {
    try {
      const rawFetch =
        typeof window !== "undefined" && (window as any).__rawOriginalFetch
          ? (window as any).__rawOriginalFetch
          : fetch;

      let res = await rawFetch(url, { ...init, signal: abortController.signal });
      clearTimeout(timeoutTimer);

      // Handle transparent 401 token refresh for authenticated requests
      const isAuthRoute = /\/auth\/(login|signup|admin-login|refresh)/.test(url);
      if (res.status === 401 && !isAuthRoute && typeof window !== "undefined") {
        const currentToken = localStorage.getItem("token");
        const renewedToken = await renewOnce(rawFetch, currentToken);

        if (renewedToken && renewedToken !== "signed-out") {
          const retryHeaders = new Headers(init?.headers);
          retryHeaders.set("Authorization", `Bearer ${renewedToken}`);
          res = await rawFetch(url, { ...init, headers: retryHeaders, signal: abortController.signal });
        } else if (renewedToken === "signed-out") {
          try {
            const clone = res.clone();
            const errData = await clone.json();
            const errCode = typeof errData.error === "string" ? errData.error : errData.error?.code;
            const errReason = errData.reason || errData.error?.reason;
            if (errCode === "SESSION_REVOKED") {
              localStorage.removeItem("token");
              localStorage.removeItem("refresh_token");
              localStorage.removeItem("user");
              clearApiCache();
              window.dispatchEvent(
                new CustomEvent("wbm-session-revoked", {
                  detail: { reason: errReason || "SESSION_REVOKED" },
                })
              );
              return {
                bodyText: JSON.stringify(errData),
                status: 401,
                statusText: "Unauthorized",
                headers: [],
              };
            }
          } catch {}
          localStorage.removeItem("token");
          localStorage.removeItem("refresh_token");
          localStorage.removeItem("user");
          clearApiCache();
          if (window.location.pathname !== "/login") {
            window.location.href = "/login";
          }
        }
      }

      // Transparently pass through binary response streams without converting to text
      const contentType = (res.headers.get("content-type") || "").toLowerCase();
      const isBinaryResponse =
        isBinaryUrl ||
        contentType.includes("application/pdf") ||
        contentType.includes("application/octet-stream") ||
        contentType.includes("image/") ||
        contentType.includes("audio/") ||
        contentType.includes("video/") ||
        contentType.includes("zip");

      if (isBinaryResponse) {
        return res;
      }

      const clone = res.clone();
      const bodyText = await clone.text();
      const headersArray: [string, string][] = [];
      res.headers.forEach((val: string, key: string) => headersArray.push([key, val]));

      const payload = {
        bodyText,
        status: res.status,
        statusText: res.statusText,
        headers: headersArray,
      };

      // Only cache successful 2xx responses with bounded LRU eviction
      if (isGet && cacheKey && res.ok) {
        while (apiCache.size >= MAX_CACHE_ENTRIES) {
          const oldestKey = apiCache.keys().next().value;
          if (!oldestKey) break;
          apiCache.delete(oldestKey);
        }

        apiCache.set(cacheKey, {
          ...payload,
          timestamp: Date.now(),
          ttlMs,
        });
      }

      return payload;
    } catch (err: any) {
      clearTimeout(timeoutTimer);
      const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
      if (process.env.NODE_ENV !== "production" && durationMs > 500) {
        console.warn(`[Slow API Error] ${method} ${url} failed after ${Math.round(durationMs)}ms`);
      }
      if (timedOut) {
        throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
      }
      throw err;
    } finally {
      if (cacheKey) {
        inFlightRequests.delete(cacheKey);
      }
    }
  })();

  if (isGet && cacheKey) {
    inFlightRequests.set(cacheKey, fetchPromise);
  }

  const result = await fetchPromise;
  if (result instanceof Response) {
    return result;
  }
  const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
  logSlowApiCall(method, url, result.status, durationMs, result.headers, "Network");
  return createSafeJsonResponse(result.bodyText, {
    status: result.status,
    statusText: result.statusText,
    headers: new Headers(result.headers),
  });
}

/**
 * Hook into window.fetch on the client side so that ALL existing direct fetch() calls
 * across apps/lms automatically inherit in-flight deduplication, short-lived SWR caching,
 * 15s AbortController timeouts, and dev-mode slow API console profiling.
 */
if (typeof window !== "undefined") {
  if (!(window as any).__apiFetchPatched && !(window as any).__fetchPatched) {
    (window as any).__rawOriginalFetch = window.fetch;
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => cachedFetch(input, init);
    (window as any).__apiFetchPatched = true;
    (window as any).__fetchPatched = true;
  }
}

/**
 * Type-safe API request helpers with automatic JSON parsing and error wrapping.
 */
export async function apiFetch<T = any>(
  endpoint: string,
  options?: ApiRequestOptions
): Promise<T> {
  const fullUrl =
    endpoint.startsWith("http://") || endpoint.startsWith("https://")
      ? endpoint
      : `${API_URL}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

  const res = await cachedFetch(fullUrl, options);
  if (!res.ok) {
    throw new Error(await errorMessage(res, `API error (${res.status})`));
  }
  return res.json() as Promise<T>;
}

export function apiGet<T = any>(endpoint: string, options?: ApiRequestOptions): Promise<T> {
  return apiFetch<T>(endpoint, { ...options, method: "GET" });
}

export function apiPost<T = any>(
  endpoint: string,
  body?: any,
  options?: ApiRequestOptions
): Promise<T> {
  const headers = new Headers(options?.headers);
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return apiFetch<T>(endpoint, {
    ...options,
    method: "POST",
    headers,
    body: isFormData ? body : JSON.stringify(body),
  });
}

export function apiPatch<T = any>(
  endpoint: string,
  body?: any,
  options?: ApiRequestOptions
): Promise<T> {
  const headers = new Headers(options?.headers);
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return apiFetch<T>(endpoint, {
    ...options,
    method: "PATCH",
    headers,
    body: isFormData ? body : JSON.stringify(body),
  });
}

export function apiPut<T = any>(
  endpoint: string,
  body?: any,
  options?: ApiRequestOptions
): Promise<T> {
  const headers = new Headers(options?.headers);
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return apiFetch<T>(endpoint, {
    ...options,
    method: "PUT",
    headers,
    body: isFormData ? body : JSON.stringify(body),
  });
}

export function apiDelete<T = any>(
  endpoint: string,
  options?: ApiRequestOptions
): Promise<T> {
  return apiFetch<T>(endpoint, { ...options, method: "DELETE" });
}

/** The API wraps errors as { error: { code, message } }. */
export async function errorMessage(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => null);
  const raw = data?.error?.message ?? data?.message;
  return (Array.isArray(raw) ? raw.join(", ") : raw) || `${fallback} (error ${res.status}).`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROGRESSION TYPES (D1-033, D1-034, D1-041)
// ─────────────────────────────────────────────────────────────────────────────

export type LockReason =
  | "AGREEMENT_REQUIRED"
  | "ENROLMENT_NOT_ACTIVE"
  | "PREVIOUS_STEP_INCOMPLETE"
  | "QUIZ_NOT_PASSED"
  | "SCHEDULED_DATE_NOT_REACHED"
  | "MANUAL_LOCKED"
  | "LOCKED";

export type StepOverrideState = "AUTOMATIC" | "MANUAL_UNLOCKED" | "MANUAL_LOCKED";

export function getLockMessage(reason: LockReason | null | undefined): string {
  switch (reason) {
    case "AGREEMENT_REQUIRED":
      return "You must read and sign the Program Agreement before accessing this step.";
    case "ENROLMENT_NOT_ACTIVE":
      return "Enrolment is not active. Access to course steps is restricted.";
    case "PREVIOUS_STEP_INCOMPLETE":
      return "Please complete the previous step before accessing this step.";
    case "QUIZ_NOT_PASSED":
      return "You must pass the quiz in the previous step to unlock this step.";
    case "SCHEDULED_DATE_NOT_REACHED":
      return "This step is scheduled for release at a future date.";
    case "MANUAL_LOCKED":
      return "This step has been locked by instructor override.";
    default:
      return "This step is currently locked.";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AGREEMENT TYPES (D1-039, D1-040, D1-041)
// ─────────────────────────────────────────────────────────────────────────────

export interface ActiveAgreementResponse {
  templateId: string;
  templateTitle: string;
  templateDescription?: string | null;
  programId: string;
  programTitle: string;
  versionId: string;
  version: string;
  content: string;
  publishedAt: string;
}

export interface SignAgreementPayload {
  enrolmentId: string;
  versionId?: string;
  consentGiven: boolean;
  typedName: string;
  drawnSignature?: string;
  signatureImage?: string;
  signatureType?: "DRAWN" | "UPLOADED";
  consentVersion?: string;
  consentTimestamp?: string;
}

export interface SignedAgreementResponse {
  id: string;
  enrolmentId: string;
  programId: string;
  templateId: string;
  versionId: string;
  templateVersion: string;
  consentGiven: boolean;
  typedName: string;
  drawnSignature?: string;
  signatureImage?: string;
  signatureType?: "DRAWN" | "UPLOADED" | string;
  consentVersion?: string | null;
  consentTimestamp?: string | null;
  signerIp: string;
  userAgent: string;
  status: string;
  signedAt: string;
  signedPdfUrl?: string | null;
  enrolmentStatus?: string;
  checkoutUrl?: string;
  nextStep?: string;
}

export interface LessonProgressItem {
  lessonId: string;
  order: number;
  title: string;
  type: string;
  durationSec: number | null;
  isCompleted: boolean;
  progressPercent?: number;
  lastPositionSec?: number | null;
  completedAt?: string | null;
}

export interface QuizProgressItem {
  quizId: string;
  questionCount: number;
  passMark: number;
  isPassed: boolean;
  bestScore: number | null;
  attemptsCount: number;
  quizPlacement?: 'BEFORE_VIDEO' | 'AFTER_VIDEO';
}

export interface StepProgressionItem {
  stepId: string;
  sequence: number;
  title: string;
  releaseSchedule: "IMMEDIATE" | "COHORT_START_RELATIVE" | "SPECIFIC_DATE";
  unlockDelayDays: number | null;
  scheduledUnlockDate: string | null;
  isUnlocked: boolean;
  unlockedAt: string | null;
  overrideState: StepOverrideState;
  overrideReason: string | null;
  overriddenAt: string | null;
  overriddenById: string | null;
  isCompleted: boolean;
  completedAt: string | null;
  lockReason: LockReason | null;
  lessons: LessonProgressItem[];
  quiz: QuizProgressItem | null;
  progressPercent?: number;
  completedItems?: number;
  totalItems?: number;
  quizPlacement?: 'BEFORE_VIDEO' | 'AFTER_VIDEO';
}

export interface EnrolmentProgressionResponse {
  enrolmentId: string;
  programId: string;
  programTitle: string;
  batchId: string;
  batchName: string;
  batchStartDate: string;
  enrolmentStatus:
    | "ACTIVE"
    | "PENDING_PAYMENT"
    | "PENDING_AGREEMENT"
    | "WAITLIST"
    | "REVOKED"
    | "COMPLETED"
    | "CANCELLED"
    | "NOT_ENROLLED";
  overallProgressPercent: number;
  currentStepSequence: number;
  steps: StepProgressionItem[];
  totalItems?: number;
  completedItems?: number;
  certificate?: any;
  stages?: any;
  examConfig?: any;
  examAttempt?: any;
  coachingRequests?: any[];
  missionSubmissions?: any[];
}

// ─────────────────────────────────────────────────────────────────────────────
// QUIZ ENGINE TYPES (D1-036, D1-037)
// ─────────────────────────────────────────────────────────────────────────────

export interface QuizOption {
  id: string;
  text: string;
  imageUrl?: string | null;
  order: number;
}

export interface QuizQuestion {
  id: string;
  text: string;
  type: string;
  imageUrl?: string | null;
  gradingMode?: string | null;
  minCharacters?: number | null;
  points: number;
  options: QuizOption[];
}

export interface ActiveQuizAttempt {
  attemptId: string;
  attemptNumber: number;
  quizId: string;
  stepId?: string;
  status: "IN_PROGRESS" | "PASSED" | "FAILED";
  passMark: number;
  questionCount: number;
  timeLimitMin?: number | null;
  startedAt: string;
  completedAt?: string | null;
  score?: number | null;
  passed?: boolean;
  questions?: QuizQuestion[];
  // Retry metadata present when previous attempt completed
  attemptsUsed?: number;
  maxAttempts?: number;
  attemptsRemaining?: number;
  isCooldownActive?: boolean;
  cooldownHours?: number;
  cooldownUntil?: string | null;
  cooldownSecondsRemaining?: number | null;
  canRetry?: boolean;
  retryGuidance?: string | null;
  stepToRevisit?: {
    id: string;
    sequence: number;
    title: string;
  } | null;
}

export interface QuizSubmissionResult {
  attemptId: string;
  attemptNumber: number;
  quizId: string;
  score: number;
  passed: boolean;
  status: "PASSED" | "FAILED";
  passMark: number;
  totalQuestions: number;
  correctCount: number;
  completedAt: string;
  retryGuidance: string | null;
  attemptsUsed: number;
  maxAttempts: number;
  attemptsRemaining: number;
  isCooldownActive: boolean;
  cooldownHours: number;
  cooldownUntil: string | null;
  cooldownSecondsRemaining: number | null;
  canRetry: boolean;
  stepToRevisit: {
    id: string;
    sequence: number;
    title: string;
  } | null;
}

// -----------------------------------------------------------------------------
// STUDENT NOTES & HIGHLIGHTS (TASK 6)
// -----------------------------------------------------------------------------

export interface StudentNote {
  id: string;
  userId: string;
  programId?: string | null;
  stepId?: string | null;
  lessonId?: string | null;
  noteText: string;
  highlightSnippet?: string | null;
  videoTimestampSeconds?: number | null;
  createdAt: string;
  updatedAt: string;
  createdAtUtc?: string;
  updatedAtUtc?: string;
  step?: {
    id: string;
    sequence: number;
    title: string;
  } | null;
  lesson?: {
    id: string;
    title: string;
    type: string;
  } | null;
  program?: {
    id: string;
    title: string;
    slug?: string;
  } | null;
}

export interface CreateStudentNotePayload {
  programId?: string;
  stepId?: string;
  lessonId?: string;
  noteText: string;
  highlightSnippet?: string;
  videoTimestampSeconds?: number;
}

export interface UpdateStudentNotePayload {
  noteText?: string;
  highlightSnippet?: string;
  videoTimestampSeconds?: number;
}

export interface QueryNotesParams {
  programId?: string;
  stepId?: string;
  lessonId?: string;
  search?: string;
  sort?: "asc" | "desc";
}

export async function fetchStudentNotes(params?: QueryNotesParams): Promise<StudentNote[]> {
  const query = new URLSearchParams();
  if (params?.programId) query.set("programId", params.programId);
  if (params?.stepId) query.set("stepId", params.stepId);
  if (params?.lessonId) query.set("lessonId", params.lessonId);
  if (params?.search) query.set("search", params.search);
  if (params?.sort) query.set("sort", params.sort);

  const qs = query.toString();
  const url = `${API_URL}/notes${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { headers: getAuthHeaders() });
  if (!res.ok) {
    const err = await parseApiError(res, "Failed to load student notes");
    throw new Error(err.message);
  }
  return res.json();
}

export async function fetchLessonNotes(lessonId: string): Promise<StudentNote[]> {
  const res = await fetch(`${API_URL}/notes/lessons/${lessonId}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await parseApiError(res, "Failed to load lesson notes");
    throw new Error(err.message);
  }
  return res.json();
}

export async function createStudentNote(payload: CreateStudentNotePayload): Promise<StudentNote> {
  const res = await fetch(`${API_URL}/notes`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await parseApiError(res, "Failed to save note");
    throw new Error(err.message);
  }
  return res.json();
}

export async function updateStudentNote(
  id: string,
  payload: UpdateStudentNotePayload
): Promise<StudentNote> {
  const res = await fetch(`${API_URL}/notes/${id}`, {
    method: "PATCH",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await parseApiError(res, "Failed to update note");
    throw new Error(err.message);
  }
  return res.json();
}

export async function deleteStudentNote(id: string): Promise<{ success: boolean; id: string }> {
  const res = await fetch(`${API_URL}/notes/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await parseApiError(res, "Failed to delete note");
    throw new Error(err.message);
  }
  return res.json();
}

// -----------------------------------------------------------------------------
// WEB PUSH & IN-APP NOTIFICATIONS (TASK 13)
// -----------------------------------------------------------------------------

export interface AppNotification {
  id: string;
  userId: string;
  title: string | null;
  message: string | null;
  link: string | null;
  type: string;
  template: string;
  channel: string;
  deliveryStatus: string;
  sentAt: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPreferences {
  marketingPush: boolean;
  courseUpdates: boolean;
  sessionReminders: boolean;
}

export function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function fetchVapidPublicKey(): Promise<string> {
  const res = await fetch(`${API_URL}/notifications/vapid-public-key`);
  if (!res.ok) return '';
  const data = await res.json();
  return data.publicKey || '';
}

export async function registerPushSubscription(sub: PushSubscription): Promise<boolean> {
  const subJson = sub.toJSON();
  if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) return false;

  const res = await fetch(`${API_URL}/notifications/push-subscribe`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      endpoint: subJson.endpoint,
      keys: {
        p256dh: subJson.keys.p256dh,
        auth: subJson.keys.auth,
      },
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    }),
  });
  return res.ok;
}

export async function fetchNotifications(limit = 50): Promise<AppNotification[]> {
  const res = await cachedFetch(`${API_URL}/notifications/mine?limit=${limit}`, {
    headers: getAuthHeaders(),
    ttlMs: 30_000,
  });
  if (!res.ok) return [];
  return res.json();
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const res = await cachedFetch(`${API_URL}/notifications/unread-count`, {
    headers: getAuthHeaders(),
    ttlMs: 30_000,
  });
  if (!res.ok) return 0;
  const data = await res.json();
  return data.unreadCount || 0;
}

export async function markNotificationAsRead(id: string): Promise<boolean> {
  invalidateTag("notifications");
  const res = await fetch(`${API_URL}/notifications/${id}/read`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
  });
  return res.ok;
}

export async function markAllNotificationsAsRead(): Promise<boolean> {
  invalidateTag("notifications");
  const res = await fetch(`${API_URL}/notifications/mark-all-read`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return res.ok;
}

export async function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  const res = await fetch(`${API_URL}/notifications/preferences`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    return { marketingPush: true, courseUpdates: true, sessionReminders: true };
  }
  return res.json();
}

export async function updateNotificationPreferences(prefs: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
  const res = await fetch(`${API_URL}/notifications/preferences`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(prefs),
  });
  if (!res.ok) {
    throw new Error('Failed to update notification preferences');
  }
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 4: 1-ON-1 COACHING CALL REQUESTS (LMS)
// ─────────────────────────────────────────────────────────────────────────────

export interface OneOnOneRequestDto {
  enrolmentId: string;
  requestedStart: string;
  requestedEnd: string;
  learnerTimezone?: string;
  notes?: string;
  reschedule?: boolean;
}

export interface MyOneOnOneRequest {
  id: string;
  enrolmentId: string;
  userId: string;
  requestedStart: string;
  requestedEnd: string;
  learnerTimezone?: string | null;
  notes?: string | null;
  status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "CANCELLED" | "EXPIRED";
  decisionReason?: string | null;
  session?: {
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    joinUrl?: string | null;
    hostTrainer?: { id: string; name?: string | null; email?: string | null } | null;
  } | null;
  enrolment?: {
    id: string;
    program?: { id: string; title: string } | null;
  };
  createdAt: string;
}

export async function createOneOnOneRequest(payload: OneOnOneRequestDto): Promise<MyOneOnOneRequest> {
  const res = await fetch(`${API_URL}/one-on-one/requests`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await parseApiError(res, 'Failed to submit coaching request');
    throw new Error(err.message);
  }
  invalidateCache("/one-on-one");
  invalidateCache("/progression");
  return res.json();
}

export async function fetchMyOneOnOneRequests(
  enrolmentId?: string,
  skipCache = false
): Promise<MyOneOnOneRequest[]> {
  const query = enrolmentId ? `?enrolmentId=${encodeURIComponent(enrolmentId)}` : "";
  const res = await cachedFetch(`${API_URL}/one-on-one/my-requests${query}`, {
    headers: getAuthHeaders(),
    ttlMs: 30_000,
    skipCache,
  });
  if (!res.ok) {
    const err = await parseApiError(res, 'Failed to fetch coaching requests');
    throw new Error(err.message);
  }
  return res.json();
}

export async function cancelOneOnOneRequest(id: string): Promise<MyOneOnOneRequest> {
  const res = await fetch(`${API_URL}/one-on-one/requests/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await parseApiError(res, 'Failed to cancel coaching request');
    throw new Error(err.message);
  }
  invalidateCache("/one-on-one");
  invalidateCache("/progression");
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 5: MISSION STATEMENTS (D1-041)
// ─────────────────────────────────────────────────────────────────────────────

export interface MissionStatementSubmission {
  id: string;
  enrolmentId: string;
  userId: string;
  version: number;
  storageKey: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  status: "SUBMITTED" | "APPROVED" | "REJECTED";
  reviewerId?: string | null;
  reviewedAt?: string | null;
  feedback?: string | null;
  createdAt: string;
  updatedAt: string;
  reviewer?: {
    id: string;
    name?: string | null;
    email?: string | null;
  } | null;
}

export async function fetchMyMissionStatements(enrolmentId?: string): Promise<MissionStatementSubmission[]> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const url = new URL(`${API_URL}/mission-statements/my-submissions`);
  if (enrolmentId) {
    url.searchParams.set("enrolmentId", enrolmentId);
  }
  const res = await fetch(url.toString(), {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const err = await parseApiError(res, "Failed to fetch mission statement submissions");
    throw new Error(err.message);
  }
  return res.json();
}

export async function submitMissionStatement(
  enrolmentId: string,
  file: File
): Promise<MissionStatementSubmission> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const formData = new FormData();
  formData.append("enrolmentId", enrolmentId);
  formData.append("file", file);

  const res = await fetch(`${API_URL}/mission-statements/submit`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });
  if (!res.ok) {
    const err = await parseApiError(res, "Failed to submit mission statement");
    throw new Error(err.message);
  }
  return res.json();
}

