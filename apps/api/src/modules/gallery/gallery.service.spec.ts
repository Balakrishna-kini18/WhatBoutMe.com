import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GalleryService } from './gallery.service.js';

describe('GalleryService', () => {
  let service: GalleryService;
  let mockPrisma: any;
  let mockAudit: any;

  beforeEach(() => {
    mockPrisma = {
      galleryItem: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    };
    mockAudit = {
      log: vi.fn().mockResolvedValue(undefined),
    };

    service = new GalleryService(mockPrisma, mockAudit);
  });

  describe('listForPublic', () => {
    it('returns only isPublished: true items sorted by displayOrder ASC, createdAt DESC', async () => {
      const mockItems = [
        { id: '1', title: 'Attended Research Course at US', displayOrder: 0, isPublished: true },
        { id: '2', title: 'Oxford Conference', displayOrder: 1, isPublished: true },
      ];
      mockPrisma.galleryItem.findMany.mockResolvedValue(mockItems);

      const result = await service.listForPublic();

      expect(mockPrisma.galleryItem.findMany).toHaveBeenCalledWith({
        where: { isPublished: true },
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
      });
      expect(result).toEqual(mockItems);
    });
  });

  describe('uploadImage edge cases', () => {
    it('throws BadRequestException if file is missing', async () => {
      await expect(service.uploadImage(null as any)).rejects.toThrow(BadRequestException);
    });

    it('rejects files larger than 5MB', async () => {
      const largeBuffer = Buffer.alloc(5 * 1024 * 1024 + 1); // 5MB + 1 byte
      await expect(
        service.uploadImage({
          buffer: largeBuffer,
          mimetype: 'image/png',
          size: largeBuffer.length,
        }),
      ).rejects.toThrow('Image file size must not exceed 5MB');
    });

    it('rejects unsupported file formats (e.g. text/html, application/pdf)', async () => {
      const buffer = Buffer.from('fake data');
      await expect(
        service.uploadImage({
          buffer,
          mimetype: 'application/pdf',
          size: buffer.length,
        }),
      ).rejects.toThrow('Only PNG, JPEG, WEBP, and AVIF image files are supported');
    });
  });

  describe('createForAdmin', () => {
    it('creates gallery item and sets altText to title if omitted', async () => {
      mockPrisma.galleryItem.create.mockImplementation(({ data }: any) => ({
        id: 'cuid_123',
        ...data,
      }));

      const result = await service.createForAdmin('admin_1', {
        title: 'Attended Research Course at US',
        imageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/sample.jpg',
        description: 'Completed 2-week neuroscience workshop in Boston',
      });

      expect(mockPrisma.galleryItem.create).toHaveBeenCalledWith({
        data: {
          title: 'Attended Research Course at US',
          description: 'Completed 2-week neuroscience workshop in Boston',
          imageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/sample.jpg',
          altText: 'Attended Research Course at US',
          category: null,
          displayOrder: 0,
          isPublished: true,
        },
      });
      expect(result.id).toBe('cuid_123');
      expect(mockAudit.log).toHaveBeenCalled();
    });

    it('rejects creation if title or imageUrl is missing', async () => {
      await expect(
        service.createForAdmin('admin_1', {
          title: '',
          imageUrl: 'https://example.com/test.jpg',
        }),
      ).rejects.toThrow('Title is required');

      await expect(
        service.createForAdmin('admin_1', {
          title: 'Valid Title',
          imageUrl: '',
        }),
      ).rejects.toThrow('Image URL is required');
    });
  });

  describe('updateForAdmin & deleteForAdmin', () => {
    it('updates item fields correctly', async () => {
      mockPrisma.galleryItem.findUnique.mockResolvedValue({
        id: 'item_1',
        title: 'Old Title',
        imageUrl: 'https://example.com/old.jpg',
      });
      mockPrisma.galleryItem.update.mockResolvedValue({
        id: 'item_1',
        title: 'New Title',
        imageUrl: 'https://example.com/new.jpg',
        isPublished: false,
      });

      const updated = await service.updateForAdmin('admin_1', 'item_1', {
        title: 'New Title',
        imageUrl: 'https://example.com/new.jpg',
        isPublished: false,
      });

      expect(updated.title).toBe('New Title');
      expect(mockAudit.log).toHaveBeenCalled();
    });

    it('deletes item from database', async () => {
      mockPrisma.galleryItem.findUnique.mockResolvedValue({
        id: 'item_1',
        title: 'Old Title',
        imageUrl: 'https://example.com/old.jpg',
      });
      mockPrisma.galleryItem.delete.mockResolvedValue({ id: 'item_1' });

      const res = await service.deleteForAdmin('admin_1', 'item_1');
      expect(res).toEqual({ success: true, id: 'item_1' });
      expect(mockPrisma.galleryItem.delete).toHaveBeenCalledWith({ where: { id: 'item_1' } });
    });
  });
});
