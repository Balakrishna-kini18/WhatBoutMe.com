import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ProgressionService } from './progression.service.js';

describe('Learner Progress Sharing (Role Audit Gap 3 Fix - Client PDF p.10 §9)', () => {
  let service: ProgressionService;
  let prismaMock: any;
  let cacheHelperMock: any;

  const learnerAlice = { id: 'alice-1', sub: 'alice-1', role: Role.USER };
  const learnerBob = { id: 'bob-2', sub: 'bob-2', role: Role.USER };
  const adminUser = { id: 'admin-1', sub: 'admin-1', role: Role.ADMIN };

  const mockEnrolmentAlice = {
    id: 'enrol-alice-1',
    userId: 'alice-1',
    programId: 'prog-1',
    status: 'ACTIVE',
    user: { id: 'alice-1', name: 'Alice Wonderland', email: 'alice@example.com' },
    program: { id: 'prog-1', title: '11 Steps to Brain Health & Resilience', slug: '11-steps' },
    batch: {
      id: 'batch-1',
      trainers: [],
      overrides: [],
    },
    signedAgreement: { id: 'agr-1' },
    certificate: null,
  };

  beforeEach(() => {
    prismaMock = {
      enrolment: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
      },
      step: {
        findMany: vi.fn().mockResolvedValue([
          { id: 's1', sequence: 1, title: 'Step 1', releaseSchedule: 'IMMEDIATE', unlockDelayDays: 0, status: 'PUBLISHED', lessons: [], quizzes: [] },
          { id: 's2', sequence: 2, title: 'Step 2', releaseSchedule: 'IMMEDIATE', unlockDelayDays: 0, status: 'PUBLISHED', lessons: [], quizzes: [] },
          { id: 's3', sequence: 3, title: 'Step 3', releaseSchedule: 'IMMEDIATE', unlockDelayDays: 0, status: 'PUBLISHED', lessons: [], quizzes: [] },
        ]),
      },
      stepProgress: {
        findMany: vi.fn().mockResolvedValue([
          { stepId: 's1', isCompleted: true, isUnlocked: true },
          { stepId: 's2', isCompleted: true, isUnlocked: true },
          { stepId: 's3', isCompleted: false, isUnlocked: true },
        ]),
        upsert: vi.fn(),
      },
      userLessonProgress: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      attempt: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    cacheHelperMock = {
      get: vi.fn(),
      set: vi.fn().mockResolvedValue(undefined),
      getVersionedKey: vi.fn().mockImplementation((ns: string, id: string) => `${ns}:${id}`),
      getOrSet: vi.fn().mockImplementation((key: string, fn: any) => fn()),
      invalidateNamespace: vi.fn().mockResolvedValue(undefined),
    };

    service = new ProgressionService(prismaMock, cacheHelperMock);
  });

  describe('createProgressShare (Privacy & Authorization)', () => {
    it('allows a learner to generate a public progress share card for their own enrolment', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue(mockEnrolmentAlice);

      const result = await service.createProgressShare(
        { enrolmentId: 'enrol-alice-1', showProgressPercent: true, showMilestone: true, showName: true },
        learnerAlice,
      );

      expect(result.shareToken).toBeDefined();
      expect(result.shareToken.length).toBe(32); // 16 bytes hex
      expect(result.shareUrl).toBe(`/share/progress/${result.shareToken}`);
      expect(result.shareCard).toBeDefined();
      expect(result.shareCard.learnerName).toBe('Alice Wonderland');
      expect(result.shareCard.programTitle).toBe('11 Steps to Brain Health & Resilience');
      expect(result.shareCard.milestone).toBe('Completed Step 3 of 3');
      expect(result.shareCard.verified).toBe(true);

      // Verify privacy: NO sensitive email or IDs in the share card
      expect((result.shareCard as any).email).toBeUndefined();
      expect((result.shareCard as any).userId).toBeUndefined();
      expect((result.shareCard as any).enrolmentId).toBeUndefined();

      // Verify share links for social platforms
      expect(result.shareCard.shareLinks.linkedin).toContain('linkedin.com');
      expect(result.shareCard.shareLinks.whatsapp).toContain('whatsapp.com');
      expect(result.shareCard.shareLinks.x).toContain('twitter.com');
    });

    it('honors learner privacy choices when creating share (anonymous name)', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue(mockEnrolmentAlice);

      const result = await service.createProgressShare(
        { enrolmentId: 'enrol-alice-1', showName: false, showProgressPercent: false },
        learnerAlice,
      );

      expect(result.shareCard.learnerName).toBe('A WhatBoutMe Learner');
      expect(result.shareCard.progressPercent).toBeNull();
    });

    it('rejects a learner attempting to share another learner enrolment (Anti-IDOR)', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue(mockEnrolmentAlice);

      await expect(
        service.createProgressShare(
          { enrolmentId: 'enrol-alice-1' },
          learnerBob,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException for non-existent enrolment', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue(null);

      await expect(
        service.createProgressShare(
          { enrolmentId: 'non-existent' },
          learnerAlice,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('allows Admin to generate share card on behalf of a learner', async () => {
      prismaMock.enrolment.findUnique.mockResolvedValue(mockEnrolmentAlice);

      const result = await service.createProgressShare(
        { enrolmentId: 'enrol-alice-1' },
        adminUser,
      );

      expect(result.shareToken).toBeDefined();
    });
  });

  describe('getSharedProgress (Public Sanitized Retrieval)', () => {
    it('returns sanitized public progress card for a valid token', async () => {
      const cachedCard = {
        shareToken: '0123456789abcdef0123456789abcdef',
        learnerName: 'Alice Wonderland',
        programTitle: '11 Steps to Brain Health & Resilience',
        milestone: 'Completed Step 2 of 3',
        progressPercent: 67,
        verified: true,
      };
      cacheHelperMock.get.mockResolvedValue(cachedCard);

      const card = await service.getSharedProgress('0123456789abcdef0123456789abcdef');

      expect(card.learnerName).toBe('Alice Wonderland');
      expect(card.milestone).toBe('Completed Step 2 of 3');
      expect(card.verified).toBe(true);

      // Strictly ensure zero private fields are exposed
      expect((card as any).email).toBeUndefined();
      expect((card as any).userId).toBeUndefined();
      expect((card as any).enrolmentId).toBeUndefined();
      expect((card as any).paymentId).toBeUndefined();
    });

    it('throws NotFoundException for missing or expired token', async () => {
      cacheHelperMock.get.mockResolvedValue(null);

      await expect(
        service.getSharedProgress('non-existent-token-12345'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for invalid or malformed token string', async () => {
      await expect(
        service.getSharedProgress('short'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
