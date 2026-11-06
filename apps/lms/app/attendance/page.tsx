"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { API_URL, getAuthHeaders } from "../lib/api";
import { sanitizeExternalUrl } from "../lib/auth-redirect";
import styles from "./attendance.module.css";

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
  sessionType?: string;
}

interface Day {
  date: string; // YYYY-MM-DD
  visited: boolean;
  lessonDone: boolean;
  sessionJoined: boolean;
}

const Icons = {
  chevronLeft: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  ),
  chevronRight: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  check: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  video: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" />
    </svg>
  ),
  clock: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  arrowLeft: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  ),
  calendarSmall: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  calendarGreen: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <path d="m9 16 2 2 4-4" />
    </svg>
  ),
  chartOrange: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  flamePurple: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  ),
  userGroup: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
};

const dayOf = (date: string) => new Date(`${date}T00:00:00`);

function streakOf(days: Day[], today: string) {
  const present = new Set(days.map((d) => d.date));
  const cursor = dayOf(today);
  if (!present.has(today)) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  for (; ;) {
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
new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

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
  const [userName, setUserName] = useState("Learner");

  // Calendar State
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedKey, setSelectedKey] = useState("");
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");

  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      if (raw) {
        const u = JSON.parse(raw);
        if (u.name) setUserName(u.name);
        else if (u.email) setUserName(u.email.split("@")[0]);
      }
    } catch {
      // fallback default
    }
  }, []);

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
      {/* Page Title & Helper Row */}
      <header className={styles.header}>
        <Link href="/" className={styles.backLink} title="Back to Dashboard">
          <span className={styles.backIconWrap}>{Icons.arrowLeft}</span>
          <span className={styles.backText}>Back</span>
        </Link>
        <div className={styles.headerTitleGroup}>
          <h1 className={styles.title}>Attendance</h1>
          <div className={styles.headerBadge}>
            <span className={styles.headerBadgeDot} aria-hidden="true" />
            <span>A day counts when you open the portal, finish a course step or join a live session.</span>
          </div>
        </div>
      </header>

      {error && <p role="alert" className={styles.notice}>{error}</p>}

      {/* 2-Column Dashboard Layout: Left Calendar, Right Stats & Today Activity */}
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
                    <h2 className={styles.monthTitle} suppressHydrationWarning>
                      {currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
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
                    {Icons.calendarSmall}
                    <span>Calendar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("list")}
                    className={styles.toggleBtn}
                  >
                    <span>List History</span>
                  </button>
                </div>
              </div>

              {/* Weekday Names (Mon - Sun) */}
              <div className={styles.weekHeader} role="row">
                {WEEKDAYS.map((wd) => (
                  <div key={wd} className={styles.weekDayName} role="columnheader">
                    {wd.toUpperCase()}
                  </div>
                ))}
              </div>

              {/* 7-column Calendar Grid */}
              <div className={styles.calendarGrid} role="grid" aria-label="Monthly Attendance Calendar">
                {calendarDays.map((cd) => {
                  const isSelectedCell = cd.isSelected;
                  return (
                    <div
                      key={cd.dateKey}
                      role="gridcell"
                      tabIndex={0}
                      aria-selected={isSelectedCell}
                      aria-label={`${cd.date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}${cd.dayAttendance ? ", Present" : ""}${cd.sessions.length > 0 ? `, ${cd.sessions.length} sessions` : ""}`}
                      suppressHydrationWarning
                      onClick={() => setSelectedKey(cd.dateKey)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedKey(cd.dateKey);
                        }
                      }}
                      className={`${styles.dayCell} ${!cd.isCurrentMonth ? styles.otherMonth : ""} ${isSelectedCell ? styles.selectedCell : ""}`}
                    >
                      <div className={styles.dayHeader}>
                        <span className={isSelectedCell ? styles.selectedDayBadge : styles.dayNumber}>
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

                        {/* Scheduled Live Sessions / Coaching */}
                        {cd.sessions.map((s) => {
                          const isOneOnOne =
                            s.sessionType === "ONE_ON_ONE" ||
                            s.title?.toLowerCase().includes("1-on-1") ||
                            s.title?.toLowerCase().includes("coaching");

                          if (isOneOnOne) {
                            return (
                              <span
                                key={s.id}
                                className={isSelectedCell ? styles.sessionPillCoachingSelected : styles.sessionPillCoaching}
                                title={`${s.title} (${timeOf(s.startTime)})`}
                              >
                                1-on-1 Coaching
                              </span>
                            );
                          }

                          return (
                            <span
                              key={s.id}
                              className={styles.sessionPillCohort}
                              title={`${s.title} (${timeOf(s.startTime)})`}
                            >
                              {Icons.video}
                              <span>{s.title}</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Calendar Legend */}
              <div className={styles.legend}>
                <div className={styles.legendItem}>
                  <span className={styles.legendDotPresent} />
                  <span>Attendance Logged (Present)</span>
                </div>
                <div className={styles.legendItem}>
                  <span className={styles.legendDotCohort} />
                  <span>Cohort Live Class</span>
                </div>
                <div className={styles.legendItem}>
                  <span className={styles.legendDotCoaching} />
                  <span>1-on-1 Coaching</span>
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
                    {Icons.calendarSmall}
                    <span>Calendar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("list")}
                    className={`${styles.toggleBtn} ${styles.toggleBtnActive}`}
                  >
                    <span>List History</span>
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
                          <span suppressHydrationWarning>{date.toLocaleDateString("en-US", { month: "short" })}</span>
                          <strong>{date.getDate()}</strong>
                        </div>
                        <div className={styles.listItemBody}>
                            <p className={styles.listItemTitle} suppressHydrationWarning>
                              {date.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                            </p>
                            <p className={styles.listItemMeta}>{reasons.join(" · ")}</p>
                        </div>
                        <span className={styles.badgePresentPill}>Present</span>
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
                          <span suppressHydrationWarning>{start.toLocaleDateString("en-US", { month: "short" })}</span>
                          <strong>{start.getDate()}</strong>
                        </div>
                        <div className={styles.listItemBody}>
                          <p className={styles.listItemTitle}>{session.title}</p>
                          <p className={styles.listItemMeta}>
                            {session.programTitle} · {timeOf(session.startTime)} to {timeOf(session.endTime)}
                            {(session.durationMin ?? 0) > 0 ? ` · ${session.durationMin} min attended` : ""}
                          </p>
                        </div>
                        <span className={session.attended ? styles.badgePresentPill : isUpcoming ? styles.badgeUpcomingPill : (session.durationMin ?? 0) > 0 ? styles.badgeUpcomingPill : styles.badgeAbsentPill}>
                          {session.attended ? "Present" : isUpcoming ? "Upcoming" : (session.durationMin ?? 0) > 0 ? `Partial (${session.durationMin}m)` : "Absent"}
                        </span>
                      </div>
                    );
                  })
                )}
              </section>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Stats Card & Today / Selected Day Activity */}
        <aside className={styles.sidebarColumn}>
          {/* Card 1: Attendance Stats */}
          <div className={styles.statsCard}>
            <div className={styles.statsHeader}>
              <div className={styles.statsTitleRow}>
                <span className={styles.statsTitleIcon}>{Icons.chartOrange}</span>
                <h3 className={styles.statsTitle}>Attendance Stats</h3>
              </div>
              {/* Subtle Decorative Calendar Illustration */}
              <div className={styles.calendarIllustration} aria-hidden="true">
                <svg width="68" height="68" viewBox="0 0 100 100" fill="none">
                  <rect x="22" y="24" width="62" height="58" rx="12" fill="#FED7AA" fillOpacity="0.4" />
                  <rect x="14" y="16" width="64" height="60" rx="12" fill="#FFFFFF" stroke="#FDBA74" strokeWidth="2.5" />
                  <rect x="14" y="16" width="64" height="18" rx="12" fill="#FED7AA" />
                  <rect x="14" y="26" width="64" height="8" fill="#FED7AA" />
                  <circle cx="28" cy="16" r="3.5" fill="#EA580C" />
                  <circle cx="46" cy="16" r="3.5" fill="#EA580C" />
                  <circle cx="64" cy="16" r="3.5" fill="#EA580C" />
                  <circle cx="28" cy="46" r="3.5" fill="#F97316" />
                  <circle cx="46" cy="46" r="3.5" fill="#F97316" />
                  <circle cx="64" cy="46" r="3.5" fill="#F97316" />
                  <circle cx="28" cy="62" r="3.5" fill="#F97316" />
                  <circle cx="46" cy="62" r="3.5" fill="#F97316" />
                  <circle cx="64" cy="62" r="3.5" fill="#FDBA74" fillOpacity="0.4" />
                </svg>
              </div>
            </div>

            {/* 3 Metric Tiles Side-by-Side */}
            <div className={styles.statsTilesRow}>
              {/* Tile 1: Days Present */}
              <div className={styles.statTile}>
                <div className={styles.tileIconGreen}>{Icons.calendarGreen}</div>
                <div className={styles.tileValue}>{loading ? "–" : days.length}</div>
                <div className={styles.tileLabel}>Days Present</div>
              </div>

              {/* Tile 2: This Month */}
              <div className={styles.statTile}>
                <div className={styles.tileIconOrange}>{Icons.chartOrange}</div>
                <div className={styles.tileValue}>
                  {loading ? "–" : days.filter((d) => d.date.startsWith(monthStr)).length}
                </div>
                <div className={styles.tileLabel}>This Month</div>
              </div>

              {/* Tile 3: Current Streak */}
              <div className={styles.statTile}>
                <div className={styles.tileIconPurple}>{Icons.flamePurple}</div>
                <div className={styles.tileValue}>
                  {loading ? "–" : today ? `${streakOf(days, today)} ${streakOf(days, today) === 1 ? "day" : "days"}` : "0 days"}
                </div>
                <div className={styles.tileLabel}>Current Streak</div>
              </div>
            </div>
          </div>

          {/* Card 2: Today / Selected Day Activity */}
          {selectedKey && selectedDateObj && (
            <div className={styles.activityCard}>
              <div className={styles.activityHeader}>
                <div className={styles.activityDateRow}>
                  <span className={styles.activityCalendarIcon}>{Icons.calendarSmall}</span>
                  < h3 className = { styles.activityDateTitle } suppressHydrationWarning >
                    {
                      selectedDateObj.toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })
                    }
                  </h3>
                </div>
                {selectedKey === today && (
                  <span className={styles.todayBadge}>TODAY</span>
                )}
              </div>

              <div className={styles.activityBody}>
                {/* Daily Activity */}
                <div className={styles.activitySection}>
                  <h4 className={styles.activitySectionTitle}>Daily Activity</h4>
                  {selectedDayAttendance ? (
                    <div>
                      <span className={styles.activityPresentBadge}>
                        {Icons.check} Present
                      </span>
                      <ul className={styles.activityBulletList}>
                        {selectedReasons.map((r) => (
                          <li key={r as string} className={styles.activityBulletItem}>
                            <span className={styles.activityBulletDot}>•</span>
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

                <div className={styles.activityDivider} />

                {/* Scheduled Classes */}
                <div className={styles.activitySection}>
                  <h4 className={styles.activitySectionTitle}>Scheduled Classes</h4>
                  {selectedDaySessions.length > 0 ? (
                    <div className={styles.sessionList}>
                      {selectedDaySessions.map((s) => {
                        const startMs = new Date(s.startTime).getTime();
                        const endMs = new Date(s.endTime).getTime();
                        const isUpcoming = endMs > nowMs;
                        const isLive = nowMs >= startMs - 5 * 60000 && nowMs <= endMs;
                        const isOneOnOne =
                          s.sessionType === "ONE_ON_ONE" ||
                          s.title?.toLowerCase().includes("1-on-1") ||
                          s.title?.toLowerCase().includes("coaching");

                        const displayTitle = isOneOnOne && !s.title.toLowerCase().includes(userName.toLowerCase())
                          ? `1-on-1 Coaching: ${userName}`
                          : s.title;

                        const sessionTypeLabel = isOneOnOne ? "1:1 Coaching" : s.programTitle || "Cohort Live Class";

                        return (
                          <div key={s.id} className={styles.scheduledSessionBox}>
                            <div className={styles.sessionBoxTop}>
                              <div className={styles.sessionAvatarIcon}>
                                {Icons.userGroup}
                              </div>
                              <div className={styles.sessionTitleContainer}>
                                <p className={styles.sessionTitleText}>{displayTitle}</p>
                              </div>
                              <span className={s.attended ? styles.badgePresentPill : isUpcoming ? styles.badgeUpcomingPill : styles.badgeAbsentPill}>
                                {s.attended ? "Present" : isUpcoming ? "Upcoming" : "Ended"}
                              </span>
                            </div>

                            <div className={styles.sessionMetaContainer}>
                              <div className={styles.sessionMetaRow}>
                                {Icons.clock}
                                <span>{timeOf(s.startTime)} – {timeOf(s.endTime)}</span>
                              </div>
                              <div className={styles.sessionMetaRow}>
                                {Icons.video}
                                <span>{sessionTypeLabel}</span>
                              </div>
                            </div>

                            {/* Join Button */}
                            {isUpcoming && sanitizeExternalUrl(s.joinUrl) ? (
                              <a
                                href={sanitizeExternalUrl(s.joinUrl)!}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => {
                                  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
                                  fetch(`${API_URL}/sessions/${s.id}/attend`, {
                                    method: "POST",
                                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                                    keepalive: true,
                                  }).catch(() => { });
                                }}
                                className={styles.joinNowBtn}
                              >
                                {Icons.video}
                                <span>Join Now</span>
                              </a>
                            ) : isUpcoming ? (
                              <button
                                type="button"
                                disabled
                                className={`${styles.joinNowBtn} ${styles.joinNowBtnDisabled}`}
                                title="Meeting link will become active before class starts"
                              >
                                {Icons.video}
                                <span>Join Now</span>
                              </button>
                            ) : s.recordingUrl ? (
                              <Link
                                href={`/sessions/${s.id}/recording`}
                                className={styles.recordingLink}
                              >
                                Watch Recording
                              </Link>
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
