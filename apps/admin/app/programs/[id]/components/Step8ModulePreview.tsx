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
          <button
            type="button"
            onClick={onBackToEdit}
            className={styles.backLink}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
            <span>Back to Module Editor</span>
          </button>
          <div className={styles.stepEyebrow}>STEP 8: MODULE PREVIEW (STUDENT VIEW)</div>
          <h2 className={styles.stepTitle}>
            Module {module.sequence}: {module.title}
          </h2>
          <p className={styles.stepSubtitle}>
            See exactly how this module, lesson sequencing, and locked access feel for enrolled students.
          </p>
        </div>

        <button
          type="button"
          className={styles.secondaryActionBtn}
          onClick={onBackToEdit}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          <span>Edit Module Content</span>
        </button>
      </div>

      {/* Realistic Student Stage Card */}
      <div className={styles.previewStageCard}>
        {/* Active Video Player Preview (if video selected) */}
        {activePreviewLesson && activePreviewLesson.type === "VIDEO" && (
          <div style={{ marginBottom: "2rem" }}>
            <div style={{ background: "#0f0d0c", borderRadius: 16, overflow: "hidden", aspectRatio: "16 / 9", boxShadow: "0 10px 30px rgba(0,0,0,0.2)", position: "relative" }}>
              <video
                controls
                src={resolveVideoUrl(activePreviewLesson.mediaUrl)}
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <div>
                <span style={{ fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em", color: "var(--accent-primary)" }}>
                  Now Playing
                </span>
                <h3 style={{ margin: "2px 0 0", fontSize: "1.15rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  {activePreviewLesson.title}
                </h3>
              </div>
              <span className={styles.previewBadgeActive}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#16a34a" }} />
                <span>Active Student Preview</span>
              </span>
            </div>
          </div>
        )}

        {/* Student Curriculum Units List */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", borderBottom: "1px solid var(--border-light)", paddingBottom: "0.75rem" }}>
          <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)" }}>
            Module Syllabus ({lessons.length + (hasQuiz ? 1 : 0)} Units)
          </h3>
          <span style={{ fontSize: "0.82rem", color: "var(--text-muted)", fontWeight: 500 }}>
            {lessons.filter((l) => l.isFreePreview).length > 0 ? "Free preview available" : "Enrolled access only"}
          </span>
        </div>

        <div className={styles.previewLessonsList}>
          {lessons.map((lesson, idx) => {
            const isVideo = lesson.type === "VIDEO";
            const isPdf = lesson.type === "PDF";
            const isFirst = idx === 0;

            return (
              <div key={lesson.id} className={styles.previewLessonRow}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: isVideo ? "#ede9fe" : isPdf ? "#ffe4e6" : "#fef3c7",
                      color: isVideo ? "#7c3aed" : isPdf ? "#e11d48" : "#d97706",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {isVideo ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polygon points="23 7 16 12 23 17 23 7" />
                        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                      </svg>
                    ) : isPdf ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                    )}
                  </div>

                  <div>
                    <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.92rem" }}>
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

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {isFirst && isVideo ? (
                    <button
                      type="button"
                      onClick={() => setActivePreviewLesson(lesson)}
                      className={styles.btnPrimary}
                      style={{ padding: "0.45rem 1rem", fontSize: "0.82rem" }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                      <span>Watch Preview</span>
                    </button>
                  ) : lesson.isFreePreview ? (
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#15803d", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "3px 8px", borderRadius: 6 }}>
                      Free Preview
                    </span>
                  ) : (
                    <span className={styles.lockedBadge}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                      <span>Locked (Step {module.sequence})</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {hasQuiz && (
            <div className={styles.previewLessonRow} style={{ background: "var(--bg-card-muted)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "#fce7f3",
                    color: "#c026d3",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.92rem" }}>
                    {module.quiz.title || "Module Knowledge Check Quiz"}
                  </div>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                    Pass Requirement: {module.quiz.passMark}% &bull; {module.quiz.questions?.length ?? 0} Questions
                  </span>
                </div>
              </div>

              <span className={styles.lockedBadge}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>Gated by Video Completion</span>
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
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span>Back to Module Editor</span>
        </button>

        <button
          type="button"
          className={styles.btnPrimary}
          onClick={onContinueToReview}
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
