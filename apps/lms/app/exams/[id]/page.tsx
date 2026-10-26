"use client";

import { useEffect, useState, use, useRef } from "react";
import Link from "next/link";
import { API_URL, getAuthHeaders, parseApiError } from "../../lib/api";
import styles from "../../page.module.css";
import dash from "../../layout.module.css";

interface ExamQuestionOption {
  id: string;
  text: string;
  imageUrl?: string;
  order: number;
}

interface ExamQuestion {
  id: string;
  text: string;
  type: string;
  imageUrl?: string;
  gradingMode?: string;
  minCharacters?: number;
  points: number;
  stepId: string | null;
  stepSequence: number | null;
  stepTitle: string | null;
  options: ExamQuestionOption[];
}

interface ExamConfig {
  id: string;
  programId: string;
  title: string;
  description: string | null;
  questionCount: number;
  passMark: number;
  timeLimitMin: number;
  maxAttempts: number;
  cooldownHours: number;
  status: string;
}

interface ActiveAttempt {
  attemptId: string;
  attemptNumber: number;
  examId: string;
  title: string;
  status: "IN_PROGRESS" | "PASSED" | "FAILED" | "TIMED_OUT";
  passMark: number;
  questionCount: number;
  timeLimitMin: number;
  startedAt: string;
  expiresAt: string;
  questions: ExamQuestion[];
}

interface ExamResult {
  attemptId?: string;
  attemptNumber?: number;
  examId?: string;
  status: "PASSED" | "FAILED" | "TIMED_OUT";
  score: number;
  passed: boolean;
  passMark: number;
  totalPossiblePoints?: number;
  earnedPoints?: number;
  attemptsUsed?: number;
  maxAttempts?: number;
  attemptsRemaining?: number;
  isCooldownActive?: boolean;
  cooldownUntil?: string | null;
  cooldownSecondsRemaining?: number;
  canRetry?: boolean;
  stepToRevisit?: {
    id: string;
    sequence: number;
    title: string;
  } | null;
  retryGuidance?: string | null;
}

