import { getSessionDateInTz, utcToWallClock } from "../../lib/timezone";

/** Minimal shape the calendar needs (the page's `Meeting` is assignable to this). */
export interface CalendarMeeting {
  id: string;
  title: string;
  sessionType: string;
  startTime: string;
  endTime: string;
  status: string;
  joinUrl: string | null;
  learner?: { name?: string | null; email?: string | null } | null;
  batch?: { name: string } | null;
  hostTrainer?: { name?: string | null; email?: string | null } | null;
}

export type CalendarKind = "discovery" | "one_on_one" | "live";
export type CalendarViewMode = "week" | "day" | "month" | "agenda";

export const KIND_META: Record<
  CalendarKind,
  { label: string; color: string; bg: string; border: string }
> = {
  discovery: { label: "Enquiry Calls (15-min)", color: "#e11d48", bg: "#fff1f2", border: "#fda4af" },
  one_on_one: { label: "1:1 Calls", color: "#0284c7", bg: "#f0f9ff", border: "#7dd3fc" },
  live: { label: "Batch Live Sessions", color: "#d97706", bg: "#fffbeb", border: "#fcd34d" },
};

export const KINDS: CalendarKind[] = ["discovery", "one_on_one", "live"];

export function kindOf(sessionType: string): CalendarKind {
  switch (sessionType) {
    case "SPEAKER_DISCOVERY_CALL":
      return "discovery";
    case "ONE_ON_ONE":
    case "ONE_ON_ONE_WITH_RO":
    case "WELCOME_CALL_11_STEPS":
    case "CLOSING_CALL_11_STEPS":
      return "one_on_one";
    default:
      return "live";
  }
}

/** Short, human label for an event block, e.g. "1:1 Call · Charan Pai" instead of the long title. */
export function shortTitle(m: CalendarMeeting): string {
  const kind = kindOf(m.sessionType);
  if (kind === "discovery") {
    const stripped = m.title
      .replace(/^1-to-1 Discovery Call:\s*Roweena\s*&\s*/i, "")
      .replace(/^Discovery Call:\s*/i, "")
      .replace(/^Enquiry Call:\s*/i, "")
      .trim();
    const name = m.learner?.name || stripped || "Enquiry";
    return `Enquiry · ${name}`;
  }
  if (kind === "one_on_one") {
    const stripped = m.title
      .replace(/^1-on-1 Coaching:\s*/i, "")
      .replace(/^1:1 Call:\s*/i, "")
      .replace(/^1-on-1:\s*/i, "")
      .replace(/^Stage 4 1:1 Call:\s*/i, "")
      .trim();
    const name = m.learner?.name || stripped || "Learner";
    return `1:1 Call · ${name}`;
  }
  return m.title;
}

/** Secondary line, e.g. batch name or trainer. */
export function subTitle(m: CalendarMeeting): string {
  const kind = kindOf(m.sessionType);
  if (kind === "live") return m.batch?.name || "";
  if (kind === "discovery") return "15-min Enquiry";
  return m.batch?.name || m.hostTrainer?.name || "";
}

/** Whether a session has already happened (end time is in the past). */
export function isPast(m: CalendarMeeting): boolean {
  return new Date(m.endTime).getTime() < Date.now();
}

// ── Date helpers (all "YYYY-MM-DD" strings, timezone-agnostic arithmetic) ──

const pad = (n: number) => String(n).padStart(2, "0");

