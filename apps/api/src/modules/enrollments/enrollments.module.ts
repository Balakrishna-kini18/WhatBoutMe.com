import { Module } from '@nestjs/common';
import {
  AdminEnrolmentsController,
  BatchWaitlistController,
  LearnerEnrolmentsController,
  CheckoutController
} from './enrollments.controller.js';
import { PaymentWebhookController } from './payment.webhook.controller.js';
import { EnrollmentsService } from './enrollments.service.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { CacheHelperModule } from '../../common/cache/cache-helper.module.js';
import { CouponsModule } from '../coupons/coupons.module.js';

@Module({
  imports: [PrismaModule, CacheHelperModule, CouponsModule],
  controllers: [
    AdminEnrolmentsController,
    BatchWaitlistController,
    LearnerEnrolmentsController,
    CheckoutController,
    PaymentWebhookController,
  ],
  providers: [EnrollmentsService],
  exports: [EnrollmentsService],
})
export class EnrollmentsModule {}
