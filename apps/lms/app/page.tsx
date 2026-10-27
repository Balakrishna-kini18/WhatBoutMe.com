"use client";

import styles from "./page.module.css";
import DashboardLoading from "./loading";
import Image from "next/image";
import Link from "next/link";
import { SITE_URL } from "./lib/site";
import { API_URL, renewOnce } from "./lib/api";
import { courseImageFor } from "./lib/courseImage";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface EnrolledProgram {
  enrolmentId: string;
  batchId: string;
  batchName: string;
  programId: string;
  programTitle: string;
  status: string;
  progress: number;
}

interface Session {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  joinUrl: string | null;
  recordingUrl: string | null;
  quizId: string | null;
}

interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  enrolledPrograms: EnrolledProgram[];
  upcomingSessions: Session[];
}

export default function LearnerDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [certificates, setCertificates] = useState<any[]>([]);
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
              // Server unreachable or transient network failure: do NOT sign out!
              if (isInitial) setLoadError(true);
              return;
            } else {
              // Definitively signed out
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
        const attendancePromise = fetch(`${API_URL}/me/attendance`, { headers: authHeaders })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
        const certificatesPromise = fetch(`${API_URL}/certificates/mine`, { headers: authHeaders })
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

  // SKELETON PLACEHOLDER DURING INITIAL LOAD (Apple HIG Standard)
  if (loading) {
    return <DashboardLoading />;
  }

  // ERROR RECOVERY VIEW
  if (loadError) {
    return (
      <div className={styles.dashboard}>
        <div style={{ textAlign: "center", padding: "60px 20px", background: "#ffffff", borderRadius: 16, border: "1px solid #ece6dd" }}>
          <h2 style={{ fontSize: "1.35rem", fontWeight: 700, color: "#18181b", margin: "0 0 8px" }}>
            We couldn&apos;t load your dashboard
          </h2>
          <p style={{ color: "#64748b", margin: "0 0 20px" }}>You are still signed in. Please refresh to load your learning metrics.</p>
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

  // GREETING DATA
  const firstName = user?.name ? user.name.split(" ")[0] : "Learner";
  const hour = new Date().getHours();
  const greetingText = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";

  // ENROLLED COURSES: Ground truth data only
  const enrolled = user?.enrolledPrograms || [];
  const activeCount = enrolled.length;

  const courseImages = [
    "/brand/course-celebrate.webp",
    "/brand/course-learning.webp",
    "/brand/session.webp",
    "/brand/course-photo.webp",
  ];

  const displayCourses = enrolled.map((p, idx) => ({
    key: p.enrolmentId || `course-${p.programId || idx}`,
    title: p.programTitle || "Certified Resilience Program",
    progress: typeof p.progress === "number" ? p.progress : 0,
    image: courseImages[idx % courseImages.length] || "/brand/course-learning.webp",
    route: `/programs/${p.programId}/steps`,
  }));

  // PROGRESS CALCULATIONS FOR THE TWO DONUTS (Apple Activity Rings)
  const totalCourses = enrolled.length;
  const completedCourses = enrolled.filter((p) => p.progress === 100).length;
  const overallPct = enrolled.length > 0
    ? Math.round(enrolled.reduce((sum, p) => sum + (p.progress || 0), 0) / enrolled.length)
    : 0;

  const attendancePct = attendanceSummary?.overallAttendancePercentage ?? 0;
  const attendedSessions = attendanceSummary?.totalAttendedSessions ?? 0;
  const totalSessions = attendanceSummary?.totalScheduledSessions ?? 0;

  // SVG Circle Geometry for 116px Donut: radius 48, strokeWidth 10
  const CIRCLE_RADIUS = 48;
  const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS; // ~301.59px
  const overallOffset = CIRCLE_CIRCUMFERENCE - (CIRCLE_CIRCUMFERENCE * Math.min(100, Math.max(0, overallPct))) / 100;
  const attendanceOffset = CIRCLE_CIRCUMFERENCE - (CIRCLE_CIRCUMFERENCE * Math.min(100, Math.max(0, attendancePct))) / 100;

  const greetingSubtitle = activeCount > 0
    ? `You have ${activeCount} active ${activeCount === 1 ? "course" : "courses"} in progress — rewiring your brain for sustainable action.`
    : "Welcome to your personal resilience workspace. Explore certified programs to begin.";

  return (
    <div className={styles.dashboard}>
      {/* 1. TOP GREETING BAR */}
      <section className={styles.topGreetingBar} aria-label="Welcome greeting">
        <div className={styles.greetingLeft}>
          <div className={styles.sunIconWrap} aria-hidden="true" style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--accent-primary-tint, rgba(201, 122, 30, 0.12))", color: "var(--accent-primary, #c97a1e)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"></circle>
              <line x1="12" y1="1" x2="12" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="23"></line>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
              <line x1="1" y1="12" x2="3" y2="12"></line>
              <line x1="21" y1="12" x2="23" y2="12"></line>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
          </div>
          <div>
            <h1 className={styles.greetingTitle}>
              {greetingText}, {firstName}
            </h1>
            <p className={styles.greetingSubtitle}>
              {greetingSubtitle}
            </p>
          </div>
        </div>
      </section>

      {/* 2. MAIN DASHBOARD 2-COLUMN GRID (65% Left / 35% Right) */}
      <div className={styles.dashboardGrid}>
        {/* LEFT COLUMN: YOUR COURSES CONTAINER */}
        <section className={styles.yourCoursesContainer} aria-label="Your Courses">
          <div className={styles.sectionHeaderRow}>
            <h2 className={styles.sectionTitle}>Your Courses</h2>
            <Link href="/courses" className={styles.viewAllLink}>
              <span>View All</span>
              <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>

          {/* 2x2 Course Cards Grid or Empty Discovery State */}
          {displayCourses.length > 0 ? (
            <div className={styles.coursesGrid2x2}>
              {displayCourses.map((course) => {
                const isCompleted = course.progress === 100;

                return (
                  <article key={course.key} className={styles.courseCard}>
                    {/* 16:9 Cover Image */}
                    <div className={styles.courseCoverWrap}>
                      <Image
                        src={course.image}
                        alt={course.title}
                        fill
                        sizes="(max-width: 768px) 100vw, 360px"
                        className={styles.courseCoverImg}
                      />
                    </div>

                    {/* Card Body */}
                    <div className={styles.courseCardBody}>
                      <div className={styles.courseTitleRow}>
                        <h3 className={styles.courseTitle} title={course.title}>
                          {course.title}
                        </h3>
                        <span className={styles.coursePercentage}>
                          {course.progress}%
                        </span>
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

                      {/* CTA Button */}
                      {isCompleted ? (
                        <Link href={course.route} className={styles.viewCourseBtn}>
                          <span>View Course</span>
                          <span aria-hidden="true">&rarr;</span>
                        </Link>
                      ) : (
                        <Link href={course.route} className={styles.continueCourseBtn}>
                          <span>Continue Course</span>
                          <span aria-hidden="true">&rarr;</span>
                        </Link>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "48px 20px" }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--accent-primary-tint, rgba(201, 122, 30, 0.12))", color: "var(--accent-primary, #c97a1e)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
                </svg>
              </div>
              <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: "0 0 6px", color: "var(--text-primary)" }}>
                Start Your First Program
              </h3>
              <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", margin: "0 0 18px", maxWidth: 360, marginLeft: "auto", marginRight: "auto" }}>
                You have not enrolled in a course yet. Explore our certified neuroplasticity and resilience curriculums.
              </p>
              <Link href="/courses" className={styles.continueCourseBtn} style={{ width: "auto", display: "inline-flex", padding: "0 20px" }}>
                Explore Courses &rarr;
              </Link>
            </div>
          )}
        </section>

        {/* RIGHT COLUMN: YOUR PROGRESS & CERTIFICATES CARDS */}
        <aside className={styles.rightStack} aria-label="Progress & Certificates Overview">
          {/* Card 1: Your Progress (Keep ONLY two donuts in single card) */}
          <section className={styles.yourProgressCard} aria-labelledby="your-progress-heading">
            <h2 id="your-progress-heading" className={styles.sectionTitle}>
              Your Progress
            </h2>

            <div className={styles.donutsGrid}>
              {/* Donut 1: Overall Progress */}
              <div className={`${styles.donutCol} ${styles.donutDivider}`}>
                <div className={styles.donutRingWrap}>
                  <svg
                    className={styles.donutSvg}
                    viewBox="0 0 120 120"
                    role="img"
                    aria-label={`Overall progress ${overallPct}%`}
                  >
                    <circle
                      className={styles.donutTrack}
                      cx="60"
                      cy="60"
                      r={CIRCLE_RADIUS}
                      fill="none"
                      strokeWidth="10"
                    />
                    <circle
                      className={styles.donutFill}
                      cx="60"
                      cy="60"
                      r={CIRCLE_RADIUS}
                      fill="none"
                      strokeWidth="10"
                      strokeDasharray={CIRCLE_CIRCUMFERENCE}
                      strokeDashoffset={overallOffset}
                    />
                  </svg>
                  <span className={styles.donutCenterValue}>
                    {overallPct}%
                  </span>
                </div>
                <h3 className={styles.donutTitle}>Overall Progress</h3>
                <p className={styles.donutSubtitle}>
                  {completedCourses} of {totalCourses} courses completed
                </p>
              </div>

              {/* Donut 2: Attendance */}
              <div className={styles.donutCol}>
                <div className={styles.donutRingWrap}>
                  <svg
                    className={styles.donutSvg}
                    viewBox="0 0 120 120"
                    role="img"
                    aria-label={`Attendance rate ${attendancePct}%`}
                  >
                    <circle
                      className={styles.donutTrack}
                      cx="60"
                      cy="60"
                      r={CIRCLE_RADIUS}
                      fill="none"
                      strokeWidth="10"
                    />
                    <circle
                      className={styles.donutFill}
                      cx="60"
                      cy="60"
                      r={CIRCLE_RADIUS}
                      fill="none"
                      strokeWidth="10"
                      strokeDasharray={CIRCLE_CIRCUMFERENCE}
                      strokeDashoffset={attendanceOffset}
                    />
                  </svg>
                  <span className={styles.donutCenterValue}>
                    {attendancePct}%
                  </span>
                </div>
                <h3 className={styles.donutTitle}>Attendance</h3>
                <p className={styles.donutSubtitle}>
                  {attendedSessions} of {totalSessions} live sessions completed
                </p>
              </div>
            </div>
          </section>

          {/* Card 2: Certificates */}
          <section className={styles.certificatesCard} aria-labelledby="certificates-heading">
            <div className={styles.sectionHeaderRow} style={{ marginBottom: "16px" }}>
              <h2 id="certificates-heading" className={styles.sectionTitle}>
                Certificates
              </h2>
              <Link href="/certificates" className={styles.viewAllLink}>
                <span>View All</span>
                <span aria-hidden="true">&rarr;</span>
              </Link>
            </div>

            {certificates.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {certificates.slice(0, 2).map((cert: any) => (
                  <div
                    key={cert.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 12px",
                      borderRadius: "10px",
                      background: "#faf7f2",
                      border: "1px solid #ece6dd",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#18181b" }}>
                        {cert.program?.title || "Certificate of Completion"}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                        Issued on {new Date(cert.issuedAt || cert.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <Link
                      href={`/certificates/${cert.id}`}
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        color: "#d36b00",
                        textDecoration: "none",
                      }}
                    >
                      View &rarr;
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              /* Empty State matching exact design */
              <div className={styles.certificatesEmptyState}>
                <svg
                  className={styles.certRibbonIcon}
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="8" r="6" />
                  <path d="M15.4 13.8L18 22l-6-3-6 3 2.6-8.2" />
                </svg>
                <h3 className={styles.certEmptyTitle}>No certificates yet</h3>
                <p className={styles.certEmptySub}>
                  Complete course requirements to earn your certificate.
                </p>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
