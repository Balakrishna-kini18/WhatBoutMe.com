"use client";

import React, { useState, useRef, useEffect } from "react";
import styles from "./LearnerPortalFlow.module.css";
import { formatNoteDate, formatVideoTime } from "../lib/timezone";

export type LearnerStepView =
  | "MODULE_PAGE"
  | "VIDEO_PAGE"
  | "RESOURCE_PAGE"
  | "NOTES_PAGE"
  | "QUIZ_PAGE"
  | "NEXT_STEP_PAGE";

export interface Lesson {
  id: string;
  title: string;
  type: string; // "VIDEO" | "PDF" | "TEXT"
  mediaUrl: string;
  durationSec?: number | null;
  durationFormatted?: string;
  status?: "Completed" | "In progress" | "Locked" | "Available next";
  isFreePreview?: boolean;
}

export interface StepModule {
  id: string;
  sequence: number;
  title: string;
  description: string;
  lessons?: Lesson[];
  quiz?: any | null;
  status?: "Completed" | "In progress" | "Locked" | "Available next";
}

export interface LearnerPortalFlowProps {
  module: StepModule;
  allModules?: StepModule[];
  courseTitle?: string;
  cohortName?: string;
  totalStepsCount?: number;
  completedStepsCount?: number;
  overallProgressPercentage?: number;
  learnerName?: string;
  learnerEmail?: string;
  initialStep?: LearnerStepView;
  learningStep?: LearnerStepView;
  onStepChange?: (step: LearnerStepView) => void;
  selectedModuleId?: string;
  onModuleSelect?: (moduleId: string) => void;
  selectedLessonId?: string;
  onLessonSelect?: (lessonId: string) => void;
  activeQuizQuestionIndex?: number;
  onQuizQuestionIndexChange?: (idx: number) => void;
  onBackToEdit?: () => void;
  onContinueToReview?: () => void;
  onNextModule?: (nextModuleId?: string) => void;
  isSimulatorMode?: boolean;
}

export const getModuleLessons = (m: StepModule): Lesson[] => {
  if (m.lessons && m.lessons.length > 0) {
    return m.lessons;
  }
  const isCompleted = m.status === "Completed";
  return [
    {
      id: `${m.id}-les-1`,
      title: `${m.title}: Foundations & Baseline Assessment`,
      type: "VIDEO",
      mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
      durationSec: 492,
      durationFormatted: "08:12",
      status: "Completed",
    },
    {
      id: `${m.id}-les-2`,
      title: `${m.title}: Core Applied Strategy & Response Matrix`,
      type: "VIDEO",
      mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
      durationSec: 860,
      durationFormatted: "14:20",
      status: isCompleted ? "Completed" : "In progress",
    },
    {
      id: `${m.id}-les-3`,
      title: `${m.title}: Advanced Somatic Regulation & Crisis Protocols`,
      type: "VIDEO",
      mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
      durationSec: 705,
      durationFormatted: "11:45",
      status: isCompleted ? "Completed" : "Locked",
    },
    {
      id: `${m.id}-les-4`,
      title: `${m.title}: Executive Playbook & Worksheet`,
      type: "PDF",
      mediaUrl: "/docs/Executive_Leadership_Matrix.pdf",
      durationSec: 665,
      durationFormatted: "11:05",
      status: isCompleted ? "Completed" : "Locked",
    },
    {
      id: `${m.id}-les-5`,
      title: `${m.title}: Mastery Evaluation Assessment`,
      type: "QUIZ",
      mediaUrl: "",
      durationSec: 900,
      durationFormatted: "15:00",
      status: isCompleted ? "Completed" : "Locked",
    },
  ];
};

const buildDefault12Modules = (initialMod: StepModule): StepModule[] => [
  {
    id: initialMod.id || "step-1",
    sequence: 1,
    title: initialMod.title || "Foundations of Emotional Intelligence & Stress Response",
    description:
      initialMod.description ||
      "Master the foundational emotional self-regulation techniques and trigger mapping methodologies required for modern executive leadership.",
    status: initialMod.status || "In progress",
    lessons:
      initialMod.lessons && initialMod.lessons.length > 0
        ? initialMod.lessons
        : [
            {
              id: "les-1-1",
              title: "Foundations of Mindful Leadership & Emotional Baselines",
              type: "VIDEO",
              mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
              durationSec: 492,
              durationFormatted: "08:12",
              status: "Completed",
            },
            {
              id: "les-1-2",
              title: "Core Mindset Shift: The Emotional Response Matrix",
              type: "VIDEO",
              mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
              durationSec: 860,
              durationFormatted: "14:20",
              status: "In progress",
            },
            {
              id: "les-1-3",
              title: "Advanced Somatic Regulation & Crisis De-escalation",
              type: "VIDEO",
              mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
              durationSec: 705,
              durationFormatted: "11:45",
              status: "Locked",
            },
            {
              id: "les-1-4",
              title: "Executive Leadership Framework & Trigger Mapping Worksheet",
              type: "PDF",
              mediaUrl: "/docs/Executive_Leadership_Matrix.pdf",
              durationSec: 665,
              durationFormatted: "11:05",
              status: "Locked",
            },
            {
              id: "les-1-5",
              title: "Module 1 Mastery Knowledge Check Assessment",
              type: "QUIZ",
              mediaUrl: "",
              durationSec: 900,
              durationFormatted: "15:00",
              status: "Locked",
            },
          ],
    quiz: initialMod.quiz,
  },
  {
    id: "step-2",
    sequence: 2,
    title: "Strategic Influence & High-Stakes Communication",
    description: "Navigating complex stakeholder dynamics with structured persuasion.",
    status: "Completed",
    lessons: [
      {
        id: "les-2-1",
        title: "Persuasive Architecture: High-Stakes Stakeholder Alignment",
        type: "VIDEO",
        mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
        durationSec: 540,
        durationFormatted: "09:00",
        status: "Completed",
      },
      {
        id: "les-2-2",
        title: "Cognitive Perspective Taking in Multi-Party Negotiations",
        type: "VIDEO",
        mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
        durationSec: 672,
        durationFormatted: "11:12",
        status: "Completed",
      },
      {
        id: "les-2-3",
        title: "Stakeholder Alignment & Executive Synthesis Playbook",
        type: "PDF",
        mediaUrl: "/docs/Executive_Leadership_Matrix.pdf",
        durationSec: null,
        durationFormatted: "07:30",
        status: "Completed",
      },
      {
        id: "les-2-4",
        title: "Strategic Communication Practical Evaluation",
        type: "QUIZ",
        mediaUrl: "",
        durationSec: null,
        durationFormatted: "12:00",
        status: "Completed",
      },
    ],
  },
  {
    id: "step-3",
    sequence: 3,
    title: "Executive Presence & Organizational Culture",
    description: "Instilling psychological safety and high-performance norms across cross-functional teams.",
    status: "Completed",
    lessons: [
      {
        id: "les-3-1",
        title: "The Anatomy of Executive Gravitas & Vocal Presence",
        type: "VIDEO",
        mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
        durationSec: 615,
        durationFormatted: "10:15",
        status: "Completed",
      },
      {
        id: "les-3-2",
        title: "Cultivating Psychological Safety in Cross-Functional Teams",
        type: "VIDEO",
        mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
        durationSec: 790,
        durationFormatted: "13:10",
        status: "Completed",
      },
      {
        id: "les-3-3",
        title: "Culture Diagnostics & Behavioral Scorecard",
        type: "PDF",
        mediaUrl: "/docs/Executive_Leadership_Matrix.pdf",
        durationSec: null,
        durationFormatted: "08:45",
        status: "Completed",
      },
      {
        id: "les-3-4",
        title: "Executive Presence Competency Review",
        type: "QUIZ",
        mediaUrl: "",
        durationSec: null,
        durationFormatted: "14:00",
        status: "Completed",
      },
    ],
  },
  {
    id: "step-4",
    sequence: 4,
    title: "Conflict De-Escalation & Resolution Dynamics",
    description: "Systematic methodologies for navigating volatile interpersonal impasses and restoring collaborative alignment.",
    status: "Locked",
  },
  {
    id: "step-5",
    sequence: 5,
    title: "Adaptive Decision-Making Under Cognitive Load",
    description: "Heuristics and stress-testing protocols to prevent decision fatigue and bias in high-velocity leadership environments.",
    status: "Locked",
  },
  {
    id: "step-6",
    sequence: 6,
    title: "The Neuroscience of Trust & Relationship Capital",
    description: "Building durable social capital and authentic vulnerability to catalyze enterprise-wide alignment.",
    status: "Locked",
  },
  {
    id: "step-7",
    sequence: 7,
    title: "High-Performance Coaching & Mentorship Protocols",
    description: "Transformative 1-on-1 coaching frameworks to elevate mid-tier managers into self-directed leaders.",
    status: "Locked",
  },
  {
    id: "step-8",
    sequence: 8,
    title: "Navigating Enterprise Ambiguity & Strategic Agility",
    description: "Operating with clarity amidst incomplete data, shifting market conditions, and evolving business models.",
    status: "Locked",
  },
  {
    id: "step-9",
    sequence: 9,
    title: "Cross-Cultural Intelligence & Global Leadership",
    description: "Bridging diverse cultural contexts and non-verbal cues across distributed international operations.",
    status: "Locked",
  },
  {
    id: "step-10",
    sequence: 10,
    title: "Resilience Architectures & Burnout Prevention",
    description: "Sustaining personal stamina, cognitive acuity, and recovery rhythms during prolonged corporate crises.",
    status: "Locked",
  },
  {
    id: "step-11",
    sequence: 11,
    title: "Visionary Storytelling & Public Keynote Delivery",
    description: "Inspiring stakeholders and external audiences with authentic, narrative-driven leadership communication.",
    status: "Locked",
  },
  {
    id: "step-12",
    sequence: 12,
    title: "Capstone Leadership Portfolio & Final Oral Defense",
    description: "Synthesizing full-spectrum executive mastery into an integrated action plan with mentor review.",
    status: "Locked",
  },
];

interface SavedNoteItem {
  id: string;
  noteText: string;
  highlightSnippet: string | null;
  videoTimestampSeconds: number | null;
  createdAt: string;
  stepTitle: string;
  lessonTitle: string;
}

