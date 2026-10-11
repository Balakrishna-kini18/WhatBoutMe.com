"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";
import Link from "next/link";
import Image from "next/image";

// Crisp SVG Icons
const Icons = {
  Export: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  Plus: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  Users: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Layers: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  ),
  Dollar: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  Certificate: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  DocumentBadge: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  ProgramBadge: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  ),
  ActivityBadge: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  ArrowRight: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  ),
  More: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
      <circle cx="5" cy="12" r="1.5" />
    </svg>
  ),
  ChevronDown: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
};

// Default high-fidelity dataset matching Roweena's studio shown in marketing redesign
const fallbackEnrolments = [
  {
    id: "enr-1",
    name: "Gagan",
    email: "admin1@whataboutme.com",
    program: "11 Steps to You",
    status: "Active",
    date: "Oct 9, 2026",
    avatarBg: "#dbeafe",
    avatarColor: "#1d4ed8",
    initial: "G",
  },
  {
    id: "enr-2",
    name: "gagan jj",
    email: "test@example.com",
    program: "Vision Board Workshop",
    status: "Active",
    date: "Oct 8, 2026",
    avatarBg: "#dbeafe",
    avatarColor: "#1d4ed8",
    initial: "G",
  },
  {
    id: "enr-3",
    name: "Balakrishna Kini",
    email: "balakrishna@foxwel.ai",
    program: "11 Steps to You",
    status: "Active",
    date: "Oct 8, 2026",
    avatarBg: "#fce7f3",
    avatarColor: "#be185d",
    initial: "B",
  },
  {
    id: "enr-4",
    name: "Roweena Britto",
    email: "roweena@whataboutme.com",
    program: "Corporate Program",
    status: "Active",
    date: "Oct 7, 2026",
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
    avatarBg: "#ede9fe",
    avatarColor: "#6d28d9",
    initial: "N",
  },
];

