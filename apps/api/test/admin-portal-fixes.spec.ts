import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  Role,
  BatchStatus,
  EnrolmentStatus,
  InvoiceStatus,
  ContentStatus,
} from '@prisma/client';
import { AdminDashboardController } from '../src/modules/users/admin-dashboard.controller.js';
import { RevenueController } from '../src/modules/revenue/revenue.controller.js';
import { UsersService } from '../src/modules/users/users.service.js';
import { InvoicesService } from '../src/modules/invoices/invoices.service.js';
import { BatchesService } from '../src/modules/batches/batches.service.js';
import { ProgramsService } from '../src/modules/programs/programs.service.js';

describe('Admin Portal Audit Findings - Regression Test Suite', () => {
  let prismaMock: any;
  let cacheHelperMock: any;
  let mediaProviderMock: any;

  beforeEach(() => {
    prismaMock = {
      user: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn(),
      },
      program: {
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
      },
      lesson: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      resource: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      batch: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn(),
      },
      enrolment: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      certificate: {
        count: vi.fn().mockResolvedValue(0),
      },
      invoice: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
      },
      payment: {
        create: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      session: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      outboxEvent: {
        create: vi.fn().mockResolvedValue({}),
      },
      userSession: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      batchTrainer: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      logAction: vi.fn().mockResolvedValue({ id: 'log-1' }),
      $executeRaw: vi.fn().mockResolvedValue(1),
      $transaction: vi.fn().mockImplementation(async (callback) => {
        if (typeof callback === 'function') {
          return callback(prismaMock);
        }
        return Promise.all(callback);
      }),
    };

    cacheHelperMock = {
      getEndpointKey: vi.fn().mockImplementation((ns, role, params) => `${ns}:${role}:${JSON.stringify(params)}`),
      getOrSet: vi.fn().mockImplementation(async (_key, fetcher) => fetcher()),
      invalidateNamespace: vi.fn().mockResolvedValue(undefined),
      invalidateTag: vi.fn().mockImplementation(async (tag: string) => {
        await cacheHelperMock.invalidateNamespace(tag);
        return 1;
      }),
      invalidateTags: vi.fn().mockImplementation(async (tags: string[]) => {
        for (const tag of tags) {
          await cacheHelperMock.invalidateNamespace(tag);
        }
        return tags.length;
      }),
    };

    mediaProviderMock = {
      uploadVideo: vi.fn(),
      uploadAudio: vi.fn(),
      uploadDocument: vi.fn(),
      deleteMedia: vi.fn().mockResolvedValue(undefined),
    };
  });

  // =========================================================================
  // PRIORITY 1: Dashboard Data Accuracy (BUG-01)
  // =========================================================================
  describe('Priority 1 - Dashboard Data Accuracy (BUG-01)', () => {
    let controller: AdminDashboardController;

    beforeEach(() => {
      controller = new AdminDashboardController(prismaMock);
    });

    it('calculates totalRevenue from persisted PAID invoices minus credit notes', async () => {
      prismaMock.user.count.mockResolvedValue(10);
      prismaMock.batch.count.mockResolvedValue(4);
      prismaMock.certificate.count.mockResolvedValue(7);
      prismaMock.enrolment.findMany.mockResolvedValue([]);

      prismaMock.invoice.findMany.mockResolvedValue([
        {
          id: 'inv-1',
          status: InvoiceStatus.PAID,
          amount: 5000,
          currency: 'USD',
          taxFields: { totalCredited: 500 }, // net 4500
        },
        {
          id: 'inv-2',
          status: InvoiceStatus.PAID,
          amount: 1200,
          currency: 'USD',
          taxFields: null, // net 1200
        },
        {
          id: 'inv-3',
          status: InvoiceStatus.ISSUED, // Unpaid - must be excluded!
          amount: 3000,
          currency: 'USD',
          taxFields: null,
        },
      ]);

      const result = await controller.getDashboard({ user: { role: Role.ADMIN } });

      expect(result.totalRevenue).toBe('$5,700');
      expect(result.mockRevenue).toBe('$5,700');
      expect(result.certificatesIssued).toBe(7);
      expect(result.totalCertificates).toBe(7);
    });

    it('handles empty dataset gracefully without NaN or fallbacks', async () => {
      prismaMock.user.count.mockResolvedValue(0);
      prismaMock.batch.count.mockResolvedValue(0);
      prismaMock.certificate.count.mockResolvedValue(0);
      prismaMock.enrolment.findMany.mockResolvedValue([]);
      prismaMock.invoice.findMany.mockResolvedValue([]);

      const result = await controller.getDashboard({ user: { role: Role.ADMIN } });

      expect(result.totalRevenue).toBe('$0');
      expect(result.certificatesIssued).toBe(0);
      expect(result.recentEnrolments).toEqual([]);
      expect(result.programDistribution).toEqual([]);
    });

    it('returns recent enrolments with real batchId, batchName, programTitle, and createdAt', async () => {
      const now = new Date('2026-10-10T12:00:00Z');
      prismaMock.enrolment.findMany.mockImplementation((args: any) => {
        if (args?.take === 5) {
          return Promise.resolve([
            {
              id: 'enr-1',
              createdAt: now,
              status: EnrolmentStatus.ACTIVE,
              user: { id: 'u-1', name: 'Alice Smith', email: 'alice@example.com', role: Role.USER },
              batch: { id: 'batch-99', name: 'October Cohort' },
              program: { title: 'Executive Coaching' },
            },
          ]);
        }
        return Promise.resolve([
          {
            id: 'enr-1',
            program: { title: 'Executive Coaching' },
          },
        ]);
      });

      const result = await controller.getDashboard({ user: { role: Role.ADMIN } });

      expect(result.recentEnrolments).toHaveLength(1);
      expect(result.recentEnrolments[0]).toEqual({
        id: 'enr-1',
        userId: 'u-1',
        name: 'Alice Smith',
        email: 'alice@example.com',
        role: Role.USER,
        status: EnrolmentStatus.ACTIVE,
        enrolmentId: 'enr-1',
        batchId: 'batch-99',
        batchName: 'October Cohort',
        programTitle: 'Executive Coaching',
        createdAt: now,
      });
      expect(result.programDistribution).toHaveLength(1);
      expect(result.programDistribution[0].name).toBe('Executive Coaching');
      expect(result.programDistribution[0].count).toBe(1);
      expect(result.programDistribution[0].percentage).toBe(100);
    });

    it('computes accurate program distribution across all enrolments', async () => {
      prismaMock.enrolment.findMany.mockImplementation((args: any) => {
        if (args?.take === 5) {
          return Promise.resolve([]);
        }
        return Promise.resolve([
          { id: 'e-1', program: { title: 'Program A' } },
          { id: 'e-2', program: { title: 'Program A' } },
          { id: 'e-3', program: { title: 'Program A' } },
          { id: 'e-4', program: { title: 'Program B' } },
        ]);
      });

      const result = await controller.getDashboard({ user: { role: Role.SUPER_ADMIN } });

      expect(result.programDistribution).toHaveLength(2);
      expect(result.programDistribution[0]).toEqual({
        name: 'Program A',
        count: 3,
        percentage: 75,
        color: '#c97a1e',
      });
      expect(result.programDistribution[1]).toEqual({
        name: 'Program B',
        count: 1,
        percentage: 25,
        color: '#d8a86a',
      });
    });
  });

  // =========================================================================
  // PRIORITY 2: Learner Cohort Assignment (BUG-02)
  // =========================================================================
  describe('Priority 2 - Learner Cohort Assignment (BUG-02)', () => {
    let service: UsersService;

    beforeEach(() => {
      service = new UsersService(prismaMock, cacheHelperMock);
    });

    it('persists cohort assignment for a learner and creates enrolment if not existing', async () => {
      const mockUser = { id: 'u-1', email: 'alice@example.com', role: Role.USER };
      prismaMock.user.findUnique.mockResolvedValue(mockUser);
      prismaMock.user.update.mockResolvedValue(mockUser);
      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'b-1',
        name: 'Batch Alpha',
        programId: 'prog-1',
        status: BatchStatus.ACTIVE,
      });
      prismaMock.enrolment.findUnique.mockResolvedValue(null);
      prismaMock.enrolment.create.mockResolvedValue({
        id: 'enr-new',
        userId: 'u-1',
        programId: 'prog-1',
        batchId: 'b-1',
        status: EnrolmentStatus.ACTIVE,
      });

      await service.update(
        'u-1',
        { batchId: 'b-1' },
        { sub: 'admin-1', role: Role.ADMIN }
      );

      expect(prismaMock.enrolment.create).toHaveBeenCalledWith({
        data: {
          userId: 'u-1',
          programId: 'prog-1',
          batchId: 'b-1',
          status: EnrolmentStatus.ACTIVE,
        },
      });
      expect(prismaMock.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ENROLMENT_CREATED',
          entity: 'Enrolment',
        })
      );
    });

    it('transfers batch on an existing enrolment and logs BATCH_TRANSFERRED', async () => {
      const mockUser = { id: 'u-1', email: 'alice@example.com', role: Role.USER };
      prismaMock.user.findUnique.mockResolvedValue(mockUser);
      prismaMock.user.update.mockResolvedValue(mockUser);
      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'b-2',
        name: 'Batch Beta',
        programId: 'prog-1',
        status: BatchStatus.ACTIVE,
      });
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enr-1',
        userId: 'u-1',
        batchId: 'b-1',
        programId: 'prog-1',
        status: EnrolmentStatus.ACTIVE,
      });

      await service.update(
        'u-1',
        { enrolmentId: 'enr-1', batchId: 'b-2' },
        { sub: 'admin-1', role: Role.ADMIN }
      );

      expect(prismaMock.enrolment.update).toHaveBeenCalledWith({
        where: { id: 'enr-1' },
        data: expect.objectContaining({
          batchId: 'b-2',
          programId: 'prog-1',
        }),
      });
      expect(prismaMock.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'BATCH_TRANSFERRED',
          entity: 'Enrolment',
          entityId: 'enr-1',
        })
      );
    });

    it('rejects assignment into a COMPLETED or ARCHIVED batch', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'u-1', role: Role.USER });
      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'b-old',
        name: 'Old Batch',
        programId: 'prog-1',
        status: BatchStatus.COMPLETED,
      });

      await expect(
        service.update('u-1', { batchId: 'b-old' }, { sub: 'admin-1', role: Role.ADMIN })
      ).rejects.toThrow(BadRequestException);
    });

    it('assigns managerId on batch when role is MANAGER', async () => {
      const mockManager = { id: 'mgr-1', email: 'mgr@example.com', role: Role.MANAGER };
      prismaMock.user.findUnique.mockResolvedValue(mockManager);
      prismaMock.user.update.mockResolvedValue(mockManager);

      await service.update(
        'mgr-1',
        { batchId: 'b-1' },
        { sub: 'admin-1', role: Role.ADMIN }
      );

      expect(prismaMock.batch.update).toHaveBeenCalledWith({
        where: { id: 'b-1' },
        data: { managerId: 'mgr-1' },
      });
    });
  });

  // =========================================================================
  // PRIORITY 3: Revoke Access Behavior (BUG-03)
  // =========================================================================
  describe('Priority 3 - Revoke Access Behavior (BUG-03)', () => {
    let service: UsersService;

    beforeEach(() => {
      service = new UsersService(prismaMock, cacheHelperMock);
    });

    it('revokes active enrolments and invalidates sessions without deleting the user record when learner has one active enrolment', async () => {
      const mockUser = {
        id: 'u-target',
        email: 'learner@example.com',
        role: Role.USER,
        enrolments: [
          { id: 'enr-1', status: EnrolmentStatus.ACTIVE, batch: { id: 'b-1', name: 'Cohort 1' }, program: { id: 'p-1', title: 'Program 1' } },
        ],
      };
      prismaMock.user.findUnique.mockResolvedValue(mockUser);
      prismaMock.enrolment.update.mockResolvedValue({ id: 'enr-1', status: EnrolmentStatus.REVOKED });
      prismaMock.userSession.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.revokeAccess(
        'u-target',
        { reason: 'ADMIN_REQUEST' },
        { sub: 'admin-1', role: Role.ADMIN }
      );

      expect(result.success).toBe(true);
      expect(result.revokedEnrolmentsCount).toBe(1);
      expect(result.revokedSessionsCount).toBe(3);
      // Foreign key safety: prisma.user.delete must NEVER be called
      expect(prismaMock.user.delete).not.toHaveBeenCalled();
      // Sessions must be revoked because 0 active enrolments remain
      expect(prismaMock.userSession.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u-target', revokedAt: null },
        data: { revokedAt: expect.any(Date), revokedReason: 'ADMIN_REQUEST' },
      });
      // Audit log must be written
      expect(prismaMock.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LEARNER_ACCESS_REVOKED',
          entity: 'Enrolment',
          entityId: 'enr-1',
        })
      );
    });

    it('supports revoking a single enrolment when enrolmentId is passed and leaves sessions intact if other active enrolments remain', async () => {
      const mockUser = {
        id: 'u-target',
        email: 'learner@example.com',
        role: Role.USER,
        enrolments: [
          { id: 'enr-1', status: EnrolmentStatus.ACTIVE, batch: { id: 'b-1', name: 'Cohort 1' }, program: { id: 'p-1', title: 'Program 1' } },
          { id: 'enr-2', status: EnrolmentStatus.ACTIVE, batch: { id: 'b-2', name: 'Cohort 2' }, program: { id: 'p-2', title: 'Program 2' } },
        ],
      };
      prismaMock.user.findUnique.mockResolvedValue(mockUser);
      prismaMock.enrolment.update.mockResolvedValue({ id: 'enr-1', status: EnrolmentStatus.REVOKED });

      const result = await service.revokeAccess(
        'u-target',
        { enrolmentId: 'enr-1' },
        { sub: 'admin-1', role: Role.ADMIN }
      );

      expect(result.success).toBe(true);
      expect(result.revokedEnrolmentsCount).toBe(1);
      // Narrowest safe behavior: user has enr-2 active, so user sessions must NOT be revoked
      expect(prismaMock.userSession.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.enrolment.update).toHaveBeenCalledWith({
        where: { id: 'enr-1' },
        data: { status: EnrolmentStatus.REVOKED },
      });
      // Untargeted enrolment enr-2 must remain active
      expect(prismaMock.enrolment.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'enr-2' } })
      );
    });

    it('enforces manager cohort scope on revokeAccess', async () => {
      const mockUser = {
        id: 'u-target',
        email: 'learner@example.com',
        role: Role.USER,
        enrolments: [
          { id: 'enr-1', status: EnrolmentStatus.ACTIVE, batch: { id: 'b-other', managerId: 'other-mgr' }, program: { id: 'p-1' } },
        ],
      };
      prismaMock.user.findUnique.mockResolvedValue(mockUser);
      prismaMock.batchTrainer.findFirst.mockResolvedValue(null); // Not a trainer either

      await expect(
        service.revokeAccess(
          'u-target',
          { enrolmentId: 'enr-1' },
          { sub: 'mgr-1', role: Role.MANAGER }
        )
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // PRIORITY 4: Invoice Creation & Persistence (BUG-04)
  // =========================================================================
  describe('Priority 4 - Invoice Creation (BUG-04)', () => {
    let service: InvoicesService;

    beforeEach(() => {
      service = new InvoicesService(prismaMock);
    });

    it('creates an invoice and payment transactionally with audit log', async () => {
      const mockEnrolment = {
        id: 'enr-1',
        userId: 'u-1',
        programId: 'prog-1',
        status: EnrolmentStatus.PENDING_PAYMENT,
        user: { id: 'u-1', name: 'Bob' },
        program: { id: 'prog-1', title: 'Life Coaching' },
        payments: [],
      };

      prismaMock.enrolment.findUnique.mockResolvedValue(mockEnrolment);
      prismaMock.payment.create.mockResolvedValue({
        id: 'pay-1',
        enrolmentId: 'enr-1',
        amount: 2500,
        currency: 'USD',
        status: 'succeeded',
      });
      prismaMock.invoice.create.mockResolvedValue({
        id: 'inv-new',
        invoiceNumber: 'INV-202610-1234',
        amount: 2500,
        currency: 'USD',
        status: InvoiceStatus.PAID,
        createdAt: new Date(),
      });

      const result = await service.create(
        {
          enrolmentId: 'enr-1',
          amount: 2500,
          currency: 'USD',
          status: InvoiceStatus.PAID,
        },
        { sub: 'admin-1', role: Role.ADMIN }
      );

      expect(result.id).toBe('inv-new');
      expect(prismaMock.payment.create).toHaveBeenCalled();
      expect(prismaMock.invoice.create).toHaveBeenCalled();
      expect(prismaMock.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'INVOICE_CREATED',
          entity: 'Invoice',
        })
      );
    });

    it('prevents duplicate invoice creation if enrolment is already invoiced or paid', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enr-1',
        status: EnrolmentStatus.ACTIVE,
        payments: [
          {
            id: 'pay-old',
            status: 'succeeded',
            invoice: { id: 'inv-existing', status: InvoiceStatus.PAID },
          },
        ],
      });

      await expect(
        service.create(
          { enrolmentId: 'enr-1', amount: 1000 },
          { sub: 'admin-1', role: Role.ADMIN }
        )
      ).rejects.toThrow(ConflictException);
    });

    it('acquires transaction-scoped PostgreSQL advisory lock on enrolmentId before reading enrolment', async () => {
      const mockEnrolment = {
        id: 'enr-lock-test',
        userId: 'u-lock',
        programId: 'prog-1',
        status: EnrolmentStatus.ACTIVE,
        user: { id: 'u-lock', name: 'Lock Test' },
        program: { id: 'prog-1', title: 'Life Coaching' },
        payments: [],
      };

      prismaMock.enrolment.findUnique.mockResolvedValue(mockEnrolment);
      prismaMock.payment.create.mockResolvedValue({ id: 'pay-lock' });
      prismaMock.invoice.create.mockResolvedValue({
        id: 'inv-lock',
        invoiceNumber: 'INV-LOCK',
        amount: 500,
        currency: 'USD',
        status: InvoiceStatus.PAID,
        createdAt: new Date(),
      });

      await service.create(
        { enrolmentId: 'enr-lock-test', amount: 500 },
        { sub: 'admin-1', role: Role.ADMIN }
      );

      expect(prismaMock.$executeRaw).toHaveBeenCalled();
    });

    it('prevents concurrent duplicate invoice creation for the same enrolment', async () => {
      let activeInvoiceCreated = false;
      let invoicesCreatedCount = 0;
      let isLockHeld = false;

      // Simulate serialized execution under pg_advisory_xact_lock:
      // PostgreSQL advisory lock queues competing transactions until release
      prismaMock.$executeRaw.mockImplementation(async () => {
        while (isLockHeld) {
          await new Promise((r) => setTimeout(r, 10));
        }
        isLockHeld = true;
      });

      prismaMock.$transaction.mockImplementation(async (callback: any) => {
        try {
          return await callback(prismaMock);
        } finally {
          isLockHeld = false;
        }
      });

      prismaMock.enrolment.findUnique.mockImplementation(async () => {
        if (!activeInvoiceCreated) {
          return {
            id: 'enr-concurrent',
            userId: 'u-1',
            status: EnrolmentStatus.ACTIVE,
            user: { id: 'u-1', name: 'Alice' },
            program: { id: 'p-1', title: 'Course' },
            payments: [],
          };
        }
        return {
          id: 'enr-concurrent',
          userId: 'u-1',
          status: EnrolmentStatus.ACTIVE,
          user: { id: 'u-1', name: 'Alice' },
          program: { id: 'p-1', title: 'Course' },
          payments: [
            {
              id: 'pay-first',
              status: 'succeeded',
              invoice: { id: 'inv-first', invoiceNumber: 'INV-111111', status: InvoiceStatus.PAID },
            },
          ],
        };
      });

      prismaMock.payment.create.mockImplementation(async () => {
        return { id: 'pay-first', amount: 1500, currency: 'USD', status: 'succeeded' };
      });

      prismaMock.invoice.create.mockImplementation(async () => {
        activeInvoiceCreated = true;
        invoicesCreatedCount++;
        return {
          id: 'inv-first',
          invoiceNumber: 'INV-111111',
          amount: 1500,
          currency: 'USD',
          status: InvoiceStatus.PAID,
          createdAt: new Date(),
        };
      });

      // Competing requests 1 & 2 for the exact same enrolment
      const req1 = service.create(
        { enrolmentId: 'enr-concurrent', amount: 1500 },
        { sub: 'admin-1', role: Role.ADMIN }
      );
      const req2 = service.create(
        { enrolmentId: 'enr-concurrent', amount: 1500 },
        { sub: 'admin-2', role: Role.ADMIN }
      );

      const results = await Promise.allSettled([req1, req2]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(invoicesCreatedCount).toBe(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
    });
  });

  // =========================================================================
  // PRIORITY 5: Batch Form Reliability (BUG-05)
  // =========================================================================
  describe('Priority 5 - Batch Form Reliability (BUG-05)', () => {
    let service: BatchesService;

    beforeEach(() => {
      service = new BatchesService(prismaMock, cacheHelperMock);
    });

    it('rejects duplicate batch creation with same name in same program with ConflictException', async () => {
      prismaMock.program.findUnique.mockResolvedValue({ id: 'prog-1', title: 'Workshop' });
      prismaMock.batch.findFirst.mockResolvedValue({
        id: 'batch-existing',
        name: 'Cohort Alpha',
        programId: 'prog-1',
      });

      await expect(
        service.create({
          name: 'Cohort Alpha',
          programId: 'prog-1',
          startDate: new Date(),
          endDate: new Date(),
        } as any)
      ).rejects.toThrow(ConflictException);
    });

    it('allows batch creation when batch name is unique in program', async () => {
      prismaMock.program.findUnique.mockResolvedValue({ id: 'prog-1', title: 'Workshop' });
      prismaMock.batch.findFirst.mockResolvedValue(null);
      prismaMock.batch.create.mockResolvedValue({
        id: 'batch-new',
        name: 'Cohort Unique',
        programId: 'prog-1',
      });
      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'batch-new',
        name: 'Cohort Unique',
        programId: 'prog-1',
        capacity: 20,
        status: BatchStatus.UPCOMING,
        program: { id: 'prog-1', title: 'Workshop', slug: 'workshop' },
        trainers: [],
        _count: { enrolments: 0 },
      });

      const result = await service.create({
        name: 'Cohort Unique',
        programId: 'prog-1',
        startDate: new Date(),
        endDate: new Date(),
      } as any);

      expect(result.id).toBe('batch-new');
      expect(prismaMock.batch.create).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // PRIORITY 6: Revenue Analytics (BUG-06)
  // =========================================================================
  describe('Priority 6 - Revenue Analytics (BUG-06)', () => {
    let controller: RevenueController;

    beforeEach(() => {
      controller = new RevenueController(prismaMock);
    });

    it('strictly counts only PAID invoices and subtracts credit notes, excluding ISSUED invoices', async () => {
      prismaMock.invoice.findMany.mockResolvedValue([
        {
          id: 'inv-1',
          invoiceNumber: 'INV-1',
          status: InvoiceStatus.PAID,
          amount: 10000,
          currency: 'USD',
          taxFields: { totalCredited: 1500 }, // net 8500
          createdAt: new Date(),
          payment: { enrolment: { program: { title: 'Program A' } } },
        },
        {
          id: 'inv-2',
          invoiceNumber: 'INV-2',
          status: InvoiceStatus.PAID,
          amount: 5000,
          currency: 'USD',
          taxFields: null, // net 5000
          createdAt: new Date(),
          payment: { enrolment: { program: { title: 'Program B' } } },
        },
        {
          id: 'inv-3',
          invoiceNumber: 'INV-3',
          status: InvoiceStatus.ISSUED, // Unpaid - strictly excluded from recognized revenue!
          amount: 8000,
          currency: 'USD',
          taxFields: null,
          createdAt: new Date(),
          payment: { enrolment: { program: { title: 'Program C' } } },
        },
      ]);

      const result = await controller.getRevenueStats({ user: { role: Role.ADMIN } });

      expect(result.totalRevenue).toBe('$13,500');
      expect(result.numericTotalRevenue).toBe(13500);
      expect(result.totalInvoicesCount).toBe(3);
      expect(result.paidTransactionsCount).toBe(2);
      expect(result.mrr).toBeNull();
      expect(result.isRecurringBillingSupported).toBe(false);
      expect(result.transactions[0].netAmount).toBe(8500);
      expect(result.transactions[1].netAmount).toBe(5000);
      expect(result.transactions[2].netAmount).toBe(0); // Unpaid ISSUED
    });

    it('reports mrr as null and isRecurringBillingSupported as false when no recurring subscriptions exist', async () => {
      prismaMock.invoice.findMany.mockResolvedValue([]);

      const result = await controller.getRevenueStats({ user: { role: Role.SUPER_ADMIN } });

      expect(result.totalRevenue).toBe('$0');
      expect(result.numericTotalRevenue).toBe(0);
      expect(result.paidTransactionsCount).toBe(0);
      expect(result.totalInvoicesCount).toBe(0);
      expect(result.mrr).toBeNull();
      expect(result.isRecurringBillingSupported).toBe(false);
    });

    it('handles full and partial credit notes without double-counting and excludes DRAFT/CANCELLED', async () => {
      prismaMock.invoice.findMany.mockResolvedValue([
        {
          id: 'inv-full-credit',
          invoiceNumber: 'INV-FC',
          status: InvoiceStatus.PAID,
          amount: 2000,
          currency: 'USD',
          taxFields: { totalCredited: 2000 }, // Full credit note -> net 0
          createdAt: new Date(),
        },
        {
          id: 'inv-partial-credit',
          invoiceNumber: 'INV-PC',
          status: InvoiceStatus.PAID,
          amount: 4000,
          currency: 'USD',
          taxFields: { totalCredited: 1500 }, // Partial credit note -> net 2500
          createdAt: new Date(),
        },
        {
          id: 'inv-excess-credit',
          invoiceNumber: 'INV-EC',
          status: InvoiceStatus.PAID,
          amount: 1000,
          currency: 'USD',
          taxFields: { totalCredited: 1500 }, // Over-credited -> clamped to 0, never negative
          createdAt: new Date(),
        },
        {
          id: 'inv-draft',
          invoiceNumber: 'INV-DRAFT',
          status: InvoiceStatus.DRAFT,
          amount: 9000,
          currency: 'USD',
          taxFields: null,
          createdAt: new Date(),
        },
        {
          id: 'inv-cancelled',
          invoiceNumber: 'INV-CANCEL',
          status: InvoiceStatus.CANCELLED,
          amount: 9000,
          currency: 'USD',
          taxFields: null,
          createdAt: new Date(),
        },
      ]);

      const result = await controller.getRevenueStats({ user: { role: Role.ADMIN } });

      // 0 + 2500 + 0 = 2500
      expect(result.totalRevenue).toBe('$2,500');
      expect(result.numericTotalRevenue).toBe(2500);
      expect(result.paidTransactionsCount).toBe(3);
      expect(result.totalInvoicesCount).toBe(5);
    });
  });

  // =========================================================================
  // EDGE CASES & MULTI-ENROLMENT REGRESSION SUITE
  // =========================================================================
  describe('Multi-Enrolment & Cross-Feature Security Tests', () => {
    it('handles single learner with multiple enrolments without key collisions and distinct manager scoping', async () => {
      const dashboardCtrl = new AdminDashboardController(prismaMock);
      const now = new Date('2026-10-12T10:00:00Z');

      // Manager scenario: one learner enrolled in two different batches managed by the same manager
      prismaMock.batch.count.mockResolvedValue(2);
      prismaMock.certificate.count.mockResolvedValue(1);
      prismaMock.enrolment.findMany.mockImplementation((args: any) => {
        if (args?.select?.userId) {
          // Distinct user query: learner 'u-multi' should be counted once
          return Promise.resolve([{ userId: 'u-multi' }]);
        }
        if (args?.take === 5) {
          // Recent enrolments: returns both enrolments with distinct enrolment IDs
          return Promise.resolve([
            {
              id: 'enr-prog-1',
              createdAt: now,
              status: EnrolmentStatus.ACTIVE,
              user: { id: 'u-multi', name: 'Multi Learner', email: 'multi@example.com', role: Role.USER },
              batch: { id: 'batch-1', name: 'Batch 1' },
              program: { id: 'prog-1', title: 'Program 1' },
            },
            {
              id: 'enr-prog-2',
              createdAt: now,
              status: EnrolmentStatus.ACTIVE,
              user: { id: 'u-multi', name: 'Multi Learner', email: 'multi@example.com', role: Role.USER },
              batch: { id: 'batch-2', name: 'Batch 2' },
              program: { id: 'prog-2', title: 'Program 2' },
            },
          ]);
        }
        return Promise.resolve([
          { program: { title: 'Program 1' } },
          { program: { title: 'Program 2' } },
        ]);
      });

      const result = await dashboardCtrl.getDashboard({ user: { id: 'mgr-1', role: Role.MANAGER } });

      // Total distinct learners is 1, not 2
      expect(result.totalLearners).toBe(1);
      // Both enrolments have unique IDs avoiding React key collision
      expect(result.recentEnrolments[0].id).toBe('enr-prog-1');
      expect(result.recentEnrolments[1].id).toBe('enr-prog-2');
      expect(result.recentEnrolments[0].id).not.toBe(result.recentEnrolments[1].id);
      // Manager cannot view revenue
      expect(result.totalRevenue).toBeNull();
    });

    it('denies learner from updating another user profile', async () => {
      const userService = new UsersService(prismaMock, cacheHelperMock);

      await expect(
        userService.update(
          'user-victim',
          { name: 'Hacked Name' },
          { sub: 'user-attacker', role: Role.USER }
        )
      ).rejects.toThrow(ForbiddenException);
    });

    it('denies non-Super Admin from changing a user role', async () => {
      const userService = new UsersService(prismaMock, cacheHelperMock);
      prismaMock.user.findUnique.mockResolvedValue({ id: 'u-target', role: Role.USER });

      await expect(
        userService.update(
          'u-target',
          { role: Role.ADMIN },
          { sub: 'admin-regular', role: Role.ADMIN }
        )
      ).rejects.toThrow(ForbiddenException);
    });

    it('preserves existing financial records and unrelated enrolments when revoking one enrolment', async () => {
      const userService = new UsersService(prismaMock, cacheHelperMock);
      const mockUser = {
        id: 'u-multi',
        email: 'multi@example.com',
        role: Role.USER,
        enrolments: [
          { id: 'enr-keep', status: EnrolmentStatus.ACTIVE },
          { id: 'enr-revoke', status: EnrolmentStatus.ACTIVE },
        ],
      };
      prismaMock.user.findUnique.mockResolvedValue(mockUser);
      prismaMock.enrolment.update.mockResolvedValue({ id: 'enr-revoke', status: EnrolmentStatus.REVOKED });

      const result = await userService.revokeAccess(
        'u-multi',
        { enrolmentId: 'enr-revoke', reason: 'COURSE_WITHDRAWAL' },
        { sub: 'admin-1', role: Role.ADMIN }
      );

      expect(result.success).toBe(true);
      expect(result.revokedEnrolmentsCount).toBe(1);
      // Only the targeted enrolment is revoked
      expect(prismaMock.enrolment.update).toHaveBeenCalledWith({
        where: { id: 'enr-revoke' },
        data: { status: EnrolmentStatus.REVOKED },
      });
      // Financial records / invoices / payments are untouched
      expect(prismaMock.invoice.create).not.toHaveBeenCalled();
      expect(prismaMock.user.delete).not.toHaveBeenCalled();
    });

    it('allows batch with same name in a different program', async () => {
      const batchService = new BatchesService(prismaMock, cacheHelperMock);
      prismaMock.program.findUnique.mockResolvedValue({ id: 'prog-2', title: 'Advanced Track' });
      // findFirst returns null because no batch named 'Cohort Alpha' exists in prog-2
      prismaMock.batch.findFirst.mockResolvedValue(null);
      prismaMock.batch.create.mockResolvedValue({
        id: 'batch-prog2',
        name: 'Cohort Alpha',
        programId: 'prog-2',
      });
      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'batch-prog2',
        name: 'Cohort Alpha',
        programId: 'prog-2',
        capacity: 25,
        status: BatchStatus.UPCOMING,
        program: { id: 'prog-2', title: 'Advanced Track', slug: 'advanced' },
        trainers: [],
        _count: { enrolments: 0 },
      });

      const result = await batchService.create({
        name: 'Cohort Alpha',
        programId: 'prog-2',
        startDate: new Date(),
        endDate: new Date(),
      } as any);

      expect(result.id).toBe('batch-prog2');
      expect(result.name).toBe('Cohort Alpha');
    });
  });

  // =========================================================================
  // ISSUE 1: Program Deletion Safeguards & Archival Flow
  // =========================================================================
  describe('Issue 1: Program Deletion Safeguards & Archival Flow', () => {
    let programsService: ProgramsService;

    beforeEach(() => {
      programsService = new ProgramsService(prismaMock, cacheHelperMock, mediaProviderMock);
    });

    it('archives program when batches or enrolments exist to preserve learner progress and FK constraints', async () => {
      prismaMock.program.findUnique.mockResolvedValue({
        id: 'prog-active',
        title: 'Transformational Leadership',
        status: ContentStatus.PUBLISHED,
        isActive: true,
      });
      // Active batches and student enrolments exist
      prismaMock.batch.count.mockResolvedValue(3);
      prismaMock.enrolment.count.mockResolvedValue(12);
      prismaMock.program.update.mockResolvedValue({
        id: 'prog-active',
        status: ContentStatus.ARCHIVED,
        isActive: false,
      });

      const result = await programsService.remove('prog-active');

      expect(result.archived).toBe(true);
      expect(result.deleted).toBe(false);
      expect(result.message).toContain('safely archived');
      expect(prismaMock.program.update).toHaveBeenCalledWith({
        where: { id: 'prog-active' },
        data: {
          status: ContentStatus.ARCHIVED,
          isActive: false,
        },
      });
      // Ensure hard delete was NOT attempted
      expect(prismaMock.program.delete).not.toHaveBeenCalled();
      // Ensure cache is invalidated
      expect(cacheHelperMock.invalidateNamespace).toHaveBeenCalledWith('programs');
    });

    it('hard-deletes program and cleans media when no batches or enrolments exist', async () => {
      prismaMock.program.findUnique.mockResolvedValue({
        id: 'prog-unused',
        title: 'Draft Scratchpad',
        description: JSON.stringify({ image: 'https://res.cloudinary.com/demo/image/upload/sample.jpg' }),
      });
      prismaMock.batch.count.mockResolvedValue(0);
      prismaMock.enrolment.count.mockResolvedValue(0);
      prismaMock.lesson.findMany.mockResolvedValue([]);
      prismaMock.resource.findMany.mockResolvedValue([]);
      prismaMock.program.delete.mockResolvedValue({ id: 'prog-unused' });

      const result = await programsService.remove('prog-unused');

      expect(result.deleted).toBe(true);
      expect(result.archived).toBe(false);
      expect(prismaMock.program.delete).toHaveBeenCalledWith({ where: { id: 'prog-unused' } });
      expect(mediaProviderMock.deleteMedia).toHaveBeenCalled();
      expect(cacheHelperMock.invalidateNamespace).toHaveBeenCalledWith('programs');
    });

    it('throws NotFoundException when program to delete does not exist', async () => {
      prismaMock.program.findUnique.mockResolvedValue(null);

      await expect(programsService.remove('prog-nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // ISSUE 2: Revenue Multi-Transaction Analytics & Deduplication
  // =========================================================================
  describe('Issue 2: Revenue Multi-Transaction Analytics & Deduplication', () => {
    let revenueController: RevenueController;

    beforeEach(() => {
      revenueController = new RevenueController(prismaMock);
    });

    it('returns all eligible student transactions and calculates net revenue with credit notes', async () => {
      const now = new Date();
      const yesterday = new Date(Date.now() - 86400000);
      const twoDaysAgo = new Date(Date.now() - 172800000);

      // Student 1: Paid invoice $525
      const inv1 = {
        id: 'inv-1',
        invoiceNumber: 'WBM-2026-0001',
        amount: 525,
        status: InvoiceStatus.PAID,
        createdAt: twoDaysAgo,
        taxFields: null,
        creditNoteId: null,
        payment: {
          enrolmentId: 'enr-alice',
          enrolment: {
            user: { name: 'Alice Learner', email: 'alice@example.com' },
          },
        },
      };

      // Student 2: Paid invoice $1200 with partial credit note of $200 (net $1000)
      const inv2 = {
        id: 'inv-2',
        invoiceNumber: 'WBM-2026-0002',
        amount: 1200,
        status: InvoiceStatus.PAID,
        createdAt: yesterday,
        taxFields: { totalCredited: 200 },
        creditNoteId: 'cn-1',
        payment: {
          enrolmentId: 'enr-bob',
          enrolment: {
            user: { name: 'Bob Smith', email: 'bob@example.com' },
          },
        },
      };

      // Student 3: Issued unpaid invoice $750 (should appear in transactions, but netAmount 0 and not in revenue)
      const inv3 = {
        id: 'inv-3',
        invoiceNumber: 'WBM-2026-0003',
        amount: 750,
        status: InvoiceStatus.ISSUED,
        createdAt: now,
        taxFields: null,
        creditNoteId: null,
        payment: {
          enrolmentId: 'enr-carol',
          enrolment: {
            user: { name: null, email: 'carol@example.com' }, // Learner without name: falls back to email
          },
        },
      };

      prismaMock.invoice.findMany.mockResolvedValue([inv3, inv2, inv1]);
      prismaMock.payment.findMany.mockResolvedValue([]);

      const result = await revenueController.getRevenueStats({} as any);

      // All 3 transactions appear
      expect(result.transactions).toHaveLength(3);
      expect(result.transactions[0].description).toBe('Invoice WBM-2026-0003');
      expect(result.transactions[0].user).toBe('carol@example.com'); // fallback to email
      expect(result.transactions[0].status).toBe(InvoiceStatus.ISSUED);
      expect(result.transactions[0].netAmount).toBe(0);

      expect(result.transactions[1].description).toBe('Invoice WBM-2026-0002');
      expect(result.transactions[1].user).toBe('Bob Smith');
      expect(result.transactions[1].netAmount).toBe(1000); // 1200 - 200

      expect(result.transactions[2].description).toBe('Invoice WBM-2026-0001');
      expect(result.transactions[2].user).toBe('Alice Learner');
      expect(result.transactions[2].netAmount).toBe(525);

      // Total revenue = 525 + (1200 - 200) = 1525 (unpaid 750 is strictly excluded)
      expect(result.numericTotalRevenue).toBe(1525);
      expect(result.totalRevenue).toBe('$1,525');

      // Unique paid enrolments = 2 (Alice, Bob)
      expect(result.paidEnrolmentsCount).toBe(2);
      expect(result.activeSubscribers).toBe(2);
    });

    it('unifies standalone succeeded payments without double-counting', async () => {
      const now = new Date();
      const past = new Date(Date.now() - 3600000);

      // 1 paid invoice for Dave
      const inv = {
        id: 'inv-dave',
        invoiceNumber: 'WBM-2026-0010',
        amount: 300,
        status: InvoiceStatus.PAID,
        createdAt: past,
        taxFields: null,
        creditNoteId: null,
        payment: {
          enrolmentId: 'enr-dave',
          enrolment: {
            user: { name: 'Dave Miller', email: 'dave@example.com' },
          },
        },
      };

      // 1 standalone manual payment for Emma ($400 succeeded)
      const standalonePayment = {
        id: 'pay-emma',
        amount: 400,
        status: 'succeeded',
        stripeSessionId: 'manual_cash_01',
        createdAt: now,
        enrolmentId: 'enr-emma',
        enrolment: {
          user: { name: 'Emma Watson', email: 'emma@example.com' },
        },
      };

      prismaMock.invoice.findMany.mockResolvedValue([inv]);
      prismaMock.payment.findMany.mockResolvedValue([standalonePayment]);

      const result = await revenueController.getRevenueStats({} as any);

      expect(result.transactions).toHaveLength(2);
      // Standalone payment sorted newest first
      expect(result.transactions[0].id).toBe('pay-emma');
      expect(result.transactions[0].description).toBe('Payment Manual');
      expect(result.transactions[0].user).toBe('Emma Watson');
      expect(result.transactions[0].netAmount).toBe(400);

      // Total revenue = 300 + 400 = 700
      expect(result.numericTotalRevenue).toBe(700);
      expect(result.totalRevenue).toBe('$700');
      expect(result.paidEnrolmentsCount).toBe(2);
    });

    it('deduplicates paid enrolments if multiple payments occur for the same enrolment', async () => {
      const now = new Date();

      // 2 payments for the same student enrolment (e.g. installment or milestone)
      const inv1 = {
        id: 'inv-inst-1',
        invoiceNumber: 'WBM-2026-0021',
        amount: 500,
        status: InvoiceStatus.PAID,
        createdAt: now,
        taxFields: null,
        creditNoteId: null,
        payment: {
          enrolmentId: 'enr-frank',
          enrolment: {
            user: { name: 'Frank Castle', email: 'frank@example.com' },
          },
        },
      };

      const inv2 = {
        id: 'inv-inst-2',
        invoiceNumber: 'WBM-2026-0022',
        amount: 500,
        status: InvoiceStatus.PAID,
        createdAt: now,
        taxFields: null,
        creditNoteId: null,
        payment: {
          enrolmentId: 'enr-frank', // SAME enrolment ID
          enrolment: {
            user: { name: 'Frank Castle', email: 'frank@example.com' },
          },
        },
      };

      prismaMock.invoice.findMany.mockResolvedValue([inv2, inv1]);
      prismaMock.payment.findMany.mockResolvedValue([]);

      const result = await revenueController.getRevenueStats({} as any);

      expect(result.transactions).toHaveLength(2);
      // Total revenue sums both installments ($1000)
      expect(result.numericTotalRevenue).toBe(1000);
      // Unique paid enrolments deduplicated to 1 (not 2)
      expect(result.paidEnrolmentsCount).toBe(1);
      expect(result.activeSubscribers).toBe(1);
    });

    it('returns empty array and $0 when no transactions exist', async () => {
      prismaMock.invoice.findMany.mockResolvedValue([]);
      prismaMock.payment.findMany.mockResolvedValue([]);

      const result = await revenueController.getRevenueStats({} as any);

      expect(result.transactions).toEqual([]);
      expect(result.numericTotalRevenue).toBe(0);
      expect(result.totalRevenue).toBe('$0');
      expect(result.paidEnrolmentsCount).toBe(0);
      expect(result.paidTransactionsCount).toBe(0);
    });
  });
});
