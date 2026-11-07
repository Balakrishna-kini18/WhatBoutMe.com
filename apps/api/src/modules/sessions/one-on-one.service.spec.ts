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
  let complianceServiceMock: any;

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

    complianceServiceMock = {
      calculateCompliance: vi.fn().mockResolvedValue({
        status: 'COMPLIANT',
        thresholdUsed: 80,
        requiredSessionCount: 4,
        attendedSessionCount: 4,
        attendancePercentage: 100,
      }),
    };

    service = new OneOnOneService(
      prismaMock,
      stageGateServiceMock,
      emailServiceMock,
      meetingProviderMock,
      complianceServiceMock as any,
    );
  });

  describe('createRequest', () => {
    it('throws if Stage 4 is locked in stageGateService', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        userId: 'user-1',
        program: { id: 'prog-1', title: 'Program' },
      });
      stageGateServiceMock.assertStageUnlocked.mockRejectedValue(
        new ForbiddenException('Stage 4 is locked'),
      );

      await expect(
        service.createRequest('user-1', {
          enrolmentId: 'enrol-1',
          requestedStart: new Date(Date.now() + 86400000).toISOString(),
          requestedEnd: new Date(Date.now() + 86400000 + 1800000).toISOString(),
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
          requestedStart: '2027-11-01T10:00:00.000Z',
          requestedEnd: '2027-11-01T10:30:00.000Z',
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
          requestedStart: '2027-11-01T10:00:00.000Z',
          requestedEnd: '2027-11-01T10:30:00.000Z',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException if requestedStart is in the past', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        userId: 'user-1',
      });
      prismaMock.oneOnOneRequest.findFirst.mockResolvedValue(null);

      await expect(
        service.createRequest('user-1', {
          enrolmentId: 'enrol-1',
          requestedStart: '2020-01-01T10:00:00.000Z',
          requestedEnd: '2020-01-01T10:30:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('auto-expires past pending request and allows booking a new upcoming slot', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        userId: 'user-1',
        program: { id: 'prog-1', title: 'Program' },
      });
      prismaMock.oneOnOneRequest.findFirst
        .mockResolvedValueOnce({
          id: 'old-req',
          requestedStart: new Date(Date.now() - 24 * 60 * 60 * 1000),
          status: OneOnOneRequestStatus.PENDING_APPROVAL,
        })
        .mockResolvedValueOnce(null);
      prismaMock.oneOnOneRequest.update.mockResolvedValue({ id: 'old-req', status: OneOnOneRequestStatus.EXPIRED });
      prismaMock.oneOnOneRequest.create.mockResolvedValue({
        id: 'new-req',
        enrolmentId: 'enrol-1',
        userId: 'user-1',
        status: OneOnOneRequestStatus.PENDING_APPROVAL,
      });

      const res = await service.createRequest('user-1', {
        enrolmentId: 'enrol-1',
        requestedStart: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        requestedEnd: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
      });

      expect(prismaMock.oneOnOneRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'old-req' },
          data: expect.objectContaining({ status: OneOnOneRequestStatus.EXPIRED }),
        }),
      );
      expect(res.id).toBe('new-req');
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
          requestedStart: '2027-11-01T10:30:00.000Z',
          requestedEnd: '2027-11-01T10:00:00.000Z',
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
        requestedStart: '2027-11-01T10:00:00.000Z',
        requestedEnd: '2027-11-01T10:30:00.000Z',
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

    it('blocks 1-on-1 coaching request when learner has less attendance in their batch (<80%) even if they passed the final exam', async () => {
      complianceServiceMock.calculateCompliance.mockResolvedValueOnce({
        status: 'NOT_COMPLIANT',
        thresholdUsed: 80,
        requiredSessionCount: 4,
        attendedSessionCount: 2,
        attendancePercentage: 50,
      });

      prismaMock.enrolment.findUnique.mockResolvedValueOnce({
        id: 'enrol-1',
        userId: 'user-1',
        examPassedAt: new Date(),
        program: { id: 'prog-1', title: '11 Steps Masterclass', attendanceRequired: true },
        batch: { id: 'batch-1', name: 'Sigma Batch' },
      });
      prismaMock.oneOnOneRequest.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.createRequest('user-1', {
          enrolmentId: 'enrol-1',
          requestedStart: new Date(Date.now() + 86400000).toISOString(),
          requestedEnd: new Date(Date.now() + 86400000 + 1800000).toISOString(),
        }),
      ).rejects.toThrow(/live session attendance in Sigma Batch is required/);
    });

    it('allows 1-on-1 coaching request when learner has passed final exam AND met the batch attendance requirement (>= 80%)', async () => {
      complianceServiceMock.calculateCompliance.mockResolvedValueOnce({
        status: 'COMPLIANT',
        thresholdUsed: 80,
        requiredSessionCount: 4,
        attendedSessionCount: 4,
        attendancePercentage: 100,
      });

      prismaMock.enrolment.findUnique.mockResolvedValueOnce({
        id: 'enrol-1',
        userId: 'user-1',
        examPassedAt: new Date(),
        program: { id: 'prog-1', title: '11 Steps Masterclass', attendanceRequired: true },
        batch: { id: 'batch-1', name: 'Sigma Batch' },
      });
      prismaMock.oneOnOneRequest.findFirst.mockResolvedValueOnce(null);
      prismaMock.oneOnOneRequest.create.mockImplementationOnce(async ({ data }: any) => ({
        id: 'req-compliant-1',
        ...data,
      }));

      const res = await service.createRequest('user-1', {
        enrolmentId: 'enrol-1',
        requestedStart: new Date(Date.now() + 86400000).toISOString(),
        learnerTimezone: 'Asia/Calcutta',
        notes: 'Passed exam with 98% and attended 100% live sessions!',
      });

      expect(res.id).toBe('req-compliant-1');
      expect(res.status).toBe(OneOnOneRequestStatus.PENDING_APPROVAL);
      expect(
        (res.requestedEnd.getTime() - res.requestedStart.getTime()) / 60000,
      ).toBe(45);
    });

    it('allows 1-on-1 coaching request when 0 live sessions were held in the batch (exempt)', async () => {
      complianceServiceMock.calculateCompliance.mockResolvedValueOnce({
        status: 'NOT_APPLICABLE',
        thresholdUsed: 80,
        requiredSessionCount: 0,
        attendedSessionCount: 0,
        attendancePercentage: 100,
      });

      prismaMock.enrolment.findUnique.mockResolvedValueOnce({
        id: 'enrol-1',
        userId: 'user-1',
        examPassedAt: new Date(),
        program: { id: 'prog-1', title: '11 Steps Masterclass', attendanceRequired: true },
        batch: { id: 'batch-1', name: 'Sigma Batch' },
      });
      prismaMock.oneOnOneRequest.findFirst.mockResolvedValueOnce(null);
      prismaMock.oneOnOneRequest.create.mockImplementationOnce(async ({ data }: any) => ({
        id: 'req-zero-sessions-1',
        ...data,
      }));

      const res = await service.createRequest('user-1', {
        enrolmentId: 'enrol-1',
        requestedStart: new Date(Date.now() + 86400000).toISOString(),
      });

      expect(res.id).toBe('req-zero-sessions-1');
    });

    it('allows 1-on-1 coaching request when Admin grants STAGE_UNLOCK_OVERRIDE even if attendance is below threshold', async () => {
      complianceServiceMock.calculateCompliance.mockResolvedValueOnce({
        status: 'NOT_COMPLIANT',
        thresholdUsed: 80,
        requiredSessionCount: 4,
        attendedSessionCount: 1,
        attendancePercentage: 25,
      });

      prismaMock.enrolment.findUnique.mockResolvedValueOnce({
        id: 'enrol-1',
        userId: 'user-1',
        examPassedAt: new Date(),
        program: { id: 'prog-1', title: '11 Steps Masterclass', attendanceRequired: true },
        batch: { id: 'batch-1', name: 'Sigma Batch' },
      });
      prismaMock.oneOnOneRequest.findFirst.mockResolvedValueOnce(null);
      prismaMock.auditLog.findMany = vi.fn().mockResolvedValueOnce([
        { meta: { stage: 'STAGE_4_ONE_ON_ONE' } },
      ]);
      prismaMock.oneOnOneRequest.create.mockImplementationOnce(async ({ data }: any) => ({
        id: 'req-overridden-1',
        ...data,
      }));

      const res = await service.createRequest('user-1', {
        enrolmentId: 'enrol-1',
        requestedStart: new Date(Date.now() + 86400000).toISOString(),
        requestedEnd: new Date(Date.now() + 86400000 + 1800000).toISOString(),
      });

      expect(res.id).toBe('req-overridden-1');
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

    it('throws BadRequestException if approved session start time is in the past', async () => {
      prismaMock.oneOnOneRequest.findUnique.mockResolvedValue({
        id: 'req-past',
        status: OneOnOneRequestStatus.PENDING_APPROVAL,
        requestedStart: new Date(Date.now() - 2 * 60 * 60 * 1000),
        requestedEnd: new Date(Date.now() - 1 * 60 * 60 * 1000),
        enrolment: { batchId: 'batch-1' },
      });

      await expect(
        service.approveRequest('req-past', 'admin-1', {
          startTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          endTime: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException if host trainer has calendar clash', async () => {
      prismaMock.oneOnOneRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        userId: 'user-1',
        enrolmentId: 'enrol-1',
        status: OneOnOneRequestStatus.PENDING_APPROVAL,
        requestedStart: new Date(Date.now() + 86400000),
        requestedEnd: new Date(Date.now() + 86400000 + 1800000),
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
      const requestedStart = new Date(Date.now() + 86400000);
      const requestedEnd = new Date(Date.now() + 86400000 + 1800000);

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
          template: expect.stringMatching(/SessionBookingConfirmationEmail|SessionReminderEmail/),
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
