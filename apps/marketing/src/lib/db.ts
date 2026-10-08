import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// NOTE: `new PrismaClient(opts)` can throw SYNCHRONOUSLY during connection-string
// parsing when `DATABASE_URL` is malformed / missing / a wrong env var value
// (the "i entered wrong environmental variable" case the user explicitly flagged).
// If the constructor throws at TOP-LEVEL module evaluation, Vercel's runtime
// catches it BEFORE any Next.js error boundary / route handler runs, so the
// browser sees Vercel's generic "FUNCTION_INVOCATION_FAILED" HTML crash page
// with no information about WHICH env var is broken.
//
// Wrap the constructor in try/catch.  On throw, log a warning and return a
// Proxy that defers the crash until request-time (when a server component
// actually queries `db.someModel.findMany()`).  Next.js App Router error
// boundaries CAN catch request-time throws → real error UI with the actual
// DATABASE_URL parsing error message → user sees exactly which var to fix.
let db: PrismaClient;
try {
  if (globalForPrisma.prisma) {
    db = globalForPrisma.prisma;
  } else {
    db = new PrismaClient({
      log: ['query'],
    });
    if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
  }
} catch (err: any) {
  const msg = (err?.message || String(err)).slice(0, 500);
  console.warn('[marketing/lib/db] PrismaClient constructor failed. Deferring error to request-time so Next.js error boundary can render it:', msg);
  // Marker error (thrown on ANY property access of the exported `db` object):
  const deferred = new Error(
    `PrismaClient could not be initialized during app startup. ` +
    `This usually means DATABASE_URL / DIRECT_URL env vars are missing, empty, ` +
    `malformed, or point at an unreachable host.  Fix the env vars in Vercel ` +
    `Project → Settings → Environment Variables and redeploy.  ` +
    `Original constructor error: ${msg}`
  );
  // Proxy every model/property access to throw the real error:
  const proxy = new Proxy({}, {
    get(_target, prop, _receiver) {
      if (typeof prop === 'symbol') {
        if (prop === Symbol.for('nodejs.util.inspect.custom') || prop === Symbol.toStringTag) {
          return () => `[PrismaClient FAILED INIT: DATABASE_URL env var?]`;
        }
        return undefined as any;
      }
      if (prop === 'toString' || prop === 'toJSON' || prop === 'then' || prop === 'catch') {
        return () => `[PrismaClient FAILED INIT: DATABASE_URL env var?]`;
      }
      // Model access (e.g. db.user) → return another Proxy that throws on any
      // method call (findMany/create/...) so the stack trace points clearly at
      // the query site.
      return new Proxy({}, {
        get(_mTarget, mProp: string | symbol) {
          if (typeof mProp === 'symbol') return undefined as any;
          if (mProp === 'toString' || mProp === 'toJSON') {
            return () => `[model:${String(prop)} FAILED INIT: DATABASE_URL env var?]`;
          }
          return function _throwingMethod() {
            throw deferred;
          };
        },
      });
    },
  });
  db = proxy as unknown as PrismaClient;
}

export { db };