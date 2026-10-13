import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { MessagesController } from './messages.controller.js';

describe('High-Scale Architecture & Stress Edge Cases: MessagesController', () => {
  let controller: MessagesController;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      conversation: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      message: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
        updateMany: vi.fn(),
        groupBy: vi.fn(),
        count: vi.fn(),
      },
      user: {
        findMany: vi.fn(),
      },
      enrolment: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      notification: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    controller = new MessagesController(prismaMock as any);
  });

  describe('1. N+1 Query Elimination Under 10,000+ Concurrent Staff Inboxes', () => {
    it('collapses unread counts across all conversations into 1 single batched groupBy query', async () => {
      // Simulate an admin with 100 active conversations
      const mockConversations = Array.from({ length: 100 }, (_, i) => ({
        id: `conv-${i}`,
        participantIds: ['admin-1', `learner-${i}`],
        messages: [{ content: `Last msg ${i}`, createdAt: new Date(), senderId: `learner-${i}`, read: false, attachmentUrl: null }],
      }));

      prismaMock.conversation.findMany.mockResolvedValue(mockConversations);
      prismaMock.message.groupBy.mockResolvedValue([
        { conversationId: 'conv-0', _count: { id: 5 } },
        { conversationId: 'conv-1', _count: { id: 2 } },
      ]);
      prismaMock.user.findMany.mockResolvedValue([
        { id: 'admin-1', name: 'Admin One', email: 'admin@test.com', role: Role.ADMIN },
        ...Array.from({ length: 100 }, (_, i) => ({
          id: `learner-${i}`,
          name: `Learner ${i}`,
          email: `learner${i}@test.com`,
          role: Role.USER,
        })),
      ]);

      const req = { user: { id: 'admin-1', role: Role.ADMIN } };
      const result = await controller.conversations(req);

      expect(result).toHaveLength(100);
      // Verify prisma.message.groupBy was called exactly ONCE (not 100 times!)
      expect(prismaMock.message.groupBy).toHaveBeenCalledTimes(1);
      expect(prismaMock.message.count).not.toHaveBeenCalled();
      expect(result[0].unread).toBe(5);
      expect(result[1].unread).toBe(2);
      expect(result[2].unread).toBe(0);
    });
  });

  describe('2. Memory Leak Prevention & LRU Eviction Under 100,000 Users', () => {
    it('bounds tracked conversations and evicts oldest entries to prevent heap memory exhaustion', async () => {
      const tracker = (controller as any).typingTracker;

      // Simulate 12,000 conversations sending typing pulses
      for (let i = 0; i < 12000; i++) {
        tracker.setTyping(`conv-test-${i}`, `user-${i}`, `User ${i}`, true);
      }

      // Memory must be strictly bounded <= 10,000 entries
      const mapSize = (tracker as any).map.size;
      expect(mapSize).toBeLessThanOrEqual(10000);
    });

    it('automatically purges expired typing users and cleans up empty conversations', () => {
      const tracker = (controller as any).typingTracker;

      // Insert typing user
      tracker.setTyping('conv-sweep', 'user-exp', 'Test User', true);

      // Force expiration
      const convMap = (tracker as any).map.get('conv-sweep');
      convMap.get('user-exp').expiresAt = Date.now() - 5000;

      // Calling getTypingUsers or sweepExpired cleans it up
      const typingUsers = tracker.getTypingUsers('conv-sweep', 'other-user');
      expect(typingUsers).toEqual([]);
      expect((tracker as any).map.has('conv-sweep')).toBe(false);
    });
  });

  describe('3. Message Windowing & Pagination Edge Case', () => {
    it('caps message fetch limit to prevent loading unbounded history into memory', async () => {
      prismaMock.conversation.findUnique.mockResolvedValue({
        id: 'conv-huge',
        participantIds: ['user-1', 'admin-1'],
      });
      prismaMock.message.findFirst.mockResolvedValue(null); // No unread messages
      prismaMock.message.findMany.mockResolvedValue([
        { id: 'm-1', senderId: 'user-1', content: 'Hello', read: true, createdAt: new Date(), attachmentUrl: null, sender: { name: 'User 1' } },
      ]);

      const req = { user: { id: 'user-1', role: Role.USER } };
      // Request limit of 5000 (abusive request)
      await controller.messages('conv-huge', '5000', '', req);

      // Must be clamped to max 200
      expect(prismaMock.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 200,
          orderBy: { createdAt: 'desc' },
        })
      );
    });
  });

  describe('4. Write-Lock Contention Reduction on Polling', () => {
    it('skips updateMany write lock when zero unread messages exist during polling', async () => {
      prismaMock.conversation.findUnique.mockResolvedValue({
        id: 'conv-poll',
        participantIds: ['user-1', 'admin-1'],
      });
      // Zero unread messages
      prismaMock.message.findFirst.mockResolvedValue(null);
      prismaMock.message.findMany.mockResolvedValue([]);

      const req = { user: { id: 'user-1', role: Role.USER } };
      await controller.messages('conv-poll', '50', '', req);

      // Database write transaction updateMany must NOT be called!
      expect(prismaMock.message.updateMany).not.toHaveBeenCalled();
    });

    it('executes updateMany write transaction only when unread messages are detected', async () => {
      prismaMock.conversation.findUnique.mockResolvedValue({
        id: 'conv-poll',
        participantIds: ['user-1', 'admin-1'],
      });
      // Unread messages found
      prismaMock.message.findFirst.mockResolvedValue({ id: 'm-unread-1' });
      prismaMock.message.findMany.mockResolvedValue([]);

      const req = { user: { id: 'user-1', role: Role.USER } };
      await controller.messages('conv-poll', '50', '', req);

      expect(prismaMock.message.updateMany).toHaveBeenCalledWith({
        where: { conversationId: 'conv-poll', read: false, senderId: { not: 'user-1' } },
        data: { read: true },
      });
    });
  });

  describe('5. XSS Attack Vector & Malicious Input Sanitization', () => {
    it('rejects javascript: pseudo-protocol in attachmentUrl', async () => {
      prismaMock.conversation.findUnique.mockResolvedValue({
        id: 'conv-sec',
        participantIds: ['user-1', 'admin-1'],
      });

      const req = { user: { id: 'user-1', role: Role.USER } };
      await expect(
        controller.send('conv-sec', { content: 'Check this', attachmentUrl: 'javascript:alert(document.cookie)' }, req)
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects data: URI attack payloads in attachmentUrl', async () => {
      prismaMock.conversation.findUnique.mockResolvedValue({
        id: 'conv-sec',
        participantIds: ['user-1', 'admin-1'],
      });

      const req = { user: { id: 'user-1', role: Role.USER } };
      await expect(
        controller.send('conv-sec', { content: 'Check this', attachmentUrl: 'data:text/html,<script>alert(1)</script>' }, req)
      ).rejects.toThrow(BadRequestException);
    });

    it('allows valid HTTPS URLs from secure media CDNs', async () => {
      prismaMock.conversation.findUnique.mockResolvedValue({
        id: 'conv-sec',
        participantIds: ['user-1', 'admin-1'],
      });
      prismaMock.message.create.mockResolvedValue({
        id: 'm-sec-1',
        senderId: 'user-1',
        content: 'Valid photo',
        attachmentUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
        read: false,
        createdAt: new Date(),
        sender: { name: 'User 1', email: 'u1@test.com' },
      });

      const req = { user: { id: 'user-1', role: Role.USER } };
      const res = await controller.send(
        'conv-sec',
        { content: 'Valid photo', attachmentUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg' },
        req
      );

      expect(res.attachmentUrl).toBe('https://res.cloudinary.com/demo/image/upload/sample.jpg');
    });
  });

  describe('6. Non-Blocking High Concurrency Notifications', () => {
    it('dispatches notifications in parallel batch insert without blocking message return', async () => {
      prismaMock.conversation.findUnique.mockResolvedValue({
        id: 'conv-notif',
        participantIds: ['sender-1', 'user-2', 'user-3'],
      });
      prismaMock.message.create.mockResolvedValue({
        id: 'm-notif-1',
        senderId: 'sender-1',
        content: 'Broadcast update',
        attachmentUrl: null,
        read: false,
        createdAt: new Date(),
        sender: { name: 'Sender' },
      });

      const req = { user: { id: 'sender-1', role: Role.USER } };
      const res = await controller.send('conv-notif', { content: 'Broadcast update' }, req);

      expect(res.id).toBe('m-notif-1');
      expect(prismaMock.notification.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ userId: 'user-2', type: 'CHAT_MESSAGE' }),
          expect.objectContaining({ userId: 'user-3', type: 'CHAT_MESSAGE' }),
        ]),
        skipDuplicates: true,
      });
    });
  });
});
