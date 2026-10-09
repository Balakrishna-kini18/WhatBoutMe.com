"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import styles from "../step.module.css";
import ProgressRing from "../../../components/ui/ProgressRing";
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
        `step ${s.sequence}`.toLowerCase().includes(q)
    );
  }, [steps, searchQuery]);

  const completedCount = steps.filter((s) => s.isCompleted).length;

  if (!isOpen) {
    return null;
  }

  return (
    <>
      {/* Mobile Backdrop */}
      <div className={styles.mobileBackdrop} onClick={onClose} />

      <aside className={styles.sidebarStickyWrapper} aria-label="Course Curriculum">
        {/* Sidebar Header with Course Info & Progress */}
        <div className={styles.sidebarHeaderCard}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
            <div style={{ flex: 1, paddingRight: "0.5rem" }}>
              <span className={styles.courseCohortPill}>
                {batchName ? `Cohort: ${batchName}` : "Active Course"}
              </span>
              <h2 className={styles.courseSidebarTitle} title={programTitle}>
                {programTitle || "Curriculum"}
              </h2>
            </div>
            <button
              type="button"
              className={styles.sidebarCloseBtn}
              onClick={onClose}
              title="Close Sidebar (o)"
              aria-label="Close Curriculum Sidebar"
            >
              ✕
            </button>
          </div>

          {/* Progress Ring Summary */}
          <div className={styles.sidebarProgressRow}>
            <ProgressRing progressPercent={overallProgressPercent} size={48} strokeWidth={4} />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)" }}>
                {Math.round(overallProgressPercent)}% Complete
              </span>
              <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                {completedCount} of {steps.length} Steps Finished
              </span>
            </div>
          </div>

          {/* Search Lessons Filter */}
          <div className={styles.sidebarSearchWrap}>
            <input
              type="text"
              placeholder="Search curriculum lessons..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.sidebarSearchInput}
              aria-label="Search curriculum"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.8rem" }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Modules Accordion List */}
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
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                    <span className={`${styles.moduleStatusCircle} ${isDone ? styles.statusDone : isCurrent ? styles.statusCurrent : ""}`}>
                      {isDone ? "✓" : s.sequence}
                    </span>
                    <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                      <span className={styles.moduleSequenceLabel}>Module {s.sequence}</span>
                      <span className={styles.moduleAccordionTitle} title={s.title}>
                        {s.title}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {isCurrent && <span className={styles.activePillBadge}>Active</span>}
                    <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", transition: "transform 0.2s ease", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>
                      ▼
                    </span>
                  </div>
                </div>

                {/* Sub-lessons list (expanded) */}
                {isExpanded && (
                  <div className={styles.moduleLessonsSubList}>
                    {/* Link to change step if not current */}
                    {!isCurrent && (
                      <Link
                        href={`/steps/${s.stepId}`}
                        className={styles.startStepLink}
                        onClick={onClose}
                      >
                        <span>▶ Resume Module {s.sequence}</span>
                      </Link>
                    )}

                    {/* If current step, show interactive nested activities */}
                    {isCurrent && (
                      <>
                        {hasVideoLesson && (
                          <button
                            type="button"
                            className={`${styles.subLessonItem} ${currentActivity === "video" ? styles.subLessonItemActive : ""}`}
                            onClick={() => onSelectActivity("video")}
                          >
                            <span className={styles.subLessonIcon}>🎬</span>
                            <span className={styles.subLessonLabel}>Video Lecture</span>
                            <span className={styles.subLessonStatus}>
                              {isVideoDone ? <span style={{ color: "#16a34a" }}>✓</span> : <span style={{ color: "var(--accent-primary)" }}>●</span>}
                            </span>
                          </button>
                        )}

                        {hasReadingDocs && (
                          <button
                            type="button"
                            className={`${styles.subLessonItem} ${currentActivity === "reading" ? styles.subLessonItemActive : ""}`}
                            onClick={() => onSelectActivity("reading")}
                          >
                            <span className={styles.subLessonIcon}>📄</span>
                            <span className={styles.subLessonLabel}>
                              Reading Material ({readingDocsCount})
                            </span>
                            <span className={styles.subLessonStatus}>
                              {isReadingDone ? <span style={{ color: "#16a34a" }}>✓</span> : "○"}
                            </span>
                          </button>
                        )}

                        <button
                          type="button"
                          className={`${styles.subLessonItem} ${currentActivity === "notes" ? styles.subLessonItemActive : ""}`}
                          onClick={() => onSelectActivity("notes")}
                        >
                          <span className={styles.subLessonIcon}>📝</span>
                          <span className={styles.subLessonLabel}>Personal Notes</span>
                          <span className={styles.subLessonStatus}>
                            {isNotesCaptured ? <span style={{ color: "#16a34a" }}>✓</span> : "○"}
                          </span>
                        </button>

                        {hasQuiz && (
                          <button
                            type="button"
                            className={`${styles.subLessonItem} ${currentActivity === "quiz" ? styles.subLessonItemActive : ""}`}
                            onClick={() => onSelectActivity("quiz")}
                          >
                            <span className={styles.subLessonIcon}>🧠</span>
                            <span className={styles.subLessonLabel}>Knowledge Check</span>
                            <span className={styles.subLessonStatus}>
                              {isQuizPassed ? <span style={{ color: "#16a34a" }}>✓</span> : "○"}
                            </span>
                          </button>
                        )}

                        <button
                          type="button"
                          className={`${styles.subLessonItem} ${currentActivity === "completion" ? styles.subLessonItemActive : ""}`}
                          onClick={() => onSelectActivity("completion")}
                        >
                          <span className={styles.subLessonIcon}>🎉</span>
                          <span className={styles.subLessonLabel}>Module Mastered</span>
                          <span className={styles.subLessonStatus}>
                            {isStepCompleted ? <span style={{ color: "#16a34a" }}>✓</span> : "○"}
                          </span>
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
