import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OutboxDispatcherService } from './outbox-dispatcher.service.js';

describe('OutboxDispatcherService — Multi-Worker Outbox Claim & Recovery', () => {
  let dispatcher: OutboxDispatcherService;
  let prismaMock: any;
  let queueMock: any;

  beforeEach(() => {
    prismaMock = {
      outboxEvent: {
        findMany: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    queueMock = {
      add: vi.fn().mockResolvedValue({ id: 'job-1' }),
    };

    dispatcher = new OutboxDispatcherService(prismaMock as any, queueMock as any);
    vi.spyOn(dispatcher['logger'], 'error').mockImplementation(() => {});
    vi.spyOn(dispatcher['logger'], 'log').mockImplementation(() => {});
  });

  it('claims and dispatches eligible PENDING outbox events with deterministic job IDs without double-incrementing attempts', async () => {
    const mockEvents = [
      { id: 'event-1', action: 'CREATE', status: 'PENDING', payload: { foo: 'bar' } },
    ];
    prismaMock.outboxEvent.findMany.mockResolvedValueOnce(mockEvents);

    const count = await dispatcher.claimAndDispatchPending(50);

    expect(count).toBe(1);
    expect(prismaMock.outboxEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          attempts: { lt: 5 },
          OR: expect.arrayContaining([
            expect.objectContaining({ status: 'PENDING' }),
          ]),
        }),
        take: 50,
      }),
    );

    expect(prismaMock.outboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'event-1',
          status: 'PENDING',
        }),
        data: expect.objectContaining({
          status: 'PENDING',
          leasedUntil: expect.any(Date),
          enqueuedAt: expect.any(Date),
        }),
      }),
    );
    // Attempts must NOT be incremented during enqueue claim (MeetingSyncProcessor increments on execution)
    const claimCallData = prismaMock.outboxEvent.updateMany.mock.calls[0][0].data;
    expect(claimCallData.attempts).toBeUndefined();

    expect(queueMock.add).toHaveBeenCalledWith(
      'sync-meeting',
      expect.objectContaining({ outboxId: 'event-1', type: 'CREATE', foo: 'bar' }),
      expect.objectContaining({
        jobId: 'outbox-event-1',
        removeOnComplete: expect.anything(),
        removeOnFail: expect.anything(),
      }),
    );
  });

  it('recovers stale PROCESSING events whose worker lease has expired', async () => {
    const staleEvents = [
      { id: 'stale-1', action: 'CREATE', status: 'PROCESSING', payload: { sessionId: 'sess-1' } },
    ];
    prismaMock.outboxEvent.findMany.mockResolvedValueOnce(staleEvents);

    const count = await dispatcher.claimAndDispatchPending(50);

    expect(count).toBe(1);
    expect(prismaMock.outboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'stale-1',
          status: 'PROCESSING',
        }),
        data: expect.objectContaining({
          status: 'PENDING',
          leasedUntil: expect.any(Date),
        }),
      }),
    );
    expect(queueMock.add).toHaveBeenCalledWith(
      'sync-meeting',
      expect.objectContaining({ outboxId: 'stale-1' }),
      expect.objectContaining({ jobId: 'outbox-stale-1' }),
    );
  });

  it('recovers retryable FAILED events after backoff', async () => {
    const failedEvents = [
      { id: 'failed-1', action: 'UPDATE', status: 'FAILED', payload: { sessionId: 'sess-2' } },
    ];
    prismaMock.outboxEvent.findMany.mockResolvedValueOnce(failedEvents);

    const count = await dispatcher.claimAndDispatchPending(50);

    expect(count).toBe(1);
    expect(prismaMock.outboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'failed-1',
          status: 'FAILED',
        }),
      }),
    );
  });

  it('handles concurrent recovery claims safely (skips when another worker or direct producer already leased row)', async () => {
    const candidate = [
      { id: 'event-race', action: 'CREATE', status: 'PENDING', payload: {} },
    ];
    prismaMock.outboxEvent.findMany.mockResolvedValueOnce(candidate);
    // Concurrent worker or direct SessionsService lease won the updateMany race -> count is 0
    prismaMock.outboxEvent.updateMany.mockResolvedValueOnce({ count: 0 });

    const count = await dispatcher.claimAndDispatchPending(50);

    expect(count).toBe(0);
    expect(queueMock.add).not.toHaveBeenCalled();
  });

  it('does not claim terminal events that exceeded max attempts (lt: 5 query constraint)', async () => {
    prismaMock.outboxEvent.findMany.mockResolvedValueOnce([]);

    const count = await dispatcher.claimAndDispatchPending(50);

    expect(count).toBe(0);
    expect(prismaMock.outboxEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          attempts: { lt: 5 },
        }),
      }),
    );
  });

  it('releases lease, increments attempts, and schedules backoff when BullMQ enqueue fails', async () => {
    const mockEvents = [
      { id: 'event-err', action: 'CANCEL', status: 'PENDING', payload: {} },
    ];
    prismaMock.outboxEvent.findMany.mockResolvedValueOnce(mockEvents);
    queueMock.add.mockRejectedValueOnce(new Error('Redis connection refused'));

    const count = await dispatcher.claimAndDispatchPending(50);

    expect(count).toBe(0);
    expect(prismaMock.outboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'event-err' },
        data: expect.objectContaining({
          status: 'FAILED',
          leasedUntil: null,
          attempts: { increment: 1 },
          lastError: 'Redis connection refused',
          nextAttemptAt: expect.any(Date),
        }),
      }),
    );
  });

  it('uses deterministic job IDs across multiple dispatch calls', async () => {
    const mockEvents = [
      { id: 'event-idem', action: 'CREATE', status: 'PENDING', payload: {} },
    ];
    prismaMock.outboxEvent.findMany.mockResolvedValue(mockEvents);

    await dispatcher.claimAndDispatchPending(50);
    await dispatcher.claimAndDispatchPending(50);

    expect(queueMock.add).toHaveBeenCalledTimes(2);
    expect(queueMock.add).toHaveBeenNthCalledWith(
      1,
      'sync-meeting',
      expect.anything(),
      expect.objectContaining({ jobId: 'outbox-event-idem' }),
    );
    expect(queueMock.add).toHaveBeenNthCalledWith(
      2,
      'sync-meeting',
      expect.anything(),
      expect.objectContaining({ jobId: 'outbox-event-idem' }),
    );
  });
});
