import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from './redis.service.js';
import { buildBullRedisOptions, DEFAULT_BULL_JOB_OPTIONS } from '../../modules/queue/queue.module.js';
import { Redis } from 'ioredis';

vi.mock('ioredis', () => {
  const RedisMock = vi.fn(function (this: any) {
    this.status = 'ready';
  });
  RedisMock.prototype.on = vi.fn();
  RedisMock.prototype.once = vi.fn();
  RedisMock.prototype.get = vi.fn();
  RedisMock.prototype.set = vi.fn();
  RedisMock.prototype.del = vi.fn();
  RedisMock.prototype.ping = vi.fn().mockResolvedValue('PONG');
  RedisMock.prototype.connect = vi.fn().mockResolvedValue(undefined);
  RedisMock.prototype.quit = vi.fn().mockResolvedValue('OK');
  RedisMock.prototype.disconnect = vi.fn();
  return { Redis: RedisMock, default: RedisMock };
});

describe('RedisService & BullMQ Connection Lifecycle', () => {
  let service: RedisService;
  let redisClientMock: any;

  beforeEach(async () => {
    const originalEnv = process.env;
    process.env = { ...originalEnv, REDIS_HOST: 'localhost', REDIS_PORT: '6379' };

    const module: TestingModule = await Test.createTestingModule({
      providers: [RedisService],
    }).compile();

    service = module.get<RedisService>(RedisService);
    redisClientMock = service.getClient();
    process.env = originalEnv;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Connection & TLS Security', () => {
    it('enables strict TLS certificate verification (rejectUnauthorized: true) by default for rediss:// URLs', () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        NODE_ENV: 'production',
        REDIS_URL: 'rediss://user:pass@redis-server.example.com:6379',
      };
      delete process.env.REDIS_TLS_INSECURE;
      vi.clearAllMocks();

      new RedisService();

      expect(Redis).toHaveBeenCalledWith(
        'rediss://user:pass@redis-server.example.com:6379',
        expect.objectContaining({
          tls: { rejectUnauthorized: true },
        }),
      );

      process.env = originalEnv;
    });

    it('allows insecure TLS (rejectUnauthorized: false) only in non-production when REDIS_TLS_INSECURE=true', () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        NODE_ENV: 'development',
        REDIS_TLS_INSECURE: 'true',
        REDIS_URL: 'rediss://user:pass@redis-server.example.com:6379',
      };
      vi.clearAllMocks();

      new RedisService();

      expect(Redis).toHaveBeenCalledWith(
        'rediss://user:pass@redis-server.example.com:6379',
        expect.objectContaining({
          tls: { rejectUnauthorized: false },
        }),
      );

      process.env = originalEnv;
    });

    it('connects without TLS if REDIS_URL is a standard redis://', () => {
      const originalEnv = process.env;
      process.env = { ...originalEnv, REDIS_URL: 'redis://localhost:6379' };
      vi.clearAllMocks();

      new RedisService();

      expect(Redis).toHaveBeenCalledWith(
        'redis://localhost:6379',
        expect.objectContaining({
          tls: undefined,
        }),
      );

      process.env = originalEnv;
    });

    it('configures BullMQ worker connection with maxRetriesPerRequest: null and unbounded resilient retryStrategy', () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        WORKER_MODE: 'true',
        REDIS_URL: 'redis://localhost:6379',
      };

      const workerOpts = buildBullRedisOptions(true);
      expect(workerOpts.maxRetriesPerRequest).toBeNull();
      expect(workerOpts.enableReadyCheck).toBe(false);
      expect(typeof workerOpts.retryStrategy).toBe('function');

      // Must survive > 5 attempts during temporary Redis outage without returning null
      expect(workerOpts.retryStrategy!(1)).toBeGreaterThan(0);
      expect(workerOpts.retryStrategy!(10)).toBe(5000);
      expect(workerOpts.retryStrategy!(50)).toBe(10000);

      process.env = originalEnv;
    });

    it('configures BullMQ producer connection to reconnect after transient outage instead of permanently self-destructing', () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        WORKER_MODE: 'false',
        REDIS_URL: 'redis://localhost:6379',
      };

      const producerOpts = buildBullRedisOptions(false);
      expect(producerOpts.maxRetriesPerRequest).toBeGreaterThan(0);
      expect(typeof producerOpts.retryStrategy).toBe('function');
      expect(producerOpts.retryStrategy!(1)).toBe(500);
      expect(producerOpts.retryStrategy!(20)).toBe(5000);

      // Verify bounded job retention defaults
      expect(DEFAULT_BULL_JOB_OPTIONS.removeOnComplete).toEqual({ count: 100, age: 86400 });
      expect(DEFAULT_BULL_JOB_OPTIONS.removeOnFail).toEqual({ count: 500, age: 604800 });

      process.env = originalEnv;
    });
  });

  describe('Key-Value & Health Operations', () => {
    it('gracefully handles setting values with a TTL', async () => {
      await service.set('test-key', 'value', 60);
      expect(redisClientMock.set).toHaveBeenCalledWith('test-key', 'value', 'EX', 60);
    });

    it('handles setting values without a TTL', async () => {
      await service.set('perm-key', 'value');
      expect(redisClientMock.set).toHaveBeenCalledWith('perm-key', 'value');
    });

    it('safely returns null for missing keys during get()', async () => {
      redisClientMock.get.mockResolvedValue(null);
      const result = await service.get('missing-key');
      expect(result).toBeNull();
      expect(redisClientMock.get).toHaveBeenCalledWith('missing-key');
    });

    it('properly delegates delete requests', async () => {
      await service.del('test-key');
      expect(redisClientMock.del).toHaveBeenCalledWith('test-key');
    });

    it('ping() returns true when Redis responds with PONG and false on error', async () => {
      redisClientMock.ping.mockResolvedValueOnce('PONG');
      expect(await service.ping(500)).toBe(true);

      redisClientMock.ping.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      expect(await service.ping(500)).toBe(false);
    });

    it('isReady() returns true only when status is ready, and false during connect/reconnecting/wait', () => {
      redisClientMock.status = 'ready';
      expect(service.isReady()).toBe(true);

      redisClientMock.status = 'connect';
      expect(service.isReady()).toBe(false);

      redisClientMock.status = 'reconnecting';
      expect(service.isReady()).toBe(false);

      redisClientMock.status = 'wait';
      expect(service.isReady()).toBe(false);
    });

    it('ping() enforces bounded timeout even when lazy connect() hangs', async () => {
      redisClientMock.status = 'wait';
      redisClientMock.connect.mockImplementation(() => new Promise(() => {})); // hangs indefinitely

      const start = Date.now();
      const ok = await service.ping(150);
      const elapsed = Date.now() - start;

      expect(ok).toBe(false);
      expect(elapsed).toBeLessThan(350);
    });
  });
});
