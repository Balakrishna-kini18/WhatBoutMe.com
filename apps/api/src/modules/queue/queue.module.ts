import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueEventsService } from './queue-events.service.js';
import { OutboxDispatcherService } from './outbox-dispatcher.service.js';

const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,
  },
};

@Global()
@Module({
  imports: [
    // D2-018: Configure BullModule.forRoot() strictly via Redis TCP/RESP
    BullModule.forRoot({
      connection: process.env.REDIS_URL 
        ? {
            url: process.env.REDIS_URL,
            tls: process.env.REDIS_URL.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
            retryStrategy: (times: number) => Math.min(times * 200, 5000),
          }
        : {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379', 10),
            password: process.env.REDIS_PASSWORD || undefined,
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
          },
      defaultJobOptions,
    }),
    // D2-019: Register all required queues with exponential backoff defaults
    BullModule.registerQueue(
      { name: 'email' },
      { name: 'notification' },
      { name: 'attendance-import' },
      { name: 'certificate-gen' },
      { name: 'calendar-sync' },
      { name: 'media-process' },
      { name: 'invoice-gen' },
      { name: 'meeting-sync' },
    ),
  ],
  providers: [QueueEventsService, OutboxDispatcherService],
  exports: [BullModule, QueueEventsService, OutboxDispatcherService],
})
export class QueueModule {}
