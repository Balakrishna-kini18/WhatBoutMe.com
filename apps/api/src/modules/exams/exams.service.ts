import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  AttemptStatus,
  ContentStatus,
  EnrolmentStatus,
  LearnerStage,
  QuestionType,
  Role,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CacheHelperService } from '../../common/cache/cache-helper.service.js';
import { ProgressionService } from '../progression/progression.service.js';
import { isManagerAssignedToBatch } from '../../common/guards/batch-access.guard.js';
import {
  StartExamDto,
  SubmitExamDto,
  ResetExamAttemptsDto,
  CreateExamDto,
  UpdateExamDto,
  SaveExamAnswersDto,
} from './dto/index.js';

@Injectable()
export class ExamsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExamsService.name);
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
    private readonly progressionService: ProgressionService,
  ) {}

  onModuleInit() {
    this.sweepTimer = setInterval(() => {
      this.finalizeExpiredAttempts().catch((err) => {
        this.logger.error(`Expired exam attempts sweep failed: ${err.message}`);
      });
    }, 60000);
  }

  onModuleDestroy() {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. GET EXAM CONFIGURATION
  // ─────────────────────────────────────────────────────────────────────────────

  async getExamConfig(programId: string, actor: any) {
    const actorId = actor?.sub ?? actor?.id;
    if (!actorId) {
      throw new ForbiddenException('Access denied: Authentication required');
    }

    const exam = await this.prisma.exam.findFirst({
      where: { programId },
    });

    if (!exam) {
      throw new NotFoundException('Final exam not found for this program');
    }

    return {
      id: exam.id,
      programId: exam.programId,
      title: exam.title,
      description: exam.description,
      questionCount: exam.questionCount,
      passMark: exam.passMark,
      timeLimitMin: exam.timeLimitMin,
      maxAttempts: exam.maxAttempts,
      cooldownHours: exam.cooldownHours,
      status: exam.status,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. START OR RESUME FINAL EXAM ATTEMPT
  // ─────────────────────────────────────────────────────────────────────────────

  async startExam(examId: string, actor: any, dto?: StartExamDto) {
    const actorId = actor?.sub ?? actor?.id;
    if (!actorId) {
      throw new ForbiddenException('Access denied: Authentication required');
    }

    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: {
        program: {
          include: {
            steps: { orderBy: { sequence: 'asc' } },
          },
        },
      },
    });

    if (!exam) {
      throw new NotFoundException('Exam not found');
    }

    const enrolment = await this.prisma.enrolment.findFirst({
      where: {
        userId: actorId,
        programId: exam.programId,
      },
      include: { batch: true },
    });

    if (!enrolment || enrolment.status !== EnrolmentStatus.ACTIVE) {
      throw new BadRequestException('Active enrolment required to take this exam');
    }

    // ── Prerequisite Gate: Verify all program steps are completed ─────────────
    const progressionOverview = await this.progressionService.getEnrolmentProgression(
      enrolment.id,
      actor,
    );

    const allStepsCompleted =
      progressionOverview.steps.length > 0 &&
      progressionOverview.steps.every((s: any) => s.isCompleted);

    if (!allStepsCompleted) {
      throw new BadRequestException(
        'Prerequisite incomplete: You must complete all program steps and step quizzes before taking the final exam',
      );
    }

    // ── Resume Active IN_PROGRESS Attempt ─────────────────────────────────────
    const existingActiveAttempt = await this.prisma.examAttempt.findFirst({
      where: {
        enrolmentId: enrolment.id,
        examId: exam.id,
        status: AttemptStatus.IN_PROGRESS,
      },
    });

    if (existingActiveAttempt) {
      return this.formatExamAttemptResponse(existingActiveAttempt, exam);
    }

    // ── Check Attempts & Cooldown Throttling ──────────────────────────────────
    const allAttempts = await this.prisma.examAttempt.findMany({
      where: {
        enrolmentId: enrolment.id,
        examId: exam.id,
      },
      orderBy: { attemptNumber: 'desc' },
    });

    const lastReset = await this.prisma.auditLog.findFirst({
      where: {
        action: 'EXAM_ATTEMPTS_RESET',
        entity: 'ExamAttempt',
        entityId: `${enrolment.id}_${exam.id}`,
      },
      orderBy: { createdAt: 'desc' },
    });

    const relevantAttempts = lastReset
      ? allAttempts.filter((a) => a.createdAt > lastReset.createdAt)
      : allAttempts;

    const completedAttempts = relevantAttempts.filter(
      (a) => a.status !== AttemptStatus.IN_PROGRESS,
    );

    const attemptsUsed = completedAttempts.length;
    const maxAttempts = exam.maxAttempts || 3;
    const attemptsRemaining = Math.max(0, maxAttempts - attemptsUsed);

    if (attemptsUsed >= maxAttempts) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Maximum exam attempts reached. Contact your instructor or administrator for a reset.',
        attemptsUsed,
        maxAttempts,
        attemptsRemaining: 0,
        canRetry: false,
      });
    }

    const latestAttempt = completedAttempts[0];
    if (latestAttempt && latestAttempt.status === AttemptStatus.FAILED && latestAttempt.completedAt) {
      const cooldownHours = exam.cooldownHours || 24;
      const cooldownUntil = new Date(
        latestAttempt.completedAt.getTime() + cooldownHours * 3600 * 1000,
      );
      const now = new Date();
      const cooldownSecondsRemaining = Math.max(
        0,
        Math.ceil((cooldownUntil.getTime() - now.getTime()) / 1000),
      );

      if (cooldownSecondsRemaining > 0) {
        const answersJson = latestAttempt.answers as any;
        const stepToRevisit = answersJson?.stepToRevisit ?? null;

        throw new ForbiddenException({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Exam retry cooldown period is active. Please wait before retrying.',
          isCooldownActive: true,
          cooldownHours,
          cooldownUntil: cooldownUntil.toISOString(),
          cooldownSecondsRemaining,
          attemptsUsed,
          maxAttempts,
          attemptsRemaining,
          canRetry: false,
          stepToRevisit,
          retryGuidance: exam.retryGuidance,
        });
      }
    }

    // ── Question Pool Resolution ──────────────────────────────────────────────
    const stepIds = exam.program.steps.map((s) => s.id);

    // Dedicated pool: when linked banks exist for this exam, use them directly
    const linkedBanks = this.prisma.questionBank?.findMany
      ? await this.prisma.questionBank.findMany({
          where: { examId: exam.id },
          select: { id: true },
        })
      : [];

    let poolCondition: any;
    if (linkedBanks && linkedBanks.length > 0) {
      const bankIds = linkedBanks.map((b) => b.id);
      poolCondition = { questionBankId: { in: bankIds } };
    } else {
      poolCondition = {
        OR: [
          { stepId: { in: stepIds } },
          { questionBank: { stepId: { in: stepIds } } },
          { quiz: { stepId: { in: stepIds } } },
        ],
      };
    }

    const candidateQuestions = await this.prisma.question.findMany({
      where: poolCondition,
      include: {
        options: {
          select: { id: true, text: true, imageUrl: true, order: true },
          orderBy: { order: 'asc' },
        },
        step: { select: { id: true, sequence: true, title: true } },
        questionBank: {
          select: {
            step: { select: { id: true, sequence: true, title: true } },
          },
        },
        quiz: {
          select: {
            step: { select: { id: true, sequence: true, title: true } },
          },
        },
      },
    });

    const questionMap = new Map<string, any>();
    for (const q of candidateQuestions) {
      if (!questionMap.has(q.id)) {
        questionMap.set(q.id, q);
      }
    }

    const distinctCandidates = Array.from(questionMap.values());
    const requiredQuestionCount = exam.questionCount || 50;

    if (distinctCandidates.length < requiredQuestionCount) {
      throw new BadRequestException(
        `Insufficient question pool for final exam: Exam requires at least ${requiredQuestionCount} questions, but only ${distinctCandidates.length} are available across program question banks.`,
      );
    }

    // Fisher-Yates random sample of exactly requiredQuestionCount distinct questions
    const shuffledPool = this.shuffleArray([...distinctCandidates]);
    const sampledQuestions = shuffledPool.slice(0, requiredQuestionCount);

    const nextAttemptNumber = (allAttempts[0]?.attemptNumber ?? 0) + 1;
    const newAttemptId = crypto.randomUUID();

    const boundQuestions = sampledQuestions.map((q) => {
      const resolvedStep = q.step ?? q.questionBank?.step ?? q.quiz?.step ?? null;
      return {
        id: q.id,
        text: q.text,
        type: q.type,
        imageUrl: q.imageUrl || null,
        gradingMode: q.gradingMode || 'SELF_REFLECTION_AUTO_PASS',
        minCharacters: q.minCharacters ?? 10,
        points: q.points || 1,
        stepId: resolvedStep?.id ?? null,
        stepSequence: resolvedStep?.sequence ?? null,
        stepTitle: resolvedStep?.title ?? null,
        options: this.deterministicShuffle(
          (q.options || []).map((opt: any) => ({
            id: opt.id,
            text: opt.text,
            imageUrl: opt.imageUrl || null,
            order: opt.order,
          })),
          `${newAttemptId}_${q.id}`,
        ),
      };
    });

    const startedAt = new Date();
    const timeLimitMin = exam.timeLimitMin || 90;
    const expiresAt = new Date(startedAt.getTime() + timeLimitMin * 60 * 1000);

    try {
      const createdAttempt = await this.prisma.examAttempt.create({
        data: {
          id: newAttemptId,
          enrolmentId: enrolment.id,
          examId: exam.id,
          attemptNumber: nextAttemptNumber,
          status: AttemptStatus.IN_PROGRESS,
          startedAt,
          expiresAt,
          answers: {
            boundQuestions,
            boundQuestionIds: sampledQuestions.map((q) => q.id),
          } as any,
        },
      });

      return this.formatExamAttemptResponse(createdAttempt, exam);
    } catch (error: any) {
      // Handle race condition: two parallel start calls computed the same attemptNumber
      if (error?.code === 'P2002') {
        const existingAttempt = await this.prisma.examAttempt.findFirst({
          where: {
            enrolmentId: enrolment.id,
            examId: exam.id,
            status: AttemptStatus.IN_PROGRESS,
          },
        });
        if (existingAttempt) {
          return this.formatExamAttemptResponse(existingAttempt, exam);
        }
      }
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. SUBMIT FINAL EXAM ATTEMPT
  // ─────────────────────────────────────────────────────────────────────────────

  async submitExam(examId: string, dto: SubmitExamDto, actor: any) {
    const actorId = actor?.sub ?? actor?.id;
    if (!actorId) {
      throw new ForbiddenException('Access denied: Authentication required');
    }

    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: {
        program: {
          include: {
            steps: { orderBy: { sequence: 'asc' } },
          },
        },
      },
    });

    if (!exam) {
      throw new NotFoundException('Exam not found');
    }

    const enrolment = await this.prisma.enrolment.findFirst({
      where: {
        userId: actorId,
        programId: exam.programId,
      },
    });

    if (!enrolment) {
      throw new BadRequestException('Enrolment not found');
    }

    let attempt = await this.prisma.examAttempt.findFirst({
      where: {
        enrolmentId: enrolment.id,
        examId: exam.id,
        status: AttemptStatus.IN_PROGRESS,
        ...(dto.attemptId ? { id: dto.attemptId } : {}),
      },
    });

    if (!attempt) {
      throw new NotFoundException('Active exam attempt not found or already finalized');
    }

    const answersJson = attempt.answers as any;
    const boundQuestionIds: string[] = answersJson?.boundQuestionIds || [];
    const boundQuestions: any[] = answersJson?.boundQuestions || [];
    const boundQuestionMap = new Map(boundQuestions.map((q) => [q.id, q]));

    // ── Timed Execution Check (90 min default + 2 min network grace) ──────────
    const now = new Date();
    const timeLimitMin = exam.timeLimitMin || 90;
    const elapsedMs = now.getTime() - attempt.startedAt.getTime();
    const allowedMs = (timeLimitMin * 60 + 120) * 1000; // 90 min + 2 min grace

    if (elapsedMs > allowedMs) {
      // Auto-fail expired submission under transaction
      await this.prisma.examAttempt.update({
        where: { id: attempt.id },
        data: {
          score: 0,
          passed: false,
          status: AttemptStatus.FAILED,
          completedAt: now,
        },
      });

      throw new BadRequestException(
        `Exam time limit expired: The allotted time for this exam (${timeLimitMin} minutes + grace period) has elapsed.`,
      );
    }

    // ── Validate Submitted Questions ──────────────────────────────────────────
    const submittedAnswers = dto.answers || [];
    for (const sub of submittedAnswers) {
      if (!boundQuestionMap.has(sub.questionId)) {
        throw new BadRequestException(
          `Question ${sub.questionId} does not belong to this exam attempt`,
        );
      }
    }

    const submittedMap = new Map(submittedAnswers.map((a) => [a.questionId, a]));

    // Query database questions with correct answers for authoritative server evaluation
    const dbQuestions = await this.prisma.question.findMany({
      where: { id: { in: boundQuestionIds } },
      include: {
        options: true, // Includes isCorrect
        step: { select: { id: true, sequence: true, title: true } },
        questionBank: {
          select: {
            step: { select: { id: true, sequence: true, title: true } },
          },
        },
        quiz: {
          select: {
            step: { select: { id: true, sequence: true, title: true } },
          },
        },
      },
    });

    const dbQuestionMap = new Map(dbQuestions.map((q) => [q.id, q]));

    let totalPossible = 0;
    let totalEarned = 0;
    const missesByStep = new Map<string, { count: number; step: any }>();

    for (const boundQ of boundQuestions) {
      const dbQ = dbQuestionMap.get(boundQ.id);
      if (!dbQ) continue;

      const points = dbQ.points || 1;
      totalPossible += points;

      const submission = submittedMap.get(boundQ.id);
      let isCorrect = false;

      const isTextQuestion =
        dbQ.type === QuestionType.SHORT_ANSWER ||
        dbQ.type === QuestionType.TEXT_BOX;

      const isMultiSelect =
        dbQ.type === QuestionType.MULTI_SELECT ||
        (dbQ.type === QuestionType.MULTIPLE_CHOICE &&
          dbQ.options.filter((o) => o.isCorrect).length > 1);

      if (isTextQuestion) {
        const text = (
          submission?.textAnswer ||
          submission?.textResponse ||
          ''
        ).trim();
        const mode = dbQ.gradingMode || 'SELF_REFLECTION_AUTO_PASS';
        const minChars = dbQ.minCharacters ?? 10;
        if (mode === 'SELF_REFLECTION_AUTO_PASS') {
          isCorrect = text.length >= minChars;
        } else {
          isCorrect = false;
        }
      } else if (isMultiSelect) {
        const submittedIds: string[] = (
          submission?.selectedOptionIds ||
          submission?.optionIds ||
          (submission?.selectedOptionId ? [submission.selectedOptionId] : []) ||
          (submission?.optionId ? [submission.optionId] : [])
        ).filter(Boolean);

        const correctIds = dbQ.options
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
        }
      } else {
        const selectedOptId =
          submission?.selectedOptionId || submission?.optionId;
        if (selectedOptId) {
          const correctOpt = dbQ.options.find((o) => o.isCorrect);
          if (correctOpt && correctOpt.id === selectedOptId) {
            isCorrect = true;
          }
        }
      }

      if (isCorrect) {
        totalEarned += points;
      } else {
        const step = dbQ.step ?? dbQ.questionBank?.step ?? dbQ.quiz?.step ?? null;
        if (step) {
          const existing = missesByStep.get(step.id) || { count: 0, step };
          existing.count += 1;
          missesByStep.set(step.id, existing);
        }
      }
    }

    const scorePercent =
      totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 100) : 0;
    const passMark = exam.passMark || 75;
    const passed = scorePercent >= passMark;

    // Step to revisit: step with the highest error count
    let stepToRevisit: { id: string; sequence: number; title: string } | null = null;
    if (!passed && missesByStep.size > 0) {
      const sortedMisses = Array.from(missesByStep.values()).sort(
        (a, b) => b.count - a.count,
      );
      const worst = sortedMisses[0]?.step;
      if (worst) {
        stepToRevisit = {
          id: worst.id,
          sequence: worst.sequence,
          title: worst.title,
        };
      }
    }

    const cooldownHours = exam.cooldownHours || 24;
    const cooldownUntil = !passed
      ? new Date(now.getTime() + cooldownHours * 3600 * 1000)
      : null;
    const cooldownSecondsRemaining = !passed ? cooldownHours * 3600 : 0;

    // ── Atomic Finalization via Prisma Transaction ────────────────────────────
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.examAttempt.findUnique({
        where: { id: attempt.id },
      });

      if (!current || current.status !== AttemptStatus.IN_PROGRESS) {
        throw new BadRequestException('Exam attempt is already finalized');
      }

      await tx.examAttempt.update({
        where: { id: attempt.id },
        data: {
          score: scorePercent,
          passed,
          status: passed ? AttemptStatus.PASSED : AttemptStatus.FAILED,
          completedAt: now,
          answers: {
            ...answersJson,
            submittedAnswers: dto.answers,
            scorePercent,
            totalEarned,
            totalPossible,
            stepToRevisit,
          },
        },
      });

      // Stage Hook: If exam is passed, set examPassedAt and advance learner progression stage
      if (passed && tx.enrolment?.update) {
        await tx.enrolment.update({
          where: { id: attempt.enrolmentId },
          data: {
            examPassedAt: now,
            currentStage: LearnerStage.STAGE_3_ATTENDANCE,
          },
        }).catch(() => {});
      }
    });

    const maxAttempts = exam.maxAttempts || 3;
    const attemptsUsed = attempt.attemptNumber;
    const attemptsRemaining = Math.max(0, maxAttempts - attemptsUsed);

    return {
      attemptId: attempt.id,
      attemptNumber: attempt.attemptNumber,
      examId: exam.id,
      status: passed ? AttemptStatus.PASSED : AttemptStatus.FAILED,
      score: scorePercent,
      passed,
      passMark,
      totalPossiblePoints: totalPossible,
      earnedPoints: totalEarned,
      startedAt: attempt.startedAt,
      completedAt: now,
      attemptsUsed,
      maxAttempts,
      attemptsRemaining,
      isCooldownActive: !passed,
      cooldownUntil: cooldownUntil ? cooldownUntil.toISOString() : null,
      cooldownSecondsRemaining,
      canRetry: !passed && attemptsRemaining > 0 && cooldownSecondsRemaining === 0,
      stepToRevisit,
      retryGuidance: !passed ? exam.retryGuidance : null,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. GET ACTIVE ATTEMPT OR RECENT STATUS
  // ─────────────────────────────────────────────────────────────────────────────

  async getActiveAttempt(examId: string, actor: any) {
    const actorId = actor?.sub ?? actor?.id;
    if (!actorId) {
      throw new ForbiddenException('Access denied: Authentication required');
    }

    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
    });

    if (!exam) {
      throw new NotFoundException('Exam not found');
    }

    const enrolment = await this.prisma.enrolment.findFirst({
      where: {
        userId: actorId,
        programId: exam.programId,
      },
    });

    if (!enrolment) {
      return null;
    }

    // 1. Check active IN_PROGRESS attempt
    const activeAttempt = await this.prisma.examAttempt.findFirst({
      where: {
        enrolmentId: enrolment.id,
        examId: exam.id,
        status: AttemptStatus.IN_PROGRESS,
      },
    });

    if (activeAttempt) {
      return this.formatExamAttemptResponse(activeAttempt, exam);
    }

    // 2. Fall back to latest attempt with retry metadata
    const latestAttempt = await this.prisma.examAttempt.findFirst({
      where: {
        enrolmentId: enrolment.id,
        examId: exam.id,
      },
      orderBy: { attemptNumber: 'desc' },
    });

    if (!latestAttempt) {
      return null;
    }

    const allAttempts = await this.prisma.examAttempt.findMany({
      where: {
        enrolmentId: enrolment.id,
        examId: exam.id,
      },
      orderBy: { attemptNumber: 'desc' },
    });

    const lastReset = await this.prisma.auditLog.findFirst({
      where: {
        action: 'EXAM_ATTEMPTS_RESET',
        entity: 'ExamAttempt',
        entityId: `${enrolment.id}_${exam.id}`,
      },
      orderBy: { createdAt: 'desc' },
    });

    const relevantAttempts = lastReset
      ? allAttempts.filter((a) => a.createdAt > lastReset.createdAt)
      : allAttempts;

    const completedAttempts = relevantAttempts.filter(
      (a) => a.status !== AttemptStatus.IN_PROGRESS,
    );

    const attemptsUsed = completedAttempts.length;
    const maxAttempts = exam.maxAttempts || 3;
    const attemptsRemaining = Math.max(0, maxAttempts - attemptsUsed);

    const cooldownHours = exam.cooldownHours || 24;
    let isCooldownActive = false;
    let cooldownUntil: Date | null = null;
    let cooldownSecondsRemaining = 0;

    if (
      latestAttempt.status === AttemptStatus.FAILED &&
      latestAttempt.completedAt
    ) {
      cooldownUntil = new Date(
        latestAttempt.completedAt.getTime() + cooldownHours * 3600 * 1000,
      );
      const now = new Date();
      cooldownSecondsRemaining = Math.max(
        0,
        Math.ceil((cooldownUntil.getTime() - now.getTime()) / 1000),
      );
      isCooldownActive = cooldownSecondsRemaining > 0;
    }

    const answersJson = latestAttempt.answers as any;
    const stepToRevisit = answersJson?.stepToRevisit ?? null;

    return {
      attemptId: latestAttempt.id,
      attemptNumber: latestAttempt.attemptNumber,
      examId: exam.id,
      status: latestAttempt.status,
      score: latestAttempt.score,
      passed: latestAttempt.passed,
      passMark: exam.passMark,
      startedAt: latestAttempt.startedAt,
      completedAt: latestAttempt.completedAt,
      attemptsUsed,
      maxAttempts,
      attemptsRemaining,
      isCooldownActive,
      cooldownHours,
      cooldownUntil: cooldownUntil ? cooldownUntil.toISOString() : null,
      cooldownSecondsRemaining,
      canRetry: !latestAttempt.passed && attemptsRemaining > 0 && !isCooldownActive,
      stepToRevisit,
      retryGuidance: !latestAttempt.passed ? exam.retryGuidance : null,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. ADMINISTRATIVE: RESET EXAM ATTEMPTS
  // ─────────────────────────────────────────────────────────────────────────────

  async resetExamAttempts(
    examId: string,
    enrolmentId: string,
    dto: ResetExamAttemptsDto,
    actor: any,
    ip?: string,
  ) {
    const actorId = actor?.sub ?? actor?.id;
    if (!actorId) {
      throw new ForbiddenException('Access denied: Authentication required');
    }

    const trimmedReason = dto.reason?.trim();
    if (!trimmedReason || trimmedReason.length < 5) {
      throw new BadRequestException('A valid reason of at least 5 characters is required');
    }

    const enrolment = await this.prisma.enrolment.findUnique({
      where: { id: enrolmentId },
      include: {
        batch: {
          include: {
            trainers: true,
          },
        },
      },
    });

    if (!enrolment) {
      throw new NotFoundException('Enrolment not found');
    }

    // Manager Batch Scoping
    if ((actor.role === Role.MANAGER || actor.role === 'MANAGER' || actor.role === 'TEACHER')) {
      const isAssigned = await isManagerAssignedToBatch(
        this.prisma,
        actorId,
        enrolment.batchId,
      );
      if (!isAssigned) {
        throw new ForbiddenException(
          'Access denied: You are not assigned to manage this batch cohort',
        );
      }
    }

    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
    });

    if (!exam) {
      throw new NotFoundException('Exam not found');
    }

    const now = new Date();
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'EXAM_ATTEMPTS_RESET',
        entity: 'ExamAttempt',
        entityId: `${enrolmentId}_${examId}`,
        meta: {
          enrolmentId,
          examId,
          reason: trimmedReason,
          resetByRole: actor.role,
        },
        ip: ip || null,
        createdAt: now,
      },
    });

    return {
      success: true,
      message: 'Exam attempts successfully reset',
      enrolmentId,
      examId,
      resetAt: now,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. ADMINISTRATIVE: GET ENROLMENT ATTEMPTS
  // ─────────────────────────────────────────────────────────────────────────────

  async getEnrolmentExamAttempts(
    examId: string,
    enrolmentId: string,
    actor: any,
  ) {
    const actorId = actor?.sub ?? actor?.id;
    if (!actorId) {
      throw new ForbiddenException('Access denied: Authentication required');
    }

    const enrolment = await this.prisma.enrolment.findUnique({
      where: { id: enrolmentId },
      include: {
        batch: {
          include: {
            trainers: true,
          },
        },
      },
    });

    if (!enrolment) {
      throw new NotFoundException('Enrolment not found');
    }

    if ((actor.role === Role.MANAGER || actor.role === 'MANAGER' || actor.role === 'TEACHER')) {
      const isAssigned = await isManagerAssignedToBatch(
        this.prisma,
        actorId,
        enrolment.batchId,
      );
      if (!isAssigned) {
        throw new ForbiddenException(
          'Access denied: You are not assigned to manage this batch cohort',
        );
      }
    }

    return this.prisma.examAttempt.findMany({
      where: {
        examId,
        enrolmentId,
      },
      orderBy: { attemptNumber: 'desc' },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. ADMIN CONFIGURATION (CREATE, UPDATE, PUBLISH) & AUTOSAVE ANSWERS
  // ─────────────────────────────────────────────────────────────────────────────

  async createExam(dto: CreateExamDto, actor: any) {
    const actorId = actor?.sub ?? actor?.id;
    if (!actorId) throw new ForbiddenException('Authentication required');

    const program = await this.prisma.program.findUnique({
      where: { id: dto.programId },
    });
    if (!program) throw new NotFoundException('Program not found');

    const existing = await this.prisma.exam.findFirst({
      where: { programId: dto.programId },
    });

    if (existing) {
      return this.updateExam(existing.id, dto, actor);
    }

    return this.prisma.exam.create({
      data: {
        programId: dto.programId,
        title: dto.title,
        description: dto.description,
        questionCount: dto.questionCount ?? 50,
        passMark: dto.passMark ?? 75,
        timeLimitMin: dto.timeLimitMin ?? 90,
        maxAttempts: dto.maxAttempts ?? 3,
        cooldownHours: dto.cooldownHours ?? 24,
        shuffleQuestions: dto.shuffleQuestions ?? true,
        retryGuidance: dto.retryGuidance,
        status: ContentStatus.DRAFT,
      },
    });
  }

  async updateExam(id: string, dto: UpdateExamDto, actor: any) {
    const actorId = actor?.sub ?? actor?.id;
    if (!actorId) throw new ForbiddenException('Authentication required');

    const exam = await this.prisma.exam.findUnique({ where: { id } });
    if (!exam) throw new NotFoundException('Exam not found');

    return this.prisma.exam.update({
      where: { id },
      data: {
        title: dto.title ?? exam.title,
        description: dto.description !== undefined ? dto.description : exam.description,
        questionCount: dto.questionCount ?? exam.questionCount,
        passMark: dto.passMark ?? exam.passMark,
        timeLimitMin: dto.timeLimitMin ?? exam.timeLimitMin,
        maxAttempts: dto.maxAttempts ?? exam.maxAttempts,
        cooldownHours: dto.cooldownHours ?? exam.cooldownHours,
        shuffleQuestions: dto.shuffleQuestions ?? exam.shuffleQuestions,
        retryGuidance: dto.retryGuidance !== undefined ? dto.retryGuidance : exam.retryGuidance,
      },
    });
  }

  async publishExam(id: string, actor: any) {
    const actorId = actor?.sub ?? actor?.id;
    if (!actorId) throw new ForbiddenException('Authentication required');

    const exam = await this.prisma.exam.findUnique({
      where: { id },
      include: {
        program: {
          include: {
            steps: { select: { id: true } },
          },
        },
      },
    });
    if (!exam) throw new NotFoundException('Exam not found');

    // Calculate active pool size
    const linkedBanks = this.prisma.questionBank?.findMany
      ? await this.prisma.questionBank.findMany({
          where: { examId: exam.id },
          select: { id: true },
        })
      : [];

    let poolCondition: any;
    if (linkedBanks && linkedBanks.length > 0) {
      const bankIds = linkedBanks.map((b) => b.id);
      poolCondition = { questionBankId: { in: bankIds } };
    } else {
      const stepIds = exam.program.steps.map((s) => s.id);
      poolCondition = {
        OR: [
          { stepId: { in: stepIds } },
          { questionBank: { stepId: { in: stepIds } } },
          { quiz: { stepId: { in: stepIds } } },
        ],
      };
    }

    const candidateCount = await this.prisma.question.count({
      where: poolCondition,
    });

    const requiredCount = exam.questionCount || 50;
    if (candidateCount < requiredCount) {
      throw new BadRequestException(
        `Cannot publish exam: Active question pool (${candidateCount}) is less than required question count (${requiredCount})`,
      );
    }

    return this.prisma.exam.update({
      where: { id },
      data: { status: ContentStatus.PUBLISHED },
    });
  }

  async saveExamAnswers(examId: string, dto: SaveExamAnswersDto, actor: any) {
    const actorId = actor?.sub ?? actor?.id;
    if (!actorId) throw new ForbiddenException('Authentication required');

    const exam = await this.prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) throw new NotFoundException('Exam not found');

    const enrolment = await this.prisma.enrolment.findFirst({
      where: { userId: actorId, programId: exam.programId },
    });
    if (!enrolment) throw new NotFoundException('Enrolment not found');

    const attempt = await this.prisma.examAttempt.findFirst({
      where: {
        enrolmentId: enrolment.id,
        examId: exam.id,
        status: AttemptStatus.IN_PROGRESS,
      },
    });
    if (!attempt) throw new NotFoundException('No active in-progress attempt found');

    const timeLimitMin = exam.timeLimitMin || 90;
    const expiresAt =
      attempt.expiresAt ??
      new Date(attempt.startedAt.getTime() + timeLimitMin * 60 * 1000);

    if (new Date() > expiresAt) {
      throw new BadRequestException('Exam attempt has expired');
    }

    const currentAnswers = (attempt.answers as any) || {};
    await this.prisma.examAttempt.update({
      where: { id: attempt.id },
      data: {
        answers: {
          ...currentAnswers,
          savedAnswers: dto.answers,
        },
      },
    });

    return { success: true, savedAt: new Date() };
  }

  async finalizeExpiredAttempts(): Promise<number> {
    const now = new Date();
    const expiredAttempts = await this.prisma.examAttempt.findMany({
      where: {
        status: AttemptStatus.IN_PROGRESS,
        expiresAt: { lte: now },
      },
      take: 50,
    });

    let count = 0;
    for (const attempt of expiredAttempts) {
      try {
        const answersJson = (attempt.answers as any) || {};
        const savedAnswers = answersJson.savedAnswers || [];
        await this.submitExam(
          attempt.examId,
          { attemptId: attempt.id, answers: savedAnswers },
          { id: 'system', sub: 'system', role: Role.SUPER_ADMIN },
        );
        count++;
      } catch (err: any) {
        await this.prisma.examAttempt.update({
          where: { id: attempt.id },
          data: {
            status: AttemptStatus.FAILED,
            completedAt: now,
          },
        }).catch(() => {});
      }
    }
    return count;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  private formatExamAttemptResponse(attempt: any, exam: any) {
    const answersJson = attempt.answers as any;
    const boundQuestions = answersJson?.boundQuestions || [];
    const timeLimitMin = exam.timeLimitMin || 90;
    const expiresAt = new Date(
      attempt.startedAt.getTime() + timeLimitMin * 60 * 1000,
    );

    return {
      attemptId: attempt.id,
      attemptNumber: attempt.attemptNumber,
      examId: exam.id,
      title: exam.title,
      status: attempt.status,
      passMark: exam.passMark,
      questionCount: boundQuestions.length,
      timeLimitMin,
      startedAt: attempt.startedAt,
      expiresAt,
      questions: boundQuestions.map((q: any) => ({
        id: q.id,
        text: q.text,
        type: q.type,
        points: q.points,
        stepId: q.stepId,
        stepSequence: q.stepSequence,
        stepTitle: q.stepTitle,
        options: this.deterministicShuffle(
          (q.options || []).map((opt: any) => ({
            id: opt.id,
            text: opt.text,
            order: opt.order,
          })),
          `${attempt.id}_${q.id}`,
        ),
      })),
    };
  }

  private deterministicShuffle<T>(array: T[], seedStr: string): T[] {
    let seed = 0;
    for (let i = 0; i < seedStr.length; i++) {
      seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
    }

    const rng = () => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  private shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}
