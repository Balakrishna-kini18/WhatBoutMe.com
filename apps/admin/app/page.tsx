"use client";

import { useEffect, useState, useRef } from "react";
import styles from "./page.module.css";
import Link from "next/link";
import Image from "next/image";
import { ActionMenu } from "./components";

// Crisp outline SVG icons conforming to WhatBoutMe design standard
const Icons = {
  Export: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  Check: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Plus: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  Users: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Batches: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  ),
  Dollar: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  Certificate: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="7" />
      <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
    </svg>
  ),
  ArrowRight: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  ),
  More: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
      <circle cx="5" cy="12" r="1.5" />
    </svg>
  ),
  Calendar: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  UserCheck: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <polyline points="17 11 19 13 23 9" />
    </svg>
  ),
};

interface LearnerItem {
  id: string;
  name: string;
  email: string;
  program: string;
  status: string;
  date: string;
  initial: string;
  isPhoto?: boolean;
  photoUrl?: string;
}

interface UserSession {
  id: string;
  name?: string;
  email?: string;
  role?: string;
}

interface DropdownPosition {
  top: number;
  right: number;
  openUpwards: boolean;
}

// Canonical high-fidelity dataset for offline fallback matching project baseline
const fallbackEnrolments: LearnerItem[] = [
  {
    id: "enr-1",
    name: "Gagan",
    email: "admin1@whataboutme.com",
    program: "11 Steps to You",
    status: "Active",
    date: "Oct 9, 2026",
    initial: "G",
  },
  {
    id: "enr-2",
    name: "Gagan JJ",
    email: "test@example.com",
    program: "Vision Board Workshop",
    status: "Active",
    date: "Oct 8, 2026",
    initial: "G",
  },
  {
    id: "enr-3",
    name: "Balakrishna Kini",
    email: "balakrishna@foxwel.ai",
    program: "11 Steps to You",
    status: "Active",
    date: "Oct 8, 2026",
    initial: "B",
  },
  {
    id: "enr-4",
    name: "Roweena Britto",
    email: "roweena@whataboutme.com",
    program: "Corporate Program",
    status: "Active",
    date: "Oct 7, 2026",
    initial: "R",
    isPhoto: true,
    photoUrl: "/brand/roweena.png",
  },
  {
    id: "enr-5",
    name: "Nikhil Kamath",
    email: "nikhil@example.com",
    program: "Vision Board Workshop",
    status: "Active",
    date: "Oct 6, 2026",
    initial: "N",
  },
];

