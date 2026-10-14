import { Module, forwardRef } from '@nestjs/common';
import { SessionsController } from './sessions.controller.js';
import { SessionsService } from './sessions.service.js';
import { AttendanceService } from './attendance.service.js';
import { AttendanceReconciliationService } from './attendance-reconciliation.service.js';
import { AttendanceComplianceService } from './attendance-compliance.service.js';
import { AttendanceController } from './attendance.controller.js';
import { BatchAttendanceController } from './batch-attendance.controller.js';
import { SessionCheckinController } from './session-checkin.controller.js';
import { MeAttendanceController } from './me-attendance.controller.js';
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
import { AuditModule } from '../../common/audit/audit.module.js';

const isWorkerMode = process.env.WORKER_MODE === 'true';

@Module({
  imports: [
    PrismaModule,
    ZoomModule,
    EmailModule,
    AuditModule,
    forwardRef(() => CertificatesModule),
  ],
  controllers: [
    SessionsController,
    AttendanceController,
    BatchAttendanceController,
    SessionCheckinController,
    MeAttendanceController,
  ],
  providers: [
    SessionsService,
    AttendanceService,
    AttendanceReconciliationService,
    AttendanceComplianceService,
    GoogleMeetProvider,
    MeetingProviderFactory,
    ...(isWorkerMode ? [MeetingSyncProcessor] : []),
    {
      provide: MEETING_PROVIDER,
      useExisting: ZoomMeetingProvider,
    },
    {
      provide: CALENDAR_PROVIDER,
      useValue: null,
    },
  ],
  exports: [
    SessionsService,
    AttendanceService,
    AttendanceReconciliationService,
    AttendanceComplianceService,
    MeetingProviderFactory,
    GoogleMeetProvider,
  ],
})
export class SessionsModule {}
