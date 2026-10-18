import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  Request,
  UseGuards,
  NotFoundException,
  ForbiddenException,
  Optional,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AttendanceService } from './attendance.service.js';
import { AttendanceReconciliationService } from './attendance-reconciliation.service.js';
import { BatchScopeGuard } from '../../common/guards/batch-scope.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { Permission } from '../../config/permissions.config.js';
import { ManualAttendanceOverrideDto } from './dto/manual-attendance-override.dto.js';
import { LinkUnmatchedDto } from './dto/link-unmatched.dto.js';
import { CertificatesService } from '../certificates/certificates.service.js';
import { MEETING_PROVIDER } from '../../common/interfaces/meeting-provider.interface.js';
import { AttendanceStatus, AttendanceSource } from '@prisma/client';

@Controller('batches/:batchId/sessions/:sessionId')
@UseGuards(BatchScopeGuard, PermissionsGuard)
export class BatchAttendanceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceService: AttendanceService,
    private readonly reconciliationService: AttendanceReconciliationService,
    @Optional()
    @Inject(forwardRef(() => CertificatesService))
    private readonly certificatesService?: CertificatesService,
    @Optional()
    @Inject(MEETING_PROVIDER)
    private readonly meetingProvider?: any,
  ) {}

  /**
   * Phase 5 Endpoint 1:
   * GET /api/batches/:batchId/sessions/:sessionId/attendance
   * Roles: SUPER_ADMIN, ADMIN, MANAGER (assigned to batch).
   */
  @RequirePermission(Permission.ATTENDANCE_READ)
  @Get('attendance')
  async getBatchSessionAttendance(
    @Param('batchId') batchId: string,
    @Param('sessionId') sessionId: string,
  ) {
    const [session, attendanceRecords] = await Promise.all([
      this.prisma.session.findUnique({
        where: { id: sessionId },
        include: {
          batch: {
            include: {
              program: true,
              enrolments: {
                where: { status: 'ACTIVE' },
                include: { user: true },
              },
            },
          },
        },
      }),
      this.prisma.attendance.findMany({
        where: { sessionId },
      }),
    ]);

    if (!session || session.batchId !== batchId) {
      throw new NotFoundException('Session not found for the specified batch');
    }

    const minAttendancePercentage =
      session.batch?.program?.minAttendancePercentage ??
      (session.batch as any)?.attendanceThreshold ??
      75;

    const attendanceMap = new Map<string, any>();
    for (const record of (attendanceRecords || [])) {
      attendanceMap.set(record.userId, record);
    }

    const learners = (session.batch?.enrolments || []).map((enrolment) => {
      const att = attendanceMap.get(enrolment.userId);

      return {
        userId: enrolment.userId,
        enrolmentId: enrolment.id,
        name: enrolment.user?.name || 'Learner',
        email: enrolment.user?.email || '',
        avatar: (enrolment.user as any)?.avatar || null,
        joinTimeUtc: att?.joinTime ? att.joinTime.toISOString() : null,
        leaveTimeUtc: att?.leaveTime ? att.leaveTime.toISOString() : null,
        minutesPresent: att?.minutesPresent ?? att?.durationMin ?? 0,
        attendancePercentage:
          att?.attendancePercentage ??
          (att?.minutesPresent && session.durationMinutes
            ? (att.minutesPresent / session.durationMinutes) * 100
            : 0),
        status: att?.status ?? AttendanceStatus.ABSENT,
        source: att?.source ?? AttendanceSource.AUTO,
        overrideReason: att?.overrideReason ?? att?.correctionReason ?? null,
      };
    });

    return {
      session: {
        id: session.id,
        title: session.title,
        type: session.sessionType,
        startTimeUtc: session.startTime.toISOString(),
        endTimeUtc: session.endTime.toISOString(),
        durationMinutes: session.durationMinutes || 60,
        meetingProvider: session.meetingProvider,
        meetingLink: session.meetingLink || session.joinUrl,
        recordingLink: session.recordingLink || session.recordingUrl,
      },
      thresholdPercentage: minAttendancePercentage,
      totalLearners: learners.length,
      presentCount: learners.filter(
        (l) =>
          l.status === AttendanceStatus.PRESENT ||
          l.status === AttendanceStatus.PRESENT_AUTO ||
          l.status === AttendanceStatus.PRESENT_MANUAL ||
          l.status === AttendanceStatus.CORRECTED,
      ).length,
      learners,
    };
  }

  /**
   * Phase 5 Endpoint 2:
   * PATCH /api/batches/:batchId/sessions/:sessionId/attendance/:userId
   * Roles: SUPER_ADMIN, ADMIN, MANAGER (assigned to batch).
   */
  @RequirePermission(Permission.ATTENDANCE_CORRECT)
  @Patch('attendance/:userId')
  async overrideLearnerAttendance(
    @Param('batchId') batchId: string,
    @Param('sessionId') sessionId: string,
    @Param('userId') userId: string,
    @Body() body: ManualAttendanceOverrideDto,
    @Request() req: any,
  ) {
    const actor = {
      id: req.user.sub ?? req.user.userId ?? req.user.id,
      role: req.user.role,
    };

    const updated = await this.attendanceService.updateAttendanceRecord(
      sessionId,
      userId,
      body,
      actor,
    );

    // Re-evaluate certificate eligibility for the learner in the background
    if (this.certificatesService && updated.enrolmentId) {
      try {
        await this.certificatesService.checkAndTriggerCertificateEligibility?.(
          updated.enrolmentId,
          actor.id,
        );
      } catch (err: any) {
        // Log warning without failing the override request
        console.warn(`[CertificateGate] Eligibility check error: ${err.message}`);
      }
    }

    return updated;
  }

  /**
   * Phase 5 Endpoint 3:
   * GET /api/batches/:batchId/sessions/:sessionId/reconciliation
   * Roles: SUPER_ADMIN, ADMIN, MANAGER (assigned to batch).
   */
  @RequirePermission(Permission.ATTENDANCE_RECONCILE)
  @Get('reconciliation')
  async getReconciliationData(
    @Param('batchId') batchId: string,
    @Param('sessionId') sessionId: string,
  ) {
    const [session, unmatched, attendances] = await Promise.all([
      this.prisma.session.findUnique({
        where: { id: sessionId },
        include: {
          batch: {
            include: {
              program: true,
              enrolments: {
                where: { status: 'ACTIVE' },
                include: { user: true },
              },
            },
          },
        },
      }),
      this.prisma.unmatchedAttendance.findMany({
        where: {
          sessionId,
          status: 'UNMATCHED',
        },
        orderBy: { joinTime: 'asc' },
      }),
      this.prisma.attendance.findMany({
        where: { sessionId },
      }),
    ]);

    if (!session || session.batchId !== batchId) {
      throw new NotFoundException('Session not found for the specified batch');
    }

    const presentUserIds = new Set(
      attendances
        .filter(
          (a) =>
            a.status === AttendanceStatus.PRESENT ||
            a.status === AttendanceStatus.PRESENT_AUTO ||
            a.status === AttendanceStatus.PRESENT_MANUAL ||
            a.status === AttendanceStatus.CORRECTED,
        )
        .map((a) => a.userId),
    );

    const unlinkedLearners = (session.batch?.enrolments || [])
      .filter((e) => !presentUserIds.has(e.userId))
      .map((e) => ({
        userId: e.userId,
        enrolmentId: e.id,
        name: e.user?.name || 'Learner',
        email: e.user?.email || '',
      }));

    return {
      session: {
        id: session.id,
        title: session.title,
        durationMinutes: session.durationMinutes || 60,
      },
      unmatched: unmatched.map((u) => ({
        id: u.id,
        participantName: u.participantName,
        participantEmail: u.participantEmail,
        joinTimeUtc: u.joinTime ? u.joinTime.toISOString() : null,
        leaveTimeUtc: u.leaveTime ? u.leaveTime.toISOString() : null,
        minutesPresent: u.minutesPresent || u.durationMin || 0,
        rawPayload: u.rawPayload,
      })),
      unlinkedLearners,
    };
  }

  /**
   * Phase 5 Endpoint 4:
   * POST /api/batches/:batchId/sessions/:sessionId/reconciliation/:unmatchedId/link
   * Roles: SUPER_ADMIN, ADMIN, MANAGER (assigned to batch).
   */
  @RequirePermission(Permission.ATTENDANCE_RECONCILE)
  @Post('reconciliation/:unmatchedId/link')
  async linkUnmatchedParticipant(
    @Param('batchId') _batchId: string,
    @Param('sessionId') sessionId: string,
    @Param('unmatchedId') unmatchedId: string,
    @Body() body: LinkUnmatchedDto,
    @Request() req: any,
  ) {
    const actor = {
      id: req.user.sub ?? req.user.userId ?? req.user.id,
      role: req.user.role,
    };

    return this.reconciliationService.linkUnmatchedParticipant(
      sessionId,
      unmatchedId,
      body.userId,
      actor,
      body.reason,
    );
  }

  /**
   * Pulls Zoom/Meet participant reports (join time, leave time, minutes present),
   * matches enrolled learners by email, enforces attendance threshold (75%),
   * and routes unmatched participants to the reconciliation queue.
   * POST /api/batches/:batchId/sessions/:sessionId/sync-attendance
   * Roles: SUPER_ADMIN, ADMIN, MANAGER (assigned to batch).
   */
  @RequirePermission(Permission.ATTENDANCE_RECONCILE)
  @Post('sync-attendance')
  async syncSessionAttendance(
    @Param('batchId') batchId: string,
    @Param('sessionId') sessionId: string,
  ) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.batchId !== batchId) {
      throw new NotFoundException('Session not found for the specified batch');
    }

    let meetingId = session.providerMeetingId || session.zoomMeetingId;
    if (!meetingId) {
      const link = session.joinUrl || session.meetingLink || '';
      const zoomMatch = link.match(/zoom\.us\/(?:j|s|my)\/(\d+)/i);
      if (zoomMatch) {
        meetingId = zoomMatch[1];
      }
    }

    if (!meetingId) {
      return {
        success: false,
        sessionId,
        participantCount: 0,
        message: 'No meeting ID or Zoom link associated with this session. Please verify session meeting configuration.',
      };
    }

    let rawParticipants: any[] = [];

    if (
      this.meetingProvider &&
      typeof this.meetingProvider.getParticipantReport === 'function'
    ) {
      try {
        const report = await this.meetingProvider.getParticipantReport(meetingId);
        if (Array.isArray(report)) {
          rawParticipants = report.map((p) => ({
            provider: session.meetingProvider || 'ZOOM',
            providerId: p.providerId || meetingId,
            participantEmail: p.participantEmail || p.userEmail,
            participantName: p.participantName || p.name,
            joinTime: new Date(p.joinTimeUtc || p.joinTime || session.startTime),
            leaveTime: new Date(p.leaveTimeUtc || p.leaveTime || session.endTime),
            rawPayload: p.rawPayload || p,
          }));
        }
      } catch (err: any) {
        // Log warning without failing reconciliation
        console.warn(
          `[BatchAttendanceController] Could not fetch external participant report: ${err.message}`,
        );
      }
    }

    if (rawParticipants.length === 0) {
      return {
        success: false,
        sessionId,
        participantCount: 0,
        message: 'No meeting participant records found yet from provider. If the session just concluded, cloud processing may take 1-2 minutes.',
      };
    }

    const reconciliation = await this.reconciliationService.reconcileSession(
      sessionId,
      rawParticipants,
    );

    return {
      success: true,
      sessionId,
      participantCount: rawParticipants.length,
      reconciliation,
    };
  }
}
