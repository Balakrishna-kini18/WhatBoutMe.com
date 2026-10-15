import { Test, TestingModule } from '@nestjs/testing';
import { CloudinaryController } from './cloudinary.controller.js';
import { CloudinaryMediaProvider } from './cloudinary.service.js';
import { CloudinaryObjectStorageProvider } from './cloudinary-object-storage.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Response } from 'express';
import { Role } from '@prisma/client';
import { UnauthorizedException, ForbiddenException, NotFoundException } from '@nestjs/common';

describe('CloudinaryController - Program-Scoped Media Authorization (SEC-01)', () => {
  let controller: CloudinaryController;
  let objectStorage: CloudinaryObjectStorageProvider;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      lesson: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
      },
      resource: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
      },
      session: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
      },
      enrolment: {
        findFirst: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CloudinaryController],
      providers: [
        {
          provide: CloudinaryMediaProvider,
          useValue: {
            createDirectUpload: vi.fn(),
          },
        },
        {
          provide: CloudinaryObjectStorageProvider,
          useValue: {
            getPresignedGetUrl: vi.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    controller = module.get<CloudinaryController>(CloudinaryController);
    objectStorage = module.get<CloudinaryObjectStorageProvider>(CloudinaryObjectStorageProvider);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const makeRes = () =>
    ({
      setHeader: vi.fn(),
      redirect: vi.fn(),
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
    }) as unknown as Response;

  describe('streamMedia (SEC-01 Program-Scoped Access Control)', () => {
    it('1. throws UnauthorizedException when requester is unauthenticated', async () => {
      const res = makeRes();
      await expect(controller.streamMedia('lesson.mp4', {} as any, res)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('2. throws NotFoundException when media key does not exist in any lesson, resource, or session', async () => {
      prisma.lesson.findMany.mockResolvedValue([]);
      prisma.resource.findMany.mockResolvedValue([]);
      prisma.session.findMany.mockResolvedValue([]);

      const req = { user: { sub: 'learner-1', role: Role.USER } };
      const res = makeRes();

      await expect(controller.streamMedia('unknown-media.mp4', req, res)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('3. allows enrolled learner to stream media belonging to their authorized program', async () => {
      // Media belongs to program-A
      prisma.lesson.findMany.mockResolvedValue([
        { step: { programId: 'program-A' } },
      ]);
      // Learner is actively enrolled in program-A
      prisma.enrolment.findFirst.mockResolvedValue({
        id: 'enr-1',
        programId: 'program-A',
        status: 'ACTIVE',
      });

      const signedUrl = 'https://res.cloudinary.com/signed-url-prog-a';
      vi.spyOn(objectStorage, 'getPresignedGetUrl').mockResolvedValue(signedUrl);

      const req = { user: { sub: 'learner-1', role: Role.USER } };
      const res = makeRes();

      await controller.streamMedia('program-a-lesson.mp4', req, res);

      expect(prisma.enrolment.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'learner-1',
          programId: { in: ['program-A'] },
          status: { in: ['ACTIVE', 'COMPLETED'] },
        },
      });
      expect(objectStorage.getPresignedGetUrl).toHaveBeenCalledWith('program-a-lesson.mp4', 300);
      expect(res.redirect).toHaveBeenCalledWith(302, signedUrl);
      expect(res.setHeader).toHaveBeenCalledWith('Cross-Origin-Resource-Policy', 'cross-origin');
    });

    it('4. blocks cross-program access: learner enrolled in Program A cannot access Program B media', async () => {
      // Media belongs to program-B
      prisma.lesson.findMany.mockResolvedValue([
        { step: { programId: 'program-B' } },
      ]);
      // Learner only enrolled in program-A -> returns null when queried for program-B
      prisma.enrolment.findFirst.mockResolvedValue(null);

      const req = { user: { sub: 'learner-1', role: Role.USER } };
      const res = makeRes();

      await expect(controller.streamMedia('program-b-secret.mp4', req, res)).rejects.toThrow(
        ForbiddenException,
      );
      expect(objectStorage.getPresignedGetUrl).not.toHaveBeenCalled();
      expect(res.redirect).not.toHaveBeenCalled();
    });

    it('5. rejects learner with inactive enrolment (e.g. PENDING_PAYMENT or REVOKED)', async () => {
      prisma.lesson.findMany.mockResolvedValue([
        { step: { programId: 'program-A' } },
      ]);
      // Inactive enrolment does not match ACTIVE / COMPLETED filter
      prisma.enrolment.findFirst.mockResolvedValue(null);

      const req = { user: { sub: 'learner-1', role: Role.USER } };
      const res = makeRes();

      await expect(controller.streamMedia('program-a-lesson.mp4', req, res)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('6. resolves media owner from Resource model when not in Lesson', async () => {
      prisma.lesson.findMany.mockResolvedValue([]);
      prisma.resource.findMany.mockResolvedValue([
        { programId: 'program-resource-1' },
      ]);
      prisma.enrolment.findFirst.mockResolvedValue({
        id: 'enr-res',
        programId: 'program-resource-1',
        status: 'ACTIVE',
      });

      const signedUrl = 'https://res.cloudinary.com/signed-resource';
      vi.spyOn(objectStorage, 'getPresignedGetUrl').mockResolvedValue(signedUrl);

      const req = { user: { sub: 'learner-1', role: Role.USER } };
      const res = makeRes();

      await controller.streamMedia('handout-audio.mp3', req, res);

      expect(prisma.enrolment.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'learner-1',
          programId: { in: ['program-resource-1'] },
          status: { in: ['ACTIVE', 'COMPLETED'] },
        },
      });
      expect(res.redirect).toHaveBeenCalledWith(302, signedUrl);
    });

    it('7. allows admin access without requiring learner enrolment lookup', async () => {
      const signedUrl = 'https://res.cloudinary.com/signed-url-admin';
      vi.spyOn(objectStorage, 'getPresignedGetUrl').mockResolvedValue(signedUrl);
      const req = { user: { sub: 'admin-1', role: Role.ADMIN } };
      const res = makeRes();

      await controller.streamMedia('any-program-lesson.mp4', req, res);

      expect(prisma.lesson.findMany).not.toHaveBeenCalled();
      expect(prisma.enrolment.findFirst).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(302, signedUrl);
    });

    it('8. allows manager access without requiring learner enrolment lookup', async () => {
      const signedUrl = 'https://res.cloudinary.com/signed-url-manager';
      vi.spyOn(objectStorage, 'getPresignedGetUrl').mockResolvedValue(signedUrl);
      const req = { user: { sub: 'mgr-1', role: Role.MANAGER } };
      const res = makeRes();

      await controller.streamMedia('cohort-lecture.mp4', req, res);

      expect(prisma.lesson.findMany).not.toHaveBeenCalled();
      expect(prisma.enrolment.findFirst).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(302, signedUrl);
    });

    it('9. handles signing errors safely with 500 status', async () => {
      vi.spyOn(objectStorage, 'getPresignedGetUrl').mockRejectedValue(new Error('signing failed'));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const req = { user: { sub: 'admin-1', role: Role.ADMIN } };
      const res = makeRes();

      await controller.streamMedia('lesson.mp4', req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.redirect).not.toHaveBeenCalled();
    });

    it('10. handles canonical stored upload:publicId format seamlessly', async () => {
      // Stored in database as upload:cohort-part-1
      prisma.lesson.findMany.mockImplementation(({ where }: any) => {
        const inClause = where?.OR?.find((o: any) => o.mediaUrl?.in)?.mediaUrl?.in || [];
        if (inClause.includes('upload:cohort-part-1')) {
          return Promise.resolve([{ step: { programId: 'program-A' } }]);
        }
        return Promise.resolve([]);
      });

      prisma.enrolment.findFirst.mockResolvedValue({
        id: 'enr-upload',
        programId: 'program-A',
        status: 'ACTIVE',
      });

      const signedUrl = 'https://res.cloudinary.com/signed-upload';
      vi.spyOn(objectStorage, 'getPresignedGetUrl').mockResolvedValue(signedUrl);

      const req = { user: { sub: 'learner-1', role: Role.USER } };
      const res = makeRes();

      // Client requests cohort-part-1.mp4
      await controller.streamMedia('cohort-part-1.mp4', req, res);

      expect(res.redirect).toHaveBeenCalledWith(302, signedUrl);
    });

    it('11. safely rejects ambiguous key mapping claimed across multiple distinct programs', async () => {
      // Key matches lessons belonging to both Program A and Program B
      prisma.lesson.findMany.mockResolvedValue([
        { step: { programId: 'program-A' } },
        { step: { programId: 'program-B' } },
      ]);

      const req = { user: { sub: 'learner-1', role: Role.USER } };
      const res = makeRes();

      await expect(controller.streamMedia('shared-common-video.mp4', req, res)).rejects.toThrow(
        ForbiddenException,
      );
      expect(objectStorage.getPresignedGetUrl).not.toHaveBeenCalled();
    });

    it('12. prevents substring attack: short key or overlapping name does not authorize access to wrong resource', async () => {
      // Program B owns 'lecture1.mp4'
      // Program A owns 'super-lecture1.mp4'
      // When requesting 'lecture1.mp4', lessonWhere specifies exact candidates and /{key} path termination
      prisma.lesson.findMany.mockImplementation(({ where }: any) => {
        const inKeys = where?.OR?.find((o: any) => o.mediaUrl?.in)?.mediaUrl?.in || [];
        // Only exact key match returns program-B
        if (inKeys.includes('lecture1.mp4') || inKeys.includes('lecture1')) {
          return Promise.resolve([{ step: { programId: 'program-B' } }]);
        }
        return Promise.resolve([]);
      });

      // Learner is only enrolled in Program A
      prisma.enrolment.findFirst.mockResolvedValue(null);

      const req = { user: { sub: 'learner-1', role: Role.USER } };
      const res = makeRes();

      await expect(controller.streamMedia('lecture1.mp4', req, res)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('13. rejects path traversal or malformed key safely with NotFoundException', async () => {
      const req = { user: { sub: 'learner-1', role: Role.USER } };
      const res = makeRes();

      await expect(controller.streamMedia('../secret.mp4', req, res)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.lesson.findMany).not.toHaveBeenCalled();
    });
  });
});
