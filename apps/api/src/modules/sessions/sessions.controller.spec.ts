/**
 * D1-043 / D1-044: SessionsController — RBAC, Routing, and Booking Tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { SessionsController } from './sessions.controller.js';
import { SessionsService } from './sessions.service.js';
import { PERMISSIONS_KEY } from '../../common/decorators/require-permission.decorator.js';
import { Permission } from '../../config/permissions.config.js';
import { SessionType, MeetingProvider, BookingStatus } from '@prisma/client';

describe('SessionsController — D1-043 & D1-044 RBAC and Routing Tests', () => {
  let controller: SessionsController;
  let serviceMock: any;
  const reflector = new Reflector();

  beforeEach(() => {
    serviceMock = {
      getSessions: vi.fn(),
      getMySessions: vi.fn(),
      getUserTimezoneForDisplay: vi.fn().mockResolvedValue('UTC'),
      getSessionById: vi.fn(),
      createSession: vi.fn(),
      updateSession: vi.fn(),
      cancelSession: vi.fn(),
      deleteSession: vi.fn(),
      getAttendanceForSession: vi.fn(),
      markAttendance: vi.fn(),
      // D1-044
      bookSession: vi.fn(),
      getMyBookings: vi.fn(),
    };

    controller = new SessionsController(serviceMock as unknown as SessionsService);
  });

  // ─── D1-043 RBAC Metadata ─────────────────────────────────────────────────

  describe('RBAC Metadata and Named Permissions', () => {
    it('requires SESSIONS_CREATE for createSession', () => {
      const perms = reflector.get<string[]>(PERMISSIONS_KEY, controller.createSession);
      expect(perms).toContain(Permission.SESSIONS_CREATE);
    });

    it('requires SESSIONS_READ for getSessions, getMySessions, getAllSessions, getSessionById', () => {
      expect(reflector.get<string[]>(PERMISSIONS_KEY, controller.getSessions)).toContain(
        Permission.SESSIONS_READ,
      );
      expect(reflector.get<string[]>(PERMISSIONS_KEY, controller.getMySessions)).toContain(
        Permission.SESSIONS_READ,
      );
      expect(reflector.get<string[]>(PERMISSIONS_KEY, controller.getAllSessions)).toContain(
        Permission.SESSIONS_READ,
      );
      expect(reflector.get<string[]>(PERMISSIONS_KEY, controller.getSessionById)).toContain(
        Permission.SESSIONS_READ,
      );
    });

    it('requires SESSIONS_UPDATE for updateSession', () => {
      const perms = reflector.get<string[]>(PERMISSIONS_KEY, controller.updateSession);
      expect(perms).toContain(Permission.SESSIONS_UPDATE);
    });

    it('requires SESSIONS_CANCEL for cancelSession', () => {
      const perms = reflector.get<string[]>(PERMISSIONS_KEY, controller.cancelSession);
      expect(perms).toContain(Permission.SESSIONS_CANCEL);
    });

    it('requires SESSIONS_DELETE for deleteSession', () => {
      const perms = reflector.get<string[]>(PERMISSIONS_KEY, controller.deleteSession);
      expect(perms).toContain(Permission.SESSIONS_DELETE);
    });

    it('requires appropriate ATTENDANCE permissions for attendance handlers', () => {
      expect(reflector.get<string[]>(PERMISSIONS_KEY, controller.getAttendance)).toContain(
        Permission.ATTENDANCE_READ,
      );
      expect(reflector.get<string[]>(PERMISSIONS_KEY, controller.markSelfAttendance)).toContain(
        Permission.ATTENDANCE_MARK,
      );
      expect(reflector.get<string[]>(PERMISSIONS_KEY, controller.overrideAttendance)).toContain(
        Permission.ATTENDANCE_CORRECT,
      );
    });

    // D1-044 permission checks
    it('D1-044: requires SESSIONS_BOOK for bookSession', () => {
      const perms = reflector.get<string[]>(PERMISSIONS_KEY, controller.bookSession);
      expect(perms).toContain(Permission.SESSIONS_BOOK);
    });

    it('D1-044: requires SESSIONS_READ for getMyBookings', () => {
      const perms = reflector.get<string[]>(PERMISSIONS_KEY, controller.getMyBookings);
      expect(perms).toContain(Permission.SESSIONS_READ);
    });
  });

  // ─── Route Handler Delegations ────────────────────────────────────────────

  describe('Route Handler Delegations', () => {
    const mockUser = { sub: 'admin-1', role: 'SUPER_ADMIN' };
    const mockReq = { user: mockUser };

    it('delegates createSession with body and actor user', async () => {
      const dto = {
        batchId: 'batch-1',
        title: 'Step 1 Cohort Session',
        startTime: '2026-11-01T10:00:00.000Z',
        endTime: '2026-11-01T11:00:00.000Z',
        sessionType: SessionType.GROUP_COHORT,
        meetingProvider: MeetingProvider.ZOOM,
      };
      serviceMock.createSession.mockResolvedValueOnce({ id: 'sess-1', ...dto });

      const res = await controller.createSession(dto as any, mockReq);
      expect(res).toEqual({ id: 'sess-1', ...dto });
      expect(serviceMock.createSession).toHaveBeenCalledWith(dto, mockUser);
    });

    it('delegates getSessions with query filters and actor user', async () => {
      const query = { batchId: 'batch-1' };
      serviceMock.getSessions.mockResolvedValueOnce([{ id: 'sess-1' }]);

      const res = await controller.getSessions(query as any, mockReq);
      expect(res).toEqual([{ id: 'sess-1' }]);
      expect(serviceMock.getSessions).toHaveBeenCalledWith(query, mockUser);
    });

    it('delegates getMySessions with user sub ID (D1-045: also passes stored timezone)', async () => {
      serviceMock.getUserTimezoneForDisplay.mockResolvedValueOnce('Asia/Kolkata');
      serviceMock.getMySessions.mockResolvedValueOnce([{ id: 'sess-mine-1' }]);

      const res = await controller.getMySessions(mockReq);
      expect(res).toEqual([{ id: 'sess-mine-1' }]);
      expect(serviceMock.getUserTimezoneForDisplay).toHaveBeenCalledWith(mockUser.sub);
      expect(serviceMock.getMySessions).toHaveBeenCalledWith(mockUser.sub, 'Asia/Kolkata');
    });

    it('delegates getAllSessions to getSessions with empty query', async () => {
      serviceMock.getSessions.mockResolvedValueOnce([{ id: 'all-1' }]);

      const res = await controller.getAllSessions(mockReq);
      expect(res).toEqual([{ id: 'all-1' }]);
      expect(serviceMock.getSessions).toHaveBeenCalledWith({}, mockUser);
    });

    it('delegates getSessionById with id and actor user', async () => {
      serviceMock.getSessionById.mockResolvedValueOnce({ id: 'sess-123' });

      const res = await controller.getSessionById('sess-123', mockReq);
      expect(res).toEqual({ id: 'sess-123' });
      expect(serviceMock.getSessionById).toHaveBeenCalledWith('sess-123', mockUser);
    });

    it('delegates updateSession with id, body, and actor user', async () => {
      const updateDto = { title: 'Updated Title' };
      serviceMock.updateSession.mockResolvedValueOnce({ id: 'sess-1', ...updateDto });

      const res = await controller.updateSession('sess-1', updateDto, mockReq);
      expect(res).toEqual({ id: 'sess-1', ...updateDto });
      expect(serviceMock.updateSession).toHaveBeenCalledWith('sess-1', updateDto, mockUser);
    });

    it('delegates cancelSession with id, reason, and actor user', async () => {
      serviceMock.cancelSession.mockResolvedValueOnce({ id: 'sess-1', status: 'CANCELLED' });

      const res = await controller.cancelSession('sess-1', 'Trainer unwell', mockReq);
      expect(res).toEqual({ id: 'sess-1', status: 'CANCELLED' });
      expect(serviceMock.cancelSession).toHaveBeenCalledWith('sess-1', 'Trainer unwell', mockUser);
    });

    it('delegates deleteSession with id and actor user', async () => {
      serviceMock.deleteSession.mockResolvedValueOnce({ message: 'Session deleted successfully.' });

      const res = await controller.deleteSession('sess-1', mockReq);
      expect(res).toEqual({ message: 'Session deleted successfully.' });
      expect(serviceMock.deleteSession).toHaveBeenCalledWith('sess-1', mockUser);
    });

    it('delegates attendance retrieval and marking to service', async () => {
      serviceMock.getAttendanceForSession.mockResolvedValueOnce([]);
      await controller.getAttendance('sess-1', mockReq);
      expect(serviceMock.getAttendanceForSession).toHaveBeenCalledWith('sess-1', mockUser);

      serviceMock.markAttendance.mockResolvedValueOnce({ status: 'PRESENT' });
      await controller.markSelfAttendance('sess-1', mockReq);
      expect(serviceMock.markAttendance).toHaveBeenCalledWith('sess-1', mockUser.sub, false);

      await controller.overrideAttendance('sess-1', 'learner-99');
      expect(serviceMock.markAttendance).toHaveBeenCalledWith('sess-1', 'learner-99', true);
    });

    // ─── D1-044 routing delegations ──────────────────────────────────────────

    it('D1-044: delegates bookSession with sessionId and JWT-derived learnerId (req.user.sub)', async () => {
      const bookingResult = {
        id: 'booking-1',
        sessionId: 'sess-1',
        userId: mockUser.sub,
        status: BookingStatus.BOOKED,
      };
      serviceMock.bookSession.mockResolvedValueOnce(bookingResult);

      const res = await controller.bookSession('sess-1', mockReq);
      expect(res).toEqual(bookingResult);
      // Must NOT pass any body field; learnerId comes from JWT only
      expect(serviceMock.bookSession).toHaveBeenCalledWith('sess-1', mockUser.sub);
    });

    it('D1-044: bookSession always uses req.user.sub as learnerId (no client-supplied id trusted)', async () => {
      serviceMock.bookSession.mockResolvedValueOnce({ id: 'booking-1' });

      const fakeReq = { user: { sub: 'jwt-derived-user-id', role: 'USER' } };
      await controller.bookSession('sess-1', fakeReq);
      expect(serviceMock.bookSession).toHaveBeenCalledWith('sess-1', 'jwt-derived-user-id');
    });

    it('D1-044: delegates getMyBookings with JWT-derived userId', async () => {
      const bookings = [{ id: 'booking-2', status: 'BOOKED' }];
      serviceMock.getMyBookings.mockResolvedValueOnce(bookings);

      const res = await controller.getMyBookings(mockReq);
      expect(res).toEqual(bookings);
      expect(serviceMock.getMyBookings).toHaveBeenCalledWith(mockUser.sub);
    });
  });
});
