import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import crypto from 'crypto';
import {
  CertificateStatus,
  CertificateType,
  Role,
} from '@prisma/client';
import { CertificateEligibilityService } from './certificate-eligibility.service.js';
import { Inject, Optional } from '@nestjs/common';
import {
  OBJECT_STORAGE_PROVIDER,
  type IObjectStorageProvider,
} from '../../common/interfaces/object-storage-provider.interface.js';
import { EmailService } from '../email/email.service.js';

@Injectable()
export class CertificatesService {
  private readonly logger = new Logger(CertificatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eligibilityService: CertificateEligibilityService,
    @InjectQueue('certificates') private readonly certificatesQueue: Queue,
    @Optional()
    @Inject(OBJECT_STORAGE_PROVIDER)
    private readonly objectStorage?: IObjectStorageProvider,
    @Optional()
    private readonly emailService?: EmailService,
  ) {}

  /**
   * Helper: Collision-safe certificate code generation in WBM-2026-XXXX format
   */
  async generateUniqueCertificateCode(year = 2026): Promise<string> {
    for (let attempt = 0; attempt < 15; attempt++) {
      const randomHex = crypto.randomBytes(2).toString('hex').toUpperCase();
      const code = `WBM-${year}-${randomHex}`;

      const existing = await this.prisma.certificate.findFirst({
        where: {
          OR: [{ certificateCode: code }, { certificateNumber: code }],
        },
        select: { id: true },
      });

      if (!existing) {
        return code;
      }
    }

    // High entropy fallback if saturated
    const fallbackHex = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `WBM-${year}-${fallbackHex}`;
  }

