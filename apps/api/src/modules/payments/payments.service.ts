import * as crypto from 'crypto';
import { getAppUrls } from '../../common/config/app-urls.js';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
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
  PaymentTargetType,
  SupportedCurrency,
} from './interfaces/payment.interfaces.js';
import { TestSimulateWebhookDto } from './dto/test-simulate-webhook.dto.js';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto.js';
import { CacheHelperService } from '../../common/cache/cache-helper.service.js';
import { EmailService } from '../email/email.service.js';
import { CouponsService } from '../coupons/coupons.service.js';
import { SeatPoolsService } from '../organizations/seat-pools.service.js';
import { InvoicePdfService } from '../invoices/invoice-pdf.service.js';
import { isRegistrationDeadlinePassed } from '../../common/utils/deadline.util.js';
import { generateSequentialInvoiceNumber } from '../../common/utils/invoice-number.util.js';
import { isUUID } from 'class-validator';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

export function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && isUUID(value);
}

function isValidSlug(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 && SLUG_PATTERN.test(value);
}

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
  private activeProviderType: PaymentProviderType = 'STRIPE';

  constructor(
    private readonly prisma: PrismaService,
    private readonly mockProvider: MockTestPaymentProvider,
    private readonly razorpayProvider: RazorpayPaymentProvider,
    private readonly stripeProvider: StripePaymentProvider,
    private readonly invoicePdfService: InvoicePdfService,
    @Optional() private readonly cacheHelper?: CacheHelperService,
    @Optional() private readonly emailService?: EmailService,
    @Optional() private readonly couponsService?: CouponsService,
    @Optional() private readonly seatPoolsService?: SeatPoolsService,
  ) {
    this.providers.set('MOCK_TEST', this.mockProvider);
    this.providers.set('RAZORPAY', this.razorpayProvider);
    this.providers.set('STRIPE', this.stripeProvider);

    const envProvider = (process.env.PAYMENT_PROVIDER || 'STRIPE').toUpperCase() as PaymentProviderType;
    if (this.providers.has(envProvider)) {
      this.activeProviderType = envProvider;
    } else {
      this.activeProviderType = 'STRIPE';
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
    if (targetCurrency === 'INR' && pInr && Number(pInr) > 0) return Math.round(Number(pInr) * 100) / 100;
    if (targetCurrency === 'AED' && pAed && Number(pAed) > 0) return Math.round(Number(pAed) * 100) / 100;
    if (targetCurrency === 'USD' && pUsd && Number(pUsd) > 0) return Math.round(Number(pUsd) * 100) / 100;

    const origCurrency = (pCurrency || 'USD').toUpperCase();
    const numBase = Number(base) || 0;

    // If source and target currency match, keep exact 2-decimal precision (e.g. 9.95 USD)
    if (origCurrency === targetCurrency) {
      return Math.round(numBase * 100) / 100;
    }

    let inUSD = numBase;
    if (origCurrency === 'INR') inUSD = inUSD / 83;
    else if (origCurrency === 'AED') inUSD = inUSD / 3.67;

    if (targetCurrency === 'INR') return Math.round(inUSD * 83);
    if (targetCurrency === 'AED') return Math.round(inUSD * 3.67);
    return Math.round(inUSD);
  }

  private computeAuthoritativeProgramPrice(
    program: any,
    batch: any | null | undefined,
    currency: SupportedCurrency,
  ): number {
    let amount = this.convertCurrencyAmount(
      currency,
      program.price,
      program.currency,
      program.priceINR,
      program.priceAED,
      program.priceUSD,
    );

    // Program early-bird check: convert from earlyBirdCurrency || program.currency
    if (
      program.earlyBirdPrice != null &&
      Number(program.earlyBirdPrice) > 0 &&
      program.earlyBirdDeadline &&
      new Date() < new Date(program.earlyBirdDeadline)
    ) {
      const earlyBirdSourceCurrency = program.earlyBirdCurrency || program.currency || 'USD';
      amount = this.convertCurrencyAmount(
        currency,
        Number(program.earlyBirdPrice),
        earlyBirdSourceCurrency,
      );
    }

    // Batch-specific price override takes precedence when configured
    if (batch?.price != null && Number(batch.price) > 0) {
      const batchSourceCurrency = batch.currency || program.currency || 'USD';
      amount = this.convertCurrencyAmount(
        currency,
        Number(batch.price),
        batchSourceCurrency,
        batch.priceINR,
        batch.priceAED,
        batch.priceUSD,
      );
    }

    // Batch-specific early-bird check when configured
    if (
      batch?.earlyBirdPrice != null &&
      Number(batch.earlyBirdPrice) > 0 &&
      batch.earlyBirdDeadline &&
      new Date() < new Date(batch.earlyBirdDeadline)
    ) {
      const batchEbSourceCurrency = batch.earlyBirdCurrency || batch.currency || program.currency || 'USD';
      amount = this.convertCurrencyAmount(
        currency,
        Number(batch.earlyBirdPrice),
        batchEbSourceCurrency,
      );
    }

    return amount;
  }

  /**
   * Generates or validates price for course, event, or organization seat pool in the requested currency
   */
  async resolvePricing(
    targetType: PaymentTargetType,
    targetId: string,
    requestedCurrency?: SupportedCurrency,
    enrolmentId?: string,
  ) {
    const currency: SupportedCurrency = requestedCurrency || 'USD';

    if (targetType === 'SEAT_POOL') {
      let pool: any = null;
      if (isValidUuid(targetId)) {
        pool = await this.prisma.seatPool.findUnique({
          where: { id: targetId },
          include: { program: true, batch: true, organization: true },
        });
      }
      if (!pool) {
        pool = await this.prisma.seatPool.findFirst({
          where: { poolCode: targetId },
          include: { program: true, batch: true, organization: true },
        });
      }
      if (!pool) throw new NotFoundException('Seat pool not found');

      if (pool.status === 'ACTIVE') {
        throw new BadRequestException('This seat pool is already active and paid.');
      }
      if (pool.status === 'REJECTED' || pool.status === 'CANCELLED') {
        throw new BadRequestException('Cannot pay for a cancelled or rejected seat pool.');
      }

      const poolCurrency = (pool.currency || 'USD') as SupportedCurrency;
      const amount = Number(pool.netAmount);

      return {
        amount,
        currency: poolCurrency,
        title: `${pool.program?.title || 'Corporate Seats'} (${pool.totalSeats} seats)`,
        batchName: pool.batch?.name || '',
        totalSeats: pool.totalSeats,
        organizationId: pool.organizationId,
        billingEmail: pool.organization?.billingEmail || pool.organization?.contactEmail || '',
        poolId: pool.id,
        poolCode: pool.poolCode,
      };
    }

    if (targetType === 'ENROLMENT') {
      let enrolment: any = null;

      if (enrolmentId !== undefined && enrolmentId !== null && String(enrolmentId).trim() !== '') {
        if (!isValidUuid(enrolmentId)) {
          throw new BadRequestException('Invalid enrolmentId: must be a valid UUID');
        }
        enrolment = await this.prisma.enrolment.findUnique({
          where: { id: enrolmentId },
          include: { program: true, batch: true },
        });
        if (!enrolment) {
          throw new NotFoundException('Enrolment not found');
        }
        if (
          targetId &&
          targetId !== enrolment.id &&
          targetId !== enrolment.programId &&
          targetId !== enrolment.program?.slug
        ) {
          throw new BadRequestException('Target program does not match the specified enrolment');
        }
      } else {
        if (!targetId || typeof targetId !== 'string' || !targetId.trim()) {
          throw new BadRequestException('targetId is required');
        }

        if (isValidUuid(targetId)) {
          enrolment = await this.prisma.enrolment.findUnique({
            where: { id: targetId },
            include: { program: true, batch: true },
          });
        }

        if (!enrolment) {
          let program: any = null;
          if (isValidUuid(targetId)) {
            program = await this.prisma.program.findUnique({ where: { id: targetId } });
          } else if (isValidSlug(targetId)) {
            program = await this.prisma.program.findUnique({ where: { slug: targetId } });
          } else {
            throw new BadRequestException('Invalid targetId: must be a valid UUID or program slug');
          }

          if (!program) throw new NotFoundException('Program or Enrolment not found');

          const amount = this.computeAuthoritativeProgramPrice(program, null, currency);
          return { amount, currency, title: program.title, programId: program.id };
        }
      }

      const program = enrolment.program;
      if (!program) throw new NotFoundException('Program or Enrolment not found');

      const amount = this.computeAuthoritativeProgramPrice(program, enrolment.batch, currency);
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
  async createCheckoutSession(dto: CreateCheckoutSessionDto, user ?: any, req ?: any) {
      const rawOrigin =
        dto.origin ||
        (req?.headers ? (req.headers['origin'] || req.headers['referer']) : undefined);
      const safeOrigin = typeof rawOrigin === 'string' ? rawOrigin : undefined;
      const pricing = await this.resolvePricing(dto.targetType, dto.targetId, dto.currency, dto.enrolmentId);
      let discountAmount = 0;
      let couponId: string | undefined = undefined;

      // Validate Coupon if provided
      const cleanCouponCode = dto.couponCode ? dto.couponCode.trim().toUpperCase().replace(/\s+/g, '-') : undefined;
      if (cleanCouponCode && this.couponsService) {
        try {
          const validated = await this.couponsService.validateCoupon({
            code: cleanCouponCode,
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
      let targetUserId = user?.sub || user?.id;
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

      // Ownership Authorization Check: Organization Seat Pool
      if (dto.targetType === 'SEAT_POOL') {
        const poolOrgId = (pricing as any).organizationId;
        const isStaff = user?.role === Role.ADMIN || user?.role === Role.SUPER_ADMIN;
        if (!isStaff && targetUserId && poolOrgId) {
          const membership = await this.prisma.organizationMember.findFirst({
            where: {
              organizationId: poolOrgId,
              userId: targetUserId,
              status: 'ACTIVE',
            },
          });
          if (!membership) {
            this.logger.warn(
              `[Unauthorized Checkout Blocked] User ${targetUserId} attempted to initiate checkout for organization ${poolOrgId}`
            );
            throw new ForbiddenException('You are not authorized to initiate checkout for this organization.');
          }
        }
      }

      // ─────────────────────────────────────────────────────────────────────────
      // TIER 2: IN-FLIGHT SESSION DE-DUPLICATION (EXPIRE STALE OPEN SESSIONS)
      // ─────────────────────────────────────────────────────────────────────────
      let targetEnrolmentId: string | undefined =
        (pricing as any).enrolmentId || (isValidUuid(dto.enrolmentId) ? dto.enrolmentId : undefined);

      let isLeadLinkAuthorized = false;
      if (dto.leadToken) {
        const tokenHash = crypto.createHash('sha256').update(dto.leadToken.trim()).digest('hex');
        const leadLink = await this.prisma.leadCheckoutLink.findUnique({
          where: { tokenHash },
        });
        if (!leadLink || leadLink.usedAt || leadLink.revokedAt || leadLink.expiresAt < new Date()) {
          throw new BadRequestException('This lead checkout link is invalid or has expired.');
        }
        targetEnrolmentId = leadLink.enrolmentId;
        targetUserId = leadLink.userId;
        isLeadLinkAuthorized = true;
      }

      // Ownership Authorization Check: Prevent User A from initiating payment on User B's enrolment
      if (dto.targetType === 'ENROLMENT' && targetEnrolmentId && isValidUuid(targetEnrolmentId)) {
        const targetEnrol = await this.prisma.enrolment.findUnique({
          where: { id: targetEnrolmentId },
          select: { id: true, userId: true },
        });
        if (targetEnrol && targetEnrol.userId) {
          const isStaff = user?.role === Role.ADMIN || user?.role === Role.SUPER_ADMIN;
          if (!isLeadLinkAuthorized && targetUserId && targetEnrol.userId !== targetUserId && !isStaff) {
            this.logger.warn(
              `[Unauthorized Checkout Blocked] User ${targetUserId} attempted to initiate checkout for enrollment ${targetEnrolmentId} owned by ${targetEnrol.userId}`
            );
            throw new ForbiddenException('You are not authorized to initiate checkout for this enrollment.');
          }
        }
      }

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
            await this.stripeProvider.expireSession(stalePendingPayment.stripeSessionId).catch(() => { });
          }
        } catch (err: any) {
          this.logger.warn(`Could not expire prior stale session: ${err?.message}`);
        }
      }

      if (finalAmount <= 0) {
        const freeSessionId = `free_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
        await this.simulateTestWebhook({
          targetType: dto.targetType,
          targetId: dto.targetId,
          enrolmentId: targetEnrolmentId,
          status: 'PAID',
          amount: 0,
          currency: pricing.currency,
          couponCode: cleanCouponCode,
          idempotencyKey: dto.idempotencyKey || `idem_${freeSessionId}`,
          stripeSessionId: freeSessionId,
        });

        const { lmsUrl, adminUrl, marketingUrl } = getAppUrls(safeOrigin || dto.returnUrl);
        const isSeatPool = dto.targetType === 'SEAT_POOL';
        const isEvent = dto.targetType === 'EVENT';
        const freeCheckoutUrl = dto.returnUrl
          ? (dto.returnUrl.includes('{CHECKOUT_SESSION_ID}')
            ? dto.returnUrl.replace('{CHECKOUT_SESSION_ID}', freeSessionId)
            : `${dto.returnUrl}${dto.returnUrl.includes('?') ? '&' : '?'}session_id=${freeSessionId}`)
          : (isSeatPool
            ? `${adminUrl}/users/organizations/${(pricing as any).organizationId || ''}?tab=pools&paid=1&session_id=${freeSessionId}&poolId=${dto.targetId}`
            : isEvent
              ? `${marketingUrl}/events/${dto.targetId}?session_id=${freeSessionId}&registered=1`
              : `${lmsUrl}/checkout/success?session_id=${freeSessionId}`);

        return {
          provider: 'STRIPE',
          orderId: freeSessionId,
          amount: 0,
          currency: pricing.currency,
          status: 'PAID',
          checkoutUrl: freeCheckoutUrl,
          simulationBypass: true,
          title: pricing.title,
          currencySymbol: getCurrencySymbol(pricing.currency),
          discountAmount,
        };
      }

      const provider = this.getActiveProvider();
      const orderResult = await provider.createOrder({
        amount: finalAmount,
        currency: pricing.currency,
        targetType: dto.targetType,
        targetId: dto.targetId,
        userId: user?.sub || user?.id,
        customerEmail: dto.attendeeEmail || user?.email || (pricing as any).billingEmail || '',
        customerName: dto.attendeeName || user?.name || '',
        customerPhone: dto.attendeePhone || user?.phone || '',
        idempotencyKey: dto.idempotencyKey,
        origin: safeOrigin,
        returnUrl: dto.returnUrl,
        cancelUrl: dto.cancelUrl,
        metadata: {
          title: pricing.title,
          originalAmount: pricing.amount,
          baseAmountUSD: pricing.currency === 'USD' ? finalAmount : undefined,
          enrolmentId: targetEnrolmentId,
          organizationId: (pricing as any).organizationId,
          poolId: (pricing as any).poolId,
          poolCode: (pricing as any).poolCode,
          totalSeats: (pricing as any).totalSeats,
          batchName: (pricing as any).batchName,
          discountAmount,
          couponCode: cleanCouponCode,
          couponId,
        },
      });

      // Ledger pending payment row in database to guarantee tracking
      if (orderResult.orderId && !orderResult.simulationBypass) {
        const candidateEid = targetEnrolmentId;
        let validEnrolmentId: string | null = null;
        if (candidateEid && isValidUuid(candidateEid)) {
          const checkEnrol = await this.prisma.enrolment.findUnique({
            where: { id: candidateEid },
            select: { id: true },
          }).catch(() => null);
          if (checkEnrol) validEnrolmentId = checkEnrol.id;
        }

        const targetPoolId =
          dto.targetType === 'SEAT_POOL'
            ? ((pricing as any).poolId || (isValidUuid(dto.targetId) ? dto.targetId : null))
            : null;

        if (typeof (this.prisma.payment as any)?.upsert === 'function') {
          await this.prisma.payment.upsert({
            where: { stripeSessionId: orderResult.orderId },
            update: {
              enrolmentId: validEnrolmentId,
              seatPoolId: targetPoolId,
              amount: finalAmount,
              currency: pricing.currency,
              status: 'pending',
              couponCode: cleanCouponCode || null,
              discountAmount,
              idempotencyKey: dto.idempotencyKey || null,
            },
            create: {
              enrolmentId: validEnrolmentId,
              seatPoolId: targetPoolId,
              stripeSessionId: orderResult.orderId,
              amount: finalAmount,
              currency: pricing.currency,
              status: 'pending',
              couponCode: cleanCouponCode || null,
              discountAmount,
              idempotencyKey: dto.idempotencyKey || null,
            },
          }).catch((err) => {
            this.logger.warn(`Could not ledger pending payment row: ${err?.message}`);
          });
        } else if (typeof (this.prisma.payment as any)?.create === 'function') {
          await this.prisma.payment.create({
            data: {
              enrolmentId: validEnrolmentId,
              seatPoolId: targetPoolId,
              stripeSessionId: orderResult.orderId,
              amount: finalAmount,
              currency: pricing.currency,
              status: 'pending',
              couponCode: cleanCouponCode || null,
              discountAmount,
              idempotencyKey: dto.idempotencyKey || null,
            },
          }).catch((err) => {
            this.logger.warn(`Could not ledger pending payment row: ${err?.message}`);
          });
        }
      }

      if (orderResult.simulationBypass) {
        const simulatedSessionId = orderResult.orderId;
        await this.simulateTestWebhook({
          targetType: dto.targetType,
          targetId: dto.targetId,
          enrolmentId: targetEnrolmentId,
          poolId: (pricing as any).poolId,
          status: 'PAID',
          amount: finalAmount,
          currency: pricing.currency,
          couponCode: cleanCouponCode,
          idempotencyKey: dto.idempotencyKey || `idem_${simulatedSessionId}`,
          stripeSessionId: simulatedSessionId,
        });

        const { lmsUrl, marketingUrl, adminUrl } = getAppUrls();
        let simulatedRedirectUrl: string;
        if (dto.targetType === 'SEAT_POOL') {
          const poolOrgId = (pricing as any).organizationId;
          const targetPoolId = (pricing as any).poolId || dto.targetId;
          simulatedRedirectUrl = `${adminUrl}/users/organizations/${poolOrgId}?tab=pools&paid=1&session_id=${simulatedSessionId}&poolId=${targetPoolId}`;
        } else if (dto.targetType === 'EVENT') {
          simulatedRedirectUrl = `${marketingUrl}/events/${dto.targetId}?session_id=${simulatedSessionId}&registered=1`;
        } else {
          simulatedRedirectUrl = `${lmsUrl}/checkout/success?session_id=${simulatedSessionId}`;
        }

        return {
          ...orderResult,
          status: 'PAID',
          checkoutUrl: simulatedRedirectUrl,
          title: pricing.title,
          currencySymbol: getCurrencySymbol(pricing.currency),
          discountAmount,
        };
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
        if (
          dto.enrolmentId !== undefined &&
          dto.enrolmentId !== null &&
          String(dto.enrolmentId).trim() !== '' &&
          !isValidUuid(dto.enrolmentId)
        ) {
          throw new BadRequestException('Invalid enrolmentId: must be a valid UUID');
        }
        const targetId = dto.enrolmentId || dto.targetId;
        if (!targetId) {
          throw new BadRequestException('enrolmentId or targetId is required for ENROLMENT simulation');
        }
        if (!isValidUuid(targetId)) {
          throw new BadRequestException('Invalid enrolment ID: must be a valid UUID');
        }

        let enrolment = await this.prisma.enrolment.findUnique({
          where: { id: targetId },
          include: {
            program: true,
            batch: true,
            user: true,
            signedAgreement: true,
            payments: { include: { invoice: true } },
          },
        });

        if (!enrolment && !dto.enrolmentId && typeof this.prisma.enrolment?.findFirst === 'function') {
          enrolment = await this.prisma.enrolment.findFirst({
            where: {
              programId: targetId,
              ...(dto.userId ? { userId: dto.userId } : {}),
            },
            orderBy: { createdAt: 'desc' },
            include: {
              program: true,
              batch: true,
              user: true,
              signedAgreement: true,
              payments: { include: { invoice: true } },
            },
          });
        }

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
          let failedPayment: any = null;
          if (typeof this.prisma.payment?.findUnique === 'function') {
            if (idempotencyKey) {
              failedPayment = await this.prisma.payment.findUnique({ where: { idempotencyKey } });
            }
            if (!failedPayment && dto.stripeSessionId) {
              failedPayment = await this.prisma.payment.findUnique({ where: { stripeSessionId: dto.stripeSessionId } });
            }
          }

          if (failedPayment && typeof this.prisma.payment?.update === 'function') {
            failedPayment = await this.prisma.payment.update({
              where: { id: failedPayment.id },
              data: { status: 'failed' },
            });
          } else {
            failedPayment = await this.prisma.payment.create({
              data: {
                enrolmentId: enrolment.id,
                stripeSessionId: dto.stripeSessionId || `fail_${Date.now()}_${enrolment.id.slice(0, 8)}`,
                amount: dto.amount || enrolment.program.price,
                currency,
                status: 'failed',
                idempotencyKey,
              },
            });
          }

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
        const authoritativePrice = this.computeAuthoritativeProgramPrice(program, enrolment.batch, currency);

        // 2. Authoritative Coupon Discount Calculation
        let discount = 0;
        let appliedCouponId: string | undefined = undefined;
        const cleanCouponCode = dto.couponCode ? dto.couponCode.trim().toUpperCase().replace(/\s+/g, '-') : undefined;
        if (cleanCouponCode && this.couponsService) {
          try {
            const couponValidation = await this.couponsService.validateCoupon({
              code: cleanCouponCode,
              programId: program.id,
              currency,
              userId: enrolment.userId,
              paymentPlanType: 'FULL',
              amount: authoritativePrice,
            });
            if (couponValidation && typeof couponValidation.discountAmount === 'number') {
              discount = couponValidation.discountAmount;
              appliedCouponId = couponValidation.couponId;
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

        const invoiceNumber = await generateSequentialInvoiceNumber(this.prisma);

        // Execute Atomic Database Mutation
        const result = await this.prisma.$transaction(async (tx) => {
          // 1. Update Enrolment Status
          const updatedEnrolment = await tx.enrolment.update({
            where: { id: enrolment.id },
            data: { status: targetEnrolmentStatus },
          });

          // 2. Create or Update Payment Record (Atomic to prevent unique constraint race conditions)
          const sId = dto.stripeSessionId || `sim_pay_${Date.now()}_${enrolment.id.slice(0, 8)}`;
          let payment: any = null;

          if (dto.stripeSessionId && typeof (tx.payment as any)?.findUnique === 'function') {
            payment = await tx.payment.findUnique({
              where: { stripeSessionId: dto.stripeSessionId },
            }).catch(() => null);
          }

          if (!payment && typeof (tx.payment as any)?.findFirst === 'function') {
            const orConditions: any[] = [];
            if (idempotencyKey) orConditions.push({ idempotencyKey });
            if (enrolment?.id) orConditions.push({ enrolmentId: enrolment.id, status: 'pending' });

            if (orConditions.length > 0) {
              payment = await tx.payment.findFirst({
                where: { OR: orConditions },
                orderBy: { createdAt: 'desc' },
              }).catch(() => null);
            }
          }

          if (payment && typeof (tx.payment as any)?.update === 'function') {
            payment = await tx.payment.update({
              where: { id: payment.id },
              data: {
                status: 'succeeded',
                amount: totalInvoiceAmount,
                currency,
                couponCode: cleanCouponCode || payment.couponCode || null,
                discountAmount: discount || payment.discountAmount || 0,
                stripeSessionId: dto.stripeSessionId || payment.stripeSessionId,
              },
            });
          } else if (typeof (tx.payment as any)?.upsert === 'function') {
            payment = await tx.payment.upsert({
              where: { stripeSessionId: sId },
              update: {
                status: 'succeeded',
                amount: totalInvoiceAmount,
                currency,
                couponCode: cleanCouponCode || null,
                discountAmount: discount,
                enrolmentId: enrolment.id,
              },
              create: {
                enrolmentId: enrolment.id,
                stripeSessionId: sId,
                amount: totalInvoiceAmount,
                currency,
                status: 'succeeded',
                couponCode: cleanCouponCode || null,
                discountAmount: discount,
                idempotencyKey,
              },
            });
          } else {
            payment = await tx.payment.create({
              data: {
                enrolmentId: enrolment.id,
                stripeSessionId: sId,
                amount: totalInvoiceAmount,
                currency,
                status: 'succeeded',
                couponCode: cleanCouponCode || null,
                discountAmount: discount,
                idempotencyKey,
              },
            });
          }

          // 3. Create Numbered WhatBoutMe FZE Invoice (or reuse if already exists)
          let existingInvoice: any = null;
          if (typeof (tx.invoice as any)?.findFirst === 'function') {
            existingInvoice = await tx.invoice.findFirst({
              where: { OR: [{ paymentId: payment.id }, { enrolmentId: enrolment.id }] },
            }).catch(() => null);
          }

          const invoice = existingInvoice && typeof (tx.invoice as any)?.update === 'function'
            ? await tx.invoice.update({
              where: { id: existingInvoice.id },
              data: {
                status: InvoiceStatus.PAID,
                amount: totalInvoiceAmount,
                paymentId: payment.id,
              },
            })
            : await (typeof (tx.invoice as any)?.upsert === 'function'
              ? tx.invoice.upsert({
                where: { paymentId: payment.id },
                update: {
                  status: InvoiceStatus.PAID,
                  amount: totalInvoiceAmount,
                },
                create: {
                  paymentId: payment.id,
                  enrolmentId: enrolment.id,
                  invoiceNumber,
                  amount: totalInvoiceAmount,
                  currency,
                  couponCode: cleanCouponCode || null,
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
                    currency,
                  },
                },
              })
              : tx.invoice.create({
                data: {
                  paymentId: payment.id,
                  enrolmentId: enrolment.id,
                  invoiceNumber,
                  amount: totalInvoiceAmount,
                  currency,
                  couponCode: cleanCouponCode || null,
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
                    currency,
                  },
                  pdfUrl: `/api/invoices/${payment.id}/pdf`,
                },
              }));

          // 4. Atomically redeem coupon if applied
          if (appliedCouponId && this.couponsService) {
            try {
              await this.couponsService.redeemCouponAtomic(tx, {
                couponId: appliedCouponId,
                userId: enrolment.userId,
                enrolmentId: enrolment.id,
                paymentId: payment.id,
                orderAmount: authoritativePrice,
                discountAmount: discount,
                finalAmount: totalInvoiceAmount,
                currency,
              });
            } catch (redeemErr: any) {
              this.logger.warn(`Could not atomically redeem coupon ${appliedCouponId}: ${redeemErr?.message}`);
            }
          }

          // 5. Audit Log
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

          // 6. Mark LeadCheckoutLink as used if this enrolment was converted from a lead
          if (typeof (tx as any).leadCheckoutLink?.updateMany === 'function') {
            await (tx as any).leadCheckoutLink.updateMany({
              where: { enrolmentId: enrolment.id, usedAt: null },
              data: { usedAt: new Date() },
            }).catch(() => { });
          }

          return { updatedEnrolment, payment, invoice };
        });

        // Clear Caches
        if (this.cacheHelper) {
          await this.cacheHelper.invalidateNamespace(`enrolment_progression:${enrolment.id}`).catch(() => { });
          await this.cacheHelper.invalidateNamespace('enrolments').catch(() => { });
          await this.cacheHelper.invalidateNamespace('batches').catch(() => { });
          await this.cacheHelper.invalidateNamespace('invoices').catch(() => { });
          await this.cacheHelper.invalidateNamespace('revenue').catch(() => { });
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
                currency: enrolment.program.currency || currency,
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
        const targetId = dto.registrationId || dto.eventRegistrationId || dto.targetId || dto.eventId;
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
          await this.cacheHelper.invalidateNamespace('events').catch(() => { });
          await this.cacheHelper.invalidateNamespace('invoices').catch(() => { });
          await this.cacheHelper.invalidateNamespace('revenue').catch(() => { });
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

      // ─────────────────────────────────────────────────────────────────────────
      // C. ORGANIZATION SEAT POOL SIMULATION & LIVE STRIPE FULFILLMENT
      // ─────────────────────────────────────────────────────────────────────────
      if (dto.targetType === 'SEAT_POOL') {
        const poolTargetId = dto.poolId || dto.targetId;
        if (!poolTargetId) {
          throw new BadRequestException('poolId or targetId is required for SEAT_POOL simulation');
        }

        const pool = await this.prisma.seatPool.findFirst({
          where: {
            OR: [
              ...(isValidUuid(poolTargetId) ? [{ id: poolTargetId }] : []),
              { poolCode: poolTargetId },
            ],
          },
          include: {
            organization: true,
            program: true,
            batch: true,
            invoices: true,
            payments: true,
          },
        });

        if (!pool) {
          throw new NotFoundException(`SeatPool '${poolTargetId}' not found`);
        }

        // Check Idempotency: if already ACTIVE
        if (pool.status === 'ACTIVE') {
          const activeInvoice = pool.invoices.find((inv) => inv.status === 'PAID') || pool.invoices[0];
          return {
            success: true,
            idempotent: true,
            status: 'PAID',
            targetType: 'SEAT_POOL',
            poolId: pool.id,
            poolCode: pool.poolCode,
            invoiceNumber: activeInvoice?.invoiceNumber || null,
            invoiceUrl: activeInvoice ? `/api/invoices/${activeInvoice.id}/pdf` : null,
            message: 'Seat pool is already paid and activated.',
          };
        }

        if (dto.status === 'FAILED') {
          const sId = dto.stripeSessionId || `fail_pool_${Date.now()}_${pool.id.slice(0, 8)}`;
          await this.prisma.payment.upsert({
            where: { stripeSessionId: sId },
            update: { status: 'failed' },
            create: {
              seatPoolId: pool.id,
              stripeSessionId: sId,
              amount: dto.amount || pool.netAmount,
              currency: pool.currency,
              status: 'failed',
              idempotencyKey,
            },
          }).catch(() => null);

          return {
            success: false,
            status: 'FAILED',
            targetType: 'SEAT_POOL',
            poolId: pool.id,
            poolCode: pool.poolCode,
            message: dto.failureReason || 'Organization seat pool payment failed or was declined.',
          };
        }

        // Authoritative Price Guard (Minor Units)
        const expectedPayable = Number(pool.netAmount);
        if (dto.amount !== undefined) {
          const clientMinor = Math.round(Number(dto.amount) * 100);
          const expectedMinor = Math.round(expectedPayable * 100);

          if (clientMinor < expectedMinor) {
            throw new BadRequestException(
              `Seat pool payment underpayment rejected: expected ${expectedPayable} ${pool.currency}, received ${dto.amount} ${pool.currency}`,
            );
          }
          if (Math.abs(clientMinor - expectedMinor) > 1) {
            throw new BadRequestException(
              `Seat pool payment amount tampering detected: expected ${expectedPayable} ${pool.currency}, received ${dto.amount} ${pool.currency}`,
            );
          }
        }

        // Mark paid using SeatPoolsService
        const actor = { id: dto.userId || null };
        if (this.seatPoolsService) {
          await this.seatPoolsService.markPaid(pool.id, actor, {
            paymentMethod: 'ONLINE',
            notes: 'Paid securely via Stripe Checkout',
            stripeSessionId: dto.stripeSessionId,
            idempotencyKey,
            chargedCurrency: dto.chargedCurrency,
            chargedAmountMinor: dto.chargedAmountMinor,
            fxRate: dto.fxRate,
          });
        } else {
          await this.prisma.seatPool.update({
            where: { id: pool.id },
            data: { status: 'ACTIVE', paymentMethod: 'ONLINE' },
          });
        }

        // Fetch the generated invoice
        const invoice = await this.prisma.invoice.findFirst({
          where: { seatPoolId: pool.id },
          orderBy: { createdAt: 'desc' },
        });

        // Clear relevant caches
        if (this.cacheHelper) {
          await this.cacheHelper.invalidateNamespace(`org:${pool.organizationId}`).catch(() => { });
          await this.cacheHelper.invalidateNamespace('organizations').catch(() => { });
          await this.cacheHelper.invalidateNamespace('invoices').catch(() => { });
          await this.cacheHelper.invalidateNamespace('revenue').catch(() => { });
        }

        return {
          success: true,
          status: 'PAID',
          targetType: 'SEAT_POOL',
          poolId: pool.id,
          poolCode: pool.poolCode,
          organizationId: pool.organizationId,
          totalSeats: pool.totalSeats,
          amount: expectedPayable,
          currency: pool.currency,
          currencySymbol: getCurrencySymbol(pool.currency),
          invoiceNumber: invoice?.invoiceNumber || null,
          invoiceId: invoice?.id || null,
          invoicePdfUrl: invoice ? `/api/invoices/${invoice.id}/pdf` : null,
          message: `Payment confirmed! ${pool.totalSeats} student seats are now unlocked and active for assignment.`,
        };
      }

      throw new BadRequestException(`Unsupported targetType: ${dto.targetType}`);
    }

  /**
   * Synchronous Session Status Check & Dual-Path Fallback
   * Prevents learner or organization lockout if Stripe redirect completes before webhook delivers.
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
          seatPool: {
            include: { organization: true, program: true, batch: true },
          },
          invoice: true,
        },
      });

      if (payment && payment.status === 'succeeded') {
        if (payment.seatPool) {
          return {
            status: 'PAID',
            targetType: 'SEAT_POOL',
            poolId: payment.seatPoolId,
            poolCode: payment.seatPool.poolCode,
            organizationId: payment.seatPool.organizationId,
            programTitle: payment.seatPool.program?.title,
            totalSeats: payment.seatPool.totalSeats,
            amount: payment.amount,
            currency: payment.currency,
            currencySymbol: getCurrencySymbol(payment.currency),
            invoiceNumber: payment.invoice?.invoiceNumber || null,
            invoiceUrl: payment.invoice ? `/api/invoices/${payment.invoice.id}/pdf` : null,
            message: 'Seat pool payment verified! Student slots are active.',
          };
        }

        const isSigned = payment.enrolment?.signedAgreement?.status === AgreementStatus.SIGNED;
        return {
          status: 'PAID',
          targetType: 'ENROLMENT',
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

          // Determine if Adaptive Pricing was used (customer charged in local currency like INR/AED)
          const currencyConversion = stripeSession.currency_conversion;
          const isAdaptive = !!(
            (currencyConversion && currencyConversion.source_currency?.toLowerCase() === 'usd') ||
            stripeSession.metadata?.baseAmountUSD
          );

          const authoritativeAmount = isAdaptive
            ? Number(stripeSession.metadata?.baseAmountUSD) || (currencyConversion ? (currencyConversion.amount_total / 100) : ((stripeSession.amount_total || 0) / 100))
            : ((stripeSession.amount_total || 0) / 100);

          const authoritativeCurrency: SupportedCurrency = isAdaptive ? 'USD' : ((stripeSession.currency || 'USD').toUpperCase() as SupportedCurrency);

          const localPaymentInfo = isAdaptive && stripeSession.currency && stripeSession.currency.toLowerCase() !== 'usd' ? {
            localCurrency: stripeSession.currency.toUpperCase(),
            localAmount: (stripeSession.amount_total || 0) / 100,
            fxRate: currencyConversion?.fx_rate || null,
          } : null;

          const targetType = (stripeSession.metadata?.targetType as PaymentTargetType) || 'ENROLMENT';
          const poolId = stripeSession.metadata?.poolId || (targetType === 'SEAT_POOL' ? stripeSession.metadata?.targetId : undefined);

          const simulated = await this.simulateTestWebhook({
            targetType,
            targetId: stripeSession.metadata?.targetId,
            enrolmentId: stripeSession.metadata?.enrolmentId || payment?.enrolmentId || undefined,
            poolId,
            status: 'PAID',
            amount: authoritativeAmount,
            currency: authoritativeCurrency,
            couponCode: stripeSession.metadata?.couponCode || undefined,
            idempotencyKey: stripeSession.metadata?.idempotencyKey || undefined,
            stripeSessionId: sessionId,
          });

          return {
            ...simulated,
            status: 'PAID',
            targetType,
            poolId,
            amount: authoritativeAmount,
            currency: authoritativeCurrency,
            currencySymbol: getCurrencySymbol(authoritativeCurrency),
            localPayment: localPaymentInfo,
          };
        }
      }

      return {
        status: payment?.status ? payment.status.toUpperCase() : 'PENDING',
        orderId: sessionId,
        enrolmentId: payment?.enrolmentId,
        poolId: payment?.seatPoolId,
      };
    }

  /**
   * Authoritative Stripe Webhook Handler
   * Validates cryptographic signature with Stripe SDK and processes payment events idempotently.
   */
  async handleStripeWebhook(rawPayload: any, signature ?: string, headers ?: any) {
      const verification = await this.stripeProvider.verifyWebhook({
        rawPayload,
        signature,
        headers,
      });

      if (!verification.isVerified) {
        this.logger.warn('[StripeWebhook] Rejected invalid webhook signature.');
        throw new BadRequestException('Invalid Stripe webhook signature');
      }

      this.logger.log(
        `[StripeWebhook] Verified Stripe event: ${verification.eventType} (Status: ${verification.status})`
      );

      if (verification.status === 'PAID') {
        const meta = verification.metadata || {};
        const targetType = (meta.targetType as PaymentTargetType) || 'ENROLMENT';
        const targetId = meta.targetId || meta.enrolmentId || meta.poolId;

        const baseAmountUSD = meta.baseAmountUSD ? Number(meta.baseAmountUSD) : undefined;
        const isAdaptive = Boolean(
          baseAmountUSD &&
          verification.currency &&
          verification.currency.toUpperCase() !== 'USD',
        );
        const chargedCurrency = verification.currency;
        const chargedAmountMinor = Math.round(Number(verification.amount) * 100);
        const authoritativeAmount = isAdaptive ? baseAmountUSD! : verification.amount;
        const authoritativeCurrency: SupportedCurrency = isAdaptive ? 'USD' : (verification.currency as SupportedCurrency);

        return await this.simulateTestWebhook({
          targetType,
          targetId,
          enrolmentId: meta.enrolmentId,
          poolId: meta.poolId || (targetType === 'SEAT_POOL' ? targetId : undefined),
          registrationId: meta.registrationId || targetId,
          status: 'PAID',
          amount: authoritativeAmount,
          currency: authoritativeCurrency,
          idempotencyKey: meta.idempotencyKey,
          stripeSessionId: verification.orderId || verification.transactionId,
          chargedCurrency,
          chargedAmountMinor,
        });
      }

      return { received: true, eventType: verification.eventType };
    }
  }
