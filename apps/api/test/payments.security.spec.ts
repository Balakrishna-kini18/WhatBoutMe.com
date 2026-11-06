import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { PaymentsController } from '../src/modules/payments/payments.controller.js';
import { PaymentsService } from '../src/modules/payments/payments.service.js';
import { StripePaymentProvider } from '../src/modules/payments/providers/stripe.provider.js';

describe('Payment Gateway P0/P1 Security Specification Suite', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Webhook Test Simulator Security (Finding 1)
  // =========================================================================
  describe('Finding 1: Test-Simulate Webhook Authentication & Token Tampering', () => {
    let controller: PaymentsController;
    let paymentsServiceMock: any;

    beforeEach(() => {
      paymentsServiceMock = {
        simulateTestWebhook: vi.fn().mockResolvedValue({ success: true, status: 'PAID' }),
        handleStripeWebhook: vi.fn(),
      };
      controller = new PaymentsController(paymentsServiceMock);
    });

    it('rejects forged unverified JWT token claiming SUPER_ADMIN in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.PAYMENT_PROVIDER = 'STRIPE';

      // Forged JWT with unsigned base64 payload { role: 'SUPER_ADMIN' }
      const forgedPayload = Buffer.from(JSON.stringify({ role: 'SUPER_ADMIN', sub: 'hacker-1' })).toString('base64');
      const forgedHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
      const forgedBearer = `Bearer ${forgedHeader}.${forgedPayload}.invalidsignature123`;

      const mockReq = {
        headers: { authorization: forgedBearer },
        user: undefined, // No authenticated user attached by JwtAuthGuard
      };

      await expect(
        Promise.resolve().then(() =>
          controller.simulateTestWebhook(
            {
              targetType: 'ENROLMENT',
              targetId: 'enrol-123',
              status: 'PAID',
              amount: 500,
              currency: 'USD',
            } as any,
            mockReq,
          ),
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(paymentsServiceMock.simulateTestWebhook).not.toHaveBeenCalled();
    });

    it('rejects unauthenticated requests in production even if body claims admin', async () => {
      process.env.NODE_ENV = 'production';
      process.env.PAYMENT_PROVIDER = 'STRIPE';

      const mockReq = {
        headers: {},
        user: undefined,
      };

      await expect(
        Promise.resolve().then(() =>
          controller.simulateTestWebhook(
            {
              targetType: 'ENROLMENT',
              targetId: 'enrol-123',
              status: 'PAID',
              amount: 500,
              currency: 'USD',
            } as any,
            mockReq,
          ),
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // 2. Webhook Signature Verification Hardening (Finding 2)
  // =========================================================================
  describe('Finding 2: Raw Buffer Webhook Signature Verification', () => {
    let stripeProvider: StripePaymentProvider;

    beforeEach(() => {
      stripeProvider = new StripePaymentProvider();
    });

    it('fails closed when rawPayload is an already parsed Object instead of Buffer or string', async () => {
      process.env.NODE_ENV = 'production';
      process.env.STRIPE_SECRET_KEY = 'sk_test_fake_valid_length_key_1234567890';
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_valid_test_secret_1234567890';

      const parsedObjectPayload = {
        id: 'evt_test_tampered',
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_test_tampered', amount_total: 90000, currency: 'usd' } },
      };

      // If rawPayload is a plain object, verifyWebhook must NOT bypass signature check
      const result = await stripeProvider.verifyWebhook({
        rawPayload: parsedObjectPayload as any,
        signature: 't=12345,v1=fakesig',
      });

      expect(result.isVerified).toBe(false);
      expect(result.status).toBe('FAILED');
    });

    it('fails closed when STRIPE_WEBHOOK_SECRET is missing in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.STRIPE_SECRET_KEY = 'sk_test_fake_valid_length_key_1234567890';
      delete process.env.STRIPE_WEBHOOK_SECRET;

      const rawBuffer = Buffer.from(JSON.stringify({ id: 'evt_1' }), 'utf8');

      const result = await stripeProvider.verifyWebhook({
        rawPayload: rawBuffer,
        signature: 't=12345,v1=fakesig',
      });

      expect(result.isVerified).toBe(false);
      expect(result.status).toBe('FAILED');
    });
  });
});
