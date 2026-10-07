import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { SessionsController } from './sessions.controller.js';
import { SessionsService } from './sessions.service.js';
import { PERMISSIONS_KEY } from '../../common/decorators/require-permission.decorator.js';
import { Permission } from '../../config/permissions.config.js';
import { SessionType, MeetingProvider } from '@prisma/client';

describe('D1-043: SessionsController - RBAC and Routing Tests', () => {
  let controller: SessionsController;
  let serviceMock: any;
  const reflector = new Reflector();

  beforeEach(() => {
    serviceMock = {
      getSessions: vi.fn(),
      getMySessions: vi.fn(),
      getSessionById: vi.fn(),
      createSession: vi.fn(),
      updateSession: vi.fn(),
      cancelSession: vi.fn(),
      deleteSession: vi.fn(),
      getAttendanceForSession: vi.fn(),
      markAttendance: vi.fn(),
    };

    controller = new SessionsController(serviceMock as unknown as SessionsService);
  });

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
  });

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

    it('delegates getMySessions with user sub ID', async () => {
      serviceMock.getMySessions.mockResolvedValueOnce([{ id: 'sess-mine-1' }]);

      const res = await controller.getMySessions(mockReq);
      expect(res).toEqual([{ id: 'sess-mine-1' }]);
      expect(serviceMock.getMySessions).toHaveBeenCalledWith(mockUser.sub);
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
  });
});
