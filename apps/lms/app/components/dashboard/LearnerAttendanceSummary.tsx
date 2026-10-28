"use client";

import React from "react";
import styles from "../../page.module.css";

interface LearnerAttendanceSummaryProps {
  percentage: number;
  attendedSessions: number;
  totalSessions: number;
}

export default function LearnerAttendanceSummary({
  percentage,
  attendedSessions,
  totalSessions,
}: LearnerAttendanceSummaryProps) {
  const CIRCLE_RADIUS = 40;
  const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS; // ~251.32px
  const cleanPct = Math.min(100, Math.max(0, percentage));
  const offset = CIRCLE_CIRCUMFERENCE - (CIRCLE_CIRCUMFERENCE * cleanPct) / 100;

  return (
    <div className={styles.donutCol}>
      <div className={styles.donutRingWrap}>
        <svg
          className={styles.donutSvg}
          viewBox="0 0 100 100"
          role="img"
          aria-label={`Attendance rate ${cleanPct}%`}
        >
          <circle
            className={styles.donutTrack}
            cx="50"
            cy="50"
            r={CIRCLE_RADIUS}
            fill="none"
            strokeWidth="10"
          />
          <circle
            className={styles.donutFill}
            cx="50"
            cy="50"
            r={CIRCLE_RADIUS}
            fill="none"
            strokeWidth="10"
            strokeDasharray={CIRCLE_CIRCUMFERENCE}
            strokeDashoffset={offset}
          />
        </svg>
        <span className={styles.donutCenterValue}>{cleanPct}%</span>
      </div>
      <h3 className={styles.donutTitle}>Attendance</h3>
      <p className={styles.donutSubtitle}>
        {attendedSessions} of {totalSessions} live sessions completed
      </p>
    </div>
  );
}
