/**
 * WhatBoutMe LMS Timezone Utility (Client-Side)
 * Handles DST-aware display formatting and wall-clock to UTC conversions.
 * Stored database values are ALWAYS in UTC.
 */

export interface TimezoneOption {
  value: string;
  label: string;
}

export const COMMON_TIMEZONES: TimezoneOption[] = [
  { value: "Asia/Kolkata", label: "India (IST) · Asia/Kolkata" },
  { value: "Asia/Dubai", label: "UAE / Gulf (GST) · Asia/Dubai" },
  { value: "Europe/London", label: "UK (GMT/BST) · Europe/London" },
  { value: "America/New_York", label: "US Eastern (ET) · America/New_York" },
  { value: "America/Chicago", label: "US Central (CT) · America/Chicago" },
  { value: "America/Denver", label: "US Mountain (MT) · America/Denver" },
  { value: "America/Los_Angeles", label: "US Pacific (PT) · America/Los_Angeles" },
  { value: "Australia/Sydney", label: "Australia (AEST/AEDT) · Australia/Sydney" },
  { value: "UTC", label: "Coordinated Universal Time · UTC" },
];

export function getSystemTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz === "Asia/Calcutta") return "Asia/Kolkata";
    return tz || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Returns a list of options with the user's detected local timezone prepended if missing.
 */
export function getTimezoneOptions(): TimezoneOption[] {
  const local = getSystemTimezone();
  const exists = COMMON_TIMEZONES.some((t) => t.value === local);
  if (!exists) {
    return [{ value: local, label: `Local (${local})` }, ...COMMON_TIMEZONES];
  }
  return COMMON_TIMEZONES;
}

/**
 * Converts a local wall-clock date and time in a given IANA timezone into a UTC Date.
 * Handles DST shifts automatically.
 */
export function localWallTimeToUtc(
  dateStr: string,
  timeStr: string,
  timeZone: string,
): Date {
  const normalizedTime = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
  const naiveIso = `${dateStr}T${normalizedTime}`;
  const naive = new Date(`${naiveIso}Z`);

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(naive);

    const get = (type: string) =>
      parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);

    const year = get("year");
    const month = get("month") - 1;
    const day = get("day");
    const hour = get("hour") === 24 ? 0 : get("hour");
    const min = get("minute");
    const sec = get("second");

    const localAsUtc = Date.UTC(year, month, day, hour, min, sec);
    const offsetMs = naive.getTime() - localAsUtc;
    return new Date(naive.getTime() + offsetMs);
  } catch {
    return new Date(naiveIso);
  }
}

/**
 * Extracts wall-clock date string (YYYY-MM-DD) for a UTC ISO timestamp in a target timezone.
 */
export function getSessionDateInTz(utcIso: string, timeZone: string): string {
  try {
    const d = new Date(utcIso);
    if (isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return utcIso.slice(0, 10);
  }
}

/**
 * Extracts wall-clock date and time components (YYYY-MM-DD and HH:mm) in a target timezone.
 */
export function utcToWallClock(
  utcIso: string,
  timeZone: string,
): { date: string; time: string } {
  try {
    const d = new Date(utcIso);
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);

    const time = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);

    return { date, time };
  } catch {
    const d = new Date(utcIso);
    return {
      date: d.toISOString().slice(0, 10),
      time: d.toISOString().slice(11, 16),
    };
  }
}

/**
 * Formats a start and end time range for display in the target timezone.
 */
export function formatWhenInTz(start: string, end: string, timeZone: string): string {
  const s = new Date(start);
  const e = new Date(end);

  try {
    const dateFormatted = s.toLocaleDateString(undefined, {
      timeZone,
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    const startTime = s.toLocaleTimeString(undefined, {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    const endTime = e.toLocaleTimeString(undefined, {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    return `${dateFormatted}, ${startTime} – ${endTime}`;
  } catch {
    return `${s.toLocaleDateString()}, ${s.toLocaleTimeString()} – ${e.toLocaleTimeString()}`;
  }
}

/**
 * Formats a short time string (e.g. "10:30 AM") in the target timezone.
 */
export function formatShortTimeInTz(utcIso: string, timeZone: string): string {
  const d = new Date(utcIso);
  try {
    return d.toLocaleTimeString(undefined, {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: true });
  }
}
