import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SessionLifecycleService } from './session-lifecycle.service.js';
import { SessionStatus, SessionType, NotificationChannel, DeliveryStatus } from '@prisma/client';

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
          joinUrl: expect.stringContaining('/live?autoJoin=sess-24h'),
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

    it('does NOT leak 1-on-1 reminders to other batch learners when 1-on-1 session has a batchId', async () => {
      const oneOnOneSessionWithBatch = {
        id: 'sess-1on1-batch',
        title: '1-on-1 Coaching: Dedicated Learner',
        sessionType: SessionType.ONE_ON_ONE,
        learnerId: 'dedicated-user-id',
        startTime: new Date('2026-10-21T10:00:00.000Z'),
        endTime: new Date('2026-10-21T10:45:00.000Z'),
        status: SessionStatus.SCHEDULED,
        learner: {
          id: 'dedicated-user-id',
          email: 'dedicated@example.com',
          name: 'Dedicated Student',
          timezone: 'Asia/Kolkata',
        },
        bookings: [],
        batch: {
          id: 'cohort-batch-1',
          enrolments: [
            { user: { id: 'peer-user-1', email: 'peer1@example.com', name: 'Peer 1', timezone: 'UTC' } },
            { user: { id: 'peer-user-2', email: 'peer2@example.com', name: 'Peer 2', timezone: 'UTC' } },
          ],
        },
      };

      prismaMock.session.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([oneOnOneSessionWithBatch])
        .mockResolvedValueOnce([]);

      prismaMock.notification.findFirst.mockResolvedValueOnce(null);

      const stats = await service.processLifecycleTransitions();

      expect(stats.reminders24hSent).toBe(1);
      expect(emailMock.sendTemplateEmail).toHaveBeenCalledTimes(1);
      expect(emailMock.sendTemplateEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'dedicated@example.com',
          subject: 'Reminder: 1-on-1 Coaching: Dedicated Learner starts in 24 hours',
        }),
      );
      expect(prismaMock.notification.create).toHaveBeenCalledTimes(1);
      expect(prismaMock.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'dedicated-user-id',
        }),
      });
    });

    it('does NOT leak 1-hour or 10-minute 1-on-1 coaching reminders to cohort batch peers', async () => {
      const oneOnOneStartingSoon = {
        id: 'sess-1on1-10m',
        title: '1-on-1 Coaching: siddhlinga',
        sessionType: SessionType.ONE_ON_ONE,
        learnerId: 'sid-user-id',
        startTime: new Date('2026-10-20T10:08:00.000Z'), // in 8 minutes
        endTime: new Date('2026-10-20T10:53:00.000Z'),
        status: SessionStatus.SCHEDULED,
        learner: {
          id: 'sid-user-id',
          email: 'kamathbro99@gmail.com',
          name: 'siddhlinga',
          timezone: 'Asia/Kolkata',
        },
        bookings: [
          { user: { id: 'sid-user-id', email: 'kamathbro99@gmail.com', name: 'siddhlinga', timezone: 'Asia/Kolkata' } },
        ],
        batch: {
          id: 'delta-x-batch-1',
          name: 'DELTA X BATCH - Cohort 1',
          enrolments: [
            { user: { id: 'sahyadri-user-id', email: 'gagan.cs22@sahyadri.edu.in', name: 'sahyadri', timezone: 'Asia/Kolkata' } },
            { user: { id: 'other-user-id', email: 'other@example.com', name: 'Other Student', timezone: 'Asia/Kolkata' } },
          ],
        },
      };

      // Mock sweeps: Step 1 (activate: 0), Step 2 (complete: 0), Step 3 (24h: 0), Step 4 (1h: 0), Step 5 (10m: 1)
      prismaMock.session.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([oneOnOneStartingSoon]);

      prismaMock.notification.findFirst.mockResolvedValueOnce(null);

      const stats = await service.processLifecycleTransitions();

      expect(stats.reminders10mSent).toBe(1);
      // Verify ONLY the dedicated learner received the email, NOT sahyadri or cohort peers!
      expect(emailMock.sendTemplateEmail).toHaveBeenCalledTimes(1);
      expect(emailMock.sendTemplateEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'kamathbro99@gmail.com',
          subject: 'Reminder: 1-on-1 Coaching: siddhlinga starts in 10 minutes',
        }),
      );
      // Gagan / Sahyadri must NOT be notified
      expect(emailMock.sendTemplateEmail).not.toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'gagan.cs22@sahyadri.edu.in',
        }),
      );
    });

    it('does NOT leak Speaker Discovery Call reminders to cohort batch peers', async () => {
      const discoveryCall = {
        id: 'sess-discovery-1h',
        title: '1-to-1 Discovery Call: Roweena & Prospect',
        sessionType: SessionType.SPEAKER_DISCOVERY_CALL,
        userId: 'prospect-user-id',
        startTime: new Date('2026-10-20T10:45:00.000Z'),
        endTime: new Date('2026-10-20T11:00:00.000Z'),
        status: SessionStatus.SCHEDULED,
        user: {
          id: 'prospect-user-id',
          email: 'prospect@example.com',
          name: 'Prospect User',
          timezone: 'Asia/Dubai',
        },
        bookings: [],
        batch: {
          id: 'batch-leak-test',
          enrolments: [
            { user: { id: 'unrelated-1', email: 'unrelated@example.com', name: 'Unrelated' } },
          ],
        },
      };

      prismaMock.session.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([discoveryCall]) // Step 4 (1h)
        .mockResolvedValueOnce([]); // Step 5 (10m)

      prismaMock.notification.findFirst.mockResolvedValueOnce(null);

      const stats = await service.processLifecycleTransitions();

      expect(stats.reminders1hSent).toBe(1);
      expect(emailMock.sendTemplateEmail).toHaveBeenCalledTimes(1);
      expect(emailMock.sendTemplateEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'prospect@example.com',
          subject: 'Reminder: 1-to-1 Discovery Call: Roweena & Prospect starts in 1 hour',
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

    it('propagates transient database errors in activateSession and completeSession so BullMQ retries the job', async () => {
      prismaMock.session.findUnique = vi.fn().mockResolvedValue({
        id: 'sess-db-err',
        title: 'DB Error Session',
        startTime: new Date('2026-10-20T09:00:00.000Z'),
        endTime: new Date('2026-10-20T10:00:00.000Z'),
        status: SessionStatus.SCHEDULED,
        scheduleVersion: 1,
      });
      prismaMock.session.updateMany = vi
        .fn()
        .mockRejectedValueOnce(new Error('P1001: Can not reach database server'));

      await expect(service.activateSession('sess-db-err', 1)).rejects.toThrow(
        'P1001: Can not reach database server',
      );

      prismaMock.session.updateMany = vi
        .fn()
        .mockRejectedValueOnce(new Error('P2024: Connection pool timeout'));

      await expect(service.completeSession('sess-db-err', 1)).rejects.toThrow(
        'P2024: Connection pool timeout',
      );
    });

    it('safely ignores superseded scheduleVersion and removes prior version delayed jobs on reschedule', async () => {
      const removeFn = vi.fn().mockResolvedValue(undefined);
      const lifecycleQueueMock: any = {
        add: vi.fn().mockResolvedValue({ id: 'job-1' }),
        getJob: vi.fn().mockResolvedValue({ remove: removeFn }),
      };

      const queuedService = new SessionLifecycleService(
        prismaMock as any,
        reconciliationMock as any,
        emailMock as any,
        meetingProviderMock,
        calendarProviderMock,
        undefined,
        lifecycleQueueMock,
      );

      // Rescheduled session with scheduleVersion = 2 removes v1 delayed jobs and enqueues v2 jobs
      await queuedService.scheduleSessionJobs({
        id: 'sess-resched',
        startTime: new Date('2026-10-22T10:00:00.000Z'),
        endTime: new Date('2026-10-22T11:00:00.000Z'),
        scheduleVersion: 2,
      });

      expect(lifecycleQueueMock.getJob).toHaveBeenCalledWith('session-activate:sess-resched:1');
      expect(lifecycleQueueMock.getJob).toHaveBeenCalledWith('session-complete:sess-resched:1');
      expect(removeFn).toHaveBeenCalledTimes(5);
      expect(lifecycleQueueMock.add).toHaveBeenCalledWith(
        'activate-session',
        { sessionId: 'sess-resched', version: 2 },
        expect.objectContaining({
          jobId: 'session-activate:sess-resched:2',
          removeOnComplete: { count: 100, age: 86400 },
          removeOnFail: { count: 200, age: 604800 },
        }),
      );

      // Stale v1 job arriving after reschedule to v2 is a safe no-op
      prismaMock.session.findUnique = vi.fn().mockResolvedValueOnce({
        id: 'sess-resched',
        title: 'Rescheduled Session',
        startTime: new Date('2026-10-22T10:00:00.000Z'),
        endTime: new Date('2026-10-22T11:00:00.000Z'),
        status: SessionStatus.SCHEDULED,
        scheduleVersion: 2,
      });
      prismaMock.session.updateMany = vi.fn();

      const activated = await queuedService.activateSession('sess-resched', 1);
      expect(activated).toBe(false);
      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
    });
  });
});
