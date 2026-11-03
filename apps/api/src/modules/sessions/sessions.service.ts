import { getAppUrls } from '../../common/config/app-urls.js';
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
  forwardRef,
} from '@nestjs/common';
import { Role, SessionStatus, SessionType, MeetingProvider, BookingStatus, EnrolmentStatus, OutboxEvent, AttendanceStatus, AttendanceSource } from '@prisma/client';
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
import { RecordSessionProgressDto } from './dto/record-session-progress.dto.js';
import { AttendanceComplianceService } from './attendance-compliance.service.js';
import { StageGateService } from '../progression/stage-gate.service.js';
import { WatchIntervalTracker } from '../progression/utils/watch-interval-tracker.js';
import {
  getAdvanceNoticeMs,
  getAdvanceNoticeHours,
  getCancellationCutoffMs,
  getCancellationCutoffHours,
} from '../../config/booking-policy.config.js';
import {
  enrichSessionWithTimezone,
  resolveTimezone,
} from '../../common/timezone/timezone.util.js';
import { AttendanceService } from './attendance.service.js';

import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EmailService } from '../email/email.service.js';

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceService: AttendanceService,
    @Optional()
    @Inject(MEETING_PROVIDER)
    private readonly meetingProvider?: IMeetingProvider,
    @Optional()
    @Inject(CALENDAR_PROVIDER)
    private readonly calendarProvider?: ICalendarProvider,
    @Optional()
    @InjectQueue('meeting-sync')
    private readonly meetingSyncQueue?: Queue,
    @Optional()
    private readonly emailService?: EmailService,
    @Optional()
    @Inject(forwardRef(() => AttendanceComplianceService))
    private readonly attendanceComplianceService?: AttendanceComplianceService,
    @Optional()
    @Inject(forwardRef(() => StageGateService))
    private readonly stageGateService?: StageGateService,
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

    // Role-based Manager/Teacher Batch Scoping
    if ((actorUser.role === Role.MANAGER || actorUser.role === 'MANAGER' || actorUser.role === 'TEACHER') || actorUser.role === 'TEACHER') {
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
    let hostTrainerEmail: string | undefined = actorUser?.email;
    if (hostTrainerId) {
      const trainer = await this.prisma.user.findUnique({
        where: { id: hostTrainerId },
        select: { id: true, role: true, name: true, email: true },
      });
      if (!trainer) {
        throw new NotFoundException(`Host trainer with ID ${hostTrainerId} not found.`);
      }
      if (trainer.role === Role.USER) {
        throw new BadRequestException('Host trainer must have an administrative or trainer role (SUPER_ADMIN, ADMIN, MANAGER, or TEACHER).');
      }
      hostTrainerEmail = trainer.email;
    } else {
      // Default host trainer to actor if actor is a trainer/manager/admin
      if ([Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER, Role.TEACHER].includes(actorUser.role)) {
        hostTrainerId = actorUser.sub;
      } else if (batch.managerId) {
        hostTrainerId = batch.managerId;
      }
      if (hostTrainerId) {
        const resolvedTrainer = await this.prisma.user.findUnique({
          where: { id: hostTrainerId },
          select: { email: true },
        });
        if (resolvedTrainer?.email) {
          hostTrainerEmail = resolvedTrainer.email;
        }
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

      // Outlook free/busy check for trainer
      if (this.calendarProvider) {
        const trainerUser = await this.prisma.user.findUnique({
          where: { id: hostTrainerId },
          select: { email: true },
        });
        if (trainerUser?.email) {
          try {
            const busySlots = await this.calendarProvider.getBusySlots(trainerUser.email, start, end);
            const hasClash = busySlots.some(
              (slot) => slot.startTime.getTime() < end.getTime() && slot.endTime.getTime() > start.getTime(),
            );
            if (hasClash) {
              throw new ConflictException(
                'The host trainer has an existing Outlook calendar clash during this time window.',
              );
            }
          } catch (err: any) {
            if (err instanceof ConflictException) throw err;
            this.logger.warn(`Calendar busy check failed on session creation: ${err.message}`);
          }
        }
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

    // 6. Meeting Provider Setup: Synchronous Zoom creation with resilient Outbox fallback
    let finalJoinUrl = data.joinUrl;
    let finalHostUrl: string | null = null;
    let finalProviderMeetingId: string | null = null;
    let finalZoomMeetingId: string | null = null;
    const provider = data.meetingProvider || (finalJoinUrl ? MeetingProvider.MANUAL : MeetingProvider.ZOOM);

    if ((!finalJoinUrl || finalJoinUrl.trim() === '') && provider === MeetingProvider.ZOOM) {
      if (this.meetingProvider) {
        try {
          const durationMin = Math.max(5, Math.round((end.getTime() - start.getTime()) / 60000));
          const zoomMeeting = await this.meetingProvider.createMeeting({
            topic: data.title,
            startTime: start,
            durationMinutes: durationMin,
            timezone: data.timezone || 'UTC',
            hostEmail: hostTrainerEmail,
          });
          if (zoomMeeting?.joinUrl) {
            finalJoinUrl = zoomMeeting.joinUrl;
            finalHostUrl = zoomMeeting.startUrl || null;
            finalProviderMeetingId = zoomMeeting.id;
            finalZoomMeetingId = zoomMeeting.id;
            this.logger.log(`Zoom meeting created synchronously: ID=${zoomMeeting.id}, URL=${zoomMeeting.joinUrl}`);
          }
        } catch (zoomErr: any) {
          this.logger.warn(`Immediate Zoom meeting creation failed: ${zoomErr.message}. Outbox will queue for background retry.`, zoomErr.stack);
        }
      } else if (!this.meetingSyncQueue) {
        throw new BadRequestException(
          'Meeting provider or sync queue is not configured. Please supply a manual joinUrl or configure the meeting provider.',
        );
      }
    }

    // 7. UTC Persistence in Database with Transactional Outbox
    let syncOutboxEvent: OutboxEvent | null = null;
    
    const session = await this.prisma.$transaction(async (tx) => {
      const createdSession = await tx.session.create({
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
          minAttendanceMinutes: (data as any).minAttendanceMinutes ?? null,
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

      await tx.auditLog.create({
        data: {
          actorId: actorUser.sub,
          action: 'SESSION_CREATED',
          entity: 'Session',
          entityId: createdSession.id,
          meta: {
            batchId: createdSession.batchId,
            sessionType: createdSession.sessionType,
            capacity: createdSession.capacity,
            hostTrainerId: createdSession.hostTrainerId,
            startTime: createdSession.startTime.toISOString(),
            endTime: createdSession.endTime.toISOString(),
            joinUrl: finalJoinUrl,
          },
        },
      });

      if (provider === MeetingProvider.ZOOM) {
        syncOutboxEvent = await tx.outboxEvent.create({
          data: {
            type: 'sync-meeting',
            action: 'CREATE',
            payload: { sessionId: createdSession.id, joinUrl: finalJoinUrl, hostUrl: finalHostUrl },
            status: finalJoinUrl ? 'COMPLETED' : 'PENDING',
            providerId: finalZoomMeetingId,
          }
        });
      }

      return createdSession;
    });

    // 8. Queue Zoom Meeting Creation fallback if not already generated synchronously
    const outboxToQueue = syncOutboxEvent as OutboxEvent | null;
    if (outboxToQueue && !session.joinUrl && this.meetingSyncQueue) {
      try {
        await this.meetingSyncQueue.add('sync-meeting', {
          outboxId: outboxToQueue.id,
          type: 'CREATE',
          sessionId: session.id,
        });
      } catch (err: any) {
        this.logger.error(`Failed to enqueue meeting sync for session ${session.id}: ${err.message}`);
      }
    }

    // 9. Dispatch Email Notifications & In-App Reminders to Enrolled Learners
    await this.notifyEnrolledLearnersOfSession(session, batch);

    // 10. Synchronize calendar event with Microsoft Graph / Outlook
    if (this.calendarProvider) {
      try {
        const attendeeEmails: string[] = [];
        if (session.learner?.email) {
          attendeeEmails.push(session.learner.email);
        }
        await this.calendarProvider.createEvent({
          sessionId: session.id,
          subject: session.title,
          body: `<p>${session.description || session.title}</p>${session.joinUrl ? `<p>Join Link: <a href="${session.joinUrl}">${session.joinUrl}</a></p>` : ''}`,
          startTime: session.startTime,
          endTime: session.endTime,
          timezone: session.timezone || 'UTC',
          location: session.joinUrl ? `Online (${session.meetingProvider})` : 'Online',
          attendees: attendeeEmails,
          organizerEmail: session.hostTrainer?.email,
        });
      } catch (calErr: any) {
        this.logger.warn(`Failed to create calendar event for session ${session.id}: ${calErr.message}`);
      }
    }

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
    if ((user.role === Role.MANAGER || user.role === 'MANAGER' || user.role === 'TEACHER')) {
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

    const sessions = await this.prisma.session.findMany({
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

    // Security Gate: Learners must NEVER receive the Zoom hostUrl
    if (user && (user.role === Role.USER || user.role === 'USER')) {
      return sessions.map((s: any) => ({ ...s, hostUrl: null }));
    }

    return sessions;
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

    if ((user.role === Role.MANAGER || user.role === 'MANAGER' || user.role === 'TEACHER')) {
      if (session.batch) {
        const isAssigned =
          session.batch.managerId === user.sub ||
          session.batch.trainers.some((t: any) => t.trainerId === user.sub);
        if (!isAssigned) {
          throw new ForbiddenException('You are not assigned to manage this batch.');
        }
      } else if (session.hostTrainerId && session.hostTrainerId !== user.sub) {
        throw new ForbiddenException('You are not assigned to manage this session.');
      }
    } else if (user.role === Role.USER) {
      const isLearner = session.learnerId === user.sub || session.userId === user.sub;
      if (!isLearner) {
        if (!session.batchId) {
          throw new ForbiddenException('You do not have access to this session.');
        }
        const enrolment = await this.prisma.enrolment.findUnique({
          where: { userId_batchId: { userId: user.sub, batchId: session.batchId } },
        });
        if (!enrolment || !['ACTIVE', 'COMPLETED'].includes(enrolment.status)) {
          throw new ForbiddenException('You do not have access to this session.');
        }
      }
    }

    // Security Gate: Learners must NEVER receive the Zoom hostUrl
    if (user && (user.role === Role.USER || user.role === 'USER')) {
      return { ...session, hostUrl: null };
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

    if ((actorUser.role === Role.MANAGER || actorUser.role === 'MANAGER' || actorUser.role === 'TEACHER')) {
      const isAssigned = session.batchId
        ? await isManagerAssignedToBatch(this.prisma, actorUser.sub, session.batchId)
        : session.hostTrainerId === actorUser.sub;
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

        // Outlook free/busy check for trainer
        if (this.calendarProvider) {
          const trainerUser = await this.prisma.user.findUnique({
            where: { id: hostTrainerId },
            select: { email: true },
          });
          if (trainerUser?.email) {
            try {
              const busySlots = await this.calendarProvider.getBusySlots(trainerUser.email, start, end);
              const hasClash = busySlots.some(
                (slot) => slot.startTime.getTime() < end.getTime() && slot.endTime.getTime() > start.getTime(),
              );
              if (hasClash) {
                throw new ConflictException(
                  'The host trainer has an existing Outlook calendar clash during this time window.',
                );
              }
            } catch (err: any) {
              if (err instanceof ConflictException) throw err;
              this.logger.warn(`Calendar busy check failed on session update: ${err.message}`);
            }
          }
        }
      }
    }

    let syncOutboxEvent: OutboxEvent | null = null;

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedSession = await tx.session.update({
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
          minAttendanceMinutes: (data as any).minAttendanceMinutes !== undefined ? (data as any).minAttendanceMinutes : undefined,
          agenda: data.agenda ?? undefined,
          quizId: data.quizId ?? undefined,
          cancelReason: data.cancelReason ?? undefined,
        },
        include: {
          batch: { select: { id: true, name: true } },
          hostTrainer: { select: { id: true, name: true, email: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actorUser.sub,
          action: 'SESSION_UPDATED',
          entity: 'Session',
          entityId: sessionId,
          meta: {
            startTime: updatedSession.startTime.toISOString(),
            endTime: updatedSession.endTime.toISOString(),
            status: updatedSession.status,
          },
        },
      });

      // When a session is marked COMPLETED, update bookings and learner progression
      if (data.status === SessionStatus.COMPLETED || data.status === ('COMPLETED' as any)) {
        await tx.sessionBooking.updateMany({
          where: { sessionId },
          data: { status: BookingStatus.ATTENDED },
        });

        const isOneOnOne =
          session.sessionType === SessionType.ONE_ON_ONE ||
          session.sessionType === SessionType.ONE_ON_ONE_WITH_RO ||
          Boolean(session.learnerId);

        if (isOneOnOne) {
          const oneOnOneReq = await tx.oneOnOneRequest.findFirst({
            where: { sessionId },
            select: { id: true, enrolmentId: true, userId: true },
          });

          const targetLearnerId = session.learnerId || oneOnOneReq?.userId;
          const targetEnrolmentId = oneOnOneReq?.enrolmentId;

          if (targetEnrolmentId) {
            await tx.enrolment.update({
              where: { id: targetEnrolmentId },
              data: {
                oneOnOneCompletedAt: new Date(),
                oneOnOneStatus: 'COMPLETED' as any,
              },
            });
          } else if (targetLearnerId) {
            const matchingEnrolment = await tx.enrolment.findFirst({
              where: {
                userId: targetLearnerId,
                ...(session.batchId ? { batchId: session.batchId } : {}),
              },
              orderBy: { createdAt: 'desc' },
              select: { id: true },
            });
            if (matchingEnrolment) {
              await tx.enrolment.update({
                where: { id: matchingEnrolment.id },
                data: {
                  oneOnOneCompletedAt: new Date(),
                  oneOnOneStatus: 'COMPLETED' as any,
                },
              });
            }
          }

          if (targetLearnerId && tx.notification?.create) {
            try {
              await tx.notification.create({
                data: {
                  userId: targetLearnerId,
                  type: 'ONE_ON_ONE_COMPLETED',
                  template: 'Your 1-on-1 Coaching Session has been marked completed! Stage 5 (Mission Statement) is now unlocked.',
                  channel: 'IN_APP',
                },
              });
            } catch (notifErr: any) {
              // non-blocking
            }
          }
        }
      }

      // External meeting update if time changed
      if ((data.startTime || data.endTime || data.title) && session.providerMeetingId && this.meetingSyncQueue) {
        const durationMin = Math.round((end.getTime() - start.getTime()) / 60000);
        syncOutboxEvent = await tx.outboxEvent.create({
          data: {
            type: 'sync-meeting',
            action: 'UPDATE',
            payload: {
              sessionId: session.id,
              payload: {
                topic: updatedSession.title,
                startTime: updatedSession.startTime,
                durationMinutes: durationMin,
                timezone: updatedSession.timezone || 'UTC',
              }
            }
          }
        });
      }
      return updatedSession;
    }, { timeout: 15000, maxWait: 10000 });

    const outboxToQueue = syncOutboxEvent as OutboxEvent | null;
    if (outboxToQueue && this.meetingSyncQueue) {
      try {
        await this.meetingSyncQueue.add('sync-meeting', {
          outboxId: outboxToQueue.id,
          type: outboxToQueue.action,
          ...(outboxToQueue.payload as any),
        });
      } catch (err: any) {
        this.logger.error(`Failed to enqueue meeting sync update for session ${sessionId}: ${err.message}`);
      }
    }

    if (this.calendarProvider && typeof this.calendarProvider.updateEvent === 'function') {
      try {
        await this.calendarProvider.updateEvent(sessionId, {
          subject: updated.title,
          body: `<p>${updated.description || updated.title}</p>${updated.joinUrl ? `<p>Join Link: <a href="${updated.joinUrl}">${updated.joinUrl}</a></p>` : ''}`,
          startTime: updated.startTime,
          endTime: updated.endTime,
          timezone: updated.timezone || 'UTC',
          location: updated.joinUrl ? `Online (${updated.meetingProvider})` : 'Online',
          organizerEmail: updated.hostTrainer?.email,
        });
      } catch (calErr: any) {
        this.logger.warn(`Failed to update calendar event for session ${sessionId}: ${calErr.message}`);
      }
    }

    if (data.startTime && this.prisma.notification?.deleteMany) {
      try {
        await this.prisma.notification.deleteMany({
          where: {
            type: { in: [`SESSION_REMINDER_24H:${sessionId}`, `SESSION_REMINDER_1H:${sessionId}`] },
          },
        });
      } catch (notifErr: any) {
        this.logger.warn(`Could not clear past reminders for rescheduled session ${sessionId}: ${notifErr.message}`);
      }
    }

    return updated;
  }

  /**
   * Cancels a session, releasing calendar/meeting commitments.
   */
  async cancelSession(sessionId: string, cancelReason: string | undefined, actorUser: any) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { batch: true, hostTrainer: true },
    });

    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found.`);
    }

    if ((actorUser.role === Role.MANAGER || actorUser.role === 'MANAGER' || actorUser.role === 'TEACHER')) {
      const isAssigned = session.batchId
        ? await isManagerAssignedToBatch(this.prisma, actorUser.sub, session.batchId)
        : session.hostTrainerId === actorUser.sub;
      if (!isAssigned) {
        throw new ForbiddenException('You are not assigned to manage this batch.');
      }
    }

    let syncOutboxEvent: OutboxEvent | null = null;

    const cancelled = await this.prisma.$transaction(async (tx) => {
      const updatedSession = await tx.session.update({
        where: { id: sessionId },
        data: {
          status: SessionStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelReason: cancelReason || 'Cancelled by administrator',
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actorUser.sub,
          action: 'SESSION_CANCELLED',
          entity: 'Session',
          entityId: sessionId,
          meta: {
            cancelReason: updatedSession.cancelReason,
          },
        },
      });

      if (session.providerMeetingId && this.meetingSyncQueue) {
        syncOutboxEvent = await tx.outboxEvent.create({
          data: {
            type: 'sync-meeting',
            action: 'CANCEL',
            payload: {
              providerMeetingId: session.providerMeetingId,
            }
          }
        });
      }

      return updatedSession;
    }, { timeout: 15000, maxWait: 10000 });

    const outboxToQueue = syncOutboxEvent as OutboxEvent | null;
    if (outboxToQueue && this.meetingSyncQueue) {
      try {
        await this.meetingSyncQueue.add('sync-meeting', {
          outboxId: outboxToQueue.id,
          type: outboxToQueue.action,
          ...(outboxToQueue.payload as any),
        });
      } catch (err: any) {
        this.logger.error(`Failed to enqueue meeting sync cancel for session ${sessionId}: ${err.message}`);
      }
    }

    if (this.calendarProvider) {
      try {
        await this.calendarProvider.deleteEvent(sessionId, session.hostTrainer?.email);
      } catch (calErr: any) {
        this.logger.warn(`Failed to delete calendar event for cancelled session ${sessionId}: ${calErr.message}`);
      }
    }

    if (this.prisma.notification?.deleteMany) {
      try {
        await this.prisma.notification.deleteMany({
          where: {
            type: { in: [`SESSION_REMINDER_24H:${sessionId}`, `SESSION_REMINDER_1H:${sessionId}`] },
          },
        });
      } catch (notifErr: any) {
        this.logger.warn(`Could not clear past reminders for cancelled session ${sessionId}: ${notifErr.message}`);
      }
    }

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
        hostTrainer: true,
      },
    });

    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found.`);
    }

    if (session._count.attendances > 0) {
      throw new BadRequestException('Cannot delete a session that has attendance records. Cancel it instead.');
    }

    let syncOutboxEvent: OutboxEvent | null = null;

    const res = await this.prisma.$transaction(async (tx) => {
      const deletedSession = await tx.session.delete({
        where: { id: sessionId },
      });

      if (actorUser) {
        await tx.auditLog.create({
          data: {
            actorId: actorUser.sub,
            action: 'SESSION_DELETED',
            entity: 'Session',
            entityId: sessionId,
            meta: { title: session.title },
          }
        });
      }

      if (session.providerMeetingId && this.meetingSyncQueue) {
        syncOutboxEvent = await tx.outboxEvent.create({
          data: {
            type: 'sync-meeting',
            action: 'CANCEL',
            payload: {
              providerMeetingId: session.providerMeetingId,
            }
          }
        });
      }

      return deletedSession;
    });

    const outboxToQueue = syncOutboxEvent as OutboxEvent | null;
    if (outboxToQueue && this.meetingSyncQueue) {
      try {
        await this.meetingSyncQueue.add('sync-meeting', {
          outboxId: outboxToQueue.id,
          type: outboxToQueue.action,
          ...(outboxToQueue.payload as any),
        });
      } catch (err: any) {
        this.logger.error(`Failed to enqueue meeting sync cancel for session ${sessionId}: ${err.message}`);
      }
    }

    if (this.calendarProvider) {
      try {
        await this.calendarProvider.deleteEvent(sessionId, session.hostTrainer?.email);
      } catch (calErr: any) {
        this.logger.warn(`Failed to delete calendar event for deleted session ${sessionId}: ${calErr.message}`);
      }
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
        attendances: {
          select: {
            id: true,
            sessionId: true,
            userId: true,
            enrolmentId: true,
            status: true,
            joinTime: true,
            leaveTime: true,
            durationMin: true,
            minutesPresent: true,
          },
        },
      },
    });
  }

  // Helper: All sessions for admin overview
  async getAllSessions(limit: number = 100) {
    return this.prisma.session.findMany({
      orderBy: { startTime: 'desc' },
      take: limit,
      include: {
        batch: {
          select: {
            id: true,
            name: true,
            program: { select: { id: true, title: true } },
          },
        },
        hostTrainer: { select: { id: true, name: true, email: true } },
        learner: { select: { id: true, name: true, email: true } },
        _count: { select: { attendances: true, bookings: true } },
      },
    });
  }

  // Learner: their own sessions with attendance (preserved)
  async getMySessions(userId: string, viewerTimezone?: string | null) {
    // Parallelize independent enrolment and 1:1 session queries in a single round trip
    const [enrolments, oneOnOnes] = await Promise.all([
      this.prisma.enrolment.findMany({
        where: { 
          userId, 
          status: { in: ['ACTIVE', 'COMPLETED'] },
          batch: { status: { not: 'ARCHIVED' } },
        },
        select: { id: true, batchId: true, batch: { select: { name: true, program: { select: { title: true } } } } },
      }),
      this.prisma.session.findMany({
        where: { learnerId: userId },
        include: { hostTrainer: { select: { id: true, name: true, email: true } } },
        orderBy: { startTime: 'desc' },
      }),
    ]);

    const cohortSessions = enrolments.length > 0
      ? await this.prisma.session.findMany({
          where: {
            batchId: { in: enrolments.map((e) => e.batchId) },
            OR: [
              { sessionType: { not: 'ONE_ON_ONE' } },
              { learnerId: userId },
            ],
          },
          orderBy: { startTime: 'desc' },
          include: {
            hostTrainer: { select: { id: true, name: true, email: true } },
            attendances: { where: { enrolmentId: { in: enrolments.map((e) => e.id) } } },
          },
        })
      : [];

    // D1-045: resolve the display timezone once — validated IANA or fallback UTC.
    // Booking enforcement (elsewhere) always uses raw UTC timestamps, never this value.
    const displayTz = resolveTimezone(viewerTimezone);

    const mappedCohorts = cohortSessions.map((session) => {
      const enrolment = enrolments.find((e) => e.batchId === session.batchId);
      const attendance = session.attendances[0];
      const base = {
        id: session.id,
        title: session.title,
        sessionType: session.sessionType,
        status: session.status,
        capacity: session.capacity,
        hostTrainer: session.hostTrainer ?? null,
        batch: enrolment?.batch ? { id: session.batchId, name: enrolment.batch.name } : null,
        startTime: session.startTime,
        endTime: session.endTime,
        timezone: session.timezone,
        recordingUrl: session.recordingUrl,
        joinUrl: session.joinUrl,
        programTitle: enrolment?.batch.program.title ?? '',
        batchName: enrolment?.batch.name ?? '',
        attended: Boolean(attendance),
        joinTime: attendance?.joinTime ?? null,
        durationMin: attendance?.durationMin ?? null,
      };
      return enrichSessionWithTimezone(base, displayTz);
    });

    const mappedOneOnOnes = oneOnOnes.map((s) => {
      const base = {
        id: s.id,
        title: s.title,
        sessionType: s.sessionType,
        status: s.status,
        capacity: s.capacity ?? 1,
        hostTrainer: s.hostTrainer ?? null,
        batch: null,
        startTime: s.startTime,
        endTime: s.endTime,
        timezone: s.timezone,
        recordingUrl: s.recordingUrl,
        joinUrl: s.joinUrl,
        programTitle: '1:1 Coaching',
        batchName: 'Individual',
        attended: false,
        joinTime: null,
        durationMin: null,
      };
      return enrichSessionWithTimezone(base, displayTz);
    });

    const allSessions = [...mappedOneOnOnes, ...mappedCohorts];
    const uniqueMap = new Map<string, (typeof allSessions)[0]>();
    for (const s of allSessions) {
      if (!uniqueMap.has(s.id)) {
        uniqueMap.set(s.id, s);
      } else {
        const existing = uniqueMap.get(s.id)!;
        if (s.attended || s.batch) {
          uniqueMap.set(s.id, { ...existing, ...s });
        }
      }
    }

    return Array.from(uniqueMap.values()).sort(
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

    if (!session.batchId) {
      throw new BadRequestException('Session is not associated with a batch.');
    }

    const enrolment = await this.prisma.enrolment.findUnique({
      where: { userId_batchId: { userId, batchId: session.batchId } },
    });

    if (!enrolment) {
      throw new BadRequestException('User is not enrolled in this batch.');
    }

    if (isAdminOverride) {
      // In a real scenario, the actorId should be the admin's ID.
      // Since this legacy method signature only accepts `userId` (the learner),
      // we assume the system or a generic admin ID for now, or use `userId` as fallback.
      return this.attendanceService.recordPresentManual(sessionId, enrolment.id, 'SYSTEM_ADMIN_OVERRIDE');
    } else {
      const scheduledMin =
        session.durationMinutes ||
        Math.max(15, Math.round((new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / 60000));
      return this.attendanceService.recordPresentAuto(sessionId, enrolment.id, {
        joinTime: new Date(),
        durationMin: scheduledMin,
        attendancePercentage: 100,
      });
    }
  }

  async getAttendanceForSession(sessionId: string, user: any) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { batch: true },
    });

    if (!session) throw new NotFoundException('Session not found');

    if (user.role === Role.MANAGER || user.role === 'MANAGER' || user.role === 'TEACHER') {
      const isManager = session.batch
        ? session.batch.managerId === user.sub
        : session.hostTrainerId === user.sub;
      if (!isManager) {
        throw new ForbiddenException('You can only view attendance for your own batches');
      }
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

  /**
   * D1-045: Retrieves the stored IANA timezone for a user from their profile.
   * Returns 'UTC' if the user has no timezone set or the record is not found.
   * Never throws.
   *
   * This is intentionally public so the controller can read the stored timezone
   * and forward it to service methods. The timezone always comes from the DB —
   * the client cannot supply or override it for security-relevant operations.
   */
  async getUserTimezoneForDisplay(userId: string): Promise<string> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { timezone: true },
      });
      return resolveTimezone(user?.timezone);
    } catch {
      return 'UTC';
    }
  }
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

  /**
   * Dispatches meeting notifications (both in-app and email) to all active learners
   * enrolled in the cohort (or single learner if 1-on-1).
   */
  private async notifyEnrolledLearnersOfSession(session: any, batch: any) {
    try {
      const is1on1 =
        session.sessionType === SessionType.ONE_ON_ONE ||
        session.sessionType === SessionType.ONE_ON_ONE_WITH_RO ||
        Boolean(session.learnerId) ||
        (typeof session.title === 'string' && (
          session.title.toLowerCase().includes('1-on-1') ||
          session.title.toLowerCase().includes('1-to-1') ||
          session.title.toLowerCase().startsWith('1:1')
        ));

      const dedicatedLearnerId = session.learnerId || (is1on1 ? session.bookings?.[0]?.userId : null);

      // 1. In-App notifications
      await this.remindLearners(session.batchId, session.title, session.startTime, dedicatedLearnerId);

      // 2. Fetch enrolled learners with emails
      let learners: Array<{ id: string; name: string | null; email: string; timezone: string | null }> = [];
      if (is1on1 && dedicatedLearnerId) {
        const singleLearner = await this.prisma.user.findUnique({
          where: { id: dedicatedLearnerId },
          select: { id: true, name: true, email: true, timezone: true },
        });
        if (singleLearner?.email) {
          learners = [singleLearner];
        }
      } else if (!is1on1 && session.batchId) {
        const enrolments = await this.prisma.enrolment.findMany({
          where: {
            batchId: session.batchId,
            status: { in: ['ACTIVE', 'COMPLETED'] },
          },
          include: {
            user: { select: { id: true, name: true, email: true, timezone: true } },
          },
        });
        learners = enrolments
          .map((e) => e.user)
          .filter((u): u is { id: string; name: string | null; email: string; timezone: string | null } => !!u?.email);
      }

      if (learners.length === 0 || !this.emailService) {
        return;
      }

      const { lmsUrl } = getAppUrls();
      const programTitle = batch?.program?.title || 'Course';
      const batchName = batch?.name || 'Cohort';
      const hostName = session.hostTrainer?.name || 'Your Trainer';

      const sessionDate = new Date(session.startTime);
      const sessionEndDate = new Date(session.endTime);

      // Send emails concurrently in background with error isolation
      const emailPromises = learners.map(async (learner) => {
        try {
          const tz = learner.timezone || session.timezone || 'UTC';
          const formattedDate = sessionDate.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
            timeZone: tz,
          });
          const formattedStartTime = sessionDate.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short',
            timeZone: tz,
          });
          const formattedEndTime = sessionEndDate.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short',
            timeZone: tz,
          });
          const formattedTime = `${formattedStartTime} – ${formattedEndTime}`;
          const joinLink = session.joinUrl || `${lmsUrl}/live`;

          await this.emailService!.sendTemplateEmail({
            to: learner.email,
            subject: `Live Session Scheduled: ${session.title} (${batchName})`,
            template: 'SessionScheduledEmail',
            props: {
              firstName: learner.name?.split(' ')[0] || 'Learner',
              sessionTitle: session.title,
              batchName,
              programTitle,
              instructorName: hostName,
              date: formattedDate,
              time: formattedTime,
              joinUrl: joinLink,
              lmsLiveUrl: `${lmsUrl}/live`,
            },
          });
          this.logger.log(`Dispatched session scheduled email to ${learner.email} for session "${session.title}"`);
        } catch (err: any) {
          this.logger.warn(`Failed to send session scheduled email to ${learner.email}: ${err.message}`);
        }
      });

      Promise.allSettled(emailPromises).catch((err) => {
        this.logger.error(`Error in batch email dispatch: ${err.message}`);
      });
    } catch (err: any) {
      this.logger.error(`Failed to dispatch session notifications: ${err.message}`);
    }
  }

  /**
   * Syncs or generates Zoom meeting link for an existing scheduled session.
   */
  async syncSessionMeeting(sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        batch: { select: { id: true, name: true, program: { select: { id: true, title: true } } } },
        hostTrainer: { select: { id: true, name: true, email: true, role: true } },
        learner: { select: { id: true, name: true, email: true } },
      },
    });

    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found.`);
    }

    if (session.joinUrl) {
      return session; // Already has meeting link
    }

    if (!this.meetingProvider) {
      throw new ServiceUnavailableException('Zoom meeting provider is not configured.');
    }

    const durationMin = Math.max(5, Math.round((session.endTime.getTime() - session.startTime.getTime()) / 60000));
    const meetingDetails = await this.meetingProvider.createMeeting({
      topic: session.title,
      startTime: session.startTime,
      durationMinutes: durationMin,
      timezone: session.timezone || 'UTC',
    });

    const updated = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        joinUrl: meetingDetails.joinUrl,
        hostUrl: meetingDetails.startUrl || null,
        providerMeetingId: meetingDetails.id,
        zoomMeetingId: meetingDetails.id,
      },
      include: {
        batch: { select: { id: true, name: true, program: { select: { id: true, title: true } } } },
        hostTrainer: { select: { id: true, name: true, email: true, role: true } },
        learner: { select: { id: true, name: true, email: true } },
      },
    });

    // Mark pending outbox events as COMPLETED
    try {
      const pendingOutbox = await this.prisma.outboxEvent.findMany({
        where: {
          type: 'sync-meeting',
          action: 'CREATE',
          status: { in: ['PENDING', 'FAILED', 'PROCESSING'] },
        },
      });

      for (const ev of pendingOutbox) {
        if ((ev.payload as any)?.sessionId === sessionId) {
          await this.prisma.outboxEvent.update({
            where: { id: ev.id },
            data: {
              status: 'COMPLETED',
              providerId: meetingDetails.id,
              payload: { ...((ev.payload as any) || {}), joinUrl: meetingDetails.joinUrl, hostUrl: meetingDetails.startUrl },
            },
          });
        }
      }
    } catch (err: any) {
      this.logger.warn(`Could not update outbox events for session ${sessionId}: ${err.message}`);
    }

    this.logger.log(`Successfully synced Zoom meeting for session ${sessionId}: ${meetingDetails.joinUrl}`);
    return updated;
  }

  /**
   * Reconciles all pending Zoom sessions that have joinUrl=null.
   */
  async reconcilePendingZoomSessions() {
    const pendingSessions = await this.prisma.session.findMany({
      where: {
        status: SessionStatus.SCHEDULED,
        meetingProvider: MeetingProvider.ZOOM,
        joinUrl: null,
      },
      select: { id: true, title: true },
    });

    for (const s of pendingSessions) {
      try {
        await this.syncSessionMeeting(s.id);
      } catch (err: any) {
        this.logger.warn(`Could not sync meeting for session ${s.id} (${s.title}): ${err.message}`);
      }
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
      let enrolment = null;
      if (session.batchId) {
        enrolment = await this.prisma.enrolment.findUnique({
          where: { userId_batchId: { userId: learnerId, batchId: session.batchId } },
          select: { id: true, status: true },
        });
      }
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
      if (!session.batchId) {
        throw new BadRequestException('Group cohort session is not associated with a batch.');
      }

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

    if (this.emailService) {
      try {
        const learner = await this.prisma.user.findUnique({
          where: { id: learnerId },
          select: { name: true, email: true },
        });
        if (learner?.email) {
          const { lmsUrl } = getAppUrls();
          try {
            await this.emailService.sendTemplateEmail({
              to: learner.email,
              subject: `Session Booking Confirmed: ${session.title}`,
              template: 'SessionBookingConfirmationEmail',
              props: {
                firstName: learner.name?.split(' ')[0] || 'Learner',
                sessionTitle: session.title,
                instructorName: session.hostTrainer?.name || 'Your Trainer',
                date: new Date(session.startTime).toLocaleDateString(),
                time: new Date(session.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                joinUrl: session.joinUrl || `${lmsUrl}/sessions/${sessionId}`,
              },
            });
          } catch (e: any) {
            this.logger.warn(`Failed to send session booking email: ${e?.message}`);
          }
        }
      } catch (err: any) {
        this.logger.warn(`Failed to process session booking email: ${err.message}`);
      }
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

  /**
   * D1-046: Cancel a booking. Enforces the 24-hour cancellation cutoff.
   */
  async cancelBooking(bookingId: string, learnerId: string, reason?: string) {
    const booking = await this.prisma.sessionBooking.findUnique({
      where: { id: bookingId },
      include: { session: true },
    });

    if (!booking) {
      throw new NotFoundException(`Booking with ID ${bookingId} not found.`);
    }

    if (booking.userId !== learnerId) {
      throw new ForbiddenException('You can only cancel your own bookings.');
    }

    if (
      booking.status === BookingStatus.CANCELLED ||
      booking.status === BookingStatus.RESCHEDULED
    ) {
      throw new BadRequestException(`Booking is already ${booking.status.toLowerCase()}.`);
    }

    if (booking.session.status === SessionStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a booking for a completed session.');
    }

    const nowUtc = new Date();
    const cutoffMs = getCancellationCutoffMs();
    const sessionStartMs = booking.session.startTime.getTime();

    if (sessionStartMs - nowUtc.getTime() < cutoffMs) {
      const hours = getCancellationCutoffHours();
      throw new BadRequestException(
        `Cancellations must be made at least ${hours} hour${hours !== 1 ? 's' : ''} before the session starts.`,
      );
    }

    const cancelledBooking = await this.prisma.sessionBooking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.CANCELLED,
        cancelledAt: nowUtc,
        cancelReason: reason || 'Learner cancelled',
      },
      include: {
        session: {
          select: { title: true, hostTrainer: { select: { name: true } } },
        },
      },
    });

    // Audit log
    await this.recordAudit(learnerId, 'BOOKING_CANCELLED', booking.session.id, {
      bookingId: booking.id,
      reason,
    });

    // Notification
    try {
      await this.prisma.notification.create({
        data: {
          userId: learnerId,
          type: 'SESSION_BOOKING_CANCELLED',
          template: `Your booking for "${booking.session.title}" has been cancelled.`,
          channel: 'IN_APP',
        },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to create cancellation notification: ${err.message}`);
    }

    return cancelledBooking;
  }

  /**
   * D1-046: Reschedule a booking.
   * Cancels the old booking (enforcing 24h cutoff) and books the new session
   * atomically in a transaction.
   */
  async rescheduleBooking(bookingId: string, newSessionId: string, learnerId: string) {
    if (bookingId === newSessionId) {
        throw new BadRequestException('Cannot reschedule to the same session.');
    }

    // Step 1: Pre-flight checks on the old booking
    const oldBooking = await this.prisma.sessionBooking.findUnique({
      where: { id: bookingId },
      include: { session: true },
    });

    if (!oldBooking) {
      throw new NotFoundException(`Booking with ID ${bookingId} not found.`);
    }
    if (oldBooking.userId !== learnerId) {
      throw new ForbiddenException('You can only reschedule your own bookings.');
    }
    if (oldBooking.status === BookingStatus.CANCELLED || oldBooking.status === BookingStatus.RESCHEDULED) {
      throw new BadRequestException(`Booking is already ${oldBooking.status.toLowerCase()}.`);
    }

    const nowUtc = new Date();
    const cutoffMs = getCancellationCutoffMs();
    
    if (oldBooking.session.startTime.getTime() - nowUtc.getTime() < cutoffMs) {
      const hours = getCancellationCutoffHours();
      throw new BadRequestException(
        `Rescheduling requires at least ${hours} hour${hours !== 1 ? 's' : ''} notice before the original session starts.`,
      );
    }

    // Step 2: Pre-flight checks on the new session
    const newSession = await this.prisma.session.findUnique({
      where: { id: newSessionId },
      include: { hostTrainer: { select: { name: true, email: true } } },
    });

    if (!newSession) {
      throw new NotFoundException(`Target session ${newSessionId} not found.`);
    }

    if (newSession.status === SessionStatus.CANCELLED || newSession.status === SessionStatus.RESCHEDULED || newSession.status === SessionStatus.COMPLETED) {
      throw new BadRequestException('Target session is not available for booking.');
    }

    // Eligibility check for new session
    let enrolmentId: string | null = null;
    if (newSession.sessionType === SessionType.ONE_ON_ONE) {
      if (newSession.learnerId && newSession.learnerId !== learnerId) {
        throw new ForbiddenException('This 1-on-1 session is dedicated to a different learner.');
      }
      let enrolment = null;
      if (newSession.batchId) {
        enrolment = await this.prisma.enrolment.findUnique({
          where: { userId_batchId: { userId: learnerId, batchId: newSession.batchId } },
          select: { id: true, status: true },
        });
      }
      if (enrolment && enrolment.status === EnrolmentStatus.ACTIVE) {
        enrolmentId = enrolment.id;
      }
      if (!newSession.learnerId && !enrolmentId) {
        throw new ForbiddenException('You must have an ACTIVE enrolment in the batch to book this open 1-on-1 session.');
      }
    } else {
      if (!newSession.batchId) {
        throw new BadRequestException('Target session is not associated with a batch.');
      }
      const enrolment = await this.prisma.enrolment.findUnique({
        where: { userId_batchId: { userId: learnerId, batchId: newSession.batchId } },
        select: { id: true, status: true },
      });
      if (!enrolment || enrolment.status !== EnrolmentStatus.ACTIVE) {
        throw new ForbiddenException('You are not enrolled with an ACTIVE status in the batch associated with the target session.');
      }
      enrolmentId = enrolment.id;
    }

    const advanceNoticeMs = getAdvanceNoticeMs();
    if (newSession.startTime.getTime() - nowUtc.getTime() < advanceNoticeMs) {
      const hours = getAdvanceNoticeHours();
      throw new BadRequestException(
        `Bookings must be made at least ${hours} hour${hours !== 1 ? 's' : ''} before the session starts.`,
      );
    }

    // Step 3: Calendar Provider Check (fail closed)
    if (this.calendarProvider) {
      const trainerEmail = newSession.hostTrainer?.email;
      if (!trainerEmail) {
        throw new ServiceUnavailableException('Session host trainer email is not configured. Cannot verify calendar availability.');
      }
      let busySlots: Array<{ startTime: Date; endTime: Date }>;
      try {
        busySlots = await this.calendarProvider.getBusySlots(trainerEmail, newSession.startTime, newSession.endTime);
      } catch (err: any) {
        throw new ServiceUnavailableException('Calendar availability check failed. Please try again shortly.');
      }
      const hasClash = busySlots.some(
        (slot) =>
          slot.startTime.getTime() < newSession.endTime.getTime() &&
          slot.endTime.getTime() > newSession.startTime.getTime(),
      );
      if (hasClash) {
        throw new ConflictException('The trainer is unavailable during the target session time (calendar clash).');
      }
    }

    // Step 4: Atomic Reschedule
    const result = await this.prisma.$transaction(async (tx) => {
      // Lock both sessions to prevent concurrent capacity changes
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${oldBooking.session.id}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${newSessionId}))`;

      // Check if target is full
      if (newSession.capacity !== null && newSession.capacity !== undefined) {
        const activeBookings = await tx.sessionBooking.count({
          where: {
            sessionId: newSessionId,
            status: { in: [BookingStatus.BOOKED, BookingStatus.CONFIRMED, BookingStatus.ATTENDED] },
          },
        });
        if (activeBookings >= newSession.capacity) {
          throw new ConflictException('Target session is fully booked.');
        }
      }

      // Check if they already have an active booking for the new session
      const existingNewBooking = await tx.sessionBooking.findUnique({
        where: { sessionId_userId: { sessionId: newSessionId, userId: learnerId } },
      });

      if (existingNewBooking && ([BookingStatus.BOOKED, BookingStatus.CONFIRMED, BookingStatus.ATTENDED] as BookingStatus[]).includes(existingNewBooking.status)) {
         throw new ConflictException('You already have an active booking for the target session.');
      }

      // 1. Cancel old booking
      await tx.sessionBooking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.RESCHEDULED,
          cancelledAt: nowUtc,
          cancelReason: 'Rescheduled to new session',
        },
      });

      // 2. Create or Upsert new booking
      let newBooking;
      if (existingNewBooking) {
        newBooking = await tx.sessionBooking.update({
          where: { sessionId_userId: { sessionId: newSessionId, userId: learnerId } },
          data: {
            enrolmentId: enrolmentId ?? undefined,
            status: BookingStatus.BOOKED,
          },
          include: { session: true },
        });
      } else {
        newBooking = await tx.sessionBooking.create({
          data: {
            sessionId: newSessionId,
            userId: learnerId,
            enrolmentId: enrolmentId ?? undefined,
            status: BookingStatus.BOOKED,
          },
          include: { session: true },
        });
      }

      return newBooking;
    });

    // Audit logs
    await this.recordAudit(learnerId, 'BOOKING_RESCHEDULED', result.sessionId, {
      oldBookingId: bookingId,
      newBookingId: result.id,
      oldSessionId: oldBooking.sessionId,
      newSessionId: newSessionId,
    });

    // Notifications
    try {
      await this.prisma.notification.create({
        data: {
          userId: learnerId,
          type: 'SESSION_BOOKING_RESCHEDULED',
          template: `Your booking has been rescheduled to "${result.session.title}".`,
          channel: 'IN_APP',
        },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to create reschedule notification: ${err.message}`);
    }

    return result;
  }

  /**
   * Phase 6: Missed Session & Recording Notification.
   * Finds absent learners for the session and dispatches notification email & audit record.
   */
  async triggerMissedSessionNotifications(sessionId: string, recordingUrl: string) {
    try {
      const session = await this.prisma.session.findUnique({
        where: { id: sessionId },
        include: {
          batch: {
            include: {
              enrolments: {
                where: { status: 'ACTIVE' },
                include: { user: true },
              },
            },
          },
        },
      });

      if (!session || !session.batch) return;

      const attendances = await this.prisma.attendance.findMany({
        where: { sessionId, status: AttendanceStatus.ABSENT },
        select: { userId: true },
      });

      const absentUserIds = new Set(attendances.map((a) => a.userId));
      const absentLearners = session.batch.enrolments.filter((e) => absentUserIds.has(e.userId));

      const auditEntries: any[] = [];
      for (const enrolment of absentLearners) {
        if (!enrolment.user?.email) continue;

        try {
          if (this.emailService) {
            await this.emailService.sendEmail({
              to: enrolment.user.email,
              subject: `Missed session, recording available: ${session.title}`,
              html: `<p>Hi ${enrolment.user.name || 'Learner'},</p>
<p>We missed you at <strong>${session.title}</strong>!</p>
<p>The recording has been uploaded and is available now: <a href="${recordingUrl}">Watch Session Recording</a>.</p>
<p>Please review the recording to keep up with your attendance and certification requirements.</p>`,
            });
          }

          auditEntries.push({
            actorId: 'SYSTEM',
            action: 'MISSED_SESSION_NOTIFICATION_SENT',
            entity: 'Session',
            entityId: session.id,
            meta: {
              recipientUserId: enrolment.userId,
              recipientEmail: enrolment.user.email,
              recordingUrl,
            },
          });
        } catch (err: any) {
          this.logger.warn(`Failed to dispatch missed session alert to ${enrolment.user.email}: ${err.message}`);
        }
      }

      if (auditEntries.length > 0) {
        await this.prisma.auditLog.createMany({
          data: auditEntries,
        }).catch((err) => {
          this.logger.warn(`Failed to batch insert missed session audit logs: ${err.message}`);
        });
      }
    } catch (err: any) {
      this.logger.error(`Error in triggerMissedSessionNotifications: ${err.message}`);
    }
  }

  /**
   * Records media watch progress for a session recording (Phase 3 Hybrid Attendance).
   * Reuses WatchIntervalTracker to merge watched segments, defeat fast-forward scrub/tampering,
   * credit recorded minutes, and evaluate compliance against minAttendanceMinutes or batch %.
   */
  async recordRecordingProgress(sessionId: string, userId: string, dto: RecordSessionProgressDto) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        batch: {
          include: { program: true },
        },
      },
    });

    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found.`);
    }

    // Determine learner enrolment
    let enrolmentId: string | null = null;
    if (session.batchId) {
      const enrolment = await this.prisma.enrolment.findFirst({
        where: {
          userId,
          batchId: session.batchId,
          status: { in: [EnrolmentStatus.ACTIVE, EnrolmentStatus.COMPLETED] },
        },
        select: { id: true },
      });
      enrolmentId = enrolment?.id ?? null;
    } else {
      const enrolment = await this.prisma.enrolment.findFirst({
        where: {
          userId,
          status: { in: [EnrolmentStatus.ACTIVE, EnrolmentStatus.COMPLETED] },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      enrolmentId = enrolment?.id ?? null;
    }

    // Existing attendance record
    const attendance = await this.prisma.attendance.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
    });

    // Authoritative session duration in seconds
    const durationMin =
      session.durationMinutes ??
      Math.max(5, Math.round((session.endTime.getTime() - session.startTime.getTime()) / 60000));
    const authoritativeDurationSec = durationMin * 60;

    // Per-session threshold in minutes
    const batchThreshold = (session.batch as any)?.attendanceThreshold;
    const programThreshold = (session.batch?.program as any)?.attendanceThreshold;
    const thresholdPercent =
      typeof batchThreshold === 'number' && !isNaN(batchThreshold)
        ? batchThreshold
        : typeof programThreshold === 'number' && !isNaN(programThreshold)
          ? programThreshold
          : 75;

    const requiredMinutes =
      session.minAttendanceMinutes ?? Math.round((durationMin * thresholdPercent) / 100);

    // Existing recording progress
    const recordingProgress = await this.prisma.sessionRecordingProgress.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
    });

    const existingRanges = (recordingProgress?.watchedRanges as any) || [];

    const validation = WatchIntervalTracker.validateAndCreditHeartbeat({
      existingRanges,
      lastHeartbeatAt: recordingProgress?.updatedAt,
      serverNow: new Date(),
      fromSec: dto.fromSec,
      toSec: dto.toSec,
      positionSec: dto.positionSec,
      durationSec: authoritativeDurationSec,
      minWatchPercent: thresholdPercent,
      isAlreadyCompleted: recordingProgress?.completed ?? false,
    });

    const recordedMinutes = Math.round((validation.coveredSec / 60) * 100) / 100;
    const liveMinutes = attendance?.liveMinutes ?? (attendance?.minutesPresent ?? 0);
    const totalMinutes = liveMinutes + recordedMinutes;
    const meetsThreshold = totalMinutes >= requiredMinutes || validation.earnedCompletion;

    const [updatedProgress, updatedAttendance] = await this.prisma.$transaction(async (tx) => {
      const rec = await tx.sessionRecordingProgress.upsert({
        where: { sessionId_userId: { sessionId, userId } },
        update: {
          watchedRanges: validation.updatedRanges as any,
          coveredSec: validation.coveredSec,
          completed: meetsThreshold || (recordingProgress?.completed ?? false),
          completedAt:
            meetsThreshold && !recordingProgress?.completed ? new Date() : recordingProgress?.completedAt,
        },
        create: {
          sessionId,
          userId,
          enrolmentId,
          watchedRanges: validation.updatedRanges as any,
          coveredSec: validation.coveredSec,
          completed: meetsThreshold,
          completedAt: meetsThreshold ? new Date() : null,
        },
      });

      const isAlreadyManualOrCorrected =
        attendance &&
        ([AttendanceStatus.PRESENT_MANUAL, AttendanceStatus.CORRECTED] as AttendanceStatus[]).includes(attendance.status);
      const isAlreadyLive =
        attendance &&
        ([
          AttendanceStatus.PRESENT,
          AttendanceStatus.PRESENT_AUTO,
          (AttendanceStatus as any).PRESENT_LIVE,
        ] as any[]).includes(attendance.status);

      let newStatus = attendance?.status ?? AttendanceStatus.ABSENT;
      if (!isAlreadyManualOrCorrected && !isAlreadyLive) {
        if (meetsThreshold) {
          newStatus = (AttendanceStatus as any).PRESENT_RECORDED;
        }
      }

      const att = await tx.attendance.upsert({
        where: { sessionId_userId: { sessionId, userId } },
        update: {
          status: newStatus,
          recordedMinutes,
          minutesPresent: Math.round(totalMinutes),
          attendancePercentage: Math.min(
            100,
            Math.round((totalMinutes / durationMin) * 10000) / 100,
          ),
        },
        create: {
          sessionId,
          userId,
          enrolmentId,
          status: newStatus,
          source: AttendanceSource.AUTO,
          liveMinutes: 0,
          recordedMinutes,
          minutesPresent: Math.round(totalMinutes),
          attendancePercentage: Math.min(
            100,
            Math.round((totalMinutes / durationMin) * 10000) / 100,
          ),
        },
      });

      if (meetsThreshold) {
        await markDailyAttendance(tx as any, userId, 'sessionJoined');
      }

      return [rec, att];
    });

    // If session is now compliant and enrolment exists, check batch compliance and update Stage 3 gate
    let batchCompliance: any = null;
    if (enrolmentId && this.attendanceComplianceService) {
      try {
        batchCompliance = await this.attendanceComplianceService.calculateCompliance(enrolmentId);
        if (batchCompliance.status === 'COMPLIANT' && this.stageGateService) {
          await Promise.resolve(this.stageGateService.evaluateStages(enrolmentId)).catch((err) =>
            this.logger.warn(`Failed to evaluate stages after recording progress: ${err.message}`),
          );
        }
      } catch (err: any) {
        this.logger.warn(`Attendance compliance calculation failed: ${err.message}`);
      }
    }

    return {
      sessionId,
      accepted: validation.accepted,
      coveredSec: validation.coveredSec,
      progressPercent: validation.progressPercent,
      recordedMinutes,
      liveMinutes,
      totalMinutes,
      requiredMinutes,
      isCompliant: meetsThreshold,
      attendanceStatus: updatedAttendance.status,
      completed: updatedProgress.completed,
      batchCompliance: batchCompliance?.status ?? null,
    };
  }
}

