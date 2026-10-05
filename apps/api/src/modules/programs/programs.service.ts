import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { markDailyAttendance } from '../../common/daily-attendance.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CacheHelperService } from '../../common/cache/cache-helper.service.js';

@Injectable()
export class ProgramsService {
  constructor(
    private prisma: PrismaService,
    private cacheHelper: CacheHelperService
  ) {}

  async findAll(role?: string) {
    const cacheKey = await this.cacheHelper.getEndpointKey('programs', role as any || 'GUEST', { action: 'findAll' });
    return this.cacheHelper.getOrSet(cacheKey, async () => {
      const programs = await this.prisma.program.findMany();
      return programs;
    });
  }

  async enroll(programId: string, userId: string) {
    let batch = await this.prisma.batch.findFirst({
      where: { programId },
      include: { program: true }
    });

    if (!batch) {
      const program = await this.prisma.program.findUnique({ where: { id: programId } });
      batch = await this.prisma.batch.create({
        data: {
          name: 'Default Cohort',
          programId,
          capacity: 100,
          startDate: new Date()
        },
        include: { program: true }
      }) as any;
      if (!batch!.program && program) {
        batch!.program = program;
      }
    }

    const batchId = batch!.id;

    const existing = await this.prisma.enrolment.findFirst({
      where: { userId, batchId }
    });

    if (existing) return existing;

    const enrolment = await this.prisma.enrolment.create({
      data: {
        userId,
        batchId: batchId,
        programId: programId,
        status: 'ACTIVE'
      }
    });

    const price = batch!.program?.price || 0;

    // Create a mock payment for the enrollment
    const payment = await this.prisma.payment.create({
      data: {
        enrolmentId: enrolment.id,
        amount: price,
        currency: 'USD',
        stripeSessionId: 'txn_mock_' + Math.random().toString(36).substr(2, 9),
        status: 'succeeded'
      }
    });

    // Generate an invoice so the Revenue dashboard populates
    await this.prisma.invoice.create({
      data: {
        paymentId: payment.id,
        invoiceNumber: 'INV-' + Math.floor(100000 + Math.random() * 900000),
        amount: price,
        status: 'PAID'
      }
    });

    await this.cacheHelper.invalidateNamespace(`auth_user:${userId}`);
    await this.cacheHelper.invalidateNamespace('batches');

    return enrolment;
  }

  async create(data: any) {
    if (data.title && !data.slug) {
      data.slug = data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    }
    const programData = {
      title: data.title,
      slug: data.slug,
      description: data.description,
      price: data.price,
      isActive: data.status === 'Active' || data.isActive !== false,
      hasCertificate: data.hasCertificate || false,
      certificateTemplate: data.certificateTemplate || null,
    };
    const res = await this.prisma.program.create({ data: programData });
    await this.cacheHelper.invalidateNamespace('programs');
    return res;
  }

  async update(id: string, data: any) {
    const programData: any = {};
    if (data.title) programData.title = data.title;
    if (data.description !== undefined) programData.description = data.description;
    if (data.price !== undefined) programData.price = data.price;
    if (data.status !== undefined) programData.isActive = data.status === 'Active';
    if (data.hasCertificate !== undefined) programData.hasCertificate = data.hasCertificate;
    if (data.certificateTemplate !== undefined) programData.certificateTemplate = data.certificateTemplate;
    
    const res = await this.prisma.program.update({
      where: { id },
      data: programData,
    });
    await this.cacheHelper.invalidateNamespace('programs');
    return res;
  }

  async remove(id: string) {
    const res = await this.prisma.program.delete({
      where: { id },
    });
    await this.cacheHelper.invalidateNamespace('programs');
    return res;
  }

  async getSteps(programId: string, role?: string) {
    const cacheKey = await this.cacheHelper.getEndpointKey('programs', role as any || 'GUEST', { action: 'getSteps', programId });
    return this.cacheHelper.getOrSet(cacheKey, async () => {
      return this.prisma.step.findMany({
        where: { programId },
        orderBy: { sequence: 'asc' },
      });
    });
  }

