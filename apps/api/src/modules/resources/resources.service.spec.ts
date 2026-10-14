import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResourcesService } from './resources.service.js';
import { Role, ResourceItemType, ResourceAccessScope } from '@prisma/client';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';

describe('ResourcesService - Module 1 of 8 (Resource Library)', () => {
  let service: ResourcesService;
  let prismaMock: any;
  let storageProviderMock: any;
  let auditLogServiceMock: any;

  beforeEach(() => {
    prismaMock = {
      resourceItem: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      resourceCategory: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      batch: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      program: {
        findUnique: vi.fn(),
      },
      step: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      enrolment: {
        findMany: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      },
    };

    storageProviderMock = {
      getPresignedPutUrl: vi.fn().mockResolvedValue('https://storage.example.com/put-signed-url'),
      getPresignedGetUrl: vi.fn().mockResolvedValue('https://storage.example.com/get-signed-url?token=abc123'),
      deleteObject: vi.fn().mockResolvedValue(undefined),
    };

    auditLogServiceMock = {
      log: vi.fn().mockResolvedValue(undefined),
    };

    service = new ResourcesService(prismaMock, storageProviderMock, auditLogServiceMock);
  });

  describe('generateUploadUrl', () => {
    it('generates a presigned PUT URL and storage key for valid PDF', async () => {
      const result = await service.generateUploadUrl('usr-1', Role.ADMIN, {
        fileName: 'Worksheet_Values.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 1048576,
      });

      expect(result.uploadUrl).toBe('https://storage.example.com/put-signed-url');
      expect(result.storageKey).toMatch(/^resources\/\d+_[a-z0-9]+\/Worksheet_Values\.pdf$/);
      expect(result.expiresInSeconds).toBe(300);
      expect(storageProviderMock.getPresignedPutUrl).toHaveBeenCalledWith(
        result.storageKey,
        'application/pdf',
        300,
      );
    });
  });

  describe('createResource', () => {
    it('creates global resource as SUPER_ADMIN and logs audit trail', async () => {
      prismaMock.resourceCategory.findUnique.mockResolvedValue({ id: 'cat-1', name: 'Worksheets' });
      prismaMock.resourceItem.create.mockResolvedValue({
        id: 'res-1',
        title: 'Core Values Worksheet',
        type: ResourceItemType.WORKSHEET,
        accessScope: ResourceAccessScope.ALL_ENROLLED,
        storageKey: 'resources/test.pdf',
      });

      const result = await service.createResource('admin-1', Role.SUPER_ADMIN, {
        title: 'Core Values Worksheet',
        type: ResourceItemType.WORKSHEET,
        categoryId: 'cat-1',
        storageKey: 'resources/test.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 2048,
        accessScope: ResourceAccessScope.ALL_ENROLLED,
      });

      expect(result.id).toBe('res-1');
      expect(auditLogServiceMock.log).toHaveBeenCalledWith(
        prismaMock,
        expect.objectContaining({
          action: 'RESOURCE_CREATED',
          entityType: 'ResourceItem',
          entityId: 'res-1',
        }),
      );
    });

    it('blocks MANAGER from creating global course content (403 Forbidden)', async () => {
      prismaMock.resourceCategory.findUnique.mockResolvedValue({ id: 'cat-1', name: 'Worksheets' });

      await expect(
        service.createResource('mgr-1', Role.MANAGER, {
          title: 'Global Worksheet',
          type: ResourceItemType.WORKSHEET,
          categoryId: 'cat-1',
          storageKey: 'resources/test.pdf',
          mimeType: 'application/pdf',
          fileSizeBytes: 2048,
          accessScope: ResourceAccessScope.ALL_ENROLLED,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows MANAGER to create resource scoped to their assigned batch', async () => {
      prismaMock.resourceCategory.findUnique.mockResolvedValue({ id: 'cat-1', name: 'Worksheets' });
      prismaMock.batch.findUnique.mockResolvedValue({ id: 'batch-1', managerId: 'mgr-1' });
      prismaMock.resourceItem.create.mockResolvedValue({
        id: 'res-batch-1',
        title: 'Batch 1 Prep Sheet',
        batchId: 'batch-1',
        accessScope: ResourceAccessScope.BATCH,
      });

      const result = await service.createResource('mgr-1', Role.MANAGER, {
        title: 'Batch 1 Prep Sheet',
        type: ResourceItemType.WORKSHEET,
        categoryId: 'cat-1',
        storageKey: 'resources/batch1.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 2048,
        accessScope: ResourceAccessScope.BATCH,
        batchId: 'batch-1',
      });

      expect(result.id).toBe('res-batch-1');
    });

    it('blocks MANAGER from creating resource for a batch managed by someone else', async () => {
      prismaMock.resourceCategory.findUnique.mockResolvedValue({ id: 'cat-1', name: 'Worksheets' });
      prismaMock.batch.findUnique.mockResolvedValue({ id: 'batch-2', managerId: 'other-mgr' });

      await expect(
        service.createResource('mgr-1', Role.MANAGER, {
          title: 'Unauthorized Batch Sheet',
          type: ResourceItemType.WORKSHEET,
          categoryId: 'cat-1',
          storageKey: 'resources/test.pdf',
          mimeType: 'application/pdf',
          fileSizeBytes: 2048,
          accessScope: ResourceAccessScope.BATCH,
          batchId: 'batch-2',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateResource & deleteResource RBAC', () => {
    it('blocks MANAGER from modifying global course content (403 Forbidden)', async () => {
      prismaMock.resourceItem.findUnique.mockResolvedValue({
        id: 'res-global',
        title: 'Global Material',
        accessScope: ResourceAccessScope.ALL_ENROLLED,
      });

      await expect(
        service.updateResource('res-global', 'mgr-1', Role.MANAGER, { title: 'Hacked' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('blocks MANAGER from deleting global course content (403 Forbidden)', async () => {
      prismaMock.resourceItem.findUnique.mockResolvedValue({
        id: 'res-global',
        title: 'Global Material',
        accessScope: ResourceAccessScope.ALL_ENROLLED,
      });

      await expect(
        service.deleteResource('res-global', 'mgr-1', Role.MANAGER),
      ).rejects.toThrow(ForbiddenException);
    });

    it('deletes from private storage and database when deleted by ADMIN', async () => {
      prismaMock.resourceItem.findUnique.mockResolvedValue({
        id: 'res-1',
        title: 'Delete Me',
        storageKey: 'resources/del.pdf',
        accessScope: ResourceAccessScope.ALL_ENROLLED,
      });

      const res = await service.deleteResource('res-1', 'admin-1', Role.ADMIN);

      expect(res.success).toBe(true);
      expect(storageProviderMock.deleteObject).toHaveBeenCalledWith('resources/del.pdf');
      expect(prismaMock.resourceItem.delete).toHaveBeenCalledWith({ where: { id: 'res-1' } });
      expect(auditLogServiceMock.log).toHaveBeenCalledWith(
        prismaMock,
        expect.objectContaining({ action: 'RESOURCE_DELETED' }),
      );
    });
  });

  describe('findAllPortal (Learner Access Evaluation)', () => {
    it('returns empty list if learner has no active enrolments', async () => {
      prismaMock.enrolment.findMany.mockResolvedValue([]);
      const result = await service.findAllPortal('usr-inactive', {});
      expect(result).toEqual([]);
    });

    it('evaluates dynamic access matching batch, program, and unlocked steps', async () => {
      prismaMock.enrolment.findMany.mockResolvedValue([
        {
          id: 'enr-1',
          programId: 'prog-11steps',
          batchId: 'batch-sep-2026',
          stepProgress: [
            { stepId: 'stp-1', isUnlocked: true, isCompleted: true },
            { stepId: 'stp-2', isUnlocked: true, isCompleted: false },
            { stepId: 'stp-3', isUnlocked: false, isCompleted: false },
          ],
        },
      ]);

      prismaMock.step.findMany.mockResolvedValue([
        { id: 'stp-1', sequence: 1 },
        { id: 'stp-2', sequence: 2 },
      ]);

      prismaMock.resourceItem.findMany.mockResolvedValue([
        { id: 'res-1', title: 'Step 1 Worksheet', stepTagNumber: 1 },
        { id: 'res-2', title: 'Step 2 Reading', stepTagNumber: 2 },
      ]);

      const result = await service.findAllPortal('usr-learner', {});

      expect(result).toHaveLength(2);
      expect(prismaMock.resourceItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isPublished: true,
            OR: expect.arrayContaining([
              { accessScope: ResourceAccessScope.ALL_ENROLLED },
              { accessScope: ResourceAccessScope.PROGRAM, programId: { in: ['prog-11steps'] } },
              { accessScope: ResourceAccessScope.BATCH, batchId: { in: ['batch-sep-2026'] } },
            ]),
          }),
        }),
      );
    });
  });

  describe('getPortalViewToken (Locked Step Leakage & Signed Watermark)', () => {
    it('blocks learner with 403 Forbidden if required step is locked', async () => {
      prismaMock.resourceItem.findUnique.mockResolvedValue({
        id: 'res-step4',
        title: 'Step 4 Advanced Meditation',
        accessScope: ResourceAccessScope.STEP_UNLOCKED,
        stepTagNumber: 4,
        isPublished: true,
      });

      prismaMock.user.findUnique.mockResolvedValue({
        id: 'usr-learner',
        name: 'Alice Learner',
        email: 'alice@wbm.com',
      });

      // Learner is only on Step 1 and 2
      prismaMock.enrolment.findMany.mockResolvedValue([
        {
          id: 'enr-1',
          programId: 'prog-11steps',
          batchId: 'batch-1',
          stepProgress: [
            { stepId: 'stp-1', isUnlocked: true, isCompleted: true },
            { stepId: 'stp-2', isUnlocked: true, isCompleted: false },
            { stepId: 'stp-3', isUnlocked: false, isCompleted: false },
            { stepId: 'stp-4', isUnlocked: false, isCompleted: false },
          ],
        },
      ]);

      prismaMock.step.findMany.mockResolvedValue([
        { id: 'stp-4', sequence: 4 },
      ]);

      await expect(
        service.getPortalViewToken('res-step4', 'usr-learner'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('generates short-lived signed URL and watermark when learner has unlocked the step', async () => {
      prismaMock.resourceItem.findUnique.mockResolvedValue({
        id: 'res-step2',
        title: 'Step 2 Guided Audio',
        type: ResourceItemType.GUIDED_AUDIO,
        storageKey: 'resources/step2_audio.mp3',
        mimeType: 'audio/mpeg',
        accessScope: ResourceAccessScope.STEP_UNLOCKED,
        stepTagNumber: 2,
        isPublished: true,
      });

      prismaMock.user.findUnique.mockResolvedValue({
        id: 'usr-learner',
        name: 'Alice Learner',
        email: 'alice@wbm.com',
      });

      prismaMock.enrolment.findMany.mockResolvedValue([
        {
          id: 'enr-1',
          programId: 'prog-11steps',
          batchId: 'batch-1',
          stepProgress: [
            { stepId: 'stp-1', isUnlocked: true, isCompleted: true },
            { stepId: 'stp-2', isUnlocked: true, isCompleted: false },
          ],
        },
      ]);

      prismaMock.step.findMany.mockResolvedValue([
        { id: 'stp-2', sequence: 2 },
      ]);

      const result = await service.getPortalViewToken('res-step2', 'usr-learner');

      expect(result.signedUrl).toBe('https://storage.example.com/get-signed-url?token=abc123');
      expect(result.expiresInSeconds).toBe(300);
      expect(result.watermark.learnerName).toBe('Alice Learner');
      expect(result.watermark.learnerEmail).toBe('alice@wbm.com');
      expect(result.watermark.timestamp).toBeDefined();
      expect(storageProviderMock.getPresignedGetUrl).toHaveBeenCalledWith(
        'resources/step2_audio.mp3',
        300,
      );
    });
  });
});
