import { BadRequestException, Controller, Post, Request } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PassThrough } from 'node:stream';
import { Roles } from '../../common/decorators/roles.decorator.js';

// Content types allowed to upload: images, documents, audio, and video
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
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-msvideo': 'avi',
  'video/mpeg': 'mpeg',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
};

/**
 * POST /uploads with the file as the raw request body and its type in the
 * Content-Type header. Returns the public address of the stored file.
 */
@Controller('uploads')
export class UploadsController {
  @Roles(Role.USER, Role.ADMIN, Role.SUPER_ADMIN, Role.MANAGER)
  @Post()
  async upload(@Request() req: any) {
    const type = String(req.headers['content-type'] || '').split(';')[0].trim();
    const extension = ALLOWED[type];
    if (!extension) {
      throw new BadRequestException('Only JPG, PNG, WebP, GIF images, PDF, DOCX, TXT, MP4/MOV videos, and MP3 audios can be uploaded');
    }
    let buffer: Buffer | null = null;
    if (Buffer.isBuffer(req.body) && req.body.length > 0) {
      buffer = req.body;
    } else if (req.body instanceof Uint8Array && req.body.length > 0) {
      buffer = Buffer.from(req.body);
    } else if (typeof req.body === 'string' && req.body.length > 0) {
      buffer = Buffer.from(req.body, 'binary');
    } else {
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        if (chunks.length > 0) {
          buffer = Buffer.concat(chunks);
        }
      } catch {
        // Stream already consumed
      }
    }

    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('The upload was empty');
    }

    const isVideoOrAudio = type.startsWith('video/') || type.startsWith('audio/');
    const isPdfOrDoc =
      type === 'application/pdf' ||
      type === 'application/zip' ||
      type.startsWith('application/msword') ||
      type.includes('officedocument') ||
      type === 'text/plain';

    return new Promise((resolve, reject) => {
      import('cloudinary').then(({ v2: cloudinary }) => {
        cloudinary.config({
          cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
          api_key: process.env.CLOUDINARY_API_KEY,
          api_secret: process.env.CLOUDINARY_API_SECRET,
        });

        const uploadStream = cloudinary.uploader.upload_stream(
          {
            resource_type: isVideoOrAudio ? 'video' : isPdfOrDoc ? 'raw' : 'auto',
            type: 'upload',
            ...(isPdfOrDoc ? {} : { format: extension }),
          },
          (error, result) => {
            if (error || !result) {
              console.error('Cloudinary upload failure:', error);
              return reject(new BadRequestException(error?.message || 'Cloudinary upload failed'));
            }
            const publicName = result.public_id.endsWith('.' + extension)
              ? result.public_id
              : `${result.public_id}.${extension}`;
            resolve({
              url: result.secure_url,
              name: publicName,
              type,
              size: buffer.length
            });
          }
        );
        const bufferStream = new PassThrough();
        bufferStream.end(buffer);
        bufferStream.pipe(uploadStream);
      }).catch(reject);
    });
  }
}
