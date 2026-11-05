import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import * as crypto from 'crypto';
import { ZoomMeetingProvider } from './zoom.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  AttendanceReconciliationService,
  NormalizedParticipantRecord,
} from '../sessions/attendance-reconciliation.service.js';
import { SessionsService } from '../sessions/sessions.service.js';

/**
 * Generates a stable, deterministic idempotency key for a Zoom webhook event.
 * Never falls back to Date.now() so retries of the same delivered event remain idempotent.
 */
export function buildZoomEventKey(payload: any, fallbackId?: string): string {
  if (payload?.eventKey && typeof payload.eventKey === 'string') {
    return payload.eventKey;
  }
  const eventType = payload?.event || 'unknown';
  const obj = payload?.payload?.object || {};
  const objectIdentity = String(obj.uuid || obj.id || 'unknown');
  const stableSuffix =
    payload?.event_ts !== undefined && payload?.event_ts !== null
      ? String(payload.event_ts)
      : fallbackId
        ? String(fallbackId)
        : crypto
            .createHash('sha256')
            .update(
              JSON.stringify({
                eventType,
                id: obj.id,
                uuid: obj.uuid,
                files: Array.isArray(obj.recording_files) ? obj.recording_files.length : 0,
              }),
            )
            .digest('hex')
            .slice(0, 16);

  return `${eventType}:${objectIdentity}:${stableSuffix}`;
}

@Processor('zoom-events', {
  concurrency: 3,
  limiter: {
    max: 10,
    duration: 1000,
  },
  lockDuration: 60000,
  stalledInterval: 30000,
  maxStalledCount: 2,
})
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
    const payload = job.data;
    const eventType = payload?.event;

    if (!eventType) {
      this.logger.warn(`Zoom job [${job.id}] missing event type, skipping.`);
      return { skipped: true, reason: 'missing event type' };
    }

    const eventKey = buildZoomEventKey(payload, job.id ? String(job.id) : undefined);
    this.logger.log(`Processing Zoom event: ${eventType} [eventKey=${eventKey}]`);

    // 1. Pre-check idempotency via WebhookEvent table without marking PROCESSED prematurely
    if ((this.prisma as any).webhookEvent?.findUnique) {
      const existing = await (this.prisma as any).webhookEvent.findUnique({
        where: { eventKey },
      });
      if (existing && existing.status === 'PROCESSED') {
        this.logger.log(`Duplicate webhook event ${eventKey} already processed. Skipping.`);
        return { skipped: true, eventKey };
      }
    }

    try {
      // 2. Execute external side effects FIRST
      if (eventType === 'meeting.ended') {
        await this.handleMeetingEnded(payload.payload?.object);
      } else if (eventType === 'recording.completed') {
        await this.handleRecordingCompleted(payload.payload?.object);
      } else {
        this.logger.warn(`Unhandled Zoom webhook event type: ${eventType}`);
        return { unhandled: true, eventType };
      }

      // 3. Mark webhook PROCESSED only AFTER external side effects complete successfully
      if ((this.prisma as any).webhookEvent?.create) {
        try {
          await (this.prisma as any).webhookEvent.create({
            data: {
              provider: 'ZOOM',
              eventKey,
              payload: {
                event: eventType,
                meetingId: payload?.payload?.object?.id,
                uuid: payload?.payload?.object?.uuid,
              } as any,
              status: 'PROCESSED',
            },
          });
        } catch (err: any) {
          if (err.code === 'P2002') {
            this.logger.log(`Webhook event ${eventKey} already recorded as PROCESSED.`);
            return { skipped: true, eventKey };
          }
          throw err;
        }
      }
    } catch (error: any) {
      this.logger.error(`Failed to process Zoom event ${eventType} [${eventKey}]: ${error.message}`);
      throw error;
    }
  }

  private async handleMeetingEnded(zoomMeeting: any) {
    if (!zoomMeeting?.id) {
      this.logger.warn('Received meeting.ended without meeting ID, skipping.');
      return;
    }
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

    try {
      // 3. D2-032: Fetch participant report and reconcile attendance via AttendanceReconciliationService
      const rawParticipants = await this.zoomService.getParticipantReport(meetingId);
      const participants = Array.isArray(rawParticipants) ? rawParticipants : [];

      const normalizedRecords: NormalizedParticipantRecord[] = participants.map((p) => {
        const email = p.userEmail?.includes('@') ? p.userEmail.trim().toLowerCase() : undefined;
        const name = !p.userEmail?.includes('@') ? p.userEmail?.trim() : undefined;
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
    } catch (error: any) {
      // Rollback attendancePulled claim so BullMQ retry can re-fetch report and reconcile!
      await this.prisma.session
        .updateMany({
          where: { id: session.id },
          data: { attendancePulled: false },
        })
        .catch(() => undefined);
      throw error;
    }
  }

  private async handleRecordingCompleted(zoomMeeting: any) {
    if (!zoomMeeting?.id) {
      this.logger.warn('Received recording.completed without meeting ID, skipping.');
      return;
    }
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
      playUrl = await this.zoomService.getRecordingUrl(meetingId);
    }

    if (playUrl) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: {
          providerRecordingUrl: playUrl,
          recordingUrl: playUrl,
        },
      });
      this.logger.log(`Successfully processed recording.completed for session ${session.id}`);
      await this.sessionsService.triggerMissedSessionNotifications(session.id, playUrl);
    } else {
      this.logger.warn(`No MP4 recording found for Zoom meeting ID: ${meetingId}`);
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error) {
    this.logger.error(
      `[ZoomProcessor] Job ${job?.id} (${job?.data?.event || 'unknown'}) failed on attempt ${job?.attemptsMade}: ${error.message}`,
    );
  }

  @OnWorkerEvent('stalled')
  onStalled(jobId: string) {
    this.logger.warn(`[ZoomProcessor] Job ${jobId} stalled and will be re-evaluated.`);
  }
}
