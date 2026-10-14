import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  EnrolmentStatus,
  OralAssessmentStatus,
  Role,
} from '@prisma/client';
import { OralAssessmentsService } from './oral-assessments.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('D1-038: OralAssessmentsService - Rubrics, Qualitative Feedback & Scoping', () => {
  let service: OralAssessmentsService;
  let prismaMock: any;

  const mockLearner = {
    id: 'user-learner-1',
    sub: 'user-learner-1',
    role: Role.USER,
  };

  const mockOtherLearner = {
    id: 'user-learner-2',
    sub: 'user-learner-2',
    role: Role.USER,
  };

  const mockAdmin = {
    id: 'user-admin-1',
    sub: 'user-admin-1',
    role: Role.ADMIN,
  };

  const mockManager = {
    id: 'user-manager-1',
    sub: 'user-manager-1',
    role: Role.MANAGER,
  };

  const mockEnrolment = {
    id: 'enrol-1',
    userId: 'user-learner-1',
    programId: 'prog-1',
    batchId: 'batch-1',
    status: EnrolmentStatus.ACTIVE,
    batch: {
      id: 'batch-1',
      managerId: 'user-manager-1',
      trainers: [{ trainerId: 'user-manager-1' }],
    },
  };

  const mockAssessment = {
    id: 'oa-1',
    enrolmentId: 'enrol-1',
    programId: 'prog-1',
    status: OralAssessmentStatus.SCHEDULED,
    overallScore: null,
    passed: null,
    trainerNotes: null,
    retryGuidance: null,
    enrolment: mockEnrolment,
    scores: [],
  };

  beforeEach(() => {
    prismaMock = {
      oralAssessment: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      oralAssessmentScore: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 3 }),
      },
      enrolment: {
        findUnique: vi.fn(),
      },
      batch: {
        findUnique: vi.fn(),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      },
      $transaction: vi.fn(async (cb: any) => cb(prismaMock)),
    };

    service = new OralAssessmentsService(prismaMock as unknown as PrismaService);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. SCHEDULING / CREATION
  // ─────────────────────────────────────────────────────────────────────────────

  describe('1. Creation & Scheduling', () => {
    it('creates an oral assessment successfully by Admin', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValueOnce(mockEnrolment);
      prismaMock.oralAssessment.create.mockResolvedValueOnce({
        ...mockAssessment,
      });

      const result = await service.create(
        {
          enrolmentId: 'enrol-1',
          programId: 'prog-1',
          scheduledDate: '2026-10-15T10:00:00.000Z',
        },
        mockAdmin,
      );

      expect(result.id).toBe('oa-1');
      expect(prismaMock.oralAssessment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            enrolmentId: 'enrol-1',
            programId: 'prog-1',
            status: OralAssessmentStatus.SCHEDULED,
          }),
        }),
      );
    });

    it('denies learner from creating an oral assessment with ForbiddenException', async () => {
      await expect(
        service.create(
          { enrolmentId: 'enrol-1', programId: 'prog-1' },
          mockLearner,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects with BadRequestException if enrolment does not match program', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValueOnce({
        ...mockEnrolment,
        programId: 'different-prog',
      });

      await expect(
        service.create(
          { enrolmentId: 'enrol-1', programId: 'prog-1' },
          mockAdmin,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('blocks Manager from scheduling for a learner in an unassigned batch', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValueOnce({
        ...mockEnrolment,
        batchId: 'batch-unassigned',
      });

      // Manager is not assigned to batch-unassigned
      prismaMock.batch.findUnique.mockResolvedValueOnce({
        id: 'batch-unassigned',
        managerId: 'other-manager',
        trainers: [],
      });

      await expect(
        service.create(
          { enrolmentId: 'enrol-1', programId: 'prog-1' },
          mockManager,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. READ ACCESS & SCOPING
  // ─────────────────────────────────────────────────────────────────────────────

  describe('2. Read Access & Scoping', () => {
    it('allows learner to read their own assessment', async () => {
      prismaMock.oralAssessment.findUnique.mockResolvedValueOnce(mockAssessment);

      const result = await service.findOne('oa-1', mockLearner);
      expect(result.id).toBe('oa-1');
    });

    it('blocks learner from reading another learner assessment with ForbiddenException', async () => {
      prismaMock.oralAssessment.findUnique.mockResolvedValueOnce(mockAssessment);

      await expect(
        service.findOne('oa-1', mockOtherLearner),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows assigned Manager to read assessment', async () => {
      prismaMock.oralAssessment.findUnique.mockResolvedValueOnce(mockAssessment);
      prismaMock.batch.findUnique.mockResolvedValueOnce({
        id: 'batch-1',
        managerId: 'user-manager-1',
        trainers: [],
      });

      const result = await service.findOne('oa-1', mockManager);
      expect(result.id).toBe('oa-1');
    });

    it('blocks Manager from reading assessment in an unassigned batch', async () => {
      prismaMock.oralAssessment.findUnique.mockResolvedValueOnce({
        ...mockAssessment,
        enrolment: {
          ...mockEnrolment,
          batchId: 'batch-other',
        },
      });

      prismaMock.batch.findUnique.mockResolvedValueOnce({
        id: 'batch-other',
        managerId: 'other-mgr',
        trainers: [],
      });

      await expect(
        service.findOne('oa-1', mockManager),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. RUBRIC GRADING & QUALITATIVE FEEDBACK
  // ─────────────────────────────────────────────────────────────────────────────

  describe('3. Rubric Grading & Qualitative Feedback', () => {
    it('denies learner from grading with ForbiddenException', async () => {
      await expect(
        service.grade(
          'oa-1',
          {
            scores: [{ rubricCategory: 'Brain Health Knowledge', score: 9 }],
            passed: true,
            trainerNotes: 'Learner demonstrated sound knowledge.',
          },
          mockLearner,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects grading with score exceeding maxScore', async () => {
      prismaMock.oralAssessment.findUnique.mockResolvedValueOnce(mockAssessment);

      await expect(
        service.grade(
          'oa-1',
          {
            scores: [
              {
                rubricCategory: 'Coaching Methodology',
                score: 15, // Exceeds maxScore of 10!
                maxScore: 10,
              },
            ],
            passed: true,
            trainerNotes: 'Valid notes',
          },
          mockAdmin,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects grading with negative score', async () => {
      prismaMock.oralAssessment.findUnique.mockResolvedValueOnce(mockAssessment);

      await expect(
        service.grade(
          'oa-1',
          {
            scores: [
              {
                rubricCategory: 'Coaching Methodology',
                score: -2,
                maxScore: 10,
              },
            ],
            passed: true,
            trainerNotes: 'Valid notes',
          },
          mockAdmin,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate rubric categories in grading submission', async () => {
      prismaMock.oralAssessment.findUnique.mockResolvedValueOnce(mockAssessment);

      await expect(
        service.grade(
          'oa-1',
          {
            scores: [
              { rubricCategory: 'Communication', score: 8, maxScore: 10 },
              { rubricCategory: 'communication', score: 7, maxScore: 10 }, // Duplicate!
            ],
            passed: true,
            trainerNotes: 'Valid notes',
          },
          mockAdmin,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects failing result if meaningful retry guidance is missing', async () => {
      prismaMock.oralAssessment.findUnique.mockResolvedValueOnce(mockAssessment);

      await expect(
        service.grade(
          'oa-1',
          {
            scores: [
              { rubricCategory: 'Coaching Practice', score: 4, maxScore: 10 },
            ],
            passed: false,
            trainerNotes: 'Needs improvement before retake.',
            retryGuidance: '', // Missing!
          },
          mockAdmin,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('grades assessment as PASSED, calculates percentage overallScore, and creates AuditLog', async () => {
      prismaMock.oralAssessment.findUnique.mockResolvedValueOnce(mockAssessment);

      prismaMock.oralAssessment.update.mockResolvedValueOnce({
        id: 'oa-1',
        overallScore: 85,
        passed: true,
        status: OralAssessmentStatus.PASSED,
        trainerNotes: 'Excellent performance across all rubric competencies.',
        scores: [
          { rubricCategory: 'Knowledge', score: 9, maxScore: 10 },
          { rubricCategory: 'Application', score: 8, maxScore: 10 },
        ],
      });

      const result = await service.grade(
        'oa-1',
        {
          scores: [
            { rubricCategory: 'Knowledge', score: 9, maxScore: 10, feedback: 'Strong' },
            { rubricCategory: 'Application', score: 8, maxScore: 10, feedback: 'Solid' },
          ],
          passed: true,
          trainerNotes: 'Excellent performance across all rubric competencies.',
        },
        mockAdmin,
      );

      // (9 + 8) / (10 + 10) = 17 / 20 = 85%
      expect(prismaMock.oralAssessment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            overallScore: 85,
            passed: true,
            status: OralAssessmentStatus.PASSED,
            trainerNotes: 'Excellent performance across all rubric competencies.',
            assessorId: 'user-admin-1',
          }),
        }),
      );

      expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'ORAL_ASSESSMENT_GRADED',
          entity: 'OralAssessment',
          entityId: 'oa-1',
          meta: expect.objectContaining({
            overallScore: 85,
            passed: true,
          }),
        }),
      });

      expect(result.status).toBe(OralAssessmentStatus.PASSED);
    });

    it('grades assessment as FAILED, records retryGuidance, and updates status to FAILED', async () => {
      prismaMock.oralAssessment.findUnique.mockResolvedValueOnce(mockAssessment);

      prismaMock.oralAssessment.update.mockResolvedValueOnce({
        id: 'oa-1',
        overallScore: 40,
        passed: false,
        status: OralAssessmentStatus.FAILED,
        trainerNotes: 'Candidate was unable to apply Step 6 concepts.',
        retryGuidance: 'Please review Step 6 videos and practical exercises.',
      });

      const result = await service.grade(
        'oa-1',
        {
          scores: [
            { rubricCategory: 'Knowledge', score: 4, maxScore: 10 },
          ],
          passed: false,
          trainerNotes: 'Candidate was unable to apply Step 6 concepts.',
          retryGuidance: 'Please review Step 6 videos and practical exercises.',
        },
        mockAdmin,
      );

      expect(prismaMock.oralAssessment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            overallScore: 40,
            passed: false,
            status: OralAssessmentStatus.FAILED,
            retryGuidance: 'Please review Step 6 videos and practical exercises.',
          }),
        }),
      );

      expect(result.status).toBe(OralAssessmentStatus.FAILED);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. BATCH LISTING
  // ─────────────────────────────────────────────────────────────────────────────

  describe('4. Batch Listing', () => {
    it('allows Admin to list assessments for a batch', async () => {
      prismaMock.oralAssessment.findMany.mockResolvedValueOnce([mockAssessment]);

      const result = await service.findByBatch('batch-1', mockAdmin);
      expect(result).toHaveLength(1);
    });

    it('allows assigned Manager to list assessments for their batch', async () => {
      prismaMock.batch.findUnique.mockResolvedValueOnce({
        id: 'batch-1',
        managerId: 'user-manager-1',
        trainers: [],
      });
      prismaMock.oralAssessment.findMany.mockResolvedValueOnce([mockAssessment]);

      const result = await service.findByBatch('batch-1', mockManager);
      expect(result).toHaveLength(1);
    });

    it('denies learner from listing batch assessments with ForbiddenException', async () => {
      await expect(
        service.findByBatch('batch-1', mockLearner),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
