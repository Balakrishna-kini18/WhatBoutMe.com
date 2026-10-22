import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  logSlowApiCall,
  ApiCacheManager,
  apiCacheManager,
  apiCache,
  getCacheKey,
  invalidateCache,
  invalidateTag,
  invalidateTags,
  autoInvalidateOnMutation,
  clearApiCacheOnLogout,
  calculateTaxForCurrency,
  computeOrderSignatureHash,
  formatInvoiceAmount,
  validateAgreementSignature,
  isStep1UnlockedAfterSigning,
  validateQuizConfiguration,
  evaluateQuestionGradingRule,
  routeContactInquiry,
  generateZoomMeetingLink,
  detectCalendarConflict,
  type QuestionBankItem,
  type QuizConfiguration,
} from './api';

describe('Admin Client Unit Test Suite (v2.0 Mandates)', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.restoreAllMocks();
    apiCache.clear();
    apiCacheManager.clear();
    (process.env as any).NODE_ENV = 'development';
  });

  afterEach(() => {
    (process.env as any).NODE_ENV = originalEnv;
    apiCache.clear();
    apiCacheManager.clear();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Slow-API Logger Diagnostics
  // =========================================================================
  describe('Client Slow-API Logger (logSlowApiCall)', () => {
    it('does NOT log anything when API call takes <= 500ms', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const tableSpy = vi.spyOn(console, 'table').mockImplementation(() => {});

      logSlowApiCall('GET', '/api/users', 200, 350, []);
      logSlowApiCall('POST', '/api/programs', 201, 500, []);

      expect(warnSpy).not.toHaveBeenCalled();
      expect(tableSpy).not.toHaveBeenCalled();
    });

    it('does NOT log in production even when duration exceeds 500ms', () => {
      (process.env as any).NODE_ENV = 'production';
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const tableSpy = vi.spyOn(console, 'table').mockImplementation(() => {});

      logSlowApiCall('GET', '/api/users', 200, 850, []);

      expect(warnSpy).not.toHaveBeenCalled();
      expect(tableSpy).not.toHaveBeenCalled();
    });

    it('logs console.warn and console.table when API call exceeds 500ms in development', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const tableSpy = vi.spyOn(console, 'table').mockImplementation(() => {});

      const headers: [string, string][] = [
        ['Server-Timing', 'db;dur=210.4, total;dur=620.1'],
        ['X-Prisma-Queries', '5'],
      ];

      logSlowApiCall('GET', 'http://localhost:4000/users', 200, 645.2, headers, 'Network');

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]?.[0]).toContain('[Slow API Warning] GET http://localhost:4000/users took 645.2ms');

      expect(tableSpy).toHaveBeenCalledTimes(1);
      const tableRows = tableSpy.mock.calls[0]?.[0];
      expect(tableRows).toHaveLength(1);
      expect(tableRows[0]).toEqual({
        Method: 'GET',
        URL: 'http://localhost:4000/users',
        Status: 200,
        'Client Total': '645.2ms',
        'Server Total': '620.1ms',
        'Server DB': '210.4ms',
        'DB Queries': '5',
        Source: 'Network',
      });
    });

    it('handles missing Server-Timing and X-Prisma-Queries headers with fallback N/A', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const tableSpy = vi.spyOn(console, 'table').mockImplementation(() => {});

      logSlowApiCall('POST', 'http://localhost:4000/reports', 201, 750, [], 'Deduplicated');

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(tableSpy).toHaveBeenCalledTimes(1);
      const tableRows = tableSpy.mock.calls[0]?.[0];
      expect(tableRows).toHaveLength(1);
      expect(tableRows[0]).toEqual({
        Method: 'POST',
        URL: 'http://localhost:4000/reports',
        Status: 201,
        'Client Total': '750ms',
        'Server Total': 'N/A',
        'Server DB': 'N/A',
        'DB Queries': '-',
        Source: 'Deduplicated',
      });
    });
  });

  // =========================================================================
  // 2. SWR Cache Manager & Deduplication
  // =========================================================================
  describe('SWR Cache Manager & In-Flight Deduplication', () => {
    it('manages LRU cache entries, enforces capacity limits, and checks expiration', () => {
      const manager = new ApiCacheManager(3);

      manager.set('key1', {
        bodyText: 'val1',
        status: 200,
        statusText: 'OK',
        headers: [],
        timestamp: Date.now(),
        ttlMs: 50,
      });
      manager.set('key2', {
        bodyText: 'val2',
        status: 200,
        statusText: 'OK',
        headers: [],
        timestamp: Date.now(),
        ttlMs: 60000,
      });
      manager.set('key3', {
        bodyText: 'val3',
        status: 200,
        statusText: 'OK',
        headers: [],
        timestamp: Date.now(),
        ttlMs: 60000,
      });

      expect(manager.size).toBe(3);
      expect(manager.has('key1')).toBe(true);
      expect(manager.has('key2')).toBe(true);

      // Adding 4th entry evicts oldest (key1)
      manager.set('key4', {
        bodyText: 'val4',
        status: 200,
        statusText: 'OK',
        headers: [],
        timestamp: Date.now(),
        ttlMs: 60000,
      });

      expect(manager.size).toBe(3);
      expect(manager.has('key1')).toBe(false);
      expect(manager.has('key4')).toBe(true);
    });

    it('tracks, shares, and purges in-flight promises across concurrent callers', async () => {
      const manager = new ApiCacheManager();
      const inFlightKey = 'GET:http://localhost:4000/programs:token';

      const sharedPromise = Promise.resolve({
        bodyText: JSON.stringify([{ id: 'prog-1' }]),
        status: 200,
        statusText: 'OK',
        headers: [['content-type', 'application/json']] as [string, string][],
      });

      manager.setInFlight(inFlightKey, sharedPromise);
      expect(manager.getInFlight(inFlightKey)).toBe(sharedPromise);

      const resolved = await manager.getInFlight(inFlightKey);
      expect(JSON.parse(resolved!.bodyText)).toEqual([{ id: 'prog-1' }]);

      manager.deleteInFlight(inFlightKey);
      expect(manager.getInFlight(inFlightKey)).toBeUndefined();
    });

    it('invalidates cache tags and prefixes deterministically on mutations', () => {
      apiCache.set('GET:http://localhost:4000/coupons:tok', {
        bodyText: '[]',
        status: 200,
        statusText: 'OK',
        headers: [],
        timestamp: Date.now(),
        ttlMs: 60000,
      });
      apiCache.set('GET:http://localhost:4000/invoices:tok', {
        bodyText: '[]',
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

      const purgedCoupons = invalidateTag('coupons');
      expect(purgedCoupons).toBe(1);
      expect(apiCache.has('GET:http://localhost:4000/coupons:tok')).toBe(false);
      expect(apiCache.has('GET:http://localhost:4000/invoices:tok')).toBe(true);

      const purgedMultiple = invalidateTags(['invoices', 'users']);
      expect(purgedMultiple).toBe(2);
      expect(apiCache.size).toBe(0);
    });
  });

  // =========================================================================
  // 3. Zero-Trust Payment & Multi-Currency Engine
  // =========================================================================
  describe('Zero-Trust Payment & Multi-Currency Engine', () => {
    it('calculates canonical jurisdiction taxes for AED, INR, and USD', () => {
      // UAE VAT (5%)
      const aed = calculateTaxForCurrency(2000, 'AED');
      expect(aed.taxRate).toBe(0.05);
      expect(aed.taxAmount).toBe(100);
      expect(aed.taxLabel).toContain('UAE VAT (5%)');

      // India GST (18%)
      const inr = calculateTaxForCurrency(10000, 'INR');
      expect(inr.taxRate).toBe(0.18);
      expect(inr.taxAmount).toBe(1800);
      expect(inr.taxLabel).toContain('India GST (18%)');

      // International Export (0%)
      const usd = calculateTaxForCurrency(1500, 'USD');
      expect(usd.taxRate).toBe(0);
      expect(usd.taxAmount).toBe(0);
      expect(usd.taxLabel).toContain('Export Tax (0%)');
    });

    it('formats invoice currency amounts correctly with precision and symbols', () => {
      expect(formatInvoiceAmount(1500.5, 'USD')).toBe('$1,500.50');
      expect(formatInvoiceAmount(2500, 'AED')).toBe('AED 2,500.00');
      expect(formatInvoiceAmount(9999, 'INR')).toBe('₹9,999.00');
    });

    it('computes deterministic SHA-256 order signature hash', async () => {
      const hash1 = await computeOrderSignatureHash(
        'order_123',
        'item_456',
        1050,
        'AED',
        'idemp_abc'
      );
      const hash2 = await computeOrderSignatureHash(
        'order_123',
        'item_456',
        1050,
        'AED',
        'idemp_abc'
      );
      const hashDifferent = await computeOrderSignatureHash(
        'order_123',
        'item_456',
        1051, // altered amount
        'AED',
        'idemp_abc'
      );

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hashDifferent);
      expect(hash1.length).toBeGreaterThan(16);
    });
  });

  // =========================================================================
  // 4. Dual-Mode Digital Workshop Agreement & E-Signature
  // =========================================================================
  describe('Dual-Mode Digital Workshop Agreement & Progression Gate', () => {
    it('rejects agreement execution if consent checkbox is not ticked', () => {
      const res = validateAgreementSignature({
        consentGiven: false,
        typedName: 'Roweena Foxwel',
        signatureType: 'DRAW',
        drawnSignature: 'data:image/svg+xml;utf8,<svg width="300" height="100"><path d="M10 20 L50 60"/></svg>',
      });

      expect(res.valid).toBe(false);
      expect(res.error).toContain('Consent checkbox must be explicitly checked');
    });

    it('rejects agreement execution if legal printed name is missing or empty', () => {
      const res = validateAgreementSignature({
        consentGiven: true,
        typedName: '   ',
        signatureType: 'DRAW',
        drawnSignature: 'data:image/svg+xml;utf8,<svg width="300" height="100"><path d="M10 20 L50 60"/></svg>',
      });

      expect(res.valid).toBe(false);
      expect(res.error).toContain('Full legal printed name is required');
    });

    it('rejects Draw Mode if vector drawn signature data is missing or empty', () => {
      const res = validateAgreementSignature({
        consentGiven: true,
        typedName: 'Roweena Foxwel',
        signatureType: 'DRAW',
        drawnSignature: '',
      });

      expect(res.valid).toBe(false);
      expect(res.error).toContain('Vector drawn signature is required');
    });

    it('rejects Upload Mode if signature image upload is missing or empty', () => {
      const res = validateAgreementSignature({
        consentGiven: true,
        typedName: 'Roweena Foxwel',
        signatureType: 'UPLOAD',
        signatureImage: '',
      });

      expect(res.valid).toBe(false);
      expect(res.error).toContain('Signature image upload is required');
    });

    it('validates successfully for both valid DRAW and UPLOAD signatures', () => {
      const validDraw = validateAgreementSignature({
        consentGiven: true,
        typedName: 'Roweena Foxwel',
        signatureType: 'DRAW',
        drawnSignature: 'data:image/svg+xml;utf8,<svg width="300" height="100"><path d="M10 20 L50 60 Z"/></svg>',
      });
      expect(validDraw.valid).toBe(true);

      const validUpload = validateAgreementSignature({
        consentGiven: true,
        typedName: 'Roweena Foxwel',
        signatureType: 'UPLOAD',
        signatureImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      });
      expect(validUpload.valid).toBe(true);
    });

    it('strictly locks Step 1 until agreement is signed and active', () => {
      // Case 1: Unsigned agreement
      const unsigned = isStep1UnlockedAfterSigning({
        isAgreementSigned: false,
        status: 'ACTIVE',
      });
      expect(unsigned.isUnlocked).toBe(false);
      expect(unsigned.lockReason).toContain('must be signed before Step 1 unlocks');

      // Case 2: Signed but pending payment status
      const pendingPayment = isStep1UnlockedAfterSigning({
        isAgreementSigned: true,
        status: 'PENDING_PAYMENT',
      });
      expect(pendingPayment.isUnlocked).toBe(false);
      expect(pendingPayment.lockReason).toContain('Active enrolment required');

      // Case 3: Signed & Active -> Step 1 Unlocked
      const unlocked = isStep1UnlockedAfterSigning({
        isAgreementSigned: true,
        status: 'ACTIVE',
      });
      expect(unlocked.isUnlocked).toBe(true);
      expect(unlocked.lockReason).toBeUndefined();
    });
  });

  // =========================================================================
  // 5. Configurable Quiz Placement & Visual Question Bank
  // =========================================================================
  describe('Configurable Quiz Placement & Visual Question Bank', () => {
    it('validates quiz configuration for BEFORE_VIDEO and AFTER_VIDEO placements', () => {
      const validConfig: QuizConfiguration = {
        stepId: 'step-module-1',
        placement: 'BEFORE_VIDEO',
        passMarkPercentage: 80,
        maxAttempts: 3,
        questions: [
          {
            id: 'q1',
            prompt: 'What is your baseline executive voice strength?',
            type: 'SINGLE_CHOICE',
            points: 10,
            options: [
              { id: 'opt1', text: 'Resonant and centered', isCorrect: true },
              { id: 'opt2', text: 'Strained under pressure', isCorrect: false },
            ],
          },
        ],
      };

      const result = validateQuizConfiguration(validConfig);
      expect(result.valid).toBe(true);

      // Rejects invalid placement
      const invalidPlacement = { ...validConfig, placement: 'DURING_VIDEO' as any };
      expect(validateQuizConfiguration(invalidPlacement).valid).toBe(false);

      // Rejects single-choice question with 0 or multiple correct options
      const invalidSingleChoice: QuizConfiguration = {
        ...validConfig,
        questions: [
          {
            id: 'q1',
            prompt: 'Choose one',
            type: 'SINGLE_CHOICE',
            points: 10,
            options: [
              { id: 'opt1', text: 'A', isCorrect: true },
              { id: 'opt2', text: 'B', isCorrect: true }, // Invalid: 2 correct options
            ],
          },
        ],
      };
      expect(validateQuizConfiguration(invalidSingleChoice).valid).toBe(false);
    });

    it('grades SINGLE_CHOICE, MULTIPLE_CHOICE, and TEXT_BOX questions accurately', () => {
      // 1. SINGLE_CHOICE
      const singleQ: QuestionBankItem = {
        id: 'q1',
        prompt: 'Select the primary tonal anchor',
        type: 'SINGLE_CHOICE',
        points: 5,
        options: [
          { id: 'optA', text: 'Diaphragm', isCorrect: true },
          { id: 'optB', text: 'Throat', isCorrect: false },
        ],
      };
      expect(evaluateQuestionGradingRule(singleQ, 'optA')).toEqual({ isCorrect: true, pointsAwarded: 5 });
      expect(evaluateQuestionGradingRule(singleQ, 'optB')).toEqual({ isCorrect: false, pointsAwarded: 0 });

      // 2. MULTIPLE_CHOICE
      const multiQ: QuestionBankItem = {
        id: 'q2',
        prompt: 'Select all foundational posture pillars',
        type: 'MULTIPLE_CHOICE',
        points: 10,
        options: [
          { id: 'p1', text: 'Neutral Pelvis', isCorrect: true },
          { id: 'p2', text: 'Slouched Shoulders', isCorrect: false },
          { id: 'p3', text: 'Elongated Cervical Spine', isCorrect: true },
        ],
      };
      expect(evaluateQuestionGradingRule(multiQ, ['p1', 'p3'])).toEqual({ isCorrect: true, pointsAwarded: 10 });
      expect(evaluateQuestionGradingRule(multiQ, ['p1'])).toEqual({ isCorrect: false, pointsAwarded: 0 }); // missing p3
      expect(evaluateQuestionGradingRule(multiQ, ['p1', 'p2', 'p3'])).toEqual({ isCorrect: false, pointsAwarded: 0 }); // included p2

      // 3. TEXT_BOX
      const textQ: QuestionBankItem = {
        id: 'q3',
        prompt: 'State the acronym for the breathing mechanism',
        type: 'TEXT_BOX',
        expectedAnswerText: 'PACE',
        points: 5,
      };
      expect(evaluateQuestionGradingRule(textQ, 'PACE')).toEqual({ isCorrect: true, pointsAwarded: 5 });
      expect(evaluateQuestionGradingRule(textQ, '  pace  ')).toEqual({ isCorrect: true, pointsAwarded: 5 }); // case-insensitive trimmed
      expect(evaluateQuestionGradingRule(textQ, 'FAST')).toEqual({ isCorrect: false, pointsAwarded: 0 });
    });
  });

  // =========================================================================
  // 6. Contact Us & Roweena's 15-Minute Discovery Call Conflict Check
  // =========================================================================
  describe('Contact Us & Discovery Call Booking Routing', () => {
    it('routes General Inquiry directly to staff messages inbox', () => {
      const res = routeContactInquiry({
        category: 'GENERAL_INQUIRY',
        name: 'Elena Rostova',
        email: 'elena@example.com',
        message: 'Looking for speaking engagements.',
      });

      expect(res.destination).toBe('STAFF_INBOX');
      expect(res.requiresCourseSelection).toBe(false);
      expect(res.scheduledDiscoveryCall).toBe(false);
      expect(res.messageId).toBeDefined();
    });

    it('routes Course Inquiry to CRM prospect leads and generates 15-min discovery Zoom link', () => {
      const res = routeContactInquiry({
        category: 'COURSE_INQUIRY',
        name: 'David Miller',
        email: 'david@example.com',
        courseId: 'course-11-steps',
        message: 'Interested in the executive leadership cohort.',
        requestedSlotUtc: '2026-11-01T10:00:00.000Z',
      });

      expect(res.destination).toBe('PROSPECT_CRM_LEADS');
      expect(res.requiresCourseSelection).toBe(true);
      expect(res.scheduledDiscoveryCall).toBe(true);
      expect(res.zoomMeetingLink).toContain('https://zoom.us/j/');
      expect(res.leadId).toBeDefined();
    });

    it('detectCalendarConflict blocks overlapping 15-minute booking slots on Roweena calendar', () => {
      const existingSessions = [
        {
          id: 'sess-1',
          title: '15-min Executive Discovery: John Doe',
          startTime: '2026-11-01T10:00:00.000Z',
          endTime: '2026-11-01T10:15:00.000Z',
          status: 'SCHEDULED',
          hostTrainer: { name: 'Roweena Foxwel', email: 'roweena@whatboutme.com' },
        },
      ];

      // Exact overlap (10:00 - 10:15)
      const exactOverlap = detectCalendarConflict(
        existingSessions,
        new Date('2026-11-01T10:00:00.000Z'),
        new Date('2026-11-01T10:15:00.000Z'),
        'roweena'
      );
      expect(exactOverlap.hasConflict).toBe(true);
      expect(exactOverlap.conflictingSession?.id).toBe('sess-1');

      // Partial overlap (10:10 - 10:25)
      const partialOverlap = detectCalendarConflict(
        existingSessions,
        new Date('2026-11-01T10:10:00.000Z'),
        new Date('2026-11-01T10:25:00.000Z'),
        'roweena'
      );
      expect(partialOverlap.hasConflict).toBe(true);

      // Adjacent non-overlapping slot (10:15 - 10:30)
      const adjacentNonOverlap = detectCalendarConflict(
        existingSessions,
        new Date('2026-11-01T10:15:00.000Z'),
        new Date('2026-11-01T10:30:00.000Z'),
        'roweena'
      );
      expect(adjacentNonOverlap.hasConflict).toBe(false);
    });

    it('generates secure Zoom meeting links with meeting ID and password', () => {
      const zoom = generateZoomMeetingLink('Sarah Connor', '2026-11-01T14:00:00.000Z');
      expect(zoom.joinUrl).toMatch(/^https:\/\/zoom\.us\/j\/\d+\?pwd=/);
      expect(zoom.hostUrl).toMatch(/^https:\/\/zoom\.us\/s\/\d+\?pwd=/);
      expect(zoom.meetingId).toBeDefined();
      expect(zoom.password).toMatch(/^WBM\d{4}$/);
    });
  });
});
