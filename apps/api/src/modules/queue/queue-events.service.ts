import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { QueueEvents } from 'bullmq';

@Injectable()
export class QueueEventsService implements OnModuleInit, OnModuleDestroy {
  private queueNames = [
    'email',
    'notification',
    'attendance-import',
    'certificate-gen',
    'calendar-sync',
    'media-process',
    'invoice-gen',
  ];
  
  private queueEventsListeners: QueueEvents[] = [];

  onModuleInit() {
    const connection = process.env.REDIS_URL 
      ? {
          url: process.env.REDIS_URL,
          tls: process.env.REDIS_URL.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
        }
      : {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
          password: process.env.REDIS_PASSWORD || undefined,
        };

    for (const queueName of this.queueNames) {
      const queueEvents = new QueueEvents(queueName, { connection } as any);

      queueEvents.on('failed', ({ jobId, failedReason }) => {
        // D2-022: Configure dead-letter handling, failed job event listeners
        console.error(`[DEAD-LETTER] Job ${jobId} in queue "${queueName}" completely failed: ${failedReason}`);
        
        // TODO: Once Sentry is installed (D2-044), route this explicitly to Sentry
        // Sentry.captureException(new Error(failedReason), {
        //   tags: { queue: queueName },
        //   extra: { jobId, failedReason },
        // });
      });

      queueEvents.on('error', (error) => {
        console.error(`[QUEUE-ERROR] Queue "${queueName}" encountered an internal error:`, error);
      });

      this.queueEventsListeners.push(queueEvents);
    }
    
    console.log(`Registered global dead-letter listeners for ${this.queueNames.length} queues.`);
  }

  async onModuleDestroy() {
    for (const listener of this.queueEventsListeners) {
      await listener.close();
    }
  }
}
