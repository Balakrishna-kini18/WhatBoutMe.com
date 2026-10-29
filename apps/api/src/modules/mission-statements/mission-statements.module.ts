import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { EmailModule } from '../email/email.module.js';
import { AuditModule } from '../../common/audit/audit.module.js';
import { ProgressionModule } from '../progression/progression.module.js';
import { CertificatesModule } from '../certificates/certificates.module.js';
import { CloudinaryModule } from '../cloudinary/cloudinary.module.js';
import { MissionStatementsController } from './mission-statements.controller.js';
import { MissionStatementsService } from './mission-statements.service.js';

@Module({
  imports: [
    PrismaModule,
    EmailModule,
    AuditModule,
    CloudinaryModule,
    forwardRef(() => ProgressionModule),
    forwardRef(() => CertificatesModule),
  ],
  controllers: [MissionStatementsController],
  providers: [MissionStatementsService],
  exports: [MissionStatementsService],
})
export class MissionStatementsModule {}
