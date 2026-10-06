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
} from '@prisma/client';
import { ProgressionService } from './progression.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('D1-033: ProgressionService - Hybrid Sequential & Cohort Schedule Engine', () => {
  let service: ProgressionService;
  let prismaMock: any;

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
    prismaMock = {
      enrolment: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
      },
      step: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      userLessonProgress: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      attempt: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      stepProgress: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockImplementation(({ create }) => create),
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
});
