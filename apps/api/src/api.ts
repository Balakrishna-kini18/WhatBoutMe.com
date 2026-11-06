import { isAllowedCorsOrigin } from './common/config/cors.config.js';
import { assertPaymentConfig } from './common/config/payment.config.js';
let cachedServer: any = null;
let bootstrapPromise: Promise<any> | null = null;

// Helper: write a JSON response using raw Node http primitives.
// Vercel's Lambda handler calls api.ts with bare http.IncomingMessage/
// ServerResponse objects — they do NOT have Express's res.status().json()
// chain until Nest/Express adapters attach to the req/res (and they only do
// that IF bootstrap completes AND the middleware stack actually executes).
// Any error path that fires BEFORE Nest fully takes over (bootstrap errors,
// safety timers, bootstrap timeouts, etc.) MUST use raw Node http writes,
// or calling `res.status(500).json(...)` THROWS inside the catch block →
// unhandled error → Vercel kills the Lambda → generic FUNCTION_INVOCATION_FAILED.
function writeJson(res: any, statusCode: number, payload: any): void {
  try {
    let body: string;
    try {
      body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    } catch {
      body = JSON.stringify({ statusCode, error: 'Serverless Serialization Error' });
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': String(Buffer.byteLength(body)),
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    };
    if (!res.headersSent) {
      try {
        if (typeof res.writeHead === 'function') {
          res.writeHead(statusCode, headers);
        } else {
          try { res.statusCode = statusCode; } catch {}
          for (const [k, v] of Object.entries(headers)) {
            try { res.setHeader(k, v); } catch {}
          }
        }
      } catch {
        try { res.statusCode = statusCode; } catch {}
      }
    }
    try {
      if (typeof res.end === 'function') res.end(body);
    } catch {
      // Socket is torn down / already ended — nothing more to do.
    }
  } catch (outer) {
    // Last-ditch attempt so Lambda actually terminates.
    try {
      if (!res.headersSent) res.statusCode = 500;
      if (typeof res.end === 'function') res.end('{"error":"Serverless handler failed"}');
    } catch { /* noop */ }
  }
}

async function bootstrapServer() {
  assertPaymentConfig({ exitOnError: false });

  if (cachedServer) {
    return cachedServer;
  }

  // Deduplicate concurrent incoming requests during cold-start.
  // When multiple requests arrive at once (e.g. admin dashboard firing 7 requests in parallel),
  // they all await the single in-flight bootstrapPromise instead of spawning 7 concurrent
  // NestFactory.create() graphs in the same Node.js process.
  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  const configuredBootstrapLimit = Number(process.env.BOOTSTRAP_HARD_LIMIT_MS);
  const BOOTSTRAP_HARD_LIMIT_MS =
    Number.isFinite(configuredBootstrapLimit) && configuredBootstrapLimit > 0
      ? configuredBootstrapLimit
      : 30000;

  let bootstrapReject: ((err: Error) => void) | undefined;
  const bootstrapLimitTimer = setTimeout(() => {
    if (bootstrapReject) {
      try {
        bootstrapReject(new Error(`Nest bootstrap exceeded ${BOOTSTRAP_HARD_LIMIT_MS}ms hard limit — aborting to preserve Vercel response budget`));
      } catch { /* noop */ }
    }
  }, BOOTSTRAP_HARD_LIMIT_MS);
  try { bootstrapLimitTimer.unref(); } catch { /* noop */ }

  bootstrapPromise = (async () => {
    try {
      const doBootstrap = async () => {
        // Dynamically import everything so top-level module load errors are caught
        await import('./instrument.js');

        const { NestFactory } = await import('@nestjs/core');
        const { ExpressAdapter } = await import('@nestjs/platform-express');
        const express = (await import('express')).default;
        const { ValidationPipe } = await import('@nestjs/common');
        const helmet = (await import('helmet')).default;
        const { HttpExceptionFilter } = await import('./common/filters/http-exception.filter.js');
        const { AppModule } = await import('./app.module.js');

        const expressApp = express();
        const nestApp = await NestFactory.create(
          AppModule,
          new ExpressAdapter(expressApp),
        );

        nestApp.use(helmet ? (typeof helmet === 'function' ? helmet() : (helmet as any).default()) : (helmet as any)());
        const allowedOrigins = process.env.CORS_ORIGIN
          ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
          : []; // Don't rely exclusively on localhost, though we keep the regex below for local dev

        nestApp.enableCors({
          origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
            if (isAllowedCorsOrigin(origin, allowedOrigins)) {
              return callback(null, true);
            }
            return callback(new Error('Not allowed by CORS'));
          },
          credentials: true,
          methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
          exposedHeaders: ['Server-Timing', 'X-Prisma-Queries', 'Cache-Control'],
          optionsSuccessStatus: 204,
          maxAge: 86400,
        });

        // Raw body parser for file uploads (PDF, DOCX, images, videos, audios)
        const rawUploadParser = express.raw({ type: () => true, limit: '250mb' });
        const corpHeader = (_req: any, res: any, next: any) => {
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
          next();
        };
        nestApp.use('/uploads', corpHeader, rawUploadParser);
        nestApp.use('/api/uploads', corpHeader, rawUploadParser);

        nestApp.use(
          express.json({
            limit: '50mb',
            verify: (req: any, _res: any, buf: Buffer) => {
              req.rawBody = buf;
            },
          }),
        );
        nestApp.use(express.urlencoded({ limit: '50mb', extended: true }));

        nestApp.useGlobalPipes(
          new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
          }),
        );

        nestApp.useGlobalFilters(new HttpExceptionFilter());

        await nestApp.init();
        cachedServer = expressApp;
        return expressApp;
      };

      const server = await Promise.race([
        doBootstrap(),
        new Promise<never>((_, reject) => { bootstrapReject = reject; }),
      ]);
      return server;
    } catch (err) {
      bootstrapPromise = null; // Reset so subsequent requests can re-attempt cleanly
      throw err;
    } finally {
      try { clearTimeout(bootstrapLimitTimer); } catch { /* noop */ }
      bootstrapReject = undefined;
    }
  })();

  return bootstrapPromise;
}

