import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '@prisma/client';

@Controller('revenue')
@Roles(Role.SUPER_ADMIN, Role.ADMIN)
export class RevenueController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async getRevenueStats() {
    const invoices = await this.prisma.invoice.findMany({
      include: {
        payment: { include: { enrolment: { include: { user: true } } } }
      }
    });

    const totalRevenue = invoices.reduce((sum, inv) => sum + (inv.status === 'PAID' || inv.status === 'ISSUED' ? inv.amount : 0), 0);
    const mrr = totalRevenue > 0 ? totalRevenue * 0.1 : 0; // Mock MRR calculation

    const transactions = invoices.map(inv => ({
      id: inv.id,
      description: `Invoice ${inv.invoiceNumber}`,
      user: inv.payment?.enrolment?.user?.name || 'Unknown',
      amount: `$${inv.amount.toLocaleString()}`,
      status: inv.status,
      date: new Date(inv.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    }));

    return {
      totalRevenue: `$${totalRevenue.toLocaleString()}`,
      mrr: `$${mrr.toLocaleString()}`,
      activeSubscribers: invoices.filter(i => i.status === 'PAID').length,
      transactions,
    };
  }
}
