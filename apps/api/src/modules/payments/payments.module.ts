import { Module, forwardRef } from '@nestjs/common';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { MockTestPaymentProvider } from './providers/mock-test.provider.js';
import { RazorpayPaymentProvider } from './providers/razorpay.provider.js';
import { StripePaymentProvider } from './providers/stripe.provider.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { InvoicesModule } from '../invoices/invoices.module.js';
import { EmailModule } from '../email/email.module.js';
import { CouponsModule } from '../coupons/coupons.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';

@Module({
  imports: [
    PrismaModule,
    InvoicesModule,
    EmailModule,
    CouponsModule,
    forwardRef(() => OrganizationsModule),
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    MockTestPaymentProvider,
    RazorpayPaymentProvider,
    StripePaymentProvider,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
