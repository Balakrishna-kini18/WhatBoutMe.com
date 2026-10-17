import { onThisHost } from "./host";

export const API_URL = onThisHost(
  process.env.NEXT_PUBLIC_API_URL ||
    (typeof window !== "undefined" && window.location.hostname.endsWith(".vercel.app")
      ? "https://what-bout-me-com.vercel.app"
      : "http://localhost:4000")
);

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
  // Whenever any mutation occurs in the admin portal, purge the relevant cache domain immediately
  const isCurriculum = /\/(programs|steps|lessons|quizzes|questions)/.test(url);
  if (isCurriculum) {
    invalidateCache("/programs");
    invalidateCache("/steps");
    invalidateCache("/lessons");
    invalidateCache("/quizzes");
    invalidateCache("/questions");
    invalidateCache("/dashboard");
    return;
  }

  const isBatchOrSession = /\/(batches|sessions|attendance)/.test(url);
  if (isBatchOrSession) {
    invalidateCache("/batches");
    invalidateCache("/sessions");
    invalidateCache("/attendance");
    invalidateCache("/dashboard");
    return;
  }

  const isFinance = /\/(invoices|credit-notes|revenue|coupons)/.test(url);
  if (isFinance) {
    invalidateCache("/invoices");
    invalidateCache("/credit-notes");
    invalidateCache("/revenue");
    invalidateCache("/coupons");
    invalidateCache("/dashboard");
    return;
  }

  const isGallery = /\/gallery/.test(url);
  if (isGallery) {
    invalidateCache("/gallery");
    invalidateCache("/admin/gallery");
    return;
  }

  const isCrmOrMessages = /\/(leads|messages|conversations|contact)/.test(url);
  if (isCrmOrMessages) {
    invalidateCache("/leads");
    invalidateCache("/messages");
    invalidateCache("/messages/conversations");
    return;
  }

  // Fallback: clear the entire cache to guarantee immediate UI updates
  clearApiCache();
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

  // Auto-inject Authorization token from localStorage if in browser and not explicitly provided
  const requestHeaders = new Headers(init?.headers);
  if (typeof window !== "undefined" && !requestHeaders.has("Authorization")) {
    const token = localStorage.getItem("token");
    if (token) {
      requestHeaders.set("Authorization", `Bearer ${token}`);
    }
  }

  // Auto-bust cache on mutations
  if (!isGet) {
    autoInvalidateOnMutation(url);
  }

  const cacheKey = isGet ? getCacheKey(url, requestHeaders) : null;

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

      let res = await rawFetch(url, { ...init, headers: requestHeaders, signal: abortController.signal });
      clearTimeout(timeoutTimer);

      // Handle transparent 401 token refresh for authenticated requests
      const isAuthRoute = /\/auth\/(login|signup|admin-login|refresh|2fa)/.test(url);
      if (res.status === 401 && !isAuthRoute && typeof window !== "undefined") {
        const currentToken = localStorage.getItem("token");
        const renewedToken = await renewOnce(rawFetch, currentToken);

        if (renewedToken && renewedToken !== "signed-out") {
          requestHeaders.set("Authorization", `Bearer ${renewedToken}`);
          res = await rawFetch(url, { ...init, headers: requestHeaders, signal: abortController.signal });
        } else if (renewedToken === "signed-out") {
          try {
            const clone = res.clone();
            const errData = await clone.json();
            const errCode = typeof errData.error === "string" ? errData.error : errData.error?.code;
            if (errCode === "SESSION_REVOKED") {
              localStorage.clear();
              clearApiCache();
              if (window.location.pathname !== "/login") {
                alert("You were signed out because your account was logged into on another device.");
                window.location.href = "/login";
              }
              return {
                bodyText: JSON.stringify(errData),
                status: 401,
                statusText: "Unauthorized",
                headers: [],
              };
            }
          } catch {}
          localStorage.clear();
          clearApiCache();
          if (window.location.pathname !== "/login") {
            window.location.href = "/login";
          }
        }
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
  const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
  logSlowApiCall(method, url, result.status, durationMs, result.headers, "Network");
  return new Response(result.bodyText, {
    status: result.status,
    statusText: result.statusText,
    headers: new Headers(result.headers),
  });
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

/** Uploads an image or PDF and returns its public address. */
export async function uploadFile(file: File): Promise<string> {
  const mimeType =
    file.type ||
    (/\.pdf$/i.test(file.name)
      ? "application/pdf"
      : /\.png$/i.test(file.name)
      ? "image/png"
      : /\.(jpe?g)$/i.test(file.name)
      ? "image/jpeg"
      : /\.webp$/i.test(file.name)
      ? "image/webp"
      : /\.gif$/i.test(file.name)
      ? "image/gif"
      : /\.docx?$/i.test(file.name)
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : /\.txt$/i.test(file.name)
      ? "text/plain"
      : /\.mp4$/i.test(file.name)
      ? "video/mp4"
      : /\.mp3$/i.test(file.name)
      ? "audio/mpeg"
      : "application/octet-stream");

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const headers: Record<string, string> = { "Content-Type": mimeType };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await cachedFetch(`${API_URL}/uploads`, {
    method: "POST",
    headers,
    body: file,
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Could not upload the file"));
  return (await res.json()).url;
}

// -----------------------------------------------------------------------------
// EVENT MANAGEMENT & TICKETING INTERFACES
// -----------------------------------------------------------------------------

export type EventLocationType = "ONLINE" | "PHYSICAL";
export type CurrencyCode = "USD" | "AED" | "INR";
export type EventPaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED";

export interface EventItem {
  id: string;
  title: string;
  slug: string;
  description: string;
  bannerUrl?: string | null;
  startDateTime: string;
  endDateTime?: string | null;
  timezone: string;
  locationType: EventLocationType;
  meetingLink?: string | null;
  onlineMeetingLink?: string | null;
  venueName?: string | null;
  venueAddress?: string | null;
  physicalAddress?: string | null;
  price: number;
  amount?: number;
  currency: CurrencyCode;
  seatLimit?: number | null;
  capacity?: number | null;
  seatsBooked: number;
  seatsRemaining?: number | null;
  isSoldOut?: boolean;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;

  // Backward compatibility aliases
  startDateTimeUtc?: string;
  endDateTimeUtc?: string | null;
  startAt?: string;
  endAt?: string;
  location?: string | null;
  coverImageUrl?: string | null;
  maxRegistrations?: number | null;
  registrationCount?: number;
}

export interface CreateEventPayload {
  title: string;
  description: string;
  startDateTime: string;
  startDateTimeUtc?: string;
  endDateTime?: string;
  endDateTimeUtc?: string;
  timezone?: string;
  locationType: EventLocationType;
  meetingLink?: string;
  onlineMeetingLink?: string;
  venueName?: string;
  venueAddress?: string;
  physicalAddress?: string;
  price: number;
  amount?: number;
  currency: CurrencyCode;
  seatLimit?: number | null;
  capacity?: number | null;
  isPublished?: boolean;
  bannerUrl?: string;
}

export interface UpdateEventPayload {
  title?: string;
  description?: string;
  startDateTime?: string;
  startDateTimeUtc?: string;
  endDateTime?: string;
  endDateTimeUtc?: string;
  timezone?: string;
  locationType?: EventLocationType;
  meetingLink?: string;
  onlineMeetingLink?: string;
  venueName?: string;
  venueAddress?: string;
  physicalAddress?: string;
  price?: number;
  amount?: number;
  currency?: CurrencyCode;
  seatLimit?: number | null;
  capacity?: number | null;
  isPublished?: boolean;
  bannerUrl?: string;
}

export interface EventRegistrationItem {
  id: string;
  eventId: string;
  userId?: string | null;
  attendeeName: string;
  attendeeEmail: string;
  attendeePhone: string;
  amount: number;
  currency: CurrencyCode;
  paymentGateway: string;
  gatewayOrderId?: string | null;
  gatewayPaymentId?: string | null;
  paymentStatus: EventPaymentStatus;
  emailSent: boolean;
  registeredAt: string;
  createdAt: string;
  updatedAt: string;

  // Backward compatibility aliases
  fullName?: string;
  email?: string;
  phone?: string;
  status?: string;
}

export interface EventRegistrationsResponse {
  event: EventItem;
  kpis: {
    totalConfirmed: number;
    totalRegistrations: number;
    seatsRemaining: number | null;
    seatLimit: number | null;
    seatsBooked: number;
    revenueByCurrency: Record<string, number>;
  };
  registrations: EventRegistrationItem[];
}

// -----------------------------------------------------------------------------
// GALLERY MANAGEMENT INTERFACES & HELPERS
// -----------------------------------------------------------------------------

export interface GalleryItem {
  id: string;
  title: string;
  description?: string | null;
  imageUrl: string;
  altText?: string | null;
  category?: string | null;
  displayOrder: number;
  sortOrder?: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGalleryItemPayload {
  title: string;
  description?: string;
  imageUrl: string;
  altText?: string;
  category?: string;
  displayOrder?: number;
  sortOrder?: number;
  isPublished?: boolean;
}

export interface UpdateGalleryItemPayload {
  title?: string;
  description?: string;
  imageUrl?: string;
  altText?: string;
  category?: string;
  displayOrder?: number;
  sortOrder?: number;
  isPublished?: boolean;
}

export async function getAdminGallery(params?: {
  category?: string;
  isPublished?: boolean;
}): Promise<{ items: GalleryItem[]; total: number }> {
  const query = new URLSearchParams();
  if (params?.category) query.set("category", params.category);
  if (params?.isPublished !== undefined) query.set("isPublished", String(params.isPublished));
  const queryString = query.toString();
  const endpoint = queryString ? `/admin/gallery?${queryString}` : "/admin/gallery";
  const data = await apiGet<{ items: GalleryItem[]; total: number } | GalleryItem[]>(endpoint);
  if (Array.isArray(data)) {
    return { items: data, total: data.length };
  }
  return { items: data.items || [], total: data.total ?? (data.items?.length || 0) };
}

export async function uploadGalleryImage(file: File): Promise<{ imageUrl: string }> {
  const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/avif"];
  if (!allowed.includes(file.type)) {
    throw new Error("Invalid image format. Allowed formats: PNG, JPEG, WEBP, AVIF.");
  }
  const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
  if (file.size > MAX_SIZE) {
    throw new Error("Image file size exceeds the 5 MB limit.");
  }

  const formData = new FormData();
  formData.append("file", file);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await cachedFetch(`${API_URL}/admin/gallery/upload`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!res.ok) {
    throw new Error(await errorMessage(res, "Could not upload gallery image"));
  }

  return res.json();
}

export async function createGalleryItem(payload: CreateGalleryItemPayload): Promise<GalleryItem> {
  return apiPost<GalleryItem>("/admin/gallery", payload);
}

export async function updateGalleryItem(
  id: string,
  payload: UpdateGalleryItemPayload
): Promise<GalleryItem> {
  return apiPut<GalleryItem>(`/admin/gallery/${id}`, payload);
}

export async function deleteGalleryItem(id: string): Promise<{ success: boolean; id: string }> {
  return apiDelete<{ success: boolean; id: string }>(`/admin/gallery/${id}`);
}

// -----------------------------------------------------------------------------
// PAYMENTS & INVOICES INTERFACES & HELPERS
// -----------------------------------------------------------------------------

export interface InvoiceItem {
  id: string;
  invoiceNumber: string;
  client: string;
  clientEmail?: string | null;
  amount: string;
  numericAmount?: number;
  currency?: string;
  status: string;
  pdfUrl?: string | null;
  creditNoteId?: string | null;
  date: string;
}

export interface SimulateTestPaymentPayload {
  targetType: "ENROLMENT" | "EVENT";
  targetId?: string;
  enrolmentId?: string;
  eventRegistrationId?: string;
  userId?: string;
  amount?: number;
  currency?: "USD" | "AED" | "INR";
  status?: "PAID" | "FAILED";
  failureReason?: string;
  idempotencyKey?: string;
  couponCode?: string;
}

export interface SimulateTestPaymentResponse {
  success: boolean;
  status: "PAID" | "FAILED";
  enrolmentId?: string;
  paymentId?: string;
  invoiceNumber?: string | null;
  invoiceUrl?: string | null;
  idempotent?: boolean;
  message?: string;
}

export async function simulateTestPayment(
  payload: SimulateTestPaymentPayload
): Promise<SimulateTestPaymentResponse> {
  return apiPost<SimulateTestPaymentResponse>("/payments/webhook/test-simulate", payload);
}

export async function resendInvoice(id: string): Promise<{ success: boolean; message: string }> {
  return apiPost<{ success: boolean; message: string }>(`/invoices/${id}/resend`, {});
}

export function getInvoicePdfUrl(id: string): string {
  return `${API_URL}/invoices/${id}/pdf`;
}

export function getInvoiceDownloadUrl(id: string): string {
  return `${API_URL}/invoices/${id}/download`;
}

export interface CourseFaq {
  id: string;
  question: string;
  answer: string;
  sortOrder: number;
}

export async function duplicateProgram(id: string): Promise<any> {
  return apiPost<any>(`/programs/${id}/duplicate`, {});
}

// -----------------------------------------------------------------------------
// NOTIFICATION BROADCAST & DELIVERY LOGS (TASK 13)
// -----------------------------------------------------------------------------

export interface BroadcastNotificationPayload {
  target: 'ALL' | 'BATCH' | 'USER';
  targetId?: string;
  title: string;
  message: string;
  link?: string;
  channels: ('IN_APP' | 'PUSH' | 'EMAIL')[];
}

export interface BroadcastResult {
  success: boolean;
  recipientsCount: number;
  inAppSent: number;
  pushSent: number;
  emailSent: number;
}

export interface NotificationLogItem {
  id: string;
  title: string;
  message: string | null;
  recipient: string;
  recipientName: string | null;
  userTimezone: string;
  channel: string;
  deliveryStatus: string;
  createdAtUtc: string;
  sentAtUtc: string | null;
  readAtUtc: string | null;
}

export interface EmailLogItem {
  id: string;
  to: string;
  subject: string;
  template: string | null;
  status: string;
  providerId: string | null;
  error: string | null;
  createdAtUtc: string;
}

export interface DeliveryLogsResponse {
  notifications: NotificationLogItem[];
  emails: EmailLogItem[];
}

export async function broadcastNotification(payload: BroadcastNotificationPayload): Promise<BroadcastResult> {
  return apiPost<BroadcastResult>('/notifications/broadcast', payload);
}

export async function fetchDeliveryLogs(limit = 50): Promise<DeliveryLogsResponse> {
  return apiGet<DeliveryLogsResponse>(`/notifications/logs?limit=${limit}`);
}



