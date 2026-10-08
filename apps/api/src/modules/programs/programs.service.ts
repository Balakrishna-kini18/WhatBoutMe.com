import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ContentStatus, ReleaseSchedule, Role } from '@prisma/client';
import { markDailyAttendance } from '../../common/daily-attendance.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CacheHelperService } from '../../common/cache/cache-helper.service.js';
import { CloudinaryMediaProvider } from '../cloudinary/cloudinary.service.js';
import {
  CreateProgramDto,
  UpdateProgramDto,
  PublishProgramDto,
  CreateStepDto,
  UpdateStepDto,
  ReorderStepsDto,
  PublishStepDto,
  CreateLessonDto,
  UpdateLessonDto,
  ReorderLessonsDto,
  PublishLessonDto,
} from './dto/index.js';

@Injectable()
export class ProgramsService {
  constructor(
    private prisma: PrismaService,
    private cacheHelper: CacheHelperService,
    private mediaProvider: CloudinaryMediaProvider,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. PROGRAMS
  // ─────────────────────────────────────────────────────────────────────────────

  async findAll(role?: string) {
    const isStaff = role === Role.SUPER_ADMIN || role === Role.ADMIN;
    const cacheKey = await this.cacheHelper.getEndpointKey(
      'programs',
      (role as any) || 'GUEST',
      { action: 'findAll', isStaff },
    );

    return this.cacheHelper.getOrSet(cacheKey, async () => {
      if (isStaff) {
        return this.prisma.program.findMany({
          where: {
            status: { not: ContentStatus.ARCHIVED },
          },
          include: {
            _count: {
              select: { steps: true }
            }
          },
          orderBy: { createdAt: 'desc' },
        });
      }

      // Learners and guests only see active published programs
      return this.prisma.program.findMany({
        where: {
          status: ContentStatus.PUBLISHED,
          isActive: true,
        },
        include: {
          _count: {
            select: { steps: true }
          }
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  async findOne(id: string, role?: string) {
    const isStaff = role === Role.SUPER_ADMIN || role === Role.ADMIN;
    const program = await this.prisma.program.findUnique({
      where: { id },
      include: {
        steps: {
          where: isStaff ? undefined : { status: ContentStatus.PUBLISHED },
          orderBy: { sequence: 'asc' },
        },
      },
    });

    if (!program) {
      throw new NotFoundException(`Program not found`);
    }

    if (!isStaff && (program.status !== ContentStatus.PUBLISHED || !program.isActive)) {
      throw new NotFoundException(`Program not found`);
    }

    return program;
  }

  async create(data: CreateProgramDto) {
    let slug = data.slug;
    if (!slug && data.title) {
      slug = data.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
    }

    // Ensure slug uniqueness
    const existingSlug = await this.prisma.program.findUnique({ where: { slug } });
    if (existingSlug) {
      slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    const program = await this.prisma.program.create({
      data: {
        title: data.title,
        slug: slug!,
        description: data.description ?? null,
        price: data.price,
        isActive: data.isActive !== undefined ? data.isActive : true,
        status: data.status ?? ContentStatus.DRAFT,
        hasCertificate: data.hasCertificate ?? false,
        certificateTemplate: data.certificateTemplate ?? null,
      },
    });

    await this.cacheHelper.invalidateNamespace('programs');
    return program;
  }

  async update(id: string, data: UpdateProgramDto) {
    const program = await this.prisma.program.findUnique({ where: { id } });
    if (!program) {
      throw new NotFoundException(`Program not found`);
    }

    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.slug !== undefined) updateData.slug = data.slug;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.price !== undefined) updateData.price = data.price;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.hasCertificate !== undefined) updateData.hasCertificate = data.hasCertificate;
    if (data.certificateTemplate !== undefined) updateData.certificateTemplate = data.certificateTemplate;

    const updated = await this.prisma.program.update({
      where: { id },
      data: updateData,
    });

    await this.cacheHelper.invalidateNamespace('programs');
    return updated;
  }

  async publishProgram(id: string, dto: PublishProgramDto) {
    const program = await this.prisma.program.findUnique({ where: { id } });
    if (!program) {
      throw new NotFoundException(`Program not found`);
    }

    const updated = await this.prisma.program.update({
      where: { id },
      data: {
        status: dto.status,
        isActive: dto.status === ContentStatus.PUBLISHED,
      },
    });

    await this.cacheHelper.invalidateNamespace('programs');
    return updated;
  }

  async remove(id: string) {
    const program = await this.prisma.program.findUnique({ where: { id } });
    if (!program) {
      throw new NotFoundException(`Program not found`);
    }

    const [batchCount, enrolmentCount] = await Promise.all([
      this.prisma.batch.count({ where: { programId: id } }),
      this.prisma.enrolment.count({ where: { programId: id } }),
    ]);

    if (batchCount > 0 || enrolmentCount > 0) {
      this.logger.warn(`Program ${id} is being hard deleted. It has ${batchCount} batches and ${enrolmentCount} enrolments which will be cascade deleted.`);
    }

    try {
      // 1. Program Cover Image
      if (program.description) {
        try {
          const info = JSON.parse(program.description);
          if (info.image && info.image.includes('cloudinary.com')) {
            const parts = info.image.split('/');
            const filename = parts[parts.length - 1];
            const publicId = filename.split('.')[0];
            await this.mediaProvider.deleteMedia(publicId, 'image').catch(err => this.logger.warn(`Failed to delete program image ${publicId}: ${err.message}`));
          }
        } catch (e) {}
      }

      // 2. Lesson Media
      const lessons = await this.prisma.lesson.findMany({
        where: { step: { programId: id } },
        select: { mediaUrl: true }
      });
      for (const lesson of lessons) {
        if (lesson.mediaUrl && lesson.mediaUrl.startsWith('upload:')) {
          const publicId = lesson.mediaUrl.replace('upload:', '');
          await this.mediaProvider.deleteMedia(publicId, 'video').catch(err => this.logger.warn(`Failed to delete lesson media ${publicId}: ${err.message}`));
        }
      }

      // 3. Resource Media
      const resources = await this.prisma.resource.findMany({
        where: { programId: id },
        select: { mediaUrl: true }
      });
      for (const res of resources) {
        if (res.mediaUrl && res.mediaUrl.includes('cloudinary.com')) {
          const parts = res.mediaUrl.split('/');
          const filename = parts[parts.length - 1];
          const publicId = filename.split('.')[0];
          // Cloudinary resources uploaded as raw might need 'raw', but images are 'image'.
          // Let's try 'raw' and fallback to 'image' if needed, or just let it fail gracefully.
          await this.mediaProvider.deleteMedia(publicId, 'raw').catch(() => 
            this.mediaProvider.deleteMedia(publicId, 'image').catch(err => this.logger.warn(`Failed to delete resource ${publicId}: ${err.message}`))
          );
        }
      }
    } catch (cleanupErr) {
      this.logger.error(`Failed to clean up Cloudinary media for program ${id}:`, cleanupErr);
    }

    await this.prisma.program.delete({ where: { id } });
    await this.cacheHelper.invalidateNamespace('programs');
    return { id, deleted: true };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. STEPS
  // ─────────────────────────────────────────────────────────────────────────────

  async getSteps(programId: string, role?: string) {
    const isStaff = role === Role.SUPER_ADMIN || role === Role.ADMIN || (role === Role.MANAGER || role === 'MANAGER' || role === 'TEACHER');
    const cacheKey = await this.cacheHelper.getEndpointKey(
      'programs',
      (role as any) || 'GUEST',
      { action: 'getSteps', programId, isStaff },
    );

    return this.cacheHelper.getOrSet(cacheKey, async () => {
      const program = await this.prisma.program.findUnique({ where: { id: programId } });
      if (!program) {
        throw new NotFoundException(`Program not found`);
      }

      if (!isStaff && (program.status !== ContentStatus.PUBLISHED || !program.isActive)) {
        throw new NotFoundException(`Program not found`);
      }

      return this.prisma.step.findMany({
        where: {
          programId,
          ...(isStaff ? {} : { status: ContentStatus.PUBLISHED }),
        },
        orderBy: { sequence: 'asc' },
      });
    });
  }

  async getStep(stepId: string, role?: string) {
    const isStaff = role === Role.SUPER_ADMIN || role === Role.ADMIN;
    const isManager = (role === Role.MANAGER || role === 'MANAGER' || role === 'TEACHER');
    const isPrivileged = isStaff || isManager;

    const cacheKey = await this.cacheHelper.getEndpointKey(
      'programs',
      (role as any) || 'GUEST',
      { action: 'getStep', stepId, role },
    );

    return this.cacheHelper.getOrSet(cacheKey, async () => {
      const step = await this.prisma.step.findUnique({
        where: { id: stepId },
        include: {
          lessons: {
            where: isPrivileged ? undefined : { status: ContentStatus.PUBLISHED },
            orderBy: { order: 'asc' },
          },
          quiz: {
            include: {
              questions: {
                include: { options: true },
              },
            },
          },
        },
      });

      if (!step) {
        throw new NotFoundException(`Step not found`);
      }

      if (!isPrivileged && step.status !== ContentStatus.PUBLISHED) {
        throw new NotFoundException(`Step not found`);
      }

      // Hide quiz answer keys from learners and guests
      if (!isStaff && step.quiz) {
        step.quiz.questions.forEach((q) => {
          q.options.forEach((o) => {
            (o as any).isCorrect = undefined;
          });
        });
      }

      return step;
    });
  }

  async previewStep(stepId: string) {
    const step = await this.prisma.step.findUnique({
      where: { id: stepId },
      include: {
        program: { select: { id: true, title: true, status: true } },
        lessons: { orderBy: { order: 'asc' } },
        quiz: {
          include: {
            questions: {
              include: { options: true },
            },
          },
        },
      },
    });

    if (!step) {
      throw new NotFoundException(`Step not found`);
    }

    return step;
  }

  async createStep(programId: string, data: CreateStepDto) {
    const program = await this.prisma.program.findUnique({ where: { id: programId } });
    if (!program) {
      throw new NotFoundException(`Program not found`);
    }

    const createdStep = await this.prisma.$transaction(async (tx) => {
      const existingSteps = await tx.step.findMany({
        where: { programId },
        orderBy: { sequence: 'asc' },
      });

      let targetSeq = data.stepNumber ?? data.sequence;
      if (!targetSeq || targetSeq > existingSteps.length + 1) {
        targetSeq = existingSteps.length + 1;
      }

      // Shift subsequent steps if inserting at an existing sequence
      const toShift = existingSteps.filter((s) => s.sequence >= targetSeq);
      if (toShift.length > 0) {
        // Phase 1: Set temporary negative sequences to prevent unique constraint collision
        for (const s of toShift) {
          await tx.step.update({
            where: { id: s.id },
            data: { sequence: -(s.sequence + 1) },
          });
        }
        // Phase 2: Set target shifted positive sequences
        for (const s of toShift) {
          await tx.step.update({
            where: { id: s.id },
            data: { sequence: s.sequence + 1 },
          });
        }
      }

      return tx.step.create({
        data: {
          programId,
          title: data.title,
          description: data.description ?? null,
          sequence: targetSeq,
          status: data.status ?? ContentStatus.PUBLISHED,
          releaseSchedule: data.releaseSchedule ?? ReleaseSchedule.IMMEDIATE,
          unlockDelayDays: data.unlockDelayDays ?? null,
        },
      });
    });

    await this.cacheHelper.invalidateNamespace('programs');
    return createdStep;
  }

  async updateStep(stepId: string, data: UpdateStepDto) {
    const step = await this.prisma.step.findUnique({ where: { id: stepId } });
    if (!step) {
      throw new NotFoundException(`Step not found`);
    }

    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.releaseSchedule !== undefined) updateData.releaseSchedule = data.releaseSchedule;
    if (data.unlockDelayDays !== undefined) updateData.unlockDelayDays = data.unlockDelayDays;

    const requestedSeq = data.stepNumber ?? data.sequence;
    if (requestedSeq && requestedSeq !== step.sequence) {
      // Reposition step deterministically within the program
      return this.repositionStep(step, requestedSeq);
    }

    const updated = await this.prisma.step.update({
      where: { id: stepId },
      data: updateData,
    });

    await this.cacheHelper.invalidateNamespace('programs');
    return updated;
  }

  private async repositionStep(step: { id: string; programId: string; sequence: number }, targetSeq: number) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const allSteps = await tx.step.findMany({
        where: { programId: step.programId },
        orderBy: { sequence: 'asc' },
      });

      const otherSteps = allSteps.filter((s) => s.id !== step.id);
      const clampedSeq = Math.max(1, Math.min(targetSeq, allSteps.length));

      // Reconstruct ordered list with step at clampedSeq - 1
      otherSteps.splice(clampedSeq - 1, 0, step as any);

      // Two-phase sequence update
      for (let i = 0; i < otherSteps.length; i++) {
        await tx.step.update({
          where: { id: otherSteps[i].id },
          data: { sequence: -(i + 1) },
        });
      }
      for (let i = 0; i < otherSteps.length; i++) {
        await tx.step.update({
          where: { id: otherSteps[i].id },
          data: { sequence: i + 1 },
        });
      }

      return tx.step.findUnique({ where: { id: step.id } });
    });

    await this.cacheHelper.invalidateNamespace('programs');
    return updated!;
  }

  async reorderSteps(programId: string, dto: ReorderStepsDto) {
    const program = await this.prisma.program.findUnique({ where: { id: programId } });
    if (!program) {
      throw new NotFoundException(`Program not found`);
    }

    const existingSteps = await this.prisma.step.findMany({
      where: { programId },
      select: { id: true },
    });

    const existingIdSet = new Set(existingSteps.map((s) => s.id));

    if (
      dto.stepIds.length !== existingSteps.length ||
      !dto.stepIds.every((id) => existingIdSet.has(id))
    ) {
      throw new BadRequestException(
        'stepIds must contain exactly all step IDs in the program without omission or duplication',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Phase 1: Set temporary negative sequences to prevent @@unique([programId, sequence]) collisions
      for (let i = 0; i < dto.stepIds.length; i++) {
        await tx.step.update({
          where: { id: dto.stepIds[i] },
          data: { sequence: -(i + 1) },
        });
      }

      // Phase 2: Set final contiguous 1-based sequences
      for (let i = 0; i < dto.stepIds.length; i++) {
        await tx.step.update({
          where: { id: dto.stepIds[i] },
          data: { sequence: i + 1 },
        });
      }
    });

    await this.cacheHelper.invalidateNamespace('programs');

    return this.prisma.step.findMany({
      where: { programId },
      orderBy: { sequence: 'asc' },
    });
  }

  async publishStep(stepId: string, dto: PublishStepDto) {
    const step = await this.prisma.step.findUnique({ where: { id: stepId } });
    if (!step) {
      throw new NotFoundException(`Step not found`);
    }

    const updated = await this.prisma.step.update({
      where: { id: stepId },
      data: { status: dto.status },
    });

    await this.cacheHelper.invalidateNamespace('programs');
    return updated;
  }

  async removeStep(stepId: string) {
    const step = await this.prisma.step.findUnique({ where: { id: stepId } });
    if (!step) {
      throw new NotFoundException(`Step not found`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.step.delete({ where: { id: stepId } });

      // Renumber remaining sibling steps to preserve contiguous 1..N sequence
      const remaining = await tx.step.findMany({
        where: { programId: step.programId },
        orderBy: { sequence: 'asc' },
      });

      for (let i = 0; i < remaining.length; i++) {
        await tx.step.update({
          where: { id: remaining[i].id },
          data: { sequence: -(i + 1) },
        });
      }

      for (let i = 0; i < remaining.length; i++) {
        await tx.step.update({
          where: { id: remaining[i].id },
          data: { sequence: i + 1 },
        });
      }
    });

    await this.cacheHelper.invalidateNamespace('programs');
    return { id: stepId, deleted: true };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. LESSONS
  // ─────────────────────────────────────────────────────────────────────────────

  async getLessons(stepId: string, role?: string) {
    const isStaff = role === Role.SUPER_ADMIN || role === Role.ADMIN;
    const isManager = (role === Role.MANAGER || role === 'MANAGER' || role === 'TEACHER');
    const isPrivileged = isStaff || isManager;

    const cacheKey = await this.cacheHelper.getEndpointKey(
      'programs',
      (role as any) || 'GUEST',
      { action: 'getLessons', stepId, role },
    );

    return this.cacheHelper.getOrSet(cacheKey, async () => {
      const step = await this.prisma.step.findUnique({ where: { id: stepId } });
      if (!step) {
        throw new NotFoundException(`Step not found`);
      }

      if (!isPrivileged && step.status !== ContentStatus.PUBLISHED) {
        throw new NotFoundException(`Step not found`);
      }

      const lessons = await this.prisma.lesson.findMany({
        where: {
          stepId,
          ...(isPrivileged ? {} : { status: ContentStatus.PUBLISHED }),
        },
        orderBy: { order: 'asc' },
      });

      if (!isPrivileged) {
        // Strip mediaUrl from list for unprivileged users; accessed only via secure playback
        return lessons.map((l) => ({ ...l, mediaUrl: undefined }));
      }

      return lessons;
    });
  }

  async previewLesson(lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        step: {
          select: {
            id: true,
            title: true,
            sequence: true,
            programId: true,
            program: { select: { id: true, title: true } },
          },
        },
      },
    });

    if (!lesson) {
      throw new NotFoundException(`Lesson not found`);
    }

    return lesson;
  }

