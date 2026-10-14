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
  async getPaymentAnalytics(user?: any) {
    if (user && (user.role === Role.MANAGER || user.role === 'MANAGER' || user.role === 'TEACHER')) {
      throw new ForbiddenException('Managers do not have permission to access financial reports');
    }

    const payments = await this.prisma.payment.findMany({
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
}
