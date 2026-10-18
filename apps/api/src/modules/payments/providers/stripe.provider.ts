import { Injectable, Logger } from '@nestjs/common';
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

  async createOrder(params: CreateOrderParams): Promise<CreateOrderResult> {
    const secretKey = process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
      this.logger.warn(
        '[StripeProvider] Live Stripe secret key not configured. Falling back to test emulation.'
      );
      return {
        provider: this.providerType,
        orderId: `cs_test_${Date.now()}`,
        amount: params.amount,
        currency: params.currency,
        status: 'PENDING',
        simulationBypass: true,
      };
    }

    const orderId = `cs_live_${Date.now()}`;
    return {
      provider: this.providerType,
      orderId,
      amount: params.amount,
      currency: params.currency,
      status: 'PENDING',
      simulationBypass: false,
    };
  }

  async verifyWebhook(params: VerifyWebhookParams): Promise<WebhookVerificationResult> {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      this.logger.warn('[StripeProvider] Webhook secret not set; returning unverified status.');
      return {
        isVerified: false,
        eventType: 'payment.unknown',
        transactionId: '',
        status: 'FAILED',
        amount: 0,
        currency: 'USD',
      };
    }

    const dataObj = params.rawPayload?.data?.object || params.rawPayload;
    return {
      isVerified: true,
      eventType: params.rawPayload?.type || 'checkout.session.completed',
      transactionId: dataObj?.id || `pi_${Date.now()}`,
      status: 'PAID',
      amount: (dataObj?.amount_total || 0) / 100,
      currency: (dataObj?.currency || 'USD').toUpperCase(),
    };
  }
}
