"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import styles from "../curriculum.module.css";
import {
  ExamConfig,
  ExamQuestionItem,
  ExamQuestionOption,
  fetchProgramExamQuestions,
  createExam,
  updateExam,
  publishExam,
  createExamQuestion,
  updateExamQuestion,
  deleteExamQuestion,
  uploadFile,
} from "../../../lib/api";
import { useToast } from "../../../components/Toast";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import MediaPreviewModal, { type MediaPreviewConfig } from "../../../components/MediaPreviewModal";

interface FinalExamPanelProps {
  programId: string;
  programTitle?: string;
  requireExam?: boolean;
  onToggleRequireExam?: (required: boolean) => Promise<void> | void;
}

interface OptionDraft {
  id?: string;
  text: string;
  imageUrl?: string;
  isCorrect: boolean;
  order?: number;
}

const DEFAULT_OPTIONS: OptionDraft[] = [
  { text: "", isCorrect: true, order: 1 },
  { text: "", isCorrect: false, order: 2 },
  { text: "", isCorrect: false, order: 3 },
  { text: "", isCorrect: false, order: 4 },
];

export default function FinalExamPanel({
  programId,
  programTitle,
}: FinalExamPanelProps) {
  const { success, error } = useToast();
  const [loading, setLoading] = useState(true);
  const [savingAll, setSavingAll] = useState(false);

  // Exam Configuration State
  const [exam, setExam] = useState<ExamConfig | null>(null);
  const [title, setTitle] = useState("");
  const [passMark, setPassMark] = useState(80);
  const [timeLimitMin, setTimeLimitMin] = useState(90);
  const [questionCount, setQuestionCount] = useState(50);
  const [shuffleQuestions, setShuffleQuestions] = useState(true);

  // Question Pool State
  const [questions, setQuestions] = useState<ExamQuestionItem[]>([]);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);

  // Active Question Composer Form State
  const [qText, setQText] = useState("");
  const [qType, setQType] = useState<"MULTIPLE_CHOICE" | "MULTI_SELECT" | "SHORT_ANSWER">("MULTIPLE_CHOICE");
  const [qPoints, setQPoints] = useState(1);
  const [qImageUrl, setQImageUrl] = useState("");
  const [qPromptUploading, setQPromptUploading] = useState(false);
  const promptFileInputRef = useRef<HTMLInputElement>(null);

  const [qExplanation, setQExplanation] = useState("");
  const [qMinCharacters, setQMinCharacters] = useState(10);
  const [qOptions, setQOptions] = useState<OptionDraft[]>(DEFAULT_OPTIONS);
  const [optionUploadingIdx, setOptionUploadingIdx] = useState<number | null>(null);

  const [savingQuestion, setSavingQuestion] = useState(false);
  const [questionToDelete, setQuestionToDelete] = useState<ExamQuestionItem | null>(null);
  const [isDeletingQuestion, setIsDeletingQuestion] = useState(false);

  // Preview Modal State
  const [previewConfig, setPreviewConfig] = useState<MediaPreviewConfig | null>(null);

  const loadExamData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchProgramExamQuestions(programId);
      if (data?.exam) {
        setExam(data.exam);
        setTitle(data.exam.title || (programTitle ? `${programTitle} Final Examination` : "Final Comprehensive Examination"));
        setQuestionCount(data.exam.questionCount ?? 50);
        const loadedPassMark = data.exam.passMark;
        setPassMark(loadedPassMark && loadedPassMark !== 75 && loadedPassMark > 0 ? loadedPassMark : 80);
        setTimeLimitMin(data.exam.timeLimitMin ?? 90);
        setShuffleQuestions(data.exam.shuffleQuestions ?? true);
      } else {
        setTitle(programTitle ? `${programTitle} Final Examination` : "Final Comprehensive Examination");
        setPassMark(80);
        setTimeLimitMin(90);
        setQuestionCount(50);
        setShuffleQuestions(true);
      }
      setQuestions(Array.isArray(data?.questions) ? data.questions : []);
    } catch (err: any) {
      error(err.message || "Failed to load Final Exam data");
    } finally {
      setLoading(false);
    }
  }, [programId, programTitle, error]);

  useEffect(() => {
    loadExamData();
  }, [loadExamData]);

  const ensureExamEntity = async (): Promise<string> => {
    if (exam?.id) {
      return exam.id;
    }
    const created = await createExam({
      programId,
      title: title.trim() || (programTitle ? `${programTitle} Final Examination` : "Final Comprehensive Examination"),
      description: "",
      questionCount: Number(questionCount) || 50,
      passMark: Number(passMark) || 80,
      timeLimitMin: Number(timeLimitMin) || 90,
      maxAttempts: 999,
      cooldownHours: 0,
      shuffleQuestions,
    });
    setExam(created);
    return created.id;
  };

  const commitCurrentDraftQuestion = async (activeExamId: string): Promise<ExamQuestionItem[] | null> => {
    const hasPrompt = qText.trim().length > 0 || Boolean(qImageUrl);
    if (!hasPrompt) return null;

    let validOpts: OptionDraft[] = [];

    if (qType !== "SHORT_ANSWER") {
      validOpts = qOptions.filter((o) => o.text.trim().length > 0 || Boolean(o.imageUrl));
      if (validOpts.length < 2) {
        throw new Error("Choice questions require at least 2 choices with text or image.");
      }
      if (!validOpts.some((o) => o.isCorrect)) {
        throw new Error("Please designate at least one option as the correct answer.");
      }
      if (qType === "MULTIPLE_CHOICE") {
        const correctCount = validOpts.filter((o) => o.isCorrect).length;
        if (correctCount !== 1) {
          throw new Error("Single choice questions must have exactly one correct answer.");
        }
      }
    }

    const payload: Partial<ExamQuestionItem> = {
      text: qText.trim() || (qImageUrl ? "Select the correct option for this illustration:" : "Question"),
      type: qType,
      imageUrl: qImageUrl || null,
      points: Number(qPoints) || 1,
      explanation: qExplanation.trim() || null,
      minCharacters: qType === "SHORT_ANSWER" ? Number(qMinCharacters) || 10 : undefined,
      options: qType === "SHORT_ANSWER" ? [] : validOpts.map((o, idx) => ({
        text: o.text.trim() || `Option ${String.fromCharCode(65 + idx)}`,
        imageUrl: o.imageUrl || null,
        isCorrect: Boolean(o.isCorrect),
        order: idx + 1,
      })),
    };

    if (editingQuestionId) {
      const updated = await updateExamQuestion(activeExamId, editingQuestionId, payload);
      const updatedList = questions.map((q) => (q.id === editingQuestionId ? { ...q, ...updated, ...payload } : q));
      setQuestions(updatedList);
      handleResetToNewQuestion();
      return updatedList;
    } else {
      const created = await createExamQuestion(activeExamId, payload);
      const updatedList = [...questions, created];
      setQuestions(updatedList);
      handleResetToNewQuestion();
      return updatedList;
    }
  };

  const handleSaveFinalExam = async () => {
    if (!title.trim()) {
      error("Exam title is required.");
      return;
    }
    setSavingAll(true);
    try {
      const activeExamId = await ensureExamEntity();

      // Auto-commit draft question if present
      if (qText.trim().length > 0 || Boolean(qImageUrl)) {
        try {
          await commitCurrentDraftQuestion(activeExamId);
          success("Current draft question saved into exam.");
        } catch (draftErr: any) {
          error(draftErr.message || "Failed to save draft question.");
          setSavingAll(false);
          return;
        }
      }

      const updated = await updateExam(activeExamId, {
        title: title.trim(),
        questionCount: Number(questionCount) || 50,
        passMark: Number(passMark) || 80,
        timeLimitMin: Number(timeLimitMin) || 90,
        maxAttempts: 999,
        cooldownHours: 0,
        shuffleQuestions,
      });
      setExam(updated);

      if (updated.status !== "PUBLISHED" && questions.length > 0) {
        const published = await publishExam(activeExamId);
        setExam(published);
      }

      success("Final Exam saved successfully.");
    } catch (err: any) {
      error(err.message || "Failed to save final exam.");
    } finally {
      setSavingAll(false);
    }
  };

  const handleResetToNewQuestion = () => {
    setEditingQuestionId(null);
    setQText("");
    setQImageUrl("");
    setQExplanation("");
    setQPoints(1);
    setQType("MULTIPLE_CHOICE");
    setQMinCharacters(10);
    setQOptions([
      { text: "", isCorrect: true, order: 1 },
      { text: "", isCorrect: false, order: 2 },
      { text: "", isCorrect: false, order: 3 },
      { text: "", isCorrect: false, order: 4 },
    ]);
  };

  const handleSelectQuestionForEdit = (q: ExamQuestionItem) => {
    setEditingQuestionId(q.id);
    setQText(q.text || "");
    setQImageUrl(q.imageUrl || "");
    setQType(
      q.type === "MULTI_SELECT"
        ? "MULTI_SELECT"
        : q.type === "SHORT_ANSWER" || q.type === "TEXT_BOX"
        ? "SHORT_ANSWER"
        : "MULTIPLE_CHOICE"
    );
    setQPoints(q.points || 1);
    setQExplanation(q.explanation || "");
    if (q.type === "SHORT_ANSWER" || q.type === "TEXT_BOX") {
      setQMinCharacters(q.minCharacters || 10);
    } else {
      setQOptions(
        q.options && q.options.length > 0
          ? q.options.map((o, idx) => ({
              id: o.id,
              text: o.text || "",
              imageUrl: o.imageUrl || "",
              isCorrect: Boolean(o.isCorrect),
              order: o.order ?? idx + 1,
            }))
          : [
              { text: "", isCorrect: true, order: 1 },
              { text: "", isCorrect: false, order: 2 },
              { text: "", isCorrect: false, order: 3 },
              { text: "", isCorrect: false, order: 4 },
            ]
      );
    }
  };

  const handleSelectKind = (kind: "MULTIPLE_CHOICE" | "MULTI_SELECT" | "SHORT_ANSWER") => {
    setQType(kind);
    if (kind !== "SHORT_ANSWER" && qOptions.length < 2) {
      setQOptions([
        { text: "", isCorrect: true, order: 1 },
        { text: "", isCorrect: false, order: 2 },
        { text: "", isCorrect: false, order: 3 },
        { text: "", isCorrect: false, order: 4 },
      ]);
    }
  };

  const handlePromptImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setQPromptUploading(true);
    try {
      let url = "";
      try {
        url = await uploadFile(file);
      } catch {
        url = await new Promise((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result as string);
          reader.onerror = rej;
          reader.readAsDataURL(file);
        });
      }
      setQImageUrl(url);
      success("Question image uploaded.");
    } catch (err: any) {
      error(err.message || "Failed to upload question image");
    } finally {
      setQPromptUploading(false);
    }
  };

  const handleOptionImageFile = async (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOptionUploadingIdx(idx);
    try {
      let url = "";
      try {
        url = await uploadFile(file);
      } catch {
        url = await new Promise((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result as string);
          reader.onerror = rej;
          reader.readAsDataURL(file);
        });
      }
      setQOptions((prev) =>
        prev.map((o, i) => (i === idx ? { ...o, imageUrl: url } : o))
      );
      success(`Option ${idx + 1} image attached.`);
    } catch (err: any) {
      error(err.message || "Failed to upload option image");
    } finally {
      setOptionUploadingIdx(null);
    }
  };

  const handleAddOption = () => {
    if (qOptions.length >= 8) {
      error("Maximum 8 options permitted per question.");
      return;
    }
    setQOptions((prev) => [
      ...prev,
      { text: "", isCorrect: false, order: prev.length + 1 },
    ]);
  };

  const handleRemoveOption = (index: number) => {
    if (qOptions.length <= 2) {
      error("At least 2 options are required.");
      return;
    }
    const removedWasCorrect = qOptions[index]?.isCorrect;
    const remaining = qOptions.filter((_, idx) => idx !== index);
    if (removedWasCorrect && !remaining.some((o) => o.isCorrect)) {
      if (remaining[0]) remaining[0].isCorrect = true;
    }
    setQOptions(remaining.map((o, idx) => ({ ...o, order: idx + 1 })));
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qText.trim()) {
      error("Please enter a question statement.");
      return;
    }

    let validOpts: OptionDraft[] = [];

    if (qType !== "SHORT_ANSWER") {
      validOpts = qOptions.filter((o) => o.text.trim().length > 0 || Boolean(o.imageUrl));
      if (validOpts.length < 2) {
        error("Choice questions require at least 2 non-empty choices.");
        return;
      }
      if (!validOpts.some((o) => o.isCorrect)) {
        error("Please designate at least one option as the correct answer.");
        return;
      }
      if (qType === "MULTIPLE_CHOICE") {
        const correctCount = validOpts.filter((o) => o.isCorrect).length;
        if (correctCount !== 1) {
          error("Single choice questions must have exactly one correct answer.");
          return;
        }
      }
    }

    setSavingQuestion(true);
    try {
      const activeExamId = await ensureExamEntity();

      const payload: Partial<ExamQuestionItem> = {
        text: qText.trim(),
        type: qType,
        imageUrl: qImageUrl || null,
        points: Number(qPoints) || 1,
        explanation: qExplanation.trim() || null,
        minCharacters: qType === "SHORT_ANSWER" ? Number(qMinCharacters) || 10 : undefined,
        options: qType === "SHORT_ANSWER" ? [] : validOpts.map((o, idx) => ({
          text: o.text.trim(),
          imageUrl: o.imageUrl || null,
          isCorrect: Boolean(o.isCorrect),
          order: idx + 1,
        })),
      };

      if (editingQuestionId) {
        const updated = await updateExamQuestion(activeExamId, editingQuestionId, payload);
        setQuestions((prev) =>
          prev.map((q) => (q.id === editingQuestionId ? { ...q, ...updated, ...payload } : q))
        );
        success("Question updated successfully.");
      } else {
        const created = await createExamQuestion(activeExamId, payload);
        setQuestions((prev) => [...prev, created]);
        success("Question added to exam.");
      }

      handleResetToNewQuestion();
    } catch (err: any) {
      error(err.message || "Failed to save question.");
    } finally {
      setSavingQuestion(false);
    }
  };

  const confirmDeleteQuestion = async () => {
    if (!questionToDelete || !exam?.id) return;
    setIsDeletingQuestion(true);
    try {
      await deleteExamQuestion(exam.id, questionToDelete.id);
      setQuestions((prev) => prev.filter((q) => q.id !== questionToDelete.id));
      if (editingQuestionId === questionToDelete.id) {
        handleResetToNewQuestion();
      }
      success("Question deleted.");
      setQuestionToDelete(null);
    } catch (err: any) {
      error(err.message || "Could not delete question.");
    } finally {
      setIsDeletingQuestion(false);
    }
  };

  const handleOpenPreview = () => {
    setPreviewConfig({
      isOpen: true,
      type: "QUIZ",
      title: title.trim() || (programTitle ? `${programTitle} Final Examination` : "Final Comprehensive Examination"),
      quizData: {
        title: title.trim() || (programTitle ? `${programTitle} Final Examination` : "Final Comprehensive Examination"),
        passingScore: passMark || 80,
        quizPlacement: "AFTER_VIDEO",
        questions: questions.map((q) => ({
          ...q,
          prompt: q.text,
        })),
      },
    });
  };

  const editingIndex = questions.findIndex((q) => q.id === editingQuestionId);
  const editingQuestion = editingIndex >= 0 ? questions[editingIndex] : null;
  const editingQuestionNum = editingIndex >= 0 ? editingIndex + 1 : null;
  const nextQuestionNum = questions.length + 1;

    if (loading) {
    return (
      <section className={styles.cardSurface} style={{ paddingBottom: "1.75rem" }}>
        {/* Header Skeleton */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
          <div className="skeleton" style={{ height: 26, width: 200, borderRadius: 6 }} />
          <div className="skeleton" style={{ height: 32, width: 140, borderRadius: 6 }} />
        </div>

        {/* Parameters Bar Skeleton */}
        <div
          style={{
            background: "#faf7f2",
            border: "1px solid #ece6dd",
            borderRadius: 12,
            padding: "1.1rem 1.25rem",
            marginBottom: "1.5rem",
            display: "grid",
            gridTemplateColumns: "1.5fr 1fr 1fr",
            gap: "1rem",
          }}
        >
          <div className="skeleton" style={{ height: 40, borderRadius: 8 }} />
          <div className="skeleton" style={{ height: 40, borderRadius: 8 }} />
          <div className="skeleton" style={{ height: 40, borderRadius: 8 }} />
        </div>

        {/* 2-Column Questions Skeleton */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) minmax(400px, 1.4fr)", gap: "1.5rem" }}>
          {/* Question Bubbles Skeleton */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignContent: "flex-start" }}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <div key={n} className="skeleton" style={{ width: 44, height: 44, borderRadius: "50%" }} />
            ))}
          </div>

          {/* Question Composer Skeleton */}
          <div style={{ background: "#ffffff", border: "1px solid #ece4d7", borderRadius: 12, padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="skeleton" style={{ height: 20, width: 160, borderRadius: 6 }} />
            <div className="skeleton" style={{ height: 80, width: "100%", borderRadius: 8 }} />
            <div className="skeleton" style={{ height: 40, width: "100%", borderRadius: 8 }} />
            <div className="skeleton" style={{ height: 40, width: "100%", borderRadius: 8 }} />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.cardSurface} style={{ paddingBottom: "1.75rem" }}>
      {/* Top Header Area */}
      <div
        className={styles.cardHeaderArea}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
          marginBottom: "1.25rem",
        }}
      >
        <div>
          <h2 className={styles.stepTitle}>Final Exam Builder</h2>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          {/* Comprehensive Preview Exam Button */}
          <button
            type="button"
            onClick={handleOpenPreview}
            style={{
              padding: "0.45rem 1rem",
              borderRadius: 8,
              border: "1px solid #fed7aa",
              background: "#fff8ef",
              color: "#b86b11",
              fontWeight: 700,
              fontSize: "0.82rem",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span>Preview Exam ({questions.length})</span>
          </button>

          {exam?.status === "PUBLISHED" && (
            <span
              style={{
                fontSize: "0.8rem",
                fontWeight: 700,
                color: "#15803d",
                background: "#dcfce7",
                border: "1px solid #bbf7d0",
                padding: "0.4rem 0.8rem",
                borderRadius: 8,
              }}
            >
              Published (Live)
            </span>
          )}
        </div>
      </div>

      {/* Top Integrated Exam Parameters: Title, Passing Score, Time Limit, Shuffle */}
      <div
        style={{
          background: "#faf7f2",
          border: "1px solid #ece6dd",
          borderRadius: 12,
          padding: "1.1rem 1.25rem",
          marginBottom: "1.5rem",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr minmax(200px, 240px) minmax(180px, 220px)", gap: "1.25rem", alignItems: "flex-start", marginBottom: "0.85rem" }}>
          {/* Exam Title */}
          <div>
            <label className={styles.formLabel} style={{ marginBottom: "0.35rem" }}>
              <span>
                Exam Title <span style={{ color: "#dc2626" }}>*</span>
              </span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Final Comprehensive Examination"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={styles.formInput}
            />
          </div>

          {/* Passing Threshold (Default 80%) */}
          <div>
            <label className={styles.formLabel} style={{ marginBottom: "0.35rem" }}>
              <span>Passing Score</span>
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input
                type="number"
                min={1}
                max={100}
                value={passMark}
                onChange={(e) => setPassMark(Math.min(100, Math.max(1, Number(e.target.value) || 80)))}
                className={styles.formInput}
                style={{ width: "80px", textAlign: "center", fontWeight: 700, color: "#d97706" }}
              />
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#78716a" }}>% Passing Threshold</span>
            </div>
          </div>

          {/* Time Limit */}
          <div>
            <label className={styles.formLabel} style={{ marginBottom: "0.35rem" }}>
              <span>Time Limit</span>
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input
                type="number"
                min={5}
                max={360}
                value={timeLimitMin}
                onChange={(e) => setTimeLimitMin(Math.max(5, Number(e.target.value) || 90))}
                className={styles.formInput}
                style={{ width: "80px", textAlign: "center", fontWeight: 700, color: "#14110f" }}
              />
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#78716a" }}>Minutes Time Limit</span>
            </div>
          </div>
        </div>

        {/* Shuffle Questions Bar */}
        <div style={{ borderTop: "1px solid #ece6dd", paddingTop: "0.85rem" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600, color: "#14110f" }}>
            <input
              type="checkbox"
              checked={shuffleQuestions}
              onChange={(e) => setShuffleQuestions(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: "var(--accent-primary, #c97a1e)", cursor: "pointer" }}
            />
            <span>Randomly shuffle question order and choices for each learner attempt</span>
          </label>
        </div>
      </div>

      {/* 2-Column Split: Questions Palette | Active Question Composer */}
      <div className={styles.curriculumSplitLayout} style={{ gap: "1.5rem" }}>
        {/* Left Column: Questions Palette Card */}
        <div className={styles.moduleNavigatorCol} style={{ flex: "0 0 280px" }}>
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #ece6dd",
              borderRadius: "14px",
              padding: "1.25rem",
              boxShadow: "0 2px 10px rgba(28, 25, 23, 0.04)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "var(--text-primary, #14110f)" }}>
                Questions ({questions.length})
              </h3>
              <button
                type="button"
                onClick={handleResetToNewQuestion}
                style={{
                  background: editingQuestionId ? "var(--accent-primary, #c97a1e)" : "#ffffff",
                  border: "1px solid #d4c8b8",
                  color: editingQuestionId ? "#ffffff" : "var(--accent-primary, #c97a1e)",
                  padding: "0.25rem 0.65rem",
                  borderRadius: 6,
                  fontSize: "0.76rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
                title="Add a new question"
              >
                + Add Question
              </button>
            </div>

            {questions.length === 0 ? (
              <div style={{ textAlign: "center", padding: "1.75rem 1rem", background: "#faf7f2", borderRadius: 10, border: "1px dashed #ded6cb" }}>
                <p style={{ margin: 0, color: "var(--text-muted, #78716a)", fontSize: "0.82rem" }}>
                  No questions added yet. Use the editor to add Question 1.
                </p>
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(5, 1fr)",
                  gap: "8px",
                  maxHeight: "520px",
                  overflowY: "auto",
                  padding: "2px",
                }}
              >
                {questions.map((q, idx) => {
                  const isSelected = editingQuestionId === q.id;
                  const isText = q.type === "SHORT_ANSWER" || q.type === "TEXT_BOX";
                  const qTypeLabel = isText ? "Short Answer" : q.type === "MULTI_SELECT" ? "Multi Select" : "Single Choice";

                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => handleSelectQuestionForEdit(q)}
                      title={`Question ${idx + 1} (${qTypeLabel}): ${q.text.slice(0, 60)}`}
                      style={{
                        width: "38px",
                        height: "38px",
                        borderRadius: "50%",
                        margin: "0 auto",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: (idx + 1) >= 100 ? "0.72rem" : "0.85rem",
                        fontWeight: isSelected ? 800 : 700,
                        cursor: "pointer",
                        border: isSelected ? "1.5px solid #d97706" : "1px solid #e5e7eb",
                        background: isSelected ? "#d97706" : "#ffffff",
                        color: isSelected ? "#ffffff" : "#4b5563",
                        boxShadow: isSelected ? "0 2px 6px rgba(217, 119, 6, 0.25)" : "none",
                        transition: "all 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.borderColor = "#d97706";
                          e.currentTarget.style.color = "#d97706";
                          e.currentTarget.style.background = "#fff8ef";
                          e.currentTarget.style.transform = "scale(1.08)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.borderColor = "#e5e7eb";
                          e.currentTarget.style.color = "#4b5563";
                          e.currentTarget.style.background = "#ffffff";
                          e.currentTarget.style.transform = "none";
                        }
                      }}
                    >
                      {idx + 1}
                    </button>
                  );
                })}

                {/* Add New Question Circle Slot */}
                <button
                  type="button"
                  onClick={handleResetToNewQuestion}
                  title="Add new question"
                  style={{
                    width: "38px",
                    height: "38px",
                    borderRadius: "50%",
                    margin: "0 auto",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.1rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    border: "1.5px dashed #d1c7b7",
                    background: "#ffffff",
                    color: "#78716a",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "#d97706";
                    e.currentTarget.style.color = "#d97706";
                    e.currentTarget.style.background = "#fffbf5";
                    e.currentTarget.style.transform = "scale(1.08)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#d1c7b7";
                    e.currentTarget.style.color = "#78716a";
                    e.currentTarget.style.background = "#ffffff";
                    e.currentTarget.style.transform = "none";
                  }}
                >
                  +
                </button>
              </div>
            )}

            {/* Legend matching Image 1 */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                marginTop: "1.25rem",
                paddingTop: "0.85rem",
                borderTop: "1px solid #f1ece4",
                fontSize: "0.78rem",
                color: "#78716a",
              }}
            >
              <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#d97706", display: "inline-block" }} />
                <span>Selected</span>
              </div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#e5e7eb", border: "1px solid #d1d5db", display: "inline-block" }} />
                <span>Saved</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Question Composer Form */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <form
            onSubmit={handleSaveQuestion}
            style={{
              border: "1.5px solid #ece6dd",
              padding: "1.25rem",
              borderRadius: 14,
              background: "#ffffff",
              boxShadow: "0 1px 4px rgba(20, 17, 15, 0.03)",
            }}
          >
            {/* Header: Title & Delete Question Action */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary, #14110f)" }}>
                  {editingQuestionId ? `Edit Question ${editingQuestionNum}` : `Add Question ${nextQuestionNum}`}
                </h4>
                {editingQuestionId && (
                  <button
                    type="button"
                    onClick={handleResetToNewQuestion}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--accent-primary, #c97a1e)",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                  >
                    Cancel Edit
                  </button>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {editingQuestion && (
                  <button
                    type="button"
                    onClick={() => setQuestionToDelete(editingQuestion)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      padding: "0.32rem 0.65rem",
                      borderRadius: 6,
                      border: "1px solid #fecaca",
                      background: "#fef2f2",
                      color: "#dc2626",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                    title={`Delete Question ${editingQuestionNum}`}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    <span>Delete Question {editingQuestionNum}</span>
                  </button>
                )}

                {/* Question Kind Pills */}
                <div style={{ display: "flex", gap: "4px", background: "#f5ece1", padding: "3px", borderRadius: 8 }}>
                  <button
                    type="button"
                    onClick={() => handleSelectKind("MULTIPLE_CHOICE")}
                    style={{
                      padding: "0.3rem 0.65rem",
                      borderRadius: 6,
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      border: "none",
                      cursor: "pointer",
                      background: qType === "MULTIPLE_CHOICE" ? "#ffffff" : "transparent",
                      color: qType === "MULTIPLE_CHOICE" ? "var(--text-primary, #14110f)" : "var(--text-muted, #78716a)",
                      boxShadow: qType === "MULTIPLE_CHOICE" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                    }}
                  >
                    Single Choice
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectKind("MULTI_SELECT")}
                    style={{
                      padding: "0.3rem 0.65rem",
                      borderRadius: 6,
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      border: "none",
                      cursor: "pointer",
                      background: qType === "MULTI_SELECT" ? "#ffffff" : "transparent",
                      color: qType === "MULTI_SELECT" ? "var(--text-primary, #14110f)" : "var(--text-muted, #78716a)",
                      boxShadow: qType === "MULTI_SELECT" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                    }}
                  >
                    Multiple Choice
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectKind("SHORT_ANSWER")}
                    style={{
                      padding: "0.3rem 0.65rem",
                      borderRadius: 6,
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      border: "none",
                      cursor: "pointer",
                      background: qType === "SHORT_ANSWER" ? "#ffffff" : "transparent",
                      color: qType === "SHORT_ANSWER" ? "var(--text-primary, #14110f)" : "var(--text-muted, #78716a)",
                      boxShadow: qType === "SHORT_ANSWER" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                    }}
                  >
                    Short Answer
                  </button>
                </div>
              </div>
            </div>

            {/* Prompt Input */}
            <div className={styles.formGroup} style={{ marginBottom: "0.85rem" }}>
              <label className={styles.formLabel}>
                <span>
                  Question <span style={{ color: "#dc2626" }}>*</span>
                </span>
              </label>
              <textarea
                rows={2}
                required
                placeholder="Enter your question statement here..."
                value={qText}
                onChange={(e) => setQText(e.target.value)}
                className={styles.formTextarea}
                style={{ minHeight: 65 }}
              />
            </div>

            {/* Optional Question Image */}
            <div style={{ marginBottom: "1.1rem" }}>
              {qImageUrl ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "0.6rem 0.9rem", background: "#fdfbf7", borderRadius: 8, border: "1px solid #e7decb" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <img
                      src={qImageUrl}
                      alt="Question illustration"
                      style={{ width: 64, height: 44, objectFit: "cover", borderRadius: 6, border: "1px solid #e5e7eb", cursor: "pointer" }}
                      onClick={() => setPreviewConfig({ isOpen: true, type: "IMAGE", title: "Question Image Preview", src: qImageUrl })}
                      title="Click to view image full size"
                    />
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#14110f" }}>Question Illustration</span>
                      <span style={{ fontSize: "0.74rem", color: "#78716a" }}>Click thumbnail to preview fullscreen</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      type="button"
                      onClick={() => promptFileInputRef.current?.click()}
                      style={{ padding: "4px 10px", fontSize: "0.78rem", color: "#78716a", background: "#ffffff", border: "1px solid #d4c8b8", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}
                    >
                      Change
                    </button>
                    <button
                      type="button"
                      onClick={() => setQImageUrl("")}
                      style={{ padding: "4px 10px", fontSize: "0.78rem", color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <input
                    type="file"
                    ref={promptFileInputRef}
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={handlePromptImageFile}
                  />
                  <button
                    type="button"
                    disabled={qPromptUploading}
                    onClick={() => promptFileInputRef.current?.click()}
                    style={{
                      width: "100%",
                      background: "#faf8f5",
                      border: "1.5px dashed #ded6cb",
                      borderRadius: 8,
                      padding: "0.6rem 1rem",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      color: "#78716a",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--accent-primary, #c97a1e)";
                      e.currentTarget.style.background = "#fffbf5";
                      e.currentTarget.style.color = "var(--accent-primary, #c97a1e)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "#ded6cb";
                      e.currentTarget.style.background = "#faf8f5";
                      e.currentTarget.style.color = "#78716a";
                    }}
                  >
                    {qPromptUploading ? (
                      <>
                        <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2, borderTopColor: "var(--accent-primary, #c97a1e)" }} />
                        <span>Uploading question image...</span>
                      </>
                    ) : (
                      <>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                          <circle cx="9" cy="9" r="2" />
                          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                        </svg>
                        <span>Attach Image to Question (Optional)</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Choice Questions: Clean Options List */}
            {qType !== "SHORT_ANSWER" ? (
              <div style={{ marginBottom: "1rem" }}>
                <label className={styles.formLabel} style={{ marginBottom: "0.45rem", fontSize: "0.82rem" }}>
                  <span>
                    {qType === "MULTI_SELECT"
                      ? "Options (Check all correct answers) *"
                      : "Options (Select the single correct answer) *"}
                  </span>
                </label>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {qOptions.map((opt, idx) => (
                    <div key={idx} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      {qType === "MULTI_SELECT" ? (
                        <input
                          type="checkbox"
                          checked={opt.isCorrect}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setQOptions((prev) =>
                              prev.map((o, i) => (i === idx ? { ...o, isCorrect: checked } : o))
                            );
                          }}
                          style={{ accentColor: "#059669", cursor: "pointer", width: 16, height: 16 }}
                          title="Mark as correct answer"
                        />
                      ) : (
                        <input
                          type="radio"
                          name="final_exam_correct_opt"
                          checked={opt.isCorrect}
                          onChange={() => {
                            setQOptions((prev) =>
                              prev.map((o, i) => ({ ...o, isCorrect: i === idx }))
                            );
                          }}
                          style={{ accentColor: "#059669", cursor: "pointer", width: 16, height: 16 }}
                          title="Mark as correct answer"
                        />
                      )}

                      <input
                        type="text"
                        required={!opt.imageUrl}
                        placeholder={`Option ${idx + 1}`}
                        value={opt.text}
                        onChange={(e) => {
                          const val = e.target.value;
                          setQOptions((prev) =>
                            prev.map((o, i) => (i === idx ? { ...o, text: val } : o))
                          );
                        }}
                        className={styles.formInput}
                        style={{ flex: 1, padding: "0.45rem 0.75rem", fontSize: "0.85rem" }}
                      />

                      {/* Option Image Upload / Preview */}
                      {optionUploadingIdx === idx ? (
                        <div style={{ width: 16, height: 16, border: "2px solid #fed7aa", borderTopColor: "var(--accent-primary, #c97a1e)", borderRadius: "50%", animation: "spin 0.65s linear infinite" }} />
                      ) : opt.imageUrl ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <img src={opt.imageUrl} alt="" style={{ width: 28, height: 28, objectFit: "cover", borderRadius: 4 }} />
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewConfig({
                                isOpen: true,
                                type: "IMAGE",
                                title: `Option ${idx + 1} Image Preview`,
                                src: opt.imageUrl,
                              })
                            }
                            style={{
                              background: "#fdf8f0",
                              border: "1px solid #ebd9c4",
                              color: "var(--accent-primary, #c97a1e)",
                              borderRadius: 4,
                              padding: "2px 5px",
                              fontSize: "0.7rem",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                            title="Preview image in full screen"
                          >
                            Preview
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setQOptions((prev) =>
                                prev.map((o, i) => (i === idx ? { ...o, imageUrl: "" } : o))
                              );
                            }}
                            style={{ border: "none", background: "transparent", color: "#b91c1c", cursor: "pointer", fontSize: "0.85rem" }}
                            title="Remove option image"
                          >
                            &times;
                          </button>
                        </div>
                      ) : (
                        <label style={{ cursor: "pointer", color: "var(--text-muted, #78716a)", padding: "0.25rem" }} title="Attach image to this option">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                            <circle cx="9" cy="9" r="2" />
                            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                          </svg>
                          <input
                            type="file"
                            accept="image/*"
                            style={{ display: "none" }}
                            onChange={(e) => handleOptionImageFile(idx, e)}
                          />
                        </label>
                      )}

                      {/* Remove option button if > 2 */}
                      {qOptions.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveOption(idx)}
                          style={{ border: "none", background: "transparent", color: "var(--text-muted, #78716a)", cursor: "pointer", fontSize: "1rem", lineHeight: 1 }}
                          title="Remove option"
                        >
                          &times;
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {qOptions.length < 8 && (
                  <button
                    type="button"
                    onClick={handleAddOption}
                    style={{
                      marginTop: "0.6rem",
                      background: "transparent",
                      border: "none",
                      color: "var(--accent-primary, #c97a1e)",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      padding: "0.2rem 0",
                    }}
                  >
                    + Add Option
                  </button>
                )}
              </div>
            ) : (
              /* Short Answer settings */
              <div style={{ marginBottom: "1rem", padding: "0.75rem", background: "#faf7f2", borderRadius: 8, border: "1px solid #ece6dd" }}>
                <label className={styles.formLabel} style={{ marginBottom: "0.3rem", fontSize: "0.8rem" }}>
                  <span>Minimum Characters Required</span>
                </label>
                <input
                  type="number"
                  min={5}
                  max={300}
                  value={qMinCharacters}
                  onChange={(e) => setQMinCharacters(Number(e.target.value))}
                  className={styles.formInput}
                  style={{ maxWidth: 120 }}
                />
              </div>
            )}

            {/* Explanation / Solution Guidance */}
            <div className={styles.formGroup} style={{ marginBottom: "1rem" }}>
              <label className={styles.formLabel} style={{ marginBottom: "0.3rem", fontSize: "0.8rem" }}>
                <span>Explanation &amp; Answer Feedback (Optional)</span>
              </label>
              <input
                type="text"
                placeholder="Feedback shown to learner after submitting..."
                value={qExplanation}
                onChange={(e) => setQExplanation(e.target.value)}
                className={styles.formInput}
                style={{ fontSize: "0.82rem" }}
              />
            </div>

            <button
              type="submit"
              disabled={savingQuestion}
              className={styles.btnPrimary}
              style={{ width: "100%", justifyContent: "center", padding: "0.6rem", fontSize: "0.85rem", fontWeight: 700 }}
            >
              {savingQuestion
                ? editingQuestionId
                  ? "Updating Question..."
                  : "Adding Question..."
                : editingQuestionId
                ? `Update Question ${editingQuestionNum}`
                : `+ Add Question ${nextQuestionNum} to Exam`}
            </button>
          </form>
        </div>
      </div>

      {/* Bottom Action Controls */}
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginTop: "2rem", paddingTop: "1.25rem", borderTop: "1px solid var(--border-light, #ece6dd)" }}>
        <button
          type="button"
          disabled={savingAll}
          className={styles.btnPrimary}
          onClick={handleSaveFinalExam}
          style={{ padding: "0.6rem 1.6rem", fontSize: "0.88rem", fontWeight: 700 }}
        >
          {savingAll ? "Saving Final Exam..." : "Save Final Exam"}
        </button>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(questionToDelete)}
        onClose={() => {
          if (!isDeletingQuestion) setQuestionToDelete(null);
        }}
        onConfirm={confirmDeleteQuestion}
        title="Delete Question"
        description={
          <>
            Are you sure you want to delete this question?
            <div style={{ marginTop: "8px", padding: "8px 10px", background: "#f8f5f0", borderRadius: "6px", fontStyle: "italic", fontSize: "0.85rem" }}>
              &ldquo;{questionToDelete?.text}&rdquo;
            </div>
          </>
        }
        tone="danger"
        confirmText={isDeletingQuestion ? "Deleting..." : "Delete Question"}
        cancelText="Cancel"
        isLoading={isDeletingQuestion}
      />

      {/* Media Preview Modal */}
      <MediaPreviewModal
        config={previewConfig}
        onClose={() => setPreviewConfig(null)}
      />
    </section>
  );
}
