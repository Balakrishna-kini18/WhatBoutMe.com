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
    const SERVERLESS_CONNECT_WALLCLOCK_MS = 1500;
    const opts: RedisOptions = {
      ...base,
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      enableReadyCheck: false,
      connectTimeout: SERVERLESS_CONNECT_WALLCLOCK_MS,
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
        let killed = false;
        const kill = (err?: any) => {
          if (killed) return;
          killed = true;
          try { clearTimeout(killTimer); } catch {/* noop */}
          try {
            client.removeAllListeners();
            client.on('error', () => undefined);
            (client as any).disconnect(false);
          } catch {
            /* noop */
          }
          try {
            const sock = (client as any).stream || (client as any).socket;
            if (sock && typeof sock.destroy === 'function') sock.destroy();
          } catch {
            /* noop */
          }
          if (err) console.warn('[BullMQ serverless] redis error (socket released):', err?.message || String(err).slice(0, 120));
        };
        // WALLCLOCK GUARANTEE: even if connectTimeout / DNS / TLS handshake never
        // emit 'error' or 'connectTimeout' (can happen on some Lambda networks),
        // this setTimeout will FORCE the socket closed after 1500ms.
        const killTimer = setTimeout(() => kill(new Error(`wallclock ${SERVERLESS_CONNECT_WALLCLOCK_MS}ms connect limit exceeded`)), SERVERLESS_CONNECT_WALLCLOCK_MS);
        try { killTimer.unref(); } catch {/* noop */}
        client.once('ready', () => { try { clearTimeout(killTimer); } catch {/* noop */} });
        client.once('connect', () => { try { clearTimeout(killTimer); } catch {/* noop */} });
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
