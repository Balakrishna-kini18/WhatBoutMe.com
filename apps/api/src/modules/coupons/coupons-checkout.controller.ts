import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CouponsService } from './coupons.service.js';
import { ValidateCouponDto } from './dto/validate-coupon.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

@Controller('checkout')
export class CouponsCheckoutController {
  constructor(private readonly couponsService: CouponsService) {}

  @Post('validate-coupon')
  @HttpCode(HttpStatus.OK)
  async validateCoupon(@Body() dto: ValidateCouponDto, @Req() req: any) {
    const userId = dto.userId || req.user?.sub || req.user?.id;
    return this.couponsService.validateCoupon({
      ...dto,
      userId,
    });
  }
}
