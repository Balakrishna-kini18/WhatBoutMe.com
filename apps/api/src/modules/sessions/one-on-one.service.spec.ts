import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { OneOnOneService } from './one-on-one.service.js';
import {
  OneOnOneRequestStatus,
  SessionStatus,
  SessionType,
  LearnerStage,
} from '@prisma/client';

describe('OneOnOneService - Stage 4 Request & Approval Flow', () => {
  let service: OneOnOneService;
  let prismaMock: any;
  let stageGateServiceMock: any;
  let emailServiceMock: any;
  let meetingProviderMock: any;

  beforeEach(() => {
    prismaMock = {
      enrolment: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      oneOnOneRequest: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      session: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      sessionBooking: {
        create: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
      $executeRaw: vi.fn().mockResolvedValue(1),
      $transaction: vi.fn(async (cb: any) => cb(prismaMock)),
    };

    stageGateServiceMock = {
      assertStageUnlocked: vi.fn().mockResolvedValue(true),
      evaluateStages: vi.fn().mockResolvedValue({}),
    };

    emailServiceMock = {
      sendTemplateEmail: vi.fn().mockResolvedValue(true),
    };

    meetingProviderMock = {
      createMeeting: vi.fn().mockResolvedValue({
        id: 'zoom-12345',
        joinUrl: 'https://zoom.us/j/12345?pwd=abc',
        startUrl: 'https://zoom.us/s/12345?pwd=abc',
      }),
    };

    service = new OneOnOneService(
      prismaMock,
      stageGateServiceMock,
      emailServiceMock,
      meetingProviderMock,
    );
  });

  describe('createRequest', () => {
    it('throws if Stage 4 is locked in stageGateService', async () => {
      stageGateServiceMock.assertStageUnlocked.mockRejectedValue(
        new ForbiddenException('Stage 4 is locked'),
      );

      await expect(
        service.createRequest('user-1', {
          enrolmentId: 'enrol-1',
          requestedStart: '2026-11-01T10:00:00.000Z',
          requestedEnd: '2026-11-01T10:30:00.000Z',
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(stageGateServiceMock.assertStageUnlocked).toHaveBeenCalledWith(
        'enrol-1',
        LearnerStage.STAGE_4_ONE_ON_ONE,
      );
    });

    it('throws ForbiddenException if enrolment does not belong to the requesting user', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        userId: 'different-user',
      });

      await expect(
        service.createRequest('user-1', {
          enrolmentId: 'enrol-1',
          requestedStart: '2026-11-01T10:00:00.000Z',
          requestedEnd: '2026-11-01T10:30:00.000Z',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException if there is already a pending request for this enrolment', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        userId: 'user-1',
      });
      prismaMock.oneOnOneRequest.findFirst.mockResolvedValue({
        id: 'req-existing',
        status: OneOnOneRequestStatus.PENDING_APPROVAL,
      });

      await expect(
        service.createRequest('user-1', {
          enrolmentId: 'enrol-1',
          requestedStart: '2026-11-01T10:00:00.000Z',
          requestedEnd: '2026-11-01T10:30:00.000Z',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException if requestedEnd <= requestedStart', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        userId: 'user-1',
      });
      prismaMock.oneOnOneRequest.findFirst.mockResolvedValue(null);

      await expect(
        service.createRequest('user-1', {
          enrolmentId: 'enrol-1',
          requestedStart: '2026-11-01T10:30:00.000Z',
          requestedEnd: '2026-11-01T10:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('successfully creates request in PENDING_APPROVAL status and logs audit event', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        userId: 'user-1',
        program: { id: 'prog-1', title: '11 Steps to High Performance' },
      });
      prismaMock.oneOnOneRequest.findFirst.mockResolvedValue(null);
      prismaMock.oneOnOneRequest.create.mockResolvedValue({
        id: 'req-1',
        enrolmentId: 'enrol-1',
        userId: 'user-1',
        status: OneOnOneRequestStatus.PENDING_APPROVAL,
      });

      const res = await service.createRequest('user-1', {
        enrolmentId: 'enrol-1',
        requestedStart: '2026-11-01T10:00:00.000Z',
        requestedEnd: '2026-11-01T10:30:00.000Z',
        notes: 'Discussion on personal vision statement',
        learnerTimezone: 'Asia/Dubai',
      });

      expect(res.id).toBe('req-1');
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorId: 'user-1',
          action: 'ONE_ON_ONE_REQUESTED',
          entity: 'OneOnOneRequest',
          entityId: 'req-1',
        }),
      });
    });
  });

  describe('cancelRequest', () => {
    it('throws NotFoundException if request does not exist', async () => {
      prismaMock.oneOnOneRequest.findUnique.mockResolvedValue(null);
      await expect(service.cancelRequest('user-1', 'req-999')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException if user does not own request', async () => {
      prismaMock.oneOnOneRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        userId: 'other-user',
        status: OneOnOneRequestStatus.PENDING_APPROVAL,
      });
      await expect(service.cancelRequest('user-1', 'req-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws BadRequestException if status is not PENDING_APPROVAL', async () => {
      prismaMock.oneOnOneRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        userId: 'user-1',
        status: OneOnOneRequestStatus.APPROVED,
      });
      await expect(service.cancelRequest('user-1', 'req-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('cancels pending request successfully', async () => {
      prismaMock.oneOnOneRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        userId: 'user-1',
        status: OneOnOneRequestStatus.PENDING_APPROVAL,
      });
      prismaMock.oneOnOneRequest.update.mockResolvedValue({
        id: 'req-1',
        status: OneOnOneRequestStatus.CANCELLED,
      });

      const res = await service.cancelRequest('user-1', 'req-1');
      expect(res.status).toBe(OneOnOneRequestStatus.CANCELLED);
    });
  });

  describe('approveRequest', () => {
    it('throws NotFoundException if request does not exist', async () => {
      prismaMock.oneOnOneRequest.findUnique.mockResolvedValue(null);
      await expect(
        service.approveRequest('req-999', 'admin-1', {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException if host trainer has calendar clash', async () => {
      prismaMock.oneOnOneRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        userId: 'user-1',
        enrolmentId: 'enrol-1',
        status: OneOnOneRequestStatus.PENDING_APPROVAL,
        requestedStart: new Date('2026-11-01T10:00:00.000Z'),
        requestedEnd: new Date('2026-11-01T10:30:00.000Z'),
        user: { name: 'Learner One', email: 'learner@example.com' },
        enrolment: { program: { title: 'Program 1' } },
      });

      // Simulate clash found in tx
      prismaMock.session.findFirst.mockResolvedValue({
        id: 'existing-session',
        title: 'Clashing Batch Session',
      });

      await expect(
        service.approveRequest('req-1', 'admin-1', {
          hostTrainerId: 'trainer-1',
        }),
      ).rejects.toThrow(ConflictException);

      // Verify advisory lock was called inside transaction
      expect(prismaMock.$executeRaw).toHaveBeenCalled();
    });

    it('successfully approves request, provisions Zoom session and booking, and notifies learner', async () => {
      const requestedStart = new Date('2026-11-01T10:00:00.000Z');
      const requestedEnd = new Date('2026-11-01T10:30:00.000Z');

      prismaMock.oneOnOneRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        userId: 'user-1',
        enrolmentId: 'enrol-1',
        status: OneOnOneRequestStatus.PENDING_APPROVAL,
        requestedStart,
        requestedEnd,
        learnerTimezone: 'Asia/Dubai',
        user: { name: 'Learner One', email: 'learner@example.com' },
        enrolment: { program: { title: '11 Steps Masterclass' } },
      });

      prismaMock.session.findFirst.mockResolvedValue(null); // No clash
      prismaMock.session.create.mockResolvedValue({
        id: 'sess-100',
        title: '1-on-1 Coaching: Learner One',
        startTime: requestedStart,
        endTime: requestedEnd,
        joinUrl: 'https://zoom.us/j/12345?pwd=abc',
        sessionType: SessionType.ONE_ON_ONE,
      });

      prismaMock.sessionBooking.create.mockResolvedValue({
        id: 'booking-1',
        sessionId: 'sess-100',
        userId: 'user-1',
      });

      prismaMock.oneOnOneRequest.update.mockResolvedValue({
        id: 'req-1',
        status: OneOnOneRequestStatus.APPROVED,
        sessionId: 'sess-100',
      });

      const res = await service.approveRequest('req-1', 'admin-1', {
        hostTrainerId: 'trainer-1',
      });

      expect(res.status).toBe(OneOnOneRequestStatus.APPROVED);
      expect(meetingProviderMock.createMeeting).toHaveBeenCalled();
      expect(prismaMock.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sessionType: SessionType.ONE_ON_ONE,
            learnerId: 'user-1',
            hostTrainerId: 'trainer-1',
            status: SessionStatus.SCHEDULED,
          }),
        }),
      );
      expect(prismaMock.sessionBooking.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sessionId: 'sess-100',
            userId: 'user-1',
            enrolmentId: 'enrol-1',
          }),
        }),
      );
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ONE_ON_ONE_APPROVED',
            actorId: 'admin-1',
          }),
        }),
      );
      expect(emailServiceMock.sendTemplateEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'learner@example.com',
          template: 'SessionReminderEmail',
        }),
      );
    });
  });

  describe('rejectRequest', () => {
    it('rejects a pending request with reason', async () => {
      prismaMock.oneOnOneRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        status: OneOnOneRequestStatus.PENDING_APPROVAL,
        user: { email: 'learner@example.com' },
      });
      prismaMock.oneOnOneRequest.update.mockResolvedValue({
        id: 'req-1',
        status: OneOnOneRequestStatus.REJECTED,
        decisionReason: 'Instructor unavailable during requested slot',
      });

      const res = await service.rejectRequest('req-1', 'admin-1', {
        reason: 'Instructor unavailable during requested slot',
      });

      expect(res.status).toBe(OneOnOneRequestStatus.REJECTED);
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ONE_ON_ONE_REJECTED',
            actorId: 'admin-1',
          }),
        }),
      );
    });
  });
});
