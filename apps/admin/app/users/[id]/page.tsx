"use client";

import { useEffect, useState, use, Fragment } from "react";
import styles from "./UserDetail.module.css";
import Link from "next/link";
import {
  API_URL,
  errorMessage,
  fetchStudentNotes,
  createStudentNote,
  deleteStudentNote,
  type StudentNote,
} from "../../lib/api";
import { formatNoteDate } from "../../lib/timezone";
import { CustomSelect, StatusBadge, InputDialog } from "../../components";

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
    templateVersion?: string;
    status: string;
    signedAt: string;
    signatureType?: string;
    typedName?: string;
  } | null;
}

interface UserDetail {
  id: string;
  name: string;
  email: string;
  role: string;
  twoFactorEnabled?: boolean;
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

  // Oral Assessment & Rubric state
  const [oralAssessments, setOralAssessments] = useState<any[]>([]);
  const [loadingOral, setLoadingOral] = useState(false);
  const [showOralForm, setShowOralForm] = useState(false);
  const [rubricScores, setRubricScores] = useState<Array<{
    rubricCategory: string;
    score: number;
    maxScore: number;
    feedback: string;
  }>>([
    { rubricCategory: "Emotional Resilience & Awareness", score: 8, maxScore: 10, feedback: "" },
    { rubricCategory: "Core Curriculum Principles", score: 8, maxScore: 10, feedback: "" },
    { rubricCategory: "Critical Reflection & Authenticity", score: 8, maxScore: 10, feedback: "" },
    { rubricCategory: "Future Readiness & Action Plan", score: 8, maxScore: 10, feedback: "" },
  ]);
  const [oralPassed, setOralPassed] = useState(true);
  const [oralTrainerNotes, setOralTrainerNotes] = useState("");
  const [oralRetryGuidance, setOralRetryGuidance] = useState("");
  const [submittingOral, setSubmittingOral] = useState(false);
  const [oralError, setOralError] = useState<string | null>(null);
  const [oralSuccess, setOralSuccess] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Student Notes & Highlights State (Task 4 - Item #7)
  // ---------------------------------------------------------------------------
  const [studentNotes, setStudentNotes] = useState<StudentNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [showAddNoteForm, setShowAddNoteForm] = useState(false);
  const [newNoteText, setNewNoteText] = useState("");
  const [newHighlight, setNewHighlight] = useState("");
  const [submittingNote, setSubmittingNote] = useState(false);
  const [selectedNoteStepId, setSelectedNoteStepId] = useState<string>("");

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

  // Load progression & oral assessments when selected enrolment changes
  useEffect(() => {
    if (!selectedEnrolmentId) {
      setProgression(null);
      setOralAssessments([]);
      return;
    }
    const controller = new AbortController();
    fetchProgression(selectedEnrolmentId, controller.signal);
    fetchOralAssessments(selectedEnrolmentId, controller.signal);
    return () => controller.abort();
  }, [selectedEnrolmentId]);

  async function fetchOralAssessments(enrolmentId: string, signal?: AbortSignal) {
    setLoadingOral(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API_URL}/oral-assessments/enrolments/${enrolmentId}`, { headers, signal });
      if (res.ok) {
        const data = await res.json();
        setOralAssessments(Array.isArray(data) ? data : []);
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        console.warn("Failed to fetch oral assessments", e);
      }
    } finally {
      setLoadingOral(false);
    }
  }

  // Fetch student notes on learner change or when enrolment changes
  useEffect(() => {
    if (!userId) return;
    let isCancelled = false;

    async function loadNotes() {
      setLoadingNotes(true);
      setNotesError(null);
      try {
        const notes = await fetchStudentNotes({ userId, sort: "desc" });
        if (!isCancelled) {
          setStudentNotes(Array.isArray(notes) ? notes : []);
        }
      } catch (e: any) {
        if (!isCancelled) {
          console.warn("Could not load student notes", e);
        }
      } finally {
        if (!isCancelled) {
          setLoadingNotes(false);
        }
      }
    }

    loadNotes();
    return () => {
      isCancelled = true;
    };
  }, [userId, selectedEnrolmentId]);

  async function handleAddStudentNote(e: React.FormEvent) {
    e.preventDefault();
    if (!newNoteText.trim()) return;

    setSubmittingNote(true);
    setNotesError(null);
    try {
      const currentEnrolment = user?.enrolments?.find((en) => en.id === selectedEnrolmentId);
      const programId = currentEnrolment?.program?.id || currentEnrolment?.batch?.program?.id || progression?.programId;
      const stepId = selectedNoteStepId || progression?.steps?.[0]?.stepId;
      const lessonId = progression?.steps?.find((s) => s.stepId === stepId)?.lessons?.[0]?.lessonId;

      const created = await createStudentNote({
        programId: programId || undefined,
        stepId: stepId || undefined,
        lessonId: lessonId || undefined,
        noteText: newNoteText.trim(),
        highlightSnippet: newHighlight.trim() || undefined,
      });

      setStudentNotes((prev) => [created, ...prev]);
      setNewNoteText("");
      setNewHighlight("");
      setShowAddNoteForm(false);
    } catch (err: any) {
      setNotesError(err.message || "Failed to save note");
    } finally {
      setSubmittingNote(false);
    }
  }

  async function handleDeleteStudentNote(noteId: string) {
    if (!confirm("Are you sure you want to delete this study note?")) return;
    try {
      await deleteStudentNote(noteId);
      setStudentNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch (err: any) {
      alert(err.message || "Failed to delete note");
    }
  }

  async function handleSubmitOralAssessment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEnrolmentId) return;

    if (!oralTrainerNotes.trim()) {
      setOralError("Trainer notes are required as qualitative evaluation.");
      return;
    }

    if (!oralPassed && !oralRetryGuidance.trim()) {
      setOralError("Retry guidance is required for assessments marked as not passed.");
      return;
    }

    setSubmittingOral(true);
    setOralError(null);
    setOralSuccess(null);

    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const currentEnrolment = user?.enrolments?.find((en) => en.id === selectedEnrolmentId);
      const programId = currentEnrolment?.program?.id || currentEnrolment?.batch?.program?.id || progression?.programId;

      if (!programId) {
        throw new Error("Unable to identify program ID for this enrolment.");
      }

      let targetAssessmentId = oralAssessments.find((a) => a.status === "SCHEDULED")?.id;

      if (!targetAssessmentId) {
        const createRes = await fetch(`${API_URL}/oral-assessments`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            enrolmentId: selectedEnrolmentId,
            programId,
          }),
        });

        if (!createRes.ok) {
          throw new Error(await errorMessage(createRes, "Failed to schedule oral assessment"));
        }
        const created = await createRes.json();
        targetAssessmentId = created.id;
      }

      const gradeRes = await fetch(`${API_URL}/oral-assessments/${targetAssessmentId}/grade`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          scores: rubricScores.map((s) => ({
            rubricCategory: s.rubricCategory,
            score: Number(s.score),
            maxScore: Number(s.maxScore) || 10,
            feedback: s.feedback.trim() || undefined,
          })),
          passed: oralPassed,
          trainerNotes: oralTrainerNotes.trim(),
          retryGuidance: oralPassed ? undefined : (oralRetryGuidance.trim() || undefined),
        }),
      });

      if (!gradeRes.ok) {
        throw new Error(await errorMessage(gradeRes, "Failed to record oral assessment scores"));
      }

      setOralSuccess("Oral assessment rubric successfully evaluated and recorded!");
      setShowOralForm(false);
      setOralTrainerNotes("");
      setOralRetryGuidance("");
      await fetchOralAssessments(selectedEnrolmentId);
    } catch (err: any) {
      setOralError(err.message || "Failed to submit oral assessment");
    } finally {
      setSubmittingOral(false);
    }
  }

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

  async function handleOverrideWithReason(reason: string) {
    if (!targetStep || !selectedEnrolmentId || !activeModal) return;

    if ((activeModal === "unlock" || activeModal === "relock") && !reason.trim()) {
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
        body: JSON.stringify({ reason: reason.trim() }),
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to apply manual override"));
      }

      const currentAction = activeModal;
      const currentSequence = targetStep.sequence;
      closeOverrideModal();
      setActionSuccess(
        currentAction === "unlock"
          ? `Step ${currentSequence} manually unlocked.`
          : currentAction === "relock"
          ? `Step ${currentSequence} manually relocked.`
          : `Step ${currentSequence} manual override reset to automatic progression.`
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
                  <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginLeft: "4px", fontWeight: 500 }}>
                    {user.role === "SUPER_ADMIN"
                      ? "(Super Admin — Full System Control)"
                      : user.role === "ADMIN"
                      ? "(Admin — Operations & Approvals)"
                      : user.role === "MANAGER"
                      ? "(Manager — Batch & Attendance Scoped)"
                      : "(Learner)"}
                  </span>
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

                <span className={styles.metaDot}>&bull;</span>

                <span className={styles.metaItem}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <span>{user.twoFactorEnabled ? "2FA Enabled" : "2FA Off"}</span>
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
              title="Recalculate progression locks and completions according to batch schedule and criteria"
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

      {/* 2. Enrolment Selector Card */}
      {user.enrolments && user.enrolments.length > 0 && (
        <section className={styles.enrollmentCard}>
          <div className={styles.enrollmentPickerGroup}>
            <label className={styles.enrollmentLabel} htmlFor="enrolment-select">
              Active Enrolment Track:
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

          <div className={styles.enrollmentStatusWrap} style={{ display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
              <span className={styles.enrollmentStatusLabel}>Enrolment Status:</span>
              <StatusBadge status={selectedEnrolment?.status || "ACTIVE"} />
            </div>

            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
              <span className={styles.enrollmentStatusLabel}>Program Agreement:</span>
              {selectedEnrolment?.signedAgreement && selectedEnrolment.signedAgreement.status === "SIGNED" ? (
                <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <span
                    style={{
                      background: "#DCFCE7",
                      color: "#15803D",
                      padding: "3px 10px",
                      borderRadius: "9999px",
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Signed {selectedEnrolment.signedAgreement.templateVersion || "v1.0"}
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    ({new Date(selectedEnrolment.signedAgreement.signedAt).toLocaleDateString()})
                  </span>
                </div>
              ) : (
                <span
                  style={{
                    background: "#FEF3C7",
                    color: "#B45309",
                    padding: "3px 10px",
                    borderRadius: "9999px",
                    fontSize: "0.78rem",
                    fontWeight: 700,
                  }}
                >
                  Pending Signature
                </span>
              )}
            </div>
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
            No program steps found for this enrolment.
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
              Live batch and 1-on-1 coaching attendance records, timestamps, and manual overrides.
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
                  <th>Batch / Track</th>
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
                          {record.sessionType === "ONE_ON_ONE" ? "1-on-1 Coaching" : "Batch Session"}
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

      {/* 6. Oral Assessment & Viva Rubric Scoring */}
      <section className={styles.progressionSection}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Oral Assessment &amp; Viva Rubric</h2>
            <p className={styles.sectionSubtitle}>
              Evaluate 1-on-1 viva assessments across 4 rubric categories (0–10 scale) to qualify learners for final certificate issuance.
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => {
                setShowOralForm(!showOralForm);
                setOralError(null);
                setOralSuccess(null);
              }}
              className={styles.recalculateBtn}
              style={{
                background: showOralForm ? "var(--bg-soft, #f5ece1)" : "var(--accent-primary, #c97a1e)",
                color: showOralForm ? "var(--text-primary)" : "#ffffff",
                border: "none",
                fontWeight: 700,
              }}
            >
              {showOralForm ? "Close Rubric Form" : "+ Record Oral Assessment"}
            </button>
          </div>
        </div>

        {oralError && (
          <div className={styles.alertError} style={{ margin: "1rem 0" }}>
            {oralError}
          </div>
        )}
        {oralSuccess && (
          <div className={styles.alertSuccess} style={{ margin: "1rem 0" }}>
            {oralSuccess}
          </div>
        )}

        {/* Interactive Rubric Scoring Form */}
        {showOralForm && (
          <form
            onSubmit={handleSubmitOralAssessment}
            style={{
              padding: "1.5rem",
              background: "#ffffff",
              borderRadius: 16,
              border: "2px solid var(--border-light, #e7decb)",
              marginBottom: "1.5rem",
              boxShadow: "0 4px 14px rgba(20, 17, 15, 0.04)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)" }}>
                Oral Assessment Rubric Form
              </h3>
              <div style={{
                fontSize: "0.9rem",
                fontWeight: 800,
                color: "var(--accent-primary, #c97a1e)",
                background: "#fef3c7",
                padding: "4px 12px",
                borderRadius: 8,
              }}>
                Total Score: {rubricScores.reduce((sum, s) => sum + Number(s.score), 0)} / {rubricScores.reduce((sum, s) => sum + (Number(s.maxScore) || 10), 0)} ({Math.round((rubricScores.reduce((sum, s) => sum + Number(s.score), 0) / (rubricScores.reduce((sum, s) => sum + (Number(s.maxScore) || 10), 0) || 1)) * 100)}%)
              </div>
            </div>

            {/* 4 Rubric Category Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem", marginBottom: "1.25rem" }}>
              {rubricScores.map((rubric, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "1rem",
                    borderRadius: 12,
                    background: "#fbfaf8",
                    border: "1px solid #e7decb",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label style={{ fontSize: "0.85rem", fontWeight: 700, color: "#1e293b", margin: 0 }}>
                      {rubric.rubricCategory}
                    </label>
                    <span style={{ fontSize: "0.88rem", fontWeight: 800, color: "#0284c7" }}>
                      {rubric.score} / {rubric.maxScore}
                    </span>
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={rubric.maxScore}
                    value={rubric.score}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setRubricScores((prev) =>
                        prev.map((r, i) => (i === idx ? { ...r, score: val } : r))
                      );
                    }}
                    style={{ accentColor: "var(--accent-primary, #c97a1e)", cursor: "pointer" }}
                  />

                  <input
                    type="text"
                    placeholder="Specific qualitative feedback / notes"
                    value={rubric.feedback}
                    onChange={(e) => {
                      const val = e.target.value;
                      setRubricScores((prev) =>
                        prev.map((r, i) => (i === idx ? { ...r, feedback: val } : r))
                      );
                    }}
                    style={{
                      fontSize: "0.82rem",
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: "1px solid #cbd5e1",
                      background: "#ffffff",
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Assessment Decision & Feedback */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem", marginBottom: "1.25rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.35rem", color: "#1e293b" }}>
                  Assessment Outcome Decision
                </label>
                <div style={{ display: "flex", gap: "1rem" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.88rem", fontWeight: 600, color: "#15803d", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="oral_pass_toggle"
                      checked={oralPassed}
                      onChange={() => setOralPassed(true)}
                      style={{ accentColor: "#15803d" }}
                    />
                    Pass (Meets Rubric Threshold)
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.88rem", fontWeight: 600, color: "#b91c1c", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="oral_pass_toggle"
                      checked={!oralPassed}
                      onChange={() => setOralPassed(false)}
                      style={{ accentColor: "#b91c1c" }}
                    />
                    Needs Remediation / Re-Attempt
                  </label>
                </div>
              </div>

              {!oralPassed && (
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.35rem", color: "#b91c1c" }}>
                    Retry Guidance &amp; Areas of Focus *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Specific topics or competencies the learner must review before re-attempt"
                    value={oralRetryGuidance}
                    onChange={(e) => setOralRetryGuidance(e.target.value)}
                    style={{
                      width: "100%",
                      fontSize: "0.85rem",
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: "1px solid #ef4444",
                    }}
                  />
                </div>
              )}
            </div>

            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.35rem", color: "#1e293b" }}>
                Trainer Evaluation Notes &amp; Observations *
              </label>
              <textarea
                rows={3}
                required
                placeholder="Comprehensive notes summarizing the learner's responses, domain depth, articulation, and personal reflection during the session..."
                value={oralTrainerNotes}
                onChange={(e) => setOralTrainerNotes(e.target.value)}
                style={{
                  width: "100%",
                  fontSize: "0.88rem",
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  fontFamily: "inherit",
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <button
                type="button"
                onClick={() => setShowOralForm(false)}
                className={styles.recalculateBtn}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingOral}
                className={styles.recalculateBtn}
                style={{
                  background: "var(--accent-primary, #c97a1e)",
                  color: "#ffffff",
                  border: "none",
                  fontWeight: 700,
                }}
              >
                {submittingOral ? "Recording Scores..." : "Submit Oral Assessment Rubric"}
              </button>
            </div>
          </form>
        )}

        {/* Existing Oral Assessments List */}
        {loadingOral ? (
          <div className="skeleton" style={{ height: 100, borderRadius: 12 }} />
        ) : oralAssessments.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center", background: "#ffffff", borderRadius: 12, border: "1px solid var(--border-light, #e7decb)" }}>
            <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--text-muted, #78716a)" }}>
              No oral assessments have been recorded yet for this enrolment. Click "+ Record Oral Assessment" above to record viva rubric scores.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {oralAssessments.map((oa) => {
              const isPassed = oa.status === "PASSED";
              const isFailed = oa.status === "FAILED";

              return (
                <div
                  key={oa.id}
                  style={{
                    background: "#ffffff",
                    borderRadius: 14,
                    border: "1px solid var(--border-light, #e7decb)",
                    padding: "1.25rem 1.5rem",
                    boxShadow: "0 2px 8px rgba(20, 17, 15, 0.03)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span
                        style={{
                          fontSize: "0.78rem",
                          fontWeight: 800,
                          padding: "3px 10px",
                          borderRadius: 6,
                          background: isPassed ? "#ecfdf5" : isFailed ? "#fef2f2" : "#fef3c7",
                          color: isPassed ? "#065f46" : isFailed ? "#b91c1c" : "#b45309",
                          border: `1px solid ${isPassed ? "#a7f3d0" : isFailed ? "#fecaca" : "#fde68a"}`,
                        }}
                      >
                        {oa.status}
                      </span>
                      <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                        {oa.assessedAt
                          ? `Assessed on ${new Date(oa.assessedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
                          : oa.scheduledDate
                          ? `Scheduled for ${new Date(oa.scheduledDate).toLocaleDateString()}`
                          : `Created ${new Date(oa.createdAt).toLocaleDateString()}`}
                      </span>
                      {oa.assessor && (
                        <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                          &bull; Evaluator: <strong>{oa.assessor.name}</strong>
                        </span>
                      )}
                    </div>

                    {oa.overallScore != null && (
                      <div style={{ fontSize: "1rem", fontWeight: 800, color: isPassed ? "#15803d" : "#b91c1c" }}>
                        Score: {oa.overallScore}%
                      </div>
                    )}
                  </div>

                  {/* Rubric Breakdown */}
                  {oa.scores && oa.scores.length > 0 && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem", margin: "0.75rem 0", padding: "0.75rem", background: "#fbfaf8", borderRadius: 8 }}>
                      {oa.scores.map((sc: any, sIdx: number) => (
                        <div key={sIdx} style={{ fontSize: "0.82rem" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, color: "#334155" }}>
                            <span>{sc.rubricCategory}</span>
                            <span style={{ fontWeight: 800 }}>{sc.score} / {sc.maxScore || 10}</span>
                          </div>
                          {sc.feedback && (
                            <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 2, fontStyle: "italic" }}>
                              {sc.feedback}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Qualitative Notes */}
                  {oa.trainerNotes && (
                    <div style={{ fontSize: "0.85rem", color: "var(--text-primary)", background: "var(--bg-soft, #f5ece1)", padding: "8px 12px", borderRadius: 8, marginTop: "0.5rem" }}>
                      <strong>Trainer Feedback:</strong> {oa.trainerNotes}
                    </div>
                  )}

                  {oa.retryGuidance && (
                    <div style={{ fontSize: "0.85rem", color: "#b91c1c", background: "#fef2f2", padding: "8px 12px", borderRadius: 8, marginTop: "0.5rem" }}>
                      <strong>Retry Guidance:</strong> {oa.retryGuidance}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 7. Student Notes & Highlights (Item #7) */}
      <section className={styles.progressionSection}>
        <div className={styles.sectionHeader}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <h2 className={styles.sectionTitle}>Student Notes &amp; Highlights (&ldquo;My Notes&rdquo;)</h2>
              <span
                style={{
                  background: "#fdf4e8",
                  color: "var(--accent-primary, #c97a1e)",
                  fontWeight: 700,
                  fontSize: "0.75rem",
                  padding: "2px 8px",
                  borderRadius: "12px",
                  border: "1px solid #fae2c8",
                }}
              >
                {studentNotes.length} Saved Note{studentNotes.length === 1 ? "" : "s"}
              </span>
            </div>
            <p className={styles.sectionSubtitle}>
              Chronological study notebook capturing in-lesson notes, quotes, and video bookmarks across program steps.
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => {
                setShowAddNoteForm(!showAddNoteForm);
                setNotesError(null);
              }}
              className={styles.recalculateBtn}
              style={{
                background: showAddNoteForm ? "var(--bg-soft, #f5ece1)" : "var(--accent-primary, #c97a1e)",
                color: showAddNoteForm ? "var(--text-primary)" : "#ffffff",
                border: "none",
                fontWeight: 700,
              }}
            >
              {showAddNoteForm ? "Cancel Note" : "+ Add Study Note"}
            </button>
          </div>
        </div>

        {notesError && (
          <div className={styles.alertError} style={{ margin: "1rem 0" }}>
            {notesError}
          </div>
        )}

        {/* In-Lesson / Administrative Note Input Form */}
        {showAddNoteForm && (
          <form
            onSubmit={handleAddStudentNote}
            style={{
              background: "#ffffff",
              border: "1.5px solid var(--accent-primary, #c97a1e)",
              borderRadius: 14,
              padding: "1.5rem",
              marginBottom: "1.5rem",
              boxShadow: "0 6px 20px rgba(201, 122, 30, 0.08)",
            }}
          >
            <h3 style={{ margin: "0 0 1rem", fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)" }}>
              Add Note for {user.name}
            </h3>

            {progression?.steps && progression.steps.length > 0 && (
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.35rem", color: "#1e293b" }}>
                  Associate with Step
                </label>
                <select
                  value={selectedNoteStepId}
                  onChange={(e) => setSelectedNoteStepId(e.target.value)}
                  style={{
                    width: "100%",
                    fontSize: "0.88rem",
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                  }}
                >
                  <option value="">-- Choose Step --</option>
                  {progression.steps.map((st) => (
                    <option key={st.stepId} value={st.stepId}>
                      Step {st.sequence}: {st.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.35rem", color: "#1e293b" }}>
                Highlight Snippet (Optional Quoted Excerpt)
              </label>
              <input
                type="text"
                placeholder="e.g. 'Mindfulness is the foundation of emotional self-regulation.'"
                value={newHighlight}
                onChange={(e) => setNewHighlight(e.target.value)}
                style={{
                  width: "100%",
                  fontSize: "0.85rem",
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "1px solid #cbd5e1",
                }}
              />
            </div>

            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.35rem", color: "#1e293b" }}>
                Note / Observation Text *
              </label>
              <textarea
                rows={3}
                required
                placeholder="Type the student note or key learning reflection..."
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                style={{
                  width: "100%",
                  fontSize: "0.88rem",
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  fontFamily: "inherit",
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <button
                type="button"
                onClick={() => setShowAddNoteForm(false)}
                className={styles.recalculateBtn}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingNote}
                className={styles.recalculateBtn}
                style={{
                  background: "var(--accent-primary, #c97a1e)",
                  color: "#ffffff",
                  border: "none",
                  fontWeight: 700,
                }}
              >
                {submittingNote ? "Saving Note..." : "Save Note"}
              </button>
            </div>
          </form>
        )}

        {/* Chronological Notes Column / List */}
        {loadingNotes ? (
          <div className="skeleton" style={{ height: 100, borderRadius: 12 }} />
        ) : studentNotes.length === 0 ? (
          <div
            style={{
              padding: "2.5rem 1.5rem",
              textAlign: "center",
              background: "#ffffff",
              borderRadius: 14,
              border: "1px solid var(--border-light, #e7decb)",
            }}
          >
            <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--text-muted, #78716a)" }}>
              No study notes or highlights recorded for this learner yet. Notes captured during video playback or lesson reading appear here chronologically.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {studentNotes.map((note) => {
              const stepName = note.step ? `Step ${note.step.sequence}: ${note.step.title}` : "Step Content";
              const lessonName = note.lesson ? note.lesson.title : "Lesson Notes";
              const dateWritten = formatNoteDate(note.createdAt);

              return (
                <div
                  key={note.id}
                  style={{
                    background: "#ffffff",
                    borderRadius: 14,
                    border: "1px solid var(--border-light, #e7decb)",
                    padding: "1.25rem 1.5rem",
                    boxShadow: "0 2px 8px rgba(20, 17, 15, 0.03)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.6rem",
                  }}
                >
                  {/* Mandatory Field 3: Associated Step Name and Lesson Name */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <span
                        style={{
                          fontSize: "0.78rem",
                          fontWeight: 700,
                          padding: "3px 8px",
                          borderRadius: 6,
                          background: "#fef3c7",
                          color: "#92400e",
                          border: "1px solid #fde68a",
                        }}
                      >
                        {stepName}
                      </span>
                      <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>
                        &bull; {lessonName}
                      </span>
                      {note.videoTimestampSeconds != null && (
                        <span
                          style={{
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: "#ede9fe",
                            color: "#6d28d9",
                          }}
                        >
                          ▶ {Math.floor(note.videoTimestampSeconds / 60)}:{(note.videoTimestampSeconds % 60).toString().padStart(2, "0")}
                        </span>
                      )}
                    </div>

                    {/* Mandatory Field 2: Date written (formatted via timezone.ts) */}
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                        {dateWritten}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteStudentNote(note.id)}
                        title="Delete note"
                        style={{
                          background: "none",
                          border: "none",
                          color: "#94a3b8",
                          cursor: "pointer",
                          padding: "2px",
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Quoted Highlight Snippet (if present) */}
                  {note.highlightSnippet && (
                    <blockquote
                      style={{
                        margin: "0.25rem 0",
                        padding: "6px 12px",
                        borderLeft: "3px solid var(--accent-primary, #c97a1e)",
                        background: "#fbfaf8",
                        borderRadius: "0 6px 6px 0",
                        fontSize: "0.84rem",
                        fontStyle: "italic",
                        color: "#475569",
                      }}
                    >
                      &ldquo;{note.highlightSnippet}&rdquo;
                    </blockquote>
                  )}

                  {/* Mandatory Field 1: Saved Note / Highlight text */}
                  <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--text-primary)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                    {note.noteText}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 8. Manual Override Confirmation Modal */}
      {activeModal && targetStep && (
        <InputDialog
          isOpen={Boolean(activeModal && targetStep)}
          onClose={closeOverrideModal}
          onSubmit={async (reason) => {
            await handleOverrideWithReason(reason);
          }}
          title={
            activeModal === "unlock"
              ? `Manually Unlock Step ${targetStep.sequence}`
              : activeModal === "relock"
              ? `Manually Relock Step ${targetStep.sequence}`
              : `Reset Step ${targetStep.sequence} to Automatic Progression`
          }
          subtitle={`Learner: ${user.name}`}
          description={
            activeModal === "unlock" ? (
              <>
                You are about to <strong>manually grant access</strong> to <em>"{targetStep.title}"</em> for learner <strong>{user.name}</strong>, bypassing batch release schedules and milestone prerequisite gates.
              </>
            ) : activeModal === "relock" ? (
              <>
                You are about to <strong>manually revoke access</strong> to <em>"{targetStep.title}"</em> for learner <strong>{user.name}</strong>. The step will remain locked until manually cleared or re-evaluated.
              </>
            ) : (
              <>
                This will remove the manual override and restore automated progression logic based on prerequisite completion and release schedules.
              </>
            )
          }
          label="Administrative Reason"
          placeholder={
            activeModal === "unlock"
              ? "e.g., Learner demonstrated exceptional readiness or has fast-track batch approval."
              : activeModal === "relock"
              ? "e.g., Academic review required before proceeding; prerequisite remediations needed."
              : "Optional administrative notes for resetting to automatic progression."
          }
          required={activeModal !== "reset"}
          tone={activeModal === "relock" ? "danger" : activeModal === "unlock" ? "info" : "warning"}
          confirmText={
            activeModal === "unlock"
              ? "Confirm Unlock"
              : activeModal === "relock"
              ? "Confirm Relock"
              : "Confirm Reset"
          }
          isLoading={submittingOverride}
          error={modalError}
        />
      )}
    </div>
  );
}
