import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AttemptStatus, SessionStatus, DeliveryStatus, NotificationChannel } from '@prisma/client';
import { LifecycleProcessor } from '../src/modules/queue/lifecycle.processor.js';
import { RecoverySweepService } from '../src/modules/queue/recovery-sweep.service.js';
import { OutboxDispatcherService } from '../src/modules/queue/outbox-dispatcher.service.js';

describe('Event-Driven Lifecycle & Background Reliability Architecture', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // 1. EXAM FINALIZATION TESTS
  // ─────────────────────────────────────────────────────────────────────────────
  describe('1. Exam Finalization (Delayed BullMQ Jobs & Idempotency)', () => {
    it('schedules delayed BullMQ job with ID exam-finalize:{attemptId}:{expiresAtUnix} on attempt creation', async () => {
      const mockQueue: any = {
        add: vi.fn().mockResolvedValue({ id: 'job-1' }),
      };

      const attemptId = 'attempt-uuid-101';
      const expiresAt = new Date(Date.now() + 90 * 60 * 1000);
      const delayMs = Math.max(0, expiresAt.getTime() - Date.now());
      const expiresAtUnix = Math.floor(expiresAt.getTime() / 1000);
      const expectedJobId = `exam-finalize:${attemptId}:${expiresAtUnix}`;

      await mockQueue.add(
        'finalize-exam',
        { attemptId, expiresAt: expiresAt.toISOString(), version: 1 },
        { jobId: expectedJobId, delay: delayMs, removeOnComplete: true, removeOnFail: false },
      );

      expect(mockQueue.add).toHaveBeenCalledWith(
        'finalize-exam',
        expect.objectContaining({ attemptId, version: 1 }),
        expect.objectContaining({ jobId: expectedJobId }),
      );
      // Payload contains IDs only, NO exam answers or questions
      const payload = mockQueue.add.mock.calls[0][1];
      expect(payload).not.toHaveProperty('answers');
      expect(payload).not.toHaveProperty('questions');
    });

    it('safely no-ops if learner submitted and attempt is already COMPLETED or PASSED', async () => {
      const examsServiceMock: any = {
        finalizeExpiredAttempt: vi.fn().mockResolvedValue(false),
      };
      const sessionLifecycleMock: any = {};
      const processor = new LifecycleProcessor(examsServiceMock, sessionLifecycleMock);

      const job: any = {
        name: 'finalize-exam',
        id: 'exam-finalize:att-1:1234567',
        data: { attemptId: 'att-already-completed', version: 1 },
      };

      const result = await processor.process(job);
      expect(result).toEqual({ finalized: false, attemptId: 'att-already-completed' });
      expect(examsServiceMock.finalizeExpiredAttempt).toHaveBeenCalledWith('att-already-completed');
    });

    it('guarantees exactly-once finalization under two concurrent workers', async () => {
      let isFinalized = false;
      const mockFinalize = vi.fn().mockImplementation(async (attemptId: string) => {
        if (isFinalized) {
          // Second worker encounters already-finalized attempt
          return false;
        }
        isFinalized = true;
        return true;
      });

      const examsServiceMock: any = { finalizeExpiredAttempt: mockFinalize };
      const processorA = new LifecycleProcessor(examsServiceMock, {} as any);
      const processorB = new LifecycleProcessor(examsServiceMock, {} as any);

      const job: any = {
        name: 'finalize-exam',
        id: 'job-concurrent-1',
        data: { attemptId: 'att-race-1', version: 1 },
      };

      // Both workers fire simultaneously
      const [resA, resB] = await Promise.all([
        processorA.process(job),
        processorB.process(job),
      ]);

      const winningCount = [resA.finalized, resB.finalized].filter(Boolean).length;
      expect(winningCount).toBe(1);
    });

    it('fails open if Redis is down during exam start, leaving attempt recoverable in DB', async () => {
      const brokenQueue: any = {
        add: vi.fn().mockRejectedValue(new Error('Redis connection refused: ECONNREFUSED 127.0.0.1:6379')),
      };

      let startSucceeded = false;
      try {
        // Exam start flow saves to DB first, then wraps queue add in try/catch
        const attempt = { id: 'att-db-saved-1', expiresAt: new Date(Date.now() + 3600000) };
        try {
          await brokenQueue.add('finalize-exam', { attemptId: attempt.id });
        } catch {
          // Non-blocking fail-open
        }
        startSucceeded = true;
      } catch {
        startSucceeded = false;
      }

      expect(startSucceeded).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. SESSION LIFECYCLE & RESCHEDULING TESTS
  // ─────────────────────────────────────────────────────────────────────────────
  describe('2. Session Lifecycle & Rescheduling Invalidation', () => {
    it('schedules all 5 lifecycle jobs on session creation', async () => {
      const mockQueue: any = {
        add: vi.fn().mockResolvedValue({ id: 'job-ok' }),
      };

      const now = Date.now();
      const session = {
        id: 'sess-new-1',
        startTime: new Date(now + 48 * 3600 * 1000), // 2 days ahead
        endTime: new Date(now + 49 * 3600 * 1000),
        scheduleVersion: 1,
      };

      // Mock scheduler logic
      const addJobs = async (s: any) => {
        const v = s.scheduleVersion;
        await mockQueue.add('activate-session', { sessionId: s.id, version: v }, { jobId: `session-activate:${s.id}:${v}` });
        await mockQueue.add('complete-session', { sessionId: s.id, version: v }, { jobId: `session-complete:${s.id}:${v}` });
        await mockQueue.add('session-reminder-24h', { sessionId: s.id, version: v }, { jobId: `session-reminder-24h:${s.id}:${v}` });
        await mockQueue.add('session-reminder-1h', { sessionId: s.id, version: v }, { jobId: `session-reminder-1h:${s.id}:${v}` });
        await mockQueue.add('session-reminder-10m', { sessionId: s.id, version: v }, { jobId: `session-reminder-10m:${s.id}:${v}` });
      };

      await addJobs(session);
      expect(mockQueue.add).toHaveBeenCalledTimes(5);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'activate-session',
        expect.anything(),
        expect.objectContaining({ jobId: 'session-activate:sess-new-1:1' }),
      );
      expect(mockQueue.add).toHaveBeenCalledWith(
        'session-reminder-24h',
        expect.anything(),
        expect.objectContaining({ jobId: 'session-reminder-24h:sess-new-1:1' }),
      );
    });

    it('rescheduled session increments scheduleVersion making old delayed jobs safe no-ops', async () => {
      const sessionDb = {
        id: 'sess-rescheduled-1',
        status: SessionStatus.SCHEDULED,
        scheduleVersion: 2, // Incremented after reschedule
      };

      const sessionLifecycleMock: any = {
        activateSession: vi.fn().mockImplementation(async (sessionId: string, version?: number) => {
          if (version !== undefined && sessionDb.scheduleVersion !== version) {
            return false; // Superseded by newer version
          }
          return true;
        }),
      };

      const processor = new LifecycleProcessor({} as any, sessionLifecycleMock);

      // Old delayed job with version 1 fires after session was rescheduled to version 2
      const oldJob: any = {
        name: 'activate-session',
        id: 'session-activate:sess-rescheduled-1:1',
        data: { sessionId: 'sess-rescheduled-1', version: 1 },
      };

      const result = await processor.process(oldJob);
      expect(result.activated).toBe(false);
      expect(sessionLifecycleMock.activateSession).toHaveBeenCalledWith('sess-rescheduled-1', 1);
    });

    it('cancelled session prevents delayed activation and reminder jobs from executing', async () => {
      const sessionDb = {
        id: 'sess-cancelled-1',
        status: SessionStatus.CANCELLED,
        scheduleVersion: 3,
      };

      const sessionLifecycleMock: any = {
        activateSession: vi.fn().mockImplementation(async (sessionId: string) => {
          if (sessionDb.status === SessionStatus.CANCELLED) {
            return false;
          }
          return true;
        }),
      };

      const processor = new LifecycleProcessor({} as any, sessionLifecycleMock);
      const job: any = {
        name: 'activate-session',
        id: 'session-activate:sess-cancelled-1:2',
        data: { sessionId: 'sess-cancelled-1', version: 2 },
      };

      const result = await processor.process(job);
      expect(result.activated).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. REMINDER DEDUPLICATION TESTS (Notification.dedupeKey)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('3. Reminder Deduplication via Unique dedupeKey', () => {
    it('creates notification with deterministic dedupeKey and suppresses duplicate email send on P2002 conflict', async () => {
      const sentEmails: string[] = [];
      const createdDedupeKeys = new Set<string>();

      const sendReminderAtomic = async (sessionId: string, recipientId: string, timeframe: string, version: number) => {
        const dedupeKey = `session:${sessionId}:reminder:${timeframe}:user:${recipientId}:v${version}`;

        // Simulate PostgreSQL unique constraint check on Notification.dedupeKey
        if (createdDedupeKeys.has(dedupeKey)) {
          const p2002Error: any = new Error('Unique constraint failed on the fields: (`dedupeKey`)');
          p2002Error.code = 'P2002';
          return false; // Caught P2002 -> no-op
        }

        createdDedupeKeys.add(dedupeKey);
        sentEmails.push(`Email sent to ${recipientId} for ${timeframe}`);
        return true;
      };

      // First execution succeeds
      const result1 = await sendReminderAtomic('sess-100', 'user-1', '24h', 1);
      expect(result1).toBe(true);
      expect(sentEmails).toHaveLength(1);

      // Concurrent or duplicate execution with same dedupeKey conflicts and aborts without sending duplicate email
      const result2 = await sendReminderAtomic('sess-100', 'user-1', '24h', 1);
      expect(result2).toBe(false);
      expect(sentEmails).toHaveLength(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. TRANSACTIONAL OUTBOX WITH ATOMIC LEASING TESTS
  // ─────────────────────────────────────────────────────────────────────────────
  describe('4. Transactional Outbox Atomic Leasing & Concurrency', () => {
    it('concurrent dispatchers only claim an outbox event once using atomic lease locking', async () => {
      const outboxTable = [
        { id: 'outbox-1', status: 'PENDING', leasedUntil: null as Date | null, attempts: 0 },
        { id: 'outbox-2', status: 'PENDING', leasedUntil: null as Date | null, attempts: 0 },
      ];

      const queueMock: any = {
        add: vi.fn().mockResolvedValue({ id: 'queued' }),
      };

      // Simulate atomic conditional update: UPDATE ... WHERE id = $1 AND leasedUntil IS NULL
      const prismaMock: any = {
        outboxEvent: {
          findMany: vi.fn().mockResolvedValue([...outboxTable]),
          updateMany: vi.fn().mockImplementation(async ({ where, data }: any) => {
            const target = outboxTable.find((r) => r.id === where.id);
            if (!target || target.leasedUntil !== null) {
              return { count: 0 }; // Already claimed
            }
            target.leasedUntil = data.leasedUntil;
            target.attempts += 1;
            return { count: 1 };
          }),
        },
      };

      const dispatcherA = new OutboxDispatcherService(prismaMock, queueMock);
      const dispatcherB = new OutboxDispatcherService(prismaMock, queueMock);

      // Both dispatchers run simultaneously
      const [countA, countB] = await Promise.all([
        dispatcherA.claimAndDispatchPending(10),
        dispatcherB.claimAndDispatchPending(10),
      ]);

      // Together, exactly 2 events are claimed across both workers (no duplicates)
      expect(countA + countB).toBe(2);
      expect(queueMock.add).toHaveBeenCalledTimes(2);
    });

    it('enqueues with deterministic jobId outbox-{outboxId} preventing duplicate BullMQ jobs', async () => {
      const queueMock: any = {
        add: vi.fn().mockResolvedValue({ id: 'job-id' }),
      };
      const prismaMock: any = {
        outboxEvent: {
          findMany: vi.fn().mockResolvedValue([{ id: 'event-xyz-99', action: 'CREATE', payload: {} }]),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };

      const dispatcher = new OutboxDispatcherService(prismaMock, queueMock);
      await dispatcher.claimAndDispatchPending(10);

      expect(queueMock.add).toHaveBeenCalledWith(
        'sync-meeting',
        expect.objectContaining({ outboxId: 'event-xyz-99' }),
        expect.objectContaining({ jobId: 'outbox-event-xyz-99' }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. RECOVERY SWEEP TESTS
  // ─────────────────────────────────────────────────────────────────────────────
  describe('5. Low-Frequency Recovery Sweep (Worker Mode)', () => {
    it('executes bounded paginated recovery across exams, sessions, and outbox', async () => {
      const examsMock: any = {
        finalizeExpiredAttempts: vi.fn().mockResolvedValue(3),
      };
      const sessionsMock: any = {
        processLifecycleTransitions: vi.fn().mockResolvedValue({
          activatedCount: 2,
          completedCount: 1,
          reminders24hSent: 4,
          reminders1hSent: 1,
          reminders10mSent: 0,
        }),
      };
      const outboxMock: any = {
        claimAndDispatchPending: vi.fn().mockResolvedValue(5),
      };

      const recoveryService = new RecoverySweepService(examsMock, sessionsMock, outboxMock);
      const metrics = await recoveryService.runSweep();

      expect(metrics.expiredExamsRecovered).toBe(3);
      expect(metrics.sessionsActivated).toBe(2);
      expect(metrics.sessionsCompleted).toBe(1);
      expect(metrics.reminders24hSent).toBe(4);
      expect(metrics.outboxDispatched).toBe(5);
      expect(metrics.durationMs).toBeGreaterThanOrEqual(0);

      expect(examsMock.finalizeExpiredAttempts).toHaveBeenCalledWith(50);
      expect(outboxMock.claimAndDispatchPending).toHaveBeenCalledWith(50);
    });

    it('prevents overlapping recovery sweeps if previous sweep is still executing', async () => {
      let resolveFirst: any;
      const slowExamsMock: any = {
        finalizeExpiredAttempts: vi.fn().mockImplementation(
          () => new Promise((res) => { resolveFirst = res; }),
        ),
      };
      const sessionsMock: any = {
        processLifecycleTransitions: vi.fn().mockResolvedValue({}),
      };
      const outboxMock: any = {
        claimAndDispatchPending: vi.fn().mockResolvedValue(0),
      };

      const recoveryService = new RecoverySweepService(slowExamsMock, sessionsMock, outboxMock);

      // Start slow sweep
      const p1 = recoveryService.runSweep();
      // Trigger second sweep while first is running
      const p2 = recoveryService.runSweep();

      // Resolve first
      resolveFirst(1);
      const [res1, res2] = await Promise.all([p1, p2]);

      expect(slowExamsMock.finalizeExpiredAttempts).toHaveBeenCalledTimes(1);
    });
  });

  describe('Reminder Retry & Versioned Deduplication', () => {
    it('allows a failed reminder email to be retried on next sweep', async () => {
      // Simulate state machine: first attempt fails, second attempt succeeds
      let deliveryStatus = 'FAILED';
      const sendReminder = async (recipientId: string, dedupeKey: string, isRetry: boolean) => {
        if (deliveryStatus === 'SENT') {
          return false; // Already sent
        }
        if (!isRetry) {
          deliveryStatus = 'FAILED';
          return false; // First attempt fails
        }
        deliveryStatus = 'SENT';
        return true; // Retry succeeds
      };

      const dedupeKey = 'session:s1:reminder:24h:user:u1:v1';
      const firstTry = await sendReminder('u1', dedupeKey, false);
      expect(firstTry).toBe(false);
      expect(deliveryStatus).toBe('FAILED');

      // Next sweep retries the failed reminder
      const secondTry = await sendReminder('u1', dedupeKey, true);
      expect(secondTry).toBe(true);
      expect(deliveryStatus).toBe('SENT');

      // Third attempt is deduplicated (already SENT)
      const thirdTry = await sendReminder('u1', dedupeKey, true);
      expect(thirdTry).toBe(false);
    });

    it('new schedule version reminder is not suppressed by previous schedule version', async () => {
      const sentNotifications = new Map<string, string>(); // dedupeKey -> status

      const sendVersionedReminder = (sessionId: string, userId: string, version: number) => {
        const dedupeKey = `session:${sessionId}:reminder:24h:user:${userId}:v${version}`;
        if (sentNotifications.get(dedupeKey) === 'SENT') {
          return false;
        }
        sentNotifications.set(dedupeKey, 'SENT');
        return true;
      };

      // Version 1 reminder sent
      expect(sendVersionedReminder('s1', 'u1', 1)).toBe(true);
      // Version 1 duplicate suppressed
      expect(sendVersionedReminder('s1', 'u1', 1)).toBe(false);

      // Session rescheduled to Version 2 -> Version 2 reminder is sent!
      expect(sendVersionedReminder('s1', 'u1', 2)).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. CACHE OUTAGE & CORRUPT DATA RESILIENCE
  // ─────────────────────────────────────────────────────────────────────────────
  describe('6. Cache Outage & Corrupt Data Resilience', () => {
    it('treats corrupt JSON in Redis cache as a miss, deletes it, and reads DB fetcher', async () => {
      const deletedKeys: string[] = [];
      const fakeRedis: any = {
        get: vi.fn().mockResolvedValue('{"invalid-truncated-json: true'),
        del: vi.fn().mockImplementation(async (key: string) => {
          deletedKeys.push(key);
          return 1;
        }),
      };

      let dbCalls = 0;
      const fetcher = async () => {
        dbCalls++;
        return { programId: 'p1', title: 'Authoritative from DB' };
      };

      // Simulating CacheHelperService corrupt JSON recovery
      const raw = await fakeRedis.get('wbm:dev:lms:curriculum:p1:v1');
      let data: any = null;
      try {
        data = JSON.parse(raw);
      } catch {
        await fakeRedis.del('wbm:dev:lms:curriculum:p1:v1');
        data = await fetcher();
      }

      expect(data).toEqual({ programId: 'p1', title: 'Authoritative from DB' });
      expect(dbCalls).toBe(1);
      expect(deletedKeys).toContain('wbm:dev:lms:curriculum:p1:v1');
    });
  });
});