  async createStep(programId: string, data: any) {
    const res = await this.prisma.step.create({
      data: {
        programId,
        title: data.title,
        description: data.description,
        sequence: data.sequence,
      }
    });
    await this.cacheHelper.invalidateNamespace('programs');
    return res;
  }

  async getStep(stepId: string, role?: string) {
    const cacheKey = await this.cacheHelper.getEndpointKey('programs', role as any || 'GUEST', { action: 'getStep', stepId });
    return this.cacheHelper.getOrSet(cacheKey, async () => {
      const step = await this.prisma.step.findUnique({
        where: { id: stepId },
        include: { lessons: true, quiz: { include: { questions: { include: { options: true } } } } }
      });
      if (!step) return null;

      // Filter out answers if not admin
      if (role !== 'SUPER_ADMIN' && role !== 'ADMIN' && step.quiz) {
        step.quiz.questions.forEach(q => {
          q.options.forEach(o => {
            (o as any).isCorrect = undefined;
          });
        });
      }
      return step;
    });
  }

  async removeStep(stepId: string) {
    const res = await this.prisma.step.delete({
      where: { id: stepId },
    });
    await this.cacheHelper.invalidateNamespace('programs');
    return res;
  }

  async getLessons(stepId: string, role?: string) {
    const cacheKey = await this.cacheHelper.getEndpointKey('programs', role as any || 'GUEST', { action: 'getLessons', stepId });
    return this.cacheHelper.getOrSet(cacheKey, async () => {
      const lessons = await this.prisma.lesson.findMany({
        where: { stepId },
      });
      
      if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
        // Strip mediaUrl/playbackIds from list
        return lessons.map(l => ({ ...l, mediaUrl: undefined }));
      }
      return lessons;
    });
  }

  async createLesson(stepId: string, data: any) {
    const res = await this.prisma.lesson.create({
      data: {
        stepId,
        title: data.title,
        type: data.type, // e.g. VIDEO
        mediaUrl: data.mediaUrl, // This will be the Mux Asset ID or Playback ID
        durationSec: data.durationSec || 0,
      }
    });
    await this.cacheHelper.invalidateNamespace('programs');
    return res;
  }

  async removeLesson(lessonId: string) {
    const res = await this.prisma.lesson.delete({
      where: { id: lessonId }
    });
    await this.cacheHelper.invalidateNamespace('programs');
    return res;
  }

  /**
   * Records that a learner finished a step: its lessons are marked viewed, a
   * passed quiz is stored, and the learner counts as present for the day.
   * This is what moves the progress bars; before it, progress lived only in
   * the learner's browser.
   */
  async completeStep(stepId: string, userId: string, score?: number) {
    const step = await this.prisma.step.findUnique({
      where: { id: stepId },
      include: { lessons: { select: { id: true } }, quiz: { select: { id: true } } },
    });
    if (!step) throw new NotFoundException('Step not found');

    const enrolment = await this.prisma.enrolment.findFirst({
      where: { userId, programId: step.programId, status: { in: ['ACTIVE', 'COMPLETED'] } },
    });
    if (!enrolment) throw new ForbiddenException('You are not enrolled in this course');

    for (const lesson of step.lessons) {
      await this.prisma.userLessonProgress.upsert({
        where: { enrolmentId_lessonId: { enrolmentId: enrolment.id, lessonId: lesson.id } },
        create: { enrolmentId: enrolment.id, lessonId: lesson.id, viewed: true },
        update: { viewed: true },
      });
    }

    if (step.quiz) {
      const passed = await this.prisma.attempt.findFirst({
        where: { enrolmentId: enrolment.id, quizId: step.quiz.id, status: 'PASSED' },
      });
      if (!passed) {
        await this.prisma.attempt.create({
          data: { enrolmentId: enrolment.id, quizId: step.quiz.id, status: 'PASSED', score: score ?? null },
        });
      }
    }

    await markDailyAttendance(this.prisma, userId, 'lessonDone');
    await this.cacheHelper.invalidateNamespace(`auth_user:${userId}`);
    return { stepId, completed: true };
  }
}
