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
  const hasQuiz = Boolean(module.quiz);

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
        <div className={styles.tableContainer}>
          <table className={styles.curriculumTable}>
            <thead>
              <tr>
                <th style={{ width: "42%" }}>Lesson Name</th>
                <th style={{ width: "20%" }}>Content Format</th>
                <th style={{ width: "20%" }}>Details</th>
                <th style={{ width: "18%", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {lessons.map((lesson, idx) => {
                const isVideo = lesson.type === "VIDEO";
                const isPdf = lesson.type === "PDF";

                return (
                  <tr key={lesson.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            background: isVideo ? "#ede9fe" : isPdf ? "#ffe4e6" : "#fef3c7",
                            color: isVideo ? "#7c3aed" : isPdf ? "#e11d48" : "#d97706",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {isVideo ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <polygon points="23 7 16 12 23 17 23 7" />
                              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                            </svg>
                          ) : isPdf ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                              <line x1="16" y1="13" x2="8" y2="13" />
                              <line x1="16" y1="17" x2="8" y2="17" />
                            </svg>
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.9rem" }}>
                            {idx + 1}. {lesson.title}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          padding: "3px 10px",
                          borderRadius: 9999,
                          background: isVideo ? "#f0fdf4" : isPdf ? "#fff1f2" : "#fef3c7",
                          color: isVideo ? "#15803d" : isPdf ? "#be123c" : "#92400e",
                          border: `1px solid ${isVideo ? "#bbf7d0" : isPdf ? "#fecdd3" : "#fde68a"}`,
                          display: "inline-block",
                        }}
                      >
                        {lesson.type}
                      </span>
                    </td>

                    <td style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                      {isVideo && (lesson.durationSec ? `${Math.floor(lesson.durationSec / 60)}:${(lesson.durationSec % 60).toString().padStart(2, "0")} duration` : "Video Lecture")}
                      {isPdf && "PDF Document"}
                      {!isVideo && !isPdf && "Reading Content"}
                    </td>

                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={() => onDeleteLesson(lesson.id)}
                        className={styles.deleteItemBtn}
                        title="Delete lesson"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                        <span>Delete</span>
                      </button>
                    </td>
                  </tr>
                );
              })}

              {/* Quiz row */}
              {hasQuiz && (
                <tr style={{ background: "#fcfaf7" }}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: "#faf5ff",
                          color: "#7e22ce",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                          <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.9rem" }}>
                          {module.quiz.title || "Module Knowledge Check Quiz"}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        padding: "3px 10px",
                        borderRadius: 9999,
                        background: "#faf5ff",
                        color: "#7e22ce",
                        border: "1px solid #e9d5ff",
                        display: "inline-block",
                        marginRight: "6px",
                      }}
                    >
                      QUIZ
                    </span>
                    <span
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 6,
                        background: (module.quiz?.quizPlacement === "BEFORE_VIDEO" || (module as any)?.quizPlacement === "BEFORE_VIDEO") ? "#fef3c7" : "#eff6ff",
                        color: (module.quiz?.quizPlacement === "BEFORE_VIDEO" || (module as any)?.quizPlacement === "BEFORE_VIDEO") ? "#b45309" : "#1d4ed8",
                        border: `1px solid ${(module.quiz?.quizPlacement === "BEFORE_VIDEO" || (module as any)?.quizPlacement === "BEFORE_VIDEO") ? "#fde68a" : "#bfdbfe"}`,
                        display: "inline-block",
                      }}
                    >
                      {(module.quiz?.quizPlacement === "BEFORE_VIDEO" || (module as any)?.quizPlacement === "BEFORE_VIDEO") ? "Before Video (First)" : "After Video (Last)"}
                    </span>
                  </td>

                  <td style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    Pass Mark: {module.quiz.passMark}% &bull; {module.quiz.questions?.length ?? 0} Questions
                  </td>

                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                      <button
                        type="button"
                        onClick={onOpenQuizBuilder}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--accent-primary)",
                          fontWeight: 700,
                          cursor: "pointer",
                          fontSize: "0.84rem",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "0.35rem 0.5rem",
                        }}
                      >
                        <span>Edit Quiz</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="m9 18 6-6-6-6" />
                        </svg>
                      </button>

                      <button
                        type="button"
                        onClick={onDeleteQuiz}
                        className={styles.deleteItemBtn}
                        title="Delete quiz"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                        <span>Delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
