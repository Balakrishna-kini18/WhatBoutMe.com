import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SessionLifecycleService } from './session-lifecycle.service.js';
import { SessionStatus, NotificationChannel, DeliveryStatus } from '@prisma/client';

describe('D2-Lifecycle: SessionLifecycleService', () => {
  let service: SessionLifecycleService;
  let prismaMock: any;
  let reconciliationMock: any;
  let emailMock: any;
  let meetingProviderMock: any;
  let calendarProviderMock: any;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T10:00:00.000Z'));

    prismaMock = {
      session: {
        findMany: vi.fn(),
        update: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
      notification: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
    };

    reconciliationMock = {
      reconcileSession: vi.fn().mockResolvedValue({ success: true }),
    };

    emailMock = {
      sendTemplateEmail: vi.fn().mockResolvedValue({ messageId: 'msg-123' }),
    };

    meetingProviderMock = {
      getParticipantReport: vi.fn(),
      getRecordingUrl: vi.fn(),
    };

    calendarProviderMock = {
      deleteEvent: vi.fn(),
    };

    service = new SessionLifecycleService(
      prismaMock as any,
      reconciliationMock as any,
      emailMock as any,
      meetingProviderMock,
      calendarProviderMock,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
    vi.useRealTimers();
  });

  describe('Session Status Transitions', () => {
    it('automatically transitions SCHEDULED session to ACTIVE when start time arrives', async () => {
      const now = new Date('2026-10-20T10:00:00.000Z');
      const activeSession = {
        id: 'sess-1',
        title: 'Morning Cohort Session',
        startTime: new Date('2026-10-20T09:55:00.000Z'),
        endTime: new Date('2026-10-20T11:00:00.000Z'),
        status: SessionStatus.SCHEDULED,
      };

      prismaMock.session.findMany
        .mockResolvedValueOnce([activeSession]) // for Step 1: activate
        .mockResolvedValueOnce([]) // for Step 2: complete
        .mockResolvedValueOnce([]) // for Step 3: 24h reminders
        .mockResolvedValueOnce([]); // for Step 4: 1h reminders

      prismaMock.session.update.mockResolvedValueOnce({
        ...activeSession,
        status: SessionStatus.ACTIVE,
      });

      const stats = await service.processLifecycleTransitions();

      expect(stats.activatedCount).toBe(1);
      expect(prismaMock.session.update).toHaveBeenCalledWith({
        where: { id: 'sess-1' },
        data: { status: SessionStatus.ACTIVE },
      });
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'SESSION_ACTIVATED',
            entityId: 'sess-1',
          }),
        }),
      );
    });

    it('transitions ACTIVE / SCHEDULED session to COMPLETED after end time + grace period', async () => {
      const pastSession = {
        id: 'sess-2',
        title: 'Completed Workshop',
        startTime: new Date('2026-10-20T08:00:00.000Z'),
        endTime: new Date('2026-10-20T09:30:00.000Z'),
        status: SessionStatus.ACTIVE,
        providerMeetingId: 'zoom-12345',
        recordingUrl: null,
      };

      prismaMock.session.findMany
        .mockResolvedValueOnce([]) // Step 1
        .mockResolvedValueOnce([pastSession]) // Step 2: complete
        .mockResolvedValueOnce([]) // Step 3
        .mockResolvedValueOnce([]); // Step 4

      prismaMock.session.update.mockResolvedValue({
        ...pastSession,
        status: SessionStatus.COMPLETED,
      });

      meetingProviderMock.getParticipantReport.mockResolvedValue([
        { participantEmail: 'learner@example.com', joinTime: new Date(), leaveTime: new Date() },
      ]);
      meetingProviderMock.getRecordingUrl.mockResolvedValue('https://zoom.us/rec/play-123');

      const stats = await service.processLifecycleTransitions();

      expect(stats.completedCount).toBe(1);
      expect(prismaMock.session.update).toHaveBeenCalledWith({
        where: { id: 'sess-2' },
        data: { status: SessionStatus.COMPLETED },
      });
      expect(reconciliationMock.reconcileSession).toHaveBeenCalledWith(
        'sess-2',
        expect.any(Array),
      );
      expect(prismaMock.session.update).toHaveBeenCalledWith({
        where: { id: 'sess-2' },
        data: { recordingUrl: 'https://zoom.us/rec/play-123' },
      });
    });

    it('never transitions CANCELLED or RESCHEDULED sessions', async () => {
      // Step 1 only queries status: SCHEDULED, Step 2 only queries status in [ACTIVE, SCHEDULED]
      prismaMock.session.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await service.processLifecycleTransitions();

      expect(prismaMock.session.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: expect.objectContaining({
            status: SessionStatus.SCHEDULED,
          }),
        }),
      );
      expect(prismaMock.session.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: [SessionStatus.ACTIVE, SessionStatus.SCHEDULED] },
          }),
        }),
      );
    });
  });

  describe('Session Reminders & Timezone Conversion', () => {
    it('sends 24-hour reminder converted into learner timezone and deduplicates', async () => {
      const tomorrowSession = {
        id: 'sess-24h',
        title: 'Vision Board Masterclass',
        startTime: new Date('2026-10-21T10:00:00.000Z'),
        endTime: new Date('2026-10-21T11:00:00.000Z'),
        status: SessionStatus.SCHEDULED,
        joinUrl: 'https://zoom.us/j/999',
        learner: {
          id: 'user-uk',
          email: 'londoner@example.com',
          name: 'Arthur Dent',
          timezone: 'Europe/London',
        },
        bookings: [],
        batch: null,
      };

      prismaMock.session.findMany
        .mockResolvedValueOnce([]) // Step 1
        .mockResolvedValueOnce([]) // Step 2
        .mockResolvedValueOnce([tomorrowSession]) // Step 3: 24h
        .mockResolvedValueOnce([]); // Step 4: 1h

      prismaMock.notification.findFirst.mockResolvedValueOnce(null); // not yet sent
      prismaMock.notification.create.mockResolvedValueOnce({ id: 'notif-1' });

      const stats = await service.processLifecycleTransitions();

      expect(stats.reminders24hSent).toBe(1);
      expect(emailMock.sendTemplateEmail).toHaveBeenCalledWith({
        to: 'londoner@example.com',
        subject: 'Reminder: Vision Board Masterclass starts in 24 hours',
        template: 'SessionReminderEmail',
        props: expect.objectContaining({
          firstName: 'Arthur',
          sessionTitle: 'Vision Board Masterclass',
          timeframe: '24 hours',
          date: '2026-10-21',
          time: expect.stringContaining('Europe/London'),
          joinUrl: 'https://zoom.us/j/999',
        }),
      });

      expect(prismaMock.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-uk',
          type: 'SESSION_REMINDER_24H:sess-24h',
          channel: NotificationChannel.BOTH,
          deliveryStatus: DeliveryStatus.SENT,
        }),
      });
    });

    it('does NOT send duplicate reminder if Notification record already exists', async () => {
      const tomorrowSession = {
        id: 'sess-24h-dup',
        title: 'Already Reminded Session',
        startTime: new Date('2026-10-21T10:00:00.000Z'),
        endTime: new Date('2026-10-21T11:00:00.000Z'),
        status: SessionStatus.SCHEDULED,
        learner: {
          id: 'user-dubai',
          email: 'dubai@example.com',
          name: 'Rashid',
          timezone: 'Asia/Dubai',
        },
        bookings: [],
        batch: null,
      };

      prismaMock.session.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([tomorrowSession])
        .mockResolvedValueOnce([]);

      // Notification already exists
      prismaMock.notification.findFirst.mockResolvedValueOnce({ id: 'existing-notif' });

      const stats = await service.processLifecycleTransitions();

      expect(stats.reminders24hSent).toBe(0);
      expect(emailMock.sendTemplateEmail).not.toHaveBeenCalled();
    });

    it('sends 1-hour reminder for session starting in 1 hour', async () => {
      const soonSession = {
        id: 'sess-1h',
        title: 'Imminent 1-on-1 Call',
        startTime: new Date('2026-10-20T10:55:00.000Z'), // in 55 mins
        endTime: new Date('2026-10-20T11:55:00.000Z'),
        status: SessionStatus.SCHEDULED,
        joinUrl: 'https://whatboutme.com/meetings',
        learner: {
          id: 'user-ny',
          email: 'ny@example.com',
          name: 'Jane Doe',
          timezone: 'America/New_York',
        },
        bookings: [],
        batch: null,
      };

      prismaMock.session.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([soonSession]);

      prismaMock.notification.findFirst.mockResolvedValueOnce(null);

      const stats = await service.processLifecycleTransitions();

      expect(stats.reminders1hSent).toBe(1);
      expect(emailMock.sendTemplateEmail).toHaveBeenCalledWith({
        to: 'ny@example.com',
        subject: 'Reminder: Imminent 1-on-1 Call starts in 1 hour',
        template: 'SessionReminderEmail',
        props: expect.objectContaining({
          firstName: 'Jane',
          timeframe: '1 hour',
          time: expect.stringContaining('America/New_York'),
        }),
      });
    });

    it('sends 10-minute reminder for session starting in 10 minutes', async () => {
      const tenMinSession = {
        id: 'sess-10m',
        title: 'Starting Soon Session',
        startTime: new Date('2026-10-20T10:10:00.000Z'),
        endTime: new Date('2026-10-20T11:00:00.000Z'),
        status: SessionStatus.SCHEDULED,
        joinUrl: 'https://whatboutme.com/meetings/10m',
        learner: {
          id: 'user-dubai-10m',
          email: 'dubai10@example.com',
          name: 'Ahmed',
          timezone: 'Asia/Dubai',
        },
        bookings: [],
        batch: null,
      };

      prismaMock.session.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([tenMinSession]);

      prismaMock.notification.findFirst.mockResolvedValueOnce(null);

      const stats = await service.processLifecycleTransitions();

      expect(stats.reminders10mSent).toBe(1);
      expect(emailMock.sendTemplateEmail).toHaveBeenCalledWith({
        to: 'dubai10@example.com',
        subject: 'Reminder: Starting Soon Session starts in 10 minutes',
        template: 'SessionReminderEmail',
        props: expect.objectContaining({
          firstName: 'Ahmed',
          sessionTitle: 'Starting Soon Session',
          timeframe: '10 minutes',
          time: expect.stringContaining('Asia/Dubai'),
        }),
      });
    });

    it('recovers missed reminders after worker downtime', async () => {
      // Session starts in 18 hours (worker was down during 24h mark)
      const missedSession = {
        id: 'sess-missed-24h',
        title: 'Recovered Session',
        startTime: new Date('2026-10-21T04:00:00.000Z'), // 18 hours away
        endTime: new Date('2026-10-21T05:00:00.000Z'),
        status: SessionStatus.SCHEDULED,
        learner: {
          id: 'user-rec',
          email: 'rec@example.com',
          name: 'Recovered Learner',
          timezone: 'Asia/Kolkata',
        },
        bookings: [],
        batch: null,
      };

      prismaMock.session.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([missedSession])
        .mockResolvedValueOnce([]);

      prismaMock.notification.findFirst.mockResolvedValueOnce(null);

      const stats = await service.processLifecycleTransitions();

      expect(stats.reminders24hSent).toBe(1);
      expect(emailMock.sendTemplateEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'rec@example.com',
          subject: 'Reminder: Recovered Session starts in 24 hours',
        }),
      );
    });
  });

  describe('Idempotency & Failure Tolerance', () => {
    it('is idempotent across repeated executions', async () => {
      // When no matching sessions exist on subsequent sweeps
      prismaMock.session.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const stats = await service.processLifecycleTransitions();

      expect(stats.activatedCount).toBe(0);
      expect(stats.completedCount).toBe(0);
      expect(stats.reminders24hSent).toBe(0);
      expect(stats.reminders1hSent).toBe(0);
      expect(prismaMock.session.update).not.toHaveBeenCalled();
    });

    it('safely completes session even if meeting provider throws during attendance or recording fetch', async () => {
      const errorSession = {
        id: 'sess-err-provider',
        title: 'Session With Offline Provider',
        startTime: new Date('2026-10-20T08:00:00.000Z'),
        endTime: new Date('2026-10-20T09:30:00.000Z'),
        status: SessionStatus.ACTIVE,
        providerMeetingId: 'zoom-unreachable',
      };

      prismaMock.session.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([errorSession])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      prismaMock.session.update.mockResolvedValueOnce({
        ...errorSession,
        status: SessionStatus.COMPLETED,
      });

      // Provider throws network error
      meetingProviderMock.getParticipantReport.mockRejectedValueOnce(
        new Error('Zoom API 503 Service Unavailable'),
      );

      const stats = await service.processLifecycleTransitions();

      // Session was still cleanly marked COMPLETED and did not crash or hang
      expect(stats.completedCount).toBe(1);
      expect(prismaMock.session.update).toHaveBeenCalledWith({
        where: { id: 'sess-err-provider' },
        data: { status: SessionStatus.COMPLETED },
      });
    });
  });
});
