import { Controller, Get, Optional, Req } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role, InvoiceStatus } from '@prisma/client';
import { AdminCache } from '../../common/decorators/cache-control.decorator.js';
import { CacheHelperService } from '../../common/cache/cache-helper.service.js';

@Controller('admin')
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER)
export class AdminDashboardController {
  constructor(
    private prisma: PrismaService,
    @Optional() private cacheHelper?: CacheHelperService,
  ) {}

  @AdminCache(15, 60)
  @Get('dashboard')
  async getDashboard(@Req() req: any) {
    const user = req?.user;
    const isManager = user && (user.role === Role.MANAGER || user.role === 'MANAGER' || user.role === 'TEACHER');

    const fetcher = async () => {
      if (isManager) {
        const managerId = user.sub || user.id;
        const batchWhere = {
          OR: [
            { managerId },
            { trainers: { some: { trainerId: managerId } } },
          ],
        };

        const [
          totalBatches,
          enrolledLearners,
          totalCertificates,
          pendingCertificates,
          unmatchedAttendance,
          recentEnrolmentsList,
          allEnrolments,
        ] = await Promise.all([
          this.prisma.batch.count({ where: batchWhere }),
          this.prisma.enrolment.findMany({
            where: { batch: batchWhere },
            select: { userId: true },
            distinct: ['userId'],
          }),
          this.prisma.certificate.count({
            where: { enrolment: { batch: batchWhere } },
          }),
          this.prisma.certificate.count({
            where: { status: 'PENDING', enrolment: { batch: batchWhere } },
          }).catch(() => 0),
          (this.prisma.unmatchedAttendance?.count
            ? this.prisma.unmatchedAttendance.count({
                where: { status: 'UNMATCHED', session: { batch: batchWhere } },
              })
            : Promise.resolve(0)
          ).catch(() => 0),
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
          pendingCertificatesCount: pendingCertificates,
          unmatchedAttendanceCount: unmatchedAttendance,
          recentEnrolments,
          programDistribution,
          totalRevenue: null,
          mockRevenue: null,
        };
      }

      // Super Admin / Admin
      const [
        totalLearners,
        totalBatches,
        totalCertificates,
        pendingCertificates,
        unmatchedAttendance,
        paidInvoices,
        recentEnrolmentsList,
        allEnrolments,
      ] = await Promise.all([
        this.prisma.user.count({ where: { role: Role.USER } }),
        this.prisma.batch.count(),
        this.prisma.certificate.count(),
        this.prisma.certificate.count({ where: { status: 'PENDING' } }).catch(() => 0),
        (this.prisma.unmatchedAttendance?.count
          ? this.prisma.unmatchedAttendance.count({ where: { status: 'UNMATCHED' } })
          : Promise.resolve(0)
        ).catch(() => 0),
        this.prisma.invoice.findMany({
          where: {
            status: { in: [InvoiceStatus.PAID, InvoiceStatus.REFUNDED] },
          },
          select: {
            amount: true,
            currency: true,
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
      const byCurrency: Record<string, number> = { USD: 0, AED: 0, INR: 0 };
      for (const inv of paidInvoices) {
        if (inv.status !== InvoiceStatus.PAID) continue;
        const taxFields = inv.taxFields as any;
        const totalCredited = Number(taxFields?.totalCredited) || 0;
        const net = Math.max(0, inv.amount - totalCredited);
        const curr = (inv.currency || 'USD').toUpperCase();
        if (curr in byCurrency) {
          byCurrency[curr] += net;
        } else {
          byCurrency[curr] = (byCurrency[curr] || 0) + net;
        }
      }

      // Convert to normalized USD (1 USD = 83 INR, 1 USD = 3.67 AED)
      const normalizedUSD = (byCurrency.USD || 0) + ((byCurrency.AED || 0) / 3.67) + ((byCurrency.INR || 0) / 83);
      const formattedRevenue = `$${Math.round(normalizedUSD).toLocaleString()}`;

      // Build helpful subtitle showing multi-currency breakdown if non-USD currencies exist
      const activeCurrencies: string[] = [];
      if (byCurrency.USD > 0) activeCurrencies.push(`$${Math.round(byCurrency.USD).toLocaleString()}`);
      if (byCurrency.AED > 0) activeCurrencies.push(`AED ${Math.round(byCurrency.AED).toLocaleString()}`);
      if (byCurrency.INR > 0) activeCurrencies.push(`₹${Math.round(byCurrency.INR).toLocaleString('en-IN')}`);

      const revenueSubtitle = (byCurrency.AED > 0 || byCurrency.INR > 0)
        ? `USD Equiv. (${activeCurrencies.join(' · ')})`
        : 'Program enrolment revenue';

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
        pendingCertificatesCount: pendingCertificates,
        unmatchedAttendanceCount: unmatchedAttendance,
        totalRevenue: formattedRevenue,
        revenueSubtitle,
        currencies: byCurrency,
        mockRevenue: formattedRevenue, // Maintained for backward compatibility
        recentEnrolments,
        programDistribution,
      };
    };

    if (!this.cacheHelper) {
      return fetcher();
    }

    const cacheKey = await this.cacheHelper.getEndpointKey(
      'admin_dashboard',
      user?.role || 'ADMIN',
      { managerId: isManager ? (user.sub || user.id) : 'all' },
    );

    return this.cacheHelper.getOrSet(cacheKey, fetcher, 60, ['dashboard']);
  }
}
