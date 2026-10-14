import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MeAttendanceController } from './me-attendance.controller.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AttendanceStatus, AttendanceSource } from '@prisma/client';

describe('Phase 5: MeAttendanceController - Learner Dashboard History', () => {
  let controller: MeAttendanceController;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      enrolment: {
        findMany: vi.fn(),
      },
      session: {
        findMany: vi.fn(),
      },
      attendance: {
        findMany: vi.fn(),
      },
    };

    controller = new MeAttendanceController(prismaMock as unknown as PrismaService);
  });

  it('returns learner session attendance history and calculates overall percentage', async () => {
    prismaMock.enrolment.findMany.mockResolvedValue([
      {
        id: 'enr-1',
        batchId: 'batch-1',
        programId: 'prog-1',
        batch: {
          id: 'batch-1',
          name: 'Cohort October',
          program: { id: 'prog-1', title: '11 Steps to U', minAttendancePercentage: 75 },
        },
      },
    ]);

    prismaMock.session.findMany.mockResolvedValue([
      {
        id: 'sess-1',
        title: 'Step 1 Welcome',
        sessionType: 'BATCH_CLASS',
        startTime: new Date('2026-10-01T10:00:00Z'),
        endTime: new Date('2026-10-01T11:00:00Z'),
        durationMinutes: 60,
        meetingProvider: 'ZOOM',
        joinUrl: 'https://zoom.us/j/1',
        recordingUrl: 'https://zoom.us/rec/1',
        batch: { name: 'Cohort October', program: { title: '11 Steps to U', minAttendancePercentage: 75 } },
      },
      {
        id: 'sess-2',
        title: 'Step 2 Deep Dive',
        sessionType: 'BATCH_CLASS',
        startTime: new Date('2026-10-08T10:00:00Z'),
        endTime: new Date('2026-10-08T11:00:00Z'),
        durationMinutes: 60,
        meetingProvider: 'ZOOM',
        joinUrl: 'https://zoom.us/j/2',
        recordingUrl: null,
        batch: { name: 'Cohort October', program: { title: '11 Steps to U', minAttendancePercentage: 75 } },
      },
    ]);

    prismaMock.attendance.findMany.mockResolvedValue([
      {
        sessionId: 'sess-1',
        userId: 'learner-1',
        status: AttendanceStatus.PRESENT,
        source: AttendanceSource.AUTO,
        minutesPresent: 55,
        attendancePercentage: 91.6,
        joinTime: new Date('2026-10-01T10:02:00Z'),
        leaveTime: new Date('2026-10-01T10:57:00Z'),
      },
    ]);

    const req = { user: { sub: 'learner-1', role: 'USER' } };
    const result = await controller.getMyAttendance(req);

    expect(result.totalScheduledSessions).toBe(2);
    expect(result.totalAttendedSessions).toBe(1);
    expect(result.overallAttendancePercentage).toBe(50); // 1 out of 2 = 50%
    expect(result.history).toHaveLength(2);
    expect(result.history[0].status).toBe(AttendanceStatus.PRESENT);
    expect(result.history[1].status).toBe(AttendanceStatus.ABSENT);
  });
});
