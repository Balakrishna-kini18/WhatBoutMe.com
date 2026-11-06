import { Controller, Get, Optional, ServiceUnavailableException } from '@nestjs/common';
import { HealthCheck, HealthCheckService, HealthIndicatorResult } from '@nestjs/terminus';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { RedisService } from '../../common/redis/redis.service.js';

@Controller(['health', 'api/health'])
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private prisma: PrismaService,
    private redisService: RedisService,
    @Optional() @InjectQueue('email') private readonly emailQueue?: Queue,
    @Optional() @InjectQueue('meeting-sync') private readonly meetingSyncQueue?: Queue,
    @Optional() @InjectQueue('lifecycle') private readonly lifecycleQueue?: Queue,
  ) {}

  @Public()
  @Get()
  async check() {
    const start = Date.now();
    try {
      // Ultra-lightweight keep-alive & warmup: executes SELECT 1 to prevent free-tier DB sleep
      await this.prisma.$queryRaw`SELECT 1`;
      const isRedisConfigured =
        typeof this.redisService?.isConfigured === 'function'
          ? this.redisService.isConfigured()
          : Boolean(process.env.REDIS_URL || process.env.REDIS_HOST);
      const redisStatus = !isRedisConfigured
        ? 'disabled'
        : this.redisService?.isReady?.()
          ? 'up'
          : 'degraded';

      return {
        status: 'ok',
        database: 'connected',
        redis: redisStatus,
        latencyMs: Date.now() - start,
        timestamp: new Date().toISOString(),
        info: {
          database: { status: 'up' },
          redis: { status: redisStatus },
        },
      };
    } catch (error: any) {
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'disconnected',
        error: error?.message || String(error),
        timestamp: new Date().toISOString(),
        info: {
          database: { status: 'down', error: error?.message },
        },
      });
    }
  }

  @Public()
  @Get('details')
  @HealthCheck()
  detailedCheck() {
    return this.health.check([
      // 1. Database health check
      async () => {
        try {
          await this.prisma.$queryRaw`SELECT 1`;
          return { database: { status: 'up' } };
        } catch (error: any) {
          return { database: { status: 'down', error: error.message } };
        }
      },
      // 2. Redis health check (accurately distinguishes disabled, up, and down)
      async (): Promise<HealthIndicatorResult> => {
        const isConfigured =
          typeof this.redisService?.isConfigured === 'function'
            ? this.redisService.isConfigured()
            : Boolean(process.env.REDIS_URL || process.env.REDIS_HOST);

        if (!isConfigured) {
          return {
            redis: {
              status: 'disabled' as any,
              mode: 'memory-fallback',
              note: 'REDIS_URL not configured',
            },
          };
        }

        let timer: NodeJS.Timeout | undefined;
        try {
          const client = this.redisService.getClient();
          const probePromise = (async () => {
            if (
              client &&
              (client.status === 'wait' || client.status === 'close' || client.status === 'end')
            ) {
              try {
                await client.connect();
              } catch {
                /* handled by ping below */
              }
            }
            return await client.ping();
          })();
          probePromise.catch(() => undefined);

          await Promise.race([
            probePromise,
            new Promise((_, reject) => {
              timer = setTimeout(() => reject(new Error('timeout')), 1500);
              if (typeof timer.unref === 'function') {
                timer.unref();
              }
            }),
          ]);
          return { redis: { status: 'up' } };
        } catch (error: any) {
          return {
            redis: {
              status: 'down',
              error: error?.message || 'Redis unreachable',
            },
          };
        } finally {
          if (timer) {
            clearTimeout(timer);
          }
        }
      },
      // 3. Outbox & Queue operational metrics (when available)
      async (): Promise<HealthIndicatorResult> => {
        if (typeof (this.prisma as any)?.outboxEvent?.count !== 'function') {
          return {} as HealthIndicatorResult;
        }
        try {
          const [pending, leased, retryableFailed, terminalFailed] = await Promise.all([
            this.prisma.outboxEvent.count({ where: { status: 'PENDING' } }),
            this.prisma.outboxEvent.count({ where: { status: 'PROCESSING' } }),
            this.prisma.outboxEvent.count({
              where: { status: 'FAILED', attempts: { lt: 5 } },
            }),
            this.prisma.outboxEvent.count({
              where: { status: 'FAILED', attempts: { gte: 5 } },
            }),
          ]);

          const queues: Record<string, any> = {};
          const activeQueues: Array<[string, Queue | undefined]> = [
            ['email', this.emailQueue],
            ['meeting-sync', this.meetingSyncQueue],
            ['lifecycle', this.lifecycleQueue],
          ];

          for (const [name, q] of activeQueues) {
            if (q && typeof q.getJobCounts === 'function' && this.redisService?.isReady?.()) {
              try {
                queues[name] = await q.getJobCounts(
                  'waiting',
                  'active',
                  'delayed',
                  'completed',
                  'failed',
                );
              } catch {
                // Skip queue count if Redis is unreachable
              }
            }
          }

          return {
            outbox: {
              status: (terminalFailed > 0 ? 'degraded' : 'up') as any,
              pending,
              leased,
              retryableFailed,
              terminalFailed,
            },
            ...(Object.keys(queues).length > 0 ? ({ queues } as any) : {}),
          } as HealthIndicatorResult;
        } catch (err: any) {
          return {
            outbox: {
              status: 'down',
              error: err?.message || 'Failed to query outbox metrics',
            },
          };
        }
      },
    ]);
  }
}
