import { Module } from '@nestjs/common';
import { GalleryController } from './gallery.controller.js';
import { AdminGalleryController } from './admin-gallery.controller.js';
import { GalleryService } from './gallery.service.js';

@Module({
  controllers: [GalleryController, AdminGalleryController],
  providers: [GalleryService],
  exports: [GalleryService],
})
export class GalleryModule {}
