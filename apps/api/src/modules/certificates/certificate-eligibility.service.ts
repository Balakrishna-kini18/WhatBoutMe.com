import { Injectable, NotFoundException, Inject, forwardRef, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AttendanceComplianceService, AttendanceComplianceResult } from '../sessions/attendance-compliance.service.js';
import { StageGateService } from '../progression/stage-gate.service.js';
import {
  AttemptStatus,
  AttendanceStatus,
  BookingStatus,
  CertificateType,
  ContentStatus,
  LearnerStage,
  OralAssessmentStatus,
  SessionStatus,
  SessionType,
} from '@prisma/client';

export interface StepRequirementResult {
  required: number;
  completed: number;
  isMet: boolean;
  uncompletedStepTitles?: string[];
}

export interface QuizRequirementResult {
  required: number;
  passed: number;
  isMet: boolean;
  unpassedQuizStepTitles?: string[];
}

export interface FinalExamRequirementResult {
  required: boolean;
  passed: boolean;
  score: number | null;
  attemptCount: number;
  isMet: boolean;
}

export interface OralAssessmentRequirementResult {
  required: boolean;
  passed: boolean;
  score: number | null;
  status: string | null;
  isMet: boolean;
}

export interface AttendanceRequirementResult {
  required: boolean;
  thresholdUsed: number;
  attendancePercentage: number;
  requiredSessions: number;
  attendedSessions: number;
  status: string;
  isMet: boolean;
}

export interface ClosingCallRequirementResult {
  required: boolean;
  completed: boolean;
  sessionId: string | null;
  sessionTitle: string | null;
  completedAt: Date | null;
  isMet: boolean;
}

export interface MissionStatementRequirementResult {
  required: boolean;
  completed: boolean;
  status: string | null;
  reviewedAt: Date | null;
  isMet: boolean;
}

export interface CertificateEligibilityEvaluation {
  enrolmentId: string;
  userId: string;
  programId: string;
  programTitle: string;
  batchId: string;
  certificateType: CertificateType;
  isEligible: boolean;
  status: 'ELIGIBLE' | 'INELIGIBLE';
  evaluatedAt: Date;
  steps: StepRequirementResult;
  quizzes: QuizRequirementResult;
  finalExam: FinalExamRequirementResult;
  oralAssessment: OralAssessmentRequirementResult;
  attendance: AttendanceRequirementResult;
  closingCall: ClosingCallRequirementResult;
  missionStatement?: MissionStatementRequirementResult;
  unmetRequirements: string[];
}

