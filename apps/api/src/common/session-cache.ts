/**
 * Remembers for a short while which sign-in sessions were just seen to be
 * live. Every signed-in request used to look its session up in the database
 * first; with the database a continent away that added about half a second
 * to each one. Anything that ends a session calls forgetSessions(), so within
 * this process an ended session is still rejected on its very next request.
 */
const TTL_MS = 30_000;
const MAX_ENTRIES = 5_000;
const liveUntil = new Map<string, number>();

export const sessionKnownLive = (sessionId: string) => (liveUntil.get(sessionId) ?? 0) > Date.now();

export function rememberLiveSession(sessionId: string) {
  if (liveUntil.size >= MAX_ENTRIES) liveUntil.clear();
  liveUntil.set(sessionId, Date.now() + TTL_MS);
}

/** Call after revoking any session. Clearing everything is cheap and cannot miss one. */
export const forgetSessions = () => liveUntil.clear();
