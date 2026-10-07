"use client";

import { useEffect, useState, FormEvent } from "react";
import styles from "../page.module.css";
import { API_URL, errorMessage } from "../lib/api";

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

  // Submit Grade
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

    setSubmittingGrade(true);
    setGradeModalError(null);
    setPageError(null);
    setPageSuccess(null);

    try {
      const token = localStorage.getItem("token");
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

      const res = await fetch(`${API_URL}/oral-assessments/${gradingAssessment.id}/grade`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to submit oral assessment evaluation"));
      }

      setGradingAssessment(null);
      setPageSuccess(
        `Oral assessment successfully graded (${passed ? "PASSED" : "RETRY REQUIRED"}, ${calculatedPercent}%).`
      );
      // Refresh list
      await fetchAssessments(selectedBatchId);
    } catch (err: any) {
      setGradeModalError(err.message);
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
        <div>
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
          >
            + Schedule Oral Assessment
          </button>
        </div>
      </header>

      {pageError && (
        <div style={{ backgroundColor: "#fef2f2", border: "1px solid #f87171", color: "#991b1b", padding: "12px 16px", borderRadius: "8px", marginBottom: "1rem" }}>
          ⚠️ {pageError}
        </div>
      )}

      {pageSuccess && (
        <div style={{ backgroundColor: "#f0fdf4", border: "1px solid #86efac", color: "#166534", padding: "12px 16px", borderRadius: "8px", marginBottom: "1rem" }}>
          ✓ {pageSuccess}
        </div>
      )}

      {/* Cohort Selector */}
      <div style={{ marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "12px", background: "white", padding: "12px 16px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
        <label style={{ fontWeight: 600, fontSize: "0.875rem", color: "#475569" }}>
          Select Cohort / Batch:
        </label>
        <select
          value={selectedBatchId}
          onChange={(e) => setSelectedBatchId(e.target.value)}
          disabled={loadingBatches}
          style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.875rem", minWidth: "260px" }}
        >
          {batches.map((batch) => (
            <option key={batch.id} value={batch.id}>
              {batch.name} {batch.program?.title ? `(${batch.program.title})` : ""}
            </option>
          ))}
        </select>
        <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
          {assessments.length} oral assessment record(s) in this batch
        </span>
      </div>

      {/* Assessments Table */}
      <div className={styles.tableContainer}>
        {loadingAssessments ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
            Loading oral assessments from backend...
          </div>
        ) : assessments.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
            No oral assessments found for this batch. Click <strong>+ Schedule Oral Assessment</strong> to assign one to an enrolled learner.
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>LEARNER</th>
                <th>SCHEDULED DATE</th>
                <th>ASSESSOR</th>
                <th>OVERALL SCORE</th>
                <th>STATUS</th>
                <th>GRADED AT</th>
                <th style={{ textAlign: "right" }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {assessments.map((a) => {
                const learnerName = a.enrolment?.user?.name || "Enrolled Learner";
                const learnerEmail = a.enrolment?.user?.email || "";
                const assessorName = a.assessor?.name || "Unassigned";

                return (
                  <tr key={a.id}>
                    <td>
                      <div className={styles.userInfo}>
                        <div className={styles.userAvatar}>
                          {learnerName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <strong>{learnerName}</strong>
                          <span className={styles.userEmail}>{learnerEmail}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      {a.scheduledDate ? new Date(a.scheduledDate).toLocaleDateString() : "TBD"}
                    </td>
                    <td>
                      <span style={{ fontSize: "0.85rem", color: "#334155" }}>{assessorName}</span>
                    </td>
                    <td>
                      {a.overallScore !== null ? (
                        <span style={{ fontWeight: 700, fontSize: "0.95rem", color: a.overallScore >= 75 ? "#166534" : "#991b1b" }}>
                          {a.overallScore}%
                        </span>
                      ) : (
                        <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>Ungraded</span>
                      )}
                    </td>
                    <td>
                      <span
                        className={styles.statusBadge}
                        data-status={
                          a.status === "PASSED" ? "success" : a.status === "FAILED" ? "error" : "warning"
                        }
                      >
                        {a.status}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                        {a.gradedAt ? new Date(a.gradedAt).toLocaleDateString() : "—"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={() => handleOpenGrading(a)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: "6px",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          backgroundColor: "#0f172a",
                          color: "white",
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        {a.status === "SCHEDULED" ? "Grade Assessment" : "Re-evaluate"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────────
          GRADING MODAL
         ───────────────────────────────────────────────────────────────────────────── */}
      {gradingAssessment && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} style={{ maxWidth: "680px", maxHeight: "90vh", overflowY: "auto" }}>
            <div className={styles.modalHeader}>
              <div>
                <h2 style={{ fontSize: "1.25rem", margin: 0 }}>
                  Oral Competency Evaluation
                </h2>
                <p style={{ margin: "2px 0 0", fontSize: "0.85rem", color: "#64748b" }}>
                  Learner: {gradingAssessment.enrolment?.user?.name || "Learner"} ({gradingAssessment.enrolment?.user?.email})
                </p>
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setGradingAssessment(null)}
                disabled={submittingGrade}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitGrade}>
              <div className={styles.modalBody}>
                {gradeModalError && (
                  <div style={{ backgroundColor: "#fef2f2", border: "1px solid #f87171", color: "#991b1b", padding: "10px", borderRadius: "6px", marginBottom: "1rem", fontSize: "0.85rem" }}>
                    {gradeModalError}
                  </div>
                )}

                {/* Rubric Category Scores */}
                <div style={{ marginBottom: "1.5rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <h3 style={{ fontSize: "1rem", margin: 0, fontWeight: 700 }}>
                      Rubric Scoring Criteria
                    </h3>
                    <button
                      type="button"
                      onClick={handleAddRubricItem}
                      style={{ fontSize: "0.75rem", padding: "4px 8px", borderRadius: "4px", border: "1px solid #cbd5e1", background: "white", cursor: "pointer" }}
                    >
                      + Add Criterion
                    </button>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {rubricScores.map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: "10px 14px",
                          borderRadius: "8px",
                          border: "1px solid #e2e8f0",
                          backgroundColor: "#f8fafc",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
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
                            style={{ fontWeight: 600, fontSize: "0.85rem", border: "none", background: "transparent", color: "#1e293b", width: "70%" }}
                            required
                          />
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <input
                              type="number"
                              min={0}
                              max={item.maxScore}
                              value={item.score}
                              onChange={(e) => handleScoreChange(idx, parseInt(e.target.value, 10) || 0)}
                              style={{ width: "50px", padding: "4px", textAlign: "center", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                              required
                            />
                            <span style={{ fontSize: "0.85rem", color: "#64748b" }}>/ {item.maxScore}</span>
                            {rubricScores.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveRubricItem(idx)}
                                style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", marginLeft: "4px" }}
                                title="Remove criterion"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>

                        <input
                          type="text"
                          placeholder="Optional category observation or constructive feedback..."
                          value={item.feedback || ""}
                          onChange={(e) => handleFeedbackChange(idx, e.target.value)}
                          style={{ width: "100%", padding: "4px 8px", fontSize: "0.8rem", borderRadius: "4px", border: "1px solid #e2e8f0", background: "white" }}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Real-time score calculator */}
                  <div style={{ marginTop: "10px", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#f1f5f9", borderRadius: "6px" }}>
                    <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#475569" }}>
                      Aggregate Rubric Score:
                    </span>
                    <strong style={{ fontSize: "1.1rem", color: calculatedPercent >= 75 ? "#166534" : "#991b1b" }}>
                      {totalEarned} / {totalPossible} ({calculatedPercent}%)
                    </strong>
                  </div>
                </div>

                {/* Pass / Fail Verdict */}
                <div style={{ marginBottom: "1.25rem", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                  <label style={{ display: "block", fontWeight: 600, fontSize: "0.85rem", marginBottom: "8px" }}>
                    Assessment Outcome Verdict <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <div style={{ display: "flex", gap: "20px" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                      <input
                        type="radio"
                        name="passedVerdict"
                        checked={passed}
                        onChange={() => setPassed(true)}
                        style={{ accentColor: "#16a34a" }}
                      />
                      <span style={{ fontSize: "0.9rem", color: "#166534", fontWeight: 600 }}>
                        ✓ PASS — Meets Competency Standards
                      </span>
                    </label>

                    <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                      <input
                        type="radio"
                        name="passedVerdict"
                        checked={!passed}
                        onChange={() => setPassed(false)}
                        style={{ accentColor: "#dc2626" }}
                      />
                      <span style={{ fontSize: "0.9rem", color: "#991b1b", fontWeight: 600 }}>
                        ✕ RETRY — Prerequisite Competencies Incomplete
                      </span>
                    </label>
                  </div>
                </div>

                {/* Trainer Notes */}
                <div className={styles.formGroup} style={{ marginBottom: "1.25rem" }}>
                  <label htmlFor="notes" style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                    Trainer Qualitative Feedback & Notes <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <textarea
                    id="notes"
                    rows={3}
                    className={styles.formInput}
                    placeholder="Enter comprehensive qualitative feedback regarding the learner's reflection, core competencies, and verbal articulation..."
                    value={trainerNotes}
                    onChange={(e) => setTrainerNotes(e.target.value)}
                    required
                    style={{ width: "100%", marginTop: "4px" }}
                  />
                </div>

                {/* Retry Guidance (Mandatory if !passed) */}
                {!passed && (
                  <div className={styles.formGroup} style={{ marginBottom: "1rem" }}>
                    <label htmlFor="retry" style={{ fontWeight: 600, fontSize: "0.85rem", color: "#991b1b" }}>
                      Retry Remediation Guidance <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <textarea
                      id="retry"
                      rows={2}
                      className={styles.formInput}
                      placeholder="Specify required remediation, steps to review, or exercises before the rescheduled oral assessment..."
                      value={retryGuidance}
                      onChange={(e) => setRetryGuidance(e.target.value)}
                      required={!passed}
                      style={{ width: "100%", marginTop: "4px", borderColor: "#fca5a5" }}
                    />
                  </div>
                )}
              </div>

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
          <div className={styles.modal} style={{ maxWidth: "480px" }}>
            <div className={styles.modalHeader}>
              <h2 style={{ fontSize: "1.25rem", margin: 0 }}>
                Schedule Oral Assessment
              </h2>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setIsScheduleModalOpen(false)}
                disabled={submittingSchedule}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitSchedule}>
              <div className={styles.modalBody}>
                {scheduleModalError && (
                  <div style={{ backgroundColor: "#fef2f2", border: "1px solid #f87171", color: "#991b1b", padding: "10px", borderRadius: "6px", marginBottom: "1rem", fontSize: "0.85rem" }}>
                    {scheduleModalError}
                  </div>
                )}

                <div className={styles.formGroup} style={{ marginBottom: "1rem" }}>
                  <label style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                    Select Enrolled Learner <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <select
                    value={selectedEnrolmentId}
                    onChange={(e) => setSelectedEnrolmentId(e.target.value)}
                    required
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", marginTop: "4px" }}
                  >
                    {batchEnrolments.map((enr) => (
                      <option key={enr.id} value={enr.id}>
                        {enr.user?.name || "Learner"} ({enr.user?.email || "No email"}) — {enr.status}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="schedDate" style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                    Scheduled Date & Time (Optional)
                  </label>
                  <input
                    id="schedDate"
                    type="datetime-local"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", marginTop: "4px" }}
                  />
                </div>
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
