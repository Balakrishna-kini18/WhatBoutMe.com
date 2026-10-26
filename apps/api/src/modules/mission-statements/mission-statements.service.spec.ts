import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MissionStatementsService } from './mission-statements.service.js';
import {
  MissionStatementStatus,
  LearnerStage,
  CertificateStatus,
  CertificateType,
} from '@prisma/client';

describe('MissionStatementsService - Stage 5 Submissions & Cert Issuance', () => {
  let service: MissionStatementsService;
  let prismaMock: any;
  let stageGateServiceMock: any;
  let certificatesServiceMock: any;
  let emailServiceMock: any;
  let objectStorageMock: any;

  beforeEach(() => {
    prismaMock = {
      enrolment: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      missionStatementSubmission: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      certificate: {
        findUnique: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
    };

    stageGateServiceMock = {
      assertStageUnlocked: vi.fn().mockResolvedValue(true),
      evaluateStages: vi.fn().mockResolvedValue({}),
    };

    certificatesServiceMock = {
      requestCertificate: vi.fn().mockResolvedValue({
        id: 'cert-1',
        status: CertificateStatus.PENDING,
      }),
      approveCertificate: vi.fn().mockResolvedValue({
        id: 'cert-1',
        status: CertificateStatus.APPROVED,
      }),
    };

    emailServiceMock = {
      sendTemplateEmail: vi.fn().mockResolvedValue(true),
    };

    objectStorageMock = {
      uploadBuffer: vi.fn().mockResolvedValue('https://storage.example.com/ms-v1.pdf'),
    };

    service = new MissionStatementsService(
      prismaMock,
      stageGateServiceMock,
      certificatesServiceMock,
      emailServiceMock,
      objectStorageMock,
    );
  });

  describe('File Validation & Magic Bytes', () => {
    it('should throw if file or buffer is missing', () => {
      expect(() => service.validateFile(null as any)).toThrow(BadRequestException);
      expect(() => service.validateFile({ buffer: null as any } as any)).toThrow(BadRequestException);
    });

    it('should throw if file exceeds 10MB limit', () => {
      const largeFile = {
        buffer: Buffer.alloc(11 * 1024 * 1024),
        mimetype: 'application/pdf',
        size: 11 * 1024 * 1024,
      };
      expect(() => service.validateFile(largeFile)).toThrow('File size must not exceed 10MB');
    });

    it('should throw if mime type is unsupported', () => {
      const invalidMime = {
        buffer: Buffer.from([0x25, 0x50, 0x44, 0x46]),
        mimetype: 'application/msword',
        size: 100,
      };
      expect(() => service.validateFile(invalidMime)).toThrow('Invalid file type');
    });

    it('should reject file if buffer is smaller than 4 bytes', () => {
      const truncated = {
        buffer: Buffer.from([0x25, 0x50]),
        mimetype: 'application/pdf',
        size: 2,
      };
      expect(() => service.validateFile(truncated)).toThrow('corrupted or truncated');
    });

    it('should reject PDF if magic bytes do not match %PDF (0x25 0x50 0x44 0x46)', () => {
      const fakePdf = {
        buffer: Buffer.from([0x00, 0x00, 0x00, 0x00, 0x20]),
        mimetype: 'application/pdf',
        size: 5,
      };
      expect(() => service.validateFile(fakePdf)).toThrow('File binary signature does not match');
    });

    it('should accept valid PDF magic bytes', () => {
      const validPdf = {
        buffer: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]),
        mimetype: 'application/pdf',
        size: 8,
      };
      expect(() => service.validateFile(validPdf)).not.toThrow();
    });

    it('should accept valid PNG magic bytes (0x89 0x50 0x4E 0x47)', () => {
      const validPng = {
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        mimetype: 'image/png',
        size: 8,
      };
      expect(() => service.validateFile(validPng)).not.toThrow();
    });

    it('should accept valid JPEG magic bytes (0xFF 0xD8 0xFF)', () => {
      const validJpeg = {
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
        mimetype: 'image/jpeg',
        size: 6,
      };
      expect(() => service.validateFile(validJpeg)).not.toThrow();
    });
  });

  describe('submit', () => {
    const validFile = {
      buffer: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]),
      mimetype: 'application/pdf',
      size: 8,
      originalname: 'my_mission.pdf',
    };

    it('should enforce Stage 5 gate check', async () => {
      stageGateServiceMock.assertStageUnlocked.mockRejectedValueOnce(
        new ForbiddenException('Stage 4 not completed'),
      );

      await expect(
        service.submit('user-1', 'enrol-1', validFile),
      ).rejects.toThrow(ForbiddenException);

      expect(stageGateServiceMock.assertStageUnlocked).toHaveBeenCalledWith(
        'enrol-1',
        LearnerStage.STAGE_5_MISSION_STATEMENT,
      );
    });

    it('should throw NotFoundException if enrolment is missing', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.submit('user-1', 'enrol-1', validFile),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if enrolment belongs to another learner', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValueOnce({
        id: 'enrol-1',
        userId: 'other-user',
        program: { id: 'prog-1', title: 'Neuroscience' },
      });

      await expect(
        service.submit('user-1', 'enrol-1', validFile),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should create version 1 submission when no prior submission exists', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValueOnce({
        id: 'enrol-1',
        userId: 'user-1',
        program: { id: 'prog-1', title: 'Neuroscience' },
      });
      prismaMock.missionStatementSubmission.findFirst.mockResolvedValueOnce(null);
      prismaMock.missionStatementSubmission.create.mockResolvedValueOnce({
        id: 'sub-1',
        enrolmentId: 'enrol-1',
        userId: 'user-1',
        version: 1,
        status: MissionStatementStatus.SUBMITTED,
        fileName: 'my_mission.pdf',
      });

      const res = await service.submit('user-1', 'enrol-1', validFile);

      expect(res.id).toBe('sub-1');
      expect(prismaMock.missionStatementSubmission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            enrolmentId: 'enrol-1',
            userId: 'user-1',
            version: 1,
            status: MissionStatementStatus.SUBMITTED,
          }),
        }),
      );
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorId: 'user-1',
            action: 'MISSION_STATEMENT_SUBMITTED',
            entityId: 'sub-1',
          }),
        }),
      );
    });

    it('should increment version to 2 if version 1 exists', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValueOnce({
        id: 'enrol-1',
        userId: 'user-1',
        program: { id: 'prog-1', title: 'Neuroscience' },
      });
      prismaMock.missionStatementSubmission.findFirst.mockResolvedValueOnce({
        id: 'sub-1',
        version: 1,
      });
      prismaMock.missionStatementSubmission.create.mockResolvedValueOnce({
        id: 'sub-2',
        enrolmentId: 'enrol-1',
        userId: 'user-1',
        version: 2,
        status: MissionStatementStatus.SUBMITTED,
      });

      const res = await service.submit('user-1', 'enrol-1', validFile);

      expect(res.version).toBe(2);
      expect(prismaMock.missionStatementSubmission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            version: 2,
          }),
        }),
      );
    });
  });

  describe('approve', () => {
    it('should throw NotFoundException if submission does not exist', async () => {
      prismaMock.missionStatementSubmission.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.approve('sub-999', 'admin-1', { feedback: 'Great!' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if already approved', async () => {
      prismaMock.missionStatementSubmission.findUnique.mockResolvedValueOnce({
        id: 'sub-1',
        status: MissionStatementStatus.APPROVED,
        enrolmentId: 'enrol-1',
      });

      await expect(
        service.approve('sub-1', 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update submission, update enrolment, trigger stage evaluation, auto-issue certificate, and send email', async () => {
      prismaMock.missionStatementSubmission.findUnique.mockResolvedValueOnce({
        id: 'sub-1',
        status: MissionStatementStatus.SUBMITTED,
        enrolmentId: 'enrol-1',
        version: 1,
        user: { id: 'user-1', email: 'learner@example.com', name: 'Roweena Test' },
        enrolment: {
          id: 'enrol-1',
          program: { id: 'prog-1', title: 'Mastery in Coaching' },
        },
      });

      prismaMock.missionStatementSubmission.update.mockResolvedValueOnce({
        id: 'sub-1',
        status: MissionStatementStatus.APPROVED,
        reviewerId: 'admin-1',
        feedback: 'Superb work!',
      });

      const res = await service.approve('sub-1', 'admin-1', { feedback: 'Superb work!' });

      expect(res.status).toBe(MissionStatementStatus.APPROVED);

      // Verify enrolment update
      expect(prismaMock.enrolment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'enrol-1' },
          data: expect.objectContaining({
            missionStatementApprovedAt: expect.any(Date),
          }),
        }),
      );

      // Verify audit log
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorId: 'admin-1',
            action: 'MISSION_STATEMENT_APPROVED',
            entityId: 'sub-1',
          }),
        }),
      );

      // Verify stage re-evaluation
      expect(stageGateServiceMock.evaluateStages).toHaveBeenCalledWith('enrol-1');

      // Verify auto-issue certificate
      expect(certificatesServiceMock.requestCertificate).toHaveBeenCalledWith(
        'enrol-1',
        expect.objectContaining({ id: 'admin-1' }),
        CertificateType.PROFESSIONAL,
      );
      expect(certificatesServiceMock.approveCertificate).toHaveBeenCalledWith(
        'cert-1',
        expect.objectContaining({ id: 'admin-1' }),
      );

      // Verify email notification
      expect(emailServiceMock.sendTemplateEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'learner@example.com',
          template: 'CertificateIssuedEmail',
        }),
      );
    });
  });

  describe('reject', () => {
    it('should throw BadRequestException if feedback is missing', async () => {
      prismaMock.missionStatementSubmission.findUnique.mockResolvedValueOnce({
        id: 'sub-1',
        status: MissionStatementStatus.SUBMITTED,
        enrolmentId: 'enrol-1',
      });

      await expect(
        service.reject('sub-1', 'admin-1', { feedback: '' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update submission to REJECTED and record audit log', async () => {
      prismaMock.missionStatementSubmission.findUnique.mockResolvedValueOnce({
        id: 'sub-1',
        status: MissionStatementStatus.SUBMITTED,
        enrolmentId: 'enrol-1',
        version: 1,
        user: { id: 'user-1', email: 'learner@example.com' },
        enrolment: { id: 'enrol-1', program: { title: 'Mastery' } },
      });

      prismaMock.missionStatementSubmission.update.mockResolvedValueOnce({
        id: 'sub-1',
        status: MissionStatementStatus.REJECTED,
        reviewerId: 'admin-1',
        feedback: 'Please expand on section 2.',
      });

      const res = await service.reject('sub-1', 'admin-1', {
        feedback: 'Please expand on section 2.',
      });

      expect(res.status).toBe(MissionStatementStatus.REJECTED);
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorId: 'admin-1',
            action: 'MISSION_STATEMENT_REJECTED',
            entityId: 'sub-1',
          }),
        }),
      );
    });
  });
});
