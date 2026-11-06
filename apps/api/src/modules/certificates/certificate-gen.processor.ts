import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { IObjectStorageProvider } from '../../common/interfaces/object-storage-provider.interface.js';
import { OBJECT_STORAGE_PROVIDER } from '../../common/interfaces/object-storage-provider.interface.js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as QRCode from 'qrcode';
import { CertificateStatus, CertificateType } from '@prisma/client';

@Processor('certificates', {
  concurrency: 2,
  lockDuration: 60000,
  stalledInterval: 30000,
  maxStalledCount: 2,
})
export class CertificateGenProcessor extends WorkerHost {
  private readonly logger = new Logger(CertificateGenProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE_PROVIDER)
    private readonly objectStorage: IObjectStorageProvider,
  ) {
    super();
  }

  async process(job: Job<{ certificateId: string }>): Promise<{ pdfUrl: string; objectKey: string }> {
    this.logger.log(`Processing certificate generation for job ${job.id}, cert: ${job.data.certificateId}`);

    const certificate = await this.prisma.certificate.findUnique({
      where: { id: job.data.certificateId },
      include: {
        program: true,
        user: true,
        enrolment: {
          include: {
            user: true,
            program: true,
            signedAgreement: {
              select: { typedName: true },
            },
            batch: {
              include: { program: true },
            },
          },
        },
      },
    });

    if (!certificate) {
      throw new Error(`Certificate ${job.data.certificateId} not found`);
    }

    const { certificateCode } = certificate;
    const key = `certificates/${certificateCode}.pdf`;

    if (certificate.pdfUrl && certificate.pdfUrl.length > 0) {
      this.logger.log(`Certificate ${certificate.id} already has a PDF generated: ${certificate.pdfUrl}`);
      return { pdfUrl: certificate.pdfUrl, objectKey: key };
    }

    const recipientName =
      certificate.enrolment?.signedAgreement?.typedName ||
      certificate.enrolment?.user?.name ||
      certificate.user?.name ||
      certificate.enrolment?.user?.email ||
      'Participant';

    const courseName =
      certificate.enrolment?.program?.title ||
      certificate.enrolment?.batch?.program?.title ||
      certificate.program?.title ||
      'Professional Coaching Program';

    const issueDate = certificate.issueDate || certificate.issuedAt || new Date();
    const formattedDate = issueDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const isCorporate =
      certificate.certificateType === CertificateType.CORPORATE_PARTICIPATION;
    const titleText = isCorporate
      ? 'CERTIFICATE OF PARTICIPATION'
      : 'CERTIFICATE OF COMPLETION';
    const completionVerb = isCorporate
      ? 'has actively participated in the executive program'
      : 'has successfully completed all requirements for';

    // Generate PDF (Landscape 800 x 600)
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([800, 600]);

    // Embed fonts
    // Standard PDF fonts (Times Roman for elegant script/serif aesthetic, Helvetica for modern clean text)
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontTimes = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const fontTimesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    const fontTimesItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
    const fontTimesBoldItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic);

    // 1. Warm Cream / Ivory Background (matching marketing steps-2026.png)
    // Canvas dimensions: 800 x 600 Landscape
    page.drawRectangle({
      x: 0,
      y: 0,
      width: 800,
      height: 600,
      color: rgb(0.99, 0.985, 0.955), // Warm Ivory #fdfbf7
    });

    // Soft outer cream margin band
    page.drawRectangle({
      x: 18,
      y: 18,
      width: 764,
      height: 564,
      borderColor: rgb(0.94, 0.91, 0.84), // Soft cream border surround
      borderWidth: 12,
    });

    // 2. Delicate Double Gold Decorative Framing
    // Outer thin gold frame
    page.drawRectangle({
      x: 32,
      y: 32,
      width: 736,
      height: 536,
      borderColor: rgb(0.82, 0.68, 0.35), // Antique Gold #d1ae59
      borderWidth: 1.5,
    });

    // Inner subtle gold hair-line
    page.drawRectangle({
      x: 37,
      y: 37,
      width: 726,
      height: 526,
      borderColor: rgb(0.89, 0.78, 0.48), // Light Gold
      borderWidth: 0.75,
    });

    // 3. Top-Left Brand Wordmark (whatboutme)
    page.drawText('whatboutme', {
      x: 52,
      y: 535,
      size: 15,
      font: fontBold,
      color: rgb(0.12, 0.12, 0.12),
    });
    // Small brand orange dot/heart mark
    page.drawCircle({
      x: 144,
      y: 541,
      size: 3.5,
      color: rgb(0.92, 0.55, 0.15), // Brand warm orange
    });

    // 4. Main Title Hierarchy (Centered)
    // "C E R T I F I C A T E" (wide tracking)
    const mainTitle = 'C E R T I F I C A T E';
    const mainTitleWidth = fontBold.widthOfTextAtSize(mainTitle, 30);
    page.drawText(mainTitle, {
      x: (800 - mainTitleWidth) / 2,
      y: 495,
      size: 30,
      font: fontBold,
      color: rgb(0.12, 0.15, 0.18), // Deep Charcoal
    });

    // "O F   A C H I E V E M E N T" or "O F   P A R T I C I P A T I O N"
    const subTitle = isCorporate ? 'O F   P A R T I C I P A T I O N' : 'O F   A C H I E V E M E N T';
    const subTitleWidth = fontBold.widthOfTextAtSize(subTitle, 14);
    page.drawText(subTitle, {
      x: (800 - subTitleWidth) / 2,
      y: 472,
      size: 14,
      font: fontBold,
      color: rgb(0.78, 0.62, 0.25), // Elegant Ochre Gold #c79e3f
    });

    // "THIS CERTIFICATE IS PROUDLY PRESENTED TO"
    const presentedText = 'THIS CERTIFICATE IS PROUDLY PRESENTED TO';
    const presentedWidth = font.widthOfTextAtSize(presentedText, 9.5);
    page.drawText(presentedText, {
      x: (800 - presentedWidth) / 2,
      y: 438,
      size: 9.5,
      font,
      color: rgb(0.4, 0.42, 0.45),
    });

    // 5. Recipient Name (Script / Calligraphic aesthetic using TimesRomanItalic)
    const nameWidth = fontTimesBoldItalic.widthOfTextAtSize(recipientName, 34);
    page.drawText(recipientName, {
      x: (800 - nameWidth) / 2,
      y: 386,
      size: 34,
      font: fontTimesBoldItalic,
      color: rgb(0.1, 0.24, 0.3), // Dark Slate/Navy #1a3d4d
    });

    // Thin elegant underline extending horizontally under recipient name
    page.drawLine({
      start: { x: 180, y: 372 },
      end: { x: 620, y: 372 },
      thickness: 0.75,
      color: rgb(0.7, 0.75, 0.78),
    });

    // 6. Completion & Program Information
    const completionLabel = 'ON COMPLETION OF';
    const completionLabelWidth = font.widthOfTextAtSize(completionLabel, 9);
    page.drawText(completionLabel, {
      x: (800 - completionLabelWidth) / 2,
      y: 346,
      size: 9,
      font,
      color: rgb(0.4, 0.42, 0.45),
    });

    // Program Title (Bold Dark Navy Uppercase)
    const upperCourseName = courseName.toUpperCase();
    const courseWidth = fontBold.widthOfTextAtSize(upperCourseName, 17);
    page.drawText(upperCourseName, {
      x: (800 - courseWidth) / 2,
      y: 322,
      size: 17,
      font: fontBold,
      color: rgb(0.08, 0.18, 0.28), // Dark Navy #142e47
    });

    // Accompanying details (Date, CPD, Course Code)
    const cpdPoints = certificate.cpdHours || 25;
    const cpdText = !isCorporate && cpdPoints
      ? `ON ${formattedDate.toUpperCase()} AND AWARDED ${cpdPoints} CPD ACCREDITED POINTS - COURSE ${certificateCode}`
      : `ON ${formattedDate.toUpperCase()} - COURSE ${certificateCode}`;
    const cpdWidth = font.widthOfTextAtSize(cpdText, 9);
    page.drawText(cpdText, {
      x: (800 - cpdWidth) / 2,
      y: 298,
      size: 9,
      font,
      color: rgb(0.35, 0.38, 0.42),
    });

    // 7. Conducted Online By Branding
    const conductedText = 'CONDUCTED ONLINE BY';
    const conductedWidth = font.widthOfTextAtSize(conductedText, 8.5);
    page.drawText(conductedText, {
      x: (800 - conductedWidth) / 2,
      y: 252,
      size: 8.5,
      font,
      color: rgb(0.45, 0.48, 0.5),
    });

    const orgText = 'whatboutme';
    const orgWidth = fontBold.widthOfTextAtSize(orgText, 14);
    page.drawText('whatboutme', {
      x: (800 - orgWidth) / 2 - 6,
      y: 232,
      size: 14,
      font: fontBold,
      color: rgb(0.12, 0.12, 0.12),
    });
    page.drawCircle({
      x: (800 + orgWidth) / 2 + 2,
      y: 238,
      size: 3.5,
      color: rgb(0.92, 0.55, 0.15),
    });

    // 8. Bottom Section: Date Block (Left) & Founder Signature (Right)
    // Left: Date Block
    page.drawLine({
      start: { x: 230, y: 148 },
      end: { x: 340, y: 148 },
      thickness: 0.75,
      color: rgb(0.65, 0.65, 0.65),
    });
    const dateLine = formattedDate.toUpperCase();
    const dateLineWidth = font.widthOfTextAtSize(dateLine, 9.5);
    page.drawText(dateLine, {
      x: 285 - dateLineWidth / 2,
      y: 154,
      size: 9.5,
      font,
      color: rgb(0.2, 0.22, 0.25),
    });
    page.drawText('DATE', {
      x: 285 - fontBold.widthOfTextAtSize('DATE', 8.5) / 2,
      y: 134,
      size: 8.5,
      font: fontBold,
      color: rgb(0.35, 0.38, 0.42),
    });
    page.drawText('DUBAI, UAE', {
      x: 285 - font.widthOfTextAtSize('DUBAI, UAE', 8.5) / 2,
      y: 120,
      size: 8.5,
      font,
      color: rgb(0.45, 0.48, 0.5),
    });

    // Right: Founder Signature Block
    const sigLine = 'Roweena Britto';
    const sigWidth = fontTimesItalic.widthOfTextAtSize(sigLine, 18);
    page.drawText(sigLine, {
      x: 520 - sigWidth / 2,
      y: 156,
      size: 18,
      font: fontTimesItalic,
      color: rgb(0.1, 0.18, 0.28), // Cursive signature ink
    });
    page.drawLine({
      start: { x: 450, y: 148 },
      end: { x: 590, y: 148 },
      thickness: 0.75,
      color: rgb(0.65, 0.65, 0.65),
    });
    page.drawText('ROWEENA BRITTO', {
      x: 520 - fontBold.widthOfTextAtSize('ROWEENA BRITTO', 8.5) / 2,
      y: 134,
      size: 8.5,
      font: fontBold,
      color: rgb(0.35, 0.38, 0.42),
    });
    page.drawText('FOUNDER', {
      x: 520 - font.widthOfTextAtSize('FOUNDER', 8.5) / 2,
      y: 120,
      size: 8.5,
      font,
      color: rgb(0.45, 0.48, 0.5),
    });

    // 9. QR Verification Code & Seal (Embedded cleanly at bottom left/right)
    const appUrl = process.env.APP_URL || 'https://whatboutme.com';
    const verifyUrl = `${appUrl}/verify/${certificateCode}`;

    try {
      const qrCodeFn = (QRCode as any).toDataURL || (QRCode as any).default?.toDataURL;
      const qrCodeDataUrl = await qrCodeFn(verifyUrl, {
        margin: 1,
        width: 80,
        color: { dark: '#1e242bff', light: '#ffffffff' },
      });
      const qrCodeImage = await pdfDoc.embedPng(qrCodeDataUrl);
      page.drawImage(qrCodeImage, {
        x: 672,
        y: 68,
        width: 68,
        height: 68,
      });

      const qrLabel = 'VERIFY';
      const qrLabelWidth = fontBold.widthOfTextAtSize(qrLabel, 7.5);
      page.drawText(qrLabel, {
        x: 672 + (68 - qrLabelWidth) / 2,
        y: 56,
        size: 7.5,
        font: fontBold,
        color: rgb(0.4, 0.42, 0.45),
      });
    } catch (err) {
      this.logger.warn(`Failed to embed QR code in certificate: ${err}`);
    }

    // Circular Stamp / Seal representation on bottom left
    page.drawCircle({
      x: 100,
      y: 105,
      size: 32,
      borderColor: rgb(0.3, 0.65, 0.75), // Cyan/Teal #4da6bf
      borderWidth: 1.5,
    });
    page.drawText('VERIFIED', {
      x: 100 - fontBold.widthOfTextAtSize('VERIFIED', 7.5) / 2,
      y: 102,
      size: 7.5,
      font: fontBold,
      color: rgb(0.2, 0.55, 0.65),
    });

    // 10. Footer Band (matching marketing certificate bottom strip)
    const cpdNoText = 'CPD NO: 2740283000';
    page.drawText(cpdNoText, {
      x: 52,
      y: 44,
      size: 7.5,
      font,
      color: rgb(0.4, 0.42, 0.45),
    });

    const webText = 'WWW.WHATBOUTME.COM';
    const webWidth = font.widthOfTextAtSize(webText, 7.5);
    page.drawText(webText, {
      x: (800 - webWidth) / 2,
      y: 44,
      size: 7.5,
      font,
      color: rgb(0.4, 0.42, 0.45),
    });

    const sealText = 'BRAIN ACADEMY ACCREDITED';
    page.drawText(sealText, {
      x: 520,
      y: 44,
      size: 7.5,
      font,
      color: rgb(0.4, 0.42, 0.45),
    });

    // Render & Save PDF buffer
    const pdfBytes = await pdfDoc.save();
    const buffer = Buffer.from(pdfBytes);

    // D2-052: Upload via IObjectStorageProvider.uploadBuffer() using key certificates/${certificateCode}.pdf
    let storageKeyOrUrl: string;
    try {
      storageKeyOrUrl = await this.objectStorage.uploadBuffer(
        key,
        buffer,
        'application/pdf',
      );
    } catch (uploadError: any) {
      this.logger.error(
        `Failed to upload certificate ${certificate.id} to storage:`,
        uploadError,
      );
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    const savedPdfRef = storageKeyOrUrl || key;

    // Update certificate record with generated PDF reference
    await this.prisma.certificate.update({
      where: { id: certificate.id },
      data: {
        pdfUrl: savedPdfRef,
        status: CertificateStatus.ISSUED,
        issuedAt: certificate.issuedAt || new Date(),
      },
    });

    this.logger.log(
      `Certificate ${certificate.id} generated and stored at key: ${key} (ref: ${savedPdfRef})`,
    );

    return { pdfUrl: savedPdfRef, objectKey: key };
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error) {
    this.logger.error(
      `[CertificateGenProcessor] Job ${job?.id} (cert: ${job?.data?.certificateId}) failed on attempt ${job?.attemptsMade}: ${error.message}`,
    );
  }

  @OnWorkerEvent('stalled')
  onStalled(jobId: string) {
    this.logger.warn(`[CertificateGenProcessor] Job ${jobId} stalled and will be re-evaluated.`);
  }
}
