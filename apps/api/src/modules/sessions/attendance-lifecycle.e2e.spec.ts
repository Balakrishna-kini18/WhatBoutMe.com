import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AttendanceReconciliationService } from './attendance-reconciliation.service.js';
import { AttendanceService } from './attendance.service.js';
import { SessionCheckinController } from './session-checkin.controller.js';
import { BatchAttendanceController } from './batch-attendance.controller.js';
import { MeAttendanceController } from './me-attendance.controller.js';
import { ReportsService } from '../reports/reports.service.js';
import { CertificateEligibilityService } from '../certificates/certificate-eligibility.service.js';
import { AuditLogService } from '../../common/audit/audit-log.service.js';
import { AttendanceStatus, AttendanceSource, UnmatchedAttendanceStatus } from '@prisma/client';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

describe('End-to-End Attendance Tracking & Reconciliation Lifecycle Verification', () => {
  let prismaMock: any;
  let auditLogService: AuditLogService;
  let attendanceService: AttendanceService;
  let reconciliationService: AttendanceReconciliationService;
  let checkinController: SessionCheckinController;
  let batchAttendanceController: BatchAttendanceController;
  let meAttendanceController: MeAttendanceController;
  let reportsService: ReportsService;
  let eligibilityService: CertificateEligibilityService;

  // In-memory mock database state
  let dbSessions: Map<string, any>;
  let dbAttendances: Map<string, any>;
  let dbUnmatched: Map<string, any>;
  let dbAuditLogs: any[];
  let dbEnrolments: Map<string, any>;

  beforeEach(() => {
    dbSessions = new Map();
    dbAttendances = new Map();
    dbUnmatched = new Map();
    dbAuditLogs = [];
    dbEnrolments = new Map();

    prismaMock = {
      $transaction: vi.fn(async (cb) => cb(prismaMock)),
      session: {
        findUnique: vi.fn(async ({ where }) => dbSessions.get(where.id) || null),
        update: vi.fn(async ({ where, data }) => {
          const s = dbSessions.get(where.id);
          if (s) Object.assign(s, data);
          return s;
        }),
      },
      attendance: {
        findUnique: vi.fn(async ({ where }) => {
          const key = `${where.sessionId_userId.sessionId}_${where.sessionId_userId.userId}`;
          return dbAttendances.get(key) || null;
        }),
        findMany: vi.fn(async ({ where }) => {
          return Array.from(dbAttendances.values()).filter((a) => a.sessionId === where.sessionId);
        }),
        upsert: vi.fn(async ({ where, create, update }) => {
          const key = `${where.sessionId_userId.sessionId}_${where.sessionId_userId.userId}`;
          const existing = dbAttendances.get(key);
          const record = existing ? { ...existing, ...update } : { id: `att-${Date.now()}-${Math.random()}`, ...create };
          dbAttendances.set(key, record);
          return record;
        }),
        update: vi.fn(async ({ where, data }) => {
          let target: any = null;
          for (const a of dbAttendances.values()) {
            if (a.id === where.id) {
              Object.assign(a, data);
              target = a;
              break;
            }
          }
          return target;
        }),
      },
      unmatchedAttendance: {
        findUnique: vi.fn(async ({ where }) => {
          const u = dbUnmatched.get(where.id);
          if (!u) return null;
          const s = dbSessions.get(u.sessionId);
          return { ...u, session: s };
        }),
        findMany: vi.fn(async ({ where }) => {
          return Array.from(dbUnmatched.values()).filter(
            (u) => u.sessionId === where.sessionId && (!where.status || u.status === where.status),
          );
        }),
        create: vi.fn(async ({ data }) => {
          const id = `unm-${Date.now()}-${Math.random()}`;
          const record = { id, ...data };
          dbUnmatched.set(id, record);
          return record;
        }),
        update: vi.fn(async ({ where, data }) => {
          const u = dbUnmatched.get(where.id);
          if (u) Object.assign(u, data);
          return u;
        }),
      },
      dailyAttendance: {
        upsert: vi.fn(async () => ({})),
      },
      enrolment: {
        findUnique: vi.fn(async ({ where }) => {
          if (where.userId_batchId) {
            const key = `${where.userId_batchId.userId}_${where.userId_batchId.batchId}`;
            return dbEnrolments.get(key) || null;
          }
          if (where.id) {
            for (const e of dbEnrolments.values()) {
              if (e.id === where.id) return e;
            }
          }
          return null;
        }),
      },
      auditLog: {
        create: vi.fn(async ({ data }) => {
          const log = { id: `audit-${dbAuditLogs.length + 1}`, ...data };
          dbAuditLogs.push(log);
          return log;
        }),
      },
    };

    auditLogService = new AuditLogService(prismaMock);
    attendanceService = new AttendanceService(prismaMock, auditLogService);
    reconciliationService = new AttendanceReconciliationService(prismaMock, attendanceService, auditLogService);
    checkinController = new SessionCheckinController(prismaMock, attendanceService);

    const mockCertificatesService: any = {
      checkAndTriggerCertificateEligibility: vi.fn().mockResolvedValue(undefined),
    };

    batchAttendanceController = new BatchAttendanceController(
      prismaMock,
      attendanceService,
      reconciliationService,
      mockCertificatesService,
    );

    meAttendanceController = new MeAttendanceController(prismaMock);
    reportsService = new ReportsService(prismaMock);

    eligibilityService = new CertificateEligibilityService(
      prismaMock,
      {} as any,
    );
  });

  it('verifies the full end-to-end lifecycle of attendance tracking, reconciliation, QR check-in, audit logs, and reports', async () => {
    // -------------------------------------------------------------
    // STEP 1: Setup Cohort, Program (75% Threshold), and Learners
    // -------------------------------------------------------------
    const batchId = 'batch-vision-2026';
    const sessionId = 'session-live-01';

    const learnerA = { id: 'usr-alice', email: 'alice@wbm.com', name: 'Alice Smith' };
    const learnerB = { id: 'usr-bob', email: 'bob@wbm.com', name: 'Bob Jones' };
    const learnerC = { id: 'usr-charlie', email: 'charlie@wbm.com', name: 'Charlie Brown' };

    const enrolments = [
      { id: 'enr-alice', userId: learnerA.id, batchId, status: 'ACTIVE', user: learnerA },
      { id: 'enr-bob', userId: learnerB.id, batchId, status: 'ACTIVE', user: learnerB },
      { id: 'enr-charlie', userId: learnerC.id, batchId, status: 'ACTIVE', user: learnerC },
    ];

    for (const e of enrolments) {
      dbEnrolments.set(`${e.userId}_${e.batchId}`, e);
    }

    const testSession = {
      id: sessionId,
      batchId,
      title: '11 Steps to U: Session 1 - Values & Purpose',
      durationMinutes: 60,
      startTime: new Date('2026-10-15T10:00:00Z'),
      endTime: new Date('2026-10-15T11:00:00Z'),
      status: 'SCHEDULED',
      attendancePulled: false,
      checkinTokenSecret: null,
      batch: {
        id: batchId,
        managerId: 'manager-1',
        program: { minAttendancePercentage: 75, slug: '11-steps-to-u' },
        enrolments,
        trainers: [],
      },
    };

    dbSessions.set(sessionId, testSession);

    // -------------------------------------------------------------
    // STEP 2: Meeting Ends -> Feed Raw Zoom Webhook Data
    // -------------------------------------------------------------
    const rawParticipantRecords = [
      {
        provider: 'ZOOM',
        participantEmail: 'alice@wbm.com',
        participantName: 'Alice S',
        joinTime: new Date('2026-10-15T10:00:00Z'),
        leaveTime: new Date('2026-10-15T10:50:00Z'), // 50 mins
      },
      {
        provider: 'ZOOM',
        participantEmail: 'bob@wbm.com',
        participantName: 'Bob J',
        joinTime: new Date('2026-10-15T10:00:00Z'),
        leaveTime: new Date('2026-10-15T10:30:00Z'), // 30 mins
      },
      {
        provider: 'ZOOM',
        participantEmail: 'ninja_charlie@gmail.com', // Charlie's personal phone email
        participantName: 'Charlie Mobile',
        joinTime: new Date('2026-10-15T10:05:00Z'),
        leaveTime: new Date('2026-10-15T10:53:00Z'), // 48 mins
      },
    ];

    await reconciliationService.reconcileSession(sessionId, rawParticipantRecords);

    // Verify Session attendancePulled is true
    expect(testSession.attendancePulled).toBe(true);

    // Verify Alice: PRESENT (>= 75%)
    const aliceAtt = dbAttendances.get(`${sessionId}_${learnerA.id}`);
    expect(aliceAtt).toBeDefined();
    expect(aliceAtt.status).toBe(AttendanceStatus.PRESENT);
    expect(aliceAtt.minutesPresent).toBe(50);
    expect(aliceAtt.attendancePercentage).toBeCloseTo(83.33, 1);
    expect(aliceAtt.source).toBe(AttendanceSource.AUTO);

    // Verify Bob: ABSENT (< 75%)
    const bobAtt = dbAttendances.get(`${sessionId}_${learnerB.id}`);
    expect(bobAtt).toBeDefined();
    expect(bobAtt.status).toBe(AttendanceStatus.ABSENT);
    expect(bobAtt.minutesPresent).toBe(30);
    expect(bobAtt.attendancePercentage).toBe(50);

    // Verify Charlie: No-show ABSENT (0 min)
    const charlieAtt = dbAttendances.get(`${sessionId}_${learnerC.id}`);
    expect(charlieAtt).toBeDefined();
    expect(charlieAtt.status).toBe(AttendanceStatus.ABSENT);
    expect(charlieAtt.minutesPresent).toBe(0);

    // Verify Unmatched Guest Queued
    const unmatchedRecords = Array.from(dbUnmatched.values());
    expect(unmatchedRecords).toHaveLength(1);
    const guestRecord = unmatchedRecords[0];
    expect(guestRecord.participantEmail).toBe('ninja_charlie@gmail.com');
    expect(guestRecord.status).toBe(UnmatchedAttendanceStatus.UNMATCHED);
    expect(guestRecord.minutesPresent).toBe(48);

    // -------------------------------------------------------------
    // STEP 3: Admin Reviews Queue & Links Unmatched Guest to Charlie
    // -------------------------------------------------------------
    const managerActor = { id: 'manager-1', role: 'MANAGER' };
    await reconciliationService.linkUnmatchedParticipant(
      sessionId,
      guestRecord.id,
      learnerC.id,
      managerActor,
      'Charlie confirmed joining from personal phone during commute',
    );

    // Unmatched record updated to LINKED
    expect(guestRecord.status).toBe(UnmatchedAttendanceStatus.LINKED);
    expect(guestRecord.linkedUserId).toBe(learnerC.id);

    // Charlie's attendance updated to PRESENT (48/60 = 80% >= 75%)
    const charlieUpdatedAtt = dbAttendances.get(`${sessionId}_${learnerC.id}`);
    expect(charlieUpdatedAtt.status).toBe(AttendanceStatus.PRESENT);
    expect(charlieUpdatedAtt.minutesPresent).toBe(48);

    // Audit log created with mandatory reason
    expect(dbAuditLogs).toContainEqual(
      expect.objectContaining({
        action: 'ATTENDANCE_RECONCILED',
        actorId: 'manager-1',
        entity: 'Attendance',
        meta: expect.objectContaining({
          reason: 'Charlie confirmed joining from personal phone during commute',
        }),
      }),
    );

    // -------------------------------------------------------------
    // STEP 4: Manual Override (Bob's Absent -> Present with Mandatory Reason)
    // -------------------------------------------------------------
    // First, verify omitting reason throws BadRequestException
    await expect(
      attendanceService.updateAttendanceRecord(
        sessionId,
        learnerB.id,
        { status: AttendanceStatus.PRESENT, minutesPresent: 60, reason: '' },
        managerActor,
      ),
    ).rejects.toThrow(BadRequestException);

    // Perform valid override
    await attendanceService.updateAttendanceRecord(
      sessionId,
      learnerB.id,
      {
        status: AttendanceStatus.PRESENT,
        minutesPresent: 60,
        reason: 'Learner was granted an approved make-up oral assessment',
      },
      managerActor,
    );

    const bobUpdatedAtt = dbAttendances.get(`${sessionId}_${learnerB.id}`);
    expect(bobUpdatedAtt.status).toBe(AttendanceStatus.PRESENT);
    expect(bobUpdatedAtt.source).toBe(AttendanceSource.MANUAL);
    expect(bobUpdatedAtt.correctionReason).toBe('Learner was granted an approved make-up oral assessment');

    // Audit log recorded for Bob's override
    expect(dbAuditLogs).toContainEqual(
      expect.objectContaining({
        action: 'ATTENDANCE_MANUAL_OVERRIDE',
        actorId: 'manager-1',
        meta: expect.objectContaining({
          reason: 'Learner was granted an approved make-up oral assessment',
        }),
      }),
    );

    // -------------------------------------------------------------
    // STEP 5: In-Person Workshop QR Check-In Flow
    // -------------------------------------------------------------
    const inPersonSessionId = 'session-workshop-in-person';
    const workshopSession = {
      id: inPersonSessionId,
      batchId,
      title: 'In-Person Capstone Workshop',
      durationMinutes: 120,
      startTime: new Date('2026-10-20T09:00:00Z'),
      endTime: new Date('2026-10-20T11:00:00Z'),
      status: 'SCHEDULED',
      checkinTokenSecret: null,
      batch: {
        id: batchId,
        managerId: 'manager-1',
        trainers: [],
      },
    };
    dbSessions.set(inPersonSessionId, workshopSession);

    // 5a: Trainer generates dynamic QR check-in token
    const tokenRes = await checkinController.generateCheckInToken(inPersonSessionId, {
      user: { sub: 'manager-1', role: 'MANAGER' },
    });

    expect(tokenRes.token).toBeDefined();
    expect(tokenRes.checkInUrl).toContain(`/check-in/${inPersonSessionId}?token=${tokenRes.token}`);
    expect(workshopSession.checkinTokenSecret).toBe(tokenRes.token);

    // 5b: Learner scans QR code and confirms check-in
    const checkinRes = await checkinController.checkInLearner(
      inPersonSessionId,
      { token: tokenRes.token },
      { user: { sub: learnerA.id, role: 'USER' } },
    );

    expect(checkinRes.message).toBe('Check-in confirmed successfully');
    expect(checkinRes.attendance.status).toBe(AttendanceStatus.PRESENT);
    expect(checkinRes.attendance.source).toBe(AttendanceSource.QR_CHECKIN);

    // 5c: Invalid token rejection
    await expect(
      checkinController.checkInLearner(
        inPersonSessionId,
        { token: 'invalid-fraudulent-token' },
        { user: { sub: learnerB.id, role: 'USER' } },
      ),
    ).rejects.toThrow(ForbiddenException);

    // -------------------------------------------------------------
    // STEP 6: Batch Attendance Sheet Verification
    // -------------------------------------------------------------
    const sheet = await batchAttendanceController.getBatchSessionAttendance(batchId, sessionId);
    expect(sheet.presentCount).toBe(3); // Alice (auto), Bob (manual), Charlie (linked)
    expect(sheet.thresholdPercentage).toBe(75);
    expect(sheet.learners).toHaveLength(3);
  });
});
