import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceComplianceService } from './attendance-compliance.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BadRequestException } from '@nestjs/common';
import { AttendanceStatus, SessionStatus, SessionType } from '@prisma/client';

describe('AttendanceComplianceService', () => {
  let service: AttendanceComplianceService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      enrolment: { findUnique: vi.fn() },
      session: { findMany: vi.fn() },
      attendance: { findMany: vi.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceComplianceService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<AttendanceComplianceService>(AttendanceComplianceService);
  });

  const setupMocks = (
    programThreshold: number,
    batchThreshold: number | null,
    requiredSessionCount: number,
    attendances: AttendanceStatus[]
  ) => {
    prismaMock.enrolment.findUnique.mockResolvedValue({
      id: 'enrol-1',
      batchId: 'batch-1',
      batch: {
        attendanceThreshold: batchThreshold,
        program: { attendanceThreshold: programThreshold }
      }
    });

    const mockSessions = Array(requiredSessionCount).fill(0).map((_, i) => ({ id: `sess-${i}` }));
    prismaMock.session.findMany.mockResolvedValue(mockSessions);

    const mockAttendances = attendances.map((status, i) => ({
      sessionId: `sess-${i}`,
      status
    }));
    prismaMock.attendance.findMany.mockResolvedValue(mockAttendances);
  };

  it('1. Default threshold (uses program)', async () => {
    setupMocks(80, null, 10, Array(8).fill(AttendanceStatus.PRESENT_AUTO));
    const result = await service.calculateCompliance('enrol-1');
    expect(result.thresholdUsed).toBe(80);
    expect(result.status).toBe('COMPLIANT'); // 8/10 = 80%
  });

  it('2. Custom batch threshold overrides program threshold', async () => {
    setupMocks(80, 75, 10, Array(8).fill(AttendanceStatus.PRESENT_AUTO));
    const result = await service.calculateCompliance('enrol-1');
    expect(result.thresholdUsed).toBe(75);
    expect(result.status).toBe('COMPLIANT');
  });

  it('3. Exactly-at-threshold passes', async () => {
    setupMocks(75, 75, 4, Array(3).fill(AttendanceStatus.PRESENT_AUTO));
    const result = await service.calculateCompliance('enrol-1');
    expect(result.attendancePercentage).toBe(75);
    expect(result.status).toBe('COMPLIANT');
  });

  it('4. Below-threshold fails', async () => {
    setupMocks(75, 75, 4, Array(2).fill(AttendanceStatus.PRESENT_AUTO));
    const result = await service.calculateCompliance('enrol-1');
    expect(result.attendancePercentage).toBe(50);
    expect(result.status).toBe('NOT_COMPLIANT');
  });

  it('5. 100% attendance passes', async () => {
    setupMocks(80, null, 5, Array(5).fill(AttendanceStatus.PRESENT_AUTO));
    const result = await service.calculateCompliance('enrol-1');
    expect(result.attendancePercentage).toBe(100);
    expect(result.status).toBe('COMPLIANT');
  });

  it('6. 0% attendance fails when required sessions exist', async () => {
    setupMocks(80, null, 5, Array(5).fill(AttendanceStatus.ABSENT));
    const result = await service.calculateCompliance('enrol-1');
    expect(result.attendancePercentage).toBe(0);
    expect(result.status).toBe('NOT_COMPLIANT');
  });

  it('7. Missing attendance counts correctly as non-attendance', async () => {
    // 4 required sessions, only 2 attendance records exist and are PRESENT. 
    // This is 2/4 = 50%
    setupMocks(80, null, 4, Array(2).fill(AttendanceStatus.PRESENT_AUTO));
    const result = await service.calculateCompliance('enrol-1');
    expect(result.attendancePercentage).toBe(50);
    expect(result.status).toBe('NOT_COMPLIANT');
  });

  it('8. Cancelled sessions do not incorrectly reduce compliance (query check)', async () => {
    setupMocks(80, null, 2, Array(2).fill(AttendanceStatus.PRESENT_AUTO));
    await service.calculateCompliance('enrol-1');
    // Verify query explicitly excludes CANCELLED
    expect(prismaMock.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { not: SessionStatus.CANCELLED }
        })
      })
    );
  });

  it('9. Optional/non-required sessions do not incorrectly affect compliance (query check)', async () => {
    setupMocks(80, null, 2, Array(2).fill(AttendanceStatus.PRESENT_AUTO));
    await service.calculateCompliance('enrol-1');
    // Verify query explicitly demands isRequired: true
    expect(prismaMock.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isRequired: true
        })
      })
    );
  });

  it('10. 1:1 sessions do not count as cohort attendance (query check)', async () => {
    setupMocks(80, null, 2, Array(2).fill(AttendanceStatus.PRESENT_AUTO));
    await service.calculateCompliance('enrol-1');
    // Verify query explicitly demands SessionType.GROUP_COHORT
    expect(prismaMock.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sessionType: SessionType.GROUP_COHORT
        })
      })
    );
  });

  it('11. Manual attendance is respected', async () => {
    setupMocks(80, null, 2, [AttendanceStatus.PRESENT_MANUAL, AttendanceStatus.PRESENT_AUTO]);
    const result = await service.calculateCompliance('enrol-1');
    expect(result.attendancePercentage).toBe(100);
    expect(result.status).toBe('COMPLIANT');
  });

  it('12. Corrected attendance is respected', async () => {
    setupMocks(80, null, 2, [AttendanceStatus.CORRECTED, AttendanceStatus.PRESENT_AUTO]);
    const result = await service.calculateCompliance('enrol-1');
    expect(result.attendancePercentage).toBe(100);
    expect(result.status).toBe('COMPLIANT');
  });

  it('13. Invalid threshold values are rejected', async () => {
    setupMocks(150, null, 5, []);
    await expect(service.calculateCompliance('enrol-1')).rejects.toThrow(BadRequestException);

    setupMocks(-10, null, 5, []);
    await expect(service.calculateCompliance('enrol-1')).rejects.toThrow(BadRequestException);
  });

  it('14. No required sessions returns the explicitly defined domain result', async () => {
    setupMocks(80, null, 0, []);
    const result = await service.calculateCompliance('enrol-1');
    expect(result.status).toBe('NOT_APPLICABLE');
    expect(result.requiredSessionCount).toBe(0);
    expect(result.attendedSessionCount).toBe(0);
    expect(result.attendancePercentage).toBe(100);
  });

  it('15. PRESENT status counts towards compliance (Bug #1 backward compatibility)', async () => {
    setupMocks(80, null, 2, [AttendanceStatus.PRESENT, AttendanceStatus.PRESENT_AUTO]);
    const result = await service.calculateCompliance('enrol-1');
    expect(result.attendancePercentage).toBe(100);
    expect(result.status).toBe('COMPLIANT');
  });

  it('16. PRESENT_LIVE and PRESENT_RECORDED statuses count towards compliance', async () => {
    setupMocks(80, null, 2, [
      (AttendanceStatus as any).PRESENT_LIVE,
      (AttendanceStatus as any).PRESENT_RECORDED,
    ]);
    const result = await service.calculateCompliance('enrol-1');
    expect(result.attendancePercentage).toBe(100);
    expect(result.status).toBe('COMPLIANT');
  });

  it('17. Hybrid attendance: cumulative live + recorded minutes satisfy session threshold', async () => {
    prismaMock.enrolment.findUnique.mockResolvedValue({
      id: 'enrol-1',
      batchId: 'batch-1',
      batch: {
        attendanceThreshold: 75,
        program: { attendanceThreshold: 75 },
      },
    });

    prismaMock.session.findMany.mockResolvedValue([
      { id: 'sess-1', durationMinutes: 60, minAttendanceMinutes: 45 },
    ]);

    // 20 min live + 25 min recorded = 45 min >= 45 min threshold (even if status is still ABSENT)
    prismaMock.attendance.findMany.mockResolvedValue([
      {
        sessionId: 'sess-1',
        status: AttendanceStatus.ABSENT,
        liveMinutes: 20,
        recordedMinutes: 25,
      },
    ]);

    const result = await service.calculateCompliance('enrol-1');
    expect(result.attendedSessionCount).toBe(1);
    expect(result.attendancePercentage).toBe(100);
    expect(result.status).toBe('COMPLIANT');
  });
});

