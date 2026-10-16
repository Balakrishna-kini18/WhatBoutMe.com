import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { ContentStatus, EnrolmentStatus, ReleaseSchedule, Role } from '@prisma/client';
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

  private async safeInvalidateTags(tags: string[]) {
    if (typeof (this.cacheHelper as any)?.invalidateTags === 'function') {
      await this.cacheHelper.invalidateTags(tags);
    } else if (typeof (this.cacheHelper as any)?.invalidateNamespace === 'function') {
      for (const tag of tags) {
        await (this.cacheHelper as any).invalidateNamespace(tag);
      }
    }
  }

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
              select: { steps: true },
            },
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
            select: { steps: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    }, 3600, ['programs']);
  }

  async findOne(id: string, role?: string, userId?: string) {
    const isStaff = role === Role.SUPER_ADMIN || role === Role.ADMIN;
    const shouldCheckEnrolment = !isStaff && !!userId && typeof this.prisma.enrolment?.findFirst === 'function';

    const cacheKey = await this.cacheHelper.getEndpointKey(
      'programs',
      (role as any) || 'GUEST',
      { action: 'findOne', id, userId: shouldCheckEnrolment ? userId : 'public' },
    );

    return this.cacheHelper.getOrSet(
      cacheKey,
      async () => {
        const [program, enr] = await Promise.all([
          this.prisma.program.findUnique({
            where: { id },
            include: {
              steps: {
                where: isStaff ? undefined : { status: ContentStatus.PUBLISHED },
                orderBy: { sequence: 'asc' },
              },
            },
          }),
          shouldCheckEnrolment
            ? this.prisma.enrolment.findFirst({
                where: {
                  userId,
                  programId: id,
                  status: { in: [EnrolmentStatus.ACTIVE, EnrolmentStatus.COMPLETED] },
                },
                select: { id: true },
              })
            : Promise.resolve(null),
        ]);

        if (!program) {
          throw new NotFoundException(`Program not found`);
        }

        if (!isStaff && (program.status !== ContentStatus.PUBLISHED || !program.isActive)) {
          if (!enr) {
            throw new NotFoundException(`Program not found`);
          }
        }

        return program;
      },
      1800,
      ['programs', `program:${id}`],
    );
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

    await this.safeInvalidateTags(['programs']);
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

    await this.safeInvalidateTags(['programs', `program:${id}`]);
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

    await this.safeInvalidateTags(['programs', `program:${id}`]);
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

  private extractCloudinaryUrlsFromText(text?: string | null): string[] {
    if (!text || typeof text !== 'string') return [];
    const matches = text.match(/https?:\/\/[^\s"'<>\)]*res\.cloudinary\.com[^\s"'<>\)]*/gi);
    return matches ? Array.from(new Set(matches)) : [];
  }

  private async safeDeleteCloudinaryMedia(urlOrId?: string | null, fallbackType: 'video' | 'image' | 'raw' = 'video') {
    const extracted = this.extractCloudinaryPublicId(urlOrId);
    if (!extracted) return;
    try {
      const type = extracted.resourceType || fallbackType;
      const success = await this.mediaProvider.deleteMedia(extracted.publicId, type).catch((err) => {
        this.logger.warn(`Could not delete Cloudinary asset ${extracted.publicId} (${type}): ${err.message}`);
        return false;
      });

      // If delete was not confirmed, try fallback types (e.g. PDFs can be 'raw' or 'image' in Cloudinary)
      if (!success) {
        const altTypes: ('video' | 'image' | 'raw')[] = (['raw', 'image', 'video'] as const).filter((t) => t !== type);
        for (const alt of altTypes) {
          try {
            await this.mediaProvider.deleteMedia(extracted.publicId, alt).catch(() => false);
          } catch {}
        }
      }
    } catch {}
  }

  private async cascadeDeleteProgramMediaAndData(program: {
    id: string;
    title: string;
    description?: string | null;
    certificateTemplate?: string | null;
  }) {
    const id = program.id;

    // ─────────────────────────────────────────────────────────────────────────
    // 1. GATHER AND DELETE ALL CLOUDINARY MEDIA ASSETS (PDFs, Videos, Images)
    // ─────────────────────────────────────────────────────────────────────────
    try {
      const mediaToDelete: { url: string; type: 'video' | 'raw' | 'image' }[] = [];

      // 1a. Program cover image & certificate template
      if (program.description) {
        try {
          const info = JSON.parse(program.description);
          if (info.image) mediaToDelete.push({ url: info.image, type: 'image' });
        } catch {}
      }
      if (program.certificateTemplate && program.certificateTemplate.includes('cloudinary.com')) {
        mediaToDelete.push({ url: program.certificateTemplate, type: 'image' });
      }

      // 1b. Lessons: Video, PDF, Audio media + embedded URLs in lesson content
      const lessons = typeof (this.prisma as any).lesson?.findMany === 'function'
        ? await this.prisma.lesson.findMany({
            where: { step: { programId: id } },
            select: { id: true, mediaUrl: true, type: true, content: true },
          })
        : [];
      for (const lesson of lessons) {
        if (lesson.mediaUrl) {
          const rType: 'video' | 'raw' | 'image' =
            lesson.type === 'VIDEO' ? 'video' : lesson.type === 'AUDIO' ? 'video' : 'raw';
          mediaToDelete.push({ url: lesson.mediaUrl, type: rType });
        }
        if (lesson.content) {
          const embedded = this.extractCloudinaryUrlsFromText(lesson.content);
          embedded.forEach((u) => mediaToDelete.push({ url: u, type: 'image' }));
        }
      }

      // 1c. Resources
      const resources = typeof (this.prisma as any).resource?.findMany === 'function'
        ? await this.prisma.resource.findMany({
            where: { programId: id },
            select: { mediaUrl: true },
          })
        : [];
      for (const res of resources) {
        if (res.mediaUrl) {
          mediaToDelete.push({ url: res.mediaUrl, type: 'raw' });
        }
      }

      // 1d. ResourceItems
      if (typeof (this.prisma as any).resourceItem?.findMany === 'function') {
        const resourceItems = await (this.prisma as any).resourceItem.findMany({
          where: { programId: id },
          select: { storageKey: true, type: true },
        });
        for (const item of resourceItems) {
          if (item.storageKey) {
            const rType = item.type === 'GUIDED_AUDIO' ? 'video' : 'raw';
            mediaToDelete.push({ url: item.storageKey, type: rType });
          }
        }
      }

      // 1e. Agreement templates & signed agreements
      const templateVersions = typeof (this.prisma as any).agreementTemplateVersion?.findMany === 'function'
        ? await (this.prisma as any).agreementTemplateVersion.findMany({
            where: { template: { programId: id } },
            select: { content: true },
          })
        : [];
      const signedAgreements = typeof (this.prisma as any).signedAgreement?.findMany === 'function'
        ? await (this.prisma as any).signedAgreement.findMany({
            where: { programId: id },
            select: { signedPdfUrl: true, drawnSignature: true },
          })
        : [];
      for (const ver of templateVersions) {
        if (ver.content) {
          this.extractCloudinaryUrlsFromText(ver.content).forEach((u) => mediaToDelete.push({ url: u, type: 'raw' }));
        }
      }
      for (const sa of signedAgreements) {
        if (sa.signedPdfUrl) mediaToDelete.push({ url: sa.signedPdfUrl, type: 'raw' });
        if (sa.drawnSignature && sa.drawnSignature.includes('cloudinary.com')) {
          mediaToDelete.push({ url: sa.drawnSignature, type: 'image' });
        }
      }

      // 1f. Certificates
      const certificates = typeof (this.prisma as any).certificate?.findMany === 'function'
        ? await (this.prisma as any).certificate.findMany({
            where: { programId: id },
            select: { pdfUrl: true },
          })
        : [];
      for (const cert of certificates) {
        if (cert.pdfUrl) mediaToDelete.push({ url: cert.pdfUrl, type: 'raw' });
      }

      // 1g. Questions & options: scan text/explanation for any Cloudinary media
      const questions = typeof (this.prisma as any).question?.findMany === 'function'
        ? await this.prisma.question.findMany({
            where: {
              OR: [
                { step: { programId: id } },
                { quiz: { step: { programId: id } } },
                { questionBank: { programId: id } },
              ],
            },
            select: { text: true, explanation: true, options: { select: { text: true } } },
          })
        : [];
      for (const q of questions) {
        this.extractCloudinaryUrlsFromText(q.text).forEach((u) => mediaToDelete.push({ url: u, type: 'image' }));
        this.extractCloudinaryUrlsFromText(q.explanation).forEach((u) => mediaToDelete.push({ url: u, type: 'image' }));
        if (Array.isArray(q.options)) {
          for (const opt of q.options) {
            this.extractCloudinaryUrlsFromText(opt.text).forEach((u) => mediaToDelete.push({ url: u, type: 'image' }));
          }
        }
      }

      // Perform all Cloudinary deletions
      for (const item of mediaToDelete) {
        await this.safeDeleteCloudinaryMedia(item.url, item.type);
      }

      // 1h. Cancel Zoom meetings for any program batch sessions
      const sessions = typeof this.prisma.session?.findMany === 'function'
        ? await this.prisma.session.findMany({
            where: { batch: { programId: id } },
            select: { providerMeetingId: true },
          })
        : [];
      const outboxPayloads = sessions
        .filter((sess) => sess.providerMeetingId && this.prisma.outboxEvent)
        .map((sess) => ({
          type: 'sync-meeting',
          action: 'CANCEL',
          payload: { providerMeetingId: sess.providerMeetingId },
        }));

      if (outboxPayloads.length > 0 && typeof (this.prisma.outboxEvent as any)?.createMany === 'function') {
        await (this.prisma.outboxEvent as any).createMany({ data: outboxPayloads }).catch(() => {});
      }
    } catch (mediaErr: any) {
      this.logger.warn(`Media cleanup warning during program deletion: ${mediaErr.message}`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. CASCADE DELETE ALL DATABASE ENTITIES IN DEPENDENCY ORDER
    // ─────────────────────────────────────────────────────────────────────────
    await this.prisma.$transaction(async (tx) => {
      // Collect IDs for related batches, enrolments, steps, questionBanks, exams
      const [batches, enrolments, steps, questionBanks, exams] = await Promise.all([
        typeof (tx as any).batch?.findMany === 'function'
          ? (tx as any).batch.findMany({ where: { programId: id }, select: { id: true } })
          : [],
        typeof (tx as any).enrolment?.findMany === 'function'
          ? (tx as any).enrolment.findMany({ where: { programId: id }, select: { id: true } })
          : [],
        typeof (tx as any).step?.findMany === 'function'
          ? (tx as any).step.findMany({ where: { programId: id }, select: { id: true } })
          : [],
        typeof (tx as any).questionBank?.findMany === 'function'
          ? (tx as any).questionBank.findMany({ where: { programId: id }, select: { id: true } })
          : [],
        typeof (tx as any).exam?.findMany === 'function'
          ? (tx as any).exam.findMany({ where: { programId: id }, select: { id: true } })
          : [],
      ]);

      const batchIds = Array.isArray(batches) ? batches.map((b: any) => b.id) : [];
      const enrolmentIds = Array.isArray(enrolments) ? enrolments.map((e: any) => e.id) : [];
      const stepIds = Array.isArray(steps) ? steps.map((s: any) => s.id) : [];
      const qbIds = Array.isArray(questionBanks) ? questionBanks.map((qb: any) => qb.id) : [];
      const examIds = Array.isArray(exams) ? exams.map((x: any) => x.id) : [];

      const [sessions, lessons, quizzes] = await Promise.all([
        batchIds.length > 0 && typeof (tx as any).session?.findMany === 'function'
          ? (tx as any).session.findMany({ where: { batchId: { in: batchIds } }, select: { id: true } })
          : [],
        stepIds.length > 0 && typeof (tx as any).lesson?.findMany === 'function'
          ? (tx as any).lesson.findMany({ where: { stepId: { in: stepIds } }, select: { id: true } })
          : [],
        stepIds.length > 0 && typeof (tx as any).quiz?.findMany === 'function'
          ? (tx as any).quiz.findMany({ where: { stepId: { in: stepIds } }, select: { id: true } })
          : [],
      ]);

      const sessionIds = Array.isArray(sessions) ? sessions.map((s: any) => s.id) : [];
      const lessonIds = Array.isArray(lessons) ? lessons.map((l: any) => l.id) : [];
      const quizIds = Array.isArray(quizzes) ? quizzes.map((q: any) => q.id) : [];

      // A. Attendance & Session Bookings
      if (sessionIds.length > 0 || enrolmentIds.length > 0) {
        const sessOrEnrol = [];
        if (sessionIds.length > 0) sessOrEnrol.push({ sessionId: { in: sessionIds } });
        if (enrolmentIds.length > 0) sessOrEnrol.push({ enrolmentId: { in: enrolmentIds } });
        if (sessOrEnrol.length > 0) {
          if (typeof (tx as any).attendance?.deleteMany === 'function') {
            await (tx as any).attendance.deleteMany({ where: { OR: sessOrEnrol } }).catch(() => {});
          }
          if (typeof (tx as any).unmatchedAttendance?.deleteMany === 'function') {
            await (tx as any).unmatchedAttendance.deleteMany({ where: { OR: sessOrEnrol } }).catch(() => {});
          }
          if (typeof (tx as any).sessionBooking?.deleteMany === 'function') {
            await (tx as any).sessionBooking.deleteMany({ where: { OR: sessOrEnrol } }).catch(() => {});
          }
        }
      }

      // B. Sessions & Batch relations
      if (sessionIds.length > 0 && typeof (tx as any).session?.deleteMany === 'function') {
        await (tx as any).session.deleteMany({ where: { id: { in: sessionIds } } }).catch(() => {});
      }
      if (batchIds.length > 0) {
        if (typeof (tx as any).batchTrainer?.deleteMany === 'function') {
          await (tx as any).batchTrainer.deleteMany({ where: { batchId: { in: batchIds } } }).catch(() => {});
        }
        if (typeof (tx as any).batchAnnouncement?.deleteMany === 'function') {
          await (tx as any).batchAnnouncement.deleteMany({ where: { batchId: { in: batchIds } } }).catch(() => {});
        }
        if (typeof (tx as any).conversation?.deleteMany === 'function') {
          await (tx as any).conversation.deleteMany({ where: { batchId: { in: batchIds } } }).catch(() => {});
        }
      }
      if (batchIds.length > 0 || stepIds.length > 0) {
        const overridesOr = [];
        if (batchIds.length > 0) overridesOr.push({ batchId: { in: batchIds } });
        if (stepIds.length > 0) overridesOr.push({ stepId: { in: stepIds } });
        if (typeof (tx as any).batchStepOverride?.deleteMany === 'function') {
          await (tx as any).batchStepOverride.deleteMany({ where: { OR: overridesOr } }).catch(() => {});
        }
      }

      // C. Student attempts, quizzes, progress, oral assessments
      const questions = typeof (tx as any).question?.findMany === 'function'
        ? await (tx as any).question.findMany({
            where: {
              OR: [
                ...(quizIds.length > 0 ? [{ quizId: { in: quizIds } }] : []),
                ...(stepIds.length > 0 ? [{ stepId: { in: stepIds } }] : []),
                ...(qbIds.length > 0 ? [{ questionBankId: { in: qbIds } }] : []),
              ],
            },
            select: { id: true },
          })
        : [];
      const questionIds = Array.isArray(questions) ? questions.map((q: any) => q.id) : [];

      if (questionIds.length > 0 || enrolmentIds.length > 0) {
        const answerOr = [];
        if (questionIds.length > 0) answerOr.push({ questionId: { in: questionIds } });
        if (enrolmentIds.length > 0) answerOr.push({ attempt: { enrolmentId: { in: enrolmentIds } } });
        if (typeof (tx as any).quizAnswer?.deleteMany === 'function') {
          await (tx as any).quizAnswer.deleteMany({ where: { OR: answerOr } }).catch(() => {});
        }
      }

      if (quizIds.length > 0 || enrolmentIds.length > 0) {
        const attemptOr = [];
        if (quizIds.length > 0) attemptOr.push({ quizId: { in: quizIds } });
        if (enrolmentIds.length > 0) attemptOr.push({ enrolmentId: { in: enrolmentIds } });
        if (typeof (tx as any).attempt?.deleteMany === 'function') {
          await (tx as any).attempt.deleteMany({ where: { OR: attemptOr } }).catch(() => {});
        }
      }

      if (examIds.length > 0 || enrolmentIds.length > 0) {
        const examAttemptOr = [];
        if (examIds.length > 0) examAttemptOr.push({ examId: { in: examIds } });
        if (enrolmentIds.length > 0) examAttemptOr.push({ enrolmentId: { in: enrolmentIds } });
        if (typeof (tx as any).examAttempt?.deleteMany === 'function') {
          await (tx as any).examAttempt.deleteMany({ where: { OR: examAttemptOr } }).catch(() => {});
        }
      }

      if (typeof (tx as any).oralAssessment?.deleteMany === 'function') {
        await (tx as any).oralAssessment.deleteMany({
          where: {
            OR: [{ programId: id }, ...(enrolmentIds.length > 0 ? [{ enrolmentId: { in: enrolmentIds } }] : [])],
          },
        }).catch(() => {});
      }

      if (lessonIds.length > 0 || enrolmentIds.length > 0) {
        const lessonProgOr = [];
        if (lessonIds.length > 0) lessonProgOr.push({ lessonId: { in: lessonIds } });
        if (enrolmentIds.length > 0) lessonProgOr.push({ enrolmentId: { in: enrolmentIds } });
        if (typeof (tx as any).userLessonProgress?.deleteMany === 'function') {
          await (tx as any).userLessonProgress.deleteMany({ where: { OR: lessonProgOr } }).catch(() => {});
        }
      }

      if (stepIds.length > 0 || enrolmentIds.length > 0) {
        const stepProgOr = [];
        if (stepIds.length > 0) stepProgOr.push({ stepId: { in: stepIds } });
        if (enrolmentIds.length > 0) stepProgOr.push({ enrolmentId: { in: enrolmentIds } });
        if (typeof (tx as any).stepProgress?.deleteMany === 'function') {
          await (tx as any).stepProgress.deleteMany({ where: { OR: stepProgOr } }).catch(() => {});
        }
      }

      // D. Enrolment children: payments, redemptions, agreements, certificates
      if (enrolmentIds.length > 0) {
        if (typeof (tx as any).payment?.deleteMany === 'function') {
          await (tx as any).payment.deleteMany({ where: { enrolmentId: { in: enrolmentIds } } }).catch(() => {});
        }
        if (typeof (tx as any).couponRedemption?.deleteMany === 'function') {
          await (tx as any).couponRedemption.deleteMany({ where: { enrolmentId: { in: enrolmentIds } } }).catch(() => {});
        }
      }

      if (typeof (tx as any).certificate?.deleteMany === 'function') {
        await (tx as any).certificate.deleteMany({
          where: {
            OR: [{ programId: id }, ...(enrolmentIds.length > 0 ? [{ enrolmentId: { in: enrolmentIds } }] : [])],
          },
        }).catch(() => {});
      }

      if (typeof (tx as any).signedAgreement?.deleteMany === 'function') {
        await (tx as any).signedAgreement.deleteMany({
          where: {
            OR: [{ programId: id }, ...(enrolmentIds.length > 0 ? [{ enrolmentId: { in: enrolmentIds } }] : [])],
          },
        }).catch(() => {});
      }

      if (typeof (tx as any).agreementTemplate?.deleteMany === 'function') {
        await (tx as any).agreementTemplate.deleteMany({ where: { programId: id } }).catch(() => {});
      }

      // E. Delete Enrolments and Batches
      if (enrolmentIds.length > 0 && typeof (tx as any).enrolment?.deleteMany === 'function') {
        await (tx as any).enrolment.deleteMany({ where: { id: { in: enrolmentIds } } }).catch(() => {});
      }
      if (batchIds.length > 0 && typeof (tx as any).batch?.deleteMany === 'function') {
        await (tx as any).batch.deleteMany({ where: { id: { in: batchIds } } }).catch(() => {});
      }

      // F. Delete Resources & ResourceItems
      if (typeof (tx as any).resource?.deleteMany === 'function') {
        await (tx as any).resource.deleteMany({ where: { programId: id } }).catch(() => {});
      }
      if (typeof (tx as any).resourceItem?.deleteMany === 'function') {
        await (tx as any).resourceItem.deleteMany({ where: { programId: id } }).catch(() => {});
      }

      // G. Delete Options, Questions, Quizzes, Lessons, Steps, QuestionBanks, Exams
      if (questionIds.length > 0) {
        if (typeof (tx as any).option?.deleteMany === 'function') {
          await (tx as any).option.deleteMany({ where: { questionId: { in: questionIds } } }).catch(() => {});
        }
        if (typeof (tx as any).question?.deleteMany === 'function') {
          await (tx as any).question.deleteMany({ where: { id: { in: questionIds } } }).catch(() => {});
        }
      }
      if (quizIds.length > 0 && typeof (tx as any).quiz?.deleteMany === 'function') {
        await (tx as any).quiz.deleteMany({ where: { id: { in: quizIds } } }).catch(() => {});
      }
      if (lessonIds.length > 0 && typeof (tx as any).lesson?.deleteMany === 'function') {
        await (tx as any).lesson.deleteMany({ where: { id: { in: lessonIds } } }).catch(() => {});
      }
      if (stepIds.length > 0 && typeof (tx as any).step?.deleteMany === 'function') {
        await (tx as any).step.deleteMany({ where: { id: { in: stepIds } } }).catch(() => {});
      }
      if (qbIds.length > 0 && typeof (tx as any).questionBank?.deleteMany === 'function') {
        await (tx as any).questionBank.deleteMany({ where: { id: { in: qbIds } } }).catch(() => {});
      }
      if (examIds.length > 0 && typeof (tx as any).exam?.deleteMany === 'function') {
        await (tx as any).exam.deleteMany({ where: { id: { in: examIds } } }).catch(() => {});
      }

      // H. Delete the Program itself
      await tx.program.delete({ where: { id } });
    });
  }

  async remove(id: string, force: boolean = false) {
    const program = await this.prisma.program.findUnique({ where: { id } });
    if (!program) {
      throw new NotFoundException(`Program not found`);
    }

    const [batchCount, enrolmentCount] = await Promise.all([
      this.prisma.batch.count({ where: { programId: id } }),
      this.prisma.enrolment.count({ where: { programId: id } }),
    ]);

    if (!force && (batchCount > 0 || enrolmentCount > 0)) {
      // Non-forced removal: safe archive to preserve active historical records
      this.logger.log(
        `Archiving program ${id} to preserve ${batchCount} batches and ${enrolmentCount} enrolments.`,
      );

      await this.prisma.program.update({
        where: { id },
        data: {
          status: ContentStatus.ARCHIVED,
          isActive: false,
        },
      });

      await this.safeInvalidateTags(['programs', 'batches', `program:${id}`]);
      return {
        id,
        deleted: false,
        archived: true,
        message: `Program "${program.title}" has active cohorts or student history and was safely archived.`,
      };
    }

    // Full Permanent Delete: Clean Cloudinary storage & cascade delete DB records
    await this.cascadeDeleteProgramMediaAndData(program);

    await this.safeInvalidateTags(['programs', 'batches', `program:${id}`]);
    return {
      id,
      deleted: true,
      archived: false,
      message: `Program "${program.title}" and all associated videos, PDFs, questions, and records permanently deleted.`,
    };
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
      const [program, steps] = await Promise.all([
        this.prisma.program.findUnique({
          where: { id: programId },
          select: { id: true, status: true, isActive: true },
        }),
        this.prisma.step.findMany({
          where: {
            programId,
            ...(isStaff ? {} : { status: ContentStatus.PUBLISHED }),
          },
          orderBy: { sequence: 'asc' },
        }),
      ]);

      if (!program) {
        throw new NotFoundException(`Program not found`);
      }

      if (!isStaff && (program.status !== ContentStatus.PUBLISHED || !program.isActive)) {
        throw new NotFoundException(`Program not found`);
      }

      return steps;
    }, 1800, ['programs', 'steps', `program:${programId}`]);
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
    }, 1800, ['programs', 'steps', `step:${stepId}`]);
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

    await this.safeInvalidateTags(['programs', 'steps', `program:${programId}`]);
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

    await this.safeInvalidateTags(['programs', 'steps', `program:${step.programId}`, `step:${stepId}`]);
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

    await this.safeInvalidateTags(['programs', 'steps', `program:${step.programId}`]);
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

    await this.safeInvalidateTags(['programs', 'steps', `program:${programId}`]);

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

    await this.safeInvalidateTags(['programs', 'steps', `program:${step.programId}`, `step:${stepId}`]);
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
      if (typeof (tx as any).quiz?.findUnique === 'function') {
        const quiz = await (tx as any).quiz.findUnique({ where: { stepId } });
        if (quiz) {
          if (typeof (tx as any).question?.findMany === 'function') {
            const questions = await (tx as any).question.findMany({ where: { quizId: quiz.id }, select: { id: true } });
            const questionIds = questions.map((q: any) => q.id);
            if (questionIds.length > 0) {
              await (tx as any).option?.deleteMany?.({ where: { questionId: { in: questionIds } } }).catch(() => {});
              await (tx as any).question?.deleteMany?.({ where: { id: { in: questionIds } } });
            }
          }
          await (tx as any).attempt?.deleteMany?.({ where: { quizId: quiz.id } }).catch(() => {});
          await (tx as any).quiz?.delete?.({ where: { id: quiz.id } });
        }
      }

      // Clean lesson progress and lessons
      const stepLessons = await tx.lesson.findMany({ where: { stepId }, select: { id: true } });
      const lessonIds = stepLessons.map((l) => l.id);
      if (lessonIds.length > 0) {
        if (typeof (tx as any).userLessonProgress?.deleteMany === 'function') {
          await (tx as any).userLessonProgress.deleteMany({ where: { lessonId: { in: lessonIds } } }).catch(() => {});
        }
        await tx.lesson.deleteMany({ where: { id: { in: lessonIds } } });
      }

      if (typeof (tx as any).batchStepOverride?.deleteMany === 'function') {
        await (tx as any).batchStepOverride.deleteMany({ where: { stepId } }).catch(() => {});
      }
      if (typeof (tx as any).stepProgress?.deleteMany === 'function') {
        await (tx as any).stepProgress.deleteMany({ where: { stepId } }).catch(() => {});
      }
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

    await this.safeInvalidateTags(['programs', 'steps', `program:${step.programId}`, `step:${stepId}`]);
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
    }, 1800, ['programs', 'lessons', `step:${stepId}`]);
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

    await this.safeInvalidateTags(['programs', 'steps', 'lessons', `step:${stepId}`, `program:${step.programId}`]);
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

    await this.safeInvalidateTags(['programs', 'steps', 'lessons', `step:${lesson.stepId}`]);
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

    await this.safeInvalidateTags(['programs', 'steps', 'lessons', `step:${lesson.stepId}`]);
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

    await this.safeInvalidateTags(['programs', 'steps', 'lessons', `step:${stepId}`]);

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

    await this.safeInvalidateTags(['programs', 'steps', 'lessons', `step:${lesson.stepId}`]);
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
      if (typeof (tx as any).userLessonProgress?.deleteMany === 'function') {
        await (tx as any).userLessonProgress.deleteMany({ where: { lessonId } }).catch(() => {});
      }
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

    await this.safeInvalidateTags(['programs', 'steps', 'lessons', `step:${lesson.stepId}`]);
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

    // Validate that non-TEXT lessons are all completed before doing any database writes
    const nonTextUncompleted = uncompletedLessons.find((l) => l.type !== 'TEXT');
    if (nonTextUncompleted) {
      throw new BadRequestException(
        'Step cannot be completed yet: all video, audio, and document materials must be reviewed first',
      );
    }

    // Auto-complete all remaining TEXT lessons concurrently
    if (uncompletedLessons.length > 0) {
      await Promise.all(
        uncompletedLessons.map((l) =>
          this.prisma.userLessonProgress.upsert({
            where: { enrolmentId_lessonId: { enrolmentId: enrolment.id, lessonId: l.id } },
            create: { enrolmentId: enrolment.id, lessonId: l.id, viewed: true, progressPercent: 100 },
            update: { viewed: true, progressPercent: 100 },
          }),
        ),
      );
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
