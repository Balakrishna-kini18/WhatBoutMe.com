import { Global, Logger, Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-yet';
import { RedisService, resolveRedisTlsOptions } from './redis.service.js';

const logger = new Logger('RedisGlobalModule');

@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async () => {
        const url =
          process.env.REDIS_URL ||
          (process.env.REDIS_HOST
            ? `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT || '6379'}`
            : undefined);
        if (!url) {
          return { ttl: 60 * 1000 };
        }
        const isWorkerMode = process.env.WORKER_MODE === 'true';
        const isServerlessRuntime =
          !isWorkerMode &&
          Boolean(
            process.env.VERCEL ||
            process.env.AWS_LAMBDA_FUNCTION_NAME ||
            process.env.LAMBDA_TASK_ROOT ||
            process.env.GOOGLE_CLOUD_RUN ||
            process.env.K_SERVICE
          );

        // In serverless HTTP functions, all application caching uses CacheHelperService (backed by RedisService + LRU).
        // Skip eager redisStore() socket handshake during NestFactory.create() to eliminate 1.5s cold-start stalls
        // and avoid opening duplicate Redis connections per Lambda invocation.
        if (isServerlessRuntime) {
          return { ttl: 60 * 1000 };
        }

        const tlsOpts = resolveRedisTlsOptions(url);
        const connectTimeout = 5000;
        const reconnectStrategy = (retries: number) => Math.min(retries * 250, 5000);

        let timer: NodeJS.Timeout | undefined;
        try {
          const storeP = redisStore({
            url,
            socket: {
              tls: tlsOpts ? true : undefined,
              rejectUnauthorized: tlsOpts ? tlsOpts.rejectUnauthorized : undefined,
              connectTimeout,
              reconnectStrategy,
            },
            ttl: 60 * 1000,
          });

          const store = await Promise.race([
            storeP,
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () => reject(new Error(`redisStore init timed out after ${connectTimeout}ms`)),
                connectTimeout,
              );
              if (typeof timer.unref === 'function') {
                timer.unref();
              }
            }),
          ]);

          if (store && store.client) {
            store.client.on('error', (err: any) => {
              logger.warn(`Cache Redis client notice: ${err?.message || err}`);
            });
          }

          return { store };
        } catch (err: any) {
          logger.warn(
            `Cache Redis initialization warning, falling back to in-memory cache: ${err?.message || err}`,
          );
          return { ttl: 60 * 1000 };
        } finally {
          if (timer) {
            clearTimeout(timer);
          }
        }
      },
    }),
  ],
  providers: [RedisService],
  exports: [RedisService, CacheModule],
})
export class RedisGlobalModule {}
