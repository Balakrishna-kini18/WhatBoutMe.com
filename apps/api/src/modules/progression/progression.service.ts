import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  AttemptStatus,
  AgreementStatus,
  ContentStatus,
  ContentType,
  EnrolmentStatus,
  ReleaseSchedule,
  Role,
  StepOverrideState,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CacheHelperService } from '../../common/cache/cache-helper.service.js';

export const DEFAULT_MEDIA_COMPLETION_THRESHOLD_PERCENT = 90.0;

export type LockReason =
  | 'ENROLMENT_NOT_ACTIVE'
  | 'AGREEMENT_REQUIRED'
  | 'PREVIOUS_STEP_INCOMPLETE'
  | 'QUIZ_NOT_PASSED'
  | 'SCHEDULED_DATE_NOT_REACHED'
  | 'MANUAL_LOCKED';


export interface LessonProgressItem {
  lessonId: string;
  order: number;
  title: string;
  type: string;
  durationSec: number | null;
  isCompleted: boolean;
  progressPercent?: number;
  lastPositionSec?: number | null;
  completedAt?: Date | null;
}

export interface LessonProgressResult {
  lessonId: string;
  enrolmentId: string;
  viewed: boolean;
  progressPercent: number;
  lastPositionSec: number | null;
  completedAt: Date | null;
  durationSec?: number | null;
}

export interface EnrolmentLessonsOverviewResponse {
  enrolmentId: string;
  programId: string;
  batchId: string;
  totalLessons: number;
  completedLessons: number;
  lessons: Array<{
    lessonId: string;
    stepId: string;
    stepSequence: number;
    order: number;
    title: string;
    type: string;
    durationSec: number | null;
    viewed: boolean;
    progressPercent: number;
    lastPositionSec: number | null;
    completedAt: Date | null;
  }>;
}

export interface QuizProgressItem {
  quizId: string;
  questionCount: number;
  passMark: number;
  isPassed: boolean;
  bestScore: number | null;
  attemptsCount: number;
}

export interface StepProgressionItem {
  stepId: string;
  sequence: number;
  title: string;
  releaseSchedule: ReleaseSchedule;
  unlockDelayDays: number | null;
  scheduledUnlockDate: Date | null;
  isUnlocked: boolean;
  unlockedAt: Date | null;
  overrideState: StepOverrideState;
  overrideReason: string | null;
  overriddenAt: Date | null;
  overriddenById: string | null;
  isCompleted: boolean;
  completedAt: Date | null;
  lockReason: LockReason | null;
  lessons: LessonProgressItem[];
  quiz: QuizProgressItem | null;
  progressPercent?: number;
  completedItems?: number;
  totalItems?: number;
}

export interface StepOverrideResult {
  enrolmentId: string;
  stepId: string;
  overrideState: StepOverrideState;
  isUnlocked: boolean;
  lockReason?: LockReason | null;
  overrideReason: string | null;
  overriddenAt: Date | null;
  overriddenById: string | null;
}

export interface EnrolmentProgressionResponse {
  enrolmentId: string;
  programId: string;
  programTitle: string;
  batchId: string;
  batchName: string;
  batchStartDate: Date;
  enrolmentStatus: EnrolmentStatus;
  overallProgressPercent: number;
  currentStepSequence: number;
  totalItems?: number;
  completedItems?: number;
  hasCertificate?: boolean;
  certificateTemplate?: string | null;
  certificate?: {
    id: string;
    status: string;
    certificateCode: string;
    issuedAt?: Date | null;
    pdfUrl?: string | null;
  } | null;
  steps: StepProgressionItem[];
}

