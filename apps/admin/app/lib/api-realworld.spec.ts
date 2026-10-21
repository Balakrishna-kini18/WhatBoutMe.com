import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getCacheKey,
  autoInvalidateOnMutation,
  apiCache,
  apiCacheManager,
  ApiCacheManager,
  clearApiCacheOnLogout,
  invalidateCache,
  logSlowApiCall,
  cachedFetch,
  calculateTaxForCurrency,
  computeOrderSignatureHash,
  createCheckoutOrderIntent,
  validateAndApplyCouponCode,
  verifyPaymentWebhookSignature,
  generateLeadCheckoutPaymentLink,
  issueSequentialFzeInvoice,
  formatInvoiceAmount,
  type PaymentGatewayProvider,
  type SupportedCurrency,
  type CheckoutOrderIntent,
} from './api';

describe('Admin Client Real-World Resilience & Cache Integrity', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    apiCache.clear();
    vi.restoreAllMocks();
    (process.env as any).NODE_ENV = 'development';
  });

  afterEach(() => {
    (process.env as any).NODE_ENV = originalEnv;
    apiCache.clear();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // SCENARIO 1: Multi-User Cache Key Isolation (Zero Tenant Cross-Contamination)
  // =========================================================================
  it('Scenario 1: Distinct auth tokens produce distinct cache keys preventing multi-user data leakage', () => {
    const url = 'http://localhost:4000/api/v1/profile';

    const tokenA = 'Bearer eyJhbGciOi...userA';
    const tokenB = 'Bearer eyJhbGciOi...userB';

    const keyUserA = getCacheKey(url, { Authorization: tokenA });
    const keyUserB = getCacheKey(url, { Authorization: tokenB });

    expect(keyUserA).not.toBe(keyUserB);
    expect(keyUserA).toContain(tokenA);
    expect(keyUserB).toContain(tokenB);

    // Populate cache for User A
    apiCache.set(keyUserA, {
      bodyText: JSON.stringify({ name: 'User A', email: 'a@example.com' }),
      status: 200,
      statusText: 'OK',
      headers: [],
      timestamp: Date.now(),
      ttlMs: 60000,
    });

    // User B must NOT see User A's cached entry
    expect(apiCache.get(keyUserB)).toBeUndefined();
    expect(apiCache.get(keyUserA)).toBeDefined();
  });

  // =========================================================================
  // SCENARIO 2: Automatic Cache Invalidation on Mutations
  // =========================================================================
  it('Scenario 2: Mutating invoices automatically purges both /invoices and dependent /revenue caches', () => {
    apiCache.set('GET:http://localhost:4000/invoices:tok', {
      bodyText: '[]',
      status: 200,
      statusText: 'OK',
      headers: [],
      timestamp: Date.now(),
      ttlMs: 60000,
    });

    apiCache.set('GET:http://localhost:4000/revenue:tok', {
      bodyText: '{"total": 5000}',
      status: 200,
      statusText: 'OK',
      headers: [],
      timestamp: Date.now(),
      ttlMs: 60000,
    });

    apiCache.set('GET:http://localhost:4000/users:tok', {
      bodyText: '[]',
      status: 200,
      statusText: 'OK',
      headers: [],
      timestamp: Date.now(),
      ttlMs: 60000,
    });

    // Admin creates an invoice
    autoInvalidateOnMutation('http://localhost:4000/invoices');

    // Both /invoices and /revenue must be purged
    expect(apiCache.has('GET:http://localhost:4000/invoices:tok')).toBe(false);
    expect(apiCache.has('GET:http://localhost:4000/revenue:tok')).toBe(false);

    // Unrelated domains (like /users) must remain safely cached
    expect(apiCache.has('GET:http://localhost:4000/users:tok')).toBe(true);
  });

  // =========================================================================
  // SCENARIO 3: Slow API Logger Diagnostics Under Heavy Latency
  // =========================================================================
  it('Scenario 3: Slow API logger correctly formats console table with parsed Server-Timing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tableSpy = vi.spyOn(console, 'table').mockImplementation(() => {});

    const mockHeaders = [
      ['server-timing', 'db;dur=412.3, total;dur=745.8'],
      ['x-prisma-queries', '4'],
    ] as [string, string][];

    logSlowApiCall('POST', 'http://localhost:4000/reports/generate', 200, 780.5, mockHeaders, 'Network');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('[Slow API Warning] POST http://localhost:4000/reports/generate took 780.5ms');

    expect(tableSpy).toHaveBeenCalledTimes(1);
    const tableRows = tableSpy.mock.calls[0]?.[0];
    expect(tableRows[0]).toEqual({
      Method: 'POST',
      URL: 'http://localhost:4000/reports/generate',
      Status: 200,
      'Client Total': '780.5ms',
      'Server Total': '745.8ms',
      'Server DB': '412.3ms',
      'DB Queries': '4',
      Source: 'Network',
    });
  });

  // =========================================================================
  // SCENARIO 4: Fast API Calls (<= 500ms) Produce Zero Console Noise
  // =========================================================================
  it('Scenario 4: Fast responses under 500ms emit 0 console warnings and 0 tables', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tableSpy = vi.spyOn(console, 'table').mockImplementation(() => {});

    logSlowApiCall('GET', 'http://localhost:4000/website/hero', 200, 12.4, [], 'Network');
    logSlowApiCall('GET', 'http://localhost:4000/programs', 200, 480.0, [], 'Network');

    expect(warnSpy).not.toHaveBeenCalled();
    expect(tableSpy).not.toHaveBeenCalled();
  });

  // =========================================================================
  // SCENARIO 5: In-Flight Deduplication for Concurrent Identical GET Requests
  // =========================================================================
  it('Scenario 5: Concurrent GET requests share a single in-flight network request', async () => {
    let networkFetchCount = 0;
    const originalFetch = global.fetch;

    global.fetch = vi.fn().mockImplementation(async () => {
      networkFetchCount++;
      // Simulate 50ms network delay
      await new Promise((r) => setTimeout(r, 50));
      return new Response(JSON.stringify({ data: 'payload' }), {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'application/json' },
      });
    });

    try {
      const url = 'http://localhost:4000/programs';
      // Fire 3 simultaneous GET requests
      const [res1, res2, res3] = await Promise.all([
        cachedFetch(url),
        cachedFetch(url),
        cachedFetch(url),
      ]);

      const data1 = await res1.json();
      const data2 = await res2.json();
      const data3 = await res3.json();

      expect(data1).toEqual({ data: 'payload' });
      expect(data2).toEqual({ data: 'payload' });
      expect(data3).toEqual({ data: 'payload' });

      // Only 1 real HTTP fetch must have occurred
      expect(networkFetchCount).toBe(1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  // =========================================================================
  // SCENARIO 6: SWR Cache Hit Returns Immediately (<15ms)
  // =========================================================================
  it('Scenario 6: SWR cache hit serves response immediately without network roundtrip', async () => {
    const url = 'http://localhost:4000/admin/dashboard';
    const key = getCacheKey(url);

    apiCache.set(key, {
      bodyText: JSON.stringify({ totalLearners: 42 }),
      status: 200,
      statusText: 'OK',
      headers: [['content-type', 'application/json']],
      timestamp: Date.now(),
      ttlMs: 30000,
    });

    const start = performance.now();
    const res = await cachedFetch(url);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(15);
    const json = await res.json();
    expect(json.totalLearners).toBe(42);
  });

  // =========================================================================
  // SCENARIO 7: Lead Mutation Invalidates Leads, Meetings, Invoices & Revenue
  // =========================================================================
  it('Scenario 7: Mutating leads invalidates /leads, /meetings, /sessions, /invoices, and /revenue', () => {
    apiCache.set('GET:http://localhost:4000/leads:tok', {
      bodyText: '[]',
      status: 200,
      statusText: 'OK',
      headers: [],
      timestamp: Date.now(),
      ttlMs: 30000,
    });
    apiCache.set('GET:http://localhost:4000/meetings:tok', {
      bodyText: '[]',
      status: 200,
      statusText: 'OK',
      headers: [],
      timestamp: Date.now(),
      ttlMs: 30000,
    });
    apiCache.set('GET:http://localhost:4000/sessions:tok', {
      bodyText: '[]',
      status: 200,
      statusText: 'OK',
      headers: [],
      timestamp: Date.now(),
      ttlMs: 30000,
    });
    apiCache.set('GET:http://localhost:4000/invoices:tok', {
      bodyText: '[]',
      status: 200,
      statusText: 'OK',
      headers: [],
      timestamp: Date.now(),
      ttlMs: 30000,
    });
    apiCache.set('GET:http://localhost:4000/revenue:tok', {
      bodyText: '{}',
      status: 200,
      statusText: 'OK',
      headers: [],
      timestamp: Date.now(),
      ttlMs: 30000,
    });
    apiCache.set('GET:http://localhost:4000/users:tok', {
      bodyText: '[]',
      status: 200,
      statusText: 'OK',
      headers: [],
      timestamp: Date.now(),
      ttlMs: 30000,
    });

    autoInvalidateOnMutation('http://localhost:4000/leads/lead-123/convert');

    expect(apiCache.has('GET:http://localhost:4000/leads:tok')).toBe(false);
    expect(apiCache.has('GET:http://localhost:4000/meetings:tok')).toBe(false);
    expect(apiCache.has('GET:http://localhost:4000/sessions:tok')).toBe(false);
    expect(apiCache.has('GET:http://localhost:4000/invoices:tok')).toBe(false);
    expect(apiCache.has('GET:http://localhost:4000/revenue:tok')).toBe(false);
    // Unrelated user cache remains untouched
    expect(apiCache.has('GET:http://localhost:4000/users:tok')).toBe(true);
  });

  // =========================================================================
  // SCENARIO 8: Zero Leakage Across User Logout (clearApiCacheOnLogout)
  // =========================================================================
  it('Scenario 8: clearApiCacheOnLogout() completely wipes cache and pending requests', () => {
    apiCache.set('GET:http://localhost:4000/admin/enrolments:tok', {
      bodyText: '[]',
      status: 200,
      statusText: 'OK',
      headers: [],
      timestamp: Date.now(),
      ttlMs: 30000,
    });

    expect(apiCache.size).toBeGreaterThan(0);

    clearApiCacheOnLogout();

    expect(apiCache.size).toBe(0);
    expect(apiCacheManager.size).toBe(0);
  });

  // =========================================================================
  // SCENARIO 9: ApiCacheManager Strongly-Typed Methods & In-Flight Tracking
  // =========================================================================
  it('Scenario 9: ApiCacheManager manages cache, in-flight map, and prefix invalidation', () => {
    const manager = new ApiCacheManager(5);

    manager.set('GET:/test:1', {
      bodyText: 'test1',
      status: 200,
      statusText: 'OK',
      headers: [],
      timestamp: Date.now(),
      ttlMs: 10000,
    });

    expect(manager.has('GET:/test:1')).toBe(true);
    expect(manager.get('GET:/test:1')?.bodyText).toBe('test1');

    const mockPromise = Promise.resolve({
      bodyText: 'in-flight',
      status: 200,
      statusText: 'OK',
      headers: [] as [string, string][],
    });

    manager.setInFlight('GET:/pending', mockPromise);
    expect(manager.getInFlight('GET:/pending')).toBe(mockPromise);

    manager.deleteInFlight('GET:/pending');
    expect(manager.getInFlight('GET:/pending')).toBeUndefined();

    manager.clear();
    expect(manager.size).toBe(0);
  });

  // =========================================================================
  // SCENARIO 10: Zero-Trust Multi-Currency Tax Rules (AED 5%, INR 18%, USD 0%)
  // =========================================================================
  it('Scenario 10: Multi-currency tax calculation accurately enforces 5% UAE VAT, 18% India GST, and 0% USD export', () => {
    // AED (UAE VAT 5%)
    const aedTax = calculateTaxForCurrency(1000, 'AED');
    expect(aedTax.taxRate).toBe(0.05);
    expect(aedTax.taxAmount).toBe(50);
    expect(aedTax.taxLabel).toContain('UAE VAT (5%)');

    // INR (India GST 18%)
    const inrTax = calculateTaxForCurrency(10000, 'INR');
    expect(inrTax.taxRate).toBe(0.18);
    expect(inrTax.taxAmount).toBe(1800);
    expect(inrTax.taxLabel).toContain('India GST (18%)');

    // USD (Export 0%)
    const usdTax = calculateTaxForCurrency(500, 'USD');
    expect(usdTax.taxRate).toBe(0);
    expect(usdTax.taxAmount).toBe(0);
    expect(usdTax.taxLabel).toContain('Export Tax (0%)');
  });

  // =========================================================================
  // SCENARIO 11: Zero-Trust CheckoutOrderIntent Generation & Price Locking
  // =========================================================================
  it('Scenario 11: createCheckoutOrderIntent computes server-locked finalPayableAmount, tax, and signatureHash', async () => {
    const originalFetch = global.fetch;

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/programs/prog-123')) {
        return new Response(JSON.stringify({ id: 'prog-123', price: 1000, priceAED: 3600 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 404 });
    });

    try {
      const intent = await createCheckoutOrderIntent({
        itemType: 'COURSE_ENROLMENT',
        itemId: 'prog-123',
        currency: 'AED',
        gatewayProvider: 'RAZORPAY',
      });

      expect(intent.orderId).toContain('order_enr_');
      expect(intent.baseAmount).toBe(3600);
      expect(intent.taxAmount).toBe(180); // 5% of 3600
      expect(intent.finalPayableAmount).toBe(3780); // 3600 + 180
      expect(intent.currency).toBe('AED');
      expect(intent.gatewayProvider).toBe('RAZORPAY');
      expect(intent.status).toBe('CREATED');
      expect(intent.signatureHash).toBeDefined();
      expect(intent.signatureHash.length).toBeGreaterThan(0);
      expect(intent.idempotencyKey).toBeDefined();
    } finally {
      global.fetch = originalFetch;
    }
  });

  // =========================================================================
  // SCENARIO 12: Zero-Trust Coupon Validation & Scope Enforcement
  // =========================================================================
  it('Scenario 12: validateAndApplyCouponCode rejects invalid currency and enforces course-specific discounts', async () => {
    const originalFetch = global.fetch;

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/admin/coupons?code=PROMO20')) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 'coup-1',
                code: 'PROMO20',
                discountType: 'PERCENTAGE',
                discountValue: 20,
                currency: 'USD',
                scope: 'SPECIFIC_COURSES',
                maxTotalUses: 10,
                currentUses: 2,
                isActive: true,
                programs: [{ id: 'course-valid' }],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('{}', { status: 404 });
    });

    try {
      // 1. Should reject if currency is INR but coupon is USD-only
      const invalidCurr = await validateAndApplyCouponCode('PROMO20', 'INR', 'course-valid', 500);
      expect(invalidCurr.valid).toBe(false);
      expect(invalidCurr.message).toContain('USD');

      // 2. Should reject if applied to an excluded course
      const invalidCourse = await validateAndApplyCouponCode('PROMO20', 'USD', 'course-excluded', 500);
      expect(invalidCourse.valid).toBe(false);
      expect(invalidCourse.message).toContain('cannot be applied to this specific course');

      // 3. Should apply successfully for valid course and currency
      const valid = await validateAndApplyCouponCode('PROMO20', 'USD', 'course-valid', 500);
      expect(valid.valid).toBe(true);
      expect(valid.discountAmount).toBe(100); // 20% of 500
      expect(valid.finalAmount).toBe(400);
    } finally {
      global.fetch = originalFetch;
    }
  });

  // =========================================================================
  // SCENARIO 13: Webhook Signature Verification Across Multi-Gateway Switch
  // =========================================================================
  it('Scenario 13: verifyPaymentWebhookSignature verifies Razorpay, Stripe, and Sandbox Escrow with idempotency', async () => {
    // 1. Razorpay signature verification
    const razorpayRes = await verifyPaymentWebhookSignature({
      gatewayProvider: 'RAZORPAY',
      rawPayload: { orderId: 'order_123', amount: 500, currency: 'USD' },
      signature: 'abcdef1234567890abcdef1234567890abcdef12',
      idempotencyKey: 'idemp_rzp_1',
    });
    expect(razorpayRes.verified).toBe(true);
    expect(razorpayRes.status).toBe('CAPTURED');

    // 2. Stripe signature verification
    const stripeRes = await verifyPaymentWebhookSignature({
      gatewayProvider: 'STRIPE',
      rawPayload: { orderId: 'order_456', amount: 350, currency: 'AED' },
      signature: 't=1600000000,v1=abcdef1234567890abcdef1234567890abcdef12',
      idempotencyKey: 'idemp_str_1',
    });
    expect(stripeRes.verified).toBe(true);
    expect(stripeRes.status).toBe('CAPTURED');

    // 3. Sandbox Escrow signed token verification
    const escrowRes = await verifyPaymentWebhookSignature({
      gatewayProvider: 'SANDBOX_ESCROW',
      rawPayload: { orderId: 'order_789', amount: 1500, currency: 'INR' },
      signature: 'sig_escrow_valid_token_12345',
      idempotencyKey: 'idemp_escrow_1',
    });
    expect(escrowRes.verified).toBe(true);
    expect(escrowRes.status).toBe('CAPTURED');
  });

  // =========================================================================
  // SCENARIO 14: Sequential FZE Invoice Issuance (WBM-FZE-YYYY-XXXX)
  // =========================================================================
  it('Scenario 14: issueSequentialFzeInvoice issues standard WhatBoutMe FZE formatted invoice', async () => {
    const originalFetch = global.fetch;

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/invoices')) {
        return new Response(
          JSON.stringify({
            id: 'inv-rec-1',
            invoiceNumber: 'WBM-FZE-2026-0042',
            pdfUrl: '/api/invoices/inv-rec-1/pdf',
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('{}', { status: 404 });
    });

    try {
      const inv = await issueSequentialFzeInvoice({
        clientName: 'Sarah Jenkins',
        clientEmail: 'sarah@example.com',
        baseAmount: 1000,
        currency: 'AED',
        status: 'PAID',
      });

      expect(inv.invoiceNumber).toMatch(/^WBM-FZE-2026-\d{4}$/);
      expect(inv.client).toBe('Sarah Jenkins');
      expect(inv.numericAmount).toBe(1050); // 1000 + 5% VAT (50)
      expect(inv.amount).toContain('1,050');
    } finally {
      global.fetch = originalFetch;
    }
  });

  // =========================================================================
  // SCENARIO 15: Post-Discovery-Call Signed Lead Checkout Link Generation
  // =========================================================================
  it('Scenario 15: generateLeadCheckoutPaymentLink creates time-bound signed checkout link with server price', async () => {
    const originalFetch = global.fetch;

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/leads/lead-999/convert-and-send-link')) {
        return new Response(
          JSON.stringify({
            checkoutUrl: 'https://whatboutme.com/checkout?token=signed_token_999',
            token: 'signed_token_999',
            amount: 1200,
            emailSent: true,
            expiresAtUtc: '2026-10-24T10:00:00.000Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('{}', { status: 404 });
    });

    try {
      const result = await generateLeadCheckoutPaymentLink({
        leadId: 'lead-999',
        courseId: 'course-11-steps',
        currency: 'USD',
        note: 'Completed discovery call with Roweena.',
      });

      expect(result.success).toBe(true);
      expect(result.checkoutUrl).toContain('signed_token_999');
      expect(result.amount).toBe(1200);
      expect(result.emailSent).toBe(true);
      expect(result.currency).toBe('USD');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
