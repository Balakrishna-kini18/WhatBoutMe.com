import { Redis } from 'ioredis';
import { Injectable, Logger } from '@nestjs/common';
import { ThrottlerStorageService } from '@nestjs/throttler';
import type { ThrottlerStorage } from '@nestjs/throttler';
import crypto from 'crypto';

export interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * Standard Redis / Valkey Throttler Storage for NestJS.
 * 
 * Provides high-performance, atomic Redis Lua script evaluation over standard REDIS_URL.
 * 
 * Features:
 * 1. Single roundtrip atomic Lua execution (INCR + PEXPIRE + Block guard).
 * 2. Fail-open in-memory fallback: Redis outages never reject legitimate traffic,
 *    while still enforcing in-memory rate limits per container.
 * 3. Deterministic namespacing and tracker key normalization (safe IPv4/IPv6/userId keys).
 * 4. Supports standard redis:// and TLS rediss://.
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private redis: Redis | null = null;
  private readonly memoryFallback = new ThrottlerStorageService();
  private readonly prefix: string;

  // Atomic Lua script: evaluates hits, sets TTL on first hit, and manages blocking
  private static readonly LUA_INCREMENT = `
    local blockPttl = redis.call('PTTL', KEYS[2])
    if blockPttl > 0 then
      return { tonumber(ARGV[2]) + 1, 0, 1, blockPttl }
    end

    local hits = redis.call('INCR', KEYS[1])
    local pttl = redis.call('PTTL', KEYS[1])
    if hits == 1 or pttl == -1 then
      redis.call('PEXPIRE', KEYS[1], ARGV[1])
      pttl = tonumber(ARGV[1])
    end

    if hits > tonumber(ARGV[2]) then
      redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
      return { hits, 0, 1, tonumber(ARGV[3]) }
    end

    return { hits, pttl, 0, 0 }
  `;

  constructor(customRedis?: Redis) {
    this.prefix = `wbm:${process.env.NODE_ENV || 'development'}:throttler`;

    if (customRedis) {
      this.redis = customRedis;
      return;
    }

    const url = process.env.REDIS_URL;
    if (!url && !process.env.REDIS_HOST) {
      this.logger.log('No REDIS_URL or REDIS_HOST provided; using in-memory rate limiting.');
      this.redis = null;
      return;
    }

    try {
      const isRediss = url?.startsWith('rediss://');
      const isServerlessRuntime =
        process.env.WORKER_MODE !== 'true' &&
        Boolean(
          process.env.VERCEL ||
          process.env.AWS_LAMBDA_FUNCTION_NAME ||
          process.env.LAMBDA_TASK_ROOT ||
          process.env.GOOGLE_CLOUD_RUN ||
          process.env.K_SERVICE
        );
      const allowInsecureTls =
        process.env.REDIS_TLS_INSECURE === 'true' && process.env.NODE_ENV !== 'production';

      const options = {
        tls: isRediss ? { rejectUnauthorized: !allowInsecureTls } : undefined,
        lazyConnect: true,
        connectTimeout: isServerlessRuntime ? 1500 : 5000,
        maxRetriesPerRequest: 1,
        retryStrategy: (times: number) => Math.min(times * 500, 5000),
        autoResendUnfulfilledCommands: false,
        reconnectOnError: (err: Error) =>
          /READONLY|ETIMEDOUT|ECONNRESET/i.test(err.message),
      };

      if (url) {
        this.redis = new Redis(url, options as any);
      } else {
        this.redis = new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
          password: process.env.REDIS_PASSWORD || undefined,
          ...options,
        } as any);
      }

      this.redis.on('error', (err) => {
        this.logger.warn(`Redis throttler connection warning: ${err?.message || err}`);
      });
    } catch (err: any) {
      this.logger.warn(
        `Failed to initialize Redis throttler client (falling back to in-memory): ${err?.message || err}`,
      );
      this.redis = null;
    }
  }

  /**
   * Normalizes arbitrary client keys (e.g. IPv6, user IDs, route paths) to safe Redis keys.
   */
  public normalizeKey(rawKey: string): string {
    if (!rawKey) return 'anonymous';
    // If key is long or contains non-alphanumeric characters, hash it deterministically
    if (rawKey.length > 64 || /[^a-zA-Z0-9_\-\.:]/.test(rawKey)) {
      return crypto.createHash('sha256').update(rawKey).digest('hex').slice(0, 32);
    }
    return rawKey.replace(/\s+/g, '_');
  }

  /**
   * Atomic increment conforming to @nestjs/throttler ThrottlerStorage contract.
   */
  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    if (!this.redis) {
      return this.memoryFallback.increment(key, ttl, limit, blockDuration, throttlerName);
    }

    const safeKey = this.normalizeKey(key);
    const primaryKey = `${this.prefix}:${throttlerName}:${safeKey}`;
    const blockKey = `${primaryKey}:blocked`;

    try {
      // Execute atomic Lua script
      const result = (await this.redis.eval(
        RedisThrottlerStorage.LUA_INCREMENT,
        2,
        primaryKey,
        blockKey,
        ttl.toString(),
        limit.toString(),
        blockDuration.toString(),
      )) as [number, number, number, number];

      const totalHits = Number(result[0]);
      const timeToExpire = Math.max(0, Math.ceil(Number(result[1]) / 1000));
      const isBlocked = Number(result[2]) === 1;
      const timeToBlockExpire = Math.max(0, Math.ceil(Number(result[3]) / 1000));

      return {
        totalHits,
        timeToExpire,
        isBlocked,
        timeToBlockExpire,
      };
    } catch (err: any) {
      this.logger.warn(
        `Redis throttler increment failed (falling back to memory): ${err?.message || err}`,
      );
      return this.memoryFallback.increment(key, ttl, limit, blockDuration, throttlerName);
    }
  }

  async close(): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.quit();
      } catch {
        this.redis.disconnect();
      }
      this.redis = null;
    }
  }
}
