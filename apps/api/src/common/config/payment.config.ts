/**
 * Payment & Production Security Configuration Validator
 * Enforces fail-closed boot protection across API server, worker, and serverless handlers.
 */

export interface PaymentConfigAssertionOptions {
  env?: Record<string, string | undefined>;
  exitOnError?: boolean;
}

export function assertPaymentConfig(options?: PaymentConfigAssertionOptions): void {
  const env = options?.env || process.env;
  const isProduction = env.NODE_ENV === 'production';

  if (!isProduction) {
    return;
  }

  const errors: string[] = [];

  if (env.PAYMENT_MODE === 'mock') {
    errors.push('FATAL: PAYMENT_MODE=mock refuses to start in production. Set real Stripe env vars or PAYMENT_MODE=live.');
  }

  if (env.PAYMENT_PROVIDER && env.PAYMENT_PROVIDER.toUpperCase() !== 'STRIPE') {
    errors.push(`FATAL: PAYMENT_PROVIDER must be STRIPE in production (received ${env.PAYMENT_PROVIDER}).`);
  }

  const secretKey = env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    errors.push('FATAL: STRIPE_SECRET_KEY is required in production.');
  } else if (!secretKey.startsWith('sk_live_') && !secretKey.startsWith('sk_test_')) {
    errors.push('FATAL: STRIPE_SECRET_KEY must be a valid Stripe secret key (sk_live_... or sk_test_...).');
  } else if (secretKey.startsWith('sk_test_')) {
    console.log('[Payment Config] Running Stripe with test secret key (sk_test_...).');
  }

  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    errors.push('FATAL: STRIPE_WEBHOOK_SECRET is required in production.');
  } else if (!webhookSecret.startsWith('whsec_')) {
    console.warn('[Payment Config] STRIPE_WEBHOOK_SECRET does not start with whsec_.');
  }

  if (!env.JWT_SECRET || env.JWT_SECRET === 'fallback-secret' || env.JWT_SECRET.length < 32) {
    errors.push('FATAL SECURITY ERROR: JWT_SECRET must be configured with a cryptographically strong secret (minimum 32 characters) in production.');
  }

  if (errors.length > 0) {
    const message = errors.join('\n');
    console.error(message);
    if (options?.exitOnError !== false) {
      process.exit(1);
    }
    throw new Error(message);
  }
}

