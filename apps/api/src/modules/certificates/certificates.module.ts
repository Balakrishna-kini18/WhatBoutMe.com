import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CertificatesController } from './certificates.controller.js';
import { CertificatesService } from './certificates.service.js';
import { CertificateEligibilityService } from './certificate-eligibility.service.js';
import { CertificateGenProcessor } from './certificate-gen.processor.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { CloudinaryModule } from '../cloudinary/cloudinary.module.js';
import { SessionsModule } from '../sessions/sessions.module.js';

@Module({
  imports: [
    PrismaModule,
    CloudinaryModule,
    SessionsModule,
    BullModule.registerQueue({
      name: 'certificates',
    }),
  ],
  controllers: [CertificatesController],
  providers: [
    CertificatesService,
    CertificateEligibilityService,
    CertificateGenProcessor,
  ],
  exports: [CertificatesService, CertificateEligibilityService],
})
export class CertificatesModule {}
