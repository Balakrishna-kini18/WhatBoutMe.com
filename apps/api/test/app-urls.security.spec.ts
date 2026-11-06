import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getAppUrls, isLocalHost, isLocalUrl } from '../src/common/config/app-urls';

describe('App URLs & Production Domain Security Spec', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('isLocalHost and isLocalUrl detection', () => {
    it('accurately identifies localhost, 127.0.0.1, and private IP subnets', () => {
      expect(isLocalHost('localhost')).toBe(true);
      expect(isLocalHost('sub.localhost')).toBe(true);
      expect(isLocalHost('127.0.0.1')).toBe(true);
      expect(isLocalHost('192.168.1.5')).toBe(true);
      expect(isLocalHost('10.0.0.1')).toBe(true);
      expect(isLocalHost('172.20.0.1')).toBe(true);

      expect(isLocalHost('whatboutme.com')).toBe(false);
      expect(isLocalHost('learn.whatboutme.com')).toBe(false);
      expect(isLocalHost('testfox.in')).toBe(false);
      expect(isLocalHost('lms-whatboutme.vercel.app')).toBe(false);
    });

    it('accurately checks URLs for local targets', () => {
      expect(isLocalUrl('http://localhost:3003/checkout/success')).toBe(true);
      expect(isLocalUrl('http://127.0.0.1:4000/api')).toBe(true);
      expect(isLocalUrl('http://192.168.1.100:3000')).toBe(true);

      expect(isLocalUrl('https://learn.whatboutme.com/checkout/success')).toBe(false);
      expect(isLocalUrl('https://admin.testfox.in')).toBe(false);
    });
  });

  describe('Local Development Mode', () => {
    it('returns local port defaults when running locally without explicit headers', () => {
      delete process.env.NODE_ENV;
      delete process.env.APP_ENV;
      process.env.NEXT_PUBLIC_LMS_URL = 'http://localhost:3003';
      process.env.NEXT_PUBLIC_ADMIN_URL = 'http://localhost:3002';
      process.env.NEXT_PUBLIC_MARKETING_URL = 'http://localhost:3000';

      const urls = getAppUrls();
      expect(urls.lmsUrl).toBe('http://localhost:3003');
      expect(urls.adminUrl).toBe('http://localhost:3002');
      expect(urls.marketingUrl).toBe('http://localhost:3000');
    });

    it('dynamically respects custom local port from client origin header', () => {
      delete process.env.NODE_ENV;
      const urls = getAppUrls('http://localhost:3004');
      // If LMS was booted on 3004 because 3003 was occupied
      expect(urls.lmsUrl).toBe('http://localhost:3004');
    });
  });

  describe('Production Environment Sanitization & Domain Routing', () => {
    it('strictly forbids localhost URLs in production even if leftover in .env', () => {
      process.env.NODE_ENV = 'production';
      process.env.ROOT_DOMAIN = 'whatboutme.com';
      // Simulating accidental leftover localhost in production environment
      process.env.NEXT_PUBLIC_LMS_URL = 'http://localhost:3003';
      process.env.NEXT_PUBLIC_ADMIN_URL = 'http://localhost:3002';
      process.env.NEXT_PUBLIC_MARKETING_URL = 'http://localhost:3000';

      const urls = getAppUrls();
      expect(urls.lmsUrl).toBe('https://learn.whatboutme.com');
      expect(urls.adminUrl).toBe('https://admin.whatboutme.com');
      expect(urls.marketingUrl).toBe('https://whatboutme.com');
      expect(urls.lmsUrl).not.toContain('localhost');
      expect(urls.adminUrl).not.toContain('localhost');
    });

    it('resolves live domain from incoming client request headers in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.ROOT_DOMAIN = 'whatboutme.com';

      const req = {
        headers: {
          origin: 'https://learn.whatboutme.com',
          'x-forwarded-host': 'learn.whatboutme.com',
          'x-forwarded-proto': 'https',
        },
      };

      const urls = getAppUrls(req);
      expect(urls.lmsUrl).toBe('https://learn.whatboutme.com');
      expect(urls.adminUrl).toBe('https://admin.whatboutme.com');
    });
  });

  describe('Staging & Vercel Preview Routing', () => {
    it('routes to testfox.in domains when APP_ENV is staging', () => {
      process.env.APP_ENV = 'staging';
      const urls = getAppUrls();
      expect(urls.lmsUrl).toBe('https://lms.testfox.in');
      expect(urls.adminUrl).toBe('https://admin.testfox.in');
      expect(urls.marketingUrl).toBe('https://marketing.testfox.in');
    });

    it('identifies Vercel preview environments correctly', () => {
      delete process.env.ROOT_DOMAIN;
      process.env.VERCEL = '1';
      process.env.VERCEL_URL = 'what-bout-me-com-lms.vercel.app';

      const urls = getAppUrls('https://what-bout-me-com-lms.vercel.app');
      expect(urls.lmsUrl).toBe('https://what-bout-me-com-lms.vercel.app');
      expect(urls.adminUrl).toBe('https://what-bout-me-com-admin.vercel.app');
    });
  });
});
