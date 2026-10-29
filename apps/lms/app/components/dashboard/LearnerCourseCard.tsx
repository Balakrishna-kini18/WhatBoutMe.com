"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import styles from "../../page.module.css";

export interface CourseCardData {
  key: string;
  title: string;
  progress: number;
  totalLessons: number;
  completedLessons: number;
  image: string;
  route: string;
  status?: string;
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
        {isPendingAgreement && (
          <span
            style={{
              position: "absolute",
              top: "10px",
              left: "10px",
              background: "rgba(180, 83, 9, 0.92)",
              color: "#ffffff",
              fontSize: "0.72rem",
              fontWeight: 700,
              padding: "4px 10px",
              borderRadius: "9999px",
              backdropFilter: "blur(4px)",
              letterSpacing: "0.03em",
              zIndex: 2,
            }}
          >
            Digital Agreement Required
          </span>
        )}
      </div>

      {/* Card Body */}
      <div className={styles.courseCardBody}>
        <div className={styles.courseTitleRow}>
          <h3 className={styles.courseTitle} title={course.title}>
            {course.title}
          </h3>
          <div className={styles.courseHeaderRight}>
            <span className={styles.coursePercentage}>{course.progress}%</span>
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

        {/* 6px Progress Bar */}
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

        {/* Completed Lessons Metadata */}
        <p className={styles.lessonsMetaText}>
          {course.completedLessons} / {course.totalLessons} lessons completed
        </p>

        {/* Full-width CTA Button */}
        <Link
          href={course.route}
          prefetch={false}
          className={styles.viewCourseBtn}
          style={isPendingAgreement ? { background: "linear-gradient(135deg, #c97a1e 0%, #b45309 100%)" } : undefined}
        >
          <span>{isPendingAgreement ? "Sign Agreement & Begin" : "View Course"}</span>
          <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>
    </article>
  );
}
