"use client";

import React from "react";
import Link from "next/link";
import { sanitizeExternalUrl } from "../../lib/auth-redirect";
import styles from "../../page.module.css";

export interface UpcomingSessionData {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  joinUrl: string | null;
  recordingUrl: string | null;
  quizId: string | null;
}

interface LearnerUpcomingSessionsProps {
  sessions: UpcomingSessionData[];
}

export default function LearnerUpcomingSessions({
  sessions,
}: LearnerUpcomingSessionsProps) {
  return (
    <section
      className={styles.upcomingSessionsCard}
      aria-labelledby="live-sessions-heading"
    >
      <div className={styles.cardHeaderRow}>
        <div className={styles.cardHeaderWithIcon}>
          <span
            className={styles.cardHeaderIcon}
            style={{ color: "#6366f1" }}
            aria-hidden="true"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </span>
          <h2 id="live-sessions-heading" className={styles.cardHeaderTitle}>
            Upcoming Live Sessions
          </h2>
        </div>

        <Link href="/live" className={styles.viewAllLinkSmall}>
          <span>View All</span>
          <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>

      {sessions.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {sessions.slice(0, 2).map((s) => (
            <div key={s.id} className={styles.sessionItemRow}>
              <div>
                <div className={styles.sessionItemTitle}>{s.title}</div>
                <div className={styles.sessionItemDate}>
                  {new Date(s.startTime).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  &bull;{" "}
                  {new Date(s.startTime).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
              {sanitizeExternalUrl(s.joinUrl) ? (
                <Link
                  href={`/live?autoJoin=${s.id}`}
                  className={styles.sessionJoinBtn}
                >
                  Join &rarr;
                </Link>
              ) : (
                <Link href="/live" className={styles.sessionJoinBtn}>
                  Details &rarr;
                </Link>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.emptySessionsState}>
          <div className={styles.emptyCalendarIcon} aria-hidden="true">
            <svg width="52" height="52" viewBox="0 0 64 64" fill="none">
              <rect
                x="8"
                y="14"
                width="48"
                height="42"
                rx="10"
                fill="#e0e7ff"
              />
              <rect
                x="8"
                y="14"
                width="48"
                height="14"
                rx="10"
                fill="#c7d2fe"
              />
              <rect x="8" y="22" width="48" height="6" fill="#c7d2fe" />
              <line
                x1="18"
                y1="8"
                x2="18"
                y2="18"
                stroke="#818cf8"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <line
                x1="46"
                y1="8"
                x2="46"
                y2="18"
                stroke="#818cf8"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <circle cx="44" cy="44" r="11" fill="#818cf8" />
              <circle cx="44" cy="44" r="9" fill="#c7d2fe" />
              <polyline
                points="44 39 44 44 47 46"
                stroke="#4338ca"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h3 className={styles.emptySessionTitle}>No upcoming live sessions</h3>
          <p className={styles.emptySessionSubtitle}>
            You&apos;re all caught up! New sessions will appear here.
          </p>
        </div>
      )}
    </section>
  );
}
