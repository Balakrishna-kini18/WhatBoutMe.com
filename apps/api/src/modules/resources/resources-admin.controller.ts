import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ResourcesService } from './resources.service.js';
import {
  CreateResourceDto,
  UpdateResourceDto,
  RequestUploadUrlDto,
  CreateCategoryDto,
  UpdateCategoryDto,
  QueryResourceDto,
} from './dto/index.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { AdminCache } from '../../common/decorators/cache-control.decorator.js';
import { Role } from '@prisma/client';

@Controller('admin/resources')
export class ResourcesAdminController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER)
  @Post('upload-url')
  async generateUploadUrl(@Body() dto: RequestUploadUrlDto, @Request() req: any) {
    const userId = req.user?.sub || req.user?.id;
    const userRole = req.user?.role as Role;
    return this.resourcesService.generateUploadUrl(userId, userRole, dto);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER)
  @AdminCache(15, 60)
  @Get('categories')
  async getCategories() {
    return this.resourcesService.findAllCategories();
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Post('categories')
  async createCategory(@Body() dto: CreateCategoryDto, @Request() req: any) {
    const userId = req.user?.sub || req.user?.id;
    return this.resourcesService.createCategory(dto, userId);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Patch('categories/:id')
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @Request() req: any,
  ) {
    const userId = req.user?.sub || req.user?.id;
    return this.resourcesService.updateCategory(id, dto, userId);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Delete('categories/:id')
  async deleteCategory(@Param('id') id: string, @Request() req: any) {
    const userId = req.user?.sub || req.user?.id;
    return this.resourcesService.deleteCategory(id, userId);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER)
  @AdminCache(15, 60)
  @Get()
  async getResources(@Query() query: QueryResourceDto, @Request() req: any) {
    const userId = req.user?.sub || req.user?.id;
    const userRole = req.user?.role as Role;
    return this.resourcesService.findAllAdmin(userId, userRole, query);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER)
  @Post()
  async createResource(
    @Body() dto: CreateResourceDto,
    @Request() req: any,
  ) {
    const userId = req.user?.sub || req.user?.id;
    const userRole = req.user?.role as Role;
    const reason = req.body?.reason;
    return this.resourcesService.createResource(userId, userRole, dto, reason);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER)
  @AdminCache(15, 60)
  @Get(':id')
  async getResource(@Param('id') id: string, @Request() req: any) {
    const userId = req.user?.sub || req.user?.id;
    const userRole = req.user?.role as Role;
    return this.resourcesService.findOneAdmin(id, userId, userRole);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER)
  @Get(':id/preview-token')
  async getPreviewToken(@Param('id') id: string, @Request() req: any) {
    const userId = req.user?.sub || req.user?.id;
    const userRole = req.user?.role as Role;
    const resource = await this.resourcesService.findOneAdmin(id, userId, userRole);
    const signedUrl = await (this.resourcesService as any).storageProvider.getPresignedGetUrl(
      resource.storageKey,
      300,
    );
    return {
      signedUrl,
      resource: {
        id: resource.id,
        title: resource.title,
        type: resource.type,
        mimeType: resource.mimeType,
        pageCount: resource.pageCount,
        durationSeconds: resource.durationSeconds,
      },
      watermark: {
        learnerName: req.user?.name || 'Administrator Preview',
        learnerEmail: req.user?.email || 'admin@whatboutme.com',
        timestamp: new Date().toISOString(),
      },
      expiresInSeconds: 300,
    };
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER)
  @Patch(':id')
  async updateResource(
    @Param('id') id: string,
    @Body() dto: UpdateResourceDto,
    @Request() req: any,
  ) {
    const userId = req.user?.sub || req.user?.id;
    const userRole = req.user?.role as Role;
    const reason = req.body?.reason;
    return this.resourcesService.updateResource(id, userId, userRole, dto, reason);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER)
  @Delete(':id')
  async deleteResource(@Param('id') id: string, @Request() req: any) {
    const userId = req.user?.sub || req.user?.id;
    const userRole = req.user?.role as Role;
    const reason = req.body?.reason;
    return this.resourcesService.deleteResource(id, userId, userRole, reason);
  }
}
