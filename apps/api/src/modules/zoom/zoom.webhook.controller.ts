import { Controller, Post, Body, Headers, HttpException, HttpStatus, Logger, Req } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import * as crypto from 'crypto';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { ZoomMeetingProvider } from './zoom.service.js';

@Controller('webhooks/zoom')
export class ZoomWebhookController {
  private readonly logger = new Logger(ZoomWebhookController.name);

  constructor(
    @InjectQueue('zoom-events') private readonly zoomQueue: Queue,
    private readonly zoomService: ZoomMeetingProvider,
  ) {}

  @Public()
  @Post()
  async handleZoomWebhook(
    @Body() body: any,
    @Headers('x-zm-signature') signature: string,
    @Headers('x-zm-request-timestamp') timestamp: string,
  ) {
    if (!signature || !timestamp) {
      throw new HttpException('Missing Zoom signature headers', HttpStatus.UNAUTHORIZED);
    }

    const secretToken = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
    if (!secretToken) {
      this.logger.error('ZOOM_WEBHOOK_SECRET_TOKEN is not configured.');
      throw new HttpException('Webhook configuration error', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    // Zoom requires validating the signature:
    // message = 'v0' + ':' + request_timestamp + ':' + request_body
    // hash = hmac_sha256(secret_token, message)
    // signature = 'v0=' + hex_encode(hash)
    const message = `v0:${timestamp}:${JSON.stringify(body)}`;
    const hash = crypto.createHmac('sha256', secretToken).update(message).digest('hex');
    const expectedSignature = `v0=${hash}`;

    if (signature !== expectedSignature) {
      this.logger.warn(`Invalid Zoom webhook signature. Expected ${expectedSignature}, got ${signature}`);
      throw new HttpException('Invalid signature', HttpStatus.UNAUTHORIZED);
    }

    // D2-033: Challenge validation for Zoom endpoint verification
    if (body.event === 'endpoint.url_validation') {
      this.logger.log('Received Zoom endpoint validation challenge.');
      const plainToken = body.payload.plainToken;
      const encryptedToken = crypto.createHmac('sha256', secretToken).update(plainToken).digest('hex');
      
      return {
        plainToken: plainToken,
        encryptedToken: encryptedToken,
      };
    }

    // Dispatch valid events to BullMQ
    this.logger.log(`Received verified Zoom event: ${body.event}`);
    
    await this.zoomQueue.add('process-zoom-webhook', body, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });

    // Return 200 OK immediately as required by Zoom
    return { status: 'success' };
  }
}
