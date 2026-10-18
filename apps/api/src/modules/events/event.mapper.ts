import {
  Event,
  EventRegistration,
  EventLocationType,
  CurrencyCode,
  EventPaymentStatus,
} from '@prisma/client';

type EventWithRelations = Event & {
  _count?: { registrations: number };
  createdBy?: { id: string; name?: string | null; email?: string | null } | null;
};

type RegistrationWithRelations = EventRegistration & {
  user?: { id: string; name?: string | null; email?: string | null } | null;
  event?: Event | null;
};

export function mapEvent(
  event: EventWithRelations,
  options?: { isStaff?: boolean; showSecretLink?: boolean; registeredByMe?: boolean },
) {
  const isPrivileged = options?.isStaff === true || options?.showSecretLink === true;
  const seatsRemaining =
    event.seatLimit !== null && event.seatLimit !== undefined
      ? Math.max(0, event.seatLimit - event.seatsBooked)
      : null;
  const isSoldOut = seatsRemaining !== null && seatsRemaining <= 0;

  return {
    id: event.id,
    title: event.title,
    slug: event.slug,
    description: event.description,
    bannerUrl: event.bannerUrl,
    startDateTime: event.startDateTime,
    endDateTime: event.endDateTime,
    timezone: event.timezone || 'UTC',

    // Location Toggle
    // CRITICAL SECURITY RULE: meetingLink and onlineMeetingLink are strictly stripped for unauthenticated/public endpoints
    locationType: event.locationType,
    meetingLink: isPrivileged && event.locationType === EventLocationType.ONLINE ? event.meetingLink : null,
    onlineMeetingLink: isPrivileged && event.locationType === EventLocationType.ONLINE ? event.meetingLink : null,
    venueName: event.locationType === EventLocationType.PHYSICAL ? event.venueName : null,
    venueAddress: event.locationType === EventLocationType.PHYSICAL ? event.venueAddress : null,
    physicalAddress: event.locationType === EventLocationType.PHYSICAL ? event.venueAddress : null,

    // Dynamic Pricing & Multi-Currency
    price: Number(event.price),
    amount: Number(event.price),
    currency: event.currency,
    seatLimit: event.seatLimit,
    capacity: event.seatLimit,
    seatsBooked: event.seatsBooked,
    seatsRemaining,
    isSoldOut,
    isPublished: event.isPublished,
    startDateTimeUtc: event.startDateTime,
    endDateTimeUtc: event.endDateTime,

    // Status & Type computation for LMS portal & public clients
    type: event.locationType === EventLocationType.ONLINE ? ('WEBINAR' as const) : ('EVENT' as const),
    status: !event.isPublished
      ? ('SCHEDULED' as const)
      : new Date(event.endDateTime ?? event.startDateTime).getTime() < Date.now()
      ? ('ENDED' as const)
      : new Date(event.startDateTime).getTime() <= Date.now()
      ? ('ONGOING' as const)
      : isSoldOut
      ? ('ENDED' as const)
      : ('REGISTRATION_OPEN' as const),

    // Backward-compatibility aliases
    startAt: event.startDateTime,
    endAt: event.endDateTime ?? event.startDateTime,
    location:
      event.locationType === EventLocationType.ONLINE
        ? 'Online Live Session'
        : [event.venueName, event.venueAddress].filter(Boolean).join(', ') || 'In-Person Venue',
    coverImageUrl: event.bannerUrl,
    maxRegistrations: event.seatLimit,
    registrationCount: event.seatsBooked,
    registeredByMe: options?.registeredByMe ?? false,

    createdById: event.createdById,
    createdBy: event.createdBy
      ? {
          id: event.createdBy.id,
          name: event.createdBy.name,
          email: event.createdBy.email,
        }
      : null,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

export function mapRegistration(registration: RegistrationWithRelations) {
  return {
    id: registration.id,
    eventId: registration.eventId,
    userId: registration.userId,
    attendeeName: registration.attendeeName,
    attendeeEmail: registration.attendeeEmail,
    attendeePhone: registration.attendeePhone,
    amount: Number(registration.amount),
    currency: registration.currency,
    paymentGateway: registration.paymentGateway,
    gatewayOrderId: registration.gatewayOrderId,
    gatewayPaymentId: registration.gatewayPaymentId,
    paymentStatus: registration.paymentStatus,
    emailSent: registration.emailSent,
    registeredAt: registration.registeredAt,
    createdAt: registration.createdAt,
    updatedAt: registration.updatedAt,

    // Backward-compatibility aliases for GSB table view
    fullName: registration.attendeeName,
    email: registration.attendeeEmail,
    phone: registration.attendeePhone,
    status: registration.paymentStatus === EventPaymentStatus.PAID ? 'CONFIRMED' : registration.paymentStatus,

    user: registration.user
      ? {
          id: registration.user.id,
          name: registration.user.name ?? registration.attendeeName,
          email: registration.user.email ?? registration.attendeeEmail,
        }
      : null,

    event: registration.event
      ? {
          id: registration.event.id,
          title: registration.event.title,
          slug: registration.event.slug,
          locationType: registration.event.locationType,
          startDateTime: registration.event.startDateTime,
        }
      : undefined,
  };
}
