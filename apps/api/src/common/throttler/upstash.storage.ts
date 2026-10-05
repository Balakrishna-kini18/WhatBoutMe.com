import { ThrottlerStorage } from '@nestjs/throttler';
import { Redis } from '@upstash/redis';
import { Injectable } from '@nestjs/common';

@Injectable()
export class UpstashThrottlerStorage implements ThrottlerStorage {
  private redis: Redis;

  constructor() {
    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ) {
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
  }
}
