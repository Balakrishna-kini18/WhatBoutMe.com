import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(ProgramsService.name);

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
        description: data.description ?? data.shortDescription ?? null,
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
    if (data.description !== undefined) {
      updateData.description = data.description;
    } else if (data.shortDescription !== undefined) {
      updateData.description = data.shortDescription;
    }
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

  private extractCloudinaryPublicId(urlOrId?: string | null): { publicId: string; resourceType: 'video' | 'image' | 'raw' } | null {
    if (!urlOrId || typeof urlOrId !== 'string') return null;
    const trimmed = urlOrId.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('upload:')) {
      const id = trimmed.replace('upload:', '');
      return { publicId: id, resourceType: 'video' };
    }

    if (trimmed.includes('cloudinary.com')) {
      try {
        const url = new URL(trimmed);
        const pathname = url.pathname;
        const segments = pathname.split('/').filter(Boolean);
        let resourceType: 'video' | 'image' | 'raw' = 'video';
        if (segments.includes('image')) resourceType = 'image';
        else if (segments.includes('raw')) resourceType = 'raw';
        else if (segments.includes('video')) resourceType = 'video';
        else {
          if (pathname.match(/\.(jpg|jpeg|png|webp|gif|svg)$/i)) resourceType = 'image';
          else if (pathname.match(/\.(pdf|doc|docx|zip)$/i)) resourceType = 'raw';
          else resourceType = 'video';
        }

        const uploadIdx = segments.indexOf('upload');
        if (uploadIdx !== -1 && uploadIdx < segments.length - 1) {
          let idParts = segments.slice(uploadIdx + 1);
          if (idParts[0] && /^v\d+$/.test(idParts[0])) {
            idParts = idParts.slice(1);
          }
          let publicId = idParts.join('/');
          if (resourceType !== 'raw') {
            publicId = publicId.replace(/\.[^/.]+$/, '');
          }
          return { publicId, resourceType };
        }

        const last = segments[segments.length - 1];
        const publicId = resourceType === 'raw' ? last : last.replace(/\.[^/.]+$/, '');
        return { publicId, resourceType };
      } catch {
        return null;
      }
    }

    return null;
  }

  private async safeDeleteCloudinaryMedia(urlOrId?: string | null, fallbackType: 'video' | 'image' | 'raw' = 'video') {
    const extracted = this.extractCloudinaryPublicId(urlOrId);
    if (!extracted) return;
    try {
      await this.mediaProvider.deleteMedia(extracted.publicId, extracted.resourceType || fallbackType).catch((err) => {
        this.logger.warn(`Could not delete Cloudinary asset ${extracted.publicId}: ${err.message}`);
      });
    } catch {}
  }

  async remove(id: string) {
    const program = await this.prisma.program.findUnique({ where: { id } });
    if (!program) {
      throw new NotFoundException(`Program not found`);
    }

    // 1. Collect all media across the program to delete from Cloudinary
    try {
      // 1a. Program cover image
      if (program.description) {
        try {
          const info = JSON.parse(program.description);
          if (info.image) {
            await this.safeDeleteCloudinaryMedia(info.image, 'image');
          }
        } catch {}
      }

      // 1b. All lessons in all steps
      const lessons = await this.prisma.lesson.findMany({
        where: { step: { programId: id } },
        select: { id: true, mediaUrl: true, type: true },
      });
      for (const lesson of lessons) {
        if (lesson.mediaUrl) {
          await this.safeDeleteCloudinaryMedia(lesson.mediaUrl, lesson.type === 'VIDEO' ? 'video' : 'raw');
        }
      }

      // 1c. All resources
      const resources = await this.prisma.resource.findMany({
        where: { programId: id },
        select: { mediaUrl: true },
      });
      for (const res of resources) {
        if (res.mediaUrl) {
          await this.safeDeleteCloudinaryMedia(res.mediaUrl, 'raw');
        }
      }

      // 1d. All resource items
      const resourceItems = await this.prisma.resourceItem.findMany({
        where: { programId: id },
        select: { storageKey: true, type: true },
      });
      for (const item of resourceItems) {
        if (item.storageKey) {
          const rType = item.type === 'GUIDED_AUDIO' ? 'video' : 'raw';
          await this.safeDeleteCloudinaryMedia(item.storageKey, rType);
        }
      }
    } catch (mediaErr: any) {
      this.logger.warn(`Media cleanup notice during program deletion: ${mediaErr.message}`);
    }

    // 2. Gather sessions for Zoom meeting cancellation outbox
    const sessions = await this.prisma.session.findMany({
      where: { batch: { programId: id } },
      select: { id: true, providerMeetingId: true },
    });

    // 3. Complete database transactional cascade cleanup
    await this.prisma.$transaction(async (tx) => {
      // 3a. Batches and session attendance cleanup
      const batches = await tx.batch.findMany({
        where: { programId: id },
        select: { id: true },
      });
      const batchIds = batches.map((b) => b.id);

      if (batchIds.length > 0) {
        const batchSessions = await tx.session.findMany({
          where: { batchId: { in: batchIds } },
          select: { id: true },
        });
        const sessionIds = batchSessions.map((s) => s.id);

        if (sessionIds.length > 0) {
          const attendances = await tx.attendance.findMany({
            where: { sessionId: { in: sessionIds } },
            select: { id: true },
          });
          const attendanceIds = attendances.map((a) => a.id);

          if (attendanceIds.length > 0) {
            await (tx as any).attendanceAuditLog?.deleteMany?.({
              where: { attendanceId: { in: attendanceIds } },
            }).catch(() => {});
            await (tx as any).attendanceEventLog?.deleteMany?.({
              where: { attendanceId: { in: attendanceIds } },
            }).catch(() => {});
            await tx.attendance.deleteMany({
              where: { id: { in: attendanceIds } },
            });
          }

          await tx.unmatchedAttendance.deleteMany({ where: { sessionId: { in: sessionIds } } }).catch(() => {});
          await tx.sessionBooking.deleteMany({ where: { sessionId: { in: sessionIds } } });
          await tx.session.deleteMany({ where: { id: { in: sessionIds } } });
        }

        // Clean batch enrolments
        const enrolments = await tx.enrolment.findMany({
          where: { OR: [{ programId: id }, { batchId: { in: batchIds } }] },
          select: { id: true },
        });
        const enrolmentIds = enrolments.map((e) => e.id);

        if (enrolmentIds.length > 0) {
          await tx.attempt.deleteMany({ where: { enrolmentId: { in: enrolmentIds } } }).catch(() => {});
          await tx.examAttempt.deleteMany({ where: { enrolmentId: { in: enrolmentIds } } }).catch(() => {});
          await tx.oralAssessment.deleteMany({ where: { enrolmentId: { in: enrolmentIds } } }).catch(() => {});
          await tx.userLessonProgress.deleteMany({ where: { enrolmentId: { in: enrolmentIds } } }).catch(() => {});
          await tx.stepProgress.deleteMany({ where: { enrolmentId: { in: enrolmentIds } } }).catch(() => {});
          await tx.signedAgreement.deleteMany({ where: { enrolmentId: { in: enrolmentIds } } }).catch(() => {});
          await tx.certificate.deleteMany({ where: { enrolmentId: { in: enrolmentIds } } }).catch(() => {});
          await tx.couponRedemption.deleteMany({ where: { enrolmentId: { in: enrolmentIds } } }).catch(() => {});
          await tx.payment.deleteMany({ where: { enrolmentId: { in: enrolmentIds } } }).catch(() => {});
          await tx.enrolment.deleteMany({ where: { id: { in: enrolmentIds } } });
        }

        await tx.batchTrainer.deleteMany({ where: { batchId: { in: batchIds } } }).catch(() => {});
        await tx.batchStepOverride.deleteMany({ where: { batchId: { in: batchIds } } }).catch(() => {});
        await (tx as any).batchAnnouncement?.deleteMany?.({ where: { batchId: { in: batchIds } } }).catch(() => {});
        await tx.conversation.deleteMany({ where: { batchId: { in: batchIds } } }).catch(() => {});
        await tx.batch.deleteMany({ where: { id: { in: batchIds } } });
      } else {
        // Enrolments directly on program without batch
        const directEnrolments = await tx.enrolment.findMany({
          where: { programId: id },
          select: { id: true },
        });
        const enrolmentIds = directEnrolments.map((e) => e.id);
        if (enrolmentIds.length > 0) {
          await tx.attempt.deleteMany({ where: { enrolmentId: { in: enrolmentIds } } }).catch(() => {});
          await tx.examAttempt.deleteMany({ where: { enrolmentId: { in: enrolmentIds } } }).catch(() => {});
          await tx.oralAssessment.deleteMany({ where: { enrolmentId: { in: enrolmentIds } } }).catch(() => {});
          await tx.userLessonProgress.deleteMany({ where: { enrolmentId: { in: enrolmentIds } } }).catch(() => {});
          await tx.stepProgress.deleteMany({ where: { enrolmentId: { in: enrolmentIds } } }).catch(() => {});
          await tx.signedAgreement.deleteMany({ where: { enrolmentId: { in: enrolmentIds } } }).catch(() => {});
          await tx.certificate.deleteMany({ where: { enrolmentId: { in: enrolmentIds } } }).catch(() => {});
          await tx.couponRedemption.deleteMany({ where: { enrolmentId: { in: enrolmentIds } } }).catch(() => {});
          await tx.payment.deleteMany({ where: { enrolmentId: { in: enrolmentIds } } }).catch(() => {});
          await tx.enrolment.deleteMany({ where: { id: { in: enrolmentIds } } });
        }
      }

      // 3b. Clean steps, lessons, quizzes
      const steps = await tx.step.findMany({
        where: { programId: id },
        select: { id: true },
      });
      const stepIds = steps.map((s) => s.id);

      if (stepIds.length > 0) {
        // Quizzes
        const quizzes = await tx.quiz.findMany({
          where: { stepId: { in: stepIds } },
          select: { id: true },
        });
        const quizIds = quizzes.map((q) => q.id);

        if (quizIds.length > 0) {
          const questions = await tx.question.findMany({
            where: { quizId: { in: quizIds } },
            select: { id: true },
          });
          const questionIds = questions.map((q) => q.id);

          if (questionIds.length > 0) {
            await tx.option.deleteMany({ where: { questionId: { in: questionIds } } }).catch(() => {});
            await tx.question.deleteMany({ where: { id: { in: questionIds } } });
          }
          await tx.attempt.deleteMany({ where: { quizId: { in: quizIds } } }).catch(() => {});
          await tx.quiz.deleteMany({ where: { id: { in: quizIds } } });
        }

        // Lessons
        const lessons = await tx.lesson.findMany({
          where: { stepId: { in: stepIds } },
          select: { id: true },
        });
        const lessonIds = lessons.map((l) => l.id);
        if (lessonIds.length > 0) {
          await tx.userLessonProgress.deleteMany({ where: { lessonId: { in: lessonIds } } }).catch(() => {});
          await tx.lesson.deleteMany({ where: { id: { in: lessonIds } } });
        }

        await tx.batchStepOverride.deleteMany({ where: { stepId: { in: stepIds } } }).catch(() => {});
        await tx.stepProgress.deleteMany({ where: { stepId: { in: stepIds } } }).catch(() => {});
        await tx.step.deleteMany({ where: { id: { in: stepIds } } });
      }

      // 3c. Clean resources
      await tx.resourceItem.deleteMany({ where: { programId: id } }).catch(() => {});
      await tx.resource.deleteMany({ where: { programId: id } }).catch(() => {});

      // 3d. Clean agreements and templates
      const agreementTemplates = await tx.agreementTemplate.findMany({
        where: { programId: id },
        select: { id: true },
      });
      const templateIds = agreementTemplates.map((t) => t.id);
      if (templateIds.length > 0) {
        await tx.agreementTemplateVersion.deleteMany({ where: { templateId: { in: templateIds } } }).catch(() => {});
        await tx.signedAgreement.deleteMany({ where: { templateId: { in: templateIds } } }).catch(() => {});
        await tx.agreementTemplate.deleteMany({ where: { id: { in: templateIds } } });
      }

      // 3e. Clean certificates
      await tx.certificate.deleteMany({ where: { programId: id } }).catch(() => {});

      // 3f. Disconnect from coupons
      const couponsWithProgram = await tx.coupon.findMany({
        where: { programs: { some: { id } } },
        select: { id: true },
      });
      for (const coupon of couponsWithProgram) {
        await tx.coupon.update({
          where: { id: coupon.id },
          data: { programs: { disconnect: { id } } },
        }).catch(() => {});
      }

      // 3g. Finally, delete the program
      await tx.program.delete({ where: { id } });
    });

    // 4. Cancel Zoom Meetings
    try {
      for (const sess of sessions) {
        if (sess.providerMeetingId) {
          await this.prisma.outboxEvent.create({
            data: {
              type: 'sync-meeting',
              action: 'CANCEL',
              payload: { providerMeetingId: sess.providerMeetingId },
            },
          }).catch(() => {});
        }
      }
    } catch {}

    await this.cacheHelper.invalidateNamespace('programs');
    await this.cacheHelper.invalidateNamespace('batches');
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
          resources: {
            where: isPrivileged ? undefined : { status: ContentStatus.PUBLISHED },
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

      // Query standalone ResourceLibrary items tagged for this step sequence or stepId
      try {
        const resourceItems = await this.prisma.resourceItem.findMany({
          where: {
            isPublished: true,
            OR: [
              { requiredStepId: stepId },
              { programId: step.programId, stepTagNumber: step.sequence },
            ],
          },
          include: { category: true },
        });
        (step as any).resourceItems = resourceItems;
      } catch {
        (step as any).resourceItems = [];
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

      const rawSeq = data.stepNumber ?? data.sequence;
      const targetSeq = (!rawSeq || rawSeq > existingSteps.length + 1)
        ? existingSteps.length + 1
        : rawSeq;

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

    // 1. Delete all lessons' media from Cloudinary
    try {
      const lessons = await this.prisma.lesson.findMany({
        where: { stepId },
        select: { mediaUrl: true, type: true },
      });
      for (const lesson of lessons) {
        if (lesson.mediaUrl) {
          await this.safeDeleteCloudinaryMedia(lesson.mediaUrl, lesson.type === 'VIDEO' ? 'video' : 'raw');
        }
      }
    } catch (mediaErr: any) {
      this.logger.warn(`Media cleanup notice during step deletion: ${mediaErr.message}`);
    }

    await this.prisma.$transaction(async (tx) => {
      // Clean quiz relations if any
      const quiz = await tx.quiz.findUnique({ where: { stepId } });
      if (quiz) {
        const questions = await tx.question.findMany({ where: { quizId: quiz.id }, select: { id: true } });
        const questionIds = questions.map((q) => q.id);
        if (questionIds.length > 0) {
          await tx.option.deleteMany({ where: { questionId: { in: questionIds } } }).catch(() => {});
          await tx.question.deleteMany({ where: { id: { in: questionIds } } });
        }
        await tx.attempt.deleteMany({ where: { quizId: quiz.id } }).catch(() => {});
        await tx.quiz.delete({ where: { id: quiz.id } });
      }

      // Clean lesson progress and lessons
      const stepLessons = await tx.lesson.findMany({ where: { stepId }, select: { id: true } });
      const lessonIds = stepLessons.map((l) => l.id);
      if (lessonIds.length > 0) {
        await tx.userLessonProgress.deleteMany({ where: { lessonId: { in: lessonIds } } }).catch(() => {});
        await tx.lesson.deleteMany({ where: { id: { in: lessonIds } } });
      }

      await tx.batchStepOverride.deleteMany({ where: { stepId } }).catch(() => {});
      await tx.stepProgress.deleteMany({ where: { stepId } }).catch(() => {});
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

      const rawOrder = data.lessonOrder ?? data.order;
      const targetOrder = (!rawOrder || rawOrder > existingLessons.length + 1)
        ? existingLessons.length + 1
        : rawOrder;

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

    // Delete media from Cloudinary (video or document)
    try {
      if (lesson.mediaUrl) {
        await this.safeDeleteCloudinaryMedia(lesson.mediaUrl, lesson.type === 'VIDEO' ? 'video' : 'raw');
      }
    } catch (mediaErr: any) {
      this.logger.warn(`Media cleanup notice during lesson deletion: ${mediaErr.message}`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userLessonProgress.deleteMany({ where: { lessonId } }).catch(() => {});
      await tx.lesson.delete({ where: { id: lessonId } });

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
