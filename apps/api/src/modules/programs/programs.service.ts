import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { markDailyAttendance } from '../../common/daily-attendance.js';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class ProgramsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.program.findMany();
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

    return enrolment;
  }

  create(data: any) {
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
    return this.prisma.program.create({ data: programData });
  }

  update(id: string, data: any) {
    const programData: any = {};
    if (data.title) programData.title = data.title;
    if (data.description !== undefined) programData.description = data.description;
    if (data.price !== undefined) programData.price = data.price;
    if (data.status !== undefined) programData.isActive = data.status === 'Active';
    if (data.hasCertificate !== undefined) programData.hasCertificate = data.hasCertificate;
    if (data.certificateTemplate !== undefined) programData.certificateTemplate = data.certificateTemplate;
    
    return this.prisma.program.update({
      where: { id },
      data: programData,
    });
  }

  remove(id: string) {
    return this.prisma.program.delete({
      where: { id },
    });
  }

  getSteps(programId: string) {
    return this.prisma.step.findMany({
      where: { programId },
      orderBy: { sequence: 'asc' },
    });
  }

  createStep(programId: string, data: any) {
    return this.prisma.step.create({
      data: {
        programId,
        title: data.title,
        description: data.description,
        sequence: data.sequence,
      }
    });
  }

  getStep(stepId: string) {
    return this.prisma.step.findUnique({
      where: { id: stepId },
      include: { lessons: true, quiz: { include: { questions: { include: { options: true } } } } }
    });
  }

  removeStep(stepId: string) {
    return this.prisma.step.delete({
      where: { id: stepId },
    });
  }

  getLessons(stepId: string) {
    return this.prisma.lesson.findMany({
      where: { stepId },
    });
  }

  createLesson(stepId: string, data: any) {
    return this.prisma.lesson.create({
      data: {
        stepId,
        title: data.title,
        type: data.type, // e.g. VIDEO
        mediaUrl: data.mediaUrl, // This will be the Mux Asset ID or Playback ID
        durationSec: data.durationSec || 0,
      }
    });
  }

  removeLesson(lessonId: string) {
    return this.prisma.lesson.delete({
      where: { id: lessonId }
    });
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
    return { stepId, completed: true };
  }
}
