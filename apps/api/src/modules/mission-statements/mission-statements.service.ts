import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
  Optional,
  forwardRef,
} from '@nestjs/common';
import {
  MissionStatementStatus,
  LearnerStage,
  Role,
  CertificateStatus,
  CertificateType,
} from '@prisma/client';
import crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StageGateService } from '../progression/stage-gate.service.js';
import { CertificatesService } from '../certificates/certificates.service.js';
import { EmailService } from '../email/email.service.js';
import {
  OBJECT_STORAGE_PROVIDER,
  type IObjectStorageProvider,
} from '../../common/interfaces/object-storage-provider.interface.js';
import { ReviewMissionStatementDto } from './dto/index.js';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
]);

@Injectable()
export class MissionStatementsService {
  private readonly logger = new Logger(MissionStatementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => StageGateService))
    private readonly stageGateService: StageGateService,
    @Inject(forwardRef(() => CertificatesService))
    private readonly certificatesService: CertificatesService,
    private readonly emailService: EmailService,
    @Optional()
    @Inject(OBJECT_STORAGE_PROVIDER)
    private readonly objectStorage?: IObjectStorageProvider,
  ) {}

  /**
   * Validates file size, MIME type, and binary magic bytes for tamper deterrence.
   */
  validateFile(file: { buffer?: Buffer; mimetype?: string; size?: number; originalname?: string }) {
    if (!file || !file.buffer) {
      throw new BadRequestException('A file is required for mission statement submission');
    }

    const size = file.size ?? file.buffer.length;
    if (size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('File size must not exceed 10MB');
    }

    const mime = (file.mimetype || '').toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(mime)) {
      throw new BadRequestException(
        'Invalid file type. Only PDF, PNG, and JPEG documents are permitted for Mission Statements.',
      );
    }

    const buf = file.buffer;
    if (buf.length < 4) {
      throw new BadRequestException('File payload is corrupted or truncated');
    }

    // Magic Bytes Verification
    let isValidSignature = false;
    if (mime === 'application/pdf') {
      // PDF header: %PDF (0x25, 0x50, 0x44, 0x46)
      isValidSignature =
        buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
    } else if (mime === 'image/png') {
      // PNG header: 0x89, 0x50, 0x4E, 0x47
      isValidSignature =
        buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    } else if (mime === 'image/jpeg' || mime === 'image/jpg') {
      // JPEG header: 0xFF, 0xD8, 0xFF
      isValidSignature = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    }

    if (!isValidSignature) {
      throw new BadRequestException(
        'File binary signature does not match claimed file type. Please upload a genuine PDF or image.',
      );
    }
  }

  /**
   * Learner submits a Mission Statement (gated by Stage 4).
   */
  async submit(
    userId: string,
    enrolmentId: string,
    file: { buffer: Buffer; mimetype: string; size: number; originalname?: string },
  ) {
    // 1. Stage Gate Verification: Stage 4 must be completed to unlock Stage 5
    await this.stageGateService.assertStageUnlocked(
      enrolmentId,
      LearnerStage.STAGE_5_MISSION_STATEMENT,
    );

    // 2. Enrolment ownership check
    const enrolment = await this.prisma.enrolment.findUnique({
      where: { id: enrolmentId },
      include: { program: true },
    });

    if (!enrolment) {
      throw new NotFoundException(`Enrolment '${enrolmentId}' not found`);
    }

    if (enrolment.userId !== userId) {
      throw new ForbiddenException('You can only submit a mission statement for your own enrolment');
    }

    // 3. File validation
    this.validateFile(file);

    // 4. Sha256 calculation for immutability verification
    const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');

    // 5. Version auto-incrementing
    const lastSubmission = await this.prisma.missionStatementSubmission.findFirst({
      where: { enrolmentId },
      orderBy: { version: 'desc' },
    });
    const version = (lastSubmission?.version ?? 0) + 1;

    // 6. Upload file buffer to Object Storage
    const ext = file.originalname?.split('.').pop() || 'pdf';
    const storageKey = `mission-statements/${enrolmentId}/v${version}_${Date.now()}.${ext}`;

    let fileUrl = '';
    if (this.objectStorage && typeof this.objectStorage.uploadBuffer === 'function') {
      try {
        fileUrl = await this.objectStorage.uploadBuffer(storageKey, file.buffer, file.mimetype);
      } catch (err: any) {
        this.logger.warn(`Object storage upload error: ${err?.message}`);
      }
    }

    if (!fileUrl) {
      fileUrl = `/uploads/mission-statements/${storageKey}`;
    }

    // 7. Persist submission record
    const submission = await this.prisma.missionStatementSubmission.create({
      data: {
        enrolmentId,
        userId,
        version,
        storageKey,
        fileUrl,
        fileName: file.originalname || `mission_statement_v${version}.${ext}`,
        mimeType: file.mimetype,
        sizeBytes: file.size ?? file.buffer.length,
        sha256,
        status: MissionStatementStatus.SUBMITTED,
      },
      include: {
        enrolment: {
          include: {
            program: { select: { id: true, title: true } },
          },
        },
      },
    });

    // 8. Audit Log
    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'MISSION_STATEMENT_SUBMITTED',
        entity: 'MissionStatementSubmission',
        entityId: submission.id,
        meta: {
          enrolmentId,
          version,
          sha256,
          fileName: submission.fileName,
        },
      },
    });

    this.logger.log(
      `Learner ${userId} submitted Mission Statement v${version} for enrolment ${enrolmentId}`,
    );

    return submission;
  }

  /**
   * Learner views all their mission statement submissions.
   */
  async getMySubmissions(userId: string, enrolmentId?: string) {
    return this.prisma.missionStatementSubmission.findMany({
      where: {
        userId,
        ...(enrolmentId ? { enrolmentId } : {}),
      },
      include: {
        enrolment: {
          include: {
            program: { select: { id: true, title: true } },
          },
        },
        reviewer: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { version: 'desc' },
    });
  }

  /**
   * Admin / Manager lists mission statement submissions.
   * Scoped by manager batch assignments for MANAGER role.
   */
  async getAllSubmissions(status?: MissionStatementStatus, actorUser?: any) {
    const where: any = status ? { status } : {};

    if (actorUser?.role === Role.MANAGER) {
      const actorId = actorUser.sub ?? actorUser.id;
      where.enrolment = {
        batch: {
          OR: [
            { managerId: actorId },
            { trainers: { some: { trainerId: actorId } } },
          ],
        },
      };
    }

    return this.prisma.missionStatementSubmission.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        enrolment: {
          include: {
            program: { select: { id: true, title: true } },
            batch: { select: { id: true, name: true } },
          },
        },
        reviewer: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Fetches single mission statement submission by ID.
   * Enforces IDOR / BOLA protection: Learners can only view their own submission;
   * Managers can only view submissions for their assigned batches.
   */
  async getById(id: string, actorUser?: any) {
    const submission = await this.prisma.missionStatementSubmission.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        enrolment: {
          include: {
            program: { select: { id: true, title: true } },
            batch: {
              include: {
                trainers: { select: { trainerId: true } },
              },
            },
          },
        },
        reviewer: { select: { id: true, name: true, email: true } },
      },
    });

    if (!submission) {
      throw new NotFoundException(`Mission Statement submission '${id}' not found`);
    }

    if (actorUser) {
      const actorId = actorUser.sub ?? actorUser.id;
      const role = actorUser.role;

      if (role === Role.USER && submission.userId !== actorId) {
        throw new ForbiddenException(
          'Access denied: You can only view your own mission statements',
        );
      }

      if (role === Role.MANAGER) {
        const isAssigned =
          submission.enrolment?.batch?.managerId === actorId ||
          (Array.isArray(submission.enrolment?.batch?.trainers) &&
            submission.enrolment.batch.trainers.some(
              (t: any) => t.trainerId === actorId,
            ));
        if (!isAssigned) {
          throw new ForbiddenException(
            'Access denied: You can only view mission statements for your assigned batches',
          );
        }
      }
    }

    return submission;
  }

  /**
   * Admin approves Mission Statement:
   * - Sets status to APPROVED
   * - Sets enrolment.missionStatementApprovedAt
   * - Logs audit event
   * - Triggers stage gate evaluation (Stage 5 complete!)
   * - Auto-issues certificate
   */
  async approve(id: string, reviewerId: string, dto?: ReviewMissionStatementDto) {
    const submission = await this.prisma.missionStatementSubmission.findUnique({
      where: { id },
      include: {
        user: true,
        enrolment: {
          include: { program: true },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException(`Mission Statement submission '${id}' not found`);
    }

    if (submission.status === MissionStatementStatus.APPROVED) {
      throw new BadRequestException('Mission statement is already approved');
    }

    const reviewedAt = new Date();

    // 1. Update Submission
    const updated = await this.prisma.missionStatementSubmission.update({
      where: { id },
      data: {
        status: MissionStatementStatus.APPROVED,
        reviewerId,
        reviewedAt,
        feedback: dto?.feedback || 'Approved by instructor',
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        enrolment: { include: { program: true } },
      },
    });

    // 2. Update Enrolment missionStatementApprovedAt
    await this.prisma.enrolment.update({
      where: { id: submission.enrolmentId },
      data: { missionStatementApprovedAt: reviewedAt },
    });

    // 3. Immutable Audit Log
    await this.prisma.auditLog.create({
      data: {
        actorId: reviewerId,
        action: 'MISSION_STATEMENT_APPROVED',
        entity: 'MissionStatementSubmission',
        entityId: id,
        meta: {
          enrolmentId: submission.enrolmentId,
          version: submission.version,
          feedback: dto?.feedback,
        },
      },
    });

    // 4. Re-evaluate Stage Gates (Stage 5 now satisfied!)
    await this.stageGateService.evaluateStages(submission.enrolmentId);

    // 5. Automated Certificate Issuance
    try {
      const actorUser = { id: reviewerId, role: Role.ADMIN };
      let cert = await this.prisma.certificate.findUnique({
        where: { enrolmentId: submission.enrolmentId },
      });

      if (!cert) {
        cert = await this.certificatesService.requestCertificate(
          submission.enrolmentId,
          actorUser,
          CertificateType.PROFESSIONAL,
        );
      }

      if (
        cert &&
        cert.status !== CertificateStatus.APPROVED &&
        cert.status !== CertificateStatus.ISSUED
      ) {
        await this.certificatesService.approveCertificate(cert.id, actorUser);
      }

      this.logger.log(
        `Auto-issued certificate for enrolment ${submission.enrolmentId} upon mission statement approval`,
      );
    } catch (certErr: any) {
      this.logger.warn(
        `Could not auto-issue certificate for enrolment ${submission.enrolmentId}: ${certErr?.message}`,
      );
    }

    // 6. Send congratulatory email
    try {
      await this.emailService.sendTemplateEmail({
        to: submission.user.email,
        subject: `Congratulations! Your Mission Statement Has Been Approved`,
        template: 'CertificateIssuedEmail',
        props: {
          firstName: submission.user.name?.split(' ')[0] || 'Learner',
          programTitle: submission.enrolment.program.title,
        },
      });
    } catch (emailErr: any) {
      this.logger.warn(`Could not send mission statement approval email: ${emailErr?.message}`);
    }

    return updated;
  }

  /**
   * Admin rejects Mission Statement with revision feedback.
   */
  async reject(id: string, reviewerId: string, dto: ReviewMissionStatementDto) {
    const submission = await this.prisma.missionStatementSubmission.findUnique({
      where: { id },
      include: {
        user: true,
        enrolment: {
          include: { program: true },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException(`Mission Statement submission '${id}' not found`);
    }

    if (submission.status === MissionStatementStatus.APPROVED) {
      throw new BadRequestException('Cannot reject an already approved mission statement');
    }

    if (!dto?.feedback || !dto.feedback.trim()) {
      throw new BadRequestException('Feedback is required when requesting revisions on a mission statement');
    }

    const reviewedAt = new Date();

    const updated = await this.prisma.missionStatementSubmission.update({
      where: { id },
      data: {
        status: MissionStatementStatus.REJECTED,
        reviewerId,
        reviewedAt,
        feedback: dto.feedback.trim(),
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        enrolment: { include: { program: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: reviewerId,
        action: 'MISSION_STATEMENT_REJECTED',
        entity: 'MissionStatementSubmission',
        entityId: id,
        meta: {
          enrolmentId: submission.enrolmentId,
          version: submission.version,
          feedback: dto.feedback,
        },
      },
    });

    this.logger.log(`Mission statement ${id} rejected with feedback by reviewer ${reviewerId}`);
    return updated;
  }
}
