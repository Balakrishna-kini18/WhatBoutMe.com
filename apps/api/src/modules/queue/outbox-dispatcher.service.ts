import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class OutboxDispatcherService {
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private isProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('meeting-sync') private readonly meetingSyncQueue: Queue,
  ) {}

  /**
   * Backwards compatible entrypoint: claims and dispatches pending events without polling loops.
   */
  async dispatch(): Promise<number> {
    return this.claimAndDispatchPending(50);
  }

  /**
   * Atomically claims eligible PENDING, stale PROCESSING, and retryable FAILED outbox events
   * using a lease lock, then enqueues them into BullMQ with deterministic job IDs.
   * Multi-worker safe: updateMany condition on leasedUntil guarantees exactly one worker wins.
   * Note: attempts is incremented by MeetingSyncProcessor when actual processing starts (or here
   * only if BullMQ enqueue itself fails), preventing double-counting of a single attempt.
   */
  async claimAndDispatchPending(limit = 50): Promise<number> {
    if (this.isProcessing) return 0;
    this.isProcessing = true;

    try {
      const now = new Date();
      const leaseDurationMs = 5 * 60 * 1000; // 5 minute worker lease
      const leaseUntil = new Date(now.getTime() + leaseDurationMs);
      const MAX_ATTEMPTS = 5;

      const candidates = await this.prisma.outboxEvent.findMany({
        where: {
          attempts: { lt: MAX_ATTEMPTS },
          OR: [
            {
              status: 'PENDING',
              OR: [{ leasedUntil: null }, { leasedUntil: { lte: now } }],
              AND: [
                {
                  OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
                },
              ],
            },
            {
              status: 'PROCESSING',
              leasedUntil: { lte: now },
            },
            {
              status: 'FAILED',
              OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
            },
          ],
        },
        take: limit,
        select: {
          id: true,
          action: true,
          status: true,
          payload: true,
        },
      });

      if (candidates.length === 0) {
        return 0;
      }

      let dispatchedCount = 0;

      for (const event of candidates) {
        // Atomic lease claim: only succeeds if row is still in the candidate status and unleased
        const claimResult = await this.prisma.outboxEvent.updateMany({
          where: {
            id: event.id,
            status: event.status,
            attempts: { lt: MAX_ATTEMPTS },
            OR: [{ leasedUntil: null }, { leasedUntil: { lte: now } }],
          },
          data: {
            status: 'PENDING',
            leasedUntil: leaseUntil,
            enqueuedAt: now,
          },
        });

        if (claimResult.count === 0) {
          // Another concurrent worker claimed this row first
          continue;
        }

        try {
          await this.meetingSyncQueue.add(
            'sync-meeting',
            {
              outboxId: event.id,
              type: event.action,
              ...(event.payload as any),
            },
            {
              jobId: `outbox-${event.id}`, // Deterministic job ID prevents duplicate BullMQ jobs
              removeOnComplete: { count: 100, age: 86400 },
              removeOnFail: { count: 200, age: 7 * 86400 },
            },
          );
          dispatchedCount++;
        } catch (queueErr: any) {
          this.logger.error(`Failed to enqueue outbox event ${event.id}: ${queueErr.message}`);
          // Release lease on immediate enqueue failure and increment attempts so backoff progresses
          await this.prisma.outboxEvent
            .update({
              where: { id: event.id },
              data: {
                status: 'FAILED',
                leasedUntil: null,
                attempts: { increment: 1 },
                lastError: queueErr.message,
                error: queueErr.message,
                nextAttemptAt: new Date(Date.now() + 15000),
              },
            })
            .catch(() => null);
        }
      }

      if (dispatchedCount > 0) {
        this.logger.log(
          `Atomically claimed and dispatched ${dispatchedCount} outbox events to BullMQ`,
        );
      }

      return dispatchedCount;
    } catch (err: any) {
      this.logger.error(`Outbox claim and dispatch error: ${err.message}`);
      return 0;
    } finally {
      this.isProcessing = false;
    }
  }
}
