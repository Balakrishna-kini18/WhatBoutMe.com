import { Test, TestingModule } from '@nestjs/testing';
import { QueueEventsService } from './queue-events.service.js';
import { QueueEvents } from 'bullmq';

vi.mock('bullmq', () => {
  const QueueEventsMock = vi.fn();

  QueueEventsMock.prototype.on = vi.fn(function (this: any, event: string, callback: any) {
    if (!this.listeners) this.listeners = {};
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  });

  QueueEventsMock.prototype.close = vi.fn();

  QueueEventsMock.prototype.simulateEvent = function (event: string, payload: any) {
    if (this.listeners && this.listeners[event]) {
      this.listeners[event].forEach((cb: any) => cb(payload));
    }
  };

  return { QueueEvents: QueueEventsMock };
});

describe('QueueEventsService', () => {
  let service: QueueEventsService;
  const originalConsoleError = console.error;
  let consoleErrorMock: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [QueueEventsService],
    }).compile();

    service = module.get<QueueEventsService>(QueueEventsService);
    consoleErrorMock = vi.fn();
    console.error = consoleErrorMock;
  });

  afterEach(() => {
    console.error = originalConsoleError;
    vi.clearAllMocks();
  });

  describe('Dead-Letter Handling & Prefix Alignment', () => {
    it('registers listeners for all 8 standard queues with matching wbm:{env}:queue prefix', () => {
      const expectedPrefix = `wbm:${process.env.NODE_ENV || 'development'}:queue`;
      service.onModuleInit();

      expect(QueueEvents).toHaveBeenCalledTimes(8);
      expect(QueueEvents).toHaveBeenCalledWith(
        'email',
        expect.objectContaining({
          prefix: expectedPrefix,
          connection: expect.objectContaining({
            maxRetriesPerRequest: null,
          }),
        }),
      );
      expect(QueueEvents).toHaveBeenCalledWith(
        'invoice-gen',
        expect.objectContaining({
          prefix: expectedPrefix,
        }),
      );
    });

    it('logs a strict DEAD-LETTER error when a job fully fails', () => {
      service.onModuleInit();

      const mockQueueEventsInstance = vi.mocked(QueueEvents).mock.results[0].value;

      mockQueueEventsInstance.simulateEvent('failed', {
        jobId: 'email:welcome:user-123',
        failedReason: 'SMTP server timed out after 3 retries',
      });

      expect(consoleErrorMock).toHaveBeenCalledWith(
        `[DEAD-LETTER] Job email:welcome:user-123 in queue "email" completely failed: SMTP server timed out after 3 retries`,
      );
    });

    it('properly logs internal Queue errors (e.g. Redis disconnects)', () => {
      service.onModuleInit();
      const mockQueueEventsInstance = vi.mocked(QueueEvents).mock.results[0].value;

      const mockError = new Error('Redis connection lost');
      mockQueueEventsInstance.simulateEvent('error', mockError);

      expect(consoleErrorMock).toHaveBeenCalledWith(
        `[QUEUE-ERROR] Queue "email" encountered an internal error:`,
        mockError,
      );
    });

    it('gracefully closes all listeners on module destroy', async () => {
      service.onModuleInit();
      const mockInstances = vi.mocked(QueueEvents).mock.results.map((r) => r.value);

      await service.onModuleDestroy();

      mockInstances.forEach((instance) => {
        expect(instance.close).toHaveBeenCalled();
      });
    });
  });
});
