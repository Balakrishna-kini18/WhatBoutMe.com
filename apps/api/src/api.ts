let cachedServer: any;

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
  if (process.env.NODE_ENV === 'production' && process.env.PAYMENT_MODE === 'mock') {
    throw new Error('FATAL ERROR: API refuses to start with PAYMENT_MODE=mock in production');
  }

  if (!cachedServer) {
    // Vercel Hobby 10s budget.  NestFactory.create + Nest app.init() + all
    // module onModuleInit hooks + 12 Redis clients + helmet/cors MUST finish
    // within this TOTAL wallclock, or we force-fail bootstrap so the handler
    // safety net can write a JSON 500 response.
    const BOOTSTRAP_HARD_LIMIT_MS = 5000;
    let bootstrapReject: ((err: Error) => void) | undefined;
    const bootstrapLimitTimer = setTimeout(() => {
      if (bootstrapReject) {
        try {
          bootstrapReject(new Error(`Nest bootstrap exceeded ${BOOTSTRAP_HARD_LIMIT_MS}ms hard limit — aborting to preserve Vercel response budget`));
        } catch { /* noop */ }
      }
    }, BOOTSTRAP_HARD_LIMIT_MS);
    try { bootstrapLimitTimer.unref(); } catch { /* noop */ }

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
          if (!origin) return callback(null, true);
          if (
            allowedOrigins.includes(origin) ||
            /^http:\/\/localhost:[0-9]+$/.test(origin) ||
            /^http:\/\/127\.0\.0\.1:[0-9]+$/.test(origin) ||
            /\.vercel\.app$/.test(origin) // <-- Automatically allow ALL Vercel domains (preview & production)
          ) {
            return callback(null, true);
          }
          return callback(new Error('Not allowed by CORS'));
        },
        credentials: true,
      });

      nestApp.use(express.json({ limit: '10mb' }));
      nestApp.use(express.urlencoded({ limit: '10mb', extended: true }));

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
    };

    try {
      await Promise.race([
        doBootstrap(),
        new Promise<never>((_, reject) => { bootstrapReject = reject; }),
      ]);
    } finally {
      try { clearTimeout(bootstrapLimitTimer); } catch { /* noop */ }
      bootstrapReject = undefined;
    }
  }
  return cachedServer;
}

export default async (req: any, res: any) => {
  // Vercel Hobby serverless max execution is 10s.  Guarantee the handler
  // always resolves and writes a response within 9.5s, even if Nest bootstrap,
  // Redis, Prisma, or middleware stall indefinitely.  This prevents Vercel's
  // generic "FUNCTION_INVOCATION_FAILED" and instead returns a descriptive JSON
  // error — the critical difference between an infra-crash page and a real API
  // error response that clients can programmatically handle.
  const SAFETY_LIMIT_MS = 9500;
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
