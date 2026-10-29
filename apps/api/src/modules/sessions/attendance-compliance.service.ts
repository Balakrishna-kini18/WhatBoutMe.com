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
      select: { id: true, durationMinutes: true, minAttendanceMinutes: true }
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

    let attendedSessionCount = 0;

    for (const record of attendances) {
      const isPresentStatus =
        record.status === AttendanceStatus.PRESENT ||
        record.status === AttendanceStatus.PRESENT_AUTO ||
        record.status === AttendanceStatus.PRESENT_MANUAL ||
        record.status === AttendanceStatus.CORRECTED ||
        record.status === (AttendanceStatus as any).PRESENT_LIVE ||
        record.status === (AttendanceStatus as any).PRESENT_RECORDED;

      if (isPresentStatus) {
        attendedSessionCount++;
        continue;
      }

      // Hybrid minutes evaluation (D4: Cumulative live + recorded minutes >= session threshold)
      const session = sessionMap.get(record.sessionId);
      if (session && (record.liveMinutes != null || record.recordedMinutes != null)) {
        const totalMinutes = (record.liveMinutes ?? 0) + (record.recordedMinutes ?? 0);
        const durationMin = session.durationMinutes || 60;
        const requiredSessionMinutes =
          session.minAttendanceMinutes ?? Math.round((durationMin * threshold) / 100);

        if (totalMinutes >= requiredSessionMinutes && requiredSessionMinutes > 0) {
          attendedSessionCount++;
        }
      }
    }

    // 3. Apply the threshold
    const attendancePercentage = (attendedSessionCount / requiredSessionCount) * 100;
    
    // We do a strict mathematical evaluation. Floating point issues might be a minor concern, 
    // but a round could be dangerous if 79.9% passes an 80% threshold. 
    // Usually, you must hit >= threshold.
    const isCompliant = attendancePercentage >= threshold;

    return {
      status: isCompliant ? 'COMPLIANT' : 'NOT_COMPLIANT',
      thresholdUsed: threshold,
      requiredSessionCount,
      attendedSessionCount,
      attendancePercentage: Math.round(attendancePercentage * 100) / 100, // round to 2 decimals
    };
  }
}
