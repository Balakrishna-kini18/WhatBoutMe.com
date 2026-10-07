"use client";

import { useEffect, useState, use, FormEvent } from "react";
import styles from "../../../page.module.css";
import Link from "next/link";
import { API_URL, errorMessage } from "../../../lib/api";

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

  async function loadQuizData() {
    setLoading(true);
    setPageError(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/quizzes/${quizId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
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

      // Load questions
      const qRes = await fetch(`${API_URL}/quizzes/${quizId}/questions`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (qRes.ok) {
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

  // Delete Question
  async function handleDeleteQuestion(questionId: string) {
    if (!window.confirm("Are you sure you want to delete this question?")) return;

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/quizzes/questions/${questionId}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to delete question"));
      }

      setPageSuccess("Question removed.");
      await loadQuizData();
    } catch (err: any) {
      setPageError(err.message);
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
      <header className={styles.header}>
        <div className={styles.headerText}>
          <Link href="/quizzes" className={styles.backLink}>← Back to Quizzes</Link>
          <h1 className={styles.title}>
            Edit Assessment: {quiz.step ? `Step ${quiz.step.sequence}: ${quiz.step.title}` : `Quiz #${quiz.id}`}
          </h1>
          <p className={styles.subtitle}>
            Manage question pool, passing score, attempt limits, and cooldown timer parameters.
          </p>
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

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "2rem", alignItems: "start" }}>
        {/* Left Column: Questions List */}
        <div>
          <section className={styles.tableSection} style={{ padding: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.25rem" }}>
                  Questions ({questions.length})
                </h2>
                <p style={{ margin: "2px 0 0", fontSize: "0.85rem", color: "#64748b" }}>
                  Questions administered to learners upon reaching this step.
                </p>
              </div>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => setIsAddQuestionModalOpen(true)}
              >
                + Add Question
              </button>
            </div>

            {questions.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#64748b", background: "#f8fafc", borderRadius: "8px" }}>
                No questions in this quiz yet. Click <strong>+ Add Question</strong> to author questions.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {questions.map((q, idx) => (
                  <div
                    key={q.id}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      padding: "1.25rem",
                      backgroundColor: "white",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                      <strong style={{ fontSize: "0.95rem", color: "#1e293b", flex: 1 }}>
                        {idx + 1}. {q.text}
                      </strong>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <span style={{ fontSize: "0.75rem", backgroundColor: "#f1f5f9", padding: "2px 8px", borderRadius: "4px", color: "#475569" }}>
                          {q.points || 1} pt{q.points !== 1 ? "s" : ""}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteQuestion(q.id)}
                          style={{
                            padding: "2px 8px",
                            fontSize: "0.75rem",
                            borderRadius: "4px",
                            border: "1px solid #fca5a5",
                            backgroundColor: "#fff1f2",
                            color: "#9f1239",
                            cursor: "pointer",
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {q.explanation && (
                      <p style={{ fontSize: "0.8rem", color: "#64748b", fontStyle: "italic", margin: "0 0 10px" }}>
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
                            border: opt.isCorrect ? "1px solid #86efac" : "1px solid #e2e8f0",
                            backgroundColor: opt.isCorrect ? "#f0fdf4" : "#f8fafc",
                            color: opt.isCorrect ? "#166534" : "#334155",
                            fontWeight: opt.isCorrect ? 600 : 400,
                            display: "flex",
                            justifyContent: "space-between",
                          }}
                        >
                          <span>{opt.text}</span>
                          {opt.isCorrect && <span>✓ Correct Option</span>}
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
        <div className={styles.modalOverlay}>
          <div className={styles.modal} style={{ maxWidth: "600px" }}>
            <div className={styles.modalHeader}>
              <h2 style={{ fontSize: "1.25rem", margin: 0 }}>Add Quiz Question</h2>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setIsAddQuestionModalOpen(false)}
                disabled={savingQuestion}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateQuestionSubmit}>
              <div className={styles.modalBody}>
                {questionError && (
                  <div style={{ backgroundColor: "#fef2f2", border: "1px solid #f87171", color: "#991b1b", padding: "10px", borderRadius: "6px", marginBottom: "1rem", fontSize: "0.85rem" }}>
                    {questionError}
                  </div>
                )}

                <div className={styles.formGroup} style={{ marginBottom: "1rem" }}>
                  <label style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                    Question Prompt <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <textarea
                    rows={2}
                    className={styles.formInput}
                    placeholder="Enter the question text (e.g. Which tool fosters resilience in Step 3?)..."
                    value={newQuestionText}
                    onChange={(e) => setNewQuestionText(e.target.value)}
                    required
                    style={{ width: "100%", marginTop: "4px" }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "1rem" }}>
                  <div className={styles.formGroup}>
                    <label style={{ fontWeight: 600, fontSize: "0.85rem" }}>Points</label>
                    <input
                      type="number"
                      min={1}
                      value={newQuestionPoints}
                      onChange={(e) => setNewQuestionPoints(parseInt(e.target.value, 10) || 1)}
                      className={styles.formInput}
                      style={{ width: "100%", marginTop: "4px" }}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label style={{ fontWeight: 600, fontSize: "0.85rem" }}>Explanation (Optional)</label>
                    <input
                      type="text"
                      placeholder="Why this answer is correct..."
                      value={newQuestionExplanation}
                      onChange={(e) => setNewQuestionExplanation(e.target.value)}
                      className={styles.formInput}
                      style={{ width: "100%", marginTop: "4px" }}
                    />
                  </div>
                </div>

                {/* Options Editor */}
                <div style={{ marginBottom: "1rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <label style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                      Answer Options (select the radio for the correct option) <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleAddOption}
                      style={{ fontSize: "0.75rem", padding: "2px 8px", borderRadius: "4px", border: "1px solid #cbd5e1", background: "white", cursor: "pointer" }}
                    >
                      + Add Option
                    </button>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {newOptions.map((opt, idx) => (
                      <div key={idx} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <input
                          type="radio"
                          name="correctOption"
                          checked={opt.isCorrect}
                          onChange={() => handleSetCorrectOption(idx)}
                          title="Mark as correct answer"
                          style={{ accentColor: "#16a34a", width: "16px", height: "16px" }}
                        />
                        <input
                          type="text"
                          placeholder={`Option ${idx + 1}`}
                          value={opt.text}
                          onChange={(e) => handleOptionTextChange(idx, e.target.value)}
                          className={styles.formInput}
                          required
                          style={{ flex: 1 }}
                        />
                        {newOptions.length > 2 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveOption(idx)}
                            style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}
                            title="Remove option"
                          >
                            ✕
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
    </div>
  );
}
