import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class OutboxDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private intervalId: NodeJS.Timeout;
  private isProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('meeting-sync') private readonly meetingSyncQueue: Queue,
  ) {}

  onModuleInit() {
    // Poll every 30 seconds for outbox events that failed to enqueue or crashed
    this.intervalId = setInterval(() => this.dispatch(), 30000);
    // Initial run
    setTimeout(() => this.dispatch(), 5000);
  }

  onModuleDestroy() {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  async dispatch() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    
    try {
      // Find pending events that might have failed to enqueue (e.g. Redis outage)
      // We only pick up PENDING. FAILED is handled by BullMQ's native retries
      // unless BullMQ also completely lost the job, but let's stick to PENDING
      // and maybe FAILED if we want an ultimate fallback, but BullMQ is durable.
      const events = await this.prisma.outboxEvent.findMany({
        where: {
          status: 'PENDING',
          // Optionally filter by age if we want to give the inline add() time,
          // but idempotency makes immediate pickup safe.
        },
        take: 50,
      });

      for (const event of events) {
        try {
          await this.meetingSyncQueue.add('sync-meeting', {
            outboxId: event.id,
            type: event.action,
            ...(event.payload as any),
          }, {
            jobId: `outbox-${event.id}`, // Enforce unique job in BullMQ to avoid duplicates
          });
        } catch (err: any) {
          this.logger.error(`Failed to enqueue outbox event ${event.id}: ${err.message}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`Outbox dispatcher error: ${err.message}`);
    } finally {
      this.isProcessing = false;
    }
  }
}
