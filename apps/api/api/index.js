// Vercel Zero Config Entrypoint
// We dynamically import the compiled NestJS entrypoint from dist/
// This ensures Vercel's Node File Trace only scans compiled JavaScript, avoiding .tsx transpilation bugs.

// Helper: write a JSON response using raw Node http primitives.
// Vercel's lambda req/res are bare http.IncomingMessage/ServerResponse —
// they do NOT have Express's `res.status().json()` chain.  Calling the
// Express API on them THROWS inside the catch block → top-level kill of
// the Lambda process → generic "FUNCTION_INVOCATION_FAILED" HTML page
// instead of a real JSON error.  Always use raw Node for the outer layer.
function writeJson(res, statusCode, payload) {
  try {
    let body;
    try {
      body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    } catch {
      body = JSON.stringify({ error: 'Unable to serialize error payload' });
    }
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    };
    if (!res.headersSent) {
      try { res.writeHead(statusCode, headers); } catch { /* noop */ }
    }
    try {
      res.end(body);
    } catch {
      // Already ended or socket torn down.
    }
  } catch (outerErr) {
    // Last-ditch: try raw res.end so Lambda actually terminates cleanly.
    try { if (!res.headersSent) res.statusCode = 500; } catch {}
    try { res.end('{"error":"Serverless entry handler failed"}'); } catch {}
  }
}

// Auto-detect serverless Lambda environments so our downstream
// fail-fast paths in BullMQ/Redis/Prisma reliably engage even when
// the downstream code only checks WORKER_MODE and doesn't know about Vercel.
const AUTO_SERVERLESS = Boolean(
  process.env.VERCEL ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.LAMBDA_TASK_ROOT ||
  process.env.GOOGLE_CLOUD_RUN ||
  process.env.K_SERVICE
);
if (AUTO_SERVERLESS && process.env.WORKER_MODE !== 'true') {
  process.env.NODE_ENV = process.env.NODE_ENV || 'production';
  // Tag for downstream modules (api.ts, prisma.service, redis.*, queue.module).
  // Keeps the existing !WORKER_MODE == serverless convention intact.
}

// Top-level unhandled-rejection / uncaught-exception safety net.
// If anything downstream throws without a catch inside a Promise microtask,
// we MUST still respond with JSON — otherwise Vercel kills the process
// immediately and returns FUNCTION_INVOCATION_FAILED.
process.on('unhandledRejection', (reason) => {
  console.error('VERCEL ENTRY: unhandledRejection (caught by index.js global guard):', reason?.message || reason);
  try {
    writeJson(globalThis.__lastRes || (globalThis.__fallbackResSink && globalThis.__fallbackResSink()) || undefined, 500, {
      error: 'Serverless Unhandled Rejection',
      details: reason?.message || String(reason),
      stack: process.env.NODE_ENV === 'production' ? undefined : reason?.stack,
    });
  } catch { /* noop */ }
});
process.on('uncaughtException', (err) => {
  console.error('VERCEL ENTRY: uncaughtException (caught by index.js global guard):', err?.message || err);
  try {
    writeJson(globalThis.__lastRes || (globalThis.__fallbackResSink && globalThis.__fallbackResSink()) || undefined, 500, {
      error: 'Serverless Uncaught Exception',
      details: err?.message || String(err),
      stack: process.env.NODE_ENV === 'production' ? undefined : err?.stack,
    });
  } catch { /* noop */ }
  // IMPORTANT: DO NOT call process.exit() here.  Node will flush pending TCP
  // writes and exit on its own within a few ms once all handles are
  // unref'd.  Forcibly exiting with process.exit(1) while a write is still
  // buffered causes Node to discard the socket buffer entirely → Vercel
  // never receives our JSON response bytes → Vercel shows generic
  // "FUNCTION_INVOCATION_FAILED" instead of our real 500 error payload.
});

