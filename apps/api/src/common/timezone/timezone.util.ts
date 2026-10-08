/**
 * D1-045: Timezone Transformation Utility
 *
 * Provides DST-aware, IANA-validated conversion between UTC (the canonical DB
 * representation) and any learner / trainer / admin timezone for display.
 *
 * Rules:
 * - The database ALWAYS stores timestamps in UTC. This module never changes
 *   stored values — it only transforms them for presentation.
 * - Booking rule enforcement (advance-notice, clash windows) continues to use
 *   raw UTC Date objects. This module must never be used to weaken those checks.
 * - Timezone input from the authenticated user's stored profile is the source
 *   of truth on the server. Client-supplied timezone strings must be validated
 *   before use.
 * - Conversion uses the V8 / Node built-in Intl.DateTimeFormat so no external
 *   runtime dependency is required.
 *
 * Architecture reference: DEVELOPER_SPLIT_PLAN.md §F D1-045
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FormattedSessionTime {
  /** ISO-8601 string of the original UTC timestamp (never mutated). */
  utc: string;
  /** Wall-clock date string in the target timezone, e.g. "2026-11-15". */
  date: string;
  /** Wall-clock time string in the target timezone, e.g. "10:30 AM". */
  time: string;
  /** Long date + time, e.g. "Saturday, 15 November 2026 at 10:30 AM". */
  display: string;
  /** Short offset label, e.g. "GMT+5:30". */
  offset: string;
  /** IANA timezone identifier used, e.g. "Asia/Kolkata". */
  timezone: string;
}

export interface SessionTimeRange {
  start: FormattedSessionTime;
  end: FormattedSessionTime;
  /** Duration in whole minutes. */
  durationMinutes: number;
  /** True when the session spans midnight in the target timezone. */
  spansMidnight: boolean;
}

// ---------------------------------------------------------------------------
// IANA Timezone Validation
// ---------------------------------------------------------------------------

const tzValidationCache = new Map<string, boolean>();

/**
 * Returns true if `tz` is a valid IANA timezone identifier on this platform.
 * Validates against both canonical names and accepted aliases (like Asia/Kolkata).
 */
export function isValidIanaTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.trim() === '') return false;
  const trimmed = tz.trim();
  
  if (tzValidationCache.has(trimmed)) {
    return tzValidationCache.get(trimmed)!;
  }

  try {
    // Intl.DateTimeFormat will successfully construct for aliases (e.g., Asia/Kolkata)
    // even if supportedValuesOf() only returns the canonical name (Asia/Calcutta).
    new Intl.DateTimeFormat('en-US', { timeZone: trimmed });
    tzValidationCache.set(trimmed, true);
    return true;
  } catch {
    tzValidationCache.set(trimmed, false);
    return false;
  }
}

/**
 * Returns the validated IANA timezone or 'UTC' as a safe fallback.
 * Never throws. Use this on any untrusted or possibly-absent timezone value.
 */
export function resolveTimezone(tz: string | null | undefined): string {
  if (!tz) return 'UTC';
  const trimmed = tz.trim();
  return isValidIanaTimezone(trimmed) ? trimmed : 'UTC';
}

// ---------------------------------------------------------------------------
// Core conversion
// ---------------------------------------------------------------------------

/**
 * Converts a UTC Date into a structured FormattedSessionTime in the given
 * IANA timezone. DST transitions are handled automatically by the platform.
 *
 * @param utcDate  - The UTC timestamp to convert (Date object or ISO string).
 * @param timezone - Target IANA timezone identifier. Falls back to UTC if
 *                   invalid or absent.
 * @throws Never — invalid inputs are handled gracefully.
 */
export function toTimezone(
  utcDate: Date | string,
  timezone: string | null | undefined,
): FormattedSessionTime {
  const date = utcDate instanceof Date ? utcDate : new Date(utcDate);
  const tz = resolveTimezone(timezone);

  // Wall-clock date: YYYY-MM-DD
  const datePart = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date); // "YYYY-MM-DD" (en-CA produces ISO ordering natively)

  // Wall-clock time: "HH:MM AM/PM" (12-hour, matches client expectation)
  const timePart = new Intl.DateTimeFormat('en-AU', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);

  // Long display: "Saturday, 15 November 2026 at 10:30 am"
  const displayPart = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);

  // Offset label: "GMT+5:30"
  const offsetPart = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    timeZoneName: 'shortOffset',
  })
    .formatToParts(date)
    .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+0';

  return {
    utc: date.toISOString(),
    date: datePart,
    time: timePart,
    display: displayPart,
    offset: offsetPart,
    timezone: tz,
  };
}

