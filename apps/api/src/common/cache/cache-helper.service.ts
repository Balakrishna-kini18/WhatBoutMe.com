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
}

@Injectable()
export class CacheHelperService {
  private readonly redis: Redis | null = null;
  private readonly logger = new Logger(CacheHelperService.name);
  private readonly nsVersionCache = new Map<string, LocalCacheItem>();
  private readonly nsVersions = new Map<string, number>();
  private readonly memoryCache = new Map<string, MemoryCacheItem>();
  private readonly inFlightPromises = new Map<string, Promise<any>>();

  constructor() {
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

    // Clean expired items every 60 seconds to prevent memory leaks
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
        }
      }
    }, 60000).unref();
  }

  // Fail-open execution wrapper with fast in-memory fallback
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds: number = 3600
  ): Promise<T> {
    // 1. Check local in-memory cache first if Redis is disabled or offline
    if (!this.redis) {
      const local = this.memoryCache.get(key);
      if (local && local.expiresAt > Date.now()) {
        return local.value as T;
      }

      if (this.inFlightPromises.has(key)) {
        return this.inFlightPromises.get(key) as Promise<T>;
      }

      const promise = (async () => {
        const data = await fetcher();
        if (data !== null && data !== undefined) {
          this.memoryCache.set(key, { value: data, expiresAt: Date.now() + ttlSeconds * 1000 });
        }
        return data;
      })().finally(() => {
        this.inFlightPromises.delete(key);
      });

      this.inFlightPromises.set(key, promise);
      return promise;
    }

    // 2. Promise Coalescing: If there's an active request for this key, return its promise
    if (this.inFlightPromises.has(key)) {
      return this.inFlightPromises.get(key) as Promise<T>;
    }

    const promise = (async () => {
      try {
        const cached = await this.redis!.get(key);
        if (cached) {
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

      const data = await fetcher();

      if (data !== null && data !== undefined) {
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
        } else {
          this.memoryCache.set(key, { value: data, expiresAt: Date.now() + ttlSeconds * 1000 });
        }
      }

      return data;
    })().finally(() => {
      this.inFlightPromises.delete(key);
    });

    this.inFlightPromises.set(key, promise);
    return promise;
  }

  async invalidate(key: string): Promise<void> {
    this.memoryCache.delete(key);
    if (!this.redis) return;
    try {
      await this.redis.del(key);
    } catch (e: any) {
      this.logger.error(`Redis DEL error for key ${key}: ${e.message}`);
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number = 600): Promise<void> {
    this.memoryCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    if (!this.redis) return;
    try {
      await this.redis.set(key, value, { ex: ttlSeconds });
    } catch (e: any) {
      this.logger.error(`Redis SET error for key ${key}: ${e.message}`);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const local = this.memoryCache.get(key);
    if (local && local.expiresAt > Date.now()) {
      return local.value as T;
    }
    if (!this.redis) return null;
    try {
      const val = await this.redis.get(key);
      return (val as T) ?? null;
    } catch (e: any) {
      this.logger.error(`Redis GET error for key ${key}: ${e.message}`);
      return null;
    }
  }

  async del(key: string): Promise<void> {
    return this.invalidate(key);
  }

  // --- VERSIONED NAMESPACES SUPPORT --- //

  /**
   * Generates a dynamic, versioned cache key.
   * Format: `namespace:v{version}:key`
   */
  async getVersionedKey(namespace: string, keySuffix: string): Promise<string> {
    if (!this.redis) {
      const version = this.nsVersions.get(namespace) || 1;
      return `${namespace}:v${version}:${keySuffix}`;
    }
    
    // Check local memory cache first to save Upstash API costs & latency
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

  // --- SPECIFIC KEY GENERATORS --- //

  // Guard caching
  async getGuardKey(userId: string, sessionId: string): Promise<string> {
    return this.getVersionedKey(`auth_user:${userId}`, `guard:${sessionId}`);
  }

  // Role-aware endpoint caching
  async getEndpointKey(endpoint: string, role: Role, params: Record<string, any> = {}): Promise<string> {
    const paramsHash = Buffer.from(JSON.stringify(params)).toString('base64');
    return this.getVersionedKey(endpoint, `role:${role}:${paramsHash}`);
  }
}
