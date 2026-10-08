import { Controller, Get, Post, Patch, Param, Body, Request, UseGuards } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AttendanceService } from './attendance.service.js';
import { attendanceDay, markDailyAttendance } from '../../common/daily-attendance.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { Permission } from '../../config/permissions.config.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { OverrideAttendanceDto } from './dto/index.js';

/**
 * Daily attendance for the learner portal. A learner is present on a day when
 * they opened the portal or signed in, finished a course step, or joined a
 * live session.
 */
@Controller('attendance')
export class AttendanceController {
  constructor(
    private prisma: PrismaService,
    private attendanceService: AttendanceService,
  ) {}

  /** Called by the learner portal when it is opened. */
  @Post('visit')
  async visit(@Request() req: any) {
    await markDailyAttendance(this.prisma, req.user.sub, 'visited');
    return { date: attendanceDay() };
  }

  @Get('mine')
  async mine(@Request() req: any) {
    const days = await this.prisma.dailyAttendance.findMany({
      where: { userId: req.user.sub },
      orderBy: { date: 'desc' },
      select: { date: true, visited: true, lessonDone: true, sessionJoined: true },
    });
    return { today: attendanceDay(), days };
  }

  /**
   * D1-050: Manual Attendance Override
   */
  @UseGuards(PermissionsGuard)
  @RequirePermission(Permission.ATTENDANCE_CORRECT)
  @Patch(':id/override')
  async overrideAttendance(
    @Param('id') id: string,
    @Body() dto: OverrideAttendanceDto,
    @Request() req: any
  ) {
    const actor = {
      id: req.user.sub ?? req.user.userId ?? req.user.id,
      role: req.user.role,
    };
    return this.attendanceService.overrideAttendanceById(id, dto.status, actor, dto.correctionReason);
  }
}
