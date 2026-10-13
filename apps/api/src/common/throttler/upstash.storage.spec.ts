import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpstashThrottlerStorage } from './upstash.storage.js';

describe('UpstashThrottlerStorage - Brute Force & Redis Fallback Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it('falls back to in-memory storage when Redis is unconfigured and enforces limits', async () => {
    const storage = new UpstashThrottlerStorage();
    const limit = 5;
    const ttl = 60000;
    const blockDuration = 60000;
    const key = 'test-ip-unconfigured';

    // 5 attempts allowed
    for (let i = 1; i <= limit; i++) {
      const res = await storage.increment(key, ttl, limit, blockDuration, 'default');
      expect(res.isBlocked).toBe(false);
      expect(res.totalHits).toBe(i);
    }

    // 6th attempt MUST be blocked to prevent brute-force attacks
    const blockedRes = await storage.increment(key, ttl, limit, blockDuration, 'default');
    expect(blockedRes.isBlocked).toBe(true);
    expect(blockedRes.totalHits).toBeGreaterThan(limit);
  });

  it('handles concurrent requests under Redis failure without disabling rate limiting', async () => {
    const storage = new UpstashThrottlerStorage();
    // Simulate runtime failure by forcing redis to throw or be null
    (storage as any).redis = {
      pipeline: () => {
        throw new Error('Redis connection timed out (simulated network partition)');
      },
      get: async () => {
        throw new Error('Redis down');
      },
    };

    const limit = 5;
    const ttl = 60000;
    const blockDuration = 60000;
    const key = 'concurrent-attacker-ip';

    // Fire 10 concurrent credential attempts
    const promises = Array.from({ length: 10 }).map(() =>
      storage.increment(key, ttl, limit, blockDuration, 'default')
    );

    const results = await Promise.all(promises);

    // Verify at least some were blocked once limit exceeded
    const blockedCount = results.filter((r) => r.isBlocked).length;
    expect(blockedCount).toBeGreaterThan(0);

    // Any subsequent attempt must be blocked
    const subsequent = await storage.increment(key, ttl, limit, blockDuration, 'default');
    expect(subsequent.isBlocked).toBe(true);
  });
});
