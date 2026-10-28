"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

interface StepItem {
  id: number;
  title: string;
  description: string;
  icon: "book" | "video" | "exam" | "call" | "certificate";
}

const STEPS: StepItem[] = [
  {
    id: 1,
    title: "Complete the modules in order.",
    description: "Each one closes with a short quiz.",
    icon: "book",
  },
  {
    id: 2,
    title: "Attend the live sessions.",
    description: "Attendance is tracked.",
    icon: "video",
  },
  {
    id: 3,
    title: "Pass the final exam.",
    description: "Drawn from the full programme.",
    icon: "exam",
  },
  {
    id: 4,
    title: "Join the closing 1:1 call.",
    description: "With Roweena.",
    icon: "call",
  },
  {
    id: 5,
    title: "Request your certificate.",
    description: "It is issued once approved.",
    icon: "certificate",
  },
];

/* -------------------------------------------------------------------------
   Crisp SVGs for UI Icons
   ------------------------------------------------------------------------- */
const Icons = {
  // Gold hero medal
  HeroMedal: () => (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="9" r="6" fill="#F59E0B" stroke="#D97706" strokeWidth="1.5" />
      <path
        d="M12 5.5l1.05 2.13 2.35.34-1.7 1.66.4 2.34L12 10.87l-2.1 1.1.4-2.34-1.7-1.66 2.35-.34L12 5.5z"
        fill="#FFFFFF"
      />
      <path d="M8.2 13.8L6.5 21l5.5-2.5 5.5 2.5-1.7-7.2" fill="#EA580C" />
      <path d="M12 18.5V14" stroke="#C2410C" strokeWidth="1" />
    </svg>
  ),

  // Summary: Open Book
  Book: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  ),

  // Summary: Circle Check
  CheckCircle: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="9 12 11.5 14.5 15.5 9.5" />
    </svg>
  ),

  // Summary: Award Ribbon Medal
  MedalRibbon: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="6" />
      <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
    </svg>
  ),

  // Course: Calendar icon
  Calendar: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),

  // Button: View Certificate
  AwardBtn: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="6" />
      <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
    </svg>
  ),

  // Button: Request Certificate
  SparkleBtn: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  ),

  // Step 2: Video
  Video: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  ),

  // Step 3: Exam
  FileExam: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),

  // Step 4: 1:1 call
  UserCall: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),

  // Step 5: Certificate
  CertificateStep: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="6" />
      <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
    </svg>
  ),
};

/* -------------------------------------------------------------------------
   Hero Banner Illustration: Certificate with Gold Ribbon & Leaves
   ------------------------------------------------------------------------- */
