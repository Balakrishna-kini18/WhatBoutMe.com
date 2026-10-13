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
  const answeredCount = Object.keys(answers).length;
  const isAllAnswered = questions.length > 0 && answeredCount === questions.length;

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
              QUESTION {currentQuestionIdx + 1} OF {questions.length}
            </span>
            <span>{Math.round(((currentQuestionIdx + 1) / questions.length) * 100)}%</span>
          </div>

          <h3 className={styles.questionPrompt}>{currentQuestion.text}</h3>

          {/* Options Radio List */}
          <div className={styles.questionOptionsList}>
            {currentQuestion.options?.map((opt) => {
              const isChecked = answers[currentQuestion.id] === opt.id;
              return (
                <label
                  key={opt.id}
                  className={`${styles.questionOptionLabel} ${isChecked ? styles.questionOptionChecked : ""}`}
                >
                  <input
                    type="radio"
                    name={`quiz_${currentQuestion.id}`}
                    value={opt.id}
                    checked={isChecked}
                    onChange={() => onOptionChange(currentQuestion.id, opt.id)}
                    className={styles.questionRadioInput}
                  />
                  <span className={styles.optionTextSpan}>{opt.text}</span>
                </label>
              );
            })}
          </div>

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
                disabled={!answers[currentQuestion.id]}
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
