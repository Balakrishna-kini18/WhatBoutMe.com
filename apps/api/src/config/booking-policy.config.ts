/**
 * D1-044: Learner Booking Engine — Advance-Notice & Capacity Policy Configuration
 *
 * All policy values are configurable at runtime via environment variables so
 * the policy does not need to be touched in multiple call-sites.
 *
 * Booking advance-notice policy:
 *   DEFAULT_ADVANCE_NOTICE_HOURS (env: BOOKING_ADVANCE_NOTICE_HOURS, default: 12)
 *   Minimum lead-time between now (UTC) and session.startTime before a learner
 *   may book a slot.  Any booking request within this window is rejected with a
 *   clear error message.
 *
 * Architecture Reference:
 *   DEVELOPER_SPLIT_PLAN.md §F D1-044
 */

/**
 * Returns the configured minimum advance booking notice in milliseconds.
 * Reads BOOKING_ADVANCE_NOTICE_HOURS from the process environment, falling
 * back to 12 hours (the client-mandated default).
 */
export function getAdvanceNoticeMs(): number {
  const raw = process.env.BOOKING_ADVANCE_NOTICE_HOURS;
  if (raw !== undefined) {
    const hours = parseFloat(raw);
    if (!Number.isNaN(hours) && hours >= 0) {
      return hours * 60 * 60 * 1000;
    }
  }
  return 12 * 60 * 60 * 1000; // 12 hours default
}

/**
 * Returns the configured minimum advance booking notice in hours (for display
 * and error messages), rounding to one decimal place.
 */
export function getAdvanceNoticeHours(): number {
  return getAdvanceNoticeMs() / (60 * 60 * 1000);
}
