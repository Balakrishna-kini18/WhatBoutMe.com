import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { PrismaService } from '../../prisma/prisma.service.js';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class EmailService {
  private readonly resend: Resend;
  private readonly defaultSender = process.env.NODE_ENV === 'production'
    ? 'WhatBoutMe <no-reply@whatboutme.com>'
    : 'WhatBoutMe <onboarding@resend.dev>';
  private readonly logger = new Logger(EmailService.name);
  private readonly isMockMode: boolean;

  constructor(private readonly prisma: PrismaService) {
    // Determine mock mode: if KEY is empty or explicitly 'mock'
    this.isMockMode = !process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 'mock';
    this.resend = new Resend(process.env.RESEND_API_KEY || 're_development_dummy_key');
    
    if (this.isMockMode) {
      this.logger.warn('RESEND_API_KEY is not set. Emails will be logged locally (.email-debug/) instead of being sent.');
    }
  }

  /**
   * Send an email via Resend and log it to DB
   */
  async sendEmail(options: {
    to: string | string[];
    subject: string;
    template?: string;
    html?: string;
    text?: string;
    replyTo?: string;
    from?: string;
  }) {
    const toAddress = Array.isArray(options.to) ? options.to.join(', ') : options.to;
    
    // 1. Create the EmailDeliveryLog record
    const logRecord = await this.prisma.emailDeliveryLog.create({
      data: {
        to: toAddress,
        subject: options.subject,
        template: options.template,
        status: 'QUEUED',
        html: this.isMockMode ? options.html : undefined, // Only store HTML if in dev/mock mode
      }
    });

    try {
      if (this.isMockMode) {
        // Fallback mock logger for local dev
        this.logger.log(`[MOCK EMAIL] To: ${toAddress} | Subject: ${options.subject}`);
        const debugDir = path.join(process.cwd(), '.email-debug');
        await fs.mkdir(debugDir, { recursive: true }).catch(() => {});
        const filePath = path.join(debugDir, `${logRecord.id}.html`);
        await fs.writeFile(filePath, options.html || options.text || '');
        this.logger.log(`[MOCK EMAIL] HTML saved to: ${filePath}`);

        await this.prisma.emailDeliveryLog.update({
          where: { id: logRecord.id },
          data: { status: 'DELIVERED', providerId: 'mock-id' },
        });
        return { id: 'mock-id' };
      }

      // 2. Dispatch via Resend SDK
      const { data, error } = await this.resend.emails.send({
        from: options.from || this.defaultSender,
        to: Array.isArray(options.to) ? options.to : [options.to],
        subject: options.subject,
        html: options.html || '', 
        text: options.text,
        replyTo: options.replyTo,
      });

      if (error) {
        await this.prisma.emailDeliveryLog.update({
          where: { id: logRecord.id },
          data: { status: 'FAILED', error: error.message },
        });
        this.logger.error(`Resend API rejected email to ${toAddress}:`, error);
        throw new Error(error.message);
      }

      // 3. Mark SENT
      await this.prisma.emailDeliveryLog.update({
        where: { id: logRecord.id },
        data: { status: 'SENT', providerId: data?.id },
      });

      this.logger.log(`Email dispatched successfully to ${toAddress}. Resend ID: ${data?.id}`);
      return data;
    } catch (err: any) {
      await this.prisma.emailDeliveryLog.update({
        where: { id: logRecord.id },
        data: { status: 'FAILED', error: err.message },
      });
      this.logger.error(`Unhandled exception while sending email to ${toAddress}`, err);
      throw err;
    }
  }
}
