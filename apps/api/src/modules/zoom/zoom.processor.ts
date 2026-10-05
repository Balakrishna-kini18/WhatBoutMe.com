import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { ZoomMeetingProvider } from './zoom.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

@Processor('zoom-events')
export class ZoomProcessor extends WorkerHost {
  private readonly logger = new Logger(ZoomProcessor.name);

  constructor(
    private readonly zoomService: ZoomMeetingProvider,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const payload = job.data;
    const eventType = payload.event;
    
    this.logger.log(`Processing Zoom event: ${eventType}`);

    try {
      if (eventType === 'meeting.ended') {
        await this.handleMeetingEnded(payload.payload.object);
      } else if (eventType === 'recording.completed') {
        await this.handleRecordingCompleted(payload.payload.object);
      }
    } catch (error: any) {
      this.logger.error(`Failed to process Zoom event ${eventType}: ${error.message}`);
      throw error;
    }
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

    // 2. Mark session as completed
    await this.prisma.session.update({
      where: { id: session.id },
      data: { status: 'COMPLETED' },
    });

    // 3. D2-032: Fetch participant report and mark attendance
    const participants = await this.zoomService.getParticipantReport(meetingId);
    
    for (const p of participants) {
      // Find the user by email
      const user = await this.prisma.user.findUnique({
        where: { email: p.userEmail },
      });

      if (user) {
        // Find their enrolment in this batch
        const enrolment = await this.prisma.enrolment.findUnique({
          where: {
            userId_batchId: {
              userId: user.id,
              batchId: session.batchId,
            }
          }
        });

        if (enrolment) {
          // Record attendance
          await this.prisma.attendance.create({
            data: {
              enrolmentId: enrolment.id,
              sessionId: session.id,
              status: 'PRESENT_AUTO',
              joinTime: p.joinTime,
              leaveTime: p.leaveTime,
              durationMinutes: p.durationMinutes,
            }
          });
        }
      }
    }

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
    } else {
      this.logger.warn(`No MP4 recording found for Zoom meeting ID: ${meetingId}`);
    }
  }
}
