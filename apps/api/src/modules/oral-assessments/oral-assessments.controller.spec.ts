import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { OralAssessmentsController } from './oral-assessments.controller.js';
import { OralAssessmentsService } from './oral-assessments.service.js';
import { PERMISSIONS_KEY } from '../../common/decorators/require-permission.decorator.js';
import { Permission } from '../../config/permissions.config.js';

describe('D1-038: OralAssessmentsController - Route & Permission Tests', () => {
  let controller: OralAssessmentsController;
  let serviceMock: any;
  const reflector = new Reflector();

  beforeEach(() => {
    serviceMock = {
      create: vi.fn(),
      findByEnrolment: vi.fn(),
      findByBatch: vi.fn(),
      findOne: vi.fn(),
      grade: vi.fn(),
    };

    controller = new OralAssessmentsController(
      serviceMock as unknown as OralAssessmentsService,
    );
  });

  describe('Route Handler Delegations', () => {
    it('delegates create to service', async () => {
      serviceMock.create.mockResolvedValueOnce({ id: 'oa-1' });
      const req = { user: { id: 'admin-1' } };
      const dto = { enrolmentId: 'enrol-1', programId: 'prog-1' };

      const res = await controller.create(dto, req);
      expect(res).toEqual({ id: 'oa-1' });
      expect(serviceMock.create).toHaveBeenCalledWith(dto, req.user);
    });

    it('delegates findByEnrolment to service', async () => {
      serviceMock.findByEnrolment.mockResolvedValueOnce([]);
      const req = { user: { id: 'learner-1' } };

      const res = await controller.findByEnrolment('enrol-1', req);
      expect(res).toEqual([]);
      expect(serviceMock.findByEnrolment).toHaveBeenCalledWith('enrol-1', req.user);
    });

    it('delegates findByBatch to service', async () => {
      serviceMock.findByBatch.mockResolvedValueOnce([]);
      const req = { user: { id: 'manager-1' } };

      const res = await controller.findByBatch('batch-1', req);
      expect(res).toEqual([]);
      expect(serviceMock.findByBatch).toHaveBeenCalledWith('batch-1', req.user);
    });

    it('delegates findOne to service', async () => {
      serviceMock.findOne.mockResolvedValueOnce({ id: 'oa-1' });
      const req = { user: { id: 'learner-1' } };

      const res = await controller.findOne('oa-1', req);
      expect(res).toEqual({ id: 'oa-1' });
      expect(serviceMock.findOne).toHaveBeenCalledWith('oa-1', req.user);
    });

    it('delegates grade to service', async () => {
      serviceMock.grade.mockResolvedValueOnce({ id: 'oa-1', status: 'PASSED' });
      const req = { user: { id: 'admin-1' } };
      const dto = {
        scores: [{ rubricCategory: 'Knowledge', score: 10 }],
        passed: true,
        trainerNotes: 'Well done',
      };

      const res = await controller.grade('oa-1', dto, req);
      expect(res).toEqual({ id: 'oa-1', status: 'PASSED' });
      expect(serviceMock.grade).toHaveBeenCalledWith('oa-1', dto, req.user);
    });
  });

  describe('Route Permission Annotations', () => {
    it('decorates create with ORAL_ASSESSMENTS_GRADE permission', () => {
      const perm = reflector.get(
        PERMISSIONS_KEY,
        OralAssessmentsController.prototype.create,
      );
      expect(perm).toEqual([Permission.ORAL_ASSESSMENTS_GRADE]);
    });

    it('decorates findByBatch with ORAL_ASSESSMENTS_READ permission', () => {
      const perm = reflector.get(
        PERMISSIONS_KEY,
        OralAssessmentsController.prototype.findByBatch,
      );
      expect(perm).toEqual([Permission.ORAL_ASSESSMENTS_READ]);
    });

    it('decorates grade with ORAL_ASSESSMENTS_GRADE permission', () => {
      const perm = reflector.get(
        PERMISSIONS_KEY,
        OralAssessmentsController.prototype.grade,
      );
      expect(perm).toEqual([Permission.ORAL_ASSESSMENTS_GRADE]);
    });
  });
});
