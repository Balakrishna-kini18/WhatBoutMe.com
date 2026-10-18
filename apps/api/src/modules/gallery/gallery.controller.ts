import { Controller, Get, Query } from '@nestjs/common';
import { GalleryService } from './gallery.service.js';
import { ListGalleryQueryDto } from './dto/gallery.dto.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { PublicCache } from '../../common/decorators/cache-control.decorator.js';

@Controller(['gallery', 'public/gallery', 'api/public/gallery'])
export class GalleryController {
  constructor(private readonly galleryService: GalleryService) {}

  @Public()
  @PublicCache(60, 300)
  @Get()
  async listGallery(@Query() query: ListGalleryQueryDto) {
    const items = await this.galleryService.listForPublic(query);
    return { items, total: items.length };
  }
}
