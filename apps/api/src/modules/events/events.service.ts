import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CurrencyCode,
  Event,
  EventLocationType,
  EventPaymentStatus,
  EventRegistration,
  Prisma,
} from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';
import { AuditLogService } from '../../common/audit/audit-log.service.js';
import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  AdminListEventsQueryDto,
  ListEventsQueryDto,
} from './dto/list-events-query.dto.js';
import {
  CheckoutEventDto,
  CreateEventDto,
  UpdateEventDto,
  VerifyEventPaymentDto,
} from './dto/event.dto.js';
import { mapEvent, mapRegistration } from './event.mapper.js';

type RequestMeta = {
  ipAddress?: string;
  userAgent?: string;
};

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditLogService,
    private readonly emailService: EmailService,
  ) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  async uploadCoverImage(file: { buffer?: Buffer; [key: string]: any }) {
    if (!file || !file.buffer) {
      throw new BadRequestException('Image file is required');
    }

    return new Promise<{ coverImageUrl: string; bannerUrl: string; publicId: string }>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'whatboutme_events',
          resource_type: 'image',
        },
        (error, result) => {
          if (error || !result) {
            return reject(new BadRequestException(error?.message || 'Cloudinary upload failed'));
          }
          resolve({
            coverImageUrl: result.secure_url,
            bannerUrl: result.secure_url,
            publicId: result.public_id,
          });
        },
      );
      uploadStream.end(file.buffer);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC QUERIES & REGISTRATIONS
  // ─────────────────────────────────────────────────────────────────────────────

  async listForPublic(query: ListEventsQueryDto, userId?: string) {
    const where: Prisma.EventWhereInput = {
      isPublished: true,
      ...(query.locationType ? { locationType: query.locationType } : {}),
      ...(query.upcoming
        ? { startDateTime: { gte: new Date() } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
              { venueName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const take = query.limit || 20;
    const skip = ((query.page || 1) - 1) * take;

    const [events, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        orderBy: { startDateTime: 'asc' },
        skip,
        take,
        include: {
          _count: {
            select: {
              registrations: { where: { paymentStatus: EventPaymentStatus.PAID } },
            },
          },
        },
      }),
      this.prisma.event.count({ where }),
    ]);

    // Check user registrations if logged in
    let myRegisteredEventIds = new Set<string>();
    if (userId) {
      const myRegs = await this.prisma.eventRegistration.findMany({
        where: { userId, paymentStatus: EventPaymentStatus.PAID },
        select: { eventId: true },
      });
      myRegisteredEventIds = new Set(myRegs.map((r) => r.eventId));
    }

    return {
      items: events.map((evt) =>
        mapEvent(evt, {
          isStaff: false,
          registeredByMe: myRegisteredEventIds.has(evt.id),
        }),
      ),
      total,
      page: query.page || 1,
      limit: take,
      totalPages: Math.ceil(total / take) || 1,
    };
  }

  async getForPublic(idOrSlug: string, userId?: string) {
    const event = await this.prisma.event.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
        isPublished: true,
      },
      include: {
        _count: {
          select: {
            registrations: { where: { paymentStatus: EventPaymentStatus.PAID } },
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found or not published');
    }

    let registeredByMe = false;
    let showSecretLink = false;

    if (userId) {
      const reg = await this.prisma.eventRegistration.findFirst({
        where: {
          eventId: event.id,
          userId,
          paymentStatus: EventPaymentStatus.PAID,
        },
      });
      if (reg) {
        registeredByMe = true;
        showSecretLink = true;
      }
    }

    return mapEvent(event, { isStaff: false, registeredByMe, showSecretLink });
  }

  async checkout(idOrSlug: string, dto: CheckoutEventDto, userId?: string) {
    const event = await this.prisma.event.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
        isPublished: true,
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found or registration is currently closed');
    }

    if (event.seatLimit !== null && event.seatsBooked >= event.seatLimit) {
      throw new BadRequestException('Sorry, this event is completely sold out');
    }

    const attendeeName = (dto.attendeeName || dto.fullName || '').trim();
    const attendeeEmail = (dto.attendeeEmail || dto.email || '').trim().toLowerCase();
    const attendeePhone = (dto.attendeePhone || dto.phone || '').trim();

    if (!attendeeName) {
      throw new BadRequestException('Attendee name is required');
    }
    if (!attendeeEmail) {
      throw new BadRequestException('Attendee email is required');
    }
    if (!attendeePhone) {
      throw new BadRequestException('Attendee phone is required');
    }

    const priceNum = Number(event.price);

    // Free RSVP flow
    if (priceNum === 0) {
      const registration = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.eventRegistration.findFirst({
          where: {
            eventId: event.id,
            attendeeEmail,
            paymentStatus: EventPaymentStatus.PAID,
          },
        });
        if (existing) {
          return existing;
        }

        const reg = await tx.eventRegistration.create({
          data: {
            eventId: event.id,
            userId: userId || null,
            attendeeName,
            attendeeEmail,
            attendeePhone,
            amount: new Prisma.Decimal(0),
            currency: event.currency,
            paymentGateway: 'FREE',
            gatewayOrderId: `free_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`,
            gatewayPaymentId: `free_pay_${Date.now()}`,
            paymentStatus: EventPaymentStatus.PAID,
            emailSent: false,
          },
        });

        await tx.event.update({
          where: { id: event.id },
          data: { seatsBooked: { increment: 1 } },
        });

        return reg;
      });

      await this.sendEventConfirmationEmail(event, registration);

      return {
        success: true,
        registrationId: registration.id,
        status: EventPaymentStatus.PAID,
        isFree: true,
        meetingLink: event.locationType === EventLocationType.ONLINE ? event.meetingLink : null,
        venueName: event.venueName,
        venueAddress: event.venueAddress,
      };
    }

    // Paid Event flow: create PENDING registration
    const orderId = `sim_ord_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;

    const registration = await this.prisma.eventRegistration.create({
      data: {
        eventId: event.id,
        userId: userId || null,
        attendeeName,
        attendeeEmail,
        attendeePhone,
        amount: event.price,
        currency: event.currency,
        paymentGateway: 'SIMULATION',
        gatewayOrderId: orderId,
        paymentStatus: EventPaymentStatus.PENDING,
        emailSent: false,
      },
    });

    return {
      success: true,
      registrationId: registration.id,
      orderId,
      amount: priceNum,
      currency: event.currency,
      status: EventPaymentStatus.PENDING,
      simulation: true,
      event: mapEvent(event, { isStaff: false }),
    };
  }

  async verifyPayment(dto: VerifyEventPaymentDto) {
    const reg = await this.prisma.eventRegistration.findUnique({
      where: { id: dto.registrationId },
      include: { event: true },
    });

    if (!reg) {
      throw new NotFoundException('Registration record not found');
    }

    if (reg.paymentStatus === EventPaymentStatus.PAID) {
      return {
        success: true,
        alreadyConfirmed: true,
        registrationId: reg.id,
        status: EventPaymentStatus.PAID,
        meetingLink: reg.event.locationType === EventLocationType.ONLINE ? reg.event.meetingLink : null,
        venueName: reg.event.venueName,
        venueAddress: reg.event.venueAddress,
      };
    }

    const paymentId = dto.gatewayPaymentId || `sim_pay_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;

    await this.prisma.$transaction(async (tx) => {
      await tx.eventRegistration.update({
        where: { id: reg.id },
        data: {
          paymentStatus: EventPaymentStatus.PAID,
          gatewayPaymentId: paymentId,
          gatewayOrderId: dto.gatewayOrderId || reg.gatewayOrderId,
        },
      });

      await tx.event.update({
        where: { id: reg.eventId },
        data: { seatsBooked: { increment: 1 } },
      });
    });

    const updatedReg = await this.prisma.eventRegistration.findUnique({
      where: { id: reg.id },
      include: { event: true },
    });

    if (updatedReg && !updatedReg.emailSent) {
      await this.sendEventConfirmationEmail(updatedReg.event, updatedReg);
    }

    return {
      success: true,
      registrationId: reg.id,
      status: EventPaymentStatus.PAID,
      meetingLink: reg.event.locationType === EventLocationType.ONLINE ? reg.event.meetingLink : null,
      venueName: reg.event.venueName,
      venueAddress: reg.event.venueAddress,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ADMIN QUERIES & MUTATIONS
  // ─────────────────────────────────────────────────────────────────────────────

  async listForAdmin(query: AdminListEventsQueryDto) {
    const where: Prisma.EventWhereInput = {
      ...(query.locationType ? { locationType: query.locationType } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
              { venueName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const take = query.limit || 100;
    const skip = ((query.page || 1) - 1) * take;

    const [events, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        orderBy: { startDateTime: 'desc' },
        skip,
        take,
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          _count: {
            select: {
              registrations: { where: { paymentStatus: EventPaymentStatus.PAID } },
            },
          },
        },
      }),
      this.prisma.event.count({ where }),
    ]);

    return {
      items: events.map((evt) => mapEvent(evt, { isStaff: true })),
      total,
      page: query.page || 1,
      limit: take,
    };
  }

  async getForAdmin(id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        _count: {
          select: {
            registrations: { where: { paymentStatus: EventPaymentStatus.PAID } },
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return mapEvent(event, { isStaff: true });
  }

  async createForAdmin(adminId: string, dto: CreateEventDto, meta?: RequestMeta) {
    const locationType = dto.locationType || EventLocationType.ONLINE;

    // Strict validation of Online vs Physical
    if (locationType === EventLocationType.ONLINE) {
      if (!dto.meetingLink || !dto.meetingLink.trim()) {
        throw new BadRequestException('Online events require a valid Meeting Link (Zoom, Google Meet, etc.)');
      }
    } else if (locationType === EventLocationType.PHYSICAL) {
      if (!dto.venueName?.trim() || !dto.venueAddress?.trim()) {
        throw new BadRequestException('Physical in-person events require Venue / Hall Name and Full Physical Address');
      }
    }

    const startDateTime = new Date(dto.startDateTime || dto.startAt!);
    if (isNaN(startDateTime.getTime())) {
      throw new BadRequestException('Invalid start date and time');
    }

    let endDateTime: Date | null = null;
    if (dto.endDateTime || dto.endAt) {
      endDateTime = new Date(dto.endDateTime || dto.endAt!);
      if (isNaN(endDateTime.getTime())) {
        throw new BadRequestException('Invalid end date and time');
      }
      if (endDateTime < startDateTime) {
        throw new BadRequestException('End date and time cannot be before start date and time');
      }
    }

    let slug = generateSlug(dto.title);
    if (!slug) slug = 'event-' + Date.now();
    const existingSlug = await this.prisma.event.findUnique({ where: { slug } });
    if (existingSlug) {
      slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    const price = new Prisma.Decimal(Math.max(0, Number(dto.price || 0)));
    const currency = dto.currency || CurrencyCode.USD;
    const seatLimit =
      dto.seatLimit !== undefined
        ? dto.seatLimit
        : dto.maxRegistrations !== undefined
        ? dto.maxRegistrations
        : null;

    const event = await this.prisma.event.create({
      data: {
        title: dto.title.trim(),
        slug,
        description: dto.description.trim(),
        bannerUrl: dto.bannerUrl || dto.coverImageUrl || null,
        startDateTime,
        endDateTime,
        timezone: dto.timezone || 'UTC',
        locationType,
        meetingLink: locationType === EventLocationType.ONLINE ? dto.meetingLink?.trim() || null : null,
        venueName: locationType === EventLocationType.PHYSICAL ? dto.venueName?.trim() || null : null,
        venueAddress: locationType === EventLocationType.PHYSICAL ? dto.venueAddress?.trim() || null : null,
        price,
        currency,
        seatLimit,
        isPublished: dto.isPublished !== undefined ? dto.isPublished : true,
        createdById: adminId !== 'system' ? adminId : null,
      },
    });

    await this.auditService.log(this.prisma, {
      actorId: adminId,
      action: 'EVENT_CREATE',
      entityType: 'Event',
      entityId: event.id,
      metadata: { title: event.title, slug: event.slug, locationType, price: Number(price), currency, ipAddress: meta?.ipAddress, userAgent: meta?.userAgent },
    }).catch(() => {});

    return mapEvent(event, { isStaff: true });
  }

  async updateForAdmin(adminId: string, id: string, dto: UpdateEventDto, meta?: RequestMeta) {
    const existing = await this.prisma.event.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Event not found');
    }

    const locationType = dto.locationType || existing.locationType;

    if (locationType === EventLocationType.ONLINE) {
      const meetingLink = dto.meetingLink !== undefined ? dto.meetingLink : existing.meetingLink;
      if (!meetingLink || !meetingLink.trim()) {
        throw new BadRequestException('Online events require a valid Meeting Link (Zoom, Google Meet, etc.)');
      }
    } else if (locationType === EventLocationType.PHYSICAL) {
      const venueName = dto.venueName !== undefined ? dto.venueName : existing.venueName;
      const venueAddress = dto.venueAddress !== undefined ? dto.venueAddress : existing.venueAddress;
      if (!venueName?.trim() || !venueAddress?.trim()) {
        throw new BadRequestException('Physical in-person events require Venue / Hall Name and Full Physical Address');
      }
    }

    let startDateTime = existing.startDateTime;
    if (dto.startDateTime || dto.startAt) {
      startDateTime = new Date(dto.startDateTime || dto.startAt!);
      if (isNaN(startDateTime.getTime())) {
        throw new BadRequestException('Invalid start date and time');
      }
    }

    let endDateTime = existing.endDateTime;
    if (dto.endDateTime !== undefined || dto.endAt !== undefined) {
      const rawEnd = dto.endDateTime || dto.endAt;
      endDateTime = rawEnd ? new Date(rawEnd) : null;
      if (endDateTime && (isNaN(endDateTime.getTime()) || endDateTime < startDateTime)) {
        throw new BadRequestException('End date and time must be valid and after start date and time');
      }
    }

    const seatLimit =
      dto.seatLimit !== undefined
        ? dto.seatLimit
        : dto.maxRegistrations !== undefined
        ? dto.maxRegistrations
        : existing.seatLimit;

    const event = await this.prisma.event.update({
      where: { id },
      data: {
        title: dto.title !== undefined ? dto.title.trim() : undefined,
        description: dto.description !== undefined ? dto.description.trim() : undefined,
        bannerUrl: dto.bannerUrl !== undefined ? dto.bannerUrl : dto.coverImageUrl !== undefined ? dto.coverImageUrl : undefined,
        startDateTime,
        endDateTime,
        timezone: dto.timezone !== undefined ? dto.timezone : undefined,
        locationType,
        meetingLink:
          locationType === EventLocationType.ONLINE
            ? dto.meetingLink !== undefined ? dto.meetingLink?.trim() || null : existing.meetingLink
            : null,
        venueName:
          locationType === EventLocationType.PHYSICAL
            ? dto.venueName !== undefined ? dto.venueName?.trim() || null : existing.venueName
            : null,
        venueAddress:
          locationType === EventLocationType.PHYSICAL
            ? dto.venueAddress !== undefined ? dto.venueAddress?.trim() || null : existing.venueAddress
            : null,
        price: dto.price !== undefined ? new Prisma.Decimal(Math.max(0, Number(dto.price))) : undefined,
        currency: dto.currency || undefined,
        seatLimit,
        isPublished: dto.isPublished !== undefined ? dto.isPublished : undefined,
      },
    });

    await this.auditService.log(this.prisma, {
      actorId: adminId,
      action: 'EVENT_UPDATE',
      entityType: 'Event',
      entityId: event.id,
      metadata: { title: event.title, locationType, price: Number(event.price), currency: event.currency, ipAddress: meta?.ipAddress, userAgent: meta?.userAgent },
    }).catch(() => {});

    return mapEvent(event, { isStaff: true });
  }

  async removeForAdmin(adminId: string, id: string, meta?: RequestMeta) {
    const existing = await this.prisma.event.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Event not found');
    }

    await this.prisma.event.delete({ where: { id } });

    await this.auditService.log(this.prisma, {
      actorId: adminId,
      action: 'EVENT_DELETE',
      entityType: 'Event',
      entityId: id,
      metadata: { title: existing.title, ipAddress: meta?.ipAddress, userAgent: meta?.userAgent },
    }).catch(() => {});

    return { success: true, id };
  }

  async listRegistrationsForAdmin(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        registrations: {
          orderBy: { registeredAt: 'desc' },
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const confirmed = event.registrations.filter((r) => r.paymentStatus === EventPaymentStatus.PAID);
    const seatsRemaining =
      event.seatLimit !== null && event.seatLimit !== undefined
        ? Math.max(0, event.seatLimit - event.seatsBooked)
        : null;

    const revenueByCurrency: Record<string, number> = {
      USD: 0,
      AED: 0,
      INR: 0,
    };

    for (const r of confirmed) {
      const cur = r.currency || CurrencyCode.USD;
      revenueByCurrency[cur] = (revenueByCurrency[cur] || 0) + Number(r.amount);
    }

    return {
      event: mapEvent(event, { isStaff: true }),
      kpis: {
        totalConfirmed: confirmed.length,
        totalRegistrations: event.registrations.length,
        seatsRemaining,
        seatLimit: event.seatLimit,
        seatsBooked: event.seatsBooked,
        revenueByCurrency,
      },
      registrations: event.registrations.map((r) => mapRegistration(r)),
    };
  }

  async refundRegistrationForAdmin(adminId: string, eventId: string, registrationId: string, reason?: string) {
    const reg = await this.prisma.eventRegistration.findFirst({
      where: { id: registrationId, eventId },
    });

    if (!reg) {
      throw new NotFoundException('Registration not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.eventRegistration.update({
        where: { id: registrationId },
        data: {
          paymentStatus: EventPaymentStatus.REFUNDED,
          rejectionReason: reason || 'Refunded by administrator',
          rejectedById: adminId !== 'system' ? adminId : null,
          rejectedAt: new Date(),
        },
      });

      if (reg.paymentStatus === EventPaymentStatus.PAID) {
        await tx.event.update({
          where: { id: eventId },
          data: { seatsBooked: { decrement: 1 } },
        });
      }
    });

    return { success: true, registrationId, status: EventPaymentStatus.REFUNDED };
  }

  private async sendEventConfirmationEmail(event: Event, reg: EventRegistration) {
    try {
      const isOnline = event.locationType === EventLocationType.ONLINE;
      const dateFormatted = new Date(event.startDateTime).toLocaleString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: event.timezone || 'UTC',
      });

      const locationHtml = isOnline
        ? `
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <h3 style="color: #166534; margin: 0 0 8px; font-size: 16px;">🟢 Live Online Session Access</h3>
            <p style="margin: 0 0 12px; color: #1e293b; font-size: 14px;">Your private access link to join the session:</p>
            <a href="${event.meetingLink}" style="display: inline-block; background: #0f172a; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 14px;">
              Join Meeting &rarr;
            </a>
            <p style="margin: 10px 0 0; font-size: 12px; color: #64748b;">Link: <a href="${event.meetingLink}" style="color: #2563eb;">${event.meetingLink}</a></p>
          </div>
        `
        : `
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <h3 style="color: #0f172a; margin: 0 0 8px; font-size: 16px;">📍 In-Person Venue Information</h3>
            <p style="margin: 0 0 4px; font-weight: bold; color: #1e293b; font-size: 15px;">${event.venueName}</p>
            <p style="margin: 0; color: #475569; font-size: 14px;">${event.venueAddress}</p>
          </div>
        `;

      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b;">
          <h2 style="color: #0f172a; margin-top: 0;">Registration Confirmed: ${event.title}</h2>
          <p>Dear ${reg.attendeeName},</p>
          <p>Thank you for registering! Your booking for <strong>${event.title}</strong> has been successfully confirmed.</p>
          
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
            <tr>
              <td style="padding: 8px 0; color: #64748b;">Date & Time:</td>
              <td style="padding: 8px 0; font-weight: bold;">${dateFormatted} (${event.timezone || 'UTC'})</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b;">Amount Paid:</td>
              <td style="padding: 8px 0; font-weight: bold;">${Number(reg.amount) > 0 ? `${reg.currency} ${Number(reg.amount)}` : 'Free RSVP'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b;">Booking Reference:</td>
              <td style="padding: 8px 0; font-family: monospace;">${reg.id}</td>
            </tr>
          </table>

          ${locationHtml}

          <p style="color: #64748b; font-size: 13px; margin-top: 30px;">
            If you have any questions, reply directly to this email or contact support at WhatBoutMe.com.
          </p>
        </div>
      `;

      await this.emailService.sendEmail({
        to: reg.attendeeEmail,
        subject: `Confirmed: ${event.title}`,
        html,
        text: `Your registration for ${event.title} is confirmed. Date: ${dateFormatted}. Details: ${isOnline ? event.meetingLink : event.venueName}`,
      });

      await this.prisma.eventRegistration.update({
        where: { id: reg.id },
        data: { emailSent: true },
      });
    } catch (err: any) {
      this.logger.error(`Failed to dispatch event confirmation email to ${reg.attendeeEmail}: ${err.message}`);
    }
  }
}
