import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { DiscoveryService } from './discovery.service.js';
import { LeadStatus, Role, SessionStatus, SessionType } from '@prisma/client';

describe('DiscoveryService - 15-Minute Slot Calculation & Booking', () => {
  let service: DiscoveryService;
  let prismaMock: any;
  let calendarProviderMock: any;
  let meetingProviderMock: any;
  let emailMock: any;

  beforeEach(() => {
    prismaMock = {
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'row-1',
          name: 'Roweena Kini',
          email: 'roweena@whatboutme.com',
          role: Role.SUPER_ADMIN,
        }),
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'user-prospect-1',
          name: 'Jane Doe',
          email: 'jane@example.com',
          role: Role.USER,
        }),
      },
      session: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
      oneOnOneRequest: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      lead: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'lead-100',
          name: 'Jane Doe',
          email: 'jane@example.com',
          message: 'Interested in Bipolar management course',
          status: LeadStatus.NEW,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      program: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'prog-1',
          title: 'Neuroplasticity Masterclass',
        }),
      },
      $transaction: vi.fn(async (cb: any) => cb(prismaMock)),
    };

    calendarProviderMock = {
      getBusySlots: vi.fn().mockResolvedValue([]),
      createEvent: vi.fn().mockResolvedValue({ id: 'evt-123' }),
    };

    meetingProviderMock = {
      createMeeting: vi.fn().mockResolvedValue({
        id: 'zoom-123',
        joinUrl: 'https://zoom.us/j/zoom-123',
        startUrl: 'https://zoom.us/s/zoom-123',
      }),
    };

    emailMock = {
      sendTemplateEmail: vi.fn().mockResolvedValue(undefined),
    };

    service = new DiscoveryService(
      prismaMock as any,
      calendarProviderMock,
      meetingProviderMock,
      emailMock as any,
    );
  });

  describe('getAvailableSlots - Unified Availability', () => {
    it('returns available 15-minute slots with local, GST, and IST formats', async () => {
      // Future date
      const futureDate = '2026-11-20';
      const result = await service.getAvailableSlots(futureDate, 'America/New_York');

      expect(result.date).toBe(futureDate);
      expect(result.timezone).toBe('America/New_York');
      expect(result.slots.length).toBeGreaterThan(0);

      const firstSlot = result.slots[0]!;
      expect(firstSlot).toHaveProperty('slotStartUtc');
      expect(firstSlot).toHaveProperty('slotEndUtc');
      expect(firstSlot.timeGst).toContain('GST');
      expect(firstSlot.timeIst).toContain('IST');
    });

    it('marks slots overlapping with DB sessions or Outlook busy blocks as isBooked: true', async () => {
      const futureDate = '2026-11-20';
      // Busy block in DB: 06:00 to 07:00 UTC (10:00 to 11:00 GST)
      prismaMock.session.findMany.mockResolvedValueOnce([
        {
          startTime: new Date(`${futureDate}T06:00:00Z`),
          endTime: new Date(`${futureDate}T07:00:00Z`),
        },
      ]);

      // Busy block in Outlook: 08:00 to 08:30 UTC (12:00 to 12:30 GST)
      calendarProviderMock.getBusySlots.mockResolvedValueOnce([
        {
          startTime: new Date(`${futureDate}T08:00:00Z`),
          endTime: new Date(`${futureDate}T08:30:00Z`),
        },
      ]);

      const result = await service.getAvailableSlots(futureDate, 'Asia/Dubai');

      // Clashed slots MUST have isBooked: true; un-clashed slots have isBooked: false
      for (const slot of result.slots) {
        const start = new Date(slot.slotStartUtc).getTime();
        const clashDb = start >= new Date(`${futureDate}T06:00:00Z`).getTime() && start < new Date(`${futureDate}T07:00:00Z`).getTime();
        const clashOutlook = start >= new Date(`${futureDate}T08:00:00Z`).getTime() && start < new Date(`${futureDate}T08:30:00Z`).getTime();
        if (clashDb || clashOutlook) {
          expect(slot.isBooked).toBe(true);
        } else {
          expect(slot.isBooked).toBe(false);
        }
      }
    });

    it('marks slots overlapping with pending or approved 1-on-1 coaching requests as isBooked: true', async () => {
      const futureDate = '2026-11-20';
      // Coaching request: 09:00 to 09:45 UTC
      prismaMock.oneOnOneRequest.findMany.mockResolvedValueOnce([
        {
          requestedStart: new Date(`${futureDate}T09:00:00Z`),
          requestedEnd: new Date(`${futureDate}T09:45:00Z`),
        },
      ]);

      const result = await service.getAvailableSlots(futureDate, 'Asia/Dubai');
      const bookedSlots = result.slots.filter((s) => {
        const start = new Date(s.slotStartUtc).getTime();
        return start >= new Date(`${futureDate}T09:00:00Z`).getTime() && start < new Date(`${futureDate}T09:45:00Z`).getTime();
      });

      expect(bookedSlots.length).toBe(3); // 09:00, 09:15, 09:30
      bookedSlots.forEach((s) => expect(s.isBooked).toBe(true));
    });
  });

  describe('bookDiscoveryCall - Atomic Slot Lock & Zoom Generation', () => {
    it('throws ConflictException if slot is already booked', async () => {
      const slotTime = '2026-11-20T08:00:00.000Z';
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: 'existing-sess-1',
        title: 'Existing Booking',
      });

      await expect(
        service.bookDiscoveryCall({
          name: 'Jane Doe',
          email: 'jane@example.com',
          phone: '+97150111222',
          slotStartUtc: slotTime,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException if attendee already has an upcoming scheduled discovery call', async () => {
      const slotTime = '2026-11-20T08:00:00.000Z';
      // First findFirst checks for slot clash (none)
      prismaMock.session.findFirst.mockResolvedValueOnce(null);
      // Second findFirst checks for duplicate upcoming booking by same email (found)
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: 'upcoming-sess-1',
        title: 'Already Scheduled Discovery Call',
      });

      await expect(
        service.bookDiscoveryCall({
          name: 'Jane Doe',
          email: 'jane@example.com',
          phone: '+97150111222',
          slotStartUtc: slotTime,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('auto-creates Lead record in DB when leadId is not provided', async () => {
      const slotTime = '2026-11-20T08:00:00.000Z';
      prismaMock.session.findFirst.mockResolvedValue(null);
      prismaMock.session.create.mockImplementation(({ data }: any) => ({
        id: 'new-discovery-sess-2',
        ...data,
      }));
      prismaMock.lead.create = vi.fn().mockResolvedValue({
        id: 'new-auto-lead-1',
        name: 'Alex Rivera',
        email: 'alex@example.com',
      });

      const res = await service.bookDiscoveryCall({
        name: 'Alex Rivera',
        email: 'alex@example.com',
        phone: '+971509990000',
        courseId: 'prog-1',
        slotStartUtc: slotTime,
        notes: 'Interested in executive leadership coaching',
      });

      expect(res.success).toBe(true);
      expect(prismaMock.lead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Alex Rivera',
            email: 'alex@example.com',
            status: LeadStatus.CONTACTED,
            message: expect.stringContaining('Course Inquiry: Neuroplasticity Masterclass'),
          }),
        }),
      );
    });
  });
});
