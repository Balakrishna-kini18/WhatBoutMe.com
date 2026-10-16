"use client";

import { useEffect, useState, FormEvent } from "react";
import styles from "../page.module.css";
import { API_URL, errorMessage } from "../lib/api";
import { CustomSelect } from "../components";

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

const DEFAULT_RUBRIC: RubricScoreItem[] = [
  { rubricCategory: "Resilience & Self-Leadership", score: 8, maxScore: 10, feedback: "" },
  { rubricCategory: "Application of Curriculum Principles", score: 8, maxScore: 10, feedback: "" },
  { rubricCategory: "Clarity & Reflection", score: 8, maxScore: 10, feedback: "" },
  { rubricCategory: "Goal & Future Readiness", score: 8, maxScore: 10, feedback: "" },
];

export default function OralAssessmentsPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [assessments, setAssessments] = useState<OralAssessment[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [loadingAssessments, setLoadingAssessments] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageSuccess, setPageSuccess] = useState<string | null>(null);

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

  // Load batches on mount
  useEffect(() => {
    async function loadBatches() {
      setLoadingBatches(true);
      setPageError(null);
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_URL}/batches`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          throw new Error(await errorMessage(res, "Failed to load batches"));
        }
        const data: Batch[] = await res.json();
        setBatches(data);
        if (data.length > 0 && data[0]) {
          setSelectedBatchId(data[0].id);
        }
      } catch (err: any) {
        setPageError(err.message);
      } finally {
        setLoadingBatches(false);
      }
    }
    loadBatches();
  }, []);

  // Load assessments when selected batch changes
  useEffect(() => {
    if (!selectedBatchId) {
      setAssessments([]);
      return;
    }
    fetchAssessments(selectedBatchId);
  }, [selectedBatchId]);

  async function fetchAssessments(batchId: string) {
    setLoadingAssessments(true);
    setPageError(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/oral-assessments/batches/${batchId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to load oral assessments for batch"));
      }
      const data: OralAssessment[] = await res.json();
      setAssessments(data);
    } catch (err: any) {
      setPageError(err.message);
    } finally {
      setLoadingAssessments(false);
    }
  }

  // Open Grading Modal
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

  // Calculate overall percentage in real time
  const totalEarned = rubricScores.reduce((acc, r) => acc + (r.score || 0), 0);
  const totalPossible = rubricScores.reduce((acc, r) => acc + (r.maxScore || 10), 0);
  const calculatedPercent = totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 100) : 0;

  // Submit Grade with optimistic UI update
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

    // Optimistic UI update: immediately mark oral assessment as graded in local state
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

    // Dismiss modal immediately for instant feedback
    setGradingAssessment(null);
    setPageSuccess(
      `Oral assessment successfully graded (${passed ? "PASSED" : "RETRY REQUIRED"}, ${calculatedPercent}%).`
    );
    setGradeModalError(null);
    setPageError(null);

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
        // Rollback on server error
        setAssessments(previousAssessments);
        throw new Error(await errorMessage(res, "Failed to submit oral assessment evaluation"));
      }

      // Background re-fetch to synchronize canonical server state
      fetchAssessments(selectedBatchId);
    } catch (err: any) {
      setPageError(err.message || "Failed to submit grade evaluation");
    } finally {
      setSubmittingGrade(false);
    }
  }

  // Open Schedule Modal
  async function handleOpenScheduleModal() {
    setIsScheduleModalOpen(true);
    setScheduleModalError(null);
    setBatchEnrolments([]);
    setSelectedEnrolmentId("");

    try {
      const token = localStorage.getItem("token");
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
    } catch (err: any) {
      setScheduleModalError("Failed to fetch learners in batch.");
    }
  }

  // Submit Schedule
  async function handleSubmitSchedule(e: FormEvent) {
    e.preventDefault();
    if (!selectedEnrolmentId || !selectedBatchId) return;

    const currentBatch = batches.find((b) => b.id === selectedBatchId);
    if (!currentBatch) return;

    setSubmittingSchedule(true);
    setScheduleModalError(null);
    try {
      const token = localStorage.getItem("token");
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

  const currentBatch = batches.find((b) => b.id === selectedBatchId);

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Oral Assessments & Rubrics</h1>
          <p className={styles.subtitle}>
            Conduct live competency interviews, score rubric categories, and issue qualitative evaluation feedback.
          </p>
        </div>
        <div className={styles.headerActions}>
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
        </div>
      </header>

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
          Cohort / Batch:
        </label>
        <CustomSelect
          id="cohort-select"
          value={selectedBatchId}
          onChange={setSelectedBatchId}
          disabled={loadingBatches}
          minWidth="280px"
          ariaLabel="Select Cohort or Batch"
          options={batches.map((batch) => ({
            value: batch.id,
            label: `${batch.name}${batch.program?.title ? ` (${batch.program.title})` : ""}`,
          }))}
        />
        <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
          {assessments.length} assessment record{assessments.length !== 1 ? "s" : ""} in this cohort
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

      {/* ─────────────────────────────────────────────────────────────────────────────
          GRADING MODAL
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
          SCHEDULE MODAL
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
    </div>
  );
}
