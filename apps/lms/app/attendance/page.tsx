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
  programId?: string | null;
  programTitle: string;
  batchId?: string | null;
  batchName: string;
  attended: boolean;
  isRequired?: boolean;
  isCohortSession?: boolean;
  durationMin?: number | null;
  sessionType?: string;
  status?: string;
}

interface BatchAttendanceCompliance {
  enrolmentId: string;
  enrolmentStatus: string;
  batchId: string | null;
  batchName: string;
  programId: string;
  programTitle: string;
  attendanceRequired: boolean;
  thresholdPercentage: number;
  requiredSessionCount: number;
  attendedSessionCount: number;
  attendancePercentage: number;
  complianceStatus: "COMPLIANT" | "NOT_COMPLIANT" | "NOT_APPLICABLE";
  isEligibleForExam: boolean;
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

const isOneOnOneSession = (s: MySession) =>
  s.sessionType === "ONE_ON_ONE" ||
  s.sessionType === "ONE_ON_ONE_WITH_RO" ||
  s.sessionType === "SPEAKER_DISCOVERY_CALL" ||
  s.title?.toLowerCase().includes("1-on-1") ||
  s.title?.toLowerCase().includes("1-to-1") ||
  s.title?.toLowerCase().includes("coaching") ||
  s.title?.toLowerCase().includes("discovery");

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
  hasPresentSession: boolean;
  hasMissedCohortSession: boolean;
  sessions: MySession[];
}

