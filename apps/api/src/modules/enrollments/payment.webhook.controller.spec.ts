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
});
