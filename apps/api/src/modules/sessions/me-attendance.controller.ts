import { Controller, Get, Request, UseGuards, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { Permission } from '../../config/permissions.config.js';
import { AttendanceStatus } from '@prisma/client';

@Controller('me')
@UseGuards(PermissionsGuard)
export class MeAttendanceController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Phase 5 Endpoint 6:
   * GET /api/me/attendance
   * Roles: USER (Learner)
   * Returns learner's own session attendance history and overall attendance percentage.
   */
  @RequirePermission(Permission.ATTENDANCE_READ)
  @Get('attendance')
  async getMyAttendance(@Request() req: any) {
    const userId = req.user.sub ?? req.user.userId ?? req.user.id;
    if (!userId) {
      throw new ForbiddenException('User authentication required');
    }

    // Find all active enrolments for this learner
    const enrolments = await this.prisma.enrolment.findMany({
      where: { userId },
      select: {
        id: true,
        batchId: true,
        programId: true,
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
      where: {
        userId,
      },
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
        (att.status === AttendanceStatus.PRESENT ||
          att.status === AttendanceStatus.PRESENT_AUTO ||
          att.status === AttendanceStatus.PRESENT_MANUAL ||
          att.status === AttendanceStatus.CORRECTED ||
          att.status === (AttendanceStatus as any).PRESENT_LIVE ||
          att.status === (AttendanceStatus as any).PRESENT_RECORDED);

      if (isPresent) attendedCount++;

      return {
        sessionId: session.id,
        sessionTitle: session.title,
        sessionType: session.sessionType,
        batchName: session.batch?.name || null,
        programTitle: session.batch?.program?.title || null,
        startTimeUtc: session.startTime.toISOString(),
        endTimeUtc: session.endTime.toISOString(),
        durationMinutes: session.durationMinutes || 60,
        minAttendanceMinutes: session.minAttendanceMinutes ?? null,
        meetingProvider: session.meetingProvider,
        joinUrl: session.joinUrl || session.meetingLink,
        recordingUrl: session.recordingUrl || session.recordingLink,
        status: att?.status ?? AttendanceStatus.ABSENT,
        minutesPresent: att?.minutesPresent ?? att?.durationMin ?? 0,
        liveMinutes: att?.liveMinutes ?? null,
        recordedMinutes: att?.recordedMinutes ?? null,
        attendancePercentage: att?.attendancePercentage ?? 0,
        source: att?.source ?? 'AUTO',
        joinTimeUtc: att?.joinTime ? att.joinTime.toISOString() : null,
        leaveTimeUtc: att?.leaveTime ? att.leaveTime.toISOString() : null,
      };
    });

    const totalScheduled = sessions.length;
    const overallPercentage =
      totalScheduled > 0 ? Math.round((attendedCount / totalScheduled) * 100) : 100;

    return {
      totalScheduledSessions: totalScheduled,
      totalAttendedSessions: attendedCount,
      overallAttendancePercentage: overallPercentage,
      history,
    };
  }
}
