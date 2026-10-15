import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MicrosoftGraphCalendarProvider } from './microsoft-graph.provider.js';

describe('MicrosoftGraphCalendarProvider', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('Unconfigured fallback behavior', () => {
    it('initializes safely when credentials are missing', () => {
      const provider = new MicrosoftGraphCalendarProvider({});
      expect(provider.isConfigured()).toBe(false);
    });

    it('returns empty busy slots in unconfigured fallback mode', async () => {
      const provider = new MicrosoftGraphCalendarProvider({});
      const slots = await provider.getBusySlots(
        'coach@whatboutme.com',
        new Date('2026-10-15T10:00:00Z'),
        new Date('2026-10-15T11:00:00Z'),
      );
      expect(slots).toEqual([]);
    });

    it('creates simulated event details in unconfigured fallback mode', async () => {
      const provider = new MicrosoftGraphCalendarProvider({});
      const event = await provider.createEvent({
        subject: '1:1 Coaching with Roweena',
        startTime: new Date('2026-10-15T10:00:00Z'),
        endTime: new Date('2026-10-15T11:00:00Z'),
        attendees: ['learner@test.com'],
      });
      expect(event.id).toMatch(/^ms-mock-event-/);
      expect(event.webLink).toContain(event.id);
    });

    it('deletes simulated event safely in unconfigured fallback mode', async () => {
      const provider = new MicrosoftGraphCalendarProvider({});
      await expect(
        provider.deleteEvent('ms-mock-event-12345', 'coach@whatboutme.com'),
      ).resolves.toBeUndefined();
    });
  });

  describe('Configured Microsoft Graph operations', () => {
    const config = {
      tenantId: 'mock-tenant-id',
      clientId: 'mock-client-id',
      clientSecret: 'mock-client-secret',
      defaultOrganizerEmail: 'roweenabritto@whatboutme.com',
    };

    const mockTokenResponse = {
      token_type: 'Bearer',
      expires_in: 3600,
      access_token: 'mock-access-token-123',
    };

    it('acquires and caches Bearer token from Azure AD', async () => {
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/oauth2/v2.0/token')) {
          return Promise.resolve(new Response(JSON.stringify(mockTokenResponse), { status: 200 }));
        }
        if (url.includes('/getSchedule')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                value: [
                  {
                    scheduleId: 'roweenabritto@whatboutme.com',
                    scheduleItems: [],
                  },
                ],
              }),
              { status: 200 },
            ),
          );
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });
      global.fetch = fetchMock;

      const provider = new MicrosoftGraphCalendarProvider(config);
      expect(provider.isConfigured()).toBe(true);

      const slots = await provider.getBusySlots(
        'roweenabritto@whatboutme.com',
        new Date('2026-10-15T10:00:00Z'),
        new Date('2026-10-15T11:00:00Z'),
      );

      expect(slots).toEqual([]);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://login.microsoftonline.com/mock-tenant-id/oauth2/v2.0/token',
        expect.objectContaining({ method: 'POST' }),
      );

      // Subsequent call should reuse cached token
      await provider.getBusySlots(
        'roweenabritto@whatboutme.com',
        new Date('2026-10-15T12:00:00Z'),
        new Date('2026-10-15T13:00:00Z'),
      );
      // Token endpoint should have only been called once
      const tokenCalls = fetchMock.mock.calls.filter((c) =>
        (c[0] as string).includes('/oauth2/v2.0/token'),
      );
      expect(tokenCalls.length).toBe(1);
    });

    it('queries and parses Outlook busy slots correctly', async () => {
      const scheduleResponse = {
        value: [
          {
            scheduleId: 'roweenabritto@whatboutme.com',
            scheduleItems: [
              {
                status: 'busy',
                subject: 'Existing Board Meeting',
                start: { dateTime: '2026-10-15T10:15:00', timeZone: 'UTC' },
                end: { dateTime: '2026-10-15T10:45:00', timeZone: 'UTC' },
              },
              {
                status: 'free',
                subject: 'Available Time',
                start: { dateTime: '2026-10-15T11:00:00', timeZone: 'UTC' },
                end: { dateTime: '2026-10-15T12:00:00', timeZone: 'UTC' },
              },
            ],
          },
        ],
      };

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/oauth2/v2.0/token')) {
          return Promise.resolve(new Response(JSON.stringify(mockTokenResponse), { status: 200 }));
        }
        if (url.includes('/getSchedule')) {
          return Promise.resolve(new Response(JSON.stringify(scheduleResponse), { status: 200 }));
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      const provider = new MicrosoftGraphCalendarProvider(config);
      const slots = await provider.getBusySlots(
        'roweenabritto@whatboutme.com',
        new Date('2026-10-15T10:00:00Z'),
        new Date('2026-10-15T12:00:00Z'),
      );

      expect(slots).toHaveLength(1);
      expect(slots[0].title).toBe('Existing Board Meeting');
      expect(slots[0].startTime.toISOString()).toBe('2026-10-15T10:15:00.000Z');
      expect(slots[0].endTime.toISOString()).toBe('2026-10-15T10:45:00.000Z');
    });

    it('creates an Outlook calendar event with attendees', async () => {
      const eventResponse = {
        id: 'ms-graph-event-abc123',
        webLink: 'https://outlook.office.com/calendar/item/ms-graph-event-abc123',
      };

      let capturedPayload: any = null;

      global.fetch = vi.fn().mockImplementation((url: string, opts: RequestInit) => {
        if (url.includes('/oauth2/v2.0/token')) {
          return Promise.resolve(new Response(JSON.stringify(mockTokenResponse), { status: 200 }));
        }
        if (url.includes('/calendar/events')) {
          capturedPayload = JSON.parse(opts.body as string);
          return Promise.resolve(new Response(JSON.stringify(eventResponse), { status: 201 }));
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      const provider = new MicrosoftGraphCalendarProvider(config);
      const result = await provider.createEvent({
        subject: '11 Steps Welcome Call - Batch 1',
        body: '<p>Join link: https://zoom.us/j/12345</p>',
        startTime: new Date('2026-10-20T09:00:00Z'),
        endTime: new Date('2026-10-20T10:00:00Z'),
        location: 'Zoom Meeting',
        attendees: ['learner1@whatboutme.com', 'learner2@whatboutme.com'],
      });

      expect(result.id).toBe('ms-graph-event-abc123');
      expect(result.webLink).toBe('https://outlook.office.com/calendar/item/ms-graph-event-abc123');
      expect(capturedPayload.subject).toBe('11 Steps Welcome Call - Batch 1');
      expect(capturedPayload.attendees).toHaveLength(2);
      expect(capturedPayload.attendees[0].emailAddress.address).toBe('learner1@whatboutme.com');
    });

    it('updates an existing Outlook calendar event', async () => {
      const updatedResponse = {
        id: 'ms-graph-event-abc123',
        webLink: 'https://outlook.office.com/calendar/item/ms-graph-event-abc123',
      };

      let capturedMethod = '';
      let capturedPayload: any = null;

      global.fetch = vi.fn().mockImplementation((url: string, opts: RequestInit) => {
        if (url.includes('/oauth2/v2.0/token')) {
          return Promise.resolve(new Response(JSON.stringify(mockTokenResponse), { status: 200 }));
        }
        if (url.includes('/calendar/events/ms-graph-event-abc123')) {
          capturedMethod = opts.method || 'GET';
          capturedPayload = JSON.parse(opts.body as string);
          return Promise.resolve(new Response(JSON.stringify(updatedResponse), { status: 200 }));
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      const provider = new MicrosoftGraphCalendarProvider(config);
      const res = await provider.updateEvent('ms-graph-event-abc123', {
        subject: 'Rescheduled: 11 Steps Welcome Call',
        startTime: new Date('2026-10-21T10:00:00Z'),
        endTime: new Date('2026-10-21T11:00:00Z'),
      });

      expect(capturedMethod).toBe('PATCH');
      expect(capturedPayload.subject).toBe('Rescheduled: 11 Steps Welcome Call');
      expect(res.id).toBe('ms-graph-event-abc123');
    });

    it('deletes an Outlook calendar event', async () => {
      let capturedMethod = '';

      global.fetch = vi.fn().mockImplementation((url: string, opts: RequestInit) => {
        if (url.includes('/oauth2/v2.0/token')) {
          return Promise.resolve(new Response(JSON.stringify(mockTokenResponse), { status: 200 }));
        }
        if (url.includes('/calendar/events/ms-graph-event-abc123')) {
          capturedMethod = opts.method || 'GET';
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      const provider = new MicrosoftGraphCalendarProvider(config);
      await expect(
        provider.deleteEvent('ms-graph-event-abc123', 'roweenabritto@whatboutme.com'),
      ).resolves.toBeUndefined();
      expect(capturedMethod).toBe('DELETE');
    });

    it('retries on HTTP 429 rate-limiting with Retry-After header', async () => {
      let callCount = 0;

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/oauth2/v2.0/token')) {
          return Promise.resolve(new Response(JSON.stringify(mockTokenResponse), { status: 200 }));
        }
        if (url.includes('/getSchedule')) {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve(
              new Response('Rate limited', {
                status: 429,
                headers: { 'Retry-After': '0' },
              }),
            );
          }
          return Promise.resolve(
            new Response(
              JSON.stringify({
                value: [{ scheduleId: 'roweenabritto@whatboutme.com', scheduleItems: [] }],
              }),
              { status: 200 },
            ),
          );
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      const provider = new MicrosoftGraphCalendarProvider(config);
      const slots = await provider.getBusySlots(
        'roweenabritto@whatboutme.com',
        new Date('2026-10-15T10:00:00Z'),
        new Date('2026-10-15T11:00:00Z'),
      );

      expect(slots).toEqual([]);
      expect(callCount).toBe(2);
    });

    it('sets transactionId on createEvent when sessionId is provided', async () => {
      let capturedPayload: any = null;

      global.fetch = vi.fn().mockImplementation((url: string, opts: RequestInit) => {
        if (url.includes('/oauth2/v2.0/token')) {
          return Promise.resolve(new Response(JSON.stringify(mockTokenResponse), { status: 200 }));
        }
        if (url.includes('/calendar/events')) {
          capturedPayload = JSON.parse(opts.body as string);
          return Promise.resolve(
            new Response(
              JSON.stringify({
                id: 'ms-graph-event-111',
                webLink: 'https://outlook.office.com/calendar/item/ms-graph-event-111',
              }),
              { status: 201 },
            ),
          );
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      const provider = new MicrosoftGraphCalendarProvider(config);
      await provider.createEvent({
        sessionId: 'test-session-uuid-12345',
        subject: '1:1 Coaching',
        startTime: new Date('2026-10-22T10:00:00Z'),
        endTime: new Date('2026-10-22T11:00:00Z'),
      });

      expect(capturedPayload.transactionId).toBe('test-session-uuid-12345');
    });

    it('resolves graph event ID via transactionId filter when UUID is passed to deleteEvent', async () => {
      const deleteCalls: string[] = [];

      global.fetch = vi.fn().mockImplementation((url: string, opts: RequestInit) => {
        if (url.includes('/oauth2/v2.0/token')) {
          return Promise.resolve(new Response(JSON.stringify(mockTokenResponse), { status: 200 }));
        }
        if (url.includes('transactionId')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                value: [{ id: 'resolved-graph-event-id-999' }],
              }),
              { status: 200 },
            ),
          );
        }
        if (url.includes('/calendar/events/resolved-graph-event-id-999')) {
          deleteCalls.push(opts.method || 'GET');
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      const provider = new MicrosoftGraphCalendarProvider(config);
      await provider.deleteEvent('b65ef3c5-926d-495f-9e79-88c9df4950ea', 'share@whatboutme.com');

      expect(deleteCalls).toEqual(['DELETE']);
    });
  });
});
