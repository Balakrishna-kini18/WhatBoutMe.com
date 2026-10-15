import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ServerTimingMiddleware } from './server-timing.middleware.js';
import { recordDbDuration, requestTimingStorage } from '../timing/server-timing.storage.js';

describe('ServerTimingMiddleware', () => {
  let middleware: ServerTimingMiddleware;

  beforeEach(() => {
    middleware = new ServerTimingMiddleware();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createMockReqRes = (url = '/api/v1/test', method = 'GET') => {
    const headers = new Map<string, string>();
    const req = {
      url,
      originalUrl: url,
      method,
    } as any;

    const res = {
      getHeader: vi.fn((name: string) => headers.get(name) || null),
      setHeader: vi.fn((name: string, value: string) => {
        headers.set(name, value);
      }),
      writeHead: vi.fn(function (this: any) {
        return this;
      }),
      end: vi.fn(function (this: any) {
        return this;
      }),
    } as any;

    return { req, res, headers };
  };

  it('sets Server-Timing header on res.end with db and total duration', () => {
    const { req, res, headers } = createMockReqRes();

    let calledNext = false;
    middleware.use(req, res, () => {
      calledNext = true;
      recordDbDuration(14.5);
      res.end();
    });

    expect(calledNext).toBe(true);
    expect(res.setHeader).toHaveBeenCalled();
    const serverTiming = headers.get('Server-Timing');
    expect(serverTiming).toBeDefined();
    expect(serverTiming).toMatch(/db;dur=14\.5, total;dur=[\d.]+/);
  });

  it('sets Server-Timing header on res.writeHead when writeHead is called before end', () => {
    const { req, res, headers } = createMockReqRes();

    middleware.use(req, res, () => {
      recordDbDuration(25.2);
      res.writeHead(200);
      res.end();
    });

    const serverTiming = headers.get('Server-Timing');
    expect(serverTiming).toBeDefined();
    expect(serverTiming).toMatch(/db;dur=25\.2, total;dur=[\d.]+/);
  });

  it('preserves existing Server-Timing header if already present', () => {
    const { req, res, headers } = createMockReqRes();
    headers.set('Server-Timing', 'cache;desc="HIT"');

    middleware.use(req, res, () => {
      recordDbDuration(5);
      res.end();
    });

    const serverTiming = headers.get('Server-Timing');
    expect(serverTiming).toContain('cache;desc="HIT"');
    expect(serverTiming).toContain('db;dur=5, total;dur=');
  });

  it('logs a warning when request total duration exceeds 300ms', () => {
    const { req, res } = createMockReqRes('/api/v1/slow-endpoint');
    const loggerSpy = vi.spyOn((middleware as any).logger, 'warn');

    vi.spyOn(performance, 'now')
      .mockReturnValueOnce(1000) // start
      .mockReturnValueOnce(1450); // end -> 450ms

    middleware.use(req, res, () => {
      res.end();
    });

    expect(loggerSpy).toHaveBeenCalledTimes(1);
    expect(loggerSpy.mock.calls[0][0]).toContain('[Slow Endpoint Warning]');
    expect(loggerSpy.mock.calls[0][0]).toContain('450ms');
    expect(loggerSpy.mock.calls[0][0]).toContain('/api/v1/slow-endpoint');
  });

  it('logs a warning when DB duration exceeds 300ms even if total check triggers', () => {
    const { req, res } = createMockReqRes('/api/v1/heavy-db');
    const loggerSpy = vi.spyOn((middleware as any).logger, 'warn');

    middleware.use(req, res, () => {
      recordDbDuration(350);
      res.end();
    });

    expect(loggerSpy).toHaveBeenCalledTimes(1);
    expect(loggerSpy.mock.calls[0][0]).toContain('[Slow Endpoint Warning]');
    expect(loggerSpy.mock.calls[0][0]).toContain('db: 350ms');
  });
});
