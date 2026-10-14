import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceService } from './attendance.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AttendanceStatus } from '@prisma/client';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as dailyAttendance from '../../common/daily-attendance.js';
import { AuditLogService } from '../../common/audit/audit-log.service.js';

describe('AttendanceService', () => {
  let service: AttendanceService;
  let prismaMock: any;
  let auditLogServiceMock: any;

  beforeEach(async () => {
    auditLogServiceMock = {
      log: vi.fn().mockResolvedValue({ id: 'audit-1' }),
    };

    prismaMock = {
      $transaction: vi.fn(async (cb) => cb(prismaMock)),
      attendance: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
      },
      enrolment: {
        findUnique: vi.fn(),
      },
      session: {
        findUnique: vi.fn().mockResolvedValue({ id: 'sess-1', durationMinutes: 60, batch: null }),
      },
      auditLog: {
        create: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: AuditLogService,
          useValue: auditLogServiceMock,
        },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);

    // Mock markDailyAttendance to do nothing in these tests
    vi.spyOn(dailyAttendance, 'markDailyAttendance').mockResolvedValue(undefined as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('recordAbsent', () => {
    it('creates or updates attendance to ABSENT if no prior manual correction exists', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({ userId: 'user-1' });
      prismaMock.attendance.findUnique.mockResolvedValue(null);
      prismaMock.attendance.upsert.mockResolvedValue({ id: 'att-1', status: AttendanceStatus.ABSENT });

      const result = await service.recordAbsent('sess-1', 'enrol-1');

      expect(prismaMock.attendance.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sessionId_userId: { sessionId: 'sess-1', userId: 'user-1' } },
          update: expect.objectContaining({ status: AttendanceStatus.ABSENT }),
          create: expect.objectContaining({
            sessionId: 'sess-1',
            enrolmentId: 'enrol-1',
            userId: 'user-1',
            status: AttendanceStatus.ABSENT,
          }),
        }),
      );
      expect(result.status).toBe(AttendanceStatus.ABSENT);
    });

    it('does not overwrite a PRESENT_MANUAL status', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({ userId: 'user-1' });
      const existing = { id: 'att-1', status: AttendanceStatus.PRESENT_MANUAL };
      prismaMock.attendance.findUnique.mockResolvedValue(existing);

      const result = await service.recordAbsent('sess-1', 'enrol-1');

      expect(prismaMock.attendance.upsert).not.toHaveBeenCalled();
      expect(result).toBe(existing); // returns existing instead
    });

    it('does not overwrite a CORRECTED status', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({ userId: 'user-1' });
      const existing = { id: 'att-1', status: AttendanceStatus.CORRECTED };
      prismaMock.attendance.findUnique.mockResolvedValue(existing);

      const result = await service.recordAbsent('sess-1', 'enrol-1');

      expect(prismaMock.attendance.upsert).not.toHaveBeenCalled();
    });
  });

  describe('recordPresentAuto', () => {
    it('creates or updates attendance to PRESENT_AUTO and marks daily attendance', async () => {
      prismaMock.attendance.findUnique.mockResolvedValue(null);
      prismaMock.enrolment.findUnique.mockResolvedValue({ userId: 'user-1' });
      prismaMock.attendance.upsert.mockResolvedValue({ id: 'att-1', status: AttendanceStatus.PRESENT_AUTO });

      const joinTime = new Date('2026-10-07T10:00:00Z');
      await service.recordPresentAuto('sess-1', 'enrol-1', { joinTime, durationMin: 60 });

      expect(prismaMock.enrolment.findUnique).toHaveBeenCalledWith({ where: { id: 'enrol-1' }, select: { userId: true } });
      expect(prismaMock.attendance.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sessionId_userId: { sessionId: 'sess-1', userId: 'user-1' } },
          update: expect.objectContaining({
            status: AttendanceStatus.PRESENT_AUTO,
            joinTime,
            minutesPresent: 60,
            source: 'AUTO',
          }),
          create: expect.objectContaining({
            sessionId: 'sess-1',
            enrolmentId: 'enrol-1',
            userId: 'user-1',
            status: AttendanceStatus.PRESENT_AUTO,
            joinTime,
            minutesPresent: 60,
            source: 'AUTO',
          }),
        }),
      );
      expect(dailyAttendance.markDailyAttendance).toHaveBeenCalledWith(prismaMock, 'user-1', 'sessionJoined');
    });

    it('does not overwrite a PRESENT_MANUAL status with automated data', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({ userId: 'user-1' });
      const existing = { id: 'att-1', status: AttendanceStatus.PRESENT_MANUAL };
      prismaMock.attendance.findUnique.mockResolvedValue(existing);

      const result = await service.recordPresentAuto('sess-1', 'enrol-1');

      expect(prismaMock.attendance.upsert).not.toHaveBeenCalled();
      expect(result).toBe(existing);
    });
  });

  describe('recordPresentManual', () => {
    it('creates or updates attendance to PRESENT_MANUAL and creates an audit log', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({ userId: 'user-1' });
      prismaMock.attendance.findUnique.mockResolvedValue(null);
      prismaMock.attendance.upsert.mockResolvedValue({ id: 'att-1', status: AttendanceStatus.PRESENT_MANUAL });

      await service.recordPresentManual('sess-1', 'enrol-1', 'admin-user-1', 'Trainer says they were there');

      expect(prismaMock.attendance.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sessionId_userId: { sessionId: 'sess-1', userId: 'user-1' } },
          update: expect.objectContaining({
            status: AttendanceStatus.PRESENT_MANUAL,
            source: 'MANUAL',
            overrideReason: 'Trainer says they were there',
            updatedById: 'admin-user-1',
          }),
          create: expect.objectContaining({
            status: AttendanceStatus.PRESENT_MANUAL,
            source: 'MANUAL',
            overrideReason: 'Trainer says they were there',
            updatedById: 'admin-user-1',
          }),
        }),
      );

      expect(auditLogServiceMock.log).toHaveBeenCalledWith(
        prismaMock,
        expect.objectContaining({
          action: 'ATTENDANCE_MARKED_MANUAL',
          actorId: 'admin-user-1',
          entityId: 'att-1',
        }),
      );

      expect(dailyAttendance.markDailyAttendance).toHaveBeenCalledWith(prismaMock, 'user-1', 'sessionJoined');
    });
  });

  describe('correctAttendance', () => {
    it('creates or updates attendance to CORRECTED and creates an audit log', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({ userId: 'user-1' });
      const existing = { id: 'att-1', status: AttendanceStatus.ABSENT };
      prismaMock.attendance.findUnique.mockResolvedValue(existing);
      prismaMock.attendance.upsert.mockResolvedValue({ id: 'att-1', status: AttendanceStatus.PRESENT_MANUAL });

      await service.correctAttendance('sess-1', 'enrol-1', AttendanceStatus.PRESENT_MANUAL, 'admin-user-1', 'Fixed glitch in Zoom reporting');

      expect(prismaMock.attendance.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sessionId_userId: { sessionId: 'sess-1', userId: 'user-1' } },
          update: expect.objectContaining({
            status: AttendanceStatus.PRESENT_MANUAL,
            source: 'MANUAL',
            overrideReason: 'Fixed glitch in Zoom reporting',
            updatedById: 'admin-user-1',
          }),
        }),
      );

      expect(auditLogServiceMock.log).toHaveBeenCalledWith(
        prismaMock,
        expect.objectContaining({
          action: 'ATTENDANCE_MANUAL_OVERRIDE',
          actorId: 'admin-user-1',
          entityId: 'att-1',
          reason: 'Fixed glitch in Zoom reporting',
          metadata: expect.objectContaining({ previousStatus: AttendanceStatus.ABSENT }),
        }),
      );
      
      expect(dailyAttendance.markDailyAttendance).toHaveBeenCalledWith(prismaMock, 'user-1', 'sessionJoined');
    });

    it('requires a reason for correction', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({ userId: 'user-1' });
      await expect(service.correctAttendance('sess-1', 'enrol-1', AttendanceStatus.PRESENT_MANUAL, 'admin-1', ''))
        .rejects.toThrow('A non-empty reason is required');
    });
  });

  describe('overrideAttendanceById (D1-050)', () => {
    it('throws BadRequestException if reason is empty', async () => {
      await expect(
        service.overrideAttendanceById('att-1', AttendanceStatus.ABSENT, { id: 'mgr-1', role: 'MANAGER' }, '')
      ).rejects.toThrow('A non-empty reason is required');
    });

    it('throws NotFoundException if attendance record not found', async () => {
      prismaMock.attendance.findUnique.mockResolvedValue(null);
      await expect(
        service.overrideAttendanceById('att-1', AttendanceStatus.ABSENT, { id: 'mgr-1', role: 'MANAGER' }, 'Because')
      ).rejects.toThrow('Attendance record not found');
    });

    it('throws ForbiddenException if actor is a LEARNER/USER', async () => {
      prismaMock.attendance.findUnique.mockResolvedValue({ id: 'att-1' });
      await expect(
        service.overrideAttendanceById('att-1', AttendanceStatus.ABSENT, { id: 'learner-1', role: 'USER' }, 'Because')
      ).rejects.toThrow('Learners cannot override attendance');
    });

    it('throws ForbiddenException if Manager is not assigned to the batch', async () => {
      prismaMock.attendance.findUnique.mockResolvedValue({
        id: 'att-1',
        enrolment: {
          batch: {
            managerId: 'other-mgr',
            trainers: [{ trainerId: 'other-trainer' }]
          }
        }
      });
      await expect(
        service.overrideAttendanceById('att-1', AttendanceStatus.ABSENT, { id: 'mgr-1', role: 'MANAGER' }, 'Because')
      ).rejects.toThrow('Access denied: You are not assigned to this batch');
    });

    it('succeeds for assigned Manager and creates correct audit log', async () => {
      prismaMock.attendance.findUnique.mockResolvedValue({
        id: 'att-1',
        sessionId: 'sess-1',
        enrolmentId: 'enrol-1',
        status: AttendanceStatus.ABSENT,
        userId: 'learner-1',
        enrolment: {
          batch: {
            managerId: 'mgr-1', // Assigned!
            trainers: []
          }
        }
      });
      prismaMock.attendance.update = vi.fn().mockResolvedValue({ id: 'att-1' });

      await service.overrideAttendanceById('att-1', AttendanceStatus.ABSENT, { id: 'mgr-1', role: 'MANAGER' }, 'Valid reason');

      expect(prismaMock.attendance.update).toHaveBeenCalledWith({
        where: { id: 'att-1' },
        data: {
          status: AttendanceStatus.CORRECTED,
          source: 'MANUAL',
          correctedById: 'mgr-1',
          correctionReason: 'Valid reason',
          updatedById: 'mgr-1',
          overrideReason: 'Valid reason',
        }
      });

      expect(auditLogServiceMock.log).toHaveBeenCalledWith(
        prismaMock,
        expect.objectContaining({
          actorId: 'mgr-1',
          action: 'ATTENDANCE_CORRECTED',
          entityType: 'Attendance',
          entityId: 'att-1',
          reason: 'Valid reason',
        }),
      );
    });

    it('succeeds for Admin bypassing batch assignment', async () => {
      prismaMock.attendance.findUnique.mockResolvedValue({
        id: 'att-1',
        sessionId: 'sess-1',
        enrolmentId: 'enrol-1',
        status: AttendanceStatus.ABSENT,
        userId: 'learner-1',
        enrolment: {
          batch: {
            managerId: 'other-mgr',
            trainers: []
          }
        }
      });
      prismaMock.attendance.update = vi.fn().mockResolvedValue({ id: 'att-1' });

      await service.overrideAttendanceById('att-1', AttendanceStatus.PRESENT_MANUAL, { id: 'admin-1', role: 'ADMIN' }, 'Admin override');

      expect(prismaMock.attendance.update).toHaveBeenCalled();
    });
  });

  describe('checkInWithToken (In-Person QR Check-in Security)', () => {
    it('successfully checks in learner when token matches active session', async () => {
      prismaMock.session.findUnique.mockResolvedValue({
        id: 'sess-qr',
        status: 'SCHEDULED',
        checkinTokenSecret: 'secret-token-123',
        batchId: 'batch-1',
      });
      prismaMock.enrolment.findUnique.mockResolvedValue({ id: 'enr-1', userId: 'user-qr' });
      prismaMock.attendance.upsert.mockResolvedValue({
        id: 'att-qr',
        status: AttendanceStatus.PRESENT,
        source: 'QR_CHECKIN',
      });

      const res = await service.checkInWithToken('sess-qr', 'user-qr', 'secret-token-123');
      expect(res.status).toBe(AttendanceStatus.PRESENT);
      expect(prismaMock.attendance.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            status: AttendanceStatus.PRESENT,
            source: 'QR_CHECKIN',
          }),
        }),
      );
    });

    it('rejects check-in when token does not match', async () => {
      prismaMock.session.findUnique.mockResolvedValue({
        id: 'sess-qr',
        status: 'SCHEDULED',
        checkinTokenSecret: 'secret-token-123',
      });

      await expect(
        service.checkInWithToken('sess-qr', 'user-qr', 'wrong-token'),
      ).rejects.toThrow('Invalid or expired check-in token or QR code');
    });

    it('rejects check-in when session has no secret generated yet', async () => {
      prismaMock.session.findUnique.mockResolvedValue({
        id: 'sess-qr',
        status: 'SCHEDULED',
        checkinTokenSecret: null,
      });

      await expect(
        service.checkInWithToken('sess-qr', 'user-qr', 'any-token'),
      ).rejects.toThrow('Invalid or expired check-in token or QR code');
    });

    it('rejects check-in when session is cancelled', async () => {
      prismaMock.session.findUnique.mockResolvedValue({
        id: 'sess-qr',
        status: 'CANCELLED',
        checkinTokenSecret: 'secret-token-123',
      });

      await expect(
        service.checkInWithToken('sess-qr', 'user-qr', 'secret-token-123'),
      ).rejects.toThrow('Session is cancelled. Check-in is not permitted.');
    });
  });
});
