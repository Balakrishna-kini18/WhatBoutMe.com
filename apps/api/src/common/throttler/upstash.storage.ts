// import { ThrottlerStorage } from '@nestjs/throttler';
import { Redis } from '@upstash/redis';
import { Injectable } from '@nestjs/common';

@Injectable()
export class UpstashThrottlerStorage {
  private redis: Redis | null = null;

  constructor() {
    // Upstash REST Redis constructor can throw synchronously on malformed URL
    // or undefined inputs (same pattern as ioredis Layer E).
    // Rate limiting is OPTIONAL for serverless operation; fail-open (disable
    // throttler storage) rather than crashing the entire cold start when the
    // user entered wrong UPSTASH_* env vars.
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
      console.warn('[UpstashThrottlerStorage] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN missing. Throttler disabled (fail-open).');
      this.redis = null;
      return;
    }
    try {
      this.redis = new Redis({ url, token });
    } catch (err: any) {
      console.warn('[UpstashThrottlerStorage] Redis constructor error (throttler disabled, fail-open):', err?.message || String(err).slice(0, 200));
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
    try {
      if (!this.redis) {
        // Fail-open: no storage → no rate limiting → allow every request
        return { totalHits: 1, timeToExpire: ttl, isBlocked: false, timeToBlockExpire: 0 };
      }
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
      // Fail open so rate-limiter connection/network issues do not block legitimate requests
      return { totalHits: 1, timeToExpire: ttl, isBlocked: false, timeToBlockExpire: 0 };
    }
  }
}
