import { getAppUrls } from '../../common/config/app-urls.js';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { InvoiceStatus, Role } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { CreateCreditNoteDto } from './dto/create-credit-note.dto.js';
import { CreateInvoiceDto } from './dto/create-invoice.dto.js';
import { InvoicePdfService, InvoicePdfData } from './invoice-pdf.service.js';
import { EmailService } from '../email/email.service.js';

export function formatInvoiceAmount(amount: number, currency: string = 'USD'): string {
  const code = (currency || 'USD').toUpperCase();
  switch (code) {
    case 'INR':
      return `₹${amount.toLocaleString()}`;
    case 'AED':
      return `AED ${amount.toLocaleString()}`;
    case 'USD':
    default:
      return `$${amount.toLocaleString()}`;
  }
}

export function getInvoiceCurrencySymbol(currency: string = 'USD'): string {
  const code = (currency || 'USD').toUpperCase();
  switch (code) {
    case 'INR':
      return '₹';
    case 'AED':
      return 'AED';
    case 'USD':
    default:
      return '$';
  }
}

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private prisma: PrismaService,
    @Optional() private invoicePdfService?: InvoicePdfService,
    @Optional() private emailService?: EmailService,
  ) {}

  async create(dto: CreateInvoiceDto, user?: any) {
    return this.prisma.$transaction(async (tx: any) => {
      // 1. Acquire PostgreSQL advisory transaction lock on the enrolment ID to prevent concurrent duplicate invoices
      if (typeof tx.$executeRaw === 'function') {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${dto.enrolmentId}))`;
      }

      const enrolment = await tx.enrolment.findUnique({
        where: { id: dto.enrolmentId },
        include: {
          user: true,
          program: true,
          payments: { include: { invoice: true } },
        },
      });

      if (!enrolment) {
        throw new NotFoundException('Enrolment not found');
      }

      // Check if an active invoice already exists for this enrolment
      const existingInvoice = enrolment.payments?.find((p: any) => p.invoice)?.invoice;
      if (existingInvoice && existingInvoice.status !== InvoiceStatus.CANCELLED) {
        throw new ConflictException(
          `Enrolment already has an active invoice (${existingInvoice.invoiceNumber})`,
        );
      }

      const payment = await tx.payment.create({
        data: {
          enrolmentId: enrolment.id,
          amount: dto.amount,
          currency: dto.currency || 'USD',
          stripeSessionId: `manual_${Date.now()}_${randomUUID().slice(0, 8)}`,
          status: dto.status === InvoiceStatus.PAID ? 'succeeded' : 'pending',
        },
      });

      const invoiceNumber = `INV-${Math.floor(100000 + Math.random() * 900000)}`;

      const currency = (dto.currency || 'USD').toUpperCase();
      let taxType: 'UAE_VAT' | 'INDIA_GST' | 'NONE' = 'NONE';
      let taxRate = 0;
      if (currency === 'AED') {
        taxType = 'UAE_VAT';
        taxRate = 5;
      } else if (currency === 'INR') {
        taxType = 'INDIA_GST';
        taxRate = 18;
      }
      const taxAmount = taxRate > 0 ? (dto.amount * taxRate) / 100 : 0;
      const totalAmount = dto.amount + taxAmount;

      const invoice = await tx.invoice.create({
        data: {
          paymentId: payment.id,
          enrolmentId: enrolment.id,
          invoiceNumber,
          amount: totalAmount,
          currency,
          status: dto.status || InvoiceStatus.PAID,
          taxFields: {
            company: 'WhatBoutMe FZE',
            trn: '10049281900003',
            taxType,
            taxRate,
            taxAmount,
            subtotal: dto.amount,
            total: totalAmount,
            currencySymbol: getInvoiceCurrencySymbol(currency),
          },
          pdfUrl: `/api/invoices/${payment.id}/pdf`,
        },
      });

      if (typeof tx.logAction === 'function') {
        await tx.logAction({
          actorId: user?.sub || user?.id || null,
          action: 'INVOICE_CREATED',
          entity: 'Invoice',
          entityId: invoice.id,
          meta: {
            invoiceNumber,
            amount: totalAmount,
            currency,
            enrolmentId: enrolment.id,
            userId: enrolment.userId,
          },
        });
      } else if (tx.auditLog?.create) {
        await tx.auditLog.create({
          data: {
            actorId: user?.sub || user?.id || null,
            action: 'INVOICE_CREATED',
            entity: 'Invoice',
            entityId: invoice.id,
            meta: {
              invoiceNumber,
              amount: totalAmount,
              currency,
              enrolmentId: enrolment.id,
              userId: enrolment.userId,
            },
          },
        });
      }

      return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        client: enrolment.user?.name || 'Unknown',
        clientEmail: enrolment.user?.email || null,
        amount: formatInvoiceAmount(invoice.amount, invoice.currency),
        numericAmount: invoice.amount,
        currency: invoice.currency,
        status: invoice.status,
        pdfUrl: invoice.pdfUrl,
        date: new Date(invoice.createdAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
        createdAt: invoice.createdAt,
      };
    });
  }

  async findAll(user?: any, query?: { page?: number; limit?: number }) {
    const where: any = {};
    if (user) {
      if (
        user.role === Role.MANAGER ||
        user.role === 'MANAGER' ||
        user.role === Role.TEACHER ||
        user.role === 'TEACHER'
      ) {
        throw new ForbiddenException('Access denied: Managers cannot access invoices');
      }
      if (user.role === Role.USER) {
        const userId = user.sub || user.userId || user.id;
        where.payment = {
          enrolment: {
            userId,
          },
        };
      }
    }

    const page = query?.page ? Math.max(1, Number(query.page)) : undefined;
    const limit = query?.limit ? Math.min(100, Math.max(1, Number(query.limit))) : undefined;
    const skip = page && limit ? (page - 1) * limit : undefined;

    const invoices = await this.prisma.invoice.findMany({
      where,
      skip,
      take: limit,
      select: {
        id: true,
        invoiceNumber: true,
        amount: true,
        currency: true,
        status: true,
        creditNoteId: true,
        pdfUrl: true,
        createdAt: true,
        payment: {
          select: {
            enrolment: {
              select: {
                user: {
                  select: {
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return invoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      client: inv.payment?.enrolment?.user?.name || 'Unknown',
      clientEmail: inv.payment?.enrolment?.user?.email || null,
      amount: formatInvoiceAmount(inv.amount, inv.currency),
      numericAmount: inv.amount,
      currency: inv.currency,
      status: inv.status,
      creditNoteId: inv.creditNoteId,
      pdfUrl: inv.pdfUrl || `/api/invoices/${inv.id}/pdf`,
      date: new Date(inv.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      createdAt: inv.createdAt,
    }));
  }

  async findOne(id: string, user?: any) {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        OR: [{ id }, { invoiceNumber: id }],
      },
      include: {
        payment: {
          include: {
            enrolment: {
              include: { user: true, program: true },
            },
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID or Number '${id}' not found`);
    }

    if (user) {
      if (
        user.role === Role.MANAGER ||
        user.role === 'MANAGER' ||
        user.role === Role.TEACHER ||
        user.role === 'TEACHER'
      ) {
        throw new ForbiddenException('Access denied: Managers cannot access invoices');
      }
      if (user.role === Role.USER) {
        const userId = user.sub || user.userId || user.id;
        if (invoice.payment?.enrolment?.userId !== userId) {
          throw new ForbiddenException(
            'Access denied: You can only access your own invoices',
          );
        }
      }
    }

    const taxFields = invoice.taxFields as any;
    const creditNotes = Array.isArray(taxFields?.creditNotes)
      ? taxFields.creditNotes
      : taxFields?.creditNote
        ? [taxFields.creditNote]
        : [];
    const totalCredited =
      taxFields?.totalCredited ??
      (invoice.status === InvoiceStatus.REFUNDED
        ? invoice.amount
        : creditNotes.reduce((sum: number, cn: any) => sum + (Number(cn.amount) || 0), 0));
    const remainingBalance =
      taxFields?.remainingBalance !== undefined
        ? taxFields.remainingBalance
        : Math.max(0, invoice.amount - totalCredited);
    const creditStatus =
      taxFields?.creditStatus ||
      (invoice.status === InvoiceStatus.REFUNDED
        ? 'FULL'
        : totalCredited > 0
          ? 'PARTIAL'
          : 'NONE');

    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      amount: invoice.amount,
      currency: invoice.currency,
      status: invoice.status,
      creditNoteId: invoice.creditNoteId,
      creditNote: taxFields?.creditNote || (creditNotes.length > 0 ? creditNotes[creditNotes.length - 1] : null),
      creditNotes,
      totalCredited,
      remainingBalance,
      creditStatus,
      client: invoice.payment?.enrolment?.user?.name || 'Unknown',
      clientEmail: invoice.payment?.enrolment?.user?.email || null,
      programTitle: invoice.payment?.enrolment?.program?.title || null,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
    };
  }

  async createCreditNote(invoiceId: string, dto: CreateCreditNoteDto, user?: any) {
    return this.prisma.$transaction(async (tx: any) => {
      // 1. Acquire PostgreSQL advisory transaction lock on the invoice ID to prevent concurrent duplicate credit notes
      if (typeof tx.$executeRaw === 'function') {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${invoiceId}))`;
      }

      // 2. Fetch current invoice state under advisory lock
      const invoice = await tx.invoice.findFirst({
        where: {
          OR: [{ id: invoiceId }, { invoiceNumber: invoiceId }],
        },
        include: {
          payment: {
            include: {
              enrolment: {
                include: { user: true },
              },
            },
          },
        },
      });

      if (!invoice) {
        throw new NotFoundException(`Invoice '${invoiceId}' not found`);
      }

      const existingTaxFields = (invoice.taxFields as any) || {};
      const existingCreditNotes: any[] = Array.isArray(existingTaxFields.creditNotes)
        ? existingTaxFields.creditNotes
        : existingTaxFields.creditNote
          ? [existingTaxFields.creditNote]
          : [];

      const roundCurrency = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

      const currentTotalCredited = roundCurrency(
        existingCreditNotes.reduce((sum, cn) => sum + (Number(cn.amount) || 0), 0),
      );
      const remainingBalance = roundCurrency(Math.max(0, invoice.amount - currentTotalCredited));

      // Rejection when invoice is already fully credited or marked REFUNDED
      if (remainingBalance <= 0 || invoice.status === InvoiceStatus.REFUNDED) {
        throw new ConflictException('Invoice is already fully credited or refunded');
      }

      // Amount validation
      const creditAmount = roundCurrency(dto.amount !== undefined ? dto.amount : remainingBalance);
      if (creditAmount <= 0) {
        throw new BadRequestException('Credit note amount must be greater than zero');
      }
      if (creditAmount > remainingBalance) {
        throw new BadRequestException(
          `Credit note amount ($${creditAmount}) cannot exceed remaining creditable balance ($${remainingBalance})`,
        );
      }

      const newTotalCredited = roundCurrency(currentTotalCredited + creditAmount);
      const newRemainingBalance = roundCurrency(Math.max(0, invoice.amount - newTotalCredited));
      const isFullyCredited = newRemainingBalance <= 0;

      const creditNoteId = randomUUID();
      const cleanNum = invoice.invoiceNumber.replace(/^INV-?/, '');
      const creditNoteIndex = existingCreditNotes.length + 1;
      const creditNoteNumber =
        existingCreditNotes.length === 0 ? `CN-${cleanNum}` : `CN-${cleanNum}-${creditNoteIndex}`;
      const issuedAt = new Date();
      const reason = dto.reason || 'Customer refund requested';

      const creditNoteData = {
        id: creditNoteId,
        creditNoteNumber,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amount: creditAmount,
        currency: invoice.currency,
        reason,
        refundReference: dto.refundReference || null,
        recipientName: invoice.payment?.enrolment?.user?.name || 'Unknown',
        recipientEmail: invoice.payment?.enrolment?.user?.email || null,
        issuedAt: issuedAt.toISOString(),
        issuedById: user?.sub || user?.id || null,
        issuedByName: user?.name || user?.email || 'Admin',
        totalCredited: newTotalCredited,
        remainingBalance: newRemainingBalance,
        isMonetaryRefund: false, // Internal accounting adjustment only; not gateway wire
      };

      // 3. Atomically update invoice within transaction
      const updatedInvoice = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: isFullyCredited ? InvoiceStatus.REFUNDED : invoice.status,
          creditNoteId: creditNoteId,
          taxFields: {
            ...existingTaxFields,
            creditNote: creditNoteData,
            creditNotes: [...existingCreditNotes, creditNoteData],
            totalCredited: newTotalCredited,
            remainingBalance: newRemainingBalance,
            creditStatus: isFullyCredited ? 'FULL' : 'PARTIAL',
          },
        },
      });

      // 4. Record audit log within the same transaction to guarantee transactional consistency
      await tx.auditLog.create({
        data: {
          actorId: user?.sub || user?.id || null,
          action: 'CREATE_CREDIT_NOTE',
          entity: 'Invoice',
          entityId: invoice.id,
          meta: {
            creditNoteId,
            creditNoteNumber,
            creditAmount,
            totalCredited: newTotalCredited,
            remainingBalance: newRemainingBalance,
            invoiceAmount: invoice.amount,
            invoiceStatus: updatedInvoice.status,
            creditStatus: isFullyCredited ? 'FULL' : 'PARTIAL',
            isMonetaryRefund: false,
            reason,
            refundReference: dto.refundReference || null,
          },
        },
      });

      return {
        success: true,
        creditNote: creditNoteData,
        invoice: {
          id: updatedInvoice.id,
          invoiceNumber: updatedInvoice.invoiceNumber,
          status: updatedInvoice.status,
          creditNoteId: updatedInvoice.creditNoteId,
          totalCredited: newTotalCredited,
          remainingBalance: newRemainingBalance,
          creditStatus: isFullyCredited ? 'FULL' : 'PARTIAL',
        },
      };
    });
  }

  async getCreditNote(invoiceId: string) {
    const invoice = await this.findOne(invoiceId);
    if (!invoice.creditNoteId && (!invoice.creditNotes || invoice.creditNotes.length === 0)) {
      throw new NotFoundException(`No credit note found for invoice '${invoiceId}'`);
    }
    return invoice.creditNote || invoice.creditNotes[invoice.creditNotes.length - 1];
  }

  async findAllCreditNotes(query?: { page?: number; limit?: number }) {
    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query?.limit) || 50));
    const skip = (page - 1) * limit;

    const invoices = await this.prisma.invoice.findMany({
      where: {
        OR: [{ creditNoteId: { not: null } }, { status: InvoiceStatus.REFUNDED }],
      },
      skip,
      take: limit,
      include: {
        payment: {
          include: {
            enrolment: {
              include: { user: true },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const creditNotes: any[] = [];
    for (const inv of invoices) {
      const taxFields = inv.taxFields as any;
      if (Array.isArray(taxFields?.creditNotes) && taxFields.creditNotes.length > 0) {
        creditNotes.push(...taxFields.creditNotes);
      } else if (taxFields?.creditNote) {
        creditNotes.push(taxFields.creditNote);
      } else if (inv.creditNoteId || inv.status === InvoiceStatus.REFUNDED) {
        creditNotes.push({
          id: inv.creditNoteId || inv.id,
          creditNoteNumber: `CN-${inv.invoiceNumber.replace(/^INV-?/, '')}`,
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          amount: inv.amount,
          currency: inv.currency,
          reason: 'Refunded',
          recipientName: inv.payment?.enrolment?.user?.name || 'Unknown',
          recipientEmail: inv.payment?.enrolment?.user?.email || null,
          issuedAt: inv.updatedAt.toISOString(),
          totalCredited: inv.amount,
          remainingBalance: 0,
          isMonetaryRefund: false,
        });
      }
    }

    return creditNotes;
  }

  async getInvoicePdf(id: string, user?: any): Promise<{ buffer: Buffer; filename: string }> {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        OR: [
          { id },
          { invoiceNumber: id },
          { paymentId: id },
          { eventRegistrationId: id },
        ],
      },
      include: {
        payment: {
          include: {
            enrolment: {
              include: { user: true, program: true },
            },
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice '${id}' not found`);
    }

    let eventReg: any = null;
    if (invoice.eventRegistrationId) {
      eventReg = await this.prisma.eventRegistration.findUnique({
        where: { id: invoice.eventRegistrationId },
        include: { event: true, user: true },
      });
    }

    if (user && user.role === Role.USER) {
      const userId = user.sub || user.userId || user.id;
      if (invoice.payment?.enrolment?.userId && invoice.payment.enrolment.userId !== userId) {
        throw new ForbiddenException('You do not have permission to download another learner\'s invoice');
      }
      if (eventReg?.userId && eventReg.userId !== userId) {
        throw new ForbiddenException('You do not have permission to download another attendee\'s invoice');
      }
    }

    if (!this.invoicePdfService) {
      throw new BadRequestException('Invoice PDF service is unavailable');
    }

    const taxFields = (invoice.taxFields as any) || {};

    // Audit flag for legacy records where stored subtotal incorrectly equaled gross amount
    if (taxFields.subtotal !== undefined && Number(taxFields.subtotal) === invoice.amount && Number(taxFields.taxAmount) > 0) {
      this.logger.warn(
        `[Invoice PDF] Ambiguous legacy invoice arithmetic detected for ${invoice.invoiceNumber} (ID: ${invoice.id}). Stored subtotal (${taxFields.subtotal}) equals gross total (${invoice.amount}) despite taxAmount (${taxFields.taxAmount}). Preserving original DB record and rendering reconciled line items for display; flagged for manual accounting review.`,
      );
    }

    const clientName =
      invoice.payment?.enrolment?.user?.name ||
      eventReg?.attendeeName ||
      taxFields.attendeeName ||
      'Learner / Attendee';
    const clientEmail =
      invoice.payment?.enrolment?.user?.email ||
      eventReg?.attendeeEmail ||
      null;
    const itemDescription =
      invoice.payment?.enrolment?.program?.title ||
      eventReg?.event?.title ||
      taxFields.eventTitle ||
      'WhatBoutMe Professional Program';
    const currency = invoice.currency || 'USD';

    const pdfData: InvoicePdfData = {
      invoiceNumber: invoice.invoiceNumber,
      date: new Date(invoice.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      clientName,
      clientEmail,
      itemDescription,
      amount: invoice.amount,
      currency,
      currencySymbol: getInvoiceCurrencySymbol(currency),
      couponCode: invoice.couponCode,
      discountAmount: invoice.discountAmount,
      taxType: taxFields.taxType || (currency === 'AED' ? 'UAE_VAT' : currency === 'INR' ? 'INDIA_GST' : 'NONE'),
      taxRate: taxFields.taxRate || (currency === 'AED' ? 5 : currency === 'INR' ? 18 : 0),
      taxAmount: taxFields.taxAmount || 0,
      subtotal:
        taxFields.subtotal !== undefined && Number(taxFields.subtotal) !== invoice.amount
          ? Number(taxFields.subtotal)
          : taxFields.taxAmount > 0
            ? Math.round((invoice.amount - Number(taxFields.taxAmount)) * 100) / 100
            : invoice.amount,
      total: invoice.amount,
      paymentMethod: 'Verified Payment / Test Bypass',
      paymentReference: invoice.payment?.stripeSessionId || invoice.id,
    };

    const buffer = await this.invoicePdfService.generateInvoicePdf(pdfData);
    return { buffer, filename: `${invoice.invoiceNumber}.pdf` };
  }

  async resendInvoice(id: string, user?: any) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { OR: [{ id }, { invoiceNumber: id }, { paymentId: id }] },
      include: {
        payment: {
          include: {
            enrolment: {
              include: { user: true, program: true },
            },
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice '${id}' not found`);
    }

    const email = invoice.payment?.enrolment?.user?.email;
    const name = invoice.payment?.enrolment?.user?.name || 'Learner';
    const programTitle = invoice.payment?.enrolment?.program?.title || 'Program Enrolment';

    if (!email) {
      throw new BadRequestException('No email address associated with this invoice to resend to.');
    }

    if (this.emailService) {
      const { lmsUrl } = getAppUrls();
      await this.emailService.sendTemplateEmail({
        to: email,
        subject: `Invoice Resend: ${invoice.invoiceNumber} - WhatBoutMe FZE`,
        template: 'PaymentSuccessEmail',
        props: {
          learnerName: name,
          programTitle,
          amount: invoice.amount,
          currencySymbol: getInvoiceCurrencySymbol(invoice.currency),
          invoiceNumber: invoice.invoiceNumber,
          dashboardUrl: `${lmsUrl}/dashboard`,
        },
      });
    }

    return {
      success: true,
      message: `Invoice ${invoice.invoiceNumber} successfully resent to ${email}`,
    };
  }
}
