import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotificationsService, PushSubscriptionDto, BroadcastNotificationDto } from './notifications.service.js';
import { NotificationsController } from './notifications.controller.js';
import { DeliveryStatus, NotificationChannel, Role } from '@prisma/client';

describe('NotificationsService & Controller (Task 13: Push & In-App Bell)', () => {
  let service: NotificationsService;
  let controller: NotificationsController;
  let prismaMock: any;
  let emailServiceMock: any;
  let auditServiceMock: any;

  beforeEach(() => {
    prismaMock = {
      pushSubscription: {
        upsert: vi.fn().mockImplementation(({ create, update }) => ({
          id: 'sub-1',
          ...create,
          ...update,
        })),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      notification: {
        create: vi.fn().mockImplementation(({ data }) => ({
          id: 'notif-1',
          createdAt: new Date(),
          ...data,
        })),
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'notif-1',
            title: 'Welcome to WhatBoutMe',
            message: 'Your course has started.',
            channel: NotificationChannel.IN_APP,
            deliveryStatus: DeliveryStatus.SENT,
            createdAt: new Date(),
            user: { name: 'Dr. Jane Doe', email: 'jane@example.com', timezone: 'Asia/Dubai' },
          },
        ]),
        count: vi.fn().mockResolvedValue(3),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      emailDeliveryLog: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'email-log-1',
            to: 'jane@example.com',
            subject: 'Important Announcement',
            status: DeliveryStatus.DELIVERED,
            createdAt: new Date(),
          },
        ]),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user-1',
          email: 'jane@example.com',
          name: 'Jane Doe',
          notificationPreferences: { marketingPush: true, courseUpdates: true, sessionReminders: true },
        }),
        findMany: vi.fn().mockResolvedValue([
          { id: 'user-1', email: 'jane@example.com', name: 'Jane Doe', notificationPreferences: null },
        ]),
        update: vi.fn().mockImplementation(({ data }) => ({
          id: 'user-1',
          notificationPreferences: data.notificationPreferences,
        })),
      },
      batch: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'batch-1',
          managerId: 'mgr-1',
        }),
      },
      enrolment: {
        findMany: vi.fn().mockResolvedValue([
          { user: { id: 'user-1', email: 'jane@example.com', name: 'Jane Doe', notificationPreferences: null } },
        ]),
        findFirst: vi.fn().mockResolvedValue({ id: 'enrol-1' }),
      },
    };

    emailServiceMock = {
      sendEmail: vi.fn().mockResolvedValue({ id: 'mock-mail-id' }),
    };

    auditServiceMock = {
      log: vi.fn().mockResolvedValue({ id: 'audit-1' }),
    };

    service = new NotificationsService(prismaMock, emailServiceMock, auditServiceMock);
    controller = new NotificationsController(service);
  });

  describe('1. VAPID Keys & Push Subscription Token Registration', () => {
    it('returns a public VAPID key (either configured or ephemeral fallback) without throwing', () => {
      const res = controller.getVapidPublicKey();
      expect(res).toBeDefined();
      expect(typeof res.publicKey).toBe('string');
      expect(res.publicKey.length).toBeGreaterThan(10);
    });

    it('registers or updates a browser PushSubscription linked to an authenticated user', async () => {
      const dto: PushSubscriptionDto = {
        endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/gAAAAAB...',
        keys: {
          p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9AcFY3Xn2RZo00GBfZ02T_bMv7ub90PWQWjKA6qdmiKZtY',
          auth: 'tBHItJI5svbpez7KI4CCXg',
        },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      };

      const result = await controller.subscribePush(dto, { user: { sub: 'user-1' } });
      expect(result.success).toBe(true);
      expect(prismaMock.pushSubscription.upsert).toHaveBeenCalledWith({
        where: { endpoint: dto.endpoint },
        update: expect.objectContaining({
          userId: 'user-1',
          p256dh: dto.keys.p256dh,
          auth: dto.keys.auth,
        }),
        create: expect.objectContaining({
          endpoint: dto.endpoint,
          userId: 'user-1',
        }),
      });
    });

    it('allows anonymous public event visitors to subscribe to push notifications without userId', async () => {
      const dto: PushSubscriptionDto = {
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
        keys: {
          p256dh: 'p256_mock_key',
          auth: 'auth_mock_key',
        },
      };

      const result = await controller.subscribePush(dto, { user: null });
      expect(result.success).toBe(true);
      expect(prismaMock.pushSubscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            userId: null,
          }),
        }),
      );
    });

    it('unsubscribes push token on opt-out', async () => {
      const result = await controller.unsubscribePush({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc123' });
      expect(result.success).toBe(true);
      expect(prismaMock.pushSubscription.deleteMany).toHaveBeenCalled();
    });
  });

  describe('2. Automated Triggers & In-App Bell', () => {
    it('creates in-app and push notification when a step is unlocked', async () => {
      const notif = await service.notifyStepUnlocked('user-1', 'GCP Mastery', 'Clinical Trial Phases', 2, 'step-2');
      expect(notif).toBeDefined();
      expect(prismaMock.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          title: 'Step 2 Unlocked!',
          link: '/steps/step-2',
          channel: NotificationChannel.BOTH,
        }),
      });
    });

    it('creates in-app and push notification when quiz result is recorded', async () => {
      const notif = await service.notifyQuizResult('user-1', 'ICH-GCP Final Exam', 95, true);
      expect(notif).toBeDefined();
      expect(prismaMock.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          title: expect.stringContaining('Quiz Passed'),
        }),
      });
    });

    it('returns unread count for the topbar bell', async () => {
      const res = await controller.getUnreadCount({ user: { sub: 'user-1' } });
      expect(res.unreadCount).toBe(3);
    });

    it('marks all notifications as read', async () => {
      await controller.markAllRead({ user: { sub: 'user-1' } });
      expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', readAt: null },
        data: { readAt: expect.any(Date) },
      });
    });
  });

  describe('3. Admin & Manager Announcements Broadcast with Audit Logging', () => {
    it('allows Admin to broadcast announcement to ALL users and creates immutable audit log', async () => {
      const broadcastDto: BroadcastNotificationDto = {
        target: 'ALL',
        title: 'Platform Maintenance Notice',
        message: 'System upgrade scheduled for Saturday at 02:00 UTC.',
        link: '/updates',
        channels: ['IN_APP', 'EMAIL', 'PUSH'],
      };

      const result = await controller.broadcast({ user: { sub: 'admin-1', role: Role.ADMIN } }, broadcastDto);
      expect(result.success).toBe(true);
      expect(result.recipientsCount).toBe(1);
      expect(result.inAppSent).toBe(1);
      expect(result.emailSent).toBe(1);

      // Verify Audit Log
      expect(auditServiceMock.log).toHaveBeenCalledWith(prismaMock, {
        actorId: 'admin-1',
        action: 'NOTIFICATION_BROADCAST',
        entityType: 'Notification',
        entityId: 'broadcast',
        metadata: expect.objectContaining({
          target: 'ALL',
          title: 'Platform Maintenance Notice',
          channels: ['IN_APP', 'EMAIL', 'PUSH'],
        }),
      });
    });

    it('blocks Batch Manager from broadcasting to ALL users (scope enforcement)', async () => {
      const broadcastDto: BroadcastNotificationDto = {
        target: 'ALL',
        title: 'Unauthorized Global Broadcast',
        message: 'Test message',
        channels: ['IN_APP'],
      };

      await expect(
        controller.broadcast({ user: { sub: 'mgr-1', role: Role.MANAGER } }, broadcastDto),
      ).rejects.toThrow('Batch Managers cannot broadcast to ALL users');
    });

    it('allows Batch Manager to broadcast to their assigned batch', async () => {
      const broadcastDto: BroadcastNotificationDto = {
        target: 'BATCH',
        targetId: 'batch-1',
        title: 'Class Prep',
        message: 'Please review module 3 before tomorrow.',
        channels: ['IN_APP', 'EMAIL'],
      };

      const result = await controller.broadcast({ user: { sub: 'mgr-1', role: Role.MANAGER } }, broadcastDto);
      expect(result.success).toBe(true);
      expect(prismaMock.batch.findUnique).toHaveBeenCalledWith({ where: { id: 'batch-1' }, select: { managerId: true } });
    });
  });

  describe('4. Notification Preferences & Delivery Audit Logs', () => {
    it('fetches and updates learner notification preferences', async () => {
      const prefs = await controller.getPreferences({ user: { sub: 'user-1' } });
      expect(prefs.marketingPush).toBe(true);

      await controller.updatePreferences({ user: { sub: 'user-1' } }, {
        marketingPush: false,
        courseUpdates: true,
        sessionReminders: true,
      });

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          notificationPreferences: {
            marketingPush: false,
            courseUpdates: true,
            sessionReminders: true,
          },
        },
        select: { id: true, notificationPreferences: true },
      });
    });

    it('fetches unified timezone-aware delivery logs for staff inspection', async () => {
      const logs = await controller.getDeliveryLogs();
      expect(logs.notifications.length).toBe(1);
      expect(logs.notifications[0].recipient).toBe('jane@example.com');
      expect(logs.notifications[0].userTimezone).toBe('Asia/Dubai');
      expect(logs.emails.length).toBe(1);
      expect(logs.emails[0].status).toBe(DeliveryStatus.DELIVERED);
    });
  });
});
