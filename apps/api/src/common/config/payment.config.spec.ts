import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { assertPaymentConfig } from './payment.config.js';

describe('assertPaymentConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('no-ops when NODE_ENV is not production', () => {
    expect(() => {
      assertPaymentConfig({
        env: { NODE_ENV: 'development', PAYMENT_MODE: 'mock' },
        exitOnError: false,
      });
    }).not.toThrow();
  });

  it('throws in production when PAYMENT_MODE is mock', () => {
    expect(() => {
      assertPaymentConfig({
        env: {
          NODE_ENV: 'production',
          PAYMENT_MODE: 'mock',
          PAYMENT_PROVIDER: 'STRIPE',
          STRIPE_SECRET_KEY: 'sk_live_1234567890',
          STRIPE_WEBHOOK_SECRET: 'whsec_1234567890',
          JWT_SECRET: 'a-very-strong-and-secure-jwt-secret-min-32-chars',
        },
        exitOnError: false,
      });
    }).toThrow(/PAYMENT_MODE=mock refuses to start in production/);
  });

  it('throws in production when STRIPE_SECRET_KEY is missing', () => {
    expect(() => {
      assertPaymentConfig({
        env: {
          NODE_ENV: 'production',
          PAYMENT_MODE: 'live',
          PAYMENT_PROVIDER: 'STRIPE',
          STRIPE_WEBHOOK_SECRET: 'whsec_1234567890',
          JWT_SECRET: 'a-very-strong-and-secure-jwt-secret-min-32-chars',
        },
        exitOnError: false,
      });
    }).toThrow(/STRIPE_SECRET_KEY is required in production/);
  });

  it('rejects test stripe key in production unless ALLOW_STRIPE_TEST_KEYS=true', () => {
    expect(() => {
      assertPaymentConfig({
        env: {
          NODE_ENV: 'production',
          PAYMENT_MODE: 'live',
          PAYMENT_PROVIDER: 'STRIPE',
          STRIPE_SECRET_KEY: 'sk_test_12345',
          STRIPE_WEBHOOK_SECRET: 'whsec_1234567890',
          JWT_SECRET: 'a-very-strong-and-secure-jwt-secret-min-32-chars',
        },
        exitOnError: false,
      });
    }).toThrow(/STRIPE_SECRET_KEY must be a live key/);

    expect(() => {
      assertPaymentConfig({
        env: {
          NODE_ENV: 'production',
          PAYMENT_MODE: 'live',
          PAYMENT_PROVIDER: 'STRIPE',
          STRIPE_SECRET_KEY: 'sk_test_12345',
          STRIPE_WEBHOOK_SECRET: 'whsec_1234567890',
          JWT_SECRET: 'a-very-strong-and-secure-jwt-secret-min-32-chars',
          ALLOW_STRIPE_TEST_KEYS: 'true',
        },
        exitOnError: false,
      });
    }).not.toThrow();
  });

  it('throws in production when STRIPE_WEBHOOK_SECRET is missing or invalid', () => {
    expect(() => {
      assertPaymentConfig({
        env: {
          NODE_ENV: 'production',
          PAYMENT_MODE: 'live',
          PAYMENT_PROVIDER: 'STRIPE',
          STRIPE_SECRET_KEY: 'sk_live_12345',
          JWT_SECRET: 'a-very-strong-and-secure-jwt-secret-min-32-chars',
        },
        exitOnError: false,
      });
    }).toThrow(/STRIPE_WEBHOOK_SECRET is required/);

    expect(() => {
      assertPaymentConfig({
        env: {
          NODE_ENV: 'production',
          PAYMENT_MODE: 'live',
          PAYMENT_PROVIDER: 'STRIPE',
          STRIPE_SECRET_KEY: 'sk_live_12345',
          STRIPE_WEBHOOK_SECRET: 'not_whsec_secret',
          JWT_SECRET: 'a-very-strong-and-secure-jwt-secret-min-32-chars',
        },
        exitOnError: false,
      });
    }).toThrow(/valid webhook secret/);
  });

  it('passes completely in production when all valid live configurations are present', () => {
    expect(() => {
      assertPaymentConfig({
        env: {
          NODE_ENV: 'production',
          PAYMENT_MODE: 'live',
          PAYMENT_PROVIDER: 'STRIPE',
          STRIPE_SECRET_KEY: 'sk_live_real_key_12345',
          STRIPE_WEBHOOK_SECRET: 'whsec_real_secret_12345',
          JWT_SECRET: 'a-very-strong-and-secure-jwt-secret-min-32-chars',
        },
        exitOnError: false,
      });
    }).not.toThrow();
  });
});
