import { Controller, Post, Get, Param, Res } from '@nestjs/common';
import { CloudinaryMediaProvider } from './cloudinary.service.js';
import { CloudinaryObjectStorageProvider } from './cloudinary-object-storage.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator.js';

@Controller('media')
export class CloudinaryController {
  constructor(
    private readonly cloudinaryService: CloudinaryMediaProvider,
    private readonly objectStorage: CloudinaryObjectStorageProvider
  ) {}

  // D2-008: Implement backend endpoint POST /media/upload-signature
  // Only admins should be able to upload course media. Managers cannot edit course content.
  @Post('upload-signature')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  getUploadSignature() {
    return this.cloudinaryService.createDirectUpload();
  }

  // D2-016: Redirect to secure streaming CDN URL (Requires valid authenticated session)
  @Get('stream/*key')
  async streamMedia(@Param('key') key: string, @Res() res: Response) {
    try {
      // 1. Get the securely signed Cloudinary URL with a 5-minute TTL
      const signedUrl = await this.objectStorage.getPresignedGetUrl(key, 300);
      
      // 2. helmet() sends CORP: same-origin, which makes the browser block a
      // <video> on the LMS origin from loading this route. Allow it here only.
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

      // 3. Redirect the client to the CDN URL to properly support Range requests and seeking
      res.redirect(302, signedUrl);
    } catch (error: any) {
      console.error('Error generating signed URL:', error);
      res.status(500).send('Internal Server Error');
    }
  }
}
