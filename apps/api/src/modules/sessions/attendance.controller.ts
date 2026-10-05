import { Controller, Get, Post, Request } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { attendanceDay, markDailyAttendance } from '../../common/daily-attendance.js';

/**
 * Daily attendance for the learner portal. A learner is present on a day when
 * they opened the portal or signed in, finished a course step, or joined a
 * live session.
 */
@Controller('attendance')
export class AttendanceController {
  constructor(private prisma: PrismaService) {}

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
}
