"use client";

import { useEffect, useState, use, useCallback } from "react";
import styles from "./step.module.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  API_URL,
  getAuthHeaders,
  parseApiError,
  getLockMessage,
  EnrolmentProgressionResponse,
  StepProgressionItem,
  ActiveQuizAttempt,
  QuizSubmissionResult,
  QuizQuestion,
} from "../../lib/api";

export default function StepPage({ params }: { params: Promise<{ stepId: string }> }) {
  const router = useRouter();
  const unwrappedParams = use(params);
  const stepId = unwrappedParams.stepId;

  const [step, setStep] = useState<any>(null);
  const [progression, setProgression] = useState<EnrolmentProgressionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Quiz engine state
  const [activeAttempt, setActiveAttempt] = useState<ActiveQuizAttempt | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [lastResult, setLastResult] = useState<QuizSubmissionResult | null>(null);
  const [isStartingQuiz, setIsStartingQuiz] = useState(false);
  const [isSubmittingQuiz, setIsSubmittingQuiz] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);

  // Non-quiz step completion state
  const [isCompletingStep, setIsCompletingStep] = useState(false);

  const fetchStepAndProgression = useCallback(async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      router.push("/login");
      return;
    }

    try {
      setLoadError(null);
      // 1. Fetch step metadata
      const stepRes = await fetch(`${API_URL}/programs/steps/${stepId}`, {
        headers: getAuthHeaders(),
      });
      if (!stepRes.ok) {
        if (stepRes.status === 401) {
          localStorage.removeItem("token");
          router.push("/login");
          return;
        }
        const err = await parseApiError(stepRes);
        throw new Error(err.message || `Step could not be loaded (${stepRes.status})`);
      }
      const stepData = await stepRes.json();
      setStep(stepData);

      // 2. Fetch authoritative progression for the step's program
      if (stepData.programId) {
        const progRes = await fetch(`${API_URL}/progression/me/${stepData.programId}`, {
          headers: getAuthHeaders(),
        });
        if (progRes.ok) {
          const progData: EnrolmentProgressionResponse = await progRes.json();
          setProgression(progData);
        } else if (progRes.status === 403 || progRes.status === 404) {
          const err = await parseApiError(progRes);
          setProgression({
            enrolmentId: "",
            programId: stepData.programId,
            programTitle: "",
            batchId: "",
            batchName: "",
            batchStartDate: "",
            enrolmentStatus: "NOT_ENROLLED",
            overallProgressPercent: 0,
            currentStepSequence: 1,
            steps: [],
          });
        }
      }

      // 3. If quiz exists on step, check active or previous attempt state
      if (stepData.quiz?.id) {
        try {
          const quizAttemptRes = await fetch(`${API_URL}/quizzes/${stepData.quiz.id}/attempt`, {
            headers: getAuthHeaders(),
          });
          if (quizAttemptRes.ok) {
            const attemptData = await quizAttemptRes.json();
            if (attemptData) {
              if (attemptData.status === "IN_PROGRESS") {
                setActiveAttempt(attemptData);
                setQuestions(attemptData.questions || []);
              } else {
                setLastResult(attemptData);
              }
            }
          }
        } catch (quizErr) {
          console.warn("Failed to check active quiz attempt:", quizErr);
        }
      }
    } catch (err: any) {
      console.error(err);
      setLoadError(err.message || "Failed to load step information");
    } finally {
      setLoading(false);
    }
  }, [stepId, router]);

  useEffect(() => {
    fetchStepAndProgression();
  }, [fetchStepAndProgression]);

  // Handle starting/resuming a quiz attempt via server engine
  const handleStartQuiz = async () => {
    if (!step?.quiz?.id) return;
    setQuizError(null);
    setIsStartingQuiz(true);

    try {
      const res = await fetch(`${API_URL}/quizzes/${step.quiz.id}/start`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          enrolmentId: progression?.enrolmentId || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 403 && data?.isCooldownActive) {
          setLastResult(data);
        }
        throw new Error(data?.message || data?.error?.message || "Failed to start quiz attempt");
      }

      setActiveAttempt(data);
      setQuestions(data.questions || []);
      setAnswers({});
      setLastResult(null);
    } catch (err: any) {
      setQuizError(err.message || "Failed to start quiz");
    } finally {
      setIsStartingQuiz(false);
    }
  };

  // Handle submitting quiz answers without inspecting option.isCorrect
  const handleQuizSubmit = async () => {
    if (!step?.quiz?.id || !activeAttempt) return;
    setQuizError(null);
    setIsSubmittingQuiz(true);

    try {
      // Build DTO expected by backend: { attemptId, answers: [{ questionId, optionId }] }
      const submissionDto = {
        attemptId: activeAttempt.attemptId,
        answers: questions.map((q) => ({
          questionId: q.id,
          optionId: answers[q.id] || undefined,
        })),
      };

      const res = await fetch(`${API_URL}/quizzes/${step.quiz.id}/submit`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(submissionDto),
      });

      const data: QuizSubmissionResult = await res.json();

      if (!res.ok) {
        throw new Error((data as any)?.message || "Failed to submit quiz attempt");
      }

      setLastResult(data);
      setActiveAttempt(null);
      setAnswers({});

      // If learner passed, re-fetch authoritative progression to unlock next step
      if (data.passed && step.programId) {
        fetchStepAndProgression();
      }
    } catch (err: any) {
      setQuizError(err.message || "Failed to submit quiz");
    } finally {
      setIsSubmittingQuiz(false);
    }
  };

  // Handle completion for steps without quizzes
  const handleCompleteStep = async () => {
    setIsCompletingStep(true);
    try {
      const res = await fetch(`${API_URL}/programs/steps/${stepId}/complete`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({}),
      });
      if (res.ok) {
        fetchStepAndProgression();
      }
    } catch (err) {
      console.warn("Failed to complete step:", err);
    } finally {
      setIsCompletingStep(false);
    }
  };

  const handleOptionChange = (questionId: string, optionId: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div style={{ textAlign: "center", padding: "80px 20px" }}>
          <h2>Loading step...</h2>
          <p style={{ color: "var(--text-secondary)" }}>Verifying access and prerequisites with server...</p>
        </div>
      </div>
    );
  }

  if (loadError || !step) {
    return (
      <div className={styles.container}>
        <div className={styles.lockCard}>
          <div className={styles.lockIconWrap}>⚠️</div>
          <h2 className={styles.lockTitle}>Unable to load step</h2>
          <p className={styles.lockMessage}>{loadError || "Step not found."}</p>
          <Link href={step?.programId ? `/programs/${step.programId}/steps` : "/"} className={styles.submitBtn} style={{ textDecoration: "none", display: "inline-block", maxWidth: "260px" }}>
            Return to Learning Path
          </Link>
        </div>
      </div>
    );
  }

  // Find step in authoritative server progression
  const currentStepProg: StepProgressionItem | undefined = progression?.steps?.find(
    (s) => s.stepId === stepId
  );

  const isEnrolmentInactive = progression && progression.enrolmentStatus !== "ACTIVE";
  const isStepLocked = currentStepProg ? !currentStepProg.isUnlocked : false;

  // ─────────────────────────────────────────────────────────────────────────────
  // ENROLMENT & STEP ACCESS PROTECTION GATES
  // ─────────────────────────────────────────────────────────────────────────────

  if (isEnrolmentInactive) {
    const status = progression?.enrolmentStatus;
    let heading = "Access Restricted";
    let message = "Your enrolment status does not allow access to course content.";
    let actionElement = (
      <Link href="/" className={styles.submitBtn} style={{ textDecoration: "none", display: "inline-block", maxWidth: "260px" }}>
        Return to Dashboard
      </Link>
    );

    if (status === "PENDING_AGREEMENT") {
      heading = "Program Agreement Required";
      message = "You must read and sign the Program Agreement before accessing any step content.";
      actionElement = (
        <Link href="/agreement" className={styles.submitBtn} style={{ textDecoration: "none", display: "inline-block", maxWidth: "260px" }}>
          Sign Agreement Now &rarr;
        </Link>
      );
    } else if (status === "PENDING_PAYMENT") {
      heading = "Payment Confirmation Pending";
      message = "Your course enrolment is pending payment confirmation. Access will unlock once payment clears.";
    } else if (status === "WAITLIST") {
      heading = "Waitlist Status";
      message = "You are currently on the waitlist for this cohort. You will receive an invitation once a seat opens.";
    } else if (status === "REVOKED") {
      heading = "Enrolment Revoked";
      message = "Your enrolment for this program has been revoked. Direct step access is disabled.";
    }

    return (
      <div className={styles.container}>
        <div className={styles.lockCard}>
          <div className={styles.lockIconWrap}>🛡️</div>
          <span className={styles.lockBadge}>{status || "RESTRICTED"}</span>
          <h2 className={styles.lockTitle}>{heading}</h2>
          <p className={styles.lockMessage}>{message}</p>
          <div style={{ marginTop: "1rem" }}>{actionElement}</div>
        </div>
      </div>
    );
  }

  if (isStepLocked) {
    return (
      <div className={styles.container}>
        <div className={styles.lockCard}>
          <div className={styles.lockIconWrap}>🔒</div>
          <span className={styles.lockBadge}>{currentStepProg?.lockReason || "STEP LOCKED"}</span>
          <h2 className={styles.lockTitle}>Step {step.sequence}: {step.title} is Locked</h2>
          <p className={styles.lockMessage}>
            {getLockMessage(currentStepProg?.lockReason)}
          </p>

          <div className={styles.lockDetailBox}>
            <div>
              <strong>Prerequisite Status:</strong>{" "}
              {currentStepProg?.lockReason === "PREVIOUS_STEP_INCOMPLETE"
                ? "Previous step is incomplete"
                : currentStepProg?.lockReason === "QUIZ_NOT_PASSED"
                ? "Previous step quiz not yet passed"
                : currentStepProg?.lockReason === "SCHEDULED_DATE_NOT_REACHED"
                ? "Scheduled release not reached"
                : "Step protected by server progression"}
            </div>
            {currentStepProg?.overrideState === "MANUAL_LOCKED" && (
              <div style={{ marginTop: "6px" }}><strong>Notice:</strong> This step was locked by instructor override.</div>
            )}
            {currentStepProg?.unlockedAt && (
              <div style={{ marginTop: "6px" }}><strong>Scheduled Release:</strong> {new Date(currentStepProg.unlockedAt).toLocaleDateString()}</div>
            )}
          </div>

          <Link href={`/programs/${step.programId}/steps`} className={styles.submitBtn} style={{ textDecoration: "none", display: "inline-block", maxWidth: "280px" }}>
            ← Return to Learning Path
          </Link>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP CONTENT (UNLOCKED & ACTIVE)
  // ─────────────────────────────────────────────────────────────────────────────

  const lesson = step.lessons?.find((l: any) => l.type !== "PDF");
  const documents = (step.lessons || []).filter((l: any) => l.type === "PDF");
  const quiz = step.quiz;
  const isStepCompleted = currentStepProg?.isCompleted || lastResult?.passed;

  const answeredCount = Object.keys(answers).length;
  const allAnswered = questions.length > 0 && answeredCount === questions.length;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Link href={`/programs/${step.programId}/steps`} className={styles.backBtn}>
          ← Back to Roadmap
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <h1 className={styles.title}>Step {step.sequence}: {step.title}</h1>
          {isStepCompleted && (
            <span style={{ background: "#ecfdf5", color: "#065f46", padding: "4px 12px", borderRadius: "16px", fontWeight: 700, fontSize: "0.85rem", border: "1px solid #a7f3d0" }}>
              ✓ Completed
            </span>
          )}
          {currentStepProg?.overrideState === "MANUAL_UNLOCKED" && (
            <span style={{ background: "#eff6ff", color: "#1e40af", padding: "4px 12px", borderRadius: "16px", fontWeight: 700, fontSize: "0.85rem", border: "1px solid #bfdbfe" }}>
              Staff Unlocked
            </span>
          )}
        </div>
        <p className={styles.subtitle}>{step.description}</p>
      </header>

      <div className={styles.contentGrid}>
        <div className={styles.mainColumn}>
          {lesson ? (
            <div className={styles.videoContainer}>
              {(() => {
                const isUpload = lesson.mediaUrl?.startsWith("upload:");
                let videoSrc = lesson.mediaUrl;
                if (isUpload) {
                  const publicId = lesson.mediaUrl.replace("upload:", "");
                  const streamingKey = publicId.includes(".") ? publicId : `${publicId}.mp4`;
                  videoSrc = `${API_URL}/media/stream/${streamingKey}`;
                }

                return (
                  <video
                    controls
                    controlsList="nodownload"
                    onEnded={() => {
                      if (!quiz && !isStepCompleted) handleCompleteStep();
                    }}
                    style={{ width: "100%", aspectRatio: "16/9", backgroundColor: "#000", borderRadius: "12px" }}
                    src={videoSrc}
                  >
                    Your browser does not support the video tag.
                  </video>
                );
              })()}
              <div style={{ marginTop: "10px", fontWeight: "bold" }}>{lesson.title}</div>
            </div>
          ) : (
            <div className={styles.videoContainer}>
              <div className={styles.videoPlaceholder} style={{ textAlign: "center", padding: "40px", background: "var(--bg-soft)", borderRadius: "12px" }}>
                <p>No video content uploaded for this step yet.</p>
              </div>
            </div>
          )}

          {documents.length > 0 && (
            <div style={{ marginTop: "24px" }}>
              <h2 style={{ fontSize: "1.1rem", margin: "0 0 12px" }}>Documents</h2>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
                {documents.map((doc: any) => (
                  <li key={doc.id}>
                    <a
                      href={doc.mediaUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "12px",
                        padding: "14px 16px",
                        border: "1px solid var(--border-light)",
                        borderRadius: "12px",
                        background: "var(--bg-card)",
                        color: "var(--text-primary)",
                        textDecoration: "none",
                        fontWeight: 600,
                      }}
                    >
                      <span>{doc.title}</span>
                      <span style={{ color: "var(--accent-primary)", fontSize: "0.85rem" }}>Open PDF &rarr;</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className={styles.descriptionCard} style={{ marginTop: "20px" }}>
            <h3>About this step</h3>
            <p>{step.description || "No detailed description available."}</p>
          </div>

          {!quiz && (
            <div className={styles.descriptionCard} style={{ marginTop: "20px" }}>
              <h3>Step Progression</h3>
              {isStepCompleted ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
                  <p style={{ margin: 0, color: "#065f46", fontWeight: 600 }}>✓ Step completed on server.</p>
                  <Link href={`/programs/${step.programId}/steps`} className={styles.submitBtn} style={{ textDecoration: "none", display: "inline-block", maxWidth: "200px" }}>
                    Next Step &rarr;
                  </Link>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
                  <p style={{ margin: 0, color: "var(--text-secondary)" }}>Review the material and mark this step finished to unlock what is next.</p>
                  <button
                    type="button"
                    onClick={handleCompleteStep}
                    disabled={isCompletingStep}
                    className={styles.submitBtn}
                    style={{ maxWidth: "200px" }}
                  >
                    {isCompletingStep ? "Completing..." : "Complete Step"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* QUIZ SECTION */}
        <div className={styles.sideColumn}>
          <div className={styles.quizCard}>
            <h3>Knowledge Check</h3>

            {quiz ? (
              <>
                <div className={styles.quizMetaBar}>
                  <span>Pass mark: <strong>{quiz.passMark}%</strong></span>
                  <span>Pool: <strong>{quiz.questionCount ?? 10} questions</strong></span>
                </div>

                {quizError && (
                  <div className={styles.errorBanner}>
                    <strong>Notice:</strong> {quizError}
                  </div>
                )}

                {/* 1. QUIZ IN PROGRESS (ACTIVE ATTEMPT) */}
                {activeAttempt ? (
                  <div>
                    <div style={{ marginBottom: "1rem", fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                      Attempt #{activeAttempt.attemptNumber} in progress. Answer all questions to submit.
                    </div>

                    {questions.map((q, i) => (
                      <div key={q.id} className={styles.question} style={{ marginBottom: "20px" }}>
                        <p style={{ fontWeight: 600, marginBottom: "8px" }}>
                          {i + 1}. {q.text}
                        </p>
                        <div className={styles.options}>
                          {q.options?.map((opt) => {
                            const isSelected = answers[q.id] === opt.id;
                            return (
                              <label
                                key={opt.id}
                                className={styles.option}
                                style={{
                                  background: isSelected ? "var(--accent-highlight)" : "var(--bg-soft)",
                                  borderColor: isSelected ? "var(--accent-primary)" : "var(--border-light)",
                                }}
                              >
                                <input
                                  type="radio"
                                  name={`q_${q.id}`}
                                  value={opt.id}
                                  checked={isSelected}
                                  onChange={() => handleOptionChange(q.id, opt.id)}
                                />
                                {opt.text}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    <button
                      type="button"
                      className={styles.submitBtn}
                      style={{ marginTop: "10px" }}
                      onClick={handleQuizSubmit}
                      disabled={!allAnswered || isSubmittingQuiz}
                    >
                      {isSubmittingQuiz
                        ? "Submitting to Server..."
                        : !allAnswered
                        ? `Answer all questions (${answeredCount}/${questions.length})`
                        : "Submit Quiz"}
                    </button>
                  </div>
                ) : lastResult ? (
                  /* 2. SUBMITTED / COMPLETED ATTEMPT DISPLAY */
                  <div>
                    {lastResult.passed ? (
                      <div className={styles.quizResultSuccess}>
                        <h4 style={{ margin: "0 0 6px", fontSize: "1.1rem" }}>🎉 Great job! You Passed!</h4>
                        <p style={{ margin: "0 0 4px" }}>
                          Server Score: <strong>{lastResult.score}%</strong> (Pass mark: {lastResult.passMark}%)
                        </p>
                        {lastResult.correctCount !== undefined && lastResult.totalQuestions !== undefined && (
                          <p style={{ margin: 0, fontSize: "0.85rem" }}>
                            {lastResult.correctCount} of {lastResult.totalQuestions} questions correct.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className={styles.quizResultFail}>
                        <h4 style={{ margin: "0 0 6px", fontSize: "1.1rem" }}>Keep Trying!</h4>
                        <p style={{ margin: "0 0 4px" }}>
                          Score: <strong>{lastResult.score}%</strong> (Required: {lastResult.passMark}%)
                        </p>
                        <p style={{ margin: 0, fontSize: "0.85rem" }}>
                          Attempts: {lastResult.attemptsUsed ?? 1} of {lastResult.maxAttempts ?? quiz.maxAttempts ?? 3} used ({lastResult.attemptsRemaining ?? 0} remaining)
                        </p>
                      </div>
                    )}

                    {/* Cooldown notification */}
                    {lastResult.isCooldownActive && (
                      <div className={styles.cooldownBox}>
                        <strong>⏳ Cooldown Active</strong>
                        <p style={{ margin: "4px 0 0" }}>
                          Next attempt available after:{" "}
                          <strong>
                            {lastResult.cooldownUntil
                              ? new Date(lastResult.cooldownUntil).toLocaleString()
                              : "cooldown period"}
                          </strong>
                        </p>
                      </div>
                    )}

                    {/* Revision guidance */}
                    {lastResult.stepToRevisit && (
                      <div className={styles.revisitBox}>
                        <strong>📖 Recommended Revision</strong>
                        <p style={{ margin: "4px 0 8px" }}>
                          Review Step {lastResult.stepToRevisit.sequence}: {lastResult.stepToRevisit.title} before your next attempt.
                        </p>
                        <Link href={`/steps/${lastResult.stepToRevisit.id}`} className={styles.backBtn} style={{ fontSize: "0.85rem" }}>
                          Go to Step {lastResult.stepToRevisit.sequence} &rarr;
                        </Link>
                      </div>
                    )}

                    {/* Trainer guidance */}
                    {lastResult.retryGuidance && (
                      <div className={styles.guidanceBox}>
                        <strong>💡 Feedback Guidance:</strong>
                        <p style={{ margin: "4px 0 0" }}>{lastResult.retryGuidance}</p>
                      </div>
                    )}

                    {/* Action buttons */}
                    {lastResult.passed ? (
                      <div style={{ textAlign: "center", marginTop: "1rem" }}>
                        <Link
                          href={`/programs/${step.programId}/steps`}
                          className={styles.submitBtn}
                          style={{ textDecoration: "none", display: "inline-block" }}
                        >
                          Continue to Next Step &rarr;
                        </Link>
                      </div>
                    ) : (
                      <div style={{ marginTop: "1rem" }}>
                        {lastResult.canRetry && !lastResult.isCooldownActive && (lastResult.attemptsRemaining ?? 1) > 0 ? (
                          <button
                            type="button"
                            onClick={handleStartQuiz}
                            disabled={isStartingQuiz}
                            className={styles.submitBtn}
                          >
                            {isStartingQuiz ? "Starting Quiz..." : "Retry Quiz"}
                          </button>
                        ) : lastResult.attemptsRemaining !== undefined && lastResult.attemptsRemaining <= 0 ? (
                          <div style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                            Maximum attempts reached. Please reach out to your instructor or support.
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                ) : (
                  /* 3. READY TO START INITIAL ATTEMPT */
                  <div>
                    <p className={styles.quizDesc}>
                      You must score at least {quiz.passMark}% to unlock the next step. Answer all questions generated from this topic.
                    </p>
                    <button
                      type="button"
                      className={styles.submitBtn}
                      onClick={handleStartQuiz}
                      disabled={isStartingQuiz}
                    >
                      {isStartingQuiz ? "Starting Quiz..." : "Start Quiz"}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p style={{ color: "var(--text-secondary)" }}>No quiz configured for this step.</p>
            )}
          </div>

          <div className={styles.resourceCard} style={{ marginTop: "20px" }}>
            <h3>Step Information</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: "0 0 8px" }}>
              Sequential progression is monitored live by the server engine.
            </p>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: 0 }}>
              Step Sequence: #{step.sequence}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
