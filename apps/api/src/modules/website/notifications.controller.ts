import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  Optional,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import {
  NotificationsService,
  PushSubscriptionDto,
  UnsubscribePushDto,
  BroadcastNotificationDto,
  NotificationPreferencesDto,
} from './notifications.service.js';

@Controller(['notifications', 'api/notifications'])
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * VAPID Public Key endpoint for browser PushManager subscription.
   * Publicly accessible so public visitors (e.g. event landing pages) can subscribe.
   */
  @Public()
  @Get('vapid-public-key')
  getVapidPublicKey() {
    return this.notificationsService.getVapidPublicKey();
  }

  /**
   * Register or refresh browser PushSubscription token.
   * Public endpoint that also attaches userId if user is authenticated.
   */
  @Public()
  @Post('push-subscribe')
  subscribePush(@Body() dto: PushSubscriptionDto, @Request() req: any) {
    const userId = req.user?.sub || null;
    return this.notificationsService.subscribePush(dto, userId);
  }

  /**
   * Unsubscribe push endpoint.
   */
  @Public()
  @Post('push-unsubscribe')
  unsubscribePush(@Body() body: UnsubscribePushDto) {
    return this.notificationsService.unsubscribePush(body?.endpoint);
  }

  /**
   * In-app notifications for signed-in user, newest first.
   */
  @Get('mine')
  getMine(@Request() req: any, @Query('limit') limit?: string) {
    const take = limit ? parseInt(limit, 10) : 50;
    return this.notificationsService.getMine(req.user.sub, take);
  }

  /**
   * Count unread in-app notifications for bell badge.
   */
  @Get('unread-count')
  getUnreadCount(@Request() req: any) {
    return this.notificationsService.getUnreadCount(req.user.sub);
  }

  /**
   * Mark a single notification as read.
   */
  @Patch(':id/read')
  markRead(@Request() req: any, @Param('id') id: string) {
    return this.notificationsService.markAsRead(req.user.sub, id);
  }

  /**
   * Mark all unread notifications as read.
   */
  @Post('mark-all-read')
  markAllRead(@Request() req: any) {
    return this.notificationsService.markAllAsRead(req.user.sub);
  }

  /**
   * Get user notification preferences.
   */
  @Get('preferences')
  getPreferences(@Request() req: any) {
    return this.notificationsService.getPreferences(req.user.sub);
  }

  /**
   * Update user notification preferences (e.g. toggle marketingPush alerts).
   */
  @Patch('preferences')
  updatePreferences(@Request() req: any, @Body() body: NotificationPreferencesDto) {
    return this.notificationsService.updatePreferences(req.user.sub, body);
  }

  /**
   * Admin / Manager broadcast trigger.
   */
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER)
  @Post('broadcast')
  broadcast(@Request() req: any, @Body() dto: BroadcastNotificationDto) {
    return this.notificationsService.broadcast(dto, {
      id: req.user.sub,
      role: req.user.role,
    });
  }

  /**
   * Admin / Manager notification and email delivery logs.
   */
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER)
  @Get('logs')
  getDeliveryLogs(@Query('limit') limit?: string) {
    const take = limit ? parseInt(limit, 10) : 100;
    return this.notificationsService.getDeliveryLogs(take);
  }
}
