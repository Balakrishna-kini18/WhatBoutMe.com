import { Test, TestingModule } from '@nestjs/testing';
import { CloudinaryController } from './cloudinary.controller.js';
import { CloudinaryMediaProvider } from './cloudinary.service.js';
import { CloudinaryObjectStorageProvider } from './cloudinary-object-storage.service.js';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { Readable } from 'stream';

describe('CloudinaryController', () => {
  let controller: CloudinaryController;
  let mediaProvider: CloudinaryMediaProvider;
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
    mediaProvider = module.get<CloudinaryMediaProvider>(CloudinaryMediaProvider);
    objectStorage = module.get<CloudinaryObjectStorageProvider>(CloudinaryObjectStorageProvider);
    
    // Mock global fetch
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('streamMedia (D2-016 Proxy)', () => {
    it('should securely stream media and set security headers', async () => {
      const mockKey = 'private-doc.pdf';
      const mockSignedUrl = 'https://res.cloudinary.com/signed-url';
      
      vi.spyOn(objectStorage, 'getPresignedGetUrl').mockResolvedValue(mockSignedUrl);
      
      // Mock fetch response
      const mockReadableStream = new Readable({
        read() {
          this.push('fake-file-data');
          this.push(null);
        }
      });
      
      (global.fetch as any).mockResolvedValue({
        ok: true,
        headers: new Headers({
          'content-type': 'application/pdf',
          'content-length': '123',
        }),
        body: mockReadableStream, // native fetch returns ReadableStream in Node 18, but for testing stream piping works similarly
      });

      const resMock = {
        setHeader: vi.fn(),
        end: vi.fn(),
        on: vi.fn(),
        once: vi.fn(),
        emit: vi.fn(),
        write: vi.fn(),
      } as unknown as Response;

      // Spy on stream pipe
      vi.spyOn(Readable, 'fromWeb').mockReturnValue(mockReadableStream as any);
      const pipeSpy = vi.spyOn(mockReadableStream, 'pipe').mockImplementation(() => resMock as any);

      await controller.streamMedia(mockKey, resMock);

      // Verify Cloudinary is called securely with short 300s TTL
      expect(objectStorage.getPresignedGetUrl).toHaveBeenCalledWith(mockKey, 300);
      
      // Verify security headers (NOSNIFF and INLINE)
      expect(resMock.setHeader).toHaveBeenCalledWith('Content-Disposition', 'inline');
      expect(resMock.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      
      // Verify pass-through headers
      expect(resMock.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(resMock.setHeader).toHaveBeenCalledWith('Content-Length', '123');

      // Verify pipe was called
      expect(pipeSpy).toHaveBeenCalledWith(resMock);
    });

    it('should handle upstream 404s gracefully (Edge Case)', async () => {
      vi.spyOn(objectStorage, 'getPresignedGetUrl').mockResolvedValue('https://cloudinary.com/404');
      
      (global.fetch as any).mockResolvedValue({
        ok: false, // Cloudinary returned 404
      });

      const resMock = {} as Response;

      await expect(controller.streamMedia('missing.pdf', resMock)).rejects.toThrow(
        new HttpException('Media not found or inaccessible', HttpStatus.NOT_FOUND)
      );
    });

    it('should safely stream even if Cloudinary omits Content-Length and Content-Type headers (Edge Case)', async () => {
      const mockKey = 'weird-file.pdf';
      const mockSignedUrl = 'https://res.cloudinary.com/weird-file';
      
      vi.spyOn(objectStorage, 'getPresignedGetUrl').mockResolvedValue(mockSignedUrl);
      
      // Mock fetch response with NO headers
      const mockReadableStream = new Readable({
        read() {
          this.push(null);
        }
      });
      
      (global.fetch as any).mockResolvedValue({
        ok: true,
        headers: new Headers(), // Empty headers
        body: mockReadableStream,
      });

      const resMock = {
        setHeader: vi.fn(),
        end: vi.fn(),
      } as unknown as Response;

      vi.spyOn(Readable, 'fromWeb').mockReturnValue(mockReadableStream as any);
      vi.spyOn(mockReadableStream, 'pipe').mockImplementation(() => resMock as any);

      await controller.streamMedia(mockKey, resMock);

      // Should still set explicit security headers
      expect(resMock.setHeader).toHaveBeenCalledWith('Content-Disposition', 'inline');
      expect(resMock.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      
      // But should NOT attempt to set missing headers
      expect(resMock.setHeader).not.toHaveBeenCalledWith('Content-Type', expect.anything());
      expect(resMock.setHeader).not.toHaveBeenCalledWith('Content-Length', expect.anything());
    });

    it('should safely call res.end() if fetch response has absolutely no body (Edge Case)', async () => {
      vi.spyOn(objectStorage, 'getPresignedGetUrl').mockResolvedValue('https://cloudinary.com/empty');
      
      (global.fetch as any).mockResolvedValue({
        ok: true,
        headers: new Headers(),
        body: null, // No body stream at all
      });

      const resMock = {
        setHeader: vi.fn(),
        end: vi.fn(),
      } as unknown as Response;

      await controller.streamMedia('empty-file.txt', resMock);

      // Should still secure the response, but immediately close it
      expect(resMock.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(resMock.end).toHaveBeenCalled();
    });
  });
});
