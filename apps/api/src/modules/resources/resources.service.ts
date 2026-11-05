import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  Optional,
} from '@nestjs/common';
import { CacheHelperService } from '../../common/cache/cache-helper.service.js';
import { getResourcesKey, hashFilters, LMS_CACHE_TTLS } from '../../common/cache/cache-keys.constant.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { IObjectStorageProvider } from '../../common/interfaces/object-storage-provider.interface.js';
import { OBJECT_STORAGE_PROVIDER } from '../../common/interfaces/object-storage-provider.interface.js';
import { AuditLogService } from '../../common/audit/audit-log.service.js';
import {
  CreateResourceDto,
  UpdateResourceDto,
  RequestUploadUrlDto,
  CreateCategoryDto,
  UpdateCategoryDto,
  QueryResourceDto,
} from './dto/index.js';
import {
  Role,
  ResourceAccessScope,
  ResourceItemType,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';

@Injectable()
export class ResourcesService {
  private readonly logger = new Logger(ResourcesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE_PROVIDER)
    private readonly storageProvider: IObjectStorageProvider,
    private readonly auditLogService: AuditLogService,
    @Optional()
    private readonly cacheHelper?: CacheHelperService,
  ) {}

  // =========================================================================
  // 1. UPLOAD PRE-SIGNED URL
  // =========================================================================

  async generateUploadUrl(userId: string, userRole: Role, dto: RequestUploadUrlDto) {
    const extMatch = dto.fileName.match(/\.([a-zA-Z0-9]+)$/);
    const ext = extMatch ? extMatch[1].toLowerCase() : 'bin';

    const safeFileName = dto.fileName
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/\.[^/.]+$/, '');

    // Secure private storage key: resources/{timestamp}_{uuid}/{safeName}.{ext}
    const storageKey = `resources/${Date.now()}_${randomUUID().slice(0, 8)}/${safeFileName}.${ext}`;

    const uploadUrl = await this.storageProvider.getPresignedPutUrl(
      storageKey,
      dto.mimeType,
      300, // 5 minutes TTL
    );

    return {
      uploadUrl,
      storageKey,
      mimeType: dto.mimeType,
      fileSizeBytes: dto.fileSizeBytes,
      expiresInSeconds: 300,
    };
  }

  // =========================================================================
  // 2. RESOURCE CRUD (ADMIN / MANAGER)
  // =========================================================================

  async createResource(
    creatorId: string,
    userRole: Role,
    dto: CreateResourceDto,
    reason?: string,
  ) {
    // 1. Verify Category
    const category = await this.prisma.resourceCategory.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) {
      throw new NotFoundException('Resource category not found');
    }

    // 2. Manager Role Enforcements
    if (userRole === Role.MANAGER) {
      if (dto.accessScope !== ResourceAccessScope.BATCH || !dto.batchId) {
        throw new ForbiddenException(
          'Managers can only create resources scoped strictly to their assigned batches',
        );
      }
      const batch = await this.prisma.batch.findUnique({
        where: { id: dto.batchId },
      });
      if (!batch || batch.managerId !== creatorId) {
        throw new ForbiddenException(
          'You are not authorized to create resources for a batch you do not manage',
        );
      }
    }

    // 3. Scoping Relations Validation
    if (dto.accessScope === ResourceAccessScope.PROGRAM && !dto.programId) {
      throw new BadRequestException('programId is required for PROGRAM access scope');
    }
    if (dto.accessScope === ResourceAccessScope.BATCH && !dto.batchId) {
      throw new BadRequestException('batchId is required for BATCH access scope');
    }
    if (dto.accessScope === ResourceAccessScope.STEP_UNLOCKED && !dto.requiredStepId && !dto.stepTagNumber) {
      throw new BadRequestException(
        'requiredStepId or stepTagNumber is required for STEP_UNLOCKED access scope',
      );
    }

    if (dto.programId) {
      const prog = await this.prisma.program.findUnique({ where: { id: dto.programId } });
      if (!prog) throw new NotFoundException('Specified program not found');
    }

    if (dto.batchId) {
      const bat = await this.prisma.batch.findUnique({ where: { id: dto.batchId } });
      if (!bat) throw new NotFoundException('Specified batch not found');
    }

    if (dto.requiredStepId) {
      const stp = await this.prisma.step.findUnique({ where: { id: dto.requiredStepId } });
      if (!stp) throw new NotFoundException('Specified step not found');
    }

    // 4. Create in Database
    let finalDescription = dto.description?.trim();
    if (dto.viewOnlyProtected !== undefined) {
      finalDescription = `${finalDescription || ''} <!--viewOnlyProtected:${dto.viewOnlyProtected}-->`.trim();
    }

    const resource = await this.prisma.resourceItem.create({
      data: {
        title: dto.title.trim(),
        description: finalDescription,
        type: dto.type,
        categoryId: dto.categoryId,
        storageKey: dto.storageKey,
        mimeType: dto.mimeType,
        fileSizeBytes: dto.fileSizeBytes,
        durationSeconds: dto.durationSeconds,
        pageCount: dto.pageCount,
        stepTagNumber: dto.stepTagNumber,
        accessScope: dto.accessScope ?? ResourceAccessScope.ALL_ENROLLED,
        programId: dto.programId,
        batchId: dto.batchId,
        requiredStepId: dto.requiredStepId,
        isPublished: dto.isPublished ?? true,
        createdById: creatorId,
      },
      include: {
        category: true,
        program: { select: { id: true, title: true, slug: true } },
        batch: { select: { id: true, name: true } },
        requiredStep: { select: { id: true, title: true, sequence: true } },
      },
    });

    // 5. Write Audit Log
    await this.auditLogService.log(this.prisma, {
      actorId: creatorId,
      action: 'RESOURCE_CREATED',
      entityType: 'ResourceItem',
      entityId: resource.id,
      reason: reason?.trim() || `Created resource: ${resource.title}`,
      metadata: {
        title: resource.title,
        type: resource.type,
        accessScope: resource.accessScope,
        storageKey: resource.storageKey,
        viewOnlyProtected: dto.viewOnlyProtected ?? true,
      },
    });

    await this.cacheHelper?.invalidateTags(['resources']);
    return {
      ...resource,
      viewOnlyProtected: dto.viewOnlyProtected ?? true,
    };
  }

  async findAllAdmin(userId: string, userRole: Role, query: QueryResourceDto) {
    const where: Prisma.ResourceItemWhereInput = {};

    // 1. Manager Role Filter
    if (userRole === Role.MANAGER) {
      const managedBatches = await this.prisma.batch.findMany({
        where: { managerId: userId },
        select: { id: true },
      });
      const batchIds = managedBatches.map((b) => b.id);

      where.OR = [
        { accessScope: ResourceAccessScope.ALL_ENROLLED },
        { batchId: { in: batchIds } },
      ];
    }

    // 2. Query Filters
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.type) where.type = query.type;
    if (query.accessScope) where.accessScope = query.accessScope;
    if (query.programId) where.programId = query.programId;
    if (query.batchId) where.batchId = query.batchId;
    if (query.stepTagNumber !== undefined && !isNaN(query.stepTagNumber)) {
      where.stepTagNumber = query.stepTagNumber;
    }
    if (query.isPublished !== undefined) where.isPublished = query.isPublished;

    if (query.search?.trim()) {
      const q = query.search.trim();
      where.AND = [
        {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 50));
    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      this.prisma.resourceItem.count({ where }),
      this.prisma.resourceItem.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ createdAt: 'desc' }],
        include: {
          category: true,
          program: { select: { id: true, title: true, slug: true } },
          batch: { select: { id: true, name: true, managerId: true } },
          requiredStep: { select: { id: true, title: true, sequence: true } },
        },
      }),
    ]);

    const mappedItems = items.map((item) => ({
      ...item,
      viewOnlyProtected: !item.description?.includes('viewOnlyProtected:false'),
    }));

    return {
      items: mappedItems,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOneAdmin(id: string, userId: string, userRole: Role) {
    const resource = await this.prisma.resourceItem.findUnique({
      where: { id },
      include: {
        category: true,
        program: { select: { id: true, title: true, slug: true } },
        batch: { select: { id: true, name: true, managerId: true } },
        requiredStep: { select: { id: true, title: true, sequence: true } },
      },
    });

    if (!resource) {
      throw new NotFoundException('Resource item not found');
    }

    if (userRole === Role.MANAGER) {
      if (
        resource.accessScope !== ResourceAccessScope.ALL_ENROLLED &&
        resource.batch?.managerId !== userId
      ) {
        throw new ForbiddenException(
          'You are not authorized to view resources outside your assigned batches',
        );
      }
    }

    return {
      ...resource,
      viewOnlyProtected: !resource.description?.includes('viewOnlyProtected:false'),
    };
  }

  async updateResource(
    id: string,
    userId: string,
    userRole: Role,
    dto: UpdateResourceDto,
    reason?: string,
  ) {
    const existing = await this.findOneAdmin(id, userId, userRole);

    if (userRole === Role.MANAGER) {
      if (existing.accessScope === ResourceAccessScope.ALL_ENROLLED) {
        throw new ForbiddenException('Managers cannot modify global course content');
      }
      if (existing.batch?.managerId !== userId) {
        throw new ForbiddenException('Managers can only modify resources for their assigned batches');
      }
      if (dto.accessScope && dto.accessScope !== ResourceAccessScope.BATCH) {
        throw new ForbiddenException('Managers can only scope resources to their assigned batch');
      }
    }

    const updated = await this.prisma.resourceItem.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        description: dto.description?.trim(),
        type: dto.type,
        categoryId: dto.categoryId,
        storageKey: dto.storageKey,
        mimeType: dto.mimeType,
        fileSizeBytes: dto.fileSizeBytes,
        durationSeconds: dto.durationSeconds,
        pageCount: dto.pageCount,
        stepTagNumber: dto.stepTagNumber,
        accessScope: dto.accessScope,
        programId: dto.programId,
        batchId: dto.batchId,
        requiredStepId: dto.requiredStepId,
        isPublished: dto.isPublished,
      },
      include: {
        category: true,
        program: { select: { id: true, title: true, slug: true } },
        batch: { select: { id: true, name: true } },
        requiredStep: { select: { id: true, title: true, sequence: true } },
      },
    });

    await this.auditLogService.log(this.prisma, {
      actorId: userId,
      action: dto.accessScope && dto.accessScope !== existing.accessScope
        ? 'RESOURCE_SCOPE_CHANGED'
        : 'RESOURCE_UPDATED',
      entityType: 'ResourceItem',
      entityId: id,
      reason: reason?.trim() || `Updated resource: ${updated.title}`,
      metadata: {
        previousScope: existing.accessScope,
        newScope: updated.accessScope,
        changes: dto,
      },
    });

    await this.cacheHelper?.invalidateTags(['resources']);
    return updated;
  }

  async deleteResource(id: string, userId: string, userRole: Role, reason?: string) {
    const existing = await this.findOneAdmin(id, userId, userRole);

    if (userRole === Role.MANAGER) {
      if (existing.accessScope === ResourceAccessScope.ALL_ENROLLED) {
        throw new ForbiddenException('Managers cannot delete global course content');
      }
      if (existing.batch?.managerId !== userId) {
        throw new ForbiddenException('Managers can only delete resources for their assigned batches');
      }
    }

    // 1. Delete object from private storage
    try {
      await this.storageProvider.deleteObject(existing.storageKey);
    } catch (err: any) {
      this.logger.warn(`Failed to delete object ${existing.storageKey} from storage: ${err.message}`);
    }

    // 2. Delete from DB
    await this.prisma.resourceItem.delete({
      where: { id },
    });

    // 3. Audit log
    await this.auditLogService.log(this.prisma, {
      actorId: userId,
      action: 'RESOURCE_DELETED',
      entityType: 'ResourceItem',
      entityId: id,
      reason: reason?.trim() || `Deleted resource: ${existing.title}`,
      metadata: {
        title: existing.title,
        storageKey: existing.storageKey,
      },
    });

    await this.cacheHelper?.invalidateTags(['resources']);
    return { success: true, message: 'Resource deleted successfully' };
  }

  // =========================================================================
  // 3. CATEGORIES MANAGEMENT
  // =========================================================================

  async findAllCategories() {
    const fetcher = async () => {
      const categories = await this.prisma.resourceCategory.findMany({
        orderBy: { order: 'asc' },
        include: {
          _count: {
            select: { items: true },
          },
        },
      });

      return categories.map((c) => ({
        ...c,
        itemCount: c._count.items,
      }));
    };

    if (!this.cacheHelper) return fetcher();
    return this.cacheHelper.getOrSet('resources:categories', fetcher, 1800, ['resources']);
  }

  async createCategory(dto: CreateCategoryDto, userId: string) {
    const slug = dto.slug?.trim() || dto.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const existing = await this.prisma.resourceCategory.findUnique({
      where: { slug },
    });
    if (existing) {
      throw new BadRequestException(`Category with slug "${slug}" already exists`);
    }

    const category = await this.prisma.resourceCategory.create({
      data: {
        name: dto.name.trim(),
        slug,
        description: dto.description?.trim(),
        icon: dto.icon || 'Folder',
        order: dto.order ?? 0,
      },
    });

    await this.auditLogService.log(this.prisma, {
      actorId: userId,
      action: 'RESOURCE_CATEGORY_CREATED',
      entityType: 'ResourceCategory',
      entityId: category.id,
      metadata: { name: category.name, slug: category.slug },
    });

    await this.cacheHelper?.invalidateTags(['resources']);
    return category;
  }

  async updateCategory(id: string, dto: UpdateCategoryDto, userId: string) {
    const category = await this.prisma.resourceCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');

    const updated = await this.prisma.resourceCategory.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        slug: dto.slug?.trim(),
        description: dto.description?.trim(),
        icon: dto.icon,
        order: dto.order,
      },
    });

    await this.auditLogService.log(this.prisma, {
      actorId: userId,
      action: 'RESOURCE_CATEGORY_UPDATED',
      entityType: 'ResourceCategory',
      entityId: id,
      metadata: { changes: dto },
    });

    await this.cacheHelper?.invalidateTags(['resources']);
    return updated;
  }

  async deleteCategory(id: string, userId: string) {
    const category = await this.prisma.resourceCategory.findUnique({
      where: { id },
      include: { _count: { select: { items: true } } },
    });

    if (!category) throw new NotFoundException('Category not found');
    if (category._count.items > 0) {
      throw new BadRequestException(
        `Cannot delete category "${category.name}" because it contains ${category._count.items} resources. Move or delete them first.`,
      );
    }

    await this.prisma.resourceCategory.delete({ where: { id } });

    await this.auditLogService.log(this.prisma, {
      actorId: userId,
      action: 'RESOURCE_CATEGORY_DELETED',
      entityType: 'ResourceCategory',
      entityId: id,
      metadata: { name: category.name, slug: category.slug },
    });

    await this.cacheHelper?.invalidateTags(['resources']);
    return { success: true, message: 'Category deleted successfully' };
  }

  // =========================================================================
  // 4. LEARNER PORTAL RESOURCE ACCESS & SIGNED TOKENS
  // =========================================================================

  async findAllPortal(
    learnerId: string,
    query: {
      categoryId?: string;
      type?: ResourceItemType;
      stepTagNumber?: number;
      search?: string;
    },
  ) {
    const filterHash = hashFilters({
      categoryId: query.categoryId,
      type: query.type,
      stepTagNumber: query.stepTagNumber,
      search: query.search?.trim().toLowerCase(),
    });
    const cacheKey = getResourcesKey(learnerId, 'all', filterHash);

    const fetcher = async () => {
      // 1. Fetch learner's active enrolments with step progress
      const enrolments = await this.prisma.enrolment.findMany({
        where: {
          userId: learnerId,
          status: 'ACTIVE',
        },
        include: {
          stepProgress: true,
        },
      });

      if (enrolments.length === 0) {
        return [];
      }

      const programIds = new Set<string>();
      const batchIds = new Set<string>();
      const unlockedStepIds = new Set<string>();
      const unlockedStepSequences = new Set<number>();

      for (const e of enrolments) {
        if (e.programId) programIds.add(e.programId);
        if (e.batchId) batchIds.add(e.batchId);

        for (const sp of e.stepProgress) {
          if (sp.isUnlocked || sp.isCompleted) {
            unlockedStepIds.add(sp.stepId);
          }
        }
      }

      // Also get the sequence numbers for all unlocked steps
      if (unlockedStepIds.size > 0) {
        const steps = await this.prisma.step.findMany({
          where: { id: { in: Array.from(unlockedStepIds) } },
          select: { id: true, sequence: true },
        });
        for (const s of steps) {
          unlockedStepSequences.add(s.sequence);
        }
      }

      // 2. Query conditions matching learner's active enrolments & unlocked steps
      const orConditions: Prisma.ResourceItemWhereInput[] = [
        { accessScope: ResourceAccessScope.ALL_ENROLLED },
        { accessScope: ResourceAccessScope.PROGRAM, programId: { in: Array.from(programIds) } },
        { accessScope: ResourceAccessScope.BATCH, batchId: { in: Array.from(batchIds) } },
      ];

      if (unlockedStepIds.size > 0) {
        orConditions.push({
          accessScope: ResourceAccessScope.STEP_UNLOCKED,
          OR: [
            { requiredStepId: { in: Array.from(unlockedStepIds) } },
            { stepTagNumber: { in: Array.from(unlockedStepSequences) } },
          ],
        });
      }

      const where: Prisma.ResourceItemWhereInput = {
        isPublished: true,
        OR: orConditions,
      };

      if (query.categoryId) where.categoryId = query.categoryId;
      if (query.type) where.type = query.type;
      if (query.stepTagNumber !== undefined && !isNaN(query.stepTagNumber)) {
        where.stepTagNumber = query.stepTagNumber;
      }
      if (query.search?.trim()) {
        const q = query.search.trim();
        where.AND = [
          {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
            ],
          },
        ];
      }

      return this.prisma.resourceItem.findMany({
        where,
        orderBy: [{ stepTagNumber: 'asc' }, { createdAt: 'desc' }],
        include: {
          category: true,
          program: { select: { id: true, title: true, slug: true } },
          requiredStep: { select: { id: true, title: true, sequence: true } },
        },
      });
    };

    if (!this.cacheHelper) return fetcher();
    return this.cacheHelper.getOrSet(
      cacheKey,
      fetcher,
      LMS_CACHE_TTLS.RESOURCES_SECONDS,
      ['resources', `resources:${learnerId}`],
    );
  }

  async getPortalViewToken(resourceId: string, learnerId: string) {
    const resource = await this.prisma.resourceItem.findUnique({
      where: { id: resourceId },
      include: {
        category: true,
        requiredStep: true,
      },
    });

    if (!resource || !resource.isPublished) {
      throw new NotFoundException('Resource not found or unavailable');
    }

    const learner = await this.prisma.user.findUnique({
      where: { id: learnerId },
      select: { id: true, name: true, email: true },
    });

    if (!learner) {
      throw new NotFoundException('Learner record not found');
    }

    // 1. Fetch active enrolments
    const enrolments = await this.prisma.enrolment.findMany({
      where: {
        userId: learnerId,
        status: 'ACTIVE',
      },
      include: {
        stepProgress: true,
      },
    });

    if (enrolments.length === 0) {
      throw new ForbiddenException('You must have an active program enrolment to access resources');
    }

    // 2. Validate Access Scopes
    if (resource.accessScope === ResourceAccessScope.PROGRAM) {
      const hasProgram = enrolments.some((e) => e.programId === resource.programId);
      if (!hasProgram) {
        throw new ForbiddenException('This resource is restricted to learners enrolled in this specific program');
      }
    }

    if (resource.accessScope === ResourceAccessScope.BATCH) {
      const hasBatch = enrolments.some((e) => e.batchId === resource.batchId);
      if (!hasBatch) {
        throw new ForbiddenException('This resource is restricted to learners in this specific batch');
      }
    }

    if (resource.accessScope === ResourceAccessScope.STEP_UNLOCKED) {
      let isUnlocked = false;

      // Match either by requiredStepId or by stepTagNumber
      for (const e of enrolments) {
        for (const sp of e.stepProgress) {
          if (resource.requiredStepId && sp.stepId === resource.requiredStepId && (sp.isUnlocked || sp.isCompleted)) {
            isUnlocked = true;
            break;
          }
        }
        if (isUnlocked) break;
      }

      if (!isUnlocked && resource.stepTagNumber) {
        // Find steps in learner's enrolled programs with this sequence
        const matchingSteps = await this.prisma.step.findMany({
          where: {
            programId: { in: enrolments.map((e) => e.programId) },
            sequence: resource.stepTagNumber,
          },
          select: { id: true },
        });

        const stepIds = new Set(matchingSteps.map((s) => s.id));
        for (const e of enrolments) {
          for (const sp of e.stepProgress) {
            if (stepIds.has(sp.stepId) && (sp.isUnlocked || sp.isCompleted)) {
              isUnlocked = true;
              break;
            }
          }
          if (isUnlocked) break;
        }
      }

      if (!isUnlocked) {
        throw new ForbiddenException(
          `You have not unlocked the required step (${resource.stepTagNumber ? `Step ${resource.stepTagNumber}` : 'Required Step'}) to access this resource`,
        );
      }
    }

    // 3. Generate short-lived signed URL (300 seconds TTL)
    const signedUrl = await this.storageProvider.getPresignedGetUrl(resource.storageKey, 300);

    return {
      signedUrl,
      resource: {
        id: resource.id,
        title: resource.title,
        description: resource.description,
        type: resource.type,
        mimeType: resource.mimeType,
        pageCount: resource.pageCount,
        durationSeconds: resource.durationSeconds,
      },
      watermark: {
        learnerName: learner.name || 'Enrolled Learner',
        learnerEmail: learner.email,
        timestamp: new Date().toISOString(),
      },
      expiresInSeconds: 300,
    };
  }
}
