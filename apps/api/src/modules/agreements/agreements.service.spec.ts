import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AgreementStatus,
  ContentStatus,
  EnrolmentStatus,
  Role,
} from '@prisma/client';
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
      enrolment: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      signedAgreement: {
        create: vi.fn(),
        update: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        count: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
        update: vi.fn(),
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
  // 1B. UPDATE AGREEMENT TEMPLATE & SCOPE IMMUTABILITY
  // ─────────────────────────────────────────────────────────────────────────────
  describe('1B. Update Agreement Template & Scope Immutability', () => {
    it('allows updating title and description when signatures exist', async () => {
      prismaMock.agreementTemplate.findUnique.mockResolvedValue(mockTemplate);
      prismaMock.signedAgreement.count.mockResolvedValue(5);
      prismaMock.agreementTemplate.update.mockResolvedValue({
        ...mockTemplate,
        title: 'Updated Title',
        description: 'Updated Description',
      });
      prismaMock.auditLog.create.mockResolvedValue({ id: 'audit-upd-1' });

      const result = await service.updateTemplate(
        mockTemplate.id,
        { title: 'Updated Title', description: 'Updated Description' },
        'admin-user-uuid',
        '127.0.0.1',
      );

      expect(result.title).toBe('Updated Title');
      expect(prismaMock.agreementTemplate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockTemplate.id },
          data: expect.objectContaining({
            title: 'Updated Title',
            description: 'Updated Description',
          }),
        }),
      );
    });

    it('rejects attempt to change programId when signatures exist with 409 Conflict', async () => {
      prismaMock.agreementTemplate.findUnique.mockResolvedValue(mockTemplate);
      prismaMock.signedAgreement.count.mockResolvedValue(3);

      await expect(
        service.updateTemplate(
          mockTemplate.id,
          { programId: 'new-program-uuid' },
          'admin-user-uuid',
          '127.0.0.1',
        ),
      ).rejects.toThrow(
        new ConflictException(
          'Cannot reassign program scope for a template with existing signed learner records',
        ),
      );
    });

    it('rejects attempt to toggle shared-default scope when signatures exist with 409 Conflict', async () => {
      prismaMock.agreementTemplate.findUnique.mockResolvedValue(mockTemplate);
      prismaMock.signedAgreement.count.mockResolvedValue(2);

      await expect(
        service.updateTemplate(
          mockTemplate.id,
          { title: 'Standard Platform Shared Agreement' },
          'admin-user-uuid',
          '127.0.0.1',
        ),
      ).rejects.toThrow(
        new ConflictException(
          'Cannot reassign program scope for a template with existing signed learner records',
        ),
      );
    });

    it('allows changing programId when no signatures exist', async () => {
      const newProgram = { id: 'prog-2-uuid', title: 'Course 2', slug: 'course-2' };
      prismaMock.agreementTemplate.findUnique.mockResolvedValue(mockTemplate);
      prismaMock.signedAgreement.count.mockResolvedValue(0);
      prismaMock.program.findUnique.mockResolvedValue(newProgram);
      prismaMock.agreementTemplate.update.mockResolvedValue({
        ...mockTemplate,
        programId: newProgram.id,
      });
      prismaMock.auditLog.create.mockResolvedValue({ id: 'audit-upd-2' });

      const result = await service.updateTemplate(
        mockTemplate.id,
        { programId: newProgram.id },
        'admin-user-uuid',
        '127.0.0.1',
      );

      expect(result.programId).toBe(newProgram.id);
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

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. D1-040: LEARNER AGREEMENT SIGNING FLOW (POST /agreements/sign)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('9. D1-040: Learner Agreement Signing Flow', () => {
    const learnerUser = { id: 'user-learner-uuid', role: Role.USER };
    const foreignUser = { id: 'user-foreign-uuid', role: Role.USER };

    const mockEnrolment = {
      id: 'enrol-active-uuid',
      userId: learnerUser.id,
      programId: mockProgram.id,
      status: EnrolmentStatus.PENDING_AGREEMENT,
      program: mockProgram,
      signedAgreement: null,
    };

    const validSignDto = {
      enrolmentId: mockEnrolment.id,
      consentGiven: true,
      typedName: 'Jane Doe',
      drawnSignature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
    };

    it('signs agreement successfully with valid input, capturing server timestamp, IP, and user-agent', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        ...mockEnrolment,
      });

      prismaMock.agreementTemplate.findFirst.mockResolvedValue({
        ...mockTemplate,
        versions: [mockVersion2],
      });

      const mockCreatedSignedAgreement = {
        id: 'signed-ag-uuid',
        enrolmentId: mockEnrolment.id,
        userId: learnerUser.id,
        programId: mockProgram.id,
        templateId: mockTemplate.id,
        versionId: mockVersion2.id,
        templateVersion: mockVersion2.version,
        consentGiven: true,
        typedName: validSignDto.typedName,
        drawnSignature: validSignDto.drawnSignature,
        signerIp: '192.168.1.100',
        userAgent: 'Mozilla/5.0 Chrome/120.0',
        status: AgreementStatus.SIGNED,
        signedAt: new Date(),
        signedPdfUrl: null,
        version: mockVersion2,
        template: mockTemplate,
      };

      prismaMock.signedAgreement.create.mockResolvedValue(mockCreatedSignedAgreement);
      prismaMock.enrolment.update.mockResolvedValue({
        ...mockEnrolment,
        status: EnrolmentStatus.ACTIVE,
      });
      prismaMock.auditLog.create.mockResolvedValue({ id: 'audit-1' });

      const result = await service.signAgreement(
        validSignDto,
        learnerUser,
        '192.168.1.100',
        'Mozilla/5.0 Chrome/120.0',
      );

      expect(result.id).toBe('signed-ag-uuid');
      expect(result.status).toBe(AgreementStatus.SIGNED);
      expect(result.versionId).toBe(mockVersion2.id);
      expect(result.templateVersion).toBe('v2.0');
      expect(result.signerIp).toBe('192.168.1.100');
      expect(result.userAgent).toBe('Mozilla/5.0 Chrome/120.0');
      expect(result.consentGiven).toBe(true);
      expect(result.typedName).toBe('Jane Doe');
      expect(result.signedAt).toBeInstanceOf(Date);

      // Verify enrolment transitioned from PENDING_AGREEMENT to ACTIVE
      expect(prismaMock.enrolment.update).toHaveBeenCalledWith({
        where: { id: mockEnrolment.id },
        data: { status: EnrolmentStatus.ACTIVE },
      });

      // Verify signed agreement was created in DB
      expect(prismaMock.signedAgreement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          enrolmentId: mockEnrolment.id,
          userId: learnerUser.id,
          programId: mockProgram.id,
          templateId: mockTemplate.id,
          versionId: mockVersion2.id,
          templateVersion: 'v2.0',
          consentGiven: true,
          typedName: 'Jane Doe',
          signerIp: '192.168.1.100',
          userAgent: 'Mozilla/5.0 Chrome/120.0',
          status: AgreementStatus.SIGNED,
        }),
        include: { version: true, template: true },
      });
    });

    it('rejects signing when consentGiven is false with BadRequestException', async () => {
      await expect(
        service.signAgreement(
          { ...validSignDto, consentGiven: false },
          learnerUser,
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.signAgreement(
          { ...validSignDto, consentGiven: false },
          learnerUser,
        ),
      ).rejects.toThrow(/consent/i);
    });

    it('rejects signing when typedName is empty or too short with BadRequestException', async () => {
      await expect(
        service.signAgreement(
          { ...validSignDto, typedName: ' ' },
          learnerUser,
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.signAgreement(
          { ...validSignDto, typedName: 'J' },
          learnerUser,
        ),
      ).rejects.toThrow(/typed full name/i);
    });

    it('rejects signing when drawnSignature is missing or too short with BadRequestException', async () => {
      await expect(
        service.signAgreement(
          { ...validSignDto, drawnSignature: 'abc' },
          learnerUser,
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.signAgreement(
          { ...validSignDto, drawnSignature: '' },
          learnerUser,
        ),
      ).rejects.toThrow(/drawn signature/i);
    });

    it('rejects unauthenticated caller with UnauthorizedException', async () => {
      await expect(
        service.signAgreement(validSignDto, null),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects signing when enrolment does not exist with NotFoundException', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue(null);

      await expect(
        service.signAgreement(
          { ...validSignDto, enrolmentId: 'non-existent-id' },
          learnerUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('IDOR defense: rejects learner signing another learner enrolment with ForbiddenException', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        ...mockEnrolment,
        userId: learnerUser.id, // belongs to learnerUser
      });

      // foreignUser attempts to sign learnerUser's enrolment
      await expect(
        service.signAgreement(validSignDto, foreignUser),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.signAgreement(validSignDto, foreignUser),
      ).rejects.toThrow(/not authorized/i);
    });

    it('allows signing when enrolment status is PENDING_PAYMENT in Agreement-First flow, keeping enrolment PENDING_PAYMENT', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        ...mockEnrolment,
        status: EnrolmentStatus.PENDING_PAYMENT,
      });
      prismaMock.agreementTemplate.findFirst.mockResolvedValue({
        ...mockTemplate,
        versions: [mockVersion2],
      });
      prismaMock.signedAgreement.create.mockResolvedValue({
        id: 'signed-prepay-uuid',
        enrolmentId: mockEnrolment.id,
        userId: learnerUser.id,
        programId: mockProgram.id,
        templateId: mockTemplate.id,
        versionId: mockVersion2.id,
        templateVersion: mockVersion2.version,
        consentGiven: true,
        typedName: validSignDto.typedName,
        drawnSignature: validSignDto.drawnSignature,
        status: AgreementStatus.SIGNED,
        signedAt: new Date(),
        version: mockVersion2,
        template: mockTemplate,
      });
      prismaMock.auditLog.create.mockResolvedValue({ id: 'audit-prepay' });

      const res = await service.signAgreement(validSignDto, learnerUser);

      expect(res.status).toBe(AgreementStatus.SIGNED);
      expect(res.enrolmentStatus).toBe(EnrolmentStatus.PENDING_PAYMENT);
      expect(res.nextStep).toBe('CHECKOUT');
      expect(res.checkoutUrl).toContain(mockEnrolment.id);
    });

    it('rejects signing when enrolment status is REVOKED with BadRequestException', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        ...mockEnrolment,
        status: EnrolmentStatus.REVOKED,
      });

      await expect(
        service.signAgreement(validSignDto, learnerUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects signing when enrolment status is WAITLIST with BadRequestException', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        ...mockEnrolment,
        status: EnrolmentStatus.WAITLIST,
      });

      await expect(
        service.signAgreement(validSignDto, learnerUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('immutability & conflict: rejects repeated signing when agreement is already SIGNED with ConflictException', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        ...mockEnrolment,
        signedAgreement: {
          id: 'existing-signed-uuid',
          status: AgreementStatus.SIGNED,
          signedAt: new Date('2026-10-06T12:00:00Z'),
        },
      });

      await expect(
        service.signAgreement(validSignDto, learnerUser),
      ).rejects.toThrow(ConflictException);

      await expect(
        service.signAgreement(validSignDto, learnerUser),
      ).rejects.toThrow(/already been signed/i);
    });

    it('rejects signing with version belonging to a different program template with BadRequestException', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        ...mockEnrolment,
      });

      prismaMock.agreementTemplate.findFirst.mockResolvedValue({
        ...mockTemplate,
        versions: [mockVersion2],
      });

      // version belongs to a foreign template
      prismaMock.agreementTemplateVersion.findUnique.mockResolvedValue({
        id: 'foreign-version-uuid',
        templateId: 'different-template-uuid',
        version: 'v1.0',
        status: ContentStatus.PUBLISHED,
      });

      await expect(
        service.signAgreement(
          { ...validSignDto, versionId: 'foreign-version-uuid' },
          learnerUser,
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.signAgreement(
          { ...validSignDto, versionId: 'foreign-version-uuid' },
          learnerUser,
        ),
      ).rejects.toThrow(/does not belong to this program/i);
    });

    it('rejects signing with an unpublished draft version with BadRequestException', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        ...mockEnrolment,
      });

      prismaMock.agreementTemplate.findFirst.mockResolvedValue({
        ...mockTemplate,
        versions: [mockVersion2], // published version
      });

      // draft version on the same template
      prismaMock.agreementTemplateVersion.findUnique.mockResolvedValue({
        id: 'draft-version-uuid',
        templateId: mockTemplate.id,
        version: 'v3.0-draft',
        status: ContentStatus.DRAFT,
      });

      await expect(
        service.signAgreement(
          { ...validSignDto, versionId: 'draft-version-uuid' },
          learnerUser,
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.signAgreement(
          { ...validSignDto, versionId: 'draft-version-uuid' },
          learnerUser,
        ),
      ).rejects.toThrow(/not currently published/i);
    });

    it('updates existing pending agreement record to SIGNED when already pre-created', async () => {
      const existingPendingAgreement = {
        id: 'pending-ag-uuid',
        enrolmentId: mockEnrolment.id,
        status: AgreementStatus.PENDING,
      };

      prismaMock.enrolment.findUnique.mockResolvedValue({
        ...mockEnrolment,
        signedAgreement: existingPendingAgreement,
      });

      prismaMock.agreementTemplate.findFirst.mockResolvedValue({
        ...mockTemplate,
        versions: [mockVersion2],
      });

      prismaMock.signedAgreement.update.mockResolvedValue({
        ...existingPendingAgreement,
        status: AgreementStatus.SIGNED,
        versionId: mockVersion2.id,
        templateVersion: 'v2.0',
        consentGiven: true,
        typedName: 'Jane Doe',
        drawnSignature: validSignDto.drawnSignature,
        signerIp: '127.0.0.1',
        userAgent: 'test-agent',
        signedAt: new Date(),
        version: mockVersion2,
        template: mockTemplate,
      });
      prismaMock.enrolment.update.mockResolvedValue({
        ...mockEnrolment,
        status: EnrolmentStatus.ACTIVE,
      });
      prismaMock.auditLog.create.mockResolvedValue({ id: 'audit-pending' });

      const res = await service.signAgreement(
        validSignDto,
        learnerUser,
        '127.0.0.1',
        'test-agent',
      );

      expect(res.status).toBe(AgreementStatus.SIGNED);
      expect(prismaMock.signedAgreement.update).toHaveBeenCalledWith({
        where: { id: 'pending-ag-uuid' },
        data: expect.objectContaining({
          status: AgreementStatus.SIGNED,
          versionId: mockVersion2.id,
        }),
        include: { version: true, template: true },
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 10. D1-042: IMMUTABLE AUDIT RECORD ON SIGNING
  // ─────────────────────────────────────────────────────────────────────────────
  describe('10. D1-042: Immutable Audit Record on Signing', () => {
    const learnerUser = { id: 'user-learner-uuid', role: Role.USER };

    const mockEnrolment = {
      id: 'enrol-active-uuid',
      userId: learnerUser.id,
      programId: mockProgram.id,
      status: EnrolmentStatus.PENDING_AGREEMENT,
      program: mockProgram,
      signedAgreement: null,
    };

    const validSignDto = {
      enrolmentId: mockEnrolment.id,
      consentGiven: true,
      typedName: 'Jane Doe',
      drawnSignature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
    };

    it('creates an immutable AuditLog entry in the same transaction upon signing', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        ...mockEnrolment,
      });

      prismaMock.agreementTemplate.findFirst.mockResolvedValue({
        ...mockTemplate,
        versions: [mockVersion2],
      });

      prismaMock.signedAgreement.create.mockResolvedValue({
        id: 'signed-ag-uuid-2',
        enrolmentId: mockEnrolment.id,
        status: AgreementStatus.SIGNED,
        version: mockVersion2,
        template: mockTemplate,
      });
      prismaMock.enrolment.update.mockResolvedValue({
        ...mockEnrolment,
        status: EnrolmentStatus.ACTIVE,
      });
      prismaMock.auditLog.create.mockResolvedValue({ id: 'audit-log-uuid' });

      await service.signAgreement(
        validSignDto,
        learnerUser,
        '10.0.0.42',
        'Safari/17.0 macOS',
      );

      expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorId: learnerUser.id,
          action: 'AGREEMENT_SIGNED',
          entity: 'SignedAgreement',
          entityId: 'signed-ag-uuid-2',
          ip: '10.0.0.42',
          meta: expect.objectContaining({
            enrolmentId: mockEnrolment.id,
            programId: mockProgram.id,
            templateId: mockTemplate.id,
            versionId: mockVersion2.id,
            version: 'v2.0',
            typedName: 'Jane Doe',
            userAgent: 'Safari/17.0 macOS',
            consentGiven: true,
            signedAt: expect.any(String),
          }),
        }),
      });
    });

    it('failed signing due to validation or permission error does NOT create an AuditLog entry', async () => {
      prismaMock.auditLog.create.mockClear();

      // Missing consent -> throws
      await expect(
        service.signAgreement(
          { ...validSignDto, consentGiven: false },
          learnerUser,
        ),
      ).rejects.toThrow();

      expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
    });

    it('application service provides no delete or update operations for AuditLog records', () => {
      // Confirm that AgreementsService exposes no audit mutation or deletion APIs
      expect((service as any).deleteAuditLog).toBeUndefined();
      expect((service as any).updateAuditLog).toBeUndefined();
      expect((service as any).deleteSigningAudit).toBeUndefined();
      expect((service as any).modifySigningAudit).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 11. QUERY SIGNED AGREEMENT FOR ENROLMENT
  // ─────────────────────────────────────────────────────────────────────────────
  describe('11. Query Signed Agreement for Enrolment', () => {
    const learnerUser = { id: 'user-learner-uuid', role: Role.USER };
    const foreignUser = { id: 'user-foreign-uuid', role: Role.USER };
    const adminUser = { id: 'admin-user-uuid', role: Role.ADMIN };

    const mockSignedAgreement = {
      id: 'signed-123',
      enrolmentId: 'enrol-1',
      userId: learnerUser.id,
      status: AgreementStatus.SIGNED,
      templateVersion: 'v2.0',
      signedAt: new Date(),
      version: mockVersion2,
      template: mockTemplate,
    };

    it('allows owning learner to retrieve their signed agreement', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        userId: learnerUser.id,
        signedAgreement: mockSignedAgreement,
      });

      const res = await service.getSignedAgreementForEnrolment('enrol-1', learnerUser);
      expect(res).toEqual(mockSignedAgreement);
    });

    it('allows staff (admin) to view any signed agreement', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        userId: learnerUser.id,
        signedAgreement: mockSignedAgreement,
      });

      const res = await service.getSignedAgreementForEnrolment('enrol-1', adminUser);
      expect(res).toEqual(mockSignedAgreement);
    });

    it('rejects unauthorized learner from viewing another learner signed agreement with ForbiddenException', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        userId: learnerUser.id, // belongs to learnerUser
        signedAgreement: mockSignedAgreement,
      });

      await expect(
        service.getSignedAgreementForEnrolment('enrol-1', foreignUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns null if agreement is not yet signed', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue({
        id: 'enrol-1',
        userId: learnerUser.id,
        signedAgreement: null,
      });

      const res = await service.getSignedAgreementForEnrolment('enrol-1', learnerUser);
      expect(res).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 12. REQUIREMENT 2: DIGITAL CONSENT, SIGNATURE UPLOAD & MANAGER SCOPE
  // ─────────────────────────────────────────────────────────────────────────────
  describe('12. Requirement 2: Digital Consent, Signature Image Upload & Scope Isolation', () => {
    const learnerUser = { id: 'user-learner-uuid', role: Role.USER };
    const foreignUser = { id: 'user-foreign-uuid', role: Role.USER };
    const managerUser = { id: 'mgr-user-uuid', role: Role.MANAGER };
    const adminUser = { id: 'admin-user-uuid', role: Role.ADMIN };

    const mockEnrolment = {
      id: 'enrol-req2-uuid',
      userId: learnerUser.id,
      programId: mockProgram.id,
      batchId: 'batch-101',
      status: EnrolmentStatus.PENDING_AGREEMENT,
      program: mockProgram,
      signedAgreement: null,
    };

    const validDrawnDto = {
      enrolmentId: mockEnrolment.id,
      consentGiven: true,
      typedName: 'Jane Margaret Doe',
      drawnSignature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      signatureType: 'DRAWN' as const,
      consentVersion: 'v2.0',
      consentTimestamp: new Date('2026-10-15T12:00:00.000Z').toISOString(),
    };

    const validUploadedDto = {
      enrolmentId: mockEnrolment.id,
      consentGiven: true,
      typedName: 'Jane Margaret Doe',
      signatureImage: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
      signatureType: 'UPLOADED' as const,
      consentVersion: 'v2.0',
      consentTimestamp: new Date('2026-10-15T12:00:00.000Z').toISOString(),
    };

    beforeEach(() => {
      prismaMock.enrolment.findUnique.mockResolvedValue(mockEnrolment);
      prismaMock.agreementTemplate.findFirst.mockResolvedValue({
        ...mockTemplate,
        versions: [mockVersion2],
      });
      prismaMock.agreementTemplate.findUnique.mockResolvedValue(mockTemplate);
      prismaMock.auditLog.create.mockResolvedValue({ id: 'audit-log-uuid' });
      prismaMock.enrolment.update.mockResolvedValue({
        ...mockEnrolment,
        status: EnrolmentStatus.ACTIVE,
      });
    });

    it('rejects signing if consentGiven is false', async () => {
      await expect(
        service.signAgreement(
          { ...validDrawnDto, consentGiven: false },
          learnerUser,
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.signAgreement(
          { ...validDrawnDto, consentGiven: false },
          learnerUser,
        ),
      ).rejects.toThrow(/Explicit consent acknowledgement is required/i);
    });

    it('rejects signing if typedName is missing or less than 2 characters', async () => {
      await expect(
        service.signAgreement(
          { ...validDrawnDto, typedName: ' ' },
          learnerUser,
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.signAgreement(
          { ...validDrawnDto, typedName: 'J' },
          learnerUser,
        ),
      ).rejects.toThrow(/Typed full name is required and must be at least 2 characters/i);
    });

    it('rejects signing if neither drawn signature nor uploaded image is provided', async () => {
      await expect(
        service.signAgreement(
          {
            enrolmentId: mockEnrolment.id,
            consentGiven: true,
            typedName: 'Jane Doe',
            drawnSignature: undefined,
            signatureImage: undefined,
          } as any,
          learnerUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects uploaded signature with invalid MIME type (e.g. PDF or non-image)', async () => {
      const invalidPdfSignature = 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXr...';
      await expect(
        service.signAgreement(
          {
            ...validUploadedDto,
            signatureImage: invalidPdfSignature,
          },
          learnerUser,
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.signAgreement(
          {
            ...validUploadedDto,
            signatureImage: invalidPdfSignature,
          },
          learnerUser,
        ),
      ).rejects.toThrow(/Only PNG, JPEG, and WebP images are permitted/i);
    });

    it('rejects uploaded signature image exceeding the 2MB size limit', async () => {
      // 2MB is ~2.8M base64 chars. Create a mock base64 data URL > 2MB
      const oversizedBase64 = 'A'.repeat(2.8 * 1024 * 1024);
      const oversizedPayload = `data:image/png;base64,${oversizedBase64}`;

      await expect(
        service.signAgreement(
          {
            ...validUploadedDto,
            signatureImage: oversizedPayload,
          },
          learnerUser,
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.signAgreement(
          {
            ...validUploadedDto,
            signatureImage: oversizedPayload,
          },
          learnerUser,
        ),
      ).rejects.toThrow(/exceeds the 2MB size limit/i);
    });

    it('successfully persists drawn signature with consentVersion, consentTimestamp, and signatureType', async () => {
      prismaMock.signedAgreement.create.mockResolvedValue({
        id: 'signed-drawn-1',
        enrolmentId: mockEnrolment.id,
        userId: learnerUser.id,
        programId: mockProgram.id,
        templateId: mockTemplate.id,
        versionId: mockVersion2.id,
        templateVersion: 'v2.0',
        consentVersion: 'v2.0',
        consentGiven: true,
        consentTimestamp: new Date('2026-10-15T12:00:00.000Z'),
        typedName: 'Jane Margaret Doe',
        drawnSignature: validDrawnDto.drawnSignature,
        signatureType: 'DRAWN',
        signerIp: '192.168.1.100',
        userAgent: 'Mozilla/5.0 Chrome',
        status: AgreementStatus.SIGNED,
        signedAt: new Date(),
      });

      const res = await service.signAgreement(
        validDrawnDto,
        learnerUser,
        '192.168.1.100',
        'Mozilla/5.0 Chrome',
      );

      expect(res.status).toBe(AgreementStatus.SIGNED);
      expect(res.consentVersion).toBe('v2.0');
      expect(res.signatureType).toBe('DRAWN');
      expect(prismaMock.signedAgreement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            consentVersion: 'v2.0',
            signatureType: 'DRAWN',
            drawnSignature: validDrawnDto.drawnSignature,
            typedName: 'Jane Margaret Doe',
          }),
        }),
      );
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'AGREEMENT_SIGNED',
            meta: expect.objectContaining({
              consentVersion: 'v2.0',
              signatureType: 'DRAWN',
            }),
          }),
        }),
      );
    });

    it('successfully persists uploaded signature image with signatureType: UPLOADED', async () => {
      prismaMock.signedAgreement.create.mockResolvedValue({
        id: 'signed-upload-1',
        enrolmentId: mockEnrolment.id,
        userId: learnerUser.id,
        programId: mockProgram.id,
        templateId: mockTemplate.id,
        versionId: mockVersion2.id,
        templateVersion: 'v2.0',
        consentVersion: 'v2.0',
        consentGiven: true,
        consentTimestamp: new Date('2026-10-15T12:00:00.000Z'),
        typedName: 'Jane Margaret Doe',
        drawnSignature: validUploadedDto.signatureImage,
        signatureType: 'UPLOADED',
        signerIp: '192.168.1.100',
        userAgent: 'Mozilla/5.0 Chrome',
        status: AgreementStatus.SIGNED,
        signedAt: new Date(),
      });

      const res = await service.signAgreement(
        validUploadedDto,
        learnerUser,
        '192.168.1.100',
        'Mozilla/5.0 Chrome',
      );

      expect(res.status).toBe(AgreementStatus.SIGNED);
      expect(res.signatureType).toBe('UPLOADED');
      expect(res.consentVersion).toBe('v2.0');
      expect(prismaMock.signedAgreement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            signatureType: 'UPLOADED',
            drawnSignature: validUploadedDto.signatureImage,
          }),
        }),
      );
    });

    it('enforces learner ownership: rejects user attempting to sign another learner enrolment', async () => {
      await expect(
        service.signAgreement(
          validDrawnDto,
          foreignUser,
        ),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.signAgreement(
          validDrawnDto,
          foreignUser,
        ),
      ).rejects.toThrow(/not authorized to sign the agreement for this enrolment/i);
    });

    it('scopes getSignedAgreementsForTemplate to manager assigned batches when caller is a MANAGER', async () => {
      prismaMock.signedAgreement.findMany.mockResolvedValue([
        {
          id: 'signed-mgr-batch-1',
          templateId: mockTemplate.id,
          enrolment: { batchId: 'batch-assigned-to-mgr', batch: { name: 'Batch Oct 2026' } },
        },
      ]);

      const res = await service.getSignedAgreementsForTemplate(mockTemplate.id, managerUser);
      expect(prismaMock.signedAgreement.findMany).toHaveBeenCalledWith({
        where: {
          templateId: mockTemplate.id,
          enrolment: {
            batch: {
              managerId: managerUser.id,
            },
          },
        },
        include: expect.any(Object),
        orderBy: { signedAt: 'desc' },
      });
      expect(res).toHaveLength(1);
    });

    it('allows ADMIN to view all signed agreements across all batches without scoping', async () => {
      prismaMock.signedAgreement.findMany.mockResolvedValue([
        { id: 'signed-1', templateId: mockTemplate.id },
        { id: 'signed-2', templateId: mockTemplate.id },
      ]);

      const res = await service.getSignedAgreementsForTemplate(mockTemplate.id, adminUser);
      expect(prismaMock.signedAgreement.findMany).toHaveBeenCalledWith({
        where: {
          templateId: mockTemplate.id,
        },
        include: expect.any(Object),
        orderBy: { signedAt: 'desc' },
      });
      expect(res).toHaveLength(2);
    });
  });
});
