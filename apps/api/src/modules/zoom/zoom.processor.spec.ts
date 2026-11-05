import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ZoomProcessor, buildZoomEventKey } from './zoom.processor.js';
import { ZoomMeetingProvider } from './zoom.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AttendanceReconciliationService } from '../sessions/attendance-reconciliation.service.js';
import { Job } from 'bullmq';

describe('ZoomProcessor - Automated Meeting & Attendance Processing', () => {
  let processor: ZoomProcessor;
  let zoomServiceMock: any;
  let prismaMock: any;
  let reconciliationMock: any;

  beforeEach(() => {
    zoomServiceMock = {
      getParticipantReport: vi.fn(),
      getRecordingUrl: vi.fn(),
    };

    prismaMock = {
      session: {
        findFirst: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      webhookEvent: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'wh-1', status: 'PROCESSED' }),
      },
    };

    reconciliationMock = {
      reconcileSession: vi.fn(),
    };

    const sessionsServiceMock = {
      triggerMissedSessionNotifications: vi.fn().mockResolvedValue(undefined),
    };

    processor = new ZoomProcessor(
      zoomServiceMock as unknown as ZoomMeetingProvider,
      prismaMock as unknown as PrismaService,
      reconciliationMock as unknown as AttendanceReconciliationService,
      sessionsServiceMock as any,
    );
  });

  const createJob = (event: string, objectPayload: any, eventTs?: number): Job =>
    ({
      id: 'zoom-job-1',
      data: {
        event,
        event_ts: eventTs,
        payload: {
          object: objectPayload,
        },
      },
    }) as unknown as Job;

  describe('Deterministic Event Key & Retry Idempotency', () => {
    it('builds a deterministic eventKey without Date.now() fallback across retries', () => {
      const payload = {
        event: 'meeting.ended',
        payload: { object: { id: 987654321, uuid: 'uuid-abc' } },
      };
      const key1 = buildZoomEventKey(payload);
      const key2 = buildZoomEventKey(payload);
      expect(key1).toBe(key2);
      expect(key1).toContain('meeting.ended:uuid-abc:');
    });

    it('rolls back attendancePulled and does NOT mark WebhookEvent PROCESSED when getParticipantReport fails on attempt 1, then succeeds on attempt 2', async () => {
      const mockSession = {
        id: 'sess-retry',
        batchId: 'batch-1',
        providerMeetingId: '987654321',
      };
      prismaMock.session.findFirst.mockResolvedValue(mockSession);

      // Attempt 1: Zoom API throws 503
      zoomServiceMock.getParticipantReport.mockRejectedValueOnce(
        new Error('Zoom API 503 Unavailable'),
      );

      const job = createJob('meeting.ended', { id: 987654321 }, 1700000000);
      await expect(processor.process(job)).rejects.toThrow('Zoom API 503 Unavailable');

      // Must NOT have marked WebhookEvent PROCESSED
      expect(prismaMock.webhookEvent.create).not.toHaveBeenCalled();

      // Must have rolled back attendancePulled to false so retry can claim it
      expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
        where: { id: 'sess-retry' },
        data: { attendancePulled: false },
      });

      // Attempt 2: Retry succeeds
      const joinTime = new Date('2026-10-13T10:00:00Z');
      const leaveTime = new Date('2026-10-13T10:45:00Z');
      zoomServiceMock.getParticipantReport.mockResolvedValueOnce([
        { userEmail: 'learner1@example.com', joinTime, leaveTime, durationMinutes: 45 },
      ]);

      await processor.process(job);

      expect(reconciliationMock.reconcileSession).toHaveBeenCalledTimes(1);
      expect(prismaMock.webhookEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          provider: 'ZOOM',
          eventKey: 'meeting.ended:987654321:1700000000',
          status: 'PROCESSED',
        }),
      });
    });

    it('skips duplicate webhook delivery when WebhookEvent is already marked PROCESSED', async () => {
      prismaMock.webhookEvent.findUnique.mockResolvedValueOnce({
        id: 'wh-existing',
        status: 'PROCESSED',
      });

      const job = createJob('meeting.ended', { id: 987654321 }, 1700000000);
      const res = await processor.process(job);

      expect(res).toEqual({
        skipped: true,
        eventKey: 'meeting.ended:987654321:1700000000',
      });
      expect(prismaMock.session.findFirst).not.toHaveBeenCalled();
      expect(zoomServiceMock.getParticipantReport).not.toHaveBeenCalled();
    });
  });

  describe('meeting.ended Event Processing', () => {
    it('marks session COMPLETED and delegates participant records to AttendanceReconciliationService', async () => {
      const mockSession = {
        id: 'sess-100',
        batchId: 'batch-1',
        providerMeetingId: '987654321',
      };
      prismaMock.session.findFirst.mockResolvedValue(mockSession);
      prismaMock.session.update.mockResolvedValue({ ...mockSession, status: 'COMPLETED' });

      const joinTime = new Date('2026-10-13T10:00:00Z');
      const leaveTime = new Date('2026-10-13T10:45:00Z');

      zoomServiceMock.getParticipantReport.mockResolvedValue([
        {
          userEmail: 'learner1@example.com',
          joinTime,
          leaveTime,
          durationMinutes: 45,
        },
        {
          userEmail: 'Guest Participant',
          joinTime,
          leaveTime,
          durationMinutes: 45,
        },
      ]);

      const job = createJob('meeting.ended', { id: 987654321 });
      await processor.process(job);

      expect(prismaMock.session.findFirst).toHaveBeenCalledWith({
        where: { providerMeetingId: '987654321' },
      });
      expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
        where: { id: 'sess-100', attendancePulled: false },
        data: { attendancePulled: true, status: 'COMPLETED' },
      });

      expect(zoomServiceMock.getParticipantReport).toHaveBeenCalledWith('987654321');

      expect(reconciliationMock.reconcileSession).toHaveBeenCalledWith('sess-100', [
        {
          provider: 'ZOOM',
          participantEmail: 'learner1@example.com',
          participantName: undefined,
          joinTime,
          leaveTime,
        },
        {
          provider: 'ZOOM',
          participantEmail: undefined,
          participantName: 'Guest Participant',
          joinTime,
          leaveTime,
        },
      ]);
    });

    it('gracefully ignores meeting.ended when meeting ID does not match any session in database', async () => {
      prismaMock.session.findFirst.mockResolvedValue(null);

      const job = createJob('meeting.ended', { id: 999999999 });
      await processor.process(job);

      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
      expect(zoomServiceMock.getParticipantReport).not.toHaveBeenCalled();
      expect(reconciliationMock.reconcileSession).not.toHaveBeenCalled();
    });

    it('skips duplicate meeting.ended webhook when attendancePulled is already true', async () => {
      const mockSession = {
        id: 'sess-100',
        batchId: 'batch-1',
        providerMeetingId: '987654321',
        attendancePulled: true,
      };
      prismaMock.session.findFirst.mockResolvedValue(mockSession);
      prismaMock.session.updateMany.mockResolvedValue({ count: 0 });

      const job = createJob('meeting.ended', { id: 987654321 });
      await processor.process(job);

      expect(zoomServiceMock.getParticipantReport).not.toHaveBeenCalled();
      expect(reconciliationMock.reconcileSession).not.toHaveBeenCalled();
    });
  });

  describe('recording.completed Event Processing', () => {
    it('extracts MP4 play_url from recording_files and updates session recordingUrl', async () => {
      const mockSession = {
        id: 'sess-100',
        providerMeetingId: '987654321',
      };
      prismaMock.session.findFirst.mockResolvedValue(mockSession);
      prismaMock.session.update.mockResolvedValue(mockSession);

      const job = createJob('recording.completed', {
        id: 987654321,
        recording_files: [
          { file_type: 'AUDIO', play_url: 'https://zoom.us/audio.m4a' },
          { file_type: 'MP4', play_url: 'https://zoom.us/video.mp4' },
        ],
      });

      await processor.process(job);

      expect(prismaMock.session.update).toHaveBeenCalledWith({
        where: { id: 'sess-100' },
        data: {
          providerRecordingUrl: 'https://zoom.us/video.mp4',
          recordingUrl: 'https://zoom.us/video.mp4',
        },
      });
    });

    it('falls back to zoomService.getRecordingUrl when play_url is not in webhook payload', async () => {
      const mockSession = {
        id: 'sess-100',
        providerMeetingId: '987654321',
      };
      prismaMock.session.findFirst.mockResolvedValue(mockSession);
      prismaMock.session.update.mockResolvedValue(mockSession);
      zoomServiceMock.getRecordingUrl.mockResolvedValue('https://zoom.us/fallback.mp4');

      const job = createJob('recording.completed', {
        id: 987654321,
        recording_files: [],
      });

      await processor.process(job);

      expect(zoomServiceMock.getRecordingUrl).toHaveBeenCalledWith('987654321');
      expect(prismaMock.session.update).toHaveBeenCalledWith({
        where: { id: 'sess-100' },
        data: {
          providerRecordingUrl: 'https://zoom.us/fallback.mp4',
          recordingUrl: 'https://zoom.us/fallback.mp4',
        },
      });
    });

    it('gracefully logs warning when session is unknown', async () => {
      prismaMock.session.findFirst.mockResolvedValue(null);

      const job = createJob('recording.completed', { id: 111111111 });
      await processor.process(job);

      expect(prismaMock.session.update).not.toHaveBeenCalled();
    });
  });
});
