import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isAllowedCorsOrigin } from '../src/common/config/cors.config';

describe('Dynamic CORS Validator Security Spec', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('permits requests with no origin (mobile apps, server-to-server, curl, Postman)', () => {
    expect(isAllowedCorsOrigin(undefined)).toBe(true);
    expect(isAllowedCorsOrigin('')).toBe(true);
  });

  it('dynamically permits any Vercel deployment without hardcoding (including lms-whatboutme.vercel.app)', () => {
    // The exact origin from the user's screenshot
    expect(isAllowedCorsOrigin('https://lms-whatboutme.vercel.app')).toBe(true);
    expect(isAllowedCorsOrigin('https://admin-whataboutme.vercel.app')).toBe(true);
    expect(isAllowedCorsOrigin('https://what-bout-me-com-backend.vercel.app')).toBe(true);
    expect(isAllowedCorsOrigin('https://preview-feat-branch-123.vercel.app')).toBe(true);
  });

  it('dynamically permits localhost and 127.0.0.1 on any port', () => {
    expect(isAllowedCorsOrigin('http://localhost:3000')).toBe(true);
    expect(isAllowedCorsOrigin('http://localhost:3002')).toBe(true);
    expect(isAllowedCorsOrigin('http://localhost:3003')).toBe(true);
    expect(isAllowedCorsOrigin('http://localhost:4000')).toBe(true);
    expect(isAllowedCorsOrigin('http://127.0.0.1:3003')).toBe(true);
  });

  it('dynamically permits apex and all subdomains of any configured ROOT_DOMAIN', () => {
    expect(isAllowedCorsOrigin('https://newbrand.ae', [], 'newbrand.ae')).toBe(true);
    expect(isAllowedCorsOrigin('https://learn.newbrand.ae', [], 'newbrand.ae')).toBe(true);
    expect(isAllowedCorsOrigin('https://admin.newbrand.ae', [], 'newbrand.ae')).toBe(true);
    expect(isAllowedCorsOrigin('https://api.newbrand.ae', [], 'newbrand.ae')).toBe(true);
  });

  it('blocks untrusted third-party origins', () => {
    expect(isAllowedCorsOrigin('https://evil-phishing-site.com', [], 'whatboutme.com')).toBe(false);
    expect(isAllowedCorsOrigin('https://malicious.org', [], 'whatboutme.com')).toBe(false);
  });

  it('permits explicit CORS_ORIGIN wildcards and entries', () => {
    expect(isAllowedCorsOrigin('https://portal.partner.org', ['https://*.partner.org'])).toBe(true);
    expect(isAllowedCorsOrigin('https://random.com', ['*'])).toBe(true);
  });
});

