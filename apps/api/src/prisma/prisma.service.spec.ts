import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildPooledDatabaseUrl, PrismaService, queryCount, resetQueryCount } from './prisma.service.js';

describe('PrismaService & Connection Pool Configuration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetQueryCount();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('buildPooledDatabaseUrl Edge Cases', () => {
    it('returns undefined or empty string as-is', () => {
      expect(buildPooledDatabaseUrl(undefined)).toBeUndefined();
      expect(buildPooledDatabaseUrl('')).toBe('');
    });

    it('returns non-postgres URLs untouched', () => {
      expect(buildPooledDatabaseUrl('sqlite://test.db')).toBe('sqlite://test.db');
      expect(buildPooledDatabaseUrl('mysql://root:pass@localhost:3306/db')).toBe('mysql://root:pass@localhost:3306/db');
    });

    it('gracefully returns malformed URLs untouched without throwing', () => {
      expect(buildPooledDatabaseUrl('not a valid url')).toBe('not a valid url');
    });

    it('appends free-tier pool defaults to postgres URLs in dev mode', () => {
      delete process.env.NODE_ENV;
      const raw = 'postgresql://user:pass@ep-cool-db.us-east-2.aws.neon.tech/neondb?sslmode=require';
      const pooled = buildPooledDatabaseUrl(raw);

      expect(pooled).toBeDefined();
      const parsed = new URL(pooled!);
      expect(parsed.searchParams.get('connection_limit')).toBe('5');
      expect(parsed.searchParams.get('connect_timeout')).toBe('15');
      expect(parsed.searchParams.get('pool_timeout')).toBe('10');
      expect(parsed.searchParams.has('pgbouncer')).toBe(false);
    });

    it('uses production connection limit (10) when NODE_ENV is production', () => {
      process.env.NODE_ENV = 'production';
      const raw = 'postgresql://user:pass@ep-cool-db.us-east-2.aws.neon.tech/neondb';
      const pooled = buildPooledDatabaseUrl(raw);

      const parsed = new URL(pooled!);
      expect(parsed.searchParams.get('connection_limit')).toBe('10');
    });

    it('respects custom environment variable overrides (DB_POOL_MAX, etc.)', () => {
      process.env.DB_POOL_MAX = '8';
      process.env.DB_CONNECT_TIMEOUT = '25';
      process.env.DB_POOL_TIMEOUT = '12';

      const raw = 'postgresql://user:pass@localhost:5432/testdb';
      const pooled = buildPooledDatabaseUrl(raw);

      const parsed = new URL(pooled!);
      expect(parsed.searchParams.get('connection_limit')).toBe('8');
      expect(parsed.searchParams.get('connect_timeout')).toBe('25');
      expect(parsed.searchParams.get('pool_timeout')).toBe('12');
    });

    it('does not overwrite existing query parameters set by developer', () => {
      const raw = 'postgresql://user:pass@localhost:5432/testdb?connection_limit=3&connect_timeout=30&pool_timeout=5';
      const pooled = buildPooledDatabaseUrl(raw);

      const parsed = new URL(pooled!);
      expect(parsed.searchParams.get('connection_limit')).toBe('3');
      expect(parsed.searchParams.get('connect_timeout')).toBe('30');
      expect(parsed.searchParams.get('pool_timeout')).toBe('5');
    });

    it('detects pooled hostnames (-pooler) and automatically adds pgbouncer=true', () => {
      const raw = 'postgresql://user:pass@ep-cool-db-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require';
      const pooled = buildPooledDatabaseUrl(raw);

      const parsed = new URL(pooled!);
      expect(parsed.searchParams.get('pgbouncer')).toBe('true');
    });

    it('detects Supabase transaction pooler port 6543 and adds pgbouncer=true', () => {
      const raw = 'postgresql://postgres.project:pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres';
      const pooled = buildPooledDatabaseUrl(raw);

      const parsed = new URL(pooled!);
      expect(parsed.searchParams.get('pgbouncer')).toBe('true');
    });

    it('enables pgbouncer=true if DB_PGBOUNCER is set to true', () => {
      process.env.DB_PGBOUNCER = 'true';
      const raw = 'postgresql://user:pass@custom-host.com:5432/db';
      const pooled = buildPooledDatabaseUrl(raw);

      const parsed = new URL(pooled!);
      expect(parsed.searchParams.get('pgbouncer')).toBe('true');
    });
  });

  describe('Global Singleton & Query Counting', () => {
    it('returns existing global instance when globalThis.__prismaServiceInstance is set', () => {
      const fakeInstance = { isMock: true } as any;
      globalThis.__prismaServiceInstance = fakeInstance;

      const instance = new PrismaService();
      expect(instance).toBe(fakeInstance);

      // Clean up
      globalThis.__prismaServiceInstance = undefined;
    });

    it('tracks and resets queryCount properly', () => {
      expect(queryCount).toBe(0);
      resetQueryCount();
      expect(queryCount).toBe(0);
    });
  });
});
