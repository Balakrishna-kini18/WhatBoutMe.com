"use client";

/**
 * D1-044: Learner Live Sessions Page — Booking Engine UI
 *
 * Displays upcoming/past sessions and allows the learner to book a seat.
 * Uses the real POST /sessions/:id/book API.
 * Shows: unavailable/ineligible, insufficient advance notice, session full,
 *        calendar clash, successful booking, already-booked states.
 * Does NOT implement reschedule/cancel (D1-046) or timezone utilities (D1-045).
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./live.module.css";
import { API_URL, getAuthHeaders, parseApiError } from "../lib/api";
import { sanitizeExternalUrl } from "../lib/auth-redirect";
import { ConfirmModal } from "../components/ui/ConfirmModal";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Session {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  status: string;
  sessionType: "GROUP_COHORT" | "ONE_ON_ONE";
  capacity: number | null;
  joinUrl: string | null;
  recordingUrl: string | null;
  hostTrainer?: { id: string; name: string; email: string } | null;
  batch?: { id: string; name: string } | null;
  // Enriched by client after booking fetch
  bookingStatus?: "BOOKED" | "CONFIRMED" | "ATTENDED" | null;
  bookingId?: string | null;
}

type BookingState =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "success"; message: string }
  | { type: "error"; message: string; code?: string };

type Tab = "upcoming" | "calendar" | "past";

// ─── Icon helpers ─────────────────────────────────────────────────────────────

const ArrowLeft = (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

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
  video: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" />
    </svg>
  ),
  calendar: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="18" height="18" x="3" y="4" rx="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" />
    </svg>
  ),
  clock: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  play: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  ),
  arrowUpRight: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 17L17 7" /><path d="M7 7h10v10" />
    </svg>
  ),
  badgeCheck: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  checkCircle: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><polyline points="9 12 11 14 15 10" />
    </svg>
  ),
  users: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
};

// ─── Formatters ───────────────────────────────────────────────────────────────

const getUserTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (e) {
    return undefined;
  }
};

const formatTimeOnly = (d: Date) => {
  const tz = getUserTimeZone();
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: tz });
};

const getTimeZoneShort = () => {
  try {
    const tz = getUserTimeZone();
    const parts = new Intl.DateTimeFormat([], { timeZoneName: "short", timeZone: tz }).formatToParts(new Date());
    const tzPart = parts.find((p) => p.type === "timeZoneName");
    return tzPart?.value || "";
  } catch {
    return "";
  }
};

const formatTime = (d: Date) => {
  const tz = getUserTimeZone();
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZoneName: "short", timeZone: tz });
};

const formatTimeRange = (start: Date, end: Date) => {
  const startTime = formatTimeOnly(start);
  const endTime = formatTimeOnly(end);
  const tz = getTimeZoneShort();
  const dur = formatDuration(start, end);
  return `${startTime} – ${endTime} ${tz ? `(${tz})` : ""} · ${dur}`;
};

const formatMonth = (d: Date) =>
  d.toLocaleDateString([], { month: "short" }).toUpperCase();

const formatDay = (d: Date) =>
  String(d.getDate()).padStart(2, "0"); const buildLearnerJoinUrl = (rawUrl: string | null | undefined): string | null => { const safe = sanitizeExternalUrl(rawUrl); if (!safe) return null; if (typeof window !== "undefined" && safe.includes("zoom.us") && !safe.includes("uname=")) { try { const u = JSON.parse(localStorage.getItem("user") || "null"); if (u?.name?.trim()) return `${safe}${safe.includes("?") ? "&" : "?"}uname=${encodeURIComponent(u.name.trim())}`; } catch {} } return safe; };

const formatWeekdayDate = (d: Date) => {
  const tz = getUserTimeZone();
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: tz });
};

const formatDuration = (start: Date, end: Date) => {
  const mins = Math.round((end.getTime() - start.getTime()) / 60000);
  if (mins <= 0) return "60 mins";
  if (mins >= 60 && mins % 60 === 0) return `${mins / 60} hr${mins > 60 ? "s" : ""}`;
  return `${mins} mins`;
};

// ─── Booking error interpretation ────────────────────────────────────────────

/**
 * Maps API error messages/status codes to learner-friendly UI state text.
 * Handles all states required by D1-044.
 */
