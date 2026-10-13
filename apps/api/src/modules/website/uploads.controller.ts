import { BadRequestException, Controller, Post, Request } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PassThrough } from 'node:stream';
import { Roles } from '../../common/decorators/roles.decorator.js';

// Content types allowed to upload: images, documents, audio
const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/zip': 'zip',
};

/**
 * POST /uploads with the file as the raw request body and its type in the
 * Content-Type header. Returns the public address of the stored file.
 */
@Controller('uploads')
export class UploadsController {
  @Roles(Role.USER)
  @Post()
  async upload(@Request() req: any) {
    const type = String(req.headers['content-type'] || '').split(';')[0].trim();
    const extension = ALLOWED[type];
    if (!extension) {
      throw new BadRequestException('Only JPG, PNG, WebP, GIF images, PDF, DOCX, and TXT files can be uploaded');
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      throw new BadRequestException('The upload was empty');
    }

    return new Promise((resolve, reject) => {
      import('cloudinary').then(({ v2: cloudinary }) => {
        cloudinary.config({
          cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
          api_key: process.env.CLOUDINARY_API_KEY,
          api_secret: process.env.CLOUDINARY_API_SECRET,
        });

        const uploadStream = cloudinary.uploader.upload_stream(
          {
            resource_type: 'auto',
            type: 'upload',
            format: extension,
          },
          (error, result) => {
            if (error || !result) return reject(new BadRequestException('Cloudinary upload failed'));
            resolve({
              url: result.secure_url,
              name: result.public_id + '.' + extension,
              type,
              size: req.body.length
            });
          }
        );
        const bufferStream = new PassThrough();
        bufferStream.end(req.body);
        bufferStream.pipe(uploadStream);
      }).catch(reject);
    });
  }
}
