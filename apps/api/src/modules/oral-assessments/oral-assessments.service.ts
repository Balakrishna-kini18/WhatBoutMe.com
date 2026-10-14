import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OralAssessmentStatus,
  Role,
  EnrolmentStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { isManagerAssignedToBatch } from '../../common/guards/batch-access.guard.js';
import {
  CreateOralAssessmentDto,
  GradeOralAssessmentDto,
} from './dto/index.js';

@Injectable()
export class OralAssessmentsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. CREATE / SCHEDULE ORAL ASSESSMENT
  // ─────────────────────────────────────────────────────────────────────────────

  async create(dto: CreateOralAssessmentDto, actor: any) {
    const actorId = actor?.sub ?? actor?.id;
    if (!actorId) {
      throw new ForbiddenException('Access denied: Authentication required');
    }

    if (actor.role === Role.USER || actor.role === 'USER') {
      throw new ForbiddenException('Access denied: Learners cannot create oral assessments');
    }

    const enrolment = await this.prisma.enrolment.findUnique({
      where: { id: dto.enrolmentId },
      include: {
        batch: {
          include: { trainers: true },
        },
      },
    });

    if (!enrolment) {
      throw new NotFoundException('Enrolment not found');
    }

    // Verify enrolment belongs to specified program
    if (enrolment.programId !== dto.programId) {
      throw new BadRequestException(
        'Enrolment does not belong to the specified program',
      );
    }

    // Verify enrolment is ACTIVE
    if (enrolment.status !== EnrolmentStatus.ACTIVE) {
      throw new ForbiddenException(
        'Cannot schedule assessment for non-active or revoked enrolment',
      );
    }

    // Manager Batch Scoping
    if ((actor.role === Role.MANAGER || actor.role === 'MANAGER' || actor.role === 'TEACHER')) {
      const isAssigned = await isManagerAssignedToBatch(
        this.prisma,
        actorId,
        enrolment.batchId,
      );
      if (!isAssigned) {
        throw new ForbiddenException(
          'Access denied: You are not assigned to manage this batch cohort',
        );
      }
    }

    const scheduledDate = dto.scheduledDate ? new Date(dto.scheduledDate) : null;

    return this.prisma.oralAssessment.create({
      data: {
        enrolmentId: dto.enrolmentId,
        programId: dto.programId,
        scheduledDate,
        sessionId: dto.sessionId || null,
        status: OralAssessmentStatus.SCHEDULED,
      },
      include: {
        scores: true,
        enrolment: {
          select: {
            id: true,
            userId: true,
            batchId: true,
            status: true,
          },
        },
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. GET ORAL ASSESSMENT BY ID
  // ─────────────────────────────────────────────────────────────────────────────

  async findOne(id: string, actor: any) {
    const actorId = actor?.sub ?? actor?.id;
    if (!actorId) {
      throw new ForbiddenException('Access denied: Authentication required');
    }

    const assessment = await this.prisma.oralAssessment.findUnique({
      where: { id },
      include: {
        scores: true,
        assessor: {
          select: { id: true, name: true, email: true },
        },
        enrolment: {
          include: {
            batch: {
              include: { trainers: true },
            },
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    if (!assessment) {
      throw new NotFoundException('Oral assessment not found');
    }

    // Access Scoping
    if (actor.role === Role.USER || actor.role === 'USER') {
      if (assessment.enrolment.userId !== actorId) {
        throw new ForbiddenException(
          'Access denied: You do not own this oral assessment',
        );
      }
    } else if ((actor.role === Role.MANAGER || actor.role === 'MANAGER' || actor.role === 'TEACHER')) {
      const isAssigned = await isManagerAssignedToBatch(
        this.prisma,
        actorId,
        assessment.enrolment.batchId,
      );
      if (!isAssigned) {
        throw new ForbiddenException(
          'Access denied: You are not assigned to manage this batch cohort',
        );
      }
    }

    return assessment;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. GET ORAL ASSESSMENTS FOR ENROLMENT
  // ─────────────────────────────────────────────────────────────────────────────

  async findByEnrolment(enrolmentId: string, actor: any) {
    const actorId = actor?.sub ?? actor?.id;
    if (!actorId) {
      throw new ForbiddenException('Access denied: Authentication required');
    }

    const enrolment = await this.prisma.enrolment.findUnique({
      where: { id: enrolmentId },
      include: {
        batch: {
          include: { trainers: true },
        },
      },
    });

    if (!enrolment) {
      throw new NotFoundException('Enrolment not found');
    }

    if (actor.role === Role.USER || actor.role === 'USER') {
      if (enrolment.userId !== actorId) {
        throw new ForbiddenException(
          'Access denied: You do not own this enrolment',
        );
      }
    } else if ((actor.role === Role.MANAGER || actor.role === 'MANAGER' || actor.role === 'TEACHER')) {
      const isAssigned = await isManagerAssignedToBatch(
        this.prisma,
        actorId,
        enrolment.batchId,
      );
      if (!isAssigned) {
        throw new ForbiddenException(
          'Access denied: You are not assigned to manage this batch cohort',
        );
      }
    }

    return this.prisma.oralAssessment.findMany({
      where: { enrolmentId },
      include: {
        scores: true,
        assessor: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. GRADE ORAL ASSESSMENT
  // ─────────────────────────────────────────────────────────────────────────────

  async grade(id: string, dto: GradeOralAssessmentDto, actor: any) {
    const actorId = actor?.sub ?? actor?.id;
    if (!actorId) {
      throw new ForbiddenException('Access denied: Authentication required');
    }

    if (actor.role === Role.USER || actor.role === 'USER') {
      throw new ForbiddenException('Access denied: Learners cannot grade oral assessments');
    }

    const assessment = await this.prisma.oralAssessment.findUnique({
      where: { id },
      include: {
        enrolment: {
          include: {
            batch: {
              include: { trainers: true },
            },
          },
        },
      },
    });

    if (!assessment) {
      throw new NotFoundException('Oral assessment not found');
    }

    // Manager Batch Scoping
    if ((actor.role === Role.MANAGER || actor.role === 'MANAGER' || actor.role === 'TEACHER')) {
      const isAssigned = await isManagerAssignedToBatch(
        this.prisma,
        actorId,
        assessment.enrolment.batchId,
      );
      if (!isAssigned) {
        throw new ForbiddenException(
          'Access denied: You are not assigned to manage this batch cohort',
        );
      }
    }

    // Validate Rubric items
    if (!dto.scores || dto.scores.length === 0) {
      throw new BadRequestException('At least one rubric score item is required');
    }

    const categorySet = new Set<string>();
    let sumScore = 0;
    let sumMax = 0;

    for (const item of dto.scores) {
      const cat = item.rubricCategory?.trim();
      if (!cat) {
        throw new BadRequestException('Rubric category name cannot be empty');
      }
      if (categorySet.has(cat.toLowerCase())) {
        throw new BadRequestException(`Duplicate rubric category: ${cat}`);
      }
      categorySet.add(cat.toLowerCase());

      const maxScore = item.maxScore ?? 10;
      if (maxScore < 1) {
        throw new BadRequestException('maxScore must be at least 1');
      }
      if (item.score < 0 || item.score > maxScore) {
        throw new BadRequestException(
          `Rubric score for "${cat}" (${item.score}) must be between 0 and maxScore (${maxScore})`,
        );
      }

      sumScore += item.score;
      sumMax += maxScore;
    }

    // Qualitative notes validation
    const trainerNotes = dto.trainerNotes?.trim();
    if (!trainerNotes) {
      throw new BadRequestException(
        'trainerNotes is required as qualitative trainer feedback notes',
      );
    }

    // Retry guidance validation when not passed
    let retryGuidance = dto.retryGuidance?.trim() || null;
    if (!dto.passed) {
      if (!retryGuidance || retryGuidance.length < 5) {
        throw new BadRequestException(
          'Meaningful retry guidance is required when oral assessment is not passed',
        );
      }
    }

    // Overall Score: calculated percentage
    const overallScore = sumMax > 0 ? Math.round((sumScore / sumMax) * 100) : 0;
    const now = new Date();

    // Atomic Transaction: Rubrics + Assessment Status + AuditLog
    return this.prisma.$transaction(async (tx) => {
      // 1. Clean existing scores if regrading
      await tx.oralAssessmentScore.deleteMany({
        where: { assessmentId: id },
      });

      // 2. Insert new rubric scores
      await tx.oralAssessmentScore.createMany({
        data: dto.scores.map((s) => ({
          assessmentId: id,
          rubricCategory: s.rubricCategory.trim(),
          score: s.score,
          maxScore: s.maxScore ?? 10,
          feedback: s.feedback?.trim() || null,
        })),
      });

      // 3. Update Oral Assessment
      const updated = await tx.oralAssessment.update({
        where: { id },
        data: {
          assessorId: actorId,
          overallScore,
          passed: dto.passed,
          status: dto.passed
            ? OralAssessmentStatus.PASSED
            : OralAssessmentStatus.FAILED,
          trainerNotes,
          retryGuidance,
          completedAt: now,
        },
        include: {
          scores: true,
          assessor: {
            select: { id: true, name: true, email: true },
          },
          enrolment: {
            select: { id: true, userId: true, batchId: true },
          },
        },
      });

      // 4. Record Audit Log
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'ORAL_ASSESSMENT_GRADED',
          entity: 'OralAssessment',
          entityId: id,
          meta: {
            enrolmentId: assessment.enrolmentId,
            overallScore,
            passed: dto.passed,
            rubricCount: dto.scores.length,
            assessorRole: actor.role,
          },
          createdAt: now,
        },
      });

      return updated;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. GET ORAL ASSESSMENTS FOR BATCH (MANAGERS & ADMINS)
  // ─────────────────────────────────────────────────────────────────────────────

  async findByBatch(batchId: string, actor: any) {
    const actorId = actor?.sub ?? actor?.id;
    if (!actorId) {
      throw new ForbiddenException('Access denied: Authentication required');
    }

    if (actor.role === Role.USER || actor.role === 'USER') {
      throw new ForbiddenException('Access denied: Learners cannot view batch assessments');
    }

    if ((actor.role === Role.MANAGER || actor.role === 'MANAGER' || actor.role === 'TEACHER')) {
      const isAssigned = await isManagerAssignedToBatch(
        this.prisma,
        actorId,
        batchId,
      );
      if (!isAssigned) {
        throw new ForbiddenException(
          'Access denied: You are not assigned to manage this batch cohort',
        );
      }
    }

    return this.prisma.oralAssessment.findMany({
      where: {
        enrolment: {
          batchId,
        },
      },
      include: {
        scores: true,
        assessor: {
          select: { id: true, name: true, email: true },
        },
        enrolment: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
