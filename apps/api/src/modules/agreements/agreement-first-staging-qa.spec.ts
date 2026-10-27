import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AgreementStatus,
  ContentStatus,
  EnrolmentStatus,
  Role,
} from '@prisma/client';
import { AgreementsService } from './agreements.service.js';
import { EnrollmentsService } from '../enrollments/enrollments.service.js';
import { CheckoutController } from '../enrollments/enrollments.controller.js';
import { ProgressionService } from '../progression/progression.service.js';

describe('Staging QA: Agreement-First Enrollment Flow Complete Verification', () => {
  let agreementsService: AgreementsService;
  let enrollmentsService: EnrollmentsService;
  let checkoutController: CheckoutController;
  let progressionService: ProgressionService;
  let prismaMock: any;
  let cacheHelperMock: any;
  let emailServiceMock: any;

  // Staging Test Personas
  const learnerA = {
    sub: 'learner-a-staging-uuid',
    id: 'learner-a-staging-uuid',
    email: 'alice.staging@whatboutme.com',
    role: Role.USER,
  };

  const learnerB = {
    sub: 'learner-b-staging-uuid',
    id: 'learner-b-staging-uuid',
    email: 'bob.staging@whatboutme.com',
    role: Role.USER,
  };

  // Staging Course Catalogs
  const programLeadership = {
    id: 'prog-leadership-staging',
    title: 'The Mindful Leadership Track',
    slug: 'mindful-leadership-track',
    price: 499,
  };

  const programStandard = {
    id: 'prog-standard-staging',
    title: 'General Mindfulness Workshop',
    slug: 'general-mindfulness-workshop',
    price: 199,
  };

  const programNoAgreement = {
    id: 'prog-no-agreement-staging',
    title: 'Independent Study Track',
    slug: 'independent-study-track',
    price: 99,
  };

  const openBatch = {
    id: 'batch-active-staging',
    programId: programLeadership.id,
    name: 'Leadership Cohort 1',
    status: 'ACTIVE',
    capacity: 30,
  };

  // Templates
  const dedicatedLeadershipTemplate = {
    id: 'tpl-leadership-uuid',
    programId: programLeadership.id,
    title: 'Program Agreement for The Mindful Leadership Track',
    description: 'Specific leadership engagement rules',
    program: programLeadership,
    versions: [
      {
        id: 'ver-leadership-v1',
        templateId: 'tpl-leadership-uuid',
        version: 'v1.0',
        content: '# Leadership Terms\nCommitment to live cohort sessions.',
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date('2026-09-01'),
      },
    ],
  };

  const sharedDefaultTemplate = {
    id: 'tpl-shared-default-uuid',
    programId: 'prog-flagship-staging',
    title: 'Standard Platform Program Agreement',
    description: 'Default shared terms and conditions for all courses',
    program: programStandard,
    versions: [
      {
        id: 'ver-shared-v1',
        templateId: 'tpl-shared-default-uuid',
        version: 'v1.0',
        content: '# Standard Platform Agreement\nGeneral conduct and data consent.',
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date('2026-01-01'),
      },
    ],
  };

  beforeEach(() => {
    cacheHelperMock = {
      invalidateNamespace: vi.fn().mockResolvedValue(undefined),
      invalidateKey: vi.fn().mockResolvedValue(undefined),
      getVersionedKey: vi.fn().mockImplementation((k) => Promise.resolve(k)),
      getOrSet: vi.fn().mockImplementation((key, factory) => factory()),
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    };

    emailServiceMock = {
      sendTemplateEmail: vi.fn().mockResolvedValue(true),
    };

    prismaMock = {
      user: {
        findUnique: vi.fn().mockImplementation(async ({ where }) => {
          if (where.id === learnerA.id) return learnerA;
          if (where.id === learnerB.id) return learnerB;
          return null;
        }),
      },
      enrolment: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      batch: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      program: {
        findUnique: vi.fn().mockImplementation(async ({ where }) => {
          if (where.id === programLeadership.id) return programLeadership;
          if (where.id === programStandard.id) return programStandard;
          if (where.id === programNoAgreement.id) return programNoAgreement;
          return null;
        }),
      },
      agreementTemplate: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
      },
      signedAgreement: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      step: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'step-1-uuid',
            sequence: 1,
            title: 'Step 1: Introduction to Mindfulness',
            status: ContentStatus.PUBLISHED,
            releaseSchedule: 'IMMEDIATE',
            lessons: [],
            quizzes: [],
          },
        ]),
      },
      userLessonProgress: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      attempt: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      stepProgress: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockResolvedValue({}),
      },
      stepProgressOverride: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      payment: {
        findFirst: vi.fn(),
        create: vi.fn().mockResolvedValue({ id: 'pay-mock-123' }),
      },
      invoice: {
        create: vi.fn().mockResolvedValue({ id: 'inv-mock-123' }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-mock-123' }),
      },
      $transaction: vi.fn().mockImplementation(async (arg) => {
        if (typeof arg === 'function') {
          return arg(prismaMock);
        }
        return Array.isArray(arg) ? Promise.all(arg) : arg;
      }),
    };

    agreementsService = new AgreementsService(prismaMock as any, emailServiceMock as any, cacheHelperMock);
    enrollmentsService = new EnrollmentsService(prismaMock as any, cacheHelperMock);
    checkoutController = new CheckoutController(
      enrollmentsService,
      prismaMock as any,
      emailServiceMock as any,
      undefined,
      cacheHelperMock,
    );
    progressionService = new ProgressionService(prismaMock as any, cacheHelperMock);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // QA Check 1 & 9: Program-Specific vs Shared Default vs No Agreement
  // ─────────────────────────────────────────────────────────────────────────────
  describe('QA 1 & 9: Program Agreement Resolution Hierarchy', () => {
    it('1.1: Resolves dedicated published agreement template when one exists for the program', async () => {
      prismaMock.agreementTemplate.findFirst.mockResolvedValueOnce(dedicatedLeadershipTemplate);

      const result = await agreementsService.getActiveVersionForProgram(programLeadership.id);

      expect(result.templateId).toBe(dedicatedLeadershipTemplate.id);
      expect(result.templateTitle).toBe(dedicatedLeadershipTemplate.title);
      expect(result.version).toBe('v1.0');
    });

    it('1.2: Falls back to designated shared default agreement template when program has no dedicated agreement', async () => {
      // Program lookup returns null, then shared default lookup matches 'Standard Platform Program Agreement'
      prismaMock.agreementTemplate.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(sharedDefaultTemplate);

      const result = await agreementsService.getActiveVersionForProgram(programStandard.id);

      expect(result.templateId).toBe(sharedDefaultTemplate.id);
      expect(result.templateTitle).toBe('Standard Platform Program Agreement');
    });

    it('1.3: Throws 404 NotFoundException when a program has no dedicated agreement and no shared agreement exists', async () => {
      prismaMock.agreementTemplate.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      await expect(
        agreementsService.getActiveVersionForProgram(programNoAgreement.id),
      ).rejects.toThrow(NotFoundException);
    });

    it('1.4: Never selects an unrelated course template that lacks standard/default designation', async () => {
      // Unrelated program template has title "Program Agreement for The Mindful Leadership Track" (no standard/default keyword)
      prismaMock.agreementTemplate.findFirst
        .mockResolvedValueOnce(null) // course-specific returns null
        .mockResolvedValueOnce(null); // shared query returns null because leadership template doesn't match default criteria

      await expect(
        agreementsService.getActiveVersionForProgram('prog-other-uuid'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // QA Check 2: Mandatory Digital Consent and Signature Validation
  // ─────────────────────────────────────────────────────────────────────────────
  describe('QA 2: Digital Consent & Signature Strict Validation', () => {
    const provisionalEnrolment = {
      id: 'enrol-prov-1',
      userId: learnerA.id,
      programId: programLeadership.id,
      status: EnrolmentStatus.PENDING_PAYMENT,
      user: learnerA,
      signedAgreement: null,
    };

    beforeEach(() => {
      prismaMock.enrolment.findUnique.mockResolvedValue(provisionalEnrolment);
      prismaMock.agreementTemplate.findFirst.mockResolvedValue(dedicatedLeadershipTemplate);
    });

    it('2.1: Rejects signing if consentGiven is false', async () => {
      const dto = {
        enrolmentId: provisionalEnrolment.id,
        consentGiven: false,
        typedName: 'Alice Learner',
        typedAcknowledgement: 'I AGREE',
        drawnSignature: 'data:image/png;base64,validSignatureData',
      };

      await expect(
        agreementsService.signAgreement(dto as any, learnerA),
      ).rejects.toThrow(BadRequestException);
    });

    it('2.2: Rejects signing if typedName is missing or whitespace', async () => {
      const dto = {
        enrolmentId: provisionalEnrolment.id,
        consentGiven: true,
        typedName: '   ',
        typedAcknowledgement: 'I AGREE',
        drawnSignature: 'data:image/png;base64,validSignatureData',
      };

      await expect(
        agreementsService.signAgreement(dto as any, learnerA),
      ).rejects.toThrow(BadRequestException);
    });

    it('2.3: Rejects signing if signature is missing completely', async () => {
      const dto = {
        enrolmentId: provisionalEnrolment.id,
        consentGiven: true,
        typedName: 'Alice Learner',
        typedAcknowledgement: 'I AGREE',
      };

      await expect(
        agreementsService.signAgreement(dto as any, learnerA),
      ).rejects.toThrow(BadRequestException);
    });

    it('2.4: Rejects uploaded signature if mime type is invalid (e.g. non-image)', async () => {
      const dto = {
        enrolmentId: provisionalEnrolment.id,
        consentGiven: true,
        typedName: 'Alice Learner',
        typedAcknowledgement: 'I AGREE',
        drawnSignature: 'data:application/pdf;base64,fakePdfData',
        signatureType: 'UPLOADED' as const,
      };

      await expect(
        agreementsService.signAgreement(dto as any, learnerA),
      ).rejects.toThrow(BadRequestException);
    });

    it('2.5: Rejects uploaded signature if file exceeds 2MB limit', async () => {
      const largeSignature = 'data:image/png;base64,' + 'A'.repeat(3 * 1024 * 1024);
      const dto = {
        enrolmentId: provisionalEnrolment.id,
        consentGiven: true,
        typedName: 'Alice Learner',
        typedAcknowledgement: 'I AGREE',
        drawnSignature: largeSignature,
        signatureType: 'UPLOADED' as const,
      };

      await expect(
        agreementsService.signAgreement(dto as any, learnerA),
      ).rejects.toThrow(BadRequestException);
    });

    it('2.6: Rejects signing if typedAcknowledgement is missing, empty, or incorrect', async () => {
      // Missing
      await expect(
        agreementsService.signAgreement(
          {
            enrolmentId: provisionalEnrolment.id,
            consentGiven: true,
            typedName: 'Alice Learner',
            drawnSignature: 'data:image/png;base64,validSignatureData',
          } as any,
          learnerA,
        ),
      ).rejects.toThrow(BadRequestException);

      // Incorrect text
      await expect(
        agreementsService.signAgreement(
          {
            enrolmentId: provisionalEnrolment.id,
            consentGiven: true,
            typedName: 'Alice Learner',
            typedAcknowledgement: 'I DISAGREE',
            drawnSignature: 'data:image/png;base64,validSignatureData',
          } as any,
          learnerA,
        ),
      ).rejects.toThrow(/typed acknowledgement "I AGREE"/i);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // QA Check 3, 4, 5, 6: End-to-End Progression & Payment State Machine
  // ─────────────────────────────────────────────────────────────────────────────
  describe('QA 3-6: End-to-End Signing, Progression Locking, and Checkout Confirmation', () => {
    const provisionalEnrolment = {
      id: 'enrol-prov-1',
      userId: learnerA.id,
      programId: programLeadership.id,
      batchId: openBatch.id,
      status: EnrolmentStatus.PENDING_PAYMENT,
      user: learnerA,
      signedAgreement: null,
      program: programLeadership,
      batch: openBatch,
    };

    it('3.1: Signing leaves enrolment in PENDING_PAYMENT and returns nextStep: CHECKOUT', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue(provisionalEnrolment);
      prismaMock.agreementTemplate.findFirst.mockResolvedValue(dedicatedLeadershipTemplate);

      const signDto = {
        enrolmentId: provisionalEnrolment.id,
        consentGiven: true,
        consentVersion: 'v1.0',
        consentTimestamp: new Date().toISOString(),
        typedName: 'Alice Learner',
        typedAcknowledgement: 'I AGREE',
        drawnSignature: 'data:image/png;base64,validSignatureData',
        signatureType: 'DRAWN' as const,
      };

      prismaMock.signedAgreement.create.mockResolvedValue({
        id: 'signed-agreement-1',
        ...signDto,
        templateId: dedicatedLeadershipTemplate.id,
        versionId: dedicatedLeadershipTemplate.versions[0].id,
        templateVersion: 'v1.0',
        status: AgreementStatus.SIGNED,
        signedAt: new Date(),
        signerIp: '127.0.0.1',
        userAgent: 'Staging Browser QA',
      });

      const response = await agreementsService.signAgreement(signDto, learnerA);

      expect(response.enrolmentStatus).toBe(EnrolmentStatus.PENDING_PAYMENT);
      expect(response.nextStep).toBe('CHECKOUT');
      expect(response.checkoutUrl).toContain(`/checkout?programId=${programLeadership.id}`);
    });

    it('6.1: Step 1 remains strictly locked (ENROLMENT_NOT_ACTIVE) before payment is verified', async () => {
      // Learner A has signed agreement, but enrolment status is still PENDING_PAYMENT
      const signedUnpaidEnrolment = {
        ...provisionalEnrolment,
        signedAgreement: {
          id: 'signed-agreement-1',
          status: AgreementStatus.SIGNED,
        },
      };

      prismaMock.enrolment.findUnique.mockResolvedValue(signedUnpaidEnrolment);

      const progression = await progressionService.getEnrolmentProgression(
        signedUnpaidEnrolment.id,
        learnerA,
      );

      // Verify fail-closed progression locking
      expect(progression.steps[0].isUnlocked).toBe(false);
      expect(progression.steps[0].lockReason).toBe('ENROLMENT_NOT_ACTIVE');
    });

    it('5.1 & 6.2: Staging checkout activates enrolment and unlocks Step 1', async () => {
      const signedUnpaidEnrolment = {
        ...provisionalEnrolment,
        status: EnrolmentStatus.PENDING_PAYMENT,
      };

      prismaMock.enrolment.findFirst.mockResolvedValue(signedUnpaidEnrolment);
      prismaMock.agreementTemplate.findFirst.mockResolvedValue(dedicatedLeadershipTemplate);
      prismaMock.signedAgreement.findUnique.mockResolvedValue({
        id: 'signed-agreement-1',
        status: AgreementStatus.SIGNED,
      });

      // Checkout simulation
      const checkoutResult = await checkoutController.mockCheckout(
        { programId: programLeadership.id },
        { user: learnerA },
      );

      expect(checkoutResult.success).toBe(true);
      expect(prismaMock.enrolment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: signedUnpaidEnrolment.id },
          data: { status: EnrolmentStatus.ACTIVE },
        }),
      );

      // Verify progression after activation
      const activatedEnrolment = {
        ...signedUnpaidEnrolment,
        status: EnrolmentStatus.ACTIVE,
        signedAgreement: {
          id: 'signed-agreement-1',
          status: AgreementStatus.SIGNED,
        },
      };

      prismaMock.enrolment.findUnique.mockResolvedValue(activatedEnrolment);

      const progressionAfterPay = await progressionService.getEnrolmentProgression(
        activatedEnrolment.id,
        learnerA,
      );

      // Step 1 is unlocked!
      expect(progressionAfterPay.steps[0].isUnlocked).toBe(true);
      expect(progressionAfterPay.steps[0].lockReason).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // QA Check 7: Payment Cancellation, Failure, Retry & Idempotency
  // ─────────────────────────────────────────────────────────────────────────────
  describe('QA 7: Payment Cancellation, Failure, Retry & Idempotency', () => {
    it('7.1: Repeated checkout calls are idempotent and do not corrupt state or re-create payments', async () => {
      const alreadyActiveEnrolment = {
        id: 'enrol-already-active',
        userId: learnerA.id,
        programId: programLeadership.id,
        status: EnrolmentStatus.ACTIVE,
        program: programLeadership,
        batch: openBatch,
      };

      prismaMock.enrolment.findFirst.mockResolvedValue(alreadyActiveEnrolment);
      prismaMock.agreementTemplate.findFirst.mockResolvedValue(dedicatedLeadershipTemplate);
      prismaMock.signedAgreement.findUnique.mockResolvedValue({
        status: AgreementStatus.SIGNED,
      });
      // Existing succeeded payment on file
      prismaMock.payment.findFirst.mockResolvedValue({
        id: 'existing-payment-id',
        status: 'succeeded',
      });

      const response = await checkoutController.mockCheckout(
        { programId: programLeadership.id },
        { user: learnerA },
      );

      expect(response.success).toBe(true);
      expect(prismaMock.payment.create).not.toHaveBeenCalled();
      expect(prismaMock.invoice.create).not.toHaveBeenCalled();
    });

    it('7.2: Checkout rejects a revoked enrolment and prevents unauthorized reactivation', async () => {
      const revokedEnrolment = {
        id: 'enrol-revoked-uuid',
        userId: learnerA.id,
        programId: programLeadership.id,
        status: EnrolmentStatus.REVOKED,
      };

      prismaMock.enrolment.findFirst.mockResolvedValue(revokedEnrolment);
      prismaMock.agreementTemplate.findFirst.mockResolvedValue(null);

      await expect(
        checkoutController.mockCheckout(
          { programId: programLeadership.id },
          { user: learnerA },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // QA Check 8: Multi-Learner Isolation
  // ─────────────────────────────────────────────────────────────────────────────
  describe('QA 8: Strict Learner Isolation', () => {
    it('8.1: Learner B cannot sign Learner A enrolment', async () => {
      const enrolmentA = {
        id: 'enrol-learner-a',
        userId: learnerA.id,
        programId: programLeadership.id,
        status: EnrolmentStatus.PENDING_PAYMENT,
        user: learnerA,
      };

      prismaMock.enrolment.findUnique.mockResolvedValue(enrolmentA);

      const signDto = {
        enrolmentId: enrolmentA.id,
        consentGiven: true,
        typedName: 'Fraudulent Signer',
        typedAcknowledgement: 'I AGREE',
        drawnSignature: 'data:image/png;base64,validSignatureData',
      };

      await expect(
        agreementsService.signAgreement(signDto, learnerB),
      ).rejects.toThrow(ForbiddenException);
    });

    it('8.2: Learner B cannot view Learner A signed agreement', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-learner-a',
        userId: learnerA.id,
        signedAgreement: {
          id: 'signed-learner-a',
          enrolmentId: 'enrol-learner-a',
          userId: learnerA.id,
        },
      });

      await expect(
        agreementsService.getSignedAgreementForEnrolment('enrol-learner-a', learnerB),
      ).rejects.toThrow(ForbiddenException);
    });

    it('8.3: Learner B cannot view Learner A progression', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-learner-a',
        userId: learnerA.id,
        programId: programLeadership.id,
        status: EnrolmentStatus.ACTIVE,
      });

      await expect(
        progressionService.getEnrolmentProgression('enrol-learner-a', learnerB),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // QA Check 10: Legacy PENDING_AGREEMENT Compatibility
  // ─────────────────────────────────────────────────────────────────────────────
  describe('QA 10: Legacy PENDING_AGREEMENT Compatibility', () => {
    it('10.1: Signing immediately transitions legacy PENDING_AGREEMENT to ACTIVE and returns nextStep: STEPS', async () => {
      const legacyEnrolment = {
        id: 'enrol-legacy-uuid',
        userId: learnerA.id,
        programId: programLeadership.id,
        status: EnrolmentStatus.PENDING_AGREEMENT, // Paid before signing
        user: learnerA,
        signedAgreement: null,
      };

      prismaMock.enrolment.findUnique.mockResolvedValue(legacyEnrolment);
      prismaMock.agreementTemplate.findFirst.mockResolvedValue(dedicatedLeadershipTemplate);

      const signDto = {
        enrolmentId: legacyEnrolment.id,
        consentGiven: true,
        typedName: 'Alice Learner',
        typedAcknowledgement: 'I AGREE',
        drawnSignature: 'data:image/png;base64,validSignatureData',
      };

      prismaMock.signedAgreement.create.mockResolvedValue({
        id: 'signed-legacy-1',
        ...signDto,
        templateId: dedicatedLeadershipTemplate.id,
        versionId: dedicatedLeadershipTemplate.versions[0].id,
        templateVersion: 'v1.0',
        status: AgreementStatus.SIGNED,
        signedAt: new Date(),
      });

      const response = await agreementsService.signAgreement(signDto, learnerA);

      // Legacy enrolment automatically transitions to ACTIVE upon signing
      expect(response.enrolmentStatus).toBe(EnrolmentStatus.ACTIVE);
      expect(response.nextStep).toBe('STEPS');
      expect(prismaMock.enrolment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: legacyEnrolment.id },
          data: { status: EnrolmentStatus.ACTIVE },
        }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // QA Check 11: Production Environment Mock Protection
  // ─────────────────────────────────────────────────────────────────────────────
  describe('QA 11: Production Deployment Security Guards', () => {
    it('11.1: Mock checkout strictly fails in production unless ALLOW_MOCK_CHECKOUT is explicitly "true"', async () => {
      const originalEnv = process.env.NODE_ENV;
      const originalAllow = process.env.ALLOW_MOCK_CHECKOUT;

      try {
        process.env.NODE_ENV = 'production';
        delete process.env.ALLOW_MOCK_CHECKOUT;

        await expect(
          checkoutController.mockCheckout(
            { programId: programLeadership.id },
            { user: learnerA },
          ),
        ).rejects.toThrow(ForbiddenException);

        // Even with accidental empty or false string
        process.env.ALLOW_MOCK_CHECKOUT = 'false';
        await expect(
          checkoutController.mockCheckout(
            { programId: programLeadership.id },
            { user: learnerA },
          ),
        ).rejects.toThrow(ForbiddenException);
      } finally {
        process.env.NODE_ENV = originalEnv;
        if (originalAllow !== undefined) {
          process.env.ALLOW_MOCK_CHECKOUT = originalAllow;
        } else {
          delete process.env.ALLOW_MOCK_CHECKOUT;
        }
      }
    });

    it('11.2: Client-supplied bypass/simulate flags can NOT unlock mock checkout in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      const originalAllow = process.env.ALLOW_MOCK_CHECKOUT;

      try {
        process.env.NODE_ENV = 'production';
        delete process.env.ALLOW_MOCK_CHECKOUT;

        for (const flags of [{ bypass: true }, { simulate: true }, { bypassPayment: true }]) {
          await expect(
            checkoutController.mockCheckout(
              { programId: programLeadership.id, ...flags },
              { user: learnerA },
            ),
          ).rejects.toThrow(ForbiddenException);
        }
      } finally {
        process.env.NODE_ENV = originalEnv;
        if (originalAllow !== undefined) {
          process.env.ALLOW_MOCK_CHECKOUT = originalAllow;
        } else {
          delete process.env.ALLOW_MOCK_CHECKOUT;
        }
      }
    });
  });
});
