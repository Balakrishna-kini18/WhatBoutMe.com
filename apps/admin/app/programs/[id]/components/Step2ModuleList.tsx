"use client";

import React, { useState, useEffect, useRef } from "react";
import styles from "../curriculum.module.css";
import { API_URL, errorMessage, uploadFile } from "../../../lib/api";
import { Modal, useToast, MediaPreviewModal, ConfirmDialog } from "../../../components";
import type { MediaPreviewConfig } from "../../../components";

interface Lesson {
  id: string;
  title: string;
  type: string;
  mediaUrl?: string;
  durationSec?: number | null;
  content?: string | null;
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
  onOpenAddVideoLesson?: () => void;
  onOpenAddPdfLesson?: () => void;
  onOpenQuizBuilder: () => void;
  onPreviewModule?: (step: Step) => void;
  onDeleteModule: (stepId: string) => void;
  onDeleteLesson: (lessonId: string) => Promise<void> | void;
  onDeleteQuiz: () => void;
  onEditLesson?: (lesson: Lesson, step: Step) => void;
  onUpdateModule?: (stepId: string, updates: { title: string; description: string }) => Promise<void>;
  onRefreshData?: () => Promise<void> | void;
  onBackToBasicDetails?: () => void;
  onContinueToPricing?: () => void;
  onOpenFinalExam?: () => void;
}

