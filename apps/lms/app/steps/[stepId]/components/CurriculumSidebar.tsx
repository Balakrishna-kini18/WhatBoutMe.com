"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import styles from "../step.module.css";
import { StepProgressionItem, getLockMessage } from "../../../lib/api";

interface CurriculumSidebarProps {
  programTitle: string;
  batchName?: string;
  overallProgressPercent: number;
  steps: StepProgressionItem[];
  currentStepId: string;
  currentActivity: "video" | "reading" | "notes" | "quiz" | "completion";
  onSelectActivity: (activity: "video" | "reading" | "notes" | "quiz" | "completion") => void;
  isOpen: boolean;
  onClose: () => void;
  hasVideoLesson: boolean;
  hasReadingDocs: boolean;
  readingDocsCount: number;
  hasQuiz: boolean;
  isVideoDone: boolean;
  isReadingDone: boolean;
  isNotesCaptured: boolean;
  isQuizPassed: boolean;
  isStepCompleted: boolean;
  currentMediaId?: string | null;
  mediaLessons?: any[];
  onSelectMediaId?: (id: string) => void;
}

export default function CurriculumSidebar({
  programTitle,
  batchName,
  overallProgressPercent,
  steps,
  currentStepId,
  currentActivity,
  onSelectActivity,
  isOpen,
  onClose,
  hasVideoLesson,
  hasReadingDocs,
  readingDocsCount,
  hasQuiz,
  isVideoDone,
  isReadingDone,
  isNotesCaptured,
  isQuizPassed,
  isStepCompleted,
  currentMediaId,
  mediaLessons = [],
  onSelectMediaId,
}: CurriculumSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  // Track expanded accordion modules (default current step is open)
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>(() => ({
    [currentStepId]: true,
  }));

  const toggleAccordion = (stepId: string) => {
    setExpandedSteps((prev) => {
      const currentVal = prev[stepId] !== undefined ? prev[stepId] : stepId === currentStepId;
      return {
        ...prev,
        [stepId]: !currentVal,
      };
    });
  };

  // Filter steps by search query
  const filteredSteps = useMemo(() => {
    if (!searchQuery.trim()) return steps;
    const q = searchQuery.toLowerCase();
    return steps.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        `module ${s.sequence}`.toLowerCase().includes(q) ||
        `step ${s.sequence}`.toLowerCase().includes(q)
    );
  }, [steps, searchQuery]);

  const completedCount = steps.filter((s) => s.isCompleted).length;
  const totalLessonsEstimated = steps.reduce((acc, s) => acc + (s.isCompleted ? 4 : 3), 0) || 16;
  const completedLessonsEstimated = Math.round((overallProgressPercent / 100) * totalLessonsEstimated);

  if (!isOpen) {
    return null;
  }

  const courseDisplayName = batchName || programTitle || "Sigma 1";

  // Compute lesson items for a step
  const getStepLessonItems = (s: StepProgressionItem, isCurrent: boolean) => {
    if (isCurrent) {
      const items: Array<{
        id: string;
        title: string;
        type: "video" | "reading" | "notes" | "quiz" | "completion";
        duration: string;
        isDone: boolean;
        isActive: boolean;
        onClick?: () => void;
        href?: string;
      }> = [];

      if (hasVideoLesson && mediaLessons.length > 0) {
        mediaLessons.forEach((m, mIdx) => {
          const isThisMediaActive = currentActivity === "video" && (!currentMediaId || currentMediaId === m.id);
          const durationStr = m.durationSec
            ? `${Math.floor(m.durationSec / 60)}:${(m.durationSec % 60).toString().padStart(2, "0")}`
            : "0:10";
          items.push({
            id: m.id,
            title: `${mIdx + 1}. ${m.title || "quick start"}`,
            type: "video",
            duration: durationStr,
            isDone: isVideoDone,
            isActive: isThisMediaActive,
            onClick: () => {
              onSelectActivity("video");
              if (onSelectMediaId) onSelectMediaId(m.id);
            },
          });
        });
      } else if (hasVideoLesson) {
        items.push({
          id: "video-default",
          title: "1. quick start",
          type: "video",
          duration: "0:10",
          isDone: isVideoDone,
          isActive: currentActivity === "video",
          onClick: () => onSelectActivity("video"),
        });
      }

      if (hasReadingDocs) {
        items.push({
          id: "reading",
          title: `2. Reading & References (${readingDocsCount})`,
          type: "reading",
          duration: "5 min",
          isDone: isReadingDone,
          isActive: currentActivity === "reading",
          onClick: () => onSelectActivity("reading"),
        });
      }

      items.push({
        id: "notes",
        title: "3. Personal Notes",
        type: "notes",
        duration: "Self",
        isDone: isNotesCaptured,
        isActive: currentActivity === "notes",
        onClick: () => onSelectActivity("notes"),
      });

      if (hasQuiz) {
        items.push({
          id: "quiz",
          title: "4. Knowledge Check Quiz",
          type: "quiz",
          duration: "10 Qs",
          isDone: isQuizPassed,
          isActive: currentActivity === "quiz",
          onClick: () => onSelectActivity("quiz"),
        });
      }

      items.push({
        id: "completion",
        title: "Module Mastered",
        type: "completion",
        duration: "Done",
        isDone: isStepCompleted,
        isActive: currentActivity === "completion",
        onClick: () => onSelectActivity("completion"),
      });

      return items;
    }

    // Not current step
    const items: Array<{
      id: string;
      title: string;
      type: "video" | "reading" | "notes" | "quiz" | "completion";
      duration: string;
      isDone: boolean;
      isActive: boolean;
      onClick?: () => void;
      href?: string;
    }> = [];

    if (s.lessons && s.lessons.length > 0) {
      s.lessons.forEach((l, lIdx) => {
        const isDoc = l.type === "DOCUMENT";
        const durationStr = l.durationSec
          ? `${Math.floor(l.durationSec / 60)}:${(l.durationSec % 60).toString().padStart(2, "0")}`
          : isDoc
          ? "5 min"
          : "10:00";
        items.push({
          id: l.lessonId || `l-${lIdx}`,
          title: `${l.order || lIdx + 1}. ${l.title}`,
          type: isDoc ? "reading" : "video",
          duration: durationStr,
          isDone: Boolean(l.isCompleted),
          isActive: false,
          href: `/steps/${s.stepId}`,
        });
      });
    } else {
      items.push({
        id: `resume-${s.stepId}`,
        title: `Resume Module ${s.sequence}`,
        type: "video",
        duration: "Start",
        isDone: Boolean(s.isCompleted),
        isActive: false,
        href: `/steps/${s.stepId}`,
      });
    }

    return items;
  };

  const renderLessonIcon = (item: {
    type: string;
    isActive: boolean;
    isDone: boolean;
  }) => {
    if (item.isActive && item.type === "video") {
      return (
        <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
      );
    }
    if (item.isDone) {
      return (
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
    }
    if (item.type === "video") {
      return (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
      );
    }
    if (item.type === "reading") {
      return (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
    }
    if (item.type === "notes") {
      return (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      );
    }
    if (item.type === "quiz") {
      return (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    }
    return (
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
        <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
        <path d="M4 22h16" />
        <path d="M10 14.66V17c0 .55-.45 1-1 1H8c-.55 0-1 .45-1 1v1h10v-1c0-.55-.45-1-1-1h-1c-.55 0-1-.45-1-1v-2.34" />
        <path d="M18 4H6v7a6 6 0 0 0 12 0V4z" />
      </svg>
    );
  };

  return (
    <>
      {/* Mobile Backdrop */}
      <div className={styles.mobileBackdrop} onClick={onClose} />

      <aside className={styles.sidebarStickyWrapper} aria-label="Course Curriculum">
        {/* Sidebar Header Card matching Reference */}
        <div className={styles.sidebarHeaderCard}>
          <div className={styles.courseSidebarTitleRow}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <h2 className={styles.courseSidebarTitle} title={courseDisplayName}>
                {courseDisplayName}
              </h2>
              <span className={styles.courseCohortPill}>Self Paced</span>
            </div>
            <button
              type="button"
              className={styles.sidebarCloseBtn}
              onClick={onClose}
              title="Close Curriculum Sidebar"
              aria-label="Close Curriculum Sidebar"
            >
              ✕
            </button>
          </div>

          {/* Progress Bar & Summary matching Reference */}
          <div className={styles.sidebarProgressRow}>
            <div className={styles.sidebarProgressLabels}>
              <span className={styles.sidebarProgressPct}>
                {Math.round(overallProgressPercent)}% Complete
              </span>
              <span className={styles.sidebarProgressDoneCount}>
                {completedCount} Complete
              </span>
            </div>

            <div className={styles.progressBarTrack}>
              <div
                className={styles.progressBarFill}
                style={{ width: `${Math.min(100, Math.max(0, overallProgressPercent))}%` }}
              />
            </div>

            <span className={styles.sidebarProgressSubtext}>
              {completedCount} of {steps.length} Modules • {completedLessonsEstimated} of {totalLessonsEstimated} Lessons
            </span>
          </div>

          {/* Search Box with Search Icon matching Reference */}
          <div className={styles.sidebarSearchWrap}>
            <input
              type="text"
              placeholder="Search lessons or modules..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.sidebarSearchInput}
              aria-label="Search curriculum"
            />
            <span className={styles.sidebarSearchIcon} aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
          </div>
        </div>

        {/* Modules Accordion List matching Reference */}
        <div className={styles.modulesScrollArea}>
          {filteredSteps.map((s) => {
            const isCurrent = s.stepId === currentStepId;
            const isDone = s.isCompleted;
            const isUnlocked = s.isUnlocked;
            const isExpanded = expandedSteps[s.stepId] !== undefined ? Boolean(expandedSteps[s.stepId]) : isCurrent;
            const lessonItems = isExpanded ? getStepLessonItems(s, isCurrent) : [];
            const lessonCountText = `${lessonItems.length || s.lessons?.length || 2} Lessons`;

            if (!isUnlocked) {
              return (
                <div key={s.stepId} className={styles.moduleCardLocked}>
                  <div className={styles.moduleHeaderLeft}>
                    <span className={styles.moduleStatusCircleLocked}>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </span>
                    <div className={styles.moduleHeaderTextWrap}>
                      <span className={styles.moduleSequenceLabel}>MODULE {s.sequence}</span>
                      <span className={styles.moduleAccordionTitleLocked} title={s.title}>
                        {s.title}
                      </span>
                    </div>
                  </div>
                  <span className={styles.lockedTag}>Locked</span>
                </div>
              );
            }

            return (
              <div
                key={s.stepId}
                className={`${styles.moduleCard} ${isExpanded ? styles.moduleCardActive : ""}`}
              >
                {/* Module Accordion Header */}
                <div
                  className={`${styles.moduleHeaderBar} ${isExpanded ? styles.moduleHeaderBarExpanded : ""}`}
                  onClick={() => toggleAccordion(s.stepId)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleAccordion(s.stepId);
                    }
                  }}
                  aria-expanded={isExpanded}
                >
                  <div className={styles.moduleHeaderLeft}>
                    <span
                      className={`${styles.moduleStatusCircle} ${
                        isDone ? styles.statusDone : isCurrent ? styles.statusCurrent : styles.statusDefault
                      }`}
                    >
                      {isDone ? (
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        s.sequence
                      )}
                    </span>
                    <div className={styles.moduleHeaderTextWrap}>
                      <span className={styles.moduleSequenceLabel}>MODULE {s.sequence}</span>
                      <span className={styles.moduleAccordionTitle} title={s.title}>
                        {s.title}
                      </span>
                      {isExpanded && (
                        <span className={styles.moduleCountLabel}>
                          {lessonCountText}
                        </span>
                      )}
                    </div>
                  </div>

                  <span className={styles.chevronIconWrap} aria-hidden="true">
                    <svg
                      width="10"
                      height="7"
                      viewBox="0 0 10 7"
                      fill="currentColor"
                      className={styles.chevronSvg}
                      style={{
                        transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                        transition: "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                      }}
                    >
                      <path d="M5 6.5L0.669873 0.5L9.33013 0.5L5 6.5Z" />
                    </svg>
                  </span>
                </div>

                {/* Sub-lessons list (expanded) with Timeline Rail matching Reference */}
                {isExpanded && (
                  <div className={styles.moduleLessonsSubList}>
                    {lessonItems.map((item, idx) => {
                      const showTopLine = idx > 0;
                      const showBottomLine = idx < lessonItems.length - 1;

                      const renderNode = () => {
                        if (item.isActive) {
                          return (
                            <div className={styles.timelineNodeActive}>
                              <div className={styles.timelineNodeActiveDot} />
                            </div>
                          );
                        }
                        if (item.isDone) {
                          return (
                            <div className={styles.timelineNodeDone}>
                              <svg
                                width="8"
                                height="8"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </div>
                          );
                        }
                        return <div className={styles.timelineNodeDefault} />;
                      };

                      const pillContent = (
                        <>
                          <div className={styles.subLessonLeading}>
                            <span
                              className={`${styles.subLessonIconWrap} ${
                                item.isActive ? styles.subLessonIconWrapActive : ""
                              }`}
                            >
                              {renderLessonIcon(item)}
                            </span>
                            <span className={styles.subLessonTitleText} title={item.title}>
                              {item.title}
                            </span>
                          </div>
                          <span
                            className={`${styles.subLessonChip} ${
                              item.isActive ? styles.subLessonChipActive : ""
                            }`}
                          >
                            {item.duration}
                          </span>
                        </>
                      );

                      return (
                        <div key={item.id} className={styles.timelineLessonRow}>
                          <div className={styles.timelineRail}>
                            {showTopLine && <div className={styles.timelineLineTop} />}
                            {showBottomLine && <div className={styles.timelineLineBottom} />}
                            <div className={styles.timelineNode}>{renderNode()}</div>
                          </div>

                          {item.href ? (
                            <Link
                              href={item.href}
                              onClick={onClose}
                              className={`${styles.subLessonPill} ${
                                item.isActive ? styles.subLessonPillActive : ""
                              }`}
                            >
                              {pillContent}
                            </Link>
                          ) : (
                            <button
                              type="button"
                              onClick={item.onClick}
                              className={`${styles.subLessonPill} ${
                                item.isActive ? styles.subLessonPillActive : ""
                              }`}
                            >
                              {pillContent}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {filteredSteps.length === 0 && (
            <div style={{ padding: "2rem 1rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
              No modules matched "{searchQuery}"
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
