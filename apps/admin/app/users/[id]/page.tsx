"use client";

import { useEffect, useState, use, Fragment } from "react";
import styles from "./UserDetail.module.css";
import Link from "next/link";
import { API_URL, errorMessage } from "../../lib/api";
import { CustomSelect, StatusBadge } from "../../components";

interface EnrolmentOption {
  id: string;
  status: string;
  enrolledAt: string;
  batch?: {
    id: string;
    name: string;
    program?: {
      id: string;
      title: string;
    };
  };
}

interface UserDetail {
  id: string;
  name: string;
  email: string;
  role: string;
  status?: string;
  createdAt: string;
  enrolments?: EnrolmentOption[];
}

interface LessonItem {
  lessonId: string;
  order: number;
  title: string;
  type: string;
  durationSec: number | null;
  isCompleted: boolean;
  progressPercent: number;
  lastPositionSec: number | null;
  completedAt: string | null;
}

interface QuizItem {
  quizId: string;
  questionCount: number;
  passMark: number;
  isPassed: boolean;
  bestScore: number | null;
  attemptsCount: number;
}

interface StepProgressionItem {
  stepId: string;
  sequence: number;
  title: string;
  releaseSchedule?: string;
  unlockDelayDays?: number | null;
  scheduledUnlockDate?: string | null;
  isUnlocked: boolean;
  unlockedAt?: string | null;
  overrideState: "AUTOMATIC" | "MANUAL_UNLOCKED" | "MANUAL_LOCKED";
  overrideReason?: string | null;
  overriddenAt?: string | null;
  overriddenById?: string | null;
  isCompleted: boolean;
  completedAt?: string | null;
  lockReason?: string | null;
  progressPercent?: number;
  completedItems?: number;
  totalItems?: number;
  lessons?: LessonItem[];
  quiz?: QuizItem | null;
}

interface EnrolmentProgression {
  enrolmentId: string;
  programId: string;
  programTitle: string;
  batchId: string;
  batchName: string;
  enrolmentStatus: string;
  steps: StepProgressionItem[];
  overallProgressPercent?: number;
  overallPercent?: number;
  completedItems?: number;
  totalItems?: number;
  completedSteps?: number;
  totalSteps?: number;
}

