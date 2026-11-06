import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { QueueEvents } from 'bullmq';
import { resolveRedisTlsOptions } from '../../common/redis/redis.service.js';

@Injectable()
export class QueueEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueEventsService.name);
  private readonly queueNames = [
    'email',
    'notification',
    'attendance-import',
    'certificate-gen',
    'certificates',
    'calendar-sync',
    'media-process',
    'invoice-gen',
  ];

  private queueEventsListeners: QueueEvents[] = [];

  getPrefix(): string {
    return `wbm:${process.env.NODE_ENV || 'development'}:queue`;
  }

  onModuleInit() {
    const redisUrl = process.env.REDIS_URL;
    const connection = redisUrl
      ? {
          url: redisUrl,
          tls: resolveRedisTlsOptions(redisUrl),
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
          retryStrategy: (times: number) => Math.min(times * 500, 10000),
        }
      : {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
          password: process.env.REDIS_PASSWORD || undefined,
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
          retryStrategy: (times: number) => Math.min(times * 500, 10000),
        };

    const prefix = this.getPrefix();

    for (const queueName of this.queueNames) {
      const queueEvents = new QueueEvents(queueName, {
        connection,
        prefix,
      } as any);

      queueEvents.on('failed', ({ jobId, failedReason }) => {
        const message = `[DEAD-LETTER] Job ${jobId} in queue "${queueName}" completely failed: ${failedReason}`;
        this.logger.error(message);
        console.error(message);
      });

      queueEvents.on('error', (error) => {
        const prefixMsg = `[QUEUE-ERROR] Queue "${queueName}" encountered an internal error:`;
        this.logger.error(`${prefixMsg} ${error?.message || error}`);
        console.error(prefixMsg, error);
      });

      this.queueEventsListeners.push(queueEvents);
    }

    this.logger.log(
      `Registered global dead-letter listeners for ${this.queueNames.length} queues (prefix: ${prefix}).`,
    );
  }

  async onModuleDestroy() {
    for (const listener of this.queueEventsListeners) {
      await listener.close();
    }
    this.queueEventsListeners = [];
  }
}
