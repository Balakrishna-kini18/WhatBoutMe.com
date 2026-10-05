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
        
        return {
          store: await redisStore({
            url,
            // Pass standard ioredis options
            socket: isRediss ? { tls: true, rejectUnauthorized: false } : undefined,
            ttl: 60 * 1000, // Default 60 seconds caching globally
          }),
        };
      },
    }),
  ],
  providers: [RedisService],
  exports: [RedisService, CacheModule],
})
export class RedisGlobalModule {}