function interpretBookingError(message: string, status: number): { label: string; variant: "notice" | "full" | "clash" | "ineligible" | "error" } {
  const msg = message.toLowerCase();
  if (msg.includes("already booked")) {
    return { label: "Already booked", variant: "notice" };
  }
  if (msg.includes("minimum booking notice") || msg.includes("advance notice") || msg.includes("hours before")) {
    return { label: "Too close to session time", variant: "notice" };
  }
  if (msg.includes("fully booked") || msg.includes("no seats")) {
    return { label: "Session full", variant: "full" };
  }
  if (msg.includes("calendar clash") || msg.includes("unavailable") || msg.includes("conflict")) {
    return { label: "Trainer unavailable (calendar clash)", variant: "clash" };
  }
  if (msg.includes("enrolment") || msg.includes("enrolled") || msg.includes("active") || msg.includes("forbidden") || status === 403) {
    return { label: "Not eligible for this session", variant: "ineligible" };
  }
  if (msg.includes("cancelled") || msg.includes("completed") || msg.includes("rescheduled")) {
    return { label: "Session unavailable", variant: "ineligible" };
  }
  if (status === 503) {
    return { label: "Calendar check failed — please retry", variant: "error" };
  }
  return { label: "Booking failed — please try again", variant: "error" };
}

// ─── BookingButton component ──────────────────────────────────────────────────

interface BookingButtonProps {
  session: Session;
  onBooked: (sessionId: string) => void;
  onRescheduleStart: (bookingId: string, currentSessionId: string) => void;
}

function BookingButton({ session, onBooked, onRescheduleStart }: BookingButtonProps) {
  const [state, setState] = useState<BookingState>({ type: "idle" });
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  const isAlreadyBooked =
    session.bookingStatus === "BOOKED" ||
    session.bookingStatus === "CONFIRMED" ||
    session.bookingStatus === "ATTENDED";

  const handleBook = useCallback(async () => {
    setState({ type: "loading" });
    try {
      const res = await fetch(`${API_URL}/sessions/${session.id}/book`, {
        method: "POST",
        headers: getAuthHeaders(),
      });

      if (res.ok) {
        setState({ type: "success", message: "Seat confirmed! Check your email for details." });
        onBooked(session.id);
        return;
      }

      const { message, status } = await parseApiError(res, "Booking failed");
      setState({ type: "error", message, code: String(status) });
    } catch (err: any) {
      setState({ type: "error", message: err.message || "Network error — please try again." });
    }
  }, [session.id, onBooked]);

  if (isAlreadyBooked) {
    return (
      <div className={styles.bookedBadgeContainer}>
        <div className={styles.bookedBadge} role="status" aria-live="polite">
          <span className={styles.bookedIcon}>{Icons.checkCircle}</span>
          <span>Seat reserved</span>
        </div>
        {session.bookingId && (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button
              type="button"
              className={styles.rescheduleBtn}
              disabled={state.type === "loading"}
              onClick={() => onRescheduleStart(session.bookingId!, session.id)}
            >
              Reschedule
            </button>
            <button
              type="button"
              className={styles.cancelBtn}
              disabled={state.type === "loading"}
              onClick={() => setConfirmCancelOpen(true)}
            >
              Cancel
            </button>
          </div>
        )}

        <ConfirmModal
          isOpen={confirmCancelOpen}
          onClose={() => setConfirmCancelOpen(false)}
          onConfirm={async () => {
            setConfirmCancelOpen(false);
            setState({ type: "loading" });
            try {
              const res = await fetch(`${API_URL}/sessions/bookings/${session.bookingId}/cancel`, {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify({ reason: "Learner cancelled via portal" }),
              });
              if (res.ok) {
                setState({ type: "success", message: "Booking cancelled successfully." });
                onBooked(session.id); // Trigger refresh
                return;
              }
              const { message, status } = await parseApiError(res, "Cancellation failed");
              setState({ type: "error", message, code: String(status) });
            } catch (err: any) {
              setState({ type: "error", message: err.message || "Network error — please try again." });
            }
          }}
          title="Cancel Booking"
          message="Are you sure you want to cancel your seat for this live session? You can re-book later if seats remain."
          confirmText="Yes, Cancel Booking"
          cancelText="Keep My Seat"
          tone="danger"
          isLoading={state.type === "loading"}
        />
      </div>
    );
  }

  if (state.type === "success") {
    return (
      <div className={styles.bookingSuccess} role="status" aria-live="polite">
        <span className={styles.bookedIcon}>{Icons.checkCircle}</span>
        <span>{state.message}</span>
      </div>
    );
  }

  if (state.type === "error") {
    const { label, variant } = interpretBookingError(state.message, Number(state.code ?? 0));
    return (
      <div className={`${styles.bookingErrorWrap}`}>
        <span
          className={`${styles.bookingErrorBadge} ${styles[`bookingErrorBadge_${variant}`]}`}
          role="alert"
          aria-live="assertive"
        >
          {label}
        </span>
        <button
          type="button"
          className={styles.retryBtn}
          onClick={() => setState({ type: "idle" })}
          aria-label="Retry booking"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`${styles.bookBtn} ${state.type === "loading" ? styles.bookBtnLoading : ""}`}
      onClick={handleBook}
      disabled={state.type === "loading"}
      aria-busy={state.type === "loading"}
      aria-label={`Book a seat for ${session.title}`}
    >
      {state.type === "loading" ? (
        <>
          <span className={styles.spinner} aria-hidden="true" />
          <span>Booking…</span>
        </>
      ) : (
        <>
          {Icons.checkCircle}
          <span>Book My Seat</span>
        </>
      )}
    </button>
  );
}

