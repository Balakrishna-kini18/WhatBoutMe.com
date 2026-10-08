"use client";

import { useEffect, useState, use, Fragment } from "react";
import styles from "../../page.module.css";
import Link from "next/link";
import { API_URL, errorMessage } from "../../lib/api";

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

  // Expanded steps for content inspection (video watch stats, PDF read, quiz attempts)
  const [expandedStepIds, setExpandedStepIds] = useState<Record<string, boolean>>({});

  const toggleStepExpand = (stepId: string) => {
    setExpandedStepIds((prev) => ({
      ...prev,
      [stepId]: !prev[stepId],
    }));
  };

  // Load user profile & enrolments
  useEffect(() => {
    async function loadUser() {
      setLoading(true);
      setActionError(null);
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_URL}/users/${userId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          throw new Error(await errorMessage(res, "Failed to load learner details"));
        }
        const data = await res.json();
        setUser(data);
        if (data.enrolments && data.enrolments.length > 0) {
          setSelectedEnrolmentId(data.enrolments[0].id);
        }
      } catch (err: any) {
        setActionError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadUser();
  }, [userId]);

  // Load progression when selected enrolment changes
  useEffect(() => {
    if (!selectedEnrolmentId) {
      setProgression(null);
      return;
    }
    fetchProgression(selectedEnrolmentId);
  }, [selectedEnrolmentId]);

  async function fetchProgression(enrolmentId: string) {
    setLoadingProgression(true);
    setCompliance(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/progression/enrolments/${enrolmentId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to fetch enrolment progression"));
      }
      const data = await res.json();
      setProgression(data);

      try {
        const cres = await fetch(`${API_URL}/attendance/compliance/${enrolmentId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (cres.ok) {
          setCompliance(await cres.json());
        }
      } catch (ce) {
        console.error("Failed to fetch compliance", ce);
      }
    } catch (err: any) {
      setActionError(err.message);
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
      <div className={styles.dashboard}>
        <header className={styles.header}>
          <div className={styles.headerText}>
            <Link href="/users" className={styles.backLink}>← Back to Users</Link>
            <h1 className={styles.title}>Loading learner profile...</h1>
          </div>
        </header>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={styles.dashboard}>
        <header className={styles.header}>
          <div className={styles.headerText}>
            <Link href="/users" className={styles.backLink}>← Back to Users</Link>
            <h1 className={styles.title}>Learner not found</h1>
            {actionError && <p className={styles.errorBanner}>{actionError}</p>}
          </div>
        </header>
      </div>
    );
  }

  const selectedEnrolment = user.enrolments?.find((e) => e.id === selectedEnrolmentId);

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <Link href="/users" className={styles.backLink}>← Back to Users</Link>
          <h1 className={styles.title}>{user.name}</h1>
          <p className={styles.subtitle}>
            {user.email} • Role: {user.role} • Joined: {new Date(user.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.secondaryBtn}
            onClick={handleRecalculate}
            disabled={!selectedEnrolmentId || loadingProgression}
            title="Recalculate progression locks and completions according to program schedule and quiz results"
          >
            Recalculate Progression
          </button>
        </div>
      </header>

      {actionError && (
        <div style={{ backgroundColor: "#fef2f2", border: "1px solid #f87171", color: "#991b1b", padding: "12px 16px", borderRadius: "8px", marginBottom: "1rem" }}>
          ⚠️ {actionError}
        </div>
      )}

      {actionSuccess && (
        <div style={{ backgroundColor: "#f0fdf4", border: "1px solid #86efac", color: "#166534", padding: "12px 16px", borderRadius: "8px", marginBottom: "1rem" }}>
          ✓ {actionSuccess}
        </div>
      )}

      {/* Enrolment Selector if user has multiple enrolments */}
      {user.enrolments && user.enrolments.length > 0 && (
        <div style={{ marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "12px", background: "white", padding: "12px 16px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
          <label style={{ fontWeight: 600, fontSize: "0.875rem", color: "#475569" }}>
            Select Enrolment:
          </label>
          <select
            value={selectedEnrolmentId}
            onChange={(e) => setSelectedEnrolmentId(e.target.value)}
            style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.875rem", minWidth: "280px" }}
          >
            {user.enrolments.map((enr) => (
              <option key={enr.id} value={enr.id}>
                {enr.batch?.program?.title || "Program"} — {enr.batch?.name || "Batch"} ({enr.status})
              </option>
            ))}
          </select>
          <span style={{ fontSize: "0.875rem", color: "#64748b" }}>
            Status: <strong style={{ textTransform: "uppercase" }}>{selectedEnrolment?.status}</strong>
          </span>
        </div>
      )}

      {/* Stats Grid */}
      {(() => {
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

        const progressColor = overallPct === 100 ? "#16a34a" : overallPct > 0 ? "#f59e0b" : "#cbd5e1";

        return (
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statHeader}>
                <h3>Overall Progress</h3>
              </div>
              <div className={styles.statBody}>
                <p className={styles.statValue} style={{ color: overallPct === 100 ? "#16a34a" : undefined }}>
                  {overallPct}%
                </p>
                <div className={styles.progressBar} style={{ width: "100%", marginTop: "0.5rem" }}>
                  <div
                    className={styles.progressFill}
                    style={{ width: `${overallPct}%`, backgroundColor: progressColor }}
                  ></div>
                </div>
              </div>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statHeader}>
                <h3>Completed Steps</h3>
              </div>
              <div className={styles.statBody}>
                <p className={styles.statValue}>
                  {completedSteps} / {totalSteps}
                </p>
                <div className={styles.statTrendWrapper}>
                  <span className={styles.statTrendNeutral}>
                    {progression?.steps?.filter((s) => s.isUnlocked).length || 0} unlocked
                  </span>
                </div>
              </div>
            </div>

            {compliance && compliance.status !== 'NOT_APPLICABLE' && (
              <div className={styles.statCard}>
                <div className={styles.statHeader}>
                  <h3>Attendance</h3>
                </div>
                <div className={styles.statBody}>
                  <p className={styles.statValue} style={{ color: compliance.status === 'COMPLIANT' ? "#16a34a" : "#dc2626" }}>
                    {Math.round(compliance.attendancePercentage)}%
                  </p>
                  <div className={styles.statTrendWrapper}>
                    <span className={compliance.status === 'COMPLIANT' ? styles.statTrendPositive : styles.statTrendNegative} style={{
                      background: compliance.status === 'COMPLIANT' ? '#ecfdf5' : '#fef2f2',
                      color: compliance.status === 'COMPLIANT' ? '#059669' : '#dc2626',
                      padding: '2px 6px',
                      borderRadius: '4px'
                    }}>
                      {compliance.status === 'COMPLIANT' ? "Compliant" : "Low Attendance"} 
                      ({compliance.attendedSessionCount}/{compliance.requiredSessionCount} sessions)
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className={styles.statCard}>
              <div className={styles.statHeader}>
                <h3>Videos &amp; Audio</h3>
              </div>
              <div className={styles.statBody}>
                <p className={styles.statValue}>
                  {completedVideos} / {totalVideos}
                </p>
                <div className={styles.statTrendWrapper}>
                  <span className={completedVideos === totalVideos && totalVideos > 0 ? styles.statTrendPositive : styles.statTrendNeutral}>
                    {totalVideos > 0 ? `${Math.round((completedVideos / totalVideos) * 100)}% watched` : "No media"}
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statHeader}>
                <h3>Documents &amp; Text</h3>
              </div>
              <div className={styles.statBody}>
                <p className={styles.statValue}>
                  {completedDocs} / {totalDocs}
                </p>
                <div className={styles.statTrendWrapper}>
                  <span className={completedDocs === totalDocs && totalDocs > 0 ? styles.statTrendPositive : styles.statTrendNeutral}>
                    {totalDocs > 0 ? `${Math.round((completedDocs / totalDocs) * 100)}% read` : "No documents"}
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statHeader}>
                <h3>Quizzes Passed</h3>
              </div>
              <div className={styles.statBody}>
                <p className={styles.statValue}>
                  {passedQuizzes} / {totalQuizzes}
                </p>
                <div className={styles.statTrendWrapper}>
                  <span className={passedQuizzes === totalQuizzes && totalQuizzes > 0 ? styles.statTrendPositive : styles.statTrendNeutral}>
                    {totalQuizzes > 0 ? `${Math.round((passedQuizzes / totalQuizzes) * 100)}% passed` : "No quizzes"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* D1-034: Step Progression & Manual Overrides Section */}
      <section className={styles.tableSection}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Step Progression & Manual Overrides</h2>
            <p style={{ fontSize: "0.85rem", color: "#64748b", margin: "4px 0 0" }}>
              View sequential progression and manage administrative unlock/relock overrides. All overrides require an audit reason.
            </p>
          </div>
        </div>

        {loadingProgression ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
            Loading step progression...
          </div>
        ) : !progression || !progression.steps || progression.steps.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
            No program steps found for this enrolment.
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.adminTable}>
              <thead>
                <tr>
                  <th style={{ width: "60px" }}>#</th>
                  <th>Step Title</th>
                  <th>Access State</th>
                  <th>Completion</th>
                  <th>Override State</th>
                  <th>Override Notes</th>
                  <th className={styles.alignRight}>Actions</th>
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
                          <span style={{ fontWeight: 600, color: "#475569" }}>
                            {step.sequence}
                          </span>
                        </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span style={{ fontWeight: 600, color: "#1e293b" }}>{step.title}</span>
                          {step.scheduledUnlockDate && (
                            <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                              Scheduled: {new Date(step.scheduledUnlockDate).toLocaleDateString()}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => toggleStepExpand(step.stepId)}
                            style={{
                              background: "none",
                              border: "none",
                              color: "#0284c7",
                              cursor: "pointer",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              padding: 0,
                              marginTop: "6px",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                              textAlign: "left",
                            }}
                          >
                            {expandedStepIds[step.stepId]
                              ? "▲ Hide Content"
                              : `▼ View Content (${step.completedItems ?? 0}/${step.totalItems ?? 0} done)`}
                          </button>
                        </div>
                      </td>
                      <td>
                        {step.isUnlocked ? (
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              backgroundColor: "#dcfce7",
                              color: "#166534",
                            }}
                          >
                            UNLOCKED
                          </span>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                fontSize: "0.75rem",
                                fontWeight: 600,
                                backgroundColor: "#fee2e2",
                                color: "#991b1b",
                              }}
                            >
                              LOCKED
                            </span>
                            {step.lockReason && (
                              <span style={{ fontSize: "0.7rem", color: "#991b1b" }}>
                                {step.lockReason.replace(/_/g, " ")}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        {step.isCompleted ? (
                          <span style={{ color: "#166534", fontWeight: 600, fontSize: "0.8rem" }}>
                            ✓ Completed
                          </span>
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>
                            Pending
                          </span>
                        )}
                      </td>
                      <td>
                        {isManuallyUnlocked ? (
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: "4px",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              backgroundColor: "#fef3c7",
                              color: "#92400e",
                              border: "1px solid #fde68a",
                            }}
                          >
                            MANUAL UNLOCK
                          </span>
                        ) : isManuallyLocked ? (
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: "4px",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              backgroundColor: "#f3e8ff",
                              color: "#6b21a8",
                              border: "1px solid #e9d5ff",
                            }}
                          >
                            MANUAL RELOCK
                          </span>
                        ) : (
                          <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                            Automatic
                          </span>
                        )}
                      </td>
                      <td>
                        {step.overrideReason ? (
                          <span
                            style={{ fontSize: "0.8rem", color: "#334155", fontStyle: "italic" }}
                            title={`Overridden at: ${step.overriddenAt ? new Date(step.overriddenAt).toLocaleString() : ""}`}
                          >
                            "{step.overrideReason}"
                          </span>
                        ) : (
                          <span style={{ fontSize: "0.8rem", color: "#cbd5e1" }}>—</span>
                        )}
                      </td>
                      <td className={styles.alignRight}>
                        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                          {step.isUnlocked ? (
                            <button
                              type="button"
                              onClick={() => openOverrideModal("relock", step)}
                              style={{
                                padding: "4px 10px",
                                fontSize: "0.75rem",
                                borderRadius: "4px",
                                border: "1px solid #fca5a5",
                                backgroundColor: "#fff1f2",
                                color: "#9f1239",
                                cursor: "pointer",
                                fontWeight: 500,
                              }}
                              title="Manually lock this step for this learner"
                            >
                              Lock
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openOverrideModal("unlock", step)}
                              style={{
                                padding: "4px 10px",
                                fontSize: "0.75rem",
                                borderRadius: "4px",
                                border: "1px solid #86efac",
                                backgroundColor: "#f0fdf4",
                                color: "#166534",
                                cursor: "pointer",
                                fontWeight: 500,
                              }}
                              title="Manually unlock this step for this learner"
                            >
                              Unlock
                            </button>
                          )}

                          {(isManuallyUnlocked || isManuallyLocked) && (
                            <button
                              type="button"
                              onClick={() => openOverrideModal("reset", step)}
                              style={{
                                padding: "4px 10px",
                                fontSize: "0.75rem",
                                borderRadius: "4px",
                                border: "1px solid #cbd5e1",
                                backgroundColor: "#f8fafc",
                                color: "#475569",
                                cursor: "pointer",
                              }}
                              title="Reset override back to automated rules"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedStepIds[step.stepId] && (
                      <tr key={`${step.stepId}-details`} style={{ backgroundColor: "#f8fafc" }}>
                        <td colSpan={7} style={{ padding: "16px 24px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <h4 style={{ margin: 0, fontSize: "0.85rem", color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                Step Content Breakdown ({step.completedItems ?? 0} of {step.totalItems ?? 0} Completed)
                              </h4>
                              {typeof step.progressPercent === "number" && (
                                <span style={{ fontSize: "0.8rem", fontWeight: 700, color: step.isCompleted ? "#166534" : "#0284c7" }}>
                                  Step Progress: {step.progressPercent}%
                                </span>
                              )}
                            </div>

                            {(!step.lessons || step.lessons.length === 0) && !step.quiz ? (
                              <p style={{ margin: 0, fontSize: "0.85rem", color: "#94a3b8" }}>No lessons or quiz in this step.</p>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                {step.lessons?.map((lesson) => {
                                  const isMedia = lesson.type === "VIDEO" || lesson.type === "AUDIO";
                                  return (
                                    <div
                                      key={lesson.lessonId}
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        padding: "10px 14px",
                                        backgroundColor: "#ffffff",
                                        borderRadius: "6px",
                                        border: "1px solid #e2e8f0",
                                        fontSize: "0.85rem",
                                      }}
                                    >
                                      <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
                                        <span style={{ fontSize: "1.1rem" }}>
                                          {lesson.type === "VIDEO" ? "🎬" : lesson.type === "AUDIO" ? "🎧" : lesson.type === "PDF" ? "📄" : "📝"}
                                        </span>
                                        <div style={{ display: "flex", flexDirection: "column" }}>
                                          <span style={{ fontWeight: 600, color: "#1e293b" }}>{lesson.title}</span>
                                          <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                                            {lesson.type} {lesson.durationSec ? `• ${formatDuration(lesson.durationSec)}` : ""}
                                          </span>
                                        </div>
                                      </div>

                                      {isMedia ? (
                                        <div style={{ display: "flex", alignItems: "center", gap: "16px", minWidth: "260px" }}>
                                          <div style={{ flex: 1 }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "4px" }}>
                                              <span style={{ color: "#64748b" }}>
                                                {formatDuration(lesson.lastPositionSec)} / {formatDuration(lesson.durationSec)}
                                              </span>
                                              <span style={{ fontWeight: 600, color: lesson.isCompleted ? "#166534" : "#0284c7" }}>
                                                {Math.round(lesson.progressPercent)}%
                                              </span>
                                            </div>
                                            <div style={{ width: "100%", height: "6px", backgroundColor: "#e2e8f0", borderRadius: "3px", overflow: "hidden" }}>
                                              <div
                                                style={{
                                                  width: `${Math.min(100, lesson.progressPercent)}%`,
                                                  height: "100%",
                                                  backgroundColor: lesson.isCompleted ? "#16a34a" : "#0284c7",
                                                }}
                                              />
                                            </div>
                                          </div>
                                          <span
                                            style={{
                                              padding: "2px 8px",
                                              borderRadius: "4px",
                                              fontSize: "0.75rem",
                                              fontWeight: 600,
                                              backgroundColor: lesson.isCompleted ? "#dcfce7" : "#f1f5f9",
                                              color: lesson.isCompleted ? "#166534" : "#64748b",
                                              whiteSpace: "nowrap",
                                            }}
                                          >
                                            {lesson.isCompleted ? "✓ Viewed" : lesson.progressPercent > 0 ? "In Progress" : "Unwatched"}
                                          </span>
                                        </div>
                                      ) : (
                                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                          {lesson.completedAt && (
                                            <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                                              Completed {new Date(lesson.completedAt).toLocaleDateString()}
                                            </span>
                                          )}
                                          <span
                                            style={{
                                              padding: "2px 8px",
                                              borderRadius: "4px",
                                              fontSize: "0.75rem",
                                              fontWeight: 600,
                                              backgroundColor: lesson.isCompleted ? "#dcfce7" : "#f1f5f9",
                                              color: lesson.isCompleted ? "#166534" : "#64748b",
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
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "space-between",
                                      padding: "10px 14px",
                                      backgroundColor: "#ffffff",
                                      borderRadius: "6px",
                                      border: "1px solid #e2e8f0",
                                      fontSize: "0.85rem",
                                    }}
                                  >
                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                      <span style={{ fontSize: "1.1rem" }}>❓</span>
                                      <div style={{ display: "flex", flexDirection: "column" }}>
                                        <span style={{ fontWeight: 600, color: "#1e293b" }}>Step Knowledge Quiz</span>
                                        <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                                          Pass mark: {step.quiz.passMark}% • {step.quiz.attemptsCount} attempt{step.quiz.attemptsCount === 1 ? "" : "s"}
                                        </span>
                                      </div>
                                    </div>

                                    <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                                      <span style={{ fontSize: "0.8rem", color: "#334155" }}>
                                        Best Score: <strong>{step.quiz.bestScore != null ? `${step.quiz.bestScore}%` : "No attempts"}</strong>
                                      </span>
                                      <span
                                        style={{
                                          padding: "2px 8px",
                                          borderRadius: "4px",
                                          fontSize: "0.75rem",
                                          fontWeight: 600,
                                          backgroundColor: step.quiz.isPassed ? "#dcfce7" : step.quiz.attemptsCount > 0 ? "#fee2e2" : "#f1f5f9",
                                          color: step.quiz.isPassed ? "#166534" : step.quiz.attemptsCount > 0 ? "#991b1b" : "#64748b",
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

      {/* Manual Override Dialog Modal */}
      {activeModal && targetStep && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} style={{ maxWidth: "520px" }}>
            <div className={styles.modalHeader}>
              <h2 style={{ fontSize: "1.25rem", margin: 0 }}>
                {activeModal === "unlock" && `Manual Unlock — Step ${targetStep.sequence}`}
                {activeModal === "relock" && `Manual Relock — Step ${targetStep.sequence}`}
                {activeModal === "reset" && `Reset Override — Step ${targetStep.sequence}`}
              </h2>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={closeOverrideModal}
                disabled={submittingOverride}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleOverrideSubmit}>
              <div className={styles.modalBody}>
                {modalError && (
                  <div style={{ backgroundColor: "#fef2f2", border: "1px solid #f87171", color: "#991b1b", padding: "10px", borderRadius: "6px", marginBottom: "1rem", fontSize: "0.85rem" }}>
                    {modalError}
                  </div>
                )}

                <p style={{ fontSize: "0.875rem", color: "#475569", marginBottom: "1rem" }}>
                  {activeModal === "unlock" && (
                    <>
                      You are about to <strong>manually grant access</strong> to <em>"{targetStep.title}"</em> for learner <strong>{user.name}</strong>, bypassing scheduled release gates.
                    </>
                  )}
                  {activeModal === "relock" && (
                    <>
                      You are about to <strong>manually revoke access</strong> to <em>"{targetStep.title}"</em> for learner <strong>{user.name}</strong>.
                    </>
                  )}
                  {activeModal === "reset" && (
                    <>
                      This will remove the manual override and restore automated progression logic based on prerequisite completion and release schedules.
                    </>
                  )}
                </p>

                <div className={styles.formGroup}>
                  <label htmlFor="reason" style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                    Reason for Override {activeModal !== "reset" && <span style={{ color: "#ef4444" }}>*</span>}
                  </label>
                  <textarea
                    id="reason"
                    rows={3}
                    className={styles.formInput}
                    placeholder={
                      activeModal === "unlock"
                        ? "e.g., Learner demonstrated exceptional readiness or has fast-track approval."
                        : activeModal === "relock"
                        ? "e.g., Academic review required before proceeding; prerequisite remediations needed."
                        : "Optional administrative notes for resetting to automatic progression."
                    }
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    required={activeModal !== "reset"}
                    disabled={submittingOverride}
                    style={{ width: "100%", marginTop: "6px" }}
                  />
                  <span style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "4px", display: "block" }}>
                    This reason is permanently logged to the system audit trail.
                  </span>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={closeOverrideModal}
                  disabled={submittingOverride}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={activeModal === "relock" ? styles.dangerBtn : styles.primaryBtn}
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