export default function AdminDashboard() {
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeActionMenu, setActiveActionMenu] = useState<string | null>(null);

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
        console.error("Dashboard fetch error (using brand fallback):", e);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const totalLearners = dashboardData?.totalLearners ?? 7;
  const totalBatches = dashboardData?.totalBatches ?? 1;
  const totalRevenue = dashboardData?.mockRevenue ?? "$28,500";
  const certificatesIssued = dashboardData?.certificatesIssued ?? 3;

  const enrolmentsList =
    dashboardData?.recentEnrolments && dashboardData.recentEnrolments.length > 0
      ? dashboardData.recentEnrolments.map((u: any, idx: number) => ({
          id: u.id,
          name: u.name || "Learner",
          email: u.email,
          program: u.cohort || u.programTitle || "11 Steps to You",
          status: u.status === "ACTIVE" || !u.status ? "Active" : u.status,
          date: u.createdAt ? new Date(u.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Oct 9, 2026",
          avatarBg: idx % 2 === 0 ? "#dbeafe" : "#fce7f3",
          avatarColor: idx % 2 === 0 ? "#1d4ed8" : "#be185d",
          initial: (u.name || u.email || "L")[0].toUpperCase(),
        }))
      : fallbackEnrolments;

  return (
    <div className={styles.dashboardContainer}>
      {/* ===================================================================
          Hero Banner with Warm Organic Wave & Brand Script
          =================================================================== */}
      <section className={styles.heroBanner}>
        {/* Abstract Silk Wave Background */}
        <div className={styles.heroRibbonBg} aria-hidden="true">
          <svg viewBox="0 0 800 320" fill="none" preserveAspectRatio="none" className={styles.ribbonSvg}>
            <path
              d="M100 280C240 320 380 230 490 140C600 50 680 40 800 100V0H0V220C40 240 70 270 100 280Z"
              fill="url(#goldGradient)"
              opacity="0.35"
            />
            <path
              d="M320 320C460 290 560 170 650 90C720 30 760 10 800 0V320H320Z"
              fill="url(#sandGradient)"
              opacity="0.25"
            />
            <defs>
              <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f7e1b5" />
                <stop offset="60%" stopColor="#edd09b" />
                <stop offset="100%" stopColor="#f3ddb3" />
              </linearGradient>
              <linearGradient id="sandGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f9f3ea" />
                <stop offset="100%" stopColor="#edd8ba" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        <div className={styles.heroContentWrap}>
          {/* Left Greeting */}
          <div className={styles.greetingBlock}>
            <span className={styles.greetingIntro}>Good morning,</span>
            <h1 className={styles.greetingTitle}>
              <span className={styles.titleSuperAdmin}>Super Admin </span>
              <span className={styles.titleRoweena}>Roweena</span>
            </h1>
            <p className={styles.greetingDesc}>
              Track your programs, enrolments, and revenue metrics.
              <br />
              Manage batches, content, and grow your learning community.
            </p>
          </div>

          {/* Right Script & Actions */}
          <div className={styles.heroRightBlock}>
            {/* Elegant Script Quote */}
            <div className={styles.scriptCallout}>
              <span className={styles.scriptText}>
                Empowering Minds for a Brighter Tomorrow ♡
              </span>
            </div>

            {/* CTA Buttons */}
            <div className={styles.heroActionBtns}>
              <button type="button" className={styles.exportReportBtn}>
                <Icons.Export />
                <span>Export Report</span>
              </button>
              <Link href="/batches/create" className={styles.createBatchBtn}>
                <Icons.Plus />
                <span>Create Batch</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================
          4 Stat Cards
          =================================================================== */}
      <section className={styles.statCardsGrid}>
        {/* Card 1: Total Learners */}
        <div className={styles.statCard}>
          <div className={styles.statCardHeader}>
            <div className={`${styles.statIconBox} ${styles.iconBoxPeach}`}>
              <Icons.Users />
            </div>
            <button type="button" className={styles.cardMenuBtn} aria-label="Menu">
              <Icons.More />
            </button>
          </div>
          <div className={styles.statCardBody}>
            <span className={styles.statLabel}>Total Learners</span>
            <div className={styles.statNumberRow}>
              <span className={styles.statValue}>{loading ? "..." : totalLearners}</span>
              <span className={styles.statBadgeGreen}>↑ 12%</span>
            </div>
            <div className={styles.statFooterRow}>
              <span className={styles.statSubtext}>Active learners in your programs</span>
              {/* Mini Sparkline Bar Chart */}
              <div className={`${styles.miniSparkline} ${styles.sparklinePeach}`}>
                <span style={{ height: "40%" }} />
                <span style={{ height: "70%" }} />
                <span style={{ height: "55%" }} />
                <span style={{ height: "85%" }} />
                <span style={{ height: "100%" }} />
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Total Batches */}
        <div className={styles.statCard}>
          <div className={styles.statCardHeader}>
            <div className={`${styles.statIconBox} ${styles.iconBoxLavender}`}>
              <Icons.Layers />
            </div>
            <button type="button" className={styles.cardMenuBtn} aria-label="Menu">
              <Icons.More />
            </button>
          </div>
          <div className={styles.statCardBody}>
            <span className={styles.statLabel}>Total Batches</span>
            <div className={styles.statNumberRow}>
              <span className={styles.statValue}>{loading ? "..." : totalBatches}</span>
              <span className={styles.statBadgeGreen}>↑ 0%</span>
            </div>
            <div className={styles.statFooterRow}>
              <span className={styles.statSubtext}>Across all programs</span>
              {/* Mini Sparkline Bar Chart */}
              <div className={`${styles.miniSparkline} ${styles.sparklineLavender}`}>
                <span style={{ height: "30%" }} />
                <span style={{ height: "50%" }} />
                <span style={{ height: "45%" }} />
                <span style={{ height: "75%" }} />
                <span style={{ height: "90%" }} />
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Total Revenue */}
        <div className={styles.statCard}>
          <div className={styles.statCardHeader}>
            <div className={`${styles.statIconBox} ${styles.iconBoxGold}`}>
              <Icons.Dollar />
            </div>
            <button type="button" className={styles.cardMenuBtn} aria-label="Menu">
              <Icons.More />
            </button>
          </div>
          <div className={styles.statCardBody}>
            <span className={styles.statLabel}>Total Revenue</span>
            <div className={styles.statNumberRow}>
              <span className={styles.statValue}>{loading ? "..." : totalRevenue}</span>
              <span className={styles.statBadgeGreen}>↑ 8%</span>
            </div>
            <div className={styles.statFooterRow}>
              <span className={styles.statSubtext}>From program enrolments</span>
              {/* Mini Sparkline Bar Chart */}
              <div className={`${styles.miniSparkline} ${styles.sparklineGold}`}>
                <span style={{ height: "45%" }} />
                <span style={{ height: "65%" }} />
                <span style={{ height: "50%" }} />
                <span style={{ height: "80%" }} />
                <span style={{ height: "100%" }} />
              </div>
            </div>
          </div>
        </div>

        {/* Card 4: Certificates Issued */}
        <div className={styles.statCard}>
          <div className={styles.statCardHeader}>
            <div className={`${styles.statIconBox} ${styles.iconBoxMint}`}>
              <Icons.Certificate />
            </div>
            <button type="button" className={styles.cardMenuBtn} aria-label="Menu">
              <Icons.More />
            </button>
          </div>
          <div className={styles.statCardBody}>
            <span className={styles.statLabel}>Certificates Issued</span>
            <div className={styles.statNumberRow}>
              <span className={styles.statValue}>{loading ? "..." : certificatesIssued}</span>
              <span className={styles.statBadgeGreen}>↑ 100%</span>
            </div>
            <div className={styles.statFooterRow}>
              <span className={styles.statSubtext}>This month</span>
              {/* Mini Sparkline Bar Chart */}
              <div className={`${styles.miniSparkline} ${styles.sparklineMint}`}>
                <span style={{ height: "35%" }} />
                <span style={{ height: "55%" }} />
                <span style={{ height: "70%" }} />
                <span style={{ height: "60%" }} />
                <span style={{ height: "95%" }} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================
          Main Two-Column Section: Recent Enrolments + Side Cards
          =================================================================== */}
      <div className={styles.mainDashboardGrid}>
        {/* Left Column: Recent Enrolments Table */}
        <section className={styles.enrolmentsCard}>
          <div className={styles.cardHeader}>
            <div className={styles.headerTitleGroup}>
              <div className={styles.badgeIconWrap}>
                <Icons.DocumentBadge />
              </div>
              <div>
                <h2 className={styles.cardTitleSerif}>Recent Enrolments</h2>
                <p className={styles.cardSubtitle}>Latest users who have enrolled in your programs.</p>
              </div>
            </div>
            <Link href="/users" className={styles.viewAllBtn}>
              <span>View All</span>
              <Icons.ArrowRight />
            </Link>
          </div>

          <div className={styles.tableResponsiveWrap}>
            <table className={styles.brandTable}>
              <thead>
                <tr>
                  <th>LEARNER</th>
                  <th>EMAIL</th>
                  <th>PROGRAM</th>
                  <th>STATUS</th>
                  <th>ENROLLED ON</th>
                  <th style={{ textAlign: "right" }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  // Skeleton Rows
                  [1, 2, 3, 4, 5].map((i) => (
                    <tr key={i} className={styles.skeletonRow}>
                      <td><div className="skeleton" style={{ height: 32, width: 140, borderRadius: 9999 }} /></td>
                      <td><div className="skeleton" style={{ height: 18, width: 180 }} /></td>
                      <td><div className="skeleton" style={{ height: 18, width: 130 }} /></td>
                      <td><div className="skeleton" style={{ height: 24, width: 70, borderRadius: 9999 }} /></td>
                      <td><div className="skeleton" style={{ height: 18, width: 90 }} /></td>
                      <td style={{ textAlign: "right" }}><div className="skeleton" style={{ height: 20, width: 20, marginLeft: "auto", borderRadius: 4 }} /></td>
                    </tr>
                  ))
                ) : (
                  enrolmentsList.map((item: any) => (
                    <tr key={item.id} className={styles.tableRow}>
                      {/* Learner */}
                      <td>
                        <div className={styles.learnerCell}>
                          {item.isPhoto ? (
                            <div className={styles.avatarPhotoWrap}>
                              <Image
                                src={item.photoUrl}
                                alt={item.name}
                                width={32}
                                height={32}
                                className={styles.avatarImg}
                              />
                            </div>
                          ) : (
                            <div
                              className={styles.avatarCircle}
                              style={{ backgroundColor: item.avatarBg, color: item.avatarColor }}
                            >
                              {item.initial}
                            </div>
                          )}
                          <span className={styles.learnerName}>{item.name}</span>
                        </div>
                      </td>

                      {/* Email */}
                      <td>
                        <span className={styles.emailText}>{item.email}</span>
                      </td>

                      {/* Program */}
                      <td>
                        <span className={styles.programText}>{item.program}</span>
                      </td>

                      {/* Status */}
                      <td>
                        <div className={styles.statusPillActive}>
                          <span className={styles.statusDot} />
                          <span>Active</span>
                        </div>
                      </td>

                      {/* Enrolled On */}
                      <td>
                        <span className={styles.dateText}>{item.date}</span>
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: "right" }}>
                        <div className={styles.actionMenuWrap}>
                          <button
                            type="button"
                            className={styles.rowActionBtn}
                            onClick={() =>
                              setActiveActionMenu(activeActionMenu === item.id ? null : item.id)
                            }
                            aria-label="Actions"
                          >
                            <Icons.More />
                          </button>
                          {activeActionMenu === item.id && (
                            <div className={styles.rowDropdown}>
                              <Link href="/users" className={styles.rowDropdownItem}>
                                View Profile
                              </Link>
                              <Link href="/batches" className={styles.rowDropdownItem}>
                                Batch Details
                              </Link>
                              <button
                                type="button"
                                className={styles.rowDropdownItem}
                                onClick={() => setActiveActionMenu(null)}
                              >
                                Send Message
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Right Column: Donut Chart + Recent Activity */}
        <div className={styles.sideColumn}>
          {/* Card 1: Program Enrolments Donut Chart */}
          <div className={styles.sideCard}>
            <div className={styles.cardHeader}>
              <div className={styles.headerTitleGroup}>
                <div className={styles.badgeIconWrap}>
                  <Icons.ProgramBadge />
                </div>
                <h2 className={styles.cardTitleSerifSmall}>Program Enrolments</h2>
              </div>
              <div className={styles.periodSelectPill}>
                <span>This Month</span>
                <Icons.ChevronDown />
              </div>
            </div>

            <div className={styles.donutCardBody}>
              {/* Donut Chart Visualization */}
              <div className={styles.donutChartWrap}>
                <svg viewBox="0 0 120 120" className={styles.donutSvg}>
                  {/* Segment 4: Other Programs (0%) */}
                  <circle cx="60" cy="60" r="46" fill="transparent" stroke="#e8e2d7" strokeWidth="16" />
                  
                  {/* Segment 1: 11 Steps to You (4 / 7 = 57.1%) */}
                  <circle
                    cx="60"
                    cy="60"
                    r="46"
                    fill="transparent"
                    stroke="#c97a1e"
                    strokeWidth="16"
                    strokeDasharray="165 289"
                    strokeDashoffset="0"
                    transform="rotate(-90 60 60)"
                  />

                  {/* Segment 2: Vision Board Workshop (2 / 7 = 28.6%) */}
                  <circle
                    cx="60"
                    cy="60"
                    r="46"
                    fill="transparent"
                    stroke="#e6b87d"
                    strokeWidth="16"
                    strokeDasharray="83 289"
                    strokeDashoffset="-165"
                    transform="rotate(-90 60 60)"
                  />

                  {/* Segment 3: Corporate Program (1 / 7 = 14.3%) */}
                  <circle
                    cx="60"
                    cy="60"
                    r="46"
                    fill="transparent"
                    stroke="#ded1bf"
                    strokeWidth="16"
                    strokeDasharray="41 289"
                    strokeDashoffset="-248"
                    transform="rotate(-90 60 60)"
                  />
                </svg>
                {/* Center Total Count */}
                <div className={styles.donutCenterLabel}>
                  <span className={styles.donutCenterValue}>7</span>
                  <span className={styles.donutCenterSub}>Total</span>
                </div>
              </div>

              {/* Legend List */}
              <div className={styles.donutLegendList}>
                <div className={styles.legendRow}>
                  <div className={styles.legendLeft}>
                    <span className={styles.legendDot} style={{ backgroundColor: "#c97a1e" }} />
                    <span className={styles.legendName}>11 Steps to You</span>
                  </div>
                  <span className={styles.legendCount}>4</span>
                </div>

                <div className={styles.legendRow}>
                  <div className={styles.legendLeft}>
                    <span className={styles.legendDot} style={{ backgroundColor: "#e6b87d" }} />
                    <span className={styles.legendName}>Vision Board Workshop</span>
                  </div>
                  <span className={styles.legendCount}>2</span>
                </div>

                <div className={styles.legendRow}>
                  <div className={styles.legendLeft}>
                    <span className={styles.legendDot} style={{ backgroundColor: "#ded1bf" }} />
                    <span className={styles.legendName}>Corporate Program</span>
                  </div>
                  <span className={styles.legendCount}>1</span>
                </div>

                <div className={styles.legendRow}>
                  <div className={styles.legendLeft}>
                    <span className={styles.legendDot} style={{ backgroundColor: "#cbd5e1" }} />
                    <span className={styles.legendName}>Other Programs</span>
                  </div>
                  <span className={styles.legendCount}>0</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Recent Activity Timeline */}
          <div className={styles.sideCard}>
            <div className={styles.cardHeader}>
              <div className={styles.headerTitleGroup}>
                <div className={styles.badgeIconWrap}>
                  <Icons.ActivityBadge />
                </div>
                <h2 className={styles.cardTitleSerifSmall}>Recent Activity</h2>
              </div>
              <Link href="/batches" className={styles.viewAllBtnSmall}>
                <span>View All</span>
                <Icons.ArrowRight />
              </Link>
            </div>

            <div className={styles.timelineList}>
              {/* Activity 1 */}
              <div className={styles.timelineItem}>
                <div className={styles.timelineIconCol}>
                  <div className={styles.timelineBulletIcon}>
                    <Icons.Users />
                  </div>
                  <div className={styles.timelineLine} />
                </div>
                <div className={styles.timelineContentCol}>
                  <div className={styles.timelineHeaderRow}>
                    <h4 className={styles.timelineTitle}>New enrolment</h4>
                    <span className={styles.timelineTime}>2 hours ago</span>
                  </div>
                  <p className={styles.timelineDesc}>Gagan enrolled in 11 Steps to You</p>
                </div>
              </div>

              {/* Activity 2 */}
              <div className={styles.timelineItem}>
                <div className={styles.timelineIconCol}>
                  <div className={styles.timelineBulletIcon}>
                    <Icons.Layers />
                  </div>
                  <div className={styles.timelineLine} />
                </div>
                <div className={styles.timelineContentCol}>
                  <div className={styles.timelineHeaderRow}>
                    <h4 className={styles.timelineTitle}>Batch created</h4>
                    <span className={styles.timelineTime}>5 hours ago</span>
                  </div>
                  <p className={styles.timelineDesc}>New batch started for 11 Steps to You</p>
                </div>
              </div>

              {/* Activity 3 */}
              <div className={styles.timelineItem}>
                <div className={styles.timelineIconCol}>
                  <div className={styles.timelineBulletIcon}>
                    <Icons.Dollar />
                  </div>
                </div>
                <div className={styles.timelineContentCol}>
                  <div className={styles.timelineHeaderRow}>
                    <h4 className={styles.timelineTitle}>Payment received</h4>
                    <span className={styles.timelineTime}>1 day ago</span>
                  </div>
                  <p className={styles.timelineDesc}>$1,500 from gagan jj</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
