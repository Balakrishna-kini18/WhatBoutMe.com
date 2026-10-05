"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./attendance.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface MySession {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  recordingUrl?: string | null;
  joinUrl?: string | null;
  programTitle: string;
  batchName: string;
  attended: boolean;
  durationMin?: number | null;
}

interface Day {
  date: string; // YYYY-MM-DD
  visited: boolean;
  lessonDone: boolean;
  sessionJoined: boolean;
}

const Icons = {
  chevronLeft: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  ),
  chevronRight: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  check: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  video: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" />
    </svg>
  ),
  clock: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
};

const dayOf = (date: string) => new Date(`${date}T00:00:00`);

function streakOf(days: Day[], today: string) {
  const present = new Set(days.map((d) => d.date));
  const cursor = dayOf(today);
  if (!present.has(today)) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  for (;;) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    if (!present.has(key)) return streak;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
}

const formatKey = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface CalendarDay {
  date: Date;
  dateKey: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  dayAttendance?: Day;
  sessions: MySession[];
}

export default function AttendancePage() {
  const router = useRouter();
  const [days, setDays] = useState<Day[]>([]);
  const [today, setToday] = useState("");
  const [sessions, setSessions] = useState<MySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Calendar State
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedKey, setSelectedKey] = useState("");
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    const headers = { Authorization: `Bearer ${token}` };
    const load = (path: string) =>
      fetch(`${API_URL}${path}`, { headers }).then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      });
    Promise.all([load("/attendance/mine"), load("/sessions/mine")])
      .then(([daily, live]) => {
        const fetchedDays = Array.isArray(daily?.days) ? daily.days : [];
        const todayStr = daily?.today ?? formatKey(new Date());
        setDays(fetchedDays);
        setToday(todayStr);
        setSelectedKey(todayStr);
        setSessions(Array.isArray(live) ? live : []);

        if (todayStr) {
          const tDate = dayOf(todayStr);
          setCurrentDate(new Date(tDate.getFullYear(), tDate.getMonth(), 1));
        }
      })
      .catch(() => setError("We could not load your attendance. Please try again in a moment."))
      .finally(() => setLoading(false));
  }, [router]);

  const monthStr = today ? today.slice(0, 7) : "";
  const summary = [
    { label: "Days Present", value: days.length },
    { label: "This Month", value: days.filter((d) => d.date.startsWith(monthStr)).length },
    { label: "Current Streak", value: today ? `${streakOf(days, today)} ${streakOf(days, today) === 1 ? "day" : "days"}` : "0 days" },
  ];

  // Map attendance by date
  const daysMap = new Map<string, Day>();
  days.forEach((d) => daysMap.set(d.date, d));

  // Map sessions by date
  const sessionsMap = new Map<string, MySession[]>();
  sessions.forEach((s) => {
    const d = new Date(s.startTime);
    const key = formatKey(d);
    const list = sessionsMap.get(key) || [];
    list.push(s);
    sessionsMap.set(key, list);
  });

  // Calendar Grid Builder
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);

  let firstDayIndex = firstDayOfMonth.getDay() - 1;
  if (firstDayIndex === -1) firstDayIndex = 6;

  const calendarDays: CalendarDay[] = [];

  // Previous month fill
  for (let i = firstDayIndex; i > 0; i--) {
    const d = new Date(year, month, 1 - i);
    const key = formatKey(d);
    calendarDays.push({
      date: d,
      dateKey: key,
      dayNumber: d.getDate(),
      isCurrentMonth: false,
      isToday: key === today,
      isSelected: key === selectedKey,
      dayAttendance: daysMap.get(key),
      sessions: sessionsMap.get(key) || [],
    });
  }

  // Current month days
  for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
    const d = new Date(year, month, i);
    const key = formatKey(d);
    calendarDays.push({
      date: d,
      dateKey: key,
      dayNumber: i,
      isCurrentMonth: true,
      isToday: key === today,
      isSelected: key === selectedKey,
      dayAttendance: daysMap.get(key),
      sessions: sessionsMap.get(key) || [],
    });
  }

  // Next month fill
  const remaining = 7 - (calendarDays.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      const key = formatKey(d);
      calendarDays.push({
        date: d,
        dateKey: key,
        dayNumber: d.getDate(),
        isCurrentMonth: false,
        isToday: key === today,
        isSelected: key === selectedKey,
        dayAttendance: daysMap.get(key),
        sessions: sessionsMap.get(key) || [],
      });
    }
  }

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const goToToday = () => {
    const now = new Date();
    setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1));
    if (today) setSelectedKey(today);
  };

  // Selected Day Data
  const selectedDateObj = selectedKey ? dayOf(selectedKey) : null;
  const selectedDayAttendance = selectedKey ? daysMap.get(selectedKey) : undefined;
  const selectedDaySessions = selectedKey ? sessionsMap.get(selectedKey) || [] : [];
  const selectedReasons = selectedDayAttendance
    ? [
        selectedDayAttendance.visited && "Portal visit",
        selectedDayAttendance.lessonDone && "Course step finished",
        selectedDayAttendance.sessionJoined && "Live session joined",
      ].filter(Boolean)
    : [];

  const nowMs = Date.now();

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Attendance</h1>
        <p className={styles.subtitle}>
          A day counts when you open the portal, finish a course step or join a live session.
        </p>
      </header>

      {error && <p role="alert" className={styles.notice}>{error}</p>}

      {/* 2-Column Dashboard Layout: Left Calendar, Right Stats & Selected Day */}
      <div className={styles.mainLayout}>
        {/* LEFT COLUMN: Calendar (or List History) */}
        <div className={styles.calendarColumn}>
          {viewMode === "calendar" ? (
            <div className={styles.calendarCard}>
              {/* Calendar Top Navigation */}
              <div className={styles.calendarNav}>
                <div className={styles.monthSelector}>
                  <button
                    type="button"
                    onClick={prevMonth}
                    aria-label="Previous month"
                    className={styles.navBtn}
                  >
                    {Icons.chevronLeft}
                  </button>
                  <h2 className={styles.monthTitle}>
                    {currentDate.toLocaleDateString([], { month: "long", year: "numeric" })}
                  </h2>
                  <button
                    type="button"
                    onClick={nextMonth}
                    aria-label="Next month"
                    className={styles.navBtn}
                  >
                    {Icons.chevronRight}
                  </button>
                  <button type="button" onClick={goToToday} className={styles.todayBtn}>
                    Today
                  </button>
                </div>

                {/* View Mode Switcher */}
                <div className={styles.viewToggle}>
                  <button
                    type="button"
                    onClick={() => setViewMode("calendar")}
                    className={`${styles.toggleBtn} ${styles.toggleBtnActive}`}
                  >
                    Calendar
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("list")}
                    className={styles.toggleBtn}
                  >
                    List History
                  </button>
                </div>
              </div>

              {/* Weekday Names (Mon - Sun) */}
              <div className={styles.weekHeader}>
                {WEEKDAYS.map((wd) => (
                  <div key={wd} className={styles.weekDayName}>
                    {wd}
                  </div>
                ))}
              </div>

              {/* 7-column Calendar Grid */}
              <div className={styles.calendarGrid}>
                {calendarDays.map((cd) => (
                  <div
                    key={cd.dateKey}
                    onClick={() => setSelectedKey(cd.dateKey)}
                    className={`${styles.dayCell} ${!cd.isCurrentMonth ? styles.otherMonth : ""} ${cd.isSelected ? styles.selectedCell : ""}`}
                  >
                    <div className={styles.dayHeader}>
                      <span className={`${styles.dayNumber} ${cd.isToday ? styles.todayPill : ""}`}>
                        {cd.dayNumber}
                      </span>
                    </div>

                    <div className={styles.cellEvents}>
                      {/* Attendance Badge */}
                      {cd.dayAttendance && (
                        <span className={styles.presentBadge} title="Attended">
                          {Icons.check} Present
                        </span>
                      )}

                      {/* Scheduled Live Sessions */}
                      {cd.sessions.map((s) => {
                        const startMs = new Date(s.startTime).getTime();
                        const endMs = new Date(s.endTime).getTime();
                        const isLive = nowMs >= startMs - 5 * 60000 && nowMs <= endMs;
                        return (
                          <span
                            key={s.id}
                            className={`${styles.sessionPill} ${isLive ? styles.sessionPillLive : ""}`}
                            title={`${s.title} (${timeOf(s.startTime)})`}
                          >
                            {Icons.video}
                            <span>{s.title}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Calendar Legend */}
              <div className={styles.legend}>
                <div className={styles.legendItem}>
                  <span className={styles.legendDotPresent} />
                  <span>Attendance Logged (Present)</span>
                </div>
                <div className={styles.legendItem}>
                  <span className={styles.legendDotSession} />
                  <span>Cohort Live Class</span>
                </div>
                <div className={styles.legendItem}>
                  <span className={styles.legendDotToday} />
                  <span>Current Day</span>
                </div>
              </div>
            </div>
          ) : (
            /* List View Alternative */
            <div className={styles.listView}>
              <div className={styles.calendarNav} style={{ background: "transparent", padding: "0 0 0.5rem", border: "none" }}>
                <div />
                <div className={styles.viewToggle}>
                  <button
                    type="button"
                    onClick={() => setViewMode("calendar")}
                    className={styles.toggleBtn}
                  >
                    Calendar
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("list")}
                    className={`${styles.toggleBtn} ${styles.toggleBtnActive}`}
                  >
                    List History
                  </button>
                </div>
              </div>

              <section className={styles.listPanel}>
                <div className={styles.listPanelHead}>
                  <h2>Daily Attendance Log</h2>
                </div>
                {days.length === 0 ? (
                  <p className={styles.emptyNotice} style={{ padding: "2rem", textAlign: "center" }}>
                    No attendance recorded yet.
                  </p>
                ) : (
                  days.map((day) => {
                    const date = dayOf(day.date);
                    const reasons = [
                      day.visited && "Portal visit",
                      day.lessonDone && "Course step finished",
                      day.sessionJoined && "Live session joined",
                    ].filter(Boolean);
                    return (
                      <div key={day.date} className={styles.listItem}>
                        <div className={styles.listDateTile}>
                          <span>{date.toLocaleDateString([], { month: "short" })}</span>
                          <strong>{date.getDate()}</strong>
                        </div>
                        <div className={styles.listItemBody}>
                          <p className={styles.listItemTitle}>
                            {date.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                          </p>
                          <p className={styles.listItemMeta}>{reasons.join(" · ")}</p>
                        </div>
                        <span className={styles.badgePresent}>Present</span>
                      </div>
                    );
                  })
                )}
              </section>

              <section className={styles.listPanel}>
                <div className={styles.listPanelHead}>
                  <h2>Live Sessions Attendance</h2>
                </div>
                {sessions.length === 0 ? (
                  <p className={styles.emptyNotice} style={{ padding: "2rem", textAlign: "center" }}>
                    No live sessions scheduled yet.
                  </p>
                ) : (
                  sessions.map((session) => {
                    const start = new Date(session.startTime);
                    const isUpcoming = new Date(session.endTime).getTime() > nowMs;
                    return (
                      <div key={session.id} className={styles.listItem}>
                        <div className={styles.listDateTile}>
                          <span>{start.toLocaleDateString([], { month: "short" })}</span>
                          <strong>{start.getDate()}</strong>
                        </div>
                        <div className={styles.listItemBody}>
                          <p className={styles.listItemTitle}>{session.title}</p>
                          <p className={styles.listItemMeta}>
                            {session.programTitle} · {timeOf(session.startTime)} to {timeOf(session.endTime)}
                            {session.attended && session.durationMin ? ` · ${session.durationMin} min attended` : ""}
                          </p>
                        </div>
                        <span className={session.attended ? styles.badgePresent : isUpcoming ? styles.badgeUpcoming : styles.badgeAbsent}>
                          {session.attended ? "Present" : isUpcoming ? "Upcoming" : "Absent"}
                        </span>
                      </div>
                    );
                  })
                )}
              </section>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Stats Card (from user screenshot) & Selected Day Inspector */}
        <aside className={styles.sidebarColumn}>
          {/* Stats Card */}
          <div className={styles.statsCard}>
            <div className={styles.statsHeader}>
              <h3 className={styles.statsTitle}>Attendance Stats</h3>
            </div>
            <dl className={styles.statsSummaryGrid}>
              {summary.map((item) => (
                <div key={item.label}>
                  <dd>{loading ? "–" : item.value}</dd>
                  <dt>{item.label}</dt>
                </div>
              ))}
            </dl>
          </div>

          {/* Selected Day Inspector */}
          {selectedKey && selectedDateObj && (
            <div className={styles.inspectorCard}>
              <div className={styles.inspectorHeader}>
                <h3 className={styles.inspectorDate}>
                  {selectedDateObj.toLocaleDateString([], {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </h3>
                {selectedKey === today && (
                  <span className={styles.todayBadge}>Today</span>
                )}
              </div>

              <div className={styles.inspectorBody}>
                {/* Daily Attendance Status */}
                <div className={styles.sectionBlock}>
                  <span className={styles.sectionLabel}>Daily Activity</span>
                  {selectedDayAttendance ? (
                    <div>
                      <span className={styles.presentBadge} style={{ fontSize: "0.75rem", padding: "3px 8px" }}>
                        {Icons.check} Present
                      </span>
                      <ul className={styles.activityList}>
                        {selectedReasons.map((r) => (
                          <li key={r as string} className={styles.activityItem}>
                            <span style={{ color: "var(--accent-primary)" }}>•</span>
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className={styles.emptyNotice}>
                      No portal visit or activity recorded on this date.
                    </p>
                  )}
                </div>

                {/* Scheduled Live Sessions on this date */}
                <div className={styles.sectionBlock}>
                  <span className={styles.sectionLabel}>Scheduled Classes</span>
                  {selectedDaySessions.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {selectedDaySessions.map((s) => {
                        const startMs = new Date(s.startTime).getTime();
                        const endMs = new Date(s.endTime).getTime();
                        const isUpcoming = endMs > nowMs;
                        const isLive = nowMs >= startMs - 5 * 60000 && nowMs <= endMs;
                        return (
                          <div key={s.id} className={styles.sessionCard}>
                            <div className={styles.sessionCardTop}>
                              <p className={styles.sessionCardTitle}>{s.title}</p>
                              <span className={s.attended ? styles.badgePresent : isUpcoming ? styles.badgeUpcoming : styles.badgeAbsent} style={{ fontSize: "0.68rem" }}>
                                {s.attended ? "Present" : isUpcoming ? "Upcoming" : "Ended"}
                              </span>
                            </div>
                            <p className={styles.sessionCardTime}>
                              {timeOf(s.startTime)} – {timeOf(s.endTime)} · {s.programTitle}
                            </p>
                            {isUpcoming && s.joinUrl ? (
                              <a
                                href={s.joinUrl}
                                target="_blank"
                                rel="noreferrer"
                                className={styles.joinSessionBtn}
                                style={isLive ? { background: "var(--status-error)" } : undefined}
                              >
                                {Icons.video}
                                <span>{isLive ? "Join Now" : "Join Class"}</span>
                              </a>
                            ) : s.recordingUrl ? (
                              <a
                                href={s.recordingUrl}
                                target="_blank"
                                rel="noreferrer"
                                className={styles.recordingLink}
                              >
                                Recording
                              </a>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className={styles.emptyNotice}>
                      No live sessions scheduled on this date.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
