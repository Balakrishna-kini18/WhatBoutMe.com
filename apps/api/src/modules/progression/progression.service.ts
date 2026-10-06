import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttemptStatus,
  ContentStatus,
  EnrolmentStatus,
  ReleaseSchedule,
  Role,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

export type LockReason =
  | 'ENROLMENT_NOT_ACTIVE'
  | 'PREVIOUS_STEP_INCOMPLETE'
  | 'QUIZ_NOT_PASSED'
  | 'SCHEDULED_DATE_NOT_REACHED';

export interface LessonProgressItem {
  lessonId: string;
  order: number;
  title: string;
  type: string;
  durationSec: number | null;
  isCompleted: boolean;
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
  isCompleted: boolean;
  completedAt: Date | null;
  lockReason: LockReason | null;
  lessons: LessonProgressItem[];
  quiz: QuizProgressItem | null;
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
  steps: StepProgressionItem[];
}

@Injectable()
export class ProgressionService {
  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. EVALUATE ENROLMENT PROGRESSION TREE
  // ─────────────────────────────────────────────────────────────────────────────

  async getEnrolmentProgression(
    enrolmentId: string,
    user?: any,
    options?: { persist?: boolean },
  ): Promise<EnrolmentProgressionResponse> {
    // 1. Fetch enrolment with batch, trainers, program
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
          select: { id: true, title: true, slug: true, status: true },
        },
        batch: {
          include: {
            overrides: true,
            trainers: { select: { trainerId: true } },
          },
        },
      },
    });

    if (!enrolment) {
      // Check if any enrolment exists in another status
      const fallback = await this.prisma.enrolment.findFirst({
        where: { userId, programId },
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
      },
    });

    if (!enrolment) {
      throw new NotFoundException('Enrolment not found');
    }

    this.assertUserAuthorizedForEnrolment(user, enrolment);
    return this.evaluateProgression(enrolment, { persist: true });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. CORE PROGRESSION EVALUATOR (DETERMINISTIC ENGINE)
  // ─────────────────────────────────────────────────────────────────────────────

  private async evaluateProgression(
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
          select: { lessonId: true, viewed: true },
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

    const evaluatedSteps: StepProgressionItem[] = [];
    let previousStepComplete = true; // Step 1 prerequisite is trivially satisfied
    let previousStepFailureReason: LockReason = 'PREVIOUS_STEP_INCOMPLETE';

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
      const lessons: LessonProgressItem[] = step.lessons.map((lesson) => ({
        lessonId: lesson.id,
        order: lesson.order,
        title: lesson.title,
        type: lesson.type,
        durationSec: lesson.durationSec,
        isCompleted: viewedLessonIds.has(lesson.id),
      }));

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

      if (!isEligibleForProgress) {
        // Enrolment not active/completed fails closed
        isUnlocked = false;
        lockReason = 'ENROLMENT_NOT_ACTIVE';
      } else if (isEnrolmentCompleted) {
        // Completed enrollment preserves full historical access
        isUnlocked = true;
        lockReason = null;
      } else if (stepProgress?.isUnlocked === true) {
        // Already unlocked in StepProgress
        isUnlocked = true;
        lockReason = null;
      } else if (batchOverride?.isUnlocked === true) {
        // Batch override explicitly forces unlock
        isUnlocked = true;
        lockReason = null;
        unlockedAt = unlockedAt ?? now;
      } else {
        // Normal sequential rule evaluation
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
          isUnlocked: isUnlocked || (stepProgress?.isUnlocked ?? false),
          unlockedAt: isUnlocked
            ? unlockedAt ?? now
            : stepProgress?.unlockedAt ?? null,
          isCompleted: isStepCompleted || (stepProgress?.isCompleted ?? false),
          completedAt: isStepCompleted
            ? completedAt ?? now
            : stepProgress?.completedAt ?? null,
        });
      }

      evaluatedSteps.push({
        stepId: step.id,
        sequence: step.sequence,
        title: step.title,
        releaseSchedule: step.releaseSchedule,
        unlockDelayDays: step.unlockDelayDays,
        scheduledUnlockDate,
        isUnlocked,
        unlockedAt,
        isCompleted: isStepCompleted,
        completedAt,
        lockReason,
        lessons,
        quiz: quizItem,
      });

      // Update cascading prerequisites for the next step in the loop
      previousStepComplete = isStepCompleted;
      if (!allLessonsCompleted) {
        previousStepFailureReason = 'PREVIOUS_STEP_INCOMPLETE';
      } else if (!quizCompleted) {
        previousStepFailureReason = 'QUIZ_NOT_PASSED';
      } else {
        previousStepFailureReason = 'PREVIOUS_STEP_INCOMPLETE';
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
      totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

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

    if (role === Role.MANAGER) {
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
}
