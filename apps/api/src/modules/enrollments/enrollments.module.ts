import { Module } from '@nestjs/common';
import {
  AdminEnrolmentsController,
  BatchWaitlistController,
  LearnerEnrolmentsController,
  CheckoutController
} from './enrollments.controller.js';
import { EnrollmentsService } from './enrollments.service.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { CacheHelperModule } from '../../common/cache/cache-helper.module.js';

@Module({
  imports: [PrismaModule, CacheHelperModule],
  controllers: [
    AdminEnrolmentsController,
    BatchWaitlistController,
    LearnerEnrolmentsController,
    CheckoutController
  ],
  providers: [EnrollmentsService],
  exports: [EnrollmentsService],
})
export class EnrollmentsModule {}
