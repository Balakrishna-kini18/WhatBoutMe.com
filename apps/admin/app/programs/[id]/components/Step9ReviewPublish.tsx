"use client";

import React, { useState } from "react";
import Image from "next/image";
import styles from "../curriculum.module.css";
import { parseCourseInfo } from "../../courseInfo";

interface Step9ReviewPublishProps {
  programData: any;
  steps: any[];
  onBackToModules: () => void;
  onPublish: (settings: { status: "PUBLISHED" | "DRAFT"; startDate?: string; endDate?: string }) => Promise<void>;
  isPublishing: boolean;
}

function formatProgramPrice(amount: number, currency: string) {
  const num = Number(amount) || 0;
  if (num === 0) return "Free";
  if (currency === "USD") return `$${num.toLocaleString()} USD`;
  if (currency === "AED") return `${num.toLocaleString()} AED`;
  if (currency === "INR") return `₹${num.toLocaleString()} INR`;
  return `${currency} ${num.toLocaleString()}`;
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
  const [expandedModuleId, setExpandedModuleId] = useState<string | null>(null);

  // Curriculum Stats
  const totalLessons = steps.reduce((sum, s) => sum + (s.lessons?.length || 0), 0);
  const courseInfo = parseCourseInfo(programData?.description);

  const category = programData?.category || courseInfo.type || "Certification";
  const level = programData?.level || courseInfo.audience || "All Levels";
  const baseCurrency = programData?.currency || "USD";
  const basePrice = Number(programData?.price || 0);

  // Check for uploaded image
  const coverImage = programData?.thumbnailUrl || courseInfo.image;
  const hasCoverImage = Boolean(coverImage && typeof coverImage === "string" && coverImage.trim().length > 0);

  const finalExamRequired = programData?.requireExam !== false;
  const certificateEnabled = programData?.hasCertificate !== false;

  const handlePublishSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onPublish({ status });
  };

  return (
    <section className={styles.cardSurface}>
      {/* Clean Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h2 className={styles.stepTitle} style={{ margin: 0 }}>
          Review &amp; Publish
        </h2>
      </div>

      <form onSubmit={handlePublishSubmit}>
        {/* 2-Column Review Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(340px, 1fr) minmax(340px, 1fr)",
            gap: "1.75rem",
            alignItems: "start",
          }}
        >
          {/* =========================================================
              Left Column: Course Banner & Curriculum Overview
              ========================================================= */}
          <div>
            <div
              style={{
                background: "#ffffff",
                border: "1px solid #ece4d7",
                borderRadius: 14,
                overflow: "hidden",
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
              }}
            >
              {/* Cover Banner: Show image if exists, or clean warm header if not */}
              {hasCoverImage ? (
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    aspectRatio: "16 / 9",
                    background: "#f5ede4",
                    display: "flex",
                    alignItems: "flex-end",
                    padding: "1.25rem 1.5rem",
                    boxSizing: "border-box",
                  }}
                >
                  <Image
                    src={coverImage}
                    alt={programData?.title || "Course thumbnail"}
                    fill
                    style={{ objectFit: "cover" }}
                    unoptimized={!coverImage.startsWith("/")}
                  />
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "linear-gradient(to top, rgba(20, 17, 15, 0.75) 0%, transparent 60%)",
                    }}
                  />
                  <div style={{ position: "relative", zIndex: 2, width: "100%" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "1rem" }}>
                      <div>
                        <span
                          style={{
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            background: "#c97a1e",
                            color: "#ffffff",
                            padding: "2px 8px",
                            borderRadius: 4,
                            display: "inline-block",
                            marginBottom: "0.35rem",
                          }}
                        >
                          {category}
                        </span>
                        <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#ffffff", margin: 0, lineHeight: 1.3 }}>
                          {programData?.title}
                        </h3>
                      </div>

                      <button
                        type="button"
                        onClick={onBackToModules}
                        style={{
                          background: "rgba(255, 255, 255, 0.2)",
                          border: "1px solid rgba(255, 255, 255, 0.4)",
                          color: "#ffffff",
                          padding: "0.38rem 0.75rem",
                          borderRadius: 6,
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          whiteSpace: "nowrap",
                          backdropFilter: "blur(4px)",
                        }}
                        title="Edit curriculum steps"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        <span>Edit Curriculum</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Clean, light course header when no cover image is uploaded */
                <div
                  style={{
                    padding: "1.25rem 1.5rem",
                    background: "#fdfbf7",
                    borderBottom: "1px solid #ece4d7",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "1rem",
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        background: "#f5ece1",
                        color: "#b45309",
                        border: "1px solid #ebd9c4",
                        padding: "2px 8px",
                        borderRadius: 4,
                        display: "inline-block",
                        marginBottom: "0.35rem",
                        letterSpacing: "0.02em",
                      }}
                    >
                      {category}
                    </span>
                    <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#14110f", margin: 0, lineHeight: 1.3 }}>
                      {programData?.title}
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={onBackToModules}
                    className={styles.secondaryActionBtn}
                    style={{
                      fontSize: "0.78rem",
                      padding: "0.38rem 0.75rem",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      whiteSpace: "nowrap",
                    }}
                    title="Edit curriculum steps"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    <span>Edit Curriculum</span>
                  </button>
                </div>
              )}

              {/* Curriculum Overview Accordion */}
              <div style={{ padding: "1.25rem 1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem" }}>
                  <h4 style={{ fontSize: "0.92rem", fontWeight: 700, margin: 0, color: "#14110f" }}>
                    Curriculum Overview
                  </h4>
                  <span style={{ fontSize: "0.76rem", fontWeight: 600, color: "#78716a", background: "#f5ece1", padding: "2px 8px", borderRadius: 9999 }}>
                    {steps.length} {steps.length === 1 ? "Module" : "Modules"} · {totalLessons} {totalLessons === 1 ? "Lesson" : "Lessons"}
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {steps.map((step) => {
                    const isExpanded = expandedModuleId === step.id;
                    const lessonsCount = step.lessons?.length || 0;
                    const hasQuiz = Boolean(step.quiz);

                    return (
                      <div
                        key={step.id}
                        style={{
                          border: "1px solid #ece4d7",
                          borderRadius: 8,
                          overflow: "hidden",
                          background: "#ffffff",
                        }}
                      >
                        <div
                          style={{
                            padding: "0.65rem 0.85rem",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            cursor: "pointer",
                            background: isExpanded ? "#fffdfa" : "#ffffff",
                            transition: "background 0.15s ease",
                          }}
                          onClick={() => setExpandedModuleId(isExpanded ? null : step.id)}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#c97a1e" }}>
                              Step {step.sequence}:
                            </span>
                            <span style={{ fontSize: "0.86rem", fontWeight: 600, color: "#14110f" }}>
                              {step.title}
                            </span>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <span style={{ fontSize: "0.74rem", color: "#78716a" }}>
                              {lessonsCount} {lessonsCount === 1 ? "lesson" : "lessons"}
                              {hasQuiz ? " · 1 Quiz" : ""}
                            </span>
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="#78716a"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                              style={{
                                transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                                transition: "transform 0.15s ease",
                              }}
                            >
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                          </div>
                        </div>

                        {isExpanded && (
                          <div style={{ padding: "0.6rem 0.85rem", background: "#fdfbf7", borderTop: "1px solid #f2ede4" }}>
                            {step.lessons && step.lessons.length > 0 ? (
                              step.lessons.map((lesson: any, idx: number) => (
                                <div
                                  key={lesson.id}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    padding: "0.3rem 0",
                                    fontSize: "0.8rem",
                                    color: "#44403c",
                                    borderBottom: idx < (step.lessons?.length || 0) - 1 ? "1px solid #f5ece1" : "none",
                                  }}
                                >
                                  <span>
                                    {idx + 1}. {lesson.title}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: "0.68rem",
                                      fontWeight: 600,
                                      padding: "1px 6px",
                                      borderRadius: 4,
                                      background: lesson.type === "VIDEO" ? "#eff6ff" : "#fef2f2",
                                      color: lesson.type === "VIDEO" ? "#1d4ed8" : "#b91c1c",
                                    }}
                                  >
                                    {lesson.type}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <div style={{ fontSize: "0.78rem", color: "#a8a29e", fontStyle: "italic" }}>
                                No lessons attached to this module
                              </div>
                            )}

                            {hasQuiz && (
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "0.3rem 0",
                                  marginTop: "0.3rem",
                                  borderTop: "1px dashed #e7decb",
                                  fontSize: "0.8rem",
                                  color: "#7e22ce",
                                  fontWeight: 600,
                                }}
                              >
                                <span>Quiz: {step.quiz.title || "Knowledge Check"}</span>
                                <span style={{ fontSize: "0.68rem", padding: "1px 6px", borderRadius: 4, background: "#faf5ff", color: "#7e22ce" }}>
                                  QUIZ
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* =========================================================
              Right Column: Program Details & Publishing Status
              ========================================================= */}
          <div>
            <div
              style={{
                background: "#ffffff",
                border: "1px solid #ece4d7",
                borderRadius: 14,
                padding: "1.5rem",
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
              }}
            >
              <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: "0 0 1rem", color: "#14110f" }}>
                Program Details
              </h3>

              {/* Key-Value Summary Table */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem", marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "0.45rem 0", borderBottom: "1px solid #f2ede4", fontSize: "0.86rem" }}>
                  <span style={{ color: "#78716a" }}>Title</span>
                  <span style={{ fontWeight: 600, color: "#14110f", maxWidth: 240, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {programData?.title}
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", padding: "0.45rem 0", borderBottom: "1px solid #f2ede4", fontSize: "0.86rem" }}>
                  <span style={{ color: "#78716a" }}>Category</span>
                  <span style={{ fontWeight: 600, color: "#14110f" }}>
                    {category}
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", padding: "0.45rem 0", borderBottom: "1px solid #f2ede4", fontSize: "0.86rem" }}>
                  <span style={{ color: "#78716a" }}>Level</span>
                  <span style={{ fontWeight: 600, color: "#14110f" }}>
                    {level}
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", padding: "0.45rem 0", borderBottom: "1px solid #f2ede4", fontSize: "0.86rem" }}>
                  <span style={{ color: "#78716a" }}>Price</span>
                  <span style={{ fontWeight: 700, color: "#b45309" }}>
                    {formatProgramPrice(basePrice, baseCurrency)}
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", padding: "0.45rem 0", borderBottom: "1px solid #f2ede4", fontSize: "0.86rem" }}>
                  <span style={{ color: "#78716a" }}>Curriculum</span>
                  <span style={{ fontWeight: 600, color: "#14110f" }}>
                    {steps.length} {steps.length === 1 ? "Module" : "Modules"} · {totalLessons} {totalLessons === 1 ? "Lesson" : "Lessons"}
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", padding: "0.45rem 0", borderBottom: "1px solid #f2ede4", fontSize: "0.86rem" }}>
                  <span style={{ color: "#78716a" }}>Final Exam</span>
                  <span style={{ fontWeight: 600, color: finalExamRequired ? "#15803d" : "#78716a" }}>
                    {finalExamRequired ? "Required" : "Optional"}
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", padding: "0.45rem 0", borderBottom: "1px solid #f2ede4", fontSize: "0.86rem" }}>
                  <span style={{ color: "#78716a" }}>Certificate</span>
                  <span style={{ fontWeight: 600, color: certificateEnabled ? "#15803d" : "#78716a" }}>
                    {certificateEnabled ? "Enabled" : "Disabled"}
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", padding: "0.45rem 0", fontSize: "0.86rem" }}>
                  <span style={{ color: "#78716a" }}>Enrolment</span>
                  <span style={{ fontWeight: 600, color: "#14110f" }}>
                    {basePrice > 0 ? "Paid Enrolment" : "Free Access"}
                  </span>
                </div>
              </div>

              {/* Publishing Status Toggle */}
              <div style={{ paddingTop: "1.25rem", borderTop: "1px solid #ece4d7" }}>
                <span
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "#78716a",
                    marginBottom: "0.6rem",
                  }}
                >
                  Publishing Status
                </span>

                <div style={{ display: "flex", gap: "1.25rem" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.45rem", fontSize: "0.86rem", cursor: "pointer", fontWeight: status === "PUBLISHED" ? 600 : 400, color: "#14110f" }}>
                    <input
                      type="radio"
                      name="status"
                      checked={status === "PUBLISHED"}
                      onChange={() => setStatus("PUBLISHED")}
                      style={{ accentColor: "#c97a1e" }}
                    />
                    <span>Live (Published)</span>
                  </label>

                  <label style={{ display: "flex", alignItems: "center", gap: "0.45rem", fontSize: "0.86rem", cursor: "pointer", fontWeight: status === "DRAFT" ? 600 : 400, color: "#14110f" }}>
                    <input
                      type="radio"
                      name="status"
                      checked={status === "DRAFT"}
                      onChange={() => setStatus("DRAFT")}
                      style={{ accentColor: "#c97a1e" }}
                    />
                    <span>Draft</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Navigation */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: "2rem",
            paddingTop: "1.25rem",
            borderTop: "1px solid #ece4d7",
          }}
        >
          <button
            type="button"
            className={styles.secondaryActionBtn}
            onClick={onBackToModules}
            disabled={isPublishing}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
            <span>Previous</span>
          </button>

          <button
            type="submit"
            className={styles.btnPrimary}
            disabled={isPublishing}
            style={{
              padding: "0.65rem 1.6rem",
              fontSize: "0.92rem",
              fontWeight: 700,
              background: status === "PUBLISHED" ? "var(--accent-primary, #c97a1e)" : "#57534e",
            }}
          >
            {isPublishing
              ? status === "PUBLISHED" ? "Publishing Program..." : "Saving Draft..."
              : status === "PUBLISHED" ? "Publish Program" : "Save as Draft"}
          </button>
        </div>
      </form>
    </section>
  );
}
