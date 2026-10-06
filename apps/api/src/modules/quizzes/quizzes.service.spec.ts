import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AttemptStatus,
  ContentStatus,
  EnrolmentStatus,
  Role,
  StepOverrideState,
} from '@prisma/client';
import { QuizzesService } from './quizzes.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CacheHelperService } from '../../common/cache/cache-helper.service.js';
import { ProgressionService } from '../progression/progression.service.js';

describe('D1-036: QuizzesService - Question Bank & Quiz Engine', () => {
  let service: QuizzesService;
  let prismaMock: any;
  let cacheHelperMock: any;
  let progressionServiceMock: any;

  const mockUser = {
    id: 'user-learner-1',
    sub: 'user-learner-1',
    role: Role.USER,
  };

  const mockAdmin = {
    id: 'user-admin-1',
    sub: 'user-admin-1',
    role: Role.ADMIN,
  };

  const mockManager = {
    id: 'user-mgr-1',
    sub: 'user-mgr-1',
    role: Role.MANAGER,
  };

  const mockQuiz = {
    id: 'quiz-step-1',
    stepId: 'step-1',
    passMark: 75,
    maxAttempts: 3,
    cooldownHours: 24,
    questionCount: 10,
    timeLimitMin: 20,
    retryGuidance: 'Please review the lesson materials before re-attempting.',
    step: {
      id: 'step-1',
      programId: 'prog-1',
      sequence: 1,
      status: ContentStatus.PUBLISHED,
    },
  };

  const mockEnrolment = {
    id: 'enrolment-1',
    userId: 'user-learner-1',
    programId: 'prog-1',
    batchId: 'batch-1',
    status: EnrolmentStatus.ACTIVE,
    batch: {
      id: 'batch-1',
      managerId: 'user-mgr-1',
      trainers: [{ trainerId: 'user-tr-1' }],
      overrides: [],
    },
    program: {
      id: 'prog-1',
      title: '11 Steps to U',
      status: ContentStatus.PUBLISHED,
    },
  };

  const createMockQuestions = (count = 15) =>
    Array.from({ length: count }, (_, i) => ({
      id: `q-${i + 1}`,
      quizId: 'quiz-step-1',
      stepId: 'step-1',
      type: 'MULTIPLE_CHOICE' as any,
      text: `Question ${i + 1} content text`,
      points: 2,
      options: [
        { id: `opt-${i + 1}-1`, text: 'Option A', isCorrect: true, order: 1 },
        { id: `opt-${i + 1}-2`, text: 'Option B', isCorrect: false, order: 2 },
        { id: `opt-${i + 1}-3`, text: 'Option C', isCorrect: false, order: 3 },
        { id: `opt-${i + 1}-4`, text: 'Option D', isCorrect: false, order: 4 },
      ],
    }));

  beforeEach(() => {
    prismaMock = {
      quiz: {
        findUnique: vi.fn().mockResolvedValue(mockQuiz),
        findMany: vi.fn().mockResolvedValue([mockQuiz]),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      enrolment: {
        findUnique: vi.fn().mockResolvedValue(mockEnrolment),
        findFirst: vi.fn().mockResolvedValue(mockEnrolment),
      },
      stepProgress: {
        findUnique: vi.fn().mockResolvedValue({
          overrideState: StepOverrideState.AUTOMATIC,
          isUnlocked: true,
        }),
      },
      lesson: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'lesson-1' },
          { id: 'lesson-2' },
        ]),
      },
      userLessonProgress: {
        count: vi.fn().mockResolvedValue(2), // all viewed
      },
      attempt: {
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        update: vi.fn(),
      },
      quizAnswer: {
        createMany: vi.fn().mockResolvedValue({ count: 10 }),
        update: vi.fn(),
      },
      question: {
        findMany: vi.fn().mockResolvedValue(createMockQuestions(15)),
      },
      auditLog: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => {
        if (typeof callback === 'function') {
          return callback(prismaMock);
        }
        return Promise.all(callback);
      }),
    };

    cacheHelperMock = {
      invalidateNamespace: vi.fn().mockResolvedValue(undefined),
    };

    progressionServiceMock = {
      assertStepUnlocked: vi.fn().mockResolvedValue(true),
      evaluateProgression: vi.fn().mockResolvedValue({}),
    };

    service = new QuizzesService(
      prismaMock as unknown as PrismaService,
      cacheHelperMock as unknown as CacheHelperService,
      progressionServiceMock as unknown as ProgressionService,
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. START ATTEMPT
  // ─────────────────────────────────────────────────────────────────────────────

  describe('1. Start Attempt Lifecycle', () => {
    it('successfully starts a quiz, draws 10 distinct questions, and strips isCorrect', async () => {
      const mockCreatedAttempt = {
        id: 'attempt-101',
        enrolmentId: 'enrolment-1',
        quizId: 'quiz-step-1',
        attemptNumber: 1,
        status: AttemptStatus.IN_PROGRESS,
        startedAt: new Date(),
      };

      prismaMock.attempt.create.mockResolvedValue(mockCreatedAttempt);
      prismaMock.attempt.findUniqueOrThrow.mockResolvedValue({
        ...mockCreatedAttempt,
        answers: createMockQuestions(10).map((q) => ({
          id: `ans-${q.id}`,
          questionId: q.id,
          question: q,
        })),
      });

      const result = await service.startQuiz('quiz-step-1', mockUser);

      expect(result).toBeDefined();
      expect(result.attemptId).toBe('attempt-101');
      expect(result.attemptNumber).toBe(1);
      expect(result.status).toBe(AttemptStatus.IN_PROGRESS);
      expect(result.questions).toHaveLength(10);

      // Verify Option.isCorrect is NEVER exposed in learner response
      for (const q of result.questions) {
        expect(q.options).toBeDefined();
        for (const opt of q.options) {
          expect((opt as any).isCorrect).toBeUndefined();
        }
      }

      // Verify QuizAnswer binding was performed in transaction
      expect(prismaMock.quizAnswer.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            attemptId: 'attempt-101',
            isCorrect: false,
            pointsAwarded: 0,
          }),
        ]),
      });
    });

    it('resumes existing IN_PROGRESS attempt idempotently without creating a new attempt', async () => {
      const existingAttempt = {
        id: 'attempt-in-progress',
        enrolmentId: 'enrolment-1',
        quizId: 'quiz-step-1',
        attemptNumber: 1,
        status: AttemptStatus.IN_PROGRESS,
        startedAt: new Date(),
        answers: createMockQuestions(10).map((q) => ({
          id: `ans-${q.id}`,
          questionId: q.id,
          question: q,
        })),
      };

      prismaMock.attempt.findFirst.mockResolvedValueOnce(existingAttempt);

      const result = await service.startQuiz('quiz-step-1', mockUser);

      expect(result.attemptId).toBe('attempt-in-progress');
      expect(prismaMock.attempt.create).not.toHaveBeenCalled();
    });

    it('rejects if learner enrolment is not ACTIVE', async () => {
      prismaMock.enrolment.findFirst.mockResolvedValueOnce({
        ...mockEnrolment,
        status: EnrolmentStatus.PENDING_PAYMENT,
      });

      await expect(
        service.startQuiz('quiz-step-1', mockUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects if step is locked (assertStepUnlocked throws)', async () => {
      progressionServiceMock.assertStepUnlocked.mockRejectedValueOnce(
        new ForbiddenException('Step is locked: PREVIOUS_STEP_INCOMPLETE'),
      );

      await expect(
        service.startQuiz('quiz-step-1', mockUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects if lessons in step are incomplete under AUTOMATIC progression', async () => {
      prismaMock.userLessonProgress.count.mockResolvedValueOnce(1); // 1 of 2 viewed

      await expect(
        service.startQuiz('quiz-step-1', mockUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows quiz start if step is MANUAL_UNLOCKED even if lessons are unviewed', async () => {
      prismaMock.stepProgress.findUnique.mockResolvedValueOnce({
        overrideState: StepOverrideState.MANUAL_UNLOCKED,
        isUnlocked: true,
      });
      prismaMock.userLessonProgress.count.mockResolvedValueOnce(0); // 0 viewed

      const mockCreatedAttempt = {
        id: 'attempt-override',
        enrolmentId: 'enrolment-1',
        quizId: 'quiz-step-1',
        attemptNumber: 1,
        status: AttemptStatus.IN_PROGRESS,
        startedAt: new Date(),
      };
      prismaMock.attempt.create.mockResolvedValue(mockCreatedAttempt);
      prismaMock.attempt.findUniqueOrThrow.mockResolvedValue({
        ...mockCreatedAttempt,
        answers: [],
      });

      const result = await service.startQuiz('quiz-step-1', mockUser);
      expect(result.attemptId).toBe('attempt-override');
    });

    it('rejects if maximum attempts limit is reached', async () => {
      prismaMock.attempt.findMany.mockResolvedValueOnce([
        { id: 'att-3', attemptNumber: 3, createdAt: new Date() },
        { id: 'att-2', attemptNumber: 2, createdAt: new Date() },
        { id: 'att-1', attemptNumber: 1, createdAt: new Date() },
      ]);

      await expect(
        service.startQuiz('quiz-step-1', mockUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects if cooldown period after failed attempt is active', async () => {
      const recentFailedTime = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago (cooldown 24h)
      prismaMock.attempt.findMany.mockResolvedValueOnce([
        {
          id: 'att-1',
          attemptNumber: 1,
          status: AttemptStatus.FAILED,
          completedAt: recentFailedTime,
          createdAt: recentFailedTime,
        },
      ]);

      await expect(
        service.startQuiz('quiz-step-1', mockUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows retry if cooldown period has elapsed', async () => {
      const expiredFailedTime = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      prismaMock.attempt.findMany.mockResolvedValueOnce([
        {
          id: 'att-1',
          attemptNumber: 1,
          status: AttemptStatus.FAILED,
          completedAt: expiredFailedTime,
          createdAt: expiredFailedTime,
        },
      ]);

      const mockCreatedAttempt = {
        id: 'att-2',
        attemptNumber: 2,
        status: AttemptStatus.IN_PROGRESS,
        startedAt: new Date(),
      };
      prismaMock.attempt.create.mockResolvedValue(mockCreatedAttempt);
      prismaMock.attempt.findUniqueOrThrow.mockResolvedValue({
        ...mockCreatedAttempt,
        answers: [],
      });

      const result = await service.startQuiz('quiz-step-1', mockUser);
      expect(result.attemptId).toBe('att-2');
    });

    it('rejects if no questions exist in question bank for quiz', async () => {
      prismaMock.question.findMany.mockResolvedValueOnce([]);

      await expect(
        service.startQuiz('quiz-step-1', mockUser),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. SUBMIT ATTEMPT & SCORING
  // ─────────────────────────────────────────────────────────────────────────────

  describe('2. Submit Attempt & Scoring Engine', () => {
    it('calculates passing score server-side, finalizes PASSED, and triggers progression', async () => {
      const questions = createMockQuestions(10);
      const attemptToSubmit = {
        id: 'attempt-submit-1',
        quizId: 'quiz-step-1',
        attemptNumber: 1,
        status: AttemptStatus.IN_PROGRESS,
        quiz: mockQuiz,
        enrolment: mockEnrolment,
        answers: questions.map((q) => ({
          id: `ans-${q.id}`,
          questionId: q.id,
          question: q,
        })),
      };

      prismaMock.attempt.findUnique
        .mockResolvedValueOnce(attemptToSubmit) // initial check
        .mockResolvedValueOnce(attemptToSubmit); // optimistic concurrency check in transaction

      prismaMock.attempt.update.mockResolvedValueOnce({
        id: 'attempt-submit-1',
        attemptNumber: 1,
        score: 100,
        passed: true,
        status: AttemptStatus.PASSED,
        completedAt: new Date(),
      });

      // Submit all correct options
      const submissionDto = {
        attemptId: 'attempt-submit-1',
        answers: questions.map((q) => ({
          questionId: q.id,
          optionId: `opt-${q.id.split('-')[1]}-1`, // option 1 is correct
        })),
      };

      const result = await service.submitQuiz('quiz-step-1', mockUser, submissionDto);

      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
      expect(result.status).toBe(AttemptStatus.PASSED);
      expect(result.correctCount).toBe(10);

      // Verify progression evaluateProgression was triggered on PASS
      expect(progressionServiceMock.evaluateProgression).toHaveBeenCalledWith(
        mockEnrolment,
        { persist: true },
      );
    });

    it('calculates failing score server-side, finalizes FAILED, and does NOT trigger progression', async () => {
      const questions = createMockQuestions(10);
      const attemptToSubmit = {
        id: 'attempt-submit-fail',
        quizId: 'quiz-step-1',
        attemptNumber: 1,
        status: AttemptStatus.IN_PROGRESS,
        quiz: mockQuiz,
        enrolment: mockEnrolment,
        answers: questions.map((q) => ({
          id: `ans-${q.id}`,
          questionId: q.id,
          question: q,
        })),
      };

      prismaMock.attempt.findUnique
        .mockResolvedValueOnce(attemptToSubmit)
        .mockResolvedValueOnce(attemptToSubmit);

      prismaMock.attempt.update.mockResolvedValueOnce({
        id: 'attempt-submit-fail',
        attemptNumber: 1,
        score: 20,
        passed: false,
        status: AttemptStatus.FAILED,
        completedAt: new Date(),
      });

      // Submit only 2 correct answers (20%)
      const submissionDto = {
        attemptId: 'attempt-submit-fail',
        answers: questions.map((q, idx) => ({
          questionId: q.id,
          optionId:
            idx < 2
              ? `opt-${q.id.split('-')[1]}-1` // correct
              : `opt-${q.id.split('-')[1]}-2`, // incorrect
        })),
      };

      const result = await service.submitQuiz('quiz-step-1', mockUser, submissionDto);

      expect(result.passed).toBe(false);
      expect(result.score).toBe(20);
      expect(result.status).toBe(AttemptStatus.FAILED);
      expect(result.correctCount).toBe(2);
      expect(result.retryGuidance).toBe(mockQuiz.retryGuidance);

      // Must NOT evaluate progression on fail
      expect(progressionServiceMock.evaluateProgression).not.toHaveBeenCalled();
    });

    it('rejects submission if attempt belongs to another learner (learner isolation)', async () => {
      prismaMock.attempt.findUnique.mockResolvedValueOnce({
        id: 'attempt-other-user',
        quizId: 'quiz-step-1',
        status: AttemptStatus.IN_PROGRESS,
        enrolment: {
          ...mockEnrolment,
          userId: 'user-different',
        },
        answers: [],
      });

      await expect(
        service.submitQuiz('quiz-step-1', mockUser, {
          attemptId: 'attempt-other-user',
          answers: [],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects duplicate submission if attempt is already finalized', async () => {
      prismaMock.attempt.findUnique.mockResolvedValueOnce({
        id: 'attempt-finalized',
        quizId: 'quiz-step-1',
        status: AttemptStatus.PASSED,
        enrolment: mockEnrolment,
        answers: [],
      });

      await expect(
        service.submitQuiz('quiz-step-1', mockUser, {
          attemptId: 'attempt-finalized',
          answers: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects submission with question ID not bound to the attempt', async () => {
      const questions = createMockQuestions(5);
      prismaMock.attempt.findUnique.mockResolvedValueOnce({
        id: 'attempt-1',
        quizId: 'quiz-step-1',
        status: AttemptStatus.IN_PROGRESS,
        enrolment: mockEnrolment,
        answers: questions.map((q) => ({
          id: `ans-${q.id}`,
          questionId: q.id,
          question: q,
        })),
      });

      await expect(
        service.submitQuiz('quiz-step-1', mockUser, {
          attemptId: 'attempt-1',
          answers: [{ questionId: 'unbound-question-999', optionId: 'opt-1' }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects submission with option ID not belonging to the question', async () => {
      const questions = createMockQuestions(2);
      prismaMock.attempt.findUnique.mockResolvedValueOnce({
        id: 'attempt-1',
        quizId: 'quiz-step-1',
        status: AttemptStatus.IN_PROGRESS,
        enrolment: mockEnrolment,
        answers: questions.map((q) => ({
          id: `ans-${q.id}`,
          questionId: q.id,
          question: q,
        })),
      });

      await expect(
        service.submitQuiz('quiz-step-1', mockUser, {
          attemptId: 'attempt-1',
          answers: [{ questionId: 'q-1', optionId: 'foreign-option-999' }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. ATTEMPT RESET & AUDITING
  // ─────────────────────────────────────────────────────────────────────────────

  describe('3. Attempt Reset & Audit Trail', () => {
    it('successfully resets attempts and logs AuditLog with reason', async () => {
      const result = await service.resetQuizAttempts(
        'quiz-step-1',
        'enrolment-1',
        mockAdmin,
        { reason: 'Learner experienced browser crash during test.' },
        '127.0.0.1',
      );

      expect(result.success).toBe(true);
      expect(result.enrolmentId).toBe('enrolment-1');

      expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorId: 'user-admin-1',
          action: 'QUIZ_ATTEMPTS_RESET',
          entity: 'QuizAttempt',
          entityId: 'enrolment-1_quiz-step-1',
          meta: expect.objectContaining({
            reason: 'Learner experienced browser crash during test.',
            resetByRole: Role.ADMIN,
          }),
        }),
      });
    });

    it('rejects reset if reason is under 5 characters', async () => {
      await expect(
        service.resetQuizAttempts(
          'quiz-step-1',
          'enrolment-1',
          mockAdmin,
          { reason: 'fix' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows manager assigned to batch to reset attempts', async () => {
      const result = await service.resetQuizAttempts(
        'quiz-step-1',
        'enrolment-1',
        mockManager, // managerId is user-mgr-1 matching batch.managerId
        { reason: 'Manager approved retry after tech issue' },
      );

      expect(result.success).toBe(true);
    });

    it('rejects unassigned manager attempting to reset attempts', async () => {
      const unassignedManager = {
        id: 'foreign-mgr',
        sub: 'foreign-mgr',
        role: Role.MANAGER,
      };

      await expect(
        service.resetQuizAttempts(
          'quiz-step-1',
          'enrolment-1',
          unassignedManager,
          { reason: 'Trying unauthorized reset' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('reset enables learner to take quiz again even after max attempts were previously hit', async () => {
      // Historical attempts exist
      const resetTime = new Date('2026-10-06T12:00:00.000Z');
      const priorAttempts = [
        {
          id: 'att-3',
          attemptNumber: 3,
          createdAt: new Date('2026-10-06T10:00:00.000Z'),
        },
        {
          id: 'att-2',
          attemptNumber: 2,
          createdAt: new Date('2026-10-06T09:00:00.000Z'),
        },
        {
          id: 'att-1',
          attemptNumber: 1,
          createdAt: new Date('2026-10-06T08:00:00.000Z'),
        },
      ];

      prismaMock.attempt.findMany.mockResolvedValueOnce(priorAttempts);
      // Last reset occurred at 12:00 (after the 3 failed attempts)
      prismaMock.auditLog.findFirst.mockResolvedValueOnce({
        createdAt: resetTime,
        action: 'QUIZ_ATTEMPTS_RESET',
      });

      const mockNewAttempt = {
        id: 'att-4',
        attemptNumber: 4,
        status: AttemptStatus.IN_PROGRESS,
        startedAt: new Date(),
      };
      prismaMock.attempt.create.mockResolvedValue(mockNewAttempt);
      prismaMock.attempt.findUniqueOrThrow.mockResolvedValue({
        ...mockNewAttempt,
        answers: [],
      });

      const result = await service.startQuiz('quiz-step-1', mockUser);
      expect(result.attemptId).toBe('att-4');
      expect(result.attemptNumber).toBe(4);
    });
  });
});