@Injectable()
export class ProgressionService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly cacheHelper?: CacheHelperService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. EVALUATE ENROLMENT PROGRESSION TREE
  // ─────────────────────────────────────────────────────────────────────────────

  async getEnrolmentProgression(
    enrolmentId: string,
    user?: any,
    options?: { persist?: boolean; forceRecalculate?: boolean },
  ): Promise<EnrolmentProgressionResponse> {
    // 1. Fetch enrolment with batch, trainers, program, certificate
    const enrolment = await this.prisma.enrolment.findUnique({
      where: { id: enrolmentId },
      include: {
        program: {
          select: { id: true, title: true, slug: true, status: true, hasCertificate: true, certificateTemplate: true },
        },
        batch: {
          include: {
            overrides: true,
            trainers: { select: { trainerId: true } },
          },
        },
        signedAgreement: true,
        certificate: true,
      },
    });

    if (!enrolment) {
      throw new NotFoundException('Enrolment not found');
    }

    // 2. Authorization scoping check if user context is provided
    if (user) {
      this.assertUserAuthorizedForEnrolment(user, enrolment);
    }

    return this.evaluateProgression(enrolment, options);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. LEARNER SELF-SERVICE: GET PROGRESSION BY PROGRAM
  // ─────────────────────────────────────────────────────────────────────────────

  async getMyProgression(
    userId: string,
    programId: string,
  ): Promise<EnrolmentProgressionResponse> {
    const enrolment = await this.prisma.enrolment.findFirst({
      where: {
        userId,
        programId,
        status: { in: [EnrolmentStatus.ACTIVE, EnrolmentStatus.COMPLETED] },
      },
      include: {
        program: {
          select: { id: true, title: true, slug: true, status: true, hasCertificate: true, certificateTemplate: true },
        },
        batch: {
          include: {
            overrides: true,
            trainers: { select: { trainerId: true } },
          },
        },
        signedAgreement: true,
        certificate: true,
      },
    });

    if (!enrolment) {
      // Check if any enrolment exists in another status
      const fallback = await this.prisma.enrolment.findFirst({
        where: { userId, programId },
        include: {
          program: {
            select: { id: true, title: true, slug: true, status: true, hasCertificate: true, certificateTemplate: true },
          },
          batch: {
            include: {
              overrides: true,
              trainers: { select: { trainerId: true } },
            },
          },
          signedAgreement: true,
          certificate: true,
        },
      });


      if (!fallback) {
        throw new NotFoundException(
          'No enrolment found for this program and learner',
        );
      }

      return this.evaluateProgression(fallback, { persist: false });
    }

    return this.evaluateProgression(enrolment, { persist: true });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. STEP DETAIL & STATUS CHECK
  // ─────────────────────────────────────────────────────────────────────────────

  async getStepProgression(
    enrolmentId: string,
    stepId: string,
    user?: any,
  ): Promise<StepProgressionItem> {
    const tree = await this.getEnrolmentProgression(enrolmentId, user, {
      persist: true,
    });
    const item = tree.steps.find((s) => s.stepId === stepId);

    if (!item) {
      throw new NotFoundException(
        'Step not found or not published in this program',
      );
    }

    return item;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. CONTENT ACCESS GATE HELPER
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Reusable assertion verifying that Step N is currently unlocked for the learner.
   * Throws ForbiddenException if locked or unauthorized.
   */
  async assertStepUnlocked(
    enrolmentId: string,
    stepId: string,
    user?: any,
  ): Promise<boolean> {
    const step = await this.prisma.step.findUnique({
      where: { id: stepId },
      select: { id: true, programId: true, status: true },
    });

    if (!step) {
      throw new NotFoundException('Step not found');
    }

    // Direct draft leakage prevention
    if (step.status !== ContentStatus.PUBLISHED) {
      const isStaff =
        user?.role === Role.SUPER_ADMIN || user?.role === Role.ADMIN;
      if (!isStaff) {
        throw new NotFoundException('Step not found');
      }
    }

    const enrolment = await this.prisma.enrolment.findUnique({
      where: { id: enrolmentId },
      include: {
        batch: {
          include: {
            trainers: { select: { trainerId: true } },
            overrides: true,
          },
        },
        program: { select: { id: true, title: true, slug: true, status: true } },
        signedAgreement: true,
      },
    });

    if (!enrolment) {
      throw new NotFoundException('Enrolment not found');
    }

    if (step.programId !== enrolment.programId) {
      throw new BadRequestException(
        'Step does not belong to the enrolled program',
      );
    }

    if (user) {
      this.assertUserAuthorizedForEnrolment(user, enrolment);
    }

    const tree = await this.evaluateProgression(enrolment, { persist: true });
    const targetStep = tree.steps.find((s) => s.stepId === stepId);

    if (!targetStep || !targetStep.isUnlocked) {
      const reason = targetStep?.lockReason ?? 'LOCKED';
      if (reason === 'AGREEMENT_REQUIRED') {
        throw new ForbiddenException({
          statusCode: 403,
          error: 'AGREEMENT_REQUIRED',
          message: 'Step is locked: AGREEMENT_REQUIRED',
        });
      }
      throw new ForbiddenException(`Step is locked: ${reason}`);
    }

    return true;
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // 5. ADMINISTRATIVE RECALCULATION & SYNCHRONIZATION
  // ─────────────────────────────────────────────────────────────────────────────

  async recalculateProgression(
    enrolmentId: string,
    user: any,
  ): Promise<EnrolmentProgressionResponse> {
    const enrolment = await this.prisma.enrolment.findUnique({
      where: { id: enrolmentId },
      include: {
        program: {
          select: { id: true, title: true, slug: true, status: true },
        },
        batch: {
          include: {
            overrides: true,
            trainers: { select: { trainerId: true } },
          },
        },
        signedAgreement: true,
      },
    });


    if (!enrolment) {
      throw new NotFoundException('Enrolment not found');
    }

    this.assertUserAuthorizedForEnrolment(user, enrolment);
    return this.evaluateProgression(enrolment, { persist: true, forceRecalculate: true });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5b. ADMINISTRATIVE STEP OVERRIDES (D1-034)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Manually unlocks Step N for a specific learner, unconditionally granting access.
   */
  async manualUnlockStep(
    enrolmentId: string,
    stepId: string,
    actor: any,
    reason: string,
    ip?: string,
  ): Promise<StepOverrideResult> {
    return this.applyStepOverride(
      enrolmentId,
      stepId,
      actor,
      StepOverrideState.MANUAL_UNLOCKED,
      reason,
      ip,
    );
  }

  /**
   * Manually re-locks Step N for a specific learner, unconditionally denying access.
   */
  async manualRelockStep(
    enrolmentId: string,
    stepId: string,
    actor: any,
    reason: string,
    ip?: string,
  ): Promise<StepOverrideResult> {
    return this.applyStepOverride(
      enrolmentId,
      stepId,
      actor,
      StepOverrideState.MANUAL_LOCKED,
      reason,
      ip,
    );
  }

  /**
   * Resets manual override for Step N, restoring standard automatic progression.
   */
  async resetStepOverride(
    enrolmentId: string,
    stepId: string,
    actor: any,
    reason: string,
    ip?: string,
  ): Promise<StepOverrideResult> {
    return this.applyStepOverride(
      enrolmentId,
      stepId,
      actor,
      StepOverrideState.AUTOMATIC,
      reason,
      ip,
    );
  }

  private async applyStepOverride(
    enrolmentId: string,
    stepId: string,
    actor: any,
    targetState: StepOverrideState,
    reason: string,
    ip?: string,
  ): Promise<StepOverrideResult> {
    const role = actor?.role;
    const actorId = actor?.sub ?? actor?.id;

    if (!actorId) {
      throw new ForbiddenException('Access denied: Authentication required');
    }

    if (role === Role.USER) {
      throw new ForbiddenException(
        'Access denied: Learners cannot modify progression overrides',
      );
    }

    const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
    if (!trimmedReason || trimmedReason.length < 5) {
      throw new BadRequestException(
        'Reason must be at least 5 non-whitespace characters long',
      );
    }
    if (trimmedReason.length > 500) {
      throw new BadRequestException('Reason must not exceed 500 characters');
    }

    const enrolment = await this.prisma.enrolment.findUnique({
      where: { id: enrolmentId },
      include: {
        program: {
          select: { id: true, title: true, status: true },
        },
        batch: {
          include: {
            trainers: { select: { trainerId: true } },
            overrides: true,
          },
        },
      },
    });

    if (!enrolment) {
      throw new NotFoundException('Enrolment not found');
    }

    if (enrolment.status !== EnrolmentStatus.ACTIVE) {
      throw new BadRequestException(
        'Progression overrides can only be applied to ACTIVE enrolments',
      );
    }

    // Manager batch scoping and authorization check
    this.assertUserAuthorizedForEnrolment(actor, enrolment);

    const step = await this.prisma.step.findUnique({
      where: { id: stepId },
      select: {
        id: true,
        programId: true,
        sequence: true,
        title: true,
        status: true,
      },
    });

    if (!step) {
      throw new NotFoundException('Step not found');
    }

    if (step.programId !== enrolment.programId) {
      throw new BadRequestException(
        'Step does not belong to the enrolled program',
      );
    }

    const existingProgress = await this.prisma.stepProgress.findUnique({
      where: {
        enrolmentId_stepId: {
          enrolmentId,
          stepId,
        },
      },
    });

    const previousOverrideState =
      existingProgress?.overrideState ?? StepOverrideState.AUTOMATIC;
    const previousIsUnlocked = existingProgress?.isUnlocked ?? false;

    let actionName: string;
    let initialIsUnlocked: boolean;

    if (targetState === StepOverrideState.MANUAL_UNLOCKED) {
      actionName = 'STEP_MANUAL_UNLOCKED';
      initialIsUnlocked = true;
    } else if (targetState === StepOverrideState.MANUAL_LOCKED) {
      actionName = 'STEP_MANUAL_LOCKED';
      initialIsUnlocked = false;
    } else {
      actionName = 'STEP_OVERRIDE_RESET';
      initialIsUnlocked = false;
    }

    const now = new Date();

    const [progress] = await this.prisma.$transaction(async (tx) => {
      const p = await tx.stepProgress.upsert({
        where: {
          enrolmentId_stepId: {
            enrolmentId,
            stepId,
          },
        },
        create: {
          enrolmentId,
          stepId,
          isUnlocked: initialIsUnlocked,
          unlockedAt: initialIsUnlocked ? now : null,
          overrideState: targetState,
          overrideReason: trimmedReason,
          overriddenById: actorId,
          overriddenAt: now,
        },
        update: {
          isUnlocked: initialIsUnlocked,
          unlockedAt: initialIsUnlocked
            ? (existingProgress?.unlockedAt ?? now)
            : (targetState === StepOverrideState.MANUAL_LOCKED ? null : existingProgress?.unlockedAt),
          overrideState: targetState,
          overrideReason: trimmedReason,
          overriddenById: actorId,
          overriddenAt: now,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: actionName,
          entity: 'StepProgress',
          entityId: p.id,
          meta: {
            enrolmentId,
            stepId,
            stepSequence: step.sequence,
            stepTitle: step.title,
            programId: enrolment.programId,
            batchId: enrolment.batchId,
            previousOverrideState,
            newOverrideState: targetState,
            previousIsUnlocked,
            newIsUnlocked: initialIsUnlocked,
            reason: trimmedReason,
          },
          ip: ip ?? null,
        },
      });

      return [p];
    });

    // Re-evaluate entire progression tree to propagate changes and persist downstream step states
    const tree = await this.evaluateProgression(enrolment, { persist: true, forceRecalculate: true });
    const targetStep = tree.steps.find((s) => s.stepId === stepId);

    return {
      enrolmentId,
      stepId,
      overrideState: targetState,
      isUnlocked: targetStep ? targetStep.isUnlocked : initialIsUnlocked,
      lockReason: targetStep?.lockReason ?? null,
      overrideReason: trimmedReason,
      overriddenAt: progress.overriddenAt,
      overriddenById: progress.overriddenById,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. CORE PROGRESSION EVALUATOR (DETERMINISTIC ENGINE)
  // ─────────────────────────────────────────────────────────────────────────────

  async evaluateProgression(
    enrolment: any,
    options?: { persist?: boolean; forceRecalculate?: boolean },
  ): Promise<EnrolmentProgressionResponse> {
    const force = options?.forceRecalculate === true;
    if (this.cacheHelper) {
      if (force) {
        await this.cacheHelper.invalidateNamespace(`enrolment_progression:${enrolment.id}`);
      }
      const cacheKey = await this.cacheHelper.getVersionedKey(`enrolment_progression:${enrolment.id}`, 'tree');
      return this.cacheHelper.getOrSet(
        cacheKey,
        () => this.evaluateProgressionInternal(enrolment, options),
        3600
      );
    }
    return this.evaluateProgressionInternal(enrolment, options);
  }

  private async evaluateProgressionInternal(
    enrolment: any,
    options?: { persist?: boolean },
  ): Promise<EnrolmentProgressionResponse> {
    const now = new Date();
    const shouldPersist = options?.persist !== false;

    // 1. Fetch all published steps for the enrolled program in sequence order
    const publishedSteps = await this.prisma.step.findMany({
      where: {
        programId: enrolment.programId,
        status: ContentStatus.PUBLISHED,
      },
      orderBy: { sequence: 'asc' },
      include: {
        lessons: {
          where: { status: ContentStatus.PUBLISHED },
          orderBy: { order: 'asc' },
          select: {
            id: true,
            order: true,
            title: true,
            type: true,
            durationSec: true,
          },
        },
        quiz: {
          select: {
            id: true,
            passMark: true,
            questionCount: true,
          },
        },
      },
    });

    // 2. Fetch existing learner evidence for this enrollment
    const [lessonProgressList, attemptsList, stepProgressList] =
      await Promise.all([
        this.prisma.userLessonProgress.findMany({
          where: { enrolmentId: enrolment.id },
          select: {
            lessonId: true,
            viewed: true,
            progressPercent: true,
            lastPositionSec: true,
            completedAt: true,
          },
        }),
        this.prisma.attempt.findMany({
          where: { enrolmentId: enrolment.id },
          select: { quizId: true, status: true, passed: true, score: true },
        }),
        this.prisma.stepProgress.findMany({
          where: { enrolmentId: enrolment.id },
        }),
      ]);

    // 3. Fast lookup indices
    const lessonProgressMap = new Map<string, any>(
      lessonProgressList.map((lp) => [lp.lessonId, lp]),
    );

    const viewedLessonIds = new Set<string>(
      lessonProgressList.filter((lp) => lp.viewed).map((lp) => lp.lessonId),
    );

    const passedQuizIds = new Set<string>(
      attemptsList
        .filter(
          (a) => a.status === AttemptStatus.PASSED || a.passed === true,
        )
        .map((a) => a.quizId),
    );

    const quizAttemptStats = new Map<
      string,
      { bestScore: number | null; count: number }
    >();
    for (const attempt of attemptsList) {
      const cur = quizAttemptStats.get(attempt.quizId) ?? {
        bestScore: null,
        count: 0,
      };
      cur.count += 1;
      if (
        attempt.score !== null &&
        (cur.bestScore === null || attempt.score > cur.bestScore)
      ) {
        cur.bestScore = attempt.score;
      }
      quizAttemptStats.set(attempt.quizId, cur);
    }

    const stepProgressMap = new Map<string, any>(
      stepProgressList.map((sp) => [sp.stepId, sp]),
    );

    const batchOverridesMap = new Map<string, any>(
      (enrolment.batch.overrides || []).map((o: any) => [o.stepId, o]),
    );

    const isEnrolmentActive = enrolment.status === EnrolmentStatus.ACTIVE;
    const isEnrolmentCompleted = enrolment.status === EnrolmentStatus.COMPLETED;
    const isEligibleForProgress = isEnrolmentActive || isEnrolmentCompleted;

    // D1-041: Check agreement requirement and signed agreement status
    let signedAgreement = enrolment.signedAgreement;
    if (signedAgreement === undefined && this.prisma.signedAgreement?.findUnique) {
      signedAgreement =
        (await this.prisma.signedAgreement.findUnique({
          where: { enrolmentId: enrolment.id },
        })) ?? null;
    }

    const hasValidSignedAgreement =
      signedAgreement?.status === AgreementStatus.SIGNED;

    let agreementRequired =
      enrolment.status === EnrolmentStatus.PENDING_AGREEMENT;

    if (!agreementRequired && this.prisma.agreementTemplate?.findFirst) {
      const template = await this.prisma.agreementTemplate.findFirst({
        where: { programId: enrolment.programId },
        select: { id: true },
      });
      if (template) {
        agreementRequired = true;
      }
    }

    const isAgreementBlocked = agreementRequired && !hasValidSignedAgreement;

    const evaluatedSteps: StepProgressionItem[] = [];
    let previousStepComplete = true; // Step 1 prerequisite is trivially satisfied
    let previousStepFailureReason: LockReason = isAgreementBlocked
      ? 'AGREEMENT_REQUIRED'
      : 'PREVIOUS_STEP_INCOMPLETE';

    const updatesToPersist: Array<{
      stepId: string;
      isUnlocked: boolean;
      unlockedAt?: Date | null;
      isCompleted: boolean;
      completedAt?: Date | null;
    }> = [];

    // 4. Sequential progression walk
    for (let i = 0; i < publishedSteps.length; i++) {
      const step = publishedSteps[i];
      const stepProgress = stepProgressMap.get(step.id);
      const batchOverride = batchOverridesMap.get(step.id);


      // Map lesson items with completion state
      const lessons: LessonProgressItem[] = step.lessons.map((lesson) => {
        const lp = lessonProgressMap.get(lesson.id);
        return {
          lessonId: lesson.id,
          order: lesson.order,
          title: lesson.title,
          type: lesson.type,
          durationSec: lesson.durationSec,
          isCompleted: viewedLessonIds.has(lesson.id),
          progressPercent: lp?.progressPercent ?? 0,
          lastPositionSec: lp?.lastPositionSec ?? null,
          completedAt: lp?.completedAt ?? null,
        };
      });

      // Map quiz stats
      let quizItem: QuizProgressItem | null = null;
      if (step.quiz) {
        const stats = quizAttemptStats.get(step.quiz.id);
        quizItem = {
          quizId: step.quiz.id,
          questionCount: step.quiz.questionCount,
          passMark: step.quiz.passMark,
          isPassed: passedQuizIds.has(step.quiz.id),
          bestScore: stats?.bestScore ?? null,
          attemptsCount: stats?.count ?? 0,
        };
      }

      // Check step completion criteria
      const allLessonsCompleted =
        step.lessons.length === 0 ||
        step.lessons.every((l) => viewedLessonIds.has(l.id));

      const quizCompleted = !step.quiz || passedQuizIds.has(step.quiz.id);

      const isStepCompleted =
        (stepProgress?.isCompleted ?? false) ||
        (allLessonsCompleted && quizCompleted);

      const completedAt = isStepCompleted
        ? stepProgress?.completedAt ?? (allLessonsCompleted && quizCompleted ? now : null)
        : null;

      // Calculate scheduled unlock date using UTC-safe timestamp math
      let scheduledUnlockDate: Date | null = null;
      if (step.releaseSchedule === ReleaseSchedule.BATCH_SCHEDULED) {
        const delayDays = step.unlockDelayDays ?? 0;
        const baseTime = new Date(enrolment.batch.startDate).getTime();
        scheduledUnlockDate = new Date(baseTime + delayDays * 86400000);

        if (batchOverride?.unlockDate) {
          scheduledUnlockDate = new Date(batchOverride.unlockDate);
        }
      }

      // Determine unlock eligibility
      let isUnlocked = false;
      let lockReason: LockReason | null = null;
      let unlockedAt = stepProgress?.unlockedAt ?? null;
      const overrideState: StepOverrideState =
        stepProgress?.overrideState ?? StepOverrideState.AUTOMATIC;
      const overrideReason: string | null = stepProgress?.overrideReason ?? null;
      const overriddenAt: Date | null = stepProgress?.overriddenAt ?? null;
      const overriddenById: string | null = stepProgress?.overriddenById ?? null;

      if (isAgreementBlocked) {
        // D1-041: Step 1 and all learning content stay locked until agreement is signed
        // Never allow manual unlock or batch override to bypass an unsigned agreement
        isUnlocked = false;
        lockReason = 'AGREEMENT_REQUIRED';
      } else if (!isEligibleForProgress) {
        // Enrolment not active/completed fails closed
        isUnlocked = false;
        lockReason = 'ENROLMENT_NOT_ACTIVE';
      } else if (isEnrolmentCompleted) {
        // Completed enrollment preserves full historical access
        isUnlocked = true;
        lockReason = null;
      } else if (overrideState === StepOverrideState.MANUAL_LOCKED) {
        // D1-034: Explicit manual re-lock strictly overrides all automatic and batch unlocks
        isUnlocked = false;
        lockReason = 'MANUAL_LOCKED';
      } else if (overrideState === StepOverrideState.MANUAL_UNLOCKED) {
        // D1-034: Explicit manual unlock strictly overrides prerequisites and scheduled release dates
        isUnlocked = true;
        lockReason = null;
        unlockedAt = unlockedAt ?? now;
      } else if (batchOverride?.isUnlocked === true) {
        // Cohort-level batch override forces unlock for cohort
        isUnlocked = true;
        lockReason = null;
        unlockedAt = unlockedAt ?? now;
      } else if (isStepCompleted) {
        // Completed step retains review access
        isUnlocked = true;
        lockReason = null;
      } else {
        // Normal sequential rule evaluation (AUTOMATIC)
        const isFirstStep = step.sequence === 1 || i === 0;

        if (!isFirstStep && !previousStepComplete) {
          isUnlocked = false;
          lockReason = previousStepFailureReason;
        } else {
          // Prerequisites are satisfied. Check release schedule.
          if (step.releaseSchedule === ReleaseSchedule.IMMEDIATE) {
            isUnlocked = true;
            lockReason = null;
            unlockedAt = unlockedAt ?? now;
          } else if (step.releaseSchedule === ReleaseSchedule.BATCH_SCHEDULED) {
            if (scheduledUnlockDate && now >= scheduledUnlockDate) {
              isUnlocked = true;
              lockReason = null;
              unlockedAt = unlockedAt ?? now;
            } else {
              isUnlocked = false;
              lockReason = 'SCHEDULED_DATE_NOT_REACHED';
            }
          }
        }
      }

      // Record state changes that need persistence
      if (
        shouldPersist &&
        isEnrolmentActive &&
        (isUnlocked !== stepProgress?.isUnlocked ||
          isStepCompleted !== stepProgress?.isCompleted)
      ) {
        updatesToPersist.push({
          stepId: step.id,
          isUnlocked,
          unlockedAt: isUnlocked
            ? unlockedAt ?? now
            : (overrideState === StepOverrideState.MANUAL_LOCKED ? null : stepProgress?.unlockedAt ?? null),
          isCompleted: isStepCompleted || (stepProgress?.isCompleted ?? false),
          completedAt: isStepCompleted
            ? completedAt ?? now
            : stepProgress?.completedAt ?? null,
        });
      }

      const stepTotalItems = step.lessons.length + (step.quiz ? 1 : 0);
      const stepCompletedItems =
        step.lessons.filter((l) => viewedLessonIds.has(l.id)).length +
        (step.quiz && passedQuizIds.has(step.quiz.id) ? 1 : 0);
      const stepProgressPercent =
        stepTotalItems > 0
          ? (isStepCompleted ? 100 : Math.floor((stepCompletedItems / stepTotalItems) * 100))
          : 100;

      evaluatedSteps.push({
        stepId: step.id,
        sequence: step.sequence,
        title: step.title,
        releaseSchedule: step.releaseSchedule,
        unlockDelayDays: step.unlockDelayDays,
        scheduledUnlockDate,
        isUnlocked,
        unlockedAt,
        overrideState,
        overrideReason,
        overriddenAt,
        overriddenById,
        isCompleted: isStepCompleted,
        completedAt,
        lockReason,
        lessons,
        quiz: quizItem,
        progressPercent: stepProgressPercent,
        completedItems: stepCompletedItems,
        totalItems: stepTotalItems,
      });

      // Update cascading prerequisites for the next step in the loop
      previousStepComplete = isStepCompleted;
      if (!isStepCompleted) {
        if (isAgreementBlocked) {
          previousStepFailureReason = 'AGREEMENT_REQUIRED';
        } else if (!allLessonsCompleted) {
          previousStepFailureReason = 'PREVIOUS_STEP_INCOMPLETE';
        } else if (!quizCompleted) {
          previousStepFailureReason = 'QUIZ_NOT_PASSED';
        } else {
          previousStepFailureReason = 'PREVIOUS_STEP_INCOMPLETE';
        }
      }

    }

    // 5. Persist synchronized states asynchronously without blocking read response
    if (updatesToPersist.length > 0) {
      await this.persistStepProgressUpdates(enrolment.id, updatesToPersist);
    }

    // 6. Calculate overall progress metrics
    // Overall progress percent = (completed published lessons + passed published quizzes) / (total published lessons + total published quizzes)
    let totalItems = 0;
    let completedItems = 0;

    for (const s of evaluatedSteps) {
      totalItems += s.lessons.length;
      completedItems += s.lessons.filter((l) => l.isCompleted).length;

      if (s.quiz) {
        totalItems += 1;
        if (s.quiz.isPassed) {
          completedItems += 1;
        }
      }
    }

    const overallProgressPercent =
      totalItems > 0
        ? (completedItems === totalItems ? 100 : Math.floor((completedItems / totalItems) * 100))
        : 0;

    // Current step sequence: lowest sequence among incomplete steps
    const firstIncompleteStep = evaluatedSteps.find((s) => !s.isCompleted);
    const currentStepSequence = firstIncompleteStep
      ? firstIncompleteStep.sequence
      : evaluatedSteps[evaluatedSteps.length - 1]?.sequence ?? 1;

    return {
      enrolmentId: enrolment.id,
      programId: enrolment.programId,
      programTitle: enrolment.program.title,
      batchId: enrolment.batchId,
      batchName: enrolment.batch.name,
      batchStartDate: enrolment.batch.startDate,
      enrolmentStatus: enrolment.status,
      overallProgressPercent,
      currentStepSequence,
      totalItems,
      completedItems,
      hasCertificate: enrolment.program?.hasCertificate ?? true,
      certificateTemplate: enrolment.program?.certificateTemplate ?? null,
      certificate: enrolment.certificate
        ? {
            id: enrolment.certificate.id,
            status: enrolment.certificate.status,
            certificateCode: enrolment.certificate.certificateCode,
            issuedAt: enrolment.certificate.issuedAt || enrolment.certificate.createdAt,
            pdfUrl: enrolment.certificate.pdfUrl,
          }
        : null,
      steps: evaluatedSteps,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. PERSISTENCE HELPER
  // ─────────────────────────────────────────────────────────────────────────────

  private async persistStepProgressUpdates(
    enrolmentId: string,
    updates: Array<{
      stepId: string;
      isUnlocked: boolean;
      unlockedAt?: Date | null;
      isCompleted: boolean;
      completedAt?: Date | null;
    }>,
  ) {
    await this.prisma.$transaction(
      updates.map((u) =>
        this.prisma.stepProgress.upsert({
          where: {
            enrolmentId_stepId: {
              enrolmentId,
              stepId: u.stepId,
            },
          },
          create: {
            enrolmentId,
            stepId: u.stepId,
            isUnlocked: u.isUnlocked,
            unlockedAt: u.unlockedAt ?? null,
            isCompleted: u.isCompleted,
            completedAt: u.completedAt ?? null,
          },
          update: {
            isUnlocked: u.isUnlocked,
            unlockedAt: u.unlockedAt ?? undefined,
            isCompleted: u.isCompleted,
            completedAt: u.completedAt ?? undefined,
          },
        }),
      ),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. AUTHORIZATION CHECKER
  // ─────────────────────────────────────────────────────────────────────────────

  private assertUserAuthorizedForEnrolment(user: any, enrolment: any) {
    const role = user?.role;
    const userId = user?.sub ?? user?.id;

    if (role === Role.SUPER_ADMIN || role === Role.ADMIN) {
      return;
    }

    if (role === Role.USER) {
      if (enrolment.userId !== userId) {
        throw new ForbiddenException(
          'Access denied: You do not own this enrolment',
        );
      }
      return;
    }

    if ((role === Role.MANAGER || role === 'MANAGER' || role === 'TEACHER')) {
      const isAssigned =
        enrolment.batch.managerId === userId ||
        (Array.isArray(enrolment.batch.trainers) &&
          enrolment.batch.trainers.some((t: any) => t.trainerId === userId));

      if (!isAssigned) {
        throw new ForbiddenException(
          'Access denied: You are not assigned to the batch for this enrolment',
        );
      }
      return;
    }

    throw new ForbiddenException('Access denied: Unauthorized role');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. D1-035: LESSON PROGRESSION TRACKING
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Records media playback progress (heartbeat) for VIDEO or AUDIO lessons.
   * Calculates progressPercent server-side from authoritative Lesson.durationSec.
   * Progress percent is monotonic (never decreases).
   * viewed is irreversible once true.
   * completedAt is immutable after first completion.
   */
  async recordMediaProgress(
    lessonId: string,
    actor: any,
    positionSec: number,
    videoDurationSec?: number,
    isEnded?: boolean,
  ): Promise<LessonProgressResult> {
    const actorId = actor?.sub ?? actor?.id;
    if (!actorId) {
      throw new ForbiddenException('Access denied: Authentication required');
    }

    if (
      typeof positionSec !== 'number' ||
      !Number.isFinite(positionSec) ||
      positionSec < 0
    ) {
      throw new BadRequestException(
        'positionSec must be a non-negative finite number',
      );
    }

    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        step: {
          select: {
            id: true,
            programId: true,
            sequence: true,
            status: true,
          },
        },
      },
    });

    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }

    if (
      lesson.type !== ContentType.VIDEO &&
      lesson.type !== ContentType.AUDIO
    ) {
      throw new BadRequestException(
        'Lesson is not a media type (VIDEO or AUDIO). Heartbeat tracking is only supported for video/audio',
      );
    }

    const enrolment = await this.prisma.enrolment.findFirst({
      where: {
        userId: actorId,
        programId: lesson.step.programId,
      },
      include: {
        batch: {
          include: {
            trainers: { select: { trainerId: true } },
            overrides: true,
          },
        },
        program: {
          select: { id: true, title: true, status: true },
        },
      },
    });

    if (!enrolment) {
      throw new ForbiddenException(
        'Access denied: No enrolment found for this lesson program',
      );
    }

    if (enrolment.status !== EnrolmentStatus.ACTIVE) {
      throw new ForbiddenException('Access denied: Enrolment is not ACTIVE');
    }

    // Call D1-033/D1-034 step access gate
    await this.assertStepUnlocked(enrolment.id, lesson.stepId, actor);

    // Determine effective duration
    let effectiveDuration = lesson.durationSec;
    if (videoDurationSec && videoDurationSec > 0) {
      effectiveDuration = Math.round(videoDurationSec);
      if (!lesson.durationSec || Math.abs(lesson.durationSec - effectiveDuration) > 5) {
        await this.prisma.lesson.update({
          where: { id: lesson.id },
          data: { durationSec: effectiveDuration },
        }).catch(() => {});
      }
    }

    // Calculate percentage server-side
    let clampedPosition = positionSec;
    let calculatedPercent = 0;

    if (effectiveDuration && effectiveDuration > 0) {
      clampedPosition = Math.min(positionSec, effectiveDuration);
      calculatedPercent = (clampedPosition / effectiveDuration) * 100;
    }

    if (isEnded || (effectiveDuration && clampedPosition >= effectiveDuration - 2)) {
      calculatedPercent = 100;
      clampedPosition = effectiveDuration || positionSec;
    }

    const existingProgress = await this.prisma.userLessonProgress.findUnique({
      where: {
        enrolmentId_lessonId: {
          enrolmentId: enrolment.id,
          lessonId: lesson.id,
        },
      },
    });

    const prevPercent = existingProgress?.progressPercent ?? 0;
    const newProgressPercent = Math.max(prevPercent, calculatedPercent);

    // lastPositionSec represents latest accepted playback position and may move backward (e.g. rewind)
    const lastPositionSec = clampedPosition;

    // Authoritative completion rule:
    // Award completion if video is ended, 100% reached, or meets completion threshold
    const earnedCompletion =
      Boolean(isEnded) ||
      newProgressPercent >= 90 ||
      (effectiveDuration != null &&
        effectiveDuration > 0 &&
        newProgressPercent >= DEFAULT_MEDIA_COMPLETION_THRESHOLD_PERCENT);

    const viewed = (existingProgress?.viewed ?? false) || earnedCompletion;

    // completedAt is immutable after first completion
    const completedAt =
      existingProgress?.completedAt ??
      (viewed ? new Date() : null);

    const updatedProgress = await this.prisma.userLessonProgress.upsert({
      where: {
        enrolmentId_lessonId: {
          enrolmentId: enrolment.id,
          lessonId: lesson.id,
        },
      },
      create: {
        enrolmentId: enrolment.id,
        lessonId: lesson.id,
        viewed,
        progressPercent: newProgressPercent,
        lastPositionSec,
        completedAt,
      },
      update: {
        viewed,
        progressPercent: newProgressPercent,
        lastPositionSec,
        completedAt,
      },
    });

    // Progression evaluation trigger if lesson newly transitioned to viewed
    const transitionToCompleted = viewed && !(existingProgress?.viewed ?? false);
    if (transitionToCompleted) {
      await this.evaluateProgression(enrolment, { persist: true, forceRecalculate: true });
      if (this.cacheHelper) {
        await this.cacheHelper.invalidateNamespace(`auth_user:${actorId}`);
        await this.cacheHelper.invalidateNamespace('users');
      }
    }

    return {
      lessonId: lesson.id,
      enrolmentId: enrolment.id,
      viewed: updatedProgress.viewed,
      progressPercent: updatedProgress.progressPercent,
      lastPositionSec: updatedProgress.lastPositionSec,
      completedAt: updatedProgress.completedAt,
      durationSec: lesson.durationSec,
    };
  }

  /**
   * Records completion for document (PDF) or reading confirmation (TEXT) lessons.
   * Rejects VIDEO and AUDIO.
   */
  async completeDocumentOrTextLesson(
    lessonId: string,
    actor: any,
  ): Promise<LessonProgressResult> {
    const actorId = actor?.sub ?? actor?.id;
    if (!actorId) {
      throw new ForbiddenException('Access denied: Authentication required');
    }

    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        step: {
          select: {
            id: true,
            programId: true,
            sequence: true,
            status: true,
          },
        },
      },
    });

    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }

    if (
      lesson.type === ContentType.VIDEO ||
      lesson.type === ContentType.AUDIO
    ) {
      throw new BadRequestException(
        'Media lessons (VIDEO/AUDIO) must be completed via media progress heartbeat',
      );
    }

    const enrolment = await this.prisma.enrolment.findFirst({
      where: {
        userId: actorId,
        programId: lesson.step.programId,
      },
      include: {
        batch: {
          include: {
            trainers: { select: { trainerId: true } },
            overrides: true,
          },
        },
        program: {
          select: { id: true, title: true, status: true },
        },
      },
    });

    if (!enrolment) {
      throw new ForbiddenException(
        'Access denied: No enrolment found for this lesson program',
      );
    }

    if (enrolment.status !== EnrolmentStatus.ACTIVE) {
      throw new ForbiddenException('Access denied: Enrolment is not ACTIVE');
    }

    // Call D1-033/D1-034 step access gate
    await this.assertStepUnlocked(enrolment.id, lesson.stepId, actor);

    const existingProgress = await this.prisma.userLessonProgress.findUnique({
      where: {
        enrolmentId_lessonId: {
          enrolmentId: enrolment.id,
          lessonId: lesson.id,
        },
      },
    });

    const viewed = true;
    const progressPercent = 100.0;
    const completedAt = existingProgress?.completedAt ?? new Date();
    const lastPositionSec = existingProgress?.lastPositionSec ?? null;

    const updatedProgress = await this.prisma.userLessonProgress.upsert({
      where: {
        enrolmentId_lessonId: {
          enrolmentId: enrolment.id,
          lessonId: lesson.id,
        },
      },
      create: {
        enrolmentId: enrolment.id,
        lessonId: lesson.id,
        viewed,
        progressPercent,
        lastPositionSec,
        completedAt,
      },
      update: {
        viewed,
        progressPercent,
        completedAt,
      },
    });

    const transitionToCompleted = !(existingProgress?.viewed ?? false);
    if (transitionToCompleted) {
      await this.evaluateProgression(enrolment, { persist: true, forceRecalculate: true });
      if (this.cacheHelper) {
        await this.cacheHelper.invalidateNamespace(`auth_user:${actorId}`);
        await this.cacheHelper.invalidateNamespace('users');
      }
    }

    return {
      lessonId: lesson.id,
      enrolmentId: enrolment.id,
      viewed: updatedProgress.viewed,
      progressPercent: updatedProgress.progressPercent,
      lastPositionSec: updatedProgress.lastPositionSec,
      completedAt: updatedProgress.completedAt,
      durationSec: lesson.durationSec,
    };
  }

  /**
   * Retrieves learner progress for a specific lesson.
   * Derives enrolment from authenticated user to prevent IDOR.
   */
  async getLearnerLessonProgress(
    lessonId: string,
    actor: any,
  ): Promise<LessonProgressResult> {
    const actorId = actor?.sub ?? actor?.id;
    if (!actorId) {
      throw new ForbiddenException('Access denied: Authentication required');
    }

    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        step: {
          select: {
            id: true,
            programId: true,
            sequence: true,
            status: true,
          },
        },
      },
    });

    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }

    const enrolment = await this.prisma.enrolment.findFirst({
      where: {
        userId: actorId,
        programId: lesson.step.programId,
      },
      include: {
        batch: {
          include: {
            trainers: { select: { trainerId: true } },
            overrides: true,
          },
        },
        program: {
          select: { id: true, title: true, status: true },
        },
      },
    });

    if (!enrolment) {
      throw new ForbiddenException(
        'Access denied: No enrolment found for this lesson program',
      );
    }

    if (
      enrolment.status !== EnrolmentStatus.ACTIVE &&
      enrolment.status !== EnrolmentStatus.COMPLETED
    ) {
      throw new ForbiddenException(
        'Access denied: Enrolment is not ACTIVE or COMPLETED',
      );
    }

    await this.assertStepUnlocked(enrolment.id, lesson.stepId, actor);

    const progress = await this.prisma.userLessonProgress.findUnique({
      where: {
        enrolmentId_lessonId: {
          enrolmentId: enrolment.id,
          lessonId: lesson.id,
        },
      },
    });

    return {
      lessonId: lesson.id,
      enrolmentId: enrolment.id,
      viewed: progress?.viewed ?? false,
      progressPercent: progress?.progressPercent ?? 0,
      lastPositionSec: progress?.lastPositionSec ?? null,
      completedAt: progress?.completedAt ?? null,
      durationSec: lesson.durationSec,
    };
  }

  /**
   * Administrative/Staff overview of all lessons for an enrolment.
   * Enforces manager batch scoping and Permission.STEPS_READ.
   */
  async getEnrolmentLessonsProgress(
    enrolmentId: string,
    actor: any,
  ): Promise<EnrolmentLessonsOverviewResponse> {
    const enrolment = await this.prisma.enrolment.findUnique({
      where: { id: enrolmentId },
      include: {
        program: { select: { id: true, title: true, status: true } },
        batch: {
          include: {
            trainers: { select: { trainerId: true } },
            overrides: true,
          },
        },
      },
    });

    if (!enrolment) {
      throw new NotFoundException('Enrolment not found');
    }

    this.assertUserAuthorizedForEnrolment(actor, enrolment);

    const steps = await this.prisma.step.findMany({
      where: {
        programId: enrolment.programId,
        status: ContentStatus.PUBLISHED,
      },
      orderBy: { sequence: 'asc' },
      include: {
        lessons: {
          where: { status: ContentStatus.PUBLISHED },
          orderBy: { order: 'asc' },
        },
      },
    });

    const progressRecords = await this.prisma.userLessonProgress.findMany({
      where: { enrolmentId },
    });

    const progressMap = new Map(progressRecords.map((p) => [p.lessonId, p]));

    const lessons = steps.flatMap((step) =>
      step.lessons.map((lesson) => {
        const p = progressMap.get(lesson.id);
        return {
          lessonId: lesson.id,
          stepId: step.id,
          stepSequence: step.sequence,
          order: lesson.order,
          title: lesson.title,
          type: lesson.type,
          durationSec: lesson.durationSec,
          viewed: p?.viewed ?? false,
          progressPercent: p?.progressPercent ?? 0,
          lastPositionSec: p?.lastPositionSec ?? null,
          completedAt: p?.completedAt ?? null,
        };
      }),
    );

    return {
      enrolmentId: enrolment.id,
      programId: enrolment.programId,
      batchId: enrolment.batchId,
      totalLessons: lessons.length,
      completedLessons: lessons.filter((l) => l.viewed).length,
      lessons,
    };
  }
}

