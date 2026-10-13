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
import { PaymentSuccessEmail } from './templates/lms/PaymentSuccessEmail.js';
import { LeadEnquiryNotificationEmail } from './templates/lms/LeadEnquiryNotificationEmail.js';

export async function renderEmailTemplate(template: string, props: any): Promise<string> {
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
    case 'PaymentSuccessEmail':
      templateComponent = React.createElement(PaymentSuccessEmail, props);
      break;
    case 'LeadEnquiryNotificationEmail':
      templateComponent = React.createElement(LeadEnquiryNotificationEmail, props);
      break;
    default:
      throw new Error(`Unknown email template: ${template}`);
  }

  return render(templateComponent);
}
