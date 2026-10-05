import { Controller, Post, Get, Param, Res, HttpException, HttpStatus } from '@nestjs/common';
import { CloudinaryMediaProvider } from './cloudinary.service.js';
import { CloudinaryObjectStorageProvider } from './cloudinary-object-storage.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '@prisma/client';
import { Response } from 'express';
import { Readable } from 'stream';

@Controller('media')
export class CloudinaryController {
  constructor(
    private readonly cloudinaryService: CloudinaryMediaProvider,
    private readonly objectStorage: CloudinaryObjectStorageProvider
  ) {}

  // D2-008: Implement backend endpoint POST /media/upload-signature
  // Only admins or managers should be able to upload course media.
  @Post('upload-signature')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER)
  getUploadSignature() {
    return this.cloudinaryService.createDirectUpload();
  }

  // D2-016: Implement secure streaming fallback proxy with security headers
  @Get('stream/:key(*)')
  async streamMedia(@Param('key') key: string, @Res() res: Response) {
    try {
      // 1. Get the securely signed Cloudinary URL with a 5-minute TTL
      const signedUrl = await this.objectStorage.getPresignedGetUrl(key, 300);
      
      // 2. Fetch the file via the backend to hide the real URL from the client
      const response = await fetch(signedUrl);
      if (!response.ok) {
        throw new HttpException('Media not found or inaccessible', HttpStatus.NOT_FOUND);
      }

      // 3. Set strict security headers
      res.setHeader('Content-Disposition', 'inline'); // Force inline viewing, not download
      res.setHeader('X-Content-Type-Options', 'nosniff'); // Prevent MIME-sniffing
      
      // 4. Pass through standard headers
      const contentType = response.headers.get('content-type');
      if (contentType) res.setHeader('Content-Type', contentType);
      
      const contentLength = response.headers.get('content-length');
      if (contentLength) res.setHeader('Content-Length', contentLength);

      // 5. Pipe the stream directly to the Express response
      if (response.body) {
        const readable = Readable.fromWeb(response.body as any);
        readable.pipe(res);
      } else {
        res.end();
      }
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new HttpException('Error streaming media', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
