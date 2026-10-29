import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OneOnOneSessionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { UpdateOneOnOneDto } from './dto/index.js';

@Injectable()
export class OrgAcademicTrackerService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Aggregates the 6 WhatBoutMe Accreditation Gates for all student slots under an Organization.
   */
  async getLearnersTracker(
    orgId: string,
    batchId?: string,
    filter?: {
      search?: string;
      status?: string;
      gate?: string;
    },
  ) {
    const whereClause: Prisma.SeatWhereInput = {
      organizationId: orgId,
      ...(batchId ? { seatPool: { batchId } } : {}),
    };

    if (filter?.status) {
      whereClause.status = filter.status as any;
    }

    const seats = await this.prisma.seat.findMany({
      where: whereClause,
      include: {
        seatPool: {
          select: {
            id: true,
            poolCode: true,
            batchId: true,
            batch: {
              select: {
                id: true,
                name: true,
                startDate: true,
                endDate: true,
                status: true,
              },
            },
            program: {
              select: {
                id: true,
                title: true,
                slug: true,
              },
            },
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            country: true,
            createdAt: true,
          },
        },
        invite: true,
        enrolment: {
          include: {
            signedAgreement: {
              select: {
                id: true,
                signedAt: true,
                signatureType: true,
              },
            },
            lessonProgress: {
              select: {
                lessonId: true,
                completedAt: true,
                viewed: true,
              },
            },
            certificate: {
              select: {
                id: true,
                certificateCode: true,
                issueDate: true,
              },
            },
            examAttempts: {
              select: {
                id: true,
                score: true,
                passed: true,
                status: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
            attendance: {
              select: {
                id: true,
                status: true,
              },
            },
          },
        },
      },
      orderBy: [
        { seatPool: { createdAt: 'desc' } },
        { slotNumber: 'asc' },
      ],
    });

    const learners = seats.map((seat: any) => {
      const studentUser = seat.user;
      const enrolment = seat.enrolment;
      const agreement = enrolment?.signedAgreement;
      const cert = enrolment?.certificate;
      const latestExam = enrolment?.examAttempts?.[0];

      // Gate 1: Workshop Agreement
      const gate1Agreement = {
        isSatisfied: Boolean(agreement?.signedAt),
        signedAt: agreement?.signedAt || null,
        signatureType: agreement?.signatureType || null,
      };

      // Gate 2: 11 Steps & Quizzes
      const completedLessonsCount =
        enrolment?.lessonProgress?.filter((lp: any) => Boolean(lp.completedAt || lp.viewed)).length || 0;
      const gate2Curriculum = {
        isSatisfied: Boolean(enrolment?.curriculumCompletedAt),
        completedAt: enrolment?.curriculumCompletedAt || null,
        completedLessonsCount,
        currentStage: enrolment?.currentStage || null,
      };

      // Gate 3: Live Cohort Attendance
      const totalAttended = enrolment?.attendance?.filter((a: any) => a.status === 'PRESENT').length || 0;
      const gate3Attendance = {
        isSatisfied: Boolean(enrolment?.attendanceSatisfiedAt),
        satisfiedAt: enrolment?.attendanceSatisfiedAt || null,
        attendedSessionsCount: totalAttended,
      };

      // Gate 4: 1-on-1 Mentorship Session
      const gate4OneOnOne = {
        status: enrolment?.oneOnOneStatus || OneOnOneSessionStatus.NOT_BOOKED,
        isSatisfied: enrolment?.oneOnOneStatus === OneOnOneSessionStatus.COMPLETED,
        scheduledAt: enrolment?.oneOnOneScheduledAt || null,
        completedAt: enrolment?.oneOnOneCompletedAt || null,
        facilitatorName: enrolment?.oneOnOneFacilitatorName || 'Roweena',
        meetingUrl: enrolment?.oneOnOneMeetingUrl || null,
      };

      // Gate 5: Final Comprehensive Exam
      const gate5Exam = {
        isSatisfied: Boolean(enrolment?.examPassedAt),
        passedAt: enrolment?.examPassedAt || null,
        score: latestExam?.score ?? null,
        passed: latestExam?.passed ?? false,
      };

      // Gate 6: WhatBoutMe Certificate
      const gate6Certificate = {
        isIssued: Boolean(cert?.certificateCode),
        certificateCode: cert?.certificateCode || null,
        issueDate: cert?.issueDate || null,
      };

      // Inactivity / At-Risk evaluation
      const isEnrolled = Boolean(enrolment);
      const isUnstarted = isEnrolled && !gate1Agreement.isSatisfied;
      const isAtRisk =
        isEnrolled &&
        !gate6Certificate.isIssued &&
        seat.status !== 'AVAILABLE' &&
        (isUnstarted || (latestExam && !latestExam.passed));

      return {
        seatId: seat.id,
        slotNumber: seat.slotNumber,
        slotLabel: seat.slotLabel,
        slotStatus: seat.status,
        poolCode: seat.seatPool.poolCode,
        batchId: seat.seatPool.batchId,
        batchName: seat.seatPool.batch.name,
        programTitle: seat.seatPool.program.title,
        redemptionMode: seat.redemptionMode,
        voucherCodeMasked: seat.voucherCodeMasked,
        department: seat.department,
        externalOrderRef: seat.externalOrderRef,
        resalePrice: seat.resalePrice,

        student: {
          id: studentUser?.id || null,
          name: studentUser?.name || seat.invite?.fullName || null,
          email: studentUser?.email || seat.invite?.email || null,
          phone: studentUser?.phone || seat.invite?.phone || null,
        },

        enrolmentId: enrolment?.id || null,
        enrolmentStatus: enrolment?.status || null,

        gates: {
          gate1Agreement,
          gate2Curriculum,
          gate3Attendance,
          gate4OneOnOne,
          gate5Exam,
          gate6Certificate,
        },

        isAtRisk,
      };
    });

    // Optional text search filter
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      return learners.filter(
        (l: any) =>
          l.slotLabel.toLowerCase().includes(q) ||
          l.student.name?.toLowerCase().includes(q) ||
          l.student.email?.toLowerCase().includes(q) ||
          l.department?.toLowerCase().includes(q) ||
          l.externalOrderRef?.toLowerCase().includes(q),
      );
    }

    return learners;
  }

  /**
   * Generates a CSV compliance and progress export string for corporate HR & accreditation reporting.
   */
  async exportLearnersCsv(orgId: string, batchId?: string): Promise<string> {
    const learners = await this.getLearnersTracker(orgId, batchId);

    const headers = [
      'Slot #',
      'Slot Label',
      'Status',
      'Student Name',
      'Email',
      'Department',
      'External Order Ref',
      'Batch Name',
      'Gate 1 (Agreement)',
      'Gate 2 (Curriculum)',
      'Gate 3 (Live Attendance)',
      'Gate 4 (1-on-1 Session)',
      'Gate 5 (Exam)',
      'Gate 6 (Certificate Code)',
      'Certificate Date',
    ];

    const rows = learners.map((l: any) => [
      l.slotNumber,
      `"${l.slotLabel}"`,
      l.slotStatus,
      `"${l.student.name || ''}"`,
      `"${l.student.email || ''}"`,
      `"${l.department || ''}"`,
      `"${l.externalOrderRef || ''}"`,
      `"${l.batchName}"`,
      l.gates.gate1Agreement.isSatisfied ? 'SIGNED' : 'PENDING',
      l.gates.gate2Curriculum.isSatisfied ? 'COMPLETED' : `${l.gates.gate2Curriculum.completedLessonsCount} lessons`,
      l.gates.gate3Attendance.isSatisfied ? 'SATISFIED' : 'PENDING',
      l.gates.gate4OneOnOne.status,
      l.gates.gate5Exam.isSatisfied ? 'PASSED' : 'NOT PASSED',
      l.gates.gate6Certificate.certificateCode || 'NOT ISSUED',
      l.gates.gate6Certificate.issueDate ? new Date(l.gates.gate6Certificate.issueDate).toISOString().split('T')[0] : '',
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  /**
   * Updates an organization student's 1-on-1 Mentorship session status (conducted by WhatBoutMe faculty).
   */
  async updateOneOnOneStatus(
    enrolmentId: string,
    dto: UpdateOneOnOneDto,
    actor: any,
  ) {
    const enrolment = await this.prisma.enrolment.findUnique({
      where: { id: enrolmentId },
      include: { user: true, organization: true },
    });

    if (!enrolment) {
      throw new NotFoundException(`Enrolment ${enrolmentId} not found`);
    }

    const data: Prisma.EnrolmentUpdateInput = {};

    if (dto.status) {
      data.oneOnOneStatus = dto.status;
      if (dto.status === OneOnOneSessionStatus.COMPLETED) {
        data.oneOnOneCompletedAt = new Date();
      }
    }
    if (dto.scheduledAt) {
      data.oneOnOneScheduledAt = new Date(dto.scheduledAt);
    }
    if (dto.facilitatorId !== undefined) {
      data.oneOnOneFacilitatorId = dto.facilitatorId;
    }
    if (dto.facilitatorName !== undefined) {
      data.oneOnOneFacilitatorName = dto.facilitatorName;
    }
    if (dto.meetingUrl !== undefined) {
      data.oneOnOneMeetingUrl = dto.meetingUrl;
    }
    if (dto.adminNotes !== undefined) {
      data.oneOnOneAdminNotes = dto.adminNotes;
    }

    const updated = await this.prisma.enrolment.update({
      where: { id: enrolmentId },
      data,
    });

    // Audit Log
    await this.prisma.auditLog.create({
      data: {
        actorId: actor?.id || null,
        action: 'ONE_ON_ONE_STATUS_UPDATED',
        entity: 'Enrolment',
        entityId: enrolmentId,
        meta: {
          previousStatus: enrolment.oneOnOneStatus,
          newStatus: dto.status,
          studentEmail: enrolment.user.email,
          organizationId: enrolment.organizationId,
        },
      },
    });

    return updated;
  }
}
