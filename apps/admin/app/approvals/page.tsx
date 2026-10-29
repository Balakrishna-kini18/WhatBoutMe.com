"use client";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import styles from "../page.module.css";
import {
  API_URL,
  errorMessage,
  fetchMissionStatements,
  approveMissionStatement,
  rejectMissionStatement,
  type MissionStatementItem,
} from "../lib/api";
import { CustomSelect, StatusBadge, Modal, LearnerPortalFlow } from "../components";
import CoachingApprovalsTab from "./components/CoachingApprovalsTab";
import { fetchOneOnOneRequests } from "../lib/api";

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
    user?: {
      id: string;
      name: string;
      email: string;
    };
  };
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

interface EligibilityData {
  enrolmentId: string;
  userId: string;
  programId: string;
  programTitle: string;
  certificateType: string;
  isEligible: boolean;
  status: string;
  steps: {
    required: number;
    completed: number;
    isMet: boolean;
    uncompletedStepTitles?: string[];
  };
  quizzes: {
    required: number;
    passed: number;
    isMet: boolean;
    unpassedQuizStepTitles?: string[];
  };
  finalExam: {
    required: boolean;
    passed: boolean;
    score: number | null;
    isMet: boolean;
  };
  oralAssessment: {
    required: boolean;
    passed: boolean;
    score: number | null;
    isMet: boolean;
  };
  attendance: {
    required: boolean;
    thresholdUsed: number;
    attendancePercentage: number;
    attendedSessions: number;
    requiredSessions: number;
    isMet: boolean;
  };
  closingCall: {
    required: boolean;
    completed: boolean;
    isMet: boolean;
  };
  unmetRequirements: string[];
}

const DEFAULT_RUBRIC: RubricScoreItem[] = [
  { rubricCategory: "Resilience & Self-Leadership", score: 8, maxScore: 10, feedback: "" },
  { rubricCategory: "Application of Curriculum Principles", score: 8, maxScore: 10, feedback: "" },
  { rubricCategory: "Clarity & Reflection", score: 8, maxScore: 10, feedback: "" },
  { rubricCategory: "Goal & Future Readiness", score: 8, maxScore: 10, feedback: "" },
];

