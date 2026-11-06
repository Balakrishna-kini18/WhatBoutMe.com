import { getAppUrls } from '../../common/config/app-urls.js';
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  Optional,
  forwardRef,
} from '@nestjs/common';
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
export class SessionLifecycleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SessionLifecycleService.name);
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceReconciliationService: AttendanceReconciliationService,
    private readonly emailService: EmailService,
    @Optional() @Inject(MEETING_PROVIDER) private readonly meetingProvider: any,
    @Optional() @Inject(CALENDAR_PROVIDER) private readonly calendarProvider: any,
    @Optional() @Inject(forwardRef(() => StageGateService)) private readonly stageGateService?: StageGateService,
  ) {}

  onModuleInit() {
    // Run an initial sweep 5 seconds after startup
    setTimeout(() => {
      this.processLifecycleTransitions().catch((err) =>
        this.logger.error(`Initial lifecycle transition sweep failed: ${err.message}`),
      );
    }, 5000);

    // Run periodic lifecycle sweep every 60 seconds
    this.timer = setInterval(() => {
      this.processLifecycleTransitions().catch((err) =>
        this.logger.error(`Periodic lifecycle transition sweep failed: ${err.message}`),
      );
    }, 60000);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
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
   */
  private async sendReminderNotification(
    session: any,
    recipient: { id: string; email: string; name: string | null; timezone: string | null },
    timeframe: '24 hours' | '1 hour' | '10 minutes',
  ): Promise<boolean> {
    const notificationType = timeframe === '24 hours'
      ? `SESSION_REMINDER_24H:${session.id}`
      : timeframe === '1 hour'
      ? `SESSION_REMINDER_1H:${session.id}`
      : `SESSION_REMINDER_10M:${session.id}`;

    // Deduplication check
    const existing = await this.prisma.notification.findFirst({
      where: {
        userId: recipient.id,
        type: notificationType,
      },
    });

    if (existing) {
      return false; // Already sent
    }

    // Format wall-clock time in recipient's preferred timezone
    const userTz = resolveTimezone(recipient.timezone || session.timezone);
    const formatted = toTimezone(session.startTime, userTz);

    const firstName = recipient.name?.split(' ')[0] || 'Learner';
    const { lmsUrl } = getAppUrls();
    const joinUrl = `${lmsUrl}/live?autoJoin=${session.id}`;

    try {
      // Production email policy: 24h & 1h reminders are stripped from email to prevent spam.
      // Learners rely on 1-click 'Add to Google Calendar' from SessionScheduledEmail (#6).
      // In-app notifications continue to be stored for the dashboard notification bell.
      await this.prisma.notification.create({
        data: {
          userId: recipient.id,
          type: notificationType,
          title: `Reminder: ${session.title} starts in ${timeframe}`,
          message: `Your live session "${session.title}" starts in ${timeframe}. Click here to join on time.`,
          link: joinUrl,
          template: 'SessionReminderNotification',
          channel: NotificationChannel.IN_APP,
          deliveryStatus: DeliveryStatus.DELIVERED,
          sentAt: new Date(),
        },
      });

      this.logger.log(
        `Recorded ${timeframe} in-app reminder for session "${session.title}" to ${recipient.email} in timezone ${userTz}`,
      );
      return true;
    } catch (err: any) {
      this.logger.warn(
        `Failed to record ${timeframe} in-app reminder for session ${session.id}: ${err.message}`,
      );
      return false;
    }
  }
}
