"use client";

import React, { useState } from "react";
import Image from "next/image";
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
                  <Image
                    src={programData.thumbnailUrl}
                    alt={programData.title}
                    width={400}
                    height={200}
                    quality={80}
                    loading="lazy"
                    unoptimized={!programData.thumbnailUrl.startsWith("/")}
                    className={styles.courseBannerImg}
                  />
                ) : (
                  <div style={{ textAlign: "center", padding: "1.5rem" }}>
                    <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 0.75rem", color: "#fbd38d" }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                        <path d="M6 12v5c3 3 9 3 12 0v-5" />
                      </svg>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: "1.15rem", color: "#ffffff" }}>
                      {programData?.title || "Course Curriculum"}
                    </div>
                  </div>
                )}
              </div>

              <div className={styles.courseReviewDetails}>
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, background: "var(--bg-soft)", color: "var(--text-secondary)", padding: "3px 8px", borderRadius: 4 }}>
                    #{programData?.level || "All Levels"}
                  </span>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, background: "var(--accent-highlight)", color: "var(--accent-primary)", padding: "3px 8px", borderRadius: 4 }}>
                    #{programData?.category || "Curriculum"}
                  </span>
                  {programData?.hasCertificate && (
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0", padding: "3px 8px", borderRadius: 4, display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Verified Certificate Included
                    </span>
                  )}
                </div>

                <h3 style={{ fontSize: "1.35rem", fontWeight: 700, margin: "0 0 0.5rem", fontFamily: "var(--font-serif)", color: "var(--text-primary)" }}>
                  {programData?.title}
                </h3>

                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.6, margin: "0 0 1.25rem", whiteSpace: "pre-line" }}>
                  {programData?.description || "Comprehensive structured curriculum designed for guided learner mastery."}
                </p>

                {/* Stats Summary Pills */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem", padding: "0.95rem", background: "var(--bg-card-muted, #fdfbf7)", borderRadius: 12, marginBottom: "1.5rem", border: "1px solid var(--border-light)" }}>
                  <div style={{ textAlign: "center" }}>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.04em", display: "block" }}>
                      Modules
                    </span>
                    <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-primary)", marginTop: 2 }}>
                      {steps.length}
                    </div>
                  </div>
                  <div style={{ textAlign: "center", borderLeft: "1px solid var(--border-light)", borderRight: "1px solid var(--border-light)" }}>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.04em", display: "block" }}>
                      Lessons
                    </span>
                    <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-primary)", marginTop: 2 }}>
                      {totalLessons}
                    </div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.04em", display: "block" }}>
                      Quizzes
                    </span>
                    <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-primary)", marginTop: 2 }}>
                      {totalQuizzes}
                    </div>
                  </div>
                </div>

                {/* Curriculum Checklist */}
                <h4 style={{ fontSize: "0.8rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", margin: "0 0 0.75rem" }}>
                  Pre-Publish Checklist
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", fontSize: "0.88rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#15803d" }}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <span>Basic program details &amp; pricing configured</span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 10, color: steps.length > 0 ? "#15803d" : "#b45309" }}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", background: steps.length > 0 ? "#dcfce7" : "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {steps.length > 0 ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                      )}
                    </div>
                    <span>{steps.length} Course modules established</span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 10, color: totalLessons > 0 ? "#15803d" : "#b45309" }}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", background: totalLessons > 0 ? "#dcfce7" : "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {totalLessons > 0 ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                      )}
                    </div>
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
                style={{ marginTop: 2, accentColor: "var(--accent-primary)" }}
              />
              <div>
                <strong style={{ fontSize: "0.95rem", color: "var(--text-primary)", display: "block" }}>
                  Publish Now
                </strong>
                <span style={{ fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: 1.4, display: "block" }}>
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
                style={{ marginTop: 2, accentColor: "var(--accent-primary)" }}
              />
              <div>
                <strong style={{ fontSize: "0.95rem", color: "var(--text-primary)", display: "block" }}>
                  Save as Draft
                </strong>
                <span style={{ fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: 1.4, display: "block" }}>
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
            <span>Back to Modules</span>
          </button>

          <button
            type="submit"
            disabled={isPublishing}
            className={styles.btnPrimary}
            style={{ padding: "0.85rem 2.25rem", fontSize: "0.95rem" }}
          >
            {isPublishing ? (
              <span>Updating Publication...</span>
            ) : status === "PUBLISHED" ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <span>Publish Course</span>
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
                <span>Save as Draft</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Success Celebration Dialog Modal */}
      {isSuccessModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsSuccessModalOpen(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()} style={{ textAlign: "center", padding: "2.5rem" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#dcfce7", color: "#15803d", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.25rem", border: "1px solid #86efac" }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 style={{ fontFamily: "var(--font-serif)", fontSize: "1.5rem", margin: "0 0 0.5rem", color: "var(--text-primary)" }}>
              {status === "PUBLISHED" ? "Course Published Successfully" : "Course Saved as Draft"}
            </h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", lineHeight: 1.5, margin: "0 auto 1.75rem", maxWidth: 420 }}>
              {status === "PUBLISHED"
                ? `"${programData?.title}" is now officially published and accessible on WhatBoutMe.`
                : `"${programData?.title}" has been saved in draft status for further curriculum additions.`}
            </p>
            <div style={{ display: "flex", justifyContent: "center", gap: "1rem" }}>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => {
                  setIsSuccessModalOpen(false);
                  window.location.href = "/programs";
                }}
              >
                <span>Return to Programs</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
