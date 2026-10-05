import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class CertificatesService {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('certificates') private certificatesQueue: Queue,
  ) {}

  // 1. Get all certificates (for Admin queue)
  async findAll() {
    return this.prisma.certificate.findMany({
      include: {
        enrolment: {
          include: {
            user: true,
            batch: { include: { program: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Every lesson viewed and every step quiz passed. A course with no content
   * yet is not finished: there is nothing to certify.
   */
  private async courseFinished(enrolmentId: string) {
    const enrolment = await this.prisma.enrolment.findUnique({
      where: { id: enrolmentId },
      include: {
        lessonProgress: { where: { viewed: true }, select: { lessonId: true } },
        attempts: { where: { status: 'PASSED' }, select: { quizId: true } },
        program: {
          include: { steps: { include: { lessons: { select: { id: true } }, quiz: { select: { id: true } } } } },
        },
      },
    });
    if (!enrolment) return false;

    const viewed = new Set(enrolment.lessonProgress.map((p) => p.lessonId));
    const passed = new Set(enrolment.attempts.map((a) => a.quizId));
    const lessons = enrolment.program.steps.flatMap((step) => step.lessons);
    const quizzes = enrolment.program.steps.flatMap((step) => (step.quiz ? [step.quiz] : []));

    return (
      lessons.length + quizzes.length > 0 &&
      lessons.every((lesson) => viewed.has(lesson.id)) &&
      quizzes.every((quiz) => passed.has(quiz.id))
    );
  }

  // 2. Request a certificate (Learner claims they are done)
  async requestCertificate(enrolmentId: string, userId: string) {
    const enrolment = await this.prisma.enrolment.findUnique({
      where: { id: enrolmentId },
      include: { certificate: true, batch: { include: { program: true } } }
    });

    if (!enrolment) throw new NotFoundException('Enrolment not found');
    if (enrolment.userId !== userId) throw new ForbiddenException('Not your enrolment');
    if (enrolment.certificate) throw new BadRequestException('Certificate request already exists');

    if (!(await this.courseFinished(enrolmentId))) {
      throw new BadRequestException('Finish every lesson and quiz in the course before requesting the certificate');
    }

    return this.prisma.certificate.create({
      data: {
        enrolmentId,
        certificateNumber: `CERT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        status: 'PENDING'
      }
    });
  }

  // 3. Admin Approves the certificate
  async approveCertificate(id: string) {
    const certificate = await this.prisma.certificate.findUnique({ where: { id } });
    if (!certificate) throw new NotFoundException('Certificate not found');
    // approval alone is not enough: the course itself must be finished
    if (!(await this.courseFinished(certificate.enrolmentId))) {
      throw new BadRequestException('The learner has not finished the course yet');
    }

    const updatedCert = await this.prisma.certificate.update({
      where: { id },
      data: {
        status: 'APPROVED',
        // the certificate is drawn by the portal at /certificates/:id and
        // saved as a PDF from the browser, so there is no stored file
        issuedAt: new Date(),
      }
    });

    await this.certificatesQueue.add('generate-certificate', {
      certificateId: updatedCert.id,
    });

    return updatedCert;
  }

  /**
   * One click for a whole batch: every learner in it gets an issued
   * certificate, which then shows in their portal. Learners who have not
   * finished the course are left out and named in the answer, unless the
   * admin chooses to include them (e.g. an in-person batch with no lessons).
   */
  async issueForBatch(batchId: string, includeUnfinished: boolean) {
    const batch = await this.prisma.batch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Batch not found');

    const enrolments = await this.prisma.enrolment.findMany({
      where: { batchId, status: { in: ['ACTIVE', 'COMPLETED'] } },
      include: { certificate: true, user: { select: { name: true, email: true } } },
    });

    let issued = 0;
    let alreadyIssued = 0;
    const notFinished: string[] = [];

    for (const enrolment of enrolments) {
      if (enrolment.certificate?.status === 'APPROVED') {
        alreadyIssued++;
        continue;
      }
      if (!includeUnfinished && !(await this.courseFinished(enrolment.id))) {
        notFinished.push(enrolment.user.name || enrolment.user.email);
        continue;
      }
      // also turns a pending or rejected request into an issued certificate
      const cert = await this.prisma.certificate.upsert({
        where: { enrolmentId: enrolment.id },
        update: { status: 'APPROVED', issuedAt: new Date() },
        create: {
          enrolmentId: enrolment.id,
          certificateNumber: `CERT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          status: 'APPROVED',
          issuedAt: new Date(),
        },
      });

      await this.certificatesQueue.add('generate-certificate', {
        certificateId: cert.id,
      });

      issued++;
    }

    return { learners: enrolments.length, issued, alreadyIssued, notFinished };
  }

  // 4. Admin Rejects the certificate
  async rejectCertificate(id: string) {
    return this.prisma.certificate.update({
      where: { id },
      data: {
        status: 'REJECTED'
      }
    });
  }

  // 5. Get Learner's Certificates
  async getMyCertificates(userId: string) {
    return this.prisma.certificate.findMany({
      where: {
        enrolment: { userId },
        status: 'APPROVED'
      },
      include: {
        enrolment: {
          include: { batch: { include: { program: true } } }
        }
      }
    });
  }
}
