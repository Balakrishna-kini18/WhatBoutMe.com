import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionCheckinController } from './session-checkin.controller.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AttendanceService } from './attendance.service.js';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { AttendanceStatus, AttendanceSource } from '@prisma/client';

describe('Phase 5: SessionCheckinController - In-Person QR Check-in', () => {
  let controller: SessionCheckinController;
  let prismaMock: any;
  let attendanceServiceMock: any;

  beforeEach(() => {
    prismaMock = {
      session: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    };

    attendanceServiceMock = {
      checkInWithToken: vi.fn(),
    };

    controller = new SessionCheckinController(
      prismaMock as unknown as PrismaService,
      attendanceServiceMock as unknown as AttendanceService,
    );
  });

  describe('POST /api/sessions/:sessionId/check-in/token', () => {
    it('generates a new check-in secret token when session does not have one', async () => {
      prismaMock.session.findUnique.mockResolvedValue({
        id: 'sess-1',
        endTime: new Date('2026-10-15T18:00:00Z'),
        checkinTokenSecret: null,
      });
      prismaMock.session.update.mockResolvedValue({});

      const req = { user: { sub: 'admin-1', role: 'ADMIN' } };
      const result = await controller.generateCheckInToken('sess-1', req);

      expect(result.sessionId).toBe('sess-1');
      expect(result.token).toBeDefined();
      expect(result.checkInUrl).toContain(`/check-in/sess-1?token=`);
      expect(prismaMock.session.update).toHaveBeenCalledWith({
        where: { id: 'sess-1' },
        data: { checkinTokenSecret: expect.any(String) },
      });
    });

    it('returns existing token if already generated', async () => {
      prismaMock.session.findUnique.mockResolvedValue({
        id: 'sess-1',
        endTime: new Date('2026-10-15T18:00:00Z'),
        checkinTokenSecret: 'existing-secret-123',
      });

      const req = { user: { sub: 'admin-1', role: 'ADMIN' } };
      const result = await controller.generateCheckInToken('sess-1', req);

      expect(result.token).toBe('existing-secret-123');
      expect(prismaMock.session.update).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/sessions/:sessionId/check-in', () => {
    it('records learner attendance with source QR_CHECKIN when token is valid', async () => {
      const req = { user: { sub: 'learner-1', role: 'USER' } };
      attendanceServiceMock.checkInWithToken.mockResolvedValue({
        id: 'att-1',
        status: AttendanceStatus.PRESENT,
        source: AttendanceSource.QR_CHECKIN,
      });

      const result = await controller.checkInLearner('sess-1', { token: 'secret-123' }, req);

      expect(attendanceServiceMock.checkInWithToken).toHaveBeenCalledWith(
        'sess-1',
        'learner-1',
        'secret-123',
      );
      expect(result.source).toBe(AttendanceSource.QR_CHECKIN);
    });

    it('rejects check-in when token is missing', async () => {
      const req = { user: { sub: 'learner-1', role: 'USER' } };
      await expect(
        controller.checkInLearner('sess-1', { token: '' }, req),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
