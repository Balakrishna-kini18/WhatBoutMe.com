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
  updateStudentNote,
  deleteStudentNote,
  StudentNote,
  getLockMessage,
} from "../../lib/api";
import CompulsoryVideoPlayer from "./CompulsoryVideoPlayer";
import PdfViewerModal from "./components/PdfViewerModal";
import RichNoteEditorModal from "../../components/notes/RichNoteEditorModal";
import { VisualRichTextEditor } from "../../components/notes/VisualRichTextEditor";
import StepLoading from "./loading";
import {
  normalizeStudentNote,
  serializeCreateNotePayload,
  serializeUpdateNotePayload,
  extractPlainTextPreview,
} from "../../lib/notesAdapter";
import { ContextualNote, formatSecondsToTimestamp } from "../../types/learner-flow";
import { markdownToHtml, sanitizeNoteHtml, isEditorEmpty, stripHtmlToPlainText } from "../../lib/richTextHelper";
import { sanitizeExternalUrl } from "../../lib/auth-redirect";
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
  const [noteTitle, setNoteTitle] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [notePlainText, setNotePlainText] = useState("");
  const [noteEditorResetKey, setNoteEditorResetKey] = useState(0);
  const [noteIsFavorite, setNoteIsFavorite] = useState(false);
  const [capturedTimestamp, setCapturedTimestamp] = useState<number | null>(null);
  const [currentVideoTime, setCurrentVideoTime] = useState<number>(0);
  const [videoSeekTarget, setVideoSeekTarget] = useState<number | null>(null);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [notesSearch, setNotesSearch] = useState("");
  const [debouncedNotesSearch, setDebouncedNotesSearch] = useState("");
  const [notesSort, setNotesSort] = useState<"recent" | "oldest" | "favorite">("recent");
  const [editingModalNote, setEditingModalNote] = useState<Partial<ContextualNote> | null>(null);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);

  // Debounce notes search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedNotesSearch(notesSearch);
    }, 200);
    return () => clearTimeout(timer);
  }, [notesSearch]);

  // Materials state with debouncing
  const [materialsSearch, setMaterialsSearch] = useState("");
  const [debouncedMaterialsSearch, setDebouncedMaterialsSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedMaterialsSearch(materialsSearch);
    }, 200);
    return () => clearTimeout(timer);
  }, [materialsSearch]);
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
    const token = typeof window !== "undefined" ? localStorage.getItem("token") || "" : "";
    const directDocUrl = `${API_URL}/media/document/${encodeURIComponent(material.id)}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
    setViewerPdf({
      isOpen: true,
      id: material.id,
      title: material.title,
      mediaUrl: material.mediaUrl,
      downloadUrl: directDocUrl,
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
  const reconciledLessonsRef = useRef<Set<string>>(new Set());
  const lastEndedSentTimeRef = useRef<Record<string, number>>({});
  const lastHeartbeatSentTimeRef = useRef<Record<string, number>>({});
  const hasTriggeredCompletionRef = useRef<Record<string, boolean>>({});
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
      if (lastQuizResult?.passed) {
        localStorage.removeItem(`wbm_step_quiz_${stepId}`);
        return;
      }
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
  }, [stepId, quizAnswers, activeQuizIndex, activeTab, lastQuizResult?.passed]);

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

      // Build synchronous initial progress from local storage so resume position and completion are known with 0ms delay
      const lpMap: Record<string, any> = {};
      if (Array.isArray(stepData.lessons)) {
        for (const l of stepData.lessons) {
          const localResume = getLocalVideoResume(l.id);
          const isLocallyDone = isLocalLessonCompleted(l.id);
          const effectivePos = Math.max(l.lastPositionSec || 0, localResume?.positionSec || 0);
          if (isLocallyDone) {
            hasTriggeredCompletionRef.current[l.id] = true;
          }
          const posPct = l.durationSec && l.durationSec > 0
            ? Math.min(100, Math.round((effectivePos / l.durationSec) * 100))
            : 0;
          lpMap[l.id] = {
            viewed: isLocallyDone,
            progressPercent: isLocallyDone ? 100 : posPct,
            lastPositionSec: effectivePos,
            durationSec: l.durationSec,
            isCompleted: isLocallyDone,
          };
        }
      }

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
      }

      // Initialize lesson progress by merging server progression with local resume markers
      const stepProgItem = progData?.steps?.find((s: any) => s.stepId === stepId);

      if (stepProgItem?.lessons && stepProgItem.lessons.length > 0) {
        for (const l of stepProgItem.lessons) {
          const localResume = getLocalVideoResume(l.lessonId);
          const isLocallyDone = isLocalLessonCompleted(l.lessonId);
          const isDone = Boolean(l.isCompleted || isLocallyDone);
          const effectivePos = Math.max(l.lastPositionSec || 0, localResume?.positionSec || 0);

          if (isDone) {
            hasTriggeredCompletionRef.current[l.lessonId] = true;
          }
          lpMap[l.lessonId] = {
            viewed: isDone,
            progressPercent: isDone ? 100 : (l.progressPercent || 0),
            lastPositionSec: effectivePos,
            completedAt: l.completedAt,
            durationSec: l.durationSec,
            isCompleted: isDone,
          };
        }

        // Automatic Server Completion Reconciliation:
        // If a lesson was finished locally but server missed it (e.g. dropped connection during reload),
        // reconcile completion with server so database records and next step unlocks stay 100% in sync
        const missingOnServer = stepProgItem.lessons.filter(
          (l: any) => !l.isCompleted && isLocalLessonCompleted(l.lessonId) && !reconciledLessonsRef.current.has(l.lessonId)
        );
        if (missingOnServer.length > 0) {
          missingOnServer.forEach((l: any) => reconciledLessonsRef.current.add(l.lessonId));
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

      // Determine authoritative active lesson without intermediate jump
      let targetLessonId: string | null = null;
      if (Array.isArray(stepData.lessons) && stepData.lessons.length > 0) {
        let requestedLessonId: string | null = null;
        if (typeof window !== "undefined") {
          const sp = new URLSearchParams(window.location.search);
          requestedLessonId = sp.get("lessonId");
        }
        if (requestedLessonId && stepData.lessons.some((l: any) => l.id === requestedLessonId)) {
          targetLessonId = requestedLessonId;
        } else {
          const firstIncomplete = stepData.lessons.find((l: any) => !lpMap[l.id]?.isCompleted);
          targetLessonId = firstIncomplete ? firstIncomplete.id : stepData.lessons[0].id;
        }
      }

      // Atomically commit all step, progression, and selection states together
      setStep(stepData);
      if (progData) setProgression(progData);
      setLessonProgress(lpMap);
      if (targetLessonId) setSelectedMediaId(targetLessonId);

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

  // Helper to identify if a lesson is a PDF/document rather than a video
  const isLessonPdf = useCallback((l: any) => {
    if (!l) return false;
    const t = (l.type || "").toUpperCase();
    if (t === "PDF" || t === "DOCUMENT" || t === "TEXT") return true;
    if (typeof l.mediaUrl === "string" && l.mediaUrl.toLowerCase().split("?")[0].endsWith(".pdf")) return true;
    return false;
  }, []);

  // Lessons list calculation
  const allLessons = useMemo(() => {
    return Array.isArray(step?.lessons) ? step.lessons : [];
  }, [step]);

  // Video-only lessons for the Video Lesson tab & playlist
  const videoLessons = useMemo(() => {
    return allLessons.filter((l: any) => !isLessonPdf(l));
  }, [allLessons, isLessonPdf]);

  const pdfLessons = useMemo(() => {
    return allLessons.filter((l: any) => isLessonPdf(l));
  }, [allLessons, isLessonPdf]);

  const currentMedia = useMemo(() => {
    if (!videoLessons.length) return null;
    return videoLessons.find((l: any) => l.id === selectedMediaId) || videoLessons[0];
  }, [videoLessons, selectedMediaId]);

  const activeLessonIndex = useMemo(() => {
    if (!currentMedia || !videoLessons.length) return 0;
    const idx = videoLessons.findIndex((l: any) => l.id === currentMedia.id);
    return idx >= 0 ? idx : 0;
  }, [videoLessons, currentMedia]);

  const formatLessonDuration = (sec?: number) => {
    if (!sec || sec <= 0) return null;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.round(sec % 60);
    if (h > 0) {
      return `${h}h ${m}m`;
    }
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  // Check if current lesson has 30 seconds or less remaining (unlocking advance to next part)
  const isCurrentLessonLeftUnder30s = useMemo(() => {
    if (!currentMedia) return false;
    if (lessonProgress[currentMedia.id]?.isCompleted) return true;
    const dur = currentMedia.durationSec || 0;
    if (dur > 0 && dur - currentVideoTime <= 30) return true;
    return false;
  }, [currentMedia, lessonProgress, currentVideoTime]);

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
  const isQuizAlreadyPassed = Boolean(
    lastQuizResult?.passed ||
    (currentStepProg as any)?.quiz?.isPassed ||
    (currentStepProg?.isCompleted && lastQuizResult?.passed !== false)
  );
  
  const stepMaterials = useMemo(() => {
    const list: Array<{
      id: string;
      title: string;
      type: string;
      mediaUrl?: string | null;
      size?: string | null;
      durationSec?: number | null;
      isLesson?: boolean;
    }> = [];

    // 1. All PDF/document lessons (from step.lessons)
    for (const l of allLessons) {
      if (isLessonPdf(l)) {
        list.push({
          id: l.id,
          title: l.title,
          type: "PDF",
          mediaUrl: l.mediaUrl || null,
          size: null,
          durationSec: l.durationSec || null,
          isLesson: true,
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
            isLesson: false,
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
            isLesson: false,
          });
        }
      }
    }

    return list;
  }, [allLessons, isLessonPdf, step?.resources, (step as any)?.resourceItems]);

  const areAllVideosDone = useMemo(() => {
    if (!videoLessons.length) return true;
    return videoLessons.every((l: any) => {
      const isDone = Boolean(lessonProgress[l.id]?.isCompleted || lessonProgress[l.id]?.viewed);
      if (isDone) return true;
      if (l.id === currentMedia?.id && isCurrentLessonLeftUnder30s) return true;
      return false;
    });
  }, [videoLessons, lessonProgress, currentMedia?.id, isCurrentLessonLeftUnder30s]);

  // Materials Unlock Rule:
  // - Unlocked if step has no video lessons
  // - Unlocked if admin explicitly allows viewing materials without watching video (requireVideosBeforeMaterials === false)
  // - Otherwise strictly LOCKED until all video parts in this step (Part 1, Part 2, etc.) are completed!
  const isMaterialsUnlocked = useMemo(() => {
    if (isManuallyUnlocked) return true;
    if (!videoLessons.length) return true;
    if ((step as any)?.requireVideosBeforeMaterials === false) return true;
    if ((progression as any)?.program?.requireVideosBeforeMaterials === false) return true;
    if ((progression as any)?.program?.sequentialProgressionEnabled === false) return true;
    return areAllVideosDone;
  }, [
    isManuallyUnlocked,
    videoLessons.length,
    (step as any)?.requireVideosBeforeMaterials,
    (progression as any)?.program?.requireVideosBeforeMaterials,
    (progression as any)?.program?.sequentialProgressionEnabled,
    areAllVideosDone,
  ]);

  const areAllMaterialsDone = useMemo(() => {
    if (!stepMaterials.length) return true;
    // Materials cannot be considered completed if materials are still locked
    if (!isMaterialsUnlocked) return false;
    return stepMaterials.every((m: any) => {
      return Boolean(lessonProgress[m.id]?.isCompleted || lessonProgress[m.id]?.viewed);
    });
  }, [stepMaterials, lessonProgress, isMaterialsUnlocked]);

  const isQuizUnlocked = Boolean(
    isManuallyUnlocked ||
    isQuizAlreadyPassed ||
    effectiveQuizPlacement === "BEFORE_VIDEO" ||
    (areAllVideosDone && areAllMaterialsDone)
  );

  const hasQuiz = Boolean(step?.quiz && step.quiz.id);

  // Filtered and sorted student notes for the companion panel (debounced query)
  const displayedNotes = useMemo(() => {
    let list = [...notes];
    if (debouncedNotesSearch.trim()) {
      const q = debouncedNotesSearch.toLowerCase();
      list = list.filter((n) => {
        const norm = normalizeStudentNote(n);
        return (
          norm.noteTitle.toLowerCase().includes(q) ||
          norm.noteContent.toLowerCase().includes(q)
        );
      });
    }
    if (notesSort === "favorite") {
      list.sort((a, b) => {
        const aFav = normalizeStudentNote(a).isFavorite ? 1 : 0;
        const bFav = normalizeStudentNote(b).isFavorite ? 1 : 0;
        return bFav - aFav;
      });
    } else if (notesSort === "oldest") {
      list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } else {
      list.sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
    }
    return list;
  }, [notes, debouncedNotesSearch, notesSort]);

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

  // Mark material/PDF as completed/read
  const handleMaterialComplete = useCallback(
    async (materialId: string) => {
      if (!materialId) return;

      // 1. Immediately persist locally (0ms lag)
      saveLocalLessonCompletion(materialId);

      // 2. Immediately update local progress state
      setLessonProgress((prev) => ({
        ...prev,
        [materialId]: {
          ...prev[materialId],
          isCompleted: true,
          viewed: true,
          progressPercent: 100,
          completedAt: new Date().toISOString(),
        },
      }));

      // 3. If it's a lesson entity on the backend, sync with API
      const lesson = allLessons.find((l: any) => l.id === materialId);
      if (lesson) {
        try {
          await fetch(`${API_URL}/progress/lessons/${materialId}/complete`, {
            method: "POST",
            headers: getAuthHeaders(),
          });
          invalidateCache();
          void fetchStepAndProgression(false, true);
        } catch (e) {
          console.warn("Background material completion sync failed:", e);
        }
      }
    },
    [allLessons, fetchStepAndProgression]
  );

  // Advance from currently viewed material to next section
  const handleAdvanceFromMaterial = useCallback(
    (currentMaterialId?: string) => {
      // 1. If viewing a material, ensure it is marked as read
      if (currentMaterialId) {
        handleMaterialComplete(currentMaterialId);
      }

      // 2. Close PDF viewer if open
      setViewerPdf((prev) => ({ ...prev, isOpen: false }));

      // 3. Check if there are other unread materials
      const nextUnreadMaterial = stepMaterials.find(
        (m) => m.id !== currentMaterialId && !lessonProgress[m.id]?.isCompleted && !lessonProgress[m.id]?.viewed
      );

      if (nextUnreadMaterial) {
        handleViewPdf(nextUnreadMaterial);
        return;
      }

      // 4. All materials read: check if there's a quiz to take
      if (hasQuiz && !isQuizAlreadyPassed) {
        setActiveTab("quiz");
        return;
      }

      // 5. If all materials and videos are completed, advance to next module/step
      if (nextStepId) {
        router.push(`/steps/${nextStepId}`);
        return;
      }

      // 6. Otherwise navigate back to dashboard
      router.push("/dashboard");
    },
    [
      handleMaterialComplete,
      stepMaterials,
      lessonProgress,
      handleViewPdf,
      hasQuiz,
      isQuizAlreadyPassed,
      nextStepId,
      router,
    ]
  );

  useEffect(() => {
    if (activeTab === "quiz" && !hasQuiz) {
      setActiveTab(videoLessons.length > 0 ? "video" : "materials");
    } else if (activeTab === "materials" && stepMaterials.length === 0 && videoLessons.length > 0) {
      setActiveTab("video");
    } else if (activeTab === "materials" && !isMaterialsUnlocked && videoLessons.length > 0) {
      setActiveTab("video");
    } else if (activeTab === "video" && videoLessons.length === 0 && stepMaterials.length > 0) {
      setActiveTab("materials");
    }
  }, [activeTab, hasQuiz, stepMaterials.length, videoLessons.length, isMaterialsUnlocked]);

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

  // Handle Save Note with Full Structured Envelope (Exact parity with My Notes page)
  const handleSaveNote = async () => {
    if ((isEditorEmpty(noteInput) && !noteTitle.trim()) || !currentMedia?.id) return;
    setIsSavingNote(true);
    try {
      const plainText = notePlainText || stripHtmlToPlainText(noteInput);
      const titleToSave = noteTitle.trim() || extractPlainTextPreview(plainText, 50) || "Untitled Note";
      const tsToSave = capturedTimestamp !== null ? capturedTimestamp : (currentVideoTime > 0 ? Math.floor(currentVideoTime) : null);
      
      const payload = serializeCreateNotePayload({
        courseId: step?.programId,
        moduleId: stepId,
        lessonId: currentMedia.id,
        noteTitle: titleToSave,
        noteContent: noteInput.trim(),
        isFavorite: noteIsFavorite,
        videoTimestampSec: tsToSave,
        sourcePage: "lesson_player",
      });

      const saved = await createStudentNote(payload);
      setNotes((prev) => [saved, ...prev]);
      setNoteTitle("");
      setNoteInput("");
      setNotePlainText("");
      setNoteIsFavorite(false);
      setCapturedTimestamp(null);
      setNoteEditorResetKey((k) => k + 1);
    } catch (err: any) {
      console.warn("Failed to save note to API, falling back to local note:", err);
      const plainText = notePlainText || stripHtmlToPlainText(noteInput);
      const titleToSave = noteTitle.trim() || extractPlainTextPreview(plainText, 50) || "Untitled Note";
      const tsToSave = capturedTimestamp !== null ? capturedTimestamp : (currentVideoTime > 0 ? Math.floor(currentVideoTime) : null);
      const fallbackEnvelope = serializeCreateNotePayload({
        courseId: step?.programId,
        moduleId: stepId,
        lessonId: currentMedia.id,
        noteTitle: titleToSave,
        noteContent: noteInput.trim(),
        isFavorite: noteIsFavorite,
        videoTimestampSec: tsToSave,
        sourcePage: "lesson_player",
      });
      const fallbackNote: StudentNote = {
        id: `local-${Date.now()}`,
        userId: "local-user",
        programId: step?.programId || null,
        stepId,
        lessonId: currentMedia.id,
        noteText: fallbackEnvelope.noteText,
        highlightSnippet: fallbackEnvelope.highlightSnippet || null,
        videoTimestampSeconds: tsToSave,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setNotes((prev) => [fallbackNote, ...prev]);
      setNoteTitle("");
      setNoteInput("");
      setNotePlainText("");
      setNoteIsFavorite(false);
      setCapturedTimestamp(null);
      setNoteEditorResetKey((k) => k + 1);
    } finally {
      setIsSavingNote(false);
    }
  };

  // Toggle Favorite on a saved note in the companion list
  const handleToggleNoteFavorite = async (noteItem: StudentNote) => {
    const norm = normalizeStudentNote(noteItem);
    const newFavorite = !norm.isFavorite;

    // 1. Optimistic update in local notes list
    setNotes((prev) =>
      prev.map((n) => {
        if (n.id !== noteItem.id) return n;
        const currentNorm = normalizeStudentNote(n);
        const payload = serializeUpdateNotePayload({
          noteTitle: currentNorm.noteTitle,
          noteContent: currentNorm.noteContent,
          tags: currentNorm.tags,
          isFavorite: newFavorite,
          videoTimestampSec: currentNorm.videoTimestampSec,
        });
        return {
          ...n,
          noteText: payload.noteText ?? n.noteText,
        };
      })
    );

    // 2. Sync with backend
    try {
      const payload = serializeUpdateNotePayload({
        noteTitle: norm.noteTitle,
        noteContent: norm.noteContent,
        tags: norm.tags,
        isFavorite: newFavorite,
        videoTimestampSec: norm.videoTimestampSec,
      });
      await updateStudentNote(noteItem.id, payload);
    } catch (e) {
      console.error("Failed to update favorite status:", e);
      if (currentMedia?.id) {
        void loadNotesForLesson(currentMedia.id);
      }
    }
  };

  const handleSeekToTimestamp = (sec: number | null) => {
    if (sec != null && Number.isFinite(sec)) {
      setVideoSeekTarget(sec);
      setTimeout(() => setVideoSeekTarget(null), 500);
    }
  };

  const handleDeleteNote = async (id: string) => {
    try {
      await deleteStudentNote(id);
    } catch (e) {}
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  // Video Heartbeat with deduplication & exit keepalive
  const sendMediaHeartbeat = useCallback(
    async (
      lessonId: string,
      positionSec: number,
      isEnded = false,
      videoDurationSec?: number,
      deltaWatchedSec?: number,
      fromSec?: number,
      toSec?: number,
      options?: { keepalive?: boolean }
    ) => {
      const now = Date.now();
      if (isEnded) {
        const lastSent = lastEndedSentTimeRef.current[lessonId] || 0;
        if (now - lastSent < 4000) return;
        lastEndedSentTimeRef.current[lessonId] = now;
      } else {
        const lastSent = lastHeartbeatSentTimeRef.current[lessonId] || 0;
        // Routine heartbeats must never be sent more frequently than every 10 seconds
        if (!options?.keepalive && now - lastSent < 10000) return;
        if (isHeartbeatInFlightRef.current && !options?.keepalive) {
          return;
        }
      }
      if (!options?.keepalive) {
        isHeartbeatInFlightRef.current = true;
      }
      lastHeartbeatSentTimeRef.current[lessonId] = now;

      const sendHeartbeatAttempt = async (attempt = 0): Promise<void> => {
        try {
          const dur = videoDurationSec ?? Math.floor(videoRef.current?.duration || 0);
          const res = await fetch(`${API_URL}/progress/lessons/${lessonId}/heartbeat`, {
            method: "POST",
            headers: getAuthHeaders(),
            keepalive: Boolean(options?.keepalive),
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
            // Only invalidate cache and trigger re-fetch when transitioning to completed for the first time
            const isTransitionToCompleted = Boolean((data.isCompleted || data.viewed || isEnded) && !hasTriggeredCompletionRef.current[lessonId]);
            if (isTransitionToCompleted) {
              hasTriggeredCompletionRef.current[lessonId] = true;
              invalidateCache("/progression");
              invalidateCache("/progress");
              void fetchStepAndProgression(false, true);
            }
          } else if (isEnded && attempt < 2 && !options?.keepalive) {
            setTimeout(() => sendHeartbeatAttempt(attempt + 1), 1000 * (attempt + 1));
          }
        } catch (err) {
          if (isEnded && attempt < 2 && !options?.keepalive) {
            setTimeout(() => sendHeartbeatAttempt(attempt + 1), 1000 * (attempt + 1));
          } else {
            console.warn("Heartbeat error:", err);
          }
        } finally {
          if (!options?.keepalive) {
            isHeartbeatInFlightRef.current = false;
          }
        }
      };

      await sendHeartbeatAttempt(0);
    },
    [fetchStepAndProgression]
  );

  const handlePlayerHeartbeat = useCallback(
    (
      pos: number,
      ended?: boolean,
      dur?: number,
      delta?: number,
      from?: number,
      to?: number,
      options?: { keepalive?: boolean }
    ) => {
      if (currentMedia?.id) {
        sendMediaHeartbeat(currentMedia.id, pos, ended, dur, delta, from, to, options);
      }
    },
    [currentMedia?.id, sendMediaHeartbeat]
  );


  // Next lesson helper
  const nextLesson = activeLessonIndex < videoLessons.length - 1 ? videoLessons[activeLessonIndex + 1] : null;

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
    (lessonId: string, fromVideoEnd = false) => {
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
        const areAllVideosDone = videoLessons.every(
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

          if (fromVideoEnd) {
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
          }
        } else if (fromVideoEnd) {
          setCelebrationMode("lesson");
          setIsCelebrationOpen(true);
        }

        return updated;
      });

      // 4. Background server sync (does NOT block UI or video progression)
      void (async () => {
        try {
          const lesson = allLessons.find((l: any) => l.id === lessonId);
          // For non-video lessons (e.g. PDF/reading), complete via endpoint.
          // Video/audio lessons already dispatch authoritative completion via onHeartbeat in the player.
          if (lesson && lesson.type !== "VIDEO" && lesson.type !== "AUDIO") {
            await fetch(`${API_URL}/progress/lessons/${lessonId}/complete`, {
              method: "POST",
              headers: getAuthHeaders(),
            });
            invalidateCache();
            void fetchStepAndProgression(false, true);
          }
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
        invalidateCache("/programs");
        void fetchStepAndProgression(false, true);
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

  const quizQuestions: QuizQuestion[] = (attemptQuestions && attemptQuestions.length > 0)
    ? attemptQuestions
    : (step?.quiz?.questions && step.quiz.questions.length > 0)
    ? step.quiz.questions
    : [];

  const safeActiveIndex = quizQuestions.length > 0
    ? Math.min(Math.max(0, activeQuizIndex), quizQuestions.length - 1)
    : 0;

  const currentQuizQuestion: QuizQuestion | undefined = quizQuestions[safeActiveIndex];

  // Strictly clamp activeQuizIndex whenever quiz questions count changes
  useEffect(() => {
    if (quizQuestions.length > 0 && activeQuizIndex >= quizQuestions.length) {
      setActiveQuizIndex(Math.max(0, quizQuestions.length - 1));
    }
  }, [quizQuestions.length, activeQuizIndex]);

  const renderLessonNavigationRow = () => {
    const hasPrevious = activeLessonIndex > 0;
    const prevLesson = hasPrevious ? videoLessons[activeLessonIndex - 1] : null;
    const isCurrentWatched = Boolean(
      lessonProgress[currentMedia?.id]?.isCompleted || isCurrentLessonLeftUnder30s
    );

    let nextBtnNode = null;

    if (activeLessonIndex < videoLessons.length - 1) {
      // Part N -> Part N+1
      const nextPart = videoLessons[activeLessonIndex + 1];
      nextBtnNode = (
        <button
          type="button"
          disabled={!isCurrentWatched}
          onClick={() => {
            if (currentMedia?.id) {
              handleLessonComplete(currentMedia.id, false);
            }
            setSelectedMediaId(nextPart.id);
          }}
          className={styles.btnPrimaryOrange}
          style={{
            opacity: !isCurrentWatched ? 0.6 : 1,
            cursor: !isCurrentWatched ? "not-allowed" : "pointer",
          }}
          title={
            !isCurrentWatched
              ? "Complete this video (or reach the last 30s) to unlock next part"
              : `Next: Part ${activeLessonIndex + 2} (${nextPart.title})`
          }
        >
          Next Part ({nextPart.title}) &rarr;
        </button>
      );
    } else if (stepMaterials.length > 0) {
      // Last video part -> Materials (strictly locked until this final video part is completed)
      nextBtnNode = (
        <button
          type="button"
          disabled={!isCurrentWatched}
          onClick={() => {
            if (currentMedia?.id) {
              handleLessonComplete(currentMedia.id, false);
            }
            if (isCurrentWatched || isMaterialsUnlocked) {
              setActiveTab("materials");
            }
          }}
          className={styles.btnPrimaryOrange}
          style={{
            opacity: !isCurrentWatched ? 0.6 : 1,
            cursor: !isCurrentWatched ? "not-allowed" : "pointer",
          }}
          title={
            !isCurrentWatched
              ? "Complete this video (or reach the last 30s) to unlock materials"
              : "Next: Module Learning Materials"
          }
        >
          Next: Materials ({stepMaterials.length}) &rarr;
        </button>
      );
    } else if (step?.quiz && !isQuizAlreadyPassed) {
      // Last video part & no materials -> Quiz
      nextBtnNode = isQuizUnlocked || isCurrentWatched ? (
        <button
          type="button"
          onClick={() => {
            if (currentMedia?.id) {
              handleLessonComplete(currentMedia.id, false);
            }
            setActiveTab("quiz");
          }}
          className={styles.btnPrimaryOrange}
        >
          Next: Module Quiz &rarr;
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
      );
    } else if (nextStep && nextStepId) {
      // Last part -> Next module
      const isReadyForNextStep = isStepCompleted || completedLessonsCount >= totalLessonsCount || isCurrentWatched;
      nextBtnNode = (
        <button
          type="button"
          disabled={!isReadyForNextStep}
          onClick={() => {
            if (isReadyForNextStep) {
              if (currentMedia?.id) {
                handleLessonComplete(currentMedia.id, false);
              }
              router.push(`/steps/${nextStepId}`);
            }
          }}
          className={styles.btnPrimaryOrange}
          style={{
            opacity: !isReadyForNextStep ? 0.6 : 1,
            cursor: !isReadyForNextStep ? "not-allowed" : "pointer",
          }}
        >
          {!isReadyForNextStep
            ? `🔒 Complete all parts to unlock Next Module`
            : `Next Module (${nextStep.title}) →`}
        </button>
      );
    } else {
      nextBtnNode = (
        <Link
          href={`/programs/${step?.programId}/steps`}
          className={styles.btnPrimaryOrange}
        >
          Course Roadmap &rarr;
        </Link>
      );
    }

    return (
      <div className={styles.lessonNavigationRow}>
        {hasPrevious ? (
          <button
            type="button"
            onClick={() => setSelectedMediaId(prevLesson?.id)}
            className={styles.btnSecondaryOutline}
          >
            &larr; Previous Part ({prevLesson?.title})
          </button>
        ) : prevStep ? (
          <Link
            href={`/steps/${prevStep.stepId || prevStep.id}`}
            className={styles.btnSecondaryOutline}
          >
            &larr; Previous Module
          </Link>
        ) : (
          <span />
        )}

        {nextBtnNode}
      </div>
    );
  };

  const renderMaterialsNavigationRow = () => {
    const lastVideo = videoLessons.length > 0 ? videoLessons[videoLessons.length - 1] : null;

    let nextBtnNode = null;
    if (step?.quiz && !isQuizAlreadyPassed) {
      nextBtnNode = isQuizUnlocked ? (
        <button
          type="button"
          onClick={() => setActiveTab("quiz")}
          className={styles.btnPrimaryOrange}
        >
          Next: Module Quiz &rarr;
        </button>
      ) : (
        <button
          type="button"
          disabled
          className={styles.btnSecondaryOutline}
          style={{ opacity: 0.6, cursor: "not-allowed" }}
          title="Complete all prerequisite parts to unlock the quiz"
        >
          🔒 Complete all parts to unlock Quiz
        </button>
      );
    } else if (nextStep && nextStepId) {
      const canAdvanceToNextStep = areAllVideosDone && areAllMaterialsDone;
      nextBtnNode = (
        <button
          type="button"
          disabled={!canAdvanceToNextStep}
          onClick={() => {
            if (canAdvanceToNextStep) {
              router.push(`/steps/${nextStepId}`);
            }
          }}
          className={styles.btnPrimaryOrange}
          style={{
            opacity: !canAdvanceToNextStep ? 0.6 : 1,
            cursor: !canAdvanceToNextStep ? "not-allowed" : "pointer",
          }}
        >
          {!canAdvanceToNextStep
            ? "🔒 Complete all materials to unlock Next Module"
            : `Next Module (${nextStep.title}) →`}
        </button>
      );
    } else {
      nextBtnNode = (
        <Link
          href={`/programs/${step?.programId}/steps`}
          className={styles.btnPrimaryOrange}
        >
          Finish Lesson &amp; View Roadmap &rarr;
        </Link>
      );
    }

    return (
      <div className={styles.lessonNavigationRow} style={{ marginTop: "1.5rem" }}>
        {lastVideo ? (
          <button
            type="button"
            onClick={() => {
              setActiveTab("video");
              setSelectedMediaId(lastVideo.id);
            }}
            className={styles.btnSecondaryOutline}
          >
            &larr; Previous Part ({lastVideo.title})
          </button>
        ) : prevStep ? (
          <Link
            href={`/steps/${prevStep.stepId || prevStep.id}`}
            className={styles.btnSecondaryOutline}
          >
            &larr; Previous Module
          </Link>
        ) : (
          <span />
        )}

        {nextBtnNode}
      </div>
    );
  };

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
          UNIFIED SEGMENTED LESSON FLOW (Part 1 -> Part 2 -> Materials -> Quiz)
          ===================================================================== */}
      <div>
        <nav className={styles.lessonFlowStrip} aria-label="Course Lesson Flow">
          {/* Dynamic Video Parts */}
          {videoLessons.map((l: any, idx: number) => {
            const isSelected = activeTab === "video" && currentMedia?.id === l.id;
            const isDone = Boolean(lessonProgress[l.id]?.isCompleted || lessonProgress[l.id]?.viewed);
            const prevLesson = idx > 0 ? videoLessons[idx - 1] : null;
            const isPrevDone = Boolean(
              !prevLesson ||
              lessonProgress[prevLesson.id]?.isCompleted ||
              lessonProgress[prevLesson.id]?.viewed ||
              (prevLesson.id === currentMedia?.id && isCurrentLessonLeftUnder30s)
            );
            const isLocked = idx > 0 && !isPrevDone && !isDone;

            return (
              <button
                key={l.id}
                type="button"
                disabled={isLocked}
                onClick={() => {
                  if (!isLocked) {
                    if (currentMedia?.id && isCurrentLessonLeftUnder30s) {
                      handleLessonComplete(currentMedia.id, false);
                    }
                    setActiveTab("video");
                    setSelectedMediaId(l.id);
                  }
                }}
                className={`${styles.flowStepItem} ${
                  isSelected ? styles.flowStepItemActive : ""
                } ${isDone ? styles.flowStepItemCompleted : ""} ${
                  isLocked ? styles.flowStepItemLocked : ""
                }`}
                title={isLocked ? "Complete previous parts to unlock" : `Part ${idx + 1}: ${l.title}`}
                aria-current={isSelected ? "step" : undefined}
              >
                <span className={styles.flowStepBadge}>
                  {isDone ? "✓" : isLocked ? "🔒" : `${idx + 1}`}
                </span>
                <div className={styles.flowStepText}>
                  <span className={styles.flowStepLabel}>Part {idx + 1}</span>
                  <span className={styles.flowStepTitle}>{l.title || "Video Lesson"}</span>
                </div>
                {isSelected && <span className={styles.flowStepActiveIndicator} aria-hidden="true" />}
              </button>
            );
          })}

          {/* Step Materials */}
          {stepMaterials.length > 0 && (
            <button
              type="button"
              disabled={!isMaterialsUnlocked}
              onClick={() => {
                if (isMaterialsUnlocked) {
                  setActiveTab("materials");
                }
              }}
              className={`${styles.flowStepItem} ${
                activeTab === "materials" ? styles.flowStepItemActive : ""
              } ${areAllMaterialsDone && isMaterialsUnlocked ? styles.flowStepItemCompleted : ""} ${
                !isMaterialsUnlocked ? styles.flowStepItemLocked : ""
              }`}
              style={{
                opacity: !isMaterialsUnlocked ? 0.65 : 1,
                cursor: !isMaterialsUnlocked ? "not-allowed" : "pointer",
              }}
              title={
                !isMaterialsUnlocked
                  ? `Complete all video parts to unlock materials (${stepMaterials.length} items)`
                  : `Materials (${stepMaterials.length} items)`
              }
              aria-current={activeTab === "materials" ? "step" : undefined}
            >
              <span className={styles.flowStepBadge}>
                {!isMaterialsUnlocked ? (
                  "🔒"
                ) : areAllMaterialsDone ? (
                  "✓"
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                )}
              </span>
              <div className={styles.flowStepText}>
                <span className={styles.flowStepLabel}>Materials</span>
                <span className={styles.flowStepTitle}>
                  {!isMaterialsUnlocked
                    ? "Locked"
                    : `${stepMaterials.length} ${stepMaterials.length === 1 ? "Item" : "Items"}`}
                </span>
              </div>
              {activeTab === "materials" && <span className={styles.flowStepActiveIndicator} aria-hidden="true" />}
            </button>
          )}

          {/* Step Quiz */}
          {hasQuiz && (
            <button
              type="button"
              disabled={!isQuizUnlocked}
              onClick={() => {
                if (isQuizUnlocked) {
                  setActiveTab("quiz");
                }
              }}
              className={`${styles.flowStepItem} ${
                activeTab === "quiz" ? styles.flowStepItemActive : ""
              } ${isQuizAlreadyPassed ? styles.flowStepItemCompleted : ""} ${
                !isQuizUnlocked ? styles.flowStepItemLocked : ""
              }`}
              title={
                !isQuizUnlocked
                  ? `Complete all parts to unlock Quiz (${completedLessonsCount}/${totalLessonsCount} completed)`
                  : "Module Quiz"
              }
              aria-current={activeTab === "quiz" ? "step" : undefined}
            >
              <span className={styles.flowStepBadge}>
                {isQuizAlreadyPassed ? "✓" : !isQuizUnlocked ? "🔒" : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                )}
              </span>
              <div className={styles.flowStepText}>
                <span className={styles.flowStepLabel}>Quiz</span>
                <span className={styles.flowStepTitle}>
                  {isQuizAlreadyPassed
                    ? "Passed"
                    : quizQuestions.length > 0 && isQuizUnlocked
                    ? `${quizQuestions.length} Questions`
                    : !isQuizUnlocked
                    ? "Locked"
                    : "Assessment"}
                </span>
              </div>
              {activeTab === "quiz" && <span className={styles.flowStepActiveIndicator} aria-hidden="true" />}
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
                        Part {activeLessonIndex + 1} of {videoLessons.length}
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

                  {/* 16:9 Video Viewport (Strictly for Video Lessons) */}
                  {currentMedia?.mediaUrl ? (
                    <div className={styles.videoPlayerViewport}>
                      <CompulsoryVideoPlayer
                        lessonId={currentMedia.id}
                        videoSrc={resolveVideoSrc(currentMedia.mediaUrl)}
                        userName={userName}
                        userEmail={userEmail}
                        durationSec={currentMedia.durationSec || 0}
                        initialPositionSec={lessonProgress[currentMedia.id]?.lastPositionSec || 0}
                        onHeartbeat={handlePlayerHeartbeat}
                        onComplete={() => handleLessonComplete(currentMedia.id, false)}
                        onVideoEnd={() => handleLessonComplete(currentMedia.id, true)}
                        onTimeUpdate={(sec) => setCurrentVideoTime(sec)}
                        seekToTime={videoSeekTarget}
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
              </div>

              {/* Right Column: Personal Notes Widget & About Step Card */}
              <div className={styles.notesRightCol}>
                {/* Notes & Highlights Card with Rich Parity Format */}
                <div className={styles.notesCompanionCard}>
                  <div className={styles.notesCompanionHeader}>
                    <div>
                      <h4 className={styles.notesCompanionTitle}>My Notes &amp; Highlights</h4>
                      <span className={styles.notesCompanionMeta}>
                        Personal • Private to you • {notes.length} saved
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setEditingModalNote({
                          courseId: step?.programId,
                          courseName: step?.program?.title,
                          moduleId: stepId,
                          moduleName: step?.title,
                          lessonId: currentMedia?.id,
                          lessonName: currentMedia?.title,
                          noteTitle: noteTitle,
                          noteContent: noteInput,
                          isFavorite: noteIsFavorite,
                          videoTimestampSec: capturedTimestamp ?? (currentVideoTime > 0 ? Math.floor(currentVideoTime) : null),
                        });
                        setIsNoteModalOpen(true);
                      }}
                      style={{
                        background: "none",
                        border: "1px solid #fed7aa",
                        borderRadius: 6,
                        padding: "2px 7px",
                        color: "#ea580c",
                        fontSize: "0.74rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 3,
                      }}
                      title="Open Full Note Editor"
                    >
                      <span>⤢</span> Full Editor
                    </button>
                  </div>

                  {/* Rich Note Writing Form (Screenshot 3 style) */}
                  <div className={styles.noteFormContainer}>
                    {/* Note Title + Star Favorite + Timestamp Row */}
                    <div className={styles.noteTitleRow}>
                      <input
                        type="text"
                        value={noteTitle}
                        onChange={(e) => setNoteTitle(e.target.value.slice(0, 100))}
                        placeholder="Note title (e.g., Installation Steps)..."
                        className={styles.noteTitleInput}
                      />
                      <button
                        type="button"
                        onClick={() => setNoteIsFavorite(!noteIsFavorite)}
                        className={`${styles.noteStarToggleBtn} ${noteIsFavorite ? styles.noteStarToggleBtnActive : ""}`}
                        title={noteIsFavorite ? "Remove favorite" : "Mark as favorite"}
                        aria-label="Toggle favorite"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill={noteIsFavorite ? "#f59e0b" : "none"} stroke={noteIsFavorite ? "#f59e0b" : "#94a3b8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCapturedTimestamp(capturedTimestamp !== null ? null : Math.floor(currentVideoTime))}
                        className={styles.noteTimestampCaptureBtn}
                        title="Click to capture or clear current video timestamp"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        <span>{formatSecondsToTimestamp(capturedTimestamp !== null ? capturedTimestamp : Math.floor(currentVideoTime))}</span>
                      </button>
                    </div>

                    {/* Visual Rich Text Canvas - WYSIWYG, No programmer tokens/HTML visible */}
                    <div style={{ marginTop: 6, marginBottom: 6 }}>
                      <VisualRichTextEditor
                        key={noteEditorResetKey}
                        initialContent={noteInput}
                        onChange={(html, text) => {
                          setNoteInput(html);
                          setNotePlainText(text);
                        }}
                        placeholder="Write your thoughts, reflections, insights, or key takeaways here..."
                        minHeight={85}
                        compact
                      />
                    </div>

                    {/* Action Bar */}
                    <div className={styles.noteToolbarRow} style={{ marginTop: 6 }}>
                      <span style={{ fontSize: "0.72rem", color: "#a8a29e" }}>
                        {(notePlainText || stripHtmlToPlainText(noteInput)).length}/5000
                      </span>

                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {(noteTitle || !isEditorEmpty(noteInput) || noteIsFavorite || capturedTimestamp !== null) && (
                          <button
                            type="button"
                            onClick={() => {
                              setNoteTitle("");
                              setNoteInput("");
                              setNotePlainText("");
                              setNoteIsFavorite(false);
                              setCapturedTimestamp(null);
                              setNoteEditorResetKey((k) => k + 1);
                            }}
                            className={styles.btnSecondaryOutline}
                            style={{ padding: "0.35rem 0.65rem", fontSize: "0.76rem" }}
                          >
                            Cancel
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleSaveNote}
                          disabled={(isEditorEmpty(noteInput) && !noteTitle.trim()) || isSavingNote}
                          className={styles.btnPrimaryOrange}
                          style={{ padding: "0.4rem 0.95rem", fontSize: "0.8rem", fontWeight: 700 }}
                        >
                          {isSavingNote ? "Saving..." : "Save Note"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Saved Notes Feed with Debounced Search & Sort */}
                  {notes.length > 0 && (
                    <>
                      <div className={styles.savedNotesHeader}>
                        <div className={styles.savedNotesHeading}>
                          <span>Your Notes</span>
                          <span className={styles.savedNotesHeadingBadge}>({displayedNotes.length})</span>
                        </div>

                        <div className={styles.savedNotesControls}>
                          <select
                            value={notesSort}
                            onChange={(e) => setNotesSort(e.target.value as any)}
                            className={styles.savedNotesSortSelect}
                            aria-label="Sort notes"
                          >
                            <option value="recent">Recent</option>
                            <option value="oldest">Oldest</option>
                            <option value="favorite">Favorites</option>
                          </select>

                          <div className={styles.savedNotesSearchBox}>
                            <span className={styles.savedNotesSearchIcon}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                              </svg>
                            </span>
                            <input
                              type="text"
                              value={notesSearch}
                              onChange={(e) => setNotesSearch(e.target.value)}
                              placeholder="Search..."
                              className={styles.savedNotesSearchInput}
                              aria-label="Filter notes"
                            />
                          </div>
                        </div>
                      </div>

                      <div className={styles.savedNotesFeed}>
                        {displayedNotes.length === 0 ? (
                          <div style={{ textAlign: "center", padding: "1.25rem 0.5rem", color: "#a8a29e", fontSize: "0.82rem" }}>
                            No notes match &ldquo;{debouncedNotesSearch}&rdquo;
                          </div>
                        ) : (
                          displayedNotes.map((n, nIdx) => {
                            const norm = normalizeStudentNote(n);
                            const cleanHtml = sanitizeNoteHtml(markdownToHtml(norm.noteContent));
                            const palette = [
                              { bg: "#fff7ed", color: "#ea580c", border: "#fed7aa" },
                              { bg: "#eff6ff", color: "#2563eb", border: "#bfdbfe" },
                              { bg: "#f0fdf4", color: "#16a34a", border: "#bbf7d0" },
                              { bg: "#faf5ff", color: "#9333ea", border: "#e9d5ff" },
                            ][nIdx % 4] ?? { bg: "#fff7ed", color: "#ea580c", border: "#fed7aa" };

                            return (
                              <article key={n.id} className={styles.savedNoteCard}>
                                <div className={styles.savedNoteTopRow}>
                                  <div className={styles.savedNoteTopLeft}>
                                    <span
                                      className={styles.savedNoteDocIconBadge}
                                      style={{ background: palette.bg, color: palette.color, border: `1px solid ${palette.border}` }}
                                      aria-hidden="true"
                                    >
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                        <polyline points="14 2 14 8 20 8" />
                                      </svg>
                                    </span>
                                    <h5 className={styles.savedNoteTitle} title={norm.noteTitle}>
                                      {norm.noteTitle}
                                    </h5>
                                  </div>

                                  <div className={styles.savedNoteTopRight}>
                                    {norm.videoTimestampSec !== null && norm.videoTimestampSec !== undefined && (
                                      <button
                                        type="button"
                                        onClick={() => handleSeekToTimestamp(norm.videoTimestampSec)}
                                        className={styles.savedNoteTimestampBtn}
                                        title="Jump video to this timestamp"
                                      >
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                          <circle cx="12" cy="12" r="10" />
                                          <polyline points="12 6 12 12 16 14" />
                                        </svg>
                                        <span>{norm.formattedTimestamp}</span>
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => handleToggleNoteFavorite(n)}
                                      className={styles.savedNoteStarBtn}
                                      style={{ color: norm.isFavorite ? "#f59e0b" : "#cbd5e1" }}
                                      title={norm.isFavorite ? "Remove favorite" : "Mark as favorite"}
                                      aria-label="Toggle favorite"
                                    >
                                      <svg width="15" height="15" viewBox="0 0 24 24" fill={norm.isFavorite ? "#f59e0b" : "none"} stroke={norm.isFavorite ? "#f59e0b" : "#94a3b8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                      </svg>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingModalNote(norm);
                                        setIsNoteModalOpen(true);
                                      }}
                                      className={styles.savedNoteEditBtn}
                                      title="Edit this note in full editor"
                                      aria-label="Edit note"
                                    >
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                      </svg>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleDeleteNote(n.id)}
                                      className={styles.savedNoteDeleteBtn}
                                      title="Delete note"
                                      aria-label="Delete note"
                                    >
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <line x1="18" y1="6" x2="6" y2="18" />
                                        <line x1="6" y1="6" x2="18" y2="18" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>

                                <div
                                  className={styles.savedNoteBody}
                                  dangerouslySetInnerHTML={{ __html: cleanHtml }}
                                />

                                <div className={styles.savedNoteFooter}>
                                  <span>
                                    {n.updatedAt ? `Updated ${new Date(n.updatedAt).toLocaleDateString()}` : "Saved"}
                                  </span>
                                  {norm.videoTimestampSec !== null && norm.videoTimestampSec !== undefined && (
                                    <button
                                      type="button"
                                      onClick={() => handleSeekToTimestamp(norm.videoTimestampSec)}
                                      style={{ background: "none", border: "none", color: "#ea580c", fontSize: "0.72rem", fontWeight: 600, cursor: "pointer", padding: 0 }}
                                    >
                                      Go to Video &rarr;
                                    </button>
                                  )}
                                </div>
                              </article>
                            );
                          })
                        )}
                      </div>
                    </>
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

              {isQuizAlreadyPassed ? (
                /* PASSED COMPLETION CARD */
                <div
                  style={{
                    background: "#f0fdf4",
                    border: "1px solid #86efac",
                    color: "#14532d",
                    padding: "28px 24px",
                    borderRadius: 14,
                    marginBottom: 20,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: "2.5rem", marginBottom: 10 }}>🎉</div>
                  <h3 style={{ margin: "0 0 8px", fontSize: "1.25rem", fontWeight: 700, color: "#15803d" }}>
                    Module Knowledge Check Passed!
                  </h3>
                  <p style={{ margin: "0 0 18px", fontSize: "0.92rem", color: "#166534", maxWidth: 540, marginLeft: "auto", marginRight: "auto", lineHeight: 1.5 }}>
                    {lastQuizResult?.score !== undefined
                      ? `Great job! You achieved a score of ${lastQuizResult.score}% (Pass threshold: ${lastQuizResult.passMark ?? 75}%).`
                      : "Great job! You have satisfied all requirements for this module."}{" "}
                    {nextStep ? `Step ${nextStep.sequence}: ${nextStep.title} is now unlocked.` : "You have completed all modules in this program."}
                  </p>
                  <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                    {nextStep && nextStepId ? (
                      <button
                        type="button"
                        onClick={() => router.push(`/steps/${nextStepId}`)}
                        className={styles.btnPrimaryOrange}
                        style={{ padding: "12px 24px", fontSize: "0.95rem" }}
                      >
                        Continue to Next Module ({nextStep.title}) &rarr;
                      </button>
                    ) : (
                      <Link
                        href={`/programs/${step?.programId}/steps`}
                        className={styles.btnPrimaryOrange}
                        style={{ padding: "12px 24px", fontSize: "0.95rem", textDecoration: "none" }}
                      >
                        Return to Learning Path &rarr;
                      </Link>
                    )}
                  </div>
                </div>
              ) : quizQuestions.length === 0 ? (
                /* EMPTY STATE: NO QUESTIONS CONFIGURED BY INSTRUCTOR */
                <div
                  className={styles.emptyStateCard}
                  style={{
                    background: "#fffdfa",
                    border: "1px dashed #e7dfd5",
                    padding: "2.5rem 1.5rem",
                    borderRadius: 14,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: "2rem", marginBottom: 8 }}>📋</div>
                  <h4 style={{ margin: "0 0 6px", fontSize: "1.05rem", fontWeight: 700, color: "#1c1917" }}>
                    No Questions Configured Yet
                  </h4>
                  <p style={{ margin: "0 0 16px", fontSize: "0.88rem", color: "#78716a", maxWidth: 440, marginLeft: "auto", marginRight: "auto" }}>
                    The instructor has not added questions to this module&apos;s knowledge check yet.
                  </p>
                  {nextStep && nextStepId ? (
                    <button
                      type="button"
                      onClick={() => router.push(`/steps/${nextStepId}`)}
                      className={styles.btnPrimaryOrange}
                    >
                      Continue to Next Module ({nextStep.title}) &rarr;
                    </button>
                  ) : (
                    <Link href={`/programs/${step?.programId}/steps`} className={styles.btnPrimaryOrange}>
                      Return to Learning Path &rarr;
                    </Link>
                  )}
                </div>
              ) : (
                /* ACTIVE QUIZ QUESTION CARD */
                <>
                  {lastQuizResult && !lastQuizResult.passed && lastQuizResult.status !== "IN_PROGRESS" && (
                    <div
                      style={{
                        background: "#fee2e2",
                        border: "1px solid #fca5a5",
                        color: "#7f1d1d",
                        padding: "16px 20px",
                        borderRadius: 12,
                        marginBottom: 20,
                      }}
                    >
                      <h4 style={{ margin: "0 0 6px", fontSize: "1.05rem", fontWeight: 700 }}>
                        Assessment Not Passed Yet
                      </h4>
                      <p style={{ margin: "0 0 12px", fontSize: "0.88rem" }}>
                        Score: {lastQuizResult.score}% (Pass threshold: {lastQuizResult.passMark ?? 75}%).
                        Please review the video lessons and try again.
                      </p>
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
                        style={{ padding: "8px 16px", fontSize: "0.85rem", cursor: isStartingQuiz ? "wait" : "pointer" }}
                      >
                        {isStartingQuiz ? "Starting..." : "Try Again →"}
                      </button>
                    </div>
                  )}

                  {currentQuizQuestion && (
                    <div className={styles.quizGrid}>
                      {/* Left Column: Question Card */}
                      <div className={styles.questionCard}>
                        <div className={styles.questionNumberLabel}>
                          Question {safeActiveIndex + 1} of {quizQuestions.length}
                        </div>
                        {(currentQuizQuestion as any).imageUrl && (
                          <div style={{ marginBottom: "1rem", borderRadius: 10, overflow: "hidden", border: "1px solid #ece6dd", maxWidth: 480 }}>
                            <img
                              src={(currentQuizQuestion as any).imageUrl}
                              alt={`Question ${safeActiveIndex + 1}`}
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
                            disabled={safeActiveIndex === 0}
                            onClick={() => setActiveQuizIndex((prev) => Math.max(0, prev - 1))}
                            className={styles.btnSecondaryOutline}
                            style={{ opacity: safeActiveIndex === 0 ? 0.5 : 1 }}
                          >
                            &larr; Previous Question
                          </button>

                          {safeActiveIndex < quizQuestions.length - 1 ? (
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
                            const isCurrent = idx === safeActiveIndex;
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
                  )}
                </>
              )}
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
                          <div className={styles.noteIconSquare}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                              <line x1="16" y1="13" x2="8" y2="13" />
                              <line x1="16" y1="17" x2="8" y2="17" />
                              <polyline points="10 9 9 9 8 9" />
                            </svg>
                          </div>
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
                            aria-label="Delete note"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              <line x1="10" y1="11" x2="10" y2="17" />
                              <line x1="14" y1="11" x2="14" y2="17" />
                            </svg>
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
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
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
                  .filter((m) => m.title.toLowerCase().includes(debouncedMaterialsSearch.toLowerCase()))
                  .map((m) => {
                    const isPdf = m.type === "PDF" || (m.mediaUrl && m.mediaUrl.toLowerCase().includes(".pdf"));
                    const isDone = Boolean(lessonProgress[m.id]?.isCompleted || lessonProgress[m.id]?.viewed);
                    const downloadUrl = sanitizeExternalUrl(
                      isPdf
                        ? `${API_URL}/media/document/${encodeURIComponent(m.id)}?token=${encodeURIComponent(typeof window !== "undefined" ? localStorage.getItem("token") || "" : "")}`
                        : resolveMediaDownloadUrl(m.mediaUrl)
                    );
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
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <h4 className={styles.materialTitle}>{m.title}</h4>
                              {isDone ? (
                                <span
                                  className={styles.watchedPill}
                                  style={{
                                    background: "#dcfce7",
                                    color: "#15803d",
                                    border: "1px solid #bbf7d0",
                                    padding: "2px 8px",
                                    borderRadius: 6,
                                    fontSize: "0.74rem",
                                    fontWeight: 700,
                                  }}
                                >
                                  ✓ Read
                                </span>
                              ) : (
                                <span
                                  style={{
                                    fontSize: "0.72rem",
                                    background: "#fef3c7",
                                    color: "#b45309",
                                    padding: "2px 8px",
                                    borderRadius: 6,
                                    fontWeight: 700,
                                  }}
                                >
                                  Ready to Read
                                </span>
                              )}
                            </div>
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
                              title="Read this PDF directly in the browser"
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                              </svg>
                              <span>{isDone ? "Read Again" : "Read PDF"}</span>
                            </button>
                          )}

                          {!isDone && (
                            <button
                              type="button"
                              onClick={() => handleMaterialComplete(m.id)}
                              className={styles.btnSecondaryOutline}
                              style={{
                                color: "#15803d",
                                borderColor: "#86efac",
                                background: "#f0fdf4",
                                fontWeight: 600,
                              }}
                              title="Mark this document as read"
                            >
                              ✓ Mark as Read
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

                {/* All Materials Completed Confirmation Banner */}
                {areAllMaterialsDone && (
                  <div
                    style={{
                      marginTop: "1.5rem",
                      padding: "1rem 1.25rem",
                      background: "#f0fdf4",
                      border: "1px solid #bbf7d0",
                      borderRadius: 12,
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: "#dcfce7",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#16a34a",
                        fontSize: "1rem",
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                      aria-hidden="true"
                    >
                      ✓
                    </div>
                    <div>
                      <strong style={{ display: "block", color: "#166534", fontSize: "0.95rem", marginBottom: 2 }}>
                        All materials in this module are completed!
                      </strong>
                      <span style={{ fontSize: "0.84rem", color: "#15803d" }}>
                        {hasQuiz && !isQuizAlreadyPassed
                          ? "You are ready to take the module comprehension quiz."
                          : nextStepId
                          ? "You are ready to advance to the next module."
                          : "You have completed this module."}
                      </span>
                    </div>
                  </div>
                )}

                {stepMaterials.filter((m) => m.title.toLowerCase().includes(debouncedMaterialsSearch.toLowerCase())).length === 0 && (
                  <div className={styles.emptyStateCard} style={{ padding: "2rem", textAlign: "center" }}>
                    <p style={{ margin: 0, color: "#78716a" }}>
                      No materials found matching &ldquo;{debouncedMaterialsSearch}&rdquo;
                    </p>
                  </div>
                )}

                {/* Materials Navigation Row (Previous Part / Next Part) */}
                {renderMaterialsNavigationRow()}
              </div>
            </div>
          )}
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
                        if (isLessonPdf(l)) {
                          setActiveTab("materials");
                          handleViewPdf(l);
                        } else {
                          setSelectedMediaId(l.id);
                          setActiveTab("video");
                        }
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
      <RichNoteEditorModal
        isOpen={isNoteModalOpen}
        initialNote={editingModalNote}
        onClose={() => {
          setIsNoteModalOpen(false);
          setEditingModalNote(null);
        }}
        onSave={async (updated) => {
          if (updated.noteId) {
            const payload = serializeUpdateNotePayload({
              noteTitle: updated.noteTitle,
              noteContent: updated.noteContent,
              tags: updated.tags,
              isFavorite: updated.isFavorite,
              videoTimestampSec: updated.videoTimestampSec,
            });
            const updatedRaw = await updateStudentNote(updated.noteId, payload);
            setNotes((prev) =>
              prev.map((n) => (n.id === updated.noteId ? updatedRaw : n))
            );
          } else if (currentMedia?.id) {
            const payload = serializeCreateNotePayload({
              courseId: step?.programId,
              moduleId: stepId,
              lessonId: currentMedia.id,
              noteTitle: updated.noteTitle || "Untitled Note",
              noteContent: updated.noteContent || "",
              tags: updated.tags,
              isFavorite: updated.isFavorite,
              videoTimestampSec: updated.videoTimestampSec,
              sourcePage: "lesson_player",
            });
            const saved = await createStudentNote(payload);
            setNotes((prev) => [saved, ...prev]);
          }
          setIsNoteModalOpen(false);
          setEditingModalNote(null);
        }}
        onDelete={async (noteId) => {
          await handleDeleteNote(noteId);
          setIsNoteModalOpen(false);
          setEditingModalNote(null);
        }}
        onJumpToLesson={(_cId, _lId, ts) => {
          handleSeekToTimestamp(ts);
          setIsNoteModalOpen(false);
        }}
      />
      <PdfViewerModal
        isOpen={viewerPdf.isOpen}
        onClose={() => setViewerPdf((prev) => ({ ...prev, isOpen: false }))}
        documentId={viewerPdf.id}
        title={viewerPdf.title}
        mediaUrl={viewerPdf.mediaUrl}
        downloadUrl={viewerPdf.downloadUrl}
        isRead={Boolean(lessonProgress[viewerPdf.id]?.isCompleted || lessonProgress[viewerPdf.id]?.viewed)}
        onMarkAsRead={handleMaterialComplete}
        onNextSection={handleAdvanceFromMaterial}
      />
    </div>
  );
}