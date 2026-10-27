"use client";

import { useEffect, useState, useRef } from "react";
import styles from "./page.module.css";
import Link from "next/link";
import Image from "next/image";
import { ActionMenu } from "./components";
import {
  apiGet,
  fetchOneOnOneRequests,
  fetchMissionStatements,
  type OneOnOneRequestItem,
  type MissionStatementItem,
} from "./lib/api";
import { parseLeadMessage } from "./leads/page";
import { filterUpcomingDiscoveryCalls } from "./lib/discovery-calls";

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
  Video: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  ),
  Clock: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  AlertTriangle: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
};

interface LearnerItem {
  id: string;
  userId?: string;
  enrolmentId?: string;
  name: string;
  email: string;
  program: string;
  status: string;
  date: string;
  batchId?: string | null;
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

export default function AdminDashboard() {
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [leadsData, setLeadsData] = useState<any[]>([]);
  const [certificatesData, setCertificatesData] = useState<any[]>([]);
  const [batchesData, setBatchesData] = useState<any[]>([]);
  const [coachingRequests, setCoachingRequests] = useState<OneOnOneRequestItem[]>([]);
  const [missionSubmissions, setMissionSubmissions] = useState<MissionStatementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);

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

  // Fetch real admin dashboard metrics in parallel via Promise.all
  useEffect(() => {
    let active = true;
    const fetchDashboardMetrics = async () => {
      try {
        const [dash, leads, certs, batches, coachingReqs, missions] = await Promise.all([
          apiGet<any>('/admin/dashboard').catch((e) => {
            console.warn("Dashboard fetch error:", e);
            return null;
          }),
          apiGet<any>('/leads').catch(() => []),
          apiGet<any>('/certificates').catch(() => []),
          apiGet<any>('/batches').catch(() => []),
          fetchOneOnOneRequests('PENDING_APPROVAL').catch(() => []),
          fetchMissionStatements('SUBMITTED').catch(() => []),
        ]);

        if (active) {
          if (dash) setDashboardData(dash);
          if (Array.isArray(leads)) setLeadsData(leads);
          else if (leads?.data && Array.isArray(leads.data)) setLeadsData(leads.data);
          if (Array.isArray(certs)) setCertificatesData(certs);
          if (Array.isArray(batches)) setBatchesData(batches);
          if (Array.isArray(coachingReqs)) setCoachingRequests(coachingReqs);
          if (Array.isArray(missions)) setMissionSubmissions(missions);
        }
      } catch (e: any) {
        console.error("Dashboard parallel fetch error:", e);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchDashboardMetrics();
    return () => {
      active = false;
    };
  }, []);

  // Metrics from authoritative API contract or zero-state defaults
  const totalLearners = dashboardData?.totalLearners ?? 0;
  const totalBatches = dashboardData?.totalBatches ?? 0;
  const totalRevenue = dashboardData?.totalRevenue ?? dashboardData?.mockRevenue ?? "$0";
  const certificatesIssued = dashboardData?.certificatesIssued ?? dashboardData?.totalCertificates ?? 0;

  // Action Queue 1: Upcoming 15-Minute Discovery Calls
  // Strictly filtered to relevant, unconverted calls scheduled for today in the business timezone
  const upcomingDiscoveryCalls = filterUpcomingDiscoveryCalls(leadsData);

  // Action Queue 2: Pending Certificate Approvals
  const pendingCertificatesCount =
    dashboardData?.pendingCertificatesCount ??
    certificatesData.filter((c) => c.status === "PENDING" || c.status === "REQUESTED").length;

  // Action Queue 3: Pending Mission Statement Reviews (Stage 5)
  const pendingMissionsCount = missionSubmissions.length;

  // Active Batches list
  const activeBatchesList = batchesData
    .filter((b) => b.status === "ACTIVE" || b.status === "IN_PROGRESS" || (!b.status && b.startDate))
    .slice(0, 5)
    .map((b) => {
      const learnerCount = b.enrolledCount ?? b.enrolments?.length ?? b._count?.enrolments ?? 0;
      return {
        id: b.id,
        name: b.name || "Batch",
        programTitle: b.program?.title || b.program || "Course",
        managerName: b.manager?.name || b.manager || "Unassigned",
        learnerCount,
      };
    });

  const enrolmentsList: LearnerItem[] = loading
    ? []
    : dashboardData?.recentEnrolments && dashboardData.recentEnrolments.length > 0
      ? dashboardData.recentEnrolments.map((u: any, idx: number) => ({
          id: u.enrolmentId || (u.id && u.id !== u.userId ? u.id : `${u.userId || u.id || 'enr'}-${idx}`),
          userId: u.userId || u.id,
          enrolmentId: u.enrolmentId || u.id,
          name: u.name || "Learner",
          email: u.email,
          program: u.programTitle || u.batchName || u.cohort || "Unassigned",
          status: u.status || "ACTIVE",
          date: u.createdAt
            ? new Date(u.createdAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            : "—",
          batchId: u.batchId || null,
          initial: (u.name || u.email || "L")[0].toUpperCase(),
        }))
      : [];

  // High-contrast, harmonious categorical color palette for multi-program visualization
  const DONUT_CATEGORICAL_COLORS = [
    '#c97a1e', // 1. Warm Amber / Ochre (Signature Brand)
    '#2563eb', // 2. Royal Cobalt Blue (Strong contrast with amber)
    '#059669', // 3. Emerald Green (Fresh, high contrast with both amber & blue)
    '#7c3aed', // 4. Deep Violet / Purple
    '#e11d48', // 5. Crimson Rose / Coral
    '#0891b2', // 6. Deep Cyan / Teal
    '#d97706', // 7. Golden Honey
    '#475569', // 8. Slate Steel
  ];

  const getDonutColor = (_color: string | undefined, index: number) => {
    return DONUT_CATEGORICAL_COLORS[index % DONUT_CATEGORICAL_COLORS.length];
  };

  interface ProgramDistItem {
    name: string;
    count: number;
    percentage: number;
    color: string;
  }

  // Dynamic program distribution computed from all persisted enrolments via API
  const programDistribution: ProgramDistItem[] = dashboardData?.programDistribution || [];
  const totalEnrolmentsCount = programDistribution.reduce((acc, p) => acc + (p.count || 0), 0);

  interface ActivityItem {
    id: string;
    title: string;
    desc: string;
    date: string;
    type: string;
    href?: string;
  }

  // Genuine platform activity from backend AuditLog or verified events
  const recentActivityList: ActivityItem[] = (() => {
    const rawActivity = dashboardData?.recentActivity || [];
    const filteredBusinessEvents: ActivityItem[] = rawActivity
      .filter((act: any) => {
        // Strictly exclude raw authentication and internal session management noise
        if (!act || !act.action) return false;
        if (act.entity === "UserSession") return false;
        if (["LOGOUT", "LOGIN", "REFRESH_TOKEN"].includes(act.action)) return false;
        return true;
      })
      .map((act: any) => {
        let title = act.action ? act.action.replace(/_/g, " ") : "Platform Event";
        let desc = act.meta?.reason || `${act.entity || "Record"} updated`;
        let href: string | undefined = undefined;

        if (act.action === "LEAD_CONVERT") {
          title = "Lead Converted";
          desc = act.meta?.reason || (act.meta?.courseTitle ? `Converted to ${act.meta.courseTitle}` : "Prospect converted to enrolment");
          href = "/leads";
        } else if (act.action === "SESSION_COMPLETED") {
          title = "Session Completed";
          desc = act.meta?.title || "Workshop session completed";
          href = "/batches";
        } else if (act.action === "SESSION_ACTIVATED") {
          title = "Session Live";
          desc = act.meta?.title ? `Live: ${act.meta.title}` : "Live session started";
          href = "/batches";
        } else if (act.action === "CERTIFICATE_STATUS_CHANGE" || act.action === "CERTIFICATE_APPROVAL" || act.action === "CERTIFICATE_ISSUED") {
          title = "Certificate Updated";
          desc = act.meta?.reason || (act.meta?.status ? `Certificate marked ${act.meta.status}` : "Learner credential updated");
          href = "/certificates";
        } else if (act.action === "STEP_UNLOCK_OVERRIDE") {
          title = "Step Progression";
          desc = act.meta?.reason || "Manual progression step unlocked";
          href = "/users";
        } else if (act.action === "ATTENDANCE_OVERRIDE" || act.action === "ATTENDANCE_MANUAL_OVERRIDE" || act.action === "ATTENDANCE_RECONCILED") {
          title = "Attendance Updated";
          desc = act.meta?.reason || "Batch session attendance recorded";
          href = "/batches";
        } else if (act.action === "ANNOUNCEMENT_BROADCAST") {
          title = "Broadcast Sent";
          desc = act.meta?.title || "Administrative announcement broadcasted";
          href = "/messages";
        }

        return {
          id: act.id,
          title,
          desc,
          date: act.createdAt
            ? new Date(act.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
            : "Recent",
          type: act.action,
          href,
        };
      });

    if (filteredBusinessEvents.length >= 3) {
      return filteredBusinessEvents.slice(0, 4);
    }

    // Verified fallback & blend from live enrolments list for rich business context
    const enrolmentEvents: ActivityItem[] = enrolmentsList.slice(0, 4 - filteredBusinessEvents.length).map((item) => ({
      id: item.id,
      title: "Learner Enrolment",
      desc: `${item.name} enrolled in ${item.program}`,
      date: item.date,
      type: "ENROLMENT",
      href: item.userId ? `/users/${item.userId}` : "/users",
    }));

    return [...filteredBusinessEvents, ...enrolmentEvents].slice(0, 4);
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

  // Status formatter converting database enums into human-readable labels and dedicated badges
  const formatStatus = (rawStatus?: string | null): { label: string; className: string } => {
    const s = (rawStatus || "").toUpperCase();
    if (s === "ACTIVE" || !s) {
      return { label: "Active", className: styles.statusBadgeActive || "" };
    }
    if (s === "PENDING_PAYMENT") {
      return { label: "Pending Payment", className: styles.statusBadgePendingPayment || "" };
    }
    if (s === "PENDING_AGREEMENT") {
      return { label: "Pending Agreement", className: styles.statusBadgeAgreement || "" };
    }
    if (s === "COMPLETED") {
      return { label: "Completed", className: styles.statusBadgeCompleted || "" };
    }
    if (s === "CANCELLED") {
      return { label: "Cancelled", className: styles.statusBadgeCancelled || "" };
    }
    return { label: rawStatus || "Active", className: styles.statusBadgeActive || "" };
  };

  // SVG Donut slice calculation (radius = 40, viewBox="0 0 100 100", center at 50, 50)
  const donutRadius = 40;
  const donutCircumference = 2 * Math.PI * donutRadius;
  let accumulatedOffset = 0;

  const isManager = currentUser?.role === "MANAGER" || currentUser?.role === "TEACHER";

  // Executive display name resolution (clean administrator identity)
  const displayName = (() => {
    if (!currentUser?.name) return "Administrator";
    const cleaned = currentUser.name.replace(/^Super\s+Admin\s+/i, "").replace(/^Admin\s+/i, "").trim();
    return cleaned || currentUser.name || "Administrator";
  })();

  return (
    <div className={styles.dashboardContainer}>
      {/* ===================================================================
          1. Header & Welcome Command Section (Clean Executive Typography)
          =================================================================== */}
      <header className={styles.welcomeBar}>
        <div className={styles.welcomeInfo}>
          <h1 className={styles.welcomeHeading}>
            {getGreeting()}, {displayName}
          </h1>
        </div>

        <div className={styles.welcomeActions}>
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
        <Link href="/users" className={styles.kpiCard} title="View all users and enrolments">
          <div className={styles.kpiTopRow}>
            <span className={styles.kpiLabel}>{isManager ? "Assigned Learners" : "Total Learners"}</span>
            <div className={styles.kpiIconBox}>
              <Icons.Users />
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            {loading ? (
              <div className="skeleton" style={{ width: 68, height: 28, borderRadius: 6 }} />
            ) : (
              <span className={styles.kpiValue}>
                {totalLearners.toLocaleString()}
              </span>
            )}
          </div>
        </Link>

        {/* Metric 2: Total Batches */}
        <Link href="/batches" className={styles.kpiCard} title="View all active batches">
          <div className={styles.kpiTopRow}>
            <span className={styles.kpiLabel}>{isManager ? "Your Batches" : "Active Batches"}</span>
            <div className={styles.kpiIconBox}>
              <Icons.Batches />
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            {loading ? (
              <div className="skeleton" style={{ width: 48, height: 28, borderRadius: 6 }} />
            ) : (
              <span className={styles.kpiValue}>
                {totalBatches.toLocaleString()}
              </span>
            )}
          </div>
        </Link>

        {/* Metric 3: Total Revenue (Admin only - USD only per client specification) */}
        {!isManager && totalRevenue !== null && (
          <Link href="/revenue" className={styles.kpiCard} title="View revenue details">
            <div className={styles.kpiTopRow}>
              <span className={styles.kpiLabel}>Total Revenue</span>
              <div className={styles.kpiIconBox}>
                <Icons.Dollar />
              </div>
            </div>
            <div className={styles.kpiValueRow}>
              {loading ? (
                <div className="skeleton" style={{ width: 88, height: 28, borderRadius: 6 }} />
              ) : (
                <span className={styles.kpiValue}>{totalRevenue}</span>
              )}
            </div>
          </Link>
        )}

        {/* Metric 4: Certificates Issued */}
        <Link href="/certificates" className={styles.kpiCard} title="View issued certificates">
          <div className={styles.kpiTopRow}>
            <span className={styles.kpiLabel}>Certificates Issued</span>
            <div className={styles.kpiIconBox}>
              <Icons.Certificate />
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            {loading ? (
              <div className="skeleton" style={{ width: 48, height: 28, borderRadius: 6 }} />
            ) : (
              <span className={styles.kpiValue}>
                {certificatesIssued.toLocaleString()}
              </span>
            )}
          </div>
        </Link>
      </section>

      {/* ===================================================================
          2c. Action Required Queues: Discovery Calls, Approvals & Reconciliation
          =================================================================== */}
      <section className={styles.actionQueuesGrid} aria-label="Action Required Queues">
        {/* Queue 1: Upcoming 15-Minute Discovery Calls */}
        <div className={styles.actionQueueCard}>
          <div className={styles.actionQueueHeader}>
            <h3 className={styles.actionQueueTitle}>
              15-Min Discovery Calls
            </h3>
            {loading ? (
              <div className="skeleton" style={{ width: 78, height: 18, borderRadius: 999 }} />
            ) : upcomingDiscoveryCalls.length > 0 ? (
              <span className={`${styles.actionQueueBadge} ${styles.badgeScheduled}`}>
                {upcomingDiscoveryCalls.length} Scheduled
              </span>
            ) : null}
          </div>

          <div className={styles.actionQueueList}>
            {loading ? (
              <div className={styles.actionQueueHero} style={{ gap: "0.65rem" }}>
                <div className="skeleton" style={{ width: "65%", height: 18, borderRadius: 4 }} />
                <div className="skeleton" style={{ width: "90%", height: 13, borderRadius: 4 }} />
                <div className="skeleton" style={{ width: "100%", height: 34, borderRadius: 8, marginTop: "auto" }} />
              </div>
            ) : upcomingDiscoveryCalls.length === 0 ? (
              <div className={styles.actionQueueHero}>
                <div className={styles.emptyQueueState}>
                  <span>✓ All caught up</span>
                  <span>No more discovery calls scheduled today</span>
                </div>
                <Link href="/leads" className={styles.secondaryActionBtn}>
                  Manage All Leads →
                </Link>
              </div>
            ) : (
              <>
                {upcomingDiscoveryCalls.map((call) => (
                  <div key={call.id} className={styles.discoveryItem}>
                    <div className={styles.discoveryAttendee}>
                      <span className={styles.attendeeName}>{call.name}</span>
                      <span className={styles.attendeeTime}>
                        {call.formattedTime}
                      </span>
                    </div>
                    {call.courseTitle && (
                      <div className={styles.discoveryMeta}>
                        Inquiring: {call.courseTitle}
                      </div>
                    )}
                    <div className={styles.discoveryActions}>
                      {call.zoomUrl ? (
                        <a
                          href={call.zoomUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.joinZoomBtn}
                          title={`Join Zoom discovery call with ${call.name}`}
                          aria-label={`Join Zoom discovery call with ${call.name}`}
                        >
                          <Icons.Video />
                          <span>Join Zoom</span>
                        </a>
                      ) : (
                        <span className={styles.joinZoomBtnDisabled} title="Meeting link not provided">
                          <Icons.Video />
                          <span>No Zoom Link</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                <Link href="/leads" className={styles.secondaryActionBtn}>
                  Manage All Leads →
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Queue 2: 1-on-1 Coaching Session Requests (Stage 4) */}
        <div className={styles.actionQueueCard}>
          <div className={styles.actionQueueHeader}>
            <h3 className={styles.actionQueueTitle}>
              1-on-1 Coaching Queue
            </h3>
            {loading ? (
              <div className="skeleton" style={{ width: 68, height: 18, borderRadius: 999 }} />
            ) : coachingRequests.length > 0 ? (
              <span className={`${styles.actionQueueBadge} ${styles.badgePendingAlert}`}>
                {coachingRequests.length} Pending
              </span>
            ) : null}
          </div>

          <div className={styles.actionQueueList}>
            {loading ? (
              <div className={styles.actionQueueHero} style={{ gap: "0.65rem" }}>
                <div className="skeleton" style={{ width: "65%", height: 18, borderRadius: 4 }} />
                <div className="skeleton" style={{ width: "90%", height: 13, borderRadius: 4 }} />
                <div className="skeleton" style={{ width: "100%", height: 34, borderRadius: 8, marginTop: "auto" }} />
              </div>
            ) : coachingRequests.length === 0 ? (
              <div className={styles.actionQueueHero}>
                <div className={styles.emptyQueueState}>
                  <span>✓ All caught up</span>
                  <span>No 1-on-1 coaching requests pending</span>
                </div>
                <Link href="/meetings?view=requests" className={styles.secondaryActionBtn}>
                  View All Coaching Sessions →
                </Link>
              </div>
            ) : (
              <>
                {coachingRequests.slice(0, 3).map((req) => (
                  <div key={req.id} className={styles.discoveryItem}>
                    <div className={styles.discoveryAttendee}>
                      <span className={styles.attendeeName}>{req.user?.name || req.user?.email || "Learner"}</span>
                      <span className={styles.attendeeTime}>
                        {new Date(req.requestedStart).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    {req.enrolment?.program?.title && (
                      <div className={styles.discoveryMeta}>
                        Program: {req.enrolment.program.title}
                      </div>
                    )}
                    <div className={styles.discoveryActions}>
                      <Link
                        href="/approvals?tab=coaching"
                        className={styles.joinZoomBtn}
                        style={{ background: "#b8860b", color: "#fff", border: "none" }}
                      >
                        <span>Review &amp; Schedule →</span>
                      </Link>
                    </div>
                  </div>
                ))}
                <Link href="/approvals?tab=coaching" className={styles.secondaryActionBtn}>
                  Manage All Coaching Requests ({coachingRequests.length}) →
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Queue 3: Mission Statement Reviews (Stage 5) */}
        <div className={styles.actionQueueCard}>
          <div className={styles.actionQueueHeader}>
            <h3 className={styles.actionQueueTitle}>
              Mission Statement Reviews
            </h3>
            {loading ? (
              <div className="skeleton" style={{ width: 68, height: 18, borderRadius: 999 }} />
            ) : pendingMissionsCount > 0 ? (
              <span className={`${styles.actionQueueBadge} ${styles.badgePendingAlert}`}>
                {pendingMissionsCount} Pending
              </span>
            ) : null}
          </div>

          <div className={styles.actionQueueList}>
            {loading ? (
              <div className={styles.actionQueueHero} style={{ gap: "0.65rem" }}>
                <div className="skeleton" style={{ width: 44, height: 28, borderRadius: 6 }} />
                <div className="skeleton" style={{ width: "85%", height: 14, borderRadius: 4 }} />
                <div className="skeleton" style={{ width: "100%", height: 34, borderRadius: 8, marginTop: "auto" }} />
              </div>
            ) : pendingMissionsCount > 0 ? (
              <div className={styles.actionQueueHero}>
                <div className={styles.actionQueueHeroNumber}>{pendingMissionsCount}</div>
                <div className={styles.actionQueueHeroMeta}>Stage 5 learner mission statements submitted and awaiting review.</div>
                <Link href="/approvals?tab=missions" className={styles.primaryActionBtn}>
                  Review Submissions ({pendingMissionsCount}) →
                </Link>
              </div>
            ) : (
              <div className={styles.actionQueueHero}>
                <div className={styles.emptyQueueState}>
                  <span>✓ All caught up</span>
                  <span>No mission statements awaiting review</span>
                </div>
                <Link href="/approvals?tab=missions" className={styles.secondaryActionBtn}>
                  View Mission Submissions →
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Queue 4: Pending Certificate Approvals */}
        <div className={styles.actionQueueCard}>
          <div className={styles.actionQueueHeader}>
            <h3 className={styles.actionQueueTitle}>
              Certificate Approvals
            </h3>
            {loading ? (
              <div className="skeleton" style={{ width: 68, height: 18, borderRadius: 999 }} />
            ) : pendingCertificatesCount > 0 ? (
              <span className={`${styles.actionQueueBadge} ${styles.badgePendingAlert}`}>
                {pendingCertificatesCount} Pending
              </span>
            ) : null}
          </div>

          <div className={styles.actionQueueList}>
            {loading ? (
              <div className={styles.actionQueueHero} style={{ gap: "0.65rem" }}>
                <div className="skeleton" style={{ width: 44, height: 28, borderRadius: 6 }} />
                <div className="skeleton" style={{ width: "85%", height: 14, borderRadius: 4 }} />
                <div className="skeleton" style={{ width: "100%", height: 34, borderRadius: 8, marginTop: "auto" }} />
              </div>
            ) : pendingCertificatesCount > 0 ? (
              <div className={styles.actionQueueHero}>
                <div className={styles.actionQueueHeroNumber}>{pendingCertificatesCount}</div>
                <div className={styles.actionQueueHeroMeta}>Learner certificate requests awaiting instructor review and issuance.</div>
                <Link href="/approvals?tab=certificates" className={styles.primaryActionBtn}>
                  Review Approvals Queue →
                </Link>
              </div>
            ) : (
              <div className={styles.actionQueueHero}>
                <div className={styles.emptyQueueState}>
                  <span>✓ Queue clear</span>
                  <span>All submitted certificates reviewed</span>
                </div>
                <Link href="/certificates" className={styles.secondaryActionBtn}>
                  View Issued Certificates →
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ===================================================================
          2d. Active Batches Overview
          =================================================================== */}
      <section className={styles.batchMatrixSection} aria-label="Active Batches">
        <div className={styles.batchMatrixHeader}>
          <h2 className={styles.sectionTitle} style={{ fontSize: "1.0625rem" }}>
            Active Batches
          </h2>
          <Link href="/batches" className={styles.viewAllLink}>
            <span>View All Batches</span>
            <Icons.ArrowRight />
          </Link>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className={styles.batchMatrixTable}>
            <thead>
              <tr>
                <th>Batch Name</th>
                <th>Program</th>
                <th>Manager</th>
                <th>Learners</th>
                <th style={{ textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1, 2, 3].map((i) => (
                  <tr key={i}>
                    <td>
                      <div className="skeleton" style={{ height: 15, width: 140, borderRadius: 4 }} />
                    </td>
                    <td>
                      <div className="skeleton" style={{ height: 15, width: 110, borderRadius: 4 }} />
                    </td>
                    <td>
                      <div className="skeleton" style={{ height: 15, width: 90, borderRadius: 4 }} />
                    </td>
                    <td>
                      <div className="skeleton" style={{ height: 15, width: 75, borderRadius: 4 }} />
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className="skeleton" style={{ height: 15, width: 105, borderRadius: 4, marginLeft: "auto" }} />
                    </td>
                  </tr>
                ))
              ) : activeBatchesList.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "1.5rem", color: "var(--text-muted)" }}>
                    No active batches found.
                  </td>
                </tr>
              ) : (
                activeBatchesList.map((batch) => (
                  <tr key={batch.id}>
                    <td>
                      <Link
                        href={`/batches/${batch.id}/sessions`}
                        className={styles.cohortLink}
                        title={`Manage sessions for ${batch.name}`}
                      >
                        {batch.name}
                      </Link>
                    </td>
                    <td style={{ color: "var(--text-secondary)" }}>{batch.programTitle}</td>
                    <td>
                      {batch.managerName && batch.managerName !== "Unassigned" ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#15803d" }} />
                          {batch.managerName}
                        </span>
                      ) : (
                        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                          Unassigned
                        </span>
                      )}
                    </td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{batch.learnerCount} learners</span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link
                        href={`/batches/${batch.id}/sessions`}
                        className={styles.batchActionLink}
                        aria-label={`Manage sessions for ${batch.name}`}
                      >
                        <span>Manage Sessions</span>
                        <Icons.ArrowRight />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ===================================================================
          3. Main Operational Grid: Recent Enrolments + Program Distribution
          =================================================================== */}
      <div className={styles.mainGrid}>
        {/* Left Column: Recent Enrolments Table */}
        <section className={styles.enrolmentsSection} aria-label="Recent Enrolments">
          <div className={styles.sectionHeaderBar}>
            <h2 className={styles.sectionTitle}>Recent Enrolments</h2>
            <div className={styles.sectionHeaderActions}>
              <Link href="/users" className={styles.viewAllLink}>
                <span>View All</span>
                <Icons.ArrowRight />
              </Link>
            </div>
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
                        {(() => {
                          const statusInfo = formatStatus(item.status);
                          return (
                            <span className={statusInfo.className}>{statusInfo.label}</span>
                          );
                        })()}
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
                              href: item.userId
                                ? `/users/${item.userId}`
                                : item.id.startsWith("enr-")
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
                              href: item.batchId ? `/batches?id=${item.batchId}` : "/batches",
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
              <h2 className={styles.sideTitle}>Program Enrolments</h2>
            </div>

            {loading ? (
              <div className={styles.donutCardBody}>
                {/* Skeleton Donut */}
                <div className={styles.donutWrapper}>
                  <svg viewBox="0 0 100 100" className={styles.donutSvg}>
                    <circle
                      cx="50"
                      cy="50"
                      r={donutRadius}
                      fill="none"
                      stroke="#f2ede4"
                      strokeWidth="11"
                    />
                  </svg>
                  <div className={styles.donutCenter}>
                    <div className="skeleton" style={{ width: 32, height: 18, borderRadius: 4, margin: "0 auto 4px" }} />
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
                  <svg viewBox="0 0 100 100" className={styles.donutSvg}>
                    {/* Background track */}
                    <circle
                      cx="50"
                      cy="50"
                      r={donutRadius}
                      fill="none"
                      stroke="#f2ede4"
                      strokeWidth="11"
                    />
                    {/* Dynamic Segments */}
                    {(() => {
                      let currentOffset = 0;
                      return programDistribution.map((item, index) => {
                        const strokeDash =
                          (item.percentage / 100) * donutCircumference;
                        const offset = currentOffset;
                        currentOffset += strokeDash;
                        return (
                          <circle
                            key={item.name}
                            cx="50"
                            cy="50"
                            r={donutRadius}
                            fill="none"
                            stroke={getDonutColor(item.color, index)}
                            strokeWidth="11"
                            strokeDasharray={`${strokeDash} ${donutCircumference}`}
                            strokeDashoffset={-offset}
                          />
                        );
                      });
                    })()}
                  </svg>
                  {/* Center Total Count */}
                  <div className={styles.donutCenter}>
                    <span className={styles.donutTotal}>{totalEnrolmentsCount}</span>
                    <span className={styles.donutTotalLabel}>Total</span>
                  </div>
                </div>

                {/* Legend List */}
                <div className={styles.programLegendList}>
                  {programDistribution.map((item, index) => (
                    <div key={item.name} className={styles.legendRow}>
                      <div className={styles.legendLeft}>
                        <span
                          className={styles.legendDot}
                          style={{ backgroundColor: getDonutColor(item.color, index) }}
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
              <h2 className={styles.sideTitle}>Recent Activity</h2>
              <Link href="/audit-logs" className={styles.viewAllLink} title="View all system audit logs">
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
            ) : recentActivityList.length === 0 ? (
              <div className={styles.emptyStateSmall}>
                <span>No recent business activity recorded.</span>
              </div>
            ) : (
              <div className={styles.timelineList}>
                {recentActivityList.slice(0, 4).map((item) => (
                  <div key={item.id} className={styles.timelineItem}>
                    <div className={styles.timelineIconCol}>
                      {item.type === "CERTIFICATE_STATUS_CHANGE" || item.type === "CERTIFICATE_APPROVAL" || item.type === "CERTIFICATE_ISSUED" ? (
                        <Icons.Certificate />
                      ) : item.type === "LEAD_CONVERT" ? (
                        <Icons.Check />
                      ) : item.type === "SESSION_COMPLETED" || item.type === "SESSION_ACTIVATED" ? (
                        <Icons.Video />
                      ) : (
                        <Icons.UserCheck />
                      )}
                    </div>
                    <div className={styles.timelineContent}>
                      <div className={styles.timelineTop}>
                        {item.href ? (
                          <Link href={item.href} className={styles.timelineTitleLink} title={`Jump to ${item.title}`}>
                            <h3 className={styles.timelineTitle}>{item.title}</h3>
                          </Link>
                        ) : (
                          <h3 className={styles.timelineTitle}>{item.title}</h3>
                        )}
                        <span className={styles.timelineTime}>{item.date}</span>
                      </div>
                      <p className={styles.timelineDesc} title={item.desc}>
                        {item.desc}
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
