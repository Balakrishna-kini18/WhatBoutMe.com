"use client";

import { useEffect, useState, use, useRef, useCallback } from "react";
import Link from "next/link";
import { API_URL, getAuthHeaders, parseApiError } from "../../lib/api";
import {
  safeParseResponseJson as safeJson,
  buildExamAnswersPayload,
  reconcileExamProgress,
  saveLocalExamProgress,
  loadLocalExamProgress,
  clearLocalExamProgress,
} from "./examRunnerLogic";
import styles from "../../page.module.css";
import dash from "../../layout.module.css";
import examStyles from "./exam.module.css";

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
  const [isSubmitConfirmOpen, setIsSubmitConfirmOpen] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "local">("saved");
  const [isMobileNavExpanded, setIsMobileNavExpanded] = useState(false);

  // Keep refs of latest state for immediate synchronous flush on beforeunload / pagehide
  const latestAnswersRef = useRef<Record<string, string>>({});
  const latestQuestionIndexRef = useRef<number>(0);
  const latestAttemptRef = useRef<ActiveAttempt | null>(null);
  const latestExamIdRef = useRef<string>(paramId);

  latestAnswersRef.current = selectedAnswers;
  latestQuestionIndexRef.current = currentQuestionIndex;
  latestAttemptRef.current = activeAttempt;
  latestExamIdRef.current = activeAttempt?.examId || examId;

  // Immediate server sync helper (supports keepalive for page refresh / tab close)
  const syncProgressToServer = useCallback(
    async (
      targetAttempt: ActiveAttempt,
      answersMap: Record<string, string>,
      questionIdx: number,
      keepalive = false,
    ) => {
      const targetExamId = targetAttempt.examId || latestExamIdRef.current;
      if (!targetExamId || targetAttempt.status !== "IN_PROGRESS") return;
      try {
        setSaveState("saving");
        const answersPayload = buildExamAnswersPayload(targetAttempt.questions || [], answersMap);
        const res = await fetch(`${API_URL}/exams/${targetExamId}/attempt/answers`, {
          method: "PATCH",
          headers: getAuthHeaders(),
          keepalive,
          body: JSON.stringify({
            answers: answersPayload,
            currentQuestionIndex: questionIdx,
          }),
        });
        if (res.ok) {
          setSaveState("saved");
        } else {
          setSaveState("local");
        }
      } catch {
        setSaveState("local");
      }
    },
    [],
  );

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
          const cfg = await safeJson<ExamConfig>(configRes);
          if (cfg && cfg.id) {
            setConfig(cfg);
            resolvedExamId = cfg.id;
            setExamId(cfg.id);
          }
        }

        // Fetch active attempt or recent attempt status (returns empty body when no attempt exists yet)
        const attemptRes = await fetch(`${API_URL}/exams/${resolvedExamId}/attempt`, {
          headers: getAuthHeaders(),
        });

        if (attemptRes.ok) {
          const data = await safeJson<any>(attemptRes);
          if (data) {
            if (data.status === "IN_PROGRESS" && data.questions) {
              const attemptId = data.attemptId || data.id;
              const targetExamId = data.examId || resolvedExamId;
              if (data.examId) setExamId(data.examId);
              setActiveAttempt(data);

              // Reconcile server savedAnswers + local browser snapshot so refresh never loses anything
              const localSnapshot = loadLocalExamProgress(attemptId, targetExamId);
              const reconciled = reconcileExamProgress({
                attemptData: data,
                localSnapshot,
              });

              setSelectedAnswers(reconciled.selectedAnswers);
              setCurrentQuestionIndex(reconciled.currentQuestionIndex);
              saveLocalExamProgress(
                attemptId,
                targetExamId,
                reconciled.selectedAnswers,
                reconciled.currentQuestionIndex,
              );

              if (reconciled.needsServerSync) {
                void syncProgressToServer(
                  data,
                  reconciled.selectedAnswers,
                  reconciled.currentQuestionIndex,
                );
              }

              // Calculate remaining seconds
              const expires = new Date(data.expiresAt).getTime();
              const now = Date.now();
              const remaining = Math.max(0, Math.floor((expires - now) / 1000));
              setSecondsRemaining(remaining);
            } else if (data.status === "PASSED" || data.status === "FAILED") {
              setResult(data);
              clearLocalExamProgress(data.attemptId || data.id, data.examId || resolvedExamId);
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
  }, [paramId, syncProgressToServer]);

  // Debounced autosave effect: syncs learner answers & question index every 500ms
  const autosaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!activeAttempt || activeAttempt.status !== "IN_PROGRESS") {
      return;
    }
    const attemptId = activeAttempt.attemptId || (activeAttempt as any).id;
    const targetExamId = activeAttempt.examId || examId;

    // Always persist synchronously to localStorage on every state update (0ms latency)
    saveLocalExamProgress(attemptId, targetExamId, selectedAnswers, currentQuestionIndex);

    if (Object.keys(selectedAnswers).length === 0 && currentQuestionIndex === 0) {
      return;
    }

    if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);

    autosaveTimeoutRef.current = setTimeout(() => {
      void syncProgressToServer(activeAttempt, selectedAnswers, currentQuestionIndex);
    }, 500);

    return () => {
      if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);
    };
  }, [selectedAnswers, currentQuestionIndex, activeAttempt, examId, syncProgressToServer]);

  // Flush progress on browser refresh, tab close, or visibility change
  useEffect(() => {
    function flushOnExit() {
      const attempt = latestAttemptRef.current;
      if (!attempt || attempt.status !== "IN_PROGRESS") return;
      const attemptId = attempt.attemptId || (attempt as any).id;
      const targetExamId = attempt.examId || latestExamIdRef.current;
      saveLocalExamProgress(
        attemptId,
        targetExamId,
        latestAnswersRef.current,
        latestQuestionIndexRef.current,
      );
      void syncProgressToServer(
        attempt,
        latestAnswersRef.current,
        latestQuestionIndexRef.current,
        true,
      );
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        flushOnExit();
      }
    }

    window.addEventListener("beforeunload", flushOnExit);
    window.addEventListener("pagehide", flushOnExit);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", flushOnExit);
      window.removeEventListener("pagehide", flushOnExit);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [syncProgressToServer]);

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

  // Start or resume exam attempt
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

      const attempt = await safeJson<ActiveAttempt>(res);
      if (!attempt) {
        throw new Error("Empty exam attempt response received from server.");
      }
      const attemptId = attempt.attemptId || (attempt as any).id;
      const targetExamId = attempt.examId || examId;
      if (attempt.examId) setExamId(attempt.examId);

      // Reconcile any existing progress (if startExam resumed an active attempt)
      const localSnapshot = loadLocalExamProgress(attemptId, targetExamId);
      const reconciled = reconcileExamProgress({
        attemptData: attempt,
        localSnapshot,
      });

      setActiveAttempt(attempt);
      setResult(null);
      setSelectedAnswers(reconciled.selectedAnswers);
      setCurrentQuestionIndex(reconciled.currentQuestionIndex);
      saveLocalExamProgress(
        attemptId,
        targetExamId,
        reconciled.selectedAnswers,
        reconciled.currentQuestionIndex,
      );

      const expires = new Date(attempt.expiresAt).getTime();
      const remaining = Math.max(0, Math.floor((expires - Date.now()) / 1000));
      setSecondsRemaining(remaining);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Request exam submission (opens in-website confirmation modal unless timer expired)
  function handleExamSubmit(isTimeExpired = false) {
    if (!activeAttempt || isSubmitting) return;

    if (!isTimeExpired) {
      setIsSubmitConfirmOpen(true);
      return;
    }

    void executeExamSubmit();
  }

  // Execute server submission
  async function executeExamSubmit() {
    if (!activeAttempt || isSubmitting) return;

    setIsSubmitConfirmOpen(false);
    setIsSubmitting(true);
    setSubmitWarning(null);

    try {
      const targetExamId = activeAttempt.examId || examId;
      const attemptId = activeAttempt.attemptId || (activeAttempt as any).id;
      const answersPayload = buildExamAnswersPayload(
        activeAttempt.questions || [],
        selectedAnswers,
      );

      const res = await fetch(`${API_URL}/exams/${targetExamId}/submit`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          attemptId,
          answers: answersPayload,
        }),
      });

      if (!res.ok) {
        const err = await parseApiError(res, "Failed to submit final exam");
        throw new Error(err.message);
      }

      const resData = await safeJson<ExamResult>(res);
      if (resData) {
        setResult(resData);
      }
      clearLocalExamProgress(attemptId, targetExamId);
      setActiveAttempt(null);
      setSecondsRemaining(null);
    } catch (err: any) {
      setSubmitWarning(err.message || "Failed to submit exam attempt. Please retry.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function navigateToQuestion(nextIdx: number) {
    const total = activeAttempt?.questions?.length || 1;
    const clamped = Math.min(Math.max(0, nextIdx), total - 1);
    setCurrentQuestionIndex(clamped);
    if (typeof window !== "undefined" && window.innerWidth <= 860) {
      setIsMobileNavExpanded(false);
    }
    if (activeAttempt) {
      const attemptId = activeAttempt.attemptId || (activeAttempt as any).id;
      const targetExamId = activeAttempt.examId || examId;
      saveLocalExamProgress(attemptId, targetExamId, selectedAnswers, clamped);
    }
  }

  function handleOptionSelect(questionId: string, optionId: string) {
    setSelectedAnswers((prev) => {
      const nextMap = {
        ...prev,
        [questionId]: optionId,
      };
      if (activeAttempt) {
        saveLocalExamProgress(
          activeAttempt.attemptId || (activeAttempt as any).id,
          activeAttempt.examId || examId,
          nextMap,
          currentQuestionIndex,
        );
      }
      return nextMap;
    });
  }

  function handleOptionToggle(questionId: string, optionId: string) {
    setSelectedAnswers((prev) => {
      const current = prev[questionId] ? (prev[questionId] ?? "").split(",").filter(Boolean) : [];
      const next = current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId];
      const nextMap = {
        ...prev,
        [questionId]: next.join(","),
      };
      if (activeAttempt) {
        saveLocalExamProgress(
          activeAttempt.attemptId || (activeAttempt as any).id,
          activeAttempt.examId || examId,
          nextMap,
          currentQuestionIndex,
        );
      }
      return nextMap;
    });
  }

  function handleTextChange(questionId: string, text: string) {
    setSelectedAnswers((prev) => {
      const nextMap = {
        ...prev,
        [questionId]: text,
      };
      if (activeAttempt) {
        saveLocalExamProgress(
          activeAttempt.attemptId || (activeAttempt as any).id,
          activeAttempt.examId || examId,
          nextMap,
          currentQuestionIndex,
        );
      }
      return nextMap;
    });
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
    const answeredCount = questions.filter((q) => Boolean(selectedAnswers[q.id]?.trim())).length;
    const totalCount = questions.length;
    const unansweredIndices = questions
      .map((q, idx) => (!selectedAnswers[q.id]?.trim() ? idx : -1))
      .filter((idx) => idx >= 0);
    const isLastQuestion = currentQuestionIndex === totalCount - 1;

    return (
      <div className={`${dash.page} ${examStyles.pageWrapper}`}>
        {/* Header Bar with Countdown & Auto-Save Status */}
        <div className={examStyles.headerBar}>
          <div>
            <h1 className={examStyles.headerTitle}>
              {activeAttempt.title || config?.title || "Final Comprehensive Examination"}
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "4px", flexWrap: "wrap" }}>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "#cbd5e1" }}>
                Attempt #{activeAttempt.attemptNumber} • Question {currentQuestionIndex + 1} of {totalCount} ({answeredCount} answered)
              </p>
              <span
                style={{
                  fontSize: "0.73rem",
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: "999px",
                  backgroundColor:
                    saveState === "saving"
                      ? "rgba(245, 158, 11, 0.2)"
                      : "rgba(34, 197, 94, 0.2)",
                  color: saveState === "saving" ? "#fcd34d" : "#86efac",
                  border:
                    saveState === "saving"
                      ? "1px solid rgba(245, 158, 11, 0.35)"
                      : "1px solid rgba(34, 197, 94, 0.35)",
                }}
              >
                {saveState === "saving"
                  ? "⟳ Saving progress..."
                  : saveState === "local"
                  ? "✓ Saved locally (resume-ready)"
                  : "✓ Progress auto-saved"}
              </span>
            </div>
          </div>

          {secondsRemaining !== null && (
            <div
              className={examStyles.timerCard}
              style={{
                backgroundColor: secondsRemaining < 300 ? "#7f1d1d" : "#1e293b",
                border: secondsRemaining < 300 ? "1px solid #ef4444" : "1px solid #334155",
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

        <div className={examStyles.examLayoutGrid}>
          {/* Main Question Card */}
          <div className={examStyles.questionCard}>
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

            <h2 className={examStyles.questionTitle}>
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
                      <div
                        key={opt.id}
                        role="button"
                        tabIndex={0}
                        onClick={() =>
                          isMulti
                            ? handleOptionToggle(currentQ.id, opt.id)
                            : handleOptionSelect(currentQ.id, opt.id)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            if (isMulti) {
                              handleOptionToggle(currentQ.id, opt.id);
                            } else {
                              handleOptionSelect(currentQ.id, opt.id);
                            }
                          }
                        }}
                        className={examStyles.optionCard}
                        style={{
                          border: isSelected ? "2px solid #c97a1e" : "1px solid #cbd5e1",
                          backgroundColor: isSelected ? "#fff8eb" : "white",
                        }}
                      >
                        <input
                          type={isMulti ? "checkbox" : "radio"}
                          name={`question_${currentQ.id}`}
                          checked={isSelected}
                          readOnly
                          style={{ accentColor: "#c97a1e", width: "16px", height: "16px", pointerEvents: "none", flexShrink: 0 }}
                        />
                        <span className={examStyles.optionCardText} style={{ color: isSelected ? "#9a5810" : "#334155", fontWeight: isSelected ? 600 : 400 }}>
                          {opt.text}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Pagination Controls */}
            <div className={examStyles.paginationBar}>
              <button
                type="button"
                onClick={() => navigateToQuestion(currentQuestionIndex - 1)}
                disabled={currentQuestionIndex === 0}
                className={examStyles.paginationBtn}
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
                    onClick={() => navigateToQuestion(currentQuestionIndex + 1)}
                    className={examStyles.paginationBtn}
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
                    className={examStyles.paginationBtn}
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
          <div className={examStyles.navigatorCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "#1e293b" }}>
                Question Navigator
              </h3>
              <button
                type="button"
                onClick={() => setIsMobileNavExpanded((prev) => !prev)}
                className={examStyles.mobileNavToggleBtn}
                style={{
                  background: isMobileNavExpanded ? "#e2e8f0" : "#f1f5f9",
                  border: "1px solid #cbd5e1",
                  borderRadius: "6px",
                  padding: "4px 10px",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "#334155",
                  cursor: "pointer",
                }}
              >
                {isMobileNavExpanded ? "Hide Grid ▲" : `View All ${totalCount} ▼`}
              </button>
            </div>
            <p style={{ fontSize: "0.8rem", color: "#64748b", margin: "0 0 12px" }}>
              {answeredCount} of {totalCount} answered
            </p>

            <div
              className={`${examStyles.navigatorGrid} ${!isMobileNavExpanded ? examStyles.mobileNavCollapsed : ""}`}
            >
              {questions.map((q, idx) => {
                const isAnswered = Boolean(selectedAnswers[q.id]?.trim());
                const isCurrent = idx === currentQuestionIndex;

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => navigateToQuestion(idx)}
                    className={examStyles.navigatorNavBtn}
                    style={{
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
                    }}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div style={{ marginTop: "1.25rem", borderTop: "1px solid #f1f5f9", paddingTop: "1rem" }}>
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

        {/* In-Website Submit Confirmation Modal */}
        {isSubmitConfirmOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(20, 17, 15, 0.58)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1200,
              padding: "1rem",
            }}
            onClick={() => setIsSubmitConfirmOpen(false)}
          >
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: "16px",
                border: "1px solid #ece6dd",
                width: "100%",
                maxWidth: "520px",
                padding: "1.75rem",
                boxShadow: "0 24px 48px rgba(20, 17, 15, 0.24)",
                display: "flex",
                flexDirection: "column",
                gap: "1.1rem",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem" }}>
                <div>
                  <span
                    style={{
                      display: "inline-block",
                      fontSize: "0.72rem",
                      fontWeight: 800,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      padding: "0.2rem 0.65rem",
                      borderRadius: "999px",
                      backgroundColor: answeredCount < totalCount ? "#fef3c7" : "#dcfce7",
                      color: answeredCount < totalCount ? "#b45309" : "#15803d",
                      marginBottom: "0.45rem",
                    }}
                  >
                    {answeredCount < totalCount ? "INCOMPLETE EXAM WARNING" : "READY FOR SUBMISSION"}
                  </span>
                  <h3 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "#14110f" }}>
                    Submit Final Examination?
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSubmitConfirmOpen(false)}
                  style={{
                    background: "transparent",
                    border: "none",
                    fontSize: "1.25rem",
                    color: "#78716a",
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              </div>

              <div
                style={{
                  padding: "1rem 1.15rem",
                  borderRadius: "12px",
                  backgroundColor: answeredCount < totalCount ? "#fffbeb" : "#f0fdf4",
                  border: answeredCount < totalCount ? "1px solid #fde68a" : "1px solid #86efac",
                  color: answeredCount < totalCount ? "#92400e" : "#166534",
                  fontSize: "0.95rem",
                  lineHeight: 1.5,
                  fontWeight: 600,
                }}
              >
                {answeredCount < totalCount ? (
                  <>
                    You have answered <strong>{answeredCount} of {totalCount}</strong> questions (
                    <strong>{totalCount - answeredCount} unanswered</strong>). Are you sure you want to submit your final exam now?
                  </>
                ) : (
                  <>
                    You have answered all <strong>{totalCount}</strong> questions. Ready to submit your final examination for server scoring?
                  </>
                )}
              </div>

              {/* Stats Summary Row */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "0.65rem",
                  textAlign: "center",
                }}
              >
                <div style={{ padding: "0.65rem", borderRadius: "10px", background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                  <div style={{ fontSize: "0.72rem", color: "#166534", fontWeight: 700 }}>Answered</div>
                  <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "#15803d" }}>{answeredCount}</div>
                </div>
                <div style={{ padding: "0.65rem", borderRadius: "10px", background: unansweredIndices.length > 0 ? "#fef2f2" : "#f8fafc", border: unansweredIndices.length > 0 ? "1px solid #fecaca" : "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: "0.72rem", color: unansweredIndices.length > 0 ? "#991b1b" : "#64748b", fontWeight: 700 }}>Unanswered</div>
                  <div style={{ fontSize: "1.15rem", fontWeight: 800, color: unansweredIndices.length > 0 ? "#dc2626" : "#475569" }}>
                    {unansweredIndices.length}
                  </div>
                </div>
                <div style={{ padding: "0.65rem", borderRadius: "10px", background: "#faf6f0", border: "1px solid #ece4d7" }}>
                  <div style={{ fontSize: "0.72rem", color: "#78716a", fontWeight: 700 }}>Total Marks</div>
                  <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "#14110f" }}>{totalCount}</div>
                </div>
              </div>

              {/* Quick Jump to Unanswered Questions */}
              {unansweredIndices.length > 0 && (
                <div>
                  <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#57534e", marginBottom: "0.4rem" }}>
                    Click a number below to jump directly to an unanswered question:
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "6px",
                      maxHeight: "110px",
                      overflowY: "auto",
                      padding: "4px 2px",
                    }}
                  >
                    {unansweredIndices.map((qIdx) => (
                      <button
                        key={qIdx}
                        type="button"
                        onClick={() => {
                          navigateToQuestion(qIdx);
                          setIsSubmitConfirmOpen(false);
                        }}
                        style={{
                          padding: "4px 9px",
                          borderRadius: "6px",
                          border: "1px solid #fdba74",
                          backgroundColor: "#fff7ed",
                          color: "#9a3412",
                          fontSize: "0.76rem",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Q{qIdx + 1}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "0.75rem",
                  borderTop: "1px solid #ece6dd",
                  paddingTop: "0.95rem",
                }}
              >
                <button
                  type="button"
                  onClick={() => setIsSubmitConfirmOpen(false)}
                  style={{
                    padding: "0.62rem 1.15rem",
                    borderRadius: "9px",
                    border: "1px solid #dcd5cb",
                    backgroundColor: "#ffffff",
                    color: "#44403c",
                    fontWeight: 700,
                    fontSize: "0.86rem",
                    cursor: "pointer",
                  }}
                >
                  Keep Reviewing
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => executeExamSubmit()}
                  style={{
                    padding: "0.62rem 1.35rem",
                    borderRadius: "9px",
                    border: "none",
                    backgroundColor: "#16a34a",
                    color: "#ffffff",
                    fontWeight: 700,
                    fontSize: "0.86rem",
                    cursor: isSubmitting ? "not-allowed" : "pointer",
                  }}
                >
                  {isSubmitting ? "Submitting..." : "Yes, Submit Final Exam"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. EXAM RESULT OR BRIEFING SCREEN
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className={`${dash.page} ${examStyles.pageWrapper}`} style={{ maxWidth: "760px" }}>
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
      <div className={examStyles.briefingCard}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "#0f172a", margin: "0 0 1rem" }}>
          {config?.title || "Final Comprehensive Examination"}
        </h1>

        <p style={{ color: "#475569", fontSize: "1rem", lineHeight: 1.6, marginBottom: "2rem" }}>
          {config?.description ||
            "This comprehensive examination covers key competencies across all 11 steps of the curriculum. Questions are sampled from verified question pools and authoritative scoring determines qualification for certificate issuance."}
        </p>

        {/* Specifications Grid */}
        <div className={examStyles.specsGrid}>
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
