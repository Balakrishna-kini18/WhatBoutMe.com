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
   * Deletes or cancels a calendar event.
   */
  deleteEvent(eventId: string): Promise<void>;
}

export const CALENDAR_PROVIDER = 'CALENDAR_PROVIDER';
