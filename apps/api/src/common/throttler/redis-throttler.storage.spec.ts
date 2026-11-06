import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RedisThrottlerStorage } from './redis-throttler.storage.js';

describe('RedisThrottlerStorage — Standard Redis & Valkey Rate Limiter', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('1. In-Memory Fallback (Offline / Missing REDIS_URL)', () => {
    it('initializes gracefully without crashing when REDIS_URL is not set', async () => {
      delete process.env.REDIS_URL;
      delete process.env.REDIS_HOST;

      const storage = new RedisThrottlerStorage();
      const res = await storage.increment('client-ip-127.0.0.1', 60000, 5, 30000, 'default');

      expect(res.totalHits).toBe(1);
      expect(res.isBlocked).toBe(false);
      expect(res.timeToExpire).toBeGreaterThan(0);
    });

    it('enforces rate limits in-memory when Redis is unavailable', async () => {
      delete process.env.REDIS_URL;
      delete process.env.REDIS_HOST;

      const storage = new RedisThrottlerStorage();
      const key = 'test-client-fallback';
      const limit = 3;

      for (let i = 1; i <= limit; i++) {
        const res = await storage.increment(key, 60000, limit, 30000, 'default');
        expect(res.totalHits).toBe(i);
        expect(res.isBlocked).toBe(false);
      }

      // Exceeding the limit blocks in memory
      const blockedRes = await storage.increment(key, 60000, limit, 30000, 'default');
      expect(blockedRes.totalHits).toBeGreaterThan(limit);
      expect(blockedRes.isBlocked).toBe(true);
    });
  });

  describe('2. Key Normalization & Tracker Security', () => {
    it('normalizes standard IPv4 keys safely', () => {
      const storage = new RedisThrottlerStorage();
      expect(storage.normalizeKey('192.168.1.100')).toBe('192.168.1.100');
    });

    it('normalizes complex IPv6 keys safely', () => {
      const storage = new RedisThrottlerStorage();
      const ipv6 = '2001:0db8:85a3:0000:0000:8a2e:0370:7334';
      const normalized = storage.normalizeKey(ipv6);
      expect(normalized).toBe(ipv6);
    });

    it('hashes long or malicious injection keys to 32-character hex digest', () => {
      const storage = new RedisThrottlerStorage();
      const longOrDirtyKey = 'user/hack?payload=SELECT * FROM users WHERE 1=1 AND drop table--' + 'a'.repeat(100);
      const normalized = storage.normalizeKey(longOrDirtyKey);

      expect(normalized).toHaveLength(32);
      expect(/^[a-f0-9]{32}$/.test(normalized)).toBe(true);
    });

    it('handles empty or undefined keys safely as anonymous', () => {
      const storage = new RedisThrottlerStorage();
      expect(storage.normalizeKey('')).toBe('anonymous');
      expect(storage.normalizeKey(null as any)).toBe('anonymous');
    });
  });

  describe('3. Standard Redis Mock Execution (Lua Script Evaluation)', () => {
    it('increments correctly on first request and sets TTL', async () => {
      const mockEval = vi.fn().mockResolvedValue([1, 59900, 0, 0]);
      const mockRedis: any = {
        eval: mockEval,
        on: vi.fn(),
      };

      const storage = new RedisThrottlerStorage(mockRedis);
      const res = await storage.increment('10.0.0.1', 60000, 300, 60000, 'default');

      expect(mockEval).toHaveBeenCalledTimes(1);
      expect(res.totalHits).toBe(1);
      expect(res.isBlocked).toBe(false);
      expect(res.timeToExpire).toBe(60); // 59900ms rounded up to 60s
      expect(res.timeToBlockExpire).toBe(0);
    });

    it('blocks request when limit is exceeded and returns blockDuration', async () => {
      const mockEval = vi.fn().mockResolvedValue([301, 0, 1, 60000]);
      const mockRedis: any = {
        eval: mockEval,
        on: vi.fn(),
      };

      const storage = new RedisThrottlerStorage(mockRedis);
      const res = await storage.increment('10.0.0.1', 60000, 300, 60000, 'default');

      expect(res.totalHits).toBe(301);
      expect(res.isBlocked).toBe(true);
      expect(res.timeToBlockExpire).toBe(60);
    });

    it('fails open to memory fallback when Redis eval throws a network error', async () => {
      const mockEval = vi.fn().mockRejectedValue(new Error('Connection lost to Redis server'));
      const mockRedis: any = {
        eval: mockEval,
        on: vi.fn(),
      };

      const storage = new RedisThrottlerStorage(mockRedis);
      const res = await storage.increment('10.0.0.1', 60000, 300, 60000, 'default');

      // Does not throw; falls back safely to memory fallback
      expect(res.totalHits).toBe(1);
      expect(res.isBlocked).toBe(false);
    });
  });

  describe('4. Multi-Instance Concurrency & Shared State', () => {
    it('shares rate limits across two independent storage instances via Redis eval', async () => {
      let sharedHits = 0;
      const fakeRedisEval = vi.fn().mockImplementation(async (_script, _numkeys, _k1, _k2, ttl, limit, blockDuration) => {
        sharedHits++;
        const isBlocked = sharedHits > Number(limit);
        return [sharedHits, Number(ttl), isBlocked ? 1 : 0, isBlocked ? Number(blockDuration) : 0];
      });

      const mockRedis: any = { eval: fakeRedisEval, on: vi.fn() };

      const instanceA = new RedisThrottlerStorage(mockRedis);
      const instanceB = new RedisThrottlerStorage(mockRedis);

      const key = 'shared-user-123';
      const limit = 4;

      // Instance A takes hit 1
      const res1 = await instanceA.increment(key, 60000, limit, 30000, 'default');
      expect(res1.totalHits).toBe(1);

      // Instance B takes hit 2
      const res2 = await instanceB.increment(key, 60000, limit, 30000, 'default');
      expect(res2.totalHits).toBe(2);

      // Concurrent hits from both instances
      const [res3, res4] = await Promise.all([
        instanceA.increment(key, 60000, limit, 30000, 'default'),
        instanceB.increment(key, 60000, limit, 30000, 'default'),
      ]);

      expect(res3.totalHits).toBe(3);
      expect(res4.totalHits).toBe(4);

      // Exceeded on next request from either instance
      const res5 = await instanceA.increment(key, 60000, limit, 30000, 'default');
      expect(res5.totalHits).toBe(5);
      expect(res5.isBlocked).toBe(true);
    });
  });
});

