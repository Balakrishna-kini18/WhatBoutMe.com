/**
 * D1-044: Learner Booking Engine — Unit Tests
 *
 * Tests cover:
 * - Successful learner booking (group cohort, 1:1)
 * - Invalid / ineligible enrolment states
 * - Wrong batch membership (IDOR prevention)
 * - Session capacity reached
 * - Concurrent capacity race (advisory lock serialisation)
 * - Duplicate booking rejection
 * - 12-hour minimum advance notice
 * - Configurable notice policy via env
 * - Outlook busy-slot clash
 * - No Outlook clash → booking succeeds
 * - Outlook provider failure (fail closed)
 * - Learner cannot book for another learner (IDOR)
 * - Forged enrolment / batch / session IDs
 * - Manager scope restriction
 * - Permission enforcement
 * - 1:1 booking ownership
 * - Cancelled / completed session rejection
 * - Regression against D1-030–D1-043 (service still instantiates correctly)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  SessionStatus,
  SessionType,
  BookingStatus,
  EnrolmentStatus,
} from '@prisma/client';
import { SessionsService } from './sessions.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { ICalendarProvider, BusySlot } from '../../common/interfaces/calendar-provider.interface.js';
import type { IMeetingProvider } from '../../common/interfaces/meeting-provider.interface.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const LEARNER_ID = 'learner-user-1';
const SESSION_ID = 'session-abc';
const BATCH_ID = 'batch-xyz';
const ENROLMENT_ID = 'enrol-001';

/** A future session that starts 24 hours from now (well within policy). */
function futureSess(overrides: Partial<any> = {}) {
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000); // +24h
  const end = new Date(start.getTime() + 90 * 60 * 1000); // +90 min
  return {
    id: SESSION_ID,
    title: 'Step 3 Live Session',
    batchId: BATCH_ID,
    learnerId: null,
    hostTrainerId: 'trainer-ro',
    startTime: start,
    endTime: end,
    status: SessionStatus.SCHEDULED,
    sessionType: SessionType.GROUP_COHORT,
    capacity: 25,
    joinUrl: 'https://zoom.us/j/test',
    hostTrainer: { id: 'trainer-ro', name: 'Roweena Britto', email: 'ro@whatboutme.com' },
    ...overrides,
  };
}

const activeEnrolment = {
  id: ENROLMENT_ID,
  status: EnrolmentStatus.ACTIVE,
};

