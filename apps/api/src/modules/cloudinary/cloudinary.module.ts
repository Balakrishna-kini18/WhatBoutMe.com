import { Module } from '@nestjs/common';
import { CloudinaryMediaProvider } from './cloudinary.service.js';
import { CloudinaryController } from './cloudinary.controller.js';
import { CloudinaryWebhookController } from './cloudinary.webhook.controller.js';
import { CloudinaryObjectStorageProvider } from './cloudinary-object-storage.service.js';

@Module({
  controllers: [CloudinaryController, CloudinaryWebhookController],
  providers: [CloudinaryMediaProvider, CloudinaryObjectStorageProvider],
  exports: [CloudinaryMediaProvider, CloudinaryObjectStorageProvider],
})
export class CloudinaryModule {}
