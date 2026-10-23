"use client";

import React, { useState } from "react";
import styles from "../step.module.css";
import ProgressRing from "../../../components/ui/ProgressRing";
import { StepIcons } from "./StepIcons";

interface ClassroomTopBarProps {
  programId: string;
  programTitle: string;
  batchName?: string;
  stepSequence: number;
  stepTitle: string;
  currentLessonTitle?: string;
  activeActivity: "video" | "reading" | "notes" | "quiz" | "completion";
  hasPrevLesson: boolean;
  hasNextLesson: boolean;
  onNavigatePrev: () => void;
  onNavigateNext: () => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  onToggleAITutor: () => void;
  overallProgressPercent: number;
}

export default function ClassroomTopBar({
  programTitle,
  batchName,
  stepSequence,
  stepTitle,
  currentLessonTitle,
  hasPrevLesson,
  hasNextLesson,
  onNavigatePrev,
  onNavigateNext,
  isSidebarOpen,
  onToggleSidebar,
  overallProgressPercent,
}: ClassroomTopBarProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const cohortName = programTitle || batchName || "Course Curriculum";
  const displayLesson = currentLessonTitle || stepTitle;

  return (
    <header className={styles.topNav} role="banner">
      {/* Left: Curriculum Toggle & Batch Context */}
      <div className={styles.topNavLeft}>
        <button
          type="button"
          className={`${styles.outlineToggleBtn} ${isSidebarOpen ? styles.outlineToggleBtnActive : ""}`}
          onClick={onToggleSidebar}
          title={isSidebarOpen ? "Collapse Curriculum Sidebar" : "Open Curriculum Sidebar"}
          aria-label="Toggle Curriculum Navigation"
        >
          <StepIcons.BookOpen size={16} />
          <span>Curriculum</span>
        </button>

        <span className={styles.topNavCohort} title={cohortName}>
          <span className={styles.topNavDot}>•</span>
          <span>{cohortName}</span>
        </span>
      </div>

      {/* Center: Module & Lesson Context Breadcrumb */}
      <div className={styles.topNavCenter}>
        <span className={styles.topNavModuleBadge}>Module {stepSequence}</span>
        <span className={styles.topNavDivider}>/</span>
        <span className={styles.topNavLessonTitle} title={displayLesson}>
          {displayLesson}
        </span>
      </div>

      {/* Right: Previous / Next Navigation & Progress */}
      <div className={styles.topNavRightCluster}>
        <button
          type="button"
          className={styles.topNavBtn}
          onClick={onNavigatePrev}
          disabled={!hasPrevLesson}
          title="Previous Lesson"
          aria-label="Previous Lesson"
        >
          <StepIcons.ChevronLeft size={16} />
          <span>Previous</span>
        </button>

        <button
          type="button"
          className={styles.topNavBtn}
          onClick={onNavigateNext}
          disabled={!hasNextLesson}
          title="Next Lesson"
          aria-label="Next Lesson"
        >
          <span>Next</span>
          <StepIcons.ChevronRight size={16} />
        </button>

        {/* Course Progress Indicator */}
        <div
          className={styles.topNavProgressWrap}
          title={`Overall Course Progress: ${Math.round(overallProgressPercent)}%`}
        >
          <ProgressRing progressPercent={overallProgressPercent} size={28} strokeWidth={3} />
          <span className={styles.topNavProgressText}>
            {Math.round(overallProgressPercent)}%
          </span>
        </div>

        {/* Fullscreen Toggle */}
        <button
          type="button"
          className={styles.topNavIconBtn}
          onClick={toggleFullscreen}
          title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          aria-label="Toggle Fullscreen"
        >
          {isFullscreen ? <StepIcons.Minimize size={16} /> : <StepIcons.Maximize size={16} />}
        </button>
      </div>
    </header>
  );
}
