import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ZoomMeetingProvider } from './zoom.service.js';
import { ZoomWebhookController } from './zoom.webhook.controller.js';
import { ZoomProcessor } from './zoom.processor.js';
import { PrismaModule } from '../../prisma/prisma.module.js';

const isWorkerMode = process.env.WORKER_MODE === 'true';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({
      name: 'zoom-events',
    }),
  ],
  controllers: [ZoomWebhookController],
  providers: [
    ZoomMeetingProvider,
    ...(isWorkerMode ? [ZoomProcessor] : []),
  ],
  exports: [ZoomMeetingProvider],
})
export class ZoomModule {}
