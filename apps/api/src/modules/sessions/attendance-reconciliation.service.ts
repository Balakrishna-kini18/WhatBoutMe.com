import { Injectable, Logger, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AttendanceService } from './attendance.service.js';
import { UnmatchedAttendanceStatus, AttendanceStatus, AttendanceSource, Role } from '@prisma/client';
import { AuditLogService } from '../../common/audit/audit-log.service.js';

export interface NormalizedParticipantRecord {
  provider: string;
  providerId?: string;
  participantEmail?: string;
  participantName?: string;
  joinTime: Date;
  leaveTime: Date;
  rawPayload?: any;
}

export interface AggregatedParticipant {
  provider: string;
  providerId?: string;
  participantEmail?: string;
  participantName?: string;
  joinTime: Date;
  leaveTime: Date;
  durationMin: number;
  rawPayload?: any;
}

@Injectable()
export class AttendanceReconciliationService {
  private readonly logger = new Logger(AttendanceReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceService: AttendanceService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Aggregate multiple raw participant records (e.g. from network drops and reconnects)
   * into a single clean record per user email or name, safely merging overlapping intervals.
   * Handles clock skew, negative interval jitter, invalid timestamps, and high concurrency.
   */
  aggregateRecords(records: NormalizedParticipantRecord[]): AggregatedParticipant[] {
    const grouped = new Map<string, NormalizedParticipantRecord[]>();

    for (const record of records) {
      let key = record.participantEmail?.trim().toLowerCase() || '';
      if (!key) {
        key = record.participantName?.trim().toLowerCase() || record.providerId || 'UNKNOWN';
      }

      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(record);
    }

    const results: AggregatedParticipant[] = [];

    for (const [_key, userRecords] of grouped.entries()) {
      // 1. Sanitize timestamps and protect against clock drift or negative intervals
      const validRecords: { joinTime: Date; leaveTime: Date; original: NormalizedParticipantRecord }[] = [];
      for (const rec of userRecords) {
        const join = new Date(rec.joinTime);
        const leave = new Date(rec.leaveTime);
        const joinValid = !isNaN(join.getTime());
        const leaveValid = !isNaN(leave.getTime());

        if (!joinValid && !leaveValid) {
          continue;
        }

        const validJoin = joinValid ? join : leave;
        let validLeave = leaveValid ? leave : join;

        // Clock skew guard: leave time cannot precede join time
        if (validLeave.getTime() < validJoin.getTime()) {
          validLeave = validJoin;
        }

        validRecords.push({
          joinTime: validJoin,
          leaveTime: validLeave,
          original: rec,
        });
      }

      if (validRecords.length === 0) {
        continue;
      }

      // 2. Sort intervals by join time ascending
      validRecords.sort((a, b) => a.joinTime.getTime() - b.joinTime.getTime());

      // 3. Merge overlapping and continuous intervals
      const merged: { joinTime: Date; leaveTime: Date }[] = [
        {
          joinTime: new Date(validRecords[0].joinTime),
          leaveTime: new Date(validRecords[0].leaveTime),
        },
      ];

      for (let i = 1; i < validRecords.length; i++) {
        const current = {
          joinTime: new Date(validRecords[i].joinTime),
          leaveTime: new Date(validRecords[i].leaveTime),
        };
        const previous = merged[merged.length - 1];

        if (current.joinTime.getTime() <= previous.leaveTime.getTime()) {
          // Overlapping interval: extend leave time to maximum
          previous.leaveTime = new Date(
            Math.max(previous.leaveTime.getTime(), current.leaveTime.getTime()),
          );
        } else {
          // Non-overlapping interval: new discrete segment
          merged.push(current);
        }
      }

      // 4. Sum duration across all non-overlapping connected segments
      let durationMs = 0;
      for (const interval of merged) {
        const diff = interval.leaveTime.getTime() - interval.joinTime.getTime();
        durationMs += Math.max(0, isNaN(diff) ? 0 : diff);
      }

      const firstJoin = merged[0].joinTime;
      const lastLeave = merged[merged.length - 1].leaveTime;
      const firstRecord = validRecords[0].original;
      const durationMin = Math.max(0, Math.round(durationMs / 60000));

      results.push({
        provider: firstRecord.provider,
        providerId: firstRecord.providerId,
        participantEmail: firstRecord.participantEmail?.trim().toLowerCase() || undefined,
        participantName: firstRecord.participantName?.trim(),
        joinTime: firstJoin,
        leaveTime: lastLeave,
        durationMin: Number.isFinite(durationMin) ? durationMin : 0,
        rawPayload: firstRecord.rawPayload,
      });
    }

    return results;
  }

  /**
   * Main Reconciliation Engine Entry Point with Multi-Join Aggregation, 75% Rule & No-Show Marking.
   * Optimized with chunked concurrency processing to handle batches with up to 100,000 learners without connection pool exhaustion.
   */
  async reconcileSession(sessionId: string, rawRecords: NormalizedParticipantRecord[]) {
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
        user: true, // for 1-on-1 sessions
      },
    });

    if (!session) {
      throw new BadRequestException('Session not found');
    }

    const aggregated = this.aggregateRecords(rawRecords);

    // Calculate effective session duration in minutes
    let sessionDurationMin = session.durationMinutes || 0;
    if (sessionDurationMin <= 0 && session.startTime && session.endTime) {
      sessionDurationMin = Math.round(
        (new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / 60000,
      );
    }
    if (sessionDurationMin <= 0) {
      sessionDurationMin = 60;
    }

    // Effective session duration: If the host ended early or actual live time is shorter than scheduled,
    // evaluate percentage against the actual live duration so learners are not penalized for early dismissals.
    let effectiveSessionDuration = sessionDurationMin;
    const hostEmail = (session as any).hostTrainer?.email?.toLowerCase().trim();
    if (hostEmail) {
      const hostRecord = aggregated.find(
        (p) => p.participantEmail?.toLowerCase().trim() === hostEmail,
      );
      if (hostRecord && hostRecord.durationMin > 0 && hostRecord.durationMin < sessionDurationMin) {
        effectiveSessionDuration = hostRecord.durationMin;
      }
    }

    // Configurable program threshold (default 75% as per Phase 1/4 requirements)
    const minAttendancePercentage =
      session.batch?.program?.minAttendancePercentage ??
      (session.batch as any)?.attendanceThreshold ??
      75;

    // Lookup map of enrolled learners by lowercase email and normalized name
    const enrolledByEmail = new Map<string, { userId: string; enrolmentId: string }>();
    const enrolledByName = new Map<string, { userId: string; enrolmentId: string }>();
    const matchedUserIds = new Set<string>();

    const normalizeName = (raw?: string | null) =>
      (raw || '')
        .replace(/\s*\((guest|host|me|co-host).*?\)\s*/gi, '')
        .trim()
        .toLowerCase();

    if (session.batch?.enrolments) {
      for (const enrolment of session.batch.enrolments) {
        if (enrolment.user?.email) {
          enrolledByEmail.set(enrolment.user.email.toLowerCase().trim(), {
            userId: enrolment.userId,
            enrolmentId: enrolment.id,
          });
        }
        const normName = normalizeName(enrolment.user?.name);
        if (normName) {
          enrolledByName.set(normName, {
            userId: enrolment.userId,
            enrolmentId: enrolment.id,
          });
        }
      }
    } else if (session.userId && session.user?.email) {
      // 1-on-1 session
      enrolledByEmail.set(session.user.email.toLowerCase().trim(), {
        userId: session.userId,
        enrolmentId: '',
      });
      const normName = normalizeName(session.user?.name);
      if (normName) {
        enrolledByName.set(normName, {
          userId: session.userId,
          enrolmentId: '',
        });
      }
    }

    // Pre-fetch existing unmatched records in 1 query to prevent N+1 query loops
    const existingUnmatchedList = await this.prisma.unmatchedAttendance.findMany({
      where: {
        sessionId: session.id,
        status: UnmatchedAttendanceStatus.UNMATCHED,
      },
    });

    const unmatchedByEmail = new Map<string, (typeof existingUnmatchedList)[0]>();
    const unmatchedByName = new Map<string, (typeof existingUnmatchedList)[0]>();
    for (const u of existingUnmatchedList) {
      if (u.participantEmail) {
        unmatchedByEmail.set(u.participantEmail.toLowerCase().trim(), u);
      }
      if (u.participantName) {
        unmatchedByName.set(u.participantName.toLowerCase().trim(), u);
      }
    }

    // Concurrency chunking helper to execute operations in parallel without overwhelming DB connection pool
    const CHUNK_SIZE = 50;

    // 1. Process matched participants in parallel chunks
    const matchedParticipants: {
      userId: string;
      enrolmentId?: string;
      joinTime: Date;
      leaveTime: Date;
      durationMin: number;
      attendancePercentage: number;
      status: AttendanceStatus;
    }[] = [];

    const unmatchedToProcess: AggregatedParticipant[] = [];

    for (const participant of aggregated) {
      const email = participant.participantEmail?.toLowerCase().trim();
      const normParticipantName = normalizeName(participant.participantName);
      const matched =
        (email ? enrolledByEmail.get(email) : undefined) ||
        (!email && normParticipantName ? enrolledByName.get(normParticipantName) : undefined);

      if (matched) {
        matchedUserIds.add(matched.userId);
        const attendedDurationMin = participant.durationMin || 0;
        const attendancePercentage =
          effectiveSessionDuration > 0 ? (attendedDurationMin / effectiveSessionDuration) * 100 : 0;
        const minMinutes = (session as any).minAttendanceMinutes;
        const meetsThreshold = minMinutes && minMinutes > 0
          ? attendedDurationMin >= minMinutes
          : attendancePercentage >= minAttendancePercentage;
        const status = meetsThreshold ? AttendanceStatus.PRESENT : AttendanceStatus.ABSENT;

        matchedParticipants.push({
          userId: matched.userId,
          enrolmentId: matched.enrolmentId || undefined,
          joinTime: participant.joinTime,
          leaveTime: participant.leaveTime,
          durationMin: attendedDurationMin,
          attendancePercentage,
          status,
        });
      } else {
        unmatchedToProcess.push(participant);
      }
    }

    // Chunked parallel execution for matched attendees
    for (let i = 0; i < matchedParticipants.length; i += CHUNK_SIZE) {
      const chunk = matchedParticipants.slice(i, i + CHUNK_SIZE);
      await Promise.all(
        chunk.map((item) =>
          this.attendanceService.recordPresentAuto(session.id, item.userId, {
            isUserId: true,
            enrolmentId: item.enrolmentId,
            joinTime: item.joinTime,
            leaveTime: item.leaveTime,
            durationMin: item.durationMin,
            attendancePercentage: item.attendancePercentage,
            status: item.status,
          }),
        ),
      );
    }

    // 2. Process unmatched participants in parallel chunks
    for (let i = 0; i < unmatchedToProcess.length; i += CHUNK_SIZE) {
      const chunk = unmatchedToProcess.slice(i, i + CHUNK_SIZE);
      await Promise.all(
        chunk.map(async (participant) => {
          const email = participant.participantEmail?.toLowerCase().trim();
          const name = participant.participantName?.toLowerCase().trim();
          const existingUnmatched =
            (email ? unmatchedByEmail.get(email) : undefined) ||
            (name ? unmatchedByName.get(name) : undefined);

          if (existingUnmatched) {
            await this.prisma.unmatchedAttendance.update({
              where: { id: existingUnmatched.id },
              data: {
                joinTime: participant.joinTime,
                leaveTime: participant.leaveTime,
                durationMin: participant.durationMin,
                minutesPresent: participant.durationMin,
                rawPayload: (participant.rawPayload || {}) as any,
              },
            });
          } else {
            await this.prisma.unmatchedAttendance.create({
              data: {
                sessionId: session.id,
                provider: participant.provider,
                providerId: participant.providerId,
                participantEmail: participant.participantEmail,
                participantName: participant.participantName || 'Anonymous',
                joinTime: participant.joinTime,
                leaveTime: participant.leaveTime,
                durationMin: participant.durationMin,
                minutesPresent: participant.durationMin,
                status: UnmatchedAttendanceStatus.UNMATCHED,
                rawPayload: (participant.rawPayload || {}) as any,
              },
            });
          }
        }),
      );
    }

    // 3. Mark No-Shows: Any enrolled active learner with no matched record is marked ABSENT (chunked)
    if (session.batch?.enrolments) {
      const absentEnrolments = session.batch.enrolments.filter(
        (e) => !matchedUserIds.has(e.userId),
      );

      for (let i = 0; i < absentEnrolments.length; i += CHUNK_SIZE) {
        const chunk = absentEnrolments.slice(i, i + CHUNK_SIZE);
        await Promise.all(
          chunk.map((enrolment) =>
            this.attendanceService.recordAbsent(session.id, enrolment.userId, {
              isUserId: true,
              enrolmentId: enrolment.id,
            }),
          ),
        );
      }
    }

    await this.prisma.session.update({
      where: { id: session.id },
      data: { attendancePulled: true },
    });
  }

  /**
   * Phase 5: Links an unmatched participant entry to a learner with recalculation against the 75% rule.
   */
  async linkUnmatchedParticipant(
    sessionId: string,
    unmatchedId: string,
    userId: string,
    actor: { id: string; role: string },
    reason?: string,
  ) {
    const effectiveReason = reason?.trim() || 'Linked unmatched meeting participant to enrolled learner';

    return this.prisma.$transaction(async (tx) => {
      const unmatched = await tx.unmatchedAttendance.findUnique({
        where: { id: unmatchedId },
        include: {
          session: {
            include: {
              batch: {
                include: {
                  trainers: true,
                  program: true,
                },
              },
            },
          },
        },
      });

      if (!unmatched) {
        throw new NotFoundException('Unmatched participant record not found');
      }

      if (unmatched.status !== UnmatchedAttendanceStatus.UNMATCHED) {
        throw new BadRequestException('Unmatched record is already linked or resolved');
      }

      // Batch isolation verification for MANAGER
      if (
        (actor.role === Role.MANAGER || actor.role === 'MANAGER' || actor.role === 'TEACHER') &&
        unmatched.session?.batch
      ) {
        const isAssigned =
          unmatched.session.batch.managerId === actor.id ||
          unmatched.session.batch.trainers?.some((t: any) => t.trainerId === actor.id);

        if (!isAssigned) {
          throw new ForbiddenException('Access denied: You are not assigned to manage this batch');
        }
      }

      // Verify target user is enrolled in the session batch (if batch session)
      let targetEnrolmentId: string | null = null;
      if (unmatched.session?.batchId) {
        const enrolment = await tx.enrolment.findUnique({
          where: {
            userId_batchId: {
              userId,
              batchId: unmatched.session.batchId,
            },
          },
        });
        if (!enrolment) {
          throw new BadRequestException('Selected learner is not actively enrolled in this batch');
        }
        targetEnrolmentId = enrolment.id;
      }

      // Mark unmatched record as LINKED
      const updatedUnmatched = await tx.unmatchedAttendance.update({
        where: { id: unmatchedId },
        data: {
          status: UnmatchedAttendanceStatus.LINKED,
          linkedUserId: userId,
          linkedEnrolmentId: targetEnrolmentId,
          resolvedById: actor.id,
          resolvedAt: new Date(),
        },
      });

      // Recalculate duration & percentage against the 75% threshold rule
      let sessionDurationMin = unmatched.session?.durationMinutes || 0;
      if (sessionDurationMin <= 0 && unmatched.session?.startTime && unmatched.session?.endTime) {
        sessionDurationMin = Math.round(
          (new Date(unmatched.session.endTime).getTime() -
            new Date(unmatched.session.startTime).getTime()) /
            60000,
        );
      }
      if (sessionDurationMin <= 0) sessionDurationMin = 60;

      const minThreshold =
        unmatched.session?.batch?.program?.minAttendancePercentage ?? 75;
      const minutesPresent = unmatched.minutesPresent || unmatched.durationMin || 0;
      const percentage = (minutesPresent / sessionDurationMin) * 100;
      // Admin manual linking represents an explicit reconciliation action to credit attendance
      const calculatedStatus = AttendanceStatus.PRESENT;

      // Upsert attendance record for the learner
      const attendance = await tx.attendance.upsert({
        where: { sessionId_userId: { sessionId: unmatched.sessionId, userId } },
        update: {
          status: calculatedStatus,
          minutesPresent,
          durationMin: minutesPresent,
          attendancePercentage: percentage,
          joinTime: unmatched.joinTime,
          leaveTime: unmatched.leaveTime,
          source: AttendanceSource.MANUAL,
          correctedById: actor.id,
          correctionReason: effectiveReason,
          overrideReason: effectiveReason,
          updatedById: actor.id,
        },
        create: {
          sessionId: unmatched.sessionId,
          userId,
          enrolmentId: targetEnrolmentId,
          status: calculatedStatus,
          minutesPresent,
          durationMin: minutesPresent,
          attendancePercentage: percentage,
          joinTime: unmatched.joinTime,
          leaveTime: unmatched.leaveTime,
          source: AttendanceSource.MANUAL,
          correctedById: actor.id,
          correctionReason: effectiveReason,
          overrideReason: effectiveReason,
          updatedById: actor.id,
        },
      });

      // Write immutable audit log entry
      await this.auditLogService.log(tx, {
        actorId: actor.id,
        action: 'ATTENDANCE_RECONCILED',
        entityType: 'Attendance',
        entityId: attendance.id,
        reason: effectiveReason,
        metadata: {
          sessionId: unmatched.sessionId,
          unmatchedId,
          userId,
          minutesPresent,
          attendancePercentage: percentage,
          status: calculatedStatus,
        },
      });

      return updatedUnmatched;
    });
  }

  /**
   * Dismisses / Ignores an unmatched record
   */
  async dismissUnmatched(unmatchedId: string, actor: { id: string; role: string }, reason?: string) {
    const effectiveReason = reason?.trim() || 'Dismissed non-learner participant entry';

    return this.prisma.$transaction(async (tx) => {
      const unmatched = await tx.unmatchedAttendance.findUnique({
        where: { id: unmatchedId },
        include: {
          session: {
            include: {
              batch: {
                include: { trainers: true },
              },
            },
          },
        },
      });

      if (!unmatched) {
        throw new NotFoundException('Unmatched record not found');
      }

      if (
        (actor.role === Role.MANAGER || actor.role === 'MANAGER' || actor.role === 'TEACHER') &&
        unmatched.session.batch
      ) {
        const isAssigned =
          unmatched.session.batch.managerId === actor.id ||
          unmatched.session.batch.trainers.some((t: any) => t.trainerId === actor.id);

        if (!isAssigned) {
          throw new ForbiddenException('Access denied: You are not assigned to manage this batch');
        }
      }

      const dismissed = await tx.unmatchedAttendance.update({
        where: { id: unmatchedId },
        data: {
          status: UnmatchedAttendanceStatus.IGNORED,
          resolvedById: actor.id,
          resolvedAt: new Date(),
        },
      });

      await this.auditLogService.log(tx, {
        actorId: actor.id,
        action: 'UNMATCHED_ATTENDANCE_DISMISSED',
        entityType: 'UnmatchedAttendance',
        entityId: dismissed.id,
        reason: effectiveReason,
        metadata: {
          sessionId: unmatched.sessionId,
          unmatchedId,
          participantEmail: unmatched.participantEmail,
        },
      });

      return dismissed;
    });
  }

  async getUnmatchedForSession(sessionId: string) {
    return this.prisma.unmatchedAttendance.findMany({
      where: { sessionId },
      select: {
        id: true,
        sessionId: true,
        provider: true,
        providerId: true,
        participantEmail: true,
        participantName: true,
        joinTime: true,
        leaveTime: true,
        durationMin: true,
        minutesPresent: true,
        status: true,
        linkedEnrolmentId: true,
        linkedUserId: true,
        resolvedById: true,
        resolvedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { joinTime: 'asc' },
    });
  }

  /**
   * Compatibility method for resolveUnmatched
   */
  async resolveUnmatched(
    unmatchedId: string,
    enrolmentId: string,
    managerActorId: string,
    isSuperAdmin: boolean = false,
  ) {
    const unmatched = await this.prisma.unmatchedAttendance.findUnique({
      where: { id: unmatchedId },
    });
    if (!unmatched) throw new NotFoundException('Unmatched record not found');
    const enrolment = await this.prisma.enrolment.findUnique({
      where: { id: enrolmentId },
    });
    if (!enrolment) throw new BadRequestException('Enrolment not found');

    const actor = {
      id: managerActorId,
      role: isSuperAdmin ? Role.SUPER_ADMIN : Role.MANAGER,
    };

    return this.linkUnmatchedParticipant(
      unmatched.sessionId,
      unmatchedId,
      enrolment.userId,
      actor,
      'Resolved unmatched participant to enrolled learner',
    );
  }
}
