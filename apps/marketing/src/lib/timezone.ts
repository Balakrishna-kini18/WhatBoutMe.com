/**
 * Client-Side Timezone Utilities for Public Marketing Website
 * All stored database values are in UTC.
 */

export interface TimezoneOption {
  value: string;
  label: string;
}

export const COMMON_TIMEZONES: TimezoneOption[] = [
  { value: "Asia/Dubai", label: "UAE / Gulf (GST) · Asia/Dubai" },
  { value: "Asia/Kolkata", label: "India (IST) · Asia/Kolkata" },
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
    return tz || "Asia/Dubai";
  } catch {
    return "Asia/Dubai";
  }
}

export function getTimezoneOptions(): TimezoneOption[] {
  const local = getSystemTimezone();
  const exists = COMMON_TIMEZONES.some((t) => t.value === local);
  if (!exists) {
    return [{ value: local, label: `Local (${local})` }, ...COMMON_TIMEZONES];
  }
  return COMMON_TIMEZONES;
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
