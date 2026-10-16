import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditLogService } from '../../common/audit/audit-log.service.js';
import {
  CreateGalleryItemDto,
  ListGalleryQueryDto,
  UpdateGalleryItemDto,
} from './dto/gallery.dto.js';

type RequestMeta = {
  ipAddress?: string;
  userAgent?: string;
};

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/avif',
]);

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

@Injectable()
export class GalleryService {
  private readonly logger = new Logger(GalleryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditLogService,
  ) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  /**
   * Validates and streams an uploaded image to Cloudinary under the 'whatboutme_gallery' folder.
   * Enforces 5MB max size and PNG/JPEG/WEBP/AVIF mime-type guard.
   */
  async uploadImage(file: { buffer?: Buffer; mimetype?: string; size?: number; [key: string]: any }) {
    if (!file || !file.buffer) {
      throw new BadRequestException('Image file is required');
    }

    const size = file.size ?? file.buffer.length;
    if (size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('Image file size must not exceed 5MB');
    }

    const mime = (file.mimetype || '').toLowerCase();
    if (mime && !ALLOWED_MIME_TYPES.has(mime)) {
      throw new BadRequestException(
        'Invalid image format. Only PNG, JPEG, WEBP, and AVIF image files are supported',
      );
    }

    return new Promise<{ imageUrl: string; publicId: string }>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'whatboutme_gallery',
          resource_type: 'image',
        },
        (error, result) => {
          if (error || !result) {
            this.logger.error('Cloudinary gallery upload error:', error);
            return reject(new BadRequestException(error?.message || 'Cloudinary upload failed'));
          }
          resolve({
            imageUrl: result.secure_url,
            publicId: result.public_id,
          });
        },
      );
      uploadStream.end(file.buffer);
    });
  }

  /**
   * Public query: Returns all published gallery items ordered by displayOrder ASC, createdAt DESC.
   */
  async listForPublic(query?: ListGalleryQueryDto) {
    const where: any = {
      isPublished: true,
      ...(query?.category ? { category: query.category } : {}),
      ...(query?.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return this.prisma.galleryItem.findMany({
      where,
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Admin query: Returns all gallery items (including hidden drafts).
   */
  async listForAdmin(query?: ListGalleryQueryDto) {
    const where: any = {
      ...(query?.isPublished !== undefined ? { isPublished: query.isPublished } : {}),
      ...(query?.category ? { category: query.category } : {}),
      ...(query?.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return this.prisma.galleryItem.findMany({
      where,
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async getForAdmin(id: string) {
    const item = await this.prisma.galleryItem.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException('Gallery item not found');
    }
    return item;
  }

  async createForAdmin(adminId: string, dto: CreateGalleryItemDto, meta?: RequestMeta) {
    const title = dto.title?.trim();
    if (!title) {
      throw new BadRequestException('Title is required');
    }
    const imageUrl = dto.imageUrl?.trim();
    if (!imageUrl) {
      throw new BadRequestException('Image URL is required');
    }

    const item = await this.prisma.galleryItem.create({
      data: {
        title,
        description: dto.description?.trim() || null,
        imageUrl,
        altText: dto.altText?.trim() || title,
        category: dto.category?.trim() || null,
        displayOrder: dto.displayOrder !== undefined ? dto.displayOrder : 0,
        isPublished: dto.isPublished !== undefined ? dto.isPublished : true,
      },
    });

    await this.auditService.log(this.prisma, {
      actorId: adminId,
      action: 'GALLERY_ITEM_CREATE',
      entityType: 'GalleryItem',
      entityId: item.id,
      metadata: { title: item.title, category: item.category, ipAddress: meta?.ipAddress, userAgent: meta?.userAgent },
    }).catch(() => {});

    return item;
  }

  async updateForAdmin(adminId: string, id: string, dto: UpdateGalleryItemDto, meta?: RequestMeta) {
    const existing = await this.prisma.galleryItem.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Gallery item not found');
    }

    const title = dto.title !== undefined ? dto.title.trim() : existing.title;
    if (!title) {
      throw new BadRequestException('Title cannot be empty');
    }

    const imageUrl = dto.imageUrl !== undefined ? dto.imageUrl.trim() : existing.imageUrl;
    if (!imageUrl) {
      throw new BadRequestException('Image URL cannot be empty');
    }

    const item = await this.prisma.galleryItem.update({
      where: { id },
      data: {
        title,
        description: dto.description !== undefined ? dto.description.trim() || null : undefined,
        imageUrl,
        altText: dto.altText !== undefined ? dto.altText.trim() || title : undefined,
        category: dto.category !== undefined ? dto.category.trim() || null : undefined,
        displayOrder: dto.displayOrder !== undefined ? dto.displayOrder : undefined,
        isPublished: dto.isPublished !== undefined ? dto.isPublished : undefined,
      },
    });

    await this.auditService.log(this.prisma, {
      actorId: adminId,
      action: 'GALLERY_ITEM_UPDATE',
      entityType: 'GalleryItem',
      entityId: item.id,
      metadata: { title: item.title, category: item.category, ipAddress: meta?.ipAddress, userAgent: meta?.userAgent },
    }).catch(() => {});

    return item;
  }

  async deleteForAdmin(adminId: string, id: string, meta?: RequestMeta) {
    const existing = await this.prisma.galleryItem.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Gallery item not found');
    }

    await this.prisma.galleryItem.delete({ where: { id } });

    // Optional Cloudinary cleanup if image is hosted on Cloudinary
    if (existing.imageUrl && existing.imageUrl.includes('cloudinary.com')) {
      try {
        const matches = existing.imageUrl.match(/\/whatboutme_gallery\/([^\.\/]+)/);
        if (matches && matches[1]) {
          await cloudinary.uploader.destroy(`whatboutme_gallery/${matches[1]}`);
        }
      } catch (err: any) {
        this.logger.warn(`Could not destroy Cloudinary image for item ${id}: ${err.message}`);
      }
    }

    await this.auditService.log(this.prisma, {
      actorId: adminId,
      action: 'GALLERY_ITEM_DELETE',
      entityType: 'GalleryItem',
      entityId: id,
      metadata: { title: existing.title, ipAddress: meta?.ipAddress, userAgent: meta?.userAgent },
    }).catch(() => {});

    return { success: true, id };
  }
}
