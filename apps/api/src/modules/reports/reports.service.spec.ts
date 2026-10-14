import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReportsService } from './reports.service.js';
import { Role } from '@prisma/client';
import { ForbiddenException, BadRequestException } from '@nestjs/common';

describe('ReportsService - Reports & Exports (R-53)', () => {
  let service: ReportsService;
  let prismaMock: any;

  const adminUser = {
    id: 'admin-1',
    role: Role.ADMIN,
  };

  const managerUser = {
    id: 'mgr-1',
    role: Role.MANAGER,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock = {
      batch: {
        findMany: vi.fn(),
      },
      step: {
        findMany: vi.fn(),
      },
      quiz: {
        findMany: vi.fn(),
      },
      payment: {
        findMany: vi.fn(),
      },
      certificate: {
        findMany: vi.fn(),
      },
    };

    service = new ReportsService(prismaMock as any);
  });

  describe('Financial / Payment Reports', () => {
    it('allows Admin to retrieve payment analytics', async () => {
      const mockPayments = [
        {
          id: 'pay-1',
          amount: 1500,
          currency: 'USD',
          status: 'succeeded',
          createdAt: new Date('2026-10-01T12:00:00Z'),
          invoice: { invoiceNumber: 'INV-001', creditNoteId: null },
          enrolment: {
            user: { id: 'u-1', name: 'Alice', email: 'alice@example.com' },
            program: { id: 'prog-1', title: '11 Steps' },
            batch: { id: 'b-1', name: 'Alpha Cohort' },
          },
        },
      ];
      prismaMock.payment.findMany.mockResolvedValue(mockPayments);

      const res = await service.getPaymentAnalytics(adminUser);

      expect(res).toHaveLength(1);
      expect(res[0].paymentId).toBe('pay-1');
      expect(res[0].invoiceNumber).toBe('INV-001');
      expect(res[0].amount).toBe(1500);
      expect(res[0].clientName).toBe('Alice');
    });

    it('denies Manager from accessing financial/payment reports with ForbiddenException', async () => {
      await expect(service.getPaymentAnalytics(managerUser)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prismaMock.payment.findMany).not.toHaveBeenCalled();
    });
  });

  describe('Certificate Reports', () => {
    it('retrieves certificate analytics and enforces manager scoping', async () => {
      prismaMock.batch.findMany.mockResolvedValue([{ id: 'b-1', programId: 'prog-1' }]);
      prismaMock.certificate.findMany.mockResolvedValue([
        {
          id: 'cert-1',
          certificateCode: 'WBM-2026-001',
          status: 'ISSUED',
          cpdHours: 25,
          issueDate: new Date('2026-10-05T00:00:00Z'),
          user: { id: 'u-1', name: 'Bob', email: 'bob@example.com' },
          program: { id: 'prog-1', title: '11 Steps' },
        },
      ]);

      const res = await service.getCertificateAnalytics(managerUser);

      expect(res).toHaveLength(1);
      expect(res[0].certificateCode).toBe('WBM-2026-001');
      expect(res[0].recipientName).toBe('Bob');

      // Verify scoping query used manager batches
      expect(prismaMock.certificate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { programId: { in: ['prog-1'] } },
        }),
      );
    });
  });

  describe('CSV / Excel Export Streaming', () => {
    it('generates CSV with UTF-8 BOM and correct headers for payments', async () => {
      prismaMock.payment.findMany.mockResolvedValue([
        {
          id: 'pay-1',
          amount: 500,
          currency: 'USD',
          status: 'succeeded',
          createdAt: new Date('2026-10-02T10:00:00Z'),
          invoice: { invoiceNumber: 'INV-101', creditNoteId: null },
          enrolment: {
            user: { name: 'Charlie', email: 'charlie@example.com' },
            program: { title: 'Sigma 1' },
            batch: { name: 'Batch 1' },
          },
        },
      ]);

      const csv = await service.getCsvExport('payments', adminUser);

      expect(csv.startsWith('\uFEFF')).toBe(true); // UTF-8 BOM
      expect(csv).toContain('paymentId,invoiceNumber,amount,currency,status');
      expect(csv).toContain('"Charlie"');
      expect(csv).toContain('"INV-101"');
    });

    it('generates CSV for certificates', async () => {
      prismaMock.certificate.findMany.mockResolvedValue([
        {
          id: 'cert-1',
          certificateCode: 'WBM-CERT-999',
          status: 'ISSUED',
          cpdHours: 20,
          issueDate: new Date('2026-10-01'),
          user: { name: 'Dave', email: 'dave@example.com' },
          program: { title: 'Executive' },
        },
      ]);

      const csv = await service.getCsvExport('certificates', adminUser);

      expect(csv.startsWith('\uFEFF')).toBe(true);
      expect(csv).toContain('certificateId,certificateCode,recipientName');
      expect(csv).toContain('"WBM-CERT-999"');
    });

    it('throws BadRequestException for unsupported export type', async () => {
      await expect(service.getCsvExport('unknown-type', adminUser)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('Phase 6: Batch Attendance CSV Export', () => {
    it('exports batch attendance with UTF-8 BOM, attendance percentage, and session details', async () => {
      prismaMock.batch.findUnique = vi.fn().mockResolvedValue({
        id: 'batch-1',
        name: 'Alpha Cohort',
        program: { minAttendancePercentage: 75 },
        trainers: [],
        sessions: [
          { id: 's-1', title: 'Session 1', startTime: new Date('2026-10-01T10:00:00Z') },
        ],
        enrolments: [
          {
            status: 'ACTIVE',
            userId: 'u-1',
            user: { id: 'u-1', name: 'Alice', email: 'alice@example.com' },
          },
        ],
      });

      prismaMock.attendance = {
        findMany: vi.fn().mockResolvedValue([
          {
            sessionId: 's-1',
            userId: 'u-1',
            status: 'PRESENT',
            minutesPresent: 60,
          },
        ]),
      };

      const result = await service.exportBatchAttendance('batch-1', adminUser, 'csv');

      expect(result.csv.startsWith('\uFEFF')).toBe(true);
      expect(result.csv).toContain('Learner Name');
      expect(result.csv).toContain('Alice');
      expect(result.csv).toContain('COMPLIANT');
      expect(result.filename).toContain('alpha-cohort-attendance.csv');
    });

    it('rejects Manager who is not assigned to the batch', async () => {
      prismaMock.batch.findUnique = vi.fn().mockResolvedValue({
        id: 'batch-foreign',
        name: 'Foreign Batch',
        managerId: 'other-manager',
        trainers: [],
      });

      await expect(
        service.exportBatchAttendance('batch-foreign', managerUser, 'csv'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
