"use client";

import React, { useState } from "react";
import styles from "../curriculum.module.css";
import { API_URL } from "../../../lib/api";

interface Lesson {
  id: string;
  title: string;
  type: string;
  mediaUrl: string;
  durationSec?: number | null;
  isFreePreview?: boolean;
}

interface Step {
  id: string;
  sequence: number;
  title: string;
  description: string;
  lessons?: Lesson[];
  quiz?: any | null;
}

interface Step8ModulePreviewProps {
  module: Step;
  onBackToEdit: () => void;
  onContinueToReview: () => void;
}

export default function Step8ModulePreview({
  module,
  onBackToEdit,
  onContinueToReview,
}: Step8ModulePreviewProps) {
  const lessons = module.lessons || [];
  const hasQuiz = Boolean(module.quiz);
  const [activePreviewLesson, setActivePreviewLesson] = useState<Lesson | null>(lessons[0] || null);

  const resolveVideoUrl = (url: string) => {
    if (url.startsWith("upload:")) {
      const publicId = url.replace("upload:", "");
      const key = publicId.includes(".") ? publicId : `${publicId}.mp4`;
      return `${API_URL}/media/stream/${key}`;
    }
    return url;
  };

  return (
    <section className={styles.cardSurface}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.75rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <div className={styles.stepEyebrow}>STEP 8: MODULE PREVIEW (STUDENT VIEW)</div>
          <h2 className={styles.stepTitle}>
            Module {module.sequence}: {module.title} (Preview)
          </h2>
          <p className={styles.stepSubtitle}>
            See exactly how this module, its lesson order, and locking rules will feel for your students.
          </p>
        </div>

        <button
          type="button"
          className={styles.secondaryActionBtn}
          onClick={onBackToEdit}
        >
          &larr; Back to Edit
        </button>
      </div>

      {/* Realistic Student Stage Card */}
      <div className={styles.previewStageCard}>
        {/* Active Video Player Preview (if video selected) */}
        {activePreviewLesson && activePreviewLesson.type === "VIDEO" && (
          <div style={{ marginBottom: "2rem" }}>
            <div style={{ background: "#000000", borderRadius: 16, overflow: "hidden", aspectRatio: "16 / 9", boxShadow: "0 10px 30px rgba(0,0,0,0.15)" }}>
              <video
                controls
                src={resolveVideoUrl(activePreviewLesson.mediaUrl)}
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.75rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>
                Now Playing: {activePreviewLesson.title}
              </h3>
              <span style={{ fontSize: "0.8rem", color: "#15803d", fontWeight: 700, background: "#dcfce7", padding: "2px 8px", borderRadius: 4 }}>
                Active Student Preview
              </span>
            </div>
          </div>
        )}

        {/* Student Curriculum Units List */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)" }}>
            Module Syllabus ({lessons.length + (hasQuiz ? 1 : 0)} Units)
          </h3>
          <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
            {lessons.filter((l) => l.isFreePreview).length > 0 ? "Free preview available" : "Enrolled access only"}
          </span>
        </div>

        <div className={styles.previewLessonsList}>
          {lessons.map((lesson, idx) => {
            const isVideo = lesson.type === "VIDEO";
            const isPdf = lesson.type === "PDF";
            const isFirst = idx === 0;
            const icon = isVideo ? "🎬" : isPdf ? "📄" : "📝";

            return (
              <div key={lesson.id} className={styles.previewLessonRow}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: "1.25rem" }}>{icon}</span>
                  <div>
                    <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.95rem" }}>
                      {idx + 1}. {lesson.title}
                    </div>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      {isVideo
                        ? `Video Lecture ${lesson.durationSec ? `• ${Math.floor(lesson.durationSec / 60)}:${(lesson.durationSec % 60).toString().padStart(2, "0")}` : ""}`
                        : isPdf
                        ? "Reading Material • PDF"
                        : "Study Notes"}
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {isFirst && isVideo ? (
                    <button
                      type="button"
                      onClick={() => setActivePreviewLesson(lesson)}
                      className={styles.btnPrimary}
                      style={{ padding: "0.45rem 1rem", fontSize: "0.82rem" }}
                    >
                      ▶ Watch Preview
                    </button>
                  ) : lesson.isFreePreview ? (
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#15803d", background: "#f0fdf4", padding: "3px 8px", borderRadius: 4 }}>
                      Free Preview
                    </span>
                  ) : (
                    <span className={styles.lockedBadge}>
                      🔒 Locked (Step {module.sequence})
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {hasQuiz && (
            <div className={styles.previewLessonRow} style={{ background: "var(--bg-card-muted)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: "1.25rem" }}>🧠</span>
                <div>
                  <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.95rem" }}>
                    {module.quiz.title || "Module Knowledge Check Quiz"}
                  </div>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                    Pass Requirement: {module.quiz.passMark}% &bull; {module.quiz.questions?.length ?? 0} Questions
                  </span>
                </div>
              </div>

              <span className={styles.lockedBadge}>
                🔒 Gated by Video Completion
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Action Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "2.5rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border-light)" }}>
        <button
          type="button"
          className={styles.btnBack}
          onClick={onBackToEdit}
        >
          &larr; Back to Module Editor
        </button>

        <button
          type="button"
          className={styles.btnPrimary}
          onClick={onContinueToReview}
        >
          Continue to Final Review &amp; Publish &rarr;
        </button>
      </div>
    </section>
  );
}
