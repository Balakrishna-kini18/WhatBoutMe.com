import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger, Inject, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MEETING_PROVIDER } from '../../common/interfaces/meeting-provider.interface.js';

@Processor('meeting-sync')
export class MeetingSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(MeetingSyncProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(MEETING_PROVIDER) private readonly meetingProvider: any,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { outboxId, type, sessionId, providerMeetingId, payload } = job.data;
    
    this.logger.log(`Processing meeting sync [${type}] for session ${sessionId || providerMeetingId}`);

    if (!this.meetingProvider) {
      this.logger.warn('Meeting provider is not configured. Skipping sync.');
      return;
    }

    if (!outboxId) {
      this.logger.warn(`Job missing outboxId. Cannot ensure idempotency. Failing.`);
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

    // 2. Mark Processing
    await this.prisma.outboxEvent.update({
      where: { id: outboxId },
      data: { status: 'PROCESSING', attempts: { increment: 1 } },
    });

    try {
      switch (type) {
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
          this.logger.warn(`Unknown meeting sync type: ${type}`);
          return; // Don't throw, just ignore unknown types
      }

      // 3. Mark Completed
      await this.prisma.outboxEvent.update({
        where: { id: outboxId },
        data: { status: 'COMPLETED' },
      });
    } catch (error: any) {
      // 4. Mark Failed for retry
      this.logger.error(`Meeting sync failed for outbox ${outboxId}: ${error.message}`);
      await this.prisma.outboxEvent.update({
        where: { id: outboxId },
        data: { status: 'FAILED', error: error.message || 'Unknown error' },
      });
      throw error; // Let BullMQ handle retry schedule
    }
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
      const durationMin = Math.round((session.endTime.getTime() - session.startTime.getTime()) / 60000);
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
      // This ensures that if the next step fails, a retry won't create a second Zoom meeting.
      // We also save the join/host URLs in the payload for recovery in case of a crash.
      await this.prisma.outboxEvent.update({
        where: { id: outbox.id },
        data: { 
          providerId: zoomMeetingId,
          payload: { ...((outbox.payload as any) || {}), joinUrl, hostUrl }
        },
      });
    } else {
      // Recover URLs from payload if available (to avoid needing an extra GET to Zoom)
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
        zoomMeetingId: zoomMeetingId, // Keep backward compatibility for now
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
      // If it's a 404 Not Found from Zoom, it's safe to swallow since it's already gone.
      if (error.message?.includes('Not Found') || error.status === 404) {
        this.logger.log(`Meeting ${providerMeetingId} already deleted from provider.`);
        return;
      }
      throw error;
    }
  }
}
