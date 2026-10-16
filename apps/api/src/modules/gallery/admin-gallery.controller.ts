import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { GalleryService } from './gallery.service.js';
import {
  CreateGalleryItemDto,
  ListGalleryQueryDto,
  UpdateGalleryItemDto,
} from './dto/gallery.dto.js';

@Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.MANAGER)
@Controller(['admin/gallery', 'api/admin/gallery'])
export class AdminGalleryController {
  constructor(private readonly galleryService: GalleryService) {}

  @Get()
  list(@Query() query: ListGalleryQueryDto) {
    return this.galleryService.listForAdmin(query);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  uploadImage(@UploadedFile() file: any) {
    return this.galleryService.uploadImage(file);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.galleryService.getForAdmin(id);
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateGalleryItemDto) {
    const adminId = req.user?.id || req.user?.userId || req.user?.sub || 'system';
    return this.galleryService.createForAdmin(adminId, dto, {
      ipAddress: req.ip,
      userAgent: req.headers?.['user-agent'],
    });
  }

  @Put(':id')
  updatePut(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateGalleryItemDto,
  ) {
    const adminId = req.user?.id || req.user?.userId || req.user?.sub || 'system';
    return this.galleryService.updateForAdmin(adminId, id, dto, {
      ipAddress: req.ip,
      userAgent: req.headers?.['user-agent'],
    });
  }

  @Patch(':id')
  updatePatch(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateGalleryItemDto,
  ) {
    const adminId = req.user?.id || req.user?.userId || req.user?.sub || 'system';
    return this.galleryService.updateForAdmin(adminId, id, dto, {
      ipAddress: req.ip,
      userAgent: req.headers?.['user-agent'],
    });
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    const adminId = req.user?.id || req.user?.userId || req.user?.sub || 'system';
    return this.galleryService.deleteForAdmin(adminId, id, {
      ipAddress: req.ip,
      userAgent: req.headers?.['user-agent'],
    });
  }
}
