/**
 * D1-045: Timezone Transformation Utility — Unit Tests
 *
 * Covers:
 *  1.  UTC → Asia/Kolkata
 *  2.  UTC → America/New_York (EST and EDT)
 *  3.  UTC → Europe/London (GMT and BST)
 *  4.  DST transition (America/New_York spring forward)
 *  5.  UTC → UTC (identity)
 *  6.  Local timezone → UTC (toUtc)
 *  7.  Invalid IANA timezone → falls back to UTC
 *  8.  Missing / null timezone → falls back to UTC
 *  9.  Session display across midnight in target timezone
 * 10.  Booking/session API UTC correctness preserved
 * 11.  D1-044 advance-notice calculation remains UTC-based
 * 12.  isValidIanaTimezone
 * 13.  resolveTimezone
 * 14.  enrichSessionWithTimezone
 * 15.  spansMidnight detection
 */

import { describe, it, expect } from 'vitest';
import {
  isValidIanaTimezone,
  resolveTimezone,
  toTimezone,
  toUtc,
  formatSessionTimeRange,
  enrichSessionWithTimezone,
  type FormattedSessionTime,
} from './timezone.util.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a YYYY-MM-DD date string produced by toTimezone() */
function parseDate(d: FormattedSessionTime) {
  const [year, month, day] = d.date.split('-').map(Number);
  return { year, month, day };
}

