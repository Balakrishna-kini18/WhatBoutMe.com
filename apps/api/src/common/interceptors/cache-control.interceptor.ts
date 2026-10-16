import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { CACHE_CONTROL_METADATA } from '../decorators/cache-control.decorator.js';

@Injectable()
export class CacheControlInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();

    const cacheControlHeader = this.reflector.getAllAndOverride<string>(
      CACHE_CONTROL_METADATA,
      [context.getHandler(), context.getClass()],
    );

    return next.handle().pipe(
      tap(() => {
        if (!res || typeof res.setHeader !== 'function') return;

        const method = req?.method ? req.method.toUpperCase() : 'GET';
        // Mutating requests should NEVER be cached by proxies or browsers
        if (method !== 'GET' && method !== 'HEAD') {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          return;
        }

        // Authenticated requests (Admin portal / Learner logged-in) must never be cached by shared CDN / edge
        const hasAuth = Boolean(req?.headers?.['authorization']);
        if (hasAuth) {
          res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
          return;
        }

        // Only attach if metadata exists and header not already set
        if (cacheControlHeader && !res.getHeader('Cache-Control')) {
          res.setHeader('Cache-Control', cacheControlHeader);
        }
      }),
    );
  }
}
