import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentsService } from './payments.service.js';
import { BadRequestException } from '@nestjs/common';
import { EnrolmentStatus, AgreementStatus, InvoiceStatus, EventPaymentStatus } from '@prisma/client';

describe('PaymentsService - Pricing, Tax Arithmetic & Tampering Protection', () => {
  let service: PaymentsService;
  let prismaMock: any;
  let couponsServiceMock: any;
  let mockPaymentProvider: any;

  const mockProgram = {
    id: 'prog-555',
    title: 'Brain Health Foundations',
    price: 555,
    currency: 'USD',
    priceUSD: null,
    priceAED: null,
    priceINR: null,
    earlyBirdPrice: null,
    earlyBirdDeadline: null,
  };

  const mockEnrolment = {
    id: 'enr-101',
    userId: 'user-bk',
    programId: 'prog-555',
    status: EnrolmentStatus.PENDING_PAYMENT,
    program: mockProgram,
    batch: null,
    user: { id: 'user-bk', name: 'BK Learner', email: 'bk@foxwel.ai' },
    signedAgreement: { status: AgreementStatus.SIGNED },
    payments: [],
  };

  const mockEvent = {
    id: 'evt-202',
    title: 'Brain Health Masterclass',
    price: 50,
    currency: 'USD',
    seatLimit: 100,
    seatsBooked: 10,
    venueName: 'Dubai Marina',
    venueAddress: 'Dubai, UAE',
  };

  const mockEventRegistration = {
    id: 'reg-303',
    eventId: 'evt-202',
    attendeeName: 'Guest User',
    attendeeEmail: 'guest@whatboutme.com',
    attendeePhone: '+971 50 123 4567',
    amount: 50,
    currency: 'USD',
    paymentStatus: EventPaymentStatus.PENDING,
    event: mockEvent,
  };

  beforeEach(() => {
    vi.clearAllMocks();

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
        create: vi.fn().mockImplementation(async ({ data }: any) => ({
          id: 'pay-new-1',
          ...data,
        })),
      },
      invoice: {
        create: vi.fn().mockImplementation(async ({ data }: any) => ({
          id: 'inv-new-1',
          ...data,
        })),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      },
      eventRegistration: {
        findFirst: vi.fn().mockResolvedValue(mockEventRegistration),
        update: vi.fn().mockImplementation(async ({ data }: any) => ({
          ...mockEventRegistration,
          ...data,
        })),
        create: vi.fn().mockImplementation(async ({ data }: any) => ({
          id: 'reg-new',
          ...data,
        })),
      },
      event: {
        findFirst: vi.fn().mockResolvedValue(mockEvent),
        update: vi.fn().mockImplementation(async ({ data }: any) => ({
          ...mockEvent,
          ...data,
        })),
      },
      program: {
        findUnique: vi.fn().mockResolvedValue(mockProgram),
      },
    };

    couponsServiceMock = {
      validateCoupon: vi.fn(),
    };

    const mockPdfService: any = {
      generateInvoicePdf: vi.fn().mockResolvedValue(Buffer.from('PDF_TEST')),
    };

    mockPaymentProvider = {
      createOrder: vi.fn().mockImplementation(async (params: any) => ({
        id: `order_${Date.now()}`,
        checkoutUrl: 'https://checkout.stripe.com/pay_test',
        provider: 'MOCK_TEST',
        ...params,
      })),
      verifyWebhook: vi.fn(),
    };

    service = new PaymentsService(
      prismaMock as any,
      mockPaymentProvider as any,
      mockPaymentProvider as any,
      mockPaymentProvider as any,
      mockPdfService,
      undefined, // CacheHelper
      undefined, // EmailService
      couponsServiceMock as any,
    );
  });

  describe('1. Amount Underpayment and Tampering Prevention Guard (Minor Units)', () => {
    it('rejects client underpayment when amount is even $0.01 (1 cent) less than authoritative price', async () => {
      await expect(
        service.simulateTestWebhook({
          targetType: 'ENROLMENT',
          targetId: 'enr-101',
          currency: 'USD',
          amount: 554.99, // 1 cent underpayment
          status: 'PAID',
        }),
      ).rejects.toThrow(/underpayment rejected/i);
    });

    it('rejects client underpayment by $1.00 (which previously passed the old 1.0 tolerance)', async () => {
      await expect(
        service.simulateTestWebhook({
          targetType: 'ENROLMENT',
          targetId: 'enr-101',
          currency: 'USD',
          amount: 554.00, // $1.00 underpayment
          status: 'PAID',
        }),
      ).rejects.toThrow(/underpayment rejected/i);
    });

    it('rejects gross underpayment (e.g. $1 instead of $555)', async () => {
      await expect(
        service.simulateTestWebhook({
          targetType: 'ENROLMENT',
          targetId: 'enr-101',
          currency: 'USD',
          amount: 1.0,
          status: 'PAID',
        }),
      ).rejects.toThrow(/underpayment rejected/i);
    });

    it('rejects client underpayment in INR (e.g. ₹46,064.00 instead of ₹46,065.00)', async () => {
      await expect(
        service.simulateTestWebhook({
          targetType: 'ENROLMENT',
          targetId: 'enr-101',
          currency: 'INR',
          amount: 46064.0, // ₹1 underpayment
          status: 'PAID',
        }),
      ).rejects.toThrow(/underpayment rejected/i);
    });

    it('rejects client underpayment in AED (e.g. AED 2,036 instead of AED 2,037)', async () => {
      await expect(
        service.simulateTestWebhook({
          targetType: 'ENROLMENT',
          targetId: 'enr-101',
          currency: 'AED',
          amount: 2036.0, // AED 1 underpayment
          status: 'PAID',
        }),
      ).rejects.toThrow(/underpayment rejected/i);
    });

    it('rejects manipulated overpayment beyond 1 minor-unit tolerance (e.g. $556 instead of $555)', async () => {
      await expect(
        service.simulateTestWebhook({
          targetType: 'ENROLMENT',
          targetId: 'enr-101',
          currency: 'USD',
          amount: 556.0,
          status: 'PAID',
        }),
      ).rejects.toThrow(/tampering detected/i);
    });

    it('accepts legitimate payment matching authoritative server price in USD ($555.00)', async () => {
      const res = await service.simulateTestWebhook({
        targetType: 'ENROLMENT',
        targetId: 'enr-101',
        currency: 'USD',
        amount: 555.0,
        status: 'PAID',
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('PAID');
      expect(res.amount).toBe(555);
    });

    it('accepts legitimate payment matching authoritative server price in INR (₹46,065.00)', async () => {
      const res = await service.simulateTestWebhook({
        targetType: 'ENROLMENT',
        targetId: 'enr-101',
        currency: 'INR',
        amount: 46065,
        status: 'PAID',
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('PAID');
      expect(res.amount).toBe(46065);
    });

    it('accepts legitimate payment matching authoritative server price in AED (AED 2,037.00)', async () => {
      const res = await service.simulateTestWebhook({
        targetType: 'ENROLMENT',
        targetId: 'enr-101',
        currency: 'AED',
        amount: 2037,
        status: 'PAID',
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('PAID');
      expect(res.amount).toBe(2037);
    });

    it('accepts payment within 1 minor-unit ceiling tolerance (e.g. $555.01 if client rounded up)', async () => {
      const res = await service.simulateTestWebhook({
        targetType: 'ENROLMENT',
        targetId: 'enr-101',
        currency: 'USD',
        amount: 555.01,
        status: 'PAID',
      });

      expect(res.success).toBe(true);
      expect(res.amount).toBe(555); // Authoritative amount recorded
    });

    it('accepts payment when client amount is omitted, authoritatively resolving price', async () => {
      const res = await service.simulateTestWebhook({
        targetType: 'ENROLMENT',
        targetId: 'enr-101',
        currency: 'AED',
        status: 'PAID',
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('PAID');
      expect(res.amount).toBe(2037);
    });
  });

  describe('2. Invoice Arithmetic Reconciliation (Subtotal + Tax === Total)', () => {
    it('USD Invoice: 0% tax, subtotal === total === 555', async () => {
      let createdInvoiceData: any = null;
      prismaMock.invoice.create.mockImplementation(async ({ data }: any) => {
        createdInvoiceData = data;
        return { id: 'inv-usd', ...data };
      });

      await service.simulateTestWebhook({
        targetType: 'ENROLMENT',
        targetId: 'enr-101',
        currency: 'USD',
        amount: 555,
        status: 'PAID',
      });

      expect(createdInvoiceData).not.toBeNull();
      const tax = createdInvoiceData.taxFields;
      expect(tax.taxRate).toBe(0);
      expect(tax.taxAmount).toBe(0);
      expect(tax.subtotal).toBe(555);
      expect(tax.total).toBe(555);
      expect(tax.subtotal + tax.taxAmount).toBe(tax.total);
    });

    it('AED Invoice: 5% inclusive VAT reconciles exactly: subtotal (1940.00) + tax (97.00) === 2037.00', async () => {
      let createdInvoiceData: any = null;
      prismaMock.invoice.create.mockImplementation(async ({ data }: any) => {
        createdInvoiceData = data;
        return { id: 'inv-aed', ...data };
      });

      await service.simulateTestWebhook({
        targetType: 'ENROLMENT',
        targetId: 'enr-101',
        currency: 'AED',
        amount: 2037,
        status: 'PAID',
      });

      expect(createdInvoiceData).not.toBeNull();
      const tax = createdInvoiceData.taxFields;
      expect(tax.taxRate).toBe(5);
      expect(tax.taxAmount).toBe(97.00);
      expect(tax.subtotal).toBe(1940.00);
      expect(tax.total).toBe(2037);
      expect(Math.round((tax.subtotal + tax.taxAmount) * 100) / 100).toBe(tax.total);
    });

    it('INR Invoice: 18% inclusive GST reconciles exactly: subtotal (39038.14) + tax (7026.86) === 46065.00', async () => {
      let createdInvoiceData: any = null;
      prismaMock.invoice.create.mockImplementation(async ({ data }: any) => {
        createdInvoiceData = data;
        return { id: 'inv-inr', ...data };
      });

      await service.simulateTestWebhook({
        targetType: 'ENROLMENT',
        targetId: 'enr-101',
        currency: 'INR',
        amount: 46065,
        status: 'PAID',
      });

      expect(createdInvoiceData).not.toBeNull();
      const tax = createdInvoiceData.taxFields;
      expect(tax.taxRate).toBe(18);
      expect(tax.taxAmount).toBe(7026.86);
      expect(tax.subtotal).toBe(39038.14);
      expect(tax.total).toBe(46065);
      expect(Math.round((tax.subtotal + tax.taxAmount) * 100) / 100).toBe(tax.total);
    });
  });

  describe('3. Coupon Discount & Tax Breakdown for USD, AED, INR', () => {
    it('USD with 10% coupon: subtotal (499.50) + tax (0.00) === 499.50', async () => {
      couponsServiceMock.validateCoupon.mockResolvedValueOnce({
        valid: true,
        discountAmount: 55.5,
        originalAmount: 555,
        finalAmount: 499.5,
      });

      let createdInvoiceData: any = null;
      prismaMock.invoice.create.mockImplementation(async ({ data }: any) => {
        createdInvoiceData = data;
        return { id: 'inv-coupon-usd', ...data };
      });

      const res = await service.simulateTestWebhook({
        targetType: 'ENROLMENT',
        targetId: 'enr-101',
        currency: 'USD',
        couponCode: 'SAVE10',
        amount: 499.5,
        status: 'PAID',
      });

      expect(res.amount).toBe(499.5);
      const tax = createdInvoiceData.taxFields;
      expect(tax.taxAmount).toBe(0);
      expect(tax.subtotal).toBe(499.5);
      expect(tax.total).toBe(499.5);
      expect(tax.subtotal + tax.taxAmount).toBe(tax.total);
    });

    it('AED with coupon discount: subtotal + 5% inclusive VAT === final payable', async () => {
      couponsServiceMock.validateCoupon.mockResolvedValueOnce({
        valid: true,
        discountAmount: 37,
        originalAmount: 2037,
        finalAmount: 2000,
      });

      let createdInvoiceData: any = null;
      prismaMock.invoice.create.mockImplementation(async ({ data }: any) => {
        createdInvoiceData = data;
        return { id: 'inv-coupon-aed', ...data };
      });

      const res = await service.simulateTestWebhook({
        targetType: 'ENROLMENT',
        targetId: 'enr-101',
        currency: 'AED',
        couponCode: 'SAVE37',
        amount: 2000,
        status: 'PAID',
      });

      expect(res.amount).toBe(2000);
      const tax = createdInvoiceData.taxFields;
      // 2000 * 5 / 105 = 95.24
      expect(tax.taxAmount).toBe(95.24);
      expect(tax.subtotal).toBe(1904.76);
      expect(Math.round((tax.subtotal + tax.taxAmount) * 100) / 100).toBe(2000);
    });

    it('INR with coupon discount: subtotal + 18% inclusive GST === final payable', async () => {
      couponsServiceMock.validateCoupon.mockResolvedValueOnce({
        valid: true,
        discountAmount: 1000,
        originalAmount: 46065,
        finalAmount: 45065,
      });

      let createdInvoiceData: any = null;
      prismaMock.invoice.create.mockImplementation(async ({ data }: any) => {
        createdInvoiceData = data;
        return { id: 'inv-coupon-inr', ...data };
      });

      const res = await service.simulateTestWebhook({
        targetType: 'ENROLMENT',
        targetId: 'enr-101',
        currency: 'INR',
        couponCode: 'SAVE1000',
        amount: 45065,
        status: 'PAID',
      });

      expect(res.amount).toBe(45065);
      const tax = createdInvoiceData.taxFields;
      // 45065 * 18 / 118 = 6874.32
      expect(tax.taxAmount).toBe(6874.32);
      expect(tax.subtotal).toBe(38190.68);
      expect(Math.round((tax.subtotal + tax.taxAmount) * 100) / 100).toBe(45065);
    });
  });

  describe('4. Event Registration Payment Simulation & Validation', () => {
    it('rejects event underpayment (e.g. $49.99 for a $50 event)', async () => {
      await expect(
        service.simulateTestWebhook({
          targetType: 'EVENT',
          targetId: 'reg-303',
          currency: 'USD',
          amount: 49.99,
          status: 'PAID',
        }),
      ).rejects.toThrow(/underpayment rejected/i);
    });

    it('rejects event payment with currency mismatch (e.g. event in USD paid with INR)', async () => {
      await expect(
        service.simulateTestWebhook({
          targetType: 'EVENT',
          targetId: 'reg-303',
          currency: 'INR',
          amount: 50,
          status: 'PAID',
        }),
      ).rejects.toThrow(/Currency mismatch/i);
    });

    it('accepts legitimate event payment and sets correct invoice pdfUrl', async () => {
      let createdInvoiceData: any = null;
      prismaMock.invoice.create.mockImplementation(async ({ data }: any) => {
        createdInvoiceData = data;
        return { id: 'inv-evt-1', ...data };
      });

      const res = await service.simulateTestWebhook({
        targetType: 'EVENT',
        targetId: 'reg-303',
        currency: 'USD',
        amount: 50,
        status: 'PAID',
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('PAID');
      expect(createdInvoiceData).not.toBeNull();
      expect(createdInvoiceData.pdfUrl).toBe('/api/invoices/reg-303/pdf');
    });
  });

  describe('5. Checkout Session Creation Amount & Security Guards', () => {
    it('rejects client underpayment when creating checkout session (e.g. client claims amount: 100 for $555 course)', async () => {
      await expect(
        service.createCheckoutSession({
          targetType: 'ENROLMENT',
          targetId: 'enr-101',
          currency: 'USD',
          amount: 100, // Client tries to initiate session for $100
        }),
      ).rejects.toThrow(/underpayment rejected/i);
    });

    it('rejects tampered amount higher than expected during checkout creation', async () => {
      await expect(
        service.createCheckoutSession({
          targetType: 'ENROLMENT',
          targetId: 'enr-101',
          currency: 'USD',
          amount: 600,
        }),
      ).rejects.toThrow(/tampering detected/i);
    });

    it('successfully initiates checkout order using server-side authoritative pricing when amount omitted', async () => {
      const res = await service.createCheckoutSession({
        targetType: 'ENROLMENT',
        targetId: 'enr-101',
        currency: 'USD',
      });

      expect(mockPaymentProvider.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 555,
          currency: 'USD',
        }),
      );
      expect(res.checkoutUrl).toBe('https://checkout.stripe.com/pay_test');
    });
  });
});
