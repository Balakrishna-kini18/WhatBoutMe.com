import { Controller, Get, Req } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '@prisma/client';

@Controller('admin')
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER)
export class AdminDashboardController {
  constructor(private prisma: PrismaService) {}

  @Get('dashboard')
  async getDashboard(@Req() req: any) {
    const user = req?.user;
    const isManager = user && (user.role === Role.MANAGER || user.role === 'MANAGER' || user.role === 'TEACHER');

    if (isManager) {
      const managerId = user.sub || user.id;
      const batchWhere = {
        OR: [
          { managerId },
          { trainers: { some: { trainerId: managerId } } },
        ],
      };

      const [totalBatches, enrolledLearners] = await Promise.all([
        this.prisma.batch.count({ where: batchWhere }),
        this.prisma.enrolment.findMany({
          where: { batch: batchWhere },
          select: { userId: true },
          distinct: ['userId'],
        }),
      ]);

      const learnerIds = enrolledLearners.map((e) => e.userId);
      const totalLearners = learnerIds.length;

      const recentUsers = learnerIds.length > 0
        ? await this.prisma.user.findMany({
            take: 5,
            orderBy: { createdAt: 'desc' },
            where: { id: { in: learnerIds } },
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              enrolments: {
                take: 1,
                where: { batch: batchWhere },
                select: { status: true },
              },
            },
          })
        : [];

      const recentEnrolments = recentUsers.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        status: u.enrolments[0]?.status || 'Active',
      }));

      // Managers cannot view platform revenue or pricing (PDF Page 3-4)
      return {
        totalLearners,
        totalBatches,
        recentEnrolments,
        mockRevenue: null,
      };
    }

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
            select: { status: true },
          },
        },
      }),
    ]);

    const recentEnrolments = recentUsers.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.enrolments[0]?.status || 'Active',
    }));

    return {
      totalLearners,
      totalBatches,
      recentEnrolments,
      mockRevenue: '$28,500', // Keeping mock for admins
    };
  }
}
