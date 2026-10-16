import {
  Event,
  EventRegistration,
  EventRegistrationStatus,
  EventStatus,
  EventType,
  ParticipantCategory,
  User,
} from '@prisma/client';

type EventWithCount = Event & {
  _count?: { registrations: number };
  createdBy?: { id: string; name?: string | null; email?: string | null } | null;
};

type RegistrationWithUser = EventRegistration & {
  user?: { id: string; name?: string | null; email?: string | null } | null;
};

export function mapEvent(
  event: EventWithCount,
  options?: { registeredByMe?: boolean },
) {
  return {
    id: event.id,
    type: event.type,
    title: event.title,
    description: event.description,
    status: event.status,
    startAt: event.startAt,
    endAt: event.endAt,
    location: event.location,
    meetingLink: event.meetingLink,
    coverImageUrl: event.coverImageUrl,
    maxRegistrations: event.maxRegistrations,
    registrationOpensAt: event.registrationOpensAt,
    registrationClosesAt: event.registrationClosesAt,
    registrationCount: event._count?.registrations ?? 0,
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

export function mapRegistration(registration: RegistrationWithUser) {
  return {
    id: registration.id,
    eventId: registration.eventId,
    userId: registration.userId,
    fullName: registration.fullName,
    email: registration.email,
    phone: registration.phone,
    category: registration.category,
    categoryOther: registration.categoryOther,
    organization: registration.organization,
    city: registration.city,
    status: registration.status ?? EventRegistrationStatus.CONFIRMED,
    rejectedAt: registration.rejectedAt,
    rejectionReason: registration.rejectionReason,
    createdAt: registration.createdAt,
    updatedAt: registration.updatedAt,
    user: registration.user
      ? {
          id: registration.user.id,
          name: registration.user.name ?? registration.fullName,
          email: registration.user.email ?? registration.email,
        }
      : null,
  };
}

export const PARTICIPANT_CATEGORY_LABELS: Record<ParticipantCategory, string> = {
  STUDENT: 'Student',
  ENTREPRENEUR: 'Entrepreneur',
  STARTUP_FOUNDER: 'Startup Founder',
  ASPIRING_FOUNDER: 'Aspiring Founder',
  PROFESSIONAL: 'Working Professional',
  RESEARCHER: 'Researcher',
  ACADEMIC_FACULTY: 'Academic / Faculty',
  INVESTOR: 'Investor',
  CONSULTANT: 'Consultant',
  FREELANCER: 'Freelancer',
  JOB_SEEKER: 'Job Seeker',
  CORPORATE_EMPLOYEE: 'Corporate Employee',
  NGO_WORKER: 'NGO / Social Sector',
  GOVERNMENT_OFFICIAL: 'Government Official',
  HOMEMAKER: 'Homemaker',
  RETIRED: 'Retired',
  OTHER: 'Other',
};

export function eventTypeLabel(type: EventType) {
  return type === EventType.EVENT ? 'Event' : 'Webinar';
}

export function eventStatusLabel(status: EventStatus) {
  const labels: Record<EventStatus, string> = {
    SCHEDULED: 'Scheduled',
    REGISTRATION_OPEN: 'Registration Open',
    ONGOING: 'Ongoing',
    ENDED: 'Ended',
    CANCELLED: 'Cancelled',
  };
  return labels[status] ?? status;
}
