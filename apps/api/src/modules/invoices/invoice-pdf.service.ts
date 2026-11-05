import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export interface InvoicePdfData {
  invoiceNumber: string;
  date: string;
  clientName: string;
  clientEmail?: string | null;
  itemDescription: string;
  amount: number;
  currency: string;
  currencySymbol: string;
  couponCode?: string | null;
  discountAmount?: number | null;
  taxType: 'UAE_VAT' | 'INDIA_GST' | 'NONE';
  taxRate: number; // e.g. 5 for 5%
  taxAmount: number;
  subtotal: number;
  total: number;
  paymentMethod?: string;
  paymentReference?: string;
  localPayment?: {
    paidCurrency: string;
    paidAmount: number;
    fxRate?: string | number | null;
  } | null;
}

@Injectable()
export class InvoicePdfService {
  private readonly logger = new Logger(InvoicePdfService.name);

  async generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();

    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const primaryColor = rgb(0.72, 0.42, 0.07); // #B86B11
    const darkColor = rgb(0.11, 0.1, 0.09); // #1C1917
    const mutedColor = rgb(0.47, 0.44, 0.42); // #78716A
    const borderColor = rgb(0.9, 0.88, 0.85); // #E7E0D6
    const bgLight = rgb(0.98, 0.97, 0.95); // #FAF7F2

    // Background Top Banner Accent
    page.drawRectangle({
      x: 0,
      y: height - 8,
      width,
      height: 8,
      color: primaryColor,
    });

    let y = height - 55;

    // Header: Company Logo / Name
    page.drawText('WhatBoutMe FZE', {
      x: 45,
      y,
      size: 24,
      font: fontBold,
      color: primaryColor,
    });

    // Invoice Tag on Right
    const invoiceTitle = 'TAX INVOICE';
    const invoiceTitleWidth = fontBold.widthOfTextAtSize(invoiceTitle, 20);
    page.drawText(invoiceTitle, {
      x: width - 45 - invoiceTitleWidth,
      y,
      size: 20,
      font: fontBold,
      color: darkColor,
    });

    y -= 18;
    page.drawText('Dubai Silicon Oasis, DDP, Building A2, Dubai, United Arab Emirates', {
      x: 45,
      y,
      size: 9,
      font: fontRegular,
      color: mutedColor,
    });

    const invNumStr = `Invoice #: ${data.invoiceNumber}`;
    const invNumWidth = fontBold.widthOfTextAtSize(invNumStr, 10);
    page.drawText(invNumStr, {
      x: width - 45 - invNumWidth,
      y,
      size: 10,
      font: fontBold,
      color: darkColor,
    });

    y -= 14;
    page.drawText('Tax Registration Number (TRN): 10049281900003', {
      x: 45,
      y,
      size: 9,
      font: fontRegular,
      color: mutedColor,
    });

    const dateStr = `Date: ${data.date}`;
    const dateWidth = fontRegular.widthOfTextAtSize(dateStr, 9);
    page.drawText(dateStr, {
      x: width - 45 - dateWidth,
      y,
      size: 9,
      font: fontRegular,
      color: mutedColor,
    });

    y -= 14;
    page.drawText('Email: billing@whatboutme.com | Web: https://whatboutme.com', {
      x: 45,
      y,
      size: 9,
      font: fontRegular,
      color: mutedColor,
    });

    const statusBadge = 'STATUS: PAID';
    const statusWidth = fontBold.widthOfTextAtSize(statusBadge, 9);
    page.drawRectangle({
      x: width - 45 - statusWidth - 10,
      y: y - 3,
      width: statusWidth + 20,
      height: 18,
      color: rgb(0.94, 0.99, 0.95), // light green
      borderColor: rgb(0.52, 0.94, 0.67),
      borderWidth: 1,
    });
    page.drawText(statusBadge, {
      x: width - 45 - statusWidth,
      y: y + 2,
      size: 9,
      font: fontBold,
      color: rgb(0.09, 0.4, 0.2), // green
    });

    y -= 30;
    // Divider line
    page.drawLine({
      start: { x: 45, y },
      end: { x: width - 45, y },
      thickness: 1,
      color: borderColor,
    });

    y -= 25;

    // Billed To Section
    page.drawText('BILLED TO:', {
      x: 45,
      y,
      size: 10,
      font: fontBold,
      color: primaryColor,
    });

    page.drawText('PAYMENT DETAILS:', {
      x: 340,
      y,
      size: 10,
      font: fontBold,
      color: primaryColor,
    });

    y -= 16;
    page.drawText(data.clientName || 'Learner / Attendee', {
      x: 45,
      y,
      size: 11,
      font: fontBold,
      color: darkColor,
    });

    page.drawText(`Currency: ${data.currency}`, {
      x: 340,
      y,
      size: 10,
      font: fontRegular,
      color: darkColor,
    });

    y -= 14;
    page.drawText(data.clientEmail || 'N/A', {
      x: 45,
      y,
      size: 10,
      font: fontRegular,
      color: mutedColor,
    });

    page.drawText(`Payment Method: ${data.paymentMethod || 'Online Gateway / Test Bypass'}`, {
      x: 340,
      y,
      size: 9,
      font: fontRegular,
      color: mutedColor,
    });

    if (data.paymentReference) {
      y -= 13;
      page.drawText(`Reference: ${data.paymentReference}`, {
        x: 340,
        y,
        size: 8,
        font: fontRegular,
        color: mutedColor,
      });
    }

    y -= 30;

