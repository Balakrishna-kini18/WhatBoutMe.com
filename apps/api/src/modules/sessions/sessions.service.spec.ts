import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadGatewayException,
} from '@nestjs/common';
import { Role, SessionStatus, SessionType, MeetingProvider, AttendanceStatus } from '@prisma/client';

import { SessionsService } from './sessions.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { IMeetingProvider } from '../../common/interfaces/meeting-provider.interface.js';

describe('SessionsService — D1-043 Live Session Scheduling', () => {
  let service: SessionsService;
  let prismaMock: any;
  let meetingProviderMock: any;
  let meetingSyncQueueMock: any;

  const adminActor = {
    sub: 'admin-user-id',
    email: 'admin@whatboutme.com',
    role: Role.ADMIN,
  };

  const managerActor = {
    sub: 'manager-user-id',
    email: 'manager@whatboutme.com',
    role: Role.MANAGER,
  };

  const mockBatch = {
    id: 'batch-1',
    name: 'Sydney October Cohort',
    programId: 'prog-1',
    capacity: 25,
    status: 'ACTIVE',
    managerId: 'manager-user-id',
    trainers: [{ trainerId: 'manager-user-id' }],
    program: { id: 'prog-1', title: '11 Steps to U Certification' },
  };

  const mockTrainer = {
    id: 'trainer-1',
    name: 'Roweena Britto',
    email: 'ro@whatboutme.com',
    role: Role.SUPER_ADMIN,
  };

  const mockLearner = {
    id: 'learner-1',
    name: 'Alice Johnson',
    email: 'alice@example.com',
    role: Role.USER,
  };

  beforeEach(() => {
    prismaMock = {
      $transaction: vi.fn().mockImplementation(async (cb) => {
        return cb(prismaMock);
      }),
      outboxEvent: {
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'outbox-1', action: data.action, payload: data.payload })),
      },
      batch: {
        findUnique: vi.fn().mockResolvedValue(mockBatch),
        findMany: vi.fn().mockResolvedValue([mockBatch]),
      },
      user: {
        findUnique: vi.fn().mockImplementation(({ where }: any) => {
          if (where.id === mockTrainer.id) return Promise.resolve(mockTrainer);
          if (where.id === mockLearner.id) return Promise.resolve(mockLearner);
          if (where.id === adminActor.sub) return Promise.resolve({ ...adminActor, name: 'Admin User' });
          if (where.id === managerActor.sub) return Promise.resolve({ ...managerActor, name: 'Manager User' });
          return Promise.resolve(null);
        }),
      },
      session: {
        create: vi.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({
            id: 'sess-1',
            ...data,
            batch: mockBatch,
            hostTrainer: mockTrainer,
            learner: data.learnerId ? mockLearner : null,
          }),
        ),
        findUnique: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null), // No clash by default
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({ id: 'sess-1', ...data }),
        ),
        delete: vi.fn().mockResolvedValue({ id: 'sess-1', title: 'Deleted Session' }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      },
      notification: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      enrolment: {
        findMany: vi.fn().mockResolvedValue([{ id: 'enrol-1', userId: mockLearner.id, batchId: mockBatch.id }]),
        findUnique: vi.fn().mockResolvedValue({ id: 'enrol-1', status: 'ACTIVE' }),
      },
    };

    meetingProviderMock = {
      createMeeting: vi.fn().mockResolvedValue({
        id: 'zoom-123456789',
        joinUrl: 'https://zoom.us/j/123456789',
        startUrl: 'https://zoom.us/s/123456789',
      }),
      updateMeeting: vi.fn().mockResolvedValue(undefined),
      cancelMeeting: vi.fn().mockResolvedValue(undefined),
      getRecordingUrl: vi.fn().mockResolvedValue(null),
      getParticipantReport: vi.fn().mockResolvedValue([]),
    };

    meetingSyncQueueMock = {
      add: vi.fn().mockResolvedValue({ id: 'job-1' }),
    };

    const attendanceServiceMock = {
      recordAbsent: vi.fn(),
      recordPresentAuto: vi.fn(),
      recordPresentManual: vi.fn(),
      correctAttendance: vi.fn(),
    };

    service = new SessionsService(
      prismaMock as unknown as PrismaService,
      attendanceServiceMock as any,
      meetingProviderMock,
      undefined,
      meetingSyncQueueMock,
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Group Cohort Session Creation
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Group Cohort Session Scheduling', () => {
    it('creates a group cohort session in UTC with automated Zoom link and audit log', async () => {
      const startTime = '2026-11-01T10:00:00.000Z';
      const endTime = '2026-11-01T11:30:00.000Z';

      const res = await service.createSession(
        {
          batchId: mockBatch.id,
          title: 'Step 1 Live Orientation',
          startTime,
          endTime,
          sessionType: SessionType.GROUP_COHORT,
          capacity: 25,
          hostTrainerId: mockTrainer.id,
        },
        adminActor,
      );

      expect(res.id).toBe('sess-1');
      expect(prismaMock.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            batchId: mockBatch.id,
            title: 'Step 1 Live Orientation',
            startTime: new Date(startTime),
            endTime: new Date(endTime),
            sessionType: SessionType.GROUP_COHORT,
            capacity: 25,
            status: SessionStatus.SCHEDULED,
            hostTrainerId: mockTrainer.id,
            joinUrl: 'https://zoom.us/j/123456789',
            hostUrl: 'https://zoom.us/s/123456789',
            providerMeetingId: 'zoom-123456789',
            meetingProvider: MeetingProvider.ZOOM,
          }),
        }),
      );

      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorId: adminActor.sub,
            action: 'SESSION_CREATED',
            entity: 'Session',
          }),
        }),
      );
    });

    it('defaults capacity to batch capacity if omitted for group cohort session', async () => {
      await service.createSession(
        {
          batchId: mockBatch.id,
          title: 'Cohort Check-in',
          startTime: '2026-11-02T14:00:00.000Z',
          endTime: '2026-11-02T15:00:00.000Z',
          sessionType: SessionType.GROUP_COHORT,
          hostTrainerId: mockTrainer.id,
        },
        adminActor,
      );

      expect(prismaMock.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            capacity: mockBatch.capacity,
          }),
        }),
      );
    });

    it('rejects group cohort session if dedicated learnerId is passed', async () => {
      await expect(
        service.createSession(
          {
            batchId: mockBatch.id,
            title: 'Cohort Masterclass',
            startTime: '2026-11-02T14:00:00.000Z',
            endTime: '2026-11-02T15:00:00.000Z',
            sessionType: SessionType.GROUP_COHORT,
            learnerId: mockLearner.id,
          },
          adminActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. 1-on-1 Coaching Session Creation
  // ─────────────────────────────────────────────────────────────────────────────
  describe('1-on-1 Coaching Session Scheduling', () => {
    it('creates a 1-on-1 coaching session with capacity strictly locked to 1', async () => {
      const res = await service.createSession(
        {
          batchId: mockBatch.id,
          title: '1:1 Coaching with Ro',
          startTime: '2026-11-05T09:00:00.000Z',
          endTime: '2026-11-05T10:00:00.000Z',
          sessionType: SessionType.ONE_ON_ONE,
          learnerId: mockLearner.id,
          hostTrainerId: mockTrainer.id,
        },
        adminActor,
      );

      expect(res.id).toBe('sess-1');
      expect(prismaMock.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sessionType: SessionType.ONE_ON_ONE,
            capacity: 1,
            learnerId: mockLearner.id,
          }),
        }),
      );
    });

    it('rejects 1-on-1 session if capacity is explicitly set greater than 1', async () => {
      await expect(
        service.createSession(
          {
            batchId: mockBatch.id,
            title: '1:1 Coaching',
            startTime: '2026-11-05T09:00:00.000Z',
            endTime: '2026-11-05T10:00:00.000Z',
            sessionType: SessionType.ONE_ON_ONE,
            capacity: 5,
          },
          adminActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException if learnerId does not exist in DB', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.createSession(
          {
            batchId: mockBatch.id,
            title: '1:1 Coaching',
            startTime: '2026-11-05T09:00:00.000Z',
            endTime: '2026-11-05T10:00:00.000Z',
            sessionType: SessionType.ONE_ON_ONE,
            learnerId: 'non-existent-user-id',
          },
          adminActor,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Time Validation & UTC Persistence
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Time Validation & UTC Storage', () => {
    it('rejects when end time is before or equal to start time', async () => {
      await expect(
        service.createSession(
          {
            batchId: mockBatch.id,
            title: 'Invalid Slot',
            startTime: '2026-11-05T11:00:00.000Z',
            endTime: '2026-11-05T10:00:00.000Z',
          },
          adminActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when session duration is less than 5 minutes', async () => {
      await expect(
        service.createSession(
          {
            batchId: mockBatch.id,
            title: 'Too Short Slot',
            startTime: '2026-11-05T10:00:00.000Z',
            endTime: '2026-11-05T10:03:00.000Z', // 3 mins
          },
          adminActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when session duration exceeds 24 hours', async () => {
      await expect(
        service.createSession(
          {
            batchId: mockBatch.id,
            title: 'Marathon Slot',
            startTime: '2026-11-05T10:00:00.000Z',
            endTime: '2026-11-07T10:00:00.000Z', // 48 hours
          },
          adminActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects invalid ISO date strings', async () => {
      await expect(
        service.createSession(
          {
            batchId: mockBatch.id,
            title: 'Corrupted Dates',
            startTime: 'not-a-date',
            endTime: 'also-not-a-date',
          },
          adminActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Host Trainer Validation & Double-Booking Clash Prevention
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Host Trainer Authorization & Double-Booking Prevention', () => {
    it('rejects scheduling if host trainer does not exist', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.createSession(
          {
            batchId: mockBatch.id,
            title: 'Live Workshop',
            startTime: '2026-11-10T10:00:00.000Z',
            endTime: '2026-11-10T11:00:00.000Z',
            hostTrainerId: 'phantom-trainer-id',
          },
          adminActor,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects if host trainer has USER (learner) role instead of trainer/admin role', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: 'some-user',
        role: Role.USER,
      });

      await expect(
        service.createSession(
          {
            batchId: mockBatch.id,
            title: 'Live Workshop',
            startTime: '2026-11-10T10:00:00.000Z',
            endTime: '2026-11-10T11:00:00.000Z',
            hostTrainerId: 'some-user',
          },
          adminActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException if host trainer is already booked during the requested window', async () => {
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: 'existing-sess-1',
        title: 'Morning Vision Board Workshop',
        startTime: new Date('2026-11-10T09:30:00.000Z'),
        endTime: new Date('2026-11-10T11:30:00.000Z'),
      });

      await expect(
        service.createSession(
          {
            batchId: mockBatch.id,
            title: 'Overlapping Session',
            startTime: '2026-11-10T10:00:00.000Z',
            endTime: '2026-11-10T11:00:00.000Z',
            hostTrainerId: mockTrainer.id,
          },
          adminActor,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException if 1:1 learner is already booked during the requested window', async () => {
      // First call: trainer clash check (returns null)
      prismaMock.session.findFirst.mockResolvedValueOnce(null);
      // Second call: learner clash check (returns conflict)
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: 'existing-learner-sess',
        title: 'Existing 1:1 Call',
      });

      await expect(
        service.createSession(
          {
            batchId: mockBatch.id,
            title: '1:1 Coaching',
            startTime: '2026-11-10T10:00:00.000Z',
            endTime: '2026-11-10T11:00:00.000Z',
            sessionType: SessionType.ONE_ON_ONE,
            hostTrainerId: mockTrainer.id,
            learnerId: mockLearner.id,
          },
          adminActor,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Manager Batch-Scoping Enforcement
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Manager Batch Scoping', () => {
    it('allows manager to schedule session for a batch they are assigned to', async () => {
      const res = await service.createSession(
        {
          batchId: mockBatch.id,
          title: 'Manager Cohort Catch-up',
          startTime: '2026-11-12T10:00:00.000Z',
          endTime: '2026-11-12T11:00:00.000Z',
        },
        managerActor,
      );

      expect(res.id).toBe('sess-1');
    });

    it('throws ForbiddenException if manager attempts to schedule for an unassigned batch', async () => {
      prismaMock.batch.findUnique.mockResolvedValue({
        ...mockBatch,
        id: 'unassigned-batch-id',
        managerId: 'different-manager-id',
        trainers: [{ trainerId: 'different-manager-id' }],
      });

      await expect(
        service.createSession(
          {
            batchId: 'unassigned-batch-id',
            title: 'Unauthorized Cohort Catch-up',
            startTime: '2026-11-12T10:00:00.000Z',
            endTime: '2026-11-12T11:00:00.000Z',
          },
          managerActor,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException if batch does not exist', async () => {
      prismaMock.batch.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.createSession(
          {
            batchId: 'ghost-batch',
            title: 'Session',
            startTime: '2026-11-12T10:00:00.000Z',
            endTime: '2026-11-12T11:00:00.000Z',
          },
          adminActor,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if batch is archived', async () => {
      prismaMock.batch.findUnique.mockResolvedValueOnce({
        ...mockBatch,
        status: 'ARCHIVED',
      });

      await expect(
        service.createSession(
          {
            batchId: mockBatch.id,
            title: 'Archived Cohort Session',
            startTime: '2026-11-12T10:00:00.000Z',
            endTime: '2026-11-12T11:00:00.000Z',
          },
          adminActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. IMeetingProvider Zoom Integration & Failure Resilience
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Meeting Provider Abstraction & Zoom Resilience', () => {
    it('uses manual joinUrl when supplied, bypassing Zoom creation', async () => {
      const customJoinUrl = 'https://custom-meeting.com/live/room-1';

      await service.createSession(
        {
          batchId: mockBatch.id,
          title: 'Manual Room Session',
          startTime: '2026-11-15T10:00:00.000Z',
          endTime: '2026-11-15T11:00:00.000Z',
          joinUrl: customJoinUrl,
        },
        adminActor,
      );

      expect(meetingProviderMock.createMeeting).not.toHaveBeenCalled();
      expect(prismaMock.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            joinUrl: customJoinUrl,
            meetingProvider: MeetingProvider.MANUAL,
          }),
        }),
      );
    });

    it('creates session and enqueues sync without failing on external API', async () => {
      // When external Zoom API call fails, it falls back to the outbox queue
      meetingProviderMock.createMeeting.mockRejectedValueOnce(new Error('Zoom 503 Service Unavailable'));

      const res = await service.createSession(
        {
          batchId: mockBatch.id,
          title: 'Sync Enqueue Test',
          startTime: '2026-11-15T10:00:00.000Z',
          endTime: '2026-11-15T11:00:00.000Z',
        },
        adminActor,
      );

      expect(res.id).toBe('sess-1');
      expect(meetingSyncQueueMock.add).toHaveBeenCalledWith('sync-meeting', expect.objectContaining({
        outboxId: 'outbox-1',
        type: 'CREATE',
        sessionId: 'sess-1',
      }));
    });

    it('throws BadRequestException if meeting provider is omitted and no joinUrl is provided', async () => {
      const unconfiguredService = new SessionsService(
        prismaMock as unknown as PrismaService,
        {} as any, // attendanceServiceMock
        undefined, // No meeting provider injected
        undefined,
        undefined, // No meeting sync queue injected
      );

      await expect(
        unconfiguredService.createSession(
          {
            batchId: mockBatch.id,
            title: 'Provider Missing',
            startTime: '2026-11-15T10:00:00.000Z',
            endTime: '2026-11-15T11:00:00.000Z',
          },
          adminActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. Session Updates & Cancellation Lifecycle
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Session Updates and Cancellation', () => {
    it('updates session schedule, rechecks clash, and updates Zoom meeting', async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce({
        id: 'sess-1',
        batchId: mockBatch.id,
        title: 'Old Title',
        startTime: new Date('2026-11-18T10:00:00.000Z'),
        endTime: new Date('2026-11-18T11:00:00.000Z'),
        providerMeetingId: 'zoom-123456789',
        hostTrainerId: mockTrainer.id,
        batch: mockBatch,
      });

      const updated = await service.updateSession(
        'sess-1',
        {
          title: 'New Rescheduled Title',
          startTime: '2026-11-18T12:00:00.000Z',
          endTime: '2026-11-18T13:00:00.000Z',
        },
        adminActor,
      );

      expect(meetingSyncQueueMock.add).toHaveBeenCalledWith('sync-meeting', expect.objectContaining({
        outboxId: 'outbox-1',
        type: 'UPDATE',
        sessionId: 'sess-1',
      }));

      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'SESSION_UPDATED',
          }),
        }),
      );
    });

    it('cancels a session, releases external Zoom meeting, and logs audit record', async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce({
        id: 'sess-1',
        batchId: mockBatch.id,
        providerMeetingId: 'zoom-123456789',
        batch: mockBatch,
      });

      const cancelled = await service.cancelSession('sess-1', 'Trainer ill', adminActor);

      expect(meetingSyncQueueMock.add).toHaveBeenCalledWith('sync-meeting', expect.objectContaining({
        outboxId: 'outbox-1',
        type: 'CANCEL',
      }));
      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sess-1' },
          data: expect.objectContaining({
            status: SessionStatus.CANCELLED,
            cancelReason: 'Trainer ill',
          }),
        }),
      );
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'SESSION_CANCELLED',
          }),
        }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. Session Retrieval & Scoping
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Session Retrieval & Scoping', () => {
    it('scopes session list for MANAGER to only batches assigned to that manager', async () => {
      prismaMock.batch.findMany.mockResolvedValueOnce([{ id: 'batch-1' }]);

      await service.getSessions({}, managerActor);

      expect(prismaMock.session.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            batchId: { in: ['batch-1'] },
          }),
        }),
      );
    });

    it('scopes session list for USER to active enrolled cohorts and dedicated 1:1 sessions', async () => {
      prismaMock.enrolment.findMany.mockResolvedValueOnce([{ batchId: 'batch-1' }]);

      await service.getSessions({}, { sub: 'learner-1', role: Role.USER });

      expect(prismaMock.session.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { batchId: { in: ['batch-1'] } },
              { learnerId: 'learner-1' },
            ],
          }),
        }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. Hybrid Attendance Recording Progress (Phase 3)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Hybrid Attendance Recording Progress (Phase 3)', () => {
    const complianceServiceMock = {
      calculateCompliance: vi.fn(),
    };
    const stageGateServiceMock = {
      evaluateStages: vi.fn().mockResolvedValue(undefined),
    };

    beforeEach(() => {
      prismaMock.sessionRecordingProgress = {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockImplementation(({ update, create }) =>
          Promise.resolve({ id: 'rec-1', ...create, ...update }),
        ),
      };
      prismaMock.attendance = {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockImplementation(({ update, create }) =>
          Promise.resolve({ id: 'att-1', ...create, ...update }),
        ),
      };
      prismaMock.enrolment.findFirst = vi.fn().mockResolvedValue({ id: 'enrol-1', status: 'ACTIVE' });
      complianceServiceMock.calculateCompliance.mockReset();
      complianceServiceMock.calculateCompliance.mockResolvedValue({ status: 'NOT_COMPLIANT' });
      stageGateServiceMock.evaluateStages.mockReset();

      service = new SessionsService(
        prismaMock as unknown as PrismaService,
        {} as any,
        meetingProviderMock,
        undefined,
        meetingSyncQueueMock,
        undefined,
        complianceServiceMock as any,
        stageGateServiceMock as any,
      );
    });

    it('rejects forward seek into unwatched territory without crediting', async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce({
        id: 'sess-1',
        batchId: mockBatch.id,
        durationMinutes: 60,
        startTime: new Date('2026-11-01T10:00:00.000Z'),
        endTime: new Date('2026-11-01T11:00:00.000Z'),
        batch: mockBatch,
      });

      // Learner tries to jump straight to second 1500 without watching 0..1500
      const result = await service.recordRecordingProgress('sess-1', 'learner-1', {
        positionSec: 1500,
        fromSec: 1500,
        toSec: 1515,
      });

      expect(result.accepted).toBe(false);
      expect(result.coveredSec).toBe(0);
      expect(result.recordedMinutes).toBe(0);
    });

    it('credits contiguous watch heartbeats and tracks recorded minutes', async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce({
        id: 'sess-1',
        batchId: mockBatch.id,
        durationMinutes: 60,
        minAttendanceMinutes: 45,
        startTime: new Date('2026-11-01T10:00:00.000Z'),
        endTime: new Date('2026-11-01T11:00:00.000Z'),
        batch: mockBatch,
      });

      // Valid heartbeat watching first 15 seconds
      const result = await service.recordRecordingProgress('sess-1', 'learner-1', {
        positionSec: 15,
        fromSec: 0,
        toSec: 15,
      });

      expect(result.accepted).toBe(true);
      expect(result.coveredSec).toBe(15);
      expect(result.isCompliant).toBe(false); // 15s < 45m
    });

    it('combines live minutes + recorded minutes to satisfy hybrid threshold and mark PRESENT_RECORDED', async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce({
        id: 'sess-1',
        batchId: mockBatch.id,
        durationMinutes: 60,
        minAttendanceMinutes: 45,
        startTime: new Date('2026-11-01T10:00:00.000Z'),
        endTime: new Date('2026-11-01T11:00:00.000Z'),
        batch: mockBatch,
      });

      // Existing attendance record with 25 minutes live attendance
      prismaMock.attendance.findUnique.mockResolvedValueOnce({
        id: 'att-1',
        status: AttendanceStatus.ABSENT,
        liveMinutes: 25,
        minutesPresent: 25,
      });

      // Existing recording progress with 1200 seconds (20 mins) already watched
      prismaMock.sessionRecordingProgress.findUnique.mockResolvedValueOnce({
        id: 'rec-1',
        watchedRanges: [[0, 1200]],
        coveredSec: 1200,
        completed: false,
        updatedAt: new Date(Date.now() - 15000),
      });

      // Heartbeat completes additional 15 seconds: total recorded = 1215s (20.25 mins)
      // Total minutes = 25 (live) + 20.25 (recorded) = 45.25 mins >= 45 min threshold!
      complianceServiceMock.calculateCompliance.mockResolvedValueOnce({ status: 'COMPLIANT' });

      const result = await service.recordRecordingProgress('sess-1', 'learner-1', {
        positionSec: 1215,
        fromSec: 1200,
        toSec: 1215,
      });

      expect(result.isCompliant).toBe(true);
      expect(result.attendanceStatus).toBe('PRESENT_RECORDED');
      expect(complianceServiceMock.calculateCompliance).toHaveBeenCalledWith('enrol-1');
      expect(stageGateServiceMock.evaluateStages).toHaveBeenCalledWith('enrol-1');
    });
  });
});

