import { Controller, Get, Req } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role, InvoiceStatus } from '@prisma/client';

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

      const [totalBatches, enrolledLearners, totalCertificates, recentEnrolmentsList, allEnrolments] = await Promise.all([
        this.prisma.batch.count({ where: batchWhere }),
        this.prisma.enrolment.findMany({
          where: { batch: batchWhere },
          select: { userId: true },
          distinct: ['userId'],
        }),
        this.prisma.certificate.count({
          where: { enrolment: { batch: batchWhere } },
        }),
        this.prisma.enrolment.findMany({
          where: { batch: batchWhere },
          take: 5,
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: { id: true, name: true, email: true, role: true },
            },
            batch: {
              select: { id: true, name: true },
            },
            program: {
              select: { id: true, title: true },
            },
          },
        }),
        this.prisma.enrolment.findMany({
          where: { batch: batchWhere },
          select: { program: { select: { id: true, title: true } } },
        }),
      ]);

      const totalLearners = enrolledLearners.length;

      const recentEnrolments = recentEnrolmentsList.map((e) => ({
        id: e.id,
        userId: e.user.id,
        enrolmentId: e.id,
        name: e.user.name || 'Learner',
        email: e.user.email,
        role: e.user.role,
        status: e.status,
        createdAt: e.createdAt,
        batchId: e.batch?.id || null,
        batchName: e.batch?.name || null,
        programTitle: e.program?.title || null,
      }));

      const progCounts: Record<string, number> = {};
      allEnrolments.forEach((e) => {
        const title = e.program?.title || 'Unassigned';
        progCounts[title] = (progCounts[title] || 0) + 1;
      });
      const totalProgEnrolments = allEnrolments.length;
      const brandColors = ['#c97a1e', '#d8a86a', '#2c2825', '#8c8275', '#a39887'];
      const programDistribution = Object.entries(progCounts).map(([name, count], index) => ({
        name,
        count,
        percentage: totalProgEnrolments > 0 ? Math.round((count / totalProgEnrolments) * 100) : 0,
        color: brandColors[index % brandColors.length],
      }));

      // Managers cannot view platform revenue or pricing (PDF Page 3-4)
      return {
        totalLearners,
        totalBatches,
        totalCertificates,
        certificatesIssued: totalCertificates,
        recentEnrolments,
        programDistribution,
        totalRevenue: null,
        mockRevenue: null,
      };
    }

    // Super Admin / Admin
    const [totalLearners, totalBatches, totalCertificates, paidInvoices, recentEnrolmentsList, allEnrolments] = await Promise.all([
      this.prisma.user.count({ where: { role: Role.USER } }),
      this.prisma.batch.count(),
      this.prisma.certificate.count(),
      this.prisma.invoice.findMany({
        where: {
          status: { in: [InvoiceStatus.PAID, InvoiceStatus.REFUNDED] },
        },
        select: {
          amount: true,
          status: true,
          taxFields: true,
        },
      }),
      this.prisma.enrolment.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
          batch: {
            select: { id: true, name: true },
          },
          program: {
            select: { id: true, title: true },
          },
        },
      }),
      this.prisma.enrolment.findMany({
        select: { program: { select: { id: true, title: true } } },
      }),
    ]);

    // Financial calculations: recognize only PAID invoices, subtracting any credit notes/refunds
    const netRevenue = paidInvoices.reduce((sum, inv) => {
      if (inv.status !== InvoiceStatus.PAID) return sum;
      const taxFields = inv.taxFields as any;
      const totalCredited = Number(taxFields?.totalCredited) || 0;
      const net = Math.max(0, inv.amount - totalCredited);
      return sum + net;
    }, 0);

    const formattedRevenue = `$${Math.round(netRevenue).toLocaleString()}`;

    const recentEnrolments = recentEnrolmentsList.map((e) => ({
      id: e.id,
      userId: e.user.id,
      enrolmentId: e.id,
      name: e.user.name || 'Learner',
      email: e.user.email,
      role: e.user.role,
      status: e.status,
      createdAt: e.createdAt,
      batchId: e.batch?.id || null,
      batchName: e.batch?.name || null,
      programTitle: e.program?.title || null,
    }));

    const progCounts: Record<string, number> = {};
    allEnrolments.forEach((e) => {
      const title = e.program?.title || 'Unassigned';
      progCounts[title] = (progCounts[title] || 0) + 1;
    });
    const totalProgEnrolments = allEnrolments.length;
    const brandColors = ['#c97a1e', '#d8a86a', '#2c2825', '#8c8275', '#a39887'];
    const programDistribution = Object.entries(progCounts).map(([name, count], index) => ({
      name,
      count,
      percentage: totalProgEnrolments > 0 ? Math.round((count / totalProgEnrolments) * 100) : 0,
      color: brandColors[index % brandColors.length],
    }));

    return {
      totalLearners,
      totalBatches,
      totalCertificates,
      certificatesIssued: totalCertificates,
      totalRevenue: formattedRevenue,
      mockRevenue: formattedRevenue, // Maintained for backward compatibility
      recentEnrolments,
      programDistribution,
    };
  }
}
