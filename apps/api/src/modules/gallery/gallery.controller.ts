import { Controller, Get, Query } from '@nestjs/common';
import { GalleryService } from './gallery.service.js';
import { ListGalleryQueryDto } from './dto/gallery.dto.js';

@Controller(['gallery', 'public/gallery', 'api/public/gallery'])
export class GalleryController {
  constructor(private readonly galleryService: GalleryService) {}

  @Get()
  listGallery(@Query() query: ListGalleryQueryDto) {
    return this.galleryService.listForPublic(query);
  }
}