export default async function (req, res) {
  // Track latest res in case global uncaught handlers need to write a response.
  globalThis.__lastRes = res;

  // Final 11s outer hard-stop (Vercel Hobby hard limit 10s).  If nothing else
  // fires, this guarantees we write at least SOMETHING before Vercel kills us.
  let outerFinished = false;
  const outerHardStop = setTimeout(() => {
    if (outerFinished) return;
    outerFinished = true;
    console.error('VERCEL ENTRY: outer 11s hard-stop fired (nothing else responded).');
    writeJson(res, 504, {
      statusCode: 504,
      error: 'Serverless Gateway Timeout',
      message: 'Outer entry safety limit exceeded before Nest could respond.',
    });
  }, 11000);
  if (outerHardStop && outerHardStop.unref) outerHardStop.unref();

  try {
    // Import the compiled Nest handler.  Dynamic import resolves on the NEXT
    // microtask after module evaluation completes; any SYNCHRONOUS throw DURING
    // the api.js module's top-level (top-level await, init-time module errors
    // that V8 raises synchronously before the Promise job) would NOT be caught
    // by the Promise catch unless wrapped in a sync try + Promise.reject.
    let handlerMod;
    try {
      handlerMod = await Promise.resolve().then(() => import('../dist/api.js'));
    } catch (importErr) {
      console.error('VERCEL ENTRY: import(../dist/api.js) failed:', importErr?.message || importErr);
      writeJson(res, 500, {
        error: 'API Import Error',
        details: importErr?.message || String(importErr),
        stack: process.env.NODE_ENV === 'production' ? undefined : importErr?.stack,
      });
      outerFinished = true;
      try { clearTimeout(outerHardStop); } catch {}
      return;
    }

    if (!handlerMod || typeof handlerMod.default !== 'function') {
      console.error('VERCEL ENTRY: handler.default not a function. typeof default =', handlerMod && typeof handlerMod.default);
      writeJson(res, 500, {
        error: 'API Handler Misconfigured',
        details: `Expected export default function, got ${handlerMod && typeof handlerMod.default}`,
      });
      outerFinished = true;
      try { clearTimeout(outerHardStop); } catch {}
      return;
    }

    const handler = handlerMod.default;
    // Wrap the Nest handler with its own timer so even if api.ts somehow exits
    // without responding, we still write JSON.
    const innerStart = Date.now();
    try {
      await handler(req, res);
    } catch (handlerErr) {
      // handlerPromise rejected — api.ts catch block should already have
      // written a response.  If it didn't (res.headersSent still false),
      // write a backup JSON error.
      console.error('VERCEL ENTRY: handler(req,res) threw:', handlerErr?.message || handlerErr);
      if (!res.headersSent) {
        writeJson(res, 500, {
          error: 'API Handler Runtime Error',
          details: handlerErr?.message || String(handlerErr),
          stack: process.env.NODE_ENV === 'production' ? undefined : handlerErr?.stack,
        });
      }
      outerFinished = true;
      try { clearTimeout(outerHardStop); } catch {}
      return;
    }

    // Handler returned normally.  If res.writableEnded / res.finished, great.
    // If it somehow returned without ending the response (shouldn't happen, but
    // if Nest/Express leaks) wait up to 250ms for res.end; otherwise force-end.
    const waitForEndMs = 250;
    const endWaitUntil = innerStart + 10500; // never wait past Vercel limit
    const pollEndDeadline = Math.min(Date.now() + waitForEndMs, endWaitUntil);
    while (Date.now() < pollEndDeadline && !(res.writableEnded || res.headersSent && res.finished)) {
      await new Promise(r => setTimeout(r, 10));
    }
    if (!(res.writableEnded || res.finished)) {
      if (!res.headersSent) {
        writeJson(res, 500, {
          error: 'Serverless Response Not Ended',
          message: 'Nest handler returned but response was never ended.',
        });
      } else {
        try { res.end(); } catch {}
      }
    }
    outerFinished = true;
    try { clearTimeout(outerHardStop); } catch {}
  } catch (outerErr) {
    console.error('VERCEL ENTRY: outer catch reached:', outerErr?.message || outerErr);
    try {
      if (!res.headersSent) {
        writeJson(res, 500, {
          error: 'Serverless Entry Error',
          details: outerErr?.message || String(outerErr),
          stack: process.env.NODE_ENV === 'production' ? undefined : outerErr?.stack,
        });
      } else {
        try { res.end(); } catch {}
      }
    } catch { /* noop — last resort */ }
    outerFinished = true;
    try { clearTimeout(outerHardStop); } catch {}
  } finally {
    outerFinished = true;
    try { clearTimeout(outerHardStop); } catch {}
  }
}
