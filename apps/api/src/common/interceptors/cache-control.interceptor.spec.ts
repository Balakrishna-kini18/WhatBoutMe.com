import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { CacheControlInterceptor } from './cache-control.interceptor.js';
import { CACHE_CONTROL_METADATA } from '../decorators/cache-control.decorator.js';

describe('CacheControlInterceptor & HTTP Directives', () => {
  let interceptor: CacheControlInterceptor;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    interceptor = new CacheControlInterceptor(reflector);
  });

  const createMockContext = (method: string, existingHeader: string | null = null) => {
    const headers = new Map<string, string>();
    if (existingHeader) {
      headers.set('Cache-Control', existingHeader);
    }

    const req = { method };
    const res = {
      getHeader: vi.fn((name: string) => headers.get(name) || null),
      setHeader: vi.fn((name: string, value: string) => {
        headers.set(name, value);
      }),
    };

    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    } as unknown as ExecutionContext;

    return { context, res, headers };
  };

  it('1. should attach PublicCache header on GET endpoints', async () => {
    const { context, res } = createMockContext('GET');
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(
      'public, s-maxage=60, stale-while-revalidate=300'
    );

    const callHandler: CallHandler = { handle: () => of({ ok: true }) };

    await new Promise((resolve) => {
      interceptor.intercept(context, callHandler).subscribe({
        complete: resolve,
      });
    });

    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'public, s-maxage=60, stale-while-revalidate=300'
    );
  });

  it('2. should attach AdminCache header on safe admin read endpoints', async () => {
    const { context, res } = createMockContext('GET');
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(
      'private, max-age=15, stale-while-revalidate=60'
    );

    const callHandler: CallHandler = { handle: () => of({ stats: true }) };

    await new Promise((resolve) => {
      interceptor.intercept(context, callHandler).subscribe({
        complete: resolve,
      });
    });

    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'private, max-age=15, stale-while-revalidate=60'
    );
  });

  it('3. should force no-store, no-cache, must-revalidate on mutating operations (POST, PUT, PATCH, DELETE)', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const { context, res } = createMockContext(method);
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue('public, s-maxage=60');

      const callHandler: CallHandler = { handle: () => of({ mutated: true }) };

      await new Promise((resolve) => {
        interceptor.intercept(context, callHandler).subscribe({
          complete: resolve,
        });
      });

      expect(res.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store, no-cache, must-revalidate'
      );
    }
  });

  it('4. should not overwrite an existing Cache-Control header if already set manually', async () => {
    const { context, res } = createMockContext('GET', 'custom-directive');
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue('public, s-maxage=60');

    const callHandler: CallHandler = { handle: () => of({ custom: true }) };

    await new Promise((resolve) => {
      interceptor.intercept(context, callHandler).subscribe({
        complete: resolve,
      });
    });

    expect(res.setHeader).not.toHaveBeenCalled();
  });
});
