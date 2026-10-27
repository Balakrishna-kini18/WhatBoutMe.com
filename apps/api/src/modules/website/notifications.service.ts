import { Injectable, Logger, Optional, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, IsNotEmpty, IsArray, IsIn, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import webpush from 'web-push';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import { AuditLogService } from '../../common/audit/audit-log.service.js';
import { DeliveryStatus, NotificationChannel, Role } from '@prisma/client';

export class PushSubscriptionKeysDto {
  @IsString()
  @IsNotEmpty()
  p256dh: string;

  @IsString()
  @IsNotEmpty()
  auth: string;
}

export class PushSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  endpoint: string;

  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys: PushSubscriptionKeysDto;

  @IsOptional()
  @IsString()
  userAgent?: string;
}

export class UnsubscribePushDto {
  @IsString()
  @IsNotEmpty()
  endpoint: string;
}

export class BroadcastNotificationDto {
  @IsString()
  @IsIn(['ALL', 'BATCH', 'USER'])
  target: 'ALL' | 'BATCH' | 'USER';

  @IsOptional()
  @IsString()
  targetId?: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsOptional()
  @IsString()
  link?: string;

  @IsArray()
  channels: ('IN_APP' | 'PUSH' | 'EMAIL')[];
}

export class NotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  marketingPush?: boolean;

  @IsOptional()
  @IsBoolean()
  courseUpdates?: boolean;

  @IsOptional()
  @IsBoolean()
  sessionReminders?: boolean;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private vapidKeys: { publicKey: string; privateKey: string };
  private vapidConfigured = false;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly emailService?: EmailService,
    @Optional() private readonly auditService?: AuditLogService,
  ) {
    this.initVapid();
  }

  private initVapid() {
    const envPublic = process.env.VAPID_PUBLIC_KEY;
    const envPrivate = process.env.VAPID_PRIVATE_KEY;
    const envSubject = process.env.VAPID_SUBJECT || 'mailto:notifications@whatboutme.com';

    if (envPublic && envPrivate) {
      this.vapidKeys = {
        publicKey: envPublic,
        privateKey: envPrivate,
      };
      try {
        webpush.setVapidDetails(envSubject, envPublic, envPrivate);
        this.vapidConfigured = true;
        this.logger.log('VAPID configured from environment variables.');
      } catch (err: any) {
        this.logger.warn(`Failed to initialize configured VAPID details: ${err.message}. Falling back to ephemeral keys.`);
        this.fallbackEphemeralVapid(envSubject);
      }
    } else {
      this.fallbackEphemeralVapid(envSubject);
    }
  }

  private fallbackEphemeralVapid(subject: string) {
    try {
      this.vapidKeys = webpush.generateVAPIDKeys();
      webpush.setVapidDetails(subject, this.vapidKeys.publicKey, this.vapidKeys.privateKey);
      this.vapidConfigured = true;
      this.logger.log('VAPID keys not configured in .env. Auto-generated ephemeral development VAPID keys.');
    } catch (err: any) {
      this.vapidConfigured = false;
      this.vapidKeys = { publicKey: '', privateKey: '' };
      this.logger.warn(`Could not initialize Web Push VAPID keys: ${err.message}. Push notifications will fall back gracefully to in-app.`);
    }
  }

  /**
   * Returns public VAPID key for browser subscription.
   */
  getVapidPublicKey(): { publicKey: string } {
    return {
      publicKey: this.vapidKeys?.publicKey || '',
    };
  }

  /**
   * Registers or updates a browser PushSubscription.
   * Can be invoked by authenticated users or anonymous public event visitors.
   */
  async subscribePush(dto: PushSubscriptionDto, userId?: string | null) {
    if (!dto.endpoint || !dto.keys?.p256dh || !dto.keys?.auth) {
      throw new BadRequestException('Invalid push subscription payload');
    }

    try {
      const subscription = await this.prisma.pushSubscription.upsert({
        where: { endpoint: dto.endpoint },
        update: {
          userId: userId || undefined,
          p256dh: dto.keys.p256dh,
          auth: dto.keys.auth,
          userAgent: dto.userAgent || null,
        },
        create: {
          endpoint: dto.endpoint,
          p256dh: dto.keys.p256dh,
          auth: dto.keys.auth,
          userId: userId || null,
          userAgent: dto.userAgent || null,
        },
      });

      return { success: true, subscriptionId: subscription.id };
    } catch (err: any) {
      this.logger.error(`Failed to register push subscription: ${err.message}`);
      throw new BadRequestException('Could not save push subscription');
    }
  }

  /**
   * Removes a push subscription (e.g. when learner opts out in browser).
   */
  async unsubscribePush(endpoint: string) {
    try {
      await this.prisma.pushSubscription.deleteMany({
        where: { endpoint },
      });
      return { success: true };
    } catch (err: any) {
      this.logger.warn(`Failed to unsubscribe push: ${err.message}`);
      return { success: false };
    }
  }

  /**
   * Sends Web Push notification payload to a single subscription.
   * Cleans up expired (404/410) subscriptions automatically.
   */
  async sendPushToSubscription(
    subscription: { id?: string; endpoint: string; p256dh: string; auth: string },
    payload: { title: string; body: string; url?: string; icon?: string; tag?: string },
  ): Promise<boolean> {
    if (!this.vapidConfigured || !subscription.endpoint) {
      return false;
    }

    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        JSON.stringify(payload),
      );
      return true;
    } catch (err: any) {
      const status = err?.statusCode;
      if (status === 404 || status === 410) {
        this.logger.log(`Push subscription expired (${status}), pruning from database: ${subscription.endpoint}`);
        await this.prisma.pushSubscription.deleteMany({
          where: { endpoint: subscription.endpoint },
        }).catch(() => {});
      } else {
        this.logger.warn(`Push dispatch failed for endpoint ${subscription.endpoint}: ${err.message}`);
      }
      return false;
    }
  }

  /**
   * Dispatches push notifications to all registered device tokens for a given user.
   */
  async sendPushToUser(userId: string, payload: { title: string; body: string; url?: string; icon?: string; tag?: string }): Promise<number> {
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId },
    });

    if (subscriptions.length === 0) return 0;

    let successful = 0;
    const promises = subscriptions.map(async (sub) => {
      const ok = await this.sendPushToSubscription(sub, payload);
      if (ok) successful++;
    });

    await Promise.allSettled(promises);
    return successful;
  }

  /**
   * Core in-app notification creator.
   */
  async createInAppNotification(data: {
    userId: string;
    title: string;
    message: string;
    link?: string;
    type: string;
    template?: string;
    channel?: NotificationChannel;
    metadata?: any;
  }) {
    return this.prisma.notification.create({
      data: {
        userId: data.userId,
        title: data.title,
        message: data.message,
        link: data.link,
        type: data.type,
        template: data.template || 'IN_APP_ALERT',
        channel: data.channel || NotificationChannel.IN_APP,
        deliveryStatus: DeliveryStatus.SENT,
        sentAt: new Date(),
        metadata: data.metadata || null,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // AUTOMATED LIFECYCLE TRIGGERS
  // ---------------------------------------------------------------------------

  /**
   * Trigger 1: Live Session Reminder (24h or 1h before)
   */
  async notifySessionReminder(
    session: { id: string; title: string; startTime: Date; joinUrl?: string | null; timezone?: string | null },
    user: { id: string; email: string; name?: string | null; timezone?: string | null },
    timeframe: '24h' | '1h',
  ) {
    const type = `SESSION_REMINDER_${timeframe.toUpperCase()}:${session.id}`;
    const timeframeText = timeframe === '24h' ? '24 hours' : '1 hour';
    const link = session.joinUrl || '/live';

    // 1. In-App Notification
    const notif = await this.createInAppNotification({
      userId: user.id,
      title: `Session Starts in ${timeframeText}`,
      message: `"${session.title}" will begin in ${timeframeText}. Prepare your materials and join on time.`,
      link,
      type,
      template: 'SessionReminderEmail',
      channel: NotificationChannel.BOTH,
    });

    // 2. Browser Push Notification
    await this.sendPushToUser(user.id, {
      title: `Reminder: ${session.title}`,
      body: `Starts in ${timeframeText}. Click to join.`,
      url: link,
      tag: `session-${session.id}`,
    });

    return notif;
  }

  /**
   * Trigger 2: New Step Unlocked
   */
  async notifyStepUnlocked(userId: string, programTitle: string, stepTitle: string, stepNumber: number, stepId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { notificationPreferences: true },
    });

    const prefs = (user?.notificationPreferences as NotificationPreferencesDto) || {};
    if (prefs.courseUpdates === false) return null;

    const link = `/steps/${stepId}`;
    const notif = await this.createInAppNotification({
      userId,
      title: `Step ${stepNumber} Unlocked!`,
      message: `You've unlocked "${stepTitle}" in ${programTitle}. Keep up the momentum!`,
      link,
      type: `STEP_UNLOCKED:${stepId}`,
      template: 'StepUnlockedAlert',
      channel: NotificationChannel.BOTH,
    });

    await this.sendPushToUser(userId, {
      title: `Step ${stepNumber} Unlocked!`,
      body: `"${stepTitle}" in ${programTitle} is now available.`,
      url: link,
      tag: `step-${stepId}`,
    });

    return notif;
  }

  /**
   * Trigger 3: New Event Published
   */
  async notifyEventPublished(event: { id: string; title: string; slug?: string | null }) {
    const activeLearners = await this.prisma.user.findMany({
      where: { role: Role.USER, deletedAt: null },
      select: { id: true, notificationPreferences: true },
      take: 500,
    });

    const link = `/events/${event.id}`;
    let sentCount = 0;

    for (const learner of activeLearners) {
      const prefs = (learner.notificationPreferences as NotificationPreferencesDto) || {};
      if (prefs.marketingPush === false) continue;

      await this.createInAppNotification({
        userId: learner.id,
        title: `New Event: ${event.title}`,
        message: `Registration is now open for ${event.title}. Reserve your seat today.`,
        link,
        type: `EVENT_PUBLISHED:${event.id}`,
        template: 'EventPublishedAlert',
        channel: NotificationChannel.BOTH,
      });

      await this.sendPushToUser(learner.id, {
        title: `New Event Announcement`,
        body: event.title,
        url: link,
        tag: `event-${event.id}`,
      });

      sentCount++;
    }

    return { sentCount };
  }

  /**
   * Trigger 4: Quiz Result
   */
  async notifyQuizResult(userId: string, quizTitle: string, score: number, passed: boolean) {
    const link = '/exams';
    const title = passed ? `Quiz Passed: ${quizTitle} 🎉` : `Quiz Result: ${quizTitle}`;
    const message = passed
      ? `Congratulations! You scored ${score}% and successfully passed the quiz.`
      : `You scored ${score}%. Review your answers and try again to complete this step.`;

    const notif = await this.createInAppNotification({
      userId,
      title,
      message,
      link,
      type: `QUIZ_RESULT:${Date.now()}`,
      template: 'QuizResultAlert',
      channel: NotificationChannel.BOTH,
    });

    await this.sendPushToUser(userId, {
      title,
      body: message,
      url: link,
      tag: 'quiz-result',
    });

    return notif;
  }

  /**
   * Trigger 5: Certificate Issued
   */
  async notifyCertificateIssued(userId: string, programTitle: string, certificateId: string) {
    const link = `/certificates/${certificateId}`;
    const title = `Certificate Issued: ${programTitle} 🎓`;
    const message = `Congratulations! Your verified certificate of completion is ready to view and share.`;

    const notif = await this.createInAppNotification({
      userId,
      title,
      message,
      link,
      type: `CERTIFICATE_ISSUED:${certificateId}`,
      template: 'CertificateIssuedEmail',
      channel: NotificationChannel.BOTH,
    });

    await this.sendPushToUser(userId, {
      title,
      body: message,
      url: link,
      tag: `cert-${certificateId}`,
    });

    return notif;
  }

  // ---------------------------------------------------------------------------
  // ADMIN & MANAGER BROADCAST ANNOUNCEMENT
  // ---------------------------------------------------------------------------

  async broadcast(dto: BroadcastNotificationDto, actorUser: { id: string; role: Role }) {
    if (!dto.title || !dto.message) {
      throw new BadRequestException('Broadcast requires a title and message');
    }
    if (!dto.channels || dto.channels.length === 0) {
      throw new BadRequestException('Select at least one notification channel');
    }

    // Role-Based Access Scope
    if (actorUser.role === Role.MANAGER) {
      if (dto.target === 'ALL') {
        throw new ForbiddenException('Batch Managers cannot broadcast to ALL users. Select an assigned batch.');
      }
      if (dto.target === 'BATCH') {
        if (!dto.targetId) throw new BadRequestException('Batch ID is required');
        const batch = await this.prisma.batch.findUnique({
          where: { id: dto.targetId },
          select: { managerId: true },
        });
        if (!batch || batch.managerId !== actorUser.id) {
          throw new ForbiddenException('You can only broadcast to batches assigned to you');
        }
      }
      if (dto.target === 'USER') {
        if (!dto.targetId) throw new BadRequestException('User ID is required');
        const enrolledInManagerBatch = await this.prisma.enrolment.findFirst({
          where: {
            userId: dto.targetId,
            batch: { managerId: actorUser.id },
          },
        });
        if (!enrolledInManagerBatch) {
          throw new ForbiddenException('You can only broadcast to learners enrolled in your batches');
        }
      }
    }

    // Gather Target Recipients
    let recipients: { id: string; email: string; name: string | null; notificationPreferences: any }[] = [];

    if (dto.target === 'ALL') {
      recipients = await this.prisma.user.findMany({
        where: { role: Role.USER, deletedAt: null },
        select: { id: true, email: true, name: true, notificationPreferences: true },
      });
    } else if (dto.target === 'BATCH') {
      const enrolments = await this.prisma.enrolment.findMany({
        where: { batchId: dto.targetId },
        select: { user: { select: { id: true, email: true, name: true, notificationPreferences: true } } },
      });
      recipients = enrolments.map((e) => e.user);
    } else if (dto.target === 'USER') {
      const user = await this.prisma.user.findUnique({
        where: { id: dto.targetId },
        select: { id: true, email: true, name: true, notificationPreferences: true },
      });
      if (!user) throw new NotFoundException('Target user not found');
      recipients = [user];
    }

    let inAppCount = 0;
    let pushCount = 0;
    let emailCount = 0;

    for (const recipient of recipients) {
      const prefs = (recipient.notificationPreferences as NotificationPreferencesDto) || {};

      // 1. IN_APP Channel
      if (dto.channels.includes('IN_APP')) {
        await this.createInAppNotification({
          userId: recipient.id,
          title: dto.title,
          message: dto.message,
          link: dto.link,
          type: 'BROADCAST_ANNOUNCEMENT',
          template: 'BroadcastAnnouncement',
          channel: NotificationChannel.IN_APP,
        });
        inAppCount++;
      }

      // 2. PUSH Channel (respects marketingPush preference unless targeted directly)
      if (dto.channels.includes('PUSH')) {
        if (dto.target === 'USER' || prefs.marketingPush !== false) {
          const sent = await this.sendPushToUser(recipient.id, {
            title: dto.title,
            body: dto.message,
            url: dto.link || '/',
            tag: `broadcast-${Date.now()}`,
          });
          if (sent > 0) pushCount += sent;
        }
      }

      // 3. EMAIL Channel
      if (dto.channels.includes('EMAIL') && this.emailService) {
        try {
          await this.emailService.sendEmail({
            to: recipient.email,
            subject: dto.title,
            html: `
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#ffffff;border:1px solid #fae8ce;border-radius:12px;">
                <div style="margin-bottom:20px;border-bottom:2px solid #f6ad55;padding-bottom:12px;">
                  <span style="font-size:12px;font-weight:700;color:#c05621;letter-spacing:0.08em;text-transform:uppercase;">WhatBoutMe Announcement</span>
                  <h1 style="font-size:22px;color:#1a202c;margin:8px 0 0;line-height:1.3;">${dto.title}</h1>
                </div>
                <div style="font-size:15px;line-height:1.6;color:#2d3748;white-space:pre-wrap;margin-bottom:24px;">
                  ${dto.message}
                </div>
                ${
                  dto.link
                    ? `<div style="margin:24px 0;"><a href="${dto.link}" style="display:inline-block;background:#e06d28;color:#ffffff;padding:12px 24px;border-radius:8px;font-weight:700;text-decoration:none;font-size:14px;">Open Details</a></div>`
                    : ''
                }
                <hr style="border:none;border-top:1px solid #edf2f7;margin:28px 0 16px;" />
                <p style="font-size:12px;color:#718096;margin:0;">
                  WhatBoutMe FZE • Continuous Healthcare & Clinical Learning
                </p>
              </div>
            `,
            text: `${dto.title}\n\n${dto.message}${dto.link ? `\n\nLink: ${dto.link}` : ''}`,
          });
          emailCount++;
        } catch (err: any) {
          this.logger.warn(`Failed to email broadcast to ${recipient.email}: ${err.message}`);
        }
      }
    }

    // Mandatory Audit Logging
    if (this.auditService) {
      await this.auditService.log(this.prisma, {
        actorId: actorUser.id,
        action: 'NOTIFICATION_BROADCAST',
        entityType: 'Notification',
        entityId: 'broadcast',
        metadata: {
          target: dto.target,
          targetId: dto.targetId || null,
          title: dto.title,
          channels: dto.channels,
          recipientsCount: recipients.length,
          inAppSent: inAppCount,
          pushSent: pushCount,
          emailSent: emailCount,
        },
      });
    }

    return {
      success: true,
      recipientsCount: recipients.length,
      inAppSent: inAppCount,
      pushSent: pushCount,
      emailSent: emailCount,
    };
  }

  // ---------------------------------------------------------------------------
  // LEARNER IN-APP & PREFERENCES API
  // ---------------------------------------------------------------------------

  async getMine(userId: string, limit = 50) {
    return this.prisma.notification.findMany({
      where: {
        userId,
        channel: { in: [NotificationChannel.IN_APP, NotificationChannel.BOTH, NotificationChannel.ALL] },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: {
        userId,
        readAt: null,
        channel: { in: [NotificationChannel.IN_APP, NotificationChannel.BOTH, NotificationChannel.ALL] },
      },
    });
    return { unreadCount: count };
  }

  async markAsRead(userId: string, notificationId: string) {
    return this.prisma.notification.updateMany({
      where: {
        id: notificationId,
        userId,
      },
      data: {
        readAt: new Date(),
      },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: {
        userId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });
  }

  async getPreferences(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { notificationPreferences: true },
    });

    const defaultPrefs: NotificationPreferencesDto = {
      marketingPush: true,
      courseUpdates: true,
      sessionReminders: true,
    };

    return (user?.notificationPreferences as NotificationPreferencesDto) || defaultPrefs;
  }

  async updatePreferences(userId: string, prefs: NotificationPreferencesDto) {
    const current = await this.getPreferences(userId);
    const merged = { ...current, ...prefs };
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        notificationPreferences: merged as any,
      },
      select: {
        id: true,
        notificationPreferences: true,
      },
    });

    return user.notificationPreferences;
  }

  // ---------------------------------------------------------------------------
  // TIMEZONE-AWARE NOTIFICATION & DELIVERY AUDIT LOGS
  // ---------------------------------------------------------------------------

  async getDeliveryLogs(limit = 100) {
    const [notifications, emails] = await Promise.all([
      this.prisma.notification.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, name: true, email: true, timezone: true },
          },
        },
      }),
      this.prisma.emailDeliveryLog.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      notifications: notifications.map((n) => ({
        id: n.id,
        title: n.title || n.type,
        message: n.message,
        recipient: n.user?.email || 'Unknown',
        recipientName: n.user?.name || null,
        userTimezone: n.user?.timezone || 'UTC',
        channel: n.channel,
        deliveryStatus: n.deliveryStatus,
        createdAtUtc: n.createdAt.toISOString(),
        sentAtUtc: n.sentAt ? n.sentAt.toISOString() : null,
        readAtUtc: n.readAt ? n.readAt.toISOString() : null,
      })),
      emails: emails.map((e) => ({
        id: e.id,
        to: e.to,
        subject: e.subject,
        template: e.template,
        status: e.status,
        providerId: e.providerId,
        error: e.error,
        createdAtUtc: e.createdAt.toISOString(),
      })),
    };
  }
}
