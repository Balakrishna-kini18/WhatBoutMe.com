import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  AttemptStatus,
  AttendanceStatus,
  BookingStatus,
  CertificateType,
  ContentStatus,
  LearnerStage,
  MissionStatementStatus,
  OralAssessmentStatus,
  SessionStatus,
  SessionType,
} from '@prisma/client';
import { AttendanceComplianceService } from '../sessions/attendance-compliance.service.js';

export interface StageStatus {
  stage: LearnerStage;
  isUnlocked: boolean;
  isCompleted: boolean;
  isOverridden: boolean;
  completedAt: Date | null;
  details?: Record<string, any>;
  unmetPrerequisites?: string[];
}

export interface LearnerProgressionStages {
  enrolmentId: string;
  userId: string;
  programId: string;
  batchId: string;
  certificateType: CertificateType;
  currentStage: LearnerStage;
  stages: Record<LearnerStage, StageStatus>;
  allStagesCompleted: boolean;
  evaluatedAt: Date;
}

@Injectable()
export class StageGateService {
  private readonly logger = new Logger(StageGateService.name);
  private readonly evalCache = new Map<string, { expiresAt: number; data: LearnerProgressionStages }>();
  private readonly inflightEvals = new Map<string, Promise<LearnerProgressionStages>>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => AttendanceComplianceService))
    private readonly attendanceComplianceService: AttendanceComplianceService,
  ) {}

  public invalidateCache(enrolmentId: string): void {
    this.evalCache.delete(enrolmentId);
    this.inflightEvals.delete(enrolmentId);
  }

  /**
   * Evaluates all 5 sequential stages from ground-truth evidence.
   * Timestamps on Enrolment act as an updated cache, not sole authority.
   */
  async evaluateStages(enrolmentId: string, actor?: any): Promise<LearnerProgressionStages> {
    const useCache = process.env.NODE_ENV !== 'test' && !process.env.VITEST;
    if (useCache) {
      const cached = this.evalCache.get(enrolmentId);
      if (cached && cached.expiresAt > Date.now()) {
        if (actor && (actor.role === 'USER' || actor.role === 'LEARNER')) {
          const actorId = actor.sub ?? actor.id;
          if (actorId && cached.data.userId !== actorId) {
            throw new ForbiddenException(
              'Access denied: You can only view progression stages for your own enrolment',
            );
          }
        }
        return cached.data;
      }
      const inflight = this.inflightEvals.get(enrolmentId);
      if (inflight) {
        const res = await inflight;
        if (actor && (actor.role === 'USER' || actor.role === 'LEARNER')) {
          const actorId = actor.sub ?? actor.id;
          if (actorId && res.userId !== actorId) {
            throw new ForbiddenException(
              'Access denied: You can only view progression stages for your own enrolment',
            );
          }
        }
        return res;
      }
    }

    const computePromise = this.computeStagesInternal(enrolmentId, actor);
    if (useCache) {
      this.inflightEvals.set(enrolmentId, computePromise);
    }
    try {
      const result = await computePromise;
      if (useCache) {
        this.evalCache.set(enrolmentId, {
          expiresAt: Date.now() + 30_000,
          data: result,
        });
      }
      return result;
    } finally {
      if (useCache) {
        this.inflightEvals.delete(enrolmentId);
      }
    }
  }

  private async computeStagesInternal(
    enrolmentId: string,
    actor?: any,
  ): Promise<LearnerProgressionStages> {
    const enrolment = await this.prisma.enrolment.findUnique({
      where: { id: enrolmentId },
      include: {
        program: true,
        batch: true,
        user: { select: { id: true, name: true, email: true } },
        signedAgreement: { select: { id: true, status: true, signedAt: true } },
      },
    });

    if (!enrolment) {
      throw new NotFoundException(`Enrolment with ID ${enrolmentId} not found`);
    }

    // Anti-IDOR check: Learners can only evaluate their own enrolment stages
    if (actor && (actor.role === 'USER' || actor.role === 'LEARNER')) {
      const actorId = actor.sub ?? actor.id;
      if (actorId && enrolment.userId !== actorId) {
        throw new ForbiddenException(
          'Access denied: You can only view progression stages for your own enrolment',
        );
      }
    }

    const isCorporateTrack =
      enrolment.program.title.toLowerCase().includes('corporate') ||
      enrolment.batch.name.toLowerCase().includes('corporate');
    const certificateType = isCorporateTrack
      ? CertificateType.CORPORATE_PARTICIPATION
      : CertificateType.PROFESSIONAL;

    const programConfig = enrolment.program as any;

    // Parallel fetch all prerequisites, overrides, and attendance compliance in a single wave
    const [
      stageOverrides,
      publishedSteps,
      lessonProgressList,
      quizAttemptsList,
      stepProgressList,
      examAttempts,
      oralAssessments,
      programExamCount,
      programOralCount,
      oneOnOneSessions,
      missionSubmissions,
      attendanceCompliance,
    ] = await Promise.all([
      // 0. Active overrides from AuditLog
      this.prisma.auditLog?.findMany
        ? this.prisma.auditLog.findMany({
            where: {
              entity: 'Enrolment',
              entityId: enrolment.id,
              action: 'STAGE_UNLOCK_OVERRIDE',
            },
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve([]),

      // 1. Published steps & lessons & quizzes
      this.prisma.step.findMany({
        where: { programId: enrolment.programId, status: ContentStatus.PUBLISHED },
        orderBy: { sequence: 'asc' },
        include: {
          quiz: { select: { id: true, title: true, passMark: true } },
          lessons: {
            where: { status: ContentStatus.PUBLISHED },
            select: { id: true, createdAt: true },
          },
        },
      }),

      // 2. Viewed lesson progress
      this.prisma.userLessonProgress.findMany({
        where: { enrolmentId: enrolment.id, viewed: true },
        select: { lessonId: true, completedAt: true },
      }),

      // 3. Quiz attempts
      this.prisma.attempt.findMany({
        where: { enrolmentId: enrolment.id },
        select: { quizId: true, status: true, passed: true, score: true, completedAt: true },
      }),

      // 4. Stored step progress overrides
      this.prisma.stepProgress.findMany({
        where: { enrolmentId: enrolment.id },
        select: { stepId: true, isCompleted: true, completedAt: true },
      }),

      // 5. Exam attempts
      this.prisma.examAttempt.findMany({
        where: { enrolmentId: enrolment.id },
        orderBy: { startedAt: 'desc' },
        select: { id: true, status: true, passed: true, score: true, completedAt: true },
      }),

      // 6. Oral assessments
      this.prisma.oralAssessment.findMany({
        where: { enrolmentId: enrolment.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, passed: true, overallScore: true, completedAt: true },
      }),

      // 7. Exam configured count
      this.prisma.exam.count({
        where: { programId: enrolment.programId },
      }),

      // 8. Oral configured count
      this.prisma.oralAssessment.count({
        where: { programId: enrolment.programId },
      }),

      // 9. 1-on-1 sessions scoped strictly to this enrolment or batch
      this.prisma.session.findMany({
        where: {
          OR: [
            { sessionType: SessionType.ONE_ON_ONE_WITH_RO },
            { sessionType: SessionType.ONE_ON_ONE },
            { title: { contains: 'closing', mode: 'insensitive' } },
            { description: { contains: 'closing', mode: 'insensitive' } },
          ],
          AND: [
            {
              OR: [
                { oneOnOneRequests: { some: { enrolmentId: enrolment.id } } },
                { attendances: { some: { enrolmentId: enrolment.id } } },
                { bookings: { some: { enrolmentId: enrolment.id } } },
                ...(enrolment.batchId
                  ? [
                      {
                        batchId: enrolment.batchId,
                        OR: [
                          { learnerId: enrolment.userId },
                          { bookings: { some: { userId: enrolment.userId } } },
                        ],
                      },
                    ]
                  : []),
              ],
            },
          ],
        },
        include: {
          bookings: { where: { userId: enrolment.userId } },
          attendances: { where: { enrolmentId: enrolment.id } },
        },
      }),

      // 10. Mission statement submissions
      this.prisma.missionStatementSubmission?.findMany
        ? this.prisma.missionStatementSubmission.findMany({
            where: { enrolmentId: enrolment.id },
            orderBy: { version: 'desc' },
          })
        : Promise.resolve([]),

      // 11. Attendance compliance (evaluated concurrently instead of sequentially after)
      this.attendanceComplianceService
        .calculateCompliance(enrolment.id)
        .catch(() => ({
          status: 'NOT_APPLICABLE',
          thresholdUsed: programConfig?.attendanceThreshold ?? 80,
          requiredSessionCount: 0,
          attendedSessionCount: 0,
          attendancePercentage: 100,
        })),
    ]);

    const overriddenStages = new Set<string>();
    for (const log of stageOverrides) {
      const meta = log.meta as any;
      if (meta?.stage) {
        overriddenStages.add(meta.stage);
      }
    }

    // ── STAGE 1: CURRICULUM ──────────────────────────────────────────────────
    const viewedLessonIds = new Set(lessonProgressList.map((lp) => lp.lessonId));
    const passedQuizIds = new Set(
      quizAttemptsList
        .filter((a) => a.status === AttemptStatus.PASSED || a.passed === true)
        .map((a) => a.quizId),
    );
    const explicitlyCompletedSteps = new Map<string, Date | null>();
    for (const sp of stepProgressList) {
      if (sp.isCompleted) {
        explicitlyCompletedSteps.set(sp.stepId, sp.completedAt);
      }
    }

    const uncompletedStepTitles: string[] = [];
    let latestStepCompletedAt: Date | null = null;

    for (const step of publishedSteps) {
      if (explicitlyCompletedSteps.has(step.id)) {
        const completedDate = explicitlyCompletedSteps.get(step.id);
        if (completedDate && (!latestStepCompletedAt || completedDate > latestStepCompletedAt)) {
          latestStepCompletedAt = completedDate;
        }
        continue;
      }

      // Check lessons
      const allLessonsViewed =
        step.lessons.length === 0 || step.lessons.every((l) => viewedLessonIds.has(l.id));
      const quizPassed = !step.quiz || passedQuizIds.has(step.quiz.id);

      if (!allLessonsViewed || !quizPassed) {
        uncompletedStepTitles.push(step.title);
      }
    }

    const stepsWithQuiz = publishedSteps.filter((s) => s.quiz !== null);
    const unpassedQuizStepTitles = stepsWithQuiz
      .filter((s) => !s.quiz || !passedQuizIds.has(s.quiz.id))
      .map((s) => s.title);

    const stage1Overridden = overriddenStages.has(LearnerStage.STAGE_1_CURRICULUM);
    const stage1Met =
      stage1Overridden ||
      isCorporateTrack ||
      (publishedSteps.length > 0 && uncompletedStepTitles.length === 0 && unpassedQuizStepTitles.length === 0);

    const stage1CompletedAt = stage1Met
      ? enrolment.curriculumCompletedAt || latestStepCompletedAt || new Date()
      : null;

    // Cache to Enrolment if newly met
    if (stage1Met && !enrolment.curriculumCompletedAt && this.prisma.enrolment?.update) {
      await this.prisma.enrolment
        .update({
          where: { id: enrolment.id },
          data: { curriculumCompletedAt: stage1CompletedAt },
        })
        .catch((err) => this.logger.warn(`Failed to update curriculumCompletedAt: ${err.message}`));
    }

    // ── PROGRAM MILESTONE TOGGLES ────────────────────────────────────────────
    const isSequential = programConfig?.sequentialProgressionEnabled !== false;
    const isExamRequired = (programConfig?.requireExam !== false) && !isCorporateTrack && programExamCount > 0;
    const isAttendanceRequired = (programConfig?.attendanceRequired !== false) && !isCorporateTrack;
    const isCoachingRequired = (programConfig?.requireCoaching !== false) && !isCorporateTrack;
    const isMissionRequired = (programConfig?.requireMissionStatement !== false) && !isCorporateTrack;

    // ── STAGE 2: FINAL EXAM ──────────────────────────────────────────────────
    const stage1Unlocked = true;
    const stage2Unlocked = !isSequential || stage1Met;
    const stage2Overridden = overriddenStages.has(LearnerStage.STAGE_2_EXAM);

    const passedExam = examAttempts.find(
      (a) => a.status === AttemptStatus.PASSED || a.passed === true,
    );
    const oralRequired = !isCorporateTrack && programOralCount > 0;
    const passedOral = oralAssessments.find(
      (a) => a.status === OralAssessmentStatus.PASSED || a.passed === true,
    );

    const examMet = !isExamRequired || Boolean(passedExam);
    const oralMet = !oralRequired || Boolean(passedOral);
    const stage2Met =
      stage2Overridden ||
      isCorporateTrack ||
      !isExamRequired ||
      (stage2Unlocked && examMet && oralMet);

    const stage2CompletedAt = stage2Met
      ? enrolment.examPassedAt || passedExam?.completedAt || new Date()
      : null;

    if (stage2Met && !enrolment.examPassedAt && this.prisma.enrolment?.update) {
      await this.prisma.enrolment
        .update({
          where: { id: enrolment.id },
          data: { examPassedAt: stage2CompletedAt },
        })
        .catch((err) => this.logger.warn(`Failed to update examPassedAt: ${err.message}`));
    }

    // ── STAGE 3: ATTENDANCE ──────────────────────────────────────────────────
    const stage3Unlocked = !isSequential || stage2Met;
    const stage3Overridden = overriddenStages.has(LearnerStage.STAGE_3_ATTENDANCE);

    const attendanceSatisfied =
      !isAttendanceRequired ||
      attendanceCompliance.status === 'COMPLIANT' ||
      attendanceCompliance.status === 'NOT_APPLICABLE';

    const stage3Met = stage3Overridden || attendanceSatisfied;

    const stage3CompletedAt = stage3Met
      ? enrolment.attendanceSatisfiedAt || new Date()
      : null;

    if (stage3Met && !enrolment.attendanceSatisfiedAt && this.prisma.enrolment?.update) {
      await this.prisma.enrolment
        .update({
          where: { id: enrolment.id },
          data: { attendanceSatisfiedAt: stage3CompletedAt },
        })
        .catch((err) => this.logger.warn(`Failed to update attendanceSatisfiedAt: ${err.message}`));
    }

    // ── STAGE 4: 1-ON-1 COACHING ─────────────────────────────────────────────
    const stage4Unlocked = !isSequential || (stage3Unlocked && stage3Met);
    const stage4Overridden = overriddenStages.has(LearnerStage.STAGE_4_ONE_ON_ONE);
    const completedOneOnOne = oneOnOneSessions.find((s) => {
      const isCompletedStatus = s.status === SessionStatus.COMPLETED;
      const isBookingAttended = s.bookings.some((b) => b.status === BookingStatus.ATTENDED);
      const isAttendancePresent = s.attendances.some(
        (a) =>
          a.status === AttendanceStatus.PRESENT ||
          a.status === AttendanceStatus.PRESENT_AUTO ||
          a.status === AttendanceStatus.PRESENT_MANUAL ||
          a.status === AttendanceStatus.CORRECTED ||
          a.status === (AttendanceStatus as any).PRESENT_LIVE ||
          a.status === (AttendanceStatus as any).PRESENT_RECORDED,
      );
      return isCompletedStatus || isBookingAttended || isAttendancePresent;
    });

    const stage4Met =
      stage4Overridden ||
      isCorporateTrack ||
      !isCoachingRequired ||
      (stage4Unlocked && Boolean(completedOneOnOne));
    const stage4CompletedAt = stage4Met
      ? enrolment.oneOnOneCompletedAt || completedOneOnOne?.endTime || new Date()
      : null;

    if (stage4Met && !enrolment.oneOnOneCompletedAt && this.prisma.enrolment?.update) {
      await this.prisma.enrolment
        .update({
          where: { id: enrolment.id },
          data: { oneOnOneCompletedAt: stage4CompletedAt },
        })
        .catch((err) => this.logger.warn(`Failed to update oneOnOneCompletedAt: ${err.message}`));
    }

    // ── STAGE 5: MISSION STATEMENT ───────────────────────────────────────────
    const stage5Unlocked = !isSequential || (stage4Unlocked && stage4Met);
    const stage5Overridden = overriddenStages.has(LearnerStage.STAGE_5_MISSION_STATEMENT);
    const approvedMission = missionSubmissions.find(
      (m) => m.status === MissionStatementStatus.APPROVED,
    );

    const stage5Met =
      stage5Overridden ||
      isCorporateTrack ||
      !isMissionRequired ||
      (stage5Unlocked && Boolean(approvedMission || enrolment.missionStatementApprovedAt));
    const stage5CompletedAt = stage5Met
      ? enrolment.missionStatementApprovedAt || approvedMission?.reviewedAt || new Date()
      : null;

    if (stage5Met && !enrolment.missionStatementApprovedAt && this.prisma.enrolment?.update) {
      await this.prisma.enrolment
        .update({
          where: { id: enrolment.id },
          data: { missionStatementApprovedAt: stage5CompletedAt },
        })
        .catch((err) => this.logger.warn(`Failed to update missionStatementApprovedAt: ${err.message}`));
    }

    const stages: Record<LearnerStage, StageStatus> = {
      [LearnerStage.STAGE_1_CURRICULUM]: {
        stage: LearnerStage.STAGE_1_CURRICULUM,
        isUnlocked: stage1Unlocked,
        isCompleted: stage1Met,
        isOverridden: stage1Overridden,
        completedAt: stage1CompletedAt,
        details: {
          totalSteps: publishedSteps.length,
          completedSteps: publishedSteps.length - uncompletedStepTitles.length,
          uncompletedStepTitles,
          requiredQuizzes: stepsWithQuiz.length,
          passedQuizzes: stepsWithQuiz.length - unpassedQuizStepTitles.length,
          unpassedQuizStepTitles,
        },
        unmetPrerequisites: stage1Met
          ? []
          : uncompletedStepTitles.map((t) => `Step incomplete: ${t}`),
      },
      [LearnerStage.STAGE_2_EXAM]: {
        stage: LearnerStage.STAGE_2_EXAM,
        isUnlocked: stage2Unlocked,
        isCompleted: stage2Met,
        isOverridden: stage2Overridden,
        completedAt: stage2CompletedAt,
        details: {
          examRequired: isExamRequired,
          examPassed: Boolean(passedExam),
          oralRequired,
          oralPassed: Boolean(passedOral),
          examScore: passedExam?.score ?? null,
          attemptCount: examAttempts.length,
          oralScore: passedOral?.overallScore ?? null,
          oralStatus: passedOral?.status ?? null,
        },
        unmetPrerequisites: stage2Unlocked
          ? !stage2Met
            ? [
                ...(isExamRequired && !passedExam ? ['Final exam not passed'] : []),
                ...(oralRequired && !passedOral ? ['Oral assessment not passed'] : []),
              ]
            : []
          : ['Stage 1 (Curriculum) must be completed first'],
      },
      [LearnerStage.STAGE_3_ATTENDANCE]: {
        stage: LearnerStage.STAGE_3_ATTENDANCE,
        isUnlocked: stage3Unlocked,
        isCompleted: stage3Met,
        isOverridden: stage3Overridden,
        completedAt: stage3CompletedAt,
        details: {
          complianceStatus: attendanceCompliance.status,
          attendancePercentage: attendanceCompliance.attendancePercentage,
          attendedSessions: attendanceCompliance.attendedSessionCount,
          requiredSessions: attendanceCompliance.requiredSessionCount,
          thresholdPercent: attendanceCompliance.thresholdUsed,
        },
        unmetPrerequisites: stage3Unlocked
          ? !stage3Met
            ? [
                `Attendance threshold not met (${Math.round(
                  attendanceCompliance.attendancePercentage,
                )}% of ${attendanceCompliance.thresholdUsed}% required)`,
              ]
            : []
          : ['Stage 2 (Exam) must be completed before verifying attendance'],
      },
      [LearnerStage.STAGE_4_ONE_ON_ONE]: {
        stage: LearnerStage.STAGE_4_ONE_ON_ONE,
        isUnlocked: stage4Unlocked,
        isCompleted: stage4Met,
        isOverridden: stage4Overridden,
        completedAt: stage4CompletedAt,
        details: {
          completedSessionId: stage4Met ? (completedOneOnOne?.id ?? null) : null,
          completedSessionTitle: stage4Met ? (completedOneOnOne?.title ?? null) : null,
        },
        unmetPrerequisites: stage4Unlocked
          ? !stage4Met
            ? ['Required 1-on-1 coaching call has not been completed']
            : []
          : ['Stage 3 (Attendance) must be completed before 1-on-1 coaching call'],
      },
      [LearnerStage.STAGE_5_MISSION_STATEMENT]: {
        stage: LearnerStage.STAGE_5_MISSION_STATEMENT,
        isUnlocked: stage5Unlocked,
        isCompleted: stage5Met,
        isOverridden: stage5Overridden,
        completedAt: stage5CompletedAt,
        details: {
          submissionCount: missionSubmissions.length,
          latestStatus: missionSubmissions[0]?.status ?? null,
        },
        unmetPrerequisites: stage5Unlocked
          ? !stage5Met
            ? ['Handwritten mission statement has not been approved']
            : []
          : ['Stage 4 (1-on-1 coaching) must be completed before mission statement'],
      },
    };

    // Determine current active stage
    let currentStage: LearnerStage = LearnerStage.STAGE_1_CURRICULUM;
    if (!stage1Met) {
      currentStage = LearnerStage.STAGE_1_CURRICULUM;
    } else if (!stage2Met) {
      currentStage = LearnerStage.STAGE_2_EXAM;
    } else if (!stage3Met) {
      currentStage = LearnerStage.STAGE_3_ATTENDANCE;
    } else if (!stage4Met) {
      currentStage = LearnerStage.STAGE_4_ONE_ON_ONE;
    } else if (!stage5Met) {
      currentStage = LearnerStage.STAGE_5_MISSION_STATEMENT;
    } else {
      currentStage = LearnerStage.STAGE_5_MISSION_STATEMENT;
    }

    const allStagesCompleted =
      stages[LearnerStage.STAGE_1_CURRICULUM].isCompleted &&
      stages[LearnerStage.STAGE_2_EXAM].isCompleted &&
      stages[LearnerStage.STAGE_3_ATTENDANCE].isCompleted &&
      stages[LearnerStage.STAGE_4_ONE_ON_ONE].isCompleted &&
      stages[LearnerStage.STAGE_5_MISSION_STATEMENT].isCompleted;

    return {
      enrolmentId: enrolment.id,
      userId: enrolment.userId,
      programId: enrolment.programId,
      batchId: enrolment.batchId,
      certificateType,
      currentStage,
      stages,
      allStagesCompleted,
      evaluatedAt: new Date(),
    };
  }

  /**
   * Asserts that a learner has unlocked a given stage.
   * Throws ForbiddenException if previous stage prerequisites are unmet.
   */
  async assertStageUnlocked(enrolmentId: string, stage: LearnerStage): Promise<void> {
    const evaluation = await this.evaluateStages(enrolmentId);
    const targetStage = evaluation.stages[stage];

    if (!targetStage.isUnlocked) {
      const reason =
        targetStage.unmetPrerequisites && targetStage.unmetPrerequisites.length > 0
          ? targetStage.unmetPrerequisites.join('; ')
          : `Prerequisites for ${stage} have not been completed`;
      const err = new ForbiddenException(`Stage Locked: ${reason}`);
      (err as any).evaluation = evaluation;
      throw err;
    }
  }

  /**
   * Admin override to unlock a specific stage for a learner.
   * Logs an immutable AuditLog entry with STAGE_UNLOCK_OVERRIDE.
   */
  async overrideStage(
    enrolmentId: string,
    stage: LearnerStage,
    actorUser: any,
    reason: string,
  ): Promise<void> {
    const actorId = actorUser?.sub || actorUser?.userId || actorUser?.id;
    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException('A mandatory reason is required for stage overrides');
    }

    const enrolment = await this.prisma.enrolment.findUnique({
      where: { id: enrolmentId },
    });
    if (!enrolment) {
      throw new NotFoundException(`Enrolment ${enrolmentId} not found`);
    }

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'STAGE_UNLOCK_OVERRIDE',
        entity: 'Enrolment',
        entityId: enrolment.id,
        meta: {
          stage,
          reason: reason.trim(),
          userId: enrolment.userId,
          programId: enrolment.programId,
          batchId: enrolment.batchId,
        },
      },
    });

    // Invalidate evaluation by refreshing evaluation
    this.invalidateCache(enrolment.id);
    await this.evaluateStages(enrolment.id);
  }
}
