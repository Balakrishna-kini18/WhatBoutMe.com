import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminDashboardController } from './admin-dashboard.controller.js';
import { Role, InvoiceStatus } from '@prisma/client';

describe('AdminDashboardController', () => {
  let controller: AdminDashboardController;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      user: {
        count: vi.fn().mockResolvedValue(11),
      },
      batch: {
        count: vi.fn().mockResolvedValue(4),
      },
      certificate: {
        count: vi.fn().mockImplementation(({ where }: any = {}) => {
          if (where?.status === 'PENDING') return Promise.resolve(0);
          return Promise.resolve(8);
        }),
        findMany: vi.fn().mockResolvedValue([
          { id: 'cert-1', certificateNumber: 'WBM-CERT-101', recipientName: 'Roweena Foxwel', programTitle: '11 Steps to You' },
        ]),
      },
      unmatchedAttendance: {
        count: vi.fn().mockResolvedValue(0),
      },
      invoice: {
        findMany: vi.fn().mockResolvedValue([
          { amount: 6665, currency: 'USD', status: InvoiceStatus.PAID, taxFields: null },
          { amount: 3670, currency: 'AED', status: InvoiceStatus.PAID, taxFields: null }, // ~1000 USD
          { amount: 516260, currency: 'INR', status: InvoiceStatus.PAID, taxFields: null }, // ~6220 USD
        ]),
      },
      enrolment: {
        findMany: vi.fn().mockImplementation(({ select, take }: any = {}) => {
          if (select?.program) {
            return Promise.resolve([
              { program: { id: 'p1', title: '11 Steps to You' } },
              { program: { id: 'p1', title: '11 Steps to You' } },
              { program: { id: 'p2', title: 'Vision Board Workshop' } },
            ]);
          }
          if (take) {
            return Promise.resolve([
              {
                id: 'enr-1',
                createdAt: new Date('2026-10-10'),
                status: 'ACTIVE',
                user: { id: 'u1', name: 'Learner One', email: 'one@example.com', role: Role.USER },
                batch: { id: 'b1', name: 'Cohort Alpha' },
                program: { id: 'p1', title: '11 Steps to You' },
              },
            ]);
          }
          return Promise.resolve([]);
        }),
      },
      auditLog: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'audit-1',
            action: 'LEAD_CONVERT',
            entity: 'Lead',
            entityId: 'lead-1',
            meta: { courseTitle: '11 Steps to You' },
            createdAt: new Date('2026-10-22'),
          },
        ]),
      },
    };

    controller = new AdminDashboardController(prismaMock);
  });

  it('1. Returns USD-only formatted revenue and clean subtitle for Super Admin / Admin', async () => {
    const result = await controller.getDashboard({ user: { role: Role.ADMIN } });

    // Returns USD-only collected revenue ($6,665), without mixing AED or INR into USD
    expect(result.totalRevenue).toBe('$6,665');
    expect(result.revenueSubtitle).toBe('Program & workshop revenue (USD)');
    expect(result.totalLearners).toBe(11);
    expect(result.totalBatches).toBe(4);
    expect(result.certificatesIssued).toBe(8);
    expect(result.pendingCertificatesCount).toBe(0);
    expect(result.unmatchedAttendanceCount).toBe(0);
  });

  it('2. Includes genuine recentActivity from audit logs', async () => {
    const result = await controller.getDashboard({ user: { role: Role.ADMIN } });

    expect(result.recentActivity).toHaveLength(1);
    expect(result.recentActivity[0].action).toBe('LEAD_CONVERT');
    expect(result.recentActivity[0].meta.courseTitle).toBe('11 Steps to You');
  });

  it('3. Computes programDistribution with accurate counts and percentages', async () => {
    const result = await controller.getDashboard({ user: { role: Role.ADMIN } });

    expect(result.programDistribution).toHaveLength(2);
    const elevenSteps = result.programDistribution.find((p: any) => p.name === '11 Steps to You');
    expect(elevenSteps.count).toBe(2);
    expect(elevenSteps.percentage).toBe(67);
  });

  it('4. Hides revenue entirely for Batch Managers per spec', async () => {
    const result = await controller.getDashboard({
      user: { role: Role.MANAGER, id: 'mgr-1', sub: 'mgr-1' },
    });

    expect(result.totalRevenue).toBeNull();
    expect(result.mockRevenue).toBeNull();
    expect(result.recentActivity).toEqual([]);
  });

  it('5. getAuditLogs rejects non-Super-Admin users with ForbiddenException', async () => {
    await expect(
      controller.getAuditLogs({ user: { role: Role.ADMIN } })
    ).rejects.toThrow('Audit logs are strictly restricted to Super Administrators.');

    await expect(
      controller.getAuditLogs({ user: { role: Role.MANAGER } })
    ).rejects.toThrow('Audit logs are strictly restricted to Super Administrators.');
  });

  it('6. getAuditLogs returns paginated audit records and resolves actor metadata for Super Admin', async () => {
    prismaMock.auditLog.count = vi.fn().mockResolvedValue(1);
    prismaMock.auditLog.findMany = vi.fn().mockResolvedValue([
      {
        id: 'audit-1',
        actorId: 'admin-1',
        action: 'CERTIFICATE_APPROVAL',
        entity: 'Certificate',
        entityId: 'cert-1',
        meta: { reason: 'Passed all exams' },
        ip: '127.0.0.1',
        createdAt: new Date('2026-10-24T10:00:00Z'),
      },
    ]);
    prismaMock.user.findMany = vi.fn().mockResolvedValue([
      { id: 'admin-1', name: 'Roweena Foxwel', email: 'roweena@whatboutme.com', role: Role.SUPER_ADMIN },
    ]);

    const result = await controller.getAuditLogs(
      { user: { role: Role.SUPER_ADMIN } },
      '1',
      '10',
      'CERTIFICATE',
      'CERTIFICATE_APPROVAL',
      'Certificate',
    );

    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].actorName).toBe('Roweena Foxwel');
    expect(result.data[0].action).toBe('CERTIFICATE_APPROVAL');
    expect(result.data[0].meta.reason).toBe('Passed all exams');
  });

  it('7. getAuditLogs allows limits up to 1000 for full CSV export and respects action/date filters', async () => {
    prismaMock.auditLog.count = vi.fn().mockImplementation(({ where }) => {
      if (where?.action === 'LOGIN') return Promise.resolve(197);
      return Promise.resolve(0);
    });
    prismaMock.auditLog.findMany = vi.fn().mockImplementation(({ take, where }) => {
      expect(take).toBe(1000); // Verify limit was raised to 1000, not capped at 100
      expect(where.action).toBe('LOGIN');
      expect(where.createdAt.gte).toBeInstanceOf(Date);
      expect(where.createdAt.lte).toBeInstanceOf(Date);
      return Promise.resolve(
        Array.from({ length: 197 }, (_, i) => ({
          id: `log-${i}`,
          actorId: 'admin-1',
          action: 'LOGIN',
          entity: 'User',
          entityId: `user-${i}`,
          meta: {},
          ip: '127.0.0.1',
          createdAt: new Date(),
        }))
      );
    });
    prismaMock.user.findMany = vi.fn().mockResolvedValue([
      { id: 'admin-1', name: 'Super Admin Roweena', email: 'super@whatboutme.com', role: Role.SUPER_ADMIN },
    ]);

    const result = await controller.getAuditLogs(
      { user: { role: Role.SUPER_ADMIN } },
      '1',
      '1000',
      undefined,
      'LOGIN',
      undefined,
      '2026-10-01',
      '2026-10-26'
    );

    expect(result.total).toBe(197);
    expect(result.data).toHaveLength(197);
    expect(result.limit).toBe(1000);
  });
});


