import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { RedisService } from '../../common/redis/redis.service.js';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private prisma: PrismaService,
    private redisService: RedisService,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      // Database health check
      async () => {
        try {
          await this.prisma.$queryRaw`SELECT 1`;
          return { database: { status: 'up' } };
        } catch (error: any) {
          return { database: { status: 'down', error: error.message } };
        }
      },
      // Redis health check
      async () => {
        if (!process.env.REDIS_URL && !process.env.REDIS_HOST) {
          return { redis: { status: 'up', note: 'memory fallback (REDIS_URL not configured)' } };
        }
        try {
          const client = this.redisService.getClient();
          if (client.status === 'wait' || client.status === 'close' || client.status === 'end') {
            try { await client.connect(); } catch { /* noop */ }
          }
          await Promise.race([
            client.ping(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
          ]);
          return { redis: { status: 'up' } };
        } catch (error: any) {
          return { redis: { status: 'up', note: `memory fallback (${error?.message || 'offline'})` } };
        }
      },
    ]);
  }
}
