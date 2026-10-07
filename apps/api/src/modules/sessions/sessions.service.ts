import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  BadGatewayException,
  ServiceUnavailableException,
  Inject,
  Optional,
  Logger,
} from '@nestjs/common';
import { Role, SessionStatus, SessionType, MeetingProvider, BookingStatus, EnrolmentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { isManagerAssignedToBatch } from '../../common/guards/batch-access.guard.js';
import type { IMeetingProvider } from '../../common/interfaces/meeting-provider.interface.js';
import { MEETING_PROVIDER } from '../../common/interfaces/meeting-provider.interface.js';
import type { ICalendarProvider } from '../../common/interfaces/calendar-provider.interface.js';
import { CALENDAR_PROVIDER } from '../../common/interfaces/calendar-provider.interface.js';
import { markDailyAttendance } from '../../common/daily-attendance.js';
import { CreateSessionDto } from './dto/create-session.dto.js';
import { UpdateSessionDto } from './dto/update-session.dto.js';
import { QuerySessionsDto } from './dto/query-sessions.dto.js';
import { getAdvanceNoticeMs, getAdvanceNoticeHours } from '../../config/booking-policy.config.js';

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(MEETING_PROVIDER)
    private readonly meetingProvider?: IMeetingProvider,
    @Optional()
    @Inject(CALENDAR_PROVIDER)
    private readonly calendarProvider?: ICalendarProvider,
  ) {}

  /**
   * Schedules a new 1-on-1 coaching or group cohort session.
   * D1-043: Enforces UTC persistence, trainer double-booking clash prevention,
   * capacity limits, 1-on-1 vs group semantics, and IMeetingProvider Zoom integration.
   */
  async createSession(data: CreateSessionDto, actorUser: any) {
    // 1. Time Range Validation
    const start = new Date(data.startTime);
    const end = new Date(data.endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid start or end time format. Expected ISO-8601 string.');
    }

    if (end.getTime() <= start.getTime()) {
      throw new BadRequestException('Session end time must be strictly after start time.');
    }

    const durationMs = end.getTime() - start.getTime();
    if (durationMs < 5 * 60 * 1000) {
      throw new BadRequestException('Session duration must be at least 5 minutes.');
    }

    if (durationMs > 24 * 60 * 60 * 1000) {
      throw new BadRequestException('Session duration cannot exceed 24 hours.');
    }

    // 2. Batch Verification & Scoping
    const batch = await this.prisma.batch.findUnique({
      where: { id: data.batchId },
      include: {
        program: { select: { id: true, title: true } },
      },
    });

    if (!batch) {
      throw new NotFoundException(`Batch with ID ${data.batchId} not found.`);
    }

    if (batch.status === 'ARCHIVED') {
      throw new BadRequestException('Cannot schedule sessions for an archived batch.');
    }

    // Role-based Manager Batch Scoping
    if (actorUser.role === Role.MANAGER) {
      const isAssigned = await isManagerAssignedToBatch(this.prisma, actorUser.sub, data.batchId);
      if (!isAssigned) {
        throw new ForbiddenException('You are not assigned to manage this batch.');
      }
    }

    // 3. Session Type & Capacity Semantics
    const sessionType = data.sessionType || SessionType.GROUP_COHORT;
    let finalCapacity: number;

    if (sessionType === SessionType.ONE_ON_ONE) {
      if (data.capacity !== undefined && data.capacity !== 1) {
        throw new BadRequestException('1-on-1 sessions must have a capacity of 1.');
      }
      finalCapacity = 1;

      // Validate learner if provided
      if (data.learnerId) {
        const learner = await this.prisma.user.findUnique({
          where: { id: data.learnerId },
          select: { id: true, role: true },
        });
        if (!learner) {
          throw new NotFoundException(`Learner user with ID ${data.learnerId} not found.`);
        }
      }
    } else {
      // Group Cohort
      if (data.learnerId) {
        throw new BadRequestException('Dedicated learnerId cannot be set for a group cohort session.');
      }
      finalCapacity = data.capacity ?? batch.capacity ?? 50;
      if (finalCapacity < 1) {
        throw new BadRequestException('Group session capacity must be at least 1.');
      }
    }

    // 4. Host Trainer Assignment & Role Verification
    let hostTrainerId = data.hostTrainerId;
    if (hostTrainerId) {
      const trainer = await this.prisma.user.findUnique({
        where: { id: hostTrainerId },
        select: { id: true, role: true, name: true, email: true },
      });
      if (!trainer) {
        throw new NotFoundException(`Host trainer with ID ${hostTrainerId} not found.`);
      }
      if (trainer.role === Role.USER) {
        throw new BadRequestException('Host trainer must have an administrative or trainer role (SUPER_ADMIN, ADMIN, or MANAGER).');
      }
    } else {
      // Default host trainer to actor if actor is a trainer/manager/admin
      if ([Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER].includes(actorUser.role)) {
        hostTrainerId = actorUser.sub;
      } else if (batch.managerId) {
        hostTrainerId = batch.managerId;
      }
    }

    // 5. Host Trainer Double-Booking Clash Prevention
    if (hostTrainerId) {
      const trainerClash = await this.prisma.session.findFirst({
        where: {
          hostTrainerId,
          status: { notIn: [SessionStatus.CANCELLED, SessionStatus.RESCHEDULED] },
          startTime: { lt: end },
          endTime: { gt: start },
        },
        select: { id: true, title: true, startTime: true, endTime: true },
      });

      if (trainerClash) {
        throw new ConflictException(
          `Host trainer is already scheduled for session "${trainerClash.title}" from ${trainerClash.startTime.toISOString()} to ${trainerClash.endTime.toISOString()}.`,
        );
      }
    }

    // Learner Double-Booking Clash (for 1:1 sessions)
    if (sessionType === SessionType.ONE_ON_ONE && data.learnerId) {
      const learnerClash = await this.prisma.session.findFirst({
        where: {
          learnerId: data.learnerId,
          status: { notIn: [SessionStatus.CANCELLED, SessionStatus.RESCHEDULED] },
          startTime: { lt: end },
          endTime: { gt: start },
        },
        select: { id: true, title: true },
      });

      if (learnerClash) {
        throw new ConflictException(
          `Learner is already scheduled for session "${learnerClash.title}" during this time window.`,
        );
      }
    }

    // 6. Meeting Provider Integration (Zoom via IMeetingProvider)
    let finalJoinUrl = data.joinUrl;
    let finalHostUrl: string | null = null;
    let finalProviderMeetingId: string | null = null;
    let finalZoomMeetingId: string | null = null;
    const provider = data.meetingProvider || (finalJoinUrl ? MeetingProvider.MANUAL : MeetingProvider.ZOOM);

    if ((!finalJoinUrl || finalJoinUrl.trim() === '') && provider === MeetingProvider.ZOOM) {
      if (!this.meetingProvider) {
        throw new BadRequestException(
          'Meeting provider is not configured. Please supply a manual joinUrl or configure the meeting provider.',
        );
      }

      const durationMin = Math.round((end.getTime() - start.getTime()) / 60000);
      try {
        const meetingDetails = await this.meetingProvider.createMeeting({
          topic: data.title,
          startTime: start,
          durationMinutes: durationMin,
          timezone: data.timezone || 'UTC',
        });

        finalJoinUrl = meetingDetails.joinUrl;
        finalHostUrl = meetingDetails.startUrl || null;
        finalProviderMeetingId = meetingDetails.id;
        finalZoomMeetingId = meetingDetails.id;
      } catch (err: any) {
        this.logger.error(`Zoom meeting creation failed: ${err.message}`);
        throw new BadGatewayException(
          `Meeting provider scheduling failed: ${err.message || 'Unable to create meeting'}`,
        );
      }
    }

    // 7. UTC Persistence in Database
    const session = await this.prisma.session.create({
      data: {
        batchId: data.batchId,
        title: data.title,
        description: data.description || null,
        startTime: start,
        endTime: end,
        timezone: data.timezone || 'UTC',
        sessionType,
        status: SessionStatus.SCHEDULED,
        capacity: finalCapacity,
        hostTrainerId: hostTrainerId || null,
        learnerId: data.learnerId || null,
        meetingProvider: provider,
        providerMeetingId: finalProviderMeetingId,
        zoomMeetingId: finalZoomMeetingId,
        joinUrl: finalJoinUrl || null,
        hostUrl: finalHostUrl,
        recordingUrl: data.recordingUrl || null,
        agenda: data.agenda || null,
        quizId: data.quizId || null,
      },
      include: {
        batch: {
          select: {
            id: true,
            name: true,
            program: { select: { id: true, title: true } },
          },
        },
        hostTrainer: { select: { id: true, name: true, email: true, role: true } },
        learner: { select: { id: true, name: true, email: true } },
      },
    });

    // 8. Audit Logging for sensitive scheduling operations
    await this.recordAudit(actorUser.sub, 'SESSION_CREATED', session.id, {
      batchId: session.batchId,
      sessionType: session.sessionType,
      capacity: session.capacity,
      hostTrainerId: session.hostTrainerId,
      startTime: session.startTime.toISOString(),
      endTime: session.endTime.toISOString(),
    });

    // 9. Queue In-App Reminders
    await this.remindLearners(session.batchId, session.title, session.startTime, session.learnerId);

    return session;
  }

  /**
   * Retrieves sessions according to user role and query filters.
   * Managers are scoped strictly to their assigned batches.
   */
  async getSessions(query: QuerySessionsDto, user: any) {
    const where: any = {};

    if (query.batchId) where.batchId = query.batchId;
    if (query.sessionType) where.sessionType = query.sessionType;
    if (query.trainerId) where.hostTrainerId = query.trainerId;
    if (query.status) where.status = query.status;

    if (query.from || query.to) {
      where.startTime = {};
      if (query.from) where.startTime.gte = new Date(query.from);
      if (query.to) where.startTime.lte = new Date(query.to);
    }

    // Role-based scoping
    if (user.role === Role.MANAGER) {
      const assignedBatches = await this.prisma.batch.findMany({
        where: {
          OR: [
            { managerId: user.sub },
            { trainers: { some: { trainerId: user.sub } } },
          ],
        },
        select: { id: true },
      });
      const assignedIds = assignedBatches.map((b) => b.id);

      if (query.batchId && !assignedIds.includes(query.batchId)) {
        throw new ForbiddenException('You are not assigned to this batch.');
      }

      if (!query.batchId) {
        where.batchId = { in: assignedIds };
      }
    } else if (user.role === Role.USER) {
      // Learners can only view sessions for their enrolled batches or dedicated 1:1s
      const enrolments = await this.prisma.enrolment.findMany({
        where: { userId: user.sub, status: { in: ['ACTIVE', 'COMPLETED'] } },
        select: { batchId: true },
      });
      const enrolledBatchIds = enrolments.map((e) => e.batchId);

      where.OR = [
        { batchId: { in: enrolledBatchIds } },
        { learnerId: user.sub },
      ];
    }

    return this.prisma.session.findMany({
      where,
      orderBy: { startTime: 'asc' },
      include: {
        batch: {
          select: {
            id: true,
            name: true,
            program: { select: { id: true, title: true } },
          },
        },
        hostTrainer: { select: { id: true, name: true, email: true, role: true } },
        learner: { select: { id: true, name: true, email: true } },
        _count: { select: { attendances: true, bookings: true } },
      },
    });
  }

  /**
   * Retrieves a single session by ID with relation details and scoping checks.
   */
  async getSessionById(sessionId: string, user: any) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        batch: {
          select: {
            id: true,
            name: true,
            managerId: true,
            program: { select: { id: true, title: true } },
            trainers: { select: { trainerId: true } },
          },
        },
        hostTrainer: { select: { id: true, name: true, email: true, role: true } },
        learner: { select: { id: true, name: true, email: true } },
        _count: { select: { attendances: true, bookings: true } },
      },
    });

    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found.`);
    }

    if (user.role === Role.MANAGER) {
      const isAssigned =
        session.batch.managerId === user.sub ||
        session.batch.trainers.some((t: any) => t.trainerId === user.sub);
      if (!isAssigned) {
        throw new ForbiddenException('You are not assigned to manage this batch.');
      }
    } else if (user.role === Role.USER) {
      const isLearner = session.learnerId === user.sub;
      if (!isLearner) {
        const enrolment = await this.prisma.enrolment.findUnique({
          where: { userId_batchId: { userId: user.sub, batchId: session.batchId } },
        });
        if (!enrolment || !['ACTIVE', 'COMPLETED'].includes(enrolment.status)) {
          throw new ForbiddenException('You do not have access to this session.');
        }
      }
    }

    return session;
  }

  /**
   * Updates an existing session with validation and meeting rescheduling.
   */
  async updateSession(sessionId: string, data: UpdateSessionDto, actorUser: any) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { batch: true },
    });

    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found.`);
    }

    if (actorUser.role === Role.MANAGER) {
      const isAssigned = await isManagerAssignedToBatch(this.prisma, actorUser.sub, session.batchId);
      if (!isAssigned) {
        throw new ForbiddenException('You are not assigned to manage this batch.');
      }
    }

    const start = data.startTime ? new Date(data.startTime) : session.startTime;
    const end = data.endTime ? new Date(data.endTime) : session.endTime;

    if (end.getTime() <= start.getTime()) {
      throw new BadRequestException('Session end time must be after start time.');
    }

    const hostTrainerId = data.hostTrainerId ?? session.hostTrainerId;

    // Check conflict if time or trainer changed
    if (data.startTime || data.endTime || data.hostTrainerId) {
      if (hostTrainerId) {
        const trainerClash = await this.prisma.session.findFirst({
          where: {
            id: { not: sessionId },
            hostTrainerId,
            status: { notIn: [SessionStatus.CANCELLED, SessionStatus.RESCHEDULED] },
            startTime: { lt: end },
            endTime: { gt: start },
          },
          select: { id: true, title: true },
        });

        if (trainerClash) {
          throw new ConflictException(
            `Host trainer is already booked for session "${trainerClash.title}" during this time window.`,
          );
        }
      }
    }

    // External meeting update if time changed
    if ((data.startTime || data.endTime || data.title) && session.providerMeetingId && this.meetingProvider) {
      try {
        const durationMin = Math.round((end.getTime() - start.getTime()) / 60000);
        await this.meetingProvider.updateMeeting(session.providerMeetingId, {
          topic: data.title || session.title,
          startTime: start,
          durationMinutes: durationMin,
          timezone: data.timezone || session.timezone || 'UTC',
        });
      } catch (err: any) {
        this.logger.warn(`Could not update external meeting: ${err.message}`);
      }
    }

    const updated = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        title: data.title ?? undefined,
        description: data.description ?? undefined,
        startTime: start,
        endTime: end,
        timezone: data.timezone ?? undefined,
        capacity: data.capacity ?? undefined,
        hostTrainerId: data.hostTrainerId ?? undefined,
        learnerId: data.learnerId ?? undefined,
        status: data.status ?? undefined,
        joinUrl: data.joinUrl ?? undefined,
        recordingUrl: data.recordingUrl ?? undefined,
        agenda: data.agenda ?? undefined,
        quizId: data.quizId ?? undefined,
        cancelReason: data.cancelReason ?? undefined,
      },
      include: {
        batch: { select: { id: true, name: true } },
        hostTrainer: { select: { id: true, name: true, email: true } },
      },
    });

    await this.recordAudit(actorUser.sub, 'SESSION_UPDATED', sessionId, {
      startTime: updated.startTime.toISOString(),
      endTime: updated.endTime.toISOString(),
      status: updated.status,
    });

    return updated;
  }

  /**
   * Cancels a session, releasing calendar/meeting commitments.
   */
  async cancelSession(sessionId: string, cancelReason: string | undefined, actorUser: any) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { batch: true },
    });

    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found.`);
    }

    if (actorUser.role === Role.MANAGER) {
      const isAssigned = await isManagerAssignedToBatch(this.prisma, actorUser.sub, session.batchId);
      if (!isAssigned) {
        throw new ForbiddenException('You are not assigned to manage this batch.');
      }
    }

    if (session.providerMeetingId && this.meetingProvider) {
      try {
        await this.meetingProvider.cancelMeeting(session.providerMeetingId);
      } catch (err: any) {
        this.logger.warn(`Could not cancel external meeting: ${err.message}`);
      }
    }

    const cancelled = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        status: SessionStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: cancelReason || 'Cancelled by administrator',
      },
    });

    await this.recordAudit(actorUser.sub, 'SESSION_CANCELLED', sessionId, {
      cancelReason: cancelled.cancelReason,
    });

    return cancelled;
  }

  /**
   * Hard delete a session (for cleanup when no historical attendances exist).
   */
  async deleteSession(sessionId: string, actorUser?: any) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        _count: { select: { attendances: true, bookings: true } },
      },
    });

    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found.`);
    }

    if (session._count.attendances > 0) {
      throw new BadRequestException('Cannot delete a session that has attendance records. Cancel it instead.');
    }

    if (session.providerMeetingId && this.meetingProvider) {
      try {
        await this.meetingProvider.cancelMeeting(session.providerMeetingId);
      } catch (err: any) {
        this.logger.warn(`Could not cancel external meeting: ${err.message}`);
      }
    }

    const res = await this.prisma.session.delete({
      where: { id: sessionId },
    });

    if (actorUser) {
      await this.recordAudit(actorUser.sub, 'SESSION_DELETED', sessionId, { title: session.title });
    }

    return res;
  }

  // Helper: Sessions by batch
  async getSessionsByBatch(batchId: string, limit: number = 100) {
    return this.prisma.session.findMany({
      where: { batchId },
      orderBy: { startTime: 'asc' },
      take: limit,
      include: {
        hostTrainer: { select: { id: true, name: true } },
        learner: { select: { id: true, name: true } },
        attendances: true,
      },
    });
  }

  // Helper: All sessions for admin overview
  async getAllSessions(limit: number = 100) {
    return this.prisma.session.findMany({
      orderBy: { startTime: 'desc' },
      take: limit,
      include: {
        batch: { include: { program: { select: { id: true, title: true } } } },
        hostTrainer: { select: { id: true, name: true, email: true } },
        learner: { select: { id: true, name: true, email: true } },
        _count: { select: { attendances: true, bookings: true } },
      },
    });
  }

  // Learner: their own sessions with attendance (preserved)
  async getMySessions(userId: string) {
    const enrolments = await this.prisma.enrolment.findMany({
      where: { userId, status: { in: ['ACTIVE', 'COMPLETED'] } },
      select: { id: true, batchId: true, batch: { select: { name: true, program: { select: { title: true } } } } },
    });

    const oneOnOnes = await this.prisma.session.findMany({
      where: { learnerId: userId },
      orderBy: { startTime: 'desc' },
    });

    const cohortSessions = enrolments.length > 0
      ? await this.prisma.session.findMany({
          where: { batchId: { in: enrolments.map((e) => e.batchId) }, sessionType: SessionType.GROUP_COHORT },
          orderBy: { startTime: 'desc' },
          include: {
            attendances: { where: { enrolmentId: { in: enrolments.map((e) => e.id) } } },
          },
        })
      : [];

    const mappedCohorts = cohortSessions.map((session) => {
      const enrolment = enrolments.find((e) => e.batchId === session.batchId);
      const attendance = session.attendances[0];
      return {
        id: session.id,
        title: session.title,
        sessionType: session.sessionType,
        startTime: session.startTime,
        endTime: session.endTime,
        recordingUrl: session.recordingUrl,
        joinUrl: session.joinUrl,
        programTitle: enrolment?.batch.program.title ?? '',
        batchName: enrolment?.batch.name ?? '',
        attended: Boolean(attendance),
        joinTime: attendance?.joinTime ?? null,
        durationMin: attendance?.durationMin ?? null,
      };
    });

    const mappedOneOnOnes = oneOnOnes.map((s) => ({
      id: s.id,
      title: s.title,
      sessionType: s.sessionType,
      startTime: s.startTime,
      endTime: s.endTime,
      recordingUrl: s.recordingUrl,
      joinUrl: s.joinUrl,
      programTitle: '1:1 Coaching',
      batchName: 'Individual',
      attended: false,
      joinTime: null,
      durationMin: null,
    }));

    return [...mappedOneOnOnes, ...mappedCohorts].sort(
      (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
    );
  }

  // Attendance methods (preserved for D1-048)
  async markAttendance(sessionId: string, userId: string, isAdminOverride: boolean = false) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { batch: true },
    });

    if (!session) throw new NotFoundException('Session not found');

    if (!isAdminOverride) {
      const now = new Date();
      const windowStart = new Date(session.startTime.getTime() - 5 * 60000);
      const windowEnd = session.endTime;

      if (now < windowStart) {
        throw new BadRequestException('Attendance window has not opened yet.');
      }
      if (now > windowEnd) {
        throw new BadRequestException('Attendance window has closed.');
      }
    }

    const enrolment = await this.prisma.enrolment.findUnique({
      where: { userId_batchId: { userId, batchId: session.batchId } },
    });

    if (!enrolment) {
      throw new BadRequestException('User is not enrolled in this batch.');
    }

    if (!isAdminOverride) await markDailyAttendance(this.prisma, userId, 'sessionJoined');

    return this.prisma.attendance.upsert({
      where: {
        sessionId_enrolmentId: {
          sessionId,
          enrolmentId: enrolment.id,
        },
      },
      update: {
        joinTime: new Date(),
      },
      create: {
        sessionId,
        enrolmentId: enrolment.id,
        joinTime: new Date(),
      },
    });
  }

  async getAttendanceForSession(sessionId: string, user: any) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { batch: true },
    });

    if (!session) throw new NotFoundException('Session not found');

    if (user.role === Role.MANAGER && session.batch.managerId !== user.sub) {
      throw new ForbiddenException('You can only view attendance for your own batches');
    }

    return this.prisma.attendance.findMany({
      where: { sessionId },
      include: {
        enrolment: {
          include: { user: true },
        },
      },
    });
  }

  // Private helper: audit log recording
  private async recordAudit(actorId: string, action: string, entityId: string, meta?: any) {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          action,
          entity: 'Session',
          entityId,
          meta: meta || {},
        },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to write session audit log: ${err.message}`);
    }
  }

  // Private helper: in-app notifications
  private async remindLearners(batchId: string, title: string, startTime: Date, dedicatedLearnerId?: string | null) {
    try {
      let targetUserIds: string[] = [];

      if (dedicatedLearnerId) {
        targetUserIds = [dedicatedLearnerId];
      } else {
        const enrolments = await this.prisma.enrolment.findMany({
          where: { batchId, status: { in: ['ACTIVE', 'COMPLETED'] } },
          select: { userId: true },
        });
        targetUserIds = enrolments.map((e) => e.userId);
      }

      if (targetUserIds.length === 0) return;

      await this.prisma.notification.createMany({
        data: targetUserIds.map((userId) => ({
          userId,
          type: 'SESSION_REMINDER',
          template: `Live session scheduled: ${title}`,
          channel: 'IN_APP' as const,
          schedule: startTime,
        })),
      });
    } catch (err: any) {
      this.logger.warn(`Failed to queue session reminders: ${err.message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // D1-044: LEARNER BOOKING ENGINE
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Books a learner into a session.
   *
   * Booking transaction order (per D1-044 spec):
   * 1. Validate session existence and status.
   * 2. Validate enrolment eligibility and batch membership.
   * 3. Validate advance notice window.
   * 4. Validate capacity and duplicate booking (under transaction lock).
   * 5. Query Outlook busy slots via ICalendarProvider.
   * 6. Confirm booking atomically with pg_advisory_xact_lock.
   *
   * Security:
   * - learnerId is ALWAYS derived from the authenticated JWT (req.user.sub).
   * - No client-supplied userId/batchId/enrolmentId is trusted.
   * - IDOR is prevented by verifying the enrolment belongs to the
   *   authenticated user and matches the session's batch.
   */
  async bookSession(sessionId: string, learnerId: string) {
    // ── Step 1: Load session ──────────────────────────────────────────────────
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        title: true,
        batchId: true,
        learnerId: true,
        hostTrainerId: true,
        startTime: true,
        endTime: true,
        status: true,
        sessionType: true,
        capacity: true,
        joinUrl: true,
        hostTrainer: { select: { id: true, name: true, email: true } },
      },
    });

    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found.`);
    }

    // ── Step 2a: Session status gate ─────────────────────────────────────────
    if (
      session.status === SessionStatus.CANCELLED ||
      session.status === SessionStatus.RESCHEDULED
    ) {
      throw new BadRequestException(
        `Session is ${session.status.toLowerCase()} and cannot be booked.`,
      );
    }

    if (session.status === SessionStatus.COMPLETED) {
      throw new BadRequestException('Session has already completed and cannot be booked.');
    }

    // ── Step 2b: Enrolment eligibility & batch membership ────────────────────
    // For 1:1 sessions the session has a dedicated learnerId; for group cohorts
    // we verify the learner has an ACTIVE enrolment in the session's batch.
    let enrolmentId: string | null = null;

    if (session.sessionType === SessionType.ONE_ON_ONE) {
      // 1:1 sessions: only the designated learner may book.
      if (session.learnerId && session.learnerId !== learnerId) {
        throw new ForbiddenException(
          'This 1-on-1 session is dedicated to a different learner.',
        );
      }
      // Resolve enrolment for the batch (used for downstream reconciliation).
      const enrolment = await this.prisma.enrolment.findUnique({
        where: { userId_batchId: { userId: learnerId, batchId: session.batchId } },
        select: { id: true, status: true },
      });
      if (enrolment && enrolment.status === EnrolmentStatus.ACTIVE) {
        enrolmentId = enrolment.id;
      }
      
      // If it's an open 1:1 session (no dedicated learnerId), enforce batch enrolment
      if (!session.learnerId && !enrolmentId) {
        throw new ForbiddenException(
          'You must have an ACTIVE enrolment in the batch to book this open 1-on-1 session.',
        );
      }
      // Dedicated 1:1 sessions may exist for a learner without a batch enrolment (e.g. closing call),
      // so we do not hard-reject when the enrolment is absent as long as the learnerId matches.
    } else {
      // Group cohort: learner must have an ACTIVE enrolment in this batch.
      const enrolment = await this.prisma.enrolment.findUnique({
        where: { userId_batchId: { userId: learnerId, batchId: session.batchId } },
        select: { id: true, status: true },
      });

      if (!enrolment) {
        throw new ForbiddenException(
          'You are not enrolled in the batch associated with this session.',
        );
      }

      // Reject revoked, cancelled, waitlisted, and other ineligible statuses.
      if (enrolment.status !== EnrolmentStatus.ACTIVE) {
        throw new ForbiddenException(
          `Your enrolment status is ${enrolment.status}. Only ACTIVE enrolments may book sessions.`,
        );
      }

      enrolmentId = enrolment.id;
    }

    // ── Step 3: Advance booking notice (UTC) ─────────────────────────────────
    const nowUtc = new Date();
    const advanceNoticeMs = getAdvanceNoticeMs();
    const sessionStartMs = session.startTime.getTime();

    if (sessionStartMs - nowUtc.getTime() < advanceNoticeMs) {
      const hours = getAdvanceNoticeHours();
      throw new BadRequestException(
        `Bookings must be made at least ${hours} hour${hours !== 1 ? 's' : ''} before the session starts. ` +
          `Session starts at ${session.startTime.toISOString()} UTC.`,
      );
    }

    // ── Step 5: Outlook clash check (before transaction for early-exit) ───────
    // Resolve host/trainer email.  The client requirement specifies checking
    // Roweena's Outlook calendar; within the architecture Roweena is the
    // hostTrainer on the session.
    if (this.calendarProvider) {
      const trainerEmail = session.hostTrainer?.email;
      if (!trainerEmail) {
        // No host trainer email available — treat as a provider-unavailable
        // scenario: fail closed to prevent silent confirmation without clash check.
        throw new ServiceUnavailableException(
          'Session host trainer email is not configured. Cannot verify calendar availability.',
        );
      }

      let busySlots: Array<{ startTime: Date; endTime: Date }>;
      try {
        busySlots = await this.calendarProvider.getBusySlots(
          trainerEmail,
          session.startTime,
          session.endTime,
        );
      } catch (err: any) {
        this.logger.error(
          `Calendar provider failed for session ${sessionId}: ${err.message}`,
        );
        // Fail closed: if the calendar check is required and the provider
        // fails we must NOT silently confirm the booking.
        throw new ServiceUnavailableException(
          'Calendar availability check failed. Please try again shortly.',
        );
      }

      // A clash exists if any busy slot overlaps the [startTime, endTime) window.
      const hasClash = busySlots.some(
        (slot) =>
          slot.startTime.getTime() < session.endTime.getTime() &&
          slot.endTime.getTime() > session.startTime.getTime(),
      );

      if (hasClash) {
        throw new ConflictException(
          'The trainer is unavailable during this session time (calendar clash). ' +
            'Please contact support to reschedule.',
        );
      }
    }

    // ── Step 4 & 6: Capacity check + duplicate guard + atomic booking ─────────
    // Use a pg advisory lock keyed on the session ID to serialise concurrent
    // bookings and prevent race-condition over-capacity.
    const booking = await this.prisma.$transaction(async (tx) => {
      // Pessimistic advisory lock per session to serialize concurrent seat claims.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${sessionId}))`;

      // Duplicate booking guard (idempotent: return existing active booking).
      const existing = await tx.sessionBooking.findUnique({
        where: { sessionId_userId: { sessionId, userId: learnerId } },
        select: { id: true, status: true },
      });

      if (existing) {
        if (
          existing.status === BookingStatus.BOOKED ||
          existing.status === BookingStatus.CONFIRMED ||
          existing.status === BookingStatus.ATTENDED
        ) {
          throw new ConflictException('You have already booked this session.');
        }
        // A previously cancelled/rescheduled booking can be re-booked — fall
        // through to capacity check and then create a new booking below.
      }

      // Capacity enforcement: count active bookings under the lock.
      if (session.capacity !== null && session.capacity !== undefined) {
        const activeBookings = await tx.sessionBooking.count({
          where: {
            sessionId,
            status: {
              in: [
                BookingStatus.BOOKED,
                BookingStatus.CONFIRMED,
                BookingStatus.ATTENDED,
              ],
            },
          },
        });

        if (activeBookings >= session.capacity) {
          throw new ConflictException(
            'Session is fully booked. No seats are available.',
          );
        }
      }

      let created;
      if (existing) {
        created = await tx.sessionBooking.update({
          where: { sessionId_userId: { sessionId, userId: learnerId } },
          data: {
            enrolmentId: enrolmentId ?? undefined,
            status: BookingStatus.BOOKED,
          },
          include: {
            session: {
              select: {
                id: true,
                title: true,
                startTime: true,
                endTime: true,
                joinUrl: true,
                hostTrainer: { select: { id: true, name: true, email: true } },
              },
            },
            user: { select: { id: true, name: true, email: true } },
          },
        });
      } else {
        // Create the booking record.
        created = await tx.sessionBooking.create({
          data: {
            sessionId,
            userId: learnerId,
            enrolmentId: enrolmentId ?? undefined,
            status: BookingStatus.BOOKED,
          },
          include: {
            session: {
              select: {
                id: true,
                title: true,
                startTime: true,
                endTime: true,
                joinUrl: true,
                hostTrainer: { select: { id: true, name: true, email: true } },
              },
            },
            user: { select: { id: true, name: true, email: true } },
          },
        });
      }

      return created;
    });

    // ── Post-booking side-effects ─────────────────────────────────────────────
    // Audit log.
    await this.recordAudit(learnerId, 'SESSION_BOOKED', sessionId, {
      bookingId: booking.id,
      sessionType: session.sessionType,
      batchId: session.batchId,
      enrolmentId,
      startTime: session.startTime.toISOString(),
    });

    // Booking confirmation notification (non-fatal).
    try {
      await this.prisma.notification.create({
        data: {
          userId: learnerId,
          type: 'SESSION_BOOKING_CONFIRMED',
          template: `Your booking for "${session.title}"${session.hostTrainer ? ` with ${session.hostTrainer.name}` : ''} is confirmed.`,
          channel: 'IN_APP',
        },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to create booking notification: ${err.message}`);
    }

    return booking;
  }

  /**
   * Returns all active bookings for the authenticated learner, with session details.
   */
  async getMyBookings(learnerId: string) {
    return this.prisma.sessionBooking.findMany({
      where: {
        userId: learnerId,
        status: {
          in: [BookingStatus.BOOKED, BookingStatus.CONFIRMED, BookingStatus.ATTENDED],
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        session: {
          select: {
            id: true,
            title: true,
            startTime: true,
            endTime: true,
            status: true,
            sessionType: true,
            joinUrl: true,
            hostTrainer: { select: { id: true, name: true, email: true } },
            batch: { select: { id: true, name: true } },
          },
        },
      },
    });
  }
}
