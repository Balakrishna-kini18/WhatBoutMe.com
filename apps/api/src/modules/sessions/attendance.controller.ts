import { Controller, Get, Post, Patch, Param, Body, Request, UseGuards, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AttendanceService } from './attendance.service.js';
import { attendanceDay, markDailyAttendance } from '../../common/daily-attendance.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { Permission } from '../../config/permissions.config.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { OverrideAttendanceDto } from './dto/index.js';
import { AttendanceComplianceService } from './attendance-compliance.service.js';

/**
 * Daily attendance for the learner portal. A learner is present on a day when
 * they opened the portal or signed in, finished a course step, or joined a
 * live session.
 */
@Controller('attendance')
export class AttendanceController {
  constructor(
    private prisma: PrismaService,
    private attendanceService: AttendanceService,
    private complianceService: AttendanceComplianceService,
  ) {}

  /** Called by the learner portal when it is opened. */
  @Post('visit')
  async visit(@Request() req: any) {
    await markDailyAttendance(this.prisma, req.user.sub, 'visited');
    return { date: attendanceDay() };
  }

  @Get('mine')
  async mine(@Request() req: any) {
    const days = await this.prisma.dailyAttendance.findMany({
      where: { userId: req.user.sub },
      orderBy: { date: 'desc' },
      select: { date: true, visited: true, lessonDone: true, sessionJoined: true },
    });
    return { today: attendanceDay(), days };
  }

  /**
   * D1-050: Manual Attendance Override
   */
  @UseGuards(PermissionsGuard)
  @RequirePermission(Permission.ATTENDANCE_CORRECT)
  @Patch(':id/override')
  async overrideAttendance(
    @Param('id') id: string,
    @Body() dto: OverrideAttendanceDto,
    @Request() req: any
  ) {
    const actor = {
      id: req.user.sub ?? req.user.userId ?? req.user.id,
      role: req.user.role,
    };
    return this.attendanceService.overrideAttendanceById(id, dto.status, actor, dto.correctionReason);
  }

  /**
   * D1-049: Get attendance compliance for an enrolment
   */
  @UseGuards(PermissionsGuard)
  @RequirePermission(Permission.ATTENDANCE_READ)
  @Get(['compliance/:enrolmentId', 'compliance/enrolment/:enrolmentId'])
  async getCompliance(@Param('enrolmentId') enrolmentId: string, @Request() req: any) {
    if (req.user?.role === 'USER') {
      const enrolment = await this.prisma.enrolment.findUnique({
        where: { id: enrolmentId },
        select: { userId: true },
      });
      if (enrolment && enrolment.userId !== req.user.sub) {
        throw new ForbiddenException('Access denied: You can only view your own attendance compliance');
      }
    }
    return this.complianceService.calculateCompliance(enrolmentId);
  }

  /**
   * Phase 7:
   * GET /api/attendance/user/:userId
   * Roles: SUPER_ADMIN, ADMIN, MANAGER (scoped to assigned batch).
   * Returns individual learner attendance history on Learner Profile view.
   */
  @UseGuards(PermissionsGuard)
  @RequirePermission(Permission.ATTENDANCE_READ)
  @Get('user/:userId')
  async getUserAttendance(@Param('userId') userId: string, @Request() req: any) {
    const actorRole = req.user?.role;
    const actorId = req.user?.sub ?? req.user?.userId ?? req.user?.id;

    // Manager scoping check: manager must be assigned to at least one batch this user is enrolled in
    if (actorRole === 'MANAGER' || actorRole === 'TEACHER') {
      const isAssigned = await this.prisma.enrolment.findFirst({
        where: {
          userId,
          batch: {
            OR: [
              { managerId: actorId },
              { trainers: { some: { trainerId: actorId } } },
            ],
          },
        },
      });

      if (!isAssigned) {
        throw new ForbiddenException('You do not have access to view attendance for learners outside your assigned cohorts');
      }
    }

    // Find all active enrolments for this learner
    const enrolments = await this.prisma.enrolment.findMany({
      where: { userId },
      select: {
        id: true,
        batchId: true,
        batch: {
          select: {
            id: true,
            name: true,
            program: {
              select: {
                id: true,
                title: true,
                minAttendancePercentage: true,
              },
            },
          },
        },
      },
    });

    const batchIds = enrolments.map((e) => e.batchId).filter(Boolean) as string[];

    // Find all sessions for their batches or dedicated to this user
    const sessions = await this.prisma.session.findMany({
      where: {
        OR: [
          ...(batchIds.length > 0 ? [{ batchId: { in: batchIds } }] : []),
          { userId },
          { learnerId: userId },
        ],
      },
      include: {
        batch: {
          select: {
            id: true,
            name: true,
            program: { select: { title: true, minAttendancePercentage: true } },
          },
        },
      },
      orderBy: { startTime: 'desc' },
    });

    // Fetch this user's attendance records
    const attendances = await this.prisma.attendance.findMany({
      where: { userId },
    });

    const attendanceBySessionId = new Map<string, (typeof attendances)[0]>();
    for (const att of attendances) {
      attendanceBySessionId.set(att.sessionId, att);
    }

    let attendedCount = 0;
    const history = sessions.map((session) => {
      const att = attendanceBySessionId.get(session.id);
      const isPresent =
        att &&
        (att.status === 'PRESENT' ||
          att.status === 'PRESENT_AUTO' ||
          att.status === 'PRESENT_MANUAL' ||
          att.status === 'CORRECTED');

      if (isPresent) attendedCount++;

      return {
        sessionId: session.id,
        sessionTitle: session.title,
        sessionType: session.sessionType,
        batchId: session.batchId,
        batchName: session.batch?.name || null,
        programTitle: session.batch?.program?.title || null,
        startTimeUtc: session.startTime.toISOString(),
        endTimeUtc: session.endTime.toISOString(),
        durationMinutes: session.durationMinutes || 60,
        meetingProvider: session.meetingProvider,
        joinUrl: session.joinUrl || session.meetingLink,
        recordingUrl: session.recordingUrl || session.recordingLink,
        status: att?.status ?? 'ABSENT',
        minutesPresent: att?.minutesPresent ?? att?.durationMin ?? 0,
        attendancePercentage: att?.attendancePercentage ?? 0,
        source: att?.source ?? 'AUTO',
        overrideReason: att?.overrideReason || att?.correctionReason || null,
        joinTimeUtc: att?.joinTime ? att.joinTime.toISOString() : null,
        leaveTimeUtc: att?.leaveTime ? att.leaveTime.toISOString() : null,
      };
    });

    const totalScheduled = sessions.length;
    const overallPercentage =
      totalScheduled > 0 ? Math.round((attendedCount / totalScheduled) * 100) : 100;

    return {
      userId,
      totalScheduledSessions: totalScheduled,
      totalAttendedSessions: attendedCount,
      overallAttendancePercentage: overallPercentage,
      history,
    };
  }
}
