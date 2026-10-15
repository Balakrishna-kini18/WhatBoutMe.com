import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  Optional,
} from '@nestjs/common';
import { AgreementStatus, ContentStatus, EnrolmentStatus, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import {
  CreateAgreementTemplateDto,
  CreateTemplateVersionDto,
  QueryAgreementTemplatesDto,
  SignAgreementDto,
  UpdateAgreementTemplateDto,
  UpdateTemplateVersionDto,
} from './dto/index.js';


@Injectable()
export class AgreementsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly emailService?: EmailService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. AGREEMENT TEMPLATE MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────

  async createTemplate(
    dto: CreateAgreementTemplateDto,
    actorId?: string,
    ip?: string,
  ) {
    const program = await this.prisma.program.findUnique({
      where: { id: dto.programId },
      select: { id: true, title: true },
    });

    if (!program) {
      throw new NotFoundException(`Program with ID ${dto.programId} not found`);
    }

    const template = await this.prisma.$transaction(async (tx) => {
      const created = await tx.agreementTemplate.create({
        data: {
          programId: dto.programId,
          title: dto.title.trim(),
          description: dto.description?.trim(),
        },
        include: {
          program: { select: { id: true, title: true, slug: true } },
          versions: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: 'AGREEMENT_TEMPLATE_CREATED',
          entity: 'AgreementTemplate',
          entityId: created.id,
          meta: {
            programId: dto.programId,
            programTitle: program.title,
            title: created.title,
          },
          ip,
        },
      });

      return created;
    });

    return template;
  }

  async findAllTemplates(query: QueryAgreementTemplatesDto & { page?: number; limit?: number }) {
    const where: any = {};
    if (query.programId) {
      where.programId = query.programId;
    }

    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query?.limit) || 50));
    const skip = (page - 1) * limit;

    const templates = await this.prisma.agreementTemplate.findMany({
      where,
      skip,
      take: limit,
      include: {
        program: { select: { id: true, title: true, slug: true } },
        versions: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            version: true,
            status: true,
            changelog: true,
            publishedAt: true,
            createdAt: true,
            _count: {
              select: { signedAgreements: true },
            },
          },
        },
        _count: {
          select: { signedAgreements: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return templates.map((tpl) => {
      const activeVersion = tpl.versions.find(
        (v) => v.status === ContentStatus.PUBLISHED,
      );
      return {
        ...tpl,
        activeVersion: activeVersion ?? null,
      };
    });
  }

  async findTemplateById(id: string) {
    const template = await this.prisma.agreementTemplate.findUnique({
      where: { id },
      include: {
        program: { select: { id: true, title: true, slug: true } },
        versions: {
          orderBy: { createdAt: 'desc' },
          include: {
            createdBy: { select: { id: true, name: true, email: true } },
            _count: {
              select: { signedAgreements: true },
            },
          },
        },
        _count: {
          select: { signedAgreements: true },
        },
      },
    });

    if (!template) {
      throw new NotFoundException(`Agreement template with ID ${id} not found`);
    }

    const activeVersion = template.versions.find(
      (v) => v.status === ContentStatus.PUBLISHED,
    );

    return {
      ...template,
      activeVersion: activeVersion ?? null,
    };
  }

  async updateTemplate(
    id: string,
    dto: UpdateAgreementTemplateDto,
    actorId?: string,
    ip?: string,
  ) {
    const existing = await this.prisma.agreementTemplate.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Agreement template with ID ${id} not found`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.agreementTemplate.update({
        where: { id },
        data: {
          ...(dto.title !== undefined && { title: dto.title.trim() }),
          ...(dto.description !== undefined && {
            description: dto.description?.trim(),
          }),
        },
        include: {
          program: { select: { id: true, title: true, slug: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: 'AGREEMENT_TEMPLATE_UPDATED',
          entity: 'AgreementTemplate',
          entityId: id,
          meta: {
            changes: { ...dto },
          },
          ip,
        },
      });

      return res;
    });

    return updated;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. VERSION MANAGEMENT & HISTORICAL IMMUTABILITY
  // ─────────────────────────────────────────────────────────────────────────────

  async createVersion(
    templateId: string,
    dto: CreateTemplateVersionDto,
    actorId?: string,
    ip?: string,
  ) {
    const template = await this.prisma.agreementTemplate.findUnique({
      where: { id: templateId },
      select: { id: true, title: true, programId: true },
    });

    if (!template) {
      throw new NotFoundException(
        `Agreement template with ID ${templateId} not found`,
      );
    }

    const normalizedVersion = dto.version.trim();

    // Enforce version uniqueness within template
    const existingVersion = await this.prisma.agreementTemplateVersion.findUnique({
      where: {
        templateId_version: {
          templateId,
          version: normalizedVersion,
        },
      },
    });

    if (existingVersion) {
      throw new BadRequestException(
        `Version "${normalizedVersion}" already exists for this agreement template`,
      );
    }

    const isPublishingImmediately = dto.status === ContentStatus.PUBLISHED;

    const version = await this.prisma.$transaction(async (tx) => {
      // If publishing immediately, mark previous published versions as ARCHIVED
      if (isPublishingImmediately) {
        await tx.agreementTemplateVersion.updateMany({
          where: {
            templateId,
            status: ContentStatus.PUBLISHED,
          },
          data: {
            status: ContentStatus.ARCHIVED,
          },
        });
      }

      const created = await tx.agreementTemplateVersion.create({
        data: {
          templateId,
          version: normalizedVersion,
          content: dto.content,
          changelog: dto.changelog?.trim(),
          status: dto.status ?? ContentStatus.DRAFT,
          publishedAt: isPublishingImmediately ? new Date() : null,
          createdById: actorId ?? null,
        },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: isPublishingImmediately
            ? 'AGREEMENT_VERSION_PUBLISHED'
            : 'AGREEMENT_VERSION_CREATED',
          entity: 'AgreementTemplateVersion',
          entityId: created.id,
          meta: {
            templateId,
            templateTitle: template.title,
            version: created.version,
            status: created.status,
          },
          ip,
        },
      });

      return created;
    });

    return version;
  }

  async findAllVersions(templateId: string) {
    const template = await this.prisma.agreementTemplate.findUnique({
      where: { id: templateId },
      select: { id: true, title: true },
    });

    if (!template) {
      throw new NotFoundException(
        `Agreement template with ID ${templateId} not found`,
      );
    }

    return this.prisma.agreementTemplateVersion.findMany({
      where: { templateId },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        _count: {
          select: { signedAgreements: true },
        },
      },
    });
  }

  async findVersionById(templateId: string, versionId: string) {
    const version = await this.prisma.agreementTemplateVersion.findFirst({
      where: {
        id: versionId,
        templateId,
      },
      include: {
        template: {
          select: {
            id: true,
            title: true,
            programId: true,
            program: { select: { id: true, title: true, slug: true } },
          },
        },
        createdBy: { select: { id: true, name: true, email: true } },
        _count: {
          select: { signedAgreements: true },
        },
      },
    });

    if (!version) {
      throw new NotFoundException(
        `Agreement template version with ID ${versionId} not found for template ${templateId}`,
      );
    }

    return version;
  }

  /**
   * Updates an existing version.
   * STRICT IMMUTABILITY ENFORCEMENT:
   * 1. Published or archived versions can NEVER be modified.
   * 2. Versions with historical signed agreements can NEVER be modified.
   */
  async updateVersion(
    templateId: string,
    versionId: string,
    dto: UpdateTemplateVersionDto,
    actorId?: string,
    ip?: string,
  ) {
    const version = await this.prisma.agreementTemplateVersion.findFirst({
      where: {
        id: versionId,
        templateId,
      },
      include: {
        _count: {
          select: { signedAgreements: true },
        },
      },
    });

    if (!version) {
      throw new NotFoundException(
        `Agreement template version with ID ${versionId} not found for template ${templateId}`,
      );
    }

    // 1. Published or archived versions are strictly immutable
    if (
      version.status === ContentStatus.PUBLISHED ||
      version.status === ContentStatus.ARCHIVED
    ) {
      throw new BadRequestException(
        `Cannot modify a ${version.status} agreement version. Published and historical versions are legally immutable. Create a new version instead.`,
      );
    }

    // 2. Any version with signed agreements is strictly immutable
    if (version._count.signedAgreements > 0) {
      throw new BadRequestException(
        'Cannot modify an agreement version that has historical signed agreements. Historical agreements must remain immutable.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.agreementTemplateVersion.update({
        where: { id: versionId },
        data: {
          ...(dto.content !== undefined && { content: dto.content }),
          ...(dto.changelog !== undefined && {
            changelog: dto.changelog?.trim(),
          }),
        },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: 'AGREEMENT_VERSION_UPDATED',
          entity: 'AgreementTemplateVersion',
          entityId: versionId,
          meta: {
            templateId,
            version: version.version,
            changes: { ...dto },
          },
          ip,
        },
      });

      return res;
    });

    return updated;
  }

  /**
   * Publishes a draft version.
   * Transitions previous published versions to ARCHIVED while keeping them queryable.
   */
  async publishVersion(
    templateId: string,
    versionId: string,
    actorId?: string,
    ip?: string,
  ) {
    const version = await this.prisma.agreementTemplateVersion.findFirst({
      where: {
        id: versionId,
        templateId,
      },
    });

    if (!version) {
      throw new NotFoundException(
        `Agreement template version with ID ${versionId} not found for template ${templateId}`,
      );
    }

    if (version.status === ContentStatus.PUBLISHED) {
      return version;
    }

    const published = await this.prisma.$transaction(async (tx) => {
      // Archive existing published versions for this template
      await tx.agreementTemplateVersion.updateMany({
        where: {
          templateId,
          status: ContentStatus.PUBLISHED,
        },
        data: {
          status: ContentStatus.ARCHIVED,
        },
      });

      // Publish this version
      const res = await tx.agreementTemplateVersion.update({
        where: { id: versionId },
        data: {
          status: ContentStatus.PUBLISHED,
          publishedAt: new Date(),
        },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: 'AGREEMENT_VERSION_PUBLISHED',
          entity: 'AgreementTemplateVersion',
          entityId: versionId,
          meta: {
            templateId,
            version: version.version,
          },
          ip,
        },
      });

      return res;
    });

    return published;
  }

  /**
   * Deletes a draft version.
   * Blocked if version is published, archived, or has signed agreements.
   */
  async deleteVersion(
    templateId: string,
    versionId: string,
    actorId?: string,
    ip?: string,
  ) {
    const version = await this.prisma.agreementTemplateVersion.findFirst({
      where: {
        id: versionId,
        templateId,
      },
      include: {
        _count: {
          select: { signedAgreements: true },
        },
      },
    });

    if (!version) {
      throw new NotFoundException(
        `Agreement template version with ID ${versionId} not found for template ${templateId}`,
      );
    }

    if (version._count.signedAgreements > 0) {
      throw new BadRequestException(
        'Cannot delete an agreement version that has historical signed agreements. Historical signed records must remain permanently associated with their template version.',
      );
    }

    if (version.status === ContentStatus.PUBLISHED) {
      throw new BadRequestException(
        'Cannot delete an active published agreement version. Create and publish a successor version or archive this version instead.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.agreementTemplateVersion.delete({
        where: { id: versionId },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: 'AGREEMENT_VERSION_DELETED',
          entity: 'AgreementTemplateVersion',
          entityId: versionId,
          meta: {
            templateId,
            version: version.version,
          },
          ip,
        },
      });
    });

    return { success: true, deletedVersionId: versionId };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. LEARNER / CLIENT QUERIES
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Retrieves the currently active published agreement version for a given program.
   * Used by learners and the progression gate to present the latest agreement for signing.
   */
  async getActiveVersionForProgram(programId: string) {
    const template = await this.prisma.agreementTemplate.findFirst({
      where: { programId },
      include: {
        program: { select: { id: true, title: true, slug: true } },
        versions: {
          where: { status: ContentStatus.PUBLISHED },
          orderBy: { publishedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!template || template.versions.length === 0) {
      throw new NotFoundException(
        `No published agreement template found for program ID ${programId}`,
      );
    }

    const activeVersion = template.versions[0];

    return {
      templateId: template.id,
      templateTitle: template.title,
      templateDescription: template.description,
      programId: template.programId,
      programTitle: template.program.title,
      versionId: activeVersion.id,
      version: activeVersion.version,
      content: activeVersion.content,
      publishedAt: activeVersion.publishedAt,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. LEARNER AGREEMENT SIGNING & AUDIT (D1-040, D1-042)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Signs a program agreement for a specific learner enrolment.
   * Enforces learner ownership, valid enrolment state, published version identity,
   * in-app consent, typed name, drawn signature, server timestamp, client IP,
   * and creates an immutable AuditLog entry within the same transaction.
   */
  async signAgreement(
    dto: SignAgreementDto,
    user: any,
    ip?: string,
    userAgent?: string,
  ) {
    const userId = user?.sub ?? user?.id;
    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }

    if (!dto.consentGiven) {
      throw new BadRequestException(
        'Explicit consent acknowledgement is required to sign the agreement',
      );
    }

    if (!dto.typedName || dto.typedName.trim().length < 2) {
      throw new BadRequestException(
        'Typed full name is required and must be at least 2 characters',
      );
    }

    if (!dto.drawnSignature || dto.drawnSignature.trim().length < 5) {
      throw new BadRequestException(
        'Drawn signature representation is required',
      );
    }

    // 1. Fetch enrolment
    const enrolment = await this.prisma.enrolment.findUnique({
      where: { id: dto.enrolmentId },
      include: {
        program: { select: { id: true, title: true } },
        signedAgreement: {
          include: {
            version: true,
          },
        },
      },
    });

    if (!enrolment) {
      throw new NotFoundException(`Enrolment with ID ${dto.enrolmentId} not found`);
    }

    // 2. Authorize learner ownership: never trust client-supplied userId
    if (enrolment.userId !== userId) {
      throw new ForbiddenException(
        'You are not authorized to sign the agreement for this enrolment',
      );
    }

    // 3. Validate enrolment state
    if (enrolment.status === EnrolmentStatus.PENDING_PAYMENT) {
      throw new BadRequestException(
        'Cannot sign agreement for enrolment pending payment. Payment must be completed first.',
      );
    }

    if (enrolment.status === EnrolmentStatus.REVOKED) {
      throw new BadRequestException(
        'Cannot sign agreement for a revoked enrolment.',
      );
    }

    if (enrolment.status === EnrolmentStatus.WAITLIST) {
      throw new BadRequestException(
        'Cannot sign agreement for a waitlisted enrolment.',
      );
    }

    // 4. Repeated signing check: never overwrite an already signed agreement
    if (
      enrolment.signedAgreement &&
      enrolment.signedAgreement.status === AgreementStatus.SIGNED
    ) {
      throw new ConflictException(
        'Agreement has already been signed for this enrolment',
      );
    }

    // 5. Fetch template & active version for the enrolled program
    const template = await this.prisma.agreementTemplate.findFirst({
      where: { programId: enrolment.programId },
      include: {
        versions: {
          where: { status: ContentStatus.PUBLISHED },
          orderBy: { publishedAt: 'desc' },
        },
      },
    });

    if (!template || template.versions.length === 0) {
      throw new NotFoundException(
        `No published agreement template found for program ID ${enrolment.programId}`,
      );
    }

    let targetVersion: any;
    if (dto.versionId) {
      targetVersion = template.versions.find((v) => v.id === dto.versionId);
      if (!targetVersion) {
        // Check if version exists in DB but isn't published or belongs to another template
        const dbVersion = await this.prisma.agreementTemplateVersion.findUnique({
          where: { id: dto.versionId },
        });
        if (!dbVersion || dbVersion.templateId !== template.id) {
          throw new BadRequestException(
            'The selected agreement version does not belong to this program agreement template',
          );
        }
        if (dbVersion.status !== ContentStatus.PUBLISHED) {
          throw new BadRequestException(
            'The selected agreement version is not currently published',
          );
        }
        targetVersion = dbVersion;
      }
    } else {
      targetVersion = template.versions[0];
    }

    // Server-captured values: never trust client for timestamp, IP, or user-agent
    const signingTimestamp = new Date();
    const resolvedIp = ip ?? '127.0.0.1';
    const resolvedUserAgent = userAgent ?? 'unknown';

    // 6. Execute atomic transaction: Persist SignedAgreement + update Enrolment + create AuditLog
    const result = await this.prisma.$transaction(async (tx) => {
      let signedAgreement: any;

      if (enrolment.signedAgreement) {
        signedAgreement = await tx.signedAgreement.update({
          where: { id: enrolment.signedAgreement.id },
          data: {
            userId,
            programId: enrolment.programId,
            templateId: template.id,
            versionId: targetVersion.id,
            templateVersion: targetVersion.version,
            consentGiven: true,
            typedName: dto.typedName.trim(),
            drawnSignature: dto.drawnSignature.trim(),
            signerIp: resolvedIp,
            userAgent: resolvedUserAgent,
            status: AgreementStatus.SIGNED,
            signedAt: signingTimestamp,
          },
          include: {
            version: true,
            template: true,
          },
        });
      } else {
        signedAgreement = await tx.signedAgreement.create({
          data: {
            enrolmentId: enrolment.id,
            userId,
            programId: enrolment.programId,
            templateId: template.id,
            versionId: targetVersion.id,
            templateVersion: targetVersion.version,
            consentGiven: true,
            typedName: dto.typedName.trim(),
            drawnSignature: dto.drawnSignature.trim(),
            signerIp: resolvedIp,
            userAgent: resolvedUserAgent,
            status: AgreementStatus.SIGNED,
            signedAt: signingTimestamp,
          },
          include: {
            version: true,
            template: true,
          },
        });
      }

      // Transition enrolment from PENDING_AGREEMENT to ACTIVE
      if (enrolment.status === EnrolmentStatus.PENDING_AGREEMENT) {
        await tx.enrolment.update({
          where: { id: enrolment.id },
          data: { status: EnrolmentStatus.ACTIVE },
        });
      }

      // Create immutable audit log (D1-042)
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'AGREEMENT_SIGNED',
          entity: 'SignedAgreement',
          entityId: signedAgreement.id,
          meta: {
            enrolmentId: enrolment.id,
            programId: enrolment.programId,
            templateId: template.id,
            versionId: targetVersion.id,
            version: targetVersion.version,
            typedName: dto.typedName.trim(),
            userAgent: resolvedUserAgent,
            consentGiven: true,
            signedAt: signingTimestamp.toISOString(),
          },
          ip: resolvedIp,
        },
      });

      return signedAgreement;
    });

    if (this.emailService && user?.email) {
      const recipientEmail = user.email;
      const lmsUrl = process.env.NEXT_PUBLIC_LMS_URL || 'http://localhost:3003';
      this.emailService
        .sendTemplateEmail({
          to: recipientEmail,
          subject: 'Agreement Signed Confirmation - WhatBoutMe',
          template: 'AgreementSignedConfirmationEmail',
          props: {
            learnerName: result.typedName || user.name || 'Learner',
            agreementTitle: template.title || 'Student Agreement',
            signedAt: result.signedAt ? new Date(result.signedAt).toISOString() : new Date().toISOString(),
            dashboardUrl: `${lmsUrl}/dashboard`,
          },
        })
        .catch((e: any) => console.warn('[AgreementsService] Agreement email error:', e?.message));
    }

    return {
      id: result.id,
      enrolmentId: result.enrolmentId,
      programId: result.programId,
      templateId: result.templateId,
      versionId: result.versionId,
      templateVersion: result.templateVersion,
      consentGiven: result.consentGiven,
      typedName: result.typedName,
      drawnSignature: result.drawnSignature,
      signerIp: result.signerIp,
      userAgent: result.userAgent,
      status: result.status,
      signedAt: result.signedAt,
      signedPdfUrl: result.signedPdfUrl,
    };
  }

  /**
   * Retrieves the signed agreement for an enrolment.
   * Access is permitted to the enrolled learner or staff (admin/manager/super_admin).
   */
  async getSignedAgreementForEnrolment(enrolmentId: string, user: any) {
    const userId = user?.sub ?? user?.id;
    const isStaff =
      user?.role === Role.SUPER_ADMIN ||
      user?.role === Role.ADMIN ||
      user?.role === Role.MANAGER || user?.role === 'MANAGER' || user?.role === 'TEACHER';

    const enrolment = await this.prisma.enrolment.findUnique({
      where: { id: enrolmentId },
      include: {
        signedAgreement: {
          include: {
            version: {
              select: {
                id: true,
                version: true,
                content: true,
                changelog: true,
                publishedAt: true,
              },
            },
            template: {
              select: {
                id: true,
                title: true,
                description: true,
              },
            },
          },
        },
      },
    });

    if (!enrolment) {
      throw new NotFoundException(`Enrolment with ID ${enrolmentId} not found`);
    }

    if (!isStaff && enrolment.userId !== userId) {
      throw new ForbiddenException(
        'You are not authorized to view the agreement for this enrolment',
      );
    }

    if (!enrolment.signedAgreement) {
      return null;
    }

    return enrolment.signedAgreement;
  }

  /**
   * Admin view: lists all signed agreements for a specific template.
   */
  async getSignedAgreementsForTemplate(
    templateId: string,
    query?: { page?: number; limit?: number },
  ) {
    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query?.limit) || 50));
    const skip = (page - 1) * limit;

    const [template, signedAgreements] = await Promise.all([
      this.prisma.agreementTemplate.findUnique({
        where: { id: templateId },
        select: { id: true },
      }),
      this.prisma.signedAgreement.findMany({
        where: { templateId },
        skip,
        take: limit,
        select: {
          id: true,
          enrolmentId: true,
          userId: true,
          programId: true,
          templateId: true,
          versionId: true,
          templateVersion: true,
          consentGiven: true,
          typedName: true,
          signedPdfUrl: true,
          status: true,
          signedAt: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { id: true, email: true, name: true } },
          version: { select: { id: true, version: true, publishedAt: true } },
        },
        orderBy: { signedAt: 'desc' },
      }),
    ]);

    if (!template) {
      throw new NotFoundException(`Agreement template with ID ${templateId} not found`);
    }

    return signedAgreements;
  }
}
