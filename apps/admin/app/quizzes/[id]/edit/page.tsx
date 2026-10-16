"use client";

import { useEffect, useState, use, FormEvent } from "react";
import styles from "../../../page.module.css";
import Link from "next/link";
import { API_URL, cachedFetch, errorMessage } from "../../../lib/api";
import { ConfirmDialog, useToast } from "../../../components";

interface Option {
  id?: string;
  text: string;
  isCorrect: boolean;
  order?: number;
}

interface Question {
  id: string;
  text: string;
  type?: string;
  points?: number;
  explanation?: string | null;
  options: Option[];
}

interface QuizDetails {
  id: string;
  stepId: string;
  passMark: number;
  maxAttempts: number;
  cooldownHours: number;
  questionCount?: number | null;
  timeLimitMin?: number | null;
  retryGuidance?: string | null;
  step?: {
    id: string;
    sequence: number;
    title: string;
    programId: string;
  };
  questions?: Question[];
}

export default function EditQuizPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const unwrappedParams = typeof (params as any)?.then === "function" ? use(params as any) : params;
  const quizId = (unwrappedParams as { id: string }).id;

  const [quiz, setQuiz] = useState<QuizDetails | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageSuccess, setPageSuccess] = useState<string | null>(null);

  const { success: toastSuccess, error: toastError } = useToast();
  const [questionToDelete, setQuestionToDelete] = useState<Question | null>(null);
  const [isDeletingQuestion, setIsDeletingQuestion] = useState(false);
  const [deleteQuestionError, setDeleteQuestionError] = useState<string | null>(null);

  // Settings Form State
  const [passMark, setPassMark] = useState(75);
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [cooldownHours, setCooldownHours] = useState(24);
  const [questionCount, setQuestionCount] = useState<number | "">("");
  const [retryGuidance, setRetryGuidance] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  // Add Question Modal State
  const [isAddQuestionModalOpen, setIsAddQuestionModalOpen] = useState(false);
  const [newQuestionText, setNewQuestionText] = useState("");
  const [newQuestionPoints, setNewQuestionPoints] = useState(1);
  const [newQuestionExplanation, setNewQuestionExplanation] = useState("");
  const [newOptions, setNewOptions] = useState<Option[]>([
    { text: "", isCorrect: true },
    { text: "", isCorrect: false },
    { text: "", isCorrect: false },
    { text: "", isCorrect: false },
  ]);
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [questionError, setQuestionError] = useState<string | null>(null);

  useEffect(() => {
    loadQuizData();
  }, [quizId]);

  useEffect(() => {
    if (isAddQuestionModalOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape" && !savingQuestion) {
          setIsAddQuestionModalOpen(false);
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        document.body.style.overflow = originalOverflow;
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [isAddQuestionModalOpen, savingQuestion]);

  async function loadQuizData() {
    setLoading(true);
    setPageError(null);
    try {
      const [res, qRes] = await Promise.all([
        cachedFetch(`${API_URL}/quizzes/${quizId}`, { ttlMs: 30_000 }),
        cachedFetch(`${API_URL}/quizzes/${quizId}/questions`, { ttlMs: 30_000 }).catch(() => null),
      ]);
      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to load quiz details"));
      }
      const data: QuizDetails = await res.json();
      setQuiz(data);
      setPassMark(data.passMark ?? 75);
      setMaxAttempts(data.maxAttempts ?? 3);
      setCooldownHours(data.cooldownHours ?? 24);
      setQuestionCount(data.questionCount ?? "");
      setRetryGuidance(data.retryGuidance ?? "");

      if (qRes && qRes.ok) {
        const qData = await qRes.json();
        setQuestions(qData);
      } else if (data.questions) {
        setQuestions(data.questions);
      }
    } catch (err: any) {
      setPageError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Save Settings
  async function handleSaveSettings(e: FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    setPageError(null);
    setPageSuccess(null);

    try {
      const token = localStorage.getItem("token");
      const payload: any = {
        passMark: Number(passMark),
        maxAttempts: Number(maxAttempts),
        cooldownHours: Number(cooldownHours),
        retryGuidance: retryGuidance.trim() || undefined,
      };
      if (questionCount !== "") {
        payload.questionCount = Number(questionCount);
      }

      const res = await fetch(`${API_URL}/quizzes/${quizId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to save quiz settings"));
      }

      setPageSuccess("Quiz configuration updated successfully.");
    } catch (err: any) {
      setPageError(err.message);
    } finally {
      setSavingSettings(false);
    }
  }

  // Add Question Handlers
  function handleAddOption() {
    setNewOptions((prev) => [...prev, { text: "", isCorrect: false }]);
  }

  function handleOptionTextChange(idx: number, text: string) {
    setNewOptions((prev) => {
      const next = [...prev];
      if (next[idx]) next[idx].text = text;
      return next;
    });
  }

  function handleSetCorrectOption(correctIdx: number) {
    setNewOptions((prev) =>
      prev.map((opt, i) => ({
        ...opt,
        isCorrect: i === correctIdx,
      }))
    );
  }

  function handleRemoveOption(idx: number) {
    if (newOptions.length <= 2) return;
    setNewOptions((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleCreateQuestionSubmit(e: FormEvent) {
    e.preventDefault();
    if (newQuestionText.trim().length < 5) {
      setQuestionError("Question text must be at least 5 characters.");
      return;
    }

    const filledOptions = newOptions.filter((o) => o.text.trim().length > 0);
    if (filledOptions.length < 2) {
      setQuestionError("At least 2 options are required.");
      return;
    }

    if (!filledOptions.some((o) => o.isCorrect)) {
      setQuestionError("At least one option must be marked as correct.");
      return;
    }

    setSavingQuestion(true);
    setQuestionError(null);

    try {
      const token = localStorage.getItem("token");
      const payload = {
        text: newQuestionText.trim(),
        points: Number(newQuestionPoints) || 1,
        explanation: newQuestionExplanation.trim() || undefined,
        options: filledOptions.map((o, idx) => ({
          text: o.text.trim(),
          isCorrect: o.isCorrect,
          order: idx + 1,
        })),
      };

      const res = await fetch(`${API_URL}/quizzes/${quizId}/questions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to create question"));
      }

      setIsAddQuestionModalOpen(false);
      setNewQuestionText("");
      setNewQuestionPoints(1);
      setNewQuestionExplanation("");
      setNewOptions([
        { text: "", isCorrect: true },
        { text: "", isCorrect: false },
        { text: "", isCorrect: false },
        { text: "", isCorrect: false },
      ]);
      setPageSuccess("Question added to quiz successfully.");
      await loadQuizData();
    } catch (err: any) {
      setQuestionError(err.message);
    } finally {
      setSavingQuestion(false);
    }
  }

  // Delete Question with in-website popup & optimistic UI
  async function confirmDeleteQuestion() {
    if (!questionToDelete) return;
    setIsDeletingQuestion(true);
    setDeleteQuestionError(null);

    try {
      const res = await cachedFetch(`${API_URL}/quizzes/questions/${questionToDelete.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to delete question"));
      }

      const deletedId = questionToDelete.id;
      setQuestions((prev) => prev.filter((q) => q.id !== deletedId));
      toastSuccess("Question removed.");
      setPageSuccess("Question removed.");
      setQuestionToDelete(null);
    } catch (err: any) {
      const msg = err.message || "Failed to delete question";
      setDeleteQuestionError(msg);
      toastError(msg);
    } finally {
      setIsDeletingQuestion(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.dashboard}>
        <header className={styles.header}>
          <div className={styles.headerText}>
            <Link href="/quizzes" className={styles.backLink}>← Back to Quizzes</Link>
            <h1 className={styles.title}>Loading quiz editor...</h1>
          </div>
        </header>
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className={styles.dashboard}>
        <header className={styles.header}>
          <div className={styles.headerText}>
            <Link href="/quizzes" className={styles.backLink}>← Back to Quizzes</Link>
            <h1 className={styles.title}>Quiz not found</h1>
          </div>
        </header>
      </div>
    );
  }

  return (
    <div className={styles.dashboard}>
      <div style={{ marginBottom: "0.25rem" }}>
        <Link href="/quizzes" className={styles.backLink}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>Back to Quizzes</span>
        </Link>
      </div>

      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>
            Edit Assessment: {quiz.step ? `Step ${quiz.step.sequence}: ${quiz.step.title}` : `Quiz #${quiz.id}`}
          </h1>
          <p className={styles.subtitle}>
            Manage question pool, passing score, attempt limits, and cooldown timer parameters.
          </p>
        </div>
      </header>

      {pageError && (
        <div className={styles.alertError}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{pageError}</span>
        </div>
      )}

      {pageSuccess && (
        <div className={styles.alertSuccess}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{pageSuccess}</span>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "2rem", alignItems: "start" }}>
        {/* Left Column: Questions List */}
        <div>
          <section className={styles.tableSection} style={{ padding: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.25rem" }}>
                  Questions ({questions.length})
                </h2>
                <p style={{ margin: "2px 0 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                  Questions administered to learners upon reaching this step.
                </p>
              </div>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => setIsAddQuestionModalOpen(true)}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>Add Question</span>
              </button>
            </div>

            {questions.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)", background: "var(--bg-soft)", borderRadius: "8px" }}>
                No questions in this quiz yet. Click <strong>Add Question</strong> to author questions.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {questions.map((q, idx) => (
                  <div
                    key={q.id}
                    className={styles.questionCard}
                    style={{ margin: 0 }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                      <strong style={{ fontSize: "0.95rem", color: "var(--text-primary)", flex: 1 }}>
                        {idx + 1}. {q.text}
                      </strong>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <span className={styles.pointsBadge}>
                          {q.points || 1} pt{q.points !== 1 ? "s" : ""}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteQuestionError(null);
                            setQuestionToDelete(q);
                          }}
                          className={styles.removeBtn}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>

                    {q.explanation && (
                      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontStyle: "italic", margin: "0 0 10px" }}>
                        Explanation: {q.explanation}
                      </p>
                    )}

                    <ul style={{ listStyleType: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
                      {(q.options || []).map((opt) => (
                        <li
                          key={opt.id || opt.text}
                          style={{
                            padding: "6px 12px",
                            borderRadius: "6px",
                            fontSize: "0.85rem",
                            border: opt.isCorrect ? "1px solid #86efac" : "1px solid var(--border-light)",
                            backgroundColor: opt.isCorrect ? "#f0fdf4" : "var(--bg-soft)",
                            color: opt.isCorrect ? "#166534" : "var(--text-primary)",
                            fontWeight: opt.isCorrect ? 600 : 400,
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <span>{opt.text}</span>
                          {opt.isCorrect && (
                            <span className={styles.correctBadge}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              <span>Correct Option</span>
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Quiz Settings Form */}
        <div>
          <form onSubmit={handleSaveSettings} className={styles.tableSection} style={{ padding: "1.5rem" }}>
            <h2 style={{ margin: "0 0 1rem 0", fontSize: "1.15rem" }}>Quiz Parameters</h2>

            <div className={styles.formGroup} style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px" }}>
                Passing Score (%) <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={passMark}
                onChange={(e) => setPassMark(Number(e.target.value))}
                className={styles.formInput}
                required
                style={{ width: "100%" }}
              />
            </div>

            <div className={styles.formGroup} style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px" }}>
                Max Attempts Before Lock
              </label>
              <input
                type="number"
                min={1}
                value={maxAttempts}
                onChange={(e) => setMaxAttempts(Number(e.target.value))}
                className={styles.formInput}
                required
                style={{ width: "100%" }}
              />
            </div>

            <div className={styles.formGroup} style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px" }}>
                Retry Cooldown Period (Hours)
              </label>
              <input
                type="number"
                min={0}
                value={cooldownHours}
                onChange={(e) => setCooldownHours(Number(e.target.value))}
                className={styles.formInput}
                required
                style={{ width: "100%" }}
              />
            </div>

            <div className={styles.formGroup} style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px" }}>
                Random Sample Pool Size (Optional)
              </label>
              <input
                type="number"
                min={1}
                placeholder="Leave blank for all questions"
                value={questionCount}
                onChange={(e) => setQuestionCount(e.target.value === "" ? "" : Number(e.target.value))}
                className={styles.formInput}
                style={{ width: "100%" }}
              />
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                If set, questions are randomly sampled from the bank.
              </span>
            </div>

            <div className={styles.formGroup} style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px" }}>
                Revision / Retry Guidance
              </label>
              <textarea
                rows={2}
                placeholder="Instructions displayed to learners who fail this quiz..."
                value={retryGuidance}
                onChange={(e) => setRetryGuidance(e.target.value)}
                className={styles.formInput}
                style={{ width: "100%" }}
              />
            </div>

            <button
              type="submit"
              className={styles.primaryBtn}
              disabled={savingSettings}
              style={{ width: "100%", padding: "10px" }}
            >
              {savingSettings ? "Saving Settings..." : "Save Configuration"}
            </button>
          </form>
        </div>
      </div>

      {/* Add Question Modal */}
      {isAddQuestionModalOpen && (
        <div className={styles.modalOverlay} onClick={() => !savingQuestion && setIsAddQuestionModalOpen(false)}>
          <div className={styles.modalContent} style={{ maxWidth: "620px" }} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2>Add Quiz Question</h2>
                <p className={styles.modalIntro}>Create a new question prompt with points and verified options</p>
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setIsAddQuestionModalOpen(false)}
                disabled={savingQuestion}
                aria-label="Close modal"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreateQuestionSubmit} className={styles.modalForm}>
              <div className={styles.modalBody}>
                {questionError && (
                  <div className={styles.alertError} style={{ margin: 0 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>{questionError}</span>
                  </div>
                )}

                <div className={styles.formGroup}>
                  <label>
                    Question Prompt <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Enter the question text (e.g. Which tool fosters resilience in Step 3?)..."
                    value={newQuestionText}
                    onChange={(e) => setNewQuestionText(e.target.value)}
                    required
                  />
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label>Points</label>
                    <input
                      type="number"
                      min={1}
                      value={newQuestionPoints}
                      onChange={(e) => setNewQuestionPoints(parseInt(e.target.value, 10) || 1)}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>
                      Explanation <span className={styles.optionalLabel}>(Optional)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Why this answer is correct..."
                      value={newQuestionExplanation}
                      onChange={(e) => setNewQuestionExplanation(e.target.value)}
                    />
                  </div>
                </div>

                {/* Options Editor */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                      Answer Options (radio selects correct answer) <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleAddOption}
                      className={styles.addOptionBtn}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      <span>Add Option</span>
                    </button>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {newOptions.map((opt, idx) => (
                      <div key={idx} className={styles.optionRow}>
                        <input
                          type="radio"
                          name="correctOption"
                          checked={opt.isCorrect}
                          onChange={() => handleSetCorrectOption(idx)}
                          title="Mark as correct answer"
                          className={styles.optionRadio}
                        />
                        <input
                          type="text"
                          placeholder={`Option ${idx + 1}`}
                          value={opt.text}
                          onChange={(e) => handleOptionTextChange(idx, e.target.value)}
                          className={styles.optionInput}
                          required
                        />
                        {newOptions.length > 2 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveOption(idx)}
                            className={styles.removeBtn}
                            title="Remove option"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setIsAddQuestionModalOpen(false)}
                  disabled={savingQuestion}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={savingQuestion}
                >
                  {savingQuestion ? "Adding..." : "Add Question"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* In-website branded ConfirmDialog for Question Deletion */}
      <ConfirmDialog
        isOpen={Boolean(questionToDelete)}
        onClose={() => {
          if (!isDeletingQuestion) {
            setQuestionToDelete(null);
            setDeleteQuestionError(null);
          }
        }}
        onConfirm={confirmDeleteQuestion}
        title="Delete Assessment Question"
        subtitle={quiz?.step?.title ? `Step: ${quiz.step.title}` : undefined}
        description={
          <>
            Are you sure you want to delete this question?
            <div style={{ marginTop: "8px", padding: "10px", background: "#f8f5f0", borderRadius: "6px", fontStyle: "italic", fontSize: "0.88rem" }}>
              &ldquo;{questionToDelete?.text}&rdquo;
            </div>
          </>
        }
        tone="danger"
        confirmText={isDeletingQuestion ? "Deleting..." : "Delete Question"}
        cancelText="Cancel"
        isLoading={isDeletingQuestion}
        error={deleteQuestionError}
        itemDetails={
          questionToDelete
            ? [
                { label: "Points", value: `${questionToDelete.points || 1} pt` },
                { label: "Answer Options", value: `${questionToDelete.options?.length || 0} options` },
              ]
            : []
        }
      />
    </div>
  );
}