export default function ExamPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const unwrappedParams = typeof (params as any)?.then === "function" ? use(params as any) : params;
  const paramId = (unwrappedParams as { id: string }).id;

  const [examId, setExamId] = useState<string>(paramId);
  const [config, setConfig] = useState<ExamConfig | null>(null);
  const [activeAttempt, setActiveAttempt] = useState<ActiveAttempt | null>(null);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Runner state
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitWarning, setSubmitWarning] = useState<string | null>(null);

  // Initial load: resolve exam ID and load active attempt / latest status
  useEffect(() => {
    async function initExam() {
      setLoading(true);
      setError(null);
      try {
        let resolvedExamId = paramId;

        // Try fetching config directly by program ID or alias
        const configRes = await fetch(`${API_URL}/programs/${paramId}/exam`, {
          headers: getAuthHeaders(),
        });

        if (configRes.ok) {
          const cfg: ExamConfig = await configRes.json();
          setConfig(cfg);
          resolvedExamId = cfg.id;
          setExamId(cfg.id);
        }

        // Fetch active attempt or recent attempt status
        const attemptRes = await fetch(`${API_URL}/exams/${resolvedExamId}/attempt`, {
          headers: getAuthHeaders(),
        });

        if (attemptRes.ok) {
          const data = await attemptRes.json();
          if (data) {
            if (data.status === "IN_PROGRESS" && data.questions) {
              setActiveAttempt(data);
              // Restore any previously saved answers from attempt
              const savedList = (data as any)?.answers?.savedAnswers;
              if (Array.isArray(savedList)) {
                const restored: Record<string, string> = {};
                for (const ans of savedList) {
                  if (ans.questionId) {
                    if (ans.selectedOptionIds && ans.selectedOptionIds.length > 0) {
                      restored[ans.questionId] = ans.selectedOptionIds.join(",");
                    } else if (ans.selectedOptionId || ans.optionId) {
                      restored[ans.questionId] = ans.selectedOptionId || ans.optionId;
                    } else if (ans.textAnswer || ans.textResponse) {
                      restored[ans.questionId] = ans.textAnswer || ans.textResponse;
                    }
                  }
                }
                setSelectedAnswers(restored);
              }
              // Calculate remaining seconds
              const expires = new Date(data.expiresAt).getTime();
              const now = Date.now();
              const remaining = Math.max(0, Math.floor((expires - now) / 1000));
              setSecondsRemaining(remaining);
            } else if (data.status === "PASSED" || data.status === "FAILED") {
              setResult(data);
            }
          }
        }
      } catch (err: any) {
        console.error("Exam load error:", err);
        setError(err.message || "Failed to load exam details");
      } finally {
        setLoading(false);
      }
    }

    initExam();
  }, [paramId]);

  // Debounced autosave effect: saves learner answers every 2s
  const autosaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!activeAttempt || activeAttempt.status !== "IN_PROGRESS" || Object.keys(selectedAnswers).length === 0) {
      return;
    }
    if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);

    autosaveTimeoutRef.current = setTimeout(async () => {
      try {
        const answersPayload = (activeAttempt.questions || []).map((q) => {
          const ans = selectedAnswers[q.id];
          const isMulti = q.type === "MULTI_SELECT";
          const isText = q.type === "SHORT_ANSWER" || q.type === "TEXT_BOX";
          return {
            questionId: q.id,
            optionId: !isMulti && !isText ? ans : undefined,
            selectedOptionId: !isMulti && !isText ? ans : undefined,
            selectedOptionIds: isMulti && ans ? ans.split(",").filter(Boolean) : undefined,
            textResponse: isText ? ans : undefined,
            textAnswer: isText ? ans : undefined,
          };
        });

        await fetch(`${API_URL}/exams/${examId}/attempt/answers`, {
          method: "PATCH",
          headers: getAuthHeaders(),
          body: JSON.stringify({ answers: answersPayload }),
        });
      } catch {
        // Background autosave failure is non-blocking
      }
    }, 2000);

    return () => {
      if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);
    };
  }, [selectedAnswers, activeAttempt, examId]);

  // Countdown timer effect
  useEffect(() => {
    if (secondsRemaining === null || !activeAttempt || activeAttempt.status !== "IN_PROGRESS") {
      return;
    }

    if (secondsRemaining <= 0) {
      // Auto-submit when time expires
      handleExamSubmit(true);
      return;
    }

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearInterval(timer);
  }, [secondsRemaining, activeAttempt]);

  // Start exam attempt
  async function handleStartExam() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/exams/${examId}/start`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const err = await parseApiError(res, "Could not start final examination");
        throw new Error(err.message);
      }

      const attempt: ActiveAttempt = await res.json();
      setActiveAttempt(attempt);
      setResult(null);
      setSelectedAnswers({});
      setCurrentQuestionIndex(0);

      const expires = new Date(attempt.expiresAt).getTime();
      const remaining = Math.max(0, Math.floor((expires - Date.now()) / 1000));
      setSecondsRemaining(remaining);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Submit exam answers
  async function handleExamSubmit(isTimeExpired = false) {
    if (!activeAttempt || isSubmitting) return;

    if (!isTimeExpired) {
      const answeredCount = Object.keys(selectedAnswers).length;
      const total = activeAttempt.questions?.length || 50;
      if (answeredCount < total) {
        const confirmIncomplete = window.confirm(
          `You have answered ${answeredCount} of ${total} questions. Are you sure you want to submit your final exam now?`
        );
        if (!confirmIncomplete) return;
      } else {
        const confirmSubmit = window.confirm(
          `You have answered all ${total} questions. Ready to submit for server scoring?`
        );
        if (!confirmSubmit) return;
      }
    }

    setIsSubmitting(true);
    setSubmitWarning(null);

    try {
      const answersPayload = (activeAttempt.questions || []).map((q) => {
        const ans = selectedAnswers[q.id];
        const isMulti = q.type === "MULTI_SELECT";
        const isText = q.type === "SHORT_ANSWER" || q.type === "TEXT_BOX";
        return {
          questionId: q.id,
          optionId: !isMulti && !isText ? ans : undefined,
          selectedOptionId: !isMulti && !isText ? ans : undefined,
          selectedOptionIds: isMulti && ans ? ans.split(",").filter(Boolean) : undefined,
          textResponse: isText ? ans : undefined,
          textAnswer: isText ? ans : undefined,
        };
      });

      const res = await fetch(`${API_URL}/exams/${examId}/submit`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          attemptId: activeAttempt.attemptId || (activeAttempt as any).id,
          id: activeAttempt.attemptId || (activeAttempt as any).id,
          answers: answersPayload,
        }),
      });

      if (!res.ok) {
        const err = await parseApiError(res, "Failed to submit final exam");
        throw new Error(err.message);
      }

      const resData: ExamResult = await res.json();
      setResult(resData);
      setActiveAttempt(null);
      setSecondsRemaining(null);
    } catch (err: any) {
      setSubmitWarning(err.message || "Failed to submit exam attempt. Please retry.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleOptionSelect(questionId: string, optionId: string) {
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionId]: optionId,
    }));
  }

  function handleOptionToggle(questionId: string, optionId: string) {
    setSelectedAnswers((prev) => {
      const current = prev[questionId] ? (prev[questionId] ?? "").split(",").filter(Boolean) : [];
      const next = current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId];
      return {
        ...prev,
        [questionId]: next.join(","),
      };
    });
  }

  function handleTextChange(questionId: string, text: string) {
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionId]: text,
    }));
  }

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div className={dash.page}>
        <div style={{ textAlign: "center", padding: "80px 20px" }}>
          <p style={{ color: "#64748b", fontSize: "1.1rem" }}>
            Loading final certification examination...
          </p>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. ACTIVE EXAM RUNNER
  // ─────────────────────────────────────────────────────────────────────────────
  if (activeAttempt && activeAttempt.questions && activeAttempt.questions.length > 0) {
    const questions = activeAttempt.questions;
    const currentQ = questions[currentQuestionIndex] ?? questions[0];
    if (!currentQ) return null;
    const answeredCount = Object.keys(selectedAnswers).length;
    const totalCount = questions.length;
    const isLastQuestion = currentQuestionIndex === totalCount - 1;

    return (
      <div className={dash.page} style={{ maxWidth: "1000px", margin: "0 auto", padding: "1.5rem" }}>
        {/* Header Bar with Countdown */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "1rem 1.5rem",
            backgroundColor: "#0f172a",
            color: "white",
            borderRadius: "12px",
            marginBottom: "1.5rem",
          }}
        >
          <div>
            <h1 style={{ fontSize: "1.2rem", margin: 0, fontWeight: 700 }}>
              {activeAttempt.title || config?.title || "Final Comprehensive Examination"}
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "#94a3b8" }}>
              Attempt #{activeAttempt.attemptNumber} • Question {currentQuestionIndex + 1} of {totalCount} ({answeredCount} answered)
            </p>
          </div>

          {secondsRemaining !== null && (
            <div
              style={{
                backgroundColor: secondsRemaining < 300 ? "#7f1d1d" : "#1e293b",
                border: secondsRemaining < 300 ? "1px solid #ef4444" : "1px solid #334155",
                padding: "8px 16px",
                borderRadius: "8px",
                textAlign: "right",
              }}
            >
              <span style={{ fontSize: "0.75rem", color: "#94a3b8", display: "block" }}>
                Time Remaining
              </span>
              <strong
                style={{
                  fontSize: "1.3rem",
                  fontVariantNumeric: "tabular-nums",
                  color: secondsRemaining < 300 ? "#fca5a5" : "#f59e0b",
                }}
              >
                {formatTime(secondsRemaining)}
              </strong>
            </div>
          )}
        </div>

        {submitWarning && (
          <div style={{ backgroundColor: "#fef2f2", border: "1px solid #f87171", color: "#991b1b", padding: "12px 16px", borderRadius: "8px", marginBottom: "1rem" }}>
            {submitWarning}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: "1.5rem" }}>
          {/* Main Question Card */}
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "12px",
              padding: "2rem",
              border: "1px solid #e2e8f0",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            {/* Step badge */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <span
                style={{
                  display: "inline-block",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  backgroundColor: "#f1f5f9",
                  color: "#475569",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  textTransform: "uppercase",
                }}
              >
                {currentQ.stepTitle ? `Step ${currentQ.stepSequence}: ${currentQ.stepTitle}` : "Curriculum Assessment"}
              </span>
              <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                Points: {currentQ.points || 1}
              </span>
            </div>

            {currentQ.imageUrl && (
              <div style={{ marginBottom: "1.25rem", borderRadius: "10px", overflow: "hidden", border: "1px solid #e2e8f0", maxWidth: "480px" }}>
                <img
                  src={currentQ.imageUrl}
                  alt={`Question ${currentQuestionIndex + 1} Visual`}
                  style={{ width: "100%", maxHeight: "260px", objectFit: "cover", display: "block" }}
                />
              </div>
            )}

            <h2 style={{ fontSize: "1.15rem", fontWeight: 600, color: "#1e293b", marginBottom: "1.5rem", lineHeight: 1.5 }}>
              Q{currentQuestionIndex + 1}. {currentQ.text}
            </h2>

            {/* Answer Options or Reflection Field */}
            {(() => {
              const isText = currentQ.type === "SHORT_ANSWER" || currentQ.type === "TEXT_BOX";
              const isMulti = currentQ.type === "MULTI_SELECT";
              const hasOptionImages = (currentQ.options || []).some((opt) => Boolean(opt.imageUrl));
              const selectedList = isMulti && selectedAnswers[currentQ.id]
                ? (selectedAnswers[currentQ.id] ?? "").split(",").filter(Boolean)
                : [];

              if (isText) {
                return (
                  <div style={{ marginBottom: "2rem" }}>
                    <textarea
                      rows={4}
                      placeholder="Type your written answer or reflection here..."
                      value={selectedAnswers[currentQ.id] || ""}
                      onChange={(e) => handleTextChange(currentQ.id, e.target.value)}
                      style={{
                        width: "100%",
                        padding: "12px",
                        borderRadius: "8px",
                        border: "1px solid #cbd5e1",
                        fontFamily: "inherit",
                        fontSize: "0.95rem",
                        boxSizing: "border-box",
                      }}
                    />
                    <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "4px" }}>
                      Characters: {(selectedAnswers[currentQ.id] || "").trim().length} / {currentQ.minCharacters ?? 10} minimum
                    </div>
                  </div>
                );
              }

              if (hasOptionImages) {
                return (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px", marginBottom: "2rem" }}>
                    {(currentQ.options || []).map((opt) => {
                      const isSelected = isMulti
                        ? selectedList.includes(opt.id)
                        : selectedAnswers[currentQ.id] === opt.id;

                      return (
                        <div
                          key={opt.id}
                          onClick={() =>
                            isMulti
                              ? handleOptionToggle(currentQ.id, opt.id)
                              : handleOptionSelect(currentQ.id, opt.id)
                          }
                          style={{
                            borderRadius: "10px",
                            border: isSelected ? "2px solid #2563eb" : "1px solid #cbd5e1",
                            backgroundColor: isSelected ? "#eff6ff" : "white",
                            padding: "10px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                            cursor: "pointer",
                            boxShadow: isSelected ? "0 2px 8px rgba(37, 99, 235, 0.15)" : "none",
                          }}
                        >
                          {opt.imageUrl && (
                            <img
                              src={opt.imageUrl}
                              alt={opt.text}
                              style={{ width: "100%", height: "130px", objectFit: "cover", borderRadius: "6px" }}
                            />
                          )}
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                            <input
                              type={isMulti ? "checkbox" : "radio"}
                              checked={isSelected}
                              readOnly
                              style={{ accentColor: "#2563eb", width: "16px", height: "16px" }}
                            />
                            <span style={{ fontSize: "0.9rem", color: isSelected ? "#1e40af" : "#334155", fontWeight: isSelected ? 600 : 400 }}>
                              {opt.text}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              }

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "2rem" }}>
                  {(currentQ.options || []).map((opt) => {
                    const isSelected = isMulti
                      ? selectedList.includes(opt.id)
                      : selectedAnswers[currentQ.id] === opt.id;

                    return (
                      <label
                        key={opt.id}
                        onClick={() =>
                          isMulti
                            ? handleOptionToggle(currentQ.id, opt.id)
                            : handleOptionSelect(currentQ.id, opt.id)
                        }
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          padding: "12px 16px",
                          borderRadius: "8px",
                          border: isSelected ? "2px solid #2563eb" : "1px solid #cbd5e1",
                          backgroundColor: isSelected ? "#eff6ff" : "white",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <input
                          type={isMulti ? "checkbox" : "radio"}
                          name={`question_${currentQ.id}`}
                          checked={isSelected}
                          onChange={() =>
                            isMulti
                              ? handleOptionToggle(currentQ.id, opt.id)
                              : handleOptionSelect(currentQ.id, opt.id)
                          }
                          style={{ accentColor: "#2563eb", width: "16px", height: "16px" }}
                        />
                        <span style={{ fontSize: "0.95rem", color: isSelected ? "#1e40af" : "#334155" }}>
                          {opt.text}
                        </span>
                      </label>
                    );
                  })}
                </div>
              );
            })()}

            {/* Pagination Controls */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #f1f5f9", paddingTop: "1.25rem" }}>
              <button
                type="button"
                onClick={() => setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))}
                disabled={currentQuestionIndex === 0}
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  backgroundColor: currentQuestionIndex === 0 ? "#f8fafc" : "white",
                  color: currentQuestionIndex === 0 ? "#94a3b8" : "#334155",
                  cursor: currentQuestionIndex === 0 ? "not-allowed" : "pointer",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                }}
              >
                ← Previous
              </button>

              <div style={{ display: "flex", gap: "10px" }}>
                {!isLastQuestion ? (
                  <button
                    type="button"
                    onClick={() => setCurrentQuestionIndex((prev) => Math.min(totalCount - 1, prev + 1))}
                    style={{
                      padding: "8px 20px",
                      borderRadius: "6px",
                      border: "none",
                      backgroundColor: "#0f172a",
                      color: "white",
                      cursor: "pointer",
                      fontSize: "0.875rem",
                      fontWeight: 600,
                    }}
                  >
                    Next →
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleExamSubmit(false)}
                    disabled={isSubmitting}
                    style={{
                      padding: "8px 24px",
                      borderRadius: "6px",
                      border: "none",
                      backgroundColor: "#16a34a",
                      color: "white",
                      cursor: isSubmitting ? "not-allowed" : "pointer",
                      fontSize: "0.875rem",
                      fontWeight: 700,
                    }}
                  >
                    {isSubmitting ? "Submitting..." : "Submit Final Exam"}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Question Jump Drawer Sidebar */}
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "12px",
              padding: "1.25rem",
              border: "1px solid #e2e8f0",
              height: "fit-content",
            }}
          >
            <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "0 0 10px", color: "#1e293b" }}>
              Question Navigator
            </h3>
            <p style={{ fontSize: "0.8rem", color: "#64748b", margin: "0 0 14px" }}>
              {answeredCount} of {totalCount} answered
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: "6px",
                maxHeight: "360px",
                overflowY: "auto",
                paddingRight: "4px",
              }}
            >
              {questions.map((q, idx) => {
                const isAnswered = !!selectedAnswers[q.id];
                const isCurrent = idx === currentQuestionIndex;

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentQuestionIndex(idx)}
                    style={{
                      padding: "8px 0",
                      borderRadius: "6px",
                      border: isCurrent
                        ? "2px solid #2563eb"
                        : isAnswered
                        ? "1px solid #86efac"
                        : "1px solid #e2e8f0",
                      backgroundColor: isCurrent
                        ? "#eff6ff"
                        : isAnswered
                        ? "#f0fdf4"
                        : "#f8fafc",
                      color: isCurrent
                        ? "#1d4ed8"
                        : isAnswered
                        ? "#166534"
                        : "#64748b",
                      fontWeight: isCurrent ? 700 : 500,
                      fontSize: "0.8rem",
                      cursor: "pointer",
                    }}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div style={{ marginTop: "1.5rem", borderTop: "1px solid #f1f5f9", paddingTop: "1rem" }}>
              <button
                type="button"
                onClick={() => handleExamSubmit(false)}
                disabled={isSubmitting}
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "6px",
                  border: "none",
                  backgroundColor: "#16a34a",
                  color: "white",
                  cursor: isSubmitting ? "not-allowed" : "pointer",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                }}
              >
                {isSubmitting ? "Submitting..." : "Finish & Submit Exam"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. EXAM RESULT OR BRIEFING SCREEN
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className={dash.page} style={{ maxWidth: "760px", margin: "0 auto", padding: "2rem 1.5rem" }}>
      {/* Return link */}
      <div style={{ marginBottom: "1.5rem" }}>
        <Link
          href={config?.programId ? `/programs/${config.programId}/steps` : "/courses"}
          style={{ color: "#64748b", textDecoration: "none", fontSize: "0.9rem" }}
        >
          ← Return to Learning Path
        </Link>
      </div>

      {error && (
        <div style={{ backgroundColor: "#fef2f2", border: "1px solid #f87171", color: "#991b1b", padding: "14px 18px", borderRadius: "8px", marginBottom: "1.5rem" }}>
          <h3 style={{ margin: "0 0 4px", fontSize: "1rem" }}>Cannot Start Final Exam</h3>
          <p style={{ margin: 0, fontSize: "0.9rem" }}>{error}</p>
        </div>
      )}

      {/* RESULT DISPLAY IF PREVIOUS ATTEMPT EXISTS */}
      {result && (
        <div
          style={{
            backgroundColor: result.passed ? "#f0fdf4" : "#fef2f2",
            border: result.passed ? "1px solid #86efac" : "1px solid #fca5a5",
            borderRadius: "12px",
            padding: "2rem",
            marginBottom: "2rem",
            textAlign: "center",
          }}
        >
          {result.passed ? (
            <>
              <h2 style={{ color: "#166534", margin: "0 0 8px", fontSize: "1.5rem" }}>
                Congratulations! You Passed!
              </h2>
              <p style={{ color: "#15803d", fontSize: "1rem", margin: "0 0 1.5rem" }}>
                Server Verified Score: <strong>{result.score}%</strong> (Required: {result.passMark}%)
              </p>
              <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
                <Link
                  href={`/programs/${config?.programId || paramId}/steps`}
                  style={{
                    backgroundColor: "#c97a1e",
                    color: "white",
                    padding: "10px 24px",
                    borderRadius: "8px",
                    textDecoration: "none",
                    fontWeight: 700,
                    fontSize: "0.95rem",
                  }}
                >
                  Continue to 1-on-1 Coaching &amp; Learning Path →
                </Link>
              </div>
            </>
          ) : (
            <>
              <h2 style={{ color: "#991b1b", margin: "0 0 8px", fontSize: "1.5rem" }}>
                Exam Attempt Not Passed
              </h2>
              <p style={{ color: "#b91c1c", fontSize: "1rem", margin: "0 0 1rem" }}>
                Score: <strong>{result.score}%</strong> • Required Pass Mark: <strong>{result.passMark}%</strong>
              </p>
              <p style={{ color: "#64748b", fontSize: "0.85rem", margin: "0 0 1.5rem" }}>
                Attempts used: {result.attemptsUsed ?? 1} of {result.maxAttempts ?? config?.maxAttempts ?? 3} ({result.attemptsRemaining ?? 0} remaining)
              </p>

              {/* Cooldown notice */}
              {result.isCooldownActive && (
                <div
                  style={{
                    backgroundColor: "white",
                    border: "1px solid #fde68a",
                    padding: "12px",
                    borderRadius: "8px",
                    marginBottom: "1rem",
                    textAlign: "left",
                  }}
                >
                  <strong style={{ color: "#92400e" }}>Cooldown Period Active</strong>
                  <p style={{ margin: "4px 0 0", color: "#78350f", fontSize: "0.875rem" }}>
                    To ensure mastery, next attempt will be available after:{" "}
                    <strong>
                      {result.cooldownUntil
                        ? new Date(result.cooldownUntil).toLocaleString()
                        : "the designated review period"}
                    </strong>
                  </p>
                </div>
              )}

              {/* Revision Guidance */}
              {result.stepToRevisit && (
                <div
                  style={{
                    backgroundColor: "white",
                    border: "1px solid #cbd5e1",
                    padding: "12px",
                    borderRadius: "8px",
                    marginBottom: "1rem",
                    textAlign: "left",
                  }}
                >
                  <strong style={{ color: "#1e293b" }}>Recommended Review:</strong>
                  <p style={{ margin: "4px 0 8px", color: "#475569", fontSize: "0.875rem" }}>
                    Step {result.stepToRevisit.sequence}: {result.stepToRevisit.title}
                  </p>
                  <Link
                    href={`/steps/${result.stepToRevisit.id}`}
                    style={{ color: "#2563eb", fontWeight: 600, fontSize: "0.85rem", textDecoration: "none" }}
                  >
                    Open Step {result.stepToRevisit.sequence} Materials →
                  </Link>
                </div>
              )}

              {result.retryGuidance && (
                <div
                  style={{
                    backgroundColor: "white",
                    border: "1px solid #cbd5e1",
                    padding: "12px",
                    borderRadius: "8px",
                    marginBottom: "1rem",
                    textAlign: "left",
                  }}
                >
                  <strong style={{ color: "#1e293b" }}>Advice:</strong>
                  <p style={{ margin: "4px 0 0", color: "#475569", fontSize: "0.875rem" }}>
                    {result.retryGuidance}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* BRIEFING CARD & START BUTTON */}
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "12px",
          padding: "2.5rem",
          border: "1px solid #e2e8f0",
          boxShadow: "0 2px 4px rgba(0,0,0,0.04)",
        }}
      >
        <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "#0f172a", margin: "0 0 1rem" }}>
          {config?.title || "Final Comprehensive Examination"}
        </h1>

        <p style={{ color: "#475569", fontSize: "1rem", lineHeight: 1.6, marginBottom: "2rem" }}>
          {config?.description ||
            "This comprehensive examination covers key competencies across all 11 steps of the curriculum. Questions are sampled from verified question pools and authoritative scoring determines qualification for certificate issuance."}
        </p>

        {/* Specifications Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "1rem",
            padding: "1.5rem",
            backgroundColor: "#f8fafc",
            borderRadius: "8px",
            marginBottom: "2rem",
          }}
        >
          <div>
            <span style={{ fontSize: "0.8rem", color: "#64748b", display: "block" }}>
              Format &amp; Marks
            </span>
            <strong style={{ fontSize: "1.15rem", color: "#14110f" }}>
              {config?.questionCount || 50} Qs • {config?.questionCount || 50} Marks (Shuffled)
            </strong>
          </div>
          <div>
            <span style={{ fontSize: "0.8rem", color: "#64748b", display: "block" }}>
              Time Limit
            </span>
            <strong style={{ fontSize: "1.25rem", color: "#0f172a" }}>
              {config?.timeLimitMin || 90} Minutes
            </strong>
          </div>
          <div>
            <span style={{ fontSize: "0.8rem", color: "#64748b", display: "block" }}>
              Required Pass Mark
            </span>
            <strong style={{ fontSize: "1.25rem", color: "#0f172a" }}>
              {config?.passMark || 75}%
            </strong>
          </div>
        </div>

        {/* Exam Rules & Integrity */}
        <ul style={{ color: "#64748b", fontSize: "0.875rem", lineHeight: 1.6, paddingLeft: "1.25rem", marginBottom: "2rem" }}>
          <li>All curriculum steps must be completed prior to sitting this exam.</li>
          <li>The countdown timer starts immediately once you click Start Exam.</li>
          <li>Unsubmitted answers are automatically collected upon timer expiry.</li>
          <li>Scoring and pass status are calculated exclusively by the server.</li>
        </ul>

        {/* Start / Retry Button */}
        {(!result || !result.passed) && (
          <button
            type="button"
            onClick={handleStartExam}
            disabled={loading || (result?.isCooldownActive ?? false) || ((result?.attemptsRemaining ?? 1) <= 0 && result !== null)}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: "10px",
              border: "none",
              backgroundColor: (result?.isCooldownActive ?? false) || ((result?.attemptsRemaining ?? 1) <= 0 && result !== null) ? "#94a3b8" : "#c97a1e",
              color: "white",
              fontSize: "1.05rem",
              fontWeight: 700,
              cursor: (result?.isCooldownActive ?? false) || ((result?.attemptsRemaining ?? 1) <= 0 && result !== null) ? "not-allowed" : "pointer",
            }}
          >
            {result ? "Start Next Attempt (50 Shuffled Questions)" : `Begin ${config?.questionCount || 50}-Mark Final Examination`}
          </button>
        )}
      </div>
    </div>
  );
}
