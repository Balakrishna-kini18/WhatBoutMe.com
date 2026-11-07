import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AttemptStatus,
  AttendanceStatus,
  BookingStatus,
  CertificateStatus,
  CertificateType,
  ContentStatus,
  EnrolmentStatus,
  LearnerStage,
  MissionStatementStatus,
  OneOnOneRequestStatus,
  QuestionType,
  Role,
  SessionStatus,
  SessionType,
} from '@prisma/client';
import { StageGateService } from '../src/modules/progression/stage-gate.service.js';
import { ExamsService } from '../src/modules/exams/exams.service.js';
import { OneOnOneService } from '../src/modules/sessions/one-on-one.service.js';
import { MissionStatementsService } from '../src/modules/mission-statements/mission-statements.service.js';
import { CertificateEligibilityService } from '../src/modules/certificates/certificate-eligibility.service.js';
import { CertificatesService } from '../src/modules/certificates/certificates.service.js';

describe('Senior Dev Integration: Complete 5-Stage Certification Lifecycle & Security Pipeline', () => {
  let stageGateService: StageGateService;
  let examsService: ExamsService;
  let oneOnOneService: OneOnOneService;
  let missionStatementsService: MissionStatementsService;
  let eligibilityService: CertificateEligibilityService;
  let certificatesService: CertificatesService;

  let prismaMock: any;
  let complianceServiceMock: any;
  let cacheHelperMock: any;
  let emailServiceMock: any;
  let objectStorageMock: any;
  let certificatesQueueMock: any;
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

  const mockProgram = {
    id: 'prog-1',
    title: '11 Steps to U Professional Masterclass',
    description: 'Transformational 11-step masterclass with Roweena.',
    requireExam: true,
    requireCoaching: true,
    requireMissionStatement: true,
    sequentialProgressionEnabled: true,
    steps: Array.from({ length: 11 }, (_, i) => ({
      id: `step-${i + 1}`,
      sequence: i + 1,
      title: `Step ${i + 1}`,
      status: ContentStatus.PUBLISHED,
      quiz: { id: `quiz-${i + 1}`, passMark: 70 },
      lessons: [{ id: `lesson-${i + 1}` }],
    })),
  };

  let enrolmentState: any;

  // 70-question pool helper generator
  const create70QuestionPool = () =>
    Array.from({ length: 70 }, (_, i) => {
      const stepSeq = (i % 11) + 1;
      return {
        id: `q-${i + 1}`,
        questionBankId: 'bank-dedicated-70',
        text: `Question ${i + 1} for Step ${stepSeq}`,
        type: QuestionType.MULTIPLE_CHOICE,
        points: 1,
        stepId: `step-${stepSeq}`,
        step: { id: `step-${stepSeq}`, sequence: stepSeq, title: `Step ${stepSeq}` },
        options: [
          { id: `opt-${i + 1}-1`, text: 'Option A (Correct)', order: 1, isCorrect: true },
          { id: `opt-${i + 1}-2`, text: 'Option B (Wrong)', order: 2, isCorrect: false },
          { id: `opt-${i + 1}-3`, text: 'Option C (Wrong)', order: 3, isCorrect: false },
          { id: `opt-${i + 1}-4`, text: 'Option D (Wrong)', order: 4, isCorrect: false },
        ],
      };
    });

  beforeEach(() => {
    vi.clearAllMocks();

    enrolmentState = {
      id: 'enrol-1',
      userId: 'learner-1',
      programId: 'prog-1',
      batchId: 'batch-1',
      status: EnrolmentStatus.ACTIVE,
      currentStage: LearnerStage.STAGE_1_CURRICULUM,
      curriculumCompletedAt: null,
      examPassedAt: null,
      attendanceSatisfiedAt: null,
      oneOnOneCompletedAt: null,
      missionStatementApprovedAt: null,
      program: mockProgram,
      batch: { id: 'batch-1', name: 'Cohort Alpha', managerId: 'manager-1' },
      user: { id: 'learner-1', name: 'Learner One', email: 'learner1@example.com' },
      certificate: null,
    };

    const pool70 = create70QuestionPool();

    prismaMock = {
      enrolment: {
        findUnique: vi.fn().mockImplementation(async () => enrolmentState),
        findFirst: vi.fn().mockImplementation(async () => enrolmentState),
        update: vi.fn().mockImplementation(async ({ data }: any) => {
          Object.assign(enrolmentState, data);
          return enrolmentState;
        }),
      },
      step: {
        findMany: vi.fn().mockResolvedValue(mockProgram.steps),
      },
      userLessonProgress: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      attempt: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      stepProgress: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      exam: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'exam-1',
          programId: 'prog-1',
          title: 'Final Comprehensive Exam',
          questionCount: 50,
          passMark: 75,
          timeLimitMin: 90,
          maxAttempts: 3,
          cooldownHours: 24,
          shuffleQuestions: true,
          status: ContentStatus.PUBLISHED,
          program: mockProgram,
        }),
        findFirst: vi.fn().mockResolvedValue({
          id: 'exam-1',
          programId: 'prog-1',
          title: 'Final Comprehensive Exam',
          questionCount: 50,
          passMark: 75,
          timeLimitMin: 90,
          maxAttempts: 3,
          cooldownHours: 24,
          shuffleQuestions: true,
          status: ContentStatus.PUBLISHED,
          program: mockProgram,
        }),
        count: vi.fn().mockResolvedValue(1),
      },
      questionBank: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'bank-dedicated-70',
          examId: 'exam-1',
          programId: 'prog-1',
        }),
        create: vi.fn(),
      },
      question: {
        findMany: vi.fn().mockResolvedValue(pool70),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        count: vi.fn().mockResolvedValue(70),
      },
      examAttempt: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        update: vi.fn(),
      },
      oralAssessment: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      session: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      oneOnOneRequest: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      missionStatementSubmission: {
        findUnique: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        update: vi.fn(),
      },
      certificate: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        update: vi.fn(),
      },
      auditLog: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 'audit-log-1' }),
      },
      $transaction: vi.fn(async (callback: any) => callback(prismaMock)),
    };

    complianceServiceMock = {
      calculateCompliance: vi.fn().mockResolvedValue({
        status: 'COMPLIANT',
        thresholdUsed: 80,
        requiredSessionCount: 10,
        attendedSessionCount: 9,
        attendancePercentage: 90,
      }),
    };

    cacheHelperMock = {
      del: vi.fn().mockResolvedValue(true),
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(true),
    };

    emailServiceMock = {
      sendEmail: vi.fn().mockResolvedValue(true),
      sendTemplateEmail: vi.fn().mockResolvedValue(true),
    };

    objectStorageMock = {
      uploadFile: vi.fn().mockResolvedValue('https://storage.whatboutme.com/mission/scan-1.pdf'),
    };

    certificatesQueueMock = {
      add: vi.fn().mockResolvedValue({ id: 'job-cert-1' }),
    };

    progressionServiceMock = {
      getEnrolmentProgression: vi.fn().mockResolvedValue({
        steps: mockProgram.steps.map((s) => ({ ...s, isCompleted: true })),
      }),
    };

    stageGateService = new StageGateService(prismaMock, complianceServiceMock);
    examsService = new ExamsService(prismaMock, cacheHelperMock, progressionServiceMock);
    oneOnOneService = new OneOnOneService(
      prismaMock,
      stageGateService,
      emailServiceMock,
      null,
      complianceServiceMock,
    );
    eligibilityService = new CertificateEligibilityService(
      prismaMock,
      complianceServiceMock,
      stageGateService,
    );
    certificatesService = new CertificatesService(
      prismaMock,
      eligibilityService,
      certificatesQueueMock,
      objectStorageMock,
      emailServiceMock,
      cacheHelperMock,
    );
    missionStatementsService = new MissionStatementsService(
      prismaMock,
      stageGateService,
      certificatesService,
      emailServiceMock,
      objectStorageMock,
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. INITIAL STAGE GATE GATING (CURRICULUM IN-PROGRESS)
  // ═══════════════════════════════════════════════════════════════════════════
  it('1. Blocks downstream stages (Exam, Coaching, Mission Statement, Certificate) while Step 1..11 are in progress', async () => {
    // Only 4 of 11 steps completed
    prismaMock.userLessonProgress.findMany.mockResolvedValue(
      Array.from({ length: 4 }, (_, i) => ({ lessonId: `lesson-${i + 1}`, viewed: true })),
    );

    const stages = await stageGateService.evaluateStages('enrol-1', mockLearner);

    expect(stages.currentStage).toBe(LearnerStage.STAGE_1_CURRICULUM);
    expect(stages.stages[LearnerStage.STAGE_1_CURRICULUM].isCompleted).toBe(false);
    expect(stages.stages[LearnerStage.STAGE_2_EXAM].isUnlocked).toBe(false);
    expect(stages.stages[LearnerStage.STAGE_4_ONE_ON_ONE].isUnlocked).toBe(false);
    expect(stages.stages[LearnerStage.STAGE_5_MISSION_STATEMENT].isUnlocked).toBe(false);
    expect(stages.allStagesCompleted).toBe(false);

    // Attempting to book 1-on-1 coaching throws 403 Forbidden
    await expect(
      oneOnOneService.createRequest('learner-1', {
        enrolmentId: 'enrol-1',
        topic: 'Early Career Guidance',
        preferredTimes: [new Date().toISOString()],
      } as any),
    ).rejects.toThrow(ForbiddenException);

    // Certificate eligibility confirms INELIGIBLE with reasons
    const eligibility = await eligibilityService.evaluateEligibility('enrol-1');
    expect(eligibility.isEligible).toBe(false);
    expect(eligibility.status).toBe('INELIGIBLE');
    expect(eligibility.unmetRequirements.length).toBeGreaterThan(0);
    expect(
      eligibility.unmetRequirements.some((r) => r.includes('Program steps incomplete')),
    ).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. CURRICULUM COMPLETION UNLOCKS FINAL EXAM (50 MARKS / 70 POOL)
  // ═══════════════════════════════════════════════════════════════════════════
  it('2. Completing all 11 steps satisfies Stage 1 and unlocks Stage 2 Final Exam', async () => {
    // Complete all 11 step lessons and quizzes
    prismaMock.userLessonProgress.findMany.mockResolvedValue(
      Array.from({ length: 11 }, (_, i) => ({ lessonId: `lesson-${i + 1}`, viewed: true })),
    );
    prismaMock.attempt.findMany.mockResolvedValue(
      Array.from({ length: 11 }, (_, i) => ({
        quizId: `quiz-${i + 1}`,
        passed: true,
        status: AttemptStatus.PASSED,
        score: 90,
      })),
    );
    prismaMock.stepProgress.findMany.mockResolvedValue(
      Array.from({ length: 11 }, (_, i) => ({ stepId: `step-${i + 1}`, isCompleted: true })),
    );

    const stages = await stageGateService.evaluateStages('enrol-1', mockLearner);

    expect(stages.stages[LearnerStage.STAGE_1_CURRICULUM].isCompleted).toBe(true);
    expect(stages.stages[LearnerStage.STAGE_2_EXAM].isUnlocked).toBe(true);
    expect(stages.stages[LearnerStage.STAGE_2_EXAM].isCompleted).toBe(false);
    expect(stages.currentStage).toBe(LearnerStage.STAGE_2_EXAM);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. FINAL EXAM: RANDOM SAMPLING FROM 70-QUESTION POOL & ATTEMPT FAILURE COOLDOWN
  // ═══════════════════════════════════════════════════════════════════════════
  it('3. Starts exam by sampling exactly 50 questions from 70 pool without answer leaks; handles failed attempt and cooldown', async () => {
    const pool = create70QuestionPool();
    prismaMock.question.findMany.mockResolvedValue(pool);

    const attemptCreated = {
      id: 'attempt-failing-1',
      enrolmentId: 'enrol-1',
      examId: 'exam-1',
      attemptNumber: 1,
      status: AttemptStatus.IN_PROGRESS,
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 90 * 60 * 1000),
      answers: {
        boundQuestionIds: pool.slice(0, 50).map((q) => q.id),
        boundQuestions: pool.slice(0, 50).map((q, idx) => ({
          id: q.id,
          order: idx + 1,
          text: q.text,
          type: q.type,
          points: 1,
          stepId: q.stepId,
          step: q.step,
          options: q.options.map((o) => ({ id: o.id, text: o.text, order: o.order })),
        })),
      },
    };

    prismaMock.examAttempt.create.mockResolvedValue(attemptCreated);
    prismaMock.examAttempt.findMany.mockResolvedValue([]);

    const session = await examsService.startExam('exam-1', mockLearner);

    expect(session.questionCount).toBe(50);
    expect(session.questions).toHaveLength(50);
    // Anti-leak verification: zero options contain isCorrect
    for (const q of session.questions) {
      for (const opt of q.options) {
        expect(opt).not.toHaveProperty('isCorrect');
      }
    }

    // Learner submits answers with only 25/50 correct (50% < 75% pass mark)
    prismaMock.examAttempt.findFirst.mockResolvedValue(attemptCreated);
    prismaMock.examAttempt.findUnique.mockResolvedValue(attemptCreated);

    const failingAnswers = attemptCreated.answers.boundQuestions.map((q, idx) => ({
      questionId: q.id,
      selectedOptionId: idx < 25 ? `opt-${parseInt(q.id.replace('q-', ''))}-1` : `opt-${parseInt(q.id.replace('q-', ''))}-2`,
    }));

    const result = await examsService.submitExam(
      'exam-1',
      { attemptId: attemptCreated.id, answers: failingAnswers },
      mockLearner,
    );

    expect(result.passed).toBe(false);
    expect(result.score).toBe(50);
    expect(result.status).toBe(AttemptStatus.FAILED);
    expect(result.cooldownSecondsRemaining).toBe(24 * 3600);
    expect(result.stepToRevisit).not.toBeNull();

    // Verify Stage 3 & 4 remain locked on failure
    prismaMock.examAttempt.findMany.mockResolvedValue([{ ...attemptCreated, status: AttemptStatus.FAILED, passed: false }]);
    const stages = await stageGateService.evaluateStages('enrol-1', mockLearner);
    expect(stages.stages[LearnerStage.STAGE_2_EXAM].isCompleted).toBe(false);
    expect(stages.stages[LearnerStage.STAGE_4_ONE_ON_ONE].isUnlocked).toBe(false);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. RETAKE PASS (88%) ADVANCES PROGRESSION & UNLOCKS 1-ON-1 COACHING
  // ═══════════════════════════════════════════════════════════════════════════
  it('4. Retake pass (88% >= 75%) records examPassedAt, advances to Stage 3/4, and unlocks 1-on-1 Coaching', async () => {
    const pool = create70QuestionPool();
    const passedAttempt = {
      id: 'attempt-passing-2',
      enrolmentId: 'enrol-1',
      examId: 'exam-1',
      attemptNumber: 2,
      status: AttemptStatus.IN_PROGRESS,
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 90 * 60 * 1000),
      answers: {
        boundQuestionIds: pool.slice(0, 50).map((q) => q.id),
        boundQuestions: pool.slice(0, 50).map((q, idx) => ({
          id: q.id,
          order: idx + 1,
          text: q.text,
          type: q.type,
          points: 1,
          stepId: q.stepId,
          step: q.step,
          options: q.options.map((o) => ({ id: o.id, text: o.text, order: o.order })),
        })),
      },
    };

    prismaMock.examAttempt.findFirst.mockResolvedValue(passedAttempt);
    prismaMock.examAttempt.findUnique.mockResolvedValue(passedAttempt);

    // 44 of 50 correct answers = 88%
    const passingAnswers = passedAttempt.answers.boundQuestions.map((q, idx) => ({
      questionId: q.id,
      selectedOptionId: idx < 44 ? `opt-${parseInt(q.id.replace('q-', ''))}-1` : `opt-${parseInt(q.id.replace('q-', ''))}-2`,
    }));

    const result = await examsService.submitExam(
      'exam-1',
      { attemptId: passedAttempt.id, answers: passingAnswers },
      mockLearner,
    );

    expect(result.passed).toBe(true);
    expect(result.score).toBe(88);
    expect(result.status).toBe(AttemptStatus.PASSED);

    // Verify enrolment.update was invoked with currentStage STAGE_3_ATTENDANCE
    expect(prismaMock.enrolment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'enrol-1' },
        data: expect.objectContaining({
          currentStage: LearnerStage.STAGE_3_ATTENDANCE,
        }),
      }),
    );

    // Stage 4 (1-on-1 Coaching) is now unlocked!
    enrolmentState.curriculumCompletedAt = new Date();
    prismaMock.userLessonProgress.findMany.mockResolvedValue(
      Array.from({ length: 11 }, (_, i) => ({ lessonId: `lesson-${i + 1}`, viewed: true })),
    );
    prismaMock.attempt.findMany.mockResolvedValue(
      Array.from({ length: 11 }, (_, i) => ({
        quizId: `quiz-${i + 1}`,
        passed: true,
        status: AttemptStatus.PASSED,
        score: 90,
      })),
    );
    prismaMock.stepProgress.findMany.mockResolvedValue(
      Array.from({ length: 11 }, (_, i) => ({ stepId: `step-${i + 1}`, isCompleted: true })),
    );
    prismaMock.examAttempt.findMany.mockResolvedValue([
      { id: 'attempt-passing-2', status: AttemptStatus.PASSED, passed: true, score: 88, completedAt: new Date() },
    ]);

    const stages = await stageGateService.evaluateStages('enrol-1', mockLearner);
    expect(stages.stages[LearnerStage.STAGE_2_EXAM].isCompleted).toBe(true);
    expect(stages.stages[LearnerStage.STAGE_3_ATTENDANCE].isUnlocked).toBe(true);
    expect(stages.stages[LearnerStage.STAGE_4_ONE_ON_ONE].isUnlocked).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. 1-ON-1 COACHING SESSION LIFECYCLE & STAGE 5 UNLOCKING
  // ═══════════════════════════════════════════════════════════════════════════
  it('5. Successfully books and attends 1-on-1 coaching call with Roweena, satisfying Stage 4 and unlocking Stage 5', async () => {
    // Stage 1, 2, 3 satisfied
    enrolmentState.curriculumCompletedAt = new Date();
    enrolmentState.examPassedAt = new Date();
    enrolmentState.attendanceSatisfiedAt = new Date();

    prismaMock.userLessonProgress.findMany.mockResolvedValue(
      Array.from({ length: 11 }, (_, i) => ({ lessonId: `lesson-${i + 1}`, viewed: true })),
    );
    prismaMock.attempt.findMany.mockResolvedValue(
      Array.from({ length: 11 }, (_, i) => ({
        quizId: `quiz-${i + 1}`,
        passed: true,
        status: AttemptStatus.PASSED,
        score: 90,
      })),
    );
    prismaMock.stepProgress.findMany.mockResolvedValue(
      Array.from({ length: 11 }, (_, i) => ({ stepId: `step-${i + 1}`, isCompleted: true })),
    );
    prismaMock.examAttempt.findMany.mockResolvedValue([
      { id: 'attempt-passing-2', status: AttemptStatus.PASSED, passed: true, score: 88, completedAt: new Date() },
    ]);

    prismaMock.oneOnOneRequest.create.mockResolvedValue({
      id: 'req-1',
      enrolmentId: 'enrol-1',
      userId: 'learner-1',
      status: OneOnOneRequestStatus.REQUESTED,
      topic: 'Final Breakthrough Strategy & Mission Alignment',
      preferredTimes: [new Date().toISOString()],
    });

    const start = new Date(Date.now() + 24 * 3600 * 1000);
    const end = new Date(start.getTime() + 30 * 60 * 1000);

    const createdReq = await oneOnOneService.createRequest('learner-1', {
      enrolmentId: 'enrol-1',
      requestedStart: start.toISOString(),
      requestedEnd: end.toISOString(),
      notes: 'Final Breakthrough Strategy & Mission Alignment',
    } as any);

    expect(createdReq.id).toBe('req-1');

    // Simulate session hosted by Roweena and marked ATTENDED
    prismaMock.session.findMany.mockResolvedValue([
      {
        id: 'sess-one-on-one-1',
        title: '1-on-1 Milestone Coaching with Roweena',
        sessionType: SessionType.ONE_ON_ONE_WITH_RO,
        status: SessionStatus.COMPLETED,
        endTime: new Date(),
        bookings: [{ status: BookingStatus.ATTENDED, userId: 'learner-1' }],
        attendances: [{ status: AttendanceStatus.PRESENT, enrolmentId: 'enrol-1' }],
      },
    ]);

    const stages = await stageGateService.evaluateStages('enrol-1', mockLearner);
    expect(stages.stages[LearnerStage.STAGE_4_ONE_ON_ONE].isCompleted).toBe(true);
    expect(stages.stages[LearnerStage.STAGE_5_MISSION_STATEMENT].isUnlocked).toBe(true);
    expect(stages.stages[LearnerStage.STAGE_5_MISSION_STATEMENT].isCompleted).toBe(false);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. MISSION STATEMENT UPLOAD, ANTI-TAMPER VALIDATION, REVISION & APPROVAL
  // ═══════════════════════════════════════════════════════════════════════════
  it('6. Rejects corrupted uploads; accepts valid handwritten scan, handles revision and approval to satisfy Stage 5', async () => {
    // 1. Rejects invalid magic bytes
    expect(() =>
      missionStatementsService.validateFile({
        buffer: Buffer.from('FAKE-CORRUPTED-EXE-DATA'),
        mimetype: 'application/pdf',
        size: 24,
      }),
    ).toThrow(BadRequestException);

    // 2. Valid PDF file (starts with %PDF)
    const validPdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
    expect(() =>
      missionStatementsService.validateFile({
        buffer: validPdfBuffer,
        mimetype: 'application/pdf',
        size: validPdfBuffer.length,
      }),
    ).not.toThrow();

    // 3. Admin review flow: Revision requested -> Re-upload -> Approved
    const submission = {
      id: 'sub-1',
      enrolmentId: 'enrol-1',
      version: 1,
      status: MissionStatementStatus.SUBMITTED,
      fileUrl: 'https://storage.whatboutme.com/mission/scan-v1.pdf',
      enrolment: enrolmentState,
      user: { id: 'learner-1', name: 'Learner One', email: 'learner1@example.com' },
    };

    prismaMock.missionStatementSubmission.findUnique.mockResolvedValue(submission);
    prismaMock.missionStatementSubmission.update.mockResolvedValue({
      ...submission,
      status: MissionStatementStatus.REJECTED,
      feedback: 'Please ensure your handwritten signature is legible at the bottom.',
    });

    const rejected = await missionStatementsService.reject('sub-1', 'admin-1', {
      feedback: 'Please ensure your handwritten signature is legible at the bottom.',
    });

    expect(rejected.status).toBe(MissionStatementStatus.REJECTED);

    // Learner re-uploads -> Admin approves
    const resubmitted = {
      ...submission,
      version: 2,
      status: MissionStatementStatus.SUBMITTED,
    };

    const approvedSubmission = {
      ...resubmitted,
      status: MissionStatementStatus.APPROVED,
      reviewedAt: new Date(),
    };

    prismaMock.missionStatementSubmission.findUnique.mockResolvedValue(resubmitted);
    prismaMock.missionStatementSubmission.update.mockResolvedValue(approvedSubmission);

    const approved = await missionStatementsService.approve('sub-1', 'admin-1', {
      feedback: 'Beautiful handwritten submission. Approved!',
    });
    expect(approved.status).toBe(MissionStatementStatus.APPROVED);

    prismaMock.missionStatementSubmission.findMany.mockResolvedValue([approvedSubmission]);

    // Stage 5 is now COMPLETED
    enrolmentState.curriculumCompletedAt = new Date();
    enrolmentState.examPassedAt = new Date();
    enrolmentState.attendanceSatisfiedAt = new Date();
    enrolmentState.oneOnOneCompletedAt = new Date();

    prismaMock.userLessonProgress.findMany.mockResolvedValue(
      Array.from({ length: 11 }, (_, i) => ({ lessonId: `lesson-${i + 1}`, viewed: true })),
    );
    prismaMock.attempt.findMany.mockResolvedValue(
      Array.from({ length: 11 }, (_, i) => ({
        quizId: `quiz-${i + 1}`,
        passed: true,
        status: AttemptStatus.PASSED,
        score: 90,
      })),
    );
    prismaMock.stepProgress.findMany.mockResolvedValue(
      Array.from({ length: 11 }, (_, i) => ({ stepId: `step-${i + 1}`, isCompleted: true })),
    );
    prismaMock.examAttempt.findMany.mockResolvedValue([
      { id: 'attempt-passing-2', status: AttemptStatus.PASSED, passed: true, score: 88, completedAt: new Date() },
    ]);
    prismaMock.session.findMany.mockResolvedValue([
      {
        id: 'sess-one-on-one-1',
        title: '1-on-1 Milestone Coaching with Roweena',
        sessionType: SessionType.ONE_ON_ONE_WITH_RO,
        status: SessionStatus.COMPLETED,
        endTime: new Date(),
        bookings: [{ status: BookingStatus.ATTENDED, userId: 'learner-1' }],
        attendances: [{ status: AttendanceStatus.PRESENT, enrolmentId: 'enrol-1' }],
      },
    ]);

    const stages = await stageGateService.evaluateStages('enrol-1', mockLearner);
    expect(stages.stages[LearnerStage.STAGE_5_MISSION_STATEMENT].isCompleted).toBe(true);
    expect(stages.allStagesCompleted).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. CERTIFICATE OF COMPLETION ISSUANCE & VERIFICATION
  // ═══════════════════════════════════════════════════════════════════════════
  it('7. Confirms 100% eligibility across all 5 milestones, requests certificate with collision-free WBM code', async () => {
    // Setup all 5 stages completed
    enrolmentState.curriculumCompletedAt = new Date();
    enrolmentState.examPassedAt = new Date();
    enrolmentState.attendanceSatisfiedAt = new Date();
    enrolmentState.oneOnOneCompletedAt = new Date();
    enrolmentState.missionStatementApprovedAt = new Date();

    prismaMock.userLessonProgress.findMany.mockResolvedValue(
      Array.from({ length: 11 }, (_, i) => ({ lessonId: `lesson-${i + 1}`, viewed: true })),
    );
    prismaMock.attempt.findMany.mockResolvedValue(
      Array.from({ length: 11 }, (_, i) => ({
        quizId: `quiz-${i + 1}`,
        passed: true,
        status: AttemptStatus.PASSED,
        score: 90,
      })),
    );
    prismaMock.stepProgress.findMany.mockResolvedValue(
      Array.from({ length: 11 }, (_, i) => ({ stepId: `step-${i + 1}`, isCompleted: true })),
    );
    prismaMock.examAttempt.findMany.mockResolvedValue([
      { id: 'attempt-passing-2', status: AttemptStatus.PASSED, passed: true, score: 88, completedAt: new Date() },
    ]);
    prismaMock.session.findMany.mockResolvedValue([
      {
        id: 'sess-one-on-one-1',
        title: '1-on-1 Milestone Coaching with Roweena',
        sessionType: SessionType.ONE_ON_ONE_WITH_RO,
        status: SessionStatus.COMPLETED,
        endTime: new Date(),
        bookings: [{ status: BookingStatus.ATTENDED, userId: 'learner-1' }],
        attendances: [{ status: AttendanceStatus.PRESENT, enrolmentId: 'enrol-1' }],
      },
    ]);
    prismaMock.missionStatementSubmission.findMany.mockResolvedValue([
      { id: 'sub-2', enrolmentId: 'enrol-1', status: MissionStatementStatus.APPROVED, reviewedAt: new Date() },
    ]);

    const eligibility = await eligibilityService.evaluateEligibility('enrol-1');
    expect(eligibility.isEligible).toBe(true);
    expect(eligibility.status).toBe('ELIGIBLE');
    expect(eligibility.unmetRequirements).toHaveLength(0);

    // Generate collision-safe certificate code in WBM-2026-XXXX format
    const code = await certificatesService.generateUniqueCertificateCode(2026);
    expect(code).toMatch(/^WBM-2026-[A-F0-9]{4,6}$/);

    // Request certificate generation
    prismaMock.certificate.create.mockResolvedValue({
      id: 'cert-1',
      enrolmentId: 'enrol-1',
      certificateCode: code,
      certificateNumber: code,
      status: CertificateStatus.PENDING,
      certificateType: CertificateType.COMPLETION,
      issuedAt: new Date(),
    });

    const cert = await certificatesService.requestCertificate('enrol-1', mockLearner);

    expect(cert.certificateCode).toBe(code);
    expect(cert.status).toBe(CertificateStatus.PENDING);
  });
});
