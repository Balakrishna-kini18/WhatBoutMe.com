"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
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

const stroke = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const Icons = {
  course: (
    <svg {...stroke}>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  ),
  done: (
    <svg {...stroke}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  attendance: (
    <svg {...stroke}>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  certificate: (
    <svg {...stroke}>
      <circle cx="12" cy="8" r="7" />
      <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
    </svg>
  ),
};

const SHOWN = 5;

/** Every enrolled course with the videos and quizzes still to do. */
export default function CoursesPage() {
  return (
    <Suspense>
      <Courses />
    </Suspense>
  );
}

function Courses() {
  const router = useRouter();
  const query = (useSearchParams().get("q") ?? "").trim().toLowerCase();
  const [courses, setCourses] = useState<Enrolled[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [daysPresent, setDaysPresent] = useState<number | null>(null);
  const [certificates, setCertificates] = useState<number | null>(null);

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

  const hit = (...text: string[]) => text.some((t) => t.toLowerCase().includes(query));
  const shown = !query
    ? courses
    : courses.flatMap((c) => {
        if (hit(c.programTitle, c.batchName)) return [c];
        const pending = (c.pending ?? []).filter((p) => hit(p.title, p.stepTitle));
        return pending.length ? [{ ...c, pending }] : [];
      });

  const pendingTotal = courses.reduce((sum, c) => sum + (c.pending?.length ?? 0), 0);
  const itemsTotal = courses.reduce((sum, c) => sum + (c.totalItems ?? 0), 0);
  const itemsDone = courses.reduce((sum, c) => sum + (c.completedItems ?? 0), 0);
  const overall = courses.length
    ? Math.round(courses.reduce((sum, c) => sum + c.progress, 0) / courses.length)
    : 0;

  const tiles = [
    { label: "Courses", value: loading ? null : courses.length, icon: Icons.course },
    { label: "Completed", value: loading ? null : courses.filter((c) => c.progress >= 100).length, icon: Icons.done },
    { label: "Days Present", value: daysPresent, icon: Icons.attendance, href: "/attendance" },
    { label: "Certificates", value: certificates, icon: Icons.certificate, href: "/certificates" },
  ];

  return (
    <div className={styles.pageWrapper}>
      {/* Header */}
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>My Courses</h1>
      </header>

      {/* Phone overall progress pill */}
      {!loading && !error && courses.length > 0 && (
        <section className={styles.overall} aria-label="Overall progress">
          <div className={styles.ring}>
            <svg viewBox="0 0 36 36" aria-hidden="true">
              <circle cx="18" cy="18" r="15.9155" pathLength="100" />
              <circle cx="18" cy="18" r="15.9155" pathLength="100" strokeDasharray={`${overall} 100`} />
            </svg>
            <strong>{overall}%</strong>
          </div>
          <div className={styles.overallText}>
            <h2>Overall Progress</h2>
            <p>{itemsDone} of {itemsTotal} items done</p>
            <p>{pendingTotal} still to do</p>
          </div>
        </section>
      )}

      {/* 4 Stats Grid */}
      <div className={styles.statsGrid}>
        {tiles.map((tile) => {
          const content = (
            <>
              <div className={styles.statIconBadge}>{tile.icon}</div>
              <div className={styles.statContent}>
                <span className={styles.statValue}>{tile.value ?? "–"}</span>
                <span className={styles.statLabel}>{tile.label}</span>
              </div>
            </>
          );
          return tile.href ? (
            <Link key={tile.label} href={tile.href} className={styles.statCard}>
              {content}
            </Link>
          ) : (
            <div key={tile.label} className={styles.statCard}>
              {content}
            </div>
          );
        })}
      </div>

      {error && (
        <p role="alert" style={{ color: "#dc2626", background: "#fef2f2", padding: "12px 16px", borderRadius: 10, border: "1px solid #fecaca", margin: 0 }}>
          {error}
        </p>
      )}

      {/* Enrolled Courses Section */}
      <section className={styles.coursesSection}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Enrolled Courses</h2>
          <a href={`${MARKETING_URL}/courses`} className={styles.addCourseBtn}>
            <span>+</span> Add a Course
          </a>
        </div>

        {loading ? (
          <div className={styles.cardGrid} aria-hidden="true">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className={styles.courseCard} style={{ pointerEvents: "none" }}>
                <div className={styles.skeletonPulse} style={{ width: "100%", aspectRatio: "16 / 10" }} />
                <div className={styles.cardBody}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div className={styles.skeletonPulse} style={{ width: "55%", height: 20, borderRadius: 4 }} />
                    <div className={styles.skeletonPulse} style={{ width: 75, height: 20, borderRadius: 999 }} />
                  </div>
                  <div className={styles.skeletonPulse} style={{ width: "100%", height: 7, borderRadius: 999, margin: "6px 0" }} />
                  <div className={styles.skeletonPulse} style={{ width: "70%", height: 14, borderRadius: 4 }} />
                </div>
                <div className={styles.cardFooter}>
                  <div className={styles.skeletonPulse} style={{ flex: 1, height: 36, borderRadius: 8 }} />
                  <div className={styles.skeletonPulse} style={{ flex: 1, height: 36, borderRadius: 8 }} />
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
            <p>
              Your courses appear here once you enrol. Explore the courses to
              pick one and start learning.
            </p>
            <a href={`${MARKETING_URL}/courses`} className={styles.exploreBtn}>
              Explore Courses
            </a>
          </div>
        ) : shown.length === 0 ? (
          <div className={styles.emptySearch}>Nothing in your courses matches that search.</div>
        ) : (
          <div className={styles.cardGrid}>
            {shown.map((course) => {
              const isActive = !course.status || course.status === "ACTIVE";
              const pending = isActive ? (course.pending ?? []) : [];
              const done = course.progress >= 100;
              const next = courses.find((c) => c.enrolmentId === course.enrolmentId)?.pending?.[0];
              const steps = `/programs/${course.programId}/steps`;
              const resume = course.status === "PENDING_AGREEMENT"
                ? `/agreement?programId=${course.programId}&enrolmentId=${course.enrolmentId}`
                : course.status === "PENDING_PAYMENT"
                ? `/checkout?programId=${course.programId}&enrolmentId=${course.enrolmentId}`
                : next ? `/steps/${next.stepId}` : steps;
              const action = done ? "Review" : course.progress > 0 ? "Continue" : "Start";

              const statusPillClass = done
                ? styles.pillCompleted
                : course.status === "PENDING_AGREEMENT" || course.status === "PENDING_PAYMENT" || course.status === "WAITLIST" || course.status === "REVOKED"
                ? styles.pillGated
                : styles.pillActive;

              const statusText = course.status === "PENDING_AGREEMENT"
                ? "Agreement Required"
                : course.status === "PENDING_PAYMENT"
                ? "Payment Pending"
                : course.status === "WAITLIST"
                ? "Waitlisted"
                : course.status === "REVOKED"
                ? "Revoked"
                : done
                ? "Completed"
                : `${course.completedItems ?? 0} of ${course.totalItems ?? 0} done`;

              return (
                <div key={course.enrolmentId} className={styles.courseCard}>
                  {/* Card Cover */}
                  {isActive ? (
                    <Link href={resume} className={styles.cardCover} aria-label={`${action}: ${course.programTitle}`}>
                      <Image
                        src={courseImageFor(course.programTitle)}
                        alt={course.programTitle}
                        width={320}
                        height={200}
                        quality={80}
                        loading="lazy"
                        sizes="(max-width: 640px) 100vw, 320px"
                      />
                      <span className={styles.playCircle} aria-hidden="true">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </span>
                    </Link>
                  ) : course.status === "PENDING_AGREEMENT" ? (
                    <Link href={`/agreement?programId=${course.programId}&enrolmentId=${course.enrolmentId}`} className={styles.cardCover} aria-label={`Sign Agreement: ${course.programTitle}`}>
                      <Image
                        src={courseImageFor(course.programTitle)}
                        alt={course.programTitle}
                        width={320}
                        height={200}
                        quality={80}
                        loading="lazy"
                        sizes="(max-width: 640px) 100vw, 320px"
                      />
                      <span className={styles.playCircle} aria-hidden="true">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                        </svg>
                      </span>
                    </Link>
                  ) : course.status === "PENDING_PAYMENT" ? (
                    <Link href={`/checkout?programId=${course.programId}&enrolmentId=${course.enrolmentId}`} className={styles.cardCover} aria-label={`Complete Payment: ${course.programTitle}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={courseImageFor(course.programTitle)} alt={course.programTitle} />
                      <span className={styles.playCircle} aria-hidden="true" title="Complete Payment">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z" />
                        </svg>
                      </span>
                    </Link>
                  ) : (
                    <div className={styles.cardCover} style={{ cursor: "not-allowed", opacity: 0.7 }} aria-label={`Gated: ${course.programTitle}`}>
                      <Image
                        src={courseImageFor(course.programTitle)}
                        alt={course.programTitle}
                        width={320}
                        height={200}
                        quality={80}
                        loading="lazy"
                        sizes="(max-width: 640px) 100vw, 320px"
                      />
                    </div>
                  )}

                  {/* Card Body */}
                  <div className={styles.cardBody}>
                    <div className={styles.cardTitleRow}>
                      <h3 className={styles.courseTitle}>{course.programTitle}</h3>
                      <span className={statusPillClass}>
                        {statusText}
                      </span>
                    </div>

                    {/* Progress Bar */}
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
                          className={`${styles.progressFill} ${done ? styles.progressFillCompleted : ""}`}
                          style={{ width: `${course.progress}%` }}
                        />
                      </div>
                      <span className={styles.progressPercent}>{course.progress}%</span>
                    </div>

                    <p className={styles.upNext}>
                      {course.status === "PENDING_AGREEMENT" ? (
                        "Please review and sign the program agreement to start."
                      ) : course.status === "PENDING_PAYMENT" ? (
                        "Awaiting payment confirmation."
                      ) : course.status === "WAITLIST" ? (
                        "You are on the waitlist for this cohort."
                      ) : course.status === "REVOKED" ? (
                        "Access to course materials has been revoked."
                      ) : done ? (
                        "You finished every step of this course."
                      ) : next ? (
                        <>
                          <span style={{ color: "#94a3b8" }}>{course.progress > 0 ? "You stopped at: " : "Starts with: "}</span>
                          <strong style={{ color: "#334155" }}>{next.title}</strong>
                        </>
                      ) : (
                        "All set to continue."
                      )}
                    </p>
                  </div>

                  {/* Card Footer Actions */}
                  <div className={styles.cardFooter}>
                    {course.status === "PENDING_AGREEMENT" ? (
                      <Link href={`/agreement?programId=${course.programId}&enrolmentId=${course.enrolmentId}`} className={styles.primaryActionBtn}>
                        Sign Agreement
                      </Link>
                    ) : course.status === "PENDING_PAYMENT" ? (
                      <Link href={`/checkout?programId=${course.programId}&enrolmentId=${course.enrolmentId}`} className={styles.primaryActionBtn}>
                        Complete Payment
                      </Link>
                    ) : course.status === "WAITLIST" ? (
                      <span className={styles.secondaryActionBtn} style={{ opacity: 0.7 }}>On Waitlist</span>
                    ) : course.status === "REVOKED" ? (
                      <span className={styles.secondaryActionBtn} style={{ opacity: 0.7 }}>Access Revoked</span>
                    ) : (
                      <>
                        <Link href={resume} className={styles.primaryActionBtn}>
                          {action}
                        </Link>
                        {done ? (
                          <Link href="/certificates" className={styles.secondaryActionBtn}>
                            Certificate
                          </Link>
                        ) : (
                          <Link href={steps} className={styles.secondaryActionBtn}>
                            All Steps
                          </Link>
                        )}
                      </>
                    )}
                  </div>

                  {/* Pending Lessons (Drawer list) */}
                  {pending.length > 0 && (
                    <ul
                      className={styles.pending}
                      aria-label={`Pending in ${course.programTitle}`}
                    >
                      {pending.slice(0, SHOWN).map((item, i) => (
                        <li key={`${item.stepId}-${i}`}>
                          <span className={styles.kind}>
                            {item.kind === "QUIZ" ? "Quiz" : "Video"}
                          </span>
                          <span className={styles.itemText}>
                            <strong>{item.title}</strong>
                            <span>Step {item.step}: {item.stepTitle}</span>
                          </span>
                          <Link
                            href={`/steps/${item.stepId}`}
                            className={styles.secondaryActionBtn}
                            style={{ flex: "none", padding: "0.3rem 0.75rem", fontSize: "0.76rem" }}
                          >
                            Open
                          </Link>
                        </li>
                      ))}
                      {pending.length > SHOWN && (
                        <li style={{ padding: "0.5rem 0", color: "#64748b", fontSize: "0.75rem" }}>
                          and {pending.length - SHOWN} more. Open the course to see every step.
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
