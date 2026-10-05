import { Module } from '@nestjs/common';
import { CloudinaryMediaProvider } from './cloudinary.service.js';
import { CloudinaryController } from './cloudinary.controller.js';

@Module({
  controllers: [CloudinaryController],
  providers: [CloudinaryMediaProvider],
  exports: [CloudinaryMediaProvider],
})
export class CloudinaryModule {}
