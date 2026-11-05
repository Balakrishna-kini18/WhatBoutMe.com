import { getAppUrls } from '../../common/config/app-urls.js';
import Stripe from 'stripe';
import {
  Controller,
  Post,
  Body,
  Headers,
  HttpException,
  HttpStatus,
  Logger,
  Optional,
  Req,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { AgreementStatus, EnrolmentStatus, EventPaymentStatus, InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CacheHelperService } from '../../common/cache/cache-helper.service.js';
import { isRegistrationDeadlinePassed } from '../../common/utils/deadline.util.js';
import { EmailService } from '../email/email.service.js';

function timingSafeMatch(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifyStripeSignature(
  header: string,
  rawPayload: any,
  secret: string,
): boolean {
  try {
    const parts = header.split(',');
    let timestamp = '';
    const signatures: string[] = [];

    for (const part of parts) {
      const [key, value] = part.split('=');
      if (key?.trim() === 't') timestamp = value?.trim();
      if (key?.trim() === 'v1') signatures.push(value?.trim());
    }

    const payloadStr = typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload);

    if (timestamp && signatures.length > 0) {
      // 5-minute replay tolerance window
      const now = Math.floor(Date.now() / 1000);
      const parsedTime = Number(timestamp);
      if (!isNaN(parsedTime) && Math.abs(now - parsedTime) > 300) {
        return false;
      }

      const signedPayload = `${timestamp}.${payloadStr}`;
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(signedPayload)
        .digest('hex');

      return signatures.some((sig) => timingSafeMatch(sig, expectedSignature));
    }

    // Direct HMAC fallback (strict comparison against calculated HMAC only)
    const directSignature = crypto
      .createHmac('sha256', secret)
      .update(payloadStr)
      .digest('hex');

    return timingSafeMatch(header, directSignature);
  } catch {
    return false;
  }
}

@Controller(['webhooks/payment', 'webhooks/stripe'])
export class PaymentWebhookController {
  private readonly logger = new Logger(PaymentWebhookController.name);

  private readonly inFlightEvents = new Map<string, Promise<any>>();

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly cacheHelper?: CacheHelperService,
    @Optional() private readonly emailService?: EmailService,
    @Optional() private readonly stripeClient?: Stripe,
  ) {}

  private async isEventProcessedInDatabase(eventId: string): Promise<boolean> {
    if (typeof (this.prisma as any)?.webhookEvent?.findUnique !== 'function') {
      return false;
    }
    try {
      const existing = await (this.prisma as any).webhookEvent.findUnique({
        where: { eventKey: eventId },
      });
      return existing?.status === 'PROCESSED';
    } catch {
      return false;
    }
  }

  private async recordWebhookEventInDb(
    client: any,
    eventId?: string,
    eventType?: string,
    stripeSessionId?: string,
    enrolmentId?: string,
  ): Promise<void> {
    if (typeof eventId !== 'string' || !eventId.startsWith('evt_')) {
      return;
    }
    const webhookEventRepo = client?.webhookEvent || (this.prisma as any)?.webhookEvent;
    if (!webhookEventRepo) {
      return;
    }
    const payloadSummary = {
      id: eventId,
      type: eventType || 'payment.succeeded',
      ...(stripeSessionId ? { stripeSessionId } : {}),
      ...(enrolmentId ? { enrolmentId } : {}),
    };
    if (typeof webhookEventRepo.upsert === 'function') {
      await webhookEventRepo.upsert({
        where: { eventKey: eventId },
        update: {
          status: 'PROCESSED',
          payload: payloadSummary,
        },
        create: {
          provider: 'STRIPE',
          eventKey: eventId,
          status: 'PROCESSED',
          payload: payloadSummary,
        },
      });
    } else if (typeof webhookEventRepo.create === 'function') {
      await webhookEventRepo.create({
        data: {
          provider: 'STRIPE',
          eventKey: eventId,
          status: 'PROCESSED',
          payload: payloadSummary,
        },
      });
    }
  }

  private async markEventProcessedInCache(eventId?: string): Promise<void> {
    if (this.cacheHelper && typeof eventId === 'string' && eventId.startsWith('evt_')) {
      await this.cacheHelper
        .set(`stripe_event_id:${eventId}`, { status: 'processed', at: new Date().toISOString() }, 86400)
        .catch(() => {});
    }
  }

  @Post()
  async handlePaymentWebhook(
    @Body() payload: any,
    @Headers('stripe-signature') stripeSignature?: string,
    @Headers('x-webhook-secret') webhookSecret?: string,
    @Req() req?: any,
  ) {
    const rawIp = req?.ip ?? req?.headers?.['x-forwarded-for'] ?? '127.0.0.1';
    const clientIp = Array.isArray(rawIp) ? rawIp[0] : (rawIp.split(',')[0]?.trim() || '127.0.0.1');

    // 1. Cryptographic Signature / Secret Verification
    const expectedSecret = process.env.STRIPE_WEBHOOK_SECRET || process.env.PAYMENT_WEBHOOK_SECRET;

    if (process.env.NODE_ENV === 'production' && !expectedSecret) {
      this.logger.error('CRITICAL: Payment webhook secret is not configured in production environment.');
      throw new HttpException('Webhook handler is not securely configured', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    if (expectedSecret) {
      let isVerified = false;

      // Check x-webhook-secret header
      if (webhookSecret && timingSafeMatch(webhookSecret, expectedSecret)) {
        isVerified = true;
      }

      // Check stripe-signature header
      if (!isVerified && stripeSignature) {
        if (req?.rawBody && (Buffer.isBuffer(req.rawBody) || typeof req.rawBody === 'string')) {
          try {
            const stripe = this.stripeClient || new Stripe(process.env.STRIPE_SECRET_KEY || '');
            stripe.webhooks.constructEvent(req.rawBody, stripeSignature, expectedSecret);
            isVerified = true;
          } catch (stripeErr: any) {
            this.logger.warn(`Stripe constructEvent signature check failed: ${stripeErr?.message}`);
          }
        }
        if (!isVerified) {
          const rawBody = req?.rawBody || payload;
          if (verifyStripeSignature(stripeSignature, rawBody, expectedSecret)) {
            isVerified = true;
          }
        }
      }

      if (!isVerified) {
        this.logger.warn(`Unauthorized payment webhook request from ${clientIp}`);
        throw new HttpException('Invalid webhook credentials', HttpStatus.UNAUTHORIZED);
      }
    } else {
      this.logger.warn(
        `[DEV MODE] Payment webhook processed without secret verification from ${clientIp}. Configure STRIPE_WEBHOOK_SECRET in production.`,
      );
    }

    const eventType = payload?.type || payload?.event || payload?.action || 'payment.succeeded';
    this.logger.log(`Processing payment webhook event: ${eventType}`);

    // 1.5 Stripe Event-Level Deduplication (Durable PostgreSQL primary + post-commit cache)
    const eventId = payload?.id;
    const hasStripeEventId = typeof eventId === 'string' && eventId.startsWith('evt_');

    if (hasStripeEventId) {
      const existingInFlight = this.inFlightEvents.get(eventId);
      if (existingInFlight) {
        try {
          await existingInFlight;
        } catch {
          // If the in-flight execution failed, allow this retry to proceed
        }
      }

      if (await this.isEventProcessedInDatabase(eventId)) {
        await this.markEventProcessedInCache(eventId);
        this.logger.log(`[Idempotent Bypass] Stripe event ${eventId} already processed in PostgreSQL. Returning 200 OK.`);
        return {
          received: true,
          idempotent: true,
          eventId,
          status: 'EVENT_ALREADY_PROCESSED',
        };
      }

      if (this.cacheHelper) {
        const cachedEvent = await this.cacheHelper
          .get<{ status?: string }>(`stripe_event_id:${eventId}`)
          .catch(() => null);
        if (cachedEvent?.status === 'processed') {
          const hasWebhookEventTable = typeof (this.prisma as any)?.webhookEvent?.findUnique === 'function';
          if (!hasWebhookEventTable) {
            this.logger.log(`[Idempotent Bypass] Stripe event ${eventId} already processed. Returning 200 OK.`);
            return {
              received: true,
              idempotent: true,
              eventId,
              status: 'EVENT_ALREADY_PROCESSED',
            };
          }
          // Cache hit without matching durable DB record: evict stale cache key and proceed
          await this.cacheHelper.del(`stripe_event_id:${eventId}`).catch(() => {});
        } else if (cachedEvent) {
          // Never allow an uncommitted 'processing' cache key to block retries
          await this.cacheHelper.del(`stripe_event_id:${eventId}`).catch(() => {});
        }
      }
    }

    const executeWebhook = async () => {
      try {
        const result = await this.processVerifiedWebhookPayload(payload, eventType, eventId, clientIp);
        if (hasStripeEventId) {
          await this.markEventProcessedInCache(eventId);
        }
        return result;
      } catch (err) {
        if (hasStripeEventId && this.cacheHelper) {
          await this.cacheHelper.del(`stripe_event_id:${eventId}`).catch(() => {});
        }
        throw err;
      }
    };

    if (hasStripeEventId) {
      const executionPromise = executeWebhook();
      this.inFlightEvents.set(eventId, executionPromise);
      try {
        return await executionPromise;
      } finally {
        if (this.inFlightEvents.get(eventId) === executionPromise) {
          this.inFlightEvents.delete(eventId);
        }
      }
    }

    return executeWebhook();
  }

  private async processVerifiedWebhookPayload(
    payload: any,
    eventType: string,
    eventId: string | undefined,
    clientIp: string,
  ) {

    // Extract identifiers from payload (supports both direct JSON payloads and standard Stripe event payloads)
    const dataObj = payload?.data?.object || payload || {};
    const stripeSessionId =
      dataObj.id ||
      dataObj.stripeSessionId ||
      dataObj.payment_intent ||
      dataObj.transaction_id ||
      payload?.stripeSessionId;

    if (!stripeSessionId) {
      this.logger.warn(`Payment webhook missing provider transaction ID / session ID from ${clientIp}`);
      throw new HttpException('Missing provider transaction ID or session ID', HttpStatus.BAD_REQUEST);
    }

    const enrolmentId =
      dataObj.metadata?.enrolmentId ||
      dataObj.client_reference_id ||
      payload?.enrolmentId ||
      dataObj.enrolmentId;

    const amount =
      typeof dataObj.amount_total === 'number'
        ? dataObj.amount_total / 100
        : typeof dataObj.amount === 'number'
        ? dataObj.amount
        : 0;
    const currency = (dataObj.currency || 'USD').toUpperCase();

    // ─────────────────────────────────────────────────────────────────────────
    // EVENT: PAYMENT SUCCEEDED / CHECKOUT COMPLETED
    // ─────────────────────────────────────────────────────────────────────────
    if (
      eventType === 'payment.succeeded' ||
      eventType === 'checkout.session.completed' ||
      eventType === 'payment_intent.succeeded'
    ) {
      // 2. IDEMPOTENCY CHECK: if this session has already been recorded as succeeded, return immediately
      const existingPayment = await this.prisma.payment.findUnique({
        where: { stripeSessionId },
      });

      if (existingPayment && existingPayment.status === 'succeeded') {
        this.logger.log(`Duplicate webhook for session ${stripeSessionId}. Idempotently skipping.`);
        return {
          received: true,
          idempotent: true,
          status: 'ALREADY_PROCESSED',
          paymentId: existingPayment.id,
          enrolmentId: existingPayment.enrolmentId,
        };
      }

      // Handle Event Ticketing payments via Stripe
      if (dataObj.metadata?.targetType === 'EVENT' || dataObj.metadata?.registrationId) {
        const regId = dataObj.metadata?.registrationId;
        const reg = await this.prisma.eventRegistration.findFirst({
          where: {
            OR: [
              ...(regId ? [{ id: regId }] : []),
              { gatewayOrderId: stripeSessionId },
            ],
          },
          include: { event: true },
        });

        if (reg) {
          if (reg.paymentStatus === EventPaymentStatus.PAID) {
            this.logger.log(`Event registration ${reg.id} already paid. Skipping duplicate webhook.`);
            return { received: true, idempotent: true, status: 'ALREADY_PROCESSED' };
          }

          await this.prisma.$transaction(async (tx) => {
            await tx.eventRegistration.update({
              where: { id: reg.id },
              data: {
                paymentStatus: EventPaymentStatus.PAID,
                gatewayPaymentId: (dataObj.payment_intent as string) || stripeSessionId,
              },
            });
            await tx.event.update({
              where: { id: reg.eventId },
              data: { seatsBooked: { increment: 1 } },
            });
            await this.recordWebhookEventInDb(tx, eventId, eventType, stripeSessionId, reg.id);
          });

          this.logger.log(`Event registration ${reg.id} confirmed via Stripe webhook.`);
          return { received: true, status: 'EVENT_PAID', registrationId: reg.id };
        }
      }

      // Locate enrolment
      let enrolment: any = null;
      if (enrolmentId) {
        enrolment = await this.prisma.enrolment.findUnique({
          where: { id: enrolmentId },
          include: {
            program: { select: { id: true, title: true, price: true } },
            batch: { select: { id: true, name: true, startDate: true } },
            user: { select: { id: true, name: true, email: true } },
            signedAgreement: true,
          },
        });
      } else if (existingPayment?.enrolmentId) {
        enrolment = await this.prisma.enrolment.findUnique({
          where: { id: existingPayment.enrolmentId },
          include: {
            program: { select: { id: true, title: true, price: true } },
            batch: { select: { id: true, name: true, startDate: true } },
            user: { select: { id: true, name: true, email: true } },
            signedAgreement: true,
          },
        });
      }

      if (!enrolment) {
        this.logger.warn(`Payment webhook received for non-existent enrolment ID: ${enrolmentId}`);
        throw new HttpException('Enrolment not found for payment', HttpStatus.NOT_FOUND);
      }

      // 3. PAYMENT-TO-ENROLMENT OWNERSHIP VERIFICATION
      if (dataObj.metadata?.userId && dataObj.metadata.userId !== enrolment.userId) {
        this.logger.error(
          `Ownership mismatch: webhook user ID ${dataObj.metadata.userId} does not match enrolment owner ${enrolment.userId}`,
        );
        throw new HttpException('Payment ownership mismatch: user ID does not match enrollment owner', HttpStatus.BAD_REQUEST);
      }

      // 4. SAFEGUARD: OUT-OF-ORDER EVENT AGAINST REVOKED ENROLMENT
      if (enrolment.status === EnrolmentStatus.REVOKED) {
        this.logger.warn(
          `Late or out-of-order payment received for REVOKED enrolment ${enrolment.id}. Access remains revoked.`,
        );
        return {
          received: true,
          status: 'REVOKED_IMMUTABLE',
          enrolmentId: enrolment.id,
          courseAccessGranted: false,
          reason: 'Cannot activate an enrolment that has been revoked',
        };
      }

      // 5. STRICT PRE-PAYMENT AGREEMENT GATE
      // Course access must ONLY be granted when agreement is signed.
      const isSigned =
        enrolment.signedAgreement &&
        enrolment.signedAgreement.status === AgreementStatus.SIGNED;

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
        } else if (isSigned) {
          targetEnrolmentStatus = EnrolmentStatus.ACTIVE;
        } else {
          // Payment captured but learner has not signed agreement -> access stays locked
          targetEnrolmentStatus = EnrolmentStatus.PENDING_AGREEMENT;
          this.logger.warn(
            `Payment received for enrolment ${enrolment.id}, but agreement is NOT signed. Setting status to PENDING_AGREEMENT.`,
          );
        }
      }

      // 5.5 INDEPENDENT AMOUNT AND CURRENCY VALIDATION (WITH ADAPTIVE PRICING SUPPORT)
      const expectedAmount = existingPayment?.amount ?? enrolment.batch?.price ?? enrolment.program?.price;
      const expectedCurrency = existingPayment?.currency ?? enrolment.program?.currency ?? 'USD';

      // Detect Stripe Adaptive Pricing (Customer charged locally in INR/AED while core settles in USD)
      const currencyConversion = dataObj.currency_conversion;
      const isAdaptivePricing = !!(
        (currencyConversion && currencyConversion.source_currency?.toLowerCase() === 'usd') ||
        (dataObj.metadata?.baseAmountUSD && (expectedCurrency === 'USD' || !existingPayment))
      );

      const authoritativeAmount = isAdaptivePricing
        ? Number(dataObj.metadata?.baseAmountUSD || expectedAmount)
        : (amount || Number(expectedAmount));
      const authoritativeCurrency = isAdaptivePricing ? 'USD' : (currency || expectedCurrency || 'USD').toUpperCase();

      if (expectedAmount !== undefined && expectedAmount !== null && amount > 0) {
        if (isAdaptivePricing) {
          // Under Adaptive Pricing, validate that authoritative USD amount meets expected order price
          const baseMinor = Math.round(authoritativeAmount * 100);
          const expectedMinor = Math.round(Number(expectedAmount) * 100);
          if (baseMinor < expectedMinor) {
            this.logger.error(
              `Webhook underpayment detected for adaptive session ${stripeSessionId}: expected $${expectedAmount} USD, got $${authoritativeAmount} USD (paid ${amount} ${currency})`,
            );
            throw new HttpException('Webhook payment amount is less than expected order amount', HttpStatus.BAD_REQUEST);
          }
          this.logger.log(
            `[Stripe Adaptive Pricing Webhook] Learner paid ${amount} ${currency}. Authoritative settlement: $${authoritativeAmount} USD (FX: ${currencyConversion?.fx_rate || 'mid-market'}).`,
          );
        } else {
          const receivedMinor = Math.round(amount * 100);
          const expectedMinor = Math.round(Number(expectedAmount) * 100);
          if (receivedMinor < expectedMinor) {
            this.logger.error(
              `Webhook underpayment detected for session ${stripeSessionId}: expected ${expectedAmount} ${expectedCurrency}, got ${amount} ${currency}`,
            );
            throw new HttpException('Webhook payment amount is less than expected order amount', HttpStatus.BAD_REQUEST);
          }

          if (existingPayment?.currency && currency && existingPayment.currency.toUpperCase() !== currency.toUpperCase()) {
            this.logger.error(
              `Webhook currency mismatch for session ${stripeSessionId}: expected ${existingPayment.currency}, got ${currency}`,
            );
            throw new HttpException('Webhook payment currency does not match order currency', HttpStatus.BAD_REQUEST);
          }
        }
      }

      // 6. Update Enrolment and Record Succeeded Payment
      const txResult = await this.prisma.$transaction(async (tx) => {
        // TIER 4: Check if enrolment already has an existing succeeded payment from a DIFFERENT session
        const priorSucceededPayment = await tx.payment.findFirst({
          where: {
            enrolmentId: enrolment.id,
            status: 'succeeded',
            stripeSessionId: { not: stripeSessionId },
          },
        });

        if (priorSucceededPayment) {
          this.logger.warn(
            `[DUPLICATE PAYMENT DETECTED] Session ${stripeSessionId} is duplicate for enrolment ${enrolment.id}. Initiating automated refund.`,
          );

          // Automated Stripe refund
          const paymentIntentId = dataObj.payment_intent || dataObj.id;
          if (typeof paymentIntentId === 'string' && paymentIntentId.startsWith('pi_') && process.env.STRIPE_SECRET_KEY) {
            try {
              const stripe = this.stripeClient || new Stripe(process.env.STRIPE_SECRET_KEY);
              await stripe.refunds.create({
                payment_intent: paymentIntentId,
                reason: 'duplicate',
                metadata: {
                  enrolmentId: enrolment.id,
                  originalSessionId: priorSucceededPayment.stripeSessionId,
                  duplicateSessionId: stripeSessionId,
                },
              });
              this.logger.log(`[Auto-Refund] Successfully refunded duplicate payment ${paymentIntentId}`);
            } catch (refundErr: any) {
              this.logger.error(`[Auto-Refund Warning] Could not auto-refund duplicate: ${refundErr?.message}`);
            }
          }

          if (existingPayment) {
            await tx.payment.update({
              where: { id: existingPayment.id },
              data: { status: 'refunded_duplicate' },
            });
          } else {
            await tx.payment.create({
              data: {
                enrolmentId: enrolment.id,
                stripeSessionId,
                amount: amount || enrolment.program?.price || 0,
                currency,
                status: 'refunded_duplicate',
              },
            });
          }

          await tx.auditLog.create({
            data: {
              actorId: enrolment.userId,
              action: 'DUPLICATE_PAYMENT_AUTO_REFUNDED',
              entity: 'Enrolment',
              entityId: enrolment.id,
              meta: {
                stripeSessionId,
                originalSessionId: priorSucceededPayment.stripeSessionId,
                amount,
                currency,
              },
              ip: clientIp,
            },
          });

          await this.recordWebhookEventInDb(tx, eventId, eventType, stripeSessionId, enrolment.id);

          return { isDuplicate: true };
        }

        await tx.enrolment.update({
          where: { id: enrolment.id },
          data: { status: targetEnrolmentStatus },
        });

        // Atomic Payment Upsert to prevent race conditions with synchronous return
        let paymentRecord: any;
        if (typeof (tx.payment as any)?.upsert === 'function') {
          paymentRecord = await tx.payment.upsert({
            where: { stripeSessionId },
            update: {
              status: 'succeeded',
              amount: authoritativeAmount,
              currency: authoritativeCurrency,
              enrolmentId: enrolment.id,
            },
            create: {
              enrolmentId: enrolment.id,
              stripeSessionId,
              amount: authoritativeAmount,
              currency: authoritativeCurrency,
              status: 'succeeded',
            },
          });
        } else if (existingPayment) {
          paymentRecord = await tx.payment.update({
            where: { id: existingPayment.id },
            data: {
              status: 'succeeded',
              amount: authoritativeAmount,
              currency: authoritativeCurrency,
              enrolmentId: enrolment.id,
            },
          });
        } else {
          paymentRecord = await tx.payment.create({
            data: {
              enrolmentId: enrolment.id,
              stripeSessionId,
              amount: authoritativeAmount,
              currency: authoritativeCurrency,
              status: 'succeeded',
            },
          });
        }

        // Atomic Invoice Upsert with Adaptive Pricing metadata disclosure
        const invoiceNumber = `INV-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
        const localPaymentDisclosure = isAdaptivePricing
          ? {
              paidCurrency: currency.toUpperCase(),
              paidAmount: amount,
              fxRate: currencyConversion?.fx_rate || null,
              provider: 'Stripe Adaptive Pricing',
            }
          : undefined;

        if (typeof (tx.invoice as any)?.upsert === 'function') {
          await tx.invoice.upsert({
            where: { paymentId: paymentRecord.id },
            update: {
              amount: authoritativeAmount,
              currency: authoritativeCurrency,
              status: InvoiceStatus.PAID,
              taxFields: {
                company: 'WhatBoutMe FZE',
                total: authoritativeAmount,
                currency: authoritativeCurrency,
                currencySymbol: '$',
                ...(localPaymentDisclosure ? { localPayment: localPaymentDisclosure } : {}),
              },
            },
            create: {
              paymentId: paymentRecord.id,
              enrolmentId: enrolment.id,
              invoiceNumber,
              amount: authoritativeAmount,
              currency: authoritativeCurrency,
              status: InvoiceStatus.PAID,
              taxFields: {
                company: 'WhatBoutMe FZE',
                total: authoritativeAmount,
                currency: authoritativeCurrency,
                currencySymbol: '$',
                ...(localPaymentDisclosure ? { localPayment: localPaymentDisclosure } : {}),
              },
            },
          });
        } else if (typeof (tx.invoice as any)?.create === 'function') {
          try {
            await tx.invoice.create({
              data: {
                paymentId: paymentRecord.id,
                enrolmentId: enrolment.id,
                invoiceNumber,
                amount: authoritativeAmount,
                currency: authoritativeCurrency,
                status: InvoiceStatus.PAID,
                taxFields: {
                  company: 'WhatBoutMe FZE',
                  total: authoritativeAmount,
                  currency: authoritativeCurrency,
                  currencySymbol: '$',
                  ...(localPaymentDisclosure ? { localPayment: localPaymentDisclosure } : {}),
                },
              },
            });
          } catch {
            // ignore non-critical invoice creation in mock/test
          }
        }

        // Record audit trail
        await tx.auditLog.create({
          data: {
            actorId: enrolment.userId,
            action: isSigned ? 'PAYMENT_CONFIRMED_ENROLMENT_ACTIVATED' : 'PAYMENT_CONFIRMED_AGREEMENT_PENDING',
            entity: 'Enrolment',
            entityId: enrolment.id,
            meta: {
              stripeSessionId,
              amount,
              currency,
              isSigned,
              enrolmentStatus: targetEnrolmentStatus,
            },
            ip: clientIp,
          },
        });

        await this.recordWebhookEventInDb(tx, eventId, eventType, stripeSessionId, enrolment.id);

        return { isDuplicate: false };
      });

      if (txResult?.isDuplicate) {
        return {
          received: true,
          duplicateDetected: true,
          refunded: true,
          enrolmentId: enrolment.id,
          enrolmentStatus: enrolment.status,
          message: 'Duplicate payment detected and automatically refunded.',
        };
      }

      // Invalidate caches
      if (this.cacheHelper) {
        await this.cacheHelper.invalidateNamespace(`enrolment_progression:${enrolment.id}`).catch(() => {});
        await this.cacheHelper.invalidateNamespace('enrolments').catch(() => {});
        await this.cacheHelper.invalidateNamespace('batches').catch(() => {});
      }

      // Send confirmation email
      if (this.emailService && enrolment.user?.email && enrolment.program) {
        const { lmsUrl } = getAppUrls();
        try {
          await this.emailService.sendTemplateEmail({
            to: enrolment.user.email,
            subject: `Payment Successful - ${enrolment.program.title}`,
            template: 'PaymentSuccessEmail',
            props: {
              learnerName: enrolment.user.name || 'Learner',
              programTitle: enrolment.program.title,
              amount: amount || enrolment.program.price || 0,
              dashboardUrl: `${lmsUrl}/dashboard`,
            },
          });
        } catch (e: any) {
          this.logger.warn(`Failed to send payment email: ${e?.message}`);
        }
      }

      return {
        received: true,
        enrolmentId: enrolment.id,
        enrolmentStatus: targetEnrolmentStatus,
        isSigned,
        courseAccessGranted: targetEnrolmentStatus === EnrolmentStatus.ACTIVE,
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EVENT: PAYMENT FAILED / CHECKOUT EXPIRED / ABANDONED
    // ─────────────────────────────────────────────────────────────────────────
    if (
      eventType === 'payment.failed' ||
      eventType === 'checkout.session.expired' ||
      eventType === 'payment_intent.payment_failed'
    ) {
      if (!enrolmentId) {
        return { received: true, ignored: true, reason: 'No enrolmentId in failed payment' };
      }

      // Record failed payment attempt
      const existingPayment = await this.prisma.payment.findUnique({
        where: { stripeSessionId },
      });

      if (existingPayment) {
        await this.prisma.payment.update({
          where: { id: existingPayment.id },
          data: { status: 'failed' },
        });
      } else {
        await this.prisma.payment.create({
          data: {
            enrolmentId,
            stripeSessionId,
            amount,
            currency,
            status: 'failed',
          },
        });
      }

      // Enrollment remains PENDING_PAYMENT — course access is NOT granted
      // CRITICAL: SignedAgreement is NEVER deleted. Signing evidence is kept intact.
      await this.prisma.auditLog.create({
        data: {
          action: 'PAYMENT_FAILED_ACCESS_BLOCKED',
          entity: 'Enrolment',
          entityId: enrolmentId,
          meta: {
            stripeSessionId,
            reason: dataObj.last_payment_error?.message || 'Payment failed or checkout expired',
            signedEvidencePreserved: true,
          },
          ip: clientIp,
        },
      });

      await this.recordWebhookEventInDb(this.prisma, eventId, eventType, stripeSessionId, enrolmentId);

      return {
        received: true,
        status: 'FAILED',
        enrolmentId,
        courseAccessGranted: false,
        signingEvidencePreserved: true,
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EVENT: REFUND OR CHARGEBACK -> REVOKE ACCESS, PRESERVE EVIDENCE
    // ─────────────────────────────────────────────────────────────────────────
    if (
      eventType === 'payment.refunded' ||
      eventType === 'charge.refunded' ||
      eventType === 'payment.chargeback' ||
      eventType === 'charge.dispute.created'
    ) {
      const isDispute = eventType.includes('dispute') || eventType.includes('chargeback');
      const targetStatus = isDispute ? 'chargeback' : 'refunded';

      let targetEnrolmentId = enrolmentId;
      if (stripeSessionId) {
        const p = await this.prisma.payment.findUnique({ where: { stripeSessionId } });
        if (p) {
          if (targetEnrolmentId && p.enrolmentId !== targetEnrolmentId) {
            this.logger.error(
              `Refund cross-enrolment mismatch: payment session ${stripeSessionId} belongs to enrolment ${p.enrolmentId}, but webhook claimed ${targetEnrolmentId}`,
            );
            throw new HttpException('Payment to enrollment mismatch on refund', HttpStatus.BAD_REQUEST);
          }
          if (!targetEnrolmentId) {
            targetEnrolmentId = p.enrolmentId;
          }
        }
      }

      if (!targetEnrolmentId) {
        this.logger.warn(`Refund/Chargeback received for unknown enrolment. Session: ${stripeSessionId}`);
        return { received: true, ignored: true, reason: 'Target enrolment not found' };
      }

      // Update payment record
      await this.prisma.payment.updateMany({
        where: { enrolmentId: targetEnrolmentId },
        data: { status: targetStatus },
      });

      // Revoke enrolment access immediately
      await this.prisma.enrolment.update({
        where: { id: targetEnrolmentId },
        data: { status: EnrolmentStatus.REVOKED },
      });

      // CRITICAL AUDIT RULE: SignedAgreement evidence is NEVER deleted.
      // It serves as legal proof of agreement terms during dispute/arbitration.
      await this.prisma.auditLog.create({
        data: {
          action: isDispute ? 'PAYMENT_DISPUTE_ACCESS_REVOKED' : 'PAYMENT_REFUNDED_ACCESS_REVOKED',
          entity: 'Enrolment',
          entityId: targetEnrolmentId,
          meta: {
            stripeSessionId,
            actionTaken: 'Enrolment revoked, course access locked',
            signedEvidencePreserved: true,
          },
          ip: clientIp,
        },
      });

      await this.recordWebhookEventInDb(this.prisma, eventId, eventType, stripeSessionId, targetEnrolmentId);

      // Invalidate cache immediately so LMS locks down steps
      if (this.cacheHelper) {
        await this.cacheHelper.invalidateNamespace(`enrolment_progression:${targetEnrolmentId}`).catch(() => {});
        await this.cacheHelper.invalidateNamespace('enrolments').catch(() => {});
      }

      return {
        received: true,
        status: 'REVOKED',
        enrolmentId: targetEnrolmentId,
        courseAccessGranted: false,
        signedEvidencePreserved: true,
      };
    }

    return { received: true, status: 'IGNORED', eventType };
  }
}
