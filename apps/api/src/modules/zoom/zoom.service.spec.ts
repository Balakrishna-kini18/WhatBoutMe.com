import { Test, TestingModule } from '@nestjs/testing';
import { ZoomMeetingProvider } from './zoom.service.js';
import { HttpException, HttpStatus } from '@nestjs/common';
import { vi, describe, beforeAll, beforeEach, afterEach, it, expect } from 'vitest';

describe('ZoomMeetingProvider (D1-047)', () => {
  let provider: ZoomMeetingProvider;
  
  const MOCK_CREDENTIALS = {
    ZOOM_ACCOUNT_ID: 'mock-account-id',
    ZOOM_CLIENT_ID: 'mock-client-id',
    ZOOM_CLIENT_SECRET: 'mock-client-secret',
  };

  const MOCK_TOKEN_RESPONSE = {
    access_token: 'mock-token',
    expires_in: 3599,
  };

  const MOCK_MEETING_RESPONSE = {
    id: 123456789,
    join_url: 'https://zoom.us/j/123456789',
    start_url: 'https://zoom.us/s/123456789',
    password: 'mock-password',
  };

  let getAccessTokenSpy: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ZoomMeetingProvider],
    }).compile();

    provider = module.get<ZoomMeetingProvider>(ZoomMeetingProvider);
    // Suppress internal logging for clean test output
    vi.spyOn(provider['logger'], 'log').mockImplementation(() => {});
    vi.spyOn(provider['logger'], 'warn').mockImplementation(() => {});
    vi.spyOn(provider['logger'], 'error').mockImplementation(() => {});
    vi.spyOn(provider['logger'], 'debug').mockImplementation(() => {});
  });

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv, ...MOCK_CREDENTIALS };

    // Reset private fields
    (provider as any).accessToken = null;
    (provider as any).tokenExpiresAt = null;

    // Mock global fetch
    global.fetch = vi.fn() as any;
    
    // Mock getAccessToken directly to decouple token logic from meeting API logic
    getAccessTokenSpy = vi.spyOn(provider as any, 'getAccessToken').mockResolvedValue('mock-token');
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('1. Zoom meeting creation succeeds', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => MOCK_MEETING_RESPONSE,
    });

    const result = await provider.createMeeting({
      topic: 'Test Topic',
      startTime: new Date('2026-11-15T10:00:00Z'),
      durationMinutes: 60,
      timezone: 'UTC',
    });

    expect(result.id).toBe('123456789');
    expect(result.joinUrl).toBe('https://zoom.us/j/123456789');
    expect(result.startUrl).toBe('https://zoom.us/s/123456789');
    expect(result.password).toBe('mock-password');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/users/me/meetings'), expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('Test Topic'),
    }));
  });

  it('Zoom CREATE idempotency: uses existing meeting if referenceId matches agenda', async () => {
    (global.fetch as any)
      // First fetch: get upcoming meetings
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          meetings: [
            { id: 987654321, agenda: 'outbox-123' },
          ],
        }),
      })
      // Second fetch: get meeting details
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 987654321,
          join_url: 'https://zoom.us/j/987654321',
          start_url: 'https://zoom.us/s/987654321',
          password: 'recovered-password',
        }),
      });

    const result = await provider.createMeeting({
      topic: 'Test Topic',
      startTime: new Date('2026-11-15T10:00:00Z'),
      durationMinutes: 60,
      timezone: 'UTC',
      referenceId: 'outbox-123',
    });

    expect(result.id).toBe('987654321');
    expect(result.joinUrl).toBe('https://zoom.us/j/987654321');
    expect(result.password).toBe('recovered-password');

    // Should not have called POST /users/me/meetings
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/users/me/meetings?type=scheduled'), expect.anything());
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/meetings/987654321'), expect.objectContaining({ method: 'GET' }));
  });

  it('Zoom CREATE idempotency: paginates through meetings until matching referenceId is found', async () => {
    (global.fetch as any)
      // First page of meetings (no match, has next_page_token)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          next_page_token: 'page-2-token',
          meetings: [
            { id: 111, agenda: 'other-1' },
          ],
        }),
      })
      // Second page of meetings (match found!)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          next_page_token: 'page-3-token',
          meetings: [
            { id: 222, agenda: 'other-2' },
            { id: 987654321, agenda: 'outbox-123' },
          ],
        }),
      })
      // Third fetch: get meeting details for the match
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 987654321,
          join_url: 'https://zoom.us/j/987654321',
          start_url: 'https://zoom.us/s/987654321',
          password: 'recovered-password',
        }),
      });

    const result = await provider.createMeeting({
      topic: 'Test Topic',
      startTime: new Date('2026-11-15T10:00:00Z'),
      durationMinutes: 60,
      timezone: 'UTC',
      referenceId: 'outbox-123',
    });

    expect(result.id).toBe('987654321');

    // Should have called GET list meetings twice (page 1, page 2) and GET details once. NO POST.
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(global.fetch).toHaveBeenNthCalledWith(1, expect.stringMatching(/\/users\/me\/meetings\?type=scheduled&page_size=300$/), expect.anything());
    expect(global.fetch).toHaveBeenNthCalledWith(2, expect.stringMatching(/\/users\/me\/meetings\?type=scheduled&page_size=300&next_page_token=page-2-token$/), expect.anything());
    expect(global.fetch).toHaveBeenNthCalledWith(3, expect.stringContaining('/meetings/987654321'), expect.objectContaining({ method: 'GET' }));
  });


  it('4. Zoom provider failure does not create a fake meeting', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 502,
      text: async () => 'Zoom server error',
    });

    await expect(
      provider.createMeeting({
        topic: 'Test Topic',
        startTime: new Date(),
        durationMinutes: 60,
      })
    ).rejects.toThrow(HttpException);
  });

  it('5. Missing Zoom configuration fails safely', async () => {
    // For this test, restore the original getAccessToken so it actually tests the config check
    getAccessTokenSpy.mockRestore();

    delete process.env.ZOOM_ACCOUNT_ID;
    delete process.env.ZOOM_CLIENT_ID;
    delete process.env.ZOOM_CLIENT_SECRET;

    await expect(
      provider.createMeeting({
        topic: 'Test Topic',
        startTime: new Date(),
        durationMinutes: 60,
      })
    ).rejects.toThrow('Zoom credentials are not fully configured in the environment.');
  });

  it('9. Session cancellation handles provider state correctly', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 204, // No Content
    });

    await expect(provider.cancelMeeting('123456789')).resolves.not.toThrow();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/meetings/123456789'), expect.objectContaining({
      method: 'DELETE',
    }));
  });

  it('10. Session rescheduling handles provider state correctly', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 204, // No Content
    });

    await expect(
      provider.updateMeeting('123456789', {
        topic: 'Updated Topic',
        startTime: new Date(),
        durationMinutes: 120,
      })
    ).resolves.not.toThrow();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/meetings/123456789'), expect.objectContaining({
      method: 'PATCH',
      body: expect.stringContaining('Updated Topic'),
    }));
  });
});
