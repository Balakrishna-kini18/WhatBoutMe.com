"use client";

import { useEffect, useState, use, useCallback, useRef, useMemo } from "react";
import styles from "./step.module.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  API_URL,
  getAuthHeaders,
  parseApiError,
  invalidateCache,
  EnrolmentProgressionResponse,
  QuizQuestion,
  fetchLessonNotes,
  createStudentNote,
  deleteStudentNote,
  StudentNote,
  getLockMessage,
} from "../../lib/api";
import CompulsoryVideoPlayer from "./CompulsoryVideoPlayer";

export type WorkspaceTab = "video" | "quiz" | "notes" | "materials" | "discussions";

function resolveVideoSrc(rawUrl?: string | null): string {
  if (!rawUrl) return "";
  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://") || rawUrl.startsWith("/")) {
    return rawUrl;
  }
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const isUpload = rawUrl.startsWith("upload:");
  const rawKey = isUpload ? rawUrl.replace("upload:", "") : rawUrl;
  const streamingKey = rawKey.includes(".") ? rawKey : `${rawKey}.mp4`;
  return `${API_URL}/media/stream/${streamingKey}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
}

export default function StepPage({ params }: { params: Promise<{ stepId: string }> }) {
  const router = useRouter();
  const unwrappedParams = use(params);
  const stepId = unwrappedParams.stepId;

  // Primary data state
  const [step, setStep] = useState<any>(null);
  const [progression, setProgression] = useState<EnrolmentProgressionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // View state: "overview" (Screen 2) vs "workspace" (Screen 3, 4, 5, 6, 7)
  const [viewMode, setViewMode] = useState<"overview" | "workspace">("workspace");
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("video");

  // Active lesson state
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [lessonProgress, setLessonProgress] = useState<Record<string, any>>({});
  const [isCelebrationOpen, setIsCelebrationOpen] = useState(false);
  const [celebrationMode, setCelebrationMode] = useState<"lesson" | "module">("lesson");
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Notes state
  const [notes, setNotes] = useState<StudentNote[]>([]);
  const [noteInput, setNoteInput] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [notesSearch, setNotesSearch] = useState("");

  // Materials state
  const [materialsSearch, setMaterialsSearch] = useState("");

  // Discussions state (Screen 8)
  const [discussionFilter, setDiscussionFilter] = useState<"all" | "my">("all");
  const [discussionSearch, setDiscussionSearch] = useState("");
  const [newPostContent, setNewPostContent] = useState("");
  const [replyInputId, setReplyInputId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [discussions, setDiscussions] = useState<
    {
      id: string;
      author: string;
      avatar: string;
      time: string;
      content: string;
      likes: number;
      isLiked?: boolean;
      replies: {
        id: string;
        author: string;
        avatar: string;
        time: string;
        content: string;
      }[];
    }[]
  >([
    {
      id: "disc-1",
      author: "Roweena Fox",
      avatar: "R",
      time: "2 hours ago",
      content: "Welcome to this module! Remember to take active notes on how sustainable action transforms daily focus routines.",
      likes: 12,
      isLiked: false,
      replies: [
        {
          id: "rep-1",
          author: "Sahyadri",
          avatar: "S",
          time: "1 hour ago",
          content: "The breakdown of daily micro-commitments in Part 2 was really eye-opening!",
        },
      ],
    },
    {
      id: "disc-2",
      author: "Kiran Rao",
      avatar: "K",
      time: "Yesterday",
      content: "Does anyone have additional reading on the neural pathways discussed at 04:15 in the video?",
      likes: 5,
      isLiked: false,
      replies: [],
    },
  ]);

  // Quiz state
  const [activeQuizIndex, setActiveQuizIndex] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [isSubmittingQuiz, setIsSubmittingQuiz] = useState(false);
  const [lastQuizResult, setLastQuizResult] = useState<any>(null);
  const [quizError, setQuizError] = useState<string | null>(null);

  // User state
  const [userName, setUserName] = useState<string>("Learner");
  const [userEmail, setUserEmail] = useState<string>("learner@whatboutme.com");
  const isFetchingRef = useRef<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isHeartbeatInFlightRef = useRef<boolean>(false);

  // 1. Initial User Hydration & Jump Link (?lessonId=...)
  useEffect(() => {
    const rawUser = typeof window !== "undefined" ? localStorage.getItem("user") : null;
    if (rawUser) {
      try {
        const parsed = JSON.parse(rawUser);
        if (parsed.name) setUserName(parsed.name);
        if (parsed.email) setUserEmail(parsed.email);
      } catch (e) {}
    }
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (token) {
      try {
        const parts = token.split(".");
        if (parts[1]) {
          const payload = JSON.parse(atob(parts[1]));
          if (payload.email) setUserEmail(payload.email);
          if (payload.name) setUserName(payload.name);
        }
      } catch (e) {}
    }

    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const paramLessonId = sp.get("lessonId");
      const paramTab = sp.get("tab") as WorkspaceTab | null;
      const paramView = sp.get("view");
      if (paramLessonId) {
        setSelectedMediaId(paramLessonId);
        setViewMode("workspace");
      }
      if (paramTab && ["video", "quiz", "notes", "materials"].includes(paramTab)) {
        setActiveTab(paramTab as WorkspaceTab);
      }
      if (paramView === "overview") {
        setViewMode("overview");
      }
    }
  }, []);

  // 2. Fetch Step & Progression
  const fetchStepAndProgression = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      isFetchingRef.current = false;
      router.push("/login");
      return;
    }

    try {
      setLoadError(null);
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

      // Concurrent fetch of progression and quiz attempt
      let progData: EnrolmentProgressionResponse | null = null;
      const progPromise = stepData.programId
        ? fetch(`${API_URL}/progression/me/${stepData.programId}`, {
            headers: getAuthHeaders(),
          })
        : Promise.resolve(null);

      const quizPromise = stepData.quiz?.id
        ? fetch(`${API_URL}/quizzes/${stepData.quiz.id}/attempt`, {
            headers: getAuthHeaders(),
          }).catch(() => null)
        : Promise.resolve(null);

      const [progRes, quizAttemptRes] = await Promise.all([progPromise, quizPromise]);

      if (progRes && progRes.ok) {
        progData = await progRes.json();
        setProgression(progData);
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
              const lpRes = await fetch(`${API_URL}/progress/lessons/${l.id}`, {
                headers: getAuthHeaders(),
              });
              if (lpRes.ok) {
                const d = await lpRes.json();
                if (d) lpMap[l.id] = d;
              }
            })
          );
          setLessonProgress(lpMap);
        } catch (e) {}
      }

      // Default active lesson
      if (Array.isArray(stepData.lessons) && stepData.lessons.length > 0) {
        setSelectedMediaId((prev) => {
          if (prev && stepData.lessons.some((l: any) => l.id === prev)) return prev;
          const firstIncomplete = stepData.lessons.find((l: any) => !lpMap[l.id]?.isCompleted);
          return firstIncomplete ? firstIncomplete.id : stepData.lessons[0].id;
        });
      }

      // Handle quiz attempt
      if (quizAttemptRes && quizAttemptRes.ok) {
        try {
          const attemptText = await quizAttemptRes.text();
          if (attemptText) {
            const attemptData = JSON.parse(attemptText);
            if (attemptData) {
              setLastQuizResult(attemptData);
            }
          }
        } catch (e) {}
      }
    } catch (err: any) {
      console.error(err);
      setLoadError(err.message || "Failed to load step information");
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [stepId, router]);

  useEffect(() => {
    fetchStepAndProgression();
  }, [fetchStepAndProgression]);

  // Lessons list calculation
  const allLessons = useMemo(() => {
    return Array.isArray(step?.lessons) ? step.lessons : [];
  }, [step]);

  const currentMedia = useMemo(() => {
    if (!allLessons.length) return null;
    return allLessons.find((l: any) => l.id === selectedMediaId) || allLessons[0];
  }, [allLessons, selectedMediaId]);

  const activeLessonIndex = useMemo(() => {
    if (!currentMedia || !allLessons.length) return 0;
    const idx = allLessons.findIndex((l: any) => l.id === currentMedia.id);
    return idx >= 0 ? idx : 0;
  }, [allLessons, currentMedia]);

  const formatLessonDuration = (sec?: number) => {
    if (!sec || sec <= 0) return null;
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  // Load Notes for current lesson
  const loadNotesForLesson = useCallback(async (lessonId: string) => {
    try {
      const data = await fetchLessonNotes(lessonId);
      setNotes(data || []);
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (currentMedia?.id) {
      loadNotesForLesson(currentMedia.id);
    }
  }, [currentMedia?.id, loadNotesForLesson]);

  // Handle Save Note
  const handleSaveNote = async () => {
    if (!noteInput.trim() || !currentMedia?.id) return;
    setIsSavingNote(true);
    try {
      const saved = await createStudentNote({
        lessonId: currentMedia.id,
        stepId,
        programId: step?.programId,
        noteText: noteInput.trim(),
      });
      setNotes((prev) => [saved, ...prev]);
      setNoteInput("");
    } catch (err: any) {
      // Fallback local note
      const fallbackNote: StudentNote = {
        id: `local-${Date.now()}`,
        userId: "local-user",
        programId: step?.programId || null,
        stepId,
        lessonId: currentMedia.id,
        noteText: noteInput.trim(),
        highlightSnippet: null,
        videoTimestampSeconds: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setNotes((prev) => [fallbackNote, ...prev]);
      setNoteInput("");
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleDeleteNote = async (id: string) => {
    try {
      await deleteStudentNote(id);
    } catch (e) {}
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  // Video Heartbeat
  const sendMediaHeartbeat = useCallback(
    async (lessonId: string, positionSec: number, isEnded = false, videoDurationSec?: number, deltaWatchedSec?: number) => {
      if (isHeartbeatInFlightRef.current && !isEnded) return;
      isHeartbeatInFlightRef.current = true;

      try {
        const dur = videoDurationSec ?? Math.floor(videoRef.current?.duration || 0);
        const res = await fetch(`${API_URL}/progress/lessons/${lessonId}/heartbeat`, {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            positionSec,
            videoDurationSec: dur > 0 ? dur : undefined,
            isEnded,
            deltaWatchedSec,
            timestamp: Date.now(),
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setLessonProgress((prev) => ({ ...prev, [lessonId]: data }));
          if (data.isCompleted || isEnded) {
            invalidateCache("/progression");
            invalidateCache("/progress");
            fetchStepAndProgression();
          }
        }
      } catch (err) {
        console.warn("Heartbeat error:", err);
      } finally {
        isHeartbeatInFlightRef.current = false;
      }
    },
    [fetchStepAndProgression]
  );

  // Next / Prev step links
  const stepsList: any[] = useMemo(() => {
    if (progression?.steps && progression.steps.length > 0) {
      return progression.steps;
    }
    if (step?.program?.steps && step.program.steps.length > 0) {
      return step.program.steps.map((s: any) => ({
        stepId: s.id,
        id: s.id,
        sequence: s.sequence,
        title: s.title,
      }));
    }
    return [];
  }, [progression?.steps, step?.program?.steps]);

  const currentStepIndex = stepsList.findIndex(
    (s: any) => (s.stepId && s.stepId === stepId) || (s.id && s.id === stepId)
  );
  const prevStep = currentStepIndex > 0 ? stepsList[currentStepIndex - 1] : null;
  const nextStep =
    currentStepIndex >= 0 && currentStepIndex < stepsList.length - 1
      ? stepsList[currentStepIndex + 1]
      : null;
  const nextStepId = nextStep?.stepId || nextStep?.id || null;

  // Next lesson helper
  const nextLesson = activeLessonIndex < allLessons.length - 1 ? allLessons[activeLessonIndex + 1] : null;

  // Countdown timer for automatic module progression
  useEffect(() => {
    if (redirectCountdown === null) return;
    if (redirectCountdown <= 0) {
      if (nextStepId) {
        setIsCelebrationOpen(false);
        setRedirectCountdown(null);
        router.push(`/steps/${nextStepId}`);
      }
      return;
    }
    const timer = setTimeout(() => {
      setRedirectCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearTimeout(timer);
  }, [redirectCountdown, nextStepId, router]);

  // Lesson Completion
  const handleLessonComplete = async (lessonId: string) => {
    try {
      await fetch(`${API_URL}/progress/lessons/${lessonId}/complete`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      setLessonProgress((prev) => ({
        ...prev,
        [lessonId]: { ...prev[lessonId], isCompleted: true, viewed: true },
      }));
      invalidateCache("/progression");
      fetchStepAndProgression();
    } catch (e) {
      // continue locally
    }

    const updatedProgress = {
      ...lessonProgress,
      [lessonId]: { ...lessonProgress[lessonId], isCompleted: true, viewed: true },
    };
    const areAllVideosDone = allLessons.every(
      (l: any) => updatedProgress[l.id]?.isCompleted || updatedProgress[l.id]?.viewed
    );

    if (areAllVideosDone) {
      if (step?.quiz && !lastQuizResult?.passed && !(currentStepProg as any)?.quizPassed && !currentStepProg?.isCompleted) {
        // Videos are finished, quiz is required!
        setCelebrationMode("lesson");
        setIsCelebrationOpen(true);
      } else {
        // All videos done and quiz passed or no quiz -> Entire Module Completed!
        setCelebrationMode("module");
        setIsCelebrationOpen(true);
        if (nextStepId) {
          setRedirectCountdown(4);
        }
      }
    } else {
      // Single video part completed
      setCelebrationMode("lesson");
      setIsCelebrationOpen(true);
    }
  };

  // Quiz submission
  const handleQuizSubmit = async () => {
    if (!step?.quiz?.id) return;
    setIsSubmittingQuiz(true);
    setQuizError(null);

    const questionsList: QuizQuestion[] = step.quiz.questions || [];
    const submissionDto = {
      answers: questionsList.map((q) => ({
        questionId: q.id,
        selectedOptionId: quizAnswers[q.id] || undefined,
      })),
    };

    try {
      const res = await fetch(`${API_URL}/quizzes/${step.quiz.id}/submit`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(submissionDto),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to submit quiz");
      }
      setLastQuizResult(data);
      if (data.passed) {
        invalidateCache("/progression");
        fetchStepAndProgression();
        setCelebrationMode("module");
        setIsCelebrationOpen(true);
        if (nextStepId) {
          setRedirectCountdown(4);
        }
      }
    } catch (err: any) {
      setQuizError(err.message || "Failed to submit quiz");
    } finally {
      setIsSubmittingQuiz(false);
    }
  };

  // Calculate Progress Percentages
  const currentStepProg = progression?.steps?.find((s: any) => s.stepId === stepId);
  const isStepCompleted = currentStepProg?.isCompleted || step?.isCompleted;
  const isStepUnlocked = currentStepProg ? currentStepProg.isUnlocked : true;

  const totalLessonsCount = allLessons.length;
  const completedLessonsCount = allLessons.filter(
    (l: any) => lessonProgress[l.id]?.isCompleted || lessonProgress[l.id]?.viewed
  ).length;

  const calculatedStepPercent =
    totalLessonsCount > 0
      ? Math.round((completedLessonsCount / totalLessonsCount) * 100)
      : currentStepProg?.progressPercent || 0;

  // Loading State
  if (loading && !step) {
    return (
      <div className={styles.container}>
        <div style={{ textAlign: "center", padding: "4rem 2rem", color: "#78716c" }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", border: "4px solid #fde68a", borderTopColor: "#d97706", animation: "spin 1s linear infinite", margin: "0 auto 1.25rem" }} />
          <h2 style={{ fontSize: "1.25rem", color: "#1c1917", margin: "0 0 6px" }}>Loading Module Workspace...</h2>
          <p style={{ fontSize: "0.88rem", margin: 0 }}>Connecting with live progression engine</p>
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  // Error State
  if (loadError) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyStateCard}>
          <h2 style={{ color: "#dc2626", margin: "0 0 8px" }}>Could not load curriculum</h2>
          <p style={{ margin: "0 0 1.5rem" }}>{loadError}</p>
          <button type="button" onClick={() => fetchStepAndProgression()} className={styles.btnPrimaryOrange}>
            Retry Loading
          </button>
        </div>
      </div>
    );
  }

  // Locked Step State
  if (!isStepUnlocked && currentStepProg) {
    return (
      <div className={styles.container}>
        <div className={styles.lockCard}>
          <span className={styles.lockBadge}>Step Locked</span>
          <h2 className={styles.lockTitle}>Step {step.sequence}: {step.title}</h2>
          <p className={styles.lockMessage}>
            {getLockMessage(currentStepProg.lockReason)}
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <Link href={`/programs/${step.programId}/steps`} className={styles.btnPrimaryOrange}>
              Return to Roadmap &rarr;
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const defaultFallbackQuestion: QuizQuestion = {
    id: "q-sample-1",
    text: "What is the primary purpose of this LMS platform?",
    type: "MULTIPLE_CHOICE",
    points: 1,
    options: [
      { id: "opt-1", text: "To edit video files", order: 1 },
      { id: "opt-2", text: "To manage payroll", order: 2 },
      { id: "opt-3", text: "To manage learning and track course progress", order: 3 },
      { id: "opt-4", text: "To design graphics", order: 4 },
    ],
  };

  const quizQuestions: QuizQuestion[] = (step?.quiz?.questions && step.quiz.questions.length > 0)
    ? step.quiz.questions
    : [
        defaultFallbackQuestion,
        {
          id: "q-sample-2",
          text: "How do lessons unlock within a module?",
          type: "MULTIPLE_CHOICE",
          points: 1,
          options: [
            { id: "opt-21", text: "Randomly upon login", order: 1 },
            { id: "opt-22", text: "Sequentially as video and knowledge check requirements are met", order: 2 },
            { id: "opt-23", text: "By purchasing unlock tokens", order: 3 },
            { id: "opt-24", text: "Only after midnight every Sunday", order: 4 },
          ],
        },
        {
          id: "q-sample-3",
          text: "What minimum passing score is required on the Knowledge Check?",
          type: "MULTIPLE_CHOICE",
          points: 1,
          options: [
            { id: "opt-31", text: "50%", order: 1 },
            { id: "opt-32", text: "75%", order: 2 },
            { id: "opt-33", text: "90%", order: 3 },
            { id: "opt-34", text: "100%", order: 4 },
          ],
        },
      ];

  const currentQuizQuestion: QuizQuestion = quizQuestions[activeQuizIndex] || quizQuestions[0] || defaultFallbackQuestion;

  // ---------------------------------------------------------------------------
  // RENDER VIEW
  // ---------------------------------------------------------------------------
  return (
    <div className={styles.container}>
      {/* =====================================================================
          TOP HEADER & VIEW SWITCHER
          ===================================================================== */}
      <div className={styles.pageHeaderRow}>
        <div>
          {viewMode === "workspace" ? (
            <button
              type="button"
              onClick={() => setViewMode("overview")}
              className={styles.breadcrumbBack}
              title="Return to Module Overview"
            >
              &larr; Back to Module Overview
            </button>
          ) : (
            <Link href={`/programs/${step?.programId}/steps`} className={styles.breadcrumbBack}>
              &larr; Back to Learning Path
            </Link>
          )}

          <h1 className={styles.pageMainTitle}>
            Step {step?.sequence}: {step?.title}
          </h1>
          <p className={styles.pageSubtitle}>
            {step?.title} • {completedLessonsCount} of {totalLessonsCount} lessons completed
          </p>
        </div>

        <div className={styles.headerActionCluster}>
          {/* View mode toggle pills */}
          <div className={styles.viewToggleGroup}>
            <button
              type="button"
              onClick={() => setViewMode("overview")}
              className={`${styles.viewToggleBtn} ${viewMode === "overview" ? styles.viewToggleBtnActive : ""}`}
            >
              ☰ Module Overview
            </button>
            <button
              type="button"
              onClick={() => setViewMode("workspace")}
              className={`${styles.viewToggleBtn} ${viewMode === "workspace" ? styles.viewToggleBtnActive : ""}`}
            >
              ▶ Lesson Workspace
            </button>
          </div>

          {/* Drawer open button */}
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            className={styles.btnSecondaryOutline}
            title="Open Module Lessons Drawer"
          >
            <span>☰ Module Lessons</span>
          </button>
        </div>
      </div>

      {/* =====================================================================
          SCREEN 2: MODULE / STEP OVERVIEW (when viewMode === "overview")
          ===================================================================== */}
      {viewMode === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Step Progress Card */}
          <div className={styles.moduleDetailCard}>
            <div className={styles.moduleProgressHeader}>
              <span>Step Progress: {calculatedStepPercent}% ({completedLessonsCount} of {totalLessonsCount} lessons completed)</span>
              <span style={{ color: "#d97706" }}>{calculatedStepPercent}%</span>
            </div>
            <div className={styles.moduleProgressBar}>
              <div className={styles.moduleProgressFill} style={{ width: `${calculatedStepPercent}%` }} />
            </div>
          </div>

          {/* Sequential Lesson Cards List */}
          <div className={styles.lessonCardsList}>
            {allLessons.map((l: any, idx: number) => {
              const isDone = lessonProgress[l.id]?.isCompleted || lessonProgress[l.id]?.viewed;
              const isCurrent = currentMedia?.id === l.id;
              const isLocked = idx > 0 && !lessonProgress[allLessons[idx - 1]?.id]?.isCompleted && !isDone;

              return (
                <div
                  key={l.id}
                  onClick={() => {
                    if (!isLocked) {
                      setSelectedMediaId(l.id);
                      setViewMode("workspace");
                      setActiveTab("video");
                    }
                  }}
                  className={`${styles.lessonCardRow} ${isCurrent ? styles.lessonCardActive : ""}`}
                  style={{ cursor: isLocked ? "not-allowed" : "pointer", opacity: isLocked ? 0.7 : 1 }}
                >
                  <div className={styles.lessonCardLeft}>
                    <div
                      className={`${styles.lessonPlayCircle} ${
                        isDone
                          ? styles.lessonPlayCircleDone
                          : isCurrent
                          ? styles.lessonPlayCircleActive
                          : styles.lessonPlayCircleLocked
                      }`}
                    >
                      {isDone ? "✓" : "▶"}
                    </div>
                    <div className={styles.lessonTitleMeta}>
                      <h4 className={styles.lessonRowTitle}>{l.title}</h4>
                      <span className={styles.lessonRowMeta}>
                        {l.durationSec ? `${Math.ceil(l.durationSec / 60)} min` : "15 min"} • {l.type || "Video"}
                      </span>
                    </div>
                  </div>

                  <div>
                    {isDone ? (
                      <span className={styles.lessonDoneCheck} title="Completed">✓</span>
                    ) : isCurrent ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedMediaId(l.id);
                          setViewMode("workspace");
                          setActiveTab("video");
                        }}
                        className={styles.btnPrimaryOrange}
                      >
                        Continue &rarr;
                      </button>
                    ) : isLocked ? (
                      <span style={{ color: "#9ca3af", fontSize: "1.1rem" }} title="Locked">🔒</span>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedMediaId(l.id);
                          setViewMode("workspace");
                          setActiveTab("video");
                        }}
                        className={styles.btnSecondaryOutline}
                      >
                        Start
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Module Navigation Footer */}
          <div className={styles.moduleFooterNav}>
            {prevStep ? (
              <Link href={`/steps/${prevStep.stepId || prevStep.id}`} className={styles.btnSecondaryOutline}>
                &larr; Previous Module
              </Link>
            ) : (
              <span />
            )}
            {nextStep && nextStepId ? (
              <Link
                href={`/steps/${nextStepId}`}
                className={styles.btnPrimaryOrange}
                style={{
                  background: isStepCompleted ? "#d97706" : "#fef3c7",
                  color: isStepCompleted ? "#ffffff" : "#b45309",
                  borderColor: isStepCompleted ? "#d97706" : "#fde68a",
                }}
              >
                Next Module ({nextStep.title}) &rarr;
              </Link>
            ) : (
              <Link href={`/programs/${step?.programId}/steps`} className={styles.btnPrimaryOrange}>
                Course Roadmap &rarr;
              </Link>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          SCREENS 3 - 6: 4-TAB LESSON WORKSPACE (when viewMode === "workspace")
          ===================================================================== */}
      {viewMode === "workspace" && (
        <div>
          {/* 4-Tab Learning Tools Navigation Strip */}
          <nav className={styles.learningToolsStrip} aria-label="Lesson Workspace Tabs">
            <button
              type="button"
              onClick={() => setActiveTab("video")}
              className={`${styles.learningTabBtn} ${activeTab === "video" ? styles.learningTabBtnActive : ""}`}
            >
              <span>▶</span>
              <span>Video Lesson</span>
              {allLessons.length > 1 && (
                <span className={styles.learningTabCount}>{allLessons.length} Parts</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("quiz")}
              className={`${styles.learningTabBtn} ${activeTab === "quiz" ? styles.learningTabBtnActive : ""}`}
            >
              <span>📝</span>
              <span>Quiz</span>
              {quizQuestions.length > 0 && (
                <span className={styles.learningTabCount}>{quizQuestions.length}</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("notes")}
              className={`${styles.learningTabBtn} ${activeTab === "notes" ? styles.learningTabBtnActive : ""}`}
            >
              <span>✍️</span>
              <span>Notes</span>
              {notes.length > 0 && <span className={styles.learningTabCount}>{notes.length}</span>}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("materials")}
              className={`${styles.learningTabBtn} ${activeTab === "materials" ? styles.learningTabBtnActive : ""}`}
            >
              <span>📁</span>
              <span>Materials</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("discussions")}
              className={`${styles.learningTabBtn} ${activeTab === "discussions" ? styles.learningTabBtnActive : ""}`}
            >
              <span>💬</span>
              <span>Discussions</span>
              <span className={styles.learningTabCount}>{discussions.length}</span>
            </button>
          </nav>

          {/* TAB 1: VIDEO LESSON & NOTES COMPANION (SCREEN 3) */}
          {activeTab === "video" && (
            <div className={styles.lessonWorkspaceGrid}>
              {/* Left Column: Multi-Video Selector + 16:9 Compulsory Player + Lesson Details */}
              <div className={styles.videoLeftColumn}>
                {/* Multi-video parts selector (if step contains >1 video) */}
                {allLessons.length > 1 && (
                  <div className={styles.multiVideoPlaylistCard}>
                    <div className={styles.multiVideoPlaylistHeader}>
                      <div className={styles.multiVideoPlaylistHeaderLeft}>
                        <span className={styles.multiVideoPlaylistBadge}>
                          Module Playlist ({allLessons.length} Parts)
                        </span>
                        <span className={styles.multiVideoCurrentPart}>
                          Part {activeLessonIndex + 1} of {allLessons.length}: {currentMedia?.title}
                        </span>
                      </div>
                      <span className={styles.multiVideoCounter}>
                        {completedLessonsCount}/{totalLessonsCount} Completed
                      </span>
                    </div>

                    <div className={styles.multiVideoTrackList} role="tablist">
                      {allLessons.map((l: any, idx: number) => {
                        const isSelected = currentMedia?.id === l.id;
                        const isDone = lessonProgress[l.id]?.isCompleted || lessonProgress[l.id]?.viewed;
                        const isLocked = idx > 0 && !lessonProgress[allLessons[idx - 1]?.id]?.isCompleted && !isDone;

                        return (
                          <button
                            key={l.id}
                            type="button"
                            role="tab"
                            aria-selected={isSelected}
                            disabled={isLocked}
                            onClick={() => {
                              if (!isLocked) {
                                setSelectedMediaId(l.id);
                              }
                            }}
                            className={`${styles.multiVideoItemBtn} ${
                              isSelected ? styles.multiVideoItemBtnActive : ""
                            } ${isDone ? styles.multiVideoItemBtnDone : ""} ${
                              isLocked ? styles.multiVideoItemBtnLocked : ""
                            }`}
                            title={isLocked ? "Complete previous video part to unlock" : l.title}
                          >
                            <div className={styles.multiVideoItemLeft}>
                              <span className={styles.multiVideoItemPartNum}>
                                {isDone ? "✓" : isLocked ? "🔒" : `${idx + 1}`}
                              </span>
                              <div className={styles.multiVideoItemMeta}>
                                <strong className={styles.multiVideoItemTitle}>
                                  Part {idx + 1}: {l.title || "Video Lesson"}
                                </strong>
                                <span className={styles.multiVideoItemDuration}>
                                  {l.durationSec ? `${Math.ceil(l.durationSec / 60)} min` : "Video"}
                                  {isDone ? " • Completed" : isSelected ? " • Now Playing" : isLocked ? " • Locked" : " • Ready"}
                                </span>
                              </div>
                            </div>
                            <div className={styles.multiVideoItemRight}>
                              {isSelected ? (
                                <span className={styles.playingTag}>Playing</span>
                              ) : isDone ? (
                                <span className={styles.completedTag}>Watched</span>
                              ) : isLocked ? (
                                <span className={styles.lockedTag}>Locked</span>
                              ) : (
                                <span className={styles.startTag}>Start</span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Unified Video & Lesson Details in the Same Box */}
                <div className={styles.unifiedVideoCard}>
                  {currentMedia?.mediaUrl ? (
                    <div className={styles.videoPlayerViewport}>
                      <CompulsoryVideoPlayer
                        lessonId={currentMedia.id}
                        videoSrc={resolveVideoSrc(currentMedia.mediaUrl)}
                        userName={userName}
                        userEmail={userEmail}
                        durationSec={currentMedia.durationSec || 0}
                        initialPositionSec={lessonProgress[currentMedia.id]?.lastPositionSec || 0}
                        onHeartbeat={(pos, ended, dur, delta) =>
                          sendMediaHeartbeat(currentMedia.id, pos, ended, dur, delta)
                        }
                        onComplete={() => handleLessonComplete(currentMedia.id)}
                      />
                    </div>
                  ) : (
                    <div className={styles.videoPlayerViewport} style={{ display: "flex", flexDirection: "column", gap: 8, color: "#a8a29e", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: "2rem" }}>▶</span>
                      <span>No video stream attached to this lesson</span>
                    </div>
                  )}

                  {/* Dynamic Lesson Details in the Same Box */}
                  <div className={styles.lessonDetailsCard}>
                    <div className={styles.lessonDetailsHeader}>
                      <div>
                        <h3 className={styles.lessonDetailsTitle}>{currentMedia?.title || "Lesson Overview"}</h3>
                        <span style={{ fontSize: "0.82rem", color: "#78716c" }}>
                          Part {activeLessonIndex + 1} of {allLessons.length}
                          {currentMedia?.durationSec ? ` • Duration: ${formatLessonDuration(currentMedia.durationSec)}` : ""}
                        </span>
                      </div>
                      {lessonProgress[currentMedia?.id]?.isCompleted && (
                        <span className={styles.watchedPill}>✓ Watched</span>
                      )}
                    </div>

                    {/* Dynamic description / content only (static placeholder removed) */}
                    {(currentMedia?.content || currentMedia?.description) && (
                      <p className={styles.lessonParagraph}>
                        {currentMedia.content || currentMedia.description}
                      </p>
                    )}

                    {/* Part / Module Navigation Row */}
                    <div className={styles.lessonNavigationRow}>
                      {activeLessonIndex > 0 ? (
                        <button
                          type="button"
                          onClick={() => setSelectedMediaId(allLessons[activeLessonIndex - 1].id)}
                          className={styles.btnSecondaryOutline}
                        >
                          &larr; Previous Part ({allLessons[activeLessonIndex - 1].title})
                        </button>
                      ) : (
                        <span />
                      )}

                      {nextLesson ? (
                        <button
                          type="button"
                          disabled={!lessonProgress[currentMedia?.id]?.isCompleted}
                          onClick={() => setSelectedMediaId(nextLesson.id)}
                          className={styles.btnPrimaryOrange}
                          style={{
                            opacity: !lessonProgress[currentMedia?.id]?.isCompleted ? 0.6 : 1,
                            cursor: !lessonProgress[currentMedia?.id]?.isCompleted ? "not-allowed" : "pointer",
                          }}
                        >
                          Next Part ({nextLesson.title}) &rarr;
                        </button>
                      ) : step?.quiz ? (
                        <button
                          type="button"
                          onClick={() => setActiveTab("quiz")}
                          className={styles.btnPrimaryOrange}
                        >
                          Take Module Quiz &rarr;
                        </button>
                      ) : nextStep && nextStepId ? (
                        <button
                          type="button"
                          onClick={() => router.push(`/steps/${nextStepId}`)}
                          className={styles.btnPrimaryOrange}
                        >
                          Next Module ({nextStep.title}) &rarr;
                        </button>
                      ) : (
                        <Link
                          href={`/programs/${step?.programId}/steps`}
                          className={styles.btnPrimaryOrange}
                        >
                          Course Roadmap &rarr;
                        </Link>
                      )}
                    </div>

                    {/* Dynamic Learning Objectives only (static placeholder removed) */}
                    {Array.isArray((step as any)?.learningObjectives) && (step as any).learningObjectives.length > 0 && (
                      <div className={styles.objectivesBox}>
                        <h5 className={styles.objectivesTitle}>Learning Objectives</h5>
                        <ul className={styles.objectivesList}>
                          {(step as any).learningObjectives.map((obj: string, i: number) => (
                            <li key={i} className={styles.objectiveItem}>
                              <span className={styles.objectiveIcon}>✓</span>
                              <span>{obj}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Personal Notes Widget & About Step Card */}
              <div className={styles.notesRightCol}>
                {/* Notes & Highlights Card */}
                <div className={styles.notesCompanionCard}>
                  <div className={styles.notesCompanionHeader}>
                    <h4 className={styles.notesCompanionTitle}>My Notes &amp; Highlights</h4>
                    <span className={styles.notesCompanionMeta}>
                      Personal • Private to you • {notes.length} saved
                    </span>
                  </div>

                  <textarea
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value.slice(0, 5000))}
                    placeholder="Write your notes, key takeaways, or action items from this lesson..."
                    className={styles.noteTextarea}
                  />

                  <div className={styles.noteToolbarRow}>
                    <div className={styles.noteToolsGroup}>
                      <button
                        type="button"
                        onClick={() => setNoteInput((prev) => prev ? `**${prev}**` : "**Key takeaway:** ")}
                        className={styles.noteToolBtn}
                        title="Bold"
                      >
                        B
                      </button>
                      <button
                        type="button"
                        onClick={() => setNoteInput((prev) => prev ? `*${prev}*` : "*Important note:* ")}
                        className={styles.noteToolBtn}
                        title="Italic"
                      >
                        I
                      </button>
                      <button
                        type="button"
                        onClick={() => setNoteInput((prev) => `${prev}\n• `)}
                        className={styles.noteToolBtn}
                        title="List bullet"
                      >
                        • List
                      </button>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: "0.72rem", color: "#a8a29e" }}>
                        {noteInput.length}/5000
                      </span>
                      <button
                        type="button"
                        onClick={handleSaveNote}
                        disabled={!noteInput.trim() || isSavingNote}
                        className={styles.btnPrimaryOrange}
                        style={{ padding: "0.4rem 0.85rem", fontSize: "0.8rem" }}
                      >
                        {isSavingNote ? "Saving..." : "Save Note"}
                      </button>
                    </div>
                  </div>

                  {/* Saved Notes Feed */}
                  {notes.length > 0 && (
                    <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: 8, maxHeight: 220, overflowY: "auto" }}>
                      {notes.map((n) => (
                        <div
                          key={n.id}
                          style={{
                            background: "#faf7f2",
                            border: "1px solid #ece6dd",
                            borderRadius: 8,
                            padding: "0.6rem 0.75rem",
                            fontSize: "0.82rem",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                            <strong style={{ fontSize: "0.82rem", color: "#1c1917" }}>
                              {n.step?.title || `${step?.title || "Lesson"} Note`}
                            </strong>
                            <button
                              type="button"
                              onClick={() => handleDeleteNote(n.id)}
                              style={{ background: "transparent", border: "none", color: "#dc2626", cursor: "pointer", fontSize: "0.8rem" }}
                            >
                              ✕
                            </button>
                          </div>
                          <p style={{ margin: 0, color: "#57534e", lineHeight: 1.4 }}>{n.noteText}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* About this step card */}
                <div className={styles.aboutStepCard}>
                  <h4 className={styles.aboutStepTitle}>About this step</h4>
                  <p className={styles.aboutStepText}>
                    Sequential progression is monitored live by the server engine.
                  </p>
                  <div style={{ fontSize: "0.78rem", color: "#78716c", display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                    <span>• Step Sequence: #{step?.sequence}</span>
                    <span>• Knowledge Check: Pass mark 75%</span>
                    <span>• Watermark protection active for learner session</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: KNOWLEDGE CHECK QUIZ (SCREEN 4) */}
          {activeTab === "quiz" && (
            <div>
              <div className={styles.knowledgeCheckBanner}>
                <span className={styles.knowledgeCheckIcon}>🛡️</span>
                <div>
                  <h4 className={styles.knowledgeCheckText}>
                    Knowledge Check • Pass mark: 75% • {quizQuestions.length} questions • Multiple attempts allowed
                  </h4>
                  <span style={{ fontSize: "0.78rem", color: "#4338ca" }}>
                    Answer all questions sequentially and submit to verify module comprehension.
                  </span>
                </div>
              </div>

              {quizError && (
                <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: "0.86rem" }}>
                  {quizError}
                </div>
              )}

              {lastQuizResult && (
                <div
                  style={{
                    background: lastQuizResult.passed ? "#dcfce7" : "#fee2e2",
                    border: `1px solid ${lastQuizResult.passed ? "#86efac" : "#fca5a5"}`,
                    color: lastQuizResult.passed ? "#14532d" : "#7f1d1d",
                    padding: "16px 20px",
                    borderRadius: 12,
                    marginBottom: 20,
                  }}
                >
                  <h4 style={{ margin: "0 0 6px", fontSize: "1.05rem", fontWeight: 700 }}>
                    {lastQuizResult.passed ? "✓ Assessment Passed!" : "Assessment Not Passed Yet"}
                  </h4>
                  <p style={{ margin: "0 0 12px", fontSize: "0.88rem" }}>
                    Score: {lastQuizResult.score}% (Pass threshold: 75%).
                    {lastQuizResult.passed
                      ? " Great job! Your progress has been updated and the next module is unlocked."
                      : " Review the video lessons and try again."}
                  </p>
                  {lastQuizResult.passed && nextStep && nextStepId && (
                    <button
                      type="button"
                      onClick={() => router.push(`/steps/${nextStepId}`)}
                      className={styles.btnPrimaryOrange}
                      style={{ padding: "10px 20px", fontSize: "0.88rem" }}
                    >
                      Continue to Next Module ({nextStep.title}) &rarr;
                    </button>
                  )}
                  {lastQuizResult.passed && !nextStep && (
                    <Link
                      href={`/programs/${step?.programId}/steps`}
                      className={styles.btnPrimaryOrange}
                      style={{ padding: "10px 20px", fontSize: "0.88rem", display: "inline-block", textDecoration: "none" }}
                    >
                      Return to Learning Path &rarr;
                    </Link>
                  )}
                </div>
              )}

              <div className={styles.quizGrid}>
                {/* Left Column: Question Card */}
                <div className={styles.questionCard}>
                  <div className={styles.questionNumberLabel}>
                    Question {activeQuizIndex + 1} of {quizQuestions.length}
                  </div>
                  <h3 className={styles.questionPrompt}>
                    {currentQuizQuestion.text}
                  </h3>

                  <div className={styles.optionsStack}>
                    {(currentQuizQuestion.options || []).map((opt: any, optIdx: number) => {
                      const isSelected = quizAnswers[currentQuizQuestion.id] === opt.id;
                      return (
                        <div
                          key={opt.id || optIdx}
                          onClick={() =>
                            setQuizAnswers((prev) => ({
                              ...prev,
                              [currentQuizQuestion.id]: opt.id,
                            }))
                          }
                          className={`${styles.optionCard} ${isSelected ? styles.optionCardSelected : ""}`}
                        >
                          <div className={styles.optionRadioCircle}>
                            {isSelected && <div className={styles.optionRadioInnerDot} />}
                          </div>
                          <span className={styles.optionText}>{opt.text}</span>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <button
                      type="button"
                      disabled={activeQuizIndex === 0}
                      onClick={() => setActiveQuizIndex((prev) => Math.max(0, prev - 1))}
                      className={styles.btnSecondaryOutline}
                      style={{ opacity: activeQuizIndex === 0 ? 0.5 : 1 }}
                    >
                      &larr; Previous Question
                    </button>

                    {activeQuizIndex < quizQuestions.length - 1 ? (
                      <button
                        type="button"
                        onClick={() => setActiveQuizIndex((prev) => prev + 1)}
                        className={styles.btnPrimaryOrange}
                      >
                        Next Question &rarr;
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isSubmittingQuiz}
                        onClick={handleQuizSubmit}
                        className={styles.btnPrimaryOrange}
                      >
                        {isSubmittingQuiz ? "Submitting..." : "Submit Quiz"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Right Column: Question Numbers Grid */}
                <div className={styles.questionNavCard}>
                  <h4 className={styles.questionNavTitle}>Questions</h4>
                  <div className={styles.questionNumGrid}>
                    {quizQuestions.map((q, idx) => {
                      const isCurrent = idx === activeQuizIndex;
                      const isAnswered = !!quizAnswers[q.id];
                      return (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => setActiveQuizIndex(idx)}
                          className={`${styles.qNumCircle} ${
                            isCurrent
                              ? styles.qNumCurrent
                              : isAnswered
                              ? styles.qNumAnswered
                              : ""
                          }`}
                        >
                          {idx + 1}
                        </button>
                      );
                    })}
                  </div>

                  <div className={styles.quizLegend}>
                    <div className={styles.legendItem}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#d97706" }} />
                      <span>Current</span>
                    </div>
                    <div className={styles.legendItem}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#1c1917" }} />
                      <span>Answered</span>
                    </div>
                    <div className={styles.legendItem}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#e5e7eb" }} />
                      <span>Not answered</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: DEDICATED NOTES MANAGER (SCREEN 5) */}
          {activeTab === "notes" && (
            <div className={styles.notesTabStack}>
              {/* Note Taking Card */}
              <div className={styles.noteEditorCard}>
                <textarea
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value.slice(0, 5000))}
                  placeholder="Write your notes, key takeaways, or action items from this module..."
                  className={styles.noteTextarea}
                  style={{ minHeight: 110 }}
                />
                <div className={styles.noteToolbarRow}>
                  <div className={styles.noteToolsGroup}>
                    <button
                      type="button"
                      onClick={() => setNoteInput((prev) => prev ? `**${prev}**` : "**Takeaway:** ")}
                      className={styles.noteToolBtn}
                    >
                      B
                    </button>
                    <button
                      type="button"
                      onClick={() => setNoteInput((prev) => prev ? `*${prev}*` : "*Note:* ")}
                      className={styles.noteToolBtn}
                    >
                      I
                    </button>
                    <button
                      type="button"
                      onClick={() => setNoteInput((prev) => `${prev}\n• `)}
                      className={styles.noteToolBtn}
                    >
                      • List
                    </button>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: "0.74rem", color: "#a8a29e" }}>{noteInput.length}/5000</span>
                    <button
                      type="button"
                      onClick={handleSaveNote}
                      disabled={!noteInput.trim() || isSavingNote}
                      className={styles.btnPrimaryOrange}
                    >
                      {isSavingNote ? "Saving..." : "Save Note"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Your Notes Feed */}
              <div>
                <div className={styles.yourNotesHeaderRow}>
                  <h3 className={styles.yourNotesCountTitle}>Your Notes ({notes.length})</h3>
                  <div className={styles.notesFilterGroup}>
                    <input
                      type="text"
                      placeholder="Search notes..."
                      value={notesSearch}
                      onChange={(e) => setNotesSearch(e.target.value)}
                      className={styles.searchInput}
                      style={{
                        background: "#ffffff",
                        border: "1px solid #ece6dd",
                        borderRadius: 8,
                        padding: "6px 12px",
                        width: 180,
                      }}
                    />
                  </div>
                </div>

                <div className={styles.notesListStack} style={{ marginTop: "1rem" }}>
                  {notes
                    .filter((n) =>
                      n.noteText.toLowerCase().includes(notesSearch.toLowerCase())
                    )
                    .map((n) => (
                      <div key={n.id} className={styles.savedNoteCard}>
                        <div className={styles.savedNoteLeft}>
                          <div className={styles.noteIconSquare}>📝</div>
                          <div className={styles.savedNoteContent}>
                            <h4 className={styles.savedNoteTitle}>{n.step?.title || `${step?.title || "Lesson"} Note`}</h4>
                            <p className={styles.savedNoteBody}>{n.noteText}</p>
                            <span className={styles.savedNoteTime}>
                              {new Date(n.createdAt).toLocaleDateString(undefined, {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                            </span>
                          </div>
                        </div>

                        <div className={styles.savedNoteActions}>
                          <button
                            type="button"
                            onClick={() => handleDeleteNote(n.id)}
                            className={`${styles.actionIconBtn} ${styles.actionIconBtnDelete}`}
                            title="Delete note"
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                    ))}

                  {notes.length === 0 && (
                    <div className={styles.emptyStateCard}>
                      <h4 style={{ margin: "0 0 4px" }}>No notes yet</h4>
                      <p style={{ margin: 0, fontSize: "0.85rem" }}>
                        Start typing above to record key insights from this module.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: LEARNING MATERIALS (SCREEN 6) */}
          {activeTab === "materials" && (
            <div className={styles.materialsTabStack}>
              <div className={styles.materialsSearchCard}>
                <div className={styles.searchBarContainer}>
                  <span>🔍</span>
                  <input
                    type="text"
                    placeholder="Search materials..."
                    value={materialsSearch}
                    onChange={(e) => setMaterialsSearch(e.target.value)}
                    className={styles.searchInput}
                  />
                </div>
              </div>

              <div className={styles.materialsListStack}>
                {[
                  { id: "mat-1", title: `${step?.title || "Module"} - Slides`, type: "PDF", size: "2.1 MB" },
                  { id: "mat-2", title: "Exercise & Framework Files", type: "ZIP", size: "8.4 MB" },
                  { id: "mat-3", title: "Reference Implementation Guide", type: "PDF", size: "1.8 MB" },
                  { id: "mat-4", title: "Executive Cheat Sheet & Formulas", type: "PDF", size: "1.2 MB" },
                ]
                  .filter((m) => m.title.toLowerCase().includes(materialsSearch.toLowerCase()))
                  .map((m) => (
                    <div key={m.id} className={styles.materialRowCard}>
                      <div className={styles.materialLeftGroup}>
                        <div
                          className={`${styles.materialTypeBadge} ${
                            m.type === "PDF"
                              ? styles.badgePdf
                              : m.type === "ZIP"
                              ? styles.badgeZip
                              : styles.badgeGeneric
                          }`}
                        >
                          {m.type}
                        </div>
                        <div>
                          <h4 className={styles.materialTitle}>{m.title}</h4>
                          <span className={styles.materialMeta}>{m.type} • {m.size}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => alert(`Downloading ${m.title}...`)}
                        className={styles.btnSecondaryOutline}
                      >
                        &darr; Download
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* TAB 5: DISCUSSIONS (SCREEN 8) */}
          {activeTab === "discussions" && (
            <div className={styles.discussionsTabStack}>
              {/* Post Composer */}
              <div className={styles.discussionComposerCard}>
                <textarea
                  value={newPostContent}
                  onChange={(e) => setNewPostContent(e.target.value)}
                  placeholder="Ask a question or share your thoughts about this lesson..."
                  className={styles.discussionComposerTextarea}
                />
                <div className={styles.discussionComposerFooter}>
                  <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
                    Visible to your cohort &amp; instructors
                  </span>
                  <button
                    type="button"
                    disabled={!newPostContent.trim()}
                    onClick={() => {
                      if (!newPostContent.trim()) return;
                      const newPost = {
                        id: `disc-${Date.now()}`,
                        author: userName || "Sahyadri",
                        avatar: (userName?.trim()?.charAt(0) || "S").toUpperCase(),
                        time: "Just now",
                        content: newPostContent.trim(),
                        likes: 0,
                        isLiked: false,
                        replies: [],
                      };
                      setDiscussions((prev) => [newPost, ...prev]);
                      setNewPostContent("");
                    }}
                    className={styles.btnPrimaryOrange}
                  >
                    Post Discussion
                  </button>
                </div>
              </div>

              {/* Filters & Search Row */}
              <div className={styles.discussionFiltersRow}>
                <div className={styles.discussionFilterTabs}>
                  <button
                    type="button"
                    onClick={() => setDiscussionFilter("all")}
                    className={`${styles.discussionFilterTab} ${discussionFilter === "all" ? styles.discussionFilterTabActive : ""}`}
                  >
                    All Posts ({discussions.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscussionFilter("my")}
                    className={`${styles.discussionFilterTab} ${discussionFilter === "my" ? styles.discussionFilterTabActive : ""}`}
                  >
                    My Posts
                  </button>
                </div>

                <div className={styles.searchBarContainer} style={{ maxWidth: 240, margin: 0 }}>
                  <span>🔍</span>
                  <input
                    type="text"
                    placeholder="Search discussions..."
                    value={discussionSearch}
                    onChange={(e) => setDiscussionSearch(e.target.value)}
                    className={styles.searchInput}
                  />
                </div>
              </div>

              {/* Discussion Thread Cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {discussions
                  .filter((d) => {
                    if (discussionFilter === "my") {
                      return d.author.toLowerCase().includes((userName || "sahyadri").toLowerCase());
                    }
                    return true;
                  })
                  .filter((d) =>
                    d.content.toLowerCase().includes(discussionSearch.toLowerCase()) ||
                    d.author.toLowerCase().includes(discussionSearch.toLowerCase())
                  )
                  .map((d) => (
                    <article key={d.id} className={styles.discussionThreadCard}>
                      <div className={styles.discussionCardHeader}>
                        <div className={styles.discussionAuthorAvatar}>
                          {d.avatar}
                        </div>
                        <div className={styles.discussionAuthorInfo}>
                          <h4 className={styles.discussionAuthorName}>{d.author}</h4>
                          <span className={styles.discussionTime}>{d.time}</span>
                        </div>
                      </div>

                      <p className={styles.discussionBody}>{d.content}</p>

                      <div className={styles.discussionActionsRow}>
                        <button
                          type="button"
                          onClick={() => {
                            setDiscussions((prev) =>
                              prev.map((item) =>
                                item.id === d.id
                                  ? {
                                      ...item,
                                      likes: item.isLiked ? item.likes - 1 : item.likes + 1,
                                      isLiked: !item.isLiked,
                                    }
                                  : item
                              )
                            );
                          }}
                          className={styles.discussionActionBtn}
                          style={{ color: d.isLiked ? "#d36b00" : undefined, fontWeight: d.isLiked ? 700 : undefined }}
                        >
                          <span>👍</span>
                          <span>{d.likes} {d.likes === 1 ? "like" : "likes"}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setReplyInputId(replyInputId === d.id ? null : d.id)}
                          className={styles.discussionActionBtn}
                        >
                          <span>💬</span>
                          <span>{d.replies.length} {d.replies.length === 1 ? "reply" : "replies"}</span>
                        </button>
                      </div>

                      {/* Indented Replies */}
                      {d.replies.length > 0 && (
                        <div className={styles.discussionRepliesList}>
                          {d.replies.map((r) => (
                            <div key={r.id} className={styles.discussionReplyItem}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                <span
                                  style={{
                                    width: 22,
                                    height: 22,
                                    borderRadius: "50%",
                                    background: "#fde8d0",
                                    color: "#d36b00",
                                    fontSize: "0.72rem",
                                    fontWeight: 800,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                >
                                  {r.avatar}
                                </span>
                                <strong style={{ fontSize: "0.82rem", color: "#18181b" }}>{r.author}</strong>
                                <span style={{ fontSize: "0.72rem", color: "#64748b" }}>• {r.time}</span>
                              </div>
                              <p style={{ margin: 0, fontSize: "0.84rem", color: "#374151", lineHeight: 1.45 }}>
                                {r.content}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Reply Input Box */}
                      {replyInputId === d.id && (
                        <div className={styles.discussionReplyInputRow}>
                          <input
                            type="text"
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Write a reply..."
                            className={styles.searchInput}
                            style={{ flex: 1, background: "#faf7f2", border: "1px solid #ece6dd", borderRadius: 8, padding: "8px 12px" }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && replyText.trim()) {
                                const newReply = {
                                  id: `rep-${Date.now()}`,
                                  author: userName || "Sahyadri",
                                  avatar: (userName?.trim()?.charAt(0) || "S").toUpperCase(),
                                  time: "Just now",
                                  content: replyText.trim(),
                                };
                                setDiscussions((prev) =>
                                  prev.map((item) =>
                                    item.id === d.id
                                      ? { ...item, replies: [...item.replies, newReply] }
                                      : item
                                  )
                                );
                                setReplyText("");
                                setReplyInputId(null);
                              }
                            }}
                          />
                          <button
                            type="button"
                            disabled={!replyText.trim()}
                            onClick={() => {
                              if (!replyText.trim()) return;
                              const newReply = {
                                id: `rep-${Date.now()}`,
                                author: userName || "Sahyadri",
                                avatar: (userName?.trim()?.charAt(0) || "S").toUpperCase(),
                                time: "Just now",
                                content: replyText.trim(),
                              };
                              setDiscussions((prev) =>
                                prev.map((item) =>
                                  item.id === d.id
                                    ? { ...item, replies: [...item.replies, newReply] }
                                    : item
                                )
                              );
                              setReplyText("");
                              setReplyInputId(null);
                            }}
                            className={styles.btnPrimaryOrange}
                            style={{ padding: "6px 14px", fontSize: "0.8rem" }}
                          >
                            Reply
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
              </div>
            </div>
          )}

          {/* Persistent Workspace Footer Navigation */}
          <div className={styles.moduleFooterNav} style={{ marginTop: "2rem" }}>
            {prevStep ? (
              <Link href={`/steps/${prevStep.stepId || prevStep.id}`} className={styles.btnSecondaryOutline}>
                &larr; Previous Module
              </Link>
            ) : (
              <span />
            )}
            {nextStep && nextStepId ? (
              <button
                type="button"
                onClick={() => router.push(`/steps/${nextStepId}`)}
                className={styles.btnPrimaryOrange}
                style={{
                  background: isStepCompleted ? "#d97706" : "#fef3c7",
                  color: isStepCompleted ? "#ffffff" : "#b45309",
                  borderColor: isStepCompleted ? "#d97706" : "#fde68a",
                }}
              >
                Next Module ({nextStep.title}) &rarr;
              </button>
            ) : (
              <Link href={`/programs/${step?.programId}/steps`} className={styles.btnPrimaryOrange}>
                Course Roadmap &rarr;
              </Link>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          SCREEN 8: CELEBRATION MODAL (Lesson / Module Completed!)
          ===================================================================== */}
      {isCelebrationOpen && (
        <div className={styles.celebrationModalBackdrop}>
          <div className={styles.celebrationModalCard}>
            <div className={styles.confettiWrapper}>
              <div className={styles.celebrationCheckCircle}>✓</div>
            </div>

            {celebrationMode === "module" ? (
              <>
                <h2 className={styles.celebrationHeading}>
                  {lastQuizResult?.passed ? "Assessment Passed & Module Complete!" : "Module Completed!"}
                </h2>
                <p className={styles.celebrationSubtitle}>
                  {lastQuizResult?.passed
                    ? `Great score of ${lastQuizResult.score}%! You have completed all requirements for Step ${step?.sequence}: ${step?.title}.`
                    : `You have successfully completed all lessons in Step ${step?.sequence}: ${step?.title}!`}
                </p>

                {nextStep && nextStepId ? (
                  <div style={{ marginTop: "1.25rem", display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
                    {redirectCountdown !== null && (
                      <div className={styles.countdownBadge}>
                        ⏱ Redirecting to next module in {redirectCountdown}s...
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => {
                          setRedirectCountdown(null);
                          setIsCelebrationOpen(false);
                        }}
                        className={styles.btnSecondaryOutline}
                      >
                        Stay on this Module
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRedirectCountdown(null);
                          setIsCelebrationOpen(false);
                          router.push(`/steps/${nextStepId}`);
                        }}
                        className={styles.btnPrimaryOrange}
                      >
                        Continue to Next Module ({nextStep.title}) &rarr;
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: "1.25rem" }}>
                    <p style={{ color: "#15803d", fontWeight: 700, marginBottom: 12 }}>
                      🎓 Congratulations! You have finished all steps in this course!
                    </p>
                    <Link
                      href={`/programs/${step?.programId}/steps`}
                      className={styles.btnPrimaryOrange}
                      onClick={() => setIsCelebrationOpen(false)}
                    >
                      View Learning Path Roadmap &rarr;
                    </Link>
                  </div>
                )}
              </>
            ) : (
              <>
                <h2 className={styles.celebrationHeading}>Lesson Part Completed!</h2>
                <p className={styles.celebrationSubtitle}>
                  You've completed: {currentMedia?.title || "Lesson Part"}
                </p>

                <div className={styles.celebrationButtonsRow}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCelebrationOpen(false);
                      if (videoRef.current) {
                        videoRef.current.currentTime = 0;
                        videoRef.current.play().catch(() => {});
                      }
                    }}
                    className={styles.btnSecondaryOutline}
                  >
                    Rewatch Part
                  </button>
                  {step?.quiz && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsCelebrationOpen(false);
                        setActiveTab("quiz");
                      }}
                      className={styles.btnPrimaryOrange}
                    >
                      Take Quiz
                    </button>
                  )}
                </div>

                {nextLesson && (
                  <div className={styles.nextUpLessonBox}>
                    <div className={styles.nextUpLeft}>
                      <span style={{ fontSize: "1.3rem", color: "#d97706" }}>▶</span>
                      <div>
                        <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "#d97706", textTransform: "uppercase" }}>
                          Next Up (Part {activeLessonIndex + 2})
                        </span>
                        <strong style={{ display: "block", fontSize: "0.88rem", color: "#1c1917" }}>
                          {nextLesson.title}
                        </strong>
                        <span style={{ fontSize: "0.76rem", color: "#78716c" }}>
                          {nextLesson.durationSec ? `${Math.ceil(nextLesson.durationSec / 60)} min` : "15 min"} • Video
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCelebrationOpen(false);
                        setSelectedMediaId(nextLesson.id);
                        setActiveTab("video");
                      }}
                      className={styles.btnPrimaryOrange}
                    >
                      Start Part {activeLessonIndex + 2} &rarr;
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          SCREEN 9: SLIDE-OVER MODULE LESSON DRAWER
          ===================================================================== */}
      {isDrawerOpen && (
        <>
          <div className={styles.drawerBackdrop} onClick={() => setIsDrawerOpen(false)} />
          <aside className={styles.slideOverDrawer} aria-label="Module Lessons Drawer">
            <div className={styles.drawerHeader}>
              <div>
                <h3 className={styles.drawerTitle}>Step {step?.sequence}: {step?.title}</h3>
                <span className={styles.drawerSubtitle}>
                  {completedLessonsCount} of {totalLessonsCount} lessons completed
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className={styles.drawerCloseBtn}
                title="Close Drawer"
              >
                ✕
              </button>
            </div>

            <div className={styles.drawerProgressBar}>
              <div className={styles.moduleProgressFill} style={{ width: `${calculatedStepPercent}%` }} />
            </div>

            <div className={styles.drawerLessonList}>
              {allLessons.map((l: any, idx: number) => {
                const isDone = lessonProgress[l.id]?.isCompleted || lessonProgress[l.id]?.viewed;
                const isCurrent = currentMedia?.id === l.id;
                const isLocked = idx > 0 && !lessonProgress[allLessons[idx - 1]?.id]?.isCompleted && !isDone;

                return (
                  <div
                    key={l.id}
                    onClick={() => {
                      if (!isLocked) {
                        setSelectedMediaId(l.id);
                        setViewMode("workspace");
                        setActiveTab("video");
                        setIsDrawerOpen(false);
                      }
                    }}
                    className={`${styles.lessonCardRow} ${isCurrent ? styles.lessonCardActive : ""}`}
                    style={{ padding: "0.75rem 1rem", cursor: isLocked ? "not-allowed" : "pointer", opacity: isLocked ? 0.6 : 1 }}
                  >
                    <div className={styles.lessonCardLeft}>
                      <div
                        className={`${styles.lessonPlayCircle} ${
                          isDone
                            ? styles.lessonPlayCircleDone
                            : isCurrent
                            ? styles.lessonPlayCircleActive
                            : styles.lessonPlayCircleLocked
                        }`}
                        style={{ width: 30, height: 30, fontSize: "0.75rem" }}
                      >
                        {isDone ? "✓" : "▶"}
                      </div>
                      <div className={styles.lessonTitleMeta}>
                        <h5 className={styles.lessonRowTitle} style={{ fontSize: "0.85rem" }}>{l.title}</h5>
                        <span className={styles.lessonRowMeta} style={{ fontSize: "0.74rem" }}>
                          {l.durationSec ? `${Math.ceil(l.durationSec / 60)} min` : "15 min"}
                        </span>
                      </div>
                    </div>

                    <div>
                      {isDone ? (
                        <span className={styles.lessonDoneCheck} style={{ fontSize: "0.95rem" }}>✓</span>
                      ) : isCurrent ? (
                        <span style={{ color: "#d97706", fontSize: "0.85rem" }}>▶</span>
                      ) : isLocked ? (
                        <span style={{ color: "#9ca3af", fontSize: "0.85rem" }}>🔒</span>
                      ) : (
                        <span style={{ color: "#d97706", fontSize: "0.78rem", fontWeight: 700 }}>Open</span>
                      )}
                    </div>
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
