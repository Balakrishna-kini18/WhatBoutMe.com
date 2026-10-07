import { Module } from '@nestjs/common';
import { AgreementsService } from './agreements.service.js';
import {
  AdminAgreementTemplatesController,
  LearnerAgreementsController,
} from './agreements.controller.js';
import { PrismaModule } from '../../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [AdminAgreementTemplatesController, LearnerAgreementsController],
  providers: [AgreementsService],
  exports: [AgreementsService],
})
export class AgreementsModule {}
