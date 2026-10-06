import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { QuizzesController } from './quizzes.controller.js';
import { QuizzesService } from './quizzes.service.js';
import { Permission } from '../../config/permissions.config.js';
import { PERMISSIONS_KEY } from '../../common/decorators/require-permission.decorator.js';

describe('D1-036: QuizzesController - Endpoints & Permissions', () => {
  let controller: QuizzesController;
  let serviceMock: any;
  let reflector: Reflector;

  const mockUser = { id: 'u1', sub: 'u1', role: 'USER' };
  const mockAdmin = { id: 'admin1', sub: 'admin1', role: 'ADMIN' };

  beforeEach(() => {
    serviceMock = {
      findAll: vi.fn().mockResolvedValue([{ id: 'q1' }]),
      findOne: vi.fn().mockResolvedValue({ id: 'q1' }),
      create: vi.fn().mockResolvedValue({ id: 'q1' }),
      update: vi.fn().mockResolvedValue({ id: 'q1' }),
      remove: vi.fn().mockResolvedValue({ id: 'q1' }),
      startQuiz: vi.fn().mockResolvedValue({ attemptId: 'att-1' }),
      submitQuiz: vi.fn().mockResolvedValue({ attemptId: 'att-1', score: 100 }),
      getActiveAttempt: vi.fn().mockResolvedValue({ attemptId: 'att-1' }),
      resetQuizAttempts: vi.fn().mockResolvedValue({ success: true }),
      getEnrolmentQuizAttempts: vi.fn().mockResolvedValue([{ id: 'att-1' }]),
    };

    reflector = new Reflector();
    controller = new QuizzesController(serviceMock as unknown as QuizzesService);
  });

  describe('1. CRUD Delegation', () => {
    it('findAll delegates to service.findAll', async () => {
      const res = await controller.findAll();
      expect(res).toEqual([{ id: 'q1' }]);
      expect(serviceMock.findAll).toHaveBeenCalled();
    });

    it('findOne delegates to service.findOne', async () => {
      const res = await controller.findOne('q1');
      expect(res).toEqual({ id: 'q1' });
      expect(serviceMock.findOne).toHaveBeenCalledWith('q1');
    });

    it('create delegates to service.create', async () => {
      const dto = { stepId: 'step-1' };
      const res = await controller.create(dto);
      expect(res).toEqual({ id: 'q1' });
      expect(serviceMock.create).toHaveBeenCalledWith(dto);
    });

    it('update delegates to service.update', async () => {
      const dto = { passMark: 80 };
      const res = await controller.update('q1', dto);
      expect(res).toEqual({ id: 'q1' });
      expect(serviceMock.update).toHaveBeenCalledWith('q1', dto);
    });

    it('remove delegates to service.remove', async () => {
      const res = await controller.remove('q1');
      expect(res).toEqual({ id: 'q1' });
      expect(serviceMock.remove).toHaveBeenCalledWith('q1');
    });
  });

  describe('2. Learner Quiz Engine Delegation', () => {
    it('startQuiz delegates to service.startQuiz with actor and dto', async () => {
      const dto = { enrolmentId: 'enr-1' };
      const req = { user: mockUser };
      const res = await controller.startQuiz('q1', req, dto);

      expect(res).toEqual({ attemptId: 'att-1' });
      expect(serviceMock.startQuiz).toHaveBeenCalledWith('q1', mockUser, dto);
    });

    it('submitQuiz delegates to service.submitQuiz with actor and dto', async () => {
      const dto = { attemptId: 'att-1', answers: [] };
      const req = { user: mockUser };
      const res = await controller.submitQuiz('q1', req, dto);

      expect(res).toEqual({ attemptId: 'att-1', score: 100 });
      expect(serviceMock.submitQuiz).toHaveBeenCalledWith('q1', mockUser, dto);
    });

    it('getActiveAttempt delegates to service.getActiveAttempt', async () => {
      const req = { user: mockUser };
      const res = await controller.getActiveAttempt('q1', req);

      expect(res).toEqual({ attemptId: 'att-1' });
      expect(serviceMock.getActiveAttempt).toHaveBeenCalledWith('q1', mockUser);
    });
  });

  describe('3. Administrative Actions Delegation', () => {
    it('resetAttempts delegates to service.resetQuizAttempts with actor and IP', async () => {
      const dto = { reason: 'Resetting after system disconnect' };
      const req = { user: mockAdmin, ip: '10.0.0.1' };
      const res = await controller.resetAttempts('q1', 'enr-1', req, dto);

      expect(res).toEqual({ success: true });
      expect(serviceMock.resetQuizAttempts).toHaveBeenCalledWith(
        'q1',
        'enr-1',
        mockAdmin,
        dto,
        '10.0.0.1',
      );
    });

    it('getEnrolmentAttempts delegates to service.getEnrolmentQuizAttempts', async () => {
      const req = { user: mockAdmin };
      const res = await controller.getEnrolmentAttempts('q1', 'enr-1', req);

      expect(res).toEqual([{ id: 'att-1' }]);
      expect(serviceMock.getEnrolmentQuizAttempts).toHaveBeenCalledWith(
        'q1',
        'enr-1',
        mockAdmin,
      );
    });
  });

  describe('4. Question Bank Administration Delegation', () => {
    it('getQuestions delegates to service.getQuestionsForQuiz', async () => {
      serviceMock.getQuestionsForQuiz = vi.fn().mockResolvedValue([{ id: 'question-1' }]);
      const res = await controller.getQuestions('q1');
      expect(res).toEqual([{ id: 'question-1' }]);
      expect(serviceMock.getQuestionsForQuiz).toHaveBeenCalledWith('q1');
    });

    it('createQuestion delegates to service.createQuestionForQuiz', async () => {
      serviceMock.createQuestionForQuiz = vi.fn().mockResolvedValue({ id: 'question-created' });
      const dto = {
        text: 'What is step 1?',
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: false },
        ],
      };
      const res = await controller.createQuestion('q1', dto as any);
      expect(res).toEqual({ id: 'question-created' });
      expect(serviceMock.createQuestionForQuiz).toHaveBeenCalledWith('q1', dto);
    });

    it('updateQuestion delegates to service.updateQuestion', async () => {
      serviceMock.updateQuestion = vi.fn().mockResolvedValue({ id: 'question-updated' });
      const dto = { text: 'Updated question text?' };
      const res = await controller.updateQuestion('question-1', dto as any);
      expect(res).toEqual({ id: 'question-updated' });
      expect(serviceMock.updateQuestion).toHaveBeenCalledWith('question-1', dto);
    });

    it('deleteQuestion delegates to service.deleteQuestion', async () => {
      serviceMock.deleteQuestion = vi.fn().mockResolvedValue({ success: true, questionId: 'question-1' });
      const res = await controller.deleteQuestion('question-1');
      expect(res).toEqual({ success: true, questionId: 'question-1' });
      expect(serviceMock.deleteQuestion).toHaveBeenCalledWith('question-1');
    });
  });

  describe('5. Metadata & Permissions Verification', () => {
    it('decorates findAll and findOne with QUIZZES_READ permission', () => {
      const permAll = reflector.get(PERMISSIONS_KEY, QuizzesController.prototype.findAll);
      const permOne = reflector.get(PERMISSIONS_KEY, QuizzesController.prototype.findOne);
      expect(permAll).toEqual([Permission.QUIZZES_READ]);
      expect(permOne).toEqual([Permission.QUIZZES_READ]);
    });

    it('decorates create with QUIZZES_CREATE permission', () => {
      const perm = reflector.get(PERMISSIONS_KEY, QuizzesController.prototype.create);
      expect(perm).toEqual([Permission.QUIZZES_CREATE]);
    });

    it('decorates update with QUIZZES_UPDATE permission', () => {
      const perm = reflector.get(PERMISSIONS_KEY, QuizzesController.prototype.update);
      expect(perm).toEqual([Permission.QUIZZES_UPDATE]);
    });

    it('decorates remove with QUIZZES_DELETE permission', () => {
      const perm = reflector.get(PERMISSIONS_KEY, QuizzesController.prototype.remove);
      expect(perm).toEqual([Permission.QUIZZES_DELETE]);
    });

    it('decorates resetAttempts with QUIZZES_RESET_ATTEMPTS permission', () => {
      const perm = reflector.get(PERMISSIONS_KEY, QuizzesController.prototype.resetAttempts);
      expect(perm).toEqual([Permission.QUIZZES_RESET_ATTEMPTS]);
    });

    it('decorates getEnrolmentAttempts with QUIZZES_READ permission', () => {
      const perm = reflector.get(PERMISSIONS_KEY, QuizzesController.prototype.getEnrolmentAttempts);
      expect(perm).toEqual([Permission.QUIZZES_READ]);
    });

    it('decorates getQuestions with QUIZZES_READ permission', () => {
      const perm = reflector.get(PERMISSIONS_KEY, QuizzesController.prototype.getQuestions);
      expect(perm).toEqual([Permission.QUIZZES_READ]);
    });

    it('decorates createQuestion with QUIZZES_CREATE permission', () => {
      const perm = reflector.get(PERMISSIONS_KEY, QuizzesController.prototype.createQuestion);
      expect(perm).toEqual([Permission.QUIZZES_CREATE]);
    });

    it('decorates updateQuestion with QUIZZES_UPDATE permission', () => {
      const perm = reflector.get(PERMISSIONS_KEY, QuizzesController.prototype.updateQuestion);
      expect(perm).toEqual([Permission.QUIZZES_UPDATE]);
    });

    it('decorates deleteQuestion with QUIZZES_DELETE permission', () => {
      const perm = reflector.get(PERMISSIONS_KEY, QuizzesController.prototype.deleteQuestion);
      expect(perm).toEqual([Permission.QUIZZES_DELETE]);
    });
  });
});

