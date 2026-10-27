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
} from '@prisma/client';
import { ExamsService } from './exams.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CacheHelperService } from '../../common/cache/cache-helper.service.js';
import { ProgressionService } from '../progression/progression.service.js';

describe('D1-038: ExamsService - Comprehensive 50-Question Final Exam', () => {
  let service: ExamsService;
  let prismaMock: any;
  let cacheHelperMock: any;
  let progressionServiceMock: any;

  const mockLearner = {
    id: 'learner-1',
    sub: 'learner-1',
    role: Role.USER,
  };

  const mockAdmin = {
    id: 'admin-1',
    sub: 'admin-1',
    role: Role.ADMIN,
  };

  const mockManager = {
    id: 'manager-1',
    sub: 'manager-1',
    role: Role.MANAGER,
  };

  const mockExam = {
    id: 'exam-final-1',
    programId: 'prog-1',
    title: '11 Steps to U Final Comprehensive Written Exam',
    description: 'Final certification examination testing all 11 steps.',
    questionCount: 50,
    passMark: 75,
    timeLimitMin: 90,
    shuffleQuestions: true,
    maxAttempts: 3,
    cooldownHours: 24,
    retryGuidance: 'Please review the highlighted step before your next attempt.',
    status: ContentStatus.PUBLISHED,
    program: {
      id: 'prog-1',
      title: '11 Steps to U',
      steps: Array.from({ length: 11 }, (_, i) => ({
        id: `step-${i + 1}`,
        sequence: i + 1,
        title: `Step ${i + 1}`,
      })),
    },
  };

  const mockEnrolment = {
    id: 'enrolment-1',
    userId: 'learner-1',
    programId: 'prog-1',
    batchId: 'batch-1',
    status: EnrolmentStatus.ACTIVE,
    batch: {
      id: 'batch-1',
      managerId: 'manager-1',
      trainers: [{ trainerId: 'manager-1' }],
    },
  };

  // Helper to generate 60 test questions distributed across steps
  const generateQuestions = (count = 60) =>
    Array.from({ length: count }, (_, i) => {
      const stepIndex = (i % 11) + 1;
      return {
        id: `q-exam-${i + 1}`,
        text: `Question ${i + 1} on Step ${stepIndex}`,
        type: 'MULTIPLE_CHOICE',
        points: 1,
        stepId: `step-${stepIndex}`,
        step: {
          id: `step-${stepIndex}`,
          sequence: stepIndex,
          title: `Step ${stepIndex}`,
        },
        options: [
          { id: `opt-${i + 1}-1`, text: 'Option A (Correct)', order: 1, isCorrect: true },
          { id: `opt-${i + 1}-2`, text: 'Option B', order: 2, isCorrect: false },
          { id: `opt-${i + 1}-3`, text: 'Option C', order: 3, isCorrect: false },
          { id: `opt-${i + 1}-4`, text: 'Option D', order: 4, isCorrect: false },
        ],
      };
    });

  beforeEach(() => {
    prismaMock = {
      exam: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
      },
      examAttempt: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      enrolment: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
      questionBank: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      question: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
      },
      option: {
        deleteMany: vi.fn().mockResolvedValue({ count: 4 }),
      },
      batch: {
        findUnique: vi.fn(),
      },
      auditLog: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      },
      $transaction: vi.fn(async (cb: any) => cb(prismaMock)),
    };

    cacheHelperMock = {
      del: vi.fn().mockResolvedValue(true),
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(true),
    };

    progressionServiceMock = {
      getEnrolmentProgression: vi.fn().mockResolvedValue({
        enrolmentId: 'enrolment-1',
        steps: Array.from({ length: 11 }, (_, i) => ({
          stepId: `step-${i + 1}`,
          sequence: i + 1,
          isCompleted: true,
        })),
      }),
    };

    service = new ExamsService(
      prismaMock as unknown as PrismaService,
      cacheHelperMock as unknown as CacheHelperService,
      progressionServiceMock as unknown as ProgressionService,
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. EXAM CONFIGURATION
  // ─────────────────────────────────────────────────────────────────────────────

  describe('1. Exam Configuration', () => {
    it('retrieves exam configuration for a valid program', async () => {
      prismaMock.exam.findFirst.mockResolvedValueOnce(mockExam);

      const result = await service.getExamConfig('prog-1', mockLearner);
      expect(result).toBeDefined();
      expect(result.id).toBe('exam-final-1');
      expect(result.questionCount).toBe(50);
      expect(result.passMark).toBe(75);
      expect(result.timeLimitMin).toBe(90);
    });

    it('throws NotFoundException if program has no final exam', async () => {
      prismaMock.exam.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.getExamConfig('non-existent-program', mockLearner),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. PREREQUISITES & STARTING ATTEMPTS
  // ─────────────────────────────────────────────────────────────────────────────

  describe('2. Prerequisites & Starting Attempts', () => {
    it('rejects with BadRequestException if learner enrolment is not ACTIVE', async () => {
      prismaMock.exam.findUnique.mockResolvedValueOnce(mockExam);
      prismaMock.enrolment.findFirst.mockResolvedValueOnce({
        ...mockEnrolment,
        status: EnrolmentStatus.PENDING_PAYMENT,
      });

      await expect(
        service.startExam('exam-final-1', mockLearner),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects with BadRequestException if any program step is not completed', async () => {
      prismaMock.exam.findUnique.mockResolvedValueOnce(mockExam);
      prismaMock.enrolment.findFirst.mockResolvedValueOnce(mockEnrolment);

      progressionServiceMock.getEnrolmentProgression.mockResolvedValueOnce({
        enrolmentId: 'enrolment-1',
        steps: [
          { stepId: 'step-1', isCompleted: true },
          { stepId: 'step-2', isCompleted: false }, // Incomplete!
        ],
      });

      await expect(
        service.startExam('exam-final-1', mockLearner),
      ).rejects.toThrow(BadRequestException);
    });

    it('resumes existing IN_PROGRESS attempt without consuming an attempt or sampling a new paper', async () => {
      prismaMock.exam.findUnique.mockResolvedValueOnce(mockExam);
      prismaMock.enrolment.findFirst.mockResolvedValueOnce(mockEnrolment);

      const existingAttempt = {
        id: 'attempt-active-1',
        enrolmentId: 'enrolment-1',
        examId: 'exam-final-1',
        attemptNumber: 1,
        status: AttemptStatus.IN_PROGRESS,
        startedAt: new Date(),
        answers: {
          boundQuestions: [
            {
              id: 'q-1',
              text: 'Active question 1',
              points: 1,
              options: [
                { id: 'opt-1-1', text: 'Option A', order: 1 },
                { id: 'opt-1-2', text: 'Option B', order: 2 },
              ],
            },
          ],
          boundQuestionIds: ['q-1'],
        },
      };

      prismaMock.examAttempt.findFirst.mockResolvedValueOnce(existingAttempt);

      const result = await service.startExam('exam-final-1', mockLearner);
      expect(result.attemptId).toBe('attempt-active-1');
      expect(result.status).toBe(AttemptStatus.IN_PROGRESS);
      expect(prismaMock.examAttempt.create).not.toHaveBeenCalled();
    });

    it('rejects with BadRequestException if question pool has fewer than 50 questions', async () => {
      prismaMock.exam.findUnique.mockResolvedValueOnce(mockExam);
      prismaMock.enrolment.findFirst.mockResolvedValueOnce(mockEnrolment);
      prismaMock.examAttempt.findFirst.mockResolvedValueOnce(null); // No active attempt
      prismaMock.examAttempt.findMany.mockResolvedValueOnce([]); // No previous attempts

      // Only 30 questions available (insufficient for 50-question requirement)
      prismaMock.question.findMany.mockResolvedValueOnce(generateQuestions(30));

      await expect(
        service.startExam('exam-final-1', mockLearner),
      ).rejects.toThrow(BadRequestException);
    });

    it('samples exactly 50 distinct questions and initializes attempt', async () => {
      prismaMock.exam.findUnique.mockResolvedValueOnce(mockExam);
      prismaMock.enrolment.findFirst.mockResolvedValueOnce(mockEnrolment);
      prismaMock.examAttempt.findFirst.mockResolvedValueOnce(null);
      prismaMock.examAttempt.findMany.mockResolvedValueOnce([]);

      const questions60 = generateQuestions(60);
      prismaMock.question.findMany.mockResolvedValueOnce(questions60);

      prismaMock.examAttempt.create.mockImplementationOnce(({ data }: any) => ({
        ...data,
      }));

      const result = await service.startExam('exam-final-1', mockLearner);

      expect(result).toBeDefined();
      expect(result.questionCount).toBe(50);
      expect(result.questions).toHaveLength(50);
      expect(result.status).toBe(AttemptStatus.IN_PROGRESS);
      expect(result.expiresAt).toBeDefined();

      // Ensure Option.isCorrect is completely stripped
      for (const q of result.questions) {
        for (const opt of q.options) {
          expect(opt).not.toHaveProperty('isCorrect');
        }
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. DETERMINISTIC OPTION SHUFFLING
  // ─────────────────────────────────────────────────────────────────────────────

  describe('3. Deterministic Option Shuffling', () => {
    it('produces identical option ordering on repeated reads for the same attempt', async () => {
      prismaMock.exam.findUnique.mockResolvedValue(mockExam);
      prismaMock.enrolment.findFirst.mockResolvedValue(mockEnrolment);

      const fixedAttempt = {
        id: 'attempt-deterministic-uuid',
        enrolmentId: 'enrolment-1',
        examId: 'exam-final-1',
        attemptNumber: 1,
        status: AttemptStatus.IN_PROGRESS,
        startedAt: new Date(),
        answers: {
          boundQuestions: [
            {
              id: 'q-det-1',
              text: 'Deterministic Q1',
              options: [
                { id: 'opt-1', text: 'Option 1', order: 1 },
                { id: 'opt-2', text: 'Option 2', order: 2 },
                { id: 'opt-3', text: 'Option 3', order: 3 },
                { id: 'opt-4', text: 'Option 4', order: 4 },
              ],
            },
          ],
        },
      };

      prismaMock.examAttempt.findFirst.mockResolvedValue(fixedAttempt);

      const read1 = (await service.getActiveAttempt('exam-final-1', mockLearner)) as any;
      const read2 = (await service.getActiveAttempt('exam-final-1', mockLearner)) as any;

      const order1 = read1.questions[0].options.map((o: any) => o.id);
      const order2 = read2.questions[0].options.map((o: any) => o.id);

      expect(order1).toEqual(order2);
    });

    it('produces different option ordering across different attempt IDs', async () => {
      const makeAttempt = (id: string) => ({
        id,
        enrolmentId: 'enrolment-1',
        examId: 'exam-final-1',
        attemptNumber: 1,
        status: AttemptStatus.IN_PROGRESS,
        startedAt: new Date(),
        answers: {
          boundQuestions: [
            {
              id: 'q-det-1',
              text: 'Deterministic Q1',
              options: [
                { id: 'opt-1', text: 'A', order: 1 },
                { id: 'opt-2', text: 'B', order: 2 },
                { id: 'opt-3', text: 'C', order: 3 },
                { id: 'opt-4', text: 'D', order: 4 },
                { id: 'opt-5', text: 'E', order: 5 },
              ],
            },
          ],
        },
      });

      prismaMock.exam.findUnique.mockResolvedValue(mockExam);
      prismaMock.enrolment.findFirst.mockResolvedValue(mockEnrolment);

      prismaMock.examAttempt.findFirst.mockResolvedValueOnce(makeAttempt('attempt-aaa'));
      const readA = (await service.getActiveAttempt('exam-final-1', mockLearner)) as any;

      prismaMock.examAttempt.findFirst.mockResolvedValueOnce(makeAttempt('attempt-zzz'));
      const readB = (await service.getActiveAttempt('exam-final-1', mockLearner)) as any;

      const orderA = readA.questions[0].options.map((o: any) => o.id);
      const orderB = readB.questions[0].options.map((o: any) => o.id);

      expect(orderA).not.toEqual(orderB);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. SUBMISSION, TIMED EXECUTION & SCORING
  // ─────────────────────────────────────────────────────────────────────────────

  describe('4. Submission, Timed Execution & Scoring', () => {
    it('rejects submission with BadRequestException when elapsed time exceeds 90 min + grace period', async () => {
      prismaMock.exam.findUnique.mockResolvedValueOnce(mockExam);
      prismaMock.enrolment.findFirst.mockResolvedValueOnce(mockEnrolment);

      // Attempt started 100 minutes ago (exceeds 90 min + 2 min grace)
      const expiredStartedAt = new Date(Date.now() - 100 * 60 * 1000);
      prismaMock.examAttempt.findFirst.mockResolvedValueOnce({
        id: 'attempt-expired',
        enrolmentId: 'enrolment-1',
        examId: 'exam-final-1',
        status: AttemptStatus.IN_PROGRESS,
        startedAt: expiredStartedAt,
        answers: { boundQuestions: [], boundQuestionIds: [] },
      });

      await expect(
        service.submitExam('exam-final-1', { answers: [] }, mockLearner),
      ).rejects.toThrow(BadRequestException);

      expect(prismaMock.examAttempt.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'attempt-expired' },
          data: expect.objectContaining({
            score: 0,
            passed: false,
            status: AttemptStatus.FAILED,
          }),
        }),
      );
    });

    it('rejects submission containing unknown question ID not bound to this attempt', async () => {
      prismaMock.exam.findUnique.mockResolvedValueOnce(mockExam);
      prismaMock.enrolment.findFirst.mockResolvedValueOnce(mockEnrolment);

      prismaMock.examAttempt.findFirst.mockResolvedValueOnce({
        id: 'attempt-1',
        enrolmentId: 'enrolment-1',
        examId: 'exam-final-1',
        status: AttemptStatus.IN_PROGRESS,
        startedAt: new Date(),
        answers: {
          boundQuestions: [{ id: 'q-bound-1' }],
          boundQuestionIds: ['q-bound-1'],
        },
      });

      await expect(
        service.submitExam(
          'exam-final-1',
          {
            answers: [
              { questionId: 'q-foreign-999', selectedOptionId: 'opt-x' },
            ],
          },
          mockLearner,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('evaluates passing score (>= 75%) and records PASSED status', async () => {
      prismaMock.exam.findUnique.mockResolvedValueOnce(mockExam);
      prismaMock.enrolment.findFirst.mockResolvedValueOnce(mockEnrolment);

      const boundQuestions = Array.from({ length: 4 }, (_, i) => ({
        id: `q-sub-${i + 1}`,
        points: 1,
      }));

      prismaMock.examAttempt.findFirst.mockResolvedValueOnce({
        id: 'attempt-1',
        attemptNumber: 1,
        enrolmentId: 'enrolment-1',
        examId: 'exam-final-1',
        status: AttemptStatus.IN_PROGRESS,
        startedAt: new Date(),
        answers: {
          boundQuestions,
          boundQuestionIds: boundQuestions.map((q) => q.id),
        },
      });

      prismaMock.examAttempt.findUnique.mockResolvedValueOnce({
        id: 'attempt-1',
        status: AttemptStatus.IN_PROGRESS,
      });

      // DB authoritative questions
      prismaMock.question.findMany.mockResolvedValueOnce(
        boundQuestions.map((q) => ({
          ...q,
          options: [
            { id: `${q.id}-opt-correct`, isCorrect: true },
            { id: `${q.id}-opt-wrong`, isCorrect: false },
          ],
        })),
      );

      // 4 out of 4 correct = 100% (>= 75%)
      const answers = boundQuestions.map((q) => ({
        questionId: q.id,
        selectedOptionId: `${q.id}-opt-correct`,
      }));

      const result = await service.submitExam(
        'exam-final-1',
        { answers },
        mockLearner,
      );

      expect(result.score).toBe(100);
      expect(result.passed).toBe(true);
      expect(result.status).toBe(AttemptStatus.PASSED);
      expect(result.isCooldownActive).toBe(false);
      expect(result.stepToRevisit).toBeNull();
    });

    it('evaluates failing score (< 75%), triggers 24h cooldown, and identifies stepToRevisit', async () => {
      prismaMock.exam.findUnique.mockResolvedValueOnce(mockExam);
      prismaMock.enrolment.findFirst.mockResolvedValueOnce(mockEnrolment);

      // 4 questions from different steps: 3 misses from Step 4
      const boundQuestions = [
        { id: 'q-1', points: 1, stepId: 'step-4' },
        { id: 'q-2', points: 1, stepId: 'step-4' },
        { id: 'q-3', points: 1, stepId: 'step-4' },
        { id: 'q-4', points: 1, stepId: 'step-1' },
      ];

      prismaMock.examAttempt.findFirst.mockResolvedValueOnce({
        id: 'attempt-1',
        attemptNumber: 1,
        enrolmentId: 'enrolment-1',
        examId: 'exam-final-1',
        status: AttemptStatus.IN_PROGRESS,
        startedAt: new Date(),
        answers: {
          boundQuestions,
          boundQuestionIds: boundQuestions.map((q) => q.id),
        },
      });

      prismaMock.examAttempt.findUnique.mockResolvedValueOnce({
        id: 'attempt-1',
        status: AttemptStatus.IN_PROGRESS,
      });

      prismaMock.question.findMany.mockResolvedValueOnce([
        {
          id: 'q-1',
          points: 1,
          step: { id: 'step-4', sequence: 4, title: 'Step 4' },
          options: [{ id: 'q-1-opt-corr', isCorrect: true }],
        },
        {
          id: 'q-2',
          points: 1,
          step: { id: 'step-4', sequence: 4, title: 'Step 4' },
          options: [{ id: 'q-2-opt-corr', isCorrect: true }],
        },
        {
          id: 'q-3',
          points: 1,
          step: { id: 'step-4', sequence: 4, title: 'Step 4' },
          options: [{ id: 'q-3-opt-corr', isCorrect: true }],
        },
        {
          id: 'q-4',
          points: 1,
          step: { id: 'step-1', sequence: 1, title: 'Step 1' },
          options: [{ id: 'q-4-opt-corr', isCorrect: true }],
        },
      ]);

      // All answers wrong: 0% score
      const answers = [
        { questionId: 'q-1', selectedOptionId: 'wrong-opt' },
        { questionId: 'q-2', selectedOptionId: 'wrong-opt' },
        { questionId: 'q-3', selectedOptionId: 'wrong-opt' },
        { questionId: 'q-4', selectedOptionId: 'wrong-opt' },
      ];

      const result = await service.submitExam(
        'exam-final-1',
        { answers },
        mockLearner,
      );

      expect(result.score).toBe(0);
      expect(result.passed).toBe(false);
      expect(result.status).toBe(AttemptStatus.FAILED);
      expect(result.isCooldownActive).toBe(true);
      expect(result.cooldownSecondsRemaining).toBe(24 * 3600);
      expect(result.canRetry).toBe(false);

      // Step 4 has 3 misses (highest)
      expect(result.stepToRevisit).toEqual({
        id: 'step-4',
        sequence: 4,
        title: 'Step 4',
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. RETRY THROTTLING, COOLDOWN & RESET
  // ─────────────────────────────────────────────────────────────────────────────

  describe('5. Retry Throttling, Cooldown & Reset', () => {
    it('blocks startExam during active 24h cooldown with structured 403 payload', async () => {
      prismaMock.exam.findUnique.mockResolvedValueOnce(mockExam);
      prismaMock.enrolment.findFirst.mockResolvedValueOnce(mockEnrolment);
      prismaMock.examAttempt.findFirst.mockResolvedValueOnce(null);

      // Completed 2 hours ago (within 24h cooldown)
      const failed2HoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      prismaMock.examAttempt.findMany.mockResolvedValueOnce([
        {
          id: 'attempt-prev-1',
          attemptNumber: 1,
          status: AttemptStatus.FAILED,
          completedAt: failed2HoursAgo,
          createdAt: failed2HoursAgo,
          answers: {
            stepToRevisit: { id: 'step-4', sequence: 4, title: 'Step 4' },
          },
        },
      ]);

      try {
        await service.startExam('exam-final-1', mockLearner);
        expect.unreachable('Should have thrown ForbiddenException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ForbiddenException);
        const resp = err.getResponse();
        expect(resp.isCooldownActive).toBe(true);
        expect(resp.canRetry).toBe(false);
        expect(resp.cooldownSecondsRemaining).toBeGreaterThan(0);
        expect(resp.stepToRevisit).toEqual({
          id: 'step-4',
          sequence: 4,
          title: 'Step 4',
        });
      }
    });

    it('blocks startExam when maxAttempts (3) is reached', async () => {
      prismaMock.exam.findUnique.mockResolvedValueOnce(mockExam);
      prismaMock.enrolment.findFirst.mockResolvedValueOnce(mockEnrolment);
      prismaMock.examAttempt.findFirst.mockResolvedValueOnce(null);

      // 3 previous failed attempts
      const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
      prismaMock.examAttempt.findMany.mockResolvedValueOnce([
        { id: 'att-3', attemptNumber: 3, status: AttemptStatus.FAILED, createdAt: oldDate },
        { id: 'att-2', attemptNumber: 2, status: AttemptStatus.FAILED, createdAt: oldDate },
        { id: 'att-1', attemptNumber: 1, status: AttemptStatus.FAILED, createdAt: oldDate },
      ]);

      try {
        await service.startExam('exam-final-1', mockLearner);
        expect.unreachable('Should have thrown ForbiddenException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ForbiddenException);
        const resp = err.getResponse();
        expect(resp.attemptsUsed).toBe(3);
        expect(resp.attemptsRemaining).toBe(0);
        expect(resp.canRetry).toBe(false);
      }
    });

    it('allows Admin to reset attempts with reason and creates AuditLog entry', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValueOnce(mockEnrolment);
      prismaMock.exam.findUnique.mockResolvedValueOnce(mockExam);

      const result = await service.resetExamAttempts(
        'exam-final-1',
        'enrolment-1',
        { reason: 'Approved medical extension for retake' },
        mockAdmin,
        '127.0.0.1',
      );

      expect(result.success).toBe(true);
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'EXAM_ATTEMPTS_RESET',
          entity: 'ExamAttempt',
          entityId: 'enrolment-1_exam-final-1',
          meta: expect.objectContaining({
            reason: 'Approved medical extension for retake',
          }),
        }),
      });
    });

    it('blocks Manager from resetting attempts for a learner in an unassigned batch', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValueOnce({
        ...mockEnrolment,
        batchId: 'batch-unassigned-99',
      });

      // Manager is NOT assigned to batch-unassigned-99
      prismaMock.batch.findUnique.mockResolvedValueOnce({
        id: 'batch-unassigned-99',
        managerId: 'other-manager',
        trainers: [],
      });

      await expect(
        service.resetExamAttempts(
          'exam-final-1',
          'enrolment-1',
          { reason: 'Unauthorized reset' },
          mockManager,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. REAL-WORLD SECURITY, SCALE & HIGH-CONCURRENCY SCENARIOS
  // ═══════════════════════════════════════════════════════════════════════════
  describe('6. Real-World Security, Scale & High-Concurrency Scenarios', () => {
    it('blocks learners (Role.USER) from reading or mutating the 70-question pool & answer keys', async () => {
      await expect(
        service.getProgramExamQuestions('prog-1', mockLearner),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.getExamQuestions('exam-final-1', mockLearner),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.createExamQuestion(
          'exam-final-1',
          { text: 'Injected question?' },
          mockLearner,
        ),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.bulkCreateExamQuestions(
          'exam-final-1',
          [{ text: 'Injected bulk question?' }],
          mockLearner,
        ),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.updateExamQuestion(
          'exam-final-1',
          'q-exam-1',
          { text: 'Tampered prompt' },
          mockLearner,
        ),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.deleteExamQuestion('exam-final-1', 'q-exam-1', mockLearner),
      ).rejects.toThrow(ForbiddenException);
    });

    it('blocks cross-bank IDOR tampering when updating or deleting a question from another question bank', async () => {
      prismaMock.exam.findUnique.mockResolvedValue(mockExam);
      prismaMock.questionBank.findFirst.mockResolvedValue({
        id: 'bank-exam-1',
        examId: 'exam-final-1',
        programId: 'prog-1',
      });

      // Question belongs to a completely different question bank
      prismaMock.question.findUnique.mockResolvedValue({
        id: 'q-foreign-99',
        questionBankId: 'bank-other-program-99',
        text: 'Foreign question',
        type: 'MULTIPLE_CHOICE',
        points: 1,
        options: [],
      });

      await expect(
        service.updateExamQuestion(
          'exam-final-1',
          'q-foreign-99',
          { text: 'Overwritten via IDOR' },
          mockAdmin,
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.deleteExamQuestion('exam-final-1', 'q-foreign-99', mockAdmin),
      ).rejects.toThrow(BadRequestException);
    });

    it('enforces bulk DoS cap (<= 100 questions) and rejects unsolvable objective questions (no correct option or < 2 options)', async () => {
      const oversizedBatch = Array.from({ length: 101 }, (_, i) => ({
        text: `Question ${i + 1}`,
      }));

      await expect(
        service.bulkCreateExamQuestions('exam-final-1', oversizedBatch, mockAdmin),
      ).rejects.toThrow(BadRequestException);

      prismaMock.exam.findUnique.mockResolvedValue(mockExam);
      prismaMock.questionBank.findFirst.mockResolvedValue({
        id: 'bank-exam-1',
        examId: 'exam-final-1',
        programId: 'prog-1',
      });

      // Reject < 2 options
      await expect(
        service.createExamQuestion(
          'exam-final-1',
          {
            text: 'Single option question?',
            type: 'MULTIPLE_CHOICE',
            options: [{ text: 'Only A', isCorrect: true }],
          },
          mockAdmin,
        ),
      ).rejects.toThrow(BadRequestException);

      // Reject 0 correct options
      await expect(
        service.createExamQuestion(
          'exam-final-1',
          {
            text: 'Unsolvable question with no correct answer?',
            type: 'MULTIPLE_CHOICE',
            options: [
              { text: 'Wrong A', isCorrect: false },
              { text: 'Wrong B', isCorrect: false },
            ],
          },
          mockAdmin,
        ),
      ).rejects.toThrow(BadRequestException);

      // Ensure updateExamQuestion validates options BEFORE deleting existing options
      prismaMock.question.findUnique.mockResolvedValue({
        id: 'q-exam-1',
        questionBankId: 'bank-exam-1',
        text: 'Valid question',
        type: 'MULTIPLE_CHOICE',
        points: 1,
        options: [],
      });

      await expect(
        service.updateExamQuestion(
          'exam-final-1',
          'q-exam-1',
          {
            options: [
              { text: 'Wrong A', isCorrect: false },
              { text: 'Wrong B', isCorrect: false },
            ],
          },
          mockAdmin,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(prismaMock.option.deleteMany).not.toHaveBeenCalled();
    });

    it('samples 50 shuffled questions from a 70-question dedicated pool and strips isCorrect from client payload', async () => {
      const poolOf70 = generateQuestions(70);
      prismaMock.exam.findUnique.mockResolvedValueOnce(mockExam);
      prismaMock.enrolment.findFirst.mockResolvedValueOnce(mockEnrolment);
      prismaMock.examAttempt.findMany.mockResolvedValueOnce([]);
      prismaMock.questionBank.findFirst.mockResolvedValueOnce({
        id: 'bank-dedicated-70',
        examId: 'exam-final-1',
      });
      prismaMock.question.findMany.mockResolvedValueOnce(poolOf70);

      prismaMock.examAttempt.create.mockImplementationOnce(async ({ data }: any) => ({
        id: 'attempt-70-pool',
        ...data,
        startedAt: new Date(),
      }));

      const res = await service.startExam('exam-final-1', mockLearner);

      expect(res.questionCount).toBe(50);
      expect(res.questions).toHaveLength(50);

      const uniqueIds = new Set(res.questions.map((q: any) => q.id));
      expect(uniqueIds.size).toBe(50);

      for (const q of res.questions) {
        for (const opt of q.options) {
          expect(opt).not.toHaveProperty('isCorrect');
        }
      }
    });

    it('blocks autosave payload tampering when a learner injects a foreign questionId not bound to their attempt', async () => {
      prismaMock.exam.findUnique.mockResolvedValueOnce(mockExam);
      prismaMock.enrolment.findFirst.mockResolvedValueOnce(mockEnrolment);
      prismaMock.examAttempt.findFirst.mockResolvedValueOnce({
        id: 'attempt-active-1',
        enrolmentId: 'enrolment-1',
        examId: 'exam-final-1',
        status: AttemptStatus.IN_PROGRESS,
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        answers: {
          boundQuestionIds: ['q-exam-1', 'q-exam-2'],
        },
      });

      await expect(
        service.saveExamAnswers(
          'exam-final-1',
          {
            answers: [
              { questionId: 'q-exam-1', selectedOptionId: 'opt-1-1' },
              { questionId: 'q-injected-999', selectedOptionId: 'opt-999-1' },
            ],
          },
          mockLearner,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(prismaMock.examAttempt.update).not.toHaveBeenCalled();
    });

    it('accurately grades autosaved answers during finalizeExpiredAttempts() instead of failing with Enrolment not found', async () => {
      const pool = generateQuestions(50);
      const boundQuestions = pool.map((q, idx) => ({
        id: q.id,
        order: idx + 1,
        text: q.text,
        type: q.type,
        points: 1,
        stepId: q.stepId,
        step: q.step,
        options: q.options.map((o) => ({ id: o.id, text: o.text, order: o.order })),
      }));

      // Learner autosaved 45/50 correct answers (90% >= 75% passMark) before timer expired
      const savedAnswers = pool.slice(0, 45).map((q) => ({
        questionId: q.id,
        selectedOptionId: q.options[0].id, // Option A isCorrect: true
      }));

      const expiredAttempt = {
        id: 'attempt-expired-1',
        enrolmentId: 'enrolment-1',
        examId: 'exam-final-1',
        attemptNumber: 1,
        status: AttemptStatus.IN_PROGRESS,
        startedAt: new Date(Date.now() - 100 * 60 * 1000), // 100 mins ago (> 90 min limit)
        expiresAt: new Date(Date.now() - 10 * 60 * 1000),
        answers: {
          boundQuestionIds: pool.map((q) => q.id),
          boundQuestions,
          savedAnswers,
        },
      };

      prismaMock.examAttempt.findMany.mockResolvedValueOnce([expiredAttempt]);
      prismaMock.exam.findUnique.mockResolvedValueOnce(mockExam);
      prismaMock.examAttempt.findFirst.mockResolvedValueOnce(expiredAttempt);
      prismaMock.question.findMany.mockResolvedValueOnce(pool);
      prismaMock.examAttempt.findUnique.mockResolvedValueOnce(expiredAttempt);
      prismaMock.examAttempt.update.mockResolvedValueOnce({
        ...expiredAttempt,
        status: AttemptStatus.PASSED,
        score: 90,
        passed: true,
      });

      const finalizedCount = await service.finalizeExpiredAttempts();

      expect(finalizedCount).toBe(1);
      expect(prismaMock.examAttempt.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'attempt-expired-1' },
          data: expect.objectContaining({
            score: 90,
            passed: true,
            status: AttemptStatus.PASSED,
          }),
        }),
      );
    });

    it('gracefully recovers from P2002 race condition when concurrent startExam calls fire simultaneously', async () => {
      const pool = generateQuestions(60);
      prismaMock.exam.findUnique.mockResolvedValueOnce(mockExam);
      prismaMock.enrolment.findFirst.mockResolvedValueOnce(mockEnrolment);
      prismaMock.examAttempt.findMany.mockResolvedValueOnce([]);
      prismaMock.questionBank.findFirst.mockResolvedValueOnce(null);
      prismaMock.question.findMany.mockResolvedValueOnce(pool);

      // Simulate concurrent insert winning the race and throwing Prisma P2002
      const p2002Error = Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
      });
      prismaMock.examAttempt.create.mockRejectedValueOnce(p2002Error);

      prismaMock.examAttempt.findFirst.mockResolvedValueOnce({
        id: 'attempt-concurrent-winner',
        enrolmentId: 'enrolment-1',
        examId: 'exam-final-1',
        attemptNumber: 1,
        status: AttemptStatus.IN_PROGRESS,
        startedAt: new Date(),
        answers: {
          boundQuestions: pool.slice(0, 50).map((q, idx) => ({
            id: q.id,
            order: idx + 1,
            text: q.text,
            type: q.type,
            points: 1,
            options: q.options.map((o) => ({ id: o.id, text: o.text, order: o.order })),
          })),
        },
      });

      const res = await service.startExam('exam-final-1', mockLearner);
      expect(res.attemptId).toBe('attempt-concurrent-winner');
      expect(res.status).toBe(AttemptStatus.IN_PROGRESS);
      expect(res.questions).toHaveLength(50);
    });
  });
});
