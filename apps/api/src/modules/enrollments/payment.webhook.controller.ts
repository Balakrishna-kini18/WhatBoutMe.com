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
import { AgreementStatus, EnrolmentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CacheHelperService } from '../../common/cache/cache-helper.service.js';
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
      const signedPayload = `${timestamp}.${payloadStr}`;
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(signedPayload)
        .digest('hex');

      return signatures.some((sig) => timingSafeMatch(sig, expectedSignature));
    }

    // Direct HMAC fallback
    const directSignature = crypto
      .createHmac('sha256', secret)
      .update(payloadStr)
      .digest('hex');

    return timingSafeMatch(header, directSignature) || timingSafeMatch(header, secret);
  } catch {
    return false;
  }
}

@Controller(['webhooks/payment', 'webhooks/stripe'])
export class PaymentWebhookController {
  private readonly logger = new Logger(PaymentWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly cacheHelper?: CacheHelperService,
    @Optional() private readonly emailService?: EmailService,
  ) {}

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
        const rawBody = req?.rawBody || payload;
        if (verifyStripeSignature(stripeSignature, rawBody, expectedSecret)) {
          isVerified = true;
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
      if (isSigned) {
        targetEnrolmentStatus = EnrolmentStatus.ACTIVE;
      } else {
        // Payment captured but learner has not signed agreement -> access stays locked
        targetEnrolmentStatus = EnrolmentStatus.PENDING_AGREEMENT;
        this.logger.warn(
          `Payment received for enrolment ${enrolment.id}, but agreement is NOT signed. Setting status to PENDING_AGREEMENT.`,
        );
      }

      // 5.5 INDEPENDENT AMOUNT AND CURRENCY VALIDATION AGAINST TRUSTED RECORDS
      const expectedAmount = existingPayment?.amount ?? enrolment.batch?.price ?? enrolment.program?.price;
      const expectedCurrency = existingPayment?.currency ?? enrolment.program?.currency ?? 'USD';

      if (expectedAmount !== undefined && expectedAmount !== null && amount > 0) {
        const receivedMinor = Math.round(amount * 100);
        const expectedMinor = Math.round(Number(expectedAmount) * 100);
        if (receivedMinor < expectedMinor) {
          this.logger.error(
            `Webhook underpayment detected for session ${stripeSessionId}: expected ${expectedAmount} ${expectedCurrency}, got ${amount} ${currency}`,
          );
          throw new HttpException('Webhook payment amount is less than expected order amount', HttpStatus.BAD_REQUEST);
        }
      }

      if (existingPayment?.currency && currency && existingPayment.currency.toUpperCase() !== currency.toUpperCase()) {
        this.logger.error(
          `Webhook currency mismatch for session ${stripeSessionId}: expected ${existingPayment.currency}, got ${currency}`,
        );
        throw new HttpException('Webhook payment currency does not match order currency', HttpStatus.BAD_REQUEST);
      }

      // 6. Update Enrolment and Record Succeeded Payment
      await this.prisma.$transaction(async (tx) => {
        await tx.enrolment.update({
          where: { id: enrolment.id },
          data: { status: targetEnrolmentStatus },
        });

        if (existingPayment) {
          await tx.payment.update({
            where: { id: existingPayment.id },
            data: {
              status: 'succeeded',
              amount: amount || existingPayment.amount,
              currency,
            },
          });
        } else {
          const payment = await tx.payment.create({
            data: {
              enrolmentId: enrolment.id,
              stripeSessionId,
              amount: amount || enrolment.program?.price || 0,
              currency,
              status: 'succeeded',
            },
          });

          await tx.invoice.create({
            data: {
              paymentId: payment.id,
              invoiceNumber: `INV-${Date.now()}-${enrolment.id.slice(0, 4)}`,
              amount: amount || enrolment.program?.price || 0,
              currency,
              status: 'PAID',
            },
          });
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
      });

      // Invalidate caches
      if (this.cacheHelper) {
        await this.cacheHelper.invalidateNamespace(`enrolment_progression:${enrolment.id}`).catch(() => {});
        await this.cacheHelper.invalidateNamespace('enrolments').catch(() => {});
      }

      // Send confirmation email
      if (this.emailService && enrolment.user?.email && enrolment.program) {
        const lmsUrl = process.env.NEXT_PUBLIC_LMS_URL || 'http://localhost:3003';
        this.emailService
          .sendTemplateEmail({
            to: enrolment.user.email,
            subject: `Payment Successful - ${enrolment.program.title}`,
            template: 'PaymentSuccessEmail',
            props: {
              learnerName: enrolment.user.name || 'Learner',
              programTitle: enrolment.program.title,
              amount: amount || enrolment.program.price || 0,
              dashboardUrl: `${lmsUrl}/dashboard`,
            },
          })
          .catch((e: any) => this.logger.warn(`Failed to send payment email: ${e?.message}`));
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
