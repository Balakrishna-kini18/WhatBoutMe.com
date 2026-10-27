import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AgreementStatus,
  ContentStatus,
  EnrolmentStatus,
} from '@prisma/client';
import { AgreementsService } from './agreements.service.js';
import { EnrollmentsService } from '../enrollments/enrollments.service.js';
import { CheckoutController } from '../enrollments/enrollments.controller.js';

describe('Agreement-First Enrollment Flow End-to-End Suite', () => {
  let agreementsService: AgreementsService;
  let enrollmentsService: EnrollmentsService;
  let prismaMock: any;

  const learnerA = {
    sub: 'learner-a-uuid',
    id: 'learner-a-uuid',
    email: 'learner.a@example.com',
    role: 'LEARNER',
  };

  const learnerB = {
    sub: 'learner-b-uuid',
    id: 'learner-b-uuid',
    email: 'learner.b@example.com',
    role: 'LEARNER',
  };

  const program = {
    id: 'prog-leadership-uuid',
    title: 'Executive Leadership Program',
    slug: 'executive-leadership',
  };

  const openBatch = {
    id: 'batch-active-uuid',
    programId: program.id,
    name: 'Cohort 2026-A',
    status: 'OPEN',
    maxCapacity: 50,
  };

  const sharedTemplate = {
    id: 'tpl-shared-uuid',
    programId: null,
    title: 'Standard Platform Program Agreement',
    program: {
      id: program.id,
      title: program.title,
      slug: program.slug,
    },
    versions: [
      {
        id: 'ver-shared-v1',
        templateId: 'tpl-shared-uuid',
        version: 'v1.0',
        content: 'Standard terms, confidentiality, and data consent',
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date('2026-01-01'),
      },
    ],
  };

  let cacheHelperMock: any;
  let emailServiceMock: any;

  beforeEach(() => {
    cacheHelperMock = {
      invalidateNamespace: vi.fn().mockResolvedValue(undefined),
      invalidateKey: vi.fn().mockResolvedValue(undefined),
    };

    emailServiceMock = {
      sendTemplateEmail: vi.fn().mockResolvedValue(true),
    };

    prismaMock = {
      user: {
        findUnique: vi.fn().mockResolvedValue(learnerA),
      },
      enrolment: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      batch: {
        findFirst: vi.fn(),
      },
      program: {
        findUnique: vi.fn().mockResolvedValue(program),
      },
      agreementTemplate: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
      },
      signedAgreement: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => {
        return callback(prismaMock);
      }),
    };

    agreementsService = new AgreementsService(prismaMock as any, emailServiceMock as any, cacheHelperMock);
    enrollmentsService = new EnrollmentsService(prismaMock as any, cacheHelperMock);
  });

  describe('Step 1 & 2: Choose Program & Review Agreement (/agreements/initiate)', () => {
    it('creates a provisional PENDING_PAYMENT enrolment and returns the shared agreement template when no enrolment exists', async () => {
      prismaMock.program.findUnique.mockResolvedValue(program);
      prismaMock.enrolment.findFirst.mockResolvedValue(null);
      prismaMock.batch.findFirst.mockResolvedValue(openBatch);

      const createdEnrolment = {
        id: 'enrol-new-uuid',
        userId: learnerA.id,
        programId: program.id,
        batchId: openBatch.id,
        status: EnrolmentStatus.PENDING_PAYMENT,
        program: {
          id: program.id,
          title: program.title,
          price: 500,
        },
      };
      prismaMock.enrolment.create.mockResolvedValue(createdEnrolment);

      // Agreement lookup: program-specific returns null, shared template fallback succeeds
      prismaMock.agreementTemplate.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(sharedTemplate);

      const result = await agreementsService.getOrInitiateSigningEnrolment(learnerA.id, program.id);

      expect(result.enrolment.id).toBe('enrol-new-uuid');
      expect(result.enrolment.status).toBe(EnrolmentStatus.PENDING_PAYMENT);
      expect(result.template.templateId).toBe(sharedTemplate.id);
      expect(result.template.version).toBe('v1.0');
      expect(result.hasSignedAgreement).toBe(false);
      expect(prismaMock.enrolment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: learnerA.id,
            programId: program.id,
            status: EnrolmentStatus.PENDING_PAYMENT,
          }),
        }),
      );
    });

    it('reuses existing PENDING_PAYMENT enrolment and prevents duplicate creation', async () => {
      const existingEnrolment = {
        id: 'enrol-existing-uuid',
        userId: learnerA.id,
        programId: program.id,
        status: EnrolmentStatus.PENDING_PAYMENT,
        signedAgreement: null,
        program: {
          id: program.id,
          title: program.title,
          price: 500,
        },
      };
      prismaMock.enrolment.findFirst.mockResolvedValue(existingEnrolment);
      prismaMock.agreementTemplate.findFirst.mockResolvedValue(sharedTemplate);

      const result = await agreementsService.getOrInitiateSigningEnrolment(learnerA.id, program.id);

      expect(result.enrolment.id).toBe('enrol-existing-uuid');
      expect(prismaMock.enrolment.create).not.toHaveBeenCalled();
    });
  });

  describe('Step 3: Sign Agreement (/agreements/sign)', () => {
    const provisionalEnrolment = {
      id: 'enrol-provisional-uuid',
      userId: learnerA.id,
      programId: program.id,
      status: EnrolmentStatus.PENDING_PAYMENT,
      user: { id: learnerA.id, email: learnerA.email, name: 'Learner A' },
      signedAgreement: null,
    };

    it('successfully records signature in PENDING_PAYMENT and directs to CHECKOUT without premature activation', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue(provisionalEnrolment);
      prismaMock.agreementTemplate.findFirst.mockResolvedValue(sharedTemplate);

      const signDto = {
        enrolmentId: provisionalEnrolment.id,
        consentGiven: true,
        consentVersion: 'v1.0',
        consentTimestamp: '2026-10-15T12:00:00.000Z',
        typedName: 'Learner A Legal Name',
        typedAcknowledgement: 'I AGREE',
        drawnSignature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        signatureType: 'DRAWN' as const,
      };

      const mockSignedRecord = {
        id: 'signed-uuid-1',
        enrolmentId: provisionalEnrolment.id,
        programId: program.id,
        templateId: sharedTemplate.id,
        versionId: sharedTemplate.versions[0].id,
        templateVersion: 'v1.0',
        consentVersion: 'v1.0',
        consentGiven: true,
        consentTimestamp: new Date('2026-10-15T12:00:00.000Z'),
        typedName: 'Learner A Legal Name',
        drawnSignature: signDto.drawnSignature,
        signatureType: 'DRAWN',
        signerIp: '127.0.0.1',
        userAgent: 'Mozilla/5.0 TestBrowser',
        status: AgreementStatus.SIGNED,
        signedAt: new Date('2026-10-15T12:00:00.000Z'),
        signedPdfUrl: null,
      };

      prismaMock.signedAgreement.create.mockResolvedValue(mockSignedRecord);

      const response = await agreementsService.signAgreement(
        signDto,
        learnerA,
        '127.0.0.1',
        'Mozilla/5.0 TestBrowser',
      );

      // Verify signed agreement details
      expect(response.id).toBe('signed-uuid-1');
      expect(response.consentGiven).toBe(true);
      expect(response.consentVersion).toBe('v1.0');
      expect(response.status).toBe(AgreementStatus.SIGNED);

      // CRITICAL: Must remain PENDING_PAYMENT (no premature activation)
      expect(response.enrolmentStatus).toBe(EnrolmentStatus.PENDING_PAYMENT);
      expect(response.nextStep).toBe('CHECKOUT');
      expect(response.checkoutUrl).toBe(`/checkout?programId=${program.id}&enrolmentId=${provisionalEnrolment.id}`);

      // Verify enrolment was NOT updated to ACTIVE
      expect(prismaMock.enrolment.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: EnrolmentStatus.ACTIVE }),
        }),
      );
    });

    it('rejects signing if consentGiven is false', async () => {
      const invalidDto = {
        enrolmentId: provisionalEnrolment.id,
        consentGiven: false,
        typedName: 'Learner A',
        typedAcknowledgement: 'I AGREE',
        drawnSignature: 'data:image/png;base64,valid',
      };

      await expect(
        agreementsService.signAgreement(invalidDto as any, learnerA),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects signing if typedName is missing or whitespace', async () => {
      const invalidDto = {
        enrolmentId: provisionalEnrolment.id,
        consentGiven: true,
        typedName: '   ',
        typedAcknowledgement: 'I AGREE',
        drawnSignature: 'data:image/png;base64,valid',
      };

      await expect(
        agreementsService.signAgreement(invalidDto as any, learnerA),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects signing if signature is missing', async () => {
      const invalidDto = {
        enrolmentId: provisionalEnrolment.id,
        consentGiven: true,
        typedName: 'Learner A',
        typedAcknowledgement: 'I AGREE',
      };

      await expect(
        agreementsService.signAgreement(invalidDto as any, learnerA),
      ).rejects.toThrow(BadRequestException);
    });

    it('enforces learner isolation: Learner B cannot sign for Learner A enrolment', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue(provisionalEnrolment);

      const signDto = {
        enrolmentId: provisionalEnrolment.id,
        consentGiven: true,
        typedName: 'Learner B Fraudulent',
        typedAcknowledgement: 'I AGREE',
        drawnSignature: 'data:image/png;base64,valid',
      };

      await expect(
        agreementsService.signAgreement(signDto, learnerB),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Step 4 & 5: Pay & Confirm Enrollment Status Transition', () => {
    it('blocks PENDING_PAYMENT -> ACTIVE if agreement is not signed', async () => {
      const unsignedEnrolment = {
        id: 'enrol-unsigned-uuid',
        userId: learnerA.id,
        programId: program.id,
        status: EnrolmentStatus.PENDING_PAYMENT,
        signedAgreement: null,
      };

      prismaMock.enrolment.findUnique.mockResolvedValue(unsignedEnrolment);

      await expect(
        enrollmentsService.transitionStatus(
          unsignedEnrolment.id,
          {
            targetStatus: EnrolmentStatus.ACTIVE,
            reason: 'Payment callback received',
          },
          { sub: learnerA.id, role: 'LEARNER' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('confirms enrollment (PENDING_PAYMENT -> ACTIVE) when verified payment succeeds and agreement is signed', async () => {
      const signedEnrolment = {
        id: 'enrol-signed-uuid',
        userId: learnerA.id,
        programId: program.id,
        status: EnrolmentStatus.PENDING_PAYMENT,
        signedAgreement: {
          id: 'signed-123',
          status: 'SIGNED',
        },
      };

      const activatedEnrolment = {
        ...signedEnrolment,
        status: EnrolmentStatus.ACTIVE,
      };

      prismaMock.enrolment.findUnique.mockResolvedValue(signedEnrolment);
      prismaMock.enrolment.update.mockResolvedValue(activatedEnrolment);

      const result = await enrollmentsService.transitionStatus(
        signedEnrolment.id,
        {
          targetStatus: EnrolmentStatus.ACTIVE,
          reason: 'Payment successful via checkout',
        },
        { sub: learnerA.id, role: 'LEARNER' },
      );

      expect(result.status).toBe(EnrolmentStatus.ACTIVE);
      expect(prismaMock.enrolment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: signedEnrolment.id },
          data: expect.objectContaining({ status: EnrolmentStatus.ACTIVE }),
        }),
      );
    });

    it('prevents fallback from selecting an unrelated program agreement when no shared template exists', async () => {
      // Program B has no template, and the database only has an unrelated template for Program A
      prismaMock.agreementTemplate.findFirst
        .mockResolvedValueOnce(null) // programId lookup fails
        .mockResolvedValueOnce(null); // shared/default template lookup fails

      await expect(
        agreementsService.getActiveVersionForProgram('prog-unrelated-b'),
      ).rejects.toThrow(NotFoundException);
    });

    it('CheckoutController.mockCheckout blocks in production unless ALLOW_MOCK_CHECKOUT is set', async () => {
      const checkoutController = new CheckoutController(
        enrollmentsService,
        prismaMock,
        emailServiceMock,
        undefined,
        cacheHelperMock,
      );

      const originalEnv = process.env.NODE_ENV;
      const originalAllow = process.env.ALLOW_MOCK_CHECKOUT;
      try {
        process.env.NODE_ENV = 'production';
        delete process.env.ALLOW_MOCK_CHECKOUT;

        await expect(
          checkoutController.mockCheckout(
            { programId: program.id },
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

    it('CheckoutController.mockCheckout rejects revoked enrolments', async () => {
      const checkoutController = new CheckoutController(
        enrollmentsService,
        prismaMock,
        emailServiceMock,
        undefined,
        cacheHelperMock,
      );

      const revokedEnrolment = {
        id: 'enrol-revoked-uuid',
        userId: learnerA.id,
        programId: program.id,
        status: EnrolmentStatus.REVOKED,
      };

      prismaMock.enrolment.findFirst.mockResolvedValue(revokedEnrolment);
      prismaMock.agreementTemplate.findFirst.mockResolvedValue(null);

      await expect(
        checkoutController.mockCheckout(
          { programId: program.id },
          { user: learnerA },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

