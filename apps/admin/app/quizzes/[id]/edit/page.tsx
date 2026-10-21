"use client";

import { useEffect, useState, use, FormEvent } from "react";
import styles from "../../../page.module.css";
import Link from "next/link";
import { API_URL, cachedFetch, errorMessage, uploadFile } from "../../../lib/api";
import { ConfirmDialog, useToast } from "../../../components";

interface Option {
  id?: string;
  text: string;
  imageUrl?: string | null;
  isCorrect: boolean;
  order?: number;
}

interface Question {
  id: string;
  text: string;
  type?: string;
  imageUrl?: string | null;
  gradingMode?: string | null;
  minCharacters?: number | null;
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
  const [newQuestionType, setNewQuestionType] = useState<"SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TEXT_BOX">("SINGLE_CHOICE");
  const [newQuestionText, setNewQuestionText] = useState("");
  const [newQuestionImageUrl, setNewQuestionImageUrl] = useState("");
  const [newQuestionGradingMode, setNewQuestionGradingMode] = useState<"SELF_REFLECTION_AUTO_PASS" | "MANUAL_REVIEW">("SELF_REFLECTION_AUTO_PASS");
  const [newQuestionMinCharacters, setNewQuestionMinCharacters] = useState(10);
  const [newQuestionPoints, setNewQuestionPoints] = useState(1);
  const [newQuestionExplanation, setNewQuestionExplanation] = useState("");
  // Default 4 choices per question (expandable 2..8)
  const [newOptions, setNewOptions] = useState<Option[]>([
    { text: "", imageUrl: "", isCorrect: true },
    { text: "", imageUrl: "", isCorrect: false },
    { text: "", imageUrl: "", isCorrect: false },
    { text: "", imageUrl: "", isCorrect: false },
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
      } else {
        payload.questionCount = null;
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
        throw new Error(await errorMessage(res, "Failed to update quiz settings"));
      }

      setPageSuccess("Quiz settings saved successfully.");
      toastSuccess("Quiz configuration updated.");
      await loadQuizData();
    } catch (err: any) {
      setPageError(err.message);
      toastError(err.message);
    } finally {
      setSavingSettings(false);
    }
  }

  // Question Type Switching
  const handleTypeChange = (type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TEXT_BOX") => {
    setNewQuestionType(type);
    if (type !== "TEXT_BOX") {
      if (newOptions.length < 2) {
        setNewOptions([
          { text: "", imageUrl: "", isCorrect: true },
          { text: "", imageUrl: "", isCorrect: false },
          { text: "", imageUrl: "", isCorrect: false },
          { text: "", imageUrl: "", isCorrect: false },
        ]);
      } else if (!newOptions.some((o) => o.isCorrect)) {
        setNewOptions((prev) => {
          const next = [...prev];
          if (next[0]) next[0].isCorrect = true;
          return next;
        });
      }
      if (type === "SINGLE_CHOICE") {
        let found = false;
        setNewOptions((prev) =>
          prev.map((o) => {
            if (o.isCorrect && !found) {
              found = true;
              return o;
            }
            return { ...o, isCorrect: false };
          })
        );
      }
    }
  };

  // Image upload helpers
  const handlePromptUpload = async (file: File) => {
    try {
      let url = "";
      try {
        url = await uploadFile(file);
      } catch {
        url = await new Promise((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result as string);
          reader.onerror = rej;
          reader.readAsDataURL(file);
        });
      }
      setNewQuestionImageUrl(url);
    } catch (err: any) {
      setQuestionError("Image upload failed: " + (err.message || "Unknown error"));
    }
  };

  const handleOptionImageUpload = async (idx: number, file: File) => {
    try {
      let url = "";
      try {
        url = await uploadFile(file);
      } catch {
        url = await new Promise((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result as string);
          reader.onerror = rej;
          reader.readAsDataURL(file);
        });
      }
      setNewOptions((prev) => {
        const next = [...prev];
        if (next[idx]) next[idx] = { ...next[idx], imageUrl: url };
        return next;
      });
    } catch (err: any) {
      setQuestionError("Option image upload failed: " + (err.message || "Unknown error"));
    }
  };

  // Options Handlers
  function handleAddOption() {
    if (newOptions.length >= 8) return;
    setNewOptions((prev) => [...prev, { text: "", imageUrl: "", isCorrect: false }]);
  }

  function handleRemoveOption(idx: number) {
    if (newOptions.length <= 2) return;
    setNewOptions((prev) => {
      const removedWasCorrect = prev[idx]?.isCorrect;
      const next = prev.filter((_, i) => i !== idx);
      if (removedWasCorrect && !next.some((o) => o.isCorrect) && next[0]) {
        next[0].isCorrect = true;
      }
      return next;
    });
  }

  function handleOptionTextChange(idx: number, text: string) {
    setNewOptions((prev) => {
      const next = [...prev];
      if (next[idx]) next[idx] = { ...next[idx], text };
      return next;
    });
  }

  function handleToggleCorrectOption(idx: number) {
    setNewOptions((prev) => {
      if (newQuestionType === "SINGLE_CHOICE") {
        return prev.map((opt, i) => ({
          ...opt,
          isCorrect: i === idx,
        }));
      } else {
        return prev.map((opt, i) => {
          if (i === idx) {
            return { ...opt, isCorrect: !opt.isCorrect };
          }
          return opt;
        });
      }
    });
  }

  async function handleCreateQuestionSubmit(e: FormEvent) {
    e.preventDefault();
    if (newQuestionText.trim().length < 5) {
      setQuestionError("Question text must be at least 5 characters.");
      return;
    }

    const isText = newQuestionType === "TEXT_BOX";
    const backendType =
      newQuestionType === "TEXT_BOX"
        ? "SHORT_ANSWER"
        : newQuestionType === "MULTIPLE_CHOICE"
        ? "MULTI_SELECT"
        : "MULTIPLE_CHOICE";

    let filledOptions: Option[] = [];
    if (!isText) {
      filledOptions = newOptions.filter((o) => o.text.trim().length > 0 || Boolean(o.imageUrl));
      if (filledOptions.length < 2) {
        setQuestionError("At least 2 choices are required.");
        return;
      }
      if (!filledOptions.some((o) => o.isCorrect)) {
        setQuestionError("Please designate at least one option as the correct answer.");
        return;
      }
    }

    setSavingQuestion(true);
    setQuestionError(null);

    try {
      const token = localStorage.getItem("token");
      const payload: any = {
        text: newQuestionText.trim(),
        type: backendType,
        imageUrl: newQuestionImageUrl.trim() || undefined,
        gradingMode: newQuestionGradingMode,
        minCharacters: newQuestionMinCharacters,
        points: Number(newQuestionPoints) || 1,
        explanation: newQuestionExplanation.trim() || undefined,
        options: isText
          ? undefined
          : filledOptions.map((o, idx) => ({
              text: o.text.trim() || `Option ${idx + 1}`,
              imageUrl: o.imageUrl?.trim() || undefined,
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
      setNewQuestionImageUrl("");
      setNewQuestionPoints(1);
      setNewQuestionExplanation("");
      setNewOptions([
        { text: "", imageUrl: "", isCorrect: true },
        { text: "", imageUrl: "", isCorrect: false },
        { text: "", imageUrl: "", isCorrect: false },
        { text: "", imageUrl: "", isCorrect: false },
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
        <div style={{ textAlign: "center", padding: "80px 20px" }}>
          <h2>Loading assessment...</h2>
          <p style={{ color: "var(--text-muted)" }}>Fetching questions and retry policies from server...</p>
        </div>
      </div>
    );
  }

  const hasAnyOptionImages = newOptions.some((opt) => Boolean(opt.imageUrl));

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
            {quiz?.step?.title ? `Assessment: ${quiz.step.title}` : "Visual Question Bank"}
          </h1>
          <p className={styles.subtitle}>
            Step {quiz?.step?.sequence ?? "?"} Knowledge Check • Visual image questions, multi-select checkboxes, and written reflection evaluation
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
                  Visual questions administered to learners upon reaching this step.
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
                No questions in this quiz yet. Click <strong>Add Question</strong> to author visual questions.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {questions.map((q, idx) => {
                  const isTextQ = q.type === "SHORT_ANSWER" || q.type === "TEXT_BOX";
                  const isMultiQ = q.type === "MULTI_SELECT";
                  const qHasOptionImages = !isTextQ && q.options?.some((opt) => Boolean(opt.imageUrl));

                  return (
                    <div
                      key={q.id}
                      className={styles.questionCard}
                      style={{ margin: 0, padding: "16px", borderRadius: "10px", border: "1px solid var(--border-light)" }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flex: 1 }}>
                          <strong style={{ fontSize: "0.98rem", color: "var(--text-primary)" }}>
                            {idx + 1}. {q.text}
                          </strong>
                          <span style={{
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: "12px",
                            background: isTextQ ? "#ecfdf5" : isMultiQ ? "#fef3c7" : "#eff6ff",
                            color: isTextQ ? "#065f46" : isMultiQ ? "#92400e" : "#1e40af",
                            border: `1px solid ${isTextQ ? "#a7f3d0" : isMultiQ ? "#fde68a" : "#bfdbfe"}`
                          }}>
                            {isTextQ ? "Written Reflection" : isMultiQ ? "Multiple Choice (Checkboxes)" : "Single Choice"}
                          </span>
                        </div>
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

                      {/* Question Image Preview */}
                      {q.imageUrl && (
                        <div style={{ marginBottom: "12px", borderRadius: 8, overflow: "hidden", maxHeight: 180, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                          <img
                            src={q.imageUrl}
                            alt="Question illustration"
                            style={{ width: "100%", maxHeight: 180, objectFit: "contain", display: "block" }}
                          />
                        </div>
                      )}

                      {q.explanation && (
                        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontStyle: "italic", margin: "0 0 10px" }}>
                          Explanation: {q.explanation}
                        </p>
                      )}

                      {isTextQ ? (
                        <div style={{ padding: "10px 14px", background: "#f8fafc", borderRadius: 8, border: "1px dashed #cbd5e1" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem" }}>
                            <span style={{ fontWeight: 600, color: "#334155" }}>
                              Minimum {q.minCharacters ?? 10} characters written reflection
                            </span>
                            <span style={{ color: q.gradingMode === "MANUAL_REVIEW" ? "#b45309" : "#15803d", fontWeight: 600 }}>
                              {q.gradingMode === "MANUAL_REVIEW" ? "Held for manual grading" : "Auto-pass on length threshold"}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div
                          style={
                            qHasOptionImages
                              ? {
                                  display: "grid",
                                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                                  gap: "8px",
                                }
                              : {
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "6px",
                                }
                          }
                        >
                          {(q.options || []).map((opt) => (
                            <div
                              key={opt.id || opt.text}
                              style={{
                                padding: qHasOptionImages ? "8px" : "8px 12px",
                                borderRadius: "6px",
                                fontSize: "0.85rem",
                                border: opt.isCorrect ? "1px solid #86efac" : "1px solid var(--border-light)",
                                backgroundColor: opt.isCorrect ? "#f0fdf4" : "var(--bg-soft)",
                                color: opt.isCorrect ? "#166534" : "var(--text-primary)",
                                fontWeight: opt.isCorrect ? 600 : 400,
                                display: "flex",
                                flexDirection: qHasOptionImages ? "column" : "row",
                                justifyContent: "space-between",
                                alignItems: qHasOptionImages ? "stretch" : "center",
                                gap: 6,
                              }}
                            >
                              {opt.imageUrl && (
                                <div style={{ height: 100, borderRadius: 4, overflow: "hidden", background: "#e2e8f0", marginBottom: 6 }}>
                                  <img
                                    src={opt.imageUrl}
                                    alt={opt.text}
                                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                  />
                                </div>
                              )}
                              <span>{opt.text}</span>
                              {opt.isCorrect && (
                                <span style={{ color: "#16a34a", fontSize: "0.75rem", fontWeight: 700 }}>
                                  ✓ Correct
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Quiz Policy Settings */}
        <div>
          <form onSubmit={handleSaveSettings} className={styles.tableSection} style={{ padding: "1.5rem" }}>
            <h2 style={{ margin: "0 0 1.25rem", fontSize: "1.1rem" }}>
              Assessment Parameters
            </h2>

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
                Max Retries Allowed <span style={{ color: "#ef4444" }}>*</span>
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
          <div className={styles.modalContent} style={{ maxWidth: "660px", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2>Add Visual Question</h2>
                <p className={styles.modalIntro}>Create questions with images, checkboxes, or text reflections</p>
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

                {/* Question Type Selector */}
                <div className={styles.formGroup}>
                  <label>Question Format <span style={{ color: "#ef4444" }}>*</span></label>
                  <select
                    value={newQuestionType}
                    onChange={(e) => handleTypeChange(e.target.value as any)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: "1px solid #cbd5e1",
                      fontSize: "0.9rem",
                      fontWeight: 600,
                    }}
                  >
                    <option value="SINGLE_CHOICE">Single Choice (Radio buttons — exactly 1 correct)</option>
                    <option value="MULTIPLE_CHOICE">Multiple Choice (Checkboxes — 1+ correct)</option>
                    <option value="TEXT_BOX">Text Box (Open-ended written self-reflection)</option>
                  </select>
                </div>

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

                {/* Prompt Image Upload */}
                <div style={{ background: "#f8fafc", padding: "10px 14px", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#475569", textTransform: "uppercase" }}>
                      Question Prompt Visual (PNG/JPEG)
                    </label>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp"
                        id="new_q_prompt_img"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handlePromptUpload(file);
                        }}
                      />
                      <label
                        htmlFor="new_q_prompt_img"
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          padding: "4px 10px",
                          borderRadius: 6,
                          background: "#ffffff",
                          border: "1px solid #cbd5e1",
                          cursor: "pointer",
                          color: "var(--accent-primary, #0284c7)",
                        }}
                      >
                        {newQuestionImageUrl ? "Replace Image" : "+ Attach Image"}
                      </label>
                      {newQuestionImageUrl && (
                        <button
                          type="button"
                          onClick={() => setNewQuestionImageUrl("")}
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            padding: "4px 8px",
                            borderRadius: 6,
                            background: "#fee2e2",
                            border: "1px solid #fca5a5",
                            color: "#b91c1c",
                            cursor: "pointer",
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>

                  {newQuestionImageUrl && (
                    <div style={{ marginTop: 8, borderRadius: 6, overflow: "hidden", maxHeight: 160, background: "#ffffff", border: "1px solid #cbd5e1" }}>
                      <img
                        src={newQuestionImageUrl}
                        alt="Question visual preview"
                        style={{ width: "100%", maxHeight: 160, objectFit: "contain", display: "block" }}
                      />
                    </div>
                  )}
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

                {/* Text Box Settings vs Choice Options */}
                {newQuestionType === "TEXT_BOX" ? (
                  <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "14px", borderRadius: 8 }}>
                    <h4 style={{ margin: "0 0 8px", fontSize: "0.88rem", color: "#166534" }}>
                      Written Reflection Evaluation Configuration
                    </h4>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 12 }}>
                      <div>
                        <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "#15803d", display: "block", marginBottom: 4 }}>
                          Grading Policy
                        </label>
                        <select
                          value={newQuestionGradingMode}
                          onChange={(e) => setNewQuestionGradingMode(e.target.value as any)}
                          style={{
                            width: "100%",
                            padding: "6px 8px",
                            borderRadius: 6,
                            border: "1px solid #86efac",
                            fontSize: "0.85rem",
                            background: "#ffffff",
                          }}
                        >
                          <option value="SELF_REFLECTION_AUTO_PASS">
                            Mode A: Self-Reflection Auto-Pass (Recommended)
                          </option>
                          <option value="MANUAL_REVIEW">
                            Mode B: Staff Manual Review Queue
                          </option>
                        </select>
                      </div>

                      <div>
                        <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "#15803d", display: "block", marginBottom: 4 }}>
                          Min Characters
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={newQuestionMinCharacters}
                          onChange={(e) => setNewQuestionMinCharacters(parseInt(e.target.value, 10) || 10)}
                          style={{
                            width: "100%",
                            padding: "6px 8px",
                            borderRadius: 6,
                            border: "1px solid #86efac",
                            fontSize: "0.85rem",
                            background: "#ffffff",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Choice Options Editor */
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                        {newQuestionType === "MULTIPLE_CHOICE"
                          ? "Answer Choices (Checkboxes mark all correct answers)"
                          : "Answer Choices (Radio marks the single correct answer)"}{" "}
                        <span style={{ color: "#ef4444" }}>*</span>
                      </label>
                      {newOptions.length < 8 && (
                        <button
                          type="button"
                          onClick={handleAddOption}
                          className={styles.addOptionBtn}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                          <span>Add Option ({newOptions.length}/8)</span>
                        </button>
                      )}
                    </div>

                    <div
                      style={
                        hasAnyOptionImages
                          ? {
                              display: "grid",
                              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                              gap: "10px",
                            }
                          : {
                              display: "flex",
                              flexDirection: "column",
                              gap: "8px",
                            }
                      }
                    >
                      {newOptions.map((opt, idx) => (
                        <div
                          key={idx}
                          style={{
                            border: opt.isCorrect ? "2px solid var(--accent-primary, #0284c7)" : "1px solid var(--border-light, #e2e8f0)",
                            borderRadius: 8,
                            padding: "8px 10px",
                            background: opt.isCorrect ? "rgba(2, 132, 199, 0.04)" : "#ffffff",
                            display: "flex",
                            flexDirection: hasAnyOptionImages ? "column" : "row",
                            alignItems: hasAnyOptionImages ? "stretch" : "center",
                            gap: 8,
                          }}
                        >
                          {opt.imageUrl ? (
                            <div style={{ position: "relative", height: 100, borderRadius: 6, overflow: "hidden", background: "#f1f5f9", marginBottom: 6 }}>
                              <img
                                src={opt.imageUrl}
                                alt={`Option ${idx + 1}`}
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setNewOptions((prev) => {
                                    const next = [...prev];
                                    if (next[idx]) next[idx] = { ...next[idx], imageUrl: "" };
                                    return next;
                                  })
                                }
                                style={{
                                  position: "absolute",
                                  top: 4,
                                  right: 4,
                                  background: "rgba(0,0,0,0.6)",
                                  color: "#ffffff",
                                  border: "none",
                                  borderRadius: 4,
                                  padding: "2px 6px",
                                  fontSize: "0.7rem",
                                  cursor: "pointer",
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <div>
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/jpg,image/webp"
                                id={`edit_opt_img_${idx}`}
                                style={{ display: "none" }}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleOptionImageUpload(idx, file);
                                }}
                              />
                              <label
                                htmlFor={`edit_opt_img_${idx}`}
                                style={{
                                  fontSize: "0.72rem",
                                  padding: "3px 6px",
                                  borderRadius: 4,
                                  background: "#f1f5f9",
                                  border: "1px solid #cbd5e1",
                                  cursor: "pointer",
                                  color: "#475569",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                +Img
                              </label>
                            </div>
                          )}

                          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                            <input
                              type={newQuestionType === "MULTIPLE_CHOICE" ? "checkbox" : "radio"}
                              name="correctOption"
                              checked={opt.isCorrect}
                              onChange={() => handleToggleCorrectOption(idx)}
                              title="Mark as correct answer"
                              className={styles.optionRadio}
                              style={{ cursor: "pointer" }}
                            />
                            <input
                              type="text"
                              placeholder={`Option ${idx + 1}`}
                              value={opt.text}
                              onChange={(e) => handleOptionTextChange(idx, e.target.value)}
                              className={styles.optionInput}
                              style={{ flex: 1 }}
                              required={!opt.imageUrl}
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
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
                  {savingQuestion ? "Adding Question..." : "Add Question"}
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
