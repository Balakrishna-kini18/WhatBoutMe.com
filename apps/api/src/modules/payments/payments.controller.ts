import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PaymentsService } from './payments.service.js';
import { TestSimulateWebhookDto } from './dto/test-simulate-webhook.dto.js';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto.js';
import { Public } from '../../common/decorators/public.decorator.js';

@Controller(['payments', 'api/payments'])
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Public()
  @Get('active-provider')
  getActiveProvider() {
    return this.paymentsService.getActiveProviderInfo();
  }

  @Public()
  @Get('session-status/:sessionId')
  getSessionStatus(@Req() req: any) {
    const sessionId = req.params?.sessionId;
    return this.paymentsService.getSessionStatus(sessionId);
  }

  @Public()
  @Post('checkout-session')
  createCheckoutSession(@Body() dto: CreateCheckoutSessionDto, @Req() req: any) {
    const user = req.user;
    return this.paymentsService.createCheckoutSession(dto, user);
  }

  /**
   * CRITICAL TEST_BYPASS WEBHOOK SIMULATION ENDPOINT
   * Accessible by frontend checkout components to trigger server-to-server webhook transition atomically.
   */
  @Public()
  @Post('webhook/test-simulate')
  @HttpCode(HttpStatus.OK)
  simulateTestWebhook(@Body() dto: TestSimulateWebhookDto, @Req() req: any) {
    const rawIp = req?.ip ?? req?.headers?.['x-forwarded-for'] ?? '127.0.0.1';
    const clientIp = Array.isArray(rawIp) ? rawIp[0] : (rawIp.split(',')[0]?.trim() || '127.0.0.1');

    return this.paymentsService.simulateTestWebhook(dto, clientIp);
  }
}
