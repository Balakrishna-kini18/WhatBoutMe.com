import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CloudinaryObjectStorageProvider } from '../cloudinary/cloudinary-object-storage.service.js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as QRCode from 'qrcode';

@Processor('certificates')
export class CertificateGenProcessor extends WorkerHost {
  private readonly logger = new Logger(CertificateGenProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly objectStorage: CloudinaryObjectStorageProvider,
  ) {
    super();
  }

  async process(job: Job<{ certificateId: string }>): Promise<{ pdfUrl: string }> {
    this.logger.log(`Processing certificate generation for job ${job.id}, cert: ${job.data.certificateId}`);
    
    const certificate = await this.prisma.certificate.findUnique({
      where: { id: job.data.certificateId },
      include: {
        enrolment: {
          include: {
            user: true,
            batch: {
              include: { program: true }
            }
          }
        }
      }
    });

    if (!certificate) {
      throw new Error(`Certificate ${job.data.certificateId} not found`);
    }

    if (certificate.pdfUrl) {
      this.logger.log(`Certificate ${certificate.id} already has a PDF generated.`);
      return { pdfUrl: certificate.pdfUrl };
    }

    const { enrolment, certificateCode } = certificate;
    const recipientName = enrolment.user.name || enrolment.user.email;
    const courseName = enrolment.batch.program.title;
    const date = new Date().toLocaleDateString();

    // Generate PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([800, 600]);
    
    // Embed fonts
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Draw text
    const titleText = 'CERTIFICATE OF COMPLETION';
    const titleWidth = fontBold.widthOfTextAtSize(titleText, 35);
    page.drawText(titleText, {
      x: (800 - titleWidth) / 2,
      y: 450,
      size: 35,
      font: fontBold,
      color: rgb(0, 0.3, 0.6),
    });

    const certifyText = 'This is to certify that';
    const certifyWidth = font.widthOfTextAtSize(certifyText, 18);
    page.drawText(certifyText, {
      x: (800 - certifyWidth) / 2,
      y: 380,
      size: 18,
      font,
    });

    const nameWidth = fontBold.widthOfTextAtSize(recipientName, 30);
    page.drawText(recipientName, {
      x: (800 - nameWidth) / 2,
      y: 330,
      size: 30,
      font: fontBold,
    });

    const successText = 'has successfully completed the program';
    const successWidth = font.widthOfTextAtSize(successText, 18);
    page.drawText(successText, {
      x: (800 - successWidth) / 2,
      y: 280,
      size: 18,
      font,
    });

    const courseWidth = fontBold.widthOfTextAtSize(courseName, 24);
    page.drawText(courseName, {
      x: (800 - courseWidth) / 2,
      y: 230,
      size: 24,
      font: fontBold,
      color: rgb(0.2, 0.2, 0.2),
    });

    page.drawText(`Date: ${date}`, {
      x: 100,
      y: 100,
      size: 14,
      font,
    });
    
    page.drawText(`ID: ${certificateCode}`, {
      x: 100,
      y: 70,
      size: 12,
      font,
    });

    // Generate QR code
    let qrCodeImage;
    try {
      const qrCodeDataUrl = await QRCode.toDataURL(`https://example.com/verify/${certificateCode}`);
      qrCodeImage = await pdfDoc.embedPng(qrCodeDataUrl);
      page.drawImage(qrCodeImage, {
        x: 600,
        y: 50,
        width: 120,
        height: 120,
      });
    } catch (err) {
      this.logger.error(`Failed to generate QR code for certificate ${certificateCode}:`, err);
      // We can continue generating the certificate even if the QR code fails
    }

    const pdfBytes = await pdfDoc.save();
    const buffer = Buffer.from(pdfBytes);

    const key = `certificates/${certificateCode}.pdf`;
    
    // Upload to storage
    let pdfUrl: string;
    try {
      pdfUrl = await this.objectStorage.uploadBuffer(key, buffer, 'application/pdf');
    } catch (uploadError: any) {
      this.logger.error(`Failed to upload certificate ${certificate.id} to storage:`, uploadError);
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    // Update certificate record
    await this.prisma.certificate.update({
      where: { id: certificate.id },
      data: {
        pdfUrl,
        status: 'ISSUED',
        issuedAt: new Date(),
      }
    });

    this.logger.log(`Certificate ${certificate.id} generated and uploaded to ${pdfUrl}`);
    
    // Return object key to certificate service
    return { pdfUrl };
  }
}
