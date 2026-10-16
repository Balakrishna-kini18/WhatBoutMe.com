import { Module } from '@nestjs/common';
import { AgreementsService } from './agreements.service.js';
import {
  AdminAgreementTemplatesController,
  LearnerAgreementsController,
} from './agreements.controller.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { CacheHelperModule } from '../../common/cache/cache-helper.module.js';

@Module({
  imports: [PrismaModule, CacheHelperModule],
  controllers: [AdminAgreementTemplatesController, LearnerAgreementsController],
  providers: [AgreementsService],
  exports: [AgreementsService],
})
export class AgreementsModule {}
