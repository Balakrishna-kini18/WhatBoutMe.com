import { Controller, Get, Request, UseGuards, ForbiddenException, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { Permission } from '../../config/permissions.config.js';
import { AttendanceStatus, EnrolmentStatus, SessionStatus, SessionType } from '@prisma/client';
import { AttendanceComplianceService } from './attendance-compliance.service.js';

@Controller('me')
@UseGuards(PermissionsGuard)
export class MeAttendanceController {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly complianceService?: AttendanceComplianceService,
  ) {}

  /**
   * Phase 5 Endpoint 6:
   * GET /api/me/attendance
   * Roles: USER (Learner)
   * Returns learner's own session attendance history, per-batch compliance, and overall attendance percentage.
   */
  @RequirePermission(Permission.ATTENDANCE_READ)
  @Get('attendance')
  async getMyAttendance(@Request() req: any) {
    const userId = req.user.sub ?? req.user.userId ?? req.user.id;
    if (!userId) {
      throw new ForbiddenException('User authentication required');
    }

    // Find all active/completed enrolments for this learner
    const enrolments = await this.prisma.enrolment.findMany({
      where: {
        userId,
        status: {
          in: [
            EnrolmentStatus.ACTIVE,
            EnrolmentStatus.COMPLETED,
            EnrolmentStatus.PENDING_AGREEMENT,
          ],
        },
      },
      select: {
        id: true,
        status: true,
        batchId: true,
        programId: true,
        program: {
          select: {
            id: true,
            title: true,
            attendanceRequired: true,
            attendanceThreshold: true,
            minAttendancePercentage: true,
          },
        },
        batch: {
          select: {
            id: true,
            name: true,
            status: true,
            attendanceThreshold: true,
            program: {
              select: {
                id: true,
                title: true,
                attendanceRequired: true,
                attendanceThreshold: true,
                minAttendancePercentage: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const batchIds = Array.from(
      new Set(enrolments.map((e) => e.batchId).filter(Boolean) as string[]),
    );

    // Find all active/conducted sessions for their batches or dedicated to this user (excluding cancelled)
    const sessions = await this.prisma.session.findMany({
      where: {
        status: { not: SessionStatus.CANCELLED },
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
            attendanceThreshold: true,
            program: {
              select: {
                id: true,
                title: true,
                attendanceRequired: true,
                attendanceThreshold: true,
                minAttendancePercentage: true,
              },
            },
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

    const oneOnOneTypes = new Set<string>([
      SessionType.ONE_ON_ONE,
      SessionType.ONE_ON_ONE_WITH_RO,
      SessionType.SPEAKER_DISCOVERY_CALL,
    ]);

    const history = sessions.map((session) => {
      const att = attendanceBySessionId.get(session.id);
      const dur =
        session.durationMinutes ||
        (session.startTime && session.endTime
          ? Math.max(
              1,
              Math.round(
                (new Date(session.endTime).getTime() -
                  new Date(session.startTime).getTime()) /
                  60000,
              ),
            )
          : 60);
      const batchThreshold = (session.batch as any)?.attendanceThreshold;
      const programThreshold =
        (session.batch?.program as any)?.attendanceThreshold ??
        session.batch?.program?.minAttendancePercentage ??
        80;
      const effectiveThreshold =
        typeof batchThreshold === 'number' && !isNaN(batchThreshold)
          ? batchThreshold
          : typeof programThreshold === 'number' && !isNaN(programThreshold)
            ? programThreshold
            : 80;
      const requiredMins =
        session.minAttendanceMinutes ?? Math.round((dur * effectiveThreshold) / 100);
      const totalMins = (att?.liveMinutes ?? 0) + (att?.recordedMinutes ?? 0);

      const isPresentStatus =
        Boolean(att) &&
        (att!.status === AttendanceStatus.PRESENT ||
          att!.status === AttendanceStatus.PRESENT_AUTO ||
          att!.status === AttendanceStatus.PRESENT_MANUAL ||
          att!.status === AttendanceStatus.CORRECTED ||
          att!.status === (AttendanceStatus as any).PRESENT_LIVE ||
          att!.status === (AttendanceStatus as any).PRESENT_RECORDED);

      const isPresent =
        isPresentStatus || (Boolean(att) && totalMins >= requiredMins && requiredMins > 0);

      const isCohortSession = !oneOnOneTypes.has(session.sessionType);

      return {
        sessionId: session.id,
        sessionTitle: session.title,
        sessionType: session.sessionType,
        sessionStatus: session.status,
        isRequired: session.isRequired !== false,
        isCohortSession,
        batchId: session.batchId || null,
        batchName: session.batch?.name || null,
        programId: session.batch?.program?.id || null,
        programTitle: session.batch?.program?.title || null,
        startTimeUtc: session.startTime.toISOString(),
        endTimeUtc: session.endTime.toISOString(),
        durationMinutes: dur,
        minAttendanceMinutes: session.minAttendanceMinutes ?? null,
        meetingProvider: session.meetingProvider,
        joinUrl: session.joinUrl || session.meetingLink,
        recordingUrl: session.recordingUrl || session.recordingLink,
        status: isPresent
          ? att?.status && att.status !== AttendanceStatus.ABSENT
            ? att.status
            : AttendanceStatus.PRESENT_AUTO
          : (att?.status ?? AttendanceStatus.ABSENT),
        attended: isPresent,
        minutesPresent: att?.minutesPresent ?? att?.durationMin ?? totalMins ?? 0,
        liveMinutes: att?.liveMinutes ?? null,
        recordedMinutes: att?.recordedMinutes ?? null,
        attendancePercentage: isPresent
          ? Math.max(att?.attendancePercentage ?? 0, 100)
          : (att?.attendancePercentage ?? 0),
        source: att?.source ?? 'AUTO',
        joinTimeUtc: att?.joinTime ? att.joinTime.toISOString() : null,
        leaveTimeUtc: att?.leaveTime ? att.leaveTime.toISOString() : null,
      };
    });

    // Per-batch attendance compliance breakdown (reusing Admin AttendanceComplianceService)
    const batches = await Promise.all(
      enrolments.map(async (enr) => {
        const prog = enr.batch?.program || enr.program;
        const attendanceRequired = (prog as any)?.attendanceRequired !== false;
        const defaultThreshold =
          (enr.batch as any)?.attendanceThreshold ??
          (prog as any)?.attendanceThreshold ??
          prog?.minAttendancePercentage ??
          80;

        if (enr.batchId && this.complianceService) {
          try {
            const comp = await this.complianceService.calculateCompliance(enr.id);
            const effectivePct =
              comp.requiredSessionCount === 0
                ? 0
                : Math.round(comp.attendancePercentage * 100) / 100;
            const isEligibleForExam =
              !attendanceRequired ||
              (comp.requiredSessionCount > 0 &&
                (comp.status === 'COMPLIANT' || effectivePct >= comp.thresholdUsed));

            return {
              enrolmentId: enr.id,
              enrolmentStatus: enr.status,
              batchId: enr.batchId,
              batchName: enr.batch?.name || 'Cohort Batch',
              programId: enr.programId,
              programTitle: prog?.title || 'Program',
              attendanceRequired,
              thresholdPercentage: comp.thresholdUsed,
              requiredSessionCount: comp.requiredSessionCount,
              attendedSessionCount: comp.attendedSessionCount,
              attendancePercentage: effectivePct,
              complianceStatus:
                comp.requiredSessionCount === 0 ? 'NOT_COMPLIANT' : comp.status,
              isEligibleForExam,
            };
          } catch {
            // Fallback below if compliance calculation fails
          }
        }

        const batchCohortSessions = history.filter(
          (h) => h.batchId && h.batchId === enr.batchId && h.isCohortSession && h.isRequired,
        );
        const reqCount = batchCohortSessions.length;
        const attCount = batchCohortSessions.filter((h) => h.attended).length;
        const pct = reqCount > 0 ? Math.round((attCount / reqCount) * 100) : 0;
        const isEligibleForExam =
          !attendanceRequired || (reqCount > 0 && pct >= defaultThreshold);

        return {
          enrolmentId: enr.id,
          enrolmentStatus: enr.status,
          batchId: enr.batchId,
          batchName: enr.batch?.name || 'Self-Paced / Unassigned Batch',
          programId: enr.programId,
          programTitle: prog?.title || 'Program',
          attendanceRequired,
          thresholdPercentage: defaultThreshold,
          requiredSessionCount: reqCount,
          attendedSessionCount: attCount,
          attendancePercentage: pct,
          complianceStatus:
            reqCount > 0 && pct >= defaultThreshold ? 'COMPLIANT' : 'NOT_COMPLIANT',
          isEligibleForExam,
        };
      }),
    );

    const now = new Date();
    // Aggregate cohort live-session totals across enrolled batches
    const requiredCohortHistory = history.filter((h) => h.isCohortSession && h.isRequired);
    const conductedCohortSessions = requiredCohortHistory.filter(
      (h) => h.sessionStatus === SessionStatus.COMPLETED || new Date(h.endTimeUtc) <= now,
    );
    const conductedCount = conductedCohortSessions.length;
    const totalScheduled = requiredCohortHistory.length;
    const attendedCount = requiredCohortHistory.filter((h) => h.attended).length;
    const overallPercentage =
      totalScheduled > 0 ? Math.round((attendedCount / totalScheduled) * 100) : 0;

    return {
      totalScheduledSessions: totalScheduled,
      conductedSessionsCount: conductedCount,
      totalAttendedSessions: attendedCount,
      overallAttendancePercentage: overallPercentage,
      batches,
      history,
    };
  }
}