    // Line Items Table Header
    page.drawRectangle({
      x: 45,
      y: y - 5,
      width: width - 90,
      height: 24,
      color: bgLight,
      borderColor,
      borderWidth: 1,
    });

    page.drawText('DESCRIPTION', { x: 55, y: y + 3, size: 9, font: fontBold, color: darkColor });
    page.drawText('QTY', { x: 340, y: y + 3, size: 9, font: fontBold, color: darkColor });
    page.drawText('RATE', { x: 400, y: y + 3, size: 9, font: fontBold, color: darkColor });
    page.drawText('AMOUNT', { x: 480, y: y + 3, size: 9, font: fontBold, color: darkColor });

    y -= 30;

    const hasDiscount = Boolean(data.discountAmount && data.discountAmount > 0);
    const lineItemRate = hasDiscount
      ? data.subtotal + (data.discountAmount || 0)
      : data.subtotal;

    // Line Item Row
    page.drawText(data.itemDescription.slice(0, 48), {
      x: 55,
      y,
      size: 10,
      font: fontBold,
      color: darkColor,
    });
    page.drawText('1', { x: 345, y, size: 10, font: fontRegular, color: darkColor });
    page.drawText(`${data.currencySymbol} ${lineItemRate.toFixed(2)}`, {
      x: 395,
      y,
      size: 10,
      font: fontRegular,
      color: darkColor,
    });
    page.drawText(`${data.currencySymbol} ${lineItemRate.toFixed(2)}`, {
      x: 475,
      y,
      size: 10,
      font: fontBold,
      color: darkColor,
    });

    y -= 25;
    page.drawLine({
      start: { x: 45, y },
      end: { x: width - 45, y },
      thickness: 0.5,
      color: borderColor,
    });

    y -= 25;

    // Calculation Summary Box on Right
    const summaryX = 350;
    const valueX = 475;

    page.drawText(hasDiscount ? 'List Price:' : 'Subtotal:', { x: summaryX, y, size: 10, font: fontRegular, color: mutedColor });
    page.drawText(`${data.currencySymbol} ${lineItemRate.toFixed(2)}`, {
      x: valueX,
      y,
      size: 10,
      font: fontRegular,
      color: darkColor,
    });

    if (hasDiscount) {
      y -= 18;
      const couponLabel = data.couponCode ? `Coupon (${data.couponCode}):` : 'Discount:';
      page.drawText(couponLabel, { x: summaryX, y, size: 9, font: fontRegular, color: primaryColor });
      page.drawText(`-${data.currencySymbol} ${data.discountAmount!.toFixed(2)}`, {
        x: valueX,
        y,
        size: 9,
        font: fontBold,
        color: primaryColor,
      });

      y -= 18;
      page.drawText('Net Subtotal:', { x: summaryX, y, size: 9, font: fontRegular, color: mutedColor });
      page.drawText(`${data.currencySymbol} ${data.subtotal.toFixed(2)}`, {
        x: valueX,
        y,
        size: 9,
        font: fontRegular,
        color: darkColor,
      });
    }

    if (data.taxAmount > 0) {
      y -= 18;
      const taxLabel =
        data.taxType === 'UAE_VAT'
          ? `UAE VAT (${data.taxRate}%):`
          : data.taxType === 'INDIA_GST'
          ? `GST (${data.taxRate}%):`
          : `Tax (${data.taxRate}%):`;
      page.drawText(taxLabel, { x: summaryX, y, size: 9, font: fontRegular, color: mutedColor });
      page.drawText(`${data.currencySymbol} ${data.taxAmount.toFixed(2)}`, {
        x: valueX,
        y,
        size: 9,
        font: fontRegular,
        color: darkColor,
      });
    }

    y -= 22;
    page.drawRectangle({
      x: summaryX - 10,
      y: y - 6,
      width: width - summaryX - 35,
      height: 28,
      color: bgLight,
      borderColor: primaryColor,
      borderWidth: 1,
    });

    page.drawText('Total Paid:', { x: summaryX, y: y + 2, size: 11, font: fontBold, color: primaryColor });
    page.drawText(`${data.currencySymbol} ${data.total.toFixed(2)}`, {
      x: valueX,
      y: y + 2,
      size: 12,
      font: fontBold,
      color: primaryColor,
    });

    // Notes & Footer
    y = 110;
    page.drawLine({
      start: { x: 45, y: y + 15 },
      end: { x: width - 45, y: y + 15 },
      thickness: 1,
      color: borderColor,
    });

    page.drawText('TERMS & NOTES:', { x: 45, y, size: 8, font: fontBold, color: mutedColor });
    y -= 12;
    page.drawText(
      'This invoice is electronically generated and verified by WhatBoutMe FZE, Dubai, UAE.',
      { x: 45, y, size: 8, font: fontRegular, color: mutedColor }
    );
    if (data.localPayment) {
      y -= 11;
      page.drawText(
        `* Localized Settlement: Converted at checkout via Stripe Adaptive Pricing to ${data.localPayment.paidAmount} ${data.localPayment.paidCurrency}${data.localPayment.fxRate ? ` (FX Rate: ${data.localPayment.fxRate})` : ''}.`,
        { x: 45, y, size: 8, font: fontRegular, color: mutedColor }
      );
    }
    y -= 11;
    page.drawText(
      'Payment covers curriculum access and digital workshop materials under the terms signed upon enrolment.',
      { x: 45, y, size: 8, font: fontRegular, color: mutedColor }
    );
    y -= 11;
    page.drawText(
      'For tax or payment queries, please quote your Invoice # and email support@whatboutme.com.',
      { x: 45, y, size: 8, font: fontRegular, color: mutedColor }
    );

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }
}
