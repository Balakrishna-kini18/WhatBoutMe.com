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
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      retryStrategy: (times: number) => (times > 2 ? null : 500),
      lazyConnect: true,
    };

    let pubClient: Redis;
    let subClient: Redis;
    try {
      pubClient = new Redis(redisUrl, redisOptions);
      subClient = pubClient.duplicate();

      pubClient.on('error', (err) => {
        console.warn('[RedisIoAdapter] pubClient Redis warning:', err.message);
      });

      subClient.on('error', (err) => {
        console.warn('[RedisIoAdapter] subClient Redis warning:', err.message);
      });

      await Promise.race([
        Promise.all([pubClient.connect(), subClient.connect()]),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Redis connection timeout')), 2500)),
      ]);

      this.adapterConstructor = createAdapter(pubClient, subClient);
    } catch (err: any) {
      console.warn('[RedisIoAdapter] Redis connection unavailable (using standard in-memory Socket.IO adapter):', err?.message || String(err).slice(0, 100));
      this.adapterConstructor = null;
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
