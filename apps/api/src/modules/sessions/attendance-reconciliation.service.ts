import { Injectable, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AttendanceService } from './attendance.service.js';
import { UnmatchedAttendanceStatus, AttendanceStatus } from '@prisma/client';

export interface NormalizedParticipantRecord {
  provider: string;
  providerId?: string;
  participantEmail?: string;
  participantName?: string;
  joinTime: Date;
  leaveTime: Date;
}

export interface AggregatedParticipant {
  provider: string;
  providerId?: string;
  participantEmail?: string;
  participantName?: string;
  joinTime: Date;
  leaveTime: Date;
  durationMin: number;
}

@Injectable()
export class AttendanceReconciliationService {
  private readonly logger = new Logger(AttendanceReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceService: AttendanceService,
  ) {}

  /**
   * Aggregate multiple raw participant records (e.g. from Zoom reconnects) 
   * into a single clean record per user email, safely merging overlapping intervals.
   */
  aggregateRecords(records: NormalizedParticipantRecord[]): AggregatedParticipant[] {
    const grouped = new Map<string, NormalizedParticipantRecord[]>();

    for (const record of records) {
      // Normalize email: trim and lowercase
      let key = record.participantEmail?.trim().toLowerCase() || '';
      if (!key) {
        // Fallback to name or provider ID if email is missing
        key = record.participantName?.trim().toLowerCase() || record.providerId || 'UNKNOWN';
      }

      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(record);
    }

    const results: AggregatedParticipant[] = [];

    for (const [key, userRecords] of grouped.entries()) {
      // Sort by join time
      userRecords.sort((a, b) => a.joinTime.getTime() - b.joinTime.getTime());
      
      const merged: { joinTime: Date; leaveTime: Date }[] = [{ 
        joinTime: userRecords[0].joinTime, 
        leaveTime: userRecords[0].leaveTime 
      }];

      for (let i = 1; i < userRecords.length; i++) {
        const current = userRecords[i];
        const previous = merged[merged.length - 1];

        if (current.joinTime <= previous.leaveTime) {
          // Overlap: extend leaveTime if needed
          previous.leaveTime = new Date(Math.max(previous.leaveTime.getTime(), current.leaveTime.getTime()));
        } else {
          merged.push({ joinTime: current.joinTime, leaveTime: current.leaveTime });
        }
      }

      let durationMs = 0;
      for (const interval of merged) {
        durationMs += (interval.leaveTime.getTime() - interval.joinTime.getTime());
      }

      const firstJoin = merged[0].joinTime;
      const lastLeave = merged[merged.length - 1].leaveTime;
      
      const firstRecord = userRecords[0];

      results.push({
        provider: firstRecord.provider,
        providerId: firstRecord.providerId,
        participantEmail: firstRecord.participantEmail?.trim().toLowerCase() || undefined,
        participantName: firstRecord.participantName?.trim(),
        joinTime: firstJoin,
        leaveTime: lastLeave,
        durationMin: Math.floor(durationMs / 60000),
      });
    }

    return results;
  }

