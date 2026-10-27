"use client";

import React from "react";
import styles from "../curriculum.module.css";

interface Lesson {
  id: string;
  title: string;
  type: string;
  mediaUrl: string;
  durationSec?: number | null;
}

interface Step {
  id: string;
  sequence: number;
  title: string;
  description: string;
  lessons?: Lesson[];
  quiz?: any | null;
}

interface Step4ModuleDetailsProps {
  module: Step;
  onBackToModulesList: () => void;
  onOpenAddLessonChooser: () => void;
  onOpenQuizBuilder: () => void;
  onPreviewModule: () => void;
  onDeleteLesson: (lessonId: string) => void;
  onDeleteQuiz: () => void;
}

export default function Step4ModuleDetails({
  module,
  onBackToModulesList,
  onOpenAddLessonChooser,
  onOpenQuizBuilder,
  onPreviewModule,
  onDeleteLesson,
  onDeleteQuiz,
}: Step4ModuleDetailsProps) {
  const lessons = module.lessons || [];
  const hasQuiz = Boolean(module.quiz && module.quiz.id);

  return (
    <section className={styles.cardSurface}>
      {/* Module Navigation & Header Bar */}
      <div>
        <button
          type="button"
          onClick={onBackToModulesList}
          className={styles.backLink}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span>Back to Modules List</span>
        </button>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div className={styles.stepEyebrow}>MODULE {module.sequence} DETAILS</div>
            <h2 className={styles.stepTitle}>
              Module {module.sequence}: {module.title}
            </h2>
            <p className={styles.stepSubtitle}>
              {module.description || "Manage lessons, video lectures, and quizzes attached to this module."}
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className={styles.secondaryActionBtn}
              onClick={onPreviewModule}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <span>Preview Module</span>
            </button>

            <button
              type="button"
              className={styles.btnPrimary}
              onClick={onOpenAddLessonChooser}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Add Lesson</span>
            </button>
          </div>
        </div>
      </div>

      {/* Content Units Overview */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "1.75rem 0 1rem" }}>
        <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
          Lessons &amp; Materials inside this Module ({lessons.length + (hasQuiz ? 1 : 0)})
        </h3>
      </div>

      {lessons.length === 0 && !hasQuiz ? (
        <div className={styles.emptyStateCard} style={{ padding: "3rem 1.5rem" }}>
          <div className={styles.emptyStateIcon}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
          </div>
          <h3 className={styles.emptyStateTitle}>No lessons yet in Module {module.sequence}</h3>
          <p className={styles.emptyStateDesc}>
            Add video lectures, PDF documents, or a knowledge check quiz to deliver an engaging learning experience.
          </p>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={onOpenAddLessonChooser}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Add Lesson to Module</span>
          </button>
        </div>
      ) : (
        <div className={styles.lessonSequenceRows} style={{ marginTop: "1rem" }}>
          {lessons.map((lesson, idx) => {
            const isVideo = lesson.type === "VIDEO";
            const isPdf = lesson.type === "PDF";
            const formatDuration = (seconds?: number | null) => {
              if (!seconds || seconds <= 0) return "--:--";
              const mins = Math.floor(seconds / 60);
              const secs = seconds % 60;
              return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
            };

            return (
              <div key={lesson.id} className={styles.lessonSequenceRow}>
                {/* Drag Handle */}
                <div className={styles.lessonDragHandle} title="Drag to reorder lesson">
                  ⋮⋮
                </div>

                {/* Lesson Info */}
                <div className={styles.lessonInfoWrap}>
                  <div className={styles.lessonTitleRow}>
                    <span className={styles.lessonIndexNumber}>{idx + 1}.</span>
                    <span className={styles.lessonTitleText}>{lesson.title}</span>
                  </div>
                  <span className={styles.lessonDetailsText}>
                    {isVideo && (lesson.durationSec ? `${formatDuration(lesson.durationSec)} duration` : "Video lecture")}
                    {isPdf && "PDF Document resource"}
                    {!isVideo && !isPdf && "Reading article"}
                  </span>
                </div>

                {/* Type Badge */}
                <div>
                  {isVideo && <span className={styles.badgeVideo}>VIDEO</span>}
                  {isPdf && <span className={styles.badgePdf}>PDF</span>}
                  {!isVideo && !isPdf && (
                    <span className={styles.badgePdf} style={{ background: "#fef3c7", color: "#92400e" }}>
                      TEXT
                    </span>
                  )}
                </div>

                {/* Duration or Count */}
                <div className={styles.lessonDurationPill}>
                  {isVideo ? formatDuration(lesson.durationSec) : "--"}
                </div>

                {/* Row Actions */}
                <div className={styles.lessonRowActions}>
                  <button
                    type="button"
                    className={styles.lessonIconBtn}
                    onClick={() => onDeleteLesson(lesson.id)}
                    title="Delete Lesson"
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}

          {/* Quiz Row */}
          {hasQuiz && (
            <div className={styles.lessonSequenceRow} style={{ borderLeft: "3px solid #7e22ce" }}>
              <div className={styles.lessonDragHandle} title="Drag to reorder">
                ⋮⋮
              </div>

              <div className={styles.lessonInfoWrap}>
                <div className={styles.lessonTitleRow}>
                  <span className={styles.lessonIndexNumber} style={{ color: "#7e22ce" }}>
                    Q.
                  </span>
                  <span className={styles.lessonTitleText}>
                    {module.quiz.title || "Module Knowledge Check Quiz"}
                  </span>
                </div>
                <span className={styles.lessonDetailsText}>
                  Pass Mark: {module.quiz.passMark}% &bull;{" "}
                  {module.quiz.quizPlacement === "BEFORE_VIDEO" ? "Diagnostic First" : "Comprehension Last"}
                </span>
              </div>

              <div>
                <span className={styles.badgeQuiz}>QUIZ</span>
              </div>

              <div className={styles.lessonDurationPill} style={{ color: "#7e22ce", fontWeight: 700 }}>
                {module.quiz.questions?.length ?? 0} Qs
              </div>

              <div className={styles.lessonRowActions}>
                <button
                  type="button"
                  className={styles.lessonIconBtn}
                  onClick={onOpenQuizBuilder}
                  title="Edit Quiz"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>

                <button
                  type="button"
                  className={styles.lessonIconBtn}
                  onClick={onDeleteQuiz}
                  title="Delete Quiz"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bottom Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "2.5rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border-light)", flexWrap: "wrap", gap: "1rem" }}>
        <button
          type="button"
          className={styles.btnBack}
          onClick={onBackToModulesList}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span>Back to Modules</span>
        </button>

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button
            type="button"
            className={styles.secondaryActionBtn}
            onClick={onOpenAddLessonChooser}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Add Another Lesson</span>
          </button>

          <button
            type="button"
            className={styles.btnPrimary}
            onClick={onPreviewModule}
          >
            <span>Preview Module</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
