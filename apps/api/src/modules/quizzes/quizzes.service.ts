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
  Role,
  StepOverrideState,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CacheHelperService } from '../../common/cache/cache-helper.service.js';
import { ProgressionService } from '../progression/progression.service.js';
import {
  CreateQuizDto,
  ResetAttemptsDto,
  StartQuizDto,
  SubmitQuizDto,
  UpdateQuizDto,
} from './dto/index.js';

@Injectable()
export class QuizzesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
    private readonly progressionService: ProgressionService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. ADMINISTRATIVE CRUD
  // ─────────────────────────────────────────────────────────────────────────────

  async findAll() {
    const quizzes = await this.prisma.quiz.findMany({
      include: {
        step: true,
        questions: true,
      },
    });

    return quizzes.map((quiz) => ({
      id: quiz.id,
      stepId: quiz.stepId,
      step: `Step ${quiz.step.sequence}: ${quiz.step.title}`,
      questions: quiz.questions.length,
      passMark: `${quiz.passMark}%`,
      maxAttempts: quiz.maxAttempts,
      cooldownHours: quiz.cooldownHours,
      questionCount: quiz.questionCount,
      updated: new Date(quiz.updatedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    }));
  }

  async findOne(id: string) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
      include: {
        step: true,
        questions: {
          include: {
            options: {
              select: {
                id: true,
                text: true,
                order: true,
              },
            },
          },
        },
      },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    return quiz;
  }

  async create(data: CreateQuizDto) {
    const res = await this.prisma.quiz.create({ data });
    await this.cacheHelper.invalidateNamespace('programs');
    return res;
  }

  async update(id: string, data: UpdateQuizDto) {
    const res = await this.prisma.quiz.update({
      where: { id },
      data,
    });
    await this.cacheHelper.invalidateNamespace('programs');
    return res;
  }

  async remove(id: string) {
    const res = await this.prisma.quiz.delete({
      where: { id },
    });
    await this.cacheHelper.invalidateNamespace('programs');
    return res;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. QUIZ ENGINE: START / RESUME ATTEMPT
  // ─────────────────────────────────────────────────────────────────────────────

  async startQuiz(quizId: string, actor: any, dto?: StartQuizDto) {
    const actorId = actor?.sub ?? actor?.id;
    if (!actorId) {
      throw new ForbiddenException('Access denied: Authentication required');
    }

    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
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

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    // Resolve enrolment
    let enrolment: any = null;
    if (dto?.enrolmentId) {
      enrolment = await this.prisma.enrolment.findUnique({
        where: { id: dto.enrolmentId },
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
        throw new NotFoundException('Enrolment not found');
      }

      if (enrolment.programId !== quiz.step.programId) {
        throw new BadRequestException('Enrolment does not belong to this quiz program');
      }

      if (actor.role === Role.USER && enrolment.userId !== actorId) {
        throw new ForbiddenException('Access denied: You do not own this enrolment');
      }
    } else {
      enrolment = await this.prisma.enrolment.findFirst({
        where: {
          userId: actorId,
          programId: quiz.step.programId,
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
        throw new ForbiddenException('Access denied: No enrolment found for this quiz program');
      }
    }

    if (enrolment.status !== EnrolmentStatus.ACTIVE) {
      throw new ForbiddenException('Access denied: Enrolment must be ACTIVE to take a quiz');
    }

    // Progression Access Gate: Step must be unlocked (D1-033/D1-034)
    await this.progressionService.assertStepUnlocked(enrolment.id, quiz.stepId, actor);

    // Prerequisite Gate: All published lessons must be viewed unless manually unlocked (D1-034/D1-035)
    const stepProgress = await this.prisma.stepProgress.findUnique({
      where: {
        enrolmentId_stepId: {
          enrolmentId: enrolment.id,
          stepId: quiz.stepId,
        },
      },
    });
    const isManuallyUnlocked = stepProgress?.overrideState === StepOverrideState.MANUAL_UNLOCKED;

    if (!isManuallyUnlocked) {
      const publishedLessons = await this.prisma.lesson.findMany({
        where: {
          stepId: quiz.stepId,
          status: ContentStatus.PUBLISHED,
        },
        select: { id: true },
      });

      if (publishedLessons.length > 0) {
        const viewedCount = await this.prisma.userLessonProgress.count({
          where: {
            enrolmentId: enrolment.id,
            lessonId: { in: publishedLessons.map((l) => l.id) },
            viewed: true,
          },
        });

        if (viewedCount < publishedLessons.length) {
          throw new ForbiddenException(
            'All published lessons in this step must be completed before taking the quiz',
          );
        }
      }
    }

    // Resume Check: If learner already has an IN_PROGRESS attempt, return it (idempotent resume)
    const activeAttempt = await this.prisma.attempt.findFirst({
      where: {
        enrolmentId: enrolment.id,
        quizId: quiz.id,
        status: AttemptStatus.IN_PROGRESS,
      },
      include: {
        answers: {
          include: {
            question: {
              include: {
                options: {
                  select: { id: true, text: true, order: true },
                  orderBy: { order: 'asc' },
                },
              },
            },
          },
        },
      },
    });

    if (activeAttempt) {
      return this.formatAttemptResponse(activeAttempt, quiz);
    }

    // Fetch previous attempts to verify limits & cooldown
    const previousAttempts = await this.prisma.attempt.findMany({
      where: {
        enrolmentId: enrolment.id,
        quizId: quiz.id,
      },
      orderBy: { attemptNumber: 'desc' },
    });

    // Check if an authorized staff reset occurred for this enrolment and quiz
    const lastReset = await this.prisma.auditLog.findFirst({
      where: {
        action: 'QUIZ_ATTEMPTS_RESET',
        entity: 'QuizAttempt',
        entityId: `${enrolment.id}_${quiz.id}`,
      },
      orderBy: { createdAt: 'desc' },
    });

    const relevantAttempts = lastReset
      ? previousAttempts.filter((a) => a.createdAt > lastReset.createdAt)
      : previousAttempts;

    // Verify Max Attempts
    const maxAttempts = quiz.maxAttempts ?? 3;
    if (relevantAttempts.length >= maxAttempts) {
      throw new ForbiddenException(
        `Maximum attempts (${maxAttempts}) exceeded for this quiz. Contact support or your instructor.`,
      );
    }

    // Verify Cooldown Hours on failed attempts
    const latestAttempt = relevantAttempts[0];
    if (
      latestAttempt &&
      latestAttempt.status === AttemptStatus.FAILED &&
      latestAttempt.completedAt
    ) {
      const cooldownHours = quiz.cooldownHours ?? 24;
      const cooldownMs = cooldownHours * 60 * 60 * 1000;
      const nextAllowedAt = new Date(latestAttempt.completedAt.getTime() + cooldownMs);
      if (new Date() < nextAllowedAt) {
        throw new ForbiddenException(
          `Cooldown period active. You may retry after ${nextAllowedAt.toISOString()}`,
        );
      }
    }

    // Question Selection: Sample from question bank or step-tagged questions
    const candidateQuestions = await this.prisma.question.findMany({
      where: {
        OR: [
          { quizId: quiz.id },
          { stepId: quiz.stepId },
        ],
      },
      include: {
        options: {
          select: { id: true, text: true, order: true },
        },
      },
    });

    const eligibleQuestions = candidateQuestions.filter(
      (q) => Array.isArray(q.options) && q.options.length >= 2,
    );

    if (eligibleQuestions.length === 0) {
      throw new BadRequestException('No questions available in the question bank for this quiz');
    }

    const targetCount = Math.min(quiz.questionCount ?? 10, eligibleQuestions.length);
    const selectedQuestions = this.shuffleArray([...eligibleQuestions]).slice(0, targetCount);

    const nextAttemptNumber = (previousAttempts[0]?.attemptNumber ?? 0) + 1;

    // Create Attempt and pre-bind QuizAnswer rows
    const newAttempt = await this.prisma.$transaction(async (tx) => {
      const created = await tx.attempt.create({
        data: {
          enrolmentId: enrolment.id,
          quizId: quiz.id,
          attemptNumber: nextAttemptNumber,
          status: AttemptStatus.IN_PROGRESS,
          startedAt: new Date(),
        },
      });

      await tx.quizAnswer.createMany({
        data: selectedQuestions.map((q) => ({
          attemptId: created.id,
          questionId: q.id,
          pointsAwarded: 0,
          isCorrect: false,
        })),
      });

      return created;
    });

    const createdAttemptWithAnswers = await this.prisma.attempt.findUniqueOrThrow({
      where: { id: newAttempt.id },
      include: {
        answers: {
          include: {
            question: {
              include: {
                options: {
                  select: { id: true, text: true, order: true },
                  orderBy: { order: 'asc' },
                },
              },
            },
          },
        },
      },
    });

    return this.formatAttemptResponse(createdAttemptWithAnswers, quiz);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. QUIZ ENGINE: SUBMIT ATTEMPT
  // ─────────────────────────────────────────────────────────────────────────────

  async submitQuiz(quizId: string, actor: any, dto: SubmitQuizDto) {
    const actorId = actor?.sub ?? actor?.id;
    if (!actorId) {
      throw new ForbiddenException('Access denied: Authentication required');
    }

    const attempt = await this.prisma.attempt.findUnique({
      where: { id: dto.attemptId },
      include: {
        quiz: true,
        enrolment: {
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
        },
        answers: {
          include: {
            question: {
              include: {
                options: true, // Includes isCorrect for server-side evaluation only
              },
            },
          },
        },
      },
    });

    if (!attempt) {
      throw new NotFoundException('Attempt not found');
    }

    if (attempt.quizId !== quizId) {
      throw new BadRequestException('Attempt does not belong to this quiz');
    }

    if (attempt.enrolment.userId !== actorId) {
      throw new ForbiddenException('Access denied: You do not own this attempt');
    }

    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      throw new BadRequestException(
        `Attempt is already finalized with status: ${attempt.status}`,
      );
    }

    // Build question map of authoritative bound questions for this attempt
    const boundAnswersMap = new Map(attempt.answers.map((a) => [a.questionId, a]));
    const submittedAnswers = dto.answers || [];

    // Verify submitted question IDs belong to bound attempt
    for (const sub of submittedAnswers) {
      if (!boundAnswersMap.has(sub.questionId)) {
        throw new BadRequestException(
          `Question ${sub.questionId} does not belong to this attempt`,
        );
      }
    }

    const submittedMap = new Map(submittedAnswers.map((a) => [a.questionId, a]));

    let totalAvailablePoints = 0;
    let totalEarnedPoints = 0;
    let correctCount = 0;

    const answerUpdates: Array<{
      id: string;
      selectedOptionId: string | null;
      isCorrect: boolean;
      pointsAwarded: number;
    }> = [];

    for (const boundAnswer of attempt.answers) {
      const question = boundAnswer.question;
      const questionPoints = question.points ?? 1;
      totalAvailablePoints += questionPoints;

      const userSubmission = submittedMap.get(question.id);
      let isCorrect = false;
      let pointsAwarded = 0;
      let selectedOptionId: string | null = null;

      if (userSubmission && userSubmission.optionId) {
        selectedOptionId = userSubmission.optionId;
        const matchingOption = question.options.find(
          (o) => o.id === userSubmission.optionId,
        );

        if (!matchingOption) {
          throw new BadRequestException(
            `Option ${userSubmission.optionId} does not belong to question ${question.id}`,
          );
        }

        if (matchingOption.isCorrect) {
          isCorrect = true;
          pointsAwarded = questionPoints;
          correctCount += 1;
        }
      }

      totalEarnedPoints += pointsAwarded;
      answerUpdates.push({
        id: boundAnswer.id,
        selectedOptionId,
        isCorrect,
        pointsAwarded,
      });
    }

    const scorePercent =
      totalAvailablePoints > 0
        ? Math.round((totalEarnedPoints / totalAvailablePoints) * 100)
        : 0;

    const passMark = attempt.quiz.passMark ?? 75;
    const passed = scorePercent >= passMark;
    const finalStatus = passed ? AttemptStatus.PASSED : AttemptStatus.FAILED;
    const now = new Date();

    // Finalize attempt in a transaction with optimistic status check
    const finalized = await this.prisma.$transaction(async (tx) => {
      const check = await tx.attempt.findUnique({
        where: { id: attempt.id },
        select: { status: true },
      });

      if (check?.status !== AttemptStatus.IN_PROGRESS) {
        throw new BadRequestException('Attempt was already finalized by another request');
      }

      for (const update of answerUpdates) {
        await tx.quizAnswer.update({
          where: { id: update.id },
          data: {
            selectedOptionId: update.selectedOptionId,
            isCorrect: update.isCorrect,
            pointsAwarded: update.pointsAwarded,
          },
        });
      }

      return tx.attempt.update({
        where: { id: attempt.id },
        data: {
          score: scorePercent,
          passed,
          status: finalStatus,
          completedAt: now,
        },
      });
    });

    // Progression Integration: When quiz passes, trigger ProgressionService.evaluateProgression()
    if (passed) {
      await this.progressionService.evaluateProgression(attempt.enrolment, {
        persist: true,
      });
    }

    return {
      attemptId: finalized.id,
      attemptNumber: finalized.attemptNumber,
      quizId: attempt.quizId,
      score: scorePercent,
      passed,
      status: finalStatus,
      passMark,
      totalQuestions: attempt.answers.length,
      correctCount,
      completedAt: finalized.completedAt,
      retryGuidance: !passed ? attempt.quiz.retryGuidance : null,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. GET ACTIVE / CURRENT ATTEMPT (LEARNER SELF-SERVICE)
  // ─────────────────────────────────────────────────────────────────────────────

  async getActiveAttempt(quizId: string, actor: any) {
    const actorId = actor?.sub ?? actor?.id;
    if (!actorId) {
      throw new ForbiddenException('Access denied: Authentication required');
    }

    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        step: { select: { programId: true } },
      },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    const enrolment = await this.prisma.enrolment.findFirst({
      where: {
        userId: actorId,
        programId: quiz.step.programId,
      },
    });

    if (!enrolment) {
      return null;
    }

    // Check active IN_PROGRESS attempt
    const activeAttempt = await this.prisma.attempt.findFirst({
      where: {
        enrolmentId: enrolment.id,
        quizId,
        status: AttemptStatus.IN_PROGRESS,
      },
      include: {
        answers: {
          include: {
            question: {
              include: {
                options: {
                  select: { id: true, text: true, order: true },
                  orderBy: { order: 'asc' },
                },
              },
            },
          },
        },
      },
    });

    if (activeAttempt) {
      return this.formatAttemptResponse(activeAttempt, quiz);
    }

    // Fall back to most recent attempt
    const latestAttempt = await this.prisma.attempt.findFirst({
      where: {
        enrolmentId: enrolment.id,
        quizId,
      },
      orderBy: { attemptNumber: 'desc' },
    });

    if (!latestAttempt) {
      return null;
    }

    return {
      attemptId: latestAttempt.id,
      attemptNumber: latestAttempt.attemptNumber,
      quizId,
      status: latestAttempt.status,
      score: latestAttempt.score,
      passed: latestAttempt.passed,
      startedAt: latestAttempt.startedAt,
      completedAt: latestAttempt.completedAt,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. ADMINISTRATIVE: GET ENROLMENT ATTEMPTS (SCOPED)
  // ─────────────────────────────────────────────────────────────────────────────

  async getEnrolmentQuizAttempts(quizId: string, enrolmentId: string, actor: any) {
    const enrolment = await this.prisma.enrolment.findUnique({
      where: { id: enrolmentId },
      include: {
        batch: {
          include: {
            trainers: { select: { trainerId: true } },
          },
        },
      },
    });

    if (!enrolment) {
      throw new NotFoundException('Enrolment not found');
    }

    this.assertStaffBatchAccess(actor, enrolment);

    const attempts = await this.prisma.attempt.findMany({
      where: {
        enrolmentId,
        quizId,
      },
      orderBy: { attemptNumber: 'asc' },
    });

    return attempts.map((a) => ({
      id: a.id,
      attemptNumber: a.attemptNumber,
      score: a.score,
      passed: a.passed,
      status: a.status,
      startedAt: a.startedAt,
      completedAt: a.completedAt,
    }));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. ADMINISTRATIVE: RESET QUIZ ATTEMPTS
  // ─────────────────────────────────────────────────────────────────────────────

  async resetQuizAttempts(
    quizId: string,
    enrolmentId: string,
    actor: any,
    dto: ResetAttemptsDto,
    ip?: string,
  ) {
    const actorId = actor?.sub ?? actor?.id;
    if (!actorId) {
      throw new ForbiddenException('Access denied: Authentication required');
    }

    const trimmedReason = typeof dto.reason === 'string' ? dto.reason.trim() : '';
    if (!trimmedReason || trimmedReason.length < 5) {
      throw new BadRequestException('Reason must be at least 5 characters long');
    }

    const enrolment = await this.prisma.enrolment.findUnique({
      where: { id: enrolmentId },
      include: {
        batch: {
          include: {
            trainers: { select: { trainerId: true } },
          },
        },
      },
    });

    if (!enrolment) {
      throw new NotFoundException('Enrolment not found');
    }

    this.assertStaffBatchAccess(actor, enrolment);

    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    const now = new Date();

    // Log the reset action to AuditLog
    // Historical attempts are preserved for auditability and compliance
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'QUIZ_ATTEMPTS_RESET',
        entity: 'QuizAttempt',
        entityId: `${enrolmentId}_${quizId}`,
        meta: {
          enrolmentId,
          quizId,
          reason: trimmedReason,
          resetByRole: actor.role,
        },
        ip: ip || null,
        createdAt: now,
      },
    });

    return {
      success: true,
      message: 'Quiz attempts successfully reset',
      enrolmentId,
      quizId,
      resetAt: now,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  private assertStaffBatchAccess(actor: any, enrolment: any) {
    const role = actor?.role;
    const actorId = actor?.sub ?? actor?.id;

    if (role === Role.SUPER_ADMIN || role === Role.ADMIN) {
      return;
    }

    if (role === Role.MANAGER) {
      const isAssigned =
        enrolment.batch.managerId === actorId ||
        (Array.isArray(enrolment.batch.trainers) &&
          enrolment.batch.trainers.some((t: any) => t.trainerId === actorId));

      if (!isAssigned) {
        throw new ForbiddenException(
          'Access denied: You are not assigned to the batch for this enrolment',
        );
      }
      return;
    }

    throw new ForbiddenException('Access denied: Unauthorized role');
  }

  private formatAttemptResponse(attempt: any, quiz: any) {
    return {
      attemptId: attempt.id,
      attemptNumber: attempt.attemptNumber,
      quizId: quiz.id,
      stepId: quiz.stepId,
      status: attempt.status,
      passMark: quiz.passMark,
      questionCount: attempt.answers.length,
      timeLimitMin: quiz.timeLimitMin,
      startedAt: attempt.startedAt,
      questions: attempt.answers.map((ans: any) => ({
        id: ans.question.id,
        text: ans.question.text,
        type: ans.question.type,
        points: ans.question.points,
        // Strip isCorrect and present shuffled options
        options: this.shuffleArray(
          (ans.question.options || []).map((opt: any) => ({
            id: opt.id,
            text: opt.text,
            order: opt.order,
          })),
        ),
      })),
    };
  }

  private shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}
