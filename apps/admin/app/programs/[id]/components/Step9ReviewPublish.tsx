"use client";

import React, { useState } from "react";
import styles from "../curriculum.module.css";

interface Step9ReviewPublishProps {
  programData: any;
  steps: any[];
  onBackToModules: () => void;
  onPublish: (settings: { status: "PUBLISHED" | "DRAFT"; startDate?: string; endDate?: string }) => Promise<void>;
  isPublishing: boolean;
}

export default function Step9ReviewPublish({
  programData,
  steps,
  onBackToModules,
  onPublish,
  isPublishing,
}: Step9ReviewPublishProps) {
  const [status, setStatus] = useState<"PUBLISHED" | "DRAFT">(
    programData?.status === "DRAFT" ? "DRAFT" : "PUBLISHED"
  );
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);

  // Stats calculation
  const totalLessons = steps.reduce((sum, s) => sum + (s.lessons?.length || 0), 0);
  const totalQuizzes = steps.filter((s) => s.quiz).length;

  const handlePublishSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onPublish({
      status,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
    setIsSuccessModalOpen(true);
  };

  return (
    <section className={styles.cardSurface}>
      {/* Header */}
      <div className={styles.cardHeaderArea}>
        <div className={styles.stepEyebrow}>STEP 9: FINAL REVIEW &amp; PUBLISH</div>
        <h2 className={styles.stepTitle}>Final Review &amp; Course Publication</h2>
        <p className={styles.stepSubtitle}>
          Review all curriculum elements, milestones, and choose whether to launch publicly or save as draft.
        </p>
      </div>

      <form onSubmit={handlePublishSubmit}>
        <div className={styles.reviewGrid}>
          {/* Left Column: Course Preview Card */}
          <div>
            <div className={styles.coursePreviewHeroCard}>
              <div className={styles.courseCoverBanner}>
                {programData?.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={programData.thumbnailUrl}
                    alt={programData.title}
                    className={styles.courseBannerImg}
                  />
                ) : (
                  <div style={{ textAlign: "center", padding: "1.5rem" }}>
                    <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>🎓</div>
                    <div style={{ fontWeight: 800, fontSize: "1.2rem" }}>{programData?.title}</div>
                  </div>
                )}
              </div>

              <div className={styles.courseReviewDetails}>
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, background: "var(--bg-soft)", color: "var(--text-secondary)", padding: "3px 8px", borderRadius: 4 }}>
                    #{programData?.level || "All Levels"}
                  </span>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, background: "var(--accent-highlight)", color: "var(--accent-primary)", padding: "3px 8px", borderRadius: 4 }}>
                    #{programData?.category || "Curriculum"}
                  </span>
                  {programData?.hasCertificate && (
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, background: "#f0fdf4", color: "#15803d", padding: "3px 8px", borderRadius: 4 }}>
                      ✓ Verified Certificate Included
                    </span>
                  )}
                </div>

                <h3 style={{ fontSize: "1.45rem", fontWeight: 700, margin: "0 0 0.5rem", fontFamily: "var(--font-serif)" }}>
                  {programData?.title}
                </h3>

                <p style={{ color: "var(--text-secondary)", fontSize: "0.92rem", lineHeight: 1.5, margin: "0 0 1.25rem" }}>
                  {programData?.description || "Comprehensive structured curriculum designed for guided learner mastery."}
                </p>

                {/* Stats Summary Pills */}
                <div style={{ display: "flex", gap: "1rem", padding: "1rem", background: "var(--bg-card-muted)", borderRadius: 12, marginBottom: "1.5rem", border: "1px solid var(--border-light)" }}>
                  <div>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                      Modules
                    </span>
                    <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--text-primary)" }}>
                      {steps.length}
                    </div>
                  </div>
                  <div style={{ width: 1, background: "var(--border-light)" }} />
                  <div>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                      Lessons
                    </span>
                    <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--text-primary)" }}>
                      {totalLessons}
                    </div>
                  </div>
                  <div style={{ width: 1, background: "var(--border-light)" }} />
                  <div>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                      Quizzes
                    </span>
                    <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--text-primary)" }}>
                      {totalQuizzes}
                    </div>
                  </div>
                </div>

                {/* Curriculum Checklist */}
                <h4 style={{ fontSize: "0.85rem", fontWeight: 800, textTransform: "uppercase", color: "var(--text-muted)", margin: "0 0 0.75rem" }}>
                  Pre-Publish Checklist
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.88rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#15803d" }}>
                    <span>✓</span>
                    <span>Basic program details &amp; pricing configured</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: steps.length > 0 ? "#15803d" : "#b45309" }}>
                    <span>{steps.length > 0 ? "✓" : "⚠️"}</span>
                    <span>{steps.length} Course modules established</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: totalLessons > 0 ? "#15803d" : "#b45309" }}>
                    <span>{totalLessons > 0 ? "✓" : "⚠️"}</span>
                    <span>{totalLessons} Lessons attached across curriculum</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Publish Settings */}
          <div className={styles.publishSettingsBox}>
            <h3 style={{ fontSize: "1.15rem", fontWeight: 700, margin: "0 0 1.25rem", color: "var(--text-primary)" }}>
              Publishing Controls
            </h3>

            {/* Status Radio Choices */}
            <div
              className={`${styles.radioSettingOption} ${
                status === "PUBLISHED" ? styles.radioOptionSelected : ""
              }`}
              onClick={() => setStatus("PUBLISHED")}
            >
              <input
                type="radio"
                name="publish_status"
                checked={status === "PUBLISHED"}
                onChange={() => setStatus("PUBLISHED")}
                style={{ marginTop: 2 }}
              />
              <div>
                <strong style={{ fontSize: "0.95rem", color: "var(--text-primary)", display: "block" }}>
                  Publish Now
                </strong>
                <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                  Make this course live immediately for learner discovery and enrollment
                </span>
              </div>
            </div>

            <div
              className={`${styles.radioSettingOption} ${
                status === "DRAFT" ? styles.radioOptionSelected : ""
              }`}
              onClick={() => setStatus("DRAFT")}
            >
              <input
                type="radio"
                name="publish_status"
                checked={status === "DRAFT"}
                onChange={() => setStatus("DRAFT")}
                style={{ marginTop: 2 }}
              />
              <div>
                <strong style={{ fontSize: "0.95rem", color: "var(--text-primary)", display: "block" }}>
                  Save as Draft
                </strong>
                <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                  Keep the curriculum private to instructors while authoring content
                </span>
              </div>
            </div>

            {/* Date Pickers (Optional) */}
            <div style={{ marginTop: "1.5rem" }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  Start Date <span className={styles.formLabelOptional}>(Optional)</span>
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={styles.formInput}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  End Date <span className={styles.formLabelOptional}>(Optional)</span>
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={styles.formInput}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "2.5rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border-light)" }}>
          <button
            type="button"
            className={styles.btnBack}
            onClick={onBackToModules}
            disabled={isPublishing}
          >
            &larr; Back to Modules
          </button>

          <button
            type="submit"
            disabled={isPublishing}
            className={styles.btnPrimary}
            style={{ padding: "0.85rem 2.25rem", fontSize: "1rem" }}
          >
            {isPublishing
              ? "Updating Publication..."
              : status === "PUBLISHED"
              ? "Publish Course 🚀"
              : "Save as Draft ✓"}
          </button>
        </div>
      </form>

      {/* Success Celebration Dialog Modal */}
      {isSuccessModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsSuccessModalOpen(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()} style={{ textAlign: "center", padding: "2.5rem" }}>
            <div style={{ fontSize: "3.5rem", marginBottom: "0.5rem" }}>🎉</div>
            <h3 style={{ fontFamily: "var(--font-serif)", fontSize: "1.75rem", margin: "0 0 0.5rem", color: "#15803d" }}>
              {status === "PUBLISHED" ? "Course Published Successfully!" : "Course Saved as Draft!"}
            </h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", lineHeight: 1.5, margin: "0 auto 1.75rem", maxWidth: 400 }}>
              {status === "PUBLISHED"
                ? `"${programData?.title}" is now officially published and accessible on WhatBoutMe.`
                : `"${programData?.title}" has been saved in draft status for further curriculum additions.`}
            </p>
            <div style={{ display: "flex", justifyContent: "center", gap: "1rem" }}>
              <a
                href={`http://localhost:3000/programs/${programData?.id}/steps`}
                target="_blank"
                rel="noreferrer"
                className={styles.secondaryActionBtn}
                style={{ padding: "0.75rem 1.25rem" }}
              >
                👁 View in LMS
              </a>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => {
                  setIsSuccessModalOpen(false);
                  window.location.href = "/programs";
                }}
              >
                Return to Programs &rarr;
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
