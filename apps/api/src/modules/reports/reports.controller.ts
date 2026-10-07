import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service.js';
import type { Response } from 'express';

@Controller('admin/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('attendance')
  async getAttendanceAnalytics() {
    return this.reportsService.getAttendanceAnalytics();
  }

  @Get('drop-offs')
  async getDropOffAnalytics() {
    return this.reportsService.getProgressDropOffAnalytics();
  }

  @Get('assessments')
  async getAssessmentAnalytics() {
    return this.reportsService.getAssessmentAnalytics();
  }

  @Get(':type/export')
  async exportCsv(@Param('type') type: string, @Res() res: Response) {
    try {
      const csv = await this.reportsService.getCsvExport(type);
      res.header('Content-Type', 'text/csv');
      res.attachment(`report-${type}.csv`);
      return res.send(csv);
    } catch (e: any) {
      return res.status(400).send(e.message);
    }
  }
}
