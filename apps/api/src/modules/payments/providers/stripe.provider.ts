import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import Stripe from 'stripe';
import { getAppUrls } from '../../../common/config/app-urls.js';
import {
  IPaymentProvider,
  PaymentProviderType,
  CreateOrderParams,
  CreateOrderResult,
  VerifyWebhookParams,
  WebhookVerificationResult,
} from '../interfaces/payment.interfaces.js';

@Injectable()
export class StripePaymentProvider implements IPaymentProvider {
  readonly providerType: PaymentProviderType = 'STRIPE';
  private readonly logger = new Logger(StripePaymentProvider.name);
  private stripeClient: Stripe | null = null;

  constructor() {
    this.initStripe();
  }

  private initStripe(): Stripe | null {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      this.logger.warn(
        '[StripeProvider] Live Stripe secret key not configured. Stripe calls will operate in test emulation.'
      );
      this.stripeClient = null;
      return null;
    }

    if (!this.stripeClient) {
      this.stripeClient = new Stripe(secretKey, {
        apiVersion: '2025-02-24.acacia' as any,
      });
      this.logger.log('[StripeProvider] Stripe SDK successfully initialized.');
    }
    return this.stripeClient;
  }

  private getStripe(): Stripe | null {
    if (!this.stripeClient) {
      return this.initStripe();
    }
    return this.stripeClient;
  }

  async createOrder(params: CreateOrderParams): Promise<CreateOrderResult> {
    const stripe = this.getStripe();

    if (!stripe) {
      this.logger.error(
        '[StripeProvider] Stripe SDK is not initialized. Ensure STRIPE_SECRET_KEY is configured in .env',
      );
      throw new ServiceUnavailableException(
        'Stripe payment gateway is currently unavailable. Please contact support or configure payment credentials.',
      );
    }

    try {
      const { lmsUrl, marketingUrl, adminUrl } = getAppUrls();
      const isEvent = params.targetType === 'EVENT';
      const isSeatPool = params.targetType === 'SEAT_POOL';
      const baseReturnUrl = isEvent ? marketingUrl : lmsUrl;

      let successUrl: string;
      let cancelUrl: string;

      if (isSeatPool) {
        const orgId = params.metadata?.organizationId || '';
        successUrl = `${adminUrl}/users/organizations/${orgId}?tab=pools&paid=1&session_id={CHECKOUT_SESSION_ID}&poolId=${params.targetId}`;
        cancelUrl = `${adminUrl}/users/organizations/${orgId}?tab=pools&cancelled=1&poolId=${params.targetId}`;
      } else if (isEvent) {
        successUrl = `${baseReturnUrl}/events/${params.targetId}?session_id={CHECKOUT_SESSION_ID}&registered=1`;
        cancelUrl = `${baseReturnUrl}/events/${params.targetId}?cancelled=1`;
      } else {
        successUrl = `${lmsUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
        cancelUrl = `${lmsUrl}/checkout?programId=${params.targetId}&cancelled=1`;
      }

      const checkoutCurrency = (params.currency || 'USD').toLowerCase();
      const isUSD = checkoutCurrency === 'usd';
      // Stripe expects amount in minor units (cents, fils, paise)
      const unitAmountMinor = Math.round(Number(params.amount) * 100);

      // Clean metadata strings (Stripe metadata values must be strings <= 500 chars)
      const sanitizedMetadata: Record<string, string> = {
        targetType: String(params.targetType),
        targetId: String(params.targetId),
        enrolmentId: String(params.metadata?.enrolmentId || ''),
        organizationId: String(params.metadata?.organizationId || ''),
        poolId: String(params.metadata?.poolId || (isSeatPool ? params.targetId : '')),
        poolCode: String(params.metadata?.poolCode || ''),
        totalSeats: String(params.metadata?.totalSeats || ''),
        userId: String(params.userId || ''),
        baseAmountUSD: String(params.metadata?.baseAmountUSD || params.amount),
        requestedCurrency: String(params.currency || 'USD'),
        couponCode: String(params.metadata?.couponCode || ''),
        couponId: String(params.metadata?.couponId || ''),
        idempotencyKey: String(params.idempotencyKey || ''),
      };

      const requestOptions: Stripe.RequestOptions | undefined = params.idempotencyKey
        ? { idempotencyKey: String(params.idempotencyKey) }
        : undefined;

      const productName = isSeatPool
        ? `WhatBoutMe - ${params.metadata?.title || 'Corporate Seats'}`
        : params.metadata?.title || (isEvent ? 'WhatBoutMe Masterclass / Workshop Entry Ticket' : 'WhatBoutMe Learning Program');

      const productDescription = isSeatPool
        ? `Organization Seat Booking (${params.metadata?.totalSeats || ''} seats) for Cohort: ${params.metadata?.batchName || 'Cohort Batch'}`
        : isEvent
          ? 'WhatBoutMe Masterclass / Workshop Entry Ticket'
          : 'WhatBoutMe FZE Online Professional Program Enrolment';

      const session = await stripe.checkout.sessions.create(
        {
          mode: 'payment',
          customer_email: params.customerEmail ? String(params.customerEmail).trim().toLowerCase() : undefined,
          line_items: [
            {
              price_data: {
                currency: checkoutCurrency,
                unit_amount: unitAmountMinor,
                product_data: {
                  name: productName,
                  description: productDescription,
                },
              },
              quantity: 1,
            },
          ],
          ...(isUSD ? { adaptive_pricing: { enabled: true } } : {}),
          metadata: sanitizedMetadata,
          client_reference_id: params.metadata?.poolId || params.metadata?.enrolmentId || params.targetId,
          expires_at: Math.floor(Date.now() / 1000) + 1800, // 30 minutes
          success_url: successUrl,
          cancel_url: cancelUrl,
        },
        requestOptions,
      );

      this.logger.log(
        `[StripeProvider] Created Stripe Checkout Session ${session.id} for ${params.targetType}:${params.targetId} (${params.amount} ${params.currency})`
      );

      return {
        provider: this.providerType,
        orderId: session.id,
        amount: params.amount,
        currency: params.currency,
        status: 'PENDING',
        checkoutUrl: session.url || undefined,
        simulationBypass: false,
        metadata: {
          ...params.metadata,
          stripeSessionUrl: session.url,
          paymentIntentId: session.payment_intent,
        },
      };
    } catch (err: any) {
      this.logger.error(`[StripeProvider] Failed to create checkout session: ${err?.message}`, err?.stack);
      throw err;
    }
  }

  async verifyWebhook(params: VerifyWebhookParams): Promise<WebhookVerificationResult> {
    const stripe = this.getStripe();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripe || !webhookSecret) {
      this.logger.error(
        '[StripeProvider] Stripe SDK or STRIPE_WEBHOOK_SECRET missing; refusing unverified webhook processing.'
      );
      return {
        isVerified: false,
        eventType: 'missing_credentials',
        transactionId: '',
        orderId: undefined,
        status: 'FAILED',
        amount: 0,
        currency: 'USD',
      };
    }

    if (!params.signature) {
      this.logger.warn('[StripeProvider] Webhook request missing stripe-signature header.');
      return {
        isVerified: false,
        eventType: 'missing_signature',
        transactionId: '',
        orderId: undefined,
        status: 'FAILED',
        amount: 0,
        currency: 'USD',
      };
    }

    if (!Buffer.isBuffer(params.rawPayload) && typeof params.rawPayload !== 'string') {
      this.logger.warn(
        '[StripeProvider] Webhook payload is not a Buffer or string; refusing to parse unverified payload.'
      );
      return {
        isVerified: false,
        eventType: 'invalid_payload_type',
        transactionId: '',
        orderId: undefined,
        status: 'FAILED',
        amount: 0,
        currency: 'USD',
      };
    }

    try {
      const event: Stripe.Event = stripe.webhooks.constructEvent(
        params.rawPayload,
        params.signature,
        webhookSecret,
      );

      const dataObj = event.data?.object as any;
      let status: 'PAID' | 'FAILED' | 'REFUNDED' = 'FAILED';

      if (
        event.type === 'checkout.session.completed' ||
        event.type === 'payment_intent.succeeded'
      ) {
        status = 'PAID';
      } else if (
        event.type === 'charge.refunded' ||
        (event.type as string) === 'payment.refunded'
      ) {
        status = 'REFUNDED';
      }

      const amountTotal =
        typeof dataObj?.amount_total === 'number'
          ? dataObj.amount_total / 100
          : typeof dataObj?.amount === 'number'
            ? dataObj.amount / 100
            : 0;

      const currency = (dataObj?.currency || 'USD').toUpperCase();
      const transactionId = dataObj?.payment_intent || dataObj?.id || `pi_${Date.now()}`;

      return {
        isVerified: true,
        eventType: event.type,
        transactionId: typeof transactionId === 'string' ? transactionId : transactionId?.id,
        orderId: dataObj?.id,
        status,
        amount: amountTotal,
        currency,
        paymentIntentId: typeof dataObj?.payment_intent === 'string' ? dataObj.payment_intent : undefined,
        metadata: dataObj?.metadata || {},
      };
    } catch (err: any) {
      this.logger.error(`[StripeProvider] Webhook verification failed: ${err?.message}`);
      return {
        isVerified: false,
        eventType: 'verification_failed',
        transactionId: '',
        status: 'FAILED',
        amount: 0,
        currency: 'USD',
      };
    }
  }

  /**
   * Expire an active Stripe Checkout Session to prevent concurrent multi-tab double-spending
   */
  async expireSession(orderId: string): Promise<boolean> {
    const stripe = this.getStripe();
    if (!stripe || !orderId || orderId.startsWith('cs_test_')) return false;

    try {
      await stripe.checkout.sessions.expire(orderId);
      this.logger.log(`[StripeProvider] Successfully expired active checkout session ${orderId}`);
      return true;
    } catch (err: any) {
      this.logger.warn(`[StripeProvider] Could not expire session ${orderId}: ${err?.message}`);
      return false;
    }
  }

  /**
   * Synchronously retrieve session status from Stripe API for dual-path reconciliation
   */
  async retrieveSession(orderId: string): Promise<any> {
    const stripe = this.getStripe();
    if (!stripe || !orderId) return null;

    try {
      return await stripe.checkout.sessions.retrieve(orderId, {
        expand: ['line_items'],
      });
    } catch (err: any) {
      this.logger.warn(`[StripeProvider] Could not retrieve session ${orderId}: ${err?.message}`);
      return null;
    }
  }

  /**
   * Automated Stripe refund creation for duplicate payment protection or sold-out events
   */
  async refundPayment(params: { paymentIntentId: string; amount?: number; reason?: string; idempotencyKey?: string }): Promise<any> {
    const stripe = this.getStripe();
    if (!stripe || !params.paymentIntentId) return null;

    try {
      const requestOptions: Stripe.RequestOptions | undefined = params.idempotencyKey
        ? { idempotencyKey: String(params.idempotencyKey) }
        : undefined;

      const refund = await stripe.refunds.create(
        {
          payment_intent: params.paymentIntentId,
          amount: params.amount ? Math.round(params.amount * 100) : undefined,
          reason: (params.reason as any) || 'duplicate',
        },
        requestOptions,
      );
      this.logger.log(`[StripeProvider] Issued refund ${refund.id} for payment intent ${params.paymentIntentId}`);
      return refund;
    } catch (err: any) {
      this.logger.error(`[StripeProvider] Failed to issue refund: ${err?.message}`);
      throw err;
    }
  }
}
