import { describe, it, expect } from 'vitest';
import { isAllowedCorsOrigin, APPROVED_APPLICATION_ORIGINS } from './cors.config.js';

describe('CORS Origin Validation (isAllowedCorsOrigin)', () => {
  describe('Staging Environment (testfox.in)', () => {
    it('allows Admin frontend origin (https://admin.testfox.in)', () => {
      expect(isAllowedCorsOrigin('https://admin.testfox.in')).toBe(true);
    });

    it('allows LMS frontend origin (https://lms.testfox.in)', () => {
      expect(isAllowedCorsOrigin('https://lms.testfox.in')).toBe(true);
    });

    it('allows Marketing frontend origin (https://marketing.testfox.in)', () => {
      expect(isAllowedCorsOrigin('https://marketing.testfox.in')).toBe(true);
    });

    it('allows API origin (https://whatboutme.testfox.in)', () => {
      expect(isAllowedCorsOrigin('https://whatboutme.testfox.in')).toBe(true);
    });

    it('allows origins with trailing slashes safely', () => {
      expect(isAllowedCorsOrigin('https://admin.testfox.in/')).toBe(true);
      expect(isAllowedCorsOrigin('https://lms.testfox.in/')).toBe(true);
    });

    it('rejects unapproved subdomains under testfox.in', () => {
      expect(isAllowedCorsOrigin('https://evil.testfox.in')).toBe(false);
      expect(isAllowedCorsOrigin('https://attacker.testfox.in')).toBe(false);
      expect(isAllowedCorsOrigin('https://random.testfox.in')).toBe(false);
    });
  });

  describe('Production Environment (whatboutme.com)', () => {
    it('allows primary production domain (https://whatboutme.com)', () => {
      expect(isAllowedCorsOrigin('https://whatboutme.com')).toBe(true);
    });

    it('allows production admin frontend (https://admin.whatboutme.com)', () => {
      expect(isAllowedCorsOrigin('https://admin.whatboutme.com')).toBe(true);
    });

    it('allows production LMS frontend (https://lms.whatboutme.com)', () => {
      expect(isAllowedCorsOrigin('https://lms.whatboutme.com')).toBe(true);
    });

    it('allows production marketing frontend (https://marketing.whatboutme.com)', () => {
      expect(isAllowedCorsOrigin('https://marketing.whatboutme.com')).toBe(true);
    });

    it('allows production API domain (https://api.whatboutme.com)', () => {
      expect(isAllowedCorsOrigin('https://api.whatboutme.com')).toBe(true);
    });
  });

  describe('Unapproved & Malicious Origins', () => {
    it('rejects arbitrary untrusted origins', () => {
      expect(isAllowedCorsOrigin('https://attacker.com')).toBe(false);
      expect(isAllowedCorsOrigin('https://malicious.org')).toBe(false);
      expect(isAllowedCorsOrigin('https://whatboutme.com.attacker.com')).toBe(false);
      expect(isAllowedCorsOrigin('https://notwhatboutme.com')).toBe(false);
      expect(isAllowedCorsOrigin('https://nottestfox.in')).toBe(false);
    });
  });

  describe('Special Cases & Development', () => {
    it('allows requests with no origin (curl, mobile apps, server-to-server)', () => {
      expect(isAllowedCorsOrigin(undefined)).toBe(true);
      expect(isAllowedCorsOrigin('')).toBe(true);
    });

    it('allows localhost and 127.0.0.1 on any port', () => {
      expect(isAllowedCorsOrigin('http://localhost:3000')).toBe(true);
      expect(isAllowedCorsOrigin('http://localhost:3002')).toBe(true);
      expect(isAllowedCorsOrigin('http://localhost:3003')).toBe(true);
      expect(isAllowedCorsOrigin('http://localhost:4000')).toBe(true);
      expect(isAllowedCorsOrigin('http://127.0.0.1:3000')).toBe(true);
    });

    it('allows Vercel preview deployment URLs', () => {
      expect(isAllowedCorsOrigin('https://wbm-admin-preview.vercel.app')).toBe(true);
      expect(isAllowedCorsOrigin('https://my-pr-branch.vercel.app')).toBe(true);
    });

    it('honors custom allowedOrigins from CORS_ORIGIN env var', () => {
      const customOrigins = ['https://partner.example.com', 'https://*.trusted.net'];
      expect(isAllowedCorsOrigin('https://partner.example.com', customOrigins)).toBe(true);
      expect(isAllowedCorsOrigin('https://sub.trusted.net', customOrigins)).toBe(true);
      expect(isAllowedCorsOrigin('https://untrusted.net', customOrigins)).toBe(false);
    });

    it('honors custom ROOT_DOMAIN when specified', () => {
      expect(isAllowedCorsOrigin('https://sub.custombrand.io', [], 'custombrand.io')).toBe(true);
      expect(isAllowedCorsOrigin('https://other.io', [], 'custombrand.io')).toBe(false);
    });
  });
});
