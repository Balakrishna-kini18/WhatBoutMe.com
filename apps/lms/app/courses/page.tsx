"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import dash from "../page.module.css";
import { SITE_URL } from "../lib/site";
import cert from "../certificates/certificates.module.css";
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
  progress: number;
  totalItems?: number;
  completedItems?: number;
  pending?: Pending[];
}

const stroke = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const Icons = {
  course: <svg {...stroke}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>,
  done: <svg {...stroke}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>,
  attendance: <svg {...stroke}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>,
  certificate: <svg {...stroke}><circle cx="12" cy="8" r="7" /><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" /></svg>,
};

// a long course would otherwise turn the page into one endless list
const SHOWN = 5;

/** Every enrolled course with the videos and quizzes still to do. */
export default function CoursesPage() {
  // useSearchParams needs a Suspense boundary to prerender
  return (
    <Suspense>
      <Courses />
    </Suspense>
  );
}

function Courses() {
  const router = useRouter();
  // set by the search bar in the top bar
  const query = (useSearchParams().get("q") ?? "").trim().toLowerCase();
  const [courses, setCourses] = useState<Enrolled[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // extras for the tiles; null until loaded, and left out if they fail
  const [daysPresent, setDaysPresent] = useState<number | null>(null);
  const [certificates, setCertificates] = useState<number | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((profile) => setCourses(profile.enrolledPrograms || []))
      .catch(() =>
        setError(
          "We could not load your courses. Please try again in a moment.",
        ),
      )
      .finally(() => setLoading(false));

    const extra = (path: string) =>
      fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } }).then((res) => (res.ok ? res.json() : null));
    extra("/attendance/mine")
      .then((data) => setDaysPresent(Array.isArray(data?.days) ? data.days.length : 0))
      .catch(() => setDaysPresent(0));
    extra("/certificates/mine")
      .then((data) => setCertificates(Array.isArray(data) ? data.filter((c: { status?: string }) => c.status === "APPROVED").length : 0))
      .catch(() => setCertificates(0));
  }, [router]);

  const hit = (...text: string[]) => text.some((t) => t.toLowerCase().includes(query));
  // a course is shown when its name or cohort matches, or any item left in it
  // does; in the second case only the matching items are listed
  const shown = !query
    ? courses
    : courses.flatMap((c) => {
        if (hit(c.programTitle, c.batchName)) return [c];
        const pending = (c.pending ?? []).filter((p) => hit(p.title, p.stepTitle));
        return pending.length ? [{ ...c, pending }] : [];
      });

  const pendingTotal = courses.reduce(
    (sum, c) => sum + (c.pending?.length ?? 0),
    0,
  );
  const itemsTotal = courses.reduce((sum, c) => sum + (c.totalItems ?? 0), 0);
  const itemsDone = courses.reduce((sum, c) => sum + (c.completedItems ?? 0), 0);
  const overall = courses.length
    ? Math.round(courses.reduce((sum, c) => sum + c.progress, 0) / courses.length)
    : 0;
  // dashboard-style tiles; the last two open their own pages
  const tiles = [
    { label: "Courses", value: loading ? null : courses.length, icon: Icons.course },
    { label: "Completed", value: loading ? null : courses.filter((c) => c.progress >= 100).length, icon: Icons.done },
    { label: "Days Present", value: daysPresent, icon: Icons.attendance, href: "/attendance" },
    { label: "Certificates", value: certificates, icon: Icons.certificate, href: "/certificates" },
  ];

  return (
    <div className={dash.dashboard}>
      <header className={dash.pageHeader}>
        <div>
          <h1 className={dash.pageTitle}>My Courses</h1>
          <p className={dash.pageSubtitle}>
            Your courses and what is left to do in each.
          </p>
        </div>
      </header>

      {/* grid keeps an even gap between the summary, notice and panel */}
      <div className={dash.boardMain}>
        {/* phones only: overall progress at a glance, above the detail */}
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

        <div className={`${dash.stats} ${styles.tiles}`}>
          {tiles.map((tile) => {
            const body = (
              <>
                <span className={dash.statIcon}>{tile.icon}</span>
                <span className={dash.statText}>
                  <strong>{tile.value ?? "–"}</strong>
                  <span>{tile.label}</span>
                </span>
              </>
            );
            return tile.href ? (
              <Link key={tile.label} href={tile.href} className={dash.stat}>{body}</Link>
            ) : (
              <div key={tile.label} className={dash.stat}>{body}</div>
            );
          })}
        </div>

        {error && (
          <p role="alert" className={cert.notice}>
            {error}
          </p>
        )}

        <section className={dash.panel}>
          <div className={dash.panelHead}>
            <h2>Enrolled Courses</h2>
            {/* another course is bought on the website; enrolling there returns here */}
            <a href={`${MARKETING_URL}/courses`} className={dash.secondaryBtn}>+ Add a Course</a>
          </div>

          {loading ? (
            <p className={dash.empty}>Loading your courses...</p>
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
              <a href={`${MARKETING_URL}/courses`} className={dash.darkBtn}>
                Explore Courses
              </a>
            </div>
          ) : shown.length === 0 ? (
            <p className={dash.empty}>Nothing in your courses matches that search.</p>
          ) : (
            shown.map((course) => {
              const pending = course.pending ?? [];
              const done = course.progress >= 100;
              // where the learner stopped: the first item still to do. Taken
              // from the full course, not the search-filtered list.
              const next = courses.find((c) => c.enrolmentId === course.enrolmentId)?.pending?.[0];
              const steps = `/programs/${course.programId}/steps`;
              const resume = next ? `/steps/${next.stepId}` : steps;
              const action = done ? "Review" : course.progress > 0 ? "Continue" : "Start";
              return (
                <div key={course.enrolmentId} className={styles.block}>
                  <div className={styles.blockHead}>
                    <Link href={resume} className={styles.cover} aria-label={`${action}: ${course.programTitle}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/brand/session.png" alt="" />
                      <span className={styles.play} aria-hidden="true">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                      </span>
                    </Link>
                    <div className={dash.rowMain}>
                      <p className={`${dash.rowTitle} ${styles.titleRow}`}>
                        <span>{course.programTitle}</span>
                        <span
                          className={`${dash.pill} ${done ? "" : dash.pillOff}`}
                        >
                          {done
                            ? "Completed"
                            : `${course.completedItems ?? 0} of ${course.totalItems ?? 0} done`}
                        </span>
                      </p>
                      <p className={dash.muted}>Cohort: {course.batchName}</p>
                      <div className={dash.progressLine}>
                        <div
                          className={dash.progress}
                          role="progressbar"
                          aria-valuenow={course.progress}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${course.programTitle} progress`}
                        >
                          <span style={{ width: `${course.progress}%` }} />
                        </div>
                        <span>{course.progress}%</span>
                      </div>
                      <p className={styles.upNext}>
                        {done ? (
                          "You finished every step of this course."
                        ) : next ? (
                          <>
                            <span>{course.progress > 0 ? "You stopped at" : "Starts with"}</span>{" "}
                            {next.title}
                          </>
                        ) : null}
                      </p>
                      <div className={styles.actions}>
                        <Link href={resume} className={dash.darkBtn}>{action}</Link>
                        {done ? (
                          <Link href="/certificates" className={dash.secondaryBtn}>Certificate</Link>
                        ) : (
                          <Link href={steps} className={dash.secondaryBtn}>All Steps</Link>
                        )}
                      </div>
                    </div>
                  </div>

                  {pending.length > 0 && (
                    <>
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
                              <span>
                                Step {item.step}: {item.stepTitle}
                              </span>
                            </span>
                            <Link
                              href={`/steps/${item.stepId}`}
                              className={dash.secondaryBtn}
                            >
                              Open
                            </Link>
                          </li>
                        ))}
                      </ul>
                      {pending.length > SHOWN && (
                        <p className={styles.more}>
                          and {pending.length - SHOWN} more. Open the course to
                          see every step.
                        </p>
                      )}
                    </>
                  )}
                </div>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}
