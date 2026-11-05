import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailService } from './email.service.js';
import { EmailProcessor } from './email.processor.js';
import { renderEmailTemplate } from './template-renderer.js';

describe('Email Service & Notifications (R-55)', () => {
  let emailService: EmailService;
  let emailProcessor: EmailProcessor;
  let prismaMock: any;
  let queueMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.DISABLE_EMAIL_QUEUE;

    prismaMock = {
      emailDeliveryLog: {
        create: vi.fn().mockImplementation(async ({ data }: any) => ({
          id: 'log-uuid-1',
          ...data,
        })),
        update: vi.fn().mockResolvedValue({ id: 'log-uuid-1', status: 'DELIVERED' }),
      },
    };

    queueMock = {
      add: vi.fn().mockResolvedValue({ id: 'job-1' }),
    };

    emailService = new EmailService(prismaMock as any, queueMock as any);
    emailProcessor = new EmailProcessor(emailService);
  });

  describe('Template Rendering', () => {
    it('successfully renders PasswordResetEmail template to HTML', async () => {
      const html = await renderEmailTemplate('PasswordResetEmail', {
        firstName: 'Alice',
        resetUrl: 'https://whatboutme.com/reset-password?token=secret123',
      });

      expect(html).toContain('Reset Your Password');
      expect(html).toContain('Alice');
      expect(html).toContain('reset-password?token=secret123');
      expect(html).toContain('1 hour');
    });

    it('successfully renders OneTimeOtpEmail template to HTML', async () => {
      const html = await renderEmailTemplate('OneTimeOtpEmail', {
        code: '849201',
      });

      expect(html).toContain('849201');
    });

    it('successfully renders CertificateIssuedEmail template to HTML', async () => {
      const html = await renderEmailTemplate('CertificateIssuedEmail', {
        firstName: 'Bob Smith',
        programName: '11 Steps to You',
        issueDate: 'October 15, 2026',
        certificateUrl: 'https://whatboutme.com/certificates/download/123',
        verificationUrl: 'https://whatboutme.com/certificates/verify/WBM-123',
      });

      expect(html).toContain('Bob Smith');
      expect(html).toContain('11 Steps to You');
      expect(html).toContain('certificates/verify/WBM-123');
    });
  });

  describe('Delivery & Audit Logging', () => {
    it('creates EmailDeliveryLog record and logs mock delivery in development', async () => {
      const res = await emailService.sendEmail({
        to: 'recipient@example.com',
        subject: 'Welcome to WhatBoutMe',
        html: '<p>Welcome!</p>',
      });

      expect(res.id).toBeDefined();
      expect(prismaMock.emailDeliveryLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          to: 'recipient@example.com',
          subject: 'Welcome to WhatBoutMe',
          status: 'QUEUED',
        }),
      });

      expect(prismaMock.emailDeliveryLog.update).toHaveBeenCalledWith({
        where: { id: 'log-uuid-1' },
        data: expect.objectContaining({
          status: 'DELIVERED',
        }),
      });
    });
  });

  describe('Queue Processing, API Producer Enqueueing & Retries', () => {
    it('enqueues template emails to BullMQ from both API producer (WORKER_MODE=false) and worker processes', async () => {
      const originalWorkerMode = process.env.WORKER_MODE;
      process.env.WORKER_MODE = 'false';

      const apiRes = await emailService.sendTemplateEmail({
        to: 'learner@example.com',
        subject: 'Reset Password',
        template: 'PasswordResetEmail',
        props: { firstName: 'Charlie', resetUrl: 'https://whatboutme.com/reset' },
        idempotencyKey: 'reset:learner-1',
      });

      expect(apiRes.jobId).toBe('job-1');
      expect(queueMock.add).toHaveBeenCalledWith(
        'send-email',
        expect.objectContaining({
          to: 'learner@example.com',
          template: 'PasswordResetEmail',
        }),
        expect.objectContaining({
          jobId: 'email:reset:learner-1',
          removeOnComplete: { count: 100, age: 86400 },
          removeOnFail: { count: 500, age: 604800 },
        }),
      );

      process.env.WORKER_MODE = 'true';
      const workerRes = await emailService.sendTemplateEmail({
        to: 'learner2@example.com',
        subject: 'OTP',
        template: 'OneTimeOtpEmail',
        props: { code: '123456' },
      });
      expect(workerRes.jobId).toBe('job-1');
      expect(queueMock.add).toHaveBeenCalledTimes(2);

      process.env.WORKER_MODE = originalWorkerMode;
    });

    it('falls back to direct delivery when emailQueue.add fails during Redis outage', async () => {
      queueMock.add.mockRejectedValueOnce(new Error('Redis connection refused'));

      const res = await emailService.sendTemplateEmail({
        to: 'fallback@example.com',
        subject: 'Fallback OTP',
        template: 'OneTimeOtpEmail',
        props: { code: '999888' },
      });

      expect(res.id).toBe('log-uuid-1');
      expect(prismaMock.emailDeliveryLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          to: 'fallback@example.com',
          status: 'QUEUED',
        }),
      });
    });

    it('EmailProcessor renders template and executes emailService delivery', async () => {
      const jobMock: any = {
        id: 'job-789',
        name: 'send-email',
        data: {
          to: 'learner@example.com',
          subject: 'Reset Password',
          template: 'PasswordResetEmail',
          props: { firstName: 'Charlie', resetUrl: 'https://whatboutme.com/reset' },
        },
      };

      const result = await emailProcessor.process(jobMock);
      expect(result).toBeDefined();
      expect(prismaMock.emailDeliveryLog.create).toHaveBeenCalled();
    });

    it('EmailProcessor re-throws error to trigger BullMQ retry on delivery failure', async () => {
      vi.spyOn(emailService, 'sendEmail').mockRejectedValueOnce(
        new Error('Simulated delivery failure'),
      );

      const jobMock: any = {
        id: 'job-fail',
        name: 'send-email',
        data: {
          to: 'fail@example.com',
          subject: 'Fail Test',
          template: 'OneTimeOtpEmail',
          props: { code: '111111' },
        },
      };

      await expect(emailProcessor.process(jobMock)).rejects.toThrow(
        'Simulated delivery failure',
      );
    });
  });
});
