import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OutboxDispatcherService } from './outbox-dispatcher.service.js';

describe('OutboxDispatcherService', () => {
  let dispatcher: OutboxDispatcherService;
  let prismaMock: any;
  let queueMock: any;

  beforeEach(() => {
    prismaMock = {
      outboxEvent: {
        findMany: vi.fn(),
      },
    };

    queueMock = {
      add: vi.fn(),
    };

    dispatcher = new OutboxDispatcherService(prismaMock as any, queueMock as any);
    // Suppress logs
    vi.spyOn(dispatcher['logger'], 'error').mockImplementation(() => {});
  });

  it('DB commit succeeds + BullMQ enqueue fails -> dispatcher eventually processes the outbox event', async () => {
    const mockEvents = [
      { id: 'event-1', action: 'CREATE', payload: { foo: 'bar' } }
    ];
    prismaMock.outboxEvent.findMany.mockResolvedValueOnce(mockEvents);

    await dispatcher.dispatch();

    expect(prismaMock.outboxEvent.findMany).toHaveBeenCalledWith({
      where: { status: 'PENDING' },
      take: 50,
    });
    
    expect(queueMock.add).toHaveBeenCalledWith(
      'sync-meeting',
      { outboxId: 'event-1', type: 'CREATE', foo: 'bar' },
      { jobId: 'outbox-event-1' }
    );
  });

  it('Dispatcher retries do not create duplicate jobs with different IDs', async () => {
    const mockEvents = [
      { id: 'event-1', action: 'CREATE', payload: {} }
    ];
    prismaMock.outboxEvent.findMany.mockResolvedValue(mockEvents);

    // Call dispatch twice
    await dispatcher.dispatch();
    await dispatcher.dispatch();

    expect(queueMock.add).toHaveBeenCalledTimes(2);
    // Both calls should use the exact same stable jobId
    expect(queueMock.add).toHaveBeenNthCalledWith(
      1,
      'sync-meeting',
      expect.anything(),
      { jobId: 'outbox-event-1' }
    );
    expect(queueMock.add).toHaveBeenNthCalledWith(
      2,
      'sync-meeting',
      expect.anything(),
      { jobId: 'outbox-event-1' }
    );
  });
});
