import { Injectable, Logger } from '@nestjs/common';
import { Redis } from '@upstash/redis';
import { Role } from '@prisma/client';

interface LocalCacheItem {
  value: number;
  expiresAt: number;
}

interface MemoryCacheItem {
  value: any;
  expiresAt: number;
  lastAccessed: number;
  tags: Set<string>;
}

@Injectable()
export class CacheHelperService {
  private readonly redis: Redis | null = null;
  private readonly logger = new Logger(CacheHelperService.name);
  private readonly nsVersionCache = new Map<string, LocalCacheItem>();
  private readonly nsVersions = new Map<string, number>();

  // In-Memory LRU Cache with TTL and Tag Indexing
  private readonly memoryCache = new Map<string, MemoryCacheItem>();
  private readonly tagToKeys = new Map<string, Set<string>>();
  private readonly keyToTags = new Map<string, Set<string>>();
  private readonly maxCapacity: number;

  private readonly inFlightPromises = new Map<string, Promise<any>>();

  constructor() {
    this.maxCapacity = process.env.CACHE_MAX_ENTRIES
      ? parseInt(process.env.CACHE_MAX_ENTRIES, 10)
      : 5000;

    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (url && token) {
      try {
        this.redis = new Redis({ url, token });
        // Probe Redis on cold start: if quota is exceeded, degrade gracefully without blocking
        this.redis.get('__probe__').catch((err: any) => {
          if (err?.message?.includes('limit exceeded')) {
            this.logger.warn('Upstash Redis quota limit reached. Gracefully using high-speed in-memory cache.');
            (this as any).redis = null;
          }
        });
        this.logger.log('Upstash Redis initialized for caching');
      } catch (err: any) {
        this.logger.warn(`Upstash Redis constructor error (caching disabled, using local fallbacks): ${err?.message || String(err).slice(0, 200)}`);
        (this as any).redis = null;
      }
    } else {
      this.logger.warn('Upstash Redis credentials missing. Using local in-memory cache.');
    }

    // Periodic sweep every 60 seconds to clean expired items from memory and prevent unbounded growth
    setInterval(() => {
      const now = Date.now();
      for (const [k, v] of this.nsVersionCache.entries()) {
        if (v.expiresAt <= now) {
          this.nsVersionCache.delete(k);
        }
      }
      for (const [k, v] of this.memoryCache.entries()) {
        if (v.expiresAt <= now) {
          this.memoryCache.delete(k);
          this.unregisterKeyTags(k);
        }
      }
    }, 60000).unref();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // LRU & TAG INDEXING INTERNALS
  // ─────────────────────────────────────────────────────────────────────────────

  private registerKeyTags(key: string, tags: string[] = []): void {
    if (!tags || tags.length === 0) return;

    let keyTagSet = this.keyToTags.get(key);
    if (!keyTagSet) {
      keyTagSet = new Set();
      this.keyToTags.set(key, keyTagSet);
    }

    for (const tag of tags) {
      if (!tag) continue;
      keyTagSet.add(tag);
      let keySet = this.tagToKeys.get(tag);
      if (!keySet) {
        keySet = new Set();
        this.tagToKeys.set(tag, keySet);
      }
      keySet.add(key);
    }
  }

  private unregisterKeyTags(key: string): void {
    const tags = this.keyToTags.get(key);
    if (!tags) return;

    for (const tag of tags) {
      const keySet = this.tagToKeys.get(tag);
      if (keySet) {
        keySet.delete(key);
        if (keySet.size === 0) {
          this.tagToKeys.delete(tag);
        }
      }
    }
    this.keyToTags.delete(key);
  }

  private evictLRUIfNeeded(): void {
    while (this.memoryCache.size >= this.maxCapacity) {
      // The first entry in JS Map iteration order is the oldest inserted/accessed
      const oldestKey = this.memoryCache.keys().next().value;
      if (!oldestKey) break;
      this.memoryCache.delete(oldestKey);
      this.unregisterKeyTags(oldestKey);
    }
  }

  private touchLRU(key: string, item: MemoryCacheItem): void {
    // Re-inserting the key moves it to the most recent position in Map insertion order
    item.lastAccessed = Date.now();
    this.memoryCache.delete(key);
    this.memoryCache.set(key, item);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CORE CACHE API (LRU + TTL + TAGGED)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Fail-open execution wrapper with fast in-memory LRU fallback, Promise coalescing, and tag support.
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds: number = 3600,
    tags: string[] = []
  ): Promise<T> {
    const now = Date.now();

    // 1. Check local in-memory LRU cache first
    const local = this.memoryCache.get(key);
    if (local) {
      if (local.expiresAt > now) {
        this.touchLRU(key, local);
        return local.value as T;
      }
      // Expired entry
      this.memoryCache.delete(key);
      this.unregisterKeyTags(key);
    }

    // 2. Promise Coalescing: If there is an active fetcher for this key, return its promise
    if (this.inFlightPromises.has(key)) {
      return this.inFlightPromises.get(key) as Promise<T>;
    }

    const promise = (async () => {
      // 3. Check Redis tier if available
      if (this.redis) {
        try {
          const cached = await this.redis.get(key);
          if (cached !== null && cached !== undefined) {
            this.evictLRUIfNeeded();
            const tagSet = new Set(tags);
            this.memoryCache.set(key, {
              value: cached,
              expiresAt: now + ttlSeconds * 1000,
              lastAccessed: now,
              tags: tagSet,
            });
            this.registerKeyTags(key, tags);
            return cached as T;
          }
        } catch (e: any) {
          if (e?.message?.includes('limit exceeded')) {
            this.logger.warn('Upstash Redis monthly request limit reached. Gracefully degrading to in-memory local fallback.');
            (this as any).redis = null;
          } else {
            this.logger.error(`Redis GET error for key ${key}: ${e.message}`);
          }
        }
      }

      // 4. Cache miss: execute the underlying database fetcher
      const data = await fetcher();

      if (data !== null && data !== undefined) {
        // Populate local LRU memory cache
        this.evictLRUIfNeeded();
        const tagSet = new Set(tags);
        this.memoryCache.set(key, {
          value: data,
          expiresAt: Date.now() + ttlSeconds * 1000,
          lastAccessed: Date.now(),
          tags: tagSet,
        });
        this.registerKeyTags(key, tags);

        // Populate Redis if online
        if (this.redis) {
          try {
            this.redis.set(key, data, { ex: ttlSeconds }).catch((e: any) => {
              if (e?.message?.includes('limit exceeded')) {
                (this as any).redis = null;
              } else {
                this.logger.error(`Redis SET error for key ${key}: ${e.message}`);
              }
            });
          } catch (e: any) {
            this.logger.error(`Redis SET init error for key ${key}: ${e.message}`);
          }
        }
      }

      return data;
    })().finally(() => {
      this.inFlightPromises.delete(key);
    });

    this.inFlightPromises.set(key, promise);
    return promise;
  }

  async get<T>(key: string): Promise<T | null> {
    const local = this.memoryCache.get(key);
    if (local) {
      if (local.expiresAt > Date.now()) {
        this.touchLRU(key, local);
        return local.value as T;
      }
      this.memoryCache.delete(key);
      this.unregisterKeyTags(key);
    }
    if (!this.redis) return null;
    try {
      const val = await this.redis.get(key);
      if (val !== null && val !== undefined) {
        return val as T;
      }
      return null;
    } catch (e: any) {
      this.logger.error(`Redis GET error for key ${key}: ${e.message}`);
      return null;
    }
  }

  async set<T>(
    key: string,
    value: T,
    ttlSeconds: number = 600,
    tags: string[] = []
  ): Promise<void> {
    this.evictLRUIfNeeded();
    const now = Date.now();
    this.memoryCache.set(key, {
      value,
      expiresAt: now + ttlSeconds * 1000,
      lastAccessed: now,
      tags: new Set(tags),
    });
    this.registerKeyTags(key, tags);

    if (!this.redis) return;
    try {
      await this.redis.set(key, value, { ex: ttlSeconds });
    } catch (e: any) {
      this.logger.error(`Redis SET error for key ${key}: ${e.message}`);
    }
  }

  async invalidate(key: string): Promise<void> {
    this.memoryCache.delete(key);
    this.unregisterKeyTags(key);
    if (!this.redis) return;
    try {
      await this.redis.del(key);
    } catch (e: any) {
      this.logger.error(`Redis DEL error for key ${key}: ${e.message}`);
    }
  }

  async del(key: string): Promise<void> {
    return this.invalidate(key);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TAG-BASED INVALIDATION HOOKS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Invalidates all cache entries across local memory and Redis tagged with the specified tag.
   * Also increments the version of the corresponding namespace.
   */
  async invalidateTag(tag: string): Promise<number> {
    let purgedCount = 0;
    const keys = this.tagToKeys.get(tag);

    if (keys && keys.size > 0) {
      const keyList = Array.from(keys);
      for (const k of keyList) {
        this.memoryCache.delete(k);
        this.unregisterKeyTags(k);
        purgedCount++;
      }

      if (this.redis) {
        try {
          await Promise.allSettled(keyList.map((k) => this.redis!.del(k)));
        } catch (e: any) {
          this.logger.error(`Redis tag DEL error for tag ${tag}: ${e.message}`);
        }
      }
    }

    // Also invalidate the corresponding namespace version for multi-node / edge consistency
    await this.invalidateNamespace(tag);
    this.logger.log(`Invalidated cache tag [${tag}]: purged ${purgedCount} entries`);
    return purgedCount;
  }

  /**
   * Concurrently invalidates multiple cache tags.
   */
  async invalidateTags(tags: string[]): Promise<number> {
    if (!tags || tags.length === 0) return 0;
    const results = await Promise.all(tags.map((t) => this.invalidateTag(t)));
    return results.reduce((sum, count) => sum + count, 0);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // VERSIONED NAMESPACES SUPPORT
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Generates a dynamic, versioned cache key.
   * Format: `namespace:v{version}:key`
   */
  async getVersionedKey(namespace: string, keySuffix: string): Promise<string> {
    if (!this.redis) {
      const version = this.nsVersions.get(namespace) || 1;
      return `${namespace}:v${version}:${keySuffix}`;
    }

    const now = Date.now();
    const local = this.nsVersionCache.get(namespace);
    if (local && local.expiresAt > now) {
      return `${namespace}:v${local.value}:${keySuffix}`;
    }

    try {
      let version = (await this.redis.get(`ns_version:${namespace}`)) as number;
      if (!version) {
        version = 1;
        await this.redis.set(`ns_version:${namespace}`, 1);
      }

      this.nsVersionCache.set(namespace, { value: version, expiresAt: now + 5000 });
      return `${namespace}:v${version}:${keySuffix}`;
    } catch (e: any) {
      if (e?.message?.includes('limit exceeded')) {
        this.logger.warn('Upstash Redis monthly request limit reached. Gracefully degrading to in-memory local fallback.');
        (this as any).redis = null;
        const version = this.nsVersions.get(namespace) || 1;
        return `${namespace}:v${version}:${keySuffix}`;
      } else {
        this.logger.error(`Redis version fetch error for ${namespace}: ${e.message}`);
      }
      return `${namespace}:v0:${keySuffix}`;
    }
  }

  /**
   * Bumps the version of a namespace, implicitly invalidating all keys under it.
   */
  async invalidateNamespace(namespace: string): Promise<void> {
    const currentVer = this.nsVersions.get(namespace) || 1;
    this.nsVersions.set(namespace, currentVer + 1);

    if (!this.redis) return;
    try {
      const newVersion = await this.redis.incr(`ns_version:${namespace}`);
      this.nsVersionCache.set(namespace, { value: newVersion, expiresAt: Date.now() + 5000 });
      this.logger.log(`Invalidated namespace: ${namespace} (v${newVersion})`);
    } catch (e: any) {
      if (e?.message?.includes('limit exceeded')) {
        this.logger.warn('Upstash Redis monthly request limit reached. Gracefully degrading to in-memory local fallback.');
        (this as any).redis = null;
      } else {
        this.logger.error(`Redis namespace invalidate error for ${namespace}: ${e.message}`);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SPECIFIC KEY GENERATORS
  // ─────────────────────────────────────────────────────────────────────────────

  // Guard caching
  async getGuardKey(userId: string, sessionId: string): Promise<string> {
    return this.getVersionedKey(`auth_user:${userId}`, `guard:${sessionId}`);
  }

  // Role-aware endpoint caching
  async getEndpointKey(endpoint: string, role: Role | string, params: Record<string, any> = {}): Promise<string> {
    const paramsHash = Buffer.from(JSON.stringify(params)).toString('base64');
    return this.getVersionedKey(endpoint, `role:${role}:${paramsHash}`);
  }
}
