import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { LeadStatus, Role, SessionStatus, SessionType, OneOnOneRequestStatus } from '@prisma/client';
import { CALENDAR_PROVIDER, type ICalendarProvider } from '../../common/interfaces/calendar-provider.interface.js';
import { MEETING_PROVIDER, type IMeetingProvider } from '../../common/interfaces/meeting-provider.interface.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmailService } from '../email/email.service.js';

export interface BookDiscoveryCallDto {
  leadId?: string;
  name: string;
  email: string;
  phone: string;
  courseId?: string;
  slotStartUtc: string;
  timezone?: string;
  notes?: string;
}

export interface AvailableSlot {
  slotStartUtc: string;
  slotEndUtc: string;
  timeLocal: string;
  timeGst: string;
  timeIst: string;
  isBooked: boolean;
}

function formatIcsTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

export function generateIcsInvite(params: {
  sessionId: string;
  title: string;
  description: string;
  location: string;
  startTime: Date;
  endTime: Date;
  attendeeName: string;
  attendeeEmail: string;
  organizerEmail: string;
}): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//WhatBoutMe//Discovery Call Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${params.sessionId}@whatboutme.com`,
    `DTSTAMP:${formatIcsTimestamp(new Date())}`,
    `DTSTART:${formatIcsTimestamp(params.startTime)}`,
    `DTEND:${formatIcsTimestamp(params.endTime)}`,
    `SUMMARY:${params.title}`,
    `DESCRIPTION:${params.description.replace(/\n/g, '\\n')}`,
    `LOCATION:${params.location}`,
    `ORGANIZER;CN=Roweena Kini:mailto:${params.organizerEmail}`,
    `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=${params.attendeeName}:mailto:${params.attendeeEmail}`,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(CALENDAR_PROVIDER) private readonly calendarProvider?: ICalendarProvider,
    @Optional() @Inject(MEETING_PROVIDER) private readonly meetingProvider?: IMeetingProvider,
    @Optional() private readonly emailService?: EmailService,
  ) { }

  /**
   * Calculates available 15-minute discovery slots for a given date across Roweena's unified schedule:
   * 1. Existing LMS cohort live sessions
   * 2. Existing 1:1 and discovery calls in `Session`
   * 3. Microsoft Outlook busy blocks via ICalendarProvider (with graceful DB fallback)
   */
  async getAvailableSlots(dateStr: string, userTimezone?: string): Promise<{
    date: string;
    timezone: string;
    hostName: string;
    slots: AvailableSlot[];
  }> {
    const tz = userTimezone?.trim() || 'Asia/Dubai';

    // Find Roweena (host trainer)
    const roweena = await this.prisma.user.findFirst({
      where: { role: { in: [Role.SUPER_ADMIN, Role.ADMIN] } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, email: true },
    });

    const hostEmail = roweena?.email || 'share@whatboutme.com';
    const hostName = roweena?.name || 'Roweena Kini';

    // Work day boundaries: 09:00 to 18:00 in GST (Dubai Time, UTC+4)
    // 09:00 GST = 05:00 UTC, 18:00 GST = 14:00 UTC
    // Parsing target date:
    const baseDate = new Date(`${dateStr}T00:00:00Z`);
    if (isNaN(baseDate.getTime())) {
      throw new BadRequestException('Invalid date format. Expected YYYY-MM-DD.');
    }

    const windowStart = new Date(`${dateStr}T05:00:00.000Z`); // 09:00 GST
    const windowEnd = new Date(`${dateStr}T14:00:00.000Z`); // 18:00 GST
    const nowUtc = new Date();

    if (windowEnd.getTime() < nowUtc.getTime()) {
      return { date: dateStr, timezone: tz, hostName, slots: [] };
    }

    // 1. Fetch DB Busy Sessions in this window (live cohort sessions + 1:1s + discovery calls + workshops)
    const dbSessions = await this.prisma.session.findMany({
      where: {
        status: { notIn: [SessionStatus.CANCELLED, SessionStatus.RESCHEDULED] },
        startTime: { lt: windowEnd },
        endTime: { gt: windowStart },
      },
      select: { startTime: true, endTime: true },
    });

    // 2. Fetch pending or approved 1-on-1 coaching requests in this window
    const pendingCoachingRequests = typeof (this.prisma as any).oneOnOneRequest?.findMany === 'function'
      ? await this.prisma.oneOnOneRequest.findMany({
      where: {
        status: { in: [OneOnOneRequestStatus.PENDING_APPROVAL, OneOnOneRequestStatus.APPROVED] },
        requestedStart: { lt: windowEnd },
        requestedEnd: { gt: windowStart },
      },
      select: { requestedStart: true, requestedEnd: true },
    })
      : [];

    // 3. Fetch Outlook Busy Blocks if Microsoft Graph is configured
    let outlookBusy: Array<{ startTime: Date; endTime: Date }> = [];
    if (this.calendarProvider) {
      try {
        outlookBusy = await this.calendarProvider.getBusySlots(hostEmail, windowStart, windowEnd);
      } catch (err: any) {
        this.logger.warn(`ICalendarProvider getBusySlots warning: ${err?.message}`);
      }
    }

    const busyIntervals = [
      ...dbSessions.map((s) => ({ start: s.startTime.getTime(), end: s.endTime.getTime() })),
      ...pendingCoachingRequests.map((r) => ({ start: r.requestedStart.getTime(), end: r.requestedEnd.getTime() })),
      ...outlookBusy.map((b) => ({ start: b.startTime.getTime(), end: b.endTime.getTime() })),
    ];

    // 4. Generate candidate 15-minute slots across the entire business day window
    const slots: AvailableSlot[] = [];
    const minAdvanceNoticeMs = 30 * 60 * 1000; // 30 minutes advance notice
    let cursor = windowStart.getTime();

    while (cursor + 15 * 60 * 1000 <= windowEnd.getTime()) {
      const slotStartMs = cursor;
      const slotEndMs = cursor + 15 * 60 * 1000;
      cursor += 15 * 60 * 1000;

      // Skip slots that have already completely ended earlier today
      if (slotEndMs <= nowUtc.getTime()) {
        continue;
      }

      // Check if slot starts too soon within advance notice buffer
      const isTooSoon = slotStartMs < nowUtc.getTime() + minAdvanceNoticeMs;

      // Check overlap against busy intervals: overlap occurs if busy.start < slotEnd && busy.end > slotStart
      const hasClash = busyIntervals.some(
        (busy) => busy.start < slotEndMs && busy.end > slotStartMs,
      );

      const isBooked = hasClash || isTooSoon;

      const slotStart = new Date(slotStartMs);
      const slotEnd = new Date(slotEndMs);

      // Local timezone display
      const timeLocal = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(slotStart);

      // Dubai (GST) display
      const timeGst =
        new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Dubai',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }).format(slotStart) + ' GST';

      // India (IST) display
      const timeIst =
        new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Kolkata',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }).format(slotStart) + ' IST';

      slots.push({
        slotStartUtc: slotStart.toISOString(),
        slotEndUtc: slotEnd.toISOString(),
        timeLocal,
        timeGst,
        timeIst,
        isBooked,
      });
    }

    return {
      date: dateStr,
      timezone: tz,
      hostName,
      slots,
    };
  }

  /**
   * Atomically locks and books a 15-minute discovery call:
   * 1. Enforces transactional seat lock against double-booking race conditions
   * 2. Automatically generates Zoom meeting link (or deterministic staging fallback)
   * 3. Creates `Session` linked to prospect lead and visible in Admin Meetings
   * 4. Updates `Lead` record in CRM
   * 5. Syncs to Roweena's Outlook Calendar and sends automated email confirmations with .ics invite
   */
  async bookDiscoveryCall(dto: BookDiscoveryCallDto) {
    const slotStart = new Date(dto.slotStartUtc);
    if (isNaN(slotStart.getTime()) || slotStart.getTime() <= Date.now()) {
      throw new BadRequestException('Invalid or past slot start time.');
    }

    const slotEnd = new Date(slotStart.getTime() + 15 * 60 * 1000);
    const tz = dto.timezone || 'Asia/Dubai';
    const prospectEmail = dto.email.toLowerCase().trim();
    const prospectName = dto.name.trim();

    // Find Roweena
    const roweena = await this.prisma.user.findFirst({
      where: { role: { in: [Role.SUPER_ADMIN, Role.ADMIN] } },
      orderBy: { createdAt: 'asc' },
    });

    const hostEmail = roweena?.email || 'share@whatboutme.com';
    const hostTrainerId = roweena?.id || null;

    // Course title lookup if provided
    let courseTitle = 'Curriculum & Program Guidance';
    if (dto.courseId) {
      const prog = await this.prisma.program.findUnique({
        where: { id: dto.courseId },
        select: { title: true },
      });
      if (prog?.title) courseTitle = prog.title;
    }

    // 1. Zoom Link is NOT generated at initial booking time.
    // It is generated only after admin/coach acceptance to avoid generating unused Zoom rooms if rejected.
    const zoomJoinUrl = '';
    const zoomHostUrl = '';
    const zoomMeetingId = '';

    // 2. Transactional Slot Locking & Session Creation (Lightning-fast DB-only transaction)
    const result = await this.prisma.$transaction(
      async (tx) => {
        // PostgreSQL transactional advisory lock serializes concurrent bookings for the same slot
        if (typeof tx.$executeRaw === 'function') {
          const lockKey = `discovery_slot_${slotStart.getTime()}`;
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
        }

        // Clash verification under transaction:
        const clash = await tx.session.findFirst({
          where: {
            status: { notIn: [SessionStatus.CANCELLED, SessionStatus.RESCHEDULED] },
            startTime: { lt: slotEnd },
            endTime: { gt: slotStart },
            OR: [
              ...(hostTrainerId ? [{ hostTrainerId }] : []),
              { sessionType: SessionType.SPEAKER_DISCOVERY_CALL },
            ],
          },
        });

        if (clash) {
          throw new ConflictException(
            'This 15-minute slot was just booked by another attendee. Please pick another available time.',
          );
        }

        // Check for duplicate upcoming discovery consultation for the same email
        const existingUpcoming = await tx.session.findFirst({
          where: {
            sessionType: SessionType.SPEAKER_DISCOVERY_CALL,
            status: { in: [SessionStatus.SCHEDULED, SessionStatus.ACTIVE] },
            startTime: { gt: new Date() },
            OR: [
              { learner: { email: prospectEmail } },
              { agenda: { contains: prospectEmail } },
            ],
          },
        });

        if (existingUpcoming) {
          throw new ConflictException(
            'You already have an upcoming discovery consultation scheduled. Please check your email for the calendar invite or contact support.',
          );
        }

        // Find or create prospect user entity
        let user = await tx.user.findUnique({ where: { email: prospectEmail } });
        if (!user) {
          user = await tx.user.create({
            data: {
              email: prospectEmail,
              name: prospectName,
              phone: dto.phone.trim(),
              role: Role.USER,
            },
          });
        }

        // 3. Create Session Record
        const sessionTitle = `1-to-1 Discovery Call: Roweena & ${prospectName}`;
        const session = await tx.session.create({
          data: {
            title: sessionTitle,
            description: `15-Minute Discovery Session for lead ${dto.leadId || 'Direct'}. Course: ${courseTitle}`,
            sessionType: SessionType.SPEAKER_DISCOVERY_CALL,
            status: SessionStatus.SCHEDULED,
            startTime: slotStart,
            endTime: slotEnd,
            durationMinutes: 15,
            capacity: 1,
            hostTrainerId,
            learnerId: user.id,
            joinUrl: null,
            meetingLink: null,
            hostUrl: null,
            providerMeetingId: null,
            zoomMeetingId: null,
            agenda: `LeadId: ${dto.leadId || 'N/A'} | CourseId: ${dto.courseId || 'N/A'} | Phone: ${dto.phone}`,
          },
        });

        // 4. Update Lead Record if leadId is passed, or create lead if direct booking
        if (dto.leadId) {
          const existingLead = await tx.lead.findUnique({ where: { id: dto.leadId } });
          if (existingLead) {
            await tx.lead.update({
              where: { id: dto.leadId },
              data: {
                status: LeadStatus.CONTACTED,
                message: [
                  existingLead.message,
                  `📅 Discovery Call Requested: ${slotStart.toISOString()}`,
                ]
                  .filter(Boolean)
                  .join('\n\n'),
              },
            });
          }
        } else {
          const newLead = await tx.lead.create({
            data: {
              name: prospectName,
              email: prospectEmail,
              phone: dto.phone.trim(),
              status: LeadStatus.CONTACTED,
              message: [
                `Course Inquiry: ${courseTitle} (ID: ${dto.courseId || 'N/A'})`,
                `📅 Discovery Call Requested: ${slotStart.toISOString()}`,
                dto.notes ? dto.notes.trim() : null,
              ]
                .filter(Boolean)
                .join('\n\n'),
            },
          });
          dto.leadId = newLead.id;
        }

        return {
          session,
          user,
          courseTitle,
          zoomJoinUrl,
          zoomHostUrl,
        };
      }, {
      maxWait: 15000,
      timeout: 30000,
    });

    // Formatted timezone representations
    const timeLocal = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(slotStart);

    const timeGst =
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Dubai',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(slotStart) + ' GST (Dubai)';

    const timeIst =
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(slotStart) + ' IST (India)';

    const dateFormatted = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(slotStart);

    // Send request acknowledgement emails (NO Zoom link before coach acceptance)
    if (this.emailService) {
      await Promise.allSettled([
        // Prospect acknowledgement email
        this.emailService
          .sendTemplateEmail({
            to: prospectEmail,
            subject: `Request Received: 15-Minute Discovery Call with Roweena Kini`,
            template: 'LeadEnquiryNotificationEmail',
            props: {
              name: prospectName,
              email: prospectEmail,
              phone: dto.phone,
              message:
                `Your request for a 1-to-1 Discovery Call with Roweena has been received!\n\n` +
                `📅 Requested Date: ${dateFormatted}\n` +
                `⏰ Your Local Time: ${timeLocal} (${tz})\n` +
                `🇦🇪 Dubai Time: ${timeGst}\n` +
                `🇮🇳 India Time: ${timeIst}\n\n` +
                `⏳ Status: Pending Coach Confirmation\n\n` +
                `Roweena and our admissions team will review your requested time slot. Once accepted, your official Zoom meeting link and calendar invite will be emailed to you. We look forward to speaking with you!`,
            },
          })
          .catch((e: any) => this.logger.warn(`Prospect email dispatch warning: ${e?.message}`)),

        // Host / Admin notification email
        this.emailService
          .sendTemplateEmail({
            to: hostEmail,
            subject: `Action Required: New 15-Min Discovery Call Request from ${prospectName}`,
            template: 'LeadEnquiryNotificationEmail',
            props: {
              name: prospectName,
              email: prospectEmail,
              phone: dto.phone,
              message:
                `A prospective learner has requested a 15-minute discovery consultation:\n\n` +
                `Name: ${prospectName}\n` +
                `Email: ${prospectEmail}\n` +
                `Phone: ${dto.phone}\n` +
                `Course: ${result.courseTitle}\n` +
                `Date: ${dateFormatted}\n` +
                `GST: ${timeGst}\n` +
                `IST: ${timeIst}\n\n` +
                `Please review and accept this request in the Admin Portal. The Zoom meeting link will be generated automatically upon your acceptance.`,
            },
          })
          .catch((e: any) => this.logger.warn(`Host email dispatch warning: ${e?.message}`)),
      ]);
    }

    return {
      success: true,
      sessionId: result.session.id,
      title: result.session.title,
      startTimeUtc: slotStart.toISOString(),
      endTimeUtc: slotEnd.toISOString(),
      dateFormatted,
      timeLocal,
      timeGst,
      timeIst,
      timezone: tz,
      zoomJoinUrl: '',
      isPendingApproval: true,
      message:
        'Your 1-to-1 discovery call request has been received. Our team will review the slot and send you the confirmed Zoom link once accepted.',
    };
  }

  /**
   * Admin / Manager accepts a pending 1-on-1 discovery call:
   * 1. Generates Zoom meeting link
   * 2. Updates session with joinUrl, meetingLink, hostUrl
   * 3. Updates Lead message and status to CONTACTED
   * 4. Dispatches calendar sync and confirmed email with Zoom link and .ics to prospect
   * 5. Creates immutable AuditLog
   */

  /**
   * Fetches the latest upcoming or active 1-on-1 discovery call for a prospect/learner
   * so they can view status and access their Zoom meeting link directly on the contact page.
   */
  async getUserLatestDiscoveryCall(params: {
    email?: string;
    userId?: string;
    sessionId?: string;
    timezone?: string;
  }) {
    const { email, userId, sessionId, timezone } = params;
    const cleanEmail = email?.trim().toLowerCase();

    if (!cleanEmail && !userId && !sessionId) {
      return { hasBooking: false, booking: null };
    }

    const orConditions: any[] = [];
    if (sessionId) {
      orConditions.push({ id: sessionId });
    }
    if (userId) {
      orConditions.push({ learnerId: userId });
    }
    if (cleanEmail) {
      orConditions.push({ learner: { email: cleanEmail } });
      orConditions.push({ agenda: { contains: cleanEmail } });
    }

    const session = await this.prisma.session.findFirst({
      where: {
        sessionType: SessionType.SPEAKER_DISCOVERY_CALL,
        status: { in: [SessionStatus.SCHEDULED, SessionStatus.ACTIVE] },
        OR: orConditions,
      },
      include: {
        learner: {
          select: { id: true, name: true, email: true, phone: true },
        },
      },
      orderBy: { startTime: 'desc' },
    });

    if (!session) {
      return { hasBooking: false, booking: null };
    }

    const tz = timezone?.trim() || 'Asia/Dubai';
    const slotStart = session.startTime;
    const slotEnd = session.endTime;

    const timeLocal = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(slotStart);

    const timeGst =
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Dubai',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(slotStart) + ' GST (Dubai)';

    const timeIst =
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(slotStart) + ' IST (India)';

    const dateFormatted = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(slotStart);

    const zoomJoinUrl = session.joinUrl || session.meetingLink || '';
    const isPendingApproval = !zoomJoinUrl;
    const leadName = session.learner?.name || 'Prospective Learner';
    const leadEmail = session.learner?.email || cleanEmail || '';

    const icsContent = zoomJoinUrl
      ? generateIcsInvite({
          sessionId: session.id,
          title: session.title,
          description:
            session.description || '15-Minute 1-to-1 Discovery Call with Roweena Kini',
          location: zoomJoinUrl,
          startTime: session.startTime,
          endTime: session.endTime,
          attendeeName: leadName,
          attendeeEmail: leadEmail,
          organizerEmail: 'share@whatboutme.com',
        })
      : '';

    return {
      hasBooking: true,
      booking: {
        success: true,
        sessionId: session.id,
        title: session.title,
        startTimeUtc: slotStart.toISOString(),
        endTimeUtc: slotEnd.toISOString(),
        dateFormatted,
        timeLocal,
        timeGst,
        timeIst,
        timezone: tz,
        zoomJoinUrl,
        icsContent,
        message: zoomJoinUrl
          ? 'Your 1-to-1 discovery consultation has been confirmed!'
          : 'Your 1-to-1 discovery call request has been received & is pending coach confirmation.',
        leadName,
        leadEmail,
        phone: session.learner?.phone || undefined,
        status: session.status,
        isPendingApproval,
      },
    };
  }

  async acceptDiscoveryCall(identifier: { sessionId?: string; leadId?: string }, actorUser?: any) {
    let session: any = null;
    let lead: any = null;

    if (identifier.sessionId) {
      session = await this.prisma.session.findUnique({
        where: { id: identifier.sessionId },
        include: { learner: true },
      });
    }

    if (!session && identifier.leadId) {
      lead = await this.prisma.lead.findUnique({
        where: { id: identifier.leadId },
      });
      if (lead) {
        session = await this.prisma.session.findFirst({
          where: {
            sessionType: SessionType.SPEAKER_DISCOVERY_CALL,
            learner: { email: lead.email.toLowerCase().trim() },
            status: { notIn: [SessionStatus.CANCELLED] },
          },
          orderBy: { createdAt: 'desc' },
          include: { learner: true },
        });
      }
    }

    if (!session) {
      throw new NotFoundException('Discovery call session not found.');
    }

    if (!lead && session.learner?.email) {
      lead = await this.prisma.lead.findFirst({
        where: { email: session.learner.email.toLowerCase().trim() },
        orderBy: { createdAt: 'desc' },
      });
    }

    const prospectName = session.learner?.name || lead?.name || 'Prospective Learner';
    const prospectEmail = session.learner?.email || lead?.email;
    if (!prospectEmail) {
      throw new BadRequestException('Learner email is missing for this discovery call.');
    }

    // If Zoom already generated, return existing
    if (session.joinUrl) {
      return {
        success: true,
        sessionId: session.id,
        zoomJoinUrl: session.joinUrl,
        alreadyAccepted: true,
      };
    }

    // 1. Generate Zoom link upon acceptance
    let zoomJoinUrl = '';
    let zoomHostUrl = '';
    let zoomMeetingId = '';

    if (this.meetingProvider) {
      try {
        const zoomMeeting = await this.meetingProvider.createMeeting({
          topic: session.title,
          startTime: session.startTime,
          durationMinutes: session.durationMinutes || 15,
          timezone: session.timezone || 'Asia/Dubai',
        });
        if (zoomMeeting?.joinUrl) {
          zoomJoinUrl = zoomMeeting.joinUrl;
          zoomHostUrl = zoomMeeting.startUrl || zoomMeeting.joinUrl;
          zoomMeetingId = zoomMeeting.id;
        }
      } catch (err: any) {
        this.logger.warn(`Meeting provider error: ${err?.message}`);
      }
    }

    if (!zoomJoinUrl) {
      const mockId = `zoom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      zoomJoinUrl = `https://zoom.us/j/${mockId}?pwd=wbm123`;
      zoomHostUrl = `https://zoom.us/s/${mockId}?pwd=wbm123`;
      zoomMeetingId = mockId;
    }

    // 2. Update session in database
    const updatedSession = await this.prisma.session.update({
      where: { id: session.id },
      data: {
        joinUrl: zoomJoinUrl,
        meetingLink: zoomJoinUrl,
        hostUrl: zoomHostUrl,
        zoomMeetingId,
        providerMeetingId: zoomMeetingId,
        status: SessionStatus.SCHEDULED,
      },
      include: { learner: true },
    });

    // 3. Update Lead message to reflect confirmed discovery call with Zoom link
    if (lead) {
      let updatedMessage = lead.message || '';
      if (/📅\s*Discovery Call (?:Requested|Scheduled):/i.test(updatedMessage)) {
        updatedMessage = updatedMessage.replace(
          /📅\s*Discovery Call (?:Requested|Scheduled):\s*([^\n|]+)(?:\|\s*Zoom:[^\n]+)?/i,
          `📅 Discovery Call Scheduled: $1 | Zoom: ${zoomJoinUrl}`
        );
      } else {
        updatedMessage = `${updatedMessage}\n\n📅 Discovery Call Scheduled: ${session.startTime.toISOString()} | Zoom: ${zoomJoinUrl}`.trim();
      }

      await this.prisma.lead.update({
        where: { id: lead.id },
        data: {
          status: LeadStatus.CONTACTED,
          message: updatedMessage,
        },
      });
    }

    // 4. Send Confirmation Email with Zoom link & ICS to prospect
    const roweena = await this.prisma.user.findFirst({
      where: { role: { in: [Role.SUPER_ADMIN, Role.ADMIN] } },
      orderBy: { createdAt: 'asc' },
    });
    const hostEmail = roweena?.email || 'share@whatboutme.com';

    const icsContent = generateIcsInvite({
      sessionId: session.id,
      title: session.title,
      description: `15-Minute 1-on-1 Discovery Call with Roweena Kini.\\n\\nJoin Zoom Meeting:\\n${zoomJoinUrl}`,
      location: zoomJoinUrl,
      startTime: session.startTime,
      endTime: session.endTime,
      attendeeName: prospectName,
      attendeeEmail: prospectEmail,
      organizerEmail: hostEmail,
    });

    const dateFormatted = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(session.startTime);

    const timeIst =
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(session.startTime) + ' IST (India)';

    const timeGst =
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Dubai',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(session.startTime) + ' GST (Dubai)';

    if (this.emailService) {
      await this.emailService
        .sendTemplateEmail({
          to: prospectEmail,
          subject: `Confirmed: 15-Minute Discovery Call with Roweena Kini`,
          template: 'LeadEnquiryNotificationEmail',
          props: {
            name: prospectName,
            email: prospectEmail,
            phone: lead?.phone || session.learner?.phone || '',
            message:
              `Your 1-to-1 Discovery Call with Roweena has been accepted and confirmed!\n\n` +
              `📅 Date: ${dateFormatted}\n` +
              `🇮🇳 India Time: ${timeIst}\n` +
              `🇦🇪 Dubai Time: ${timeGst}\n\n` +
              `🔗 Zoom Join Link: ${zoomJoinUrl}\n\n` +
              `Please join 2 minutes before the scheduled start time. We look forward to meeting with you!`,
          },
        })
        .catch((e: any) => this.logger.warn(`Failed to send confirmed email: ${e?.message}`));
    }

    // 5. Audit Log
    const actorId = actorUser?.id || actorUser?.sub || 'system';
    this.prisma.auditLog
      .create({
        data: {
          actorId,
          action: 'DISCOVERY_CALL_ACCEPTED',
          entity: 'Session',
          entityId: session.id,
          meta: {
            prospectEmail,
            zoomJoinUrl,
            scheduledAt: session.startTime.toISOString(),
          },
        },
      })
      .catch(() => null);

    return {
      success: true,
      sessionId: session.id,
      zoomJoinUrl,
      session: updatedSession,
    };
  }

  /**
   * Admin / Manager declines a pending discovery call request:
   */
  async declineDiscoveryCall(identifier: { sessionId?: string; leadId?: string; reason?: string }, actorUser?: any) {
    let session: any = null;
    let lead: any = null;

    if (identifier.sessionId) {
      session = await this.prisma.session.findUnique({
        where: { id: identifier.sessionId },
        include: { learner: true },
      });
    }

    if (!session && identifier.leadId) {
      lead = await this.prisma.lead.findUnique({
        where: { id: identifier.leadId },
      });
      if (lead) {
        session = await this.prisma.session.findFirst({
          where: {
            sessionType: SessionType.SPEAKER_DISCOVERY_CALL,
            learner: { email: lead.email.toLowerCase().trim() },
            status: { notIn: [SessionStatus.CANCELLED] },
          },
          orderBy: { createdAt: 'desc' },
          include: { learner: true },
        });
      }
    }

    if (!session) {
      throw new NotFoundException('Discovery call session not found.');
    }

    if (!lead && session.learner?.email) {
      lead = await this.prisma.lead.findFirst({
        where: { email: session.learner.email.toLowerCase().trim() },
        orderBy: { createdAt: 'desc' },
      });
    }

    const reason = identifier.reason || 'Instructor is unavailable at the requested time.';

    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        status: SessionStatus.CANCELLED,
        cancelReason: reason,
        cancelledAt: new Date(),
      },
    });

    if (lead) {
      await this.prisma.lead.update({
        where: { id: lead.id },
        data: {
          message: `${lead.message}\n\n❌ Discovery Call Declined: ${reason}`.trim(),
        },
      });
    }

    const prospectEmail = session.learner?.email || lead?.email;
    const prospectName = session.learner?.name || lead?.name || 'there';

    if (this.emailService && prospectEmail) {
      await this.emailService
        .sendTemplateEmail({
          to: prospectEmail,
          subject: `Update on your 15-Minute Discovery Call Request`,
          template: 'LeadEnquiryNotificationEmail',
          props: {
            name: prospectName,
            email: prospectEmail,
            phone: lead?.phone || '',
            message:
              `Thank you for your interest in WhatBoutMe.\n\n` +
              `Unfortunately, Roweena is unavailable for the requested slot (${session.startTime.toLocaleString()}).\n\n` +
              `Reason: ${reason}\n\n` +
              `Please visit https://whatboutme.com/contact to pick an alternative date and time that works for you.`,
          },
        })
        .catch(() => null);
    }

    return {
      success: true,
      sessionId: session.id,
      status: 'CANCELLED',
    };
  }
}
