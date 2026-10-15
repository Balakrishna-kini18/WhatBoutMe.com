/**
 * Edge / SSR Lightweight LRU + TTL Cache with Tag-based Invalidation
 * Designed for Next.js App Router and Edge/Node runtimes to eliminate redundant reads.
 */

export interface CacheItem<T> {
  value: T;
  expiresAt: number;
  lastAccessed: number;
  tags: Set<string>;
}

export class EdgeLRUCache {
  private readonly capacity: number;
  private readonly cache = new Map<string, CacheItem<any>>();
  private readonly tagToKeys = new Map<string, Set<string>>();
  private readonly inFlight = new Map<string, Promise<any>>();

  constructor(capacity = 1000) {
    this.capacity = capacity;
  }

  private registerTags(key: string, tags: string[] = []): void {
    for (const tag of tags) {
      if (!tag) continue;
      let keys = this.tagToKeys.get(tag);
      if (!keys) {
        keys = new Set();
        this.tagToKeys.set(tag, keys);
      }
      keys.add(key);
    }
  }

  private unregisterKey(key: string): void {
    for (const [tag, keys] of this.tagToKeys.entries()) {
      if (keys.delete(key) && keys.size === 0) {
        this.tagToKeys.delete(tag);
      }
    }
  }

  private evictLRUIfNeeded(): void {
    while (this.cache.size >= this.capacity) {
      const oldestKey = this.cache.keys().next().value;
      if (!oldestKey) break;
      this.cache.delete(oldestKey);
      this.unregisterKey(oldestKey);
    }
  }

  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;

    if (item.expiresAt <= Date.now()) {
      this.cache.delete(key);
      this.unregisterKey(key);
      return null;
    }

    // Move to end to preserve LRU ordering in Map
    item.lastAccessed = Date.now();
    this.cache.delete(key);
    this.cache.set(key, item);
    return item.value as T;
  }

  set<T>(key: string, value: T, ttlSeconds: number = 60, tags: string[] = []): void {
    this.evictLRUIfNeeded();
    const now = Date.now();
    this.cache.set(key, {
      value,
      expiresAt: now + ttlSeconds * 1000,
      lastAccessed: now,
      tags: new Set(tags),
    });
    this.registerTags(key, tags);
  }

  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds: number = 60,
    tags: string[] = []
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) return cached;

    if (this.inFlight.has(key)) {
      return this.inFlight.get(key) as Promise<T>;
    }

    const promise = (async () => {
      const data = await fetcher();
      if (data !== null && data !== undefined) {
        this.set(key, data, ttlSeconds, tags);
      }
      return data;
    })().finally(() => {
      this.inFlight.delete(key);
    });

    this.inFlight.set(key, promise);
    return promise;
  }

  invalidate(key: string): void {
    this.cache.delete(key);
    this.unregisterKey(key);
  }

  invalidateTag(tag: string): number {
    const keys = this.tagToKeys.get(tag);
    if (!keys || keys.size === 0) return 0;

    let count = 0;
    const keyList = Array.from(keys);
    for (const key of keyList) {
      this.cache.delete(key);
      count++;
    }
    this.tagToKeys.delete(tag);
    return count;
  }

  invalidateTags(tags: string[]): number {
    return tags.reduce((sum, tag) => sum + this.invalidateTag(tag), 0);
  }

  clear(): void {
    this.cache.clear();
    this.tagToKeys.clear();
    this.inFlight.clear();
  }
}

// Global singleton for Next.js SSR / API routes
const globalForCache = globalThis as unknown as { edgeLRUCache?: EdgeLRUCache };
export const edgeCache = globalForCache.edgeLRUCache ?? new EdgeLRUCache(1000);
if (process.env.NODE_ENV !== 'production') globalForCache.edgeLRUCache = edgeCache;
