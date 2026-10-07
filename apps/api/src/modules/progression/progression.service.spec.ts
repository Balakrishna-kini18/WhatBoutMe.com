import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AttemptStatus,
  ContentStatus,
  ContentType,
  EnrolmentStatus,
  ReleaseSchedule,
  Role,
  StepOverrideState,
} from '@prisma/client';
import { ProgressionService } from './progression.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('D1-033: ProgressionService - Hybrid Sequential & Cohort Schedule Engine', () => {
  let service: ProgressionService;
  let prismaMock: any;
  let mockStepProgressStore: any[] = [];

  const mockBatch = {
    id: 'batch-1',
    name: 'Oct 2026 Cohort',
    startDate: new Date('2026-10-01T00:00:00.000Z'),
    managerId: 'mgr-1',
    trainers: [{ trainerId: 'tr-1' }],
    overrides: [],
  };

  const mockProgram = {
    id: 'prog-1',
    title: '11 Steps to U',
    slug: '11-steps-to-u',
    status: ContentStatus.PUBLISHED,
  };

  const createMockStep = (
    id: string,
    sequence: number,
    schedule: ReleaseSchedule = ReleaseSchedule.IMMEDIATE,
    delayDays: number | null = null,
    hasQuiz = true,
    lessonCount = 2,
  ) => ({
    id,
    programId: 'prog-1',
    sequence,
    title: `Step ${sequence}`,
    status: ContentStatus.PUBLISHED,
    releaseSchedule: schedule,
    unlockDelayDays: delayDays,
    lessons: Array.from({ length: lessonCount }, (_, i) => ({
      id: `lesson-${id}-${i + 1}`,
      order: i + 1,
      title: `Lesson ${i + 1}`,
      type: ContentType.VIDEO,
      durationSec: 300,
      status: ContentStatus.PUBLISHED,
    })),
    quiz: hasQuiz
      ? {
          id: `quiz-${id}`,
          passMark: 75,
          questionCount: 10,
        }
      : null,
  });

  beforeEach(() => {
    mockStepProgressStore = [];
    prismaMock = {
      enrolment: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
      },
      step: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      lesson: {
        findUnique: vi.fn(),
      },
      userLessonProgress: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockImplementation(({ create, update }: any) =>
          Promise.resolve({ ...create, ...update, id: 'ulp-1' }),
        ),
      },
      attempt: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      stepProgress: {
        findUnique: vi.fn().mockImplementation(({ where }: any) => {
          const stepId = where?.enrolmentId_stepId?.stepId ?? where?.id;
          return Promise.resolve(
            mockStepProgressStore.find((p) => p.stepId === stepId) ?? null,
          );
        }),
        findMany: vi.fn().mockImplementation(() => Promise.resolve([...mockStepProgressStore])),
        upsert: vi.fn().mockImplementation(({ where, create, update }: any) => {
          const stepId = where?.enrolmentId_stepId?.stepId;
          const existingIdx = mockStepProgressStore.findIndex(
            (p) => p.stepId === stepId,
          );
          const item = {
            id: 'sp-1',
            enrolmentId: where?.enrolmentId_stepId?.enrolmentId,
            stepId,
            ...(existingIdx >= 0
              ? { ...mockStepProgressStore[existingIdx], ...update }
              : create),
          };
          if (existingIdx >= 0) {
            mockStepProgressStore[existingIdx] = item;
          } else {
            mockStepProgressStore.push(item);
          }
          return Promise.resolve(item);
        }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => {
        if (typeof callback === 'function') {
          return callback(prismaMock);
        }
        return Promise.all(callback);
      }),
    };

    service = new ProgressionService(prismaMock as unknown as PrismaService);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. ENROLMENT STATUS GATING
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Enrolment Status Gating', () => {
    it.each([
      EnrolmentStatus.PENDING_PAYMENT,
      EnrolmentStatus.PENDING_AGREEMENT,
      EnrolmentStatus.WAITLIST,
      EnrolmentStatus.REVOKED,
    ])('locks all steps with ENROLMENT_NOT_ACTIVE when status is %s', async (status) => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        programId: 'prog-1',
        batchId: 'batch-1',
        status,
        program: mockProgram,
        batch: mockBatch,
      });

      prismaMock.step.findMany.mockResolvedValue([
        createMockStep('s1', 1),
        createMockStep('s2', 2),
      ]);

      const res = await service.getEnrolmentProgression('enrol-1', null, {
        persist: false,
      });

      expect(res.steps).toHaveLength(2);
      expect(res.steps[0].isUnlocked).toBe(false);
      expect(res.steps[0].lockReason).toBe('ENROLMENT_NOT_ACTIVE');
      expect(res.steps[1].isUnlocked).toBe(false);
      expect(res.steps[1].lockReason).toBe('ENROLMENT_NOT_ACTIVE');
    });

    it('unlocks and completes all steps for historical review when status is COMPLETED', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-comp',
        programId: 'prog-1',
        batchId: 'batch-1',
        status: EnrolmentStatus.COMPLETED,
        program: mockProgram,
        batch: mockBatch,
      });

      prismaMock.step.findMany.mockResolvedValue([
        createMockStep('s1', 1),
        createMockStep('s2', 2),
      ]);

      const res = await service.getEnrolmentProgression('enrol-comp', null, {
        persist: false,
      });

      expect(res.steps[0].isUnlocked).toBe(true);
      expect(res.steps[0].lockReason).toBeNull();
      expect(res.steps[1].isUnlocked).toBe(true);
      expect(res.steps[1].lockReason).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. STEP 1 PROGRESSION & RELEASE SCHEDULE
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Step 1 Release Schedule Evaluation', () => {
    it('unlocks Step 1 immediately when releaseSchedule is IMMEDIATE', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-active',
        programId: 'prog-1',
        batchId: 'batch-1',
        status: EnrolmentStatus.ACTIVE,
        program: mockProgram,
        batch: mockBatch,
      });

      prismaMock.step.findMany.mockResolvedValue([
        createMockStep('s1', 1, ReleaseSchedule.IMMEDIATE),
      ]);

      const res = await service.getEnrolmentProgression('enrol-active', null, {
        persist: false,
      });

      expect(res.steps[0].isUnlocked).toBe(true);
      expect(res.steps[0].lockReason).toBeNull();
    });

    it('locks Step 1 with SCHEDULED_DATE_NOT_REACHED when batch scheduled date is in the future', async () => {
      const futureBatch = {
        ...mockBatch,
        startDate: new Date(Date.now() + 7 * 86400000), // 7 days in future
      };

      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-future',
        programId: 'prog-1',
        batchId: 'batch-1',
        status: EnrolmentStatus.ACTIVE,
        program: mockProgram,
        batch: futureBatch,
      });

      prismaMock.step.findMany.mockResolvedValue([
        createMockStep('s1', 1, ReleaseSchedule.BATCH_SCHEDULED, 0),
      ]);

      const res = await service.getEnrolmentProgression('enrol-future', null, {
        persist: false,
      });

      expect(res.steps[0].isUnlocked).toBe(false);
      expect(res.steps[0].lockReason).toBe('SCHEDULED_DATE_NOT_REACHED');
      expect(res.steps[0].scheduledUnlockDate).toEqual(futureBatch.startDate);
    });

    it('unlocks Step 1 when batch scheduled date with delay has already passed', async () => {
      const pastBatch = {
        ...mockBatch,
        startDate: new Date(Date.now() - 14 * 86400000), // 14 days ago
      };

      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-past',
        programId: 'prog-1',
        batchId: 'batch-1',
        status: EnrolmentStatus.ACTIVE,
        program: mockProgram,
        batch: pastBatch,
      });

      prismaMock.step.findMany.mockResolvedValue([
        createMockStep('s1', 1, ReleaseSchedule.BATCH_SCHEDULED, 3), // delayed by 3 days => 11 days ago
      ]);

      const res = await service.getEnrolmentProgression('enrol-past', null, {
        persist: false,
      });

      expect(res.steps[0].isUnlocked).toBe(true);
      expect(res.steps[0].lockReason).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. STEP N SEQUENTIAL PROGRESSION
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Step N Sequential Progression & Prerequisites', () => {
    it('keeps Step 2 locked with PREVIOUS_STEP_INCOMPLETE when Step 1 lessons are incomplete', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        programId: 'prog-1',
        batchId: 'batch-1',
        status: EnrolmentStatus.ACTIVE,
        program: mockProgram,
        batch: mockBatch,
      });

      const s1 = createMockStep('s1', 1); // 2 lessons
      const s2 = createMockStep('s2', 2);
      prismaMock.step.findMany.mockResolvedValue([s1, s2]);

      // Only 1 of 2 lessons completed
      prismaMock.userLessonProgress.findMany.mockResolvedValue([
        { lessonId: 'lesson-s1-1', viewed: true },
      ]);

      const res = await service.getEnrolmentProgression('enrol-1', null, {
        persist: false,
      });

      expect(res.steps[0].isUnlocked).toBe(true);
      expect(res.steps[0].isCompleted).toBe(false);
      expect(res.steps[1].isUnlocked).toBe(false);
      expect(res.steps[1].lockReason).toBe('PREVIOUS_STEP_INCOMPLETE');
    });

    it('keeps Step 2 locked with QUIZ_NOT_PASSED when Step 1 lessons are complete but quiz is not passed', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        programId: 'prog-1',
        batchId: 'batch-1',
        status: EnrolmentStatus.ACTIVE,
        program: mockProgram,
        batch: mockBatch,
      });

      const s1 = createMockStep('s1', 1);
      const s2 = createMockStep('s2', 2);
      prismaMock.step.findMany.mockResolvedValue([s1, s2]);

      // All lessons complete
      prismaMock.userLessonProgress.findMany.mockResolvedValue([
        { lessonId: 'lesson-s1-1', viewed: true },
        { lessonId: 'lesson-s1-2', viewed: true },
      ]);

      // Quiz attempted but FAILED
      prismaMock.attempt.findMany.mockResolvedValue([
        {
          quizId: 'quiz-s1',
          status: AttemptStatus.FAILED,
          passed: false,
          score: 60,
        },
      ]);

      const res = await service.getEnrolmentProgression('enrol-1', null, {
        persist: false,
      });

      expect(res.steps[0].isCompleted).toBe(false);
      expect(res.steps[1].isUnlocked).toBe(false);
      expect(res.steps[1].lockReason).toBe('QUIZ_NOT_PASSED');
      expect(res.steps[0].quiz?.isPassed).toBe(false);
      expect(res.steps[0].quiz?.bestScore).toBe(60);
    });

    it('unlocks Step 2 when Step 1 lessons are complete and Step 1 quiz is passed', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        programId: 'prog-1',
        batchId: 'batch-1',
        status: EnrolmentStatus.ACTIVE,
        program: mockProgram,
        batch: mockBatch,
      });

      const s1 = createMockStep('s1', 1);
      const s2 = createMockStep('s2', 2);
      prismaMock.step.findMany.mockResolvedValue([s1, s2]);

      prismaMock.userLessonProgress.findMany.mockResolvedValue([
        { lessonId: 'lesson-s1-1', viewed: true },
        { lessonId: 'lesson-s1-2', viewed: true },
      ]);

      prismaMock.attempt.findMany.mockResolvedValue([
        {
          quizId: 'quiz-s1',
          status: AttemptStatus.PASSED,
          passed: true,
          score: 90,
        },
      ]);

      const res = await service.getEnrolmentProgression('enrol-1', null, {
        persist: false,
      });

      expect(res.steps[0].isCompleted).toBe(true);
      expect(res.steps[1].isUnlocked).toBe(true);
      expect(res.steps[1].lockReason).toBeNull();
    });

    it('completes step and unlocks next step when step has no quiz and all lessons are complete', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        programId: 'prog-1',
        batchId: 'batch-1',
        status: EnrolmentStatus.ACTIVE,
        program: mockProgram,
        batch: mockBatch,
      });

      // s1 has no quiz
      const s1 = createMockStep('s1', 1, ReleaseSchedule.IMMEDIATE, null, false);
      const s2 = createMockStep('s2', 2);
      prismaMock.step.findMany.mockResolvedValue([s1, s2]);

      prismaMock.userLessonProgress.findMany.mockResolvedValue([
        { lessonId: 'lesson-s1-1', viewed: true },
        { lessonId: 'lesson-s1-2', viewed: true },
      ]);

      const res = await service.getEnrolmentProgression('enrol-1', null, {
        persist: false,
      });

      expect(res.steps[0].isCompleted).toBe(true);
      expect(res.steps[0].quiz).toBeNull();
      expect(res.steps[1].isUnlocked).toBe(true);
    });

    it('keeps Step 2 locked with SCHEDULED_DATE_NOT_REACHED when Step 1 is complete but Step 2 batch release date is in future', async () => {
      const batchWithRecentStart = {
        ...mockBatch,
        startDate: new Date(Date.now() - 2 * 86400000), // 2 days ago
      };

      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        programId: 'prog-1',
        batchId: 'batch-1',
        status: EnrolmentStatus.ACTIVE,
        program: mockProgram,
        batch: batchWithRecentStart,
      });

      const s1 = createMockStep('s1', 1);
      // Step 2 unlocks 7 days after batch start => 5 days in future
      const s2 = createMockStep('s2', 2, ReleaseSchedule.BATCH_SCHEDULED, 7);
      prismaMock.step.findMany.mockResolvedValue([s1, s2]);

      prismaMock.userLessonProgress.findMany.mockResolvedValue([
        { lessonId: 'lesson-s1-1', viewed: true },
        { lessonId: 'lesson-s1-2', viewed: true },
      ]);
      prismaMock.attempt.findMany.mockResolvedValue([
        { quizId: 'quiz-s1', status: AttemptStatus.PASSED, passed: true },
      ]);

      const res = await service.getEnrolmentProgression('enrol-1', null, {
        persist: false,
      });

      expect(res.steps[0].isCompleted).toBe(true);
      expect(res.steps[1].isUnlocked).toBe(false);
      expect(res.steps[1].lockReason).toBe('SCHEDULED_DATE_NOT_REACHED');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. BATCH STEP OVERRIDES
  // ─────────────────────────────────────────────────────────────────────────────
  describe('BatchStepOverride Semantics', () => {
    it('BatchStepOverride.isUnlocked === true forces step unlock regardless of cohort schedule date', async () => {
      const batchWithOverride = {
        ...mockBatch,
        startDate: new Date(Date.now() + 10 * 86400000), // in future
        overrides: [
          {
            batchId: 'batch-1',
            stepId: 's1',
            isUnlocked: true,
            unlockDate: null,
          },
        ],
      };

      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        programId: 'prog-1',
        batchId: 'batch-1',
        status: EnrolmentStatus.ACTIVE,
        program: mockProgram,
        batch: batchWithOverride,
      });

      const s1 = createMockStep('s1', 1, ReleaseSchedule.BATCH_SCHEDULED, 14);
      prismaMock.step.findMany.mockResolvedValue([s1]);

      const res = await service.getEnrolmentProgression('enrol-1', null, {
        persist: false,
      });

      expect(res.steps[0].isUnlocked).toBe(true);
      expect(res.steps[0].lockReason).toBeNull();
    });

    it('BatchStepOverride.unlockDate overrides default scheduled date', async () => {
      const pastOverrideDate = new Date(Date.now() - 86400000); // 1 day ago
      const batchWithOverride = {
        ...mockBatch,
        startDate: new Date(Date.now() + 10 * 86400000), // future
        overrides: [
          {
            batchId: 'batch-1',
            stepId: 's1',
            isUnlocked: false,
            unlockDate: pastOverrideDate,
          },
        ],
      };

      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        programId: 'prog-1',
        batchId: 'batch-1',
        status: EnrolmentStatus.ACTIVE,
        program: mockProgram,
        batch: batchWithOverride,
      });

      const s1 = createMockStep('s1', 1, ReleaseSchedule.BATCH_SCHEDULED, 14);
      prismaMock.step.findMany.mockResolvedValue([s1]);

      const res = await service.getEnrolmentProgression('enrol-1', null, {
        persist: false,
      });

      expect(res.steps[0].scheduledUnlockDate).toEqual(pastOverrideDate);
      expect(res.steps[0].isUnlocked).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. CONTENT STUDIO DRAFT ISOLATION
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Content Studio Draft & Publish Isolation', () => {
    it('completely excludes DRAFT steps from learner progression', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        programId: 'prog-1',
        batchId: 'batch-1',
        status: EnrolmentStatus.ACTIVE,
        program: mockProgram,
        batch: mockBatch,
      });

      // DB query specifies where: { status: ContentStatus.PUBLISHED }
      prismaMock.step.findMany.mockResolvedValue([
        createMockStep('s1', 1),
        createMockStep('s3', 3), // step 2 was DRAFT and not returned by findMany
      ]);

      const res = await service.getEnrolmentProgression('enrol-1', null, {
        persist: false,
      });

      expect(res.steps).toHaveLength(2);
      expect(res.steps.map((s) => s.sequence)).toEqual([1, 3]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. CONTENT ACCESS GATE (assertStepUnlocked)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Content Access Gate: assertStepUnlocked', () => {
    it('returns true when step is unlocked for active learner', async () => {
      prismaMock.step.findUnique.mockResolvedValue({
        id: 's1',
        programId: 'prog-1',
        status: ContentStatus.PUBLISHED,
      });

      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        userId: 'learner-1',
        programId: 'prog-1',
        batchId: 'batch-1',
        status: EnrolmentStatus.ACTIVE,
        program: mockProgram,
        batch: mockBatch,
      });

      prismaMock.step.findMany.mockResolvedValue([createMockStep('s1', 1)]);

      const allowed = await service.assertStepUnlocked('enrol-1', 's1', {
        role: Role.USER,
        sub: 'learner-1',
      });

      expect(allowed).toBe(true);
    });

    it('throws ForbiddenException when step is locked', async () => {
      prismaMock.step.findUnique.mockResolvedValue({
        id: 's2',
        programId: 'prog-1',
        status: ContentStatus.PUBLISHED,
      });

      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        userId: 'learner-1',
        programId: 'prog-1',
        batchId: 'batch-1',
        status: EnrolmentStatus.ACTIVE,
        program: mockProgram,
        batch: mockBatch,
      });

      // s1 not completed, so s2 is locked
      prismaMock.step.findMany.mockResolvedValue([
        createMockStep('s1', 1),
        createMockStep('s2', 2),
      ]);

      await expect(
        service.assertStepUnlocked('enrol-1', 's2', {
          role: Role.USER,
          sub: 'learner-1',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when learner attempts direct access to a DRAFT step', async () => {
      prismaMock.step.findUnique.mockResolvedValue({
        id: 's-draft',
        programId: 'prog-1',
        status: ContentStatus.DRAFT,
      });

      await expect(
        service.assertStepUnlocked('enrol-1', 's-draft', {
          role: Role.USER,
          sub: 'learner-1',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when learner tries to access an enrollment they do not own', async () => {
      prismaMock.step.findUnique.mockResolvedValue({
        id: 's1',
        programId: 'prog-1',
        status: ContentStatus.PUBLISHED,
      });

      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        userId: 'learner-owner',
        programId: 'prog-1',
        batchId: 'batch-1',
        status: EnrolmentStatus.ACTIVE,
        program: mockProgram,
        batch: mockBatch,
      });

      await expect(
        service.assertStepUnlocked('enrol-1', 's1', {
          role: Role.USER,
          sub: 'attacker-learner',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException if step belongs to a different program', async () => {
      prismaMock.step.findUnique.mockResolvedValue({
        id: 's-foreign',
        programId: 'prog-other',
        status: ContentStatus.PUBLISHED,
      });

      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        userId: 'learner-1',
        programId: 'prog-1',
        batchId: 'batch-1',
        status: EnrolmentStatus.ACTIVE,
        program: mockProgram,
        batch: mockBatch,
      });

      await expect(
        service.assertStepUnlocked('enrol-1', 's-foreign', {
          role: Role.USER,
          sub: 'learner-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. PROGRESSION METRICS CALCULATION
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Progression Metrics Calculation', () => {
    it('correctly calculates overall progress percentage across lessons and quizzes', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        programId: 'prog-1',
        batchId: 'batch-1',
        status: EnrolmentStatus.ACTIVE,
        program: mockProgram,
        batch: mockBatch,
      });

      // Step 1: 2 lessons + 1 quiz = 3 items
      // Step 2: 2 lessons + 1 quiz = 3 items
      // Total items = 6
      const s1 = createMockStep('s1', 1);
      const s2 = createMockStep('s2', 2);
      prismaMock.step.findMany.mockResolvedValue([s1, s2]);

      // Complete 2 lessons of s1 and pass quiz of s1 => 3 completed items
      // 3 / 6 = 50%
      prismaMock.userLessonProgress.findMany.mockResolvedValue([
        { lessonId: 'lesson-s1-1', viewed: true },
        { lessonId: 'lesson-s1-2', viewed: true },
      ]);
      prismaMock.attempt.findMany.mockResolvedValue([
        { quizId: 'quiz-s1', status: AttemptStatus.PASSED, passed: true },
      ]);

      const res = await service.getEnrolmentProgression('enrol-1', null, {
        persist: false,
      });

      expect(res.overallProgressPercent).toBe(50);
      expect(res.currentStepSequence).toBe(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. BATCH TRANSFER INTEGRATION
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Batch Transfer Integration', () => {
    it('applies new batch schedule after transfer while preserving historical completions', async () => {
      // Learner was transferred in D1-032 to a new batch starting tomorrow
      const newBatch = {
        ...mockBatch,
        id: 'batch-new',
        startDate: new Date(Date.now() + 86400000), // starts tomorrow
      };

      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-transferred',
        programId: 'prog-1',
        batchId: 'batch-new',
        status: EnrolmentStatus.ACTIVE,
        program: mockProgram,
        batch: newBatch,
      });

      const s1 = createMockStep('s1', 1);
      const s2 = createMockStep('s2', 2, ReleaseSchedule.BATCH_SCHEDULED, 3);
      prismaMock.step.findMany.mockResolvedValue([s1, s2]);

      // Historical s1 completion is preserved
      prismaMock.userLessonProgress.findMany.mockResolvedValue([
        { lessonId: 'lesson-s1-1', viewed: true },
        { lessonId: 'lesson-s1-2', viewed: true },
      ]);
      prismaMock.attempt.findMany.mockResolvedValue([
        { quizId: 'quiz-s1', status: AttemptStatus.PASSED, passed: true },
      ]);

      const res = await service.getEnrolmentProgression(
        'enrol-transferred',
        null,
        { persist: false },
      );

      // s1 is still completed
      expect(res.steps[0].isCompleted).toBe(true);
      // s2 evaluates against newBatch.startDate + 3 days => future
      expect(res.steps[1].isUnlocked).toBe(false);
      expect(res.steps[1].lockReason).toBe('SCHEDULED_DATE_NOT_REACHED');
      expect(res.steps[1].scheduledUnlockDate).toEqual(
        new Date(newBatch.startDate.getTime() + 3 * 86400000),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. D1-034: ADMINISTRATIVE MANUAL STEP OVERRIDES
  // ─────────────────────────────────────────────────────────────────────────────
  describe('D1-034: Manual Step Override Engine', () => {
    const adminUser = { sub: 'admin-1', id: 'admin-1', role: Role.ADMIN };
    const superAdminUser = { sub: 'super-1', id: 'super-1', role: Role.SUPER_ADMIN };
    const assignedManager = { sub: 'mgr-1', id: 'mgr-1', role: Role.MANAGER };
    const trainerManager = { sub: 'tr-1', id: 'tr-1', role: Role.MANAGER };
    const unassignedManager = { sub: 'other-mgr', id: 'other-mgr', role: Role.MANAGER };
    const learnerUser = { sub: 'learner-1', id: 'learner-1', role: Role.USER };

    const mockEnrolmentWithBatch = {
      id: 'enrol-1',
      userId: 'learner-1',
      programId: 'prog-1',
      batchId: 'batch-1',
      status: EnrolmentStatus.ACTIVE,
      program: mockProgram,
      batch: mockBatch,
    };

    const s1 = createMockStep('s1', 1);
    const s2 = createMockStep('s2', 2, ReleaseSchedule.BATCH_SCHEDULED, 7);

    beforeEach(() => {
      prismaMock.enrolment.findUnique.mockResolvedValue(mockEnrolmentWithBatch);
      prismaMock.step.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === 's1') return Promise.resolve(s1);
        if (where.id === 's2') return Promise.resolve(s2);
        return Promise.resolve(null);
      });
      prismaMock.step.findMany.mockResolvedValue([s1, s2]);
    });

    describe('manualUnlockStep', () => {
      it('successfully unlocks step, records audit log, and sets MANUAL_UNLOCKED override state', async () => {
        const res = await service.manualUnlockStep(
          'enrol-1',
          's2',
          adminUser,
          'Learner granted special fast-track permission',
          '127.0.0.1',
        );

        expect(res.overrideState).toBe(StepOverrideState.MANUAL_UNLOCKED);
        expect(res.isUnlocked).toBe(true);
        expect(res.overrideReason).toBe('Learner granted special fast-track permission');
        expect(res.overriddenById).toBe('admin-1');

        // Audit log created with full metadata
        expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            actorId: 'admin-1',
            action: 'STEP_MANUAL_UNLOCKED',
            entity: 'StepProgress',
            ip: '127.0.0.1',
            meta: expect.objectContaining({
              enrolmentId: 'enrol-1',
              stepId: 's2',
              newOverrideState: StepOverrideState.MANUAL_UNLOCKED,
              newIsUnlocked: true,
              reason: 'Learner granted special fast-track permission',
            }),
          }),
        });
      });

      it('bypasses incomplete previous-step prerequisites and future schedule dates', async () => {
        // Step 1 is NOT completed (no viewed lessons, no passed quizzes)
        prismaMock.userLessonProgress.findMany.mockResolvedValue([]);
        prismaMock.attempt.findMany.mockResolvedValue([]);

        // Existing StepProgress for s2 has MANUAL_UNLOCKED
        prismaMock.stepProgress.findMany.mockResolvedValue([
          {
            stepId: 's2',
            overrideState: StepOverrideState.MANUAL_UNLOCKED,
            isUnlocked: true,
            isCompleted: false,
          },
        ]);

        const res = await service.getEnrolmentProgression('enrol-1', null, { persist: false });

        // s1 is immediate => unlocked
        expect(res.steps[0].isUnlocked).toBe(true);
        expect(res.steps[0].isCompleted).toBe(false);

        // s2 is MANUAL_UNLOCKED => unlocked even though s1 incomplete and release date in future
        expect(res.steps[1].isUnlocked).toBe(true);
        expect(res.steps[1].lockReason).toBeNull();
        expect(res.steps[1].overrideState).toBe(StepOverrideState.MANUAL_UNLOCKED);
      });

      it('does NOT mark lessons viewed, quizzes passed, or step completed', async () => {
        prismaMock.stepProgress.findMany.mockResolvedValue([
          {
            stepId: 's2',
            overrideState: StepOverrideState.MANUAL_UNLOCKED,
            isUnlocked: true,
            isCompleted: false,
          },
        ]);

        const res = await service.getEnrolmentProgression('enrol-1', null, { persist: false });

        expect(res.steps[1].isUnlocked).toBe(true);
        expect(res.steps[1].isCompleted).toBe(false);
        expect(res.steps[1].lessons.every((l) => !l.isCompleted)).toBe(true);
        expect(res.steps[1].quiz?.isPassed).toBe(false);
      });
    });

    describe('manualRelockStep', () => {
      it('successfully re-locks step, records audit log, and sets MANUAL_LOCKED state', async () => {
        const res = await service.manualRelockStep(
          'enrol-1',
          's1',
          adminUser,
          'Learner paused pending live session review',
          '192.168.1.5',
        );

        expect(res.overrideState).toBe(StepOverrideState.MANUAL_LOCKED);
        expect(res.isUnlocked).toBe(false);
        expect(res.lockReason).toBe('MANUAL_LOCKED');

        expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            actorId: 'admin-1',
            action: 'STEP_MANUAL_LOCKED',
            entity: 'StepProgress',
            ip: '192.168.1.5',
            meta: expect.objectContaining({
              newOverrideState: StepOverrideState.MANUAL_LOCKED,
              newIsUnlocked: false,
            }),
          }),
        });
      });

      it('strictly overrides satisfied prerequisites and immediate release schedule', async () => {
        // Step 1 is in MANUAL_LOCKED override
        prismaMock.stepProgress.findMany.mockResolvedValue([
          {
            stepId: 's1',
            overrideState: StepOverrideState.MANUAL_LOCKED,
            isUnlocked: false,
            isCompleted: false,
          },
        ]);

        const res = await service.getEnrolmentProgression('enrol-1', null, { persist: false });

        expect(res.steps[0].isUnlocked).toBe(false);
        expect(res.steps[0].lockReason).toBe('MANUAL_LOCKED');
      });

      it('strictly overrides BatchStepOverride.isUnlocked = true', async () => {
        const batchWithUnlockedOverride = {
          ...mockBatch,
          overrides: [{ batchId: 'batch-1', stepId: 's1', isUnlocked: true, unlockDate: null }],
        };
        prismaMock.enrolment.findUnique.mockResolvedValue({
          ...mockEnrolmentWithBatch,
          batch: batchWithUnlockedOverride,
        });

        // Learner has individual MANUAL_LOCKED on s1
        prismaMock.stepProgress.findMany.mockResolvedValue([
          {
            stepId: 's1',
            overrideState: StepOverrideState.MANUAL_LOCKED,
            isUnlocked: false,
            isCompleted: false,
          },
        ]);

        const res = await service.getEnrolmentProgression('enrol-1', null, { persist: false });

        // Individual learner override takes precedence over batch override
        expect(res.steps[0].isUnlocked).toBe(false);
        expect(res.steps[0].lockReason).toBe('MANUAL_LOCKED');
      });

      it('does NOT erase existing academic progress (isCompleted remains true)', async () => {
        prismaMock.userLessonProgress.findMany.mockResolvedValue([
          { lessonId: 'lesson-s1-1', viewed: true },
          { lessonId: 'lesson-s1-2', viewed: true },
        ]);
        prismaMock.attempt.findMany.mockResolvedValue([
          { quizId: 'quiz-s1', status: AttemptStatus.PASSED, passed: true },
        ]);
        prismaMock.stepProgress.findMany.mockResolvedValue([
          {
            stepId: 's1',
            overrideState: StepOverrideState.MANUAL_LOCKED,
            isUnlocked: false,
            isCompleted: true,
          },
        ]);

        const res = await service.getEnrolmentProgression('enrol-1', null, { persist: false });

        // Content access is locked, but completion state remains intact
        expect(res.steps[0].isUnlocked).toBe(false);
        expect(res.steps[0].lockReason).toBe('MANUAL_LOCKED');
        expect(res.steps[0].isCompleted).toBe(true);
      });
    });

    describe('resetStepOverride', () => {
      it('restores AUTOMATIC progression evaluation and re-locks when prerequisites are incomplete', async () => {
        prismaMock.userLessonProgress.findMany.mockResolvedValue([]);
        prismaMock.attempt.findMany.mockResolvedValue([]);

        const res = await service.resetStepOverride(
          'enrol-1',
          's2',
          adminUser,
          'Reverting temporary fast-track unlock',
        );

        expect(res.overrideState).toBe(StepOverrideState.AUTOMATIC);
        expect(res.isUnlocked).toBe(false);
        expect(res.lockReason).toBe('PREVIOUS_STEP_INCOMPLETE');

        expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            actorId: 'admin-1',
            action: 'STEP_OVERRIDE_RESET',
            meta: expect.objectContaining({
              newOverrideState: StepOverrideState.AUTOMATIC,
            }),
          }),
        });
      });

      it('restores AUTOMATIC progression and unlocks when prerequisites are satisfied', async () => {
        const res = await service.resetStepOverride(
          'enrol-1',
          's1',
          adminUser,
          'Reverting manual lock to resume standard progression',
        );

        expect(res.overrideState).toBe(StepOverrideState.AUTOMATIC);
        // Step 1 has immediate release and no previous step => automatically unlocked
        expect(res.isUnlocked).toBe(true);
        expect(res.lockReason).toBeNull();
      });
    });

    describe('Authorization & Scoping', () => {
      it('allows SUPER_ADMIN across any batch', async () => {
        const res = await service.manualUnlockStep(
          'enrol-1',
          's1',
          superAdminUser,
          'Super admin override granted',
        );
        expect(res.isUnlocked).toBe(true);
      });

      it('allows MANAGER assigned as batch.managerId', async () => {
        const res = await service.manualUnlockStep(
          'enrol-1',
          's1',
          assignedManager,
          'Batch manager unlock granted',
        );
        expect(res.isUnlocked).toBe(true);
      });

      it('allows MANAGER assigned in BatchTrainer', async () => {
        const res = await service.manualUnlockStep(
          'enrol-1',
          's1',
          trainerManager,
          'Batch trainer unlock granted',
        );
        expect(res.isUnlocked).toBe(true);
      });

      it('throws ForbiddenException when MANAGER is not assigned to the batch', async () => {
        await expect(
          service.manualUnlockStep(
            'enrol-1',
            's1',
            unassignedManager,
            'Attempted unassigned manager override',
          ),
        ).rejects.toThrow(ForbiddenException);
      });

      it('throws ForbiddenException when USER attempts manual override', async () => {
        await expect(
          service.manualUnlockStep(
            'enrol-1',
            's1',
            learnerUser,
            'Learner self-unlock attempt',
          ),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    describe('Validation & Error Handling', () => {
      it('throws NotFoundException when enrolment does not exist', async () => {
        prismaMock.enrolment.findUnique.mockResolvedValue(null);

        await expect(
          service.manualUnlockStep('nonexistent', 's1', adminUser, 'Valid reason here'),
        ).rejects.toThrow(NotFoundException);
      });

      it('throws BadRequestException when enrolment is not ACTIVE', async () => {
        prismaMock.enrolment.findUnique.mockResolvedValue({
          ...mockEnrolmentWithBatch,
          status: EnrolmentStatus.PENDING_PAYMENT,
        });

        await expect(
          service.manualUnlockStep('enrol-1', 's1', adminUser, 'Valid reason here'),
        ).rejects.toThrow(BadRequestException);
      });

      it('throws NotFoundException when step does not exist', async () => {
        prismaMock.step.findUnique.mockResolvedValue(null);

        await expect(
          service.manualUnlockStep('enrol-1', 'unknown-step', adminUser, 'Valid reason here'),
        ).rejects.toThrow(NotFoundException);
      });

      it('throws BadRequestException when step belongs to another program', async () => {
        prismaMock.step.findUnique.mockResolvedValue({
          ...s1,
          programId: 'other-program',
        });

        await expect(
          service.manualUnlockStep('enrol-1', 's1', adminUser, 'Valid reason here'),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects blank or whitespace-only reason', async () => {
        await expect(
          service.manualUnlockStep('enrol-1', 's1', adminUser, '     '),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects reason shorter than 5 characters', async () => {
        await expect(
          service.manualUnlockStep('enrol-1', 's1', adminUser, 'abc'),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects reason longer than 500 characters', async () => {
        const longReason = 'a'.repeat(501);
        await expect(
          service.manualUnlockStep('enrol-1', 's1', adminUser, longReason),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('assertStepUnlocked integration', () => {
      it('throws ForbiddenException with MANUAL_LOCKED reason when step is manually locked', async () => {
        prismaMock.stepProgress.findMany.mockResolvedValue([
          {
            stepId: 's1',
            overrideState: StepOverrideState.MANUAL_LOCKED,
            isUnlocked: false,
            isCompleted: false,
          },
        ]);

        await expect(
          service.assertStepUnlocked('enrol-1', 's1', adminUser),
        ).rejects.toThrow('Step is locked: MANUAL_LOCKED');
      });

      it('allows step access when step is MANUAL_UNLOCKED even if prerequisites are missing', async () => {
        prismaMock.stepProgress.findMany.mockResolvedValue([
          {
            stepId: 's2',
            overrideState: StepOverrideState.MANUAL_UNLOCKED,
            isUnlocked: true,
            isCompleted: false,
          },
        ]);

        await expect(
          service.assertStepUnlocked('enrol-1', 's2', adminUser),
        ).resolves.toBe(true);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. D1-035: LESSON PROGRESSION TRACKING TESTS
  // ─────────────────────────────────────────────────────────────────────────────
  describe('D1-035: Lesson Progress Tracking Engine', () => {
    const learnerUser = { id: 'u1', sub: 'u1', role: Role.USER };
    const otherLearner = { id: 'u2', sub: 'u2', role: Role.USER };
    const managerUser = { id: 'mgr-1', sub: 'mgr-1', role: Role.MANAGER };
    const unassignedManager = { id: 'mgr-other', sub: 'mgr-other', role: Role.MANAGER };

    const mockActiveEnrolment = {
      id: 'enrol-1',
      userId: 'u1',
      programId: 'prog-1',
      batchId: 'batch-1',
      status: EnrolmentStatus.ACTIVE,
      batch: mockBatch,
      program: mockProgram,
    };

    const mockVideoLesson = {
      id: 'lesson-video-1',
      stepId: 's1',
      title: 'Intro Video',
      type: ContentType.VIDEO,
      mediaUrl: 'https://s3.example.com/video1.mp4',
      durationSec: 300,
      order: 1,
      status: ContentStatus.PUBLISHED,
      step: {
        id: 's1',
        programId: 'prog-1',
        sequence: 1,
        status: ContentStatus.PUBLISHED,
      },
    };

    const mockAudioLesson = {
      id: 'lesson-audio-1',
      stepId: 's1',
      title: 'Podcast Lesson',
      type: ContentType.AUDIO,
      mediaUrl: 'https://s3.example.com/audio1.mp3',
      durationSec: 200,
      order: 2,
      status: ContentStatus.PUBLISHED,
      step: {
        id: 's1',
        programId: 'prog-1',
        sequence: 1,
        status: ContentStatus.PUBLISHED,
      },
    };

    const mockPdfLesson = {
      id: 'lesson-pdf-1',
      stepId: 's1',
      title: 'Reading Guide',
      type: ContentType.PDF,
      mediaUrl: 'https://s3.example.com/guide.pdf',
      durationSec: null,
      order: 3,
      status: ContentStatus.PUBLISHED,
      step: {
        id: 's1',
        programId: 'prog-1',
        sequence: 1,
        status: ContentStatus.PUBLISHED,
      },
    };

    const mockTextLesson = {
      id: 'lesson-text-1',
      stepId: 's1',
      title: 'Written Reflection',
      type: ContentType.TEXT,
      mediaUrl: '',
      content: 'Reflect on your leadership journey.',
      durationSec: null,
      order: 4,
      status: ContentStatus.PUBLISHED,
      step: {
        id: 's1',
        programId: 'prog-1',
        sequence: 1,
        status: ContentStatus.PUBLISHED,
      },
    };

    beforeEach(() => {
      // Step 1 published, immediate release
      prismaMock.step.findUnique.mockImplementation(({ where }: any) => {
        if (where?.id === 's1') {
          return Promise.resolve({
            id: 's1',
            programId: 'prog-1',
            sequence: 1,
            title: 'Step 1',
            status: ContentStatus.PUBLISHED,
          });
        }
        if (where?.id === 's2') {
          return Promise.resolve({
            id: 's2',
            programId: 'prog-1',
            sequence: 2,
            title: 'Step 2',
            status: ContentStatus.PUBLISHED,
          });
        }
        return Promise.resolve(null);
      });

      prismaMock.step.findMany.mockResolvedValue([
        createMockStep('s1', 1, ReleaseSchedule.IMMEDIATE),
        createMockStep('s2', 2, ReleaseSchedule.IMMEDIATE),
      ]);

      prismaMock.enrolment.findFirst.mockImplementation(({ where }: any) => {
        if (where?.userId === 'u1' && where?.programId === 'prog-1') {
          return Promise.resolve(mockActiveEnrolment);
        }
        return Promise.resolve(null);
      });

      prismaMock.enrolment.findUnique.mockImplementation(({ where }: any) => {
        if (where?.id === 'enrol-1') {
          return Promise.resolve(mockActiveEnrolment);
        }
        return Promise.resolve(null);
      });

      prismaMock.stepProgress.findMany.mockResolvedValue([]);
      prismaMock.userLessonProgress.findMany.mockResolvedValue([]);
      prismaMock.attempt.findMany.mockResolvedValue([]);
    });

    describe('Video and Audio Heartbeat Tracking (POST /progress/lessons/:lessonId/heartbeat)', () => {
      it('calculates 50% watch progress and stores viewed=false for video halfway watched', async () => {
        prismaMock.lesson.findUnique.mockResolvedValue(mockVideoLesson);
        prismaMock.userLessonProgress.findUnique.mockResolvedValue(null);

        const res = await service.recordMediaProgress('lesson-video-1', learnerUser, 150);

        expect(res.lessonId).toBe('lesson-video-1');
        expect(res.enrolmentId).toBe('enrol-1');
        expect(res.progressPercent).toBe(50.0);
        expect(res.lastPositionSec).toBe(150);
        expect(res.viewed).toBe(false);
        expect(res.completedAt).toBeNull();

        expect(prismaMock.userLessonProgress.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              enrolmentId_lessonId: {
                enrolmentId: 'enrol-1',
                lessonId: 'lesson-video-1',
              },
            },
            create: expect.objectContaining({
              viewed: false,
              progressPercent: 50.0,
              lastPositionSec: 150,
              completedAt: null,
            }),
          }),
        );
      });

      it('awards completion (viewed=true) and sets completedAt when video reaches 90% threshold', async () => {
        prismaMock.lesson.findUnique.mockResolvedValue(mockVideoLesson);
        prismaMock.userLessonProgress.findUnique.mockResolvedValue(null);

        const res = await service.recordMediaProgress('lesson-video-1', learnerUser, 270);

        expect(res.progressPercent).toBe(90.0);
        expect(res.viewed).toBe(true);
        expect(res.completedAt).toBeInstanceOf(Date);
      });

      it('awards completion for audio when reaching 90% threshold', async () => {
        prismaMock.lesson.findUnique.mockResolvedValue(mockAudioLesson);
        prismaMock.userLessonProgress.findUnique.mockResolvedValue(null);

        // 180s / 200s = 90%
        const res = await service.recordMediaProgress('lesson-audio-1', learnerUser, 180);

        expect(res.progressPercent).toBe(90.0);
        expect(res.viewed).toBe(true);
        expect(res.completedAt).toBeInstanceOf(Date);
      });

      it('safely handles missing duration: saves lastPositionSec for resume, does not award completion', async () => {
        const lessonNoDuration = { ...mockVideoLesson, durationSec: null };
        prismaMock.lesson.findUnique.mockResolvedValue(lessonNoDuration);
        prismaMock.userLessonProgress.findUnique.mockResolvedValue(null);

        const res = await service.recordMediaProgress('lesson-video-1', learnerUser, 60);

        expect(res.lastPositionSec).toBe(60);
        expect(res.progressPercent).toBe(0);
        expect(res.viewed).toBe(false);
        expect(res.completedAt).toBeNull();
      });

      it('safely handles zero duration: saves lastPositionSec, does not award completion', async () => {
        const lessonZeroDuration = { ...mockVideoLesson, durationSec: 0 };
        prismaMock.lesson.findUnique.mockResolvedValue(lessonZeroDuration);
        prismaMock.userLessonProgress.findUnique.mockResolvedValue(null);

        const res = await service.recordMediaProgress('lesson-video-1', learnerUser, 45);

        expect(res.lastPositionSec).toBe(45);
        expect(res.progressPercent).toBe(0);
        expect(res.viewed).toBe(false);
      });

      it('clamps impossible position beyond lesson duration to durationSec', async () => {
        prismaMock.lesson.findUnique.mockResolvedValue(mockVideoLesson);
        prismaMock.userLessonProgress.findUnique.mockResolvedValue(null);

        // Client reports 9999s on 300s video
        const res = await service.recordMediaProgress('lesson-video-1', learnerUser, 9999);

        expect(res.lastPositionSec).toBe(300);
        expect(res.progressPercent).toBe(100.0);
        expect(res.viewed).toBe(true);
      });

      it('enforces monotonic progress percent during rewinds while updating lastPositionSec', async () => {
        prismaMock.lesson.findUnique.mockResolvedValue(mockVideoLesson);
        // Learner already watched to 210s (70%)
        prismaMock.userLessonProgress.findUnique.mockResolvedValue({
          id: 'ulp-1',
          enrolmentId: 'enrol-1',
          lessonId: 'lesson-video-1',
          progressPercent: 70.0,
          lastPositionSec: 210,
          viewed: false,
          completedAt: null,
        });

        // Learner rewinds to 60s (20%)
        const res = await service.recordMediaProgress('lesson-video-1', learnerUser, 60);

        // progressPercent must remain 70.0 (monotonic)
        expect(res.progressPercent).toBe(70.0);
        // lastPositionSec allows resume from rewind position
        expect(res.lastPositionSec).toBe(60);
        expect(res.viewed).toBe(false);
      });

      it('ignores delayed out-of-order heartbeat with lower percentage', async () => {
        prismaMock.lesson.findUnique.mockResolvedValue(mockVideoLesson);
        // Stored progress is 95%
        prismaMock.userLessonProgress.findUnique.mockResolvedValue({
          id: 'ulp-1',
          enrolmentId: 'enrol-1',
          lessonId: 'lesson-video-1',
          progressPercent: 95.0,
          lastPositionSec: 285,
          viewed: true,
          completedAt: new Date('2026-10-06T10:00:00Z'),
        });

        // Delayed heartbeat with 30s arrives
        const res = await service.recordMediaProgress('lesson-video-1', learnerUser, 30);

        expect(res.progressPercent).toBe(95.0);
        expect(res.viewed).toBe(true);
      });

      it('preserves completion permanence and does not alter completedAt on subsequent heartbeats', async () => {
        const firstCompletedAt = new Date('2026-10-05T12:00:00Z');
        prismaMock.lesson.findUnique.mockResolvedValue(mockVideoLesson);
        prismaMock.userLessonProgress.findUnique.mockResolvedValue({
          id: 'ulp-1',
          enrolmentId: 'enrol-1',
          lessonId: 'lesson-video-1',
          progressPercent: 100.0,
          lastPositionSec: 300,
          viewed: true,
          completedAt: firstCompletedAt,
        });

        // Subsequent heartbeat at 0s
        const res = await service.recordMediaProgress('lesson-video-1', learnerUser, 0);

        expect(res.viewed).toBe(true);
        expect(res.completedAt).toEqual(firstCompletedAt);
      });

      it('does NOT create AuditLog entries on ordinary learner playback heartbeats', async () => {
        prismaMock.lesson.findUnique.mockResolvedValue(mockVideoLesson);
        prismaMock.userLessonProgress.findUnique.mockResolvedValue(null);

        await service.recordMediaProgress('lesson-video-1', learnerUser, 150);

        expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
      });

      it('rejects invalid positionSec (negative, NaN, non-number)', async () => {
        await expect(
          service.recordMediaProgress('lesson-video-1', learnerUser, -10),
        ).rejects.toThrow(BadRequestException);

        await expect(
          service.recordMediaProgress('lesson-video-1', learnerUser, NaN),
        ).rejects.toThrow(BadRequestException);

        await expect(
          service.recordMediaProgress('lesson-video-1', learnerUser, Infinity),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('PDF and Text Completion (POST /progress/lessons/:lessonId/complete)', () => {
      it('marks PDF lesson as completed (viewed=true, progressPercent=100)', async () => {
        prismaMock.lesson.findUnique.mockResolvedValue(mockPdfLesson);
        prismaMock.userLessonProgress.findUnique.mockResolvedValue(null);

        const res = await service.completeDocumentOrTextLesson('lesson-pdf-1', learnerUser);

        expect(res.lessonId).toBe('lesson-pdf-1');
        expect(res.viewed).toBe(true);
        expect(res.progressPercent).toBe(100.0);
        expect(res.completedAt).toBeInstanceOf(Date);
      });

      it('marks TEXT reading confirmation lesson as completed', async () => {
        prismaMock.lesson.findUnique.mockResolvedValue(mockTextLesson);
        prismaMock.userLessonProgress.findUnique.mockResolvedValue(null);

        const res = await service.completeDocumentOrTextLesson('lesson-text-1', learnerUser);

        expect(res.lessonId).toBe('lesson-text-1');
        expect(res.viewed).toBe(true);
        expect(res.progressPercent).toBe(100.0);
      });

      it('rejects VIDEO lesson completion via /complete endpoint', async () => {
        prismaMock.lesson.findUnique.mockResolvedValue(mockVideoLesson);

        await expect(
          service.completeDocumentOrTextLesson('lesson-video-1', learnerUser),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects AUDIO lesson completion via /complete endpoint', async () => {
        prismaMock.lesson.findUnique.mockResolvedValue(mockAudioLesson);

        await expect(
          service.completeDocumentOrTextLesson('lesson-audio-1', learnerUser),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects PDF/TEXT heartbeat via /heartbeat endpoint', async () => {
        prismaMock.lesson.findUnique.mockResolvedValue(mockPdfLesson);

        await expect(
          service.recordMediaProgress('lesson-pdf-1', learnerUser, 50),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('Step Access Gating & Manual Override Integration', () => {
      it('blocks lesson progress if parent step is locked by prerequisites', async () => {
        // Lesson belongs to Step 2
        const step2Lesson = {
          ...mockVideoLesson,
          stepId: 's2',
          step: {
            id: 's2',
            programId: 'prog-1',
            sequence: 2,
            status: ContentStatus.PUBLISHED,
          },
        };
        prismaMock.lesson.findUnique.mockResolvedValue(step2Lesson);

        // Step 1 is not completed, so Step 2 is locked
        prismaMock.stepProgress.findMany.mockResolvedValue([]);
        prismaMock.userLessonProgress.findMany.mockResolvedValue([]);

        await expect(
          service.recordMediaProgress('lesson-video-1', learnerUser, 100),
        ).rejects.toThrow('Step is locked: PREVIOUS_STEP_INCOMPLETE');
      });

      it('blocks lesson progress if parent step is MANUAL_LOCKED', async () => {
        prismaMock.lesson.findUnique.mockResolvedValue(mockVideoLesson);

        // Step 1 is manually locked
        prismaMock.stepProgress.findMany.mockResolvedValue([
          {
            stepId: 's1',
            overrideState: StepOverrideState.MANUAL_LOCKED,
            isUnlocked: false,
            isCompleted: false,
          },
        ]);

        await expect(
          service.recordMediaProgress('lesson-video-1', learnerUser, 100),
        ).rejects.toThrow('Step is locked: MANUAL_LOCKED');
      });

      it('allows lesson progress when step is MANUAL_UNLOCKED even if prerequisites are missing', async () => {
        const step2Lesson = {
          ...mockVideoLesson,
          stepId: 's2',
          step: {
            id: 's2',
            programId: 'prog-1',
            sequence: 2,
            status: ContentStatus.PUBLISHED,
          },
        };
        prismaMock.lesson.findUnique.mockResolvedValue(step2Lesson);
        prismaMock.userLessonProgress.findUnique.mockResolvedValue(null);

        // Step 2 is MANUAL_UNLOCKED
        prismaMock.stepProgress.findMany.mockResolvedValue([
          {
            stepId: 's2',
            overrideState: StepOverrideState.MANUAL_UNLOCKED,
            isUnlocked: true,
            isCompleted: false,
          },
        ]);

        const res = await service.recordMediaProgress('lesson-video-1', learnerUser, 150);
        expect(res.progressPercent).toBe(50.0);
      });
    });

    describe('Security, IDOR & Multi-tenancy Bounds', () => {
      it('blocks progress for inactive enrolment (e.g. PENDING_PAYMENT)', async () => {
        prismaMock.lesson.findUnique.mockResolvedValue(mockVideoLesson);
        prismaMock.enrolment.findFirst.mockResolvedValue({
          ...mockActiveEnrolment,
          status: EnrolmentStatus.PENDING_PAYMENT,
        });

        await expect(
          service.recordMediaProgress('lesson-video-1', learnerUser, 150),
        ).rejects.toThrow(ForbiddenException);
      });

      it('blocks learner from progressing lesson when they have no enrolment for that program (IDOR protection)', async () => {
        prismaMock.lesson.findUnique.mockResolvedValue(mockVideoLesson);
        // Learner has no enrolment in prog-1
        prismaMock.enrolment.findFirst.mockResolvedValue(null);

        await expect(
          service.recordMediaProgress('lesson-video-1', otherLearner, 150),
        ).rejects.toThrow(ForbiddenException);
      });

      it('rejects cross-program lesson when lesson does not belong to learner enrolled program', async () => {
        const otherProgLesson = {
          ...mockVideoLesson,
          step: {
            id: 's-other',
            programId: 'prog-other',
            sequence: 1,
            status: ContentStatus.PUBLISHED,
          },
        };
        prismaMock.lesson.findUnique.mockResolvedValue(otherProgLesson);
        prismaMock.enrolment.findFirst.mockResolvedValue(null);

        await expect(
          service.recordMediaProgress('lesson-other', learnerUser, 100),
        ).rejects.toThrow(ForbiddenException);
      });

      it('throws NotFoundException when lesson does not exist', async () => {
        prismaMock.lesson.findUnique.mockResolvedValue(null);

        await expect(
          service.recordMediaProgress('non-existent', learnerUser, 100),
        ).rejects.toThrow(NotFoundException);
      });
    });

    describe('Learner Progress Retrieval (GET /progress/lessons/:lessonId)', () => {
      it('returns existing learner progress for enrolled lesson', async () => {
        prismaMock.lesson.findUnique.mockResolvedValue(mockVideoLesson);
        prismaMock.userLessonProgress.findUnique.mockResolvedValue({
          id: 'ulp-1',
          enrolmentId: 'enrol-1',
          lessonId: 'lesson-video-1',
          progressPercent: 75.0,
          lastPositionSec: 225,
          viewed: false,
          completedAt: null,
        });

        const res = await service.getLearnerLessonProgress('lesson-video-1', learnerUser);

        expect(res.lessonId).toBe('lesson-video-1');
        expect(res.progressPercent).toBe(75.0);
        expect(res.lastPositionSec).toBe(225);
        expect(res.viewed).toBe(false);
        expect(res.durationSec).toBe(300);
      });

      it('returns unviewed defaults when no progress record exists yet', async () => {
        prismaMock.lesson.findUnique.mockResolvedValue(mockVideoLesson);
        prismaMock.userLessonProgress.findUnique.mockResolvedValue(null);

        const res = await service.getLearnerLessonProgress('lesson-video-1', learnerUser);

        expect(res.viewed).toBe(false);
        expect(res.progressPercent).toBe(0);
        expect(res.lastPositionSec).toBeNull();
      });
    });

    describe('Staff Lessons Overview (GET /progression/admin/enrolments/:enrolmentId/lessons)', () => {
      it('returns full lesson overview for assigned manager', async () => {
        prismaMock.userLessonProgress.findMany.mockResolvedValue([
          {
            lessonId: 'lesson-s1-1',
            viewed: true,
            progressPercent: 100,
            lastPositionSec: 300,
            completedAt: new Date(),
          },
        ]);

        const res = await service.getEnrolmentLessonsProgress('enrol-1', managerUser);

        expect(res.enrolmentId).toBe('enrol-1');
        expect(res.totalLessons).toBeGreaterThan(0);
        expect(res.completedLessons).toBe(1);
        expect(res.lessons[0].viewed).toBe(true);
      });

      it('rejects unassigned manager with ForbiddenException', async () => {
        await expect(
          service.getEnrolmentLessonsProgress('enrol-1', unassignedManager),
        ).rejects.toThrow('Access denied: You are not assigned to the batch for this enrolment');
      });
    });
  });
});

