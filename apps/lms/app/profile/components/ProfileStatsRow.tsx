"use client";

import React from "react";
import styles from "../profile.module.css";

export interface ProfileStatsRowProps {
  coursesCount: number;
  scheduledMeetingsCount: number;
  certificatesCount: number;
}

export default function ProfileStatsRow({
  coursesCount,
  scheduledMeetingsCount,
  certificatesCount,
}: ProfileStatsRowProps) {
  const stats = [
    {
      id: "courses",
      label: "Courses",
      sublabel: "Total enrolled courses",
      value: coursesCount,
      themeClass: styles.statThemeOrange,
      icon: (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      ),
    },
    {
      id: "meetings",
      label: "Scheduled Meetings",
      sublabel: "Upcoming live sessions",
      value: scheduledMeetingsCount,
      themeClass: styles.statThemePurple,
      icon: (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
    },
    {
      id: "certificates",
      label: "Certificates",
      sublabel: "Courses completed",
      value: certificatesCount,
      themeClass: styles.statThemeGreen,
      icon: (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="8" r="6" />
          <path d="M15.4 13.8L18 22l-6-3-6 3 2.6-8.2" />
        </svg>
      ),
    },
  ];

  return (
    <section className={styles.statsGrid} aria-label="Learning metrics summary">
      {stats.map((s) => (
        <article key={s.id} className={styles.statCard}>
          <div className={`${styles.statIconWrap} ${s.themeClass}`}>
            {s.icon}
          </div>
          <div className={styles.statContent}>
            <div className={styles.statValue}>{s.value}</div>
            <div className={styles.statLabel}>{s.label}</div>
            <div className={styles.statSublabel}>{s.sublabel}</div>
          </div>
        </article>
      ))}
    </section>
  );
}
