import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InvoicesService } from './invoices.service.js';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';

describe('InvoicesService - Credit Notes & Financial Integrity (FIN-01, FIN-02, R-19)', () => {
  let service: InvoicesService;
  let prismaMock: any;

  const mockUser = {
    id: 'user-1',
    name: 'Rowena Admin',
    email: 'admin@whatboutme.com',
  };

  const mockInvoice = {
    id: 'inv-123',
    invoiceNumber: 'INV-2026-001',
    amount: 1200,
    currency: 'USD',
    status: InvoiceStatus.PAID,
    creditNoteId: null,
    taxFields: {},
    createdAt: new Date('2026-10-01T10:00:00Z'),
    updatedAt: new Date('2026-10-01T10:00:00Z'),
    payment: {
      enrolment: {
        user: {
          name: 'Alice Learner',
          email: 'alice@example.com',
        },
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock = {
      $transaction: vi.fn().mockImplementation(async (cb: any) => cb(prismaMock)),
      $executeRaw: vi.fn().mockResolvedValue(1),
      invoice: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };

    service = new InvoicesService(prismaMock as any);
  });

  describe('createCreditNote (FIN-01 Financial State & FIN-02 Concurrency)', () => {
    it('1. Full credit note: transitions status to REFUNDED, remainingBalance to 0, and records audit log', async () => {
      prismaMock.invoice.findFirst.mockResolvedValue(mockInvoice);
      prismaMock.invoice.update.mockImplementation(async ({ data }: any) => ({
        ...mockInvoice,
        ...data,
      }));

      const res = await service.createCreditNote(
        'inv-123',
        { amount: 1200, reason: 'Course withdrawal within guarantee' },
        mockUser,
      );

      expect(res.success).toBe(true);
      expect(res.creditNote).toBeDefined();
      expect(res.creditNote.creditNoteNumber).toBe('CN-2026-001');
      expect(res.creditNote.amount).toBe(1200);
      expect(res.creditNote.totalCredited).toBe(1200);
      expect(res.creditNote.remainingBalance).toBe(0);
      expect(res.creditNote.isMonetaryRefund).toBe(false); // Accounting record distinction

      // Verify transaction advisory lock was acquired
      expect(prismaMock.$executeRaw).toHaveBeenCalled();

      // Verify invoice update transitions to REFUNDED on full credit
      expect(prismaMock.invoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-123' },
        data: {
          status: InvoiceStatus.REFUNDED,
          creditNoteId: expect.any(String),
          taxFields: expect.objectContaining({
            totalCredited: 1200,
            remainingBalance: 0,
            creditStatus: 'FULL',
          }),
        },
      });

      // Verify audit log creation inside transaction
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'CREATE_CREDIT_NOTE',
          entity: 'Invoice',
          entityId: 'inv-123',
          actorId: mockUser.id,
          meta: expect.objectContaining({
            isMonetaryRefund: false,
            creditStatus: 'FULL',
            remainingBalance: 0,
          }),
        }),
      });
    });

    it('2. Partial credit note: preserves PAID status, records partial balance, and does NOT mark REFUNDED', async () => {
      prismaMock.invoice.findFirst.mockResolvedValue(mockInvoice);
      prismaMock.invoice.update.mockImplementation(async ({ data }: any) => ({
        ...mockInvoice,
        ...data,
      }));

      const res = await service.createCreditNote(
        'inv-123',
        { amount: 400, reason: 'Partial goodwill adjustment' },
        mockUser,
      );

      expect(res.success).toBe(true);
      expect(res.creditNote.amount).toBe(400);
      expect(res.invoice.status).toBe(InvoiceStatus.PAID); // NOT REFUNDED
      expect(res.invoice.totalCredited).toBe(400);
      expect(res.invoice.remainingBalance).toBe(800);
      expect(res.invoice.creditStatus).toBe('PARTIAL');

      expect(prismaMock.invoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-123' },
        data: {
          status: InvoiceStatus.PAID,
          creditNoteId: expect.any(String),
          taxFields: expect.objectContaining({
            totalCredited: 400,
            remainingBalance: 800,
            creditStatus: 'PARTIAL',
          }),
        },
      });
    });

    it('3. Multiple partial credit notes: allows issuing subsequent credits up to total amount', async () => {
      // Invoice already has one partial credit note of $400 (remaining balance $800)
      const invoiceWithPriorCredit = {
        ...mockInvoice,
        status: InvoiceStatus.PAID,
        creditNoteId: 'cn-1',
        taxFields: {
          creditNotes: [
            {
              id: 'cn-1',
              creditNoteNumber: 'CN-2026-001-1',
              amount: 400,
              issuedAt: '2026-10-02T10:00:00Z',
            },
          ],
          totalCredited: 400,
          remainingBalance: 800,
          creditStatus: 'PARTIAL',
        },
      };

      prismaMock.invoice.findFirst.mockResolvedValue(invoiceWithPriorCredit);
      prismaMock.invoice.update.mockImplementation(async ({ data }: any) => ({
        ...invoiceWithPriorCredit,
        ...data,
      }));

      // Issue second partial credit note of $500
      const res = await service.createCreditNote(
        'inv-123',
        { amount: 500, reason: 'Second partial credit' },
        mockUser,
      );

      expect(res.success).toBe(true);
      expect(res.creditNote.creditNoteNumber).toBe('CN-2026-001-2');
      expect(res.creditNote.amount).toBe(500);
      expect(res.invoice.totalCredited).toBe(900); // 400 + 500
      expect(res.invoice.remainingBalance).toBe(300); // 1200 - 900
      expect(res.invoice.status).toBe(InvoiceStatus.PAID);
      expect(res.invoice.creditStatus).toBe('PARTIAL');

      // Now issue final credit note for remaining $300 -> transitions to REFUNDED
      const invoiceWithTwoCredits = {
        ...invoiceWithPriorCredit,
        taxFields: {
          creditNotes: [
            ...invoiceWithPriorCredit.taxFields.creditNotes,
            res.creditNote,
          ],
          totalCredited: 900,
          remainingBalance: 300,
        },
      };
      prismaMock.invoice.findFirst.mockResolvedValue(invoiceWithTwoCredits);

      const finalRes = await service.createCreditNote(
        'inv-123',
        { amount: 300, reason: 'Final balance credit' },
        mockUser,
      );

      expect(finalRes.invoice.totalCredited).toBe(1200);
      expect(finalRes.invoice.remainingBalance).toBe(0);
      expect(finalRes.invoice.status).toBe(InvoiceStatus.REFUNDED);
      expect(finalRes.invoice.creditStatus).toBe('FULL');
    });

    it('4. Rejection when credit amount exceeds remaining creditable balance', async () => {
      // Invoice with $400 already credited, $800 remaining
      const invoiceWithPriorCredit = {
        ...mockInvoice,
        status: InvoiceStatus.PAID,
        taxFields: {
          creditNotes: [{ id: 'cn-1', amount: 400 }],
          totalCredited: 400,
          remainingBalance: 800,
        },
      };
      prismaMock.invoice.findFirst.mockResolvedValue(invoiceWithPriorCredit);

      // Attempt to credit $900 (> $800 remaining)
      await expect(
        service.createCreditNote('inv-123', { amount: 900 }, mockUser),
      ).rejects.toThrow(BadRequestException);

      expect(prismaMock.invoice.update).not.toHaveBeenCalled();
    });

    it('5. Rejection when credit amount is zero or negative', async () => {
      prismaMock.invoice.findFirst.mockResolvedValue(mockInvoice);

      await expect(
        service.createCreditNote('inv-123', { amount: 0 }, mockUser),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.createCreditNote('inv-123', { amount: -50 }, mockUser),
      ).rejects.toThrow(BadRequestException);

      expect(prismaMock.invoice.update).not.toHaveBeenCalled();
    });

    it('6. Duplicate prevention: rejects credit note if invoice is already fully credited or REFUNDED', async () => {
      const fullyRefundedInvoice = {
        ...mockInvoice,
        status: InvoiceStatus.REFUNDED,
        creditNoteId: 'cn-full',
        taxFields: {
          totalCredited: 1200,
          remainingBalance: 0,
        },
      };
      prismaMock.invoice.findFirst.mockResolvedValue(fullyRefundedInvoice);

      await expect(
        service.createCreditNote('inv-123', { amount: 100 }, mockUser),
      ).rejects.toThrow(ConflictException);

      expect(prismaMock.invoice.update).not.toHaveBeenCalled();
    });

    it('7. Transaction rollback: if audit log insertion fails, entire transaction throws and rolls back', async () => {
      prismaMock.invoice.findFirst.mockResolvedValue(mockInvoice);
      prismaMock.invoice.update.mockResolvedValue(mockInvoice);
      // Simulate auditLog write failure
      prismaMock.auditLog.create.mockRejectedValue(new Error('Audit DB constraint violation'));

      await expect(
        service.createCreditNote('inv-123', { amount: 600 }, mockUser),
      ).rejects.toThrow('Audit DB constraint violation');
    });

    it('8. Throws NotFoundException if target invoice does not exist', async () => {
      prismaMock.invoice.findFirst.mockResolvedValue(null);

      await expect(
        service.createCreditNote('nonexistent-inv', { amount: 1200 }, mockUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getCreditNote, findOne, and findAllCreditNotes', () => {
    it('retrieves credit note and remaining balance for an invoice in findOne', async () => {
      const invoiceWithCN = {
        ...mockInvoice,
        status: InvoiceStatus.PAID,
        creditNoteId: 'cn-uuid',
        taxFields: {
          creditNotes: [
            {
              id: 'cn-uuid',
              creditNoteNumber: 'CN-2026-001-1',
              amount: 500,
            },
          ],
          totalCredited: 500,
          remainingBalance: 700,
          creditStatus: 'PARTIAL',
        },
      };
      prismaMock.invoice.findFirst.mockResolvedValue(invoiceWithCN);

      const inv = await service.findOne('inv-123');
      expect(inv.totalCredited).toBe(500);
      expect(inv.remainingBalance).toBe(700);
      expect(inv.creditStatus).toBe('PARTIAL');
      expect(inv.creditNotes).toHaveLength(1);
    });

    it('findAllCreditNotes aggregates all credit notes across invoices', async () => {
      const invoicesWithCredits = [
        {
          ...mockInvoice,
          id: 'inv-1',
          taxFields: {
            creditNotes: [
              { id: 'cn-1', creditNoteNumber: 'CN-001-1', amount: 300 },
              { id: 'cn-2', creditNoteNumber: 'CN-001-2', amount: 200 },
            ],
          },
        },
      ];
      prismaMock.invoice.findMany.mockResolvedValue(invoicesWithCredits);

      const allCNs = await service.findAllCreditNotes();
      expect(allCNs).toHaveLength(2);
      expect(allCNs[0].creditNoteNumber).toBe('CN-001-1');
      expect(allCNs[1].creditNoteNumber).toBe('CN-001-2');
    });

    it('throws NotFoundException when getting credit note for uncredited invoice', async () => {
      prismaMock.invoice.findFirst.mockResolvedValue(mockInvoice);

      await expect(service.getCreditNote('inv-123')).rejects.toThrow(NotFoundException);
    });
  });
});
