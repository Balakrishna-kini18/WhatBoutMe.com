import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CurrencyCode, EventLocationType, EventPaymentStatus, Prisma } from '@prisma/client';
import { EventsService } from './events.service.js';

describe('EventsService - Target Architecture Verification', () => {
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
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
      $transaction: vi.fn(async (cb: any) => {
        if (typeof cb === 'function') {
          return cb(prismaMock);
        }
        return cb;
      }),
    };

    auditMock = {
      log: vi.fn().mockResolvedValue(undefined),
    };

    emailMock = {
      sendEmail: vi.fn().mockResolvedValue({ messageId: 'msg-1' }),
    };

    service = new EventsService(prismaMock as any, auditMock as any, emailMock as any);
  });

  describe('createForAdmin - Location & Pricing Rules', () => {
    it('throws BadRequestException if ONLINE event lacks meetingLink', async () => {
      await expect(
        service.createForAdmin('admin-1', {
          title: 'Online Webinar',
          description: 'Live zoom session',
          startDateTime: '2026-11-20T10:00:00Z',
          locationType: EventLocationType.ONLINE,
          meetingLink: '',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if PHYSICAL event lacks venueName or venueAddress', async () => {
      await expect(
        service.createForAdmin('admin-1', {
          title: 'In-person Workshop',
          description: 'Hall workshop',
          startDateTime: '2026-11-20T10:00:00Z',
          locationType: EventLocationType.PHYSICAL,
          venueName: '',
          venueAddress: 'Dubai',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('successfully creates an ONLINE event with slug and pricing', async () => {
      const mockEvent = {
        id: 'evt-101',
        title: 'Clinical Hypnotherapy Workshop',
        slug: 'clinical-hypnotherapy-workshop',
        description: 'Deep dive into neuroplasticity',
        bannerUrl: 'https://cdn.example.com/banner.png',
        startDateTime: new Date('2026-11-20T10:00:00Z'),
        endDateTime: new Date('2026-11-20T12:00:00Z'),
        timezone: 'UTC',
        locationType: EventLocationType.ONLINE,
        meetingLink: 'https://zoom.us/j/123456789',
        venueName: null,
        venueAddress: null,
        price: new Prisma.Decimal(25.0),
        currency: CurrencyCode.USD,
        seatLimit: 100,
        seatsBooked: 0,
        isPublished: true,
        createdById: 'admin-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.event.findUnique.mockResolvedValue(null);
      prismaMock.event.create.mockResolvedValue(mockEvent);

      const result = await service.createForAdmin('admin-1', {
        title: 'Clinical Hypnotherapy Workshop',
        description: 'Deep dive into neuroplasticity',
        startDateTime: '2026-11-20T10:00:00Z',
        endDateTime: '2026-11-20T12:00:00Z',
        locationType: EventLocationType.ONLINE,
        meetingLink: 'https://zoom.us/j/123456789',
        price: 25.0,
        currency: CurrencyCode.USD,
        seatLimit: 100,
      });

      expect(result.id).toBe('evt-101');
      expect(result.slug).toBe('clinical-hypnotherapy-workshop');
      expect(result.price).toBe(25);
      expect(result.currency).toBe(CurrencyCode.USD);
      expect(result.meetingLink).toBe('https://zoom.us/j/123456789');
    });
  });

  describe('Security Gate - meetingLink Stripping in Public Queries', () => {
    it('strips meetingLink from public GET endpoint', async () => {
      const mockEvent = {
        id: 'evt-101',
        title: 'Secret Meeting Session',
        slug: 'secret-meeting-session',
        description: 'Paid workshop',
        bannerUrl: null,
        startDateTime: new Date('2026-11-20T10:00:00Z'),
        endDateTime: null,
        timezone: 'UTC',
        locationType: EventLocationType.ONLINE,
        meetingLink: 'https://zoom.us/j/confidential-999',
        venueName: null,
        venueAddress: null,
        price: new Prisma.Decimal(10.0),
        currency: CurrencyCode.USD,
        seatLimit: 50,
        seatsBooked: 10,
        isPublished: true,
        createdById: 'admin-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { registrations: 10 },
      };

      prismaMock.event.findFirst.mockResolvedValue(mockEvent);

      const result = await service.getForPublic('secret-meeting-session');

      // CRITICAL SECURITY ASSERTION:
      expect(result.meetingLink).toBeNull();
      expect(result.seatsRemaining).toBe(40);
      expect(result.isSoldOut).toBe(false);
    });
  });

  describe('Checkout & Payment Verification State Machine', () => {
    it('creates PENDING registration and order on checkout for paid events', async () => {
      const mockEvent = {
        id: 'evt-paid',
        title: 'Paid Workshop',
        slug: 'paid-workshop',
        price: new Prisma.Decimal(50.0),
        currency: CurrencyCode.AED,
        seatLimit: 20,
        seatsBooked: 5,
        isPublished: true,
        locationType: EventLocationType.ONLINE,
        meetingLink: 'https://zoom.us/j/secret',
      };

      prismaMock.event.findFirst.mockResolvedValue(mockEvent);
      prismaMock.eventRegistration.create.mockResolvedValue({
        id: 'reg-pending-1',
        eventId: 'evt-paid',
        attendeeName: 'Alex Doe',
        attendeeEmail: 'alex@example.com',
        attendeePhone: '+97150111222',
        amount: new Prisma.Decimal(50.0),
        currency: CurrencyCode.AED,
        gatewayOrderId: 'sim_ord_123',
        paymentStatus: EventPaymentStatus.PENDING,
      });

      const checkoutRes = await service.checkout('paid-workshop', {
        attendeeName: 'Alex Doe',
        attendeeEmail: 'alex@example.com',
        attendeePhone: '+97150111222',
      });

      expect(checkoutRes.status).toBe(EventPaymentStatus.PENDING);
      expect(checkoutRes.amount).toBe(50);
      expect(checkoutRes.currency).toBe(CurrencyCode.AED);
      expect(checkoutRes.simulation).toBe(true);
    });

    it('flips status to PAID and unlocks meetingLink upon payment verification', async () => {
      const mockReg = {
        id: 'reg-pending-1',
        eventId: 'evt-paid',
        attendeeName: 'Alex Doe',
        attendeeEmail: 'alex@example.com',
        amount: new Prisma.Decimal(50.0),
        currency: CurrencyCode.AED,
        gatewayOrderId: 'sim_ord_123',
        paymentStatus: EventPaymentStatus.PENDING,
        emailSent: false,
        event: {
          id: 'evt-paid',
          title: 'Paid Workshop',
          locationType: EventLocationType.ONLINE,
          meetingLink: 'https://zoom.us/j/secret-unlocked',
          startDateTime: new Date('2026-11-20T10:00:00Z'),
          timezone: 'UTC',
          venueName: null,
          venueAddress: null,
        },
      };

      prismaMock.eventRegistration.findUnique
        .mockResolvedValueOnce(mockReg)
        .mockResolvedValueOnce({ ...mockReg, paymentStatus: EventPaymentStatus.PAID });

      const verifyRes = await service.verifyPayment({
        registrationId: 'reg-pending-1',
        gatewayOrderId: 'sim_ord_123',
        gatewayPaymentId: 'sim_pay_456',
      });

      expect(verifyRes.status).toBe(EventPaymentStatus.PAID);
      expect(verifyRes.meetingLink).toBe('https://zoom.us/j/secret-unlocked');
      expect(emailMock.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'alex@example.com',
        }),
      );
    });
  });
});
