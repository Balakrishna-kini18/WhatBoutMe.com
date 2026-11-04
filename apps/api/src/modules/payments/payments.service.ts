import { getAppUrls } from '../../common/config/app-urls.js';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AgreementStatus, EnrolmentStatus, EventPaymentStatus, InvoiceStatus, Role } from '@prisma/client';
import { MockTestPaymentProvider } from './providers/mock-test.provider.js';
import { RazorpayPaymentProvider } from './providers/razorpay.provider.js';
import { StripePaymentProvider } from './providers/stripe.provider.js';
import {
  IPaymentProvider,
  PaymentProviderType,
  SupportedCurrency,
} from './interfaces/payment.interfaces.js';
import { TestSimulateWebhookDto } from './dto/test-simulate-webhook.dto.js';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto.js';
import { CacheHelperService } from '../../common/cache/cache-helper.service.js';
import { EmailService } from '../email/email.service.js';
import { CouponsService } from '../coupons/coupons.service.js';
import { InvoicePdfService } from '../invoices/invoice-pdf.service.js';
import { isRegistrationDeadlinePassed } from '../../common/utils/deadline.util.js';

export function getCurrencySymbol(currency: string): string {
  switch (currency.toUpperCase()) {
    case 'INR':
      return '₹';
    case 'AED':
      return 'AED';
    case 'USD':
    default:
      return '$';
  }
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly providers: Map<PaymentProviderType, IPaymentProvider> = new Map();
  private activeProviderType: PaymentProviderType = 'MOCK_TEST';

  constructor(
    private readonly prisma: PrismaService,
    private readonly mockProvider: MockTestPaymentProvider,
    private readonly razorpayProvider: RazorpayPaymentProvider,
    private readonly stripeProvider: StripePaymentProvider,
    private readonly invoicePdfService: InvoicePdfService,
    @Optional() private readonly cacheHelper?: CacheHelperService,
    @Optional() private readonly emailService?: EmailService,
    @Optional() private readonly couponsService?: CouponsService,
  ) {
    this.providers.set('MOCK_TEST', this.mockProvider);
    this.providers.set('RAZORPAY', this.razorpayProvider);
    this.providers.set('STRIPE', this.stripeProvider);

    const envProvider = (process.env.PAYMENT_PROVIDER || 'MOCK_TEST').toUpperCase() as PaymentProviderType;
    if (this.providers.has(envProvider)) {
      this.activeProviderType = envProvider;
    }
  }

  getActiveProvider(): IPaymentProvider {
    return this.providers.get(this.activeProviderType) || this.mockProvider;
  }

  getActiveProviderInfo() {
    return {
      activeProvider: this.activeProviderType,
      isTestBypass: this.activeProviderType === 'MOCK_TEST',
      supportedCurrencies: ['USD', 'AED', 'INR'] as SupportedCurrency[],
      supportedModes: ['MOCK_TEST', 'RAZORPAY_STUB', 'STRIPE_STUB'],
    };
  }

  private convertCurrencyAmount(
    targetCurrency: SupportedCurrency,
    base: number,
    pCurrency: string = 'USD',
    pInr?: number | null,
    pAed?: number | null,
    pUsd?: number | null,
  ): number {
    if (targetCurrency === 'INR' && pInr && Number(pInr) > 0) return Number(pInr);
    if (targetCurrency === 'AED' && pAed && Number(pAed) > 0) return Number(pAed);
    if (targetCurrency === 'USD' && pUsd && Number(pUsd) > 0) return Number(pUsd);

    const origCurrency = (pCurrency || 'USD').toUpperCase();
    let inUSD = Number(base) || 0;
    if (origCurrency === 'INR') inUSD = inUSD / 83;
    else if (origCurrency === 'AED') inUSD = inUSD / 3.67;

    if (targetCurrency === 'INR') return Math.round(inUSD * 83);
    if (targetCurrency === 'AED') return Math.round(inUSD * 3.67);
    return Math.round(inUSD);
  }

  /**
   * Generates or validates price for course or event in the requested currency
   */
  async resolvePricing(targetType: 'ENROLMENT' | 'EVENT', targetId: string, requestedCurrency?: SupportedCurrency) {
    const currency: SupportedCurrency = requestedCurrency || 'USD';

    if (targetType === 'ENROLMENT') {
      const enrolment = await this.prisma.enrolment.findUnique({
        where: { id: targetId },
        include: { program: true, batch: true },
      });

      if (!enrolment) {
        // Fallback: targetId could be programId
        const program = await this.prisma.program.findUnique({ where: { id: targetId } });
        if (!program) throw new NotFoundException('Program or Enrolment not found');

        let amount = this.convertCurrencyAmount(currency, program.price, program.currency, program.priceINR, program.priceAED, program.priceUSD);

        // Early bird check
        if (program.earlyBirdPrice && program.earlyBirdDeadline && new Date() < new Date(program.earlyBirdDeadline)) {
          amount = program.earlyBirdPrice;
        }

        return { amount, currency, title: program.title, programId: program.id };
      }

      const program = enrolment.program;
      let amount = this.convertCurrencyAmount(currency, program.price, program.currency, program.priceINR, program.priceAED, program.priceUSD);

      if (enrolment.batch?.price) {
        amount = this.convertCurrencyAmount(currency, enrolment.batch.price, program.currency, enrolment.batch.priceINR, enrolment.batch.priceAED, enrolment.batch.priceUSD);
      }

      return { amount, currency, title: program.title, enrolmentId: enrolment.id, programId: program.id };
    }

    if (targetType === 'EVENT') {
      const event = await this.prisma.event.findFirst({
        where: { OR: [{ id: targetId }, { slug: targetId }] },
      });
      if (!event) throw new NotFoundException('Event not found');

      return {
        amount: Number(event.price),
        currency: (event.currency as SupportedCurrency) || currency,
        title: event.title,
        eventId: event.id,
      };
    }

    throw new BadRequestException('Invalid target type');
  }

  /**
   * Initializes a checkout order session via Payment Provider abstraction
   */
  async createCheckoutSession(dto: CreateCheckoutSessionDto, user?: any) {
    const pricing = await this.resolvePricing(dto.targetType, dto.targetId, dto.currency);
    let discountAmount = 0;
    let couponId: string | undefined = undefined;

    // Validate Coupon if provided
    if (dto.couponCode && this.couponsService) {
      try {
        const validated = await this.couponsService.validateCoupon({
          code: dto.couponCode,
          programId: (pricing as any).programId,
          currency: pricing.currency,
          userId: user?.sub || user?.id,
          paymentPlanType: 'FULL',
          amount: pricing.amount,
        });
        if (validated?.valid) {
          discountAmount = validated.discountAmount;
          couponId = validated.couponId;
        }
      } catch (err: any) {
        this.logger.warn(`Coupon validation skipped or failed: ${err?.message}`);
      }
    }

    const finalAmount = Math.max(0, Math.round((pricing.amount - discountAmount) * 100) / 100);

    // Minor-unit amount validation: reject underpayment and tampering
    if (dto.amount !== undefined) {
      const clientMinor = Math.round(Number(dto.amount) * 100);
      const expectedMinor = Math.round(finalAmount * 100);

      if (clientMinor < expectedMinor) {
        throw new BadRequestException(
          `Checkout amount underpayment rejected: expected ${finalAmount} ${pricing.currency}, received ${dto.amount} ${pricing.currency}`,
        );
      }
      if (Math.abs(clientMinor - expectedMinor) > 1) {
        throw new BadRequestException(
          `Checkout amount tampering detected: expected ${finalAmount} ${pricing.currency}, received ${dto.amount} ${pricing.currency}`,
        );
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TIER 1: MULTIPLE PAYMENT AVOIDANCE FOR SAME COURSE
    // ─────────────────────────────────────────────────────────────────────────
    const targetUserId = user?.sub || user?.id;
    if (dto.targetType === 'ENROLMENT' && targetUserId) {
      const progId = (pricing as any).programId;
      if (progId) {
        const existingEnrolment = await this.prisma.enrolment.findFirst({
          where: {
            userId: targetUserId,
            programId: progId,
            status: {
              in: [EnrolmentStatus.ACTIVE, EnrolmentStatus.COMPLETED, EnrolmentStatus.PENDING_AGREEMENT],
            },
          },
          include: {
            payments: { where: { status: 'succeeded' } },
          },
        });

        if (existingEnrolment && existingEnrolment.payments.length > 0) {
          this.logger.warn(
            `[Duplicate Payment Blocked] User ${targetUserId} attempted to initiate duplicate checkout for already paid program ${progId}`
          );
          throw new BadRequestException({
            statusCode: 400,
            error: 'ALREADY_ENROLLED',
            message: 'You have already enrolled and completed payment for this course. Duplicate payment is blocked.',
            programId: progId,
            enrolmentId: existingEnrolment.id,
            status: existingEnrolment.status,
            dashboardUrl: `/programs/${progId}/steps`,
          });
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TIER 2: IN-FLIGHT SESSION DE-DUPLICATION (EXPIRE STALE OPEN SESSIONS)
    // ─────────────────────────────────────────────────────────────────────────
    const targetEnrolmentId = dto.enrolmentId || (pricing as any).enrolmentId || (dto.targetType === 'ENROLMENT' ? dto.targetId : undefined);
    if (targetEnrolmentId && this.stripeProvider?.expireSession) {
      try {
        const stalePendingPayment = await this.prisma.payment.findFirst({
          where: {
            enrolmentId: targetEnrolmentId,
            status: 'pending',
            createdAt: { gt: new Date(Date.now() - 15 * 60 * 1000) },
          },
          orderBy: { createdAt: 'desc' },
        });

        if (stalePendingPayment && stalePendingPayment.stripeSessionId.startsWith('cs_')) {
          await this.stripeProvider.expireSession(stalePendingPayment.stripeSessionId).catch(() => {});
        }
      } catch (err: any) {
        this.logger.warn(`Could not expire prior stale session: ${err?.message}`);
      }
    }

    const provider = this.getActiveProvider();
    const orderResult = await provider.createOrder({
      amount: finalAmount,
      currency: pricing.currency,
      targetType: dto.targetType,
      targetId: dto.targetId,
      userId: user?.sub || user?.id,
      customerEmail: dto.attendeeEmail || user?.email || '',
      customerName: dto.attendeeName || user?.name || '',
      customerPhone: dto.attendeePhone || user?.phone || '',
      idempotencyKey: dto.idempotencyKey,
      metadata: {
        title: pricing.title,
        originalAmount: pricing.amount,
        baseAmountUSD: (pricing as any).amount,
        enrolmentId: dto.enrolmentId || (pricing as any).enrolmentId,
        discountAmount,
        couponCode: dto.couponCode,
        couponId,
      },
    });

    // Ledger pending payment row in database to guarantee tracking
    if (orderResult.orderId && !orderResult.simulationBypass) {
      const eid = dto.enrolmentId || (pricing as any).enrolmentId || (dto.targetType === 'ENROLMENT' ? dto.targetId : undefined);
      await this.prisma.payment.create({
        data: {
          enrolmentId: eid || null,
          stripeSessionId: orderResult.orderId,
          amount: finalAmount,
          currency: pricing.currency,
          status: 'pending',
          couponCode: dto.couponCode || null,
          discountAmount,
          idempotencyKey: dto.idempotencyKey || null,
        },
      }).catch((err) => {
        this.logger.warn(`Could not ledger pending payment row: ${err?.message}`);
      });
    }

    return {
      ...orderResult,
      title: pricing.title,
      currencySymbol: getCurrencySymbol(pricing.currency),
      discountAmount,
    };
  }

  /**
   * Core Test-Bypass Webhook Simulator
   * Critical Rule: Executes an atomic transaction on the backend simulating server-to-server webhook.
   */
  async simulateTestWebhook(dto: TestSimulateWebhookDto, clientIp: string = '127.0.0.1') {
    const currency: SupportedCurrency = dto.currency || 'USD';
    const currencySymbol = getCurrencySymbol(currency);
    const idempotencyKey = dto.idempotencyKey || `idem_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;

    this.logger.log(
      `[simulateTestWebhook] Received simulation call from ${clientIp} for ${dto.targetType} (Status: ${dto.status}, Currency: ${currency})`
    );

    // ─────────────────────────────────────────────────────────────────────────
    // A. COURSE ENROLMENT SIMULATION
    // ─────────────────────────────────────────────────────────────────────────
    if (dto.targetType === 'ENROLMENT') {
      const targetId = dto.enrolmentId || dto.targetId;
      if (!targetId) {
        throw new BadRequestException('enrolmentId or targetId is required for ENROLMENT simulation');
      }

      const enrolment = await this.prisma.enrolment.findUnique({
        where: { id: targetId },
        include: {
          program: true,
          batch: true,
          user: true,
          signedAgreement: true,
          payments: { include: { invoice: true } },
        },
      });

      if (!enrolment) {
        throw new NotFoundException(`Enrolment '${targetId}' not found`);
      }

      if (enrolment.status === EnrolmentStatus.REVOKED) {
        throw new BadRequestException('Cannot simulate payment for a revoked enrolment');
      }

      // Check Idempotency: suppress duplicate processing if the EXACT same idempotencyKey was already recorded
      const existingSuccess = dto.idempotencyKey
        ? enrolment.payments.find(
            (p) => p.status === 'succeeded' && p.idempotencyKey === dto.idempotencyKey
          )
        : null;

      if (existingSuccess && dto.status === 'PAID') {
        this.logger.log(`[Idempotent Bypass] Enrolment ${enrolment.id} already has a succeeded payment for key ${dto.idempotencyKey}.`);
        return {
          success: true,
          idempotent: true,
          status: 'PAID',
          enrolmentStatus: enrolment.status,
          enrolmentId: enrolment.id,
          paymentId: existingSuccess.id,
          invoiceNumber: existingSuccess.invoice?.invoiceNumber || null,
          invoiceUrl: existingSuccess.invoice ? `/api/invoices/${existingSuccess.invoice.id}/pdf` : null,
          message: 'Payment already processed and verified idempotently.',
        };
      }

      // Handle Failed Simulation
      if (dto.status === 'FAILED') {
        const failedPayment = await this.prisma.payment.create({
          data: {
            enrolmentId: enrolment.id,
            stripeSessionId: `fail_${Date.now()}_${enrolment.id.slice(0, 8)}`,
            amount: dto.amount || enrolment.program.price,
            currency,
            status: 'failed',
            idempotencyKey,
          },
        });

        return {
          success: false,
          status: 'FAILED',
          enrolmentId: enrolment.id,
          paymentId: failedPayment.id,
          enrolmentStatus: enrolment.status,
          message: dto.failureReason || 'Simulated payment was declined or aborted.',
        };
      }

      // Handle Success Simulation:
      // Agreement pre-condition: if agreement is signed -> ACTIVE, else PENDING_AGREEMENT
      const isSigned = enrolment.signedAgreement && enrolment.signedAgreement.status === AgreementStatus.SIGNED;
      let targetEnrolmentStatus: EnrolmentStatus;
      if (enrolment.status === EnrolmentStatus.WAITLIST) {
        targetEnrolmentStatus = EnrolmentStatus.WAITLIST;
      } else {
        const batch = enrolment.batchId
          ? await this.prisma.batch.findUnique({
              where: { id: enrolment.batchId },
              include: {
                _count: {
                  select: {
                    enrolments: {
                      where: {
                        id: { not: enrolment.id },
                        status: { in: [EnrolmentStatus.ACTIVE, EnrolmentStatus.PENDING_AGREEMENT, EnrolmentStatus.COMPLETED] },
                      },
                    },
                  },
                },
              },
            })
          : null;

        const occupied = batch?._count?.enrolments ?? 0;
        const capacity = batch?.capacity ?? 50;
        const isFull = occupied >= capacity;
        const isDeadlinePassed = isRegistrationDeadlinePassed(batch?.registrationDeadline);



        if (isFull || isDeadlinePassed) {
          targetEnrolmentStatus = EnrolmentStatus.WAITLIST;
        } else {
          targetEnrolmentStatus = isSigned ? EnrolmentStatus.ACTIVE : EnrolmentStatus.PENDING_AGREEMENT;
        }
      }

      // 1. Authoritative Server-Side Program Price Resolution
      const program = enrolment.program;
      let authoritativePrice = this.convertCurrencyAmount(
        currency,
        program.price,
        program.currency,
        program.priceINR,
        program.priceAED,
        program.priceUSD,
      );

      if (enrolment.batch?.price) {
        authoritativePrice = this.convertCurrencyAmount(
          currency,
          enrolment.batch.price,
          program.currency,
          enrolment.batch.priceINR,
          enrolment.batch.priceAED,
          enrolment.batch.priceUSD,
        );
      }

      // Early-bird check
      if (program.earlyBirdPrice && program.earlyBirdDeadline && new Date() < new Date(program.earlyBirdDeadline)) {
        authoritativePrice = program.earlyBirdPrice;
      }

      // 2. Authoritative Coupon Discount Calculation
      let discount = 0;
      if (dto.couponCode && this.couponsService) {
        try {
          const couponValidation = await this.couponsService.validateCoupon({
            code: dto.couponCode,
            programId: program.id,
            currency,
            userId: enrolment.userId,
            paymentPlanType: 'FULL',
            amount: authoritativePrice,
          });
          if (couponValidation && typeof couponValidation.discountAmount === 'number') {
            discount = couponValidation.discountAmount;
          }
        } catch (couponErr: any) {
          this.logger.warn(`Coupon validation warning in simulation: ${couponErr?.message}`);
        }
      }

      const expectedPayable = Math.max(0, Math.round((authoritativePrice - discount) * 100) / 100);

      // 3. Amount Tampering & Underpayment Prevention Guard (Minor Units)
      if (dto.amount !== undefined) {
        const clientMinor = Math.round(Number(dto.amount) * 100);
        const expectedMinor = Math.round(expectedPayable * 100);

        if (clientMinor < expectedMinor) {
          throw new BadRequestException(
            `Payment underpayment rejected: expected ${expectedPayable} ${currency}, received ${dto.amount} ${currency}`,
          );
        }
        if (Math.abs(clientMinor - expectedMinor) > 1) {
          throw new BadRequestException(
            `Payment amount tampering detected: expected ${expectedPayable} ${currency}, received ${dto.amount} ${currency}`,
          );
        }
      }

      const baseAmount = authoritativePrice;
      const finalAmount = expectedPayable;

      // Calculate tax breakdown for WhatBoutMe FZE:
      // UAE VAT: 5% on AED; India GST: 18% on INR; International: 0%
      let taxType: 'UAE_VAT' | 'INDIA_GST' | 'NONE' = 'NONE';
      let taxRate = 0;
      if (currency === 'AED') {
        taxType = 'UAE_VAT';
        taxRate = 5;
      } else if (currency === 'INR') {
        taxType = 'INDIA_GST';
        taxRate = 18;
      }
      const taxAmount = taxRate > 0 ? Math.round(((finalAmount * taxRate) / (100 + taxRate)) * 100) / 100 : 0;
      const subtotal = Math.round((finalAmount - taxAmount) * 100) / 100;
      const totalInvoiceAmount = finalAmount;

      const invoiceNumber = `INV-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;

      // Execute Atomic Database Mutation
      const result = await this.prisma.$transaction(async (tx) => {
        // 1. Update Enrolment Status
        const updatedEnrolment = await tx.enrolment.update({
          where: { id: enrolment.id },
          data: { status: targetEnrolmentStatus },
        });

        // 2. Create Payment Record
        const payment = await tx.payment.create({
          data: {
            enrolmentId: enrolment.id,
            stripeSessionId: `sim_pay_${Date.now()}_${enrolment.id.slice(0, 8)}`,
            amount: totalInvoiceAmount,
            currency,
            status: 'succeeded',
            couponCode: dto.couponCode || null,
            discountAmount: discount,
            idempotencyKey,
          },
        });

        // 3. Create Numbered WhatBoutMe FZE Invoice
        const invoice = await tx.invoice.create({
          data: {
            paymentId: payment.id,
            enrolmentId: enrolment.id,
            invoiceNumber,
            amount: totalInvoiceAmount,
            currency,
            couponCode: dto.couponCode || null,
            discountAmount: discount,
            status: InvoiceStatus.PAID,
            taxFields: {
              company: 'WhatBoutMe FZE',
              trn: '10049281900003',
              location: 'Dubai Silicon Oasis, Dubai, UAE',
              taxType,
              taxRate,
              taxAmount,
              subtotal: subtotal,
              discount,
              total: totalInvoiceAmount,
              currencySymbol,
            },
            pdfUrl: `/api/invoices/${payment.id}/pdf`,
          },
        });

        // 4. Audit Log
        if (tx.auditLog?.create) {
          await tx.auditLog.create({
            data: {
              actorId: enrolment.userId,
              action: 'PAYMENT_TEST_SIMULATE_SUCCEEDED',
              entity: 'Payment',
              entityId: payment.id,
              meta: {
                invoiceNumber,
                amount: totalInvoiceAmount,
                currency,
                enrolmentId: enrolment.id,
                targetStatus: targetEnrolmentStatus,
                isSigned,
              },
            },
          });
        }

        return { updatedEnrolment, payment, invoice };
      });

      // Clear Caches
      if (this.cacheHelper) {
        await this.cacheHelper.invalidateNamespace(`enrolment_progression:${enrolment.id}`).catch(() => {});
        await this.cacheHelper.invalidateNamespace('enrolments').catch(() => {});
        await this.cacheHelper.invalidateNamespace('invoices').catch(() => {});
        await this.cacheHelper.invalidateNamespace('revenue').catch(() => {});
      }

      // Send Emails
      if (this.emailService && enrolment.user?.email) {
        const { lmsUrl } = getAppUrls();
        try {
          await this.emailService.sendTemplateEmail({
            to: enrolment.user.email,
            subject: `Payment Successful - ${enrolment.program.title} (${invoiceNumber})`,
            template: 'PaymentSuccessEmail',
            props: {
              learnerName: enrolment.user.name,
              programTitle: enrolment.program.title,
              amount: totalInvoiceAmount,
              currencySymbol,
              invoiceNumber,
              dashboardUrl: `${lmsUrl}/dashboard`,
            },
          });
        } catch (e: any) {
          this.logger.warn(`Email delivery warning: ${e?.message}`);
        }
      }

      return {
        success: true,
        status: 'PAID',
        enrolmentStatus: targetEnrolmentStatus,
        enrolmentId: enrolment.id,
        paymentId: result.payment.id,
        invoiceNumber,
        invoiceId: result.invoice.id,
        invoicePdfUrl: `/api/invoices/${result.invoice.id}/pdf`,
        amount: totalInvoiceAmount,
        currency,
        currencySymbol,
        isSigned,
        message: isSigned
          ? 'Payment confirmed and verified. Full course access is now unlocked.'
          : 'Payment captured. Learner must complete the digital agreement gate before Step 1 unlocks.',
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // B. EVENT REGISTRATION SIMULATION
    // ─────────────────────────────────────────────────────────────────────────
    if (dto.targetType === 'EVENT') {
      const targetId = dto.registrationId || dto.targetId || dto.eventId;
      if (!targetId) {
        throw new BadRequestException('registrationId or eventId required for EVENT simulation');
      }

      let registration = await this.prisma.eventRegistration.findFirst({
        where: {
          OR: [{ id: targetId }, { gatewayOrderId: targetId }],
        },
        include: { event: true, user: true },
      });

      // If registration does not exist yet, find the event and create a registration record
      if (!registration) {
        const event = await this.prisma.event.findFirst({
          where: { OR: [{ id: targetId }, { slug: targetId }] },
        });

        if (!event) {
          throw new NotFoundException(`Event '${targetId}' not found`);
        }

        const attendeeName = dto.attendeeName || 'Event Guest';
        const attendeeEmail = (dto.attendeeEmail || 'guest@whatboutme.com').toLowerCase();
        const attendeePhone = dto.attendeePhone || '+971 50 000 0000';

        registration = await this.prisma.eventRegistration.create({
          data: {
            eventId: event.id,
            attendeeName,
            attendeeEmail,
            attendeePhone,
            amount: event.price,
            currency: (event.currency as SupportedCurrency) || currency,
            paymentGateway: 'SIMULATION',
            gatewayOrderId: `sim_ord_${Date.now()}`,
            paymentStatus: EventPaymentStatus.PENDING,
          },
          include: { event: true, user: true },
        });
      }

      // Check Idempotency
      if (registration.paymentStatus === EventPaymentStatus.PAID && dto.status === 'PAID') {
        return {
          success: true,
          idempotent: true,
          status: 'PAID',
          registrationId: registration.id,
          eventId: registration.eventId,
          meetingLink: registration.event.locationType === 'ONLINE' ? registration.event.meetingLink : null,
          venueName: registration.event.venueName,
          venueAddress: registration.event.venueAddress,
          message: 'Event registration was already paid and confirmed.',
        };
      }

      if (dto.status === 'FAILED') {
        await this.prisma.eventRegistration.update({
          where: { id: registration.id },
          data: { paymentStatus: EventPaymentStatus.FAILED },
        });
        return {
          success: false,
          status: 'FAILED',
          registrationId: registration.id,
          message: dto.failureReason || 'Event payment simulation failed or was cancelled.',
        };
      }

      const eventPrice = Number(registration.amount);
      if (dto.currency && registration.currency && dto.currency !== registration.currency) {
        throw new BadRequestException(
          `Currency mismatch: event registration is in ${registration.currency} but received ${dto.currency}`,
        );
      }

      if (dto.amount !== undefined) {
        const clientMinor = Math.round(Number(dto.amount) * 100);
        const expectedMinor = Math.round(eventPrice * 100);

        if (clientMinor < expectedMinor) {
          throw new BadRequestException(
            `Event payment underpayment rejected: expected ${eventPrice} ${registration.currency}, received ${dto.amount} ${registration.currency}`,
          );
        }
        if (Math.abs(clientMinor - expectedMinor) > 1) {
          throw new BadRequestException(
            `Event payment amount tampering detected: expected ${eventPrice} ${registration.currency}, received ${dto.amount} ${registration.currency}`,
          );
        }
      }
      const invoiceNumber = `INV-EVT-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;

      // Atomic Confirmation
      const result = await this.prisma.$transaction(async (tx) => {
        // 1. Mark registration paid
        const updatedReg = await tx.eventRegistration.update({
          where: { id: registration.id },
          data: {
            paymentStatus: EventPaymentStatus.PAID,
            gatewayPaymentId: `sim_pay_${Date.now()}`,
          },
        });

        // 2. Increment seats booked
        await tx.event.update({
          where: { id: registration.eventId },
          data: { seatsBooked: { increment: 1 } },
        });

        const eventCurr = (registration.currency || 'USD').toUpperCase();
        let evtTaxType: 'UAE_VAT' | 'INDIA_GST' | 'NONE' = 'NONE';
        let evtTaxRate = 0;
        if (eventCurr === 'AED') {
          evtTaxType = 'UAE_VAT';
          evtTaxRate = 5;
        } else if (eventCurr === 'INR') {
          evtTaxType = 'INDIA_GST';
          evtTaxRate = 18;
        }
        const evtTaxAmount = evtTaxRate > 0 ? Math.round(((eventPrice * evtTaxRate) / (100 + evtTaxRate)) * 100) / 100 : 0;
        const evtSubtotal = Math.round((eventPrice - evtTaxAmount) * 100) / 100;

        // 3. Create WhatBoutMe FZE Invoice
        const invoice = await tx.invoice.create({
          data: {
            eventRegistrationId: registration.id,
            invoiceNumber,
            amount: eventPrice,
            currency: registration.currency,
            status: InvoiceStatus.PAID,
            taxFields: {
              company: 'WhatBoutMe FZE',
              trn: '10049281900003',
              eventTitle: registration.event.title,
              attendeeName: registration.attendeeName,
              currencySymbol,
              taxType: evtTaxType,
              taxRate: evtTaxRate,
              taxAmount: evtTaxAmount,
              subtotal: evtSubtotal,
              total: eventPrice,
            },
            pdfUrl: `/api/invoices/${registration.id}/pdf`,
          },
        });

        return { updatedReg, invoice };
      });

      // Clear caches
      if (this.cacheHelper) {
        await this.cacheHelper.invalidateNamespace('events').catch(() => {});
        await this.cacheHelper.invalidateNamespace('invoices').catch(() => {});
        await this.cacheHelper.invalidateNamespace('revenue').catch(() => {});
      }

      return {
        success: true,
        status: 'PAID',
        registrationId: registration.id,
        eventId: registration.eventId,
        invoiceNumber,
        invoiceId: result.invoice.id,
        meetingLink: registration.event.locationType === 'ONLINE' ? registration.event.meetingLink : null,
        venueName: registration.event.venueName,
        venueAddress: registration.event.venueAddress,
        message: 'Event registration confirmed successfully with verified invoice.',
      };
    }

    throw new BadRequestException(`Unsupported targetType: ${dto.targetType}`);
  }

  /**
   * Synchronous Session Status Check & Dual-Path Fallback
   * Prevents learner lockout if Stripe redirect completes before webhook delivers.
   */
  async getSessionStatus(sessionId: string) {
    if (!sessionId) {
      throw new BadRequestException('sessionId is required');
    }

    const payment = await this.prisma.payment.findUnique({
      where: { stripeSessionId: sessionId },
      include: {
        enrolment: {
          include: { program: true, signedAgreement: true },
        },
        invoice: true,
      },
    });

    if (payment && payment.status === 'succeeded') {
      const isSigned = payment.enrolment?.signedAgreement?.status === AgreementStatus.SIGNED;
      return {
        status: 'PAID',
        enrolmentId: payment.enrolmentId,
        enrolmentStatus: payment.enrolment?.status,
        programId: payment.enrolment?.programId,
        programTitle: payment.enrolment?.program?.title,
        isSigned,
        invoiceNumber: payment.invoice?.invoiceNumber || null,
        invoiceUrl: payment.invoice ? `/api/invoices/${payment.invoice.id}/pdf` : null,
        amount: payment.amount,
        currency: payment.currency,
        currencySymbol: getCurrencySymbol(payment.currency),
      };
    }

    // Dual-path fallback: If still pending and using Stripe, check live session from Stripe API
    if (this.activeProviderType === 'STRIPE' && this.stripeProvider.retrieveSession) {
      const stripeSession = await this.stripeProvider.retrieveSession(sessionId);
      if (stripeSession && stripeSession.payment_status === 'paid') {
        this.logger.log(`[Dual-Path Fallback] Reconciling paid Stripe session ${sessionId} synchronously.`);
        const simulated = await this.simulateTestWebhook({
          targetType: (stripeSession.metadata?.targetType as any) || 'ENROLMENT',
          targetId: stripeSession.metadata?.targetId,
          enrolmentId: stripeSession.metadata?.enrolmentId || payment?.enrolmentId || undefined,
          status: 'PAID',
          amount: (stripeSession.amount_total || 0) / 100,
          currency: (stripeSession.currency || 'USD').toUpperCase() as SupportedCurrency,
          couponCode: stripeSession.metadata?.couponCode,
          idempotencyKey: stripeSession.metadata?.idempotencyKey,
        });

        return {
          ...simulated,
          status: 'PAID',
        };
      }
    }

    return {
      status: payment?.status ? payment.status.toUpperCase() : 'PENDING',
      orderId: sessionId,
      enrolmentId: payment?.enrolmentId,
    };
  }
}
