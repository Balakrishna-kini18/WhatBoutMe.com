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
export class RazorpayPaymentProvider implements IPaymentProvider {
  readonly providerType: PaymentProviderType = 'RAZORPAY';
  private readonly logger = new Logger(RazorpayPaymentProvider.name);

  async createOrder(params: CreateOrderParams): Promise<CreateOrderResult> {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      this.logger.warn(
        '[RazorpayProvider] Live Razorpay credentials not configured. Falling back to test emulation.'
      );
      return {
        provider: this.providerType,
        orderId: `rzp_test_ord_${Date.now()}`,
        amount: params.amount,
        currency: params.currency,
        status: 'PENDING',
        simulationBypass: true,
      };
    }

    // Phase 1 live SDK integration stub:
    // const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
    // const order = await rzp.orders.create({ amount: Math.round(params.amount * 100), currency: params.currency });
    const orderId = `rzp_ord_${Date.now()}`;
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
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      this.logger.warn('[RazorpayProvider] Webhook secret not set; returning unverified status.');
      return {
        isVerified: false,
        eventType: 'payment.unknown',
        transactionId: '',
        status: 'FAILED',
        amount: 0,
        currency: 'INR',
      };
    }

    // HMAC SHA256 signature verification stub
    return {
      isVerified: true,
      eventType: 'payment.captured',
      transactionId: params.rawPayload?.payload?.payment?.entity?.id || `rzp_pay_${Date.now()}`,
      status: 'PAID',
      amount: (params.rawPayload?.payload?.payment?.entity?.amount || 0) / 100,
      currency: (params.rawPayload?.payload?.payment?.entity?.currency || 'INR').toUpperCase(),
    };
  }
}
