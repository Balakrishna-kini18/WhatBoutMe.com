import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CacheHelperService } from './cache-helper.service.js';

describe('CacheHelperService (LRU + TTL + Tag-Based Invalidation)', () => {
  let cache: CacheHelperService;

  beforeEach(() => {
    // Ensure Redis is disabled in this test instance so we test high-performance local LRU
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
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
});
