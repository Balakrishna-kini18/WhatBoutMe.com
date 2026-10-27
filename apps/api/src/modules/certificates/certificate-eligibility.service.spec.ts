import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { CertificateEligibilityService } from './certificate-eligibility.service.js';
import {
  AttemptStatus,
  AttendanceStatus,
  BookingStatus,
  CertificateType,
  ContentStatus,
  MissionStatementStatus,
  OralAssessmentStatus,
  SessionStatus,
  SessionType,
} from '@prisma/client';

describe('D1-051 & D1-051b: CertificateEligibilityService', () => {
  let service: CertificateEligibilityService;
  let prismaMock: any;
  let complianceServiceMock: any;

  const mockEnrolment = {
    id: 'enrol-1',
    userId: 'user-1',
    programId: 'prog-1',
    batchId: 'batch-1',
    program: { id: 'prog-1', title: '11 Steps to U' },
    batch: { id: 'batch-1', name: 'Cohort Alpha' },
    user: { id: 'user-1', name: 'Jane Doe', email: 'jane@example.com' },
  };

  const createMockSteps = (count = 11) =>
    Array.from({ length: count }, (_, i) => ({
      id: `step-${i + 1}`,
      title: `Step ${i + 1}`,
      sequence: i + 1,
      status: ContentStatus.PUBLISHED,
      quiz: { id: `quiz-${i + 1}`, title: `Quiz ${i + 1}`, passMark: 70 },
      lessons: [{ id: `lesson-${i + 1}` }],
    }));

  beforeEach(() => {
    prismaMock = {
      enrolment: {
        findUnique: vi.fn().mockResolvedValue(mockEnrolment),
      },
      step: {
        findMany: vi.fn().mockResolvedValue(createMockSteps(11)),
      },
      userLessonProgress: {
        findMany: vi.fn().mockResolvedValue(
          Array.from({ length: 11 }, (_, i) => ({ lessonId: `lesson-${i + 1}`, viewed: true }))
        ),
      },
      attempt: {
        findMany: vi.fn().mockResolvedValue(
          Array.from({ length: 11 }, (_, i) => ({
            quizId: `quiz-${i + 1}`,
            status: AttemptStatus.PASSED,
            passed: true,
            score: 85,
          }))
        ),
      },
      stepProgress: {
        findMany: vi.fn().mockResolvedValue(
          Array.from({ length: 11 }, (_, i) => ({ stepId: `step-${i + 1}`, isCompleted: true }))
        ),
      },
      exam: {
        count: vi.fn().mockResolvedValue(1),
      },
      examAttempt: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'exam-att-1', status: AttemptStatus.PASSED, passed: true, score: 92 },
        ]),
      },
      oralAssessment: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'oral-1', status: OralAssessmentStatus.PASSED, passed: true, overallScore: 88 },
        ]),
        count: vi.fn().mockResolvedValue(1),
      },
      session: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'sess-closing-1',
            title: '11 Steps Closing Call with Ro',
            sessionType: SessionType.ONE_ON_ONE,
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

    service = new CertificateEligibilityService(
      prismaMock,
      complianceServiceMock,
    );
  });

  describe('D1-051: Professional Certification Track', () => {
    it('returns ELIGIBLE when all six conditions are satisfied', async () => {
      const result = await service.evaluateEligibility('enrol-1');

      expect(result.isEligible).toBe(true);
      expect(result.status).toBe('ELIGIBLE');
      expect(result.certificateType).toBe(CertificateType.PROFESSIONAL);
      expect(result.steps.isMet).toBe(true);
      expect(result.steps.completed).toBe(11);
      expect(result.quizzes.isMet).toBe(true);
      expect(result.quizzes.passed).toBe(11);
      expect(result.finalExam.isMet).toBe(true);
      expect(result.oralAssessment.isMet).toBe(true);
      expect(result.attendance.isMet).toBe(true);
      expect(result.closingCall.isMet).toBe(true);
      expect(result.unmetRequirements).toHaveLength(0);
    });

    it('returns INELIGIBLE if one program step is incomplete', async () => {
      // Step 11 is not completed
      prismaMock.stepProgress.findMany.mockResolvedValue(
        Array.from({ length: 10 }, (_, i) => ({ stepId: `step-${i + 1}`, isCompleted: true }))
      );
      prismaMock.userLessonProgress.findMany.mockResolvedValue(
        Array.from({ length: 10 }, (_, i) => ({ lessonId: `lesson-${i + 1}`, viewed: true }))
      );

      const result = await service.evaluateEligibility('enrol-1');

      expect(result.isEligible).toBe(false);
      expect(result.steps.isMet).toBe(false);
      expect(result.steps.completed).toBe(10);
      expect(result.unmetRequirements.some((r: string) => r.includes('Program steps incomplete'))).toBe(true);
    });

    it('returns INELIGIBLE if one step quiz is not passed', async () => {
      // Quiz 11 failed
      prismaMock.attempt.findMany.mockResolvedValue(
        Array.from({ length: 10 }, (_, i) => ({
          quizId: `quiz-${i + 1}`,
          status: AttemptStatus.PASSED,
          passed: true,
        }))
      );

      const result = await service.evaluateEligibility('enrol-1');

      expect(result.isEligible).toBe(false);
      expect(result.quizzes.isMet).toBe(false);
      expect(result.quizzes.passed).toBe(10);
      expect(result.unmetRequirements.some((r: string) => r.includes('Step quizzes incomplete'))).toBe(true);
    });

    it('returns INELIGIBLE if final 50-question exam is not passed', async () => {
      prismaMock.examAttempt.findMany.mockResolvedValue([
        { id: 'exam-att-1', status: AttemptStatus.FAILED, passed: false, score: 60 },
      ]);

      const result = await service.evaluateEligibility('enrol-1');

      expect(result.isEligible).toBe(false);
      expect(result.finalExam.isMet).toBe(false);
      expect(result.unmetRequirements.some((r: string) => r.includes('Final 50-question exam not passed'))).toBe(true);
    });

    it('returns INELIGIBLE if oral assessment is not marked PASSED', async () => {
      prismaMock.oralAssessment.findMany.mockResolvedValue([
        { id: 'oral-1', status: OralAssessmentStatus.SCHEDULED, passed: false },
      ]);

      const result = await service.evaluateEligibility('enrol-1');

      expect(result.isEligible).toBe(false);
      expect(result.oralAssessment.isMet).toBe(false);
      expect(result.unmetRequirements.some((r: string) => r.includes('Oral assessment not marked as PASSED'))).toBe(true);
    });

    it('returns INELIGIBLE if attendance is below configured threshold', async () => {
      complianceServiceMock.calculateCompliance.mockResolvedValue({
        status: 'NOT_COMPLIANT',
        thresholdUsed: 80,
        requiredSessionCount: 10,
        attendedSessionCount: 6,
        attendancePercentage: 60,
      });

      const result = await service.evaluateEligibility('enrol-1');

      expect(result.isEligible).toBe(false);
      expect(result.attendance.isMet).toBe(false);
      expect(result.attendance.thresholdUsed).toBe(80);
      expect(result.attendance.attendancePercentage).toBe(60);
      expect(result.unmetRequirements.some((r: string) => r.includes('Attendance requirement not met'))).toBe(true);
    });

    it('returns INELIGIBLE if required 1-on-1 closing call is not completed', async () => {
      prismaMock.session.findMany.mockResolvedValue([]);

      const result = await service.evaluateEligibility('enrol-1');

      expect(result.isEligible).toBe(false);
      expect(result.closingCall.isMet).toBe(false);
      expect(result.unmetRequirements.some((r: string) => r.includes('closing call has not been completed'))).toBe(true);
    });

    it('reports all relevant failures when multiple requirements are unmet', async () => {
      prismaMock.examAttempt.findMany.mockResolvedValue([]);
      prismaMock.oralAssessment.findMany.mockResolvedValue([]);
      prismaMock.session.findMany.mockResolvedValue([]);

      const result = await service.evaluateEligibility('enrol-1');

      expect(result.isEligible).toBe(false);
      expect(result.finalExam.isMet).toBe(false);
      expect(result.oralAssessment.isMet).toBe(false);
      expect(result.closingCall.isMet).toBe(false);
      expect(result.unmetRequirements).toHaveLength(4);
    });

    it('handles missing prerequisite records gracefully without throwing 500 error', async () => {
      prismaMock.step.findMany.mockResolvedValue([]);
      prismaMock.userLessonProgress.findMany.mockResolvedValue([]);
      prismaMock.attempt.findMany.mockResolvedValue([]);
      prismaMock.stepProgress.findMany.mockResolvedValue([]);
      prismaMock.examAttempt.findMany.mockResolvedValue([]);
      prismaMock.oralAssessment.findMany.mockResolvedValue([]);
      prismaMock.session.findMany.mockResolvedValue([]);
      complianceServiceMock.calculateCompliance.mockRejectedValue(new Error('No sessions exist'));

      const result = await service.evaluateEligibility('enrol-1');

      expect(result).toBeDefined();
      expect(result.isEligible).toBe(false);
    });

    it('throws NotFoundException when enrolment does not exist', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue(null);

      await expect(service.evaluateEligibility('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('D1-051b: Corporate Participation Track', () => {
    it('returns ELIGIBLE based on workshop attendance only, explicitly bypassing exam, quizzes, and closing call', async () => {
      // Intentionally break exams, quizzes, steps, and closing calls
      prismaMock.examAttempt.findMany.mockResolvedValue([]);
      prismaMock.attempt.findMany.mockResolvedValue([]);
      prismaMock.oralAssessment.findMany.mockResolvedValue([]);
      prismaMock.session.findMany.mockResolvedValue([]);

      // Attendance is compliant
      complianceServiceMock.calculateCompliance.mockResolvedValue({
        status: 'COMPLIANT',
        thresholdUsed: 75,
        requiredSessionCount: 4,
        attendedSessionCount: 4,
        attendancePercentage: 100,
      });

      const result = await service.evaluateEligibility(
        'enrol-1',
        CertificateType.CORPORATE_PARTICIPATION,
      );

      expect(result.certificateType).toBe(CertificateType.CORPORATE_PARTICIPATION);
      expect(result.isEligible).toBe(true);
      expect(result.status).toBe('ELIGIBLE');
      expect(result.finalExam.isMet).toBe(true);
      expect(result.finalExam.required).toBe(false);
      expect(result.quizzes.isMet).toBe(true);
      expect(result.quizzes.required).toBe(0);
      expect(result.closingCall.isMet).toBe(true);
      expect(result.closingCall.required).toBe(false);
      expect(result.attendance.isMet).toBe(true);
      expect(result.unmetRequirements).toHaveLength(0);
    });

    it('returns INELIGIBLE on corporate track if workshop attendance is not compliant', async () => {
      complianceServiceMock.calculateCompliance.mockResolvedValue({
        status: 'NOT_COMPLIANT',
        thresholdUsed: 80,
        requiredSessionCount: 4,
        attendedSessionCount: 2,
        attendancePercentage: 50,
      });

      const result = await service.evaluateEligibility(
        'enrol-1',
        CertificateType.CORPORATE_PARTICIPATION,
      );

      expect(result.isEligible).toBe(false);
      expect(result.status).toBe('INELIGIBLE');
      expect(result.attendance.isMet).toBe(false);
      expect(result.unmetRequirements.some((r: string) => r.includes('Corporate workshop attendance requirement not met'))).toBe(true);
    });
  });
});