function formatDuration(sec?: number | null): string {
  if (sec == null || isNaN(sec) || sec <= 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

function getInitials(name?: string | null): string {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) {
    const first = parts[0] ?? "";
    return first.slice(0, 2).toUpperCase() || "U";
  }
  const first = parts[0] ?? "";
  const last = parts[parts.length - 1] ?? "";
  const init = `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
  return init || "U";
}

interface LearnerAttendanceHistory {
  userId: string;
  totalScheduledSessions: number;
  totalAttendedSessions: number;
  overallAttendancePercentage: number;
  history: Array<{
    sessionId: string;
    sessionTitle: string;
    sessionType: string;
    batchId?: string | null;
    batchName: string | null;
    programTitle: string | null;
    startTimeUtc: string;
    endTimeUtc: string;
    durationMinutes: number;
    meetingProvider: string | null;
    status: string;
    minutesPresent: number;
    attendancePercentage: number;
    source: string;
    overrideReason?: string | null;
    joinTimeUtc: string | null;
    leaveTimeUtc: string | null;
  }>;
}

export default function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const unwrappedParams = typeof (params as any)?.then === "function" ? use(params as any) : params;
  const userId = (unwrappedParams as { id: string }).id;

  const [user, setUser] = useState<UserDetail | null>(null);
  const [selectedEnrolmentId, setSelectedEnrolmentId] = useState<string>("");
  const [progression, setProgression] = useState<EnrolmentProgression | null>(null);
  const [compliance, setCompliance] = useState<any>(null);
  const [attendanceHistory, setAttendanceHistory] = useState<LearnerAttendanceHistory | null>(null);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingProgression, setLoadingProgression] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Modal states for override actions
  const [activeModal, setActiveModal] = useState<"unlock" | "relock" | "reset" | null>(null);
  const [targetStep, setTargetStep] = useState<StepProgressionItem | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [submittingOverride, setSubmittingOverride] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Expanded steps for content inspection
  const [expandedStepIds, setExpandedStepIds] = useState<Record<string, boolean>>({});

  const toggleStepExpand = (stepId: string) => {
    setExpandedStepIds((prev) => ({
      ...prev,
      [stepId]: !prev[stepId],
    }));
  };

  // Load user profile & enrolments & attendance history in parallel
  useEffect(() => {
    const controller = new AbortController();

    async function loadData() {
      setLoading(true);
      setLoadingAttendance(true);
      setActionError(null);
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      try {
        const [userRes, attendanceRes] = await Promise.all([
          fetch(`${API_URL}/users/${userId}`, { headers, signal: controller.signal }),
          fetch(`${API_URL}/attendance/user/${userId}`, { headers, signal: controller.signal }),
        ]);

        if (!userRes.ok) {
          throw new Error(await errorMessage(userRes, "Failed to load learner details"));
        }
        const userData = await userRes.json();
        setUser(userData);
        if (userData.enrolments && userData.enrolments.length > 0) {
          setSelectedEnrolmentId(userData.enrolments[0].id);
        }

        if (attendanceRes.ok) {
          const attendanceData = await attendanceRes.json();
          setAttendanceHistory(attendanceData);
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setActionError(err.message);
        }
      } finally {
        setLoading(false);
        setLoadingAttendance(false);
      }
    }

    loadData();
    return () => controller.abort();
  }, [userId]);

  // Load progression when selected enrolment changes
  useEffect(() => {
    if (!selectedEnrolmentId) {
      setProgression(null);
      return;
    }
    const controller = new AbortController();
    fetchProgression(selectedEnrolmentId, controller.signal);
    return () => controller.abort();
  }, [selectedEnrolmentId]);

  async function fetchProgression(enrolmentId: string, signal?: AbortSignal) {
    setLoadingProgression(true);
    setCompliance(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      // Kill waterfall: fetch progression & attendance compliance concurrently in a single window
      const [progRes, compRes] = await Promise.all([
        fetch(`${API_URL}/progression/enrolments/${enrolmentId}`, { headers, signal }),
        fetch(`${API_URL}/attendance/compliance/${enrolmentId}`, { headers, signal }).catch(() => null),
      ]);

      if (!progRes.ok) {
        throw new Error(await errorMessage(progRes, "Failed to fetch enrolment progression"));
      }
      const data = await progRes.json();
      setProgression(data);

      if (compRes && compRes.ok) {
        setCompliance(await compRes.json());
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setActionError(err.message);
      }
    } finally {
      setLoadingProgression(false);
    }
  }

  async function handleRecalculate() {
    if (!selectedEnrolmentId) return;
    setActionError(null);
    setActionSuccess(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/progression/admin/enrolments/${selectedEnrolmentId}/recalculate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to recalculate progression"));
      }
      const updated = await res.json();
      setProgression(updated);
      setActionSuccess("Progression successfully recalculated according to current rules and dates.");
    } catch (err: any) {
      setActionError(err.message);
    }
  }

  function openOverrideModal(action: "unlock" | "relock" | "reset", step: StepProgressionItem) {
    setTargetStep(step);
    setActiveModal(action);
    setOverrideReason("");
    setModalError(null);
  }

  function closeOverrideModal() {
    setActiveModal(null);
    setTargetStep(null);
    setOverrideReason("");
    setModalError(null);
  }

  async function handleOverrideSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!targetStep || !selectedEnrolmentId || !activeModal) return;

    if ((activeModal === "unlock" || activeModal === "relock") && !overrideReason.trim()) {
      setModalError("A detailed administrative reason is required for manual overrides.");
      return;
    }

    setSubmittingOverride(true);
    setModalError(null);
    setActionError(null);
    setActionSuccess(null);

    try {
      const token = localStorage.getItem("token");
      let endpoint = "";
      if (activeModal === "unlock") {
        endpoint = `${API_URL}/progression/admin/enrolments/${selectedEnrolmentId}/steps/${targetStep.stepId}/unlock`;
      } else if (activeModal === "relock") {
        endpoint = `${API_URL}/progression/admin/enrolments/${selectedEnrolmentId}/steps/${targetStep.stepId}/relock`;
      } else {
        endpoint = `${API_URL}/progression/admin/enrolments/${selectedEnrolmentId}/steps/${targetStep.stepId}/reset-override`;
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ reason: overrideReason.trim() }),
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to apply manual override"));
      }

      closeOverrideModal();
      setActionSuccess(
        activeModal === "unlock"
          ? `Step ${targetStep.sequence} manually unlocked.`
          : activeModal === "relock"
          ? `Step ${targetStep.sequence} manually relocked.`
          : `Step ${targetStep.sequence} manual override reset to automatic progression.`
      );
      // Refresh progression
      await fetchProgression(selectedEnrolmentId);
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setSubmittingOverride(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <Link href="/users" className={styles.backLink}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span>Back to Users</span>
        </Link>
        <div className={styles.profileCard} style={{ justifyContent: "center", padding: "3rem" }}>
          <div style={{ color: "var(--text-muted)", fontSize: "0.95rem", fontWeight: 600 }}>
            Loading learner profile &amp; progression...
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={styles.container}>
        <Link href="/users" className={styles.backLink}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span>Back to Users</span>
        </Link>
        <div className={styles.profileCard} style={{ padding: "2.5rem" }}>
          <div>
            <h2 className={styles.learnerName} style={{ marginBottom: "0.5rem" }}>Learner not found</h2>
            <p style={{ color: "var(--text-secondary)", margin: 0 }}>The requested user account does not exist or has been removed.</p>
          </div>
        </div>
      </div>
    );
  }

  const selectedEnrolment = user.enrolments?.find((e) => e.id === selectedEnrolmentId);

  // Compute metrics
  const overallPct = progression
    ? Math.round(progression.overallProgressPercent ?? progression.overallPercent ?? 0)
    : 0;
  const completedSteps = progression?.steps?.filter((s) => s.isCompleted).length ?? 0;
  const totalSteps = progression?.steps?.length ?? 0;

  const totalVideos =
    progression?.steps?.reduce(
      (acc, s) => acc + (s.lessons?.filter((l) => l.type === "VIDEO" || l.type === "AUDIO").length || 0),
      0
    ) ?? 0;
  const completedVideos =
    progression?.steps?.reduce(
      (acc, s) =>
        acc +
        (s.lessons?.filter((l) => (l.type === "VIDEO" || l.type === "AUDIO") && l.isCompleted).length || 0),
      0
    ) ?? 0;

  const totalDocs =
    progression?.steps?.reduce(
      (acc, s) => acc + (s.lessons?.filter((l) => l.type === "PDF" || l.type === "TEXT").length || 0),
      0
    ) ?? 0;
  const completedDocs =
    progression?.steps?.reduce(
      (acc, s) =>
        acc +
        (s.lessons?.filter((l) => (l.type === "PDF" || l.type === "TEXT") && l.isCompleted).length || 0),
      0
    ) ?? 0;

  const totalQuizzes = progression?.steps?.reduce((acc, s) => acc + (s.quiz ? 1 : 0), 0) ?? 0;
  const passedQuizzes = progression?.steps?.reduce((acc, s) => acc + (s.quiz?.isPassed ? 1 : 0), 0) ?? 0;

  return (
    <div className={styles.container}>
      {/* 1. Page Header with Back Navigation & Profile Card */}
      <div>
        <Link href="/users" className={styles.backLink}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span>Back to Users</span>
        </Link>

        <div className={styles.profileCard}>
          <div className={styles.profileLeft}>
            <div className={styles.avatar} aria-hidden="true">
              {getInitials(user.name)}
            </div>

            <div className={styles.profileInfo}>
              <h1 className={styles.learnerName}>{user.name}</h1>
              <div className={styles.metaRow}>
                <span className={styles.metaItem}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect width="20" height="16" x="2" y="4" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                  <span>{user.email}</span>
                </span>

                <span className={styles.metaDot}>&bull;</span>

                <span className={styles.metaItem}>
                  <StatusBadge status={user.role} />
                </span>

                <span className={styles.metaDot}>&bull;</span>

                <span className={styles.metaItem}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span>Joined {new Date(user.createdAt).toLocaleDateString()}</span>
                </span>
              </div>
            </div>
          </div>

          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.recalculateBtn}
              onClick={handleRecalculate}
              disabled={!selectedEnrolmentId || loadingProgression}
              title="Recalculate progression locks and completions according to cohort schedule and criteria"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ animation: loadingProgression ? "spin 1s linear infinite" : undefined }}>
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
              <span>{loadingProgression ? "Recalculating..." : "Recalculate Progression"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Action Notifications */}
      {actionError && (
        <div className={styles.alertError} role="alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{actionError}</span>
        </div>
      )}

      {actionSuccess && (
        <div className={styles.alertSuccess} role="status">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* 2. Enrollment Selector Card */}
      {user.enrolments && user.enrolments.length > 0 && (
        <section className={styles.enrollmentCard}>
          <div className={styles.enrollmentPickerGroup}>
            <label className={styles.enrollmentLabel} htmlFor="enrolment-select">
              Active Enrollment Track:
            </label>
            <CustomSelect
              value={selectedEnrolmentId}
              onChange={setSelectedEnrolmentId}
              minWidth="340px"
              ariaLabel="Select Enrolment"
              options={user.enrolments.map((enr) => ({
                value: enr.id,
                label: `${enr.batch?.program?.title || "Program"} — ${enr.batch?.name || "Batch"}`,
              }))}
            />
          </div>

          <div className={styles.enrollmentStatusWrap}>
            <span className={styles.enrollmentStatusLabel}>Enrollment Status:</span>
            <StatusBadge status={selectedEnrolment?.status || "ACTIVE"} />
          </div>
        </section>
      )}

      {/* 3. Progress Overview Metrics Grid */}
      <section className={styles.metricsGrid}>
        {/* Metric 1: Overall Progress */}
        <div className={styles.metricCard}>
          <div className={styles.metricTop}>
            <span className={styles.metricLabel}>Overall Progress</span>
            <div className={styles.metricIconWrap} aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>
          </div>
          <div>
            <div className={styles.metricValueRow}>
              <span className={styles.metricValue}>{overallPct}%</span>
            </div>
            <div className={styles.progressBarContainer}>
              <div
                className={styles.progressBarFill}
                style={{ width: `${overallPct}%` }}
              />
            </div>
          </div>
          <span className={styles.metricBadge}>
            Milestones completion track
          </span>
        </div>

        {/* Metric 2: Completed Steps */}
        <div className={styles.metricCard}>
          <div className={styles.metricTop}>
            <span className={styles.metricLabel}>Completed Steps</span>
            <div className={styles.metricIconWrap} aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
                <path d="M6 6h10" />
                <path d="M6 10h10" />
              </svg>
            </div>
          </div>
          <div>
            <div className={styles.metricValueRow}>
              <span className={styles.metricValue}>{completedSteps}</span>
              <span className={styles.metricTotal}>/ {totalSteps}</span>
            </div>
          </div>
          <span className={`${styles.metricBadge} ${completedSteps > 0 ? styles.metricBadgePositive : ""}`}>
            {progression?.steps?.filter((s) => s.isUnlocked).length || 0} unlocked
          </span>
        </div>

        {/* Metric 3: Videos & Audio */}
        <div className={styles.metricCard}>
          <div className={styles.metricTop}>
            <span className={styles.metricLabel}>Videos &amp; Audio</span>
            <div className={styles.metricIconWrap} aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            </div>
          </div>
          <div>
            <div className={styles.metricValueRow}>
              <span className={styles.metricValue}>{completedVideos}</span>
              <span className={styles.metricTotal}>/ {totalVideos}</span>
            </div>
          </div>
          <span className={`${styles.metricBadge} ${completedVideos === totalVideos && totalVideos > 0 ? styles.metricBadgePositive : ""}`}>
            {totalVideos > 0 ? `${Math.round((completedVideos / totalVideos) * 100)}% watched` : "No media items"}
          </span>
        </div>

        {/* Metric 4: Documents & Text */}
        <div className={styles.metricCard}>
          <div className={styles.metricTop}>
            <span className={styles.metricLabel}>Documents &amp; Text</span>
            <div className={styles.metricIconWrap} aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
          </div>
          <div>
            <div className={styles.metricValueRow}>
              <span className={styles.metricValue}>{completedDocs}</span>
              <span className={styles.metricTotal}>/ {totalDocs}</span>
            </div>
          </div>
          <span className={`${styles.metricBadge} ${completedDocs === totalDocs && totalDocs > 0 ? styles.metricBadgePositive : ""}`}>
            {totalDocs > 0 ? `${Math.round((completedDocs / totalDocs) * 100)}% read` : "No documents"}
          </span>
        </div>

        {/* Metric 5: Quizzes Passed */}
        <div className={styles.metricCard}>
          <div className={styles.metricTop}>
            <span className={styles.metricLabel}>Quizzes Passed</span>
            <div className={styles.metricIconWrap} aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
          </div>
          <div>
            <div className={styles.metricValueRow}>
              <span className={styles.metricValue}>{passedQuizzes}</span>
              <span className={styles.metricTotal}>/ {totalQuizzes}</span>
            </div>
          </div>
          <span className={`${styles.metricBadge} ${passedQuizzes === totalQuizzes && totalQuizzes > 0 ? styles.metricBadgePositive : ""}`}>
            {totalQuizzes > 0 ? `${Math.round((passedQuizzes / totalQuizzes) * 100)}% passed` : "No quizzes"}
          </span>
        </div>

        {/* Optional Metric 6: Attendance Compliance */}
        {compliance && compliance.status !== "NOT_APPLICABLE" && (
          <div className={styles.metricCard}>
            <div className={styles.metricTop}>
              <span className={styles.metricLabel}>Attendance</span>
              <div className={styles.metricIconWrap} aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
            </div>
            <div>
              <div className={styles.metricValueRow}>
                <span className={styles.metricValue} style={{ color: compliance.status === "COMPLIANT" ? "#15803d" : "#dc2626" }}>
                  {Math.round(compliance.attendancePercentage)}%
                </span>
              </div>
            </div>
            <span className={`${styles.metricBadge} ${compliance.status === "COMPLIANT" ? styles.metricBadgePositive : ""}`}>
              {compliance.status === "COMPLIANT" ? "Compliant" : "Low Attendance"} ({compliance.attendedSessionCount}/{compliance.requiredSessionCount} sessions)
            </span>
          </div>
        )}
      </section>

      {/* 4. Step Progression & Manual Overrides Section */}
      <section className={styles.progressionSection}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Step Progression &amp; Manual Overrides</h2>
            <p className={styles.sectionSubtitle}>
              View sequential progression and manage administrative unlock/relock overrides. All overrides require an audit reason.
            </p>
          </div>
        </div>

        {/* Sequential Progression Callout */}
        <div className={styles.sequentialCallout}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>
            <strong>Sequential Progression:</strong> Learners advance step-by-step. Steps unlock automatically as prerequisite milestones are satisfied. Manual overrides bypass standard gates and are logged in the audit trail.
          </span>
        </div>

        {loadingProgression ? (
          <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--text-muted)", fontSize: "0.92rem", fontWeight: 600 }}>
            Loading step progression milestones...
          </div>
        ) : !progression || !progression.steps || progression.steps.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--text-muted)", fontSize: "0.92rem" }}>
            No program steps found for this enrollment.
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.progressionTable}>
              <thead>
                <tr>
                  <th style={{ width: "48px" }}>#</th>
                  <th style={{ width: "32%" }}>Step Title</th>
                  <th style={{ width: "16%" }}>Access State</th>
                  <th style={{ width: "13%" }}>Completion</th>
                  <th style={{ width: "14%" }}>Override State</th>
                  <th style={{ width: "12%" }}>Override Notes</th>
                  <th style={{ textAlign: "right", width: "13%" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {progression.steps.map((step) => {
                  const isManuallyUnlocked = step.overrideState === "MANUAL_UNLOCKED";
                  const isManuallyLocked = step.overrideState === "MANUAL_LOCKED";

                  return (
                    <Fragment key={step.stepId}>
                      <tr>
                        <td>
                          <div className={styles.seqBadge}>
                            {step.sequence}
                          </div>
                        </td>

                        <td>
                          <div className={styles.stepTitleWrap}>
                            <span className={styles.stepTitleText}>{step.title}</span>
                            {step.scheduledUnlockDate && (
                              <span className={styles.stepScheduledText}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <circle cx="12" cy="12" r="10" />
                                  <polyline points="12 6 12 12 16 14" />
                                </svg>
                                <span>Scheduled: {new Date(step.scheduledUnlockDate).toLocaleDateString()}</span>
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => toggleStepExpand(step.stepId)}
                              className={styles.viewContentBtn}
                              title="Toggle step items inspection"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: expandedStepIds[step.stepId] ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s ease" }}>
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                              <span>
                                {expandedStepIds[step.stepId]
                                  ? "Hide Content"
                                  : `View Content (${step.completedItems ?? 0}/${step.totalItems ?? 0} done)`}
                              </span>
                            </button>
                          </div>
                        </td>

                        <td>
                          {step.isUnlocked ? (
                            <span className={styles.badgeUnlocked}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                              </svg>
                              <span>UNLOCKED</span>
                            </span>
                          ) : (
                            <div className={styles.badgeLockedWrap}>
                              <span className={styles.badgeLocked}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                </svg>
                                <span>LOCKED</span>
                              </span>
                              {step.lockReason && (
                                <span className={styles.lockReasonText}>
                                  {step.lockReason.replace(/_/g, " ")}
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        <td>
                          {step.isCompleted ? (
                            <span className={styles.badgeCompleted}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              <span>Completed</span>
                            </span>
                          ) : (
                            <span className={styles.badgePending}>
                              Pending
                            </span>
                          )}
                        </td>

                        <td>
                          {isManuallyUnlocked ? (
                            <span className={styles.badgeManualUnlock}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                              </svg>
                              <span>Manual Unlock</span>
                            </span>
                          ) : isManuallyLocked ? (
                            <span className={styles.badgeManualRelock}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                              </svg>
                              <span>Manual Relock</span>
                            </span>
                          ) : (
                            <span className={styles.badgeAutomatic}>
                              Automatic
                            </span>
                          )}
                        </td>

                        <td>
                          {step.overrideReason ? (
                            <span
                              className={styles.overrideNoteText}
                              title={`Overridden at: ${step.overriddenAt ? new Date(step.overriddenAt).toLocaleString() : ""}`}
                            >
                              "{step.overrideReason}"
                            </span>
                          ) : (
                            <span style={{ color: "#d1c7bc" }}>—</span>
                          )}
                        </td>

                        <td style={{ textAlign: "right" }}>
                          <div className={styles.actionBtnGroup}>
                            {step.isUnlocked ? (
                              <button
                                type="button"
                                onClick={() => openOverrideModal("relock", step)}
                                className={styles.actionBtnLock}
                                title="Manually lock this step for this learner"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                </svg>
                                <span>Lock</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openOverrideModal("unlock", step)}
                                className={styles.actionBtnUnlock}
                                title="Manually unlock this step for this learner"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                  <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                                </svg>
                                <span>Unlock</span>
                              </button>
                            )}

                            {(isManuallyUnlocked || isManuallyLocked) && (
                              <button
                                type="button"
                                onClick={() => openOverrideModal("reset", step)}
                                className={styles.actionBtnReset}
                                title="Reset override back to automated rules"
                              >
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                  <path d="M3 3v5h5" />
                                </svg>
                                <span>Reset</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Step Details Accordion */}
                      {expandedStepIds[step.stepId] && (
                        <tr key={`${step.stepId}-details`} className={styles.expandedDetailsRow}>
                          <td colSpan={7}>
                            <div className={styles.expandedDetailsContent}>
                              <div className={styles.expandedHeader}>
                                <h4 className={styles.expandedHeaderTitle}>
                                  Step Content Breakdown ({step.completedItems ?? 0} of {step.totalItems ?? 0} Completed)
                                </h4>
                                {typeof step.progressPercent === "number" && (
                                  <span className={styles.expandedHeaderProgress}>
                                    Step Progress: {step.progressPercent}%
                                  </span>
                                )}
                              </div>

                              {(!step.lessons || step.lessons.length === 0) && !step.quiz ? (
                                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)" }}>
                                  No lessons or quiz in this step.
                                </p>
                              ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                  {step.lessons?.map((lesson) => {
                                    const isMedia = lesson.type === "VIDEO" || lesson.type === "AUDIO";
                                    const isVideo = lesson.type === "VIDEO";
                                    const isPdf = lesson.type === "PDF";

                                    return (
                                      <div key={lesson.lessonId} className={styles.lessonRowCard}>
                                        <div className={styles.lessonLeft}>
                                          <div
                                            className={styles.lessonTypeIcon}
                                            style={{
                                              background: isVideo ? "#ede9fe" : isMedia ? "#e0f2fe" : isPdf ? "#ffe4e6" : "#fef3c7",
                                              color: isVideo ? "#7c3aed" : isMedia ? "#0284c7" : isPdf ? "#e11d48" : "#d97706",
                                            }}
                                          >
                                            {isVideo ? (
                                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                <polygon points="23 7 16 12 23 17 23 7" />
                                                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                                              </svg>
                                            ) : isMedia ? (
                                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                                                <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
                                              </svg>
                                            ) : isPdf ? (
                                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                                <polyline points="14 2 14 8 20 8" />
                                              </svg>
                                            ) : (
                                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                                <polyline points="14 2 14 8 20 8" />
                                                <line x1="16" y1="13" x2="8" y2="13" />
                                                <line x1="16" y1="17" x2="8" y2="17" />
                                              </svg>
                                            )}
                                          </div>

                                          <div style={{ display: "flex", flexDirection: "column" }}>
                                            <span className={styles.lessonTitle}>{lesson.title}</span>
                                            <span className={styles.lessonSub}>
                                              {lesson.type} {lesson.durationSec ? `• ${formatDuration(lesson.durationSec)}` : ""}
                                            </span>
                                          </div>
                                        </div>

                                        {isMedia ? (
                                          <div className={styles.mediaProgressCol}>
                                            <div className={styles.mediaMiniBar}>
                                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--text-muted)" }}>
                                                <span>{formatDuration(lesson.lastPositionSec)} / {formatDuration(lesson.durationSec)}</span>
                                                <span style={{ fontWeight: 700, color: lesson.isCompleted ? "#15803d" : "var(--accent-primary)" }}>
                                                  {Math.round(lesson.progressPercent)}%
                                                </span>
                                              </div>
                                              <div className={styles.mediaMiniBarTrack}>
                                                <div
                                                  className={styles.mediaMiniBarFill}
                                                  style={{
                                                    width: `${Math.min(100, lesson.progressPercent)}%`,
                                                    backgroundColor: lesson.isCompleted ? "#15803d" : "var(--accent-primary)",
                                                  }}
                                                />
                                              </div>
                                            </div>

                                            <span
                                              style={{
                                                fontSize: "0.75rem",
                                                fontWeight: 700,
                                                padding: "2px 8px",
                                                borderRadius: 4,
                                                background: lesson.isCompleted ? "#dcfce7" : "#f5ece1",
                                                color: lesson.isCompleted ? "#15803d" : "var(--text-muted)",
                                                whiteSpace: "nowrap",
                                              }}
                                            >
                                              {lesson.isCompleted ? "✓ Viewed" : lesson.progressPercent > 0 ? "In Progress" : "Unwatched"}
                                            </span>
                                          </div>
                                        ) : (
                                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                            {lesson.completedAt && (
                                              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                                Completed {new Date(lesson.completedAt).toLocaleDateString()}
                                              </span>
                                            )}
                                            <span
                                              style={{
                                                fontSize: "0.75rem",
                                                fontWeight: 700,
                                                padding: "2px 8px",
                                                borderRadius: 4,
                                                background: lesson.isCompleted ? "#dcfce7" : "#f5ece1",
                                                color: lesson.isCompleted ? "#15803d" : "var(--text-muted)",
                                              }}
                                            >
                                              {lesson.isCompleted ? (lesson.type === "PDF" ? "✓ Opened" : "✓ Read") : "Pending"}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}

                                  {step.quiz && (
                                    <div className={styles.lessonRowCard}>
                                      <div className={styles.lessonLeft}>
                                        <div
                                          className={styles.lessonTypeIcon}
                                          style={{ background: "#faf5ff", color: "#7e22ce" }}
                                        >
                                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                            <circle cx="12" cy="12" r="10" />
                                            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                                            <line x1="12" y1="17" x2="12.01" y2="17" />
                                          </svg>
                                        </div>
                                        <div style={{ display: "flex", flexDirection: "column" }}>
                                          <span className={styles.lessonTitle}>Step Knowledge Quiz</span>
                                          <span className={styles.lessonSub}>
                                            Pass mark: {step.quiz.passMark}% &bull; {step.quiz.attemptsCount} attempt{step.quiz.attemptsCount === 1 ? "" : "s"}
                                          </span>
                                        </div>
                                      </div>

                                      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                                        <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                                          Best Score: <strong>{step.quiz.bestScore != null ? `${step.quiz.bestScore}%` : "No attempts"}</strong>
                                        </span>
                                        <span
                                          style={{
                                            fontSize: "0.75rem",
                                            fontWeight: 700,
                                            padding: "2px 8px",
                                            borderRadius: 4,
                                            background: step.quiz.isPassed ? "#dcfce7" : step.quiz.attemptsCount > 0 ? "#fee2e2" : "#f5ece1",
                                            color: step.quiz.isPassed ? "#15803d" : step.quiz.attemptsCount > 0 ? "#991b1b" : "var(--text-muted)",
                                          }}
                                        >
                                          {step.quiz.isPassed ? "✓ Passed" : step.quiz.attemptsCount > 0 ? "Failed" : "Not Attempted"}
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 5. Learner Session Attendance & Reconciliation History */}
      <section className={styles.progressionSection}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Session Attendance &amp; Reconciliation History</h2>
            <p className={styles.sectionSubtitle}>
              Live cohort and 1-on-1 coaching attendance records, timestamps, and manual overrides.
            </p>
          </div>
          {attendanceHistory && (
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <span
                style={{
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  padding: "4px 10px",
                  borderRadius: "6px",
                  background: attendanceHistory.overallAttendancePercentage >= 75 ? "#ecfdf5" : "#fef2f2",
                  color: attendanceHistory.overallAttendancePercentage >= 75 ? "#047857" : "#b91c1c",
                  border: `1px solid ${attendanceHistory.overallAttendancePercentage >= 75 ? "#a7f3d0" : "#fecaca"}`,
                }}
              >
                {attendanceHistory.overallAttendancePercentage}% Attendance ({attendanceHistory.totalAttendedSessions}/{attendanceHistory.totalScheduledSessions} Sessions)
              </span>
            </div>
          )}
        </div>

        {loadingAttendance ? (
          <div style={{ textAlign: "center", padding: "2.5rem", color: "var(--text-muted)" }}>
            Loading session attendance history...
          </div>
        ) : !attendanceHistory || attendanceHistory.history.length === 0 ? (
          <div style={{ textAlign: "center", padding: "2.5rem", color: "var(--text-muted)" }}>
            No sessions or attendance records found for this learner yet.
          </div>
        ) : (
          <div className={styles.attendanceTableWrapper}>
            <table className={styles.attendanceTable}>
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Cohort / Track</th>
                  <th>When (Local)</th>
                  <th>Minutes Present</th>
                  <th>Attendance %</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Override Reason</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {attendanceHistory.history.map((record) => {
                  const startTime = new Date(record.startTimeUtc);
                  const isPresent =
                    record.status === "PRESENT" ||
                    record.status === "PRESENT_AUTO" ||
                    record.status === "PRESENT_MANUAL" ||
                    record.status === "CORRECTED";

                  return (
                    <tr key={record.sessionId}>
                      <td>
                        <strong>{record.sessionTitle}</strong>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
                          {record.sessionType === "ONE_ON_ONE" ? "1-on-1 Coaching" : "Cohort Session"}
                        </div>
                      </td>
                      <td>
                        <span>{record.batchName || record.programTitle || "—"}</span>
                      </td>
                      <td>
                        <span>
                          {startTime.toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          {startTime.toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </td>
                      <td>
                        <span>{record.minutesPresent} min</span>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginLeft: "4px" }}>
                          / {record.durationMinutes} min
                        </span>
                      </td>
                      <td>
                        <strong style={{ color: isPresent ? "#047857" : "#b91c1c" }}>
                          {Math.round(record.attendancePercentage)}%
                        </strong>
                      </td>
                      <td>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "0.2rem 0.5rem",
                            borderRadius: "4px",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            background: isPresent ? "#ecfdf5" : "#fef2f2",
                            color: isPresent ? "#047857" : "#b91c1c",
                          }}
                        >
                          {record.status}
                        </span>
                      </td>
                      <td>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "0.15rem 0.45rem",
                            borderRadius: "4px",
                            fontSize: "0.72rem",
                            fontWeight: 600,
                            background: "#f1f5f9",
                            color: "#475569",
                          }}
                        >
                          {record.source}
                        </span>
                      </td>
                      <td>
                        {record.overrideReason ? (
                          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                            {record.overrideReason}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {record.batchId && (
                          <Link
                            href={`/batches/${record.batchId}/sessions/${record.sessionId}/attendance`}
                            style={{
                              fontSize: "0.8rem",
                              fontWeight: 600,
                              color: "var(--accent-primary, #c97a1e)",
                              textDecoration: "none",
                            }}
                          >
                            Manage Attendance &rarr;
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 6. Manual Override Confirmation Modal */}
      {activeModal && targetStep && (
        <div className={styles.modalOverlay} onClick={closeOverrideModal}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>
                {activeModal === "unlock" && `Manual Unlock — Step ${targetStep.sequence}`}
                {activeModal === "relock" && `Manual Relock — Step ${targetStep.sequence}`}
                {activeModal === "reset" && `Reset Override — Step ${targetStep.sequence}`}
              </h2>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={closeOverrideModal}
                disabled={submittingOverride}
                title="Close dialog (Esc)"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleOverrideSubmit}>
              <div className={styles.modalBody}>
                {modalError && (
                  <div className={styles.alertError} style={{ marginBottom: "1rem" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>{modalError}</span>
                  </div>
                )}

                <div className={styles.modalNotice}>
                  {activeModal === "unlock" && (
                    <>
                      You are about to <strong>manually grant access</strong> to <em>"{targetStep.title}"</em> for learner <strong>{user.name}</strong>, bypassing cohort release schedules and milestone prerequisite gates.
                    </>
                  )}
                  {activeModal === "relock" && (
                    <>
                      You are about to <strong>manually revoke access</strong> to <em>"{targetStep.title}"</em> for learner <strong>{user.name}</strong>. The step will remain locked until manually cleared or re-evaluated.
                    </>
                  )}
                  {activeModal === "reset" && (
                    <>
                      This will remove the manual override and restore automated progression logic based on prerequisite completion and release schedules.
                    </>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="reason" className={styles.formLabel}>
                    Reason for Override {activeModal !== "reset" && <span style={{ color: "#dc2626" }}>*</span>}
                  </label>
                  <textarea
                    id="reason"
                    rows={3}
                    className={styles.formTextarea}
                    placeholder={
                      activeModal === "unlock"
                        ? "e.g., Learner demonstrated exceptional readiness or has fast-track cohort approval."
                        : activeModal === "relock"
                        ? "e.g., Academic review required before proceeding; prerequisite remediations needed."
                        : "Optional administrative notes for resetting to automatic progression."
                    }
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    required={activeModal !== "reset"}
                    disabled={submittingOverride}
                  />
                  <span className={styles.formHint}>
                    This administrative reason is permanently logged to the system audit trail.
                  </span>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.modalCancelBtn}
                  onClick={closeOverrideModal}
                  disabled={submittingOverride}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`${styles.modalSubmitBtn} ${activeModal === "relock" ? styles.modalSubmitBtnDanger : ""}`}
                  disabled={submittingOverride}
                >
                  {submittingOverride
                    ? "Applying..."
                    : activeModal === "unlock"
                    ? "Confirm Unlock"
                    : activeModal === "relock"
                    ? "Confirm Relock"
                    : "Confirm Reset"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
