import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Redis, RedisOptions } from 'ioredis';

export function resolveRedisTlsOptions(url?: string): { rejectUnauthorized: boolean } | undefined {
  if (!url || !url.startsWith('rediss://')) {
    return undefined;
  }
  const allowInsecureTls =
    process.env.REDIS_TLS_INSECURE === 'true' && process.env.NODE_ENV !== 'production';
  return { rejectUnauthorized: !allowInsecureTls };
}

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;
  private readonly configured: boolean;

  constructor() {
    const redisUrl = process.env.REDIS_URL;
    const redisHost = process.env.REDIS_HOST;
    this.configured = Boolean(redisUrl || redisHost);

    const isWorkerMode = process.env.WORKER_MODE === 'true';
    const isServerlessRuntime =
      !isWorkerMode &&
      (process.env.VERCEL === '1' || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME));

    const connectionOpts: Partial<RedisOptions> = isWorkerMode
      ? {
          connectTimeout: 10000,
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
          retryStrategy: (times: number) => Math.min(times * 500, 10000),
          reconnectOnError: (err: Error) =>
            /READONLY|ETIMEDOUT|ECONNRESET/i.test(err.message),
        }
      : {
          connectTimeout: isServerlessRuntime ? 1500 : 5000,
          maxRetriesPerRequest: isServerlessRuntime ? 1 : 2,
          enableReadyCheck: false,
          retryStrategy: this.configured
            ? (times: number) => Math.min(times * 500, 5000)
            : () => null,
          reconnectOnError: (err: Error) =>
            /READONLY|ETIMEDOUT|ECONNRESET/i.test(err.message),
          noDelay: true,
        };

    try {
      if (redisUrl) {
        this.client = new Redis(redisUrl, {
          tls: resolveRedisTlsOptions(redisUrl),
          lazyConnect: true,
          ...connectionOpts,
        } as RedisOptions);
      } else {
        this.client = new Redis({
          host: redisHost || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
          password: process.env.REDIS_PASSWORD || undefined,
          lazyConnect: true,
          ...connectionOpts,
        } as RedisOptions);
      }
    } catch (err: any) {
      this.logger.warn(
        `Redis client initialization warning (falling back to disconnected client): ${err?.message || err}`,
      );
      this.client = new Redis({
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

    if (typeof this.client.on === 'function') {
      this.client.on('error', (err: any) => {
        this.logger.warn(`Redis client notice: ${err?.message || err}`);
      });
      this.client.on('connect', () => {
        this.logger.log('Redis client connected');
      });
      this.client.on('reconnecting', (delay: number) => {
        this.logger.warn(`Redis client reconnecting in ${delay}ms`);
      });
    }
  }

  /**
   * Whether REDIS_URL or REDIS_HOST was explicitly configured in environment
   */
  isConfigured(): boolean {
    return this.configured;
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
   * Check whether the Redis connection is currently in a ready/connected state
   */
  isReady(): boolean {
    return this.client
      ? this.client.status === 'ready' || this.client.status === 'connect'
      : false;
  }

  /**
   * Active health check ping with bounded timeout.
   * Connects lazily if needed and verifies PONG response.
   */
  async ping(timeoutMs = 1500): Promise<boolean> {
    if (!this.configured || !this.client) {
      return false;
    }

    let timer: NodeJS.Timeout | undefined;
    try {
      const status = this.client.status;
      if (status === 'wait' || status === 'close' || status === 'end') {
        if (typeof (this.client as any).connect === 'function') {
          await (this.client as any).connect().catch(() => undefined);
        }
      }

      const pong = await Promise.race([
        this.client.ping(),
        new Promise<string>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Redis ping timeout')), timeoutMs);
          if (typeof timer.unref === 'function') {
            timer.unref();
          }
        }),
      ]);
      return pong === 'PONG';
    } catch (err: any) {
      this.logger.warn(`Redis ping failed: ${err?.message || err}`);
      return false;
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  async onModuleDestroy() {
    try {
      if (this.client) {
        if (this.client.status === 'ready' || this.client.status === 'connect') {
          await this.client.quit();
        } else if (typeof this.client.disconnect === 'function') {
          this.client.disconnect();
        }
      }
    } catch {
      try {
        this.client?.disconnect?.();
      } catch {
        // noop
      }
    }
  }
}
