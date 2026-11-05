import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';
import { PaymentsService } from '../src/modules/payments/payments.service.js';
import { PaymentWebhookController } from '../src/modules/enrollments/payment.webhook.controller.js';
import { RevenueController } from '../src/modules/revenue/revenue.controller.js';
import { EnrolmentStatus, AgreementStatus, InvoiceStatus, Role } from '@prisma/client';

describe('Real-World End-to-End Suite: Unified USD Core with Stripe Native Adaptive Pricing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockProgram = {
    id: 'prog-delta-10',
    title: 'Delta Brain Health Program',
    price: 10,
    currency: 'USD',
  };

  const mockEnrolment = {
    id: 'enr-realworld-1',
    userId: 'user-indian-learner-1',
    programId: 'prog-delta-10',
    status: EnrolmentStatus.PENDING_PAYMENT,
    program: mockProgram,
    batch: null,
    user: { id: 'user-indian-learner-1', name: 'Rohan Sharma', email: 'rohan@example.in' },
    signedAgreement: { status: AgreementStatus.SIGNED },
  };

  // =========================================================================
  // SCENARIO 1: Indian Learner Paying in INR via Stripe Adaptive Pricing
  // =========================================================================
  describe('Scenario 1: Indian Learner (Adaptive Pricing with INR Conversion)', () => {
    let controller: PaymentWebhookController;
    let prismaMock: any;

    beforeEach(() => {
      delete process.env.STRIPE_WEBHOOK_SECRET;

      prismaMock = {
        $transaction: vi.fn().mockImplementation(async (cb: any) => cb(prismaMock)),
        enrolment: {
          findUnique: vi.fn().mockResolvedValue(mockEnrolment),
          update: vi.fn().mockImplementation(async ({ data }: any) => ({
            ...mockEnrolment,
            ...data,
          })),
        },
        payment: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'pay-pending-1',
            enrolmentId: 'enr-realworld-1',
            stripeSessionId: 'cs_test_india_adaptive_865',
            amount: 10,
            currency: 'USD',
            status: 'pending',
          }),
          findFirst: vi.fn().mockResolvedValue(null),
          upsert: vi.fn().mockImplementation(async ({ where, update, create }: any) => ({
            id: 'pay-pending-1',
            stripeSessionId: where.stripeSessionId,
            ...(update || create),
          })),
        },
        invoice: {
          upsert: vi.fn().mockImplementation(async ({ create, update }: any) => ({
            id: 'inv-adaptive-1',
            ...(update || create),
          })),
        },
        auditLog: {
          create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
        },
      };

      controller = new PaymentWebhookController(prismaMock as any, undefined, undefined);
    });

    it('processes Indian learner INR payment without currency mismatch and records authoritative USD', async () => {
      // Stripe checkout session completed payload when Indian customer paid in INR
      const stripePayload = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_india_adaptive_865',
            amount_total: 86500, // ₹865.00 INR paid by student in India
            currency: 'inr',     // Student charged in Indian Rupees
            currency_conversion: {
              amount_total: 86500,
              fx_rate: '86.50',
              source_currency: 'usd', // Converted natively from USD
            },
            metadata: {
              targetType: 'ENROLMENT',
              enrolmentId: 'enr-realworld-1',
              baseAmountUSD: '10',
              userId: 'user-indian-learner-1',
            },
          },
        },
      };

      const result = await controller.handlePaymentWebhook(stripePayload);

      expect(result.received).toBe(true);
      expect(result.enrolmentStatus).toBe(EnrolmentStatus.ACTIVE);
      expect(result.courseAccessGranted).toBe(true);

      // Verify payment was recorded in USD ($10.00), NOT ₹865
      expect(prismaMock.payment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { stripeSessionId: 'cs_test_india_adaptive_865' },
          update: expect.objectContaining({
            amount: 10,
            currency: 'USD',
            status: 'succeeded',
          }),
        }),
      );

      // Verify invoice includes local payment disclosure in taxFields
      expect(prismaMock.invoice.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            amount: 10,
            currency: 'USD',
            taxFields: expect.objectContaining({
              total: 10,
              currency: 'USD',
              localPayment: {
                paidCurrency: 'INR',
                paidAmount: 865,
                fxRate: '86.50',
                provider: 'Stripe Adaptive Pricing',
              },
            }),
          }),
        }),
      );
    });
  });

  // =========================================================================
  // SCENARIO 2: UAE Learner Paying in AED via Stripe Adaptive Pricing
  // =========================================================================
  describe('Scenario 2: UAE Learner (Adaptive Pricing with AED Conversion)', () => {
    let controller: PaymentWebhookController;
    let prismaMock: any;

    beforeEach(() => {
      delete process.env.STRIPE_WEBHOOK_SECRET;

      prismaMock = {
        $transaction: vi.fn().mockImplementation(async (cb: any) => cb(prismaMock)),
        enrolment: {
          findUnique: vi.fn().mockResolvedValue({
            ...mockEnrolment,
            userId: 'user-uae-learner-2',
            user: { id: 'user-uae-learner-2', name: 'Fatima Al Mansoori', email: 'fatima@example.ae' },
          }),
          update: vi.fn().mockImplementation(async ({ data }: any) => ({
            ...mockEnrolment,
            ...data,
          })),
        },
        payment: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'pay-pending-uae',
            enrolmentId: 'enr-realworld-1',
            stripeSessionId: 'cs_test_uae_adaptive_36',
            amount: 10,
            currency: 'USD',
            status: 'pending',
          }),
          findFirst: vi.fn().mockResolvedValue(null),
          upsert: vi.fn().mockImplementation(async ({ where, update, create }: any) => ({
            id: 'pay-pending-uae',
            stripeSessionId: where.stripeSessionId,
            ...(update || create),
          })),
        },
        invoice: {
          upsert: vi.fn().mockImplementation(async ({ create, update }: any) => ({
            id: 'inv-adaptive-uae',
            ...(update || create),
          })),
        },
        auditLog: {
          create: vi.fn().mockResolvedValue({ id: 'audit-2' }),
        },
      };

      controller = new PaymentWebhookController(prismaMock as any, undefined, undefined);
    });

    it('processes UAE learner AED payment and records authoritative USD', async () => {
      const stripePayload = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_uae_adaptive_36',
            amount_total: 3670, // 36.70 AED
            currency: 'aed',
            currency_conversion: {
              amount_total: 3670,
              fx_rate: '3.67',
              source_currency: 'usd',
            },
            metadata: {
              targetType: 'ENROLMENT',
              enrolmentId: 'enr-realworld-1',
              baseAmountUSD: '10',
              userId: 'user-uae-learner-2',
            },
          },
        },
      };

      const result = await controller.handlePaymentWebhook(stripePayload);

      expect(result.received).toBe(true);
      expect(result.enrolmentStatus).toBe(EnrolmentStatus.ACTIVE);

      // Settled in USD
      expect(prismaMock.payment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            amount: 10,
            currency: 'USD',
            status: 'succeeded',
          }),
        }),
      );
    });
  });

  // =========================================================================
  // SCENARIO 3: Synchronous Return Dual-Path Fallback (getSessionStatus)
  // =========================================================================
  describe('Scenario 3: Synchronous Return Fallback with Adaptive Pricing', () => {
    let paymentsService: PaymentsService;
    let prismaMock: any;
    let stripeProviderMock: any;

    beforeEach(() => {
      prismaMock = {
        $transaction: vi.fn().mockImplementation(async (cb: any) => cb(prismaMock)),
        payment: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'pay-sync-1',
            stripeSessionId: 'cs_test_sync_adaptive_1',
            enrolmentId: 'enr-realworld-1',
            status: 'pending', // Still pending when user lands on /checkout/success
            enrolment: mockEnrolment,
          }),
          findFirst: vi.fn().mockResolvedValue({
            id: 'pay-sync-1',
            status: 'pending',
          }),
          update: vi.fn().mockImplementation(async ({ data }: any) => ({
            id: 'pay-sync-1',
            ...data,
          })),
          upsert: vi.fn().mockImplementation(async ({ update, create }: any) => ({
            id: 'pay-sync-1',
            ...(update || create),
          })),
        },
        enrolment: {
          findUnique: vi.fn().mockResolvedValue(mockEnrolment),
          update: vi.fn().mockImplementation(async ({ data }: any) => ({
            ...mockEnrolment,
            ...data,
          })),
        },
        invoice: {
          findFirst: vi.fn().mockResolvedValue(null),
          upsert: vi.fn().mockResolvedValue({ id: 'inv-sync-1', invoiceNumber: 'INV-2026-99999' }),
          create: vi.fn().mockResolvedValue({ id: 'inv-sync-1', invoiceNumber: 'INV-2026-99999' }),
        },
        couponRedemption: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      stripeProviderMock = {
        name: 'STRIPE',
        retrieveSession: vi.fn().mockResolvedValue({
          id: 'cs_test_sync_adaptive_1',
          payment_status: 'paid',
          amount_total: 86500, // Charged ₹865.00
          currency: 'inr',
          currency_conversion: {
            amount_total: 86500,
            fx_rate: '86.50',
            source_currency: 'usd',
          },
          metadata: {
            targetType: 'ENROLMENT',
            enrolmentId: 'enr-realworld-1',
            baseAmountUSD: '10',
          },
        }),
      };

      paymentsService = new PaymentsService(
        prismaMock,
        {} as any,
        {} as any,
        stripeProviderMock,
        {} as any,
      );
      (paymentsService as any).activeProviderType = 'STRIPE';
    });

    it('reconciles paid Stripe session synchronously in USD and returns localized paid info', async () => {
      const statusResult = await paymentsService.getSessionStatus('cs_test_sync_adaptive_1');

      expect(statusResult.status).toBe('PAID');
      expect(statusResult.amount).toBe(10);
      expect(statusResult.currency).toBe('USD');
      expect(statusResult.currencySymbol).toBe('$');
      expect(statusResult.localPayment).toEqual({
        localCurrency: 'INR',
        localAmount: 865,
        fxRate: '86.50',
      });
    });
  });

  // =========================================================================
  // SCENARIO 4: Race Condition Stress Test (Concurrent Webhook + Sync Return)
  // =========================================================================
  describe('Scenario 4: Concurrent Race Condition Stress Test', () => {
    it('handles simultaneous webhook delivery and user return redirect without throwing unique constraint error', async () => {
      const recordedPayments = new Map<string, any>();

      const threadSafePrisma: any = {
        $transaction: vi.fn().mockImplementation(async (cb: any) => cb(threadSafePrisma)),
        enrolment: {
          findUnique: vi.fn().mockResolvedValue(mockEnrolment),
          update: vi.fn().mockResolvedValue(mockEnrolment),
        },
        payment: {
          findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
            return recordedPayments.get(where.stripeSessionId) || null;
          }),
          findFirst: vi.fn().mockImplementation(async () => {
            return Array.from(recordedPayments.values())[0] || null;
          }),
          upsert: vi.fn().mockImplementation(async ({ where, update, create }: any) => {
            const existing = recordedPayments.get(where.stripeSessionId);
            const saved = existing ? { ...existing, ...update } : { id: 'pay-race-1', stripeSessionId: where.stripeSessionId, ...create };
            recordedPayments.set(where.stripeSessionId, saved);
            return saved;
          }),
        },
        invoice: {
          upsert: vi.fn().mockResolvedValue({ id: 'inv-race-1', invoiceNumber: 'INV-2026-88888' }),
        },
        auditLog: {
          create: vi.fn().mockResolvedValue({ id: 'audit-race' }),
        },
      };

      const webhookController = new PaymentWebhookController(threadSafePrisma as any, undefined, undefined);

      const stripeProvider = {
        retrieveSession: vi.fn().mockResolvedValue({
          id: 'cs_test_race_123',
          payment_status: 'paid',
          amount_total: 86500,
          currency: 'inr',
          currency_conversion: { source_currency: 'usd', fx_rate: '86.50' },
          metadata: { enrolmentId: 'enr-realworld-1', baseAmountUSD: '10' },
        }),
      };

      const paymentsService = new PaymentsService(threadSafePrisma as any, {} as any, {} as any, stripeProvider as any, {} as any);
      (paymentsService as any).activeProviderType = 'STRIPE';

      const webhookPayload = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_race_123',
            amount_total: 86500,
            currency: 'inr',
            currency_conversion: { source_currency: 'usd', fx_rate: '86.50' },
            metadata: { enrolmentId: 'enr-realworld-1', baseAmountUSD: '10' },
          },
        },
      };

      // Execute BOTH at the exact same moment (Promise.all)
      const [webhookResult, syncResult] = await Promise.all([
        webhookController.handlePaymentWebhook(webhookPayload),
        paymentsService.getSessionStatus('cs_test_race_123'),
      ]);

      expect(webhookResult.received).toBe(true);
      expect(syncResult.status).toBe('PAID');

      // Verify exactly ONE payment row exists and has status 'succeeded' and amount $10 USD
      expect(recordedPayments.size).toBe(1);
      const paymentRow = recordedPayments.get('cs_test_race_123');
      expect(paymentRow.status).toBe('succeeded');
      expect(paymentRow.amount).toBe(10);
      expect(paymentRow.currency).toBe('USD');
    });
  });

  // =========================================================================
  // SCENARIO 5: Full Revenue Aggregation Proof
  // =========================================================================
  describe('Scenario 5: Admin Revenue Accounting Proof', () => {
    it('aggregates payments across USD, converted INR, and converted AED into exact USD total', async () => {
      // 3 real-world transactions in DB:
      // 1. Learner in India who paid ₹865 for a $10 course (settled in DB as amount: 10, currency: USD)
      // 2. Learner in UAE who paid 36.70 AED for a $10 course (settled in DB as amount: 10, currency: USD)
      // 3. Learner in USA who paid $10 USD (settled in DB as amount: 10, currency: USD)
      const mockPayments = [
        {
          id: 'pay-in-1',
          amount: 10,
          currency: 'USD',
          status: 'succeeded',
          createdAt: new Date('2026-11-04T10:00:00Z'),
          enrolment: { user: { name: 'Indian Learner', email: 'in@test.com' }, program: mockProgram },
        },
        {
          id: 'pay-uae-1',
          amount: 10,
          currency: 'USD',
          status: 'succeeded',
          createdAt: new Date('2026-11-04T11:00:00Z'),
          enrolment: { user: { name: 'UAE Learner', email: 'uae@test.com' }, program: mockProgram },
        },
        {
          id: 'pay-us-1',
          amount: 10,
          currency: 'USD',
          status: 'succeeded',
          createdAt: new Date('2026-11-04T12:00:00Z'),
          enrolment: { user: { name: 'US Learner', email: 'us@test.com' }, program: mockProgram },
        },
      ];

      const prismaMock = {
        invoice: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        payment: {
          findMany: vi.fn().mockResolvedValue(mockPayments),
        },
        eventRegistration: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        seatPool: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        enrolment: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      };

      const revenueController = new RevenueController(prismaMock as any);
      const metrics = await revenueController.getRevenueStats({ user: { role: Role.ADMIN } });

      // Total Revenue should be exactly $30 USD (not split, not distorted)
      expect(metrics.totalRevenueInUSD).toBe(30);
      expect(metrics.numericTotalRevenue).toBe(30);
      expect(metrics.totalRevenue).toBe('$30');
      expect(metrics.byCurrency.USD.total).toBe(30);
      expect(metrics.byCurrency.USD.count).toBe(3);
    });
  });

  // =========================================================================
  // SCENARIO 6: Underpayment & Tampering Rejection
  // =========================================================================
  describe('Scenario 6: Amount Tampering Rejection Guard', () => {
    let controller: PaymentWebhookController;

    beforeEach(() => {
      delete process.env.STRIPE_WEBHOOK_SECRET;

      const prismaMock = {
        payment: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'pay-1',
            amount: 10, // Expected $10 USD
            currency: 'USD',
            status: 'pending',
          }),
        },
        enrolment: {
          findUnique: vi.fn().mockResolvedValue(mockEnrolment),
        },
      };

      controller = new PaymentWebhookController(prismaMock as any, undefined, undefined);
    });

    it('rejects manipulated lower amount on adaptive pricing webhook', async () => {
      const tamperedPayload = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_tampered',
            amount_total: 40000, // Only ₹400 instead of ₹865
            currency: 'inr',
            currency_conversion: { source_currency: 'usd', fx_rate: '86.50' },
            metadata: {
              enrolmentId: 'enr-realworld-1',
              baseAmountUSD: '4.62', // Tampered lower USD base
            },
          },
        },
      };

      await expect(controller.handlePaymentWebhook(tamperedPayload)).rejects.toThrow(
        HttpException,
      );
    });
  });
});
