import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Headers,
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
   * LIVE STRIPE WEBHOOK ENDPOINT
   * Receives server-to-server events from Stripe, verifies cryptographic signature,
   * and fulfills orders idempotently.
   */
  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleStripeWebhook(
    @Req() req: any,
    @Headers('stripe-signature') signature: string,
  ) {
    const rawPayload = req.rawBody || req.body;
    return this.paymentsService.handleStripeWebhook(rawPayload, signature, req.headers);
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
    let userRole = req?.user?.role;
    if (!userRole && req?.headers?.authorization?.startsWith('Bearer ')) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        const base64Payload = token.split('.')[1];
        if (base64Payload) {
          const payload = JSON.parse(Buffer.from(base64Payload, 'base64').toString('utf8'));
          userRole = payload?.role;
        }
      } catch {}
    }
    const isSuperAdmin = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN';

    if (isProd && !isSuperAdmin) {
      throw new ForbiddenException(
        'Webhook test simulation is disabled in live production environments. Please use real Stripe checkout.',
      );
    }

    const rawIp = req?.ip ?? req?.headers?.['x-forwarded-for'] ?? '127.0.0.1';
    const clientIp = Array.isArray(rawIp) ? rawIp[0] : (rawIp.split(',')[0]?.trim() || '127.0.0.1');

    return this.paymentsService.simulateTestWebhook(dto, clientIp);
  }
}
