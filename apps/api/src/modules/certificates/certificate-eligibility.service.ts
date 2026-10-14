import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AttendanceComplianceService, AttendanceComplianceResult } from '../sessions/attendance-compliance.service.js';
import {
  AttemptStatus,
  AttendanceStatus,
  BookingStatus,
  CertificateType,
  ContentStatus,
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
  unmetRequirements: string[];
}

@Injectable()
export class CertificateEligibilityService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => AttendanceComplianceService))
    private readonly attendanceComplianceService: AttendanceComplianceService,
  ) {}

  /**
   * D1-051 & D1-051b: Evaluates complete certificate eligibility for an enrolment.
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

    // Determine Certificate Type (Professional vs Corporate Track)
    const certType =
      requestedType ||
      (enrolment.program.title.toLowerCase().includes('corporate') ||
      enrolment.batch.name.toLowerCase().includes('corporate')
        ? CertificateType.CORPORATE_PARTICIPATION
        : CertificateType.PROFESSIONAL);

    if (certType === CertificateType.CORPORATE_PARTICIPATION) {
      return this.evaluateCorporateTrack(enrolment);
    }

    return this.evaluateProfessionalTrack(enrolment);
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
