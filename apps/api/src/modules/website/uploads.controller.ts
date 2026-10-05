import { BadRequestException, Controller, Post, Request } from '@nestjs/common';
import { Role } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UPLOAD_DIR } from './storage.js';

// Content types an admin may upload, and the extension each is stored with.
// SVG is left out on purpose: it can carry scripts.
const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
};

/**
 * POST /uploads with the file as the raw request body and its type in the
 * Content-Type header. Returns the public address of the stored file.
 */
@Controller('uploads')
export class UploadsController {
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Post()
  async upload(@Request() req: any) {
    const type = String(req.headers['content-type'] || '').split(';')[0].trim();
    const extension = ALLOWED[type];
    if (!extension) {
      throw new BadRequestException('Only JPG, PNG, WebP, GIF images and PDF files can be uploaded');
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      throw new BadRequestException('The upload was empty');
    }

    const name = `${randomUUID()}.${extension}`;
    await writeFile(join(UPLOAD_DIR, name), req.body);

    const base = process.env.PUBLIC_API_URL || `${req.protocol}://${req.get('host')}`;
    return { url: `${base}/uploads/${name}`, name, type, size: req.body.length };
  }
}
