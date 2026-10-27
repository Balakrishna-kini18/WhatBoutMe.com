"use client";

import { useEffect, useState, use, Fragment } from "react";
import styles from "./UserDetail.module.css";
import Link from "next/link";
import { API_URL, errorMessage } from "../../lib/api";
import { CustomSelect, StatusBadge, InputDialog, useToast } from "../../components";

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
  program?: {
    id: string;
    title: string;
  };
  signedAgreement?: {
    id: string;
    templateId?: string;
    templateVersion?: string;
    status: string;
    signedAt: string;
    signatureType?: string;
    typedName?: string;
  } | null;
}

interface ManagedBatch {
  id: string;
  name: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  program?: {
    id: string;
    title: string;
  };
}

interface UserDetail {
  id: string;
  name: string;
  email: string;
  role: string;
  twoFactorEnabled?: boolean;
  status?: string;
  createdAt: string;
  managedBatches?: ManagedBatch[];
  enrolments?: EnrolmentOption[];
}

interface SignedRecordDetail {
  id: string;
  userId: string;
  templateId?: string;
  templateVersion: string;
  consentVersion?: string | null;
  signatureType?: string | null;
  signerIp: string | null;
  userAgent: string | null;
  signedAt: string;
  status: string;
  typedName: string | null;
  drawnSignature: string | null;
  scope?: string;
  paymentStatus?: string;
  enrolmentStatus?: string;
  programTitle?: string;
  program?: {
    id: string;
    title: string;
  };
  user?: {
    id: string;
    name?: string | null;
    email: string;
  };
  enrolment?: {
    id: string;
    status: string;
    batch?: {
      id: string;
      name: string;
    };
    payments?: Array<{
      id: string;
      status: string;
      amount: number;
      currency: string;
      stripeSessionId?: string;
    }>;
  };
  auditLogs?: Array<{
    id: string;
    action: string;
    entity: string;
    ip?: string;
    createdAt: string;
  }>;
}

