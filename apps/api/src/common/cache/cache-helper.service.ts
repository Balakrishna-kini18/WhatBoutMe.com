import { Injectable, Logger, Optional, OnModuleDestroy } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { RedisService } from '../redis/redis.service.js';
import { Role } from '@prisma/client';
import { getEnvPrefix } from './cache-keys.constant.js';

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
export class CacheHelperService implements OnModuleDestroy {
  private readonly redis: Redis | null = null;
  private readonly logger = new Logger(CacheHelperService.name);
  private readonly nsVersionCache = new Map<string, LocalCacheItem>();
  private readonly nsVersions = new Map<string, number>();

  // In-Memory LRU Cache with TTL and Tag Indexing
  private readonly memoryCache = new Map<string, MemoryCacheItem>();
  private readonly tagToKeys = new Map<string, Set<string>>();
  private readonly keyToTags = new Map<string, Set<string>>();
  private readonly maxCapacity: number;
  private sweepTimer: NodeJS.Timeout | null = null;
  private lastWarnTime = 0;

  private readonly inFlightPromises = new Map<string, Promise<any>>();

  constructor(@Optional() private readonly redisService?: RedisService) {
    this.maxCapacity = process.env.CACHE_MAX_ENTRIES
      ? parseInt(process.env.CACHE_MAX_ENTRIES, 10)
      : 5000;

    if (this.redisService) {
      try {
        this.redis = this.redisService.getClient();
        this.logger.log('Standard Redis / Valkey initialized for LMS caching via REDIS_URL');
      } catch (err: any) {
        this.warnRateLimited(
          `Redis client retrieval error (degrading to in-memory cache): ${err?.message || err}`,
        );
        this.redis = null;
      }
    } else {
      this.warnRateLimited(
        'RedisService not injected or offline. Caching falling back to in-memory LRU layer.',
      );
    }

    // Periodic sweep every 60 seconds to clean expired items from memory and prevent unbounded growth
    this.sweepTimer = setInterval(() => {
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
    }, 60000);
    try {
      this.sweepTimer.unref();
    } catch {}
  }

  onModuleDestroy() {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    this.inFlightPromises.clear();
    this.memoryCache.clear();
    this.tagToKeys.clear();
    this.keyToTags.clear();
    this.nsVersionCache.clear();
  }

