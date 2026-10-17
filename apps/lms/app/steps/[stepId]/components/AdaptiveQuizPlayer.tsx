"use client";

import React from "react";
import styles from "../step.module.css";
import { QuizQuestion, ActiveQuizAttempt, QuizSubmissionResult } from "../../../lib/api";
import { StepIcons } from "./StepIcons";

interface AdaptiveQuizPlayerProps {
  quiz: any;
  activeAttempt: ActiveQuizAttempt | null;
  questions: QuizQuestion[];
  currentQuestionIdx: number;
  setCurrentQuestionIdx: (idx: number) => void;
  answers: Record<string, string>;
  onOptionChange: (questionId: string, optionId: string) => void;
  onMultiOptionToggle?: (questionId: string, optionId: string) => void;
  onTextChange?: (questionId: string, text: string) => void;
  lastResult: QuizSubmissionResult | null;
  isStartingQuiz: boolean;
  isSubmittingQuiz: boolean;
  quizError: string | null;
  onStartQuiz: () => void;
  onSubmitQuiz: () => void;
  onProceedToCompletion: () => void;
}

export default function AdaptiveQuizPlayer({
  quiz,
  activeAttempt,
  questions,
  currentQuestionIdx,
  setCurrentQuestionIdx,
  answers,
  onOptionChange,
  onMultiOptionToggle,
  onTextChange,
  lastResult,
  isStartingQuiz,
  isSubmittingQuiz,
  quizError,
  onStartQuiz,
  onSubmitQuiz,
  onProceedToCompletion,
}: AdaptiveQuizPlayerProps) {
  if (!quiz) return null;

  const currentQuestion = questions[currentQuestionIdx];
  const isText =
    currentQuestion?.type === "SHORT_ANSWER" ||
    currentQuestion?.type === "TEXT_BOX";
  const isMulti = currentQuestion?.type === "MULTI_SELECT";
  const selectedIds =
    !isText && currentQuestion && answers[currentQuestion.id]
      ? (answers[currentQuestion.id] ?? "").split(",").filter(Boolean)
      : [];
  const hasOptionImages =
    !isText && currentQuestion?.options?.some((opt) => Boolean(opt.imageUrl));

  const isCurrentAnswered = currentQuestion
    ? isText
      ? (answers[currentQuestion.id] || "").trim().length >=
        (currentQuestion.minCharacters ?? 10)
      : (answers[currentQuestion.id] || "").trim().length > 0
    : false;

  const answeredCount = questions.filter((q) => {
    const val = answers[q.id];
    if (!val) return false;
    if (q.type === "SHORT_ANSWER" || q.type === "TEXT_BOX") {
      return val.trim().length >= (q.minCharacters ?? 10);
    }
    return val.trim().length > 0;
  }).length;
  const isAllAnswered = questions.length > 0 && answeredCount === questions.length;

  const handleToggle = (optId: string) => {
    if (!currentQuestion) return;
    if (onMultiOptionToggle) {
      onMultiOptionToggle(currentQuestion.id, optId);
    } else {
      const current = answers[currentQuestion.id]
        ? (answers[currentQuestion.id] ?? "").split(",").filter(Boolean)
        : [];
      const next = current.includes(optId)
        ? current.filter((id) => id !== optId)
        : [...current, optId];
      onOptionChange(currentQuestion.id, next.join(","));
    }
  };

  const handleText = (val: string) => {
    if (!currentQuestion) return;
    if (onTextChange) {
      onTextChange(currentQuestion.id, val);
    } else {
      onOptionChange(currentQuestion.id, val);
    }
  };

  return (
    <div style={{ width: "100%" }}>
      {/* 1. QUIZ START SCREEN */}
      {!activeAttempt && !lastResult && (
        <div className={styles.quizIntroCard}>
          <div className={styles.quizHeroIcon}>
            <StepIcons.Brain size={32} />
          </div>
          <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.85rem", margin: "0 0 0.5rem" }}>
            Knowledge Check
          </h2>
          <p style={{ color: "var(--text-secondary)", margin: "0 auto", maxWidth: 500, fontSize: "0.95rem" }}>
            Validate your understanding of this step before unlocking subsequent modules.
          </p>

          <div className={styles.quizMetaPills}>
            <span className={styles.metaPill}>
              Pass Mark: <span className={styles.metaPillStrong}>{quiz.passMark}%</span>
            </span>
            <span className={styles.metaPill}>
              Questions: <span className={styles.metaPillStrong}>{quiz.questionCount ?? 5}</span>
            </span>
            <span className={styles.metaPill}>
              Max Attempts: <span className={styles.metaPillStrong}>{quiz.maxAttempts ?? 3}</span>
            </span>
          </div>

          {quizError && (
            <div style={{ background: "#fee2e2", color: "#991b1b", padding: "10px 16px", borderRadius: 10, fontSize: "0.85rem", marginBottom: "1.5rem" }}>
              {quizError}
            </div>
          )}

          <button
            type="button"
            className={styles.continueActionBtn}
            onClick={onStartQuiz}
            disabled={isStartingQuiz}
            style={{ padding: "0.85rem 2.25rem", fontSize: "1rem" }}
          >
            {isStartingQuiz ? "Preparing Quiz..." : "Begin Knowledge Check →"}
          </button>
        </div>
      )}

      {/* 2. ACTIVE QUIZ (1 QUESTION AT A TIME) */}
      {activeAttempt && questions.length > 0 && currentQuestion && (
        <div className={styles.quizActiveCard}>
          {/* Question Indicator & Progress Bar */}
          <div className={styles.questionIndicatorBar}>
            <span>
              QUESTION {currentQuestionIdx + 1} OF {questions.length} •{" "}
              {isText
                ? "Written Reflection"
                : isMulti
                ? "Select all that apply"
                : "Single Choice"}
            </span>
            <span>{Math.round(((currentQuestionIdx + 1) / questions.length) * 100)}%</span>
          </div>

          <h3 className={styles.questionPrompt}>{currentQuestion.text}</h3>

          {/* Question Prompt Image */}
          {currentQuestion.imageUrl && (
            <div
              style={{
                marginBottom: "1rem",
                borderRadius: "10px",
                overflow: "hidden",
                border: "1px solid var(--border-light, #e2e8f0)",
                maxHeight: "260px",
                background: "#f8fafc",
              }}
            >
              <img
                src={currentQuestion.imageUrl}
                alt="Question visual"
                style={{ width: "100%", maxHeight: "260px", objectFit: "contain", display: "block" }}
              />
            </div>
          )}

          {/* Text Box Format */}
          {isText ? (
            <div style={{ marginBottom: "1.25rem" }}>
              <textarea
                value={answers[currentQuestion.id] || ""}
                onChange={(e) => handleText(e.target.value)}
                placeholder="Write your reflection or response here (minimum 10 characters)..."
                rows={5}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: "10px",
                  border: "1px solid var(--border-light, #cbd5e1)",
                  fontSize: "0.95rem",
                  fontFamily: "inherit",
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.8rem",
                  marginTop: "6px",
                }}
              >
                <span
                  style={{
                    color: isCurrentAnswered ? "#16a34a" : "#dc2626",
                    fontWeight: 600,
                  }}
                >
                  {(answers[currentQuestion.id] || "").trim().length} /{" "}
                  {currentQuestion.minCharacters ?? 10} characters minimum
                  {isCurrentAnswered ? " ✓" : ""}
                </span>
                <span style={{ color: "var(--text-secondary, #64748b)" }}>
                  {currentQuestion.gradingMode === "MANUAL_REVIEW"
                    ? "Held for instructor grading"
                    : "Self-reflection auto-pass"}
                </span>
              </div>
            </div>
          ) : (
            /* Options Choice List / Visual Cards */
            <div
              className={styles.questionOptionsList}
              style={
                hasOptionImages
                  ? {
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                      gap: "12px",
                    }
                  : undefined
              }
            >
              {currentQuestion.options?.map((opt) => {
                const isChecked = isMulti
                  ? selectedIds.includes(opt.id)
                  : answers[currentQuestion.id] === opt.id;

                return (
                  <label
                    key={opt.id}
                    className={`${styles.questionOptionLabel} ${isChecked ? styles.questionOptionChecked : ""}`}
                    style={
                      hasOptionImages
                        ? {
                            flexDirection: "column",
                            alignItems: "stretch",
                            padding: "10px",
                          }
                        : undefined
                    }
                  >
                    {opt.imageUrl && (
                      <div
                        style={{
                          height: "130px",
                          borderRadius: "8px",
                          overflow: "hidden",
                          marginBottom: "8px",
                          background: "#f1f5f9",
                        }}
                      >
                        <img
                          src={opt.imageUrl}
                          alt={opt.text}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <input
                        type={isMulti ? "checkbox" : "radio"}
                        name={`quiz_${currentQuestion.id}`}
                        value={opt.id}
                        checked={isChecked}
                        onChange={() => {
                          if (isMulti) {
                            handleToggle(opt.id);
                          } else {
                            onOptionChange(currentQuestion.id, opt.id);
                          }
                        }}
                        className={styles.questionRadioInput}
                      />
                      <span className={styles.optionTextSpan}>{opt.text}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          )}

          {/* Question Navigation Buttons */}
          <div className={styles.questionNavRow}>
            <button
              type="button"
              className={styles.questionPrevBtn}
              onClick={() => setCurrentQuestionIdx(Math.max(0, currentQuestionIdx - 1))}
              disabled={currentQuestionIdx === 0}
            >
              ← Previous
            </button>

            {currentQuestionIdx < questions.length - 1 ? (
              <button
                type="button"
                className={styles.continueActionBtn}
                onClick={() => setCurrentQuestionIdx(currentQuestionIdx + 1)}
                disabled={!isCurrentAnswered}
                style={{ padding: "0.6rem 1.4rem", fontSize: "0.88rem" }}
              >
                Next Question →
              </button>
            ) : (
              <button
                type="button"
                className={styles.continueActionBtn}
                onClick={onSubmitQuiz}
                disabled={!isAllAnswered || isSubmittingQuiz}
                style={{ padding: "0.6rem 1.4rem", fontSize: "0.88rem" }}
              >
                {isSubmittingQuiz ? "Submitting..." : "Submit All Answers ✓"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* 3. SUBMITTED QUIZ RESULTS SCREEN */}
      {lastResult && (
        <div className={styles.resultCard}>
          {lastResult.passed ? (
            <>
              <div style={{ color: "#16a34a", marginBottom: "0.5rem" }}>
                <StepIcons.CheckCircle size={48} />
              </div>
              <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "2rem", color: "#15803d", margin: "0 0 0.5rem" }}>
                Knowledge Check Passed
              </h2>
              <div className={`${styles.scoreBadge} ${styles.scoreBadgePassed}`}>
                {lastResult.score}%
              </div>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", marginBottom: "2rem" }}>
                You correctly answered {lastResult.correctCount} of {lastResult.totalQuestions} questions.
                Passing requirement: {lastResult.passMark}%.
              </p>
              <button
                type="button"
                className={styles.continueActionBtn}
                onClick={onProceedToCompletion}
                style={{ padding: "0.85rem 2.25rem", fontSize: "1rem" }}
              >
                Proceed to Step Completion →
              </button>
            </>
          ) : (
            <>
              <div style={{ color: "#b91c1c", marginBottom: "0.5rem" }}>
                <StepIcons.Brain size={48} />
              </div>
              <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.85rem", color: "#b91c1c", margin: "0 0 0.5rem" }}>
                Keep Learning &amp; Try Again
              </h2>
              <div className={`${styles.scoreBadge} ${styles.scoreBadgeFailed}`}>
                {lastResult.score}%
              </div>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", marginBottom: "1.5rem" }}>
                Passing score required: {lastResult.passMark}%. Attempts remaining:{" "}
                {lastResult.attemptsRemaining ?? 0}.
              </p>

              {lastResult.isCooldownActive && (
                <div style={{ background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", padding: "12px", borderRadius: 10, marginBottom: "1.5rem" }}>
                  Cooldown active until{" "}
                  {lastResult.cooldownUntil
                    ? new Date(lastResult.cooldownUntil).toLocaleTimeString()
                    : "cooldown expires"}
                  .
                </div>
              )}

              {lastResult.canRetry && !lastResult.isCooldownActive && (
                <button
                  type="button"
                  className={styles.continueActionBtn}
                  onClick={onStartQuiz}
                  disabled={isStartingQuiz}
                >
                  {isStartingQuiz ? "Starting..." : "Retry Knowledge Check →"}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
