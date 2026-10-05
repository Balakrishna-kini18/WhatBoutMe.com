import { Module } from '@nestjs/common';
import { CloudinaryMediaProvider } from './cloudinary.service.js';
import { CloudinaryController } from './cloudinary.controller.js';
import { CloudinaryWebhookController } from './cloudinary.webhook.controller.js';

@Module({
  controllers: [CloudinaryController, CloudinaryWebhookController],
  providers: [CloudinaryMediaProvider],
  exports: [CloudinaryMediaProvider],
})
export class CloudinaryModule {}
