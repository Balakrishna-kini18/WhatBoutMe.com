import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor() {
    // Determine the exact connection configuration for Redis / Valkey (TCP) or local Docker
    const isRediss = process.env.REDIS_URL?.startsWith('rediss://');
    const isWorkerMode = process.env.WORKER_MODE === 'true';
    const isServerless = !isWorkerMode;

    // In serverless mode, fail Redis fast (1.5s connect, no retries) so the
    // function invocation never stalls past Vercel's timeout budget.
    // Long-lived workers get a tolerant retry policy.
    const serverlessOpts = isServerless
      ? {
          connectTimeout: 1500,
          retryStrategy: () => null as any,
          maxRetriesPerRequest: 1,
          autoResendUnfulfilledCommands: false,
          autoResubscribe: false,
          reconnectOnError: () => false as any,
          keepAlive: 0,
          noDelay: true,
        }
      : {
          connectTimeout: 10000,
          retryStrategy: (times: number) => (times > 5 ? null : Math.min(times * 200, 3000)),
          maxRetriesPerRequest: 3,
        };

    // NOTE: `new Redis(<malformed url>)` throws SYNCHRONOUSLY during URL
    // parsing (before any socket is opened, before lazyConnect even has a
    // chance to engage).  Wrap the entire constructor in try/catch so a
    // wrong/invalid REDIS_URL (the classic "I entered wrong env var" case
    // the user reported) degrades gracefully to a no-op disconnected client
    // + warning instead of crashing Nest DI → generic FUNCTION_INVOCATION_FAILED.
    let clientAttempted: Redis | undefined;
    try {
      if (process.env.REDIS_URL) {
        clientAttempted = new Redis(process.env.REDIS_URL, {
          tls: isRediss ? { rejectUnauthorized: false } : undefined,
          lazyConnect: true,
          ...serverlessOpts,
        } as any);
      } else {
        clientAttempted = new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
          password: process.env.REDIS_PASSWORD || undefined,
          lazyConnect: true,
          ...serverlessOpts,
        } as any);
      }
      this.client = clientAttempted;
    } catch (err: any) {
      console.warn('[RedisService] Constructor warning (falling back to disconnected no-op client):', err?.message || err);
      // Fully valid ioredis client with lazyConnect + connectTimeout 1 +
      // retryStrategy null.  All .get()/.set() calls will reject fast with a
      // clean connection error instead of crashing bootstrap.  Downstream
      // consumers already have their own try/catch for Redis failures.
      this.client = new Redis({
        host: '127.0.0.1',
        port: 1,
        lazyConnect: true,
        connectTimeout: 1,
        retryStrategy: () => null as any,
        maxRetriesPerRequest: 0,
        autoResendUnfulfilledCommands: false,
        autoResubscribe: false,
        reconnectOnError: () => false as any,
        keepAlive: 0,
      } as any);
      // Serverless kill-socket path still applies to our fallback client so
      // even this 127.0.0.1:1 dead-end doesn't stall the event loop.
      if (isServerless) {
        try {
          let killed = false;
          const kill = () => {
            if (killed) return; killed = true;
            try { (this.client as any).removeAllListeners(); this.client.on('error', () => undefined); (this.client as any).disconnect(false); } catch {}
            try { const s = (this.client as any).stream || (this.client as any).socket; if (s && typeof s.destroy === 'function') s.destroy(); } catch {}
          };
          const t = setTimeout(kill, 200); try { t.unref(); } catch {}
          this.client.once('ready', () => { try { clearTimeout(t); } catch {} });
          this.client.once('error', kill);
          this.client.once('close', kill);
        } catch {}
      }
      return; // Skip the post-constructor registration block below
    }

    if (isServerless) {
      // Kill TCP socket immediately on any connection-level failure so the
      // Vercel event loop goes idle instead of hanging.
      const SERVERLESS_CONNECT_WALLCLOCK_MS = 1500;
      let killed = false;
      const kill = (err?: any) => {
        if (killed) return;
        killed = true;
        try { clearTimeout(killTimer); } catch {/* noop */}
        try {
          this.client.removeAllListeners();
          this.client.on('error', () => undefined);
          (this.client as any).disconnect(false);
        } catch {
          /* noop */
        }
        try {
          const sock = (this.client as any).stream || (this.client as any).socket;
          if (sock && typeof sock.destroy === 'function') sock.destroy();
        } catch {
          /* noop */
        }
        if (err) console.warn('[RedisService serverless] redis error (socket released):', err?.message || String(err).slice(0, 120));
      };
      // WALLCLOCK GUARANTEE: DNS + TLS handshakes on Vercel Lambda's network
      // sometimes hang past ioredis's connectTimeout without emitting any
      // event. Only arm this wallclock timer once an actual connection attempt begins.
      let killTimer: any;
      this.client.on('connecting', () => {
        killTimer = setTimeout(() => kill(new Error(`wallclock ${SERVERLESS_CONNECT_WALLCLOCK_MS}ms connect limit exceeded`)), SERVERLESS_CONNECT_WALLCLOCK_MS);
        try { killTimer.unref(); } catch {/* noop */}
      });
      this.client.once?.('ready', () => { try { clearTimeout(killTimer); } catch {/* noop */} });
      this.client.once?.('connect', () => { try { clearTimeout(killTimer); } catch {/* noop */} });
      this.client.once?.('error', kill);
      this.client.once?.('close', () => kill());
      this.client.once?.('connectTimeout', () => kill(new Error('connectTimeout')));
    } else {
      this.client.on('error', (err) => console.warn('Redis Client notice (non-fatal):', err?.message || err));
      this.client.on('connect', () => console.log('Redis Client Connected Successfully'));
    }
  }

  /**
   * Get the raw ioredis client for advanced use cases
   */
  getClient(): Redis {
    return this.client;
  }

  /**
   * Set a key-value pair in Redis
   */
  async set(key: string, value: string | number, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  /**
   * Get a value from Redis
   */
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /**
   * Delete a key from Redis
   */
  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  /**
   * Graceful shutdown of the connection
   */
  isReady(): boolean {
    return this.client ? (this.client.status === 'ready' || this.client.status === 'connect') : false;
  }

  async onModuleDestroy() {
    try {
      if (this.client) {
        if (this.client.status === 'ready' || this.client.status === 'connect') {
          await this.client.quit();
        } else {
          this.client.disconnect();
        }
      }
    } catch {
      try { this.client?.disconnect(); } catch {}
    }
  }
}
