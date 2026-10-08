import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor() {
    // Determine the exact connection configuration for Upstash (TCP) or local Docker
    const isRediss = process.env.REDIS_URL?.startsWith('rediss://');
    const isWorkerMode = process.env.WORKER_MODE === 'true';
    const isServerless = !isWorkerMode;

    // In serverless mode, fail Redis fast (1.5s connect, no retries) so the
    // function invocation never stalls past Vercel's timeout budget.
    // Long-lived workers get a tolerant retry policy.
    const serverlessOpts = isServerless
      ? {
          connectTimeout: 1500,
          retryStrategy: () => null as any,
          maxRetriesPerRequest: 1,
          autoResendUnfulfilledCommands: false,
          autoResubscribe: false,
          reconnectOnError: () => false as any,
          keepAlive: 0,
          noDelay: true,
        }
      : {
          connectTimeout: 10000,
          retryStrategy: (times: number) => (times > 5 ? null : Math.min(times * 200, 3000)),
          maxRetriesPerRequest: 3,
        };

    if (process.env.REDIS_URL) {
      this.client = new Redis(process.env.REDIS_URL, {
        tls: isRediss ? { rejectUnauthorized: false } : undefined,
        lazyConnect: true,
        ...serverlessOpts,
      } as any);
    } else {
      this.client = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
        lazyConnect: true,
        ...serverlessOpts,
      } as any);
    }

    if (isServerless) {
      // Kill TCP socket immediately on any connection-level failure so the
      // Vercel event loop goes idle instead of hanging.
      const kill = (err?: any) => {
        try {
          this.client.removeAllListeners();
          this.client.on('error', () => undefined);
          this.client.disconnect(false);
        } catch {
          /* noop */
        }
        if (err) console.warn('[RedisService serverless] redis error (socket released):', err?.message || String(err).slice(0, 120));
      };
      this.client.once('error', kill);
      this.client.once('close', () => kill());
      this.client.once('connectTimeout', () => kill(new Error('connectTimeout')));
    } else {
      this.client.on('error', (err) => console.warn('Redis Client notice (non-fatal):', err?.message || err));
      this.client.on('connect', () => console.log('Redis Client Connected Successfully'));
    }
  }

  /**
   * Get the raw ioredis client for advanced use cases
   */
  getClient(): Redis {
    return this.client;
  }

  /**
   * Set a key-value pair in Redis
   */
  async set(key: string, value: string | number, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  /**
   * Get a value from Redis
   */
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /**
   * Delete a key from Redis
   */
  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  /**
   * Graceful shutdown of the connection
   */
  async onModuleDestroy() {
    await this.client.quit();
  }
}
