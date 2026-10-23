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
  QuestionType,
  Role,
  StepOverrideState,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CacheHelperService } from '../../common/cache/cache-helper.service.js';
import { ProgressionService } from '../progression/progression.service.js';
import {
  CreateQuestionDto,
  CreateQuizDto,
  ResetAttemptsDto,
  StartQuizDto,
  SubmitQuizDto,
  UpdateQuestionDto,
  UpdateQuizDto,
} from './dto/index.js';

@Injectable()
export class QuizzesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
    private readonly progressionService: ProgressionService,
  ) {}

  private async safeInvalidateTags(tags: string[]) {
    if (typeof (this.cacheHelper as any)?.invalidateTags === 'function') {
      await this.cacheHelper.invalidateTags(tags);
    } else if (typeof (this.cacheHelper as any)?.invalidateNamespace === 'function') {
      for (const tag of tags) {
        await (this.cacheHelper as any).invalidateNamespace(tag);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. ADMINISTRATIVE CRUD
  // ─────────────────────────────────────────────────────────────────────────────

  async findAll() {
    const quizzes = await this.prisma.quiz.findMany({
      include: {
        step: {
          include: {
            program: {
              include: {
                exams: true,
              },
            },
          },
        },
        questions: {
          include: {
            options: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return quizzes.map((quiz) => {
      const qTypes = Array.from(new Set(quiz.questions.map((q) => q.type)));
      const visualCount = quiz.questions.filter(
        (q) => Boolean(q.imageUrl) || q.options?.some((opt) => Boolean(opt.imageUrl)),
      ).length;
      const feedsFinalExam =
        (quiz.step?.program?.exams && quiz.step.program.exams.length > 0) || true;

      return {
        id: quiz.id,
        stepId: quiz.stepId,
        step: `Step ${quiz.step.sequence}: ${quiz.step.title}`,
        stepSequence: quiz.step.sequence,
        stepTitle: quiz.step.title,
        programTitle: quiz.step.program?.title || '11 Steps to U',
        questions: quiz.questions.length,
        passMark: `${quiz.passMark}%`,
        maxAttempts: quiz.maxAttempts,
        cooldownHours: quiz.cooldownHours,
        questionCount: quiz.questionCount,
        quizPlacement: quiz.quizPlacement || 'AFTER_VIDEO',
        questionTypes: qTypes,
        visualCount,
        feedsFinalExam,
        updated: new Date(quiz.updatedAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
      };
    });
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
                isCorrect: true,
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
    // Idempotent upsert: if a quiz already exists for this stepId, update and return it
    if (data.stepId) {
      const existing = await this.prisma.quiz.findUnique({
        where: { stepId: data.stepId },
      });
      if (existing) {
        const { stepId, questions, ...updateFields } = data;
        const res = await this.prisma.quiz.update({
          where: { id: existing.id },
          data: updateFields,
        });
        if (data.quizPlacement) {
          await this.prisma.step.update({
            where: { id: data.stepId },
            data: { quizPlacement: data.quizPlacement },
          }).catch(() => {});
        }
        await this.safeInvalidateTags(['programs', 'quizzes', 'steps']);
        return res;
      }
    }

    const { questions, ...createFields } = data;
    const res = await this.prisma.quiz.create({ data: createFields as any });
    if (data.quizPlacement && data.stepId) {
      await this.prisma.step.update({
        where: { id: data.stepId },
        data: { quizPlacement: data.quizPlacement },
      }).catch(() => {});
    }
    await this.safeInvalidateTags(['programs', 'quizzes', 'steps']);
    return res;
  }

  async update(id: string, data: UpdateQuizDto) {
    const res = await this.prisma.quiz.update({
      where: { id },
      data,
    });
    if (data.quizPlacement && res.stepId) {
      await this.prisma.step.update({
        where: { id: res.stepId },
        data: { quizPlacement: data.quizPlacement },
      }).catch(() => {});
    }
    await this.safeInvalidateTags(['programs', 'quizzes', 'steps']);
    return res;
  }

  async remove(id: string) {
    // 1. Delete all answers associated with this quiz's questions or attempts
    await this.prisma.quizAnswer.deleteMany({
      where: {
        OR: [
          { attempt: { quizId: id } },
          { question: { quizId: id } },
        ],
      },
    });

    // 2. Delete all attempts on this quiz
    await this.prisma.attempt.deleteMany({ where: { quizId: id } });

    // 3. Delete options for all questions in this quiz
    await this.prisma.option.deleteMany({
      where: { question: { quizId: id } },
    });

    // 4. Delete all questions in this quiz
    await this.prisma.question.deleteMany({
      where: { quizId: id },
    });

    // 5. Delete the quiz record
    const res = await this.prisma.quiz.delete({
      where: { id },
    });

    // 6. Reset step quizPlacement to default
    if (res.stepId) {
      await this.prisma.step.update({
        where: { id: res.stepId },
        data: { quizPlacement: 'AFTER_VIDEO' },
      }).catch(() => {});
    }

    await this.safeInvalidateTags(['programs', 'quizzes', 'steps']);
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
            quizPlacement: true,
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
    // Only required when quiz is scheduled AFTER_VIDEO
    const stepProgress = await this.prisma.stepProgress.findUnique({
      where: {
        enrolmentId_stepId: {
          enrolmentId: enrolment.id,
          stepId: quiz.stepId,
        },
      },
    });
    const isManuallyUnlocked = stepProgress?.overrideState === StepOverrideState.MANUAL_UNLOCKED;
    const effectivePlacement = quiz.quizPlacement || (quiz.step as any)?.quizPlacement || 'AFTER_VIDEO';

    if (!isManuallyUnlocked && effectivePlacement === 'AFTER_VIDEO') {
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
                  select: { id: true, text: true, imageUrl: true, order: true },
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

    // Verify Max Attempts & Cooldown via computeRetryMetadata
    const retryMeta = this.computeRetryMetadata(quiz, relevantAttempts, quiz.step);

    if (retryMeta.attemptsRemaining <= 0) {
      throw new ForbiddenException({
        statusCode: 403,
        message: `Maximum attempts (${retryMeta.maxAttempts}) exceeded for this quiz. Contact support or your instructor.`,
        error: 'Forbidden',
        attemptsUsed: retryMeta.attemptsUsed,
        maxAttempts: retryMeta.maxAttempts,
        attemptsRemaining: 0,
      });
    }

    if (retryMeta.isCooldownActive) {
      throw new ForbiddenException({
        statusCode: 403,
        message: `Cooldown period active. You may retry after ${retryMeta.cooldownUntil}`,
        error: 'Forbidden',
        cooldownUntil: retryMeta.cooldownUntil,
        cooldownSecondsRemaining: retryMeta.cooldownSecondsRemaining,
        attemptsRemaining: retryMeta.attemptsRemaining,
        maxAttempts: retryMeta.maxAttempts,
        attemptsUsed: retryMeta.attemptsUsed,
      });
    }

    // Question Selection: Sample from question bank or step-tagged questions
    const candidateQuestions = await this.prisma.question.findMany({
      where: {
        OR: [
          { quizId: quiz.id },
          { stepId: quiz.stepId },
          { questionBank: { stepId: quiz.stepId } },
        ],
      },
      include: {
        options: {
          select: { id: true, text: true, imageUrl: true, order: true },
        },
      },
    });

    const uniqueMap = new Map<string, (typeof candidateQuestions)[0]>();
    for (const q of candidateQuestions) {
      if (!uniqueMap.has(q.id)) {
        uniqueMap.set(q.id, q);
      }
    }

    const eligibleQuestions = Array.from(uniqueMap.values()).filter(
      (q) =>
        q.type === QuestionType.SHORT_ANSWER ||
        q.type === QuestionType.TEXT_BOX ||
        (Array.isArray(q.options) && q.options.length >= 2),
    );

    const requiredCount = quiz.questionCount ?? 10;
    const actualCount = Math.min(requiredCount, eligibleQuestions.length);
    
    if (actualCount === 0) {
      throw new BadRequestException(
        `Insufficient questions in pool: Step quiz requires at least ${requiredCount} questions, found 0`,
      );
    }

    const selectedQuestions = this.shuffleArray([...eligibleQuestions]).slice(0, actualCount);

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
                  select: { id: true, text: true, imageUrl: true, order: true },
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

    let targetAttemptId = dto.attemptId || dto.id;
    if (!targetAttemptId) {
      const quiz = await this.prisma.quiz.findUnique({
        where: { id: quizId },
        include: { step: { select: { programId: true } } },
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
        throw new ForbiddenException('Access denied: No enrolment found for this quiz program');
      }

      const activeAttempt = await this.prisma.attempt.findFirst({
        where: {
          quizId,
          enrolmentId: enrolment.id,
          status: AttemptStatus.IN_PROGRESS,
        },
        orderBy: { attemptNumber: 'desc' },
      });

      if (activeAttempt) {
        targetAttemptId = activeAttempt.id;
      } else {
        const started = await this.startQuiz(quizId, actor);
        targetAttemptId = started.attemptId || (started as any).id;
      }
    }

    if (!targetAttemptId) {
      throw new BadRequestException('attemptId is required');
    }

    const attempt = await this.prisma.attempt.findUnique({
      where: { id: targetAttemptId },
      include: {
        quiz: {
          include: {
            step: {
              select: {
                id: true,
                sequence: true,
                title: true,
              },
            },
          },
        },
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

    // Idempotent Check: If already finalized (e.g. client timeout or network retry),
    // return the existing completed result instead of failing with 400 Bad Request.
    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      const allAttempts = await this.prisma.attempt.findMany({
        where: {
          enrolmentId: attempt.enrolmentId,
          quizId: attempt.quizId,
        },
        orderBy: { attemptNumber: 'desc' },
      });

      const lastReset = await this.prisma.auditLog.findFirst({
        where: {
          action: 'QUIZ_ATTEMPTS_RESET',
          entity: 'QuizAttempt',
          entityId: `${attempt.enrolmentId}_${attempt.quizId}`,
        },
        orderBy: { createdAt: 'desc' },
      });

      const currentRelevantAttempts = lastReset
        ? allAttempts.filter((a) => a.createdAt > lastReset.createdAt)
        : allAttempts;

      const quizObj = attempt.quiz ?? { passMark: 75, maxAttempts: 3, cooldownHours: 24, retryGuidance: null, step: null };
      const retryMeta = this.computeRetryMetadata(
        quizObj,
        currentRelevantAttempts,
        quizObj.step ?? null,
      );

      const passMark = attempt.quiz.passMark ?? 75;
      const correctCount = attempt.answers.filter((a) => a.isCorrect).length;

      return {
        attemptId: attempt.id,
        attemptNumber: attempt.attemptNumber,
        quizId: attempt.quizId,
        score: attempt.score ?? 0,
        passed: attempt.passed,
        status: attempt.status,
        passMark,
        totalQuestions: attempt.answers.length,
        correctCount,
        completedAt: attempt.completedAt,
        retryGuidance: !attempt.passed ? attempt.quiz.retryGuidance : null,
        attemptsUsed: retryMeta.attemptsUsed,
        maxAttempts: retryMeta.maxAttempts,
        attemptsRemaining: retryMeta.attemptsRemaining,
        isCooldownActive: retryMeta.isCooldownActive,
        cooldownHours: retryMeta.cooldownHours,
        cooldownUntil: retryMeta.cooldownUntil,
        cooldownSecondsRemaining: retryMeta.cooldownSecondsRemaining,
        canRetry: retryMeta.canRetry,
        stepToRevisit: retryMeta.stepToRevisit,
      };
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
      selectedOptionIds: string[];
      textAnswer: string | null;
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
      let selectedOptionIds: string[] = [];
      let textAnswer: string | null = null;

      const isTextQuestion =
        question.type === QuestionType.SHORT_ANSWER ||
        question.type === QuestionType.TEXT_BOX;

      const isMultiSelect =
        question.type === QuestionType.MULTI_SELECT ||
        (question.type === QuestionType.MULTIPLE_CHOICE &&
          question.options.filter((o) => o.isCorrect).length > 1);

      if (isTextQuestion) {
        const text = (
          userSubmission?.textAnswer ||
          userSubmission?.textResponse ||
          ''
        ).trim();
        textAnswer = text;
        const mode = question.gradingMode || 'SELF_REFLECTION_AUTO_PASS';
        const minChars = question.minCharacters ?? 10;

        if (mode === 'SELF_REFLECTION_AUTO_PASS') {
          if (text.length >= minChars) {
            isCorrect = true;
            pointsAwarded = questionPoints;
            correctCount += 1;
          }
        } else {
          // MANUAL_REVIEW: hold points for staff review
          isCorrect = false;
          pointsAwarded = 0;
        }
      } else if (isMultiSelect) {
        const submittedIds: string[] = (
          userSubmission?.selectedOptionIds ||
          userSubmission?.optionIds ||
          (userSubmission?.selectedOptionId ? [userSubmission.selectedOptionId] : []) ||
          (userSubmission?.optionId ? [userSubmission.optionId] : [])
        ).filter(Boolean);
        selectedOptionIds = submittedIds;

        const correctIds = question.options
          .filter((o) => o.isCorrect)
          .map((o) => o.id)
          .sort();
        const sortedSubmitted = [...submittedIds].sort();

        if (
          correctIds.length > 0 &&
          correctIds.length === sortedSubmitted.length &&
          correctIds.every((id, idx) => id === sortedSubmitted[idx])
        ) {
          isCorrect = true;
          pointsAwarded = questionPoints;
          correctCount += 1;
        }
      } else {
        // SINGLE_CHOICE or single-correct choice
        const subOptId =
          userSubmission?.selectedOptionId || userSubmission?.optionId;
        if (subOptId) {
          selectedOptionId = subOptId;
          const matchingOption = question.options.find((o) => o.id === subOptId);

          if (!matchingOption) {
            throw new BadRequestException(
              `Option ${subOptId} does not belong to question ${question.id}`,
            );
          }

          if (matchingOption.isCorrect) {
            isCorrect = true;
            pointsAwarded = questionPoints;
            correctCount += 1;
          }
        }
      }

      totalEarnedPoints += pointsAwarded;
      answerUpdates.push({
        id: boundAnswer.id,
        selectedOptionId,
        selectedOptionIds,
        textAnswer,
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
        select: { status: true, score: true, passed: true, completedAt: true },
      });

      if (check?.status !== AttemptStatus.IN_PROGRESS) {
        return tx.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
      }

      await Promise.all(
        answerUpdates.map((update) =>
          tx.quizAnswer.update({
            where: { id: update.id },
            data: {
              selectedOptionId: update.selectedOptionId,
              selectedOptionIds: update.selectedOptionIds,
              textAnswer: update.textAnswer,
              isCorrect: update.isCorrect,
              pointsAwarded: update.pointsAwarded,
            },
          }),
        ),
      );

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
        forceRecalculate: true,
      });
      await this.cacheHelper.invalidateNamespace(`auth_user:${attempt.enrolment.userId}`);
      await this.cacheHelper.invalidateNamespace('users');
    }

    const allAttempts = await this.prisma.attempt.findMany({
      where: {
        enrolmentId: attempt.enrolmentId,
        quizId: attempt.quizId,
      },
      orderBy: { attemptNumber: 'desc' },
    });

    const lastReset = await this.prisma.auditLog.findFirst({
      where: {
        action: 'QUIZ_ATTEMPTS_RESET',
        entity: 'QuizAttempt',
        entityId: `${attempt.enrolmentId}_${attempt.quizId}`,
      },
      orderBy: { createdAt: 'desc' },
    });

    const currentRelevantAttempts = lastReset
      ? allAttempts.filter((a) => a.createdAt > lastReset.createdAt)
      : allAttempts;

    const retryMeta = this.computeRetryMetadata(
      attempt.quiz,
      currentRelevantAttempts,
      attempt.quiz.step,
    );

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
      attemptsUsed: retryMeta.attemptsUsed,
      maxAttempts: retryMeta.maxAttempts,
      attemptsRemaining: retryMeta.attemptsRemaining,
      isCooldownActive: retryMeta.isCooldownActive,
      cooldownHours: retryMeta.cooldownHours,
      cooldownUntil: retryMeta.cooldownUntil,
      cooldownSecondsRemaining: retryMeta.cooldownSecondsRemaining,
      canRetry: retryMeta.canRetry,
      stepToRevisit: retryMeta.stepToRevisit,
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
        step: { select: { id: true, programId: true, sequence: true, title: true } },
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

    await this.progressionService.assertStepUnlocked(
      enrolment.id,
      quiz.step.id,
      actor,
    );

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
                  select: { id: true, text: true, imageUrl: true, order: true },
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

    const allAttempts = await this.prisma.attempt.findMany({
      where: {
        enrolmentId: enrolment.id,
        quizId,
      },
      orderBy: { attemptNumber: 'desc' },
    });

    const lastReset = await this.prisma.auditLog.findFirst({
      where: {
        action: 'QUIZ_ATTEMPTS_RESET',
        entity: 'QuizAttempt',
        entityId: `${enrolment.id}_${quizId}`,
      },
      orderBy: { createdAt: 'desc' },
    });

    const relevantAttempts = lastReset
      ? allAttempts.filter((a) => a.createdAt > lastReset.createdAt)
      : allAttempts;

    const retryMeta = this.computeRetryMetadata(
      quiz,
      relevantAttempts,
      quiz.step,
    );

    return {
      attemptId: latestAttempt.id,
      attemptNumber: latestAttempt.attemptNumber,
      quizId,
      status: latestAttempt.status,
      score: latestAttempt.score,
      passed: latestAttempt.passed,
      startedAt: latestAttempt.startedAt,
      completedAt: latestAttempt.completedAt,
      attemptsUsed: retryMeta.attemptsUsed,
      maxAttempts: retryMeta.maxAttempts,
      attemptsRemaining: retryMeta.attemptsRemaining,
      isCooldownActive: retryMeta.isCooldownActive,
      cooldownHours: retryMeta.cooldownHours,
      cooldownUntil: retryMeta.cooldownUntil,
      cooldownSecondsRemaining: retryMeta.cooldownSecondsRemaining,
      canRetry: retryMeta.canRetry,
      retryGuidance: !latestAttempt.passed ? quiz.retryGuidance : null,
      stepToRevisit: retryMeta.stepToRevisit,
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
  // 7. ADMINISTRATIVE: QUESTION BANK MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────

  async getQuestionsForQuiz(quizId: string) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      include: { step: true },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    const candidateQuestions = await this.prisma.question.findMany({
      where: {
        OR: [
          { quizId: quiz.id },
          { stepId: quiz.stepId },
          { questionBank: { stepId: quiz.stepId } },
        ],
      },
      include: {
        options: {
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const uniqueMap = new Map<string, (typeof candidateQuestions)[0]>();
    for (const q of candidateQuestions) {
      if (!uniqueMap.has(q.id)) {
        uniqueMap.set(q.id, q);
      }
    }

    return Array.from(uniqueMap.values()).map((q) => ({
      id: q.id,
      quizId: q.quizId,
      stepId: q.stepId,
      type: q.type,
      text: q.text,
      imageUrl: q.imageUrl,
      gradingMode: q.gradingMode,
      minCharacters: q.minCharacters,
      explanation: q.explanation,
      points: q.points,
      options: q.options.map((opt) => ({
        id: opt.id,
        text: opt.text,
        imageUrl: opt.imageUrl,
        isCorrect: opt.isCorrect,
        order: opt.order,
      })),
      createdAt: q.createdAt,
      updatedAt: q.updatedAt,
    }));
  }

  async createQuestionForQuiz(quizId: string, dto: CreateQuestionDto) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      include: { step: true },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    const questionType = dto.type ?? QuestionType.MULTIPLE_CHOICE;
    const isTextQuestion =
      questionType === QuestionType.SHORT_ANSWER ||
      questionType === QuestionType.TEXT_BOX;

    if (!isTextQuestion) {
      if (!Array.isArray(dto.options) || dto.options.length < 2) {
        throw new BadRequestException('A choice question must have at least 2 options');
      }

      const hasCorrect = dto.options.some((o) => o.isCorrect === true);
      if (!hasCorrect) {
        throw new BadRequestException('At least one option must be marked as correct');
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const question = await tx.question.create({
        data: {
          quizId: quiz.id,
          stepId: quiz.stepId,
          type: questionType,
          text: dto.text.trim(),
          imageUrl: dto.imageUrl?.trim() || null,
          gradingMode: dto.gradingMode?.trim() || 'SELF_REFLECTION_AUTO_PASS',
          minCharacters: dto.minCharacters ?? 10,
          explanation: dto.explanation?.trim() || null,
          points: dto.points ?? 1,
        },
      });

      if (!isTextQuestion && Array.isArray(dto.options) && dto.options.length > 0) {
        const optionsData = dto.options.map((opt, idx) => ({
          questionId: question.id,
          text: opt.text.trim(),
          imageUrl: opt.imageUrl?.trim() || null,
          isCorrect: Boolean(opt.isCorrect),
          order: opt.order ?? idx + 1,
        }));

        await tx.option.createMany({
          data: optionsData,
        });
      }

      return tx.question.findUniqueOrThrow({
        where: { id: question.id },
        include: {
          options: {
            orderBy: { order: 'asc' },
          },
        },
      });
    });

    await this.safeInvalidateTags(['programs', 'quizzes', 'steps']);
    return created;
  }

  async updateQuestion(questionId: string, dto: UpdateQuestionDto) {
    const existing = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: { options: true },
    });

    if (!existing) {
      throw new NotFoundException('Question not found');
    }

    const targetType = dto.type !== undefined ? dto.type : existing.type;
    const isTextQuestion =
      targetType === QuestionType.SHORT_ANSWER ||
      targetType === QuestionType.TEXT_BOX;

    if (!isTextQuestion && dto.options) {
      if (dto.options.length < 2) {
        throw new BadRequestException('A choice question must have at least 2 options');
      }
      const hasCorrect = dto.options.some((o) => o.isCorrect === true);
      if (!hasCorrect) {
        throw new BadRequestException('At least one option must be marked as correct');
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const questionUpdateData: any = {};
      if (dto.text !== undefined) questionUpdateData.text = dto.text.trim();
      if (dto.type !== undefined) questionUpdateData.type = dto.type;
      if (dto.imageUrl !== undefined) questionUpdateData.imageUrl = dto.imageUrl?.trim() || null;
      if (dto.gradingMode !== undefined) questionUpdateData.gradingMode = dto.gradingMode?.trim() || 'SELF_REFLECTION_AUTO_PASS';
      if (dto.minCharacters !== undefined) questionUpdateData.minCharacters = dto.minCharacters;
      if (dto.explanation !== undefined) questionUpdateData.explanation = dto.explanation?.trim() || null;
      if (dto.points !== undefined) questionUpdateData.points = dto.points;

      await tx.question.update({
        where: { id: questionId },
        data: questionUpdateData,
      });

      if (dto.options !== undefined) {
        await tx.option.deleteMany({
          where: { questionId },
        });

        if (!isTextQuestion && Array.isArray(dto.options) && dto.options.length > 0) {
          await tx.option.createMany({
            data: dto.options.map((opt, idx) => ({
              questionId,
              text: opt.text.trim(),
              imageUrl: opt.imageUrl?.trim() || null,
              isCorrect: Boolean(opt.isCorrect),
              order: opt.order ?? idx + 1,
            })),
          });
        }
      }

      return tx.question.findUniqueOrThrow({
        where: { id: questionId },
        include: {
          options: {
            orderBy: { order: 'asc' },
          },
        },
      });
    });

    await this.safeInvalidateTags(['programs', 'quizzes', 'steps']);
    return updated;
  }

  async deleteQuestion(questionId: string, force = false) {
    const existing = await this.prisma.question.findUnique({
      where: { id: questionId },
    });

    if (!existing) {
      throw new NotFoundException('Question not found');
    }

    const answersCount = await this.prisma.quizAnswer.count({
      where: { questionId },
    });

    if (answersCount > 0) {
      if (!force) {
        throw new BadRequestException(
          'Cannot delete question because it is referenced in recorded quiz attempts',
        );
      }
      // If forced by staff / curriculum editor, purge referenced answers so question can be safely removed
      await this.prisma.quizAnswer.deleteMany({
        where: { questionId },
      });
    }

    // Clean up options
    await this.prisma.option.deleteMany({
      where: { questionId },
    });

    await this.prisma.question.delete({
      where: { id: questionId },
    });

    await this.safeInvalidateTags(['programs', 'quizzes', 'steps']);
    return {
      success: true,
      message: 'Question deleted successfully',
      questionId,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  private computeRetryMetadata(quiz: any, relevantAttempts: any[], step?: any) {
    const maxAttempts = quiz.maxAttempts ?? 3;
    const cooldownHours = quiz.cooldownHours ?? 24;
    const attemptsUsed = relevantAttempts.length;
    const attemptsRemaining = Math.max(0, maxAttempts - attemptsUsed);

    const isPassed = relevantAttempts.some(
      (a) => a.status === AttemptStatus.PASSED || a.passed === true,
    );

    let isCooldownActive = false;
    let cooldownUntil: string | null = null;
    let cooldownSecondsRemaining: number | null = null;

    const latestAttempt = relevantAttempts[0];
    if (
      !isPassed &&
      latestAttempt &&
      latestAttempt.status === AttemptStatus.FAILED &&
      latestAttempt.completedAt
    ) {
      const cooldownMs = cooldownHours * 60 * 60 * 1000;
      const cooldownEndDate = new Date(latestAttempt.completedAt.getTime() + cooldownMs);
      const now = new Date();
      if (now < cooldownEndDate) {
        isCooldownActive = true;
        cooldownUntil = cooldownEndDate.toISOString();
        cooldownSecondsRemaining = Math.max(
          0,
          Math.ceil((cooldownEndDate.getTime() - now.getTime()) / 1000),
        );
      }
    }

    const canRetry = !isPassed && !isCooldownActive && attemptsRemaining > 0;

    const stepInfo = step || quiz.step;
    const stepToRevisit =
      !isPassed && stepInfo
        ? {
            id: stepInfo.id,
            sequence: stepInfo.sequence,
            title: stepInfo.title,
          }
        : null;

    return {
      attemptsUsed,
      maxAttempts,
      attemptsRemaining,
      isCooldownActive,
      cooldownHours,
      cooldownUntil,
      cooldownSecondsRemaining,
      canRetry,
      stepToRevisit,
    };
  }

  private deterministicShuffle<T>(array: T[], seedStr: string): T[] {
    const result = [...array];
    let seed = 0;
    for (let i = 0; i < seedStr.length; i++) {
      seed = (seed << 5) - seed + seedStr.charCodeAt(i);
      seed |= 0;
    }
    seed = seed >>> 0;

    const rand = () => {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  private assertStaffBatchAccess(actor: any, enrolment: any) {
    const role = actor?.role;
    const actorId = actor?.sub ?? actor?.id;

    if (role === Role.SUPER_ADMIN || role === Role.ADMIN) {
      return;
    }

    if ((role === Role.MANAGER || role === 'MANAGER' || role === 'TEACHER')) {
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
        imageUrl: ans.question.imageUrl || null,
        gradingMode: ans.question.gradingMode || 'SELF_REFLECTION_AUTO_PASS',
        minCharacters: ans.question.minCharacters ?? 10,
        // Deterministically shuffled options based on attemptId + questionId, stripping isCorrect
        options: this.deterministicShuffle(
          (ans.question.options || []).map((opt: any) => ({
            id: opt.id,
            text: opt.text,
            imageUrl: opt.imageUrl || null,
            order: opt.order,
          })),
          `${attempt.id}_${ans.question.id}`,
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

