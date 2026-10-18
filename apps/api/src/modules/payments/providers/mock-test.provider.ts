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
export class MockTestPaymentProvider implements IPaymentProvider {
  readonly providerType: PaymentProviderType = 'MOCK_TEST';
  private readonly logger = new Logger(MockTestPaymentProvider.name);

  async createOrder(params: CreateOrderParams): Promise<CreateOrderResult> {
    const timestamp = Date.now();
    const orderId = `test_ord_${timestamp}_${Math.floor(1000 + Math.random() * 9000)}`;

    this.logger.log(
      `[TEST_BYPASS] Created simulated checkout order ${orderId} for ${params.targetType}:${params.targetId} (${params.amount} ${params.currency})`
    );

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
        targetType: params.targetType,
        targetId: params.targetId,
      },
    };
  }

  async verifyWebhook(params: VerifyWebhookParams): Promise<WebhookVerificationResult> {
    const payload = params.rawPayload || {};
    const transactionId =
      payload.transactionId ||
      payload.paymentId ||
      `test_pay_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
    const status = payload.status === 'FAILED' ? 'FAILED' : 'PAID';

    return {
      isVerified: true,
      eventType: status === 'PAID' ? 'payment.succeeded' : 'payment.failed',
      transactionId,
      orderId: payload.orderId || payload.gatewayOrderId,
      status,
      amount: Number(payload.amount) || 0,
      currency: (payload.currency || 'USD').toUpperCase(),
      metadata: payload.metadata || {},
    };
  }
}
