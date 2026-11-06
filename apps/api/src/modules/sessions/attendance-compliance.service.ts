import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SessionStatus, SessionType, AttendanceStatus } from '@prisma/client';

export type ComplianceStatus = 'COMPLIANT' | 'NOT_COMPLIANT' | 'NOT_APPLICABLE';

export interface AttendanceComplianceResult {
  status: ComplianceStatus;
  thresholdUsed: number;
  requiredSessionCount: number;
  attendedSessionCount: number;
  attendancePercentage: number;
}

@Injectable()
export class AttendanceComplianceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * D1-049: Calculates attendance compliance for a given learner's enrolment.
   */
  async calculateCompliance(enrolmentId: string): Promise<AttendanceComplianceResult> {
    const enrolment = await this.prisma.enrolment.findUnique({
      where: { id: enrolmentId },
      include: {
        batch: {
          include: { program: true }
        }
      }
    });

    if (!enrolment) {
      throw new BadRequestException('Enrolment not found');
    }

    const programThreshold = (enrolment.batch?.program as any)?.attendanceThreshold;
    const batchThreshold = (enrolment.batch as any)?.attendanceThreshold;

    const threshold =
      typeof batchThreshold === 'number' && !isNaN(batchThreshold)
        ? batchThreshold
        : typeof programThreshold === 'number' && !isNaN(programThreshold)
          ? programThreshold
          : 75;

    // Validate threshold
    if (threshold < 0 || threshold > 100) {
      throw new BadRequestException(`Invalid attendance threshold configured: ${threshold}. Must be between 0 and 100.`);
    }

    // 1. Determine the required live cohort sessions
    // Includes cohort sessions (GROUP_COHORT, BATCH_CLASS, VISION_BOARD_*, etc.), excluding 1:1 individual consultations
    const requiredSessions = await this.prisma.session.findMany({
      where: {
        batchId: enrolment.batchId,
        sessionType: {
          notIn: [
            SessionType.ONE_ON_ONE,
            SessionType.ONE_ON_ONE_WITH_RO,
            SessionType.SPEAKER_DISCOVERY_CALL,
          ],
        },
        isRequired: true,
        status: {
          not: SessionStatus.CANCELLED
        }
      },
      select: { id: true, durationMinutes: true, minAttendanceMinutes: true, startTime: true, endTime: true }
    });

    const requiredSessionCount = requiredSessions.length;

    if (requiredSessionCount === 0) {
      return {
        status: 'NOT_APPLICABLE',
        thresholdUsed: threshold,
        requiredSessionCount: 0,
        attendedSessionCount: 0,
        attendancePercentage: 100, // Conceptually, they haven't missed any
      };
    }

    // 2. Evaluate attendance against those required sessions
    const sessionMap = new Map<string, (typeof requiredSessions)[0]>();
    for (const s of requiredSessions) {
      sessionMap.set(s.id, s);
    }
    const sessionIds = requiredSessions.map(s => s.id);
    
    const attendances = await this.prisma.attendance.findMany({
      where: {
        enrolmentId: enrolment.id,
        sessionId: { in: sessionIds }
      }
    });

    let totalScheduledMinutes = 0;
    let totalAttendedMinutes = 0;

    for (const s of requiredSessions) {
      const dur =
        s.durationMinutes ||
        (s.startTime && s.endTime
          ? Math.max(1, Math.round((new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 60000))
          : 60);
      totalScheduledMinutes += dur;
    }

    const attendanceBySession = new Map<string, (typeof attendances)[0]>();
    for (const a of attendances) {
      attendanceBySession.set(a.sessionId, a);
    }

    let attendedSessionCount = 0;

    for (const s of requiredSessions) {
      const dur =
        s.durationMinutes ||
        (s.startTime && s.endTime
          ? Math.max(1, Math.round((new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 60000))
          : 60);
      const record = attendanceBySession.get(s.id);
      if (!record) continue;

      const isPresentStatus =
        record.status === AttendanceStatus.PRESENT ||
        record.status === AttendanceStatus.PRESENT_AUTO ||
        record.status === AttendanceStatus.PRESENT_MANUAL ||
        record.status === AttendanceStatus.CORRECTED ||
        record.status === (AttendanceStatus as any).PRESENT_LIVE ||
        record.status === (AttendanceStatus as any).PRESENT_RECORDED;

      const recordMins = record.minutesPresent ?? record.durationMin ?? 0;
      const liveRecordedMins = (record.liveMinutes ?? 0) + (record.recordedMinutes ?? 0);
      const totalMins = Math.max(recordMins, liveRecordedMins);
      const creditedMins = isPresentStatus
        ? Math.max(totalMins, dur)
        : Math.min(dur, totalMins);

      totalAttendedMinutes += creditedMins;

      const requiredSessionMinutes =
        s.minAttendanceMinutes ?? Math.round((dur * threshold) / 100);

      if (isPresentStatus || (totalMins >= requiredSessionMinutes && requiredSessionMinutes > 0)) {
        attendedSessionCount++;
      }
    }

    // 3. Apply the threshold
    const sessionPassPercentage = (attendedSessionCount / requiredSessionCount) * 100;
    const minutesPercentage =
      totalScheduledMinutes > 0
        ? Math.min(100, Math.round((totalAttendedMinutes / totalScheduledMinutes) * 10000) / 100)
        : 0;

    // Use session pass percentage if discrete sessions passed, otherwise reflect real progressive minutes percentage
    const attendancePercentage =
      attendedSessionCount > 0
        ? sessionPassPercentage
        : minutesPercentage;

    const isCompliant = sessionPassPercentage >= threshold || minutesPercentage >= threshold;

    return {
      status: isCompliant ? 'COMPLIANT' : 'NOT_COMPLIANT',
      thresholdUsed: threshold,
      requiredSessionCount,
      attendedSessionCount,
      attendancePercentage: Math.round(attendancePercentage * 100) / 100, // round to 2 decimals
    };
  }
}
