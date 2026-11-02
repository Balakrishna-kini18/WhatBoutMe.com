"use client";

import React from "react";
import Image from "next/image";
import styles from "../../page.module.css";

interface LearnerMyCoursesBannerProps {
  overallPercentage: number;
}

export default function LearnerMyCoursesBanner({
  overallPercentage,
}: LearnerMyCoursesBannerProps) {
  const cleanPct = Math.min(100, Math.max(0, overallPercentage));

  // Circular ring calculation (radius: 41, circumference: ~257.61)
  const RADIUS = 41;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const strokeOffset = CIRCUMFERENCE - (CIRCUMFERENCE * cleanPct) / 100;

  const motivationalTitle = cleanPct >= 100 ? "Great job!" : "Keep going!";

  const motivationalDesc =
    cleanPct >= 100
      ? "You have completed all your course materials. Keep learning!"
      : "You are making steady progress toward earning your certificate.";

  return (
    <section
      className={styles.myCoursesBanner}
      aria-label="My Courses and learning progress"
    >
      {/* Subtle organic background wave shapes */}
      <svg
        className={styles.bannerWaveBg}
        viewBox="0 0 1000 160"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M0 160 C 220 120, 360 145, 500 120 C 640 95, 780 135, 1000 110 L 1000 160 Z"
          fill="rgba(254, 215, 170, 0.28)"
        />
        <path
          d="M0 160 C 180 145, 380 125, 560 140 C 740 155, 860 130, 1000 140 L 1000 160 Z"
          fill="rgba(253, 186, 116, 0.18)"
        />
      </svg>

      <div className={styles.bannerMainRow}>
        {/* Left Zone: Circular Progress Ring + Divider + My Courses Title & Subtitle */}
        <div className={styles.bannerLeftZone}>
          <div className={styles.bannerProgressRingWrap}>
            <svg
              viewBox="0 0 100 100"
              aria-hidden="true"
              className={styles.bannerRingSvg}
            >
              <defs>
                <linearGradient
                  id="bannerOrangeGradResponsive"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor="#fb923c" />
                  <stop offset="100%" stopColor="#ea580c" />
                </linearGradient>
              </defs>
              <circle
                cx="50"
                cy="50"
                r={RADIUS}
                stroke="#fed7aa"
                strokeWidth="8"
                fill="none"
              />
              <circle
                cx="50"
                cy="50"
                r={RADIUS}
                stroke="url(#bannerOrangeGradResponsive)"
                strokeWidth="8"
                strokeLinecap="round"
                fill="none"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={strokeOffset}
                className={styles.bannerRingProgressCircle}
              />
            </svg>
            <span className={styles.bannerProgressPercent}>{cleanPct}%</span>
          </div>

          <div className={styles.bannerDivider} aria-hidden="true" />

          <div className={styles.bannerHeadingGroup}>
            <h1 className={styles.bannerTitle}>My Courses</h1>
            <p className={styles.bannerSubtitle}>
              Continue your learning journey and build your skills
            </p>
          </div>
        </div>

        {/* Center Zone: Graduation Cap artwork (visible on tablet, hidden on small mobile) */}
        <div className={styles.bannerIllustrationWrap} aria-hidden="true">
          <Image
            src="/images/course-banner-cap.png"
            alt=""
            width={180}
            height={100}
            className={styles.bannerIllustrationImg}
            priority
          />
        </div>

        {/* Right Zone: Motivational & Certificate Progress message */}
        <div className={styles.bannerRightZone}>
          <div className={styles.bannerMotivationalRow}>
            <svg
              className={styles.bannerCelebrationIcon}
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ea580c"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="12" y1="2" x2="12" y2="6" />
              <line x1="12" y1="18" x2="12" y2="22" />
              <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
              <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
              <line x1="2" y1="12" x2="6" y2="12" />
              <line x1="18" y1="12" x2="22" y2="12" />
              <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
              <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
            </svg>
            <h2 className={styles.bannerMotivationalTitle}>{motivationalTitle}</h2>
          </div>
          <p className={styles.bannerMotivationalDesc}>{motivationalDesc}</p>
        </div>
      </div>
    </section>
  );
}
