import { Controller, Post } from '@nestjs/common';
import { CloudinaryMediaProvider } from './cloudinary.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '@prisma/client';

@Controller('media')
export class CloudinaryController {
  constructor(private readonly cloudinaryService: CloudinaryMediaProvider) {}

  // D2-008: Implement backend endpoint POST /media/upload-signature
  // Only admins or managers should be able to upload course media.
  @Post('upload-signature')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER)
  getUploadSignature() {
    return this.cloudinaryService.createDirectUpload();
  }
}