@Injectable()
export class CertificateEligibilityService {
  private readonly stageGateServiceInstance: StageGateService;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => AttendanceComplianceService))
    private readonly attendanceComplianceService: AttendanceComplianceService,
    @Optional()
    @Inject(forwardRef(() => StageGateService))
    private readonly stageGateService?: StageGateService,
  ) {
    this.stageGateServiceInstance =
      this.stageGateService ||
      new StageGateService(this.prisma, this.attendanceComplianceService);
  }

  /**
   * D1-051 & D1-051b: Evaluates complete certificate eligibility for an enrolment.
   * Leverages StageGateService as the single authoritative 5-stage progression engine.
   * Completely read-only: does not modify or issue certificates.
   */
  async evaluateEligibility(
    enrolmentId: string,
    requestedType?: CertificateType,
  ): Promise<CertificateEligibilityEvaluation> {
    const enrolment = await this.prisma.enrolment.findUnique({
      where: { id: enrolmentId },
      include: {
        program: true,
        batch: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (!enrolment) {
      throw new NotFoundException(`Enrolment with ID ${enrolmentId} not found`);
    }

    const stageEval = await this.stageGateServiceInstance.evaluateStages(enrolment.id);
    const certType = requestedType || stageEval.certificateType;

    if (certType === CertificateType.CORPORATE_PARTICIPATION) {
      return this.evaluateCorporateTrack(enrolment);
    }

    const s1 = stageEval.stages[LearnerStage.STAGE_1_CURRICULUM];
    const s2 = stageEval.stages[LearnerStage.STAGE_2_EXAM];
    const s3 = stageEval.stages[LearnerStage.STAGE_3_ATTENDANCE];
    const s4 = stageEval.stages[LearnerStage.STAGE_4_ONE_ON_ONE];
    const s5 = stageEval.stages[LearnerStage.STAGE_5_MISSION_STATEMENT];

    const unmetRequirements: string[] = [];
    if (!s1.isCompleted && s1.details?.uncompletedStepTitles && s1.details.uncompletedStepTitles.length > 0) {
      unmetRequirements.push(
        `Program steps incomplete: ${s1.details.completedSteps}/${s1.details.totalSteps} completed. Remaining: ${s1.details.uncompletedStepTitles.join(', ')}`,
      );
    }
    if (!s1.isCompleted && s1.details?.unpassedQuizStepTitles && s1.details.unpassedQuizStepTitles.length > 0) {
      unmetRequirements.push(
        `Step quizzes incomplete: ${s1.details.passedQuizzes}/${s1.details.requiredQuizzes} passed. Missing: ${s1.details.unpassedQuizStepTitles.join(', ')}`,
      );
    }
    if (!s2.isCompleted && s2.details?.examRequired && !s2.details?.examPassed) {
      unmetRequirements.push('Final 50-question exam not passed.');
    }
    if (!s2.isCompleted && s2.details?.oralRequired && !s2.details?.oralPassed) {
      unmetRequirements.push('Oral assessment not marked as PASSED.');
    }
    if (!s3.isCompleted && s3.details?.complianceStatus === 'NOT_COMPLIANT') {
      unmetRequirements.push(
        `Attendance requirement not met: ${Math.round(
          s3.details?.attendancePercentage ?? 0,
        )}% attended (${s3.details?.attendedSessions ?? 0}/${
          s3.details?.requiredSessions ?? 0
        } sessions), minimum threshold is ${s3.details?.thresholdPercent ?? 80}%.`,
      );
    }
    if (!s4.isCompleted && s4.details?.isRequired !== false) {
      unmetRequirements.push(
        'Required 1-on-1 closing call has not been completed.',
      );
    }
    if (!s5.isCompleted && s5.details?.isRequired !== false) {
      unmetRequirements.push(
        'Handwritten mission statement has not been approved.',
      );
    }

    const isEligible = unmetRequirements.length === 0;

    return {
      enrolmentId: enrolment.id,
      userId: enrolment.userId,
      programId: enrolment.programId,
      programTitle: enrolment.program.title,
      batchId: enrolment.batchId,
      certificateType: CertificateType.PROFESSIONAL,
      isEligible,
      status: isEligible ? 'ELIGIBLE' : 'INELIGIBLE',
      evaluatedAt: stageEval.evaluatedAt,
      steps: {
        required: s1.details?.totalSteps ?? 0,
        completed: s1.details?.completedSteps ?? 0,
        isMet: s1.isCompleted || (s1.details?.uncompletedStepTitles?.length ?? 0) === 0,
        uncompletedStepTitles: s1.details?.uncompletedStepTitles,
      },
      quizzes: {
        required: s1.details?.requiredQuizzes ?? 0,
        passed: s1.details?.passedQuizzes ?? 0,
        isMet: s1.isCompleted || (s1.details?.unpassedQuizStepTitles?.length ?? 0) === 0,
        unpassedQuizStepTitles: s1.details?.unpassedQuizStepTitles,
      },
      finalExam: {
        required: s2.details?.examRequired ?? false,
        passed: s2.details?.examPassed ?? false,
        score: s2.details?.examScore ?? null,
        attemptCount: s2.details?.attemptCount ?? 0,
        isMet: s2.isCompleted || (s2.details?.examRequired ? s2.details?.examPassed : true),
      },
      oralAssessment: {
        required: s2.details?.oralRequired ?? false,
        passed: s2.details?.oralPassed ?? false,
        score: s2.details?.oralScore ?? null,
        status: s2.details?.oralStatus ?? null,
        isMet: s2.isCompleted || (s2.details?.oralRequired ? s2.details?.oralPassed : true),
      },
      attendance: {
        required: true,
        thresholdUsed: s3.details?.thresholdPercent ?? 80,
        attendancePercentage: s3.details?.attendancePercentage ?? 100,
        requiredSessions: s3.details?.requiredSessions ?? 0,
        attendedSessions: s3.details?.attendedSessions ?? 0,
        status: s3.details?.complianceStatus ?? 'NOT_APPLICABLE',
        isMet: s3.isCompleted || s3.details?.complianceStatus !== 'NOT_COMPLIANT',
      },
      closingCall: {
        required: true,
        completed: s4.isCompleted,
        sessionId: s4.details?.completedSessionId ?? null,
        sessionTitle: s4.details?.completedSessionTitle ?? null,
        completedAt: s4.completedAt,
        isMet: s4.isCompleted,
      },
      missionStatement: {
        required: true,
        completed: s5.isCompleted,
        status: s5.details?.latestStatus ?? null,
        reviewedAt: s5.completedAt,
        isMet: s5.isCompleted,
      },
      unmetRequirements,
    };
  }

  /**
   * D1-051: Standard Professional Certification Track
   * Requires all 6 conditions:
   * 1. All 11 program steps complete
   * 2. All 11 step quizzes passed
   * 3. Final 50-question exam passed
   * 4. Oral assessment marked PASSED
   * 5. Configured attendance threshold met
   * 6. Required 1-on-1 closing call completed
   */
  private async evaluateProfessionalTrack(
    enrolment: any,
  ): Promise<CertificateEligibilityEvaluation> {
    const unmetRequirements: string[] = [];

    // Parallel fetch of required prerequisites to avoid N+1 queries
    const [
      publishedSteps,
      lessonProgressList,
      quizAttemptsList,
      stepProgressList,
      examAttempts,
      oralAssessments,
      closingCallSessions,
      programExamCount,
      programOralCount,
    ] = await Promise.all([
      // 1. Published steps and quizzes for the program
      this.prisma.step.findMany({
        where: { programId: enrolment.programId, status: ContentStatus.PUBLISHED },
        orderBy: { sequence: 'asc' },
        include: {
          quiz: { select: { id: true, title: true, passMark: true } },
          lessons: {
            where: { status: ContentStatus.PUBLISHED },
            select: { id: true },
          },
        },
      }),

      // 2. Viewed lessons
      this.prisma.userLessonProgress.findMany({
        where: { enrolmentId: enrolment.id, viewed: true },
        select: { lessonId: true },
      }),

      // 3. Quiz attempts
      this.prisma.attempt.findMany({
        where: { enrolmentId: enrolment.id },
        select: { quizId: true, status: true, passed: true, score: true },
      }),

      // 4. Stored step progress overrides/completions
      this.prisma.stepProgress.findMany({
        where: { enrolmentId: enrolment.id },
        select: { stepId: true, isCompleted: true },
      }),

      // 5. Final 50-question exam attempts
      this.prisma.examAttempt.findMany({
        where: { enrolmentId: enrolment.id },
        orderBy: { startedAt: 'desc' },
        select: { id: true, status: true, passed: true, score: true },
      }),

      // 6. Oral assessment records
      this.prisma.oralAssessment.findMany({
        where: { enrolmentId: enrolment.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, passed: true, overallScore: true },
      }),

      // 7. Closing call sessions (1-on-1 sessions matching closing call criteria)
      this.prisma.session.findMany({
        where: {
          sessionType: SessionType.ONE_ON_ONE,
          OR: [
            { title: { contains: 'closing', mode: 'insensitive' } },
            { description: { contains: 'closing', mode: 'insensitive' } },
            { agenda: { contains: 'closing', mode: 'insensitive' } },
          ],
          AND: [
            {
              OR: [
                { learnerId: enrolment.userId },
                { bookings: { some: { userId: enrolment.userId } } },
                { attendances: { some: { enrolmentId: enrolment.id } } },
              ],
            },
          ],
        },
        include: {
          bookings: { where: { userId: enrolment.userId } },
          attendances: { where: { enrolmentId: enrolment.id } },
        },
      }),

      // 8. Check if program has configured exams
      this.prisma.exam.count({
        where: { programId: enrolment.programId },
      }),

      // 9. Check if program has configured oral assessments
      this.prisma.oralAssessment.count({
        where: { programId: enrolment.programId },
      }),
    ]);

    // ── 1. Steps Evaluation ──────────────────────────────────────────────────
    const viewedLessonIds = new Set(lessonProgressList.map((lp) => lp.lessonId));
    const passedQuizIds = new Set(
      quizAttemptsList
        .filter((a) => a.status === AttemptStatus.PASSED || a.passed === true)
        .map((a) => a.quizId),
    );
    const explicitlyCompletedStepIds = new Set(
      stepProgressList.filter((sp) => sp.isCompleted).map((sp) => sp.stepId),
    );

    const uncompletedStepTitles: string[] = [];
    for (const step of publishedSteps) {
      if (explicitlyCompletedStepIds.has(step.id)) {
        continue;
      }
      const allLessonsViewed =
        step.lessons.length === 0 ||
        step.lessons.every((l) => viewedLessonIds.has(l.id));
      const quizPassed = !step.quiz || passedQuizIds.has(step.quiz.id);

      if (!allLessonsViewed || !quizPassed) {
        uncompletedStepTitles.push(step.title);
      }
    }

    const totalStepsRequired = publishedSteps.length;
    const completedStepsCount = totalStepsRequired - uncompletedStepTitles.length;
    const stepsMet =
      totalStepsRequired > 0 && completedStepsCount === totalStepsRequired;

    if (!stepsMet) {
      unmetRequirements.push(
        `Program steps incomplete: ${completedStepsCount}/${totalStepsRequired} completed. Remaining: ${uncompletedStepTitles.join(', ')}`,
      );
    }

    // ── 2. Quizzes Evaluation ────────────────────────────────────────────────
    const stepsWithQuiz = publishedSteps.filter((s) => s.quiz !== null);
    const requiredQuizzesCount = stepsWithQuiz.length;
    const unpassedQuizStepTitles: string[] = [];

    for (const step of stepsWithQuiz) {
      if (!step.quiz || !passedQuizIds.has(step.quiz.id)) {
        unpassedQuizStepTitles.push(step.title);
      }
    }

    const passedQuizzesCount = requiredQuizzesCount - unpassedQuizStepTitles.length;
    const quizzesMet =
      requiredQuizzesCount === 0 || passedQuizzesCount === requiredQuizzesCount;

    if (!quizzesMet) {
      unmetRequirements.push(
        `Step quizzes incomplete: ${passedQuizzesCount}/${requiredQuizzesCount} passed. Missing: ${unpassedQuizStepTitles.join(', ')}`,
      );
    }

    // ── 3. Final Exam Evaluation (Conditional on program configuration) ──────
    const finalExamRequired = programExamCount > 0;
    const passedExamAttempt = examAttempts.find(
      (ea) => ea.status === AttemptStatus.PASSED || ea.passed === true,
    );
    const finalExamMet = !finalExamRequired || Boolean(passedExamAttempt);

    if (finalExamRequired && !finalExamMet) {
      unmetRequirements.push('Final 50-question exam not passed.');
    }

    // ── 4. Oral Assessment Evaluation (Conditional on program configuration) ──
    const oralAssessmentRequired = programOralCount > 0;
    const passedOralAssessment = oralAssessments.find(
      (oa) => oa.status === OralAssessmentStatus.PASSED || oa.passed === true,
    );
    const oralAssessmentMet = !oralAssessmentRequired || Boolean(passedOralAssessment);

    if (oralAssessmentRequired && !oralAssessmentMet) {
      unmetRequirements.push('Oral assessment not marked as PASSED.');
    }

    // ── 5. Attendance Compliance Evaluation ──────────────────────────────────
    let complianceResult: AttendanceComplianceResult;
    try {
      complianceResult = await this.attendanceComplianceService.calculateCompliance(
        enrolment.id,
      );
    } catch {
      complianceResult = {
        status: 'NOT_APPLICABLE',
        thresholdUsed: 80,
        requiredSessionCount: 0,
        attendedSessionCount: 0,
        attendancePercentage: 100,
      };
    }

    const attendanceMet =
      complianceResult.status === 'COMPLIANT' ||
      complianceResult.status === 'NOT_APPLICABLE';

    if (!attendanceMet) {
      unmetRequirements.push(
        `Attendance requirement not met: ${Math.round(
          complianceResult.attendancePercentage,
        )}% attended (${complianceResult.attendedSessionCount}/${
          complianceResult.requiredSessionCount
        } sessions), minimum threshold is ${complianceResult.thresholdUsed}%.`,
      );
    }

    // ── 6. Closing Call Evaluation ──────────────────────────────────────────
    const closingCallRequired = true;
    const completedClosingCall = closingCallSessions.find((s) => {
      const isCompletedStatus = s.status === SessionStatus.COMPLETED;
      const isBookingAttended = s.bookings.some(
        (b) => b.status === BookingStatus.ATTENDED,
      );
      const isAttendancePresent = s.attendances.some(
        (a) =>
          a.status === AttendanceStatus.PRESENT ||
          a.status === AttendanceStatus.PRESENT_AUTO ||
          a.status === AttendanceStatus.PRESENT_MANUAL ||
          a.status === AttendanceStatus.CORRECTED,
      );
      return isCompletedStatus || isBookingAttended || isAttendancePresent;
    });

    const closingCallMet = Boolean(completedClosingCall);

    if (!closingCallMet) {
      unmetRequirements.push(
        'Required 1-on-1 closing call has not been completed.',
      );
    }

    // Overall eligibility
    const isEligible =
      stepsMet &&
      quizzesMet &&
      finalExamMet &&
      oralAssessmentMet &&
      attendanceMet &&
      closingCallMet;

    return {
      enrolmentId: enrolment.id,
      userId: enrolment.userId,
      programId: enrolment.programId,
      programTitle: enrolment.program.title,
      batchId: enrolment.batchId,
      certificateType: CertificateType.PROFESSIONAL,
      isEligible,
      status: isEligible ? 'ELIGIBLE' : 'INELIGIBLE',
      evaluatedAt: new Date(),
      steps: {
        required: totalStepsRequired,
        completed: completedStepsCount,
        isMet: stepsMet,
        uncompletedStepTitles,
      },
      quizzes: {
        required: requiredQuizzesCount,
        passed: passedQuizzesCount,
        isMet: quizzesMet,
        unpassedQuizStepTitles,
      },
      finalExam: {
        required: finalExamRequired,
        passed: Boolean(passedExamAttempt),
        score: passedExamAttempt?.score ?? null,
        attemptCount: examAttempts.length,
        isMet: finalExamMet,
      },
      oralAssessment: {
        required: oralAssessmentRequired,
        passed: Boolean(passedOralAssessment),
        score: passedOralAssessment?.overallScore ?? null,
        status: passedOralAssessment?.status ?? null,
        isMet: oralAssessmentMet,
      },
      attendance: {
        required: true,
        thresholdUsed: complianceResult.thresholdUsed,
        attendancePercentage: complianceResult.attendancePercentage,
        requiredSessions: complianceResult.requiredSessionCount,
        attendedSessions: complianceResult.attendedSessionCount,
        status: complianceResult.status,
        isMet: attendanceMet,
      },
      closingCall: {
        required: closingCallRequired,
        completed: Boolean(completedClosingCall),
        sessionId: completedClosingCall?.id ?? null,
        sessionTitle: completedClosingCall?.title ?? null,
        completedAt: completedClosingCall?.updatedAt ?? null,
        isMet: closingCallMet,
      },
      unmetRequirements,
    };
  }

  /**
   * D1-051b: Corporate Participation Certificate Track
   * Requires workshop attendance ONLY.
   * Explicitly bypasses:
   * - Final 50-question exam
   * - Step quizzes
   * - Closing call
   * - CPD tracking
   */
  private async evaluateCorporateTrack(
    enrolment: any,
  ): Promise<CertificateEligibilityEvaluation> {
    const unmetRequirements: string[] = [];

    let complianceResult: AttendanceComplianceResult;
    try {
      complianceResult = await this.attendanceComplianceService.calculateCompliance(
        enrolment.id,
      );
    } catch {
      complianceResult = {
        status: 'COMPLIANT',
        thresholdUsed: 0,
        requiredSessionCount: 0,
        attendedSessionCount: 0,
        attendancePercentage: 100,
      };
    }

    const attendanceMet =
      complianceResult.status === 'COMPLIANT' ||
      complianceResult.status === 'NOT_APPLICABLE';

    if (!attendanceMet) {
      unmetRequirements.push(
        `Corporate workshop attendance requirement not met: ${Math.round(
          complianceResult.attendancePercentage,
        )}% attended, required threshold is ${complianceResult.thresholdUsed}%.`,
      );
    }

    const isEligible = attendanceMet;

    return {
      enrolmentId: enrolment.id,
      userId: enrolment.userId,
      programId: enrolment.programId,
      programTitle: enrolment.program.title,
      batchId: enrolment.batchId,
      certificateType: CertificateType.CORPORATE_PARTICIPATION,
      isEligible,
      status: isEligible ? 'ELIGIBLE' : 'INELIGIBLE',
      evaluatedAt: new Date(),
      steps: {
        required: 0,
        completed: 0,
        isMet: true, // Bypassed
      },
      quizzes: {
        required: 0,
        passed: 0,
        isMet: true, // Bypassed
      },
      finalExam: {
        required: false,
        passed: false,
        score: null,
        attemptCount: 0,
        isMet: true, // Bypassed
      },
      oralAssessment: {
        required: false,
        passed: false,
        score: null,
        status: null,
        isMet: true, // Bypassed
      },
      attendance: {
        required: true,
        thresholdUsed: complianceResult.thresholdUsed,
        attendancePercentage: complianceResult.attendancePercentage,
        requiredSessions: complianceResult.requiredSessionCount,
        attendedSessions: complianceResult.attendedSessionCount,
        status: complianceResult.status,
        isMet: attendanceMet,
      },
      closingCall: {
        required: false,
        completed: false,
        sessionId: null,
        sessionTitle: null,
        completedAt: null,
        isMet: true, // Bypassed
      },
      unmetRequirements,
    };
  }
}
