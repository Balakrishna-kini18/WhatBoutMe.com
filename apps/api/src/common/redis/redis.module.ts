import { Global, Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-yet';
import { RedisService } from './redis.service.js';

@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async () => {
        const url = process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'}`;
        const isRediss = url.startsWith('rediss://');
        
        try {
          const store = await redisStore({
            url,
            socket: {
              tls: isRediss ? true : undefined,
              rejectUnauthorized: false,
              reconnectStrategy: (retries: number) => Math.min(retries * 100, 3000),
            },
            ttl: 60 * 1000, // Default 60 seconds caching globally
          });

          if (store && store.client) {
            store.client.on('error', (err: any) => {
              console.warn('[CacheModule Redis] client notice:', err?.message || err);
            });
          }

          return { store };
        } catch (err: any) {
          console.warn('[CacheModule Redis] Initialization warning, falling back to memory cache:', err?.message || err);
          return { ttl: 60 * 1000 };
        }
      },
    }),
  ],
  providers: [RedisService],
  exports: [RedisService, CacheModule],
})
export class RedisGlobalModule {}
