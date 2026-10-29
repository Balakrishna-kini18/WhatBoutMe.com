"use client";

import { useEffect, useState, use, Fragment, useRef } from "react";
import styles from "./UserDetail.module.css";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  API_URL,
  errorMessage,
  apiGet,
  fetchOneOnOneRequests,
  approveOneOnOneRequest,
  rejectOneOnOneRequest,
  fetchMissionStatements,
  approveMissionStatement,
  rejectMissionStatement,
  type OneOnOneRequestItem,
  type MissionStatementItem,
} from "../../lib/api";
import { CustomSelect, StatusBadge, InputDialog, useToast } from "../../components";

interface EnrolmentOption {
  id: string;
  batchId?: string;
  status: string;
  createdAt?: string;
  enrolledAt?: string;
  examPassedAt?: string | null;
  attendanceSatisfiedAt?: string | null;
  oneOnOneCompletedAt?: string | null;
  missionStatementApprovedAt?: string | null;
  certificateIssuedAt?: string | null;
  batch?: {
    id: string;
    name: string;
    attendanceThreshold?: number | null;
    program?: {
      id: string;
      title: string;
      attendanceThreshold?: number | null;
    };
  };
  program?: {
    id: string;
    title: string;
    attendanceThreshold?: number | null;
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
  certificate?: {
    id: string;
    status: string;
    certificateNumber?: string;
    pdfUrl?: string | null;
    issueDate?: string | null;
  } | null;
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
  params: Promise<{ id: string }>;
}) {
  const unwrappedParams = use(params);
  const userId = (unwrappedParams as { id?: string })?.id || "";

  const router = useRouter();
  const searchParams = useSearchParams();
  const fromBatchId = searchParams?.get("batchId");
  const fromBatchName = searchParams?.get("batchName");
  const queryEnrolmentId = searchParams?.get("enrolmentId");

  const toast = useToast();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [selectedEnrolmentId, setSelectedEnrolmentId] = useState<string>("");
  const lastFetchedEnrolmentId = useRef<string>("");
  const [progression, setProgression] = useState<EnrolmentProgression | null>(null);
  const [compliance, setCompliance] = useState<any>(null);
  const [attendanceHistory, setAttendanceHistory] = useState<LearnerAttendanceHistory | null>(null);

  const selectedEnrolment = user?.enrolments?.find((e) => e.id === selectedEnrolmentId);
  const activeBatchId = selectedEnrolment?.batch?.id || (progression as any)?.batchId || fromBatchId || "";
  const activeBatchName = selectedEnrolment?.batch?.name || fromBatchName || "";

  const backHref = activeBatchId ? `/batches/${activeBatchId}` : "/users";
  const backLabel = activeBatchId
    ? `Back to ${activeBatchName ? decodeURIComponent(activeBatchName) : "Batch"}`
    : "Back to Users & Enrolments";

  // 5-Stage Progression State Machine & Certificate Eligibility
  const [stagesEval, setStagesEval] = useState<LearnerProgressionStages | null>(null);
  const [certEligibility, setCertEligibility] = useState<CertificateEligibility | null>(null);
  const [selectedStageKey, setSelectedStageKey] = useState<string | null>("STAGE_1_CURRICULUM");
  const [targetStageForOverride, setTargetStageForOverride] = useState<string | null>(null);
  const [submittingStageOverride, setSubmittingStageOverride] = useState(false);

  // In-profile Stage 4 & Stage 5 direct actions
  const [oneOnOneRequests, setOneOnOneRequests] = useState<OneOnOneRequestItem[]>([]);
  const [missionSubmissions, setMissionSubmissions] = useState<MissionStatementItem[]>([]);
  const [actingOneOnOne, setActingOneOnOne] = useState(false);
  const [actingMission, setActingMission] = useState(false);
  const [rejectingMissionModal, setRejectingMissionModal] = useState<MissionStatementItem | null>(null);
  const [rejectFeedback, setRejectFeedback] = useState("");
  const [submittingRejectFeedback, setSubmittingRejectFeedback] = useState(false);

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
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
        const userData = await apiGet<UserDetail>(`/users/${userId}`, { skipCache: true });
        if (!isCurrent) return;

        setUser(userData);
        let targetEnrolmentId = "";
        if (userData.enrolments && userData.enrolments.length > 0) {
          const matchedEnrolment = queryEnrolmentId
            ? userData.enrolments.find((e) => e.id === queryEnrolmentId)
            : null;
          targetEnrolmentId = matchedEnrolment ? matchedEnrolment.id : (userData.enrolments[0]?.id ?? "");
          setSelectedEnrolmentId(targetEnrolmentId);
        }

        // Fetch progression immediately while skeleton is shown so all data is ready on load
        if (userData.role === "USER" && targetEnrolmentId) {
          await fetchProgression(targetEnrolmentId);
        }

        // Load attendance history asynchronously in background for learners
        if (userData.role === "USER") {
          apiGet<LearnerAttendanceHistory>(`/attendance/user/${userId}`, { skipCache: true })
            .then((attData) => {
              if (isCurrent && attData) setAttendanceHistory(attData);
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
  }, [userId, queryEnrolmentId]);

  // Load progression when selected enrolment changes (learners only)
  useEffect(() => {
    if (!selectedEnrolmentId || (user && user.role !== "USER")) {
      return;
    }
    if (lastFetchedEnrolmentId.current === selectedEnrolmentId) {
      return;
    }
    const controller = new AbortController();
    fetchProgression(selectedEnrolmentId, controller.signal);
    return () => controller.abort();
  }, [selectedEnrolmentId, user?.role]);

  async function fetchProgression(enrolmentId: string, signal?: AbortSignal) {
    lastFetchedEnrolmentId.current = enrolmentId;
    setCompliance(null);
    try {
      // Parallel fetch with apiGet: auto-parsed JSON, deduplicated & fresh from DB
      const [progResult, compResult, stagesResult, certResult] = await Promise.allSettled([
        apiGet<EnrolmentProgression>(`/progression/enrolments/${enrolmentId}`, { signal, skipCache: true }),
        apiGet<any>(`/attendance/compliance/${enrolmentId}`, { signal, skipCache: true }),
        apiGet<LearnerProgressionStages>(`/progression/enrolments/${enrolmentId}/stages`, { signal, skipCache: true }),
        apiGet<CertificateEligibility>(`/certificates/eligibility/${enrolmentId}`, { signal, skipCache: true }),
      ]);

      if (progResult.status === "fulfilled" && progResult.value) {
        setProgression(progResult.value);
      } else if (progResult.status === "rejected") {
        console.error("Progression fetch failed:", progResult.reason);
      }

      if (compResult.status === "fulfilled" && compResult.value) {
        setCompliance(compResult.value);
      }

      if (stagesResult.status === "fulfilled" && stagesResult.value) {
        setStagesEval(stagesResult.value);
      } else if (stagesResult.status === "rejected") {
        console.warn("Could not fetch 5-stage progression evaluation", stagesResult.reason);
      }

      if (certResult.status === "fulfilled" && certResult.value) {
        setCertEligibility(certResult.value);
      } else if (certResult.status === "rejected") {
        console.warn("Could not fetch certificate eligibility evaluation", certResult.reason);
      }

      // Fetch 1:1 requests & mission statement submissions for this student
      fetchOneOnOneRequests()
        .then((reqs) => {
          if (Array.isArray(reqs)) {
            setOneOnOneRequests(reqs.filter((r) => r.userId === userId || r.enrolmentId === enrolmentId));
          }
        })
        .catch(() => {});

      fetchMissionStatements()
        .then((subs) => {
          if (Array.isArray(subs)) {
            setMissionSubmissions(subs.filter((s) => s.userId === userId || s.enrolmentId === enrolmentId));
          }
        })
        .catch(() => {});
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("Error fetching progression:", err);
      }
    }
  }

  // Handle enrolment track switch by administrator: loads entire page with skeleton and syncs URL
  const handleEnrolmentChange = async (newEnrolmentId: string) => {
    if (newEnrolmentId === selectedEnrolmentId) return;

    setLoading(true);
    setSelectedEnrolmentId(newEnrolmentId);

    // Synchronize URL parameters
    const targetEnr = user?.enrolments?.find((e) => e.id === newEnrolmentId);
    const targetBatch = targetEnr?.batch;
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("enrolmentId", newEnrolmentId);
      if (targetBatch?.id) {
        url.searchParams.set("batchId", targetBatch.id);
      } else {
        url.searchParams.delete("batchId");
      }
      if (targetBatch?.name) {
        url.searchParams.set("batchName", targetBatch.name);
      } else {
        url.searchParams.delete("batchName");
      }
      router.replace(url.pathname + url.search);
    }

    // Clear stale state
    setProgression(null);
    setCompliance(null);
    setStagesEval(null);
    setCertEligibility(null);

    try {
      await fetchProgression(newEnrolmentId);
    } catch (err: any) {
      console.error("Failed to load progression for enrolment:", err);
    } finally {
      setLoading(false);
    }
  };

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
    if (!selectedEnrolmentId || syncing) return;
    setSyncing(true);

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
      setSyncing(false);
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

  // Handle Certificate PDF download
  async function handleDownloadCertificatePdf(certId?: string, directUrl?: string | null) {
    if (!certId && !directUrl) {
      toast.error("Certificate record not found");
      return;
    }
    try {
      if (certId) {
        const res = await fetch(`${API_URL}/certificates/${certId}/pdf`);
        if (res.ok) {
          const data = await res.json();
          if (data.downloadUrl || data.pdfUrl) {
            window.open(data.downloadUrl || data.pdfUrl, "_blank");
            return;
          }
        }
      }
      if (directUrl) {
        window.open(directUrl, "_blank");
        return;
      }
      toast.info("Certificate PDF is currently generating. Please try again in a moment.");
    } catch {
      if (directUrl) {
        window.open(directUrl, "_blank");
      }
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
        {/* Back Link Skeleton */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", width: "160px" }}>
          <div className="skeleton" style={{ width: "14px", height: "14px", borderRadius: "4px" }} />
          <div className="skeleton" style={{ width: "130px", height: "14px", borderRadius: "4px" }} />
        </div>

        {/* Profile Header Card Skeleton */}
        <div style={{ background: "#ffffff", border: "1px solid var(--border-light, #e7decb)", borderRadius: "12px", padding: "1rem 1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <div className="skeleton" style={{ width: "48px", height: "48px", borderRadius: "12px" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <div className="skeleton" style={{ width: "180px", height: "22px", borderRadius: "6px" }} />
                  <div className="skeleton" style={{ width: "60px", height: "18px", borderRadius: "100px" }} />
                </div>
                <div className="skeleton" style={{ width: "240px", height: "14px", borderRadius: "4px" }} />
              </div>
            </div>
            <div className="skeleton" style={{ width: "130px", height: "36px", borderRadius: "8px" }} />
          </div>
        </div>

        {/* Enrolment Context Bar Skeleton */}
        <div style={{ background: "#faf7f2", border: "1px solid var(--border-light, #e7decb)", borderRadius: "10px", padding: "0.75rem 1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="skeleton" style={{ width: "280px", height: "24px", borderRadius: "6px" }} />
          <div className="skeleton" style={{ width: "160px", height: "24px", borderRadius: "6px" }} />
        </div>

        {/* Metrics Strip Skeleton */}
        <div style={{ background: "#ffffff", border: "1px solid var(--border-light, #e7decb)", borderRadius: "12px", padding: "0.75rem 1.25rem", display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
          {[120, 100, 90, 80, 95, 130].map((w, idx) => (
            <div key={idx} className="skeleton" style={{ width: `${w}px`, height: "18px", borderRadius: "4px" }} />
          ))}
        </div>

        {/* 5-Stage Stepper Ribbon Skeleton */}
        <div style={{ background: "#ffffff", border: "1px solid var(--border-light, #e7decb)", borderRadius: "12px", padding: "1rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div className="skeleton" style={{ width: "200px", height: "16px", borderRadius: "4px" }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "0.6rem" }}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="skeleton" style={{ height: "64px", borderRadius: "10px" }} />
            ))}
          </div>
        </div>

        {/* Workspace Card Skeleton */}
        <div className="skeleton" style={{ width: "100%", height: "280px", borderRadius: "12px" }} />
      </div>
    );
  }

  // Empty state
  if (!user) {
    return (
      <div className={styles.container}>
        <Link href={backHref} className={styles.backLink}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span>{backLabel}</span>
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
          <Link href={backHref} className={styles.actionBtnSecondary} style={{ marginTop: "0.5rem" }}>
            {fromBatchId ? `Return to ${fromBatchName ? decodeURIComponent(fromBatchName) : "Batch"}` : "Return to Users & Enrolments"}
          </Link>
        </div>
      </div>
    );
  }

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
        <Link href={backHref} className={styles.backLink}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span>{backLabel}</span>
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
                  <span>
                    {user.role === "USER"
                      ? `Enrolled ${formatNumericDate(selectedEnrolment?.createdAt || selectedEnrolment?.enrolledAt || user.createdAt)}`
                      : `Joined ${formatNumericDate(user.createdAt)}`}
                  </span>
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
                disabled={!selectedEnrolmentId || syncing}
                title="Recalculate progression locks and gates"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ animation: syncing ? "spin 1s linear infinite" : undefined }}>
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
                <span>{syncing ? "Syncing..." : "Sync Progress"}</span>
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
                  onChange={handleEnrolmentChange}
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
                  <span>Videos:</span>
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
              </div>
              {stagesEval?.allStagesCompleted ? (
                <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#15803d", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  All Milestones Cleared
                </span>
              ) : null}
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
                    <div className={styles.stepNameText}>Curriculum</div>
                  </button>
                );
              })()}

              {/* STAGE 2: FINAL EXAM */}
              {(() => {
                const s2 = stagesEval?.stages?.STAGE_2_EXAM;
                const isDone = Boolean(s2?.isCompleted);
                const isUnlocked = Boolean(s2?.isUnlocked);
                const isSelected = selectedStageKey === "STAGE_2_EXAM";
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
                      ) : null}
                    </div>
                    <div className={styles.stepNameText}>Final Exam</div>
                  </button>
                );
              })()}

              {/* STAGE 3: LIVE ATTENDANCE */}
              {(() => {
                const s3 = stagesEval?.stages?.STAGE_3_ATTENDANCE;
                const weeklySessions = (attendanceHistory?.history || []).filter(
                  (r) => r.sessionType !== "ONE_ON_ONE" && (!activeBatchId || r.batchId === activeBatchId)
                );
                const attendedCount = s3?.details?.attendedSessions ?? compliance?.attendedSessions ?? compliance?.attendedSessionCount ?? 0;
                const requiredCount = Math.max(
                  s3?.details?.requiredSessions ?? compliance?.requiredSessions ?? compliance?.requiredSessionCount ?? 0,
                  weeklySessions.length
                );
                const hasScheduledSessions = requiredCount > 0;
                const attPct = Math.round(
                  s3?.details?.attendancePercentage ??
                  compliance?.attendancePercentage ??
                  (hasScheduledSessions ? (attendedCount / requiredCount) * 100 : 0)
                );
                const reqPct =
                  s3?.details?.thresholdPercent ??
                  compliance?.thresholdPercent ??
                  compliance?.thresholdUsed ??
                  selectedEnrolment?.batch?.attendanceThreshold ??
                  selectedEnrolment?.batch?.program?.attendanceThreshold ??
                  80;
                const isOverridden = Boolean(s3?.isOverridden);
                const isCompliant = Boolean(
                  s3?.isCompleted ||
                  compliance?.status === "COMPLIANT" ||
                  (hasScheduledSessions && attPct >= reqPct)
                );
                const isDone = isOverridden || isCompliant;
                const isSelected = selectedStageKey === "STAGE_3_ATTENDANCE";
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
                      {isOverridden ? (
                        <span className={styles.pipelineBadgeCompleted}>Overridden</span>
                      ) : isDone ? (
                        <span className={styles.pipelineBadgeCompleted}>{attPct}%</span>
                      ) : (
                        <span className={styles.pipelineBadgeActive}>
                          {hasScheduledSessions ? `${attPct}%` : "0%"}
                        </span>
                      )}
                    </div>
                    <div className={styles.stepNameText}>Attendance</div>
                  </button>
                );
              })()}

              {/* STAGE 4: 1-ON-1 SESSION */}
              {(() => {
                const s4 = stagesEval?.stages?.STAGE_4_ONE_ON_ONE;
                const isCallCompleted = Boolean(
                  s4?.isCompleted ||
                  (s4?.details as any)?.isCallCompleted ||
                  selectedEnrolment?.oneOnOneCompletedAt ||
                  oneOnOneRequests?.some((r) => (r.status as string) === "COMPLETED" || (r.session as any)?.status === "COMPLETED") ||
                  attendanceHistory?.history?.some((r) => r.sessionType === "ONE_ON_ONE" && (r.status === "PRESENT" || (r.minutesPresent ?? 0) > 0))
                );
                const isDone = Boolean(s4?.isCompleted || s4?.isOverridden || isCallCompleted);
                const isUnlocked = Boolean(s4?.isUnlocked || isCallCompleted);
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
                          {s4?.isOverridden ? "Overridden" : "Completed"}
                        </span>
                      ) : isUnlocked ? (
                        <span className={styles.pipelineBadgeActive}>Pending</span>
                      ) : null}
                    </div>
                    <div className={styles.stepNameText}>1:1 Call</div>
                  </button>
                );
              })()}

              {/* STAGE 5: MISSION STATEMENT */}
              {(() => {
                const s5 = stagesEval?.stages?.STAGE_5_MISSION_STATEMENT;
                const isMissionApproved = Boolean(
                  s5?.isCompleted ||
                  (s5?.details as any)?.isMissionApproved ||
                  selectedEnrolment?.missionStatementApprovedAt ||
                  missionSubmissions?.some((m) => m.status === "APPROVED")
                );
                const isDone = Boolean(s5?.isCompleted || s5?.isOverridden || isMissionApproved);
                const isUnlocked = Boolean(s5?.isUnlocked || isMissionApproved);
                const isSelected = selectedStageKey === "STAGE_5_MISSION_STATEMENT";
                const latestStatus = (s5?.details as any)?.latestStatus || (missionSubmissions[0]?.status ?? null);
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
                        <span className={styles.pipelineBadgeCompleted}>
                          {s5?.isOverridden ? "Overridden" : "Approved"}
                        </span>
                      ) : latestStatus === "SUBMITTED" ? (
                        <span className={styles.pipelineBadgeActive}>Under Review</span>
                      ) : isUnlocked ? (
                        <span className={styles.pipelineBadgeActive}>Pending</span>
                      ) : null}
                    </div>
                    <div className={styles.stepNameText}>Mission Statement</div>
                  </button>
                );
              })()}

              {/* MILESTONE: CERTIFICATE */}
              {(() => {
                const isIssued = Boolean(
                  certEligibility?.status === "ISSUED" ||
                  progression?.certificate?.status === "ISSUED" ||
                  (progression as any)?.certificateIssued ||
                  (selectedEnrolment as any)?.certificate?.status === "ISSUED"
                );
                const isEligible = Boolean(certEligibility?.isEligible || stagesEval?.allStagesCompleted);
                const isSelected = selectedStageKey === "CERTIFICATE";
                return (
                  <button
                    type="button"
                    className={`${styles.pipelineStepCard} ${isSelected ? styles.pipelineStepCardActive : ""}`}
                    onClick={() => setSelectedStageKey("CERTIFICATE")}
                  >
                    <div className={styles.stepCardTop}>
                      <span className={`${styles.stepNumberPill} ${isIssued || isEligible ? styles.stepNumberPillCompleted : ""}`}>
                        {isIssued ? (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <circle cx="12" cy="8" r="6" />
                            <path d="M15.4 13.8L18 22l-6-3-6 3 2.6-8.2" />
                          </svg>
                        )}
                      </span>
                      {isIssued ? (
                        <span className={styles.pipelineBadgeCompleted}>Issued</span>
                      ) : isEligible ? (
                        <span className={styles.pipelineBadgeCompleted}>Eligible</span>
                      ) : null}
                    </div>
                    <div className={styles.stepNameText}>Certificate</div>
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
                    <span>Stage 1: Curriculum</span>
                    {stagesEval?.stages?.STAGE_1_CURRICULUM?.isOverridden && (
                      <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "1px 6px", borderRadius: "4px", background: "#fef3c7", color: "#92400e" }}>
                        Administratively Overridden
                      </span>
                    )}
                  </h4>
                  <p className={styles.stageHeaderSubtitle}>
                    {completedSteps} of {totalSteps} Steps Completed ({overallPct}%)
                  </p>
                </div>
                <div className={styles.stageHeaderActions}>
                  {completedSteps < totalSteps && (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                      <button
                        type="button"
                        onClick={() => setTargetStageForOverride("STAGE_1_CURRICULUM")}
                        className={styles.tableActionBtn}
                        style={{ color: "var(--accent-primary)", borderColor: "var(--accent-primary)" }}
                      >
                        Override Curriculum
                      </button>
                      <div className={styles.helpTooltip}>
                        <span
                          className={styles.helpIcon}
                          aria-label="Override Information"
                          tabIndex={0}
                        >
                          ?
                        </span>
                        <div className={styles.helpTooltipContent}>
                          Clicking override bypasses curriculum completion requirements and marks Stage 1 cleared. This action is permanently recorded in the immutable audit log with your reason.
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {!progression || !progression.steps || progression.steps.length === 0 ? (
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
                    <span>Stage 2: Final Exam</span>
                    <div className={`${styles.helpTooltip} ${styles.helpTooltipLeft}`}>
                      <span className={styles.helpIcon} aria-label="Prerequisites Information" tabIndex={0}>?</span>
                      <div className={styles.helpTooltipContent}>
                        Prerequisites: Stage 1 (Curriculum) must be 100% completed before attempting the final exam.
                      </div>
                    </div>
                    {stagesEval?.stages?.STAGE_2_EXAM?.isOverridden && (
                      <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "1px 6px", borderRadius: "4px", background: "#fef3c7", color: "#92400e" }}>
                        Administratively Overridden
                      </span>
                    )}
                  </h4>
                </div>
                <div className={styles.stageHeaderActions}>
                  <Link
                    href={`/approvals?tab=oral${activeBatchId ? `&batchId=${activeBatchId}` : ""}`}
                    className={styles.tableActionBtn}
                  >
                    Open Oral Approvals ↗
                  </Link>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <button
                      type="button"
                      onClick={() => setTargetStageForOverride("STAGE_2_EXAM")}
                      className={styles.tableActionBtn}
                      style={{ color: "var(--accent-primary)", borderColor: "var(--accent-primary)" }}
                    >
                      Override Final Exam
                    </button>
                    <div className={styles.helpTooltip}>
                      <span className={styles.helpIcon} aria-label="Override Information" tabIndex={0}>?</span>
                      <div className={styles.helpTooltipContent}>
                        Clicking override marks Stage 2 (Final Exam) cleared, granting passing status regardless of exam scores. This action is permanently recorded in the audit log.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.stageDetailsBox}>
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
              </div>
            </div>
          )}

          {selectedStageKey === "STAGE_3_ATTENDANCE" && (
            <div className={styles.stageWorkspaceCard}>
              <div className={styles.stageHeader}>
                <div className={styles.stageHeaderLeft}>
                  <h4 className={styles.stageHeaderTitle}>
                    <span>Stage 3: Live Attendance</span>
                    <div className={`${styles.helpTooltip} ${styles.helpTooltipLeft}`}>
                      <span className={styles.helpIcon} aria-label="Prerequisites Information" tabIndex={0}>?</span>
                      <div className={styles.helpTooltipContent}>
                        Prerequisites: Learner must be actively enrolled in a live cohort batch. Requires ≥80% attendance compliance across scheduled live sessions.
                      </div>
                    </div>
                    {stagesEval?.stages?.STAGE_3_ATTENDANCE?.isOverridden && (
                      <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "1px 6px", borderRadius: "4px", background: "#fef3c7", color: "#92400e" }}>
                        Administratively Overridden
                      </span>
                    )}
                  </h4>
                </div>
                <div className={styles.stageHeaderActions}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <button
                      type="button"
                      onClick={() => setTargetStageForOverride("STAGE_3_ATTENDANCE")}
                      className={styles.tableActionBtn}
                      style={{ color: "var(--accent-primary)", borderColor: "var(--accent-primary)" }}
                    >
                      Override Attendance
                    </button>
                    <div className={styles.helpTooltip}>
                      <span className={styles.helpIcon} aria-label="Override Information" tabIndex={0}>?</span>
                      <div className={styles.helpTooltipContent}>
                        Clicking override bypasses the 80% weekly attendance threshold and clears Stage 3. This action is permanently recorded in the audit log.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Attendance Compliance Meter Card */}
              {(() => {
                const s3 = stagesEval?.stages?.STAGE_3_ATTENDANCE;
                const weeklySessions = (attendanceHistory?.history || []).filter(
                  (r) => r.sessionType !== "ONE_ON_ONE" && (!activeBatchId || r.batchId === activeBatchId)
                );
                // Dynamic required threshold set by Admin for this course/batch (never static)
                const reqPct =
                  s3?.details?.thresholdPercent ??
                  compliance?.thresholdPercent ??
                  compliance?.thresholdUsed ??
                  selectedEnrolment?.batch?.attendanceThreshold ??
                  selectedEnrolment?.batch?.program?.attendanceThreshold ??
                  80;
                const attendedCount = s3?.details?.attendedSessions ?? compliance?.attendedSessions ?? compliance?.attendedSessionCount ?? 0;
                const requiredCount = Math.max(
                  s3?.details?.requiredSessions ?? compliance?.requiredSessions ?? compliance?.requiredSessionCount ?? 0,
                  weeklySessions.length
                );
                const hasScheduledSessions = requiredCount > 0;
                const attPct = Math.round(
                  s3?.details?.attendancePercentage ??
                  compliance?.attendancePercentage ??
                  (hasScheduledSessions ? (attendedCount / requiredCount) * 100 : 0)
                );
                const isCompliant = hasScheduledSessions && (attPct >= reqPct || Boolean(s3?.isCompleted) || compliance?.status === "COMPLIANT");

                return (
                  <div className={styles.complianceMeterCard}>
                    <div className={styles.complianceStatsRow}>
                      <span>
                        Live Session Attendance:{" "}
                        {hasScheduledSessions ? (
                          <>
                            <strong style={{ color: isCompliant ? "#15803d" : "#991b1b" }}>{attPct}%</strong> ({attendedCount} of {requiredCount} Sessions Attended)
                          </>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>No cohort live sessions scheduled yet (0 required)</span>
                        )}
                      </span>
                      <span style={{
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: "100px",
                        background: s3?.isOverridden
                          ? "#fef3c7"
                          : !hasScheduledSessions
                          ? "#f5ece1"
                          : isCompliant
                          ? "#dcfce7"
                          : "#fee2e2",
                        color: s3?.isOverridden
                          ? "#92400e"
                          : !hasScheduledSessions
                          ? "#78716a"
                          : isCompliant
                          ? "#15803d"
                          : "#991b1b",
                        border: `1px solid ${
                          s3?.isOverridden
                            ? "#fde68a"
                            : !hasScheduledSessions
                            ? "#e7e0d6"
                            : isCompliant
                            ? "#bbf7d0"
                            : "#fecaca"
                        }`
                      }}>
                        {s3?.isOverridden
                          ? "OVERRIDDEN"
                          : !hasScheduledSessions
                          ? "NO SESSIONS SCHEDULED"
                          : isCompliant
                          ? `COMPLIANT (≥${reqPct}%)`
                          : `BELOW ${reqPct}% THRESHOLD`}
                      </span>
                    </div>

                    <div className={styles.complianceBarWrapper}>
                      <div className={styles.complianceTrack}>
                        <div
                          className={styles.complianceFill}
                          style={{
                            width: `${hasScheduledSessions ? Math.min(100, Math.max(0, attPct)) : 0}%`,
                            background: !hasScheduledSessions ? "#d6d3d1" : isCompliant ? "#16a34a" : "#dc2626",
                          }}
                        />
                        {hasScheduledSessions && (
                          <div
                            style={{
                              position: "absolute",
                              left: `${Math.min(100, Math.max(0, reqPct))}%`,
                              top: 0,
                              bottom: 0,
                              width: "2px",
                              backgroundColor: "#92400e",
                              zIndex: 2,
                              pointerEvents: "none",
                            }}
                            title={`Minimum Required: ${reqPct}%`}
                          />
                        )}
                      </div>
                      <div className={styles.complianceLabelsRow}>
                        <span>0%</span>
                        <span style={{ color: isCompliant ? "#15803d" : "var(--text-muted)" }}>
                          Required Minimum: {reqPct}%
                        </span>
                        <span>100%</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Live Cohort Sessions Table */}
              {(() => {
                // Filter weekly sessions specifically to the currently selected cohort batch
                const weeklySessions = (attendanceHistory?.history || []).filter(
                  (r) => r.sessionType !== "ONE_ON_ONE" && (!activeBatchId || r.batchId === activeBatchId)
                );

                return (
                  <div className={styles.tableWrapper}>
                    <table className={styles.cleanTable}>
                      <thead>
                        <tr>
                          <th>Live Cohort Session</th>
                          <th>Date</th>
                          <th>Duration Attended</th>
                          <th style={{ textAlign: "right" }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {weeklySessions.length === 0 ? (
                          <tr>
                            <td colSpan={4} style={{ textAlign: "center", padding: "2.5rem", color: "var(--text-muted)" }}>
                              No cohort live sessions recorded yet for this batch.
                            </td>
                          </tr>
                        ) : (
                          weeklySessions.map((record) => {
                            const sessionTime = new Date(record.startTimeUtc).getTime();
                            const isFuture = sessionTime > Date.now();
                            // Required threshold for this session
                            const sReqPct =
                              stagesEval?.stages?.STAGE_3_ATTENDANCE?.details?.thresholdPercent ??
                              compliance?.thresholdPercent ??
                              compliance?.thresholdUsed ??
                              selectedEnrolment?.batch?.program?.attendanceThreshold ??
                              80;
                            const isPresent =
                              record.status === "PRESENT" ||
                              record.status === "PRESENT_AUTO" ||
                              record.status === "PRESENT_MANUAL" ||
                              record.status === "CORRECTED" ||
                              record.status === "PRESENT_LIVE" ||
                              record.status === "PRESENT_RECORDED" ||
                              (record.attendancePercentage != null && record.attendancePercentage >= sReqPct);
                            // Enhanced UX: Partial status for learners who joined but didn't reach threshold
                            const isPartial = !isPresent && !isFuture && ((record.minutesPresent ?? 0) > 0 || (record.attendancePercentage ?? 0) > 0);
                            const isUpcoming = isFuture && !isPresent && !isPartial;

                            return (
                              <tr key={record.sessionId} className={styles.tableRow}>
                                <td>
                                  <strong>{record.sessionTitle}</strong>
                                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                                    Live Cohort Session
                                  </div>
                                </td>
                                <td>
                                  <span>{formatNumericDate(record.startTimeUtc)}</span>
                                </td>
                                <td>
                                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                    <span>
                                      {isUpcoming
                                        ? `Scheduled (${record.durationMinutes} min)`
                                        : `${record.minutesPresent} min / ${record.durationMinutes} min`}
                                    </span>
                                    {!isUpcoming && record.durationMinutes > 0 && (
                                      <span style={{ fontSize: "0.72rem", color: isPresent ? "#15803d" : isPartial ? "#b45309" : "var(--text-muted)" }}>
                                        {Math.round(record.attendancePercentage ?? 0)}% attended ({sReqPct}% required)
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td style={{ textAlign: "right" }}>
                                  <span
                                    style={{
                                      display: "inline-block",
                                      padding: "3px 9px",
                                      borderRadius: "6px",
                                      fontSize: "0.72rem",
                                      fontWeight: 700,
                                      background: isUpcoming
                                        ? "#eff6ff"
                                        : isPresent
                                        ? "#dcfce7"
                                        : isPartial
                                        ? "#fef3c7"
                                        : "#fee2e2",
                                      color: isUpcoming
                                        ? "#1d4ed8"
                                        : isPresent
                                        ? "#15803d"
                                        : isPartial
                                        ? "#b45309"
                                        : "#991b1b",
                                      border: `1px solid ${
                                        isUpcoming
                                          ? "#bfdbfe"
                                          : isPresent
                                          ? "#bbf7d0"
                                          : isPartial
                                          ? "#fde68a"
                                          : "#fecaca"
                                      }`,
                                    }}
                                    title={
                                      isPartial
                                        ? `Attended ${record.minutesPresent}m of ${record.durationMinutes}m (${Math.round(record.attendancePercentage)}%). Watch recording to complete remaining minutes.`
                                        : undefined
                                    }
                                  >
                                    {isUpcoming
                                      ? "Upcoming"
                                      : isPresent
                                      ? "Present"
                                      : isPartial
                                      ? `Partial (${Math.round(record.attendancePercentage)}%)`
                                      : "Absent"}
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

            </div>
          )}

          {selectedStageKey === "STAGE_4_ONE_ON_ONE" && (
            <div className={styles.stageWorkspaceCard}>
              <div className={styles.stageHeader}>
                <div className={styles.stageHeaderLeft}>
                  <h4 className={styles.stageHeaderTitle}>
                    <span>Stage 4: 1:1 Call</span>
                    <div className={`${styles.helpTooltip} ${styles.helpTooltipLeft}`}>
                      <span className={styles.helpIcon} aria-label="Prerequisites Information" tabIndex={0}>?</span>
                      <div className={styles.helpTooltipContent}>
                        Prerequisites: Stage 1 (Curriculum), Stage 2 (Final Exam), and ≥80% live attendance compliance in Stage 3 live cohort sessions are required before scheduling.
                      </div>
                    </div>
                    {stagesEval?.stages?.STAGE_4_ONE_ON_ONE?.isOverridden && (
                      <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "1px 6px", borderRadius: "4px", background: "#fef3c7", color: "#92400e" }}>
                        Administratively Overridden
                      </span>
                    )}
                  </h4>
                </div>
                <div className={styles.stageHeaderActions}>
                  <Link
                    href={`/approvals?tab=coaching${activeBatchId ? `&batchId=${activeBatchId}` : ""}`}
                    className={styles.tableActionBtn}
                  >
                    Open Coaching Schedule ↗
                  </Link>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <button
                      type="button"
                      onClick={() => setTargetStageForOverride("STAGE_4_ONE_ON_ONE")}
                      className={styles.tableActionBtn}
                      style={{ color: "var(--accent-primary)", borderColor: "var(--accent-primary)" }}
                    >
                      Override 1:1 Call
                    </button>
                    <div className={styles.helpTooltip}>
                      <span className={styles.helpIcon} aria-label="Override Information" tabIndex={0}>?</span>
                      <div className={styles.helpTooltipContent}>
                        Clicking override marks Stage 4 (1:1 Call) satisfied without requiring an attended consultation. This action is permanently recorded in the audit log.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.stageDetailsBox}>

                {(() => {
                  const oneOnOne = attendanceHistory?.history?.find((r) => r.sessionType === "ONE_ON_ONE");
                  const isCompleted = stagesEval?.stages?.STAGE_4_ONE_ON_ONE?.isCompleted;
                  const latest1on1 = oneOnOneRequests[0] || null;

                  return (
                    <>
                      <div className={styles.inspectorGrid}>
                        <div className={styles.inspectorMetaItem}>
                          <span className={styles.inspectorMetaLabel}>Session</span>
                          <span className={styles.inspectorMetaValue}>
                            {oneOnOne ? oneOnOne.sessionTitle : "1:1 Call"}
                          </span>
                        </div>
                        <div className={styles.inspectorMetaItem}>
                          <span className={styles.inspectorMetaLabel}>Scheduled Date</span>
                          <span className={styles.inspectorMetaValue}>
                            {latest1on1?.requestedStart
                              ? formatNumericDate(latest1on1.requestedStart)
                              : oneOnOne ? formatNumericDate(oneOnOne.startTimeUtc) : "Pending Booking"}
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
                            {isCompleted ? "Completed & Satisfied" : "Pending Call Completion"}
                          </span>
                        </div>
                      </div>

                      {/* In-Profile Action: Booking Request Pending Approval */}
                      {latest1on1 && latest1on1.status === "PENDING_APPROVAL" && (
                        <div style={{ padding: "0.85rem 1rem", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: "8px", marginTop: "1rem" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
                            <div>
                              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#92400e", textTransform: "uppercase" }}>
                                Booking Request Pending Approval
                              </div>
                              <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "#78350f", marginTop: "2px" }}>
                                Requested Slot: {new Date(latest1on1.requestedStart).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                {latest1on1.learnerTimezone ? ` (${latest1on1.learnerTimezone})` : ""}
                              </div>
                              {latest1on1.notes && (
                                <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "3px" }}>
                                  Learner Notes: <em>{latest1on1.notes}</em>
                                </div>
                              )}
                            </div>
                            <div style={{ display: "flex", gap: "0.5rem" }}>
                              <button
                                type="button"
                                disabled={actingOneOnOne}
                                onClick={async () => {
                                  setActingOneOnOne(true);
                                  try {
                                    await approveOneOnOneRequest(latest1on1.id, {
                                      startTime: latest1on1.requestedStart,
                                      endTime: latest1on1.requestedEnd,
                                    });
                                    toast.success("1:1 Call booking approved and scheduled with Zoom link!");
                                    await fetchProgression(selectedEnrolmentId);
                                  } catch (err: any) {
                                    toast.error(err.message || "Failed to approve 1:1 request");
                                  } finally {
                                    setActingOneOnOne(false);
                                  }
                                }}
                                className={styles.actionBtnPrimary}
                                style={{ padding: "0.45rem 0.85rem", fontSize: "0.8rem", background: "#15803d", borderColor: "#15803d" }}
                              >
                                {actingOneOnOne ? "Approving..." : "Approve Call Slot ✓"}
                              </button>
                              <button
                                type="button"
                                disabled={actingOneOnOne}
                                onClick={async () => {
                                  const reason = prompt("Enter rejection reason for learner:") || "";
                                  if (!reason.trim()) return;
                                  setActingOneOnOne(true);
                                  try {
                                    await rejectOneOnOneRequest(latest1on1.id, reason.trim());
                                    toast.info("1:1 Call booking request rejected.");
                                    await fetchProgression(selectedEnrolmentId);
                                  } catch (err: any) {
                                    toast.error(err.message || "Failed to reject 1:1 request");
                                  } finally {
                                    setActingOneOnOne(false);
                                  }
                                }}
                                className={styles.tableActionBtn}
                                style={{ color: "#991b1b", borderColor: "#fecaca" }}
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* In-Profile Action: Scheduled Session Ready to Mark Completed */}
                      {((latest1on1 && latest1on1.status === "APPROVED") || oneOnOne) && !isCompleted && (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.85rem 1rem", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", marginTop: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
                          <div>
                            <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#166534", textTransform: "uppercase" }}>Scheduled 1:1 Consultation</span>
                            <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "#15803d", marginTop: "2px" }}>
                              {latest1on1?.session?.startTime
                                ? new Date(latest1on1.session.startTime).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                                : (oneOnOne ? formatNumericDate(oneOnOne.startTimeUtc) : "Confirmed")}
                            </div>
                            {latest1on1?.session?.joinUrl && (
                              <a href={latest1on1.session.joinUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.78rem", color: "var(--accent-primary)", textDecoration: "none", fontWeight: 600, marginTop: "3px", display: "inline-block" }}>
                                Join Zoom Meeting ↗
                              </a>
                            )}
                          </div>
                          <button
                            type="button"
                            disabled={actingOneOnOne}
                            onClick={async () => {
                              const sessionId = latest1on1?.sessionId || latest1on1?.session?.id || oneOnOne?.sessionId;
                              if (!sessionId) {
                                toast.error("No active session ID found to mark completed.");
                                return;
                              }
                              setActingOneOnOne(true);
                              try {
                                const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
                                const res = await fetch(`${API_URL}/sessions/${sessionId}`, {
                                  method: "PATCH",
                                  headers: {
                                    "Content-Type": "application/json",
                                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                                  },
                                  body: JSON.stringify({ status: "COMPLETED" }),
                                });
                                if (!res.ok) throw new Error(await errorMessage(res, "Failed to complete session"));
                                toast.success("1:1 Call marked completed! Stage 5 (Mission Statement) unlocked.");
                                await fetchProgression(selectedEnrolmentId);
                              } catch (err: any) {
                                toast.error(err.message || "Failed to mark call completed");
                              } finally {
                                setActingOneOnOne(false);
                              }
                            }}
                            className={styles.actionBtnPrimary}
                            style={{ padding: "0.45rem 0.9rem", fontSize: "0.8rem", background: "#15803d", borderColor: "#15803d" }}
                          >
                            {actingOneOnOne ? "Completing Session..." : "Mark Session Completed ✓"}
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {selectedStageKey === "STAGE_5_MISSION_STATEMENT" && (
            <div className={styles.stageWorkspaceCard}>
              <div className={styles.stageHeader}>
                <div className={styles.stageHeaderLeft}>
                  <h4 className={styles.stageHeaderTitle}>
                    <span>Stage 5: Mission Statement</span>
                    <div className={`${styles.helpTooltip} ${styles.helpTooltipLeft}`}>
                      <span className={styles.helpIcon} aria-label="Prerequisites Information" tabIndex={0}>?</span>
                      <div className={styles.helpTooltipContent}>
                        Prerequisites: Completion of Stage 4 (1:1 Closing Call) is required before mission statement submission and final certificate issuance.
                      </div>
                    </div>
                    {stagesEval?.stages?.STAGE_5_MISSION_STATEMENT?.isOverridden && (
                      <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "1px 6px", borderRadius: "4px", background: "#fef3c7", color: "#92400e" }}>
                        Administratively Overridden
                      </span>
                    )}
                  </h4>
                </div>
                <div className={styles.stageHeaderActions}>
                  <Link
                    href={`/approvals?tab=missions${activeBatchId ? `&batchId=${activeBatchId}` : ""}`}
                    className={styles.tableActionBtn}
                  >
                    Review in Mission Approvals ↗
                  </Link>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <button
                      type="button"
                      onClick={() => setTargetStageForOverride("STAGE_5_MISSION_STATEMENT")}
                      className={styles.tableActionBtn}
                      style={{ color: "var(--accent-primary)", borderColor: "var(--accent-primary)" }}
                    >
                      Override Mission Statement
                    </button>
                    <div className={styles.helpTooltip}>
                      <span className={styles.helpIcon} aria-label="Override Information" tabIndex={0}>?</span>
                      <div className={styles.helpTooltipContent}>
                        Clicking override approves Stage 5 and immediately triggers automated certificate generation. This action is permanently recorded in the audit log.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.stageDetailsBox}>

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

                {/* In-Profile Document Inspection & Action for Mission Statement */}
                {(() => {
                  const latestMission = missionSubmissions[0] || null;
                  if (!latestMission) return null;
                  const fileLink = latestMission.fileUrl.startsWith("http")
                    ? latestMission.fileUrl
                    : `${API_URL}/mission-statements/${latestMission.id}/file`;
                  const sizeMb = (latestMission.sizeBytes / (1024 * 1024)).toFixed(2);

                  return (
                    <div style={{ marginTop: "1rem", padding: "0.9rem 1rem", borderRadius: "8px", background: "#fdfbf7", border: "1px solid #ebdccb" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ fontSize: "0.72rem", fontWeight: 700, padding: "2px 8px", borderRadius: "100px", background: "#e0e7ff", color: "#3730a3" }}>
                              v{latestMission.version}
                            </span>
                            <strong style={{ fontSize: "0.875rem", color: "var(--text-primary)" }}>
                              {latestMission.fileName || "Mission-Statement.pdf"}
                            </strong>
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                              ({sizeMb} MB)
                            </span>
                          </div>
                          <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                            Submitted on {new Date(latestMission.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </div>
                          {latestMission.feedback && (
                            <div style={{ fontSize: "0.78rem", color: latestMission.status === "APPROVED" ? "#166534" : "#991b1b", marginTop: "4px" }}>
                              Feedback: <em>{latestMission.feedback}</em>
                            </div>
                          )}
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                          <a
                            href={fileLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.tableActionBtn}
                          >
                            View / Download Document ↗
                          </a>

                          {latestMission.status === "SUBMITTED" && (
                            <>
                              <button
                                type="button"
                                disabled={actingMission}
                                onClick={async () => {
                                  setActingMission(true);
                                  try {
                                    await approveMissionStatement(latestMission.id);
                                    toast.success("Mission statement approved! Certificate has been automatically issued.");
                                    await fetchProgression(selectedEnrolmentId);
                                    const updatedUser = await apiGet<UserDetail>(`/users/${userId}`, { skipCache: true });
                                    if (updatedUser) setUser(updatedUser);
                                  } catch (err: any) {
                                    toast.error(err.message || "Failed to approve mission statement");
                                  } finally {
                                    setActingMission(false);
                                  }
                                }}
                                className={styles.actionBtnPrimary}
                                style={{ padding: "0.45rem 0.9rem", fontSize: "0.8rem", background: "#15803d", borderColor: "#15803d" }}
                              >
                                {actingMission ? "Approving & Issuing..." : "Approve & Auto-Issue Certificate ✓"}
                              </button>
                              <button
                                type="button"
                                disabled={actingMission}
                                onClick={() => {
                                  setRejectingMissionModal(latestMission);
                                  setRejectFeedback("");
                                }}
                                className={styles.tableActionBtn}
                                style={{ color: "#991b1b", borderColor: "#fecaca" }}
                              >
                                Request Revision
                              </button>
                            </>
                          )}

                          {latestMission.status === "APPROVED" && (
                            <span style={{ fontSize: "0.75rem", fontWeight: 700, padding: "3px 10px", borderRadius: "100px", background: "#dcfce7", color: "#15803d" }}>
                              Approved &bull; Certificate Issued
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
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
                </div>
                <div className={styles.stageHeaderActions}>
                  <Link
                    href={`/approvals?tab=certificates${activeBatchId ? `&batchId=${activeBatchId}` : ""}`}
                    className={styles.tableActionBtn}
                  >
                    Open Certificate Approvals ↗
                  </Link>
                </div>
              </div>

              <div className={styles.stageDetailsBox}>
                <div className={styles.inspectorGrid}>
                  <div className={styles.inspectorMetaItem}>
                    <span className={styles.inspectorMetaLabel}>Eligibility Decision</span>
                    <span
                      className={styles.inspectorMetaValue}
                      style={{ color: certEligibility?.isEligible ? "#15803d" : "#b45309" }}
                    >
                      {certEligibility?.isEligible ? "Eligible for Issuance" : "Ineligible (Prerequisites Remaining)"}
                    </span>
                  </div>

                  <div className={styles.inspectorMetaItem}>
                    <span className={styles.inspectorMetaLabel}>5-Stage Milestones</span>
                    <span className={styles.inspectorMetaValue}>
                      {(() => {
                        const gates = [
                          Boolean(stagesEval?.stages?.STAGE_1_CURRICULUM?.isCompleted || (completedSteps === totalSteps && totalSteps > 0)),
                          Boolean(stagesEval?.stages?.STAGE_2_EXAM?.isCompleted),
                          Boolean(stagesEval?.stages?.STAGE_3_ATTENDANCE?.isCompleted || compliance?.status === "COMPLIANT"),
                          Boolean(stagesEval?.stages?.STAGE_4_ONE_ON_ONE?.isCompleted),
                          Boolean(stagesEval?.stages?.STAGE_5_MISSION_STATEMENT?.isCompleted),
                        ];
                        const cleared = gates.filter(Boolean).length;
                        return `${cleared} of 5 Gates Satisfied`;
                      })()}
                    </span>
                  </div>

                  <div className={styles.inspectorMetaItem}>
                    <span className={styles.inspectorMetaLabel}>Certificate Track</span>
                    <span className={styles.inspectorMetaValue}>
                      {certEligibility?.certificateType || stagesEval?.certificateType || "PROFESSIONAL"}
                    </span>
                  </div>

                  <div className={styles.inspectorMetaItem}>
                    <span className={styles.inspectorMetaLabel}>Issuance Status</span>
                    <span
                      className={styles.inspectorMetaValue}
                      style={{ color: (certEligibility?.status === "ISSUED" || progression?.certificate?.status === "ISSUED" || certEligibility?.isEligible) ? "#15803d" : "var(--text-secondary)" }}
                    >
                      {certEligibility?.status === "ISSUED" || progression?.certificate?.status === "ISSUED"
                        ? "Issued"
                        : certEligibility?.isEligible
                        ? "Ready in Approvals Queue"
                        : "Awaiting Milestones"}
                    </span>
                  </div>
                </div>

                {/* Instant Certificate Download Action Card when Issued */}
                {(() => {
                  const cert = progression?.certificate || (selectedEnrolment as any)?.certificate || (certEligibility as any)?.certificate;
                  const isIssued = Boolean(certEligibility?.status === "ISSUED" || cert?.status === "ISSUED" || (progression as any)?.certificateIssued);
                  if (!isIssued && !cert) return null;
                  return (
                    <div style={{ margin: "1rem 0", padding: "1rem 1.25rem", borderRadius: "8px", background: "#f0fdf4", border: "1px solid #bbf7d0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#dcfce7", color: "#15803d", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#166534" }}>
                            Official Certificate Issued
                          </div>
                          <div style={{ fontSize: "0.78rem", color: "#15803d", marginTop: "2px" }}>
                            Certificate Code: <strong>{cert?.certificateCode || "Verified"}</strong> {cert?.issuedAt && `• Issued ${formatNumericDate(cert.issuedAt)}`}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDownloadCertificatePdf(cert?.id, cert?.pdfUrl)}
                        className={styles.actionBtnPrimary}
                        style={{ background: "#15803d", borderColor: "#15803d", fontSize: "0.8rem", padding: "0.5rem 1rem", display: "inline-flex", alignItems: "center", gap: "6px" }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Download Certificate PDF ↗
                      </button>
                    </div>
                  );
                })()}

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
                      { num: 4, name: "1:1 Session Consultation", done: Boolean(stagesEval?.stages?.STAGE_4_ONE_ON_ONE?.isCompleted) },
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
              description={
                activeModal === "unlock"
                  ? `Manually unlock "${targetStep.title}". This action is logged.`
                  : activeModal === "relock"
                  ? `Manually lock "${targetStep.title}". This action is logged.`
                  : `Restore automated progression for "${targetStep.title}".`
              }
              label="Reason for Override"
              placeholder="Enter reason for override..."
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
              title={`Override Stage: ${{
                STAGE_1_CURRICULUM: "Curriculum",
                STAGE_2_EXAM: "Final Exam",
                STAGE_3_ATTENDANCE: "Attendance",
                STAGE_4_ONE_ON_ONE: "1:1 Call",
                STAGE_5_MISSION_STATEMENT: "Mission Statement",
              }[targetStageForOverride] || targetStageForOverride}`}
              description="This manual override will be permanently recorded in the audit logs."
              label="Reason for Override"
              placeholder="Enter reason for override..."
              required={true}
              tone="warning"
              confirmText="Confirm Override"
              isLoading={submittingStageOverride}
            />
          )}

          {/* Modal for Rejecting / Requesting Revision on Mission Statement */}
          {rejectingMissionModal && (
            <InputDialog
              isOpen={Boolean(rejectingMissionModal)}
              onClose={() => setRejectingMissionModal(null)}
              onSubmit={async (feedback) => {
                if (!feedback.trim()) {
                  toast.error("Feedback is required when requesting revisions.");
                  return;
                }
                setSubmittingRejectFeedback(true);
                try {
                  await rejectMissionStatement(rejectingMissionModal.id, feedback.trim());
                  toast.info("Revision requested for mission statement.");
                  setRejectingMissionModal(null);
                  await fetchProgression(selectedEnrolmentId);
                } catch (err: any) {
                  toast.error(err.message || "Failed to reject mission statement");
                } finally {
                  setSubmittingRejectFeedback(false);
                }
              }}
              title="Request Mission Statement Revision"
              description={`Provide specific feedback for ${user.name} on what changes are needed before approval.`}
              label="Revision Feedback"
              placeholder="e.g., Please expand on your 10-year core vision and restate your values in section 2..."
              required={true}
              tone="warning"
              confirmText="Send Revision Request"
              isLoading={submittingRejectFeedback}
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
