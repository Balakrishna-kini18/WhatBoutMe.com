import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QuizzesService } from './quizzes.service.js';
import { AttemptStatus, QuestionType, Role } from '@prisma/client';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

describe('Real-World Production Quiz Submission & Resilience (10,000 Dev Rigor)', () => {
  let service: QuizzesService;
  let prismaMock: any;
  let progressionMock: any;
  let cacheHelperMock: any;

  const mockUser = {
    id: 'user-gagan-1',
    sub: 'user-gagan-1',
    email: 'gagankunder332@gmail.com',
    role: Role.USER,
  };

  const mockEnrolment = {
    id: 'enrolment-gagan-1',
    userId: 'user-gagan-1',
    programId: 'program-sigma-1',
    status: 'ACTIVE',
    batch: {
      id: 'batch-sigma-1',
      managerId: 'manager-1',
      trainers: [{ trainerId: 'trainer-1' }],
      overrides: [],
    },
    program: {
      id: 'program-sigma-1',
      title: 'Sigma 1 Certification',
      status: 'PUBLISHED',
    },
  };

  const mockQuiz = {
    id: 'quiz-mod-1',
    stepId: 'step-mod-1',
    passMark: 75,
    maxAttempts: 3,
    cooldownHours: 24,
    questionCount: 3,
    timeLimitMin: 15,
    retryGuidance: 'Review module 1 video lesson before taking your next attempt.',
    step: {
      id: 'step-mod-1',
      programId: 'program-sigma-1',
      sequence: 1,
      title: 'Module 1: Foundations',
    },
  };

  const mockQuestions = [
    {
      id: 'q-single-choice-1',
      text: 'What is RGB LIGHT?',
      type: QuestionType.MULTIPLE_CHOICE,
      points: 1,
      options: [
        { id: 'opt-red', text: 'Red', isCorrect: false, order: 1 },
        { id: 'opt-blue', text: 'Blue', isCorrect: false, order: 2 },
        { id: 'opt-rgb-correct', text: 'RED BLUE AND GREEN (correct answer)', isCorrect: true, order: 3 },
      ],
    },
    {
      id: 'q-multi-select-2',
      text: 'Which of the following are primary colors?',
      type: QuestionType.MULTI_SELECT,
      points: 2,
      options: [
        { id: 'opt-ms-red', text: 'Red', isCorrect: true, order: 1 },
        { id: 'opt-ms-green', text: 'Green', isCorrect: true, order: 2 },
        { id: 'opt-ms-blue', text: 'Blue', isCorrect: true, order: 3 },
        { id: 'opt-ms-black', text: 'Black', isCorrect: false, order: 4 },
      ],
    },
    {
      id: 'q-written-3',
      text: 'Explain in your own words how color theory applies to digital interfaces.',
      type: QuestionType.SHORT_ANSWER,
      gradingMode: 'SELF_REFLECTION_AUTO_PASS',
      minCharacters: 15,
      points: 1,
      options: [],
    },
  ];

  beforeEach(() => {
    prismaMock = {
      attempt: {
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      quiz: {
        findUnique: vi.fn(),
      },
      quizAnswer: {
        update: vi.fn(),
        createMany: vi.fn(),
      },
      enrolment: {
        findFirst: vi.fn(),
      },
      auditLog: {
        findFirst: vi.fn(),
      },
      $transaction: vi.fn(async (cb: any) => cb(prismaMock)),
    };

    progressionMock = {
      assertStepUnlocked: vi.fn().mockResolvedValue(true),
      evaluateProgression: vi.fn().mockResolvedValue({}),
    };

    cacheHelperMock = {
      invalidateNamespace: vi.fn().mockResolvedValue(undefined),
    };

    service = new QuizzesService(prismaMock, cacheHelperMock, progressionMock);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. REAL-WORLD BUG FIX: IDEMPOTENT SUBMISSION RECOVERY
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Bug Reproduction & Idempotent Submission Recovery', () => {
    it('returns finalized attempt result idempotently when learner retries after network timeout', async () => {
      // Setup: Attempt was already finalized to PASSED by the first request that timed out on client
      const finalizedAttempt = {
        id: '002fe5e4-e003-4fce-89ad-d2249f3af529',
        quizId: mockQuiz.id,
        attemptNumber: 4,
        score: 100,
        passed: true,
        status: AttemptStatus.PASSED,
        startedAt: new Date(Date.now() - 30000),
        completedAt: new Date(),
        enrolment: mockEnrolment,
        enrolmentId: mockEnrolment.id,
        quiz: mockQuiz,
        answers: [
          {
            id: 'ans-1',
            questionId: 'q-single-choice-1',
            selectedOptionId: 'opt-rgb-correct',
            isCorrect: true,
            pointsAwarded: 1,
            question: mockQuestions[0],
          },
        ],
      };

      prismaMock.attempt.findUnique.mockResolvedValueOnce(finalizedAttempt);
      prismaMock.attempt.findMany.mockResolvedValueOnce([finalizedAttempt]);
      prismaMock.auditLog.findFirst.mockResolvedValueOnce(null);

      // Act: Learner clicks Submit Quiz a 2nd time after the 15s browser timeout
      const result = await service.submitQuiz(mockQuiz.id, mockUser, {
        attemptId: '002fe5e4-e003-4fce-89ad-d2249f3af529',
        answers: [
          {
            questionId: 'q-single-choice-1',
            optionId: 'opt-rgb-correct',
          },
        ],
      });

      // Assert: Must NOT throw 400 Bad Request! Returns 200 OK with passed status & 100% score!
      expect(result).toBeDefined();
      expect(result.attemptId).toBe('002fe5e4-e003-4fce-89ad-d2249f3af529');
      expect(result.status).toBe(AttemptStatus.PASSED);
      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
      expect(result.correctCount).toBe(1);
    });

    it('supports submission payload when attemptId is provided as id', async () => {
      const finalizedAttempt = {
        id: 'attempt-with-id-prop',
        quizId: mockQuiz.id,
        attemptNumber: 1,
        score: 100,
        passed: true,
        status: AttemptStatus.PASSED,
        startedAt: new Date(Date.now() - 10000),
        completedAt: new Date(),
        enrolment: mockEnrolment,
        enrolmentId: mockEnrolment.id,
        quiz: mockQuiz,
        answers: [],
      };

      prismaMock.attempt.findUnique.mockResolvedValueOnce(finalizedAttempt);
      prismaMock.attempt.findMany.mockResolvedValueOnce([finalizedAttempt]);
      prismaMock.auditLog.findFirst.mockResolvedValueOnce(null);

      // Act: Sending { id: '...' } instead of { attemptId: '...' }
      const result = await service.submitQuiz(mockQuiz.id, mockUser, {
        id: 'attempt-with-id-prop',
        answers: [],
      } as any);

      expect(result.status).toBe(AttemptStatus.PASSED);
      expect(result.attemptId).toBe('attempt-with-id-prop');
    });

    it('handles race condition when two submissions occur concurrently in parallel', async () => {
      const activeAttempt = {
        id: 'attempt-concurrent-1',
        quizId: mockQuiz.id,
        attemptNumber: 1,
        status: AttemptStatus.IN_PROGRESS,
        enrolment: mockEnrolment,
        enrolmentId: mockEnrolment.id,
        quiz: mockQuiz,
        answers: [
          {
            id: 'ans-c1',
            questionId: 'q-single-choice-1',
            question: mockQuestions[0],
          },
        ],
      };

      // Outer findUnique sees IN_PROGRESS
      prismaMock.attempt.findUnique
        .mockResolvedValueOnce(activeAttempt)
        // Inside transaction: check shows already finalized by another request
        .mockResolvedValueOnce({
          status: AttemptStatus.PASSED,
          score: 100,
          passed: true,
          completedAt: new Date(),
        });

      // findUniqueOrThrow returns finalized row
      prismaMock.attempt.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'attempt-concurrent-1',
        attemptNumber: 1,
        score: 100,
        passed: true,
        status: AttemptStatus.PASSED,
        completedAt: new Date(),
      });

      prismaMock.attempt.findMany.mockResolvedValueOnce([activeAttempt]);
      prismaMock.auditLog.findFirst.mockResolvedValueOnce(null);

      const result = await service.submitQuiz(mockQuiz.id, mockUser, {
        attemptId: 'attempt-concurrent-1',
        answers: [
          {
            questionId: 'q-single-choice-1',
            optionId: 'opt-rgb-correct',
          },
        ],
      });

      expect(result.status).toBe(AttemptStatus.PASSED);
      expect(result.passed).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. COMPREHENSIVE END-TO-END GRADING & PROGRESSION
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Full Multi-Question Type Scoring Engine', () => {
    it('correctly scores combination of single-choice, multi-select, and written reflection', async () => {
      const inProgressAttempt = {
        id: 'attempt-all-types',
        quizId: mockQuiz.id,
        attemptNumber: 1,
        status: AttemptStatus.IN_PROGRESS,
        enrolment: mockEnrolment,
        enrolmentId: mockEnrolment.id,
        quiz: mockQuiz,
        answers: [
          { id: 'ans-1', questionId: 'q-single-choice-1', question: mockQuestions[0] },
          { id: 'ans-2', questionId: 'q-multi-select-2', question: mockQuestions[1] },
          { id: 'ans-3', questionId: 'q-written-3', question: mockQuestions[2] },
        ],
      };

      prismaMock.attempt.findUnique
        .mockResolvedValueOnce(inProgressAttempt)
        .mockResolvedValueOnce({ status: AttemptStatus.IN_PROGRESS });

      prismaMock.attempt.update.mockResolvedValueOnce({
        id: 'attempt-all-types',
        score: 100,
        passed: true,
        status: AttemptStatus.PASSED,
        completedAt: new Date(),
      });

      prismaMock.attempt.findMany.mockResolvedValueOnce([inProgressAttempt]);
      prismaMock.auditLog.findFirst.mockResolvedValueOnce(null);

      const result = await service.submitQuiz(mockQuiz.id, mockUser, {
        attemptId: 'attempt-all-types',
        answers: [
          {
            questionId: 'q-single-choice-1',
            selectedOptionId: 'opt-rgb-correct',
          },
          {
            questionId: 'q-multi-select-2',
            selectedOptionIds: ['opt-ms-red', 'opt-ms-green', 'opt-ms-blue'],
          },
          {
            questionId: 'q-written-3',
            textAnswer: 'Color theory provides vital psychological cues for UX navigation and accessibility.',
          },
        ],
      });

      expect(result.status).toBe(AttemptStatus.PASSED);
      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
      expect(result.correctCount).toBe(3);

      // Progression evaluated on pass
      expect(progressionMock.evaluateProgression).toHaveBeenCalledWith(
        mockEnrolment,
        expect.objectContaining({ persist: true, forceRecalculate: true }),
      );
      // Cache invalidated
      expect(cacheHelperMock.invalidateNamespace).toHaveBeenCalledWith(
        `auth_user:${mockUser.id}`,
      );
    });

    it('correctly handles failing score, sets FAILED status, and returns retry guidance', async () => {
      const inProgressAttempt = {
        id: 'attempt-fail',
        quizId: mockQuiz.id,
        attemptNumber: 1,
        status: AttemptStatus.IN_PROGRESS,
        enrolment: mockEnrolment,
        enrolmentId: mockEnrolment.id,
        quiz: mockQuiz,
        answers: [
          { id: 'ans-1', questionId: 'q-single-choice-1', question: mockQuestions[0] },
        ],
      };

      prismaMock.attempt.findUnique
        .mockResolvedValueOnce(inProgressAttempt)
        .mockResolvedValueOnce({ status: AttemptStatus.IN_PROGRESS });

      prismaMock.attempt.update.mockResolvedValueOnce({
        id: 'attempt-fail',
        score: 0,
        passed: false,
        status: AttemptStatus.FAILED,
        completedAt: new Date(),
      });

      prismaMock.attempt.findMany.mockResolvedValueOnce([
        { ...inProgressAttempt, status: AttemptStatus.FAILED, attemptNumber: 1, createdAt: new Date() },
      ]);
      prismaMock.auditLog.findFirst.mockResolvedValueOnce(null);

      const result = await service.submitQuiz(mockQuiz.id, mockUser, {
        attemptId: 'attempt-fail',
        answers: [
          {
            questionId: 'q-single-choice-1',
            selectedOptionId: 'opt-red', // Incorrect option
          },
        ],
      });

      expect(result.status).toBe(AttemptStatus.FAILED);
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
      expect(result.retryGuidance).toBe(mockQuiz.retryGuidance);
      expect(result.attemptsRemaining).toBe(2);
      expect(progressionMock.evaluateProgression).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. ZERO-TRUST SECURITY & AUTHORIZATION
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Zero-Trust Security & Ownership Validation', () => {
    it('strictly forbids a learner from submitting an attempt owned by another user', async () => {
      prismaMock.attempt.findUnique.mockResolvedValueOnce({
        id: 'attempt-stolen',
        quizId: mockQuiz.id,
        status: AttemptStatus.IN_PROGRESS,
        enrolment: { ...mockEnrolment, userId: 'other-hacker-user' },
        answers: [],
      });

      await expect(
        service.submitQuiz(mockQuiz.id, mockUser, {
          attemptId: 'attempt-stolen',
          answers: [],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects submission when attempt belongs to a different quiz', async () => {
      prismaMock.attempt.findUnique.mockResolvedValueOnce({
        id: 'attempt-wrong-quiz',
        quizId: 'quiz-step-2',
        status: AttemptStatus.IN_PROGRESS,
        enrolment: mockEnrolment,
        answers: [],
      });

      await expect(
        service.submitQuiz(mockQuiz.id, mockUser, {
          attemptId: 'attempt-wrong-quiz',
          answers: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects answer containing an option not belonging to the question', async () => {
      const inProgressAttempt = {
        id: 'attempt-injected-option',
        quizId: mockQuiz.id,
        status: AttemptStatus.IN_PROGRESS,
        enrolment: mockEnrolment,
        answers: [
          { id: 'ans-1', questionId: 'q-single-choice-1', question: mockQuestions[0] },
        ],
      };

      prismaMock.attempt.findUnique.mockResolvedValueOnce(inProgressAttempt);

      await expect(
        service.submitQuiz(mockQuiz.id, mockUser, {
          attemptId: 'attempt-injected-option',
          answers: [
            {
              questionId: 'q-single-choice-1',
              selectedOptionId: 'foreign-injected-option-id',
            },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
