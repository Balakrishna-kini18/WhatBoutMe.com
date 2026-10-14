import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { CloudinaryModule } from '../cloudinary/cloudinary.module.js';
import { AuditModule } from '../../common/audit/audit.module.js';
import { ResourcesService } from './resources.service.js';
import { ResourcesAdminController } from './resources-admin.controller.js';
import { ResourcesPortalController } from './resources-portal.controller.js';

@Module({
  imports: [PrismaModule, CloudinaryModule, AuditModule],
  controllers: [ResourcesAdminController, ResourcesPortalController],
  providers: [ResourcesService],
  exports: [ResourcesService],
})
export class ResourcesModule {}
