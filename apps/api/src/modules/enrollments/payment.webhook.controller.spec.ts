import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentWebhookController } from './payment.webhook.controller.js';
import { HttpException, HttpStatus } from '@nestjs/common';
import { EnrolmentStatus, AgreementStatus } from '@prisma/client';

describe('PaymentWebhookController - Independent Amount & Currency Validation', () => {
  let controller: PaymentWebhookController;
  let prismaMock: any;

  const mockProgram = {
    id: 'prog-555',
    title: 'Brain Health Foundations',
    price: 555,
    currency: 'USD',
  };

  const mockEnrolment = {
    id: 'enr-webhook-1',
    userId: 'user-wh-1',
    programId: 'prog-555',
    status: EnrolmentStatus.PENDING_PAYMENT,
    program: mockProgram,
    batch: null,
    user: { id: 'user-wh-1', name: 'Learner One', email: 'learner1@whatboutme.com' },
    signedAgreement: { status: AgreementStatus.SIGNED },
  };

  beforeEach(() => {
    vi.clearAllMocks();
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
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(async ({ data }: any) => ({
          id: 'pay-wh-1',
          ...data,
        })),
        update: vi.fn().mockResolvedValue({ id: 'pay-wh-1', status: 'succeeded' }),
        upsert: vi.fn().mockImplementation(async ({ create, update }: any) => ({
          id: 'pay-wh-1',
          ...(update || create),
        })),
      },
      invoice: {
        create: vi.fn().mockImplementation(async ({ data }: any) => ({
          id: 'inv-wh-1',
          ...data,
        })),
        update: vi.fn().mockResolvedValue({ id: 'inv-wh-1', status: 'PAID' }),
        upsert: vi.fn().mockImplementation(async ({ create, update }: any) => ({
          id: 'inv-wh-1',
          ...(update || create),
        })),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-wh-1' }),
      },
    };

    controller = new PaymentWebhookController(prismaMock as any, undefined, undefined);
  });

  it('rejects webhook with 400 Bad Request when received amount is less than expected order amount', async () => {
    prismaMock.payment.findUnique.mockResolvedValueOnce({
      id: 'pay-existing-1',
      enrolmentId: 'enr-webhook-1',
      stripeSessionId: 'sess_123',
      amount: 555,
      currency: 'USD',
      status: 'pending',
    });

    await expect(
      controller.handlePaymentWebhook({
        type: 'payment.succeeded',
        data: {
          object: {
            id: 'sess_123',
            amount_total: 10000, // $100.00 instead of $555.00
            currency: 'usd',
            metadata: { enrolmentId: 'enr-webhook-1', userId: 'user-wh-1' },
          },
        },
      }),
    ).rejects.toThrow(HttpException);
  });

  it('rejects webhook with 400 Bad Request when currency does not match existing order currency', async () => {
    prismaMock.payment.findUnique.mockResolvedValueOnce({
      id: 'pay-existing-1',
      enrolmentId: 'enr-webhook-1',
      stripeSessionId: 'sess_123',
      amount: 555,
      currency: 'USD',
      status: 'pending',
    });

    await expect(
      controller.handlePaymentWebhook({
        type: 'payment.succeeded',
        data: {
          object: {
            id: 'sess_123',
            amount_total: 55500,
            currency: 'inr', // INR instead of USD
            metadata: { enrolmentId: 'enr-webhook-1', userId: 'user-wh-1' },
          },
        },
      }),
    ).rejects.toThrow(HttpException);
  });

  it('accepts valid webhook with exact matching amount and activates enrolment', async () => {
    prismaMock.payment.findUnique.mockResolvedValueOnce({
      id: 'pay-existing-1',
      enrolmentId: 'enr-webhook-1',
      stripeSessionId: 'sess_123',
      amount: 555,
      currency: 'USD',
      status: 'pending',
    });

    const res = await controller.handlePaymentWebhook({
      type: 'payment.succeeded',
      data: {
        object: {
          id: 'sess_123',
          amount_total: 55500, // $555.00 exact
          currency: 'usd',
          metadata: { enrolmentId: 'enr-webhook-1', userId: 'user-wh-1' },
        },
      },
    });

    expect(res.received).toBe(true);
    expect(res.enrolmentStatus).toBe(EnrolmentStatus.ACTIVE);
    expect(res.courseAccessGranted).toBe(true);
  });

  it('sets status to PENDING_AGREEMENT if agreement is unsigned, preventing course access', async () => {
    prismaMock.enrolment.findUnique.mockResolvedValueOnce({
      ...mockEnrolment,
      signedAgreement: null, // Agreement unsigned
    });

    prismaMock.payment.findUnique.mockResolvedValueOnce({
      id: 'pay-existing-1',
      enrolmentId: 'enr-webhook-1',
      stripeSessionId: 'sess_123',
      amount: 555,
      currency: 'USD',
      status: 'pending',
    });

    const res = await controller.handlePaymentWebhook({
      type: 'payment.succeeded',
      data: {
        object: {
          id: 'sess_123',
          amount_total: 55500,
          currency: 'usd',
          metadata: { enrolmentId: 'enr-webhook-1', userId: 'user-wh-1' },
        },
      },
    });

    expect(res.received).toBe(true);
    expect(res.enrolmentStatus).toBe(EnrolmentStatus.PENDING_AGREEMENT);
    expect(res.courseAccessGranted).toBe(false);
  });

  describe('Durable Webhook Idempotency & Transient DB Failure Recovery', () => {
    let cacheStore: Map<string, any>;
    let cacheHelperMock: any;
    let webhookEventsDb: Map<string, any>;

    beforeEach(() => {
      cacheStore = new Map();
      webhookEventsDb = new Map();

      cacheHelperMock = {
        get: vi.fn().mockImplementation(async (key: string) => cacheStore.get(key) ?? null),
        set: vi.fn().mockImplementation(async (key: string, val: any) => {
          cacheStore.set(key, val);
        }),
        del: vi.fn().mockImplementation(async (key: string) => {
          cacheStore.delete(key);
        }),
        invalidateNamespace: vi.fn().mockResolvedValue(undefined),
      };

      prismaMock.webhookEvent = {
        findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
          return webhookEventsDb.get(where.eventKey) ?? null;
        }),
        upsert: vi.fn().mockImplementation(async ({ where, create, update }: any) => {
          const existing = webhookEventsDb.get(where.eventKey);
          const next = existing ? { ...existing, ...update } : { id: 'wh-evt-1', ...create };
          webhookEventsDb.set(where.eventKey, next);
          return next;
        }),
        create: vi.fn().mockImplementation(async ({ data }: any) => {
          const created = { id: 'wh-evt-1', ...data };
          webhookEventsDb.set(data.eventKey, created);
          return created;
        }),
      };

      controller = new PaymentWebhookController(prismaMock as any, cacheHelperMock as any, undefined);
    });

    it('first webhook delivery succeeds and marks event processed in PostgreSQL and cache after commit', async () => {
      const payload = {
        id: 'evt_success_001',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_success_001',
            amount_total: 55500,
            currency: 'usd',
            metadata: { enrolmentId: 'enr-webhook-1', userId: 'user-wh-1' },
          },
        },
      };

      const res = await controller.handlePaymentWebhook(payload);
      expect(res.received).toBe(true);
      expect(res.enrolmentStatus).toBe(EnrolmentStatus.ACTIVE);
      expect(prismaMock.webhookEvent.upsert).toHaveBeenCalledTimes(1);
      expect(webhookEventsDb.get('evt_success_001')?.status).toBe('PROCESSED');
      expect(cacheStore.get('stripe_event_id:evt_success_001')?.status).toBe('processed');
    });

    it('duplicate delivery after success returns idempotent response without duplicating side effects', async () => {
      const payload = {
        id: 'evt_dup_002',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_dup_002',
            amount_total: 55500,
            currency: 'usd',
            metadata: { enrolmentId: 'enr-webhook-1', userId: 'user-wh-1' },
          },
        },
      };

      const first = await controller.handlePaymentWebhook(payload);
      expect(first.received).toBe(true);

      const second = await controller.handlePaymentWebhook(payload);
      expect(second.received).toBe(true);
      expect(second.idempotent).toBe(true);
      expect(second.status).toBe('EVENT_ALREADY_PROCESSED');

      expect(prismaMock.enrolment.update).toHaveBeenCalledTimes(1);
      expect(prismaMock.payment.upsert).toHaveBeenCalledTimes(1);
      expect(prismaMock.invoice.upsert).toHaveBeenCalledTimes(1);
      expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it('first delivery failing inside Prisma transaction cleans up cache/lock and allows Stripe retry to succeed', async () => {
      const payload = {
        id: 'evt_transient_db_fail_003',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_transient_003',
            amount_total: 55500,
            currency: 'usd',
            metadata: { enrolmentId: 'enr-webhook-1', userId: 'user-wh-1' },
          },
        },
      };

      // Simulate transient database failure inside $transaction on first delivery
      prismaMock.$transaction.mockRejectedValueOnce(new Error('PrismaClientKnownRequestError: Connection reset by peer'));

      await expect(controller.handlePaymentWebhook(payload)).rejects.toThrow(/Connection reset by peer/);

      // Cache must NOT have a poisoned 'processing' or 'processed' key after failure
      expect(cacheStore.has('stripe_event_id:evt_transient_db_fail_003')).toBe(false);
      expect(webhookEventsDb.has('evt_transient_db_fail_003')).toBe(false);

      // Stripe retry with the exact same event ID must now succeed
      const retryRes = await controller.handlePaymentWebhook(payload);
      expect(retryRes.received).toBe(true);
      expect(retryRes.enrolmentStatus).toBe(EnrolmentStatus.ACTIVE);
      expect( retryRes.courseAccessGranted).toBe(true);
      expect(webhookEventsDb.get('evt_transient_db_fail_003')?.status).toBe('PROCESSED');
      expect(cacheStore.get('stripe_event_id:evt_transient_db_fail_003')?.status).toBe('processed');
    });

    it('Redis unavailable does not break webhook processing or duplicate detection when PostgreSQL succeeds', async () => {
      const brokenCacheHelper = {
        get: vi.fn().mockRejectedValue(new Error('Redis ECONNREFUSED')),
        set: vi.fn().mockRejectedValue(new Error('Redis ECONNREFUSED')),
        del: vi.fn().mockRejectedValue(new Error('Redis ECONNREFUSED')),
        invalidateNamespace: vi.fn().mockRejectedValue(new Error('Redis ECONNREFUSED')),
      };

      const resilientController = new PaymentWebhookController(
        prismaMock as any,
        brokenCacheHelper as any,
        undefined,
      );

      const payload = {
        id: 'evt_redis_down_004',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_redis_down_004',
            amount_total: 55500,
            currency: 'usd',
            metadata: { enrolmentId: 'enr-webhook-1', userId: 'user-wh-1' },
          },
        },
      };

      const first = await resilientController.handlePaymentWebhook(payload);
      expect(first.received).toBe(true);
      expect(first.enrolmentStatus).toBe(EnrolmentStatus.ACTIVE);

      // Duplicate delivery while Redis is still down is caught by PostgreSQL WebhookEvent table
      const second = await resilientController.handlePaymentWebhook(payload);
      expect(second.received).toBe(true);
      expect(second.idempotent).toBe(true);
      expect(second.status).toBe('EVENT_ALREADY_PROCESSED');
      expect(prismaMock.enrolment.update).toHaveBeenCalledTimes(1);
    });
  });
});
