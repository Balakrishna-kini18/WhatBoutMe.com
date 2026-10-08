import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CertificateGenProcessor } from './certificate-gen.processor.js';
import { CertificateStatus, CertificateType } from '@prisma/client';
import { PDFDocument } from 'pdf-lib';

describe('D2-051 & D2-052: CertificateGenProcessor (PDF Generation & Storage)', () => {
  let processor: CertificateGenProcessor;
  let prismaMock: any;
  let objectStorageMock: any;

  const mockCertificate = {
    id: 'cert-100',
    certificateCode: 'WBM-2026-9E4B',
    certificateNumber: 'WBM-2026-9E4B',
    certificateType: CertificateType.PROFESSIONAL,
    status: CertificateStatus.APPROVED,
    cpdHours: 25,
    pdfUrl: null as string | null,
    issueDate: new Date('2026-05-15T10:00:00Z'),
    issuedAt: new Date('2026-05-15T10:00:00Z'),
    enrolment: {
      id: 'enrol-100',
      user: { id: 'user-1', name: 'Dr. Jane Smith', email: 'jane.smith@example.com' },
      program: { id: 'prog-1', title: 'Executive Coaching Mastery' },
      batch: {
        include: { program: { title: 'Executive Coaching Mastery' } },
      },
    },
  };

  beforeEach(() => {
    prismaMock = {
      certificate: {
        findUnique: vi.fn().mockResolvedValue(mockCertificate),
        update: vi.fn().mockImplementation(({ data }: any) => ({
          ...mockCertificate,
          ...data,
        })),
      },
    };

    objectStorageMock = {
      uploadBuffer: vi.fn().mockResolvedValue('certificates/WBM-2026-9E4B.pdf'),
      getPresignedGetUrl: vi.fn(),
      getPresignedPutUrl: vi.fn(),
      deleteObject: vi.fn(),
      objectExists: vi.fn(),
    };

    processor = new CertificateGenProcessor(prismaMock, objectStorageMock);
  });

  describe('D2-051: PDF Generation Engine', () => {
    it('generates a valid, readable PDF document containing required certificate data', async () => {
      const jobMock: any = { id: 'job-1', data: { certificateId: 'cert-100' } };

      const result = await processor.process(jobMock);

      expect(result).toBeDefined();
      expect(result.objectKey).toBe('certificates/WBM-2026-9E4B.pdf');
      expect(objectStorageMock.uploadBuffer).toHaveBeenCalledTimes(1);

      // Verify the uploaded buffer is a valid PDF
      const [key, buffer, contentType] = objectStorageMock.uploadBuffer.mock.calls[0];
      expect(key).toBe('certificates/WBM-2026-9E4B.pdf');
      expect(contentType).toBe('application/pdf');
      expect(Buffer.isBuffer(buffer)).toBe(true);

      // Inspect the generated PDF structure with pdf-lib
      const loadedPdf = await PDFDocument.load(buffer);
      expect(loadedPdf.getPageCount()).toBe(1);
      const page = loadedPdf.getPage(0);
      expect(page.getWidth()).toBe(800);
      expect(page.getHeight()).toBe(600);
    });

    it('renders Corporate Certificate with PARTICIPATION branding', async () => {
      const corporateCert = {
        ...mockCertificate,
        id: 'cert-corp',
        certificateCode: 'WBM-2026-CORP',
        certificateType: CertificateType.CORPORATE_PARTICIPATION,
        cpdHours: null,
      };
      prismaMock.certificate.findUnique.mockResolvedValue(corporateCert);

      const jobMock: any = { id: 'job-corp', data: { certificateId: 'cert-corp' } };
      const result = await processor.process(jobMock);

      expect(result.objectKey).toBe('certificates/WBM-2026-CORP.pdf');
      expect(objectStorageMock.uploadBuffer).toHaveBeenCalledWith(
        'certificates/WBM-2026-CORP.pdf',
        expect.any(Buffer),
        'application/pdf',
      );
    });

    it('handles missing enrolment gracefully and falls back to user/program fields', async () => {
      const orphanCert = {
        id: 'cert-orphan',
        certificateCode: 'WBM-2026-FALLBACK',
        certificateType: CertificateType.PROFESSIONAL,
        user: { name: 'Direct User' },
        program: { title: 'Direct Program' },
        enrolment: null,
      };
      prismaMock.certificate.findUnique.mockResolvedValue(orphanCert);

      const jobMock: any = { id: 'job-2', data: { certificateId: 'cert-orphan' } };
      const result = await processor.process(jobMock);

      expect(result.objectKey).toBe('certificates/WBM-2026-FALLBACK.pdf');
      expect(objectStorageMock.uploadBuffer).toHaveBeenCalledTimes(1);
    });
  });

  describe('D2-052: Private Storage Upload & Key Persistence', () => {
    it('uploads to IObjectStorageProvider with exact key certificates/${certificateCode}.pdf', async () => {
      const jobMock: any = { id: 'job-1', data: { certificateId: 'cert-100' } };

      await processor.process(jobMock);

      expect(objectStorageMock.uploadBuffer).toHaveBeenCalledWith(
        'certificates/WBM-2026-9E4B.pdf',
        expect.any(Buffer),
        'application/pdf',
      );

      // Confirms database update records the storage key/URL and transitions to ISSUED
      expect(prismaMock.certificate.update).toHaveBeenCalledWith({
        where: { id: 'cert-100' },
        data: expect.objectContaining({
          pdfUrl: 'certificates/WBM-2026-9E4B.pdf',
          status: CertificateStatus.ISSUED,
          issuedAt: expect.any(Date),
        }),
      });
    });

    it('idempotency: skips regeneration if certificate already has a pdfUrl', async () => {
      const existingCert = {
        ...mockCertificate,
        pdfUrl: 'certificates/already-generated.pdf',
      };
      prismaMock.certificate.findUnique.mockResolvedValue(existingCert);

      const jobMock: any = { id: 'job-idemp', data: { certificateId: 'cert-100' } };
      const result = await processor.process(jobMock);

      expect(result.pdfUrl).toBe('certificates/already-generated.pdf');
      expect(objectStorageMock.uploadBuffer).not.toHaveBeenCalled();
      expect(prismaMock.certificate.update).not.toHaveBeenCalled();
    });

    it('error propagation: throws error when storage provider fails so BullMQ retries', async () => {
      objectStorageMock.uploadBuffer.mockRejectedValue(
        new Error('Network timeout connecting to storage provider'),
      );

      const jobMock: any = { id: 'job-fail', data: { certificateId: 'cert-100' } };

      await expect(processor.process(jobMock)).rejects.toThrow(
        /Storage upload failed: Network timeout/,
      );

      // Verify certificate is NOT marked ISSUED if upload failed
      expect(prismaMock.certificate.update).not.toHaveBeenCalled();
    });

    it('throws error when certificate is not found', async () => {
      prismaMock.certificate.findUnique.mockResolvedValue(null);

      const jobMock: any = { id: 'job-missing', data: { certificateId: 'missing-id' } };

      await expect(processor.process(jobMock)).rejects.toThrow(
        'Certificate missing-id not found',
      );
    });
  });
});
