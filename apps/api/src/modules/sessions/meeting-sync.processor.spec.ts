import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { MeetingSyncProcessor } from './meeting-sync.processor.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MEETING_PROVIDER } from '../../common/interfaces/meeting-provider.interface.js';

describe('MeetingSyncProcessor', () => {
  let processor: MeetingSyncProcessor;
  let prismaMock: any;
  let meetingProviderMock: any;

  beforeEach(async () => {
    prismaMock = {
      session: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      outboxEvent: {
        findUnique: vi.fn().mockResolvedValue({ id: 'outbox-1', status: 'PENDING', payload: {} }),
        update: vi.fn(),
      },
    };

    meetingProviderMock = {
      createMeeting: vi.fn(),
      updateMeeting: vi.fn(),
      cancelMeeting: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MeetingSyncProcessor,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: MEETING_PROVIDER,
          useValue: meetingProviderMock,
        },
      ],
    }).compile();

    processor = module.get<MeetingSyncProcessor>(MeetingSyncProcessor);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('handleCreate', () => {
    it('creates a meeting and updates the session', async () => {
      const session = {
        id: 'sess-1',
        title: 'Test Session',
        startTime: new Date('2026-10-10T10:00:00Z'),
        endTime: new Date('2026-10-10T11:00:00Z'),
        timezone: 'UTC',
        joinUrl: null,
        meetingProvider: 'ZOOM',
      };
      prismaMock.session.findUnique.mockResolvedValueOnce(session);

      meetingProviderMock.createMeeting.mockResolvedValueOnce({
        id: 'zoom-123',
        joinUrl: 'https://zoom.us/j/123',
        startUrl: 'https://zoom.us/s/123',
      });

      await processor.process({ data: { outboxId: 'outbox-1', type: 'CREATE', sessionId: 'sess-1' } } as any);

      expect(meetingProviderMock.createMeeting).toHaveBeenCalledWith({
        topic: 'Test Session',
        startTime: session.startTime,
        durationMinutes: 60,
        timezone: 'UTC',
        referenceId: 'outbox-1',
      });

      expect(prismaMock.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'outbox-1' },
        data: expect.objectContaining({ providerId: 'zoom-123' }),
      });

      expect(prismaMock.session.update).toHaveBeenCalledWith({
        where: { id: 'sess-1' },
        data: {
          joinUrl: 'https://zoom.us/j/123',
          hostUrl: 'https://zoom.us/s/123',
          providerMeetingId: 'zoom-123',
          zoomMeetingId: 'zoom-123',
        },
      });
    });

    it('skips if session already has a joinUrl', async () => {
      const session = {
        id: 'sess-1',
        joinUrl: 'https://zoom.us/j/999',
        meetingProvider: 'ZOOM',
      };
      prismaMock.session.findUnique.mockResolvedValueOnce(session);

      await processor.process({ data: { outboxId: 'outbox-1', type: 'CREATE', sessionId: 'sess-1' } } as any);

      expect(meetingProviderMock.createMeeting).not.toHaveBeenCalled();
      expect(prismaMock.session.update).not.toHaveBeenCalled();
    });

    it('throws error and retries if Zoom fails during CREATE', async () => {
      const session = {
        id: 'sess-1',
        title: 'Test',
        startTime: new Date(),
        endTime: new Date(),
        joinUrl: null,
        meetingProvider: 'ZOOM',
      };
      prismaMock.session.findUnique.mockResolvedValueOnce(session);
      meetingProviderMock.createMeeting.mockRejectedValueOnce(new Error('Zoom failed'));

      await expect(processor.process({ data: { outboxId: 'outbox-1', type: 'CREATE', sessionId: 'sess-1' } } as any))
        .rejects.toThrow('Zoom failed');

      expect(prismaMock.session.update).not.toHaveBeenCalled();
      expect(prismaMock.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'outbox-1' },
        data: expect.objectContaining({ status: 'FAILED', error: 'Zoom failed' }),
      });
    });
  });

  describe('handleUpdate', () => {
    it('updates a meeting in zoom', async () => {
      const session = {
        id: 'sess-1',
        providerMeetingId: 'zoom-123',
      };
      prismaMock.session.findUnique.mockResolvedValueOnce(session);

      const payload = { topic: 'New Topic' };
      await processor.process({ data: { outboxId: 'outbox-1', type: 'UPDATE', sessionId: 'sess-1', payload } } as any);

      expect(meetingProviderMock.updateMeeting).toHaveBeenCalledWith('zoom-123', payload);
    });

    it('throws error if zoom fails during UPDATE', async () => {
      const session = {
        id: 'sess-1',
        providerMeetingId: 'zoom-123',
      };
      prismaMock.session.findUnique.mockResolvedValueOnce(session);
      meetingProviderMock.updateMeeting.mockRejectedValueOnce(new Error('Zoom failed'));

      const payload = { topic: 'New Topic' };
      await expect(processor.process({ data: { outboxId: 'outbox-1', type: 'UPDATE', sessionId: 'sess-1', payload } } as any))
        .rejects.toThrow('Zoom failed');
    });
  });

  describe('handleCancel', () => {
    it('cancels a meeting in zoom', async () => {
      await processor.process({ data: { outboxId: 'outbox-1', type: 'CANCEL', providerMeetingId: 'zoom-123' } } as any);

      expect(meetingProviderMock.cancelMeeting).toHaveBeenCalledWith('zoom-123');
    });

    it('swallows 404 not found if meeting already deleted', async () => {
      const notFoundError = new Error('Meeting Not Found');
      (notFoundError as any).status = 404;
      meetingProviderMock.cancelMeeting.mockRejectedValueOnce(notFoundError);

      await expect(processor.process({ data: { outboxId: 'outbox-1', type: 'CANCEL', providerMeetingId: 'zoom-123' } } as any))
        .resolves.toBeUndefined();
    });

    it('throws error for other failures during CANCEL', async () => {
      meetingProviderMock.cancelMeeting.mockRejectedValueOnce(new Error('Network error'));

      await expect(processor.process({ data: { outboxId: 'outbox-1', type: 'CANCEL', providerMeetingId: 'zoom-123' } } as any))
        .rejects.toThrow('Network error');
    });
  });

  describe('End-to-End Idempotency Recovery', () => {
    it('Zoom POST succeeds -> DB persistence fails -> retry reconciles without second POST', async () => {
      // 1. Setup real Zoom provider
      const { ZoomMeetingProvider } = await import('../zoom/zoom.service.js');
      const zoomProvider = new ZoomMeetingProvider();
      vi.spyOn(zoomProvider as any, 'getAccessToken').mockResolvedValue('fake-token');

      // Create a specific processor instance that uses the REAL zoom provider
      const realProcessor = new MeetingSyncProcessor(prismaMock as any, zoomProvider);
      
      const session = {
        id: 'sess-crash',
        title: 'Crash Session',
        startTime: new Date(),
        endTime: new Date(),
        timezone: 'UTC',
        joinUrl: null,
        meetingProvider: 'ZOOM',
      };
      
      // We will simulate process() twice.
      // Call 1: DB persistence fails
      // Call 2: DB persistence succeeds
      prismaMock.session.findUnique.mockResolvedValue(session);
      prismaMock.session.update
        .mockRejectedValueOnce(new Error('DB connection closed!')) // FAILS first time!
        .mockResolvedValueOnce(session); // Succeeds second time

      global.fetch = vi.fn() as any;

      // Mock Call 1 Fetches (Worker A, outbox PENDING, creates meeting A)
      // 1. GET list to check idempotency (returns empty/not found)
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ meetings: [] }),
      });
      // 2. POST to create meeting
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          id: 555666777,
          join_url: 'https://zoom.us/j/555666777',
          start_url: 'https://zoom.us/s/555666777',
          password: 'pass',
        }),
      });

      // Call 1: Processor processes the job
      await expect(realProcessor.process({ data: { outboxId: 'outbox-1', type: 'CREATE', sessionId: 'sess-crash' } } as any))
        .rejects.toThrow('DB connection closed!');

      // Verify that POST was called
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(global.fetch).toHaveBeenNthCalledWith(1, expect.stringContaining('/users/me/meetings?type=scheduled'), expect.objectContaining({ method: 'GET' }));
      expect(global.fetch).toHaveBeenNthCalledWith(2, expect.stringContaining('/users/me/meetings'), expect.objectContaining({ method: 'POST' }));

      // NOW we retry the job! 
      // The outbox is still PENDING because the DB commit failed (simulated).
      // Mock Call 2 Fetches: 
      // GET /users/me/meetings?type=scheduled... (returns the meeting from call 1)
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          meetings: [{ id: 555666777, agenda: 'outbox-1' }]
        }),
      });
      // GET /meetings/555666777
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 555666777,
          join_url: 'https://zoom.us/j/555666777',
          start_url: 'https://zoom.us/s/555666777',
          password: 'pass',
        }),
      });

      // Call 2: Processor processes the job (RETRY)
      await realProcessor.process({ data: { outboxId: 'outbox-1', type: 'CREATE', sessionId: 'sess-crash' } } as any);

      // Verify total fetch calls
      expect(global.fetch).toHaveBeenCalledTimes(4); 
      // POST, GET (list), GET (details). 
      // NO SECOND POST!
      const postCalls = (global.fetch as any).mock.calls.filter((c: any) => c[1]?.method === 'POST');
      expect(postCalls.length).toBe(1);

      // Verify the final persistence update succeeded with the right details
      expect(prismaMock.session.update).toHaveBeenCalledWith({
        where: { id: 'sess-crash' },
        data: expect.objectContaining({ providerMeetingId: '555666777', zoomMeetingId: '555666777' })
      });
      expect(prismaMock.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'outbox-1' },
        data: expect.objectContaining({ providerId: '555666777' })
      });
      expect(prismaMock.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'outbox-1' },
        data: expect.objectContaining({ status: 'COMPLETED' })
      });
    });

    it('marks unknown action type as terminal FAILED and clears lease so it is not stuck in PROCESSING', async () => {
      await processor.process({
        data: { outboxId: 'outbox-1', type: 'UNKNOWN_INVALID_ACTION', sessionId: 'sess-1' },
      } as any);

      expect(prismaMock.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'outbox-1' },
        data: expect.objectContaining({
          status: 'FAILED',
          leasedUntil: null,
          attempts: 999,
          lastError: expect.stringContaining('Unknown meeting sync type'),
        }),
      });
    });

    it('marks retry-exhausted events (attempts >= 5) as terminal with nextAttemptAt: null', async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce({
        id: 'sess-fail',
        title: 'Failing Session',
        startTime: new Date('2026-10-10T10:00:00Z'),
        endTime: new Date('2026-10-10T11:00:00Z'),
        timezone: 'UTC',
        joinUrl: null,
        meetingProvider: 'ZOOM',
      });
      prismaMock.outboxEvent.findUnique.mockResolvedValueOnce({
        id: 'outbox-exhausted',
        status: 'PROCESSING',
        attempts: 4, // Next attempt will be 5
      });
      meetingProviderMock.createMeeting.mockRejectedValueOnce(new Error('Fatal external error'));

      await expect(
        processor.process({
          data: { outboxId: 'outbox-exhausted', type: 'CREATE', sessionId: 'sess-fail' },
        } as any),
      ).rejects.toThrow('Fatal external error');

      expect(prismaMock.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'outbox-exhausted' },
        data: expect.objectContaining({
          status: 'FAILED',
          nextAttemptAt: null, // Terminal: do not retry
          leasedUntil: null,
        }),
      });
    });
  });
});
