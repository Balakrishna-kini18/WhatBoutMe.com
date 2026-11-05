import Stripe from 'stripe';
import {
  BadRequestException,
  ForbiddenException,
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
  InvoiceStatus,
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

  async uploadCoverImage(file: { buffer?: Buffer; mimetype?: string; size?: number;[key: string]: any }) {
      if (!file || !file.buffer) {
        throw new BadRequestException('Image file is required');
      }

      const size = file.size ?? file.buffer.length;
      const MAX_SIZE = 5 * 1024 * 1024; // 5MB limit
      if (size > MAX_SIZE) {
        throw new BadRequestException('Image file size must not exceed 5MB');
      }

      const mime = (file.mimetype || '').toLowerCase();
      const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/avif']);
      if (mime && !ALLOWED_MIME.has(mime)) {
        throw new BadRequestException(
          'Invalid image format. Only PNG, JPEG, WEBP, and AVIF image files are supported',
        );
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

  async listForPublic(query: ListEventsQueryDto, userId ?: string) {
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

  async getForPublic(idOrSlug: string, userId ?: string) {
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

  async checkout(idOrSlug: string, dto: CheckoutEventDto, userId ?: string) {
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

      // 1. Prevent duplicate payments: check if user is already paid for this event
      const existingPaid = await this.prisma.eventRegistration.findFirst({
        where: {
          eventId: event.id,
          attendeeEmail: { equals: attendeeEmail, mode: 'insensitive' },
          paymentStatus: EventPaymentStatus.PAID,
        },
        include: { event: true },
      });

      if (existingPaid) {
        return {
          success: true,
          alreadyRegistered: true,
          message: 'You have already registered and paid for this event. Duplicate booking is not allowed.',
          registrationId: existingPaid.id,
          status: EventPaymentStatus.PAID,
          meetingLink: event.locationType === EventLocationType.ONLINE ? event.meetingLink : null,
          venueName: event.venueName,
          venueAddress: event.venueAddress,
          registration: {
            id: existingPaid.id,
            eventId: existingPaid.eventId,
            attendeeName: existingPaid.attendeeName,
            attendeeEmail: existingPaid.attendeeEmail,
            attendeePhone: existingPaid.attendeePhone,
            amount: Number(existingPaid.amount),
            currency: existingPaid.currency,
            gatewayOrderId: existingPaid.gatewayOrderId,
            gatewayPaymentId: existingPaid.gatewayPaymentId,
            paymentStatus: existingPaid.paymentStatus,
            createdAt: existingPaid.createdAt,
          },
          event: mapEvent(event, { isStaff: false }),
        };
      }

      // Free RSVP flow
      if (priceNum === 0) {
        const registration = await this.prisma.$transaction(async (tx) => {
          const currentEvt = await tx.event.findUnique({ where: { id: event.id } });
          if (currentEvt && currentEvt.seatLimit !== null && currentEvt.seatsBooked >= currentEvt.seatLimit) {
            throw new BadRequestException('Sorry, this event is completely sold out');
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

        this.sendEventConfirmationEmail(event, registration).catch((err) => {
          this.logger.error(`Failed to send free RSVP email: ${err?.message}`);
        });

        return {
          success: true,
          registrationId: registration.id,
          status: EventPaymentStatus.PAID,
          isFree: true,
          meetingLink: event.locationType === EventLocationType.ONLINE ? event.meetingLink : null,
          venueName: event.venueName,
          venueAddress: event.venueAddress,
          registration: {
            id: registration.id,
            eventId: registration.eventId,
            attendeeName: registration.attendeeName,
            attendeeEmail: registration.attendeeEmail,
            attendeePhone: registration.attendeePhone,
            amount: 0,
            currency: event.currency,
            gatewayOrderId: registration.gatewayOrderId,
            gatewayPaymentId: registration.gatewayPaymentId,
            paymentStatus: registration.paymentStatus,
            createdAt: registration.createdAt,
          },
          event: mapEvent(event, { isStaff: false }),
        };
      }

      // Paid Event flow: create PENDING registration
      let orderId = `sim_ord_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
      let checkoutUrl: string | undefined = undefined;

      const isStripeActive = process.env.PAYMENT_PROVIDER === 'STRIPE' && !!process.env.STRIPE_SECRET_KEY;

      const registration = await this.prisma.eventRegistration.create({
        data: {
          eventId: event.id,
          userId: userId || null,
          attendeeName,
          attendeeEmail,
          attendeePhone,
          amount: event.price,
          currency: event.currency,
          paymentGateway: isStripeActive ? 'STRIPE' : 'SIMULATION',
          gatewayOrderId: orderId,
          paymentStatus: EventPaymentStatus.PENDING,
          emailSent: false,
        },
      });

      if (isStripeActive) {
        try {
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
          const marketingUrl = process.env.MARKETING_SITE_URL || 'http://localhost:3001';
          const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            customer_email: attendeeEmail,
            line_items: [
              {
                price_data: {
                  currency: event.currency.toLowerCase(),
                  unit_amount: Math.round(priceNum * 100),
                  product_data: {
                    name: event.title,
                    description: `Event Registration - ${event.title}`,
                  },
                },
                quantity: 1,
              },
            ],
            metadata: {
              targetType: 'EVENT',
              targetId: event.id,
              eventId: event.id,
              registrationId: registration.id,
              attendeeName,
              attendeeEmail,
              attendeePhone,
            },
            success_url: `${marketingUrl}/events/${event.slug || event.id}?session_id={CHECKOUT_SESSION_ID}&registrationId=${registration.id}`,
            cancel_url: `${marketingUrl}/events/${event.slug || event.id}?canceled=1`,
          });

          orderId = session.id;
          checkoutUrl = session.url || undefined;

          await this.prisma.eventRegistration.update({
            where: { id: registration.id },
            data: { gatewayOrderId: orderId },
          });
        } catch (err: any) {
          this.logger.error(`Stripe event checkout session creation failed: ${err?.message}`);
        }
      }

      return {
        success: true,
        registrationId: registration.id,
        orderId,
        checkoutUrl,
        amount: priceNum,
        currency: event.currency,
        status: EventPaymentStatus.PENDING,
        simulation: !checkoutUrl,
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
          registration: {
            id: reg.id,
            eventId: reg.eventId,
            attendeeName: reg.attendeeName,
            attendeeEmail: reg.attendeeEmail,
            attendeePhone: reg.attendeePhone,
            amount: Number(reg.amount),
            currency: reg.currency,
            gatewayOrderId: reg.gatewayOrderId,
            gatewayPaymentId: reg.gatewayPaymentId,
            paymentStatus: reg.paymentStatus,
            createdAt: reg.createdAt,
          },
          event: mapEvent(reg.event, { isStaff: false }),
        };
      }

      const regPrice = Number(reg.amount);
      const isPaidEvent = regPrice > 0;
      const isProduction = process.env.NODE_ENV === 'production';
      const isStripeActive = process.env.PAYMENT_PROVIDER === 'STRIPE';

      // Security Guard: Prevent simulation bypass on paid events in production or live Stripe mode
      if (isPaidEvent && dto.isSimulated && (isProduction || isStripeActive)) {
        throw new ForbiddenException('Simulated payment verification is disabled for paid events.');
      }

      if (dto.gatewayOrderId?.startsWith('cs_') && process.env.STRIPE_SECRET_KEY && !dto.isSimulated) {
        try {
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
          const session = await stripe.checkout.sessions.retrieve(dto.gatewayOrderId);
          if (session.payment_status !== 'paid') {
            throw new BadRequestException('Payment has not yet completed on Stripe.');
          }

          // Anti-Spoofing: Verify session ownership
          const sessionRegId = session.metadata?.registrationId || session.client_reference_id;
          if (sessionRegId && sessionRegId !== reg.id && reg.gatewayOrderId !== session.id) {
            throw new BadRequestException('Payment session does not match this event registration.');
          }

          // Anti-Replay: Verify session has not already been used for another paid registration
          const existingUsed = await this.prisma.eventRegistration.findFirst({
            where: {
              id: { not: reg.id },
              gatewayOrderId: dto.gatewayOrderId,
              paymentStatus: EventPaymentStatus.PAID,
            },
          });
          if (existingUsed) {
            throw new BadRequestException('This Stripe payment session has already been redeemed for another ticket.');
          }

          // Amount Verification
          const expectedMinor = Math.round(regPrice * 100);
          if (session.amount_total && session.amount_total < expectedMinor) {
            throw new BadRequestException('Stripe payment amount is less than required registration price.');
          }
        } catch (err: any) {
          if (err instanceof BadRequestException || err instanceof ForbiddenException) throw err;
          this.logger.error(`Stripe session retrieval verification error: ${err?.message}`);
          throw new BadRequestException('Could not verify payment status with Stripe.');
        }
      }

      const paymentId = dto.gatewayPaymentId || `sim_pay_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;

      await this.prisma.$transaction(async (tx) => {
        const currentEvt = await tx.event.findUnique({ where: { id: reg.eventId } });
        if (currentEvt && currentEvt.seatLimit !== null && currentEvt.seatsBooked >= currentEvt.seatLimit) {
          throw new BadRequestException('Sorry, this event reached maximum capacity while payment was processing');
        }

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

      if (updatedReg && Number(updatedReg.amount) > 0 && typeof (this.prisma as any).invoice?.count === 'function') {
        try {
          const invCount = await this.prisma.invoice.count();
          const invoiceNumber = `INV-${new Date().getFullYear()}-${String(invCount + 1).padStart(5, '0')}`;
          const curr = (updatedReg.currency || 'USD').toUpperCase();
          const isAED = curr === 'AED';
          const isINR = curr === 'INR';
          const taxRate = isAED ? 5 : isINR ? 18 : 0;
          const taxType = isAED ? 'UAE_VAT' : isINR ? 'INDIA_GST' : 'NONE';
          const totalAmount = Number(updatedReg.amount);
          const taxAmount = taxRate > 0 ? Math.round(((totalAmount * taxRate) / (100 + taxRate)) * 100) / 100 : 0;
          const subtotal = Math.round((totalAmount - taxAmount) * 100) / 100;

          await this.prisma.invoice.create({
            data: {
              invoiceNumber,
              amount: totalAmount,
              currency: curr as any,
              status: InvoiceStatus.PAID,
              eventRegistrationId: updatedReg.id,
              pdfUrl: `/api/invoices/${updatedReg.id}/pdf`,
              taxFields: {
                subtotal,
                taxRate,
                taxAmount,
                taxType,
                taxName: isAED ? 'UAE VAT (5%)' : isINR ? 'India GST (18%)' : 'Tax Exempt',
                trn: isAED ? '10049281900003' : null,
                companyName: 'WhatBoutMe FZE',
                companyAddress: 'Dubai Silicon Oasis, DDP, Building A2, Dubai, United Arab Emirates',
                clientName: updatedReg.attendeeName,
                clientEmail: updatedReg.attendeeEmail,
                eventTitle: updatedReg.event?.title,
              },
            },
          });
        } catch (invErr: any) {
          this.logger.error(`Failed to auto-generate invoice for event registration: ${invErr?.message}`);
        }
      }

      if (updatedReg && !updatedReg.emailSent) {
        this.sendEventConfirmationEmail(updatedReg.event, updatedReg).catch((err) => {
          this.logger.error(`Failed to send event confirmation email: ${err?.message}`);
        });
      }

      return {
        success: true,
        registrationId: reg.id,
        status: EventPaymentStatus.PAID,
        meetingLink: reg.event.locationType === EventLocationType.ONLINE ? reg.event.meetingLink : null,
        venueName: reg.event.venueName,
        venueAddress: reg.event.venueAddress,
        registration: updatedReg
          ? {
            id: updatedReg.id,
            eventId: updatedReg.eventId,
            attendeeName: updatedReg.attendeeName,
            attendeeEmail: updatedReg.attendeeEmail,
            attendeePhone: updatedReg.attendeePhone,
            amount: Number(updatedReg.amount),
            currency: updatedReg.currency,
            gatewayOrderId: updatedReg.gatewayOrderId,
            gatewayPaymentId: updatedReg.gatewayPaymentId,
            paymentStatus: updatedReg.paymentStatus,
            createdAt: updatedReg.createdAt,
          }
          : null,
        event: mapEvent(reg.event, { isStaff: false }),
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

  async createForAdmin(adminId: string, dto: CreateEventDto, meta ?: RequestMeta) {
      const locationType = dto.locationType || EventLocationType.ONLINE;
      const meetingLink = (dto.meetingLink || dto.onlineMeetingLink || '').trim();
      const venueName = (dto.venueName || '').trim();
      const venueAddress = (dto.venueAddress || dto.physicalAddress || '').trim();

      // Strict validation of Online vs Physical
      if (locationType === EventLocationType.ONLINE) {
        if (!meetingLink) {
          throw new BadRequestException('Online events require a valid Meeting Link (Zoom URL)');
        }
      } else if (locationType === EventLocationType.PHYSICAL) {
        if (!venueName || !venueAddress) {
          throw new BadRequestException('Physical in-person events require Venue / Hall Name and Full Physical Address');
        }
      }

      const startRaw = dto.startDateTime || dto.startDateTimeUtc || dto.startAt;
      const startDateTime = new Date(startRaw!);
      if (isNaN(startDateTime.getTime())) {
        throw new BadRequestException('Invalid start date and time');
      }

      let endDateTime: Date | null = null;
      const endRaw = dto.endDateTime || dto.endDateTimeUtc || dto.endAt;
      if (endRaw) {
        endDateTime = new Date(endRaw);
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

      const priceNum = dto.price !== undefined ? dto.price : (dto.amount !== undefined ? dto.amount : 0);
      const price = new Prisma.Decimal(Math.max(0, Number(priceNum)));
      const currency = dto.currency || CurrencyCode.USD;
      const seatLimit =
        dto.seatLimit !== undefined
          ? dto.seatLimit
          : dto.capacity !== undefined
            ? dto.capacity
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
          meetingLink: locationType === EventLocationType.ONLINE ? meetingLink || null : null,
          venueName: locationType === EventLocationType.PHYSICAL ? venueName || null : null,
          venueAddress: locationType === EventLocationType.PHYSICAL ? venueAddress || null : null,
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
      }).catch(() => { });

      return mapEvent(event, { isStaff: true });
    }

  async updateForAdmin(adminId: string, id: string, dto: UpdateEventDto, meta ?: RequestMeta) {
      const existing = await this.prisma.event.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundException('Event not found');
      }

      const locationType = dto.locationType || existing.locationType;
      const meetingLink =
        dto.meetingLink !== undefined
          ? dto.meetingLink
          : dto.onlineMeetingLink !== undefined
            ? dto.onlineMeetingLink
            : existing.meetingLink;
      const venueName = dto.venueName !== undefined ? dto.venueName : existing.venueName;
      const venueAddress =
        dto.venueAddress !== undefined
          ? dto.venueAddress
          : dto.physicalAddress !== undefined
            ? dto.physicalAddress
            : existing.venueAddress;

      if (locationType === EventLocationType.ONLINE) {
        if (!meetingLink || !meetingLink.trim()) {
          throw new BadRequestException('Online events require a valid Meeting Link (Zoom URL)');
        }
      } else if (locationType === EventLocationType.PHYSICAL) {
        if (!venueName?.trim() || !venueAddress?.trim()) {
          throw new BadRequestException('Physical in-person events require Venue / Hall Name and Full Physical Address');
        }
      }

      const startRaw = dto.startDateTime || dto.startDateTimeUtc || dto.startAt;
      let startDateTime = existing.startDateTime;
      if (startRaw) {
        startDateTime = new Date(startRaw);
        if (isNaN(startDateTime.getTime())) {
          throw new BadRequestException('Invalid start date and time');
        }
      }

      let endDateTime = existing.endDateTime;
      const endRaw =
        dto.endDateTime !== undefined
          ? dto.endDateTime
          : dto.endDateTimeUtc !== undefined
            ? dto.endDateTimeUtc
            : dto.endAt;
      if (endRaw !== undefined) {
        endDateTime = endRaw ? new Date(endRaw) : null;
        if (endDateTime && (isNaN(endDateTime.getTime()) || endDateTime < startDateTime)) {
          throw new BadRequestException('End date and time must be valid and after start date and time');
        }
      }

      const seatLimit =
        dto.seatLimit !== undefined
          ? dto.seatLimit
          : dto.capacity !== undefined
            ? dto.capacity
            : dto.maxRegistrations !== undefined
              ? dto.maxRegistrations
              : existing.seatLimit;

      const priceNum = dto.price !== undefined ? dto.price : dto.amount;

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
              ? meetingLink !== undefined ? meetingLink?.trim() || null : existing.meetingLink
              : null,
          venueName:
            locationType === EventLocationType.PHYSICAL
              ? venueName !== undefined ? venueName?.trim() || null : existing.venueName
              : null,
          venueAddress:
            locationType === EventLocationType.PHYSICAL
              ? venueAddress !== undefined ? venueAddress?.trim() || null : existing.venueAddress
              : null,
          price: priceNum !== undefined ? new Prisma.Decimal(Math.max(0, Number(priceNum))) : undefined,
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
      }).catch(() => { });

      return mapEvent(event, { isStaff: true });
    }

  async removeForAdmin(adminId: string, id: string, meta ?: RequestMeta) {
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
      }).catch(() => { });

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

  async refundRegistrationForAdmin(adminId: string, eventId: string, registrationId: string, reason ?: string) {
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

  async listMyRegistrations(userId: string) {
      if (!userId) return [];
      const registrations = await this.prisma.eventRegistration.findMany({
        where: { userId },
        include: {
          event: true,
        },
        orderBy: { registeredAt: 'desc' },
      });
      return registrations.map((r) => mapRegistration(r as any));
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
            <p style="margin: 0 0 16px; color: #475569; font-size: 14px;">${event.venueAddress}</p>
            <div style="text-align: center; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 16px; margin-top: 12px;">
              <p style="margin: 0 0 8px; font-weight: bold; color: #0f172a; font-size: 13px;">🎟️ Check-in QR Code</p>
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(`whatboutme://checkin/event/${event.id}/reg/${reg.id}`)}" alt="Check-in QR Code" width="160" height="160" style="display: block; margin: 0 auto; border-radius: 4px;" />
              <p style="margin: 8px 0 0; font-size: 11px; color: #64748b;">Show this QR code at the door for express attendance check-in</p>
            </div>
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
