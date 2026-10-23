"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dash from "../page.module.css";
import { courseImageFor } from "../lib/courseImage";
import styles from "./certificates.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface Enrolled {
  enrolmentId: string;
  programId: string;
  programTitle: string;
  batchName: string;
  progress: number;
}
interface Certificate {
  id: string;
  enrolmentId?: string;
  status?: string;
  issuedAt?: string | null;
  pdfUrl?: string | null;
}

const STEPS = [
  "Complete the modules in order. Each one closes with a short quiz.",
  "Attend the live sessions. Attendance is tracked.",
  "Pass the final exam, drawn from the full programme.",
  "Join the closing 1:1 call with Roweena.",
  "Request your certificate. It is issued once approved.",
];

/** Every enrolled course with its certificate status. */
export default function CertificatesPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<Enrolled[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  const loadCertificates = useCallback(async (isInitial = false) => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const [profile, certs] = await Promise.all([
        fetch(`${API_URL}/auth/me`, { headers }).then((res) => (res.ok ? res.json() : { enrolledPrograms: [] })),
        fetch(`${API_URL}/certificates/mine`, { headers }).then((res) => (res.ok ? res.json() : [])),
      ]);
      setCourses(profile.enrolledPrograms || []);
      setCertificates(Array.isArray(certs) ? certs : []);
    } catch {
      if (isInitial) setNotice("Could not reach the server. Please try again in a moment.");
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadCertificates(true);

    const onFocus = () => loadCertificates(false);
    const onVisibility = () => {
      if (document.visibilityState === "visible") loadCertificates(false);
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadCertificates]);

  const request = async (enrolmentId: string) => {
    setNotice("");
    try {
      const res = await fetch(`${API_URL}/certificates/request/${enrolmentId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (res.ok) {
        const created = await res.json().catch(() => null);
        setCertificates((list) => [...list, created ?? { id: enrolmentId, enrolmentId, status: "PENDING" }]);
        setNotice("Certificate requested. It is now waiting for approval.");
      } else {
        setNotice("The certificate could not be requested. You may have already requested it.");
      }
    } catch {
      setNotice("Could not reach the server. Please try again in a moment.");
    }
  };

  const issued = certificates.filter((c) => c.status === "APPROVED" || c.status === "ISSUED").length;
  const summary = [
    { label: "Courses", value: courses.length },
    { label: "Completed", value: courses.filter((c) => c.progress >= 100).length },
    { label: "Certificates Issued", value: issued },
  ];

  return (
    <div className={dash.dashboard}>
      <header className={dash.pageHeader}>
        <div>
          <h1 className={dash.pageTitle}>My Certificates</h1>
          <p className={dash.pageSubtitle}>Your verified credentials.</p>
        </div>
      </header>

      <div className={dash.board}>
        <div className={dash.boardMain}>
          <dl className={styles.summary}>
            {summary.map((item) => (
              <div key={item.label}>
                <dd>{loading ? "–" : item.value}</dd>
                <dt>{item.label}</dt>
              </div>
            ))}
          </dl>

          {notice && <p role="status" className={styles.notice}>{notice}</p>}

          <section className={`${dash.panel} ${dash.grow}`}>
            <div className={dash.panelHead}>
              <h2>Your Courses</h2>
            </div>
            {loading ? (
              <p className={dash.empty}>Loading your certificates...</p>
            ) : courses.length === 0 ? (
              <p className={dash.empty}>Enrol in a course and complete it to earn your first certificate.</p>
            ) : (
              <ul className={dash.list}>
                {courses.map((course) => {
                  const cert = certificates.find((c) => c.enrolmentId === course.enrolmentId);
                  const done = course.progress >= 100;
                  const isReady = cert?.status === "APPROVED" || cert?.status === "ISSUED";
                  const status = isReady ? "Issued" : cert ? "Awaiting approval" : done ? "Ready to request" : "In progress";
                  return (
                    <li key={course.programId} className={dash.course}>
                      <Image
                        src={courseImageFor(course.programTitle)}
                        alt=""
                        width={104}
                        height={72}
                        quality={80}
                        loading="lazy"
                        sizes="104px"
                        className={dash.thumb}
                      />
                      <div className={dash.rowMain}>
                        <p className={dash.rowTitle}>
                          {course.programTitle} <span className={`${dash.pill} ${status === "In progress" ? dash.pillOff : ""}`}>{status}</span>
                        </p>
                        <p className={dash.muted}>
                          {cert?.issuedAt ? `Issued ${new Date(cert.issuedAt).toLocaleDateString()}` : "In Progress"}
                        </p>
                        <div className={dash.progressLine}>
                          <div className={dash.progress} role="progressbar" aria-valuenow={course.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${course.programTitle} progress`}>
                            <span style={{ width: `${course.progress}%` }} />
                          </div>
                          <span>{course.progress}%</span>
                        </div>
                      </div>
                      {isReady ? (
                        <Link href={`/certificates/${cert.id}`} className={dash.darkBtn}>View Certificate</Link>
                      ) : cert ? null : done ? (
                        <button type="button" onClick={() => request(course.enrolmentId)} className={dash.darkBtn}>Request Certificate</button>
                      ) : (
                        <Link href={`/programs/${course.programId}/steps`} className={dash.secondaryBtn}>Continue</Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <aside className={dash.boardSide}>
          <section className={`${dash.panel} ${dash.grow}`}>
            <div className={dash.panelHead}>
              <h2>How Certification Works</h2>
            </div>
            <ol className={styles.steps}>
              {STEPS.map((step, i) => (
                <li key={step}>
                  <span>{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
