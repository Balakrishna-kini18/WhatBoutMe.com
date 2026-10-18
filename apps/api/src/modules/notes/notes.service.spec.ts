import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotesService } from './notes.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('NotesService', () => {
  let service: NotesService;
  let prismaMock: any;

  const mockNote = {
    id: 'note-1',
    userId: 'user-1',
    programId: 'program-1',
    stepId: 'step-1',
    lessonId: 'lesson-1',
    noteText: 'Important takeaway from this module',
    highlightSnippet: 'Key sentence quoted',
    videoTimestampSeconds: 125,
    createdAt: new Date('2026-10-17T10:00:00Z'),
    updatedAt: new Date('2026-10-17T10:00:00Z'),
    step: { id: 'step-1', sequence: 1, title: 'Step 1' },
    lesson: { id: 'lesson-1', title: 'Lesson 1', type: 'VIDEO' },
    program: { id: 'program-1', title: 'Program 1', slug: 'prog-1' },
  };

  beforeEach(async () => {
    prismaMock = {
      studentNote: {
        create: vi.fn().mockResolvedValue(mockNote),
        findMany: vi.fn().mockResolvedValue([mockNote]),
        findUnique: vi.fn().mockResolvedValue(mockNote),
        update: vi.fn().mockResolvedValue({ ...mockNote, noteText: 'Updated text' }),
        delete: vi.fn().mockResolvedValue(mockNote),
      },
      lesson: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'lesson-1',
          stepId: 'step-1',
          step: { id: 'step-1', programId: 'program-1' },
        }),
      },
      step: {
        findUnique: vi.fn().mockResolvedValue({ id: 'step-1', programId: 'program-1' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotesService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<NotesService>(NotesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates a note with trimmed noteText and resolved step/program', async () => {
      const res = await service.create('user-1', {
        lessonId: 'lesson-1',
        noteText: '  Important takeaway from this module  ',
        highlightSnippet: 'Key sentence quoted',
        videoTimestampSeconds: 125,
      });

      expect(res).toEqual(mockNote);
      expect(prismaMock.studentNote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            noteText: 'Important takeaway from this module',
            lessonId: 'lesson-1',
            stepId: 'step-1',
            programId: 'program-1',
          }),
        }),
      );
    });

    it('rejects empty or whitespace-only note text', async () => {
      await expect(
        service.create('user-1', {
          noteText: '   ',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects creation when userId is missing', async () => {
      await expect(
        service.create('', {
          noteText: 'Valid note',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findAll', () => {
    it('enforces userId ownership filter on query', async () => {
      const res = await service.findAll('user-1', {
        search: 'takeaway',
        sort: 'desc',
      });

      expect(res).toEqual([mockNote]);
      expect(prismaMock.studentNote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            OR: [
              { noteText: { contains: 'takeaway', mode: 'insensitive' } },
              { highlightSnippet: { contains: 'takeaway', mode: 'insensitive' } },
            ],
          }),
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });

  describe('findOne and update', () => {
    it('throws NotFoundException if note belongs to another user', async () => {
      prismaMock.studentNote.findUnique.mockResolvedValueOnce({
        ...mockNote,
        userId: 'other-user',
      });

      await expect(service.findOne('user-1', 'note-1')).rejects.toThrow(NotFoundException);
    });

    it('updates note when owned by user', async () => {
      const res = await service.update('user-1', 'note-1', {
        noteText: 'Updated text',
      });

      expect(res.noteText).toBe('Updated text');
      expect(prismaMock.studentNote.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'note-1' },
          data: expect.objectContaining({ noteText: 'Updated text' }),
        }),
      );
    });
  });

  describe('delete', () => {
    it('deletes note when owned by user', async () => {
      const res = await service.delete('user-1', 'note-1');
      expect(res).toEqual({ success: true, id: 'note-1' });
      expect(prismaMock.studentNote.delete).toHaveBeenCalledWith({
        where: { id: 'note-1' },
      });
    });
  });
});
