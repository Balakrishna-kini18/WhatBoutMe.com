import { Injectable, Logger } from '@nestjs/common';
import { Redis } from '@upstash/redis';
import { Role } from '@prisma/client';

interface LocalCacheItem {
  value: number;
  expiresAt: number;
}

@Injectable()
export class CacheHelperService {
  private readonly redis: Redis | null = null;
  private readonly logger = new Logger(CacheHelperService.name);
  private readonly nsVersionCache = new Map<string, LocalCacheItem>();
  private readonly inFlightPromises = new Map<string, Promise<any>>();

  constructor() {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (url && token) {
      // Upstash REST Redis constructor can throw synchronously on malformed URL
      // input (same Layer E pattern as ioredis / Prisma).  Caching is OPTIONAL,
      // so fail-open (degrade to in-memory Map-only local cache) instead of
      // crashing the entire cold start when user entered wrong UPSTASH_* env vars.
      try {
        this.redis = new Redis({ url, token });
        this.logger.log('Upstash Redis initialized for caching');
      } catch (err: any) {
        this.logger.warn(`Upstash Redis constructor error (caching disabled, using local fallbacks): ${err?.message || String(err).slice(0, 200)}`);
        (this as any).redis = null;
      }
    } else {
      this.logger.warn('Upstash Redis credentials missing. Caching is disabled.');
    }

    // Prevent Map from growing infinitely and causing OOM
    setInterval(() => {
      const now = Date.now();
      for (const [k, v] of this.nsVersionCache.entries()) {
        if (v.expiresAt <= now) {
          this.nsVersionCache.delete(k);
        }
      }
    }, 60000).unref();
  }

  // Fail-open execution wrapper
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds: number = 3600
  ): Promise<T> {
    if (!this.redis) return fetcher();

    // Promise Coalescing: If there's an active request for this key, return its promise
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
        this.logger.error(`Redis GET error for key ${key}: ${e.message}`);
      }

      const data = await fetcher();

      if (data !== null && data !== undefined) {
        try {
          // Run set asynchronously so we don't block the response.
          this.redis!.set(key, data, { ex: ttlSeconds }).catch((e: any) => {
            this.logger.error(`Redis SET error for key ${key}: ${e.message}`);
          });
        } catch (e: any) {
          this.logger.error(`Redis SET init error for key ${key}: ${e.message}`);
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
    if (!this.redis) return;
    try {
      await this.redis.del(key);
    } catch (e: any) {
      this.logger.error(`Redis DEL error for key ${key}: ${e.message}`);
    }
  }

  // --- VERSIONED NAMESPACES SUPPORT --- //

  /**
   * Generates a dynamic, versioned cache key.
   * Format: `namespace:v{version}:key`
   * Example: `sessions:v1:user:123`
   */
  async getVersionedKey(namespace: string, keySuffix: string): Promise<string> {
    if (!this.redis) return `${namespace}:v0:${keySuffix}`;
    
    // Check local memory cache first to save Upstash API costs & latency
    const now = Date.now();
    const local = this.nsVersionCache.get(namespace);
    if (local && local.expiresAt > now) {
      return `${namespace}:v${local.value}:${keySuffix}`;
    }

    try {
      let version = await this.redis.get(`ns_version:${namespace}`) as number;
      if (!version) {
        // initialize to 1
        version = 1;
        await this.redis.set(`ns_version:${namespace}`, 1);
      }
      
      // Cache locally for 5 seconds to collapse duplicate requests
      this.nsVersionCache.set(namespace, { value: version, expiresAt: now + 5000 });
      
      return `${namespace}:v${version}:${keySuffix}`;
    } catch (e: any) {
      this.logger.error(`Redis version fetch error for ${namespace}: ${e.message}`);
      return `${namespace}:v0:${keySuffix}`;
    }
  }

  /**
   * Bumps the version of a namespace, implicitly invalidating all keys under it.
   * E.g. bumping "programs" invalidates all `programs:v{n}:...` keys without SCAN.
   */
  async invalidateNamespace(namespace: string): Promise<void> {
    if (!this.redis) return;
    try {
      const newVersion = await this.redis.incr(`ns_version:${namespace}`);
      this.nsVersionCache.set(namespace, { value: newVersion, expiresAt: Date.now() + 5000 });
      this.logger.log(`Invalidated namespace: ${namespace} (v${newVersion})`);
    } catch (e: any) {
      this.logger.error(`Redis namespace invalidate error for ${namespace}: ${e.message}`);
    }
  }

  // --- SPECIFIC KEY GENERATORS --- //

  // Guard caching
  async getGuardKey(userId: string, sessionId: string): Promise<string> {
    // Both user profile and session validity share the same namespace
    return this.getVersionedKey(`auth_user:${userId}`, `guard:${sessionId}`);
  }

  // Role-aware endpoint caching
  async getEndpointKey(endpoint: string, role: Role, params: Record<string, any> = {}): Promise<string> {
    const paramsHash = Buffer.from(JSON.stringify(params)).toString('base64');
    return this.getVersionedKey(endpoint, `role:${role}:${paramsHash}`);
  }
}
