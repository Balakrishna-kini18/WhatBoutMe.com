import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AgreementStatus,
  ContentStatus,
  EnrolmentStatus,
} from '@prisma/client';
import { AgreementsService } from './agreements.service.js';

describe('Reusable Digital Signature in Learner Profile Suite', () => {
  let agreementsService: AgreementsService;
  let prismaMock: any;

  const sampleSignatureData =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const updatedSignatureData =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const learnerA = {
    id: 'learner-a-uuid',
    sub: 'learner-a-uuid',
    email: 'learner.a@example.com',
    name: 'Ada Lovelace',
    savedSignature: null as string | null,
    savedSignatureType: null as string | null,
    savedSignatureUpdatedAt: null as Date | null,
  };

  const learnerB = {
    id: 'learner-b-uuid',
    sub: 'learner-b-uuid',
    email: 'learner.b@example.com',
    name: 'Charles Babbage',
    savedSignature: 'data:image/png;base64,CHARLES_BABBAGE_SIG',
    savedSignatureType: 'DRAWN',
    savedSignatureUpdatedAt: new Date('2026-01-01'),
  };

  const program1 = {
    id: 'prog-python-uuid',
    title: 'Python for Beginners',
    slug: 'python-beginners',
  };

  const program2 = {
    id: 'prog-leadership-uuid',
    title: 'Executive Leadership Track',
    slug: 'executive-leadership',
  };

  const templateProgram1 = {
    id: 'tpl-prog1-uuid',
    programId: program1.id,
    title: 'Python Agreement',
    program: program1,
    versions: [
      {
        id: 'ver-prog1-v1',
        templateId: 'tpl-prog1-uuid',
        version: 'v1.0',
        content: 'Python Program Legal Terms',
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date('2026-01-01'),
      },
    ],
  };

  const templateProgram2 = {
    id: 'tpl-prog2-uuid',
    programId: program2.id,
    title: 'Leadership Agreement',
    program: program2,
    versions: [
      {
        id: 'ver-prog2-v1',
        templateId: 'tpl-prog2-uuid',
        version: 'v1.0',
        content: 'Leadership Program Legal Terms',
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date('2026-02-01'),
      },
    ],
  };

  const enrolment1 = {
    id: 'enrolment-1-uuid',
    userId: learnerA.id,
    programId: program1.id,
    status: EnrolmentStatus.PENDING_PAYMENT,
    signedAgreement: null,
  };

  const enrolment2 = {
    id: 'enrolment-2-uuid',
    userId: learnerA.id,
    programId: program2.id,
    status: EnrolmentStatus.PENDING_PAYMENT,
    signedAgreement: null,
  };

  beforeEach(() => {
    prismaMock = {
      user: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      enrolment: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      agreementTemplate: {
        findFirst: vi.fn(),
      },
      signedAgreement: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
      $transaction: vi.fn(async (cb) => cb(prismaMock)),
    };

    agreementsService = new AgreementsService(prismaMock);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. FIRST ENROLLMENT: AUTOMATIC SIGNATURE SAVING
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Requirement 1: First Enrollment Signature Persistence', () => {
    it('persists a new signature to learner profile upon signing first agreement', async () => {
      // Learner starts with no saved signature
      prismaMock.user.findUnique.mockResolvedValue({ ...learnerA, savedSignature: null });
      prismaMock.enrolment.findUnique.mockResolvedValue(enrolment1);
      prismaMock.agreementTemplate.findFirst.mockResolvedValue(templateProgram1);
      prismaMock.signedAgreement.findUnique.mockResolvedValue(null);
      prismaMock.signedAgreement.create.mockImplementation((args: any) => ({
        id: 'signed-rec-1',
        ...args.data,
      }));
      prismaMock.user.update.mockResolvedValue({
        ...learnerA,
        savedSignature: sampleSignatureData,
        savedSignatureType: 'DRAWN',
      });

      const result = await agreementsService.signAgreement(
        {
          enrolmentId: enrolment1.id,
          typedName: 'Ada Lovelace',
          typedAcknowledgement: 'I AGREE',
          drawnSignature: sampleSignatureData,
          signatureType: 'DRAWN',
          consentGiven: true,
        },
        learnerA,
      );

      // Verified agreement signed
      expect(result.id).toBe('signed-rec-1');
      expect(result.typedName).toBe('Ada Lovelace');
      expect(result.status).toBe(AgreementStatus.SIGNED);

      // Verified user profile was updated with saved signature
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: learnerA.id },
          data: expect.objectContaining({
            savedSignature: sampleSignatureData,
            savedSignatureType: 'DRAWN',
          }),
        }),
      );

      // Verified audit log preserves signature method and agreement record
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorId: learnerA.id,
            action: 'AGREEMENT_SIGNED',
            entity: 'SignedAgreement',
            meta: expect.objectContaining({
              signatureType: 'DRAWN',
              reusedSignature: false,
            }),
          }),
        }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. FUTURE ENROLLMENTS: SIGNATURE REUSE WITH EXPLICIT CONFIRMATION
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Requirement 2 & 3: Signature Reuse & Explicit Consent Enforcement', () => {
    it('fetches saved profile signature for repeat enrollment', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: learnerA.id,
        savedSignature: sampleSignatureData,
        savedSignatureType: 'DRAWN',
        savedSignatureUpdatedAt: new Date('2026-01-15'),
      });

      const profileSig = await agreementsService.getLearnerSavedSignature(learnerA.id);

      expect(profileSig.hasSavedSignature).toBe(true);
      expect(profileSig.savedSignature).toBe(sampleSignatureData);
      expect(profileSig.savedSignatureType).toBe('DRAWN');
      expect(profileSig.savedSignatureUpdatedAt).toBeDefined();
    });

    it('reuses saved profile signature on second enrollment when explicitly confirmed', async () => {
      // Learner already has saved signature on profile
      const userWithSavedSig = {
        ...learnerA,
        savedSignature: sampleSignatureData,
        savedSignatureType: 'DRAWN',
      };
      prismaMock.user.findUnique.mockResolvedValue(userWithSavedSig);
      prismaMock.enrolment.findUnique.mockResolvedValue(enrolment2);
      prismaMock.agreementTemplate.findFirst.mockResolvedValue(templateProgram2);
      prismaMock.signedAgreement.findUnique.mockResolvedValue(null);
      prismaMock.signedAgreement.create.mockImplementation((args: any) => ({
        id: 'signed-rec-2',
        ...args.data,
      }));

      // Learner signs with useSavedSignature: true
      const result = await agreementsService.signAgreement(
        {
          enrolmentId: enrolment2.id,
          typedName: 'Ada Lovelace',
          typedAcknowledgement: 'I AGREE',
          useSavedSignature: true,
          consentGiven: true,
        },
        learnerA,
      );

      expect(result.id).toBe('signed-rec-2');
      // Immutable snapshot in signed agreement has the saved signature
      expect(prismaMock.signedAgreement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            drawnSignature: sampleSignatureData,
            signatureType: 'DRAWN',
            typedName: 'Ada Lovelace',
          }),
        }),
      );

      // Profile was NOT overwritten since it was reused without update
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('rejects reuse if learner does not have a saved signature on profile', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ ...learnerA, savedSignature: null });

      await expect(
        agreementsService.signAgreement(
          {
            enrolmentId: enrolment1.id,
            typedName: 'Ada Lovelace',
            typedAcknowledgement: 'I AGREE',
            useSavedSignature: true,
            consentGiven: true,
          },
          learnerA,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('enforces mandatory affirmative consent even when reusing a saved signature', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...learnerA,
        savedSignature: sampleSignatureData,
        savedSignatureType: 'DRAWN',
      });

      // Attempt to sign with saved signature but WITHOUT consent
      await expect(
        agreementsService.signAgreement(
          {
            enrolmentId: enrolment2.id,
            typedName: 'Ada Lovelace',
            typedAcknowledgement: 'I AGREE',
            useSavedSignature: true,
            consentGiven: false,
          },
          learnerA,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('enforces full legal name confirmation even when reusing a saved signature', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...learnerA,
        savedSignature: sampleSignatureData,
        savedSignatureType: 'DRAWN',
      });

      // Attempt to sign without typed full name
      await expect(
        agreementsService.signAgreement(
          {
            enrolmentId: enrolment2.id,
            typedName: '',
            typedAcknowledgement: 'I AGREE',
            useSavedSignature: true,
            consentGiven: true,
          },
          { ...learnerA, name: null },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. PROFILE MANAGEMENT & IMMUTABILITY OF HISTORICAL RECORDS
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Requirement 4 & 5: Profile Signature Replacement & Immutability', () => {
    it('allows a learner to update their saved profile signature directly', async () => {
      prismaMock.user.update.mockResolvedValue({
        id: learnerA.id,
        savedSignature: updatedSignatureData,
        savedSignatureType: 'UPLOADED',
        savedSignatureUpdatedAt: new Date(),
      });

      const res = await agreementsService.updateLearnerSavedSignature(
        learnerA.id,
        updatedSignatureData,
        'UPLOADED',
        '192.168.1.1',
        'Mozilla/5.0',
      );

      expect(res.success).toBe(true);
      expect(res.savedSignature).toBe(updatedSignatureData);
      expect(res.savedSignatureType).toBe('UPLOADED');

      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorId: learnerA.id,
            action: 'PROFILE_SIGNATURE_UPDATED',
            entity: 'User',
          }),
        }),
      );

      // Verify historical signed agreements table was never queried or touched
      expect(prismaMock.signedAgreement.update).not.toHaveBeenCalled();
      expect(prismaMock.signedAgreement.create).not.toHaveBeenCalled();
    });

    it('allows a learner to remove their saved profile signature', async () => {
      prismaMock.user.update.mockResolvedValue({
        id: learnerA.id,
        savedSignature: null,
        savedSignatureType: null,
        savedSignatureUpdatedAt: null,
      });

      const res = await agreementsService.removeLearnerSavedSignature(
        learnerA.id,
        '127.0.0.1',
        'Mozilla/5.0',
      );

      expect(res.success).toBe(true);
      expect(res.hasSavedSignature).toBe(false);
      expect(res.savedSignature).toBeNull();

      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'PROFILE_SIGNATURE_REMOVED',
            entity: 'User',
          }),
        }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. LEARNER DATA ISOLATION & SECURITY
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Requirement 6: Learner Data Isolation & Authorization', () => {
    it('prevents unauthenticated access to saved signature', async () => {
      await expect(agreementsService.getLearnerSavedSignature('')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(
        agreementsService.updateLearnerSavedSignature('', sampleSignatureData, 'DRAWN'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('enforces learner data isolation: Learner A query never accesses Learner B signature', async () => {
      prismaMock.user.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === learnerA.id) {
          return Promise.resolve({
            id: learnerA.id,
            savedSignature: sampleSignatureData,
            savedSignatureType: 'DRAWN',
            savedSignatureUpdatedAt: new Date(),
          });
        }
        if (where.id === learnerB.id) {
          return Promise.resolve(learnerB);
        }
        return Promise.resolve(null);
      });

      // Learner A queries own signature
      const sigA = await agreementsService.getLearnerSavedSignature(learnerA.id);
      expect(sigA.savedSignature).toBe(sampleSignatureData);

      // Learner B queries own signature
      const sigB = await agreementsService.getLearnerSavedSignature(learnerB.id);
      expect(sigB.savedSignature).toBe(learnerB.savedSignature);

      // Learner A and Learner B signatures are strictly isolated
      expect(sigA.savedSignature).not.toBe(sigB.savedSignature);
    });
  });
});
