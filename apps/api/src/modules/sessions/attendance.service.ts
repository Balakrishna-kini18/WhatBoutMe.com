import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AttendanceStatus, AttendanceSource, Role } from '@prisma/client';
import { markDailyAttendance } from '../../common/daily-attendance.js';
import { AuditLogService } from '../../common/audit/audit-log.service.js';

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Helper to resolve both userId and enrolmentId given either one.
   */
  private async resolveUserAndEnrolment(
    sessionId: string,
    target: { userId?: string; enrolmentId?: string },
    tx?: any,
  ): Promise<{ userId: string; enrolmentId: string | null }> {
    const client = tx || this.prisma;

    if (target.userId && target.enrolmentId) {
      return { userId: target.userId, enrolmentId: target.enrolmentId };
    }

    if (target.userId && !target.enrolmentId) {
      // Find active or latest enrolment for this user in the session's batch
      const session = await client.session.findUnique({
        where: { id: sessionId },
        select: { batchId: true },
      });

      if (session?.batchId) {
        const enrolment = await client.enrolment.findUnique({
          where: { userId_batchId: { userId: target.userId, batchId: session.batchId } },
          select: { id: true },
        });
        return { userId: target.userId, enrolmentId: enrolment?.id ?? null };
      }

      return { userId: target.userId, enrolmentId: null };
    }

    if (target.enrolmentId) {
      const enrolment = await client.enrolment.findUnique({
        where: { id: target.enrolmentId },
        select: { userId: true },
      });
      if (!enrolment?.userId) {
        throw new BadRequestException(`Enrolment ${target.enrolmentId} not found`);
      }
      return { userId: enrolment.userId, enrolmentId: target.enrolmentId };
    }

    throw new BadRequestException('Either userId or enrolmentId must be provided');
  }

  /**
   * Records an automated absent status (e.g. learner did not show up in the participant report).
   */
  async recordAbsent(
    sessionId: string,
    userIdOrEnrolmentId: string,
    options?: { isUserId?: boolean; enrolmentId?: string },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const { userId, enrolmentId } = await this.resolveUserAndEnrolment(
        sessionId,
        options?.isUserId
          ? { userId: userIdOrEnrolmentId, enrolmentId: options.enrolmentId }
          : { enrolmentId: userIdOrEnrolmentId },
        tx,
      );

      const existing = await tx.attendance.findUnique({
        where: { sessionId_userId: { sessionId, userId } },
      });

      // Do not overwrite manual corrections or QR check-ins
      if (
        existing &&
        ([AttendanceStatus.PRESENT_MANUAL, AttendanceStatus.CORRECTED] as AttendanceStatus[]).includes(
          existing.status,
        )
      ) {
        return existing;
      }

      return tx.attendance.upsert({
        where: { sessionId_userId: { sessionId, userId } },
        update: {
          status: AttendanceStatus.ABSENT,
          minutesPresent: 0,
          attendancePercentage: 0,
          source: AttendanceSource.AUTO,
        },
        create: {
          sessionId,
          userId,
          enrolmentId,
          status: AttendanceStatus.ABSENT,
          minutesPresent: 0,
          attendancePercentage: 0,
          source: AttendanceSource.AUTO,
        },
      });
    });
  }

  /**
   * Records an automated attendance calculation (from Zoom / Google Meet participant sync).
   */
  async recordPresentAuto(
    sessionId: string,
    userIdOrEnrolmentId: string,
    data?: {
      isUserId?: boolean;
      enrolmentId?: string;
      joinTime?: Date;
      leaveTime?: Date;
      durationMin?: number;
      attendancePercentage?: number;
      status?: AttendanceStatus;
    },
  ) {
    const targetStatus = data?.status ?? AttendanceStatus.PRESENT_AUTO;

    return this.prisma.$transaction(async (tx) => {
      const { userId, enrolmentId } = await this.resolveUserAndEnrolment(
        sessionId,
        data?.isUserId
          ? { userId: userIdOrEnrolmentId, enrolmentId: data.enrolmentId }
          : { enrolmentId: userIdOrEnrolmentId },
        tx,
      );

      const existing = await tx.attendance.findUnique({
        where: { sessionId_userId: { sessionId, userId } },
      });

      // Do not overwrite manual corrections or manual overrides with automated reports
      if (
        existing &&
        ([AttendanceStatus.PRESENT_MANUAL, AttendanceStatus.CORRECTED] as AttendanceStatus[]).includes(
          existing.status,
        )
      ) {
        return existing;
      }

      // Preserve earliest joinTime and latest leaveTime to protect against disconnections & reloads
      const earlierJoinTime =
        existing?.joinTime && data?.joinTime
          ? new Date(existing.joinTime) < new Date(data.joinTime)
            ? existing.joinTime
            : data.joinTime
          : (existing?.joinTime ?? data?.joinTime);

      const laterLeaveTime =
        existing?.leaveTime && data?.leaveTime
          ? new Date(existing.leaveTime) > new Date(data.leaveTime)
            ? existing.leaveTime
            : data.leaveTime
          : (data?.leaveTime ?? existing?.leaveTime);

      const result = await tx.attendance.upsert({
        where: { sessionId_userId: { sessionId, userId } },
        update: {
          status: targetStatus,
          source: AttendanceSource.AUTO,
          joinTime: earlierJoinTime,
          leaveTime: laterLeaveTime,
          durationMin: data?.durationMin ?? existing?.durationMin,
          minutesPresent: data?.durationMin ?? existing?.minutesPresent,
          liveMinutes: data?.durationMin ?? existing?.liveMinutes,
          attendancePercentage: data?.attendancePercentage ?? existing?.attendancePercentage,
        },
        create: {
          sessionId,
          userId,
          enrolmentId,
          status: targetStatus,
          source: AttendanceSource.AUTO,
          joinTime: earlierJoinTime,
          leaveTime: laterLeaveTime,
          durationMin: data?.durationMin,
          minutesPresent: data?.durationMin,
          liveMinutes: data?.durationMin,
          attendancePercentage: data?.attendancePercentage,
        },
      });

      if (
        (targetStatus === AttendanceStatus.PRESENT_AUTO || targetStatus === AttendanceStatus.PRESENT) &&
        userId
      ) {
        await markDailyAttendance(tx as any, userId, 'sessionJoined');
      }

      return result;
    });
  }

  /**
   * Manually records a user as present.
   */
  async recordPresentManual(
    sessionId: string,
    enrolmentId: string,
    actorId: string,
    reason?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const { userId, enrolmentId: verifiedEnrolmentId } = await this.resolveUserAndEnrolment(
        sessionId,
        { enrolmentId },
        tx,
      );

      const existing = await tx.attendance.findUnique({
        where: { sessionId_userId: { sessionId, userId } },
      });

      const effectiveReason = reason || 'Manually marked as present';

      const result = await tx.attendance.upsert({
        where: { sessionId_userId: { sessionId, userId } },
        update: {
          status: AttendanceStatus.PRESENT_MANUAL,
          source: AttendanceSource.MANUAL,
          correctedById: actorId,
          correctionReason: effectiveReason,
          overrideReason: effectiveReason,
          updatedById: actorId,
        },
        create: {
          sessionId,
          userId,
          enrolmentId: verifiedEnrolmentId,
          status: AttendanceStatus.PRESENT_MANUAL,
          source: AttendanceSource.MANUAL,
          correctedById: actorId,
          correctionReason: effectiveReason,
          overrideReason: effectiveReason,
          updatedById: actorId,
          joinTime: new Date(),
        },
      });

      await this.auditLogService.log(tx, {
        actorId,
        action: 'ATTENDANCE_MARKED_MANUAL',
        entityType: 'Attendance',
        entityId: result.id,
        reason: effectiveReason,
        metadata: {
          sessionId,
          userId,
          enrolmentId: verifiedEnrolmentId,
          previousStatus: existing?.status,
        },
      });

      await markDailyAttendance(tx as any, userId, 'sessionJoined');
      return result;
    });
  }

  /**
   * Phase 5: Manual Correction by (sessionId, userId)
   */
  async updateAttendanceRecord(
    sessionId: string,
    userId: string,
    updateData: {
      status: AttendanceStatus;
      minutesPresent?: number;
      reason: string;
    },
    actor: { id: string; role: string },
  ) {
    if (!updateData.reason || updateData.reason.trim().length === 0) {
      throw new BadRequestException('A non-empty reason is strictly required for attendance override');
    }

    return this.prisma.$transaction(async (tx) => {
      const session = await tx.session.findUnique({
        where: { id: sessionId },
        include: {
          batch: {
            include: {
              trainers: true,
              program: true,
            },
          },
        },
      });

      if (!session) {
        throw new NotFoundException('Session not found');
      }

      // Check batch scoping for MANAGER
      if (
        (actor.role === Role.MANAGER || actor.role === 'MANAGER' || actor.role === 'TEACHER') &&
        session.batch
      ) {
        const isAssigned =
          session.batch.managerId === actor.id ||
          session.batch.trainers.some((t: any) => t.trainerId === actor.id);

        if (!isAssigned) {
          throw new ForbiddenException('Access denied: You are not assigned to manage this batch');
        }
      }

      const { enrolmentId } = await this.resolveUserAndEnrolment(sessionId, { userId }, tx);

      const existing = await tx.attendance.findUnique({
        where: { sessionId_userId: { sessionId, userId } },
      });

      // Calculate percentage if minutesPresent provided
      let calculatedPercentage = existing?.attendancePercentage ?? null;
      const durationMinutes =
        session.durationMinutes ||
        (session.startTime && session.endTime
          ? Math.round((session.endTime.getTime() - session.startTime.getTime()) / 60000)
          : 60);

      if (typeof updateData.minutesPresent === 'number' && durationMinutes > 0) {
        calculatedPercentage = (updateData.minutesPresent / durationMinutes) * 100;
      }

      const result = await tx.attendance.upsert({
        where: { sessionId_userId: { sessionId, userId } },
        update: {
          status: updateData.status,
          source: AttendanceSource.MANUAL,
          minutesPresent: updateData.minutesPresent ?? existing?.minutesPresent,
          durationMin: updateData.minutesPresent ?? existing?.durationMin,
          attendancePercentage: calculatedPercentage,
          overrideReason: updateData.reason,
          correctionReason: updateData.reason,
          correctedById: actor.id,
          updatedById: actor.id,
        },
        create: {
          sessionId,
          userId,
          enrolmentId,
          status: updateData.status,
          source: AttendanceSource.MANUAL,
          minutesPresent: updateData.minutesPresent ?? 0,
          durationMin: updateData.minutesPresent ?? 0,
          attendancePercentage: calculatedPercentage,
          overrideReason: updateData.reason,
          correctionReason: updateData.reason,
          correctedById: actor.id,
          updatedById: actor.id,
          joinTime: new Date(),
        },
      });

      // Write immutable audit log
      await this.auditLogService.log(tx, {
        actorId: actor.id,
        action: 'ATTENDANCE_MANUAL_OVERRIDE',
        entityType: 'Attendance',
        entityId: result.id,
        reason: updateData.reason,
        metadata: {
          sessionId,
          userId,
          previousStatus: existing?.status,
          newStatus: updateData.status,
          minutesPresent: updateData.minutesPresent,
        },
      });

      if (
        updateData.status === AttendanceStatus.PRESENT ||
        updateData.status === AttendanceStatus.PRESENT_MANUAL ||
        updateData.status === AttendanceStatus.CORRECTED
      ) {
        await markDailyAttendance(tx as any, userId, 'sessionJoined');
      }

      return result;
    });
  }

  /**
   * Overrides an attendance record by ID.
   */
  async overrideAttendanceById(
    attendanceId: string,
    newStatus: AttendanceStatus,
    actor: { id: string; role: string },
    reason: string,
  ) {
    if (!reason || reason.trim() === '') {
      throw new BadRequestException('A non-empty reason is required for correcting attendance.');
    }

    const actorId = actor.id;

    return this.prisma.$transaction(async (tx) => {
      const attendance = await tx.attendance.findUnique({
        where: { id: attendanceId },
        include: {
          enrolment: {
            include: {
              batch: {
                include: {
                  trainers: true,
                },
              },
            },
          },
        },
      });

      if (!attendance) {
        throw new NotFoundException('Attendance record not found');
      }

      if (actor.role === Role.MANAGER || actor.role === 'MANAGER' || actor.role === 'TEACHER') {
        const batch = attendance.enrolment?.batch;
        if (batch) {
          const isAssigned =
            batch.managerId === actorId ||
            batch.trainers.some((t: any) => t.trainerId === actorId);

          if (!isAssigned) {
            throw new ForbiddenException('Access denied: You are not assigned to this batch');
          }
        }
      } else if (actor.role === Role.USER || actor.role === 'USER') {
        throw new ForbiddenException('Learners cannot override attendance');
      }

      const result = await tx.attendance.update({
        where: { id: attendanceId },
        data: {
          status: AttendanceStatus.CORRECTED,
          source: AttendanceSource.MANUAL,
          correctedById: actorId,
          correctionReason: reason,
          overrideReason: reason,
          updatedById: actorId,
        },
      });

      await this.auditLogService.log(tx, {
        actorId,
        action: 'ATTENDANCE_CORRECTED',
        entityType: 'Attendance',
        entityId: result.id,
        reason,
        metadata: {
          sessionId: attendance.sessionId,
          userId: attendance.userId,
          enrolmentId: attendance.enrolmentId,
          previousStatus: attendance.status,
          newStatus: AttendanceStatus.CORRECTED,
          intendedStatus: newStatus,
        },
      });

      if (attendance.userId) {
        await markDailyAttendance(tx as any, attendance.userId, 'sessionJoined');
      }

      return result;
    });
  }

  /**
   * QR Code / Check-in Token attendance recording for In-Person Workshops
   */
  async checkInWithToken(sessionId: string, userId: string, token: string) {
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.session.findUnique({
        where: { id: sessionId },
        include: {
          batch: true,
        },
      });

      if (!session) {
        throw new NotFoundException('Session not found');
      }

      if (session.status === 'CANCELLED') {
        throw new BadRequestException('Session is cancelled. Check-in is not permitted.');
      }

      if (!session.checkinTokenSecret || session.checkinTokenSecret !== token) {
        throw new ForbiddenException('Invalid or expired check-in token or QR code');
      }

      const { enrolmentId } = await this.resolveUserAndEnrolment(sessionId, { userId }, tx);

      const result = await tx.attendance.upsert({
        where: { sessionId_userId: { sessionId, userId } },
        update: {
          status: AttendanceStatus.PRESENT,
          source: AttendanceSource.QR_CHECKIN,
          joinTime: new Date(),
        },
        create: {
          sessionId,
          userId,
          enrolmentId,
          status: AttendanceStatus.PRESENT,
          source: AttendanceSource.QR_CHECKIN,
          joinTime: new Date(),
        },
      });

      await markDailyAttendance(tx as any, userId, 'sessionJoined');
      return result;
    });
  }

  /**
   * Legacy compatibility method for correcting attendance.
   */
  async correctAttendance(
    sessionId: string,
    enrolmentId: string,
    newStatus: AttendanceStatus,
    actorId: string,
    reason: string,
  ) {
    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException('A non-empty reason is required for correcting attendance.');
    }
    const { userId } = await this.resolveUserAndEnrolment(sessionId, { enrolmentId });
    const actor = { id: actorId, role: Role.ADMIN };
    return this.updateAttendanceRecord(
      sessionId,
      userId,
      {
        status: newStatus,
        reason,
      },
      actor,
    );
  }
}
