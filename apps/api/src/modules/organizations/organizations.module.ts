import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { OrganizationsService } from './organizations.service.js';
import { SeatPoolsService } from './seat-pools.service.js';
import { SeatsService } from './seats.service.js';
import { OrgAcademicTrackerService } from './org-academic-tracker.service.js';
import { AdminOrganizationsController } from './admin-organizations.controller.js';
import { OrgPortalController } from './org-portal.controller.js';
import { OrgScopeGuard } from './guards/org-scope.guard.js';
import { OrgRoleGuard } from './guards/org-role.guard.js';

@Module({
  imports: [PrismaModule],
  controllers: [AdminOrganizationsController, OrgPortalController],
  providers: [
    OrganizationsService,
    SeatPoolsService,
    SeatsService,
    OrgAcademicTrackerService,
    OrgScopeGuard,
    OrgRoleGuard,
  ],
  exports: [
    OrganizationsService,
    SeatPoolsService,
    SeatsService,
    OrgAcademicTrackerService,
    OrgScopeGuard,
    OrgRoleGuard,
  ],
})
export class OrganizationsModule {}

