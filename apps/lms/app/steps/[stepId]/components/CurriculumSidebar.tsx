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
    setExpandedSteps((prev) => ({
      ...prev,
      [stepId]: !prev[stepId],
    }));
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

  const courseDisplayName = batchName || programTitle || "Sigma batch";

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
            <span className={styles.sidebarSearchIcon} aria-hidden="true">🔍</span>
          </div>
        </div>

        {/* Modules Accordion List matching Reference */}
        <div className={styles.modulesScrollArea}>
          {filteredSteps.map((s) => {
            const isCurrent = s.stepId === currentStepId;
            const isDone = s.isCompleted;
            const isUnlocked = s.isUnlocked;
            const isExpanded = Boolean(expandedSteps[s.stepId] || isCurrent);

            if (!isUnlocked) {
              return (
                <div key={s.stepId} className={styles.moduleCardLocked}>
                  <div className={styles.moduleLockedHeader}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className={styles.lockIconBadge}>🔒</span>
                      <span className={styles.moduleSequenceText}>Module {s.sequence}</span>
                    </div>
                    <span className={styles.lockedTag}>Locked</span>
                  </div>
                  <div className={styles.moduleLockedTitle}>{s.title}</div>
                  <div className={styles.moduleLockReason}>
                    {getLockMessage(s.lockReason)}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={s.stepId}
                className={`${styles.moduleCard} ${isCurrent ? styles.moduleCardActive : ""}`}
              >
                {/* Module Accordion Header */}
                <div
                  className={styles.moduleHeaderBar}
                  onClick={() => toggleAccordion(s.stepId)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") toggleAccordion(s.stepId);
                  }}
                  aria-expanded={isExpanded}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                    <span
                      className={`${styles.moduleStatusCircle} ${
                        isDone ? styles.statusDone : isCurrent ? styles.statusCurrent : ""
                      }`}
                    >
                      {isDone ? "✓" : s.sequence}
                    </span>
                    <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                      <span className={styles.moduleSequenceLabel}>Module {s.sequence}</span>
                      <span className={styles.moduleAccordionTitle} title={s.title}>
                        {s.title}
                      </span>
                      <span className={styles.moduleCountLabel}>
                        {isCurrent ? `${Math.max(1, mediaLessons.length) + (hasReadingDocs ? 1 : 0) + (hasQuiz ? 1 : 0)} Lessons` : "4 Lessons"}
                      </span>
                    </div>
                  </div>

                  <span
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-muted)",
                      transition: "transform 0.2s ease",
                      transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                    }}
                  >
                    ▼
                  </span>
                </div>

                {/* Sub-lessons list (expanded) matching reference timeline */}
                {isExpanded && (
                  <div className={styles.moduleLessonsSubList}>
                    {/* Link to change step if not current */}
                    {!isCurrent && (
                      <Link
                        href={`/steps/${s.stepId}`}
                        className={styles.subLessonItem}
                        onClick={onClose}
                        style={{ background: "var(--bg-card-muted)", fontWeight: 600 }}
                      >
                        <span className={styles.subLessonIcon}>▶</span>
                        <span className={styles.subLessonLabel}>Resume Module {s.sequence}</span>
                      </Link>
                    )}

                    {/* If current step, show interactive nested sub-lessons */}
                    {isCurrent && (
                      <>
                        {/* Video Lesson(s) */}
                        {hasVideoLesson && mediaLessons.length > 0 ? (
                          mediaLessons.map((m, mIdx) => {
                            const isThisMediaActive = currentActivity === "video" && (!currentMediaId || currentMediaId === m.id);
                            return (
                              <button
                                key={m.id}
                                type="button"
                                className={`${styles.subLessonItem} ${isThisMediaActive ? styles.subLessonItemActive : ""}`}
                                onClick={() => {
                                  onSelectActivity("video");
                                  if (onSelectMediaId) onSelectMediaId(m.id);
                                }}
                              >
                                <span className={styles.subLessonIcon}>
                                  {isThisMediaActive ? "▶" : isVideoDone ? "✓" : "⊙"}
                                </span>
                                <span className={styles.subLessonLabel}>
                                  {mIdx + 1}. {m.title || "Video Lecture"}
                                </span>
                                <span className={styles.subLessonDurationChip}>
                                  {m.durationSec ? `${Math.floor(m.durationSec / 60)}:${(m.durationSec % 60).toString().padStart(2, "0")}` : "10:30"}
                                </span>
                              </button>
                            );
                          })
                        ) : hasVideoLesson ? (
                          <button
                            type="button"
                            className={`${styles.subLessonItem} ${currentActivity === "video" ? styles.subLessonItemActive : ""}`}
                            onClick={() => onSelectActivity("video")}
                          >
                            <span className={styles.subLessonIcon}>▶</span>
                            <span className={styles.subLessonLabel}>1. Video Lecture</span>
                            <span className={styles.subLessonDurationChip}>10:30</span>
                          </button>
                        ) : null}

                        {/* Reading Documents */}
                        {hasReadingDocs && (
                          <button
                            type="button"
                            className={`${styles.subLessonItem} ${currentActivity === "reading" ? styles.subLessonItemActive : ""}`}
                            onClick={() => onSelectActivity("reading")}
                          >
                            <span className={styles.subLessonIcon}>{isReadingDone ? "✓" : "📄"}</span>
                            <span className={styles.subLessonLabel}>
                              2. Reading &amp; References ({readingDocsCount})
                            </span>
                            <span className={styles.subLessonDurationChip}>5 min</span>
                          </button>
                        )}

                        {/* Personal Notes */}
                        <button
                          type="button"
                          className={`${styles.subLessonItem} ${currentActivity === "notes" ? styles.subLessonItemActive : ""}`}
                          onClick={() => onSelectActivity("notes")}
                        >
                          <span className={styles.subLessonIcon}>{isNotesCaptured ? "✓" : "📝"}</span>
                          <span className={styles.subLessonLabel}>3. Personal Notes</span>
                          <span className={styles.subLessonDurationChip}>Self</span>
                        </button>

                        {/* Knowledge Check Quiz */}
                        {hasQuiz && (
                          <button
                            type="button"
                            className={`${styles.subLessonItem} ${currentActivity === "quiz" ? styles.subLessonItemActive : ""}`}
                            onClick={() => onSelectActivity("quiz")}
                          >
                            <span className={styles.subLessonIcon}>{isQuizPassed ? "✓" : "🌸"}</span>
                            <span className={styles.subLessonLabel}>4. Knowledge Check Quiz</span>
                            <span className={styles.subLessonDurationChip}>10 Qs</span>
                          </button>
                        )}

                        {/* Step Completed Milestone */}
                        <button
                          type="button"
                          className={`${styles.subLessonItem} ${currentActivity === "completion" ? styles.subLessonItemActive : ""}`}
                          onClick={() => onSelectActivity("completion")}
                        >
                          <span className={styles.subLessonIcon}>{isStepCompleted ? "✓" : "🎉"}</span>
                          <span className={styles.subLessonLabel}>Module Mastered</span>
                          <span className={styles.subLessonDurationChip}>Done</span>
                        </button>
                      </>
                    )}
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
