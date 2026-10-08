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
        const isWorkerMode = process.env.WORKER_MODE === 'true';
        const isServerless = !isWorkerMode;

        // In serverless mode, connect to Redis quickly or fall back to memory
        // cache immediately so the Vercel invocation never stalls.
        const connectTimeout = isServerless ? 1500 : 10000;
        const reconnectStrategy = (retries: number) =>
          isServerless ? false : retries > 5 ? false : Math.min(retries * 100, 2000);

        try {
          const storeP = redisStore({
            url,
            socket: {
              tls: isRediss ? true : undefined,
              rejectUnauthorized: false,
              connectTimeout,
              reconnectStrategy,
            },
            ttl: 60 * 1000, // Default 60 seconds caching globally
          });

          // Fail fast in serverless mode: don't let redisStore() hang bootstrap
          // indefinitely when Redis is unreachable (DNS, auth, rate-limit).
          const store = isServerless
            ? await Promise.race([
                storeP,
                new Promise<never>((_, reject) =>
                  setTimeout(() => reject(new Error(`redisStore init timed out after ${connectTimeout}ms`)), connectTimeout),
                ),
              ])
            : await storeP;

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
