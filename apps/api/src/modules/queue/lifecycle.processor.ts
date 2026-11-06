import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { ExamsService } from '../exams/exams.service.js';
import { SessionLifecycleService } from '../sessions/session-lifecycle.service.js';

@Processor('lifecycle', {
  concurrency: 5,
  lockDuration: 30000,
  stalledInterval: 30000,
  maxStalledCount: 2,
})
export class LifecycleProcessor extends WorkerHost {
  private readonly logger = new Logger(LifecycleProcessor.name);

  constructor(
    @Inject(forwardRef(() => ExamsService))
    private readonly examsService: ExamsService,
    @Inject(forwardRef(() => SessionLifecycleService))
    private readonly sessionLifecycleService: SessionLifecycleService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const jobName = job.name;
    const data = job.data;
    this.logger.log(`Processing lifecycle job: ${jobName} [ID: ${job.id}]`);

    switch (jobName) {
      case 'finalize-exam': {
        const attemptId = data?.attemptId;
        if (!attemptId) {
          this.logger.warn(`finalize-exam job [${job.id}] missing attemptId, skipping.`);
          return { skipped: true, reason: 'missing attemptId' };
        }
        const finalized = await this.examsService.finalizeExpiredAttempt(attemptId);
        return { finalized, attemptId };
      }

      case 'activate-session': {
        const sessionId = data?.sessionId;
        const version = data?.version;
        if (!sessionId) {
          this.logger.warn(`activate-session job [${job.id}] missing sessionId, skipping.`);
          return { skipped: true, reason: 'missing sessionId' };
        }
        const activated = await this.sessionLifecycleService.activateSession(sessionId, version);
        return { activated, sessionId };
      }

      case 'complete-session': {
        const sessionId = data?.sessionId;
        const version = data?.version;
        if (!sessionId) {
          this.logger.warn(`complete-session job [${job.id}] missing sessionId, skipping.`);
          return { skipped: true, reason: 'missing sessionId' };
        }
        const completed = await this.sessionLifecycleService.completeSession(sessionId, version);
        return { completed, sessionId };
      }

      case 'session-reminder-24h':
      case 'session-reminder-1h':
      case 'session-reminder-10m': {
        const sessionId = data?.sessionId;
        const version = data?.version ?? 1;
        const timeframe =
          jobName === 'session-reminder-24h'
            ? '24 hours'
            : jobName === 'session-reminder-1h'
              ? '1 hour'
              : '10 minutes';

        if (!sessionId) {
          this.logger.warn(`${jobName} job [${job.id}] missing sessionId, skipping.`);
          return { skipped: true, reason: 'missing sessionId' };
        }

        const sentCount = await this.sessionLifecycleService.sendSessionReminder(
          sessionId,
          version,
          timeframe,
        );
        return { sentCount, sessionId, timeframe };
      }

      default: {
        this.logger.warn(`Unknown lifecycle job name: ${jobName}`);
        return { unhandled: true, jobName };
      }
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error) {
    this.logger.error(
      `[LifecycleProcessor] Job ${job?.id} (${job?.name}) failed on attempt ${job?.attemptsMade}: ${error.message}`,
    );
  }

  @OnWorkerEvent('stalled')
  onStalled(jobId: string) {
    this.logger.warn(`[LifecycleProcessor] Job ${jobId} stalled and will be re-evaluated.`);
  }
}