function HeroCertificateIllustration() {
  return (
    <svg
      width="220"
      height="96"
      viewBox="0 0 220 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="heroGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(150 48) rotate(90) scale(46 80)">
          <stop stopColor="#FDBA74" stopOpacity="0.45" />
          <stop offset="1" stopColor="#FDBA74" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="diplomaPaper" x1="0" y1="0" x2="100" y2="66" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#FFFDF9" />
        </linearGradient>
        <linearGradient id="goldMedal" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#FDE68A" />
          <stop offset="0.5" stopColor="#F59E0B" />
          <stop offset="1" stopColor="#D97706" />
        </linearGradient>
      </defs>

      {/* Ambient background glow */}
      <ellipse cx="150" cy="48" rx="72" ry="42" fill="url(#heroGlow)" />

      {/* Decorative Autumn Leaves & Sparkles */}
      {/* Left leaves */}
      <path d="M84 32C80 24 88 18 96 22C96 30 88 36 84 32Z" fill="#FB923C" opacity="0.8" />
      <path d="M72 48C70 40 78 36 86 42C84 50 76 54 72 48Z" fill="#FBBF24" opacity="0.85" />
      <path d="M78 64C82 72 74 78 68 74C68 66 74 60 78 64Z" fill="#FDBA74" opacity="0.75" />

      {/* Right leaves */}
      <path d="M198 34C204 28 212 34 208 42C200 42 196 36 198 34Z" fill="#FBBF24" opacity="0.85" />
      <path d="M202 56C210 52 214 60 210 68C202 66 200 58 202 56Z" fill="#FB923C" opacity="0.8" />

      {/* Twinkle sparkle stars */}
      <path d="M68 26Q72 26 72 22Q72 26 76 26Q72 26 72 30Q72 26 68 26Z" fill="#F59E0B" />
      <path d="M204 20Q207 20 207 17Q207 20 210 20Q207 20 207 23Q207 20 204 20Z" fill="#F59E0B" />
      <path d="M190 78Q193 78 193 75Q193 78 196 78Q193 78 193 81Q193 78 190 78Z" fill="#F59E0B" />

      {/* Angled Diploma Parchment */}
      <g transform="rotate(-6 142 48)">
        {/* Shadow */}
        <rect x="94" y="16" width="102" height="66" rx="8" fill="#1C1917" fillOpacity="0.06" transform="translate(0, 3)" />
        {/* Certificate body */}
        <rect x="94" y="16" width="102" height="66" rx="8" fill="url(#diplomaPaper)" stroke="#E8DFD3" strokeWidth="1.5" />
        {/* Inner border line */}
        <rect x="100" y="22" width="90" height="54" rx="5" fill="none" stroke="#FDE8D0" strokeWidth="1" />
        {/* Stylized document text lines */}
        <rect x="116" y="32" width="58" height="3" rx="1.5" fill="#E2D9CE" />
        <rect x="124" y="39" width="42" height="2.5" rx="1.25" fill="#EFE8E0" />
        <rect x="120" y="45" width="50" height="2.5" rx="1.25" fill="#EFE8E0" />

        {/* Certificate Ribbon Tails */}
        <path d="M141 58L137 76L143 73L147 76L145 58Z" fill="#EA580C" />
        <path d="M147 58L151 76L145 73L141 76L143 58Z" fill="#C2410C" opacity="0.85" />

        {/* Gold Medal Badge */}
        <circle cx="144" cy="54" r="11" fill="url(#goldMedal)" stroke="#F59E0B" strokeWidth="1" />
        <circle cx="144" cy="54" r="8" fill="none" stroke="#FEF3C7" strokeWidth="1" strokeDasharray="1.5 1.5" />
        <path
          d="M144 49.5l1 2 2.2.3-1.6 1.6.4 2.2-2-1.1-2 1.1.4-2.2-1.6-1.6 2.2-.3 1-2z"
          fill="#FFFFFF"
        />
      </g>
    </svg>
  );
}

/* -------------------------------------------------------------------------
   "How Certification Works" Card Illustration: Diploma + Graduation Cap
   ------------------------------------------------------------------------- */
