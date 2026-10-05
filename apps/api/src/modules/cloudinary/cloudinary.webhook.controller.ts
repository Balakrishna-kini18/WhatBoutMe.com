import { Controller, Post, Body, Headers, HttpException, HttpStatus } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';

@Controller('webhooks/cloudinary')
export class CloudinaryWebhookController {
  
  // D2-009: Implement webhook listener POST /webhooks/cloudinary with signature verification
  @Post()
  async handleCloudinaryWebhook(
    @Body() body: any,
    @Headers('x-cld-signature') signature: string,
    @Headers('x-cld-timestamp') timestamp: string
  ) {
    if (!signature || !timestamp) {
      throw new HttpException('Missing signature or timestamp', HttpStatus.UNAUTHORIZED);
    }

    try {
      // For Cloudinary webhook verification, the stringified body must match exactly.
      // NestJS might have parsed it, so we stringify it back. For production, it's 
      // better to use raw body parsing for webhooks to avoid JSON key reordering issues.
      const payloadString = JSON.stringify(body);
      
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
    } catch (error) {
      console.error('Cloudinary webhook verification failed:', error);
      throw new HttpException('Webhook verification failed', HttpStatus.UNAUTHORIZED);
    }
  }
}