/**
 * Converts a local wall-clock ISO string in a given IANA timezone into a UTC
 * Date. Use this when a trainer/admin supplies a time in their local timezone
 * and it needs to be stored as UTC.
 *
 * @param localIso - ISO-8601 string WITHOUT a timezone offset, e.g.
 *                   "2026-11-15T10:30:00".  If the string already carries an
 *                   offset it is used as-is and `timezone` is ignored.
 * @param timezone - IANA identifier of the timezone the string is expressed in.
 * @returns A UTC Date object.
 */
export function toUtc(localIso: string, timezone: string | null | undefined): Date {
  const tz = resolveTimezone(timezone);

  // If the input already carries an explicit offset (+HH:MM, Z, etc.) we just
  // parse it directly — the caller is already providing an unambiguous moment.
  const hasOffset = /[Z+\-]\d{2}:\d{2}$/.test(localIso.trim()) ||
    localIso.trim().endsWith('Z');
  if (hasOffset) {
    return new Date(localIso);
  }

  // Convert local wall-clock → UTC by computing the UTC offset at that exact
  // instant using Intl.DateTimeFormat part extraction.
  //
  // Strategy: parse the input as UTC temporarily, measure the UTC offset in
  // that timezone at the candidate instant, then shift to correct.
  const naive = new Date(localIso + 'Z'); // treat as UTC to parse components

  // Extract the wall-clock components in the target timezone for the naive UTC
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(naive);

  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);

  const yearLocal = get('year');
  const monthLocal = get('month') - 1; // 0-indexed
  const dayLocal = get('day');
  const hourLocal = get('hour') === 24 ? 0 : get('hour'); // midnight edge
  const minLocal = get('minute');
  const secLocal = get('second');

  // UTC equivalent of the reconstructed local time
  const localAsUtc = Date.UTC(
    yearLocal,
    monthLocal,
    dayLocal,
    hourLocal,
    minLocal,
    secLocal,
  );

  // Offset = naive(UTC) - localAsUtc; apply inverse to the original naive time
  const offsetMs = naive.getTime() - localAsUtc;
  return new Date(naive.getTime() + offsetMs);
}

/**
 * Builds a SessionTimeRange with both start and end converted to the same
 * timezone. Also computes the duration and whether the session crosses midnight
 * in the target timezone (useful for frontend "spans midnight" warnings).
 */
export function formatSessionTimeRange(
  startUtc: Date | string,
  endUtc: Date | string,
  timezone: string | null | undefined,
): SessionTimeRange {
  const start = startUtc instanceof Date ? startUtc : new Date(startUtc);
  const end = endUtc instanceof Date ? endUtc : new Date(endUtc);

  const formattedStart = toTimezone(start, timezone);
  const formattedEnd = toTimezone(end, timezone);

  const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
  const spansMidnight = formattedStart.date !== formattedEnd.date;

  return {
    start: formattedStart,
    end: formattedEnd,
    durationMinutes,
    spansMidnight,
  };
}

/**
 * Applies timezone-aware display fields to a raw session object.
 * The original `startTime` and `endTime` UTC values are preserved; the
 * `displayTime` block is added alongside them.
 *
 * This is a pure transformation — it never mutates any stored timestamp.
 *
 * @param session  - Any object with `startTime: Date | string` and
 *                   `endTime: Date | string`. The `timezone` field on the
 *                   session is used as the DEFAULT display timezone if no
 *                   override is supplied (it records the timezone the session
 *                   was scheduled in, not the learner's timezone).
 * @param viewerTz - The IANA timezone of the person viewing the session.
 *                   Must come from the authenticated user's stored profile.
 */
export function enrichSessionWithTimezone<
  T extends { startTime: Date | string; endTime: Date | string; timezone?: string | null },
>(
  session: T,
  viewerTz: string | null | undefined,
): T & { displayTime: SessionTimeRange } {
  const tz = resolveTimezone(viewerTz ?? session.timezone);
  const displayTime = formatSessionTimeRange(session.startTime, session.endTime, tz);
  return { ...session, displayTime };
}
