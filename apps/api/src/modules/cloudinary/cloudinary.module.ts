import { Module } from '@nestjs/common';
import { CloudinaryMediaProvider } from './cloudinary.service.js';

@Module({
  providers: [CloudinaryMediaProvider],
  exports: [CloudinaryMediaProvider],
})
export class CloudinaryModule {}