export default function ApprovalsPage() {
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get("tab");
  const batchParam = searchParams?.get("batchId");

  const [activeTab, setActiveTab] = useState<"certificates" | "coaching" | "missions" | "oral">(
    tabParam === "coaching" || tabParam === "certificates" || tabParam === "missions" || tabParam === "oral"
      ? tabParam
      : "certificates"
  );
  const [selectedBatchId, setSelectedBatchId] = useState<string>(batchParam || "");
  const [pendingCoachingCount, setPendingCoachingCount] = useState(0);

  useEffect(() => {
    if (tabParam === "coaching" || tabParam === "certificates" || tabParam === "missions" || tabParam === "oral") {
      setActiveTab(tabParam);
    }
    if (batchParam) {
      setSelectedBatchId(batchParam);
    }
  }, [tabParam, batchParam]);

  useEffect(() => {
    fetchOneOnOneRequests("PENDING_APPROVAL")
      .then((reqs) => {
        if (Array.isArray(reqs)) {
          setPendingCoachingCount(reqs.length);
        }
      })
      .catch(() => {});
  }, []);

  // Common notification state
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageSuccess, setPageSuccess] = useState<string | null>(null);

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Certificate Approvals Queue & Eligibility Gate State
  // ─────────────────────────────────────────────────────────────────────────────
  const [certificates, setCertificates] = useState<CertificateItem[]>([]);
  const [loadingCertificates, setLoadingCertificates] = useState(true);
  const [certFilter, setCertFilter] = useState<string>("ALL");
  const [inspectingCert, setInspectingCert] = useState<CertificateItem | null>(null);
  const [eligibilityData, setEligibilityData] = useState<EligibilityData | null>(null);
  const [loadingEligibility, setLoadingEligibility] = useState(false);
  const [eligibilityModalError, setEligibilityModalError] = useState<string | null>(null);

  // Reject Certificate Modal
  const [rejectingCert, setRejectingCert] = useState<CertificateItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [submittingRejection, setSubmittingRejection] = useState(false);

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Oral Assessments & Rubrics State
  // ─────────────────────────────────────────────────────────────────────────────
  const [batches, setBatches] = useState<Batch[]>([]);
  const [assessments, setAssessments] = useState<OralAssessment[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [loadingAssessments, setLoadingAssessments] = useState(false);

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
  const [batchEnrolments, setBatchEnrolments] = useState<EnrolmentOption[]>([]);
  const [selectedEnrolmentId, setSelectedEnrolmentId] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [submittingSchedule, setSubmittingSchedule] = useState(false);
  const [scheduleModalError, setScheduleModalError] = useState<string | null>(null);

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Stage 5: Mission Statements Review Queue & Auto-Cert State
  // ─────────────────────────────────────────────────────────────────────────────
  const [missionStatements, setMissionStatements] = useState<MissionStatementItem[]>([]);
  const [loadingMissions, setLoadingMissions] = useState(false);
  const [missionFilter, setMissionFilter] = useState<string>("ALL");
  const [previewMissionDoc, setPreviewMissionDoc] = useState<MissionStatementItem | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState(false);

  const [approvingMission, setApprovingMission] = useState<MissionStatementItem | null>(null);
  const [approvalFeedback, setApprovalFeedback] = useState("");
  const [submittingApproval, setSubmittingApproval] = useState(false);

  const [rejectingMission, setRejectingMission] = useState<MissionStatementItem | null>(null);
  const [rejectionFeedback, setRejectionFeedback] = useState("");
  const [submittingMissionReject, setSubmittingMissionReject] = useState(false);

  // Load certificates and mission statements on mount
  useEffect(() => {
    fetchCertificates();
    loadBatches();
    loadMissionStatements();
  }, []);

  // Load assessments when selected batch changes
  useEffect(() => {
    if (!selectedBatchId) {
      setAssessments([]);
      return;
    }
    fetchAssessments(selectedBatchId);
  }, [selectedBatchId]);

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
      setCertificates(data);
    } catch (err: any) {
      setPageError(err.message || "Failed to load certificate requests");
    } finally {
      setLoadingCertificates(false);
    }
  }

  async function handleCertificateAction(id: string, action: "approve" | "issue") {
    try {
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

      setPageSuccess(
        `Certificate successfully ${action === "approve" ? "approved" : "issued"} and queued for PDF generation.`
      );
      await fetchCertificates();
    } catch (err: any) {
      setPageError(err.message || `Failed to ${action} certificate`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Mission Statements Queue & Reviews API Calls
  // ─────────────────────────────────────────────────────────────────────────────
  async function loadMissionStatements() {
    setLoadingMissions(true);
    try {
      const data = await fetchMissionStatements();
      setMissionStatements(data);
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
      setPageSuccess(
        `Mission statement for ${approvingMission.user?.name || "learner"} approved! Certificate has been automatically issued.`
      );
      setApprovingMission(null);
      setApprovalFeedback("");
      await loadMissionStatements();
      await fetchCertificates();
    } catch (err: any) {
      setPageError(err.message || "Failed to approve mission statement");
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
      setPageSuccess(
        `Mission statement revision requested for ${rejectingMission.user?.name || "learner"}.`
      );
      setRejectingMission(null);
      setRejectionFeedback("");
      await loadMissionStatements();
    } catch (err: any) {
      setPageError(err.message || "Failed to reject mission statement");
    } finally {
      setSubmittingMissionReject(false);
    }
  }

  async function handleOpenInspectEligibility(cert: CertificateItem) {
    setInspectingCert(cert);
    setEligibilityData(null);
    setEligibilityModalError(null);
    setLoadingEligibility(true);

    const enrolmentId = cert.enrolment?.id;
    if (!enrolmentId) {
      setEligibilityModalError("No valid enrolment ID attached to this certificate request.");
      setLoadingEligibility(false);
      return;
    }

    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_URL}/certificates/eligibility/${enrolmentId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Could not evaluate certificate eligibility gates"));
      }

      const data: EligibilityData = await res.json();
      setEligibilityData(data);
    } catch (err: any) {
      setEligibilityModalError(err.message || "Failed to load eligibility evaluation details");
    } finally {
      setLoadingEligibility(false);
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
      setPageSuccess("Certificate request has been marked as REJECTED with logged reason.");
      await fetchCertificates();
    } catch (err: any) {
      setPageError(err.message || "Failed to reject certificate");
    } finally {
      setSubmittingRejection(false);
    }
  }

  const handleDownloadPdf = async (certId: string, directUrl?: string | null) => {
    try {
      const res = await fetch(`${API_URL}/certificates/${certId}/pdf`);
      if (res.ok) {
        const data = await res.json();
        if (data.downloadUrl || data.pdfUrl) {
          window.open(data.downloadUrl || data.pdfUrl, "_blank");
          return;
        }
      }
      if (directUrl) {
        window.open(directUrl, "_blank");
      } else {
        alert("Official signed PDF is still being generated or is currently processing.");
      }
    } catch {
      if (directUrl) window.open(directUrl, "_blank");
    }
  };

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
        const data: Batch[] = await res.json();
        setBatches(data);
        if (data.length > 0) {
          const bParam = searchParams?.get("batchId") || selectedBatchId;
          if (bParam && data.some((b) => b.id === bParam)) {
            setSelectedBatchId(bParam);
          } else if (!selectedBatchId && data[0]) {
            setSelectedBatchId(data[0].id);
          }
        }
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingBatches(false);
    }
  }

  async function fetchAssessments(batchId: string) {
    setLoadingAssessments(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_URL}/oral-assessments/batches/${batchId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data: OralAssessment[] = await res.json();
        setAssessments(data);
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
    setPageSuccess(
      `Oral assessment successfully graded (${passed ? "PASSED" : "RETRY REQUIRED"}, ${calculatedPercent}%).`
    );
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

      fetchAssessments(selectedBatchId);
    } catch (err: any) {
      setPageError(err.message || "Failed to submit grade evaluation");
    } finally {
      setSubmittingGrade(false);
    }
  }

  async function handleOpenScheduleModal() {
    setIsScheduleModalOpen(true);
    setScheduleModalError(null);
    setBatchEnrolments([]);
    setSelectedEnrolmentId("");

    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_URL}/admin/enrolments?batchId=${selectedBatchId}&limit=100`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const json = await res.json();
        const enrs = json.data || json || [];
        setBatchEnrolments(enrs);
        if (enrs.length > 0 && enrs[0]) {
          setSelectedEnrolmentId(enrs[0].id);
        }
      }
    } catch {
      setScheduleModalError("Failed to fetch learners in batch.");
    }
  }

  async function handleSubmitSchedule(e: FormEvent) {
    e.preventDefault();
    if (!selectedEnrolmentId || !selectedBatchId) return;

    const currentBatch = batches.find((b) => b.id === selectedBatchId);
    if (!currentBatch) return;

    setSubmittingSchedule(true);
    setScheduleModalError(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const payload = {
        enrolmentId: selectedEnrolmentId,
        programId: currentBatch.programId,
        scheduledDate: scheduledDate ? new Date(scheduledDate).toISOString() : undefined,
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
      setPageSuccess("Oral assessment successfully scheduled.");
      await fetchAssessments(selectedBatchId);
    } catch (err: any) {
      setScheduleModalError(err.message);
    } finally {
      setSubmittingSchedule(false);
    }
  }

  // Filtered certificates
  const filteredCertificates = certificates.filter((c) => {
    const certBatchId = c.enrolment?.batch?.id || (c.enrolment as any)?.batchId;
    if (selectedBatchId && certBatchId !== selectedBatchId) {
      return false;
    }
    if (certFilter === "ALL") return true;
    return c.status === certFilter;
  });

  const pendingCount = certificates.filter((c) => {
    const certBatchId = c.enrolment?.batch?.id || (c.enrolment as any)?.batchId;
    if (selectedBatchId && certBatchId !== selectedBatchId) return false;
    return c.status === "PENDING";
  }).length;
  const approvedCount = certificates.filter((c) => {
    const certBatchId = c.enrolment?.batch?.id || (c.enrolment as any)?.batchId;
    if (selectedBatchId && certBatchId !== selectedBatchId) return false;
    return c.status === "APPROVED";
  }).length;
  const issuedCount = certificates.filter((c) => {
    const certBatchId = c.enrolment?.batch?.id || (c.enrolment as any)?.batchId;
    if (selectedBatchId && certBatchId !== selectedBatchId) return false;
    return c.status === "ISSUED";
  }).length;

  const pendingMissionsCount = missionStatements.filter((m) => {
    const missionBatchId = m.enrolment?.batch?.id || (m.enrolment as any)?.batchId;
    if (selectedBatchId && missionBatchId !== selectedBatchId) return false;
    return m.status === "SUBMITTED";
  }).length;
  const filteredMissions = missionStatements.filter((m) => {
    const missionBatchId = m.enrolment?.batch?.id || (m.enrolment as any)?.batchId;
    if (selectedBatchId && missionBatchId !== selectedBatchId) {
      return false;
    }
    if (missionFilter === "ALL") return true;
    return m.status === missionFilter;
  });
  const marketingBase = process.env.NEXT_PUBLIC_MARKETING_URL || "http://localhost:3000";

  return (
    <div className={styles.dashboard}>
      {/* ─────────────────────────────────────────────────────────────────────────────
          PAGE HEADER & TAB SWITCHER
         ───────────────────────────────────────────────────────────────────────────── */}
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Approvals &amp; Certification Gates</h1>
          {/* <p className={styles.subtitle}>
            Audit learner progression eligibility, approve completion certificates, and conduct live oral competency assessments.
          </p> */}
        </div>

        <div className={styles.headerActions}>
          {activeTab === "certificates" ? (
            <Link href="/certificates/issue" className={styles.primaryBtn}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="8" r="6" />
                <path d="M15.4 13.8L18 22l-6-3-6 3 2.6-8.2" />
              </svg>
              <span>Issue Certificates</span>
            </Link>
          ) : activeTab === "coaching" ? (
            <Link href="/meetings" className={styles.primaryBtn} style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span>Open Admin Calendar &rarr;</span>
            </Link>
          ) : activeTab === "oral" ? (
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={handleOpenScheduleModal}
              disabled={!selectedBatchId}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span>Schedule Oral Assessment</span>
            </button>
          ) : (
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={loadMissionStatements}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10"></polyline>
                <polyline points="1 20 1 14 7 14"></polyline>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
              </svg>
              <span>Refresh Queue</span>
            </button>
          )}
        </div>
      </header>

      {/* Global Page Alerts */}
      {pageError && (
        <div style={{
          backgroundColor: "#fef2f2",
          border: "1px solid #fecaca",
          color: "#991b1b",
          padding: "12px 16px",
          borderRadius: "8px",
          marginBottom: "1.25rem",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          fontSize: "0.88rem"
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>{pageError}</span>
        </div>
      )}

      {pageSuccess && (
        <div style={{
          backgroundColor: "#f0fdf4",
          border: "1px solid #bbf7d0",
          color: "#166534",
          padding: "12px 16px",
          borderRadius: "8px",
          marginBottom: "1.25rem",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          fontSize: "0.88rem"
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          <span>{pageSuccess}</span>
        </div>
      )}

      {pendingCoachingCount > 0 && activeTab !== "coaching" && (
        <div style={{
          background: "#fffbeb",
          border: "1px solid #fde68a",
          borderRadius: 8,
          padding: "10px 16px",
          marginBottom: "1rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
        }}>
          <span style={{ fontSize: "0.88rem", color: "#92400e", fontWeight: 600 }}>
            ⚡ You have {pendingCoachingCount} pending 1-on-1 Coaching Session request{pendingCoachingCount > 1 ? "s" : ""} awaiting review &amp; slot scheduling.
          </span>
          <button
            type="button"
            onClick={() => setActiveTab("coaching")}
            style={{
              background: "#b8860b",
              color: "#ffffff",
              border: "none",
              padding: "6px 14px",
              borderRadius: 6,
              fontSize: "0.82rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Review Coaching Requests &rarr;
          </button>
        </div>
      )}

      {/* Primary Tab Bar */}
      <div style={{
        display: "flex",
        gap: "12px",
        borderBottom: "1px solid var(--border-light)",
        marginBottom: "1.5rem",
        paddingBottom: "4px"
      }}>
        <button
          type="button"
          onClick={() => setActiveTab("certificates")}
          style={{
            background: "transparent",
            border: "none",
            borderBottom: activeTab === "certificates" ? "3px solid #b8860b" : "3px solid transparent",
            padding: "8px 18px",
            fontSize: "0.95rem",
            fontWeight: activeTab === "certificates" ? 700 : 500,
            color: activeTab === "certificates" ? "var(--text-primary)" : "var(--text-muted)",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            transition: "all 0.15s ease"
          }}
        >
          <span>Certificate Approvals &amp; Eligibility</span>
          {pendingCount > 0 && (
            <span style={{
              background: "#b8860b",
              color: "#ffffff",
              fontSize: "0.75rem",
              fontWeight: 700,
              padding: "2px 7px",
              borderRadius: "10px"
            }}>
              {pendingCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("coaching")}
          style={{
            background: "transparent",
            border: "none",
            borderBottom: activeTab === "coaching" ? "3px solid #b8860b" : "3px solid transparent",
            padding: "8px 18px",
            fontSize: "0.95rem",
            fontWeight: activeTab === "coaching" ? 700 : 500,
            color: activeTab === "coaching" ? "var(--text-primary)" : "var(--text-muted)",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            transition: "all 0.15s ease"
          }}
        >
          <span>1-on-1 Coaching (Stage 4)</span>
          {pendingCoachingCount > 0 && (
            <span style={{
              background: "#b8860b",
              color: "#ffffff",
              fontSize: "0.75rem",
              fontWeight: 700,
              padding: "2px 7px",
              borderRadius: "10px"
            }}>
              {pendingCoachingCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("oral")}
          style={{
            background: "transparent",
            border: "none",
            borderBottom: activeTab === "oral" ? "3px solid #b8860b" : "3px solid transparent",
            padding: "8px 18px",
            fontSize: "0.95rem",
            fontWeight: activeTab === "oral" ? 700 : 500,
            color: activeTab === "oral" ? "var(--text-primary)" : "var(--text-muted)",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            transition: "all 0.15s ease"
          }}
        >
          <span>Oral Assessments &amp; Rubrics</span>
          <span style={{
            background: "var(--border-light)",
            color: "var(--text-secondary)",
            fontSize: "0.75rem",
            fontWeight: 600,
            padding: "2px 7px",
            borderRadius: "10px"
          }}>
            {assessments.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("missions")}
          style={{
            background: "transparent",
            border: "none",
            borderBottom: activeTab === "missions" ? "3px solid #b8860b" : "3px solid transparent",
            padding: "8px 18px",
            fontSize: "0.95rem",
            fontWeight: activeTab === "missions" ? 700 : 500,
            color: activeTab === "missions" ? "var(--text-primary)" : "var(--text-muted)",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            transition: "all 0.15s ease"
          }}
        >
          <span>Mission Statements (Stage 5)</span>
          {pendingMissionsCount > 0 && (
            <span style={{
              background: "#b8860b",
              color: "#ffffff",
              fontSize: "0.75rem",
              fontWeight: 700,
              padding: "2px 7px",
              borderRadius: "10px"
            }}>
              {pendingMissionsCount}
            </span>
          )}
        </button>
      </div>

      {/* Batch Pre-Filter Banner (when arrived from a learner profile or batch link) */}
      {selectedBatchId && (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.65rem 1rem",
          background: "#fef3c7",
          border: "1px solid #fde68a",
          borderRadius: "8px",
          marginBottom: "1rem",
          fontSize: "0.8125rem",
          color: "#92400e",
          gap: "0.75rem",
          flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            <span>
              Showing learners from batch: <strong>{batches.find((b) => b.id === selectedBatchId)?.name || "Selected Batch"}</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSelectedBatchId("")}
            style={{
              background: "transparent",
              border: "none",
              color: "#b45309",
              fontWeight: 700,
              cursor: "pointer",
              textDecoration: "none",
              fontSize: "0.78rem",
            }}
          >
            Show All Batches ✕
          </button>
        </div>
      )}

      {activeTab === "coaching" && (
        <CoachingApprovalsTab
          onError={(msg) => setPageError(msg)}
          onSuccess={(msg) => setPageSuccess(msg)}
          onPendingCountChange={(cnt) => setPendingCoachingCount(cnt)}
          batchId={selectedBatchId}
        />
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          TAB 1: CERTIFICATE APPROVALS QUEUE & ELIGIBILITY GATE
         ───────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "certificates" && (
        <div>
          {/* Status Filter Buttons */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "1.25rem", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)", marginRight: "4px" }}>
              Filter Queue:
            </span>
            {[
              { id: "ALL", label: `All Requests (${certificates.length})` },
              { id: "PENDING", label: `Pending Approvals (${pendingCount})` },
              { id: "APPROVED", label: `Approved / Ready to Issue (${approvedCount})` },
              { id: "ISSUED", label: `Issued (${issuedCount})` },
              { id: "REJECTED", label: "Rejected" },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setCertFilter(f.id)}
                style={{
                  padding: "5px 12px",
                  borderRadius: "20px",
                  fontSize: "0.82rem",
                  fontWeight: certFilter === f.id ? 700 : 500,
                  border: certFilter === f.id ? "1px solid #b8860b" : "1px solid var(--border-light)",
                  background: certFilter === f.id ? "#fef9c3" : "var(--bg-card)",
                  color: certFilter === f.id ? "#854d0e" : "var(--text-secondary)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          <section className={styles.tableSection}>
            <div className={styles.sectionHeader}>
              <h2>Learner Certificate Approvals ({filteredCertificates.length})</h2>
            </div>

            <div className={styles.tableWrapper}>
              <table className={styles.adminTable}>
                <thead>
                  <tr>
                    <th>Learner</th>
                    <th>Program &amp; Batch</th>
                    <th>Request Date</th>
                    <th>Eligibility Gate</th>
                    <th>Status</th>
                    <th className={styles.alignRight}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingCertificates ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", padding: "36px", color: "var(--text-secondary)" }}>
                        Loading certificate approval queue...
                      </td>
                    </tr>
                  ) : filteredCertificates.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", padding: "36px", color: "var(--text-secondary)" }}>
                        No certificate requests matching filter &quot;{certFilter}&quot;.
                      </td>
                    </tr>
                  ) : (
                    filteredCertificates.map((cert) => {
                      const learnerName = cert.enrolment?.user?.name || "Unknown Learner";
                      const learnerEmail = cert.enrolment?.user?.email || "";
                      const programTitle = cert.enrolment?.batch?.program?.title || cert.enrolment?.program?.title || "11 Steps Programme";
                      const batchName = cert.enrolment?.batch?.name;

                      return (
                        <tr key={cert.id}>
                          <td>
                            <div>
                              <span className={styles.cellUserName}>{learnerName}</span>
                              {learnerEmail && <div className={styles.cellUserEmail}>{learnerEmail}</div>}
                            </div>
                          </td>
                          <td>
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                              <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.875rem" }}>
                                {programTitle}
                              </span>
                              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                                {batchName ? `Batch: ${batchName}` : "Direct Enrolment"}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className={styles.cellTextMuted}>
                              {new Date(cert.createdAt).toLocaleDateString()}
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              onClick={() => handleOpenInspectEligibility(cert)}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                                padding: "4px 10px",
                                borderRadius: "6px",
                                fontSize: "0.8rem",
                                fontWeight: 600,
                                background: "#f8fafc",
                                border: "1px solid #cbd5e1",
                                color: "#334155",
                                cursor: "pointer",
                              }}
                              title="Audit all 6 eligibility criteria for this learner"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                              </svg>
                              <span>Audit Gate Criteria</span>
                            </button>
                          </td>
                          <td>
                            <StatusBadge status={cert.status} />
                            {cert.certificateCode && (
                              <div style={{ marginTop: "4px" }}>
                                <code style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                  {cert.certificateCode}
                                </code>
                              </div>
                            )}
                          </td>
                          <td className={styles.alignRight}>
                            {cert.status === "PENDING" && (
                              <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                                <button
                                  type="button"
                                  className={styles.primaryBtnSmall}
                                  onClick={() => handleCertificateAction(cert.id, "approve")}
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  className={styles.dangerBtnSmall}
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
                                  onClick={() => handleCertificateAction(cert.id, "issue")}
                                >
                                  Issue Certificate
                                </button>
                                <Link href={`/certificates/${cert.id}`} className={styles.secondaryBtnSmall}>
                                  Preview
                                </Link>
                              </div>
                            )}
                            {cert.status === "ISSUED" && (
                              <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
                                <button
                                  type="button"
                                  className={styles.secondaryBtnSmall}
                                  onClick={() => handleDownloadPdf(cert.id, cert.pdfUrl)}
                                  title="Download official signed PDF"
                                >
                                  PDF
                                </button>
                                <a
                                  href={`${marketingBase}/verify/${cert.certificateCode || cert.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={styles.secondaryBtnSmall}
                                  title="Open public verification page"
                                >
                                  Verify ↗
                                </a>
                                <a
                                  href={`https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent(
                                    `${programTitle} Certification`
                                  )}&organizationName=whatboutme&issueYear=${new Date(cert.issueDate || cert.createdAt).getFullYear()}&issueMonth=${new Date(cert.issueDate || cert.createdAt).getMonth() + 1}&certUrl=${encodeURIComponent(
                                    `${marketingBase}/verify/${cert.certificateCode || cert.id}`
                                  )}&certId=${encodeURIComponent(cert.certificateCode || cert.id)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={styles.secondaryBtnSmall}
                                  style={{ color: "#0a66c2", borderColor: "#0a66c2" }}
                                  title="Add to LinkedIn profile"
                                >
                                  LinkedIn
                                </a>
                                <Link href={`/certificates/${cert.id}`} className={styles.secondaryBtnSmall}>
                                  View
                                </Link>
                              </div>
                            )}
                            {cert.status === "REJECTED" && (
                              <span className={styles.cellTextMuted} style={{ fontSize: "0.8rem" }}>
                                {cert.rejectionReason || "Rejected by administrator"}
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
          </section>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          TAB 2: ORAL ASSESSMENTS & RUBRICS
         ───────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "oral" && (
        <div>
          {/* Cohort Selector */}
          <div style={{
            marginBottom: "1.5rem",
            display: "flex",
            alignItems: "center",
            gap: "14px",
            background: "var(--bg-card)",
            padding: "14px 18px",
            borderRadius: "12px",
            border: "1px solid var(--border-light)",
            boxShadow: "var(--shadow-sm)",
            flexWrap: "wrap"
          }}>
            <label htmlFor="cohort-select" style={{ fontWeight: 600, fontSize: "0.88rem", color: "var(--text-secondary)" }}>
              Batch:
            </label>
            <CustomSelect
              id="cohort-select"
              value={selectedBatchId}
              onChange={setSelectedBatchId}
              disabled={loadingBatches}
              minWidth="280px"
              ariaLabel="Select Batch"
              options={batches.map((batch) => ({
                value: batch.id,
                label: `${batch.name}${batch.program?.title ? ` (${batch.program.title})` : ""}`,
              }))}
            />
            <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
              {assessments.length} assessment record{assessments.length !== 1 ? "s" : ""} in this batch
            </span>
          </div>

          {/* Assessments Table */}
          <section className={styles.tableSection}>
            <div className={styles.sectionHeader}>
              <h2>Oral Assessments Queue</h2>
            </div>

            <div className={styles.tableWrapper}>
              <table className={styles.adminTable}>
                <thead>
                  <tr>
                    <th>Learner</th>
                    <th>Scheduled Date</th>
                    <th>Assessor</th>
                    <th>Overall Score</th>
                    <th>Status</th>
                    <th>Graded At</th>
                    <th className={styles.alignRight}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingAssessments ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", padding: "36px", color: "var(--text-secondary)" }}>
                        Loading oral assessments from backend...
                      </td>
                    </tr>
                  ) : assessments.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", padding: "36px", color: "var(--text-secondary)" }}>
                        No oral assessments found for this batch. Click <strong>Schedule Oral Assessment</strong> to assign one to an enrolled learner.
                      </td>
                    </tr>
                  ) : (
                    assessments.map((a) => {
                      const learnerName = a.enrolment?.user?.name || "Enrolled Learner";
                      const learnerEmail = a.enrolment?.user?.email || "";
                      const assessorName = a.assessor?.name || "Unassigned";
                      const statusClass = a.status === "PASSED" ? styles.passed : a.status === "FAILED" ? styles.failed : styles.scheduled;

                      return (
                        <tr key={a.id}>
                          <td>
                            <div>
                              <span className={styles.cellUserName}>{learnerName}</span>
                              {learnerEmail && <div className={styles.cellUserEmail}>{learnerEmail}</div>}
                            </div>
                          </td>
                          <td>
                            <span className={styles.cellText}>
                              {a.scheduledDate ? new Date(a.scheduledDate).toLocaleDateString() : "TBD"}
                            </span>
                          </td>
                          <td>
                            <span className={styles.cellText}>{assessorName}</span>
                          </td>
                          <td>
                            {a.overallScore !== null ? (
                              <span style={{ fontWeight: 700, fontSize: "0.95rem", color: a.overallScore >= 75 ? "#166534" : "#991b1b" }}>
                                {a.overallScore}%
                              </span>
                            ) : (
                              <span className={styles.cellTextMuted}>Ungraded</span>
                            )}
                          </td>
                          <td>
                            <span className={`${styles.statusChip} ${statusClass}`}>
                              {a.status}
                            </span>
                          </td>
                          <td>
                            <span className={styles.cellTextMuted}>
                              {a.gradedAt ? new Date(a.gradedAt).toLocaleDateString() : "—"}
                            </span>
                          </td>
                          <td className={styles.alignRight}>
                            <button
                              type="button"
                              onClick={() => handleOpenGrading(a)}
                              className={styles.secondaryBtnSmall}
                            >
                              {a.status === "SCHEDULED" ? "Grade Assessment" : "Re-evaluate"}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          TAB 3: MISSION STATEMENTS (STAGE 5 SUBMISSIONS & REVIEWS)
         ───────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "missions" && (
        <div>
          {/* Header context description matching student portal wording */}
          <div style={{
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: "10px",
            padding: "1rem 1.25rem",
            marginBottom: "1.25rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "10px",
          }}>
            <div>
              <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#b45309", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Final Requirement · Personal Commitment (Stage 5)
              </div>
              <h3 style={{ margin: "4px 0 2px", fontSize: "1.05rem", color: "#78350f", fontWeight: 800 }}>
                Handwritten Mission Statement Approval Queue
              </h3>
              <p style={{ margin: 0, fontSize: "0.84rem", color: "#92400e" }}>
                Learners upload their handwritten &amp; signed personal Mission Statement after completing 1-on-1 coaching. Approving a submission marks Stage 5 Complete and automatically generates their verified graduation certificate.
              </p>
            </div>
            {pendingMissionsCount > 0 && (
              <span style={{
                background: "#fef3c7",
                border: "1px solid #f59e0b",
                color: "#92400e",
                fontWeight: 700,
                fontSize: "0.82rem",
                padding: "4px 10px",
                borderRadius: "20px",
              }}>
                {pendingMissionsCount} Awaiting Coach Review
              </span>
            )}
          </div>

          {/* Submissions Filter Toolbar */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            marginBottom: "1.25rem",
            flexWrap: "wrap",
          }}>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {["ALL", "SUBMITTED", "APPROVED", "REJECTED"].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setMissionFilter(st)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "20px",
                    border: "1px solid",
                    borderColor: missionFilter === st ? "#b8860b" : "var(--border-light)",
                    background: missionFilter === st ? "#b8860b" : "var(--bg-card)",
                    color: missionFilter === st ? "#ffffff" : "var(--text-secondary)",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {st === "ALL"
                    ? `All (${missionStatements.length})`
                    : st === "SUBMITTED"
                    ? `Pending Review (${pendingMissionsCount})`
                    : st === "APPROVED"
                    ? `Approved (${missionStatements.filter((m) => m.status === "APPROVED").length})`
                    : `Revision Requested (${missionStatements.filter((m) => m.status === "REJECTED").length})`}
                </button>
              ))}
            </div>

            <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
              {filteredMissions.length} submission{filteredMissions.length === 1 ? "" : "s"} shown
            </div>
          </div>

          <section className={styles.tableCard}>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Learner</th>
                    <th>Program &amp; Batch</th>
                    <th>Version</th>
                    <th>Document</th>
                    <th>Submitted At</th>
                    <th>Status</th>
                    <th>Reviewer &amp; Feedback</th>
                    <th className={styles.alignRight}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingMissions ? (
                    <tr>
                      <td colSpan={8} className={styles.emptyState}>
                        Loading mission statements...
                      </td>
                    </tr>
                  ) : filteredMissions.length === 0 ? (
                    <tr>
                      <td colSpan={8} className={styles.emptyState}>
                        No mission statement submissions found for this filter.
                      </td>
                    </tr>
                  ) : (
                    filteredMissions.map((m) => {
                      const fileLink = (m.fileUrl.startsWith("http") || m.fileUrl.startsWith("data:"))
                        ? m.fileUrl
                        : `${API_URL}/mission-statements/${m.id}/file`;
                      const sizeMb = (m.sizeBytes / (1024 * 1024)).toFixed(2);

                      return (
                        <tr key={m.id}>
                          <td>
                            <strong className={styles.cellTextPrimary}>
                              {m.user?.name || "Learner"}
                            </strong>
                            <div className={styles.cellTextMuted}>{m.user?.email}</div>
                          </td>
                          <td>
                            <span className={styles.cellText}>
                              {m.enrolment?.program?.title || "Program"}
                            </span>
                            {m.enrolment?.batch?.name && (
                              <div className={styles.cellTextMuted}>
                                Batch: {m.enrolment.batch.name}
                              </div>
                            )}
                          </td>
                          <td>
                            <span style={{
                              display: "inline-block",
                              padding: "2px 8px",
                              borderRadius: "12px",
                              background: "#f1f5f9",
                              color: "#334155",
                              fontWeight: 700,
                              fontSize: "0.78rem"
                            }}>
                              v{m.version}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
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
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  color: "#b8860b",
                                  fontWeight: 700,
                                  fontSize: "0.84rem",
                                  textAlign: "left",
                                }}
                                title="Click to preview handwritten manifesto"
                              >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                  <circle cx="12" cy="12" r="3" />
                                </svg>
                                <span style={{ maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {m.fileName}
                                </span>
                              </button>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                <span>{sizeMb} MB · {m.mimeType.split("/")[1]?.toUpperCase() || "PDF"}</span>
                                <span>·</span>
                                <a
                                  href={fileLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ color: "#0284c7", textDecoration: "underline", fontWeight: 600 }}
                                  title="Open in new browser tab"
                                >
                                  Open Tab &nearr;
                                </a>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={styles.cellTextMuted}>
                              {new Date(m.createdAt).toLocaleDateString()}
                            </span>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                              {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </div>
                          </td>
                          <td>
                            <StatusBadge status={m.status === "SUBMITTED" ? "PENDING" : m.status} />
                          </td>
                          <td>
                            {m.reviewer ? (
                              <div>
                                <span className={styles.cellText} style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                                  {m.reviewer.name}
                                </span>
                                {m.feedback && (
                                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontStyle: "italic", maxWidth: "220px" }}>
                                    "{m.feedback}"
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className={styles.cellTextMuted} style={{ fontSize: "0.8rem" }}>
                                Awaiting Review
                              </span>
                            )}
                          </td>
                          <td className={styles.alignRight}>
                            {m.status === "SUBMITTED" ? (
                              <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
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
                                  Request Revisions
                                </button>
                              </div>
                            ) : m.status === "APPROVED" ? (
                              <span style={{ fontSize: "0.8rem", color: "#166534", fontWeight: 700 }}>
                                ✓ Cert Auto-Issued
                              </span>
                            ) : (
                              <span style={{ fontSize: "0.8rem", color: "#991b1b", fontWeight: 600 }}>
                                Revisions Sent
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
          </section>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          ELIGIBILITY GATE INSPECTION MODAL
         ───────────────────────────────────────────────────────────────────────────── */}
      {inspectingCert && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent} style={{ maxWidth: "680px" }}>
            <div className={styles.modalHeader}>
              <div>
                <h2>Certificate Eligibility Gate Audit</h2>
                <p className={styles.modalIntro}>
                  Learner: {inspectingCert.enrolment?.user?.name || "Learner"} ({inspectingCert.enrolment?.user?.email})
                </p>
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setInspectingCert(null)}
                aria-label="Close modal"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <div style={{ padding: "1.25rem" }}>
              {loadingEligibility ? (
                <div style={{ textAlign: "center", padding: "30px", color: "var(--text-muted)" }}>
                  Evaluating live curriculum gates against learner progression...
                </div>
              ) : eligibilityModalError ? (
                <div style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", padding: "12px", borderRadius: "8px" }}>
                  {eligibilityModalError}
                </div>
              ) : eligibilityData ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  {/* Overall Result Banner */}
                  <div style={{
                    padding: "12px 16px",
                    borderRadius: "8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    backgroundColor: eligibilityData.isEligible ? "#f0fdf4" : "#fef2f2",
                    border: eligibilityData.isEligible ? "1px solid #bbf7d0" : "1px solid #fecaca",
                    color: eligibilityData.isEligible ? "#166534" : "#991b1b",
                  }}>
                    <div>
                      <strong style={{ fontSize: "0.95rem" }}>
                        Overall Status: {eligibilityData.isEligible ? "ELIGIBLE FOR CERTIFICATION" : "NOT YET ELIGIBLE"}
                      </strong>
                      <div style={{ fontSize: "0.8rem", opacity: 0.9 }}>
                        Track: {eligibilityData.certificateType}
                      </div>
                    </div>
                    <span style={{
                      fontWeight: 700,
                      fontSize: "0.8rem",
                      padding: "4px 10px",
                      borderRadius: "12px",
                      background: eligibilityData.isEligible ? "#166534" : "#991b1b",
                      color: "#ffffff"
                    }}>
                      {eligibilityData.isEligible ? "PASSED ALL GATES" : "GATE LOCKS ACTIVE"}
                    </span>
                  </div>

                  {/* 5-Stage Sequential Progression Pipeline Flow Visualizer */}
                  {inspectingCert.enrolment?.id && (
                    <LearnerPortalFlow
                      enrolmentId={inspectingCert.enrolment.id}
                      learnerName={inspectingCert.enrolment.user?.name}
                    />
                  )}

                  {/* Gate Verification Checklist */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {/* Gate 1: 11 Steps */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: "8px", border: "1px solid var(--border-light)", background: "var(--bg-main)" }}>
                      <div>
                        <strong style={{ fontSize: "0.88rem", color: "var(--text-primary)" }}>1. Program Steps Completion</strong>
                        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                          {eligibilityData.steps.completed} / {eligibilityData.steps.required} Steps Completed
                        </div>
                      </div>
                      <span style={{ fontSize: "0.85rem", fontWeight: 700, color: eligibilityData.steps.isMet ? "#166534" : "#dc2626" }}>
                        {eligibilityData.steps.isMet ? "✓ COMPLETED" : "✗ INCOMPLETE"}
                      </span>
                    </div>

                    {/* Gate 2: Step Quizzes */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: "8px", border: "1px solid var(--border-light)", background: "var(--bg-main)" }}>
                      <div>
                        <strong style={{ fontSize: "0.88rem", color: "var(--text-primary)" }}>2. Step Quizzes (All 11)</strong>
                        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                          {eligibilityData.quizzes.passed} / {eligibilityData.quizzes.required} Quizzes Passed
                        </div>
                      </div>
                      <span style={{ fontSize: "0.85rem", fontWeight: 700, color: eligibilityData.quizzes.isMet ? "#166534" : "#dc2626" }}>
                        {eligibilityData.quizzes.isMet ? "✓ PASSED" : "✗ PENDING"}
                      </span>
                    </div>

                    {/* Gate 3: Final Exam */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: "8px", border: "1px solid var(--border-light)", background: "var(--bg-main)" }}>
                      <div>
                        <strong style={{ fontSize: "0.88rem", color: "var(--text-primary)" }}>3. Final 50-Question Exam</strong>
                        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                          {eligibilityData.finalExam.required ? `Score: ${eligibilityData.finalExam.score !== null ? `${eligibilityData.finalExam.score}%` : "No attempt"}` : "Exempt / Not required for this track"}
                        </div>
                      </div>
                      <span style={{ fontSize: "0.85rem", fontWeight: 700, color: eligibilityData.finalExam.isMet ? "#166534" : "#dc2626" }}>
                        {eligibilityData.finalExam.isMet ? "✓ PASSED" : "✗ FAILED / PENDING"}
                      </span>
                    </div>

                    {/* Gate 4: Oral Assessment */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: "8px", border: "1px solid var(--border-light)", background: "var(--bg-main)" }}>
                      <div>
                        <strong style={{ fontSize: "0.88rem", color: "var(--text-primary)" }}>4. Live Oral Assessment Interview</strong>
                        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                          {eligibilityData.oralAssessment.required ? `Score: ${eligibilityData.oralAssessment.score !== null ? `${eligibilityData.oralAssessment.score}%` : "Ungraded"}` : "Exempt / Not required"}
                        </div>
                      </div>
                      <span style={{ fontSize: "0.85rem", fontWeight: 700, color: eligibilityData.oralAssessment.isMet ? "#166534" : "#dc2626" }}>
                        {eligibilityData.oralAssessment.isMet ? "✓ PASSED" : "✗ NOT PASSED"}
                      </span>
                    </div>

                    {/* Gate 5: Attendance Compliance */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: "8px", border: "1px solid var(--border-light)", background: "var(--bg-main)" }}>
                      <div>
                        <strong style={{ fontSize: "0.88rem", color: "var(--text-primary)" }}>5. Session Attendance Percentage</strong>
                        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                          {Math.round(eligibilityData.attendance.attendancePercentage)}% Attended (Threshold: {eligibilityData.attendance.thresholdUsed}%)
                        </div>
                      </div>
                      <span style={{ fontSize: "0.85rem", fontWeight: 700, color: eligibilityData.attendance.isMet ? "#166534" : "#dc2626" }}>
                        {eligibilityData.attendance.isMet ? "✓ COMPLIANT" : "✗ BELOW THRESHOLD"}
                      </span>
                    </div>

                    {/* Gate 6: Closing Call */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: "8px", border: "1px solid var(--border-light)", background: "var(--bg-main)" }}>
                      <div>
                        <strong style={{ fontSize: "0.88rem", color: "var(--text-primary)" }}>6. 1-on-1 Closing Call</strong>
                        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                          Closing session with lead facilitator
                        </div>
                      </div>
                      <span style={{ fontSize: "0.85rem", fontWeight: 700, color: eligibilityData.closingCall.isMet ? "#166534" : "#dc2626" }}>
                        {eligibilityData.closingCall.isMet ? "✓ COMPLETED" : "✗ PENDING"}
                      </span>
                    </div>
                  </div>

                  {/* Unmet Requirements List if any */}
                  {eligibilityData.unmetRequirements && eligibilityData.unmetRequirements.length > 0 && (
                    <div style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca", padding: "12px 16px", borderRadius: "8px" }}>
                      <strong style={{ color: "#991b1b", fontSize: "0.85rem", display: "block", marginBottom: "6px" }}>
                        Blocking Requirements to Resolve:
                      </strong>
                      <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "0.82rem", color: "#b91c1c" }}>
                        {eligibilityData.unmetRequirements.map((unmet, i) => (
                          <li key={i}>{unmet}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : null}

              <div style={{ marginTop: "1.25rem", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setInspectingCert(null)}
                >
                  Close
                </button>
                {inspectingCert.status === "PENDING" && eligibilityData?.isEligible && (
                  <button
                    type="button"
                    className={styles.primaryBtn}
                    onClick={() => {
                      setInspectingCert(null);
                      handleCertificateAction(inspectingCert.id, "approve");
                    }}
                  >
                    Approve Certificate Now
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          CERTIFICATE REJECTION REASON MODAL
         ───────────────────────────────────────────────────────────────────────────── */}
      {rejectingCert && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent} style={{ maxWidth: "480px" }}>
            <div className={styles.modalHeader}>
              <div>
                <h2>Reject Certificate Request</h2>
                <p className={styles.modalIntro}>
                  Learner: {rejectingCert.enrolment?.user?.name} ({rejectingCert.enrolment?.user?.email})
                </p>
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setRejectingCert(null)}
                disabled={submittingRejection}
                aria-label="Close modal"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmitRejection} className={styles.modalForm}>
              <div className={styles.formGroup}>
                <label htmlFor="reason" style={{ color: "#991b1b" }}>
                  Mandatory Logged Rejection Reason *
                </label>
                <textarea
                  id="reason"
                  rows={3}
                  placeholder="Specify why this certificate request is being rejected (e.g. step quiz score below threshold, incomplete attendance)..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  required
                />
              </div>

              <div className={styles.modalFooter}>
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
                  style={{ padding: "8px 16px", fontSize: "0.88rem" }}
                  disabled={submittingRejection || !rejectionReason.trim()}
                >
                  {submittingRejection ? "Rejecting..." : "Confirm Rejection"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          ORAL GRADING MODAL
         ───────────────────────────────────────────────────────────────────────────── */}
      {gradingAssessment && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent} style={{ maxWidth: "680px" }}>
            <div className={styles.modalHeader}>
              <div>
                <h2>Oral Competency Evaluation</h2>
                <p className={styles.modalIntro}>
                  Learner: {gradingAssessment.enrolment?.user?.name || "Learner"} ({gradingAssessment.enrolment?.user?.email})
                </p>
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setGradingAssessment(null)}
                disabled={submittingGrade}
                aria-label="Close modal"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmitGrade} className={styles.modalForm}>
              {gradeModalError && (
                <div style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", padding: "10px 14px", borderRadius: "8px", fontSize: "0.85rem" }}>
                  {gradeModalError}
                </div>
              )}

              {/* Rubric Category Scores */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <h3 style={{ fontSize: "0.95rem", margin: 0, fontWeight: 700, color: "var(--text-primary)" }}>
                    Rubric Scoring Criteria
                  </h3>
                  <button
                    type="button"
                    onClick={handleAddRubricItem}
                    className={styles.secondaryBtnSmall}
                    style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
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
                        backgroundColor: "var(--bg-main)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
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
                          style={{ fontWeight: 600, fontSize: "0.88rem", border: "none", background: "transparent", color: "var(--text-primary)", width: "70%" }}
                          required
                        />
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <input
                            type="number"
                            min={0}
                            max={item.maxScore}
                            value={item.score}
                            onChange={(e) => handleScoreChange(idx, parseInt(e.target.value, 10) || 0)}
                            style={{ width: "52px", padding: "4px 8px", textAlign: "center", borderRadius: "6px", border: "1px solid var(--border-light)", background: "var(--bg-card)" }}
                            required
                          />
                          <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>/ {item.maxScore}</span>
                          {rubricScores.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveRubricItem(idx)}
                              className={styles.dangerBtnSmall}
                              style={{ padding: "4px 6px", marginLeft: "4px" }}
                              title="Remove criterion"
                              aria-label="Remove criterion"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
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
                        style={{ width: "100%", padding: "6px 10px", fontSize: "0.82rem", borderRadius: "6px", border: "1px solid var(--border-light)", background: "var(--bg-card)" }}
                      />
                    </div>
                  ))}
                </div>

                {/* Real-time score calculator */}
                <div style={{ marginTop: "10px", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "var(--bg-card)", border: "1px solid var(--border-light)", borderRadius: "8px" }}>
                  <span style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                    Aggregate Rubric Score:
                  </span>
                  <strong style={{ fontSize: "1.05rem", color: calculatedPercent >= 75 ? "#166534" : "#991b1b" }}>
                    {totalEarned} / {totalPossible} ({calculatedPercent}%)
                  </strong>
                </div>
              </div>

              {/* Pass / Fail Verdict */}
              <div style={{ padding: "14px", borderRadius: "8px", border: "1px solid var(--border-light)", background: "var(--bg-main)" }}>
                <label style={{ display: "block", fontWeight: 700, fontSize: "0.88rem", marginBottom: "8px", color: "var(--text-primary)" }}>
                  Assessment Outcome Verdict *
                </label>
                <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="passedVerdict"
                      checked={passed}
                      onChange={() => setPassed(true)}
                      style={{ accentColor: "#16a34a", width: "16px", height: "16px" }}
                    />
                    <span style={{ fontSize: "0.88rem", color: "#166534", fontWeight: 600 }}>
                      Pass — Meets Competency Standards
                    </span>
                  </label>

                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="passedVerdict"
                      checked={!passed}
                      onChange={() => setPassed(false)}
                      style={{ accentColor: "#dc2626", width: "16px", height: "16px" }}
                    />
                    <span style={{ fontSize: "0.88rem", color: "#991b1b", fontWeight: 600 }}>
                      Retry — Prerequisite Competencies Incomplete
                    </span>
                  </label>
                </div>
              </div>

              {/* Trainer Notes */}
              <div className={styles.formGroup}>
                <label htmlFor="notes">
                  Trainer Qualitative Feedback &amp; Notes *
                </label>
                <textarea
                  id="notes"
                  rows={3}
                  placeholder="Enter comprehensive qualitative feedback regarding the learner's reflection, core competencies, and verbal articulation..."
                  value={trainerNotes}
                  onChange={(e) => setTrainerNotes(e.target.value)}
                  required
                />
              </div>

              {/* Retry Guidance (Mandatory if !passed) */}
              {!passed && (
                <div className={styles.formGroup}>
                  <label htmlFor="retry" style={{ color: "#991b1b" }}>
                    Retry Remediation Guidance *
                  </label>
                  <textarea
                    id="retry"
                    rows={2}
                    placeholder="Specify required remediation, steps to review, or exercises before the rescheduled oral assessment..."
                    value={retryGuidance}
                    onChange={(e) => setRetryGuidance(e.target.value)}
                    required={!passed}
                    style={{ borderColor: "#fecaca" }}
                  />
                </div>
              )}

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setGradingAssessment(null)}
                  disabled={submittingGrade}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={submittingGrade}
                >
                  {submittingGrade ? "Submitting Grade..." : "Save & Finalize Evaluation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          SCHEDULE ORAL ASSESSMENT MODAL
         ───────────────────────────────────────────────────────────────────────────── */}
      {isScheduleModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent} style={{ maxWidth: "480px" }}>
            <div className={styles.modalHeader}>
              <div>
                <h2>Schedule Oral Assessment</h2>
                <p className={styles.modalIntro}>Assign an oral competency interview to an enrolled learner.</p>
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setIsScheduleModalOpen(false)}
                disabled={submittingSchedule}
                aria-label="Close modal"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmitSchedule} className={styles.modalForm}>
              {scheduleModalError && (
                <div style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", padding: "10px 14px", borderRadius: "8px", fontSize: "0.85rem" }}>
                  {scheduleModalError}
                </div>
              )}

              <div className={styles.formGroup}>
                <label>Select Enrolled Learner *</label>
                <CustomSelect
                  value={selectedEnrolmentId}
                  onChange={setSelectedEnrolmentId}
                  fullWidth
                  ariaLabel="Select Enrolled Learner"
                  placeholder="Choose an enrolled learner..."
                  options={batchEnrolments.map((enr) => ({
                    value: enr.id,
                    label: `${enr.user?.name || "Learner"} (${enr.user?.email || "No email"}) — ${enr.status}`,
                  }))}
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="schedDate">
                  Scheduled Date &amp; Time <span className={styles.optionalLabel}>(Optional)</span>
                </label>
                <input
                  id="schedDate"
                  type="datetime-local"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                />
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setIsScheduleModalOpen(false)}
                  disabled={submittingSchedule}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={submittingSchedule || !selectedEnrolmentId}
                >
                  {submittingSchedule ? "Scheduling..." : "Create Assessment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          STAGE 5: INLINE MISSION STATEMENT DOCUMENT PREVIEW MODAL
         ───────────────────────────────────────────────────────────────────────────── */}
      {previewMissionDoc && (
        <Modal
          isOpen={true}
          onClose={() => setPreviewMissionDoc(null)}
          title={`Review Mission Statement: ${previewMissionDoc.user?.name || "Learner"}`}
          subtitle={`${previewMissionDoc.enrolment?.program?.title || "Program"} · Version v${previewMissionDoc.version} · ${previewMissionDoc.fileName}`}
          maxWidth="900px"
          footer={
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", flexWrap: "wrap", gap: "10px" }}>
              <a
                href={
                  (previewMissionDoc.fileUrl.startsWith("http") || previewMissionDoc.fileUrl.startsWith("data:"))
                    ? previewMissionDoc.fileUrl
                    : `${API_URL}/mission-statements/${previewMissionDoc.id}/file`
                }
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: "0.82rem",
                  color: "#0284c7",
                  fontWeight: 600,
                  textDecoration: "underline",
                }}
              >
                Download Raw Document &darr;
              </a>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setPreviewMissionDoc(null)}
                >
                  Close Preview
                </button>
                {previewMissionDoc.status === "SUBMITTED" && (
                  <>
                    <button
                      type="button"
                      className={styles.dangerBtnSmall}
                      onClick={() => {
                        const doc = previewMissionDoc;
                        setPreviewMissionDoc(null);
                        setRejectingMission(doc);
                        setRejectionFeedback("");
                      }}
                    >
                      Request Revisions
                    </button>
                    <button
                      type="button"
                      className={styles.primaryBtnSmall}
                      onClick={() => {
                        const doc = previewMissionDoc;
                        setPreviewMissionDoc(null);
                        setApprovingMission(doc);
                        setApprovalFeedback("Outstanding mission statement. Approved for professional certification.");
                      }}
                    >
                      Approve &amp; Issue Certificate &rarr;
                    </button>
                  </>
                )}
              </div>
            </div>
          }
        >
          {(() => {
            const isDataUri = previewMissionDoc.fileUrl.startsWith("data:");
            const docFileUrl = (previewMissionDoc.fileUrl.startsWith("http") || isDataUri)
              ? previewMissionDoc.fileUrl
              : `${API_URL}/mission-statements/${previewMissionDoc.id}/file`;
            const isImage = (previewMissionDoc.mimeType || "").includes("image") ||
              (isDataUri && previewMissionDoc.fileUrl.startsWith("data:image/")) ||
              docFileUrl.match(/\.(jpg|jpeg|png|webp|svg)(\?.*)?$/i) !== null;

            return (
              <div style={{ padding: "0.5rem 0", display: "flex", flexDirection: "column", gap: "1rem" }}>
                {/* Visual Preview Container */}
                <div
                  style={{
                    width: "100%",
                    minHeight: "450px",
                    maxHeight: "68vh",
                    overflow: "auto",
                    background: "#22201e",
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1px solid #3f3e3a",
                    padding: "12px",
                    position: "relative",
                  }}
                >
                  {/* Loading Spinner */}
                  {previewLoading && !previewError && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 12,
                        color: "#d4d4d8",
                        padding: "2rem",
                      }}
                    >
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          border: "3px solid rgba(255,255,255,0.2)",
                          borderTopColor: "#b8860b",
                          borderRadius: "50%",
                          animation: "spin 0.8s linear infinite",
                        }}
                      />
                      <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Loading document preview...</span>
                    </div>
                  )}

                  {/* Fallback Error Display */}
                  {previewError && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 12,
                        padding: "2rem",
                        textAlign: "center",
                        color: "#f87171",
                      }}
                    >
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#ffffff" }}>
                        Document Preview Unavailable Inline
                      </div>
                      <p style={{ margin: 0, fontSize: "0.82rem", color: "#a1a1aa", maxWidth: 440, lineHeight: 1.5 }}>
                        The document could not be previewed inline, or was submitted as an empty/corrupted file. You can open the file in a new tab, or use &ldquo;Request Revisions&rdquo; below so the learner can re-upload their mission statement.
                      </p>
                      <a
                        href={docFileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          background: "#b8860b",
                          color: "#ffffff",
                          padding: "8px 16px",
                          borderRadius: 6,
                          fontSize: "0.84rem",
                          fontWeight: 700,
                          textDecoration: "none",
                          marginTop: 6,
                        }}
                      >
                        <span>Open Document in New Tab</span>
                        <span>&nearr;</span>
                      </a>
                    </div>
                  )}

                  {/* Live Rendered Image */}
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
                        maxHeight: "65vh",
                        objectFit: "contain",
                        borderRadius: 4,
                        boxShadow: "0 8px 30px rgba(0,0,0,0.6)",
                        display: previewLoading || previewError ? "none" : "block",
                      }}
                    />
                  )}

                  {/* Live Rendered PDF / Document */}
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
                        height: "550px",
                        border: "none",
                        borderRadius: 4,
                        display: previewLoading || previewError ? "none" : "block",
                      }}
                    />
                  )}
                </div>

                {/* Metadata & Direct Link Bar */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, fontSize: "0.82rem", color: "#57534e" }}>
                  <div>
                    <strong>Submission Summary:</strong> Uploaded on {new Date(previewMissionDoc.createdAt).toLocaleString()} ·
                    Size: {(previewMissionDoc.sizeBytes / (1024 * 1024)).toFixed(2)} MB · Format: {previewMissionDoc.mimeType}
                  </div>
                  <a
                    href={docFileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#0284c7", fontWeight: 600, textDecoration: "underline" }}
                  >
                    Open in Full Tab &nearr;
                  </a>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          STAGE 5: APPROVE MISSION STATEMENT & AUTO-ISSUE CERTIFICATE MODAL
         ───────────────────────────────────────────────────────────────────────────── */}
      {approvingMission && (
        <Modal
          isOpen={true}
          onClose={() => setApprovingMission(null)}
          title="Approve Mission Statement & Auto-Issue Certificate"
          subtitle={`Review and approve Stage 5 completion for ${approvingMission.user?.name || "Learner"}.`}
        >
          <form onSubmit={handleApproveMission}>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "10px" }}>
              <div style={{
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                padding: "12px 14px",
                borderRadius: "8px",
                fontSize: "0.85rem",
                color: "#166534"
              }}>
                <strong>Automated Certification Trigger:</strong> Approving this mission statement marks <strong>Stage 5 Complete</strong> and immediately generates a verified, signed graduation certificate for the learner!
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>
                  Feedback / Approval Note (included in confirmation)
                </label>
                <textarea
                  value={approvalFeedback}
                  onChange={(e) => setApprovalFeedback(e.target.value)}
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid var(--border-light)",
                    fontSize: "0.88rem",
                    fontFamily: "inherit",
                    resize: "vertical",
                  }}
                  placeholder="Outstanding mission statement. Approved for professional certification."
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
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
                  {submittingApproval ? "Approving & Issuing..." : "Approve & Issue Certificate"}
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          STAGE 5: REJECT MISSION STATEMENT MODAL
         ───────────────────────────────────────────────────────────────────────────── */}
      {rejectingMission && (
        <Modal
          isOpen={true}
          onClose={() => setRejectingMission(null)}
          title="Request Mission Statement Revision"
          subtitle={`Provide actionable guidance to ${rejectingMission.user?.name || "the learner"} so they can revise and resubmit.`}
        >
          <form onSubmit={handleRejectMission}>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "10px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>
                  Revision Guidance &amp; Required Changes <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <textarea
                  value={rejectionFeedback}
                  onChange={(e) => setRejectionFeedback(e.target.value)}
                  rows={4}
                  required
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid var(--border-light)",
                    fontSize: "0.88rem",
                    fontFamily: "inherit",
                    resize: "vertical",
                  }}
                  placeholder="e.g., Please articulate your specific 12-month coaching vision in Section 2, and clarify your target demographic."
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
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
                  style={{ padding: "8px 16px", fontSize: "0.88rem" }}
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
