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
}

/**
 * Automatically purges cached GET responses when mutating endpoints are called.
 */
export function autoInvalidateOnMutation(url: string): void {
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
  ];

  for (const r of resources) {
    if (url.includes(`/${r}`)) {
      invalidateCache(`/${r}`);
      if (r === "sessions" || r === "bookings") {
        invalidateCache("/sessions");
        invalidateCache("/bookings");
      }
      if (r === "progression" || r === "progress" || r === "quizzes") {
        invalidateCache("/progression");
        invalidateCache("/progress");
        invalidateCache("/quizzes");
        invalidateCache("/certificates");
      }
      if (r === "certificates") {
        invalidateCache("/certificates");
      }
      if (r === "agreements") {
        invalidateCache("/agreements");
        invalidateCache("/progression");
      }
      break;
    }
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
  const timeoutMs = init?.timeoutMs ?? 15_000; // 15s default request timeout

  // Auto-bust cache on mutations
  if (!isGet) {
    autoInvalidateOnMutation(url);
  }

  const cacheKey = isGet ? getCacheKey(url, init?.headers) : null;

  // 1. SWR / In-Memory Cache Check for GET requests
  if (isGet && !skipCache && cacheKey) {
    const cached = apiCache.get(cacheKey);
    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < cached.ttlMs) {
        // Fresh hit: touch LRU order and serve immediately without network round trip
        apiCache.delete(cacheKey);
        apiCache.set(cacheKey, cached);
        return new Response(cached.bodyText, {
          status: cached.status,
          statusText: cached.statusText,
          headers: new Headers(cached.headers),
        });
      } else if (age < cached.ttlMs * 2) {
        // Stale-While-Revalidate window: serve cached data immediately, revalidate in background
        apiCache.delete(cacheKey);
        apiCache.set(cacheKey, cached);
        triggerBackgroundRevalidate(url, init, cacheKey, ttlMs, timeoutMs);
        return new Response(cached.bodyText, {
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
    const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
    logSlowApiCall(method, url, resPayload.status, durationMs, resPayload.headers, "Deduplicated");
    return new Response(resPayload.bodyText, {
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

      const res = await rawFetch(url, { ...init, signal: abortController.signal });
      clearTimeout(timeoutTimer);

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
  const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
  logSlowApiCall(method, url, result.status, durationMs, result.headers, "Network");
  return new Response(result.bodyText, {
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
  if (!(window as any).__apiFetchPatched) {
    (window as any).__rawOriginalFetch = window.fetch;
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => cachedFetch(input, init);
    (window as any).__apiFetchPatched = true;
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
