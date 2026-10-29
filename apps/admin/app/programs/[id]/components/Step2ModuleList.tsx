"use client";

import React, { useState, useEffect } from "react";
import styles from "../curriculum.module.css";

interface Lesson {
  id: string;
  title: string;
  type: string;
  mediaUrl?: string;
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

interface Step2ModuleListProps {
  steps: Step[];
  activeModuleId: string | null;
  onSelectModule: (stepId: string) => void;
  onOpenCreateModal: () => void;
  onOpenAddLessonChooser: () => void;
  onOpenQuizBuilder: () => void;
  onPreviewModule: (step: Step) => void;
  onDeleteModule: (stepId: string) => void;
  onDeleteLesson: (lessonId: string) => void;
  onDeleteQuiz: () => void;
  onUpdateModule?: (stepId: string, updates: { title: string; description: string }) => Promise<void>;
  onBackToBasicDetails: () => void;
  onContinueToPricing: () => void;
  onOpenFinalExam?: () => void;
}

export default function Step2ModuleList({
  steps,
  activeModuleId,
  onSelectModule,
  onOpenCreateModal,
  onOpenAddLessonChooser,
  onOpenQuizBuilder,
  onPreviewModule,
  onDeleteModule,
  onDeleteLesson,
  onDeleteQuiz,
  onUpdateModule,
  onBackToBasicDetails,
  onContinueToPricing,
  onOpenFinalExam,
}: Step2ModuleListProps) {
  // Find current active module, default to first step if none chosen
  const currentStep =
    steps.find((s) => s.id === activeModuleId) || (steps.length > 0 ? steps[0] : null);

  const [localTitle, setLocalTitle] = useState(currentStep?.title || "");
  const [localDesc, setLocalDesc] = useState(currentStep?.description || "");
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (currentStep) {
      setLocalTitle(currentStep.title || "");
      setLocalDesc(currentStep.description || "");
    }
  }, [currentStep?.id, currentStep?.title, currentStep?.description]);

  const handleBlurSave = async () => {
    if (!currentStep || !onUpdateModule) return;
    if (
      localTitle.trim() === currentStep.title &&
      localDesc.trim() === (currentStep.description || "")
    ) {
      return;
    }
    if (!localTitle.trim()) return;

    setIsUpdating(true);
    try {
      await onUpdateModule(currentStep.id, {
        title: localTitle.trim(),
        description: localDesc.trim(),
      });
    } catch (err) {
      console.error("Failed to update module info:", err);
    } finally {
      setIsUpdating(false);
    }
  };

  const formatDuration = (seconds?: number | null) => {
    if (!seconds || seconds <= 0) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <section className={styles.cardSurface}>
      {/* Step Header */}
      <div className={styles.cardHeaderArea}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <h2 className={styles.stepTitle}>Modules &amp; Lessons</h2>
          <span className={styles.moduleCountBadge}>
            {steps.length} {steps.length === 1 ? "Module" : "Modules"}
          </span>
        </div>
      </div>

      {/* 2-Column Split Curriculum Builder (Left 34% Navigator | Right 66% Editor) */}
      <div className={styles.curriculumSplitLayout}>
        {/* =========================================================
            Left Column (34%): Module Navigator
            ========================================================= */}
        <div className={styles.moduleNavigatorCol}>
          <button
            type="button"
            className={styles.addModuleNavBtn}
            onClick={onOpenCreateModal}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Add Module</span>
          </button>

          {/* Module Accordion List */}
          {steps.length === 0 ? (
            <div
              style={{
                padding: "1.75rem 1rem",
                textAlign: "center",
                background: "#faf7f2",
                borderRadius: 12,
                border: "1px dashed #ece6dd",
                color: "#78716a",
                fontSize: "0.85rem",
              }}
            >
              No modules added yet.
            </div>
          ) : (
            <div className={styles.moduleAccordionList}>
              {steps.map((step) => {
                const isSelected = currentStep?.id === step.id;
                const lessonsCount = step.lessons?.length || 0;
                const hasQuiz = Boolean(step.quiz);
                const totalUnits = lessonsCount + (hasQuiz ? 1 : 0);

                return (
                  <div
                    key={step.id}
                    className={`${styles.moduleAccordionCard} ${
                      isSelected ? styles.moduleAccordionActive : ""
                    }`}
                  >
                    <div
                      className={styles.moduleAccordionHeader}
                      onClick={() => onSelectModule(step.id)}
                    >
                      <div>
                        <h4 className={styles.moduleAccordionTitle}>
                          Module {step.sequence}: {step.title}
                        </h4>
                        <div className={styles.moduleAccordionSub}>
                          {totalUnits} {totalUnits === 1 ? "lesson" : "lessons"}
                        </div>
                      </div>
                      <span style={{ color: isSelected ? "#d97706" : "#a8a29e", fontSize: "0.85rem", fontWeight: 700 }}>
                        {isSelected ? "●" : "○"}
                      </span>
                    </div>

                    {/* Expanded Mini Lesson List */}
                    {isSelected && (
                      <div className={styles.moduleAccordionBody}>
                        {step.lessons && step.lessons.length > 0 ? (
                          step.lessons.map((lesson, idx) => (
                            <div key={lesson.id} className={styles.miniLessonRow}>
                              <span style={{ color: "#d97706", fontWeight: 700, fontSize: "0.78rem" }}>
                                {idx + 1}.
                              </span>
                              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {lesson.title}
                              </span>
                            </div>
                          ))
                        ) : null}

                        {hasQuiz && (
                          <div className={styles.miniLessonRow}>
                            <span style={{ color: "#7e22ce", fontWeight: 700, fontSize: "0.78rem" }}>
                              Q.
                            </span>
                            <span style={{ color: "#7e22ce", fontWeight: 600 }}>
                              {step.quiz?.title || "Knowledge Check Quiz"}
                            </span>
                          </div>
                        )}

                        {totalUnits === 0 && (
                          <div style={{ fontSize: "0.78rem", color: "#a8a29e", fontStyle: "italic", padding: "0.25rem 0" }}>
                            No lessons added yet
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}


        </div>

        {/* =========================================================
            Right Column (66%): Active Module Editor Card
            ========================================================= */}
        <div>
          {currentStep ? (
            <div className={styles.moduleEditorCard}>
              {/* Header: Module Title & Delete Module */}
              <div className={styles.moduleEditorHeader}>
                <div>
                  <h3 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0, color: "#14110f" }}>
                    Module {currentStep.sequence}: {currentStep.title}
                  </h3>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <button
                    type="button"
                    className={styles.secondaryActionBtn}
                    onClick={() => onPreviewModule(currentStep)}
                    title="Student Preview"
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
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    <span>Student Preview</span>
                  </button>

                  <button
                    type="button"
                    className={styles.deleteModuleAction}
                    onClick={() => onDeleteModule(currentStep.id)}
                    title="Delete Module"
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
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    <span>Delete Module</span>
                  </button>
                </div>
              </div>

              {/* Module Metadata Inputs */}
              <div style={{ marginBottom: "1.75rem" }}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    <span>Module Title *</span>
                    {isUpdating && <span style={{ fontSize: "0.75rem", color: "#d97706" }}>Saving...</span>}
                  </label>
                  <input
                    type="text"
                    value={localTitle}
                    onChange={(e) => setLocalTitle(e.target.value)}
                    onBlur={handleBlurSave}
                    className={styles.formInput}
                    placeholder="e.g. Introduction &amp; Foundations"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    <span>Module Description</span>
                  </label>
                  <textarea
                    rows={2}
                    value={localDesc}
                    onChange={(e) => setLocalDesc(e.target.value)}
                    onBlur={handleBlurSave}
                    className={styles.formTextarea}
                    placeholder="Brief description of this module's objectives..."
                    style={{ minHeight: 65 }}
                  />
                </div>
              </div>

              {/* Section Header: Lessons in this Module + Add Lesson Button */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingBottom: "0.75rem",
                  borderBottom: "1px solid #f1ece4",
                }}
              >
                <div>
                  <h4 style={{ fontSize: "1rem", fontWeight: 700, margin: 0, color: "#14110f" }}>
                    Lessons ({(currentStep.lessons?.length || 0) + (currentStep.quiz ? 1 : 0)})
                  </h4>
                </div>

                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={onOpenAddLessonChooser}
                  style={{ padding: "0.55rem 1rem", fontSize: "0.85rem", height: "auto" }}
                >
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
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>+ Add Lesson</span>
                </button>
              </div>

              {/* Lesson Sequence Rows */}
              <div className={styles.lessonSequenceRows}>
                {(!currentStep.lessons || currentStep.lessons.length === 0) && !currentStep.quiz ? (
                  <div
                    style={{
                      padding: "2.5rem 1.5rem",
                      textAlign: "center",
                      background: "#fdfbf7",
                      borderRadius: 12,
                      border: "1px dashed #ded6cb",
                      color: "#78716a",
                    }}
                  >
                    <p style={{ fontWeight: 600, margin: "0 0 0.5rem", color: "#14110f" }}>
                      No lessons attached to Module {currentStep.sequence}
                    </p>
                    <p style={{ fontSize: "0.85rem", margin: "0 0 1rem" }}>
                      Add video lectures, PDF resources, or a knowledge check quiz.
                    </p>
                    <button
                      type="button"
                      className={styles.btnPrimary}
                      onClick={onOpenAddLessonChooser}
                    >
                      + Add First Lesson
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Render Lessons */}
                    {currentStep.lessons?.map((lesson, idx) => {
                      const isVideo = lesson.type === "VIDEO";
                      return (
                        <div key={lesson.id} className={styles.lessonSequenceRow}>
                          <div className={styles.lessonRowLeft}>
                            <span className={styles.dragHandle} title="Drag to reorder">
                              ⋮⋮
                            </span>
                            <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#d97706" }}>
                              {idx + 1}.
                            </span>
                            <span className={styles.lessonRowTitle} title={lesson.title}>
                              {lesson.title}
                            </span>
                          </div>

                          <div className={styles.lessonRowRight}>
                            <span className={isVideo ? styles.badgeVideo : styles.badgePdf}>
                              {isVideo ? "VIDEO" : "PDF"}
                            </span>
                            <span className={styles.lessonDuration}>
                              {isVideo ? formatDuration(lesson.durationSec) : "Resource"}
                            </span>

                            <button
                              type="button"
                              className={styles.actionIconBtnDanger}
                              onClick={() => onDeleteLesson(lesson.id)}
                              title="Delete Lesson"
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
                              >
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {/* Render Module Quiz Row */}
                    {currentStep.quiz && (
                      <div
                        className={styles.lessonSequenceRow}
                        style={{ borderLeft: "3px solid #7e22ce" }}
                      >
                        <div className={styles.lessonRowLeft}>
                          <span className={styles.dragHandle} title="Drag to reorder">
                            ⋮⋮
                          </span>
                          <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#7e22ce" }}>
                            Q.
                          </span>
                          <span className={styles.lessonRowTitle} title={currentStep.quiz.title}>
                            {currentStep.quiz.title || "Module Quiz"}
                          </span>
                        </div>

                        <div className={styles.lessonRowRight}>
                          <span className={styles.badgeQuiz}>QUIZ</span>
                          <span className={styles.lessonDuration}>
                            {currentStep.quiz.questions?.length ?? 10} Qs
                          </span>

                          <button
                            type="button"
                            className={styles.actionIconBtn}
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
                            >
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                            </svg>
                          </button>

                          <button
                            type="button"
                            className={styles.actionIconBtnDanger}
                            onClick={onDeleteQuiz}
                            title="Delete Quiz"
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
                            >
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Card Footer: Previous on Left, Warm-Orange Save & Continue on Right */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: "2rem",
                  paddingTop: "1.25rem",
                  borderTop: "1px solid #ece6dd",
                }}
              >
                <button
                  type="button"
                  className={styles.secondaryActionBtn}
                  onClick={onBackToBasicDetails}
                >
                  &lt;- Back to Basic Details
                </button>

                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={onContinueToPricing}
                >
                  Save &amp; Continue -&gt;
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{
                padding: "3rem 1.5rem",
                textAlign: "center",
                background: "#ffffff",
                border: "1px solid #ece6dd",
                borderRadius: 14,
              }}
            >
              <h3 style={{ margin: "0 0 0.5rem" }}>No module selected</h3>
              <p style={{ color: "#78716a", marginBottom: "1.5rem" }}>
                Select a module from the left navigator or create a new module to begin.
              </p>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={onOpenCreateModal}
              >
                + Add Module
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
