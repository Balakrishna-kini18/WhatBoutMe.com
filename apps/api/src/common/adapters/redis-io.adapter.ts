import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { INestApplicationContext } from '@nestjs/common';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const isRediss = redisUrl.startsWith('rediss://');
    
    const redisOptions = {
      tls: isRediss ? { rejectUnauthorized: false } : undefined,
      maxRetriesPerRequest: null,
      retryStrategy: (times: number) => Math.min(times * 100, 3000),
    };

    const pubClient = new Redis(redisUrl, redisOptions);
    const subClient = pubClient.duplicate();

    pubClient.on('error', (err) => {
      console.warn('[RedisIoAdapter] pubClient Redis error:', err.message);
    });

    subClient.on('error', (err) => {
      console.warn('[RedisIoAdapter] subClient Redis error:', err.message);
    });

    try {
      this.adapterConstructor = createAdapter(pubClient, subClient);
    } catch (err: any) {
      console.warn('[RedisIoAdapter] Failed to initialize Redis adapter:', err.message);
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
