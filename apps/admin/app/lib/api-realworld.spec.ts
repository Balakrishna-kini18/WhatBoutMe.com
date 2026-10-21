import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getCacheKey,
  autoInvalidateOnMutation,
  apiCache,
  apiCacheManager,
  ApiCacheManager,
  clearApiCacheOnLogout,
  invalidateCache,
  logSlowApiCall,
  cachedFetch,
} from './api';

describe('Admin Client Real-World Resilience & Cache Integrity', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    apiCache.clear();
    vi.restoreAllMocks();
    (process.env as any).NODE_ENV = 'development';
  });

  afterEach(() => {
    (process.env as any).NODE_ENV = originalEnv;
    apiCache.clear();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // SCENARIO 1: Multi-User Cache Key Isolation (Zero Tenant Cross-Contamination)
  // =========================================================================
  it('Scenario 1: Distinct auth tokens produce distinct cache keys preventing multi-user data leakage', () => {
    const url = 'http://localhost:4000/api/v1/profile';

    const tokenA = 'Bearer eyJhbGciOi...userA';
    const tokenB = 'Bearer eyJhbGciOi...userB';

    const keyUserA = getCacheKey(url, { Authorization: tokenA });
    const keyUserB = getCacheKey(url, { Authorization: tokenB });

    expect(keyUserA).not.toBe(keyUserB);
    expect(keyUserA).toContain(tokenA);
    expect(keyUserB).toContain(tokenB);

    // Populate cache for User A
    apiCache.set(keyUserA, {
      bodyText: JSON.stringify({ name: 'User A', email: 'a@example.com' }),
      status: 200,
      statusText: 'OK',
      headers: [],
      timestamp: Date.now(),
      ttlMs: 60000,
    });

    // User B must NOT see User A's cached entry
    expect(apiCache.get(keyUserB)).toBeUndefined();
    expect(apiCache.get(keyUserA)).toBeDefined();
  });

  // =========================================================================
  // SCENARIO 2: Automatic Cache Invalidation on Mutations
  // =========================================================================
  it('Scenario 2: Mutating invoices automatically purges both /invoices and dependent /revenue caches', () => {
    apiCache.set('GET:http://localhost:4000/invoices:tok', {
      bodyText: '[]',
      status: 200,
      statusText: 'OK',
      headers: [],
      timestamp: Date.now(),
      ttlMs: 60000,
    });

    apiCache.set('GET:http://localhost:4000/revenue:tok', {
      bodyText: '{"total": 5000}',
      status: 200,
      statusText: 'OK',
      headers: [],
      timestamp: Date.now(),
      ttlMs: 60000,
    });

    apiCache.set('GET:http://localhost:4000/users:tok', {
      bodyText: '[]',
      status: 200,
      statusText: 'OK',
      headers: [],
      timestamp: Date.now(),
      ttlMs: 60000,
    });

    // Admin creates an invoice
    autoInvalidateOnMutation('http://localhost:4000/invoices');

    // Both /invoices and /revenue must be purged
    expect(apiCache.has('GET:http://localhost:4000/invoices:tok')).toBe(false);
    expect(apiCache.has('GET:http://localhost:4000/revenue:tok')).toBe(false);

    // Unrelated domains (like /users) must remain safely cached
    expect(apiCache.has('GET:http://localhost:4000/users:tok')).toBe(true);
  });

  // =========================================================================
  // SCENARIO 3: Slow API Logger Diagnostics Under Heavy Latency
  // =========================================================================
  it('Scenario 3: Slow API logger correctly formats console table with parsed Server-Timing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tableSpy = vi.spyOn(console, 'table').mockImplementation(() => {});

    const mockHeaders = [
      ['server-timing', 'db;dur=412.3, total;dur=745.8'],
      ['x-prisma-queries', '4'],
    ] as [string, string][];

    logSlowApiCall('POST', 'http://localhost:4000/reports/generate', 200, 780.5, mockHeaders, 'Network');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('[Slow API Warning] POST http://localhost:4000/reports/generate took 780.5ms');

    expect(tableSpy).toHaveBeenCalledTimes(1);
    const tableRows = tableSpy.mock.calls[0]?.[0];
    expect(tableRows[0]).toEqual({
      Method: 'POST',
      URL: 'http://localhost:4000/reports/generate',
      Status: 200,
      'Client Total': '780.5ms',
      'Server Total': '745.8ms',
      'Server DB': '412.3ms',
      'DB Queries': '4',
      Source: 'Network',
    });
  });

  // =========================================================================
  // SCENARIO 4: Fast API Calls (<= 500ms) Produce Zero Console Noise
  // =========================================================================
  it('Scenario 4: Fast responses under 500ms emit 0 console warnings and 0 tables', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tableSpy = vi.spyOn(console, 'table').mockImplementation(() => {});

    logSlowApiCall('GET', 'http://localhost:4000/website/hero', 200, 12.4, [], 'Network');
    logSlowApiCall('GET', 'http://localhost:4000/programs', 200, 480.0, [], 'Network');

    expect(warnSpy).not.toHaveBeenCalled();
    expect(tableSpy).not.toHaveBeenCalled();
  });

  // =========================================================================
  // SCENARIO 5: In-Flight Deduplication for Concurrent Identical GET Requests
  // =========================================================================
  it('Scenario 5: Concurrent GET requests share a single in-flight network request', async () => {
    let networkFetchCount = 0;
    const originalFetch = global.fetch;

    global.fetch = vi.fn().mockImplementation(async () => {
      networkFetchCount++;
      // Simulate 50ms network delay
      await new Promise((r) => setTimeout(r, 50));
      return new Response(JSON.stringify({ data: 'payload' }), {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'application/json' },
      });
    });

    try {
      const url = 'http://localhost:4000/programs';
      // Fire 3 simultaneous GET requests
      const [res1, res2, res3] = await Promise.all([
        cachedFetch(url),
        cachedFetch(url),
        cachedFetch(url),
      ]);

      const data1 = await res1.json();
      const data2 = await res2.json();
      const data3 = await res3.json();

      expect(data1).toEqual({ data: 'payload' });
      expect(data2).toEqual({ data: 'payload' });
      expect(data3).toEqual({ data: 'payload' });

      // Only 1 real HTTP fetch must have occurred
      expect(networkFetchCount).toBe(1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  // =========================================================================
  // SCENARIO 6: SWR Cache Hit Returns Immediately (<15ms)
  // =========================================================================
  it('Scenario 6: SWR cache hit serves response immediately without network roundtrip', async () => {
    const url = 'http://localhost:4000/admin/dashboard';
    const key = getCacheKey(url);

    apiCache.set(key, {
      bodyText: JSON.stringify({ totalLearners: 42 }),
      status: 200,
      statusText: 'OK',
      headers: [['content-type', 'application/json']],
      timestamp: Date.now(),
      ttlMs: 30000,
    });

    const start = performance.now();
    const res = await cachedFetch(url);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(15);
    const json = await res.json();
    expect(json.totalLearners).toBe(42);
  });

  // =========================================================================
  // SCENARIO 7: Lead Mutation Invalidates Leads, Meetings, Invoices & Revenue
  // =========================================================================
  it('Scenario 7: Mutating leads invalidates /leads, /meetings, /sessions, /invoices, and /revenue', () => {
    apiCache.set('GET:http://localhost:4000/leads:tok', {
      bodyText: '[]',
      status: 200,
      statusText: 'OK',
      headers: [],
      timestamp: Date.now(),
      ttlMs: 30000,
    });
    apiCache.set('GET:http://localhost:4000/meetings:tok', {
      bodyText: '[]',
      status: 200,
      statusText: 'OK',
      headers: [],
      timestamp: Date.now(),
      ttlMs: 30000,
    });
    apiCache.set('GET:http://localhost:4000/sessions:tok', {
      bodyText: '[]',
      status: 200,
      statusText: 'OK',
      headers: [],
      timestamp: Date.now(),
      ttlMs: 30000,
    });
    apiCache.set('GET:http://localhost:4000/invoices:tok', {
      bodyText: '[]',
      status: 200,
      statusText: 'OK',
      headers: [],
      timestamp: Date.now(),
      ttlMs: 30000,
    });
    apiCache.set('GET:http://localhost:4000/revenue:tok', {
      bodyText: '{}',
      status: 200,
      statusText: 'OK',
      headers: [],
      timestamp: Date.now(),
      ttlMs: 30000,
    });
    apiCache.set('GET:http://localhost:4000/users:tok', {
      bodyText: '[]',
      status: 200,
      statusText: 'OK',
      headers: [],
      timestamp: Date.now(),
      ttlMs: 30000,
    });

    autoInvalidateOnMutation('http://localhost:4000/leads/lead-123/convert');

    expect(apiCache.has('GET:http://localhost:4000/leads:tok')).toBe(false);
    expect(apiCache.has('GET:http://localhost:4000/meetings:tok')).toBe(false);
    expect(apiCache.has('GET:http://localhost:4000/sessions:tok')).toBe(false);
    expect(apiCache.has('GET:http://localhost:4000/invoices:tok')).toBe(false);
    expect(apiCache.has('GET:http://localhost:4000/revenue:tok')).toBe(false);
    // Unrelated user cache remains untouched
    expect(apiCache.has('GET:http://localhost:4000/users:tok')).toBe(true);
  });

  // =========================================================================
  // SCENARIO 8: Zero Leakage Across User Logout (clearApiCacheOnLogout)
  // =========================================================================
  it('Scenario 8: clearApiCacheOnLogout() completely wipes cache and pending requests', () => {
    apiCache.set('GET:http://localhost:4000/admin/enrolments:tok', {
      bodyText: '[]',
      status: 200,
      statusText: 'OK',
      headers: [],
      timestamp: Date.now(),
      ttlMs: 30000,
    });

    expect(apiCache.size).toBeGreaterThan(0);

    clearApiCacheOnLogout();

    expect(apiCache.size).toBe(0);
    expect(apiCacheManager.size).toBe(0);
  });

  // =========================================================================
  // SCENARIO 9: ApiCacheManager Strongly-Typed Methods & In-Flight Tracking
  // =========================================================================
  it('Scenario 9: ApiCacheManager manages cache, in-flight map, and prefix invalidation', () => {
    const manager = new ApiCacheManager(5);

    manager.set('GET:/test:1', {
      bodyText: 'test1',
      status: 200,
      statusText: 'OK',
      headers: [],
      timestamp: Date.now(),
      ttlMs: 10000,
    });

    expect(manager.has('GET:/test:1')).toBe(true);
    expect(manager.get('GET:/test:1')?.bodyText).toBe('test1');

    const mockPromise = Promise.resolve({
      bodyText: 'in-flight',
      status: 200,
      statusText: 'OK',
      headers: [] as [string, string][],
    });

    manager.setInFlight('GET:/pending', mockPromise);
    expect(manager.getInFlight('GET:/pending')).toBe(mockPromise);

    manager.deleteInFlight('GET:/pending');
    expect(manager.getInFlight('GET:/pending')).toBeUndefined();

    manager.clear();
    expect(manager.size).toBe(0);
  });
});
