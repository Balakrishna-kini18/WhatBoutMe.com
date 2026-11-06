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
  private redisCircuitOpenUntil = 0;
  private redisCircuitWasOpen = false;
  private redisProbeInFlight = false;
  private redisConnecting = false;
  /**
   * Strict 250ms per-operation timeout for cache-only Redis commands.
   * Fast enough that a cache miss + namespace lookup remains imperceptible (<300ms)
   * while accommodating healthy cloud Redis round-trips.
   */
  public static readonly REDIS_OP_TIMEOUT_MS = 250;
  /**
   * Cooldown window (20s) after a Redis timeout/error during which requests
   * bypass Redis immediately (0ms) and use local in-memory LRU + PostgreSQL.
   */
  public static readonly REDIS_CIRCUIT_COOLDOWN_MS = 20000;

  private readonly inFlightPromises = new Map<string, Promise<any>>();

  constructor(@Optional() private readonly redisService?: RedisService) {
    this.maxCapacity = process.env.CACHE_MAX_ENTRIES
      ? parseInt(process.env.CACHE_MAX_ENTRIES, 10)
      : 5000;

    if (this.redisService) {
      try {
        const isConfigured =
          typeof this.redisService.isConfigured === 'function'
            ? this.redisService.isConfigured()
            : true;
        if (isConfigured) {
          this.redis = this.redisService.getClient();
          this.logger.log('Standard Redis / Valkey initialized for LMS caching via REDIS_URL');
        } else {
          this.redis = null;
        }
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

  private triggerBackgroundConnectIfIdle(): void {
    if (!this.redis) return;
    const status = (this.redis as any).status;
    if (status === 'wait' && !this.redisConnecting && typeof (this.redis as any).connect === 'function') {
      this.redisConnecting = true;
      const connectPromise = Promise.resolve().then(() => (this.redis as any).connect());
      connectPromise
        .catch((err: any) => {
          this.tripCircuit(`connect failed: ${err?.message || err}`);
        })
        .finally(() => {
          this.redisConnecting = false;
        });
    }
  }

  /**
   * Non-blocking readiness & circuit-breaker check.
   * Ensures active HTTP requests never stall on connecting/reconnecting Redis sockets.
   */
  private canUseRedis(): boolean {
    if (!this.redis) return false;
    if (Date.now() < this.redisCircuitOpenUntil) return false;

    // If RedisService provides an explicit readiness check, honor it
    if (typeof this.redisService?.isReady === 'function' && !this.redisService.isReady()) {
      this.triggerBackgroundConnectIfIdle();
      return false;
    }

    const status = (this.redis as any).status;
    // Allow ready clients or unit-test mocks where status is undefined
    if (status !== undefined && status !== 'ready') {
      this.triggerBackgroundConnectIfIdle();
      return false;
    }

    // Half-open state: allow only a single recovery probe at a time after cooldown
    if (this.redisCircuitWasOpen && this.redisProbeInFlight) {
      return false;
    }

    return true;
  }

  private tripCircuit(reason: string): void {
    this.redisCircuitOpenUntil = Date.now() + CacheHelperService.REDIS_CIRCUIT_COOLDOWN_MS;
    this.redisCircuitWasOpen = true;
    this.warnRateLimited(
      `Redis circuit opened for ${CacheHelperService.REDIS_CIRCUIT_COOLDOWN_MS / 1000}s (using in-memory LRU): ${reason}`,
    );
  }

  private async execRedis<T>(op: () => Promise<T>, label: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const isProbe = this.redisCircuitWasOpen;
    if (isProbe) {
      this.redisProbeInFlight = true;
    }

    try {
      const opPromise = Promise.resolve().then(op);
      // Attach no-op catch handler so if the timeout wins the race and the abandoned
      // ioredis promise rejects later, Node.js never raises UnhandledPromiseRejection.
      opPromise.catch(() => undefined);

      const result = await Promise.race([
        opPromise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  `Redis ${label} timed out after ${CacheHelperService.REDIS_OP_TIMEOUT_MS}ms`,
                ),
              ),
            CacheHelperService.REDIS_OP_TIMEOUT_MS,
          );
          if (typeof timer.unref === 'function') timer.unref();
        }),
      ]);

      if (this.redisCircuitWasOpen) {
        this.redisCircuitWasOpen = false;
        this.redisCircuitOpenUntil = 0;
        this.logger.log(
          `Redis cache circuit closed after successful ${label} recovery probe; distributed caching restored.`,
        );
      }

      return result;
    } catch (err: any) {
      this.tripCircuit(`${label}: ${err?.message || err}`);
      throw err;
    } finally {
      if (isProbe) {
        this.redisProbeInFlight = false;
      }
      if (timer) clearTimeout(timer);
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
      // 3. Check Redis tier if online and ready (Fail-Open: errors/offline fall through in 0ms to DB fetcher)
      if (this.canUseRedis() && this.redis) {
        try {
          const raw = await this.execRedis(() => this.redis!.get(key), 'GET');
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

        // Populate Redis asynchronously if online and ready
        if (this.canUseRedis() && this.redis) {
          try {
            const serialized = JSON.stringify(data);
            this.redis
              .set(key, serialized, 'EX', ttlSeconds)
              .catch((e: any) => {
                this.tripCircuit(`SET: ${e?.message || e}`);
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
    if (!this.canUseRedis() || !this.redis) return null;
    try {
      const raw = await this.execRedis(() => this.redis!.get(key), 'GET');
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

    if (!this.canUseRedis() || !this.redis) return;
    try {
      const serialized = JSON.stringify(value);
      await this.execRedis(() => this.redis!.set(key, serialized, 'EX', ttlSeconds), 'SET');
    } catch (e: any) {
      this.warnRateLimited(`Redis SET notice for key ${key}: ${e.message}`);
    }
  }

  async invalidate(key: string): Promise<void> {
    this.memoryCache.delete(key);
    this.unregisterKeyTags(key);
    if (!this.canUseRedis() || !this.redis) return;
    try {
      await this.execRedis(() => this.redis!.del(key), 'DEL');
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

      if (this.canUseRedis() && this.redis) {
        try {
          await this.execRedis(() => this.redis!.del(...keyList), 'DEL');
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

    const now = Date.now();
    const local = this.nsVersionCache.get(namespace);
    if (local && local.expiresAt > now) {
      return `wbm:${env}:ns:${namespace}:v${local.value}:${keySuffix}`;
    }

    if (!this.canUseRedis() || !this.redis) {
      const version = this.nsVersions.get(namespace) || 1;
      return `wbm:${env}:ns:${namespace}:v${version}:${keySuffix}`;
    }

    try {
      const rawVersion = await this.execRedis(() => this.redis!.get(versionKey), 'GET_VERSION');
      let version = rawVersion ? parseInt(rawVersion, 10) : 0;
      if (!version || isNaN(version)) {
        version = 1;
        this.redis.set(versionKey, '1').catch(() => {});
      }

      this.nsVersionCache.set(namespace, { value: version, expiresAt: now + 30000 });
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
    const nextLocalVer = currentVer + 1;
    this.nsVersions.set(namespace, nextLocalVer);
    this.nsVersionCache.set(namespace, { value: nextLocalVer, expiresAt: Date.now() + 30000 });

    if (!this.canUseRedis() || !this.redis) return;
    try {
      const env = getEnvPrefix();
      const versionKey = `wbm:${env}:ns_version:${namespace}`;
      const newVersion = await this.execRedis(() => this.redis!.incr(versionKey), 'INCR_VERSION');
      this.nsVersionCache.set(namespace, { value: newVersion, expiresAt: Date.now() + 30000 });
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
