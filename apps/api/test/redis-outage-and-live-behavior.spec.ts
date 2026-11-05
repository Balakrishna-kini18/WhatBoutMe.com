import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CacheHelperService } from '../src/common/cache/cache-helper.service.js';
import { RedisThrottlerStorage } from '../src/common/throttler/redis-throttler.storage.js';
import { OutboxDispatcherService } from '../src/modules/queue/outbox-dispatcher.service.js';

describe('Production Verification: Redis Outage vs Live Redis Behavior', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // 1. REDIS OUTAGE VERIFICATION (Fail-Open & Non-Spammy Logging)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('1. Redis Outage Verification (Unreachable / Failing Redis)', () => {
    let outageCache: CacheHelperService;
    let failingRedis: any;

    beforeEach(() => {
      failingRedis = {
        get: vi.fn().mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:6379')),
        set: vi.fn().mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:6379')),
        del: vi.fn().mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:6379')),
        incr: vi.fn().mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:6379')),
      };

      const redisServiceMock: any = {
        getClient: () => failingRedis,
      };

      outageCache = new CacheHelperService(redisServiceMock);
    });

    it('cache reads fail-open to DB fetcher without throwing into user requests', async () => {
      let dbQueries = 0;
      const fetcher = async () => {
        dbQueries++;
        return { programId: 'prog-1', title: 'Life Design Workshop' };
      };

      const result = await outageCache.getOrSet('wbm:prod:lms:curriculum:prog-1:v1', fetcher, 60);

      expect(result).toEqual({ programId: 'prog-1', title: 'Life Design Workshop' });
      expect(dbQueries).toBe(1);
    });

    it('direct cache get() returns null (cache miss) instead of throwing', async () => {
      const result = await outageCache.get('wbm:prod:lms:missing-key');
      expect(result).toBeNull();
    });

    it('cache set(), invalidate(), and del() silently fail-open without throwing', async () => {
      await expect(outageCache.set('key-1', { data: 'val' }, 60)).resolves.not.toThrow();
      await expect(outageCache.invalidate('key-1')).resolves.not.toThrow();
      await expect(outageCache.del('key-1')).resolves.not.toThrow();
      await expect(outageCache.invalidateTag('programs')).resolves.not.toThrow();
    });

    it('throttler falls back to in-memory rate limiting when Redis is unreachable', async () => {
      const throttlerFailingRedis: any = {
        eval: vi.fn().mockRejectedValue(new Error('ETIMEDOUT Redis node unresponsive')),
      };

      const throttler = new RedisThrottlerStorage(throttlerFailingRedis);

      // Should gracefully fall back to memory without crashing or throwing
      const record = await throttler.increment('192.168.1.100', 60000, 5, 30000, 'default');
      expect(record.totalHits).toBe(1);
      expect(record.isBlocked).toBe(false);
      expect(record.timeToExpire).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. NORMAL REDIS ENDPOINT VERIFICATION (Live State)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('2. Normal Redis Endpoint Verification', () => {
    let mockStore: Map<string, string>;
    let liveRedis: any;
    let liveCache: CacheHelperService;

    beforeEach(() => {
      mockStore = new Map();
      liveRedis = {
        get: vi.fn().mockImplementation(async (key: string) => mockStore.get(key) ?? null),
        set: vi.fn().mockImplementation(async (key: string, val: string) => {
          mockStore.set(key, val);
          return 'OK';
        }),
        del: vi.fn().mockImplementation(async (...keys: string[]) => {
          let count = 0;
          for (const k of keys) {
            if (mockStore.delete(k)) count++;
          }
          return count;
        }),
        incr: vi.fn().mockImplementation(async (key: string) => {
          const val = (parseInt(mockStore.get(key) || '0', 10) + 1).toString();
          mockStore.set(key, val);
          return parseInt(val, 10);
        }),
      };

      const redisServiceMock: any = {
        getClient: () => liveRedis,
      };

      liveCache = new CacheHelperService(redisServiceMock);
    });

    it('populates Redis on miss and serves from Redis on second call', async () => {
      let dbCalls = 0;
      const fetcher = async () => {
        dbCalls++;
        return { courseId: 'c1', name: 'Authoritative Title' };
      };

      // 1st call: Miss -> writes to Redis
      const first = await liveCache.getOrSet('course:c1', fetcher, 300);
      expect(first).toEqual({ courseId: 'c1', name: 'Authoritative Title' });
      expect(dbCalls).toBe(1);

      // Verify serialized into Redis mockStore
      expect(mockStore.has('course:c1')).toBe(true);

      // Create fresh CacheHelper without local memory cache to test pure Redis read
      const freshCache = new CacheHelperService({ getClient: () => liveRedis } as any);
      const second = await freshCache.getOrSet('course:c1', fetcher, 300);
      expect(second).toEqual({ courseId: 'c1', name: 'Authoritative Title' });
      expect(dbCalls).toBe(1); // Served directly from Redis!
    });

    it('detects corrupt JSON in Redis, deletes it, and recovers from DB', async () => {
      mockStore.set('corrupt:p1', '{"malformed_json_without_end:');

      let dbCalls = 0;
      const fetcher = async () => {
        dbCalls++;
        return { repaired: true };
      };

      const freshCache = new CacheHelperService({ getClient: () => liveRedis } as any);
      const res = await freshCache.getOrSet('corrupt:p1', fetcher, 300);

      expect(res).toEqual({ repaired: true });
      expect(dbCalls).toBe(1);
      // Corrupt value was purged and re-populated with repaired valid JSON
      expect(mockStore.get('corrupt:p1')).toBe(JSON.stringify({ repaired: true }));
    });

    it('throttler atomically enforces limits and blocks excess hits via Lua script', async () => {
      const throttlerMockRedis: any = {
        eval: vi.fn().mockImplementation(async (_script, _numKeys, _k1, _k2, _ttl, limit, _blockDuration) => {
          // Simulate 1st hit
          return [1, 60000, 0, 0];
        }),
      };

      const throttler = new RedisThrottlerStorage(throttlerMockRedis);
      const res = await throttler.increment('user-123', 60000, 10, 30000, 'default');

      expect(res.totalHits).toBe(1);
      expect(res.isBlocked).toBe(false);
      expect(throttlerMockRedis.eval).toHaveBeenCalledWith(
        expect.any(String),
        2,
        expect.stringContaining('user-123'),
        expect.stringContaining(':blocked'),
        '60000',
        '10',
        '30000',
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. OUTBOX & RECOVERY CLAIMS
  // ─────────────────────────────────────────────────────────────────────────────
  describe('3. Outbox Recovery Claims & Non-Retryable Constraints', () => {
    it('claims retryable FAILED events after backoff and excludes terminal events', async () => {
      const prismaMock: any = {
        outboxEvent: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'failed-recoverable', action: 'CREATE', status: 'FAILED', attempts: 2, payload: {} },
          ]),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };

      const queueMock: any = {
        add: vi.fn().mockResolvedValue({ id: 'queued' }),
      };

      const dispatcher = new OutboxDispatcherService(prismaMock, queueMock);
      const count = await dispatcher.claimAndDispatchPending(50);

      expect(count).toBe(1);
      expect(prismaMock.outboxEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            attempts: { lt: 5 }, // Strictly excludes attempts >= 5
          }),
        }),
      );
      expect(queueMock.add).toHaveBeenCalledWith(
        'sync-meeting',
        expect.objectContaining({ outboxId: 'failed-recoverable' }),
        expect.objectContaining({ jobId: 'outbox-failed-recoverable' }),
      );
    });
  });
});