function HowItWorksIllustration() {
  return (
    <svg
      width="240"
      height="120"
      viewBox="0 0 240 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="howGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(130 65) rotate(90) scale(55 95)">
          <stop stopColor="#FED7AA" stopOpacity="0.5" />
          <stop offset="1" stopColor="#FED7AA" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="diplomaGrad" x1="0" y1="0" x2="110" y2="72" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#FFFDF9" />
        </linearGradient>
        <linearGradient id="capGrad" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#334155" />
          <stop offset="0.6" stopColor="#1E293B" />
          <stop offset="1" stopColor="#0F172A" />
        </linearGradient>
      </defs>

      {/* Radial warm backdrop */}
      <ellipse cx="130" cy="65" rx="90" ry="45" fill="url(#howGlow)" />

      {/* Decorative Autumn Leaves (Purple, Amber, Orange) */}
      <path d="M42 58C36 48 46 42 56 48C56 58 46 64 42 58Z" fill="#C4B5FD" opacity="0.85" />
      <path d="M54 78C48 86 38 80 44 72C52 70 56 76 54 78Z" fill="#FB923C" opacity="0.8" />
      <path d="M62 36C68 28 78 34 74 42C66 44 62 38 62 36Z" fill="#FBBF24" opacity="0.85" />

      <path d="M206 52C214 46 220 54 214 62C206 60 204 54 206 52Z" fill="#FB923C" opacity="0.8" />
      <path d="M198 74C204 82 196 90 188 84C190 76 196 72 198 74Z" fill="#FBBF24" opacity="0.85" />
      <path d="M182 92C188 100 178 106 172 100C174 92 180 88 182 92Z" fill="#C4B5FD" opacity="0.75" />

      {/* Twinkle sparkle stars */}
      <path d="M52 24Q56 24 56 20Q56 24 60 24Q56 24 56 28Q56 24 52 24Z" fill="#F59E0B" />
      <path d="M212 32Q215 32 215 29Q215 32 218 32Q215 32 215 35Q215 32 212 32Z" fill="#F59E0B" />
      <path d="M78 96Q81 96 81 93Q81 96 84 96Q81 96 81 99Q81 96 78 96Z" fill="#F59E0B" />

      {/* Angled Diploma Parchment (Underneath) */}
      <g transform="rotate(-4 125 68)">
        {/* Drop shadow */}
        <rect x="70" y="32" width="115" height="74" rx="8" fill="#1C1917" fillOpacity="0.05" transform="translate(0, 4)" />
        {/* Parchment body */}
        <rect x="70" y="32" width="115" height="74" rx="8" fill="url(#diplomaGrad)" stroke="#E8DFD3" strokeWidth="1.5" />
        <rect x="76" y="38" width="103" height="62" rx="5" fill="none" stroke="#FDE8D0" strokeWidth="1" />

        {/* Text lines */}
        <rect x="88" y="48" width="60" height="3" rx="1.5" fill="#E2D9CE" />
        <rect x="88" y="55" width="46" height="2.5" rx="1.25" fill="#EFE8E0" />
        <rect x="88" y="61" width="52" height="2.5" rx="1.25" fill="#EFE8E0" />

        {/* Gold seal with ribbon tails */}
        <path d="M104 74L100 92L106 89L111 92L108 74Z" fill="#EA580C" />
        <path d="M110 74L115 92L109 89L105 92L107 74Z" fill="#C2410C" opacity="0.85" />
        <circle cx="106" cy="72" r="11" fill="url(#goldMedal)" stroke="#F59E0B" strokeWidth="1" />
        <circle cx="106" cy="72" r="8" fill="none" stroke="#FEF3C7" strokeWidth="1" strokeDasharray="1.5 1.5" />
        <path
          d="M106 67.5l1 2 2.2.3-1.6 1.6.4 2.2-2-1.1-2 1.1.4-2.2-1.6-1.6 2.2-.3 1-2z"
          fill="#FFFFFF"
        />
      </g>

      {/* Graduation Mortarboard Cap (Resting diagonally on the right) */}
      <g transform="rotate(10 162 44)">
        {/* Cap skull base */}
        <ellipse cx="162" cy="46" rx="20" ry="11" fill="#0F172A" />
        <ellipse cx="162" cy="44" rx="19" ry="10" fill="#1E293B" />

        {/* Diamond top */}
        <polygon points="162 18, 198 32, 162 46, 126 32" fill="url(#capGrad)" stroke="#0F172A" strokeWidth="1.2" />
        {/* Top bevel highlight */}
        <polygon points="162 18, 198 32, 162 34, 126 32" fill="#475569" opacity="0.4" />

        {/* Center button */}
        <circle cx="162" cy="32" r="3.5" fill="#F59E0B" stroke="#D97706" strokeWidth="0.8" />

        {/* Tassel cord & brush */}
        <path
          d="M162 32Q184 34 192 48Q195 56 193 64"
          stroke="#F59E0B"
          strokeWidth="2.2"
          fill="none"
          strokeLinecap="round"
        />
        {/* Tassel brush */}
        <polygon points="193 64, 190 76, 196 76" fill="#D97706" />
        <rect x="190.5" y="63" width="5" height="2" rx="1" fill="#B45309" />
      </g>
    </svg>
  );
}

