import { Module } from '@nestjs/common';
import { SessionsController } from './sessions.controller.js';
import { SessionsService } from './sessions.service.js';
import { AttendanceController } from './attendance.controller.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { ZoomModule } from '../zoom/zoom.module.js';
import { ZoomMeetingProvider } from '../zoom/zoom.service.js';
import { MEETING_PROVIDER } from '../../common/interfaces/meeting-provider.interface.js';
import { CALENDAR_PROVIDER } from '../../common/interfaces/calendar-provider.interface.js';

import { MeetingSyncProcessor } from './meeting-sync.processor.js';

/**
 * D1-044: CALENDAR_PROVIDER is registered as a null factory until the
 * OutlookCalendarProvider (D2-037–D2-040) is implemented.  The SessionsService
 * injects it with @Optional() so the booking engine works in all environments;
 * Outlook clash-prevention activates automatically once the provider is wired.
 */
@Module({
  imports: [PrismaModule, ZoomModule],
  controllers: [SessionsController, AttendanceController],
  providers: [
    SessionsService,
    MeetingSyncProcessor,
    {
      provide: MEETING_PROVIDER,
      useExisting: ZoomMeetingProvider,
    },
    {
      // Placeholder until D2-037 OutlookCalendarProvider is implemented.
      // Returns null so @Optional() injection degrades gracefully.
      provide: CALENDAR_PROVIDER,
      useValue: null,
    },
  ],
  exports: [SessionsService],
})
export class SessionsModule {}
