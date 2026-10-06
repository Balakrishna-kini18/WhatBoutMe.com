import { Controller, Get, UseGuards } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '@prisma/client';

@Controller('admin')
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER)
export class AdminDashboardController {
  constructor(private prisma: PrismaService) {}

  @Get('dashboard')
  async getDashboard() {
    const [totalLearners, totalBatches, recentUsers] = await Promise.all([
      this.prisma.user.count({ where: { role: Role.USER } }),
      this.prisma.batch.count(),
      this.prisma.user.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        where: { role: Role.USER },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          enrolments: {
            take: 1,
            select: { status: true }
          }
        }
      })
    ]);

    const recentEnrolments = recentUsers.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.enrolments[0]?.status || 'Active'
    }));

    return {
      totalLearners,
      totalBatches,
      recentEnrolments,
      mockRevenue: '$28,500' // Keeping mock as in the frontend
    };
  }
}
