import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Role } from '@prisma/client';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // D1-059: Batch attendance distributions
  async getAttendanceAnalytics(user?: any) {
    const where: any = {};
    if (user && (user.role === Role.MANAGER || user.role === 'MANAGER' || user.role === 'TEACHER')) {
      const userId = user.sub || user.id;
      where.OR = [
        { managerId: userId },
        { trainers: { some: { trainerId: userId } } },
      ];
    }

    const batches = await this.prisma.batch.findMany({
      where,
      select: {
        id: true,
        name: true,
        sessions: {
          select: {
            id: true,
            attendances: {
              select: {
                status: true,
              },
            },
          },
        },
      },
    });

    return batches.map((batch: any) => {
      let total = 0;
      let present = 0;
      let absent = 0;

      batch.sessions.forEach((session: any) => {
        session.attendances.forEach((att: any) => {
          total++;
          if (att.status === 'ABSENT') {
            absent++;
          } else {
            present++; // PRESENT_AUTO, PRESENT_MANUAL, CORRECTED
          }
        });
      });

      return {
        batchId: batch.id,
        batchName: batch.name,
        totalAttendances: total,
        presentCount: present,
        absentCount: absent,
        compliancePercentage: total > 0 ? (present / total) * 100 : 0,
      };
    });
  }

  // D1-060: Learner progress drop-off analytics
  async getProgressDropOffAnalytics(user?: any) {
    const where: any = {};
    if (user && (user.role === Role.MANAGER || user.role === 'MANAGER' || user.role === 'TEACHER')) {
      const userId = user.sub || user.id;
      const managerBatches = await this.prisma.batch.findMany({
        where: {
          OR: [
            { managerId: userId },
            { trainers: { some: { trainerId: userId } } },
          ],
        },
        select: { programId: true },
      });
      const programIds = [...new Set(managerBatches.map((b) => b.programId).filter(Boolean))];
      where.programId = { in: programIds as string[] };
    }

    const steps = await this.prisma.step.findMany({
      where,
      include: {
        progress: true,
      },
    });

    return steps.map((step: any) => {
      const totalEnrolled = step.progress.length;
      const completed = step.progress.filter((p: any) => p.isCompleted).length;
      const droppedOff = totalEnrolled - completed;

      return {
        stepId: step.id,
        title: step.title,
        stepNumber: step.sequence ?? step.stepNumber ?? 1,
        programId: step.programId,
        totalEnrolled,
        completedCount: completed,
        droppedOffCount: droppedOff,
        completionRate: totalEnrolled > 0 ? (completed / totalEnrolled) * 100 : 0,
      };
    });
  }

  // D1-061: Assessment analytics
  async getAssessmentAnalytics(user?: any) {
    const where: any = {};
    if (user && (user.role === Role.MANAGER || user.role === 'MANAGER' || user.role === 'TEACHER')) {
      const userId = user.sub || user.id;
      const managerBatches = await this.prisma.batch.findMany({
        where: {
          OR: [
            { managerId: userId },
            { trainers: { some: { trainerId: userId } } },
          ],
        },
        select: { programId: true },
      });
      const programIds = [...new Set(managerBatches.map((b) => b.programId).filter(Boolean))];
      where.step = { programId: { in: programIds as string[] } };
    }

    const quizzes = await this.prisma.quiz.findMany({
      where,
      include: {
        attempts: true,
        questions: {
          include: {
            answers: true,
          },
        },
      },
    });

    return quizzes.map((quiz: any) => {
      const totalAttempts = quiz.attempts.length;
      const passedAttempts = quiz.attempts.filter((a: any) => a.passed).length;

      let totalScore = 0;
      quiz.attempts.forEach((a: any) => {
        totalScore += a.score || 0;
      });

      const questionDifficulty = quiz.questions.map((q: any) => {
        const totalAnswers = q.answers.length;
        const correctAnswers = q.answers.filter((a: any) => a.isCorrect).length;
        return {
          questionId: q.id,
          text: q.text,
          totalAnswers,
          correctAnswers,
          difficultyPercent: totalAnswers > 0 ? (correctAnswers / totalAnswers) * 100 : 0,
        };
      });

      return {
        quizId: quiz.id,
        title: quiz.title,
        totalAttempts,
        passRatio: totalAttempts > 0 ? (passedAttempts / totalAttempts) * 100 : 0,
        averageScore: totalAttempts > 0 ? totalScore / totalAttempts : 0,
        questionDifficulty,
      };
    });
  }

  // Financial & Payment analytics (Restricted to SUPER_ADMIN and ADMIN)
  async getPaymentAnalytics(user?: any, query?: { page?: number; limit?: number }) {
    if (user && (user.role === Role.MANAGER || user.role === 'MANAGER' || user.role === 'TEACHER')) {
      throw new ForbiddenException('Managers do not have permission to access financial reports');
    }

    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query?.limit) || 50));
    const skip = (page - 1) * limit;

    const payments = await this.prisma.payment.findMany({
      skip,
      take: limit,
      include: {
        invoice: true,
        enrolment: {
          include: {
            user: { select: { id: true, name: true, email: true } },
            program: { select: { id: true, title: true } },
            batch: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return payments.map((p) => ({
      paymentId: p.id,
      invoiceNumber: p.invoice?.invoiceNumber || 'N/A',
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      clientName: p.enrolment?.user?.name || 'Unknown',
      clientEmail: p.enrolment?.user?.email || 'Unknown',
      programTitle: p.enrolment?.program?.title || 'Unknown',
      batchName: p.enrolment?.batch?.name || 'N/A',
      creditNoteId: p.invoice?.creditNoteId || 'N/A',
      date: new Date(p.createdAt).toISOString().split('T')[0],
    }));
  }

  // Certificate Issuance analytics (Scoped for managers, platform-wide for admins)
  async getCertificateAnalytics(user?: any) {
    const where: any = {};
    if (user && (user.role === Role.MANAGER || user.role === 'MANAGER' || user.role === 'TEACHER')) {
      const userId = user.sub || user.id;
      const managerBatches = await this.prisma.batch.findMany({
        where: {
          OR: [
            { managerId: userId },
            { trainers: { some: { trainerId: userId } } },
          ],
        },
        select: { programId: true },
      });
      const programIds = [...new Set(managerBatches.map((b) => b.programId).filter(Boolean))];
      where.programId = { in: programIds as string[] };
    }

    const certificates = await this.prisma.certificate.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        program: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return certificates.map((cert) => ({
      certificateId: cert.id,
      certificateCode: cert.certificateCode,
      recipientName: cert.user?.name || 'Unknown',
      recipientEmail: cert.user?.email || 'Unknown',
      programTitle: cert.program?.title || 'Unknown',
      status: cert.status,
      cpdHours: cert.cpdHours || 0,
      issueDate: cert.issueDate
        ? new Date(cert.issueDate).toISOString().split('T')[0]
        : cert.issuedAt
          ? new Date(cert.issuedAt).toISOString().split('T')[0]
          : 'N/A',
    }));
  }

  // D1-062: CSV Export Streaming with UTF-8 BOM for Microsoft Excel compatibility
  async getCsvExport(type: string, user?: any): Promise<string> {
    let data: any[] = [];

    const normalizedType = type?.toLowerCase().trim();

    if (normalizedType === 'attendance') {
      data = await this.getAttendanceAnalytics(user);
    } else if (normalizedType === 'progress' || normalizedType === 'drop-offs') {
      data = await this.getProgressDropOffAnalytics(user);
    } else if (normalizedType === 'assessments' || normalizedType === 'quizzes') {
      data = await this.getAssessmentAnalytics(user);
    } else if (normalizedType === 'payments' || normalizedType === 'financial' || normalizedType === 'revenue') {
      data = await this.getPaymentAnalytics(user);
    } else if (normalizedType === 'certificates') {
      data = await this.getCertificateAnalytics(user);
    } else {
      throw new BadRequestException(
        `Invalid export type '${type}'. Supported types: attendance, progress, assessments, payments, certificates`,
      );
    }

    if (data.length === 0) {
      return '\uFEFF';
    }

    const headers = Object.keys(data[0]).filter((k) => typeof data[0][k] !== 'object');
    // Prepend UTF-8 Byte Order Mark (\uFEFF) so Excel on Windows cleanly interprets encoding
    let csv = '\uFEFF' + headers.join(',') + '\n';

    data.forEach((row) => {
      const line = headers
        .map((header) => {
          const value = row[header];
          if (value === null || value === undefined) return '""';
          if (typeof value === 'string') {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        })
        .join(',');
      csv += line + '\n';
    });

    return csv;
  }

  /**
   * Phase 6: Export batch attendance sheet to CSV/Excel format.
   * Scoped to Super Admins, Admins, and assigned Batch Manager.
   */
  async exportBatchAttendance(batchId: string, user: any, format = 'csv') {
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
      include: {
        program: true,
        trainers: true,
        sessions: {
          orderBy: { startTime: 'asc' },
        },
        enrolments: {
          where: { status: 'ACTIVE' },
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!batch) {
      throw new BadRequestException('Batch not found');
    }

    if (user && (user.role === Role.MANAGER || user.role === 'MANAGER' || user.role === 'TEACHER')) {
      const userId = user.sub || user.userId || user.id;
      const isAssigned =
        batch.managerId === userId || batch.trainers.some((t) => t.trainerId === userId);
      if (!isAssigned) {
        throw new ForbiddenException('Access denied: You are not assigned to manage this batch');
      }
    }

    const minAttendanceThreshold =
      batch.program?.minAttendancePercentage ?? (batch as any).attendanceThreshold ?? 75;

    // Fetch all attendances for the batch's sessions
    const sessionIds = batch.sessions.map((s) => s.id);
    const attendances = await this.prisma.attendance.findMany({
      where: { sessionId: { in: sessionIds } },
    });

    const attendanceLookup = new Map<string, Map<string, (typeof attendances)[0]>>();
    for (const att of attendances) {
      if (!attendanceLookup.has(att.userId)) {
        attendanceLookup.set(att.userId, new Map());
      }
      attendanceLookup.get(att.userId)!.set(att.sessionId, att);
    }

    // Build header columns
    const baseHeaders = [
      'Learner Name',
      'Learner Email',
      'Enrolment Status',
      'Total Sessions',
      'Sessions Attended',
      'Attendance Percentage',
      'Compliance Status (Min 75%)',
    ];

    const sessionHeaders: string[] = [];
    batch.sessions.forEach((s) => {
      const dateStr = s.startTime ? new Date(s.startTime).toISOString().slice(0, 10) : '';
      sessionHeaders.push(`${s.title} (${dateStr}) Status`);
      sessionHeaders.push(`${s.title} Minutes`);
    });

    const allHeaders = [...baseHeaders, ...sessionHeaders];
    let csv = '\uFEFF' + allHeaders.map((h) => `"${h.replace(/"/g, '""')}"`).join(',') + '\n';

    batch.enrolments.forEach((enrolment) => {
      const userAttMap = attendanceLookup.get(enrolment.userId);
      let attendedCount = 0;

      const sessionValues: string[] = [];
      batch.sessions.forEach((s) => {
        const att = userAttMap?.get(s.id);
        const isPresent =
          att &&
          (att.status === 'PRESENT' ||
            att.status === 'PRESENT_AUTO' ||
            att.status === 'PRESENT_MANUAL' ||
            att.status === 'CORRECTED');

        if (isPresent) attendedCount++;

        sessionValues.push(att?.status || 'ABSENT');
        sessionValues.push(String(att?.minutesPresent || att?.durationMin || 0));
      });

      const totalSessions = batch.sessions.length;
      const percentage =
        totalSessions > 0 ? Math.round((attendedCount / totalSessions) * 100) : 100;
      const isCompliant = percentage >= minAttendanceThreshold ? 'COMPLIANT' : 'NON_COMPLIANT';

      const row = [
        enrolment.user?.name || 'Learner',
        enrolment.user?.email || '',
        enrolment.status,
        String(totalSessions),
        String(attendedCount),
        `${percentage}%`,
        isCompliant,
        ...sessionValues,
      ];

      csv += row.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(',') + '\n';
    });

    const filename = `batch-${batch.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-attendance.csv`;
    return {
      csv,
      filename,
      contentType: 'text/csv; charset=utf-8',
    };
  }
}