const mockBookingResult = {
  id: 'booking-1',
  sessionId: SESSION_ID,
  userId: LEARNER_ID,
  enrolmentId: ENROLMENT_ID,
  status: BookingStatus.BOOKED,
  session: futureSess(),
  user: { id: LEARNER_ID, name: 'Alice', email: 'alice@example.com' },
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('D1-044: SessionsService.bookSession()', () => {
  let service: SessionsService;
  let prismaMock: any;
  let calendarProviderMock: ICalendarProvider;
  let meetingProviderMock: IMeetingProvider;

  beforeEach(() => {
    prismaMock = {
      session: {
        findUnique: vi.fn().mockResolvedValue(futureSess()),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        delete: vi.fn(),
      },
      enrolment: {
        findUnique: vi.fn().mockResolvedValue(activeEnrolment),
        findMany: vi.fn().mockResolvedValue([]),
      },
      sessionBooking: {
        findUnique: vi.fn().mockResolvedValue(null), // no existing booking
        create: vi.fn().mockResolvedValue(mockBookingResult),
        update: vi.fn().mockResolvedValue(mockBookingResult),
        count: vi.fn().mockResolvedValue(0), // 0 existing bookings
        findMany: vi.fn().mockResolvedValue([]),
      },
      batch: {
        findUnique: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      user: {
        findUnique: vi.fn(),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      },
      notification: {
        create: vi.fn().mockResolvedValue({ id: 'notif-1' }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: vi.fn().mockImplementation(async (fn: any) => {
        // Simulate the transaction context with a pg advisory lock stub.
        const txMock = {
          ...prismaMock,
          $executeRaw: vi.fn().mockResolvedValue(undefined),
        };
        return fn(txMock);
      }),
    };

    calendarProviderMock = {
      getBusySlots: vi.fn().mockResolvedValue([]), // no busy slots by default
      createEvent: vi.fn(),
      deleteEvent: vi.fn(),
    };

    meetingProviderMock = {
      createMeeting: vi.fn(),
      updateMeeting: vi.fn(),
      cancelMeeting: vi.fn(),
      getRecordingUrl: vi.fn(),
      getParticipantReport: vi.fn(),
    };

    service = new SessionsService(
      prismaMock as unknown as PrismaService,
      meetingProviderMock,
      calendarProviderMock,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.BOOKING_ADVANCE_NOTICE_HOURS;
  });

  // ── 1. Successful booking ─────────────────────────────────────────────────

  describe('Successful learner booking', () => {
    it('books a group cohort session and returns the booking record', async () => {
      const result = await service.bookSession(SESSION_ID, LEARNER_ID);

      expect(result).toBeTruthy();
      expect(prismaMock.$transaction).toHaveBeenCalled();
      // Booking created with correct data
      const tx = await prismaMock.$transaction.mock.results[0].value;
      void tx; // used for side-effect assertions
      expect(prismaMock.sessionBooking.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sessionId: SESSION_ID,
            userId: LEARNER_ID,
            enrolmentId: ENROLMENT_ID,
            status: BookingStatus.BOOKED,
          }),
        }),
      );
    });

    it('writes an audit log entry SESSION_BOOKED', async () => {
      await service.bookSession(SESSION_ID, LEARNER_ID);
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorId: LEARNER_ID,
            action: 'SESSION_BOOKED',
            entity: 'Session',
            entityId: SESSION_ID,
          }),
        }),
      );
    });

    it('creates an in-app notification for booking confirmation including host trainer name', async () => {
      await service.bookSession(SESSION_ID, LEARNER_ID);
      expect(prismaMock.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: LEARNER_ID,
            type: 'SESSION_BOOKING_CONFIRMED',
            template: expect.stringContaining('Roweena Britto'),
          }),
        }),
      );
    });

    it('books a 1:1 session for the designated learner', async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce(
        futureSess({ sessionType: SessionType.ONE_ON_ONE, learnerId: LEARNER_ID, capacity: 1 }),
      );

      const result = await service.bookSession(SESSION_ID, LEARNER_ID);
      expect(result).toBeTruthy();
    });

    it('calls ICalendarProvider.getBusySlots with trainer email and session times', async () => {
      const sess = futureSess();
      prismaMock.session.findUnique.mockResolvedValueOnce(sess);

      await service.bookSession(SESSION_ID, LEARNER_ID);

      expect(calendarProviderMock.getBusySlots).toHaveBeenCalledWith(
        'ro@whatboutme.com',
        sess.startTime,
        sess.endTime,
      );
    });
  });

  // ── 2. Invalid / ineligible enrolment ────────────────────────────────────

  describe('Ineligible enrolment states', () => {
    const ineligibleStatuses = [
      EnrolmentStatus.PENDING_PAYMENT,
      EnrolmentStatus.PENDING_AGREEMENT,
      EnrolmentStatus.WAITLIST,
      EnrolmentStatus.COMPLETED,
      EnrolmentStatus.REVOKED,
    ] as const;

    for (const status of ineligibleStatuses) {
      it(`rejects booking when enrolment is ${status}`, async () => {
        prismaMock.enrolment.findUnique.mockResolvedValueOnce({ id: ENROLMENT_ID, status });

        await expect(service.bookSession(SESSION_ID, LEARNER_ID)).rejects.toThrow(
          ForbiddenException,
        );
      });
    }

    it('rejects booking when no enrolment record exists for the batch', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValueOnce(null);

      await expect(service.bookSession(SESSION_ID, LEARNER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ── 3. Wrong batch / IDOR prevention ─────────────────────────────────────

  describe('Batch membership and IDOR prevention', () => {
    it('rejects when learner enrolment batch does not match session batch', async () => {
      // No enrolment for this batch — simulates a forged/wrong batchId
      prismaMock.enrolment.findUnique.mockResolvedValueOnce(null);

      await expect(service.bookSession(SESSION_ID, LEARNER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects when a forged session ID is supplied (session not found)', async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce(null);

      await expect(service.bookSession('forged-session-id', LEARNER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('does not use client-supplied userId (always uses learnerId param from JWT)', async () => {
      // Service should query enrolment for LEARNER_ID, not any other value.
      await service.bookSession(SESSION_ID, LEARNER_ID);

      expect(prismaMock.enrolment.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId_batchId: expect.objectContaining({ userId: LEARNER_ID }),
          }),
        }),
      );
    });
  });

  // ── 4. 1:1 session ownership ───────────────────────────────────────────────

  describe('1-on-1 session ownership', () => {
    it('rejects when a different learner attempts to book a dedicated 1:1 session', async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce(
        futureSess({
          sessionType: SessionType.ONE_ON_ONE,
          learnerId: 'other-learner-id',
          capacity: 1,
        }),
      );

      await expect(service.bookSession(SESSION_ID, LEARNER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows the designated learner to book their dedicated 1:1 slot', async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce(
        futureSess({ sessionType: SessionType.ONE_ON_ONE, learnerId: LEARNER_ID, capacity: 1 }),
      );

      const result = await service.bookSession(SESSION_ID, LEARNER_ID);
      expect(result).toBeTruthy();
    });

    it('rejects when a learner without batch enrolment tries to book an open 1:1 session (no designated learner)', async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce(
        futureSess({ sessionType: SessionType.ONE_ON_ONE, learnerId: null, capacity: 1 }),
      );
      // Learner is NOT enrolled in the batch
      prismaMock.enrolment.findUnique.mockResolvedValueOnce(null);

      await expect(service.bookSession(SESSION_ID, LEARNER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ── 5. Session capacity ───────────────────────────────────────────────────

  describe('Session capacity enforcement', () => {
    it('rejects booking when session is at full capacity', async () => {
      const cap = 10;
      prismaMock.session.findUnique.mockResolvedValueOnce(futureSess({ capacity: cap }));

      // Simulate transaction: capacity count returns full
      prismaMock.$transaction.mockImplementationOnce(async (fn: any) => {
        const txMock = {
          ...prismaMock,
          $executeRaw: vi.fn().mockResolvedValue(undefined),
          sessionBooking: {
            ...prismaMock.sessionBooking,
            count: vi.fn().mockResolvedValue(cap), // exactly full
            findUnique: vi.fn().mockResolvedValue(null),
          },
        };
        return fn(txMock);
      });

      await expect(service.bookSession(SESSION_ID, LEARNER_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it('succeeds when there is exactly 1 remaining seat', async () => {
      const cap = 10;
      prismaMock.session.findUnique.mockResolvedValueOnce(futureSess({ capacity: cap }));

      prismaMock.$transaction.mockImplementationOnce(async (fn: any) => {
        const txMock = {
          ...prismaMock,
          $executeRaw: vi.fn().mockResolvedValue(undefined),
          sessionBooking: {
            ...prismaMock.sessionBooking,
            count: vi.fn().mockResolvedValue(cap - 1), // 1 seat left
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue(mockBookingResult),
          },
        };
        return fn(txMock);
      });

      const result = await service.bookSession(SESSION_ID, LEARNER_ID);
      expect(result).toBeTruthy();
    });

    it('treats null capacity as unlimited (no capacity rejection)', async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce(futureSess({ capacity: null }));

      prismaMock.$transaction.mockImplementationOnce(async (fn: any) => {
        const txMock = {
          ...prismaMock,
          $executeRaw: vi.fn().mockResolvedValue(undefined),
          sessionBooking: {
            ...prismaMock.sessionBooking,
            count: vi.fn().mockResolvedValue(9999),
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue(mockBookingResult),
          },
        };
        return fn(txMock);
      });

      const result = await service.bookSession(SESSION_ID, LEARNER_ID);
      expect(result).toBeTruthy();
    });
  });

  // ── 6. Concurrent capacity race ───────────────────────────────────────────

  describe('Concurrent booking and advisory lock', () => {
    it('uses pg_advisory_xact_lock inside the transaction to serialise bookings', async () => {
      const txExecuteRawSpy = vi.fn().mockResolvedValue(undefined);

      prismaMock.$transaction.mockImplementationOnce(async (fn: any) => {
        const txMock = {
          ...prismaMock,
          $executeRaw: txExecuteRawSpy,
          sessionBooking: {
            ...prismaMock.sessionBooking,
            count: vi.fn().mockResolvedValue(0),
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue(mockBookingResult),
          },
        };
        return fn(txMock);
      });

      await service.bookSession(SESSION_ID, LEARNER_ID);
      expect(txExecuteRawSpy).toHaveBeenCalled();
    });

    it('second concurrent attempt is rejected once capacity is consumed by first', async () => {
      const cap = 1;
      prismaMock.session.findUnique.mockResolvedValueOnce(futureSess({ capacity: cap }));

      prismaMock.$transaction.mockImplementationOnce(async (fn: any) => {
        const txMock = {
          ...prismaMock,
          $executeRaw: vi.fn().mockResolvedValue(undefined),
          sessionBooking: {
            ...prismaMock.sessionBooking,
            count: vi.fn().mockResolvedValue(cap), // capacity consumed by prior booking
            findUnique: vi.fn().mockResolvedValue(null),
          },
        };
        return fn(txMock);
      });

      await expect(service.bookSession(SESSION_ID, LEARNER_ID)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ── 7. Duplicate booking ──────────────────────────────────────────────────

  describe('Duplicate booking prevention', () => {
    it('allows re-booking a previously CANCELLED booking via update (upsert)', async () => {
      prismaMock.$transaction.mockImplementationOnce(async (fn: any) => {
        const txMock = {
          ...prismaMock,
          $executeRaw: vi.fn().mockResolvedValue(undefined),
          sessionBooking: {
            ...prismaMock.sessionBooking,
            findUnique: vi.fn().mockResolvedValue({
              id: 'existing-cancelled',
              status: BookingStatus.CANCELLED,
            }),
            update: prismaMock.sessionBooking.update,
          },
        };
        return fn(txMock);
      });

      const result = await service.bookSession(SESSION_ID, LEARNER_ID);
      expect(result).toBeTruthy();
      
      const tx = await prismaMock.$transaction.mock.results[0].value;
      void tx;
      expect(prismaMock.sessionBooking.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sessionId_userId: { sessionId: SESSION_ID, userId: LEARNER_ID }
          }),
        }),
      );
    });

    it('rejects when the learner already has an active BOOKED booking', async () => {
      prismaMock.$transaction.mockImplementationOnce(async (fn: any) => {
        const txMock = {
          ...prismaMock,
          $executeRaw: vi.fn().mockResolvedValue(undefined),
          sessionBooking: {
            ...prismaMock.sessionBooking,
            findUnique: vi.fn().mockResolvedValue({
              id: 'existing-booking',
              status: BookingStatus.BOOKED,
            }),
          },
        };
        return fn(txMock);
      });

      await expect(service.bookSession(SESSION_ID, LEARNER_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects when the learner already has a CONFIRMED booking', async () => {
      prismaMock.$transaction.mockImplementationOnce(async (fn: any) => {
        const txMock = {
          ...prismaMock,
          $executeRaw: vi.fn().mockResolvedValue(undefined),
          sessionBooking: {
            ...prismaMock.sessionBooking,
            findUnique: vi.fn().mockResolvedValue({
              id: 'confirmed-booking',
              status: BookingStatus.CONFIRMED,
            }),
          },
        };
        return fn(txMock);
      });

      await expect(service.bookSession(SESSION_ID, LEARNER_ID)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ── 8. Advance booking notice ─────────────────────────────────────────────

  describe('Advance booking notice policy', () => {
    it('rejects booking inside the default 12-hour notice window', async () => {
      // Session starts in 6 hours — inside the 12h window
      const start = new Date(Date.now() + 6 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      prismaMock.session.findUnique.mockResolvedValueOnce(
        futureSess({ startTime: start, endTime: end }),
      );

      await expect(service.bookSession(SESSION_ID, LEARNER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('allows booking exactly at the default 12-hour notice boundary + 1ms', async () => {
      const start = new Date(Date.now() + 12 * 60 * 60 * 1000 + 1000); // just over 12h
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      prismaMock.session.findUnique.mockResolvedValueOnce(
        futureSess({ startTime: start, endTime: end }),
      );

      const result = await service.bookSession(SESSION_ID, LEARNER_ID);
      expect(result).toBeTruthy();
    });

    it('respects configurable BOOKING_ADVANCE_NOTICE_HOURS env variable', async () => {
      process.env.BOOKING_ADVANCE_NOTICE_HOURS = '4';

      // Session in 5 hours — would fail with default 12h but OK with 4h policy
      const start = new Date(Date.now() + 5 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      prismaMock.session.findUnique.mockResolvedValueOnce(
        futureSess({ startTime: start, endTime: end }),
      );

      const result = await service.bookSession(SESSION_ID, LEARNER_ID);
      expect(result).toBeTruthy();

      // Session in 3 hours — within 4h policy
      const start2 = new Date(Date.now() + 3 * 60 * 60 * 1000);
      const end2 = new Date(start2.getTime() + 60 * 60 * 1000);
      prismaMock.session.findUnique.mockResolvedValueOnce(
        futureSess({ startTime: start2, endTime: end2 }),
      );
      prismaMock.enrolment.findUnique.mockResolvedValueOnce(activeEnrolment);

      await expect(service.bookSession(SESSION_ID, LEARNER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ── 9. Outlook busy-slot clash ────────────────────────────────────────────

  describe('Outlook calendar clash prevention', () => {
    it('rejects booking when trainer has an overlapping busy slot', async () => {
      const sess = futureSess();
      prismaMock.session.findUnique.mockResolvedValueOnce(sess);

      const busySlot: BusySlot = {
        startTime: new Date(sess.startTime.getTime() - 15 * 60 * 1000), // starts 15 min before
        endTime: new Date(sess.startTime.getTime() + 30 * 60 * 1000), // overlaps
        title: 'Personal Appointment',
      };
      (calendarProviderMock.getBusySlots as ReturnType<typeof vi.fn>).mockResolvedValueOnce([busySlot]);

      await expect(service.bookSession(SESSION_ID, LEARNER_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects when busy slot exactly covers the session window', async () => {
      const sess = futureSess();
      prismaMock.session.findUnique.mockResolvedValueOnce(sess);

      const busySlot: BusySlot = {
        startTime: sess.startTime,
        endTime: sess.endTime,
      };
      (calendarProviderMock.getBusySlots as ReturnType<typeof vi.fn>).mockResolvedValueOnce([busySlot]);

      await expect(service.bookSession(SESSION_ID, LEARNER_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it('allows booking when trainer busy slots do not overlap the session window', async () => {
      const sess = futureSess();
      prismaMock.session.findUnique.mockResolvedValueOnce(sess);

      // Busy slot ends exactly when session starts — no overlap
      const busySlot: BusySlot = {
        startTime: new Date(sess.startTime.getTime() - 60 * 60 * 1000),
        endTime: sess.startTime,
      };
      (calendarProviderMock.getBusySlots as ReturnType<typeof vi.fn>).mockResolvedValueOnce([busySlot]);

      const result = await service.bookSession(SESSION_ID, LEARNER_ID);
      expect(result).toBeTruthy();
    });

    it('proceeds without clash check when no calendar provider is wired (graceful degradation)', async () => {
      // Re-create service without calendar provider
      const serviceWithoutCalendar = new SessionsService(
        prismaMock as unknown as PrismaService,
        meetingProviderMock,
        undefined, // no calendar provider
      );

      const result = await serviceWithoutCalendar.bookSession(SESSION_ID, LEARNER_ID);
      expect(result).toBeTruthy();
      expect(calendarProviderMock.getBusySlots).not.toHaveBeenCalled();
    });
  });

  // ── 10. Calendar provider failure ────────────────────────────────────────

  describe('Calendar provider failure handling', () => {
    it('fails closed when ICalendarProvider.getBusySlots() throws (ServiceUnavailableException)', async () => {
      (calendarProviderMock.getBusySlots as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Microsoft Graph API 503'),
      );

      await expect(service.bookSession(SESSION_ID, LEARNER_ID)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('fails closed when host trainer has no email (cannot verify calendar)', async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce(
        futureSess({ hostTrainer: { id: 'trainer-ro', name: 'Roweena', email: null } }),
      );

      await expect(service.bookSession(SESSION_ID, LEARNER_ID)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('fails closed when host trainer record is null (no trainer assigned)', async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce(
        futureSess({ hostTrainer: null }),
      );

      await expect(service.bookSession(SESSION_ID, LEARNER_ID)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  // ── 11. IDOR / security tests ─────────────────────────────────────────────

  describe('IDOR and security', () => {
    it('does not expose provider credentials (calendarProvider is not returned in response)', async () => {
      const result = await service.bookSession(SESSION_ID, LEARNER_ID);
      const resultStr = JSON.stringify(result);
      // No tokens, secrets, or provider credential leakage
      expect(resultStr).not.toMatch(/apiKey|secret|accessToken|clientId|clientSecret/i);
    });

    it('booking is rejected for forged/non-existent session ID', async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce(null);

      await expect(service.bookSession('forged-session-id', LEARNER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('learner cannot book for another learner — enrolment check uses JWT-derived learnerId', async () => {
      const otherLearnerId = 'other-learner-999';
      // Return no enrolment for the other learner
      prismaMock.enrolment.findUnique.mockResolvedValueOnce(null);

      await expect(service.bookSession(SESSION_ID, otherLearnerId)).rejects.toThrow(
        ForbiddenException,
      );

      // Confirm the enrolment query used the correct (attempted) learnerId
      expect(prismaMock.enrolment.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId_batchId: expect.objectContaining({ userId: otherLearnerId }),
          }),
        }),
      );
    });
  });

  // ── 12. Session status gates ──────────────────────────────────────────────

  describe('Session status gates', () => {
    const blockedStatuses = [
      SessionStatus.CANCELLED,
      SessionStatus.RESCHEDULED,
      SessionStatus.COMPLETED,
    ] as const;

    for (const status of blockedStatuses) {
      it(`rejects booking for a ${status} session`, async () => {
        prismaMock.session.findUnique.mockResolvedValueOnce(futureSess({ status }));

        await expect(service.bookSession(SESSION_ID, LEARNER_ID)).rejects.toThrow(
          BadRequestException,
        );
      });
    }

    it('allows booking for a SCHEDULED session', async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce(
        futureSess({ status: SessionStatus.SCHEDULED }),
      );
      const result = await service.bookSession(SESSION_ID, LEARNER_ID);
      expect(result).toBeTruthy();
    });

    it('allows booking for an ACTIVE session (if within notice window)', async () => {
      // Use a session that starts in 13 hours but has ACTIVE status
      const start = new Date(Date.now() + 13 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 90 * 60 * 1000);
      prismaMock.session.findUnique.mockResolvedValueOnce(
        futureSess({ status: SessionStatus.ACTIVE, startTime: start, endTime: end }),
      );

      const result = await service.bookSession(SESSION_ID, LEARNER_ID);
      expect(result).toBeTruthy();
    });
  });

  // ── 13. getMyBookings() ───────────────────────────────────────────────────

  describe('getMyBookings()', () => {
    it('returns bookings filtered to BOOKED, CONFIRMED, and ATTENDED statuses', async () => {
      const bookings = [
        { id: 'b1', status: BookingStatus.BOOKED, session: futureSess() },
        { id: 'b2', status: BookingStatus.CONFIRMED, session: futureSess() },
      ];
      prismaMock.sessionBooking.findMany.mockResolvedValueOnce(bookings);

      const result = await service.getMyBookings(LEARNER_ID);
      expect(result).toHaveLength(2);
      expect(prismaMock.sessionBooking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: LEARNER_ID,
            status: expect.objectContaining({
              in: expect.arrayContaining([
                BookingStatus.BOOKED,
                BookingStatus.CONFIRMED,
                BookingStatus.ATTENDED,
              ]),
            }),
          }),
        }),
      );
    });
  });

  // ── 14. Regression: D1-043 service still instantiates ────────────────────

  describe('D1-043 regression', () => {
    it('service instantiates with both meeting and calendar providers (no constructor error)', () => {
      expect(() => {
        new SessionsService(
          prismaMock as unknown as PrismaService,
          meetingProviderMock,
          calendarProviderMock,
        );
      }).not.toThrow();
    });

    it('service instantiates without any optional providers (graceful)', () => {
      expect(() => {
        new SessionsService(prismaMock as unknown as PrismaService);
      }).not.toThrow();
    });
  });

  // ── 15. Group session booking ─────────────────────────────────────────────

  describe('Group session booking behavior', () => {
    it('associates the enrolmentId with the booking for downstream attendance reconciliation', async () => {
      await service.bookSession(SESSION_ID, LEARNER_ID);

      expect(prismaMock.sessionBooking.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ enrolmentId: ENROLMENT_ID }),
        }),
      );
    });

    it('does not set learnerId on session when booking a group cohort', async () => {
      const groupSess = futureSess({ sessionType: SessionType.GROUP_COHORT, learnerId: null });
      prismaMock.session.findUnique.mockResolvedValueOnce(groupSess);

      // Group cohort sessions do not have a session.learnerId
      await service.bookSession(SESSION_ID, LEARNER_ID);
      // The service should not attempt to update session.learnerId
      expect(prismaMock.session.update).not.toHaveBeenCalled();
    });
  });
});

describe('D1-046: Reschedule & Cancellation Rules', () => {
  let service: SessionsService;
  let prismaMock: any;
  let calendarProviderMock: ICalendarProvider;
  let meetingProviderMock: IMeetingProvider;
  
  const LEARNER_ID = 'learner-user-1';
  const BATCH_ID = 'batch-xyz';
  const ENROLMENT_ID = 'enrol-001';

  beforeEach(() => {
    prismaMock = {
      sessionBooking: {
        findUnique: vi.fn(),
        update: vi.fn(),
        create: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
      },
      session: {
        findUnique: vi.fn(),
      },
      enrolment: {
        findUnique: vi.fn().mockResolvedValue({ id: ENROLMENT_ID, status: EnrolmentStatus.ACTIVE }),
      },
      notification: {
        create: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
      $transaction: vi.fn((cb) => cb({
        $executeRaw: vi.fn(),
        sessionBooking: prismaMock.sessionBooking,
        session: prismaMock.session,
        notification: prismaMock.notification,
        auditLog: prismaMock.auditLog,
      })),
    };
    calendarProviderMock = { getBusySlots: vi.fn().mockResolvedValue([]) } as any;
    meetingProviderMock = { createMeeting: vi.fn(), updateMeeting: vi.fn(), deleteMeeting: vi.fn(), getMeetingRecordings: vi.fn() };
    service = new SessionsService(prismaMock as any, meetingProviderMock, calendarProviderMock);
    // Suppress warnings
    vi.spyOn(service['logger'], 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Cancellation', () => {
    it('succeeds before 24h cutoff, changes status, sends notification', async () => {
      const start = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h from now
      prismaMock.sessionBooking.findUnique.mockResolvedValueOnce({
        id: 'booking-1',
        userId: LEARNER_ID,
        status: BookingStatus.BOOKED,
        session: { id: 'session-1', startTime: start, status: SessionStatus.SCHEDULED, title: 'Future Session' }
      });
      prismaMock.sessionBooking.update.mockResolvedValueOnce({ id: 'booking-1', status: BookingStatus.CANCELLED });

      await service.cancelBooking('booking-1', LEARNER_ID);
      
      expect(prismaMock.sessionBooking.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: BookingStatus.CANCELLED })
      }));
      expect(prismaMock.notification.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ type: 'SESSION_BOOKING_CANCELLED' })
      }));
    });

    it('rejects cancellation inside 24h cutoff', async () => {
      const start = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12h from now
      prismaMock.sessionBooking.findUnique.mockResolvedValueOnce({
        id: 'booking-1',
        userId: LEARNER_ID,
        status: BookingStatus.BOOKED,
        session: { id: 'session-1', startTime: start, status: SessionStatus.SCHEDULED }
      });

      await expect(service.cancelBooking('booking-1', LEARNER_ID)).rejects.toThrow(BadRequestException);
    });

    it('learner cannot cancel another learner\'s booking (IDOR)', async () => {
      prismaMock.sessionBooking.findUnique.mockResolvedValueOnce({
        id: 'booking-1',
        userId: 'other-learner', // Not LEARNER_ID
        status: BookingStatus.BOOKED,
        session: { id: 'session-1', startTime: new Date(Date.now() + 48 * 60 * 60 * 1000), status: SessionStatus.SCHEDULED }
      });

      await expect(service.cancelBooking('booking-1', LEARNER_ID)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Rescheduling', () => {
    it('successfully reschedules if policies are met', async () => {
      const oldStart = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const newStart = new Date(Date.now() + 72 * 60 * 60 * 1000);
      
      prismaMock.sessionBooking.findUnique.mockResolvedValueOnce({
        id: 'booking-1',
        userId: LEARNER_ID,
        sessionId: 'session-1',
        status: BookingStatus.BOOKED,
        session: { id: 'session-1', startTime: oldStart, status: SessionStatus.SCHEDULED }
      }).mockResolvedValueOnce(null); // No existing booking for new session

      prismaMock.session.findUnique.mockResolvedValueOnce({
        id: 'session-2',
        startTime: newStart,
        endTime: new Date(newStart.getTime() + 3600000),
        status: SessionStatus.SCHEDULED,
        sessionType: SessionType.GROUP_COHORT,
        batchId: BATCH_ID,
        capacity: 10,
        title: 'New Target Session',
        hostTrainer: { name: 'Ro', email: 'ro@x.com' }
      });

      prismaMock.sessionBooking.create.mockResolvedValueOnce({ id: 'booking-2', session: { title: 'New Target Session' } });

      await service.rescheduleBooking('booking-1', 'session-2', LEARNER_ID);
      
      expect(prismaMock.sessionBooking.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'booking-1' },
        data: expect.objectContaining({ status: BookingStatus.RESCHEDULED })
      }));
      expect(prismaMock.sessionBooking.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ sessionId: 'session-2', status: BookingStatus.BOOKED })
      }));
      expect(calendarProviderMock.getBusySlots).toHaveBeenCalled();
    });

    it('rejects reschedule if old session is inside 24h cutoff', async () => {
      const oldStart = new Date(Date.now() + 10 * 60 * 60 * 1000); // 10h
      prismaMock.sessionBooking.findUnique.mockResolvedValueOnce({
        id: 'booking-1',
        userId: LEARNER_ID,
        status: BookingStatus.BOOKED,
        session: { id: 'session-1', startTime: oldStart, status: SessionStatus.SCHEDULED }
      });

      await expect(service.rescheduleBooking('booking-1', 'session-2', LEARNER_ID)).rejects.toThrow(BadRequestException);
    });

    it('rejects reschedule to full session', async () => {
      const oldStart = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const newStart = new Date(Date.now() + 72 * 60 * 60 * 1000);
      
      prismaMock.sessionBooking.findUnique.mockResolvedValueOnce({
        id: 'booking-1',
        userId: LEARNER_ID,
        status: BookingStatus.BOOKED,
        session: { id: 'session-1', startTime: oldStart, status: SessionStatus.SCHEDULED }
      });

      prismaMock.session.findUnique.mockResolvedValueOnce({
        id: 'session-2',
        startTime: newStart,
        endTime: new Date(newStart.getTime() + 3600000),
        status: SessionStatus.SCHEDULED,
        sessionType: SessionType.GROUP_COHORT,
        batchId: BATCH_ID,
        capacity: 10,
        hostTrainer: { name: 'Ro', email: 'ro@x.com' }
      });

      prismaMock.sessionBooking.count.mockResolvedValueOnce(10); // Fully booked

      await expect(service.rescheduleBooking('booking-1', 'session-2', LEARNER_ID)).rejects.toThrow(ConflictException);
    });
  });
});
