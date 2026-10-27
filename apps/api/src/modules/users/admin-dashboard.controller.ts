import { Controller, Get, Optional, Query, Req, ForbiddenException } from '@nestjs/common';
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
          recentActivity: [],
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
        recentAuditLogs,
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
        typeof this.prisma.auditLog?.findMany === 'function'
          ? this.prisma.auditLog
              .findMany({
                where: {
                  entity: { not: 'UserSession' },
                  action: { notIn: ['LOGOUT', 'LOGIN', 'REFRESH_TOKEN'] },
                },
                take: 8,
                orderBy: { createdAt: 'desc' },
                select: {
                  id: true,
                  actorId: true,
                  action: true,
                  entity: true,
                  entityId: true,
                  meta: true,
                  createdAt: true,
                },
              })
              .catch(() => [])
          : Promise.resolve([]),
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

      // Clean USD-only subtitle per client specification
      const revenueSubtitle = 'Program & workshop revenue (USD)';

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

      const recentActivity = (recentAuditLogs || []).map((log: any) => ({
        id: log.id,
        actorId: log.actorId || null,
        action: log.action,
        entity: log.entity,
        entityId: log.entityId,
        meta: log.meta,
        createdAt: log.createdAt,
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
        recentActivity,
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

  /**
   * Forensic & Compliance Audit Logs endpoint strictly accessible to Super Admins (AGENTS.md Mandate #3).
   * Supports action filtering, entity filtering, date range filtering, search, pagination, and actor name resolution.
   */
  @Get('audit-logs')
  @Roles(Role.SUPER_ADMIN)
  async getAuditLogs(
    @Req() req: any,
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
    @Query('search') search?: string,
    @Query('action') action?: string,
    @Query('entity') entity?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const user = req?.user;
    if (user?.role !== Role.SUPER_ADMIN && user?.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Audit logs are strictly restricted to Super Administrators.');
    }

    const page = Math.max(1, parseInt(pageStr || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(limitStr || '25', 10) || 25));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (action && action.trim() && action !== 'ALL') {
      where.action = action.trim();
    }

    if (entity && entity.trim() && entity !== 'ALL') {
      where.entity = entity.trim();
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        if (!isNaN(start.getTime())) where.createdAt.gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        if (!isNaN(end.getTime())) {
          end.setHours(23, 59, 59, 999);
          where.createdAt.lte = end;
        }
      }
    }

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { action: { contains: q, mode: 'insensitive' } },
        { entity: { contains: q, mode: 'insensitive' } },
        { entityId: { contains: q, mode: 'insensitive' } },
        { actorId: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, rawLogs] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        take: limit,
        skip,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Resolve actor names where actorId is present
    const actorIds = Array.from(new Set(rawLogs.map((l) => l.actorId).filter(Boolean))) as string[];
    const actors = actorIds.length > 0
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, email: true, role: true },
        })
      : [];
    const actorMap = new Map(actors.map((a) => [a.id, a]));

    // Group target entity IDs to resolve human-readable labels
    const oneOnOneIds = rawLogs.filter((l) => l.entity === 'OneOnOneRequest').map((l) => l.entityId);
    const sessionIds = rawLogs.filter((l) => l.entity === 'Session').map((l) => l.entityId);
    const userIds = rawLogs.filter((l) => l.entity === 'User').map((l) => l.entityId);
    const enrolmentIds = rawLogs.filter((l) => l.entity === 'Enrolment').map((l) => l.entityId);
    const certificateIds = rawLogs.filter((l) => l.entity === 'Certificate').map((l) => l.entityId);
    const leadIds = rawLogs.filter((l) => l.entity === 'Lead').map((l) => l.entityId);
    const couponIds = rawLogs.filter((l) => l.entity === 'Coupon').map((l) => l.entityId);
    const eventIds = rawLogs.filter((l) => l.entity === 'Event').map((l) => l.entityId);

    const [oneOnOnes, sessions, users, enrolments, certificates, leads, coupons, events] = await Promise.all([
      oneOnOneIds.length > 0
        ? this.prisma.oneOnOneRequest.findMany({
            where: { id: { in: oneOnOneIds } },
            select: {
              id: true,
              user: { select: { name: true, email: true } },
              enrolment: { select: { program: { select: { title: true } } } },
            },
          })
        : [],
      sessionIds.length > 0
        ? this.prisma.session.findMany({
            where: { id: { in: sessionIds } },
            select: { id: true, title: true, sessionType: true },
          })
        : [],
      userIds.length > 0
        ? this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, email: true },
          })
        : [],
      enrolmentIds.length > 0
        ? this.prisma.enrolment.findMany({
            where: { id: { in: enrolmentIds } },
            select: {
              id: true,
              user: { select: { name: true } },
              program: { select: { title: true } },
            },
          })
        : [],
      certificateIds.length > 0
        ? this.prisma.certificate.findMany({
            where: { id: { in: certificateIds } },
            select: { id: true, certificateNumber: true, recipientName: true, programTitle: true },
          })
        : [],
      leadIds.length > 0
        ? this.prisma.lead.findMany({
            where: { id: { in: leadIds } },
            select: { id: true, name: true, email: true },
          })
        : [],
      couponIds.length > 0
        ? this.prisma.coupon.findMany({
            where: { id: { in: couponIds } },
            select: { id: true, code: true },
          })
        : [],
      eventIds.length > 0
        ? this.prisma.event.findMany({
            where: { id: { in: eventIds } },
            select: { id: true, title: true },
          })
        : [],
    ]);

    const oneOnOneMap = new Map(oneOnOnes.map((o) => [o.id, o]));
    const sessionMap = new Map(sessions.map((s) => [s.id, s]));
    const userTargetMap = new Map(users.map((u) => [u.id, u]));
    const enrolmentMap = new Map(enrolments.map((e) => [e.id, e]));
    const certMap = new Map(certificates.map((c) => [c.id, c]));
    const leadMap = new Map(leads.map((l) => [l.id, l]));
    const couponMap = new Map(coupons.map((c) => [c.id, c]));
    const eventMap = new Map(events.map((e) => [e.id, e]));

    const logs = rawLogs.map((log) => {
      const actor = log.actorId ? actorMap.get(log.actorId) : null;
      // Sanitize any sensitive tokens/passwords from meta
      const sanitizedMeta = log.meta ? JSON.parse(JSON.stringify(log.meta)) : null;
      if (sanitizedMeta && typeof sanitizedMeta === 'object') {
        delete sanitizedMeta.password;
        delete sanitizedMeta.token;
        delete sanitizedMeta.secret;
        delete sanitizedMeta.jwt;
        delete sanitizedMeta.refreshToken;
      }

      // Resolve human-readable target labels
      let targetLabel = log.entity;
      let targetSubLabel: string | null = null;

      if (log.entity === 'OneOnOneRequest') {
        const item = oneOnOneMap.get(log.entityId);
        targetLabel = item?.user?.name ? `1-on-1: ${item.user.name}` : '1-on-1 Coaching Request';
        targetSubLabel = item?.enrolment?.program?.title || item?.user?.email || null;
      } else if (log.entity === 'Session') {
        const item = sessionMap.get(log.entityId);
        targetLabel = item?.title ? item.title : 'Session';
        targetSubLabel = item?.sessionType ? item.sessionType.replace(/_/g, ' ') : null;
      } else if (log.entity === 'User') {
        const item = userTargetMap.get(log.entityId);
        targetLabel = item?.name ? `User: ${item.name}` : 'User Account';
        targetSubLabel = item?.email || null;
      } else if (log.entity === 'Enrolment') {
        const item = enrolmentMap.get(log.entityId);
        targetLabel = item?.user?.name ? `Enrolment: ${item.user.name}` : 'Course Enrolment';
        targetSubLabel = item?.program?.title || null;
      } else if (log.entity === 'Certificate') {
        const item = certMap.get(log.entityId);
        targetLabel = item?.recipientName ? `Certificate: ${item.recipientName}` : 'Certificate';
        targetSubLabel = item?.certificateNumber || item?.programTitle || null;
      } else if (log.entity === 'Lead') {
        const item = leadMap.get(log.entityId);
        targetLabel = item?.name ? `Lead: ${item.name}` : 'Lead';
        targetSubLabel = item?.email || null;
      } else if (log.entity === 'Coupon') {
        const item = couponMap.get(log.entityId);
        targetLabel = item?.code ? `Coupon: ${item.code}` : 'Coupon';
      } else if (log.entity === 'Event') {
        const item = eventMap.get(log.entityId);
        targetLabel = item?.title ? item.title : 'Event';
      }

      // Synthesize clean summary notes
      let summaryNote = sanitizedMeta?.reason || sanitizedMeta?.title || null;
      if (!summaryNote) {
        if (log.action === 'ONE_ON_ONE_APPROVED' && sanitizedMeta?.startTime) {
          summaryNote = `Approved & scheduled for ${new Date(sanitizedMeta.startTime).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'UTC',
          })} UTC`;
        } else if (log.action === 'ONE_ON_ONE_REQUESTED' && sanitizedMeta?.requestedStart) {
          summaryNote = `Requested for ${new Date(sanitizedMeta.requestedStart).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'UTC',
          })} UTC`;
        } else if (sanitizedMeta?.feedback) {
          summaryNote = sanitizedMeta.feedback;
        }
      }

      return {
        id: log.id,
        actorId: log.actorId,
        actorName: actor?.name || (log.actorId ? 'Staff Member' : 'System Automation'),
        actorEmail: actor?.email || null,
        actorRole: actor?.role || (log.actorId ? 'STAFF' : 'SYSTEM'),
        action: log.action,
        entity: log.entity,
        entityId: log.entityId,
        targetLabel,
        targetSubLabel,
        summaryNote,
        meta: sanitizedMeta,
        ip: log.ip,
        createdAt: log.createdAt,
      };
    });

    return {
      data: logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }
}

