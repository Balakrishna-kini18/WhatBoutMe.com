import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ForbiddenException,
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
        count: vi.fn().mockResolvedValue(0),
      },
      question: {
        findMany: vi.fn().mockResolvedValue(createMockQuestions(15)),
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      option: {
        createMany: vi.fn().mockResolvedValue({ count: 4 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 4 }),
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
        { persist: true, forceRecalculate: true },
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

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. D1-037: QUESTION POOL RESOLUTION & VALIDATION
  // ─────────────────────────────────────────────────────────────────────────────

  describe('5. D1-037 Question Pool Resolution & Depth Validation', () => {
    it('queries candidate questions from quizId, stepId, and QuestionBank stepId', async () => {
      prismaMock.attempt.findMany.mockResolvedValueOnce([]);
      prismaMock.attempt.create.mockResolvedValueOnce({
        id: 'att-1',
        attemptNumber: 1,
        status: AttemptStatus.IN_PROGRESS,
      });
      prismaMock.attempt.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'att-1',
        attemptNumber: 1,
        status: AttemptStatus.IN_PROGRESS,
        answers: [],
      });

      await service.startQuiz('quiz-step-1', mockUser);

      expect(prismaMock.question.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { quizId: 'quiz-step-1' },
              { stepId: 'step-1' },
              { questionBank: { stepId: 'step-1' } },
            ],
          },
        }),
      );
    });

    it('deduplicates candidate questions matching multiple criteria', async () => {
      const q1 = {
        id: 'dup-q1',
        quizId: 'quiz-step-1',
        stepId: 'step-1',
        options: [
          { id: 'opt-1', text: 'A', isCorrect: true, order: 1 },
          { id: 'opt-2', text: 'B', isCorrect: false, order: 2 },
        ],
      };
      // 10 distinct questions plus 2 duplicates of q1
      const pool = [q1, q1, ...createMockQuestions(12)];
      prismaMock.question.findMany.mockResolvedValueOnce(pool as any);

      prismaMock.attempt.findMany.mockResolvedValueOnce([]);
      prismaMock.attempt.create.mockResolvedValueOnce({
        id: 'att-1',
        attemptNumber: 1,
        status: AttemptStatus.IN_PROGRESS,
      });
      prismaMock.attempt.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'att-1',
        attemptNumber: 1,
        status: AttemptStatus.IN_PROGRESS,
        answers: [],
      });

      await service.startQuiz('quiz-step-1', mockUser);

      // Verify quizAnswer.createMany received 10 unique question IDs (no duplicate dup-q1)
      const createManyArg = prismaMock.quizAnswer.createMany.mock.calls[0][0].data;
      expect(createManyArg).toHaveLength(10);
      const questionIds = createManyArg.map((a: any) => a.questionId);
      const uniqueIds = new Set(questionIds);
      expect(uniqueIds.size).toBe(10);
    });

    it('rejects with BadRequestException if candidate pool has 0 eligible questions', async () => {
      // Mock pool with 0 eligible questions
      prismaMock.question.findMany.mockResolvedValueOnce(createMockQuestions(0));
      prismaMock.attempt.findMany.mockResolvedValueOnce([]);

      await expect(
        service.startQuiz('quiz-step-1', mockUser),
      ).rejects.toThrow(
        /Insufficient questions in pool: Step quiz requires at least 10 questions, found 0/,
      );
    });

    it('selects exactly questionCount (10) distinct questions from a pool of 20 questions', async () => {
      prismaMock.question.findMany.mockResolvedValueOnce(createMockQuestions(20));
      prismaMock.attempt.findMany.mockResolvedValueOnce([]);
      prismaMock.attempt.create.mockResolvedValueOnce({
        id: 'att-1',
        attemptNumber: 1,
        status: AttemptStatus.IN_PROGRESS,
      });
      prismaMock.attempt.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'att-1',
        attemptNumber: 1,
        status: AttemptStatus.IN_PROGRESS,
        answers: [],
      });

      await service.startQuiz('quiz-step-1', mockUser);

      const createManyArg = prismaMock.quizAnswer.createMany.mock.calls[0][0].data;
      expect(createManyArg).toHaveLength(10);
      const uniqueIds = new Set(createManyArg.map((a: any) => a.questionId));
      expect(uniqueIds.size).toBe(10);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. D1-037: DETERMINISTIC OPTION SHUFFLING & SECURITY
  // ─────────────────────────────────────────────────────────────────────────────

  describe('6. D1-037 Deterministic Option Shuffling & Security', () => {
    it('produces identical option ordering across repeated calls for the same attempt', async () => {
      const activeAttempt = {
        id: 'attempt-stable-1',
        attemptNumber: 1,
        quizId: 'quiz-step-1',
        status: AttemptStatus.IN_PROGRESS,
        startedAt: new Date(),
        answers: [
          {
            question: {
              id: 'q-1',
              text: 'Question text',
              type: 'MULTIPLE_CHOICE',
              points: 1,
              options: [
                { id: 'opt-1', text: 'Option 1', order: 1 },
                { id: 'opt-2', text: 'Option 2', order: 2 },
                { id: 'opt-3', text: 'Option 3', order: 3 },
                { id: 'opt-4', text: 'Option 4', order: 4 },
              ],
            },
          },
        ],
      };

      prismaMock.attempt.findFirst.mockResolvedValue(activeAttempt);

      const read1 = (await service.getActiveAttempt('quiz-step-1', mockUser)) as any;
      const read2 = (await service.getActiveAttempt('quiz-step-1', mockUser)) as any;
      const read3 = (await service.getActiveAttempt('quiz-step-1', mockUser)) as any;

      expect(read1).not.toBeNull();
      expect(read2).not.toBeNull();
      expect(read3).not.toBeNull();

      const optionsOrder1 = read1?.questions[0].options.map((o: any) => o.id);
      const optionsOrder2 = read2?.questions[0].options.map((o: any) => o.id);
      const optionsOrder3 = read3?.questions[0].options.map((o: any) => o.id);

      expect(optionsOrder1).toEqual(optionsOrder2);
      expect(optionsOrder2).toEqual(optionsOrder3);
    });

    it('produces different option ordering across different attempt IDs', async () => {
      const makeAttempt = (id: string) => ({
        id,
        attemptNumber: 1,
        quizId: 'quiz-step-1',
        status: AttemptStatus.IN_PROGRESS,
        startedAt: new Date(),
        answers: [
          {
            question: {
              id: 'q-complex-1',
              text: 'Complex question',
              type: 'MULTIPLE_CHOICE',
              points: 1,
              options: Array.from({ length: 6 }, (_, i) => ({
                id: `opt-c-${i + 1}`,
                text: `Option ${i + 1}`,
                order: i + 1,
              })),
            },
          },
        ],
      });

      prismaMock.attempt.findFirst.mockResolvedValueOnce(makeAttempt('attempt-alpha-1234'));
      const readA = (await service.getActiveAttempt('quiz-step-1', mockUser)) as any;

      prismaMock.attempt.findFirst.mockResolvedValueOnce(makeAttempt('attempt-zeta-9876'));
      const readB = (await service.getActiveAttempt('quiz-step-1', mockUser)) as any;

      const orderA = readA?.questions[0].options.map((o: any) => o.id);
      const orderB = readB?.questions[0].options.map((o: any) => o.id);

      expect(orderA).not.toEqual(orderB);
    });

    it('never exposes Option.isCorrect to learners in formatAttemptResponse', async () => {
      const activeAttempt = {
        id: 'attempt-sec-1',
        attemptNumber: 1,
        quizId: 'quiz-step-1',
        status: AttemptStatus.IN_PROGRESS,
        startedAt: new Date(),
        answers: [
          {
            question: {
              id: 'q-1',
              text: 'Question text',
              type: 'MULTIPLE_CHOICE',
              points: 1,
              options: [
                { id: 'opt-1', text: 'Option 1', isCorrect: true, order: 1 },
                { id: 'opt-2', text: 'Option 2', isCorrect: false, order: 2 },
              ],
            },
          },
        ],
      };

      prismaMock.attempt.findFirst.mockResolvedValueOnce(activeAttempt);
      const result = (await service.getActiveAttempt('quiz-step-1', mockUser)) as any;

      for (const opt of result?.questions[0]?.options ?? []) {
        expect(opt).not.toHaveProperty('isCorrect');
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. D1-037: RETRY THROTTLING & COOLDOWN TIMERS
  // ─────────────────────────────────────────────────────────────────────────────

  describe('7. D1-037 Retry Throttling & Cooldown Timers', () => {
    it('rejects with structured 403 payload when cooldown is active', async () => {
      const failedTime = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      prismaMock.attempt.findMany.mockResolvedValueOnce([
        {
          id: 'att-1',
          attemptNumber: 1,
          status: AttemptStatus.FAILED,
          completedAt: failedTime,
          createdAt: failedTime,
        },
      ]);

      try {
        await service.startQuiz('quiz-step-1', mockUser);
        expect.unreachable('Should have thrown ForbiddenException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ForbiddenException);
        const resp = err.getResponse();
        expect(resp).toHaveProperty('statusCode', 403);
        expect(resp).toHaveProperty('cooldownUntil');
        expect(resp).toHaveProperty('cooldownSecondsRemaining');
        expect(resp.cooldownSecondsRemaining).toBeGreaterThan(0);
        expect(resp).toHaveProperty('attemptsRemaining', 2);
        expect(resp).toHaveProperty('maxAttempts', 3);
        expect(resp).toHaveProperty('attemptsUsed', 1);
      }
    });

    it('respects custom quiz.cooldownHours when configured', async () => {
      // 10 hours ago failure on a quiz with 8 hours cooldown -> cooldown expired
      const failed10HoursAgo = new Date(Date.now() - 10 * 60 * 60 * 1000);
      prismaMock.quiz.findUnique.mockResolvedValueOnce({
        ...mockQuiz,
        cooldownHours: 8,
      });

      prismaMock.attempt.findMany.mockResolvedValueOnce([
        {
          id: 'att-1',
          attemptNumber: 1,
          status: AttemptStatus.FAILED,
          completedAt: failed10HoursAgo,
          createdAt: failed10HoursAgo,
        },
      ]);

      const mockNewAttempt = {
        id: 'att-2',
        attemptNumber: 2,
        status: AttemptStatus.IN_PROGRESS,
      };
      prismaMock.attempt.create.mockResolvedValueOnce(mockNewAttempt);
      prismaMock.attempt.findUniqueOrThrow.mockResolvedValueOnce({
        ...mockNewAttempt,
        answers: [],
      });

      const res = await service.startQuiz('quiz-step-1', mockUser);
      expect(res.attemptId).toBe('att-2');
    });

    it('does not trigger cooldown if latest attempt was PASSED', async () => {
      const passedTime = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour ago
      prismaMock.attempt.findMany.mockResolvedValueOnce([
        {
          id: 'att-1',
          attemptNumber: 1,
          status: AttemptStatus.PASSED,
          passed: true,
          completedAt: passedTime,
          createdAt: passedTime,
        },
      ]);

      const mockNewAttempt = {
        id: 'att-2',
        attemptNumber: 2,
        status: AttemptStatus.IN_PROGRESS,
      };
      prismaMock.attempt.create.mockResolvedValueOnce(mockNewAttempt);
      prismaMock.attempt.findUniqueOrThrow.mockResolvedValueOnce({
        ...mockNewAttempt,
        answers: [],
      });

      const res = await service.startQuiz('quiz-step-1', mockUser);
      expect(res.attemptId).toBe('att-2');
    });

    it('rejects with structured 403 payload when maximum attempts are exhausted', async () => {
      prismaMock.attempt.findMany.mockResolvedValueOnce([
        { id: 'att-3', attemptNumber: 3, createdAt: new Date() },
        { id: 'att-2', attemptNumber: 2, createdAt: new Date() },
        { id: 'att-1', attemptNumber: 1, createdAt: new Date() },
      ]);

      try {
        await service.startQuiz('quiz-step-1', mockUser);
        expect.unreachable('Should have thrown ForbiddenException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ForbiddenException);
        const resp = err.getResponse();
        expect(resp).toHaveProperty('statusCode', 403);
        expect(resp).toHaveProperty('attemptsUsed', 3);
        expect(resp).toHaveProperty('maxAttempts', 3);
        expect(resp).toHaveProperty('attemptsRemaining', 0);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. D1-037: LEARNER FEEDBACK & REMEDIATION
  // ─────────────────────────────────────────────────────────────────────────────

  describe('8. D1-037 Learner Feedback & Remediation', () => {
    it('submitQuiz on failure returns retry metadata, countdown, and stepToRevisit', async () => {
      const questions = createMockQuestions(10);
      const attemptToSubmit = {
        id: 'attempt-fail-1',
        quizId: 'quiz-step-1',
        attemptNumber: 1,
        status: AttemptStatus.IN_PROGRESS,
        quiz: {
          ...mockQuiz,
          step: { id: 'step-1', sequence: 1, title: 'Step 1: Introduction' },
        },
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
      // After finalization, query attempts returns this attempt as FAILED
      prismaMock.attempt.findMany.mockResolvedValueOnce([
        {
          id: 'attempt-fail-1',
          attemptNumber: 1,
          status: AttemptStatus.FAILED,
          passed: false,
          completedAt: new Date(),
          createdAt: new Date(),
        },
      ]);
      prismaMock.attempt.update.mockResolvedValueOnce({
        id: 'attempt-fail-1',
        attemptNumber: 1,
        score: 0,
        passed: false,
        status: AttemptStatus.FAILED,
        completedAt: new Date(),
      });

      const result = await service.submitQuiz('quiz-step-1', mockUser, {
        attemptId: 'attempt-fail-1',
        answers: [], // 0 answers correct -> 0% score -> FAILED
      });

      expect(result.passed).toBe(false);
      expect(result.status).toBe(AttemptStatus.FAILED);
      expect(result.attemptsUsed).toBe(1);
      expect(result.maxAttempts).toBe(3);
      expect(result.attemptsRemaining).toBe(2);
      expect(result.isCooldownActive).toBe(true);
      expect(result.cooldownHours).toBe(24);
      expect(result.cooldownUntil).toBeDefined();
      expect(result.cooldownSecondsRemaining).toBeGreaterThan(0);
      expect(result.canRetry).toBe(false);
      expect(result.stepToRevisit).toEqual({
        id: 'step-1',
        sequence: 1,
        title: 'Step 1: Introduction',
      });
      expect(result.retryGuidance).toBe(mockQuiz.retryGuidance);
    });

    it('getActiveAttempt returns retry metadata and stepToRevisit when in cooldown', async () => {
      prismaMock.attempt.findFirst
        .mockResolvedValueOnce(null) // no active attempt
        .mockResolvedValueOnce({
          id: 'att-fail-prev',
          attemptNumber: 1,
          status: AttemptStatus.FAILED,
          score: 50,
          passed: false,
          startedAt: new Date(),
          completedAt: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1h ago
        });

      prismaMock.attempt.findMany.mockResolvedValueOnce([
        {
          id: 'att-fail-prev',
          attemptNumber: 1,
          status: AttemptStatus.FAILED,
          passed: false,
          completedAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
          createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
        },
      ]);

      const res = (await service.getActiveAttempt('quiz-step-1', mockUser)) as any;

      expect(res).not.toBeNull();
      expect(res?.status).toBe(AttemptStatus.FAILED);
      expect(res?.isCooldownActive).toBe(true);
      expect(res?.canRetry).toBe(false);
      expect(res?.attemptsUsed).toBe(1);
      expect(res?.attemptsRemaining).toBe(2);
      expect(res?.stepToRevisit).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. D1-037: QUESTION BANK ADMINISTRATION (ADMIN CRUD)
  // ─────────────────────────────────────────────────────────────────────────────

  describe('9. D1-037 Question Bank Administration (Admin CRUD)', () => {
    it('getQuestionsForQuiz returns all candidate questions with options including isCorrect', async () => {
      const mockQuestionsWithAnswers = [
        {
          id: 'q-admin-1',
          quizId: 'quiz-step-1',
          stepId: 'step-1',
          type: 'MULTIPLE_CHOICE',
          text: 'Administrative Question 1',
          explanation: 'Explanation text',
          points: 2,
          options: [
            { id: 'opt-1', text: 'Option A', isCorrect: true, order: 1 },
            { id: 'opt-2', text: 'Option B', isCorrect: false, order: 2 },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      prismaMock.question.findMany.mockResolvedValueOnce(mockQuestionsWithAnswers);

      const res = await service.getQuestionsForQuiz('quiz-step-1');

      expect(res).toHaveLength(1);
      expect(res[0].id).toBe('q-admin-1');
      expect(res[0].options[0].isCorrect).toBe(true);
      expect(res[0].options[1].isCorrect).toBe(false);
    });

    it('createQuestionForQuiz creates question and options in transaction and invalidates cache', async () => {
      const createdQuestion = {
        id: 'q-created-1',
        quizId: 'quiz-step-1',
        stepId: 'step-1',
        text: 'New question text',
        options: [
          { id: 'opt-1', text: 'Ans 1', isCorrect: true, order: 1 },
          { id: 'opt-2', text: 'Ans 2', isCorrect: false, order: 2 },
        ],
      };

      prismaMock.question.create.mockResolvedValueOnce({ id: 'q-created-1' });
      prismaMock.question.findUniqueOrThrow.mockResolvedValueOnce(createdQuestion);

      const res = await service.createQuestionForQuiz('quiz-step-1', {
        text: 'New question text',
        points: 2,
        options: [
          { text: 'Ans 1', isCorrect: true },
          { text: 'Ans 2', isCorrect: false },
        ],
      });

      expect(res.id).toBe('q-created-1');
      expect(prismaMock.question.create).toHaveBeenCalled();
      expect(prismaMock.option.createMany).toHaveBeenCalled();
      expect(cacheHelperMock.invalidateNamespace).toHaveBeenCalledWith('programs');
    });

    it('createQuestionForQuiz rejects if fewer than 2 options provided', async () => {
      await expect(
        service.createQuestionForQuiz('quiz-step-1', {
          text: 'Invalid question',
          options: [{ text: 'Only one', isCorrect: true }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('createQuestionForQuiz rejects if no correct option provided', async () => {
      await expect(
        service.createQuestionForQuiz('quiz-step-1', {
          text: 'Invalid question',
          options: [
            { text: 'Option A', isCorrect: false },
            { text: 'Option B', isCorrect: false },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('updateQuestion updates question fields and replaces options in transaction', async () => {
      const existing = {
        id: 'q-upd-1',
        text: 'Old text',
        options: [{ id: 'opt-1' }],
      };
      prismaMock.question.findUnique.mockResolvedValueOnce(existing);

      const updated = {
        id: 'q-upd-1',
        text: 'Updated question text',
        options: [
          { id: 'opt-new-1', text: 'Yes', isCorrect: true },
          { id: 'opt-new-2', text: 'No', isCorrect: false },
        ],
      };
      prismaMock.question.findUniqueOrThrow.mockResolvedValueOnce(updated);

      const res = await service.updateQuestion('q-upd-1', {
        text: 'Updated question text',
        options: [
          { text: 'Yes', isCorrect: true },
          { text: 'No', isCorrect: false },
        ],
      });

      expect(res.text).toBe('Updated question text');
      expect(prismaMock.question.update).toHaveBeenCalled();
      expect(prismaMock.option.deleteMany).toHaveBeenCalled();
      expect(prismaMock.option.createMany).toHaveBeenCalled();
      expect(cacheHelperMock.invalidateNamespace).toHaveBeenCalledWith('programs');
    });

    it('deleteQuestion deletes question when not referenced in recorded attempts', async () => {
      prismaMock.question.findUnique.mockResolvedValueOnce({ id: 'q-del-1' });
      prismaMock.quizAnswer.count.mockResolvedValueOnce(0);

      const res = await service.deleteQuestion('q-del-1');

      expect(res).toEqual({
        success: true,
        message: 'Question deleted successfully',
        questionId: 'q-del-1',
      });
      expect(prismaMock.question.delete).toHaveBeenCalledWith({
        where: { id: 'q-del-1' },
      });
      expect(cacheHelperMock.invalidateNamespace).toHaveBeenCalledWith('programs');
    });

    it('deleteQuestion rejects if question is referenced in recorded quiz attempts', async () => {
      prismaMock.question.findUnique.mockResolvedValueOnce({ id: 'q-del-1' });
      prismaMock.quizAnswer.count.mockResolvedValueOnce(3); // 3 answers reference this question

      await expect(service.deleteQuestion('q-del-1')).rejects.toThrow(BadRequestException);
      expect(prismaMock.question.delete).not.toHaveBeenCalled();
    });
  });
});