  async createLesson(stepId: string, data: CreateLessonDto) {
    const step = await this.prisma.step.findUnique({ where: { id: stepId } });
    if (!step) {
      throw new NotFoundException(`Step not found`);
    }

    const createdLesson = await this.prisma.$transaction(async (tx) => {
      const existingLessons = await tx.lesson.findMany({
        where: { stepId },
        orderBy: { order: 'asc' },
      });

      let targetOrder = data.lessonOrder ?? data.order;
      if (!targetOrder || targetOrder > existingLessons.length + 1) {
        targetOrder = existingLessons.length + 1;
      }

      // Shift subsequent lessons if inserting at an existing order
      const toShift = existingLessons.filter((l) => l.order >= targetOrder);
      for (const l of toShift) {
        await tx.lesson.update({
          where: { id: l.id },
          data: { order: l.order + 1 },
        });
      }

      return tx.lesson.create({
        data: {
          stepId,
          title: data.title,
          type: data.type,
          mediaUrl: data.mediaUrl,
          durationSec: data.durationSec ?? 0,
          content: data.content ?? null,
          order: targetOrder,
          status: data.status ?? ContentStatus.PUBLISHED,
        },
      });
    });

    await this.cacheHelper.invalidateNamespace('programs');
    return createdLesson;
  }

