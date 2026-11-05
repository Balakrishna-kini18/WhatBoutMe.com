import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ExamsService } from '../exams/exams.service.js';
import { SessionLifecycleService } from '../sessions/session-lifecycle.service.js';
import { OutboxDispatcherService } from './outbox-dispatcher.service.js';

export interface RecoverySweepMetrics {
  timestamp: string;
  durationMs: number;
  expiredExamsRecovered: number;
  sessionsActivated: number;
  sessionsCompleted: number;
  reminders24hSent: number;
  reminders1hSent: number;
  reminders10mSent: number;
  outboxDispatched: number;
}

const isWorkerMode = process.env.WORKER_MODE === 'true';
// 6 hours between background recovery sweeps in long-lived worker
const RECOVERY_SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class RecoverySweepService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RecoverySweepService.name);
  private timer: NodeJS.Timeout | null = null;
  private isSweeping = false;
  private lastMetrics: RecoverySweepMetrics | null = null;

  constructor(
    @Inject(forwardRef(() => ExamsService))
    private readonly examsService: ExamsService,
    @Inject(forwardRef(() => SessionLifecycleService))
    private readonly sessionLifecycleService: SessionLifecycleService,
    private readonly outboxDispatcherService: OutboxDispatcherService,
  ) {}

  onModuleInit() {
    // Vercel serverless / HTTP API instances MUST NEVER run recurring recovery intervals
    if (!isWorkerMode) {
      return;
    }

    // Worker mode: run startup recovery sweep after 10s grace
    setTimeout(() => {
      this.runSweep().catch((err) =>
        this.logger.error(`Initial startup recovery sweep failed: ${err.message}`),
      );
    }, 10000);

    // Schedule periodic low-frequency sweep every 6 hours
    this.timer = setInterval(() => {
      this.runSweep().catch((err) =>
        this.logger.error(`Periodic recovery sweep failed: ${err.message}`),
      );
    }, RECOVERY_SWEEP_INTERVAL_MS);
    try {
      this.timer.unref();
    } catch {}

    this.logger.log(`RecoverySweepService initialized in worker mode (interval: 6h)`);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Executes a single, bounded, idempotent recovery sweep across exams, sessions, reminders, and outbox.
   */
  async runSweep(): Promise<RecoverySweepMetrics> {
    if (this.isSweeping) {
      this.logger.warn('Recovery sweep already in progress, skipping overlapping run.');
      return this.lastMetrics || {
        timestamp: new Date().toISOString(),
        durationMs: 0,
        expiredExamsRecovered: 0,
        sessionsActivated: 0,
        sessionsCompleted: 0,
        reminders24hSent: 0,
        reminders1hSent: 0,
        reminders10mSent: 0,
        outboxDispatched: 0,
      };
    }

    this.isSweeping = true;
    const startTime = Date.now();
    this.logger.log('Starting bounded recovery sweep...');

    let expiredExamsRecovered = 0;
    let outboxDispatched = 0;
    let sessionStats = {
      activatedCount: 0,
      completedCount: 0,
      reminders24hSent: 0,
      reminders1hSent: 0,
      reminders10mSent: 0,
    };

    try {
      // 1. Recover expired IN_PROGRESS exams (bounded limit = 50)
      try {
        expiredExamsRecovered = await this.examsService.finalizeExpiredAttempts(50);
      } catch (examErr: any) {
        this.logger.error(`Recovery sweep: exams finalize failed: ${examErr.message}`);
      }

      // 2. Recover overdue sessions and missed reminders
      try {
        sessionStats = await this.sessionLifecycleService.processLifecycleTransitions();
      } catch (sessionErr: any) {
        this.logger.error(`Recovery sweep: session lifecycle transitions failed: ${sessionErr.message}`);
      }

      // 3. Recover stale / unleased outbox events (bounded limit = 50)
      try {
        outboxDispatched = await this.outboxDispatcherService.claimAndDispatchPending(50);
      } catch (outboxErr: any) {
        this.logger.error(`Recovery sweep: outbox dispatch failed: ${outboxErr.message}`);
      }

      const durationMs = Date.now() - startTime;
      const metrics: RecoverySweepMetrics = {
        timestamp: new Date().toISOString(),
        durationMs,
        expiredExamsRecovered,
        sessionsActivated: sessionStats.activatedCount,
        sessionsCompleted: sessionStats.completedCount,
        reminders24hSent: sessionStats.reminders24hSent,
        reminders1hSent: sessionStats.reminders1hSent,
        reminders10mSent: sessionStats.reminders10mSent,
        outboxDispatched,
      };

      this.lastMetrics = metrics;
      this.logger.log(
        `Recovery sweep completed in ${durationMs}ms: exams=${expiredExamsRecovered}, activated=${sessionStats.activatedCount}, completed=${sessionStats.completedCount}, reminders=[24h:${sessionStats.reminders24hSent}, 1h:${sessionStats.reminders1hSent}, 10m:${sessionStats.reminders10mSent}], outbox=${outboxDispatched}`,
      );

      return metrics;
    } finally {
      this.isSweeping = false;
    }
  }

  getLastMetrics(): RecoverySweepMetrics | null {
    return this.lastMetrics;
  }
}

