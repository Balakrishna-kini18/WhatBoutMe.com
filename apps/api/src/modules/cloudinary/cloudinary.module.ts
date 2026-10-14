import { Module } from '@nestjs/common';
import { CloudinaryMediaProvider } from './cloudinary.service.js';
import { CloudinaryController } from './cloudinary.controller.js';
import { CloudinaryWebhookController } from './cloudinary.webhook.controller.js';
import { CloudinaryObjectStorageProvider } from './cloudinary-object-storage.service.js';
import { OBJECT_STORAGE_PROVIDER } from '../../common/interfaces/object-storage-provider.interface.js';
import { PrismaModule } from '../../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [CloudinaryController, CloudinaryWebhookController],
  providers: [
    CloudinaryMediaProvider,
    CloudinaryObjectStorageProvider,
    {
      provide: OBJECT_STORAGE_PROVIDER,
      useExisting: CloudinaryObjectStorageProvider,
    },
  ],
  exports: [
    CloudinaryMediaProvider,
    CloudinaryObjectStorageProvider,
    OBJECT_STORAGE_PROVIDER,
  ],
})
export class CloudinaryModule {}
