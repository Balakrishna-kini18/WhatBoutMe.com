import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  Optional,
} from '@nestjs/common';
import {
  SessionStatus,
  NotificationChannel,
  DeliveryStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AttendanceReconciliationService } from './attendance-reconciliation.service.js';
import { EmailService } from '../email/email.service.js';
import { MEETING_PROVIDER } from '../../common/interfaces/meeting-provider.interface.js';
import { CALENDAR_PROVIDER } from '../../common/interfaces/calendar-provider.interface.js';
import { toTimezone, resolveTimezone } from '../../common/timezone/timezone.util.js';

export interface SessionLifecycleStats {
  activatedCount: number;
  completedCount: number;
  reminders24hSent: number;
  reminders1hSent: number;
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
      return { activatedCount: 0, completedCount: 0, reminders24hSent: 0, reminders1hSent: 0 };
    }
    this.isProcessing = true;

    const stats: SessionLifecycleStats = {
      activatedCount: 0,
      completedCount: 0,
      reminders24hSent: 0,
      reminders1hSent: 0,
    };

    const now = new Date();

    try {
      // ── Step 1: Transition SCHEDULED -> ACTIVE ───────────────────────────
      // Sessions whose start time has arrived but end time is still in the future
      const sessionsToActivate = await this.prisma.session.findMany({
        where: {
          status: SessionStatus.SCHEDULED,
          startTime: { lte: now },
          endTime: { gt: now },
        },
        select: { id: true, title: true, startTime: true, endTime: true },
      });

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
      // End time has passed (plus 5-minute safety grace to avoid cutting off active attendees)
      const completionThreshold = new Date(now.getTime() - 5 * 60 * 1000);

      const sessionsToComplete = await this.prisma.session.findMany({
        where: {
          status: { in: [SessionStatus.ACTIVE, SessionStatus.SCHEDULED] },
          endTime: { lte: completionThreshold },
        },
        include: {
          hostTrainer: { select: { id: true, email: true, name: true } },
        },
      });

      for (const s of sessionsToComplete) {
        try {
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

      const sessionsFor24hReminder = await this.prisma.session.findMany({
        where: {
          status: SessionStatus.SCHEDULED,
          startTime: { gte: window24hStart, lte: window24hEnd },
        },
        include: {
          learner: { select: { id: true, email: true, name: true, timezone: true } },
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

      const sessionsFor1hReminder = await this.prisma.session.findMany({
        where: {
          status: SessionStatus.SCHEDULED,
          startTime: { gte: window1hStart, lte: window1hEnd },
        },
        include: {
          learner: { select: { id: true, email: true, name: true, timezone: true } },
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

      for (const session of sessionsFor1hReminder) {
        const recipients = this.extractSessionRecipients(session);
        for (const recipient of recipients) {
          const sent = await this.sendReminderNotification(session, recipient, '1 hour');
          if (sent) stats.reminders1hSent++;
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

    // 1. Fetch participant report if available
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
  }

  /**
   * Helper to deduplicate recipients across direct learners, bookings, and batch enrolments.
   */
  private extractSessionRecipients(session: any): Array<{ id: string; email: string; name: string | null; timezone: string | null }> {
    const map = new Map<string, { id: string; email: string; name: string | null; timezone: string | null }>();

    if (session.learner?.id && session.learner?.email) {
      map.set(session.learner.id, session.learner);
    }

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
   * Sends a 24-hour or 1-hour session reminder email, deduplicated by Notification record.
   */
  private async sendReminderNotification(
    session: any,
    recipient: { id: string; email: string; name: string | null; timezone: string | null },
    timeframe: '24 hours' | '1 hour',
  ): Promise<boolean> {
    const notificationType = timeframe === '24 hours'
      ? `SESSION_REMINDER_24H:${session.id}`
      : `SESSION_REMINDER_1H:${session.id}`;

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
    const joinUrl = session.joinUrl || `${process.env.APP_URL || 'https://whatboutme.com'}/meetings`;

    try {
      await this.emailService.sendTemplateEmail({
        to: recipient.email,
        subject: `Reminder: ${session.title} starts in ${timeframe}`,
        template: 'SessionReminderEmail',
        props: {
          firstName,
          sessionTitle: session.title,
          timeframe,
          date: formatted.date,
          time: `${formatted.time} (${userTz})`,
          joinUrl,
        },
      });

      await this.prisma.notification.create({
        data: {
          userId: recipient.id,
          type: notificationType,
          template: 'SessionReminderEmail',
          channel: NotificationChannel.EMAIL,
          deliveryStatus: DeliveryStatus.SENT,
          sentAt: new Date(),
        },
      });

      this.logger.log(
        `Sent ${timeframe} reminder for session "${session.title}" to ${recipient.email} in timezone ${userTz}`,
      );
      return true;
    } catch (err: any) {
      this.logger.warn(
        `Failed to send ${timeframe} reminder to ${recipient.email} for session ${session.id}: ${err.message}`,
      );
      return false;
    }
  }
}
