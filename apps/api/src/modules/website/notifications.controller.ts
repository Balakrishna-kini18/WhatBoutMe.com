import { Controller, Get, Request } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

/** In-app notifications for the signed-in user, newest first. */
@Controller('notifications')
export class NotificationsController {
  constructor(private prisma: PrismaService) {}

  @Get('mine')
  mine(@Request() req: any) {
    return this.prisma.notification.findMany({
      where: {
        userId: req.user.sub,
        channel: { in: [NotificationChannel.IN_APP, NotificationChannel.BOTH] },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }
}