  /**
   * Rate-limited warning helper to prevent log flooding during sustained Redis outages.
   */
  private warnRateLimited(message: string): void {
    const now = Date.now();
    if (now - this.lastWarnTime > 15000) {
      this.lastWarnTime = now;
      this.logger.warn(message);
    }
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
  // CORE CACHE API (LRU + TTL + TAGGED + FAIL-OPEN REDIS)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Fail-open execution wrapper with fast in-memory LRU fallback, Promise coalescing, and tag support.
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds: number = 3600,
    tags: string[] = [],
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

    // 2. Promise Coalescing: If there is an active fetcher for this key, return its promise (prevents cache stampede)
    if (this.inFlightPromises.has(key)) {
      return this.inFlightPromises.get(key) as Promise<T>;
    }

    const promise = (async () => {
      // 3. Check Redis tier if online (Fail-Open: errors fall through to DB fetcher)
      if (this.redis) {
        try {
          const raw = await this.redis.get(key);
          if (raw !== null && raw !== undefined) {
            let parsed: any = null;
            let isCorrupt = false;
            try {
              parsed = JSON.parse(raw);
            } catch (err: any) {
              isCorrupt = true;
              this.warnRateLimited(`Corrupt JSON in Redis cache for key ${key}; deleting and treating as miss: ${err.message}`);
              this.redis.del(key).catch(() => {});
            }

            if (!isCorrupt && parsed !== null && parsed !== undefined) {
              this.evictLRUIfNeeded();
              const tagSet = new Set(tags);
              this.memoryCache.set(key, {
                value: parsed,
                expiresAt: now + ttlSeconds * 1000,
                lastAccessed: now,
                tags: tagSet,
              });
              this.registerKeyTags(key, tags);
              return parsed as T;
            }
          }
        } catch (e: any) {
          this.warnRateLimited(`Redis GET notice (failing open to DB) for key ${key}: ${e.message}`);
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

        // Populate Redis asynchronously if online
        if (this.redis) {
          try {
            const serialized = JSON.stringify(data);
            this.redis
              .set(key, serialized, 'EX', ttlSeconds)
              .catch((e: any) => {
                this.warnRateLimited(`Redis SET background notice for key ${key}: ${e.message}`);
              });
          } catch (e: any) {
            this.warnRateLimited(`Redis SET serialize warning for key ${key}: ${e.message}`);
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
      const raw = await this.redis.get(key);
      if (raw !== null && raw !== undefined) {
        try {
          return JSON.parse(raw) as T;
        } catch (err: any) {
          this.warnRateLimited(`Corrupt JSON in Redis cache for key ${key}; deleting and treating as miss: ${err.message}`);
          this.redis.del(key).catch(() => {});
          return null;
        }
      }
      return null;
    } catch (e: any) {
      this.warnRateLimited(`Redis GET notice for key ${key}: ${e.message}`);
      return null;
    }
  }

  async set<T>(
    key: string,
    value: T,
    ttlSeconds: number = 600,
    tags: string[] = [],
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
      const serialized = JSON.stringify(value);
      await this.redis.set(key, serialized, 'EX', ttlSeconds);
    } catch (e: any) {
      this.warnRateLimited(`Redis SET notice for key ${key}: ${e.message}`);
    }
  }

  async invalidate(key: string): Promise<void> {
    this.memoryCache.delete(key);
    this.unregisterKeyTags(key);
    if (!this.redis) return;
    try {
      await this.redis.del(key);
    } catch (e: any) {
      this.warnRateLimited(`Redis DEL notice for key ${key}: ${e.message}`);
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
          await this.redis.del(...keyList);
        } catch (e: any) {
          this.warnRateLimited(`Redis tag DEL notice for tag ${tag}: ${e.message}`);
        }
      }
    }

    // Also invalidate the corresponding namespace version for multi-node / edge consistency
    await this.invalidateNamespace(tag);
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
   * Format: `wbm:{env}:ns:{namespace}:v{version}:{keySuffix}`
   */
  async getVersionedKey(namespace: string, keySuffix: string): Promise<string> {
    const env = getEnvPrefix();
    const versionKey = `wbm:${env}:ns_version:${namespace}`;

    if (!this.redis) {
      const version = this.nsVersions.get(namespace) || 1;
      return `wbm:${env}:ns:${namespace}:v${version}:${keySuffix}`;
    }

    const now = Date.now();
    const local = this.nsVersionCache.get(namespace);
    if (local && local.expiresAt > now) {
      return `wbm:${env}:ns:${namespace}:v${local.value}:${keySuffix}`;
    }

    try {
      const rawVersion = await this.redis.get(versionKey);
      let version = rawVersion ? parseInt(rawVersion, 10) : 0;
      if (!version || isNaN(version)) {
        version = 1;
        await this.redis.set(versionKey, '1');
      }

      this.nsVersionCache.set(namespace, { value: version, expiresAt: now + 5000 });
      return `wbm:${env}:ns:${namespace}:v${version}:${keySuffix}`;
    } catch (e: any) {
      this.warnRateLimited(`Redis version fetch notice for ${namespace}: ${e.message}`);
      const fallbackVer = this.nsVersions.get(namespace) || 1;
      return `wbm:${env}:ns:${namespace}:v${fallbackVer}:${keySuffix}`;
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
      const env = getEnvPrefix();
      const versionKey = `wbm:${env}:ns_version:${namespace}`;
      const newVersion = await this.redis.incr(versionKey);
      this.nsVersionCache.set(namespace, { value: newVersion, expiresAt: Date.now() + 5000 });
    } catch (e: any) {
      this.warnRateLimited(`Redis namespace invalidate notice for ${namespace}: ${e.message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SPECIFIC KEY GENERATORS (Maintained for backward compatibility)
  // ─────────────────────────────────────────────────────────────────────────────

  async getGuardKey(userId: string, sessionId: string): Promise<string> {
    return this.getVersionedKey(`auth_user:${userId}`, `guard:${sessionId}`);
  }

  async getEndpointKey(
    endpoint: string,
    role: Role | string,
    params: Record<string, any> = {},
  ): Promise<string> {
    const paramsHash = Buffer.from(JSON.stringify(params)).toString('base64');
    return this.getVersionedKey(endpoint, `role:${role}:${paramsHash}`);
  }
}