  // 1. Get all certificates (for Admin queue)
  async findAll(query?: { page?: number; limit?: number }) {
    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query?.limit) || 50));
    const skip = (page - 1) * limit;

    return this.prisma.certificate.findMany({
      skip,
      take: limit,
      include: {
        enrolment: {
          include: {
            user: { select: { id: true, name: true, email: true } },
            batch: { include: { program: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // 2. D1-052: Request a certificate (Learner or Admin) -> transitions to PENDING (pending approval)
  async requestCertificate(
    enrolmentId: string,
    actorUser: any,
    requestedType?: CertificateType,
  ) {
    const enrolment = await this.prisma.enrolment.findUnique({
      where: { id: enrolmentId },
      include: {
        certificate: true,
        batch: { include: { program: true } },
      },
    });

    if (!enrolment) {
      throw new NotFoundException('Enrolment not found');
    }

    const actorId = actorUser.sub || actorUser.userId || actorUser.id;
    const isPrivileged =
      actorUser.role === Role.ADMIN ||
      actorUser.role === Role.SUPER_ADMIN ||
      actorUser.role === Role.MANAGER;

    if (!isPrivileged && enrolment.userId !== actorId) {
      throw new ForbiddenException('You can only request certificates for your own enrolment');
    }

    if (
      enrolment.certificate &&
      (enrolment.certificate.status === CertificateStatus.APPROVED ||
        enrolment.certificate.status === CertificateStatus.ISSUED)
    ) {
      throw new BadRequestException('Certificate is already approved or issued');
    }

    // Verify eligibility using D1-051 / D1-051b engine
    const evaluation = await this.eligibilityService.evaluateEligibility(
      enrolmentId,
      requestedType,
    );

    if (!evaluation.isEligible) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Learner is not eligible for certification',
        certificateType: evaluation.certificateType,
        unmetRequirements: evaluation.unmetRequirements,
      });
    }

    // Generate collision-safe certificate code in WBM-2026-XXXX format
    const code = await this.generateUniqueCertificateCode();

    // CPD hours calculation: 25 hours for Professional, null for Corporate
    const cpdHours =
      evaluation.certificateType === CertificateType.PROFESSIONAL ? 25 : null;

    let cert;
    if (enrolment.certificate) {
      cert = await this.prisma.certificate.update({
        where: { enrolmentId },
        data: {
          status: CertificateStatus.PENDING,
          certificateType: evaluation.certificateType,
          certificateCode: enrolment.certificate.certificateCode || code,
          certificateNumber: enrolment.certificate.certificateNumber || code,
          cpdHours,
          updatedAt: new Date(),
        },
      });
    } else {
      cert = await this.prisma.certificate.create({
        data: {
          enrolmentId,
          userId: enrolment.userId,
          programId: enrolment.programId,
          certificateCode: code,
          certificateNumber: code,
          status: CertificateStatus.PENDING,
          certificateType: evaluation.certificateType,
          cpdHours,
        },
      });
    }

    // Audit transition
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'CERTIFICATE_REQUESTED',
        entity: 'Certificate',
        entityId: cert.id,
        meta: {
          enrolmentId,
          certificateType: evaluation.certificateType,
          status: CertificateStatus.PENDING,
        },
      },
    });

    return cert;
  }

  // 3. D1-052: Admin Approves the certificate (PENDING -> APPROVED)
  async approveCertificate(id: string, actorUser: any) {
    const certificate = await this.prisma.certificate.findUnique({
      where: { id },
      include: { enrolment: true },
    });

    if (!certificate) {
      throw new NotFoundException('Certificate not found');
    }

    // Enforce valid state transitions server-side
    if (certificate.status === CertificateStatus.APPROVED) {
      throw new BadRequestException('Certificate is already approved');
    }
    if (certificate.status === CertificateStatus.ISSUED) {
      throw new BadRequestException('Certificate is already issued');
    }
    if (certificate.status !== CertificateStatus.PENDING && certificate.status !== CertificateStatus.ELIGIBLE) {
      throw new BadRequestException(
        `Cannot approve certificate from status ${certificate.status}. Must be PENDING or ELIGIBLE.`,
      );
    }

    // Re-verify eligibility before approving
    const evaluation = await this.eligibilityService.evaluateEligibility(
      certificate.enrolmentId,
      certificate.certificateType,
    );

    if (!evaluation.isEligible) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Learner is not eligible for certificate approval',
        unmetRequirements: evaluation.unmetRequirements,
      });
    }

    const actorId = actorUser.sub || actorUser.userId || actorUser.id;

    // Ensure valid WBM-2026-XXXX code
    let code = certificate.certificateCode;
    if (!code || !code.startsWith('WBM-')) {
      code = await this.generateUniqueCertificateCode();
    }

    const updatedCert = await this.prisma.certificate.update({
      where: { id },
      data: {
        status: CertificateStatus.APPROVED,
        certificateCode: code,
        certificateNumber: code,
        approvedById: actorId,
        issueDate: certificate.issueDate || new Date(),
        updatedAt: new Date(),
      },
    });

    // Audit transition
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'CERTIFICATE_APPROVED',
        entity: 'Certificate',
        entityId: updatedCert.id,
        meta: {
          enrolmentId: certificate.enrolmentId,
          certificateCode: code,
          status: CertificateStatus.APPROVED,
        },
      },
    });

    return updatedCert;
  }

  // 4. D1-052: Admin Rejects the certificate (PENDING -> REJECTED)
  async rejectCertificate(id: string, actorUser: any, reason?: string) {
    const certificate = await this.prisma.certificate.findUnique({
      where: { id },
    });

    if (!certificate) {
      throw new NotFoundException('Certificate not found');
    }

    if (certificate.status === CertificateStatus.ISSUED) {
      throw new BadRequestException('Cannot reject an already issued certificate');
    }

    if (certificate.status !== CertificateStatus.PENDING) {
      throw new BadRequestException(
        `Cannot reject certificate with status ${certificate.status}. Only PENDING certificates can be rejected.`,
      );
    }

    const actorId = actorUser.sub || actorUser.userId || actorUser.id;

    const updatedCert = await this.prisma.certificate.update({
      where: { id },
      data: {
        status: CertificateStatus.REJECTED,
        updatedAt: new Date(),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'CERTIFICATE_REJECTED',
        entity: 'Certificate',
        entityId: updatedCert.id,
        meta: {
          enrolmentId: certificate.enrolmentId,
          status: CertificateStatus.REJECTED,
          reason: reason || 'Administrative rejection',
        },
      },
    });

    return updatedCert;
  }

  // 5. D1-052 & D1-053: Issue Certificate (APPROVED -> ISSUED)
  async issueCertificate(id: string, actorUser: any) {
    const certificate = await this.prisma.certificate.findUnique({
      where: { id },
      include: { enrolment: { include: { program: true } } },
    });

    if (!certificate) {
      throw new NotFoundException('Certificate not found');
    }

    if (certificate.status === CertificateStatus.ISSUED) {
      throw new BadRequestException('Certificate is already issued');
    }

    if (certificate.status !== CertificateStatus.APPROVED) {
      throw new BadRequestException(
        `Cannot issue certificate with status ${certificate.status}. Must be APPROVED first.`,
      );
    }

    const actorId = actorUser.sub || actorUser.userId || actorUser.id;

    // Ensure format WBM-2026-XXXX
    let code = certificate.certificateCode;
    if (!code || !code.startsWith('WBM-')) {
      code = await this.generateUniqueCertificateCode();
    }

    const cpdHours =
      certificate.certificateType === CertificateType.PROFESSIONAL ? 25 : null;

    const now = new Date();

    const issuedCert = await this.prisma.certificate.update({
      where: { id },
      data: {
        status: CertificateStatus.ISSUED,
        certificateCode: code,
        certificateNumber: code,
        cpdHours,
        issuedAt: now,
        issueDate: certificate.issueDate || now,
        updatedAt: now,
      },
    });

    try {
      await Promise.race([
        this.certificatesQueue.add('generate-certificate', {
          certificateId: issuedCert.id,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Queue timeout (2s)')), 2000),
        ),
      ]);
    } catch (e: any) {
      this.logger.warn(`Could not enqueue certificate PDF generation: ${e.message}`);
    }

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'CERTIFICATE_ISSUED',
        entity: 'Certificate',
        entityId: issuedCert.id,
        meta: {
          certificateCode: code,
          cpdHours,
          status: CertificateStatus.ISSUED,
        },
      },
    });

    if (this.emailService) {
      try {
        const enrolment = await this.prisma.enrolment.findUnique({
          where: { id: certificate.enrolmentId },
          include: { user: true, program: true },
        });
        if (enrolment?.user?.email) {
          const lmsUrl = process.env.NEXT_PUBLIC_LMS_URL || 'http://localhost:3003';
          this.emailService
            .sendTemplateEmail({
              to: enrolment.user.email,
              subject: `Certificate Issued: ${enrolment.program?.title || 'Program'}`,
              template: 'CertificateIssuedEmail',
              props: {
                firstName: enrolment.user.name?.split(' ')[0] || 'Learner',
                programName: enrolment.program?.title || 'Course',
                issueDate: now.toLocaleDateString(),
                certificateUrl: issuedCert.pdfUrl || `${lmsUrl}/certificates/${issuedCert.id}`,
                verificationUrl: `${lmsUrl}/verify/${code}`,
              },
            })
            .catch((e: any) => this.logger.warn(`Failed to send certificate email: ${e.message}`));
        }
      } catch (err: any) {
        this.logger.warn(`Failed to process certificate email: ${err.message}`);
      }
    }

    return issuedCert;
  }

  // 6. D1-053: Public Certificate Verification (GET /certificates/verify/:code)
  async verifyCertificate(code: string) {
    const cleanCode = code.trim();

    const certificate = await this.prisma.certificate.findFirst({
      where: {
        OR: [{ certificateCode: cleanCode }, { certificateNumber: cleanCode }],
      },
      include: {
        enrolment: {
          include: {
            user: { select: { name: true } },
            program: { select: { title: true } },
          },
        },
      },
    });

    if (
      !certificate ||
      (certificate.status !== CertificateStatus.ISSUED &&
        certificate.status !== CertificateStatus.APPROVED)
    ) {
      throw new NotFoundException('Certificate not found or not yet issued');
    }

    const issueDate = certificate.issueDate || certificate.issuedAt || certificate.createdAt;
    const issueYear = issueDate.getFullYear();
    const issueMonth = issueDate.getMonth() + 1;
    const appUrl = process.env.APP_URL || 'https://whatboutme.com';
    const certCode = certificate.certificateCode || certificate.certificateNumber || cleanCode;

    return {
      valid: !certificate.revokedAt,
      certificateCode: certCode,
      recipientName: certificate.enrolment.user.name,
      programName: certificate.enrolment.program.title,
      certificateType: certificate.certificateType,
      issueDate: issueDate.toISOString(),
      validityState: certificate.revokedAt ? 'REVOKED' : 'VALID',
      cpdHours: certificate.cpdHours,
      linkedInParameters: {
        certName: `${certificate.enrolment.program.title} Certification`,
        organizationId: 'whatboutme',
        issueYear,
        issueMonth,
        certUrl: `${appUrl}/verify/${certCode}`,
      },
    };
  }

  // 7. Get Learner's Certificates
  async getMyCertificates(userId: string) {
    return this.prisma.certificate.findMany({
      where: {
        enrolment: { userId },
        status: { in: [CertificateStatus.APPROVED, CertificateStatus.ISSUED] },
      },
      include: {
        enrolment: {
          include: { batch: { include: { program: true } } },
        },
      },
    });
  }

  // 7b. D2-052: Secure access to official generated PDF
  async getCertificatePdfDownload(id: string, actorUser: any) {
    const cert = await this.prisma.certificate.findUnique({
      where: { id },
      include: {
        enrolment: { select: { userId: true } },
      },
    });

    if (!cert) {
      throw new NotFoundException('Certificate not found');
    }

    const actorId = actorUser.sub || actorUser.userId || actorUser.id;
    const isPrivileged =
      actorUser.role === Role.ADMIN ||
      actorUser.role === Role.SUPER_ADMIN ||
      actorUser.role === Role.MANAGER;

    if (!isPrivileged && cert.enrolment?.userId !== actorId) {
      throw new ForbiddenException(
        'Access denied: You can only access your own certificates',
      );
    }

    if (!cert.pdfUrl) {
      throw new NotFoundException(
        'Official PDF has not been generated yet for this certificate',
      );
    }

    const key = `certificates/${cert.certificateCode || cert.certificateNumber}.pdf`;
    let downloadUrl = cert.pdfUrl;

    if (this.objectStorage) {
      try {
        downloadUrl = await this.objectStorage.getPresignedGetUrl(key, 300);
      } catch (err) {
        this.logger.warn(`Failed to generate signed URL for ${key}: ${err}`);
      }
    }

    return {
      certificateId: cert.id,
      certificateCode: cert.certificateCode,
      downloadUrl,
      pdfUrl: cert.pdfUrl,
      fileName: `${cert.certificateCode || 'certificate'}.pdf`,
    };
  }

  // 8. Admin: Issue for entire batch
  async issueForBatch(batchId: string, includeUnfinished: boolean, actorUser: any) {
    const batch = await this.prisma.batch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Batch not found');

    const enrolments = await this.prisma.enrolment.findMany({
      where: { batchId, status: { in: ['ACTIVE', 'COMPLETED'] } },
      include: {
        certificate: true,
        user: { select: { name: true, email: true } },
      },
    });

    let issued = 0;
    let alreadyIssued = 0;
    const notFinished: string[] = [];

    for (const enrolment of enrolments) {
      if (enrolment.certificate?.status === CertificateStatus.ISSUED) {
        alreadyIssued++;
        continue;
      }

      if (!includeUnfinished) {
        const evalResult = await this.eligibilityService.evaluateEligibility(enrolment.id);
        if (!evalResult.isEligible) {
          notFinished.push(enrolment.user.name || enrolment.user.email);
          continue;
        }
      }

      const code = await this.generateUniqueCertificateCode();
      const cpdHours = 25;
      const now = new Date();

      const cert = await this.prisma.certificate.upsert({
        where: { enrolmentId: enrolment.id },
        update: {
          status: CertificateStatus.ISSUED,
          certificateCode: enrolment.certificate?.certificateCode || code,
          certificateNumber: enrolment.certificate?.certificateNumber || code,
          cpdHours,
          issuedAt: now,
          issueDate: now,
        },
        create: {
          enrolmentId: enrolment.id,
          userId: enrolment.userId,
          programId: enrolment.programId,
          certificateCode: code,
          certificateNumber: code,
          status: CertificateStatus.ISSUED,
          cpdHours,
          issuedAt: now,
          issueDate: now,
        },
      });

      try {
        await Promise.race([
          this.certificatesQueue.add('generate-certificate', {
            certificateId: cert.id,
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Queue timeout (2s)')), 2000),
          ),
        ]);
      } catch (e: any) {
        this.logger.warn(`Could not enqueue certificate PDF generation: ${e.message}`);
      }

      issued++;
    }

    return { learners: enrolments.length, issued, alreadyIssued, notFinished };
  }

  /**
   * Phase 6: Evaluates eligibility downstream of attendance sync or manual correction.
   * If eligible, transitions certificate to PENDING (pending Admin approval) or ISSUED for corporate tracks.
   */
  async checkAndTriggerCertificateEligibility(enrolmentId: string, actorId = 'SYSTEM') {
    try {
      const evaluation = await this.eligibilityService.evaluateEligibility(enrolmentId);
      if (!evaluation.isEligible) {
        return { isEligible: false, evaluation };
      }

      const existing = await this.prisma.certificate.findUnique({
        where: { enrolmentId },
      });

      if (
        existing &&
        (existing.status === CertificateStatus.APPROVED || existing.status === CertificateStatus.ISSUED)
      ) {
        return { isEligible: true, certificate: existing };
      }

      const code = await this.generateUniqueCertificateCode();
      const cpdHours = evaluation.certificateType === CertificateType.PROFESSIONAL ? 25 : null;

      const cert = await this.prisma.certificate.upsert({
        where: { enrolmentId },
        update: {
          status: CertificateStatus.PENDING,
          certificateType: evaluation.certificateType,
          cpdHours,
          updatedAt: new Date(),
        },
        create: {
          enrolmentId,
          userId: evaluation.userId,
          programId: evaluation.programId,
          certificateCode: code,
          certificateNumber: code,
          status: CertificateStatus.PENDING,
          certificateType: evaluation.certificateType,
          cpdHours,
        },
      });

      await this.prisma.auditLog.create({
        data: {
          actorId,
          action: 'CERTIFICATE_ELIGIBILITY_TRIGGERED',
          entity: 'Certificate',
          entityId: cert.id,
          meta: {
            enrolmentId,
            status: CertificateStatus.PENDING,
            certificateType: evaluation.certificateType,
          },
        },
      });

      return { isEligible: true, certificate: cert };
    } catch (error: any) {
      this.logger.warn(
        `Failed to trigger certificate eligibility for ${enrolmentId}: ${error.message}`,
      );
      return { isEligible: false, error: error.message };
    }
  }
}
