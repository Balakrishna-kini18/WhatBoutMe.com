import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AgreementStatus, ContentStatus, EnrolmentStatus, Role } from '@prisma/client';
import { AgreementsService } from './agreements.service.js';

describe('Program Agreement Typed Acceptance & Backend Enforcement Suite', () => {
  let agreementsService: AgreementsService;
  let prismaMock: any;

  const learner = {
    id: 'learner-uuid-1',
    name: 'Alice Learner',
    email: 'alice@example.com',
    role: Role.USER,
  };

  const program = {
    id: 'program-uuid-1',
    title: 'Executive Leadership Program',
    slug: 'executive-leadership',
  };

  const versionPublished = {
    id: 'ver-published-uuid',
    templateId: 'tpl-uuid-1',
    version: 'v1.0',
    title: 'Standard Workshop Terms',
    content: 'Full agreement text content',
    status: ContentStatus.PUBLISHED,
  };

  const template = {
    id: 'tpl-uuid-1',
    programId: program.id,
    title: 'Standard Agreement',
    versions: [versionPublished],
  };

  const validSampleSignature =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  beforeEach(() => {
    prismaMock = {
      enrolment: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      agreementTemplate: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
      },
      agreementTemplateVersion: {
        findUnique: vi.fn(),
      },
      signedAgreement: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: learner.id, savedSignature: null }),
        update: vi.fn(),
      },
      $transaction: vi.fn(async (cb) => {
        return cb(prismaMock);
      }),
    };

    agreementsService = new AgreementsService(
      prismaMock as any,
      undefined,
      undefined,
      undefined,
    );
  });

  describe('1. Empty or Missing Typed Acknowledgement', () => {
    const provisionalEnrolment = {
      id: 'enrol-prov-1',
      userId: learner.id,
      programId: program.id,
      status: EnrolmentStatus.PENDING_PAYMENT,
      user: learner,
      signedAgreement: null,
      program,
    };

    it('rejects signing when typedAcknowledgement is undefined (omitted by client)', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue(provisionalEnrolment);
      prismaMock.agreementTemplate.findFirst.mockResolvedValue(template);

      const dto = {
        enrolmentId: provisionalEnrolment.id,
        consentGiven: true,
        typedName: 'Alice Learner',
        drawnSignature: validSampleSignature,
        signatureType: 'DRAWN' as const,
        // typedAcknowledgement omitted
      };

      await expect(
        agreementsService.signAgreement(dto as any, learner),
      ).rejects.toThrow(BadRequestException);

      await expect(
        agreementsService.signAgreement(dto as any, learner),
      ).rejects.toThrow(/typed acknowledgement "I AGREE"/i);

      // Verify no audit log entry was created
      expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
    });

    it('rejects signing when typedAcknowledgement is an empty string', async () => {
      const dto = {
        enrolmentId: provisionalEnrolment.id,
        consentGiven: true,
        typedName: 'Alice Learner',
        typedAcknowledgement: '',
        drawnSignature: validSampleSignature,
        signatureType: 'DRAWN' as const,
      };

      await expect(
        agreementsService.signAgreement(dto as any, learner),
      ).rejects.toThrow(BadRequestException);

      expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
    });

    it('rejects signing when typedAcknowledgement is only whitespace', async () => {
      const dto = {
        enrolmentId: provisionalEnrolment.id,
        consentGiven: true,
        typedName: 'Alice Learner',
        typedAcknowledgement: '    ',
        drawnSignature: validSampleSignature,
        signatureType: 'DRAWN' as const,
      };

      await expect(
        agreementsService.signAgreement(dto as any, learner),
      ).rejects.toThrow(BadRequestException);

      expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('2. Incorrect Typed Acknowledgement', () => {
    const provisionalEnrolment = {
      id: 'enrol-prov-1',
      userId: learner.id,
      programId: program.id,
      status: EnrolmentStatus.PENDING_PAYMENT,
      user: learner,
      signedAgreement: null,
      program,
    };

    it('rejects signing when input is "NO", "I DISAGREE", or random text', async () => {
      const invalidPhrases = [
        'NO',
        'I DISAGREE',
        'YES',
        'AGREE',
        'I AGREE WITH RESERVATIONS',
        'accepted',
        'ok',
      ];

      for (const phrase of invalidPhrases) {
        const dto = {
          enrolmentId: provisionalEnrolment.id,
          consentGiven: true,
          typedName: 'Alice Learner',
          typedAcknowledgement: phrase,
          drawnSignature: validSampleSignature,
          signatureType: 'DRAWN' as const,
        };

        await expect(
          agreementsService.signAgreement(dto as any, learner),
        ).rejects.toThrow(BadRequestException);
      }

      // Ensure failed attempts never wrote to the audit log
      expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('3 & 4. Valid Acceptance & Whitespace / Case Insensitivity', () => {
    const provisionalEnrolment = {
      id: 'enrol-prov-1',
      userId: learner.id,
      programId: program.id,
      status: EnrolmentStatus.PENDING_PAYMENT,
      user: learner,
      signedAgreement: null,
      program,
    };

    beforeEach(() => {
      prismaMock.enrolment.findUnique.mockResolvedValue(provisionalEnrolment);
      prismaMock.agreementTemplate.findFirst.mockResolvedValue(template);
      prismaMock.signedAgreement.findUnique.mockResolvedValue(null);
      prismaMock.signedAgreement.create.mockImplementation((args: any) => ({
        id: 'signed-ag-uuid',
        ...args.data,
        version: versionPublished,
        template,
      }));
      prismaMock.auditLog.create.mockResolvedValue({ id: 'audit-log-uuid' });
    });

    it('accepts exact uppercase "I AGREE"', async () => {
      const dto = {
        enrolmentId: provisionalEnrolment.id,
        consentGiven: true,
        typedName: 'Alice Learner',
        typedAcknowledgement: 'I AGREE',
        drawnSignature: validSampleSignature,
        signatureType: 'DRAWN' as const,
      };

      const result = await agreementsService.signAgreement(
        dto,
        learner,
        '127.0.0.1',
        'Mozilla/5.0 TestBrowser',
      );

      expect(result.id).toBe('signed-ag-uuid');
      expect(result.status).toBe(AgreementStatus.SIGNED);
      expect(result.typedName).toBe('Alice Learner');
    });

    it('accepts lowercase "i agree"', async () => {
      const dto = {
        enrolmentId: provisionalEnrolment.id,
        consentGiven: true,
        typedName: 'Alice Learner',
        typedAcknowledgement: 'i agree',
        drawnSignature: validSampleSignature,
        signatureType: 'DRAWN' as const,
      };

      const result = await agreementsService.signAgreement(
        dto,
        learner,
        '127.0.0.1',
        'Mozilla/5.0 TestBrowser',
      );

      expect(result.id).toBe('signed-ag-uuid');
      expect(result.status).toBe(AgreementStatus.SIGNED);
    });

    it('accepts acknowledgement with surrounding whitespace ("   I AGREE   ")', async () => {
      const dto = {
        enrolmentId: provisionalEnrolment.id,
        consentGiven: true,
        typedName: 'Alice Learner',
        typedAcknowledgement: '   I AGREE   ',
        drawnSignature: validSampleSignature,
        signatureType: 'DRAWN' as const,
      };

      const result = await agreementsService.signAgreement(
        dto,
        learner,
        '127.0.0.1',
        'Mozilla/5.0 TestBrowser',
      );

      expect(result.id).toBe('signed-ag-uuid');
      expect(result.status).toBe(AgreementStatus.SIGNED);
    });
  });

  describe('5. Direct API Requests Bypassing Frontend Validation', () => {
    it('backend independently rejects direct unauthorized or malformed requests', async () => {
      // 1. Direct request with valid signature but missing acknowledgement
      await expect(
        agreementsService.signAgreement(
          {
            enrolmentId: 'enrol-prov-1',
            consentGiven: true,
            typedName: 'Alice Learner',
            drawnSignature: validSampleSignature,
          } as any,
          learner,
        ),
      ).rejects.toThrow(BadRequestException);

      // 2. Direct request with false consent
      await expect(
        agreementsService.signAgreement(
          {
            enrolmentId: 'enrol-prov-1',
            consentGiven: false,
            typedName: 'Alice Learner',
            typedAcknowledgement: 'I AGREE',
            drawnSignature: validSampleSignature,
          } as any,
          learner,
        ),
      ).rejects.toThrow(BadRequestException);

      // 3. Direct request attempting IDOR (another user signing)
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-victim',
        userId: 'victim-user-id',
        programId: program.id,
        status: EnrolmentStatus.PENDING_PAYMENT,
      });

      await expect(
        agreementsService.signAgreement(
          {
            enrolmentId: 'enrol-victim',
            consentGiven: true,
            typedName: 'Attacker User',
            typedAcknowledgement: 'I AGREE',
            drawnSignature: validSampleSignature,
          } as any,
          learner,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('6. Progression & State Machine Integration', () => {
    it('Agreement-First: signing in PENDING_PAYMENT leaves status as PENDING_PAYMENT and returns nextStep: CHECKOUT', async () => {
      const provisionalEnrolment = {
        id: 'enrol-prov-1',
        userId: learner.id,
        programId: program.id,
        status: EnrolmentStatus.PENDING_PAYMENT,
        user: learner,
        signedAgreement: null,
        program,
      };

      prismaMock.enrolment.findUnique.mockResolvedValue(provisionalEnrolment);
      prismaMock.agreementTemplate.findFirst.mockResolvedValue(template);
      prismaMock.signedAgreement.findUnique.mockResolvedValue(null);
      prismaMock.signedAgreement.create.mockResolvedValue({
        id: 'signed-ag-uuid',
        enrolmentId: provisionalEnrolment.id,
        userId: learner.id,
        status: AgreementStatus.SIGNED,
        version: versionPublished,
        template,
      });

      const response = await agreementsService.signAgreement(
        {
          enrolmentId: provisionalEnrolment.id,
          consentGiven: true,
          typedName: 'Alice Learner',
          typedAcknowledgement: 'I AGREE',
          drawnSignature: validSampleSignature,
          signatureType: 'DRAWN' as const,
        },
        learner,
      );

      // Status remains PENDING_PAYMENT — no premature step unlock
      expect(response.enrolmentStatus).toBe(EnrolmentStatus.PENDING_PAYMENT);
      expect(response.nextStep).toBe('CHECKOUT');
      expect(response.checkoutUrl).toContain(provisionalEnrolment.id);
      expect(prismaMock.enrolment.update).not.toHaveBeenCalled();
    });

    it('Legacy flow: signing in PENDING_AGREEMENT immediately transitions to ACTIVE', async () => {
      const legacyEnrolment = {
        id: 'enrol-legacy-1',
        userId: learner.id,
        programId: program.id,
        status: EnrolmentStatus.PENDING_AGREEMENT,
        user: learner,
        signedAgreement: null,
        program,
      };

      prismaMock.enrolment.findUnique.mockResolvedValue(legacyEnrolment);
      prismaMock.agreementTemplate.findFirst.mockResolvedValue(template);
      prismaMock.signedAgreement.findUnique.mockResolvedValue(null);
      prismaMock.signedAgreement.create.mockResolvedValue({
        id: 'signed-legacy-uuid',
        enrolmentId: legacyEnrolment.id,
        userId: learner.id,
        status: AgreementStatus.SIGNED,
        version: versionPublished,
        template,
      });

      const response = await agreementsService.signAgreement(
        {
          enrolmentId: legacyEnrolment.id,
          consentGiven: true,
          typedName: 'Alice Learner',
          typedAcknowledgement: 'I AGREE',
          drawnSignature: validSampleSignature,
          signatureType: 'DRAWN' as const,
        },
        learner,
      );

      // Legacy flow transitions enrolment to ACTIVE
      expect(response.enrolmentStatus).toBe(EnrolmentStatus.ACTIVE);
      expect(prismaMock.enrolment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: legacyEnrolment.id },
          data: { status: EnrolmentStatus.ACTIVE },
        }),
      );
    });
  });

  describe('7. Audit Persistence & Immutability', () => {
    it('records typedAcknowledgement in audit log metadata along with user, version, and IP', async () => {
      const provisionalEnrolment = {
        id: 'enrol-prov-1',
        userId: learner.id,
        programId: program.id,
        status: EnrolmentStatus.PENDING_PAYMENT,
        user: learner,
        signedAgreement: null,
        program,
      };

      prismaMock.enrolment.findUnique.mockResolvedValue(provisionalEnrolment);
      prismaMock.agreementTemplate.findFirst.mockResolvedValue(template);
      prismaMock.signedAgreement.findUnique.mockResolvedValue(null);
      prismaMock.signedAgreement.create.mockResolvedValue({
        id: 'signed-ag-uuid',
        enrolmentId: provisionalEnrolment.id,
        userId: learner.id,
        status: AgreementStatus.SIGNED,
        version: versionPublished,
        template,
      });

      await agreementsService.signAgreement(
        {
          enrolmentId: provisionalEnrolment.id,
          consentGiven: true,
          typedName: 'Alice Learner',
          typedAcknowledgement: '  i agree  ',
          drawnSignature: validSampleSignature,
          signatureType: 'DRAWN' as const,
        },
        learner,
        '203.0.113.42',
        'Mozilla/5.0 macOS',
      );

      expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorId: learner.id,
          action: 'AGREEMENT_SIGNED',
          entity: 'SignedAgreement',
          entityId: 'signed-ag-uuid',
          ip: '203.0.113.42',
          meta: expect.objectContaining({
            enrolmentId: provisionalEnrolment.id,
            programId: program.id,
            versionId: versionPublished.id,
            version: 'v1.0',
            typedName: 'Alice Learner',
            typedAcknowledgement: 'i agree', // Trimmed acknowledgement
            userAgent: 'Mozilla/5.0 macOS',
            consentGiven: true,
            signedAt: expect.any(String),
          }),
        }),
      });
    });
  });
});
