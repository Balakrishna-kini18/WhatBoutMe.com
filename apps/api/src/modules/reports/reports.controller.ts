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

  @Get('payments')
  async getPaymentAnalytics(@Req() req: any) {
    return this.reportsService.getPaymentAnalytics(req.user);
  }

  @Get('certificates')
  async getCertificateAnalytics(@Req() req: any) {
    return this.reportsService.getCertificateAnalytics(req.user);
  }

  @Get('batches/:batchId/attendance/export')
  async exportBatchAttendance(
    @Param('batchId') batchId: string,
    @Res() res: Response,
    @Req() req: any,
  ) {
    try {
      const format = req.query?.format === 'xlsx' ? 'xlsx' : 'csv';
      const result = await this.reportsService.exportBatchAttendance(batchId, req.user, format);
      res.header('Content-Type', result.contentType);
      res.attachment(result.filename);
      return res.send(result.csv);
    } catch (e: any) {
      const status = e.status || 400;
      return res.status(status).json({
        statusCode: status,
        message: e.message || 'Export error',
      });
    }
  }

  @Get(':type/export')
  async exportCsv(@Param('type') type: string, @Res() res: Response, @Req() req: any) {
    try {
      const csv = await this.reportsService.getCsvExport(type, req.user);
      res.header('Content-Type', 'text/csv; charset=utf-8');
      res.attachment(`report-${type}.csv`);
      return res.send(csv);
    } catch (e: any) {
      const status = e.status || 400;
      return res.status(status).json({
        statusCode: status,
        message: e.message || 'Export error',
      });
    }
  }
}
