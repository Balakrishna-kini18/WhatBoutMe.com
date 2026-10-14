import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Role } from '@prisma/client';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { LessonProgressController } from './lesson-progress.controller.js';
import { ProgressionService } from './progression.service.js';
import { RecordMediaProgressDto } from './dto/index.js';

describe('D1-035: LessonProgressController Tests', () => {
  let controller: LessonProgressController;
  let serviceMock: any;

  beforeEach(() => {
    serviceMock = {
      recordMediaProgress: vi.fn().mockResolvedValue({
        lessonId: 'lesson-1',
        enrolmentId: 'enrol-1',
        viewed: false,
        progressPercent: 50,
        lastPositionSec: 150,
        completedAt: null,
      }),
      completeDocumentOrTextLesson: vi.fn().mockResolvedValue({
        lessonId: 'lesson-pdf-1',
        enrolmentId: 'enrol-1',
        viewed: true,
        progressPercent: 100,
        lastPositionSec: null,
        completedAt: new Date(),
      }),
      getLearnerLessonProgress: vi.fn().mockResolvedValue({
        lessonId: 'lesson-1',
        enrolmentId: 'enrol-1',
        viewed: false,
        progressPercent: 50,
        lastPositionSec: 150,
        completedAt: null,
        durationSec: 300,
      }),
    };

    controller = new LessonProgressController(serviceMock as unknown as ProgressionService);
  });

  describe('Media Heartbeat Endpoint (POST /progress/lessons/:lessonId/heartbeat)', () => {
    it('delegates to recordMediaProgress with lessonId, req.user, and positionSec', async () => {
      const req = { user: { sub: 'learner-1', role: Role.USER } };
      const dto: RecordMediaProgressDto = { positionSec: 150 };

      const res = await controller.recordMediaProgress('lesson-1', dto, req);

      expect(serviceMock.recordMediaProgress).toHaveBeenCalledWith(
        'lesson-1',
        req.user,
        150,
        undefined,
        undefined,
      );
      expect(res.progressPercent).toBe(50);
      expect(res.lastPositionSec).toBe(150);
    });
  });

  describe('Document/Text Complete Endpoint (POST /progress/lessons/:lessonId/complete)', () => {
    it('delegates to completeDocumentOrTextLesson with lessonId and req.user', async () => {
      const req = { user: { sub: 'learner-1', role: Role.USER } };

      const res = await controller.completeDocumentOrTextLesson('lesson-pdf-1', req);

      expect(serviceMock.completeDocumentOrTextLesson).toHaveBeenCalledWith(
        'lesson-pdf-1',
        req.user,
      );
      expect(res.viewed).toBe(true);
      expect(res.progressPercent).toBe(100);
    });
  });

  describe('Learner Progress Retrieval Endpoint (GET /progress/lessons/:lessonId)', () => {
    it('delegates to getLearnerLessonProgress with lessonId and req.user', async () => {
      const req = { user: { sub: 'learner-1', role: Role.USER } };

      const res = await controller.getLearnerLessonProgress('lesson-1', req);

      expect(serviceMock.getLearnerLessonProgress).toHaveBeenCalledWith(
        'lesson-1',
        req.user,
      );
      expect(res.lessonId).toBe('lesson-1');
      expect(res.durationSec).toBe(300);
    });
  });

  describe('RecordMediaProgressDto Validation', () => {
    const toDto = (plain: any) => plainToInstance(RecordMediaProgressDto, plain);

    it('accepts valid non-negative numbers', async () => {
      const dto = toDto({ positionSec: 150 });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);

      const dtoZero = toDto({ positionSec: 0 });
      const errorsZero = await validate(dtoZero);
      expect(errorsZero).toHaveLength(0);

      const dtoFloat = toDto({ positionSec: 89.5 });
      const errorsFloat = await validate(dtoFloat);
      expect(errorsFloat).toHaveLength(0);
    });

    it('rejects negative numbers', async () => {
      const dto = toDto({ positionSec: -1 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints?.min).toBeDefined();
    });

    it('rejects missing or undefined positionSec', async () => {
      const dto = toDto({});
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects non-numeric string values', async () => {
      const dto = toDto({ positionSec: 'one-hundred' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints?.isNumber).toBeDefined();
    });

    it('rejects Infinity and NaN', async () => {
      const dtoInf = toDto({ positionSec: Infinity });
      const errorsInf = await validate(dtoInf);
      expect(errorsInf.length).toBeGreaterThan(0);

      const dtoNaN = toDto({ positionSec: NaN });
      const errorsNaN = await validate(dtoNaN);
      expect(errorsNaN.length).toBeGreaterThan(0);
    });

    it('forbids extraneous fields when validated with forbidNonWhitelisted', async () => {
      const dto = toDto({
        positionSec: 150,
        durationSec: 150,
        completed: true,
        progressPercent: 100,
        enrolmentId: 'hack-1',
      });
      const errors = await validate(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      expect(errors.length).toBeGreaterThan(0);
      const errorProps = errors.map((e) => e.property);
      expect(errorProps).toContain('durationSec');
      expect(errorProps).toContain('completed');
      expect(errorProps).toContain('progressPercent');
      expect(errorProps).toContain('enrolmentId');
    });
  });
});
