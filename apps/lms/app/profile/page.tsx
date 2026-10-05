"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOutEverywhere as leavePortal } from "../lib/site";
import styles from "./profile.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface Profile {
  name: string | null;
  email: string;
  phone?: string | null;
  role: string;
  enrolledPrograms: { programId: string; programTitle: string; batchName: string; status: string; progress?: number }[];
  upcomingSessions?: { id: string }[];
}

/** The signed-in learner's account details and courses. */
export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [certificates, setCertificates] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    const headers = { Authorization: `Bearer ${token}` };
    fetch(`${API_URL}/auth/me`, { headers })
      .then((res) => (res.ok ? res.json() : null))
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
    fetch(`${API_URL}/certificates/mine`, { headers })
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => setCertificates(Array.isArray(list) ? list.length : 0))
      .catch(() => setCertificates(0));
  }, [router]);

  const signOut = () => leavePortal();

  // ends this account's sessions on every device, then signs out here
  const signOutEverywhere = async () => {
    setBusy(true);
    try {
      await fetch(`${API_URL}/auth/logout-all`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
    } finally {
      signOut();
    }
  };

  if (loading) return <div className={styles.frame}><p className={styles.muted}>Loading your profile...</p></div>;
  if (!profile) return <div className={styles.frame}><p className={styles.muted}>We couldn&apos;t load your profile. Please refresh the page.</p></div>;

  const displayName = profile.name || "Learner";
  const initials = (profile.name || profile.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((n) => n[0]).join("").toUpperCase();
  const accountType = profile.role === "USER" ? "Learner" : profile.role.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  const cohort = profile.enrolledPrograms[0]?.batchName;

  const stats = [
    { label: "Courses", value: profile.enrolledPrograms.length },
    { label: "Scheduled Meetings", value: profile.upcomingSessions?.length ?? 0 },
    { label: "Certificates", value: certificates },
  ];

  const details = [
    { label: "Full Name", value: profile.name || "Not set" },
    { label: "Email Address", value: profile.email },
    { label: "Mobile Number", value: profile.phone || "Not set" },
    { label: "Account Type", value: accountType },
    { label: "Cohort", value: cohort || "Not enrolled" },
  ];

  return (
    <div className={styles.frame}>
      <article className={styles.panel}>
        <div className={styles.cover} />

        <header className={styles.head}>
          <span className={styles.avatarWrap}>
            <span className={styles.avatar}>{initials}</span>
            <span className={styles.mark} title="Verified learner">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
            </span>
          </span>
          <div className={styles.identity}>
            <h1>{displayName}</h1>
            <p>{profile.email}</p>
            <div className={styles.badges}>
              <span className={styles.badge}>{accountType}</span>
              {cohort && <span className={`${styles.badge} ${styles.badgePlain}`}>{cohort}</span>}
            </div>
          </div>
          <div className={styles.actions}>
            <button type="button" onClick={signOut} className={styles.darkBtn}>Sign Out</button>
            <button type="button" onClick={signOutEverywhere} disabled={busy} className={styles.lineBtn}>
              {busy ? "Signing Out..." : "Sign Out of All Devices"}
            </button>
          </div>
        </header>

        <dl className={styles.stats}>
          {stats.map((s) => (
            <div key={s.label}>
              <dd>{s.value}</dd>
              <dt>{s.label}</dt>
            </div>
          ))}
        </dl>

        <div className={styles.columns}>
          <section>
            <h2 className={styles.sectionTitle}>Account Details</h2>
            <dl className={styles.detailList}>
              {details.map((d) => (
                <div key={d.label}>
                  <dt>{d.label}</dt>
                  <dd>{d.value}</dd>
                </div>
              ))}
            </dl>
            <p className={styles.note}>To change your name, email or password, contact your programme manager.</p>
          </section>

          <section>
            <h2 className={styles.sectionTitle}>My Courses</h2>
            {profile.enrolledPrograms.length === 0 ? (
              <p className={styles.muted}>You have not enrolled in a course yet.</p>
            ) : (
              <ul className={styles.courseList}>
                {profile.enrolledPrograms.map((p) => (
                  <li key={p.programId}>
                    <Link href={`/programs/${p.programId}/steps`} className={styles.course}>
                      <span className={styles.courseText}>
                        <strong>{p.programTitle}</strong>
                        <span>Cohort: {p.batchName}</span>
                      </span>
                      <span className={styles.courseProgress}>{p.progress ?? 0}%</span>
                      <span className={styles.open}>Open</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </article>
    </div>
  );
}
