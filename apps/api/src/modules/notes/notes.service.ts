import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateNoteDto, QueryNotesDto, UpdateNoteDto } from './dto/index.js';

@Injectable()
export class NotesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a private personal note for the authenticated student.
   */
  async create(userId: string, dto: CreateNoteDto) {
    if (!userId) {
      throw new ForbiddenException('Authentication required');
    }

    const trimmedText = dto.noteText?.trim();
    if (!trimmedText) {
      throw new BadRequestException('noteText cannot be empty');
    }

    let resolvedStepId = dto.stepId;
    let resolvedProgramId = dto.programId;

    // If lessonId is provided, resolve stepId and programId if missing
    if (dto.lessonId) {
      const lesson = await this.prisma.lesson.findUnique({
        where: { id: dto.lessonId },
        include: {
          step: {
            select: { id: true, programId: true },
          },
        },
      });

      if (lesson) {
        if (!resolvedStepId) resolvedStepId = lesson.stepId;
        if (!resolvedProgramId && lesson.step?.programId) {
          resolvedProgramId = lesson.step.programId;
        }
      }
    } else if (resolvedStepId && !resolvedProgramId) {
      const step = await this.prisma.step.findUnique({
        where: { id: resolvedStepId },
        select: { programId: true },
      });
      if (step?.programId) {
        resolvedProgramId = step.programId;
      }
    }

    return this.prisma.studentNote.create({
      data: {
        userId,
        programId: resolvedProgramId,
        stepId: resolvedStepId,
        lessonId: dto.lessonId,
        noteText: trimmedText,
        highlightSnippet: dto.highlightSnippet?.trim() || null,
        videoTimestampSeconds: dto.videoTimestampSeconds ?? null,
      },
      include: {
        step: {
          select: { id: true, sequence: true, title: true },
        },
        lesson: {
          select: { id: true, title: true, type: true },
        },
        program: {
          select: { id: true, title: true, slug: true },
        },
      },
    });
  }

  /**
   * Retrieves all notes owned by the student, with optional program/step/lesson/search filtering.
   * Strictly enforces server-side ownership.
   */
  async findAll(userId: string, query: QueryNotesDto) {
    if (!userId) {
      throw new ForbiddenException('Authentication required');
    }

    const where: any = { userId };

    if (query.programId) {
      where.programId = query.programId;
    }
    if (query.stepId) {
      where.stepId = query.stepId;
    }
    if (query.lessonId) {
      where.lessonId = query.lessonId;
    }
    if (query.search && query.search.trim()) {
      const s = query.search.trim();
      where.OR = [
        { noteText: { contains: s, mode: 'insensitive' } },
        { highlightSnippet: { contains: s, mode: 'insensitive' } },
      ];
    }

    return this.prisma.studentNote.findMany({
      where,
      orderBy: {
        createdAt: query.sort === 'asc' ? 'asc' : 'desc',
      },
      include: {
        step: {
          select: { id: true, sequence: true, title: true },
        },
        lesson: {
          select: { id: true, title: true, type: true },
        },
        program: {
          select: { id: true, title: true, slug: true },
        },
      },
    });
  }

  /**
   * Retrieves all notes for a specific lesson owned by the student.
   */
  async findByLesson(userId: string, lessonId: string) {
    if (!userId) {
      throw new ForbiddenException('Authentication required');
    }

    return this.prisma.studentNote.findMany({
      where: {
        userId,
        lessonId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        step: {
          select: { id: true, sequence: true, title: true },
        },
        lesson: {
          select: { id: true, title: true, type: true },
        },
        program: {
          select: { id: true, title: true, slug: true },
        },
      },
    });
  }

  /**
   * Retrieves a single note owned by the student.
   */
  async findOne(userId: string, id: string) {
    if (!userId) {
      throw new ForbiddenException('Authentication required');
    }

    const note = await this.prisma.studentNote.findUnique({
      where: { id },
      include: {
        step: {
          select: { id: true, sequence: true, title: true },
        },
        lesson: {
          select: { id: true, title: true, type: true },
        },
        program: {
          select: { id: true, title: true, slug: true },
        },
      },
    });

    if (!note || note.userId !== userId) {
      throw new NotFoundException('Note not found');
    }

    return note;
  }

  /**
   * Updates an existing student note. Strictly enforces student ownership.
   */
  async update(userId: string, id: string, dto: UpdateNoteDto) {
    await this.findOne(userId, id);

    const data: any = {};
    if (dto.noteText !== undefined) {
      const trimmed = dto.noteText.trim();
      if (!trimmed) {
        throw new BadRequestException('noteText cannot be empty');
      }
      data.noteText = trimmed;
    }
    if (dto.highlightSnippet !== undefined) {
      data.highlightSnippet = dto.highlightSnippet?.trim() || null;
    }
    if (dto.videoTimestampSeconds !== undefined) {
      data.videoTimestampSeconds = dto.videoTimestampSeconds;
    }

    return this.prisma.studentNote.update({
      where: { id },
      data,
      include: {
        step: {
          select: { id: true, sequence: true, title: true },
        },
        lesson: {
          select: { id: true, title: true, type: true },
        },
        program: {
          select: { id: true, title: true, slug: true },
        },
      },
    });
  }

  /**
   * Deletes a student note. Strictly enforces student ownership.
   */
  async delete(userId: string, id: string) {
    await this.findOne(userId, id);

    await this.prisma.studentNote.delete({
      where: { id },
    });

    return { success: true, id };
  }
}
