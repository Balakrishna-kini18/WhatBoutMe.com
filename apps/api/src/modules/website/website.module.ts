import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller.js';
import { MessagesController } from './messages.controller.js';
import { NotificationsController } from './notifications.controller.js';
import { SiteContentController } from './site-content.controller.js';
import { UploadsController } from './uploads.controller.js';

/** Website content, file uploads, enquiries (CRM), messages and in-app notifications. */
@Module({
  controllers: [
    SiteContentController,
    UploadsController,
    LeadsController,
    MessagesController,
    NotificationsController,
  ],
})
export class WebsiteModule {}
