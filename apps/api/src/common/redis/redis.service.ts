import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor() {
    // Determine the exact connection configuration for Upstash (TCP) or local Docker
    const isRediss = process.env.REDIS_URL?.startsWith('rediss://');
    
    if (process.env.REDIS_URL) {
      this.client = new Redis(process.env.REDIS_URL, {
        tls: isRediss ? { rejectUnauthorized: false } : undefined,
        maxRetriesPerRequest: null,
      });
    } else {
      this.client = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: null,
      });
    }

    this.client.on('error', (err) => console.error('Redis Client Error', err));
    this.client.on('connect', () => console.log('Redis Client Connected Successfully'));
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
