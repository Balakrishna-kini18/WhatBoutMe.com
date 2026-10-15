import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import type {
  ICalendarProvider,
  BusySlot,
  CreateCalendarEventParams,
  CalendarEventDetails,
} from '../../../common/interfaces/calendar-provider.interface.js';

export interface MicrosoftGraphConfig {
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  defaultOrganizerEmail?: string;
  graphBaseUrl?: string;
}

@Injectable()
export class MicrosoftGraphCalendarProvider implements ICalendarProvider {
  private readonly logger = new Logger(MicrosoftGraphCalendarProvider.name);
  private readonly tenantId?: string;
  private readonly clientId?: string;
  private readonly clientSecret?: string;
  private readonly defaultOrganizerEmail: string;
  private readonly graphBaseUrl: string;

  private cachedAccessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(@Optional() @Inject('MICROSOFT_GRAPH_CONFIG') config?: MicrosoftGraphConfig) {
    this.tenantId =
      config?.tenantId ||
      process.env.AZURE_TENANT_ID ||
      process.env.MS_GRAPH_TENANT_ID ||
      process.env.MICROSOFT_TENANT_ID;

    this.clientId =
      config?.clientId ||
      process.env.AZURE_CLIENT_ID ||
      process.env.MS_GRAPH_CLIENT_ID ||
      process.env.MICROSOFT_CLIENT_ID;

    this.clientSecret =
      config?.clientSecret ||
      process.env.AZURE_CLIENT_SECRET ||
      process.env.MS_GRAPH_CLIENT_SECRET ||
      process.env.MICROSOFT_CLIENT_SECRET;

    this.defaultOrganizerEmail =
      config?.defaultOrganizerEmail ||
      process.env.MICROSOFT_CALENDAR_DEFAULT_EMAIL ||
      process.env.ROWEENA_OUTLOOK_EMAIL ||
      process.env.MS_CALENDAR_EMAIL ||
      'share@whatboutme.com';

    this.graphBaseUrl = config?.graphBaseUrl || 'https://graph.microsoft.com/v1.0';

    if (!this.isConfigured()) {
      if (process.env.NODE_ENV === 'production' && process.env.ALLOW_CALENDAR_MOCK !== 'true') {
        this.logger.error(
          'CRITICAL: Microsoft Graph Calendar credentials (AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET) are missing in PRODUCTION. Set environment variables or configure ALLOW_CALENDAR_MOCK=true to suppress.',
        );
      } else {
        this.logger.warn(
          'Microsoft Graph Calendar credentials (AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET) are not configured. Running in fallback/mock mode.',
        );
      }
    } else {
      this.logger.log('Microsoft Graph Calendar Provider initialized with Azure AD credentials.');
    }
  }

  /**
   * Returns true if all required Azure AD / MS Graph credentials are present.
   */
  public isConfigured(): boolean {
    return Boolean(this.tenantId && this.clientId && this.clientSecret);
  }

  /**
   * Resolves the target calendar owner / organizer email.
   */
  private resolveOrganizer(providedEmail?: string): string {
    return (providedEmail && providedEmail.trim()) || this.defaultOrganizerEmail;
  }

