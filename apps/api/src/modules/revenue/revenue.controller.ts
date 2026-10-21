import { Controller, Get, Req } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role, InvoiceStatus } from '@prisma/client';

function getCurrencySymbol(curr: string = 'USD'): string {
  switch (curr.toUpperCase()) {
    case 'INR':
      return '₹';
    case 'AED':
      return 'AED';
    case 'USD':
    default:
      return '$';
  }
}

function formatWithSymbol(amount: number, curr: string = 'USD'): string {
  const sym = getCurrencySymbol(curr);
  return `${sym} ${amount.toLocaleString(undefined, { minimumFractionDigits: amount % 1 === 0 ? 0 : 2 })}`;
}

@Controller(['revenue', 'api/revenue'])
@Roles(Role.SUPER_ADMIN, Role.ADMIN)
export class RevenueController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async getRevenueStats(@Req() _req: any) {
    const [invoices, standalonePayments] = await Promise.all([
      this.prisma.invoice.findMany({
        take: 300,
        select: {
          id: true,
          invoiceNumber: true,
          amount: true,
          currency: true,
          status: true,
          creditNoteId: true,
          taxFields: true,
          createdAt: true,
          payment: {
            select: {
              enrolmentId: true,
              enrolment: {
                select: {
                  batchId: true,
                  programId: true,
                  user: {
                    select: {
                      name: true,
                      email: true,
                    },
                  },
                  program: {
                    select: {
                      id: true,
                      title: true,
                    },
                  },
                  batch: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      typeof this.prisma.payment?.findMany === 'function'
        ? this.prisma.payment.findMany({
            where: { invoice: null },
            take: 300,
            select: {
              id: true,
              stripeSessionId: true,
              amount: true,
              currency: true,
              status: true,
              enrolmentId: true,
              createdAt: true,
              enrolment: {
                select: {
                  batchId: true,
                  programId: true,
                  user: {
                    select: {
                      name: true,
                      email: true,
                    },
                  },
                  program: {
                    select: {
                      id: true,
                      title: true,
                    },
                  },
                  batch: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve([]),
    ]);

    // Data structures for multi-currency aggregations
    const byCurrency: Record<string, { total: number; count: number; symbol: string }> = {
      USD: { total: 0, count: 0, symbol: '$' },
      AED: { total: 0, count: 0, symbol: 'AED' },
      INR: { total: 0, count: 0, symbol: '₹' },
    };

    const courseMap = new Map<string, { programId: string; courseId: string; title: string; courseTitle: string; USD: number; AED: number; INR: number; count: number }>();
    const batchMap = new Map<string, { batchId: string; name: string; batchName: string; courseTitle: string; USD: number; AED: number; INR: number; count: number }>();
    const monthMap = new Map<string, { month: string; sortKey: string; USD: number; AED: number; INR: number; count: number }>();

    const paidEnrolmentIds = new Set<string>();
    let paidInvoicesCount = 0;
    let paidStandaloneCount = 0;

    // Helper to record an aggregation row
    const recordPaidMetric = (amount: number, curr: string, date: Date, program?: any, batch?: any) => {
      const code = (curr || 'USD').toUpperCase();
      if (!byCurrency[code]) {
        byCurrency[code] = { total: 0, count: 0, symbol: getCurrencySymbol(code) };
      }
      byCurrency[code].total += amount;
      byCurrency[code].count += 1;

      // Month
      const monthLabel = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      const sortKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthMap.has(sortKey)) {
        monthMap.set(sortKey, { month: monthLabel, sortKey, USD: 0, AED: 0, INR: 0, count: 0 });
      }
      const mEntry = monthMap.get(sortKey)!;
      if (code === 'USD') mEntry.USD += amount;
      else if (code === 'AED') mEntry.AED += amount;
      else if (code === 'INR') mEntry.INR += amount;
      mEntry.count += 1;

      // Course
      if (program?.id) {
        if (!courseMap.has(program.id)) {
          const cTitle = program.title || 'Course';
          courseMap.set(program.id, {
            programId: program.id,
            courseId: program.id,
            title: cTitle,
            courseTitle: cTitle,
            USD: 0,
            AED: 0,
            INR: 0,
            count: 0,
          });
        }
        const cEntry = courseMap.get(program.id)!;
        if (code === 'USD') cEntry.USD += amount;
        else if (code === 'AED') cEntry.AED += amount;
        else if (code === 'INR') cEntry.INR += amount;
        cEntry.count += 1;
      }

      // Batch
      if (batch?.id) {
        if (!batchMap.has(batch.id)) {
          const bName = batch.name || 'Batch';
          batchMap.set(batch.id, {
            batchId: batch.id,
            name: bName,
            batchName: bName,
            courseTitle: program?.title || 'Course',
            USD: 0,
            AED: 0,
            INR: 0,
            count: 0,
          });
        }
        const bEntry = batchMap.get(batch.id)!;
        if (code === 'USD') bEntry.USD += amount;
        else if (code === 'AED') bEntry.AED += amount;
        else if (code === 'INR') bEntry.INR += amount;
        bEntry.count += 1;
      }
    };

    // 1. Process invoices
    const invoiceTransactions = invoices.map((inv) => {
      const taxFields = inv.taxFields as any;
      const totalCredited = Number(taxFields?.totalCredited) || 0;
      const isPaid = inv.status === InvoiceStatus.PAID;
      const netAmount = isPaid ? Math.max(0, inv.amount - totalCredited) : 0;
      const curr = (inv.currency || 'USD').toUpperCase();
      const enrol = inv.payment?.enrolment;

      if (isPaid) {
        paidInvoicesCount++;
        if (netAmount > 0) {
          recordPaidMetric(netAmount, curr, new Date(inv.createdAt), enrol?.program, enrol?.batch);
        }
        if (inv.payment?.enrolmentId) {
          paidEnrolmentIds.add(inv.payment.enrolmentId);
        }
      }

      return {
        id: inv.id,
        description: `Invoice ${inv.invoiceNumber}`,
        user: enrol?.user?.name || enrol?.user?.email || 'Unknown',
        amount: formatWithSymbol(inv.amount, curr),
        numericAmount: inv.amount,
        netAmount,
        currency: curr,
        currencySymbol: getCurrencySymbol(curr),
        status: inv.status,
        creditNoteId: inv.creditNoteId || null,
        totalCredited,
        courseTitle: enrol?.program?.title || 'Program',
        batchName: enrol?.batch?.name || null,
        date: new Date(inv.createdAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
        createdAt: inv.createdAt,
      };
    });

    // 2. Process standalone payments (payments without invoices)
    const paymentTransactions = (standalonePayments || []).map((p: any) => {
      const isSucceeded = p.status === 'succeeded' || p.status === 'paid';
      const curr = (p.currency || 'USD').toUpperCase();
      const enrol = p.enrolment;

      if (isSucceeded && p.amount > 0) {
        paidStandaloneCount++;
        recordPaidMetric(p.amount, curr, new Date(p.createdAt), enrol?.program, enrol?.batch);
        if (p.enrolmentId) {
          paidEnrolmentIds.add(p.enrolmentId);
        }
      }

      return {
        id: p.id,
        description: `Payment ${p.stripeSessionId?.startsWith('manual_') ? 'Manual' : p.stripeSessionId || p.id.slice(0, 8)}`,
        user: enrol?.user?.name || enrol?.user?.email || 'Unknown',
        amount: formatWithSymbol(p.amount, curr),
        numericAmount: p.amount,
        netAmount: isSucceeded ? p.amount : 0,
        currency: curr,
        currencySymbol: getCurrencySymbol(curr),
        status: isSucceeded ? 'PAID' : (p.status ? p.status.toUpperCase() : 'PENDING'),
        creditNoteId: null,
        totalCredited: 0,
        courseTitle: enrol?.program?.title || 'Program',
        batchName: enrol?.batch?.name || null,
        date: new Date(p.createdAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
        createdAt: p.createdAt,
      };
    });

    // Merge transactions and sort by date descending
    const allTransactions = [...invoiceTransactions, ...paymentTransactions].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    // Format monthly records sorted chronologically
    const byMonth = Array.from(monthMap.values()).sort((a, b) => b.sortKey.localeCompare(a.sortKey));
    const byCourse = Array.from(courseMap.values()).sort((a, b) => (b.USD + b.AED / 3.67 + b.INR / 83) - (a.USD + a.AED / 3.67 + a.INR / 83));
    const byBatch = Array.from(batchMap.values()).sort((a, b) => (b.USD + b.AED / 3.67 + b.INR / 83) - (a.USD + a.AED / 3.67 + a.INR / 83));

    // Multi-currency total summary string
    const numericTotalRevenue = Array.from(Object.values(byCurrency)).reduce((sum, v) => sum + v.total, 0);
    const activeCurrencies = Object.entries(byCurrency).filter(([_, v]) => v.total > 0);

    let multiCurrencySummary: string;
    if (activeCurrencies.length === 0) {
      multiCurrencySummary = '$0';
    } else if (activeCurrencies.length === 1 && activeCurrencies[0][0] === 'USD') {
      multiCurrencySummary = `$${Math.round(activeCurrencies[0][1].total).toLocaleString()}`;
    } else {
      multiCurrencySummary = activeCurrencies
        .map(([code, v]) => `${v.symbol} ${Math.round(v.total).toLocaleString()}`)
        .join('  ·  ');
    }

    return {
      totalRevenue: multiCurrencySummary,
      numericTotalRevenue,
      byCurrency,
      byCourse,
      byBatch,
      byMonth,
      mrr: null,
      mrrFormatted: 'Not supported (cohort-based)',
      isRecurringBillingSupported: false,
      activeSubscribers: paidEnrolmentIds.size,
      paidEnrolmentsCount: paidEnrolmentIds.size,
      paidTransactionsCount: paidInvoicesCount + paidStandaloneCount,
      totalInvoicesCount: invoices.length,
      transactions: allTransactions,
    };
  }
}
