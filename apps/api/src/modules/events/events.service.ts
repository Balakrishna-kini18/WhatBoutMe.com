import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EventRegistrationStatus,
  EventStatus,
  EventType,
  ParticipantCategory,
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
  CreateEventDto,
  RegisterEventDto,
  UpdateEventDto,
  UpdateEventStatusDto,
} from './dto/event.dto.js';
import {
  eventTypeLabel,
  mapEvent,
  mapRegistration,
  PARTICIPANT_CATEGORY_LABELS,
} from './event.mapper.js';

type RequestMeta = {
  ipAddress?: string;
  userAgent?: string;
};

const confirmedRegistrationWhere = {
  status: EventRegistrationStatus.CONFIRMED,
};

const eventInclude = {
  _count: {
    select: {
      registrations: {
        where: confirmedRegistrationWhere,
      },
    },
  },
  createdBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
};

@Injectable()
export class EventsService {
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

    return new Promise<{ coverImageUrl: string; publicId: string }>((resolve, reject) => {
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
            publicId: result.public_id,
          });
        },
      );
      uploadStream.end(file.buffer);
    });
  }

  listForPublic(query: ListEventsQueryDto, userId?: string) {
    return this.listEvents(query, {
      excludeStatuses: [EventStatus.CANCELLED],
      userId,
    });
  }

  async getForPublic(eventId: string, userId?: string) {
    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        status: { not: EventStatus.CANCELLED },
      },
      include: eventInclude,
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    let registeredByMe = false;
    if (userId) {
      const registered = await this.prisma.eventRegistration.findFirst({
        where: {
          eventId,
          userId,
          status: EventRegistrationStatus.CONFIRMED,
        },
        select: { id: true },
      });
      registeredByMe = Boolean(registered);
    }

    return mapEvent(event, { registeredByMe });
  }

  async register(eventId: string, userId: string | null, dto: RegisterEventDto) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (event.status !== EventStatus.REGISTRATION_OPEN) {
      throw new BadRequestException('Registration is not currently open for this event');
    }

    this.assertRegistrationCloses(event);

    if (dto.category === ParticipantCategory.OTHER && !dto.categoryOther?.trim()) {
      throw new BadRequestException('Please specify your category when selecting Other');
    }

    if (event.maxRegistrations) {
      const count = await this.prisma.eventRegistration.count({
        where: { eventId, ...confirmedRegistrationWhere },
      });
      if (count >= event.maxRegistrations) {
        throw new BadRequestException('Registration capacity has been reached for this event');
      }
    }

    const email = dto.email.trim().toLowerCase();
    const registrationData = {
      fullName: dto.fullName.trim(),
      email,
      phone: dto.phone.trim(),
      category: dto.category,
      categoryOther:
        dto.category === ParticipantCategory.OTHER ? dto.categoryOther?.trim() : null,
      organization: dto.organization?.trim() || null,
      city: dto.city?.trim() || null,
    };

    // Check by (eventId, email) or (eventId, userId)
    const existing = await this.prisma.eventRegistration.findFirst({
      where: {
        eventId,
        OR: [
          { email },
          ...(userId ? [{ userId }] : []),
        ],
      },
    });

    if (existing?.status === EventRegistrationStatus.CONFIRMED) {
      throw new ConflictException('You are already registered for this event');
    }

    const registration = existing
      ? await this.prisma.eventRegistration.update({
          where: { id: existing.id },
          data: {
            ...registrationData,
            userId: userId || existing.userId,
            status: EventRegistrationStatus.CONFIRMED,
            rejectedAt: null,
            rejectedById: null,
            rejectionReason: null,
          },
          include: { event: true },
        })
      : await this.prisma.eventRegistration.create({
          data: {
            eventId,
            userId,
            status: EventRegistrationStatus.CONFIRMED,
            ...registrationData,
          },
          include: { event: true },
        });

    if (userId) {
      await this.prisma.notification
        .create({
          data: {
            userId,
            type: 'EVENT_REGISTRATION_CONFIRMED',
            template: `Your registration for "${event.title}" is confirmed.`,
          },
        })
        .catch(() => {});
    }

    await this.sendRegistrationEmail(registration.event, registration);

    return mapRegistration(registration);
  }

  async listMyRegistrations(userId: string) {
    const items = await this.prisma.eventRegistration.findMany({
      where: {
        userId,
        event: { status: { not: EventStatus.CANCELLED } },
      },
      include: {
        event: { include: eventInclude },
      },
      orderBy: { createdAt: 'desc' },
    });

    return items.map((item) => ({
      ...mapRegistration(item),
      event: mapEvent(item.event, { registeredByMe: true }),
    }));
  }

  listCategories() {
    return Object.entries(PARTICIPANT_CATEGORY_LABELS).map(([value, label]) => ({
      value,
      label,
    }));
  }

  // ---------------------------------------------------------------------------
  // Admin Methods
  // ---------------------------------------------------------------------------

  listForAdmin(query: AdminListEventsQueryDto) {
    return this.listEvents(query, {
      orderBy: { createdAt: 'desc' },
    });
  }

  async getForAdmin(eventId: string) {
    const event = await this.findEventOrThrow(eventId);
    return mapEvent(event);
  }

  async createForAdmin(adminId: string, dto: CreateEventDto, meta?: RequestMeta) {
    this.assertValidSchedule(dto.startAt, dto.endAt);

    const now = new Date();
    let status = dto.status;
    if (!status) {
      if (dto.registrationOpensAt && new Date(dto.registrationOpensAt) > now) {
        status = EventStatus.SCHEDULED;
      } else {
        status = EventStatus.REGISTRATION_OPEN;
      }
    }

    const event = await this.prisma.event.create({
      data: {
        type: dto.type,
        title: dto.title.trim(),
        description: dto.description.trim(),
        status,
        startAt: new Date(dto.startAt),
        endAt: new Date(dto.endAt),
        location: dto.location?.trim() || null,
        meetingLink: dto.meetingLink?.trim() || null,
        coverImageUrl: dto.coverImageUrl?.trim() || null,
        maxRegistrations: dto.maxRegistrations ?? null,
        registrationOpensAt: dto.registrationOpensAt
          ? new Date(dto.registrationOpensAt)
          : null,
        registrationClosesAt: dto.registrationClosesAt
          ? new Date(dto.registrationClosesAt)
          : null,
        createdById: adminId,
      },
      include: eventInclude,
    });

    await this.auditService.log(this.prisma, {
      actorId: adminId,
      action: 'EVENT_CREATED',
      entityType: 'Event',
      entityId: event.id,
      metadata: { type: event.type, title: event.title, status: event.status },
    });

    return mapEvent(event);
  }

  async updateForAdmin(adminId: string, eventId: string, dto: UpdateEventDto, meta?: RequestMeta) {
    const existing = await this.findEventOrThrow(eventId);

    if (dto.startAt || dto.endAt) {
      this.assertValidSchedule(
        dto.startAt ?? existing.startAt.toISOString(),
        dto.endAt ?? existing.endAt.toISOString(),
      );
    }

    const event = await this.prisma.event.update({
      where: { id: eventId },
      data: {
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() } : {}),
        ...(dto.startAt !== undefined ? { startAt: new Date(dto.startAt) } : {}),
        ...(dto.endAt !== undefined ? { endAt: new Date(dto.endAt) } : {}),
        ...(dto.location !== undefined ? { location: dto.location.trim() || null } : {}),
        ...(dto.meetingLink !== undefined ? { meetingLink: dto.meetingLink.trim() || null } : {}),
        ...(dto.coverImageUrl !== undefined ? { coverImageUrl: dto.coverImageUrl.trim() || null } : {}),
        ...(dto.maxRegistrations !== undefined ? { maxRegistrations: dto.maxRegistrations } : {}),
        ...(dto.registrationOpensAt !== undefined
          ? {
              registrationOpensAt: dto.registrationOpensAt
                ? new Date(dto.registrationOpensAt)
                : null,
            }
          : {}),
        ...(dto.registrationClosesAt !== undefined
          ? {
              registrationClosesAt: dto.registrationClosesAt
                ? new Date(dto.registrationClosesAt)
                : null,
            }
          : {}),
      },
      include: eventInclude,
    });

    await this.auditService.log(this.prisma, {
      actorId: adminId,
      action: 'EVENT_UPDATED',
      entityType: 'Event',
      entityId: eventId,
      metadata: { title: event.title, type: event.type },
    });

    return mapEvent(event);
  }

  async updateStatusForAdmin(
    adminId: string,
    eventId: string,
    dto: UpdateEventStatusDto,
    meta?: RequestMeta,
  ) {
    const existing = await this.findEventOrThrow(eventId);
    const now = new Date();

    const statusData: {
      status: EventStatus;
      registrationOpensAt?: Date;
    } = { status: dto.status };

    if (dto.status === EventStatus.REGISTRATION_OPEN) {
      if (!existing.registrationOpensAt || existing.registrationOpensAt > now) {
        statusData.registrationOpensAt = now;
      }
    }

    const event = await this.prisma.event.update({
      where: { id: eventId },
      data: statusData,
      include: eventInclude,
    });

    await this.auditService.log(this.prisma, {
      actorId: adminId,
      action: 'EVENT_STATUS_UPDATED',
      entityType: 'Event',
      entityId: eventId,
      metadata: { oldStatus: existing.status, newStatus: event.status },
    });

    return mapEvent(event);
  }

  async deleteForAdmin(adminId: string, eventId: string) {
    await this.findEventOrThrow(eventId);

    await this.prisma.event.delete({
      where: { id: eventId },
    });

    await this.auditService.log(this.prisma, {
      actorId: adminId,
      action: 'EVENT_DELETED',
      entityType: 'Event',
      entityId: eventId,
    });

    return { success: true, message: 'Event deleted successfully' };
  }

  async listRegistrationsForAdmin(eventId: string) {
    await this.findEventOrThrow(eventId);

    const registrations = await this.prisma.eventRegistration.findMany({
      where: { eventId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return registrations.map(mapRegistration);
  }

  async rejectRegistrationForAdmin(
    adminId: string,
    eventId: string,
    registrationId: string,
    reason?: string,
    meta?: RequestMeta,
  ) {
    await this.findEventOrThrow(eventId);

    const registration = await this.prisma.eventRegistration.findFirst({
      where: { id: registrationId, eventId },
      include: { event: true },
    });

    if (!registration) {
      throw new NotFoundException('Registration not found');
    }

    if (registration.status === EventRegistrationStatus.REJECTED) {
      return mapRegistration(registration);
    }

    const updated = await this.prisma.eventRegistration.update({
      where: { id: registrationId },
      data: {
        status: EventRegistrationStatus.REJECTED,
        rejectedAt: new Date(),
        rejectedById: adminId,
        rejectionReason: reason?.trim() || null,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (registration.userId) {
      await this.prisma.notification
        .create({
          data: {
            userId: registration.userId,
            type: 'EVENT_REGISTRATION_REJECTED',
            template: `Your registration for "${registration.event.title}" was declined. ${reason ? `Reason: ${reason}` : ''}`,
          },
        })
        .catch(() => {});
    }

    await this.auditService.log(this.prisma, {
      actorId: adminId,
      action: 'EVENT_REGISTRATION_REJECTED',
      entityType: 'EventRegistration',
      entityId: registrationId,
      reason,
      metadata: { eventId, email: updated.email },
    });

    return mapRegistration(updated);
  }

  // ---------------------------------------------------------------------------
  // Helper Private Methods
  // ---------------------------------------------------------------------------

  private async listEvents(
    query: ListEventsQueryDto,
    options?: {
      excludeStatuses?: EventStatus[];
      userId?: string;
      orderBy?: Prisma.EventOrderByWithRelationInput;
    },
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      ...(query.type ? { type: query.type } : {}),
      ...(query.status
        ? { status: query.status }
        : options?.excludeStatuses
          ? { status: { notIn: options.excludeStatuses } }
          : {}),
    };

    const [total, events] = await this.prisma.$transaction([
      this.prisma.event.count({ where }),
      this.prisma.event.findMany({
        where,
        include: eventInclude,
        orderBy: options?.orderBy ?? { startAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    let registeredIds = new Set<string>();
    if (options?.userId && events.length > 0) {
      const registrations = await this.prisma.eventRegistration.findMany({
        where: {
          userId: options.userId,
          eventId: { in: events.map((e) => e.id) },
          status: EventRegistrationStatus.CONFIRMED,
        },
        select: { eventId: true },
      });
      registeredIds = new Set(registrations.map((r) => r.eventId));
    }

    return {
      items: events.map((event) =>
        mapEvent(event, { registeredByMe: registeredIds.has(event.id) }),
      ),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private async findEventOrThrow(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: eventInclude,
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return event;
  }

  private assertValidSchedule(startAt: string, endAt: string) {
    const start = new Date(startAt);
    const end = new Date(endAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Invalid schedule dates');
    }
    if (end <= start) {
      throw new BadRequestException('End time must be after start time');
    }
  }

  private assertRegistrationCloses(event: {
    registrationClosesAt: Date | null;
    endAt: Date;
  }) {
    const now = new Date();
    if (event.registrationClosesAt && now > event.registrationClosesAt) {
      throw new BadRequestException('Registration has closed for this event');
    }
    if (now > event.endAt) {
      throw new BadRequestException('This event has already concluded');
    }
  }

  private async sendRegistrationEmail(
    event: {
      type: EventType;
      title: string;
      startAt: Date;
      endAt: Date;
      location: string | null;
      meetingLink: string | null;
    },
    registration: {
      fullName: string;
      email: string;
      category: ParticipantCategory;
      categoryOther: string | null;
    },
  ) {
    const typeLabel = eventTypeLabel(event.type);
    const categoryLabel =
      registration.category === ParticipantCategory.OTHER
        ? registration.categoryOther ?? 'Other'
        : PARTICIPANT_CATEGORY_LABELS[registration.category];

    const schedule = `${event.startAt.toLocaleString()} – ${event.endAt.toLocaleString()}`;
    const locationLine = event.location
      ? `Location: ${event.location}`
      : event.meetingLink
        ? `Join link: ${event.meetingLink}`
        : '';

    const text = [
      `Hi ${registration.fullName},`,
      '',
      `Your registration for the WhatBoutMe ${typeLabel.toLowerCase()} "${event.title}" is confirmed.`,
      '',
      `Schedule: ${schedule}`,
      locationLine,
      `Category: ${categoryLabel}`,
      '',
      'We look forward to seeing you there.',
      '',
      '— WhatBoutMe Team',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await this.emailService.sendEmail({
        to: registration.email,
        subject: `Registration Confirmed: ${event.title}`,
        text,
      });
    } catch {
      // Email failure should not block registration
    }
  }
}
