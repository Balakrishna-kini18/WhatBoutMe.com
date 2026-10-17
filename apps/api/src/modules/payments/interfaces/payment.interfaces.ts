export type SupportedCurrency = 'USD' | 'AED' | 'INR';

export type PaymentProviderType = 'MOCK_TEST' | 'RAZORPAY' | 'STRIPE';

export type PaymentTargetType = 'ENROLMENT' | 'EVENT';

export interface CreateOrderParams {
  amount: number;
  currency: SupportedCurrency;
  targetType: PaymentTargetType;
  targetId: string;
  userId?: string;
  customerEmail: string;
  customerName?: string;
  customerPhone?: string;
  idempotencyKey?: string;
  metadata?: Record<string, any>;
}

export interface CreateOrderResult {
  provider: PaymentProviderType;
  orderId: string;
  amount: number;
  currency: SupportedCurrency;
  status: 'PENDING' | 'CREATED';
  clientSecret?: string;
  checkoutUrl?: string;
  simulationBypass: boolean;
  metadata?: Record<string, any>;
}

export interface VerifyWebhookParams {
  rawPayload: any;
  headers?: Record<string, string>;
  signature?: string;
}

export interface WebhookVerificationResult {
  isVerified: boolean;
  eventType: string;
  transactionId: string;
  orderId?: string;
  status: 'PAID' | 'FAILED' | 'REFUNDED';
  amount: number;
  currency: SupportedCurrency;
  metadata?: Record<string, any>;
}

export interface IPaymentProvider {
  readonly providerType: PaymentProviderType;
  createOrder(params: CreateOrderParams): Promise<CreateOrderResult>;
  verifyWebhook(params: VerifyWebhookParams): Promise<WebhookVerificationResult>;
}
