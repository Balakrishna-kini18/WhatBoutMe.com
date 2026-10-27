import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Optional,
  forwardRef,
} from '@nestjs/common';
import {
  AttemptStatus,
  OneOnOneRequestStatus,
  SessionStatus,
  SessionType,
  BookingStatus,
  LearnerStage,
  Role,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StageGateService } from '../progression/stage-gate.service.js';
import { EmailService } from '../email/email.service.js';
import { MEETING_PROVIDER } from '../../common/interfaces/meeting-provider.interface.js';
import {
  CreateOneOnOneRequestDto,
  ApproveOneOnOneRequestDto,
  RejectOneOnOneRequestDto,
} from './dto/one-on-one.dto.js';

@Injectable()
export class OneOnOneService {
  private readonly logger = new Logger(OneOnOneService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => StageGateService))
    private readonly stageGateService: StageGateService,
    private readonly emailService: EmailService,
    @Optional() @Inject(MEETING_PROVIDER) private readonly meetingProvider: any,
  ) {}

  /**
   * Learner creates a 1-on-1 coaching request (gated by Post-Exam / Stage 4 milestone).
   */
  async createRequest(userId: string, dto: CreateOneOnOneRequestDto) {
    // Fast-path parallel query: fetch enrolment, duplicate pending check, and passed exam status in 1 round-trip
    const hasExamAttemptReader = typeof (this.prisma as any).examAttempt?.findFirst === 'function';
    const [enrolment, existingPending, fastPassedExam] = await Promise.all([
      this.prisma.enrolment.findUnique({
        where: { id: dto.enrolmentId },
        include: { program: true },
      }),
      this.prisma.oneOnOneRequest.findFirst({
        where: {
          enrolmentId: dto.enrolmentId,
          status: OneOnOneRequestStatus.PENDING_APPROVAL,
        },
      }),
      hasExamAttemptReader
        ? this.prisma.examAttempt.findFirst({
            where: {
              enrolmentId: dto.enrolmentId,
              OR: [{ status: AttemptStatus.PASSED }, { passed: true }],
            },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);

    const fastUnlockedByExam = Boolean(
      enrolment?.examPassedAt ||
        fastPassedExam ||
        (enrolment?.program && (enrolment.program as any).requireExam === false),
    );

    // 1. Stage gate enforcement: only invoke full stage evaluation if fast-path exam check did not already satisfy it
    if (!fastUnlockedByExam) {
      try {
        await this.stageGateService.assertStageUnlocked(
          dto.enrolmentId,
          LearnerStage.STAGE_4_ONE_ON_ONE,
        );
      } catch (stageErr: any) {
        let unlockedViaExam = false;
        const evalResult =
          stageErr?.evaluation ??
          (typeof this.stageGateService?.evaluateStages === 'function'
            ? await this.stageGateService.evaluateStages(dto.enrolmentId).catch(() => null)
            : null);

        const s2 = evalResult?.stages?.[LearnerStage.STAGE_2_EXAM];
        const s4 = evalResult?.stages?.[LearnerStage.STAGE_4_ONE_ON_ONE];
        if (
          s4?.isUnlocked ||
          s4?.isOverridden ||
          s2?.isCompleted ||
          s2?.isOverridden ||
          s2?.details?.examPassed === true
        ) {
          unlockedViaExam = true;
        }
        if (!unlockedViaExam) {
          throw stageErr;
        }
      }
    }

    if (!enrolment) {
      throw new NotFoundException(`Enrolment with ID ${dto.enrolmentId} not found`);
    }

    if (enrolment.userId !== userId) {
      throw new ForbiddenException('You can only request 1-on-1 coaching for your own enrolment');
    }

    if (existingPending) {
      const isPast =
        existingPending.requestedStart &&
        new Date(existingPending.requestedStart).getTime() < Date.now();
      if (isPast) {
        await this.prisma.oneOnOneRequest.update({
          where: { id: existingPending.id },
          data: {
            status: OneOnOneRequestStatus.EXPIRED,
            decisionReason: 'Superseded: original requested slot passed without instructor confirmation',
          },
        });
      } else {
        throw new ConflictException(
          'A 1-on-1 coaching call request is already pending review for this enrolment',
        );
      }
    }

    const requestedStart = new Date(dto.requestedStart);
    if (isNaN(requestedStart.getTime())) {
      throw new BadRequestException('Invalid date format for requested start or end time');
    }

    if (requestedStart.getTime() < Date.now() - 60 * 1000) {
      throw new BadRequestException(
        'Cannot book a coaching session slot in the past. Please select an upcoming date and time.',
      );
    }

    const requestedEnd = dto.requestedEnd
      ? new Date(dto.requestedEnd)
      : new Date(requestedStart.getTime() + 45 * 60 * 1000);

    if (isNaN(requestedEnd.getTime())) {
      throw new BadRequestException('Invalid date format for requested start or end time');
    }

    if (requestedEnd <= requestedStart) {
      throw new BadRequestException('Requested end time must be after start time');
    }

    // 4. Create request
    const request = await this.prisma.oneOnOneRequest.create({
      data: {
        enrolmentId: dto.enrolmentId,
        userId,
        requestedStart,
        requestedEnd,
        learnerTimezone: dto.learnerTimezone || 'UTC',
        notes: dto.notes,
        status: OneOnOneRequestStatus.PENDING_APPROVAL,
      },
      include: {
        enrolment: {
          include: {
            program: { select: { id: true, title: true } },
          },
        },
      },
    });

    // 5. Non-blocking Audit Log so HTTP response returns immediately
    const auditPromise = this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'ONE_ON_ONE_REQUESTED',
        entity: 'OneOnOneRequest',
        entityId: request.id,
        meta: {
          enrolmentId: dto.enrolmentId,
          requestedStart: requestedStart.toISOString(),
          requestedEnd: requestedEnd.toISOString(),
        },
      },
    });
    if (auditPromise && typeof auditPromise.catch === 'function') {
      auditPromise.catch((err: any) =>
        this.logger.warn(`Failed to write ONE_ON_ONE_REQUESTED audit log: ${err?.message}`),
      );
    }

    this.logger.log(
      `Learner ${userId} submitted 1-on-1 coaching request ${request.id} for enrolment ${dto.enrolmentId}`,
    );

    return request;
  }

  /**
   * Learner views all their 1-on-1 requests and scheduled sessions.
   */
  async getMyRequests(userId: string) {
    return this.prisma.oneOnOneRequest.findMany({
      where: { userId },
      include: {
        enrolment: {
          include: {
            program: { select: { id: true, title: true } },
          },
        },
        session: {
          include: {
            hostTrainer: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Learner cancels a pending 1-on-1 request.
   */
  async cancelRequest(userId: string, requestId: string) {
    const request = await this.prisma.oneOnOneRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException(`1-on-1 request with ID ${requestId} not found`);
    }

    if (request.userId !== userId) {
      throw new ForbiddenException('You cannot cancel another learner’s request');
    }

    if (request.status !== OneOnOneRequestStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Only requests in PENDING_APPROVAL status can be cancelled (current: ${request.status})`,
      );
    }

    return this.prisma.oneOnOneRequest.update({
      where: { id: requestId },
      data: { status: OneOnOneRequestStatus.CANCELLED },
    });
  }

  /**
   * Admin / Manager views 1-on-1 requests queue.
   * Scoped by manager batch assignments for MANAGER role.
   */
  async getAllRequests(status?: OneOnOneRequestStatus, actorUser?: any) {
    const where: any = status ? { status } : {};

    if (actorUser?.role === Role.MANAGER) {
      const actorId = actorUser.sub ?? actorUser.id;
      where.enrolment = {
        batch: {
          OR: [
            { managerId: actorId },
            { managerId: null },
            { trainers: { some: { trainerId: actorId } } },
          ],
        },
      };
    }

    return this.prisma.oneOnOneRequest.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        enrolment: {
          include: {
            program: { select: { id: true, title: true } },
            batch: { select: { id: true, name: true } },
          },
        },
        session: {
          include: {
            hostTrainer: { select: { id: true, name: true, email: true } },
          },
        },
        decidedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Admin approves a 1-on-1 coaching request:
   * - Uses PostgreSQL pg_advisory_xact_lock on hostTrainerId
   * - Checks calendar clash
   * - Creates Zoom link (or fallback mock)
   * - Creates Session and confirmed SessionBooking
   * - Updates OneOnOneRequest to APPROVED
   * - Records immutable AuditLog
   */
  async approveRequest(requestId: string, adminId: string, dto: ApproveOneOnOneRequestDto, actorUser?: any) {
    const request = await this.prisma.oneOnOneRequest.findUnique({
      where: { id: requestId },
      include: {
        user: true,
        enrolment: {
          include: {
            program: { select: { id: true, title: true } },
            batch: {
              include: {
                trainers: { select: { trainerId: true } },
              },
            },
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException(`1-on-1 request with ID ${requestId} not found`);
    }

    if (actorUser?.role === Role.MANAGER) {
      const batch = request.enrolment?.batch;
      const isAssigned =
        !batch ||
        batch.managerId === adminId ||
        batch.managerId == null ||
        (Array.isArray(batch.trainers) &&
          batch.trainers.some((t: any) => t.trainerId === adminId));
      if (!isAssigned) {
        throw new ForbiddenException(
          'Access denied: You can only approve 1-on-1 requests for your assigned batches',
        );
      }
    }

    if (request.status !== OneOnOneRequestStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Cannot approve request in status ${request.status}. Only PENDING_APPROVAL requests can be approved.`,
      );
    }

    const startTime = dto.startTime ? new Date(dto.startTime) : request.requestedStart;
    const endTime = dto.endTime ? new Date(dto.endTime) : request.requestedEnd;
    const hostTrainerId = dto.hostTrainerId || adminId;

    if (endTime <= startTime) {
      throw new BadRequestException('Session end time must be after start time');
    }

    if (startTime.getTime() < Date.now() - 60 * 1000) {
      throw new BadRequestException(
        'The requested slot time has already passed. You cannot accept or schedule a session in the past. Please select an upcoming date and time.',
      );
    }

    const durationMinutes =
      Math.round((endTime.getTime() - startTime.getTime()) / (60 * 1000)) || 30;

    // 1. Zoom meeting generation OUTSIDE db transaction to prevent transaction timeouts
    let joinUrl = dto.meetingLink || '';
    let hostUrl = '';
    let zoomMeetingId = '';

    if (!joinUrl && this.meetingProvider && typeof this.meetingProvider.createMeeting === 'function') {
      try {
        const zoomMeeting = await this.meetingProvider.createMeeting({
          topic: `1-on-1 Coaching: ${request.enrolment?.program?.title || 'Program'} - ${request.user.name || request.user.email}`,
          startTime,
          durationMinutes,
          timezone: request.learnerTimezone || 'UTC',
        });
        if (zoomMeeting?.joinUrl) {
          joinUrl = zoomMeeting.joinUrl;
          hostUrl = zoomMeeting.startUrl || zoomMeeting.joinUrl;
          zoomMeetingId = zoomMeeting.id;
        }
      } catch (err: any) {
        this.logger.warn(`Failed to generate Zoom meeting: ${err?.message}`);
      }
    }

    if (!joinUrl) {
      const mockId = `zoom-1on1-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      joinUrl = `https://zoom.us/j/${mockId}?pwd=coaching`;
      hostUrl = `https://zoom.us/s/${mockId}?pwd=coaching`;
      zoomMeetingId = mockId;
    }

    const sessionTitle = `1-on-1 Coaching: ${request.user.name || request.user.email}`;
    const batchId = (request.enrolment as any)?.batchId || request.enrolment?.batch?.id;

    // 2. Database transaction with generous timeout for neon serverless connection
    const updatedRequest = await this.prisma.$transaction(
      async (tx) => {
        // Advisory lock on host trainer
        if (typeof tx.$executeRaw === 'function') {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${hostTrainerId}))`;
        }

        // Clash check for host trainer
        const clash = await tx.session.findFirst({
          where: {
            hostTrainerId,
            status: { notIn: [SessionStatus.CANCELLED, SessionStatus.RESCHEDULED] },
            startTime: { lt: endTime },
            endTime: { gt: startTime },
          },
        });

        if (clash) {
          throw new ConflictException(
            `The assigned host trainer already has a session booked during this time window ("${clash.title}")`,
          );
        }

        // Create Session
        const session = await tx.session.create({
          data: {
            title: sessionTitle,
            description: `Stage 4 Dedicated 1-on-1 Coaching Session. Notes: ${request.notes || 'None'}`,
            startTime,
            endTime,
            durationMinutes,
            timezone: request.learnerTimezone || 'UTC',
            sessionType: SessionType.ONE_ON_ONE,
            status: SessionStatus.SCHEDULED,
            learnerId: request.userId,
            hostTrainerId,
            ...(batchId ? { batchId } : {}),
            joinUrl,
            hostUrl,
            meetingLink: joinUrl,
            zoomMeetingId,
            capacity: 1,
            isRequired: true,
            minAttendanceMinutes: Math.min(15, durationMinutes),
          },
        });

        // Create SessionBooking
        await tx.sessionBooking.create({
          data: {
            sessionId: session.id,
            userId: request.userId,
            enrolmentId: request.enrolmentId,
            status: BookingStatus.CONFIRMED,
          },
        });

        // Update OneOnOneRequest
        const reqResult = await tx.oneOnOneRequest.update({
          where: { id: requestId },
          data: {
            status: OneOnOneRequestStatus.APPROVED,
            sessionId: session.id,
            decidedById: adminId,
            decidedAt: new Date(),
            decisionReason: dto.notes || 'Approved by instructor',
          },
          include: {
            session: true,
            user: { select: { id: true, name: true, email: true } },
            enrolment: {
              include: {
                program: { select: { id: true, title: true } },
              },
            },
          },
        });

        // Immutable AuditLog
        await tx.auditLog.create({
          data: {
            actorId: adminId,
            action: 'ONE_ON_ONE_APPROVED',
            entity: 'OneOnOneRequest',
            entityId: requestId,
            meta: {
              sessionId: session.id,
              hostTrainerId,
              startTime: startTime.toISOString(),
              endTime: endTime.toISOString(),
            },
          },
        });

        return reqResult;
      },
      { timeout: 30000, maxWait: 15000 },
    );

    // 3. Send confirmation email asynchronously after transaction commits
    this.emailService
      .sendTemplateEmail({
        to: request.user.email,
        subject: `Confirmed: 1-on-1 Coaching Session Scheduled`,
        template: 'SessionReminderEmail',
        props: {
          firstName: request.user.name?.split(' ')[0] || 'Learner',
          sessionTitle,
          timeframe: 'Scheduled',
          date: startTime.toDateString(),
          time: `${startTime.toTimeString().slice(0, 5)} (${request.learnerTimezone || 'UTC'})`,
          joinUrl,
        },
      })
      .catch((emailErr: any) => {
        this.logger.warn(`Could not send 1-on-1 confirmation email: ${emailErr.message}`);
      });

    this.logger.log(`Approved 1-on-1 request ${requestId} with session ${updatedRequest.sessionId}`);
    return updatedRequest;
  }

  /**
   * Admin rejects a 1-on-1 coaching request.
   */
  async rejectRequest(requestId: string, adminId: string, dto: RejectOneOnOneRequestDto, actorUser?: any) {
    const request = await this.prisma.oneOnOneRequest.findUnique({
      where: { id: requestId },
      include: {
        user: true,
        enrolment: {
          include: {
            batch: {
              include: {
                trainers: { select: { trainerId: true } },
              },
            },
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException(`1-on-1 request with ID ${requestId} not found`);
    }

    if (actorUser?.role === Role.MANAGER) {
      const isAssigned =
        request.enrolment?.batch?.managerId === adminId ||
        (Array.isArray(request.enrolment?.batch?.trainers) &&
          request.enrolment.batch.trainers.some(
            (t: any) => t.trainerId === adminId,
          ));
      if (!isAssigned) {
        throw new ForbiddenException(
          'Access denied: You can only reject 1-on-1 requests for your assigned batches',
        );
      }
    }

    if (request.status !== OneOnOneRequestStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Cannot reject request in status ${request.status}. Only PENDING_APPROVAL requests can be rejected.`,
      );
    }

    const updatedRequest = await this.prisma.oneOnOneRequest.update({
      where: { id: requestId },
      data: {
        status: OneOnOneRequestStatus.REJECTED,
        decisionReason: dto.reason,
        decidedById: adminId,
        decidedAt: new Date(),
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        enrolment: {
          include: {
            program: { select: { id: true, title: true } },
          },
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'ONE_ON_ONE_REJECTED',
        entity: 'OneOnOneRequest',
        entityId: requestId,
        meta: {
          reason: dto.reason,
        },
      },
    });

    return updatedRequest;
  }
}
