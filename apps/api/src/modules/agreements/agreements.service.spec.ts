import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ContentStatus } from '@prisma/client';
import { AgreementsService } from './agreements.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('D1-039: Agreement Template Versioning & Immutability Engine', () => {
  let service: AgreementsService;
  let prismaMock: any;

  const mockProgram = {
    id: 'prog-11-steps-uuid',
    title: '11 Steps to U',
    slug: '11-steps-to-u',
  };

  const mockTemplate = {
    id: 'tpl-agreement-uuid',
    programId: mockProgram.id,
    title: '11 Steps to U Enrollment & Code of Conduct Agreement',
    description: 'Code of conduct terms',
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    updatedAt: new Date('2026-10-01T10:00:00.000Z'),
  };

  const mockVersion1 = {
    id: 'ver-1-0-uuid',
    templateId: mockTemplate.id,
    version: 'v1.0',
    content: 'Initial Terms and Conditions v1.0',
    changelog: 'Initial version',
    status: ContentStatus.PUBLISHED,
    publishedAt: new Date('2026-10-01T10:05:00.000Z'),
    createdById: 'admin-user-uuid',
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    updatedAt: new Date('2026-10-01T10:05:00.000Z'),
  };

  const mockVersion2 = {
    id: 'ver-2-0-uuid',
    templateId: mockTemplate.id,
    version: 'v2.0',
    content: 'Updated Terms and Conditions v2.0 with expanded confidentiality',
    changelog: 'Updated confidentiality policy',
    status: ContentStatus.PUBLISHED,
    publishedAt: new Date('2026-10-07T10:00:00.000Z'),
    createdById: 'admin-user-uuid',
    createdAt: new Date('2026-10-07T09:30:00.000Z'),
    updatedAt: new Date('2026-10-07T10:00:00.000Z'),
  };

  beforeEach(() => {
    prismaMock = {
      program: {
        findUnique: vi.fn(),
      },
      agreementTemplate: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      agreementTemplateVersion: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        delete: vi.fn(),
      },
      signedAgreement: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        count: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => {
        if (typeof callback === 'function') {
          return callback(prismaMock);
        }
        return Promise.all(callback);
      }),
    };

    service = new AgreementsService(prismaMock as unknown as PrismaService);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. CREATE AGREEMENT TEMPLATE
  // ─────────────────────────────────────────────────────────────────────────────
  describe('1. Create Agreement Template', () => {
    it('creates a new agreement template linked to a program with audit logging', async () => {
      prismaMock.program.findUnique.mockResolvedValue(mockProgram);
      prismaMock.agreementTemplate.create.mockResolvedValue({
        ...mockTemplate,
        program: mockProgram,
        versions: [],
      });
      prismaMock.auditLog.create.mockResolvedValue({ id: 'audit-1' });

      const result = await service.createTemplate(
        {
          programId: mockProgram.id,
          title: '11 Steps to U Enrollment & Code of Conduct Agreement',
          description: 'Code of conduct terms',
        },
        'admin-user-uuid',
        '127.0.0.1',
      );

      expect(prismaMock.program.findUnique).toHaveBeenCalledWith({
        where: { id: mockProgram.id },
        select: { id: true, title: true },
      });
      expect(prismaMock.agreementTemplate.create).toHaveBeenCalledWith({
        data: {
          programId: mockProgram.id,
          title: '11 Steps to U Enrollment & Code of Conduct Agreement',
          description: 'Code of conduct terms',
        },
        include: {
          program: { select: { id: true, title: true, slug: true } },
          versions: true,
        },
      });
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorId: 'admin-user-uuid',
          action: 'AGREEMENT_TEMPLATE_CREATED',
          entity: 'AgreementTemplate',
          entityId: mockTemplate.id,
        }),
      });
      expect(result.id).toBe(mockTemplate.id);
    });

    it('rejects creation if the specified program does not exist', async () => {
      prismaMock.program.findUnique.mockResolvedValue(null);

      await expect(
        service.createTemplate({
          programId: 'non-existent-program',
          title: 'Agreement',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. CREATE V1.0
  // ─────────────────────────────────────────────────────────────────────────────
  describe('2. Create v1.0', () => {
    it('creates v1.0 as a published agreement version and logs audit event', async () => {
      prismaMock.agreementTemplate.findUnique.mockResolvedValue(mockTemplate);
      prismaMock.agreementTemplateVersion.findUnique.mockResolvedValue(null);
      prismaMock.agreementTemplateVersion.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.agreementTemplateVersion.create.mockResolvedValue({
        ...mockVersion1,
        createdBy: { id: 'admin-user-uuid', name: 'Admin', email: 'admin@test.com' },
      });
      prismaMock.auditLog.create.mockResolvedValue({ id: 'audit-2' });

      const result = await service.createVersion(
        mockTemplate.id,
        {
          version: 'v1.0',
          content: 'Initial Terms and Conditions v1.0',
          changelog: 'Initial version',
          status: ContentStatus.PUBLISHED,
        },
        'admin-user-uuid',
        '127.0.0.1',
      );

      expect(result.version).toBe('v1.0');
      expect(result.status).toBe(ContentStatus.PUBLISHED);
      expect(prismaMock.agreementTemplateVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          templateId: mockTemplate.id,
          version: 'v1.0',
          content: 'Initial Terms and Conditions v1.0',
          status: ContentStatus.PUBLISHED,
          publishedAt: expect.any(Date),
        }),
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
      });
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'AGREEMENT_VERSION_PUBLISHED',
          entity: 'AgreementTemplateVersion',
          entityId: mockVersion1.id,
        }),
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. CREATE V2.0 & LEAVE V1.0 UNCHANGED
  // ─────────────────────────────────────────────────────────────────────────────
  describe('3. Create v2.0 without altering v1.0', () => {
    it('creates v2.0 in a separate row and archives v1.0 without modifying its historical content', async () => {
      prismaMock.agreementTemplate.findUnique.mockResolvedValue(mockTemplate);
      prismaMock.agreementTemplateVersion.findUnique.mockResolvedValue(null);
      prismaMock.agreementTemplateVersion.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.agreementTemplateVersion.create.mockResolvedValue({
        ...mockVersion2,
        createdBy: { id: 'admin-user-uuid', name: 'Admin', email: 'admin@test.com' },
      });
      prismaMock.auditLog.create.mockResolvedValue({ id: 'audit-3' });

      const result = await service.createVersion(
        mockTemplate.id,
        {
          version: 'v2.0',
          content: 'Updated Terms and Conditions v2.0 with expanded confidentiality',
          changelog: 'Updated confidentiality policy',
          status: ContentStatus.PUBLISHED,
        },
        'admin-user-uuid',
      );

      expect(result.version).toBe('v2.0');
      expect(prismaMock.agreementTemplateVersion.updateMany).toHaveBeenCalledWith({
        where: {
          templateId: mockTemplate.id,
          status: ContentStatus.PUBLISHED,
        },
        data: {
          status: ContentStatus.ARCHIVED,
        },
      });
      expect(prismaMock.agreementTemplateVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          templateId: mockTemplate.id,
          version: 'v2.0',
          content: 'Updated Terms and Conditions v2.0 with expanded confidentiality',
        }),
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. BOTH VERSIONS REMAIN INDEPENDENTLY RETRIEVABLE
  // ─────────────────────────────────────────────────────────────────────────────
  describe('4. Independent Queryability of Historical Versions', () => {
    it('returns both v1.0 and v2.0 when querying all template versions', async () => {
      prismaMock.agreementTemplate.findUnique.mockResolvedValue(mockTemplate);
      prismaMock.agreementTemplateVersion.findMany.mockResolvedValue([
        { ...mockVersion2, _count: { signedAgreements: 0 } },
        { ...mockVersion1, _count: { signedAgreements: 1 } },
      ]);

      const versions = await service.findAllVersions(mockTemplate.id);

      expect(versions).toHaveLength(2);
      expect(versions[0].version).toBe('v2.0');
      expect(versions[1].version).toBe('v1.0');
      expect(versions[1]._count.signedAgreements).toBe(1);
    });

    it('retrieves historical v1.0 specifically by its ID with full legal content', async () => {
      prismaMock.agreementTemplateVersion.findFirst.mockResolvedValue({
        ...mockVersion1,
        template: {
          id: mockTemplate.id,
          title: mockTemplate.title,
          programId: mockProgram.id,
          program: mockProgram,
        },
        createdBy: { id: 'admin-user-uuid', name: 'Admin', email: 'admin@test.com' },
        _count: { signedAgreements: 1 },
      });

      const retrieved = await service.findVersionById(mockTemplate.id, mockVersion1.id);

      expect(retrieved.id).toBe(mockVersion1.id);
      expect(retrieved.version).toBe('v1.0');
      expect(retrieved.content).toBe('Initial Terms and Conditions v1.0');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. DUPLICATE VERSION REJECTION
  // ─────────────────────────────────────────────────────────────────────────────
  describe('5. Duplicate Version Enforcement', () => {
    it('rejects creating a version tag that already exists for this template', async () => {
      prismaMock.agreementTemplate.findUnique.mockResolvedValue(mockTemplate);
      prismaMock.agreementTemplateVersion.findUnique.mockResolvedValue(mockVersion1);

      await expect(
        service.createVersion(mockTemplate.id, {
          version: 'v1.0',
          content: 'Some other content',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.createVersion(mockTemplate.id, {
          version: 'v1.0',
          content: 'Some other content',
        }),
      ).rejects.toThrow(/already exists/i);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. HISTORICAL / PUBLISHED VERSION CANNOT BE MUTATED
  // ─────────────────────────────────────────────────────────────────────────────
  describe('6. Historical / Published Version Immutability', () => {
    it('rejects modifying content of a published version', async () => {
      prismaMock.agreementTemplateVersion.findFirst.mockResolvedValue({
        ...mockVersion1,
        status: ContentStatus.PUBLISHED,
        _count: { signedAgreements: 0 },
      });

      await expect(
        service.updateVersion(mockTemplate.id, mockVersion1.id, {
          content: 'Attempt to tamper with published legal terms',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.updateVersion(mockTemplate.id, mockVersion1.id, {
          content: 'Attempt to tamper with published legal terms',
        }),
      ).rejects.toThrow(/immutable/i);
    });

    it('rejects modifying content of an archived historical version', async () => {
      prismaMock.agreementTemplateVersion.findFirst.mockResolvedValue({
        ...mockVersion1,
        status: ContentStatus.ARCHIVED,
        _count: { signedAgreements: 0 },
      });

      await expect(
        service.updateVersion(mockTemplate.id, mockVersion1.id, {
          content: 'Attempt to tamper with archived legal terms',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects modifying any version that has existing signed agreements', async () => {
      prismaMock.agreementTemplateVersion.findFirst.mockResolvedValue({
        ...mockVersion1,
        status: ContentStatus.DRAFT, // even if draft
        _count: { signedAgreements: 1 }, // has 1 signed agreement
      });

      await expect(
        service.updateVersion(mockTemplate.id, mockVersion1.id, {
          content: 'Attempt to modify version signed by learners',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.updateVersion(mockTemplate.id, mockVersion1.id, {
          content: 'Attempt to modify version signed by learners',
        }),
      ).rejects.toThrow(/historical signed agreements/i);
    });

    it('allows modifying a draft version with zero signed agreements', async () => {
      const draftVersion = {
        ...mockVersion1,
        status: ContentStatus.DRAFT,
        _count: { signedAgreements: 0 },
      };
      prismaMock.agreementTemplateVersion.findFirst.mockResolvedValue(draftVersion);
      prismaMock.agreementTemplateVersion.update.mockResolvedValue({
        ...draftVersion,
        content: 'Refined draft legal terms',
      });
      prismaMock.auditLog.create.mockResolvedValue({ id: 'audit-4' });

      const updated = await service.updateVersion(mockTemplate.id, draftVersion.id, {
        content: 'Refined draft legal terms',
      });

      expect(updated.content).toBe('Refined draft legal terms');
      expect(prismaMock.agreementTemplateVersion.update).toHaveBeenCalledWith({
        where: { id: draftVersion.id },
        data: expect.objectContaining({
          content: 'Refined draft legal terms',
        }),
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. HISTORICAL SIGNED AGREEMENTS REMAIN TIED TO ORIGINAL VERSION
  // ─────────────────────────────────────────────────────────────────────────────
  describe('7. Permanent Association of Signed Agreements to Original Version', () => {
    it('prevents deleting an agreement version that has signed agreements', async () => {
      prismaMock.agreementTemplateVersion.findFirst.mockResolvedValue({
        ...mockVersion1,
        _count: { signedAgreements: 5 },
      });

      await expect(
        service.deleteVersion(mockTemplate.id, mockVersion1.id),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.deleteVersion(mockTemplate.id, mockVersion1.id),
      ).rejects.toThrow(/historical signed agreements/i);
    });

    it('prevents deleting an active published agreement version', async () => {
      prismaMock.agreementTemplateVersion.findFirst.mockResolvedValue({
        ...mockVersion1,
        status: ContentStatus.PUBLISHED,
        _count: { signedAgreements: 0 },
      });

      await expect(
        service.deleteVersion(mockTemplate.id, mockVersion1.id),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.deleteVersion(mockTemplate.id, mockVersion1.id),
      ).rejects.toThrow(/published agreement version/i);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. ACTIVE AGREEMENT RESOLUTION FOR PROGRAM (LEARNER GATING & DISPLAY)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('8. Active Agreement Query for Program', () => {
    it('returns the latest published agreement version for a program', async () => {
      prismaMock.agreementTemplate.findFirst.mockResolvedValue({
        ...mockTemplate,
        program: mockProgram,
        versions: [mockVersion2],
      });

      const active = await service.getActiveVersionForProgram(mockProgram.id);

      expect(active.templateId).toBe(mockTemplate.id);
      expect(active.versionId).toBe(mockVersion2.id);
      expect(active.version).toBe('v2.0');
      expect(active.content).toBe(mockVersion2.content);
    });

    it('throws NotFoundException if program has no published agreement template', async () => {
      prismaMock.agreementTemplate.findFirst.mockResolvedValue({
        ...mockTemplate,
        program: mockProgram,
        versions: [],
      });

      await expect(
        service.getActiveVersionForProgram('prog-no-agreement'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
