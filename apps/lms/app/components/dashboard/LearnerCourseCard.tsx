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

  return (
    <article className={styles.courseCard}>
      {/* 16:9 Cover Image */}
      <div className={styles.courseCoverWrap}>
        <Image
          src={imgError ? "/brand/course-learning.webp" : course.image}
          alt={course.title}
          fill
          priority={isPriority}
          loading={isPriority ? "eager" : "lazy"}
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 380px"
          className={styles.courseCoverImg}
          onError={() => setImgError(true)}
        />
      </div>

      {/* Card Body */}
      <div className={styles.courseCardBody}>
        <div className={styles.courseTitleRow}>
          <h3 className={styles.courseTitle} title={course.title}>
            {course.title}
          </h3>
          <div className={styles.courseHeaderRight}>
            {course.status !== "WAITLIST" && (
              <span className={styles.coursePercentage}>{course.progress}%</span>
            )}
            <button
              type="button"
              className={styles.courseMenuBtn}
              aria-label={`Options for ${course.title}`}
              title="More options"
            >
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
                <circle cx="12" cy="5" r="1.2" />
                <circle cx="12" cy="12" r="1.2" />
                <circle cx="12" cy="19" r="1.2" />
              </svg>
            </button>
          </div>
        </div>

        {/* Cohort / Batch Name or Waitlist Status Badge */}
        {course.status === "WAITLIST" ? (
          <div style={{ margin: "4px 0 8px" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "3px 10px",
                borderRadius: "100px",
                fontSize: "0.74rem",
                fontWeight: 700,
                background: "#fef3c7",
                color: "#92400e",
                border: "1px solid #fde68a",
              }}
            >
              ⏳ On Waitlist — Next Batch Pending
            </span>
          </div>
        ) : (
          course.batchName && (
            <div style={{ fontSize: "0.75rem", color: "var(--accent-primary, #c97a1e)", fontWeight: 600, margin: "2px 0 6px" }}>
              Batch: {course.batchName}
            </div>
          )
        )}

        {/* 6px Progress Bar */}
        {course.status !== "WAITLIST" && (
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

        {/* Completed Lessons Metadata or Waitlist Notice */}
        {course.status === "WAITLIST" ? (
          <p className={styles.lessonsMetaText} style={{ color: "var(--text-muted)", fontSize: "0.78rem", lineHeight: "1.4" }}>
            You are queued for the next batch. You will be automatically enrolled as soon as a new batch opens or a seat is released.
          </p>
        ) : (
          <p className={styles.lessonsMetaText}>
            {course.completedLessons} / {course.totalLessons} lessons completed
          </p>
        )}

        {/* Full-width CTA Button */}
        {course.status === "WAITLIST" ? (
          <button
            type="button"
            disabled
            className={styles.viewCourseBtn}
            style={{
              background: "#f3f4f6",
              color: "#9ca3af",
              borderColor: "#e5e7eb",
              cursor: "not-allowed",
            }}
          >
            <span>On Waitlist (Pending Batch)</span>
          </button>
        ) : (
          <Link href={course.route} className={styles.viewCourseBtn}>
            <span>View Course</span>
            <span aria-hidden="true">&rarr;</span>
          </Link>
        )}
      </div>
    </article>
  );
}