export default function Step2ModuleList({
  steps,
  activeModuleId,
  onSelectModule,
  onOpenCreateModal,
  onOpenAddLessonChooser,
  onOpenAddVideoLesson,
  onOpenAddPdfLesson,
  onOpenQuizBuilder,
  onDeleteModule,
  onDeleteLesson,
  onDeleteQuiz,
  onEditLesson,
  onUpdateModule,
  onRefreshData,
}: Step2ModuleListProps) {
  const toast = useToast();

  // Find current active step, default to first step if none chosen
  const currentStep =
    steps.find((s) => s.id === activeModuleId) || (steps.length > 0 ? steps[0] : null);

  const [localTitle, setLocalTitle] = useState(currentStep?.title || "");
  const [localDesc, setLocalDesc] = useState(currentStep?.description || "");
  const [isUpdating, setIsUpdating] = useState(false);

  // Modal States
  const [previewConfig, setPreviewConfig] = useState<MediaPreviewConfig | null>(null);
  const [isLessonTypeModalOpen, setIsLessonTypeModalOpen] = useState(false);
  const [lessonToDelete, setLessonToDelete] = useState<{ id: string; title: string } | null>(null);
  const [isDeletingLesson, setIsDeletingLesson] = useState(false);

  // Edit Lesson Modal
  const [editLesson, setEditLesson] = useState<{
    isOpen: boolean;
    lesson: Lesson | null;
    title: string;
    durationMinutes: string;
    durationSeconds: string;
    content: string;
    isSaving: boolean;
  }>({
    isOpen: false,
    lesson: null,
    title: "",
    durationMinutes: "0",
    durationSeconds: "0",
    content: "",
    isSaving: false,
  });

  // Replace Content Modal
  const [replaceContent, setReplaceContent] = useState<{
    isOpen: boolean;
    lesson: Lesson | null;
    url: string;
    selectedFile: File | null;
    isUploading: boolean;
  }>({
    isOpen: false,
    lesson: null,
    url: "",
    selectedFile: null,
    isUploading: false,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

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
      console.error("Failed to update step info:", err);
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

  // Open Edit Lesson Modal
  const handleOpenEditLesson = (lesson: Lesson) => {
    const totalSecs = lesson.durationSec || 0;
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;

    setEditLesson({
      isOpen: true,
      lesson,
      title: lesson.title,
      durationMinutes: String(mins),
      durationSeconds: String(secs),
      content: lesson.content || "",
      isSaving: false,
    });
  };

  // Save Edit Lesson
  const handleSaveLessonEdit = async () => {
    if (!editLesson.lesson) return;
    if (!editLesson.title.trim()) {
      toast.error("Lesson title cannot be empty.");
      return;
    }

    setEditLesson((prev) => ({ ...prev, isSaving: true }));
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const totalSec =
        editLesson.lesson.type === "VIDEO"
          ? (Number(editLesson.durationMinutes) || 0) * 60 + (Number(editLesson.durationSeconds) || 0)
          : undefined;

      const payload: Record<string, any> = {
        title: editLesson.title.trim(),
        content: editLesson.content.trim() || null,
      };
      if (totalSec !== undefined) {
        payload.durationSec = totalSec;
      }

      const res = await fetch(`${API_URL}/programs/lessons/${editLesson.lesson.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to update lesson details."));
      }

      toast.success("Lesson details updated.");
      setEditLesson((prev) => ({ ...prev, isOpen: false, lesson: null }));
      if (onRefreshData) {
        await onRefreshData();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to update lesson.");
    } finally {
      setEditLesson((prev) => ({ ...prev, isSaving: false }));
    }
  };

  // Open Replace Content Modal
  const handleOpenReplaceContent = (lesson: Lesson) => {
    setReplaceContent({
      isOpen: true,
      lesson,
      url: lesson.mediaUrl || "",
      selectedFile: null,
      isUploading: false,
    });
  };

  // Save Content Replacement
  const handleSaveReplaceContent = async () => {
    if (!replaceContent.lesson) return;
    const lesson = replaceContent.lesson;
    const isVideo = lesson.type === "VIDEO";

    setReplaceContent((prev) => ({ ...prev, isUploading: true }));
    try {
      let finalMediaUrl = replaceContent.url.trim();

      if (replaceContent.selectedFile) {
        toast.info(`Uploading ${replaceContent.selectedFile.name}...`);
        finalMediaUrl = await uploadFile(replaceContent.selectedFile);
      }

      if (!finalMediaUrl) {
        toast.error(`Please provide a valid ${isVideo ? "video" : "PDF"} source or upload a file.`);
        setReplaceContent((prev) => ({ ...prev, isUploading: false }));
        return;
      }

      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_URL}/programs/lessons/${lesson.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          mediaUrl: finalMediaUrl,
        }),
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to replace lesson media."));
      }

      toast.success(`${isVideo ? "Video" : "PDF"} content replaced successfully.`);
      setReplaceContent({
        isOpen: false,
        lesson: null,
        url: "",
        selectedFile: null,
        isUploading: false,
      });
      if (onRefreshData) {
        await onRefreshData();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to replace content.");
    } finally {
      setReplaceContent((prev) => ({ ...prev, isUploading: false }));
    }
  };

  // Preview Media
  const handlePreview = (lesson: Lesson) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (lesson.type === "VIDEO") {
      let resolvedSrc = lesson.mediaUrl || "";
      if (resolvedSrc.startsWith("upload:")) {
        const rawKey = resolvedSrc.replace("upload:", "");
        const streamingKey = rawKey.includes(".") ? rawKey : `${rawKey}.mp4`;
        resolvedSrc = `${API_URL}/media/stream/${streamingKey}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
      } else if (resolvedSrc && !resolvedSrc.startsWith("http://") && !resolvedSrc.startsWith("https://") && !resolvedSrc.startsWith("/")) {
        resolvedSrc = `${API_URL}/media/stream/${resolvedSrc}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
      }
      setPreviewConfig({
        isOpen: true,
        type: "VIDEO",
        title: lesson.title,
        src: resolvedSrc,
      });
    } else if (lesson.type === "PDF") {
      let resolvedSrc = lesson.mediaUrl || "";
      if (lesson.id) {
        resolvedSrc = `${API_URL}/media/document/${lesson.id}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
      } else if (resolvedSrc.startsWith("upload:")) {
        resolvedSrc = `${API_URL}/media/stream/${resolvedSrc.replace("upload:", "")}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
      }
      setPreviewConfig({
        isOpen: true,
        type: "PDF",
        title: lesson.title,
        src: resolvedSrc,
      });
    }
  };

  const handlePreviewQuiz = () => {
    if (!currentStep?.quiz) return;
    setPreviewConfig({
      isOpen: true,
      type: "QUIZ",
      title: currentStep.quiz.title || `Step ${currentStep.sequence} Knowledge Check Quiz`,
      quizData: currentStep.quiz,
    });
  };

  return (
    <section className={styles.cardSurface}>


      {/* 2-Column Split: Left Navigator | Right Editor */}
      <div className={styles.curriculumSplitLayout}>
        {/* =========================================================
            Left Column: Steps Navigator
            ========================================================= */}
        <div className={styles.moduleNavigatorCol}>
          {/* Single clean Add Step button in header */}
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
            <span>Add Step</span>
          </button>

          {/* Steps List */}
          {steps.length === 0 ? (
            <div
              style={{
                padding: "2rem 1rem",
                textAlign: "center",
                background: "#faf7f2",
                borderRadius: 12,
                border: "1px dashed #ece6dd",
                color: "#78716a",
                fontSize: "0.85rem",
              }}
            >
              No steps created yet. Click &quot;Add Step&quot; above to create your first step.
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
                    style={{
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      border: isSelected ? "1.5px solid #d97706" : "1px solid #ece6dd",
                      background: isSelected ? "#fffbf5" : "#ffffff",
                    }}
                    onClick={() => onSelectModule(step.id)}
                  >
                    <div className={styles.moduleAccordionHeader} style={{ padding: "0.75rem 0.9rem" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h4
                          className={styles.moduleAccordionTitle}
                          style={{
                            color: isSelected ? "#14110f" : "#44403c",
                            fontWeight: isSelected ? 700 : 600,
                            fontSize: "0.9rem",
                            margin: "0 0 0.2rem",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          Step {step.sequence}: {step.title}
                        </h4>
                        <div
                          className={styles.moduleAccordionSub}
                          style={{
                            fontSize: "0.78rem",
                            color: "#78716a",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.35rem",
                          }}
                        >
                          <span>
                            {lessonsCount} {lessonsCount === 1 ? "lesson" : "lessons"}
                          </span>
                          {hasQuiz && (
                            <>
                              <span>•</span>
                              <span style={{ color: "#7e22ce", fontWeight: 600 }}>Quiz</span>
                            </>
                          )}
                        </div>
                      </div>
                      <span
                        style={{
                          color: isSelected ? "#d97706" : "#d6d0c7",
                          fontSize: "0.85rem",
                          fontWeight: 700,
                          marginLeft: "0.5rem",
                        }}
                      >
                        {isSelected ? "●" : "○"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* =========================================================
            Right Column: Active Step Details & Lessons
            ========================================================= */}
        <div>
          {currentStep ? (
            <div className={styles.moduleEditorCard}>
              {/* Step Header */}
              <div className={styles.moduleEditorHeader}>
                <div>
                  <h3 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0, color: "#14110f" }}>
                    Step {currentStep.sequence}: {currentStep.title}
                  </h3>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <button
                    type="button"
                    className={styles.deleteModuleAction}
                    onClick={() => onDeleteModule(currentStep.id)}
                    title={`Delete Step ${currentStep.sequence}`}
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
                    <span>Delete Step {currentStep.sequence}</span>
                  </button>
                </div>
              </div>

              {/* Step Metadata Inputs */}
              <div style={{ marginBottom: "1.75rem" }}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    <span>Step Title *</span>
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
                    <span>Step Description (Optional)</span>
                  </label>
                  <textarea
                    rows={2}
                    value={localDesc}
                    onChange={(e) => setLocalDesc(e.target.value)}
                    onBlur={handleBlurSave}
                    className={styles.formTextarea}
                    placeholder="Brief description of this step's objectives..."
                    style={{ minHeight: 65 }}
                  />
                </div>
              </div>

              {/* Section Header: Lessons + Add Lesson Button */}
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
                  onClick={() => setIsLessonTypeModalOpen(true)}
                  style={{ padding: "0.5rem 0.9rem", fontSize: "0.82rem", height: "auto" }}
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
                  <span>Add Lesson</span>
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
                      No lessons attached to Step {currentStep.sequence}
                    </p>
                    <p style={{ fontSize: "0.85rem", margin: "0 0 1rem" }}>
                      Add video lectures, PDF resources, or a knowledge check quiz.
                    </p>
                    <button
                      type="button"
                      className={styles.btnPrimary}
                      onClick={() => setIsLessonTypeModalOpen(true)}
                    >
                      + Add Lesson
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
                            <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#d97706", width: 22 }}>
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

                            {/* Action 1: Preview */}
                            <button
                              type="button"
                              className={styles.actionIconBtn}
                              onClick={() => handlePreview(lesson)}
                              title={`Preview ${isVideo ? "Video" : "PDF"}`}
                              aria-label="Preview Lesson"
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            </button>

                            {/* Action 2: Edit */}
                            <button
                              type="button"
                              className={styles.actionIconBtn}
                              onClick={() => {
                                if (onEditLesson && currentStep) {
                                  onEditLesson(lesson, currentStep);
                                } else {
                                  handleOpenEditLesson(lesson);
                                }
                              }}
                              title={`Edit ${isVideo ? "Video" : "PDF"} Lesson`}
                              aria-label="Edit Lesson"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>

                            {/* Action 3: Delete */}
                            <button
                              type="button"
                              className={styles.actionIconBtnDanger}
                              onClick={() => setLessonToDelete({ id: lesson.id, title: lesson.title })}
                              title="Delete Lesson"
                              aria-label="Delete Lesson"
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

                    {/* Render Step Quiz Row */}
                    {currentStep.quiz && (
                      <div
                        className={styles.lessonSequenceRow}
                        style={{ borderLeft: "3.5px solid #7e22ce" }}
                      >
                        <div className={styles.lessonRowLeft}>
                          <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#7e22ce", width: 22 }}>
                            Q.
                          </span>
                          <span className={styles.lessonRowTitle} title={currentStep.quiz.title}>
                            {currentStep.quiz.title || "Step Knowledge Check Quiz"}
                          </span>
                        </div>

                        <div className={styles.lessonRowRight}>
                          <span className={styles.badgeQuiz}>QUIZ</span>
                          <span className={styles.lessonDuration}>
                            {currentStep.quiz.questions?.length ?? 0} Qs
                          </span>

                          {/* Preview Quiz */}
                          <button
                            type="button"
                            className={styles.actionIconBtn}
                            onClick={handlePreviewQuiz}
                            title="Preview Quiz Questions"
                            aria-label="Preview Quiz"
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          </button>

                          {/* Edit Quiz Questions & Settings */}
                          <button
                            type="button"
                            className={styles.actionIconBtn}
                            onClick={onOpenQuizBuilder}
                            title="Edit Quiz Questions"
                            aria-label="Edit Quiz"
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
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>

                          {/* Delete Quiz */}
                          <button
                            type="button"
                            className={styles.actionIconBtnDanger}
                            onClick={onDeleteQuiz}
                            title="Delete Quiz"
                            aria-label="Delete Quiz"
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
              <h3 style={{ margin: "0 0 0.5rem" }}>No step selected</h3>
              <p style={{ color: "#78716a", marginBottom: "1.5rem" }}>
                Select a step from the left navigator or add a new step to begin.
              </p>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={onOpenCreateModal}
              >
                + Add Step
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ===================================================================
          1. Edit Lesson Modal
          =================================================================== */}
      <Modal
        isOpen={editLesson.isOpen}
        onClose={() => setEditLesson((prev) => ({ ...prev, isOpen: false, lesson: null }))}
        title="Edit Lesson Details"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label className={styles.formLabel}>
              <span>Lesson Title *</span>
            </label>
            <input
              type="text"
              value={editLesson.title}
              onChange={(e) => setEditLesson((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="e.g. Understanding Mindset Principles"
              className={styles.formInput}
              autoFocus
            />
          </div>

          {editLesson.lesson?.type === "VIDEO" && (
            <div>
              <label className={styles.formLabel}>
                <span>Duration (Minutes &amp; Seconds) <span style={{ fontSize: "0.75rem", color: "#78716a", fontWeight: 400 }}>(Auto-extracted from video)</span></span>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <span style={{ fontSize: "0.75rem", color: "#78716a", display: "block", marginBottom: 3 }}>Minutes</span>
                  <input
                    type="number"
                    min="0"
                    value={editLesson.durationMinutes}
                    onChange={(e) => setEditLesson((prev) => ({ ...prev, durationMinutes: e.target.value }))}
                    className={styles.formInput}
                  />
                </div>
                <div>
                  <span style={{ fontSize: "0.75rem", color: "#78716a", display: "block", marginBottom: 3 }}>Seconds</span>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={editLesson.durationSeconds}
                    onChange={(e) => setEditLesson((prev) => ({ ...prev, durationSeconds: e.target.value }))}
                    className={styles.formInput}
                  />
                </div>
              </div>
            </div>
          )}

          <div>
            <label className={styles.formLabel}>
              <span>Lesson Content / Study Notes (Optional)</span>
            </label>
            <textarea
              rows={3}
              value={editLesson.content}
              onChange={(e) => setEditLesson((prev) => ({ ...prev, content: e.target.value }))}
              placeholder="Additional instructions, reference links, or transcript notes for learners..."
              className={styles.formTextarea}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px solid #f1ece4" }}>
            <button
              type="button"
              className={styles.secondaryActionBtn}
              onClick={() => setEditLesson((prev) => ({ ...prev, isOpen: false, lesson: null }))}
              disabled={editLesson.isSaving}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={handleSaveLessonEdit}
              disabled={editLesson.isSaving}
            >
              {editLesson.isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ===================================================================
          2. Replace Content Modal
          =================================================================== */}
      <Modal
        isOpen={replaceContent.isOpen}
        onClose={() => setReplaceContent({ isOpen: false, lesson: null, url: "", selectedFile: null, isUploading: false })}
        title={`Replace ${replaceContent.lesson?.type === "VIDEO" ? "Video" : "PDF"} Content`}
        subtitle={`Replace media file or streaming URL for "${replaceContent.lesson?.title || ""}"`}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* File Upload Option */}
          <div>
            <label className={styles.formLabel}>
              <span>Option A: Upload Replacement File</span>
            </label>
            <input
              type="file"
              ref={fileInputRef}
              accept={replaceContent.lesson?.type === "VIDEO" ? "video/*" : "application/pdf"}
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setReplaceContent((prev) => ({ ...prev, selectedFile: file }));
              }}
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: "2px dashed #ded6cb",
                borderRadius: 10,
                padding: "1.5rem",
                textAlign: "center",
                cursor: "pointer",
                background: replaceContent.selectedFile ? "#f0fdf4" : "#fdfbf7",
                borderColor: replaceContent.selectedFile ? "#86efac" : "#ded6cb",
                transition: "all 0.15s ease",
              }}
            >
              {replaceContent.selectedFile ? (
                <div>
                  <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "#166534", display: "block" }}>
                    Selected: {replaceContent.selectedFile.name}
                  </span>
                  <span style={{ fontSize: "0.78rem", color: "#15803d" }}>
                    ({(replaceContent.selectedFile.size / (1024 * 1024)).toFixed(2)} MB) - Click to choose another
                  </span>
                </div>
              ) : (
                <div>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#78716a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 0.5rem" }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#14110f", display: "block" }}>
                    Click to browse {replaceContent.lesson?.type === "VIDEO" ? "video" : "PDF"} from computer
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "#78716a" }}>
                    {replaceContent.lesson?.type === "VIDEO" ? "Supports MP4, MOV, WebM" : "Supports PDF documents"}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div style={{ textAlign: "center", position: "relative" }}>
            <span style={{ background: "#ffffff", padding: "0 0.75rem", color: "#78716a", fontSize: "0.8rem", fontWeight: 600, position: "relative", zIndex: 1 }}>
              OR
            </span>
            <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: "#ece6dd" }} />
          </div>

          {/* Direct URL Option */}
          <div>
            <label className={styles.formLabel}>
              <span>Option B: Direct Media URL or Storage Asset ID</span>
            </label>
            <input
              type="text"
              value={replaceContent.url}
              onChange={(e) => setReplaceContent((prev) => ({ ...prev, url: e.target.value, selectedFile: null }))}
              placeholder={replaceContent.lesson?.type === "VIDEO" ? "https://... or video asset ID" : "https://... or PDF document URL"}
              className={styles.formInput}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem", paddingTop: "0.75rem", borderTop: "1px solid #f1ece4" }}>
            <button
              type="button"
              className={styles.secondaryActionBtn}
              onClick={() => setReplaceContent({ isOpen: false, lesson: null, url: "", selectedFile: null, isUploading: false })}
              disabled={replaceContent.isUploading}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={handleSaveReplaceContent}
              disabled={replaceContent.isUploading}
            >
              {replaceContent.isUploading ? "Uploading & Saving..." : "Replace Content"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ===================================================================
          3. Unified Media & Quiz Preview Modal
          =================================================================== */}
      <MediaPreviewModal
        config={previewConfig}
        onClose={() => setPreviewConfig(null)}
      />
          {/* Modal: Select Lesson Type Popup */}
      <Modal
        isOpen={isLessonTypeModalOpen}
        onClose={() => setIsLessonTypeModalOpen(false)}
        title="Select Lesson Type"
        maxWidth="560px"
      >
        <div style={{ padding: "0 0 0.5rem" }}>
          <p style={{ margin: "-0.5rem 0 1.15rem", fontSize: "0.85rem", color: "#78716a" }}>
            Choose the content type you want to attach to Step {currentStep?.sequence}:
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.85rem" }}>
            {/* 1. Video Lesson */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                setIsLessonTypeModalOpen(false);
                if (onOpenAddVideoLesson) onOpenAddVideoLesson();
                else onOpenAddLessonChooser();
              }}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "1.25rem 0.75rem",
                borderRadius: "12px",
                border: "1.5px solid #e7decb",
                background: "#faf8f5",
                cursor: "pointer",
                textAlign: "center",
                gap: "0.75rem",
                transition: "all 0.18s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--accent-primary, #c97a1e)";
                e.currentTarget.style.background = "#fffbf5";
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(201, 122, 30, 0.12)";
                e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#e7decb";
                e.currentTarget.style.background = "#faf8f5";
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.transform = "none";
              }}
            >
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: "12px",
                  background: "#eff6ff",
                  color: "#2563eb",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              </div>
              <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "#14110f" }}>
                Video Lesson
              </span>
            </div>

            {/* 2. PDF Document */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                setIsLessonTypeModalOpen(false);
                if (onOpenAddPdfLesson) onOpenAddPdfLesson();
                else onOpenAddLessonChooser();
              }}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "1.25rem 0.75rem",
                borderRadius: "12px",
                border: "1.5px solid #e7decb",
                background: "#faf8f5",
                cursor: "pointer",
                textAlign: "center",
                gap: "0.75rem",
                transition: "all 0.18s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--accent-primary, #c97a1e)";
                e.currentTarget.style.background = "#fffbf5";
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(201, 122, 30, 0.12)";
                e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#e7decb";
                e.currentTarget.style.background = "#faf8f5";
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.transform = "none";
              }}
            >
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: "12px",
                  background: "#fef2f2",
                  color: "#dc2626",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "#14110f" }}>
                PDF Document
              </span>
            </div>

            {/* 3. Quiz */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                setIsLessonTypeModalOpen(false);
                onOpenQuizBuilder();
              }}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "1.25rem 0.75rem",
                borderRadius: "12px",
                border: "1.5px solid #e7decb",
                background: "#faf8f5",
                cursor: "pointer",
                textAlign: "center",
                gap: "0.75rem",
                transition: "all 0.18s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--accent-primary, #c97a1e)";
                e.currentTarget.style.background = "#fffbf5";
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(201, 122, 30, 0.12)";
                e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#e7decb";
                e.currentTarget.style.background = "#faf8f5";
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.transform = "none";
              }}
            >
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: "12px",
                  background: "#fdf4ff",
                  color: "#9333ea",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "#14110f" }}>
                Quiz Assessment
              </span>
            </div>
          </div>
        </div>
      </Modal>

      {/* Confirm Delete Lesson Dialog */}
      <ConfirmDialog
        isOpen={Boolean(lessonToDelete)}
        title="Delete Lesson"
        description={`Are you sure you want to delete "${lessonToDelete?.title || "this lesson"}"? This will permanently remove the lesson and its materials.`}
        confirmText={isDeletingLesson ? "Deleting..." : "Delete Lesson"}
        cancelText="Keep Lesson"
        tone="danger"
        isLoading={isDeletingLesson}
        onConfirm={async () => {
          if (lessonToDelete) {
            setIsDeletingLesson(true);
            try {
              await onDeleteLesson(lessonToDelete.id);
              setLessonToDelete(null);
            } catch (err) {
              console.error("Delete lesson error:", err);
            } finally {
              setIsDeletingLesson(false);
            }
          }
        }}
        onClose={() => {
          if (!isDeletingLesson) {
            setLessonToDelete(null);
          }
        }}
      />
    </section>
  );
}
