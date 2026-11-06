import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { BadRequestException, ForbiddenException, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
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

  // =========================================================================
  // 3. Seat Pool Self-Activation Guard (Finding 4)
  // =========================================================================
  describe('Finding 4: Seat Pool Direct Payment Authorization', () => {
    let controller: any;
    let seatPoolsServiceMock: any;

    beforeEach(async () => {
      seatPoolsServiceMock = {
        markPaid: vi.fn(),
        requestOfflineInvoice: vi.fn().mockResolvedValue({ status: 'INVOICE_ISSUED' }),
      };

      const { AdminOrganizationsController } = await import(
        '../src/modules/organizations/admin-organizations.controller.js'
      );
      controller = new AdminOrganizationsController(
        {} as any,
        seatPoolsServiceMock,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );
    });

    it('rejects online self-activation on paySeatPool endpoint', async () => {
      const mockReq = { user: { id: 'org-user-1', role: 'USER' } };

      await expect(
        controller.paySeatPool('org-1', 'pool-1', { paymentMethod: 'ONLINE' }, mockReq),
      ).rejects.toThrow(BadRequestException);

      expect(seatPoolsServiceMock.markPaid).not.toHaveBeenCalled();
    });

    it('routes INVOICE_OFFLINE through requestOfflineInvoice without activating seats', async () => {
      const mockReq = { user: { id: 'org-user-1', role: 'USER' } };

      const res = await controller.paySeatPool(
        'org-1',
        'pool-1',
        { paymentMethod: 'INVOICE_OFFLINE', notes: 'Net 30' },
        mockReq,
      );

      expect(res.status).toBe('INVOICE_ISSUED');
      expect(seatPoolsServiceMock.requestOfflineInvoice).toHaveBeenCalledWith('pool-1', mockReq.user, 'Net 30');
      expect(seatPoolsServiceMock.markPaid).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 4. Public Event Payment Verification Spoofing Guard (Finding 5)
  // =========================================================================
  describe('Finding 5: Event Payment Verification Spoofing Guard', () => {
    let eventsService: any;
    let prismaMock: any;

    beforeEach(async () => {
      prismaMock = {
        eventRegistration: {
          findUnique: vi.fn(),
          findFirst: vi.fn(),
          update: vi.fn(),
        },
        event: {
          findUnique: vi.fn(),
          update: vi.fn(),
        },
        $transaction: vi.fn().mockImplementation((cb) => cb(prismaMock)),
      };

      const { EventsService } = await import('../src/modules/events/events.service.js');
      eventsService = new EventsService(
        prismaMock,
        {} as any,
        {} as any,
      );
    });

    it('rejects verification of paid event with missing or fake non-cs_ gatewayOrderId in live Stripe mode', async () => {
      process.env.PAYMENT_PROVIDER = 'STRIPE';
      process.env.STRIPE_SECRET_KEY = 'sk_test_12345678901234567890';

      prismaMock.eventRegistration.findUnique.mockResolvedValue({
        id: 'reg-paid-1',
        eventId: 'evt-paid-1',
        amount: 100, // Paid event ($100)
        currency: 'USD',
        paymentStatus: 'PENDING',
        event: { id: 'evt-paid-1', price: 100, seatsBooked: 5, seatLimit: 50 },
      });

      await expect(
        eventsService.verifyPayment({
          registrationId: 'reg-paid-1',
          gatewayOrderId: 'fake_non_cs_id_123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects simulated verification of paid event when PAYMENT_PROVIDER is STRIPE', async () => {
      process.env.PAYMENT_PROVIDER = 'STRIPE';
      process.env.STRIPE_SECRET_KEY = 'sk_test_12345678901234567890';

      prismaMock.eventRegistration.findUnique.mockResolvedValue({
        id: 'reg-paid-1',
        eventId: 'evt-paid-1',
        amount: 100,
        currency: 'USD',
        paymentStatus: 'PENDING',
        event: { id: 'evt-paid-1', price: 100, seatsBooked: 5, seatLimit: 50 },
      });

      await expect(
        eventsService.verifyPayment({
          registrationId: 'reg-paid-1',
          isSimulated: true,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // 5. Fail-Closed Stripe Provider on Missing SDK / Key (Finding 6)
  // =========================================================================
  describe('Finding 6: Fail-Closed Stripe Provider on Missing SDK / Key', () => {
    it('throws ServiceUnavailableException on createOrder when Stripe is not initialized', async () => {
      delete process.env.STRIPE_SECRET_KEY;
      const provider = new StripePaymentProvider();

      await expect(
        provider.createOrder({
          amount: 100,
          currency: 'USD',
          targetType: 'ENROLMENT',
          targetId: 'prog-1',
        }),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  // =========================================================================
  // 6. Lead Payment Link Security (Finding 7)
  // =========================================================================
  describe('Finding 7: Lead Payment Link Security (Pay-First Magic Link)', () => {
    let leadsController: any;
    let prismaMock: any;

    beforeEach(async () => {
      prismaMock = {
        leadCheckoutLink: {
          findUnique: vi.fn(),
          create: vi.fn(),
        },
        lead: {
          findUnique: vi.fn(),
        },
        program: {
          findUnique: vi.fn(),
        },
        batch: {
          findUnique: vi.fn(),
        },
        enrolment: {
          findUnique: vi.fn(),
        },
      };

      const { LeadsController } = await import('../src/modules/website/leads.controller.js');
      leadsController = new LeadsController(
        prismaMock,
        {} as any,
        {} as any,
        {} as any,
      );
    });

    it('returns sanitized display data and masked email with ZERO accessToken or session token', async () => {
      const crypto = await import('crypto');
      const rawToken = 'test_token_12345678901234567890123456789012';
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      prismaMock.leadCheckoutLink.findUnique.mockResolvedValue({
        id: 'link-1',
        tokenHash,
        leadId: 'lead-1',
        userId: 'user-1',
        enrolmentId: 'enrol-1',
        programId: 'prog-1',
        batchId: 'batch-1',
        expiresAt: new Date(Date.now() + 3600 * 1000),
        usedAt: null,
        revokedAt: null,
      });

      prismaMock.lead.findUnique.mockResolvedValue({
        id: 'lead-1',
        name: 'Jane Doe',
        email: 'janedoe@example.com',
      });

      prismaMock.program.findUnique.mockResolvedValue({
        id: 'prog-1',
        title: 'Lead Course',
        price: 900,
        currency: 'USD',
      });

      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'batch-1',
        name: 'Cohort Alpha',
      });

      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        status: 'PENDING_PAYMENT',
      });

      const result = await leadsController.getCheckoutTokenDetails(rawToken);

      expect(result.valid).toBe(true);
      expect(result.candidateName).toBe('Jane Doe');
      expect(result.maskedEmail).toBe('j***e@example.com');
      expect(result.accessToken).toBeUndefined();
      expect((result as any).user).toBeUndefined();
      expect(result.pricing.amount).toBe(900);
    });

    it('rejects already used lead checkout link with BadRequestException', async () => {
      prismaMock.leadCheckoutLink.findUnique.mockResolvedValue({
        id: 'link-1',
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600 * 1000),
      });

      await expect(
        leadsController.getCheckoutTokenDetails('some_token_hash'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
