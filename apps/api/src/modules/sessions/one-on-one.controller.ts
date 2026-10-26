import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Role, OneOnOneRequestStatus } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { OneOnOneService } from './one-on-one.service.js';
import {
  CreateOneOnOneRequestDto,
  ApproveOneOnOneRequestDto,
  RejectOneOnOneRequestDto,
} from './dto/one-on-one.dto.js';

@Controller('one-on-one')
@UseGuards(RolesGuard)
export class OneOnOneController {
  constructor(private readonly oneOnOneService: OneOnOneService) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // LEARNER ENDPOINTS (STAGE 4 GATED)
  // ─────────────────────────────────────────────────────────────────────────────

  @Roles(Role.USER, Role.ADMIN, Role.SUPER_ADMIN)
  @Post('requests')
  async createRequest(
    @Request() req: any,
    @Body() dto: CreateOneOnOneRequestDto,
  ) {
    const userId = req.user?.sub ?? req.user?.id;
    return this.oneOnOneService.createRequest(userId, dto);
  }

  @Roles(Role.USER, Role.ADMIN, Role.SUPER_ADMIN)
  @Get('my-requests')
  async getMyRequests(@Request() req: any) {
    const userId = req.user?.sub ?? req.user?.id;
    return this.oneOnOneService.getMyRequests(userId);
  }

  @Roles(Role.USER, Role.ADMIN, Role.SUPER_ADMIN)
  @Delete('requests/:id')
  async cancelRequest(
    @Request() req: any,
    @Param('id') id: string,
  ) {
    const userId = req.user?.sub ?? req.user?.id;
    return this.oneOnOneService.cancelRequest(userId, id);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ADMIN & MANAGER QUEUE & APPROVAL
  // ─────────────────────────────────────────────────────────────────────────────

  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER)
  @Get('requests')
  async getAllRequests(
    @Request() req: any,
    @Query('status') status?: OneOnOneRequestStatus,
  ) {
    return this.oneOnOneService.getAllRequests(status, req.user);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER)
  @Post('requests/:id/approve')
  async approveRequest(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: ApproveOneOnOneRequestDto,
  ) {
    const adminId = req.user?.sub ?? req.user?.id;
    return this.oneOnOneService.approveRequest(id, adminId, dto, req.user);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER)
  @Post('requests/:id/reject')
  async rejectRequest(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: RejectOneOnOneRequestDto,
  ) {
    const adminId = req.user?.sub ?? req.user?.id;
    return this.oneOnOneService.rejectRequest(id, adminId, dto, req.user);
  }
}
