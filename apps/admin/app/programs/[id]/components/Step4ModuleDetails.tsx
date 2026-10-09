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
      {/* Module Header Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.75rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <button
            type="button"
            onClick={onBackToModulesList}
            className={styles.backLink}
            style={{ marginBottom: "0.75rem" }}
          >
            &larr; Back to Modules List
          </button>
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
            <span>👁 Preview Module</span>
          </button>

          <button
            type="button"
            className={styles.btnPrimary}
            onClick={onOpenAddLessonChooser}
            style={{ padding: "0.6rem 1.25rem", fontSize: "0.88rem" }}
          >
            <span>+ Add Lesson</span>
          </button>
        </div>
      </div>

      {/* Content Units Overview */}
      <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: "1.75rem 0 1rem", color: "var(--text-primary)" }}>
        Lessons &amp; Materials inside this Module ({lessons.length + (hasQuiz ? 1 : 0)})
      </h3>

      {lessons.length === 0 && !hasQuiz ? (
        <div className={styles.emptyStateCard} style={{ padding: "3rem 1.5rem" }}>
          <div className={styles.emptyStateIcon}>🎬</div>
          <h3 className={styles.emptyStateTitle}>No lessons yet in Module {module.sequence}</h3>
          <p className={styles.emptyStateDesc}>
            Add video lectures, PDF documents, or a knowledge check quiz to deliver an engaging learning experience.
          </p>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={onOpenAddLessonChooser}
          >
            + Add Lesson to Module
          </button>
        </div>
      ) : (
        <div style={{ border: "1px solid var(--border-light)", borderRadius: 14, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ background: "var(--bg-soft)", textAlign: "left", borderBottom: "1px solid var(--border-light)" }}>
                <th style={{ padding: "0.85rem 1.25rem", fontWeight: 700 }}>Lesson Name</th>
                <th style={{ padding: "0.85rem 1.25rem", fontWeight: 700 }}>Content Format</th>
                <th style={{ padding: "0.85rem 1.25rem", fontWeight: 700 }}>Details</th>
                <th style={{ padding: "0.85rem 1.25rem", textAlign: "right", fontWeight: 700 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {lessons.map((lesson, idx) => {
                const isVideo = lesson.type === "VIDEO";
                const isPdf = lesson.type === "PDF";
                const icon = isVideo ? "🎬" : isPdf ? "📄" : "📝";

                return (
                  <tr key={lesson.id} style={{ borderBottom: "1px solid var(--border-light)" }}>
                    <td style={{ padding: "0.85rem 1.25rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: "1.2rem" }}>{icon}</span>
                        <div>
                          <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                            {idx + 1}. {lesson.title}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: "0.85rem 1.25rem" }}>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          padding: "3px 8px",
                          borderRadius: 9999,
                          background: isVideo ? "#f0fdf4" : "#fef3c7",
                          color: isVideo ? "#15803d" : "#92400e",
                          border: `1px solid ${isVideo ? "#bbf7d0" : "#fde68a"}`,
                        }}
                      >
                        {lesson.type}
                      </span>
                    </td>

                    <td style={{ padding: "0.85rem 1.25rem", color: "var(--text-muted)", fontSize: "0.82rem" }}>
                      {isVideo && (lesson.durationSec ? `${Math.floor(lesson.durationSec / 60)}:${(lesson.durationSec % 60).toString().padStart(2, "0")} duration` : "Video Lecture")}
                      {isPdf && "PDF Document"}
                      {!isVideo && !isPdf && "Reading Content"}
                    </td>

                    <td style={{ padding: "0.85rem 1.25rem", textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={() => onDeleteLesson(lesson.id)}
                        className={styles.deleteItemBtn}
                        title="Delete lesson"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}

              {/* Quiz row */}
              {hasQuiz && (
                <tr style={{ background: "var(--bg-card-muted)" }}>
                  <td style={{ padding: "0.85rem 1.25rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: "1.2rem" }}>🧠</span>
                      <div>
                        <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                          {module.quiz.title || "Module Knowledge Check Quiz"}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td style={{ padding: "0.85rem 1.25rem" }}>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        padding: "3px 8px",
                        borderRadius: 9999,
                        background: "#faf5ff",
                        color: "#7e22ce",
                        border: "1px solid #e9d5ff",
                      }}
                    >
                      QUIZ
                    </span>
                  </td>

                  <td style={{ padding: "0.85rem 1.25rem", color: "var(--text-muted)", fontSize: "0.82rem" }}>
                    Pass Mark: {module.quiz.passMark}% &bull; {module.quiz.questions?.length ?? 0} Questions
                  </td>

                  <td style={{ padding: "0.85rem 1.25rem", textAlign: "right" }}>
                    <button
                      type="button"
                      onClick={onOpenQuizBuilder}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--accent-primary)",
                        fontWeight: 700,
                        cursor: "pointer",
                        marginRight: "1rem",
                        fontSize: "0.85rem",
                      }}
                    >
                      Edit Quiz &rarr;
                    </button>

                    <button
                      type="button"
                      onClick={onDeleteQuiz}
                      className={styles.deleteItemBtn}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Bottom Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "2.5rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border-light)" }}>
        <button
          type="button"
          className={styles.btnBack}
          onClick={onBackToModulesList}
        >
          &larr; Back to Modules
        </button>

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button
            type="button"
            className={styles.secondaryActionBtn}
            onClick={onOpenAddLessonChooser}
          >
            + Add Another Lesson
          </button>

          <button
            type="button"
            className={styles.btnPrimary}
            onClick={onPreviewModule}
          >
            Preview Module &rarr;
          </button>
        </div>
      </div>
    </section>
  );
}
