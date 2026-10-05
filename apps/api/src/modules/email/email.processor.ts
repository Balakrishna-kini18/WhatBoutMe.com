import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger, Injectable } from '@nestjs/common';
import { EmailService } from './email.service.js';
import { render } from '@react-email/render';
import * as React from 'react';

import { SignupWelcomeEmail } from './templates/auth/SignupWelcomeEmail.js';
import { EmailVerificationEmail } from './templates/auth/EmailVerificationEmail.js';
import { PasswordResetEmail } from './templates/auth/PasswordResetEmail.js';
import { OneTimeOtpEmail } from './templates/auth/OneTimeOtpEmail.js';
import { EnrolmentConfirmedEmail } from './templates/lms/EnrolmentConfirmedEmail.js';
import { AgreementSignedConfirmationEmail } from './templates/lms/AgreementSignedConfirmationEmail.js';
import { SessionBookingConfirmationEmail } from './templates/lms/SessionBookingConfirmationEmail.js';
import { SessionReminderEmail } from './templates/lms/SessionReminderEmail.js';
import { SessionCancelledEmail } from './templates/lms/SessionCancelledEmail.js';
import { SessionRescheduledEmail } from './templates/lms/SessionRescheduledEmail.js';
import { OralAssessmentResultEmail } from './templates/lms/OralAssessmentResultEmail.js';
import { CertificateIssuedEmail } from './templates/lms/CertificateIssuedEmail.js';

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
    let templateComponent: React.ReactElement | null = null;

    switch (template) {
      case 'SignupWelcomeEmail':
        templateComponent = React.createElement(SignupWelcomeEmail, props);
        break;
      case 'EmailVerificationEmail':
        templateComponent = React.createElement(EmailVerificationEmail, props);
        break;
      case 'PasswordResetEmail':
        templateComponent = React.createElement(PasswordResetEmail, props);
        break;
      case 'OneTimeOtpEmail':
        templateComponent = React.createElement(OneTimeOtpEmail, props);
        break;
      case 'EnrolmentConfirmedEmail':
        templateComponent = React.createElement(EnrolmentConfirmedEmail, props);
        break;
      case 'AgreementSignedConfirmationEmail':
        templateComponent = React.createElement(AgreementSignedConfirmationEmail, props);
        break;
      case 'SessionBookingConfirmationEmail':
        templateComponent = React.createElement(SessionBookingConfirmationEmail, props);
        break;
      case 'SessionReminderEmail':
        templateComponent = React.createElement(SessionReminderEmail, props);
        break;
      case 'SessionCancelledEmail':
        templateComponent = React.createElement(SessionCancelledEmail, props);
        break;
      case 'SessionRescheduledEmail':
        templateComponent = React.createElement(SessionRescheduledEmail, props);
        break;
      case 'OralAssessmentResultEmail':
        templateComponent = React.createElement(OralAssessmentResultEmail, props);
        break;
      case 'CertificateIssuedEmail':
        templateComponent = React.createElement(CertificateIssuedEmail, props);
        break;
      default:
        throw new Error(`Unknown email template: ${template}`);
    }

    try {
      // Render React component to HTML string asynchronously (required by modern react-email)
      const html = await render(templateComponent);
      
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