function formatNumericDate(val?: string | Date | null): string {
  if (!val) return "—";
  const d = new Date(val);
  if (isNaN(d.getTime())) return "—";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
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

export interface StageStatus {
  stage: string;
  isUnlocked: boolean;
  isCompleted: boolean;
  isOverridden: boolean;
  completedAt: string | null;
  details: Record<string, any>;
  unmetPrerequisites: string[];
}

export interface LearnerProgressionStages {
  enrolmentId: string;
  userId: string;
  programId: string;
  batchId: string | null;
  certificateType: string;
  currentStage: string;
  stages: {
    STAGE_1_CURRICULUM?: StageStatus;
    STAGE_2_EXAM?: StageStatus;
    STAGE_3_ATTENDANCE?: StageStatus;
    STAGE_4_ONE_ON_ONE?: StageStatus;
    STAGE_5_MISSION_STATEMENT?: StageStatus;
    [key: string]: StageStatus | undefined;
  };
  allStagesCompleted: boolean;
  evaluatedAt: string;
}

export interface CertificateEligibility {
  isEligible: boolean;
  status: string;
  certificateType?: string;
  unmetRequirements?: string[];
  [key: string]: any;
}

export default function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const unwrappedParams = typeof (params as any)?.then === "function" ? use(params as any) : params;
  const userId = (unwrappedParams as { id?: string })?.id || "";

  const toast = useToast();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [selectedEnrolmentId, setSelectedEnrolmentId] = useState<string>("");
  const [progression, setProgression] = useState<EnrolmentProgression | null>(null);
  const [compliance, setCompliance] = useState<any>(null);
  const [attendanceHistory, setAttendanceHistory] = useState<LearnerAttendanceHistory | null>(null);

  // 5-Stage Progression State Machine & Certificate Eligibility
  const [stagesEval, setStagesEval] = useState<LearnerProgressionStages | null>(null);
  const [certEligibility, setCertEligibility] = useState<CertificateEligibility | null>(null);
  const [selectedStageKey, setSelectedStageKey] = useState<string | null>("STAGE_1_CURRICULUM");
  const [targetStageForOverride, setTargetStageForOverride] = useState<string | null>(null);
  const [submittingStageOverride, setSubmittingStageOverride] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadingProgression, setLoadingProgression] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Active Tab: "curriculum" or "attendance"
  const [activeTab, setActiveTab] = useState<"curriculum" | "attendance">("curriculum");

  // Digital Signature Modal state
  const [previewAgreementModal, setPreviewAgreementModal] = useState<SignedRecordDetail | null>(null);
  const [isLoadingAgreementModal, setIsLoadingAgreementModal] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Modal states for override actions
  const [activeModal, setActiveModal] = useState<"unlock" | "relock" | "reset" | null>(null);
  const [targetStep, setTargetStep] = useState<StepProgressionItem | null>(null);
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

  // Load user profile & enrolments reliably
  useEffect(() => {
    if (!userId || userId === "undefined") {
      setLoading(true);
      return;
    }

    let isCurrent = true;

    async function loadData() {
      setLoading(true);
  

      try {
        const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

        const res = await fetch(`${API_URL}/users/${userId}`, { headers });
        if (!isCurrent) return;

        if (!res.ok) {
          throw new Error(await errorMessage(res, "Failed to load learner details"));
        }

        const userData: UserDetail = await res.json();
        if (!isCurrent) return;

        setUser(userData);
        if (userData.enrolments && userData.enrolments.length > 0 && userData.enrolments[0]) {
          setSelectedEnrolmentId(userData.enrolments[0].id);
        }

        // Load attendance history asynchronously in background for learners
        if (userData.role === "USER") {
          fetch(`${API_URL}/attendance/user/${userId}`, { headers })
            .then(async (attRes) => {
              if (attRes.ok && isCurrent) {
                const attData = await attRes.json();
                if (isCurrent) setAttendanceHistory(attData);
              }
            })
            .catch(() => {});
        }
      } catch (err: any) {
        if (!isCurrent) return;
        console.error("Error loading user profile:", err);
        setLoadError(err.message || "Failed to load learner details");
      } finally {
        if (isCurrent) {
          setLoading(false);
        }
      }
    }

    loadData();
    return () => {
      isCurrent = false;
    };
  }, [userId]);

  // Load progression when selected enrolment changes (learners only)
  useEffect(() => {
    if (!selectedEnrolmentId || (user && user.role !== "USER")) {
      setProgression(null);
      return;
    }
    const controller = new AbortController();
    fetchProgression(selectedEnrolmentId, controller.signal);
    return () => controller.abort();
  }, [selectedEnrolmentId, user?.role]);

  async function fetchProgression(enrolmentId: string, signal?: AbortSignal) {
    setLoadingProgression(true);
    setCompliance(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      const res = await fetch(`${API_URL}/progression/enrolments/${enrolmentId}`, {
        headers,
        signal,
      });

      if (res.ok) {
        const progData: EnrolmentProgression = await res.json();
        setProgression(progData);
      } else {
        console.error("Progression fetch failed:", res.status);
      }

      // Check attendance compliance
      const compRes = await fetch(`${API_URL}/attendance/compliance/enrolment/${enrolmentId}`, {
        headers,
        signal,
      });
      if (compRes.ok) {
        const compData = await compRes.json();
        setCompliance(compData);
      }

      // 5-Stage Progression State Machine
      try {
        const stagesRes = await fetch(`${API_URL}/progression/enrolments/${enrolmentId}/stages`, {
          headers,
          signal,
        });
        if (stagesRes.ok) {
          const stagesData: LearnerProgressionStages = await stagesRes.json();
          setStagesEval(stagesData);
        }
      } catch (err) {
        console.warn("Could not fetch 5-stage progression evaluation", err);
      }

      // Certificate Eligibility Evaluation
      try {
        const certRes = await fetch(`${API_URL}/certificates/eligibility/${enrolmentId}`, {
          headers,
          signal,
        });
        if (certRes.ok) {
          const certData: CertificateEligibility = await certRes.json();
          setCertEligibility(certData);
        }
      } catch (err) {
        console.warn("Could not fetch certificate eligibility evaluation", err);
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("Error fetching progression:", err);
      }
    } finally {
      setLoadingProgression(false);
    }
  }

  // Handle stage override by administrator
  async function handleOverrideStageWithReason(reason: string) {
    if (!selectedEnrolmentId || !targetStageForOverride) return;
    setSubmittingStageOverride(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(
        `${API_URL}/progression/admin/enrolments/${selectedEnrolmentId}/stages/${targetStageForOverride}/override`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ reason }),
        }
      );

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to override stage gate"));
      }

      const stageFriendly = targetStageForOverride.replace(/^STAGE_\d+_/, "").replace(/_/g, " ");
      toast.success(`Stage override applied: ${stageFriendly}`);
      setTargetStageForOverride(null);
      await fetchProgression(selectedEnrolmentId);
    } catch (err: any) {
      toast.error(err.message || "Failed to override stage gate");
    } finally {
      setSubmittingStageOverride(false);
    }
  }

  // Handle recalculate progression
  async function handleRecalculate() {
    if (!selectedEnrolmentId || loadingProgression) return;
    setLoadingProgression(true);


    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(
        `${API_URL}/progression/admin/enrolments/${selectedEnrolmentId}/recalculate`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ reason: "Admin UI recalculate" }),
        }
      );

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to recalculate progression"));
      }

      toast.success("Progression recalculated successfully.");
      await fetchProgression(selectedEnrolmentId);
    } catch (err: any) {
      toast.error(err.message || "Failed to recalculate progression");
    } finally {
      setLoadingProgression(false);
    }
  }

  // Handle open Digital Signature & Audit Record modal
  async function handleOpenAgreementModal(signedAgreementId?: string) {
    if (!signedAgreementId) return;
    setIsLoadingAgreementModal(true);

    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(`${API_URL}/admin/agreement-templates/signed/${signedAgreementId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setPreviewAgreementModal(data);
      } else {
        throw new Error(await errorMessage(res, "Could not load signed agreement record"));
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load agreement audit record");
    } finally {
      setIsLoadingAgreementModal(false);
    }
  }

  // Handle PDF download
  async function handleDownloadSignedPdf(rec: SignedRecordDetail) {
    setDownloadingPdf(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_URL}/admin/agreement-templates/signed/${rec.id}/pdf`, {
        headers: {
          Accept: "application/pdf",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        throw new Error("Failed to download signed agreement PDF");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `agreement-${rec.user?.name || "learner"}-${rec.id.slice(0, 8)}.pdf`;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        link.remove();
        URL.revokeObjectURL(url);
      }, 500);
    } catch (err: any) {
      toast.error(err.message || "Could not download PDF");
    } finally {
      setDownloadingPdf(false);
    }
  }

  // Override modal actions
  const openOverrideModal = (type: "unlock" | "relock" | "reset", step: StepProgressionItem) => {
    setActiveModal(type);
    setTargetStep(step);
    setModalError(null);
  };

  const closeOverrideModal = () => {
    setActiveModal(null);
    setTargetStep(null);
    setModalError(null);
  };

  async function handleOverrideWithReason(reason: string) {
    if (!selectedEnrolmentId || !targetStep || !activeModal) return;
    setSubmittingOverride(true);
    setModalError(null);

    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const endpointAction =
        activeModal === "unlock"
          ? "unlock"
          : activeModal === "relock"
          ? "relock"
          : "reset-override";

      const res = await fetch(
        `${API_URL}/progression/admin/enrolments/${selectedEnrolmentId}/steps/${targetStep.stepId}/${endpointAction}`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            reason: reason.trim() || undefined,
          }),
        }
      );

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to apply manual override"));
      }

      const currentAction = activeModal;
      const currentSequence = targetStep.sequence;
      closeOverrideModal();
      toast.success(
        currentAction === "unlock"
          ? `Step ${currentSequence} manually unlocked.`
          : currentAction === "relock"
          ? `Step ${currentSequence} manually relocked.`
          : `Step ${currentSequence} manual override reset.`
      );
      await fetchProgression(selectedEnrolmentId);
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setSubmittingOverride(false);
    }
  }

  // Loading skeleton matching open layout
  if (loading) {
    return (
      <div className={styles.container} aria-busy="true" aria-label="Loading user profile">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", width: "160px" }}>
          <div className="skeleton" style={{ width: "14px", height: "14px", borderRadius: "4px" }} />
          <div className="skeleton" style={{ width: "130px", height: "14px", borderRadius: "4px" }} />
        </div>

        <div style={{ background: "#ffffff", border: "1px solid var(--border-light, #e7decb)", borderRadius: "12px", padding: "1rem 1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <div className="skeleton" style={{ width: "48px", height: "48px", borderRadius: "12px" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                <div className="skeleton" style={{ width: "180px", height: "22px", borderRadius: "6px" }} />
                <div className="skeleton" style={{ width: "240px", height: "14px", borderRadius: "4px" }} />
              </div>
            </div>
            <div className="skeleton" style={{ width: "120px", height: "36px", borderRadius: "8px" }} />
          </div>
        </div>

        <div className="skeleton" style={{ width: "100%", height: "42px", borderRadius: "10px" }} />
        <div className="skeleton" style={{ width: "100%", height: "220px", borderRadius: "12px" }} />
      </div>
    );
  }

  // Empty state
  if (!user) {
    return (
      <div className={styles.container}>
        <Link href="/users" className={styles.backLink}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span>Back to Users &amp; Enrolments</span>
        </Link>
        <div
          style={{
            background: "#ffffff",
            border: "1px solid var(--border-light, #e7decb)",
            borderRadius: "12px",
            padding: "3.5rem 2rem",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            gap: "1rem",
            boxShadow: "0 1px 3px rgba(20, 17, 15, 0.02)",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              background: "#fef3c7",
              color: "#b45309",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-hidden="true"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
            {loadError ? "Unable to Load Profile" : "Learner Account Not Found"}
          </h2>
          <p style={{ color: "var(--text-secondary)", margin: 0, maxWidth: "440px", fontSize: "0.875rem", lineHeight: 1.5 }}>
            {loadError || "The requested user account does not exist or has been removed."}
          </p>
          <Link href="/users" className={styles.actionBtnSecondary} style={{ marginTop: "0.5rem" }}>
            Return to Users &amp; Enrolments
          </Link>
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
      (acc, s) =>
        acc +
        (s.lessons?.filter((l) => l.type === "PDF" || l.type === "DOCUMENT" || l.type === "WORKSHEET").length || 0),
      0
    ) ?? 0;
  const completedDocs =
    progression?.steps?.reduce(
      (acc, s) =>
        acc +
        (s.lessons?.filter(
          (l) => (l.type === "PDF" || l.type === "DOCUMENT" || l.type === "WORKSHEET") && l.isCompleted
        ).length || 0),
      0
    ) ?? 0;

  const totalQuizzes = progression?.steps?.reduce((acc, s) => acc + (s.quiz ? 1 : 0), 0) ?? 0;
  const passedQuizzes = progression?.steps?.reduce((acc, s) => acc + (s.quiz?.isPassed ? 1 : 0), 0) ?? 0;

  return (
    <div className={styles.container}>
      {/* Back Navigation */}
      <div>
        <Link href="/users" className={styles.backLink}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span>Back to Users &amp; Enrolments</span>
        </Link>
      </div>

      {/* 1. Unified Profile Header Card */}
      <div className={styles.profileHeaderCard}>
        <div className={styles.headerIdentityRow}>
          <div className={styles.identityLeft}>
            {/* High-quality squircle avatar */}
            <div className={styles.avatarSquircle} aria-hidden="true">
              {getInitials(user.name)}
            </div>

            <div className={styles.identityDetails}>
              <div className={styles.nameRoleRow}>
                <h1 className={styles.learnerName}>{user.name}</h1>
                <StatusBadge status={user.role} />
              </div>

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
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span>Joined {formatNumericDate(user.createdAt)}</span>
                </span>
              </div>
            </div>
          </div>

          <div className={styles.headerActions}>
            {user.role === "USER" ? (
              <button
                type="button"
                className={styles.actionBtnSecondary}
                onClick={handleRecalculate}
                disabled={!selectedEnrolmentId || loadingProgression}
                title="Recalculate progression locks and gates"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ animation: loadingProgression ? "spin 1s linear infinite" : undefined }}>
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
                <span>{loadingProgression ? "Syncing..." : "Sync Progress"}</span>
              </button>
            ) : (
              <Link href="/users" className={styles.actionBtnSecondary}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m15 18-6-6 6-6" />
                </svg>
                <span>Return to Users</span>
              </Link>
            )}
          </div>
        </div>

        {/* Integrated Enrolment & Digital Agreement Bar */}
        {user.role === "USER" && user.enrolments && user.enrolments.length > 0 && (
          <div className={styles.headerContextBar}>
            <div className={styles.contextTrackGroup}>
              <span className={styles.contextLabel}>ENROLMENT:</span>
              {user.enrolments.length > 1 ? (
                <CustomSelect
                  value={selectedEnrolmentId}
                  onChange={setSelectedEnrolmentId}
                  minWidth="320px"
                  ariaLabel="Select Enrolment Track"
                  options={user.enrolments.map((enr) => ({
                    value: enr.id,
                    label: `${enr.batch?.program?.title || "Program"} — ${enr.batch?.name || "Batch"}`,
                  }))}
                />
              ) : (
                <span className={styles.trackText}>
                  {user.enrolments[0]?.batch?.program?.title || "Program"} &mdash; {user.enrolments[0]?.batch?.name || "Batch"}
                </span>
              )}
            </div>

            <div className={styles.contextAgreementGroup}>
              {selectedEnrolment?.signedAgreement && selectedEnrolment.signedAgreement.status === "SIGNED" ? (
                <button
                  type="button"
                  onClick={() => handleOpenAgreementModal(selectedEnrolment.signedAgreement?.id)}
                  disabled={isLoadingAgreementModal}
                  className={styles.agreementSignedBtn}
                  title="Click to view verified Digital Signature & Audit Record"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>
                    Agreement Signed ({formatNumericDate(selectedEnrolment.signedAgreement.signedAt)})
                  </span>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginLeft: "2px" }}>
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </button>
              ) : (
                <span className={styles.agreementPendingBadge}>
                  Pending Agreement Signature
                </span>
              )}
            </div>
          </div>
        )}
      </div>



      {/* 2. Learner Progression vs Staff Role View */}
      {user.role === "USER" ? (
        <>
          {/* Progress Overview Banner */}
          <div className={styles.progressBanner}>
            <div className={styles.progressColLeft}>
              <span className={styles.progressLabel}>Overall Progress</span>
              <div className={styles.progressTrack}>
                <div className={styles.progressFill} style={{ width: `${overallPct}%` }} />
              </div>
              <span className={styles.progressPct}>{overallPct}%</span>
            </div>

            <div className={styles.progressColRight}>
              <span className={styles.statItem}>
                <span>Steps:</span>
                <strong>{completedSteps} of {totalSteps}</strong>
              </span>

              {totalVideos > 0 && (
                <span className={styles.statItem}>
                  <span>Media:</span>
                  <strong>{completedVideos} of {totalVideos}</strong>
                </span>
              )}

              {totalDocs > 0 && (
                <span className={styles.statItem}>
                  <span>Docs:</span>
                  <strong>{completedDocs} of {totalDocs}</strong>
                </span>
              )}

              {totalQuizzes > 0 && (
                <span className={styles.statItem}>
                  <span>Quizzes:</span>
                  <strong>{passedQuizzes} of {totalQuizzes}</strong>
                </span>
              )}

              {compliance && compliance.status !== "NOT_APPLICABLE" && (
                <span className={styles.statItem}>
                  <span>Live Attendance:</span>
                  <strong style={{ color: compliance.status === "COMPLIANT" ? "#15803d" : "#dc2626" }}>
                    {Math.round(compliance.attendancePercentage)}%
                  </strong>
                </span>
              )}
            </div>
          </div>

          {/* 5-Stage Certification & Progression Pipeline Stepper */}
          <div className={styles.pipelineCard}>
            <div className={styles.pipelineHeader}>
              <div className={styles.pipelineTitleWrap}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--accent-primary, #c97a1e)" }}>
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
                <h3 className={styles.pipelineTitle}>5-Stage Certification Pipeline</h3>
                {stagesEval && (
                  <span className={styles.pipelineCurrentStageBadge}>
                    Active: {stagesEval.currentStage ? stagesEval.currentStage.replace(/^STAGE_\d+_/, "").replace(/_/g, " ") : "Curriculum"}
                  </span>
                )}
              </div>
              {stagesEval?.allStagesCompleted ? (
                <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#15803d", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  All Milestones Cleared
                </span>
              ) : (
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                  Click any stage to inspect prerequisites &amp; gates
                </span>
              )}
            </div>

            <div className={styles.pipelineGrid}>
              {/* STAGE 1: CURRICULUM */}
              {(() => {
                const s1 = stagesEval?.stages?.STAGE_1_CURRICULUM;
                const isDone = Boolean(s1?.isCompleted || (completedSteps === totalSteps && totalSteps > 0));
                const isSelected = selectedStageKey === "STAGE_1_CURRICULUM";
                return (
                  <button
                    type="button"
                    className={`${styles.pipelineStepCard} ${isSelected ? styles.pipelineStepCardActive : ""}`}
                    onClick={() => setSelectedStageKey("STAGE_1_CURRICULUM")}
                  >
                    <div className={styles.stepCardTop}>
                      <span className={`${styles.stepNumberPill} ${isDone ? styles.stepNumberPillCompleted : ""}`}>
                        {isDone ? (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : "1"}
                      </span>
                      {isDone ? (
                        <span className={styles.pipelineBadgeCompleted}>Complete</span>
                      ) : (
                        <span className={styles.pipelineBadgeActive}>In Progress</span>
                      )}
                    </div>
                    <div className={styles.stepNameText}>1. Curriculum</div>
                    <div className={styles.stepMetricText}>
                      {completedSteps} of {totalSteps} Steps ({overallPct}%)
                    </div>
                  </button>
                );
              })()}

              {/* STAGE 2: FINAL EXAM */}
              {(() => {
                const s2 = stagesEval?.stages?.STAGE_2_EXAM;
                const isDone = Boolean(s2?.isCompleted);
                const isUnlocked = Boolean(s2?.isUnlocked);
                const isSelected = selectedStageKey === "STAGE_2_EXAM";
                const examScore = s2?.details?.examScore;
                return (
                  <button
                    type="button"
                    className={`${styles.pipelineStepCard} ${isSelected ? styles.pipelineStepCardActive : ""}`}
                    onClick={() => setSelectedStageKey("STAGE_2_EXAM")}
                  >
                    <div className={styles.stepCardTop}>
                      <span className={`${styles.stepNumberPill} ${isDone ? styles.stepNumberPillCompleted : ""}`}>
                        {isDone ? (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : "2"}
                      </span>
                      {isDone ? (
                        <span className={styles.pipelineBadgeCompleted}>
                          {s2?.isOverridden ? "Overridden" : "Passed"}
                        </span>
                      ) : isUnlocked ? (
                        <span className={styles.pipelineBadgeActive}>Pending</span>
                      ) : (
                        <span className={styles.pipelineBadgeLocked} title="Gated for learner until Stage 1 is completed (Admin can override)">
                          Learner Gated
                        </span>
                      )}
                    </div>
                    <div className={styles.stepNameText}>2. Final Exam</div>
                    <div className={styles.stepMetricText}>
                      {isDone
                        ? examScore != null
                          ? `Passed (${examScore}%)`
                          : "Passed"
                        : isUnlocked
                        ? `Attempts: ${s2?.details?.attemptCount ?? 0}`
                        : "Awaiting Stage 1 (Learner Gated)"}
                    </div>
                  </button>
                );
              })()}

              {/* STAGE 3: LIVE ATTENDANCE */}
              {(() => {
                const s3 = stagesEval?.stages?.STAGE_3_ATTENDANCE;
                const isDone = Boolean(s3?.isCompleted || compliance?.status === "COMPLIANT");
                const isUnlocked = Boolean(s3?.isUnlocked || compliance);
                const isSelected = selectedStageKey === "STAGE_3_ATTENDANCE";
                const attPct = Math.round(s3?.details?.attendancePercentage ?? compliance?.attendancePercentage ?? 0);
                const reqPct = s3?.details?.thresholdPercent ?? compliance?.thresholdPercent ?? 80;
                return (
                  <button
                    type="button"
                    className={`${styles.pipelineStepCard} ${isSelected ? styles.pipelineStepCardActive : ""}`}
                    onClick={() => setSelectedStageKey("STAGE_3_ATTENDANCE")}
                  >
                    <div className={styles.stepCardTop}>
                      <span className={`${styles.stepNumberPill} ${isDone ? styles.stepNumberPillCompleted : ""}`}>
                        {isDone ? (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : "3"}
                      </span>
                      {isDone ? (
                        <span className={styles.pipelineBadgeCompleted}>
                          {s3?.isOverridden ? "Overridden" : "Compliant"}
                        </span>
                      ) : isUnlocked ? (
                        <span className={styles.pipelineBadgeActive}>
                          {attPct}% / {reqPct}%
                        </span>
                      ) : (
                        <span className={styles.pipelineBadgeLocked} title="Gated for learner until Stage 2 is completed (Admin can override)">
                          Learner Gated
                        </span>
                      )}
                    </div>
                    <div className={styles.stepNameText}>3. Attendance</div>
                    <div className={styles.stepMetricText}>
                      {isDone
                        ? `${attPct}% Attended (Compliant)`
                        : isUnlocked
                        ? `${attPct}% Attended (${s3?.details?.attendedSessions ?? compliance?.attendedSessions ?? 0} sessions)`
                        : "Awaiting Stage 2 (Learner Gated)"}
                    </div>
                  </button>
                );
              })()}

              {/* STAGE 4: 1-ON-1 RO CALL */}
              {(() => {
                const s4 = stagesEval?.stages?.STAGE_4_ONE_ON_ONE;
                const isDone = Boolean(s4?.isCompleted);
                const isUnlocked = Boolean(s4?.isUnlocked);
                const isSelected = selectedStageKey === "STAGE_4_ONE_ON_ONE";
                return (
                  <button
                    type="button"
                    className={`${styles.pipelineStepCard} ${isSelected ? styles.pipelineStepCardActive : ""}`}
                    onClick={() => setSelectedStageKey("STAGE_4_ONE_ON_ONE")}
                  >
                    <div className={styles.stepCardTop}>
                      <span className={`${styles.stepNumberPill} ${isDone ? styles.stepNumberPillCompleted : ""}`}>
                        {isDone ? (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : "4"}
                      </span>
                      {isDone ? (
                        <span className={styles.pipelineBadgeCompleted}>
                          {s4?.isOverridden ? "Overridden" : "Concluded"}
                        </span>
                      ) : isUnlocked ? (
                        <span className={styles.pipelineBadgeActive}>Pending Booking</span>
                      ) : (
                        <span className={styles.pipelineBadgeLocked} title="Gated for learner until Stage 3 is completed (Admin can override)">
                          Learner Gated
                        </span>
                      )}
                    </div>
                    <div className={styles.stepNameText}>4. 1:1 with Ro</div>
                    <div className={styles.stepMetricText}>
                      {isDone
                        ? "Session Completed"
                        : isUnlocked
                        ? "Ready for booking"
                        : "Awaiting Stage 3 (Learner Gated)"}
                    </div>
                  </button>
                );
              })()}

              {/* STAGE 5: MISSION STATEMENT */}
              {(() => {
                const s5 = stagesEval?.stages?.STAGE_5_MISSION_STATEMENT;
                const isDone = Boolean(s5?.isCompleted);
                const isUnlocked = Boolean(s5?.isUnlocked);
                const isSelected = selectedStageKey === "STAGE_5_MISSION_STATEMENT";
                const latestStatus = s5?.details?.latestStatus;
                return (
                  <button
                    type="button"
                    className={`${styles.pipelineStepCard} ${isSelected ? styles.pipelineStepCardActive : ""}`}
                    onClick={() => setSelectedStageKey("STAGE_5_MISSION_STATEMENT")}
                  >
                    <div className={styles.stepCardTop}>
                      <span className={`${styles.stepNumberPill} ${isDone ? styles.stepNumberPillCompleted : ""}`}>
                        {isDone ? (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : "5"}
                      </span>
                      {isDone ? (
                        <span className={styles.pipelineBadgeCompleted}>Approved</span>
                      ) : latestStatus === "SUBMITTED" ? (
                        <span className={styles.pipelineBadgeActive}>Under Review</span>
                      ) : isUnlocked ? (
                        <span className={styles.pipelineBadgeActive}>Pending Upload</span>
                      ) : (
                        <span className={styles.pipelineBadgeLocked} title="Gated for learner until Stage 4 is completed (Admin can override)">
                          Learner Gated
                        </span>
                      )}
                    </div>
                    <div className={styles.stepNameText}>5. Mission Statement</div>
                    <div className={styles.stepMetricText}>
                      {isDone
                        ? "Statement Approved"
                        : latestStatus === "SUBMITTED"
                        ? "Awaiting Review"
                        : isUnlocked
                        ? "Awaiting Submission"
                        : "Awaiting Stage 4 (Learner Gated)"}
                    </div>
                  </button>
                );
              })()}

              {/* MILESTONE: CERTIFICATE */}
              {(() => {
                const isIssued = Boolean(certEligibility?.status === "ISSUED" || (progression as any)?.certificateIssued);
                const isEligible = Boolean(certEligibility?.isEligible || stagesEval?.allStagesCompleted);
                const isSelected = selectedStageKey === "CERTIFICATE";
                const unmetCount = certEligibility?.unmetRequirements?.length || 0;
                return (
                  <button
                    type="button"
                    className={`${styles.pipelineStepCard} ${isSelected ? styles.pipelineStepCardActive : ""}`}
                    onClick={() => setSelectedStageKey("CERTIFICATE")}
                  >
                    <div className={styles.stepCardTop}>
                      <span className={`${styles.stepNumberPill} ${isIssued || isEligible ? styles.stepNumberPillCompleted : ""}`}>
                        {/* Exact sidebar SVG icon */}
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="8" r="6" />
                          <path d="M15.4 13.8L18 22l-6-3-6 3 2.6-8.2" />
                        </svg>
                      </span>
                      {isIssued ? (
                        <span className={styles.pipelineBadgeCompleted}>Issued</span>
                      ) : isEligible ? (
                        <span className={styles.pipelineBadgeCompleted}>Eligible</span>
                      ) : (
                        <span className={styles.pipelineBadgeLocked} title="Ineligible until all 5 prerequisite stages are completed">
                          Ineligible
                        </span>
                      )}
                    </div>
                    <div className={styles.stepNameText}>Certificate</div>
                    <div className={styles.stepMetricText}>
                      {isIssued
                        ? "Certificate Granted"
                        : isEligible
                        ? "Ready for Issuance"
                        : unmetCount > 0
                        ? `${unmetCount} Prerequisites Pending`
                        : "5 Stages Required"}
                    </div>
                  </button>
                );
              })()}
            </div>
          </div>

          {/* =========================================================================
              3. Dedicated Stage Workspace (Replaces Disconnected Tabs)
              ========================================================================= */}
          {selectedStageKey === "STAGE_1_CURRICULUM" && (
            <div className={styles.stageWorkspaceCard}>
              <div className={styles.stageHeader}>
                <div className={styles.stageHeaderLeft}>
                  <h4 className={styles.stageHeaderTitle}>
                    <span>Stage 1: Curriculum &amp; Steps Progression</span>
                    {stagesEval?.stages?.STAGE_1_CURRICULUM?.isOverridden && (
                      <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "1px 6px", borderRadius: "4px", background: "#fef3c7", color: "#92400e" }}>
                        Administratively Overridden
                      </span>
                    )}
                  </h4>
                  <p className={styles.stageHeaderSubtitle}>
                    {completedSteps} of {totalSteps} Steps Completed ({overallPct}%) &bull; Interactive lesson completion, watch duration &amp; knowledge quizzes
                  </p>
                </div>
                <div className={styles.stageHeaderActions}>
                  {completedSteps < totalSteps && (
                    <button
                      type="button"
                      onClick={() => setTargetStageForOverride("STAGE_1_CURRICULUM")}
                      className={styles.tableActionBtn}
                      style={{ color: "var(--accent-primary)", borderColor: "var(--accent-primary)" }}
                      title="Override this stage requirement with logged admin reason"
                    >
                      Override Stage 1
                    </button>
                  )}
                </div>
              </div>

              {loadingProgression ? (
                <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
                  Loading steps...
                </div>
              ) : !progression || !progression.steps || progression.steps.length === 0 ? (
                <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
                  No curriculum steps found for this enrolment.
                </div>
              ) : (
                <div className={styles.tableWrapper}>
                  <table className={styles.cleanTable}>
                    <thead>
                      <tr>
                        <th style={{ width: "48px" }}>#</th>
                        <th style={{ width: "42%" }}>Step Title</th>
                        <th style={{ width: "20%" }}>Status</th>
                        <th style={{ width: "22%" }}>Override</th>
                        <th style={{ width: "16%", textAlign: "right" }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {progression.steps.map((step) => {
                        const isManuallyUnlocked = step.overrideState === "MANUAL_UNLOCKED";
                        const isManuallyLocked = step.overrideState === "MANUAL_LOCKED";
                        const hasLessons = step.totalItems && step.totalItems > 0;
                        const stepStatus = step.isCompleted ? "COMPLETED" : step.isUnlocked ? "UNLOCKED" : "LOCKED";

                        return (
                          <Fragment key={step.stepId}>
                            <tr className={styles.tableRow}>
                              <td style={{ fontWeight: 700, color: "var(--text-muted)" }}>
                                {step.sequence}
                              </td>
                              <td>
                                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                  <strong style={{ fontSize: "0.875rem", color: "var(--text-primary)" }}>
                                    {step.title}
                                  </strong>
                                  {hasLessons && (
                                    <button
                                      type="button"
                                      onClick={() => toggleStepExpand(step.stepId)}
                                      style={{
                                        background: "transparent",
                                        border: "none",
                                        cursor: "pointer",
                                        color: "var(--accent-primary)",
                                        fontSize: "0.75rem",
                                        fontWeight: 600,
                                        padding: "2px 4px",
                                      }}
                                      title={expandedStepIds[step.stepId] ? "Collapse lessons" : "Expand lessons"}
                                    >
                                      {expandedStepIds[step.stepId] ? "▲ Hide Details" : `▼ ${step.totalItems} lesson${step.totalItems === 1 ? "" : "s"}`}
                                    </button>
                                  )}
                                </div>
                                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                  {step.completedItems} of {step.totalItems} lessons completed
                                  {step.quiz && ` &bull; Step Quiz (Pass: ${step.quiz.passMark}%)`}
                                </div>
                              </td>
                              <td>
                                <span
                                  style={{
                                    display: "inline-block",
                                    padding: "2px 8px",
                                    borderRadius: "4px",
                                    fontSize: "0.72rem",
                                    fontWeight: 700,
                                    background:
                                      stepStatus === "COMPLETED"
                                        ? "#dcfce7"
                                        : stepStatus === "UNLOCKED"
                                        ? "#fef3c7"
                                        : "#f3f4f6",
                                    color:
                                      stepStatus === "COMPLETED"
                                        ? "#15803d"
                                        : stepStatus === "UNLOCKED"
                                        ? "#92400e"
                                        : "#6b7280",
                                  }}
                                >
                                  {stepStatus}
                                </span>
                              </td>
                              <td>
                                {isManuallyUnlocked ? (
                                  <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#15803d" }}>
                                    Bypassed / Unlocked
                                  </span>
                                ) : isManuallyLocked ? (
                                  <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#991b1b" }}>
                                    Manually Locked
                                  </span>
                                ) : (
                                  <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                                    Standard Progression
                                  </span>
                                )}
                              </td>
                              <td style={{ textAlign: "right" }}>
                                <div style={{ display: "inline-flex", gap: "0.35rem" }}>
                                  {stepStatus === "LOCKED" ? (
                                    <button
                                      type="button"
                                      onClick={() => openOverrideModal("unlock", step)}
                                      className={styles.tableActionBtn}
                                      title="Unlock this step for the learner"
                                    >
                                      Unlock
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => openOverrideModal("relock", step)}
                                      className={styles.tableActionBtn}
                                      title="Lock this step"
                                    >
                                      Lock
                                    </button>
                                  )}
                                  {stepStatus === "COMPLETED" && (
                                    <button
                                      type="button"
                                      onClick={() => openOverrideModal("reset", step)}
                                      className={styles.tableActionBtn}
                                      title="Reset step progress"
                                    >
                                      Reset
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>

                            {expandedStepIds[step.stepId] && (
                              <tr>
                                <td colSpan={5} style={{ background: "#faf7f2", padding: "0.75rem 1.25rem" }}>
                                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                                    {step.lessons?.map((lesson) => (
                                      <div key={lesson.lessonId} className={styles.lessonItemCard}>
                                        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                                          <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--accent-primary)", background: "#fef3c7", padding: "1px 5px", borderRadius: "3px" }}>
                                            {lesson.type}
                                          </span>
                                          <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{lesson.title}</span>
                                          {lesson.durationSec ? (
                                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                              ({formatDuration(lesson.durationSec)})
                                            </span>
                                          ) : null}
                                        </div>

                                        <span
                                          style={{
                                            fontSize: "0.72rem",
                                            fontWeight: 700,
                                            padding: "2px 6px",
                                            borderRadius: "4px",
                                            background: lesson.isCompleted ? "#dcfce7" : "#f5ece1",
                                            color: lesson.isCompleted ? "#15803d" : "#78716a",
                                          }}
                                        >
                                          {lesson.isCompleted ? "Done" : `${Math.round(lesson.progressPercent)}%`}
                                        </span>
                                      </div>
                                    ))}

                                    {step.quiz && (
                                      <div className={styles.lessonItemCard}>
                                        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                                          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#7e22ce" }}>QUIZ</span>
                                          <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>Step Knowledge Quiz</span>
                                          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                            (Pass: {step.quiz.passMark}%)
                                          </span>
                                        </div>

                                        <span
                                          style={{
                                            fontSize: "0.72rem",
                                            fontWeight: 700,
                                            padding: "2px 6px",
                                            borderRadius: "4px",
                                            background: step.quiz.isPassed ? "#dcfce7" : "#fee2e2",
                                            color: step.quiz.isPassed ? "#15803d" : "#991b1b",
                                          }}
                                        >
                                          {step.quiz.isPassed ? "Passed" : `Score: ${step.quiz.bestScore ?? 0}%`}
                                        </span>
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
            </div>
          )}

          {selectedStageKey === "STAGE_2_EXAM" && (
            <div className={styles.stageWorkspaceCard}>
              <div className={styles.stageHeader}>
                <div className={styles.stageHeaderLeft}>
                  <h4 className={styles.stageHeaderTitle}>
                    <span>Stage 2: Final Comprehensive Exam &amp; Oral Assessment</span>
                    {stagesEval?.stages?.STAGE_2_EXAM?.isOverridden && (
                      <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "1px 6px", borderRadius: "4px", background: "#fef3c7", color: "#92400e" }}>
                        Administratively Overridden
                      </span>
                    )}
                  </h4>
                  <p className={styles.stageHeaderSubtitle}>
                    Randomized 50–70 question comprehensive evaluation &bull; Minimum 70% passing threshold required
                  </p>
                </div>
                <div className={styles.stageHeaderActions}>
                  <button
                    type="button"
                    onClick={() => setTargetStageForOverride("STAGE_2_EXAM")}
                    className={styles.tableActionBtn}
                    style={{ color: "var(--accent-primary)", borderColor: "var(--accent-primary)" }}
                    title="Override this stage requirement with logged admin reason"
                  >
                    Override Stage 2
                  </button>
                </div>
              </div>

              <div className={styles.stageDetailsBox}>
                {stagesEval?.stages?.STAGE_2_EXAM?.unmetPrerequisites && stagesEval.stages.STAGE_2_EXAM.unmetPrerequisites.length > 0 ? (
                  <ul className={styles.unmetPrereqsList}>
                    {stagesEval.stages.STAGE_2_EXAM.unmetPrerequisites.map((p, idx) => (
                      <li key={idx}>{p}</li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ fontSize: "0.78rem", color: "#15803d", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                    <span>Stage 2 prerequisites are satisfied. Learner is cleared to take the Final Exam.</span>
                  </div>
                )}

                <div className={styles.inspectorGrid}>
                  <div className={styles.inspectorMetaItem}>
                    <span className={styles.inspectorMetaLabel}>Best Exam Score</span>
                    <span className={styles.inspectorMetaValue}>
                      {stagesEval?.stages?.STAGE_2_EXAM?.details?.examScore != null
                        ? `${stagesEval.stages.STAGE_2_EXAM.details.examScore}%`
                        : "Not Attempted Yet"}
                    </span>
                  </div>
                  <div className={styles.inspectorMetaItem}>
                    <span className={styles.inspectorMetaLabel}>Attempts Recorded</span>
                    <span className={styles.inspectorMetaValue}>
                      {stagesEval?.stages?.STAGE_2_EXAM?.details?.attemptCount ?? 0} attempt(s)
                    </span>
                  </div>
                  <div className={styles.inspectorMetaItem}>
                    <span className={styles.inspectorMetaLabel}>Passing Threshold</span>
                    <span className={styles.inspectorMetaValue}>
                      ≥70% Score Required
                    </span>
                  </div>
                  <div className={styles.inspectorMetaItem}>
                    <span className={styles.inspectorMetaLabel}>Oral Assessment</span>
                    <span className={styles.inspectorMetaValue}>
                      {stagesEval?.stages?.STAGE_2_EXAM?.details?.oralRequired
                        ? stagesEval.stages.STAGE_2_EXAM.details.oralPassed
                          ? "Passed"
                          : "Pending Oral Grading"
                        : "Exempt / Not Required"}
                    </span>
                  </div>
                </div>

                <div className={styles.stageInfoCallout}>
                  <div>
                    <strong>Final Exam Workflow Note:</strong>
                    <p style={{ margin: "0.25rem 0 0", color: "var(--text-secondary)" }}>
                      The final exam draws from the program's randomized question bank. Attempts are autograded immediately upon submission. If an oral assessment is required, grades are recorded in the Approvals queue.
                    </p>
                  </div>
                  {stagesEval?.stages?.STAGE_2_EXAM?.details?.oralRequired && (
                    <Link href="/approvals?tab=oral" className={styles.tableActionBtn} target="_blank">
                      Open Oral Approvals ↗
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )}

          {selectedStageKey === "STAGE_3_ATTENDANCE" && (
            <div className={styles.stageWorkspaceCard}>
              <div className={styles.stageHeader}>
                <div className={styles.stageHeaderLeft}>
                  <h4 className={styles.stageHeaderTitle}>
                    <span>Stage 3: Weekly Live Cohort Attendance</span>
                    {stagesEval?.stages?.STAGE_3_ATTENDANCE?.isOverridden && (
                      <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "1px 6px", borderRadius: "4px", background: "#fef3c7", color: "#92400e" }}>
                        Administratively Overridden
                      </span>
                    )}
                  </h4>
                  <p className={styles.stageHeaderSubtitle}>
                    Cohort workshops conducted weekly with instructor &bull; Minimum 80% attendance compliance threshold required
                  </p>
                </div>
                <div className={styles.stageHeaderActions}>
                  <button
                    type="button"
                    onClick={() => setTargetStageForOverride("STAGE_3_ATTENDANCE")}
                    className={styles.tableActionBtn}
                    style={{ color: "var(--accent-primary)", borderColor: "var(--accent-primary)" }}
                    title="Override this stage requirement with logged admin reason"
                  >
                    Override Stage 3
                  </button>
                </div>
              </div>

              {/* Attendance Compliance Meter Card */}
              {(() => {
                const s3 = stagesEval?.stages?.STAGE_3_ATTENDANCE;
                const attPct = Math.round(s3?.details?.attendancePercentage ?? compliance?.attendancePercentage ?? 0);
                const reqPct = s3?.details?.thresholdPercent ?? compliance?.thresholdPercent ?? 80;
                const isCompliant = attPct >= reqPct || s3?.isCompleted || compliance?.status === "COMPLIANT";
                const attendedCount = s3?.details?.attendedSessions ?? compliance?.attendedSessions ?? 0;
                const requiredCount = s3?.details?.requiredSessions ?? compliance?.requiredSessions ?? 0;

                return (
                  <div className={styles.complianceMeterCard}>
                    <div className={styles.complianceStatsRow}>
                      <span>
                        Weekly Live Attendance: <strong style={{ color: isCompliant ? "#15803d" : "#991b1b" }}>{attPct}%</strong> ({attendedCount} of {requiredCount} Sessions Attended)
                      </span>
                      <span style={{
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: "100px",
                        background: isCompliant ? "#dcfce7" : "#fee2e2",
                        color: isCompliant ? "#15803d" : "#991b1b",
                        border: `1px solid ${isCompliant ? "#bbf7d0" : "#fecaca"}`
                      }}>
                        {isCompliant ? "COMPLIANT (≥80%)" : "BELOW 80% THRESHOLD"}
                      </span>
                    </div>

                    <div className={styles.complianceBarWrapper}>
                      <div className={styles.complianceTrack}>
                        <div
                          className={styles.complianceFill}
                          style={{
                            width: `${Math.min(100, Math.max(0, attPct))}%`,
                            background: isCompliant ? "#16a34a" : "#dc2626",
                          }}
                        />
                      </div>
                      <div className={styles.complianceLabelsRow}>
                        <span>0%</span>
                        <span>Required Minimum: {reqPct}%</span>
                        <span>100%</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Weekly Live Cohort Sessions Table */}
              {(() => {
                const weeklySessions = attendanceHistory?.history?.filter((r) => r.sessionType !== "ONE_ON_ONE") || [];

                return (
                  <div className={styles.tableWrapper}>
                    <table className={styles.cleanTable}>
                      <thead>
                        <tr>
                          <th>Weekly Cohort Session</th>
                          <th>Date</th>
                          <th>Duration Attended</th>
                          <th style={{ textAlign: "right" }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {weeklySessions.length === 0 ? (
                          <tr>
                            <td colSpan={4} style={{ textAlign: "center", padding: "2.5rem", color: "var(--text-muted)" }}>
                              No weekly cohort live sessions recorded yet for this batch.
                            </td>
                          </tr>
                        ) : (
                          weeklySessions.map((record) => {
                            const sessionTime = new Date(record.startTimeUtc).getTime();
                            const isFuture = sessionTime > Date.now();
                            const isPresent =
                              record.status === "PRESENT" ||
                              record.status === "PRESENT_AUTO" ||
                              record.status === "PRESENT_MANUAL" ||
                              record.status === "CORRECTED";
                            const isUpcoming = isFuture && !isPresent;

                            return (
                              <tr key={record.sessionId} className={styles.tableRow}>
                                <td>
                                  <strong>{record.sessionTitle}</strong>
                                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                                    Weekly Live Session &bull; {record.batchName || record.programTitle}
                                  </div>
                                </td>
                                <td>
                                  <span>{formatNumericDate(record.startTimeUtc)}</span>
                                </td>
                                <td>
                                  <span>
                                    {isUpcoming
                                      ? `Scheduled (${record.durationMinutes} min)`
                                      : `${record.minutesPresent} min / ${record.durationMinutes} min`}
                                  </span>
                                </td>
                                <td style={{ textAlign: "right" }}>
                                  <span
                                    style={{
                                      display: "inline-block",
                                      padding: "2px 8px",
                                      borderRadius: "4px",
                                      fontSize: "0.72rem",
                                      fontWeight: 700,
                                      background: isUpcoming
                                        ? "#eff6ff"
                                        : isPresent
                                        ? "#dcfce7"
                                        : "#fee2e2",
                                      color: isUpcoming
                                        ? "#1d4ed8"
                                        : isPresent
                                        ? "#15803d"
                                        : "#991b1b",
                                      border: `1px solid ${
                                        isUpcoming ? "#bfdbfe" : isPresent ? "#bbf7d0" : "#fecaca"
                                      }`,
                                    }}
                                  >
                                    {isUpcoming ? "Upcoming" : isPresent ? "Present" : "Absent"}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                );
              })()}

              {/* 1-on-1 Reference Callout */}
              {attendanceHistory?.history?.some((r) => r.sessionType === "ONE_ON_ONE") && (
                <div style={{ padding: "0.85rem 1.25rem", borderTop: "1px solid #f0e7d8", background: "#fdfbf7", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                    Looking for 1-on-1 Closing Coaching? Individual consultations with Roweena are tracked under <strong>Stage 4 (1:1 with Ro)</strong>.
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedStageKey("STAGE_4_ONE_ON_ONE")}
                    className={styles.tableActionBtn}
                    style={{ color: "var(--accent-primary)", borderColor: "var(--accent-primary)" }}
                  >
                    View 1:1 with Ro (Stage 4) →
                  </button>
                </div>
              )}
            </div>
          )}

          {selectedStageKey === "STAGE_4_ONE_ON_ONE" && (
            <div className={styles.stageWorkspaceCard}>
              <div className={styles.stageHeader}>
                <div className={styles.stageHeaderLeft}>
                  <h4 className={styles.stageHeaderTitle}>
                    <span>Stage 4: 1-on-1 Closing Consultation with Roweena</span>
                    {stagesEval?.stages?.STAGE_4_ONE_ON_ONE?.isOverridden && (
                      <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "1px 6px", borderRadius: "4px", background: "#fef3c7", color: "#92400e" }}>
                        Administratively Overridden
                      </span>
                    )}
                  </h4>
                  <p className={styles.stageHeaderSubtitle}>
                    Mandatory individual graduation &amp; career roadmap consultation session
                  </p>
                </div>
                <div className={styles.stageHeaderActions}>
                  <button
                    type="button"
                    onClick={() => setTargetStageForOverride("STAGE_4_ONE_ON_ONE")}
                    className={styles.tableActionBtn}
                    style={{ color: "var(--accent-primary)", borderColor: "var(--accent-primary)" }}
                    title="Override this stage requirement with logged admin reason"
                  >
                    Override Stage 4
                  </button>
                </div>
              </div>

              <div className={styles.stageDetailsBox}>
                {stagesEval?.stages?.STAGE_4_ONE_ON_ONE?.unmetPrerequisites && stagesEval.stages.STAGE_4_ONE_ON_ONE.unmetPrerequisites.length > 0 ? (
                  <ul className={styles.unmetPrereqsList}>
                    {stagesEval.stages.STAGE_4_ONE_ON_ONE.unmetPrerequisites.map((p, idx) => (
                      <li key={idx}>{p}</li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ fontSize: "0.78rem", color: "#15803d", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                    <span>Stage 4 prerequisites satisfied. Learner is eligible for their 1-on-1 closing consultation.</span>
                  </div>
                )}

                {(() => {
                  const oneOnOne = attendanceHistory?.history?.find((r) => r.sessionType === "ONE_ON_ONE");
                  const isCompleted = stagesEval?.stages?.STAGE_4_ONE_ON_ONE?.isCompleted;

                  return (
                    <div className={styles.inspectorGrid}>
                      <div className={styles.inspectorMetaItem}>
                        <span className={styles.inspectorMetaLabel}>Consultation Slot</span>
                        <span className={styles.inspectorMetaValue}>
                          {oneOnOne ? oneOnOne.sessionTitle : "Closing Consultation with Roweena"}
                        </span>
                      </div>
                      <div className={styles.inspectorMetaItem}>
                        <span className={styles.inspectorMetaLabel}>Scheduled Date</span>
                        <span className={styles.inspectorMetaValue}>
                          {oneOnOne ? formatNumericDate(oneOnOne.startTimeUtc) : "Pending Booking"}
                        </span>
                      </div>
                      <div className={styles.inspectorMetaItem}>
                        <span className={styles.inspectorMetaLabel}>Attended Duration</span>
                        <span className={styles.inspectorMetaValue}>
                          {oneOnOne ? `${oneOnOne.minutesPresent} min / ${oneOnOne.durationMinutes} min` : "—"}
                        </span>
                      </div>
                      <div className={styles.inspectorMetaItem}>
                        <span className={styles.inspectorMetaLabel}>Stage Gate Status</span>
                        <span className={styles.inspectorMetaValue} style={{ color: isCompleted ? "#15803d" : "#92400e" }}>
                          {isCompleted ? "Completed & Satisfied" : "Pending Session Completion"}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                <div className={styles.stageInfoCallout}>
                  <div>
                    <strong>1-on-1 Consultation Workflow:</strong>
                    <p style={{ margin: "0.25rem 0 0", color: "var(--text-secondary)" }}>
                      Roweena hosts 1-on-1 closing consultation slots with learners near completion. Completion automatically unlocks Stage 5 (Mission Statement submission).
                    </p>
                  </div>
                  <Link href="/approvals?tab=coaching" className={styles.tableActionBtn} target="_blank">
                    Open Coaching Schedule ↗
                  </Link>
                </div>
              </div>
            </div>
          )}

          {selectedStageKey === "STAGE_5_MISSION_STATEMENT" && (
            <div className={styles.stageWorkspaceCard}>
              <div className={styles.stageHeader}>
                <div className={styles.stageHeaderLeft}>
                  <h4 className={styles.stageHeaderTitle}>
                    <span>Stage 5: Handwritten / Document Mission Statement</span>
                    {stagesEval?.stages?.STAGE_5_MISSION_STATEMENT?.isOverridden && (
                      <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "1px 6px", borderRadius: "4px", background: "#fef3c7", color: "#92400e" }}>
                        Administratively Overridden
                      </span>
                    )}
                  </h4>
                  <p className={styles.stageHeaderSubtitle}>
                    Learner's personal manifesto &bull; Reviewed, graded, and approved by leadership
                  </p>
                </div>
                <div className={styles.stageHeaderActions}>
                  <button
                    type="button"
                    onClick={() => setTargetStageForOverride("STAGE_5_MISSION_STATEMENT")}
                    className={styles.tableActionBtn}
                    style={{ color: "var(--accent-primary)", borderColor: "var(--accent-primary)" }}
                    title="Override this stage requirement with logged admin reason"
                  >
                    Override Stage 5
                  </button>
                  <Link href="/approvals?tab=missions" className={styles.tableActionBtn} target="_blank">
                    Review in Mission Approvals ↗
                  </Link>
                </div>
              </div>

              <div className={styles.stageDetailsBox}>
                {stagesEval?.stages?.STAGE_5_MISSION_STATEMENT?.unmetPrerequisites && stagesEval.stages.STAGE_5_MISSION_STATEMENT.unmetPrerequisites.length > 0 ? (
                  <ul className={styles.unmetPrereqsList}>
                    {stagesEval.stages.STAGE_5_MISSION_STATEMENT.unmetPrerequisites.map((p, idx) => (
                      <li key={idx}>{p}</li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ fontSize: "0.78rem", color: "#15803d", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                    <span>Stage 5 prerequisites satisfied. Learner is cleared to submit their Mission Statement.</span>
                  </div>
                )}

                <div className={styles.inspectorGrid}>
                  <div className={styles.inspectorMetaItem}>
                    <span className={styles.inspectorMetaLabel}>Review Status</span>
                    <span className={styles.inspectorMetaValue}>
                      {stagesEval?.stages?.STAGE_5_MISSION_STATEMENT?.details?.latestStatus ||
                        (stagesEval?.stages?.STAGE_5_MISSION_STATEMENT?.isCompleted ? "APPROVED" : "NOT_SUBMITTED")}
                    </span>
                  </div>
                  <div className={styles.inspectorMetaItem}>
                    <span className={styles.inspectorMetaLabel}>Submission Versions</span>
                    <span className={styles.inspectorMetaValue}>
                      {stagesEval?.stages?.STAGE_5_MISSION_STATEMENT?.details?.submissionCount ?? 0} uploaded version(s)
                    </span>
                  </div>
                  <div className={styles.inspectorMetaItem}>
                    <span className={styles.inspectorMetaLabel}>Final Milestone Clearance</span>
                    <span className={styles.inspectorMetaValue} style={{ color: stagesEval?.stages?.STAGE_5_MISSION_STATEMENT?.isCompleted ? "#15803d" : "#92400e" }}>
                      {stagesEval?.stages?.STAGE_5_MISSION_STATEMENT?.isCompleted
                        ? "Approved & Eligible for Certificate"
                        : "Awaiting Leadership Approval"}
                    </span>
                  </div>
                </div>

                <div className={styles.stageInfoCallout}>
                  <div>
                    <strong>Mission Statement Review Flow:</strong>
                    <p style={{ margin: "0.25rem 0 0", color: "var(--text-secondary)" }}>
                      When a learner submits their Mission Statement, leadership evaluates their handwritten or typed manifesto in the Approvals panel. Approval immediately triggers certificate eligibility.
                    </p>
                  </div>
                  <Link href="/approvals?tab=missions" className={styles.tableActionBtn} target="_blank">
                    Open Mission Approvals ↗
                  </Link>
                </div>
              </div>
            </div>
          )}

          {selectedStageKey === "CERTIFICATE" && (
            <div className={styles.stageWorkspaceCard}>
              <div className={styles.stageHeader}>
                <div className={styles.stageHeaderLeft}>
                  <h4 className={styles.stageHeaderTitle}>
                    {/* Exact same icon as sidebar AdminShell.tsx */}
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--accent-primary, #c97a1e)" }}>
                      <circle cx="12" cy="8" r="6" />
                      <path d="M15.4 13.8L18 22l-6-3-6 3 2.6-8.2" />
                    </svg>
                    <span>Milestone: Certificate Eligibility &amp; Issuance</span>
                  </h4>
                  <p className={styles.stageHeaderSubtitle}>
                    Cryptographically verifiable certificate with tamper-evident QR code &bull; Track: {certEligibility?.certificateType || stagesEval?.certificateType || "PROFESSIONAL"}
                  </p>
                </div>
                <div className={styles.stageHeaderActions}>
                  <Link href="/approvals?tab=certificates" className={styles.tableActionBtn} target="_blank">
                    Open Certificate Approvals ↗
                  </Link>
                </div>
              </div>

              <div className={styles.stageDetailsBox}>
                {/* Eligibility Decision Banner */}
                <div style={{
                  padding: "0.85rem 1rem",
                  borderRadius: "8px",
                  background: certEligibility?.isEligible ? "#f0fdf4" : "#fef2f2",
                  border: `1px solid ${certEligibility?.isEligible ? "#bbf7d0" : "#fecaca"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                }}>
                  <div>
                    <div style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: certEligibility?.isEligible ? "#166534" : "#991b1b",
                    }}>
                      Eligibility Decision
                    </div>
                    <div style={{
                      fontSize: "1rem",
                      fontWeight: 800,
                      color: certEligibility?.isEligible ? "#15803d" : "#991b1b",
                    }}>
                      {certEligibility?.isEligible ? "ELIGIBLE FOR ISSUANCE" : "INELIGIBLE (PREREQUISITES REMAINING)"}
                    </div>
                  </div>

                  <span style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    padding: "3px 10px",
                    borderRadius: "100px",
                    background: certEligibility?.isEligible ? "#dcfce7" : "#fee2e2",
                    color: certEligibility?.isEligible ? "#15803d" : "#991b1b",
                  }}>
                    {certEligibility?.isEligible
                      ? "All 5 Gates Satisfied"
                      : `${certEligibility?.unmetRequirements?.length || 5} Gates Pending`}
                  </span>
                </div>

                {/* 5-Prerequisites Checklist */}
                <div>
                  <h5 style={{ fontSize: "0.8125rem", fontWeight: 700, margin: "0 0 0.5rem", color: "var(--text-primary)" }}>
                    5-Stage Graduation Gate Audit
                  </h5>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.6rem" }}>
                    {[
                      { num: 1, name: "Curriculum & Quizzes", done: Boolean(stagesEval?.stages?.STAGE_1_CURRICULUM?.isCompleted || (completedSteps === totalSteps && totalSteps > 0)) },
                      { num: 2, name: "Final Exam (≥70%)", done: Boolean(stagesEval?.stages?.STAGE_2_EXAM?.isCompleted) },
                      { num: 3, name: "Attendance Compliance (≥80%)", done: Boolean(stagesEval?.stages?.STAGE_3_ATTENDANCE?.isCompleted || compliance?.status === "COMPLIANT") },
                      { num: 4, name: "1-on-1 Ro Consultation", done: Boolean(stagesEval?.stages?.STAGE_4_ONE_ON_ONE?.isCompleted) },
                      { num: 5, name: "Approved Mission Statement", done: Boolean(stagesEval?.stages?.STAGE_5_MISSION_STATEMENT?.isCompleted) },
                    ].map((gate) => (
                      <div
                        key={gate.num}
                        style={{
                          padding: "0.6rem 0.75rem",
                          borderRadius: "6px",
                          background: gate.done ? "#f0fdf4" : "#faf7f2",
                          border: `1px solid ${gate.done ? "#bbf7d0" : "#ebdccb"}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          fontSize: "0.78rem",
                        }}
                      >
                        <span style={{ fontWeight: 600, color: gate.done ? "#166534" : "var(--text-secondary)" }}>
                          {gate.num}. {gate.name}
                        </span>
                        <span style={{ fontWeight: 700, color: gate.done ? "#15803d" : "#78716a" }}>
                          {gate.done ? "Satisfied" : "Pending"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Unmet Requirements List */}
                {certEligibility?.unmetRequirements && certEligibility.unmetRequirements.length > 0 && (
                  <div>
                    <h5 style={{ fontSize: "0.8125rem", fontWeight: 700, margin: "0 0 0.4rem", color: "#991b1b" }}>
                      Unmet Prerequisites List:
                    </h5>
                    <ul className={styles.unmetPrereqsList}>
                      {certEligibility.unmetRequirements.map((req, idx) => (
                        <li key={idx}>{req}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Modal for manual overrides */}
          {activeModal && targetStep && (
            <InputDialog
              isOpen={Boolean(activeModal && targetStep)}
              onClose={closeOverrideModal}
              onSubmit={async (reason) => {
                await handleOverrideWithReason(reason);
              }}
              title={
                activeModal === "unlock"
                  ? `Unlock Step ${targetStep.sequence}`
                  : activeModal === "relock"
                  ? `Lock Step ${targetStep.sequence}`
                  : `Reset Step ${targetStep.sequence}`
              }
              subtitle={`Learner: ${user.name} — "${targetStep.title}"`}
              description={
                activeModal === "unlock"
                  ? "Manually granting access bypasses batch milestone gates."
                  : activeModal === "relock"
                  ? "Manually revoking access locks this step until cleared."
                  : "Restoring automated milestone logic for this step."
              }
              label="Administrative Reason"
              placeholder={
                activeModal === "unlock"
                  ? "e.g., Learner demonstrated readiness or has fast-track batch approval."
                  : activeModal === "relock"
                  ? "e.g., Academic review required before proceeding."
                  : "Reason for resetting to automatic progression."
              }
              required={activeModal !== "reset"}
              tone={activeModal === "relock" ? "danger" : activeModal === "unlock" ? "info" : "warning"}
              confirmText={
                activeModal === "unlock"
                  ? "Confirm Unlock"
                  : activeModal === "relock"
                  ? "Confirm Lock"
                  : "Confirm Reset"
              }
              isLoading={submittingOverride}
              error={modalError}
            />
          )}

          {/* Modal for 5-Stage Pipeline Override */}
          {targetStageForOverride && (
            <InputDialog
              isOpen={Boolean(targetStageForOverride)}
              onClose={() => setTargetStageForOverride(null)}
              onSubmit={async (reason) => {
                await handleOverrideStageWithReason(reason);
              }}
              title={`Override Stage: ${targetStageForOverride.replace(/^STAGE_\d+_/, "").replace(/_/g, " ")}`}
              subtitle={`Learner: ${user.name} — Stage requirement manual override`}
              description="Manually bypassing this progression stage will be permanently recorded in the system audit logs for administrative compliance."
              label="Mandatory Administrative Reason"
              placeholder="e.g., Learner demonstrated master equivalence or approved for expedited graduation."
              required={true}
              tone="warning"
              confirmText="Confirm Stage Override"
              isLoading={submittingStageOverride}
            />
          )}

          {/* Modal for Digital Signature & Audit Record */}
          {previewAgreementModal && (
            <div
              className={styles.modalOverlay}
              onClick={() => setPreviewAgreementModal(null)}
            >
              <div
                className={styles.modalContent}
                onClick={(e) => e.stopPropagation()}
              >
                <div className={styles.modalHeader}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "var(--text-primary)" }}>
                        Digital Signature &amp; Audit Record
                      </h2>
                      <span
                        style={{
                          background: "#dcfce7",
                          color: "#15803d",
                          border: "1px solid #bbf7d0",
                          fontSize: "0.68rem",
                          fontWeight: 700,
                          padding: "2px 7px",
                          borderRadius: "999px",
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                        }}
                      >
                        Verified Record
                      </span>
                      {previewAgreementModal.paymentStatus && (
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 700,
                            padding: "2px 7px",
                            borderRadius: "999px",
                            letterSpacing: "0.04em",
                            background:
                              previewAgreementModal.paymentStatus === "PAID"
                                ? "#dcfce7"
                                : "#fef3c7",
                            color:
                              previewAgreementModal.paymentStatus === "PAID"
                                ? "#15803d"
                                : "#b45309",
                          }}
                        >
                          Payment: {previewAgreementModal.paymentStatus}
                        </span>
                      )}
                    </div>
                    <p style={{ margin: "0.35rem 0 0", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                      Immutable legal evidence for <strong>{previewAgreementModal.typedName || previewAgreementModal.user?.name || user.name}</strong> ({previewAgreementModal.user?.email || user.email})
                    </p>
                  </div>
                  <button
                    type="button"
                    className={styles.modalCloseBtn}
                    onClick={() => setPreviewAgreementModal(null)}
                    aria-label="Close modal"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>

                <div className={styles.modalBody}>
                  {/* Signature Card */}
                  <div className={styles.sigDisplayCard}>
                    <div className={styles.sigDisplayHeader}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 19l7-7 3 3-7 7-3-3z" />
                          <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                          <path d="M2 2l7.586 7.586" />
                          <circle cx="11" cy="11" r="2" />
                        </svg>
                        {previewAgreementModal.signatureType === "UPLOADED" ? "Uploaded Signature Image" : "Drawn Digital Signature"}
                      </span>
                      <span style={{ color: "#15803d", fontWeight: 700, fontSize: "0.72rem" }}>
                        E-SIGN COMPLIANT
                      </span>
                    </div>

                    <div className={styles.sigPreviewArea}>
                      {(() => {
                        const rawSig = previewAgreementModal.drawnSignature || "";
                        const signatureSrc = rawSig.startsWith("data:image")
                          ? rawSig
                          : rawSig.length > 50
                          ? `data:image/png;base64,${rawSig}`
                          : null;

                        return signatureSrc ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={signatureSrc}
                            alt={`Digital signature of ${previewAgreementModal.typedName || user.name}`}
                            style={{ maxHeight: "140px", maxWidth: "100%", objectFit: "contain" }}
                          />
                        ) : (
                          <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                            {previewAgreementModal.typedName ? (
                              <span style={{ fontFamily: "cursive", fontSize: "1.4rem", color: "#14110f" }}>
                                {previewAgreementModal.typedName}
                              </span>
                            ) : (
                              "No graphical signature captured"
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Audit Metadata Grid */}
                  <div className={styles.auditMetaGrid}>
                    <div className={styles.auditMetaField}>
                      <span className={styles.auditFieldLabel}>Signer Legal Name</span>
                      <span className={styles.auditFieldValue}>
                        {previewAgreementModal.typedName || previewAgreementModal.user?.name || user.name}
                      </span>
                    </div>

                    <div className={styles.auditMetaField}>
                      <span className={styles.auditFieldLabel}>Account Email</span>
                      <span className={styles.auditFieldValue}>
                        {previewAgreementModal.user?.email || user.email}
                      </span>
                    </div>

                    <div className={styles.auditMetaField}>
                      <span className={styles.auditFieldLabel}>Enrolled Program</span>
                      <span className={styles.auditFieldValue}>
                        {previewAgreementModal.programTitle || previewAgreementModal.program?.title || "Program"}
                      </span>
                    </div>

                    <div className={styles.auditMetaField}>
                      <span className={styles.auditFieldLabel}>Batch</span>
                      <span className={styles.auditFieldValue}>
                        {previewAgreementModal.enrolment?.batch?.name || "Standard Enrolment"}
                      </span>
                    </div>

                    <div className={styles.auditMetaField}>
                      <span className={styles.auditFieldLabel}>Agreement Version</span>
                      <span className={styles.auditFieldValue}>
                        {previewAgreementModal.templateVersion || "v1.0"}
                      </span>
                    </div>

                    <div className={styles.auditMetaField}>
                      <span className={styles.auditFieldLabel}>Consent Statement</span>
                      <span className={styles.auditFieldValue}>
                        {previewAgreementModal.consentVersion || previewAgreementModal.templateVersion || "v1.0"}
                      </span>
                    </div>

                    <div className={styles.auditMetaField}>
                      <span className={styles.auditFieldLabel}>Signing Timestamp</span>
                      <span className={styles.auditFieldValue}>
                        {new Date(previewAgreementModal.signedAt).toLocaleString()}
                      </span>
                    </div>

                    <div className={styles.auditMetaField}>
                      <span className={styles.auditFieldLabel}>Signer IP Address</span>
                      <span className={styles.auditFieldValue}>
                        {previewAgreementModal.signerIp || "127.0.0.1"}
                      </span>
                    </div>

                    <div className={styles.auditMetaField} style={{ gridColumn: "1 / -1" }}>
                      <span className={styles.auditFieldLabel}>Client Environment (User-Agent)</span>
                      <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", wordBreak: "break-all", fontFamily: "monospace" }}>
                        {previewAgreementModal.userAgent || "—"}
                      </span>
                    </div>
                  </div>

                  {/* Payment & Access Verification */}
                  <div style={{ background: "#ffffff", border: "1px solid #e7e0d6", borderRadius: "10px", padding: "1rem 1.25rem" }}>
                    <div style={{ fontWeight: 700, fontSize: "0.8125rem", marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                      Payment &amp; Program Access Verification
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem", fontSize: "0.8125rem" }}>
                      <div>
                        <span style={{ color: "var(--text-muted)", fontSize: "0.72rem", display: "block" }}>Payment State</span>
                        <strong style={{ color: previewAgreementModal.paymentStatus === "PAID" ? "#15803d" : "#b45309" }}>
                          {previewAgreementModal.paymentStatus || "PAID"}
                        </strong>
                      </div>
                      <div>
                        <span style={{ color: "var(--text-muted)", fontSize: "0.72rem", display: "block" }}>Program Access Gate</span>
                        <strong style={{ color: "#15803d" }}>
                          UNLOCKED (Enrolment Active)
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Audit Trail Timeline */}
                  {previewAgreementModal.auditLogs && previewAgreementModal.auditLogs.length > 0 && (
                    <div style={{ background: "#faf7f2", border: "1px solid #e7e0d6", borderRadius: "10px", padding: "0.85rem 1.25rem" }}>
                      <div style={{ fontWeight: 700, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                        Audit Trail Timeline
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                        {previewAgreementModal.auditLogs.map((log) => (
                          <div key={log.id} style={{ fontSize: "0.75rem", display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                            <span>{log.action}</span>
                            <span>{new Date(log.createdAt).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className={styles.modalFooter}>
                  {previewAgreementModal.templateId ? (
                    <Link
                      href={`/agreements/${previewAgreementModal.templateId}?signedId=${previewAgreementModal.id}`}
                      className={styles.actionBtnSecondary}
                      style={{ fontSize: "0.78rem" }}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span>Open in Agreements Studio</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </Link>
                  ) : <div />}

                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <button
                      type="button"
                      onClick={() => handleDownloadSignedPdf(previewAgreementModal)}
                      disabled={downloadingPdf}
                      className={styles.actionBtnSecondary}
                      style={{ background: "var(--accent-primary, #c97a1e)", color: "#ffffff", borderColor: "transparent" }}
                    >
                      {downloadingPdf ? "Generating PDF..." : "Download Signed PDF"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewAgreementModal(null)}
                      className={styles.actionBtnSecondary}
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        /* Staff Role & Scope View */
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <section className={styles.staffCard}>
            <div className={styles.staffHeader}>
              <h2 className={styles.staffTitle}>Staff Role &amp; Scope</h2>
              <StatusBadge status={user.role} />
            </div>

            <div className={styles.staffScopeGrid}>
              <div className={styles.scopeItem}>
                <span className={styles.scopeLabel}>System Role</span>
                <strong className={styles.scopeValue}>
                  {user.role === "SUPER_ADMIN" ? "Super Administrator" : user.role === "ADMIN" ? "Administrator" : "Batch Manager"}
                </strong>
                <p className={styles.scopeDesc}>
                  {user.role === "SUPER_ADMIN"
                    ? "Full system governance, security configurations, and audit logging."
                    : user.role === "ADMIN"
                    ? "Full control over programs, curriculum studios, question banks, batches, and reports."
                    : "Assigned batch manager responsible for live sessions and attendance reconciliation."}
                </p>
              </div>

              <div className={styles.scopeItem}>
                <span className={styles.scopeLabel}>Operational Boundary</span>
                <strong className={styles.scopeValue}>
                  {user.role === "MANAGER" ? "Assigned Cohorts Only" : "Global System"}
                </strong>
                <p className={styles.scopeDesc}>
                  {user.role === "MANAGER"
                    ? "Access strictly restricted to cohorts where batch.managerId === user.id."
                    : "Unrestricted visibility across all platform departments and programs."}
                </p>
              </div>
            </div>
          </section>

          {user.role === "MANAGER" && user.managedBatches && user.managedBatches.length > 0 && (
            <section className={styles.staffCard}>
              <div className={styles.staffHeader}>
                <h2 className={styles.staffTitle}>Assigned Batches ({user.managedBatches.length})</h2>
                <Link href="/batches" className={styles.actionBtnSecondary}>
                  <span>Manage Batches</span>
                </Link>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0.75rem" }}>
                {user.managedBatches.map((b) => (
                  <div key={b.id} style={{ background: "#faf7f2", border: "1px solid #ebdccb", borderRadius: "8px", padding: "0.75rem 1rem" }}>
                    <div style={{ fontWeight: 700, fontSize: "0.875rem" }}>{b.name}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{b.program?.title || "Cohort"}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className={styles.staffCard}>
            <div className={styles.staffHeader}>
              <h2 className={styles.staffTitle}>Account Information</h2>
            </div>

            <div className={styles.securityGrid}>
              <div className={styles.securityItem}>
                <span className={styles.securityLabel}>User ID</span>
                <code className={styles.securityCode}>{user.id}</code>
              </div>
              <div className={styles.securityItem}>
                <span className={styles.securityLabel}>Created</span>
                <span className={styles.securityVal}>{formatNumericDate(user.createdAt)}</span>
              </div>
              <div className={styles.securityItem}>
                <span className={styles.securityLabel}>Account Status</span>
                <span className={styles.securityVal}>{user.status || "ACTIVE"}</span>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
