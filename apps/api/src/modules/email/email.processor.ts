import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger, Injectable } from '@nestjs/common';
import { EmailService } from './email.service.js';
import { renderEmailTemplate } from './template-renderer.js';

export interface SendEmailJobData {
  to: string | string[];
  subject: string;
  template: string; 
  props: any;
}

@Processor('email')
@Injectable()
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly emailService: EmailService) {
    super();
  }

  async process(job: Job<SendEmailJobData, any, string>): Promise<any> {
    this.logger.log(`Processing email job ${job.id} for ${job.data.to} using template: ${job.data.template}`);

    const { to, subject, template, props } = job.data;

    try {
      // Render React component to HTML string asynchronously
      const html = await renderEmailTemplate(template, props);
      
      const result = await this.emailService.sendEmail({
        to,
        subject,
        template,
        html,
      });
      
      this.logger.log(`Email job ${job.id} completed. Delivery ID: ${result?.id}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to process email job ${job.id}:`, error);
      throw error; // Re-throw so BullMQ catches the failure and schedules retry
    }
  }
}
