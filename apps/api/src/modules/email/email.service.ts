import { Injectable, Logger, Optional } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../../prisma/prisma.service.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { renderEmailTemplate } from './template-renderer.js';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  template?: string;
  html?: string;
  text?: string;
  replyTo?: string;
  from?: string;
  attachments?: Array<{
    filename: string;
    content?: any;
    path?: string;
    contentType?: string;
  }>;
}

export interface SendTemplateEmailOptions {
  to: string | string[];
  subject: string;
  template: string;
  props: any;
  replyTo?: string;
  from?: string;
  idempotencyKey?: string;
}

@Injectable()
export class EmailService {
  private readonly transporter: nodemailer.Transporter | null = null;
  private readonly defaultSender: string;
  private readonly logger = new Logger(EmailService.name);
  private readonly isMockMode: boolean;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @InjectQueue('email') private readonly emailQueue?: Queue,
  ) {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const secureEnv = process.env.SMTP_SECURE;
    const isSecure = secureEnv !== undefined ? secureEnv === 'true' : port === 465;

    this.defaultSender =
      process.env.SMTP_FROM ||
      (user
        ? `WhatBoutMe <${user}>`
        : process.env.NODE_ENV === 'production'
          ? 'WhatBoutMe <no-reply@whatboutme.com>'
          : 'WhatBoutMe <no-reply@example.com>');

    // Determine mock mode: if SMTP_HOST is empty, explicitly 'mock', or credentials missing
    this.isMockMode = !host || host === 'mock' || !user || !pass;

    if (this.isMockMode) {
      this.logger.warn(
        'SMTP credentials not fully configured or set to mock. Emails will be logged locally (.email-debug/) instead of being sent over the network.',
      );
    } else {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: isSecure, // false for port 587 (uses STARTTLS), true for 465 (SSL)
        auth: {
          user,
          pass,
        },
        pool: true,
        maxConnections: 3,
        maxMessages: 100,
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 20000,
        tls: {
          rejectUnauthorized: process.env.NODE_ENV === 'production',
        },
      });
      this.logger.log(`Nodemailer initialized with host: ${host}, port: ${port}, secure: ${isSecure}`);
    }
  }

  /**
   * Verify SMTP Transporter connection
   */
  async verifyConnection(): Promise<{ success: boolean; message: string }> {
    if (this.isMockMode || !this.transporter) {
      return { success: false, message: 'EmailService is operating in Mock mode (SMTP credentials unset or mock)' };
    }
    try {
      await this.transporter.verify();
      return { success: true, message: 'SMTP connection verified successfully' };
    } catch (err: any) {
      this.logger.error('SMTP verification failed:', err);
      return { success: false, message: err?.message || 'SMTP verification failed' };
    }
  }

  /**
   * Send a template email. Queues via BullMQ when the email queue is configured/available
   * (from both API producer and worker processes), or falls back to direct render & delivery
   * if Redis/BullMQ is unavailable or disabled.
   */
  async sendTemplateEmail(options: SendTemplateEmailOptions): Promise<{ id?: string; jobId?: string }> {
    const isQueueDisabled = process.env.DISABLE_EMAIL_QUEUE === 'true';
    const isRedisConfigured = Boolean(
      process.env.REDIS_URL ||
        process.env.REDIS_HOST ||
        process.env.WORKER_MODE === 'true' ||
        (this.emailQueue && !(this.emailQueue as any).opts),
    );

    if (!isQueueDisabled && this.emailQueue && isRedisConfigured) {
      try {
        const jobOptions: Record<string, any> = {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: { count: 100, age: 86400 },
          removeOnFail: { count: 500, age: 7 * 86400 },
        };
        if (options.idempotencyKey) {
          jobOptions.jobId = `email:${options.idempotencyKey}`;
        }

        const job = await this.emailQueue.add(
          'send-email',
          {
            to: options.to,
            subject: options.subject,
            template: options.template,
            props: options.props,
            replyTo: options.replyTo,
            from: options.from,
          },
          jobOptions,
        );
        this.logger.log(`Enqueued email job ${job.id} (${options.template})`);
        return { jobId: job.id };
      } catch (err: any) {
        this.logger.warn(
          `Failed to enqueue email (${options.template}) to BullMQ, falling back to direct delivery: ${err.message}`,
        );
      }
    }

    // Direct render & send fallback
    const html = await renderEmailTemplate(options.template, options.props);
    return this.sendEmail({
      to: options.to,
      subject: options.subject,
      template: options.template,
      html,
      replyTo: options.replyTo,
      from: options.from,
    });
  }

  /**
   * Send an email via Nodemailer and log it to DB (or local debug folder in mock mode)
   */
  async sendEmail(options: SendEmailOptions): Promise<{ id: string }> {
    const toAddress = Array.isArray(options.to) ? options.to.join(', ') : options.to;

    // 1. Create the EmailDeliveryLog record
    let logRecord: any = null;
    try {
      logRecord = await this.prisma.emailDeliveryLog.create({
        data: {
          to: toAddress,
          subject: options.subject,
          template: options.template,
          status: 'QUEUED',
          html: this.isMockMode ? options.html : undefined, // Only store HTML if in dev/mock mode
        },
      });
    } catch (e: any) {
      this.logger.warn(`Could not persist emailDeliveryLog: ${e.message}`);
    }

    try {
      if (this.isMockMode || !this.transporter) {
        // Fallback mock logger for local dev
        this.logger.log(`[MOCK EMAIL] Subject: ${options.subject}`);
        const debugDir = path.join(process.cwd(), '.email-debug');
        await fs.mkdir(debugDir, { recursive: true }).catch(() => {});
        const fileName = logRecord?.id ? `${logRecord.id}.html` : `mock-${Date.now()}.html`;
        const filePath = path.join(debugDir, fileName);
        await fs.writeFile(filePath, options.html || options.text || '');
        this.logger.log(`[MOCK EMAIL] HTML saved to: ${filePath}`);

        if (logRecord?.id) {
          await this.prisma.emailDeliveryLog
            .update({
              where: { id: logRecord.id },
              data: { status: 'DELIVERED', providerId: 'mock-id' },
            })
            .catch(() => {});
        }
        return { id: logRecord?.id || 'mock-id' };
      }

      // 2. Dispatch via Nodemailer SDK
      let info: any;
      try {
        info = await this.transporter.sendMail({
          from: options.from || this.defaultSender,
          to: toAddress,
          subject: options.subject,
          html: options.html || '',
          text: options.text,
          replyTo: options.replyTo,
          attachments: options.attachments,
        });
      } catch (firstErr: any) {
        const errMsg = String(firstErr?.message || '');
        const isConnOrTimeout = /greeting|timeout|timedout|econnrefused|econnreset|etimedout|closed|handshake/i.test(errMsg);
        const host = process.env.SMTP_HOST;
        const port = parseInt(process.env.SMTP_PORT || '587', 10);
        const user = process.env.SMTP_USER;
        const pass = process.env.SMTP_PASS;

        if (isConnOrTimeout && host && user && pass) {
          const alternatePort = port === 465 ? 587 : 465;
          const alternateSecure = alternatePort === 465;
          this.logger.warn(
            `Primary SMTP dispatch failed (${errMsg}) on port ${port}. Retrying via alternate port ${alternatePort}...`,
          );
          const fallbackTransporter = nodemailer.createTransport({
            host,
            port: alternatePort,
            secure: alternateSecure,
            auth: { user, pass },
            connectionTimeout: 15000,
            greetingTimeout: 15000,
            socketTimeout: 20000,
            tls: {
              rejectUnauthorized: process.env.NODE_ENV === 'production',
            },
          });
          info = await fallbackTransporter.sendMail({
            from: options.from || this.defaultSender,
            to: toAddress,
            subject: options.subject,
            html: options.html || '',
            text: options.text,
            replyTo: options.replyTo,
          });
          this.logger.log(`Fallback port ${alternatePort} delivery succeeded`);
        } else {
          throw firstErr;
        }
      }

      // 3. Mark SENT
      if (logRecord?.id) {
        await this.prisma.emailDeliveryLog
          .update({
            where: { id: logRecord.id },
            data: { status: 'SENT', providerId: info.messageId },
          })
          .catch(() => {});
      }

      this.logger.log(`Email dispatched successfully. Message ID: ${info.messageId}`);
      return { id: info.messageId };
    } catch (err: any) {
      if (logRecord?.id) {
        await this.prisma.emailDeliveryLog
          .update({
            where: { id: logRecord.id },
            data: { status: 'FAILED', error: err.message },
          })
          .catch(() => {});
      }
      this.logger.error(`Unhandled exception while sending email: ${err?.message || err}`);
      throw err;
    }
  }
}
