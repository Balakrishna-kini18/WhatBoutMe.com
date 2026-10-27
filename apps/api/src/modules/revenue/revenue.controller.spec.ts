import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RevenueController } from './revenue.controller.js';
import { InvoiceStatus } from '@prisma/client';

describe('RevenueController', () => {
  let controller: RevenueController;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      invoice: {
        findMany: vi.fn(),
      },
      payment: {
        findMany: vi.fn(),
      },
    };
    controller = new RevenueController(prismaMock);
  });

  it('correctly aggregates multi-currency revenue across USD, AED, and INR', async () => {
    const mockInvoices = [
      {
        id: 'inv-1',
        invoiceNumber: 'INV-001',
        amount: 1000,
        currency: 'USD',
        status: InvoiceStatus.PAID,
        creditNoteId: null,
        taxFields: null,
        createdAt: new Date('2026-10-15T10:00:00Z'),
        payment: {
          enrolmentId: 'enr-1',
          enrolment: {
            batchId: 'batch-1',
            programId: 'prog-1',
            user: { name: 'Alice', email: 'alice@example.com' },
            program: { id: 'prog-1', title: 'Course A' },
            batch: { id: 'batch-1', name: 'Batch 1' },
          },
        },
      },
      {
        id: 'inv-2',
        invoiceNumber: 'INV-002',
        amount: 3670,
        currency: 'AED',
        status: InvoiceStatus.PAID,
        creditNoteId: null,
        taxFields: null,
        createdAt: new Date('2026-10-16T10:00:00Z'),
        payment: {
          enrolmentId: 'enr-2',
          enrolment: {
            batchId: 'batch-2',
            programId: 'prog-2',
            user: { name: 'Bob', email: 'bob@example.com' },
            program: { id: 'prog-2', title: 'Course B' },
            batch: { id: 'batch-2', name: 'Batch 2' },
          },
        },
      },
      {
        id: 'inv-3',
        invoiceNumber: 'INV-003',
        amount: 46065,
        currency: 'INR',
        status: InvoiceStatus.PAID,
        creditNoteId: null,
        taxFields: null,
        createdAt: new Date('2026-10-17T10:00:00Z'),
        payment: {
          enrolmentId: 'enr-3',
          enrolment: {
            batchId: 'batch-1',
            programId: 'prog-1',
            user: { name: 'Charlie', email: 'charlie@example.com' },
            program: { id: 'prog-1', title: 'Course A' },
            batch: { id: 'batch-1', name: 'Batch 1' },
          },
        },
      },
      {
        id: 'inv-4',
        invoiceNumber: 'INV-004',
        amount: 500,
        currency: 'USD',
        status: InvoiceStatus.DRAFT, // Unpaid invoice
        creditNoteId: null,
        taxFields: null,
        createdAt: new Date('2026-10-18T10:00:00Z'),
        payment: null,
      },
    ];

    const mockStandalonePayments = [
      {
        id: 'pay-standalone-1',
        stripeSessionId: 'cs_123',
        amount: 200,
        currency: 'USD',
        status: 'succeeded',
        enrolmentId: 'enr-4',
        createdAt: new Date('2026-10-19T10:00:00Z'),
        enrolment: {
          batchId: 'batch-1',
          programId: 'prog-1',
          user: { name: 'Dave', email: 'dave@example.com' },
          program: { id: 'prog-1', title: 'Course A' },
          batch: { id: 'batch-1', name: 'Batch 1' },
        },
      },
    ];

    prismaMock.invoice.findMany.mockResolvedValue(mockInvoices);
    prismaMock.payment.findMany.mockResolvedValue(mockStandalonePayments);

    const result = await controller.getRevenueStats({});

    expect(result.byCurrency.USD.total).toBe(1200); // 1000 + 200
    expect(result.byCurrency.USD.count).toBe(2);
    expect(result.byCurrency.AED.total).toBe(3670);
    expect(result.byCurrency.AED.count).toBe(1);
    expect(result.byCurrency.INR.total).toBe(46065);
    expect(result.byCurrency.INR.count).toBe(1);

    expect(result.paidTransactionsCount).toBe(4); // 3 paid invoices + 1 standalone
    expect(result.paidEnrolmentsCount).toBe(4); // enr-1, enr-2, enr-3, enr-4
    expect(result.totalInvoicesCount).toBe(4);
    expect(result.transactions.length).toBe(5); // 4 invoices + 1 standalone
  });

  it('handles empty database records gracefully without NaN or errors', async () => {
    prismaMock.invoice.findMany.mockResolvedValue([]);
    prismaMock.payment.findMany.mockResolvedValue([]);

    const result = await controller.getRevenueStats({});

    expect(result.byCurrency.USD.total).toBe(0);
    expect(result.byCurrency.AED.total).toBe(0);
    expect(result.byCurrency.INR.total).toBe(0);
    expect(result.totalRevenue).toBe('$0');
    expect(result.numericTotalRevenue).toBe(0);
    expect(result.paidTransactionsCount).toBe(0);
    expect(result.paidEnrolmentsCount).toBe(0);
    expect(result.transactions).toEqual([]);
    expect(result.byCourse).toEqual([]);
    expect(result.byBatch).toEqual([]);
    expect(result.byMonth).toEqual([]);
  });
});
