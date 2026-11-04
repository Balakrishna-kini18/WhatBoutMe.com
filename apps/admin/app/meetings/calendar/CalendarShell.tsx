"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import s from "./calendar-view.module.css";
import {
  KINDS,
  KIND_META,
  type CalendarKind,
  type CalendarMeeting,
  type CalendarViewMode,
  addDays,
  addMonths,
  eventsOnDay,
  fmtDayLong,
  fmtDateShort,
  fmtHourLabel,
  fmtMonthYear,
  fmtTime,
  fmtWeekRange,
  isPast,
  kindOf,
  monthWeeks,
  parseYmd,
  placeDay,
  shortTitle,
  startOfWeek,
  subTitle,
  todayIn,
  toMinutes,
  weekdayShort,
} from "./calendar-utils";
import { utcToWallClock } from "../../lib/timezone";
import { CustomSelect } from "../../components";

const HOUR_H = 56;
const VIEWS: Array<{ id: CalendarViewMode; label: string; key: string }> = [
  { id: "day", label: "Day", key: "D" },
  { id: "week", label: "Week", key: "W" },
  { id: "month", label: "Month", key: "M" },
  { id: "agenda", label: "Agenda", key: "A" },
];

/** Clean, professional, non-truncating labels for common timezones */
export const CLEAN_TZ_LABELS: Record<string, string> = {
  "Asia/Kolkata": "India (IST)",
  "Asia/Dubai": "UAE / Gulf (GST)",
  "Europe/London": "UK (GMT/BST)",
  "America/New_York": "US Eastern (ET)",
  "America/Chicago": "US Central (CT)",
  "America/Denver": "US Mountain (MT)",
  "America/Los_Angeles": "US Pacific (PT)",
  "Australia/Sydney": "Australia (AEST)",
  "UTC": "Universal (UTC)",
};

export interface CalendarShellProps<T extends CalendarMeeting> {
  meetings: T[];
  timeZone: string;
  timezoneOptions: Array<{ value: string; label: string }>;
  onTimezoneChange: (tz: string) => void;
  onSelect: (m: T) => void;
  onCreate: (dateYmd: string, startTime?: string) => void;
  initialDate?: string;
  timeFormat?: "12h" | "24h";
  onTimeFormatChange?: (fmt: "12h" | "24h") => void;
}

