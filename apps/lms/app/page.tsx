"use client";

import styles from "./page.module.css";
import Link from "next/link";
import { SITE_URL } from "./lib/site";
import { useEffect, useState } from "react";
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

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    fetch(`${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}`}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        // Only a rejected session signs the learner out. A slow database, a
        // rate limit or a server error used to log them out as well.
        if (res.status === 401) {
          localStorage.removeItem("token");
          router.push("/login");
          throw new Error("Unauthorized");
        }
        if (!res.ok) {
          setLoadError(true);
          throw new Error(`Dashboard failed to load (${res.status})`);
        }
        return res.json();
      })
      .then((profile: UserProfile) => {
        setUser(profile);
        // Also fetch their certificates
        return fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/certificates/mine`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      })
      .then(res => res.ok ? res.json() : [])
      .then(certs => {
        setCertificates(certs);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

  const requestCertificate = async (enrolmentId: string) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/certificates/request/${enrolmentId}`, {
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
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <h2>Loading your dashboard...</h2>
        </div>
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
  const RING = 2 * Math.PI * 52;

  const stats = [
    { label: "Courses", value: String(numEnrolled), href: "#courses", icon: Icons.course },
    { label: "Meetings", value: String(sessions.length), href: "/live", icon: Icons.meeting },
    { label: "Certificates", value: String(certificates.length), href: "/certificates", icon: Icons.certificate },
    { label: "Progress", value: `${overall}%`, href: "#courses", icon: Icons.progress },
  ];

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

  return (
    <div className={styles.dashboard}>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>{greeting}, {firstName}</h1>
          <p className={styles.pageSubtitle}>
            {isEnrolled
              ? `You have ${numEnrolled} active ${numEnrolled === 1 ? "course" : "courses"} in progress.`
              : "You are not enrolled in a course yet."}
          </p>
        </div>
        <Link href={siteCourses} className={styles.primaryBtn}>Browse Courses</Link>
      </header>

      <div className={styles.stats}>
        {stats.map((item) => (
          <Link key={item.label} href={item.href} className={styles.stat}>
            <span className={styles.statIcon}>{item.icon}</span>
            <span className={styles.statText}>
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </span>
          </Link>
        ))}
      </div>

      <div className={styles.board}>
        <div className={styles.boardMain}>
          <section id="courses" className={styles.panel}>
            <div className={styles.panelHead}>
              <h2>Your Courses</h2>
              <Link href={siteCourses} className={styles.textLink}>Browse all</Link>
            </div>
            {!isEnrolled ? (
              <p className={styles.empty}>You haven&apos;t enrolled in a course yet.</p>
            ) : (
              <ul className={styles.list}>
                {user.enrolledPrograms.map((prog) => (
                  <li key={prog.programId} className={styles.course}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/brand/session.png" alt="" className={styles.thumb} />
                    <div className={styles.rowMain}>
                      <p className={styles.rowTitle}>{prog.programTitle}</p>
                      <p className={styles.muted}>Cohort: {prog.batchName}</p>
                      <div className={styles.progressLine}>
                        <div className={styles.progress} role="progressbar" aria-valuenow={prog.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${prog.programTitle} progress`}>
                          <span style={{ width: `${prog.progress}%` }} />
                        </div>
                        <span>{prog.progress}%</span>
                      </div>
                    </div>
                    {prog.progress === 100 ? (
                      <button type="button" onClick={() => requestCertificate(prog.enrolmentId)} className={styles.secondaryBtn}>Request Certificate</button>
                    ) : (
                      <Link href={`/programs/${prog.programId}/steps`} className={styles.darkBtn}>
                        {prog.progress > 0 ? "Resume" : "Start"}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* every meeting scheduled for the learner's cohorts */}
          <section id="meetings" className={`${styles.panel} ${styles.grow}`}>
            <div className={styles.panelHead}>
              <h2>Scheduled Meetings</h2>
              <Link href="/live" className={styles.textLink}>View all</Link>
            </div>
            {sessions.length === 0 ? (
              <p className={styles.empty}>No meetings are scheduled for your cohort yet.</p>
            ) : (
              <ul className={styles.list}>
                {sessions.map((session) => {
                  const start = new Date(session.startTime);
                  const ended = now > new Date(session.endTime);
                  const open = isOpen(session);
                  return (
                    <li key={session.id} className={styles.row}>
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
          <section className={styles.panel}>
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
        </div>

        <aside className={styles.boardSide}>
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <h2>Overall Progress</h2>
            </div>
            <div className={styles.ringWrap}>
              <svg width="132" height="132" viewBox="0 0 120 120" role="img" aria-label={`${overall}% complete`}>
                <circle cx="60" cy="60" r="52" fill="none" stroke="var(--border-light)" strokeWidth="10" />
                <circle cx="60" cy="60" r="52" fill="none" stroke="var(--accent-secondary)" strokeWidth="10" strokeLinecap="round" strokeDasharray={RING} strokeDashoffset={RING * (1 - overall / 100)} transform="rotate(-90 60 60)" />
                <text x="60" y="67" textAnchor="middle" fontSize="24" fontWeight="800" fill="var(--text-primary)">{overall}%</text>
              </svg>
              <p className={styles.muted}>
                {completed.length} of {numEnrolled} {numEnrolled === 1 ? "course" : "courses"} completed
              </p>
            </div>
          </section>

          <section className={`${styles.panel} ${styles.nextPanel}`}>
            <p className={styles.kicker}>Next Meeting</p>
            {nextUp ? (
              <>
                <h3>{nextUp.title}</h3>
                <p>
                  {new Date(nextUp.startTime).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}
                  <br />
                  {timeRange(nextUp)}
                </p>
                {isOpen(nextUp) ? (
                  <button type="button" onClick={() => checkIn(nextUp)} className={styles.goldBtn}>Check In &amp; Join</button>
                ) : (
                  <Link href="/live" className={styles.goldBtn}>View Details</Link>
                )}
              </>
            ) : (
              <p>Nothing scheduled yet. New meetings will appear here.</p>
            )}
          </section>

          <section className={`${styles.panel} ${styles.grow}`}>
            <div className={styles.panelHead}>
              <h2>Certificates</h2>
              <Link href="/certificates" className={styles.textLink}>View all</Link>
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
        </aside>
      </div>
    </div>
  );
}
