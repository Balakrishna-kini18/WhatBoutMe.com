import { Redis } from '@upstash/redis';
import { Injectable } from '@nestjs/common';
import { ThrottlerStorageService } from '@nestjs/throttler';

@Injectable()
export class UpstashThrottlerStorage {
  private redis: Redis | null = null;
  private readonly memoryFallback = new ThrottlerStorageService();

  constructor() {
    // Upstash REST Redis constructor can throw synchronously on malformed URL
    // or undefined inputs. When misconfigured, rate limiting falls back to
    // in-process memory storage to prevent silently disabling brute-force protection.
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
      console.warn('[UpstashThrottlerStorage] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN missing. Falling back to in-memory rate limiting.');
      this.redis = null;
      return;
    }
    try {
      this.redis = new Redis({ url, token });
    } catch (err: any) {
      console.warn('[UpstashThrottlerStorage] Redis constructor error (falling back to in-memory rate limiting):', err?.message || String(err).slice(0, 200));
      this.redis = null;
    }
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ) {
    if (!this.redis) {
      return this.memoryFallback.increment(key, ttl, limit, blockDuration, throttlerName);
    }

    try {
      const prefixedKey = `throttler:${throttlerName}:${key}`;
      const blockKey = `${prefixedKey}:blocked`;

      // Check if blocked
      const isBlockedVal = await this.redis.get<number>(blockKey);
      const isBlocked = isBlockedVal !== null;
      let timeToBlockExpire = 0;

      if (isBlocked) {
        timeToBlockExpire = await this.redis.pttl(blockKey);
        return { totalHits: limit + 1, timeToExpire: 0, isBlocked: true, timeToBlockExpire };
      }

      // Pipeline to increment and get TTL
      const pipeline = this.redis.pipeline();
      pipeline.incr(prefixedKey);
      pipeline.pttl(prefixedKey);
      const results = await pipeline.exec();

      const hits = results[0] as number;
      let timeToExpire = results[1] as number;

      // If it's a new key (TTL is -1), set the expiration
      if (timeToExpire === -1) {
        await this.redis.pexpire(prefixedKey, ttl);
        timeToExpire = ttl;
      }

      // Check if limits exceeded
      if (hits > limit) {
        // Block it
        await this.redis.set(blockKey, 1, { px: blockDuration });
        timeToBlockExpire = blockDuration;
        return { totalHits: hits, timeToExpire, isBlocked: true, timeToBlockExpire };
      }

      return { totalHits: hits, timeToExpire, isBlocked: false, timeToBlockExpire: 0 };
    } catch {
      // Fallback to in-memory storage so Redis outages/timeouts cannot silently disable brute-force protection
      return this.memoryFallback.increment(key, ttl, limit, blockDuration, throttlerName);
    }
  }
}

