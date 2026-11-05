import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { BadRequestException, HttpException } from '@nestjs/common';
import { PaymentsService } from '../src/modules/payments/payments.service.js';
import { PaymentWebhookController } from '../src/modules/enrollments/payment.webhook.controller.js';
import { RevenueController } from '../src/modules/revenue/revenue.controller.js';
import { EnrolmentStatus, Role } from '@prisma/client';
import Stripe from 'stripe';

describe('Stripe Payment Gateway & Security Hardening Specs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // SUITE 1: Tier 1 Duplicate Course Payment Prevention (Pre-flight Guard)
  // =========================================================================
  describe('Tier 1: Duplicate Payment Prevention for Same Course', () => {
    let paymentsService: PaymentsService;
    let prismaMock: any;
    let stripeProviderMock: any;

    beforeEach(() => {
      prismaMock = {
        program: {
          findUnique: vi.fn(),
        },
        enrolment: {
          findUnique: vi.fn(),
          findFirst: vi.fn(),
        },
        payment: {
          findFirst: vi.fn(),
          create: vi.fn().mockResolvedValue({ id: 'pay-1' }),
        },
      };

      stripeProviderMock = {
        name: 'STRIPE',
        createOrder: vi.fn(),
        expireSession: vi.fn().mockResolvedValue(true),
        retrieveSession: vi.fn(),
        refundPayment: vi.fn(),
      };

      // PaymentsService constructor:
      // (prisma, mockProvider, razorpayProvider, stripeProvider, invoicePdfService, cacheHelper, emailService, couponsService)
      paymentsService = new PaymentsService(
        prismaMock,
        {} as any,
        {} as any,
        stripeProviderMock,
        {} as any,
      );
    });

    it('Scenario 1A: Blocks checkout when learner already has ACTIVE enrolment with successful payment', async () => {
      const mockProgram = {
        id: 'prog-100',
        title: 'Mastering Agentic Workflows',
        price: 500,
        currency: 'USD',
      };

      prismaMock.program.findUnique.mockResolvedValue(mockProgram);
      prismaMock.enrolment.findUnique.mockResolvedValue(null);

      // Existing active enrolment with paid payment record
      prismaMock.enrolment.findFirst.mockResolvedValue({
        id: 'enrol-existing-1',
        userId: 'user-learner-1',
        programId: 'prog-100',
        status: EnrolmentStatus.ACTIVE,
        payments: [{ id: 'pmt-101', status: 'succeeded', amount: 500 }],
      });

      await expect(
        paymentsService.createCheckoutSession(
          {
            targetType: 'ENROLMENT',
            targetId: 'prog-100',
            currency: 'USD',
            amount: 500,
          },
          { id: 'user-learner-1', email: 'learner@example.com' },
        ),
      ).rejects.toThrow(BadRequestException);

      try {
        await paymentsService.createCheckoutSession(
          {
            targetType: 'ENROLMENT',
            targetId: 'prog-100',
            currency: 'USD',
            amount: 500,
          },
          { id: 'user-learner-1', email: 'learner@example.com' },
        );
      } catch (err: any) {
        expect(err.response?.error).toBe('ALREADY_ENROLLED');
        expect(err.response?.message).toContain('Duplicate payment is blocked');
      }
    });

    it('Scenario 1B: Allows checkout if prior enrolment has NO successful payment (e.g. pending/abandoned)', async () => {
      const mockProgram = {
        id: 'prog-100',
        title: 'Mastering Agentic Workflows',
        price: 500,
        currency: 'USD',
      };

      prismaMock.program.findUnique.mockResolvedValue(mockProgram);
      prismaMock.enrolment.findUnique.mockResolvedValue(null);

      // Existing enrolment but no succeeded payments
      prismaMock.enrolment.findFirst.mockResolvedValue({
        id: 'enrol-abandoned-1',
        userId: 'user-learner-2',
        programId: 'prog-100',
        status: EnrolmentStatus.PENDING_PAYMENT,
        payments: [],
      });

      stripeProviderMock.createOrder.mockResolvedValue({
        orderId: 'cs_test_session_123',
        checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_session_123',
      });

      const res = await paymentsService.createCheckoutSession(
        {
          targetType: 'ENROLMENT',
          targetId: 'prog-100',
          currency: 'USD',
          amount: 500,
        },
        { id: 'user-learner-2', email: 'learner2@example.com' },
      );

      expect(res.orderId).toBe('cs_test_session_123');
      expect(res.checkoutUrl).toBeDefined();
    });
  });

  // =========================================================================
  // SUITE 2: Tier 2 In-Flight Session Expiration (Stale Window De-duplication)
  // =========================================================================
  describe('Tier 2: In-Flight Open Session De-duplication & Expiration', () => {
    let paymentsService: PaymentsService;
    let prismaMock: any;
    let stripeProviderMock: any;

    beforeEach(() => {
      prismaMock = {
        program: { findUnique: vi.fn() },
        enrolment: { findUnique: vi.fn(), findFirst: vi.fn() },
        payment: { findFirst: vi.fn(), create: vi.fn().mockResolvedValue({ id: 'p1' }) },
      };

      stripeProviderMock = {
        name: 'STRIPE',
        createOrder: vi.fn().mockResolvedValue({
          orderId: 'cs_test_session_new',
          checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_session_new',
        }),
        expireSession: vi.fn().mockResolvedValue(true),
        retrieveSession: vi.fn(),
        refundPayment: vi.fn(),
      };

      paymentsService = new PaymentsService(
        prismaMock,
        {} as any,
        {} as any,
        stripeProviderMock,
        {} as any,
      );
    });

    it('Scenario 2A: Automatically expires prior in-flight pending Stripe checkout session', async () => {
      const mockProgram = {
        id: 'prog-200',
        title: 'Executive Leadership Lab',
        price: 1200,
        currency: 'USD',
      };
      prismaMock.program.findUnique.mockResolvedValue(mockProgram);
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-active-lead',
        programId: 'prog-200',
        program: mockProgram,
      });
      prismaMock.enrolment.findFirst.mockResolvedValue(null);

      // Prior session created 5 minutes ago (still in 15min window)
      prismaMock.payment.findFirst.mockResolvedValue({
        id: 'prior-pending-pmt',
        stripeSessionId: 'cs_test_session_prior_stale',
        status: 'pending',
        createdAt: new Date(Date.now() - 5 * 60 * 1000),
      });

      await paymentsService.createCheckoutSession(
        {
          targetType: 'ENROLMENT',
          targetId: 'enrol-active-lead',
          currency: 'USD',
          amount: 1200,
        },
        { id: 'user-3', email: 'user3@example.com' },
      );

      // Must call Stripe provider's expireSession with the stale session ID
      expect(stripeProviderMock.expireSession).toHaveBeenCalledWith('cs_test_session_prior_stale');
    });
  });

  // =========================================================================
  // SUITE 3: Price Tampering and Minor-Unit Validation
  // =========================================================================
  describe('Price Integrity & Minor-Unit Tampering Protection', () => {
    let paymentsService: PaymentsService;
    let prismaMock: any;
    let stripeProviderMock: any;

    beforeEach(() => {
      prismaMock = {
        program: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'prog-300',
            title: 'Full Stack Architecture',
            price: 750,
            currency: 'USD',
          }),
        },
        enrolment: { findUnique: vi.fn(), findFirst: vi.fn() },
        payment: { findFirst: vi.fn(), create: vi.fn() },
      };

      stripeProviderMock = {
        name: 'STRIPE',
        createOrder: vi.fn(),
        expireSession: vi.fn(),
      };

      paymentsService = new PaymentsService(
        prismaMock,
        {} as any,
        {} as any,
        stripeProviderMock,
        {} as any,
      );
    });

    it('Scenario 3A: Rejects underpayment when client sends manipulated lower price', async () => {
      await expect(
        paymentsService.createCheckoutSession(
          {
            targetType: 'ENROLMENT',
            targetId: 'prog-300',
            currency: 'USD',
            amount: 700, // Client attempts to pay $700 instead of $750
          },
          { id: 'user-4' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('Scenario 3B: Rejects tampered minor units discrepancy', async () => {
      await expect(
        paymentsService.createCheckoutSession(
          {
            targetType: 'ENROLMENT',
            targetId: 'prog-300',
            currency: 'USD',
            amount: 745.50, // Tampered discrepancy > 1 cent
          },
          { id: 'user-4' },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // SUITE 4: Webhook Signature Verification & Tier 4 Duplicate Safety Net
  // =========================================================================
  describe('Webhook Security & Duplicate Auto-Refund Safety Net', () => {
    let webhookController: PaymentWebhookController;
    let prismaMock: any;
    let stripeMock: any;

    beforeEach(() => {
      prismaMock = {
        payment: {
          findUnique: vi.fn(),
          findFirst: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
        },
        enrolment: {
          findUnique: vi.fn(),
        },
        auditLog: {
          create: vi.fn().mockResolvedValue({ id: 'audit-logged' }),
        },
        eventRegistration: {
          findFirst: vi.fn(),
          update: vi.fn(),
        },
        $transaction: vi.fn().mockImplementation((cb) => cb(prismaMock)),
      };

      stripeMock = {
        refunds: {
          create: vi.fn().mockResolvedValue({ id: 're_123', status: 'succeeded' }),
        },
      };

      webhookController = new PaymentWebhookController(
        prismaMock,
        {} as any,
        {} as any,
        stripeMock as any,
      );
    });

    it('Scenario 4A: Rejects webhook missing expected cryptographic credentials', async () => {
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret_for_unit_tests';

      await expect(
        webhookController.handlePaymentWebhook(
          { type: 'checkout.session.completed' },
          undefined, // Missing stripe-signature
          undefined, // Missing x-webhook-secret
          { ip: '192.168.1.1' },
        ),
      ).rejects.toThrow(HttpException);
    });

    it('Scenario 4B: Triggers automated Stripe refund if duplicate payment webhook arrives for already ACTIVE enrolment', async () => {
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_unit_test';
      const validSecret = 'whsec_unit_test';

      const sessionId = 'cs_test_duplicate_payment_event';
      const existingPaymentRow = null; // No prior row for this specific session yet

      prismaMock.payment.findUnique.mockResolvedValue(existingPaymentRow);
      prismaMock.payment.findFirst.mockResolvedValue({
        id: 'original-pmt-1',
        stripeSessionId: 'cs_first_original_payment',
        status: 'succeeded',
        amount: 999,
      });

      // Enrolment is ALREADY ACTIVE from a prior checkout
      const alreadyActiveEnrolment = {
        id: 'enrol-already-active-99',
        userId: 'learner-99',
        status: EnrolmentStatus.ACTIVE,
        program: { id: 'prog-1', title: 'AI Mastery', price: 999 },
        batch: { id: 'b1', name: 'Cohort 1' },
        user: { id: 'learner-99', name: 'Jane Doe', email: 'jane@example.com' },
        signedAgreement: { id: 'sa-1', templateVersion: 'v1.0' },
        payments: [
          {
            id: 'original-pmt-1',
            stripeSessionId: 'cs_first_original_payment',
            status: 'succeeded',
            amount: 999,
          },
        ],
      };

      prismaMock.enrolment.findUnique.mockResolvedValue(alreadyActiveEnrolment);

      const payload = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: sessionId,
            payment_intent: 'pi_test_duplicate_99',
            amount_total: 99900,
            currency: 'usd',
            metadata: {
              enrolmentId: 'enrol-already-active-99',
              userId: 'learner-99',
            },
          },
        },
      };

      const result = await webhookController.handlePaymentWebhook(
        payload,
        undefined,
        validSecret, // Valid x-webhook-secret header
        { ip: '127.0.0.1' },
      );

      // Expect duplicate refund safety net triggered
      expect(stripeMock.refunds.create).toHaveBeenCalledWith(
        expect.objectContaining({
          payment_intent: 'pi_test_duplicate_99',
          reason: 'duplicate',
        }),
      );

      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'DUPLICATE_PAYMENT_AUTO_REFUNDED',
          }),
        }),
      );

      expect(result.duplicateDetected).toBe(true);
      expect(result.refunded).toBe(true);
    });
  });

  // =========================================================================
  // SUITE 5: Multi-Currency Normalization to USD (Adaptive Pricing Reporting)
  // =========================================================================
  describe('Multi-Currency Revenue Normalization to USD', () => {
    let revenueController: RevenueController;
    let prismaMock: any;

    beforeEach(() => {
      prismaMock = {
        invoice: {
          findMany: vi.fn(),
        },
        payment: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        user: {
          count: vi.fn().mockResolvedValue(10),
        },
      };

      revenueController = new RevenueController(prismaMock);
    });

    it('Scenario 5A: Accurately converts multi-currency transactions (USD, AED, INR) into normalized USD total', async () => {
      // 100 USD + 734 AED (200 USD @ 3.67) + 24900 INR (300 USD @ 83) = ~600 USD
      prismaMock.invoice.findMany.mockResolvedValue([
        {
          id: 'inv-1',
          invoiceNumber: 'INV-2026-0001',
          amount: 100,
          currency: 'USD',
          status: 'PAID',
          createdAt: new Date(),
        },
        {
          id: 'inv-2',
          invoiceNumber: 'INV-2026-0002',
          amount: 734,
          currency: 'AED',
          status: 'PAID',
          createdAt: new Date(),
        },
        {
          id: 'inv-3',
          invoiceNumber: 'INV-2026-0003',
          amount: 24900,
          currency: 'INR',
          status: 'PAID',
          createdAt: new Date(),
        },
      ]);

      const analytics = await revenueController.getRevenueStats({} as any, 'all');

      // 100 + (734 / 3.67 = 200) + (24900 / 83 = 300) = 600 USD
      expect(analytics.numericTotalRevenue).toBe(600);
      expect(analytics.totalRevenueInUSD).toBe(600);
      expect(analytics.multiCurrencyBreakdown).toBe('$ 100  ·  د.إ 734  ·  ₹ 24,900');
    });
  });

  // =========================================================================
  // SUITE 6: Fractional / Decimal Currency Precision (Anti-Rounding Underpayment Fix)
  // =========================================================================
  describe('Suite 6: Fractional Decimal Precision Support', () => {
    let paymentsService: PaymentsService;
    let prismaMock: any;
    let stripeProviderMock: any;

    beforeEach(() => {
      prismaMock = {
        program: {
          findUnique: vi.fn(),
        },
        enrolment: {
          findUnique: vi.fn(),
          findFirst: vi.fn(),
        },
        payment: {
          findFirst: vi.fn(),
          create: vi.fn().mockResolvedValue({ id: 'pay-dec-1' }),
        },
      };

      stripeProviderMock = {
        name: 'STRIPE',
        createOrder: vi.fn().mockResolvedValue({
          provider: 'STRIPE',
          orderId: 'cs_test_decimal_995',
          amount: 9.95,
          currency: 'USD',
          status: 'PENDING',
          checkoutUrl: 'https://checkout.stripe.com/pay/cs_test_decimal_995',
        }),
        expireSession: vi.fn().mockResolvedValue(true),
        retrieveSession: vi.fn(),
        refundPayment: vi.fn(),
      };

      paymentsService = new PaymentsService(
        prismaMock,
        {} as any,
        {} as any,
        stripeProviderMock,
        {} as any,
      );
    });

    it('Scenario 6A: Correctly handles decimal price (9.95 USD) without rounding up to 10 USD', async () => {
      const mockProgram = {
        id: 'prog-dec-1',
        title: 'Decimal Price Course',
        price: 9.95,
        currency: 'USD',
        priceUSD: 0,
        priceINR: 0,
        priceAED: 0,
      };

      prismaMock.program.findUnique.mockResolvedValue(mockProgram);
      prismaMock.enrolment.findUnique.mockResolvedValue(null);
      prismaMock.enrolment.findFirst.mockResolvedValue(null);

      const session = await paymentsService.createCheckoutSession(
        {
          targetType: 'ENROLMENT',
          targetId: 'prog-dec-1',
          amount: 9.95,
          currency: 'USD',
        },
        { id: 'user-new-1', email: 'test@example.com' },
      );

      expect(session).toBeDefined();
      expect(session.orderId).toBe('cs_test_decimal_995');
      expect(stripeProviderMock.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 9.95,
          currency: 'USD',
        }),
      );
    });
  });
});
