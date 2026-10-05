import { Test, TestingModule } from '@nestjs/testing';
import { CloudinaryController } from './cloudinary.controller.js';
import { CloudinaryMediaProvider } from './cloudinary.service.js';
import { CloudinaryObjectStorageProvider } from './cloudinary-object-storage.service.js';
import { Response } from 'express';

describe('CloudinaryController', () => {
  let controller: CloudinaryController;
  let objectStorage: CloudinaryObjectStorageProvider;

  beforeEach(async () => {
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

  describe('streamMedia (D2-016)', () => {
    it('redirects to a short-lived signed URL so the CDN serves Range requests', async () => {
      const signedUrl = 'https://res.cloudinary.com/signed-url';
      vi.spyOn(objectStorage, 'getPresignedGetUrl').mockResolvedValue(signedUrl);
      const res = makeRes();

      await controller.streamMedia('lesson.mp4', res);

      expect(objectStorage.getPresignedGetUrl).toHaveBeenCalledWith('lesson.mp4', 300);
      expect(res.redirect).toHaveBeenCalledWith(302, signedUrl);
    });

    it('allows cross-origin embedding so the LMS <video> is not blocked by helmet CORP', async () => {
      vi.spyOn(objectStorage, 'getPresignedGetUrl').mockResolvedValue('https://res.cloudinary.com/x');
      const res = makeRes();

      await controller.streamMedia('lesson.mp4', res);

      expect(res.setHeader).toHaveBeenCalledWith('Cross-Origin-Resource-Policy', 'cross-origin');
    });

    it('returns 500 without redirecting when signing fails (Edge Case)', async () => {
      vi.spyOn(objectStorage, 'getPresignedGetUrl').mockRejectedValue(new Error('boom'));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = makeRes();

      await controller.streamMedia('lesson.mp4', res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.redirect).not.toHaveBeenCalled();
    });
  });
});
