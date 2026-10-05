import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { queryCount, resetQueryCount } from '../../prisma/prisma.service.js';

@Injectable()
export class QueryCountInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    resetQueryCount();
    return next.handle().pipe(
      tap(() => {
        const res = context.switchToHttp().getResponse();
        res.setHeader('X-Prisma-Queries', queryCount.toString());
      })
    );
  }
}
