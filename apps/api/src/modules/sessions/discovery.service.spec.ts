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

    it('excludes slots overlapping with DB sessions or Outlook busy blocks', async () => {
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

      // Ensure no returned slot starts inside 06:00-07:00 UTC or 08:00-08:30 UTC
      for (const slot of result.slots) {
        const start = new Date(slot.slotStartUtc).getTime();
        const clashDb = start >= new Date(`${futureDate}T06:00:00Z`).getTime() && start < new Date(`${futureDate}T07:00:00Z`).getTime();
        const clashOutlook = start >= new Date(`${futureDate}T08:00:00Z`).getTime() && start < new Date(`${futureDate}T08:30:00Z`).getTime();
        expect(clashDb).toBe(false);
        expect(clashOutlook).toBe(false);
      }
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

    it('successfully books 15-minute discovery call, updates Lead, and dispatches Zoom confirmation email', async () => {
      const slotTime = '2026-11-20T08:00:00.000Z';
      prismaMock.session.findFirst.mockResolvedValueOnce(null);
      prismaMock.session.create.mockImplementation(({ data }: any) => ({
        id: 'new-discovery-sess-1',
        ...data,
      }));

      const res = await service.bookDiscoveryCall({
        leadId: 'lead-100',
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '+97150111222',
        courseId: 'prog-1',
        slotStartUtc: slotTime,
        timezone: 'Asia/Dubai',
      });

      expect(res.success).toBe(true);
      expect(res.sessionId).toBe('new-discovery-sess-1');
      expect(res.zoomJoinUrl).toBe('https://zoom.us/j/zoom-123');
      expect(res.icsContent).toContain('BEGIN:VCALENDAR');

      // Verify Session was created with SPEAKER_DISCOVERY_CALL
      expect(prismaMock.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sessionType: SessionType.SPEAKER_DISCOVERY_CALL,
            status: SessionStatus.SCHEDULED,
            durationMinutes: 15,
            hostTrainerId: 'row-1',
            joinUrl: 'https://zoom.us/j/zoom-123',
          }),
        }),
      );

      // Verify Lead was updated with CONTACTED status and discovery booking info
      expect(prismaMock.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'lead-100' },
          data: expect.objectContaining({
            status: LeadStatus.CONTACTED,
            message: expect.stringContaining('📅 Discovery Call Scheduled'),
          }),
        }),
      );

      // Verify calendar provider and email notifications were triggered
      expect(calendarProviderMock.createEvent).toHaveBeenCalled();
      expect(emailMock.sendTemplateEmail).toHaveBeenCalledTimes(2); // Prospect + Roweena
    });
  });
});
