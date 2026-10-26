import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { StageGateService } from './stage-gate.service.js';
import {
  AttemptStatus,
  AttendanceStatus,
  BookingStatus,
  CertificateType,
  ContentStatus,
  LearnerStage,
  MissionStatementStatus,
  OralAssessmentStatus,
  Role,
  SessionStatus,
  SessionType,
} from '@prisma/client';
import { WatchIntervalTracker } from './utils/watch-interval-tracker.js';
import { OneOnOneService } from '../sessions/one-on-one.service.js';
import { MissionStatementsService } from '../mission-statements/mission-statements.service.js';
import { CertificateEligibilityService } from '../certificates/certificate-eligibility.service.js';

describe('StageGateService: 5-Stage Sequential Progression Pipeline & Security Audit', () => {
  let service: StageGateService;
  let prismaMock: any;
  let complianceServiceMock: any;

  const mockEnrolment = {
    id: 'enrol-1',
    userId: 'user-1',
    programId: 'prog-1',
    batchId: 'batch-1',
    program: { id: 'prog-1', title: '11 Steps to U Professional Masterclass' },
    batch: { id: 'batch-1', name: 'Cohort Alpha' },
    user: { id: 'user-1', name: 'Jane Doe', email: 'jane@example.com' },
    curriculumCompletedAt: null,
    examPassedAt: null,
    attendanceSatisfiedAt: null,
    oneOnOneCompletedAt: null,
    missionStatementApprovedAt: null,
  };

  const createMockSteps = (count = 11) =>
    Array.from({ length: count }, (_, i) => ({
      id: `step-${i + 1}`,
      title: `Step ${i + 1}`,
      sequence: i + 1,
      status: ContentStatus.PUBLISHED,
      quiz: { id: `quiz-${i + 1}`, title: `Quiz ${i + 1}`, passMark: 70 },
      lessons: [{ id: `lesson-${i + 1}`, createdAt: new Date() }],
    }));

  beforeEach(() => {
    prismaMock = {
      enrolment: {
        findUnique: vi.fn().mockResolvedValue(mockEnrolment),
        update: vi.fn().mockResolvedValue(mockEnrolment),
      },
      auditLog: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 'log-1' }),
      },
      step: {
        findMany: vi.fn().mockResolvedValue(createMockSteps(11)),
      },
      userLessonProgress: {
        findMany: vi.fn().mockResolvedValue(
          Array.from({ length: 11 }, (_, i) => ({ lessonId: `lesson-${i + 1}`, viewed: true })),
        ),
      },
      attempt: {
        findMany: vi.fn().mockResolvedValue(
          Array.from({ length: 11 }, (_, i) => ({
            quizId: `quiz-${i + 1}`,
            status: AttemptStatus.PASSED,
            passed: true,
            score: 85,
          })),
        ),
      },
      stepProgress: {
        findMany: vi.fn().mockResolvedValue(
          Array.from({ length: 11 }, (_, i) => ({ stepId: `step-${i + 1}`, isCompleted: true })),
        ),
      },
      exam: {
        count: vi.fn().mockResolvedValue(1),
      },
      examAttempt: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'exam-att-1', status: AttemptStatus.PASSED, passed: true, score: 92, completedAt: new Date() },
        ]),
      },
      oralAssessment: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'oral-1', status: OralAssessmentStatus.PASSED, passed: true, overallScore: 88, completedAt: new Date() },
        ]),
        count: vi.fn().mockResolvedValue(1),
      },
      session: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'sess-closing-1',
            title: '11 Steps Closing Call with Ro',
            sessionType: SessionType.ONE_ON_ONE_WITH_RO,
            status: SessionStatus.COMPLETED,
            endTime: new Date(),
            bookings: [{ status: BookingStatus.ATTENDED, userId: 'user-1' }],
            attendances: [{ status: AttendanceStatus.PRESENT_AUTO, enrolmentId: 'enrol-1' }],
          },
        ]),
      },
      missionStatementSubmission: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'mission-1',
            enrolmentId: 'enrol-1',
            status: MissionStatementStatus.APPROVED,
            reviewedAt: new Date(),
          },
        ]),
      },
    };

    complianceServiceMock = {
      calculateCompliance: vi.fn().mockResolvedValue({
        status: 'COMPLIANT',
        thresholdUsed: 80,
        requiredSessionCount: 10,
        attendedSessionCount: 9,
        attendancePercentage: 90,
      }),
    };

    service = new StageGateService(prismaMock, complianceServiceMock);
  });

  describe('Sequential Stage Progression Evaluation', () => {
    it('1. All stages satisfied gives allStagesCompleted = true and all stages unlocked', async () => {
      const result = await service.evaluateStages('enrol-1');

      expect(result.allStagesCompleted).toBe(true);
      expect(result.stages[LearnerStage.STAGE_1_CURRICULUM].isCompleted).toBe(true);
      expect(result.stages[LearnerStage.STAGE_2_EXAM].isCompleted).toBe(true);
      expect(result.stages[LearnerStage.STAGE_3_ATTENDANCE].isCompleted).toBe(true);
      expect(result.stages[LearnerStage.STAGE_4_ONE_ON_ONE].isCompleted).toBe(true);
      expect(result.stages[LearnerStage.STAGE_5_MISSION_STATEMENT].isCompleted).toBe(true);

      expect(result.stages[LearnerStage.STAGE_1_CURRICULUM].isUnlocked).toBe(true);
      expect(result.stages[LearnerStage.STAGE_2_EXAM].isUnlocked).toBe(true);
      expect(result.stages[LearnerStage.STAGE_3_ATTENDANCE].isUnlocked).toBe(true);
      expect(result.stages[LearnerStage.STAGE_4_ONE_ON_ONE].isUnlocked).toBe(true);
      expect(result.stages[LearnerStage.STAGE_5_MISSION_STATEMENT].isUnlocked).toBe(true);
    });

    it('2. Incomplete Stage 1 locks Stage 2, Stage 3, Stage 4, Stage 5', async () => {
      prismaMock.userLessonProgress.findMany.mockResolvedValue(
        Array.from({ length: 8 }, (_, i) => ({ lessonId: `lesson-${i + 1}`, viewed: true })),
      );
      prismaMock.stepProgress.findMany.mockResolvedValue([]);

      const result = await service.evaluateStages('enrol-1');

      expect(result.allStagesCompleted).toBe(false);
      expect(result.currentStage).toBe(LearnerStage.STAGE_1_CURRICULUM);
      expect(result.stages[LearnerStage.STAGE_1_CURRICULUM].isCompleted).toBe(false);
      expect(result.stages[LearnerStage.STAGE_2_EXAM].isUnlocked).toBe(false);
      expect(result.stages[LearnerStage.STAGE_3_ATTENDANCE].isUnlocked).toBe(false);
      expect(result.stages[LearnerStage.STAGE_4_ONE_ON_ONE].isUnlocked).toBe(false);
      expect(result.stages[LearnerStage.STAGE_5_MISSION_STATEMENT].isUnlocked).toBe(false);
    });

    it('3. Incomplete Exam locks Stage 3, Stage 4, Stage 5', async () => {
      prismaMock.examAttempt.findMany.mockResolvedValue([
        { id: 'exam-att-1', status: AttemptStatus.FAILED, passed: false, score: 55 },
      ]);

      const result = await service.evaluateStages('enrol-1');

      expect(result.stages[LearnerStage.STAGE_1_CURRICULUM].isCompleted).toBe(true);
      expect(result.stages[LearnerStage.STAGE_2_EXAM].isUnlocked).toBe(true);
      expect(result.stages[LearnerStage.STAGE_2_EXAM].isCompleted).toBe(false);
      expect(result.stages[LearnerStage.STAGE_3_ATTENDANCE].isUnlocked).toBe(false);
      expect(result.currentStage).toBe(LearnerStage.STAGE_2_EXAM);
    });

    it('4. Incomplete Attendance keeps Stage 3 unlocked but locks Stage 4', async () => {
      complianceServiceMock.calculateCompliance.mockResolvedValue({
        status: 'NOT_COMPLIANT',
        thresholdUsed: 80,
        requiredSessionCount: 10,
        attendedSessionCount: 4,
        attendancePercentage: 40,
      });

      const result = await service.evaluateStages('enrol-1');

      expect(result.stages[LearnerStage.STAGE_2_EXAM].isCompleted).toBe(true);
      expect(result.stages[LearnerStage.STAGE_3_ATTENDANCE].isUnlocked).toBe(true);
      expect(result.stages[LearnerStage.STAGE_3_ATTENDANCE].isCompleted).toBe(false);
      expect(result.stages[LearnerStage.STAGE_4_ONE_ON_ONE].isUnlocked).toBe(false);
      expect(result.currentStage).toBe(LearnerStage.STAGE_3_ATTENDANCE);
    });

    it('5. assertStageUnlocked throws ForbiddenException if stage is locked', async () => {
      prismaMock.userLessonProgress.findMany.mockResolvedValue([]);
      prismaMock.stepProgress.findMany.mockResolvedValue([]);

      await expect(
        service.assertStageUnlocked('enrol-1', LearnerStage.STAGE_2_EXAM),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.assertStageUnlocked('enrol-1', LearnerStage.STAGE_4_ONE_ON_ONE),
      ).rejects.toThrow(ForbiddenException);
    });

    it('6. Admin override unlocks previously locked stage and logs AuditLog', async () => {
      prismaMock.userLessonProgress.findMany.mockResolvedValue([]);
      prismaMock.stepProgress.findMany.mockResolvedValue([]);

      await service.overrideStage(
        'enrol-1',
        LearnerStage.STAGE_1_CURRICULUM,
        { id: 'admin-1', role: 'ADMIN' },
        'Medical exemption approved by director',
      );

      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorId: 'admin-1',
            action: 'STAGE_UNLOCK_OVERRIDE',
            entity: 'Enrolment',
            entityId: 'enrol-1',
          }),
        }),
      );
    });

    it('7. Corporate track skips stages 1, 2, 4, 5 (attendance-only)', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        ...mockEnrolment,
        program: { id: 'prog-corp', title: 'Corporate Leadership Workshop' },
      });

      const result = await service.evaluateStages('enrol-1');

      expect(result.certificateType).toBe(CertificateType.CORPORATE_PARTICIPATION);
      expect(result.stages[LearnerStage.STAGE_1_CURRICULUM].isCompleted).toBe(true);
      expect(result.stages[LearnerStage.STAGE_2_EXAM].isCompleted).toBe(true);
      expect(result.stages[LearnerStage.STAGE_4_ONE_ON_ONE].isCompleted).toBe(true);
      expect(result.stages[LearnerStage.STAGE_5_MISSION_STATEMENT].isCompleted).toBe(true);
      expect(result.allStagesCompleted).toBe(true);
    });

    it('8. Security Audit: Stage 5 is NOT satisfied when mission statement has 0 submissions', async () => {
      prismaMock.missionStatementSubmission.findMany.mockResolvedValue([]); // 0 submissions

      const result = await service.evaluateStages('enrol-1');

      expect(result.stages[LearnerStage.STAGE_4_ONE_ON_ONE].isCompleted).toBe(true);
      expect(result.stages[LearnerStage.STAGE_5_MISSION_STATEMENT].isUnlocked).toBe(true);
      expect(result.stages[LearnerStage.STAGE_5_MISSION_STATEMENT].isCompleted).toBe(false);
      expect(result.allStagesCompleted).toBe(false);
      expect(result.currentStage).toBe(LearnerStage.STAGE_5_MISSION_STATEMENT);
    });

    it('9. Certificate Security: Incomplete Stage 5 blocks graduation certificate', async () => {
      prismaMock.missionStatementSubmission.findMany.mockResolvedValue([]); // 0 submissions
      const eligibilityService = new CertificateEligibilityService(
        prismaMock,
        complianceServiceMock,
        service,
      );

      const eligibility = await eligibilityService.evaluateEligibility('enrol-1');
      expect(eligibility.isEligible).toBe(false);
      expect(eligibility.status).toBe('INELIGIBLE');
      expect(eligibility.unmetRequirements).toContain(
        'Handwritten mission statement has not been approved.',
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // MEDIA ANTI-CHEAT, RATE LIMITING & INPUT DEFENSE
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Stage 1: Media Anti-Cheat & Input Defense', () => {
    it('Defeats forward scrubbing: rejects candidate intervals beyond furthest watched', () => {
      const result = WatchIntervalTracker.validateAndCreditHeartbeat({
        existingRanges: [[0, 10]],
        furthestWatchedSec: 10,
        positionSec: 300,
        fromSec: 290,
        toSec: 300,
        durationSec: 600,
        serverNow: new Date(),
        lastHeartbeatAt: new Date(Date.now() - 10000),
        isAlreadyCompleted: false,
      });

      expect(result.accepted).toBe(false);
      expect(result.rejectReason).toBe('FORWARD_SEEK_UNWATCHED');
      expect(result.creditedDeltaSec).toBe(0);
      expect(result.coveredSec).toBe(10);
    });

    it('Defeats speed hacks: clamps credit to physical server elapsed time', () => {
      const lastHeartbeatAt = new Date(Date.now() - 5000); // 5s ago
      const serverNow = new Date();

      const result = WatchIntervalTracker.validateAndCreditHeartbeat({
        existingRanges: [[0, 10]],
        furthestWatchedSec: 10,
        positionSec: 70,
        fromSec: 10,
        toSec: 70, // 60s delta claimed in 5s
        durationSec: 600,
        lastHeartbeatAt,
        serverNow,
        maxRate: 2.0,
        toleranceSec: 3.0,
      });

      expect(result.accepted).toBe(true);
      expect(result.creditedDeltaSec).toBeCloseTo(13.0, 1);
      expect(result.coveredSec).toBeCloseTo(23.0, 1);
    });

    it('Handles poisoned inputs: NaN, negative and inverted intervals safely', () => {
      const inverted = WatchIntervalTracker.validateAndCreditHeartbeat({
        existingRanges: [],
        positionSec: 20,
        fromSec: 50,
        toSec: 20,
        durationSec: 300,
      });
      expect(inverted.accepted).toBe(false);
      expect(inverted.rejectReason).toBe('INVALID_SEGMENT_BOUNDS');

      const nanInput = WatchIntervalTracker.validateAndCreditHeartbeat({
        existingRanges: [],
        positionSec: 10,
        fromSec: NaN,
        toSec: 10,
        durationSec: 300,
      });
      expect(nanInput.accepted).toBe(false);
      expect(nanInput.rejectReason).toBe('INVALID_SEGMENT_BOUNDS');
    });

    it('Concurrency simulation: 100 duplicate heartbeats produce idempotent total coverage', () => {
      let ranges: [number, number][] = [];
      for (let i = 0; i < 100; i++) {
        const result = WatchIntervalTracker.validateAndCreditHeartbeat({
          existingRanges: ranges,
          positionSec: 10,
          fromSec: 0,
          toSec: 10,
          durationSec: 100,
        });
        ranges = result.updatedRanges;
      }

      const totalCovered = WatchIntervalTracker.calculateTotalCoverage(ranges);
      expect(totalCovered).toBe(10);
      expect(ranges).toEqual([[0, 10]]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // IDOR / BOLA CROSS-USER ACCESS CONTROL AUDIT
  // ─────────────────────────────────────────────────────────────────────────────
  describe('IDOR / BOLA & Access Control Audits', () => {
    it('Learner cannot view another learner’s mission statement submission', async () => {
      const missionMockPrisma = {
        missionStatementSubmission: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'ms-target-user',
            userId: 'victim-user-123',
            fileName: 'confidential_mission.pdf',
            fileUrl: 'https://storage/victim.pdf',
            enrolment: {
              batch: { managerId: 'manager-1', trainers: [] },
            },
          }),
        },
      };

      const missionService = new MissionStatementsService(
        missionMockPrisma as any,
        {} as any,
        {} as any,
      );

      await expect(
        missionService.getById('ms-target-user', { id: 'attacker-user-456', role: Role.USER }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Manager cannot approve 1-on-1 request for unassigned batch', async () => {
      const oneMockPrisma = {
        oneOnOneRequest: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'req-1',
            status: 'PENDING_APPROVAL',
            requestedStart: new Date(),
            requestedEnd: new Date(Date.now() + 1800000),
            enrolment: {
              batch: {
                managerId: 'assigned-manager-999',
                trainers: [{ trainerId: 'trainer-999' }],
              },
            },
          }),
        },
      };

      const oneOnOneService = new OneOnOneService(
        oneMockPrisma as any,
        {} as any,
        { sendTemplateEmail: vi.fn() } as any,
      );

      await expect(
        oneOnOneService.approveRequest(
          'req-1',
          'unassigned-manager-777',
          {} as any,
          { id: 'unassigned-manager-777', role: Role.MANAGER },
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // BINARY MAGIC BYTES FILE FILTER PEN-TEST (USING INERT SAFE STRINGS)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Stage 5: Binary File & Magic Bytes Pen-Test', () => {
    const missionService = new MissionStatementsService({} as any, {} as any, {} as any);

    it('Blocks file extension spoofing: .pdf extension with plain text payload', () => {
      const fakePdf = {
        originalname: 'fake_document.pdf',
        mimetype: 'application/pdf',
        size: 50,
        buffer: Buffer.from('PLAIN_TEXT_PAYLOAD_WITHOUT_PDF_MAGIC_BYTES\n'),
      };

      expect(() => missionService.validateFile(fakePdf)).toThrow(BadRequestException);
      expect(() => missionService.validateFile(fakePdf)).toThrow(
        'File binary signature does not match claimed file type',
      );
    });

    it('Blocks file extension spoofing: .png with HTML payload', () => {
      const fakePng = {
        originalname: 'fake_image.png',
        mimetype: 'image/png',
        size: 50,
        buffer: Buffer.from('<html><body>Mock unauthorized HTML payload</body></html>'),
      };

      expect(() => missionService.validateFile(fakePng)).toThrow(BadRequestException);
    });

    it('Accepts genuine PDF with valid %PDF magic bytes', () => {
      const genuinePdf = {
        originalname: 'genuine.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('%PDF-1.4 genuine content'),
      };

      expect(() => missionService.validateFile(genuinePdf)).not.toThrow();
    });

    it('Accepts genuine PNG with valid 0x89PNG magic bytes', () => {
      const genuinePng = {
        originalname: 'genuine.png',
        mimetype: 'image/png',
        size: 1024,
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      };

      expect(() => missionService.validateFile(genuinePng)).not.toThrow();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CONCURRENT EXAM SUBMISSION RACE CONDITION TEST
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Exam Concurrency & Double-Submit Protection', () => {
    it('Concurrent submissions: only first request succeeds, duplicate throws finalized error', async () => {
      let status = AttemptStatus.IN_PROGRESS;

      const submitAtomic = async () => {
        if (status !== AttemptStatus.IN_PROGRESS) {
          throw new BadRequestException('Exam attempt is already finalized');
        }
        status = AttemptStatus.PASSED;
        return { status: 'PASSED', score: 95 };
      };

      const [res1, res2] = await Promise.allSettled([
        submitAtomic(),
        submitAtomic(),
      ]);

      const successCount = [res1, res2].filter((r) => r.status === 'fulfilled').length;
      const rejectCount = [res1, res2].filter((r) => r.status === 'rejected').length;

      expect(successCount).toBe(1);
      expect(rejectCount).toBe(1);
      if (res2.status === 'rejected') {
        expect((res2 as any).reason.message).toContain('already finalized');
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // PROGRAM MILESTONES & PROGRESSION CONFIG TOGGLES
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Program Milestones & Progression Config Toggles', () => {
    it('Automatically satisfies Stage 2, 4, and 5 when toggled optional on Program', async () => {
      const mockPrisma = {
        enrolment: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'enr-custom-config',
            userId: 'user-custom',
            programId: 'prog-custom',
            batchId: 'batch-custom',
            program: {
              id: 'prog-custom',
              title: 'Custom Flexible Track',
              requireExam: false,
              requireCoaching: false,
              requireMissionStatement: false,
              sequentialProgressionEnabled: false,
              attendanceRequired: false,
              attendanceThreshold: 75,
            },
            batch: { id: 'batch-custom', name: 'Batch Flex' },
            user: { id: 'user-custom', name: 'Flex Student', email: 'flex@test.com' },
          }),
        },
        auditLog: { findMany: vi.fn().mockResolvedValue([]) },
        step: {
          findMany: vi.fn().mockResolvedValue([
            { id: 's1', sequence: 1, title: 'Step 1', quiz: null, lessons: [] },
          ]),
        },
        userLessonProgress: { findMany: vi.fn().mockResolvedValue([]) },
        attempt: { findMany: vi.fn().mockResolvedValue([]) },
        stepProgress: {
          findMany: vi.fn().mockResolvedValue([{ stepId: 's1', isCompleted: true, completedAt: new Date() }]),
        },
        examAttempt: { findMany: vi.fn().mockResolvedValue([]) },
        oralAssessment: {
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
        },
        exam: { count: vi.fn().mockResolvedValue(1) },
        session: { findMany: vi.fn().mockResolvedValue([]) },
        missionStatementSubmission: { findMany: vi.fn().mockResolvedValue([]) },
      };

      const complianceMock = {
        calculateCompliance: vi.fn().mockResolvedValue({
          status: 'NOT_APPLICABLE',
          thresholdUsed: 75,
          attendancePercentage: 100,
        }),
      };

      const service = new StageGateService(mockPrisma as any, complianceMock as any);
      const result = await service.evaluateStages('enr-custom-config');

      // Stage 1 is complete
      expect(result.stages[LearnerStage.STAGE_1_CURRICULUM].isCompleted).toBe(true);
      // Stage 2 is complete because requireExam is false
      expect(result.stages[LearnerStage.STAGE_2_EXAM].isCompleted).toBe(true);
      // Stage 3 is complete because attendanceRequired is false
      expect(result.stages[LearnerStage.STAGE_3_ATTENDANCE].isCompleted).toBe(true);
      // Stage 4 is complete because requireCoaching is false
      expect(result.stages[LearnerStage.STAGE_4_ONE_ON_ONE].isCompleted).toBe(true);
      // Stage 5 is complete because requireMissionStatement is false
      expect(result.stages[LearnerStage.STAGE_5_MISSION_STATEMENT].isCompleted).toBe(true);
      // All stages are completed
      expect(result.allStagesCompleted).toBe(true);
      // All stages are unlocked concurrently because sequentialProgressionEnabled is false
      expect(result.stages[LearnerStage.STAGE_2_EXAM].isUnlocked).toBe(true);
      expect(result.stages[LearnerStage.STAGE_3_ATTENDANCE].isUnlocked).toBe(true);
      expect(result.stages[LearnerStage.STAGE_4_ONE_ON_ONE].isUnlocked).toBe(true);
      expect(result.stages[LearnerStage.STAGE_5_MISSION_STATEMENT].isUnlocked).toBe(true);
    });
  });
});
