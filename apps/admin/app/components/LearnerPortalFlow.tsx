"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import styles from "./LearnerPortalFlow.module.css";
import {
  LearnerNote,
  CreateLearnerNotePayload,
  LessonMaterial,
  LessonDiscussionPost,
  getLearnerNotes,
  createLearnerNote,
  updateLearnerNote,
  deleteLearnerNote,
  getLessonMaterials,
  getLessonDiscussions,
  createLessonDiscussionPost,
  replyToLessonDiscussion,
  toggleDiscussionLike,
  saveLearnerResumeState,
  getLearnerResumeState,
} from "../lib/api";

export type LearnerStepView =
  | "DASHBOARD"
  | "ROADMAP"
  | "MODULE_DETAIL"
  | "LESSON_VIEW"
  // Legacy aliases for backward compatibility
  | "MODULE_PAGE"
  | "VIDEO_PAGE"
  | "RESOURCE_PAGE"
  | "NOTES_PAGE"
  | "QUIZ_PAGE"
  | "NEXT_STEP_PAGE";

export type LessonWorkspaceTab = "video" | "quiz" | "notes" | "materials" | "discussions";

export interface Lesson {
  id: string;
  title: string;
  type: string; // "VIDEO" | "PDF" | "TEXT" | "QUIZ"
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
  module?: StepModule;
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
  showShell?: boolean;
}

// -----------------------------------------------------------------------------
// DEFAULT 9-MODULE CURRICULUM SAMPLE DATA MATCHING REFERENCE DESIGN
// -----------------------------------------------------------------------------
const DEFAULT_SAMPLE_MODULES: StepModule[] = [
  {
    id: "step-1",
    sequence: 1,
    title: "Module 1: Foundations & Baseline Assessment",
    description: "Explore the foundational architecture of the LMS and self-regulation protocols.",
    status: "Completed",
    lessons: [
      {
        id: "les-1-1",
        title: "Introduction to LMS Platform",
        type: "VIDEO",
        mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
        durationSec: 492,
        durationFormatted: "08:12",
        status: "Completed",
      },
      {
        id: "les-1-2",
        title: "Core Navigation & Learning Architecture",
        type: "VIDEO",
        mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
        durationSec: 620,
        durationFormatted: "10:20",
        status: "Completed",
      },
    ],
  },
  {
    id: "step-2",
    sequence: 2,
    title: "Module 2: Strategic Influence & Learning Mastery",
    description: "Managing your learning pathway, tracking progression, and mastering the core toolset.",
    status: "In progress",
    lessons: [
      {
        id: "les-2-1",
        title: "Lesson 1: Introduction to LMS",
        type: "VIDEO",
        mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
        durationSec: 720,
        durationFormatted: "12 min",
        status: "Completed",
      },
      {
        id: "les-2-2",
        title: "Lesson 2: Core Features Overview",
        type: "VIDEO",
        mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
        durationSec: 900,
        durationFormatted: "15 min",
        status: "Completed",
      },
      {
        id: "les-2-3",
        title: "Lesson 3: Managing Your Learning",
        type: "VIDEO",
        mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
        durationSec: 1080,
        durationFormatted: "18 min • Video + Quiz",
        status: "In progress",
      },
      {
        id: "les-2-4",
        title: "Lesson 4: Advanced Tips & Best Practices",
        type: "VIDEO",
        mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
        durationSec: 1200,
        durationFormatted: "20 min • Video + Quiz",
        status: "Locked",
      },
    ],
    quiz: {
      id: "quiz-step-2",
      title: "Quiz: Lesson 3 Knowledge Check",
      passMark: 75,
      questionsCount: 10,
    },
  },
  {
    id: "step-3",
    sequence: 3,
    title: "Module 3: Conflict De-Escalation & Resolution Dynamics",
    description: "Systematic methodologies for navigating volatile interpersonal impasses.",
    status: "Locked",
    lessons: [
      {
        id: "les-3-1",
        title: "Lesson 1: De-escalation Fundamentals",
        type: "VIDEO",
        mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
        durationSec: 600,
        durationFormatted: "10 min",
        status: "Locked",
      },
    ],
  },
  {
    id: "step-4",
    sequence: 4,
    title: "Module 4: Adaptive Decision-Making Under Cognitive Load",
    description: "Stress-testing protocols to prevent decision fatigue in high-velocity leadership.",
    status: "Locked",
    lessons: [],
  },
  {
    id: "step-5",
    sequence: 5,
    title: "Module 5: Behavioral Diagnostics & Team Cohesion",
    description: "Assessing team dynamics and establishing high-trust feedback loops.",
    status: "Locked",
    lessons: [],
  },
  {
    id: "step-6",
    sequence: 6,
    title: "Module 6: Non-Verbal Gravitas & Executive Presence",
    description: "Calibrating vocal resonance, pacing, and physical poise for executive meetings.",
    status: "Locked",
    lessons: [],
  },
  {
    id: "step-7",
    sequence: 7,
    title: "Module 7: Crisis Communications & High-Stakes Alignment",
    description: "Rapid alignment frameworks during organizational restructures.",
    status: "Locked",
    lessons: [],
  },
  {
    id: "step-8",
    sequence: 8,
    title: "Module 8: Cross-Cultural Intelligence & Global Operations",
    description: "Bridging diverse cultural contexts across distributed international operations.",
    status: "Locked",
    lessons: [],
  },
  {
    id: "step-9",
    sequence: 9,
    title: "Module 9: Capstone Leadership Portfolio & Defense",
    description: "Synthesizing full-spectrum executive mastery into an integrated action plan.",
    status: "Locked",
    lessons: [],
  },
];

const DEFAULT_QUIZ_QUESTIONS = [
  {
    id: "q-1",
    question: "What is the primary purpose of this LMS platform?",
    options: [
      "To edit video files",
      "To manage payroll",
      "To manage learning and track course progress",
      "To design graphics",
    ],
    correctIndex: 2,
  },
  {
    id: "q-2",
    question: "How do lessons unlock within a module?",
    options: [
      "Randomly upon login",
      "Sequentially as requirements and completion gates are met",
      "By purchasing unlock tokens",
      "Only after midnight every Sunday",
    ],
    correctIndex: 1,
  },
  {
    id: "q-3",
    question: "What minimum passing score is required on the Knowledge Check?",
    options: ["50%", "60%", "75%", "100%"],
    correctIndex: 2,
  },
  {
    id: "q-4",
    question: "Where can you find downloadable course slides and exercise sheets?",
    options: [
      "In the Learning Materials tab of the lesson workspace",
      "In your personal spam folder",
      "By emailing the billing department",
      "In the browser dev tools console",
    ],
    correctIndex: 0,
  },
  {
    id: "q-5",
    question: "Can you capture the exact video timestamp when taking personal lesson notes?",
    options: [
      "No, notes cannot be synchronized with video",
      "Yes, using the Capture Video Time button in the note composer",
      "Only if you have an external stopwatch",
      "Only in the mobile app",
    ],
    correctIndex: 1,
  },
  {
    id: "q-6",
    question: "Who can view the notes and highlights you write in the LMS?",
    options: [
      "All registered learners in the cohort",
      "Only you — they are personal and private to your account",
      "Anyone who visits the public marketing site",
      "Third-party advertisers",
    ],
    correctIndex: 1,
  },
  {
    id: "q-7",
    question: "What happens when you complete all requirements of a module?",
    options: [
      "The next module is unlocked automatically",
      "Your account is immediately deleted",
      "You must retake module 1",
      "A confirmation fax is transmitted",
    ],
    correctIndex: 0,
  },
  {
    id: "q-8",
    question: "How do you ask clarifying questions to instructors and fellow cohort peers?",
    options: [
      "Via the Discussions (Community Q&A) tab inside the lesson workspace",
      "By filing a legal notice",
      "By editing Wikipedia",
      "By writing on the whiteboard",
    ],
    correctIndex: 0,
  },
  {
    id: "q-9",
    question: "What does the Slide-Over Module Drawer allow you to do?",
    options: [
      "Order food delivery",
      "Quickly inspect and jump between lessons in the current module without losing context",
      "Restart the entire operating system",
      "Play 3D video games",
    ],
    correctIndex: 1,
  },
  {
    id: "q-10",
    question: "When is your official CPD Certificate issued?",
    options: [
      "Before starting the program",
      "After completing all required steps and meeting attendance requirements",
      "Never",
      "Only if requested via postal mail",
    ],
    correctIndex: 1,
  },
];

