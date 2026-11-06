import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
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
import { AttendanceComplianceService } from '../sessions/attendance-compliance.service.js';
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
export class ExamsService {
  private readonly logger = new Logger(ExamsService.name);
  private examConfigCache = new Map<string, { expiresAt: number; data: any }>();
  private activeAttemptCache = new Map<string, { expiresAt: number; data: any }>();
  private inflightActiveAttempt = new Map<string, Promise<any>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
    private readonly progressionService: ProgressionService,
    @Optional() @InjectQueue('lifecycle') private readonly lifecycleQueue?: Queue,
    @Optional() private readonly attendanceComplianceService?: AttendanceComplianceService,
  ) { }

  /**
   * Evaluates batch live-session attendance eligibility for taking the Final Exam.
   * Respects dynamic program/batch attendanceThreshold (default 80%), attendanceRequired toggle,
   * and administrative STAGE_UNLOCK_OVERRIDE records.
   */
  private async evaluateExamAttendanceGate(enrolment: any, program: any) {
    const isAttendanceRequired = program?.attendanceRequired !== false;
    const configuredThreshold =
      typeof enrolment?.batch?.attendanceThreshold === 'number'
        ? enrolment.batch.attendanceThreshold
        : typeof program?.attendanceThreshold === 'number'
          ? program.attendanceThreshold
          : typeof program?.minAttendancePercentage === 'number'
            ? program.minAttendancePercentage
            : 80;

    if (!this.attendanceComplianceService || !isAttendanceRequired) {
      return {
        isAttendanceRequired,
        isOverridden: false,
        isEligible: true,
        attendancePercentage: 100,
        requiredThreshold: configuredThreshold,
        attendedSessions: 0,
        totalSessions: 0,
        batchId: enrolment?.batchId || null,
        batchName: enrolment?.batch?.name || null,
      };
    }

    // Check if an administrator unlocked Stage 2 (Exam) or Stage 3 (Attendance) for this enrolment
    let isOverridden = false;
    if (this.prisma.auditLog?.findMany) {
      const stageOverrides = await this.prisma.auditLog
        .findMany({
          where: {
            entity: 'Enrolment',
            entityId: enrolment.id,
            action: 'STAGE_UNLOCK_OVERRIDE',
          },
          select: { meta: true },
        })
        .catch(() => []);

      for (const log of stageOverrides) {
        const stage = (log?.meta as any)?.stage;
        if (
          stage === LearnerStage.STAGE_2_EXAM ||
          stage === LearnerStage.STAGE_3_ATTENDANCE
        ) {
          isOverridden = true;
          break;
        }
      }
    }

    const compliance = await this.attendanceComplianceService.calculateCompliance(
      enrolment.id,
    );
    const isZeroSessions =
      compliance.requiredSessionCount === 0 || compliance.status === 'NOT_APPLICABLE';
    const effectivePercentage = isZeroSessions
      ? 100
      : Math.round(compliance.attendancePercentage * 100) / 100;

    const isEligible =
      isOverridden ||
      isZeroSessions ||
      (compliance.requiredSessionCount > 0 &&
        (compliance.status === 'COMPLIANT' ||
          effectivePercentage >= compliance.thresholdUsed));

    return {
      isAttendanceRequired: !isZeroSessions && isAttendanceRequired,
      isOverridden,
      isEligible,
      attendancePercentage: effectivePercentage,
      requiredThreshold: compliance.thresholdUsed,
      attendedSessions: compliance.attendedSessionCount,
      totalSessions: compliance.requiredSessionCount,
      isZeroSessions,
      batchId: enrolment?.batchId || null,
      batchName: enrolment?.batch?.name || null,
    };
  }

  /**
   * Finalizes a single expired exam attempt via delayed BullMQ job.
   * Multi-worker safe: submitExam performs atomic conditional transaction.
   */
  async finalizeExpiredAttempt(attemptId: string): Promise<boolean> {
    const attempt = await this.prisma.examAttempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        status: true,
        expiresAt: true,
        examId: true,
        enrolmentId: true,
        answers: true,
      },
    });

    if (!attempt) {
      this.logger.warn(`Delayed finalize job: attempt ${attemptId} not found, skipping.`);
      return false;
    }

    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      this.logger.log(`Delayed finalize job: attempt ${attemptId} is already ${attempt.status}, no-op.`);
      return false;
    }

    const now = new Date();
    if (attempt.expiresAt && attempt.expiresAt.getTime() > now.getTime()) {
      this.logger.log(
        `Delayed finalize job: attempt ${attemptId} has not yet expired (expires at ${attempt.expiresAt.toISOString()}), skipping.`,
      );
      return false;
    }

    try {
      const answersJson = (attempt.answers as any) || {};
      const savedAnswers = Array.isArray(answersJson.savedAnswers) ? answersJson.savedAnswers : [];
      await this.submitExam(
        attempt.examId,
        { attemptId: attempt.id, answers: savedAnswers },
        { id: 'system', sub: 'system', role: Role.SUPER_ADMIN },
        { isAutoFinalize: true, enrolmentId: attempt.enrolmentId },
      );
      this.logger.log(`Attempt ${attempt.id} auto-finalized successfully via delayed BullMQ job`);
      return true;
    } catch (err: any) {
      if (err?.message?.includes('already finalized')) {
        this.logger.log(`Attempt ${attempt.id} was already finalized concurrently.`);
        return false;
      }
      this.logger.error(`Failed to auto-finalize attempt ${attempt.id}: ${err.message}`);
      throw err;
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

    const cached = this.examConfigCache.get(programId);
    let baseResult: any = cached && cached.expiresAt > Date.now() ? cached.data : null;

    if (!baseResult) {
      let exam = await this.prisma.exam.findFirst({
        where: { programId },
      });

      if (!exam && this.prisma.program?.findUnique && this.prisma.exam?.create) {
        const program = await this.prisma.program.findUnique({
          where: { id: programId },
        });
        if (program) {
          exam = await this.prisma.exam.create({
            data: {
              programId: program.id,
              title: `${program.title} — Final Comprehensive Examination`,
              description: 'Final Certification Examination.',
              questionCount: 0,
              passMark: 80,
              timeLimitMin: 90,
              maxAttempts: 3,
              cooldownHours: 24,
              shuffleQuestions: true,
              status: ContentStatus.PUBLISHED,
            },
          });
        }
      }

      if (!exam) {
        throw new NotFoundException('Final exam not found for this program');
      }

      baseResult = {
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
      this.examConfigCache.set(programId, {
        expiresAt: Date.now() + 60000,
        data: baseResult,
      });
    }

    if (this.attendanceComplianceService && this.prisma.enrolment?.findFirst) {
      try {
        const enrolment = await this.prisma.enrolment.findFirst({
          where: {
            userId: actorId,
            programId: baseResult.programId,
            status: { in: [EnrolmentStatus.ACTIVE, EnrolmentStatus.COMPLETED] },
          },
          include: {
            batch: true,
            program: {
              select: {
                id: true,
                title: true,
                attendanceRequired: true,
                attendanceThreshold: true,
                minAttendancePercentage: true,
              },
            },
          },
        });
        if (enrolment) {
          const attendanceGate = await this.evaluateExamAttendanceGate(
            enrolment,
            enrolment.program,
          );
          return {
            ...baseResult,
            attendanceGate,
          };
        }
      } catch {
        // Non-fatal fallback to baseResult
      }
    }

    return baseResult;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. START OR RESUME FINAL EXAM ATTEMPT
  // ─────────────────────────────────────────────────────────────────────────────

  async startExam(examId: string, actor: any, dto?: StartExamDto) {
    this.activeAttemptCache.clear();
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

    // ── Resume Active IN_PROGRESS Attempt (Fast Path: 0ms overhead) ───────────
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

    // ── Prerequisite Gate: Fast check without redundant DB persistence ────────
    const publishedStepCount = exam.program?.steps?.length || 0;
    const completedStepProgressCount = this.prisma.stepProgress?.count
      ? await this.prisma.stepProgress.count({
        where: {
          enrolmentId: enrolment.id,
          isCompleted: true,
        },
      })
      : 0;

    let allStepsCompleted = publishedStepCount > 0 && completedStepProgressCount >= publishedStepCount;
    if (!allStepsCompleted) {
      const progressionOverview = await this.progressionService.getEnrolmentProgression(
        enrolment.id,
        actor,
        { persist: false },
      );
      allStepsCompleted =
        progressionOverview.steps.length > 0 &&
        progressionOverview.steps.every((s: any) => s.isCompleted);
    }

    if (!allStepsCompleted) {
      throw new BadRequestException(
        'Prerequisite incomplete: You must complete all program steps and step quizzes before taking the final exam',
      );
    }

    // ── Live-Session Batch Attendance Gate ────────────────────────────────────
    if (this.attendanceComplianceService) {
      const attendanceGate = await this.evaluateExamAttendanceGate(
        enrolment,
        exam.program,
      );
      if (!attendanceGate.isEligible) {
        const batchLabel = attendanceGate.batchName || 'your enrolled batch';
        const message = `Minimum ${attendanceGate.requiredThreshold}% live session attendance in ${batchLabel} is required to take the Final Examination. Your current batch attendance is ${Math.round(attendanceGate.attendancePercentage)}% (${attendanceGate.attendedSessions} of ${attendanceGate.totalSessions} live sessions attended).`;

        throw new ForbiddenException({
          statusCode: 403,
          error: 'ATTENDANCE_THRESHOLD_NOT_MET',
          message,
          attendancePercentage: Math.round(attendanceGate.attendancePercentage),
          requiredThreshold: attendanceGate.requiredThreshold,
          attendedSessions: attendanceGate.attendedSessions,
          totalSessions: attendanceGate.totalSessions,
          batchId: attendanceGate.batchId,
          batchName: attendanceGate.batchName,
        });
      }
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
    const maxAttempts = exam.maxAttempts || 999;
    const attemptsRemaining = Math.max(0, maxAttempts - attemptsUsed);

    // Only enforce attempt limit if explicitly set to a restrictive number (< 900)
    if (exam.maxAttempts && exam.maxAttempts > 0 && exam.maxAttempts < 900 && attemptsUsed >= exam.maxAttempts) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Maximum exam attempts reached. Contact your instructor or administrator for a reset.',
        attemptsUsed,
        maxAttempts: exam.maxAttempts,
        attemptsRemaining: 0,
        canRetry: false,
      });
    }

    // Only enforce cooldown if explicitly set (> 0)
    if (exam.cooldownHours && exam.cooldownHours > 0) {
      const latestAttempt = completedAttempts[0];
      if (latestAttempt && latestAttempt.status === AttemptStatus.FAILED && latestAttempt.completedAt) {
        const cooldownUntil = new Date(
          latestAttempt.completedAt.getTime() + exam.cooldownHours * 3600 * 1000,
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
            cooldownHours: exam.cooldownHours,
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
    }

    // ── Question Pool Resolution ──────────────────────────────────────────────
    const stepIds = exam.program.steps.map((s) => s.id);

    const linkedBanks = this.prisma.questionBank?.findMany
      ? await this.prisma.questionBank.findMany({
        where: { examId: exam.id },
        select: { id: true },
      })
      : [];

    let poolCondition: any;
    if (linkedBanks && linkedBanks.length > 0) {
      const bankIds = linkedBanks.map((b) => b.id);
      const dedicatedCount = this.prisma.question?.count
        ? await this.prisma.question.count({ where: { questionBankId: { in: bankIds } } })
        : 0;
      if (dedicatedCount > 0) {
        poolCondition = { questionBankId: { in: bankIds } };
      } else {
        poolCondition = {
          OR: [
            { questionBankId: { in: bankIds } },
            { stepId: { in: stepIds } },
            { questionBank: { stepId: { in: stepIds } } },
            { quiz: { stepId: { in: stepIds } } },
          ],
        };
      }
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

    if (distinctCandidates.length === 0) {
      throw new BadRequestException(
        'The examination has no questions configured yet. Please contact your instructor.',
      );
    }

    // Sample questions: use all configured questions unless a valid smaller questionCount was explicitly requested
    const poolToUse = exam.shuffleQuestions
      ? this.shuffleArray([...distinctCandidates])
      : [...distinctCandidates];
    const targetCount =
      exam.questionCount && exam.questionCount > 0
        ? Math.min(exam.questionCount, poolToUse.length)
        : poolToUse.length;
    const sampledQuestions = poolToUse.slice(0, targetCount);

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

      // Enqueue delayed finalization job via BullMQ
      if (this.lifecycleQueue && expiresAt) {
        const delayMs = Math.max(0, expiresAt.getTime() - Date.now());
        const expiresAtUnix = Math.floor(expiresAt.getTime() / 1000);
        const jobId = `exam-finalize:${createdAttempt.id}:${expiresAtUnix}`;
        let timer: NodeJS.Timeout | undefined;
        try {
          const enqueuePromise = this.lifecycleQueue.add(
            'finalize-exam',
            {
              attemptId: createdAttempt.id,
              expiresAt: expiresAt.toISOString(),
              version: createdAttempt.attemptNumber,
            },
            {
              jobId,
              delay: delayMs,
              removeOnComplete: { count: 100, age: 86400 },
              removeOnFail: { count: 200, age: 7 * 86400 },
            },
          );
          enqueuePromise.catch(() => undefined);

          await Promise.race([
            enqueuePromise,
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error('BullMQ lifecycle enqueue timed out (400ms)')), 400);
              if (typeof timer.unref === 'function') timer.unref();
            }),
          ]);
          this.logger.log(
            `Enqueued delayed finalize job for attempt ${createdAttempt.id} in ${Math.round(delayMs / 1000)}s (jobId: ${jobId})`,
          );
        } catch (queueErr: any) {
          // Fail-open: Redis outage must never crash student exam start; attempt is safe in PostgreSQL
          this.logger.warn(
            `Failed to enqueue delayed finalize job for attempt ${createdAttempt.id} (recoverable via sweep): ${queueErr?.message}`,
          );
        } finally {
          if (timer) clearTimeout(timer);
        }
      }

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

  async submitExam(
    examId: string,
    dto: SubmitExamDto,
    actor: any,
    options?: { isAutoFinalize?: boolean; enrolmentId?: string },
  ) {
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

    let enrolmentId = options?.isAutoFinalize ? options.enrolmentId : undefined;
    if (!enrolmentId) {
      const enrolment = await this.prisma.enrolment.findFirst({
        where: {
          userId: actorId,
          programId: exam.programId,
        },
      });

      if (!enrolment) {
        throw new BadRequestException('Enrolment not found');
      }
      enrolmentId = enrolment.id;
    }

    let attempt = await this.prisma.examAttempt.findFirst({
      where: {
        enrolmentId,
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

    if (!options?.isAutoFinalize && elapsedMs > allowedMs) {
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
    const savedAnswersList: any[] = Array.isArray(answersJson?.savedAnswers)
      ? answersJson.savedAnswers
      : [];
    const submittedAnswers = dto.answers || [];
    for (const sub of submittedAnswers) {
      if (!boundQuestionMap.has(sub.questionId)) {
        throw new BadRequestException(
          `Question ${sub.questionId} does not belong to this exam attempt`,
        );
      }
    }

    const submittedMap = new Map<string, any>();
    for (const saved of savedAnswersList) {
      if (saved?.questionId && boundQuestionMap.has(saved.questionId)) {
        submittedMap.set(saved.questionId, saved);
      }
    }
    for (const sub of submittedAnswers) {
      submittedMap.set(sub.questionId, {
        ...(submittedMap.get(sub.questionId) || {}),
        ...sub,
      });
    }

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
          submission?.selectedOptionId ||
          submission?.optionId ||
          (Array.isArray(submission?.selectedOptionIds) &&
            submission.selectedOptionIds.length > 0
            ? submission.selectedOptionIds[0]
            : undefined) ||
          (Array.isArray(submission?.optionIds) &&
            submission.optionIds.length > 0
            ? submission.optionIds[0]
            : undefined);
        if (selectedOptId) {
          const matchedOpt =
            dbQ.options.find((o) => o.id === selectedOptId) ||
            dbQ.options.find(
              (o) =>
                typeof o.text === 'string' &&
                o.text.trim().toLowerCase() ===
              String(selectedOptId).trim().toLowerCase(),
            );
          if (matchedOpt && matchedOpt.isCorrect) {
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
    const passMark = exam.passMark || 80;
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

    const cooldownHours = exam.cooldownHours ?? 0;
    const cooldownUntil = !passed
      ? new Date(now.getTime() + cooldownHours * 3600 * 1000)
      : null;
    const cooldownSecondsRemaining = !passed ? cooldownHours * 3600 : 0;

    // ── Atomic Finalization via Prisma Transaction ────────────────────────────
      this.activeAttemptCache.clear();
      await this.prisma.$transaction(
        async (tx) => {
          const current = await tx.examAttempt.findUnique({
            where: { id: attempt.id },
            select: { id: true, status: true },
          });

          if (!current || current.status !== AttemptStatus.IN_PROGRESS) {
            throw new BadRequestException('Exam attempt is already finalized');
          }

              await tx.examAttempt.update({
                where: { id: attempt.id },
                select: { id: true },
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
      await tx.enrolment
        .update({
          where: { id: attempt.enrolmentId },
          select: { id: true },
          data: {
            examPassedAt: now,
            currentStage: LearnerStage.STAGE_3_ATTENDANCE,
          },
        })
        .catch(() => { });
    }
  },
      { maxWait: 15000, timeout: 30000 },
    );
this.activeAttemptCache.clear();

this.progressionService?.invalidateCache?.(attempt.enrolmentId);

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

  const cacheKey = `${actorId}:${examId}`;
  const cached = process.env.NODE_ENV !== 'test' ? this.activeAttemptCache.get(cacheKey) : null;
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const inflight = this.inflightActiveAttempt.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const computePromise = (async () => {
    let exam = await this.prisma.exam.findUnique({
      where: { id: examId },
    });
    if (!exam && typeof (this.prisma as any).exam?.findFirst === 'function') {
      exam = await this.prisma.exam.findFirst({
        where: { programId: examId },
      });
    }

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
      select: {
        id: true,
        attemptNumber: true,
        score: true,
        passed: true,
        status: true,
        startedAt: true,
        expiresAt: true,
        completedAt: true,
        createdAt: true,
        answers: true,
      },
    });

    if (activeAttempt) {
      return this.formatExamAttemptResponse(activeAttempt, exam);
    }

    // 2. Fall back to latest attempt with retry metadata (parallelize findMany + auditLog)
    const [allAttemptsRaw, lastReset] = await Promise.all([
      this.prisma.examAttempt.findMany
        ? this.prisma.examAttempt.findMany({
          where: {
            enrolmentId: enrolment.id,
            examId: exam.id,
          },
          select: {
            id: true,
            attemptNumber: true,
            score: true,
            passed: true,
            status: true,
            startedAt: true,
            expiresAt: true,
            completedAt: true,
            createdAt: true,
            answers: true,
          },
          orderBy: { attemptNumber: 'desc' },
        })
        : Promise.resolve([]),
      this.prisma.auditLog?.findFirst
        ? this.prisma.auditLog.findFirst({
          where: {
            action: 'EXAM_ATTEMPTS_RESET',
            entity: 'ExamAttempt',
            entityId: `${enrolment.id}_${exam.id}`,
          },
          select: { createdAt: true },
          orderBy: { createdAt: 'desc' },
        })
        : Promise.resolve(null),
    ]);

    const allAttempts = Array.isArray(allAttemptsRaw) ? allAttemptsRaw : [];
    const latestAttempt =
      allAttempts[0] ??
      (await this.prisma.examAttempt.findFirst({
        where: {
          enrolmentId: enrolment.id,
          examId: exam.id,
        },
        orderBy: { attemptNumber: 'desc' },
      }));

    if (!latestAttempt) {
      return null;
    }

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
      cooldownHours > 0 &&
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
  })();

  this.inflightActiveAttempt.set(cacheKey, computePromise);
  try {
    const result = await computePromise;
    this.activeAttemptCache.set(cacheKey, {
      expiresAt: Date.now() + 15000,
      data: result,
    });
    return result;
  } finally {
    this.inflightActiveAttempt.delete(cacheKey);
  }
}

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. ADMINISTRATIVE: RESET EXAM ATTEMPTS
  // ─────────────────────────────────────────────────────────────────────────────

  async resetExamAttempts(
  examId: string,
  enrolmentId: string,
  dto: ResetExamAttemptsDto,
  actor: any,
  ip ?: string,
) {
  this.activeAttemptCache.clear();
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

  let exam = await this.prisma.exam.findUnique({
    where: { id: examId },
  });
  if (!exam && typeof (this.prisma as any).exam?.findFirst === 'function') {
    exam = await this.prisma.exam.findFirst({
      where: { programId: examId },
    });
  }

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
  this.examConfigCache.clear();
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
      passMark: dto.passMark ?? 80,
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
  this.examConfigCache.clear();
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
  this.examConfigCache.clear();
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
  const requiredCount = exam.questionCount || 50;
  const stepIds = exam.program.steps.map((s) => s.id);
  const linkedBanks = this.prisma.questionBank?.findMany
    ? await this.prisma.questionBank.findMany({
      where: { examId: exam.id },
      select: { id: true },
    })
    : [];

  let poolCondition: any;
  if (linkedBanks && linkedBanks.length > 0) {
    const bankIds = linkedBanks.map((b) => b.id);
    const dedicatedCount = this.prisma.question?.count
      ? await this.prisma.question.count({ where: { questionBankId: { in: bankIds } } })
      : 0;
    if (dedicatedCount >= requiredCount) {
      poolCondition = { questionBankId: { in: bankIds } };
    } else {
      poolCondition = {
        OR: [
          { questionBankId: { in: bankIds } },
          { stepId: { in: stepIds } },
          { questionBank: { stepId: { in: stepIds } } },
          { quiz: { stepId: { in: stepIds } } },
        ],
      };
    }
  } else {
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

  if (candidateCount === 0) {
    throw new BadRequestException(
      'Cannot publish exam: Please add at least one question before publishing.',
    );
  }

  const targetQuestionCount =
    candidateCount >= (exam.questionCount || 50)
      ? exam.questionCount || 50
      : candidateCount;

  return this.prisma.exam.update({
    where: { id },
    data: {
      status: ContentStatus.PUBLISHED,
      questionCount: targetQuestionCount,
    },
  });
}

  private async autoSeed70QuestionPool(_exam: any, _existingCount: number): Promise < any[] > {
  // Disabled: Never auto-seed random or synthetic questions. Only instructor-created questions are used.
  return [];
}

  // ─────────────────────────────────────────────────────────────────────────────
  // 4B. DEDICATED FINAL EXAM QUESTION BANK CRUD (70-Q POOL FOR 50-MARK EXAM)
  // ─────────────────────────────────────────────────────────────────────────────

  private async ensureExamAndDedicatedBank(programIdOrExamId: string, byProgram = false) {
  let exam = byProgram
    ? await this.prisma.exam.findFirst({
      where: { programId: programIdOrExamId },
      include: { program: { include: { steps: { orderBy: { sequence: 'asc' } } } } },
    })
    : await this.prisma.exam.findUnique({
      where: { id: programIdOrExamId },
      select: {
        id: true,
        programId: true,
        title: true,
        description: true,
        questionCount: true,
        passMark: true,
        timeLimitMin: true,
        maxAttempts: true,
        cooldownHours: true,
        shuffleQuestions: true,
        status: true,
        program: {
          select: {
            id: true,
            title: true,
            steps: {
              select: { id: true },
              orderBy: { sequence: 'asc' },
            },
          },
        },
      },
    });

  if (!exam && byProgram) {
    const program = await this.prisma.program.findUnique({
      where: { id: programIdOrExamId },
      include: { steps: { orderBy: { sequence: 'asc' } } },
    });
    if (!program) {
      throw new NotFoundException('Program not found');
    }
    const created = await this.prisma.exam.create({
      data: {
        programId: program.id,
        title: `${program.title} — Final Comprehensive Examination`,
        description: 'Final Certification Examination.',
        questionCount: 0,
        passMark: 80,
        timeLimitMin: 90,
        maxAttempts: 3,
        cooldownHours: 24,
        shuffleQuestions: true,
        status: ContentStatus.DRAFT,
      },
    });
    exam = { ...created, program } as any;
  }

  if (!exam) {
    throw new NotFoundException('Exam not found');
  }

  let bank = await this.prisma.questionBank.findFirst({
    where: { examId: exam.id },
  });

  if (!bank) {
    bank = await this.prisma.questionBank.create({
      data: {
        title: `${exam.title} — Exam Question Bank`,
        description: 'Dedicated Final Exam Question Bank',
        programId: exam.programId,
        examId: exam.id,
      },
    });
  }

  return { exam, bank };
}

  private assertStaffActor(actor: any): string {
  const actorId = actor?.sub ?? actor?.id;
  if (!actorId) {
    throw new ForbiddenException('Authentication required');
  }
  const role = String(actor?.role || '').toUpperCase();
  if (!role || role === Role.USER || role === 'LEARNER') {
    throw new ForbiddenException(
      'Access denied: Staff privileges required to access or modify the exam question pool',
    );
  }
  return actorId;
}

  async getProgramExamQuestions(programId: string, actor: any) {
  this.assertStaffActor(actor);

  const { exam, bank } = await this.ensureExamAndDedicatedBank(programId, true);
  return this.buildExamQuestionsPayload(exam, bank);
}

  async getExamQuestions(examId: string, actor: any) {
  this.assertStaffActor(actor);

  const { exam, bank } = await this.ensureExamAndDedicatedBank(examId, false);
  return this.buildExamQuestionsPayload(exam, bank);
}

  private async buildExamQuestionsPayload(exam: any, bank: any) {
  const dedicatedQuestions = await this.prisma.question.findMany({
    where: { questionBankId: bank.id },
    include: {
      options: { orderBy: { order: 'asc' } },
      step: { select: { id: true, sequence: true, title: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const stepIds = (exam.program?.steps || []).map((s: any) => s.id);
  const fallbackStepCount =
    stepIds.length > 0 && this.prisma.question?.count
      ? await this.prisma.question.count({
        where: {
          OR: [
            { stepId: { in: stepIds } },
            { questionBank: { stepId: { in: stepIds } } },
            { quiz: { stepId: { in: stepIds } } },
          ],
        },
      })
      : 0;

  const questionsPerAttempt =
    exam.questionCount && exam.questionCount > 0
      ? Math.min(exam.questionCount, dedicatedQuestions.length)
      : dedicatedQuestions.length;

  return {
    exam: {
      id: exam.id,
      programId: exam.programId,
      title: exam.title,
      description: exam.description,
      questionCount: exam.questionCount,
      passMark: exam.passMark,
      timeLimitMin: exam.timeLimitMin,
      maxAttempts: exam.maxAttempts,
      cooldownHours: exam.cooldownHours,
      shuffleQuestions: exam.shuffleQuestions,
      status: exam.status,
    },
    questionBankId: bank.id,
    dedicatedPoolCount: dedicatedQuestions.length,
    fallbackStepPoolCount: fallbackStepCount,
    totalPoolCount: dedicatedQuestions.length,
    recommendedPoolSize: dedicatedQuestions.length,
    questionsPerAttempt,
    totalMarks: questionsPerAttempt,
    questions: dedicatedQuestions,
  };
}

  async createExamQuestion(examId: string, dto: any, actor: any) {
  this.assertStaffActor(actor);

  const { bank } = await this.ensureExamAndDedicatedBank(examId, false);

  const text = (dto.text || '').trim();
  if (!text) {
    throw new BadRequestException('Question text is required');
  }

  const type: QuestionType =
    dto.type === 'MULTI_SELECT'
      ? QuestionType.MULTI_SELECT
      : dto.type === 'SHORT_ANSWER' || dto.type === 'TEXT_BOX'
        ? QuestionType.SHORT_ANSWER
        : QuestionType.MULTIPLE_CHOICE;

  const rawOptions = Array.isArray(dto.options) ? dto.options : [];
  const optionsToCreate =
    type === QuestionType.SHORT_ANSWER
      ? []
      : (rawOptions.length > 0
        ? rawOptions
        : [
          { text: 'Option A', isCorrect: true, order: 1 },
          { text: 'Option B', isCorrect: false, order: 2 },
          { text: 'Option C', isCorrect: false, order: 3 },
          { text: 'Option D', isCorrect: false, order: 4 },
        ]
      ).map((opt: any, idx: number) => ({
        text:
          rawOptions.length > 0
            ? String(opt?.text ?? '').trim()
            : (opt.text || `Option ${idx + 1}`).trim(),
        imageUrl: opt?.imageUrl || null,
        isCorrect: Boolean(opt?.isCorrect),
        order: typeof opt?.order === 'number' ? opt.order : idx + 1,
      }));

  if (type !== QuestionType.SHORT_ANSWER) {
    if (optionsToCreate.length < 2) {
      throw new BadRequestException('Objective questions require at least 2 options');
    }
    if (optionsToCreate.some((opt: any) => !opt.text)) {
      throw new BadRequestException('All question options must have non-empty text');
    }
    if (!optionsToCreate.some((opt: any) => opt.isCorrect)) {
      throw new BadRequestException('At least one option must be marked as correct');
    }
  }

  const rawPoints = Number(dto.points);
  const points =
    Number.isFinite(rawPoints) && rawPoints > 0
      ? Math.min(100, Math.max(1, Math.round(rawPoints)))
      : 1;

  return this.prisma.question.create({
    data: {
      questionBankId: bank.id,
      stepId: dto.stepId || null,
      text,
      type,
      points,
      imageUrl: dto.imageUrl || null,
      explanation: dto.explanation || null,
      gradingMode: dto.gradingMode || 'SELF_REFLECTION_AUTO_PASS',
      minCharacters: dto.minCharacters ?? 10,
      options:
        optionsToCreate.length > 0
          ? {
            create: optionsToCreate,
          }
          : undefined,
    },
    include: {
      options: { orderBy: { order: 'asc' } },
      step: { select: { id: true, sequence: true, title: true } },
    },
  });
}

  async bulkCreateExamQuestions(
  examId: string,
  questionsInput: any[],
  actor: any,
  replaceExisting = false,
) {
  this.assertStaffActor(actor);

  if (!Array.isArray(questionsInput) || questionsInput.length === 0) {
    throw new BadRequestException('At least one question is required for bulk creation');
  }
  if (questionsInput.length > 100) {
    throw new BadRequestException('Cannot bulk create more than 100 questions per request');
  }

  const { exam, bank } = await this.ensureExamAndDedicatedBank(examId, false);

  if (
    replaceExisting &&
    typeof (this.prisma as any).question?.deleteMany === 'function'
  ) {
    await this.prisma.question.deleteMany({
      where: { questionBankId: bank.id },
    });
  }

  const created: any[] = [];

  for (const dto of questionsInput) {
    const text = (dto.text || '').trim();
    if (!text) continue;

    const type: QuestionType =
      dto.type === 'MULTI_SELECT'
        ? QuestionType.MULTI_SELECT
        : dto.type === 'SHORT_ANSWER' || dto.type === 'TEXT_BOX'
          ? QuestionType.SHORT_ANSWER
          : QuestionType.MULTIPLE_CHOICE;

    const rawOptions = Array.isArray(dto.options) ? dto.options : [];
    const optionsToCreate =
      type === QuestionType.SHORT_ANSWER
        ? []
        : (rawOptions.length > 0
          ? rawOptions
          : [
            { text: 'Option A', isCorrect: true, order: 1 },
            { text: 'Option B', isCorrect: false, order: 2 },
            { text: 'Option C', isCorrect: false, order: 3 },
            { text: 'Option D', isCorrect: false, order: 4 },
          ]
        ).map((opt: any, idx: number) => ({
          text:
            rawOptions.length > 0
              ? String(opt?.text ?? '').trim()
              : (opt.text || `Option ${idx + 1}`).trim(),
          imageUrl: opt?.imageUrl || null,
          isCorrect: Boolean(opt?.isCorrect),
          order: typeof opt?.order === 'number' ? opt.order : idx + 1,
        }));

    const rawPoints = Number(dto.points);
    const points =
      Number.isFinite(rawPoints) && rawPoints > 0
        ? Math.min(100, Math.max(1, Math.round(rawPoints)))
        : 1;

    const q = await this.prisma.question.create({
      data: {
        questionBankId: bank.id,
        stepId: dto.stepId || null,
        text,
        type,
        points,
        imageUrl: dto.imageUrl || null,
        explanation: dto.explanation || null,
        gradingMode: dto.gradingMode || 'SELF_REFLECTION_AUTO_PASS',
        minCharacters: dto.minCharacters ?? 10,
        options:
          optionsToCreate.length > 0
            ? {
              create: optionsToCreate,
            }
            : undefined,
      },
      include: {
        options: { orderBy: { order: 'asc' } },
        step: { select: { id: true, sequence: true, title: true } },
      },
    });
    created.push(q);
  }

  return {
    createdCount: created.length,
    replaced: Boolean(replaceExisting),
    questionBankId: bank.id,
    questions: created,
  };
}

  async updateExamQuestion(examId: string, questionId: string, dto: any, actor: any) {
  this.assertStaffActor(actor);

  const { bank } = await this.ensureExamAndDedicatedBank(examId, false);

  const existing = await this.prisma.question.findUnique({
    where: { id: questionId },
    include: { options: true },
  });
  if (!existing) {
    throw new NotFoundException('Exam question not found');
  }
  if (existing.questionBankId !== bank.id) {
    throw new BadRequestException('Question does not belong to this exam question bank');
  }

  if (dto.text !== undefined && !String(dto.text).trim()) {
    throw new BadRequestException('Question text cannot be empty');
  }

  const type: QuestionType = dto.type
    ? dto.type === 'MULTI_SELECT'
      ? QuestionType.MULTI_SELECT
      : dto.type === 'SHORT_ANSWER' || dto.type === 'TEXT_BOX'
        ? QuestionType.SHORT_ANSWER
        : QuestionType.MULTIPLE_CHOICE
    : existing.type;

  const optionsToCreate =
    Array.isArray(dto.options) && type !== QuestionType.SHORT_ANSWER
      ? dto.options.map((opt: any, idx: number) => ({
        text: String(opt?.text ?? '').trim(),
        imageUrl: opt?.imageUrl || null,
        isCorrect: Boolean(opt?.isCorrect),
        order: typeof opt?.order === 'number' ? opt.order : idx + 1,
      }))
      : undefined;

  if (optionsToCreate) {
    if (optionsToCreate.length < 2) {
      throw new BadRequestException('Objective questions require at least 2 options');
    }
    if (optionsToCreate.some((opt: any) => !opt.text)) {
      throw new BadRequestException('All question options must have non-empty text');
    }
    if (!optionsToCreate.some((opt: any) => opt.isCorrect)) {
      throw new BadRequestException('At least one option must be marked as correct');
    }
  }

  if (Array.isArray(dto.options)) {
    await this.prisma.option.deleteMany({
      where: { questionId },
    });
  }

  const nextPoints =
    dto.points !== undefined
      ? Math.min(100, Math.max(1, Math.round(Number(dto.points) || 1)))
      : existing.points;

  return this.prisma.question.update({
    where: { id: questionId },
    data: {
      text: dto.text !== undefined ? String(dto.text).trim() : existing.text,
      type,
      points: nextPoints,
      imageUrl: dto.imageUrl !== undefined ? dto.imageUrl : existing.imageUrl,
      explanation: dto.explanation !== undefined ? dto.explanation : existing.explanation,
      stepId: dto.stepId !== undefined ? dto.stepId || null : existing.stepId,
      gradingMode: dto.gradingMode !== undefined ? dto.gradingMode : existing.gradingMode,
      minCharacters: dto.minCharacters !== undefined ? dto.minCharacters : existing.minCharacters,
      ...(optionsToCreate
        ? {
          options: {
            create: optionsToCreate,
          },
        }
        : {}),
    },
    include: {
      options: { orderBy: { order: 'asc' } },
      step: { select: { id: true, sequence: true, title: true } },
    },
  });
}

  async deleteExamQuestion(examId: string, questionId: string, actor: any) {
  this.assertStaffActor(actor);

  const { bank } = await this.ensureExamAndDedicatedBank(examId, false);

  const existing = await this.prisma.question.findUnique({
    where: { id: questionId },
  });
  if (!existing) {
    throw new NotFoundException('Exam question not found');
  }
  if (existing.questionBankId !== bank.id) {
    throw new BadRequestException('Question does not belong to this exam question bank');
  }

  await this.prisma.question.delete({
    where: { id: questionId },
  });

  return { success: true, deletedId: questionId };
}

  async saveExamAnswers(examId: string, dto: SaveExamAnswersDto, actor: any) {
  this.activeAttemptCache.clear();
  const actorId = actor?.sub ?? actor?.id;
  if (!actorId) throw new ForbiddenException('Authentication required');

  if (!Array.isArray(dto?.answers)) {
    throw new BadRequestException('Answers must be an array');
  }

  let exam = await this.prisma.exam.findUnique({ where: { id: examId } });
  if (!exam && typeof (this.prisma as any).exam?.findFirst === 'function') {
    exam = await this.prisma.exam.findFirst({ where: { programId: examId } });
  }
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
  const boundQuestionIds: string[] = Array.isArray(currentAnswers.boundQuestionIds)
    ? currentAnswers.boundQuestionIds
    : [];

  if (boundQuestionIds.length > 0) {
    const boundSet = new Set(boundQuestionIds);
    for (const ans of dto.answers) {
      if (!ans?.questionId || !boundSet.has(ans.questionId)) {
        throw new BadRequestException(
          `Question ${ans?.questionId || 'unknown'} does not belong to this exam attempt`,
        );
      }
    }
  }

  const savedAt = new Date();
  const nextQuestionIndex =
    typeof dto.currentQuestionIndex === 'number' && dto.currentQuestionIndex >= 0
      ? dto.currentQuestionIndex
      : typeof currentAnswers.currentQuestionIndex === 'number'
        ? currentAnswers.currentQuestionIndex
        : 0;

  await this.prisma.examAttempt.update({
    where: { id: attempt.id },
    select: { id: true },
    data: {
      answers: {
        ...currentAnswers,
        savedAnswers: dto.answers,
        currentQuestionIndex: nextQuestionIndex,
        lastSavedAt: savedAt.toISOString(),
      },
    },
  });

  return {
    success: true,
    savedAt,
    currentQuestionIndex: nextQuestionIndex,
    savedCount: dto.answers.length,
  };
}

  async finalizeExpiredAttempts(limit = 50): Promise < number > {
  const now = new Date();
  const expiredAttempts = await this.prisma.examAttempt.findMany({
    where: {
      status: AttemptStatus.IN_PROGRESS,
      expiresAt: { lte: now },
    },
    take: limit,
  });

  let count = 0;
  for(const attempt of expiredAttempts) {
    try {
      const answersJson = (attempt.answers as any) || {};
      const savedAnswers = Array.isArray(answersJson.savedAnswers)
        ? answersJson.savedAnswers
        : [];
      await this.submitExam(
        attempt.examId,
        { attemptId: attempt.id, answers: savedAnswers },
        { id: 'system', sub: 'system', role: Role.SUPER_ADMIN },
        { isAutoFinalize: true, enrolmentId: attempt.enrolmentId },
      );
      count++;
    } catch (err: any) {
      await Promise.resolve(
        this.prisma.examAttempt.update({
          where: { id: attempt.id },
          data: {
            status: AttemptStatus.FAILED,
            completedAt: now,
          },
        })
      ).catch(() => { });
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

  const savedAnswers = Array.isArray(answersJson?.savedAnswers)
    ? answersJson.savedAnswers
    : [];
  const currentQuestionIndex =
    typeof answersJson?.currentQuestionIndex === 'number' &&
      answersJson.currentQuestionIndex >= 0
      ? answersJson.currentQuestionIndex
      : 0;
  const lastSavedAt = answersJson?.lastSavedAt || null;

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
    savedAnswers,
    currentQuestionIndex,
    lastSavedAt,
    answers: {
      savedAnswers,
      currentQuestionIndex,
      lastSavedAt,
    },
    questions: boundQuestions.map((q: any) => ({
      id: q.id,
      text: q.text,
      type: q.type,
      imageUrl: q.imageUrl || null,
      gradingMode: q.gradingMode || 'SELF_REFLECTION_AUTO_PASS',
      minCharacters: q.minCharacters ?? 10,
      points: q.points,
      stepId: q.stepId,
      stepSequence: q.stepSequence,
      stepTitle: q.stepTitle,
      options: this.deterministicShuffle(
        (q.options || []).map((opt: any) => ({
          id: opt.id,
          text: opt.text,
          imageUrl: opt.imageUrl || null,
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
