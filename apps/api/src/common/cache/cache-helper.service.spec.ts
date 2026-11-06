import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CacheHelperService } from './cache-helper.service.js';

describe('CacheHelperService (LRU + TTL + Tag-Based Invalidation)', () => {
  let cache: CacheHelperService;

  beforeEach(() => {
    // Ensure Redis is disabled in this test instance so we test high-performance local LRU
    cache = new CacheHelperService();
  });

  it('1. should cache and return values within TTL', async () => {
    let callCount = 0;
    const fetcher = async () => {
      callCount++;
      return { data: 'test-payload' };
    };

    const first = await cache.getOrSet('key-1', fetcher, 60);
    expect(first).toEqual({ data: 'test-payload' });
    expect(callCount).toBe(1);

    const second = await cache.getOrSet('key-1', fetcher, 60);
    expect(second).toEqual({ data: 'test-payload' });
    expect(callCount).toBe(1); // Served from cache
  });

  it('2. should deduplicate in-flight requests via Promise coalescing', async () => {
    let callCount = 0;
    const slowFetcher = async () => {
      callCount++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { id: 123 };
    };

    const [res1, res2, res3] = await Promise.all([
      cache.getOrSet('slow-key', slowFetcher, 60),
      cache.getOrSet('slow-key', slowFetcher, 60),
      cache.getOrSet('slow-key', slowFetcher, 60),
    ]);

    expect(res1).toEqual({ id: 123 });
    expect(res2).toEqual({ id: 123 });
    expect(res3).toEqual({ id: 123 });
    expect(callCount).toBe(1); // Only 1 database roundtrip executed
  });

  it('3. should invalidate individual keys', async () => {
    let callCount = 0;
    const fetcher = async () => ++callCount;

    await cache.getOrSet('key-a', fetcher, 60);
    expect(callCount).toBe(1);

    await cache.invalidate('key-a');

    await cache.getOrSet('key-a', fetcher, 60);
    expect(callCount).toBe(2);
  });

  it('4. should purge all matching keys by tag when invalidateTag is called', async () => {
    let prog1Calls = 0;
    let prog2Calls = 0;
    let otherCalls = 0;

    await cache.getOrSet('prog:1', async () => ++prog1Calls, 60, ['programs', 'prog:1']);
    await cache.getOrSet('prog:2', async () => ++prog2Calls, 60, ['programs', 'prog:2']);
    await cache.getOrSet('user:1', async () => ++otherCalls, 60, ['users']);

    expect(prog1Calls).toBe(1);
    expect(prog2Calls).toBe(1);
    expect(otherCalls).toBe(1);

    // Invalidate entire 'programs' tag
    const purged = await cache.invalidateTag('programs');
    expect(purged).toBe(2);

    // Programs should re-fetch
    await cache.getOrSet('prog:1', async () => ++prog1Calls, 60, ['programs', 'prog:1']);
    await cache.getOrSet('prog:2', async () => ++prog2Calls, 60, ['programs', 'prog:2']);
    expect(prog1Calls).toBe(2);
    expect(prog2Calls).toBe(2);

    // Other tag ('users') remains untouched in cache
    await cache.getOrSet('user:1', async () => ++otherCalls, 60, ['users']);
    expect(otherCalls).toBe(1);
  });

  it('5. should invalidate multiple tags concurrently with invalidateTags', async () => {
    let pCalls = 0;
    let rCalls = 0;

    await cache.getOrSet('p1', async () => ++pCalls, 60, ['programs']);
    await cache.getOrSet('r1', async () => ++rCalls, 60, ['resources']);

    await cache.invalidateTags(['programs', 'resources']);

    await cache.getOrSet('p1', async () => ++pCalls, 60, ['programs']);
    await cache.getOrSet('r1', async () => ++rCalls, 60, ['resources']);

    expect(pCalls).toBe(2);
    expect(rCalls).toBe(2);
  });

  it('6. should evict least recently used entries when capacity limit is reached', async () => {
    // Create cache with small capacity of 3
    process.env.CACHE_MAX_ENTRIES = '3';
    const smallCache = new CacheHelperService();

    await smallCache.set('item-1', 'A', 60);
    await smallCache.set('item-2', 'B', 60);
    await smallCache.set('item-3', 'C', 60);

    // Access item-1 so item-2 becomes the oldest entry
    await smallCache.get('item-1');

    // Add 4th item, which should trigger LRU eviction of item-2
    await smallCache.set('item-4', 'D', 60);

    expect(await smallCache.get('item-1')).toBe('A'); // Kept (accessed)
    expect(await smallCache.get('item-2')).toBeNull(); // Evicted!
    expect(await smallCache.get('item-3')).toBe('C'); // Kept
    expect(await smallCache.get('item-4')).toBe('D'); // Kept

    delete process.env.CACHE_MAX_ENTRIES;
  });

  it('7. should treat corrupt JSON in Redis as cache miss, delete it best-effort, and read from DB', async () => {
    const deletedKeys: string[] = [];
    const mockRedis: any = {
      get: vi.fn().mockResolvedValue('{"corrupt": invalid_json'),
      del: vi.fn().mockImplementation(async (key: string) => {
        deletedKeys.push(key);
        return 1;
      }),
      set: vi.fn().mockResolvedValue('OK'),
    };
    const mockRedisService: any = {
      getClient: () => mockRedis,
    };

    const redisCache = new CacheHelperService(mockRedisService);
    let dbFetcherCalled = false;
    const fetcher = async () => {
      dbFetcherCalled = true;
      return { id: 'authoritative-result' };
    };

    const result = await redisCache.getOrSet('corrupt-key', fetcher, 60);

    expect(result).toEqual({ id: 'authoritative-result' });
    expect(dbFetcherCalled).toBe(true);
    expect(deletedKeys).toContain('corrupt-key');
  });

  it('8. should fail-open when Redis throws an unexpected error, returning data from DB', async () => {
    const mockRedis: any = {
      get: vi.fn().mockRejectedValue(new Error('READONLY You cannot write against a read only replica')),
      set: vi.fn().mockRejectedValue(new Error('Connection reset by peer')),
    };
    const mockRedisService: any = {
      getClient: () => mockRedis,
    };

    const redisCache = new CacheHelperService(mockRedisService);
    const fetcher = async () => ({ status: 'success-from-db' });

    // Should NOT throw! Must fail open.
    const result = await redisCache.getOrSet('fail-open-key', fetcher, 60);
    expect(result).toEqual({ status: 'success-from-db' });
  });

  it('9. uses Redis cache when Redis is healthy and ready', async () => {
    const mockRedis: any = {
      status: 'ready',
      get: vi.fn().mockResolvedValue(JSON.stringify({ id: 'from-redis-cache' })),
      set: vi.fn().mockResolvedValue('OK'),
    };
    const mockRedisService: any = {
      isConfigured: () => true,
      isReady: () => true,
      getClient: () => mockRedis,
    };

    const redisCache = new CacheHelperService(mockRedisService);
    const fetcher = vi.fn().mockResolvedValue({ id: 'from-db' });

    const result = await redisCache.getOrSet('healthy-key', fetcher, 60);
    expect(result).toEqual({ id: 'from-redis-cache' });
    expect(mockRedis.get).toHaveBeenCalledWith('healthy-key');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('10. does not await Redis commands when RedisService reports not ready (reconnecting/connecting)', async () => {
    const mockRedis: any = {
      status: 'reconnecting',
      get: vi.fn().mockImplementation(() => new Promise(() => {})), // hangs forever if called
      set: vi.fn().mockImplementation(() => new Promise(() => {})),
    };
    const mockRedisService: any = {
      isConfigured: () => true,
      isReady: () => false,
      getClient: () => mockRedis,
    };

    const redisCache = new CacheHelperService(mockRedisService);
    const start = Date.now();
    const result = await redisCache.getOrSet('unready-key', async () => ({ id: 'fast-db-fallback' }), 60);
    const elapsed = Date.now() - start;

    expect(result).toEqual({ id: 'fast-db-fallback' });
    expect(elapsed).toBeLessThan(50);
    expect(mockRedis.get).not.toHaveBeenCalled();
  });

  it('11. bounds Redis GET timeout within REDIS_OP_TIMEOUT_MS and falls back to DB without throwing', async () => {
    const mockRedis: any = {
      status: 'ready',
      get: vi.fn().mockImplementation(
        () => new Promise((_, reject) => setTimeout(() => reject(new Error('Late rejection')), 5000)),
      ),
      set: vi.fn().mockResolvedValue('OK'),
    };
    const mockRedisService: any = {
      isConfigured: () => true,
      isReady: () => true,
      getClient: () => mockRedis,
    };

    const redisCache = new CacheHelperService(mockRedisService);
    const start = Date.now();
    const result = await redisCache.getOrSet('hanging-get-key', async () => ({ stepId: 'step-1' }), 60);
    const elapsed = Date.now() - start;

    expect(result).toEqual({ stepId: 'step-1' });
    expect(elapsed).toBeLessThan(CacheHelperService.REDIS_OP_TIMEOUT_MS + 150);
    expect(mockRedis.get).toHaveBeenCalledTimes(1);
  });

  it('12. bounds namespace version lookup timeout and falls back immediately on subsequent calls via circuit breaker', async () => {
    const mockRedis: any = {
      status: 'ready',
      get: vi.fn().mockImplementation(() => new Promise(() => {})), // never resolves
      set: vi.fn().mockResolvedValue('OK'),
    };
    const mockRedisService: any = {
      isConfigured: () => true,
      isReady: () => true,
      getClient: () => mockRedis,
    };

    const redisCache = new CacheHelperService(mockRedisService);

    // 1st call trips the circuit after ~250ms timeout
    const t0 = Date.now();
    const key1 = await redisCache.getEndpointKey('programs', 'USER', { stepId: 's1' });
    const d1 = Date.now() - t0;
    expect(key1).toContain(':ns:programs:v1:');
    expect(d1).toBeLessThan(CacheHelperService.REDIS_OP_TIMEOUT_MS + 150);
    expect(mockRedis.get).toHaveBeenCalledTimes(1);

    // 2nd call during circuit cooldown must NOT call Redis and completes in <20ms
    const t1 = Date.now();
    const key2 = await redisCache.getEndpointKey('DifferentNamespace', 'USER', { stepId: 's2' });
    const d2 = Date.now() - t1;
    expect(key2).toContain(':ns:DifferentNamespace:v1:');
    expect(d2).toBeLessThan(30);
    expect(mockRedis.get).toHaveBeenCalledTimes(1);
  });

  it('13. closes the circuit breaker and restores distributed caching after cooldown recovery probe succeeds', async () => {
    let shouldFail = true;
    const mockRedis: any = {
      status: 'ready',
      get: vi.fn().mockImplementation(async () => {
        if (shouldFail) {
          throw new Error('ERR max number of clients reached');
        }
        return JSON.stringify({ recovered: true });
      }),
      set: vi.fn().mockResolvedValue('OK'),
    };
    const mockRedisService: any = {
      isConfigured: () => true,
      isReady: () => true,
      getClient: () => mockRedis,
    };

    const redisCache = new CacheHelperService(mockRedisService);

    // 1. First request fails open and trips the circuit
    const first = await redisCache.getOrSet('k-1', async () => ({ recovered: false }), 60);
    expect(first).toEqual({ recovered: false });
    expect(mockRedis.get).toHaveBeenCalledTimes(1);

    // 2. While circuit is open, Redis is bypassed
    const second = await redisCache.getOrSet('k-2', async () => ({ bypassed: true }), 60);
    expect(second).toEqual({ bypassed: true });
    expect(mockRedis.get).toHaveBeenCalledTimes(1);

    // 3. Fast-forward circuit expiration and make Redis healthy again
    shouldFail = false;
    (redisCache as any).redisCircuitOpenUntil = Date.now() - 1;

    // 4. Recovery probe succeeds and closes the circuit
    const third = await redisCache.getOrSet('k-3', async () => ({ fromDb: true }), 60);
    expect(third).toEqual({ recovered: true });
    expect(mockRedis.get).toHaveBeenCalledTimes(2);
    expect((redisCache as any).redisCircuitWasOpen).toBe(false);
  });

  it('14. SET, DEL, and invalidation failures never throw or fail caller mutations', async () => {
    const mockRedis: any = {
      status: 'ready',
      get: vi.fn().mockRejectedValue(new Error('Redis down')),
      set: vi.fn().mockRejectedValue(new Error('Redis down')),
      del: vi.fn().mockRejectedValue(new Error('Redis down')),
      incr: vi.fn().mockRejectedValue(new Error('Redis down')),
    };
    const mockRedisService: any = {
      isConfigured: () => true,
      isReady: () => true,
      getClient: () => mockRedis,
    };

    const redisCache = new CacheHelperService(mockRedisService);

    await expect(redisCache.set('mut-key', { ok: 1 }, 60, ['programs'])).resolves.toBeUndefined();
    await expect(redisCache.invalidate('mut-key')).resolves.toBeUndefined();
    await expect(redisCache.invalidateTag('programs')).resolves.toBeGreaterThanOrEqual(0);
    await expect(redisCache.invalidateNamespace('programs')).resolves.toBeUndefined();
  });
});
