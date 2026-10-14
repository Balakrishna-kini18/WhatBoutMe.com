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
});
