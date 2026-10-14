import { Module } from '@nestjs/common';
import { CouponsService } from './coupons.service.js';
import { CouponsAdminController } from './coupons-admin.controller.js';
import { CouponsCheckoutController } from './coupons-checkout.controller.js';
import { PrismaModule } from '../../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [CouponsAdminController, CouponsCheckoutController],
  providers: [CouponsService],
  exports: [CouponsService],
})
export class CouponsModule {}
