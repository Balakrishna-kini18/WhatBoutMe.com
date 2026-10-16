import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { requestTimingStorage, RequestTimingContext } from '../timing/server-timing.storage.js';

@Injectable()
export class ServerTimingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('ServerTiming');

  use = (req: Request, res: Response, next: NextFunction) => {
    const startTime = performance.now();
    const context: RequestTimingContext = {
      startTime,
      dbDuration: 0,
      queryCount: 0,
    };

    (req as any).__timing = context;

    const originalWriteHead = res.writeHead;
    const originalEnd = res.end;
    let timingHeaderWritten = false;

    const writeTimingHeader = () => {
      if (timingHeaderWritten) return;
      timingHeaderWritten = true;

      const totalDuration = Math.round((performance.now() - startTime) * 10) / 10;
      const dbDuration = Math.round(context.dbDuration * 10) / 10;

      const timingValue = `db;dur=${dbDuration}, total;dur=${totalDuration}`;

      try {
        const existing = res.getHeader('Server-Timing');
        if (existing) {
          res.setHeader('Server-Timing', `${existing}, ${timingValue}`);
        } else {
          res.setHeader('Server-Timing', timingValue);
        }
      } catch {
        // Headers already committed
      }

      if (totalDuration > 300 || dbDuration > 300) {
        const method = req.method;
        const url = req.originalUrl || req.url;
        const msg = `[Slow Endpoint Warning] ${method} ${url} took ${totalDuration}ms (db: ${dbDuration}ms, queries: ${context.queryCount})`;
        if (this?.logger?.warn) {
          this.logger.warn(msg);
        } else {
          console.warn(msg);
        }
      }
    };

    res.writeHead = function (this: Response, ...args: any[]) {
      writeTimingHeader();
      return originalWriteHead.apply(this, args as any);
    };

    res.end = function (this: Response, ...args: any[]) {
      writeTimingHeader();
      return originalEnd.apply(this, args as any);
    };

    requestTimingStorage.run(context, () => {
      next();
    });
  };
}

const defaultInstance = new ServerTimingMiddleware();
export const serverTimingMiddleware = defaultInstance.use;
