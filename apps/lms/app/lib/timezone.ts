/**
 * WhatBoutMe LMS Timezone Utility (Learner Portal)
 * Formats note timestamps, video timings, and session dates in the learner's local timezone.
 */

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
 * Formats a UTC ISO date string into a friendly localized date and time in the learner's timezone.
 * Example: "Oct 17, 2026, 11:45 AM"
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
