/**
 * Remembers for a short while which sign-in sessions were just seen to be
 * live. Every signed-in request used to look its session up in the database
 * first; with the database a continent away that added about half a second
 * to each one. Anything that ends a session calls forgetSessions(), so within
 * this process an ended session is still rejected on its very next request.
 */
const TTL_MS = 30_000;
const MAX_ENTRIES = 5_000;

interface CachedSession {
  until: number;
  userId: string;
}

const liveUntil = new Map<string, CachedSession>();

export const sessionKnownLive = (sessionId: string, userId?: string) => {
  const cached = liveUntil.get(sessionId);
  if (!cached) return false;
  if (cached.until <= Date.now()) {
    liveUntil.delete(sessionId);
    return false;
  }
  if (userId && cached.userId !== userId) {
    return false;
  }
  return true;
};

export function rememberLiveSession(sessionId: string, userId: string = '', expiresAt?: Date | null) {
  if (liveUntil.size >= MAX_ENTRIES) liveUntil.clear();
  const maxUntil = Date.now() + TTL_MS;
  const until = expiresAt ? Math.min(maxUntil, expiresAt.getTime()) : maxUntil;
  if (until > Date.now()) {
    liveUntil.set(sessionId, { until, userId });
  }
}

/** Call after revoking any session. Clearing everything is cheap and cannot miss one. */
export const forgetSessions = () => liveUntil.clear();
