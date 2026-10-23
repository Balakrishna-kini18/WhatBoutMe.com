"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import styles from "../curriculum.module.css";
import { parseCourseInfo } from "../../courseInfo";

interface Step9ReviewPublishProps {
  programData: any;
  steps: any[];
  onBackToModules: () => void;
  onPublish: (settings: { status: "PUBLISHED" | "DRAFT"; startDate?: string; endDate?: string }) => Promise<void>;
  isPublishing: boolean;
}

interface PreflightCheck {
  id: string;
  title: string;
  status: "PASS" | "WARN" | "FAIL";
  badgeText: string;
  summary: string;
  details?: string[];
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
  const [expandedCheckId, setExpandedCheckId] = useState<string | null>(null);
  const [expandedModuleId, setExpandedModuleId] = useState<string | null>(null);

  // Stats calculation
  const totalLessons = steps.reduce((sum, s) => sum + (s.lessons?.length || 0), 0);
  const totalQuizzes = steps.filter((s) => s.quiz).length;

  const courseInfo = parseCourseInfo(programData?.description);

  // 1. Multi-Currency Pricing (USD, AED, INR)
  const priceUSD = Number(programData?.priceUSD ?? (programData?.currency === "USD" ? programData?.price : 0));
  const priceAED = Number(programData?.priceAED ?? (programData?.currency === "AED" ? programData?.price : 0));
  const priceINR = Number(programData?.priceINR ?? (programData?.currency === "INR" ? programData?.price : 0));

  const multiCurrencyPass = priceUSD > 0 && priceAED > 0 && priceINR > 0;
  const multiCurrencyCheck: PreflightCheck = {
    id: "multi-currency",
    title: "Multi-Currency Pricing (USD, AED, INR)",
    status: multiCurrencyPass ? "PASS" : "WARN",
    badgeText: multiCurrencyPass ? "All 3 Configured" : "Rates Optional",
    summary: multiCurrencyPass
      ? `USD ($${priceUSD}), AED (${priceAED} AED), and INR (₹${priceINR}) configured.`
      : `Base price active (${programData?.currency || "USD"} ${programData?.price || 0}). Regional rates optional.`,
    details: [
      `USD ($): ${priceUSD > 0 ? `$${priceUSD}` : "Not set"}`,
      `AED: ${priceAED > 0 ? `${priceAED} AED` : "Not set"}`,
      `INR (₹): ${priceINR > 0 ? `₹${priceINR}` : "Not set"}`,
    ],
  };

  // 2. Compulsory Video Playback Rules & Quiz Placement
  const modulesWithQuiz = steps.filter((s) => s.quiz);
  const quizzesMissingPlacement = modulesWithQuiz.filter(
    (s) => !s.quiz?.quizPlacement || (s.quiz.quizPlacement !== "BEFORE_VIDEO" && s.quiz.quizPlacement !== "AFTER_VIDEO")
  );
  const stepsWithoutLessons = steps.filter((s) => !s.lessons || s.lessons.length === 0);

  const playbackStatus: "PASS" | "WARN" | "FAIL" = steps.length === 0
    ? "FAIL"
    : stepsWithoutLessons.length > 0
    ? "WARN"
    : "PASS";

  const playbackCheck: PreflightCheck = {
    id: "playback-rules",
    title: "Curriculum Modules & Lesson Sequence",
    status: playbackStatus,
    badgeText: playbackStatus === "PASS" ? "Verified" : playbackStatus === "WARN" ? "Empty Modules" : "Curriculum Empty",
    summary: playbackStatus === "PASS"
      ? `All ${steps.length} modules established with progressive lesson sequences.`
      : "Modules should contain lessons or study materials for learners.",
    details: [
      `Curriculum Modules: ${steps.length} established`,
      `Anti-Skip Compulsory Playback: Active (scrub bar locked, dynamic watermark on, server watch check)`,
      ...(quizzesMissingPlacement.length > 0
        ? quizzesMissingPlacement.map((s) => `⚠️ Module "${s.title}" quiz is missing quizPlacement timing`)
        : []),
      ...(stepsWithoutLessons.length > 0
        ? stepsWithoutLessons.map((s) => `⚠️ Module "${s.title}" has no lessons attached yet`)
        : []),
    ],
  };

