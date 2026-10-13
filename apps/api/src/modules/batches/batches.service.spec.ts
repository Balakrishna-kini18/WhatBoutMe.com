import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BatchStatus, Role } from '@prisma/client';
import { BatchesService } from './batches.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CacheHelperService } from '../../common/cache/cache-helper.service.js';

describe('D1-031: BatchesService - Cohort Management & Lifecycle Engine', () => {
  let service: BatchesService;
  let prismaMock: any;
  let cacheHelperMock: any;

  beforeEach(() => {
    prismaMock = {
      batch: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      program: {
        findUnique: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      batchTrainer: {
        upsert: vi.fn(),
        findUnique: vi.fn(),
        delete: vi.fn(),
        create: vi.fn(),
      },
      enrolment: {
        count: vi.fn().mockResolvedValue(0),
      },
      session: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
      },
      outboxEvent: {
        create: vi.fn().mockResolvedValue({}),
      },
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

    service = new BatchesService(
      prismaMock as unknown as PrismaService,
      cacheHelperMock as unknown as CacheHelperService,
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. CREATION & VALIDATION
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Batch Creation & Entity Validation', () => {
    it('creates batch in UPCOMING status with capacity and initial trainers', async () => {
      prismaMock.program.findUnique.mockResolvedValue({ id: 'prog-1', title: '11 Steps to U' });
      prismaMock.user.findUnique.mockResolvedValue({ id: 'mgr-1', name: 'Manager Roweena', role: Role.MANAGER });
      prismaMock.user.findMany.mockResolvedValue([
        { id: 'tr-1', name: 'Trainer John', role: Role.MANAGER },
      ]);

      const mockBatch = {
        id: 'batch-1',
        name: 'Cohort Alpha 2026',
        programId: 'prog-1',
        managerId: 'mgr-1',
        startDate: new Date('2026-11-01'),
        endDate: null,
        capacity: 25,
        status: BatchStatus.UPCOMING,
        program: { id: 'prog-1', title: '11 Steps to U', slug: '11-steps' },
        manager: { id: 'mgr-1', name: 'Manager Roweena', email: 'mgr@test.com', role: Role.MANAGER },
        trainers: [{ trainer: { id: 'tr-1', name: 'Trainer John', email: 'tr@test.com', role: Role.MANAGER } }],
        _count: { enrolments: 0 },
      };

      prismaMock.batch.create.mockResolvedValue(mockBatch);
      prismaMock.batch.findUnique.mockResolvedValue(mockBatch);

      const result = await service.create({
        name: 'Cohort Alpha 2026',
        programId: 'prog-1',
        startDate: '2026-11-01T09:00:00.000Z',
        capacity: 25,
        managerId: 'mgr-1',
        trainerIds: ['tr-1'],
      });

      expect(result.id).toBe('batch-1');
      expect(result.status).toBe(BatchStatus.UPCOMING);
      expect(result.capacity).toBe(25);
      expect(result.enrolledCount).toBe(0);
      expect(result.remainingCapacity).toBe(25);
      expect(result.isFull).toBe(false);
      expect(cacheHelperMock.invalidateNamespace).toHaveBeenCalledWith('batches');
    });

    it('rejects batch creation when program does not exist', async () => {
      prismaMock.program.findUnique.mockResolvedValue(null);

      await expect(
        service.create({
          name: 'Invalid Program Batch',
          programId: 'non-existent',
          startDate: '2026-11-01T09:00:00.000Z',
          capacity: 30,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects batch creation when capacity is less than 1', async () => {
      prismaMock.program.findUnique.mockResolvedValue({ id: 'prog-1' });

      await expect(
        service.create({
          name: 'Zero Capacity Batch',
          programId: 'prog-1',
          startDate: '2026-11-01T09:00:00.000Z',
          capacity: 0,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects batch creation when assigned manager is a learner (Role.USER)', async () => {
      prismaMock.program.findUnique.mockResolvedValue({ id: 'prog-1' });
      prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1', role: Role.USER });

      await expect(
        service.create({
          name: 'Learner Manager Batch',
          programId: 'prog-1',
          startDate: '2026-11-01T09:00:00.000Z',
          capacity: 30,
          managerId: 'user-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects batch creation when initial trainer has Role.USER', async () => {
      prismaMock.program.findUnique.mockResolvedValue({ id: 'prog-1' });
      prismaMock.user.findMany.mockResolvedValue([{ id: 'user-2', name: 'Learner Trainer', role: Role.USER }]);

      await expect(
        service.create({
          name: 'Invalid Trainer Batch',
          programId: 'prog-1',
          startDate: '2026-11-01T09:00:00.000Z',
          capacity: 30,
          trainerIds: ['user-2'],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. RETRIEVAL & MANAGER/TRAINER SCOPING
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Retrieval, Capacity & Scoping', () => {
    it('scopes findAll for MANAGER to batches where managerId or trainerId matches', async () => {
      const managerUser = { role: Role.MANAGER, sub: 'mgr-1' };
      prismaMock.batch.findMany.mockResolvedValue([]);

      await service.findAll(managerUser, { status: BatchStatus.ACTIVE });

      expect(prismaMock.batch.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { managerId: 'mgr-1' },
            { trainers: { some: { trainerId: 'mgr-1' } } },
          ],
          status: BatchStatus.ACTIVE,
        },
        include: expect.any(Object),
        orderBy: { startDate: 'desc' },
      });
    });

    it('allows ADMIN to retrieve all batches without scoping', async () => {
      const adminUser = { role: Role.ADMIN, sub: 'admin-1' };
      prismaMock.batch.findMany.mockResolvedValue([]);

      await service.findAll(adminUser);

      expect(prismaMock.batch.findMany).toHaveBeenCalledWith({
        where: { status: { not: 'ARCHIVED' } },
        include: expect.any(Object),
        orderBy: { startDate: 'desc' },
      });
    });

    it('calculates capacity metrics correctly (remainingCapacity, isFull)', async () => {
      const batchWithEnrolments = {
        id: 'b-full',
        name: 'Full Batch',
        capacity: 10,
        status: BatchStatus.ACTIVE,
        _count: { enrolments: 10 },
      };
      prismaMock.batch.findUnique.mockResolvedValue(batchWithEnrolments);

      const result = await service.findOne('b-full', { role: Role.ADMIN });

      expect(result.enrolledCount).toBe(10);
      expect(result.remainingCapacity).toBe(0);
      expect(result.isFull).toBe(true);
    });

    it('findOne denies manager access when manager is not assigned to the batch', async () => {
      const unassignedBatch = {
        id: 'b-other',
        managerId: 'other-mgr',
        trainers: [{ trainerId: 'other-trainer' }],
      };
      prismaMock.batch.findUnique.mockResolvedValue(unassignedBatch);

      await expect(
        service.findOne('b-other', { role: Role.MANAGER, sub: 'unassigned-mgr' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. UPDATES & CAPACITY GUARDS
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Batch Updates & Capacity Invariants', () => {
    it('prevents reducing capacity below currently enrolled students count', async () => {
      prismaMock.batch.findUnique.mockResolvedValue({ id: 'b-1', capacity: 30 });
      prismaMock.enrolment.count.mockResolvedValue(22); // 22 enrolled

      // Attempt to reduce capacity to 20
      await expect(
        service.update('b-1', { capacity: 20 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows expanding capacity above current enrollment count', async () => {
      prismaMock.batch.findUnique.mockResolvedValue({ id: 'b-1', capacity: 30 });
      prismaMock.enrolment.count.mockResolvedValue(22);
      prismaMock.batch.update.mockResolvedValue({
        id: 'b-1',
        capacity: 40,
        _count: { enrolments: 22 },
      });

      const updated = await service.update('b-1', { capacity: 40 });
      expect(updated.capacity).toBe(40);
      expect(updated.remainingCapacity).toBe(18);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. LIFECYCLE TRANSITIONS
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Lifecycle State Machine Transitions', () => {
    it('transitions UPCOMING -> ACTIVE successfully', async () => {
      prismaMock.batch.findUnique.mockResolvedValue({ id: 'b-1', status: BatchStatus.UPCOMING });
      prismaMock.batch.update.mockResolvedValue({
        id: 'b-1',
        status: BatchStatus.ACTIVE,
        _count: { enrolments: 0 },
      });

      const result = await service.transitionStatus('b-1', { status: BatchStatus.ACTIVE });
      expect(result.status).toBe(BatchStatus.ACTIVE);
    });

    it('transitions ACTIVE -> COMPLETED and sets endDate', async () => {
      prismaMock.batch.findUnique.mockResolvedValue({
        id: 'b-1',
        status: BatchStatus.ACTIVE,
        endDate: null,
      });
      prismaMock.batch.update.mockImplementation(({ data }: any) =>
        Promise.resolve({
          id: 'b-1',
          status: data.status,
          endDate: data.endDate,
          _count: { enrolments: 5 },
        }),
      );

      const result = await service.transitionStatus('b-1', { status: BatchStatus.COMPLETED });
      expect(result.status).toBe(BatchStatus.COMPLETED);
      expect(result.endDate).toBeInstanceOf(Date);
    });

    it('rejects invalid jump from UPCOMING directly to COMPLETED', async () => {
      prismaMock.batch.findUnique.mockResolvedValue({ id: 'b-1', status: BatchStatus.UPCOMING });

      await expect(
        service.transitionStatus('b-1', { status: BatchStatus.COMPLETED }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects transition from terminal ARCHIVED state', async () => {
      prismaMock.batch.findUnique.mockResolvedValue({ id: 'b-1', status: BatchStatus.ARCHIVED });

      await expect(
        service.transitionStatus('b-1', { status: BatchStatus.ACTIVE }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. TRAINER ASSIGNMENT & REMOVAL
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Trainer Assignment Engine', () => {
    it('assigns trainer idempotently using upsert', async () => {
      prismaMock.batch.findUnique.mockResolvedValue({ id: 'b-1' });
      prismaMock.user.findUnique.mockResolvedValue({ id: 'tr-1', role: Role.MANAGER });
      prismaMock.batchTrainer.upsert.mockResolvedValue({
        batchId: 'b-1',
        trainerId: 'tr-1',
        trainer: { id: 'tr-1', name: 'Trainer Bob', role: Role.MANAGER },
      });

      const result = await service.assignTrainer('b-1', { trainerId: 'tr-1' });

      expect(result.assigned).toBe(true);
      expect(prismaMock.batchTrainer.upsert).toHaveBeenCalledWith({
        where: { batchId_trainerId: { batchId: 'b-1', trainerId: 'tr-1' } },
        create: { batchId: 'b-1', trainerId: 'tr-1' },
        update: {},
        include: expect.any(Object),
      });
    });

    it('rejects assigning user with Role.USER as cohort trainer', async () => {
      prismaMock.batch.findUnique.mockResolvedValue({ id: 'b-1' });
      prismaMock.user.findUnique.mockResolvedValue({ id: 'learner-1', role: Role.USER });

      await expect(
        service.assignTrainer('b-1', { trainerId: 'learner-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('removes trainer assignment safely', async () => {
      prismaMock.batch.findUnique.mockResolvedValue({ id: 'b-1' });
      prismaMock.batchTrainer.findUnique.mockResolvedValue({ batchId: 'b-1', trainerId: 'tr-1' });
      prismaMock.batchTrainer.delete.mockResolvedValue({ batchId: 'b-1', trainerId: 'tr-1' });

      const result = await service.removeTrainer('b-1', 'tr-1');

      expect(result.removed).toBe(true);
      expect(prismaMock.batchTrainer.delete).toHaveBeenCalledWith({
        where: { batchId_trainerId: { batchId: 'b-1', trainerId: 'tr-1' } },
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. ARCHIVE VS HARD DELETE
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Safe Deletion & Archival Guard', () => {
    it('hard deletes batch and cascades when enrolments or sessions exist', async () => {
      prismaMock.batch.findUnique.mockResolvedValue({ id: 'b-active', status: BatchStatus.ACTIVE });
      prismaMock.enrolment.count.mockResolvedValue(10); // 10 learners
      prismaMock.session.count.mockResolvedValue(2); // 2 sessions
      prismaMock.session.findMany.mockResolvedValue([]);
      prismaMock.batch.delete.mockResolvedValue({ id: 'b-active' });

      const result = await service.remove('b-active');

      expect(prismaMock.batch.delete).toHaveBeenCalledWith({ where: { id: 'b-active' } });
      expect(result.deleted).toBe(true);
    });

    it('hard deletes batch when zero enrolments and zero sessions exist', async () => {
      prismaMock.batch.findUnique.mockResolvedValue({ id: 'b-clean' });
      prismaMock.enrolment.count.mockResolvedValue(0);
      prismaMock.session.count.mockResolvedValue(0);
      prismaMock.batch.delete.mockResolvedValue({ id: 'b-clean' });

      const result = await service.remove('b-clean');

      expect(result.deleted).toBe(true);
      expect(prismaMock.batch.delete).toHaveBeenCalledWith({ where: { id: 'b-clean' } });
    });
  });
});
