import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger, Inject, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MEETING_PROVIDER } from '../../common/interfaces/meeting-provider.interface.js';

@Processor('meeting-sync', {
  concurrency: 3,
  limiter: {
    max: 10,
    duration: 1000,
  },
  lockDuration: 60000,
  stalledInterval: 30000,
  maxStalledCount: 2,
})
export class MeetingSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(MeetingSyncProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(MEETING_PROVIDER) private readonly meetingProvider: any,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const jobName = job.name;
    const { outboxId, type, sessionId, providerMeetingId, meetingId, payload } = job.data || {};
    const effectiveType =
      jobName === 'SYNC_SESSION_ATTENDANCE' || jobName === 'SYNC_SESSION_RECORDING'
        ? jobName
        : type;

    // Route webhook-originated Google Meet / provider sync jobs that do not use outboxId
    if (
      effectiveType === 'SYNC_SESSION_ATTENDANCE' ||
      effectiveType === 'SYNC_SESSION_RECORDING'
    ) {
      return this.handleWebhookSyncJob(effectiveType, {
        meetingId: meetingId || providerMeetingId,
        sessionId,
        payload,
      });
    }

    this.logger.log(
      `Processing meeting sync [${effectiveType}] for session ${sessionId || providerMeetingId}`,
    );

    if (!this.meetingProvider) {
      this.logger.warn('Meeting provider is not configured. Skipping sync.');
      return;
    }

    if (!outboxId) {
      this.logger.warn('Job missing outboxId. Cannot ensure idempotency. Failing.');
      throw new Error('Missing outboxId in job data');
    }

    // 1. Idempotency Check
    const outbox = await this.prisma.outboxEvent.findUnique({ where: { id: outboxId } });
    if (!outbox) {
      this.logger.warn(`Outbox event ${outboxId} not found. Skipping.`);
      return;
    }

    if (outbox.status === 'COMPLETED') {
      this.logger.log(`Outbox event ${outboxId} already completed. Skipping (idempotent).`);
      return;
    }

    // 2. Mark Processing with 5-minute lease lock and single attempt increment per execution
    await this.prisma.outboxEvent.update({
      where: { id: outboxId },
      data: {
        status: 'PROCESSING',
        leasedUntil: new Date(Date.now() + 5 * 60 * 1000),
        attempts: { increment: 1 },
      },
    });

    try {
      switch (effectiveType) {
        case 'CREATE':
          await this.handleCreate(sessionId, outbox);
          break;
        case 'UPDATE':
          await this.handleUpdate(sessionId, payload);
          break;
        case 'CANCEL':
          await this.handleCancel(providerMeetingId);
          break;
        default:
          this.logger.warn(`Unknown meeting sync type: ${effectiveType}`);
          // Terminal failure: unknown job type must not stay permanently stuck in PROCESSING
          await this.prisma.outboxEvent.update({
            where: { id: outboxId },
            data: {
              status: 'FAILED',
              lastError: `Unknown meeting sync type: ${effectiveType}`,
              error: `Unknown meeting sync type: ${effectiveType}`,
              leasedUntil: null,
              nextAttemptAt: null,
              attempts: 999,
            },
          });
          return;
      }

      // 3. Mark Completed with completion timestamp and cleared lease
      await this.prisma.outboxEvent.update({
        where: { id: outboxId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          leasedUntil: null,
        },
      });
    } catch (error: any) {
      // 4. Mark Failed for retry with exponential backoff nextAttemptAt and cleared lease
      const currentAttempts = (outbox.attempts || 0) + 1;
      const isTerminal = currentAttempts >= 5;
      const backoffMs = Math.min(15000 * Math.pow(2, currentAttempts), 3600000); // Max 1hr backoff
      this.logger.error(`Meeting sync failed for outbox ${outboxId}: ${error.message}`);
      await this.prisma.outboxEvent.update({
        where: { id: outboxId },
        data: {
          status: 'FAILED',
          error: error.message || 'Unknown error',
          lastError: error.message || 'Unknown error',
          leasedUntil: null,
          nextAttemptAt: isTerminal ? null : new Date(Date.now() + backoffMs),
        },
      });
      throw error; // Let BullMQ handle retry schedule
    }
  }

  /**
   * Handles webhook-originated Google Meet / provider attendance and recording sync jobs
   * without requiring an OutboxEvent row.
   */
  private async handleWebhookSyncJob(
    syncType: 'SYNC_SESSION_ATTENDANCE' | 'SYNC_SESSION_RECORDING',
    data: { meetingId?: string; sessionId?: string; payload?: any },
  ) {
    const targetMeetingId = data.meetingId ? String(data.meetingId) : undefined;
    if (!targetMeetingId && !data.sessionId) {
      this.logger.warn(`${syncType} job missing meetingId and sessionId, skipping.`);
      return { skipped: true, reason: 'missing meetingId' };
    }

    const session =
      targetMeetingId && typeof (this.prisma.session as any).findFirst === 'function'
        ? await (this.prisma.session as any).findFirst({
            where: { providerMeetingId: targetMeetingId },
          })
        : data.sessionId
          ? await this.prisma.session.findUnique({ where: { id: data.sessionId } })
          : null;

    if (!session) {
      this.logger.warn(
        `${syncType}: No session found matching meetingId=${targetMeetingId || data.sessionId}, skipping.`,
      );
      return { skipped: true, reason: 'session not found' };
    }

    if (syncType === 'SYNC_SESSION_ATTENDANCE') {
      if (session.attendancePulled) {
        this.logger.log(`Attendance already pulled for session ${session.id}, skipping.`);
        return { skipped: true, sessionId: session.id };
      }

      if (this.meetingProvider && typeof this.meetingProvider.getParticipantReport === 'function') {
        await this.meetingProvider.getParticipantReport(
          targetMeetingId || session.providerMeetingId,
        );
      }

      await this.prisma.session.update({
        where: { id: session.id },
        data: {
          attendancePulled: true,
          status: 'COMPLETED' as any,
        },
      });

      this.logger.log(`Completed ${syncType} for session ${session.id}`);
      return { synced: true, sessionId: session.id, type: syncType };
    }

    // SYNC_SESSION_RECORDING
    let recordingUrl =
      data.payload?.recordingUrl ||
      data.payload?.play_url ||
      data.payload?.playUrl ||
      null;

    if (
      !recordingUrl &&
      this.meetingProvider &&
      typeof this.meetingProvider.getRecordingUrl === 'function'
    ) {
      recordingUrl = await this.meetingProvider.getRecordingUrl(
        targetMeetingId || session.providerMeetingId,
      );
    }

    if (recordingUrl) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: {
          providerRecordingUrl: recordingUrl,
          recordingUrl,
        },
      });
      this.logger.log(`Updated recordingUrl via ${syncType} for session ${session.id}`);
    }

    return { synced: true, sessionId: session.id, recordingUrl, type: syncType };
  }

  private async handleCreate(sessionId: string, outbox: any) {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) {
      throw new Error(`Session ${sessionId} not found.`);
    }

    // Skip if already has a meeting link or manually configured
    if (session.joinUrl || session.meetingProvider !== 'ZOOM') {
      this.logger.log(`Session ${sessionId} already has a meeting link or uses manual provider.`);
      return;
    }

    let zoomMeetingId = outbox.providerId;
    let joinUrl = null;
    let hostUrl = null;

    if (!zoomMeetingId) {
      // 1. External Call
      const durationMin = Math.round(
        (session.endTime.getTime() - session.startTime.getTime()) / 60000,
      );
      const meetingDetails = await this.meetingProvider.createMeeting({
        topic: session.title,
        startTime: session.startTime,
        durationMinutes: durationMin,
        timezone: session.timezone || 'UTC',
        referenceId: outbox.id,
      });

      zoomMeetingId = meetingDetails.id;
      joinUrl = meetingDetails.joinUrl;
      hostUrl = meetingDetails.startUrl;

      // 2. Save external ID durably BEFORE updating session
      await this.prisma.outboxEvent.update({
        where: { id: outbox.id },
        data: {
          providerId: zoomMeetingId,
          payload: { ...((outbox.payload as any) || {}), joinUrl, hostUrl },
        },
      });
    } else {
      const payload: any = outbox.payload || {};
      joinUrl = payload.joinUrl || null;
      hostUrl = payload.hostUrl || null;
    }

    // 3. Update application state
    await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        joinUrl: joinUrl,
        hostUrl: hostUrl,
        providerMeetingId: zoomMeetingId,
        zoomMeetingId: zoomMeetingId,
      },
    });
    this.logger.log(`Successfully created meeting for session ${sessionId}`);
  }

  private async handleUpdate(sessionId: string, payload: any) {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || !session.providerMeetingId) {
      this.logger.warn(`Session ${sessionId} not found or missing provider ID. Skipping update.`);
      return;
    }

    await this.meetingProvider.updateMeeting(session.providerMeetingId, payload);
    this.logger.log(`Successfully updated meeting for session ${sessionId}`);
  }

  private async handleCancel(providerMeetingId: string) {
    try {
      await this.meetingProvider.cancelMeeting(providerMeetingId);
      this.logger.log(`Successfully cancelled meeting ${providerMeetingId}`);
    } catch (error: any) {
      if (error.message?.includes('Not Found') || error.status === 404) {
        this.logger.log(`Meeting ${providerMeetingId} already deleted from provider.`);
        return;
      }
      throw error;
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error) {
    this.logger.error(
      `[MeetingSyncProcessor] Job ${job?.id} (${job?.name}) failed on attempt ${job?.attemptsMade}: ${error.message}`,
    );
  }

  @OnWorkerEvent('stalled')
  onStalled(jobId: string) {
    this.logger.warn(`[MeetingSyncProcessor] Job ${jobId} stalled and will be re-evaluated.`);
  }
}