  /**
   * D1-048b: Main Reconciliation Engine Entry Point with 70% Attendance Compliance Enforcement (ATT-01)
   */
  async reconcileSession(sessionId: string, rawRecords: NormalizedParticipantRecord[]) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { 
        batch: {
          include: { enrolments: { include: { user: true } } }
        }
      }
    });

    if (!session) {
      throw new BadRequestException('Session not found');
    }

    const aggregated = this.aggregateRecords(rawRecords);

    // Calculate effective session duration in minutes
    let sessionDurationMin = 0;
    if (session.startTime && session.endTime && new Date(session.endTime) > new Date(session.startTime)) {
      sessionDurationMin = Math.round(
        (new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / 60000,
      );
    } else {
      // Safe default for missing, zero, or invalid scheduled times
      sessionDurationMin = 60;
      this.logger.warn(
        `Session ${session.id} has invalid or missing duration (start=${session.startTime}, end=${session.endTime}). Defaulting to 60 minutes for attendance evaluation.`,
      );
    }

    // Configurable batch threshold or standard 70% threshold (ATT-01)
    const thresholdPercent = (session.batch as any)?.attendanceThreshold ?? 70;

    // Build lookup maps for enrolments by email
    const enrolmentsByEmail = new Map<string, typeof session.batch.enrolments[0]>();
    for (const enrolment of session.batch.enrolments) {
      if (enrolment.user.email) {
        enrolmentsByEmail.set(enrolment.user.email.toLowerCase(), enrolment);
      }
    }

    // Process each aggregated participant
    for (const participant of aggregated) {
      let matchedEnrolment = undefined;
      
      if (participant.participantEmail) {
        matchedEnrolment = enrolmentsByEmail.get(participant.participantEmail);
      }

      if (matchedEnrolment) {
        // Evaluate attended duration against 70% compliance threshold
        const attendedDurationMin = participant.durationMin || 0;
        const attendancePercentage = sessionDurationMin > 0
          ? (attendedDurationMin / sessionDurationMin) * 100
          : 0;

        const meetsThreshold = attendancePercentage >= thresholdPercent;
        const status = meetsThreshold ? AttendanceStatus.PRESENT_AUTO : AttendanceStatus.ABSENT;

        // Known learner: pass to domain service which naturally protects MANUAL/CORRECTED states.
        await this.attendanceService.recordPresentAuto(
          session.id, 
          matchedEnrolment.id, 
          {
            joinTime: participant.joinTime,
            leaveTime: participant.leaveTime,
            durationMin: attendedDurationMin,
            status,
          }
        );
      } else {
        // Unknown or unmatched participant: send to Unmatched Queue (Idempotent)
        const matchKey = participant.participantEmail || participant.participantName || participant.providerId || 'UNKNOWN';
        
        const orClauses: any[] = [];
        if (participant.participantEmail) orClauses.push({ participantEmail: participant.participantEmail });
        if (participant.providerId) orClauses.push({ providerId: participant.providerId });
        if (participant.participantName) orClauses.push({ participantName: participant.participantName });

        let existingUnmatched = null;
        if (orClauses.length > 0) {
          existingUnmatched = await this.prisma.unmatchedAttendance.findFirst({
            where: {
              sessionId: session.id,
              OR: orClauses
            }
          });
        }

        if (existingUnmatched) {
          // Update aggregated times if it hasn't been resolved yet
          if (existingUnmatched.status === UnmatchedAttendanceStatus.UNMATCHED) {
             await this.prisma.unmatchedAttendance.update({
               where: { id: existingUnmatched.id },
               data: {
                 joinTime: participant.joinTime,
                 leaveTime: participant.leaveTime,
                 durationMin: participant.durationMin,
               }
             });
          }
        } else {
          await this.prisma.unmatchedAttendance.create({
            data: {
              sessionId: session.id,
              provider: participant.provider,
              providerId: participant.providerId,
              participantEmail: participant.participantEmail,
              participantName: participant.participantName,
              joinTime: participant.joinTime,
              leaveTime: participant.leaveTime,
              durationMin: participant.durationMin,
              status: UnmatchedAttendanceStatus.UNMATCHED,
            }
          });
        }
      }
    }

    // Finally, mark the session as having its attendance pulled
    await this.prisma.session.update({
      where: { id: session.id },
      data: { attendancePulled: true }
    });
  }

  /**
   * Manually resolves an unmatched record to a valid learner in the batch.
   */
  async resolveUnmatched(unmatchedId: string, enrolmentId: string, managerActorId: string, isSuperAdmin: boolean = false) {
    return this.prisma.$transaction(async (tx) => {
      const unmatched = await tx.unmatchedAttendance.findUnique({
        where: { id: unmatchedId },
        include: { session: { include: { batch: true } } }
      });

      if (!unmatched) {
        throw new BadRequestException('Unmatched record not found');
      }

      if (unmatched.status !== UnmatchedAttendanceStatus.UNMATCHED) {
        throw new BadRequestException('Record is already resolved');
      }

      // RBAC check: Manager can only link in their assigned batch
      if (!isSuperAdmin && unmatched.session.batch.managerId !== managerActorId) {
        // Also check if they are a batch trainer? The requirement says manager assigned batch.
        throw new ForbiddenException('You can only resolve attendance for your assigned batches');
      }

      // Check enrolment belongs to same batch
      const enrolment = await tx.enrolment.findUnique({
        where: { id: enrolmentId }
      });

      if (!enrolment || enrolment.batchId !== unmatched.session.batchId) {
        throw new BadRequestException('Selected learner is not enrolled in the relevant batch');
      }

      // Perform linkage: update Unmatched table
      const resolved = await tx.unmatchedAttendance.update({
        where: { id: unmatchedId },
        data: {
          status: UnmatchedAttendanceStatus.LINKED,
          linkedEnrolmentId: enrolmentId,
          resolvedById: managerActorId,
          resolvedAt: new Date(),
        }
      });

      // Update Attendance table via domain logic. We use tx by passing it to correctAttendance if possible,
      // but since AttendanceService handles its own transactions or uses the provided one, we'll need to call it.
      // Wait, AttendanceService methods accept transactions if we wrap them, but actually we can just call it 
      // without transaction context or with a simpler flow. 
      // To strictly follow rules, let's call attendanceService.recordPresentAuto if they are merely linking the auto data,
      // OR maybe correctAttendance? 
      // The requirement says: "resolving an unmatched attendee must update attendance through AttendanceService, not directly mutate attendance state"
      // Wait, is it a manual override or an automatic mapping?
      // "link an unmatched participant... resolving must update attendance through AttendanceService"
      // If we use recordPresentAuto, it's non-destructive and treats it as an automated signal that got linked.
      // Let's use recordPresentAuto so that if someone manually marked them Absent/Corrected already, we don't blow it away.
      
      // We will perform the domain call after the transaction, or we can use the domain service separately.
      
      return resolved;
    }).then(async (resolved) => {
       // Domain call
       await this.attendanceService.recordPresentAuto(
         resolved.sessionId,
         resolved.linkedEnrolmentId!,
         {
           joinTime: resolved.joinTime || undefined,
           leaveTime: resolved.leaveTime || undefined,
           durationMin: resolved.durationMin || undefined,
         }
       );
       
       // Log audit
       await this.prisma.auditLog.create({
         data: {
           actorId: managerActorId,
           action: 'UNMATCHED_ATTENDANCE_LINKED',
           entity: 'UnmatchedAttendance',
           entityId: resolved.id,
           meta: { 
             sessionId: resolved.sessionId,
             linkedEnrolmentId: enrolmentId, 
             participantEmail: resolved.participantEmail 
           }
         }
       });

       return resolved;
    });
  }

  async dismissUnmatched(unmatchedId: string, managerActorId: string, isSuperAdmin: boolean = false) {
    const unmatched = await this.prisma.unmatchedAttendance.findUnique({
      where: { id: unmatchedId },
      include: { session: { include: { batch: true } } }
    });

    if (!unmatched) {
      throw new BadRequestException('Unmatched record not found');
    }

    if (!isSuperAdmin && unmatched.session.batch.managerId !== managerActorId) {
      throw new ForbiddenException('You can only resolve attendance for your assigned batches');
    }

    const resolved = await this.prisma.unmatchedAttendance.update({
      where: { id: unmatchedId },
      data: {
        status: UnmatchedAttendanceStatus.IGNORED,
        resolvedById: managerActorId,
        resolvedAt: new Date(),
      }
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: managerActorId,
        action: 'UNMATCHED_ATTENDANCE_DISMISSED',
        entity: 'UnmatchedAttendance',
        entityId: resolved.id,
        meta: { sessionId: resolved.sessionId, participantEmail: resolved.participantEmail }
      }
    });

    return resolved;
  }
  async getUnmatchedForSession(sessionId: string) {
    return this.prisma.unmatchedAttendance.findMany({
      where: { sessionId },
      orderBy: { joinTime: 'asc' },
    });
  }
}
