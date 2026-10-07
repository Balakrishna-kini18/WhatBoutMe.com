import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceService } from './attendance.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AttendanceStatus } from '@prisma/client';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as dailyAttendance from '../../common/daily-attendance.js';

describe('AttendanceService', () => {
  let service: AttendanceService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      $transaction: vi.fn(async (cb) => cb(prismaMock)),
      attendance: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
      },
      enrolment: {
        findUnique: vi.fn(),
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
      prismaMock.attendance.findUnique.mockResolvedValue(null);
      prismaMock.attendance.upsert.mockResolvedValue({ id: 'att-1', status: AttendanceStatus.ABSENT });

      const result = await service.recordAbsent('sess-1', 'enrol-1');

      expect(prismaMock.attendance.upsert).toHaveBeenCalledWith({
        where: { sessionId_enrolmentId: { sessionId: 'sess-1', enrolmentId: 'enrol-1' } },
        update: { status: AttendanceStatus.ABSENT },
        create: {
          sessionId: 'sess-1',
          enrolmentId: 'enrol-1',
          status: AttendanceStatus.ABSENT,
        },
      });
      expect(result.status).toBe(AttendanceStatus.ABSENT);
    });

    it('does not overwrite a PRESENT_MANUAL status', async () => {
      const existing = { id: 'att-1', status: AttendanceStatus.PRESENT_MANUAL };
      prismaMock.attendance.findUnique.mockResolvedValue(existing);

      const result = await service.recordAbsent('sess-1', 'enrol-1');

      expect(prismaMock.attendance.upsert).not.toHaveBeenCalled();
      expect(result).toBe(existing); // returns existing instead
    });

    it('does not overwrite a CORRECTED status', async () => {
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
      const result = await service.recordPresentAuto('sess-1', 'enrol-1', { joinTime, durationMin: 60 });

      expect(prismaMock.enrolment.findUnique).toHaveBeenCalledWith({ where: { id: 'enrol-1' }, select: { userId: true } });
      expect(prismaMock.attendance.upsert).toHaveBeenCalledWith({
        where: { sessionId_enrolmentId: { sessionId: 'sess-1', enrolmentId: 'enrol-1' } },
        update: { status: AttendanceStatus.PRESENT_AUTO, joinTime, leaveTime: undefined, durationMin: 60 },
        create: {
          sessionId: 'sess-1',
          enrolmentId: 'enrol-1',
          userId: 'user-1',
          status: AttendanceStatus.PRESENT_AUTO,
          joinTime,
          leaveTime: undefined,
          durationMin: 60,
        },
      });
      expect(dailyAttendance.markDailyAttendance).toHaveBeenCalledWith(prismaMock, 'user-1', 'sessionJoined');
    });

    it('does not overwrite a PRESENT_MANUAL status with automated data', async () => {
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

      const result = await service.recordPresentManual('sess-1', 'enrol-1', 'admin-user-1', 'Trainer says they were there');

      expect(prismaMock.attendance.upsert).toHaveBeenCalledWith({
        where: { sessionId_enrolmentId: { sessionId: 'sess-1', enrolmentId: 'enrol-1' } },
        update: {
          status: AttendanceStatus.PRESENT_MANUAL,
          correctedById: 'admin-user-1',
          correctionReason: 'Trainer says they were there',
        },
        create: expect.objectContaining({
          status: AttendanceStatus.PRESENT_MANUAL,
          correctedById: 'admin-user-1',
          correctionReason: 'Trainer says they were there',
        }),
      });

      expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'ATTENDANCE_MARKED_MANUAL',
          actorId: 'admin-user-1',
          entityId: 'att-1',
        }),
      });

      expect(dailyAttendance.markDailyAttendance).toHaveBeenCalledWith(prismaMock, 'user-1', 'sessionJoined');
    });
  });

  describe('correctAttendance', () => {
    it('creates or updates attendance to CORRECTED and creates an audit log', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({ userId: 'user-1' });
      const existing = { id: 'att-1', status: AttendanceStatus.ABSENT };
      prismaMock.attendance.findUnique.mockResolvedValue(existing);
      prismaMock.attendance.upsert.mockResolvedValue({ id: 'att-1', status: AttendanceStatus.CORRECTED });

      const result = await service.correctAttendance('sess-1', 'enrol-1', AttendanceStatus.PRESENT_MANUAL, 'admin-user-1', 'Fixed glitch in Zoom reporting');

      expect(prismaMock.attendance.upsert).toHaveBeenCalledWith({
        where: { sessionId_enrolmentId: { sessionId: 'sess-1', enrolmentId: 'enrol-1' } },
        update: {
          status: AttendanceStatus.CORRECTED,
          correctedById: 'admin-user-1',
          correctionReason: 'Fixed glitch in Zoom reporting',
        },
        create: expect.objectContaining({
          status: AttendanceStatus.CORRECTED,
        }),
      });

      expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'ATTENDANCE_CORRECTED',
          actorId: 'admin-user-1',
          entityId: 'att-1',
          meta: expect.objectContaining({ previousStatus: AttendanceStatus.ABSENT }),
        }),
      });
      
      expect(dailyAttendance.markDailyAttendance).toHaveBeenCalledWith(prismaMock, 'user-1', 'sessionJoined');
    });

    it('requires a reason for correction', async () => {
      await expect(service.correctAttendance('sess-1', 'enrol-1', AttendanceStatus.PRESENT_MANUAL, 'admin-1', ''))
        .rejects.toThrow('reason is required');
    });
  });
});
