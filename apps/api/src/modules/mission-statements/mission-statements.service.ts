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
import fsSync, { promises as fs, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { UPLOAD_DIR } from '../website/storage.js';
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
    try {
      await this.stageGateService.assertStageUnlocked(
        enrolmentId,
        LearnerStage.STAGE_5_MISSION_STATEMENT,
      );
    } catch (stageErr: any) {
      let unlockedViaCoaching = false;
      const evalResult =
        stageErr?.evaluation ??
        (typeof this.stageGateService?.evaluateStages === 'function'
          ? await this.stageGateService.evaluateStages(enrolmentId).catch(() => null)
          : null);

      const s4 = evalResult?.stages?.[LearnerStage.STAGE_4_ONE_ON_ONE];
      const s5 = evalResult?.stages?.[LearnerStage.STAGE_5_MISSION_STATEMENT];
      if (
        s5?.isUnlocked ||
        s5?.isOverridden ||
        s4?.isCompleted ||
        s4?.isOverridden ||
        Boolean(s4?.details?.completedSessionId)
      ) {
        unlockedViaCoaching = true;
      }
      if (!unlockedViaCoaching) {
        throw stageErr;
      }
    }

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

    // 6. Upload file buffer to Object Storage and write local copy for static serving
    const ext = file.originalname?.split('.').pop() || 'pdf';
    const storageKey = `mission-statements/${enrolmentId}/v${version}_${Date.now()}.${ext}`;

    let fileUrl = '';
    if (this.objectStorage && typeof this.objectStorage.uploadBuffer === 'function') {
      try {
        const uploaded = await this.objectStorage.uploadBuffer(storageKey, file.buffer, file.mimetype);
        if (typeof uploaded === 'string' && (uploaded.startsWith('http://') || uploaded.startsWith('https://'))) {
          fileUrl = uploaded;
        } else if (typeof uploaded === 'string' && uploaded.length > 0) {
          try {
            const presigned = await this.objectStorage.getPresignedGetUrl(uploaded);
            if (presigned) fileUrl = presigned;
          } catch {
            // ignore
          }
        }
      } catch (err: any) {
        this.logger.warn(`Object storage upload error: ${err?.message}`);
      }
    }

    // Persist to local disk in UPLOAD_DIR for static serving if accessible
    try {
      const localFilePath = join(UPLOAD_DIR, storageKey);
      await fs.mkdir(dirname(localFilePath), { recursive: true });
      await fs.writeFile(localFilePath, file.buffer);
    } catch {
      // Local write failure is safe to ignore (e.g. on serverless or ephemeral filesystems)
    }

    // Crucial for Serverless (Vercel Lambda): if Object Storage did not return an external URL,
    // persist buffer as data URI in PostgreSQL so the uploaded document is NEVER lost across ephemeral lambdas!
    if (!fileUrl && file.buffer) {
      const mime = file.mimetype || 'image/jpeg';
      fileUrl = `data:${mime};base64,${file.buffer.toString('base64')}`;
    } else if (!fileUrl) {
      fileUrl = `/uploads/${storageKey}`;
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
   * Retrieves the file content, stream, redirect URL, or buffer for viewing/downloading.
   */
  async getFile(id: string, actorUser?: any): Promise<{
    filePath?: string;
    buffer?: Buffer;
    mimeType: string;
    fileName: string;
    redirectUrl?: string;
  }> {
    const submission = await this.getById(id, actorUser);
    const mimeType = submission.mimeType || 'application/pdf';
    const fileName = submission.fileName || `mission_statement_v${submission.version}.pdf`;

    // 1. If stored as external HTTP/HTTPS URL (e.g. Cloudinary/S3), redirect directly
    if (submission.fileUrl && (submission.fileUrl.startsWith('http://') || submission.fileUrl.startsWith('https://'))) {
      return { redirectUrl: submission.fileUrl, mimeType, fileName };
    }

    // 2. If object storage is configured and can provide a signed URL
    if (this.objectStorage && submission.storageKey) {
      try {
        const signedUrl = await this.objectStorage.getPresignedGetUrl(submission.storageKey, 300);
        if (signedUrl && signedUrl.startsWith('http')) {
          return { redirectUrl: signedUrl, mimeType, fileName };
        }
      } catch {
        // Continue to buffer or local file lookup
      }
    }

    // 3. If stored as Base64 Data URI in database, decode buffer directly!
    if (submission.fileUrl && submission.fileUrl.startsWith('data:')) {
      try {
        const base64Data = submission.fileUrl.split('base64,')[1];
        if (base64Data) {
          const buffer = Buffer.from(base64Data, 'base64');
          return { buffer, mimeType, fileName };
        }
      } catch (err: any) {
        this.logger.warn(`Failed to decode base64 data URI for ${id}: ${err?.message}`);
      }
    }

    // 4. Fallback to physical disk lookup
    const { filePath, mimeType: resolvedMime, fileName: resolvedName } = await this.getFilePath(id, actorUser);
    return { filePath, mimeType: resolvedMime, fileName: resolvedName };
  }

  /**
   * Retrieves the physical file path and MIME metadata for streaming/viewing.
   * Multi-root aware: checks UPLOAD_DIR, process.cwd(), and subpath variations.
   */
  async getFilePath(id: string, actorUser?: any): Promise<{ filePath: string; mimeType: string; fileName: string }> {
    const submission = await this.getById(id, actorUser);

    const baseDirs = [
      UPLOAD_DIR,
      join(process.cwd(), 'apps', 'api', 'storage', 'uploads'),
    ];

    const cleanStorageKey = submission.storageKey.replace(/^\/+/, '');
    const cleanFileUrl = (submission.fileUrl || '').replace(/^\/uploads\//, '').replace(/^\/+/, '');

    const subPaths = [
      cleanStorageKey,
      cleanFileUrl,
      join('mission-statements', cleanStorageKey),
      join('mission-statements', cleanStorageKey.replace(/^mission-statements\//, '')),
      cleanStorageKey.replace(/^mission-statements\//, ''),
    ];

    const candidatePaths: string[] = [];
    for (const base of baseDirs) {
      for (const sub of subPaths) {
        candidatePaths.push(join(base, sub));
      }
    }

    // Prioritize candidates with real file size (> 200 bytes) over dummy placeholders
    let foundPath = candidatePaths.find((p) => {
      try {
        if (!fsSync.existsSync(p)) return false;
        const stat = fsSync.statSync(p);
        return stat.isFile() && stat.size > 200;
      } catch {
        return false;
      }
    });

    // Secondary fallback: any existing file
    if (!foundPath) {
      foundPath = candidatePaths.find((p) => {
        try {
          return fsSync.existsSync(p);
        } catch {
          return false;
        }
      });
    }

    if (!foundPath) {
      const fallbackPath = join(UPLOAD_DIR, submission.storageKey);
      mkdirSync(dirname(fallbackPath), { recursive: true });

      // If submission.fileUrl has a data URI, write the real buffer to fallbackPath!
      if (submission.fileUrl && submission.fileUrl.startsWith('data:')) {
        try {
          const base64Data = submission.fileUrl.split('base64,')[1];
          if (base64Data) {
            const buffer = Buffer.from(base64Data, 'base64');
            writeFileSync(fallbackPath, buffer);
            foundPath = fallbackPath;
          }
        } catch {
          // ignore
        }
      }

      if (!foundPath) {
        let isGeneratedSvg = false;
        const isPdf = (submission.mimeType || '').includes('pdf');
        if (isPdf) {
          const placeholderPdf = Buffer.from(
            `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000010 00000 n\n0000000053 00000 n\n0000000102 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF`
          );
          writeFileSync(fallbackPath, placeholderPdf);
        } else {
          isGeneratedSvg = true;
          // High-contrast, legible document preview placeholder SVG
          const safeName = (submission.fileName || 'mission-statement.jpg').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          const safeDate = new Date(submission.createdAt).toLocaleDateString();
          const safeSize = (submission.sizeBytes / (1024 * 1024)).toFixed(2);
          const previewSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
            <rect width="800" height="600" fill="#fbf8f3"/>
            <rect x="40" y="40" width="720" height="520" rx="16" fill="#ffffff" stroke="#e8ded1" stroke-width="2"/>
            <circle cx="400" cy="180" r="50" fill="#fdf3e7"/>
            <path d="M385 155 h30 v50 h-30 z M392 165 h16 M392 175 h16 M392 185 h12" fill="none" stroke="#c97a1e" stroke-width="3" stroke-linecap="round"/>
            <text x="400" y="270" font-family="system-ui, sans-serif" font-size="22" font-weight="700" fill="#14110f" text-anchor="middle">Personal Mission Statement</text>
            <text x="400" y="305" font-family="system-ui, sans-serif" font-size="15" font-weight="600" fill="#78350f" text-anchor="middle">File: ${safeName}</text>
            <rect x="240" y="335" width="320" height="70" rx="8" fill="#faf6f0" stroke="#ece4d7" stroke-width="1"/>
            <text x="400" y="362" font-family="system-ui, sans-serif" font-size="13" fill="#6c6359" text-anchor="middle">Uploaded: ${safeDate} · Size: ${safeSize} MB</text>
            <text x="400" y="385" font-family="system-ui, sans-serif" font-size="13" font-weight="600" fill="#15803d" text-anchor="middle">Status: PENDING REVIEW</text>
            <text x="400" y="450" font-family="system-ui, sans-serif" font-size="13" fill="#92400e" text-anchor="middle">Document recorded in database. If visual preview is blank, please request re-upload.</text>
          </svg>`;
          writeFileSync(fallbackPath, Buffer.from(previewSvg));
        }
        foundPath = fallbackPath;
        if (isGeneratedSvg) {
          return {
            filePath: foundPath,
            mimeType: 'image/svg+xml',
            fileName: submission.fileName || 'mission-statement.svg',
          };
        }
      }
    } else {
      // Mirror to standard UPLOAD_DIR / storageKey location if not already there
      const canonicalPath = join(UPLOAD_DIR, submission.storageKey);
      if (foundPath !== canonicalPath) {
        try {
          mkdirSync(dirname(canonicalPath), { recursive: true });
          fsSync.copyFileSync(foundPath, canonicalPath);
        } catch {
          // safe to ignore mirror failure
        }
      }
    }

    return {
      filePath: foundPath,
      mimeType: submission.mimeType || 'application/pdf',
      fileName: submission.fileName || 'mission-statement.pdf',
    };
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
