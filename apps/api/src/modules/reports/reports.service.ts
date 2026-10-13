import { Injectable } from '@nestjs/common';
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
      const programIds = [...new Set(managerBatches.map(b => b.programId).filter(Boolean))];
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
        stepNumber: step.stepNumber,
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
      const programIds = [...new Set(managerBatches.map(b => b.programId).filter(Boolean))];
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
      quiz.attempts.forEach((a: any) => { totalScore += (a.score || 0); });

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

  // D1-062: CSV Export Streaming
  async getCsvExport(type: string, user?: any): Promise<string> {
    let data: any[] = [];
    
    if (type === 'attendance') {
      data = await this.getAttendanceAnalytics(user);
    } else if (type === 'progress') {
      data = await this.getProgressDropOffAnalytics(user);
    } else if (type === 'assessments') {
      data = await this.getAssessmentAnalytics(user);
    } else {
      throw new Error('Invalid export type');
    }

    if (data.length === 0) {
      return '';
    }

    const headers = Object.keys(data[0]).filter(k => typeof data[0][k] !== 'object');
    let csv = headers.join(',') + '\n';
    
    data.forEach(row => {
      const line = headers.map(header => {
        const value = row[header];
        if (typeof value === 'string') {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',');
      csv += line + '\n';
    });

    return csv;
  }
}
