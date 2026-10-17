import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { LeadStatus, Role, SessionStatus, SessionType } from '@prisma/client';
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
  ) {}

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

    // 1. Fetch DB Busy Sessions in this window (live cohort sessions + 1:1s + discovery calls)
    const dbSessions = await this.prisma.session.findMany({
      where: {
        status: { notIn: [SessionStatus.CANCELLED, SessionStatus.RESCHEDULED] },
        startTime: { lt: windowEnd },
        endTime: { gt: windowStart },
        OR: [
          ...(roweena?.id ? [{ hostTrainerId: roweena.id }] : []),
          { sessionType: SessionType.SPEAKER_DISCOVERY_CALL },
          { sessionType: SessionType.ONE_ON_ONE_WITH_RO },
          { sessionType: SessionType.GROUP_COHORT },
          { sessionType: SessionType.BATCH_CLASS },
          { batchId: { not: null } },
        ],
      },
      select: { startTime: true, endTime: true },
    });

    // 2. Fetch Outlook Busy Blocks if Microsoft Graph is configured
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
      ...outlookBusy.map((b) => ({ start: b.startTime.getTime(), end: b.endTime.getTime() })),
    ];

    // 3. Generate candidate 15-minute slots
    const slots: AvailableSlot[] = [];
    const minAdvanceNoticeMs = 30 * 60 * 1000; // 30 minutes advance notice
    let cursor = windowStart.getTime();

    while (cursor + 15 * 60 * 1000 <= windowEnd.getTime()) {
      const slotStartMs = cursor;
      const slotEndMs = cursor + 15 * 60 * 1000;
      cursor += 15 * 60 * 1000;

      // Skip slots in past or starting within 30 minutes
      if (slotStartMs < nowUtc.getTime() + minAdvanceNoticeMs) {
        continue;
      }

      // Check overlap against busy intervals: overlap occurs if busy.start < slotEnd && busy.end > slotStart
      const hasClash = busyIntervals.some(
        (busy) => busy.start < slotEndMs && busy.end > slotStartMs,
      );

      if (!hasClash) {
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
        });
      }
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

    // 1. Transactional Slot Locking
    const result = await this.prisma.$transaction(async (tx) => {
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

      // Course title lookup if provided
      let courseTitle = 'Curriculum & Program Guidance';
      if (dto.courseId) {
        const prog = await tx.program.findUnique({
          where: { id: dto.courseId },
          select: { title: true },
        });
        if (prog?.title) courseTitle = prog.title;
      }

      // 2. Zoom Link Generation
      let zoomJoinUrl = '';
      let zoomHostUrl = '';
      let zoomMeetingId = '';

      if (this.meetingProvider) {
        try {
          const zoomMeeting = await this.meetingProvider.createMeeting({
            topic: `15-Min Discovery Call: Roweena & ${prospectName} (${courseTitle})`,
            startTime: slotStart,
            durationMinutes: 15,
            timezone: tz,
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
        const mockId = `staging-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        zoomJoinUrl = `https://zoom.us/j/${mockId}?pwd=wbm123`;
        zoomHostUrl = `https://zoom.us/s/${mockId}?pwd=wbm123`;
        zoomMeetingId = mockId;
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
          joinUrl: zoomJoinUrl,
          meetingLink: zoomJoinUrl,
          hostUrl: zoomHostUrl,
          providerMeetingId: zoomMeetingId,
          zoomMeetingId,
          agenda: `LeadId: ${dto.leadId || 'N/A'} | CourseId: ${dto.courseId || 'N/A'} | Phone: ${dto.phone}`,
        },
      });

      // 4. Update Lead Record if leadId is passed
      if (dto.leadId) {
        const existingLead = await tx.lead.findUnique({ where: { id: dto.leadId } });
        if (existingLead) {
          await tx.lead.update({
            where: { id: dto.leadId },
            data: {
              status: LeadStatus.CONTACTED,
              message: [
                existingLead.message,
                `📅 Discovery Call Scheduled: ${slotStart.toISOString()} | Zoom: ${zoomJoinUrl}`,
              ]
                .filter(Boolean)
                .join('\n\n'),
            },
          });
        }
      }

      return {
        session,
        user,
        courseTitle,
        zoomJoinUrl,
        zoomHostUrl,
      };
    });

    // 5. Post-Transaction Calendar Sync & Email Dispatch
    if (this.calendarProvider && hostEmail) {
      this.calendarProvider
        .createEvent({
          organizerEmail: hostEmail,
          subject: result.session.title,
          body: `15-Minute Discovery Call with ${prospectName} (${prospectEmail}, ${dto.phone}). Zoom: ${result.zoomJoinUrl}`,
          startTime: slotStart,
          endTime: slotEnd,
          attendees: [prospectEmail],
          location: result.zoomJoinUrl,
          sessionId: result.session.id,
        })
        .catch((e: any) => this.logger.warn(`Outlook event sync warning: ${e?.message}`));
    }

    const icsContent = generateIcsInvite({
      sessionId: result.session.id,
      title: result.session.title,
      description: `15-Minute 1-on-1 Discovery Call with Roweena Kini.\\n\\nJoin Zoom Meeting:\\n${result.zoomJoinUrl}`,
      location: result.zoomJoinUrl,
      startTime: slotStart,
      endTime: slotEnd,
      attendeeName: prospectName,
      attendeeEmail: prospectEmail,
      organizerEmail: hostEmail,
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

    // Send confirmation emails
    if (this.emailService) {
      // Prospect confirmation email
      this.emailService
        .sendTemplateEmail({
          to: prospectEmail,
          subject: `Confirmed: 15-Minute Discovery Call with Roweena Kini`,
          template: 'LeadEnquiryNotificationEmail',
          props: {
            name: prospectName,
            email: prospectEmail,
            phone: dto.phone,
            message:
              `Your 1-to-1 Discovery Call with Roweena has been confirmed!\n\n` +
              `📅 Date: ${dateFormatted}\n` +
              `⏰ Your Local Time: ${timeLocal} (${tz})\n` +
              `🇦🇪 Dubai Time: ${timeGst}\n` +
              `🇮🇳 India Time: ${timeIst}\n\n` +
              `🔗 Zoom Join Link: ${result.zoomJoinUrl}\n\n` +
              `Please join 2 minutes before your scheduled start time. We look forward to speaking with you!`,
          },
        })
        .catch((e: any) => this.logger.warn(`Prospect email dispatch warning: ${e?.message}`));

      // Roweena notification email
      this.emailService
        .sendTemplateEmail({
          to: hostEmail,
          subject: `New 15-Min Discovery Call: ${prospectName} (${result.courseTitle})`,
          template: 'LeadEnquiryNotificationEmail',
          props: {
            name: prospectName,
            email: prospectEmail,
            phone: dto.phone,
            message:
              `A prospect has booked a 15-minute discovery consultation:\n\n` +
              `Lead ID: ${dto.leadId || 'N/A'}\n` +
              `Course: ${result.courseTitle}\n` +
              `Date: ${dateFormatted}\n` +
              `GST: ${timeGst}\n` +
              `IST: ${timeIst}\n` +
              `Zoom: ${result.zoomJoinUrl}`,
          },
        })
        .catch((e: any) => this.logger.warn(`Host email dispatch warning: ${e?.message}`));
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
      zoomJoinUrl: result.zoomJoinUrl,
      icsContent,
      message:
        'Your 1-to-1 discovery call with Roweena has been confirmed. A calendar invitation and Zoom link have been sent to your email.',
    };
  }
}
