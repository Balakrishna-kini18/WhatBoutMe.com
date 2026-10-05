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
    page.drawText('CERTIFICATE OF COMPLETION', {
      x: 150,
      y: 450,
      size: 35,
      font: fontBold,
      color: rgb(0, 0.3, 0.6),
    });

    page.drawText('This is to certify that', {
      x: 320,
      y: 380,
      size: 18,
      font,
    });

    page.drawText(recipientName, {
      x: 400 - (recipientName.length * 8), // Center approximation
      y: 330,
      size: 30,
      font: fontBold,
    });

    page.drawText('has successfully completed the program', {
      x: 240,
      y: 280,
      size: 18,
      font,
    });

    page.drawText(courseName, {
      x: 400 - (courseName.length * 6), // Center approximation
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
    const qrCodeDataUrl = await QRCode.toDataURL(`https://example.com/verify/${certificateCode}`);
    const qrCodeImage = await pdfDoc.embedPng(qrCodeDataUrl);
    
    page.drawImage(qrCodeImage, {
      x: 600,
      y: 50,
      width: 120,
      height: 120,
    });

    const pdfBytes = await pdfDoc.save();
    const buffer = Buffer.from(pdfBytes);

    const key = `certificates/${certificateCode}.pdf`;
    
    // Upload to storage
    const pdfUrl = await this.objectStorage.uploadBuffer(key, buffer, 'application/pdf');

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
    return { pdfUrl: key };
  }
}