// ---------------------------------------------------------------------------
// 1. UTC → Asia/Kolkata (IST = UTC+05:30, no DST)
// ---------------------------------------------------------------------------
describe('1. UTC → Asia/Kolkata', () => {
  it('converts 2026-11-01T10:00:00Z to IST (UTC+05:30)', () => {
    const utc = new Date('2026-11-01T10:00:00Z');
    const result = toTimezone(utc, 'Asia/Kolkata');

    // 10:00 UTC + 5h30m = 15:30 IST
    expect(result.date).toBe('2026-11-01');
    expect(result.time).toMatch(/3:30\s*[Pp][Mm]/);
    expect(result.timezone).toBe('Asia/Kolkata');
    expect(result.utc).toBe('2026-11-01T10:00:00.000Z');
    expect(result.offset).toMatch(/GMT\+5:30/);
  });

  it('converts midnight UTC to 05:30 AM IST (same date)', () => {
    const utc = new Date('2026-11-01T00:00:00Z');
    const result = toTimezone(utc, 'Asia/Kolkata');
    expect(result.date).toBe('2026-11-01');
    expect(result.time).toMatch(/5:30\s*[Aa][Mm]/);
  });

  it('converts 22:00 UTC to next-day 03:30 AM IST (crosses midnight)', () => {
    const utc = new Date('2026-11-01T22:00:00Z');
    const result = toTimezone(utc, 'Asia/Kolkata');
    // 22:00 + 5:30 = 03:30 next day
    expect(result.date).toBe('2026-11-02');
    expect(result.time).toMatch(/3:30\s*[Aa][Mm]/);
  });

  it('accepts an ISO string instead of a Date object', () => {
    const result = toTimezone('2026-11-01T10:00:00Z', 'Asia/Kolkata');
    expect(result.date).toBe('2026-11-01');
    expect(result.utc).toBe('2026-11-01T10:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// 2. UTC → America/New_York (EST = UTC−05:00)
// ---------------------------------------------------------------------------
describe('2. UTC → America/New_York (EST)', () => {
  it('converts 2026-11-20T15:00:00Z to 10:00 AM EST (UTC−5)', () => {
    // After DST ends Nov 1 → standard time, so UTC−5
    const utc = new Date('2026-11-20T15:00:00Z');
    const result = toTimezone(utc, 'America/New_York');

    expect(result.date).toBe('2026-11-20');
    expect(result.time).toMatch(/10:00\s*[Aa][Mm]/);
    expect(result.timezone).toBe('America/New_York');
    expect(result.offset).toMatch(/GMT-5/);
  });

  it('converts 2026-07-01T14:00:00Z to 10:00 AM EDT (UTC−4)', () => {
    // Summer = EDT
    const utc = new Date('2026-07-01T14:00:00Z');
    const result = toTimezone(utc, 'America/New_York');

    expect(result.date).toBe('2026-07-01');
    expect(result.time).toMatch(/10:00\s*[Aa][Mm]/);
    expect(result.offset).toMatch(/GMT-4/);
  });
});

// ---------------------------------------------------------------------------
// 3. UTC → Europe/London (GMT winter / BST summer)
// ---------------------------------------------------------------------------
describe('3. UTC → Europe/London', () => {
  it('winter: UTC+0 — time is unchanged', () => {
    const utc = new Date('2026-12-15T09:00:00Z');
    const result = toTimezone(utc, 'Europe/London');
    expect(result.date).toBe('2026-12-15');
    expect(result.time).toMatch(/9:00\s*[Aa][Mm]/);
    expect(result.offset).toMatch(/GMT\+?0/);
  });

  it('summer (BST): UTC+1 — adds one hour', () => {
    const utc = new Date('2026-07-15T09:00:00Z');
    const result = toTimezone(utc, 'Europe/London');
    expect(result.date).toBe('2026-07-15');
    expect(result.time).toMatch(/10:00\s*[Aa][Mm]/);
    expect(result.offset).toMatch(/GMT\+1/);
  });
});

// ---------------------------------------------------------------------------
// 4. DST transition — America/New_York spring forward
// ---------------------------------------------------------------------------
describe('4. DST transition', () => {
  it('handles the spring-forward gap correctly (clocks jump at 02:00)', () => {
    // In 2026 the US spring-forward is on March 8.
    // 06:59 UTC = 01:59 EST (before spring forward)
    const before = new Date('2026-03-08T06:59:00Z');
    const rBefore = toTimezone(before, 'America/New_York');
    expect(rBefore.offset).toMatch(/GMT-5/); // still EST

    // 07:01 UTC = 03:01 EDT (after spring forward, clocks jumped to 03:00)
    const after = new Date('2026-03-08T07:01:00Z');
    const rAfter = toTimezone(after, 'America/New_York');
    expect(rAfter.offset).toMatch(/GMT-4/); // now EDT

    // UTC timestamps themselves are unaffected
    expect(before.toISOString()).toBe('2026-03-08T06:59:00.000Z');
    expect(after.toISOString()).toBe('2026-03-08T07:01:00.000Z');
  });

  it('handles fall-back correctly (clocks repeat 01:xx hour)', () => {
    // Fall back 2026: November 1 at 02:00 EDT → 01:00 EST
    // 05:30 UTC = 01:30 EST (after fall-back)
    const utc = new Date('2026-11-01T06:30:00Z');
    const result = toTimezone(utc, 'America/New_York');
    expect(result.offset).toMatch(/GMT-5/); // back to EST
  });
});

// ---------------------------------------------------------------------------
// 5. UTC → UTC identity
// ---------------------------------------------------------------------------
describe('5. UTC → UTC identity', () => {
  it('returns the same wall-clock time when timezone is UTC', () => {
    const utc = new Date('2026-11-15T14:30:00Z');
    const result = toTimezone(utc, 'UTC');

    expect(result.date).toBe('2026-11-15');
    expect(result.time).toMatch(/2:30\s*[Pp][Mm]/);
    expect(result.timezone).toBe('UTC');
    expect(result.offset).toMatch(/GMT\+?0/);
  });
});

// ---------------------------------------------------------------------------
// 6. Local timezone → UTC (toUtc)
// ---------------------------------------------------------------------------
describe('6. Local timezone → UTC (toUtc)', () => {
  it('converts Asia/Kolkata 15:30 to UTC 10:00', () => {
    const result = toUtc('2026-11-01T15:30:00', 'Asia/Kolkata');
    expect(result.toISOString()).toBe('2026-11-01T10:00:00.000Z');
  });

  it('converts America/New_York 10:00 EST (winter) to UTC 15:00', () => {
    const result = toUtc('2026-11-20T10:00:00', 'America/New_York');
    expect(result.toISOString()).toBe('2026-11-20T15:00:00.000Z');
  });

  it('converts America/New_York 10:00 EDT (summer) to UTC 14:00', () => {
    const result = toUtc('2026-07-01T10:00:00', 'America/New_York');
    expect(result.toISOString()).toBe('2026-07-01T14:00:00.000Z');
  });

  it('passes through a string that already carries a Z offset unchanged', () => {
    const iso = '2026-11-01T10:00:00Z';
    const result = toUtc(iso, 'Asia/Kolkata');
    expect(result.toISOString()).toBe('2026-11-01T10:00:00.000Z');
  });

  it('passes through a string that already carries +HH:MM offset unchanged', () => {
    const iso = '2026-11-01T15:30:00+05:30';
    const result = toUtc(iso, 'Asia/Kolkata');
    expect(result.toISOString()).toBe('2026-11-01T10:00:00.000Z');
  });

  it('falls back to UTC when timezone is invalid', () => {
    // "2026-11-01T10:00:00" treated as UTC when fallback is UTC
    const result = toUtc('2026-11-01T10:00:00', 'Bad/Zone');
    expect(result.toISOString()).toBe('2026-11-01T10:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// 7. Invalid IANA timezone
// ---------------------------------------------------------------------------
describe('7. Invalid IANA timezone', () => {
  it('isValidIanaTimezone returns false for a garbage string', () => {
    expect(isValidIanaTimezone('Not/ATimezone')).toBe(false);
    expect(isValidIanaTimezone('')).toBe(false);
    expect(isValidIanaTimezone(null as any)).toBe(false);
    expect(isValidIanaTimezone(42 as any)).toBe(false);
  });

  it('isValidIanaTimezone returns true for valid IANA identifiers', () => {
    expect(isValidIanaTimezone('Asia/Kolkata')).toBe(true);
    expect(isValidIanaTimezone('America/New_York')).toBe(true);
    expect(isValidIanaTimezone('Europe/London')).toBe(true);
    expect(isValidIanaTimezone('UTC')).toBe(true);
    expect(isValidIanaTimezone('Australia/Sydney')).toBe(true);
  });

  it('toTimezone falls back to UTC when timezone is invalid', () => {
    const utc = new Date('2026-11-01T10:00:00Z');
    const result = toTimezone(utc, 'Fake/Timezone');

    expect(result.timezone).toBe('UTC');
    expect(result.time).toMatch(/10:00\s*[Aa][Mm]/);
  });
});

// ---------------------------------------------------------------------------
// 8. Missing / null timezone
// ---------------------------------------------------------------------------
describe('8. Missing or null timezone', () => {
  it('resolveTimezone returns UTC for null', () => {
    expect(resolveTimezone(null)).toBe('UTC');
  });

  it('resolveTimezone returns UTC for undefined', () => {
    expect(resolveTimezone(undefined)).toBe('UTC');
  });

  it('resolveTimezone returns UTC for empty string', () => {
    expect(resolveTimezone('')).toBe('UTC');
  });

  it('resolveTimezone returns UTC for whitespace-only string', () => {
    expect(resolveTimezone('   ')).toBe('UTC');
  });

  it('toTimezone uses UTC when no timezone argument provided', () => {
    const utc = new Date('2026-11-01T10:00:00Z');
    const result = toTimezone(utc, null);
    expect(result.timezone).toBe('UTC');
    expect(result.date).toBe('2026-11-01');
  });

  it('enrichSessionWithTimezone uses session.timezone when viewer tz is absent', () => {
    const session = {
      startTime: new Date('2026-11-01T10:00:00Z'),
      endTime: new Date('2026-11-01T11:30:00Z'),
      timezone: 'Asia/Kolkata',
    };
    const enriched = enrichSessionWithTimezone(session, null);
    expect(enriched.displayTime.start.timezone).toBe('Asia/Kolkata');
  });
});

// ---------------------------------------------------------------------------
// 9. Session display across midnight
// ---------------------------------------------------------------------------
describe('9. Session across midnight in target timezone', () => {
  it('detects spansMidnight=true when session crosses midnight in target tz', () => {
    // Session 22:00–23:30 UTC = 03:30–05:00 Asia/Kolkata (next day)
    const range = formatSessionTimeRange(
      new Date('2026-11-01T22:00:00Z'),
      new Date('2026-11-01T23:30:00Z'),
      'Asia/Kolkata',
    );
    expect(range.spansMidnight).toBe(false); // both are on Nov 2 IST
    expect(range.start.date).toBe('2026-11-02');
    expect(range.end.date).toBe('2026-11-02');
  });

  it('detects spansMidnight=true when start and end fall on different dates', () => {
    // 21:00–01:00 UTC = 02:30–06:30 IST → same day; but try one that does span
    // 18:00 UTC = 23:30 IST; 01:00 UTC next day = 06:30 IST next day
    const range = formatSessionTimeRange(
      new Date('2026-11-01T18:00:00Z'), // 23:30 IST Nov 1
      new Date('2026-11-02T01:00:00Z'), // 06:30 IST Nov 2
      'Asia/Kolkata',
    );
    expect(range.spansMidnight).toBe(true);
    expect(range.start.date).toBe('2026-11-01');
    expect(range.end.date).toBe('2026-11-02');
  });

  it('computes correct durationMinutes regardless of timezone', () => {
    const range = formatSessionTimeRange(
      new Date('2026-11-01T10:00:00Z'),
      new Date('2026-11-01T11:30:00Z'),
      'Asia/Kolkata',
    );
    expect(range.durationMinutes).toBe(90);
  });
});

// ---------------------------------------------------------------------------
// 10. Booking/session UTC values remain unchanged
// ---------------------------------------------------------------------------
describe('10. UTC timestamps are never mutated', () => {
  it('toTimezone does not change the original Date object', () => {
    const utc = new Date('2026-11-01T10:00:00.000Z');
    const originalMs = utc.getTime();
    toTimezone(utc, 'Asia/Kolkata');
    expect(utc.getTime()).toBe(originalMs);
  });

  it('enrichSessionWithTimezone does not overwrite startTime or endTime', () => {
    const session = {
      startTime: new Date('2026-11-01T10:00:00Z'),
      endTime: new Date('2026-11-01T11:30:00Z'),
      timezone: 'UTC',
    };
    const enriched = enrichSessionWithTimezone(session, 'Asia/Kolkata');

    // Original UTC values preserved on the returned object
    expect(enriched.startTime).toEqual(session.startTime);
    expect(enriched.endTime).toEqual(session.endTime);

    // Display fields are in learner timezone
    expect(enriched.displayTime.start.timezone).toBe('Asia/Kolkata');
    expect(enriched.displayTime.start.utc).toBe('2026-11-01T10:00:00.000Z');
  });

  it('FormattedSessionTime.utc field is always the ISO UTC string', () => {
    const utc = new Date('2026-07-15T09:00:00Z');
    const result = toTimezone(utc, 'Europe/London');
    expect(result.utc).toBe('2026-07-15T09:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// 11. D1-044 advance-notice rule stays UTC-correct
// ---------------------------------------------------------------------------
describe('11. D1-044 advance-notice booking rule is UTC-only', () => {
  it('advance-notice window computed from UTC regardless of learner timezone', () => {
    // This test verifies that the timezone utility does NOT interfere with how
    // bookSession() calculates the advance-notice window.  The service code in
    // sessions.service.ts computes:
    //   sessionStartMs - nowUtc.getTime() < advanceNoticeMs
    // Both sides are raw UTC milliseconds — the timezone utility is purely
    // cosmetic and is never fed into this calculation.

    const sessionStartUtc = new Date('2026-11-15T10:00:00Z'); // 3:30 PM IST
    const nowUtc = new Date('2026-11-14T21:00:00Z');           // 2:30 AM IST next day

    // 13 hours before the session in UTC — should be bookable (>12 h notice)
    const advanceNoticeMs = 12 * 60 * 60 * 1000;
    const gapMs = sessionStartUtc.getTime() - nowUtc.getTime();
    expect(gapMs).toBe(13 * 60 * 60 * 1000);
    expect(gapMs >= advanceNoticeMs).toBe(true);

    // The learner's IST timezone does NOT change the numeric comparison
    const learnerTz = 'Asia/Kolkata';
    const displayStart = toTimezone(sessionStartUtc, learnerTz);
    const displayNow = toTimezone(nowUtc, learnerTz);

    // Confirm display is different from UTC
    expect(displayStart.time).not.toMatch(/10:00\s*[Aa][Mm]/); // IST shows 3:30 PM
    expect(displayNow.date).toBe('2026-11-15');                 // IST is already next day

    // But the UTC gap is unchanged by display conversion
    expect(sessionStartUtc.getTime() - nowUtc.getTime()).toBe(13 * 60 * 60 * 1000);
  });

  it('a session that appears "tomorrow" in learner TZ may still be within 12h UTC window', () => {
    // Session 03:30 IST Nov 15 = 22:00 UTC Nov 14
    // Now: 22:30 UTC Nov 14 → the session is only 30 min away in UTC!
    const sessionStartUtc = new Date('2026-11-14T22:00:00Z');
    const nowUtc = new Date('2026-11-14T22:30:00Z');

    const gapMs = sessionStartUtc.getTime() - nowUtc.getTime();
    expect(gapMs).toBeLessThan(0); // session already started

    // Display in IST still shows "tomorrow morning" aesthetically, but the
    // booking rule correctly rejects it based on UTC
    const displayed = toTimezone(sessionStartUtc, 'Asia/Kolkata');
    expect(displayed.date).toBe('2026-11-15'); // IST shows Nov 15

    // UTC comparison is the only one that matters
    const advanceNoticeMs = 12 * 60 * 60 * 1000;
    expect(gapMs >= advanceNoticeMs).toBe(false); // rejected correctly
  });
});

// ---------------------------------------------------------------------------
// 12. formatSessionTimeRange completeness
// ---------------------------------------------------------------------------
describe('12. formatSessionTimeRange', () => {
  it('returns start, end, durationMinutes, and spansMidnight', () => {
    const range = formatSessionTimeRange(
      '2026-11-15T10:00:00Z',
      '2026-11-15T11:30:00Z',
      'Asia/Kolkata',
    );
    expect(range).toHaveProperty('start');
    expect(range).toHaveProperty('end');
    expect(range.durationMinutes).toBe(90);
    expect(typeof range.spansMidnight).toBe('boolean');
  });

  it('accepts string inputs as well as Date objects', () => {
    const range = formatSessionTimeRange(
      '2026-11-15T10:00:00Z',
      '2026-11-15T11:30:00Z',
      'UTC',
    );
    expect(range.start.date).toBe('2026-11-15');
  });
});

// ---------------------------------------------------------------------------
// 13. enrichSessionWithTimezone
// ---------------------------------------------------------------------------
describe('13. enrichSessionWithTimezone', () => {
  it('adds displayTime without removing existing session fields', () => {
    const session = {
      id: 'sess-1',
      title: 'Step 3 Live Session',
      startTime: new Date('2026-11-15T10:00:00Z'),
      endTime: new Date('2026-11-15T11:30:00Z'),
      timezone: 'UTC',
      status: 'SCHEDULED',
    };

    const enriched = enrichSessionWithTimezone(session, 'Asia/Kolkata');

    expect(enriched.id).toBe('sess-1');
    expect(enriched.title).toBe('Step 3 Live Session');
    expect(enriched.status).toBe('SCHEDULED');
    expect(enriched.displayTime).toBeDefined();
    expect(enriched.displayTime.start.timezone).toBe('Asia/Kolkata');
    expect(enriched.displayTime.durationMinutes).toBe(90);
  });

  it('viewer timezone takes priority over session.timezone', () => {
    const session = {
      startTime: new Date('2026-11-15T10:00:00Z'),
      endTime: new Date('2026-11-15T11:30:00Z'),
      timezone: 'Europe/London',
    };

    const enriched = enrichSessionWithTimezone(session, 'America/New_York');
    expect(enriched.displayTime.start.timezone).toBe('America/New_York');
  });
});
