import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  Optional,
} from '@nestjs/common';
import { SessionsService } from './sessions.service.js';
import { AttendanceReconciliationService } from './attendance-reconciliation.service.js';
import { SessionLifecycleService } from './session-lifecycle.service.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { Permission } from '../../config/permissions.config.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { Role } from '@prisma/client';
import { CreateSessionDto, UpdateSessionDto, QuerySessionsDto, RecordSessionProgressDto } from './dto/index.js';

@Controller('sessions')
@UseGuards(PermissionsGuard)
export class SessionsController {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly reconciliationService: AttendanceReconciliationService,
    @Optional() private readonly lifecycleService?: SessionLifecycleService,
  ) {}

  /**
   * Trigger lifecycle transition sweep (Scheduled -> Active -> Completed)
   * and reminder dispatches. Can be invoked on demand by admins or cron workers.
   */
  @RequirePermission(Permission.SESSIONS_UPDATE)
  @Post('lifecycle-sweep')
  async triggerLifecycleSweep() {
    if (!this.lifecycleService) {
      return { activatedCount: 0, completedCount: 0, reminders24hSent: 0, reminders1hSent: 0, reminders10mSent: 0 };
    }
    return this.lifecycleService.processLifecycleTransitions();
  }

  /**
   * Filter sessions by batch, sessionType, trainer, status, or date range.
   * Scoped to manager's assigned cohorts or learner's enrolled cohorts.
   */
  @RequirePermission(Permission.SESSIONS_READ)
  @Get()
  getSessions(@Query() query: QuerySessionsDto, @Request() req: any) {
    // If batchId is passed alone without DTO wrapping
    return this.sessionsService.getSessions(query, req.user);
  }

  /**
   * Learner-specific: live sessions across enrolled cohorts and dedicated 1:1s.
   * D1-045: Sessions are enriched with a `displayTime` block in the learner's
   * stored profile timezone. UTC startTime/endTime values are never altered.
   */
  @RequirePermission(Permission.SESSIONS_READ)
  @Get('mine')
  async getMySessions(@Request() req: any) {
    const tz = await this.sessionsService.getUserTimezoneForDisplay(req.user.sub);
    return this.sessionsService.getMySessions(req.user.sub, tz);
  }

  /**
   * Overview of all sessions for administrative management.
   */
  @RequirePermission(Permission.SESSIONS_READ)
  @Get('all')
  async getAllSessions(@Request() req: any) {
    // Reconcile any scheduled sessions missing zoom links
    this.sessionsService.reconcilePendingZoomSessions?.().catch(() => {});
    return this.sessionsService.getSessions({}, req.user);
  }

  /**
   * Manually trigger Zoom sync for a specific session.
   */
  @RequirePermission(Permission.SESSIONS_UPDATE)
  @Post(':id/sync-zoom')
  syncSessionMeeting(@Param('id') id: string) {
    return this.sessionsService.syncSessionMeeting(id);
  }

  /**
   * Reconcile all scheduled sessions with missing Zoom links.
   */
  @RequirePermission(Permission.SESSIONS_UPDATE)
  @Post('reconcile-zoom')
  reconcileZoom() {
    return this.sessionsService.reconcilePendingZoomSessions();
  }

  /**
   * Get single session by ID.
   */
  @RequirePermission(Permission.SESSIONS_READ)
  @Get(':id')
  getSessionById(@Param('id') id: string, @Request() req: any) {
    return this.sessionsService.getSessionById(id, req.user);
  }

  /**
   * Schedule a new 1-on-1 coaching or group cohort session.
   * D1-043: Enforces UTC persistence, trainer double-booking clash checks,
   * capacity limits, and Zoom meeting creation via IMeetingProvider.
   */
  @RequirePermission(Permission.SESSIONS_CREATE)
  @Post()
  createSession(@Body() body: CreateSessionDto, @Request() req: any) {
    return this.sessionsService.createSession(body, req.user);
  }

  /**
   * Update an existing session's schedule, capacity, or details.
   */
  @RequirePermission(Permission.SESSIONS_UPDATE)
  @Patch(':id')
  updateSession(
    @Param('id') id: string,
    @Body() body: UpdateSessionDto,
    @Request() req: any,
  ) {
    return this.sessionsService.updateSession(id, body, req.user);
  }

  /**
   * Soft-cancel a session with reason logging and external meeting cleanup.
   */
  @RequirePermission(Permission.SESSIONS_CANCEL)
  @Post(':id/cancel')
  cancelSession(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Request() req: any,
  ) {
    return this.sessionsService.cancelSession(id, reason, req.user);
  }

  /**
   * Hard-delete a session if no attendance records exist.
   */
  @RequirePermission(Permission.SESSIONS_DELETE)
  @Delete(':id')
  deleteSession(@Param('id') id: string, @Request() req: any) {
    return this.sessionsService.deleteSession(id, req.user);
  }

  /**
   * Attendance: retrieve attendee list for a session.
   */
  @RequirePermission(Permission.ATTENDANCE_READ)
  @Get(':id/attendance')
  getAttendance(@Param('id') id: string, @Request() req: any) {
    return this.sessionsService.getAttendanceForSession(id, req.user);
  }

  /**
   * Attendance: learner self check-in.
   */
  @RequirePermission(Permission.ATTENDANCE_MARK)
  @Post(':id/attend')
  markSelfAttendance(@Param('id') id: string, @Request() req: any) {
    return this.sessionsService.markAttendance(id, req.user.sub, false);
  }

  /**
   * Live Session Presence Heartbeat:
   * POST /sessions/:id/live-heartbeat
   * Increments actual elapsed live minutes, tracks leaveTime, and updates attendance progression.
   */
  @RequirePermission(Permission.ATTENDANCE_MARK)
  @Post(':id/live-heartbeat')
  recordLiveHeartbeat(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body?: { action?: string },
  ) {
    return this.sessionsService.recordLiveHeartbeat(id, req.user.sub, body?.action);
  }

  /**
   * Attendance: administrative override check-in.
   */
  @RequirePermission(Permission.ATTENDANCE_CORRECT)
  @Post(':id/override-attendance')
  overrideAttendance(@Param('id') id: string, @Body('userId') userId: string) {
    return this.sessionsService.markAttendance(id, userId, true);
  }

  /**
   * Phase 3 Hybrid Attendance:
   * POST /sessions/:id/recording-progress
   * Records media watch progress for session recordings with anti-skip validation.
   */
  @RequirePermission(Permission.ATTENDANCE_READ)
  @Post(':id/recording-progress')
  recordRecordingProgress(
    @Param('id') id: string,
    @Body() body: RecordSessionProgressDto,
    @Request() req: any,
  ) {
    const userId = req.user.sub ?? req.user.userId ?? req.user.id;
    return this.sessionsService.recordRecordingProgress(id, userId, body);
  }


  /**
   * D1-048b: Fetch unmatched attendance records for a session
   */
  @RequirePermission(Permission.ATTENDANCE_CORRECT)
  @Get(':id/unmatched-attendance')
  getUnmatchedAttendance(@Param('id') id: string) {
    return this.reconciliationService.getUnmatchedForSession(id);
  }

  /**
   * D1-048b: Resolve unmatched attendance
   */
  @RequirePermission(Permission.ATTENDANCE_CORRECT)
  @Patch(':id/unmatched-attendance/:unmatchedId/resolve')
  resolveUnmatchedAttendance(
    @Param('unmatchedId') unmatchedId: string,
    @Body('enrolmentId') enrolmentId: string,
    @Request() req: any
  ) {
    const actorId = req.user.sub ?? req.user.userId ?? req.user.id;
    const isPrivileged = req.user.role === Role.ADMIN || req.user.role === Role.SUPER_ADMIN;
    return this.reconciliationService.resolveUnmatched(unmatchedId, enrolmentId, actorId, isPrivileged);
  }

  /**
   * D1-048b: Dismiss unmatched attendance
   */
  @RequirePermission(Permission.ATTENDANCE_CORRECT)
  @Patch(':id/unmatched-attendance/:unmatchedId/dismiss')
  dismissUnmatchedAttendance(
    @Param('unmatchedId') unmatchedId: string,
    @Request() req: any
  ) {
    const actorId = req.user.sub ?? req.user.userId ?? req.user.id;
    return this.reconciliationService.dismissUnmatched(unmatchedId, { id: actorId, role: req.user.role }, 'Dismissed by user');
  }


  /**
   * D1-044: Learner self-booking for a session slot.
   * Learner identity is derived exclusively from the authenticated JWT — the
   * client cannot supply or forge a userId.
   *
   * Validates:
   * - Session existence and bookable status
   * - Enrolment eligibility (ACTIVE only)
   * - Batch membership (no IDOR)
   * - 12-hour advance notice (configurable via BOOKING_ADVANCE_NOTICE_HOURS)
   * - Capacity quota under advisory lock
   * - Outlook calendar clash via ICalendarProvider.getBusySlots()
   */
  @RequirePermission(Permission.SESSIONS_BOOK)
  @Post(':id/book')
  bookSession(@Param('id') sessionId: string, @Request() req: any) {
    // Learner identity is always server-derived from the JWT; never from body/query.
    return this.sessionsService.bookSession(sessionId, req.user.sub);
  }

  /**
   * D1-044: Returns all active bookings for the authenticated learner.
   */
  @RequirePermission(Permission.SESSIONS_READ)
  @Get('my/bookings')
  getMyBookings(@Request() req: any) {
    return this.sessionsService.getMyBookings(req.user.sub);
  }
  /**
   * D1-046: Cancel a booking
   */
  @RequirePermission(Permission.SESSIONS_BOOK)
  @Post('bookings/:bookingId/cancel')
  cancelBooking(
    @Param('bookingId') bookingId: string,
    @Body('reason') reason: string,
    @Request() req: any,
  ) {
    return this.sessionsService.cancelBooking(bookingId, req.user.sub, reason);
  }

  /**
   * D1-046: Reschedule a booking
   */
  @RequirePermission(Permission.SESSIONS_BOOK)
  @Post('bookings/:bookingId/reschedule')
  rescheduleBooking(
    @Param('bookingId') bookingId: string,
    @Body('newSessionId') newSessionId: string,
    @Request() req: any,
  ) {
    return this.sessionsService.rescheduleBooking(bookingId, newSessionId, req.user.sub);
  }
}