export default function CalendarShell<T extends CalendarMeeting>({
  meetings,
  timeZone,
  timezoneOptions,
  onTimezoneChange,
  onSelect,
  onCreate,
  initialDate,
  timeFormat: timeFormatProp,
  onTimeFormatChange,
}: CalendarShellProps<T>) {
  const [view, setView] = useState<CalendarViewMode>("week");
  const [internalTimeFormat, setInternalTimeFormat] = useState<"12h" | "24h">("12h");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("wbm_time_format");
      if (saved === "12h" || saved === "24h") {
        setInternalTimeFormat(saved);
      }
    }
  }, []);

  const activeTimeFormat = timeFormatProp ?? internalTimeFormat;

  const handleTimeFormatChange = (fmt: "12h" | "24h") => {
    setInternalTimeFormat(fmt);
    if (typeof window !== "undefined") {
      localStorage.setItem("wbm_time_format", fmt);
    }
    onTimeFormatChange?.(fmt);
  };
  const [anchor, setAnchor] = useState<string>(
    () => initialDate || todayIn(timeZone),
  );
  const [visible, setVisible] = useState<Record<CalendarKind, boolean>>({
    discovery: true,
    one_on_one: true,
    live: true,
  });
  const [miniMonth, setMiniMonth] = useState<string>(() => addMonths(anchor, 0));

  useEffect(() => {
    if (initialDate) setAnchor(initialDate);
  }, [initialDate]);

  useEffect(() => {
    setMiniMonth(addMonths(anchor, 0));
  }, [anchor]);

  const today = todayIn(timeZone);

  const shown = useMemo(
    () => meetings.filter((m) => visible[kindOf(m.sessionType)]),
    [meetings, visible],
  );

  const counts = useMemo(() => {
    const c: Record<CalendarKind, number> = { discovery: 0, one_on_one: 0, live: 0 };
    for (const m of meetings) {
      // Only count active, upcoming scheduled sessions (exclude CANCELLED, COMPLETED, and past events)
      const isUpcoming = m.status !== "CANCELLED" && m.status !== "COMPLETED" && !isPast(m);
      if (isUpcoming) c[kindOf(m.sessionType)]++;
    }
    return c;
  }, [meetings]);

  const step = useCallback(
    (dir: 1 | -1) => {
      setAnchor((a) => {
        if (view === "day") return addDays(a, dir);
        if (view === "week") return addDays(a, 7 * dir);
        if (view === "month") return addMonths(a, dir);
        return addDays(a, 14 * dir);
      });
    },
    [view],
  );

  const goToday = useCallback(() => setAnchor(todayIn(timeZone)), [timeZone]);

  // Keyboard navigation shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return;
      if (el?.isContentEditable) return;
      if (document.querySelector('[role="dialog"]')) return;
      switch (e.key.toLowerCase()) {
        case "t": goToday(); break;
        case "d": setView("day"); break;
        case "w": setView("week"); break;
        case "m": setView("month"); break;
        case "a": setView("agenda"); break;
        case "arrowleft": step(-1); break;
        case "arrowright": step(1); break;
        default:
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goToday, step]);

  const title = useMemo(() => {
    if (view === "day") return fmtDayLong(anchor);
    if (view === "week") return fmtWeekRange(startOfWeek(anchor));
    if (view === "month") return fmtMonthYear(anchor);
    return "Agenda";
  }, [view, anchor]);

  const openDay = (ymd: string) => {
    setAnchor(ymd);
    setView("day");
  };

  const selectOptions = useMemo(() => {
    return timezoneOptions.map((o) => ({
      value: o.value,
      label: CLEAN_TZ_LABELS[o.value] || o.label,
    }));
  }, [timezoneOptions]);

  const tzLabel = useMemo(() => {
    return CLEAN_TZ_LABELS[timeZone] || timeZone;
  }, [timeZone]);

  return (
    <div className={s.shell}>
      {/* ── Top Header ── */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <button type="button" className={s.todayBtn} onClick={goToday}>
            Today
          </button>
          <div className={s.stepper}>
            <button type="button" aria-label="Previous" onClick={() => step(-1)}>‹</button>
            <button type="button" aria-label="Next" onClick={() => step(1)}>›</button>
          </div>
          <h2 className={s.title}>{title}</h2>
        </div>

        <div className={s.headerRight}>
          <div className={s.segmented} role="tablist" aria-label="Calendar view switcher">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={view === v.id}
                title={`${v.label} View (${v.key})`}
                className={view === v.id ? s.segActive : ""}
                onClick={() => setView(v.id)}
              >
                {v.label}
              </button>
            ))}
          </div>

          {/* 12h / 24h Time Format Switcher */}
          <div className={s.segmented} role="group" aria-label="Time format switcher">
            <button
              type="button"
              className={activeTimeFormat === "12h" ? s.segActive : ""}
              onClick={() => handleTimeFormatChange("12h")}
              title="12-Hour AM/PM Time Format"
            >
              12h
            </button>
            <button
              type="button"
              className={activeTimeFormat === "24h" ? s.segActive : ""}
              onClick={() => handleTimeFormatChange("24h")}
              title="24-Hour Military Time Format"
            >
              24h
            </button>
          </div>

          <div className={s.tzSelectWrapper} title={`Current display timezone: ${tzLabel}`}>
            <CustomSelect
              ariaLabel="Display Timezone"
              value={timeZone}
              onChange={onTimezoneChange}
              minWidth="180px"
              options={selectOptions}
            />
          </div>
        </div>
      </div>

      <div className={s.body}>
        {/* ── Main Calendar Body (Center / Left) ── */}
        <section className={s.main}>
          {(view === "week" || view === "day") && (
            <TimeGrid
              days={
                view === "week"
                  ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i))
                  : [anchor]
              }
              today={today}
              meetings={shown}
              timeZone={timeZone}
              timeFormat={activeTimeFormat}
              onSelect={onSelect}
              onCreate={onCreate}
              onOpenDay={openDay}
            />
          )}

          {view === "month" && (
            <MonthGrid
              anchor={anchor}
              today={today}
              meetings={shown}
              timeZone={timeZone}
              timeFormat={activeTimeFormat}
              onSelect={onSelect}
              onCreate={onCreate}
              onOpenDay={openDay}
            />
          )}

          {view === "agenda" && (
            <Agenda
              today={today}
              meetings={shown}
              timeZone={timeZone}
              timeFormat={activeTimeFormat}
              onSelect={onSelect}
              onResetFilters={() => setVisible({ discovery: true, one_on_one: true, live: true })}
            />
          )}
        </section>

        {/* ── Right Inspector / Sidebar ── */}
        <aside className={s.sidebar}>
          <MiniMonth
            month={miniMonth}
            selected={anchor}
            today={today}
            meetings={shown}
            timeZone={timeZone}
            onPrev={() => setMiniMonth((m) => addMonths(m, -1))}
            onNext={() => setMiniMonth((m) => addMonths(m, 1))}
            onPick={(d) => setAnchor(d)}
          />

          <TodayList
            today={today}
            meetings={shown}
            timeZone={timeZone}
            timeFormat={activeTimeFormat}
            onSelect={onSelect}
          />

          <div className={s.sideBlock}>
            <div className={s.sideHeading}>Filter by Session Type</div>
            {KINDS.map((k) => {
              const meta = KIND_META[k];
              return (
                <label key={k} className={s.filterRow}>
                  <span
                    className={`${s.filterCheck} ${visible[k] ? s.filterCheckOn : ""}`}
                    style={{
                      borderColor: visible[k] ? meta.color : "#d6d3d1",
                      background: visible[k] ? meta.bg : "transparent",
                    }}
                  >
                    {visible[k] && (
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke={meta.color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <input
                    type="checkbox"
                    checked={visible[k]}
                    onChange={() => setVisible((v) => ({ ...v, [k]: !v[k] }))}
                    className={s.srOnly}
                  />
                  <span className={s.filterLabel}>{meta.label}</span>
                  <span className={s.filterCount} title="Upcoming scheduled sessions">
                    {counts[k]}
                  </span>
                </label>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ───────────────────────── Mini Month ───────────────────────── */

function MiniMonth<T extends CalendarMeeting>({
  month, selected, today, meetings, timeZone, onPrev, onNext, onPick,
}: {
  month: string; selected: string; today: string;
  meetings: T[]; timeZone: string;
  onPrev: () => void; onNext: () => void; onPick: (d: string) => void;
}) {
  const weeks = useMemo(() => monthWeeks(month), [month]);
  const busy = useMemo(() => {
    const set = new Set<string>();
    for (const m of meetings) {
      if (m.status === "CANCELLED") continue;
      set.add(utcToWallClock(m.startTime, timeZone).date);
    }
    return set;
  }, [meetings, timeZone]);
  const curMonth = parseYmd(month).m;

  return (
    <div className={s.mini}>
      <div className={s.miniHead}>
        <span className={s.miniTitle}>{fmtMonthYear(month)}</span>
        <span className={s.miniNav}>
          <button type="button" aria-label="Previous month" onClick={onPrev}>‹</button>
          <button type="button" aria-label="Next month" onClick={onNext}>›</button>
        </span>
      </div>
      <div className={s.miniGrid}>
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i} className={s.miniDow}>{d}</span>
        ))}
        {weeks.flat().map((d) => {
          const p = parseYmd(d);
          const isOut = p.m !== curMonth;
          const isSel = d === selected && d !== today;
          const isDay = d === today;
          return (
            <button
              key={d}
              type="button"
              className={`${s.miniDay} ${isOut ? s.miniOut : ""} ${isDay ? s.miniToday : ""} ${isSel ? s.miniSel : ""}`}
              onClick={() => onPick(d)}
            >
              {p.d}
              {busy.has(d) && <i className={s.miniDot} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────────────── Today Quick-List ───────────────────────── */

function TodayList<T extends CalendarMeeting>({
  today, meetings, timeZone, timeFormat = "12h", onSelect,
}: {
  today: string; meetings: T[]; timeZone: string; timeFormat?: "12h" | "24h"; onSelect: (m: T) => void;
}) {
  const list = eventsOnDay(meetings, today, timeZone).filter(
    (m) => m.status !== "CANCELLED",
  );
  return (
    <div className={s.sideBlock}>
      <div className={s.sideHeading}>
        Today&apos;s Sessions {list.length > 0 && <span className={s.todayBadge}>{list.length}</span>}
      </div>
      {list.length === 0 ? (
        <div className={s.emptySide}>No sessions today</div>
      ) : (
        <ul className={s.todayList}>
          {list.map((m) => {
            const meta = KIND_META[kindOf(m.sessionType)];
            const t = toMinutes(utcToWallClock(m.startTime, timeZone).time);
            return (
              <li key={m.id}>
                <button type="button" onClick={() => onSelect(m)} className={s.todayItem}>
                  <span className={s.todayBar} style={{ background: meta.color }} />
                  <span className={s.todayInfo}>
                    <span className={s.todayTime}>{fmtTime(t, timeFormat)}</span>
                    <span className={s.todayName}>{shortTitle(m)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ───────────────────────── Week / Day Time Grid ───────────────────────── */

function TimeGrid<T extends CalendarMeeting>({
  days, today, meetings, timeZone, timeFormat = "12h", onSelect, onCreate, onOpenDay,
}: {
  days: string[]; today: string; meetings: T[]; timeZone: string; timeFormat?: "12h" | "24h";
  onSelect: (m: T) => void; onCreate: (d: string, t?: string) => void;
  onOpenDay: (d: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const placed = useMemo(
    () => days.map((d) => ({
      day: d,
      items: placeDay(eventsOnDay(meetings, d, timeZone), timeZone, d),
    })),
    [days, meetings, timeZone],
  );

  // Auto-scroll to first event or 8 AM on load
  const firstKey = days[0];
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const starts = placed.flatMap((p) => p.items.map((i) => i.start));
    const target = starts.length ? Math.min(...starts) : 8 * 60;
    el.scrollTop = Math.max(((target - 60) / 60) * HOUR_H, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstKey, days.length]);

  const cols = days.length;
  const hours = Array.from({ length: 24 }, (_, i) => i);

  const clickSlot = (e: React.MouseEvent<HTMLDivElement>, day: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const mins = Math.min(Math.floor(y / HOUR_H * 2) * 30, 23 * 60 + 30);
    const hh = String(Math.floor(mins / 60)).padStart(2, "0");
    const mm = String(mins % 60).padStart(2, "0");
    onCreate(day, `${hh}:${mm}`);
  };

  return (
    <div className={s.grid}>
      <div className={s.gridScroll} ref={scrollRef}>
        {/* Sticky Day Header - inside scroll container so column widths match body 100% */}
        <div className={s.gridHead} style={{ gridTemplateColumns: `64px repeat(${cols}, 1fr)` }}>
          <div className={s.gridHeadGutterCorner} />
          {days.map((d) => {
            const isToday = d === today;
            return (
              <button
                key={d}
                type="button"
                className={`${s.dayHead} ${isToday ? s.dayHeadToday : ""}`}
                onClick={() => cols > 1 && onOpenDay(d)}
                disabled={cols === 1}
              >
                <span className={s.dayHeadName}>{weekdayShort(d)}</span>
                <span className={s.dayHeadNum}>{parseYmd(d).d}</span>
              </button>
            );
          })}
        </div>

        <div
          className={s.gridBody}
          style={{ gridTemplateColumns: `64px repeat(${cols}, 1fr)`, height: HOUR_H * 24 }}
        >
          <div className={s.gutter}>
            {hours.map((h) => (
              <div key={h} className={s.gutterHour} style={{ height: HOUR_H }}>
                <span>{fmtHourLabel(h, timeFormat)}</span>
              </div>
            ))}
          </div>

          {placed.map(({ day, items }) => (
            <div
              key={day}
              className={`${s.col} ${day === today ? s.colToday : ""}`}
              onClick={(e) => clickSlot(e, day)}
            >
              {hours.map((h) => (
                <div key={h} className={s.hourLine} style={{ height: HOUR_H }} />
              ))}

              {items.map((it) => {
                const meta = KIND_META[kindOf(it.m.sessionType)];
                const top = (it.start / 60) * HOUR_H;
                const durMin = it.end - it.start;
                const height = Math.max((durMin / 60) * HOUR_H - 2, 32);
                const widthPct = 100 / it.cols;
                const cancelled = it.m.status === "CANCELLED";
                const done = it.m.status === "COMPLETED";
                const past = isPast(it.m);
                const sub = subTitle(it.m);
                const isShort = durMin <= 35;

                return (
                  <button
                    key={it.m.id}
                    type="button"
                    className={`${s.event} ${cancelled ? s.evCancelled : ""} ${done || past ? s.evPast : ""}`}
                    style={{
                      top,
                      height,
                      left: `calc(${it.col * widthPct}% + 2px)`,
                      width: `calc(${widthPct}% - 4px)`,
                      borderLeftColor: meta.color,
                      background: cancelled ? "#f5f5f4" : meta.bg,
                    }}
                    title={`${fmtTime(it.start, timeFormat)} – ${fmtTime(it.end, timeFormat)} · ${it.m.title} · ${meta.label}`}
                    onClick={(e) => { e.stopPropagation(); onSelect(it.m); }}
                  >
                    {isShort ? (
                      <div className={s.evRowInline}>
                        <span className={s.evTimeInline} style={{ color: cancelled ? "#a8a29e" : meta.color }}>
                          {fmtTime(it.start, timeFormat)}
                        </span>
                        <span className={s.evNameInline}>{shortTitle(it.m)}</span>
                      </div>
                    ) : (
                      <>
                        <span className={s.evTime} style={{ color: cancelled ? "#a8a29e" : meta.color }}>
                          {fmtTime(it.start, timeFormat)} – {fmtTime(it.end, timeFormat)}
                        </span>
                        <span className={s.evName}>{shortTitle(it.m)}</span>
                        {height >= 56 && sub && (
                          <span className={s.evSub}>{sub}</span>
                        )}
                      </>
                    )}

                    {cancelled && <span className={s.evStatusTag}>Cancelled</span>}
                    {done && <span className={s.evStatusTag}>Completed</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Month Grid ───────────────────────── */

function MonthGrid<T extends CalendarMeeting>({
  anchor, today, meetings, timeZone, timeFormat = "12h", onSelect, onCreate, onOpenDay,
}: {
  anchor: string; today: string; meetings: T[]; timeZone: string; timeFormat?: "12h" | "24h";
  onSelect: (m: T) => void; onCreate: (d: string) => void; onOpenDay: (d: string) => void;
}) {
  const weeks = useMemo(() => monthWeeks(anchor), [anchor]);
  const curMonth = parseYmd(anchor).m;

  const byDay = useMemo(() => {
    const map = new Map<string, T[]>();
    for (const m of meetings) {
      const d = utcToWallClock(m.startTime, timeZone).date;
      const arr = map.get(d);
      if (arr) arr.push(m);
      else map.set(d, [m]);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return map;
  }, [meetings, timeZone]);

  const MAX = 3;

  return (
    <div className={s.month}>
      <div className={s.monthDow}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className={s.monthRows} style={{ gridTemplateRows: `repeat(${weeks.length}, 1fr)` }}>
        {weeks.map((week) => (
          <div key={week[0]} className={s.monthRow}>
            {week.map((d) => {
              const list = byDay.get(d) ?? [];
              const p = parseYmd(d);
              const extra = list.length - MAX;
              const isToday = d === today;
              return (
                <div key={d} className={`${s.cell} ${p.m !== curMonth ? s.cellOut : ""}`}>
                  <div className={s.cellTop}>
                    <button
                      type="button"
                      className={`${s.cellNum} ${isToday ? s.cellNumToday : ""}`}
                      onClick={() => onOpenDay(d)}
                      title={`Open ${d}`}
                    >
                      {p.d}
                    </button>
                    <button
                      type="button"
                      className={s.cellAdd}
                      aria-label={`Add session on ${d}`}
                      onClick={() => onCreate(d)}
                    >+</button>
                  </div>

                  <div className={s.cellEventsStack}>
                    {list.slice(0, MAX).map((m) => {
                      const meta = KIND_META[kindOf(m.sessionType)];
                      const t = toMinutes(utcToWallClock(m.startTime, timeZone).time);
                      const cancelled = m.status === "CANCELLED";
                      return (
                        <button
                          key={m.id}
                          type="button"
                          className={`${s.chip} ${cancelled ? s.chipCancelled : ""}`}
                          onClick={() => onSelect(m)}
                          title={`${fmtTime(t, timeFormat)} · ${m.title}`}
                          style={{
                            borderLeftColor: cancelled ? "#d6d3d1" : meta.color,
                            background: cancelled ? "#f5f5f4" : meta.bg,
                          }}
                        >
                          <span className={s.chipDot} style={{ background: cancelled ? "#a8a29e" : meta.color }} />
                          <span className={s.chipTime} style={{ color: cancelled ? "#a8a29e" : meta.color }}>
                            {fmtTime(t, timeFormat)}
                          </span>
                          <span className={s.chipName}>{shortTitle(m)}</span>
                        </button>
                      );
                    })}

                    {extra > 0 && (
                      <button type="button" className={s.more} onClick={() => onOpenDay(d)}>
                        +{extra} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────── Agenda View ───────────────────────── */

function dayLabel(d: string, today: string): string {
  if (d === today) return "Today";
  if (d === addDays(today, 1)) return "Tomorrow";
  if (d === addDays(today, -1)) return "Yesterday";
  return fmtDateShort(d);
}

function Agenda<T extends CalendarMeeting>({
  today, meetings, timeZone, timeFormat = "12h", onSelect, onResetFilters,
}: {
  today: string; meetings: T[]; timeZone: string; timeFormat?: "12h" | "24h";
  onSelect: (m: T) => void; onResetFilters: () => void;
}) {
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");

  // Upcoming: Today + 60 days ahead
  const upcomingGroups = useMemo(() => {
    const out: Array<{ day: string; items: T[] }> = [];
    for (let i = 0; i < 60; i++) {
      const day = addDays(today, i);
      const items = eventsOnDay(meetings, day, timeZone).filter((m) => m.status !== "CANCELLED");
      if (items.length) out.push({ day, items });
    }
    return out;
  }, [today, meetings, timeZone]);

  // Past: 30 days prior up to yesterday
  const pastGroups = useMemo(() => {
    const out: Array<{ day: string; items: T[] }> = [];
    for (let i = -1; i >= -30; i--) {
      const day = addDays(today, i);
      const items = eventsOnDay(meetings, day, timeZone);
      if (items.length) out.push({ day, items });
    }
    return out;
  }, [today, meetings, timeZone]);

  const activeGroups = tab === "upcoming" ? upcomingGroups : pastGroups;
  const totalUpcoming = upcomingGroups.reduce((acc, g) => acc + g.items.length, 0);
  const totalPast = pastGroups.reduce((acc, g) => acc + g.items.length, 0);

  return (
    <div className={s.agendaContainer}>
      {/* Agenda Tabs for Upcoming vs Past */}
      <div className={s.agendaSubBar}>
        <div className={s.agendaTabs}>
          <button
            type="button"
            className={`${s.agendaTabBtn} ${tab === "upcoming" ? s.agendaTabActive : ""}`}
            onClick={() => setTab("upcoming")}
          >
            Upcoming Sessions ({totalUpcoming})
          </button>
          <button
            type="button"
            className={`${s.agendaTabBtn} ${tab === "past" ? s.agendaTabActive : ""}`}
            onClick={() => setTab("past")}
          >
            Past Sessions ({totalPast})
          </button>
        </div>
        <div className={s.agendaFilterHint}>
          Filter categories using the left sidebar
        </div>
      </div>

      {activeGroups.length === 0 ? (
        <div className={s.agendaEmpty}>
          <span className={s.agendaEmptyIcon}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </span>
          <strong>No {tab === "upcoming" ? "upcoming" : "past"} sessions match your filter</strong>
          <span className={s.agendaEmptyText}>
            Try enabling other session types in the left sidebar.
          </span>
          <button type="button" className={s.resetFilterBtn} onClick={onResetFilters}>
            Show All Types
          </button>
        </div>
      ) : (
        <div className={s.agendaScroll}>
          {activeGroups.map(({ day, items }) => {
            const isToday = day === today;
            return (
              <div key={day} className={s.agendaDay}>
                <div className={`${s.agendaDate} ${isToday ? s.agendaToday : ""}`}>
                  <span className={s.agendaNum}>{parseYmd(day).d}</span>
                  <span className={s.agendaLabel}>{dayLabel(day, today)}</span>
                </div>

                <ul className={s.agendaList}>
                  {items.map((m) => {
                    const kind = kindOf(m.sessionType);
                    const meta = KIND_META[kind];
                    const st = toMinutes(utcToWallClock(m.startTime, timeZone).time);
                    const en = toMinutes(utcToWallClock(m.endTime, timeZone).time);
                    const sub = subTitle(m);
                    const done = m.status === "COMPLETED";
                    const cancelled = m.status === "CANCELLED";
                    const past = isPast(m);
                    // Join button is ONLY displayed if the session is upcoming, not completed, and not cancelled
                    const showJoin = Boolean(m.joinUrl && !past && !done && !cancelled);

                    return (
                      <li key={m.id}>
                        <div
                          role="button"
                          tabIndex={0}
                          className={`${s.agendaRow} ${past || done ? s.agendaRowPast : ""}`}
                          onClick={() => onSelect(m)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(m); }
                          }}
                        >
                          <span className={s.agendaBar} style={{ background: meta.color }} />
                          <span className={s.agendaTime}>
                            {fmtTime(st, timeFormat)}
                            <small>{fmtTime(en, timeFormat)}</small>
                          </span>
                          <span className={s.agendaMain}>
                            <span className={s.agendaName}>{shortTitle(m)}</span>
                            <span className={s.agendaMeta}>
                              <span className={s.agendaKind} style={{ color: meta.color, background: meta.bg }}>
                                {meta.label}
                              </span>
                              {sub && <span> · {sub}</span>}
                            </span>
                          </span>

                          {/* Status Indicators */}
                          {done && (
                            <span className={s.statusPill} style={{ background: "#dcfce7", color: "#166534" }}>
                              ✓ Completed
                            </span>
                          )}
                          {cancelled && (
                            <span className={s.statusPill} style={{ background: "#fee2e2", color: "#991b1b" }}>
                              ✕ Cancelled
                            </span>
                          )}
                          {past && !done && !cancelled && (
                            <span className={s.statusPill} style={{ background: "#f5f5f4", color: "#78716c" }}>
                              Past Session
                            </span>
                          )}

                          {/* Join Call button strictly for active upcoming sessions */}
                          {showJoin && (
                            <a
                              className={s.joinBtn}
                              href={(m as any).hostUrl || (m.joinUrl!.includes("/zoom.us/j/") ? m.joinUrl!.replace("/zoom.us/j/", "/zoom.us/s/") : m.joinUrl!)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title="Start Zoom meeting as Host (Admin)"
                            >
                              Host Link →
                            </a>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