/**
 * Recreated & Polished "My Certificates" Page
 * Visual fidelity matching the reference screenshot:
 * 1. Warm Hero Banner with Gold Medal & Certificate illustration
 * 2. Row of 3 Summary Cards (Courses, Completed, Certificates Issued)
 * 3. "Your Courses" Card with progress bar, status pills & orange action buttons
 * 4. "How Certification Works" Card with 5 stepper steps & graduation cap illustration
 */
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
  const completed = courses.filter((c) => c.progress >= 100).length;

  const summary = [
    {
      label: "Courses",
      subtext: "Total enrolled courses",
      value: courses.length,
      iconType: "courses",
      icon: <Icons.Book />,
    },
    {
      label: "Completed",
      subtext: "Courses completed",
      value: completed,
      iconType: "completed",
      icon: <Icons.CheckCircle />,
    },
    {
      label: "Certificates Issued",
      subtext: "Total certificates earned",
      value: issued,
      iconType: "issued",
      icon: <Icons.MedalRibbon />,
    },
  ];

  return (
    <div className={styles.container}>
      {/* 1. TOP HERO BANNER */}
      <section className={styles.heroBanner} aria-label="Certificates Overview">
        <div className={styles.heroLeft}>
          <div className={styles.heroMedalBadge}>
            <Icons.HeroMedal />
          </div>
          <div className={styles.heroTextGroup}>
            <h1 className={styles.heroTitle}>My Certificates</h1>
            <p className={styles.heroSubtitle}>
              Track your progress, earn certificates, and showcase your achievements.
            </p>
          </div>
        </div>

        <div className={styles.heroIllustrationWrap}>
          <HeroCertificateIllustration />
        </div>
      </section>

      {/* 2. MAIN TWO-COLUMN LAYOUT */}
      <div className={styles.mainGrid}>
        {/* LEFT COLUMN: Summary Cards + Your Courses */}
        <div className={styles.leftCol}>
          {/* Summary Cards */}
          <div className={styles.summaryRow} aria-label="Certificate Statistics">
            {summary.map((item) => {
              const iconWrapClass =
                item.iconType === "courses"
                  ? styles.summaryIconCourses
                  : item.iconType === "completed"
                  ? styles.summaryIconCompleted
                  : styles.summaryIconIssued;

              return (
                <div key={item.label} className={styles.summaryCard}>
                  <div className={`${styles.summaryIconWrap} ${iconWrapClass}`}>
                    {item.icon}
                  </div>
                  <div className={styles.summaryContent}>
                    <span className={styles.summaryValue}>
                      {loading ? "–" : item.value}
                    </span>
                    <span className={styles.summaryLabel}>{item.label}</span>
                    <span className={styles.summarySubtext}>{item.subtext}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* User Feedback Notice Banner */}
          {notice && (
            <div role="status" className={styles.noticeBanner}>
              <span>{notice}</span>
              <button
                type="button"
                className={styles.noticeDismissBtn}
                onClick={() => setNotice("")}
                aria-label="Dismiss notice"
              >
                ✕
              </button>
            </div>
          )}

          {/* Your Courses Card */}
          <section className={styles.coursesCard} aria-labelledby="your-courses-heading">
            <div className={styles.cardHeader}>
              <h2 id="your-courses-heading" className={styles.cardTitle}>
                Your Courses
              </h2>
              <p className={styles.cardSubtitle}>
                Complete courses and get certified. Track your certificate status below.
              </p>
            </div>

            {loading ? (
              <ul className={styles.coursesList} aria-hidden="true">
                {[1, 2, 3].map((i) => (
                  <li key={i} className={styles.courseItem} style={{ pointerEvents: "none" }}>
                    <div
                      className="skeleton"
                      style={{ width: 104, height: 68, borderRadius: 10, flexShrink: 0 }}
                    />
                    <div className={styles.courseMain}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <div className="skeleton" style={{ width: "42%", height: 18, borderRadius: 4 }} />
                        <div className="skeleton" style={{ width: 80, height: 22, borderRadius: 999 }} />
                      </div>
                      <div className="skeleton" style={{ width: "35%", height: 12, borderRadius: 4, marginBottom: 8 }} />
                      <div className="skeleton" style={{ width: "100%", height: 8, borderRadius: 999 }} />
                    </div>
                    <div className={styles.courseAction}>
                      <div className="skeleton" style={{ width: 140, height: 38, borderRadius: 12 }} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : courses.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIconWrap}>
                  <Icons.HeroMedal />
                </div>
                <h3 className={styles.emptyTitle}>No courses enrolled yet</h3>
                <p className={styles.emptyDesc}>
                  Enrol in a certified programme to start learning, complete modules, and earn official certificates.
                </p>
                <Link href="/courses" className={styles.emptyBtn}>
                  Browse Programmes
                </Link>
              </div>
            ) : (
              <ul className={styles.coursesList}>
                {courses.map((course) => {
                  const cert = certificates.find((c) => c.enrolmentId === course.enrolmentId);
                  const done = course.progress >= 100;
                  const isReady = cert?.status === "APPROVED" || cert?.status === "ISSUED";
                  const isAwaiting = cert && !isReady;

                  return (
                    <li key={course.programId} className={styles.courseItem}>
                      {/* Course Thumbnail */}
                      <div className={styles.courseThumbWrap}>
                        <Image
                          src={courseImageFor(course.programTitle)}
                          alt={course.programTitle}
                          width={104}
                          height={68}
                          quality={85}
                          loading="lazy"
                          className={styles.courseThumb}
                        />
                      </div>

                      {/* Main Details */}
                      <div className={styles.courseMain}>
                        <div className={styles.courseTitleRow}>
                          <h3 className={styles.courseTitle}>{course.programTitle}</h3>

                          {/* Status Badge */}
                          {isReady ? (
                            <span className={styles.badgeIssued}>
                              <span className={styles.badgeDotGreen} aria-hidden="true" />
                              Issued
                            </span>
                          ) : done ? (
                            <span className={styles.badgeReady}>
                              <span className={styles.badgeDotGreen} aria-hidden="true" />
                              Ready to request
                            </span>
                          ) : isAwaiting ? (
                            <span className={styles.badgeAwaiting}>
                              <span className={styles.badgeDotAmber} aria-hidden="true" />
                              Awaiting approval
                            </span>
                          ) : (
                            <span className={styles.badgeProgress}>
                              <span className={styles.badgeDotSlate} aria-hidden="true" />
                              In progress
                            </span>
                          )}
                        </div>

                        {/* Date / Status Meta with Calendar Icon */}
                        <p className={styles.courseMeta}>
                          <Icons.Calendar />
                          <span>
                            {cert?.issuedAt
                              ? `Issued ${new Date(cert.issuedAt).toLocaleDateString("en-US")}`
                              : isAwaiting
                              ? "Awaiting staff review & issuance"
                              : done
                              ? "Completed · Ready for Certificate"
                              : "In Progress"}
                          </span>
                        </p>

                        {/* Progress Bar & Percentage */}
                        <div className={styles.courseProgressRow}>
                          <div
                            className={styles.progressBar}
                            role="progressbar"
                            aria-valuenow={course.progress}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`${course.programTitle} progress`}
                          >
                            <div
                              className={styles.progressFill}
                              style={{ width: `${Math.min(100, Math.max(0, course.progress))}%` }}
                            />
                          </div>
                          <span className={styles.progressPercent}>{course.progress}%</span>
                        </div>
                      </div>

                      {/* Action Button */}
                      <div className={styles.courseAction}>
                        {isReady ? (
                          <Link href={`/certificates/${cert.id}`} className={styles.actionBtnView}>
                            <Icons.AwardBtn />
                            <span>View Certificate</span>
                          </Link>
                        ) : done && !cert ? (
                          <button
                            type="button"
                            onClick={() => request(course.enrolmentId)}
                            className={styles.actionBtnRequest}
                          >
                            <Icons.SparkleBtn />
                            <span>Request Certificate</span>
                          </button>
                        ) : isAwaiting ? (
                          <span className={styles.actionBtnPending}>
                            <span>Pending Staff Approval</span>
                          </span>
                        ) : (
                          <Link
                            href={`/programs/${course.programId}/steps`}
                            className={styles.actionBtnContinue}
                          >
                            <span>Continue Course</span>
                            <span>&rarr;</span>
                          </Link>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* RIGHT COLUMN: How Certification Works */}
        <aside className={styles.rightCol} aria-labelledby="how-it-works-heading">
          <section className={styles.howCard}>
            <div>
              <div className={styles.howHeader}>
                <h2 id="how-it-works-heading" className={styles.howTitle}>
                  How Certification Works
                </h2>
                <p className={styles.howSubtitle}>
                  Follow these simple steps to earn your certificate.
                </p>
              </div>

              {/* Numbered Steps with Vertical Stepper Line */}
              <ol className={styles.stepsList}>
                <div className={styles.stepConnector} aria-hidden="true" />
                {STEPS.map((step) => {
                  let stepIcon = <Icons.Book />;
                  if (step.icon === "video") stepIcon = <Icons.Video />;
                  else if (step.icon === "exam") stepIcon = <Icons.FileExam />;
                  else if (step.icon === "call") stepIcon = <Icons.UserCall />;
                  else if (step.icon === "certificate") stepIcon = <Icons.CertificateStep />;

                  return (
                    <li key={step.id} className={styles.stepItem}>
                      <span className={styles.stepNum}>{step.id}</span>
                      <div className={styles.stepIconBox} aria-hidden="true">
                        {stepIcon}
                      </div>
                      <div className={styles.stepText}>
                        <h3 className={styles.stepTitle}>{step.title}</h3>
                        <p className={styles.stepDesc}>{step.description}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>

            {/* Decorative Graduation Illustration at Bottom of How It Works */}
            <div className={styles.howIllustrationContainer}>
              <HowItWorksIllustration />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
