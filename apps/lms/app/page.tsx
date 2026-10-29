"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";
import DashboardSkeleton from "./components/dashboard/DashboardSkeleton";
import LearnerHeroSection from "./components/dashboard/LearnerHeroSection";
import LearnerCoursesSection from "./components/dashboard/LearnerCoursesSection";
import LearnerProgressSummary from "./components/dashboard/LearnerProgressSummary";
import LearnerAttendanceSummary from "./components/dashboard/LearnerAttendanceSummary";
import LearnerCertificates, {
  CertificateData,
} from "./components/dashboard/LearnerCertificates";
import { API_URL, renewOnce } from "./lib/api";

interface EnrolledProgram {
  enrolmentId: string;
  batchId: string;
  batchName: string;
  programId: string;
  programTitle: string;
  status: string;
  progress: number;
  totalItems?: number;
  completedItems?: number;
}

interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  enrolledPrograms: EnrolledProgram[];
  upcomingSessions: any[];
}

export default function LearnerDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [certificates, setCertificates] = useState<CertificateData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [attendanceSummary, setAttendanceSummary] = useState<{
    totalScheduledSessions: number;
    totalAttendedSessions: number;
    overallAttendancePercentage: number;
    history: any[];
  } | null>(null);

  const loadDashboard = useCallback(
    async (isInitial = false) => {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/login");
        return;
      }

      if (isInitial) {
        setLoading(true);
      }

      let currentToken = token;
      let authHeaders = { Authorization: `Bearer ${currentToken}` };

      try {
        let res = await fetch(`${API_URL}/auth/me`, {
          headers: authHeaders,
        });

        if (res.status === 401) {
          const refreshToken = localStorage.getItem("refresh_token");
          if (refreshToken) {
            const renewed = await renewOnce(fetch, currentToken);
            if (renewed && renewed !== "signed-out") {
              currentToken = renewed;
              authHeaders = { Authorization: `Bearer ${renewed}` };
              const retryRes = await fetch(`${API_URL}/auth/me`, {
                headers: authHeaders,
              });
              if (retryRes.ok) {
                res = retryRes;
              } else if (retryRes.status === 401) {
                localStorage.removeItem("token");
                localStorage.removeItem("refresh_token");
                router.push("/login");
                return;
              }
            } else if (renewed === null) {
              if (isInitial) setLoadError(true);
              return;
            } else {
              localStorage.removeItem("token");
              localStorage.removeItem("refresh_token");
              router.push("/login");
              return;
            }
          } else {
            localStorage.removeItem("token");
            router.push("/login");
            return;
          }
        }

        if (!res.ok) {
          if (isInitial) setLoadError(true);
          return;
        }

        const profile: UserProfile = await res.json();
        setUser(profile);

        // Fetch attendance summary and certificates concurrently
        const attendancePromise = fetch(`${API_URL}/me/attendance`, {
          headers: authHeaders,
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);

        const certificatesPromise = fetch(`${API_URL}/certificates/mine`, {
          headers: authHeaders,
        })
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => []);

        const [attData, certs] = await Promise.all([
          attendancePromise,
          certificatesPromise,
        ]);

        if (attData) setAttendanceSummary(attData);
        setCertificates(certs || []);
      } catch {
        if (isInitial) setLoadError(true);
      } finally {
        if (isInitial) setLoading(false);
      }
    },
    [router]
  );

  useEffect(() => {
    loadDashboard(true);

    const onFocus = () => {
      loadDashboard(false);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        loadDashboard(false);
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadDashboard]);

  // SKELETON PLACEHOLDER DURING INITIAL LOAD
  if (loading) {
    return <DashboardSkeleton />;
  }

  // ERROR RECOVERY VIEW
  if (loadError) {
    return (
      <div className={styles.dashboard}>
        <div
          style={{
            textAlign: "center",
            padding: "60px 20px",
            background: "#ffffff",
            borderRadius: 16,
            border: "1px solid #ece6dd",
          }}
        >
          <h2
            style={{
              fontSize: "1.35rem",
              fontWeight: 700,
              color: "#18181b",
              margin: "0 0 8px",
            }}
          >
            We couldn&apos;t load your dashboard
          </h2>
          <p style={{ color: "#64748b", margin: "0 0 20px" }}>
            You are still signed in. Please refresh to load your learning
            metrics.
          </p>
          <button
            type="button"
            className={styles.continueCourseBtn}
            style={{ width: "auto", display: "inline-flex", padding: "0 24px" }}
            onClick={() => window.location.reload()}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ENROLLED COURSES
  const enrolled = user?.enrolledPrograms || [];
  const activeCount = enrolled.length;

  const courseImages = [
    "/brand/course-celebrate.webp",
    "/brand/course-learning.webp",
    "/brand/session.webp",
    "/brand/course-photo.webp",
  ];

  const lessonTotalPresets = [42, 28, 18, 24];

  const displayCourses = enrolled.map((p, idx) => {
    const progressVal = typeof p.progress === "number" ? p.progress : 0;
    const hasRealItems = typeof p.totalItems === "number" && p.totalItems > 0;
    const totalLessons = hasRealItems
      ? p.totalItems!
      : lessonTotalPresets[idx % lessonTotalPresets.length] || 20;
    const completedLessons = hasRealItems && typeof p.completedItems === "number"
      ? Math.min(totalLessons, Math.max(0, p.completedItems))
      : Math.min(
          totalLessons,
          Math.max(0, Math.round((progressVal / 100) * totalLessons))
        );

    return {
      key: p.enrolmentId || `course-${p.programId || idx}`,
      title: p.programTitle || p.batchName || "Certified Resilience Program",
      progress: progressVal,
      totalLessons,
      completedLessons,
      image:
        courseImages[idx % courseImages.length] || "/brand/course-learning.webp",
      route: `/programs/${p.programId}/steps`,
    };
  });

  // PROGRESS CALCULATIONS FOR THE TWO DONUTS
  const totalCourses = enrolled.length;
  const completedCourses = enrolled.filter((p) => p.progress === 100).length;
  const overallPct =
    enrolled.length > 0
      ? Math.round(
          enrolled.reduce((sum, p) => sum + (p.progress || 0), 0) /
            enrolled.length
        )
      : 0;

  const attendancePct = attendanceSummary?.overallAttendancePercentage ?? 0;
  const attendedSessions = attendanceSummary?.totalAttendedSessions ?? 0;
  const totalSessions = attendanceSummary?.totalScheduledSessions ?? 0;

  return (
    <div className={styles.dashboard}>
      {/* 1. TOP HERO / GREETING BANNER WITH 3D ART & FLOATING QUOTE (Star of the Page) */}
      <LearnerHeroSection
        name={user?.name || (user?.email ? user.email.split("@")[0] || "Learner" : "Learner")}
        activeCoursesCount={activeCount}
        quoteText="Small steps every day lead to big results."
      />

      {/* 2. MAIN 2-COLUMN DASHBOARD GRID */}
      <div className={styles.dashboardGrid}>
        {/* LEFT COLUMN: YOUR COURSES CONTAINER */}
        <LearnerCoursesSection courses={displayCourses} />

        {/* RIGHT COLUMN: PROGRESS & CERTIFICATES */}
        <aside className={styles.rightStack} aria-label="Progress & Certificates">
          {/* Card 1: Your Progress */}
          <section
            className={styles.yourProgressCard}
            aria-labelledby="your-progress-heading"
          >
            <div className={styles.cardHeaderWithIcon}>
              <span className={styles.cardHeaderIcon} aria-hidden="true">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#ea580c"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                  <polyline points="17 6 23 6 23 12" />
                </svg>
              </span>
              <h2 id="your-progress-heading" className={styles.cardHeaderTitle}>
                Your Progress
              </h2>
            </div>

            <div className={styles.donutsGrid}>
              <LearnerProgressSummary
                percentage={overallPct}
                completedCourses={completedCourses}
                totalCourses={totalCourses}
              />
              <LearnerAttendanceSummary
                percentage={attendancePct}
                attendedSessions={attendedSessions}
                totalSessions={totalSessions}
              />
            </div>
          </section>

          {/* Card 2: Certificates */}
          <LearnerCertificates certificates={certificates} />
        </aside>
      </div>
    </div>
  );
}
