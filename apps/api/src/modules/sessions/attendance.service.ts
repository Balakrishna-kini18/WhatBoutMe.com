import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AttendanceStatus } from '@prisma/client';
import { markDailyAttendance } from '../../common/daily-attendance.js';

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records an automated absent status (e.g., from a scheduled job determining the learner did not show up).
   */
  async recordAbsent(sessionId: string, enrolmentId: string) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.attendance.findUnique({
        where: { sessionId_enrolmentId: { sessionId, enrolmentId } },
      });

      if (existing && ([AttendanceStatus.PRESENT_MANUAL, AttendanceStatus.CORRECTED] as AttendanceStatus[]).includes(existing.status)) {
        // Do not overwrite manual corrections
        return existing;
      }

      return tx.attendance.upsert({
        where: { sessionId_enrolmentId: { sessionId, enrolmentId } },
        update: { status: AttendanceStatus.ABSENT },
        create: {
          sessionId,
          enrolmentId,
          status: AttendanceStatus.ABSENT,
        },
      });
    });
  }

  /**
   * Records an automated present status from an external provider (e.g. Zoom report).
   */
  async recordPresentAuto(
    sessionId: string,
    enrolmentId: string,
    data?: { joinTime?: Date; leaveTime?: Date; durationMin?: number }
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.attendance.findUnique({
        where: { sessionId_enrolmentId: { sessionId, enrolmentId } },
      });

      if (existing && ([AttendanceStatus.PRESENT_MANUAL, AttendanceStatus.CORRECTED] as AttendanceStatus[]).includes(existing.status)) {
        // Do not overwrite manual corrections with automated reports
        return existing;
      }

      const enrolment = await tx.enrolment.findUnique({
        where: { id: enrolmentId },
        select: { userId: true },
      });

      if (!enrolment) {
        throw new BadRequestException('Enrolment not found');
      }

      const result = await tx.attendance.upsert({
        where: { sessionId_enrolmentId: { sessionId, enrolmentId } },
        update: {
          status: AttendanceStatus.PRESENT_AUTO,
          joinTime: data?.joinTime ?? existing?.joinTime,
          leaveTime: data?.leaveTime ?? existing?.leaveTime,
          durationMin: data?.durationMin ?? existing?.durationMin,
        },
        create: {
          sessionId,
          enrolmentId,
          userId: enrolment.userId,
          status: AttendanceStatus.PRESENT_AUTO,
          joinTime: data?.joinTime,
          leaveTime: data?.leaveTime,
          durationMin: data?.durationMin,
        },
      });

      if (enrolment.userId) {
        await markDailyAttendance(tx as any, enrolment.userId, 'sessionJoined');
      }

      return result;
    });
  }

  /**
   * Manually records a user as present.
   */
  async recordPresentManual(sessionId: string, enrolmentId: string, actorId: string, reason?: string) {
    return this.prisma.$transaction(async (tx) => {
      const enrolment = await tx.enrolment.findUnique({
        where: { id: enrolmentId },
        select: { userId: true },
      });

      if (!enrolment) {
        throw new BadRequestException('Enrolment not found');
      }

      const existing = await tx.attendance.findUnique({
        where: { sessionId_enrolmentId: { sessionId, enrolmentId } },
      });

      const result = await tx.attendance.upsert({
        where: { sessionId_enrolmentId: { sessionId, enrolmentId } },
        update: {
          status: AttendanceStatus.PRESENT_MANUAL,
          correctedById: actorId,
          correctionReason: reason || 'Manually marked as present',
        },
        create: {
          sessionId,
          enrolmentId,
          userId: enrolment.userId,
          status: AttendanceStatus.PRESENT_MANUAL,
          correctedById: actorId,
          correctionReason: reason || 'Manually marked as present',
          joinTime: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: 'ATTENDANCE_MARKED_MANUAL',
          entity: 'Attendance',
          entityId: result.id,
          meta: { sessionId, enrolmentId, previousStatus: existing?.status },
        },
      });

      if (enrolment.userId) {
        await markDailyAttendance(tx as any, enrolment.userId, 'sessionJoined');
      }

      return result;
    });
  }

  /**
   * Explicitly corrects attendance status (e.g., manager overriding an absent report).
   */
  async correctAttendance(
    sessionId: string,
    enrolmentId: string,
    newStatus: AttendanceStatus,
    actorId: string,
    reason: string
  ) {
    if (!reason) {
      throw new BadRequestException('A reason is required for correcting attendance.');
    }

    if (newStatus === AttendanceStatus.PRESENT_AUTO || newStatus === AttendanceStatus.ABSENT) {
      // Corrected attendance should generally map to a manual/corrected state,
      // but if we are "undoing" something, we still consider the final status CORRECTED.
      // Wait, the client requirement is status = CORRECTED.
    }

    return this.prisma.$transaction(async (tx) => {
      const enrolment = await tx.enrolment.findUnique({
        where: { id: enrolmentId },
        select: { userId: true },
      });

      if (!enrolment) {
        throw new BadRequestException('Enrolment not found');
      }

      const existing = await tx.attendance.findUnique({
        where: { sessionId_enrolmentId: { sessionId, enrolmentId } },
      });

      const result = await tx.attendance.upsert({
        where: { sessionId_enrolmentId: { sessionId, enrolmentId } },
        update: {
          status: AttendanceStatus.CORRECTED,
          correctedById: actorId,
          correctionReason: reason,
        },
        create: {
          sessionId,
          enrolmentId,
          userId: enrolment.userId,
          status: AttendanceStatus.CORRECTED,
          correctedById: actorId,
          correctionReason: reason,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: 'ATTENDANCE_CORRECTED',
          entity: 'Attendance',
          entityId: result.id,
          meta: { sessionId, enrolmentId, previousStatus: existing?.status, newStatus: AttendanceStatus.CORRECTED, reason },
        },
      });

      // If corrected to a positive presence, mark daily attendance
      if (enrolment.userId) {
         await markDailyAttendance(tx as any, enrolment.userId, 'sessionJoined');
      }

      return result;
    });
  }
}
