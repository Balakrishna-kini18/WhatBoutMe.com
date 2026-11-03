"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import styles from "../../page.module.css";

export interface CourseCardData {
  key: string;
  title: string;
  batchName?: string;
  status?: string;
  progress: number;
  totalLessons: number;
  completedLessons: number;
  image: string;
  route: string;
}

interface LearnerCourseCardProps {
  course: CourseCardData;
  isPriority?: boolean;
}

export default function LearnerCourseCard({
  course,
  isPriority = false,
}: LearnerCourseCardProps) {
  const [imgError, setImgError] = useState(false);
  const isPendingAgreement = course.status === "PENDING_AGREEMENT";
  const isWaitlist = course.status === "WAITLIST";

  // Percentage badge color system matching reference
  const getBadgeStyle = (pct: number) => {
    if (pct >= 80) {
      return {
        background: "#dcfce7",
        color: "#15803d",
        border: "1px solid #bbf7d0",
      };
    }
    if (pct > 0) {
      return {
        background: "#fef3c7",
        color: "#92400e",
        border: "1px solid #fde68a",
      };
    }
    return {
      background: "#f1f5f9",
      color: "#64748b",
      border: "1px solid #e2e8f0",
    };
  };

  const badgeStyle = getBadgeStyle(course.progress);

  return (
    <article className={styles.courseCard}>
      {/* 1. 16:9 Cover Image */}
      <div className={styles.courseCoverWrap}>
        <Image
          src={imgError ? "/brand/course-learning.webp" : course.image}
          alt={course.title}
          fill
          priority={isPriority}
          loading={isPriority ? "eager" : "lazy"}
          sizes="(max-width: 480px) 50vw, (max-width: 900px) 50vw, 360px"
          className={styles.courseCoverImg}
          onError={() => setImgError(true)}
        />
        {isPendingAgreement && (
            <span className={styles.agreementBadge}>
              Agreement Required
            </span>
        )}
          </div>

        {/* 2. Card Content Area */}
        <div className={styles.courseCardBody}>
          {/* Title Row: 2-line clamped title, Percentage Pill, 3-dots menu */}
          <div className={styles.courseTitleRow}>
            <h3 className={styles.courseTitle} title={course.title}>
              {course.title}
            </h3>
            <div className={styles.courseHeaderRight}>
            {!isWaitlist && (
                <span className={styles.coursePercentagePill} style={badgeStyle}>
                  {course.progress}%
                </span>
              )}
              <button
                type="button"
                className={styles.courseMenuBtn}
                aria-label={`Options for ${course.title}`}
                title="More options"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="5" r="1.2" />
                  <circle cx="12" cy="12" r="1.2" />
                  <circle cx="12" cy="19" r="1.2" />
                </svg>
              </button>
            </div>
          </div>

              {/* Batch / Subtitle Row */}
              {isWaitlist ? (
                <div className={styles.waitlistSubtitle}>
                  On Waitlist — Next Batch Pending
                </div>
              ) : (
                < div className={styles.courseBatchSubtitle} title={course.batchName || course.title}>
              Batch: {course.batchName || course.title}
            </div>
          )}

            {/* Compact Horizontal Progress Bar */ }
        {!isWaitlist && (
            <div
              className={styles.progressBarTrack}
              role="progressbar"
              aria-valuenow={course.progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${course.title} completion progress`}
            >
              <div
                className={styles.progressBarFill}
                style={{ width: `${Math.min(100, Math.max(0, course.progress))}%` }}
              />
            </div>
          )}

              {/* Completed Lessons Text */}
              {isWaitlist ? (
                <p className={styles.lessonsMetaText}>
                  Enrolling soon in upcoming cohort
                </p>
              ) : (
                <p className={styles.lessonsMetaText}>
                  {course.completedLessons} / {course.totalLessons} lessons completed
                </p>
              )}

                {/* Full-width Compact CTA Button with Play Icon */ }
        {isWaitlist ? (
                <button
                  type="button"
                  disabled
                  className={styles.viewCourseBtnDisabled}
                >
                  <span>On Waitlist</span>
                </button>
              ) : (
                <Link
                  href={course.route}
                  prefetch={false}
                  className={styles.continueLearningBtn}
                >
                  <span className={styles.playIconWrap} aria-hidden="true">
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
                      <circle cx="12" cy="12" r="10" />
                      <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" />
                    </svg>
                  </span>
                  <span className={styles.continueBtnLabel}>
                    {isPendingAgreement ? "Sign Agreement" : "Continue Learning"}
                  </span>
                  <span className={styles.arrowIcon} aria-hidden="true">&rarr;</span>
                </Link>
              )}
            </div>
    </article>
        );
}
