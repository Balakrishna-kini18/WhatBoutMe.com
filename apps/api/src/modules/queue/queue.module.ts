import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueEventsService } from './queue-events.service.js';
import { OutboxDispatcherService } from './outbox-dispatcher.service.js';
import { Redis as IORedis, RedisOptions } from 'ioredis';

const isWorkerMode = process.env.WORKER_MODE === 'true';
const isServerless = !isWorkerMode;

const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,
  },
};

// In serverless mode we cannot tolerate hanging Redis connections past the
// function timeout, so connect aggressively once then give up immediately
// and DESTROY the client on any error so the TCP socket is released.
// Workers/long-lived processes get standard retries.
function buildBullRedisOptions(): RedisOptions & { createClient?: (type: string, opts: RedisOptions) => IORedis } {
  const base = process.env.REDIS_URL
    ? {
        url: process.env.REDIS_URL,
        tls: process.env.REDIS_URL.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
      }
    : {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
      };

  if (isServerless) {
    const opts: RedisOptions = {
      ...base,
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      enableReadyCheck: false,
      connectTimeout: 1000,
      retryStrategy: () => null,
      autoResendUnfulfilledCommands: false,
      autoResubscribe: false,
      reconnectOnError: () => false,
      keepAlive: 0,
      noDelay: true,
    };
    return {
      ...opts,
      createClient: (_type: string, clientOpts: RedisOptions) => {
        const client = new IORedis(clientOpts);
        // Kill the TCP socket immediately on any connection-level error so
        // the Vercel event loop goes idle and the function terminates.
        const kill = (err?: any) => {
          try {
            client.removeAllListeners();
            client.on('error', () => undefined);
            client.disconnect(false);
          } catch {
            /* noop */
          }
          if (err) console.warn('[BullMQ serverless] redis error (socket released):', err?.message || String(err).slice(0, 120));
        };
        client.once('error', kill);
        client.once('close', () => kill());
        client.once('connectTimeout', () => kill(new Error('connectTimeout')));
        return client;
      },
    };
  }

  return {
    ...base,
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    enableReadyCheck: false,
    connectTimeout: 10000,
    retryStrategy: (times: number) => (times > 5 ? null : Math.min(times * 200, 3000)),
  };
}

const bullRedisOpts = buildBullRedisOptions();

@Global()
@Module({
  imports: [
    BullModule.forRoot({
      connection: bullRedisOpts as any,
      defaultJobOptions,
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
    ),
  ],
  providers: [
    ...(isWorkerMode ? [QueueEventsService, OutboxDispatcherService] : []),
  ],
  exports: [
    BullModule,
    ...(isWorkerMode ? [QueueEventsService, OutboxDispatcherService] : []),
  ],
})
export class QueueModule {}
