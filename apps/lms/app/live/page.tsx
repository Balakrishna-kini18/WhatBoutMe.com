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

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import styles from "./live.module.css";
import { API_URL, getAuthHeaders, parseApiError } from "../lib/api";

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

type Tab = "upcoming" | "past";

// ─── Icon helpers ─────────────────────────────────────────────────────────────

const Icons = {
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

const formatTime = (d: Date) =>
  d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

const formatMonth = (d: Date) =>
  d.toLocaleDateString([], { month: "short" }).toUpperCase();

const formatDay = (d: Date) =>
  String(d.getDate()).padStart(2, "0");

const formatWeekdayDate = (d: Date) =>
  d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });

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
}

function BookingButton({ session, onBooked }: BookingButtonProps) {
  const [state, setState] = useState<BookingState>({ type: "idle" });

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
          <button
            type="button"
            className={styles.cancelBtn}
            disabled={state.type === "loading"}
            onClick={async () => {
              if (!confirm("Are you sure you want to cancel this booking?")) return;
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
          >
            Cancel
          </button>
        )}
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
        sessionList = await sessRes.json();
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
  const upcoming = sessions.filter((s) => new Date(s.endTime).getTime() >= now);
  const past = sessions.filter((s) => new Date(s.endTime).getTime() < now);
  const visible = tab === "upcoming" ? upcoming : past;
  const next = [...upcoming].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  )[0];

  const tabs: { value: Tab; label: string; count: number }[] = [
    { value: "upcoming", label: "Upcoming", count: upcoming.length },
    { value: "past", label: "Past", count: past.length },
  ];

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Live Sessions</h1>
        <p className={styles.subtitle}>Join Roweena and your cohort for live classes.</p>
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
      ) : visible.length === 0 ? (
        <div
          className={styles.emptyState}
          role="tabpanel"
          id={`tabpanel-${tab}`}
          aria-labelledby={`tab-${tab}`}
        >
          <p>
            {tab === "upcoming"
              ? "No meetings are scheduled for your cohort yet."
              : "No past meetings."}
          </p>
        </div>
      ) : (
        <div
          className={styles.cardGrid}
          role="tabpanel"
          id={`tabpanel-${tab}`}
          aria-labelledby={`tab-${tab}`}
        >
          {visible.map((s) => {
            const start = new Date(s.startTime);
            const end = new Date(s.endTime);
            const live = now >= start.getTime() - 5 * 60000 && now <= end.getTime();
            const ended = now > end.getTime();
            const isNext = s.id === next?.id && !ended;
            const isBooked =
              s.bookingStatus === "BOOKED" ||
              s.bookingStatus === "CONFIRMED" ||
              s.bookingStatus === "ATTENDED";

            // A group-cohort session in the future that is SCHEDULED or ACTIVE can be booked
            const canBook =
              !ended &&
              !live &&
              s.status !== "CANCELLED" &&
              s.status !== "RESCHEDULED";

            return (
              <article
                key={s.id}
                className={`${styles.card} ${isNext ? styles.cardNext : ""} ${live ? styles.cardLive : ""} ${ended ? styles.cardEnded : ""}`}
                aria-label={s.title}
              >
                {/* Media banner */}
                <div className={styles.cardBanner}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/brand/session.png"
                    alt=""
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
                    <span className={styles.eyebrowDot} aria-hidden="true">•</span>
                    <span>{formatDuration(start, end)}</span>
                    {s.sessionType === "ONE_ON_ONE" && (
                      <>
                        <span className={styles.eyebrowDot} aria-hidden="true">•</span>
                        <span>1-on-1</span>
                      </>
                    )}
                  </div>

                  <h2 className={styles.cardTitle}>{s.title}</h2>

                  {/* Facilitator row */}
                  <div className={styles.hostRow}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/brand/roweena.png"
                      alt="Roweena Britto"
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
                        {formatTime(start)} – {formatTime(end)} ({formatDuration(start, end)})
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
                  {/* Session is live — show join link */}
                  {live && s.joinUrl ? (
                    <a
                      href={s.joinUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={`${styles.joinBtn} ${styles.joinBtnLive}`}
                      aria-label={`Join ${s.title} — live now`}
                    >
                      {Icons.video}
                      <span>Join Call Now</span>
                      {Icons.arrowUpRight}
                    </a>
                  ) : ended && s.recordingUrl ? (
                    /* Ended with recording */
                    <a
                      href={s.recordingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.recordingBtn}
                      aria-label={`Watch recording of ${s.title}`}
                    >
                      {Icons.play}
                      <span>Watch Recording</span>
                    </a>
                  ) : ended ? (
                    /* Ended, no recording yet */
                    <span className={styles.statusNote} role="status">Session completed</span>
                  ) : s.status === "CANCELLED" ? (
                    /* Cancelled session */
                    <span className={styles.statusNote} role="status">Session cancelled</span>
                  ) : isBooked && s.joinUrl ? (
                    /* Booked and has join link — show join button */
                    <a
                      href={s.joinUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.joinBtn}
                      aria-label={`Join ${s.title}`}
                    >
                      {Icons.video}
                      <span>Join Meeting</span>
                      {Icons.arrowUpRight}
                    </a>
                  ) : isBooked ? (
                    /* Booked, no join link yet */
                    <div className={styles.bookedBadge} role="status">
                      <span className={styles.bookedIcon} aria-hidden="true">{Icons.checkCircle}</span>
                      <span>Seat reserved</span>
                    </div>
                  ) : canBook ? (
                    /* Not yet booked — show booking button */
                    <BookingButton session={s} onBooked={handleBooked} />
                  ) : (
                    /* Default: join link without booking */
                    s.joinUrl ? (
                      <a
                        href={s.joinUrl}
                        target="_blank"
                        rel="noreferrer"
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
    </div>
  );
}
