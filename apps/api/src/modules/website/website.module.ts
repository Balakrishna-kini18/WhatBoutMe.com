import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { EmailModule } from '../email/email.module.js';
import { AuditModule } from '../../common/audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ContactController } from './contact.controller.js';
import { LeadsController } from './leads.controller.js';
import { MessagesController } from './messages.controller.js';
import { NotificationsController } from './notifications.controller.js';
import { SiteContentController } from './site-content.controller.js';
import { UploadsController } from './uploads.controller.js';

import { NotificationsService } from './notifications.service.js';

/** Website content, file uploads, enquiries (CRM), messages and in-app notifications. */
@Module({
  imports: [PrismaModule, EmailModule, AuditModule, AuthModule],
  controllers: [
    ContactController,
    SiteContentController,
    UploadsController,
    LeadsController,
    MessagesController,
    NotificationsController,
  ],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class WebsiteModule {}

