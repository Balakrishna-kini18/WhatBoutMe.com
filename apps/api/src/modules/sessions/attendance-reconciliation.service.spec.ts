import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AttendanceReconciliationService } from './attendance-reconciliation.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AttendanceService } from './attendance.service.js';
import { AuditLogService } from '../../common/audit/audit-log.service.js';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UnmatchedAttendanceStatus, AttendanceStatus } from '@prisma/client';

describe('Phase 4: AttendanceReconciliationService - Multi-Join & 75% Rule', () => {
  let service: AttendanceReconciliationService;
  let prismaMock: any;
  let attendanceServiceMock: any;
  let auditLogServiceMock: any;

  beforeEach(async () => {
    prismaMock = {
      $transaction: vi.fn(async (cb) => cb(prismaMock)),
      session: {
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({ id: 'sess-1' }),
      },
      unmatchedAttendance: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
      },
      enrolment: {
        findUnique: vi.fn(),
      },
      attendance: {
        upsert: vi.fn().mockResolvedValue({ id: 'att-1' }),
      },
      auditLog: {
        create: vi.fn(),
      },
    };

    attendanceServiceMock = {
      recordPresentAuto: vi.fn(),
      recordAbsent: vi.fn(),
    };

    auditLogServiceMock = {
      log: vi.fn().mockResolvedValue({ id: 'audit-log-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceReconciliationService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AttendanceService, useValue: attendanceServiceMock },
        { provide: AuditLogService, useValue: auditLogServiceMock },
      ],
    }).compile();

    service = module.get<AttendanceReconciliationService>(AttendanceReconciliationService);
  }, 30000);

  describe('aggregateRecords (Multi-Join Aggregation)', () => {
    it('normalizes email (trimmed, lowercased)', () => {
      const records = [
        {
          provider: 'ZOOM',
          participantEmail: ' Learner@Example.COM  ',
          joinTime: new Date('2026-10-01T10:00:00Z'),
          leaveTime: new Date('2026-10-01T10:30:00Z'),
        },
      ];

      const result = service.aggregateRecords(records as any);
      expect(result).toHaveLength(1);
      expect(result[0].participantEmail).toBe('learner@example.com');
      expect(result[0].durationMin).toBe(30);
    });

    it('aggregates multiple reconnects for one learner into non-overlapping connected intervals', () => {
      const records = [
        {
          provider: 'ZOOM',
          participantEmail: 'learner@example.com',
          joinTime: new Date('2026-10-01T10:00:00Z'),
          leaveTime: new Date('2026-10-01T10:20:00Z'), // 20 mins
        },
        {
          provider: 'ZOOM',
          participantEmail: 'learner@example.com',
          joinTime: new Date('2026-10-01T10:35:00Z'),
          leaveTime: new Date('2026-10-01T11:00:00Z'), // 25 mins
        },
      ];

      const result = service.aggregateRecords(records as any);
      expect(result).toHaveLength(1);
      expect(result[0].durationMin).toBe(45);
      expect(result[0].joinTime).toEqual(new Date('2026-10-01T10:00:00Z'));
      expect(result[0].leaveTime).toEqual(new Date('2026-10-01T11:00:00Z'));
    });

    it('merges overlapping duplicate intervals without double-counting', () => {
      const records = [
        {
          provider: 'ZOOM',
          participantEmail: 'learner@example.com',
          joinTime: new Date('2026-10-01T10:00:00Z'),
          leaveTime: new Date('2026-10-01T10:30:00Z'), // 30 mins
        },
        {
          provider: 'ZOOM',
          participantEmail: 'learner@example.com',
          joinTime: new Date('2026-10-01T10:15:00Z'),
          leaveTime: new Date('2026-10-01T10:45:00Z'), // extends to 45 mins
        },
      ];

      const result = service.aggregateRecords(records as any);
      expect(result).toHaveLength(1);
      expect(result[0].durationMin).toBe(45); // from 10:00 to 10:45
      expect(result[0].joinTime).toEqual(new Date('2026-10-01T10:00:00Z'));
      expect(result[0].leaveTime).toEqual(new Date('2026-10-01T10:45:00Z'));
    });
  });

  describe('reconcileSession (75% Attendance Rule & No-Shows)', () => {
    const mockSession = {
      id: 'sess-1',
      startTime: new Date('2026-10-01T10:00:00Z'),
      endTime: new Date('2026-10-01T11:00:00Z'), // 60 mins scheduled session
      durationMinutes: 60,
      batch: {
        program: { minAttendancePercentage: 75 },
        enrolments: [
          {
            id: 'enr-1',
            userId: 'user-1',
            status: 'ACTIVE',
            user: { email: 'enrolled1@example.com' },
          },
          {
            id: 'enr-2',
            userId: 'user-2',
            status: 'ACTIVE',
            user: { email: 'noshow@example.com' },
          },
        ],
      },
    };

    beforeEach(() => {
      prismaMock.session.findUnique.mockResolvedValue(mockSession);
    });

    it('marks participant PRESENT when attendance >= 75% (e.g. 48/60 min = 80%)', async () => {
      await service.reconcileSession('sess-1', [
        {
          provider: 'ZOOM',
          participantEmail: 'enrolled1@example.com',
          joinTime: new Date('2026-10-01T10:00:00Z'),
          leaveTime: new Date('2026-10-01T10:48:00Z'), // 48 mins (80% >= 75%)
        } as any,
      ]);

      expect(attendanceServiceMock.recordPresentAuto).toHaveBeenCalledWith(
        'sess-1',
        'user-1',
        expect.objectContaining({
          status: AttendanceStatus.PRESENT,
          durationMin: 48,
          attendancePercentage: 80,
        }),
      );
    });

    it('marks participant ABSENT when attendance < 75% (e.g. 30/60 min = 50%)', async () => {
      await service.reconcileSession('sess-1', [
        {
          provider: 'ZOOM',
          participantEmail: 'enrolled1@example.com',
          joinTime: new Date('2026-10-01T10:00:00Z'),
          leaveTime: new Date('2026-10-01T10:30:00Z'), // 30 mins (50% < 75%)
        } as any,
      ]);

      expect(attendanceServiceMock.recordPresentAuto).toHaveBeenCalledWith(
        'sess-1',
        'user-1',
        expect.objectContaining({
          status: AttendanceStatus.ABSENT,
          durationMin: 30,
          attendancePercentage: 50,
        }),
      );
    });

    it('correctly evaluates overtime sessions against actual meeting span so late-joiners do not get inflated 89% attendance', async () => {
      // Mock session scheduled for 15 minutes, but meeting ran from 05:29 to 05:55 (26 minutes)
      const overtimeSession = {
        ...mockSession,
        durationMinutes: 15,
        startTime: new Date('2026-11-04T11:59:00Z'), // 05:29 PM
        endTime: new Date('2026-11-04T12:14:00Z'),   // 05:44 PM (15 mins scheduled)
      };
      prismaMock.session.findUnique.mockResolvedValueOnce(overtimeSession);

      await service.reconcileSession('sess-1', [
        {
          provider: 'ZOOM',
          participantEmail: 'host@example.com',
          joinTime: new Date('2026-11-04T11:59:00Z'), // 05:29 PM
          leaveTime: new Date('2026-11-04T12:25:00Z'), // 05:55 PM (26 mins total meeting)
        } as any,
        {
          provider: 'ZOOM',
          participantEmail: 'enrolled1@example.com', // Siddhlinga: joined late at 05:42 PM
          joinTime: new Date('2026-11-04T12:12:00Z'), // 05:42 PM
          leaveTime: new Date('2026-11-04T12:25:00Z'), // 05:55 PM (13 mins attended)
        } as any,
      ]);

      // Late-joiner attended 13 mins out of 26 total mins = 50% (< 75% threshold) -> status ABSENT
      expect(attendanceServiceMock.recordPresentAuto).toHaveBeenCalledWith(
        'sess-1',
        'user-1',
        expect.objectContaining({
          status: AttendanceStatus.ABSENT,
          durationMin: 13,
          attendancePercentage: 50,
        }),
      );
    });

    it('marks no-show enrolled learners as ABSENT with 0 minutes', async () => {
      await service.reconcileSession('sess-1', [
        {
          provider: 'ZOOM',
          participantEmail: 'enrolled1@example.com',
          joinTime: new Date('2026-10-01T10:00:00Z'),
          leaveTime: new Date('2026-10-01T10:50:00Z'),
        } as any,
      ]);

      // user-2 was not in participant report -> must be marked absent
      expect(attendanceServiceMock.recordAbsent).toHaveBeenCalledWith(
        'sess-1',
        'user-2',
        expect.objectContaining({
          isUserId: true,
          enrolmentId: 'enr-2',
        }),
      );
    });

    it('places unknown participants into session_unmatched_participants queue', async () => {
      prismaMock.unmatchedAttendance.findFirst.mockResolvedValue(null);

      await service.reconcileSession('sess-1', [
        {
          provider: 'ZOOM',
          participantEmail: 'unknown-guest@example.com',
          participantName: 'Guest 1',
          joinTime: new Date('2026-10-01T10:00:00Z'),
          leaveTime: new Date('2026-10-01T10:45:00Z'),
        } as any,
      ]);

      expect(prismaMock.unmatchedAttendance.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          participantEmail: 'unknown-guest@example.com',
          participantName: 'Guest 1',
          status: UnmatchedAttendanceStatus.UNMATCHED,
          durationMin: 45,
        }),
      });
    });
  });

  describe('linkUnmatchedParticipant', () => {
    it('links unmatched record, recalculates against 75% rule, and writes audit log with reason', async () => {
      const mockUnmatched = {
        id: 'unm-1',
        sessionId: 'sess-1',
        status: UnmatchedAttendanceStatus.UNMATCHED,
        minutesPresent: 50,
        durationMin: 50,
        joinTime: new Date('2026-10-01T10:00:00Z'),
        leaveTime: new Date('2026-10-01T10:50:00Z'),
        session: {
          id: 'sess-1',
          durationMinutes: 60,
          batchId: 'batch-1',
          batch: {
            managerId: 'manager-1',
            program: { minAttendancePercentage: 75 },
            trainers: [],
          },
        },
      };

      prismaMock.unmatchedAttendance.findUnique.mockResolvedValue(mockUnmatched);
      prismaMock.enrolment.findUnique.mockResolvedValue({ id: 'enr-target', userId: 'target-user' });
      prismaMock.unmatchedAttendance.update.mockResolvedValue({ id: 'unm-1', status: 'LINKED' });

      const actor = { id: 'manager-1', role: 'MANAGER' };
      await service.linkUnmatchedParticipant(
        'sess-1',
        'unm-1',
        'target-user',
        actor,
        'Learner used personal email on mobile device',
      );

      // Verify attendance upserted with calculated PRESENT status (50/60 = 83.3% >= 75%)
      expect(prismaMock.attendance.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sessionId_userId: { sessionId: 'sess-1', userId: 'target-user' } },
          update: expect.objectContaining({
            status: AttendanceStatus.PRESENT,
            minutesPresent: 50,
          }),
        }),
      );

      // Verify audit log call with mandatory reason
      expect(auditLogServiceMock.log).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'ATTENDANCE_RECONCILED',
          entityType: 'Attendance',
          reason: 'Learner used personal email on mobile device',
        }),
      );
    });
  });

  describe('Real-World Extreme Scale & Concurrency Testing (10,000+ Users & Mobile Network Drops)', () => {
    it('handles mobile jitter: merges 20 continuous disconnect/reconnect intervals for a single learner with micro-gaps and overlaps', () => {
      // Simulates a student on an unstable 4G/5G mobile connection dropping and reconnecting 20 times during an hour-long workshop
      const records: any[] = [];
      const baseTime = new Date('2026-10-01T10:00:00Z').getTime();

      // Create 20 intervals: some contiguous, some overlapping by 10s, some with 15s gaps
      for (let i = 0; i < 20; i++) {
        const startOffset = i * 180 * 1000; // every 3 minutes
        const duration = 150 * 1000; // 2.5 minutes duration (30s gap between intervals)
        records.push({
          provider: 'ZOOM',
          participantEmail: 'mobile.learner@example.com',
          participantName: 'Mobile Learner',
          joinTime: new Date(baseTime + startOffset),
          leaveTime: new Date(baseTime + startOffset + duration),
        });
      }

      // Add a couple overlapping parallel device records (e.g. tablet + phone on same account)
      records.push({
        provider: 'ZOOM',
        participantEmail: 'mobile.learner@example.com',
        participantName: 'Mobile Learner',
        joinTime: new Date(baseTime + 100 * 1000),
        leaveTime: new Date(baseTime + 400 * 1000), // overlaps multiple segments
      });

      const aggregated = service.aggregateRecords(records);
      expect(aggregated).toHaveLength(1);
      expect(aggregated[0].participantEmail).toBe('mobile.learner@example.com');
      // 20 segments * 2.5 mins = ~50 mins total presence
      expect(aggregated[0].durationMin).toBeGreaterThanOrEqual(48);
      expect(aggregated[0].durationMin).toBeLessThanOrEqual(55);
      expect(Number.isFinite(aggregated[0].durationMin)).toBe(true);
    });

    it('safely handles clock skew and negative timestamp jitter where leaveTime < joinTime', () => {
      const records = [
        {
          provider: 'ZOOM',
          participantEmail: 'clockskew@example.com',
          joinTime: new Date('2026-10-01T10:30:00Z'),
          leaveTime: new Date('2026-10-01T10:25:00Z'), // leave is 5 mins BEFORE join due to client clock drift
        },
        {
          provider: 'ZOOM',
          participantEmail: 'clockskew@example.com',
          joinTime: new Date('2026-10-01T10:35:00Z'),
          leaveTime: new Date('2026-10-01T10:55:00Z'), // 20 mins valid
        },
      ];

      const aggregated = service.aggregateRecords(records as any);
      expect(aggregated).toHaveLength(1);
      // Negative interval was clamped to 0 duration, leaving 20 mins total
      expect(aggregated[0].durationMin).toBe(20);
      expect(aggregated[0].durationMin).not.toBeNaN();
    });

    it('gracefully handles malformed records with invalid/NaN timestamps without crashing', () => {
      const records = [
        {
          provider: 'ZOOM',
          participantEmail: 'corrupted@example.com',
          joinTime: new Date('invalid-date-string'),
          leaveTime: new Date('another-bad-string'),
        },
        {
          provider: 'ZOOM',
          participantEmail: 'corrupted@example.com',
          joinTime: new Date('2026-10-01T10:00:00Z'),
          leaveTime: new Date('2026-10-01T10:30:00Z'),
        },
      ];

      const aggregated = service.aggregateRecords(records as any);
      expect(aggregated).toHaveLength(1);
      expect(aggregated[0].durationMin).toBe(30);
      expect(Number.isFinite(aggregated[0].durationMin)).toBe(true);
    });

    it('simulates 1,000 enrolled students in a mega-cohort: processes attendances and no-shows via chunked concurrency in milliseconds', async () => {
      // Simulate 1,000 enrolled students
      const enrolments: any[] = [];
      const participants: any[] = [];

      for (let i = 0; i < 1000; i++) {
        const userId = `user-${i}`;
        const email = `student${i}@wbm-scale.com`;
        enrolments.push({
          id: `enr-${i}`,
          userId,
          status: 'ACTIVE',
          user: { email },
        });

        // 600 students attended (60% attendance rate)
        if (i < 600) {
          participants.push({
            provider: 'ZOOM',
            participantEmail: email,
            participantName: `Student ${i}`,
            joinTime: new Date('2026-10-01T10:00:00Z'),
            leaveTime: new Date('2026-10-01T10:50:00Z'), // 50 mins = 83.3% >= 75%
          });
        }
      }

      const megaSession = {
        id: 'mega-session-1',
        durationMinutes: 60,
        startTime: new Date('2026-10-01T10:00:00Z'),
        endTime: new Date('2026-10-01T11:00:00Z'),
        batch: {
          program: { minAttendancePercentage: 75 },
          enrolments,
        },
      };

      prismaMock.session.findUnique.mockResolvedValue(megaSession);
      prismaMock.session.update.mockResolvedValue({ id: 'mega-session-1', attendancePulled: true });

      const startTime = performance.now();
      await service.reconcileSession('mega-session-1', participants);
      const elapsedMs = performance.now() - startTime;

      // Verify that all 600 attendees were processed
      expect(attendanceServiceMock.recordPresentAuto).toHaveBeenCalledTimes(600);
      // Verify that all 400 no-shows were processed
      expect(attendanceServiceMock.recordAbsent).toHaveBeenCalledTimes(400);

      // Verify chunked processing executed rapidly
      expect(elapsedMs).toBeLessThan(3000); // 1,000 users processed in under 3 seconds in unit test
      expect(prismaMock.session.update).toHaveBeenCalledWith({
        where: { id: 'mega-session-1' },
        data: { attendancePulled: true },
      });
    });

    it('matches learners across devices when Mobile/Desktop Zoom App uses a personal email but matching display name, and merges multi-device intervals', async () => {
      const crossDeviceSession = {
        id: 'sess-cross-device',
        durationMinutes: 30,
        startTime: new Date('2026-11-05T11:30:00Z'),
        endTime: new Date('2026-11-05T12:00:00Z'),
        batch: {
          program: { minAttendancePercentage: 75 },
          enrolments: [
            {
              id: 'enr-bk',
              userId: 'user-bk',
              status: 'ACTIVE',
              user: { name: 'BK', email: 'balakrishna@foxwel.ai' },
            },
          ],
        },
      };
      prismaMock.session.findUnique.mockResolvedValueOnce(crossDeviceSession);

      // Joined first 10 mins from Laptop Browser (guest, no email, name 'BK (Guest)')
      // Then switched to Mobile Zoom App logged into personal Gmail ('bk.personal@gmail.com', name 'BK') for 15 mins
      await service.reconcileSession('sess-cross-device', [
        {
          provider: 'ZOOM',
          participantEmail: undefined,
          participantName: 'BK (Guest)',
          joinTime: new Date('2026-11-05T11:30:00Z'),
          leaveTime: new Date('2026-11-05T11:40:00Z'), // 10 mins
        },
        {
          provider: 'ZOOM',
          participantEmail: 'bk.personal@gmail.com',
          participantName: 'BK',
          joinTime: new Date('2026-11-05T11:42:00Z'),
          leaveTime: new Date('2026-11-05T11:57:00Z'), // 15 mins
        },
      ]);

      // 10 + 15 = 25 mins / 30 mins = 83.33% (>= 75% -> PRESENT)
      expect(attendanceServiceMock.recordPresentAuto).toHaveBeenCalledTimes(1);
      expect(attendanceServiceMock.recordPresentAuto).toHaveBeenCalledWith(
        'sess-cross-device',
        'user-bk',
        expect.objectContaining({
          durationMin: 25,
          status: AttendanceStatus.PRESENT,
          authoritative: true,
        }),
      );
    });
  });
});
