import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { ZoomMeetingProvider } from './zoom.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  AttendanceReconciliationService,
  NormalizedParticipantRecord,
} from '../sessions/attendance-reconciliation.service.js';
import { SessionsService } from '../sessions/sessions.service.js';

@Processor('zoom-events')
export class ZoomProcessor extends WorkerHost {
  private readonly logger = new Logger(ZoomProcessor.name);

  constructor(
    private readonly zoomService: ZoomMeetingProvider,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => AttendanceReconciliationService))
    private readonly reconciliationService: AttendanceReconciliationService,
    @Inject(forwardRef(() => SessionsService))
    private readonly sessionsService: SessionsService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    return this.processPayload(job.data);
  }

  async processPayload(payload: any): Promise<any> {
    const eventType = payload?.event;
    if (!eventType) return;

    this.logger.log(`Processing Zoom event: ${eventType}`);

    // Idempotency check via WebhookEvent table
    const participantId =
      payload.payload?.object?.participant?.user_id ||
      payload.payload?.object?.participant?.id ||
      '';
    const eventKey = `${eventType}:${payload.payload?.object?.uuid || payload.payload?.object?.id || ''}:${participantId}:${payload.event_ts || Date.now()}`;
    if (this.prisma.webhookEvent?.create) {
      try {
        await this.prisma.webhookEvent.create({
          data: {
            provider: 'ZOOM',
            eventKey,
            payload: payload as any,
            status: 'PROCESSED',
          },
        });
      } catch (err: any) {
        if (err.code === 'P2002') {
          this.logger.log(`Duplicate webhook event ${eventKey} already processed. Skipping.`);
          return;
        }
      }
    }

    try {
      const obj = payload.payload?.object;
      if (!obj) return;

      if (eventType === 'meeting.started') {
        await this.handleMeetingStarted(obj);
      } else if (eventType === 'meeting.participant_joined') {
        await this.handleParticipantJoined(obj);
      } else if (eventType === 'meeting.participant_left') {
        await this.handleParticipantLeft(obj);
      } else if (eventType === 'meeting.ended') {
        await this.handleMeetingEnded(obj);
      } else if (eventType === 'recording.completed') {
        await this.handleRecordingCompleted(obj);
      }
    } catch (error: any) {
      this.logger.error(`Failed to process Zoom event ${eventType}: ${error.message}`);
      throw error;
    }
  }

  private normalizeName(raw?: string | null): string {
    return (raw || '')
      .replace(/\s*\((guest|host|me|co-host).*?\)\s*/gi, '')
      .trim()
      .toLowerCase();
  }

  private async findSessionAndMatchLearner(meetingId: string, participant: any) {
    if (!this.prisma.session?.findFirst) return null;

    const session = await this.prisma.session.findFirst({
      where: { providerMeetingId: meetingId },
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
        user: true,
      },
    } as any);

    if (!session) return null;

    const rawEmail = (participant?.email || participant?.user_email || '').trim().toLowerCase();
    const normName = this.normalizeName(participant?.user_name || participant?.name);

    const enrolments = (session as any).batch?.enrolments || [];
    let matched: { userId: string; enrolmentId: string | null } | null = null;

    if (rawEmail) {
      const byEmail = enrolments.find(
        (e: any) => e.user?.email?.trim().toLowerCase() === rawEmail,
      );
      if (byEmail) {
        matched = { userId: byEmail.userId, enrolmentId: byEmail.id };
      } else if ((session as any).user?.email?.trim().toLowerCase() === rawEmail) {
        matched = { userId: (session as any).userId, enrolmentId: null };
      }
    }

    if (!matched && normName) {
      const nameMatches = enrolments.filter(
        (e: any) => this.normalizeName(e.user?.name) === normName,
      );
      if (nameMatches.length === 1) {
        matched = { userId: nameMatches[0].userId, enrolmentId: nameMatches[0].id };
      } else if (
        nameMatches.length === 0 &&
        this.normalizeName((session as any).user?.name) === normName
      ) {
        matched = { userId: (session as any).userId, enrolmentId: null };
      }
    }

    return { session: session as any, matched };
  }

  private async handleMeetingStarted(zoomMeeting: any) {
    if (!zoomMeeting?.id || !this.prisma.session?.findFirst) return;
    const meetingId = zoomMeeting.id.toString();
    const session = await this.prisma.session.findFirst({
      where: { providerMeetingId: meetingId },
    });
    if (session && (session as any).status === 'SCHEDULED' && this.prisma.session?.update) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { status: 'ACTIVE' as any },
      });
    }
  }

  private async handleParticipantJoined(zoomMeeting: any) {
    const meetingId = zoomMeeting?.id?.toString();
    const participant = zoomMeeting?.participant;
    if (!meetingId || !participant || !this.prisma.attendance?.upsert) return;

    const resolved = await this.findSessionAndMatchLearner(meetingId, participant);
    if (!resolved || !resolved.matched) return;

    const { session, matched } = resolved;
    const joinTime = participant.join_time ? new Date(participant.join_time) : new Date();

    const existing = await this.prisma.attendance.findUnique?.({
      where: { sessionId_userId: { sessionId: session.id, userId: matched.userId } },
    });

    const earlierJoin =
      existing?.joinTime && new Date(existing.joinTime) < joinTime ? existing.joinTime : joinTime;

    await this.prisma.attendance.upsert({
      where: { sessionId_userId: { sessionId: session.id, userId: matched.userId } },
      update: {
        joinTime: earlierJoin,
        leaveTime: joinTime,
        correctionReason: 'ZOOM_JOINED',
      },
      create: {
        sessionId: session.id,
        userId: matched.userId,
        enrolmentId: matched.enrolmentId,
        joinTime,
        leaveTime: joinTime,
        liveMinutes: 0,
        minutesPresent: 0,
        durationMin: 0,
        attendancePercentage: 0,
        status: 'ABSENT' as any,
        source: 'AUTO' as any,
        correctionReason: 'ZOOM_JOINED',
      },
    });
  }

  private async handleParticipantLeft(zoomMeeting: any) {
    const meetingId = zoomMeeting?.id?.toString();
    const participant = zoomMeeting?.participant;
    if (!meetingId || !participant || !this.prisma.attendance?.upsert) return;

    const resolved = await this.findSessionAndMatchLearner(meetingId, participant);
    if (!resolved || !resolved.matched) return;

    const { session, matched } = resolved;
    const leaveTime = participant.leave_time ? new Date(participant.leave_time) : new Date();

    const existing = await this.prisma.attendance.findUnique?.({
      where: { sessionId_userId: { sessionId: session.id, userId: matched.userId } },
    });

    // Do not overwrite manual overrides
    if (
      existing &&
      (existing.status === 'PRESENT_MANUAL' || existing.status === 'CORRECTED')
    ) {
      return;
    }

    const segmentStart =
      existing?.correctionReason === 'ZOOM_JOINED' && existing?.leaveTime
        ? new Date(existing.leaveTime)
        : existing?.joinTime
          ? new Date(existing.joinTime)
          : leaveTime;

    const effectiveSegmentStart =
      session.startTime && segmentStart < new Date(session.startTime)
        ? new Date(session.startTime)
        : segmentStart;

    const segmentMin = Math.max(0, (leaveTime.getTime() - effectiveSegmentStart.getTime()) / 60000);
    const prevAccumulatedMin = existing?.liveMinutes ?? existing?.minutesPresent ?? 0;

    const totalMinutes =
      existing?.correctionReason === 'ZOOM_JOINED'
        ? Math.max(0, Math.round((prevAccumulatedMin + segmentMin) * 100) / 100)
        : Math.max(prevAccumulatedMin, Math.round(segmentMin * 100) / 100);
    const roundedMinutes = Math.round(totalMinutes);

    const scheduledMin =
      session.durationMinutes ||
      (session.startTime && session.endTime
        ? Math.max(15, Math.round((new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / 60000))
        : 60);
    const elapsedSinceStart =
      session.startTime && leaveTime >= new Date(session.startTime)
        ? Math.round((leaveTime.getTime() - new Date(session.startTime).getTime()) / 60000)
        : 0;
    const effectiveTotalMin = Math.max(scheduledMin, elapsedSinceStart, roundedMinutes);

    const attendancePercentage =
      effectiveTotalMin > 0
        ? Math.min(100, Math.round((roundedMinutes / effectiveTotalMin) * 10000) / 100)
        : 0;

    const thresholdPercent =
      session.batch?.program?.minAttendancePercentage ??
      session.batch?.attendanceThreshold ??
      75;

    const meetsThreshold =
      session.minAttendanceMinutes && session.minAttendanceMinutes > 0
        ? roundedMinutes >= session.minAttendanceMinutes
        : attendancePercentage >= thresholdPercent;

    await this.prisma.attendance.upsert({
      where: { sessionId_userId: { sessionId: session.id, userId: matched.userId } },
      update: {
        leaveTime,
        liveMinutes: totalMinutes,
        minutesPresent: roundedMinutes,
        durationMin: roundedMinutes,
        attendancePercentage,
        status: (meetsThreshold ? 'PRESENT_AUTO' : 'ABSENT') as any,
        correctionReason: 'ZOOM_LEFT',
      },
      create: {
        sessionId: session.id,
        userId: matched.userId,
        enrolmentId: matched.enrolmentId,
        joinTime: segmentStart,
        leaveTime,
        liveMinutes: totalMinutes,
        minutesPresent: roundedMinutes,
        durationMin: roundedMinutes,
        attendancePercentage,
        status: (meetsThreshold ? 'PRESENT_AUTO' : 'ABSENT') as any,
        source: 'AUTO' as any,
        correctionReason: 'ZOOM_LEFT',
      },
    });
  }

  private async handleMeetingEnded(zoomMeeting: any) {
    const meetingId = zoomMeeting.id.toString();
    
    // 1. Find the session in our database
    const session = await this.prisma.session.findFirst({
      where: { providerMeetingId: meetingId },
    });

    if (!session) {
      this.logger.warn(`Received meeting.ended for unknown Zoom meeting ID: ${meetingId}`);
      return;
    }

    // 2. Atomic claim to prevent check-then-set race condition
    const claim = await this.prisma.session.updateMany({
      where: { id: session.id, attendancePulled: false },
      data: { attendancePulled: true, status: 'COMPLETED' },
    });

    if (claim.count === 0) {
      this.logger.log(
        `Attendance for session ${session.id} already claimed/reconciled. Skipping duplicate webhook.`,
      );
      return;
    }

    // 3. D2-032: Fetch participant report and reconcile attendance via AttendanceReconciliationService
    const rawParticipants = await this.zoomService.getParticipantReport(meetingId);
    const participants = Array.isArray(rawParticipants) ? rawParticipants : [];

    if (participants.length === 0) {
      this.logger.warn(
        `Zoom participant report for session ${session.id} (meeting ${meetingId}) returned 0 participants right at meeting.ended; resetting attendancePulled=false for deferred sync.`,
      );
      if (this.prisma.session?.update) {
        await this.prisma.session.update({
          where: { id: session.id },
          data: { attendancePulled: false },
        });
      }
      return;
    }

    const normalizedRecords: NormalizedParticipantRecord[] = participants.map((p) => {
      const email =
        p.participantEmail ||
        (p.userEmail?.includes('@') ? p.userEmail.trim().toLowerCase() : undefined);
      const name =
        p.participantName ||
        (!p.userEmail?.includes('@') ? p.userEmail?.trim() : undefined);
      return {
        provider: 'ZOOM',
        participantEmail: email,
        participantName: name,
        joinTime: p.joinTime,
        leaveTime: p.leaveTime,
      };
    });

    await this.reconciliationService.reconcileSession(session.id, normalizedRecords);

    this.logger.log(`Successfully processed meeting.ended for session ${session.id}`);
  }

  private async handleRecordingCompleted(zoomMeeting: any) {
    const meetingId = zoomMeeting.id.toString();

    // 1. Find the session in our database
    const session = await this.prisma.session.findFirst({
      where: { providerMeetingId: meetingId },
    });

    if (!session) {
      this.logger.warn(`Received recording.completed for unknown Zoom meeting ID: ${meetingId}`);
      return;
    }

    // 2. Extract the MP4 URL from the payload, or fetch it via D2-031 if not present
    let playUrl: string | null = null;
    
    const mp4File = zoomMeeting.recording_files?.find((file: any) => file.file_type === 'MP4');
    if (mp4File && mp4File.play_url) {
      playUrl = mp4File.play_url;
    } else {
      // Fallback: fetch via our Provider
      playUrl = await this.zoomService.getRecordingUrl(meetingId);
    }

    if (playUrl) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: {
          providerRecordingUrl: playUrl,
          // If we had a Cloudinary upload step, we would trigger it here and set `recordingUrl`.
          // For now, we will just link the raw provider URL.
          recordingUrl: playUrl, 
        },
      });
      this.logger.log(`Successfully processed recording.completed for session ${session.id}`);
      // Trigger missed session notifications for all absent learners
      await this.sessionsService.triggerMissedSessionNotifications(session.id, playUrl);
    } else {
      this.logger.warn(`No MP4 recording found for Zoom meeting ID: ${meetingId}`);
    }
  }
}