// ─── Page Component ───────────────────────────────────────────────────────────

/** GSB Startup Angel style meeting cards for cohort live classes — D1-044 booking */
export default function LiveSessionsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("upcoming");
  const [rescheduleState, setRescheduleState] = useState<{
    isOpen: boolean;
    bookingId: string;
    currentSessionId: string;
    loading: boolean;
    error: string;
  }>({
    isOpen: false,
    bookingId: "",
    currentSessionId: "",
    loading: false,
    error: "",
  });

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("active_live_session");
      if (stored) {
        setActiveSessionId(stored);
      }
    } catch {}
  }, []);

  // Heartbeat tracking effect: sends presence pings while session is live
  useEffect(() => {
    if (!activeSessionId) return;

    // Check if session has concluded
    const sess = sessions.find((s) => s.id === activeSessionId);
    if (sess) {
      const endMs = new Date(sess.endTime).getTime();
      if (Date.now() > endMs + 10 * 60000) {
        setActiveSessionId(null);
        try {
          localStorage.removeItem("active_live_session");
        } catch {}
        return;
      }
    }

    const sendHeartbeat = () => {
      fetch(`${API_URL}/sessions/${activeSessionId}/live-heartbeat`, {
        method: "POST",
        headers: getAuthHeaders(),
        keepalive: true,
      }).catch(() => {});
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 30000); // 30s interval

    const handleBeforeUnload = () => {
      fetch(`${API_URL}/sessions/${activeSessionId}/live-heartbeat`, {
        method: "POST",
        headers: getAuthHeaders(),
        keepalive: true,
      }).catch(() => {});
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [activeSessionId, sessions]);

  const handleJoinLiveSession = useCallback(async (s: Session) => {
    try {
      await fetch(`${API_URL}/sessions/${s.id}/attend`, {
        method: "POST",
        headers: getAuthHeaders(),
        keepalive: true,
      });
    } catch {}
    setActiveSessionId(s.id);
    try {
      localStorage.setItem("active_live_session", s.id);
    } catch {}
  }, []);

  const handleLeaveLiveSession = useCallback((sessionId: string) => {
    fetch(`${API_URL}/sessions/${sessionId}/live-heartbeat`, {
      method: "POST",
      headers: getAuthHeaders(),
      keepalive: true,
    }).catch(() => {});
    setActiveSessionId(null);
    try {
      localStorage.removeItem("active_live_session");
    } catch {}
  }, []);

  const handleRescheduleStart = useCallback(
    (bookingId: string, currentSessionId: string) => {
      setRescheduleState((prev) => ({
        ...prev,
        isOpen: true,
        bookingId,
        currentSessionId,
        error: "",
      }));
    },
    []
  );

  const fetchSessions = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    try {
      // Fetch sessions for the learner's enrolled batches
      const [sessRes, bookingsRes] = await Promise.all([
        fetch(`${API_URL}/sessions/mine`, {
          headers: getAuthHeaders(),
        }),
        fetch(`${API_URL}/sessions/my/bookings`, {
          headers: getAuthHeaders(),
        }),
      ]);

      let sessionList: Session[] = [];
      if (sessRes.ok) {
        const rawList = await sessRes.json();
        const seen = new Set<string>();
        sessionList = (Array.isArray(rawList) ? rawList : []).filter((s: Session) => {
          if (!s || !s.id || seen.has(s.id)) return false;
          seen.add(s.id);
          return true;
        });
      }

      // Overlay booking status on each session
      if (bookingsRes.ok) {
        const bookings: Array<{ id: string; sessionId: string; status: string }> = await bookingsRes.json();
        const bookingMap = new Map(
          bookings.map((b) => [b.sessionId, { bookingId: b.id, status: b.status }])
        );
        sessionList = sessionList.map((s) => {
          const booking = bookingMap.get(s.id);
          return booking
            ? {
                ...s,
                bookingStatus: booking.status as Session["bookingStatus"],
                bookingId: booking.bookingId,
              }
            : s;
        });
      }

      setSessions(sessionList);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void fetchSessions();
  }, [fetchSessions]);

  const handleBooked = useCallback((sessionId: string) => {
    // Optimistically mark session as booked in local state
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId ? { ...s, bookingStatus: "BOOKED" } : s
      )
    );
  }, []);

  const now = Date.now();
  const upcoming = sessions.filter((s) => s.status !== "COMPLETED" && (s.status === "ACTIVE" || new Date(s.endTime).getTime() + 2 * 60 * 60000 >= now));
  const past = sessions.filter((s) => s.status === "COMPLETED" || (s.status !== "ACTIVE" && new Date(s.endTime).getTime() + 2 * 60 * 60000 < now));
  const visible = tab === "upcoming" ? upcoming : past;
  const next = [...upcoming].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  )[0];

  const handleRescheduleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newSessionId = formData.get("newSessionId") as string;
    if (!newSessionId) return;

    setRescheduleState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const res = await fetch(`${API_URL}/sessions/bookings/${rescheduleState.bookingId}/reschedule`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ newSessionId }),
      });
      if (res.ok) {
        setRescheduleState((prev) => ({ ...prev, isOpen: false, loading: false }));
        // Refresh sessions to show the new booking state
        await fetchSessions();
        return;
      }
      const { message } = await parseApiError(res, "Reschedule failed");
      setRescheduleState((prev) => ({ ...prev, loading: false, error: message }));
    } catch (err: any) {
      setRescheduleState((prev) => ({ ...prev, loading: false, error: err.message }));
    }
  };

  const [calDate, setCalDate] = useState<Date>(new Date());

  const calendarDays = useMemo(() => {
    const year = calDate.getFullYear();
    const month = calDate.getMonth();
    const firstDay = new Date(year, month, 1);
    let firstDayIndex = firstDay.getDay() - 1;
    if (firstDayIndex === -1) firstDayIndex = 6;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const today = new Date();
    const isCurrentMonthYear = today.getFullYear() === year && today.getMonth() === month;

    const days: Array<{
      date: Date;
      dateStr: string;
      dayNum: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      events: Session[];
    }> = [];

    for (let i = firstDayIndex; i > 0; i--) {
      const dayNum = daysInPrevMonth - i + 1;
      const d = new Date(year, month - 1, dayNum);
      const dateStr = d.toISOString().split("T")[0] ?? "";
      days.push({
        date: d,
        dateStr,
        dayNum,
        isCurrentMonth: false,
        isToday: false,
        events: (() => {
          const seen = new Set<string>();
          return sessions.filter((s) => {
            if (!s || !s.id || seen.has(s.id)) return false;
            const mDate = new Date(s.startTime);
            const matches =
              mDate.getFullYear() === d.getFullYear() &&
              mDate.getMonth() === d.getMonth() &&
              mDate.getDate() === d.getDate();
            if (matches) {
              seen.add(s.id);
              return true;
            }
            return false;
          });
        })(),
      });
    }

    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const d = new Date(year, month, dayNum);
      const dateStr = d.toISOString().split("T")[0] ?? "";
      const isToday = isCurrentMonthYear && today.getDate() === dayNum;
      days.push({
        date: d,
        dateStr,
        dayNum,
        isCurrentMonth: true,
        isToday,
        events: (() => {
          const seen = new Set<string>();
          return sessions.filter((s) => {
            if (!s || !s.id || seen.has(s.id)) return false;
            const mDate = new Date(s.startTime);
            const matches =
              mDate.getFullYear() === year &&
              mDate.getMonth() === month &&
              mDate.getDate() === dayNum;
            if (matches) {
              seen.add(s.id);
              return true;
            }
            return false;
          });
        })(),
      });
    }

    const remaining = 7 - (days.length % 7);
    if (remaining < 7) {
      for (let dayNum = 1; dayNum <= remaining; dayNum++) {
        const d = new Date(year, month + 1, dayNum);
        const dateStr = d.toISOString().split("T")[0] ?? "";
        days.push({
          date: d,
          dateStr,
          dayNum,
          isCurrentMonth: false,
          isToday: false,
          events: sessions.filter((s) => {
            const mDate = new Date(s.startTime);
            return (
              mDate.getFullYear() === d.getFullYear() &&
              mDate.getMonth() === d.getMonth() &&
              mDate.getDate() === d.getDate()
            );
          }),
        });
      }
    }

    return days;
  }, [calDate, sessions]);

  const prevMonth = () => setCalDate(new Date(calDate.getFullYear(), calDate.getMonth() - 1, 1));
  const nextMonth = () => setCalDate(new Date(calDate.getFullYear(), calDate.getMonth() + 1, 1));
  const goToToday = () => setCalDate(new Date());
  const calMonthTitle = calDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const tabs: { value: Tab; label: string; count: number }[] = [
    { value: "upcoming", label: "Upcoming", count: upcoming.length },
    { value: "calendar", label: "Calendar Schedule", count: sessions.length },
    { value: "past", label: "Past & Recordings", count: past.length },
  ];

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Link href="/" className={styles.backLink} title="Back to Dashboard">
          <span className={styles.backIconWrap}>{ArrowLeft}</span>
          <span className={styles.backText}>Back</span>
        </Link>
        <span className={styles.headerDivider} aria-hidden="true" />
        <div className={styles.headerTitleGroup}>
          <h1 className={styles.title}>Live Sessions</h1>
          <span className={styles.headerBadge}>
            <span className={styles.headerBadgeDot} aria-hidden="true" />
            Join Roweena and your cohort for live classes.
          </span>
        </div>
      </header>

      {/* Tab navigation */}
      <div role="tablist" className={styles.tabsBar}>
        {tabs.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={tab === item.value}
            aria-controls={`tabpanel-${item.value}`}
            id={`tab-${item.value}`}
            onClick={() => setTab(item.value)}
            className={`${styles.tabBtn} ${tab === item.value ? styles.tabBtnActive : ""}`}
          >
            {item.label}
            <span className={styles.tabBadge}>{item.count}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className={styles.emptyState} role="status" aria-live="polite">
          <p>Loading your sessions…</p>
        </div>
      ) : tab === "calendar" ? (
        <div className={styles.calendarWrap}>
          {/* Calendar Top Navigation Bar */}
          <div className={styles.calendarToolbar}>
            <div className={styles.monthSelector}>
              <button
                type="button"
                className={styles.calNavArrowBtn}
                onClick={prevMonth}
                aria-label="Previous Month"
              >
                {Icons.chevronLeft}
              </button>
              <h2 className={styles.calMonthTitle}>{calMonthTitle}</h2>
              <button
                type="button"
                className={styles.calNavArrowBtn}
                onClick={nextMonth}
                aria-label="Next Month"
              >
                {Icons.chevronRight}
              </button>
              <button type="button" className={styles.calTodayBtn} onClick={goToToday}>
                Today
              </button>
            </div>

            <div className={styles.timezoneBadge}>
              <span className={styles.timezoneDot} aria-hidden="true" />
              <span>
                Timezone: <strong>{getUserTimeZone() || "UTC"}</strong>
              </span>
            </div>
          </div>

          {/* Weekday Names (Mon - Sun) */}
          <div className={styles.weekHeader} role="row">
            {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((wd) => (
              <div key={wd} className={styles.weekDayName} role="columnheader">
                {wd}
              </div>
            ))}
          </div>

          {/* 7-column Calendar Grid */}
          <div className={styles.calDaysGrid} role="grid" aria-label="Monthly Live Sessions Calendar">
            {calendarDays.map((cell: { date: Date; dateStr: string; dayNum: number; isCurrentMonth: boolean; isToday: boolean; events: Session[] }, idx: number) => (
              <div
                key={`${cell.dateStr}-${idx}`}
                className={`${styles.calDayCell} ${!cell.isCurrentMonth ? styles.calDayCellOutside : ""} ${cell.isToday ? styles.calDayCellToday : ""}`}
              >
                <div className={styles.calDayHeader}>
                  <span className={cell.isToday ? styles.calDayBadgeToday : styles.calDayNum}>
                    {cell.dayNum}
                  </span>
                </div>

                <div className={styles.calEventsStack}>
                  {cell.events.map((evt: Session, eIdx: number) => {
                    const isBooked =
                      evt.bookingStatus === "BOOKED" ||
                      evt.bookingStatus === "CONFIRMED" ||
                      evt.bookingStatus === "ATTENDED";
                    const isOneOnOne =
                      evt.sessionType === "ONE_ON_ONE" ||
                      evt.title?.toLowerCase().includes("1-on-1") ||
                      evt.title?.toLowerCase().includes("coaching");

                    return (
                      <div
                        key={`${cell.dateStr}-${evt.id}-${eIdx}`}
                        className={`${styles.calPill} ${isOneOnOne ? styles.calPillCoaching : styles.calPillCohort} ${isBooked ? styles.calPillBooked : ""}`}
                        title={`${evt.title} (${formatTime(new Date(evt.startTime))})`}
                        onClick={() => {
                          const safeUrl = sanitizeExternalUrl(evt.joinUrl);
                          if (safeUrl) {
                            window.open(safeUrl, "_blank", "noopener,noreferrer");
                          }
                        }}
                      >
                        <div className={styles.calPillTop}>
                          {isBooked ? (
                            <span className={styles.calPillCheck}>{Icons.badgeCheck}</span>
                          ) : !isOneOnOne ? (
                            <span className={styles.calPillVideoIcon}>{Icons.video}</span>
                          ) : null}
                          <span className={styles.calPillTitle}>{evt.title}</span>
                        </div>
                        <span className={styles.calPillTime}>
                          {formatTime(new Date(evt.startTime))}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Calendar Legend */}
          <div className={styles.calLegend}>
            <div className={styles.legendItem}>
              <span className={styles.legendDotCohort} />
              <span>Cohort Live Class</span>
            </div>
            <div className={styles.legendItem}>
              <span className={styles.legendDotCoaching} />
              <span>1-on-1 Coaching</span>
            </div>
            <div className={styles.legendItem}>
              <span className={styles.legendDotBooked} />
              <span>Booked / Attended</span>
            </div>
            <div className={styles.legendItem}>
              <span className={styles.legendDotToday} />
              <span>Current Day</span>
            </div>
          </div>

          {/* Policy Notes */}
          <ul className={styles.calendarNotes}>
            <li>Book your seat at least 12 hours before the session starts.</li>
            <li>Check-in opens 5 minutes before a meeting starts.</li>
            <li>Attendance is recorded when you check-in and join.</li>
          </ul>
        </div>
      ) : visible.length === 0 ? (
        <div
          className={styles.emptyState}
          role="tabpanel"
          id={`tabpanel-${tab}`}
          aria-labelledby={`tab-${tab}`}
        >
          <div className={styles.emptyIconCircle}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
          </div>
          <p className={styles.emptyStateTitle}>
            {tab === "upcoming"
              ? "No upcoming meetings scheduled right now."
              : "No past meetings yet."}
          </p>
          <p className={styles.emptyStateSubtitle}>
            {tab === "upcoming"
              ? "Upcoming live cohort classes and 1-on-1 coaching sessions will appear here once scheduled."
              : "Past live recordings and completed sessions will appear here once they conclude."}
          </p>

          {tab === "upcoming" && (past.length > 0 || sessions.length > 0) && (
            <div className={styles.emptyActions}>
              {past.length > 0 && (
                <button
                  type="button"
                  className={styles.emptyActionBtnPrimary}
                  onClick={() => setTab("past")}
                >
                  {Icons.play}
                  <span>View Past Sessions &amp; Recordings ({past.length})</span>
                </button>
              )}
              <button
                type="button"
                className={styles.emptyActionBtnSecondary}
                onClick={() => setTab("calendar")}
              >
                {Icons.calendar}
                <span>Open Calendar Schedule</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div
          className={styles.cardGrid}
          role="tabpanel"
          id={`tabpanel-${tab}`}
          aria-labelledby={`tab-${tab}`}
        >
          {visible.map((s, sIdx) => {
            const start = new Date(s.startTime);
            const end = new Date(s.endTime);
            const live = s.status !== "COMPLETED" && s.status !== "CANCELLED" && (s.status === "ACTIVE" || (now >= start.getTime() - 10 * 60000 && now <= end.getTime() + 2 * 60 * 60000));
            const ended = s.status === "COMPLETED" || (s.status !== "ACTIVE" && now > end.getTime() + 2 * 60 * 60000);
            const isNext = s.id === next?.id && !ended;
            const isBooked =
              s.bookingStatus === "BOOKED" ||
              s.bookingStatus === "CONFIRMED" ||
              s.bookingStatus === "ATTENDED";

            // A group-cohort session in the future that is SCHEDULED or ACTIVE can be booked
            const canBook =
              s.sessionType === "ONE_ON_ONE" && !ended &&
              !live &&
              s.status !== "CANCELLED" &&
              s.status !== "RESCHEDULED";

            return (
              <article
                key={`${s.id}-${sIdx}`}
                className={`${styles.card} ${isNext ? styles.cardNext : ""} ${live ? styles.cardLive : ""} ${ended ? styles.cardEnded : ""}`}
                aria-label={s.title}
              >
                {/* Media banner */}
                <div className={styles.cardBanner}>
                  <Image
                    src="/brand/session.png"
                    alt=""
                    width={400}
                    height={200}
                    quality={80}
                    loading="lazy"
                    sizes="(max-width: 768px) 100vw, 400px"
                    className={styles.bannerImg}
                    aria-hidden="true"
                  />

                  {/* Status chip */}
                  <div className={styles.statusBadgeWrap}>
                    {live ? (
                      <span className={styles.badgeLive} aria-label="Session is live now">
                        <span className={styles.pulse} aria-hidden="true" /> LIVE NOW
                      </span>
                    ) : isNext ? (
                      <span className={styles.badgeNext}>NEXT UP</span>
                    ) : ended ? (
                      <span className={styles.badgeEnded}>COMPLETED</span>
                    ) : s.status === "CANCELLED" ? (
                      <span className={styles.badgeEnded}>CANCELLED</span>
                    ) : (
                      <span className={styles.badgeUpcoming}>SCHEDULED</span>
                    )}
                  </div>

                  {/* Date badge */}
                  <div className={styles.dateTile} aria-hidden="true">
                    <span className={styles.dateMonth}>{formatMonth(start)}</span>
                    <strong className={styles.dateDay}>{formatDay(start)}</strong>
                  </div>
                </div>

                {/* Card body */}
                <div className={styles.cardBody}>
                  <div className={styles.cardEyebrow}>
                    <span>11 Steps to You</span>
                    <span className={styles.eyebrowDot} aria-hidden="true">·</span>
                    <span>{formatDuration(start, end)}</span>
                    {s.sessionType === "ONE_ON_ONE" && (
                      <>
                        <span className={styles.eyebrowDot} aria-hidden="true">·</span>
                        <span>1-on-1</span>
                      </>
                    )}
                  </div>

                  <h2 className={styles.cardTitle}>{s.title}</h2>

                  {/* Facilitator row */}
                  <div className={styles.hostRow}>
                    <Image
                      src="/brand/roweena.png"
                      alt="Roweena Britto"
                      width={30}
                      height={30}
                      quality={80}
                      loading="lazy"
                      sizes="30px"
                      className={styles.hostAvatar}
                    />
                    <div className={styles.hostInfo}>
                      <div className={styles.hostNameRow}>
                        <span className={styles.hostName}>
                          {s.hostTrainer?.name ?? "Roweena Britto"}
                        </span>
                        <span className={styles.verifiedMark} title="Lead Facilitator" aria-label="Lead Facilitator">
                          {Icons.badgeCheck}
                        </span>
                      </div>
                      <span className={styles.hostRole}>Lead Facilitator · Brain Coach</span>
                    </div>
                  </div>

                  {/* Meeting details */}
                  <div className={styles.metaBox} aria-label="Session details">
                    <div className={styles.metaRow}>
                      <span className={styles.metaIcon} aria-hidden="true">{Icons.calendar}</span>
                      <span className={styles.metaText}>{formatWeekdayDate(start)}</span>
                    </div>
                    <div className={styles.metaRow}>
                      <span className={styles.metaIcon} aria-hidden="true">{Icons.clock}</span>
                      <span className={styles.metaText}>
                        {formatTimeRange(start, end)}
                      </span>
                    </div>
                    <div className={styles.metaRow}>
                      <span className={styles.metaIcon} aria-hidden="true">{Icons.video}</span>
                      <span className={styles.metaText}>Live Interactive Classroom</span>
                    </div>
                    {s.capacity !== null && s.capacity !== undefined && (
                      <div className={styles.metaRow}>
                        <span className={styles.metaIcon} aria-hidden="true">{Icons.users}</span>
                        <span className={styles.metaText}>
                          {s.sessionType === "ONE_ON_ONE"
                            ? "1-on-1 Private Session"
                            : `Up to ${s.capacity} participants`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card footer: join / book / recording */}
                <div className={styles.cardFooter}>
                  {/* Session is live — show join link & active presence badge */}
                  {live && sanitizeExternalUrl(s.joinUrl) ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%" }}>
                      {activeSessionId === s.id && (
                        <div style={{
                          padding: "6px 12px",
                          borderRadius: "8px",
                          background: "#ecfdf5",
                          border: "1px solid #a7f3d0",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          fontSize: "0.78rem",
                          color: "#065f46",
                        }}>
                          <span style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 600 }}>
                            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
                            Live Session Active (Tracking Attendance)
                          </span>
                          <button
                            type="button"
                            onClick={() => handleLeaveLiveSession(s.id)}
                            style={{
                              background: "transparent",
                              border: "1px solid #6ee7b7",
                              borderRadius: "4px",
                              padding: "2px 8px",
                              fontSize: "0.72rem",
                              color: "#047857",
                              cursor: "pointer",
                              fontWeight: 600,
                            }}
                          >
                            Leave
                          </button>
                        </div>
                      )}
                      <a
                        href={buildLearnerJoinUrl(s.joinUrl)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => handleJoinLiveSession(s)}
                        className={`${styles.joinBtn} ${styles.joinBtnLive}`}
                        aria-label={`Join ${s.title} — live now`}
                      >
                        {Icons.video}
                        <span>{activeSessionId === s.id ? "Reopen Zoom Call" : "Join Call Now"}</span>
                        {Icons.arrowUpRight}
                      </a>
                    </div>
                  ) : ended && sanitizeExternalUrl(s.recordingUrl) ? (
                    /* Ended with recording */
                    <a
                      href={sanitizeExternalUrl(s.recordingUrl)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.recordingBtn}
                      aria-label={`Watch recording of ${s.title}`}
                    >
                      {Icons.play}
                      <span>Watch Recording</span>
                    </a>
                  ) : ended ? (
                    /* Ended, no recording yet */
                    <span className={styles.statusNote} role="status">
                      <span className={styles.statusNoteCheck}>{Icons.badgeCheck}</span>
                      <span>Session completed</span>
                    </span>
                  ) : s.status === "CANCELLED" ? (
                    /* Cancelled session */
                    <span className={styles.statusNote} role="status">Session cancelled</span>
                  ) : sanitizeExternalUrl(s.joinUrl) ? (
                    /* Has join link — show join button, plus booking action if applicable */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                      <a
                        href={buildLearnerJoinUrl(s.joinUrl)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => handleJoinLiveSession(s)}
                        className={styles.joinBtn}
                        aria-label={`Join ${s.title}`}
                      >
                        {Icons.video}
                        <span>Join Meeting</span>
                        {Icons.arrowUpRight}
                      </a>
                      {s.sessionType === "ONE_ON_ONE" && (isBooked || canBook) && (
                        <BookingButton session={s} onBooked={handleBooked} onRescheduleStart={handleRescheduleStart} />
                      )}
                    </div>
                  ) : isBooked ? (
                    /* Booked, no join link yet */
                    <BookingButton session={s} onBooked={handleBooked} onRescheduleStart={handleRescheduleStart} />
                  ) : canBook ? (
                    /* Not yet booked — show booking button */
                    <BookingButton session={s} onBooked={handleBooked} onRescheduleStart={handleRescheduleStart} />
                  ) : (
                    /* Default: join link without booking */
                    sanitizeExternalUrl(s.joinUrl) ? (
                      <a
                        href={buildLearnerJoinUrl(s.joinUrl)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.joinBtn}
                        aria-label={`Join ${s.title}`}
                      >
                        {Icons.video}
                        <span>Join Meeting</span>
                        {Icons.arrowUpRight}
                      </a>
                    ) : (
                      <span className={styles.lockedNote} role="status">
                        Join link unlocks 5m prior
                      </span>
                    )
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Guidelines footer */}
      <ul className={styles.notes} aria-label="Session guidelines">
        <li>Book your seat at least 12 hours before the session starts.</li>
        <li>Check-in opens 5 minutes before a meeting starts.</li>
        <li>Attendance is recorded when you check in and join.</li>
        <li>Recordings appear under Past once they are added.</li>
      </ul>

      {rescheduleState.isOpen && (
        <div className={styles.modalOverlay} onClick={() => setRescheduleState(prev => ({...prev, isOpen: false}))}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Reschedule Session</h2>
              <button className={styles.closeBtn} onClick={() => setRescheduleState(prev => ({...prev, isOpen: false}))}>×</button>
            </div>
            <form onSubmit={handleRescheduleSubmit} className={styles.modalForm}>
              <div className={styles.formGroup}>
                <label>Select New Session</label>
                <select name="newSessionId" required disabled={rescheduleState.loading}>
                  <option value="">-- Choose a new session --</option>
                  {upcoming
                    .filter(s => s.id !== rescheduleState.currentSessionId && s.status === "SCHEDULED" && s.capacity !== 0 && !s.bookingId)
                    .map(s => (
                      <option key={s.id} value={s.id}>
                        {formatWeekdayDate(new Date(s.startTime))} • {formatTime(new Date(s.startTime))} ({s.title})
                      </option>
                  ))}
                </select>
              </div>
              {rescheduleState.error && (
                <p className={styles.bookingErrorBadge} style={{ background: '#fef2f2', color: '#b91c1c', marginTop: '1rem', padding: '0.5rem' }}>
                  {rescheduleState.error}
                </p>
              )}
              <div className={styles.modalFooter} style={{ marginTop: '2rem', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button type="button" className={styles.cancelBtn} onClick={() => setRescheduleState(prev => ({...prev, isOpen: false}))}>
                  Cancel
                </button>
                <button type="submit" className={styles.bookBtn} disabled={rescheduleState.loading} style={{ padding: '0.5rem 1rem', flex: 'none', height: 'auto', borderRadius: '4px' }}>
                  {rescheduleState.loading ? 'Rescheduling...' : 'Confirm Reschedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
