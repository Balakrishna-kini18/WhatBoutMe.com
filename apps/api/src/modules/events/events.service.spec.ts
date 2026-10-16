import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { EventRegistrationStatus, EventStatus, EventType, ParticipantCategory } from '@prisma/client';
import { EventsService } from './events.service.js';

describe('EventsService - Community Events & Webinars Engine', () => {
  let service: EventsService;
  let prismaMock: any;
  let auditMock: any;
  let emailMock: any;

  beforeEach(() => {
    prismaMock = {
      event: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      eventRegistration: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
      notification: {
        create: vi.fn().mockResolvedValue({ id: 'notif-1' }),
      },
      $transaction: vi.fn(),
    };

    auditMock = {
      log: vi.fn().mockResolvedValue(undefined),
    };

    emailMock = {
      sendEmail: vi.fn().mockResolvedValue({ messageId: 'msg-1' }),
    };

    service = new EventsService(prismaMock as any, auditMock as any, emailMock as any);
  });

  describe('createForAdmin', () => {
    it('throws BadRequestException if endAt is before startAt', async () => {
      await expect(
        service.createForAdmin('admin-1', {
          type: EventType.EVENT,
          title: 'Neuroplasticity Workshop',
          description: 'Interactive session',
          startAt: '2026-11-20T10:00:00Z',
          endAt: '2026-11-20T09:00:00Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates an event and writes audit log', async () => {
      const mockCreated = {
        id: 'evt-1',
        type: EventType.EVENT,
        title: 'Neuroplasticity Workshop',
        description: 'Interactive session',
        status: EventStatus.REGISTRATION_OPEN,
        startAt: new Date('2026-11-20T10:00:00Z'),
        endAt: new Date('2026-11-20T12:00:00Z'),
        location: 'Dubai Knowledge Park',
        meetingLink: null,
        coverImageUrl: null,
        maxRegistrations: 50,
        registrationOpensAt: null,
        registrationClosesAt: null,
        createdById: 'admin-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { registrations: 0 },
        createdBy: { id: 'admin-1', name: 'Super Admin', email: 'admin@whatboutme.com' },
      };

      prismaMock.event.create.mockResolvedValue(mockCreated);

      const result = await service.createForAdmin('admin-1', {
        type: EventType.EVENT,
        title: 'Neuroplasticity Workshop',
        description: 'Interactive session',
        startAt: '2026-11-20T10:00:00Z',
        endAt: '2026-11-20T12:00:00Z',
        location: 'Dubai Knowledge Park',
        maxRegistrations: 50,
      });

      expect(result.id).toBe('evt-1');
      expect(result.title).toBe('Neuroplasticity Workshop');
      expect(auditMock.log).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'EVENT_CREATED',
          entityId: 'evt-1',
        }),
      );
    });
  });

  describe('register', () => {
    const futureStart = new Date(Date.now() + 86400000 * 5);
    const futureEnd = new Date(Date.now() + 86400000 * 5 + 7200000);

    it('throws NotFoundException when event does not exist', async () => {
      prismaMock.event.findUnique.mockResolvedValue(null);

      await expect(
        service.register('evt-none', 'usr-1', {
          fullName: 'Jane Doe',
          email: 'jane@example.com',
          phone: '+971501234567',
          category: ParticipantCategory.PROFESSIONAL,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when registration is not open', async () => {
      prismaMock.event.findUnique.mockResolvedValue({
        id: 'evt-1',
        status: EventStatus.SCHEDULED,
        startAt: futureStart,
        endAt: futureEnd,
      });

      await expect(
        service.register('evt-1', 'usr-1', {
          fullName: 'Jane Doe',
          email: 'jane@example.com',
          phone: '+971501234567',
          category: ParticipantCategory.PROFESSIONAL,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when capacity is reached', async () => {
      prismaMock.event.findUnique.mockResolvedValue({
        id: 'evt-1',
        status: EventStatus.REGISTRATION_OPEN,
        startAt: futureStart,
        endAt: futureEnd,
        maxRegistrations: 10,
        registrationClosesAt: null,
      });
      prismaMock.eventRegistration.count.mockResolvedValue(10);

      await expect(
        service.register('evt-1', 'usr-1', {
          fullName: 'Jane Doe',
          email: 'jane@example.com',
          phone: '+971501234567',
          category: ParticipantCategory.PROFESSIONAL,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException if already confirmed', async () => {
      prismaMock.event.findUnique.mockResolvedValue({
        id: 'evt-1',
        status: EventStatus.REGISTRATION_OPEN,
        startAt: futureStart,
        endAt: futureEnd,
        maxRegistrations: null,
        registrationClosesAt: null,
      });
      prismaMock.eventRegistration.findFirst.mockResolvedValue({
        id: 'reg-1',
        status: EventRegistrationStatus.CONFIRMED,
      });

      await expect(
        service.register('evt-1', 'usr-1', {
          fullName: 'Jane Doe',
          email: 'jane@example.com',
          phone: '+971501234567',
          category: ParticipantCategory.PROFESSIONAL,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates registration, creates in-app notification, and sends email', async () => {
      const event = {
        id: 'evt-1',
        type: EventType.EVENT,
        title: 'Mindfulness & Resilience Summit',
        status: EventStatus.REGISTRATION_OPEN,
        startAt: futureStart,
        endAt: futureEnd,
        maxRegistrations: null,
        registrationClosesAt: null,
        location: 'Online',
        meetingLink: 'https://zoom.us/j/123456',
      };

      prismaMock.event.findUnique.mockResolvedValue(event);
      prismaMock.eventRegistration.findFirst.mockResolvedValue(null);

      const mockReg = {
        id: 'reg-new',
        eventId: 'evt-1',
        userId: 'usr-1',
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        phone: '+971501234567',
        category: ParticipantCategory.STUDENT,
        categoryOther: null,
        organization: 'UAE University',
        city: 'Abu Dhabi',
        status: EventRegistrationStatus.CONFIRMED,
        rejectedAt: null,
        rejectionReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        event,
        user: { id: 'usr-1', name: 'Jane Doe', email: 'jane@example.com' },
      };

      prismaMock.eventRegistration.create.mockResolvedValue(mockReg);

      const result = await service.register('evt-1', 'usr-1', {
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        phone: '+971501234567',
        category: ParticipantCategory.STUDENT,
        organization: 'UAE University',
        city: 'Abu Dhabi',
      });

      expect(result.id).toBe('reg-new');
      expect(result.status).toBe('CONFIRMED');
      expect(prismaMock.notification.create).toHaveBeenCalled();
      expect(emailMock.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'jane@example.com',
          subject: expect.stringContaining('Registration Confirmed'),
        }),
      );
    });
  });

  describe('rejectRegistrationForAdmin', () => {
    it('sets status to REJECTED and logs audit with reason', async () => {
      prismaMock.event.findUnique.mockResolvedValue({ id: 'evt-1', _count: { registrations: 1 } });
      prismaMock.eventRegistration.findFirst.mockResolvedValue({
        id: 'reg-1',
        eventId: 'evt-1',
        userId: 'usr-1',
        status: EventRegistrationStatus.CONFIRMED,
        event: { id: 'evt-1', title: 'Brain Health 101' },
      });

      prismaMock.eventRegistration.update.mockResolvedValue({
        id: 'reg-1',
        eventId: 'evt-1',
        userId: 'usr-1',
        fullName: 'John Smith',
        email: 'john@example.com',
        phone: '+971501112233',
        category: ParticipantCategory.OTHER,
        categoryOther: 'Speaker',
        organization: 'Health Inc',
        city: 'Dubai',
        status: EventRegistrationStatus.REJECTED,
        rejectedAt: new Date(),
        rejectionReason: 'Capacity exceeded for this category',
        createdAt: new Date(),
        updatedAt: new Date(),
        user: { id: 'usr-1', name: 'John Smith', email: 'john@example.com' },
      });

      const result = await service.rejectRegistrationForAdmin(
        'admin-1',
        'evt-1',
        'reg-1',
        'Capacity exceeded for this category',
      );

      expect(result.status).toBe('REJECTED');
      expect(result.rejectionReason).toBe('Capacity exceeded for this category');
      expect(auditMock.log).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'EVENT_REGISTRATION_REJECTED',
          entityId: 'reg-1',
          reason: 'Capacity exceeded for this category',
        }),
      );
    });
  });
});
