"use client";

import React, { useState, useRef, useEffect } from "react";
import { API_URL, type StudentNote } from "../../../lib/api";
import { formatNoteDate, formatVideoTime } from "../../../lib/timezone";

export interface Lesson {
  id: string;
  title: string;
  type: string;
  mediaUrl?: string;
  durationSec?: number | null;
  isFreePreview?: boolean;
}

export interface Step {
  id: string;
  sequence: number;
  title: string;
  description?: string;
  lessons?: Lesson[];
  quiz?: any | null;
  quizPlacement?: "BEFORE_VIDEO" | "AFTER_VIDEO";
}

export interface Step8ModulePreviewProps {
  module: Step;
  allModules?: Step[];
  courseTitle?: string;
  onBackToEdit: () => void;
  onContinueToReview: () => void;
}

export default function Step8ModulePreview({
  module,
  allModules,
  courseTitle,
  onBackToEdit,
  onContinueToReview,
}: Step8ModulePreviewProps) {
  const lessons = module.lessons || [];
  const hasQuiz = Boolean(module.quiz);
  const isBeforeVideo = Boolean(
    module.quiz?.quizPlacement === "BEFORE_VIDEO" ||
    (module as any)?.quizPlacement === "BEFORE_VIDEO"
  );

  const [activePreviewLesson, setActivePreviewLesson] = useState<Lesson | null>(lessons[0] || null);
  const [activeTab, setActiveTab] = useState<"PLAYER" | "QUIZ" | "NOTES">("PLAYER");

  // Video Player State
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(activePreviewLesson?.durationSec || 180);
  const [maxWatchedTime, setMaxWatchedTime] = useState(0);
  const [isVideoCompleted, setIsVideoCompleted] = useState(false);
  const [scrubBlockedNotice, setScrubBlockedNotice] = useState<string | null>(null);

  // Dynamic moving watermark
  const [watermarkPos, setWatermarkPos] = useState({ x: 20, y: 30 });
  const learnerName = "Roweena Foxwel";
  const learnerEmail = "roweena@whatboutme.com";

  useEffect(() => {
    const interval = setInterval(() => {
      const nextX = Math.floor(Math.random() * 66) + 12;
      const nextY = Math.floor(Math.random() * 66) + 12;
      setWatermarkPos({ x: nextX, y: nextY });
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Quiz State
  const [isQuizPassed, setIsQuizPassed] = useState(false);
  const [quizScore, setQuizScore] = useState<number | null>(null);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [selectedSingleChoice, setSelectedSingleChoice] = useState<number | null>(null);
  const [selectedMultiChoice, setSelectedMultiChoice] = useState<number[]>([]);
  const [shortAnswerText, setShortAnswerText] = useState("");

  // Student Notes
  const [savedNotes, setSavedNotes] = useState<StudentNote[]>([
    {
      id: "note-demo-1",
      userId: "demo-user-1",
      programId: "prog-demo-1",
      stepId: module.id,
      lessonId: activePreviewLesson?.id || "lesson-1",
      noteText: "Key insight: Transformative leadership begins with emotional self-regulation and intentional daily presence.",
      highlightSnippet: "Transformative leadership begins with emotional self-regulation.",
      videoTimestampSeconds: 42,
      createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
      updatedAt: new Date(Date.now() - 3600000 * 24).toISOString(),
      step: { id: module.id, sequence: module.sequence, title: module.title },
      lesson: { id: activePreviewLesson?.id || "lesson-1", title: activePreviewLesson?.title || "Course Lecture", type: "VIDEO" },
    },
  ]);

  const [inLessonNoteText, setInLessonNoteText] = useState("");
  const [inLessonHighlight, setInLessonHighlight] = useState("");
  const [bookmarkTimestamp, setBookmarkTimestamp] = useState<number | null>(null);
  const [noteSavedFeedback, setNoteSavedFeedback] = useState(false);

  const resolveVideoUrl = (url?: string) => {
    if (!url) return "";
    if (url.startsWith("upload:")) {
      const publicId = url.replace("upload:", "");
      const key = publicId.includes(".") ? publicId : `${publicId}.mp4`;
      return `${API_URL}/media/stream/${key}`;
    }
    return url;
  };

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
    const current = videoRef.current.currentTime;
    setCurrentTime(current);
    if (current > maxWatchedTime) {
      setMaxWatchedTime(current);
    }
    const dur = videoRef.current.duration || duration;
    if (dur > 0 && current >= dur * 0.98) {
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
    const targetTime = Number(e.target.value);
    if (targetTime > maxWatchedTime + 1.5) {
      setScrubBlockedNotice("Seeking ahead is locked. Anti-skip policy requires watching content sequentially.");
      setTimeout(() => setScrubBlockedNotice(null), 3500);
      if (videoRef.current) {
        videoRef.current.currentTime = maxWatchedTime;
      }
    } else {
      if (videoRef.current) {
        videoRef.current.currentTime = targetTime;
        setCurrentTime(targetTime);
      }
    }
  };

  const handleCaptureTimestamp = () => {
    setBookmarkTimestamp(Math.floor(currentTime));
  };

  const handleSaveInLessonNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inLessonNoteText.trim()) return;

    const newNote: StudentNote = {
      id: "note-" + Date.now(),
      userId: "demo-user-1",
      programId: "prog-demo-1",
      stepId: module.id,
      lessonId: activePreviewLesson?.id || "lesson-1",
      noteText: inLessonNoteText.trim(),
      highlightSnippet: inLessonHighlight.trim() || null,
      videoTimestampSeconds: bookmarkTimestamp != null ? bookmarkTimestamp : Math.floor(currentTime),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      step: { id: module.id, sequence: module.sequence, title: module.title },
      lesson: { id: activePreviewLesson?.id || "lesson-1", title: activePreviewLesson?.title || "Course Lecture", type: "VIDEO" },
    };

    setSavedNotes([newNote, ...savedNotes]);
    setInLessonNoteText("");
    setInLessonHighlight("");
    setBookmarkTimestamp(null);
    setNoteSavedFeedback(true);
    setTimeout(() => setNoteSavedFeedback(false), 3000);
  };

  const handleDeleteNote = (noteId: string) => {
    setSavedNotes(savedNotes.filter((n) => n.id !== noteId));
  };

  const handleEvaluateQuiz = (e: React.FormEvent) => {
    e.preventDefault();
    let score = 0;
    let total = 3;

    if (selectedSingleChoice === 1) score += 1;
    if (selectedMultiChoice.includes(0) && selectedMultiChoice.includes(2)) score += 1;
    if (shortAnswerText.trim().length >= 8) score += 1;

    const pct = Math.round((score / total) * 100);
    const passMark = module.quiz?.passMark || 75;
    const passed = pct >= passMark;

    setQuizScore(pct);
    setIsQuizPassed(passed);
    setQuizSubmitted(true);
  };

  const handleResetQuiz = () => {
    setQuizSubmitted(false);
    setQuizScore(null);
    setSelectedSingleChoice(null);
    setSelectedMultiChoice([]);
    setShortAnswerText("");
  };

  const isVideoLockedByPreQuiz = isBeforeVideo && !isQuizPassed;
  const isQuizLockedByVideo = !isBeforeVideo && !isVideoCompleted;

  return (
    <section style={{ background: "#ffffff", border: "1px solid #e7decb", borderRadius: 16, padding: "1.75rem", boxShadow: "0 4px 16px rgba(0,0,0,0.03)" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.75rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <button
            type="button"
            onClick={onBackToEdit}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "none", border: "none", color: "#c97a1e", fontSize: "0.85rem", fontWeight: 700, cursor: "pointer", padding: 0, marginBottom: "8px" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
            <span>Back to Module Editor</span>
          </button>
          <div style={{ fontSize: "0.75rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "#c97a1e" }}>
            MODULE PREVIEW
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", marginTop: "4px" }}>
            <h2 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 800, color: "#14110f" }}>
              Module {module.sequence}: {module.title}
            </h2>
            {hasQuiz && (
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: "6px",
                  background: isBeforeVideo ? "#fef3c7" : "#eff6ff",
                  color: isBeforeVideo ? "#b45309" : "#1d4ed8",
                  border: `1px solid ${isBeforeVideo ? "#fde68a" : "#bfdbfe"}`,
                }}
              >
                {isBeforeVideo ? "Diagnostic Quiz First (Before Video)" : "Video First (After Video)"}
              </span>
            )}
          </div>
          <p style={{ margin: "4px 0 0", fontSize: "0.875rem", color: "#78716a" }}>
            {courseTitle ? `${courseTitle} • ` : ""}Interactive preview with anti-skip video player, dynamic watermark, and module quiz.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onBackToEdit}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "0.5rem 1rem",
              background: "#ffffff",
              border: "1.5px solid #cbd5e1",
              borderRadius: "8px",
              fontSize: "0.8125rem",
              fontWeight: 700,
              color: "#334155",
              cursor: "pointer",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            <span>Edit Module Content</span>
          </button>
        </div>
      </div>

      {/* Mode Navigation Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #e7decb", marginBottom: "1.5rem", gap: "1.5rem" }}>
        <button
          type="button"
          onClick={() => setActiveTab("PLAYER")}
          style={{
            padding: "0.6rem 0.2rem",
            background: "none",
            border: "none",
            borderBottom: activeTab === "PLAYER" ? "3px solid #c97a1e" : "3px solid transparent",
            fontWeight: 700,
            fontSize: "0.9rem",
            color: activeTab === "PLAYER" ? "#c97a1e" : "#78716a",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <span>Anti-Skip Video Player</span>
          {isVideoCompleted && (
            <span style={{ fontSize: "0.6875rem", background: "#dcfce7", color: "#166534", padding: "1px 6px", borderRadius: 4 }}>
              100% Watched ✓
            </span>
          )}
        </button>

        {hasQuiz && (
          <button
            type="button"
            onClick={() => setActiveTab("QUIZ")}
            style={{
              padding: "0.6rem 0.2rem",
              background: "none",
              border: "none",
              borderBottom: activeTab === "QUIZ" ? "3px solid #c97a1e" : "3px solid transparent",
              fontWeight: 700,
              fontSize: "0.9rem",
              color: activeTab === "QUIZ" ? "#c97a1e" : "#78716a",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>Visual Question Bank (Quiz)</span>
            {isQuizPassed && (
              <span style={{ fontSize: "0.6875rem", background: "#dcfce7", color: "#166534", padding: "1px 6px", borderRadius: 4 }}>
                Passed ({quizScore}%) ✓
              </span>
            )}
            {isQuizLockedByVideo && (
              <span style={{ fontSize: "0.6875rem", background: "#fef3c7", color: "#92400e", padding: "1px 6px", borderRadius: 4 }}>
                Locked
              </span>
            )}
          </button>
        )}

        <button
          type="button"
          onClick={() => setActiveTab("NOTES")}
          style={{
            padding: "0.6rem 0.2rem",
            background: "none",
            border: "none",
            borderBottom: activeTab === "NOTES" ? "3px solid #c97a1e" : "3px solid transparent",
            fontWeight: 700,
            fontSize: "0.9rem",
            color: activeTab === "NOTES" ? "#c97a1e" : "#78716a",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <span>My Notes ({savedNotes.length})</span>
        </button>
      </div>

      {/* Main Interactive Stage Grid */}
      <div style={{ display: "grid", gridTemplateColumns: activeTab === "NOTES" ? "1fr" : "1fr 340px", gap: "1.5rem", alignItems: "start" }}>
        
        {/* LEFT COLUMN: ACTIVE PLAYER OR QUIZ */}
        <div>
          {/* TAB 1: ANTI-SKIP COMPULSORY VIDEO PLAYER */}
          {activeTab === "PLAYER" && (
            <div>
              {/* Pre-Quiz Lock Banner */}
              {isVideoLockedByPreQuiz && (
                <div
                  style={{
                    padding: "1.25rem 1.5rem",
                    borderRadius: "12px",
                    background: "#fffbeb",
                    border: "1.5px solid #fde68a",
                    marginBottom: "1.5rem",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                  }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <div>
                    <h4 style={{ margin: "0 0 4px", fontSize: "0.95rem", fontWeight: 800, color: "#92400e" }}>
                      Pre-Video Assessment Gate Active
                    </h4>
                    <p style={{ margin: 0, fontSize: "0.85rem", color: "#b45309", lineHeight: 1.45 }}>
                      This course module is configured with <strong>BEFORE_VIDEO</strong> placement. Learners must complete and pass the Diagnostic Assessment first before the video player unlocks.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab("QUIZ")}
                      style={{
                        marginTop: "10px",
                        padding: "6px 14px",
                        background: "#d97706",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "6px",
                        fontSize: "0.8125rem",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Take Knowledge Check Quiz &rarr;
                    </button>
                  </div>
                </div>
              )}

              {/* Video Player Card */}
              <div
                style={{
                  background: "#0f0d0c",
                  borderRadius: 16,
                  overflow: "hidden",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
                  position: "relative",
                  opacity: isVideoLockedByPreQuiz ? 0.45 : 1,
                  pointerEvents: isVideoLockedByPreQuiz ? "none" : "auto",
                }}
              >
                {/* Moving Dynamic Learner Watermark */}
                <div
                  style={{
                    position: "absolute",
                    top: `${watermarkPos.y}%`,
                    left: `${watermarkPos.x}%`,
                    pointerEvents: "none",
                    opacity: 0.35,
                    color: "#ffffff",
                    fontSize: "0.875rem",
                    fontWeight: 800,
                    textShadow: "0 1px 4px rgba(0,0,0,0.9)",
                    transition: "all 3.5s cubic-bezier(0.4, 0, 0.2, 1)",
                    zIndex: 20,
                    userSelect: "none",
                    letterSpacing: "0.03em",
                  }}
                >
                  <span>{learnerName} &bull; {learnerEmail}</span>
                </div>

                {/* Scrubber Lock Warning Toast */}
                {scrubBlockedNotice && (
                  <div
                    style={{
                      position: "absolute",
                      top: "20px",
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: "rgba(15, 23, 42, 0.95)",
                      color: "#f87171",
                      border: "1px solid #ef4444",
                      padding: "8px 16px",
                      borderRadius: "8px",
                      fontSize: "0.8125rem",
                      fontWeight: 700,
                      zIndex: 30,
                      boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
                      textAlign: "center",
                    }}
                  >
                    {scrubBlockedNotice}
                  </div>
                )}

                {/* Video HTML5 Element */}
                <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", background: "#000000" }}>
                  <video
                    ref={videoRef}
                    src={resolveVideoUrl(activePreviewLesson?.mediaUrl) || "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"}
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    onEnded={() => setIsVideoCompleted(true)}
                  />
                </div>

                {/* Stripped-Down Controls */}
                <div
                  style={{
                    background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 70%, transparent 100%)",
                    padding: "14px 18px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  {/* Locked Scrub Bar */}
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "0.75rem", color: "#cbd5e1", fontFamily: "monospace" }}>
                      {formatVideoTime(currentTime)}
                    </span>
                    <div style={{ position: "relative", flex: 1, display: "flex", alignItems: "center" }}>
                      <input
                        type="range"
                        min={0}
                        max={duration || 180}
                        value={currentTime}
                        onChange={handleScrubAttempt}
                        style={{
                          width: "100%",
                          cursor: "pointer",
                          accentColor: "#c97a1e",
                        }}
                      />
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "#94a3b8", fontFamily: "monospace" }}>
                      {formatVideoTime(duration)}
                    </span>
                  </div>

                  {/* Play & Info Bar */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <button
                        type="button"
                        onClick={togglePlay}
                        style={{
                          background: "#c97a1e",
                          border: "none",
                          color: "#ffffff",
                          width: "36px",
                          height: "36px",
                          borderRadius: "50%",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        aria-label={isPlaying ? "Pause" : "Play"}
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

                      <div style={{ color: "#ffffff", fontSize: "0.8125rem" }}>
                        <strong>{activePreviewLesson?.title || "Lesson Lecture"}</strong>
                        <span style={{ color: "#94a3b8", marginLeft: "8px", fontSize: "0.75rem" }}>
                          (Scrub bar locked to watched progress)
                        </span>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <button
                        type="button"
                        onClick={handleCaptureTimestamp}
                        style={{
                          background: "rgba(255,255,255,0.15)",
                          border: "1px solid rgba(255,255,255,0.25)",
                          color: "#ffffff",
                          borderRadius: "6px",
                          padding: "4px 10px",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                        title="Bookmark current timestamp into your note"
                      >
                        Note at {formatVideoTime(currentTime)}
                      </button>

                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          padding: "3px 8px",
                          borderRadius: 4,
                          background: isVideoCompleted ? "#166534" : "#334155",
                          color: "#ffffff",
                        }}
                      >
                        {isVideoCompleted ? "Watched 100% ✓" : `${Math.round((maxWatchedTime / (duration || 180)) * 100)}% Watched`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Lesson Metadata */}
              <div style={{ marginTop: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                <div>
                  <span style={{ fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, color: "#c97a1e" }}>
                    Current Unit
                  </span>
                  <h3 style={{ margin: "2px 0 0", fontSize: "1.15rem", fontWeight: 700, color: "#14110f" }}>
                    {activePreviewLesson?.title || "Course Video"}
                  </h3>
                </div>

                {!isBeforeVideo && hasQuiz && (
                  <div>
                    {isVideoCompleted ? (
                      <button
                        type="button"
                        onClick={() => setActiveTab("QUIZ")}
                        style={{
                          padding: "8px 16px",
                          background: "#16a34a",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: "8px",
                          fontSize: "0.8125rem",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Video Finished: Take Knowledge Check Quiz &rarr;
                      </button>
                    ) : (
                      <span style={{ fontSize: "0.8125rem", fontWeight: 700, padding: "6px 12px", borderRadius: 6, background: "#fef3c7", border: "1px solid #fde68a", color: "#92400e" }}>
                        Post-Quiz Locked until 100% Watched
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: VISUAL QUESTION BANK & QUIZ */}
          {activeTab === "QUIZ" && (
            <div>
              {/* Post-Quiz Gated Lock Banner */}
              {isQuizLockedByVideo && (
                <div
                  style={{
                    padding: "1.25rem 1.5rem",
                    borderRadius: "12px",
                    background: "#fffbeb",
                    border: "1.5px solid #fde68a",
                    marginBottom: "1.5rem",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                  }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <div>
                    <h4 style={{ margin: "0 0 4px", fontSize: "0.95rem", fontWeight: 800, color: "#92400e" }}>
                      Post-Video Assessment Gated
                    </h4>
                    <p style={{ margin: 0, fontSize: "0.85rem", color: "#b45309", lineHeight: 1.45 }}>
                      This quiz is configured with <strong>AFTER_VIDEO</strong> timing. In live learner mode, students cannot attempt this quiz until they have watched 100% of the video lesson.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab("PLAYER")}
                      style={{
                        marginTop: "10px",
                        padding: "6px 14px",
                        background: "#d97706",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "6px",
                        fontSize: "0.8125rem",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Return to Video Lecture &rarr;
                    </button>
                  </div>
                </div>
              )}

              {/* Visual Question Bank Form */}
              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid #e7decb",
                  borderRadius: 16,
                  padding: "1.75rem",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.04)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", borderBottom: "1px solid #e7decb", paddingBottom: "1rem" }}>
                  <div>
                    <span style={{ fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 800, color: "#c97a1e" }}>
                      Question Bank Preview
                    </span>
                    <h3 style={{ margin: "4px 0 0", fontSize: "1.25rem", fontWeight: 800, color: "#14110f" }}>
                      {module.quiz?.title || "Module Knowledge Check Quiz"}
                    </h3>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "0.8125rem", fontWeight: 700, padding: "4px 10px", borderRadius: 6, background: "#f1f5f9", color: "#334155" }}>
                      Pass Requirement: {module.quiz?.passMark || 75}%
                    </span>
                    {isBeforeVideo ? (
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, padding: "4px 10px", borderRadius: 6, background: "#fef3c7", color: "#92400e" }}>
                        Diagnostic (Before Video)
                      </span>
                    ) : (
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, padding: "4px 10px", borderRadius: 6, background: "#f3e8ff", color: "#7e22ce" }}>
                        Comprehension (After Video)
                      </span>
                    )}
                  </div>
                </div>

                {/* Feedback Result Banner */}
                {quizSubmitted && (
                  <div
                    style={{
                      padding: "1rem 1.25rem",
                      borderRadius: 10,
                      marginBottom: "1.5rem",
                      background: isQuizPassed ? "#ecfdf5" : "#fef2f2",
                      border: `1.5px solid ${isQuizPassed ? "#a7f3d0" : "#fecaca"}`,
                      color: isQuizPassed ? "#065f46" : "#b91c1c",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <strong>{isQuizPassed ? "Assessment Passed!" : "Score Below Pass Threshold"}</strong>
                      <div style={{ fontSize: "0.85rem", marginTop: 2 }}>
                        You scored {quizScore}% (Pass mark is {module.quiz?.passMark || 75}%).
                        {isQuizPassed && isBeforeVideo && " The video lecture has been unlocked!"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleResetQuiz}
                      style={{
                        padding: "4px 10px",
                        background: "#ffffff",
                        border: "1px solid #cbd5e1",
                        borderRadius: 6,
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Try Again
                    </button>
                  </div>
                )}

                <form onSubmit={handleEvaluateQuiz}>
                  {/* QUESTION 1 */}
                  <div style={{ marginBottom: "2rem", padding: "1.25rem", borderRadius: 12, background: "#fcfaf7", border: "1px solid #ebd9c8" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                      <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "#c97a1e", textTransform: "uppercase" }}>
                        Question 1 of 3 • Single Choice
                      </span>
                    </div>

                    <h4 style={{ margin: "0 0 1rem", fontSize: "0.95rem", fontWeight: 700, color: "#14110f" }}>
                      Which leadership practice is most effective in stabilizing psychological safety during organizational restructuring?
                    </h4>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "10px" }}>
                      {[
                        { id: 0, text: "Top-down directive delegation" },
                        { id: 1, text: "Transparent vulnerability and active listening" },
                        { id: 2, text: "Delaying communication until resolution" },
                        { id: 3, text: "Competitive peer performance rankings" },
                      ].map((opt) => (
                        <label
                          key={opt.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            padding: "12px 14px",
                            borderRadius: 10,
                            background: selectedSingleChoice === opt.id ? "#fef3c7" : "#ffffff",
                            border: `1.5px solid ${selectedSingleChoice === opt.id ? "#c97a1e" : "#e2e8f0"}`,
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                        >
                          <input
                            type="radio"
                            name="q1_radio"
                            checked={selectedSingleChoice === opt.id}
                            onChange={() => setSelectedSingleChoice(opt.id)}
                            style={{ accentColor: "#c97a1e" }}
                          />
                          <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#1e293b" }}>{opt.text}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* QUESTION 2 */}
                  <div style={{ marginBottom: "2rem", padding: "1.25rem", borderRadius: 12, background: "#fcfaf7", border: "1px solid #ebd9c8" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                      <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "#c97a1e", textTransform: "uppercase" }}>
                        Question 2 of 3 • Multi-Select Checkboxes
                      </span>
                    </div>

                    <h4 style={{ margin: "0 0 1rem", fontSize: "0.95rem", fontWeight: 700, color: "#14110f" }}>
                      Select all foundational components of Roweena&apos;s Emotional Intelligence Framework:
                    </h4>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "10px" }}>
                      {[
                        { id: 0, text: "Self-Awareness & Trigger Mapping" },
                        { id: 1, text: "Suppressing Negative Reactions" },
                        { id: 2, text: "Social Empathy & Perspective Taking" },
                        { id: 3, text: "Aggressive Boundary Enforcement" },
                      ].map((opt) => (
                        <label
                          key={opt.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            padding: "12px 14px",
                            borderRadius: 10,
                            background: selectedMultiChoice.includes(opt.id) ? "#fef3c7" : "#ffffff",
                            border: `1.5px solid ${selectedMultiChoice.includes(opt.id) ? "#c97a1e" : "#e2e8f0"}`,
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedMultiChoice.includes(opt.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedMultiChoice([...selectedMultiChoice, opt.id]);
                              } else {
                                setSelectedMultiChoice(selectedMultiChoice.filter((i) => i !== opt.id));
                              }
                            }}
                            style={{ accentColor: "#c97a1e" }}
                          />
                          <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#1e293b" }}>{opt.text}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* QUESTION 3 */}
                  <div style={{ marginBottom: "2rem", padding: "1.25rem", borderRadius: 12, background: "#fcfaf7", border: "1px solid #ebd9c8" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                      <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "#c97a1e", textTransform: "uppercase" }}>
                        Question 3 of 3 • Short Answer
                      </span>
                    </div>

                    <h4 style={{ margin: "0 0 0.5rem", fontSize: "0.95rem", fontWeight: 700, color: "#14110f" }}>
                      In your own words, describe how you intend to apply this module&apos;s mindset shift in your professional workflow:
                    </h4>

                    <textarea
                      rows={3}
                      required
                      placeholder="Type your structured reflection here..."
                      value={shortAnswerText}
                      onChange={(e) => setShortAnswerText(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: "1px solid #cbd5e1",
                        fontSize: "0.88rem",
                        fontFamily: "inherit",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                    <button
                      type="submit"
                      style={{
                        padding: "10px 24px",
                        background: "#c97a1e",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "8px",
                        fontWeight: 700,
                        fontSize: "0.875rem",
                        cursor: "pointer",
                      }}
                    >
                      Submit Assessment &amp; Evaluate Score
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* TAB 3: STANDALONE MY NOTES NOTEBOOK */}
          {activeTab === "NOTES" && (
            <div
              style={{
                background: "#ffffff",
                border: "1px solid #e7decb",
                borderRadius: 16,
                padding: "1.75rem",
                boxShadow: "0 4px 16px rgba(0,0,0,0.04)",
              }}
            >
              <h3 style={{ margin: "0 0 0.5rem", fontSize: "1.25rem", fontWeight: 800, color: "#14110f" }}>
                Student Study Notes &amp; Highlights Notebook
              </h3>
              <p style={{ margin: "0 0 1.5rem", fontSize: "0.85rem", color: "#78716a" }}>
                Chronological listing of student study notes with note/highlight text, date written, and associated step &amp; lesson.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {savedNotes.map((note) => {
                  const stepTitle = note.step ? `Step ${note.step.sequence}: ${note.step.title}` : `Step ${module.sequence}: ${module.title}`;
                  const lessonTitle = note.lesson?.title || activePreviewLesson?.title || "Lesson Lecture";
                  const dateWritten = formatNoteDate(note.createdAt);

                  return (
                    <div
                      key={note.id}
                      style={{
                        padding: "1.25rem",
                        borderRadius: 12,
                        background: "#ffffff",
                        border: "1px solid #e7decb",
                        boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "0.75rem", fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: "#fef3c7", color: "#92400e" }}>
                            {stepTitle}
                          </span>
                          <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "#14110f" }}>
                            • {lessonTitle}
                          </span>
                          {note.videoTimestampSeconds != null && (
                            <span style={{ fontSize: "0.72rem", fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "#ede9fe", color: "#6d28d9" }}>
                              ▶ {formatVideoTime(note.videoTimestampSeconds)}
                            </span>
                          )}
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "0.78rem", color: "#78716a" }}>
                            {dateWritten}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteNote(note.id)}
                            style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "1rem", lineHeight: 1 }}
                          >
                            ×
                          </button>
                        </div>
                      </div>

                      {note.highlightSnippet && (
                        <blockquote
                          style={{
                            margin: "0.35rem 0",
                            padding: "6px 12px",
                            borderLeft: "3px solid #c97a1e",
                            background: "#fbfaf8",
                            borderRadius: "0 6px 6px 0",
                            fontSize: "0.84rem",
                            fontStyle: "italic",
                            color: "#475569",
                          }}
                        >
                          &ldquo;{note.highlightSnippet}&rdquo;
                        </blockquote>
                      )}

                      <p style={{ margin: 0, fontSize: "0.88rem", color: "#14110f", lineHeight: 1.5 }}>
                        {note.noteText}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: IN-LESSON NOTE TAKING SIDEBAR */}
        {activeTab !== "NOTES" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div
              style={{
                background: "#ffffff",
                border: "1px solid #e7decb",
                borderRadius: 14,
                padding: "1.25rem",
                boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#14110f" }}>
                  In-Lesson Note Taking
                </h4>
                {bookmarkTimestamp != null && (
                  <span style={{ fontSize: "0.72rem", background: "#ede9fe", color: "#6d28d9", padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>
                    ▶ {formatVideoTime(bookmarkTimestamp)}
                  </span>
                )}
              </div>

              {noteSavedFeedback && (
                <div style={{ padding: "6px 10px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, color: "#166534", fontSize: "0.75rem", marginBottom: "8px" }}>
                  Note saved to your chronological notebook! ✓
                </div>
              )}

              <form onSubmit={handleSaveInLessonNote}>
                <div style={{ marginBottom: "8px" }}>
                  <input
                    type="text"
                    placeholder="Capture quote or highlight..."
                    value={inLessonHighlight}
                    onChange={(e) => setInLessonHighlight(e.target.value)}
                    style={{
                      width: "100%",
                      fontSize: "0.8125rem",
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: "1px solid #cbd5e1",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div style={{ marginBottom: "10px" }}>
                  <textarea
                    rows={3}
                    required
                    placeholder="Type personal reflection or insight..."
                    value={inLessonNoteText}
                    onChange={(e) => setInLessonNoteText(e.target.value)}
                    style={{
                      width: "100%",
                      fontSize: "0.8125rem",
                      padding: "8px",
                      borderRadius: 6,
                      border: "1px solid #cbd5e1",
                      fontFamily: "inherit",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={handleCaptureTimestamp}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#c97a1e",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    + Tag Video ({formatVideoTime(currentTime)})
                  </button>

                  <button
                    type="submit"
                    style={{
                      background: "#c97a1e",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: 6,
                      padding: "5px 12px",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Save Note
                  </button>
                </div>
              </form>
            </div>

            {/* Dedicated "My Notes" Column */}
            <div
              style={{
                background: "#ffffff",
                border: "1px solid #e7decb",
                borderRadius: 14,
                padding: "1.25rem",
                boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#14110f" }}>
                  Recent Notes ({savedNotes.length})
                </h4>
                <button
                  type="button"
                  onClick={() => setActiveTab("NOTES")}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#c97a1e",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  View All &rarr;
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "360px", overflowY: "auto" }}>
                {savedNotes.slice(0, 3).map((note) => (
                  <div
                    key={note.id}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: "#fcfaf7",
                      border: "1px solid #ebd9c8",
                      fontSize: "0.8125rem",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#78716a", fontSize: "0.72rem", marginBottom: "3px" }}>
                      <span>Step {module.sequence} • {note.lesson?.title || activePreviewLesson?.title}</span>
                      <span>{formatNoteDate(note.createdAt)}</span>
                    </div>

                    {note.highlightSnippet && (
                      <div style={{ fontStyle: "italic", color: "#64748b", borderLeft: "2px solid #c97a1e", paddingLeft: "6px", marginBottom: "3px" }}>
                        &ldquo;{note.highlightSnippet}&rdquo;
                      </div>
                    )}

                    <p style={{ margin: 0, color: "#1e293b", lineHeight: 1.4 }}>
                      {note.noteText}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "2.5rem", paddingTop: "1.5rem", borderTop: "1px solid #e7decb" }}>
        <button
          type="button"
          onClick={onBackToEdit}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "0.6rem 1.25rem",
            background: "#ffffff",
            border: "1.5px solid #cbd5e1",
            borderRadius: "8px",
            fontSize: "0.875rem",
            fontWeight: 700,
            color: "#334155",
            cursor: "pointer",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span>Back to Module Editor</span>
        </button>

        <button
          type="button"
          onClick={onContinueToReview}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "0.6rem 1.4rem",
            background: "#c97a1e",
            color: "#ffffff",
            border: "none",
            borderRadius: "8px",
            fontSize: "0.875rem",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          <span>Continue to Final Review &amp; Publish</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>
    </section>
  );
}