export default function AttendancePage() {
  const router = useRouter();
  const [today, setToday] = useState("");
  const [sessions, setSessions] = useState<MySession[]>([]);
  const [batches, setBatches] = useState<BatchAttendanceCompliance[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string>("ALL");
  const [overallStats, setOverallStats] = useState<{
    totalScheduledSessions: number;
    totalAttendedSessions: number;
    overallAttendancePercentage: number;
  }>({
    totalScheduledSessions: 0,
    totalAttendedSessions: 0,
    overallAttendancePercentage: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userName, setUserName] = useState("Learner");

  // Calendar State
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedKey, setSelectedKey] = useState("");
  const [viewMode, setViewMode] = useState<"calendar" | "batches" | "list">("calendar");

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

    Promise.all([
      load("/me/attendance").catch(() => null),
      load("/sessions/mine").catch(() => []),
    ])
      .then(([meAtt, live]) => {
        const todayStr = formatKey(new Date());
        setToday(todayStr);
        setSelectedKey(todayStr);
        const tDate = dayOf(todayStr);
        setCurrentDate(new Date(tDate.getFullYear(), tDate.getMonth(), 1));

        const batchList: BatchAttendanceCompliance[] = Array.isArray(meAtt?.batches)
          ? meAtt.batches
          : [];
        setBatches(batchList);

        if (batchList.length === 1 && batchList[0]?.batchId) {
          setSelectedBatchId(batchList[0].batchId);
        }

        // Merge sessions from /me/attendance history and /sessions/mine for complete metadata
        const mergedById = new Map<string, MySession>();

        if (Array.isArray(meAtt?.history)) {
          for (const h of meAtt.history) {
            mergedById.set(h.sessionId, {
              id: h.sessionId,
              title: h.sessionTitle || "Live Session",
              startTime: h.startTimeUtc,
              endTime: h.endTimeUtc,
              recordingUrl: h.recordingUrl ?? null,
              joinUrl: h.joinUrl ?? null,
              programId: h.programId ?? null,
              programTitle: h.programTitle || "Program",
              batchId: h.batchId ?? null,
              batchName: h.batchName || "Cohort Batch",
              attended: Boolean(h.attended),
              isRequired: h.isRequired !== false,
              isCohortSession: h.isCohortSession !== false,
              durationMin: h.minutesPresent ?? 0,
              sessionType: h.sessionType,
              status: h.status,
            });
          }
        }

        if (Array.isArray(live)) {
          for (const s of live) {
            const existing = mergedById.get(s.id);
            mergedById.set(s.id, {
              id: s.id,
              title: s.title || existing?.title || "Live Session",
              startTime: s.startTime || existing?.startTime,
              endTime: s.endTime || existing?.endTime,
              recordingUrl: s.recordingUrl ?? existing?.recordingUrl ?? null,
              joinUrl: s.joinUrl ?? existing?.joinUrl ?? null,
              programId: s.programId ?? existing?.programId ?? null,
              programTitle: s.programTitle || existing?.programTitle || "Program",
              batchId: s.batchId ?? existing?.batchId ?? null,
              batchName: s.batchName || existing?.batchName || "Cohort Batch",
              attended: Boolean(existing?.attended || s.attended),
              isRequired: existing?.isRequired ?? true,
              isCohortSession: existing?.isCohortSession ?? !isOneOnOneSession(s),
              durationMin: existing?.durationMin ?? s.durationMin ?? 0,
              sessionType: s.sessionType || existing?.sessionType,
              status: existing?.status,
            });
          }
        }

        const mergedList = Array.from(mergedById.values()).sort(
          (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
        );
        setSessions(mergedList);

        setOverallStats({
          totalScheduledSessions:
            typeof meAtt?.totalScheduledSessions === "number"
              ? meAtt.totalScheduledSessions
              : mergedList.filter((s) => !isOneOnOneSession(s)).length,
          totalAttendedSessions:
            typeof meAtt?.totalAttendedSessions === "number"
              ? meAtt.totalAttendedSessions
              : mergedList.filter((s) => !isOneOnOneSession(s) && s.attended).length,
          overallAttendancePercentage:
            typeof meAtt?.overallAttendancePercentage === "number"
              ? meAtt.overallAttendancePercentage
              : 0,
        });
      })
      .catch(() =>
        setError("We could not load your live session attendance. Please try again in a moment.")
      )
      .finally(() => setLoading(false));
  }, [router]);

  const nowMs = Date.now();

  // Filter sessions by selected batch (if a specific batch is selected)
  const activeBatch =
    selectedBatchId !== "ALL"
      ? batches.find((b) => (b.batchId || b.enrolmentId) === selectedBatchId) || null
      : null;

  const filteredSessions = sessions.filter((s) => {
    if (selectedBatchId === "ALL") return true;
    if (activeBatch?.batchId && s.batchId) {
      return s.batchId === activeBatch.batchId;
    }
    if (activeBatch?.programId && s.programId) {
      return s.programId === activeBatch.programId;
    }
    if (activeBatch?.batchName && s.batchName) {
      return s.batchName === activeBatch.batchName;
    }
    return true;
  });

  // Compute active stats for the right-hand stats card based on selection
  const activeAttendedCount = activeBatch
    ? activeBatch.attendedSessionCount
    : overallStats.totalAttendedSessions;
  const activeRequiredCount = activeBatch
    ? activeBatch.requiredSessionCount
    : overallStats.totalScheduledSessions;
  const activeAttendancePct = activeBatch
    ? Math.round(activeBatch.attendancePercentage)
    : overallStats.overallAttendancePercentage;
  const activeThresholdPct = activeBatch
    ? activeBatch.thresholdPercentage
    : batches[0]?.thresholdPercentage ?? 80;
  const isActiveExamEligible = activeBatch
    ? activeBatch.isEligibleForExam
    : batches.length > 0
      ? batches.every((b) => b.isEligibleForExam)
      : activeRequiredCount > 0 && activeAttendancePct >= activeThresholdPct;

  // Map sessions by date
  const sessionsMap = new Map<string, MySession[]>();
  filteredSessions.forEach((s) => {
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

  const buildCalendarCell = (d: Date, isCurrentMonth: boolean): CalendarDay => {
    const key = formatKey(d);
    const daySessions = sessionsMap.get(key) || [];
    const hasPresentSession = daySessions.some((s) => s.attended);
    const hasMissedCohortSession =
      !hasPresentSession &&
      daySessions.some(
        (s) =>
          !s.attended &&
          !isOneOnOneSession(s) &&
          new Date(s.endTime).getTime() < nowMs
      );
    return {
      date: d,
      dateKey: key,
      dayNumber: d.getDate(),
      isCurrentMonth,
      isToday: key === today,
      isSelected: key === selectedKey,
      hasPresentSession,
      hasMissedCohortSession,
      sessions: daySessions,
    };
  };

  const calendarDays: CalendarDay[] = [];

  // Previous month fill
  for (let i = firstDayIndex; i > 0; i--) {
    const d = new Date(year, month, 1 - i);
    calendarDays.push(buildCalendarCell(d, false));
  }

  // Current month days
  for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
    const d = new Date(year, month, i);
    calendarDays.push(buildCalendarCell(d, true));
  }

  // Next month fill
  const remaining = 7 - (calendarDays.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      calendarDays.push(buildCalendarCell(d, false));
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
  const selectedDaySessions = selectedKey ? sessionsMap.get(selectedKey) || [] : [];
  const selectedDayPresentSessions = selectedDaySessions.filter((s) => s.attended);

  return (
    <div className={styles.container}>
      {/* Page Title & Helper Row */}
      <header className={styles.header}>
        <Link href="/" className={styles.backLink} title="Back to Dashboard">
          <span className={styles.backIconWrap}>{Icons.arrowLeft}</span>
          <span className={styles.backText}>Back</span>
        </Link>
        <div className={styles.headerTitleGroup}>
          <h1 className={styles.title}>Live Session Attendance</h1>
          <div className={styles.headerBadge}>
            <span className={styles.headerBadgeDot} aria-hidden="true" />
            <span>
              Attendance is tracked per enrolled batch from live sessions conducted by your instructor. Meet your batch attendance threshold to unlock the Final Examination.
            </span>
          </div>
        </div>
      </header>

      {error && <p role="alert" className={styles.notice}>{error}</p>}

      {/* Top View Toggle: Calendar View vs Batch Attendance vs List History */}
      <div className={styles.topTabsRow} role="tablist" aria-label="Attendance view modes">
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === "calendar"}
          onClick={() => setViewMode("calendar")}
          className={`${styles.topTabBtn} ${viewMode === "calendar" ? styles.topTabBtnActive : ""}`}
        >
          {Icons.calendarSmall}
          <span>Calendar View</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === "batches"}
          onClick={() => setViewMode("batches")}
          className={`${styles.topTabBtn} ${viewMode === "batches" ? styles.topTabBtnActive : ""}`}
        >
          {Icons.userGroup}
          <span>Batch Attendance</span>
          {batches.length > 0 && (
            <span className={styles.topTabBadge}>{batches.length}</span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === "list"}
          onClick={() => setViewMode("list")}
          className={`${styles.topTabBtn} ${viewMode === "list" ? styles.topTabBtnActive : ""}`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
          <span>List History</span>
        </button>
      </div>

      {/* 2-Column Dashboard Layout: Left Content, Right Stats & Today Activity */}
      <div className={styles.mainLayout}>
        {/* LEFT COLUMN: Calendar, Batch Attendance, or List History */}
        <div className={styles.calendarColumn}>
          {viewMode === "batches" ? (
            /* Dedicated Batch Attendance Panel */
            <section className={styles.batchesPanel} aria-label="Enrolled Batch Attendance Compliance">
              <div className={styles.batchesPanelHead}>
                <div>
                  <h2 className={styles.batchesPanelTitle}>Batch Attendance &amp; Final Exam Eligibility</h2>
                  <p className={styles.batchesPanelSubtitle}>
                    Live session attendance is evaluated per enrolled batch. Reach the minimum attendance threshold in your batch to unlock the Final Examination.
                  </p>
                </div>
                {/* Secondary In-Card View Toggle */}
                <div className={styles.viewToggle}>
                  <button
                    type="button"
                    onClick={() => setViewMode("calendar")}
                    className={styles.toggleBtn}
                  >
                    {Icons.calendarSmall}
                    <span>Calendar View</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("batches")}
                    className={`${styles.toggleBtn} ${styles.toggleBtnActive}`}
                  >
                    {Icons.userGroup}
                    <span>Batch Attendance</span>
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

              {/* Multi-batch filter dropdown when enrolled in multiple batches */}
              {batches.length > 1 && (
                <div className={styles.batchFilterRow}>
                  <label htmlFor="batchFilterSelect" className={styles.batchFilterLabel}>
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                    </svg>
                    <span>Filter Batch:</span>
                  </label>
                  <div className={styles.batchSelectWrapper}>
                    <select
                      id="batchFilterSelect"
                      value={selectedBatchId}
                      onChange={(e) => setSelectedBatchId(e.target.value)}
                      className={styles.batchSelect}
                      aria-label="Filter attendance by enrolled batch"
                    >
                      <option value="ALL">All Enrolled Batches ({batches.length})</option>
                      {batches.map((b) => {
                        const key = b.batchId || b.enrolmentId;
                        return (
                          <option key={b.enrolmentId} value={key}>
                            {b.batchName} · {b.programTitle} ({Math.round(b.attendancePercentage)}%)
                          </option>
                        );
                      })}
                    </select>
                    <span className={styles.batchSelectChevron} aria-hidden="true">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </span>
                  </div>
                  {selectedBatchId !== "ALL" && (
                    <button
                      type="button"
                      onClick={() => setSelectedBatchId("ALL")}
                      className={styles.resetFilterBtn}
                    >
                      Show All Batches
                    </button>
                  )}
                </div>
              )}

              {/* Per-Batch Compliance Cards */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
                  gap: "14px",
                }}
              >
                {(selectedBatchId === "ALL"
                  ? batches
                  : batches.filter(
                      (b) => (b.batchId || b.enrolmentId) === selectedBatchId
                    )
                ).map((b) => {
                  const pct = Math.round(b.attendancePercentage);
                  const isCompliant = b.isEligibleForExam;
                  return (
                    <div
                      key={b.enrolmentId}
                      style={{
                        background: "#ffffff",
                        border: isCompliant
                          ? "1px solid rgba(22, 163, 74, 0.3)"
                          : "1px solid rgba(234, 88, 12, 0.35)",
                        borderRadius: "14px",
                        padding: "16px 18px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                        boxShadow: "0 2px 8px rgba(20, 17, 15, 0.04)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: "10px",
                        }}
                      >
                        <div>
                          <span
                            style={{
                              fontSize: "0.73rem",
                              fontWeight: 700,
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                              color: "#ea580c",
                              display: "block",
                            }}
                          >
                            {b.batchName}
                          </span>
                          <strong
                            style={{
                              fontSize: "1rem",
                              color: "#1c1917",
                              display: "block",
                              marginTop: "2px",
                            }}
                          >
                            {b.programTitle}
                          </strong>
                        </div>
                        <span
                          style={{
                            padding: "4px 10px",
                            borderRadius: "999px",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                            background: isCompliant
                              ? "rgba(22, 163, 74, 0.12)"
                              : "rgba(217, 119, 6, 0.14)",
                            color: isCompliant ? "#15803d" : "#b45309",
                          }}
                        >
                          {!b.attendanceRequired
                            ? "✓ Attendance Optional"
                            : isCompliant
                            ? `✓ Final Exam Unlocked (≥${b.thresholdPercentage}%)`
                            : `🔒 Final Exam Locked (<${b.thresholdPercentage}%)`}
                        </span>
                      </div>

                      {/* Progress Bar */}
                      <div
                        style={{
                          width: "100%",
                          height: "8px",
                          background: "#f5efe8",
                          borderRadius: "999px",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.min(100, Math.max(0, pct))}%`,
                            height: "100%",
                            background: isCompliant ? "#16a34a" : "#ea580c",
                            borderRadius: "999px",
                            transition: "width 0.3s ease",
                          }}
                        />
                      </div>

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: "8px",
                          fontSize: "0.82rem",
                          color: "#57534e",
                        }}
                      >
                        <span>
                          Live Attendance: <strong>{pct}%</strong> ({b.attendedSessionCount} of{" "}
                          {b.requiredSessionCount} live sessions) • Required:{" "}
                          <strong>{b.thresholdPercentage}%</strong>
                        </span>
                        <Link
                          href={`/programs/${b.programId}/steps`}
                          style={{
                            color: "#ea580c",
                            fontWeight: 700,
                            textDecoration: "none",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "2px",
                          }}
                        >
                          Course Path →
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : viewMode === "calendar" ? (
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
                    <span>Calendar View</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("batches")}
                    className={styles.toggleBtn}
                  >
                    {Icons.userGroup}
                    <span>Batch Attendance</span>
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
                      aria-label={`${cd.date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}${cd.hasPresentSession ? ", Live Session Attended" : ""}${cd.sessions.length > 0 ? `, ${cd.sessions.length} sessions` : ""}`}
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
                        {/* Live-Session Attendance Badge (Only when learner attended a live session on this date) */}
                        {cd.hasPresentSession && (
                          <span className={styles.presentBadge} title="Live Session Attended">
                            {Icons.check} Present
                          </span>
                        )}

                        {/* Scheduled Live Sessions / Coaching */}
                        {cd.sessions.map((s) => {
                          const isOneOnOne = isOneOnOneSession(s);

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
                              title={`${s.title}${s.batchName ? ` · ${s.batchName}` : ""} (${timeOf(s.startTime)})`}
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
                  <span>Live Session Attended (Present)</span>
                </div>
                <div className={styles.legendItem}>
                  <span className={styles.legendDotCohort} />
                  <span>Batch Live Session</span>
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
                    <span>Calendar View</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("batches")}
                    className={styles.toggleBtn}
                  >
                    {Icons.userGroup}
                    <span>Batch Attendance</span>
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
                  <h2>
                    Batch Live Sessions Attendance
                    {activeBatch ? ` — ${activeBatch.batchName}` : ""}
                  </h2>
                </div>
                {filteredSessions.length === 0 ? (
                  <p className={styles.emptyNotice} style={{ padding: "2rem", textAlign: "center" }}>
                    No live sessions scheduled for your batch yet.
                  </p>
                ) : (
                  filteredSessions.map((session) => {
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
                            {session.batchName ? `${session.batchName} · ` : ""}
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
                <h3 className={styles.statsTitle}>
                  {activeBatch ? `${activeBatch.batchName} Stats` : "Live Attendance Stats"}
                </h3>
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
              {/* Tile 1: Attendance Rate */}
              <div className={styles.statTile}>
                <div className={styles.tileIconGreen}>{Icons.calendarGreen}</div>
                <div className={styles.tileValue}>
                  {loading ? "–" : `${activeAttendancePct}%`}
                </div>
                <div className={styles.tileLabel}>
                  Attendance (Min {activeThresholdPct}%)
                </div>
              </div>

              {/* Tile 2: Live Sessions Attended */}
              <div className={styles.statTile}>
                <div className={styles.tileIconOrange}>{Icons.chartOrange}</div>
                <div className={styles.tileValue}>
                  {loading ? "–" : `${activeAttendedCount}/${activeRequiredCount}`}
                </div>
                <div className={styles.tileLabel}>Live Sessions</div>
              </div>

              {/* Tile 3: Final Exam Gate */}
              <div className={styles.statTile}>
                <div className={styles.tileIconPurple}>{Icons.flamePurple}</div>
                <div className={styles.tileValue}>
                  {loading ? "–" : isActiveExamEligible ? "Eligible" : "Locked"}
                </div>
                <div className={styles.tileLabel}>Final Exam Gate</div>
              </div>
            </div>
          </div>

          {/* Card 2: Today / Selected Day Activity */}
          {selectedKey && selectedDateObj && (
            <div className={styles.activityCard}>
              <div className={styles.activityHeader}>
                <div className={styles.activityDateRow}>
                  <span className={styles.activityCalendarIcon}>{Icons.calendarSmall}</span>
                  <h3 className={styles.activityDateTitle} suppressHydrationWarning>
                    {selectedDateObj.toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </h3>
                </div>
                {selectedKey === today && (
                  <span className={styles.todayBadge}>TODAY</span>
                )}
              </div>

              <div className={styles.activityBody}>
                {/* Live Session Attendance Summary for Selected Date */}
                <div className={styles.activitySection}>
                  <h4 className={styles.activitySectionTitle}>Live Session Status</h4>
                  {selectedDayPresentSessions.length > 0 ? (
                    <div>
                      <span className={styles.activityPresentBadge}>
                        {Icons.check} Present ({selectedDayPresentSessions.length}{" "}
                        {selectedDayPresentSessions.length === 1 ? "session" : "sessions"})
                      </span>
                      <ul className={styles.activityBulletList}>
                        {selectedDayPresentSessions.map((s) => (
                          <li key={s.id} className={styles.activityBulletItem}>
                            <span className={styles.activityBulletDot}>•</span>
                            <span>
                              {s.title}
                              {s.batchName ? ` (${s.batchName})` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className={styles.emptyNotice}>
                      No live session attendance recorded on this date.
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
                        const isOneOnOne = isOneOnOneSession(s);

                        const displayTitle =
                          isOneOnOne && !s.title.toLowerCase().includes(userName.toLowerCase())
                            ? `1-on-1 Coaching: ${userName}`
                            : s.title;

                        const sessionTypeLabel = isOneOnOne
                          ? "1:1 Coaching"
                          : `${s.batchName ? `${s.batchName} · ` : ""}${s.programTitle || "Cohort Live Class"}`;

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
                                {s.attended ? "Present" : isUpcoming ? "Upcoming" : "Absent"}
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
                              <Link
                                href={`/live?autoJoin=${s.id}`}
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
                              </Link>
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
