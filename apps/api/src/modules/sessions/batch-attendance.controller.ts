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
    const session = await this.prisma.session.findUnique({
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
    });

    if (!session || session.batchId !== batchId) {
      throw new NotFoundException('Session not found for the specified batch');
    }

    const minAttendancePercentage =
      session.batch?.program?.minAttendancePercentage ??
      (session.batch as any)?.attendanceThreshold ??
      75;

    // Fetch existing attendance records for this session
    const attendanceRecords = await this.prisma.attendance.findMany({
      where: { sessionId },
    });

    const attendanceMap = new Map<string, (typeof attendanceRecords)[0]>();
    for (const record of attendanceRecords) {
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
    const session = await this.prisma.session.findUnique({
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
    });

    if (!session || session.batchId !== batchId) {
      throw new NotFoundException('Session not found for the specified batch');
    }

    // 1. Unmatched participants
    const unmatched = await this.prisma.unmatchedAttendance.findMany({
      where: {
        sessionId,
        status: 'UNMATCHED',
      },
      orderBy: { joinTime: 'asc' },
    });

    // 2. Enrolled batch learners who are currently unlinked / absent
    const attendances = await this.prisma.attendance.findMany({
      where: { sessionId },
    });

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
}
