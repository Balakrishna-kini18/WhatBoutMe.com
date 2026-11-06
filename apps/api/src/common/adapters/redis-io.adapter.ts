import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { INestApplicationContext, Logger } from '@nestjs/common';
import { resolveRedisTlsOptions } from '../redis/redis.service.js';

export class RedisIoAdapter extends IoAdapter {
  private readonly ioLogger = new Logger(RedisIoAdapter.name);
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const redisUrl =
      process.env.REDIS_URL ||
      (process.env.REDIS_HOST
        ? `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT || '6379'}`
        : undefined);
    if (!redisUrl) {
      this.adapterConstructor = null;
      return;
    }

    const redisOptions = {
      tls: resolveRedisTlsOptions(redisUrl),
      maxRetriesPerRequest: 2,
      connectTimeout: 2500,
      retryStrategy: (times: number) => Math.min(times * 500, 5000),
      lazyConnect: true,
    };

    let timer: NodeJS.Timeout | undefined;
    try {
      this.pubClient = new Redis(redisUrl, redisOptions);
      this.subClient = this.pubClient.duplicate();

      this.pubClient.on('error', (err) => {
        this.ioLogger.warn(`pubClient Redis warning: ${err.message}`);
      });

      this.subClient.on('error', (err) => {
        this.ioLogger.warn(`subClient Redis warning: ${err.message}`);
      });

      await Promise.race([
        Promise.all([this.pubClient.connect(), this.subClient.connect()]),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Redis connection timeout')), 2500);
          if (typeof timer.unref === 'function') {
            timer.unref();
          }
        }),
      ]);

      this.adapterConstructor = createAdapter(this.pubClient, this.subClient);
    } catch (err: any) {
      this.ioLogger.warn(
        `Redis connection unavailable (using in-memory Socket.IO adapter): ${err?.message || String(err).slice(0, 100)}`,
      );
      this.adapterConstructor = null;
      try {
        this.pubClient?.disconnect();
        this.subClient?.disconnect();
      } catch {
        // noop
      }
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  createIOServer(port: number, options?: any): any {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
