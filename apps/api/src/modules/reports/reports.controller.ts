import { Controller, Get, Param, Res, Req } from '@nestjs/common';
import { ReportsService } from './reports.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '@prisma/client';
import type { Response } from 'express';

@Controller('admin/reports')
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('attendance')
  async getAttendanceAnalytics(@Req() req: any) {
    return this.reportsService.getAttendanceAnalytics(req.user);
  }

  @Get('drop-offs')
  async getDropOffAnalytics(@Req() req: any) {
    return this.reportsService.getProgressDropOffAnalytics(req.user);
  }

  @Get('assessments')
  async getAssessmentAnalytics(@Req() req: any) {
    return this.reportsService.getAssessmentAnalytics(req.user);
  }

  @Get(':type/export')
  async exportCsv(@Param('type') type: string, @Res() res: Response, @Req() req: any) {
    try {
      const csv = await this.reportsService.getCsvExport(type, req.user);
      res.header('Content-Type', 'text/csv');
      res.attachment(`report-${type}.csv`);
      return res.send(csv);
    } catch (e: any) {
      return res.status(400).send(e.message);
    }
  }
}
