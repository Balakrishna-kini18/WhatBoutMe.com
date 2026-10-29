"use client";

import React from "react";
import Link from "next/link";
import styles from "../profile.module.css";

export interface EnrolledCourseItem {
  programId: string;
  programTitle: string;
  batchName?: string;
  status?: string;
  progress?: number;
}

export interface ProfileCoursesCardProps {
  courses: EnrolledCourseItem[];
}

const CAP_COLORS = [
  styles.capThemeOrange,
  styles.capThemePurple,
  styles.capThemeBlue,
  styles.capThemeGreen,
];

export default function ProfileCoursesCard({ courses }: ProfileCoursesCardProps) {
  return (
    <section className={styles.sectionCard} aria-labelledby="my-courses-heading">
      {/* Section Header */}
      <div className={styles.sectionHeaderRow}>
        <div className={styles.sectionTitleGroup}>
          <div className={`${styles.sectionHeaderIcon} ${styles.statThemeOrange}`}>
            <svg
              width="18"
              height="18"
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
          </div>
          <div>
            <h2 id="my-courses-heading" className={styles.sectionCardTitle}>
              My Courses
            </h2>
            <p className={styles.sectionCardSubtitle}>
              Your enrolled courses and progress.
            </p>
          </div>
        </div>
      </div>

      {courses.length === 0 ? (
        <div className={styles.coursesEmptyState}>
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#94a3b8"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
          <p className={styles.coursesEmptyText}>
            You have not enrolled in a course yet.
          </p>
          <Link href="/courses" className={styles.browseCoursesBtn}>
            Explore Courses
          </Link>
        </div>
      ) : (
        <ul className={styles.profileCourseList}>
          {courses.map((c, idx) => {
            const progressVal = Math.min(100, Math.max(0, c.progress ?? 0));
            const colorClass = CAP_COLORS[idx % CAP_COLORS.length];

            return (
              <li key={c.programId} className={styles.profileCourseItem}>
                <div className={styles.profileCourseMain}>
                  {/* Graduation Cap Icon Container */}
                  <div className={`${styles.courseCapWrap} ${colorClass}`}>
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                      <path d="M6 12v5c3 3 9 3 12 0v-5" />
                    </svg>
                  </div>

                  {/* Course Title and Progress Track */}
                  <div className={styles.courseDetailsWrap}>
                    <h3 className={styles.profileCourseTitle}>{c.programTitle}</h3>
                    <div className={styles.progressBarWrap}>
                      <div className={styles.progressTrack}>
                        <div
                          className={styles.progressFill}
                          style={{ width: `${progressVal}%` }}
                        />
                      </div>
                      <span className={styles.progressPercentText}>{progressVal}%</span>
                    </div>
                  </div>
                </div>

                {/* Open Course Button */}
                <Link
                  href={`/programs/${c.programId}/steps`}
                  className={styles.openCourseBtn}
                  aria-label={`Open ${c.programTitle}`}
                >
                  <span>Open</span>
                  <span aria-hidden="true">&rarr;</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
