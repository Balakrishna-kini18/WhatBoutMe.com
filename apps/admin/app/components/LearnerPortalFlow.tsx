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
  cohortName = "",
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
  const [showThumbnails, setShowThumbnails] = useState(true);
  const [pdfPage, setPdfPage] = useState(1);
  const totalPdfPages = 12;
  const [pdfZoom, setPdfZoom] = useState(100);
  const [pdfRotation, setPdfRotation] = useState(0);
  const [pdfMarkedAsRead, setPdfMarkedAsRead] = useState(false);

  const handleRotatePdf = () => {
    setPdfRotation((prev) => (prev + 90) % 360);
  };

  const handleFitPdf = () => {
    setPdfZoom(100);
    setPdfRotation(0);
  };

  // ---------------------------------------------------------------------------
  // Step D: Distraction-Free Notes Companion State
  // ---------------------------------------------------------------------------
  const [noteTextAlign, setNoteTextAlign] = useState<"left" | "center" | "right">("left");
  const defaultStarterNotes = "Key Points:\n• \n\nAction Items:\n• \n\nPersonal Reflection:\n• ";
  const [inLessonNoteText, setInLessonNoteText] = useState(defaultStarterNotes);
  const [inLessonHighlight, setInLessonHighlight] = useState("");
  const [bookmarkTimestamp, setBookmarkTimestamp] = useState<number | null>(null);
  const [autoSaveFeedback, setAutoSaveFeedback] = useState<string>("✓ Saved to My Notes");
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

  const handleInsertFormatInNotes = (tag: "B" | "I" | "U" | "BULLET" | "NUMBER") => {
    if (tag === "B") setInLessonNoteText((prev) => `${prev} **bold**`);
    else if (tag === "I") setInLessonNoteText((prev) => `${prev} *italic*`);
    else if (tag === "U") setInLessonNoteText((prev) => `${prev} _underline_`);
    else if (tag === "BULLET") setInLessonNoteText((prev) => `${prev}\n• `);
    else if (tag === "NUMBER") setInLessonNoteText((prev) => `${prev}\n1. `);
  };

  const handleSaveNote = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inLessonNoteText.trim()) return;

    const newNote: SavedNoteItem = {
      id: "note-" + Date.now(),
      noteText: inLessonNoteText.trim(),
      highlightSnippet: inLessonHighlight.trim() || null,
      videoTimestampSeconds: bookmarkTimestamp != null ? bookmarkTimestamp : Math.floor(currentTime),
      createdAt: new Date().toISOString(),
      stepTitle: `Step ${activeModule.sequence}: ${activeModule.title}`,
      lessonTitle: currentVideoLesson.title,
    };

    setSavedNotes([newNote, ...savedNotes]);
    setBookmarkTimestamp(null);
    const nowTime = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    setAutoSaveFeedback(`✓ Saved to My Notes at ${nowTime}`);
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
  const [quizAnswers, setQuizAnswers] = useState<Record<string, any>>({});
  const [quizScore, setQuizScore] = useState<number | null>(null);
  const [isQuizPassed, setIsQuizPassed] = useState(false);

  const quizQuestions = [
    {
      id: "q1",
      type: "MULTIPLE_CHOICE" as const,
      question: "Which leadership practice is most effective in stabilizing psychological safety during organizational restructuring?",
      category: "Emotional Regulation & Trust",
      codeSnippet: "// Executive Crisis Protocol:\nconst protocol = {\n  strategy: 'transparent_vulnerability',\n  method: 'active_stakeholder_listening',\n  stabilizePsychologicalSafety: true\n};\nexecuteProtocol(protocol);",
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
      codeSnippet: "/* Strategic Emotional Intelligence Framework */\n• Pillar 1: Somatic Signal Mapping & Physiological Baselines\n• Pillar 2: Social Empathy & Cognitive Perspective Synthesis\n• Pillar 3: Non-Reactive De-escalation Protocols",
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
      placeholder: "Describe specific meetings, stakeholders, or volatile triggers where you will apply this reframing...",
      minCharacters: 15,
    },
  ];

  const totalQuestions = quizQuestions.length;
  const fallbackQuestion = quizQuestions[0]!;
  const currentQuestion = quizQuestions[activeQuizQuestionIndex] ?? fallbackQuestion;

  const handleSelectSingleChoice = (questionId: string, optId: number) => {
    setQuizAnswers((prev) => ({ ...prev, [questionId]: optId }));
    setSelectedSingleChoice(optId);
  };

  const handleToggleMultiChoice = (questionId: string, optId: number) => {
    const existing: number[] = (quizAnswers[questionId] as number[]) || selectedMultiChoice || [];
    const updated = existing.includes(optId)
      ? existing.filter((id) => id !== optId)
      : [...existing, optId];
    setQuizAnswers((prev) => ({ ...prev, [questionId]: updated }));
    setSelectedMultiChoice(updated);
  };

  const handleShortAnswerChange = (questionId: string, text: string) => {
    setQuizAnswers((prev) => ({ ...prev, [questionId]: text }));
    setShortAnswerText(text);
  };

  const handleEvaluateQuiz = () => {
    let earned = 0;
    const q1 = quizQuestions[0];
    const q1Ans = quizAnswers[q1?.id ?? "q1"] ?? selectedSingleChoice;
    if (q1 && q1Ans === q1.correctOption) earned += 1;

    const q2 = quizQuestions[1];
    const q2Ans: number[] = quizAnswers[q2?.id ?? "q2"] ?? selectedMultiChoice;
    if (
      Array.isArray(q2Ans) &&
      q2Ans.length === 2 &&
      q2Ans.includes(0) &&
      q2Ans.includes(2)
    ) {
      earned += 1;
    }

    const q3 = quizQuestions[2];
    const q3Ans: string = (quizAnswers[q3?.id ?? "q3"] ?? shortAnswerText ?? "").trim();
    if (q3Ans.length >= (q3?.minCharacters || 15)) earned += 1;

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
    setQuizAnswers({});
    setSelectedSingleChoice(null);
    setSelectedMultiChoice([]);
    setShortAnswerText("");
    setQuizScore(null);
    setIsQuizPassed(false);
    goToQuizPage(selectedModuleId, selectedLessonId);
  };

  const handleContinueNext = () => {
    // Check if there is another uncompleted video lesson in this active module
    const nextLessonInModule = playlistVideos.find(
      (v, idx) => idx > currentVideoIndex && v.status !== "Completed"
    );
    if (nextLessonInModule) {
      goToVideoPage(selectedModuleId, nextLessonInModule.id);
      return;
    }

    // Otherwise advance to next module
    if (onNextModule) {
      onNextModule();
    } else if (onContinueToReview) {
      onContinueToReview();
    } else {
      const nextMod = courseTimelineModules.find((m) => m.sequence === activeModule.sequence + 1);
      if (nextMod) {
        setSelectedModuleId(nextMod.id);
        onModuleSelect?.(nextMod.id);
        setActiveModule(nextMod);
        goToModulePage(nextMod.id);
      } else {
        goToModulePage(selectedModuleId);
      }
    }
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
        <section className={styles.resourceScreenContainer} aria-label="Dedicated PDF / Resource Viewer">
          {/* 1. Top Breadcrumb & Lesson Header */}
          <div>
            <div style={{ marginBottom: "0.5rem" }}>
              <button
                type="button"
                onClick={() => goToVideoPage(activeModule.id, currentVideoLesson.id)}
                className={styles.breadcrumbBackLink}
              >
                &larr; Step {activeModule.sequence}: {activeModule.title}
              </button>
            </div>

            <div className={styles.resourceTopHeader}>
              <div className={styles.resourceHeaderLeft}>
                <h1 className={styles.resourceLessonTitle}>
                  {currentLessonNumber}. {currentVideoLesson.title}
                </h1>
              </div>

              {isVideoCompleted && (
                <div className={styles.badgeCompletedGreen}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>✓ Video Completed</span>
                </div>
              )}
            </div>

            {/* 3-Tab Step Bar with PDF / Resources active */}
            <div className={styles.screenTabsBar} role="tablist">
              <button
                type="button"
                role="tab"
                onClick={() => goToNotesPage(activeModule.id, currentVideoLesson.id)}
                className={styles.screenTabBtn}
              >
                <span>📝 Lesson Notes</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected="true"
                className={`${styles.screenTabBtn} ${styles.screenTabBtnActive}`}
              >
                <span>📄 PDF / Resources</span>
              </button>
              <button
                type="button"
                role="tab"
                onClick={() => goToVideoPage(activeModule.id, currentVideoLesson.id)}
                className={styles.screenTabBtn}
              >
                <span>📑 Transcript</span>
              </button>
            </div>
          </div>

          {/* 2. Dedicated Document Viewer Card */}
          {pdfLesson ? (
            <div className={styles.docViewerCard}>
              {/* Top Dark Toolbar (#1E293B) */}
              <div className={styles.docToolbar}>
                <div className={styles.docToolbarLeft}>
                  {/* Hamburger Thumbnail Toggle */}
                  <button
                    type="button"
                    onClick={() => setShowThumbnails(!showThumbnails)}
                    className={`${styles.docToolbarBtn} ${showThumbnails ? styles.docToolbarBtnActive : ""}`}
                    title="Toggle Thumbnails Strip"
                    aria-label="Toggle Page Thumbnails"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="3" y1="12" x2="21" y2="12" />
                      <line x1="3" y1="6" x2="21" y2="6" />
                      <line x1="3" y1="18" x2="21" y2="18" />
                    </svg>
                    <span>Thumbnails</span>
                  </button>

                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span className={styles.docToolbarTitle}>
                    {pdfLesson.title ? `${pdfLesson.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf` : "variables-and-data-types.pdf"}
                  </span>
                </div>

                <div className={styles.docToolbarControls}>
                  {/* Page Counter & Controls */}
                  <button
                    type="button"
                    onClick={() => setPdfPage((prev) => Math.max(1, prev - 1))}
                    disabled={pdfPage === 1}
                    className={styles.docToolbarBtn}
                    title="Previous Page"
                  >
                    ◀ Prev
                  </button>
                  <span style={{ fontSize: "0.8rem", fontWeight: 700, padding: "0 6px", fontFamily: "monospace" }}>
                    {pdfPage} / {totalPdfPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPdfPage((prev) => Math.min(totalPdfPages, prev + 1))}
                    disabled={pdfPage === totalPdfPages}
                    className={styles.docToolbarBtn}
                    title="Next Page"
                  >
                    Next ▶
                  </button>

                  {/* Zoom Controls */}
                  <button
                    type="button"
                    onClick={() => setPdfZoom((prev) => Math.max(60, prev - 15))}
                    className={styles.docToolbarBtn}
                    title="Zoom Out"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    onClick={handleFitPdf}
                    className={styles.docToolbarBtn}
                    title="Reset Zoom to 100%"
                  >
                    {pdfZoom}%
                  </button>
                  <button
                    type="button"
                    onClick={() => setPdfZoom((prev) => Math.min(160, prev + 15))}
                    className={styles.docToolbarBtn}
                    title="Zoom In"
                  >
                    +
                  </button>

                  {/* Rotate Icon */}
                  <button
                    type="button"
                    onClick={handleRotatePdf}
                    className={styles.docToolbarBtn}
                    title="Rotate 90° Clockwise"
                    aria-label="Rotate Document"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="23 4 23 10 17 10" />
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                  </button>

                  {/* Download / Open action */}
                  {pdfLesson.mediaUrl && (
                    <a
                      href={pdfLesson.mediaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.docToolbarBtn}
                      title="Open PDF in new tab"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                      <span>Open PDF ↗</span>
                    </a>
                  )}

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

              {/* Split Document Body: Left Thumbnails + Right Document Canvas */}
              <div className={styles.docSplitBody}>
                {/* Left Thumbnail Strip */}
                {showThumbnails && (
                  <div className={styles.docThumbnailStrip} role="region" aria-label="Page Thumbnails">
                    {Array.from({ length: totalPdfPages }, (_, i) => i + 1).map((p) => (
                      <div
                        key={p}
                        onClick={() => setPdfPage(p)}
                        className={`${styles.docThumbnailItem} ${p === pdfPage ? styles.docThumbnailItemActive : ""}`}
                        role="button"
                        tabIndex={0}
                        title={`Jump to Page ${p}`}
                      >
                        <div className={styles.docThumbnailPreviewBox}>
                          <div className={styles.docThumbnailLine} style={{ width: "70%" }} />
                          <div className={styles.docThumbnailLine} style={{ width: "90%" }} />
                          <div className={styles.docThumbnailLine} style={{ width: "55%" }} />
                          <div className={styles.docThumbnailLine} style={{ width: "80%" }} />
                        </div>
                        <span>Page {p}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Right Crisp White Document Page Canvas */}
                <div className={styles.docPageCanvasWrapper}>
                  <div
                    className={styles.docCanvasCard}
                    style={{
                      transform: `scale(${pdfZoom / 100}) rotate(${pdfRotation}deg)`,
                    }}
                  >
                    <div className={styles.docPageWatermark}>
                      WHATBOUTME FZE &bull; ACCREDITED CPD
                    </div>

                    <div style={{ borderBottom: "2px solid #1c1917", paddingBottom: "1rem" }}>
                      <span style={{ fontSize: "0.8rem", fontWeight: 800, color: "#d97706", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                        Executive Leadership Practical Framework &bull; Page {pdfPage} of {totalPdfPages}
                      </span>
                      <h2 style={{ fontSize: "1.65rem", fontWeight: 800, margin: "6px 0 4px", color: "#1c1917" }}>
                        {pdfPage === 1
                          ? "Emotional Stimulus & Physiological Trigger Matrix"
                          : pdfPage === 2
                          ? "The 4-Step S.T.O.P. De-escalation Protocol"
                          : pdfPage === 3
                          ? "Multi-Stakeholder Persuasion & Consensus Mapping"
                          : pdfPage === 4
                          ? "Executive Gravitas & Cross-Functional Psychological Safety"
                          : `Advanced Study Sheet — Section ${pdfPage}: Leadership Applied Protocols`}
                      </h2>
                      <p style={{ margin: 0, fontSize: "0.88rem", color: "#57534e" }}>
                        Participant: <strong>{learnerName}</strong> &bull; Cohort: Executive Leadership Fall 2026
                      </p>
                    </div>

                    {pdfPage === 1 && (
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
                    )}

                    {pdfPage === 2 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                        <div style={{ padding: "1.25rem", borderRadius: 10, background: "#fff7ed", border: "1px solid #fed7aa" }}>
                          <h4 style={{ margin: "0 0 8px", fontSize: "0.95rem", fontWeight: 800, color: "#92400e" }}>
                            Somatic Baseline Indicators &amp; Amygdala Hijack Mitigation
                          </h4>
                          <p style={{ margin: "0 0 10px", fontSize: "0.85rem", color: "#44403c", lineHeight: 1.6 }}>
                            When acute stress initiates sympathetic autonomic arousal, cognitive perspective taking collapses.
                            Executives must identify their primary bodily warning signals:
                          </p>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "0.82rem" }}>
                            <div style={{ padding: "8px 12px", background: "#ffffff", borderRadius: 6, border: "1px solid #fed7aa" }}>
                              <strong>Vocal Constriction:</strong> Elevation in pitch, rapid cadence.
                            </div>
                            <div style={{ padding: "8px 12px", background: "#ffffff", borderRadius: 6, border: "1px solid #fed7aa" }}>
                              <strong>Somatic Tension:</strong> Shoulders elevated, clenched jaw.
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {pdfPage >= 3 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                        <div style={{ padding: "1.25rem", borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                          <h4 style={{ margin: "0 0 8px", fontSize: "0.95rem", fontWeight: 800, color: "#1e293b" }}>
                            Section {pdfPage}: Applied Boardroom Scenarios &amp; Strategic Action Matrix
                          </h4>
                          <p style={{ margin: 0, fontSize: "0.85rem", color: "#475569", lineHeight: 1.65 }}>
                            Review your cohort study group assignments and implement the strategic frameworks covered in Unit {activeModule.sequence}.
                            Maintain daily logs of emotional regulation practices and cross-functional feedback loops.
                          </p>
                        </div>
                      </div>
                    )}

                    <div style={{ marginTop: "1rem", padding: "1.25rem", borderRadius: 10, border: "1.5px dashed #cbd5e1", background: "#f8fafc" }}>
                      <h4 style={{ margin: "0 0 6px", fontSize: "0.9rem", fontWeight: 800, color: "#334155" }}>
                        Fillable Reflection Space (Print or Annotate Online)
                      </h4>
                      <p style={{ margin: 0, fontSize: "0.82rem", color: "#64748b" }}>
                        Note two recurring professional situations that trigger immediate defensive reactions. Contrast your default reaction with your reframed, intentional response.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Empty State Card if no PDF attached */
            <div className={styles.docEmptyStateCard}>
              <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#fff7ed", color: "#d97706", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <line x1="9" y1="15" x2="15" y2="15" />
                </svg>
              </div>
              <h3 className={styles.emptyStateTitle}>Optional Step — No PDF attached to this lesson</h3>
              <p className={styles.emptyStateSubtitle}>
                This lesson does not require supplemental worksheets or external reading documents. You can advance directly to taking notes.
              </p>
              <button
                type="button"
                onClick={() => goToNotesPage(activeModule.id, currentVideoLesson.id)}
                className={styles.btnNextCTA}
              >
                Continue to Notes &rarr;
              </button>
            </div>
          )}

          {/* 3. Bottom Navigation Action Bar (Screen C) */}
          <div className={styles.resourceFooterBar}>
            <div>
              <button
                type="button"
                onClick={() => goToVideoPage(activeModule.id, currentVideoLesson.id)}
                className={styles.btnPrevVideo}
              >
                &larr; Previous Video
              </button>
            </div>

            <div>
              <button
                type="button"
                onClick={() => goToNotesPage(activeModule.id, currentVideoLesson.id)}
                className={styles.btnNextCTA}
              >
                Continue to Notes &rarr;
              </button>
            </div>
          </div>
        </section>
      )}

      {/* =====================================================================
          STEP D: NOTES_PAGE (Distraction-Free Lesson Notes Companion)
          ===================================================================== */}
      {learningStep === "NOTES_PAGE" && (
        <section className={styles.notesScreenContainer} aria-label="Distraction-Free Lesson Notes Companion">
          {/* 1. Top Breadcrumb & Lesson Header */}
          <div>
            <div style={{ marginBottom: "0.5rem" }}>
              <button
                type="button"
                onClick={() => pdfLesson ? goToResourcePage(activeModule.id, pdfLesson.id) : goToVideoPage(activeModule.id, currentVideoLesson.id)}
                className={styles.breadcrumbBackLink}
              >
                &larr; Step {activeModule.sequence}: {activeModule.title}
              </button>
            </div>

            <div className={styles.notesTopHeader}>
              <div className={styles.notesHeaderLeft}>
                <h1 className={styles.notesLessonTitle}>
                  {currentLessonNumber}. {currentVideoLesson.title}
                </h1>
              </div>
            </div>

            {/* 3-Tab Step Bar with Lesson Notes active */}
            <div className={styles.screenTabsBar} role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected="true"
                className={`${styles.screenTabBtn} ${styles.screenTabBtnActive}`}
              >
                <span>📝 Lesson Notes</span>
              </button>
              <button
                type="button"
                role="tab"
                onClick={() => goToResourcePage(activeModule.id, pdfLesson?.id)}
                className={styles.screenTabBtn}
              >
                <span>📄 PDF / Resources</span>
              </button>
              <button
                type="button"
                role="tab"
                onClick={() => goToVideoPage(activeModule.id, currentVideoLesson.id)}
                className={styles.screenTabBtn}
              >
                <span>📑 Transcript</span>
              </button>
            </div>
          </div>

          {/* 2. Distraction-Free Note Editor Card */}
          <div className={styles.notesEditorCard}>
            {/* Top Formatting Toolbar */}
            <div className={styles.notesFormattingToolbar}>
              <div className={styles.notesFormatLeftGroup}>
                {/* B, I, U, Bullet, Number buttons */}
                <div className={styles.formatBtnGroup}>
                  <button
                    type="button"
                    onClick={() => handleInsertFormatInNotes("B")}
                    className={styles.formatBtn}
                    title="Bold"
                  >
                    B
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInsertFormatInNotes("I")}
                    className={styles.formatBtn}
                    title="Italic"
                    style={{ fontStyle: "italic" }}
                  >
                    I
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInsertFormatInNotes("U")}
                    className={styles.formatBtn}
                    title="Underline"
                    style={{ textDecoration: "underline" }}
                  >
                    U
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInsertFormatInNotes("BULLET")}
                    className={styles.formatBtn}
                    title="Bullet List"
                  >
                    &bull;
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInsertFormatInNotes("NUMBER")}
                    className={styles.formatBtn}
                    title="Numbered List"
                  >
                    1.
                  </button>
                </div>

                {/* Text Alignment buttons */}
                <div className={styles.alignBtnGroup} role="group" aria-label="Text Alignment">
                  <button
                    type="button"
                    onClick={() => setNoteTextAlign("left")}
                    className={`${styles.alignBtn} ${noteTextAlign === "left" ? styles.alignBtnActive : ""}`}
                    title="Align Left"
                    aria-label="Align Left"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="17" y1="10" x2="3" y2="10" />
                      <line x1="21" y1="6" x2="3" y2="6" />
                      <line x1="21" y1="14" x2="3" y2="14" />
                      <line x1="17" y1="18" x2="3" y2="18" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNoteTextAlign("center")}
                    className={`${styles.alignBtn} ${noteTextAlign === "center" ? styles.alignBtnActive : ""}`}
                    title="Align Center"
                    aria-label="Align Center"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="10" x2="6" y2="10" />
                      <line x1="21" y1="6" x2="3" y2="6" />
                      <line x1="21" y1="14" x2="3" y2="14" />
                      <line x1="18" y1="18" x2="6" y2="18" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNoteTextAlign("right")}
                    className={`${styles.alignBtn} ${noteTextAlign === "right" ? styles.alignBtnActive : ""}`}
                    title="Align Right"
                    aria-label="Align Right"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="21" y1="10" x2="7" y2="10" />
                      <line x1="21" y1="6" x2="3" y2="6" />
                      <line x1="21" y1="14" x2="3" y2="14" />
                      <line x1="21" y1="18" x2="7" y2="18" />
                    </svg>
                  </button>
                </div>

                {/* Tag video timestamp button */}
                <button
                  type="button"
                  onClick={handleCaptureTimestamp}
                  className={styles.btnTagTime}
                  title="Tag current video timestamp"
                >
                  ▶ Tag Video ({formatVideoTime(currentTime)})
                </button>
              </div>

              {/* Subtle Right Badge */}
              <div className={styles.notesScopedBadge}>
                <span>🔒 Private to you &bull; Scoped to Step {activeModule.sequence}: {activeModule.title} / {currentVideoLesson.title}</span>
              </div>
            </div>

            {/* Focused Writing Area (min-height: 300px) */}
            <form onSubmit={handleSaveNote}>
              <textarea
                className={styles.noteTextareaLarge}
                placeholder="Key Points:&#10;• &#10;&#10;Action Items:&#10;• &#10;&#10;Personal Reflection:&#10;• "
                value={inLessonNoteText}
                onChange={(e) => setInLessonNoteText(e.target.value)}
                style={{ textAlign: noteTextAlign }}
                aria-label="Write personal lesson notes"
              />

              {/* Card Footer Bar */}
              <div className={styles.notesCardFooterBar}>
                <div className={styles.notesStatusIndicator}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>{autoSaveFeedback}</span>
                </div>

                <button
                  type="submit"
                  className={styles.btnSaveNotePrimary}
                >
                  Save Note
                </button>
              </div>
            </form>
          </div>

          {/* Previous Saved Notes List for this lesson */}
          {savedNotes.length > 0 && (
            <div className={styles.previousNotesContainer}>
              <h3 className={styles.previousNotesHeading}>
                <span>Previous Notes for this Lesson</span>
                <span className={styles.statusBadge + " " + styles.statusCompleted}>
                  {savedNotes.length} Entries Saved
                </span>
              </h3>

              <div className={styles.previousNotesList}>
                {savedNotes.map((note) => (
                  <div key={note.id} className={styles.previousNoteCard}>
                    <div className={styles.previousNoteHeader}>
                      <span style={{ fontWeight: 700, color: "#d97706" }}>
                        {note.stepTitle} &bull; {note.lessonTitle}
                      </span>
                      <span>{formatNoteDate(note.createdAt)}</span>
                    </div>

                    {note.videoTimestampSeconds != null && (
                      <div style={{ marginBottom: "6px" }}>
                        <span style={{ fontSize: "0.72rem", background: "#fef3c7", color: "#92400e", padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>
                          ▶ Tagged at {formatVideoTime(note.videoTimestampSeconds)}
                        </span>
                      </div>
                    )}

                    <p className={styles.previousNoteText}>
                      {note.noteText}
                    </p>

                    <div className={styles.previousNoteFooter}>
                      <span>Private learner note</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteNote(note.id)}
                        className={styles.btnDeleteSavedNote}
                      >
                        Delete Note
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. Bottom Navigation Action Bar (Screen D) */}
          <div className={styles.notesFooterBar}>
            <div>
              <button
                type="button"
                onClick={() => pdfLesson ? goToResourcePage(activeModule.id, pdfLesson.id) : goToVideoPage(activeModule.id, currentVideoLesson.id)}
                className={styles.btnPrevVideo}
              >
                &larr; Previous
              </button>
            </div>

            <div>
              <button
                type="button"
                onClick={() => goToQuizPage(activeModule.id)}
                className={styles.btnNextCTA}
              >
                Continue to Quiz &rarr;
              </button>
            </div>
          </div>
        </section>
      )}

      {/* =====================================================================
          STEP E: QUIZ_PAGE (Focused Distraction-Free Quiz, One Card at a Time)
          ===================================================================== */}
      {learningStep === "QUIZ_PAGE" && (
        <section className={styles.quizScreenContainer}>
          {/* 1. Top Quiz Header */}
          <div className={styles.quizHeader}>
            <div className={styles.quizHeaderLeft}>
              <button
                type="button"
                onClick={() => goToNotesPage(selectedModuleId, selectedLessonId)}
                className={styles.breadcrumbBackLink}
              >
                &larr; Step {activeModule.sequence}: {activeModule.title}
              </button>
              <h2 className={styles.quizHeaderTitle}>
                {currentLessonNumber}. {currentVideoLesson.title}
              </h2>
              <p className={styles.quizHeaderSubtitle}>
                {isBeforeVideo ? "Diagnostic Pre-Assessment" : "Knowledge Check & Mastery Assessment"}
              </p>
            </div>

            <div className={styles.quizMetaPill}>
              <div className={styles.quizMetaPillBadge}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span>Quiz &bull; {totalQuestions} Questions</span>
              </div>
              <span className={styles.quizMetaPillSub}>
                Pass Mark: {activeModule.quiz?.passMark || 75}%
              </span>
            </div>
          </div>

          {/* Compulsory Video Gate Check: AFTER_VIDEO requirement */}
          {!isBeforeVideo && !isVideoCompleted ? (
            <div className={styles.quizLockedCard}>
              <div className={styles.quizLockIconCircle}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <h3 className={styles.quizLockedTitle}>Compulsory Video Lecture Required</h3>
              <p className={styles.quizLockedMessage}>
                Roweena&apos;s curriculum requires you to complete the lesson video lecture (<strong>{currentVideoLesson.title}</strong>) in full before unlocking this comprehension quiz. Content anti-skip enforcement is active.
              </p>
              <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => goToVideoPage(selectedModuleId, selectedLessonId)}
                  className={styles.btnReturnToVideo}
                >
                  Return to Video &rarr;
                </button>
                {isSimulatorMode && (
                  <button
                    type="button"
                    onClick={() => setIsVideoCompleted(true)}
                    className={styles.btnActionBack}
                    style={{ color: "#d97706", borderColor: "#f59e0b" }}
                  >
                    ⚡ Bypass &amp; Unlock Video (Simulator Testing)
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* 2. Quiz Progress Bar Card */}
              <div className={styles.quizProgressCard}>
                <div className={styles.quizProgressLabels}>
                  <span className={styles.quizProgressQuestionCount}>
                    Question {activeQuizQuestionIndex + 1} of {totalQuestions}
                  </span>
                  <span className={styles.quizProgressPercent}>
                    {Math.round(((activeQuizQuestionIndex + 1) / totalQuestions) * 100)}%
                  </span>
                </div>
                <div className={styles.quizProgressBarTrack}>
                  <div
                    className={styles.quizProgressBarFill}
                    style={{ width: `${Math.round(((activeQuizQuestionIndex + 1) / totalQuestions) * 100)}%` }}
                  />
                </div>
              </div>

              {/* 3. Single-Question Focus Card (One Question at a Time) */}
              <div className={styles.singleQuestionCard}>
                <div className={styles.quizPromptContainer}>
                  <div className={styles.quizCategoryTag}>
                    {currentQuestion.category} &bull;{" "}
                    {currentQuestion.type === "MULTIPLE_CHOICE"
                      ? "Single Choice"
                      : currentQuestion.type === "MULTI_SELECT"
                      ? "Multi-Select (Select All That Apply)"
                      : "Reflective Short Answer"}
                  </div>
                  <h3 className={styles.quizPromptTitle}>
                    {activeQuizQuestionIndex + 1}. {currentQuestion.question}
                  </h3>
                </div>

                {/* Optional Media / Code Block */}
                {currentQuestion.codeSnippet && (
                  <div className={styles.quizMediaContainer}>
                    <div className={styles.quizMediaLabel}>Scenario / Code Context</div>
                    <pre className={styles.quizCodeBlock}>
                      <code>{currentQuestion.codeSnippet}</code>
                    </pre>
                  </div>
                )}

                {/* Answer Options: SINGLE_CHOICE */}
                {currentQuestion.type === "MULTIPLE_CHOICE" && (
                  <div className={styles.quizOptionsList} role="radiogroup" aria-label={`Question ${activeQuizQuestionIndex + 1}`}>
                    {currentQuestion.options?.map((opt) => {
                      const isSelected = (quizAnswers[currentQuestion.id] ?? selectedSingleChoice) === opt.id;
                      return (
                        <div
                          key={opt.id}
                          role="radio"
                          aria-checked={isSelected}
                          tabIndex={0}
                          onClick={() => handleSelectSingleChoice(currentQuestion.id, opt.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleSelectSingleChoice(currentQuestion.id, opt.id);
                            }
                          }}
                          className={`${styles.quizOptionRow} ${isSelected ? styles.quizOptionRowSelected : ""}`}
                        >
                          <div className={`${styles.quizOptionDot} ${isSelected ? styles.quizOptionDotSelected : ""}`}>
                            {isSelected && <div className={styles.quizOptionDotInner} />}
                          </div>
                          <div className={styles.quizOptionTextWrap}>
                            <span className={`${styles.quizOptionText} ${isSelected ? styles.quizOptionTextSelected : ""}`}>
                              {opt.text}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Answer Options: MULTI_SELECT */}
                {currentQuestion.type === "MULTI_SELECT" && (
                  <div className={styles.quizOptionsList} role="group" aria-label={`Question ${activeQuizQuestionIndex + 1}`}>
                    {currentQuestion.options?.map((opt) => {
                      const selectedArr: number[] = quizAnswers[currentQuestion.id] ?? selectedMultiChoice;
                      const isChecked = selectedArr.includes(opt.id);
                      return (
                        <div
                          key={opt.id}
                          role="checkbox"
                          aria-checked={isChecked}
                          tabIndex={0}
                          onClick={() => handleToggleMultiChoice(currentQuestion.id, opt.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleToggleMultiChoice(currentQuestion.id, opt.id);
                            }
                          }}
                          className={`${styles.quizOptionRow} ${isChecked ? styles.quizOptionRowSelected : ""}`}
                        >
                          <div className={`${styles.quizCheckboxBox} ${isChecked ? styles.quizCheckboxBoxSelected : ""}`}>
                            {isChecked && (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </div>
                          <div className={styles.quizOptionTextWrap}>
                            <span className={`${styles.quizOptionText} ${isChecked ? styles.quizOptionTextSelected : ""}`}>
                              {opt.text}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Answer Options: SHORT_ANSWER / TEXT_BOX */}
                {currentQuestion.type === "SHORT_ANSWER" && (
                  <div className={styles.quizTextBoxWrap}>
                    <textarea
                      rows={5}
                      value={quizAnswers[currentQuestion.id] ?? shortAnswerText}
                      placeholder={currentQuestion.placeholder}
                      onChange={(e) => handleShortAnswerChange(currentQuestion.id, e.target.value)}
                      className={styles.quizTextarea}
                    />
                    <div className={styles.quizTextCounterRow}>
                      <span>Min requirement: {currentQuestion.minCharacters || 15} characters</span>
                      <span>
                        {(quizAnswers[currentQuestion.id] ?? shortAnswerText).trim().length} characters entered
                      </span>
                    </div>
                  </div>
                )}

                {/* 4. Bottom Navigation Action Bar inside Card */}
                <div className={styles.quizCardActionBar}>
                  <button
                    type="button"
                    onClick={() => {
                      if (activeQuizQuestionIndex > 0) {
                        const prev = activeQuizQuestionIndex - 1;
                        setActiveQuizQuestionIndex(prev);
                        onQuizQuestionIndexChange?.(prev);
                      } else {
                        goToNotesPage(selectedModuleId, selectedLessonId);
                      }
                    }}
                    className={styles.btnActionBack}
                  >
                    &larr; {activeQuizQuestionIndex === 0 ? "Back to Notes" : "Previous"}
                  </button>

                  {activeQuizQuestionIndex < totalQuestions - 1 ? (
                    <button
                      type="button"
                      onClick={() => {
                        const next = activeQuizQuestionIndex + 1;
                        setActiveQuizQuestionIndex(next);
                        onQuizQuestionIndexChange?.(next);
                      }}
                      className={styles.btnActionNext}
                    >
                      Next Question &rarr;
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleEvaluateQuiz}
                      className={styles.btnActionNext}
                    >
                      Submit Quiz &rarr;
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {/* =====================================================================
          STEP F: NEXT_STEP_PAGE (Quiz Result & Next Module / Lesson Unlock)
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
              &larr; Step {activeModule.sequence}: {activeModule.title}
            </button>
          </div>

          {isQuizPassed ? (
            /* 1. Passed / Completed Celebration Card */
            <div className={styles.celebrationCard}>
              <div className={styles.celebrationIconBox}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>

              <span className={styles.statusBadge + " " + styles.statusPassed} style={{ fontSize: "0.85rem", padding: "4px 14px", borderRadius: 20 }}>
                Passed
              </span>

              <h2 className={styles.celebrationTitle}>
                Congratulations, {learnerName}!
              </h2>

              <p style={{ margin: "0 auto 0.75rem", fontSize: "1rem", fontWeight: 700, color: "#166534" }}>
                You scored {quizScore}% &bull; Pass mark: {activeModule.quiz?.passMark || 75}%
              </p>

              <p className={styles.celebrationMessage}>
                Great work! You have completed <strong>{currentVideoLesson.title || activeModule.title}</strong> and unlocked the next step in your learning path.
              </p>

              {/* Unlocked Next Step Announcement Box */}
              <div className={styles.unlockAnnouncementBox}>
                <div className={styles.unlockIconBox}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                  </svg>
                </div>
                <div>
                  <h4 className={styles.unlockTitle}>
                    Module {activeModule.sequence + 1}: Strategic Influence &amp; High-Stakes Communication Unlocked!
                  </h4>
                  <p className={styles.unlockDescription}>
                    Your progression has verified and updated on the server. Continuing advances your official CPD certification record.
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className={styles.celebrationActions}>
                <button
                  type="button"
                  onClick={() => goToModulePage(selectedModuleId)}
                  className={styles.btnActionBack}
                >
                  Back to Learning Path
                </button>

                <button
                  type="button"
                  onClick={handleContinueNext}
                  className={styles.btnActionNext}
                  style={{ minHeight: "48px", padding: "0.75rem 2.25rem", fontSize: "1rem" }}
                >
                  Continue to Next Module &rarr;
                </button>
              </div>
            </div>
          ) : (
            /* 2. Failed / Retry State Card (If Score < Pass Mark) */
            <div className={styles.retryCard}>
              <div className={styles.retryIconBox}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>

              <span className={styles.statusBadge + " " + styles.statusFailed} style={{ fontSize: "0.85rem", padding: "4px 14px", borderRadius: 20 }}>
                Score: {quizScore != null ? `${quizScore}%` : "Incomplete"} &bull; Below {activeModule.quiz?.passMark || 75}% Pass Mark
              </span>

              <h2 className={styles.retryTitle}>
                Almost There! Let&apos;s Review &amp; Retry
              </h2>

              <p className={styles.retryMessage}>
                You scored {quizScore}% on this attempt. The passing threshold is {activeModule.quiz?.passMark || 75}%. You have remaining attempts. Review the lesson video and notes, then retry the assessment.
              </p>

              {/* Action Buttons */}
              <div className={styles.retryActions}>
                <button
                  type="button"
                  onClick={() => goToVideoPage(selectedModuleId, selectedLessonId)}
                  className={styles.btnActionBack}
                >
                  &larr; Review Lesson Video &amp; Notes
                </button>

                <button
                  type="button"
                  onClick={handleResetQuiz}
                  className={styles.btnActionNext}
                  style={{ minHeight: "48px", padding: "0.75rem 2.25rem", fontSize: "1rem" }}
                >
                  Retry Quiz &rarr;
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
              onClick={() => {
                if (activeQuizQuestionIndex > 0) {
                  const prev = activeQuizQuestionIndex - 1;
                  setActiveQuizQuestionIndex(prev);
                  onQuizQuestionIndexChange?.(prev);
                } else {
                  goToNotesPage(selectedModuleId, selectedLessonId);
                }
              }}
              className={styles.btnActionBack}
            >
              &larr; {activeQuizQuestionIndex === 0 ? "Previous: Lesson Notes" : "Previous Question"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => goToModulePage(selectedModuleId)}
              className={styles.btnActionBack}
            >
              &larr; Back to Learning Path
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
                  handleContinueNext();
                } else {
                  handleResetQuiz();
                }
              }}
              className={styles.btnActionNext}
            >
              <span>{isQuizPassed ? "Continue to Next Module &rarr;" : "Retry Quiz &rarr;"}</span>
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
