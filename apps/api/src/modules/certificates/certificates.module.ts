import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CertificatesController } from './certificates.controller.js';
import { CertificatesService } from './certificates.service.js';
import { CertificateEligibilityService } from './certificate-eligibility.service.js';
import { CertificateGenProcessor } from './certificate-gen.processor.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { CloudinaryModule } from '../cloudinary/cloudinary.module.js';
import { SessionsModule } from '../sessions/sessions.module.js';

const isWorkerMode = process.env.WORKER_MODE === 'true';

@Module({
  imports: [
    PrismaModule,
    CloudinaryModule,
    forwardRef(() => SessionsModule),
    BullModule.registerQueue({
      name: 'certificates',
    }),
  ],
  controllers: [CertificatesController],
  providers: [
    CertificatesService,
    CertificateEligibilityService,
    ...(isWorkerMode ? [CertificateGenProcessor] : []),
  ],
  exports: [CertificatesService, CertificateEligibilityService],
})
export class CertificatesModule {}
