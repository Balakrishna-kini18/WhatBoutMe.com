import { Module, forwardRef } from '@nestjs/common';
import { SessionsController } from './sessions.controller.js';
import { SessionsService } from './sessions.service.js';
import { AttendanceService } from './attendance.service.js';
import { AttendanceReconciliationService } from './attendance-reconciliation.service.js';
import { AttendanceComplianceService } from './attendance-compliance.service.js';
import { AttendanceController } from './attendance.controller.js';
import { BatchAttendanceController, BatchSessionsController } from './batch-attendance.controller.js';
import { SessionCheckinController } from './session-checkin.controller.js';
import { MeAttendanceController } from './me-attendance.controller.js';
import { SessionLifecycleService } from './session-lifecycle.service.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { ZoomModule } from '../zoom/zoom.module.js';
import { ZoomMeetingProvider } from '../zoom/zoom.service.js';
import { GoogleMeetProvider } from './providers/google-meet.provider.js';
import { MeetingProviderFactory } from './providers/meeting-provider.factory.js';
import { MEETING_PROVIDER } from '../../common/interfaces/meeting-provider.interface.js';
import { CALENDAR_PROVIDER } from '../../common/interfaces/calendar-provider.interface.js';
import { MeetingSyncProcessor } from './meeting-sync.processor.js';
import { EmailModule } from '../email/email.module.js';
import { CertificatesModule } from '../certificates/certificates.module.js';
import { ProgressionModule } from '../progression/progression.module.js';
import { AuditModule } from '../../common/audit/audit.module.js';

import { MicrosoftGraphCalendarProvider } from './providers/microsoft-graph.provider.js';

import { DiscoveryController, SessionsDiscoveryController } from './discovery.controller.js';
import { DiscoveryService } from './discovery.service.js';
import { OneOnOneController } from './one-on-one.controller.js';
import { OneOnOneService } from './one-on-one.service.js';

const isWorkerMode = process.env.WORKER_MODE === 'true';

@Module({
  imports: [
    PrismaModule,
    ZoomModule,
    EmailModule,
    AuditModule,
    forwardRef(() => CertificatesModule),
    forwardRef(() => ProgressionModule),
  ],
  controllers: [
    DiscoveryController,
    SessionsDiscoveryController,
    OneOnOneController,
    SessionsController,
    AttendanceController,
    BatchAttendanceController,
    BatchSessionsController,
    SessionCheckinController,
    MeAttendanceController,
  ],
  providers: [
    SessionsService,
    DiscoveryService,
    OneOnOneService,
    AttendanceService,
    AttendanceReconciliationService,
    AttendanceComplianceService,
    GoogleMeetProvider,
    MeetingProviderFactory,
    MicrosoftGraphCalendarProvider,
    SessionLifecycleService,
    ...(isWorkerMode ? [MeetingSyncProcessor] : []),
    {
      provide: MEETING_PROVIDER,
      useExisting: ZoomMeetingProvider,
    },
    {
      provide: CALENDAR_PROVIDER,
      useExisting: MicrosoftGraphCalendarProvider,
    },
  ],
  exports: [
    DiscoveryService,
    OneOnOneService,
    SessionsService,
    SessionLifecycleService,
    AttendanceService,
    AttendanceReconciliationService,
    AttendanceComplianceService,
    MeetingProviderFactory,
    GoogleMeetProvider,
    MicrosoftGraphCalendarProvider,
    CALENDAR_PROVIDER,
  ],
})
export class SessionsModule {}
