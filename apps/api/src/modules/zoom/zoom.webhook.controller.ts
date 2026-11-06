import { Controller, Post, Body, Headers, HttpException, HttpStatus, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import * as crypto from 'crypto';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { ZoomMeetingProvider } from './zoom.service.js';
import { ZoomProcessor } from './zoom.processor.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AttendanceReconciliationService } from '../sessions/attendance-reconciliation.service.js';
import { SessionsService } from '../sessions/sessions.service.js';

@Controller('webhooks/zoom')
export class ZoomWebhookController {
  private readonly logger = new Logger(ZoomWebhookController.name);
  private inlineProcessor: ZoomProcessor | null = null;

  constructor(
    @InjectQueue('zoom-events') private readonly zoomQueue: Queue,
    private readonly zoomService: ZoomMeetingProvider,
    @Optional() private readonly prisma?: PrismaService,
    @Optional()
    @Inject(forwardRef(() => AttendanceReconciliationService))
    private readonly reconciliationService?: AttendanceReconciliationService,
    @Optional()
    @Inject(forwardRef(() => SessionsService))
    private readonly sessionsService?: SessionsService,
  ) {
    if (this.prisma && this.reconciliationService && this.sessionsService) {
      this.inlineProcessor = new ZoomProcessor(
        this.zoomService,
        this.prisma,
        this.reconciliationService,
        this.sessionsService,
      );
    }
  }

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

    // Replay attack prevention: timestamp must be within 5 minutes (300 seconds)
    const nowSec = Math.floor(Date.now() / 1000);
    const tsSec = parseInt(timestamp, 10);
    if (isNaN(tsSec) || Math.abs(nowSec - tsSec) > 300) {
      this.logger.warn(`Zoom webhook timestamp expired or out of tolerance: ts=${timestamp}, now=${nowSec}`);
      throw new HttpException('Webhook timestamp expired', HttpStatus.UNAUTHORIZED);
    }

    // Zoom requires validating the signature:
    // message = 'v0' + ':' + request_timestamp + ':' + request_body
    // hash = hmac_sha256(secret_token, message)
    // signature = 'v0=' + hex_encode(hash)
    const message = `v0:${timestamp}:${JSON.stringify(body)}`;
    const hash = crypto.createHmac('sha256', secretToken).update(message).digest('hex');
    const expectedSignature = `v0=${hash}`;

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      this.logger.warn(`Invalid Zoom webhook signature.`);
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

    // Dispatch valid events to BullMQ (or process inline in serverless when WORKER_MODE !== 'true')
    this.logger.log(`Received verified Zoom event: ${body.event}`);

    let queuedToWorker = false;
    if (process.env.WORKER_MODE === 'true' || !this.inlineProcessor) {
      try {
        await this.zoomQueue.add('process-zoom-webhook', body, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        });
        queuedToWorker = process.env.WORKER_MODE === 'true';
      } catch (err: any) {
        this.logger.warn(`BullMQ zoomQueue.add failed (${err.message}); falling back to inline webhook execution.`);
      }
    }

    if (!queuedToWorker && this.inlineProcessor) {
      try {
        await this.inlineProcessor.processPayload(body);
      } catch (err: any) {
        this.logger.error(`Inline Zoom webhook processing error for ${body.event}: ${err.message}`);
      }
    }

    // Return 200 OK immediately as required by Zoom
    return { status: 'success' };
  }
}
