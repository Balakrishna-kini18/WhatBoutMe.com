import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UsersService } from '../src/modules/users/users.service.js';
import { OralAssessmentsService } from '../src/modules/oral-assessments/oral-assessments.service.js';
import { BatchesService } from '../src/modules/batches/batches.service.js';
import { Role, EnrolmentStatus } from '@prisma/client';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

describe('Revoke Access Workflow & Authorization Tests', () => {
  let usersService: UsersService;
  let oralAssessmentsService: OralAssessmentsService;
  let batchesService: BatchesService;
  let prismaMock: any;
  let cacheHelperMock: any;

  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock = {
      user: {
        findUnique: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        delete: vi.fn(),
      },
      enrolment: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      userSession: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      batch: {
        findUnique: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      batchTrainer: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      oralAssessment: {
        create: vi.fn(),
      },
      logAction: vi.fn().mockResolvedValue({ id: 'log-1' }),
    };

    cacheHelperMock = {
      getEndpointKey: vi.fn().mockImplementation((ns, role, params) => `${ns}:${role}:${JSON.stringify(params)}`),
      getVersionedKey: vi.fn().mockImplementation((ns, suffix) => `${ns}:${suffix}`),
      getOrSet: vi.fn().mockImplementation(async (_key, fetcher) => fetcher()),
      invalidateNamespace: vi.fn().mockResolvedValue(undefined),
    };

    usersService = new UsersService(prismaMock, cacheHelperMock);
    oralAssessmentsService = new OralAssessmentsService(prismaMock);
    batchesService = new BatchesService(prismaMock, cacheHelperMock);
  });

  // 1. Revoking one enrolment preserves the learner account
  it('1. Revoking one enrolment marks it REVOKED and never deletes user account', async () => {
    const user = {
      id: 'learner-1',
      name: 'Jane Doe',
      email: 'jane@example.com',
      role: Role.USER,
      enrolments: [
        { id: 'enr-1', status: EnrolmentStatus.ACTIVE, batch: { id: 'b-1', name: 'Cohort A' }, program: { id: 'p-1', title: 'Brain Health' } },
      ],
    };
    prismaMock.user.findUnique.mockResolvedValue(user);
    prismaMock.enrolment.update.mockResolvedValue({ id: 'enr-1', status: EnrolmentStatus.REVOKED });
    prismaMock.userSession.updateMany.mockResolvedValue({ count: 1 });

    const result = await usersService.revokeAccess('learner-1', { enrolmentId: 'enr-1', reason: 'Refund requested' }, { sub: 'admin-1', role: Role.ADMIN });

    expect(result.success).toBe(true);
    expect(result.revokedEnrolmentsCount).toBe(1);
    expect(prismaMock.enrolment.update).toHaveBeenCalledWith({
      where: { id: 'enr-1' },
      data: { status: EnrolmentStatus.REVOKED },
    });
    // Critical: prisma.user.delete must NEVER be called
    expect(prismaMock.user.delete).not.toHaveBeenCalled();
    // Audit log must record the event
    expect(prismaMock.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'LEARNER_ACCESS_REVOKED',
        entity: 'Enrolment',
        entityId: 'enr-1',
      })
    );
  });

  // 2. Revoking one of multiple enrolments leaves other enrolments active
  it('2. Revoking one of multiple enrolments leaves other enrolments active and does NOT terminate login sessions', async () => {
    const user = {
      id: 'learner-multi',
      name: 'Bob Multi',
      email: 'bob@example.com',
      role: Role.USER,
      enrolments: [
        { id: 'enr-1', status: EnrolmentStatus.ACTIVE, batch: { id: 'b-1', name: 'Cohort 1' }, program: { id: 'p-1', title: 'Course 1' } },
        { id: 'enr-2', status: EnrolmentStatus.ACTIVE, batch: { id: 'b-2', name: 'Cohort 2' }, program: { id: 'p-2', title: 'Course 2' } },
      ],
    };
    prismaMock.user.findUnique.mockResolvedValue(user);
    prismaMock.enrolment.update.mockResolvedValue({ id: 'enr-1', status: EnrolmentStatus.REVOKED });

    const result = await usersService.revokeAccess('learner-multi', { enrolmentId: 'enr-1' }, { sub: 'admin-1', role: Role.ADMIN });

    expect(result.success).toBe(true);
    expect(result.remainingActiveEnrolmentsCount).toBe(1);
    // Login sessions must NOT be revoked when learner has another active course
    expect(prismaMock.userSession.updateMany).not.toHaveBeenCalled();
    // Only target enrolment was updated
    expect(prismaMock.enrolment.update).toHaveBeenCalledWith({
      where: { id: 'enr-1' },
      data: { status: EnrolmentStatus.REVOKED },
    });
    expect(prismaMock.enrolment.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'enr-2' } })
    );
  });

  // 3. Multi-enrolment requires explicit selection of enrolment
  it('3. Throws BadRequestException when learner has multiple active enrolments and enrolmentId is omitted', async () => {
    const user = {
      id: 'learner-multi',
      email: 'bob@example.com',
      role: Role.USER,
      enrolments: [
        { id: 'enr-1', status: EnrolmentStatus.ACTIVE },
        { id: 'enr-2', status: EnrolmentStatus.ACTIVE },
      ],
    };
    prismaMock.user.findUnique.mockResolvedValue(user);

    await expect(
      usersService.revokeAccess('learner-multi', {}, { sub: 'admin-1', role: Role.ADMIN })
    ).rejects.toThrow(BadRequestException);
  });

  // 4. Learner with 0 active enrolments throws BadRequestException
  it('4. Throws BadRequestException if learner has no active enrolments to revoke', async () => {
    const user = {
      id: 'learner-none',
      email: 'none@example.com',
      role: Role.USER,
      enrolments: [
        { id: 'enr-old', status: EnrolmentStatus.REVOKED },
      ],
    };
    prismaMock.user.findUnique.mockResolvedValue(user);

    await expect(
      usersService.revokeAccess('learner-none', {}, { sub: 'admin-1', role: Role.ADMIN })
    ).rejects.toThrow(BadRequestException);
  });

  // 5. Revoking an already revoked enrolment throws BadRequestException
  it('5. Throws BadRequestException when targeting an already-revoked enrolment', async () => {
    const user = {
      id: 'learner-1',
      email: 'jane@example.com',
      role: Role.USER,
      enrolments: [
        { id: 'enr-1', status: EnrolmentStatus.ACTIVE },
        { id: 'enr-2', status: EnrolmentStatus.REVOKED },
      ],
    };
    prismaMock.user.findUnique.mockResolvedValue(user);

    await expect(
      usersService.revokeAccess('learner-1', { enrolmentId: 'enr-2' }, { sub: 'admin-1', role: Role.ADMIN })
    ).rejects.toThrow(BadRequestException);
  });

  // 6. Managers cannot revoke learners outside their assigned cohort
  it('6. Forbids MANAGER from revoking access for a learner in an unassigned cohort', async () => {
    const user = {
      id: 'learner-1',
      email: 'jane@example.com',
      role: Role.USER,
      enrolments: [
        { id: 'enr-1', status: EnrolmentStatus.ACTIVE, batch: { id: 'b-foreign', managerId: 'mgr-other' }, program: { id: 'p-1' } },
      ],
    };
    prismaMock.user.findUnique.mockResolvedValue(user);
    prismaMock.batchTrainer.findFirst.mockResolvedValue(null);

    await expect(
      usersService.revokeAccess('learner-1', { enrolmentId: 'enr-1' }, { sub: 'mgr-my-id', role: Role.MANAGER })
    ).rejects.toThrow(ForbiddenException);
  });

  // 7. Managers can revoke learners in their assigned cohort
  it('7. Allows MANAGER to revoke access for a learner in their assigned cohort', async () => {
    const user = {
      id: 'learner-1',
      email: 'jane@example.com',
      role: Role.USER,
      enrolments: [
        { id: 'enr-1', status: EnrolmentStatus.ACTIVE, batch: { id: 'b-my', managerId: 'mgr-my-id' }, program: { id: 'p-1', title: 'Neuroscience' } },
      ],
    };
    prismaMock.user.findUnique.mockResolvedValue(user);
    prismaMock.enrolment.update.mockResolvedValue({ id: 'enr-1', status: EnrolmentStatus.REVOKED });

    const result = await usersService.revokeAccess('learner-1', { enrolmentId: 'enr-1' }, { sub: 'mgr-my-id', role: Role.MANAGER });
    expect(result.success).toBe(true);
    expect(prismaMock.enrolment.update).toHaveBeenCalledWith({
      where: { id: 'enr-1' },
      data: { status: EnrolmentStatus.REVOKED },
    });
  });

  // 8. Revoked enrolment blocks oral assessments
  it('8. Oral assessments reject scheduling for non-active or revoked enrolments', async () => {
    prismaMock.enrolment.findUnique.mockResolvedValue({
      id: 'enr-revoked',
      programId: 'prog-1',
      status: EnrolmentStatus.REVOKED,
      batchId: 'b-1',
    });

    await expect(
      oralAssessmentsService.create(
        { enrolmentId: 'enr-revoked', programId: 'prog-1' } as any,
        { id: 'admin-1', role: Role.ADMIN }
      )
    ).rejects.toThrow(ForbiddenException);
  });

  // 9. Revoked enrolment is excluded from batch active roster in findOne
  it('9. BatchesService findOne excludes REVOKED enrolments from roster', async () => {
    prismaMock.batch.findUnique.mockResolvedValue({
      id: 'b-1',
      name: 'Spring 2026',
      managerId: 'mgr-1',
      enrolments: [
        { id: 'enr-active', status: EnrolmentStatus.ACTIVE, user: { id: 'u-1', name: 'Active User' } },
      ],
      _count: { enrolments: 1 },
    });

    const batch = await batchesService.findOne('b-1', { sub: 'mgr-1', role: Role.MANAGER });
    expect(batch.enrolments).toHaveLength(1);
    expect(batch.enrolledCount).toBe(1);
    // Verifies findUnique query requested status: { not: REVOKED }
    expect(prismaMock.batch.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          enrolments: expect.objectContaining({
            where: { status: { not: EnrolmentStatus.REVOKED } },
          }),
        }),
      })
    );
  });

  // 10. Manager findAll filters out revoked enrolments
  it('10. UsersService findAll for manager strictly filters for non-revoked enrolments', async () => {
    await usersService.findAll({ page: 1, limit: 10, role: Role.USER, reqUser: { sub: 'mgr-1', role: Role.MANAGER } });

    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          enrolments: {
            some: {
              status: { not: EnrolmentStatus.REVOKED },
              batch: {
                OR: [
                  { managerId: 'mgr-1' },
                  { trainers: { some: { trainerId: 'mgr-1' } } },
                ],
              },
            },
          },
        }),
      })
    );
  });
});