export function ymdOf(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

export function parseYmd(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split("-").map(Number);
  return { y: y ?? 1970, m: (m ?? 1) - 1, d: d ?? 1 };
}

export function addDays(ymd: string, n: number): string {
  const { y, m, d } = parseYmd(ymd);
  const dt = new Date(Date.UTC(y, m, d + n));
  return ymdOf(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
}

export function addMonths(ymd: string, n: number): string {
  const { y, m } = parseYmd(ymd);
  const dt = new Date(Date.UTC(y, m + n, 1));
  return ymdOf(dt.getUTCFullYear(), dt.getUTCMonth(), 1);
}

/** 0 = Sunday */
export function weekdayOf(ymd: string): number {
  const { y, m, d } = parseYmd(ymd);
  return new Date(Date.UTC(y, m, d)).getUTCDay();
}

export function startOfWeek(ymd: string): string {
  return addDays(ymd, -weekdayOf(ymd));
}

export function todayIn(timeZone: string): string {
  return getSessionDateInTz(new Date().toISOString(), timeZone);
}

export function nowMinutesIn(timeZone: string): number {
  const { time } = utcToWallClock(new Date().toISOString(), timeZone);
  return toMinutes(time);
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function fmtTime(minutes: number, format: "12h" | "24h" = "12h"): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  if (format === "24h") {
    return `${pad(h24)}:${pad(m)}`;
  }
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${pad(m)} ${ampm}`;
}

export function fmtHourLabel(hour: number, format: "12h" | "24h" = "12h"): string {
  if (hour === 0) return "";
  if (format === "24h") {
    return `${pad(hour)}:00`;
  }
  return fmtTime(hour * 60, "12h");
}

const dateOf = (ymd: string) => {
  const { y, m, d } = parseYmd(ymd);
  return new Date(Date.UTC(y, m, d, 12));
};

export function fmtDayLong(ymd: string): string {
  return dateOf(ymd).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function fmtMonthYear(ymd: string): string {
  return dateOf(ymd).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function fmtWeekRange(start: string): string {
  const end = addDays(start, 6);
  const s = parseYmd(start);
  const e = parseYmd(end);
  const sd = dateOf(start);
  const ed = dateOf(end);
  const mon = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  if (s.y === e.y && s.m === e.m) return `${mon(sd)} ${s.d} – ${e.d}, ${e.y}`;
  if (s.y === e.y) return `${mon(sd)} ${s.d} – ${mon(ed)} ${e.d}, ${e.y}`;
  return `${mon(sd)} ${s.d}, ${s.y} – ${mon(ed)} ${e.d}, ${e.y}`;
}

export function weekdayShort(ymd: string): string {
  return dateOf(ymd).toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC",
  });
}

export function fmtDateShort(ymd: string): string {
  return dateOf(ymd).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// ── Event placement ──

export interface PlacedEvent<T extends CalendarMeeting> {
  m: T;
  /** minutes from midnight, in display timezone */
  start: number;
  /** minutes, clamped to end of day */
  end: number;
  col: number;
  cols: number;
}

/** Minimum visual duration so short (15 min) calls stay clickable. */
const MIN_VISUAL = 30;

export function eventsOnDay<T extends CalendarMeeting>(
  meetings: T[],
  ymd: string,
  timeZone: string,
): T[] {
  return meetings
    .filter((m) => {
      const startYmd = getSessionDateInTz(m.startTime, timeZone);
      const endYmd = getSessionDateInTz(m.endTime, timeZone);
      return startYmd === ymd || (startYmd <= ymd && endYmd >= ymd && m.endTime > m.startTime);
    })
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

export function placeDay<T extends CalendarMeeting>(
  dayEvents: T[],
  timeZone: string,
  targetYmd?: string,
): PlacedEvent<T>[] {
  const items = dayEvents
    .map((m) => {
      const startYmd = getSessionDateInTz(m.startTime, timeZone);
      const endYmd = getSessionDateInTz(m.endTime, timeZone);
      const isStartDay = !targetYmd || startYmd === targetYmd;
      const isEndDay = !targetYmd || endYmd === targetYmd;

      const rawStart = isStartDay
        ? toMinutes(utcToWallClock(m.startTime, timeZone).time)
        : 0;
      const rawEnd = isEndDay
        ? toMinutes(utcToWallClock(m.endTime, timeZone).time)
        : 24 * 60;

      const dur = Math.max(rawEnd - rawStart, 0);
      const start = Math.min(Math.max(rawStart, 0), 24 * 60);
      const end = Math.min(start + Math.max(dur, MIN_VISUAL), 24 * 60);
      return { m, start, end, col: 0, cols: 1 };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);

  let cluster: typeof items = [];
  let clusterEnd = -1;
  const flush = () => {
    const colEnds: number[] = [];
    for (const it of cluster) {
      let c = colEnds.findIndex((e) => e <= it.start);
      if (c === -1) {
        c = colEnds.length;
        colEnds.push(it.end);
      } else {
        colEnds[c] = it.end;
      }
      it.col = c;
    }
    for (const it of cluster) it.cols = colEnds.length;
    cluster = [];
    clusterEnd = -1;
  };

  for (const it of items) {
    if (cluster.length && it.start >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  if (cluster.length) flush();
  return items;
}

/** Month grid: array of weeks, each 7 ymd strings, covering the month of `anchor`. */
export function monthWeeks(anchor: string): string[][] {
  const { y, m } = parseYmd(anchor);
  const first = ymdOf(y, m, 1);
  const gridStart = startOfWeek(first);
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const last = ymdOf(y, m, daysInMonth);
  const weeks: string[][] = [];
  let cursor = gridStart;
  while (cursor <= last) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) week.push(addDays(cursor, i));
    weeks.push(week);
    cursor = addDays(cursor, 7);
  }
  return weeks;
}
