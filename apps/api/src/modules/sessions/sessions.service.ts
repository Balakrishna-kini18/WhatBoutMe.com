import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ZoomMeetingProvider } from '../zoom/zoom.service.js';
import { markDailyAttendance } from '../../common/daily-attendance.js';

@Injectable()
export class SessionsService {
  constructor(
    private prisma: PrismaService,
    private zoomService: ZoomMeetingProvider
  ) {}

  // 1. Get all sessions for a specific batch
  async getSessionsByBatch(batchId: string) {
    return this.prisma.session.findMany({
      where: { batchId },
      orderBy: { startTime: 'asc' },
      include: {
        attendances: true
      }
    });
  }

  /**
   * Every live session of the learner's cohorts, past and upcoming, with
   * whether they attended. Used by the learner portal's Attendance page.
   */
  async getMySessions(userId: string) {
    const enrolments = await this.prisma.enrolment.findMany({
      where: { userId, status: { in: ['ACTIVE', 'COMPLETED'] } },
      select: { id: true, batchId: true, batch: { select: { name: true, program: { select: { title: true } } } } },
    });
    if (enrolments.length === 0) return [];

    const sessions = await this.prisma.session.findMany({
      where: { batchId: { in: enrolments.map((e) => e.batchId) } },
      orderBy: { startTime: 'desc' },
      include: {
        attendances: { where: { enrolmentId: { in: enrolments.map((e) => e.id) } } },
      },
    });

    return sessions.map((session) => {
      const enrolment = enrolments.find((e) => e.batchId === session.batchId);
      const attendance = session.attendances[0];
      return {
        id: session.id,
        title: session.title,
        startTime: session.startTime,
        endTime: session.endTime,
        recordingUrl: session.recordingUrl,
        programTitle: enrolment?.batch.program.title ?? '',
        batchName: enrolment?.batch.name ?? '',
        attended: Boolean(attendance),
        joinTime: attendance?.joinTime ?? null,
        durationMin: attendance?.durationMin ?? null,
      };
    });
  }

  // 2. Create a session for a batch
  async createSession(data: { batchId: string, title: string, startTime: string, endTime: string, joinUrl?: string, recordingUrl?: string, quizId?: string }) {
    let finalJoinUrl = data.joinUrl;
    
    // If no join URL was provided, automatically generate a Zoom meeting
    if (!finalJoinUrl || finalJoinUrl.trim() === '') {
      const start = new Date(data.startTime);
      const end = new Date(data.endTime);
      const durationMin = Math.round((end.getTime() - start.getTime()) / 60000);
      
      const meetingDetails = await this.zoomService.createMeeting({
        topic: data.title,
        startTime: start,
        durationMinutes: durationMin,
        timezone: 'UTC'
      });
      finalJoinUrl = meetingDetails.joinUrl;
    }

    const session = await this.prisma.session.create({
      data: {
        batchId: data.batchId,
        title: data.title,
        startTime: new Date(data.startTime),
        endTime: new Date(data.endTime),
        joinUrl: finalJoinUrl || null,
        recordingUrl: data.recordingUrl || null,
        quizId: data.quizId || null,
      }
    });

    await this.remindLearners(session.batchId, session.title, session.startTime);
    return session;
  }

  // Queue an in-app reminder for every learner with access to the cohort.
  // Email delivery needs a mail provider; until one is configured the
  // reminders are in-app only.
  private async remindLearners(batchId: string, title: string, startTime: Date) {
    const enrolments = await this.prisma.enrolment.findMany({
      where: { batchId, status: { in: ['ACTIVE', 'COMPLETED'] } },
      select: { userId: true },
    });
    if (enrolments.length === 0) return;

    await this.prisma.notification.createMany({
      data: enrolments.map((e) => ({
        userId: e.userId,
        type: 'SESSION_REMINDER',
        template: `Live session scheduled: ${title}`,
        channel: 'IN_APP' as const,
        schedule: startTime,
      })),
    });
  }

  // Every session with its cohort and course, for the admin meetings page
  async getAllSessions() {
    return this.prisma.session.findMany({
      orderBy: { startTime: 'desc' },
      include: {
        batch: { include: { program: { select: { id: true, title: true } } } },
        _count: { select: { attendances: true } },
      },
    });
  }

  // 3. Delete a session
  async deleteSession(sessionId: string) {
    return this.prisma.session.delete({
      where: { id: sessionId }
    });
  }

  // 4. Mark attendance for a learner (either self-check-in or admin manual)
  async markAttendance(sessionId: string, userId: string, isAdminOverride: boolean = false) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { batch: true }
    });

    if (!session) throw new NotFoundException('Session not found');

    // Check if within time window (unless Admin is overriding)
    if (!isAdminOverride) {
      const now = new Date();
      // Allow check-in 5 mins before start, until the end time
      const windowStart = new Date(session.startTime.getTime() - 5 * 60000);
      const windowEnd = session.endTime;
      
      if (now < windowStart) {
        throw new BadRequestException('Attendance window has not opened yet.');
      }
      if (now > windowEnd) {
        throw new BadRequestException('Attendance window has closed.');
      }
    }

    // Find the student's enrolment for this batch
    const enrolment = await this.prisma.enrolment.findUnique({
      where: { userId_batchId: { userId, batchId: session.batchId } }
    });

    if (!enrolment) {
      throw new BadRequestException('User is not enrolled in this batch.');
    }

    // a learner joining a live session is present for the day; an admin
    // correcting the record afterwards must not move it to today
    if (!isAdminOverride) await markDailyAttendance(this.prisma, userId, 'sessionJoined');

    // Upsert the attendance record (creates if not exists)
    return this.prisma.attendance.upsert({
      where: {
        sessionId_enrolmentId: {
          sessionId,
          enrolmentId: enrolment.id
        }
      },
      update: {
        joinTime: new Date()
      },
      create: {
        sessionId,
        enrolmentId: enrolment.id,
        joinTime: new Date()
      }
    });
  }

  // 5. Get attendance records for a session
  async getAttendanceForSession(sessionId: string, user: any) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { batch: true }
    });
    
    if (!session) throw new NotFoundException('Session not found');

    if (user.role === Role.MANAGER && session.batch.managerId !== user.sub) {
      throw new ForbiddenException('You can only view attendance for your own batches');
    }

    return this.prisma.attendance.findMany({
      where: { sessionId },
      include: {
        enrolment: {
          include: { user: true }
        }
      }
    });
  }
}
