import { Module, Global, Logger, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueEventsService } from './queue-events.service.js';
import { OutboxDispatcherService } from './outbox-dispatcher.service.js';
import { LifecycleProcessor } from './lifecycle.processor.js';
import { RecoverySweepService } from './recovery-sweep.service.js';
import { MaintenanceController } from './maintenance.controller.js';
import { ExamsModule } from '../exams/exams.module.js';
import { SessionsModule } from '../sessions/sessions.module.js';
import { Redis as IORedis, RedisOptions } from 'ioredis';
import { resolveRedisTlsOptions } from '../../common/redis/redis.service.js';

const logger = new Logger('QueueModule');
const isWorkerMode = process.env.WORKER_MODE === 'true';
const isServerlessRuntime =
  !isWorkerMode &&
  (process.env.VERCEL === '1' || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME));

export const QUEUE_PREFIX = `wbm:${process.env.NODE_ENV || 'development'}:queue`;

export const DEFAULT_BULL_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1000,
  },
  removeOnComplete: {
    count: 100,
    age: 24 * 3600,
  },
  removeOnFail: {
    count: 500,
    age: 7 * 24 * 3600,
  },
};

/**
 * Builds BullMQ-compatible ioredis options for both worker and API producer modes.
 * - Worker mode: maxRetriesPerRequest: null (required for BullMQ blocking operations)
 *   and resilient unbounded retryStrategy so workers recover after temporary Redis outages.
 * - API producer mode: bounded per-request retries and automatic reconnection without
 *   permanently destroying singleton Queue clients after transient network errors or idle closes.
 */
export function buildBullRedisOptions(
  workerMode = process.env.WORKER_MODE === 'true',
): RedisOptions & { createClient?: (type: string, opts: RedisOptions) => IORedis } {
  const redisUrl = process.env.REDIS_URL;
  const redisHost = process.env.REDIS_HOST;
  const isConfigured = Boolean(redisUrl || redisHost);

  const base: RedisOptions = redisUrl
    ? ({
        url: redisUrl,
        tls: resolveRedisTlsOptions(redisUrl),
      } as RedisOptions)
    : {
        host: redisHost || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
      };

  if (workerMode) {
    return {
      ...base,
      lazyConnect: true,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      connectTimeout: 10000,
      retryStrategy: (times: number) => Math.min(times * 500, 10000),
      reconnectOnError: (err: Error) =>
        /READONLY|ETIMEDOUT|ECONNRESET/i.test(err.message),
    };
  }

  const producerOpts: RedisOptions = {
    ...base,
    lazyConnect: true,
    maxRetriesPerRequest: isServerlessRuntime ? 1 : 2,
    enableReadyCheck: false,
    connectTimeout: isServerlessRuntime ? 1500 : 5000,
    retryStrategy: isConfigured
      ? (times: number) => Math.min(times * 500, 5000)
      : () => null,
    reconnectOnError: (err: Error) =>
      /READONLY|ETIMEDOUT|ECONNRESET/i.test(err.message),
    noDelay: true,
  };

  return {
    ...producerOpts,
    createClient: (_type: string, clientOpts: RedisOptions) => {
      let client: IORedis;
      try {
        const mergedOpts = { ...producerOpts, ...clientOpts };
        if ((mergedOpts as any).url) {
          client = new IORedis((mergedOpts as any).url, mergedOpts);
        } else {
          client = new IORedis(mergedOpts);
        }
      } catch (err: any) {
        logger.warn(
          `BullMQ producer client parse error (falling back to disconnected client): ${err?.message || String(err).slice(0, 120)}`,
        );
        client = new IORedis({
          host: '127.0.0.1',
          port: 1,
          lazyConnect: true,
          connectTimeout: 100,
          retryStrategy: () => null,
          maxRetriesPerRequest: 0,
          autoResendUnfulfilledCommands: false,
          autoResubscribe: false,
          reconnectOnError: () => false,
          keepAlive: 0,
        } as RedisOptions);
      }

      if (typeof client.on === 'function') {
        client.on('error', (err: any) => {
          logger.warn(`BullMQ Redis client notice: ${err?.message || err}`);
        });
      }
      return client;
    },
  };
}

const bullRedisOpts = buildBullRedisOptions(isWorkerMode);

@Global()
@Module({
  imports: [
    forwardRef(() => ExamsModule),
    forwardRef(() => SessionsModule),
    BullModule.forRoot({
      connection: bullRedisOpts as any,
      defaultJobOptions: DEFAULT_BULL_JOB_OPTIONS,
      prefix: QUEUE_PREFIX,
    }),
    // D2-019: Register all required queues with exponential backoff defaults
    BullModule.registerQueue(
      { name: 'email' },
      { name: 'notification' },
      { name: 'attendance-import' },
      { name: 'certificate-gen' },
      { name: 'calendar-sync' },
      { name: 'media-process' },
      { name: 'invoice-gen' },
      { name: 'meeting-sync' },
      { name: 'lifecycle' },
    ),
  ],
  controllers: [MaintenanceController],
  providers: [
    OutboxDispatcherService,
    RecoverySweepService,
    ...(isWorkerMode ? [QueueEventsService, LifecycleProcessor] : []),
  ],
  exports: [
    BullModule,
    OutboxDispatcherService,
    RecoverySweepService,
    ...(isWorkerMode ? [QueueEventsService, LifecycleProcessor] : []),
  ],
})
export class QueueModule {}
