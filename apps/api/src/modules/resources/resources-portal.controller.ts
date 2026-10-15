import {
  Controller,
  Get,
  Param,
  Query,
  Request,
} from '@nestjs/common';
import { ResourcesService } from './resources.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { AdminCache } from '../../common/decorators/cache-control.decorator.js';
import { Role, ResourceItemType } from '@prisma/client';

@Controller('portal/resources')
export class ResourcesPortalController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @Roles(Role.USER, Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER)
  @AdminCache(15, 60)
  @Get()
  async getLearnerResources(
    @Request() req: any,
    @Query('categoryId') categoryId?: string,
    @Query('type') type?: ResourceItemType,
    @Query('stepTagNumber') stepTagNumber?: string,
    @Query('search') search?: string,
  ) {
    const userId = req.user?.sub || req.user?.id;
    return this.resourcesService.findAllPortal(userId, {
      categoryId,
      type,
      stepTagNumber: stepTagNumber ? parseInt(stepTagNumber, 10) : undefined,
      search,
    });
  }

  @Roles(Role.USER, Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER)
  @Get(':id/view-token')
  async getResourceViewToken(@Param('id') id: string, @Request() req: any) {
    const userId = req.user?.sub || req.user?.id;
    return this.resourcesService.getPortalViewToken(id, userId);
  }
}
