import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logSlowApiCall } from './api';

describe('Client Slow-API Logger (logSlowApiCall)', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.restoreAllMocks();
    (process.env as any).NODE_ENV = 'development';
  });

  afterEach(() => {
    (process.env as any).NODE_ENV = originalEnv;
    vi.restoreAllMocks();
  });

  it('does NOT log anything when API call takes <= 500ms', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tableSpy = vi.spyOn(console, 'table').mockImplementation(() => {});

    logSlowApiCall('GET', '/api/users', 200, 350, []);
    logSlowApiCall('POST', '/api/programs', 201, 500, []);

    expect(warnSpy).not.toHaveBeenCalled();
    expect(tableSpy).not.toHaveBeenCalled();
  });

  it('does NOT log in production even when duration exceeds 500ms', () => {
    (process.env as any).NODE_ENV = 'production';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tableSpy = vi.spyOn(console, 'table').mockImplementation(() => {});

    logSlowApiCall('GET', '/api/users', 200, 850, []);

    expect(warnSpy).not.toHaveBeenCalled();
    expect(tableSpy).not.toHaveBeenCalled();
  });

  it('logs console.warn and console.table when API call exceeds 500ms in development', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tableSpy = vi.spyOn(console, 'table').mockImplementation(() => {});

    const headers: [string, string][] = [
      ['Server-Timing', 'db;dur=210.4, total;dur=620.1'],
      ['X-Prisma-Queries', '5'],
    ];

    logSlowApiCall('GET', 'http://localhost:4000/users', 200, 645.2, headers, 'Network');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('[Slow API Warning] GET http://localhost:4000/users took 645.2ms');

    expect(tableSpy).toHaveBeenCalledTimes(1);
    const tableRows = tableSpy.mock.calls[0]?.[0];
    expect(tableRows).toHaveLength(1);
    expect(tableRows[0]).toEqual({
      Method: 'GET',
      URL: 'http://localhost:4000/users',
      Status: 200,
      'Client Total': '645.2ms',
      'Server Total': '620.1ms',
      'Server DB': '210.4ms',
      'DB Queries': '5',
      Source: 'Network',
    });
  });

  it('handles missing Server-Timing and X-Prisma-Queries headers with fallback N/A', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tableSpy = vi.spyOn(console, 'table').mockImplementation(() => {});

    logSlowApiCall('POST', 'http://localhost:4000/reports', 201, 750, [], 'Deduplicated');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(tableSpy).toHaveBeenCalledTimes(1);
    const tableRows = tableSpy.mock.calls[0]?.[0];
    expect(tableRows).toHaveLength(1);
    expect(tableRows[0]).toEqual({
      Method: 'POST',
      URL: 'http://localhost:4000/reports',
      Status: 201,
      'Client Total': '750ms',
      'Server Total': 'N/A',
      'Server DB': 'N/A',
      'DB Queries': '-',
      Source: 'Deduplicated',
    });
  });
});