export default function LearnerPortalFlow({
  module,
  allModules,
  courseTitle = "Executive Leadership & Emotional Mastery (CPD 25h)",
  cohortName = "Sigma 1 — Cohort 1",
  totalStepsCount,
  completedStepsCount,
  overallProgressPercentage,
  learnerName = "Roweena Foxwel",
  learnerEmail = "roweena@whatboutme.com",
  initialStep = "MODULE_PAGE",
  learningStep: learningStepProp,
  onStepChange,
  selectedModuleId: selectedModuleIdProp,
  onModuleSelect,
  selectedLessonId: selectedLessonIdProp,
  onLessonSelect,
  activeQuizQuestionIndex: activeQuizQuestionIndexProp,
  onQuizQuestionIndexChange,
  onBackToEdit,
  onContinueToReview,
  onNextModule,
  isSimulatorMode = false,
}: LearnerPortalFlowProps) {
  // ---------------------------------------------------------------------------
  // 6-Step Navigation State Machine
  // ---------------------------------------------------------------------------
  const [internalStep, setInternalStep] = useState<LearnerStepView>(learningStepProp || initialStep);
  const learningStep = learningStepProp || internalStep;

  useEffect(() => {
    if (learningStepProp) {
      setInternalStep(learningStepProp);
    }
  }, [learningStepProp]);

  const setStep = (step: LearnerStepView) => {
    setInternalStep(step);
    onStepChange?.(step);
  };

  const [selectedModuleId, setSelectedModuleId] = useState<string>(selectedModuleIdProp || module.id);
  const [selectedLessonId, setSelectedLessonId] = useState<string>(
    selectedLessonIdProp || module.lessons?.[0]?.id || "les-vid-1"
  );
  const [activeQuizQuestionIndex, setActiveQuizQuestionIndex] = useState<number>(
    activeQuizQuestionIndexProp || 0
  );

  useEffect(() => {
    if (selectedModuleIdProp) setSelectedModuleId(selectedModuleIdProp);
  }, [selectedModuleIdProp]);

  useEffect(() => {
    if (selectedLessonIdProp) setSelectedLessonId(selectedLessonIdProp);
  }, [selectedLessonIdProp]);

  useEffect(() => {
    if (activeQuizQuestionIndexProp != null) setActiveQuizQuestionIndex(activeQuizQuestionIndexProp);
  }, [activeQuizQuestionIndexProp]);

  // Active module state
  const [activeModule, setActiveModule] = useState<StepModule>(module);

  // Default modules list for timeline overview if not provided
  const courseTimelineModules: StepModule[] =
    allModules && allModules.length > 0
      ? allModules
      : buildDefault12Modules(module);

  // Progress metrics
  const totalCount = totalStepsCount ?? (courseTimelineModules.length || 12);
  const completedCount = completedStepsCount ?? 3;
  const progressPercent =
    overallProgressPercentage ??
    Math.round((completedCount / totalCount) * 100);

  // Synchronize active module if selectedModuleId changes
  useEffect(() => {
    if (selectedModuleId) {
      const match = courseTimelineModules.find((m) => m.id === selectedModuleId);
      if (match) setActiveModule(match);
    }
  }, [selectedModuleId, courseTimelineModules]);

  const activeModuleLessons = getModuleLessons(activeModule);

  const handleSelectModule = (targetMod: StepModule) => {
    if (targetMod.status === "Locked") {
      return;
    }
    setActiveModule(targetMod);
    setSelectedModuleId(targetMod.id);
    onModuleSelect?.(targetMod.id);
  };

  const handleContinueToVideo = () => {
    const targetLesson =
      activeModuleLessons.find((l) => l.status === "In progress") ||
      activeModuleLessons.find((l) => l.status !== "Locked") ||
      activeModuleLessons[0];
    if (targetLesson) {
      setSelectedLessonId(targetLesson.id);
      onLessonSelect?.(targetLesson.id);
    }
    setStep("VIDEO_PAGE");
  };

  // Helper transitions
  const goToModulePage = (moduleId?: string) => {
    if (moduleId) {
      setSelectedModuleId(moduleId);
      onModuleSelect?.(moduleId);
      const target = courseTimelineModules.find((m) => m.id === moduleId);
      if (target) setActiveModule(target);
    }
    setStep("MODULE_PAGE");
  };

  const goToVideoPage = (moduleId?: string, lessonId?: string) => {
    if (moduleId) {
      setSelectedModuleId(moduleId);
      onModuleSelect?.(moduleId);
    }
    if (lessonId) {
      setSelectedLessonId(lessonId);
      onLessonSelect?.(lessonId);
    }
    setStep("VIDEO_PAGE");
  };

  const goToResourcePage = (moduleId?: string, lessonId?: string) => {
    if (moduleId) {
      setSelectedModuleId(moduleId);
      onModuleSelect?.(moduleId);
    }
    if (lessonId) {
      setSelectedLessonId(lessonId);
      onLessonSelect?.(lessonId);
    }
    setStep("RESOURCE_PAGE");
  };

  const goToNotesPage = (moduleId?: string, lessonId?: string) => {
    if (moduleId) {
      setSelectedModuleId(moduleId);
      onModuleSelect?.(moduleId);
    }
    if (lessonId) {
      setSelectedLessonId(lessonId);
      onLessonSelect?.(lessonId);
    }
    setStep("NOTES_PAGE");
  };

  const goToQuizPage = (moduleId?: string, lessonId?: string) => {
    if (moduleId) {
      setSelectedModuleId(moduleId);
      onModuleSelect?.(moduleId);
    }
    if (lessonId) {
      setSelectedLessonId(lessonId);
      onLessonSelect?.(lessonId);
    }
    setActiveQuizQuestionIndex(0);
    onQuizQuestionIndexChange?.(0);
    setStep("QUIZ_PAGE");
  };

  const goToNextStepPage = (moduleId?: string, lessonId?: string) => {
    if (moduleId) {
      setSelectedModuleId(moduleId);
      onModuleSelect?.(moduleId);
    }
    if (lessonId) {
      setSelectedLessonId(lessonId);
      onLessonSelect?.(lessonId);
    }
    setStep("NEXT_STEP_PAGE");
  };

  const lessons = activeModuleLessons;
  const videoLesson = lessons.find((l) => l.type === "VIDEO") || lessons[0] || {
    id: "les-vid-1",
    title: "Core Mindset Shift: The Emotional Response Matrix",
    type: "VIDEO",
    mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    durationSec: 180,
  };

  const pdfLesson = lessons.find((l) => l.type === "PDF") || {
    id: "les-pdf-1",
    title: "Executive Leadership Framework & Trigger Mapping Worksheet",
    type: "PDF",
    mediaUrl: "/docs/Executive_Leadership_Matrix.pdf",
    durationSec: null,
  };

  const hasQuiz = Boolean(activeModule.quiz);
  const isBeforeVideo = Boolean(
    activeModule.quiz?.quizPlacement === "BEFORE_VIDEO" ||
    (activeModule as any)?.quizPlacement === "BEFORE_VIDEO"
  );

  // ---------------------------------------------------------------------------
  // Step B: Video Theatre State
  // ---------------------------------------------------------------------------
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(videoLesson.durationSec || 180);
  const [maxWatchedTime, setMaxWatchedTime] = useState(0);
  const [isVideoCompleted, setIsVideoCompleted] = useState(false);
  const [scrubBlockedNotice, setScrubBlockedNotice] = useState<string | null>(null);
  const [videoActiveTab, setVideoActiveTab] = useState<"NOTES" | "RESOURCES" | "TRANSCRIPT">("NOTES");
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showCaptions, setShowCaptions] = useState(false);

  // Active video playlist for the selected module
  const moduleVideoLessons = activeModuleLessons.filter(
    (l) => l.type === "VIDEO" || l.mediaUrl?.endsWith(".mp4") || l.durationSec != null
  );
  const playlistVideos = moduleVideoLessons.length > 0 ? moduleVideoLessons : activeModuleLessons.slice(0, 3);
  const currentVideoLesson =
    activeModuleLessons.find((l) => l.id === selectedLessonId) ||
    playlistVideos[0] ||
    videoLesson;
  const currentVideoIndex = playlistVideos.findIndex((v) => v.id === currentVideoLesson?.id);
  const currentLessonNumber = currentVideoIndex >= 0 ? currentVideoIndex + 1 : 1;
  const completedVideosCount = playlistVideos.filter(
    (v) => v.status === "Completed" || (v.id === currentVideoLesson?.id && isVideoCompleted)
  ).length;

  const handleCycleSpeed = () => {
    const speeds = [1, 1.25, 1.5, 2];
    const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
    const nextSpeed = speeds[nextIdx] || 1;
    setPlaybackSpeed(nextSpeed);
    if (videoRef.current) {
      videoRef.current.playbackRate = nextSpeed;
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleToggleFullscreen = () => {
    if (!videoRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      videoRef.current.requestFullscreen().catch(() => {});
    }
  };

  const handleInsertFormat = (tag: "B" | "I" | "U" | "BULLET" | "NUMBER") => {
    if (tag === "B") setInLessonNoteText((prev) => (prev ? `${prev} **bold**` : "**bold**"));
    else if (tag === "I") setInLessonNoteText((prev) => (prev ? `${prev} *italic*` : "*italic*"));
    else if (tag === "U") setInLessonNoteText((prev) => (prev ? `${prev} _underline_` : "_underline_"));
    else if (tag === "BULLET") setInLessonNoteText((prev) => (prev ? `${prev}\n• ` : "• "));
    else if (tag === "NUMBER") setInLessonNoteText((prev) => (prev ? `${prev}\n1. ` : "1. "));
  };

  // Synchronize player state when currentVideoLesson changes
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.playbackRate = playbackSpeed;
    }
    setIsPlaying(false);
    setCurrentTime(0);
    const initialDur = currentVideoLesson.durationSec || 180;
    setDuration(initialDur);
    if (currentVideoLesson.status === "Completed") {
      setMaxWatchedTime(initialDur);
      setIsVideoCompleted(true);
    } else {
      setMaxWatchedTime(0);
      setIsVideoCompleted(false);
    }
  }, [currentVideoLesson?.id]);

  // Dynamic moving watermark (deter screen recordings)
  const [watermarkPos, setWatermarkPos] = useState({ x: 24, y: 32 });
  useEffect(() => {
    const timer = setInterval(() => {
      const nextX = Math.floor(Math.random() * 64) + 12;
      const nextY = Math.floor(Math.random() * 64) + 12;
      setWatermarkPos({ x: nextX, y: nextY });
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const cur = videoRef.current.currentTime;
    setCurrentTime(cur);
    if (cur > maxWatchedTime) {
      setMaxWatchedTime(cur);
    }
    const dur = videoRef.current.duration || duration;
    if (dur > 0 && cur >= dur * 0.95) {
      setIsVideoCompleted(true);
    }
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    if (videoRef.current.duration && !isNaN(videoRef.current.duration)) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleScrubAttempt = (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = Number(e.target.value);
    if (target > maxWatchedTime + 1.5) {
      setScrubBlockedNotice("Seeking ahead is locked. Anti-skip policy requires watching content sequentially.");
      setTimeout(() => setScrubBlockedNotice(null), 3500);
      if (videoRef.current) {
        videoRef.current.currentTime = maxWatchedTime;
      }
    } else {
      if (videoRef.current) {
        videoRef.current.currentTime = target;
        setCurrentTime(target);
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Step C: Dedicated PDF Resource State
  // ---------------------------------------------------------------------------
  const [pdfPage, setPdfPage] = useState(1);
  const totalPdfPages = 4;
  const [pdfZoom, setPdfZoom] = useState(100);
  const [pdfMarkedAsRead, setPdfMarkedAsRead] = useState(false);

  // ---------------------------------------------------------------------------
  // Step D: Distraction-Free Notes Companion State
  // ---------------------------------------------------------------------------
  const [inLessonNoteText, setInLessonNoteText] = useState("");
  const [inLessonHighlight, setInLessonHighlight] = useState("");
  const [bookmarkTimestamp, setBookmarkTimestamp] = useState<number | null>(null);
  const [autoSaveFeedback, setAutoSaveFeedback] = useState<string>("All notes saved securely");
  const [savedNotes, setSavedNotes] = useState<SavedNoteItem[]>([
    {
      id: "note-init-1",
      noteText: "Core insight: Transformative leadership begins with emotional self-regulation and intentional daily presence.",
      highlightSnippet: "Transformative leadership begins with emotional self-regulation.",
      videoTimestampSeconds: 42,
      createdAt: new Date(Date.now() - 3600000 * 18).toISOString(),
      stepTitle: `Step ${activeModule.sequence}: ${activeModule.title}`,
      lessonTitle: videoLesson.title,
    },
    {
      id: "note-init-2",
      noteText: "Action item: Implement the 4-step de-escalation checklist before entering volatile quarterly reviews.",
      highlightSnippet: "Apply response matrix before reacting to stress triggers.",
      videoTimestampSeconds: 108,
      createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
      stepTitle: `Step ${activeModule.sequence}: ${activeModule.title}`,
      lessonTitle: videoLesson.title,
    },
  ]);

  const handleCaptureTimestamp = () => {
    const timeToTag = Math.floor(currentTime);
    setBookmarkTimestamp(timeToTag);
    setAutoSaveFeedback(`Tagged video timestamp at ${formatVideoTime(timeToTag)}`);
  };

  const handleSaveNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inLessonNoteText.trim()) return;

    const newNote: SavedNoteItem = {
      id: "note-" + Date.now(),
      noteText: inLessonNoteText.trim(),
      highlightSnippet: inLessonHighlight.trim() || null,
      videoTimestampSeconds: bookmarkTimestamp != null ? bookmarkTimestamp : Math.floor(currentTime),
      createdAt: new Date().toISOString(),
      stepTitle: `Step ${activeModule.sequence}: ${activeModule.title}`,
      lessonTitle: videoLesson.title,
    };

    setSavedNotes([newNote, ...savedNotes]);
    setInLessonNoteText("");
    setInLessonHighlight("");
    setBookmarkTimestamp(null);
    setAutoSaveFeedback(`Auto-saved at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`);
  };

  const handleDeleteNote = (id: string) => {
    setSavedNotes(savedNotes.filter((n) => n.id !== id));
  };

  // ---------------------------------------------------------------------------
  // Step E: Distraction-Free Quiz State (One Question Card at a Time)
  // ---------------------------------------------------------------------------
  const [selectedSingleChoice, setSelectedSingleChoice] = useState<number | null>(null);
  const [selectedMultiChoice, setSelectedMultiChoice] = useState<number[]>([]);
  const [shortAnswerText, setShortAnswerText] = useState("");
  const [quizScore, setQuizScore] = useState<number | null>(null);
  const [isQuizPassed, setIsQuizPassed] = useState(false);

  const quizQuestions = [
    {
      id: "q1",
      type: "MULTIPLE_CHOICE" as const,
      question: "Which leadership practice is most effective in stabilizing psychological safety during organizational restructuring?",
      category: "Emotional Regulation & Trust",
      options: [
        { id: 0, text: "Top-down directive delegation without consultation" },
        { id: 1, text: "Transparent vulnerability, open dialogue, and active listening" },
        { id: 2, text: "Delaying all stakeholder communication until final resolution" },
        { id: 3, text: "Competitive peer performance rankings and isolation" },
      ],
      correctOption: 1,
    },
    {
      id: "q2",
      type: "MULTI_SELECT" as const,
      question: "Select all foundational components of Roweena's Emotional Intelligence Leadership Framework:",
      category: "Framework Architecture",
      options: [
        { id: 0, text: "Self-Awareness & Physiological Trigger Mapping" },
        { id: 1, text: "Repression of Negative Feedback and Dissent" },
        { id: 2, text: "Social Empathy & Cognitive Perspective Taking" },
        { id: 3, text: "Aggressive Unilateral Boundary Enforcement" },
      ],
      correctOptions: [0, 2],
    },
    {
      id: "q3",
      type: "SHORT_ANSWER" as const,
      question: "In your own words, describe how you intend to apply this module's emotional response matrix in your leadership workflow:",
      category: "Personal Action Plan",
      placeholder: "Describe specific meetings, stakeholders, or triggers where you will apply this reframing...",
      minCharacters: 15,
    },
  ];

  const totalQuestions = quizQuestions.length;
  const fallbackQuestion = quizQuestions[0]!;
  const currentQuestion = quizQuestions[activeQuizQuestionIndex] ?? fallbackQuestion;

  const handleEvaluateQuiz = () => {
    let earned = 0;
    const q1 = quizQuestions[0];
    if (q1 && selectedSingleChoice === q1.correctOption) earned += 1;
    if (
      selectedMultiChoice.length === 2 &&
      selectedMultiChoice.includes(0) &&
      selectedMultiChoice.includes(2)
    ) {
      earned += 1;
    }
    if (shortAnswerText.trim().length >= 15) earned += 1;

    const percentage = Math.round((earned / totalQuestions) * 100);
    const passMark = activeModule.quiz?.passMark || 75;
    const passed = percentage >= passMark;

    setQuizScore(percentage);
    setIsQuizPassed(passed);
    goToNextStepPage(selectedModuleId, selectedLessonId);
  };

  const handleResetQuiz = () => {
    setActiveQuizQuestionIndex(0);
    onQuizQuestionIndexChange?.(0);
    setSelectedSingleChoice(null);
    setSelectedMultiChoice([]);
    setShortAnswerText("");
    setQuizScore(null);
    setIsQuizPassed(false);
    goToQuizPage(selectedModuleId, selectedLessonId);
  };

  // Gating status calculation
  const isVideoLockedByPreQuiz = isBeforeVideo && !isQuizPassed;

  return (
    <div className={styles.portalContainer}>
      {/* =====================================================================
          1. PORTAL HEADER
          ===================================================================== */}
      <header className={styles.portalHeader}>
        <div className={styles.portalTitleGroup}>
          <div className={styles.portalCourseEyebrow}>
            <span>Executive Leadership &amp; Emotional Mastery (CPD 25h)</span>
            <span style={{ color: "#d97706" }}>&bull;</span>
            <span className={styles.statusBadge + " " + styles.statusInProgress}>
              Step {activeModule.sequence} of 11
            </span>
            {isSimulatorMode && (
              <span className={styles.statusBadge + " " + styles.statusOptional}>
                Simulator Mode Active
              </span>
            )}
          </div>
          <h1 className={styles.portalModuleTitle}>
            Module {activeModule.sequence}: {activeModule.title}
          </h1>
          <p className={styles.portalModuleSubtitle}>
            Learner: <strong>{learnerName}</strong> ({learnerEmail}) &bull; Guided Step-by-Step Experience
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          {onBackToEdit && (
            <button
              type="button"
              onClick={onBackToEdit}
              className={styles.btnActionBack}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
              <span>Back to Module Editor</span>
            </button>
          )}

          {onContinueToReview && (
            <button
              type="button"
              onClick={onContinueToReview}
              className={styles.btnActionBack}
              style={{ background: "#ffffff", borderColor: "#f59e0b", color: "#b45309" }}
            >
              <span>Review Curriculum &rarr;</span>
            </button>
          )}
        </div>
      </header>

      {/* =====================================================================
          2. THE 6-STEP STEPPER RIBBON (Visible Current Step Highlight)
          ===================================================================== */}
      <nav className={styles.stepperRibbon} aria-label="Course Step Progression">
        {[
          { key: "MODULE_PAGE", label: "1. Module Overview", idx: 1 },
          { key: "VIDEO_PAGE", label: "2. Video Theatre", idx: 2 },
          { key: "RESOURCE_PAGE", label: "3. PDF Resources", idx: 3 },
          { key: "NOTES_PAGE", label: "4. Lesson Notes", idx: 4 },
          { key: "QUIZ_PAGE", label: "5. Knowledge Check", idx: 5 },
          { key: "NEXT_STEP_PAGE", label: "6. Completion", idx: 6 },
        ].map((step) => {
          const isActive = learningStep === step.key;
          const isDone =
            (step.key === "MODULE_PAGE" && learningStep !== "MODULE_PAGE") ||
            (step.key === "VIDEO_PAGE" && isVideoCompleted) ||
            (step.key === "RESOURCE_PAGE" && pdfMarkedAsRead) ||
            (step.key === "QUIZ_PAGE" && isQuizPassed);

          return (
            <button
              key={step.key}
              type="button"
              onClick={() => setStep(step.key as LearnerStepView)}
              className={`${styles.stepPill} ${isActive ? styles.stepPillActive : ""} ${isDone ? styles.stepPillCompleted : ""}`}
            >
              <span className={styles.stepIndexCircle}>
                {isDone ? "✓" : step.idx}
              </span>
              <span>{step.label}</span>
            </button>
          );
        })}
      </nav>

      {/* =====================================================================
          STEP A: MODULE_PAGE (Module & Learning Path Overview)
          ===================================================================== */}
      {learningStep === "MODULE_PAGE" && (
        <section aria-label="Course Learning Path Roadmap">
          {/* Back link: <- Back to My Courses */}
          <div style={{ marginBottom: "0.5rem" }}>
            <button
              type="button"
              onClick={onBackToEdit || (() => {})}
              className={styles.breadcrumbBackLink}
            >
              &larr; Back to My Courses
            </button>
          </div>

          {/* Course Path Header */}
          <div className={styles.coursePathHeader}>
            <h1 className={styles.coursePathHeading}>
              {courseTitle} &mdash; Learning Path
            </h1>
            <p className={styles.coursePathSubtitle}>
              Cohort: {cohortName} &bull; Complete each step to advance and unlock your certificate.
            </p>
          </div>

          {/* Overall Progress Card */}
          <div className={styles.overallProgressCard}>
            <div className={styles.overallProgressHeader}>
              <span className={styles.overallProgressLabel}>Overall Progress</span>
              <div className={styles.overallProgressMetricGroup}>
                <span className={styles.overallProgressPercent}>{progressPercent}%</span>
                <span className={styles.overallProgressCount}>
                  ({completedCount} of {totalCount} steps completed)
                </span>
              </div>
            </div>
            <div
              className={styles.progressTrackBar}
              role="progressbar"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={styles.progressFillBar}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Two-Column Desktop Roadmap Grid (36% Left / 64% Right) */}
          <div className={styles.moduleOverviewGrid}>
            {/* Left Column: Step-by-Step Module Tree */}
            <aside className={styles.treeSidebar} aria-label="Step-by-Step Module Tree">
              <div className={styles.treeHeaderRow}>
                <span className={styles.treeTitle}>Learning Path Modules</span>
                <span className={styles.statusBadge + " " + styles.statusInProgress}>
                  {courseTimelineModules.filter((m) => m.status === "In progress").length || 1} In Progress
                </span>
              </div>

              <div className={styles.treeList}>
                {courseTimelineModules.map((m) => {
                  const isSelected = m.id === activeModule.id;
                  const isModLocked = m.status === "Locked";
                  const modLessons = getModuleLessons(m);

                  if (isModLocked) {
                    return (
                      <div
                        key={m.id}
                        className={styles.moduleTreeCardLocked}
                        aria-disabled="true"
                        title={`Step ${m.sequence} is locked. Complete preceding modules to advance.`}
                      >
                        <div className={styles.treeLockedHeader}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                            <span className={styles.treeLockedTitle}>
                              Step {m.sequence}: {m.title}
                            </span>
                          </div>
                        </div>
                        <span className={styles.treeLockedMeta}>
                          {modLessons.length} Lessons &bull; Locked
                        </span>
                      </div>
                    );
                  }

                  const isModCompleted = m.status === "Completed";

                  return (
                    <div
                      key={m.id}
                      onClick={() => handleSelectModule(m)}
                      className={`${styles.moduleTreeCardUnlocked} ${isSelected ? styles.moduleTreeCardSelected : ""}`}
                      role="button"
                      tabIndex={0}
                      title={`Click to view Step ${m.sequence} lessons`}
                    >
                      <div className={styles.treeUnlockedHeader}>
                        <div className={styles.treeIndicatorBox}>
                          {isModCompleted ? (
                            <div className={styles.treeCheckmarkBadge}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </div>
                          ) : (
                            <div className={styles.treeActiveSequenceBadge}>
                              {m.sequence}
                            </div>
                          )}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <h3 className={styles.treeModuleHeading}>
                            Step {m.sequence}: {m.title}
                          </h3>
                          <span className={styles.treeModuleMeta}>
                            {modLessons.length} Lessons &bull; {isModCompleted ? "Completed" : "In Progress"}
                          </span>
                        </div>
                      </div>

                      {/* Compact vertical sub-list of its lessons */}
                      <div className={styles.treeLessonsSublist}>
                        {modLessons.map((les) => {
                          const lesStatus = les.status || (isModCompleted ? "Completed" : "In progress");

                          if (lesStatus === "Completed") {
                            return (
                              <div key={les.id} className={styles.sublistRowCompleted}>
                                <svg className={styles.sublistCheckIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                                <span className={styles.sublistTextCompleted}>{les.title}</span>
                              </div>
                            );
                          }

                          if (lesStatus === "In progress") {
                            return (
                              <div key={les.id} className={styles.sublistRowInProgress}>
                                <svg className={styles.sublistPlayIcon} viewBox="0 0 24 24" fill="currentColor">
                                  <polygon points="5 3 19 12 5 21 5 3" />
                                </svg>
                                <span className={styles.sublistTextInProgress}>{les.title}</span>
                              </div>
                            );
                          }

                          return (
                            <div key={les.id} className={styles.sublistRowLocked}>
                              <span className={styles.sublistGrayCircle} />
                              <span className={styles.sublistTextLocked}>{les.title}</span>
                              <svg className={styles.sublistLockIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                              </svg>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </aside>

            {/* Right Column: Selected Module Detail Card (One Module at a Time) */}
            <main className={styles.selectedModuleDetailCard} aria-label={`Step ${activeModule.sequence} Details`}>
              <div className={styles.selectedModuleTopEyebrowRow}>
                <span className={styles.selectedModuleEyebrow}>
                  Step {activeModule.sequence}: {activeModule.title}
                </span>
                <span className={styles.selectedModuleLessonsPill}>
                  {activeModuleLessons.length} Lessons
                </span>
              </div>

              <h2 className={styles.selectedModuleHeading}>{activeModule.title}</h2>
              <p className={styles.selectedModuleDescription}>
                {activeModule.description ||
                  "Master the foundational emotional self-regulation techniques and trigger mapping methodologies required for modern executive leadership."}
              </p>

              {/* Sequential Lesson Rows */}
              <div>
                {activeModuleLessons.map((les) => {
                  const lesStatus = les.status || "In progress";
                  const durationText =
                    les.durationFormatted ||
                    (les.durationSec ? formatVideoTime(les.durationSec) : "12:00");

                  if (lesStatus === "Completed") {
                    return (
                      <div
                        key={les.id}
                        className={`${styles.lessonRowCard} ${styles.lessonRowCompleted}`}
                        onClick={() => {
                          setSelectedLessonId(les.id);
                          onLessonSelect?.(les.id);
                          setStep("VIDEO_PAGE");
                        }}
                        role="button"
                        tabIndex={0}
                        title="Click to review completed lesson"
                      >
                        <div className={styles.lessonRowLeft}>
                          <div className={`${styles.lessonPlayIconBox} ${styles.lessonPlayIconCompleted}`}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                              <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                          </div>
                          <div className={styles.lessonRowTitleGroup}>
                            <span className={styles.lessonRowTitleText}>{les.title}</span>
                            <span className={styles.lessonRowDurationText}>({durationText})</span>
                          </div>
                        </div>
                        <span className={styles.lessonBadgeCompleted}>Completed</span>
                      </div>
                    );
                  }

                  if (lesStatus === "In progress") {
                    return (
                      <div
                        key={les.id}
                        className={`${styles.lessonRowCard} ${styles.lessonRowInProgress}`}
                        onClick={() => {
                          setSelectedLessonId(les.id);
                          onLessonSelect?.(les.id);
                          setStep("VIDEO_PAGE");
                        }}
                        role="button"
                        tabIndex={0}
                        title="Click to continue in-progress lesson"
                      >
                        <div className={styles.lessonRowLeft}>
                          <div className={`${styles.lessonPlayIconBox} ${styles.lessonPlayIconInProgress}`}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                              <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                          </div>
                          <div className={styles.lessonRowTitleGroup}>
                            <span className={styles.lessonRowTitleTextInProgress}>{les.title}</span>
                            <span className={styles.lessonRowDurationTextInProgress}>({durationText})</span>
                          </div>
                        </div>
                        <span className={styles.lessonBadgeInProgress}>In Progress</span>
                      </div>
                    );
                  }

                  // Locked Lesson
                  return (
                    <div
                      key={les.id}
                      className={`${styles.lessonRowCard} ${styles.lessonRowLocked}`}
                      aria-disabled="true"
                      title="This lesson is locked. Complete preceding lessons to advance."
                    >
                      <div className={styles.lessonRowLeft}>
                        <div className={`${styles.lessonPlayIconBox} ${styles.lessonPlayIconLocked}`}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                        </div>
                        <div className={styles.lessonRowTitleGroup}>
                          <span className={styles.lessonRowTitleTextLocked}>{les.title}</span>
                          <span className={styles.lessonRowDurationText}>({durationText})</span>
                        </div>
                      </div>
                      <span className={styles.lessonBadgeLocked}>🔒 Locked</span>
                    </div>
                  );
                })}
              </div>

              {/* Primary Bottom CTA Button */}
              <button
                type="button"
                className={styles.btnContinueToVideo}
                onClick={handleContinueToVideo}
              >
                Continue to Video &rarr;
              </button>
            </main>
          </div>
        </section>
      )}

      {/* =====================================================================
          STEP B: VIDEO_PAGE (Focused Single-Video Theatre)
          ===================================================================== */}
      {learningStep === "VIDEO_PAGE" && (
        <section className={styles.videoTheatreContainer} aria-label="Focused Video Lesson Player">
          {/* 1. Top Lesson Header */}
          <div>
            {/* Breadcrumb back link: <- Back to Module [X] */}
            <div style={{ marginBottom: "0.5rem" }}>
              <button
                type="button"
                onClick={() => goToModulePage(activeModule.id)}
                className={styles.breadcrumbBackLink}
              >
                &larr; Back to Module {activeModule.sequence}
              </button>
            </div>

            <div className={styles.videoTopHeader}>
              <div className={styles.videoHeaderLeft}>
                <div className={styles.videoEyebrowTag}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  <span>Step {activeModule.sequence}: {activeModule.title}</span>
                </div>
                <h1 className={styles.videoLessonTitle}>
                  {currentLessonNumber}. {currentVideoLesson.title}
                </h1>
                <p className={styles.videoLessonSubtitle}>
                  {activeModule.description ||
                    "Master the foundational emotional self-regulation techniques and trigger mapping methodologies required for modern executive leadership."}
                </p>
              </div>

              {/* Top-Right Action / Status Button */}
              <div className={styles.videoHeaderRight}>
                {isVideoCompleted ? (
                  <div className={styles.badgeCompletedGreen}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>✓ Completed</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setIsVideoCompleted(true);
                      setMaxWatchedTime(duration || 180);
                    }}
                    className={styles.btnMarkComplete}
                  >
                    <span>✓ Mark as Complete</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {isVideoLockedByPreQuiz && (
            <div style={{ padding: "1.25rem 1.5rem", borderRadius: 12, background: "#fff7ed", border: "1.5px solid #f59e0b", color: "#b45309", display: "flex", gap: "12px", alignItems: "center" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <div>
                <strong>Pre-Video Assessment Locked:</strong> You must complete the Diagnostic Assessment before the video lecture unlocks.
              </div>
            </div>
          )}

          {/* 2. Two-Column Video & Lesson Playlist Layout (68% / 32%) */}
          <div className={styles.videoTheaterGrid}>
            {/* Left Area: Prominent 16:9 Video Player */}
            <div className={styles.playerFrame}>
              {/* Dynamic Moving Watermark */}
              <div
                className={styles.videoWatermark}
                style={{ top: `${watermarkPos.y}%`, left: `${watermarkPos.x}%` }}
              >
                {learnerName} &bull; {learnerEmail}
              </div>

              {/* Anti-Skip Notice Toast */}
              {scrubBlockedNotice && (
                <div className={styles.videoScrubNotice} role="alert">
                  {scrubBlockedNotice}
                </div>
              )}

              {/* Video Player 16:9 */}
              <div className={styles.playerScreenWrapper}>
                <video
                  ref={videoRef}
                  src={currentVideoLesson.mediaUrl}
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onEnded={() => setIsVideoCompleted(true)}
                />
              </div>

              {/* Custom Bottom Playback Bar */}
              <div className={styles.playerControlBar}>
                {/* Scrubber row with locked forward scrubbing */}
                <div className={styles.playerScrubberRow}>
                  <span className={styles.playerTime}>{formatVideoTime(currentTime)}</span>
                  <input
                    type="range"
                    min={0}
                    max={duration || 180}
                    value={currentTime}
                    onChange={handleScrubAttempt}
                    className={styles.playerScrubRange}
                    aria-label="Video scrubber"
                  />
                  <span className={styles.playerTime}>{formatVideoTime(duration)}</span>
                </div>

                {/* Control Buttons Row */}
                <div className={styles.playerBtnsRow}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <button
                      type="button"
                      onClick={togglePlay}
                      className={styles.videoPlayBtn}
                      aria-label={isPlaying ? "Pause Video" : "Play Video"}
                    >
                      {isPlaying ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <rect x="6" y="4" width="4" height="16" />
                          <rect x="14" y="4" width="4" height="16" />
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={toggleMute}
                      className={styles.playerControlBtn}
                      aria-label={isMuted ? "Unmute" : "Mute"}
                      title={isMuted ? "Unmute" : "Mute"}
                    >
                      {isMuted ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                          <line x1="23" y1="9" x2="17" y2="15" />
                          <line x1="17" y1="9" x2="23" y2="15" />
                        </svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                        </svg>
                      )}
                    </button>

                    <span style={{ color: "#cbd5e1", fontSize: "0.8rem", fontFamily: "monospace", fontWeight: 700 }}>
                      {formatVideoTime(currentTime)} / {formatVideoTime(duration)}
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {/* 1x Speed Button */}
                    <button
                      type="button"
                      onClick={handleCycleSpeed}
                      className={styles.playerSpeedBtn}
                      title="Playback Speed"
                    >
                      {playbackSpeed}x
                    </button>

                    {/* Captions Toggle */}
                    <button
                      type="button"
                      onClick={() => setShowCaptions(!showCaptions)}
                      className={styles.playerControlBtn}
                      style={{ color: showCaptions ? "#f59e0b" : "#cbd5e1", fontWeight: 800 }}
                      title="Toggle Captions"
                    >
                      CC
                    </button>

                    {/* Fullscreen Button */}
                    <button
                      type="button"
                      onClick={handleToggleFullscreen}
                      className={styles.playerControlBtn}
                      title="Toggle Fullscreen"
                      aria-label="Fullscreen"
                    >
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Area: "Videos in this lesson" Sequence Card */}
            <div className={styles.playlistCardContainer}>
              <div className={styles.playlistCardHeader}>
                <h2 className={styles.playlistHeading}>Videos in this lesson</h2>
                <span className={styles.playlistCounter}>
                  {completedVideosCount}/{playlistVideos.length} completed
                </span>
              </div>

              <div className={styles.playlistItemsList}>
                {playlistVideos.map((vid) => {
                  const isCurrent = vid.id === currentVideoLesson?.id;
                  const isCompleted = vid.status === "Completed" || (isCurrent && isVideoCompleted);
                  const isLocked = vid.status === "Locked" && !isCompleted && !isCurrent;
                  const durText = vid.durationFormatted || (vid.durationSec ? formatVideoTime(vid.durationSec) : "08:12");

                  if (isCompleted) {
                    return (
                      <div
                        key={vid.id}
                        onClick={() => {
                          setSelectedLessonId(vid.id);
                          onLessonSelect?.(vid.id);
                        }}
                        className={`${styles.playlistItem} ${styles.playlistItemCompleted}`}
                        role="button"
                        tabIndex={0}
                        title={`Review video: ${vid.title}`}
                      >
                        <div className={styles.playlistItemLeft}>
                          <div className={`${styles.playlistIconBox} ${styles.playlistIconBoxCompleted}`}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                              <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div className={styles.playlistItemTitle}>{vid.title}</div>
                            <span className={styles.playlistItemDuration}>{durText}</span>
                          </div>
                        </div>
                        <div className={styles.playlistCheckmarkBox} title="Completed">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                      </div>
                    );
                  }

                  if (isCurrent) {
                    return (
                      <div
                        key={vid.id}
                        className={`${styles.playlistItem} ${styles.playlistItemActive}`}
                        role="button"
                        tabIndex={0}
                        title={`Active video: ${vid.title}`}
                      >
                        <div className={styles.playlistItemLeft}>
                          <div className={`${styles.playlistIconBox} ${styles.playlistIconBoxActive}`}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                              <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div className={styles.playlistItemTitleActive}>{vid.title}</div>
                            <span className={styles.playlistItemDuration}>{durText}</span>
                          </div>
                        </div>
                        <div className={styles.playlistRadioIndicator} title="Active Video">
                          <div className={styles.playlistRadioInnerDot} />
                        </div>
                      </div>
                    );
                  }

                  // Upcoming / Locked video
                  return (
                    <div
                      key={vid.id}
                      className={`${styles.playlistItem} ${styles.playlistItemLocked}`}
                      aria-disabled="true"
                      title="This video is locked. Watch preceding video to advance."
                    >
                      <div className={styles.playlistItemLeft}>
                        <div className={`${styles.playlistIconBox} ${styles.playlistIconBoxLocked}`}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className={styles.playlistItemTitleLocked}>{vid.title}</div>
                          <span className={styles.playlistItemDuration}>{durText}</span>
                        </div>
                      </div>
                      <div className={styles.playlistLockedCircle} title="Locked Video">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 3. Below-Video Step Switcher & Quick Note Companion */}
          <div className={styles.belowVideoSection}>
            <div className={styles.videoTabsBar} role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={videoActiveTab === "NOTES"}
                onClick={() => setVideoActiveTab("NOTES")}
                className={`${styles.videoTabBtn} ${videoActiveTab === "NOTES" ? styles.videoTabBtnActive : ""}`}
              >
                <span>📝 Lesson Notes</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={videoActiveTab === "RESOURCES"}
                onClick={() => goToResourcePage(activeModule.id, pdfLesson.id)}
                className={`${styles.videoTabBtn} ${videoActiveTab === "RESOURCES" ? styles.videoTabBtnActive : ""}`}
              >
                <span>📄 PDF / Resources</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={videoActiveTab === "TRANSCRIPT"}
                onClick={() => setVideoActiveTab("TRANSCRIPT")}
                className={`${styles.videoTabBtn} ${videoActiveTab === "TRANSCRIPT" ? styles.videoTabBtnActive : ""}`}
              >
                <span>📑 Transcript</span>
              </button>
            </div>

            {videoActiveTab === "NOTES" && (
              <div className={styles.quickNoteBox}>
                <div className={styles.noteFormattingToolbar}>
                  <div className={styles.formatBtnGroup}>
                    <button
                      type="button"
                      onClick={() => handleInsertFormat("B")}
                      className={styles.formatBtn}
                      title="Bold"
                    >
                      B
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInsertFormat("I")}
                      className={styles.formatBtn}
                      title="Italic"
                      style={{ fontStyle: "italic" }}
                    >
                      I
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInsertFormat("U")}
                      className={styles.formatBtn}
                      title="Underline"
                      style={{ textDecoration: "underline" }}
                    >
                      U
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInsertFormat("BULLET")}
                      className={styles.formatBtn}
                      title="Bullet list"
                    >
                      &bull;
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInsertFormat("NUMBER")}
                      className={styles.formatBtn}
                      title="Numbered list"
                    >
                      1.
                    </button>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <button
                      type="button"
                      onClick={handleCaptureTimestamp}
                      className={styles.btnTagTime}
                    >
                      + Tag Timestamp ({formatVideoTime(currentTime)})
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveNote}
                      className={styles.btnSaveNote}
                    >
                      Save Note
                    </button>
                  </div>
                </div>

                <textarea
                  className={styles.noteTextarea}
                  placeholder="Write your personal notes here..."
                  value={inLessonNoteText}
                  onChange={(e) => setInLessonNoteText(e.target.value)}
                  aria-label="Write personal lesson notes"
                />

                <div className={styles.noteStatusFooter}>
                  <span>{autoSaveFeedback}</span>
                  <button
                    type="button"
                    onClick={() => goToNotesPage(activeModule.id, currentVideoLesson.id)}
                    className={styles.linkFullNotebook}
                  >
                    View all {savedNotes.length} saved notes in Study Notebook &rarr;
                  </button>
                </div>
              </div>
            )}

            {videoActiveTab === "TRANSCRIPT" && (
              <div className={styles.transcriptContentCard}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", borderBottom: "1px solid #f3ece3", paddingBottom: "10px" }}>
                  <div>
                    <h3 style={{ margin: "0 0 2px", fontSize: "0.95rem", fontWeight: 800, color: "#1c1917" }}>
                      Lesson Summary &bull; {currentVideoLesson.title}
                    </h3>
                    <span style={{ fontSize: "0.78rem", color: "#78716c" }}>
                      Audio-Verified Key Takeaways & Interactive Timestamps
                    </span>
                  </div>
                  <span className={styles.statusBadge + " " + styles.statusCompleted}>
                    Audio-Verified AI Transcript
                  </span>
                </div>

                <div style={{ marginBottom: "14px", padding: "10px 14px", background: "#fdfbf7", borderRadius: "8px", border: "1px solid #ece6dd" }}>
                  <strong style={{ fontSize: "0.82rem", color: "#b45309", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: "4px" }}>
                    Executive Key Takeaways:
                  </strong>
                  <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.86rem", color: "#44403c", lineHeight: 1.55 }}>
                    <li>Acute stress triggers an immediate amygdala hijacking of prefrontal cognitive decision-making.</li>
                    <li>Executing the deliberate 3-second pause restores somatic awareness and executive composure.</li>
                    <li>Response matrices replace emotional reactivity with structured, high-stakes communication strategies.</li>
                  </ul>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <p style={{ margin: 0 }}>
                    <strong style={{ color: "#d97706" }}>[00:15] Roweena Foxwel:</strong> Welcome to this session. When high-stakes pressure mounts in an executive boardroom, the amygdala initiates an automatic stress response, hijacking prefrontal cognitive bandwidth unless intentional physiological regulation protocols are enacted.
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong style={{ color: "#d97706" }}>[02:40] Core Insight:</strong> The 4-step emotional response matrix begins with somatic awareness. Notice bodily tension before formulating strategic counterpoints.
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong style={{ color: "#d97706" }}>[05:12] Boardroom Execution:</strong> Practice the 3-second pause before countering critical stakeholder inquiries. This signals executive gravitas and preserves psychological safety.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* 4. Fixed Bottom Navigation Footer Bar */}
          <div className={styles.videoFooterBar}>
            <div>
              {currentVideoIndex > 0 ? (
                <button
                  type="button"
                  onClick={() => goToVideoPage(activeModule.id, playlistVideos[currentVideoIndex - 1]?.id)}
                  className={styles.btnPrevVideo}
                >
                  &larr; Previous Video
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => goToModulePage(activeModule.id)}
                  className={styles.btnPrevVideo}
                >
                  &larr; Back to Module
                </button>
              )}
            </div>

            <div>
              {currentVideoIndex < playlistVideos.length - 1 ? (
                <button
                  type="button"
                  onClick={() => goToVideoPage(activeModule.id, playlistVideos[currentVideoIndex + 1]?.id)}
                  className={styles.btnNextCTA}
                >
                  Next Video &rarr;
                </button>
              ) : pdfLesson ? (
                <button
                  type="button"
                  onClick={() => goToResourcePage(activeModule.id, pdfLesson.id)}
                  className={styles.btnNextCTA}
                >
                  View PDF / Resources &rarr;
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => goToNotesPage(activeModule.id, currentVideoLesson.id)}
                  className={styles.btnNextCTA}
                >
                  Continue to Notes &rarr;
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* =====================================================================
          STEP C: RESOURCE_PAGE (Dedicated PDF / Resource Viewer Screen)
          ===================================================================== */}
      {learningStep === "RESOURCE_PAGE" && (
        <section className={styles.resourceScreenContainer}>
          {/* Top Breadcrumb Back Link */}
          <div>
            <button
              type="button"
              onClick={() => goToVideoPage(selectedModuleId, selectedLessonId)}
              className={styles.breadcrumbBackLink}
            >
              &larr; Back to Video Lecture
            </button>
          </div>

          {/* Visible Progress Indicator */}
          <div style={{ padding: "10px 16px", background: "#ffffff", border: "1px solid #ece6dd", borderRadius: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 800, color: "#1c1917" }}>
                Step 3 of 6:
              </span>
              <span style={{ fontSize: "0.85rem", color: "#57534e" }}>
                Interactive PDF Worksheet &amp; Framework
              </span>
            </div>
            <span className={styles.statusBadge + " " + (pdfMarkedAsRead ? styles.statusCompleted : styles.statusInProgress)}>
              Document Progress: Page {pdfPage} of {totalPdfPages} {pdfMarkedAsRead && "• Read ✓"}
            </span>
          </div>

          <div className={styles.docToolbar}>
            <div className={styles.docToolbarLeft}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span className={styles.docToolbarTitle}>{pdfLesson.title}.pdf</span>
              <span className={styles.statusBadge + " " + (pdfMarkedAsRead ? styles.statusCompleted : styles.statusInProgress)}>
                {pdfMarkedAsRead ? "Read &bull; Verified ✓" : "Page Review Required"}
              </span>
            </div>

            <div className={styles.docToolbarControls}>
              <button
                type="button"
                onClick={() => setPdfPage((prev) => Math.max(1, prev - 1))}
                disabled={pdfPage === 1}
                className={styles.docToolbarBtn}
              >
                ◀ Prev
              </button>
              <span style={{ fontSize: "0.8rem", fontWeight: 700, padding: "0 6px" }}>
                Page {pdfPage} of {totalPdfPages}
              </span>
              <button
                type="button"
                onClick={() => setPdfPage((prev) => Math.min(totalPdfPages, prev + 1))}
                disabled={pdfPage === totalPdfPages}
                className={styles.docToolbarBtn}
              >
                Next ▶
              </button>

              <button
                type="button"
                onClick={() => setPdfZoom((prev) => Math.max(75, prev - 15))}
                className={styles.docToolbarBtn}
              >
                − Zoom
              </button>
              <span style={{ fontSize: "0.8rem", fontWeight: 700, padding: "0 4px" }}>
                {pdfZoom}%
              </span>
              <button
                type="button"
                onClick={() => setPdfZoom((prev) => Math.min(150, prev + 15))}
                className={styles.docToolbarBtn}
              >
                + Zoom
              </button>

              <button
                type="button"
                onClick={() => setPdfMarkedAsRead(!pdfMarkedAsRead)}
                className={styles.docToolbarBtn}
                style={{ background: pdfMarkedAsRead ? "#16a34a" : "#d97706", borderColor: "transparent" }}
              >
                {pdfMarkedAsRead ? "✓ Completed" : "Mark as Read"}
              </button>
            </div>
          </div>

          {/* High-Fidelity Worksheet Document Sheet */}
          <div className={styles.docCanvasCard} style={{ transform: `scale(${pdfZoom / 100})`, transformOrigin: "top center" }}>
            <div className={styles.docPageWatermark}>
              WHATBOUTME FZE &bull; ACCREDITED CPD
            </div>

            <div style={{ borderBottom: "2px solid #1c1917", paddingBottom: "1rem" }}>
              <span style={{ fontSize: "0.8rem", fontWeight: 800, color: "#d97706", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Executive Leadership Practical Worksheet &bull; Unit 2
              </span>
              <h2 style={{ fontSize: "1.65rem", fontWeight: 800, margin: "6px 0 4px", color: "#1c1917" }}>
                Emotional Stimulus &amp; Physiological Trigger Matrix
              </h2>
              <p style={{ margin: 0, fontSize: "0.88rem", color: "#57534e" }}>
                Participant: <strong>{learnerName}</strong> &bull; Cohort: Executive Leadership Fall 2026
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
              <div style={{ padding: "1.25rem", borderRadius: 10, background: "#fdfbf7", border: "1px solid #ece6dd" }}>
                <h4 style={{ margin: "0 0 8px", fontSize: "0.95rem", fontWeight: 800, color: "#92400e" }}>
                  1. Trigger Identification Checklist
                </h4>
                <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.85rem", color: "#44403c", lineHeight: 1.7 }}>
                  <li>Unscheduled calendar shifts or urgent status requests.</li>
                  <li>Interrupted speaking time during cross-functional alignment.</li>
                  <li>Perceived ambiguity in resource and budget allocation.</li>
                  <li>Public critique of strategic deliverables.</li>
                </ul>
              </div>

              <div style={{ padding: "1.25rem", borderRadius: 10, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                <h4 style={{ margin: "0 0 8px", fontSize: "0.95rem", fontWeight: 800, color: "#166534" }}>
                  2. De-escalation Protocol (The 4-Step S.T.O.P. Rule)
                </h4>
                <ol style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.85rem", color: "#15803d", lineHeight: 1.7 }}>
                  <li><strong>S: Stop</strong> immediately before speaking or reacting.</li>
                  <li><strong>T: Take a breath</strong> to re-oxygenate frontal cortex.</li>
                  <li><strong>O: Observe</strong> internal somatic sensations without judgment.</li>
                  <li><strong>P: Proceed</strong> intentionally aligned with overarching mission.</li>
                </ol>
              </div>
            </div>

            <div style={{ marginTop: "1rem", padding: "1.25rem", borderRadius: 10, border: "1.5px dashed #cbd5e1", background: "#f8fafc" }}>
              <h4 style={{ margin: "0 0 6px", fontSize: "0.9rem", fontWeight: 800, color: "#334155" }}>
                Fillable Reflection Space (Print or Annotate Online)
              </h4>
              <p style={{ margin: 0, fontSize: "0.82rem", color: "#64748b" }}>
                Note two recurring professional situations that trigger immediate defensive reactions. Contrast your default reaction with your reframed, intentional response.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* =====================================================================
          STEP D: NOTES_PAGE (Distraction-Free Lesson Notes Companion)
          ===================================================================== */}
      {learningStep === "NOTES_PAGE" && (
        <section>
          {/* Top Breadcrumb Back Link */}
          <div style={{ marginBottom: "0.75rem" }}>
            <button
              type="button"
              onClick={() => goToResourcePage(selectedModuleId, selectedLessonId)}
              className={styles.breadcrumbBackLink}
            >
              &larr; Back to PDF Worksheet
            </button>
          </div>

          {/* Visible Progress Indicator */}
          <div style={{ marginBottom: "1.25rem", padding: "10px 16px", background: "#ffffff", border: "1px solid #ece6dd", borderRadius: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 800, color: "#1c1917" }}>
                Step 4 of 6:
              </span>
              <span style={{ fontSize: "0.85rem", color: "#57534e" }}>
                Distraction-Free Lesson Notes Companion
              </span>
            </div>
            <span className={styles.statusBadge + " " + styles.statusCompleted}>
              Notebook Progress: {savedNotes.length} Entries Synced
            </span>
          </div>

          <div className={styles.notesScreenGrid}>
            {/* Notes Composition Form */}
            <div className={styles.notesEditorCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <div>
                  <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "#d97706", textTransform: "uppercase" }}>
                    Distraction-Free Study Companion
                  </span>
                  <h3 style={{ margin: "2px 0 0", fontSize: "1.25rem", fontWeight: 800 }}>
                    Take Notes on Step {activeModule.sequence}
                  </h3>
                </div>

                <span style={{ fontSize: "0.75rem", color: "#16a34a", fontWeight: 700 }}>
                  ● {autoSaveFeedback}
                </span>
              </div>

              {/* Rich Formatting Toolbar */}
              <div className={styles.notesRichToolbar}>
                <button
                  type="button"
                  className={styles.richBtn}
                  onClick={() => setInLessonNoteText((prev) => prev + " **[Key Insight]** ")}
                >
                  <strong>B</strong>
                </button>
                <button
                  type="button"
                  className={styles.richBtn}
                  onClick={() => setInLessonNoteText((prev) => prev + " *[Emphasis]* ")}
                >
                  <em>I</em>
                </button>
                <button
                  type="button"
                  className={styles.richBtn}
                  onClick={() => setInLessonNoteText((prev) => prev + "\n• ")}
                >
                  &bull; Bullet List
                </button>
                <button
                  type="button"
                  className={styles.richBtn}
                  onClick={() => setInLessonNoteText((prev) => prev + "\n1. ")}
                >
                  1. Numbered
                </button>
                <button
                  type="button"
                  className={styles.richBtn}
                  onClick={handleCaptureTimestamp}
                  style={{ color: "#d97706", borderColor: "#fed7aa", background: "#fff7ed" }}
                >
                  ▶ Tag Video ({formatVideoTime(currentTime)})
                </button>
              </div>

              <form onSubmit={handleSaveNote}>
                <div style={{ marginBottom: "12px" }}>
                  <input
                    type="text"
                    placeholder="Capture standout quote or core takeaway..."
                    value={inLessonHighlight}
                    onChange={(e) => setInLessonHighlight(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1.5px solid #ece6dd",
                      fontSize: "0.85rem",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div style={{ marginBottom: "14px" }}>
                  <textarea
                    required
                    rows={6}
                    placeholder="Type your personal insights, executive application plans, and reflection points..."
                    value={inLessonNoteText}
                    onChange={(e) => setInLessonNoteText(e.target.value)}
                    className={styles.noteTextarea}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.78rem", color: "#78716c" }}>
                    Notes are synced privately to your learner account.
                  </span>

                  <button
                    type="submit"
                    className={styles.btnActionNext}
                    style={{ minHeight: "44px" }}
                  >
                    Save Note to Notebook ✓
                  </button>
                </div>
              </form>
            </div>

            {/* Chronological "My Notes" Notebook Column */}
            <div className={styles.timelineCard}>
              <div className={styles.timelineTitle}>
                <span>Chronological Notes ({savedNotes.length})</span>
                <span className={styles.statusBadge + " " + styles.statusCompleted}>Synced</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "480px", overflowY: "auto" }}>
                {savedNotes.map((note) => (
                  <div key={note.id} style={{ padding: "12px", borderRadius: 10, background: "#fdfbf7", border: "1px solid #ece6dd" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "#78716c", marginBottom: "4px" }}>
                      <span style={{ fontWeight: 700, color: "#d97706" }}>{note.stepTitle}</span>
                      <span>{formatNoteDate(note.createdAt)}</span>
                    </div>

                    {note.videoTimestampSeconds != null && (
                      <div style={{ marginBottom: "6px" }}>
                        <span style={{ fontSize: "0.72rem", background: "#fef3c7", color: "#92400e", padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>
                          ▶ Tagged at {formatVideoTime(note.videoTimestampSeconds)}
                        </span>
                      </div>
                    )}

                    {note.highlightSnippet && (
                      <blockquote style={{ margin: "4px 0 6px", padding: "4px 8px", borderLeft: "3px solid #d97706", background: "#ffffff", fontSize: "0.8rem", fontStyle: "italic", color: "#475569" }}>
                        &ldquo;{note.highlightSnippet}&rdquo;
                      </blockquote>
                    )}

                    <p style={{ margin: "4px 0 8px", fontSize: "0.85rem", color: "#1c1917", lineHeight: 1.45 }}>
                      {note.noteText}
                    </p>

                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        onClick={() => handleDeleteNote(note.id)}
                        style={{ background: "none", border: "none", color: "#dc2626", fontSize: "0.72rem", cursor: "pointer", fontWeight: 700 }}
                      >
                        Delete Note
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* =====================================================================
          STEP E: QUIZ_PAGE (Focused Distraction-Free Quiz, One Card at a Time)
          ===================================================================== */}
      {learningStep === "QUIZ_PAGE" && (
        <section className={styles.quizScreenContainer}>
          {/* Top Breadcrumb Back Link */}
          <div>
            <button
              type="button"
              onClick={() => goToNotesPage(selectedModuleId, selectedLessonId)}
              className={styles.breadcrumbBackLink}
            >
              &larr; Back to Lesson Notes
            </button>
          </div>

          {/* Visible Progress Indicator Header */}
          <div style={{ background: "#ffffff", border: "1px solid #ece6dd", borderRadius: 14, padding: "1.25rem 1.5rem", boxShadow: "0 2px 10px rgba(28, 25, 23, 0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
              <div>
                <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "#d97706", textTransform: "uppercase" }}>
                  Step 5 of 6 &bull; {currentQuestion.category}
                </span>
                <h3 style={{ margin: "2px 0 0", fontSize: "1.15rem", fontWeight: 800 }}>
                  Question {activeQuizQuestionIndex + 1} of {totalQuestions}
                </h3>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span className={styles.statusBadge + " " + styles.statusRequired}>
                  Pass mark: {activeModule.quiz?.passMark || 75}%
                </span>
                <span className={styles.statusBadge + " " + (isBeforeVideo ? styles.statusInProgress : styles.statusCompleted)}>
                  {isBeforeVideo ? "Diagnostic" : "Post-Assessment"}
                </span>
              </div>
            </div>

            {/* Question Progress Bar */}
            <div className={styles.quizProgressBarTrack}>
              <div
                className={styles.quizProgressBarFill}
                style={{ width: `${Math.round(((activeQuizQuestionIndex + 1) / totalQuestions) * 100)}%` }}
              />
            </div>
          </div>

          {/* Single Question Card */}
          <div className={styles.singleQuestionCard}>
            <div style={{ marginBottom: "1.5rem" }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "#78716c", textTransform: "uppercase" }}>
                {currentQuestion.type === "MULTIPLE_CHOICE"
                  ? "Single Choice (Select One)"
                  : currentQuestion.type === "MULTI_SELECT"
                  ? "Multi-Select Checkboxes (Select All That Apply)"
                  : "Short Answer Reflection"}
              </span>
              <h2 style={{ fontSize: "1.2rem", fontWeight: 800, margin: "8px 0 0", color: "#1c1917", lineHeight: 1.45 }}>
                {currentQuestion.question}
              </h2>
            </div>

            {/* Question Type 1: Single Choice */}
            {currentQuestion.type === "MULTIPLE_CHOICE" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {currentQuestion.options?.map((opt) => {
                  const isSelected = selectedSingleChoice === opt.id;
                  return (
                    <label
                      key={opt.id}
                      className={`${styles.questionOptionRadioCard} ${isSelected ? styles.questionOptionSelected : ""}`}
                    >
                      <input
                        type="radio"
                        name="single_choice"
                        checked={isSelected}
                        onChange={() => setSelectedSingleChoice(opt.id)}
                        style={{ accentColor: "#d97706", width: 18, height: 18 }}
                      />
                      <span style={{ fontSize: "0.92rem", fontWeight: isSelected ? 700 : 500, color: "#1c1917" }}>
                        {opt.text}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            {/* Question Type 2: Multi-Select Checkboxes */}
            {currentQuestion.type === "MULTI_SELECT" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {currentQuestion.options?.map((opt) => {
                  const isChecked = selectedMultiChoice.includes(opt.id);
                  return (
                    <label
                      key={opt.id}
                      className={`${styles.questionOptionRadioCard} ${isChecked ? styles.questionOptionSelected : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedMultiChoice([...selectedMultiChoice, opt.id]);
                          } else {
                            setSelectedMultiChoice(selectedMultiChoice.filter((id) => id !== opt.id));
                          }
                        }}
                        style={{ accentColor: "#d97706", width: 18, height: 18 }}
                      />
                      <span style={{ fontSize: "0.92rem", fontWeight: isChecked ? 700 : 500, color: "#1c1917" }}>
                        {opt.text}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            {/* Question Type 3: Short Answer Reflective Text Box */}
            {currentQuestion.type === "SHORT_ANSWER" && (
              <div>
                <textarea
                  rows={5}
                  value={shortAnswerText}
                  placeholder={currentQuestion.placeholder}
                  onChange={(e) => setShortAnswerText(e.target.value)}
                  className={styles.noteTextarea}
                />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px", fontSize: "0.75rem", color: "#78716c" }}>
                  <span>Min characters: {currentQuestion.minCharacters || 15}</span>
                  <span>{shortAnswerText.trim().length} characters entered</span>
                </div>
              </div>
            )}

            {/* Navigation inside card */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "2rem", paddingTop: "1.25rem", borderTop: "1px solid #ece6dd" }}>
              <button
                type="button"
                onClick={() => {
                  const prev = Math.max(0, activeQuizQuestionIndex - 1);
                  setActiveQuizQuestionIndex(prev);
                  onQuizQuestionIndexChange?.(prev);
                }}
                disabled={activeQuizQuestionIndex === 0}
                className={styles.btnActionBack}
              >
                ◀ Previous Question
              </button>

              {activeQuizQuestionIndex < totalQuestions - 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.min(totalQuestions - 1, activeQuizQuestionIndex + 1);
                    setActiveQuizQuestionIndex(next);
                    onQuizQuestionIndexChange?.(next);
                  }}
                  className={styles.btnActionNext}
                >
                  Next Question ▶
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleEvaluateQuiz}
                  className={styles.btnActionNext}
                  style={{ background: "#16a34a" }}
                >
                  Submit Quiz &amp; Evaluate Score ✓
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* =====================================================================
          STEP F: NEXT_STEP_PAGE (Pass Celebration / Friendly Retry Screen)
          ===================================================================== */}
      {learningStep === "NEXT_STEP_PAGE" && (
        <section>
          {/* Top Breadcrumb Back Link */}
          <div style={{ marginBottom: "0.75rem" }}>
            <button
              type="button"
              onClick={() => goToModulePage(selectedModuleId)}
              className={styles.breadcrumbBackLink}
            >
              &larr; Back to Step {activeModule.sequence} Roadmap
            </button>
          </div>

          {/* Visible Progress Indicator */}
          <div style={{ padding: "10px 16px", background: "#ffffff", border: "1px solid #ece6dd", borderRadius: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px", marginBottom: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 800, color: "#1c1917" }}>
                Step 6 of 6:
              </span>
              <span style={{ fontSize: "0.85rem", color: "#57534e" }}>
                Module Completion &amp; Progression Evaluation
              </span>
            </div>
            <span className={styles.statusBadge + " " + (isQuizPassed ? styles.statusPassed : styles.statusFailed)}>
              {isQuizPassed ? `Passed (${quizScore}%)` : `Retake Needed (${quizScore}%)`}
            </span>
          </div>

          {isQuizPassed ? (
            /* Pass Celebration Screen */
            <div className={styles.celebrationCard}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#dcfce7", color: "#16a34a", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.25rem" }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>

              <span className={styles.statusBadge + " " + styles.statusPassed} style={{ fontSize: "0.85rem", padding: "4px 12px" }}>
                Passed &bull; {quizScore}% Score
              </span>

              <h2 style={{ fontSize: "1.8rem", fontWeight: 800, margin: "1rem 0 0.5rem", color: "#1c1917" }}>
                Congratulations, {learnerName}!
              </h2>
              <p style={{ margin: "0 auto", fontSize: "0.95rem", color: "#57534e", maxWidth: "520px", lineHeight: 1.5 }}>
                You have successfully demonstrated mastery of <strong>Module {activeModule.sequence}: {activeModule.title}</strong>, achieving {quizScore}% (Required pass mark was {activeModule.quiz?.passMark || 75}%).
              </p>

              {/* Unlocked Next Step Announcement */}
              <div className={styles.unlockAnnouncementBox}>
                <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#bbf7d0", color: "#15803d", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                  </svg>
                </div>
                <div>
                  <h4 style={{ margin: "0 0 2px", fontSize: "0.95rem", fontWeight: 800, color: "#166534" }}>
                    Module {activeModule.sequence + 1}: Strategic Influence Unlocked!
                  </h4>
                  <p style={{ margin: 0, fontSize: "0.82rem", color: "#15803d" }}>
                    Your progression has updated on the server. Continuing advances your official CPD certification record.
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap", marginTop: "1.5rem" }}>
                <button
                  type="button"
                  onClick={() => goToModulePage(selectedModuleId)}
                  className={styles.btnActionBack}
                >
                  Review Module Roadmap
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (onNextModule) {
                      onNextModule();
                    } else if (onContinueToReview) {
                      onContinueToReview();
                    } else {
                      goToModulePage(selectedModuleId);
                    }
                  }}
                  className={styles.btnActionNext}
                  style={{ minHeight: "48px", padding: "0.75rem 2rem", fontSize: "1rem" }}
                >
                  Continue to Next Module &rarr;
                </button>
              </div>
            </div>
          ) : (
            /* Friendly Retry Screen */
            <div className={styles.retryCard}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#fef3c7", color: "#b45309", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.25rem" }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>

              <span className={styles.statusBadge + " " + styles.statusFailed} style={{ fontSize: "0.85rem", padding: "4px 12px" }}>
                Score: {quizScore != null ? `${quizScore}%` : "Incomplete"} &bull; Below 75% Pass Mark
              </span>

              <h2 style={{ fontSize: "1.8rem", fontWeight: 800, margin: "1rem 0 0.5rem", color: "#1c1917" }}>
                Almost There! Let&apos;s Review &amp; Retry
              </h2>
              <p style={{ margin: "0 auto", fontSize: "0.95rem", color: "#57534e", maxWidth: "520px", lineHeight: 1.5 }}>
                You scored {quizScore}% on this attempt. The passing threshold is {activeModule.quiz?.passMark || 75}%. You can review the video theatre and worksheet materials, then retry the assessment immediately.
              </p>

              <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap", marginTop: "2rem" }}>
                <button
                  type="button"
                  onClick={() => goToVideoPage(selectedModuleId, selectedLessonId)}
                  className={styles.btnActionBack}
                >
                  ← Rewatch Video Lecture
                </button>

                <button
                  type="button"
                  onClick={handleResetQuiz}
                  className={styles.btnActionNext}
                  style={{ minHeight: "48px", padding: "0.75rem 2rem", fontSize: "1rem" }}
                >
                  Retry Knowledge Check Quiz &rarr;
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* =====================================================================
          8. PREDICTABLE BOTTOM ACTION BAR (Non-Negotiable Primary Next CTA)
          ===================================================================== */}
      <footer className={styles.fixedBottomActionBar}>
        <div>
          {learningStep === "MODULE_PAGE" ? (
            <button
              type="button"
              onClick={onBackToEdit || (() => setStep("MODULE_PAGE"))}
              className={styles.btnActionBack}
            >
              {onBackToEdit ? "← Exit to Course Catalog" : "← Back to My Courses"}
            </button>
          ) : learningStep === "VIDEO_PAGE" ? (
            <button
              type="button"
              onClick={() => goToModulePage(selectedModuleId)}
              className={styles.btnActionBack}
            >
              &larr; Previous: Module Overview
            </button>
          ) : learningStep === "RESOURCE_PAGE" ? (
            <button
              type="button"
              onClick={() => goToVideoPage(selectedModuleId, selectedLessonId)}
              className={styles.btnActionBack}
            >
              &larr; Previous: Video Theatre
            </button>
          ) : learningStep === "NOTES_PAGE" ? (
            <button
              type="button"
              onClick={() => goToResourcePage(selectedModuleId, selectedLessonId)}
              className={styles.btnActionBack}
            >
              &larr; Previous: PDF Worksheet
            </button>
          ) : learningStep === "QUIZ_PAGE" ? (
            <button
              type="button"
              onClick={() => goToNotesPage(selectedModuleId, selectedLessonId)}
              className={styles.btnActionBack}
            >
              &larr; Previous: Lesson Notes
            </button>
          ) : (
            <button
              type="button"
              onClick={() => goToModulePage(selectedModuleId)}
              className={styles.btnActionBack}
            >
              &larr; Previous: Return to Roadmap
            </button>
          )}
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          {learningStep === "MODULE_PAGE" && (
            <button
              type="button"
              onClick={() => {
                if (isVideoLockedByPreQuiz) {
                  goToQuizPage(selectedModuleId, selectedLessonId);
                } else {
                  goToVideoPage(selectedModuleId, selectedLessonId);
                }
              }}
              className={styles.btnActionNext}
            >
              <span>{isVideoLockedByPreQuiz ? "Take Diagnostic Assessment First &rarr;" : "Continue to Video Theatre &rarr;"}</span>
            </button>
          )}

          {learningStep === "VIDEO_PAGE" && (
            <button
              type="button"
              onClick={() => goToResourcePage(selectedModuleId, selectedLessonId)}
              className={styles.btnActionNext}
            >
              <span>Continue to PDF &amp; Resources &rarr;</span>
            </button>
          )}

          {learningStep === "RESOURCE_PAGE" && (
            <button
              type="button"
              onClick={() => goToNotesPage(selectedModuleId, selectedLessonId)}
              className={styles.btnActionNext}
            >
              <span>Continue to Lesson Notes &rarr;</span>
            </button>
          )}

          {learningStep === "NOTES_PAGE" && (
            <button
              type="button"
              onClick={() => goToQuizPage(selectedModuleId, selectedLessonId)}
              className={styles.btnActionNext}
            >
              <span>Continue to Knowledge Check Quiz &rarr;</span>
            </button>
          )}

          {learningStep === "QUIZ_PAGE" && (
            <button
              type="button"
              onClick={() => {
                if (activeQuizQuestionIndex < totalQuestions - 1) {
                  const nextIdx = activeQuizQuestionIndex + 1;
                  setActiveQuizQuestionIndex(nextIdx);
                  onQuizQuestionIndexChange?.(nextIdx);
                } else {
                  handleEvaluateQuiz();
                }
              }}
              className={styles.btnActionNext}
            >
              <span>{activeQuizQuestionIndex < totalQuestions - 1 ? "Next Question &rarr;" : "Submit Quiz &rarr;"}</span>
            </button>
          )}

          {learningStep === "NEXT_STEP_PAGE" && (
            <button
              type="button"
              onClick={() => {
                if (isQuizPassed) {
                  if (onNextModule) onNextModule();
                  else if (onContinueToReview) onContinueToReview();
                  else goToModulePage(selectedModuleId);
                } else {
                  handleResetQuiz();
                }
              }}
              className={styles.btnActionNext}
            >
              <span>{isQuizPassed ? "Continue to Next Lesson / Module &rarr;" : "Retry Quiz &rarr;"}</span>
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
