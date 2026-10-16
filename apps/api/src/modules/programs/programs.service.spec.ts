import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ContentStatus, ContentType, ReleaseSchedule, Role } from '@prisma/client';
import { ProgramsService } from './programs.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CacheHelperService } from '../../common/cache/cache-helper.service.js';

describe('D1-030: ProgramsService - Content Studio Authoring & Hierarchy', () => {
  let service: ProgramsService;
  let prismaMock: any;
  let cacheHelperMock: any;
  let mediaProviderMock: any;

  beforeEach(() => {
    prismaMock = {
      program: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      step: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      lesson: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      batch: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      session: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
      },
      outboxEvent: {
        create: vi.fn().mockResolvedValue({}),
      },
      enrolment: {
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      resource: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        delete: vi.fn(),
      },
      resourceItem: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      question: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      agreementTemplate: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      signedAgreement: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      certificate: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      userLessonProgress: {
        upsert: vi.fn().mockResolvedValue({}),
      },
      attempt: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      },
      dailyAttendance: {
        upsert: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => {
        if (typeof callback === 'function') {
          return callback(prismaMock);
        }
        return Promise.all(callback);
      }),
    };

    cacheHelperMock = {
      getEndpointKey: vi.fn().mockImplementation((ns, role, params) => `${ns}:${role}:${JSON.stringify(params)}`),
      getOrSet: vi.fn().mockImplementation(async (_key, fetcher) => fetcher()),
      invalidateNamespace: vi.fn().mockResolvedValue(undefined),
      invalidateTag: vi.fn().mockImplementation(async (tag: string) => {
        await cacheHelperMock.invalidateNamespace(tag);
        return 1;
      }),
      invalidateTags: vi.fn().mockImplementation(async (tags: string[]) => {
        for (const tag of tags) {
          await cacheHelperMock.invalidateNamespace(tag);
        }
        return tags.length;
      }),
    };

    mediaProviderMock = {
      uploadVideo: vi.fn(),
      uploadAudio: vi.fn(),
      uploadDocument: vi.fn(),
      deleteMedia: vi.fn().mockResolvedValue(true),
    };

    service = new ProgramsService(
      prismaMock as unknown as PrismaService,
      cacheHelperMock as unknown as CacheHelperService,
      mediaProviderMock as any,
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. PROGRAM TESTS
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Programs Authoring & Lifecycle', () => {
    it('creates a new program in DRAFT status with generated slug', async () => {
      prismaMock.program.findUnique.mockResolvedValueOnce(null); // Slug check
      prismaMock.program.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'prog-1', ...data }));

      const result = await service.create({
        title: 'Emotional Intelligence 101',
        price: 299,
        description: 'Master EQ in 11 steps',
      });

      expect(result.id).toBe('prog-1');
      expect(result.title).toBe('Emotional Intelligence 101');
      expect(result.slug).toBe('emotional-intelligence-101');
      expect(result.status).toBe(ContentStatus.DRAFT);
      expect(result.isActive).toBe(true);
      expect(cacheHelperMock.invalidateNamespace).toHaveBeenCalledWith('programs');
    });

    it('generates unique slug if base slug already exists', async () => {
      prismaMock.program.findUnique.mockResolvedValueOnce({ id: 'existing-id', slug: 'conflict-test' });
      prismaMock.program.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'prog-2', ...data }));

      const result = await service.create({
        title: 'Conflict Test',
        price: 150,
      });

      expect(result.slug).toMatch(/^conflict-test-\d{4}$/);
    });

    it('findAll filters out drafts and inactive programs for learners/guests', async () => {
      const mockPrograms = [
        { id: 'prog-pub', title: 'Published Program', status: ContentStatus.PUBLISHED, isActive: true },
      ];
      prismaMock.program.findMany.mockResolvedValue(mockPrograms);

      const result = await service.findAll(Role.USER);

      expect(prismaMock.program.findMany).toHaveBeenCalledWith({
        where: {
          status: ContentStatus.PUBLISHED,
          isActive: true,
        },
        include: {
          _count: {
            select: { steps: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
    });

    it('findAll returns all programs (including drafts) for ADMIN/SUPER_ADMIN', async () => {
      const allPrograms = [
        { id: 'prog-pub', title: 'Published', status: ContentStatus.PUBLISHED, isActive: true },
        { id: 'prog-draft', title: 'Draft In Progress', status: ContentStatus.DRAFT, isActive: true },
      ];
      prismaMock.program.findMany.mockResolvedValue(allPrograms);

      const result = await service.findAll(Role.ADMIN);

      expect(prismaMock.program.findMany).toHaveBeenCalledWith({
        where: {
          status: { not: ContentStatus.ARCHIVED },
        },
        include: {
          _count: {
            select: { steps: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(2);
    });

    it('findOne throws NotFoundException when learner accesses a DRAFT program', async () => {
      prismaMock.program.findUnique.mockResolvedValue({
        id: 'prog-draft',
        title: 'Draft',
        status: ContentStatus.DRAFT,
        isActive: true,
        steps: [],
      });

      await expect(service.findOne('prog-draft', Role.USER)).rejects.toThrow(NotFoundException);
    });

    it('findOne allows ADMIN to view a DRAFT program', async () => {
      const draftProgram = {
        id: 'prog-draft',
        title: 'Draft Program',
        status: ContentStatus.DRAFT,
        isActive: true,
        steps: [],
      };
      prismaMock.program.findUnique.mockResolvedValue(draftProgram);

      const result = await service.findOne('prog-draft', Role.ADMIN);
      expect(result).toEqual(draftProgram);
    });

    it('updates program fields successfully', async () => {
      prismaMock.program.findUnique.mockResolvedValue({ id: 'prog-1', title: 'Old Title' });
      prismaMock.program.update.mockResolvedValue({ id: 'prog-1', title: 'New Title', price: 350 });

      const result = await service.update('prog-1', { title: 'New Title', price: 350 });
      expect(result.title).toBe('New Title');
      expect(cacheHelperMock.invalidateNamespace).toHaveBeenCalledWith('programs');
    });

    it('publishes a program and activates it', async () => {
      prismaMock.program.findUnique.mockResolvedValue({ id: 'prog-1', status: ContentStatus.DRAFT });
      prismaMock.program.update.mockResolvedValue({ id: 'prog-1', status: ContentStatus.PUBLISHED, isActive: true });

      const result = await service.publishProgram('prog-1', { status: ContentStatus.PUBLISHED });
      expect(result.status).toBe(ContentStatus.PUBLISHED);
      expect(result.isActive).toBe(true);
    });

    it('archives program when batches or enrolments exist to preserve records and FKs', async () => {
      prismaMock.program.findUnique.mockResolvedValue({ id: 'prog-1', title: 'Leadership 101', status: ContentStatus.PUBLISHED });
      prismaMock.batch.count.mockResolvedValue(2);
      prismaMock.enrolment.count.mockResolvedValue(5);
      prismaMock.program.update.mockResolvedValue({ id: 'prog-1', status: ContentStatus.ARCHIVED, isActive: false });

      const result = await service.remove('prog-1');

      expect(prismaMock.program.update).toHaveBeenCalledWith({
        where: { id: 'prog-1' },
        data: {
          status: ContentStatus.ARCHIVED,
          isActive: false,
        },
      });
      expect(result.archived).toBe(true);
      expect(result.deleted).toBe(false);
      expect(cacheHelperMock.invalidateNamespace).toHaveBeenCalledWith('programs');
    });

    it('permanently deletes program and all Cloudinary media (PDFs, videos, resources) and DB records when force=true', async () => {
      prismaMock.program.findUnique.mockResolvedValue({
        id: 'prog-full',
        title: 'Full Track',
        description: JSON.stringify({ image: 'https://res.cloudinary.com/ze1jhwgz/image/upload/v12345/cover.png' }),
      });
      prismaMock.batch.count.mockResolvedValue(1);
      prismaMock.enrolment.count.mockResolvedValue(3);
      prismaMock.lesson.findMany.mockResolvedValue([
        { id: 'l1', mediaUrl: 'https://res.cloudinary.com/ze1jhwgz/video/upload/v12345/intro.mp4', type: 'VIDEO', content: null },
        { id: 'l2', mediaUrl: 'https://res.cloudinary.com/ze1jhwgz/raw/upload/v12345/workbook.pdf', type: 'PDF', content: 'See https://res.cloudinary.com/ze1jhwgz/image/upload/v12345/diagram.png' },
      ]);
      prismaMock.resource.findMany.mockResolvedValue([
        { id: 'r1', mediaUrl: 'https://res.cloudinary.com/ze1jhwgz/raw/upload/v12345/cheatsheet.pdf' },
      ]);
      prismaMock.question.findMany.mockResolvedValue([
        { id: 'q1', text: 'What is this? https://res.cloudinary.com/ze1jhwgz/image/upload/v12345/brain.jpg', explanation: null, options: [] },
      ]);
      prismaMock.program.delete.mockResolvedValue({ id: 'prog-full' });

      const result = await service.remove('prog-full', true);

      expect(result.deleted).toBe(true);
      expect(mediaProviderMock.deleteMedia).toHaveBeenCalled();
      expect(prismaMock.program.delete).toHaveBeenCalledWith({ where: { id: 'prog-full' } });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. STEP TESTS
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Step Authoring, Ordering & Preview', () => {
    it('creates step automatically appending to max sequence when none provided', async () => {
      prismaMock.program.findUnique.mockResolvedValue({ id: 'prog-1' });
      prismaMock.step.findMany.mockResolvedValue([
        { id: 's1', sequence: 1 },
        { id: 's2', sequence: 2 },
      ]);
      prismaMock.step.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 's3', ...data }));

      const result = await service.createStep('prog-1', { title: 'Step 3: Self-Regulation' });

      expect(result.sequence).toBe(3);
      expect(result.status).toBe(ContentStatus.PUBLISHED);
      expect(prismaMock.step.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          programId: 'prog-1',
          title: 'Step 3: Self-Regulation',
          sequence: 3,
          status: ContentStatus.PUBLISHED,
          releaseSchedule: ReleaseSchedule.IMMEDIATE,
        }),
      });
    });

    it('creates step at specific sequence and shifts existing siblings safely', async () => {
      prismaMock.program.findUnique.mockResolvedValue({ id: 'prog-1' });
      const existing = [
        { id: 's1', sequence: 1 },
        { id: 's2', sequence: 2 },
      ];
      prismaMock.step.findMany.mockResolvedValue(existing);
      prismaMock.step.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 's-new', ...data }));

      // Insert at sequence 1
      const result = await service.createStep('prog-1', {
        title: 'New Step 1',
        sequence: 1,
      });

      expect(result.sequence).toBe(1);
      // Verify two-phase shift for s1 and s2
      expect(prismaMock.step.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { sequence: -2 },
      });
      expect(prismaMock.step.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { sequence: 2 },
      });
    });

    it('reorderSteps throws BadRequestException if any steps are omitted or foreign', async () => {
      prismaMock.program.findUnique.mockResolvedValue({ id: 'prog-1' });
      prismaMock.step.findMany.mockResolvedValue([
        { id: 's1' },
        { id: 's2' },
        { id: 's3' },
      ]);

      // Only 2 steps provided
      await expect(
        service.reorderSteps('prog-1', { stepIds: ['s1', 's2'] }),
      ).rejects.toThrow(BadRequestException);

      // Foreign step provided
      await expect(
        service.reorderSteps('prog-1', { stepIds: ['s1', 's2', 'foreign-step'] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('reorderSteps executes two-phase update preventing unique constraint collisions', async () => {
      prismaMock.program.findUnique.mockResolvedValue({ id: 'prog-1' });
      prismaMock.step.findMany
        .mockResolvedValueOnce([{ id: 's1' }, { id: 's2' }, { id: 's3' }])
        .mockResolvedValueOnce([
          { id: 's3', sequence: 1 },
          { id: 's1', sequence: 2 },
          { id: 's2', sequence: 3 },
        ]);

      await service.reorderSteps('prog-1', {
        stepIds: ['s3', 's1', 's2'],
      });

      // Phase 1: Negative sequences
      expect(prismaMock.step.update).toHaveBeenCalledWith({
        where: { id: 's3' },
        data: { sequence: -1 },
      });
      expect(prismaMock.step.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { sequence: -2 },
      });
      expect(prismaMock.step.update).toHaveBeenCalledWith({
        where: { id: 's2' },
        data: { sequence: -3 },
      });

      // Phase 2: Positive sequences
      expect(prismaMock.step.update).toHaveBeenCalledWith({
        where: { id: 's3' },
        data: { sequence: 1 },
      });
      expect(prismaMock.step.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { sequence: 2 },
      });
      expect(prismaMock.step.update).toHaveBeenCalledWith({
        where: { id: 's2' },
        data: { sequence: 3 },
      });

      expect(cacheHelperMock.invalidateNamespace).toHaveBeenCalledWith('programs');
    });

    it('previewStep returns full step with draft lessons and quiz', async () => {
      const stepWithDrafts = {
        id: 's1',
        title: 'Step 1: Self-Awareness',
        status: ContentStatus.DRAFT,
        lessons: [
          { id: 'l1', title: 'Lesson 1', status: ContentStatus.DRAFT },
          { id: 'l2', title: 'Lesson 2', status: ContentStatus.PUBLISHED },
        ],
        quiz: {
          questions: [{ id: 'q1', options: [{ text: 'A', isCorrect: true }] }],
        },
      };
      prismaMock.step.findUnique.mockResolvedValue(stepWithDrafts);

      const result = await service.previewStep('s1');

      expect(result.id).toBe('s1');
      expect(result.lessons).toHaveLength(2);
      expect(result.quiz!.questions[0].options[0].isCorrect).toBe(true);
    });

    it('removeStep deletes step and renumbers remaining siblings 1..N', async () => {
      prismaMock.step.findUnique.mockResolvedValue({ id: 's2', programId: 'prog-1', sequence: 2 });
      prismaMock.step.delete.mockResolvedValue({ id: 's2' });
      prismaMock.step.findMany.mockResolvedValue([
        { id: 's1', sequence: 1 },
        { id: 's3', sequence: 3 },
      ]);

      const result = await service.removeStep('s2');

      expect(result.deleted).toBe(true);
      expect(prismaMock.step.delete).toHaveBeenCalledWith({ where: { id: 's2' } });
      // Renumber s1 -> 1, s3 -> 2
      expect(prismaMock.step.update).toHaveBeenCalledWith({ where: { id: 's3' }, data: { sequence: -2 } });
      expect(prismaMock.step.update).toHaveBeenCalledWith({ where: { id: 's3' }, data: { sequence: 2 } });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. LESSON TESTS
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Lesson Authoring, Ordering & Media Isolation', () => {
    it('creates lesson in DRAFT status appending to end of step', async () => {
      prismaMock.step.findUnique.mockResolvedValue({ id: 'step-1' });
      prismaMock.lesson.findMany.mockResolvedValue([{ id: 'l1', order: 1 }]);
      prismaMock.lesson.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'l2', ...data }));

      const result = await service.createLesson('step-1', {
        title: 'Video Lecture 2',
        type: ContentType.VIDEO,
        mediaUrl: 'cloudinary://authenticated/v1/lecture2.mp4',
        durationSec: 600,
      });

      expect(result.id).toBe('l2');
      expect(result.order).toBe(2);
      expect(result.status).toBe(ContentStatus.PUBLISHED);
    });

    it('getLessons hides draft lessons and strips mediaUrl for learners', async () => {
      prismaMock.step.findUnique.mockResolvedValue({ id: 'step-1', status: ContentStatus.PUBLISHED });
      prismaMock.lesson.findMany.mockResolvedValue([
        { id: 'l1', title: 'Lesson 1', mediaUrl: 'https://secret.cdn/video1.mp4', status: ContentStatus.PUBLISHED },
      ]);

      const result = await service.getLessons('step-1', Role.USER);

      expect(result).toHaveLength(1);
      expect(result[0].mediaUrl).toBeUndefined(); // Media URL protected
      expect(prismaMock.lesson.findMany).toHaveBeenCalledWith({
        where: {
          stepId: 'step-1',
          status: ContentStatus.PUBLISHED,
        },
        orderBy: { order: 'asc' },
      });
    });

    it('getLessons returns full mediaUrls and drafts for ADMIN', async () => {
      prismaMock.step.findUnique.mockResolvedValue({ id: 'step-1', status: ContentStatus.PUBLISHED });
      const lessons = [
        { id: 'l1', title: 'Lesson 1', mediaUrl: 'https://cdn/v1.mp4', status: ContentStatus.PUBLISHED },
        { id: 'l2', title: 'Lesson 2 (Draft)', mediaUrl: 'https://cdn/v2.mp4', status: ContentStatus.DRAFT },
      ];
      prismaMock.lesson.findMany.mockResolvedValue(lessons);

      const result = await service.getLessons('step-1', Role.ADMIN);

      expect(result).toHaveLength(2);
      expect(result[0].mediaUrl).toBe('https://cdn/v1.mp4');
      expect(result[1].mediaUrl).toBe('https://cdn/v2.mp4');
    });

    it('reorderLessons updates contiguous 1..N order in a transaction', async () => {
      prismaMock.step.findUnique.mockResolvedValue({ id: 'step-1' });
      prismaMock.lesson.findMany
        .mockResolvedValueOnce([{ id: 'l1' }, { id: 'l2' }])
        .mockResolvedValueOnce([
          { id: 'l2', order: 1 },
          { id: 'l1', order: 2 },
        ]);

      const result = await service.reorderLessons('step-1', {
        lessonIds: ['l2', 'l1'],
      });

      expect(prismaMock.lesson.update).toHaveBeenCalledWith({
        where: { id: 'l2' },
        data: { order: 1 },
      });
      expect(prismaMock.lesson.update).toHaveBeenCalledWith({
        where: { id: 'l1' },
        data: { order: 2 },
      });
      expect(result).toHaveLength(2);
    });

    it('previewLesson returns full lesson details including mediaUrl and content', async () => {
      const lesson = {
        id: 'l1',
        title: 'Deep Meditation',
        type: ContentType.AUDIO,
        mediaUrl: 'https://cdn/audio.mp3',
        content: 'Transcript notes here',
        status: ContentStatus.DRAFT,
        step: { id: 's1', title: 'Step 1' },
      };
      prismaMock.lesson.findUnique.mockResolvedValue(lesson);

      const result = await service.previewLesson('l1');

      expect(result.id).toBe('l1');
      expect(result.mediaUrl).toBe('https://cdn/audio.mp3');
      expect(result.content).toBe('Transcript notes here');
    });

    it('publishes lesson and invalidates cache', async () => {
      prismaMock.lesson.findUnique.mockResolvedValue({ id: 'l1', status: ContentStatus.DRAFT });
      prismaMock.lesson.update.mockResolvedValue({ id: 'l1', status: ContentStatus.PUBLISHED });

      const result = await service.publishLesson('l1', { status: ContentStatus.PUBLISHED });

      expect(result.status).toBe(ContentStatus.PUBLISHED);
      expect(cacheHelperMock.invalidateNamespace).toHaveBeenCalledWith('programs');
    });

    it('removeLesson deletes lesson and renumbers remaining siblings', async () => {
      prismaMock.lesson.findUnique.mockResolvedValue({ id: 'l2', stepId: 'step-1', order: 2 });
      prismaMock.lesson.delete.mockResolvedValue({ id: 'l2' });
      prismaMock.lesson.findMany.mockResolvedValue([
        { id: 'l1', order: 1 },
        { id: 'l3', order: 3 },
      ]);

      const result = await service.removeLesson('l2');

      expect(result.deleted).toBe(true);
      expect(prismaMock.lesson.delete).toHaveBeenCalledWith({ where: { id: 'l2' } });
      expect(prismaMock.lesson.update).toHaveBeenCalledWith({
        where: { id: 'l3' },
        data: { order: 2 },
      });
    });
  });
});