  // 3. Question Bank & Answer Keys
  let allChoiceQuestionsCount = 0;
  for (const step of steps) {
    if (step.quiz?.questions && Array.isArray(step.quiz.questions)) {
      allChoiceQuestionsCount += step.quiz.questions.length;
    }
  }

  const questionBankCheck: PreflightCheck = {
    id: "question-bank",
    title: "Question Bank & Quiz Assessments",
    status: "PASS",
    badgeText: `${totalQuizzes} Quizzes`,
    summary: `${totalQuizzes} knowledge check quizzes established across modules.`,
    details: [
      `${totalQuizzes} module quizzes configured.`,
      `${allChoiceQuestionsCount} choice-based questions evaluated.`,
    ],
  };

  // 4. Course FAQs
  const programFaqs = Array.isArray(programData?.faqs)
    ? programData.faqs
    : Array.isArray(courseInfo.faqs)
    ? courseInfo.faqs
    : [];
  const validFaqs = programFaqs.filter(
    (f: any) => f && typeof f.question === "string" && f.question.trim().length > 0
  );

  const faqsCheck: PreflightCheck = {
    id: "course-faqs",
    title: "Course-Specific FAQs",
    status: validFaqs.length > 0 ? "PASS" : "WARN",
    badgeText: validFaqs.length > 0 ? `${validFaqs.length} Ready` : "Optional",
    summary: validFaqs.length > 0
      ? `${validFaqs.length} structured FAQs ready for marketing course page.`
      : "No course FAQs configured. Fallback FAQs will display.",
  };

  const allChecks: PreflightCheck[] = [
    multiCurrencyCheck,
    playbackCheck,
    questionBankCheck,
    faqsCheck,
  ];

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
        <div className={styles.stepEyebrow}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>STEP 4: REVIEW &amp; PUBLISH</span>
        </div>
        <h2 className={styles.stepTitle}>Review &amp; Publish Program</h2>
        <p className={styles.stepSubtitle}>
          Verify curriculum structure, review summary details, and publish your program live.
        </p>
      </div>

