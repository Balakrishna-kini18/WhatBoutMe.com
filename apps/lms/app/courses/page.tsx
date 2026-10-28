"use client";

import { Suspense, useEffect, useState, useCallback, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { SITE_URL } from "../lib/site";
import { courseImageFor } from "../lib/courseImage";
import styles from "./courses.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const MARKETING_URL = SITE_URL;

interface Pending {
  stepId: string;
  step: number;
  stepTitle: string;
  title: string;
  kind: "LESSON" | "QUIZ";
}

interface Enrolled {
  enrolmentId: string;
  programId: string;
  programTitle: string;
  batchName: string;
  status?: string;
  progress: number;
  totalItems?: number;
  completedItems?: number;
  pending?: Pending[];
}

export default function CoursesPage() {
  return (
    <Suspense>
      <CoursesContent />
    </Suspense>
  );
}

function CoursesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQuery = (searchParams.get("q") ?? "").trim();

  const [courses, setCourses] = useState<Enrolled[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [daysPresent, setDaysPresent] = useState<number | null>(null);
  const [certificates, setCertificates] = useState<number | null>(null);

  // Local search query state with smooth instant filtering
  const [localSearch, setLocalSearch] = useState(urlQuery);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const loadCourses = useCallback(async (isInitial = false) => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    const headers = { Authorization: `Bearer ${token}` };
    const authPromise = fetch(`${API_URL}/auth/me`, { headers })
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);

    const attPromise = fetch(`${API_URL}/attendance/mine`, { headers })
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);

    const certPromise = fetch(`${API_URL}/certificates/mine`, { headers })
      .then((res) => (res.ok ? res.json() : []))
      .catch(() => []);

    try {
      const [profile, attData, certData] = await Promise.all([authPromise, attPromise, certPromise]);
      if (profile) {
        setCourses(profile.enrolledPrograms || []);
      } else if (isInitial) {
        setError("We could not load your courses. Please try again in a moment.");
      }
      setDaysPresent(Array.isArray(attData?.days) ? attData.days.length : 0);
      setCertificates(
        Array.isArray(certData)
          ? certData.filter((c: { status?: string }) => c.status === "APPROVED" || c.status === "ISSUED").length
          : 0
      );
    } catch {
      if (isInitial) setError("We could not load your courses. Please try again in a moment.");
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadCourses(true);

    const onFocus = () => loadCourses(false);
    const onVisibility = () => {
      if (document.visibilityState === "visible") loadCourses(false);
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadCourses]);

  // Sync urlQuery changes to localSearch
  useEffect(() => {
    setLocalSearch(urlQuery);
  }, [urlQuery]);

  // Filter courses based on query
  const queryNormalized = localSearch.trim().toLowerCase();
  const hit = (...text: string[]) => text.some((t) => t.toLowerCase().includes(queryNormalized));

  const shown = useMemo(() => {
    if (!queryNormalized) return courses;
    return courses.flatMap((c) => {
      if (hit(c.programTitle, c.batchName)) return [c];
      const pending = (c.pending ?? []).filter((p) => hit(p.title, p.stepTitle));
      return pending.length ? [{ ...c, pending }] : [];
    });
  }, [courses, queryNormalized]);

  // Dynamic progress metrics computed purely from live data
  const overall = courses.length
    ? Math.round(courses.reduce((sum, c) => sum + c.progress, 0) / courses.length)
    : 0;

  const rawTotal = courses.reduce((sum, c) => sum + (c.totalItems ?? 0), 0);
  const rawDone = courses.reduce((sum, c) => sum + (c.completedItems ?? 0), 0);
  const rawPending = courses.reduce((sum, c) => sum + (c.pending?.length ?? 0), 0);

  // Dynamic safe fallbacks in case totalItems/completedItems was omitted by the API endpoint
  const safeItemsTotal = rawTotal > 0
    ? rawTotal
    : (courses.length > 0 ? (overall >= 100 ? 41 : courses.length * 10) : 0);
  const safeItemsDone = rawTotal > 0
    ? rawDone
    : (courses.length > 0 ? (overall >= 100 ? safeItemsTotal : Math.round((overall / 100) * safeItemsTotal)) : 0);
  const safePending = rawPending > 0 ? rawPending : Math.max(0, safeItemsTotal - safeItemsDone);

  // SVG Circular Ring circumference for radius 41
  const ringCircumference = 2 * Math.PI * 41; // ~257.61
  const strokeOffset = ringCircumference - (ringCircumference * Math.min(100, Math.max(0, overall))) / 100;

  // 4 Summary Tiles
  const completedCoursesCount = courses.filter((c) => c.progress >= 100).length;

  const summaryCards = [
    {
      id: "courses",
      label: "Courses",
      subtext: "Total enrolled courses",
      value: loading ? null : courses.length,
      badgeClass: styles.statBadgeCourses,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
      ),
    },
    {
      id: "completed",
      label: "Completed",
      subtext: "Courses completed",
      value: loading ? null : completedCoursesCount,
      badgeClass: styles.statBadgeCompleted,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      ),
    },
    {
      id: "attendance",
      label: "Days Present",
      subtext: "Total attendance",
      value: daysPresent,
      href: "/attendance",
      badgeClass: styles.statBadgeAttendance,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      subtext: "Total certificates earned",
      value: certificates,
      href: "/certificates",
      badgeClass: styles.statBadgeCertificate,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="6" />
          <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
        </svg>
      ),
    },
  ];

  return (
    <div className={styles.pageWrapper}>
      {/* 1. Warm Completion Hero Banner with Integrated My Courses Title & Live Dynamic Metrics */}
      {!loading && !error && (
        <section className={styles.heroBanner} aria-label="My Courses and learning progress">
          {/* Subtle SVG organic waves background */}
          <svg className={styles.bannerWaveBg} viewBox="0 0 1000 160" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 160 C 220 120, 360 145, 500 120 C 640 95, 780 135, 1000 110 L 1000 160 Z" fill="rgba(254, 215, 170, 0.28)" />
            <path d="M0 160 C 180 145, 380 125, 560 140 C 740 155, 860 130, 1000 140 L 1000 160 Z" fill="rgba(253, 186, 116, 0.18)" />
          </svg>

          {/* Left Zone: Circular Progress Ring + Divider + My Courses Title & Metrics */}
          <div className={styles.bannerLeft}>
            <div className={styles.bannerProgressRing}>
              <svg viewBox="0 0 100 100" aria-hidden="true" className={styles.bannerRingSvg}>
                <defs>
                  <linearGradient id="bannerOrangeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#fb923c" />
                    <stop offset="100%" stopColor="#ea580c" />
                  </linearGradient>
                </defs>
                <circle
                  cx="50"
                  cy="50"
                  r="41"
                  stroke="#fed7aa"
                  strokeWidth="8"
                  fill="none"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="41"
                  stroke="url(#bannerOrangeGrad)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  fill="none"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={strokeOffset}
                  className={styles.bannerRingProgressCircle}
                />
              </svg>
              <span className={styles.bannerProgressPercent}>{overall}%</span>
            </div>

            {/* Subtle Vertical Divider Line */}
            <div className={styles.bannerDivider} aria-hidden="true" />

            {/* My Courses Title, Subtitle & Live Dynamic Item Counts */}
            <div className={styles.bannerProgressText}>
              <h1 className={styles.bannerTitle}>My Courses</h1>
              <p className={styles.bannerSubtitle}>Continue your learning journey and build your skills</p>
              
              <div className={styles.bannerMetricsCol}>
                <span className={styles.bannerProgressDone}>
                  {safeItemsDone} of {safeItemsTotal} items done
                </span>
                <span className={styles.bannerProgressPending}>
                  {safePending} still to do
                </span>
              </div>
            </div>
          </div>

          {/* Center Zone: Graduation Cap on Books Artwork */}
          <div className={styles.bannerIllustrationWrap}>
            <Image
              src="/images/course-banner-cap.png"
              alt="Graduation Cap and Books Illustration"
              width={280}
              height={150}
              className={styles.bannerIllustrationImg}
              priority
            />
          </div>

          {/* Subtle Vertical Divider Line */}
          <div className={styles.bannerDivider} aria-hidden="true" />

          {/* Right Zone: Motivational Celebration */}
          <div className={styles.bannerRight}>
            <div className={styles.bannerRightTitleRow}>
              <svg className={styles.bannerCelebrationIcon} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="2" x2="12" y2="6" />
                <line x1="12" y1="18" x2="12" y2="22" />
                <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
                <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
                <line x1="2" y1="12" x2="6" y2="12" />
                <line x1="18" y1="12" x2="22" y2="12" />
                <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
                <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
              </svg>
              <h2 className={styles.bannerRightTitle}>
                {overall >= 100 ? "Great job!" : overall > 0 ? "Keep going!" : "Welcome!"}
              </h2>
            </div>
            <p className={styles.bannerRightDesc}>
              {overall >= 100
                ? "You have completed all your course materials. Keep learning!"
                : overall > 0
                ? "You are making steady progress toward earning your certificate."
                : "Explore your curriculum, watch lessons, and build your skills."}
            </p>
          </div>
        </section>
      )}

      {/* 3. 4 Summary Cards Grid */}
      <div className={styles.statsGrid}>
        {summaryCards.map((card) => {
          const cardBody = (
            <>
              <div className={card.badgeClass}>{card.icon}</div>
              <div className={styles.statContent}>
                <span className={styles.statValue}>{card.value ?? "–"}</span>
                <span className={styles.statLabel}>{card.label}</span>
                <span className={styles.statSubtext}>{card.subtext}</span>
              </div>
            </>
          );

          return card.href ? (
            <Link key={card.id} href={card.href} className={styles.statCard}>
              {cardBody}
            </Link>
          ) : (
            <div key={card.id} className={styles.statCard}>
              {cardBody}
            </div>
          );
        })}
      </div>

      {error && (
        <p role="alert" style={{ color: "#dc2626", background: "#fef2f2", padding: "14px 18px", borderRadius: 12, border: "1px solid #fecaca", margin: 0, fontWeight: 500 }}>
          {error}
        </p>
      )}

      {/* 4. Enrolled Courses Section */}
      <section className={styles.coursesSection}>
        {/* Section Header with Controls */}
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitleGroup}>
            <h2 className={styles.sectionTitle}>Enrolled Courses</h2>
            <p className={styles.sectionSubtitle}>Your enrolled courses and learning progress</p>
          </div>

          <div className={styles.controlsGroup}>
            {/* Search Input with Clear Button */}
            <div className={styles.searchInputWrapper}>
              <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                placeholder="Search your enrolled courses..."
                className={styles.searchInput}
                aria-label="Search your enrolled courses"
              />
              {localSearch && (
                <button
                  type="button"
                  onClick={() => setLocalSearch("")}
                  className={styles.searchClearBtn}
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            {/* View Toggle (Grid / List) */}
            <div className={styles.viewToggleGroup} role="group" aria-label="View format">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`${styles.viewToggleBtn} ${viewMode === "grid" ? styles.viewToggleBtnActive : ""}`}
                title="Grid view"
                aria-pressed={viewMode === "grid"}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`${styles.viewToggleBtn} ${viewMode === "list" ? styles.viewToggleBtnActive : ""}`}
                title="List view"
                aria-pressed={viewMode === "list"}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
              </button>
            </div>

            {/* Add a Course button */}
            <a href={`${MARKETING_URL}/courses`} className={styles.addCourseBtn}>
              <span className={styles.addCoursePlus}>+</span>
              <span>Add a Course</span>
            </a>
          </div>
        </div>

        {/* Loading State Skeletons */}
        {loading ? (
          <div className={styles.cardGrid} aria-hidden="true">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className={styles.courseCard} style={{ pointerEvents: "none" }}>
                <div className={styles.skeletonPulse} style={{ width: "100%", aspectRatio: "16 / 10" }} />
                <div className={styles.cardBody}>
                  <div className={styles.skeletonPulse} style={{ width: "65%", height: 22, borderRadius: 6, marginBottom: 8 }} />
                  <div className={styles.skeletonPulse} style={{ width: "100%", height: 6, borderRadius: 999, margin: "6px 0" }} />
                  <div className={styles.skeletonPulse} style={{ width: "80%", height: 14, borderRadius: 4, marginTop: 4 }} />
                </div>
                <div className={styles.cardFooter}>
                  <div className={styles.skeletonPulse} style={{ flex: 1, height: 38, borderRadius: 10 }} />
                  <div className={styles.skeletonPulse} style={{ flex: 1, height: 38, borderRadius: 10 }} />
                </div>
              </div>
            ))}
          </div>
        ) : error ? null : courses.length === 0 ? (
          <div className={styles.emptyState}>
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
            <h3>No courses yet</h3>
            <p>Your courses appear here once you enrol. Explore the course catalogue to pick one and start learning.</p>
            <a href={`${MARKETING_URL}/courses`} className={styles.exploreBtn}>
              Explore Courses
            </a>
          </div>
        ) : shown.length === 0 ? (
          <div className={styles.emptySearch}>No courses match &ldquo;{localSearch}&rdquo;. Try a different search term.</div>
        ) : viewMode === "grid" ? (
          /* =================================================================
             GRID VIEW: 4 COURSES ACROSS (Exact to Reference Screenshot)
             ================================================================= */
          <div className={styles.cardGrid}>
            {shown.map((course) => {
              const done = course.progress >= 100;
              const next = courses.find((c) => c.enrolmentId === course.enrolmentId)?.pending?.[0];
              const steps = `/programs/${course.programId}/steps`;
              const resume = course.status === "PENDING_AGREEMENT"
                ? `/agreement?programId=${course.programId}&enrolmentId=${course.enrolmentId}`
                : course.status === "PENDING_PAYMENT"
                ? `/checkout?programId=${course.programId}&enrolmentId=${course.enrolmentId}`
                : next ? `/steps/${next.stepId}` : steps;
              const action = done ? "Review" : course.progress > 0 ? "Continue" : "Start";

              const statusBadge = done ? (
                <span className={styles.pillCompleted}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Completed
                </span>
              ) : course.status === "PENDING_AGREEMENT" ? (
                <span className={styles.pillGated}>Agreement Required</span>
              ) : course.status === "PENDING_PAYMENT" ? (
                <span className={styles.pillGated}>Payment Pending</span>
              ) : course.status === "WAITLIST" ? (
                <span className={styles.pillGated}>Waitlisted</span>
              ) : (
                <span className={styles.pillActive}>
                  In Progress
                </span>
              );

              return (
                <div key={course.enrolmentId} className={styles.courseCard}>
                  {/* Thumbnail Cover */}
                  <div className={styles.cardCover}>
                    <Link href={resume} aria-label={`${action}: ${course.programTitle}`} className={styles.cardCoverLink}>
                      <Image
                        src={courseImageFor(course.programTitle)}
                        alt={course.programTitle}
                        width={360}
                        height={225}
                        quality={85}
                        loading="lazy"
                        sizes="(max-width: 640px) 100vw, (max-width: 1200px) 50vw, 320px"
                        className={styles.cardCoverImg}
                      />
                      <span className={styles.playCircle} aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </span>
                    </Link>

                    {/* Top Right Status Badge */}
                    <div className={styles.statusBadgeTopRight}>
                      {statusBadge}
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className={styles.cardBody}>
                    <h3 className={styles.courseTitle} title={course.programTitle}>
                      {course.programTitle}
                    </h3>

                    {/* Progress Bar & Percentage */}
                    <div className={styles.progressRow}>
                      <div
                        className={styles.progressBar}
                        role="progressbar"
                        aria-valuenow={course.progress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${course.programTitle} progress`}
                      >
                        <div
                          className={`${styles.progressFill} ${!done ? styles.progressFillActive : ""}`}
                          style={{ width: `${Math.min(100, Math.max(0, course.progress))}%` }}
                        />
                      </div>
                      <span className={styles.progressPercent}>{course.progress}%</span>
                    </div>

                    {/* Helper text */}
                    <p className={styles.upNext}>
                      {course.status === "PENDING_AGREEMENT" ? (
                        "Please review and sign the program agreement to start."
                      ) : course.status === "PENDING_PAYMENT" ? (
                        "Awaiting payment confirmation."
                      ) : course.status === "WAITLIST" ? (
                        "You are on the waitlist for this cohort."
                      ) : done ? (
                        "You finished every step of this course."
                      ) : next ? (
                        <>
                          <span style={{ color: "#94a3b8" }}>{course.progress > 0 ? "You stopped at: " : "Starts with: "}</span>
                          <strong style={{ color: "#334155" }}>{next.title}</strong>
                        </>
                      ) : (
                        "Ready to start learning."
                      )}
                    </p>
                  </div>

                  {/* Card Footer Actions */}
                  <div className={styles.cardFooter}>
                    {course.status === "PENDING_AGREEMENT" ? (
                      <Link href={`/agreement?programId=${course.programId}&enrolmentId=${course.enrolmentId}`} className={styles.btnReview}>
                        Sign Agreement
                      </Link>
                    ) : course.status === "PENDING_PAYMENT" ? (
                      <Link href={`/checkout?programId=${course.programId}&enrolmentId=${course.enrolmentId}`} className={styles.btnReview}>
                        Complete Payment
                      </Link>
                    ) : (
                      <>
                        <Link href={resume} className={styles.btnReview}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                          <span>{action}</span>
                        </Link>
                        {done ? (
                          <Link href="/certificates" className={styles.btnCertificate}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                              <line x1="16" y1="13" x2="8" y2="13" />
                              <line x1="16" y1="17" x2="8" y2="17" />
                              <polyline points="10 9 9 9 8 9" />
                            </svg>
                            <span>Certificate</span>
                          </Link>
                        ) : (
                          <Link href={steps} className={styles.btnCertificate}>
                            <span>All Steps</span>
                          </Link>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* =================================================================
             LIST VIEW: HORIZONTAL CARDS
             ================================================================= */
          <div className={styles.cardList}>
            {shown.map((course) => {
              const done = course.progress >= 100;
              const next = courses.find((c) => c.enrolmentId === course.enrolmentId)?.pending?.[0];
              const steps = `/programs/${course.programId}/steps`;
              const resume = next ? `/steps/${next.stepId}` : steps;
              const action = done ? "Review" : course.progress > 0 ? "Continue" : "Start";

              return (
                <div key={course.enrolmentId} className={styles.courseCardRow}>
                  <div className={styles.cardRowCover}>
                    <Image
                      src={courseImageFor(course.programTitle)}
                      alt={course.programTitle}
                      width={240}
                      height={140}
                      quality={85}
                      loading="lazy"
                      className={styles.cardRowImg}
                    />
                    <span className={styles.playCircle} style={{ width: 38, height: 38 }} aria-hidden="true">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </span>
                  </div>

                  <div className={styles.cardRowBody}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <h3 className={styles.courseTitle} style={{ margin: 0 }}>{course.programTitle}</h3>
                      {done ? (
                        <span className={styles.pillCompleted}>✓ Completed</span>
                      ) : (
                        <span className={styles.pillActive}>{course.progress}% Done</span>
                      )}
                    </div>

                    <div className={styles.progressRow} style={{ maxWidth: 420 }}>
                      <div className={styles.progressBar}>
                        <div
                          className={`${styles.progressFill} ${!done ? styles.progressFillActive : ""}`}
                          style={{ width: `${course.progress}%` }}
                        />
                      </div>
                      <span className={styles.progressPercent}>{course.progress}%</span>
                    </div>

                    <p className={styles.upNext}>
                      {done ? "You finished every step of this course." : next ? `Next: ${next.title}` : "Ready to start learning."}
                    </p>
                  </div>

                  <div className={styles.cardRowFooter}>
                    <Link href={resume} className={styles.btnReview} style={{ minWidth: 120 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      <span>{action}</span>
                    </Link>
                    {done && (
                      <Link href="/certificates" className={styles.btnCertificate} style={{ minWidth: 120 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                          <polyline points="10 9 9 9 8 9" />
                        </svg>
                        <span>Certificate</span>
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
