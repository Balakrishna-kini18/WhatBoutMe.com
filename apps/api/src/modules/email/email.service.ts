import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../../prisma/prisma.service.js';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class EmailService {
  private readonly transporter: nodemailer.Transporter | null = null;
  private readonly defaultSender = process.env.NODE_ENV === 'production'
    ? 'WhatBoutMe <no-reply@whatboutme.com>'
    : 'WhatBoutMe <no-reply@example.com>';
  private readonly logger = new Logger(EmailService.name);
  private readonly isMockMode: boolean;

  constructor(private readonly prisma: PrismaService) {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    // Determine mock mode: if SMTP_HOST is empty or explicitly 'mock'
    this.isMockMode = !host || host === 'mock';
    
    if (this.isMockMode) {
      this.logger.warn('SMTP_HOST is not set. Emails will be logged locally (.email-debug/) instead of being sent.');
    } else {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465, // true for 465, false for other ports
        auth: {
          user,
          pass,
        },
      });
    }
  }

  /**
   * Send an email via Nodemailer and log it to DB
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
      if (this.isMockMode || !this.transporter) {
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

      // 2. Dispatch via Nodemailer SDK
      const info = await this.transporter.sendMail({
        from: options.from || this.defaultSender,
        to: toAddress,
        subject: options.subject,
        html: options.html || '', 
        text: options.text,
        replyTo: options.replyTo,
      });

      // 3. Mark SENT
      await this.prisma.emailDeliveryLog.update({
        where: { id: logRecord.id },
        data: { status: 'SENT', providerId: info.messageId },
      });

      this.logger.log(`Email dispatched successfully to ${toAddress}. Message ID: ${info.messageId}`);
      return { id: info.messageId };
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