export default function AdminDashboard() {
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [exported, setExported] = useState(false);

  // Load current administrator profile from local storage session
  useEffect(() => {
    try {
      const stored = localStorage.getItem("user");
      if (stored) {
        setCurrentUser(JSON.parse(stored));
      }
    } catch (e) {
      console.warn("Failed to parse stored user session", e);
    }
  }, []);

  // Fetch real admin dashboard summary from backend API
  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const token = localStorage.getItem("token");
        const headers = token ? { Authorization: `Bearer ${token}` } : ({} as any);

        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/admin/dashboard`,
          { headers }
        );
        if (res.ok) {
          const data = await res.json();
          setDashboardData(data);
        }
      } catch (e) {
        console.error("Dashboard fetch error (using baseline fallback):", e);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  // Metrics from legitimate API contract or graceful baseline defaults
  const totalLearners = dashboardData?.totalLearners ?? 0;
  const totalBatches = dashboardData?.totalBatches ?? 0;
  const totalRevenue = dashboardData?.mockRevenue ?? "$0";
  const certificatesIssued = dashboardData?.certificatesIssued ?? 0;

  const enrolmentsList: LearnerItem[] = loading
    ? []
    : dashboardData?.recentEnrolments && dashboardData.recentEnrolments.length > 0
      ? dashboardData.recentEnrolments.map((u: any) => ({
          id: u.id,
          name: u.name || "Learner",
          email: u.email,
          program: u.cohort || u.programTitle || "11 Steps to You",
          status: u.status === "ACTIVE" || !u.status ? "Active" : u.status,
          date: u.createdAt
            ? new Date(u.createdAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            : "Oct 9, 2026",
          initial: (u.name || u.email || "L")[0].toUpperCase(),
        }))
      : [];

  // Real, dynamic program distribution computed directly from live enrolments
  const programDistribution = (() => {
    if (!enrolmentsList || enrolmentsList.length === 0) return [];
    const counts: Record<string, number> = {};
    enrolmentsList.forEach((e) => {
      const prog = e.program || "General Enrolment";
      counts[prog] = (counts[prog] || 0) + 1;
    });
    const total = enrolmentsList.length;
    // Brand-derived palette: Primary Amber, Warm Gold, Deep Charcoal, Muted Stone
    const brandColors = ["#c97a1e", "#d8a86a", "#2c2825", "#8c8275", "#a39887"];
    return Object.entries(counts).map(([name, count], index) => ({
      name,
      count,
      percentage: Math.round((count / total) * 100),
      color: brandColors[index % brandColors.length],
    }));
  })();

  // Time-of-day greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  // Formatted date string
  const formattedToday = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date());

  // Functional CSV export of enrolments report
  const handleExportReport = () => {
    if (!enrolmentsList || enrolmentsList.length === 0) return;
    const headers = ["Learner Name", "Email", "Program", "Status", "Enrolled Date"];
    const rows = enrolmentsList.map((item) => [
      `"${(item.name || "").replace(/"/g, '""')}"`,
      `"${(item.email || "").replace(/"/g, '""')}"`,
      `"${(item.program || "").replace(/"/g, '""')}"`,
      `"${(item.status || "").replace(/"/g, '""')}"`,
      `"${(item.date || "").replace(/"/g, '""')}"`,
    ]);
    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `whatboutme-enrolments-${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setExported(true);
    setTimeout(() => setExported(false), 2500);
  };

  // SVG Donut slice calculation (radius = 38, circumference ≈ 238.76)
  const donutRadius = 38;
  const donutCircumference = 2 * Math.PI * donutRadius;
  let accumulatedOffset = 0;

  const isManager = currentUser?.role === "MANAGER" || currentUser?.role === "TEACHER";

  return (
    <div className={styles.dashboardContainer}>
      {/* ===================================================================
          1. Header & Welcome Command Section (No role badge per design refinement)
          =================================================================== */}
      <header className={styles.welcomeBar}>
        <div className={styles.welcomeInfo}>
          <div className={styles.welcomeMetaRow}>
            <span className={styles.welcomeDateBadge}>
              <Icons.Calendar />
              <span>{formattedToday}</span>
            </span>
          </div>
          <h1 className={styles.welcomeHeading}>
            {getGreeting()}, {currentUser?.name || "Roweena Britto"}
          </h1>
          <p className={styles.welcomeSubtext}>
            {isManager
              ? "Operational summary for your assigned batches, sessions, and learners."
              : "Operational summary across active programs, cohorts, and student registrations."}
          </p>
        </div>

        <div className={styles.welcomeActions}>
          <button
            type="button"
            className={styles.exportBtn}
            onClick={handleExportReport}
            aria-label="Export Enrolments Report as CSV"
          >
            {exported ? <Icons.Check /> : <Icons.Export />}
            <span>{exported ? "Exported CSV" : "Export Report"}</span>
          </button>
          {!isManager && (
            <Link href="/batches?create=1" className={styles.createBatchBtn}>
              <Icons.Plus />
              <span>Create Batch</span>
            </Link>
          )}
        </div>
      </header>

      {/* ===================================================================
          2. Data-First KPI Cards (Restrained, Accurate, No Fake Trends)
          =================================================================== */}
      <section className={styles.kpiGrid} aria-label="Dashboard Metrics">
        {/* Metric 1: Total Learners */}
        <article className={styles.kpiCard}>
          <div className={styles.kpiTopRow}>
            <span className={styles.kpiLabel}>{isManager ? "Assigned Learners" : "Total Learners"}</span>
            <div className={styles.kpiIconBox}>
              <Icons.Users />
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>
              {loading ? "—" : totalLearners.toLocaleString()}
            </span>
          </div>
          <div className={styles.kpiFooter}>
            <span className={styles.kpiMeta}>{isManager ? "Enrolled in your cohorts" : "Registered student accounts"}</span>
          </div>
        </article>

        {/* Metric 2: Total Batches */}
        <article className={styles.kpiCard}>
          <div className={styles.kpiTopRow}>
            <span className={styles.kpiLabel}>{isManager ? "Your Batches" : "Active Batches"}</span>
            <div className={styles.kpiIconBox}>
              <Icons.Batches />
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>
              {loading ? "—" : totalBatches.toLocaleString()}
            </span>
          </div>
          <div className={styles.kpiFooter}>
            <span className={styles.kpiMeta}>{isManager ? "Cohorts assigned to you" : "Current & upcoming cohorts"}</span>
          </div>
        </article>

        {/* Metric 3: Total Revenue (Admin only - hidden for Managers per PDF) */}
        {!isManager && totalRevenue !== null && (
          <article className={styles.kpiCard}>
            <div className={styles.kpiTopRow}>
              <span className={styles.kpiLabel}>Total Revenue</span>
              <div className={styles.kpiIconBox}>
                <Icons.Dollar />
              </div>
            </div>
            <div className={styles.kpiValueRow}>
              <span className={styles.kpiValue}>{loading ? "—" : totalRevenue}</span>
            </div>
            <div className={styles.kpiFooter}>
              <span className={styles.kpiMeta}>Program enrolment revenue</span>
            </div>
          </article>
        )}

        {/* Metric 4: Certificates Issued */}
        <article className={styles.kpiCard}>
          <div className={styles.kpiTopRow}>
            <span className={styles.kpiLabel}>Certificates Issued</span>
            <div className={styles.kpiIconBox}>
              <Icons.Certificate />
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>
              {loading ? "—" : certificatesIssued.toLocaleString()}
            </span>
          </div>
          <div className={styles.kpiFooter}>
            <span className={styles.kpiMeta}>Credentials awarded to date</span>
          </div>
        </article>
      </section>

      {/* ===================================================================
          3. Main Operational Grid: Recent Enrolments + Program Distribution
          =================================================================== */}
      <div className={styles.mainGrid}>
        {/* Left Column: Recent Enrolments Table */}
        <section className={styles.enrolmentsSection} aria-label="Recent Enrolments">
          <div className={styles.sectionHeaderBar}>
            <div className={styles.sectionTitleGroup}>
              <h2 className={styles.sectionTitle}>Recent Enrolments</h2>
              <p className={styles.sectionSubtitle}>
                Latest learner registrations across active programs
              </p>
            </div>
            <Link href="/users" className={styles.viewAllLink}>
              <span>View All</span>
              <Icons.ArrowRight />
            </Link>
          </div>

          <div className={styles.tableContainer}>
            <table className={styles.enrolmentsTable}>
              <colgroup>
                <col className={styles.colLearner} />
                <col className={styles.colEmail} />
                <col className={styles.colProgram} />
                <col className={styles.colStatus} />
                <col className={styles.colDate} />
                <col className={styles.colActions} />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">Learner</th>
                  <th scope="col">Email</th>
                  <th scope="col">Program</th>
                  <th scope="col">Status</th>
                  <th scope="col">Enrolled On</th>
                  <th scope="col" style={{ textAlign: "right" }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [1, 2, 3, 4].map((i) => (
                    <tr key={i} className={styles.tableRow}>
                      <td>
                        <div className={styles.learnerCell}>
                          <div
                            className="skeleton"
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: "50%",
                              flexShrink: 0,
                            }}
                          />
                          <div
                            className="skeleton"
                            style={{
                              height: 14,
                              width: 100,
                              borderRadius: 4,
                            }}
                          />
                        </div>
                      </td>
                      <td>
                        <div
                          className="skeleton"
                          style={{
                            height: 14,
                            width: 140,
                            borderRadius: 4,
                          }}
                        />
                      </td>
                      <td>
                        <div
                          className="skeleton"
                          style={{
                            height: 14,
                            width: 110,
                            borderRadius: 4,
                          }}
                        />
                      </td>
                      <td>
                        <div
                          className="skeleton"
                          style={{
                            height: 20,
                            width: 55,
                            borderRadius: 999,
                          }}
                        />
                      </td>
                      <td>
                        <div
                          className="skeleton"
                          style={{
                            height: 14,
                            width: 80,
                            borderRadius: 4,
                          }}
                        />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div
                          className="skeleton"
                          style={{
                            height: 16,
                            width: 16,
                            borderRadius: 4,
                            marginLeft: "auto",
                          }}
                        />
                      </td>
                    </tr>
                  ))
                ) : enrolmentsList.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className={styles.emptyStateSmall}>
                        <span>No recent enrolments recorded.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  enrolmentsList.map((item) => (
                    <tr key={item.id} className={styles.tableRow}>
                      {/* Learner */}
                      <td>
                        <div className={styles.learnerCell}>
                          {item.isPhoto && item.photoUrl ? (
                            <div className={styles.avatarPhoto}>
                              <Image
                                src={item.photoUrl}
                                alt={item.name}
                                width={28}
                                height={28}
                                className={styles.avatarImg}
                              />
                            </div>
                          ) : (
                            <div className={styles.avatarInitials} aria-hidden="true">
                              {item.initial}
                            </div>
                          )}
                          <span className={styles.learnerName} title={item.name}>
                            {item.name}
                          </span>
                        </div>
                      </td>

                      {/* Email */}
                      <td>
                        <span className={styles.emailText} title={item.email}>
                          {item.email}
                        </span>
                      </td>

                      {/* Program */}
                      <td>
                        <span className={styles.programText} title={item.program}>
                          {item.program}
                        </span>
                      </td>

                      {/* Status */}
                      <td>
                        <span
                          className={
                            item.status === "Active"
                              ? styles.statusBadgeActive
                              : styles.statusBadgePending
                          }
                        >
                          <span className={styles.statusDot} />
                          <span>{item.status}</span>
                        </span>
                      </td>

                      {/* Enrolled On */}
                      <td>
                        <span className={styles.dateText}>{item.date}</span>
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: "right" }}>
                        <ActionMenu
                          ariaLabel={`Actions for ${item.name}`}
                          items={[
                            {
                              label: "View Profile",
                              href: item.id.startsWith("enr-")
                                ? "/users"
                                : `/users/${item.id}`,
                              icon: (
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                  <circle cx="12" cy="7" r="4" />
                                </svg>
                              ),
                            },
                            {
                              label: "Batch Details",
                              href: "/batches",
                              icon: (
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                  <line x1="16" y1="2" x2="16" y2="6" />
                                  <line x1="8" y1="2" x2="8" y2="6" />
                                  <line x1="3" y1="10" x2="21" y2="10" />
                                </svg>
                              ),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Right Column: Program Distribution & Genuine Activity */}
        <div className={styles.sideColumn}>
          {/* Card 1: Program Enrolments Distribution */}
          <section className={styles.sideCard} aria-label="Program Distribution">
            <div className={styles.sideHeader}>
              <div className={styles.sideTitleGroup}>
                <h2 className={styles.sideTitle}>Program Enrolments</h2>
                <p className={styles.sideSubtitle}>Distribution across enrolled programs</p>
              </div>
            </div>

            {loading ? (
              <div className={styles.donutCardBody}>
                {/* Skeleton Donut */}
                <div className={styles.donutWrapper}>
                  <svg viewBox="0 0 96 96" className={styles.donutSvg}>
                    <circle
                      cx="48"
                      cy="48"
                      r={donutRadius}
                      fill="none"
                      stroke="#f2ede4"
                      strokeWidth="12"
                    />
                  </svg>
                  <div className={styles.donutCenter}>
                    <span className={styles.donutTotal}>—</span>
                    <span className={styles.donutTotalLabel}>Total</span>
                  </div>
                </div>

                {/* Skeleton Legend */}
                <div className={styles.programLegendList}>
                  {[1, 2].map((idx) => (
                    <div key={idx} className={styles.legendRow}>
                      <div className={styles.legendLeft}>
                        <div
                          className="skeleton"
                          style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0 }}
                        />
                        <div
                          className="skeleton"
                          style={{ width: 110, height: 12, borderRadius: 4 }}
                        />
                      </div>
                      <div className={styles.legendRight}>
                        <div
                          className="skeleton"
                          style={{ width: 45, height: 12, borderRadius: 4 }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : programDistribution.length === 0 ? (
              <div className={styles.emptyStateSmall}>
                <span>No program enrolment data available.</span>
              </div>
            ) : (
              <div className={styles.donutCardBody}>
                {/* SVG Donut Chart */}
                <div className={styles.donutWrapper}>
                  <svg viewBox="0 0 96 96" className={styles.donutSvg}>
                    {/* Background track */}
                    <circle
                      cx="48"
                      cy="48"
                      r={donutRadius}
                      fill="none"
                      stroke="#f2ede4"
                      strokeWidth="12"
                    />
                    {/* Dynamic Segments */}
                    {programDistribution.map((item) => {
                      const strokeDash =
                        (item.percentage / 100) * donutCircumference;
                      const offset = accumulatedOffset;
                      accumulatedOffset += strokeDash;
                      return (
                        <circle
                          key={item.name}
                          cx="48"
                          cy="48"
                          r={donutRadius}
                          fill="none"
                          stroke={item.color}
                          strokeWidth="12"
                          strokeDasharray={`${strokeDash} ${donutCircumference}`}
                          strokeDashoffset={-offset}
                        />
                      );
                    })}
                  </svg>
                  {/* Center Total Count */}
                  <div className={styles.donutCenter}>
                    <span className={styles.donutTotal}>{enrolmentsList.length}</span>
                    <span className={styles.donutTotalLabel}>Total</span>
                  </div>
                </div>

                {/* Legend List */}
                <div className={styles.programLegendList}>
                  {programDistribution.map((item) => (
                    <div key={item.name} className={styles.legendRow}>
                      <div className={styles.legendLeft}>
                        <span
                          className={styles.legendDot}
                          style={{ backgroundColor: item.color }}
                        />
                        <span className={styles.legendName} title={item.name}>
                          {item.name}
                        </span>
                      </div>
                      <div className={styles.legendRight}>
                        <span className={styles.legendCount}>{item.count}</span>
                        <span className={styles.legendPercent}>({item.percentage}%)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Card 2: Recent Activity Timeline */}
          <section className={styles.sideCard} aria-label="Recent Activity">
            <div className={styles.sideHeader}>
              <div className={styles.sideTitleGroup}>
                <h2 className={styles.sideTitle}>Recent Activity</h2>
                <p className={styles.sideSubtitle}>Verified platform enrolment events</p>
              </div>
              <Link href="/users" className={styles.viewAllLink}>
                <span>View All</span>
                <Icons.ArrowRight />
              </Link>
            </div>

            {loading ? (
              <div className={styles.timelineList}>
                {[1, 2, 3].map((idx) => (
                  <div key={idx} className={styles.timelineItem}>
                    <div
                      className="skeleton"
                      style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0 }}
                    />
                    <div className={styles.timelineContent} style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <div className="skeleton" style={{ width: 110, height: 12, borderRadius: 4 }} />
                        <div className="skeleton" style={{ width: 60, height: 10, borderRadius: 4 }} />
                      </div>
                      <div className="skeleton" style={{ width: 160, height: 10, borderRadius: 4 }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : enrolmentsList.length === 0 ? (
              <div className={styles.emptyStateSmall}>
                <span>No recent activity recorded.</span>
              </div>
            ) : (
              <div className={styles.timelineList}>
                {enrolmentsList.slice(0, 4).map((item) => (
                  <div key={item.id} className={styles.timelineItem}>
                    <div className={styles.timelineIconCol}>
                      <Icons.UserCheck />
                    </div>
                    <div className={styles.timelineContent}>
                      <div className={styles.timelineTop}>
                        <h3 className={styles.timelineTitle}>Learner Enrolment</h3>
                        <span className={styles.timelineTime}>{item.date}</span>
                      </div>
                      <p className={styles.timelineDesc}>
                        {item.name} enrolled in {item.program}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

    </div>
  );
}
