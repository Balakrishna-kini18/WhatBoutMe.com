import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BatchAttendanceController } from './batch-attendance.controller.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AttendanceService } from './attendance.service.js';
import { AttendanceReconciliationService } from './attendance-reconciliation.service.js';
import { CertificatesService } from '../certificates/certificates.service.js';
import { NotFoundException } from '@nestjs/common';
import { AttendanceStatus, AttendanceSource } from '@prisma/client';

describe('Phase 5: BatchAttendanceController Integration & Endpoint Tests', () => {
  let controller: BatchAttendanceController;
  let prismaMock: any;
  let attendanceServiceMock: any;
  let reconciliationServiceMock: any;
  let certificatesServiceMock: any;

  beforeEach(() => {
    prismaMock = {
      session: {
        findUnique: vi.fn(),
      },
      attendance: {
        findMany: vi.fn(),
      },
      unmatchedAttendance: {
        findMany: vi.fn(),
      },
    };

    attendanceServiceMock = {
      updateAttendanceRecord: vi.fn(),
    };

    reconciliationServiceMock = {
      linkUnmatchedParticipant: vi.fn(),
      reconcileSession: vi.fn(),
    };

    certificatesServiceMock = {
      checkAndTriggerCertificateEligibility: vi.fn(),
    };

    controller = new BatchAttendanceController(
      prismaMock as unknown as PrismaService,
      attendanceServiceMock as unknown as AttendanceService,
      reconciliationServiceMock as unknown as AttendanceReconciliationService,
      certificatesServiceMock as unknown as CertificatesService,
    );
  });

  describe('GET /api/batches/:batchId/sessions/:sessionId/attendance', () => {
    it('returns session summary, 75% threshold rule, and enrolled learners with attendance status and source', async () => {
      const mockSession = {
        id: 'sess-100',
        batchId: 'batch-200',
        title: 'Vision Board Live Session',
        sessionType: 'BATCH_CLASS',
        startTime: new Date('2026-10-15T10:00:00Z'),
        endTime: new Date('2026-10-15T11:00:00Z'),
        durationMinutes: 60,
        meetingProvider: 'ZOOM',
        meetingLink: 'https://zoom.us/j/123456',
        recordingLink: null,
        batch: {
          program: { minAttendancePercentage: 75 },
          enrolments: [
            {
              id: 'enr-1',
              userId: 'user-1',
              user: { name: 'Alice Smith', email: 'alice@example.com' },
            },
          ],
        },
      };

      prismaMock.session.findUnique.mockResolvedValue(mockSession);
      prismaMock.attendance.findMany.mockResolvedValue([
        {
          id: 'att-1',
          sessionId: 'sess-100',
          userId: 'user-1',
          status: AttendanceStatus.PRESENT,
          source: AttendanceSource.AUTO,
          minutesPresent: 50,
          attendancePercentage: 83.3,
          joinTime: new Date('2026-10-15T10:05:00Z'),
          leaveTime: new Date('2026-10-15T10:55:00Z'),
          overrideReason: null,
        },
      ]);

      const result = await controller.getBatchSessionAttendance('batch-200', 'sess-100');

      expect(result.thresholdPercentage).toBe(75);
      expect(result.session.id).toBe('sess-100');
      expect(result.learners).toHaveLength(1);
      expect(result.learners[0]).toEqual(
        expect.objectContaining({
          userId: 'user-1',
          name: 'Alice Smith',
          status: AttendanceStatus.PRESENT,
          source: AttendanceSource.AUTO,
          minutesPresent: 50,
        }),
      );
    });

    it('self-heals mid-session leavers who had stale 100% PRESENT when another learner stayed for the full 32m overtime session', async () => {
      const mockSession = {
        id: '2069107a-33a9-4151-b3a2-78c2dc1ab1d2',
        batchId: '1b1bf560-96c4-4932-acca-32dc411c9a37',
        title: 'Introdcuon section',
        sessionType: 'BATCH_CLASS',
        startTime: new Date('2026-11-05T11:29:00Z'),
        endTime: new Date('2026-11-05T11:49:00Z'),
        durationMinutes: 20, // originally 20m scheduled, but ran 32m
        meetingProvider: 'ZOOM',
        batch: {
          program: { minAttendancePercentage: 75 },
          enrolments: [
            { id: 'enr-bk', userId: 'u-bk', user: { name: 'BK', email: 'balakrishna@foxwel.ai' } },
            { id: 'enr-sah', userId: 'u-sah', user: { name: 'sahyadri', email: 'gagan.cs22@sahyadri.edu.in' } },
            { id: 'enr-sid', userId: 'u-sid', user: { name: 'siddhlinga', email: 'kamathbro99@gmail.com' } },
            { id: 'enr-vig', userId: 'u-vig', user: { name: 'vignesh pai', email: 'vigneshpai2018@gmail.com' } },
          ],
        },
      };

      prismaMock.session.findUnique.mockResolvedValue(mockSession);
      prismaMock.attendance.update = vi.fn().mockResolvedValue({});
      prismaMock.attendance.findMany.mockResolvedValue([
        {
          id: 'att-bk',
          sessionId: mockSession.id,
          userId: 'u-bk',
          status: AttendanceStatus.PRESENT_AUTO,
          source: AttendanceSource.AUTO,
          minutesPresent: 21,
          attendancePercentage: 100, // stale 100% from when BK left at 05:20 PM
          joinTime: new Date('2026-11-05T11:25:00Z'),
          leaveTime: new Date('2026-11-05T11:50:00Z'),
        },
        {
          id: 'att-sah',
          sessionId: mockSession.id,
          userId: 'u-sah',
          status: AttendanceStatus.ABSENT,
          source: AttendanceSource.AUTO,
          minutesPresent: 7,
          attendancePercentage: 36,
          joinTime: new Date('2026-11-05T11:40:00Z'),
          leaveTime: new Date('2026-11-05T11:47:00Z'),
        },
        {
          id: 'att-sid',
          sessionId: mockSession.id,
          userId: 'u-sid',
          status: AttendanceStatus.PRESENT_AUTO,
          source: AttendanceSource.AUTO,
          minutesPresent: 21,
          attendancePercentage: 100, // stale 100% from when siddhlinga left at 05:21 PM
          joinTime: new Date('2026-11-05T11:27:00Z'),
          leaveTime: new Date('2026-11-05T11:51:00Z'),
        },
        {
          id: 'att-vig',
          sessionId: mockSession.id,
          userId: 'u-vig',
          status: AttendanceStatus.PRESENT_AUTO,
          source: AttendanceSource.AUTO,
          minutesPresent: 32,
          attendancePercentage: 100, // stayed full 32m until 05:31 PM
          joinTime: new Date('2026-11-05T11:25:00Z'),
          leaveTime: new Date('2026-11-05T12:01:00Z'),
        },
      ]);

      const result = await controller.getBatchSessionAttendance(mockSession.batchId, mockSession.id);

      // Only vignesh pai (32/32 = 100%) should be PRESENT; BK and siddhlinga (21/32 = 65.63% < 75%) become ABSENT (PARTIAL 66%)
      expect(result.presentCount).toBe(1);
      const bk = result.learners.find((l) => l.userId === 'u-bk')!;
      const sid = result.learners.find((l) => l.userId === 'u-sid')!;
      const vig = result.learners.find((l) => l.userId === 'u-vig')!;
      expect(bk.status).toBe(AttendanceStatus.ABSENT);
      expect(Math.round(bk.attendancePercentage)).toBe(66);
      expect(sid.status).toBe(AttendanceStatus.ABSENT);
      expect(Math.round(sid.attendancePercentage)).toBe(66);
      expect(vig.status).toBe(AttendanceStatus.PRESENT_AUTO);
      expect(vig.attendancePercentage).toBe(100);
    });

    it('throws NotFoundException if session does not belong to the batch', async () => {
      prismaMock.session.findUnique.mockResolvedValue({
        id: 'sess-other',
        batchId: 'batch-different',
      });

      await expect(
        controller.getBatchSessionAttendance('batch-200', 'sess-other'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('PATCH /api/batches/:batchId/sessions/:sessionId/attendance/:userId', () => {
    it('manually overrides attendance, sets source MANUAL, and triggers certificate eligibility check', async () => {
      const mockReq = {
        user: { sub: 'manager-1', role: 'MANAGER' },
      };

      attendanceServiceMock.updateAttendanceRecord.mockResolvedValue({
        id: 'att-1',
        sessionId: 'sess-100',
        userId: 'user-1',
        enrolmentId: 'enr-1',
        status: AttendanceStatus.PRESENT,
        source: AttendanceSource.MANUAL,
      });

      const body = {
        status: AttendanceStatus.PRESENT,
        minutesPresent: 60,
        reason: 'Learner was physically present and verified by manager',
      };

      const result = await controller.overrideLearnerAttendance(
        'batch-200',
        'sess-100',
        'user-1',
        body,
        mockReq,
      );

      expect(attendanceServiceMock.updateAttendanceRecord).toHaveBeenCalledWith(
        'sess-100',
        'user-1',
        body,
        { id: 'manager-1', role: 'MANAGER' },
      );
      expect(
        certificatesServiceMock.checkAndTriggerCertificateEligibility,
      ).toHaveBeenCalledWith('enr-1', 'manager-1');
      expect(result.source).toBe(AttendanceSource.MANUAL);
    });
  });

  describe('GET /api/batches/:batchId/sessions/:sessionId/reconciliation', () => {
    it('returns unmatched participant list alongside unlinked batch learners', async () => {
      const mockSession = {
        id: 'sess-100',
        batchId: 'batch-200',
        title: 'Vision Board Live Session',
        durationMinutes: 60,
        batch: {
          enrolments: [
            {
              id: 'enr-absent',
              userId: 'user-absent',
              user: { name: 'Bob Absent', email: 'bob@example.com' },
            },
          ],
        },
      };

      prismaMock.session.findUnique.mockResolvedValue(mockSession);
      prismaMock.unmatchedAttendance.findMany.mockResolvedValue([
        {
          id: 'unm-1',
          participantName: 'Guest iPhone',
          participantEmail: null,
          minutesPresent: 45,
          durationMin: 45,
          joinTime: new Date('2026-10-15T10:00:00Z'),
          leaveTime: new Date('2026-10-15T10:45:00Z'),
          rawPayload: {},
        },
      ]);
      prismaMock.attendance.findMany.mockResolvedValue([]); // No one is present yet

      const result = await controller.getReconciliationData('batch-200', 'sess-100');

      expect(result.unmatched).toHaveLength(1);
      expect(result.unmatched[0].participantName).toBe('Guest iPhone');
      expect(result.unlinkedLearners).toHaveLength(1);
      expect(result.unlinkedLearners[0].userId).toBe('user-absent');
    });
  });

  describe('POST /api/batches/:batchId/sessions/:sessionId/reconciliation/:unmatchedId/link', () => {
    it('links unmatched record to chosen user', async () => {
      const mockReq = {
        user: { sub: 'manager-1', role: 'MANAGER' },
      };

      reconciliationServiceMock.linkUnmatchedParticipant.mockResolvedValue({
        id: 'unm-1',
        status: 'LINKED',
        linkedUserId: 'user-absent',
      });

      const body = {
        userId: 'user-absent',
        reason: 'Confirmed Bob joined via phone hotspot',
      };

      const result = await controller.linkUnmatchedParticipant(
        'batch-200',
        'sess-100',
        'unm-1',
        body,
        mockReq,
      );

      expect(reconciliationServiceMock.linkUnmatchedParticipant).toHaveBeenCalledWith(
        'sess-100',
        'unm-1',
        'user-absent',
        { id: 'manager-1', role: 'MANAGER' },
        'Confirmed Bob joined via phone hotspot',
      );
      expect(result.status).toBe('LINKED');
    });
  });

  describe('POST /api/batches/:batchId/sessions/:sessionId/sync-attendance', () => {
    it('returns success: false with message if session has no meeting ID or valid link', async () => {
      prismaMock.session.findUnique.mockResolvedValue({
        id: 'sess-100',
        batchId: 'batch-200',
        providerMeetingId: null,
        zoomMeetingId: null,
        meetingLink: null,
        joinUrl: null,
      });

      const result = await controller.syncSessionAttendance('batch-200', 'sess-100');

      expect(result.success).toBe(false);
      expect(result.participantCount).toBe(0);
      expect(result.message).toContain('No meeting ID');
      expect(reconciliationServiceMock.reconcileSession).not.toHaveBeenCalled();
    });

    it('guards against empty participant reports and prevents accidental no-show marking', async () => {
      prismaMock.session.findUnique.mockResolvedValue({
        id: 'sess-100',
        batchId: 'batch-200',
        providerMeetingId: '987654321',
        meetingProvider: 'ZOOM',
      });

      const meetingProviderMock = {
        getParticipantReport: vi.fn().mockResolvedValue([]),
      };
      (controller as any).meetingProvider = meetingProviderMock;

      const result = await controller.syncSessionAttendance('batch-200', 'sess-100');

      expect(result.success).toBe(false);
      expect(result.participantCount).toBe(0);
      expect(result.message).toContain('No participant report returned by Zoom API');
      expect(reconciliationServiceMock.reconcileSession).not.toHaveBeenCalled();
    });

    it('extracts meetingId from joinUrl regex and reconciles participants successfully', async () => {
      prismaMock.session.findUnique.mockResolvedValue({
        id: 'sess-100',
        batchId: 'batch-200',
        providerMeetingId: null,
        zoomMeetingId: null,
        joinUrl: 'https://zoom.us/j/987654321?pwd=abc',
        meetingProvider: 'ZOOM',
        startTime: new Date('2026-10-15T10:00:00Z'),
        endTime: new Date('2026-10-15T11:00:00Z'),
      });

      const mockParticipants = [
        {
          userEmail: 'alice@example.com',
          name: 'Alice Smith',
          joinTime: '2026-10-15T10:00:00Z',
          leaveTime: '2026-10-15T11:00:00Z',
        },
      ];

      const meetingProviderMock = {
        getParticipantReport: vi.fn().mockResolvedValue(mockParticipants),
      };
      (controller as any).meetingProvider = meetingProviderMock;
      reconciliationServiceMock.reconcileSession = vi.fn().mockResolvedValue({ success: true });

      const result = await controller.syncSessionAttendance('batch-200', 'sess-100');

      expect(meetingProviderMock.getParticipantReport).toHaveBeenCalledWith('987654321');
      expect(reconciliationServiceMock.reconcileSession).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.participantCount).toBe(1);
    });
  });
});
