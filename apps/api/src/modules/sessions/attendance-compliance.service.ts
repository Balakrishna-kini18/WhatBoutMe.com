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

    const programThreshold = enrolment.batch.program.attendanceThreshold;
    const batchThreshold = enrolment.batch.attendanceThreshold;

    const threshold = batchThreshold !== null && batchThreshold !== undefined ? batchThreshold : programThreshold;

    // Validate threshold
    if (threshold < 0 || threshold > 100) {
      throw new BadRequestException(`Invalid attendance threshold configured: ${threshold}. Must be between 0 and 100.`);
    }

    // 1. Determine the required live cohort sessions
    // We look for sessions in this batch that are GROUP_COHORT, isRequired = true, and not CANCELLED
    const requiredSessions = await this.prisma.session.findMany({
      where: {
        batchId: enrolment.batchId,
        sessionType: SessionType.GROUP_COHORT,
        isRequired: true,
        status: {
          not: SessionStatus.CANCELLED
        }
      },
      select: { id: true }
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
    const sessionIds = requiredSessions.map(s => s.id);
    
    const attendances = await this.prisma.attendance.findMany({
      where: {
        enrolmentId: enrolment.id,
        sessionId: { in: sessionIds }
      }
    });

    let attendedSessionCount = 0;

    for (const record of attendances) {
      if (
        record.status === AttendanceStatus.PRESENT_AUTO ||
        record.status === AttendanceStatus.PRESENT_MANUAL ||
        record.status === AttendanceStatus.CORRECTED
      ) {
        attendedSessionCount++;
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
