"use client";

import styles from "./page.module.css";
import Image from "next/image";
import Link from "next/link";
import { SITE_URL } from "./lib/site";
import { API_URL } from "./lib/api";
import { courseImageFor } from "./lib/courseImage";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const Icons = {
  course: <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>,
  meeting: <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
  certificate: <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}><circle cx="12" cy="8" r="7" /><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" /></svg>,
  progress: <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>,
  message: <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
  user: <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
  arrow: <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}><polyline points="9 18 15 12 9 6" /></svg>,
};

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

  const [complianceMap, setComplianceMap] = useState<Record<string, any>>({});
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

      const authHeaders = { Authorization: `Bearer ${token}` };

      try {
        const res = await fetch(`${API_URL}/auth/me`, {
          headers: authHeaders,
        });

        if (res.status === 401) {
          localStorage.removeItem("token");
          router.push("/login");
          return;
        }

        if (!res.ok) {
          if (isInitial) setLoadError(true);
          return;
        }

        const profile: UserProfile = await res.json();
        setUser(profile);

        // Fetch compliance, attendance summary, and certificates concurrently
        const enrolled = profile.enrolledPrograms || [];
        const compliancePromises = enrolled.map((ep) =>
          fetch(`${API_URL}/attendance/compliance/${ep.enrolmentId}`, { headers: authHeaders })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
        );
        const attendancePromise = fetch(`${API_URL}/me/attendance`, { headers: authHeaders })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
        const certificatesPromise = fetch(`${API_URL}/certificates/mine`, { headers: authHeaders })
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => []);

        const [complianceResults, attData, certs] = await Promise.all([
          Promise.all(compliancePromises),
          attendancePromise,
          certificatesPromise,
        ]);

        const compMap: Record<string, any> = {};
        enrolled.forEach((ep, idx) => {
          if (complianceResults[idx]) compMap[ep.enrolmentId] = complianceResults[idx];
        });
        setComplianceMap(compMap);
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

  const requestCertificate = async (enrolmentId: string) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/certificates/request/${enrolmentId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        alert("Certificate requested! It is now pending Admin approval.");
        window.location.reload();
      } else {
        alert("Failed to request certificate. You may have already requested it.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <div className={styles.dashboard}>
        {/* Skeleton Greeting */}
        <div className={styles.greeting} style={{ marginBottom: "1.5rem" }}>
          <div className="skeleton" style={{ width: 48, height: 48, borderRadius: "50%" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div className="skeleton" style={{ width: 220, height: 28, borderRadius: 8 }} />
            <div className="skeleton" style={{ width: 160, height: 16, borderRadius: 6 }} />
          </div>
        </div>

        {/* Skeleton Hero Banner */}
        <div className="skeleton" style={{ height: 200, width: "100%", borderRadius: 24, marginBottom: "2rem" }} />

        {/* Skeleton Stat Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.25rem", marginBottom: "2rem" }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton" style={{ height: 110, borderRadius: 20 }} />
          ))}
        </div>

        {/* Skeleton Course Section */}
        <div className="skeleton" style={{ height: 260, width: "100%", borderRadius: 20 }} />
      </div>
    );
  }


  if (loadError) {
    return (
      <div className={styles.dashboard}>
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <h2>We couldn&apos;t load your dashboard</h2>
          <p style={{ color: "var(--text-secondary)" }}>You are still signed in. Please try again in a moment.</p>
          <button type="button" className={styles.primaryBtn} style={{ border: "none", cursor: "pointer", font: "inherit", fontWeight: 600 }} onClick={() => window.location.reload()}>Try Again</button>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const firstName = user.name ? user.name.split(" ")[0] : "Learner";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";
  const numEnrolled = user.enrolledPrograms.length;
  const isEnrolled = numEnrolled > 0;

  const checkIn = async (session: Session) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/sessions/${session.id}/attend`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        if (session.joinUrl) window.open(session.joinUrl, '_blank');
      } else {
        const data = await res.json().catch(() => null);
        alert(`Check-in failed: ${data?.error?.message || data?.message || 'Please try again.'}`);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const now = new Date();
  const sessions = [...(user.upcomingSessions || [])].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );
  const nextUp = sessions.find((s) => new Date(s.endTime) > now);
  const completed = user.enrolledPrograms.filter((p) => p.progress === 100);
  const siteCourses = `${SITE_URL}/courses`;
  const overall = isEnrolled
    ? Math.round(user.enrolledPrograms.reduce((sum, p) => sum + (p.progress || 0), 0) / numEnrolled)
    : 0;

  // the course the "Continue learning" card offers: one the learner can open
  // right now (the same cases that show Resume/Start in the list), preferring
  // one already started
  const blocked = ["PENDING_AGREEMENT", "PENDING_PAYMENT", "WAITLIST", "REVOKED"];
  const openable = user.enrolledPrograms.filter((p) => !blocked.includes(p.status) && p.progress < 100);
  const continueProg = openable.find((p) => p.progress > 0) ?? openable[0];
  const attendancePct = attendanceSummary?.overallAttendancePercentage ?? 0;
  const attendanceMet = attendancePct >= 75;

  const shortcuts = [
    { label: "Live Sessions", href: "/live", icon: Icons.meeting },
    { label: "Messages", href: "/chat", icon: Icons.message },
    { label: "Certificates", href: "/certificates", icon: Icons.certificate },
    { label: "My Profile", href: "/profile", icon: Icons.user },
  ];

  const timeRange = (s: Session) =>
    `${new Date(s.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – ${new Date(s.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  // check-in opens 5 minutes before the start
  const isOpen = (s: Session) =>
    now >= new Date(new Date(s.startTime).getTime() - 5 * 60000) && now <= new Date(s.endTime);

  // the action for one course: exactly the cases the list has always had
  const courseAction = (prog: EnrolledProgram, className = styles.darkBtn) =>
    prog.status === "PENDING_AGREEMENT" ? (
      <Link href="/agreement" className={className}>
        Sign Agreement
      </Link>
    ) : prog.status === "PENDING_PAYMENT" ? (
      <span className={`${styles.pill} ${styles.pillOff}`}>Payment Pending</span>
    ) : prog.status === "WAITLIST" ? (
      <span className={`${styles.pill} ${styles.pillOff}`}>On Waitlist</span>
    ) : prog.status === "REVOKED" ? (
      <span className={`${styles.pill} ${styles.pillOff}`}>Access Revoked</span>
    ) : prog.progress === 100 ? (
      <button type="button" onClick={() => requestCertificate(prog.enrolmentId)} className={styles.secondaryBtn}>
        Request Certificate
      </button>
    ) : (
      <Link href={`/programs/${prog.programId}/steps`} className={className}>
        {prog.progress > 0 ? "Resume" : "Start"}
        {Icons.arrow}
      </Link>
    );

  const compliance = (prog: EnrolledProgram) => {
    const c = complianceMap[prog.enrolmentId];
    if (!c || c.status === "NOT_APPLICABLE") return null;
    const ok = c.status === "COMPLIANT";
    return (
      <span className={`${styles.attendTag} ${ok ? styles.attendOk : styles.attendLow}`}>
        {ok ? "Attendance Compliant" : "Low Attendance"} ({Math.round(c.attendancePercentage)}%)
      </span>
    );
  };

  return (
    <div className={`${styles.dashboard} ${styles.home}`}>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>{greeting}, {firstName}</h1>
          <p className={styles.pageSubtitle}>
            {isEnrolled
              ? `You have ${numEnrolled} active ${numEnrolled === 1 ? "course" : "courses"} in progress — rewiring your brain for sustainable action.`
              : "For the people who hold everyone else together. Explore certified programmes built on neuroscience and lived experience."}
          </p>
        </div>
        <Link href={siteCourses} className={styles.headerBtn}>Browse Courses</Link>
      </header>

      {/* the one thing most visits are for: pick up the course where it was left */}
      {continueProg && (
        <section className={styles.continueCard} aria-label="Continue learning">
          <Image
            src={courseImageFor(continueProg.programTitle)}
            alt=""
            width={168}
            height={112}
            quality={80}
            sizes="(max-width: 600px) 88px, 168px"
            className={styles.continueThumb}
          />
          <div className={styles.continueBody}>
            <p className={styles.continueLabel}>
              {continueProg.progress > 0 ? "Continue Where You Left Off" : "Ready When You Are"}
            </p>
            <h2 className={styles.continueTitle}>{continueProg.programTitle}</h2>
            <p className={styles.muted}>Cohort: {continueProg.batchName}</p>
            <div className={styles.progressLine}>
              <div className={styles.progress} role="progressbar" aria-valuenow={continueProg.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${continueProg.programTitle} progress`}>
                <span style={{ width: `${continueProg.progress}%` }} />
              </div>
              <span>{continueProg.progress}%</span>
            </div>
          </div>
          <Link href={`/programs/${continueProg.programId}/steps`} className={styles.continueBtn}>
            {continueProg.progress > 0 ? "Resume Course" : "Start Course"}
            {Icons.arrow}
          </Link>
        </section>
      )}

      <div className={styles.board}>
        <div className={styles.boardMain}>
          <section id="courses" className={styles.panel}>
            <div className={styles.panelHead}>
              <h2>Your Courses</h2>
              <Link href={siteCourses} className={styles.textLink}>Browse All</Link>
            </div>
            {!isEnrolled ? (
              <div className={styles.emptyBlock}>
                <p className={styles.emptyTitle}>Start Your Brain Health Journey</p>
                <p className={styles.muted}>
                  From a 12-class CPD-certified programme to focused resilience workshops, rewire your brain for clarity, confidence, and fulfillment.
                </p>
                <Link href={siteCourses} className={styles.darkBtn}>
                  Explore Programmes &amp; Workshops
                </Link>
              </div>
            ) : (
              <ul className={styles.courseGrid}>
                {user.enrolledPrograms.map((prog) => (
                  <li key={prog.programId} className={styles.courseCard}>
                    {/* the picture takes most of the card; a little info below it */}
                    <div className={styles.courseCardMedia}>
                      <Image
                        src={courseImageFor(prog.programTitle)}
                        alt=""
                        fill
                        quality={80}
                        loading="lazy"
                        sizes="(max-width: 600px) 100vw, 320px"
                        className={styles.courseCardImg}
                      />
                    </div>

                    <div className={styles.courseCardBody}>
                      <p className={styles.courseCardTitle}>{prog.programTitle}</p>
                      <p className={styles.muted}>{prog.batchName}</p>
                    </div>

                    {compliance(prog)}

                    <div className={styles.courseCardProgress}>
                      <div className={styles.courseCardProgressLabel}>
                        <span>Progress</span>
                        <strong>{prog.progress}%</strong>
                      </div>
                      <div className={styles.courseCardBar} role="progressbar" aria-valuenow={prog.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${prog.programTitle} progress`}>
                        <span style={{ width: `${prog.progress}%` }} />
                      </div>
                    </div>

                    <div className={styles.courseCardAction}>{courseAction(prog, styles.courseCardBtn)}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* every meeting scheduled for the learner's cohorts; the next one is marked */}
          <section id="meetings" className={styles.panel}>
            <div className={styles.panelHead}>
              <h2>Upcoming Sessions</h2>
              <Link href="/live" className={styles.textLink}>View All</Link>
            </div>
            {sessions.length === 0 ? (
              <p className={styles.empty}>
                Nothing scheduled yet. New live sessions for your cohort will show up here.
              </p>
            ) : (
              <ul className={styles.list}>
                {sessions.map((session) => {
                  const start = new Date(session.startTime);
                  const ended = now > new Date(session.endTime);
                  const open = isOpen(session);
                  return (
                    <li key={session.id} className={`${styles.row} ${session.id === nextUp?.id ? styles.rowNext : ""}`}>
                      <div className={styles.dateBox}>
                        <span>{start.toLocaleDateString([], { month: "short" })}</span>
                        <strong>{start.getDate()}</strong>
                      </div>
                      <div className={styles.rowMain}>
                        <p className={styles.rowTitle}>{session.title}</p>
                        <p className={styles.muted}>
                          {start.toLocaleDateString([], { weekday: "long" })}, {timeRange(session)}
                          {session.recordingUrl && (
                            <> · <a href={session.recordingUrl} target="_blank" rel="noreferrer" className={styles.textLink}>Recording</a></>
                          )}
                          {session.quizId && (
                            <> · <Link href={`/steps/${session.quizId}?isQuiz=true`} className={styles.textLink}>Quiz</Link></>
                          )}
                        </p>
                      </div>
                      {open ? (
                        <button type="button" onClick={() => checkIn(session)} className={styles.darkBtn}>Check In &amp; Join</button>
                      ) : (
                        <span className={`${styles.pill} ${ended ? styles.pillOff : ""}`}>{ended ? "Ended" : "Upcoming"}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <aside className={styles.boardSide}>
          {/* progress, attendance and certificates in one place */}
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <h2>Your Progress</h2>
            </div>

            <div className={styles.statCards}>
              <div className={styles.statCard2}>
                <div className={styles.courseCardProgressLabel}>
                  <span>Overall Progress</span>
                  <strong>{overall}%</strong>
                </div>
                <div className={styles.courseCardBar} role="progressbar" aria-valuenow={overall} aria-valuemin={0} aria-valuemax={100} aria-label="Overall progress">
                  <span style={{ width: `${overall}%` }} />
                </div>
                <p className={styles.muted}>
                  {completed.length} of {numEnrolled} {numEnrolled === 1 ? "course" : "courses"} completed
                </p>
              </div>

              <div className={styles.statCard2}>
                <div className={styles.courseCardProgressLabel}>
                  <span>Attendance</span>
                  <strong>{attendanceSummary ? `${attendanceSummary.overallAttendancePercentage}%` : "—"}</strong>
                </div>
                <div className={styles.attendBar} role="progressbar" aria-valuenow={attendancePct} aria-valuemin={0} aria-valuemax={100} aria-label="Attendance">
                  <span
                    className={attendanceMet ? styles.attendBarOk : styles.attendBarWarn}
                    style={{ width: `${Math.min(100, attendancePct)}%` }}
                  />
                </div>
                <p className={styles.muted}>
                  {attendanceSummary
                    ? `${attendanceSummary.totalAttendedSessions} of ${attendanceSummary.totalScheduledSessions} live sessions completed`
                    : "Tracking live session attendance in real-time"}
                </p>
                <div className={styles.summaryRow}>
                  <span className={`${styles.attendTag} ${attendanceMet ? styles.attendOk : styles.attendWarn}`}>
                    {attendanceMet ? "Threshold Met (≥75%)" : "Needs 75% for Certificate"}
                  </span>
                  <Link href="/attendance" className={styles.textLink}>Details</Link>
                </div>
              </div>
            </div>
          </section>

          <section className={`${styles.panel} ${styles.grow}`}>
            <div className={styles.panelHead}>
              <h2>Certificates</h2>
              <Link href="/certificates" className={styles.textLink}>View All</Link>
            </div>
            {certificates.length === 0 ? (
              <p className={styles.empty}>
                {completed.length > 0
                  ? "You have completed a course. Request your certificate."
                  : "Complete a course to earn your certificate."}
              </p>
            ) : (
              <ul className={styles.list}>
                {certificates.map((cert) => (
                  <li key={cert.id} className={styles.row}>
                    <div className={styles.rowMain}>
                      <p className={styles.rowTitle}>{cert.enrolment?.batch?.program?.title || "Certificate"}</p>
                      <p className={styles.muted}>
                        {cert.issuedAt ? `Issued ${new Date(cert.issuedAt).toLocaleDateString()}` : `Status: ${String(cert.status || "pending").toLowerCase()}`}
                      </p>
                    </div>
                    {/* only approved certificates are listed here */}
                    <Link href={`/certificates/${cert.id}`} className={styles.secondaryBtn}>View</Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* phones only: the sidebar carries these links on larger screens */}
          <section className={`${styles.panel} ${styles.phoneOnly}`}>
            <div className={styles.panelHead}>
              <h2>Quick Links</h2>
            </div>
            <div className={styles.shortcuts}>
              {shortcuts.map((item) => (
                <Link key={item.label} href={item.href} className={styles.shortcut}>
                  <span className={styles.shortcutIcon}>{item.icon}</span>
                  {item.label}
                  <span className={styles.shortcutArrow}>{Icons.arrow}</span>
                </Link>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
