"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./live.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface Session {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  joinUrl: string | null;
  recordingUrl: string | null;
}

type Tab = "upcoming" | "past";

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
};

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

/** GSB Startup Angel style meeting cards for cohort live classes */
export default function LiveSessionsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("upcoming");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : { upcomingSessions: [] }))
      .then((profile) => setSessions(profile.upcomingSessions || []))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, [router]);

  const now = Date.now();
  const upcoming = sessions.filter((s) => new Date(s.endTime).getTime() >= now);
  const past = sessions.filter((s) => new Date(s.endTime).getTime() < now);
  const visible = tab === "upcoming" ? upcoming : past;
  const next = [...upcoming].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())[0];

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

      {/* Tabs navigation */}
      <div role="tablist" className={styles.tabsBar}>
        {tabs.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={tab === item.value}
            onClick={() => setTab(item.value)}
            className={`${styles.tabBtn} ${tab === item.value ? styles.tabBtnActive : ""}`}
          >
            {item.label}
            <span className={styles.tabBadge}>{item.count}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className={styles.emptyState}>
          <p>Loading your sessions...</p>
        </div>
      ) : visible.length === 0 ? (
        <div className={styles.emptyState}>
          <p>
            {tab === "upcoming"
              ? "No meetings are scheduled for your cohort yet."
              : "No past meetings."}
          </p>
        </div>
      ) : (
        /* GSB Startup Angel meeting card grid in web */
        <div className={styles.cardGrid}>
          {visible.map((s) => {
            const start = new Date(s.startTime);
            const end = new Date(s.endTime);
            const live = now >= start.getTime() - 5 * 60000 && now <= end.getTime();
            const ended = now > end.getTime();
            const isNext = s.id === next?.id && !ended;

            return (
              <article
                key={s.id}
                className={`${styles.card} ${isNext ? styles.cardNext : ""} ${live ? styles.cardLive : ""} ${ended ? styles.cardEnded : ""}`}
              >
                {/* Media banner with artwork, live badge & floating calendar badge */}
                <div className={styles.cardBanner}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/brand/session.png"
                    alt=""
                    className={styles.bannerImg}
                  />

                  {/* Status chip on top-left */}
                  <div className={styles.statusBadgeWrap}>
                    {live ? (
                      <span className={styles.badgeLive}>
                        <span className={styles.pulse} /> LIVE NOW
                      </span>
                    ) : isNext ? (
                      <span className={styles.badgeNext}>NEXT UP</span>
                    ) : ended ? (
                      <span className={styles.badgeEnded}>COMPLETED</span>
                    ) : (
                      <span className={styles.badgeUpcoming}>SCHEDULED</span>
                    )}
                  </div>

                  {/* Floating calendar date badge on top-right */}
                  <div className={styles.dateTile}>
                    <span className={styles.dateMonth}>{formatMonth(start)}</span>
                    <strong className={styles.dateDay}>{formatDay(start)}</strong>
                  </div>
                </div>

                {/* Card Body */}
                <div className={styles.cardBody}>
                  <div className={styles.cardEyebrow}>
                    <span>11 Steps to You</span>
                    <span className={styles.eyebrowDot}>•</span>
                    <span>{formatDuration(start, end)}</span>
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
                        <span className={styles.hostName}>Roweena Britto</span>
                        <span className={styles.verifiedMark} title="Lead Facilitator">
                          {Icons.badgeCheck}
                        </span>
                      </div>
                      <span className={styles.hostRole}>Lead Facilitator · Brain Coach</span>
                    </div>
                  </div>

                  {/* Meeting details metadata card */}
                  <div className={styles.metaBox}>
                    <div className={styles.metaRow}>
                      <span className={styles.metaIcon}>{Icons.calendar}</span>
                      <span className={styles.metaText}>{formatWeekdayDate(start)}</span>
                    </div>
                    <div className={styles.metaRow}>
                      <span className={styles.metaIcon}>{Icons.clock}</span>
                      <span className={styles.metaText}>
                        {formatTime(start)} – {formatTime(end)} ({formatDuration(start, end)})
                      </span>
                    </div>
                    <div className={styles.metaRow}>
                      <span className={styles.metaIcon}>{Icons.video}</span>
                      <span className={styles.metaText}>Live Interactive Classroom</span>
                    </div>
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className={styles.cardFooter}>
                  {!ended && s.joinUrl ? (
                    <a
                      href={s.joinUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={`${styles.joinBtn} ${live ? styles.joinBtnLive : ""}`}
                    >
                      {Icons.video}
                      <span>{live ? "Join Call Now" : "Join Meeting"}</span>
                      {Icons.arrowUpRight}
                    </a>
                  ) : s.recordingUrl ? (
                    <a
                      href={s.recordingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.recordingBtn}
                    >
                      {Icons.play}
                      <span>Watch Recording</span>
                    </a>
                  ) : ended ? (
                    <span className={styles.statusNote}>Session completed</span>
                  ) : (
                    <span className={styles.lockedNote}>Join link unlocks 5m prior</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Guidelines footer note */}
      <ul className={styles.notes}>
        <li>Check-in opens 5 minutes before a meeting starts.</li>
        <li>Attendance is recorded when you check in and join.</li>
        <li>Recordings appear under Past once they are added.</li>
      </ul>
    </div>
  );
}
