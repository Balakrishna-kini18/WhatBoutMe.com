"use client";

import React from "react";
import Link from "next/link";
import styles from "../../page.module.css";
import LearnerCourseCard, { CourseCardData } from "./LearnerCourseCard";
import DashboardEmptyState from "./DashboardEmptyState";

interface LearnerCoursesSectionProps {
  courses: CourseCardData[];
}

export default function LearnerCoursesSection({
  courses,
}: LearnerCoursesSectionProps) {
  return (
    <section className={styles.yourCoursesContainer} aria-label="Your Courses">
      {/* Header Row */}
      <div className={styles.sectionHeaderRow}>
        <div className={styles.sectionHeaderTitleGroup}>
          <span className={styles.coursesIconBadge} aria-hidden="true">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </span>
          <div>
            <h2 className={styles.sectionTitle}>Your Courses</h2>
            <p className={styles.sectionSubtitle}>Continue where you left off</p>
          </div>
        </div>

        <Link href="/courses" prefetch={false} className={styles.viewAllLink}>
          <span>View All</span>
          <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>

      {/* 2-Column Responsive Grid on Mobile & Desktop */}
      {courses.length > 0 ? (
        <div className={styles.coursesGrid2x2}>
          {courses.map((course, idx) => (
            <LearnerCourseCard
              key={course.key}
              course={course}
              isPriority={idx < 2}
            />
          ))}
        </div>
      ) : (
        <DashboardEmptyState
          title="Start Your First Program"
          description="You are not enrolled in any active courses yet. Explore our certified neuroplasticity and resilience curriculums."
          actionHref="/courses"
          actionText="Explore Courses"
        />
      )}
    </section>
  );
}
