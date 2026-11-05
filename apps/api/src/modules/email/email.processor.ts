import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger, Injectable } from '@nestjs/common';
import { EmailService } from './email.service.js';
import { renderEmailTemplate } from './template-renderer.js';

export interface SendEmailJobData {
  to: string | string[];
  subject: string;
  template: string;
  props: any;
  replyTo?: string;
  from?: string;
}

@Processor('email', {
  concurrency: 5,
  limiter: {
    max: 20,
    duration: 1000,
  },
  lockDuration: 60000,
  stalledInterval: 30000,
  maxStalledCount: 2,
})
@Injectable()
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly emailService: EmailService) {
    super();
  }

  async process(job: Job<SendEmailJobData, any, string>): Promise<any> {
    if (job.name && job.name !== 'send-email') {
      this.logger.warn(`Unsupported email job type "${job.name}" [jobId=${job.id}], skipping.`);
      return { skipped: true, reason: `Unsupported job type: ${job.name}` };
    }

    const { to, subject, template, props, replyTo, from } = job.data || ({} as SendEmailJobData);
    if (!to || !template) {
      this.logger.warn(`Email job ${job.id} missing recipient or template, skipping.`);
      return { skipped: true, reason: 'Missing recipient or template' };
    }

    this.logger.log(`Processing email job ${job.id} using template: ${template}`);

    try {
      const html = await renderEmailTemplate(template, props);

      const result = await this.emailService.sendEmail({
        to,
        subject,
        template,
        html,
        replyTo,
        from,
      });

      this.logger.log(`Email job ${job.id} completed. Delivery ID: ${result?.id}`);
      return result;
    } catch (error: any) {
      this.logger.error(`Failed to process email job ${job.id}: ${error?.message || error}`);
      throw error; // Re-throw so BullMQ catches the failure and schedules retry
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error) {
    this.logger.error(
      `[EmailProcessor] Job ${job?.id} (${job?.data?.template || 'unknown'}) failed on attempt ${job?.attemptsMade}: ${error.message}`,
    );
  }

  @OnWorkerEvent('stalled')
  onStalled(jobId: string) {
    this.logger.warn(`[EmailProcessor] Job ${jobId} stalled and will be re-evaluated.`);
  }
}
