import { Injectable, Logger } from '@nestjs/common';
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
      this.logger.warn(
        '[StripeProvider] Stripe not initialized. Falling back to test emulation order.'
      );
      const orderId = `cs_test_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
      return {
        provider: this.providerType,
        orderId,
        amount: params.amount,
        currency: params.currency,
        status: 'PENDING',
        simulationBypass: true,
        clientSecret: `mock_secret_${orderId}`,
        metadata: {
          ...params.metadata,
          idempotencyKey: params.idempotencyKey,
        },
      };
    }

    try {
      const { lmsUrl, marketingUrl } = getAppUrls();
      const isEvent = params.targetType === 'EVENT';
      const baseReturnUrl = isEvent ? marketingUrl : lmsUrl;

      const successUrl = isEvent
        ? `${baseReturnUrl}/events/${params.targetId}?session_id={CHECKOUT_SESSION_ID}&registered=1`
        : `${lmsUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;

      const cancelUrl = isEvent
        ? `${baseReturnUrl}/events/${params.targetId}?cancelled=1`
        : `${lmsUrl}/checkout?programId=${params.targetId}&cancelled=1`;

      // Base currency is always USD for WhatBoutMe FZE core with Stripe Adaptive Pricing enabled
      const unitAmountMinor = Math.round(Number(params.metadata?.baseAmountUSD || params.amount) * 100);
      const currencyLower = 'usd';

      // Clean metadata strings (Stripe metadata values must be strings <= 500 chars)
      const sanitizedMetadata: Record<string, string> = {
        targetType: String(params.targetType),
        targetId: String(params.targetId),
        enrolmentId: String(params.metadata?.enrolmentId || ''),
        userId: String(params.userId || ''),
        baseAmountUSD: String(params.metadata?.baseAmountUSD || params.amount),
        requestedCurrency: String(params.currency || 'USD'),
        couponCode: String(params.metadata?.couponCode || ''),
        couponId: String(params.metadata?.couponId || ''),
        idempotencyKey: String(params.idempotencyKey || ''),
      };

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: params.customerEmail ? String(params.customerEmail).trim().toLowerCase() : undefined,
        line_items: [
          {
            price_data: {
              currency: currencyLower,
              unit_amount: unitAmountMinor,
              product_data: {
                name: params.metadata?.title || 'WhatBoutMe Learning Program',
                description: isEvent
                  ? 'WhatBoutMe Masterclass / Workshop Entry Ticket'
                  : 'WhatBoutMe FZE Online Professional Program Enrolment',
              },
            },
            quantity: 1,
          },
        ],
        adaptive_pricing: {
          enabled: true,
        },
        metadata: sanitizedMetadata,
        client_reference_id: params.metadata?.enrolmentId || params.targetId,
        expires_at: Math.floor(Date.now() / 1000) + 1800, // 30 minutes
        success_url: successUrl,
        cancel_url: cancelUrl,
      });

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
      this.logger.warn(
        '[StripeProvider] Stripe SDK or webhook secret missing; performing standard JSON extraction.'
      );
      const dataObj = params.rawPayload?.data?.object || params.rawPayload || {};
      const status = dataObj?.payment_status === 'paid' || dataObj?.status === 'succeeded' ? 'PAID' : 'FAILED';
      return {
        isVerified: !process.env.NODE_ENV || process.env.NODE_ENV !== 'production',
        eventType: params.rawPayload?.type || 'checkout.session.completed',
        transactionId: dataObj?.id || `pi_${Date.now()}`,
        orderId: dataObj?.id,
        status,
        amount: (dataObj?.amount_total || 0) / 100,
        currency: (dataObj?.currency || 'USD').toUpperCase(),
        metadata: dataObj?.metadata || {},
      };
    }

    try {
      let event: Stripe.Event;

      if (Buffer.isBuffer(params.rawPayload) || typeof params.rawPayload === 'string') {
        event = stripe.webhooks.constructEvent(
          params.rawPayload,
          params.signature || '',
          webhookSecret
        );
      } else {
        // Fallback if payload was already parsed
        event = params.rawPayload;
      }

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
  async refundPayment(params: { paymentIntentId: string; amount?: number; reason?: string }): Promise<any> {
    const stripe = this.getStripe();
    if (!stripe || !params.paymentIntentId) return null;

    try {
      const refund = await stripe.refunds.create({
        payment_intent: params.paymentIntentId,
        amount: params.amount ? Math.round(params.amount * 100) : undefined,
        reason: (params.reason as any) || 'duplicate',
      });
      this.logger.log(`[StripeProvider] Issued refund ${refund.id} for payment intent ${params.paymentIntentId}`);
      return refund;
    } catch (err: any) {
      this.logger.error(`[StripeProvider] Failed to issue refund: ${err?.message}`);
      throw err;
    }
  }
}