  /**
   * Fetches an application access token from Microsoft identity platform via OAuth 2.0 client credentials grant.
   */
  private async getAccessToken(): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('Microsoft Graph credentials are not configured.');
    }

    const now = Date.now();
    // Re-use cached token if still valid for at least 60 seconds
    if (this.cachedAccessToken && this.tokenExpiresAt > now + 60_000) {
      return this.cachedAccessToken;
    }

    const tokenUrl = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;
    const params = new URLSearchParams();
    params.append('client_id', this.clientId!);
    params.append('client_secret', this.clientSecret!);
    params.append('grant_type', 'client_credentials');
    params.append('scope', 'https://graph.microsoft.com/.default');

    const res = await this.executeFetchWithRetry(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      this.logger.error(`Azure AD token acquisition failed: ${res.status} ${errBody}`);
      throw new Error(`Azure AD token acquisition failed with status ${res.status}`);
    }

    const data = await res.json();
    this.cachedAccessToken = data.access_token;
    // Calculate expiration timestamp (default to 3500 seconds if not specified)
    const expiresInSec = typeof data.expires_in === 'number' ? data.expires_in : 3600;
    this.tokenExpiresAt = Date.now() + expiresInSec * 1000;

    return this.cachedAccessToken!;
  }

  /**
   * Executes fetch with exponential backoff on HTTP 429 and 503.
   */
  private async executeFetchWithRetry(
    url: string,
    options: RequestInit,
    retries = 3,
  ): Promise<Response> {
    let attempt = 0;
    while (attempt <= retries) {
      try {
        const response = await fetch(url, options);

        if ((response.status === 429 || response.status === 503) && attempt < retries) {
          const retryAfterHeader = response.headers.get('Retry-After');
          const delayMs = retryAfterHeader
            ? parseInt(retryAfterHeader, 10) * 1000
            : Math.pow(2, attempt) * 500;
          this.logger.warn(
            `Microsoft Graph API transient status ${response.status}. Retrying in ${delayMs}ms (attempt ${attempt + 1}/${retries})...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          attempt++;
          continue;
        }

        return response;
      } catch (networkErr: any) {
        if (attempt < retries) {
          const delayMs = Math.pow(2, attempt) * 500;
          this.logger.warn(
            `Network error calling Microsoft Graph: ${networkErr.message}. Retrying in ${delayMs}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          attempt++;
          continue;
        }
        throw networkErr;
      }
    }

    throw new Error(`Microsoft Graph request failed after ${retries} retries`);
  }

  /**
   * Fetches busy time slots for a host/organizer in Microsoft Outlook within a given time range.
   * Calls POST /users/{id|userPrincipalName}/calendar/getSchedule
   */
  async getBusySlots(
    organizerEmail: string,
    startTime: Date,
    endTime: Date,
  ): Promise<BusySlot[]> {
    const targetEmail = this.resolveOrganizer(organizerEmail);

    if (!this.isConfigured()) {
      this.logger.debug(
        `[Fallback] getBusySlots for ${targetEmail} (${startTime.toISOString()} - ${endTime.toISOString()}) returning empty list.`,
      );
      return [];
    }

    try {
      const token = await this.getAccessToken();
      const url = `${this.graphBaseUrl}/users/${encodeURIComponent(targetEmail)}/calendar/getSchedule`;

      const requestBody = {
        schedules: [targetEmail],
        startTime: {
          dateTime: startTime.toISOString(),
          timeZone: 'UTC',
        },
        endTime: {
          dateTime: endTime.toISOString(),
          timeZone: 'UTC',
        },
        availabilityViewInterval: 15,
      };

      const res = await this.executeFetchWithRetry(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'outlook.timezone="UTC"',
        },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        this.logger.error(
          `Microsoft Graph getSchedule error: status ${res.status} - ${errorText}`,
        );
        throw new Error(`Microsoft Graph getSchedule failed with status ${res.status}`);
      }

      const data = await res.json();
      const busySlots: BusySlot[] = [];

      if (Array.isArray(data.value)) {
        for (const schedule of data.value) {
          if (Array.isArray(schedule.scheduleItems)) {
            for (const item of schedule.scheduleItems) {
              // Status can be: 'free', 'tentative', 'busy', 'oof', 'workingElsewhere', 'unknown'
              if (item.status && item.status.toLowerCase() !== 'free') {
                const itemStart = new Date(
                  item.start.dateTime.endsWith('Z')
                    ? item.start.dateTime
                    : `${item.start.dateTime}Z`,
                );
                const itemEnd = new Date(
                  item.end.dateTime.endsWith('Z')
                    ? item.end.dateTime
                    : `${item.end.dateTime}Z`,
                );
                busySlots.push({
                  startTime: itemStart,
                  endTime: itemEnd,
                  title: item.subject || 'Busy',
                });
              }
            }
          }
        }
      }

      return busySlots;
    } catch (err: any) {
      this.logger.error(`Failed to get Outlook busy slots for ${targetEmail}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Creates a calendar event on the host's Outlook calendar.
   * Calls POST /users/{id|userPrincipalName}/calendar/events
   */
  async createEvent(params: CreateCalendarEventParams): Promise<CalendarEventDetails> {
    const targetEmail = this.resolveOrganizer(params.organizerEmail);

    if (!this.isConfigured()) {
      const simulatedId = `ms-mock-event-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      this.logger.debug(
        `[Fallback] createEvent for ${targetEmail}: "${params.subject}" -> simulated ID: ${simulatedId}`,
      );
      return {
        id: simulatedId,
        webLink: `https://outlook.office.com/calendar/item/${simulatedId}`,
      };
    }

    try {
      const token = await this.getAccessToken();
      const url = `${this.graphBaseUrl}/users/${encodeURIComponent(targetEmail)}/calendar/events`;

      const attendees = (params.attendees || []).map((email) => ({
        emailAddress: {
          address: email.trim(),
          name: email.trim(),
        },
        type: 'required',
      }));

      const payload: Record<string, any> = {
        subject: params.subject,
        body: {
          contentType: 'HTML',
          content: params.body || `<p>${params.subject}</p>`,
        },
        start: {
          dateTime: params.startTime.toISOString(),
          timeZone: params.timezone || 'UTC',
        },
        end: {
          dateTime: params.endTime.toISOString(),
          timeZone: params.timezone || 'UTC',
        },
        location: {
          displayName: params.location || 'Online Session (WhatBoutMe)',
        },
        attendees,
        isOnlineMeeting: false,
        reminderMinutesBeforeStart: 15,
        isReminderOn: true,
      };

      if (params.sessionId || params.id) {
        payload.transactionId = params.sessionId || params.id;
      }

      const res = await this.executeFetchWithRetry(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'outlook.timezone="UTC"',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        this.logger.error(
          `Microsoft Graph createEvent error: status ${res.status} - ${errorText}`,
        );
        throw new Error(`Microsoft Graph createEvent failed with status ${res.status}`);
      }

      const data = await res.json();
      return {
        id: data.id,
        webLink: data.webLink,
      };
    } catch (err: any) {
      this.logger.error(`Failed to create Outlook event for ${targetEmail}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Resolves a Microsoft Graph event ID from either a native Graph ID or an LMS sessionId (via transactionId).
   */
  private async resolveGraphEventId(targetEmail: string, eventIdOrSessionId: string): Promise<string> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventIdOrSessionId);
    if (!isUuid) {
      return eventIdOrSessionId;
    }

    try {
      const token = await this.getAccessToken();
      const filter = encodeURIComponent(`transactionId eq '${eventIdOrSessionId}'`);
      const url = `${this.graphBaseUrl}/users/${encodeURIComponent(targetEmail)}/calendar/events?$filter=${filter}&$select=id,transactionId`;

      const res = await this.executeFetchWithRetry(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.value) && data.value.length > 0 && data.value[0]?.id) {
          return data.value[0].id;
        }
      }
    } catch (err: any) {
      this.logger.debug(`Could not resolve transactionId ${eventIdOrSessionId} via Graph filter: ${err.message}`);
    }

    return eventIdOrSessionId;
  }

  /**
   * Updates an existing Outlook calendar event.
   * Calls PATCH /users/{id|userPrincipalName}/calendar/events/{id}
   */
  async updateEvent(
    eventId: string,
    params: Partial<CreateCalendarEventParams>,
  ): Promise<CalendarEventDetails> {
    const targetEmail = this.resolveOrganizer(params.organizerEmail);

    if (!this.isConfigured() || eventId.startsWith('ms-mock-event-')) {
      this.logger.debug(`[Fallback] updateEvent for ${eventId}: "${params.subject}"`);
      return {
        id: eventId,
        webLink: `https://outlook.office.com/calendar/item/${eventId}`,
      };
    }

    try {
      const token = await this.getAccessToken();
      const graphEventId = await this.resolveGraphEventId(targetEmail, eventId);
      const url = `${this.graphBaseUrl}/users/${encodeURIComponent(targetEmail)}/calendar/events/${graphEventId}`;

      const payload: Record<string, any> = {};

      if (params.subject) payload.subject = params.subject;
      if (params.body) {
        payload.body = { contentType: 'HTML', content: params.body };
      }
      if (params.startTime) {
        payload.start = {
          dateTime: params.startTime.toISOString(),
          timeZone: params.timezone || 'UTC',
        };
      }
      if (params.endTime) {
        payload.end = {
          dateTime: params.endTime.toISOString(),
          timeZone: params.timezone || 'UTC',
        };
      }
      if (params.location) {
        payload.location = { displayName: params.location };
      }
      if (params.attendees) {
        payload.attendees = params.attendees.map((email) => ({
          emailAddress: { address: email.trim(), name: email.trim() },
          type: 'required',
        }));
      }

      const res = await this.executeFetchWithRetry(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'outlook.timezone="UTC"',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        this.logger.error(
          `Microsoft Graph updateEvent error: status ${res.status} - ${errorText}`,
        );
        throw new Error(`Microsoft Graph updateEvent failed with status ${res.status}`);
      }

      const data = await res.json();
      return {
        id: data.id,
        webLink: data.webLink,
      };
    } catch (err: any) {
      this.logger.error(`Failed to update Outlook event ${eventId}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Deletes an event from Outlook calendar.
   * Calls DELETE /users/{id|userPrincipalName}/calendar/events/{id}
   */
  async deleteEvent(eventId: string, organizerEmail?: string): Promise<void> {
    const targetEmail = this.resolveOrganizer(organizerEmail);

    if (!this.isConfigured() || eventId.startsWith('ms-mock-event-')) {
      this.logger.debug(`[Fallback] deleteEvent for ${eventId}`);
      return;
    }

    try {
      const token = await this.getAccessToken();
      const graphEventId = await this.resolveGraphEventId(targetEmail, eventId);
      const url = `${this.graphBaseUrl}/users/${encodeURIComponent(targetEmail)}/calendar/events/${graphEventId}`;

      const res = await this.executeFetchWithRetry(url, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok && res.status !== 404) {
        const errorText = await res.text().catch(() => '');
        this.logger.error(
          `Microsoft Graph deleteEvent error: status ${res.status} - ${errorText}`,
        );
        throw new Error(`Microsoft Graph deleteEvent failed with status ${res.status}`);
      }

      this.logger.log(`Successfully deleted Outlook calendar event ${eventId}`);
    } catch (err: any) {
      this.logger.error(`Failed to delete Outlook event ${eventId}: ${err.message}`);
      throw err;
    }
  }
}
