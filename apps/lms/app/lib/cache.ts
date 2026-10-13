/**
 * Client-side SWR (Stale-While-Revalidate) Cache & Intelligent Prefetcher
 *
 * Provides:
 * 1. In-flight request deduplication (prevents duplicate parallel requests)
 * 2. Instant cache hits (zero wait time for previously visited or prefetched data)
 * 3. Silent background revalidation (keeps data fresh without blocking UI)
 * 4. Optimistic mutations (instant UI updates before server confirmation)
 * 5. Predictive route & data prefetching
 */

import { getAuthHeaders } from "./api";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  etag?: string | null;
}

const memoryCache = new Map<string, CacheEntry<any>>();
const inFlightRequests = new Map<string, Promise<any>>();

// Default time-to-live: 4 minutes
const DEFAULT_TTL_MS = 4 * 60 * 1000;

/**
 * Fetch data with in-memory caching and request deduplication.
 * If fresh cached data exists, returns it immediately.
 * If stale cached data exists, returns stale data and revalidates in the background.
 */
export async function fetchWithCache<T>(
  url: string,
  options: RequestInit = {},
  ttlMs: number = DEFAULT_TTL_MS,
  onBackgroundUpdate?: (newData: T) => void
): Promise<T> {
  const cacheKey = `${options.method || "GET"}:${url}`;
  const now = Date.now();
  const cached = memoryCache.get(cacheKey);

  // Fresh cache hit -> return immediately
  if (cached && now - cached.timestamp < ttlMs) {
    return cached.data as T;
  }

  // Stale cache hit -> return stale data immediately, revalidate in background
  if (cached && onBackgroundUpdate) {
    // Fire background revalidation without blocking caller
    revalidateInBackground(url, cacheKey, options, onBackgroundUpdate).catch(() => {});
    return cached.data as T;
  }

  // Check if an identical request is already in-flight (deduplication)
  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey) as Promise<T>;
  }

  // Perform network request
  const requestPromise = (async () => {
    try {
      const mergedHeaders = {
        ...getAuthHeaders(),
        ...(options.headers as Record<string, string> || {}),
      };

      const res = await fetch(url, {
        ...options,
        headers: mergedHeaders,
      });

      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }

      const data = await res.json();
      memoryCache.set(cacheKey, {
        data,
        timestamp: Date.now(),
      });
      return data as T;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, requestPromise);
  return requestPromise;
}

/**
 * Perform silent background revalidation and notify subscriber if data changed
 */
async function revalidateInBackground<T>(
  url: string,
  cacheKey: string,
  options: RequestInit,
  onUpdate: (newData: T) => void
): Promise<void> {
  if (inFlightRequests.has(cacheKey)) return;

  const bgPromise = (async () => {
    try {
      const mergedHeaders = {
        ...getAuthHeaders(),
        ...(options.headers as Record<string, string> || {}),
      };

      const res = await fetch(url, {
        ...options,
        headers: mergedHeaders,
      });

      if (res.ok) {
        const newData = await res.json();
        const prev = memoryCache.get(cacheKey);
        memoryCache.set(cacheKey, {
          data: newData,
          timestamp: Date.now(),
        });

        // Only notify if JSON serialized string differs
        if (!prev || JSON.stringify(prev.data) !== JSON.stringify(newData)) {
          onUpdate(newData);
        }
      }
    } catch {
      // Ignore background errors silently
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, bgPromise);
}

/**
 * Prefetch a URL into cache in the background (fire-and-forget)
 */
export function prefetchUrl(url: string, options: RequestInit = {}): void {
  const cacheKey = `${options.method || "GET"}:${url}`;
  if (memoryCache.has(cacheKey) || inFlightRequests.has(cacheKey)) return;

  // Use requestIdleCallback if available, otherwise setTimeout
  const schedule = typeof window !== "undefined" && "requestIdleCallback" in window
    ? (cb: () => void) => (window as any).requestIdleCallback(cb, { timeout: 2000 })
    : (cb: () => void) => setTimeout(cb, 100);

  schedule(() => {
    fetchWithCache(url, options).catch(() => {});
  });
}

/**
 * Optimistically mutate cached data
 */
export function mutateCache<T>(
  url: string,
  updater: T | ((current: T | undefined) => T),
  method: string = "GET"
): void {
  const cacheKey = `${method}:${url}`;
  const existing = memoryCache.get(cacheKey);
  const updatedData = typeof updater === "function"
    ? (updater as (c: T | undefined) => T)(existing?.data)
    : updater;

  memoryCache.set(cacheKey, {
    data: updatedData,
    timestamp: Date.now(),
  });
}

/**
 * Synchronously read cached data if present (0ms instant access)
 */
export function getCachedData<T>(url: string, method: string = "GET"): T | undefined {
  const cacheKey = `${method}:${url}`;
  return memoryCache.get(cacheKey)?.data as T | undefined;
}

/**
 * Clear cached entries matching optional prefix
 */
export function invalidateCache(urlPrefix?: string): void {
  if (!urlPrefix) {
    memoryCache.clear();
    return;
  }
  for (const key of memoryCache.keys()) {
    if (key.includes(urlPrefix)) {
      memoryCache.delete(key);
    }
  }
}
