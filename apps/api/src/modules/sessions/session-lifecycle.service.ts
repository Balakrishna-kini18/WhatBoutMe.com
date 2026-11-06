import { getAppUrls } from '../../common/config/app-urls.js';
import {
  Injectable,
  Logger,
  Inject,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  SessionStatus,
  SessionType,
  NotificationChannel,
  DeliveryStatus,
  AttendanceStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AttendanceReconciliationService } from './attendance-reconciliation.service.js';
import { EmailService } from '../email/email.service.js';
import { StageGateService } from '../progression/stage-gate.service.js';
import { MEETING_PROVIDER } from '../../common/interfaces/meeting-provider.interface.js';
import { CALENDAR_PROVIDER } from '../../common/interfaces/calendar-provider.interface.js';
import { toTimezone, resolveTimezone } from '../../common/timezone/timezone.util.js';

export interface SessionLifecycleStats {
  activatedCount: number;
  completedCount: number;
  reminders24hSent: number;
  reminders1hSent: number;
  reminders10mSent: number;
}

@Injectable()
export class SessionLifecycleService {
  private readonly logger = new Logger(SessionLifecycleService.name);
  private isProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceReconciliationService: AttendanceReconciliationService,
    private readonly emailService: EmailService,
    @Optional() @Inject(MEETING_PROVIDER) private readonly meetingProvider: any,
    @Optional() @Inject(CALENDAR_PROVIDER) private readonly calendarProvider: any,
    @Optional() @Inject(forwardRef(() => StageGateService)) private readonly stageGateService?: StageGateService,
    @Optional() @InjectQueue('lifecycle') private readonly lifecycleQueue?: Queue,
  ) {}

  onModuleDestroy() {
    // Graceful teardown hook
  }

  /**
   * Enqueues delayed BullMQ lifecycle jobs for a created or rescheduled session.
   * Uses stable job IDs with version:
   * - session-activate:{sessionId}:{version}
   * - session-complete:{sessionId}:{version}
   * - session-reminder-24h:{sessionId}:{version}
   * - session-reminder-1h:{sessionId}:{version}
   * - session-reminder-10m:{sessionId}:{version}
   */
  async scheduleSessionJobs(session: {
    id: string;
    startTime: Date;
    endTime: Date;
    scheduleVersion?: number;
    status?: SessionStatus;
  }): Promise<void> {
    if (!this.lifecycleQueue) {
      return;
    }
    const version = session.scheduleVersion || 1;
    if (version > 1) {
      await this.removeScheduledSessionJobs(session.id, version - 1).catch(() => 0);
    }
    const now = Date.now();
    const startMs = new Date(session.startTime).getTime();
    const endMs = new Date(session.endTime).getTime();

    const enqueueBounded = async (name: string, payload: any, opts: any, label: string): Promise<boolean> => {
      let timer: NodeJS.Timeout | undefined;
      try {
        const p = Promise.resolve().then(() => this.lifecycleQueue!.add(name, payload, opts));
        p.catch(() => undefined);
        await Promise.race([
          p,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('BullMQ lifecycle enqueue timed out (400ms)')), 400);
            if (typeof timer.unref === 'function') timer.unref();
          }),
        ]);
        return true;
      } catch (err: any) {
        this.logger.warn(`Failed scheduling ${label} for ${session.id}: ${err.message}`);
        return false;
      } finally {
        if (timer) clearTimeout(timer);
      }
    };

    // 1. Activation job at startTime
    if (startMs > now) {
      const delay = Math.max(0, startMs - now);
      const jobId = `session-activate:${session.id}:${version}`;
      const ok = await enqueueBounded(
        'activate-session',
        { sessionId: session.id, version },
        { jobId, delay, removeOnComplete: { count: 100, age: 86400 }, removeOnFail: { count: 200, age: 7 * 86400 } },
        'session-activate',
      );
      if (!ok) return; // Bail early if Redis queue is unreachable so we don't stall 5x sequentially
    }

    // 2. Completion job at endTime
    if (endMs > now) {
      const delay = Math.max(0, endMs - now);
      const jobId = `session-complete:${session.id}:${version}`;
      const ok = await enqueueBounded(
        'complete-session',
        { sessionId: session.id, version },
        { jobId, delay, removeOnComplete: { count: 100, age: 86400 }, removeOnFail: { count: 200, age: 7 * 86400 } },
        'session-complete',
      );
      if (!ok) return;
    }

    // 3. 24-hour reminder
    const time24h = startMs - 24 * 3600 * 1000;
    if (time24h > now) {
      const delay = Math.max(0, time24h - now);
      const jobId = `session-reminder-24h:${session.id}:${version}`;
      const ok = await enqueueBounded(
        'session-reminder-24h',
        { sessionId: session.id, version, timeframe: '24 hours' },
        { jobId, delay, removeOnComplete: { count: 100, age: 86400 }, removeOnFail: { count: 200, age: 7 * 86400 } },
        'session-reminder-24h',
      );
      if (!ok) return;
    }

    // 4. 1-hour reminder
    const time1h = startMs - 3600 * 1000;
    if (time1h > now) {
      const delay = Math.max(0, time1h - now);
      const jobId = `session-reminder-1h:${session.id}:${version}`;
      const ok = await enqueueBounded(
        'session-reminder-1h',
        { sessionId: session.id, version, timeframe: '1 hour' },
        { jobId, delay, removeOnComplete: { count: 100, age: 86400 }, removeOnFail: { count: 200, age: 7 * 86400 } },
        'session-reminder-1h',
      );
      if (!ok) return;
    }

    // 5. 10-minute reminder
    const time10m = startMs - 10 * 60 * 1000;
    if (time10m > now) {
      const delay = Math.max(0, time10m - now);
      const jobId = `session-reminder-10m:${session.id}:${version}`;
      await enqueueBounded(
        'session-reminder-10m',
        { sessionId: session.id, version, timeframe: '10 minutes' },
        { jobId, delay, removeOnComplete: { count: 100, age: 86400 }, removeOnFail: { count: 200, age: 7 * 86400 } },
        'session-reminder-10m',
      );
    }
  }

  /**
   * Best-effort removal of delayed BullMQ lifecycle jobs for a superseded or cancelled session version.
   * Only removes jobs matching the exact verified deterministic job IDs.
   */
  async removeScheduledSessionJobs(sessionId: string, version = 1): Promise<number> {
    if (!this.lifecycleQueue || typeof (this.lifecycleQueue as any).getJob !== 'function') {
      return 0;
    }

    const prefixes = [
      'session-activate',
      'session-complete',
      'session-reminder-24h',
      'session-reminder-1h',
      'session-reminder-10m',
    ];

    let removedCount = 0;
    for (const prefix of prefixes) {
      const jobId = `${prefix}:${sessionId}:${version}`;
      let timer: NodeJS.Timeout | undefined;
      try {
        const getJobPromise = Promise.resolve().then(() => this.lifecycleQueue!.getJob(jobId));
        getJobPromise.catch(() => undefined);
        const job = await Promise.race([
          getJobPromise,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('BullMQ getJob timed out (400ms)')), 400);
            if (typeof timer.unref === 'function') timer.unref();
          }),
        ]);
        if (job && typeof job.remove === 'function') {
          await job.remove();
          removedCount++;
        }
      } catch (err: any) {
        this.logger.warn(`Could not remove superseded delayed job ${jobId}: ${err?.message || err}`);
        break;
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    if (removedCount > 0) {
      this.logger.log(`Removed ${removedCount} superseded delayed lifecycle jobs for session ${sessionId} (v${version})`);
    }
    return removedCount;
  }

  /**
   * Activates a session upon its start time arriving via delayed BullMQ job.
   * Multi-worker safe: uses conditional database update matching status and scheduleVersion.
   */
  async activateSession(sessionId: string, version?: number): Promise<boolean> {
    const now = new Date();
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, title: true, startTime: true, endTime: true, status: true, scheduleVersion: true },
    });

    if (!session) {
      this.logger.warn(`activateSession: Session ${sessionId} not found, skipping.`);
      return false;
    }

    if (session.status !== SessionStatus.SCHEDULED) {
      this.logger.log(`activateSession: Session ${sessionId} is already ${session.status}, no-op.`);
      return false;
    }

    if (version !== undefined && session.scheduleVersion !== version) {
      this.logger.log(
        `activateSession: Session ${sessionId} scheduleVersion mismatch (${session.scheduleVersion} vs ${version}), superseded, no-op.`,
      );
      return false;
    }

    const whereClause: any = {
      id: sessionId,
      status: SessionStatus.SCHEDULED,
    };
    if (version !== undefined) {
      whereClause.scheduleVersion = version;
    }

    try {
      const result = await this.prisma.session.updateMany({
        where: whereClause,
        data: { status: SessionStatus.ACTIVE },
      });

      if (result.count === 0) {
        this.logger.log(`activateSession: 0 rows updated for session ${sessionId} (concurrent worker claimed), no-op.`);
        return false;
      }

      await this.prisma.auditLog.create({
        data: {
          actorId: null,
          action: 'SESSION_ACTIVATED',
          entity: 'Session',
          entityId: sessionId,
          meta: {
            title: session.title,
            startTime: session.startTime.toISOString(),
            activatedAt: now.toISOString(),
          },
        },
      });

      this.logger.log(`Session [${sessionId}] "${session.title}" automatically transitioned to ACTIVE`);
      return true;
    } catch (err: any) {
      this.logger.error(`Failed to activate session ${sessionId}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Completes a session upon its end time arriving via delayed BullMQ job.
   * Respects live Zoom overtime grace (up to 2h) before finalizing.
   */
  async completeSession(sessionId: string, version?: number): Promise<boolean> {
    const now = new Date();
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        hostTrainer: { select: { id: true, email: true, name: true } },
      },
    });

    if (!session) {
      this.logger.warn(`completeSession: Session ${sessionId} not found, skipping.`);
      return false;
    }

    if (session.status !== SessionStatus.ACTIVE && session.status !== SessionStatus.SCHEDULED) {
      this.logger.log(`completeSession: Session ${sessionId} is in ${session.status} state, not eligible for completion, no-op.`);
      return false;
    }

    if (version !== undefined && session.scheduleVersion !== version) {
      this.logger.log(
        `completeSession: Session ${sessionId} scheduleVersion mismatch (${session.scheduleVersion} vs ${version}), superseded, no-op.`,
      );
      return false;
    }

    // Check Zoom live status during overtime grace window
    const hardOvertimeCutoff = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const meetingId = (session as any).providerMeetingId || (session as any).zoomMeetingId;
    const isWithinOvertimeGrace = new Date(session.endTime).getTime() > hardOvertimeCutoff.getTime();

    if (isWithinOvertimeGrace && meetingId && this.meetingProvider && typeof this.meetingProvider.getMeetingStatus === 'function') {
      try {
        const liveStatus = await this.meetingProvider.getMeetingStatus(meetingId);
        if (liveStatus === 'started') {
          this.logger.log(`completeSession: Session ${sessionId} is still live on Zoom. Delaying completion check by 5 minutes.`);
          if (this.lifecycleQueue) {
            const bucket = Math.floor(Date.now() / (5 * 60 * 1000));
            const overtimeJobId = `session-complete-overtime:${session.id}:${session.scheduleVersion || 1}:${bucket}`;
            await this.lifecycleQueue.add(
              'complete-session',
              { sessionId: session.id, version: session.scheduleVersion },
              {
                jobId: overtimeJobId,
                delay: 5 * 60 * 1000,
                removeOnComplete: { count: 100, age: 86400 },
                removeOnFail: { count: 200, age: 7 * 86400 },
              },
            );
          }
          return false;
        }
      } catch (err: any) {
        this.logger.warn(`Could not check live meeting status for session ${sessionId}: ${err.message}`);
      }
    }

    // Atomic conditional update
    const whereClause: any = {
      id: sessionId,
      status: { in: [SessionStatus.ACTIVE, SessionStatus.SCHEDULED] },
    };
    if (version !== undefined) {
      whereClause.scheduleVersion = version;
    }

    try {
      const result = await this.prisma.session.updateMany({
        where: whereClause,
        data: { status: SessionStatus.COMPLETED },
      });

      if (result.count === 0) {
        this.logger.log(`completeSession: 0 rows updated for session ${sessionId} (concurrent worker claimed), no-op.`);
        return false;
      }

      await this.prisma.auditLog.create({
        data: {
          actorId: null,
          action: 'SESSION_COMPLETED',
          entity: 'Session',
          entityId: sessionId,
          meta: {
            title: session.title,
            endTime: session.endTime.toISOString(),
            completedAt: now.toISOString(),
          },
        },
      });

      this.logger.log(`Session [${sessionId}] "${session.title}" automatically transitioned to COMPLETED`);

      // Post-session integrations (participant reports, recordings & progression)
      await this.handlePostSessionProcessing(session);
      return true;
    } catch (err: any) {
      this.logger.error(`Failed to complete session ${sessionId}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Sends a targeted session reminder via delayed BullMQ job.
   * Multi-worker safe: uses Notification.dedupeKey unique constraint.
   */
  async sendSessionReminder(
    sessionId: string,
    version: number,
    timeframe: '24 hours' | '1 hour' | '10 minutes',
  ): Promise<number> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        learner: { select: { id: true, email: true, name: true, timezone: true } },
        user: { select: { id: true, email: true, name: true, timezone: true } },
        bookings: {
          where: { status: { in: ['BOOKED', 'CONFIRMED'] } },
          include: { user: { select: { id: true, email: true, name: true, timezone: true } } },
        },
        batch: {
          include: {
            enrolments: {
              where: { status: 'ACTIVE' },
              include: { user: { select: { id: true, email: true, name: true, timezone: true } } },
            },
          },
        },
      },
    });

    if (!session || session.status !== SessionStatus.SCHEDULED) {
      this.logger.log(`sendSessionReminder: Session ${sessionId} not found or not in SCHEDULED state, skipping.`);
      return 0;
    }

    if (session.scheduleVersion !== version) {
      this.logger.log(
        `sendSessionReminder: Session ${sessionId} version mismatch (${session.scheduleVersion} vs ${version}), superseded, skipping.`,
      );
      return 0;
    }

    const recipients = this.extractSessionRecipients(session);
    let sentCount = 0;
    for (const recipient of recipients) {
      const sent = await this.sendReminderNotification(session, recipient, timeframe);
      if (sent) sentCount++;
    }
    return sentCount;
  }

  /**
   * Main lifecycle sweep:
   * 1. Transitions SCHEDULED -> ACTIVE when start time arrives.
   * 2. Transitions ACTIVE / SCHEDULED -> COMPLETED when end time passes (with safe grace window).
   * 3. Pulls Zoom attendance & recordings upon session completion.
   * 4. Sends 24-hour and 1-hour session reminders with per-user timezone formatting.
   */
  async processLifecycleTransitions(): Promise<SessionLifecycleStats> {
    if (this.isProcessing) {
      return { activatedCount: 0, completedCount: 0, reminders24hSent: 0, reminders1hSent: 0, reminders10mSent: 0 };
    }
    this.isProcessing = true;

    const stats: SessionLifecycleStats = {
      activatedCount: 0,
      completedCount: 0,
      reminders24hSent: 0,
      reminders1hSent: 0,
      reminders10mSent: 0,
    };

    const now = new Date();

    try {
      // ── Step 1: Transition SCHEDULED -> ACTIVE ───────────────────────────
      // Sessions whose start time has arrived but end time is still in the future
      const sessionsToActivate = (await this.prisma.session.findMany({
        where: {
          status: SessionStatus.SCHEDULED,
          startTime: { lte: now },
          endTime: { gt: now },
        },
        select: { id: true, title: true, startTime: true, endTime: true },
      })) || [];

      for (const s of sessionsToActivate) {
        try {
          await this.prisma.session.update({
            where: { id: s.id },
            data: { status: SessionStatus.ACTIVE },
          });

          await this.prisma.auditLog.create({
            data: {
              actorId: null,
              action: 'SESSION_ACTIVATED',
              entity: 'Session',
              entityId: s.id,
              meta: {
                title: s.title,
                startTime: s.startTime.toISOString(),
                activatedAt: now.toISOString(),
              },
            },
          });

          stats.activatedCount++;
          this.logger.log(`Session [${s.id}] "${s.title}" automatically transitioned to ACTIVE`);
        } catch (err: any) {
          this.logger.warn(`Failed to activate session ${s.id}: ${err.message}`);
        }
      }

      // ── Step 2: Transition ACTIVE / SCHEDULED -> COMPLETED ─────────────────
      // Check any session whose scheduled endTime has arrived.
      // If the live Zoom call is still actively running ('started'), allow up to 2 hours overtime;
      // otherwise (call ended on Zoom or non-live), immediately transition to COMPLETED.
      const hardOvertimeCutoff = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      const candidateSessionsToComplete = (await this.prisma.session.findMany({
        where: {
          status: { in: [SessionStatus.ACTIVE, SessionStatus.SCHEDULED] },
          endTime: { lte: now },
        },
        include: {
          hostTrainer: { select: { id: true, email: true, name: true } },
        },
      })) || [];

      for (const s of candidateSessionsToComplete) {
        try {
          const meetingId = (s as any).providerMeetingId || (s as any).zoomMeetingId;
          const isWithinOvertimeGrace = new Date(s.endTime).getTime() > hardOvertimeCutoff.getTime();

          if (isWithinOvertimeGrace && meetingId && this.meetingProvider && typeof this.meetingProvider.getMeetingStatus === 'function') {
            const liveStatus = await this.meetingProvider.getMeetingStatus(meetingId);
            if (liveStatus === 'started') {
              // Host and learners are still actively in the Zoom call during overtime — keep ACTIVE
              continue;
            }
          }

          await this.prisma.session.update({
            where: { id: s.id },
            data: { status: SessionStatus.COMPLETED },
          });

          await this.prisma.auditLog.create({
            data: {
              actorId: null,
              action: 'SESSION_COMPLETED',
              entity: 'Session',
              entityId: s.id,
              meta: {
                title: s.title,
                endTime: s.endTime.toISOString(),
                completedAt: now.toISOString(),
              },
            },
          });

          stats.completedCount++;
          this.logger.log(`Session [${s.id}] "${s.title}" automatically transitioned to COMPLETED`);

          // Attempt post-session integrations (participant reports & recordings)
          await this.handlePostSessionProcessing(s);
        } catch (err: any) {
          this.logger.warn(`Failed to complete session ${s.id}: ${err.message}`);
        }
      }

      // ── Step 3: Send 24-hour Session Reminders ─────────────────────────────
      // Recovers missed reminders if worker was down, up to 26 hours ahead, min 2 hours ahead
      const window24hStart = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const window24hEnd = new Date(now.getTime() + 26 * 60 * 60 * 1000);

      const sessionsFor24hReminder = (await this.prisma.session.findMany({
        where: {
          status: SessionStatus.SCHEDULED,
          startTime: { gte: window24hStart, lte: window24hEnd },
        },
        include: {
          learner: { select: { id: true, email: true, name: true, timezone: true } },
          user: { select: { id: true, email: true, name: true, timezone: true } },
          bookings: {
            where: { status: { in: ['BOOKED', 'CONFIRMED'] } },
            include: { user: { select: { id: true, email: true, name: true, timezone: true } } },
          },
          batch: {
            include: {
              enrolments: {
                where: { status: 'ACTIVE' },
                include: { user: { select: { id: true, email: true, name: true, timezone: true } } },
              },
            },
          },
        },
      })) || [];

      for (const session of sessionsFor24hReminder) {
        const recipients = this.extractSessionRecipients(session);
        for (const recipient of recipients) {
          const sent = await this.sendReminderNotification(session, recipient, '24 hours');
          if (sent) stats.reminders24hSent++;
        }
      }

      // ── Step 4: Send 1-hour Session Reminders ──────────────────────────────
      // Recovers missed reminders if worker was down, from current time up to 75 minutes ahead
      const window1hStart = now;
      const window1hEnd = new Date(now.getTime() + 75 * 60 * 1000);

      const sessionsFor1hReminder = (await this.prisma.session.findMany({
        where: {
          status: SessionStatus.SCHEDULED,
          startTime: { gte: window1hStart, lte: window1hEnd },
        },
        include: {
          learner: { select: { id: true, email: true, name: true, timezone: true } },
          user: { select: { id: true, email: true, name: true, timezone: true } },
          bookings: {
            where: { status: { in: ['BOOKED', 'CONFIRMED'] } },
            include: { user: { select: { id: true, email: true, name: true, timezone: true } } },
          },
          batch: {
            include: {
              enrolments: {
                where: { status: 'ACTIVE' },
                include: { user: { select: { id: true, email: true, name: true, timezone: true } } },
              },
            },
          },
        },
      })) || [];

      for (const session of sessionsFor1hReminder) {
        const recipients = this.extractSessionRecipients(session);
        for (const recipient of recipients) {
          const sent = await this.sendReminderNotification(session, recipient, '1 hour');
          if (sent) stats.reminders1hSent++;
        }
      }

      // ── Step 5: Send 10-minute Session Reminders ──────────────────────────
      // Window: now up to 15 minutes ahead (recovers missed reminders, deduplicated)
      const window10mStart = now;
      const window10mEnd = new Date(now.getTime() + 15 * 60 * 1000);

      const sessionsFor10mReminder = (await this.prisma.session.findMany({
        where: {
          status: SessionStatus.SCHEDULED,
          startTime: { gte: window10mStart, lte: window10mEnd },
        },
        include: {
          learner: { select: { id: true, email: true, name: true, timezone: true } },
          user: { select: { id: true, email: true, name: true, timezone: true } },
          bookings: {
            where: { status: { in: ['BOOKED', 'CONFIRMED'] } },
            include: { user: { select: { id: true, email: true, name: true, timezone: true } } },
          },
          batch: {
            include: {
              enrolments: {
                where: { status: 'ACTIVE' },
                include: { user: { select: { id: true, email: true, name: true, timezone: true } } },
              },
            },
          },
        },
      })) || [];

      for (const session of sessionsFor10mReminder) {
        const recipients = this.extractSessionRecipients(session);
        for (const recipient of recipients) {
          const sent = await this.sendReminderNotification(session, recipient, '10 minutes');
          if (sent) stats.reminders10mSent++;
        }
      }
    } finally {
      this.isProcessing = false;
    }

    return stats;
  }

  /**
   * Post-session operations:
   * - Pull Zoom participant attendance report and trigger reconciliation
   * - Pull cloud recording URL and attach to session
   */
  private async handlePostSessionProcessing(session: any) {
    const meetingId = session.providerMeetingId || session.zoomMeetingId;
    if (!meetingId || !this.meetingProvider) {
      return;
    }

    // 1. Fetch participant report if available (skip if already pulled via webhook or manual sync)
    if (!session.attendancePulled) {
      try {
        if (typeof this.meetingProvider.getParticipantReport === 'function') {
          const participants = await this.meetingProvider.getParticipantReport(meetingId);
          if (participants && Array.isArray(participants) && participants.length > 0) {
            await this.attendanceReconciliationService.reconcileSession(session.id, participants);
            this.logger.log(
              `Reconciled ${participants.length} attendance records for completed session ${session.id}`,
            );
          }
        }
      } catch (err: any) {
        this.logger.warn(`Could not pull participant report for session ${session.id}: ${err.message}`);
      }
    }

    // 2. Fetch recording URL if available
    try {
      if (typeof this.meetingProvider.getRecordingUrl === 'function') {
        const recordingUrl = await this.meetingProvider.getRecordingUrl(meetingId);
        if (recordingUrl && !session.recordingUrl) {
          await this.prisma.session.update({
            where: { id: session.id },
            data: { recordingUrl },
          });
          this.logger.log(`Attached recording URL to completed session ${session.id}`);
        }
      }
    } catch (err: any) {
      this.logger.warn(`Could not pull recording for session ${session.id}: ${err.message}`);
    }

    // 3. Post-session 1-on-1 progression completion check
    await this.handle1on1Completion(session);
  }

  /**
   * Automatically marks 1-on-1 session completion on learner enrolment and triggers stage gate evaluation.
   */
  private async handle1on1Completion(session: any) {
    try {
      const is1on1 =
        session.sessionType === SessionType.ONE_ON_ONE ||
        session.sessionType === SessionType.ONE_ON_ONE_WITH_RO ||
        Boolean(session.learnerId);

      if (!is1on1) return;

      let learnerUserId = session.learnerId;
      if (!learnerUserId && session.bookings && session.bookings.length > 0) {
        learnerUserId = session.bookings[0].userId;
      }

      if (!learnerUserId) {
        const booking = await this.prisma.sessionBooking.findFirst({
          where: { sessionId: session.id },
          select: { userId: true },
        });
        learnerUserId = booking?.userId;
      }

      if (!learnerUserId) return;

      // Verify that learner actually attended the 1-on-1 session before granting stage gate completion!
      const attendance = await this.prisma.attendance.findUnique({
        where: { sessionId_userId: { sessionId: session.id, userId: learnerUserId } },
      });

      const isAttended =
        attendance &&
        ([
          AttendanceStatus.PRESENT,
          AttendanceStatus.PRESENT_AUTO,
          AttendanceStatus.PRESENT_MANUAL,
          AttendanceStatus.CORRECTED,
          (AttendanceStatus as any).PRESENT_LIVE,
          (AttendanceStatus as any).PRESENT_RECORDED,
        ] as AttendanceStatus[]).includes(attendance.status);

      if (!isAttended) {
        this.logger.warn(
          `Learner ${learnerUserId} did not attend 1-on-1 session ${session.id}. oneOnOneCompletedAt will not be set.`,
        );
        return;
      }

      const enrolment = await this.prisma.enrolment.findFirst({
        where: {
          userId: learnerUserId,
          status: { in: ['ACTIVE', 'COMPLETED'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (enrolment && !enrolment.oneOnOneCompletedAt) {
        const completedAt = session.endTime || new Date();
        await this.prisma.enrolment.update({
          where: { id: enrolment.id },
          data: { oneOnOneCompletedAt: completedAt },
        });
        this.logger.log(`Set oneOnOneCompletedAt for enrolment ${enrolment.id} via session ${session.id}`);

        if (this.stageGateService) {
          await Promise.resolve(this.stageGateService.evaluateStages(enrolment.id)).catch((err: any) =>
            this.logger.warn(`Failed evaluating stages after 1-on-1 session completion: ${err?.message}`),
          );
        }
      }
    } catch (err: any) {
      this.logger.warn(`Failed handling 1-on-1 completion for session ${session.id}: ${err?.message}`);
    }
  }

  /**
   * Helper to deduplicate recipients across direct learners, bookings, and batch enrolments.
   */
  private extractSessionRecipients(session: any): Array<{ id: string; email: string; name: string | null; timezone: string | null }> {
    const map = new Map<string, { id: string; email: string; name: string | null; timezone: string | null }>();

    const is1on1 =
      session.sessionType === SessionType.ONE_ON_ONE ||
      session.sessionType === SessionType.ONE_ON_ONE_WITH_RO ||
      session.sessionType === SessionType.SPEAKER_DISCOVERY_CALL ||
      Boolean(session.learnerId || session.learner?.id) ||
      Boolean(session.userId || session.user?.id) ||
      (typeof session.title === 'string' && (
        session.title.toLowerCase().includes('1-on-1') ||
        session.title.toLowerCase().includes('1-to-1') ||
        session.title.toLowerCase().startsWith('1:1') ||
        session.title.toLowerCase().includes('discovery call') ||
        session.title.toLowerCase().includes('discovery')
      ));

    if (session.learner?.id && session.learner?.email) {
      map.set(session.learner.id, session.learner);
    }
    if (session.user?.id && session.user?.email) {
      map.set(session.user.id, session.user);
    }

    if (is1on1) {
      // 1-on-1 and discovery sessions are strictly confidential between coach and individual learner.
      // If direct learner was not mapped, check if a single booking exists for this 1-on-1 session.
      if (map.size === 0 && session.bookings && Array.isArray(session.bookings) && session.bookings.length > 0) {
        const primaryBooking = session.bookings.find((b: any) => b?.user?.id && b?.user?.email) || session.bookings[0];
        if (primaryBooking?.user?.id && primaryBooking?.user?.email) {
          map.set(primaryBooking.user.id, primaryBooking.user);
        }
      }
      // Under NO circumstances should batch enrolments or peer learners receive notifications.
      return Array.from(map.values());
    }

    // For Group / Cohort sessions only:
    if (session.bookings && Array.isArray(session.bookings)) {
      for (const b of session.bookings) {
        if (b.user?.id && b.user?.email) {
          map.set(b.user.id, b.user);
        }
      }
    }

    if (session.batch?.enrolments && Array.isArray(session.batch.enrolments)) {
      for (const e of session.batch.enrolments) {
        if (e.user?.id && e.user?.email) {
          map.set(e.user.id, e.user);
        }
      }
    }

    return Array.from(map.values());
  }

  /**
   * Sends a 24-hour, 1-hour, or 10-minute session reminder email, deduplicated by Notification record.
   * Multi-worker safe: uses unique Notification.dedupeKey constraint as the authoritative guarantee.
   */
  private async sendReminderNotification(
    session: any,
    recipient: { id: string; email: string; name: string | null; timezone: string | null },
    timeframe: '24 hours' | '1 hour' | '10 minutes',
  ): Promise<boolean> {
    const timeframeSlug = timeframe === '24 hours' ? '24h' : timeframe === '1 hour' ? '1h' : '10m';
    const notificationType = `SESSION_REMINDER_${timeframeSlug.toUpperCase()}:${session.id}`;
    const scheduleVer = session.scheduleVersion || 1;
    const dedupeKey = `session:${session.id}:reminder:${timeframeSlug}:user:${recipient.id}:v${scheduleVer}`;

    // 1. Check if a reminder for THIS EXACT scheduleVersion has already succeeded
    // If a previous notification exists and is NOT in FAILED status, it was already handled.
    // FAILED reminders remain eligible for recovery retry.
    const existing = await this.prisma.notification.findFirst({
      where: {
        OR: [
          { dedupeKey },
          { userId: recipient.id, type: notificationType },
        ],
      },
      select: { id: true, deliveryStatus: true, dedupeKey: true },
    });

    if (existing && existing.deliveryStatus !== DeliveryStatus.FAILED && (!existing.dedupeKey || existing.dedupeKey === dedupeKey)) {
      return false; // Already sent or handled
    }

    // Format wall-clock time in recipient's preferred timezone
    const userTz = resolveTimezone(recipient.timezone || session.timezone);
    const formatted = toTimezone(session.startTime, userTz);

    const firstName = recipient.name?.split(' ')[0] || 'Learner';
    const { lmsUrl } = getAppUrls();
    const joinUrl = session.joinUrl || session.meetingLink || `${lmsUrl}/live?autoJoin=${session.id}`;
    const subject = `Reminder: ${session.title} starts in ${timeframe}`;
    const message = `Your live session "${session.title}" starts in ${timeframe}. Click here to join on time.`;

    // 2. ATOMIC INSERT GUARANTEE: create Notification row with dedupeKey
    let notifId: string | null = null;
    if (existing) {
      notifId = existing.id;
      if (this.prisma.notification?.update) {
        await this.prisma.notification.update({
          where: { id: notifId },
          data: {
            deliveryStatus: DeliveryStatus.DELIVERED,
            sentAt: new Date(),
            title: subject,
            message,
            link: joinUrl,
          },
        }).catch(() => null);
      }
    } else {
      try {
        const createdNotif = await this.prisma.notification.create({
          data: {
            userId: recipient.id,
            type: notificationType,
            title: subject,
            message,
            link: joinUrl,
            template: 'SessionReminderNotification',
            channel: NotificationChannel.IN_APP,
            deliveryStatus: DeliveryStatus.DELIVERED,
            sentAt: new Date(),
            dedupeKey,
          },
        });
        notifId = createdNotif?.id || null;
      } catch (err: any) {
        if (err?.code === 'P2002') {
          // Concurrent worker won race
          this.logger.log(`Reminder already queued/sent (dedupe: ${dedupeKey}), skipping.`);
          return false;
        }
        this.logger.warn(`Failed to create notification row for ${recipient.email}: ${err.message}`);
        return false;
      }
    }

    // 3. Production email policy: 24h & 1h reminders are stripped from email to prevent spam.
    // Learners rely on 1-click 'Add to Google Calendar' from SessionScheduledEmail (#6).
    // In-app notifications continue to be stored for the dashboard notification bell.
    this.logger.log(
      `Recorded ${timeframe} in-app reminder for session "${session.title}" to ${recipient.email} in timezone ${userTz}`,
    );
    return true;
  }
}
