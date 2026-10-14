import {
  Controller,
  Post,
  Body,
  Headers,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import * as crypto from 'crypto';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';

@Controller('webhooks/google-meet')
export class GoogleMeetWebhookController {
  private readonly logger = new Logger(GoogleMeetWebhookController.name);

  constructor(
    @InjectQueue('meeting-sync') private readonly meetingSyncQueue: Queue,
  ) {}

  @Public()
  @Post()
  async handleGoogleMeetWebhook(
    @Body() body: any,
    @Headers('x-goog-channel-token') channelToken?: string,
    @Headers('x-goog-resource-state') resourceState?: string,
  ) {
    const expectedToken = process.env.GOOGLE_WEBHOOK_SECRET_TOKEN;
    if (expectedToken && channelToken && channelToken !== expectedToken) {
      this.logger.warn('Invalid Google Meet webhook secret token');
      throw new HttpException('Invalid signature', HttpStatus.UNAUTHORIZED);
    }

    this.logger.log(`Received Google Meet webhook event. Resource state: ${resourceState}`);

    // If meeting ended event or notification received, push to queue asynchronously
    if (resourceState === 'exists' || body?.event === 'meeting.ended') {
      await this.meetingSyncQueue.add('SYNC_SESSION_ATTENDANCE', {
        provider: 'GOOGLE_MEET',
        meetingId: body?.meetingId || body?.id,
        payload: body,
      });
    }

    if (body?.event === 'recording.completed') {
      await this.meetingSyncQueue.add('SYNC_SESSION_RECORDING', {
        provider: 'GOOGLE_MEET',
        meetingId: body?.meetingId || body?.id,
        payload: body,
      });
    }

    // Return 200 OK immediately
    return { status: 'acknowledged' };
  }
}