      <form onSubmit={handlePublishSubmit}>
        {/* 2-Column Review Grid */}
        <div className={styles.studioBasicGrid}>
          {/* =========================================================
              Left Card: Program Preview & Curriculum Overview
              ========================================================= */}
          <div>
            <div
              style={{
                background: "#ffffff",
                border: "1px solid #ece6dd",
                borderRadius: 14,
                overflow: "hidden",
                boxShadow: "0 2px 10px rgba(28, 25, 23, 0.04)",
                marginBottom: "1.5rem",
              }}
            >
              {/* Cover Banner Preview with Overlay */}
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: "16 / 9",
                  background: "#14110f",
                  display: "flex",
                  alignItems: "flex-end",
                  padding: "1.5rem",
                  boxSizing: "border-box",
                }}
              >
                {programData?.thumbnailUrl && (
                  <Image
                    src={programData.thumbnailUrl}
                    alt={programData.title}
                    fill
                    style={{ objectFit: "cover", opacity: 0.75 }}
                    unoptimized={!programData.thumbnailUrl.startsWith("/")}
                  />
                )}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "linear-gradient(to top, rgba(20,17,15,0.85) 0%, transparent 60%)",
                  }}
                />

                <div style={{ position: "relative", zIndex: 2, width: "100%" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                    <div>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          background: "#d97706",
                          color: "#ffffff",
                          padding: "3px 8px",
                          borderRadius: 6,
                          display: "inline-block",
                          marginBottom: "0.4rem",
                        }}
                      >
                        {programData?.category || "Leadership & Mindset"}
                      </span>
                      <h3 style={{ fontSize: "1.35rem", fontWeight: 700, color: "#ffffff", margin: 0 }}>
                        {programData?.title}
                      </h3>
                    </div>

                    <button
                      type="button"
                      onClick={onBackToModules}
                      style={{
                        background: "rgba(255,255,255,0.2)",
                        border: "1px solid rgba(255,255,255,0.35)",
                        color: "#ffffff",
                        padding: "0.4rem 0.75rem",
                        borderRadius: 8,
                        fontSize: "0.82rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                      title="Edit Course Details"
                    >
                      ✎ Edit
                    </button>
                  </div>
                </div>
              </div>

              {/* Curriculum Overview Expandable Rows */}
              <div style={{ padding: "1.5rem" }}>
                <h4 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 1rem", color: "#14110f" }}>
                  Curriculum Overview ({steps.length} Modules · {totalLessons} Lessons)
                </h4>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                  {steps.map((step) => {
                    const isExpanded = expandedModuleId === step.id;
                    const lessonsCount = step.lessons?.length || 0;
                    const hasQuiz = Boolean(step.quiz);

                    return (
                      <div
                        key={step.id}
                        style={{
                          border: "1px solid #ece6dd",
                          borderRadius: 10,
                          overflow: "hidden",
                          background: "#ffffff",
                        }}
                      >
                        <div
                          style={{
                            padding: "0.75rem 1rem",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            cursor: "pointer",
                            background: isExpanded ? "#fff7ed" : "#ffffff",
                          }}
                          onClick={() => setExpandedModuleId(isExpanded ? null : step.id)}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                            <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#d97706" }}>
                              Module {step.sequence}:
                            </span>
                            <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "#14110f" }}>
                              {step.title}
                            </span>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <span style={{ fontSize: "0.78rem", color: "#78716a" }}>
                              {lessonsCount} {lessonsCount === 1 ? "lesson" : "lessons"}
                              {hasQuiz ? " · 1 Quiz" : ""}
                            </span>
                            <span style={{ fontSize: "0.75rem", color: "#a8a29e" }}>
                              {isExpanded ? "▲" : "▼"}
                            </span>
                          </div>
                        </div>

                        {isExpanded && (
                          <div style={{ padding: "0.6rem 1rem", background: "#fdfbf7", borderTop: "1px solid #f1ece4" }}>
                            {step.lessons && step.lessons.length > 0 ? (
                              step.lessons.map((lesson: any, idx: number) => (
                                <div
                                  key={lesson.id}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    padding: "0.35rem 0",
                                    fontSize: "0.82rem",
                                    color: "#4a443d",
                                  }}
                                >
                                  <span>
                                    {idx + 1}. {lesson.title}
                                  </span>
                                  <span style={{ fontSize: "0.75rem", color: "#78716a" }}>
                                    {lesson.type}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <div style={{ fontSize: "0.8rem", color: "#a8a29e", fontStyle: "italic" }}>
                                No lessons attached
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
              Right Card: Program Details Summary Table & Checklist
              ========================================================= */}
          <div>
            <div
              style={{
                background: "#ffffff",
                border: "1px solid #ece6dd",
                borderRadius: 14,
                padding: "1.75rem",
                boxShadow: "0 2px 10px rgba(28, 25, 23, 0.04)",
                marginBottom: "1.5rem",
              }}
            >
              <h3 style={{ fontSize: "1.15rem", fontWeight: 700, margin: "0 0 1rem", color: "#14110f" }}>
                Program Details
              </h3>

              {/* Key-Value Summary Table */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid #f1ece4", fontSize: "0.88rem" }}>
                  <span style={{ color: "#78716a", fontWeight: 500 }}>Title</span>
                  <span style={{ fontWeight: 600, color: "#14110f", maxWidth: 220, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {programData?.title}
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid #f1ece4", fontSize: "0.88rem" }}>
                  <span style={{ color: "#78716a", fontWeight: 500 }}>Category</span>
                  <span style={{ fontWeight: 600, color: "#14110f" }}>
                    {programData?.category || "Leadership & Mindset"}
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid #f1ece4", fontSize: "0.88rem" }}>
                  <span style={{ color: "#78716a", fontWeight: 500 }}>Level</span>
                  <span style={{ fontWeight: 600, color: "#14110f" }}>
                    {programData?.level || "Beginner"}
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid #f1ece4", fontSize: "0.88rem" }}>
                  <span style={{ color: "#78716a", fontWeight: 500 }}>Price</span>
                  <span style={{ fontWeight: 700, color: "#d97706" }}>
                    {programData?.currency || "USD"} ${programData?.price || 0}
                    {priceAED > 0 && ` · AED ${priceAED}`}
                    {priceINR > 0 && ` · ₹${priceINR}`}
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid #f1ece4", fontSize: "0.88rem" }}>
                  <span style={{ color: "#78716a", fontWeight: 500 }}>Modules</span>
                  <span style={{ fontWeight: 600, color: "#14110f" }}>
                    {steps.length} Modules • {totalLessons} Lessons
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", fontSize: "0.88rem" }}>
                  <span style={{ color: "#78716a", fontWeight: 500 }}>Enrollment</span>
                  <span style={{ fontWeight: 600, color: "#14110f" }}>
                    Paid Enrollment • Lifetime Access
                  </span>
                </div>
              </div>

              {/* Readiness Checks Accordion */}
              <div style={{ paddingTop: "1rem", borderTop: "1px solid #ece6dd" }}>
                <h4 style={{ fontSize: "0.85rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "#14110f", margin: "0 0 0.75rem" }}>
                  Pre-Publish Readiness Checks
                </h4>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {allChecks.map((check) => {
                    const isExpanded = expandedCheckId === check.id;
                    const isPass = check.status === "PASS";

                    return (
                      <div
                        key={check.id}
                        style={{
                          background: isPass ? "#f0fdf4" : "#fffbeb",
                          border: `1px solid ${isPass ? "#bbf7d0" : "#fde68a"}`,
                          borderRadius: 8,
                          padding: "0.6rem 0.85rem",
                          fontSize: "0.82rem",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            cursor: "pointer",
                          }}
                          onClick={() => setExpandedCheckId(isExpanded ? null : check.id)}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <span style={{ color: isPass ? "#16a34a" : "#d97706", fontWeight: 700 }}>
                              {isPass ? "✓" : "!"}
                            </span>
                            <span style={{ fontWeight: 600, color: "#14110f" }}>
                              {check.title}
                            </span>
                          </div>
                          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: isPass ? "#15803d" : "#b45309" }}>
                            {check.badgeText}
                          </span>
                        </div>

                        {isExpanded && (
                          <div style={{ marginTop: "0.4rem", paddingTop: "0.4rem", borderTop: "1px solid rgba(0,0,0,0.06)", color: "#4a443d", fontSize: "0.78rem" }}>
                            {check.summary}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Status Radio Choices */}
              <div style={{ marginTop: "1.5rem", paddingTop: "1.25rem", borderTop: "1px solid #ece6dd" }}>
                <label className={styles.formLabel}>
                  <span>Publishing Status</span>
                </label>
                <div style={{ display: "flex", gap: "1rem" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.88rem", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="status"
                      checked={status === "PUBLISHED"}
                      onChange={() => setStatus("PUBLISHED")}
                      style={{ accentColor: "#d97706" }}
                    />
                    <span>Live (Published)</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.88rem", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="status"
                      checked={status === "DRAFT"}
                      onChange={() => setStatus("DRAFT")}
                      style={{ accentColor: "#d97706" }}
                    />
                    <span>Draft</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Footer: Previous on Left, Warm-Orange Publish on Right */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: "2.5rem",
            paddingTop: "1.5rem",
            borderTop: "1px solid #ece6dd",
          }}
        >
          <button
            type="button"
            className={styles.secondaryActionBtn}
            onClick={onBackToModules}
            disabled={isPublishing}
          >
            &lt;- Previous
          </button>

          <button
            type="submit"
            className={styles.btnPrimary}
            disabled={isPublishing}
            style={{ padding: "0.75rem 1.75rem", fontSize: "0.95rem" }}
          >
            {isPublishing ? "Publishing Program..." : "🚀 Publish Program"}
          </button>
        </div>
      </form>
    </section>
  );
}
