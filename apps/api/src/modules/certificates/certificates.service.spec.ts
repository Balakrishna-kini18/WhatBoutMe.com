import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CertificatesService } from './certificates.service.js';
import { CertificateStatus, CertificateType, Role } from '@prisma/client';

describe('D1-052 & D1-053: CertificatesService (Workflow, Code & Public Verification)', () => {
  let service: CertificatesService;
  let prismaMock: any;
  let eligibilityServiceMock: any;
  let queueMock: any;

  const mockAdminUser = { id: 'admin-1', sub: 'admin-1', role: Role.ADMIN };
  const mockLearnerUser = { id: 'learner-1', sub: 'learner-1', role: Role.USER };
  const mockOtherUser = { id: 'other-1', sub: 'other-1', role: Role.USER };

  const mockEnrolment = {
    id: 'enrol-1',
    userId: 'learner-1',
    programId: 'prog-1',
    certificate: null as any,
    user: { id: 'learner-1', name: 'John Doe', email: 'john@example.com' },
    program: { id: 'prog-1', title: 'Professional Coaching Program' },
  };

  beforeEach(() => {
    prismaMock = {
      enrolment: {
        findUnique: vi.fn().mockResolvedValue(mockEnrolment),
      },
      certificate: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        upsert: vi.fn(),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };

    eligibilityServiceMock = {
      evaluateEligibility: vi.fn().mockResolvedValue({
        isEligible: true,
        certificateType: CertificateType.PROFESSIONAL,
        unmetRequirements: [],
      }),
    };

    queueMock = {
      add: vi.fn().mockResolvedValue({ id: 'job-1' }),
    };

    service = new CertificatesService(
      prismaMock,
      eligibilityServiceMock,
      queueMock,
    );
  });

  describe('D1-052: Approval State Machine Workflow', () => {
    it('requestCertificate: transitions ELIGIBLE enrolment to PENDING approval', async () => {
      prismaMock.certificate.findFirst.mockResolvedValue(null);
      prismaMock.certificate.create.mockImplementation(({ data }: any) => ({
        id: 'cert-1',
        ...data,
      }));

      const cert = await service.requestCertificate('enrol-1', mockLearnerUser);

      expect(cert.status).toBe(CertificateStatus.PENDING);
      expect(cert.certificateCode).toMatch(/^WBM-2026-[A-F0-9]{4,6}$/);
      expect(cert.cpdHours).toBe(25);
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'CERTIFICATE_REQUESTED' }),
        }),
      );
    });

    it('requestCertificate: rejects when enrolment is not eligible', async () => {
      eligibilityServiceMock.evaluateEligibility.mockResolvedValue({
        isEligible: false,
        certificateType: CertificateType.PROFESSIONAL,
        unmetRequirements: ['Program steps incomplete: 8/11 completed.'],
      });

      await expect(
        service.requestCertificate('enrol-1', mockLearnerUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('requestCertificate: prevents unauthorized learner from requesting another learner certificate', async () => {
      await expect(
        service.requestCertificate('enrol-1', mockOtherUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('approveCertificate: transitions PENDING to APPROVED', async () => {
      prismaMock.certificate.findUnique.mockResolvedValue({
        id: 'cert-1',
        enrolmentId: 'enrol-1',
        status: CertificateStatus.PENDING,
        certificateCode: 'WBM-2026-ABCD',
        certificateType: CertificateType.PROFESSIONAL,
      });
      prismaMock.certificate.update.mockImplementation(({ data }: any) => ({
        id: 'cert-1',
        ...data,
      }));

      const approved = await service.approveCertificate('cert-1', mockAdminUser);

      expect(approved.status).toBe(CertificateStatus.APPROVED);
      expect(approved.approvedById).toBe('admin-1');
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'CERTIFICATE_APPROVED' }),
        }),
      );
    });

    it('approveCertificate: rejects invalid transitions from REJECTED or ISSUED', async () => {
      prismaMock.certificate.findUnique.mockResolvedValue({
        id: 'cert-1',
        status: CertificateStatus.REJECTED,
      });

      await expect(
        service.approveCertificate('cert-1', mockAdminUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejectCertificate: transitions PENDING to REJECTED', async () => {
      prismaMock.certificate.findUnique.mockResolvedValue({
        id: 'cert-1',
        enrolmentId: 'enrol-1',
        status: CertificateStatus.PENDING,
      });
      prismaMock.certificate.update.mockImplementation(({ data }: any) => ({
        id: 'cert-1',
        ...data,
      }));

      const rejected = await service.rejectCertificate('cert-1', mockAdminUser, 'Fraudulent submission');

      expect(rejected.status).toBe(CertificateStatus.REJECTED);
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'CERTIFICATE_REJECTED' }),
        }),
      );
    });

    it('issueCertificate: transitions APPROVED to ISSUED and sets issuedAt', async () => {
      prismaMock.certificate.findUnique.mockResolvedValue({
        id: 'cert-1',
        enrolmentId: 'enrol-1',
        status: CertificateStatus.APPROVED,
        certificateCode: 'WBM-2026-ABCD',
        certificateType: CertificateType.PROFESSIONAL,
      });
      prismaMock.certificate.update.mockImplementation(({ data }: any) => ({
        id: 'cert-1',
        ...data,
      }));

      const issued = await service.issueCertificate('cert-1', mockAdminUser);

      expect(issued.status).toBe(CertificateStatus.ISSUED);
      expect(issued.issuedAt).toBeDefined();
      expect(queueMock.add).toHaveBeenCalledWith(
        'generate-certificate',
        expect.objectContaining({ certificateId: 'cert-1' }),
      );
    });

    it('issueCertificate: rejects issuing when certificate is still PENDING', async () => {
      prismaMock.certificate.findUnique.mockResolvedValue({
        id: 'cert-1',
        status: CertificateStatus.PENDING,
      });

      await expect(
        service.issueCertificate('cert-1', mockAdminUser),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('D1-053: Certificate Code, CPD & Public Verification API', () => {
    it('generates unique collision-safe WBM-2026-XXXX format code', async () => {
      prismaMock.certificate.findFirst.mockResolvedValue(null);

      const code = await service.generateUniqueCertificateCode(2026);

      expect(code).toMatch(/^WBM-2026-[A-F0-9]{4}$/);
    });

    it('handles collision during generation by retrying until unique', async () => {
      // First attempt collides, second attempt is unique
      prismaMock.certificate.findFirst
        .mockResolvedValueOnce({ id: 'existing-cert' })
        .mockResolvedValueOnce(null);

      const code = await service.generateUniqueCertificateCode(2026);

      expect(code).toMatch(/^WBM-2026-[A-F0-9]{4}$/);
      expect(prismaMock.certificate.findFirst).toHaveBeenCalledTimes(2);
    });

    it('verifyCertificate: returns public verification response and LinkedIn parameters for valid code', async () => {
      const issueDate = new Date('2026-05-15T10:00:00Z');
      prismaMock.certificate.findFirst.mockResolvedValue({
        id: 'cert-1',
        certificateCode: 'WBM-2026-9E4B',
        certificateNumber: 'WBM-2026-9E4B',
        status: CertificateStatus.ISSUED,
        certificateType: CertificateType.PROFESSIONAL,
        cpdHours: 25,
        issueDate,
        issuedAt: issueDate,
        revokedAt: null,
        enrolment: {
          user: { name: 'Alice Smith', email: 'alice.private@example.com' },
          program: { title: 'Executive Leadership' },
        },
      });

      const result = await service.verifyCertificate('WBM-2026-9E4B');

      expect(result.valid).toBe(true);
      expect(result.certificateCode).toBe('WBM-2026-9E4B');
      expect(result.recipientName).toBe('Alice Smith');
      expect(result.programName).toBe('Executive Leadership');
      expect(result.certificateType).toBe(CertificateType.PROFESSIONAL);
      expect(result.cpdHours).toBe(25);
      expect(result.validityState).toBe('VALID');
      expect(result.linkedInParameters).toEqual({
        certName: 'Executive Leadership Certification',
        organizationId: 'whatboutme',
        issueYear: 2026,
        issueMonth: 5,
        certUrl: 'https://whatboutme.com/verify/WBM-2026-9E4B',
      });

      // Confirm NO sensitive learner email or internal IDs leaked
      expect((result as any).email).toBeUndefined();
      expect((result as any).userId).toBeUndefined();
      expect((result as any).enrolmentId).toBeUndefined();
    });

    it('verifyCertificate: throws NotFoundException when certificate does not exist or is not issued', async () => {
      prismaMock.certificate.findFirst.mockResolvedValue(null);

      await expect(
        service.verifyCertificate('WBM-2026-INVALID'),
      ).rejects.toThrow(NotFoundException);
    });

    it('verifyCertificate: throws NotFoundException when certificate is only PENDING and not approved/issued', async () => {
      prismaMock.certificate.findFirst.mockResolvedValue({
        id: 'cert-1',
        status: CertificateStatus.PENDING,
      });

      await expect(
        service.verifyCertificate('WBM-2026-PENDING'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
