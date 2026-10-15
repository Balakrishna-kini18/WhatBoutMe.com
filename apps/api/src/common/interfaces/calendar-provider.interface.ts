export interface BusySlot {
  startTime: Date;
  endTime: Date;
  title?: string;
}

export interface CreateCalendarEventParams {
  subject: string;
  body?: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  attendees?: string[];
  timezone?: string;
  organizerEmail?: string;
  sessionId?: string;
  id?: string;
}

export interface CalendarEventDetails {
  id: string;
  webLink?: string;
}

export interface ICalendarProvider {
  /**
   * Fetches busy time slots for a host/organizer within a given time range.
   */
  getBusySlots(organizerEmail: string, startTime: Date, endTime: Date): Promise<BusySlot[]>;

  /**
   * Creates a calendar event on the external calendar service.
   */
  createEvent(params: CreateCalendarEventParams): Promise<CalendarEventDetails>;

  /**
   * Updates an existing calendar event on the external calendar service.
   */
  updateEvent?(eventId: string, params: Partial<CreateCalendarEventParams>): Promise<CalendarEventDetails>;

  /**
   * Deletes or cancels a calendar event.
   */
  deleteEvent(eventId: string, organizerEmail?: string): Promise<void>;
}

export const CALENDAR_PROVIDER = 'CALENDAR_PROVIDER';
