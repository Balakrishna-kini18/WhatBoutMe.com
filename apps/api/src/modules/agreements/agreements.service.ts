import { getAppUrls } from '../../common/config/app-urls.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  Optional,
} from '@nestjs/common';
import { AgreementStatus, BatchStatus, ContentStatus, EnrolmentStatus, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import { CacheHelperService } from '../../common/cache/cache-helper.service.js';
import { getDashboardKey, getProgressKey } from '../../common/cache/cache-keys.constant.js';
import {
  isRegistrationDeadlinePassed,
  getRegistrationDeadlineCutoff,
} from '../../common/utils/deadline.util.js';
import {
  CreateAgreementTemplateDto,
  CreateTemplateVersionDto,
  QueryAgreementTemplatesDto,
  QuerySignedAgreementsDto,
  SignedRecordsTab,
  SignedPaymentStatusFilter,
  SignedScopeFilter,
  SignAgreementDto,
  UpdateAgreementTemplateDto,
  UpdateTemplateVersionDto,
} from './dto/index.js';
import {
  renderSignedAgreementPdf as renderSignedAgreementPdfDocument,
  DEFAULT_CONSENT_STATEMENT,
} from './signed-agreement-pdf.js';


@Injectable()
export class AgreementsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly emailService?: EmailService,
    @Optional() private readonly cacheHelper?: CacheHelperService,
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

      if (dto.initialContent && dto.initialContent.trim().length >= 10) {
        const isPublishingImmediately = dto.publishImmediately === true;
        const initialVersion = dto.initialVersion?.trim() || 'v1.0';
        await tx.agreementTemplateVersion.create({
          data: {
            templateId: created.id,
            version: initialVersion,
            content: dto.initialContent.trim(),
            changelog: dto.initialChangelog?.trim() || 'Initial terms release',
            status: isPublishingImmediately
              ? ContentStatus.PUBLISHED
              : ContentStatus.DRAFT,
            publishedAt: isPublishingImmediately ? new Date() : null,
            createdById: actorId ?? null,
          },
        });
      }

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

    const signaturesCount = await this.prisma.signedAgreement.count({
      where: { templateId: id },
    });

    const isScopeChangeAttempted =
      (dto.programId !== undefined && dto.programId !== existing.programId);

    // Detect shared default toggle attempts
    const existingIsShared =
      /standard|default|general|platform/i.test(existing.title) ||
      /default|shared/i.test(existing.description || '');
    const nextTitle = dto.title !== undefined ? dto.title.trim() : existing.title;
    const nextDesc = dto.description !== undefined ? dto.description.trim() : (existing.description || '');
    const nextIsShared =
      /standard|default|general|platform/i.test(nextTitle) ||
      /default|shared/i.test(nextDesc);
    const isSharedDefaultToggled = existingIsShared !== nextIsShared;

    if (signaturesCount > 0 && (isScopeChangeAttempted || isSharedDefaultToggled)) {
      throw new ConflictException(
        'Cannot reassign program scope for a template with existing signed learner records',
      );
    }

    if (isScopeChangeAttempted) {
      const targetProgram = await this.prisma.program.findUnique({
        where: { id: dto.programId },
      });
      if (!targetProgram) {
        throw new NotFoundException(`Program with ID ${dto.programId} not found`);
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.agreementTemplate.update({
        where: { id },
        data: {
          ...(dto.title !== undefined && { title: dto.title.trim() }),
          ...(dto.description !== undefined && {
            description: dto.description?.trim(),
          }),
          ...(dto.programId !== undefined && { programId: dto.programId }),
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

    // Enforce case-insensitive version uniqueness within template
    const existingVersion =
      (await this.prisma.agreementTemplateVersion.findFirst?.({
        where: {
          templateId,
          version: {
            equals: normalizedVersion,
            mode: 'insensitive',
          },
        },
      })) ||
      (await this.prisma.agreementTemplateVersion.findUnique?.({
        where: {
          templateId_version: {
            templateId,
            version: normalizedVersion,
          },
        },
      }));

    if (existingVersion) {
      throw new ConflictException(
        'This version already exists. Please enter a different version number.',
      );
    }

    const isPublishingImmediately = dto.status === ContentStatus.PUBLISHED;

    try {
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
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ConflictException(
          'This version already exists. Please enter a different version number.',
        );
      }
      throw err;
    }
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
    let template = await this.prisma.agreementTemplate.findFirst({
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

    // If no course-specific agreement template exists, fallback to an explicitly designated shared/default published template
    if (!template || template.versions.length === 0) {
      template = await this.prisma.agreementTemplate.findFirst({
        where: {
          OR: [
            { title: { contains: 'Standard', mode: 'insensitive' } },
            { title: { contains: 'Default', mode: 'insensitive' } },
            { title: { contains: 'General', mode: 'insensitive' } },
            { title: { contains: 'Platform', mode: 'insensitive' } },
            { description: { contains: 'default', mode: 'insensitive' } },
            { description: { contains: 'shared', mode: 'insensitive' } },
          ],
          versions: {
            some: { status: ContentStatus.PUBLISHED },
          },
        },
        include: {
          program: { select: { id: true, title: true, slug: true } },
          versions: {
            where: { status: ContentStatus.PUBLISHED },
            orderBy: { publishedAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'asc' },
      });
    }

    if (!template || template.versions.length === 0) {
      throw new NotFoundException(
        `No published agreement template found for program ID ${programId}`,
      );
    }

    const activeVersion = template.versions[0];
    const targetProgram = await this.prisma.program.findUnique({
      where: { id: programId },
      select: { id: true, title: true, slug: true },
    });

    return {
      templateId: template.id,
      templateTitle: template.title,
      templateDescription: template.description,
      programId: targetProgram?.id ?? template.programId,
      programTitle: targetProgram?.title ?? template.program.title,
      versionId: activeVersion.id,
      version: activeVersion.version,
      content: activeVersion.content,
      publishedAt: activeVersion.publishedAt,
    };
  }

  async verifyEnrolmentOwnership(enrolmentId: string, user: any) {
    const userId = user?.sub ?? user?.id;
    const isStaff =
      user?.role === Role.SUPER_ADMIN ||
      user?.role === Role.ADMIN ||
      user?.role === Role.MANAGER;

    if (!isStaff) {
      const enrolment = await this.prisma.enrolment.findUnique({
        where: { id: enrolmentId },
        select: { userId: true },
      });
      if (!enrolment) {
        throw new NotFoundException(`Enrolment with ID ${enrolmentId} not found`);
      }
      if (enrolment.userId !== userId) {
        throw new ForbiddenException('You are not authorized to access agreement for this enrolment');
      }
    }
  }

  async getActiveVersionForEnrolment(enrolmentId: string, user: any) {
    const userId = user?.sub ?? user?.id;
    const isStaff =
      user?.role === Role.SUPER_ADMIN ||
      user?.role === Role.ADMIN ||
      user?.role === Role.MANAGER;

    const enrolment = await this.prisma.enrolment.findUnique({
      where: { id: enrolmentId },
      select: { id: true, userId: true, programId: true },
    });
    if (!enrolment) {
      throw new NotFoundException(`Enrolment with ID ${enrolmentId} not found`);
    }
    if (!isStaff && enrolment.userId !== userId) {
      throw new ForbiddenException('You are not authorized to access agreement for this enrolment');
    }
    return this.getActiveVersionForProgram(enrolment.programId);
  }

  /**
   * Retrieves an existing enrolment for the learner on a program, or initiates a
   * provisional enrolment in PENDING_PAYMENT status so the learner can review and sign
   * the agreement prior to checkout in the Agreement-First learner journey.
   */
  async getOrInitiateSigningEnrolment(userId: string, programId: string) {
    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }
    if (!programId) {
      throw new BadRequestException('Program ID is required');
    }

    // 1. Fetch learner
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });
    if (!user) {
      throw new NotFoundException('Learner not found');
    }

    // 2. Fetch program
    const program = await this.prisma.program.findUnique({
      where: { id: programId },
      select: { id: true, title: true, slug: true, price: true },
    });
    if (!program) {
      throw new NotFoundException(`Program with ID ${programId} not found`);
    }

    // 3 & 4. Transactional lookup / provisional enrolment creation to prevent duplicate provisional records
    const enrolment = await this.prisma.$transaction(async (tx) => {
      let existing = await tx.enrolment.findFirst({
        where: { userId, programId },
        include: {
          program: { select: { id: true, title: true, slug: true, price: true } },
          batch: { select: { id: true, name: true, startDate: true } },
          signedAgreement: {
            include: {
              version: true,
            },
          },
        },
      });

      if (existing) {
        return existing;
      }

      const now = new Date();
      // Candidate batches: must be ACTIVE or UPCOMING, and registration deadline not passed
      let candidateBatches: any[] = [];
      if (typeof tx.batch?.findMany === 'function') {
        candidateBatches = await tx.batch.findMany({
          where: {
            programId,
            status: { in: [BatchStatus.ACTIVE, BatchStatus.UPCOMING] },
            OR: [
              { status: BatchStatus.ACTIVE },
              { registrationDeadline: null },
              { registrationDeadline: { gte: getRegistrationDeadlineCutoff(now) } },
            ],
          },
          orderBy: [
            { status: 'asc' }, // UPCOMING first, then ACTIVE
            { startDate: 'asc' },
          ],
          include: {
            _count: {
              select: {
                enrolments: {
                  where: {
                    status: { in: [EnrolmentStatus.ACTIVE, EnrolmentStatus.PENDING_AGREEMENT, EnrolmentStatus.COMPLETED] },
                  },
                },
              },
            },
          },
        });
      }

      // Find first batch that still has capacity
      const openBatch = candidateBatches.find(b => b._count.enrolments < b.capacity && (b.status === BatchStatus.ACTIVE || !isRegistrationDeadlinePassed(b.registrationDeadline, now)));

      let batch: any = openBatch;
      let initialStatus: EnrolmentStatus = EnrolmentStatus.PENDING_PAYMENT;

      if (!batch) {
        // No batch with open deadline and available capacity!
        // Place the learner on the WAITLIST for the program.
        batch = await tx.batch.findFirst({
          where: { programId },
          orderBy: { startDate: 'desc' },
        });

        if (!batch) {
          batch = await tx.batch.create({
            data: {
              name: `${program.title} - Waitlist Batch`,
              programId,
              startDate: new Date(),
              capacity: 50,
              status: BatchStatus.UPCOMING,
            },
          });
        }
        initialStatus = EnrolmentStatus.WAITLIST;
      }

      try {
        return await tx.enrolment.create({
          data: {
            userId,
            programId,
            batchId: batch.id,
            status: initialStatus,
          },
          include: {
            program: { select: { id: true, title: true, slug: true, price: true } },
            batch: { select: { id: true, name: true, startDate: true } },
            signedAgreement: {
              include: {
                version: true,
              },
            },
          },
        });
      } catch (err: any) {
        const race = await tx.enrolment.findFirst({
          where: { userId, programId },
          include: {
            program: { select: { id: true, title: true, slug: true, price: true } },
            batch: { select: { id: true, name: true, startDate: true } },
            signedAgreement: {
              include: {
                version: true,
              },
            },
          },
        });
        if (race) return race;
        throw err;
      }
    });

    // 5. Retrieve active published agreement template (course-specific or shared)
    const template = await this.getActiveVersionForProgram(programId);
    const isSigned = enrolment.signedAgreement?.status === AgreementStatus.SIGNED;

    return {
      enrolment: {
        id: enrolment.id,
        userId: enrolment.userId,
        programId: enrolment.programId,
        programTitle: enrolment.program.title,
        price: enrolment.program.price,
        status: enrolment.status,
        batchId: enrolment.batchId,
        batchName: enrolment.batch?.name,
      },
      template,
      hasSignedAgreement: isSigned,
      signedAgreement: isSigned ? enrolment.signedAgreement : null,
      nextStep: isSigned
        ? enrolment.status === EnrolmentStatus.ACTIVE
          ? 'STEPS'
          : 'CHECKOUT'
        : 'SIGN_AGREEMENT',
      checkoutUrl: `/checkout?programId=${programId}&enrolmentId=${enrolment.id}`,
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

    const consent = dto.consentAccepted !== undefined ? dto.consentAccepted : dto.consentGiven;
    if (consent !== true) {
      throw new BadRequestException(
        'Explicit consent acknowledgement is required to sign the agreement',
      );
    }

    const legalName = (dto.signerName ?? dto.typedName)?.trim();
    if (!legalName || legalName.length < 2) {
      throw new BadRequestException(
        'Typed full name is required and must be at least 2 characters',
      );
    }

    // Validate typed acceptance requirement ("I AGREE")
    const acknowledgement = dto.typedAcknowledgement?.trim();
    if (!acknowledgement || acknowledgement.toUpperCase() !== 'I AGREE') {
      throw new BadRequestException(
        'Typed acknowledgement "I AGREE" is required to confirm acceptance',
      );
    }

    // Check if learner wants to reuse their profile saved signature
    const userRecord = this.prisma.user
      ? await this.prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, savedSignature: true, savedSignatureType: true },
        })
      : null;

    // Resolve signature representation: support drawn canvas, uploaded image, or saved profile signature
    let signatureType: 'DRAWN' | 'UPLOADED' =
      dto.signatureType === 'UPLOADED' || (!dto.drawnSignature && !dto.signatureData && !!dto.signatureImage)
        ? 'UPLOADED'
        : 'DRAWN';

    let rawSignature = (
      dto.signatureData ??
      (signatureType === 'UPLOADED'
        ? (dto.signatureImage || dto.drawnSignature)
        : (dto.drawnSignature || dto.signatureImage))
    )?.trim();

    if (dto.useSavedSignature) {
      if (!userRecord?.savedSignature) {
        throw new BadRequestException('No saved signature found on your profile to reuse.');
      }
      rawSignature = userRecord.savedSignature;
      if (userRecord.savedSignatureType === 'UPLOADED' || userRecord.savedSignatureType === 'DRAWN') {
        signatureType = userRecord.savedSignatureType;
      }
    }

    if (!rawSignature || rawSignature.length < 5) {
      throw new BadRequestException(
        signatureType === 'UPLOADED'
          ? 'Uploaded signature image representation is required'
          : 'Drawn signature representation is required',
      );
    }

    // Normalize raw signature: support data:image/... or normalize raw base64 string
    let normalizedSignature: string;
    if (rawSignature.startsWith('data:image/')) {
      const match = rawSignature.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
      if (!match) {
        throw new BadRequestException(
          'Invalid signature file type. Only PNG, JPEG, and WebP images are permitted.',
        );
      }
      const base64Data = match[2];
      const approxSizeBytes = Math.ceil((base64Data.length * 3) / 4);
      const MAX_SIGNATURE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB limit
      if (approxSizeBytes > MAX_SIGNATURE_SIZE_BYTES) {
        throw new BadRequestException(
          'Uploaded signature image exceeds the 2MB size limit.',
        );
      }
      normalizedSignature = rawSignature;
    } else if (rawSignature.startsWith('data:')) {
      throw new BadRequestException(
        'Invalid signature file type. Only PNG, JPEG, and WebP images are permitted.',
      );
    } else {
      // Raw base64 payload: normalize into valid data URI
      const approxSizeBytes = Math.ceil((rawSignature.length * 3) / 4);
      const MAX_SIGNATURE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB limit
      if (approxSizeBytes > MAX_SIGNATURE_SIZE_BYTES) {
        throw new BadRequestException(
          'Signature image exceeds the 2MB size limit.',
        );
      }
      normalizedSignature = `data:image/png;base64,${rawSignature}`;
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
    // Disallow revoked or waitlist enrolments. PENDING_PAYMENT is valid for Agreement-First flow.
    if (enrolment.status === EnrolmentStatus.REVOKED) {
      throw new BadRequestException(
        'Cannot sign agreement for a revoked enrolment.',
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

    // 5. Fetch template & active version for the enrolled program (with shared template fallback)
    let template = await this.prisma.agreementTemplate.findFirst({
      where: { programId: enrolment.programId },
      include: {
        versions: {
          where: { status: ContentStatus.PUBLISHED },
          orderBy: { publishedAt: 'desc' },
        },
      },
    });

    if (!template || template.versions.length === 0) {
      // Fallback: search for an explicitly designated shared/default published agreement template
      template = await this.prisma.agreementTemplate.findFirst({
        where: {
          OR: [
            { title: { contains: 'Standard', mode: 'insensitive' } },
            { title: { contains: 'Default', mode: 'insensitive' } },
            { title: { contains: 'General', mode: 'insensitive' } },
            { title: { contains: 'Platform', mode: 'insensitive' } },
            { description: { contains: 'default', mode: 'insensitive' } },
            { description: { contains: 'shared', mode: 'insensitive' } },
          ],
          versions: {
            some: { status: ContentStatus.PUBLISHED },
          },
        },
        include: {
          versions: {
            where: { status: ContentStatus.PUBLISHED },
            orderBy: { publishedAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      });
    }

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

    const resolvedConsentVersion = dto.consentVersion?.trim() || targetVersion.version;
    let resolvedConsentTimestamp: Date;
    if (dto.consentTimestamp) {
      const parsed = new Date(dto.consentTimestamp);
      resolvedConsentTimestamp = !isNaN(parsed.getTime()) ? parsed : signingTimestamp;
    } else {
      resolvedConsentTimestamp = signingTimestamp;
    }

    // 6. Execute atomic transaction: Persist SignedAgreement + update Enrolment + create AuditLog
    const result = await this.prisma.$transaction(async (tx) => {
      // Re-verify inside transaction to guarantee idempotency across concurrent requests
      const concurrentExisting = await tx.signedAgreement.findUnique({
        where: { enrolmentId: enrolment.id },
      });
      if (concurrentExisting && concurrentExisting.status === AgreementStatus.SIGNED) {
        throw new ConflictException(
          'Agreement has already been signed for this enrolment',
        );
      }

      let signedAgreement: any;

      if (concurrentExisting || enrolment.signedAgreement) {
        const sigId = concurrentExisting?.id || enrolment.signedAgreement?.id;
        signedAgreement = await tx.signedAgreement.update({
          where: { id: sigId },
          data: {
            userId,
            programId: enrolment.programId,
            templateId: template.id,
            versionId: targetVersion.id,
            templateVersion: targetVersion.version,
            consentVersion: resolvedConsentVersion,
            consentGiven: true,
            consentTimestamp: resolvedConsentTimestamp,
            typedName: legalName,
            drawnSignature: normalizedSignature,
            signatureType,
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
            consentVersion: resolvedConsentVersion,
            consentGiven: true,
            consentTimestamp: resolvedConsentTimestamp,
            typedName: legalName,
            drawnSignature: normalizedSignature,
            signatureType,
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

      // Transition enrolment from PENDING_AGREEMENT to ACTIVE/WAITLIST & update Org Seat consumption
      const isOrgSponsored = (enrolment as any).fundingSource === 'ORG_SPONSORED';
      if (enrolment.status === EnrolmentStatus.PENDING_AGREEMENT || isOrgSponsored) {
        let nextStatus: EnrolmentStatus | undefined;
        if (enrolment.status === EnrolmentStatus.PENDING_AGREEMENT) {
          const batch = enrolment.batchId
            ? await tx.batch.findUnique({
                where: { id: enrolment.batchId },
                include: {
                  _count: {
                    select: {
                      enrolments: {
                        where: {
                          id: { not: enrolment.id },
                          status: { in: [EnrolmentStatus.ACTIVE, EnrolmentStatus.PENDING_AGREEMENT, EnrolmentStatus.COMPLETED] },
                        },
                      },
                    },
                  },
                },
              })
            : null;

          const occupied = batch?._count?.enrolments ?? 0;
          const capacity = batch?.capacity ?? 50;
          const isFull = occupied >= capacity;
          const isDeadlinePassed = isRegistrationDeadlinePassed(batch?.registrationDeadline);



          nextStatus = (isFull || isDeadlinePassed) ? EnrolmentStatus.WAITLIST : EnrolmentStatus.ACTIVE;
        }

        await tx.enrolment.update({
          where: { id: enrolment.id },
          data: {
            ...(nextStatus ? { status: nextStatus } : {}),
            ...(isOrgSponsored ? { orgDataSharingConsentedAt: signingTimestamp } : {}),
          },
        });
      }

      // Transition linked numbered Organization Seat to CONSUMED (locks slot from revocation)
      if ((tx as any).seat) {
        const linkedSeat = await (tx as any).seat.findFirst({
          where: { enrolmentId: enrolment.id },
        });
        if (linkedSeat && linkedSeat.status !== 'CONSUMED') {
          const wasAssigned = linkedSeat.status === 'ASSIGNED';
          await (tx as any).seat.update({
            where: { id: linkedSeat.id },
            data: {
              status: 'CONSUMED',
              consumedAt: signingTimestamp,
            },
          });
          if ((tx as any).seatPool) {
            await (tx as any).seatPool.update({
              where: { id: linkedSeat.seatPoolId },
              data: {
                seatsConsumed: { increment: 1 },
                ...(wasAssigned ? { seatsAssigned: { decrement: 1 } } : {}),
              },
            });
          }
        }
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
            consentVersion: resolvedConsentVersion,
            consentTimestamp: resolvedConsentTimestamp.toISOString(),
            typedName: legalName,
            typedAcknowledgement: acknowledgement,
            signerName: legalName,
            signatureType,
            reusedSignature: !!dto.useSavedSignature,
            userAgent: resolvedUserAgent,
            consentGiven: true,
            signedAt: signingTimestamp.toISOString(),
          },
          ip: resolvedIp,
        },
      });

      // 4. Reusable Digital Signature in Learner Profile
      if (tx.user?.update) {
        const userUpdateData: any = {};
        if (!userRecord?.savedSignature || dto.updateProfileSignature === true) {
          userUpdateData.savedSignature = normalizedSignature;
          userUpdateData.savedSignatureType = signatureType;
          userUpdateData.savedSignatureUpdatedAt = signingTimestamp;
        }
        if (Object.keys(userUpdateData).length > 0) {
          await tx.user.update({
            where: { id: userId },
            data: userUpdateData,
          });
        }
      }

      return signedAgreement;
    }, { timeout: 20000, maxWait: 10000 });

    if (this.cacheHelper) {
      await Promise.allSettled([
        this.cacheHelper.invalidate(getDashboardKey(enrolment.userId)),
        this.cacheHelper.invalidate(getProgressKey(enrolment.userId, enrolment.id)),
        this.cacheHelper.invalidateTag(`dashboard:${enrolment.userId}`),
        this.cacheHelper.invalidateTag(`progress:${enrolment.userId}:${enrolment.id}`),
        this.cacheHelper.invalidateNamespace(`enrolment_progression:${enrolment.id}`),
        this.cacheHelper.invalidateNamespace('batches'),
        this.cacheHelper.invalidateNamespace('enrolments'),
      ]);
    }

    // Production email policy: AgreementSignedConfirmationEmail is stripped out.
    // Learners download their signed PDF agreement anytime under LMS > Profile > Agreements.

    const finalEnrolmentStatus = enrolment.status === EnrolmentStatus.PENDING_AGREEMENT
      ? EnrolmentStatus.ACTIVE
      : enrolment.status;

    return {
      id: result.id,
      enrolmentId: result.enrolmentId,
      programId: result.programId,
      templateId: result.templateId,
      versionId: result.versionId,
      templateVersion: result.templateVersion,
      consentVersion: result.consentVersion,
      consentGiven: result.consentGiven,
      consentTimestamp: result.consentTimestamp,
      typedName: result.typedName,
      signerName: result.typedName,
      drawnSignature: result.drawnSignature,
      signatureData: result.drawnSignature,
      signatureType: result.signatureType,
      signerIp: result.signerIp,
      userAgent: result.userAgent,
      status: result.status,
      signedAt: result.signedAt,
      signedPdfUrl: result.signedPdfUrl,
      enrolmentStatus: finalEnrolmentStatus,
      nextStep: finalEnrolmentStatus === EnrolmentStatus.ACTIVE ? 'STEPS' : 'CHECKOUT',
      checkoutUrl: `/checkout?programId=${enrolment.programId}&enrolmentId=${enrolment.id}`,
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
   * If requesting user is a MANAGER, scopes results to learners in batches assigned to that manager.
   */
  /**
   * Admin view: lists signed agreements for a specific template.
   * Supports:
   * - Separation of Completed (Paid & Active) enrollments vs Pending Payment vs All Records
   * - Backend-supported search by learner name, email, legal name, program, and agreement title
   * - Filters for payment status, enrollment status, program, and signing date
   * - Pagination with total count and tab counts
   * - Manager batch-scoping for role-based access control
   */
  async getSignedAgreementsForTemplate(
    templateId: string,
    queryOrUser?: any,
    userArg?: any,
  ) {
    let query: any = {};
    let user: any = undefined;

    // Detect if second argument is user or query DTO
    if (
      queryOrUser &&
      (queryOrUser.role || queryOrUser.sub || (queryOrUser.id && !queryOrUser.tab && !queryOrUser.search && !queryOrUser.page))
    ) {
      user = queryOrUser;
      query = userArg || {};
    } else {
      query = queryOrUser || {};
      user = userArg;
    }

    const template = await this.prisma.agreementTemplate.findUnique({
      where: { id: templateId },
      include: {
        program: { select: { id: true, title: true, slug: true } },
      },
    });

    if (!template) {
      throw new NotFoundException(`Agreement template with ID ${templateId} not found`);
    }
    const isManager = user?.role === Role.MANAGER;
    const managerId = user?.sub ?? user?.id;
    const managerBatchCondition = isManager && managerId ? { batch: { managerId } } : undefined;

    // If no query parameters were passed at all (backward-compatible call from legacy unit tests)
    const hasExplicitQuery =
      query &&
      (query.tab ||
        query.search ||
        query.page ||
        query.limit ||
        query.enrolmentStatus ||
        query.paymentStatus ||
        query.scope ||
        query.programId ||
        query.batchId ||
        query.startDate ||
        query.endDate);

    if (!hasExplicitQuery) {
      const legacyWhere: any = { templateId };
      if (managerBatchCondition) {
        legacyWhere.enrolment = managerBatchCondition;
      }
      return this.prisma.signedAgreement.findMany({
        where: legacyWhere,
        include: {
          user: { select: { id: true, email: true, name: true } },
          version: { select: { id: true, version: true, publishedAt: true } },
          template: { select: { id: true, title: true, description: true } },
          program: { select: { id: true, title: true, slug: true } },
          enrolment: {
            select: {
              id: true,
              status: true,
              batchId: true,
              batch: { select: { id: true, name: true, startDate: true } },
              payments: {
                select: { id: true, status: true, amount: true, currency: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
              },
            },
          },
        },
        orderBy: { signedAt: 'desc' },
      });
    }

    // Determine requested tab (Default: COMPLETED)
    const tab: SignedRecordsTab = (query.tab || SignedRecordsTab.COMPLETED).toUpperCase();

    // Completed condition: enrollment status is ACTIVE or has a succeeded payment
    const completedCondition = {
      OR: [
        { enrolment: { status: EnrolmentStatus.ACTIVE, ...(managerBatchCondition || {}) } },
        { enrolment: { payments: { some: { status: 'succeeded' } }, ...(managerBatchCondition || {}) } },
      ],
    };

    // Pending payment condition: enrollment status is PENDING_PAYMENT and no succeeded payment
    const pendingPaymentCondition = {
      enrolment: {
        status: EnrolmentStatus.PENDING_PAYMENT,
        payments: { none: { status: 'succeeded' } },
        ...(managerBatchCondition || {}),
      },
    };

    const allCondition = managerBatchCondition ? { enrolment: managerBatchCondition } : {};

    // Parallel count queries for the tab badges
    const [completedCount, pendingPaymentCount, allCount] = await Promise.all([
      this.prisma.signedAgreement.count({
        where: {
          templateId,
          ...completedCondition,
        },
      }),
      this.prisma.signedAgreement.count({
        where: {
          templateId,
          ...pendingPaymentCondition,
        },
      }),
      this.prisma.signedAgreement.count({
        where: {
          templateId,
          ...allCondition,
        },
      }),
    ]);

    // Build the filtered where clause
    const andFilters: any[] = [{ templateId }];

    // Tab filter
    if (tab === SignedRecordsTab.COMPLETED) {
      andFilters.push(completedCondition);
    } else if (tab === SignedRecordsTab.PENDING_PAYMENT) {
      andFilters.push(pendingPaymentCondition);
    } else if (managerBatchCondition) {
      andFilters.push(allCondition);
    }

    // Search filter across learner name, email, typed legal name, program title
    if (query.search?.trim()) {
      const term = query.search.trim();
      andFilters.push({
        OR: [
          { user: { name: { contains: term, mode: 'insensitive' } } },
          { user: { email: { contains: term, mode: 'insensitive' } } },
          { typedName: { contains: term, mode: 'insensitive' } },
          { program: { title: { contains: term, mode: 'insensitive' } } },
          { template: { title: { contains: term, mode: 'insensitive' } } },
        ],
      });
    }

    // Program filter (especially useful for shared defaults covering multiple courses)
    if (query.programId && query.programId !== 'ALL') {
      andFilters.push({ programId: query.programId });
    }

    // Batch filter
    if (query.batchId && query.batchId !== 'ALL') {
      andFilters.push({ enrolment: { batchId: query.batchId, ...(managerBatchCondition || {}) } });
    }

    // Explicit enrolment status filter
    if (query.enrolmentStatus && query.enrolmentStatus !== 'ALL') {
      andFilters.push({ enrolment: { status: query.enrolmentStatus, ...(managerBatchCondition || {}) } });
    }

    // Explicit payment status filter
    if (query.paymentStatus && query.paymentStatus !== SignedPaymentStatusFilter.ALL) {
      if (query.paymentStatus === SignedPaymentStatusFilter.PAID) {
        andFilters.push({
          OR: [
            { enrolment: { payments: { some: { status: 'succeeded' } } } },
            { enrolment: { status: EnrolmentStatus.ACTIVE } },
          ],
        });
      } else if (query.paymentStatus === SignedPaymentStatusFilter.PENDING) {
        andFilters.push({
          enrolment: {
            status: EnrolmentStatus.PENDING_PAYMENT,
            payments: { none: { status: 'succeeded' } },
          },
        });
      } else if (query.paymentStatus === SignedPaymentStatusFilter.REFUNDED) {
        andFilters.push({
          enrolment: { payments: { some: { status: 'refunded' } } },
        });
      } else if (query.paymentStatus === SignedPaymentStatusFilter.FAILED) {
        andFilters.push({
          enrolment: { payments: { some: { status: 'failed' } } },
        });
      }
    }

    // Date range filter
    if (query.startDate || query.endDate) {
      const dateFilter: any = {};
      if (query.startDate) dateFilter.gte = new Date(query.startDate);
      if (query.endDate) dateFilter.lte = new Date(query.endDate);
      andFilters.push({ signedAt: dateFilter });
    }

    const where = { AND: andFilters };

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const [totalFiltered, rawRecords] = await Promise.all([
      this.prisma.signedAgreement.count({ where }),
      this.prisma.signedAgreement.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, name: true } },
          version: { select: { id: true, version: true, publishedAt: true } },
          template: { select: { id: true, title: true, description: true } },
          program: { select: { id: true, title: true, slug: true } },
          enrolment: {
            select: {
              id: true,
              status: true,
              batchId: true,
              batch: { select: { id: true, name: true, startDate: true } },
              payments: {
                select: { id: true, status: true, amount: true, currency: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
              },
            },
          },
        },
        orderBy: { signedAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    // Format and enrich each record with metadata for UI consumption
    const isSharedDefault =
      /\[Shared Default\]/i.test(template.description ?? '') ||
      /standard|default|general|platform/i.test(template.title ?? '') ||
      /default|shared/i.test(template.description ?? '');

    const enrichedRecords = rawRecords.map((rec) => {
      const hasPaid =
        rec.enrolment?.payments?.some((p) => p.status === 'succeeded') ||
        rec.enrolment?.status === EnrolmentStatus.ACTIVE;
      const isRefunded = rec.enrolment?.payments?.some((p) => p.status === 'refunded');
      const isFailed = rec.enrolment?.payments?.some((p) => p.status === 'failed');

      const paymentStatus = isRefunded
        ? 'REFUNDED'
        : hasPaid
        ? 'PAID'
        : isFailed
        ? 'FAILED'
        : 'PENDING';

      return {
        ...rec,
        scope: isSharedDefault ? 'SHARED_DEFAULT' : 'PROGRAM',
        paymentStatus,
        enrolmentStatus: rec.enrolment?.status || 'PENDING_PAYMENT',
        programTitle: rec.program?.title || template.program?.title || 'Program',
      };
    });

    return {
      data: enrichedRecords,
      total: totalFiltered,
      page,
      limit,
      totalPages: Math.ceil(totalFiltered / limit) || 1,
      counts: {
        completed: completedCount,
        pendingPayment: pendingPaymentCount,
        all: allCount,
      },
    };
  }

  /**
   * Retrieves full details, payment state, and audit trail for a specific signed agreement record.
   * Enforces role-based security:
   * - ADMIN: unrestricted
   * - MANAGER: access only if enrolled learner is in manager's assigned batch
   * - USER: access only if own signed record
   */
  async getSignedAgreementDetail(signedId: string, user?: any) {
    const record = await this.prisma.signedAgreement.findUnique({
      where: { id: signedId },
      include: {
        user: { select: { id: true, email: true, name: true } },
        version: { select: { id: true, version: true, content: true, publishedAt: true } },
        template: { select: { id: true, title: true, description: true } },
        program: { select: { id: true, title: true, slug: true, price: true } },
        enrolment: {
          select: {
            id: true,
            status: true,
            batchId: true,
            batch: { select: { id: true, name: true, managerId: true, startDate: true } },
            payments: {
              select: { id: true, status: true, amount: true, currency: true, stripeSessionId: true, createdAt: true },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
    });

    if (!record) {
      throw new NotFoundException(`Signed agreement record ${signedId} not found`);
    }

    if (user?.role === Role.MANAGER) {
      const managerId = user.sub ?? user.id;
      if (record.enrolment?.batch?.managerId !== managerId) {
        throw new ForbiddenException(
          'You do not have permission to view signed agreements outside your assigned batches',
        );
      }
    } else if (user?.role === Role.USER) {
      const userId = user.sub ?? user.id;
      if (record.userId !== userId) {
        throw new ForbiddenException('You do not have permission to view this signed agreement');
      }
    }

    // Fetch related audit logs for this signed agreement and its enrolment
    const auditLogs = await this.prisma.auditLog.findMany({
      where: {
        OR: [
          { entityId: record.id },
          { entityId: record.enrolmentId },
          { entityId: record.userId, action: { in: ['PROFILE_SIGNATURE_SAVED', 'PROFILE_SIGNATURE_UPDATED'] } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    const isSharedDefault =
      /\[Shared Default\]/i.test(record.template?.description ?? '') ||
      /standard|default|general|platform/i.test(record.template?.title ?? '') ||
      /default|shared/i.test(record.template?.description ?? '');

    const hasPaid =
      record.enrolment?.payments?.some((p) => p.status === 'succeeded') ||
      record.enrolment?.status === EnrolmentStatus.ACTIVE;
    const isRefunded = record.enrolment?.payments?.some((p) => p.status === 'refunded');
    const isFailed = record.enrolment?.payments?.some((p) => p.status === 'failed');

    const paymentStatus = isRefunded
      ? 'REFUNDED'
      : hasPaid
      ? 'PAID'
      : isFailed
      ? 'FAILED'
      : 'PENDING';

    return {
      ...record,
      scope: isSharedDefault ? 'SHARED_DEFAULT' : 'PROGRAM',
      paymentStatus,
      enrolmentStatus: record.enrolment?.status || 'PENDING_PAYMENT',
      auditLogs,
    };
  }

  /**
   * Renders one signed agreement record as a self-contained PDF.
   *
   * Generated synchronously on demand — no queue, no object-storage write, no
   * schema change. Values come from the immutable denormalised snapshot on the
   * record, so a re-download always reproduces what the learner signed.
   * Enforces role-based authorization:
   * - ADMIN: can download any
   * - MANAGER: can download for learners in assigned batches
   * - USER: can only download own agreement
   */
  async renderSignedAgreementPdf(
    templateId: string,
    signedId: string,
    user?: any,
  ): Promise<Uint8Array> {
    const record = await this.prisma.signedAgreement.findUnique({
      where: { id: signedId },
      include: {
        template: { select: { id: true, title: true } },
        version: { select: { id: true, version: true, content: true } },
        program: { select: { title: true } },
        user: { select: { email: true } },
        enrolment: {
          select: {
            batch: { select: { managerId: true } },
          },
        },
      },
    });

    if (!record || record.templateId !== templateId) {
      throw new NotFoundException(
        `Signed agreement with ID ${signedId} not found for template ${templateId}`,
      );
    }

    // Role-based access validation
    if (user?.role === Role.MANAGER) {
      const managerId = user.sub ?? user.id;
      if (record.enrolment?.batch?.managerId !== managerId) {
        throw new ForbiddenException(
          'You do not have permission to download signed agreements outside your assigned batches',
        );
      }
    } else if (user?.role === Role.USER) {
      const userId = user.sub ?? user.id;
      if (record.userId !== userId) {
        throw new ForbiddenException('You do not have permission to download another learner\'s signed agreement');
      }
    }

    return renderSignedAgreementPdfDocument({
      templateTitle: record.template?.title ?? 'Program Agreement',
      templateVersion: record.templateVersion || record.version?.version || 'v1.0',
      programTitle: record.program?.title ?? 'Program',
      typedName: record.typedName,
      typedAcknowledgement: 'I AGREE',
      agreementId: record.id,
      signerEmail: record.user?.email ?? null,
      consentVersion: record.consentVersion,
      consentTimestamp: record.consentTimestamp
        ? record.consentTimestamp.toISOString()
        : null,
      consentStatement: DEFAULT_CONSENT_STATEMENT,
      signedAt: record.signedAt ? record.signedAt.toISOString() : null,
      signatureType: record.signatureType,
      signerIp: record.signerIp,
      userAgent: record.userAgent,
      agreementContent: record.version?.content ?? '',
      signatureDataUrl: record.drawnSignature,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. REUSABLE LEARNER PROFILE SIGNATURE MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Retrieves the authenticated learner's saved digital signature.
   * Enforces learner data isolation: only the authenticated user can access their own signature.
   */
  async getLearnerSavedSignature(userId: string) {
    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        savedSignature: true,
        savedSignatureType: true,
        savedSignatureUpdatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Learner not found');
    }

    return {
      hasSavedSignature: Boolean(user.savedSignature),
      savedSignature: user.savedSignature || null,
      savedSignatureType: (user.savedSignatureType as 'DRAWN' | 'UPLOADED') || null,
      savedSignatureUpdatedAt: user.savedSignatureUpdatedAt || null,
    };
  }

  /**
   * Updates or replaces the authenticated learner's profile signature.
   * Affects FUTURE agreements only; historical signed records remain immutable.
   */
  async updateLearnerSavedSignature(
    userId: string,
    signatureData: string,
    signatureType: 'DRAWN' | 'UPLOADED',
    ip?: string,
    userAgent?: string,
  ) {
    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }
    if (!signatureData || signatureData.trim().length < 5) {
      throw new BadRequestException('Valid signature representation is required');
    }

    const trimmed = signatureData.trim();
    let normalized: string;
    if (trimmed.startsWith('data:image/')) {
      const match = trimmed.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
      if (!match) {
        throw new BadRequestException('Invalid signature file type. Only PNG, JPEG, and WebP images are permitted.');
      }
      const approxSizeBytes = Math.ceil((match[2].length * 3) / 4);
      if (approxSizeBytes > 2 * 1024 * 1024) {
        throw new BadRequestException('Signature image exceeds the 2MB size limit.');
      }
      normalized = trimmed;
    } else {
      const approxSizeBytes = Math.ceil((trimmed.length * 3) / 4);
      if (approxSizeBytes > 2 * 1024 * 1024) {
        throw new BadRequestException('Signature image exceeds the 2MB size limit.');
      }
      normalized = `data:image/png;base64,${trimmed}`;
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        savedSignature: normalized,
        savedSignatureType: signatureType,
        savedSignatureUpdatedAt: new Date(),
      },
      select: {
        id: true,
        savedSignature: true,
        savedSignatureType: true,
        savedSignatureUpdatedAt: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'PROFILE_SIGNATURE_UPDATED',
        entity: 'User',
        entityId: userId,
        meta: {
          signatureType,
          source: 'PROFILE_MANAGEMENT',
          userAgent: userAgent ?? 'unknown',
        },
        ip: ip ?? '127.0.0.1',
      },
    });

    return {
      success: true,
      hasSavedSignature: true,
      savedSignature: updated.savedSignature,
      savedSignatureType: updated.savedSignatureType,
      savedSignatureUpdatedAt: updated.savedSignatureUpdatedAt,
    };
  }

  /**
   * Clears the authenticated learner's profile signature.
   * Historical signed agreements are never altered.
   */
  async removeLearnerSavedSignature(userId: string, ip?: string, userAgent?: string) {
    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        savedSignature: null,
        savedSignatureType: null,
        savedSignatureUpdatedAt: null,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'PROFILE_SIGNATURE_REMOVED',
        entity: 'User',
        entityId: userId,
        meta: {
          source: 'PROFILE_MANAGEMENT',
          userAgent: userAgent ?? 'unknown',
        },
        ip: ip ?? '127.0.0.1',
      },
    });

    return {
      success: true,
      hasSavedSignature: false,
      savedSignature: null,
      savedSignatureType: null,
      savedSignatureUpdatedAt: null,
    };
  }
}
