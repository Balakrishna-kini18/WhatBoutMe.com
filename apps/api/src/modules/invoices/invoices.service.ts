import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class InvoicesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const invoices = await this.prisma.invoice.findMany({
      include: {
        payment: {
          include: {
            enrolment: {
              include: { user: true }
            }
          }
        }
      }
    });

    return invoices.map(inv => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      client: inv.payment?.enrolment?.user?.name || 'Unknown',
      amount: `$${inv.amount.toLocaleString()}`,
      status: inv.status,
      date: new Date(inv.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    }));
  }
}
