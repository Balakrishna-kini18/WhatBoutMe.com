import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { OrgMemberRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OrgScopeGuard } from './guards/org-scope.guard.js';
import { OrgRoleGuard, RequireOrgRole } from './guards/org-role.guard.js';
import { OrganizationsService } from './organizations.service.js';
import { SeatPoolsService } from './seat-pools.service.js';
import { SeatsService } from './seats.service.js';
import { OrgAcademicTrackerService } from './org-academic-tracker.service.js';
import {
  AssignSeatDto,
  BulkInviteDto,
  SeatPoolCheckoutDto,
} from './dto/index.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Response } from 'express';

@Controller('org')
export class OrgPortalController {
  constructor(
    private readonly orgsService: OrganizationsService,
    private readonly seatPoolsService: SeatPoolsService,
    private readonly seatsService: SeatsService,
    private readonly trackerService: OrgAcademicTrackerService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Returns organizations that the currently logged-in user belongs to.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMyOrganizations(@Request() req: any) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId: req.user.id },
      include: {
        organization: {
          select: {
            id: true,
            orgCode: true,
            name: true,
            slug: true,
            logoUrl: true,
            status: true,
            isAuthorizedReseller: true,
            defaultCurrency: true,
          },
        },
      },
    });

    return memberships.map((m) => ({
      membershipId: m.id,
      role: m.role,
      title: m.title,
      isPrimary: m.isPrimary,
      organization: m.organization,
    }));
  }

  /**
   * Learner claims an invite token or reseller voucher code.
   */
  @Post('claim')
  @UseGuards(JwtAuthGuard)
  async claimSeat(
    @Body() body: { tokenOrCode: string },
    @Request() req: any,
  ) {
    return this.seatsService.claimSeat(body.tokenOrCode, req.user);
  }

  /**
   * Organization Executive Overview / Dashboard.
   */
  @Get(':orgId/overview')
  @UseGuards(JwtAuthGuard, OrgScopeGuard, OrgRoleGuard)
  @RequireOrgRole(OrgMemberRole.OWNER, OrgMemberRole.ADMIN, OrgMemberRole.VIEWER)
  async getOverview(@Param('orgId') orgId: string) {
    return this.orgsService.getOrganizationOverview(orgId);
  }

  /**
   * List all numbered student slots and live 6-Gate progression.
   */
  @Get(':orgId/slots')
  @UseGuards(JwtAuthGuard, OrgScopeGuard, OrgRoleGuard)
  @RequireOrgRole(OrgMemberRole.OWNER, OrgMemberRole.ADMIN, OrgMemberRole.VIEWER)
  async getSlots(
    @Param('orgId') orgId: string,
    @Query('batchId') batchId?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.trackerService.getLearnersTracker(orgId, batchId, { search, status });
  }

  /**
   * Export corporate compliance & academic progress CSV.
   */
  @Get(':orgId/slots/export')
  @UseGuards(JwtAuthGuard, OrgScopeGuard, OrgRoleGuard)
  @RequireOrgRole(OrgMemberRole.OWNER, OrgMemberRole.ADMIN, OrgMemberRole.VIEWER)
  async exportCsv(
    @Param('orgId') orgId: string,
    @Query('batchId') batchId: string | undefined,
    @Res() res: Response,
  ) {
    const csv = await this.trackerService.exportLearnersCsv(orgId, batchId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="wbm-org-${orgId}-report.csv"`,
    );
    res.send(csv);
  }

  /**
   * Assign a single numbered AVAILABLE slot to a student.
   */
  @Post(':orgId/slots/:seatId/assign')
  @UseGuards(JwtAuthGuard, OrgScopeGuard, OrgRoleGuard)
  @RequireOrgRole(OrgMemberRole.OWNER, OrgMemberRole.ADMIN)
  async assignSlot(
    @Param('orgId') orgId: string,
    @Param('seatId') seatId: string,
    @Body() dto: AssignSeatDto,
    @Request() req: any,
  ) {
    return this.seatsService.assignSeat(orgId, { ...dto, seatId }, req.user);
  }

  /**
   * Dry-run preflight check for bulk CSV upload.
   */
  @Post(':orgId/invites/preflight')
  @UseGuards(JwtAuthGuard, OrgScopeGuard, OrgRoleGuard)
  @RequireOrgRole(OrgMemberRole.OWNER, OrgMemberRole.ADMIN)
  async preflightBulk(
    @Param('orgId') orgId: string,
    @Body() dto: BulkInviteDto,
  ) {
    return this.seatsService.preflightBulkInvites(orgId, dto);
  }

  /**
   * Commit bulk slot assignments.
   */
  @Post(':orgId/invites/bulk')
  @UseGuards(JwtAuthGuard, OrgScopeGuard, OrgRoleGuard)
  @RequireOrgRole(OrgMemberRole.OWNER, OrgMemberRole.ADMIN)
  async commitBulk(
    @Param('orgId') orgId: string,
    @Body() dto: BulkInviteDto,
    @Request() req: any,
  ) {
    return this.seatsService.commitBulkInvites(orgId, dto, req.user);
  }

  /**
   * Revoke an unstarted / pre-agreement slot.
   */
  @Post(':orgId/slots/:seatId/revoke')
  @UseGuards(JwtAuthGuard, OrgScopeGuard, OrgRoleGuard)
  @RequireOrgRole(OrgMemberRole.OWNER, OrgMemberRole.ADMIN)
  async revokeSlot(
    @Param('orgId') orgId: string,
    @Param('seatId') seatId: string,
    @Body() body: { reason?: string },
    @Request() req: any,
  ) {
    return this.seatsService.revokeSeat(orgId, seatId, body.reason, req.user);
  }

  /**
   * Self-serve batch slot pool checkout initiation.
   */
  @Post(':orgId/seat-pools/checkout')
  @UseGuards(JwtAuthGuard, OrgScopeGuard, OrgRoleGuard)
  @RequireOrgRole(OrgMemberRole.OWNER)
  async initiateCheckout(
    @Param('orgId') orgId: string,
    @Body() dto: SeatPoolCheckoutDto,
    @Request() req: any,
  ) {
    return this.seatPoolsService.initiateCheckout(orgId, req.user.id, dto);
  }

  /**
   * Confirms payment in TEST_BYPASS mode during development and staging.
   */
  @Post(':orgId/seat-pools/:poolId/confirm-test-payment')
  @UseGuards(JwtAuthGuard, OrgScopeGuard, OrgRoleGuard)
  @RequireOrgRole(OrgMemberRole.OWNER)
  async confirmTestPayment(
    @Param('orgId') orgId: string,
    @Param('poolId') poolId: string,
    @Request() req: any,
  ) {
    return this.seatPoolsService.markPaid(poolId, req.user, {
      notes: 'Test bypass payment confirmed by Organization Owner',
    });
  }

  /**
   * Invoices and Billing history for Organization.
   */
  @Get(':orgId/billing')
  @UseGuards(JwtAuthGuard, OrgScopeGuard, OrgRoleGuard)
  @RequireOrgRole(OrgMemberRole.OWNER, OrgMemberRole.ADMIN)
  async getBillingHistory(@Param('orgId') orgId: string) {
    const [invoices, seatPools] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
      }),
      this.seatPoolsService.getSeatPoolsByOrg(orgId),
    ]);

    return { invoices, seatPools };
  }
}

