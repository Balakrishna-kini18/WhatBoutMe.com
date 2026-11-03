"use client";

import { useEffect, useState, useMemo, FormEvent, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import styles from "../page.module.css";
import {
  API_URL,
  errorMessage,
  fetchMissionStatements,
  approveMissionStatement,
  rejectMissionStatement,
  fetchOneOnOneRequests,
  type MissionStatementItem,
} from "../lib/api";
import {
  CustomSelect,
  StatusBadge,
  Modal,
  TableSkeleton,
  EmptyState,
  Pagination,
  SortIndicator,
  DatePicker,
  TimePicker,
  useToast,
  type SortOrder,
} from "../components";
import { getSystemTimezone, localWallTimeToUtc } from "../lib/timezone";
import CoachingApprovalsTab from "./components/CoachingApprovalsTab";

interface Batch {
  id: string;
  name: string;
  programId: string;
  program?: {
    id: string;
    title: string;
  };
}

interface RubricScoreItem {
  rubricCategory: string;
  score: number;
  maxScore: number;
  feedback?: string;
}

interface OralAssessment {
  id: string;
  enrolmentId: string;
  programId: string;
  sessionId: string | null;
  scheduledDate: string | null;
  status: "SCHEDULED" | "PASSED" | "FAILED" | "CANCELLED";
  overallScore: number | null;
  trainerNotes: string | null;
  retryGuidance: string | null;
  gradedAt: string | null;
  scores: RubricScoreItem[];
  assessor?: {
    id: string;
    name: string;
    email: string;
  } | null;
  enrolment?: {
    id: string;
    userId: string;
    batchId?: string | null;
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
    user?: {
      id: string;
      name: string;
      email: string;
    };
  };
  _batchName?: string;
  _programTitle?: string;
  _batchId?: string;
}

interface EnrolmentOption {
  id: string;
  userId: string;
  programId: string;
  status: string;
  user?: {
    id: string;
    name: string;
    email: string;
  };
}

interface CertificateItem {
  id: string;
  certificateCode: string;
  certificateNumber?: string;
  status: "PENDING" | "APPROVED" | "ISSUED" | "REJECTED";
  certificateType: string;
  cpdHours?: number | null;
  createdAt: string;
  issueDate?: string | null;
  pdfUrl?: string | null;
  rejectionReason?: string | null;
  enrolment?: {
    id: string;
    userId: string;
    batchId?: string | null;
    user?: {
      id: string;
      name: string;
      email: string;
    };
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
  };
}

const DEFAULT_RUBRIC: RubricScoreItem[] = [
  { rubricCategory: "Resilience & Self-Leadership", score: 8, maxScore: 10, feedback: "" },
  { rubricCategory: "Application of Curriculum Principles", score: 8, maxScore: 10, feedback: "" },
  { rubricCategory: "Clarity & Reflection", score: 8, maxScore: 10, feedback: "" },
  { rubricCategory: "Goal & Future Readiness", score: 8, maxScore: 10, feedback: "" },
];

type CertSortField = "learner" | "program" | "code" | "createdAt" | "status";
type OralSortField = "learner" | "program" | "scheduledDate" | "score" | "status";
type MissionSortField = "learner" | "program" | "createdAt" | "status";

export default function ApprovalsPage() {
  return (
    <Suspense fallback={null}>
      <ApprovalsContent />
    </Suspense>
  );
}

function ApprovalsContent() {
  const searchParams = useSearchParams();
  const { success: toastSuccess, error: toastError } = useToast();
  const tabParam = searchParams?.get("tab");
  const batchParam = searchParams?.get("batchId");

  // Default to "coaching" (1:1 Call - first gate in progression order) unless specified in URL
  const [activeTab, setActiveTab] = useState<"coaching" | "missions" | "oral" | "certificates">(
    tabParam === "coaching" || tabParam === "missions" || tabParam === "oral" || tabParam === "certificates"
      ? tabParam
      : "coaching"
  );
  const [selectedBatchId, setSelectedBatchId] = useState<string>(batchParam || "");
  const [totalCoachingCount, setTotalCoachingCount] = useState(0);

  useEffect(() => {
    if (tabParam === "coaching" || tabParam === "missions" || tabParam === "oral" || tabParam === "certificates") {
      setActiveTab(tabParam);
    }
    if (batchParam) {
      setSelectedBatchId(batchParam);
    }
  }, [tabParam, batchParam]);

  useEffect(() => {
    fetchOneOnOneRequests()
      .then((reqs) => {
        if (Array.isArray(reqs)) {
          setTotalCoachingCount(reqs.length);
        }
      })
      .catch(() => {});
  }, []);

  // Common notification state
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageSuccess, setPageSuccess] = useState<string | null>(null);

  // ─────────────────────────────────────────────────────────────────────────────
  // Certificates State
  // ─────────────────────────────────────────────────────────────────────────────
  const [certificates, setCertificates] = useState<CertificateItem[]>([]);
  const [loadingCertificates, setLoadingCertificates] = useState(true);
  const [certFilter, setCertFilter] = useState<string>("ALL");
  const [certSearch, setCertSearch] = useState<string>("");
  const [certProgramFilter, setCertProgramFilter] = useState<string>("ALL");
  const [certSortField, setCertSortField] = useState<CertSortField>("createdAt");
  const [certSortOrder, setCertSortOrder] = useState<SortOrder>("desc");
  const [certPage, setCertPage] = useState(1);
  const [certPageSize, setCertPageSize] = useState(10);
  const [inFlightCertAction, setInFlightCertAction] = useState<{ id: string; action: string } | null>(null);

  // Reject Certificate Modal
  const [rejectingCert, setRejectingCert] = useState<CertificateItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [submittingRejection, setSubmittingRejection] = useState(false);

  // ─────────────────────────────────────────────────────────────────────────────
  // Oral Assessments State
  // ─────────────────────────────────────────────────────────────────────────────
  const [batches, setBatches] = useState<Batch[]>([]);
  const [assessments, setAssessments] = useState<OralAssessment[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [loadingAssessments, setLoadingAssessments] = useState(false);
  const [oralFilter, setOralFilter] = useState<string>("ALL");
  const [oralSearch, setOralSearch] = useState<string>("");
  const [oralProgramFilter, setOralProgramFilter] = useState<string>("ALL");
  const [oralSortField, setOralSortField] = useState<OralSortField>("scheduledDate");
  const [oralSortOrder, setOralSortOrder] = useState<SortOrder>("desc");
  const [oralPage, setOralPage] = useState(1);
  const [oralPageSize, setOralPageSize] = useState(10);

  // Grade Modal State
  const [gradingAssessment, setGradingAssessment] = useState<OralAssessment | null>(null);
  const [rubricScores, setRubricScores] = useState<RubricScoreItem[]>(DEFAULT_RUBRIC);
  const [passed, setPassed] = useState(true);
  const [trainerNotes, setTrainerNotes] = useState("");
  const [retryGuidance, setRetryGuidance] = useState("");
  const [submittingGrade, setSubmittingGrade] = useState(false);
  const [gradeModalError, setGradeModalError] = useState<string | null>(null);

  // Schedule Modal State
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleBatchId, setScheduleBatchId] = useState<string>("");
  const [batchEnrolments, setBatchEnrolments] = useState<EnrolmentOption[]>([]);
  const [loadingScheduleEnrolments, setLoadingScheduleEnrolments] = useState(false);
  const [selectedEnrolmentId, setSelectedEnrolmentId] = useState("");
  const [scheduledDateStr, setScheduledDateStr] = useState("");
  const [scheduledTimeStr, setScheduledTimeStr] = useState("10:00");
  const [submittingSchedule, setSubmittingSchedule] = useState(false);
  const [scheduleModalError, setScheduleModalError] = useState<string | null>(null);
  const [displayTimezone, setDisplayTimezone] = useState<string>("UTC");

  useEffect(() => {
    setDisplayTimezone(getSystemTimezone());
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Mission Statements State
  // ─────────────────────────────────────────────────────────────────────────────
  const [missionStatements, setMissionStatements] = useState<MissionStatementItem[]>([]);
  const [loadingMissions, setLoadingMissions] = useState(false);
  const [missionFilter, setMissionFilter] = useState<string>("ALL");
  const [missionSearch, setMissionSearch] = useState<string>("");
  const [missionProgramFilter, setMissionProgramFilter] = useState<string>("ALL");
  const [missionSortField, setMissionSortField] = useState<MissionSortField>("createdAt");
  const [missionSortOrder, setMissionSortOrder] = useState<SortOrder>("desc");
  const [missionPage, setMissionPage] = useState(1);
  const [missionPageSize, setMissionPageSize] = useState(10);

  const [previewMissionDoc, setPreviewMissionDoc] = useState<MissionStatementItem | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState(false);
  const [previewFullscreen, setPreviewFullscreen] = useState(false);

  const [approvingMission, setApprovingMission] = useState<MissionStatementItem | null>(null);
  const [approvalFeedback, setApprovalFeedback] = useState("");
  const [submittingApproval, setSubmittingApproval] = useState(false);

  const [rejectingMission, setRejectingMission] = useState<MissionStatementItem | null>(null);
  const [rejectionFeedback, setRejectionFeedback] = useState("");
  const [submittingMissionReject, setSubmittingMissionReject] = useState(false);

  useEffect(() => {
    fetchCertificates();
    loadBatches();
    loadMissionStatements();
  }, []);

  useEffect(() => {
    if (batches.length === 0) return;
    fetchAssessments(selectedBatchId, batches);
  }, [selectedBatchId, batches]);

  useEffect(() => {
    setCertPage(1);
  }, [certFilter, certSearch, certProgramFilter, selectedBatchId]);

  useEffect(() => {
    setOralPage(1);
  }, [oralFilter, oralSearch, oralProgramFilter, selectedBatchId]);

  useEffect(() => {
    setMissionPage(1);
  }, [missionFilter, missionSearch, missionProgramFilter, selectedBatchId]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Certificate Queue API Calls
  // ─────────────────────────────────────────────────────────────────────────────
  async function fetchCertificates() {
    setLoadingCertificates(true);
    setPageError(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_URL}/certificates`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        throw new Error(await errorMessage(res, "Could not load certificate queue"));
      }
      const data: CertificateItem[] = await res.json();
      setCertificates(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setPageError(err.message || "Failed to load certificate requests");
    } finally {
      setLoadingCertificates(false);
    }
  }

  async function handleCertificateAction(id: string, action: "approve" | "issue") {
    try {
      setInFlightCertAction({ id, action });
      setPageError(null);
      setPageSuccess(null);
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_URL}/certificates/${id}/${action}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, `Could not ${action} certificate`));
      }

      const msg = `Certificate successfully ${action === "approve" ? "approved" : "issued"}.`;
      setPageSuccess(msg);
      toastSuccess(msg);
      await fetchCertificates();
    } catch (err: any) {
      const msg = err.message || `Failed to ${action} certificate`;
      setPageError(msg);
      toastError(msg);
    } finally {
      setInFlightCertAction(null);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Mission Statements Queue & Reviews API Calls
  // ─────────────────────────────────────────────────────────────────────────────
  async function loadMissionStatements() {
    setLoadingMissions(true);
    try {
      const data = await fetchMissionStatements();
      setMissionStatements(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error("Failed to load mission statements:", err);
    } finally {
      setLoadingMissions(false);
    }
  }

  async function handleApproveMission(e?: FormEvent) {
    if (e) e.preventDefault();
    if (!approvingMission) return;
    setSubmittingApproval(true);
    setPageError(null);
    try {
      await approveMissionStatement(approvingMission.id, approvalFeedback.trim() || undefined);
      const msg = `Mission statement for ${approvingMission.user?.name || "learner"} approved and certificate issued.`;
      setPageSuccess(msg);
      toastSuccess(msg);
      setApprovingMission(null);
      setApprovalFeedback("");
      await loadMissionStatements();
      await fetchCertificates();
    } catch (err: any) {
      const msg = err.message || "Failed to approve mission statement";
      setPageError(msg);
      toastError(msg);
    } finally {
      setSubmittingApproval(false);
    }
  }

  async function handleRejectMission(e?: FormEvent) {
    if (e) e.preventDefault();
    if (!rejectingMission) return;
    if (!rejectionFeedback.trim()) {
      setPageError("Feedback is required when requesting revisions on a mission statement.");
      return;
    }
    setSubmittingMissionReject(true);
    setPageError(null);
    try {
      await rejectMissionStatement(rejectingMission.id, rejectionFeedback.trim());
      const msg = `Mission statement revision requested for ${rejectingMission.user?.name || "learner"}.`;
      setPageSuccess(msg);
      toastSuccess(msg);
      setRejectingMission(null);
      setRejectionFeedback("");
      await loadMissionStatements();
    } catch (err: any) {
      const msg = err.message || "Failed to reject mission statement";
      setPageError(msg);
      toastError(msg);
    } finally {
      setSubmittingMissionReject(false);
    }
  }

  function handleOpenRejectModal(cert: CertificateItem) {
    setRejectingCert(cert);
    setRejectionReason("");
    setPageError(null);
  }

  async function handleSubmitRejection(e: FormEvent) {
    e.preventDefault();
    if (!rejectingCert) return;

    if (!rejectionReason.trim()) {
      setPageError("A mandatory non-empty rejection reason is required for audit logs.");
      return;
    }

    setSubmittingRejection(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_URL}/certificates/${rejectingCert.id}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ reason: rejectionReason.trim() }),
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Could not reject certificate"));
      }

      setRejectingCert(null);
      const msg = "Certificate request has been marked as REJECTED.";
      setPageSuccess(msg);
      toastSuccess(msg);
      await fetchCertificates();
    } catch (err: any) {
      const msg = err.message || "Failed to reject certificate";
      setPageError(msg);
      toastError(msg);
    } finally {
      setSubmittingRejection(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Oral Assessments API Calls
  // ─────────────────────────────────────────────────────────────────────────────
  async function loadBatches() {
    setLoadingBatches(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_URL}/batches`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const raw = await res.json();
        const data: Batch[] = Array.isArray(raw) ? raw : raw?.batches || [];
        setBatches(data);
        const bParam = searchParams?.get("batchId");
        if (bParam && data.some((b) => b.id === bParam)) {
          setSelectedBatchId(bParam);
        }
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingBatches(false);
    }
  }

  async function fetchAssessments(targetBatchId: string, batchList: Batch[] = batches) {
    if (batchList.length === 0) {
      setAssessments([]);
      return;
    }
    setLoadingAssessments(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      if (targetBatchId && targetBatchId !== "UNASSIGNED") {
        const batchObj = batchList.find((b) => b.id === targetBatchId);
        const res = await fetch(`${API_URL}/oral-assessments/batches/${targetBatchId}`, { headers });
        if (res.ok) {
          const data: OralAssessment[] = await res.json();
          setAssessments(
            (Array.isArray(data) ? data : []).map((a) => ({
              ...a,
              _batchId: targetBatchId,
              _batchName: batchObj?.name || a.enrolment?.batch?.name || "Assigned Batch",
              _programTitle: batchObj?.program?.title || a.enrolment?.program?.title || "11 Steps Programme",
            }))
          );
        } else {
          setAssessments([]);
        }
      } else if (targetBatchId === "UNASSIGNED") {
        setAssessments([]);
      } else {
        const results = await Promise.all(
          batchList.map(async (b) => {
            try {
              const res = await fetch(`${API_URL}/oral-assessments/batches/${b.id}`, { headers });
              if (!res.ok) return [];
              const items: OralAssessment[] = await res.json();
              return (Array.isArray(items) ? items : []).map((a) => ({
                ...a,
                _batchId: b.id,
                _batchName: b.name,
                _programTitle: b.program?.title || a.enrolment?.program?.title || "11 Steps Programme",
              }));
            } catch {
              return [];
            }
          })
        );
        const merged = results.flat();
        const deduped = Array.from(new Map(merged.map((item) => [item.id, item])).values());
        setAssessments(deduped);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingAssessments(false);
    }
  }

  function handleOpenGrading(assessment: OralAssessment) {
    setGradingAssessment(assessment);
    setGradeModalError(null);

    if (assessment.scores && assessment.scores.length > 0) {
      setRubricScores(
        assessment.scores.map((s) => ({
          rubricCategory: s.rubricCategory,
          score: s.score,
          maxScore: s.maxScore || 10,
          feedback: s.feedback || "",
        }))
      );
    } else {
      setRubricScores(DEFAULT_RUBRIC.map((r) => ({ ...r })));
    }

    setPassed(assessment.status === "PASSED" || assessment.status === "SCHEDULED");
    setTrainerNotes(assessment.trainerNotes || "");
    setRetryGuidance(assessment.retryGuidance || "");
  }

  function handleScoreChange(index: number, val: number) {
    setRubricScores((prev) => {
      const target = prev[index];
      if (!target) return prev;
      const next = [...prev];
      next[index] = {
        rubricCategory: target.rubricCategory,
        maxScore: target.maxScore,
        score: Math.max(0, Math.min(target.maxScore, val)),
        feedback: target.feedback,
      };
      return next;
    });
  }

  function handleFeedbackChange(index: number, val: string) {
    setRubricScores((prev) => {
      const target = prev[index];
      if (!target) return prev;
      const next = [...prev];
      next[index] = {
        rubricCategory: target.rubricCategory,
        maxScore: target.maxScore,
        score: target.score,
        feedback: val,
      };
      return next;
    });
  }

  function handleAddRubricItem() {
    setRubricScores((prev) => [
      ...prev,
      { rubricCategory: `Evaluation Criterion ${prev.length + 1}`, score: 8, maxScore: 10, feedback: "" },
    ]);
  }

  function handleRemoveRubricItem(index: number) {
    if (rubricScores.length <= 1) return;
    setRubricScores((prev) => prev.filter((_, i) => i !== index));
  }

  const totalEarned = rubricScores.reduce((acc, r) => acc + (r.score || 0), 0);
  const totalPossible = rubricScores.reduce((acc, r) => acc + (r.maxScore || 10), 0);
  const calculatedPercent = totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 100) : 0;

  async function handleSubmitGrade(e: FormEvent) {
    e.preventDefault();
    if (!gradingAssessment) return;

    if (!trainerNotes.trim()) {
      setGradeModalError("Trainer qualitative notes are required.");
      return;
    }

    if (!passed && (!retryGuidance.trim() || retryGuidance.trim().length < 5)) {
      setGradeModalError("Detailed retry guidance is required when marking assessment as not passed.");
      return;
    }

    const targetId = gradingAssessment.id;
    const previousAssessments = assessments;
    const optimisticStatus: "PASSED" | "FAILED" = passed ? "PASSED" : "FAILED";

    setSubmittingGrade(true);
    setAssessments((prev) =>
      prev.map((a) =>
        a.id === targetId
          ? {
              ...a,
              status: optimisticStatus,
              overallScore: calculatedPercent,
              trainerNotes: trainerNotes.trim(),
              retryGuidance: !passed ? retryGuidance.trim() : null,
              gradedAt: new Date().toISOString(),
              scores: rubricScores,
            }
          : a
      )
    );

    setGradingAssessment(null);
    const msg = `Oral assessment graded (${passed ? "PASSED" : "RETRY REQUIRED"}, ${calculatedPercent}%).`;
    setPageSuccess(msg);
    toastSuccess(msg);
    setGradeModalError(null);

    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const payload = {
        scores: rubricScores.map((r) => ({
          rubricCategory: r.rubricCategory.trim(),
          score: Number(r.score),
          maxScore: Number(r.maxScore),
          feedback: r.feedback?.trim() || undefined,
        })),
        passed,
        trainerNotes: trainerNotes.trim(),
        retryGuidance: !passed ? retryGuidance.trim() : undefined,
      };

      const res = await fetch(`${API_URL}/oral-assessments/${targetId}/grade`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        setAssessments(previousAssessments);
        throw new Error(await errorMessage(res, "Failed to submit oral assessment evaluation"));
      }

      fetchAssessments(selectedBatchId, batches);
    } catch (err: any) {
      const errMsg = err.message || "Failed to submit grade evaluation";
      setPageError(errMsg);
      toastError(errMsg);
    } finally {
      setSubmittingGrade(false);
    }
  }

  async function loadEnrolmentsForScheduleBatch(bId: string) {
    if (!bId) {
      setBatchEnrolments([]);
      setSelectedEnrolmentId("");
      return;
    }
    setLoadingScheduleEnrolments(true);
    setScheduleModalError(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_URL}/admin/enrolments?batchId=${bId}&limit=100`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const json = await res.json();
        const enrs = json.data || json || [];
        setBatchEnrolments(Array.isArray(enrs) ? enrs : []);
        setSelectedEnrolmentId(enrs.length > 0 && enrs[0] ? enrs[0].id : "");
      }
    } catch {
      setScheduleModalError("Failed to fetch learners in batch.");
    } finally {
      setLoadingScheduleEnrolments(false);
    }
  }

  async function handleOpenScheduleModal() {
    setIsScheduleModalOpen(true);
    setScheduleModalError(null);
    const defaultBatch =
      selectedBatchId && selectedBatchId !== "UNASSIGNED"
        ? selectedBatchId
        : batches[0]?.id || "";
    setScheduleBatchId(defaultBatch);
    setScheduledDateStr("");
    setScheduledTimeStr("10:00");
    if (defaultBatch) {
      await loadEnrolmentsForScheduleBatch(defaultBatch);
    } else {
      setBatchEnrolments([]);
      setSelectedEnrolmentId("");
    }
  }

  async function handleSubmitSchedule(e: FormEvent) {
    e.preventDefault();
    if (!selectedEnrolmentId || !scheduleBatchId) return;

    const currentBatch = batches.find((b) => b.id === scheduleBatchId);
    if (!currentBatch) return;

    setSubmittingSchedule(true);
    setScheduleModalError(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      let isoDate: string | undefined = undefined;
      if (scheduledDateStr) {
        const utcDate = localWallTimeToUtc(
          scheduledDateStr,
          scheduledTimeStr || "10:00",
          displayTimezone
        );
        if (isNaN(utcDate.getTime())) {
          setScheduleModalError("Invalid scheduled date or time selected.");
          setSubmittingSchedule(false);
          return;
        }
        if (utcDate.getTime() < Date.now() - 5 * 60 * 1000) {
          setScheduleModalError("Cannot schedule an assessment in the past. Please choose an upcoming date and time.");
          setSubmittingSchedule(false);
          return;
        }
        isoDate = utcDate.toISOString();
      }

      const payload = {
        enrolmentId: selectedEnrolmentId,
        programId: currentBatch.programId || currentBatch.program?.id,
        scheduledDate: isoDate,
      };

      const res = await fetch(`${API_URL}/oral-assessments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to schedule oral assessment"));
      }

      setIsScheduleModalOpen(false);
      const msg = "Oral assessment scheduled.";
      setPageSuccess(msg);
      toastSuccess(msg);
      await fetchAssessments(selectedBatchId, batches);
    } catch (err: any) {
      setScheduleModalError(err.message);
      toastError(err.message || "Failed to schedule oral assessment");
    } finally {
      setSubmittingSchedule(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Shared Filter Options (Programs & Batches)
  // ─────────────────────────────────────────────────────────────────────────────
  const allProgramOptions = useMemo(() => {
    const titles = new Set<string>();
    for (const b of batches) {
      if (b.program?.title) titles.add(b.program.title);
    }
    for (const c of certificates) {
      const t = c.enrolment?.batch?.program?.title || c.enrolment?.program?.title;
      if (t) titles.add(t);
    }
    for (const m of missionStatements) {
      const t = m.enrolment?.program?.title;
      if (t) titles.add(t);
    }
    for (const a of assessments) {
      const t = a._programTitle || a.enrolment?.program?.title;
      if (t) titles.add(t);
    }
    return [
      { value: "ALL", label: "All Programs" },
      ...Array.from(titles)
        .sort((a, b) => a.localeCompare(b))
        .map((t) => ({ value: t, label: t })),
    ];
  }, [batches, certificates, missionStatements, assessments]);

  const batchFilterOptions = useMemo(() => {
    return [
      { value: "", label: "All Batches" },
      { value: "UNASSIGNED", label: "Direct / No Batch" },
      ...batches.map((b) => ({
        value: b.id,
        label: b.name,
      })),
    ];
  }, [batches]);

  const oralBatchFilterOptions = useMemo(() => {
    return [
      { value: "", label: "All Batches" },
      ...batches.map((b) => ({
        value: b.id,
        label: b.name,
      })),
    ];
  }, [batches]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Certificates Filtering, Sorting & Pagination
  // ─────────────────────────────────────────────────────────────────────────────
  const contextFilteredCertificates = useMemo(() => {
    return certificates.filter((c) => {
      const certBatchId = c.enrolment?.batch?.id || c.enrolment?.batchId || "";
      const certBatchName = c.enrolment?.batch?.name || "";
      const certProgTitle =
        c.enrolment?.batch?.program?.title || c.enrolment?.program?.title || "11 Steps Programme";

      if (selectedBatchId === "UNASSIGNED") {
        if (certBatchId) return false;
      } else if (selectedBatchId) {
        if (certBatchId !== selectedBatchId) return false;
      }

      if (certProgramFilter !== "ALL") {
        if (certProgTitle.toLowerCase() !== certProgramFilter.toLowerCase()) return false;
      }

      if (certSearch.trim()) {
        const q = certSearch.toLowerCase().trim();
        const matchesName = c.enrolment?.user?.name?.toLowerCase().includes(q);
        const matchesEmail = c.enrolment?.user?.email?.toLowerCase().includes(q);
        const matchesCode =
          c.certificateCode?.toLowerCase().includes(q) ||
          c.certificateNumber?.toLowerCase().includes(q);
        const matchesProg = certProgTitle.toLowerCase().includes(q);
        const matchesBatch = certBatchName.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesCode && !matchesProg && !matchesBatch) {
          return false;
        }
      }

      return true;
    });
  }, [certificates, selectedBatchId, certProgramFilter, certSearch]);

  const certStatusCounts = useMemo(() => {
    const counts = {
      ALL: contextFilteredCertificates.length,
      PENDING: 0,
      APPROVED: 0,
      ISSUED: 0,
      REJECTED: 0,
    };
    for (const c of contextFilteredCertificates) {
      if (c.status === "PENDING") counts.PENDING++;
      else if (c.status === "APPROVED") counts.APPROVED++;
      else if (c.status === "ISSUED") counts.ISSUED++;
      else if (c.status === "REJECTED") counts.REJECTED++;
    }
    return counts;
  }, [contextFilteredCertificates]);

  const certStatusOptions = useMemo(() => {
    return [
      { value: "ALL", label: `All Statuses (${certStatusCounts.ALL})` },
      { value: "PENDING", label: `Pending (${certStatusCounts.PENDING})` },
      { value: "APPROVED", label: `Approved (${certStatusCounts.APPROVED})` },
      { value: "ISSUED", label: `Issued (${certStatusCounts.ISSUED})` },
      { value: "REJECTED", label: `Rejected (${certStatusCounts.REJECTED})` },
    ];
  }, [certStatusCounts]);

  const filteredCertificates = useMemo(() => {
    if (certFilter === "ALL") return contextFilteredCertificates;
    return contextFilteredCertificates.filter((c) => c.status === certFilter);
  }, [contextFilteredCertificates, certFilter]);

  const sortedCertificates = useMemo(() => {
    return [...filteredCertificates].sort((a, b) => {
      let cmp = 0;
      if (certSortField === "learner") {
        cmp = (a.enrolment?.user?.name || "").localeCompare(b.enrolment?.user?.name || "");
      } else if (certSortField === "program") {
        const pA = a.enrolment?.batch?.program?.title || a.enrolment?.program?.title || "";
        const pB = b.enrolment?.batch?.program?.title || b.enrolment?.program?.title || "";
        cmp = pA.localeCompare(pB);
      } else if (certSortField === "code") {
        cmp = (a.certificateCode || "").localeCompare(b.certificateCode || "");
      } else if (certSortField === "createdAt") {
        cmp = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      } else if (certSortField === "status") {
        cmp = (a.status || "").localeCompare(b.status || "");
      }
      return certSortOrder === "asc" ? cmp : -cmp;
    });
  }, [filteredCertificates, certSortField, certSortOrder]);

  const paginatedCertificates = useMemo(() => {
    const start = (certPage - 1) * certPageSize;
    return sortedCertificates.slice(start, start + certPageSize);
  }, [sortedCertificates, certPage, certPageSize]);

  const hasCertFilters = Boolean(
    certFilter !== "ALL" || certSearch.trim() || certProgramFilter !== "ALL" || selectedBatchId !== ""
  );

  const resetCertFilters = () => {
    setCertFilter("ALL");
    setCertSearch("");
    setCertProgramFilter("ALL");
    setSelectedBatchId("");
    setCertPage(1);
  };

  const handleCertSort = (field: CertSortField) => {
    if (certSortField === field) {
      setCertSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setCertSortField(field);
      setCertSortOrder("asc");
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Oral Assessments Filtering, Sorting & Pagination
  // ─────────────────────────────────────────────────────────────────────────────
  const contextFilteredAssessments = useMemo(() => {
    return assessments.filter((a) => {
      const aBatchId = a._batchId || a.enrolment?.batch?.id || a.enrolment?.batchId || "";
      const aBatchName = a._batchName || a.enrolment?.batch?.name || "";
      const aProgTitle =
        a._programTitle || a.enrolment?.batch?.program?.title || a.enrolment?.program?.title || "11 Steps Programme";

      if (selectedBatchId && selectedBatchId !== "UNASSIGNED") {
        if (aBatchId !== selectedBatchId) return false;
      }

      if (oralProgramFilter !== "ALL") {
        if (aProgTitle.toLowerCase() !== oralProgramFilter.toLowerCase()) return false;
      }

      if (oralSearch.trim()) {
        const q = oralSearch.toLowerCase().trim();
        const matchesName = a.enrolment?.user?.name?.toLowerCase().includes(q);
        const matchesEmail = a.enrolment?.user?.email?.toLowerCase().includes(q);
        const matchesBatch = aBatchName.toLowerCase().includes(q);
        const matchesProg = aProgTitle.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesBatch && !matchesProg) {
          return false;
        }
      }

      return true;
    });
  }, [assessments, selectedBatchId, oralProgramFilter, oralSearch]);

  const oralStatusCounts = useMemo(() => {
    const counts = {
      ALL: contextFilteredAssessments.length,
      SCHEDULED: 0,
      PASSED: 0,
      FAILED: 0,
    };
    for (const a of contextFilteredAssessments) {
      if (a.status === "SCHEDULED") counts.SCHEDULED++;
      else if (a.status === "PASSED") counts.PASSED++;
      else if (a.status === "FAILED") counts.FAILED++;
    }
    return counts;
  }, [contextFilteredAssessments]);

  const oralStatusOptions = useMemo(() => {
    return [
      { value: "ALL", label: `All Statuses (${oralStatusCounts.ALL})` },
      { value: "SCHEDULED", label: `Scheduled (${oralStatusCounts.SCHEDULED})` },
      { value: "PASSED", label: `Passed (${oralStatusCounts.PASSED})` },
      { value: "FAILED", label: `Retry Required (${oralStatusCounts.FAILED})` },
    ];
  }, [oralStatusCounts]);

  const filteredAssessments = useMemo(() => {
    if (oralFilter === "ALL") return contextFilteredAssessments;
    return contextFilteredAssessments.filter((a) => a.status === oralFilter);
  }, [contextFilteredAssessments, oralFilter]);

  const sortedAssessments = useMemo(() => {
    return [...filteredAssessments].sort((a, b) => {
      let cmp = 0;
      if (oralSortField === "learner") {
        cmp = (a.enrolment?.user?.name || "").localeCompare(b.enrolment?.user?.name || "");
      } else if (oralSortField === "program") {
        cmp = (a._batchName || "").localeCompare(b._batchName || "");
      } else if (oralSortField === "scheduledDate") {
        const tA = a.scheduledDate ? new Date(a.scheduledDate).getTime() : 0;
        const tB = b.scheduledDate ? new Date(b.scheduledDate).getTime() : 0;
        cmp = tA - tB;
      } else if (oralSortField === "score") {
        cmp = (a.overallScore ?? -1) - (b.overallScore ?? -1);
      } else if (oralSortField === "status") {
        cmp = (a.status || "").localeCompare(b.status || "");
      }
      return oralSortOrder === "asc" ? cmp : -cmp;
    });
  }, [filteredAssessments, oralSortField, oralSortOrder]);

  const paginatedAssessments = useMemo(() => {
    const start = (oralPage - 1) * oralPageSize;
    return sortedAssessments.slice(start, start + oralPageSize);
  }, [sortedAssessments, oralPage, oralPageSize]);

  const hasOralFilters = Boolean(
    oralFilter !== "ALL" || oralSearch.trim() || oralProgramFilter !== "ALL" || selectedBatchId !== ""
  );

  const resetOralFilters = () => {
    setOralFilter("ALL");
    setOralSearch("");
    setOralProgramFilter("ALL");
    setSelectedBatchId("");
    setOralPage(1);
  };

  const handleOralSort = (field: OralSortField) => {
    if (oralSortField === field) {
      setOralSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setOralSortField(field);
      setOralSortOrder("asc");
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Mission Statements Filtering, Sorting & Pagination
  // ─────────────────────────────────────────────────────────────────────────────
  const contextFilteredMissions = useMemo(() => {
    return missionStatements.filter((m) => {
      const mBatchId = m.enrolment?.batch?.id || (m.enrolment as any)?.batchId || "";
      const mBatchName = m.enrolment?.batch?.name || "";
      const mProgTitle = m.enrolment?.program?.title || "11 Steps Programme";

      if (selectedBatchId === "UNASSIGNED") {
        if (mBatchId) return false;
      } else if (selectedBatchId) {
        if (mBatchId !== selectedBatchId) return false;
      }

      if (missionProgramFilter !== "ALL") {
        if (mProgTitle.toLowerCase() !== missionProgramFilter.toLowerCase()) return false;
      }

      if (missionSearch.trim()) {
        const q = missionSearch.toLowerCase().trim();
        const matchesName = m.user?.name?.toLowerCase().includes(q);
        const matchesEmail = m.user?.email?.toLowerCase().includes(q);
        const matchesProg = mProgTitle.toLowerCase().includes(q);
        const matchesBatch = mBatchName.toLowerCase().includes(q);
        const matchesFile = m.fileName?.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesProg && !matchesBatch && !matchesFile) {
          return false;
        }
      }

      return true;
    });
  }, [missionStatements, selectedBatchId, missionProgramFilter, missionSearch]);

  const missionStatusCounts = useMemo(() => {
    const counts = {
      ALL: contextFilteredMissions.length,
      SUBMITTED: 0,
      APPROVED: 0,
      REJECTED: 0,
    };
    for (const m of contextFilteredMissions) {
      if (m.status === "SUBMITTED") counts.SUBMITTED++;
      else if (m.status === "APPROVED") counts.APPROVED++;
      else if (m.status === "REJECTED") counts.REJECTED++;
    }
    return counts;
  }, [contextFilteredMissions]);

  const missionStatusOptions = useMemo(() => {
    return [
      { value: "ALL", label: `All Statuses (${missionStatusCounts.ALL})` },
      { value: "SUBMITTED", label: `Pending Review (${missionStatusCounts.SUBMITTED})` },
      { value: "APPROVED", label: `Approved (${missionStatusCounts.APPROVED})` },
      { value: "REJECTED", label: `Revision Requested (${missionStatusCounts.REJECTED})` },
    ];
  }, [missionStatusCounts]);

  const filteredMissions = useMemo(() => {
    if (missionFilter === "ALL") return contextFilteredMissions;
    return contextFilteredMissions.filter((m) => m.status === missionFilter);
  }, [contextFilteredMissions, missionFilter]);

  const sortedMissions = useMemo(() => {
    return [...filteredMissions].sort((a, b) => {
      let cmp = 0;
      if (missionSortField === "learner") {
        cmp = (a.user?.name || "").localeCompare(b.user?.name || "");
      } else if (missionSortField === "program") {
        cmp = (a.enrolment?.program?.title || "").localeCompare(b.enrolment?.program?.title || "");
      } else if (missionSortField === "createdAt") {
        cmp = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      } else if (missionSortField === "status") {
        cmp = (a.status || "").localeCompare(b.status || "");
      }
      return missionSortOrder === "asc" ? cmp : -cmp;
    });
  }, [filteredMissions, missionSortField, missionSortOrder]);

  const paginatedMissions = useMemo(() => {
    const start = (missionPage - 1) * missionPageSize;
    return sortedMissions.slice(start, start + missionPageSize);
  }, [sortedMissions, missionPage, missionPageSize]);

  const hasMissionFilters = Boolean(
    missionFilter !== "ALL" || missionSearch.trim() || missionProgramFilter !== "ALL" || selectedBatchId !== ""
  );

  const resetMissionFilters = () => {
    setMissionFilter("ALL");
    setMissionSearch("");
    setMissionProgramFilter("ALL");
    setSelectedBatchId("");
    setMissionPage(1);
  };

  const handleMissionSort = (field: MissionSortField) => {
    if (missionSortField === field) {
      setMissionSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setMissionSortField(field);
      setMissionSortOrder("asc");
    }
  };

  return (
    <div className={styles.dashboardContainer}>
      {/* ─────────────────────────────────────────────────────────────────────────────
          PAGE HEADER (Clean — No subtitle, no extra clutter buttons)
         ───────────────────────────────────────────────────────────────────────────── */}
      <header
        className={styles.header}
        style={{
          marginBottom: 0,
          alignItems: "center",
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div className={styles.headerText}>
          <h1 className={styles.title} style={{ margin: 0 }}>
            Approvals &amp; Certification Gates
          </h1>
        </div>

        {activeTab === "oral" && (
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={handleOpenScheduleModal}
              disabled={batches.length === 0}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span>Schedule Assessment</span>
            </button>
          </div>
        )}
      </header>

      {/* Global Page Alerts */}
      {pageError && (
        <div className={styles.alertError} style={{ marginBottom: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span style={{ flex: 1 }}>{pageError}</span>
          <button
            type="button"
            onClick={() => setPageError(null)}
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontWeight: 700 }}
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

      {pageSuccess && (
        <div className={styles.alertSuccess} style={{ marginBottom: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          <span style={{ flex: 1 }}>{pageSuccess}</span>
          <button
            type="button"
            onClick={() => setPageSuccess(null)}
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontWeight: 700 }}
            aria-label="Dismiss message"
          >
            ✕
          </button>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          PRIMARY TAB NAVIGATION BAR (Ordered matching Learner Profile stages)
          1. 1:1 Call -> 2. Mission Statement -> 3. Oral Assessments -> 4. Certificates
         ───────────────────────────────────────────────────────────────────────────── */}
      <div
        className={styles.tabsContainer}
        role="tablist"
        aria-label="Approvals and Certification Gates Tabs"
        style={{ marginBottom: 0, flexWrap: "wrap" }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "coaching"}
          className={`${styles.tabBtn} ${activeTab === "coaching" ? styles.tabBtnActive : ""}`}
          onClick={() => setActiveTab("coaching")}
        >
          <span>1:1 Call</span>
          <span
            style={{
              background: "var(--bg-soft, #f5ece1)",
              color: "var(--text-secondary)",
              fontSize: "0.72rem",
              fontWeight: 700,
              padding: "2px 7px",
              borderRadius: "9999px",
              lineHeight: 1.2,
            }}
          >
            {totalCoachingCount}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "missions"}
          className={`${styles.tabBtn} ${activeTab === "missions" ? styles.tabBtnActive : ""}`}
          onClick={() => setActiveTab("missions")}
        >
          <span>Mission Statement</span>
          <span
            style={{
              background: "var(--bg-soft, #f5ece1)",
              color: "var(--text-secondary)",
              fontSize: "0.72rem",
              fontWeight: 700,
              padding: "2px 7px",
              borderRadius: "9999px",
              lineHeight: 1.2,
            }}
          >
            {missionStatements.length}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "oral"}
          className={`${styles.tabBtn} ${activeTab === "oral" ? styles.tabBtnActive : ""}`}
          onClick={() => setActiveTab("oral")}
        >
          <span>Oral Assessments</span>
          <span
            style={{
              background: "var(--bg-soft, #f5ece1)",
              color: "var(--text-secondary)",
              fontSize: "0.72rem",
              fontWeight: 700,
              padding: "2px 7px",
              borderRadius: "9999px",
              lineHeight: 1.2,
            }}
          >
            {assessments.length}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "certificates"}
          className={`${styles.tabBtn} ${activeTab === "certificates" ? styles.tabBtnActive : ""}`}
          onClick={() => setActiveTab("certificates")}
        >
          <span>Certificates</span>
          <span
            style={{
              background: "var(--bg-soft, #f5ece1)",
              color: "var(--text-secondary)",
              fontSize: "0.72rem",
              fontWeight: 700,
              padding: "2px 7px",
              borderRadius: "9999px",
              lineHeight: 1.2,
            }}
          >
            {certificates.length}
          </span>
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────────
          TAB 1: 1:1 CALL
         ───────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "coaching" && (
        <CoachingApprovalsTab
          onError={(msg) => setPageError(msg)}
          onSuccess={(msg) => setPageSuccess(msg)}
          onTotalCountChange={(cnt) => setTotalCoachingCount(cnt)}
          batchId={selectedBatchId}
          onBatchChange={setSelectedBatchId}
          batches={batches}
        />
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          TAB 2: MISSION STATEMENT
         ───────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "missions" && (
        <section className={styles.tableSection}>
          {/* Search & Filters Toolbar */}
          <div
            className={styles.sectionHeader}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "0.75rem",
            }}
          >
            <div
              className={styles.searchContainer}
              style={{ minWidth: "240px", flex: "1 1 260px", maxWidth: "340px" }}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{ color: "var(--text-muted)", flexShrink: 0, marginRight: "0.45rem" }}
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search learner, email, or batch..."
                className={styles.searchInput}
                value={missionSearch}
                onChange={(e) => setMissionSearch(e.target.value)}
                aria-label="Search mission statements"
              />
              {missionSearch && (
                <button
                  type="button"
                  onClick={() => setMissionSearch("")}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: "0 2px",
                    fontSize: "0.85rem",
                    lineHeight: 1,
                  }}
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
              <CustomSelect
                value={missionFilter}
                onChange={setMissionFilter}
                options={missionStatusOptions}
                minWidth="170px"
                ariaLabel="Filter by Status"
              />
              <CustomSelect
                value={missionProgramFilter}
                onChange={setMissionProgramFilter}
                options={allProgramOptions}
                minWidth="175px"
                ariaLabel="Filter by Program"
              />
              <CustomSelect
                value={selectedBatchId}
                onChange={setSelectedBatchId}
                options={batchFilterOptions}
                minWidth="175px"
                ariaLabel="Filter by Batch"
              />
              {hasMissionFilters && (
                <button
                  type="button"
                  onClick={resetMissionFilters}
                  className={styles.secondaryBtnSmall}
                  style={{ height: "36px", padding: "0 0.85rem" }}
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          <div className={styles.tableWrapper}>
            <table className={styles.adminTable}>
              <thead>
                <tr>
                  <th
                    onClick={() => handleMissionSort("learner")}
                    style={{ cursor: "pointer", userSelect: "none" }}
                  >
                    Learner
                    <SortIndicator active={missionSortField === "learner"} order={missionSortOrder} />
                  </th>
                  <th
                    onClick={() => handleMissionSort("program")}
                    style={{ cursor: "pointer", userSelect: "none" }}
                  >
                    Program &amp; Batch
                    <SortIndicator active={missionSortField === "program"} order={missionSortOrder} />
                  </th>
                  <th>Document</th>
                  <th
                    onClick={() => handleMissionSort("createdAt")}
                    style={{ cursor: "pointer", userSelect: "none" }}
                  >
                    Submitted Date
                    <SortIndicator active={missionSortField === "createdAt"} order={missionSortOrder} />
                  </th>
                  <th
                    onClick={() => handleMissionSort("status")}
                    style={{ cursor: "pointer", userSelect: "none" }}
                  >
                    Status
                    <SortIndicator active={missionSortField === "status"} order={missionSortOrder} />
                  </th>
                  <th className={styles.alignRight}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingMissions ? (
                  <TableSkeleton rows={5} columns={6} />
                ) : paginatedMissions.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: "36px 16px" }}>
                      <EmptyState
                        icon="document"
                        title={
                          hasMissionFilters
                            ? "No mission statements match your filters"
                            : "No mission statement submissions yet"
                        }
                        description={
                          hasMissionFilters
                            ? "Try clearing your search or switching the active filter."
                            : "When learners complete their 1:1 call and upload their Mission Statement, submissions will appear here."
                        }
                        actionLabel={hasMissionFilters ? "Reset Filters" : undefined}
                        onAction={hasMissionFilters ? resetMissionFilters : undefined}
                      />
                    </td>
                  </tr>
                ) : (
                  paginatedMissions.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          {m.user?.id ? (
                            <Link
                              href={`/users/${m.user.id}`}
                              className={styles.cohortLink}
                              style={{ fontSize: "0.875rem" }}
                            >
                              {m.user.name || "Learner"}
                            </Link>
                          ) : (
                            <span className={styles.cellUserName}>{m.user?.name || "Learner"}</span>
                          )}
                          {m.user?.email && (
                            <span className={styles.cellUserEmail}>{m.user.email}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.85rem" }}>
                            {m.enrolment?.program?.title || "11 Steps Programme"}
                          </span>
                          <span className={styles.cellTextMuted}>
                            {m.enrolment?.batch?.name || "Direct Enrolment"}
                          </span>
                        </div>
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewLoading(true);
                            setPreviewError(false);
                            setPreviewMissionDoc(m);
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                            cursor: "pointer",
                            color: "var(--accent-primary, #c97a1e)",
                            fontWeight: 600,
                            fontSize: "0.84rem",
                            textAlign: "left",
                            maxWidth: "200px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={m.fileName}
                        >
                          {m.fileName || "Mission Statement"}
                        </button>
                      </td>
                      <td>
                        <span className={styles.cellTextMuted}>
                          {new Date(m.createdAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={m.status === "SUBMITTED" ? "PENDING" : m.status} />
                      </td>
                      <td className={styles.alignRight}>
                        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", alignItems: "center" }}>
                          {m.status === "SUBMITTED" ? (
                            <>
                              <button
                                type="button"
                                className={styles.primaryBtnSmall}
                                onClick={() => {
                                  setApprovingMission(m);
                                  setApprovalFeedback("Outstanding mission statement. Approved for professional certification.");
                                }}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                className={styles.dangerBtnSmall}
                                onClick={() => {
                                  setRejectingMission(m);
                                  setRejectionFeedback("");
                                }}
                              >
                                Reject
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className={styles.secondaryBtnSmall}
                              onClick={() => {
                                setPreviewLoading(true);
                                setPreviewError(false);
                                setPreviewMissionDoc(m);
                              }}
                            >
                              View
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            currentPage={missionPage}
            totalItems={sortedMissions.length}
            pageSize={missionPageSize}
            onPageChange={setMissionPage}
            onPageSizeChange={(s) => {
              setMissionPageSize(s);
              setMissionPage(1);
            }}
            itemLabel="mission statements"
          />
        </section>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          TAB 3: ORAL ASSESSMENTS
         ───────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "oral" && (
        <section className={styles.tableSection}>
          <div
            className={styles.sectionHeader}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "0.75rem",
            }}
          >
            <div
              className={styles.searchContainer}
              style={{ minWidth: "240px", flex: "1 1 260px", maxWidth: "340px" }}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{ color: "var(--text-muted)", flexShrink: 0, marginRight: "0.45rem" }}
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search learner, email, or batch..."
                className={styles.searchInput}
                value={oralSearch}
                onChange={(e) => setOralSearch(e.target.value)}
                aria-label="Search oral assessments"
              />
              {oralSearch && (
                <button
                  type="button"
                  onClick={() => setOralSearch("")}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: "0 2px",
                    fontSize: "0.85rem",
                    lineHeight: 1,
                  }}
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
              <CustomSelect
                value={oralFilter}
                onChange={setOralFilter}
                options={oralStatusOptions}
                minWidth="170px"
                ariaLabel="Filter by Status"
              />
              <CustomSelect
                value={oralProgramFilter}
                onChange={setOralProgramFilter}
                options={allProgramOptions}
                minWidth="175px"
                ariaLabel="Filter by Program"
              />
              <CustomSelect
                value={selectedBatchId === "UNASSIGNED" ? "" : selectedBatchId}
                onChange={setSelectedBatchId}
                options={oralBatchFilterOptions}
                disabled={loadingBatches}
                minWidth="175px"
                ariaLabel="Filter by Batch"
              />
              {hasOralFilters && (
                <button
                  type="button"
                  onClick={resetOralFilters}
                  className={styles.secondaryBtnSmall}
                  style={{ height: "36px", padding: "0 0.85rem" }}
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          <div className={styles.tableWrapper}>
            <table className={styles.adminTable}>
              <thead>
                <tr>
                  <th
                    onClick={() => handleOralSort("learner")}
                    style={{ cursor: "pointer", userSelect: "none" }}
                  >
                    Learner
                    <SortIndicator active={oralSortField === "learner"} order={oralSortOrder} />
                  </th>
                  <th
                    onClick={() => handleOralSort("program")}
                    style={{ cursor: "pointer", userSelect: "none" }}
                  >
                    Program &amp; Batch
                    <SortIndicator active={oralSortField === "program"} order={oralSortOrder} />
                  </th>
                  <th
                    onClick={() => handleOralSort("scheduledDate")}
                    style={{ cursor: "pointer", userSelect: "none" }}
                  >
                    Scheduled Date
                    <SortIndicator active={oralSortField === "scheduledDate"} order={oralSortOrder} />
                  </th>
                  <th
                    onClick={() => handleOralSort("score")}
                    style={{ cursor: "pointer", userSelect: "none" }}
                  >
                    Score
                    <SortIndicator active={oralSortField === "score"} order={oralSortOrder} />
                  </th>
                  <th
                    onClick={() => handleOralSort("status")}
                    style={{ cursor: "pointer", userSelect: "none" }}
                  >
                    Status
                    <SortIndicator active={oralSortField === "status"} order={oralSortOrder} />
                  </th>
                  <th className={styles.alignRight}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingAssessments || loadingBatches ? (
                  <TableSkeleton rows={5} columns={6} />
                ) : paginatedAssessments.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: "36px 16px" }}>
                      <EmptyState
                        icon="clipboard"
                        title={
                          hasOralFilters
                            ? "No oral assessments match your filters"
                            : "No oral assessments scheduled yet"
                        }
                        description={
                          hasOralFilters
                            ? "Try clearing your search or switching the active filter."
                            : "Schedule an oral competency assessment for an enrolled learner to evaluate their rubric scores."
                        }
                        actionLabel={
                          hasOralFilters ? "Reset Filters" : "Schedule Assessment"
                        }
                        onAction={
                          hasOralFilters ? resetOralFilters : handleOpenScheduleModal
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  paginatedAssessments.map((a) => {
                    const learnerId = a.enrolment?.user?.id || a.enrolment?.userId;
                    const learnerName = a.enrolment?.user?.name || "Enrolled Learner";
                    const learnerEmail = a.enrolment?.user?.email || "";
                    const progTitle =
                      a._programTitle || a.enrolment?.program?.title || "11 Steps Programme";
                    const batchLabel = a._batchName || a.enrolment?.batch?.name;

                    return (
                      <tr key={a.id}>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            {learnerId ? (
                              <Link
                                href={`/users/${learnerId}`}
                                className={styles.cohortLink}
                                style={{ fontSize: "0.875rem" }}
                              >
                                {learnerName}
                              </Link>
                            ) : (
                              <span className={styles.cellUserName}>{learnerName}</span>
                            )}
                            {learnerEmail && (
                              <span className={styles.cellUserEmail}>{learnerEmail}</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.85rem" }}>
                              {progTitle}
                            </span>
                            <span className={styles.cellTextMuted}>
                              {batchLabel || "Assigned Batch"}
                            </span>
                          </div>
                        </td>
                        <td>
                          {a.scheduledDate ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                              <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.85rem" }}>
                                {new Date(a.scheduledDate).toLocaleDateString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                  timeZone: displayTimezone,
                                })}
                              </span>
                              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                {new Date(a.scheduledDate).toLocaleTimeString(undefined, {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  hour12: true,
                                  timeZone: displayTimezone,
                                })} ({displayTimezone})
                              </span>
                            </div>
                          ) : (
                            <span className={styles.cellTextMuted}>Not scheduled</span>
                          )}
                        </td>
                        <td>
                          {a.overallScore !== null ? (
                            <span
                              style={{
                                fontWeight: 700,
                                fontSize: "0.88rem",
                                color: a.overallScore >= 75 ? "#166534" : "#991b1b",
                              }}
                            >
                              {a.overallScore}%
                            </span>
                          ) : (
                            <span className={styles.cellTextMuted}>—</span>
                          )}
                        </td>
                        <td>
                          <StatusBadge status={a.status} />
                        </td>
                        <td className={styles.alignRight}>
                          <button
                            type="button"
                            onClick={() => handleOpenGrading(a)}
                            className={
                              a.status === "SCHEDULED"
                                ? styles.primaryBtnSmall
                                : styles.secondaryBtnSmall
                            }
                          >
                            {a.status === "SCHEDULED" ? "Grade" : "View"}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            currentPage={oralPage}
            totalItems={sortedAssessments.length}
            pageSize={oralPageSize}
            onPageChange={setOralPage}
            onPageSizeChange={(s) => {
              setOralPageSize(s);
              setOralPage(1);
            }}
            itemLabel="oral assessments"
          />
        </section>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          TAB 4: CERTIFICATES
         ───────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "certificates" && (
        <section className={styles.tableSection}>
          {/* Search & Filters Toolbar */}
          <div
            className={styles.sectionHeader}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "0.75rem",
            }}
          >
            <div
              className={styles.searchContainer}
              style={{ minWidth: "240px", flex: "1 1 260px", maxWidth: "340px" }}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{ color: "var(--text-muted)", flexShrink: 0, marginRight: "0.45rem" }}
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search learner, email, or cert code..."
                className={styles.searchInput}
                value={certSearch}
                onChange={(e) => setCertSearch(e.target.value)}
                aria-label="Search certificates"
              />
              {certSearch && (
                <button
                  type="button"
                  onClick={() => setCertSearch("")}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: "0 2px",
                    fontSize: "0.85rem",
                    lineHeight: 1,
                  }}
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
              <CustomSelect
                value={certFilter}
                onChange={setCertFilter}
                options={certStatusOptions}
                minWidth="170px"
                ariaLabel="Filter by Status"
              />
              <CustomSelect
                value={certProgramFilter}
                onChange={setCertProgramFilter}
                options={allProgramOptions}
                minWidth="175px"
                ariaLabel="Filter by Program"
              />
              <CustomSelect
                value={selectedBatchId}
                onChange={setSelectedBatchId}
                options={batchFilterOptions}
                minWidth="175px"
                ariaLabel="Filter by Batch"
              />
              {hasCertFilters && (
                <button
                  type="button"
                  onClick={resetCertFilters}
                  className={styles.secondaryBtnSmall}
                  style={{ height: "36px", padding: "0 0.85rem" }}
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          <div className={styles.tableWrapper}>
            <table className={styles.adminTable}>
              <thead>
                <tr>
                  <th
                    onClick={() => handleCertSort("learner")}
                    style={{ cursor: "pointer", userSelect: "none" }}
                  >
                    Learner
                    <SortIndicator active={certSortField === "learner"} order={certSortOrder} />
                  </th>
                  <th
                    onClick={() => handleCertSort("program")}
                    style={{ cursor: "pointer", userSelect: "none" }}
                  >
                    Program &amp; Batch
                    <SortIndicator active={certSortField === "program"} order={certSortOrder} />
                  </th>
                  <th
                    onClick={() => handleCertSort("code")}
                    style={{ cursor: "pointer", userSelect: "none" }}
                  >
                    Certificate No.
                    <SortIndicator active={certSortField === "code"} order={certSortOrder} />
                  </th>
                  <th
                    onClick={() => handleCertSort("createdAt")}
                    style={{ cursor: "pointer", userSelect: "none" }}
                  >
                    Date
                    <SortIndicator active={certSortField === "createdAt"} order={certSortOrder} />
                  </th>
                  <th
                    onClick={() => handleCertSort("status")}
                    style={{ cursor: "pointer", userSelect: "none" }}
                  >
                    Status
                    <SortIndicator active={certSortField === "status"} order={certSortOrder} />
                  </th>
                  <th className={styles.alignRight}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingCertificates ? (
                  <TableSkeleton rows={5} columns={6} />
                ) : paginatedCertificates.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: "36px 16px" }}>
                      <EmptyState
                        icon="academic"
                        title={
                          hasCertFilters
                            ? "No certificates match your filters"
                            : "No certificates in queue"
                        }
                        description={
                          hasCertFilters
                            ? "Try clearing your search or switching the active filter."
                            : "When learners complete their curriculum steps and final requirements, certificates will appear here."
                        }
                        actionLabel={hasCertFilters ? "Reset Filters" : undefined}
                        onAction={hasCertFilters ? resetCertFilters : undefined}
                      />
                    </td>
                  </tr>
                ) : (
                  paginatedCertificates.map((cert) => {
                    const learnerId = cert.enrolment?.user?.id || cert.enrolment?.userId;
                    const learnerName = cert.enrolment?.user?.name || "Unknown Learner";
                    const learnerEmail = cert.enrolment?.user?.email || "";
                    const programTitle =
                      cert.enrolment?.batch?.program?.title ||
                      cert.enrolment?.program?.title ||
                      "11 Steps Programme";
                    const batchName = cert.enrolment?.batch?.name;
                    const isActionBusy = inFlightCertAction?.id === cert.id;
                    const certCode = cert.certificateCode || cert.certificateNumber;

                    return (
                      <tr key={cert.id}>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            {learnerId ? (
                              <Link
                                href={`/users/${learnerId}`}
                                className={styles.cohortLink}
                                style={{ fontSize: "0.875rem" }}
                              >
                                {learnerName}
                              </Link>
                            ) : (
                              <span className={styles.cellUserName}>{learnerName}</span>
                            )}
                            {learnerEmail && (
                              <span className={styles.cellUserEmail}>{learnerEmail}</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.85rem" }}>
                              {programTitle}
                            </span>
                            <span className={styles.cellTextMuted}>
                              {batchName || "Direct Enrolment"}
                            </span>
                          </div>
                        </td>
                        <td>
                          {certCode ? (
                            <code style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                              {certCode}
                            </code>
                          ) : (
                            <span className={styles.cellTextMuted}>—</span>
                          )}
                        </td>
                        <td>
                          <span className={styles.cellTextMuted}>
                            {new Date(cert.issueDate || cert.createdAt).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                        </td>
                        <td>
                          <StatusBadge status={cert.status} />
                        </td>
                        <td className={styles.alignRight}>
                          {cert.status === "PENDING" && (
                            <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                              <button
                                type="button"
                                className={styles.primaryBtnSmall}
                                disabled={isActionBusy}
                                onClick={() => handleCertificateAction(cert.id, "approve")}
                              >
                                {isActionBusy && inFlightCertAction?.action === "approve"
                                  ? "Approving..."
                                  : "Approve"}
                              </button>
                              <button
                                type="button"
                                className={styles.dangerBtnSmall}
                                disabled={isActionBusy}
                                onClick={() => handleOpenRejectModal(cert)}
                              >
                                Reject
                              </button>
                            </div>
                          )}
                          {cert.status === "APPROVED" && (
                            <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", alignItems: "center" }}>
                              <button
                                type="button"
                                className={styles.successBtnSmall}
                                disabled={isActionBusy}
                                onClick={() => handleCertificateAction(cert.id, "issue")}
                              >
                                {isActionBusy && inFlightCertAction?.action === "issue"
                                  ? "Issuing..."
                                  : "Issue"}
                              </button>
                              <Link href={`/certificates/${cert.id}`} className={styles.secondaryBtnSmall}>
                                View
                              </Link>
                            </div>
                          )}
                          {cert.status === "ISSUED" && (
                            <Link href={`/certificates/${cert.id}`} className={styles.secondaryBtnSmall}>
                              View
                            </Link>
                          )}
                          {cert.status === "REJECTED" && (
                            <span className={styles.cellTextMuted} style={{ fontSize: "0.8rem" }}>
                              {cert.rejectionReason || "Rejected"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            currentPage={certPage}
            totalItems={sortedCertificates.length}
            pageSize={certPageSize}
            onPageChange={setCertPage}
            onPageSizeChange={(s) => {
              setCertPageSize(s);
              setCertPage(1);
            }}
            itemLabel="certificates"
          />
        </section>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          CERTIFICATE REJECTION REASON MODAL
         ───────────────────────────────────────────────────────────────────────────── */}
      {rejectingCert && (
        <Modal
          isOpen={true}
          onClose={() => setRejectingCert(null)}
          title="Reject Certificate Request"
          subtitle={`Learner: ${rejectingCert.enrolment?.user?.name || "Learner"} (${rejectingCert.enrolment?.user?.email || ""})`}
          maxWidth="480px"
        >
          <form onSubmit={handleSubmitRejection}>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "6px" }}>
              <div className={styles.formGroup}>
                <label htmlFor="reason" style={{ color: "#991b1b" }}>
                  Rejection Reason *
                </label>
                <textarea
                  id="reason"
                  rows={3}
                  placeholder="Specify why this certificate request is being rejected..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setRejectingCert(null)}
                  disabled={submittingRejection}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.dangerBtnSmall}
                  style={{ padding: "8px 16px", fontSize: "0.85rem" }}
                  disabled={submittingRejection || !rejectionReason.trim()}
                >
                  {submittingRejection ? "Rejecting..." : "Confirm Rejection"}
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          ORAL GRADING MODAL
         ───────────────────────────────────────────────────────────────────────────── */}
      {gradingAssessment && (
        <Modal
          isOpen={true}
          onClose={() => setGradingAssessment(null)}
          title="Oral Competency Evaluation"
          subtitle={`Learner: ${gradingAssessment.enrolment?.user?.name || "Learner"} (${gradingAssessment.enrolment?.user?.email || ""})`}
          maxWidth="700px"
          footer={
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", width: "100%" }}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setGradingAssessment(null)}
                disabled={submittingGrade}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const form = document.getElementById("oral-grading-form") as HTMLFormElement | null;
                  if (form) form.requestSubmit();
                }}
                className={styles.primaryBtn}
                disabled={submittingGrade}
              >
                {submittingGrade ? "Saving Evaluation..." : "Save Evaluation"}
              </button>
            </div>
          }
        >
          <form id="oral-grading-form" onSubmit={handleSubmitGrade}>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "4px" }}>
              {gradeModalError && (
                <div className={styles.alertError} style={{ marginBottom: 0 }}>
                  {gradeModalError}
                </div>
              )}

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <div>
                    <h3 style={{ fontSize: "0.95rem", margin: 0, fontWeight: 700, color: "var(--text-primary)" }}>
                      Rubric Scoring Criteria
                    </h3>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      Evaluate learner competencies on a 10-point scale per category
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddRubricItem}
                    className={styles.secondaryBtnSmall}
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    <span>Add Criterion</span>
                  </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {rubricScores.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: "12px 14px",
                        borderRadius: "8px",
                        border: "1px solid var(--border-light)",
                        backgroundColor: "var(--bg-soft)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
                        <input
                          type="text"
                          value={item.rubricCategory}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRubricScores((prev) => {
                              const target = prev[idx];
                              if (!target) return prev;
                              const next = [...prev];
                              next[idx] = {
                                ...target,
                                rubricCategory: val,
                              };
                              return next;
                            });
                          }}
                          placeholder="Criterion name..."
                          style={{
                            fontWeight: 600,
                            fontSize: "0.88rem",
                            border: "1px solid var(--border-light, #e2e8f0)",
                            borderRadius: "6px",
                            padding: "6px 10px",
                            background: "#ffffff",
                            color: "var(--text-primary)",
                            flex: "1 1 auto",
                            minWidth: 0,
                          }}
                          required
                        />
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                          <input
                            type="number"
                            min={0}
                            max={item.maxScore}
                            value={item.score}
                            onChange={(e) => handleScoreChange(idx, parseInt(e.target.value, 10) || 0)}
                            style={{
                              width: "56px",
                              padding: "6px 8px",
                              textAlign: "center",
                              fontWeight: 700,
                              fontSize: "0.9rem",
                              borderRadius: "6px",
                              border: "1px solid var(--border-light, #e2e8f0)",
                              background: "#ffffff",
                            }}
                            required
                            aria-label={`Score for ${item.rubricCategory}`}
                          />
                          <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)" }}>/ {item.maxScore}</span>
                          {rubricScores.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveRubricItem(idx)}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: "30px",
                                height: "30px",
                                borderRadius: "6px",
                                border: "1px solid var(--border-light, #e2e8f0)",
                                background: "#ffffff",
                                color: "var(--text-muted, #71717a)",
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                                marginLeft: "4px",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.color = "#dc2626";
                                e.currentTarget.style.borderColor = "#fca5a5";
                                e.currentTarget.style.background = "#fef2f2";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.color = "var(--text-muted, #71717a)";
                                e.currentTarget.style.borderColor = "var(--border-light, #e2e8f0)";
                                e.currentTarget.style.background = "#ffffff";
                              }}
                              title="Remove criterion"
                              aria-label="Remove criterion"
                            >
                              <svg
                                width="15"
                                height="15"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.85"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                <line x1="10" y1="11" x2="10" y2="17" />
                                <line x1="14" y1="11" x2="14" y2="17" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>

                      <input
                        type="text"
                        placeholder="Optional category observation or constructive feedback..."
                        value={item.feedback || ""}
                        onChange={(e) => handleFeedbackChange(idx, e.target.value)}
                        style={{
                          width: "100%",
                          padding: "6px 10px",
                          fontSize: "0.82rem",
                          borderRadius: "6px",
                          border: "1px solid var(--border-light, #e2e8f0)",
                          background: "#ffffff",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    marginTop: "12px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px 16px",
                    background: calculatedPercent >= 75 ? "rgba(22, 163, 74, 0.05)" : "rgba(220, 38, 38, 0.05)",
                    border: `1px solid ${calculatedPercent >= 75 ? "rgba(22, 163, 74, 0.25)" : "rgba(220, 38, 38, 0.25)"}`,
                    borderRadius: "8px",
                  }}
                >
                  <div>
                    <span style={{ fontSize: "0.82rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)", display: "block" }}>
                      Aggregate Rubric Score
                    </span>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                      {calculatedPercent >= 75 ? "Meets or exceeds 75% competency standard" : "Below 75% passing benchmark"}
                    </span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: "1.15rem", fontWeight: 800, color: calculatedPercent >= 75 ? "#15803d" : "#b91c1c" }}>
                      {totalEarned} / {totalPossible}
                    </span>
                    <span style={{ marginLeft: "6px", fontSize: "0.95rem", fontWeight: 700, color: calculatedPercent >= 75 ? "#15803d" : "#b91c1c" }}>
                      ({calculatedPercent}%)
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ padding: "14px 16px", borderRadius: "8px", border: "1px solid var(--border-light)", background: "var(--bg-soft)" }}>
                <label style={{ display: "block", fontWeight: 700, fontSize: "0.88rem", marginBottom: "10px", color: "var(--text-primary)" }}>
                  Assessment Outcome Verdict *
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      cursor: "pointer",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      border: `1.5px solid ${passed ? "#16a34a" : "var(--border-light)"}`,
                      background: passed ? "rgba(22, 163, 74, 0.08)" : "#ffffff",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <input
                      type="radio"
                      name="passedVerdict"
                      checked={passed}
                      onChange={() => setPassed(true)}
                      style={{ accentColor: "#16a34a", width: "16px", height: "16px" }}
                    />
                    <div>
                      <span style={{ fontSize: "0.88rem", color: "#166534", fontWeight: 700, display: "block" }}>
                        Pass
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                        Meets Competency Standards
                      </span>
                    </div>
                  </label>

                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      cursor: "pointer",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      border: `1.5px solid ${!passed ? "#dc2626" : "var(--border-light)"}`,
                      background: !passed ? "rgba(220, 38, 38, 0.08)" : "#ffffff",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <input
                      type="radio"
                      name="passedVerdict"
                      checked={!passed}
                      onChange={() => setPassed(false)}
                      style={{ accentColor: "#dc2626", width: "16px", height: "16px" }}
                    />
                    <div>
                      <span style={{ fontSize: "0.88rem", color: "#991b1b", fontWeight: 700, display: "block" }}>
                        Retry
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                        Prerequisite Competencies Incomplete
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="notes" style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "6px", display: "block" }}>
                  Trainer Qualitative Feedback &amp; Notes *
                </label>
                <textarea
                  id="notes"
                  rows={3}
                  placeholder="Enter qualitative feedback regarding the learner's reflection, articulation, and core competencies..."
                  value={trainerNotes}
                  onChange={(e) => setTrainerNotes(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-light, #e2e8f0)",
                    fontSize: "0.85rem",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {!passed && (
                <div className={styles.formGroup}>
                  <label htmlFor="retry" style={{ color: "#991b1b", fontWeight: 600, fontSize: "0.85rem", marginBottom: "6px", display: "block" }}>
                    Retry Remediation Guidance *
                  </label>
                  <textarea
                    id="retry"
                    rows={2}
                    placeholder="Specify required remediation, practice exercises, or study modules before the rescheduled oral assessment..."
                    value={retryGuidance}
                    onChange={(e) => setRetryGuidance(e.target.value)}
                    required={!passed}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid #fecaca",
                      background: "#fff5f5",
                      fontSize: "0.85rem",
                      boxSizing: "border-box",
                    }}
                  />
                  <span style={{ fontSize: "0.74rem", color: "#b91c1c", marginTop: "4px", display: "block" }}>
                    Required: Provide concrete guidance to help the learner prepare for their re-evaluation.
                  </span>
                </div>
              )}
            </div>
          </form>
        </Modal>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          SCHEDULE ORAL ASSESSMENT MODAL
         ───────────────────────────────────────────────────────────────────────────── */}
      {isScheduleModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsScheduleModalOpen(false)}
          title="Schedule Oral Assessment"
          subtitle="Assign an oral competency interview to an enrolled learner."
          maxWidth="560px"
          footer={
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", width: "100%" }}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setIsScheduleModalOpen(false)}
                disabled={submittingSchedule}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const form = document.getElementById("schedule-oral-form") as HTMLFormElement | null;
                  if (form) form.requestSubmit();
                }}
                className={styles.primaryBtn}
                disabled={submittingSchedule || !selectedEnrolmentId || !scheduleBatchId}
              >
                {submittingSchedule ? "Scheduling..." : "Create Assessment"}
              </button>
            </div>
          }
        >
          <form id="schedule-oral-form" onSubmit={handleSubmitSchedule}>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "4px" }}>
              {scheduleModalError && (
                <div className={styles.alertError} style={{ marginBottom: 0 }}>
                  {scheduleModalError}
                </div>
              )}

              <div className={styles.formGroup}>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: 600, fontSize: "0.85rem" }}>
                  Select Batch Cohort *
                </label>
                <CustomSelect
                  value={scheduleBatchId}
                  onChange={(val) => {
                    setScheduleBatchId(val);
                    loadEnrolmentsForScheduleBatch(val);
                  }}
                  fullWidth
                  ariaLabel="Select Batch Cohort"
                  placeholder="Choose a batch..."
                  options={batches.map((b) => ({
                    value: b.id,
                    label: `${b.name}${b.program?.title ? ` (${b.program.title})` : ""}`,
                  }))}
                />
              </div>

              <div className={styles.formGroup}>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: 600, fontSize: "0.85rem" }}>
                  Select Enrolled Learner *
                </label>
                <CustomSelect
                  value={selectedEnrolmentId}
                  onChange={setSelectedEnrolmentId}
                  fullWidth
                  disabled={loadingScheduleEnrolments || batchEnrolments.length === 0}
                  ariaLabel="Select Enrolled Learner"
                  placeholder={
                    loadingScheduleEnrolments
                      ? "Loading learners..."
                      : batchEnrolments.length === 0
                      ? "No enrolled learners in this batch"
                      : "Choose an enrolled learner..."
                  }
                  options={batchEnrolments.map((enr) => ({
                    value: enr.id,
                    label: `${enr.user?.name || "Learner"} (${enr.user?.email || "No email"}) — ${enr.status}`,
                  }))}
                />
                {batchEnrolments.length === 0 && !loadingScheduleEnrolments && scheduleBatchId && (
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px", display: "block" }}>
                    No learners are currently enrolled in this batch.
                  </span>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <div className={styles.formGroup}>
                  <label style={{ display: "block", marginBottom: "6px", fontWeight: 600, fontSize: "0.85rem" }}>
                    Scheduled Date <span className={styles.optionalLabel}>(Optional)</span>
                  </label>
                  <DatePicker
                    value={scheduledDateStr}
                    onChange={setScheduledDateStr}
                    placeholder="Select date"
                    minWidth="100%"
                    ariaLabel="Scheduled Date"
                  />
                </div>
                <div className={styles.formGroup}>
                  <label style={{ display: "block", marginBottom: "6px", fontWeight: 600, fontSize: "0.85rem" }}>
                    Time ({displayTimezone}) <span className={styles.optionalLabel}>(Optional)</span>
                  </label>
                  <TimePicker
                    value={scheduledTimeStr}
                    onChange={setScheduledTimeStr}
                    disabled={!scheduledDateStr}
                    ariaLabel="Scheduled Time"
                  />
                </div>
              </div>

              <div style={{ background: "var(--bg-soft)", padding: "10px 14px", borderRadius: "8px", border: "1px solid var(--border-light)", display: "flex", alignItems: "flex-start", gap: "8px" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-muted)", flexShrink: 0, marginTop: "2px" }} aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.45 }}>
                  Oral assessments are linked to Stage 2 Final Exam milestones. Once scheduled, assessors can evaluate rubric criteria directly in the portal.
                </span>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          MISSION STATEMENT DOCUMENT PREVIEW MODAL
         ───────────────────────────────────────────────────────────────────────────── */}
      {previewMissionDoc && (() => {
        const isDataUri = previewMissionDoc.fileUrl.startsWith("data:");
        const docFileUrl =
          previewMissionDoc.fileUrl.startsWith("http") || isDataUri
            ? previewMissionDoc.fileUrl
            : `${API_URL}/mission-statements/${previewMissionDoc.id}/file`;
        const isImage =
          (previewMissionDoc.mimeType || "").includes("image") ||
          (isDataUri && previewMissionDoc.fileUrl.startsWith("data:image/")) ||
          docFileUrl.match(/\.(jpg|jpeg|png|webp|svg)(\?.*)?$/i) !== null;

        return (
          <Modal
            isOpen={true}
            onClose={() => {
              setPreviewMissionDoc(null);
              setPreviewFullscreen(false);
            }}
            title={`Mission Statement: ${previewMissionDoc.user?.name || "Learner"}`}
            subtitle={`${previewMissionDoc.enrolment?.program?.title || "Program"} · ${previewMissionDoc.fileName}`}
            maxWidth={previewFullscreen ? "98vw" : "960px"}
            containerStyle={
              previewFullscreen
                ? {
                    width: "98vw",
                    height: "94vh",
                    maxHeight: "94vh",
                    borderRadius: 10,
                  }
                : {
                    width: "100%",
                    maxHeight: "92vh",
                  }
            }
            bodyStyle={{
              padding: 0,
              overflow: "hidden",
              background: "#18181b",
            }}
            headerActions={
              <button
                type="button"
                onClick={() => setPreviewFullscreen(!previewFullscreen)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted, #78716a)",
                  cursor: "pointer",
                  padding: "6px",
                  borderRadius: "6px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.15s ease",
                }}
                title={previewFullscreen ? "Exit Fullscreen" : "Fullscreen Preview"}
                aria-label={previewFullscreen ? "Exit Fullscreen" : "Fullscreen Preview"}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bg-soft, #f0ece3)";
                  e.currentTarget.style.color = "var(--text-primary, #14110f)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--text-muted, #78716a)";
                }}
              >
                {previewFullscreen ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                  </svg>
                )}
              </button>
            }
            footer={
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", flexWrap: "wrap", gap: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <a
                    href={docFileUrl}
                    download={previewMissionDoc.fileName || "mission-statement.pdf"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.secondaryBtn}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "0.82rem",
                      padding: "0.45rem 0.95rem",
                      fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <span>Download Document</span>
                  </a>
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    onClick={() => {
                      setPreviewMissionDoc(null);
                      setPreviewFullscreen(false);
                    }}
                  >
                    Close
                  </button>
                  {previewMissionDoc.status === "SUBMITTED" && (
                    <>
                      <button
                        type="button"
                        className={styles.dangerBtnSmall}
                        onClick={() => {
                          const doc = previewMissionDoc;
                          setPreviewMissionDoc(null);
                          setPreviewFullscreen(false);
                          setRejectingMission(doc);
                          setRejectionFeedback("");
                        }}
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        className={styles.primaryBtnSmall}
                        onClick={() => {
                          const doc = previewMissionDoc;
                          setPreviewMissionDoc(null);
                          setPreviewFullscreen(false);
                          setApprovingMission(doc);
                          setApprovalFeedback("Outstanding mission statement. Approved for professional certification.");
                        }}
                      >
                        Approve
                      </button>
                    </>
                  )}
                </div>
              </div>
            }
          >
            <div
              style={{
                width: "100%",
                height: previewFullscreen ? "calc(94vh - 128px)" : "68vh",
                minHeight: "480px",
                overflow: "hidden",
                background: isImage ? "#18181b" : "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
              }}
            >
              {previewLoading && !previewError && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 12,
                    color: "#71717a",
                    background: "#ffffff",
                    zIndex: 2,
                  }}
                >
                  <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Loading document preview...</span>
                </div>
              )}

              {previewError && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 12,
                    padding: "2rem",
                    textAlign: "center",
                    color: "#dc2626",
                  }}
                >
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#18181b" }}>
                    Document Preview Unavailable Inline
                  </div>
                  <p style={{ margin: 0, fontSize: "0.82rem", color: "#71717a", maxWidth: 440, lineHeight: 1.5 }}>
                    The document format or browser security policies prevent inline display. You can open or download the document below.
                  </p>
                  <a
                    href={docFileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.primaryBtnSmall}
                    style={{ marginTop: 6 }}
                  >
                    <span>Open in New Tab &nearr;</span>
                  </a>
                </div>
              )}

              {isImage && (
                <img
                  src={docFileUrl}
                  alt="Learner Mission Statement"
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    if (img.naturalWidth <= 1 && img.naturalHeight <= 1) {
                      setPreviewLoading(false);
                      setPreviewError(true);
                      return;
                    }
                    setPreviewLoading(false);
                    setPreviewError(false);
                  }}
                  onError={() => {
                    setPreviewLoading(false);
                    setPreviewError(true);
                  }}
                  style={{
                    maxWidth: "100%",
                    maxHeight: "100%",
                    objectFit: "contain",
                    display: previewLoading || previewError ? "none" : "block",
                  }}
                />
              )}

              {!isImage && (
                <iframe
                  src={docFileUrl}
                  title="Learner Mission Statement Document"
                  onLoad={() => {
                    setPreviewLoading(false);
                    setPreviewError(false);
                  }}
                  onError={() => {
                    setPreviewLoading(false);
                    setPreviewError(true);
                  }}
                  style={{
                    width: "100%",
                    height: "100%",
                    border: "none",
                    display: previewLoading || previewError ? "none" : "block",
                  }}
                />
              )}
            </div>
          </Modal>
        );
      })()}

      {/* ─────────────────────────────────────────────────────────────────────────────
          APPROVE MISSION STATEMENT MODAL
         ───────────────────────────────────────────────────────────────────────────── */}
      {approvingMission && (
        <Modal
          isOpen={true}
          onClose={() => setApprovingMission(null)}
          title="Approve Mission Statement"
          subtitle={`Learner: ${approvingMission.user?.name || "Learner"}`}
        >
          <form onSubmit={handleApproveMission}>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "6px" }}>
              <div className={styles.formGroup}>
                <label>Feedback Note (Optional)</label>
                <textarea
                  value={approvalFeedback}
                  onChange={(e) => setApprovalFeedback(e.target.value)}
                  rows={3}
                  placeholder="Outstanding mission statement. Approved for professional certification."
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setApprovingMission(null)}
                  disabled={submittingApproval}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={submittingApproval}
                >
                  {submittingApproval ? "Approving..." : "Approve"}
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          REJECT MISSION STATEMENT MODAL
         ───────────────────────────────────────────────────────────────────────────── */}
      {rejectingMission && (
        <Modal
          isOpen={true}
          onClose={() => setRejectingMission(null)}
          title="Reject Mission Statement"
          subtitle={`Provide feedback to ${rejectingMission.user?.name || "the learner"} so they can revise and resubmit.`}
        >
          <form onSubmit={handleRejectMission}>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "6px" }}>
              <div className={styles.formGroup}>
                <label>
                  Revision Feedback <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <textarea
                  value={rejectionFeedback}
                  onChange={(e) => setRejectionFeedback(e.target.value)}
                  rows={4}
                  required
                  placeholder="Specify required changes..."
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setRejectingMission(null)}
                  disabled={submittingMissionReject}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.dangerBtnSmall}
                  style={{ padding: "8px 16px", fontSize: "0.85rem" }}
                  disabled={submittingMissionReject || !rejectionFeedback.trim()}
                >
                  {submittingMissionReject ? "Sending..." : "Send Revision Request"}
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
