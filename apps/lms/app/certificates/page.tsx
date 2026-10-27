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

const ArrowLeft = (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

const AwardIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="8" r="6" />
    <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
  </svg>
);

const SparkleIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
  </svg>
);

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
      <header className={styles.header}>
        <Link href="/" className={styles.backLink} title="Back to Dashboard">
          <span className={styles.backIconWrap}>{ArrowLeft}</span>
          <span className={styles.backText}>Back</span>
        </Link>
        <span className={styles.headerDivider} aria-hidden="true" />
        <div className={styles.headerTitleGroup}>
          <h1 className={styles.title}>My Certificates</h1>
          <span className={styles.headerBadge}>
            <span className={styles.headerBadgeDot} aria-hidden="true" />
            Verified Credentials & Proof of Completion
          </span>
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
              <ul className={dash.list} aria-hidden="true">
                {[1, 2, 3].map((i) => (
                  <li key={i} className={dash.course} style={{ pointerEvents: "none" }}>
                    <div
                      className="skeleton"
                      style={{ width: 104, height: 68, borderRadius: 8, flexShrink: 0 }}
                    />
                    <div className={dash.rowMain}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 8,
                        }}
                      >
                        <div className="skeleton" style={{ width: "45%", height: 18, borderRadius: 4 }} />
                        <div className="skeleton" style={{ width: 75, height: 20, borderRadius: 999 }} />
                      </div>
                      <div
                        className="skeleton"
                        style={{ width: "100%", height: 6, borderRadius: 999, marginBottom: 12 }}
                      />
                      <div
                        className="skeleton"
                        style={{ width: 120, height: 32, borderRadius: 8, marginLeft: "auto" }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
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
                          <span>{course.programTitle}</span>
                          <span className={`${dash.pill} ${status === "In progress" ? dash.pillOff : ""}`}>{status}</span>
                        </p>
                        <p className={dash.muted}>
                          {cert?.issuedAt
                            ? `Issued ${new Date(cert.issuedAt).toLocaleDateString()}`
                            : cert
                            ? "Awaiting staff review & issuance"
                            : done
                            ? "Completed · Ready for Certificate"
                            : "In Progress"}
                        </p>
                        <div className={dash.progressLine}>
                          <div className={dash.progress} role="progressbar" aria-valuenow={course.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${course.programTitle} progress`}>
                            <span style={{ width: `${course.progress}%` }} />
                          </div>
                          <span>{course.progress}%</span>
                        </div>
                      </div>
                      {isReady ? (
                        <Link href={`/certificates/${cert.id}`} className={styles.certBtnView}>
                          <AwardIcon />
                          <span>View Certificate</span>
                        </Link>
                      ) : cert ? null : done ? (
                        <button type="button" onClick={() => request(course.enrolmentId)} className={styles.certBtnRequest}>
                          <SparkleIcon />
                          <span>Request Certificate</span>
                        </button>
                      ) : (
                        <Link href={`/programs/${course.programId}/steps`} className={styles.certBtnContinue}>
                          <span>Continue Course</span>
                          <span>&rarr;</span>
                        </Link>
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
