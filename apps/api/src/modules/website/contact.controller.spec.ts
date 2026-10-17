import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, HttpException } from '@nestjs/common';
import { ContactController } from './contact.controller.js';
import { LeadStatus, Role } from '@prisma/client';

describe('ContactController - Intelligent Routing & Validation', () => {
  let controller: ContactController;
  let prismaMock: any;
  let emailMock: any;

  beforeEach(() => {
    prismaMock = {
      lead: {
        create: vi.fn(),
      },
      program: {
        findUnique: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        findFirst: vi.fn(),
      },
      conversation: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      message: {
        create: vi.fn(),
      },
    };

    emailMock = {
      sendTemplateEmail: vi.fn().mockResolvedValue(undefined),
    };

    controller = new ContactController(prismaMock as any, emailMock as any);
  });

  const mockReq = {
    headers: { 'x-forwarded-for': '127.0.0.1' },
    ip: '127.0.0.1',
  } as any;

  it('rejects Course Inquiry when no course is selected', async () => {
    await expect(
      controller.submit(
        {
          name: 'Jane Doe',
          email: 'jane@example.com',
          phone: '+97150111222',
          inquiryType: 'COURSE',
          message: 'Interested in courses',
        },
        mockReq,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('routes Course Inquiry to Lead CRM with course linkage and flags triggerDiscoveryCall', async () => {
    prismaMock.program.findUnique.mockResolvedValue({
      id: 'prog-1',
      title: 'Neuroplasticity Coaching Masterclass',
      slug: 'neuroplasticity-coaching-masterclass',
    });

    prismaMock.lead.create.mockResolvedValue({
      id: 'lead-123',
      status: LeadStatus.NEW,
    });

    const result = await controller.submit(
      {
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '+97150111222',
        inquiryType: 'COURSE',
        courseId: 'prog-1',
        message: 'Tell me about the curriculum',
      },
      mockReq,
    );

    expect(result.success).toBe(true);
    expect(result.inquiryType).toBe('COURSE');
    expect(result.leadId).toBe('lead-123');
    expect(result.courseTitle).toBe('Neuroplasticity Coaching Masterclass');
    expect(result.triggerDiscoveryCall).toBe(true);
    expect(prismaMock.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Jane Doe',
          email: 'jane@example.com',
          phone: '+97150111222',
          message: expect.stringContaining('Neuroplasticity Coaching Masterclass'),
        }),
      }),
    );
    expect(emailMock.sendTemplateEmail).toHaveBeenCalled();
  });

  it('routes General Inquiry to User, Conversation and Message inbox', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({
      id: 'usr-new-1',
      name: 'Bob Smith',
      email: 'bob@example.com',
      role: Role.USER,
    });
    prismaMock.user.findFirst.mockResolvedValue({
      id: 'admin-1',
      name: 'Roweena',
      role: Role.SUPER_ADMIN,
    });
    prismaMock.conversation.findFirst.mockResolvedValue(null);
    prismaMock.conversation.create.mockResolvedValue({
      id: 'conv-new-1',
    });
    prismaMock.message.create.mockResolvedValue({
      id: 'msg-1',
    });
    prismaMock.conversation.update.mockResolvedValue({});

    const result = await controller.submit(
      {
        name: 'Bob Smith',
        email: 'bob@example.com',
        phone: '+14155552671',
        inquiryType: 'GENERAL',
        message: 'Hello, inquiring about corporate speaking engagements.',
      },
      mockReq,
    );

    expect(result.success).toBe(true);
    expect(result.inquiryType).toBe('GENERAL');
    expect(result.conversationId).toBe('conv-new-1');
    expect(prismaMock.conversation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          participantIds: ['usr-new-1', 'admin-1'],
        }),
      }),
    );
    expect(prismaMock.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          senderId: 'usr-new-1',
          content: expect.stringContaining('+14155552671'),
        }),
      }),
    );
    expect(emailMock.sendTemplateEmail).toHaveBeenCalled();
  });

  it('silently ignores honeypot spam submissions without database writes', async () => {
    const result = await controller.submit(
      {
        name: 'Spam Bot',
        email: 'bot@spam.com',
        phone: '123456',
        inquiryType: 'GENERAL',
        honeypot: 'http://spam-link.com',
      },
      mockReq,
    );

    expect(result.success).toBe(true);
    expect(prismaMock.lead.create).not.toHaveBeenCalled();
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(emailMock.sendTemplateEmail).not.toHaveBeenCalled();
  });
});
