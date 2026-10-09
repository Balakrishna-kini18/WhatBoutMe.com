"use client";

import { useEffect, useState, use, useCallback, useRef } from "react";
import styles from "./step.module.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  API_URL,
  getAuthHeaders,
  getLockMessage,
  EnrolmentProgressionResponse,
  StepProgressionItem,
  ActiveQuizAttempt,
  QuizSubmissionResult,
  QuizQuestion,
} from "../../lib/api";
import { fetchWithCache, prefetchUrl, getCachedData } from "../../lib/cache";

export type LearningActivity = "video" | "reading" | "notes" | "quiz" | "completion";

export default function StepPage({ params }: { params: Promise<{ stepId: string }> }) {
  const router = useRouter();
  const unwrappedParams = use(params);
  const stepId = unwrappedParams.stepId;

  // 1. Instant SWR Cache Read (0ms render if prefetched or cached)
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

  // 2. Focused Activity State (One Screen = One Task)
  const [activeActivity, setActiveActivity] = useState<LearningActivity>(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem(`wbm_act_${stepId}`);
      if (saved && ["video", "reading", "notes", "quiz", "completion"].includes(saved)) {
        return saved as LearningActivity;
      }
    }
    return "video";
  });

  const switchActivity = (act: LearningActivity) => {
    setActiveActivity(act);
    if (typeof window !== "undefined") {
      sessionStorage.setItem(`wbm_act_${stepId}`, act);
    }
    // Scroll smoothly to top of active task workspace
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // 3. Course Outline Drawer (Slides in on demand, never crowding the workspace)
  const [showDrawer, setShowDrawer] = useState(false);

  // 4. Video & Media State
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("wbm_playback_speed");
      if (saved) return parseFloat(saved) || 1;
    }
    return 1;
  });
  const [resumedFrom, setResumedFrom] = useState<{ lessonId: string; timeSec: number } | null>(null);
  const [videoCompletedNotice, setVideoCompletedNotice] = useState(false);
  const lastHeartbeatTimeRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

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

  // 5. Lesson Progress State
  const [lessonProgress, setLessonProgress] = useState<Record<string, any>>({});

  // 6. Personal Reflection Notes (Auto-saved to localStorage)
  const [personalNotes, setPersonalNotes] = useState<string>("");
  const [notesSaveStatus, setNotesSaveStatus] = useState<string>("Saved");

  // Load personal notes on mount
  useEffect(() => {
    if (typeof window !== "undefined" && stepId) {
      const saved = localStorage.getItem(`wbm_notes_${stepId}`);
      if (saved) setPersonalNotes(saved);
    }
  }, [stepId]);

  const handleNotesChange = (text: string) => {
    setPersonalNotes(text);
    setNotesSaveStatus("Saving...");
    if (typeof window !== "undefined" && stepId) {
      localStorage.setItem(`wbm_notes_${stepId}`, text);
      setTimeout(() => {
        setNotesSaveStatus("Saved to browser");
      }, 400);
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
    const blob = new Blob([`Notes for Step ${step?.sequence || 1}: ${step?.title || ""}\n\n${personalNotes}`], {
      type: "text/plain",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `WhatBoutMe_Step_${step?.sequence || 1}_Notes.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 7. Quiz Engine State (One Question at a Time)
  const [activeAttempt, setActiveAttempt] = useState<ActiveQuizAttempt | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [lastResult, setLastResult] = useState<QuizSubmissionResult | null>(null);
  const [isStartingQuiz, setIsStartingQuiz] = useState(false);
  const [isSubmittingQuiz, setIsSubmittingQuiz] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);

  // 8. Watermark Email
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

  // 9. Keyboard Navigation: Esc or 'O' toggles Outline Drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (["TEXTAREA", "INPUT"].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key === "Escape") setShowDrawer(false);
      if (e.key === "o" || e.key === "O") setShowDrawer((prev) => !prev);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // 10. Data Fetching & SWR Hydration
  const fetchStepAndProgression = useCallback(async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      router.push("/login");
      return;
    }

    try {
      setLoadError(null);
      // Step metadata
      const stepData = await fetchWithCache<any>(
        `${API_URL}/programs/steps/${stepId}`,
        {},
        3 * 60 * 1000,
        (freshStep) => {
          setStep(freshStep);
        }
      );
      setStep(stepData);

      // Progression metadata
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

      // Initialize lesson progress
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

      // Automatically determine default activity if none set in session
      const savedAct = typeof window !== "undefined" ? sessionStorage.getItem(`wbm_act_${stepId}`) : null;
      const mediaList = (stepData.lessons || []).filter((l: any) => l.type === "VIDEO" || l.type === "AUDIO");
      const docsList = (stepData.lessons || []).filter((l: any) => l.type === "DOCUMENT" || l.type === "TEXT" || !l.type);

      if (!savedAct) {
        if (mediaList.length > 0) {
          setActiveActivity("video");
        } else if (docsList.length > 0) {
          setActiveActivity("reading");
        } else {
          setActiveActivity("notes");
        }
      }

      // Check quiz attempt if step has quiz
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

      // Predictive Prefetching of next & previous steps
      if (progData?.steps && progData.steps.length > 0) {
        const currIdx = progData.steps.findIndex((s) => s.stepId === stepId);
        if (currIdx >= 0) {
          const next = progData.steps[currIdx + 1];
          if (next?.stepId) {
            router.prefetch(`/steps/${next.stepId}`);
            prefetchUrl(`${API_URL}/programs/steps/${next.stepId}`);
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
            setVideoCompletedNotice(true);
            fetchStepAndProgression();
          }
        }
      } catch (err) {
        console.warn("Heartbeat error:", err);
      }
    },
    [lessonProgress, fetchStepAndProgression]
  );

  // Document Completion
  const handleCompleteDocument = async (lessonId: string) => {
    try {
      const res = await fetch(`${API_URL}/progress/lessons/${lessonId}/complete`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setLessonProgress((prev) => ({ ...prev, [lessonId]: data }));
        fetchStepAndProgression();
      }
    } catch (err) {
      console.warn("Document complete error:", err);
    }
  };

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

  const handleOptionChange = (questionId: string, optionId: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: optionId,
    }));
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

  // Keepalive heartbeat on tab close / hide
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

  // Derived Data
  const allSteps: StepProgressionItem[] = progression?.steps || [];
  const currentStepProg = allSteps.find((s) => s.stepId === stepId);
  const currStepIdx = allSteps.findIndex((s) => s.stepId === stepId);
  const prevStep = currStepIdx > 0 ? allSteps[currStepIdx - 1] : null;
  const nextStep = currStepIdx >= 0 && currStepIdx < allSteps.length - 1 ? allSteps[currStepIdx + 1] : null;

  const lessons = Array.isArray(step?.lessons) ? step.lessons : [];
  const mediaLessons = lessons.filter((l: any) => l.type === "VIDEO" || l.type === "AUDIO");
  const documents = lessons.filter((l: any) => l.type === "DOCUMENT" || (!l.type && l.mediaUrl?.includes(".pdf")));
  const textLessons = lessons.filter((l: any) => l.type === "TEXT");
  const quiz = step?.quiz || null;

  const currentMedia = mediaLessons.find((m: any) => m.id === selectedMediaId) || mediaLessons[0] || null;

  // Task Completion checks
  const isVideoDone = mediaLessons.length === 0 || mediaLessons.every((m: any) => lessonProgress[m.id]?.isCompleted || lessonProgress[m.id]?.viewed);
  const isReadingDone = (documents.length === 0 && textLessons.length === 0) || [...documents, ...textLessons].every((d: any) => lessonProgress[d.id]?.isCompleted || lessonProgress[d.id]?.viewed);
  const isNotesCaptured = personalNotes.trim().length > 15;
  const isQuizPassed = !quiz || Boolean(currentStepProg?.isCompleted) || Boolean(lastResult?.passed);
  const isStepCompleted = Boolean(currentStepProg?.isCompleted) || (isVideoDone && isReadingDone && isQuizPassed);

  // Available Activities Ladder for this Step
  const availableActivities: LearningActivity[] = [];
  if (mediaLessons.length > 0) availableActivities.push("video");
  if (documents.length > 0 || textLessons.length > 0) availableActivities.push("reading");
  availableActivities.push("notes");
  if (quiz) availableActivities.push("quiz");
  availableActivities.push("completion");

  const currentActIdx = availableActivities.indexOf(activeActivity);

  // Navigation Logic for Previous & Continue
  const handleGoPrevious = () => {
    // If inside active quiz attempt and past question 1, go to previous question
    if (activeActivity === "quiz" && activeAttempt && currentQuestionIdx > 0) {
      setCurrentQuestionIdx(currentQuestionIdx - 1);
      return;
    }

    const prevAct = currentActIdx > 0 ? availableActivities[currentActIdx - 1] : undefined;
    if (prevAct) {
      switchActivity(prevAct);
    } else if (prevStep) {
      router.push(`/steps/${prevStep.stepId}`);
    } else if (step?.programId) {
      router.push(`/programs/${step.programId}/steps`);
    }
  };

  const handleGoContinue = () => {
    // When on Video: move to reading or notes
    if (activeActivity === "video") {
      if (documents.length > 0 || textLessons.length > 0) {
        switchActivity("reading");
      } else {
        switchActivity("notes");
      }
      return;
    }

    // When on Reading: automatically mark current docs read if not done, then continue to notes
    if (activeActivity === "reading") {
      documents.forEach((d: any) => {
        if (!lessonProgress[d.id]?.isCompleted) handleCompleteDocument(d.id);
      });
      switchActivity("notes");
      return;
    }

    // When on Notes: continue to quiz or completion
    if (activeActivity === "notes") {
      if (quiz) {
        switchActivity("quiz");
      } else {
        switchActivity("completion");
      }
      return;
    }

    // When on Quiz:
    if (activeActivity === "quiz") {
      if (!activeAttempt && !lastResult) {
        handleStartQuiz();
        return;
      }
      if (activeAttempt && questions.length > 0) {
        if (currentQuestionIdx < questions.length - 1) {
          setCurrentQuestionIdx(currentQuestionIdx + 1);
          return;
        } else {
          handleQuizSubmit();
          return;
        }
      }
      if (lastResult?.passed) {
        switchActivity("completion");
        return;
      }
      if (lastResult && !lastResult.passed && lastResult.canRetry) {
        handleStartQuiz();
        return;
      }
    }

    // When on Completion: continue to next step or path
    if (activeActivity === "completion") {
      if (nextStep) {
        router.push(`/steps/${nextStep.stepId}`);
      } else if (step?.programId) {
        router.push(`/programs/${step.programId}/steps`);
      }
    }
  };

  // Determine button labels
  const getContinueButtonLabel = () => {
    if (activeActivity === "video") {
      return (documents.length > 0 || textLessons.length > 0) ? "Continue to Reading →" : "Continue to Notes →";
    }
    if (activeActivity === "reading") {
      return "Continue to Reflection →";
    }
    if (activeActivity === "notes") {
      return quiz ? "Continue to Knowledge Check →" : "Complete Step →";
    }
    if (activeActivity === "quiz") {
      if (!activeAttempt && !lastResult) return "Begin Knowledge Check →";
      if (activeAttempt) {
        return currentQuestionIdx < questions.length - 1
          ? "Next Question →"
          : isSubmittingQuiz
          ? "Submitting..."
          : "Submit Answers ✓";
      }
      if (lastResult?.passed) return "Proceed to Step Completion →";
      return "Retry Knowledge Check →";
    }
    if (activeActivity === "completion") {
      return nextStep ? `Start Step ${nextStep.sequence} →` : "Return to Course Path →";
    }
    return "Continue →";
  };

  const getPreviousButtonLabel = () => {
    if (activeActivity === "quiz" && activeAttempt && currentQuestionIdx > 0) {
      return "← Previous Question";
    }
    if (currentActIdx > 0) {
      const prevAct = availableActivities[currentActIdx - 1];
      if (prevAct === "video") return "← Back to Video";
      if (prevAct === "reading") return "← Back to Reading";
      if (prevAct === "notes") return "← Back to Notes";
      if (prevAct === "quiz") return "← Back to Quiz";
    }
    if (prevStep) return `← Previous Step (${prevStep.sequence})`;
    return "← Course Overview";
  };

  // Loading skeleton state
  if (loading && !step) {
    return (
      <div className={styles.classroomContainer}>
        <header className={styles.topNav}>
          <div className={styles.topNavLeft}>
            <div className={styles.skeleton} style={{ width: 110, height: 32, borderRadius: 8 }} />
            <div className={styles.skeleton} style={{ width: 180, height: 18, borderRadius: 4 }} />
          </div>
          <div className={styles.topNavRight}>
            <div className={styles.skeleton} style={{ width: 120, height: 28, borderRadius: 20 }} />
            <div className={styles.skeleton} style={{ width: 90, height: 32, borderRadius: 8 }} />
          </div>
        </header>

        <main className={`${styles.taskWorkspace} ${styles.videoScope}`}>
          <div style={{ width: "100%", marginBottom: 20 }}>
            <div className={styles.skeleton} style={{ width: 140, height: 14, marginBottom: 8, borderRadius: 4 }} />
            <div className={styles.skeleton} style={{ width: "60%", height: 32, marginBottom: 8, borderRadius: 6 }} />
            <div className={styles.skeleton} style={{ width: "80%", height: 16, borderRadius: 4 }} />
          </div>

          <div className={styles.skeleton} style={{ width: "100%", aspectRatio: "16 / 9", borderRadius: 14 }} />
        </main>
      </div>
    );
  }

  // Error State
  if (loadError || !step) {
    return (
      <div className={styles.classroomContainer}>
        <div style={{ maxWidth: 500, margin: "6rem auto", textAlign: "center", padding: "2rem", background: "#ffffff", borderRadius: 14, border: "1px solid var(--border-light)" }}>
          <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.6rem", margin: "0 0 0.5rem" }}>Unable to Load Step</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem", fontSize: "0.95rem" }}>
            {loadError || "The learning step requested could not be located."}
          </p>
          <button
            type="button"
            className={styles.continueActionBtn}
            onClick={() => router.push("/courses")}
          >
            Back to My Courses
          </button>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIdx];

  return (
    <div className={styles.classroomContainer}>
      {/* ===================================================================
          1. Clean Top Navigation Bar
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
            <span className={styles.breadcrumbActivity}>
              {activeActivity === "video" && "🎬 Video Lesson"}
              {activeActivity === "reading" && "📄 Reading Material"}
              {activeActivity === "notes" && "📝 Reflection Notes"}
              {activeActivity === "quiz" && "🧠 Knowledge Check"}
              {activeActivity === "completion" && "🎉 Step Mastered"}
            </span>
          </div>
        </div>

        <div className={styles.topNavRight}>
          <div className={styles.courseProgressMeter} title="Overall Course Progress">
            <span className={styles.progressBarTrack}>
              <span
                className={styles.progressBarFill}
                style={{ width: `${progression?.overallProgressPercent || 0}%` }}
              />
            </span>
            <span>{progression?.overallProgressPercent || 0}%</span>
          </div>

          <button
            type="button"
            className={styles.outlineToggleBtn}
            onClick={() => setShowDrawer(true)}
            title="Open Course Syllabus (Press 'O')"
          >
            <span>☰</span>
            <span>Course Outline</span>
          </button>
        </div>
      </header>

      {/* ===================================================================
          2. Focused Single-Task Workspace (One Screen = One Task)
          =================================================================== */}
      <main
        className={`${styles.taskWorkspace} ${
          activeActivity === "video"
            ? styles.videoScope
            : activeActivity === "reading"
            ? styles.readingScope
            : activeActivity === "notes"
            ? styles.notesScope
            : activeActivity === "quiz"
            ? styles.quizScope
            : styles.completionScope
        }`}
      >
        {/* Activity Header */}
        <div className={styles.activityHeader}>
          <div className={styles.moduleEyebrow}>
            <span>STEP {step.sequence} OF {allSteps.length || 1}</span>
            <span>•</span>
            <span>
              {activeActivity === "video" && "Video Lesson"}
              {activeActivity === "reading" && "Reading Material"}
              {activeActivity === "notes" && "Personal Reflection"}
              {activeActivity === "quiz" && "Knowledge Check"}
              {activeActivity === "completion" && "Step Complete"}
            </span>
          </div>

          <h1 className={styles.activityTitle}>
            {activeActivity === "video" && (currentMedia?.title || step.title)}
            {activeActivity === "reading" && "Required Reading & Reference Materials"}
            {activeActivity === "notes" && "Reflection & Personal Takeaways"}
            {activeActivity === "quiz" && "Knowledge Check: " + step.title}
            {activeActivity === "completion" && `Step ${step.sequence} Mastered: ${step.title}`}
          </h1>

          <p className={styles.activitySubtitle}>
            {activeActivity === "video" && (step.description || "Watch this guided lecture attentively.")}
            {activeActivity === "reading" && "Review the supplementary documents and articles to solidify your understanding."}
            {activeActivity === "notes" && "Synthesize what you have learned and record insights for future reference."}
            {activeActivity === "quiz" && "Validate your comprehension before advancing to the next step."}
            {activeActivity === "completion" && "You have successfully completed all requirements for this step."}
          </p>
        </div>

        {/* =================================================================
            TASK 1: VIDEO ACTIVITY (Clean Cinema Mode)
            ================================================================= */}
        {activeActivity === "video" && (
          <div style={{ width: "100%" }}>
            {mediaLessons.length > 1 && (
              <div className={styles.multiVideoSelector}>
                {mediaLessons.map((m: any, idx: number) => {
                  const isSelected = currentMedia?.id === m.id;
                  const isViewed = lessonProgress[m.id]?.isCompleted || lessonProgress[m.id]?.viewed;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedMediaId(m.id)}
                      className={`${styles.videoPill} ${isSelected ? styles.videoPillActive : ""}`}
                    >
                      <span>Part {idx + 1}: {m.title}</span>
                      {isViewed && <span>✓</span>}
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
                            setVideoCompletedNotice(true);
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
                        <div className={styles.videoWatermark}>{userEmail}</div>
                      </>
                    );
                  })()}
                </div>

                {resumedFrom && resumedFrom.lessonId === currentMedia.id && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", background: "#fef3c7", borderRadius: 10, fontSize: "0.85rem", color: "#92400e", marginTop: "1rem" }}>
                    <span>Resumed at <strong>{Math.floor(resumedFrom.timeSec / 60)}:{(resumedFrom.timeSec % 60).toString().padStart(2, "0")}</strong></span>
                    <button
                      type="button"
                      onClick={() => {
                        if (videoRef.current) videoRef.current.currentTime = 0;
                        setResumedFrom(null);
                      }}
                      style={{ background: "none", border: "none", color: "#b45309", fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}
                    >
                      Start from beginning
                    </button>
                  </div>
                )}

                <div className={styles.videoMetaBar}>
                  <div className={styles.videoMetaInfo}>
                    <span className={styles.videoLessonBadge}>{currentMedia.title}</span>
                    <span className={styles.videoDurationChip}>
                      {isVideoDone ? "✓ Watched" : `${Math.round(lessonProgress[currentMedia.id]?.progressPercent || 0)}% Completed`}
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
                      <span>{playbackSpeed}x Speed</span>
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

                {videoCompletedNotice && (
                  <div className={styles.videoCompletedNotice}>
                    <span>✓ Video Completed! Nice work! Ready for the next activity?</span>
                    <button
                      type="button"
                      onClick={handleGoContinue}
                      style={{ background: "#166534", color: "#ffffff", border: "none", padding: "6px 14px", borderRadius: 6, fontWeight: 700, cursor: "pointer", fontSize: "0.85rem" }}
                    >
                      Continue Now &rarr;
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: "center", padding: "60px 20px", background: "#ffffff", borderRadius: 14, border: "1px solid var(--border-light)" }}>
                <p style={{ color: "var(--text-secondary)" }}>No video lecture uploaded for this step.</p>
                <button
                  type="button"
                  className={styles.continueActionBtn}
                  onClick={() => switchActivity(documents.length > 0 ? "reading" : "notes")}
                >
                  Proceed to Next Activity &rarr;
                </button>
              </div>
            )}
          </div>
        )}

        {/* =================================================================
            TASK 2: READING / PDF ACTIVITY
            ================================================================= */}
        {activeActivity === "reading" && (
          <div className={styles.readingCard}>
            <div className={styles.docMetaHeader}>
              <span className={styles.docEstTime}>
                <span>⏱</span>
                <span>Estimated Reading Time: ~5 mins</span>
              </span>

              {documents.length > 0 && (
                <button
                  type="button"
                  className={`${styles.markReadBtn} ${isReadingDone ? styles.markReadBtnDone : ""}`}
                  onClick={() => {
                    documents.forEach((d: any) => handleCompleteDocument(d.id));
                  }}
                >
                  {isReadingDone ? "✓ Marked as Read" : "Mark as Read"}
                </button>
              )}
            </div>

            {textLessons.map((txt: any) => (
              <div key={txt.id} className={styles.docContentBox}>
                <h3 style={{ fontFamily: "var(--font-serif)", fontSize: "1.3rem", margin: "0 0 0.75rem" }}>
                  {txt.title}
                </h3>
                <p className={styles.docContentText}>{txt.content || "Read and internalize the conceptual guide above."}</p>
              </div>
            ))}

            {documents.map((doc: any) => (
              <div key={doc.id} className={styles.docDownloadRow}>
                <div>
                  <h4 style={{ margin: "0 0 0.25rem 0", fontSize: "1rem", color: "var(--text-primary)" }}>
                    {doc.title}
                  </h4>
                  <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                    Official Course Document · PDF
                  </span>
                </div>

                <a
                  href={doc.mediaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.openPdfBtn}
                  onClick={() => handleCompleteDocument(doc.id)}
                >
                  <span>Open PDF</span>
                  <span>↗</span>
                </a>
              </div>
            ))}

            {documents.length === 0 && textLessons.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 20px" }}>
                <p style={{ color: "var(--text-secondary)" }}>No supplementary documents required for this step.</p>
              </div>
            )}
          </div>
        )}

        {/* =================================================================
            TASK 3: PERSONAL REFLECTION / NOTES ACTIVITY
            ================================================================= */}
        {activeActivity === "notes" && (
          <div className={styles.notesCard}>
            <div className={styles.reflectionPromptBox}>
              <div className={styles.reflectionPromptTitle}>Reflection Prompt</div>
              <p className={styles.reflectionPromptText}>
                What did you learn? Capture your key takeaways, practical applications, or questions for your mentor.
              </p>
            </div>

            <div className={styles.notesToolbar}>
              <button type="button" className={styles.timestampBtn} onClick={insertTimestamp}>
                <span>⏱ Insert Video Timestamp</span>
              </button>

              <span className={styles.notesAutoSaveBadge}>
                {notesSaveStatus === "Saved to browser" ? "✓ Auto-saved" : "Saving..."}
              </span>
            </div>

            <textarea
              className={styles.notesTextarea}
              placeholder="Start typing your personal notes, insights, or code snippets here..."
              value={personalNotes}
              onChange={(e) => handleNotesChange(e.target.value)}
            />

            <div className={styles.notesFooter}>
              <span>{personalNotes.trim().split(/\s+/).filter(Boolean).length} words</span>
              <button type="button" className={styles.exportNotesBtn} onClick={exportNotes}>
                Download Notes (.txt)
              </button>
            </div>
          </div>
        )}

        {/* =================================================================
            TASK 4: KNOWLEDGE CHECK (QUIZ ENGINE)
            ================================================================= */}
        {activeActivity === "quiz" && quiz && (
          <div style={{ width: "100%" }}>
            {/* 1. QUIZ START SCREEN */}
            {!activeAttempt && !lastResult && (
              <div className={styles.quizIntroCard}>
                <div className={styles.quizHeroIcon}>🧠</div>
                <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.85rem", margin: "0 0 0.5rem" }}>
                  Knowledge Check
                </h2>
                <p style={{ color: "var(--text-secondary)", margin: "0 auto", maxWidth: 500 }}>
                  Confirm your mastery of this step before unlocking subsequent modules.
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
                  onClick={handleStartQuiz}
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
                <div className={styles.questionIndicatorBar}>
                  <span>QUESTION {currentQuestionIdx + 1} OF {questions.length}</span>
                  <span>{Math.round(((currentQuestionIdx + 1) / questions.length) * 100)}%</span>
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

            {/* 3. QUIZ RESULTS SCREEN */}
            {lastResult && (
              <div className={styles.resultCard}>
                {lastResult.passed ? (
                  <>
                    <div style={{ fontSize: "3.5rem", marginBottom: "0.5rem" }}>🎉</div>
                    <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "2rem", color: "#15803d", margin: "0 0 0.5rem" }}>
                      Knowledge Check Passed!
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
                      onClick={() => switchActivity("completion")}
                      style={{ padding: "0.85rem 2.25rem", fontSize: "1rem" }}
                    >
                      Proceed to Step Completion →
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: "3.5rem", marginBottom: "0.5rem" }}>💪</div>
                    <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.85rem", color: "#b91c1c", margin: "0 0 0.5rem" }}>
                      Keep Learning &amp; Try Again
                    </h2>
                    <div className={`${styles.scoreBadge} ${styles.scoreBadgeFailed}`}>
                      {lastResult.score}%
                    </div>
                    <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", marginBottom: "1.5rem" }}>
                      Passing score required: {lastResult.passMark}%.
                      Attempts remaining: {lastResult.attemptsRemaining ?? 0}.
                    </p>

                    {lastResult.isCooldownActive && (
                      <div style={{ background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", padding: "12px", borderRadius: 10, marginBottom: "1.5rem" }}>
                        Cooldown active until {lastResult.cooldownUntil ? new Date(lastResult.cooldownUntil).toLocaleTimeString() : "cooldown expires"}.
                      </div>
                    )}

                    {lastResult.canRetry && !lastResult.isCooldownActive && (
                      <button
                        type="button"
                        className={styles.continueActionBtn}
                        onClick={handleStartQuiz}
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
        )}

        {/* =================================================================
            TASK 5: STEP / MODULE COMPLETE CELEBRATION
            ================================================================= */}
        {activeActivity === "completion" && (
          <div className={styles.completionCard}>
            <div className={styles.trophyBadge}>🏆</div>
            <h2 className={styles.completionTitle}>Step {step.sequence} Mastered!</h2>
            <p className={styles.completionSubtitle}>
              You have satisfied every milestone for <strong>{step.title}</strong>.
              Your achievement has been verified and permanently stored on your transcript.
            </p>

            <div className={styles.milestonesList}>
              <div className={styles.milestoneRow}>
                <span className={styles.milestoneCheck}>✓</span>
                <span>Video Lecture Completed</span>
              </div>
              <div className={styles.milestoneRow}>
                <span className={styles.milestoneCheck}>✓</span>
                <span>Reading &amp; Reference Material Reviewed</span>
              </div>
              <div className={styles.milestoneRow}>
                <span className={styles.milestoneCheck}>✓</span>
                <span>Reflection &amp; Notes Captured</span>
              </div>
              {quiz && (
                <div className={styles.milestoneRow}>
                  <span className={styles.milestoneCheck}>✓</span>
                  <span>Knowledge Check Passed ({lastResult?.score || quiz.passMark}%)</span>
                </div>
              )}
            </div>

            {nextStep ? (
              <button
                type="button"
                className={styles.continueActionBtn}
                onClick={() => router.push(`/steps/${nextStep.stepId}`)}
                style={{ padding: "0.9rem 2.5rem", fontSize: "1.05rem" }}
              >
                Start Step {nextStep.sequence}: {nextStep.title} →
              </button>
            ) : (
              <Link
                href={`/programs/${step.programId}/steps`}
                className={styles.continueActionBtn}
                style={{ padding: "0.9rem 2.5rem", fontSize: "1.05rem", display: "inline-block" }}
              >
                Return to Course Path &amp; Certificates →
              </Link>
            )}
          </div>
        )}
      </main>

      {/* ===================================================================
          3. Strict Two-Button Bottom Navigation Bar (Coursera / Linear style)
          =================================================================== */}
      <footer className={styles.stickyBottomBar}>
        <button
          type="button"
          className={styles.prevActionBtn}
          onClick={handleGoPrevious}
        >
          {getPreviousButtonLabel()}
        </button>

        <div className={styles.autoSaveIndicator}>
          <span>✓</span>
          <span>Progress auto-saved</span>
        </div>

        <button
          type="button"
          className={styles.continueActionBtn}
          onClick={handleGoContinue}
          disabled={Boolean(activeActivity === "quiz" && activeAttempt && (!answers[currentQuestion?.id || ""] || isSubmittingQuiz))}
        >
          {getContinueButtonLabel()}
        </button>
      </footer>

      {/* ===================================================================
          4. Course Outline Drawer (Slides in on demand)
          =================================================================== */}
      {showDrawer && (
        <>
          <div className={styles.drawerBackdrop} onClick={() => setShowDrawer(false)} />
          <aside className={styles.drawerPanel} aria-label="Course Syllabus Drawer">
            <div className={styles.drawerHeader}>
              <div>
                <h3 className={styles.drawerTitle}>{progression?.programTitle || "Course Outline"}</h3>
                <p className={styles.drawerSubtitle}>
                  {allSteps.filter((s) => s.isCompleted).length} of {allSteps.length} Steps Completed ({progression?.overallProgressPercent || 0}%)
                </p>
              </div>
              <button
                type="button"
                className={styles.drawerCloseBtn}
                onClick={() => setShowDrawer(false)}
                title="Close Drawer"
              >
                ✕
              </button>
            </div>

            <div className={styles.drawerBody}>
              {allSteps.map((s) => {
                const isCurrent = s.stepId === stepId;
                const isDone = s.isCompleted;
                const isUnlocked = s.isUnlocked;

                if (!isUnlocked) {
                  return (
                    <div key={s.stepId} className={styles.drawerLockedCard}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-muted)", fontSize: "0.85rem", fontWeight: 700 }}>
                        <span>🔒</span>
                        <span>Step {s.sequence}: {s.title}</span>
                      </div>
                      <div className={styles.drawerLockedReason}>
                        {getLockMessage(s.lockReason)}
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={s.stepId}
                    className={`${styles.drawerStepCard} ${isCurrent ? styles.drawerStepCardActive : ""}`}
                  >
                    <Link
                      href={`/steps/${s.stepId}`}
                      className={styles.drawerStepHeader}
                      onClick={() => setShowDrawer(false)}
                    >
                      <span className={styles.drawerStepTitle}>
                        {isDone ? "✓ " : `${s.sequence}. `}
                        {s.title}
                      </span>
                      {isCurrent && (
                        <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--accent-primary)" }}>
                          Active
                        </span>
                      )}
                    </Link>

                    {/* If current step, show nested task links */}
                    {isCurrent && (
                      <div className={styles.drawerSubTasksList}>
                        {mediaLessons.length > 0 && (
                          <button
                            type="button"
                            className={`${styles.drawerSubTaskItem} ${activeActivity === "video" ? styles.drawerSubTaskItemActive : ""}`}
                            onClick={() => {
                              switchActivity("video");
                              setShowDrawer(false);
                            }}
                          >
                            <span>{isVideoDone ? "✓" : "○"}</span>
                            <span>Video Lesson</span>
                          </button>
                        )}

                        {(documents.length > 0 || textLessons.length > 0) && (
                          <button
                            type="button"
                            className={`${styles.drawerSubTaskItem} ${activeActivity === "reading" ? styles.drawerSubTaskItemActive : ""}`}
                            onClick={() => {
                              switchActivity("reading");
                              setShowDrawer(false);
                            }}
                          >
                            <span>{isReadingDone ? "✓" : "○"}</span>
                            <span>Reading Material ({documents.length + textLessons.length})</span>
                          </button>
                        )}

                        <button
                          type="button"
                          className={`${styles.drawerSubTaskItem} ${activeActivity === "notes" ? styles.drawerSubTaskItemActive : ""}`}
                          onClick={() => {
                            switchActivity("notes");
                            setShowDrawer(false);
                          }}
                        >
                          <span>{isNotesCaptured ? "✓" : "○"}</span>
                          <span>Reflection Notes</span>
                        </button>

                        {quiz && (
                          <button
                            type="button"
                            className={`${styles.drawerSubTaskItem} ${activeActivity === "quiz" ? styles.drawerSubTaskItemActive : ""}`}
                            onClick={() => {
                              switchActivity("quiz");
                              setShowDrawer(false);
                            }}
                          >
                            <span>{isQuizPassed ? "✓" : "○"}</span>
                            <span>Knowledge Check</span>
                          </button>
                        )}

                        <button
                          type="button"
                          className={`${styles.drawerSubTaskItem} ${activeActivity === "completion" ? styles.drawerSubTaskItemActive : ""}`}
                          onClick={() => {
                            switchActivity("completion");
                            setShowDrawer(false);
                          }}
                        >
                          <span>{isStepCompleted ? "✓" : "○"}</span>
                          <span>Step Mastered</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
