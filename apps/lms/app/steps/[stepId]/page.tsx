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
import { fetchWithCache, prefetchUrl, getCachedData, mutateCache } from "../../lib/cache";

type JourneyTab = "video" | "resources" | "notes" | "quiz" | "completion";

export default function StepPage({ params }: { params: Promise<{ stepId: string }> }) {
  const router = useRouter();
  const unwrappedParams = use(params);
  const stepId = unwrappedParams.stepId;

  // Instant SWR Cache Read (0ms render if prefetched or cached)
  const [step, setStep] = useState<any>(() => {
    return getCachedData<any>(`${API_URL}/programs/steps/${stepId}`) || null;
  });
  const [progression, setProgression] = useState<EnrolmentProgressionResponse | null>(() => {
    const cachedStep = getCachedData<any>(`${API_URL}/programs/steps/${stepId}`);
    if (cachedStep?.programId) {
      return getCachedData<EnrolmentProgressionResponse>(`${API_URL}/progression/me/${cachedStep.programId}`) || null;
    }
    return null;
  });
  const [loading, setLoading] = useState<boolean>(() => {
    const cachedStep = getCachedData<any>(`${API_URL}/programs/steps/${stepId}`);
    return !cachedStep;
  });
  const [loadError, setLoadError] = useState<string | null>(null);

  // Layout & Journey State (with sessionStorage tab preservation)
  const [activeTab, setActiveTab] = useState<JourneyTab>(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem(`wbm_tab_${stepId}`);
      if (saved && ["video", "resources", "notes", "quiz", "completion"].includes(saved)) {
        return saved as JourneyTab;
      }
    }
    return "video";
  });

  const switchTab = (tab: JourneyTab) => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      sessionStorage.setItem(`wbm_tab_${stepId}`, tab);
    }
  };

  const [showOutline, setShowOutline] = useState(true);
  const [showContext, setShowContext] = useState(true);

  // Playback Speed State (with localStorage persistence)
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("wbm_playback_speed");
      if (saved) return parseFloat(saved) || 1;
    }
    return 1;
  });

  const changePlaybackSpeed = () => {
    const speeds = [1, 1.25, 1.5, 1.75, 2];
    const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
    const newRate = speeds[nextIdx] ?? 1;
    setPlaybackSpeed(newRate);
    if (videoRef.current) videoRef.current.playbackRate = newRate;
    if (typeof window !== "undefined") {
      localStorage.setItem("wbm_playback_speed", newRate.toString());
    }
  };

  // Lesson & Video Progress state
  const [lessonProgress, setLessonProgress] = useState<Record<string, any>>({});
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [resumedFrom, setResumedFrom] = useState<{ lessonId: string; timeSec: number } | null>(null);
  const lastHeartbeatTimeRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Quiz Engine state
  const [activeAttempt, setActiveAttempt] = useState<ActiveQuizAttempt | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [lastResult, setLastResult] = useState<QuizSubmissionResult | null>(null);
  const [isStartingQuiz, setIsStartingQuiz] = useState(false);
  const [isSubmittingQuiz, setIsSubmittingQuiz] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);

  // Personal Notes state (auto-saved to localStorage)
  const [personalNotes, setPersonalNotes] = useState<string>("");
  const [notesSaveStatus, setNotesSaveStatus] = useState<string>("Saved");

  // Watermark user email
  const [userEmail, setUserEmail] = useState<string>("Learner");

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (token) {
      try {
        const parts = token.split(".");
        if (parts[1]) {
          const payload = JSON.parse(atob(parts[1]));
          if (payload.email) setUserEmail(payload.email);
        }
      } catch (e) {}
    }
  }, []);

  // Load personal notes from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined" && stepId) {
      const saved = localStorage.getItem(`wbm_notes_${stepId}`);
      if (saved) setPersonalNotes(saved);
    }
  }, [stepId]);

  // Auto-save notes debounce
  const handleNotesChange = (text: string) => {
    setPersonalNotes(text);
    setNotesSaveStatus("Saving...");
    if (typeof window !== "undefined" && stepId) {
      localStorage.setItem(`wbm_notes_${stepId}`, text);
      setTimeout(() => {
        setNotesSaveStatus("Saved just now");
      }, 500);
    }
  };

  const insertTimestamp = () => {
    const activeVideo = videoRef.current;
    if (activeVideo) {
      const sec = Math.floor(activeVideo.currentTime);
      const formatted = `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, "0")}`;
      const stamp = `\n[Timestamp ${formatted}]: `;
      handleNotesChange(personalNotes + stamp);
    }
  };

  const exportNotes = () => {
    const blob = new Blob([`Notes for Step ${step?.sequence}: ${step?.title}\n\n${personalNotes}`], {
      type: "text/plain",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `WhatBoutMe_Step_${step?.sequence || 1}_Notes.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in notes or input
      if (["TEXTAREA", "INPUT"].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key === "f" || e.key === "F") {
        setShowOutline((prev) => !prev);
        setShowContext((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const fetchStepAndProgression = useCallback(async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      router.push("/login");
      return;
    }

    try {
      setLoadError(null);
      // 1. Fetch step metadata with SWR cache
      const stepData = await fetchWithCache<any>(
        `${API_URL}/programs/steps/${stepId}`,
        {},
        3 * 60 * 1000,
        (freshStep) => {
          setStep(freshStep);
        }
      );
      setStep(stepData);

      // 2. Fetch authoritative progression with SWR cache
      let progData: EnrolmentProgressionResponse | null = null;
      if (stepData.programId) {
        try {
          progData = await fetchWithCache<EnrolmentProgressionResponse>(
            `${API_URL}/progression/me/${stepData.programId}`,
            {},
            3 * 60 * 1000,
            (freshProg) => {
              setProgression(freshProg);
            }
          );
          setProgression(progData);
        } catch (progErr: any) {
          if (progErr?.message?.includes("403") || progErr?.message?.includes("404")) {
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
      }

      // 3. Initialize lesson progress
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
              const lpData = await fetchWithCache<any>(`${API_URL}/progress/lessons/${l.id}`).catch(() => null);
              if (lpData) lpMap[l.id] = lpData;
            })
          );
          setLessonProgress(lpMap);
        } catch (lpErr) {
          console.warn("Failed to check lesson progress:", lpErr);
        }
      }

      // Determine default active tab if no valid tab saved
      const savedTab = typeof window !== "undefined" ? sessionStorage.getItem(`wbm_tab_${stepId}`) : null;
      const mediaList = (stepData.lessons || []).filter((l: any) => l.type === "VIDEO" || l.type === "AUDIO");
      if (!savedTab) {
        if (mediaList.length === 0) {
          setActiveTab("resources");
        } else {
          setActiveTab("video");
        }
      }

      // 4. Check active quiz attempt
      if (stepData.quiz?.id) {
        try {
          const attemptData = await fetchWithCache<any>(`${API_URL}/quizzes/${stepData.quiz.id}/attempt`, {}, 60 * 1000).catch(() => null);
          if (attemptData) {
            if (attemptData.status === "IN_PROGRESS") {
              setActiveAttempt(attemptData);
              setQuestions(attemptData.questions || []);
            } else {
              setLastResult(attemptData);
            }
          }
        } catch (quizErr) {
          console.warn("Failed to check active quiz attempt:", quizErr);
        }
      }

      // 5. Intelligent Predictive Prefetching of next & previous steps
      if (progData?.steps && progData.steps.length > 0) {
        const currIdx = progData.steps.findIndex((s) => s.stepId === stepId);
        if (currIdx >= 0) {
          const next = progData.steps[currIdx + 1];
          if (next?.stepId) {
            router.prefetch(`/steps/${next.stepId}`);
            prefetchUrl(`${API_URL}/programs/steps/${next.stepId}`);
            if (next.quiz?.quizId) {
              prefetchUrl(`${API_URL}/quizzes/${next.quiz.quizId}/attempt`);
            }
          }
          const prev = progData.steps[currIdx - 1];
          if (prev?.stepId) {
            router.prefetch(`/steps/${prev.stepId}`);
            prefetchUrl(`${API_URL}/programs/steps/${prev.stepId}`);
          }
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

  // Quiz Actions
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
      setCurrentQuestionIdx(0);
    } catch (err: any) {
      setQuizError(err.message || "Failed to start quiz");
    } finally {
      setIsStartingQuiz(false);
    }
  };

  const handleQuizSubmit = async () => {
    if (!step?.quiz?.id || !activeAttempt) return;
    setQuizError(null);
    setIsSubmittingQuiz(true);

    try {
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

      if (data.passed && step.programId) {
        fetchStepAndProgression();
      }
    } catch (err: any) {
      setQuizError(err.message || "Failed to submit quiz");
    } finally {
      setIsSubmittingQuiz(false);
    }
  };

  // Video Heartbeat
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

  // Keepalive heartbeat on tab close
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

  // Document Completion (Optimistic)
  const handleCompleteDocument = async (lessonId: string) => {
    // 1. Instant optimistic UI update
    setLessonProgress((prev) => ({
      ...prev,
      [lessonId]: {
        ...(prev[lessonId] || {}),
        isCompleted: true,
        viewed: true,
        progressPercent: 100,
        completedAt: new Date().toISOString(),
      },
    }));

    try {
      const res = await fetch(`${API_URL}/progress/lessons/${lessonId}/complete`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        setLessonProgress((prev) => ({ ...prev, [lessonId]: data }));
        if (step?.programId) {
          fetch(`${API_URL}/progression/me/${step.programId}`, { headers: getAuthHeaders() })
            .then((r) => r.ok && r.json())
            .then((prog) => prog && setProgression(prog))
            .catch(() => {});
        }
      }
    } catch (err) {
      console.warn("Document completion error:", err);
    }
  };

  const handleOptionChange = (questionId: string, optionId: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
  };

  // Zero-CLS Three-Panel Loading Skeleton State
  if (loading) {
    return (
      <div className={styles.workspaceLayout}>
        <header className={styles.topNav}>
          <div className={styles.topNavLeft}>
            <div className="skeleton" style={{ width: 110, height: 32, borderRadius: 8 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div className="skeleton" style={{ width: 140, height: 16, borderRadius: 4 }} />
              <span style={{ color: "var(--border-light)" }}>/</span>
              <div className="skeleton" style={{ width: 200, height: 18, borderRadius: 4 }} />
            </div>
          </div>
          <div className={styles.topNavRight}>
            <div className="skeleton" style={{ width: 180, height: 28, borderRadius: 20 }} />
            <div className="skeleton" style={{ width: 80, height: 32, borderRadius: 8 }} />
          </div>
        </header>

        <div className={styles.mainThreePanelFrame}>
          <aside className={styles.leftSidebar} style={{ padding: "1.25rem" }}>
            <div className="skeleton" style={{ width: 160, height: 20, marginBottom: 12, borderRadius: 4 }} />
            <div className="skeleton" style={{ width: "100%", height: 6, borderRadius: 3, marginBottom: 20 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "0.75rem", background: "#ffffff", borderRadius: 12, border: "1px solid var(--border-light)" }}>
                  <div className="skeleton" style={{ width: 28, height: 28, borderRadius: 14, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div className="skeleton" style={{ width: "75%", height: 14, marginBottom: 6, borderRadius: 4 }} />
                    <div className="skeleton" style={{ width: "45%", height: 10, borderRadius: 4 }} />
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <main className={styles.centerWorkspace} style={{ maxWidth: 960 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              {["Video Lesson", "Resources & PDFs", "Personal Notes", "Knowledge Check"].map((label, idx) => (
                <div key={label} className="skeleton" style={{ width: idx === 0 ? 130 : 140, height: 38, borderRadius: 20, opacity: idx === 0 ? 1 : 0.6 }} />
              ))}
            </div>
            <div className="skeleton" style={{ width: "100%", aspectRatio: "16 / 9", borderRadius: 16, marginBottom: 24 }} />
            <div style={{ background: "#ffffff", padding: "1.5rem", borderRadius: 16, border: "1px solid var(--border-light)" }}>
              <div className="skeleton" style={{ width: 120, height: 12, borderRadius: 4, marginBottom: 10 }} />
              <div className="skeleton" style={{ width: "60%", height: 28, borderRadius: 6, marginBottom: 12 }} />
              <div className="skeleton" style={{ width: "90%", height: 14, borderRadius: 4, marginBottom: 8 }} />
              <div className="skeleton" style={{ width: "70%", height: 14, borderRadius: 4 }} />
            </div>
          </main>

          <aside className={styles.rightSidebar} style={{ padding: "1.25rem" }}>
            <div style={{ background: "#ffffff", padding: "1rem", borderRadius: 14, border: "1px solid var(--border-light)", marginBottom: 16 }}>
              <div className="skeleton" style={{ width: 100, height: 14, marginBottom: 10, borderRadius: 4 }} />
              <div className="skeleton" style={{ width: 60, height: 32, marginBottom: 8, borderRadius: 6 }} />
              <div className="skeleton" style={{ width: "100%", height: 8, borderRadius: 4 }} />
            </div>
            <div style={{ background: "#ffffff", padding: "1rem", borderRadius: 14, border: "1px solid var(--border-light)", marginBottom: 16 }}>
              <div className="skeleton" style={{ width: 120, height: 14, marginBottom: 12, borderRadius: 4 }} />
              {[1, 2, 3, 4].map((j) => (
                <div key={j} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div className="skeleton" style={{ width: 18, height: 18, borderRadius: 9, flexShrink: 0 }} />
                  <div className="skeleton" style={{ width: "65%", height: 12, borderRadius: 4 }} />
                </div>
              ))}
            </div>
          </aside>
        </div>

        <footer className={styles.stickyBottomBar}>
          <div className="skeleton" style={{ width: 140, height: 36, borderRadius: 8 }} />
          <div className="skeleton" style={{ width: 180, height: 42, borderRadius: 10 }} />
        </footer>
      </div>
    );
  }

  // Load Error State
  if (loadError || !step) {
    return (
      <div className={styles.workspaceLayout}>
        <div className={styles.lockCard}>
          <div className={styles.lockIconWrap}>⚠️</div>
          <h2 className={styles.lockTitle}>Unable to load step</h2>
          <p className={styles.lockMessage}>{loadError || "Step not found."}</p>
          <Link
            href={step?.programId ? `/programs/${step.programId}/steps` : "/"}
            className={styles.primaryContinueBtn}
            style={{ textDecoration: "none" }}
          >
            Return to Learning Path
          </Link>
        </div>
      </div>
    );
  }

  // Authoritative Progression Item
  const currentStepProg: StepProgressionItem | undefined = progression?.steps?.find(
    (s) => s.stepId === stepId
  );

  const isEnrolmentInactive = progression && progression.enrolmentStatus !== "ACTIVE";
  const isStepLocked = currentStepProg ? !currentStepProg.isUnlocked : false;

  // Access Gates
  if (isEnrolmentInactive) {
    const status = progression?.enrolmentStatus;
    let heading = "Access Restricted";
    let message = "Your enrolment status does not allow access to course content.";
    let actionElement = (
      <Link href="/" className={styles.primaryContinueBtn}>
        Return to Dashboard
      </Link>
    );

    if (status === "PENDING_AGREEMENT") {
      heading = "Program Agreement Required";
      message = "You must read and sign the Program Agreement before accessing any step content.";
      actionElement = (
        <Link href="/agreement" className={styles.primaryContinueBtn}>
          Sign Agreement Now &rarr;
        </Link>
      );
    } else if (status === "PENDING_PAYMENT") {
      heading = "Payment Confirmation Pending";
      message = "Your course enrolment is pending payment confirmation. Access will unlock once payment clears.";
    }

    return (
      <div className={styles.workspaceLayout}>
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
      <div className={styles.workspaceLayout}>
        <div className={styles.lockCard}>
          <div className={styles.lockIconWrap}>🔒</div>
          <span className={styles.lockBadge}>{currentStepProg?.lockReason || "STEP LOCKED"}</span>
          <h2 className={styles.lockTitle}>Step {step.sequence}: {step.title} is Locked</h2>
          <p className={styles.lockMessage}>{getLockMessage(currentStepProg?.lockReason)}</p>

          <div className={styles.lockDetailBox}>
            <strong>Prerequisite Status:</strong>{" "}
            {currentStepProg?.lockReason === "AGREEMENT_REQUIRED"
              ? "Program agreement signature is required before accessing Step 1 content"
              : currentStepProg?.lockReason === "PREVIOUS_STEP_INCOMPLETE"
              ? "Previous step is incomplete"
              : currentStepProg?.lockReason === "QUIZ_NOT_PASSED"
              ? "Previous step quiz not yet passed"
              : "Step protected by server progression"}
          </div>

          {currentStepProg?.lockReason === "AGREEMENT_REQUIRED" ? (
            <Link
              href={`/agreement?programId=${step.programId}&enrolmentId=${progression?.enrolmentId || ""}`}
              className={styles.primaryContinueBtn}
            >
              Sign Program Agreement &rarr;
            </Link>
          ) : (
            <Link href={`/programs/${step.programId}/steps`} className={styles.primaryContinueBtn}>
              ← Return to Learning Path
            </Link>
          )}
        </div>
      </div>
    );
  }

  // Unlocked Step Content
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
  const isVideoDone = currentMedia ? (lessonProgress[currentMedia.id]?.isCompleted || lessonProgress[currentMedia.id]?.viewed) : true;
  const isDocsDone = documents.length === 0 || documents.every((d: any) => lessonProgress[d.id]?.isCompleted);

  const stepTotalItems = allStepLessons.length + (quiz ? 1 : 0);
  const stepCompletedItems = completedLessonsCount + (quiz && isQuizPassed ? 1 : 0);
  const isStepCompleted = currentStepProg?.isCompleted || (stepTotalItems > 0 && stepCompletedItems === stepTotalItems);
  const calculatedStepPercent = stepTotalItems > 0
    ? (isStepCompleted ? 100 : Math.floor((stepCompletedItems / stepTotalItems) * 100))
    : 100;

  // Next Step Resolution
  const allSteps = progression?.steps || [];
  const currentStepIdx = allSteps.findIndex((s) => s.stepId === stepId);
  const nextStep = currentStepIdx >= 0 && currentStepIdx < allSteps.length - 1 ? allSteps[currentStepIdx + 1] : null;
  const prevStep = currentStepIdx > 0 ? allSteps[currentStepIdx - 1] : null;

  // Question navigation for Quiz
  const currentQuestion = questions[currentQuestionIdx];
  const answeredCount = Object.keys(answers).length;
  const allAnswered = questions.length > 0 && answeredCount === questions.length;

  return (
    <div className={styles.workspaceLayout}>
      {/* ===================================================================
          1. Top Navigation Bar (Breadcrumb & Focus Toggles)
          =================================================================== */}
      <header className={styles.topNav}>
        <div className={styles.topNavLeft}>
          <Link href={`/programs/${step.programId}/steps`} className={styles.backLink}>
            <span>←</span>
            <span>Course Path</span>
          </Link>
          <div className={styles.breadcrumbGroup}>
            <span className={styles.breadcrumbCourse}>{progression?.programTitle || "Program"}</span>
            <span className={styles.breadcrumbDivider}>/</span>
            <span className={styles.breadcrumbCurrent}>
              Step {step.sequence}: {step.title}
            </span>
          </div>
        </div>

        <div className={styles.topNavRight}>
          <div className={styles.progressMeterWrap}>
            <span className={styles.progressMeterLabel}>Course Progress</span>
            <div className={styles.progressMeterTrack}>
              <div
                className={styles.progressMeterFill}
                style={{ width: `${progression?.overallProgressPercent || 0}%` }}
              />
            </div>
            <span className={styles.progressMeterPercent}>{progression?.overallProgressPercent || 0}%</span>
          </div>

          <div className={styles.navTools}>
            <button
              type="button"
              className={`${styles.toolBtn} ${showOutline ? styles.toolBtnActive : ""}`}
              onClick={() => setShowOutline(!showOutline)}
              title="Toggle Course Outline"
            >
              <span>📑 Outline</span>
            </button>
            <button
              type="button"
              className={`${styles.toolBtn} ${showContext ? styles.toolBtnActive : ""}`}
              onClick={() => setShowContext(!showContext)}
              title="Toggle Context Panel"
            >
              <span>ℹ Context</span>
            </button>
          </div>
        </div>
      </header>

      {/* ===================================================================
          2. Three-Panel Layout Workspace
          =================================================================== */}
      <div className={styles.mainThreePanelFrame}>
        {/* =================================================================
            Left Panel: Course Outline
            ================================================================= */}
        <aside className={`${styles.leftSidebar} ${!showOutline ? styles.leftSidebarCollapsed : ""}`}>
          <div className={styles.sidebarHeader}>
            <h3 className={styles.sidebarTitle}>
              <span>Course Outline</span>
              <span className={styles.sidebarCount}>{allSteps.length} Steps</span>
            </h3>
          </div>

          <div className={styles.stepNavList}>
            {allSteps.map((s, idx) => {
              const isCurrent = s.stepId === stepId;
              const isUnlocked = s.isUnlocked;
              const isDone = s.isCompleted;

              return (
                <div key={s.stepId}>
                  {isUnlocked ? (
                    <Link
                      href={`/steps/${s.stepId}`}
                      className={`${styles.stepNavItem} ${isCurrent ? styles.stepNavItemActive : ""}`}
                      onMouseEnter={() => prefetchUrl(`${API_URL}/programs/steps/${s.stepId}`)}
                    >
                      <div
                        className={`${styles.stepSeqCircle} ${
                          isDone ? styles.stepSeqCompleted : isCurrent ? styles.stepSeqCurrent : ""
                        }`}
                      >
                        {isDone ? "✓" : s.sequence}
                      </div>
                      <span className={styles.stepNavText}>{s.title}</span>
                      {isCurrent && <span className={styles.stepNavBadge}>Active</span>}
                    </Link>
                  ) : (
                    <div className={`${styles.stepNavItem} ${styles.stepNavItemLocked}`}>
                      <div className={styles.stepSeqCircle}>🔒</div>
                      <span className={styles.stepNavText}>{s.title}</span>
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        </aside>

        {/* =================================================================
            Center Workspace: The Focused Activity
            ================================================================= */}
        <main className={styles.centerWorkspace}>
          {/* Step Header */}
          <div className={styles.workspaceHero}>
            <span className={styles.stepEyebrow}>STEP {step.sequence} OF {allSteps.length || 1}</span>
            <h1 className={styles.stepMainTitle}>{step.title}</h1>
            <p className={styles.stepDescriptionText}>{step.description || "Follow the guided learning flow below to master this topic."}</p>
          </div>

          {/* ===============================================================
              Guided Journey Stepper Tabs
              =============================================================== */}
          <nav className={styles.journeyNav} aria-label="Step Journey">
            {mediaLessons.length > 0 && (
              <button
                type="button"
                className={`${styles.journeyTab} ${activeTab === "video" ? styles.journeyTabActive : ""}`}
                onClick={() => switchTab("video")}
              >
                <span className={styles.tabIcon}>🎬</span>
                <span>Video Lesson</span>
                {isVideoDone && <span className={styles.tabStatusCheck}>✓</span>}
              </button>
            )}

            <button
              type="button"
              className={`${styles.journeyTab} ${activeTab === "resources" ? styles.journeyTabActive : ""}`}
              onClick={() => switchTab("resources")}
            >
              <span className={styles.tabIcon}>📄</span>
              <span>Resources ({documents.length + textLessons.length})</span>
              {isDocsDone && <span className={styles.tabStatusCheck}>✓</span>}
            </button>

            <button
              type="button"
              className={`${styles.journeyTab} ${activeTab === "notes" ? styles.journeyTabActive : ""}`}
              onClick={() => switchTab("notes")}
            >
              <span className={styles.tabIcon}>📝</span>
              <span>My Notes</span>
              {personalNotes.length > 10 && <span className={styles.tabStatusCheck}>•</span>}
            </button>

            {quiz && (
              <button
                type="button"
                className={`${styles.journeyTab} ${activeTab === "quiz" ? styles.journeyTabActive : ""}`}
                onClick={() => switchTab("quiz")}
              >
                <span className={styles.tabIcon}>🧠</span>
                <span>Knowledge Check</span>
                {isQuizPassed && <span className={styles.tabStatusCheck}>✓</span>}
              </button>
            )}

            {isStepCompleted && (
              <button
                type="button"
                className={`${styles.journeyTab} ${activeTab === "completion" ? styles.journeyTabActive : ""}`}
                onClick={() => switchTab("completion")}
              >
                <span className={styles.tabIcon}>🎉</span>
                <span>Step Mastered</span>
              </button>
            )}
          </nav>

          {/* ===============================================================
              STAGE 1: Video Activity
              =============================================================== */}
          {activeTab === "video" && (
            <div className={styles.stageContainer}>
              {mediaLessons.length > 1 && (
                <div className={styles.multiMediaSelector}>
                  {mediaLessons.map((m: any, idx: number) => {
                    const isSelected = (currentMedia?.id === m.id);
                    const isViewed = lessonProgress[m.id]?.isCompleted || lessonProgress[m.id]?.viewed;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setSelectedMediaId(m.id)}
                        className={`${styles.mediaSelectPill} ${isSelected ? styles.mediaSelectPillActive : ""}`}
                      >
                        <span>Lesson {idx + 1}: {m.title}</span>
                        {isViewed && <span style={{ color: "#16a34a" }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              {currentMedia ? (
                <>
                  <div className={styles.videoCinemaBox}>
                    {(() => {
                      const isUpload = currentMedia.mediaUrl?.startsWith("upload:");
                      let videoSrc = currentMedia.mediaUrl;
                      if (isUpload) {
                        const publicId = currentMedia.mediaUrl.replace("upload:", "");
                        const streamingKey = publicId.includes(".") ? publicId : `${publicId}.mp4`;
                        videoSrc = `${API_URL}/media/stream/${streamingKey}`;
                      }

                      return (
                        <>
                          <video
                            ref={videoRef}
                            key={currentMedia.id}
                            controls
                            controlsList="nodownload"
                            className={styles.videoElement}
                            onLoadedMetadata={(e) => {
                              if (playbackSpeed !== 1) {
                                e.currentTarget.playbackRate = playbackSpeed;
                              }
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
                            src={videoSrc}
                          >
                            Your browser does not support the video tag.
                          </video>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src="/brand/logo-dark.png"
                            alt="WhatBoutMe"
                            className={styles.brandLogoWatermark}
                          />
                          <div className={styles.videoWatermark}>
                            {userEmail}
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {resumedFrom && resumedFrom.lessonId === currentMedia.id && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", background: "#fef3c7", borderRadius: 10, fontSize: "0.85rem", color: "#92400e" }}>
                      <span>Resumed at <strong>{Math.floor(resumedFrom.timeSec / 60)}:{(resumedFrom.timeSec % 60).toString().padStart(2, "0")}</strong></span>
                      <button
                        type="button"
                        onClick={() => {
                          if (videoRef.current) videoRef.current.currentTime = 0;
                          setResumedFrom(null);
                        }}
                        style={{ background: "none", border: "none", color: "#b45309", fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}
                      >
                        Start over
                      </button>
                    </div>
                  )}

                  <div className={styles.videoControlsBar}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span className={styles.videoLessonTitle}>{currentMedia.title}</span>
                      <span className={styles.videoProgressChip}>
                        {isVideoDone
                          ? "✓ Watched"
                          : `${Math.round(lessonProgress[currentMedia.id]?.progressPercent || 0)}%`}
                      </span>
                    </div>

                    <div className={styles.videoPlayerTools}>
                      <button
                        type="button"
                        className={styles.playerToolBtn}
                        onClick={changePlaybackSpeed}
                        title="Cycle playback speed"
                      >
                        <span>⚡</span>
                        <span>{playbackSpeed}x</span>
                      </button>

                      {typeof document !== "undefined" && "pictureInPictureEnabled" in document && (
                        <button
                          type="button"
                          className={styles.playerToolBtn}
                          onClick={() => {
                            if (videoRef.current) {
                              if (document.pictureInPictureElement) {
                                document.exitPictureInPicture().catch(() => {});
                              } else {
                                videoRef.current.requestPictureInPicture().catch(() => {});
                              }
                            }
                          }}
                          title="Toggle Picture-in-Picture window"
                        >
                          <span>📺</span>
                          <span>PiP</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Guided CTA to next section */}
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
                    <button
                      type="button"
                      className={styles.primaryContinueBtn}
                      onClick={() => switchTab("resources")}
                    >
                      <span>Continue to Resources &amp; Reading</span>
                      <span>&rarr;</span>
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: "center", padding: "60px 20px", background: "#ffffff", borderRadius: 20 }}>
                  <p>No video lecture uploaded for this step.</p>
                  <button type="button" className={styles.primaryContinueBtn} onClick={() => switchTab("resources")}>
                    View Resources &rarr;
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ===============================================================
              STAGE 2: Resources & Reading
              =============================================================== */}
          {activeTab === "resources" && (
            <div className={styles.stageContainer}>
              <div className={styles.resourcesGrid}>
                {documents.map((doc: any) => {
                  const isDone = lessonProgress[doc.id]?.isCompleted;
                  return (
                    <div key={doc.id} className={styles.resourceDocCard}>
                      <div className={styles.docCardHeader}>
                        <div className={styles.docBadgeIcon}>📄</div>
                        <div className={styles.docInfo}>
                          <h4 className={styles.docTitle}>{doc.title}</h4>
                          <span className={styles.docMeta}>PDF Document · Reference Material</span>
                        </div>
                      </div>

                      <div className={styles.docCardFooter}>
                        <a
                          href={doc.mediaUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => handleCompleteDocument(doc.id)}
                          className={styles.docOpenLink}
                        >
                          <span>Open PDF</span>
                          <span>↗</span>
                        </a>

                        {isDone ? (
                          <span className={styles.docCompletedBadge}>✓ Read</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleCompleteDocument(doc.id)}
                            className={styles.markReadBtn}
                          >
                            Mark Read
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {textLessons.map((txt: any) => {
                  const isDone = lessonProgress[txt.id]?.isCompleted || lessonProgress[txt.id]?.viewed;
                  return (
                    <div key={txt.id} className={styles.resourceDocCard}>
                      <div className={styles.docCardHeader}>
                        <div className={styles.docBadgeIcon}>📖</div>
                        <div className={styles.docInfo}>
                          <h4 className={styles.docTitle}>{txt.title}</h4>
                          <span className={styles.docMeta}>Reading Guide · Self-Paced</span>
                        </div>
                      </div>

                      {txt.content && (
                        <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", margin: 0, lineClamp: 3 }}>
                          {txt.content}
                        </p>
                      )}

                      <div className={styles.docCardFooter}>
                        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Article</span>
                        {isDone ? (
                          <span className={styles.docCompletedBadge}>✓ Completed</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleCompleteDocument(txt.id)}
                            className={styles.markReadBtn}
                          >
                            Mark Read
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {documents.length === 0 && textLessons.length === 0 && (
                  <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px", background: "#ffffff", borderRadius: 20 }}>
                    <p style={{ color: "var(--text-secondary)" }}>No supplementary documents for this step.</p>
                  </div>
                )}
              </div>

              {/* Guided CTA to next section */}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem" }}>
                <button type="button" className={styles.prevBtn} onClick={() => switchTab("video")}>
                  &larr; Back to Video
                </button>
                <button type="button" className={styles.primaryContinueBtn} onClick={() => switchTab("notes")}>
                  Continue to Personal Notes &rarr;
                </button>
              </div>
            </div>
          )}

          {/* ===============================================================
              STAGE 3: Notes Experience
              =============================================================== */}
          {activeTab === "notes" && (
            <div className={styles.stageContainer}>
              <div className={styles.notesCard}>
                <div className={styles.notesToolbar}>
                  <div className={styles.notesToolsLeft}>
                    <button type="button" className={styles.timestampBtn} onClick={insertTimestamp}>
                      <span>⏱ Insert Timestamp</span>
                    </button>
                    <span className={styles.notesStatusText}>{notesSaveStatus}</span>
                  </div>

                  <button type="button" className={styles.exportNotesBtn} onClick={exportNotes}>
                    <span>Export Notes (.txt)</span>
                  </button>
                </div>

                <textarea
                  className={styles.notesTextarea}
                  placeholder="Capture key insights, reflections, questions, or action items from this step..."
                  value={personalNotes}
                  onChange={(e) => handleNotesChange(e.target.value)}
                />

                <div className={styles.notesFooter}>
                  <span>{personalNotes.trim().split(/\s+/).filter(Boolean).length} words</span>
                  <span>Auto-saved to your browser storage</span>
                </div>
              </div>

              {/* Guided CTA to next section */}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem" }}>
                <button type="button" className={styles.prevBtn} onClick={() => switchTab("resources")}>
                  &larr; Back to Resources
                </button>
                <button
                  type="button"
                  className={styles.primaryContinueBtn}
                  onClick={() => switchTab(quiz ? "quiz" : "completion")}
                >
                  {quiz ? "Continue to Knowledge Check →" : "Proceed to Step Completion →"}
                </button>
              </div>
            </div>
          )}

          {/* ===============================================================
              STAGE 4: Knowledge Check (Quiz Engine)
              =============================================================== */}
          {activeTab === "quiz" && quiz && (
            <div className={styles.stageContainer}>
              <div className={styles.quizWorkspaceCard}>
                {/* 1. INITIAL QUIZ SCREEN (NOT STARTED YET) */}
                {!activeAttempt && !lastResult && (
                  <div className={styles.quizIntroBox}>
                    <div className={styles.quizHeroIcon}>🧠</div>
                    <div>
                      <h2 style={{ fontFamily: "var(--font-serif, serif)", fontSize: "1.75rem", margin: "0 0 0.5rem" }}>
                        Knowledge Check
                      </h2>
                      <p style={{ color: "var(--text-secondary)", margin: 0 }}>
                        Confirm your understanding before unlocking the next step.
                      </p>
                    </div>

                    <div className={styles.quizMetaPills}>
                      <span className={styles.metaPill}>
                        Pass mark: <span className={styles.metaPillStrong}>{quiz.passMark}%</span>
                      </span>
                      <span className={styles.metaPill}>
                        Questions: <span className={styles.metaPillStrong}>{quiz.questionCount ?? 10}</span>
                      </span>
                      <span className={styles.metaPill}>
                        Max Attempts: <span className={styles.metaPillStrong}>{quiz.maxAttempts ?? 3}</span>
                      </span>
                    </div>

                    {quizError && (
                      <div style={{ background: "#fee2e2", color: "#991b1b", padding: "10px 16px", borderRadius: 10, fontSize: "0.85rem" }}>
                        {quizError}
                      </div>
                    )}

                    <button
                      type="button"
                      className={styles.primaryContinueBtn}
                      onClick={handleStartQuiz}
                      disabled={isStartingQuiz}
                      style={{ padding: "0.75rem 2rem", fontSize: "1rem" }}
                    >
                      {isStartingQuiz ? "Starting Quiz..." : "Begin Knowledge Check →"}
                    </button>
                  </div>
                )}

                {/* 2. ACTIVE QUIZ ATTEMPT (IN PROGRESS) */}
                {activeAttempt && questions.length > 0 && (
                  <div>
                    {/* Top Question Navigator Pills */}
                    <div className={styles.questionNavigatorRow}>
                      {questions.map((q, idx) => {
                        const isAnswered = Boolean(answers[q.id]);
                        const isCurrent = idx === currentQuestionIdx;
                        return (
                          <button
                            key={q.id}
                            type="button"
                            className={`${styles.qNavPill} ${isCurrent ? styles.qNavPillActive : isAnswered ? styles.qNavPillAnswered : ""}`}
                            onClick={() => setCurrentQuestionIdx(idx)}
                          >
                            {idx + 1}
                          </button>
                        );
                      })}
                    </div>

                    {/* Focused Question Card */}
                    {currentQuestion && (
                      <div className={styles.activeQuestionCard}>
                        <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--accent-primary)", marginBottom: "0.5rem" }}>
                          QUESTION {currentQuestionIdx + 1} OF {questions.length}
                        </div>
                        <h3 className={styles.questionPrompt}>{currentQuestion.text}</h3>

                        <div className={styles.optionsList}>
                          {currentQuestion.options?.map((opt) => {
                            const isSelected = answers[currentQuestion.id] === opt.id;
                            return (
                              <label
                                key={opt.id}
                                className={`${styles.optionCard} ${isSelected ? styles.optionCardSelected : ""}`}
                              >
                                <input
                                  type="radio"
                                  name={`q_${currentQuestion.id}`}
                                  value={opt.id}
                                  checked={isSelected}
                                  onChange={() => handleOptionChange(currentQuestion.id, opt.id)}
                                  style={{ display: "none" }}
                                />
                                <div className={styles.optionRadioCircle}>
                                  {isSelected && <div className={styles.optionRadioDot} />}
                                </div>
                                <span>{opt.text}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Quiz Navigation & Submit */}
                    <div className={styles.quizNavActions}>
                      <button
                        type="button"
                        className={styles.prevBtn}
                        onClick={() => setCurrentQuestionIdx(Math.max(0, currentQuestionIdx - 1))}
                        disabled={currentQuestionIdx === 0}
                      >
                        &larr; Previous Question
                      </button>

                      {currentQuestionIdx < questions.length - 1 ? (
                        <button
                          type="button"
                          className={styles.primaryContinueBtn}
                          onClick={() => setCurrentQuestionIdx(currentQuestionIdx + 1)}
                        >
                          Next Question &rarr;
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={styles.primaryContinueBtn}
                          onClick={handleQuizSubmit}
                          disabled={!allAnswered || isSubmittingQuiz}
                        >
                          {isSubmittingQuiz
                            ? "Submitting to Server..."
                            : !allAnswered
                            ? `Answer all questions (${answeredCount}/${questions.length})`
                            : "Submit & Complete Quiz ✓"}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* 3. SUBMITTED RESULTS / REVIEW */}
                {lastResult && (
                  <div>
                    {lastResult.passed ? (
                      <div style={{ textAlign: "center", padding: "2rem" }}>
                        <div style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>🎉</div>
                        <h3 style={{ fontFamily: "var(--font-serif, serif)", fontSize: "1.8rem", color: "#15803d", margin: "0 0 0.5rem" }}>
                          Knowledge Check Passed!
                        </h3>
                        <p style={{ fontSize: "1.1rem", margin: "0 0 1rem" }}>
                          Your Score: <strong>{lastResult.score}%</strong> (Pass mark: {lastResult.passMark}%)
                        </p>
                        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
                          {lastResult.correctCount} of {lastResult.totalQuestions} questions answered correctly.
                        </p>
                        <button
                          type="button"
                          className={styles.primaryContinueBtn}
                          onClick={() => switchTab("completion")}
                          style={{ padding: "0.75rem 2rem", fontSize: "1rem" }}
                        >
                          Proceed to Step Completion →
                        </button>
                      </div>
                    ) : (
                      <div style={{ textAlign: "center", padding: "2rem" }}>
                        <div style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>💪</div>
                        <h3 style={{ fontFamily: "var(--font-serif, serif)", fontSize: "1.75rem", color: "#b91c1c", margin: "0 0 0.5rem" }}>
                          Keep Learning &amp; Try Again
                        </h3>
                        <p style={{ fontSize: "1.05rem", margin: "0 0 0.5rem" }}>
                          Your Score: <strong>{lastResult.score}%</strong> (Required: {lastResult.passMark}%)
                        </p>
                        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
                          Attempts remaining: {lastResult.attemptsRemaining ?? 0}
                        </p>

                        {lastResult.isCooldownActive && (
                          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", padding: "12px", borderRadius: 12, marginBottom: "1.5rem" }}>
                            Cooldown active until {lastResult.cooldownUntil ? new Date(lastResult.cooldownUntil).toLocaleTimeString() : "cooldown period ends"}.
                          </div>
                        )}

                        {lastResult.canRetry && !lastResult.isCooldownActive && (
                          <button
                            type="button"
                            className={styles.primaryContinueBtn}
                            onClick={handleStartQuiz}
                            disabled={isStartingQuiz}
                          >
                            {isStartingQuiz ? "Starting..." : "Retry Knowledge Check →"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===============================================================
              STAGE 5: Step Completion Celebration
              =============================================================== */}
          {activeTab === "completion" && (
            <div className={styles.stageContainer}>
              <div className={styles.completionWorkspace}>
                <div className={styles.trophyBadge}>🏆</div>
                <h2 className={styles.completionTitle}>Step {step.sequence} Mastered!</h2>
                <p className={styles.completionSubtitle}>
                  You have successfully satisfied all milestones for <strong>{step.title}</strong>.
                  Your progress is verified and recorded on the server.
                </p>

                <div className={styles.milestonesList}>
                  <div className={styles.milestoneRow}>
                    <span className={styles.milestoneCheck}>✓</span>
                    <span>Video Lecture Completed</span>
                  </div>
                  <div className={styles.milestoneRow}>
                    <span className={styles.milestoneCheck}>✓</span>
                    <span>Reference Material &amp; PDFs Read</span>
                  </div>
                  <div className={styles.milestoneRow}>
                    <span className={styles.milestoneCheck}>✓</span>
                    <span>Personal Notes Captured</span>
                  </div>
                  {quiz && (
                    <div className={styles.milestoneRow}>
                      <span className={styles.milestoneCheck}>✓</span>
                      <span>Knowledge Check Passed ({lastResult?.score || quiz.passMark}%)</span>
                    </div>
                  )}
                </div>

                {nextStep ? (
                  <Link
                    href={`/steps/${nextStep.stepId}`}
                    className={styles.primaryContinueBtn}
                    style={{ padding: "0.85rem 2.25rem", fontSize: "1.05rem", display: "inline-flex" }}
                  >
                    <span>Begin Next Step: {nextStep.title}</span>
                    <span>&rarr;</span>
                  </Link>
                ) : (
                  <Link
                    href={`/programs/${step.programId}/steps`}
                    className={styles.primaryContinueBtn}
                    style={{ padding: "0.85rem 2.25rem", fontSize: "1.05rem", display: "inline-flex" }}
                  >
                    <span>Return to Full Learning Roadmap</span>
                    <span>&rarr;</span>
                  </Link>
                )}
              </div>
            </div>
          )}
        </main>

        {/* =================================================================
            Right Panel: Context & Quick Actions
            ================================================================= */}
        <aside className={`${styles.rightSidebar} ${!showContext ? styles.rightSidebarCollapsed : ""}`}>
          {/* Step Progress Gauge */}
          <div className={styles.contextCard}>
            <h4 className={styles.contextCardTitle}>Step Progress</h4>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "6px" }}>
              <span style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text-primary)" }}>
                {calculatedStepPercent}%
              </span>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                {stepCompletedItems} / {stepTotalItems} Tasks
              </span>
            </div>
            <div style={{ width: "100%", height: 6, background: "var(--bg-soft)", borderRadius: 3, overflow: "hidden" }}>
              <div
                style={{
                  width: `${calculatedStepPercent}%`,
                  height: "100%",
                  background: "var(--accent-primary)",
                  borderRadius: 3,
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          </div>

          {/* Checklist */}
          <div className={styles.contextCard}>
            <h4 className={styles.contextCardTitle}>Step Checklist</h4>
            <div className={styles.checklistItems}>
              <div className={`${styles.checkItem} ${isVideoDone ? styles.checkItemDone : ""}`}>
                <span>{isVideoDone ? "✓" : "○"}</span>
                <span>Video Lesson</span>
              </div>
              <div className={`${styles.checkItem} ${isDocsDone ? styles.checkItemDone : ""}`}>
                <span>{isDocsDone ? "✓" : "○"}</span>
                <span>Reading Documents</span>
              </div>
              <div className={`${styles.checkItem} ${personalNotes.length > 10 ? styles.checkItemDone : ""}`}>
                <span>{personalNotes.length > 10 ? "✓" : "○"}</span>
                <span>Personal Notes</span>
              </div>
              {quiz && (
                <div className={`${styles.checkItem} ${isQuizPassed ? styles.checkItemDone : ""}`}>
                  <span>{isQuizPassed ? "✓" : "○"}</span>
                  <span>Knowledge Check</span>
                </div>
              )}
            </div>
          </div>

          {/* Quick Downloads */}
          {documents.length > 0 && (
            <div className={styles.contextCard}>
              <h4 className={styles.contextCardTitle}>Downloads</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {documents.map((d: any) => (
                  <a
                    key={d.id}
                    href={d.mediaUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: "0.8rem", color: "var(--accent-primary)", textDecoration: "none", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}
                  >
                    <span>📄</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Next Up Preview */}
          {nextStep && (
            <div className={styles.contextCard}>
              <h4 className={styles.contextCardTitle}>Next Up</h4>
              <p style={{ fontSize: "0.85rem", fontWeight: 700, margin: "0 0 4px" }}>
                Step {nextStep.sequence}: {nextStep.title}
              </p>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                Unlocks upon step completion
              </span>
            </div>
          )}
        </aside>
      </div>

      {/* ===================================================================
          12. Sticky Bottom Navigation Bar
          =================================================================== */}
      <footer className={styles.stickyBottomBar}>
        <div className={styles.bottomNavLeft}>
          {prevStep ? (
            <Link href={`/steps/${prevStep.stepId}`} className={styles.prevBtn}>
              &larr; Previous Step
            </Link>
          ) : (
            <Link href={`/programs/${step.programId}/steps`} className={styles.prevBtn}>
              &larr; Path Overview
            </Link>
          )}
          <span className={styles.saveIndicator}>✓ Progress auto-saved to server</span>
        </div>

        <div className={styles.bottomNavRight}>
          {activeTab === "video" && (
            <button type="button" className={styles.primaryContinueBtn} onClick={() => switchTab("resources")}>
              <span>Continue: Resources</span>
              <span>&rarr;</span>
            </button>
          )}

          {activeTab === "resources" && (
            <button type="button" className={styles.primaryContinueBtn} onClick={() => switchTab("notes")}>
              <span>Continue: Notes</span>
              <span>&rarr;</span>
            </button>
          )}

          {activeTab === "notes" && (
            <button
              type="button"
              className={styles.primaryContinueBtn}
              onClick={() => switchTab(quiz ? "quiz" : "completion")}
            >
              <span>{quiz ? "Continue: Knowledge Check" : "Complete Step"}</span>
              <span>&rarr;</span>
            </button>
          )}

          {activeTab === "quiz" && isQuizPassed && (
            <button type="button" className={styles.primaryContinueBtn} onClick={() => switchTab("completion")}>
              <span>Step Summary</span>
              <span>&rarr;</span>
            </button>
          )}

          {activeTab === "completion" && nextStep && (
            <Link href={`/steps/${nextStep.stepId}`} className={styles.primaryContinueBtn}>
              <span>Next Step: {nextStep.title}</span>
              <span>&rarr;</span>
            </Link>
          )}
        </div>
      </footer>
    </div>
  );
}