  async updateLesson(lessonId: string, data: UpdateLessonDto) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) {
      throw new NotFoundException(`Lesson not found`);
    }

    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.mediaUrl !== undefined) updateData.mediaUrl = data.mediaUrl;
    if (data.durationSec !== undefined) updateData.durationSec = data.durationSec;
    if (data.content !== undefined) updateData.content = data.content;

    const requestedOrder = data.lessonOrder ?? data.order;
    if (requestedOrder && requestedOrder !== lesson.order) {
      return this.repositionLesson(lesson, requestedOrder);
    }

    const updated = await this.prisma.lesson.update({
      where: { id: lessonId },
      data: updateData,
    });

    await this.cacheHelper.invalidateNamespace('programs');
    return updated;
  }

  private async repositionLesson(lesson: { id: string; stepId: string; order: number }, targetOrder: number) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const allLessons = await tx.lesson.findMany({
        where: { stepId: lesson.stepId },
        orderBy: { order: 'asc' },
      });

      const otherLessons = allLessons.filter((l) => l.id !== lesson.id);
      const clampedOrder = Math.max(1, Math.min(targetOrder, allLessons.length));

      otherLessons.splice(clampedOrder - 1, 0, lesson as any);

      for (let i = 0; i < otherLessons.length; i++) {
        await tx.lesson.update({
          where: { id: otherLessons[i].id },
          data: { order: i + 1 },
        });
      }

      return tx.lesson.findUnique({ where: { id: lesson.id } });
    });

    await this.cacheHelper.invalidateNamespace('programs');
    return updated!;
  }

  async reorderLessons(stepId: string, dto: ReorderLessonsDto) {
    const step = await this.prisma.step.findUnique({ where: { id: stepId } });
    if (!step) {
      throw new NotFoundException(`Step not found`);
    }

    const existingLessons = await this.prisma.lesson.findMany({
      where: { stepId },
      select: { id: true },
    });

    const existingIdSet = new Set(existingLessons.map((l) => l.id));

    if (
      dto.lessonIds.length !== existingLessons.length ||
      !dto.lessonIds.every((id) => existingIdSet.has(id))
    ) {
      throw new BadRequestException(
        'lessonIds must contain exactly all lesson IDs in the step without omission or duplication',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < dto.lessonIds.length; i++) {
        await tx.lesson.update({
          where: { id: dto.lessonIds[i] },
          data: { order: i + 1 },
        });
      }
    });

    await this.cacheHelper.invalidateNamespace('programs');

    return this.prisma.lesson.findMany({
      where: { stepId },
      orderBy: { order: 'asc' },
    });
  }

  async publishLesson(lessonId: string, dto: PublishLessonDto) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) {
      throw new NotFoundException(`Lesson not found`);
    }

    const updated = await this.prisma.lesson.update({
      where: { id: lessonId },
      data: { status: dto.status },
    });

    await this.cacheHelper.invalidateNamespace('programs');
    return updated;
  }

  async removeLesson(lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) {
      throw new NotFoundException(`Lesson not found`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.lesson.delete({ where: { id: lessonId } });

      // If the lesson had an uploaded media file, delete it from Cloudinary
      if (lesson.mediaUrl && lesson.mediaUrl.startsWith('upload:')) {
        const publicId = lesson.mediaUrl.replace('upload:', '');
        const resourceType = lesson.type === 'VIDEO' ? 'video' : 'raw';
        this.mediaProvider.deleteMedia(publicId, resourceType).catch(err => {
          console.error(`Failed to delete media ${publicId} from Cloudinary:`, err);
        });
      }

      // Renumber remaining sibling lessons
      const remaining = await tx.lesson.findMany({
        where: { stepId: lesson.stepId },
        orderBy: { order: 'asc' },
      });

      for (let i = 0; i < remaining.length; i++) {
        await tx.lesson.update({
          where: { id: remaining[i].id },
          data: { order: i + 1 },
        });
      }
    });

    await this.cacheHelper.invalidateNamespace('programs');
    return { id: lessonId, deleted: true };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. LEGACY / LEARNER STEP COMPLETION & ENROLLMENT (PRESERVED)
  // ─────────────────────────────────────────────────────────────────────────────

  async enroll(programId: string, userId: string) {
    let batch = await this.prisma.batch.findFirst({
      where: { programId },
      include: { program: true },
    });

    if (!batch) {
      const program = await this.prisma.program.findUnique({ where: { id: programId } });
      batch = (await this.prisma.batch.create({
        data: {
          name: 'Default Cohort',
          programId,
          capacity: 100,
          startDate: new Date(),
        },
        include: { program: true },
      })) as any;
      if (!batch!.program && program) {
        batch!.program = program;
      }
    }

    const batchId = batch!.id;

    const existing = await this.prisma.enrolment.findFirst({
      where: { userId, batchId },
    });

    if (existing) return existing;

    const enrolment = await this.prisma.enrolment.create({
      data: {
        userId,
        batchId: batchId,
        programId: programId,
        status: 'ACTIVE',
      },
    });

    const price = batch!.program?.price || 0;

    const payment = await this.prisma.payment.create({
      data: {
        enrolmentId: enrolment.id,
        amount: price,
        currency: 'USD',
        stripeSessionId: 'txn_mock_' + Math.random().toString(36).substr(2, 9),
        status: 'succeeded',
      },
    });

    await this.prisma.invoice.create({
      data: {
        paymentId: payment.id,
        invoiceNumber: 'INV-' + Math.floor(100000 + Math.random() * 900000),
        amount: price,
        status: 'PAID',
      },
    });

    await this.cacheHelper.invalidateNamespace(`auth_user:${userId}`);
    await this.cacheHelper.invalidateNamespace('batches');

    return enrolment;
  }

  async completeStep(stepId: string, userId: string, _score?: number) {
    const step = await this.prisma.step.findUnique({
      where: { id: stepId },
      include: {
        lessons: { where: { status: 'PUBLISHED' }, select: { id: true, type: true } },
        quiz: { select: { id: true } },
      },
    });
    if (!step) throw new NotFoundException('Step not found');

    const enrolment = await this.prisma.enrolment.findFirst({
      where: { userId, programId: step.programId, status: { in: ['ACTIVE', 'COMPLETED'] } },
    });
    if (!enrolment) throw new ForbiddenException('You are not enrolled in this course');

    // Check published lessons completion
    const viewedLessons = await this.prisma.userLessonProgress.findMany({
      where: {
        enrolmentId: enrolment.id,
        lessonId: { in: step.lessons.map((l) => l.id) },
        viewed: true,
      },
      select: { lessonId: true },
    });
    const viewedSet = new Set(viewedLessons.map((vl) => vl.lessonId));
    const uncompletedLessons = step.lessons.filter((l) => !viewedSet.has(l.id));

    // If remaining uncompleted lessons are TEXT, auto-complete them on manual finish
    for (const l of uncompletedLessons) {
      if (l.type === 'TEXT') {
        await this.prisma.userLessonProgress.upsert({
          where: { enrolmentId_lessonId: { enrolmentId: enrolment.id, lessonId: l.id } },
          create: { enrolmentId: enrolment.id, lessonId: l.id, viewed: true, progressPercent: 100 },
          update: { viewed: true, progressPercent: 100 },
        });
      } else {
        throw new BadRequestException(
          'Step cannot be completed yet: all video, audio, and document materials must be reviewed first',
        );
      }
    }

    // Verify quiz requirement if step has a quiz
    if (step.quiz) {
      const passed = await this.prisma.attempt.findFirst({
        where: { enrolmentId: enrolment.id, quizId: step.quiz.id, status: 'PASSED' },
      });
      if (!passed) {
        throw new BadRequestException(
          'Step cannot be completed yet: you must take and pass the step quiz first',
        );
      }
    }

    await this.prisma.stepProgress.upsert({
      where: { enrolmentId_stepId: { enrolmentId: enrolment.id, stepId: step.id } },
      create: { enrolmentId: enrolment.id, stepId: step.id, isCompleted: true, completedAt: new Date() },
      update: { isCompleted: true, completedAt: new Date() },
    });

    await markDailyAttendance(this.prisma, userId, 'lessonDone');
    await this.cacheHelper.invalidateNamespace(`auth_user:${userId}`);
    await this.cacheHelper.invalidateNamespace('users');
    return { stepId, completed: true };
  }
}
