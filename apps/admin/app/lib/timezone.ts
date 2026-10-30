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
  if (!start) return "TBD";
  const s = new Date(start);
  if (isNaN(s.getTime())) return "TBD";

  let e = end ? new Date(end) : null;
  if (e && isNaN(e.getTime())) e = null;

  try {
    const tz = timeZone || "UTC";
    const dateFormatted = s.toLocaleDateString(undefined, {
      timeZone: tz,
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    const startTime = s.toLocaleTimeString(undefined, {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    if (e) {
      const endTime = e.toLocaleTimeString(undefined, {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
      return `${dateFormatted}, ${startTime} – ${endTime}`;
    }

    return `${dateFormatted}, ${startTime}`;
  } catch {
    try {
      if (e) {
        return `${s.toLocaleDateString()}, ${s.toLocaleTimeString()} – ${e.toLocaleTimeString()}`;
      }
      return `${s.toLocaleDateString()}, ${s.toLocaleTimeString()}`;
    } catch {
      return "TBD";
    }
  }
}

/**
 * Formats a short time string (e.g. "10:30 AM") in the target timezone.
 */
export function formatShortTimeInTz(utcIso: string, timeZone: string): string {
  if (!utcIso) return "";
  const d = new Date(utcIso);
  if (isNaN(d.getTime())) return "";
  try {
    return d.toLocaleTimeString(undefined, {
      timeZone: timeZone || "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    try {
      return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: true });
    } catch {
      return "";
    }
  }
}

/**
 * Formats a given UTC timestamp showing both the visitor's local timezone and GST (Dubai) / IST (India).
 */
export function formatMultiTimezoneSummary(
  utcIso: string,
  localTz: string = getSystemTimezone(),
): { local: string; gst: string; ist: string; fullDate: string } {
  const d = new Date(utcIso);
  const timeOpts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit", hour12: true };
  const dateOpts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", year: "numeric" };

  try {
    const fullDate = d.toLocaleDateString("en-US", { ...dateOpts, timeZone: localTz });
    const local = `${d.toLocaleTimeString("en-US", { ...timeOpts, timeZone: localTz })} (${localTz.split("/").pop()?.replace(/_/g, " ") || localTz})`;
    const gst = `${d.toLocaleTimeString("en-US", { ...timeOpts, timeZone: "Asia/Dubai" })} GST (Dubai)`;
    const ist = `${d.toLocaleTimeString("en-US", { ...timeOpts, timeZone: "Asia/Kolkata" })} IST (India)`;

    return { local, gst, ist, fullDate };
  } catch {
    return {
      local: d.toLocaleTimeString(),
      gst: d.toLocaleTimeString(),
      ist: d.toLocaleTimeString(),
      fullDate: d.toLocaleDateString(),
    };
  }
}

/**
 * Formats a UTC ISO date string into a friendly localized date and time in the user's timezone.
 * Example: "Oct 19, 2026, 11:45 AM"
 */
export function formatNoteDate(utcIso: string | Date, timeZone?: string): string {
  if (!utcIso) return "";
  const d = typeof utcIso === "string" ? new Date(utcIso) : utcIso;
  if (isNaN(d.getTime())) return "";

  const tz = timeZone || getSystemTimezone();
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

/**
 * Formats seconds into MM:SS or HH:MM:SS format for video timestamps.
 */
export function formatVideoTime(seconds?: number | null): string {
  if (seconds == null || isNaN(seconds) || seconds < 0) return "0:00";
  const totalSecs = Math.floor(seconds);
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
