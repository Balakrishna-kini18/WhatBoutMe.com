import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PaymentsService } from './payments.service.js';
import { TestSimulateWebhookDto } from './dto/test-simulate-webhook.dto.js';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto.js';
import { Public } from '../../common/decorators/public.decorator.js';

const CHECKOUT_RATE_LIMIT = { default: { limit: 25, ttl: 60000 } };
const STATUS_RATE_LIMIT = { default: { limit: 40, ttl: 60000 } };

@Controller(['payments', 'api/payments'])
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Public()
  @Get('active-provider')
  getActiveProvider() {
    return this.paymentsService.getActiveProviderInfo();
  }

  @Public()
  @Throttle(STATUS_RATE_LIMIT)
  @Get('session-status/:sessionId')
  getSessionStatus(@Req() req: any) {
    const sessionId = req.params?.sessionId;
    return this.paymentsService.getSessionStatus(sessionId);
  }

  @Public()
  @Throttle(CHECKOUT_RATE_LIMIT)
  @Post('checkout-session')
  createCheckoutSession(@Body() dto: CreateCheckoutSessionDto, @Req() req: any) {
    const user = req.user;
    return this.paymentsService.createCheckoutSession(dto, user);
  }

  /**
   * TEST_BYPASS WEBHOOK SIMULATION ENDPOINT
   * Strictly restricted: Only accessible in non-production development/staging when
   * running under TEST_BYPASS / MOCK_TEST mode, or by authenticated SUPER_ADMINs.
   */
  @Public()
  @Post('webhook/test-simulate')
  @HttpCode(HttpStatus.OK)
  simulateTestWebhook(@Body() dto: TestSimulateWebhookDto, @Req() req: any) {
    const isProd = process.env.NODE_ENV === 'production';
    const isLiveStripe = process.env.PAYMENT_PROVIDER === 'STRIPE' || this.paymentsService.getActiveProvider()?.providerType === 'STRIPE';
    const isSuperAdmin = req?.user?.role === 'SUPER_ADMIN';

    if ((isProd || isLiveStripe) && !isSuperAdmin) {
      throw new ForbiddenException(
        'Webhook test simulation is disabled in live/production environments. Please use real Stripe checkout.',
      );
    }

    const rawIp = req?.ip ?? req?.headers?.['x-forwarded-for'] ?? '127.0.0.1';
    const clientIp = Array.isArray(rawIp) ? rawIp[0] : (rawIp.split(',')[0]?.trim() || '127.0.0.1');

    return this.paymentsService.simulateTestWebhook(dto, clientIp);
  }
}
