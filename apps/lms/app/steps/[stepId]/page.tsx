"use client";

import { useEffect, useState, use, useCallback, useRef } from "react";
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

  // Lesson progress state (D1-035)
  const [lessonProgress, setLessonProgress] = useState<Record<string, any>>({});
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [resumedFrom, setResumedFrom] = useState<{ lessonId: string; timeSec: number } | null>(null);
  const lastHeartbeatTimeRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Quiz engine state
  const [activeAttempt, setActiveAttempt] = useState<ActiveQuizAttempt | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [lastResult, setLastResult] = useState<QuizSubmissionResult | null>(null);
  const [isStartingQuiz, setIsStartingQuiz] = useState(false);
  const [isSubmittingQuiz, setIsSubmittingQuiz] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);

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
      let progData: EnrolmentProgressionResponse | null = null;
      if (stepData.programId) {
        const progRes = await fetch(`${API_URL}/progression/me/${stepData.programId}`, {
          headers: getAuthHeaders(),
        });
        if (progRes.ok) {
          progData = await progRes.json();
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

      // 3. Initialize lesson progress from authoritative progression response (removes N+1)
      const stepProgItem = progData?.steps?.find((s: any) => s.stepId === stepId);
      const lpMap: Record<string, any> = {};

      if (stepProgItem?.lessons && stepProgItem.lessons.length > 0) {
        for (const l of stepProgItem.lessons) {
          lpMap[l.lessonId] = {
            viewed: l.isCompleted,
            progressPercent: l.progressPercent,
            lastPositionSec: l.lastPositionSec,
            completedAt: l.completedAt,
            durationSec: l.durationSec,
            isCompleted: l.isCompleted,
          };
        }
        setLessonProgress(lpMap);
      } else if (Array.isArray(stepData.lessons) && stepData.lessons.length > 0) {
        try {
          await Promise.all(
            stepData.lessons.map(async (l: any) => {
              const lpRes = await fetch(`${API_URL}/progress/lessons/${l.id}`, {
                headers: getAuthHeaders(),
              });
              if (lpRes.ok) {
                const lpData = await lpRes.json();
                if (lpData) lpMap[l.id] = lpData;
              }
            })
          );
          setLessonProgress(lpMap);
        } catch (lpErr) {
          console.warn("Failed to check lesson progress:", lpErr);
        }
      }

      // 4. If quiz exists on step, check active or previous attempt state
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
        if (res.status === 403 && (data?.error === "AGREEMENT_REQUIRED" || (typeof data?.message === "string" && data.message.includes("AGREEMENT_REQUIRED")))) {
          throw new Error("Program agreement signature is required before taking step quizzes. Please sign the agreement first.");
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

  // D1-035: Video/Audio media playback heartbeat
  const sendMediaHeartbeat = useCallback(
    async (lessonId: string, positionSec: number) => {
      try {
        const res = await fetch(`${API_URL}/progress/lessons/${lessonId}/heartbeat`, {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ positionSec }),
        });
        if (res.ok) {
          const data = await res.json();
          setLessonProgress((prev) => ({ ...prev, [lessonId]: data }));
          if (data.isCompleted && !lessonProgress[lessonId]?.isCompleted) {
            fetchStepAndProgression();
          }
        }
      } catch (err) {
        console.warn("Heartbeat error:", err);
      }
    },
    [lessonProgress, fetchStepAndProgression]
  );

  // Send keepalive heartbeat on pagehide / tab switch (Edge Case 6)
  useEffect(() => {
    const handleVisibilityOrHide = () => {
      const activeVideo = videoRef.current;
      const mediaId = selectedMediaId || (step?.lessons?.find((l: any) => l.type === "VIDEO" || l.type === "AUDIO")?.id);
      if (activeVideo && mediaId && (document.visibilityState === "hidden" || !document.hasFocus())) {
        const currentSec = Math.floor(activeVideo.currentTime);
        if (currentSec > 0) {
          const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
          fetch(`${API_URL}/progress/lessons/${mediaId}/heartbeat`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ positionSec: currentSec }),
            keepalive: true,
          }).catch(() => {});
        }
      }
    };

    window.addEventListener("pagehide", handleVisibilityOrHide);
    document.addEventListener("visibilitychange", handleVisibilityOrHide);
    return () => {
      window.removeEventListener("pagehide", handleVisibilityOrHide);
      document.removeEventListener("visibilitychange", handleVisibilityOrHide);
    };
  }, [selectedMediaId, step]);

  // D1-035: PDF or text lesson completion
  const handleCompleteDocument = async (lessonId: string) => {
    try {
      const res = await fetch(`${API_URL}/progress/lessons/${lessonId}/complete`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        setLessonProgress((prev) => ({ ...prev, [lessonId]: data }));
        fetchStepAndProgression();
      }
    } catch (err) {
      console.warn("Document completion error:", err);
    }
  };

  const handleCompleteLesson = async (lessonId: string) => {
    try {
      await fetch(`${API_URL}/progress/lessons/${lessonId}/complete`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
    } catch (err) {
      console.warn("Failed to mark lesson complete:", err);
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
              {currentStepProg?.lockReason === "AGREEMENT_REQUIRED"
                ? "Program agreement signature is required before accessing Step 1 content"
                : currentStepProg?.lockReason === "PREVIOUS_STEP_INCOMPLETE"
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

          {currentStepProg?.lockReason === "AGREEMENT_REQUIRED" ? (
            <Link
              href={`/agreement?programId=${step.programId}&enrolmentId=${progression?.enrolmentId || ""}`}
              className={styles.submitBtn}
              style={{ textDecoration: "none", display: "inline-block", maxWidth: "280px", background: "var(--accent-primary, #0284c7)" }}
            >
              Sign Program Agreement &rarr;
            </Link>
          ) : (
            <Link href={`/programs/${step.programId}/steps`} className={styles.submitBtn} style={{ textDecoration: "none", display: "inline-block", maxWidth: "280px" }}>
              ← Return to Learning Path
            </Link>
          )}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP CONTENT (UNLOCKED & ACTIVE)
  // ─────────────────────────────────────────────────────────────────────────────

  const mediaLessons = (step.lessons || []).filter((l: any) => l.type === "VIDEO" || l.type === "AUDIO");
  const documents = (step.lessons || []).filter((l: any) => l.type === "PDF");
  const textLessons = (step.lessons || []).filter((l: any) => l.type === "TEXT");
  const quiz = step.quiz;

  const currentMedia = mediaLessons.find((m: any) => m.id === selectedMediaId) || mediaLessons[0];

  const allStepLessons = step.lessons || [];
  const completedLessonsCount = allStepLessons.filter(
    (l: any) => lessonProgress[l.id]?.isCompleted || lessonProgress[l.id]?.viewed
  ).length;
  const isQuizPassed = currentStepProg?.quiz?.isPassed || lastResult?.passed;
  const stepTotalItems = allStepLessons.length + (quiz ? 1 : 0);
  const stepCompletedItems = completedLessonsCount + (quiz && isQuizPassed ? 1 : 0);
  const isStepCompleted = currentStepProg?.isCompleted || (stepTotalItems > 0 && stepCompletedItems === stepTotalItems);
  const calculatedStepPercent = stepTotalItems > 0
    ? (isStepCompleted ? 100 : Math.floor((stepCompletedItems / stepTotalItems) * 100))
    : 100;

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

      {/* STEP PROGRESS BAR */}
      <div
        style={{
          background: "var(--bg-card, #ffffff)",
          border: "1px solid var(--border-light, #e2e8f0)",
          borderRadius: "12px",
          padding: "16px 20px",
          marginBottom: "24px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: "1rem" }}>
              Step Progress: {calculatedStepPercent}%
            </span>
            <span style={{ marginLeft: "10px", fontSize: "0.85rem", color: "var(--text-secondary, #64748b)" }}>
              ({stepCompletedItems} of {stepTotalItems} requirements completed)
            </span>
          </div>
          {isStepCompleted && (
            <span style={{ color: "#16a34a", fontSize: "0.85rem", fontWeight: 700 }}>
              ✓ Step Requirements Met
            </span>
          )}
        </div>
        <div style={{ width: "100%", height: "10px", background: "var(--bg-soft, #f1f5f9)", borderRadius: "6px", overflow: "hidden" }}>
          <div
            style={{
              width: `${calculatedStepPercent}%`,
              height: "100%",
              background: calculatedStepPercent === 100 ? "#16a34a" : "var(--accent-primary, #0284c7)",
              borderRadius: "6px",
              transition: "width 0.4s ease",
            }}
          />
        </div>
      </div>

      <div className={styles.contentGrid}>
        <div className={styles.mainColumn}>
          {mediaLessons.length > 1 && (
            <div style={{ display: "flex", gap: "8px", marginBottom: "12px", overflowX: "auto", paddingBottom: "4px" }}>
              {mediaLessons.map((m: any, idx: number) => {
                const isSelected = (currentMedia?.id === m.id);
                const isViewed = lessonProgress[m.id]?.isCompleted || lessonProgress[m.id]?.viewed;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedMediaId(m.id)}
                    style={{
                      padding: "8px 14px",
                      borderRadius: "8px",
                      border: isSelected ? "2px solid var(--accent-primary, #0284c7)" : "1px solid var(--border-light, #e2e8f0)",
                      background: isSelected ? "var(--accent-highlight, #f0f9ff)" : "var(--bg-card, #ffffff)",
                      color: isSelected ? "var(--accent-primary, #0284c7)" : "var(--text-primary)",
                      fontWeight: isSelected ? 700 : 500,
                      fontSize: "0.85rem",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <span>{m.type === "AUDIO" ? "🎧" : "🎬"} Lesson {idx + 1}</span>
                    {isViewed && <span style={{ color: "#16a34a" }}>✓</span>}
                  </button>
                );
              })}
            </div>
          )}

          {currentMedia ? (
            <div className={styles.videoContainer}>
              {(() => {
                const isUpload = currentMedia.mediaUrl?.startsWith("upload:");
                let videoSrc = currentMedia.mediaUrl;
                if (isUpload) {
                  const publicId = currentMedia.mediaUrl.replace("upload:", "");
                  const streamingKey = publicId.includes(".") ? publicId : `${publicId}.mp4`;
                  videoSrc = `${API_URL}/media/stream/${streamingKey}`;
                }

                return (
                  <video
                    ref={videoRef}
                    key={currentMedia.id}
                    controls
                    controlsList="nodownload"
                    onLoadedMetadata={(e) => {
                      const resumeSec = lessonProgress[currentMedia.id]?.lastPositionSec;
                      if (resumeSec && resumeSec > 5 && resumeSec < e.currentTarget.duration - 5) {
                        e.currentTarget.currentTime = resumeSec;
                        setResumedFrom({ lessonId: currentMedia.id, timeSec: Math.floor(resumeSec) });
                      }
                    }}
                    onTimeUpdate={(e) => {
                      const currentSec = Math.floor(e.currentTarget.currentTime);
                      const now = Date.now();
                      if (now - lastHeartbeatTimeRef.current > 15000) {
                        lastHeartbeatTimeRef.current = now;
                        sendMediaHeartbeat(currentMedia.id, currentSec);
                      }
                    }}
                    onPause={(e) => {
                      sendMediaHeartbeat(currentMedia.id, Math.floor(e.currentTarget.currentTime));
                    }}
                    onEnded={(e) => {
                      const duration = Math.floor(e.currentTarget.duration || 0);
                      sendMediaHeartbeat(currentMedia.id, duration);
                      if (!currentMedia.durationSec || currentMedia.durationSec <= 0) {
                        handleCompleteDocument(currentMedia.id);
                      }
                    }}
                    style={{ width: "100%", aspectRatio: "16/9", backgroundColor: "#000", borderRadius: "12px" }}
                    src={videoSrc}
                  >
                    Your browser does not support the video tag.
                  </video>
                );
              })()}

              {/* Resume Notice with option to start over */}
              {resumedFrom && resumedFrom.lessonId === currentMedia.id && (
                <div
                  style={{
                    marginTop: "8px",
                    padding: "8px 14px",
                    backgroundColor: "#f0f9ff",
                    border: "1px solid #bae6fd",
                    borderRadius: "8px",
                    fontSize: "0.85rem",
                    color: "#0369a1",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>
                    Resumed playback from <strong>{Math.floor(resumedFrom.timeSec / 60)}:{(resumedFrom.timeSec % 60).toString().padStart(2, "0")}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (videoRef.current) {
                        videoRef.current.currentTime = 0;
                      }
                      setResumedFrom(null);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#0284c7",
                      fontWeight: 600,
                      cursor: "pointer",
                      textDecoration: "underline",
                      fontSize: "0.85rem",
                      padding: 0,
                    }}
                  >
                    Start from beginning
                  </button>
                </div>
              )}

              <div style={{ marginTop: "10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: "bold" }}>{currentMedia.title}</span>
                {lessonProgress[currentMedia.id]?.isCompleted || lessonProgress[currentMedia.id]?.viewed ? (
                  <span style={{ color: "#16a34a", fontSize: "0.85rem", fontWeight: 700 }}>
                    ✓ Watched
                  </span>
                ) : lessonProgress[currentMedia.id]?.progressPercent > 0 ? (
                  <span style={{ color: "var(--accent-primary, #0284c7)", fontSize: "0.85rem", fontWeight: 600 }}>
                    {lessonProgress[currentMedia.id]?.lastPositionSec && currentMedia.durationSec
                      ? `${Math.floor(lessonProgress[currentMedia.id].lastPositionSec / 60)}:${(Math.floor(lessonProgress[currentMedia.id].lastPositionSec) % 60).toString().padStart(2, "0")} / ${Math.floor(currentMedia.durationSec / 60)}:${(currentMedia.durationSec % 60).toString().padStart(2, "0")} · `
                      : ""}
                    Watched {Math.round(lessonProgress[currentMedia.id].progressPercent)}%
                  </span>
                ) : null}
              </div>
            </div>
          ) : (
            <div className={styles.videoContainer}>
              <div className={styles.videoPlaceholder} style={{ textAlign: "center", padding: "40px", background: "var(--bg-soft)", borderRadius: "12px" }}>
                <p>No video content uploaded for this step yet.</p>
              </div>
            </div>
          )}

          {textLessons.length > 0 && (
            <div style={{ marginTop: "24px" }}>
              <h2 style={{ fontSize: "1.1rem", margin: "0 0 12px" }}>Reading Lessons</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {textLessons.map((textLesson: any) => {
                  const isRead = lessonProgress[textLesson.id]?.isCompleted || lessonProgress[textLesson.id]?.viewed;
                  return (
                    <div
                      key={textLesson.id}
                      style={{
                        padding: "16px",
                        border: "1px solid var(--border-light)",
                        borderRadius: "12px",
                        background: "var(--bg-card)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                        <h4 style={{ margin: 0, fontSize: "1rem" }}>📖 {textLesson.title}</h4>
                        {isRead ? (
                          <span style={{ color: "#16a34a", fontSize: "0.85rem", fontWeight: 700 }}>✓ Completed</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleCompleteDocument(textLesson.id)}
                            className={styles.secondaryBtn}
                            style={{ padding: "4px 12px", fontSize: "0.8rem", cursor: "pointer" }}
                          >
                            Mark as Read
                          </button>
                        )}
                      </div>
                      {textLesson.content && <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", margin: 0 }}>{textLesson.content}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {documents.length > 0 && (
            <div style={{ marginTop: "24px" }}>
              <h2 style={{ fontSize: "1.1rem", margin: "0 0 12px" }}>Documents &amp; Reading Materials</h2>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
                {documents.map((doc: any) => {
                  const isDocCompleted = lessonProgress[doc.id]?.isCompleted;
                  return (
                    <li
                      key={doc.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "12px",
                        padding: "14px 16px",
                        border: "1px solid var(--border-light)",
                        borderRadius: "12px",
                        background: "var(--bg-card)",
                      }}
                    >
                      <a
                        href={doc.mediaUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => handleCompleteDocument(doc.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          color: "var(--text-primary)",
                          textDecoration: "none",
                          fontWeight: 600,
                        }}
                      >
                        <span>📄</span>
                        <span>{doc.title}</span>
                        <span style={{ color: "var(--accent-primary)", fontSize: "0.8rem", marginLeft: "4px" }}>
                          (Open PDF &rarr;)
                        </span>
                      </a>

                      <div>
                        {isDocCompleted ? (
                          <span style={{ color: "#16a34a", fontSize: "0.85rem", fontWeight: 700 }}>
                            ✓ Marked as Read
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleCompleteDocument(doc.id)}
                            className={styles.secondaryBtn}
                            style={{
                              padding: "4px 10px",
                              fontSize: "0.8rem",
                              cursor: "pointer",
                              background: "#f1f5f9",
                              border: "1px solid #cbd5e1",
                              borderRadius: "6px"
                            }}
                          >
                            Mark as Read
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
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
                  <p style={{ margin: 0, color: "var(--text-secondary)" }}>
                    {currentMedia && !lessonProgress[currentMedia.id]?.isCompleted
                      ? "Watch the lesson video to advance your progress."
                      : documents.length > 0
                      ? "Read and mark the document materials as read to complete this step."
                      : "Complete the step materials above to advance."}
                  </p>
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
