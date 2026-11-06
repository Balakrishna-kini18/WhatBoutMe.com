import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ForbiddenException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  AttemptStatus,
  AttendanceStatus,
  BookingStatus,
  ContentStatus,
  EnrolmentStatus,
  LearnerStage,
  OneOnOneRequestStatus,
  QuestionType,
  Role,
  SessionStatus,
  SessionType,
} from '@prisma/client';
import { StageGateService } from '../src/modules/progression/stage-gate.service.js';
import { ExamsService } from '../src/modules/exams/exams.service.js';
import { OneOnOneService } from '../src/modules/sessions/one-on-one.service.js';

describe('Senior Dev & QA End-to-End Real-World Testing: 1-on-1 Coaching Attendance Gate & Exam Decoupling', () => {
  let stageGateService: StageGateService;
  let examsService: ExamsService;
  let oneOnOneService: OneOnOneService;

  let prismaMock: any;
  let complianceServiceMock: any;
  let cacheHelperMock: any;
  let emailServiceMock: any;
  let meetingProviderMock: any;
  let progressionServiceMock: any;

  const mockLearner = {
    id: 'learner-vignesh',
    sub: 'learner-vignesh',
    name: 'Vignesh Learner',
    email: 'vignesh@whatboutme.com',
    role: Role.USER,
  };

  const mockAdmin = {
    id: 'admin-roweena',
    sub: 'admin-roweena',
    name: 'Roweena Instructor',
    email: 'roweena@whatboutme.com',
    role: Role.ADMIN,
  };

  const mockBatch = {
    id: 'batch-nov-2026',
    name: 'November 2026 Batch',
    managerId: 'admin-roweena',
  };

  const mockProgram = {
    id: 'prog-11-steps',
    title: '11 Steps to U Mastery',
    requireExam: true,
    requireCoaching: true,
    requireMissionStatement: true,
    attendanceRequired: true,
    attendanceThreshold: 80,
    sequentialProgressionEnabled: true,
    steps: Array.from({ length: 11 }, (_, i) => ({
      id: `step-${i + 1}`,
      sequence: i + 1,
      title: `Module ${i + 1}`,
      status: ContentStatus.PUBLISHED,
      quiz: { id: `quiz-${i + 1}`, passMark: 75 },
      lessons: [{ id: `lesson-${i + 1}`, status: ContentStatus.PUBLISHED }],
    })),
  };

  const mockExam = {
    id: 'exam-50-mark',
    programId: 'prog-11-steps',
    title: '50-Mark Comprehensive Final Examination',
    passMark: 80,
    timeLimitMin: 90,
    questionCount: 50,
  };

  let mockEnrolment: any;

  // Generate 70 questions for the shuffled pool
  const generate70Questions = () =>
    Array.from({ length: 70 }, (_, i) => ({
      id: `q-${i + 1}`,
      questionBankId: 'bank-70-pool',
      text: `Question ${i + 1} for assessment`,
      type: QuestionType.MULTIPLE_CHOICE,
      points: 1,
      stepId: `step-${(i % 11) + 1}`,
      step: { id: `step-${(i % 11) + 1}`, sequence: (i % 11) + 1 },
      options: [
        { id: `opt-${i + 1}-1`, text: 'Correct Answer', order: 1, isCorrect: true },
        { id: `opt-${i + 1}-2`, text: 'Distractor B', order: 2, isCorrect: false },
        { id: `opt-${i + 1}-3`, text: 'Distractor C', order: 3, isCorrect: false },
        { id: `opt-${i + 1}-4`, text: 'Distractor D', order: 4, isCorrect: false },
      ],
    }));

  beforeEach(() => {
    vi.clearAllMocks();

    mockEnrolment = {
      id: 'enrol-vignesh-1',
      userId: mockLearner.id,
      programId: mockProgram.id,
      batchId: mockBatch.id,
      status: EnrolmentStatus.ACTIVE,
      currentStage: LearnerStage.STAGE_1_CURRICULUM,
      curriculumCompletedAt: null,
      examPassedAt: null,
      attendanceSatisfiedAt: null,
      oneOnOneCompletedAt: null,
      missionApprovedAt: null,
      program: mockProgram,
      batch: mockBatch,
      user: mockLearner,
    };

    prismaMock = {
      enrolment: {
        findUnique: vi.fn().mockImplementation(() => Promise.resolve(mockEnrolment)),
        findFirst: vi.fn().mockImplementation(() => Promise.resolve(mockEnrolment)),
        update: vi.fn().mockImplementation(({ data }: any) => {
          Object.assign(mockEnrolment, data);
          return Promise.resolve(mockEnrolment);
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
        findFirst: vi.fn().mockResolvedValue(mockExam),
        findUnique: vi.fn().mockResolvedValue(mockExam),
        count: vi.fn().mockResolvedValue(1),
      },
      examAttempt: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        update: vi.fn(),
      },
      question: {
        findMany: vi.fn().mockResolvedValue(generate70Questions()),
      },
      session: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        update: vi.fn(),
      },
      sessionBooking: {
        create: vi.fn().mockResolvedValue({ id: 'booking-1' }),
      },
      oneOnOneRequest: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        update: vi.fn(),
      },
      oralAssessment: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      missionStatementSubmission: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      auditLog: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      },
      $transaction: vi.fn(async (cb: any) => cb(prismaMock)),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };

    complianceServiceMock = {
      calculateCompliance: vi.fn(),
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

    meetingProviderMock = {
      createMeeting: vi.fn().mockResolvedValue({
        id: 'zoom-meeting-101',
        joinUrl: 'https://zoom.us/j/101?pwd=secure',
        startUrl: 'https://zoom.us/s/101?pwd=secure',
      }),
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
      meetingProviderMock,
      complianceServiceMock,
    );
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // REAL-WORLD SCENARIO 1: Fast Day-1 Completion & Milestone Decoupling
  // ═════════════════════════════════════════════════════════════════════════════
  it('Scenario 1: Fast learner finishes curriculum on Day 1; can sit and pass 50-mark final exam immediately with 0 live sessions held', async () => {
    // 1. Mark all 11 curriculum steps completed
    prismaMock.userLessonProgress.findMany.mockResolvedValue(
      Array.from({ length: 11 }, (_, i) => ({ lessonId: `lesson-${i + 1}`, viewed: true })),
    );
    prismaMock.attempt.findMany.mockResolvedValue(
      Array.from({ length: 11 }, (_, i) => ({
        quizId: `quiz-${i + 1}`,
        passed: true,
        status: AttemptStatus.PASSED,
        score: 100,
      })),
    );
    prismaMock.stepProgress.findMany.mockResolvedValue(
      Array.from({ length: 11 }, (_, i) => ({ stepId: `step-${i + 1}`, isCompleted: true })),
    );

    // 2. 0 live sessions have been conducted so far for this batch
    complianceServiceMock.calculateCompliance.mockResolvedValue({
      status: 'NOT_APPLICABLE',
      thresholdUsed: 80,
      requiredSessionCount: 0,
      attendedSessionCount: 0,
      attendancePercentage: 0,
    });

    // 3. StageGate evaluation verifies Stage 1 completed and Stage 2 (Final Exam) UNLOCKED
    const stages = await stageGateService.evaluateStages(mockEnrolment.id, mockLearner);
    expect(stages.stages[LearnerStage.STAGE_1_CURRICULUM].isCompleted).toBe(true);
    expect(stages.stages[LearnerStage.STAGE_2_EXAM].isUnlocked).toBe(true);
    expect(stages.stages[LearnerStage.STAGE_2_EXAM].isCompleted).toBe(false);

    // 4. Learner starts the 50-mark final exam: NOT blocked by attendance!
    const pool = generate70Questions();
    prismaMock.question.findMany.mockResolvedValue(pool);

    const activeAttempt = {
      id: 'attempt-day1-1',
      enrolmentId: mockEnrolment.id,
      examId: mockExam.id,
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
    prismaMock.examAttempt.create.mockResolvedValue(activeAttempt);
    prismaMock.examAttempt.findFirst.mockResolvedValue(activeAttempt);
    prismaMock.examAttempt.findUnique.mockResolvedValue(activeAttempt);

    const examSession = await examsService.startExam(mockExam.id, mockLearner);
    expect(examSession.attemptId).toBe('attempt-day1-1');
    expect(examSession.questionCount).toBe(50);
    expect(examSession.questions).toHaveLength(50);

    // 5. Learner submits answers and scores 45/50 (90% >= 80% pass mark)
    const passingAnswers = activeAttempt.answers.boundQuestions.map((q, idx) => ({
      questionId: q.id,
      selectedOptionId: idx < 45 ? `opt-${parseInt(q.id.replace('q-', ''))}-1` : `opt-${parseInt(q.id.replace('q-', ''))}-2`,
    }));

    const examResult = await examsService.submitExam(
      mockExam.id,
      { attemptId: activeAttempt.id, answers: passingAnswers },
      mockLearner,
    );
    expect(examResult.passed).toBe(true);
    expect(examResult.score).toBe(90);
    expect(examResult.status).toBe(AttemptStatus.PASSED);

    // 6. Enrolment is updated with examPassedAt
    expect(prismaMock.enrolment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: mockEnrolment.id },
        data: expect.objectContaining({
          examPassedAt: expect.any(Date),
        }),
      }),
    );
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // REAL-WORLD SCENARIO 2: Attendance Gate Blocks 1-on-1 Call When Below Threshold
  // ═════════════════════════════════════════════════════════════════════════════
  it('Scenario 2: Learner passed final exam but has low live attendance (<80%); 1-on-1 coaching booking is strictly blocked with 403 ATTENDANCE_THRESHOLD_NOT_MET', async () => {
    // Exam is passed
    mockEnrolment.curriculumCompletedAt = new Date();
    mockEnrolment.examPassedAt = new Date();

    prismaMock.examAttempt.findFirst.mockResolvedValue({
      id: 'attempt-passed-1',
      status: AttemptStatus.PASSED,
      passed: true,
      score: 86,
    });

    // 5 live sessions were conducted in the batch; learner attended only 1 (20% < 80%)
    complianceServiceMock.calculateCompliance.mockResolvedValue({
      status: 'NOT_COMPLIANT',
      thresholdUsed: 80,
      requiredSessionCount: 5,
      attendedSessionCount: 1,
      attendancePercentage: 20,
    });

    const start = new Date(Date.now() + 48 * 3600 * 1000);
    const end = new Date(start.getTime() + 45 * 60 * 1000);

    // Learner attempts to book 1-on-1 coaching call
    await expect(
      oneOnOneService.createRequest(mockLearner.id, {
        enrolmentId: mockEnrolment.id,
        requestedStart: start.toISOString(),
        requestedEnd: end.toISOString(),
        notes: 'Would like coaching on Step 7',
      }),
    ).rejects.toThrow(ForbiddenException);

    // Inspect the thrown exception details
    try {
      await oneOnOneService.createRequest(mockLearner.id, {
        enrolmentId: mockEnrolment.id,
        requestedStart: start.toISOString(),
        requestedEnd: end.toISOString(),
        notes: 'Would like coaching on Step 7',
      });
    } catch (err: any) {
      expect(err).toBeInstanceOf(ForbiddenException);
      const res = err.getResponse();
      expect(res.statusCode).toBe(403);
      expect(res.error).toBe('ATTENDANCE_THRESHOLD_NOT_MET');
      expect(res.attendancePercentage).toBe(20);
      expect(res.requiredThreshold).toBe(80);
      expect(res.attendedSessions).toBe(1);
      expect(res.totalSessions).toBe(5);
      expect(res.message).toContain('Minimum 80% live session attendance');
    }
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // REAL-WORLD SCENARIO 3: Live Attendance Satisfied Unlocks 1-on-1 Booking
  // ═════════════════════════════════════════════════════════════════════════════
  it('Scenario 3: Learner meets attendance threshold (4 of 5 sessions = 80%); successfully books 1-on-1 coaching for admin review', async () => {
    mockEnrolment.curriculumCompletedAt = new Date();
    mockEnrolment.examPassedAt = new Date();

    prismaMock.examAttempt.findFirst.mockResolvedValue({
      id: 'attempt-passed-1',
      status: AttemptStatus.PASSED,
      passed: true,
      score: 86,
    });

    // 4 of 5 live sessions attended (80% >= 80%)
    complianceServiceMock.calculateCompliance.mockResolvedValue({
      status: 'COMPLIANT',
      thresholdUsed: 80,
      requiredSessionCount: 5,
      attendedSessionCount: 4,
      attendancePercentage: 80,
    });

    const start = new Date(Date.now() + 24 * 3600 * 1000);
    const end = new Date(start.getTime() + 45 * 60 * 1000);

    const createdReq = {
      id: 'req-booking-1',
      enrolmentId: mockEnrolment.id,
      userId: mockLearner.id,
      requestedStart: start,
      requestedEnd: end,
      status: OneOnOneRequestStatus.PENDING_APPROVAL,
      notes: 'Breakthrough reflections for Roweena',
    };
    prismaMock.oneOnOneRequest.create.mockResolvedValue(createdReq);

    const result = await oneOnOneService.createRequest(mockLearner.id, {
      enrolmentId: mockEnrolment.id,
      requestedStart: start.toISOString(),
      requestedEnd: end.toISOString(),
      notes: 'Breakthrough reflections for Roweena',
    });

    expect(result.id).toBe('req-booking-1');
    expect(result.status).toBe(OneOnOneRequestStatus.PENDING_APPROVAL);

    // Audit log was recorded
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'ONE_ON_ONE_REQUESTED',
          entityId: 'req-booking-1',
        }),
      }),
    );
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // REAL-WORLD SCENARIO 4: Admin Staff Override Permits Low-Attendance Booking
  // ═════════════════════════════════════════════════════════════════════════════
  it('Scenario 4: Learner has 0% attendance, but Admin logs STAGE_UNLOCK_OVERRIDE; 1-on-1 booking succeeds via staff waiver', async () => {
    mockEnrolment.curriculumCompletedAt = new Date();
    mockEnrolment.examPassedAt = new Date();

    prismaMock.examAttempt.findFirst.mockResolvedValue({
      id: 'attempt-passed-1',
      status: AttemptStatus.PASSED,
      passed: true,
      score: 92,
    });

    // 0 sessions attended out of 4 held
    complianceServiceMock.calculateCompliance.mockResolvedValue({
      status: 'NOT_COMPLIANT',
      thresholdUsed: 80,
      requiredSessionCount: 4,
      attendedSessionCount: 0,
      attendancePercentage: 0,
    });

    // Admin issued staff override in AuditLog
    prismaMock.auditLog.findMany.mockResolvedValue([
      {
        id: 'log-override-1',
        action: 'STAGE_UNLOCK_OVERRIDE',
        meta: {
          stage: LearnerStage.STAGE_4_ONE_ON_ONE,
          reason: 'Authorized offline workshop attendance by Roweena',
        },
      },
    ]);

    const start = new Date(Date.now() + 36 * 3600 * 1000);
    const end = new Date(start.getTime() + 45 * 60 * 1000);

    const createdReq = {
      id: 'req-overridden-1',
      enrolmentId: mockEnrolment.id,
      userId: mockLearner.id,
      status: OneOnOneRequestStatus.PENDING_APPROVAL,
    };
    prismaMock.oneOnOneRequest.create.mockResolvedValue(createdReq);

    const result = await oneOnOneService.createRequest(mockLearner.id, {
      enrolmentId: mockEnrolment.id,
      requestedStart: start.toISOString(),
      requestedEnd: end.toISOString(),
      notes: 'Override booking',
    });

    expect(result.id).toBe('req-overridden-1');
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // REAL-WORLD SCENARIO 5: Admin Manually Approves 1-on-1 Request & Schedules Zoom
  // ═════════════════════════════════════════════════════════════════════════════
  it('Scenario 5: Admin reviews pending 1-on-1 coaching request and manually approves it; scheduled session created with Zoom meeting link', async () => {
    const start = new Date(Date.now() + 48 * 3600 * 1000);
    const end = new Date(start.getTime() + 45 * 60 * 1000);

    const pendingRequest = {
      id: 'req-pending-100',
      enrolmentId: mockEnrolment.id,
      userId: mockLearner.id,
      status: OneOnOneRequestStatus.PENDING_APPROVAL,
      requestedStart: start,
      requestedEnd: end,
      learnerTimezone: 'Asia/Kolkata',
      notes: 'Strategic Career Plan Discussion',
      enrolment: mockEnrolment,
      user: mockLearner,
    };

    prismaMock.oneOnOneRequest.findUnique.mockResolvedValue(pendingRequest);

    const approvedSession = {
      id: 'sess-scheduled-100',
      title: `1-on-1 Coaching: ${mockLearner.name}`,
      sessionType: SessionType.ONE_ON_ONE,
      status: SessionStatus.SCHEDULED,
      startTime: start,
      endTime: end,
      joinUrl: 'https://zoom.us/j/101?pwd=secure',
    };
    prismaMock.session.create.mockResolvedValue(approvedSession);

    const updatedRequest = {
      ...pendingRequest,
      status: OneOnOneRequestStatus.APPROVED,
      sessionId: approvedSession.id,
      session: approvedSession,
    };
    prismaMock.oneOnOneRequest.update.mockResolvedValue(updatedRequest);

    const approvalResult = await oneOnOneService.approveRequest(
      mockAdmin.id,
      'req-pending-100',
      {
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
      mockAdmin,
    );

    expect(approvalResult.status).toBe(OneOnOneRequestStatus.APPROVED);
    expect(approvalResult.sessionId).toBe('sess-scheduled-100');
    expect(meetingProviderMock.createMeeting).toHaveBeenCalled();
    expect(prismaMock.session.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sessionType: SessionType.ONE_ON_ONE,
          status: SessionStatus.SCHEDULED,
          learnerId: mockLearner.id,
          joinUrl: expect.stringContaining('zoom.us'),
        }),
      }),
    );
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // REAL-WORLD SCENARIO 6: Prerequisite Lockout when Exam Not Passed
  // ═════════════════════════════════════════════════════════════════════════════
  it('Scenario 6: Learner with 100% attendance cannot book 1-on-1 coaching before passing Final Exam', async () => {
    // Attendance is 100%, but exam has NOT been taken or passed
    mockEnrolment.curriculumCompletedAt = new Date();
    mockEnrolment.examPassedAt = null;

    prismaMock.examAttempt.findFirst.mockResolvedValue(null);

    complianceServiceMock.calculateCompliance.mockResolvedValue({
      status: 'COMPLIANT',
      thresholdUsed: 80,
      requiredSessionCount: 5,
      attendedSessionCount: 5,
      attendancePercentage: 100,
    });

    const start = new Date(Date.now() + 24 * 3600 * 1000);
    const end = new Date(start.getTime() + 45 * 60 * 1000);

    await expect(
      oneOnOneService.createRequest(mockLearner.id, {
        enrolmentId: mockEnrolment.id,
        requestedStart: start.toISOString(),
        requestedEnd: end.toISOString(),
      }),
    ).rejects.toThrow(ForbiddenException);

    try {
      await oneOnOneService.createRequest(mockLearner.id, {
        enrolmentId: mockEnrolment.id,
        requestedStart: start.toISOString(),
        requestedEnd: end.toISOString(),
      });
    } catch (err: any) {
      expect(err.message).toContain('You must pass the Final Examination before scheduling a 1-on-1 coaching session');
    }
  });
});
