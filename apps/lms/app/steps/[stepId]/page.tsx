"use client";

import { useEffect, useState, use, useCallback, useRef, useMemo } from "react";
import styles from "./step.module.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  API_URL,
  cachedFetch,
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
import PdfViewerModal from "./components/PdfViewerModal";
import StepLoading from "./loading";
import {
  getLocalVideoResume,
  isLocalLessonCompleted,
  saveLocalLessonCompletion,
} from "./videoPlayerLogic";

export type WorkspaceTab = "video" | "quiz" | "notes" | "materials";

const ArrowLeft = (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);


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

function resolveMediaDownloadUrl(rawUrl?: string | null): string {
  if (!rawUrl) return "";
  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://") || rawUrl.startsWith("/")) {
    return rawUrl;
  }
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const isUpload = rawUrl.startsWith("upload:");
  const rawKey = isUpload ? rawUrl.replace("upload:", "") : rawUrl;
  return `${API_URL}/media/stream/${rawKey}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
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

  const [activeTab, setActiveTab] = useState<WorkspaceTab>("video");
  const [viewMode, setViewMode] = useState<"overview" | "workspace">("workspace");

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
  const [viewerPdf, setViewerPdf] = useState<{
    isOpen: boolean;
    id: string;
    title: string;
    mediaUrl?: string | null;
    downloadUrl?: string | null;
  }>({
    isOpen: false,
    id: "",
    title: "",
  });

  const handleViewPdf = useCallback((material: { id: string; title: string; mediaUrl?: string | null }) => {
    const dlUrl = resolveMediaDownloadUrl(material.mediaUrl);
    setViewerPdf({
      isOpen: true,
      id: material.id,
      title: material.title,
      mediaUrl: material.mediaUrl,
      downloadUrl: dlUrl,
    });
  }, []);


  // Quiz state
  const [activeQuizIndex, setActiveQuizIndex] = useState(0);
  const [attemptQuestions, setAttemptQuestions] = useState<QuizQuestion[] | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [isSubmittingQuiz, setIsSubmittingQuiz] = useState(false);
  const [isStartingQuiz, setIsStartingQuiz] = useState(false);
  const [lastQuizResult, setLastQuizResult] = useState<any>(null);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [activeAttemptId, setActiveAttemptId] = useState<string | null>(null);
  const isStartingQuizRef = useRef<boolean>(false);
  const hasAttemptedQuizStartRef = useRef<Record<string, boolean>>({});

  // User state
  const [userName, setUserName] = useState<string>("Learner");
  const [userEmail, setUserEmail] = useState<string>("learner@whatboutme.com");
  const isFetchingRef = useRef<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isHeartbeatInFlightRef = useRef<boolean>(false);
  const lastEndedSentTimeRef = useRef<Record<string, number>>({});
  const [recheckCount, setRecheckCount] = useState<number>(0);
  const [isRecheckingUnlock, setIsRecheckingUnlock] = useState<boolean>(false);

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

      // Restore any in-progress step quiz answers and question index on page refresh
      try {
        const savedQuizRaw = localStorage.getItem(`wbm_step_quiz_${stepId}`);
        if (savedQuizRaw) {
          const parsedQuiz = JSON.parse(savedQuizRaw);
          if (parsedQuiz && typeof parsedQuiz === "object") {
            if (parsedQuiz.quizAnswers && typeof parsedQuiz.quizAnswers === "object") {
              setQuizAnswers(parsedQuiz.quizAnswers);
            }
            if (typeof parsedQuiz.activeQuizIndex === "number" && parsedQuiz.activeQuizIndex >= 0) {
              setActiveQuizIndex(parsedQuiz.activeQuizIndex);
            }
            if (!paramTab && parsedQuiz.activeTab === "quiz") {
              setActiveTab("quiz");
              setViewMode("workspace");
            }
          }
        }
      } catch (e) {}
    }
  }, [stepId]);

  // Persist step quiz answers and active question index to localStorage so refresh resumes seamlessly
  useEffect(() => {
    if (typeof window === "undefined" || !stepId) return;
    try {
      if (Object.keys(quizAnswers).length > 0 || (activeTab === "quiz" && activeQuizIndex > 0)) {
        localStorage.setItem(
          `wbm_step_quiz_${stepId}`,
          JSON.stringify({
            quizAnswers,
            activeQuizIndex,
            activeTab,
            updatedAt: Date.now(),
          }),
        );
      }
    } catch (e) {}
  }, [stepId, quizAnswers, activeQuizIndex, activeTab]);

  // 2. Fetch Step & Progression with automatic retry & cache resilience
  const fetchStepAndProgression = useCallback(async (isRetry = false, forceFresh = false) => {
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
      const stepRes = await cachedFetch(`${API_URL}/programs/steps/${stepId}`, {
        headers: getAuthHeaders(),
        ttlMs: forceFresh ? 0 : 15_000,
        skipCache: forceFresh,
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
        ? cachedFetch(`${API_URL}/progression/me/${stepData.programId}`, {
            headers: getAuthHeaders(),
            ttlMs: forceFresh ? 0 : 5_000,
            skipCache: forceFresh,
          })
        : Promise.resolve(null);

      const quizPromise = stepData.quiz?.id
        ? cachedFetch(`${API_URL}/quizzes/${stepData.quiz.id}/attempt`, {
            headers: getAuthHeaders(),
            ttlMs: forceFresh ? 0 : 5_000,
            skipCache: forceFresh,
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
          const localResume = getLocalVideoResume(l.lessonId);
          const isLocallyDone = isLocalLessonCompleted(l.lessonId);
          const isDone = Boolean(l.isCompleted || isLocallyDone);
          const effectivePos = Math.max(l.lastPositionSec || 0, localResume?.positionSec || 0);

          lpMap[l.lessonId] = {
            viewed: isDone,
            progressPercent: isDone ? 100 : (l.progressPercent || 0),
            lastPositionSec: effectivePos,
            completedAt: l.completedAt,
            durationSec: l.durationSec,
            isCompleted: isDone,
          };
        }
        setLessonProgress(lpMap);

        // Automatic Server Completion Reconciliation:
        // If a lesson was finished locally but server missed it (e.g. dropped connection during reload),
        // reconcile completion with server so database records and next step unlocks stay 100% in sync
        const missingOnServer = stepProgItem.lessons.filter(
          (l: any) => !l.isCompleted && isLocalLessonCompleted(l.lessonId)
        );
        if (missingOnServer.length > 0) {
          void (async () => {
            try {
              for (const ml of missingOnServer) {
                const dur = ml.durationSec || 8;
                await fetch(`${API_URL}/progress/lessons/${ml.lessonId}/heartbeat`, {
                  method: "POST",
                  headers: getAuthHeaders(),
                  body: JSON.stringify({
                    positionSec: dur,
                    fromSec: 0,
                    toSec: dur,
                    videoDurationSec: dur,
                    isEnded: true,
                    deltaWatchedSec: dur,
                    timestamp: Date.now(),
                  }),
                });
              }
              invalidateCache("/progression");
              invalidateCache("/progress");
            } catch (syncErr) {
              console.warn("Completion reconciliation error:", syncErr);
            }
          })();
        }
      } else if (Array.isArray(stepData.lessons) && stepData.lessons.length > 0) {
        try {
          await Promise.all(
            stepData.lessons.map(async (l: any) => {
              const lpRes = await cachedFetch(`${API_URL}/progress/lessons/${l.id}`, {
                headers: getAuthHeaders(),
                ttlMs: 15_000,
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
              if (Array.isArray(attemptData.questions) && attemptData.questions.length > 0) {
                setAttemptQuestions(attemptData.questions);
              }
              if (attemptData.status === "IN_PROGRESS") {
                setActiveAttemptId(attemptData.attemptId || attemptData.id || null);
              } else if (attemptData.score !== undefined && attemptData.status !== "IN_PROGRESS") {
                setActiveAttemptId(null);
                setLastQuizResult(attemptData);
              }
            }
          }
        } catch (e) {}
      }
    } catch (err: any) {
      console.error(err);
      if (!isRetry && (err.name === "TypeError" || err.message?.includes("fetch") || err.message?.includes("network"))) {
        isFetchingRef.current = false;
        setTimeout(() => {
          fetchStepAndProgression(true);
        }, 1200);
        return;
      }
      setStep((currentStep: any) => {
        if (!currentStep) {
          setLoadError(
            err.message?.includes("fetch")
              ? "Connecting to learning server... The server was temporarily reconnecting. Please click Retry Loading below."
              : (err.message || "Failed to load step information")
          );
        }
        return currentStep;
      });
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

  // Determine Current Step Progression & Quiz Unlocked Status
  const currentStepProg = progression?.steps?.find((s: any) => s.stepId === stepId);
  const isStepUnlocked = currentStepProg ? currentStepProg.isUnlocked : true;

  // Auto-recheck unlocked status if user lands on locked step right after previous module
  useEffect(() => {
    if (!step || isStepUnlocked || !currentStepProg) return;
    if (currentStepProg.lockReason !== "PREVIOUS_STEP_INCOMPLETE") return;
    if (recheckCount >= 6) return;

    const delay = recheckCount === 0 ? 1000 : 1500;
    const timer = setTimeout(async () => {
      setIsRecheckingUnlock(true);
      invalidateCache();
      isFetchingRef.current = false;
      await fetchStepAndProgression(false, true);
      setIsRecheckingUnlock(false);
      setRecheckCount((prev) => prev + 1);
    }, delay);

    return () => clearTimeout(timer);
  }, [step, isStepUnlocked, currentStepProg?.lockReason, recheckCount, fetchStepAndProgression]);

  const effectiveQuizPlacement =
    step?.quiz?.quizPlacement ||
    (step as any)?.quizPlacement ||
    (currentStepProg as any)?.quizPlacement ||
    "AFTER_VIDEO";

  const isManuallyUnlocked = (currentStepProg as any)?.overrideState === "MANUAL_UNLOCKED";
  const isQuizAlreadyPassed = Boolean(lastQuizResult?.passed || (currentStepProg as any)?.quiz?.isPassed);
  const mediaLessons = allLessons.filter((l: any) => l.type === "VIDEO" || l.type === "AUDIO" || !l.type);
  const areAllVideosDone =
    mediaLessons.length === 0 ||
    mediaLessons.every((l: any) => lessonProgress[l.id]?.isCompleted || lessonProgress[l.id]?.viewed);

  const isQuizUnlocked = Boolean(
    isManuallyUnlocked ||
    isQuizAlreadyPassed ||
    effectiveQuizPlacement === "BEFORE_VIDEO" ||
    areAllVideosDone
  );

  const hasQuiz = Boolean(step?.quiz && step.quiz.id);
  const stepMaterials = useMemo(() => {
    const list: Array<{
      id: string;
      title: string;
      type: string;
      mediaUrl?: string | null;
      size?: string | null;
      durationSec?: number | null;
    }> = [];

    // 1. Non-video/audio lessons (PDF, TEXT, LINK, etc.)
    for (const l of allLessons) {
      const t = (l.type || "").toUpperCase();
      if (t && t !== "VIDEO" && t !== "AUDIO") {
        list.push({
          id: l.id,
          title: l.title,
          type: t || "PDF",
          mediaUrl: l.mediaUrl || null,
          size: null,
          durationSec: l.durationSec || null,
        });
      }
    }

    // 2. Step resources
    if (Array.isArray(step?.resources)) {
      for (const r of step.resources) {
        if (!list.some((existing) => existing.id === r.id)) {
          let sizeStr: string | null = null;
          if (r.fileSize) {
            sizeStr =
              r.fileSize > 1048576
                ? `${(r.fileSize / 1048576).toFixed(1)} MB`
                : `${Math.round(r.fileSize / 1024)} KB`;
          }
          list.push({
            id: r.id,
            title: r.title,
            type: (r.type || "PDF").toUpperCase(),
            mediaUrl: r.mediaUrl,
            size: sizeStr,
            durationSec: null,
          });
        }
      }
    }

    // 3. Step resource items
    if (Array.isArray((step as any)?.resourceItems)) {
      for (const ri of (step as any).resourceItems) {
        if (!list.some((existing) => existing.id === ri.id)) {
          let sizeStr: string | null = null;
          if (ri.fileSizeBytes) {
            sizeStr =
              ri.fileSizeBytes > 1048576
                ? `${(ri.fileSizeBytes / 1048576).toFixed(1)} MB`
                : `${Math.round(ri.fileSizeBytes / 1024)} KB`;
          }
          list.push({
            id: ri.id,
            title: ri.title,
            type: (ri.type || "PDF").toUpperCase(),
            mediaUrl: ri.fileUrl || ri.mediaUrl,
            size: sizeStr,
            durationSec: null,
          });
        }
      }
    }

    return list;
  }, [allLessons, step?.resources, (step as any)?.resourceItems]);

  useEffect(() => {
    if (activeTab === "quiz" && !hasQuiz) {
      setActiveTab("video");
    } else if (activeTab === "materials" && stepMaterials.length === 0) {
      setActiveTab("video");
    }
  }, [activeTab, hasQuiz, stepMaterials.length]);

  // Proactively pre-warm quiz attempt in background when user views quiz tab AND quiz is unlocked
  useEffect(() => {
    const qId = step?.quiz?.id;
    if (
      activeTab === "quiz" &&
      isQuizUnlocked &&
      qId &&
      !activeAttemptId &&
      !lastQuizResult &&
      !hasAttemptedQuizStartRef.current[qId] &&
      !isStartingQuizRef.current
    ) {
      isStartingQuizRef.current = true;
      hasAttemptedQuizStartRef.current[qId] = true;
      fetch(`${API_URL}/quizzes/${qId}/start`, {
        method: "POST",
        headers: getAuthHeaders(),
      })
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            if (data?.attemptId || data?.id) {
              setActiveAttemptId(data.attemptId || data.id);
              if (Array.isArray(data.questions) && data.questions.length > 0) {
                setAttemptQuestions(data.questions);
              }
            }
          } else {
            const errData = await res.json().catch(() => null);
            if (errData?.message) {
              const msg = Array.isArray(errData.message) ? errData.message.join(", ") : errData.message;
              setQuizError(msg);
            }
          }
        })
        .catch(() => {})
        .finally(() => {
          isStartingQuizRef.current = false;
        });
    }
  }, [activeTab, isQuizUnlocked, step?.quiz?.id, activeAttemptId, lastQuizResult]);

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

  // Video Heartbeat with deduplication
  const sendMediaHeartbeat = useCallback(
    async (
      lessonId: string,
      positionSec: number,
      isEnded = false,
      videoDurationSec?: number,
      deltaWatchedSec?: number,
      fromSec?: number,
      toSec?: number,
    ) => {
      const now = Date.now();
      if (isEnded) {
        const lastSent = lastEndedSentTimeRef.current[lessonId] || 0;
        if (now - lastSent < 4000) return;
        lastEndedSentTimeRef.current[lessonId] = now;
      } else if (isHeartbeatInFlightRef.current) {
        return;
      }
      isHeartbeatInFlightRef.current = true;

      const sendHeartbeatAttempt = async (attempt = 0): Promise<void> => {
        try {
          const dur = videoDurationSec ?? Math.floor(videoRef.current?.duration || 0);
          const res = await fetch(`${API_URL}/progress/lessons/${lessonId}/heartbeat`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({
              positionSec,
              fromSec: fromSec ?? Math.max(0, positionSec - (deltaWatchedSec ?? 15)),
              toSec: toSec ?? positionSec,
              videoDurationSec: dur > 0 ? dur : undefined,
              isEnded,
              deltaWatchedSec,
              timestamp: Date.now(),
            }),
          });
          if (res.ok) {
            const data = await res.json();
            setLessonProgress((prev) => ({ ...prev, [lessonId]: { ...prev[lessonId], ...data } }));
            if (data.isCompleted || data.viewed || isEnded) {
              invalidateCache();
              void fetchStepAndProgression(false, true);
            }
          } else if (isEnded && attempt < 2) {
            setTimeout(() => sendHeartbeatAttempt(attempt + 1), 1000 * (attempt + 1));
          }
        } catch (err) {
          if (isEnded && attempt < 2) {
            setTimeout(() => sendHeartbeatAttempt(attempt + 1), 1000 * (attempt + 1));
          } else {
            console.warn("Heartbeat error:", err);
          }
        } finally {
          isHeartbeatInFlightRef.current = false;
        }
      };

      await sendHeartbeatAttempt(0);
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

  // Lesson Completion with 0ms Instant Optimistic Unlocking
  const handleLessonComplete = useCallback(
    (lessonId: string) => {
      // 1. Immediately persist locally (0ms lag)
      saveLocalLessonCompletion(lessonId);

      // 2. Immediately update local progress state
      setLessonProgress((prev) => {
        const updated = {
          ...prev,
          [lessonId]: {
            ...prev[lessonId],
            isCompleted: true,
            viewed: true,
            progressPercent: 100,
            completedAt: new Date().toISOString(),
          },
        };

        // 3. Immediately evaluate if all videos in this step are done
        const areAllVideosDone = allLessons.every(
          (l: any) => updated[l.id]?.isCompleted || updated[l.id]?.viewed
        );

        if (areAllVideosDone) {
          // Immediately unlock next module in client state so it never shows locked
          setProgression((prevProg: any) => {
            if (!prevProg?.steps) return prevProg;
            return {
              ...prevProg,
              steps: prevProg.steps.map((s: any) => {
                if (s.stepId === stepId) {
                  return { ...s, isCompleted: true, progressPercent: 100 };
                }
                if (nextStepId && s.stepId === nextStepId) {
                  return { ...s, isUnlocked: true, lockReason: null };
                }
                return s;
              }),
            };
          });

          if (
            step?.quiz &&
            !lastQuizResult?.passed &&
            !(currentStepProg as any)?.quizPassed &&
            !currentStepProg?.isCompleted
          ) {
            setCelebrationMode("lesson");
            setIsCelebrationOpen(true);
          } else {
            setCelebrationMode("module");
            setIsCelebrationOpen(true);
            if (nextStepId) {
              setRedirectCountdown(3);
            }
          }
        } else {
          setCelebrationMode("lesson");
          setIsCelebrationOpen(true);
        }

        return updated;
      });

      // 4. Background server sync (does NOT block UI or video progression)
      void (async () => {
        try {
          const lesson = allLessons.find((l: any) => l.id === lessonId);
          const dur = lesson?.durationSec || 0;
          if (lesson && (lesson.type === "VIDEO" || lesson.type === "AUDIO")) {
            await sendMediaHeartbeat(lessonId, dur, true, dur, dur, 0, dur);
          } else if (lesson) {
            await fetch(`${API_URL}/progress/lessons/${lessonId}/complete`, {
              method: "POST",
              headers: getAuthHeaders(),
            });
          }
          invalidateCache();
          void fetchStepAndProgression(false, true);
        } catch (e) {
          console.warn("Background lesson completion sync failed:", e);
        }
      })();
    },
    [
      allLessons,
      step?.quiz,
      lastQuizResult,
      currentStepProg,
      nextStepId,
      sendMediaHeartbeat,
      fetchStepAndProgression,
    ]
  );


  // Quiz submission
  const handleQuizSubmit = async () => {
    if (!step?.quiz?.id || isSubmittingQuiz) return;

    const questionsList: QuizQuestion[] = (attemptQuestions && attemptQuestions.length > 0)
      ? attemptQuestions
      : (quizQuestions || []);

    const unanswered = questionsList.some((q) => !quizAnswers[q.id]?.trim());
    if (unanswered) {
      setQuizError("Please answer all questions before submitting.");
      return;
    }

    setIsSubmittingQuiz(true);
    setQuizError(null);

    const submissionDto: any = {
      attemptId: activeAttemptId || undefined,
      answers: questionsList.map((q) => {
        const rawAns = quizAnswers[q.id] || "";
        const qType = (q as any).type || "MULTIPLE_CHOICE";
        const isMulti = qType === "MULTI_SELECT";
        const isText = qType === "SHORT_ANSWER" || qType === "TEXT_BOX";
        return {
          questionId: q.id,
          optionId: !isMulti && !isText ? rawAns || undefined : undefined,
          selectedOptionId: !isMulti && !isText ? rawAns || undefined : undefined,
          selectedOptionIds: isMulti ? rawAns.split(",").filter(Boolean) : undefined,
          textResponse: isText ? rawAns.trim() : undefined,
          textAnswer: isText ? rawAns.trim() : undefined,
        };
      }),
    };

    try {
      const res = await fetch(`${API_URL}/quizzes/${step.quiz.id}/submit`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(submissionDto),
      });
      const data = await res.json();
      if (!res.ok) {
        const errorMsg = Array.isArray(data?.message) ? data.message.join(", ") : data?.message;
        throw new Error(errorMsg || "Failed to submit quiz");
      }
      setLastQuizResult(data);
      setActiveAttemptId(null);
      try {
        localStorage.removeItem(`wbm_step_quiz_${stepId}`);
      } catch (e) {}
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
  const isStepCompleted = currentStepProg?.isCompleted || step?.isCompleted;

  const totalLessonsCount = allLessons.length;
  const completedLessonsCount = allLessons.filter(
    (l: any) => lessonProgress[l.id]?.isCompleted || lessonProgress[l.id]?.viewed
  ).length;

  const calculatedStepPercent =
    totalLessonsCount > 0
      ? Math.round((completedLessonsCount / totalLessonsCount) * 100)
      : currentStepProg?.progressPercent || 0;



  // Loading State (Apple HIG skeleton matching real workspace)
  if (loading && !step) {
    return <StepLoading />;
  }

  // Error State: Only show blocking error card if step is not already available in memory
  if (loadError && !step) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyStateCard}>
          <h2 style={{ color: "#dc2626", margin: "0 0 8px" }}>Could not load curriculum</h2>
          <p style={{ margin: "0 0 1.5rem" }}>{loadError}</p>
          <button
            type="button"
            onClick={() => {
              isFetchingRef.current = false;
              fetchStepAndProgression(false);
            }}
            className={styles.btnPrimaryOrange}
          >
            Retry Loading
          </button>
        </div>
      </div>
    );
  }

  // Locked Step State
  if (!isStepUnlocked && currentStepProg) {
    const isPrevIncomplete = currentStepProg.lockReason === "PREVIOUS_STEP_INCOMPLETE";
    return (
      <div className={styles.container}>
        <div className={styles.lockCard}>
          <span className={styles.lockBadge}>Step Locked</span>
          <h2 className={styles.lockTitle}>Step {step?.sequence}: {step?.title}</h2>
          <p className={styles.lockMessage}>
            {getLockMessage(currentStepProg.lockReason)}
          </p>

          {isPrevIncomplete && (
            <div
              style={{
                margin: "16px 0",
                fontSize: "0.9rem",
                color: "#ea580c",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {isRecheckingUnlock ? (
                <>
                  <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>⏳</span>
                  <span>Verifying previous module completion... Unlocking step</span>
                </>
              ) : recheckCount < 6 ? (
                <>
                  <span>Checking completion status... Unlocks automatically</span>
                </>
              ) : null}
            </div>
          )}

          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 12 }}>
            {isPrevIncomplete && (
              <button
                type="button"
                disabled={isRecheckingUnlock}
                onClick={async () => {
                  setIsRecheckingUnlock(true);
                  invalidateCache();
                  isFetchingRef.current = false;
                  await fetchStepAndProgression(false, true);
                  setIsRecheckingUnlock(false);
                }}
                className={styles.btnPrimaryOrange}
                style={{ minWidth: 160 }}
              >
                {isRecheckingUnlock ? "Verifying..." : "Check Unlock Now ⟳"}
              </button>
            )}
            <Link href={`/programs/${step?.programId}/steps`} className={styles.btnSecondaryOutline}>
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

  const quizQuestions: QuizQuestion[] = (attemptQuestions && attemptQuestions.length > 0)
    ? attemptQuestions
    : (step?.quiz?.questions && step.quiz.questions.length > 0)
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

  const renderLessonNavigationRow = () => (
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
      ) : step?.quiz && !isQuizAlreadyPassed ? (
        isQuizUnlocked ? (
          <button
            type="button"
            onClick={() => setActiveTab("quiz")}
            className={styles.btnPrimaryOrange}
          >
            Take Module Quiz &rarr;
          </button>
        ) : (
          <button
            type="button"
            disabled
            className={styles.btnSecondaryOutline}
            style={{ opacity: 0.6, cursor: "not-allowed" }}
            title="Complete all video lessons in this module to unlock the quiz"
          >
            🔒 Complete all parts to unlock Quiz
          </button>
        )
      ) : nextStep && nextStepId ? (
        <button
          type="button"
          disabled={!isStepCompleted && completedLessonsCount < totalLessonsCount}
          onClick={() => {
            if (isStepCompleted || completedLessonsCount >= totalLessonsCount) {
              router.push(`/steps/${nextStepId}`);
            }
          }}
          className={styles.btnPrimaryOrange}
          style={{
            opacity: !isStepCompleted && completedLessonsCount < totalLessonsCount ? 0.6 : 1,
            cursor: !isStepCompleted && completedLessonsCount < totalLessonsCount ? "not-allowed" : "pointer",
          }}
        >
          {!isStepCompleted && completedLessonsCount < totalLessonsCount
            ? `🔒 Complete all parts to unlock Next Module`
            : `Next Module (${nextStep.title}) →`}
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
  );

  // ---------------------------------------------------------------------------
  // RENDER VIEW
  // ---------------------------------------------------------------------------
  return (
    <div className={styles.container}>
      {/* =====================================================================
          TOP HEADER (Consistent Learning Path format)
          ===================================================================== */}
      <header className={styles.header}>
        <Link
          href={step?.programId ? `/programs/${step.programId}/steps` : "/"}
          className={styles.backLink}
          title="Back to Learning Path"
        >
          <span className={styles.backIconWrap}>{ArrowLeft}</span>
          <span className={styles.backText}>Back</span>
        </Link>
        <span className={styles.headerDivider} aria-hidden="true" />
        <div className={styles.headerTitleGroup}>
          <h1 className={styles.pageMainTitle}>
            Step {step?.sequence}: {step?.title}
          </h1>
          <span className={styles.cardMetaBadge}>
            <span className={styles.cardMetaDot} aria-hidden="true" />
            {step?.title || `Module ${step?.sequence}`} • {completedLessonsCount} of {totalLessonsCount} lessons completed
          </span>
        </div>
      </header>

      {/* =====================================================================
          4-TAB LESSON WORKSPACE
          ===================================================================== */}
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

            {hasQuiz && (
              <button
                type="button"
                onClick={() => {
                  if (isQuizUnlocked) {
                    setActiveTab("quiz");
                  }
                }}
                className={`${styles.learningTabBtn} ${activeTab === "quiz" ? styles.learningTabBtnActive : ""} ${!isQuizUnlocked ? styles.learningTabBtnLocked : ""}`}
                title={
                  !isQuizUnlocked
                    ? `Complete all video lessons in this module to unlock the quiz (${completedLessonsCount}/${totalLessonsCount} completed)`
                    : "Take Module Quiz"
                }
              >
                <span>{isQuizUnlocked ? "📝" : "🔒"}</span>
                <span>Quiz</span>
                {quizQuestions.length > 0 && isQuizUnlocked && (
                  <span className={styles.learningTabCount}>{quizQuestions.length}</span>
                )}
              </button>
            )}

            {/* Notes Tab Button - hidden per user request
            <button
              type="button"
              onClick={() => setActiveTab("notes")}
              className={`${styles.learningTabBtn} ${activeTab === "notes" ? styles.learningTabBtnActive : ""}`}
            >
              <span>✍️</span>
              <span>Notes</span>
              {notes.length > 0 && <span className={styles.learningTabCount}>{notes.length}</span>}
            </button>
            */}

            {stepMaterials.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab("materials")}
                className={`${styles.learningTabBtn} ${activeTab === "materials" ? styles.learningTabBtnActive : ""}`}
              >
                <span>📁</span>
                <span>Materials</span>
                <span className={styles.learningTabCount}>{stepMaterials.length}</span>
              </button>
            )}
          </nav>

          {/* TAB 1: VIDEO LESSON & NOTES COMPANION (SCREEN 3) */}
          {activeTab === "video" && (
            <div className={styles.lessonWorkspaceGrid}>
              {/* Left Column: 16:9 Compulsory Player + Lesson Details + Multi-Video Selector */}
              <div className={styles.videoLeftColumn}>
                {/* Unified Video & Lesson Details in the Same Box */}
                <div className={styles.unifiedVideoCard}>
                  {/* Dynamic Video Title Header Above Video */}
                  <div className={styles.videoPlayerHeader}>
                    <div className={styles.videoHeaderLeft}>
                      <span className={styles.videoPartBadge}>
                        Part {activeLessonIndex + 1} of {allLessons.length}
                      </span>
                      <h2 className={styles.videoLessonTitle}>
                        {currentMedia?.title || "Video Lesson"}
                      </h2>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {currentMedia?.durationSec ? (
                        <span style={{ fontSize: "0.82rem", color: "#78716c", fontWeight: 500 }}>
                          Duration: {formatLessonDuration(currentMedia.durationSec)}
                        </span>
                      ) : null}
                      {lessonProgress[currentMedia?.id]?.isCompleted && (
                        <span className={styles.watchedPill}>✓ Watched</span>
                      )}
                    </div>
                  </div>

                  {/* 16:9 Video Viewport */}
                  {currentMedia?.type === "PDF" || (currentMedia?.mediaUrl && currentMedia.mediaUrl.toLowerCase().includes(".pdf")) ? (
                    <div className={styles.pdfLessonViewport}>
                      <div className={styles.pdfLessonHeader}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span className={styles.badgePdf} style={{ padding: "4px 8px", borderRadius: 4, fontWeight: 700, fontSize: "0.78rem" }}>
                            PDF
                          </span>
                          <strong style={{ fontSize: "1.05rem", color: "#1c1917" }}>{currentMedia.title}</strong>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <button
                            type="button"
                            onClick={() => handleViewPdf(currentMedia)}
                            className={styles.btnPrimaryView}
                            title="Open full in-browser reader modal"
                          >
                            <span style={{ fontSize: "1rem" }}>👁</span> View Fullscreen
                          </button>
                          <a
                            href={resolveMediaDownloadUrl(currentMedia.mediaUrl)}
                            download={currentMedia.title}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.btnSecondaryOutline}
                            style={{ textDecoration: "none" }}
                          >
                            &darr; Download
                          </a>
                        </div>
                      </div>
                      <div className={styles.pdfLessonEmbedContainer}>
                        <object
                          data={`${API_URL}/media/document/${encodeURIComponent(currentMedia.id)}?token=${encodeURIComponent(typeof window !== "undefined" ? localStorage.getItem("token") || "" : "")}`}
                          type="application/pdf"
                          className={styles.pdfFrameObject}
                        >
                          <iframe
                            src={`${API_URL}/media/document/${encodeURIComponent(currentMedia.id)}?token=${encodeURIComponent(typeof window !== "undefined" ? localStorage.getItem("token") || "" : "")}`}
                            title={currentMedia.title}
                            className={styles.pdfFrame}
                          />
                        </object>
                      </div>
                    </div>
                  ) : currentMedia?.mediaUrl ? (
                    <div className={styles.videoPlayerViewport}>
                      <CompulsoryVideoPlayer
                        lessonId={currentMedia.id}
                        videoSrc={resolveVideoSrc(currentMedia.mediaUrl)}
                        userName={userName}
                        userEmail={userEmail}
                        durationSec={currentMedia.durationSec || 0}
                        initialPositionSec={lessonProgress[currentMedia.id]?.lastPositionSec || 0}
                        onHeartbeat={(pos, ended, dur, delta, from, to) =>
                          sendMediaHeartbeat(currentMedia.id, pos, ended, dur, delta, from, to)
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

                  {/* Dynamic Lesson Details placed directly below the video in the same box */}
                  <div className={styles.lessonDetailsCard}>
                    {/* Dynamic description / content only (static placeholder removed) */}
                    {(currentMedia?.content || currentMedia?.description) && (
                      <p className={styles.lessonParagraph}>
                        {currentMedia.content || currentMedia.description}
                      </p>
                    )}

                    {/* Lesson navigation row (Previous Part / Next Part / Take Module Quiz) */}
                    {renderLessonNavigationRow()}

                    {/* Dynamic Learning Objectives only (static placeholder removed) */}
                    {Array.isArray((step as any)?.learningObjectives) && (step as any).learningObjectives.length > 0 && (
                      <div className={styles.objectivesBox} style={{ marginTop: "1rem" }}>
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

                {/* Multi-video parts selector (Playlist) placed BELOW the video & details card */}
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
                                  {isDone ? " • Completed" : isSelected ? " • Now Playing" : isLocked ? " • Ready" : " • Ready"}
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
              </div>
            </div>
          )}

          {/* TAB 2: KNOWLEDGE CHECK QUIZ (SCREEN 4) */}
          {activeTab === "quiz" && hasQuiz && (
            <div>
              {!isQuizUnlocked ? (
                <div className={styles.quizLockedCard}>
                  <div className={styles.quizLockedIcon}>🔒</div>
                  <h3 className={styles.quizLockedTitle}>Module Quiz Locked</h3>
                  <p className={styles.quizLockedSubtitle}>
                    {effectiveQuizPlacement === "AFTER_VIDEO"
                      ? `This comprehension quiz unlocks automatically after you complete all video lessons in Step ${step?.sequence}.`
                      : "Please complete the prerequisites to unlock this quiz."}
                  </p>
                  <div className={styles.quizLockedProgressWrap}>
                    <div
                      className={styles.quizLockedProgressBar}
                      style={{
                        width: `${Math.min(100, Math.round((completedLessonsCount / Math.max(totalLessonsCount, 1)) * 100))}%`,
                      }}
                    />
                  </div>
                  <p className={styles.quizLockedCount}>
                    {completedLessonsCount} of {totalLessonsCount} lessons watched ({Math.min(100, Math.round((completedLessonsCount / Math.max(totalLessonsCount, 1)) * 100))}%)
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab("video")}
                    className={styles.btnPrimaryOrange}
                    style={{ marginTop: "1rem" }}
                  >
                    ▶ Watch Video Lessons
                  </button>
                </div>
              ) : (
                <>
              {quizError && (
                <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: "0.86rem" }}>
                  {quizError}
                </div>
              )}

              {lastQuizResult && lastQuizResult.score !== undefined && lastQuizResult.status !== "IN_PROGRESS" && (
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
                    Score: {lastQuizResult.score}% (Pass threshold: {lastQuizResult.passMark ?? 75}%).
                    {lastQuizResult.passed
                      ? " Great job! Your progress has been updated and the next module is unlocked."
                      : " Review the video lessons and try again."}
                  </p>
                  {!lastQuizResult.passed && (
                    <button
                      type="button"
                      disabled={isStartingQuiz}
                      onClick={async () => {
                        setQuizError(null);
                        setQuizAnswers({});
                        setActiveQuizIndex(0);
                        setIsStartingQuiz(true);
                        if (step?.quiz?.id) {
                          hasAttemptedQuizStartRef.current[step.quiz.id] = false;
                        }
                        try {
                          const startRes = await fetch(`${API_URL}/quizzes/${step?.quiz?.id}/start`, {
                            method: "POST",
                            headers: getAuthHeaders(),
                          });
                          const startData = await startRes.json();
                          if (startRes.ok) {
                            setLastQuizResult(null);
                            setActiveAttemptId(startData.attemptId || startData.id);
                            if (Array.isArray(startData.questions) && startData.questions.length > 0) {
                              setAttemptQuestions(startData.questions);
                            }
                          } else {
                            const errorMsg = Array.isArray(startData?.message)
                              ? startData.message.join(", ")
                              : startData?.message;
                            setQuizError(errorMsg || "Failed to start a new quiz attempt");
                          }
                        } catch (e: any) {
                          setQuizError(e.message || "Failed to start quiz attempt");
                        } finally {
                          setIsStartingQuiz(false);
                        }
                      }}
                      className={styles.btnPrimaryOrange}
                      style={{ padding: "8px 16px", fontSize: "0.85rem", cursor: isStartingQuiz ? "wait" : "pointer", marginRight: 8 }}
                    >
                      {isStartingQuiz ? "Starting..." : "Try Again →"}
                    </button>
                  )}
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
                  {(currentQuizQuestion as any).imageUrl && (
                    <div style={{ marginBottom: "1rem", borderRadius: 10, overflow: "hidden", border: "1px solid #ece6dd", maxWidth: 480 }}>
                      <img
                        src={(currentQuizQuestion as any).imageUrl}
                        alt={`Question ${activeQuizIndex + 1}`}
                        style={{ width: "100%", maxHeight: 240, objectFit: "cover", display: "block" }}
                      />
                    </div>
                  )}
                  <h3 className={styles.questionPrompt}>
                    {currentQuizQuestion.text}
                  </h3>

                  {(() => {
                    const qType = (currentQuizQuestion as any).type || "MULTIPLE_CHOICE";
                    const isText = qType === "SHORT_ANSWER" || qType === "TEXT_BOX";
                    const isMulti = qType === "MULTI_SELECT";
                    const selectedMultiList =
                      isMulti && quizAnswers[currentQuizQuestion.id]
                        ? (quizAnswers[currentQuizQuestion.id] || "").split(",").filter(Boolean)
                        : [];

                    if (isText) {
                      const minChars = (currentQuizQuestion as any).minCharacters ?? 10;
                      const currentText = quizAnswers[currentQuizQuestion.id] || "";
                      return (
                        <div style={{ marginBottom: "1.5rem" }}>
                          <textarea
                            rows={4}
                            placeholder="Write your reflection or response here..."
                            value={currentText}
                            onChange={(e) =>
                              setQuizAnswers((prev) => ({
                                ...prev,
                                [currentQuizQuestion.id]: e.target.value,
                              }))
                            }
                            style={{
                              width: "100%",
                              padding: "12px 14px",
                              borderRadius: 10,
                              border: "1px solid #dcd5cb",
                              fontFamily: "inherit",
                              fontSize: "0.95rem",
                              background: "#fffdfa",
                            }}
                          />
                          <div style={{ fontSize: "0.78rem", color: "#78716a", marginTop: 4 }}>
                            Characters: {currentText.trim().length} / {minChars} minimum
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div className={styles.optionsStack}>
                        {(currentQuizQuestion.options || []).map((opt: any, optIdx: number) => {
                          const isSelected = isMulti
                            ? selectedMultiList.includes(opt.id)
                            : quizAnswers[currentQuizQuestion.id] === opt.id;
                          return (
                            <div
                              key={opt.id || optIdx}
                              onClick={() =>
                                setQuizAnswers((prev) => {
                                  if (!isMulti) {
                                    return {
                                      ...prev,
                                      [currentQuizQuestion.id]: opt.id,
                                    };
                                  }
                                  const existing = prev[currentQuizQuestion.id]
                                    ? (prev[currentQuizQuestion.id] || "").split(",").filter(Boolean)
                                    : [];
                                  const next = existing.includes(opt.id)
                                    ? existing.filter((id) => id !== opt.id)
                                    : [...existing, opt.id];
                                  return {
                                    ...prev,
                                    [currentQuizQuestion.id]: next.join(","),
                                  };
                                })
                              }
                              className={`${styles.optionCard} ${isSelected ? styles.optionCardSelected : ""}`}
                            >
                              <div className={styles.optionRadioCircle}>
                                {isSelected && <div className={styles.optionRadioInnerDot} />}
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                                {opt.imageUrl && (
                                  <img
                                    src={opt.imageUrl}
                                    alt={opt.text}
                                    style={{ maxWidth: 220, maxHeight: 120, objectFit: "cover", borderRadius: 6 }}
                                  />
                                )}
                                <span className={styles.optionText}>{opt.text}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

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
                </>
              )}
            </div>
          )}

          {/* TAB 3: DEDICATED NOTES MANAGER (SCREEN 5) - hidden per user request */}
          {/*
          {activeTab === "notes" && (
            <div className={styles.notesTabStack}>
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
          */}

          {/* TAB 4: LEARNING MATERIALS (SCREEN 6) */}
          {activeTab === "materials" && stepMaterials.length > 0 && (
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
                {stepMaterials
                  .filter((m) => m.title.toLowerCase().includes(materialsSearch.toLowerCase()))
                  .map((m) => {
                    const downloadUrl = resolveMediaDownloadUrl(m.mediaUrl);
                    const isPdf = m.type === "PDF" || (m.mediaUrl && m.mediaUrl.toLowerCase().includes(".pdf"));
                    return (
                      <div
                        key={m.id}
                        className={`${styles.materialRowCard} ${isPdf ? styles.materialRowCardClickable : ""}`}
                        onClick={() => {
                          if (isPdf) handleViewPdf(m);
                        }}
                        title={isPdf ? "Click to view PDF in browser" : undefined}
                      >
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
                            <span className={styles.materialMeta}>
                              {m.type}
                              {m.size ? ` • ${m.size}` : m.durationSec ? ` • ${Math.ceil(m.durationSec / 60)} min read` : ""}
                            </span>
                          </div>
                        </div>

                        <div className={styles.materialActionsGroup} onClick={(e) => e.stopPropagation()}>
                          {isPdf && (
                            <button
                              type="button"
                              onClick={() => handleViewPdf(m)}
                              className={styles.btnPrimaryView}
                              title="View this PDF directly in the browser"
                            >
                              <span style={{ fontSize: "1rem" }}>👁</span>
                              <span>View in Browser</span>
                            </button>
                          )}

                          {downloadUrl ? (
                            <a
                              href={downloadUrl}
                              download={m.title}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.btnSecondaryOutline}
                              style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                              title="Download PDF file"
                            >
                              &darr; Download
                            </a>
                          ) : (
                            <button
                              type="button"
                              disabled
                              className={styles.btnSecondaryOutline}
                              style={{ opacity: 0.5, cursor: "not-allowed" }}
                            >
                              Unavailable
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                {stepMaterials.filter((m) => m.title.toLowerCase().includes(materialsSearch.toLowerCase())).length === 0 && (
                  <div className={styles.emptyStateCard} style={{ padding: "2rem", textAlign: "center" }}>
                    <p style={{ margin: 0, color: "#78716a" }}>
                      No materials found matching &ldquo;{materialsSearch}&rdquo;
                    </p>
                  </div>
                )}
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
            {step?.quiz && !isQuizAlreadyPassed && !isStepCompleted ? (
              isQuizUnlocked ? (
                <button
                  type="button"
                  onClick={() => setActiveTab("quiz")}
                  className={styles.btnPrimaryOrange}
                >
                  Take Module Quiz &rarr;
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  className={styles.btnSecondaryOutline}
                  style={{ opacity: 0.6, cursor: "not-allowed" }}
                  title="Complete all video lessons in this module to unlock the quiz"
                >
                  🔒 Complete all parts to unlock Quiz
                </button>
              )
            ) : nextStep && nextStepId ? (
              <button
                type="button"
                disabled={!isStepCompleted && completedLessonsCount < totalLessonsCount}
                onClick={() => {
                  if (isStepCompleted || completedLessonsCount >= totalLessonsCount) {
                    router.push(`/steps/${nextStepId}`);
                  }
                }}
                className={styles.btnPrimaryOrange}
                style={{
                  background: isStepCompleted || completedLessonsCount >= totalLessonsCount ? "#d97706" : "#fef3c7",
                  color: isStepCompleted || completedLessonsCount >= totalLessonsCount ? "#ffffff" : "#b45309",
                  borderColor: isStepCompleted || completedLessonsCount >= totalLessonsCount ? "#d97706" : "#fde68a",
                  opacity: !isStepCompleted && completedLessonsCount < totalLessonsCount ? 0.6 : 1,
                  cursor: !isStepCompleted && completedLessonsCount < totalLessonsCount ? "not-allowed" : "pointer",
                }}
              >
                {!isStepCompleted && completedLessonsCount < totalLessonsCount
                  ? `🔒 Complete all parts to unlock Next Module`
                  : `Next Module (${nextStep.title}) →`}
              </button>
            ) : (
              <Link href={`/programs/${step?.programId}/steps`} className={styles.btnPrimaryOrange}>
                Course Roadmap &rarr;
              </Link>
            )}
          </div>
        </div>

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
      <PdfViewerModal
        isOpen={viewerPdf.isOpen}
        onClose={() => setViewerPdf((prev) => ({ ...prev, isOpen: false }))}
        documentId={viewerPdf.id}
        title={viewerPdf.title}
        mediaUrl={viewerPdf.mediaUrl}
        downloadUrl={viewerPdf.downloadUrl}
      />
    </div>
  );
}