export default function LearnerPortalFlow({
  module: propModule,
  allModules: propAllModules,
  courseTitle = "Executive Leadership & Brain Health",
  cohortName = "",
  totalStepsCount,
  completedStepsCount,
  overallProgressPercentage,
  learnerName = "sahyadri",
  learnerEmail = "sahyadri@whatboutme.com",
  initialStep = "ROADMAP",
  learningStep: propLearningStep,
  onStepChange,
  selectedModuleId: propSelectedModuleId,
  onModuleSelect,
  selectedLessonId: propSelectedLessonId,
  onLessonSelect,
  activeQuizQuestionIndex: propActiveQuizIndex,
  onQuizQuestionIndexChange,
  onBackToEdit,
  onContinueToReview,
  onNextModule,
  isSimulatorMode = false,
  showShell = true,
}: LearnerPortalFlowProps) {
  // ---------------------------------------------------------------------------
  // 1. Modules and Curriculum Data
  // ---------------------------------------------------------------------------
  const modulesList: StepModule[] = useMemo(() => {
    if (propAllModules && propAllModules.length > 0) return propAllModules;
    if (propModule) {
      const copy = [...DEFAULT_SAMPLE_MODULES];
      copy[1] = { ...copy[1], ...propModule };
      return copy;
    }
    return DEFAULT_SAMPLE_MODULES;
  }, [propAllModules, propModule]);

  // Active module & lesson tracking
  const [activeModuleId, setActiveModuleId] = useState<string>(
    propSelectedModuleId || propModule?.id || "step-2"
  );
  const activeModule: StepModule = useMemo(() => {
    return (
      modulesList.find((m) => m.id === activeModuleId) ??
      modulesList[1] ??
      modulesList[0] ??
      DEFAULT_SAMPLE_MODULES[1]!
    );
  }, [modulesList, activeModuleId]);

  const activeLessons: Lesson[] = useMemo(() => {
    return activeModule && activeModule.lessons && activeModule.lessons.length > 0
      ? activeModule.lessons
      : DEFAULT_SAMPLE_MODULES[1]!.lessons || [];
  }, [activeModule]);

  const [activeLessonId, setActiveLessonId] = useState<string>(
    propSelectedLessonId || activeLessons[2]?.id || activeLessons[0]?.id || "les-2-3"
  );

  const activeLesson = useMemo(() => {
    return activeLessons.find((l) => l.id === activeLessonId) || activeLessons[0];
  }, [activeLessons, activeLessonId]);

  // ---------------------------------------------------------------------------
  // 2. High-Level Navigation State
  // ---------------------------------------------------------------------------
  const normalizeView = (v?: LearnerStepView): LearnerStepView => {
    if (!v) return "ROADMAP";
    if (v === "MODULE_PAGE") return "ROADMAP";
    if (v === "VIDEO_PAGE") return "LESSON_VIEW";
    if (v === "RESOURCE_PAGE") return "LESSON_VIEW";
    if (v === "NOTES_PAGE") return "LESSON_VIEW";
    if (v === "QUIZ_PAGE") return "LESSON_VIEW";
    if (v === "NEXT_STEP_PAGE") return "MODULE_DETAIL";
    return v;
  };

  const [currentView, setCurrentView] = useState<LearnerStepView>(
    normalizeView(propLearningStep || initialStep)
  );

  useEffect(() => {
    if (propLearningStep) {
      setCurrentView(normalizeView(propLearningStep));
    }
  }, [propLearningStep]);

  const setView = (v: LearnerStepView) => {
    setCurrentView(v);
    onStepChange?.(v);
  };

  // 5-Tab Segmented Navigation Strip for LESSON_VIEW
  const [workspaceTab, setWorkspaceTab] = useState<LessonWorkspaceTab>("video");

  // If incoming legacy step was specifically a tab:
  useEffect(() => {
    if (propLearningStep === "QUIZ_PAGE") setWorkspaceTab("quiz");
    else if (propLearningStep === "NOTES_PAGE") setWorkspaceTab("notes");
    else if (propLearningStep === "RESOURCE_PAGE") setWorkspaceTab("materials");
    else if (propLearningStep === "VIDEO_PAGE") setWorkspaceTab("video");
  }, [propLearningStep]);

  // ---------------------------------------------------------------------------
  // 3. Persistent Shell (Sidebar & Top Bar) State
  // ---------------------------------------------------------------------------
  const [activeSidebarNav, setActiveSidebarNav] = useState<string>("MY_COURSES");
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Slide-over Module Lesson Drawer (Panel 9)
  const [isLessonDrawerOpen, setIsLessonDrawerOpen] = useState(false);

  // Celebration Modal (Panel 8)
  const [isCelebrationModalOpen, setIsCelebrationModalOpen] = useState(false);

  // ---------------------------------------------------------------------------
  // 4. Video Player State & Anti-Cheat Logic
  // ---------------------------------------------------------------------------
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(486); // 8:06
  const [videoWatchedProgress, setVideoWatchedProgress] = useState(145);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [isMuted, setIsMuted] = useState(false);

  const formatSecs = (sec: number): string => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleVideoPlayPause = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
      setIsVideoPlaying(true);
    } else {
      videoRef.current.pause();
      setIsVideoPlaying(false);
    }
  };

  const handleRewind10 = () => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = Number(e.target.value);
    if (!videoRef.current) return;
    // Anti-skip constraint: cannot seek ahead of max watched progress
    if (target > videoWatchedProgress + 10) {
      triggerToast("Forward scrubbing is locked until the video is fully completed.");
      return;
    }
    videoRef.current.currentTime = target;
    setVideoCurrentTime(target);
  };

  const togglePlaybackSpeed = () => {
    const speeds = [1.0, 1.25, 1.5, 1.75, 2.0];
    const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
    const nextSpeed = speeds[nextIdx] ?? 1.0;
    setPlaybackSpeed(nextSpeed);
    if (videoRef.current) videoRef.current.playbackRate = nextSpeed;
  };

  const handleVideoEnded = () => {
    setIsVideoPlaying(false);
    setIsCelebrationModalOpen(true);
  };

  // ---------------------------------------------------------------------------
  // 5. Notes Engine (CRUD & Timestamps)
  // ---------------------------------------------------------------------------
  const [notesList, setNotesList] = useState<LearnerNote[]>([]);
  const [noteContentInput, setNoteContentInput] = useState("");
  const [noteTitleInput, setNoteTitleInput] = useState("");
  const [noteSearchQuery, setNoteSearchQuery] = useState("");
  const [noteSortOrder, setNoteSortOrder] = useState<"recent" | "oldest" | "lesson">("recent");
  const [capturedTimestamp, setCapturedTimestamp] = useState<number | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteBody, setEditNoteBody] = useState("");

  const refreshNotes = async () => {
    const data = await getLearnerNotes({
      lessonId: activeLessonId,
      search: noteSearchQuery,
      sort: noteSortOrder,
    });
    setNotesList(data);
  };

  useEffect(() => {
    refreshNotes();
  }, [activeLessonId, noteSearchQuery, noteSortOrder]);

  const handleSaveNote = async () => {
    if (!noteContentInput.trim()) return;
    await createLearnerNote({
      title: noteTitleInput.trim() || undefined,
      content: noteContentInput.trim(),
      lessonId: activeLessonId,
      stepId: activeModuleId,
      videoTimestampSec: capturedTimestamp ?? Math.floor(videoCurrentTime),
    });
    setNoteContentInput("");
    setNoteTitleInput("");
    setCapturedTimestamp(null);
    triggerToast("Note saved successfully!");
    refreshNotes();
  };

  const handleUpdateNote = async (id: string) => {
    if (!editNoteBody.trim()) return;
    await updateLearnerNote(id, { content: editNoteBody });
    setEditingNoteId(null);
    setEditNoteBody("");
    triggerToast("Note updated.");
    refreshNotes();
  };

  const handleDeleteNote = async (id: string) => {
    await deleteLearnerNote(id);
    triggerToast("Note deleted.");
    refreshNotes();
  };

  // ---------------------------------------------------------------------------
  // 6. Materials Engine
  // ---------------------------------------------------------------------------
  const [materialsList, setMaterialsList] = useState<LessonMaterial[]>([]);
  const [materialsSearch, setMaterialsSearch] = useState("");

  const refreshMaterials = async () => {
    const items = await getLessonMaterials(activeLessonId, materialsSearch);
    setMaterialsList(items);
  };

  useEffect(() => {
    refreshMaterials();
  }, [activeLessonId, materialsSearch]);

  // ---------------------------------------------------------------------------
  // 7. Discussions Engine
  // ---------------------------------------------------------------------------
  const [discussionsList, setDiscussionsList] = useState<LessonDiscussionPost[]>([]);
  const [discussionTabFilter, setDiscussionTabFilter] = useState<"all" | "my">("all");
  const [discussionSearch, setDiscussionSearch] = useState("");
  const [newPostContent, setNewPostContent] = useState("");
  const [replyingPostId, setReplyingPostId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");

  const refreshDiscussions = async () => {
    const data = await getLessonDiscussions(activeLessonId, discussionTabFilter, discussionSearch);
    setDiscussionsList(data);
  };

  useEffect(() => {
    refreshDiscussions();
  }, [activeLessonId, discussionTabFilter, discussionSearch]);

  const handleCreatePost = async () => {
    if (!newPostContent.trim()) return;
    await createLessonDiscussionPost(activeLessonId, newPostContent.trim(), learnerName);
    setNewPostContent("");
    triggerToast("Discussion post published!");
    refreshDiscussions();
  };

  const handleCreateReply = async (postId: string) => {
    if (!replyContent.trim()) return;
    await replyToLessonDiscussion(postId, replyContent.trim(), learnerName, activeLessonId);
    setReplyContent("");
    setReplyingPostId(null);
    triggerToast("Reply posted.");
    refreshDiscussions();
  };

  const handleToggleLike = async (postId: string) => {
    await toggleDiscussionLike(postId, activeLessonId);
    refreshDiscussions();
  };

  // ---------------------------------------------------------------------------
  // 8. Quiz Engine (Panel 4)
  // ---------------------------------------------------------------------------
  const [activeQuizIndex, setActiveQuizIndex] = useState<number>(propActiveQuizIndex || 0);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({
    0: 2, // Question 1 answered with option 2 per mockup
  });
  const [isQuizSubmitted, setIsQuizSubmitted] = useState(false);

  const currentQuestion =
    DEFAULT_QUIZ_QUESTIONS[activeQuizIndex] ?? {
      id: "q-default",
      question: "What is the primary purpose of this LMS platform?",
      options: [
        "To edit video files",
        "To manage payroll",
        "To manage learning and track course progress",
        "To design graphics",
      ],
      correctIndex: 2,
    };

  const handleSelectOption = (optionIndex: number) => {
    setQuizAnswers((prev) => ({
      ...prev,
      [activeQuizIndex]: optionIndex,
    }));
  };

  // ---------------------------------------------------------------------------
  // 9. Metrics & Progress Calculation
  // ---------------------------------------------------------------------------
  const progressPct = overallProgressPercentage ?? 12; // 12% in Panel 1
  const completedSteps = completedStepsCount ?? 1;
  const totalSteps = totalStepsCount ?? 9;

  // SVG Progress Ring geometry
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progressPct / 100) * circumference;

  // ---------------------------------------------------------------------------
  // Handlers for Transitions between the 9 views
  // ---------------------------------------------------------------------------
  const handleOpenModuleDetail = (modId: string) => {
    setActiveModuleId(modId);
    onModuleSelect?.(modId);
    setView("MODULE_DETAIL");
  };

  const handleOpenLessonView = (modId: string, lesId: string, tab: LessonWorkspaceTab = "video") => {
    setActiveModuleId(modId);
    setActiveLessonId(lesId);
    setWorkspaceTab(tab);
    onModuleSelect?.(modId);
    onLessonSelect?.(lesId);
    saveLearnerResumeState({
      programId: "prog-1",
      moduleId: modId,
      lessonId: lesId,
      activeTab: tab,
    });
    setView("LESSON_VIEW");
  };

  // ---------------------------------------------------------------------------
  // Main Render
  // ---------------------------------------------------------------------------
  const renderContentBody = () => {
    // VIEW 1: DASHBOARD
    if (currentView === "DASHBOARD") {
      return (
        <div className={styles.dashboardGrid}>
          {/* Welcome Banner */}
          <div className={styles.welcomeHeroBanner}>
            <div>
              <h1 className={styles.welcomeHeroTitle}>Good Morning, {learnerName}</h1>
              <p className={styles.welcomeHeroSubtitle}>
                You have 3 active courses in progress — rewiring your brain for sustainable action.
              </p>
              <div className={styles.stepProgressMiniLine}>
                <div className={styles.miniProgressBar} style={{ width: 220, height: 8 }}>
                  <div className={styles.miniProgressFill} style={{ width: `${progressPct}%` }} />
                </div>
                <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#d97706" }}>
                  {progressPct}% Overall Progress
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setView("ROADMAP")}
              className={styles.btnPrimaryOrange}
            >
              <span>View Learning Path &rarr;</span>
            </button>
          </div>

          {/* Continue Learning Hero Card */}
          <div className={styles.dashboardContinueCard}>
            <div className={styles.continueThumbnail}>
              <div className={styles.continueThumbnailOverlay}>
                <div className={styles.continuePlayCircle}>▶</div>
              </div>
            </div>
            <div className={styles.continueDetails}>
              <span className={styles.continueLabel}>Continue Where You Left Off</span>
              <h2 className={styles.continueCourseTitle}>{courseTitle}</h2>
              <p className={styles.continueLessonTitle}>
                {cohortName ? `${cohortName} • ` : ""}Step 2: Module 2 • Lesson 3: Managing Your Learning
              </p>
              <div className={styles.stepProgressMiniLine}>
                <div className={styles.miniProgressBar} style={{ width: 180 }}>
                  <div className={styles.miniProgressFill} style={{ width: "75%" }} />
                </div>
                <span style={{ fontSize: "0.78rem", color: "#6b7280" }}>75%</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleOpenLessonView("step-2", "les-2-3", "video")}
              className={styles.btnPrimaryOrange}
            >
              <span>Continue Learning &rarr;</span>
            </button>
          </div>

          {/* 2-Column Dashboard Cards */}
          <div className={styles.dashboard2Col}>
            {/* Upcoming Live Session Card */}
            <div className={styles.dashCard}>
              <h3 className={styles.dashCardTitle}>
                <span>📅</span>
                <span>Upcoming Live Session</span>
              </h3>
              <p style={{ fontSize: "0.88rem", color: "#44403c", margin: "0 0 8px" }}>
                <strong>Interactive Cohort Workshop with Roweena Foxwel</strong>
              </p>
              <p style={{ fontSize: "0.82rem", color: "#6b7280", margin: "0 0 14px" }}>
                Saturday, 25 Oct 2026 at 10:00 AM GST via Zoom Meeting
              </p>
              <button
                type="button"
                onClick={() => triggerToast("Launching live session Zoom link...")}
                className={styles.btnSecondaryOutline}
              >
                <span>Join Session</span>
              </button>
            </div>

            {/* Certificate Progress Card */}
            <div className={styles.dashCard}>
              <h3 className={styles.dashCardTitle}>
                <span>🎓</span>
                <span>CPD Certificate Progress</span>
              </h3>
              <p style={{ fontSize: "0.88rem", color: "#44403c", margin: "0 0 8px" }}>
                <strong>{completedSteps} of {totalSteps} modules completed</strong>
              </p>
              <p style={{ fontSize: "0.82rem", color: "#6b7280", margin: "0 0 14px" }}>
                Complete all requirements and pass knowledge checks with 75%+ to unlock your credential.
              </p>
              <button
                type="button"
                onClick={() => triggerToast("Certificates unlock automatically upon final module completion.")}
                className={styles.btnSecondaryOutline}
              >
                <span>View Certificate Status</span>
              </button>
            </div>
          </div>

          {/* Quick Links Grid */}
          <div>
            <h3 style={{ fontSize: "1rem", fontWeight: 800, color: "#1c1917", margin: "0 0 12px" }}>
              Quick Navigation
            </h3>
            <div className={styles.quickLinksGrid}>
              <div
                className={styles.quickLinkCard}
                onClick={() => handleOpenLessonView("step-2", "les-2-3", "notes")}
              >
                <span style={{ fontSize: "1.4rem" }}>✎</span>
                <div>
                  <strong style={{ fontSize: "0.86rem", display: "block" }}>My Notes</strong>
                  <span style={{ fontSize: "0.74rem", color: "#78716c" }}>Personal takeaways</span>
                </div>
              </div>
              <div
                className={styles.quickLinkCard}
                onClick={() => handleOpenLessonView("step-2", "les-2-3", "materials")}
              >
                <span style={{ fontSize: "1.4rem" }}>📁</span>
                <div>
                  <strong style={{ fontSize: "0.86rem", display: "block" }}>Learning Materials</strong>
                  <span style={{ fontSize: "0.74rem", color: "#78716c" }}>Slides & worksheets</span>
                </div>
              </div>
              <div
                className={styles.quickLinkCard}
                onClick={() => handleOpenLessonView("step-2", "les-2-3", "discussions")}
              >
                <span style={{ fontSize: "1.4rem" }}>💬</span>
                <div>
                  <strong style={{ fontSize: "0.86rem", display: "block" }}>Community Q&A</strong>
                  <span style={{ fontSize: "0.74rem", color: "#78716c" }}>Ask questions</span>
                </div>
              </div>
              <div
                className={styles.quickLinkCard}
                onClick={() => triggerToast("Attendance status: 100% compliant.")}
              >
                <span style={{ fontSize: "1.4rem" }}>✓</span>
                <div>
                  <strong style={{ fontSize: "0.86rem", display: "block" }}>Attendance</strong>
                  <span style={{ fontSize: "0.74rem", color: "#78716c" }}>Reconciliation</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // VIEW 2: LEARNING PATH / COURSE ROADMAP (Reference Panel 1)
    if (currentView === "ROADMAP") {
      return (
        <div>
          {/* Header */}
          <div className={styles.pageHeaderRow}>
            <div>
              <button
                type="button"
                onClick={() => setView("DASHBOARD")}
                className={styles.breadcrumbBack}
              >
                &larr; Back to Dashboard
              </button>
              <h1 className={styles.pageMainTitle}>{courseTitle} — Learning Path</h1>
              <p className={styles.pageSubtitle}>
                {cohortName ? `Cohort: ${cohortName} • ` : ""}Complete each step to advance and unlock your certificate.
              </p>
            </div>
          </div>

          <div className={styles.roadmapGrid}>
            {/* Left Steps Card */}
            <div className={styles.stepsContainerCard}>
              <div className={styles.stepsCardHeader}>
                <h2 className={styles.stepsHeading}>Steps</h2>
                <span className={styles.stepsCountTag}>
                  {completedSteps} of {totalSteps} completed
                </span>
              </div>

              <div className={styles.stepsTimeline}>
                {modulesList.map((m, index) => {
                  const isDone = m.status === "Completed" || index === 0;
                  const isActive = m.id === "step-2" || (m.status === "In progress" && !isDone);
                  const isLocked = !isDone && !isActive;

                  return (
                    <div key={m.id} className={styles.stepTimelineRow}>
                      {/* Step Circle Marker */}
                      <div
                        className={`${styles.stepCircle} ${
                          isDone
                            ? styles.stepCircleCompleted
                            : isActive
                            ? styles.stepCircleActive
                            : styles.stepCircleLocked
                        }`}
                      >
                        {isDone ? "✓" : m.sequence}
                      </div>

                      {/* Step Body */}
                      <div className={styles.stepRowBody}>
                        <div className={styles.stepRowInfo}>
                          <span className={styles.stepSequenceLabel}>Step {m.sequence}</span>
                          <h3 className={styles.stepRowTitle}>{m.title}</h3>

                          {isActive && (
                            <>
                              <div className={styles.stepProgressMiniLine}>
                                <div className={styles.miniProgressBar}>
                                  <div className={styles.miniProgressFill} style={{ width: "0%" }} />
                                </div>
                                <span style={{ fontSize: "0.78rem", color: "#6b7280" }}>
                                  0 of 4 completed (0%)
                                </span>
                              </div>
                              <p className={styles.stepRowMeta}>
                                Includes knowledge check (Pass mark: 75%)
                              </p>
                            </>
                          )}

                          {isLocked && (
                            <p className={styles.stepPrereqNotice}>
                              Requires completing Step {m.sequence - 1}
                            </p>
                          )}
                        </div>

                        {/* Action on Right */}
                        <div>
                          {isDone ? (
                            <button
                              type="button"
                              onClick={() => handleOpenModuleDetail(m.id)}
                              className={styles.btnSecondaryOutline}
                            >
                              <span>Review</span>
                            </button>
                          ) : isActive ? (
                            <button
                              type="button"
                              onClick={() => handleOpenModuleDetail(m.id)}
                              className={styles.btnPrimaryOrange}
                            >
                              <span>Start Step</span>
                            </button>
                          ) : (
                            <span className={styles.btnDisabledPill}>Locked</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Column Stack */}
            <div className={styles.roadmapRightCol}>
              {/* Progress Card with SVG Circular Progress Ring */}
              <div className={styles.progressRingCard}>
                <h3 className={styles.progressRingTitle}>Progress</h3>
                <div className={styles.progressRingWrapper}>
                  <svg className={styles.progressRingSvg} viewBox="0 0 100 100">
                    <circle
                      className={styles.progressRingTrack}
                      cx="50"
                      cy="50"
                      r={radius}
                    />
                    <circle
                      className={styles.progressRingIndicator}
                      cx="50"
                      cy="50"
                      r={radius}
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                    />
                  </svg>
                  <span className={styles.progressRingCenterText}>{progressPct}%</span>
                </div>
                <p className={styles.progressRingSubtitle}>
                  {completedSteps} of {totalSteps} steps completed
                </p>
              </div>

              {/* Up Next Dark Card (#18181B) */}
              <div className={styles.upNextDarkCard}>
                <span className={styles.upNextBadge}>Up Next</span>
                <h3 className={styles.upNextTitle}>Module 2</h3>
                <span className={styles.upNextStepMeta}>Step 2 of {totalSteps}</span>
                <button
                  type="button"
                  onClick={() => handleOpenModuleDetail("step-2")}
                  className={styles.btnPrimaryOrange}
                  style={{ width: "100%" }}
                >
                  <span>Start Step</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // VIEW 3: MODULE / STEP DETAIL (Reference Panel 2)
    if (currentView === "MODULE_DETAIL") {
      return (
        <div>
          {/* Header */}
          <div className={styles.pageHeaderRow}>
            <div>
              <button
                type="button"
                onClick={() => setView("ROADMAP")}
                className={styles.breadcrumbBack}
              >
                &larr; Back to Learning Path
              </button>
              <h1 className={styles.pageMainTitle}>Step 2: Module 2</h1>
              <p className={styles.pageSubtitle}>
                {cohortName ? `${cohortName} • ` : ""}Module 2 • 3 of 4 lessons completed
              </p>
            </div>
            <div className={styles.headerActionCluster}>
              <button
                type="button"
                onClick={() => setIsLessonDrawerOpen(true)}
                className={styles.btnSecondaryOutline}
                title="Open Lesson Navigator Drawer"
              >
                <span>☰ Module Lessons</span>
              </button>
            </div>
          </div>

          {/* Module Progress Card */}
          <div className={styles.moduleDetailCard}>
            <div className={styles.moduleProgressHeader}>
              <span>Step Progress: 75% (3 of 4 requirements completed)</span>
              <span style={{ color: "#d97706" }}>75%</span>
            </div>
            <div className={styles.moduleProgressBar}>
              <div className={styles.moduleProgressFill} style={{ width: "75%" }} />
            </div>
          </div>

          {/* Sequential Lesson Cards List */}
          <div className={styles.lessonCardsList}>
            {activeLessons.map((l, lIdx) => {
              const isLessonCompleted = lIdx < 2; // Lessons 1 & 2 done
              const isLessonCurrent = lIdx === 2; // Lesson 3 active
              const isLessonLocked = lIdx === 3; // Lesson 4 locked

              return (
                <div
                  key={l.id}
                  className={`${styles.lessonCardRow} ${
                    isLessonCurrent ? styles.lessonCardActive : ""
                  }`}
                >
                  <div className={styles.lessonCardLeft}>
                    <div
                      className={`${styles.lessonPlayCircle} ${
                        isLessonCompleted
                          ? styles.lessonPlayCircleDone
                          : isLessonCurrent
                          ? styles.lessonPlayCircleActive
                          : styles.lessonPlayCircleLocked
                      }`}
                    >
                      ▶
                    </div>
                    <div className={styles.lessonTitleMeta}>
                      <h4 className={styles.lessonRowTitle}>{l.title}</h4>
                      <span className={styles.lessonRowMeta}>{l.durationFormatted}</span>
                    </div>
                  </div>

                  <div>
                    {isLessonCompleted ? (
                      <span className={styles.lessonDoneCheck} title="Completed">
                        ✓
                      </span>
                    ) : isLessonCurrent ? (
                      <button
                        type="button"
                        onClick={() => handleOpenLessonView(activeModuleId, l.id, "video")}
                        className={styles.btnPrimaryOrange}
                      >
                        <span>Continue</span>
                      </button>
                    ) : (
                      <span style={{ color: "#9ca3af", fontSize: "1.1rem" }} title="Locked">
                        🔒
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Module Footer Navigation */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1.5rem" }}>
            <button
              type="button"
              onClick={() => handleOpenModuleDetail("step-1")}
              className={styles.btnSecondaryOutline}
            >
              <span>&larr; Previous Module</span>
            </button>
            <button
              type="button"
              onClick={() => {
                triggerToast("Module 3 unlocks once you complete Lesson 4 and the Knowledge Check.");
              }}
              className={styles.btnPrimaryOrange}
              style={{ background: "#fef3c7", color: "#b45309", borderColor: "#fde68a" }}
            >
              <span>Next Module &rarr;</span>
            </button>
          </div>
        </div>
      );
    }

    // VIEWS 4, 5, 6, 7, 8: LESSON WORKSPACE & 5-TAB LEARNING TOOLS STRIP
    return (
      <div>
        {/* Top Header */}
        <div className={styles.pageHeaderRow}>
          <div>
            <button
              type="button"
              onClick={() => setView("MODULE_DETAIL")}
              className={styles.breadcrumbBack}
            >
              &larr; Back to Module 2
            </button>
            <h1 className={styles.pageMainTitle}>
              {workspaceTab === "quiz"
                ? "Quiz: Lesson 3"
                : workspaceTab === "notes"
                ? "My Notes"
                : workspaceTab === "materials"
                ? "Learning Materials"
                : workspaceTab === "discussions"
                ? "Discussions"
                : "Step 2: Module 2"}
            </h1>
          </div>
          <div className={styles.headerActionCluster}>
            <button
              type="button"
              onClick={() => handleOpenLessonView(activeModuleId, "les-2-2", workspaceTab)}
              className={styles.btnSecondaryOutline}
            >
              <span>&larr; Previous</span>
            </button>
            <button
              type="button"
              onClick={() => handleOpenLessonView(activeModuleId, "les-2-4", workspaceTab)}
              className={styles.btnPrimaryOrange}
            >
              <span>Next &rarr;</span>
            </button>
          </div>
        </div>

        {/* Persistent 5-Tab Segmented Navigation Strip */}
        <nav className={styles.learningToolsStrip} aria-label="Learning Tools">
          {[
            { id: "video", label: "▶ Video Lesson" },
            { id: "quiz", label: "📋 Quiz" },
            { id: "notes", label: "✎ Notes" },
            { id: "materials", label: "📁 Materials" },
            { id: "discussions", label: "💬 Discussions" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setWorkspaceTab(tab.id as LessonWorkspaceTab)}
              className={`${styles.learningTabBtn} ${
                workspaceTab === tab.id ? styles.learningTabBtnActive : ""
              }`}
            >
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* TAB 1: VIDEO LESSON (Reference Panel 3) */}
        {workspaceTab === "video" && (
          <div className={styles.lessonWorkspaceGrid}>
            {/* Left Column: Video & Details */}
            <div>
              {/* 16:9 Video Theatre */}
              <div className={styles.videoTheatreCard}>
                <video
                  ref={videoRef}
                  className={styles.videoElement}
                  src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
                  onTimeUpdate={() => {
                    if (videoRef.current) {
                      const curr = videoRef.current.currentTime;
                      setVideoCurrentTime(curr);
                      if (curr > videoWatchedProgress) {
                        setVideoWatchedProgress(curr);
                      }
                    }
                  }}
                  onLoadedMetadata={() => {
                    if (videoRef.current) setVideoDuration(videoRef.current.duration || 486);
                  }}
                  onEnded={handleVideoEnded}
                  playsInline
                />

                {/* Moving Subtle Watermark */}
                <div className={styles.videoWatermark}>
                  {learnerName} • {learnerEmail}
                </div>

                {/* Controls Bar */}
                <div className={styles.videoControlOverlay}>
                  <input
                    type="range"
                    className={styles.videoSeekBar}
                    min={0}
                    max={videoDuration || 486}
                    value={videoCurrentTime}
                    onChange={handleSeek}
                    aria-label="Video Seek Bar"
                  />
                  <div className={styles.videoButtonsRow}>
                    <div className={styles.videoButtonsCluster}>
                      <button
                        type="button"
                        onClick={handleVideoPlayPause}
                        className={styles.videoControlBtn}
                        aria-label={isVideoPlaying ? "Pause Video" : "Play Video"}
                      >
                        {isVideoPlaying ? "⏸" : "▶"}
                      </button>
                      <button
                        type="button"
                        onClick={handleRewind10}
                        className={styles.videoControlBtn}
                        title="Rewind 10 Seconds"
                        aria-label="Rewind 10 seconds"
                      >
                        ↺ 10s
                      </button>
                      <span style={{ fontSize: "0.78rem", color: "#e5e7eb" }}>
                        {formatSecs(videoCurrentTime)} / {formatSecs(videoDuration || 486)}
                      </span>
                    </div>

                    <div className={styles.videoButtonsCluster}>
                      <button
                        type="button"
                        onClick={togglePlaybackSpeed}
                        className={styles.videoControlBtn}
                        style={{ fontWeight: 700 }}
                      >
                        {playbackSpeed}x
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (videoRef.current) {
                            videoRef.current.muted = !isMuted;
                            setIsMuted(!isMuted);
                          }
                        }}
                        className={styles.videoControlBtn}
                        aria-label="Mute / Unmute"
                      >
                        {isMuted ? "🔇" : "🔊"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (videoRef.current) {
                            if (document.fullscreenElement) {
                              document.exitFullscreen();
                            } else {
                              videoRef.current.requestFullscreen();
                            }
                          }
                        }}
                        className={styles.videoControlBtn}
                        aria-label="Fullscreen"
                      >
                        ⛶
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Lesson Details Card */}
              <div className={styles.lessonDetailsCard}>
                <div className={styles.lessonDetailsHeader}>
                  <div>
                    <h3 className={styles.lessonDetailsTitle}>Lesson Details</h3>
                    <span style={{ fontSize: "0.78rem", color: "#78716c" }}>Duration: 8:06</span>
                  </div>
                  <span className={styles.watchedPill}>✓ Watched</span>
                </div>

                <p className={styles.lessonParagraph}>
                  In this lesson, we will understand the core concepts of the LMS platform, its features, and
                  how it helps in managing learning, tracking progress, and engaging students effectively.
                </p>

                <div className={styles.objectivesBox}>
                  <h4 className={styles.objectivesTitle}>Learning Objectives</h4>
                  <ul className={styles.objectivesList}>
                    <li className={styles.objectiveItem}>
                      <span className={styles.objectiveIcon}>✓</span>
                      <span>Understand the primary purpose of the LMS platform</span>
                    </li>
                    <li className={styles.objectiveItem}>
                      <span className={styles.objectiveIcon}>✓</span>
                      <span>Explore key features and benefits</span>
                    </li>
                    <li className={styles.objectiveItem}>
                      <span className={styles.objectiveIcon}>✓</span>
                      <span>Learn how it supports learning and progress tracking</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Right Column: Notes Companion & About Step */}
            <div>
              {/* My Notes & Highlights Companion Card */}
              <div className={styles.notesCompanionCard}>
                <div className={styles.notesCompanionHeader}>
                  <h3 className={styles.notesCompanionTitle}>My Notes &amp; Highlights</h3>
                  <span className={styles.notesCompanionMeta}>
                    Personal • Private to you • {notesList.length} notes recorded
                  </span>
                </div>

                <textarea
                  className={styles.noteTextarea}
                  placeholder="Write your notes, key takeaways, or action items..."
                  value={noteContentInput}
                  onChange={(e) => setNoteContentInput(e.target.value.slice(0, 5000))}
                />

                <div className={styles.noteToolbarRow}>
                  <div className={styles.noteToolsGroup}>
                    <button
                      type="button"
                      onClick={() => setNoteContentInput((p) => p + " **bold**")}
                      className={styles.noteToolBtn}
                    >
                      B
                    </button>
                    <button
                      type="button"
                      onClick={() => setNoteContentInput((p) => p + " *italic*")}
                      className={styles.noteToolBtn}
                    >
                      I
                    </button>
                    <button
                      type="button"
                      onClick={() => setNoteContentInput((p) => p + "\n• ")}
                      className={styles.noteToolBtn}
                    >
                      •
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const sec = Math.floor(videoCurrentTime);
                        setCapturedTimestamp(sec);
                        triggerToast(`Video timestamp ${formatSecs(sec)} captured!`);
                      }}
                      className={styles.captureTimeChip}
                      title="Attach current video playback second"
                    >
                      ⏱ {capturedTimestamp !== null ? formatSecs(capturedTimestamp) : "Capture video time"}
                    </button>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: "0.72rem", color: "#a8a29e" }}>
                      {noteContentInput.length}/5000
                    </span>
                    <button
                      type="button"
                      onClick={handleSaveNote}
                      className={styles.btnPrimaryOrange}
                      style={{ padding: "0.4rem 0.85rem", fontSize: "0.78rem" }}
                    >
                      <span>Save Note</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Saved Notes List or Empty State Card */}
              {notesList.length === 0 ? (
                <div className={styles.emptyStateCard}>
                  <div style={{ fontSize: "2rem", marginBottom: 4 }}>📝</div>
                  <h4 className={styles.emptyStateTitle}>No notes yet</h4>
                  <p className={styles.emptyStateText}>
                    Start taking notes while watching the video to keep track of key concepts, important
                    points, and your personal insights.
                  </p>
                </div>
              ) : (
                <div className={styles.notesListStack} style={{ marginBottom: "1.25rem" }}>
                  {notesList.slice(0, 2).map((n) => (
                    <div key={n.id} className={styles.savedNoteCard}>
                      <div className={styles.savedNoteLeft}>
                        <div className={styles.noteIconSquare}>✎</div>
                        <div className={styles.savedNoteContent}>
                          <h4 className={styles.savedNoteTitle}>{n.title}</h4>
                          <p className={styles.savedNoteBody}>{n.content}</p>
                          <span className={styles.savedNoteTime}>
                            {n.videoTimestampSec != null && `⏱ ${formatSecs(n.videoTimestampSec)} • `}
                            23 Oct 2026, 10:25 AM
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
                </div>
              )}

              {/* About this step Card */}
              <div className={styles.aboutStepCard}>
                <h4 className={styles.aboutStepTitle}>About this step</h4>
                <p className={styles.aboutStepText}>
                  Sequential progression is monitored live by the server engines.
                </p>
                <span
                  style={{
                    fontSize: "0.74rem",
                    fontWeight: 700,
                    color: "#d97706",
                    background: "#fff7ed",
                    padding: "3px 8px",
                    borderRadius: 6,
                    width: "fit-content",
                  }}
                >
                  Step Sequence: #2
                </span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: QUIZ TAB VIEW (Reference Panel 4) */}
        {workspaceTab === "quiz" && (
          <div>
            {/* Knowledge Check Soft Lavender Banner */}
            <div className={styles.knowledgeCheckBanner}>
              <span className={styles.knowledgeCheckIcon} style={{ fontSize: "1.3rem" }}>
                🛡️
              </span>
              <p className={styles.knowledgeCheckText}>
                Knowledge Check — Pass mark: 75% • 10 questions • Multiple attempt allowed
              </p>
            </div>

            <div className={styles.quizGrid}>
              {/* Question Card */}
              <div className={styles.questionCard}>
                <span className={styles.questionNumberLabel}>
                  Question {activeQuizIndex + 1} of {DEFAULT_QUIZ_QUESTIONS.length}
                </span>
                <h3 className={styles.questionPrompt}>{currentQuestion.question}</h3>

                <div className={styles.optionsStack}>
                  {currentQuestion.options.map((opt, oIdx) => {
                    const isSelected = quizAnswers[activeQuizIndex] === oIdx;
                    return (
                      <div
                        key={oIdx}
                        onClick={() => handleSelectOption(oIdx)}
                        className={`${styles.optionCard} ${
                          isSelected ? styles.optionCardSelected : ""
                        }`}
                      >
                        <div className={styles.optionRadioCircle}>
                          {isSelected && <div className={styles.optionRadioInnerDot} />}
                        </div>
                        <span className={styles.optionText}>{opt}</span>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <button
                    type="button"
                    disabled={activeQuizIndex === 0}
                    onClick={() => setActiveQuizIndex((p) => Math.max(0, p - 1))}
                    className={styles.btnSecondaryOutline}
                    style={{ opacity: activeQuizIndex === 0 ? 0.4 : 1 }}
                  >
                    <span>&larr; Previous</span>
                  </button>

                  {activeQuizIndex < DEFAULT_QUIZ_QUESTIONS.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => setActiveQuizIndex((p) => p + 1)}
                      className={styles.btnPrimaryOrange}
                    >
                      <span>Next Question &rarr;</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setIsQuizSubmitted(true);
                        setIsCelebrationModalOpen(true);
                        triggerToast("Quiz submitted! You passed with 90%!");
                      }}
                      className={styles.btnPrimaryOrange}
                    >
                      <span>Submit Quiz &rarr;</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Question Navigator Card (Right Column) */}
              <div className={styles.questionNavCard}>
                <h4 className={styles.questionNavTitle}>Questions</h4>
                <div className={styles.questionNumGrid}>
                  {DEFAULT_QUIZ_QUESTIONS.map((_, qIdx) => {
                    const isCurrent = activeQuizIndex === qIdx;
                    const isAnswered = quizAnswers[qIdx] !== undefined;

                    return (
                      <button
                        key={qIdx}
                        type="button"
                        onClick={() => setActiveQuizIndex(qIdx)}
                        className={`${styles.qNumCircle} ${
                          isCurrent
                            ? styles.qNumCurrent
                            : isAnswered
                            ? styles.qNumAnswered
                            : ""
                        }`}
                      >
                        {qIdx + 1}
                      </button>
                    );
                  })}
                </div>

                <div className={styles.quizLegend}>
                  <div className={styles.legendItem}>
                    <span style={{ color: "#d97706" }}>●</span>
                    <span>Current</span>
                  </div>
                  <div className={styles.legendItem}>
                    <span style={{ color: "#16a34a" }}>●</span>
                    <span>Answered</span>
                  </div>
                  <div className={styles.legendItem}>
                    <span style={{ color: "#9ca3af" }}>○</span>
                    <span>Not answered</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: NOTES TAB VIEW (Reference Panel 5) */}
        {workspaceTab === "notes" && (
          <div className={styles.notesTabStack}>
            {/* Top Note Editor Card */}
            <div className={styles.noteEditorCard}>
              <input
                type="text"
                className={styles.noteTitleInput}
                placeholder="Note title or key highlight (optional)..."
                value={noteTitleInput}
                onChange={(e) => setNoteTitleInput(e.target.value)}
              />

              <textarea
                className={styles.noteTextarea}
                placeholder="Write your notes, key takeaways, or action items from this lesson..."
                value={noteContentInput}
                onChange={(e) => setNoteContentInput(e.target.value.slice(0, 5000))}
                style={{ minHeight: 120 }}
              />

              <div className={styles.noteToolbarRow}>
                <div className={styles.noteToolsGroup}>
                  <button
                    type="button"
                    onClick={() => setNoteContentInput((p) => p + " **bold**")}
                    className={styles.noteToolBtn}
                  >
                    B
                  </button>
                  <button
                    type="button"
                    onClick={() => setNoteContentInput((p) => p + " *italic*")}
                    className={styles.noteToolBtn}
                  >
                    I
                  </button>
                  <button
                    type="button"
                    onClick={() => setNoteContentInput((p) => p + "\n• ")}
                    className={styles.noteToolBtn}
                  >
                    •
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const sec = Math.floor(videoCurrentTime);
                      setCapturedTimestamp(sec);
                      triggerToast(`Captured timestamp ${formatSecs(sec)}`);
                    }}
                    className={styles.captureTimeChip}
                  >
                    ⏱ {capturedTimestamp !== null ? formatSecs(capturedTimestamp) : "Capture video time"}
                  </button>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: "0.78rem", color: "#a8a29e" }}>
                    {noteContentInput.length}/5000
                  </span>
                  <button
                    type="button"
                    onClick={handleSaveNote}
                    className={styles.btnPrimaryOrange}
                  >
                    <span>Save Note</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Your Notes Section */}
            <div>
              <div className={styles.yourNotesHeaderRow}>
                <h3 className={styles.yourNotesCountTitle}>Your Notes ({notesList.length})</h3>
                <div className={styles.notesFilterGroup}>
                  <div className={styles.searchBarContainer} style={{ width: 220 }}>
                    <input
                      type="text"
                      className={styles.searchInput}
                      placeholder="Search notes..."
                      value={noteSearchQuery}
                      onChange={(e) => setNoteSearchQuery(e.target.value)}
                    />
                  </div>
                  <select
                    value={noteSortOrder}
                    onChange={(e) => setNoteSortOrder(e.target.value as any)}
                    style={{
                      padding: "0.45rem 0.75rem",
                      border: "1px solid #ece6dd",
                      borderRadius: 8,
                      background: "#ffffff",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      color: "#44403c",
                      outline: "none",
                    }}
                  >
                    <option value="recent">Sort: Recent</option>
                    <option value="oldest">Sort: Oldest</option>
                  </select>
                </div>
              </div>

              <div className={styles.notesListStack} style={{ marginTop: "1rem" }}>
                {notesList.map((n) => (
                  <div key={n.id} className={styles.savedNoteCard}>
                    <div className={styles.savedNoteLeft}>
                      <div className={styles.noteIconSquare}>✎</div>
                      <div className={styles.savedNoteContent}>
                        <h4 className={styles.savedNoteTitle}>{n.title}</h4>
                        {editingNoteId === n.id ? (
                          <div style={{ marginTop: 6 }}>
                            <textarea
                              value={editNoteBody}
                              onChange={(e) => setEditNoteBody(e.target.value)}
                              className={styles.noteTextarea}
                              style={{ minHeight: 70 }}
                            />
                            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                              <button
                                type="button"
                                onClick={() => handleUpdateNote(n.id)}
                                className={styles.btnPrimaryOrange}
                                style={{ padding: "0.3rem 0.75rem", fontSize: "0.75rem" }}
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingNoteId(null)}
                                className={styles.btnSecondaryOutline}
                                style={{ padding: "0.3rem 0.75rem", fontSize: "0.75rem" }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className={styles.savedNoteBody}>{n.content}</p>
                        )}
                        <span className={styles.savedNoteTime}>
                          {n.videoTimestampSec != null && `⏱ ${formatSecs(n.videoTimestampSec)} • `}
                          23 Oct 2026, 10:25 AM
                        </span>
                      </div>
                    </div>

                    <div className={styles.savedNoteActions}>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingNoteId(n.id);
                          setEditNoteBody(n.content);
                        }}
                        className={styles.actionIconBtn}
                        title="Edit note"
                      >
                        ✎
                      </button>
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
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: MATERIALS TAB VIEW (Reference Panel 6) */}
        {workspaceTab === "materials" && (
          <div className={styles.materialsTabStack}>
            <div className={styles.materialsSearchCard}>
              <div className={styles.searchBarContainer}>
                <span style={{ color: "#a8a29e" }}>🔍</span>
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder="Search materials..."
                  value={materialsSearch}
                  onChange={(e) => setMaterialsSearch(e.target.value)}
                />
              </div>
            </div>

            <div className={styles.materialsListStack}>
              {materialsList.map((m) => (
                <div key={m.id} className={styles.materialRowCard}>
                  <div className={styles.materialLeftGroup}>
                    <div
                      className={`${styles.materialTypeBadge} ${
                        m.fileType === "PDF"
                          ? styles.badgePdf
                          : m.fileType === "ZIP"
                          ? styles.badgeZip
                          : styles.badgeGeneric
                      }`}
                    >
                      {m.fileType}
                    </div>
                    <div>
                      <h4 className={styles.materialTitle}>{m.title}</h4>
                      <span className={styles.materialMeta}>
                        {m.fileType} • {m.fileSizeLabel}
                      </span>
                    </div>
                  </div>

                  <a
                    href={m.downloadUrl}
                    download
                    onClick={(e) => {
                      if (m.downloadUrl.startsWith("#")) {
                        e.preventDefault();
                        triggerToast(`Downloading ${m.title}...`);
                      }
                    }}
                    className={styles.btnSecondaryOutline}
                  >
                    <span>↓ Download</span>
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 5: DISCUSSIONS TAB VIEW (Reference Panel 7) */}
        {workspaceTab === "discussions" && (
          <div className={styles.discussionsTabStack}>
            {/* Create Post Composer */}
            <div className={styles.discussionComposerCard}>
              <textarea
                className={styles.composerTextarea}
                placeholder="Ask a question or share your thoughts..."
                value={newPostContent}
                onChange={(e) => setNewPostContent(e.target.value)}
              />
              <div className={styles.composerActionRow}>
                <button
                  type="button"
                  onClick={handleCreatePost}
                  className={styles.btnPrimaryOrange}
                >
                  <span>Post</span>
                </button>
              </div>
            </div>

            {/* Filter Tabs & Search */}
            <div className={styles.discussionFiltersRow}>
              <div className={styles.discussionTabsGroup}>
                <button
                  type="button"
                  onClick={() => setDiscussionTabFilter("all")}
                  className={`${styles.discFilterTab} ${
                    discussionTabFilter === "all" ? styles.discFilterTabActive : ""
                  }`}
                >
                  All Posts
                </button>
                <button
                  type="button"
                  onClick={() => setDiscussionTabFilter("my")}
                  className={`${styles.discFilterTab} ${
                    discussionTabFilter === "my" ? styles.discFilterTabActive : ""
                  }`}
                >
                  My Posts
                </button>
              </div>

              <div className={styles.searchBarContainer} style={{ width: 220 }}>
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder="Search discussions..."
                  value={discussionSearch}
                  onChange={(e) => setDiscussionSearch(e.target.value)}
                />
              </div>
            </div>

            {/* Thread Cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {discussionsList.map((post) => (
                <div key={post.id} className={styles.discussionPostCard}>
                  <div className={styles.postAuthorRow}>
                    <div className={styles.authorAvatar}>{post.authorAvatar || "U"}</div>
                    <div>
                      <span className={styles.authorName}>{post.authorName}</span>
                      <span className={styles.postTime}> • {post.createdAt}</span>
                    </div>
                  </div>

                  <p className={styles.postBodyText}>{post.content}</p>

                  <div className={styles.postActionsBar}>
                    <button
                      type="button"
                      onClick={() => handleToggleLike(post.id)}
                      className={`${styles.postActionBtn} ${
                        post.isLiked ? styles.postActionBtnLiked : ""
                      }`}
                    >
                      <span>👍 {post.likesCount}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setReplyingPostId(replyingPostId === post.id ? null : post.id)}
                      className={styles.postActionBtn}
                    >
                      <span>💬 {post.replies?.length || 0} replies</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setReplyingPostId(post.id)}
                      className={styles.postActionBtn}
                    >
                      <span>Reply</span>
                    </button>
                  </div>

                  {/* Replies */}
                  {post.replies && post.replies.length > 0 && (
                    <div className={styles.repliesContainer}>
                      {post.replies.map((rep) => (
                        <div key={rep.id} className={styles.replyItem}>
                          <div className={styles.postAuthorRow} style={{ marginBottom: 4 }}>
                            <div className={styles.authorAvatar} style={{ width: 24, height: 24, fontSize: "0.7rem" }}>
                              {rep.authorAvatar || "R"}
                            </div>
                            <div>
                              <span className={styles.authorName} style={{ fontSize: "0.82rem" }}>
                                {rep.authorName}
                              </span>
                              <span className={styles.postTime}> • {rep.createdAt}</span>
                            </div>
                          </div>
                          <p className={styles.postBodyText} style={{ fontSize: "0.82rem" }}>
                            {rep.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Inline reply composer */}
                  {replyingPostId === post.id && (
                    <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                      <input
                        type="text"
                        placeholder="Write a reply..."
                        value={replyContent}
                        onChange={(e) => setReplyContent(e.target.value)}
                        className={styles.searchInput}
                        style={{
                          border: "1px solid #e7e0d6",
                          padding: "0.5rem 0.75rem",
                          borderRadius: 8,
                          background: "#ffffff",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleCreateReply(post.id)}
                        className={styles.btnPrimaryOrange}
                        style={{ padding: "0.4rem 0.85rem", fontSize: "0.78rem" }}
                      >
                        Reply
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // Wrap with Persistent Shell if showShell is true
  // ---------------------------------------------------------------------------
  if (!showShell) {
    return (
      <div className={styles.portalContent}>
        {renderContentBody()}

        {/* Lesson Completed Modal */}
        {isCelebrationModalOpen && (
          <div className={styles.celebrationModalBackdrop}>
            <div className={styles.celebrationModalCard}>
              <div className={styles.confettiWrapper}>
                <div className={styles.celebrationCheckCircle}>✓</div>
              </div>
              <h2 className={styles.celebrationHeading}>Lesson Completed!</h2>
              <p className={styles.celebrationSubtitle}>
                You've completed Lesson 3: Managing Your Learning
              </p>
              <div className={styles.celebrationButtonsRow}>
                <button
                  type="button"
                  onClick={() => {
                    setIsCelebrationModalOpen(false);
                    if (videoRef.current) {
                      videoRef.current.currentTime = 0;
                      videoRef.current.play().catch(() => {});
                      setIsVideoPlaying(true);
                    }
                  }}
                  className={styles.btnSecondaryOutline}
                >
                  Rewatch Lesson
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsCelebrationModalOpen(false);
                    setWorkspaceTab("quiz");
                  }}
                  className={styles.btnPrimaryOrange}
                >
                  Take Quiz
                </button>
              </div>

              <div className={styles.nextUpLessonBox}>
                <div className={styles.nextUpLeft}>
                  <span style={{ fontSize: "1.3rem", color: "#d97706" }}>▶</span>
                  <div>
                    <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "#d97706", textTransform: "uppercase" }}>
                      Next Up
                    </span>
                    <strong style={{ display: "block", fontSize: "0.88rem", color: "#1c1917" }}>
                      Lesson 4: Advanced Tips &amp; Best Practices
                    </strong>
                    <span style={{ fontSize: "0.76rem", color: "#78716c" }}>20 min • Video + Quiz</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsCelebrationModalOpen(false);
                    handleOpenLessonView(activeModuleId, "les-2-4", "video");
                  }}
                  className={styles.btnPrimaryOrange}
                  style={{ padding: "0.45rem 0.95rem" }}
                >
                  Start Lesson
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.portalWrapper}>
      {/* Mobile Drawer Backdrop */}
      {isMobileDrawerOpen && (
        <div
          className={styles.sidebarBackdrop}
          onClick={() => setIsMobileDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* 240px Left Sidebar */}
      <aside
        className={`${styles.portalSidebar} ${isMobileDrawerOpen ? styles.portalSidebarOpen : ""}`}
      >
        {/* Brand */}
        <div className={styles.sidebarBrand}>
          <div
            className={styles.brandLogoGroup}
            onClick={() => {
              setView("DASHBOARD");
              setIsMobileDrawerOpen(false);
            }}
          >
            <span className={styles.brandText}>whatboutme</span>
            <span className={styles.brandHeartMini}>🧡</span>
          </div>
        </div>

        {/* Learner Profile Badge */}
        <div className={styles.sidebarLearnerCard}>
          <div className={styles.learnerAvatarBadge}>
            S
            <div className={styles.learnerVerifiedTick}>✓</div>
          </div>
          <h3 className={styles.learnerName}>{learnerName}</h3>
          <p className={styles.learnerCohortSub}>{cohortName}</p>
        </div>

        {/* Sidebar Nav Menus */}
        <nav className={styles.sidebarNav}>
          <div className={styles.navSection}>
            <span className={styles.navSectionTitle}>LEARNING</span>
            <button
              type="button"
              onClick={() => {
                setActiveSidebarNav("DASHBOARD");
                setView("DASHBOARD");
                setIsMobileDrawerOpen(false);
              }}
              className={`${styles.navLink} ${
                activeSidebarNav === "DASHBOARD" && currentView === "DASHBOARD"
                  ? styles.navLinkActive
                  : ""
              }`}
            >
              <span className={styles.navIcon}>📊</span>
              <span>Dashboard</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveSidebarNav("MY_COURSES");
                setView("ROADMAP");
                setIsMobileDrawerOpen(false);
              }}
              className={`${styles.navLink} ${
                activeSidebarNav === "MY_COURSES" || currentView === "ROADMAP" || currentView === "MODULE_DETAIL"
                  ? styles.navLinkActive
                  : ""
              }`}
            >
              <span className={styles.navIcon}>📖</span>
              <span>My Courses</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveSidebarNav("MY_NOTES");
                handleOpenLessonView("step-2", "les-2-3", "notes");
                setIsMobileDrawerOpen(false);
              }}
              className={`${styles.navLink} ${
                activeSidebarNav === "MY_NOTES" && workspaceTab === "notes"
                  ? styles.navLinkActive
                  : ""
              }`}
            >
              <span className={styles.navIcon}>✎</span>
              <span>My Notes</span>
            </button>
            <button
              type="button"
              onClick={() => {
                triggerToast("Live Sessions: Cohort 1 interactive workshop meets Saturday at 10:00 AM GST via Zoom.");
                setIsMobileDrawerOpen(false);
              }}
              className={styles.navLink}
            >
              <span className={styles.navIcon}>📅</span>
              <span>Live Sessions</span>
            </button>
            <button
              type="button"
              onClick={() => {
                triggerToast("Attendance status: 100% compliant.");
                setIsMobileDrawerOpen(false);
              }}
              className={styles.navLink}
            >
              <span className={styles.navIcon}>✓</span>
              <span>Attendance</span>
            </button>
            <button
              type="button"
              onClick={() => {
                triggerToast("Certificates: Complete all required steps to unlock your official CPD accreditation certificate.");
                setIsMobileDrawerOpen(false);
              }}
              className={styles.navLink}
            >
              <span className={styles.navIcon}>🎓</span>
              <span>Certificates</span>
            </button>
          </div>

          <div className={styles.navSection}>
            <span className={styles.navSectionTitle}>COMMUNITY</span>
            <button
              type="button"
              onClick={() => {
                triggerToast("Events: Annual Brain Health & Executive Leadership Summit registration is open.");
                setIsMobileDrawerOpen(false);
              }}
              className={styles.navLink}
            >
              <span className={styles.navIcon}>🎟</span>
              <span>Events</span>
            </button>
            <button
              type="button"
              onClick={() => {
                handleOpenLessonView("step-2", "les-2-3", "discussions");
                setIsMobileDrawerOpen(false);
              }}
              className={styles.navLink}
            >
              <span className={styles.navIcon}>💬</span>
              <span>Messages</span>
            </button>
            <button
              type="button"
              onClick={() => {
                triggerToast(`Learner Profile: ${learnerName} (${learnerEmail})`);
                setIsMobileDrawerOpen(false);
              }}
              className={styles.navLink}
            >
              <span className={styles.navIcon}>👤</span>
              <span>My Profile</span>
            </button>
          </div>
        </nav>

        {/* Bottom Pinned Sign Out */}
        <div className={styles.sidebarFooter}>
          <button
            type="button"
            onClick={() => triggerToast("Session reset.")}
            className={styles.signOutBtn}
          >
            <span>⎋</span>
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content with Top Bar */}
      <div className={styles.portalMain}>
        {/* Top Header Bar */}
        <header className={styles.portalTopBar}>
          <div className={styles.topBarLeft}>
            <button
              type="button"
              onClick={() => setIsMobileDrawerOpen(!isMobileDrawerOpen)}
              className={styles.mobileMenuBtn}
              aria-label="Toggle navigation drawer"
            >
              ☰
            </button>

            <div className={styles.searchBarContainer}>
              <span style={{ color: "#a8a29e" }}>🔍</span>
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Search your courses..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.topBarRight}>
            <button
              type="button"
              onClick={() => triggerToast("2 unread announcements from instructor Roweena Foxwel.")}
              className={styles.iconBtn}
              aria-label="Notifications"
            >
              🔔
              <span className={styles.badgeDot}>2</span>
            </button>

            <button
              type="button"
              onClick={() => triggerToast(`Signed in as ${learnerName}`)}
              className={styles.userMenuBtn}
            >
              <div className={styles.userAvatarMini}>S</div>
              <span style={{ fontSize: "0.8rem", color: "#78716c" }}>▼</span>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className={styles.portalContent}>{renderContentBody()}</main>
      </div>

      {/* Slide-Over Module Lesson Drawer (Panel 9) */}
      {isLessonDrawerOpen && (
        <>
          <div
            className={styles.drawerBackdrop}
            onClick={() => setIsLessonDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside className={styles.slideOverDrawer} aria-label="Module Lessons Drawer">
            <div className={styles.drawerHeader}>
              <div>
                <h3 className={styles.drawerTitle}>Module 2</h3>
                <span className={styles.drawerSubtitle}>3 of 4 lessons completed</span>
              </div>
              <button
                type="button"
                onClick={() => setIsLessonDrawerOpen(false)}
                className={styles.drawerCloseBtn}
                aria-label="Close drawer"
              >
                ✕
              </button>
            </div>

            <div className={styles.drawerProgressBar}>
              <div className={styles.moduleProgressFill} style={{ width: "75%" }} />
            </div>

            <div className={styles.drawerLessonList}>
              {activeLessons.map((l, lIdx) => {
                const isLessonCompleted = lIdx < 2;
                const isLessonCurrent = lIdx === 2;

                return (
                  <div
                    key={l.id}
                    onClick={() => {
                      if (lIdx <= 2) {
                        handleOpenLessonView(activeModuleId, l.id, "video");
                        setIsLessonDrawerOpen(false);
                      } else {
                        triggerToast("Lesson 4 is locked until Lesson 3 is completed.");
                      }
                    }}
                    className={`${styles.lessonCardRow} ${
                      isLessonCurrent ? styles.lessonCardActive : ""
                    }`}
                    style={{ padding: "0.75rem 1rem", cursor: lIdx <= 2 ? "pointer" : "not-allowed" }}
                  >
                    <div className={styles.lessonCardLeft}>
                      <div
                        className={`${styles.lessonPlayCircle} ${
                          isLessonCompleted
                            ? styles.lessonPlayCircleDone
                            : isLessonCurrent
                            ? styles.lessonPlayCircleActive
                            : styles.lessonPlayCircleLocked
                        }`}
                        style={{ width: 30, height: 30, fontSize: "0.75rem" }}
                      >
                        ▶
                      </div>
                      <div className={styles.lessonTitleMeta}>
                        <h5 className={styles.lessonRowTitle} style={{ fontSize: "0.85rem" }}>
                          {l.title}
                        </h5>
                        <span className={styles.lessonRowMeta} style={{ fontSize: "0.74rem" }}>
                          {l.durationFormatted}
                        </span>
                      </div>
                    </div>
                    <div>
                      {isLessonCompleted ? (
                        <span className={styles.lessonDoneCheck} style={{ fontSize: "0.95rem" }}>
                          ✓
                        </span>
                      ) : isLessonCurrent ? (
                        <span style={{ color: "#d97706", fontSize: "0.85rem" }}>▶</span>
                      ) : (
                        <span style={{ color: "#9ca3af", fontSize: "0.85rem" }}>🔒</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        </>
      )}

      {/* Lesson Completed Celebration Modal (Panel 8) */}
      {isCelebrationModalOpen && (
        <div className={styles.celebrationModalBackdrop}>
          <div className={styles.celebrationModalCard}>
            <div className={styles.confettiWrapper}>
              <div className={styles.celebrationCheckCircle}>✓</div>
            </div>
            <h2 className={styles.celebrationHeading}>Lesson Completed!</h2>
            <p className={styles.celebrationSubtitle}>
              You've completed Lesson 3: Managing Your Learning
            </p>
            <div className={styles.celebrationButtonsRow}>
              <button
                type="button"
                onClick={() => {
                  setIsCelebrationModalOpen(false);
                  if (videoRef.current) {
                    videoRef.current.currentTime = 0;
                    videoRef.current.play().catch(() => {});
                    setIsVideoPlaying(true);
                  }
                }}
                className={styles.btnSecondaryOutline}
              >
                Rewatch Lesson
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCelebrationModalOpen(false);
                  setWorkspaceTab("quiz");
                }}
                className={styles.btnPrimaryOrange}
              >
                Take Quiz
              </button>
            </div>

            <div className={styles.nextUpLessonBox}>
              <div className={styles.nextUpLeft}>
                <span style={{ fontSize: "1.3rem", color: "#d97706" }}>▶</span>
                <div>
                  <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "#d97706", textTransform: "uppercase" }}>
                    Next Up
                  </span>
                  <strong style={{ display: "block", fontSize: "0.88rem", color: "#1c1917" }}>
                    Lesson 4: Advanced Tips &amp; Best Practices
                  </strong>
                  <span style={{ fontSize: "0.76rem", color: "#78716c" }}>20 min • Video + Quiz</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCelebrationModalOpen(false);
                  handleOpenLessonView(activeModuleId, "les-2-4", "video");
                }}
                className={styles.btnPrimaryOrange}
                style={{ padding: "0.45rem 0.95rem" }}
              >
                Start Lesson
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Banner */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            background: "#1c1917",
            color: "#ffffff",
            padding: "10px 18px",
            borderRadius: 10,
            fontSize: "0.85rem",
            fontWeight: 600,
            boxShadow: "0 6px 20px rgba(0, 0, 0, 0.2)",
            zIndex: 100,
            animation: "fadeIn 0.2s ease-out",
          }}
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
