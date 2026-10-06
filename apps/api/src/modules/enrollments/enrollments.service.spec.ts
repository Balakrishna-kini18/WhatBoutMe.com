import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BatchStatus, EnrolmentStatus, Role } from '@prisma/client';
import { EnrollmentsService, CAPACITY_OCCUPYING_STATUSES } from './enrollments.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CacheHelperService } from '../../common/cache/cache-helper.service.js';
import { PaymentMode } from './dto/index.js';

describe('D1-032: EnrollmentsService - State Machine, Concurrency & Waitlist Engine', () => {
  let service: EnrollmentsService;
  let prismaMock: any;
  let cacheHelperMock: any;

  beforeEach(() => {
    prismaMock = {
      enrolment: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
      batch: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      program: {
        findUnique: vi.fn(),
      },
      user: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
      },
      payment: {
        create: vi.fn(),
      },
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
    };

    service = new EnrollmentsService(
      prismaMock as unknown as PrismaService,
      cacheHelperMock as unknown as CacheHelperService,
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. CREATION & CAPACITY ALLOCATION
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Enrollment Creation & Capacity Boundary', () => {
    it('creates enrollment with status PENDING_PAYMENT when batch has available capacity', async () => {
      prismaMock.user.findFirst.mockResolvedValue({ id: 'user-1', name: 'Learner One', role: Role.USER });
      prismaMock.program.findUnique.mockResolvedValue({ id: 'prog-1', title: '11 Steps to U' });
      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'batch-1',
        programId: 'prog-1',
        status: BatchStatus.UPCOMING,
        capacity: 20,
      });
      prismaMock.enrolment.findUnique.mockResolvedValue(null);
      prismaMock.enrolment.count.mockResolvedValue(10); // 10 / 20 seats
      prismaMock.enrolment.create.mockImplementation(async ({ data }: any) => ({
        id: 'enrol-1',
        ...data,
      }));

      const result = await service.create({
        userId: 'user-1',
        programId: 'prog-1',
        batchId: 'batch-1',
        paymentMode: PaymentMode.STRIPE,
      });

      expect(result.status).toBe(EnrolmentStatus.PENDING_PAYMENT);
      expect(prismaMock.$executeRaw).toHaveBeenCalled();
      expect(prismaMock.payment.create).not.toHaveBeenCalled();
    });

    it('creates enrollment with status PENDING_AGREEMENT when paymentMode is OFFLINE and capacity exists', async () => {
      prismaMock.user.findFirst.mockResolvedValue({ id: 'user-1', name: 'Learner One', role: Role.USER });
      prismaMock.program.findUnique.mockResolvedValue({ id: 'prog-1', title: '11 Steps to U' });
      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'batch-1',
        programId: 'prog-1',
        status: BatchStatus.UPCOMING,
        capacity: 20,
      });
      prismaMock.enrolment.findUnique.mockResolvedValue(null);
      prismaMock.enrolment.count.mockResolvedValue(5);
      prismaMock.enrolment.create.mockImplementation(async ({ data }: any) => ({
        id: 'enrol-offline',
        ...data,
      }));

      const result = await service.create({
        userId: 'user-1',
        programId: 'prog-1',
        batchId: 'batch-1',
        paymentMode: PaymentMode.OFFLINE,
      });

      expect(result.status).toBe(EnrolmentStatus.PENDING_AGREEMENT);
      expect(prismaMock.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          enrolmentId: 'enrol-offline',
          status: 'succeeded',
        }),
      });
    });

    it('creates enrollment with status WAITLIST when batch capacity is reached', async () => {
      prismaMock.user.findFirst.mockResolvedValue({ id: 'user-1', name: 'Learner One', role: Role.USER });
      prismaMock.program.findUnique.mockResolvedValue({ id: 'prog-1', title: '11 Steps to U' });
      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'batch-1',
        programId: 'prog-1',
        status: BatchStatus.UPCOMING,
        capacity: 20,
      });
      prismaMock.enrolment.findUnique.mockResolvedValue(null);
      prismaMock.enrolment.count.mockResolvedValue(20); // Full batch
      prismaMock.enrolment.create.mockImplementation(async ({ data }: any) => ({
        id: 'enrol-waitlist',
        ...data,
      }));

      const result = await service.create({
        userId: 'user-1',
        programId: 'prog-1',
        batchId: 'batch-1',
      });

      expect(result.status).toBe(EnrolmentStatus.WAITLIST);
    });

    it('rejects enrollment if learner does not exist or is soft-deleted', async () => {
      prismaMock.user.findFirst.mockResolvedValue(null);

      await expect(
        service.create({
          userId: 'nonexistent',
          programId: 'prog-1',
          batchId: 'batch-1',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects enrollment if program does not exist', async () => {
      prismaMock.user.findFirst.mockResolvedValue({ id: 'user-1' });
      prismaMock.program.findUnique.mockResolvedValue(null);

      await expect(
        service.create({
          userId: 'user-1',
          programId: 'nonexistent',
          batchId: 'batch-1',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects enrollment if batch does not exist', async () => {
      prismaMock.user.findFirst.mockResolvedValue({ id: 'user-1' });
      prismaMock.program.findUnique.mockResolvedValue({ id: 'prog-1' });
      prismaMock.batch.findUnique.mockResolvedValue(null);

      await expect(
        service.create({
          userId: 'user-1',
          programId: 'prog-1',
          batchId: 'nonexistent',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects enrollment if batch belongs to a different program', async () => {
      prismaMock.user.findFirst.mockResolvedValue({ id: 'user-1' });
      prismaMock.program.findUnique.mockResolvedValue({ id: 'prog-1' });
      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'batch-1',
        programId: 'prog-different',
        status: BatchStatus.UPCOMING,
      });

      await expect(
        service.create({
          userId: 'user-1',
          programId: 'prog-1',
          batchId: 'batch-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects enrollment into a COMPLETED batch', async () => {
      prismaMock.user.findFirst.mockResolvedValue({ id: 'user-1' });
      prismaMock.program.findUnique.mockResolvedValue({ id: 'prog-1' });
      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'batch-1',
        programId: 'prog-1',
        status: BatchStatus.COMPLETED,
      });

      await expect(
        service.create({
          userId: 'user-1',
          programId: 'prog-1',
          batchId: 'batch-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects enrollment into an ARCHIVED batch', async () => {
      prismaMock.user.findFirst.mockResolvedValue({ id: 'user-1' });
      prismaMock.program.findUnique.mockResolvedValue({ id: 'prog-1' });
      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'batch-1',
        programId: 'prog-1',
        status: BatchStatus.ARCHIVED,
      });

      await expect(
        service.create({
          userId: 'user-1',
          programId: 'prog-1',
          batchId: 'batch-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate enrollment in the same program', async () => {
      prismaMock.user.findFirst.mockResolvedValue({ id: 'user-1' });
      prismaMock.program.findUnique.mockResolvedValue({ id: 'prog-1' });
      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'batch-1',
        programId: 'prog-1',
        status: BatchStatus.UPCOMING,
        capacity: 20,
      });
      prismaMock.enrolment.findUnique.mockResolvedValueOnce({ id: 'existing-enrol' });

      await expect(
        service.create({
          userId: 'user-1',
          programId: 'prog-1',
          batchId: 'batch-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. STATE MACHINE TRANSITIONS & AGREEMENT GATE
  // ─────────────────────────────────────────────────────────────────────────────
  describe('State Machine Transitions & Agreement Gate', () => {
    it('transitions PENDING_PAYMENT -> PENDING_AGREEMENT when payment is confirmed', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        status: EnrolmentStatus.PENDING_PAYMENT,
        signedAgreement: null,
      });
      prismaMock.enrolment.update.mockResolvedValue({
        id: 'enrol-1',
        status: EnrolmentStatus.PENDING_AGREEMENT,
      });

      const res = await service.transitionStatus('enrol-1', {
        targetStatus: EnrolmentStatus.PENDING_AGREEMENT,
      });

      expect(res.status).toBe(EnrolmentStatus.PENDING_AGREEMENT);
    });

    it('rejects transition PENDING_PAYMENT -> ACTIVE (agreement must be signed first)', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        status: EnrolmentStatus.PENDING_PAYMENT,
      });

      await expect(
        service.transitionStatus('enrol-1', {
          targetStatus: EnrolmentStatus.ACTIVE,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects transition PENDING_AGREEMENT -> ACTIVE when signedAgreement is null', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        status: EnrolmentStatus.PENDING_AGREEMENT,
        signedAgreement: null,
      });

      await expect(
        service.transitionStatus('enrol-1', {
          targetStatus: EnrolmentStatus.ACTIVE,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects transition PENDING_AGREEMENT -> ACTIVE when signedAgreement status is PENDING', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        status: EnrolmentStatus.PENDING_AGREEMENT,
        signedAgreement: { id: 'sa-1', status: 'PENDING' },
      });

      await expect(
        service.transitionStatus('enrol-1', {
          targetStatus: EnrolmentStatus.ACTIVE,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows transition PENDING_AGREEMENT -> ACTIVE when signedAgreement status is SIGNED', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        status: EnrolmentStatus.PENDING_AGREEMENT,
        signedAgreement: { id: 'sa-1', status: 'SIGNED' },
      });
      prismaMock.enrolment.update.mockResolvedValue({
        id: 'enrol-1',
        status: EnrolmentStatus.ACTIVE,
      });

      const res = await service.transitionStatus('enrol-1', {
        targetStatus: EnrolmentStatus.ACTIVE,
      });

      expect(res.status).toBe(EnrolmentStatus.ACTIVE);
    });

    it('transitions ACTIVE -> COMPLETED on curriculum completion', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        status: EnrolmentStatus.ACTIVE,
      });
      prismaMock.enrolment.update.mockResolvedValue({
        id: 'enrol-1',
        status: EnrolmentStatus.COMPLETED,
      });

      const res = await service.transitionStatus('enrol-1', {
        targetStatus: EnrolmentStatus.COMPLETED,
      });

      expect(res.status).toBe(EnrolmentStatus.COMPLETED);
    });

    it('transitions ACTIVE -> REVOKED on refund or cancellation', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        status: EnrolmentStatus.ACTIVE,
      });
      prismaMock.enrolment.update.mockResolvedValue({
        id: 'enrol-1',
        status: EnrolmentStatus.REVOKED,
      });

      const res = await service.transitionStatus('enrol-1', {
        targetStatus: EnrolmentStatus.REVOKED,
      });

      expect(res.status).toBe(EnrolmentStatus.REVOKED);
    });

    it('blocks any transition from terminal status COMPLETED', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        status: EnrolmentStatus.COMPLETED,
      });

      await expect(
        service.transitionStatus('enrol-1', {
          targetStatus: EnrolmentStatus.ACTIVE,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('blocks any transition from terminal status REVOKED', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        status: EnrolmentStatus.REVOKED,
      });

      await expect(
        service.transitionStatus('enrol-1', {
          targetStatus: EnrolmentStatus.ACTIVE,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns existing enrolment without error when transitioning to same status', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        status: EnrolmentStatus.ACTIVE,
      });

      const res = await service.transitionStatus('enrol-1', {
        targetStatus: EnrolmentStatus.ACTIVE,
      });

      expect(res.status).toBe(EnrolmentStatus.ACTIVE);
      expect(prismaMock.enrolment.update).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. WAITLIST PROMOTION (FIFO)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Waitlist FIFO Promotion', () => {
    it('promotes oldest waitlisted learner to PENDING_PAYMENT if unpaid', async () => {
      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'batch-1',
        capacity: 20,
        status: BatchStatus.ACTIVE,
      });
      prismaMock.enrolment.count.mockResolvedValue(18); // 18 occupied < 20
      prismaMock.enrolment.findFirst.mockResolvedValue({
        id: 'enrol-waitlist-1',
        createdAt: new Date('2026-01-01'),
        payments: [],
      });
      prismaMock.enrolment.update.mockResolvedValue({
        id: 'enrol-waitlist-1',
        status: EnrolmentStatus.PENDING_PAYMENT,
      });

      const res = await service.promoteNextWaitlisted('batch-1');

      expect(res.promoted).toBe(true);
      expect(res.newStatus).toBe(EnrolmentStatus.PENDING_PAYMENT);
      expect(prismaMock.enrolment.findFirst).toHaveBeenCalledWith({
        where: { batchId: 'batch-1', status: EnrolmentStatus.WAITLIST },
        orderBy: { createdAt: 'asc' },
        include: { payments: true },
      });
    });

    it('promotes oldest waitlisted learner to PENDING_AGREEMENT if already paid', async () => {
      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'batch-1',
        capacity: 20,
        status: BatchStatus.ACTIVE,
      });
      prismaMock.enrolment.count.mockResolvedValue(18);
      prismaMock.enrolment.findFirst.mockResolvedValue({
        id: 'enrol-waitlist-2',
        createdAt: new Date('2026-01-01'),
        payments: [{ id: 'pay-1', status: 'succeeded' }],
      });
      prismaMock.enrolment.update.mockResolvedValue({
        id: 'enrol-waitlist-2',
        status: EnrolmentStatus.PENDING_AGREEMENT,
      });

      const res = await service.promoteNextWaitlisted('batch-1');

      expect(res.promoted).toBe(true);
      expect(res.newStatus).toBe(EnrolmentStatus.PENDING_AGREEMENT);
    });

    it('rejects promotion if batch is currently full', async () => {
      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'batch-1',
        capacity: 20,
        status: BatchStatus.ACTIVE,
      });
      prismaMock.enrolment.count.mockResolvedValue(20); // full

      await expect(service.promoteNextWaitlisted('batch-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects promotion if no waitlisted learners exist', async () => {
      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'batch-1',
        capacity: 20,
        status: BatchStatus.ACTIVE,
      });
      prismaMock.enrolment.count.mockResolvedValue(15);
      prismaMock.enrolment.findFirst.mockResolvedValue(null);

      await expect(service.promoteNextWaitlisted('batch-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. BATCH TRANSFER
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Batch Transfer Engine', () => {
    it('transfers learner to new batch preserving existing progress and active status', async () => {
      prismaMock.enrolment.findUnique
        .mockResolvedValueOnce({
          id: 'enrol-1',
          userId: 'user-1',
          programId: 'prog-1',
          batchId: 'batch-old',
          status: EnrolmentStatus.ACTIVE,
        })
        .mockResolvedValueOnce(null); // uniqueness in dest check

      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'batch-new',
        programId: 'prog-1',
        capacity: 20,
        status: BatchStatus.ACTIVE,
      });
      prismaMock.enrolment.count.mockResolvedValue(10); // 10 < 20
      prismaMock.enrolment.update.mockResolvedValue({
        id: 'enrol-1',
        batchId: 'batch-new',
        status: EnrolmentStatus.ACTIVE,
      });

      const res = await service.transferBatch('enrol-1', {
        destinationBatchId: 'batch-new',
      });

      expect(res.transferred).toBe(true);
      expect(res.toBatchId).toBe('batch-new');
      expect(prismaMock.enrolment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { batchId: 'batch-new', status: EnrolmentStatus.ACTIVE },
        }),
      );
    });

    it('moves learner to WAITLIST in destination batch if destination batch is full', async () => {
      prismaMock.enrolment.findUnique
        .mockResolvedValueOnce({
          id: 'enrol-1',
          userId: 'user-1',
          programId: 'prog-1',
          batchId: 'batch-old',
          status: EnrolmentStatus.ACTIVE,
        })
        .mockResolvedValueOnce(null);

      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'batch-new',
        programId: 'prog-1',
        capacity: 20,
        status: BatchStatus.ACTIVE,
      });
      prismaMock.enrolment.count.mockResolvedValue(20); // full
      prismaMock.enrolment.update.mockResolvedValue({
        id: 'enrol-1',
        batchId: 'batch-new',
        status: EnrolmentStatus.WAITLIST,
      });

      const res = await service.transferBatch('enrol-1', {
        destinationBatchId: 'batch-new',
      });

      expect(res.transferred).toBe(true);
      expect(prismaMock.enrolment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { batchId: 'batch-new', status: EnrolmentStatus.WAITLIST },
        }),
      );
    });

    it('rejects transfer if destination batch belongs to a different program', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        programId: 'prog-1',
        batchId: 'batch-old',
        status: EnrolmentStatus.ACTIVE,
      });
      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'batch-new',
        programId: 'prog-different',
      });

      await expect(
        service.transferBatch('enrol-1', { destinationBatchId: 'batch-new' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects transfer of a REVOKED enrolment', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        programId: 'prog-1',
        status: EnrolmentStatus.REVOKED,
      });

      await expect(
        service.transferBatch('enrol-1', { destinationBatchId: 'batch-new' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. CANCELLATION / REVOCATION
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Cancellation / Revocation', () => {
    it('cancels enrolment and marks status REVOKED', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        status: EnrolmentStatus.ACTIVE,
      });
      prismaMock.enrolment.update.mockResolvedValue({
        id: 'enrol-1',
        status: EnrolmentStatus.REVOKED,
      });

      const res = await service.cancel('enrol-1');

      expect(res.revoked).toBe(true);
      expect(res.status).toBe(EnrolmentStatus.REVOKED);
    });

    it('rejects revocation of a COMPLETED enrolment', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        status: EnrolmentStatus.COMPLETED,
      });

      await expect(service.cancel('enrol-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. MANAGER SCOPING & AUTHORIZATION
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Manager Batch Scoping', () => {
    it('scopes manager list queries strictly to assigned batches', async () => {
      prismaMock.batch.findMany.mockResolvedValue([{ id: 'batch-mgr-1' }]);
      prismaMock.enrolment.count.mockResolvedValue(1);
      prismaMock.enrolment.findMany.mockResolvedValue([{ id: 'enrol-mgr-1' }]);

      const res = await service.findAll({ sub: 'mgr-1', role: Role.MANAGER });

      expect(res.data).toHaveLength(1);
      expect(prismaMock.batch.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { managerId: 'mgr-1' },
            { trainers: { some: { trainerId: 'mgr-1' } } },
          ],
        },
        select: { id: true },
      });
    });

    it('rejects manager querying a specific batch they are not assigned to', async () => {
      prismaMock.batch.findMany.mockResolvedValue([{ id: 'batch-mgr-1' }]);

      await expect(
        service.findAll(
          { sub: 'mgr-1', role: Role.MANAGER },
          { batchId: 'batch-unassigned' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows manager viewing detail for an enrollment in their assigned batch', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        batch: {
          managerId: 'mgr-1',
          trainers: [],
        },
      });

      const res = await service.findOne('enrol-1', {
        sub: 'mgr-1',
        role: Role.MANAGER,
      });

      expect(res.id).toBe('enrol-1');
    });

    it('rejects manager viewing detail for an enrollment in an unassigned batch', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        batch: {
          managerId: 'other-mgr',
          trainers: [{ trainerId: 'other-tr' }],
        },
      });

      await expect(
        service.findOne('enrol-1', {
          sub: 'mgr-1',
          role: Role.MANAGER,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. LEARNER SELF-SERVICE
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Learner Self-Service Queries', () => {
    it('retrieves only own enrollments for authenticated learner', async () => {
      prismaMock.enrolment.findMany.mockResolvedValue([{ id: 'enrol-me-1' }]);

      const res = await service.findForLearner('learner-1');

      expect(res).toHaveLength(1);
      expect(prismaMock.enrolment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'learner-1' },
        }),
      );
    });

    it('retrieves specific enrollment for learner when owned', async () => {
      prismaMock.enrolment.findFirst.mockResolvedValue({
        id: 'enrol-1',
        userId: 'learner-1',
      });

      const res = await service.findOneForLearner('enrol-1', 'learner-1');

      expect(res.id).toBe('enrol-1');
    });

    it('throws NotFoundException when learner tries to access an enrollment belonging to another learner', async () => {
      prismaMock.enrolment.findFirst.mockResolvedValue(null);

      await expect(
        service.findOneForLearner('enrol-foreign', 'learner-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
