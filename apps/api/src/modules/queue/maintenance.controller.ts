import {
  Controller,
  Post,
  Headers,
  UnauthorizedException,
  Logger,
  HttpCode,
  HttpStatus,
  Optional,
} from '@nestjs/common';
import crypto from 'crypto';
import { RecoverySweepService } from './recovery-sweep.service.js';
import { Public } from '../../common/decorators/public.decorator.js';

@Controller('maintenance')
export class MaintenanceController {
  private readonly logger = new Logger(MaintenanceController.name);

  constructor(
    @Optional() private readonly recoverySweepService?: RecoverySweepService,
  ) {}

  /**
   * Secure, externally-triggered maintenance recovery sweep endpoint.
   * Protected with constant-time comparison against CRON_SECRET or MAINTENANCE_SECRET.
   */
  @Public()
  @Post('recovery-sweep')
  @HttpCode(HttpStatus.OK)
  async triggerRecoverySweep(@Headers('authorization') authHeader?: string) {
    const configuredSecret = process.env.CRON_SECRET || process.env.MAINTENANCE_SECRET;
    if (!configuredSecret) {
      this.logger.warn('Recovery sweep endpoint called but CRON_SECRET/MAINTENANCE_SECRET is not configured.');
      throw new UnauthorizedException('Maintenance endpoint is not configured');
    }

    const providedToken = (authHeader || '').replace(/^Bearer\s+/i, '').trim();
    if (!providedToken) {
      throw new UnauthorizedException('Authorization header required');
    }

    const expectedBuffer = Buffer.from(configuredSecret, 'utf8');
    const providedBuffer = Buffer.from(providedToken, 'utf8');

    if (
      expectedBuffer.length !== providedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      this.logger.warn('Invalid secret provided to recovery-sweep endpoint');
      throw new UnauthorizedException('Invalid maintenance secret');
    }

    if (!this.recoverySweepService) {
      return {
        status: 'accepted',
        message: 'Recovery sweep service is running in worker context.',
        timestamp: new Date().toISOString(),
      };
    }

    this.logger.log('Manual recovery sweep triggered via authenticated maintenance endpoint');
    const metrics = await this.recoverySweepService.runSweep();
    return {
      status: 'success',
      metrics,
    };
  }
}

