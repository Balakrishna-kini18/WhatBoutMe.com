import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getAppUrls, isLocalHost, isLocalUrl } from '../src/common/config/app-urls';

describe('Completely Dynamic & Domain-Agnostic URL Spec', () => {
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

      expect(isLocalHost('arbitrarydomain.org')).toBe(false);
      expect(isLocalHost('learn.mybrand.co.uk')).toBe(false);
      expect(isLocalHost('newdomain.ae')).toBe(false);
      expect(isLocalHost('preview-123.vercel.app')).toBe(false);
    });

    it('accurately checks URLs for local targets', () => {
      expect(isLocalUrl('http://localhost:3003/checkout/success')).toBe(true);
      expect(isLocalUrl('http://127.0.0.1:4000/api')).toBe(true);
      expect(isLocalUrl('http://192.168.1.100:3000')).toBe(true);

      expect(isLocalUrl('https://learn.anycompany.com/checkout/success')).toBe(false);
      expect(isLocalUrl('https://admin.futurebrand.ae')).toBe(false);
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

  describe('Arbitrary Production Domain Dynamic Discovery (Zero Hardcoded Domains)', () => {
    it('automatically discovers and synthesizes subdomains when domain changes to futurebrand.ae', () => {
      delete process.env.ROOT_DOMAIN;
      const req = {
        headers: {
          origin: 'https://learn.futurebrand.ae',
          'x-forwarded-host': 'learn.futurebrand.ae',
          'x-forwarded-proto': 'https',
        },
      };

      const urls = getAppUrls(req);
      expect(urls.lmsUrl).toBe('https://learn.futurebrand.ae');
      expect(urls.adminUrl).toBe('https://admin.futurebrand.ae');
      expect(urls.marketingUrl).toBe('https://futurebrand.ae');
      expect(urls.apiUrl).toBe('https://api.futurebrand.ae');
    });

    it('automatically discovers and synthesizes subdomains for multi-level TLDs (e.g. company.co.uk)', () => {
      delete process.env.ROOT_DOMAIN;
      const req = {
        headers: {
          origin: 'https://admin.company.co.uk',
          'x-forwarded-host': 'admin.company.co.uk',
          'x-forwarded-proto': 'https',
        },
      };

      const urls = getAppUrls(req);
      expect(urls.adminUrl).toBe('https://admin.company.co.uk');
      expect(urls.lmsUrl).toBe('https://learn.company.co.uk');
      expect(urls.marketingUrl).toBe('https://company.co.uk');
    });

    it('strictly forbids localhost URLs in live environments even if leftover in .env', () => {
      process.env.NODE_ENV = 'production';
      process.env.ROOT_DOMAIN = 'newrebrand.io';
      // Leftover localhost in production env
      process.env.NEXT_PUBLIC_LMS_URL = 'http://localhost:3003';
      process.env.NEXT_PUBLIC_ADMIN_URL = 'http://localhost:3002';
      process.env.NEXT_PUBLIC_MARKETING_URL = 'http://localhost:3000';

      const urls = getAppUrls();
      expect(urls.lmsUrl).toBe('https://learn.newrebrand.io');
      expect(urls.adminUrl).toBe('https://admin.newrebrand.io');
      expect(urls.marketingUrl).toBe('https://newrebrand.io');
      expect(urls.lmsUrl).not.toContain('localhost');
      expect(urls.adminUrl).not.toContain('localhost');
    });

    it('dynamically routes arbitrary preview deployments on Vercel without code edits', () => {
      delete process.env.ROOT_DOMAIN;
      const previewOrigin = 'https://branch-fix-123.vercel.app';
      const urls = getAppUrls(previewOrigin);
      expect(urls.lmsUrl).toBe('https://branch-fix-123.vercel.app');
      expect(urls.adminUrl).toBe('https://branch-fix-123.vercel.app');
    });
  });
});
