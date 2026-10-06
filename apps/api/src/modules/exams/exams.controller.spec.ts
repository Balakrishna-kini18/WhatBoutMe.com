import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { ExamsController } from './exams.controller.js';
import { ExamsService } from './exams.service.js';
import { PERMISSIONS_KEY } from '../../common/decorators/require-permission.decorator.js';
import { Permission } from '../../config/permissions.config.js';

describe('D1-038: ExamsController - Controller & Route Tests', () => {
  let controller: ExamsController;
  let serviceMock: any;
  const reflector = new Reflector();

  beforeEach(() => {
    serviceMock = {
      getExamConfig: vi.fn(),
      startExam: vi.fn(),
      submitExam: vi.fn(),
      getActiveAttempt: vi.fn(),
      resetExamAttempts: vi.fn(),
      getEnrolmentExamAttempts: vi.fn(),
    };

    controller = new ExamsController(serviceMock as unknown as ExamsService);
  });

  describe('Route Handler Delegations', () => {
    it('delegates getExamConfig to service', async () => {
      serviceMock.getExamConfig.mockResolvedValueOnce({ id: 'exam-1' });
      const req = { user: { id: 'u1' } };

      const res = await controller.getExamConfig('prog-1', req);
      expect(res).toEqual({ id: 'exam-1' });
      expect(serviceMock.getExamConfig).toHaveBeenCalledWith('prog-1', req.user);
    });

    it('delegates start to service', async () => {
      serviceMock.startExam.mockResolvedValueOnce({ attemptId: 'att-1' });
      const req = { user: { id: 'u1' } };

      const res = await controller.start('exam-1', req, {});
      expect(res).toEqual({ attemptId: 'att-1' });
      expect(serviceMock.startExam).toHaveBeenCalledWith('exam-1', req.user, {});
    });

    it('delegates submit to service', async () => {
      serviceMock.submitExam.mockResolvedValueOnce({ score: 90, passed: true });
      const req = { user: { id: 'u1' } };
      const dto = { answers: [] };

      const res = await controller.submit('exam-1', dto, req);
      expect(res).toEqual({ score: 90, passed: true });
      expect(serviceMock.submitExam).toHaveBeenCalledWith('exam-1', dto, req.user);
    });

    it('delegates getActiveAttempt to service', async () => {
      serviceMock.getActiveAttempt.mockResolvedValueOnce({ attemptId: 'att-1' });
      const req = { user: { id: 'u1' } };

      const res = await controller.getActiveAttempt('exam-1', req);
      expect(res).toEqual({ attemptId: 'att-1' });
      expect(serviceMock.getActiveAttempt).toHaveBeenCalledWith('exam-1', req.user);
    });

    it('delegates resetAttempts to service with ip', async () => {
      serviceMock.resetExamAttempts.mockResolvedValueOnce({ success: true });
      const req = { user: { id: 'admin-1' }, ip: '192.168.1.1' };
      const dto = { reason: 'Reset reason' };

      const res = await controller.resetAttempts('exam-1', 'enrol-1', dto, req);
      expect(res).toEqual({ success: true });
      expect(serviceMock.resetExamAttempts).toHaveBeenCalledWith(
        'exam-1',
        'enrol-1',
        dto,
        req.user,
        '192.168.1.1',
      );
    });

    it('delegates getEnrolmentAttempts to service', async () => {
      serviceMock.getEnrolmentExamAttempts.mockResolvedValueOnce([]);
      const req = { user: { id: 'admin-1' } };

      const res = await controller.getEnrolmentAttempts('exam-1', 'enrol-1', req);
      expect(res).toEqual([]);
      expect(serviceMock.getEnrolmentExamAttempts).toHaveBeenCalledWith(
        'exam-1',
        'enrol-1',
        req.user,
      );
    });
  });

  describe('Route Permission Annotations', () => {
    it('decorates resetAttempts with QUIZZES_RESET_ATTEMPTS permission', () => {
      const perm = reflector.get(
        PERMISSIONS_KEY,
        ExamsController.prototype.resetAttempts,
      );
      expect(perm).toEqual([Permission.QUIZZES_RESET_ATTEMPTS]);
    });

    it('decorates getEnrolmentAttempts with QUIZZES_READ permission', () => {
      const perm = reflector.get(
        PERMISSIONS_KEY,
        ExamsController.prototype.getEnrolmentAttempts,
      );
      expect(perm).toEqual([Permission.QUIZZES_READ]);
    });
  });
});
