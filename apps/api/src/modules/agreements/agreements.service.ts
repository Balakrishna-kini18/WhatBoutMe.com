import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  CreateAgreementTemplateDto,
  CreateTemplateVersionDto,
  QueryAgreementTemplatesDto,
  UpdateAgreementTemplateDto,
  UpdateTemplateVersionDto,
} from './dto/index.js';

@Injectable()
export class AgreementsService {
  constructor(private readonly prisma: PrismaService) {}

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

  async findAllTemplates(query: QueryAgreementTemplatesDto) {
    const where: any = {};
    if (query.programId) {
      where.programId = query.programId;
    }

    const templates = await this.prisma.agreementTemplate.findMany({
      where,
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
}
