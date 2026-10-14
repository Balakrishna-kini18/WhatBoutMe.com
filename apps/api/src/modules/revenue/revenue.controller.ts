import { Controller, Get, Req } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role, InvoiceStatus } from '@prisma/client';

@Controller('revenue')
@Roles(Role.SUPER_ADMIN, Role.ADMIN)
export class RevenueController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async getRevenueStats(@Req() _req: any) {
    const [invoices, standalonePayments] = await Promise.all([
      this.prisma.invoice.findMany({
        include: {
          payment: {
            include: {
              enrolment: {
                include: { user: true, program: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      typeof this.prisma.payment?.findMany === 'function'
        ? this.prisma.payment.findMany({
            where: { invoice: null },
            include: {
              enrolment: {
                include: { user: true, program: true },
              },
            },
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve([]),
    ]);

    // Track unique paid enrolments to prevent duplicate counts across multiple payments/invoices
    const paidEnrolmentIds = new Set<string>();

    // 1. Process invoices
    let recognizedInvoiceRevenue = 0;
    const paidInvoices = invoices.filter((inv) => inv.status === InvoiceStatus.PAID);

    const invoiceTransactions = invoices.map((inv) => {
      const taxFields = inv.taxFields as any;
      const totalCredited = Number(taxFields?.totalCredited) || 0;
      const isPaid = inv.status === InvoiceStatus.PAID;
      const netAmount = isPaid ? Math.max(0, inv.amount - totalCredited) : 0;

      if (isPaid && netAmount > 0) {
        recognizedInvoiceRevenue += netAmount;
        if (inv.payment?.enrolmentId) {
          paidEnrolmentIds.add(inv.payment.enrolmentId);
        }
      }

      return {
        id: inv.id,
        description: `Invoice ${inv.invoiceNumber}`,
        user:
          inv.payment?.enrolment?.user?.name ||
          inv.payment?.enrolment?.user?.email ||
          'Unknown',
        amount: `$${inv.amount.toLocaleString()}`,
        numericAmount: inv.amount,
        netAmount,
        status: inv.status,
        creditNoteId: inv.creditNoteId || null,
        totalCredited,
        date: new Date(inv.createdAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
        createdAt: inv.createdAt,
      };
    });

    // 2. Process standalone payments (payments without invoices)
    let recognizedPaymentRevenue = 0;
    let paidStandaloneCount = 0;

    const paymentTransactions = (standalonePayments || []).map((p: any) => {
      const isSucceeded = p.status === 'succeeded' || p.status === 'paid';
      if (isSucceeded && p.amount > 0) {
        recognizedPaymentRevenue += p.amount;
        paidStandaloneCount++;
        if (p.enrolmentId) {
          paidEnrolmentIds.add(p.enrolmentId);
        }
      }

      return {
        id: p.id,
        description: `Payment ${p.stripeSessionId?.startsWith('manual_') ? 'Manual' : p.stripeSessionId || p.id.slice(0, 8)}`,
        user:
          p.enrolment?.user?.name ||
          p.enrolment?.user?.email ||
          'Unknown',
        amount: `$${p.amount.toLocaleString()}`,
        numericAmount: p.amount,
        netAmount: isSucceeded ? p.amount : 0,
        status: isSucceeded ? 'PAID' : (p.status ? p.status.toUpperCase() : 'PENDING'),
        creditNoteId: null,
        totalCredited: 0,
        date: new Date(p.createdAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
        createdAt: p.createdAt,
      };
    });

    const totalRevenue = recognizedInvoiceRevenue + recognizedPaymentRevenue;

    // Merge transactions and sort by date descending
    const allTransactions = [...invoiceTransactions, ...paymentTransactions].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return {
      totalRevenue: `$${Math.round(totalRevenue).toLocaleString()}`,
      numericTotalRevenue: totalRevenue,
      mrr: null,
      mrrFormatted: 'Not supported',
      isRecurringBillingSupported: false,
      activeSubscribers: paidEnrolmentIds.size,
      paidEnrolmentsCount: paidEnrolmentIds.size,
      paidTransactionsCount: paidInvoices.length + paidStandaloneCount,
      totalInvoicesCount: invoices.length,
      transactions: allTransactions,
    };
  }
}
