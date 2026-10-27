import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role, MissionStatementStatus } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { MissionStatementsService } from './mission-statements.service.js';
import {
  SubmitMissionStatementDto,
  ReviewMissionStatementDto,
} from './dto/index.js';

@Controller(['mission-statements', 'admin/mission-statements'])
@UseGuards(RolesGuard)
export class MissionStatementsController {
  constructor(
    private readonly missionStatementsService: MissionStatementsService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // LEARNER ENDPOINTS (STAGE 5 SUBMISSION & HISTORY)
  // ─────────────────────────────────────────────────────────────────────────────

  @Roles(Role.USER, Role.ADMIN, Role.SUPER_ADMIN)
  @Post(['submit', 'upload'])
  @UseInterceptors(FileInterceptor('file'))
  async submit(
    @Req() req: any,
    @Body() dto: SubmitMissionStatementDto,
    @UploadedFile() file: any,
  ) {
    const userId = req.user?.sub ?? req.user?.id;
    return this.missionStatementsService.submit(userId, dto.enrolmentId, file);
  }

  @Roles(Role.USER, Role.ADMIN, Role.SUPER_ADMIN)
  @Get('my-submissions')
  async getMySubmissions(
    @Req() req: any,
    @Query('enrolmentId') enrolmentId?: string,
  ) {
    const userId = req.user?.sub ?? req.user?.id;
    return this.missionStatementsService.getMySubmissions(userId, enrolmentId);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ADMIN & INSTRUCTOR REVIEW QUEUE
  // ─────────────────────────────────────────────────────────────────────────────

  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER)
  @Get()
  async getAllSubmissions(
    @Req() req: any,
    @Query('status') status?: MissionStatementStatus,
  ) {
    return this.missionStatementsService.getAllSubmissions(status, req.user);
  }

  @Roles(Role.USER, Role.ADMIN, Role.SUPER_ADMIN, Role.MANAGER)
  @Get(':id')
  async getById(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.missionStatementsService.getById(id, req.user);
  }

  @Public()
  @Get([':id/file', 'download/:id'])
  async getFile(
    @Param('id') id: string,
    @Res() res: any,
  ) {
    const { filePath, mimeType, fileName } = await this.missionStatementsService.getFilePath(id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    return res.sendFile(filePath);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Post(':id/approve')
  async approve(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto?: ReviewMissionStatementDto,
  ) {
    const reviewerId = req.user?.sub ?? req.user?.id;
    return this.missionStatementsService.approve(id, reviewerId, dto);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Post(':id/reject')
  async reject(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ReviewMissionStatementDto,
  ) {
    const reviewerId = req.user?.sub ?? req.user?.id;
    return this.missionStatementsService.reject(id, reviewerId, dto);
  }
}
