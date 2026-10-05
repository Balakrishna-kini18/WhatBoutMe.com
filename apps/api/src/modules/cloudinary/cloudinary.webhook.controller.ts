import { Controller, Post, Headers, HttpException, HttpStatus, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { Public } from '../../common/decorators/public.decorator.js';
import { Request } from 'express';

@Controller('webhooks/cloudinary')
export class CloudinaryWebhookController {
  
  // D2-009: Implement webhook listener POST /webhooks/cloudinary with signature verification
  @Public()
  @Post()
  async handleCloudinaryWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-cld-signature') signature: string,
    @Headers('x-cld-timestamp') timestamp: string
  ) {
    if (!signature || !timestamp) {
      throw new HttpException('Missing signature or timestamp', HttpStatus.UNAUTHORIZED);
    }

    try {
      // Use the raw body buffer from express to guarantee exact string match for HMAC verification
      const body = req.body;
      const payloadString = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(body);
      
      const isValid = cloudinary.utils.verifyNotificationSignature(
        payloadString,
        Number(timestamp),
        signature,
        7200 // valid for 2 hours
      );

      if (!isValid) {
        throw new HttpException('Invalid webhook signature', HttpStatus.UNAUTHORIZED);
      }

      // Handle the webhook event
      // e.g., body.notification_type === 'upload'
      console.log('Valid Cloudinary webhook received:', body.notification_type);

      // Return 200 OK to acknowledge receipt
      return { received: true };
    } catch (error: any) {
      console.error('Cloudinary webhook verification failed:', error);
      if (error instanceof HttpException) throw error;
      throw new HttpException('Webhook verification failed', HttpStatus.UNAUTHORIZED);
    }
  }
}
