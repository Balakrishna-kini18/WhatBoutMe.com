/**
 * Utility to evaluate whether a registration deadline has expired,
 * handling both explicit timestamp deadlines and date-only (midnight UTC) deadlines.
 */

/**
 * Returns true if the registration deadline has strictly passed relative to `now`.
 * If `deadline` is null or undefined, returns false (no deadline configured).
 * If `deadline` is at midnight UTC (00:00:00.000Z), it represents a date-only deadline
 * (e.g. from an HTML date picker "YYYY-MM-DD") and remains valid throughout the entire
 * UTC day, expiring only at 23:59:59.999Z of that day.
 */
export function isRegistrationDeadlinePassed(
  deadline: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!deadline) return false;
  const d = new Date(deadline);
  if (isNaN(d.getTime())) return false;

  // Check if date-only (midnight UTC)
  if (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  ) {
    const endOfDay = new Date(
      Date.UTC(
        d.getUTCFullYear(),
        d.getUTCMonth(),
        d.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
    );
    return endOfDay.getTime() < now.getTime();
  }

  return d.getTime() < now.getTime();
}

/**
 * Returns a UTC start-of-day Date for database query filters (`registrationDeadline: { gte: cutoff }`).
 * This ensures batches whose registration deadline is today (even if stored at 00:00:00.000Z)
 * are included in query results and not prematurely excluded by the database engine.
 */
export function getRegistrationDeadlineCutoff(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );
}