export default async (req: any, res: any) => {
  // Configurable safety limit (defaults to 55s matching Vercel maxDuration: 60s).
  // Guarantee the handler always resolves and writes a response before Vercel's watchdog,
  // returning a clean JSON error response instead of generic FUNCTION_INVOCATION_FAILED.
  const configuredSafetyLimit = Number(process.env.SERVERLESS_SAFETY_LIMIT_MS);
  const SAFETY_LIMIT_MS =
    Number.isFinite(configuredSafetyLimit) && configuredSafetyLimit > 0
      ? configuredSafetyLimit
      : 55000;
  let safetyFired = false;
  let safetyClearResolved: (() => void) | undefined;

  const safetyTimer = setTimeout(() => {
    safetyFired = true;
    console.error(`FATAL SERVERLESS SAFETY TIMEOUT: force-ending response (${SAFETY_LIMIT_MS}ms)`);
    try {
      if (!res.headersSent) {
        writeJson(res, 500, {
          statusCode: 500,
          error: 'Serverless Execution Timeout',
          message: `Handler exceeded ${SAFETY_LIMIT_MS}ms safety limit`,
        });
      } else if (typeof res.end === 'function') {
        try { res.end(); } catch { /* noop */ }
      }
    } catch { /* noop */ }
    // If safetyClearResolved is set, the outer handler is stuck awaiting
    // bootstrap (no Promise listeners on res yet) — unblock it directly.
    if (safetyClearResolved) try { safetyClearResolved(); } catch { /* noop */ }
  }, SAFETY_LIMIT_MS);

  const finishEarly = () => {
    try { clearTimeout(safetyTimer); } catch { /* noop */ }
  };

  try {
    let bootstrapDone = false;
    const app = await Promise.race([
      bootstrapServer(),
      new Promise<never>((_, reject) => {
        safetyClearResolved = () => reject(new Error(`Serverless safety timeout during bootstrap (${SAFETY_LIMIT_MS}ms)`));
      }),
    ]);
    bootstrapDone = true;

    if (safetyFired) {
      // Safety timer already wrote a response during bootstrap.  Ensure the
      // Vercel Lambda unblocks immediately instead of waiting for the event
      // loop to empty.
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const done = () => { finishEarly(); resolve(); };
      const fail = (err: any) => { finishEarly(); reject(err); };
      res.once('finish', done);
      res.once('close', done);
      res.once('error', fail);
      if (safetyFired) { done(); return; }
      // NOTE: req.url + req.originalUrl normalization already runs in the
      // outer index.js entry handler (L90-L111). Do NOT duplicate it here.
      // A second normalization pass on URLs that have already been stripped
      // of their /api prefix mangles POST /auth/... etc. routes that share
      // a prefix pattern with the rewrite engine's internal synthetic path.
      app(req, res, (err: any) => {
        if (safetyFired) { done(); return; }
        if (err) return fail(err);
        // Express reached the bottom of its stack with no match → force end.
        if (!res.headersSent) {
          writeJson(res, 404, { statusCode: 404, error: 'Not Found', message: `Cannot ${req.method} ${req.url}` });
        }
        if (res.writableEnded) done();
        else if (typeof res.end === 'function') { try { res.end(undefined, undefined, () => done()); } catch { done(); } }
        else done();
      });
    });
  } catch (err: any) {
    finishEarly();
    console.error('FATAL SERVERLESS BOOTSTRAP ERROR:', err);
    if (!res.headersSent) {
      try {
        writeJson(res, 500, {
          statusCode: 500,
          error: 'Serverless Bootstrap Error',
          message: err?.message || String(err),
          stack: process.env.NODE_ENV === 'production' ? undefined : err?.stack,
        });
      } catch (writeErr) {
        console.error('FATAL: could not write error response:', (writeErr as any)?.message || writeErr);
        if (typeof res.end === 'function') try { res.end(); } catch { /* noop */ }
      }
    } else if (typeof res.end === 'function') {
      try { res.end(); } catch { /* noop */ }
    }
  } finally {
    finishEarly();
    safetyClearResolved = undefined;
  }
};
