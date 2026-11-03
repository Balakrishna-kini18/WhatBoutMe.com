"use client";

import React, { useState, useEffect, useRef } from "react";
import styles from "../curriculum.module.css";
import { API_URL, cachedFetch, errorMessage, uploadFile } from "../../../lib/api";
import { ConfirmDialog, useToast, HelpTooltip, MediaPreviewModal, type MediaPreviewConfig } from "../../../components";
// Note: MarkdownQuestionImportModal kept for future capability but button commented out per specification
// import MarkdownQuestionImportModal from "./MarkdownQuestionImportModal";
// import { ParsedMarkdownQuestion } from "../../../lib/markdown-question-parser";

interface Option {
  id?: string;
  text: string;
  imageUrl?: string;
  isCorrect: boolean;
  order?: number;
}

interface Question {
  id: string;
  type?: string;
  text: string;
  imageUrl?: string;
  gradingMode?: string;
  minCharacters?: number;
  points?: number;
  explanation?: string | null;
  options: Option[];
}

export type QuestionKind = "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TEXT_BOX";

interface Step7QuizBuilderProps {
  moduleId: string;
  moduleTitle: string;
  existingQuiz?: any | null;
  onBackToModule: () => void;
  onQuizSaved: (updatedQuiz?: any) => void;
}

export default function Step7QuizBuilder({
  moduleId,
  moduleTitle,
  existingQuiz,
  onBackToModule,
  onQuizSaved,
}: Step7QuizBuilderProps) {
  const [quizId, setQuizId] = useState<string | null>(existingQuiz?.id || null);
  const [quizTitle, setQuizTitle] = useState(
    existingQuiz?.title || ""
  );

  // Require Passing Score Toggle (if false, passMark = 0 so student score does not block progression)
  const [requirePassingScore, setRequirePassingScore] = useState<boolean>(
    existingQuiz?.passMark !== undefined ? existingQuiz.passMark > 0 : true
  );
  const [passMark, setPassMark] = useState<number>(
    existingQuiz?.passMark && existingQuiz.passMark > 0 ? existingQuiz.passMark : 80
  );

  const [quizPlacement, setQuizPlacement] = useState<"BEFORE_VIDEO" | "AFTER_VIDEO">(
    existingQuiz?.quizPlacement || "AFTER_VIDEO"
  );
  const toast = useToast();

  // Questions
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionToDelete, setQuestionToDelete] = useState<Question | null>(null);
  const [isDeletingQuestion, setIsDeletingQuestion] = useState(false);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);

  // Question Type selection
  const [selectedKind, setSelectedKind] = useState<QuestionKind>("SINGLE_CHOICE");

  // New Question Form State
  const [newPrompt, setNewPrompt] = useState("");
  const [newPromptImage, setNewPromptImage] = useState("");
  const [newPromptUploading, setNewPromptUploading] = useState(false);
  const promptFileInputRef = useRef<HTMLInputElement>(null);

  const [newGradingMode, setNewGradingMode] = useState<"SELF_REFLECTION_AUTO_PASS" | "MANUAL_REVIEW">("SELF_REFLECTION_AUTO_PASS");
  const [newMinCharacters, setNewMinCharacters] = useState(10);
  const [newPoints, setNewPoints] = useState(1);
  const [newExplanation, setNewExplanation] = useState("");

  const [newOptions, setNewOptions] = useState<Option[]>([
    { text: "", imageUrl: "", isCorrect: true },
    { text: "", imageUrl: "", isCorrect: false },
    { text: "", imageUrl: "", isCorrect: false },
    { text: "", imageUrl: "", isCorrect: false },
  ]);

  const [isAddingQuestion, setIsAddingQuestion] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [optionUploadingIdx, setOptionUploadingIdx] = useState<number | null>(null);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Comprehensive Preview Modal
  const [previewConfig, setPreviewConfig] = useState<MediaPreviewConfig | null>(null);

  const handleSelectQuestionForEdit = (q: Question) => {
    setEditingQuestionId(q.id);
    setNewPrompt(q.text || "");
    setNewPromptImage(q.imageUrl || "");
    setSelectedKind((q.type as QuestionKind) || "SINGLE_CHOICE");
    setNewPoints(q.points || 1);
    setNewExplanation(q.explanation || "");
    if (q.type === "TEXT_BOX" || q.type === "SHORT_ANSWER") {
      setNewGradingMode((q.gradingMode as any) || "SELF_REFLECTION_AUTO_PASS");
      setNewMinCharacters(q.minCharacters || 10);
    } else {
      setNewOptions(
        q.options && q.options.length > 0
          ? q.options.map((o) => ({
              id: o.id,
              text: o.text || "",
              imageUrl: o.imageUrl || "",
              isCorrect: Boolean(o.isCorrect),
            }))
          : [
              { text: "", imageUrl: "", isCorrect: true },
              { text: "", imageUrl: "", isCorrect: false },
            ]
      );
    }
  };

  const handleResetToNewQuestion = () => {
    setEditingQuestionId(null);
    setNewPrompt("");
    setNewPromptImage("");
    setNewExplanation("");
    setNewPoints(1);
    setNewOptions([
      { text: "", imageUrl: "", isCorrect: true },
      { text: "", imageUrl: "", isCorrect: false },
      { text: "", imageUrl: "", isCorrect: false },
      { text: "", imageUrl: "", isCorrect: false },
    ]);
  };

  const handleSelectKind = (kind: QuestionKind) => {
    setSelectedKind(kind);
    if (kind !== "TEXT_BOX" && newOptions.length < 2) {
      setNewOptions([
        { text: "", imageUrl: "", isCorrect: true },
        { text: "", imageUrl: "", isCorrect: false },
        { text: "", imageUrl: "", isCorrect: false },
        { text: "", imageUrl: "", isCorrect: false },
      ]);
    }
  };

  useEffect(() => {
    if (existingQuiz?.id) {
      setQuizId(existingQuiz.id);
      setQuizTitle(existingQuiz.title || "");
      setRequirePassingScore(existingQuiz.passMark !== undefined ? existingQuiz.passMark > 0 : true);
      setPassMark(existingQuiz.passMark > 0 ? existingQuiz.passMark : 80);
      setQuizPlacement(existingQuiz.quizPlacement || "AFTER_VIDEO");
      fetchQuestions(existingQuiz.id);
    } else {
      checkExistingStepQuiz();
    }
  }, [existingQuiz, moduleId, moduleTitle]);

  const checkExistingStepQuiz = async () => {
    try {
      const res = await cachedFetch(`${API_URL}/programs/steps/${moduleId}/quiz`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.id) {
          setQuizId(data.id);
          setQuizTitle(data.title || "");
          setRequirePassingScore(data.passMark !== undefined ? data.passMark > 0 : true);
          setPassMark(data.passMark > 0 ? data.passMark : 80);
          setQuizPlacement(data.quizPlacement || "AFTER_VIDEO");
          fetchQuestions(data.id);
        }
      }
    } catch {
      // No existing quiz yet
    }
  };

  const fetchQuestions = async (targetQuizId: string) => {
    setIsLoadingQuestions(true);
    try {
      const res = await cachedFetch(`${API_URL}/quizzes/${targetQuizId}/questions`);
      if (res.ok) {
        const data = await res.json();
        setQuestions(data);
      }
    } catch {
      toast.error("Could not load quiz questions.");
    } finally {
      setIsLoadingQuestions(false);
    }
  };

  // Robust Quiz Entity Initializer: handles both /quizzes and /programs/steps/:id/quiz
  const ensureQuizEntity = async (): Promise<string> => {
    const finalPassMark = requirePassingScore ? (Number(passMark) || 75) : 0;
    const finalTitle = quizTitle.trim() || `${moduleTitle} Knowledge Check`;

    if (quizId) {
      await cachedFetch(`${API_URL}/quizzes/${quizId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: finalTitle,
          passMark: finalPassMark,
          maxAttempts: 999, // Unlimited retakes
          cooldownHours: 0,
          quizPlacement,
        }),
      });
      return quizId;
    }

    // Try standard POST /quizzes
    try {
      const res = await cachedFetch(`${API_URL}/quizzes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stepId: moduleId,
          title: finalTitle,
          passMark: finalPassMark,
          maxAttempts: 999,
          cooldownHours: 0,
          quizPlacement,
        }),
      });

      if (res.ok) {
        const created = await res.json();
        setQuizId(created.id);
        return created.id;
      }
    } catch {
      // Fallback
    }

    // Fallback to step route
    const res = await cachedFetch(`${API_URL}/programs/steps/${moduleId}/quiz`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: finalTitle,
        passMark: finalPassMark,
        maxAttempts: 999,
        cooldownHours: 0,
        quizPlacement,
      }),
    });

    if (!res.ok) {
      throw new Error(await errorMessage(res, "Failed to initialize quiz in backend"));
    }
    const created = await res.json();
    setQuizId(created.id);
    return created.id;
  };

  const handlePromptImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNewPromptUploading(true);
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
      setNewPromptImage(url);
      toast.success("Question image uploaded.");
    } catch (err: any) {
      toast.error(err.message || "Failed to upload image");
    } finally {
      setNewPromptUploading(false);
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
      setNewOptions((prev) =>
        prev.map((o, i) => (i === idx ? { ...o, imageUrl: url } : o))
      );
      toast.success(`Option ${idx + 1} image attached.`);
    } catch (err: any) {
      toast.error(err.message || "Failed to upload option image");
    } finally {
      setOptionUploadingIdx(null);
    }
  };

  const handleAddChoice = () => {
    if (newOptions.length >= 8) {
      toast.error("Maximum 8 options permitted per question.");
      return;
    }
    setNewOptions((prev) => [...prev, { text: "", imageUrl: "", isCorrect: false }]);
  };

  const handleRemoveChoice = (idx: number) => {
    if (newOptions.length <= 2) {
      toast.error("At least 2 choices are required.");
      return;
    }
    const removedWasCorrect = newOptions[idx]?.isCorrect;
    const remaining = newOptions.filter((_, i) => i !== idx);
    if (removedWasCorrect && !remaining.some((o) => o.isCorrect)) {
      if (remaining[0]) remaining[0].isCorrect = true;
    }
    setNewOptions(remaining);
  };

  const buildCurrentQuestionPayload = () => {
    const hasPrompt = newPrompt.trim().length > 0 || Boolean(newPromptImage);
    if (!hasPrompt) {
      throw new Error("Please enter a question prompt or attach an illustration.");
    }

    let validOpts: Option[] = [];

    if (selectedKind !== "TEXT_BOX") {
      validOpts = newOptions.filter((o) => o.text.trim().length > 0 || Boolean(o.imageUrl));
      if (validOpts.length < 2) {
        throw new Error("Choice questions require at least 2 choices with text or image.");
      }
      if (!validOpts.some((o) => o.isCorrect)) {
        throw new Error("Please designate at least one option as the correct answer.");
      }

      if (selectedKind === "SINGLE_CHOICE") {
        const correctCount = validOpts.filter((o) => o.isCorrect).length;
        if (correctCount !== 1) {
          throw new Error("Single choice questions must have exactly one correct answer.");
        }
      }
    }

    const finalPromptText = newPrompt.trim() || (newPromptImage ? "Select the correct option for this illustration:" : "Question");
    const payload: any = {
      text: finalPromptText,
      type: selectedKind,
      imageUrl: newPromptImage || undefined,
      points: Number(newPoints) || 1,
      explanation: newExplanation.trim() || undefined,
    };

    if (selectedKind === "TEXT_BOX") {
      payload.options = [];
      payload.gradingMode = newGradingMode;
      payload.minCharacters = Number(newMinCharacters) || 10;
    } else {
      payload.options = validOpts.map((o, idx) => ({
        text: o.text.trim() || `Option ${String.fromCharCode(65 + idx)}`,
        imageUrl: o.imageUrl || undefined,
        isCorrect: Boolean(o.isCorrect),
        order: idx + 1,
      }));
    }

    return payload;
  };

  const commitDraftQuestion = async (targetQuizId: string): Promise<Question[] | null> => {
    const hasPrompt = newPrompt.trim().length > 0 || Boolean(newPromptImage);
    if (!hasPrompt) return null;

    const payload = buildCurrentQuestionPayload();
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    let updatedQuestion: any;

    if (editingQuestionId) {
      // Edit existing question
      const res = await fetch(`${API_URL}/quizzes/questions/${editingQuestionId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to update question"));
      }
      updatedQuestion = await res.json();
      const updatedList = questions.map((q) =>
        q.id === editingQuestionId ? { ...q, ...updatedQuestion, ...payload } : q
      );
      setQuestions(updatedList);
      handleResetToNewQuestion();
      return updatedList;
    } else {
      // Create new question
      const res = await fetch(`${API_URL}/quizzes/${targetQuizId}/questions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to create question"));
      }
      updatedQuestion = await res.json();
      const updatedList = [...questions, updatedQuestion];
      setQuestions(updatedList);
      handleResetToNewQuestion();
      return updatedList;
    }
  };

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAddingQuestion(true);
    try {
      const activeQId = await ensureQuizEntity();
      const updatedList = await commitDraftQuestion(activeQId);
      if (updatedList) {
        toast.success(editingQuestionId ? "Question updated successfully." : "Question added.");
        setFeedbackMsg(editingQuestionId ? "Question updated." : "Question added.");
        setTimeout(() => setFeedbackMsg(null), 3000);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to add question.");
    } finally {
      setIsAddingQuestion(false);
    }
  };

  const confirmDeleteQuestion = async () => {
    if (!questionToDelete) return;
    setIsDeletingQuestion(true);
    try {
      const res = await cachedFetch(`${API_URL}/quizzes/questions/${questionToDelete.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to delete question"));
      }
      setQuestions((prev) => prev.filter((q) => q.id !== questionToDelete.id));
      if (editingQuestionId === questionToDelete.id) {
        handleResetToNewQuestion();
      }
      toast.success("Question deleted.");
      setQuestionToDelete(null);
    } catch (err: any) {
      toast.error(err.message || "Could not delete question.");
    } finally {
      setIsDeletingQuestion(false);
    }
  };

  const handleSaveAll = async () => {
    setIsSavingAll(true);
    try {
      const activeQId = await ensureQuizEntity();
      let currentQuestions = questions;

      // Auto-commit draft question if user has started composing
      if (newPrompt.trim().length > 0 || Boolean(newPromptImage)) {
        try {
          const committed = await commitDraftQuestion(activeQId);
          if (committed) {
            currentQuestions = committed;
            toast.success("Draft question saved into quiz.");
          }
        } catch (draftErr: any) {
          toast.error(draftErr.message || "Could not save current draft question.");
          setIsSavingAll(false);
          return;
        }
      }

      onQuizSaved({
        id: activeQId,
        title: quizTitle.trim() || `${moduleTitle} Knowledge Check`,
        passMark: requirePassingScore ? (Number(passMark) || 80) : 0,
        quizPlacement,
        questions: currentQuestions,
      });
      toast.success("Quiz settings saved successfully.");
    } catch (err: any) {
      toast.error(err.message || "Failed to update quiz settings");
    } finally {
      setIsSavingAll(false);
    }
  };

  const handleOpenPreview = () => {
    let previewQuestions = [...questions];
    if (newPrompt.trim().length > 0 || Boolean(newPromptImage)) {
      const draftOpts = newOptions.filter((o) => o.text.trim().length > 0 || Boolean(o.imageUrl));
      if (draftOpts.length > 0 || selectedKind === "TEXT_BOX") {
        previewQuestions.push({
          id: editingQuestionId || "draft-preview",
          text: newPrompt.trim() || (newPromptImage ? "Illustration Question" : "Untitled Question"),
          imageUrl: newPromptImage || undefined,
          type: selectedKind,
          points: Number(newPoints) || 1,
          explanation: newExplanation || undefined,
          options: draftOpts.map((o, idx) => ({
            id: o.id || `opt-${idx}`,
            text: o.text.trim() || `Option ${String.fromCharCode(65 + idx)}`,
            imageUrl: o.imageUrl || undefined,
            isCorrect: Boolean(o.isCorrect),
            order: idx + 1,
          })),
        });
      }
    }

    setPreviewConfig({
      isOpen: true,
      type: "QUIZ",
      title: quizTitle.trim() || `${moduleTitle} Knowledge Check`,
      quizData: {
        title: quizTitle.trim() || `${moduleTitle} Knowledge Check`,
        passingScore: requirePassingScore ? (Number(passMark) || 75) : 0,
        quizPlacement,
        questions: previewQuestions.map((q) => ({
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

  return (
    <section className={styles.cardSurface} style={{ paddingBottom: "1.75rem" }}>
      {/* Top Back Navigation */}
      <button
        type="button"
        onClick={onBackToModule}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.45rem",
          color: "var(--text-muted, #78716a)",
          fontSize: "0.82rem",
          fontWeight: 600,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: "0.2rem 0",
          marginBottom: "0.5rem",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m15 18-6-6 6-6" />
        </svg>
        <span>Back to Steps &amp; Lessons</span>
      </button>

      {/* Header with Top Preview Quiz Action */}
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
          <h2 className={styles.stepTitle}>Quiz Builder</h2>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {/* Comprehensive Preview Quiz Button */}
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
            <span>Preview Quiz ({questions.length})</span>
          </button>
        </div>
      </div>

      {/* Top Parameters: Title, Passing Score Toggle, and Placement */}
      <div
        style={{
          background: "#faf7f2",
          border: "1px solid #ece6dd",
          borderRadius: 12,
          padding: "1.1rem 1.25rem",
          marginBottom: "1.5rem",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr minmax(260px, 320px)", gap: "1.25rem", alignItems: "flex-start", marginBottom: "1rem" }}>
          {/* Quiz Title */}
          <div>
            <label className={styles.formLabel} style={{ marginBottom: "0.35rem" }}>
              <span>
                Quiz Title <span style={{ color: "#dc2626" }}>*</span>
              </span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Module 1 Knowledge Check"
              value={quizTitle}
              onChange={(e) => setQuizTitle(e.target.value)}
              className={styles.formInput}
            />
          </div>

          {/* Require Passing Score Toggle & Input */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "0.35rem" }}>
              <span className={styles.formLabel} style={{ margin: 0, fontWeight: 600 }}>Require Passing Score</span>
              <HelpTooltip text="When enabled, learners must achieve this score percentage to complete the step. If disabled, taking the quiz counts as complete regardless of score." />
              <label className={styles.toggleSwitch} style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  checked={requirePassingScore}
                  onChange={(e) => setRequirePassingScore(e.target.checked)}
                />
                <span className={styles.toggleSlider} />
              </label>
            </div>

            {requirePassingScore ? (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "0.5rem" }}>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={passMark}
                  onChange={(e) => setPassMark(Math.min(100, Math.max(1, Number(e.target.value) || 75)))}
                  className={styles.formInput}
                  style={{ width: "90px", textAlign: "center", fontWeight: 700, color: "#d97706" }}
                />
                <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#78716a" }}>% Passing Threshold</span>
              </div>
            ) : (
              <span style={{ fontSize: "0.78rem", color: "#059669", fontWeight: 600, display: "block", marginTop: "4px" }}>
                Self-Assessment Mode (Completion passes step)
              </span>
            )}
          </div>
        </div>

        {/* Quiz Placement Selector */}
        <div style={{ borderTop: "1px solid #ece6dd", paddingTop: "0.85rem" }}>
          <label className={styles.formLabel} style={{ marginBottom: "0.5rem", fontSize: "0.85rem" }}>
            <span>Quiz Placement &amp; Unlock Rule</span>
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.75rem" }}>
            {/* AFTER_VIDEO (Default) */}
            <div
              onClick={() => setQuizPlacement("AFTER_VIDEO")}
              style={{
                padding: "0.75rem 0.9rem",
                borderRadius: "10px",
                border: quizPlacement === "AFTER_VIDEO" ? "2px solid var(--accent-primary, #c97a1e)" : "1px solid #e7decb",
                background: quizPlacement === "AFTER_VIDEO" ? "#fffbf5" : "#ffffff",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
                <input
                  type="radio"
                  id="placement_after"
                  name="quizPlacement"
                  value="AFTER_VIDEO"
                  checked={quizPlacement === "AFTER_VIDEO"}
                  onChange={() => setQuizPlacement("AFTER_VIDEO")}
                  style={{ accentColor: "var(--accent-primary, #c97a1e)", cursor: "pointer" }}
                />
                <label htmlFor="placement_after" style={{ fontWeight: 700, fontSize: "0.85rem", color: "#14110f", cursor: "pointer" }}>
                  After Video
                </label>
                
              </div>
              <p style={{ margin: "0 0 0 22px", fontSize: "0.76rem", color: "var(--text-muted, #78716a)", lineHeight: 1.4 }}>
                Video unlocks first. Quiz unlocks after video is completed.
              </p>
            </div>

            {/* BEFORE_VIDEO */}
            <div
              onClick={() => setQuizPlacement("BEFORE_VIDEO")}
              style={{
                padding: "0.75rem 0.9rem",
                borderRadius: "10px",
                border: quizPlacement === "BEFORE_VIDEO" ? "2px solid var(--accent-primary, #c97a1e)" : "1px solid #e7decb",
                background: quizPlacement === "BEFORE_VIDEO" ? "#fffbf5" : "#ffffff",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
                <input
                  type="radio"
                  id="placement_before"
                  name="quizPlacement"
                  value="BEFORE_VIDEO"
                  checked={quizPlacement === "BEFORE_VIDEO"}
                  onChange={() => setQuizPlacement("BEFORE_VIDEO")}
                  style={{ accentColor: "var(--accent-primary, #c97a1e)", cursor: "pointer" }}
                />
                <label htmlFor="placement_before" style={{ fontWeight: 700, fontSize: "0.85rem", color: "#14110f", cursor: "pointer" }}>
                  Before Video
                </label>
              </div>
              <p style={{ margin: "0 0 0 22px", fontSize: "0.76rem", color: "var(--text-muted, #78716a)", lineHeight: 1.4 }}>
                Quiz is presented first. Video unlocks upon passing the quiz.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 2-Column Split: Questions Bank List | Active Question Composer */}
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

            {isLoadingQuestions ? (
              <div className="skeleton" style={{ height: 120, borderRadius: 10 }} />
            ) : questions.length === 0 ? (
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
                  const isText = q.type === "TEXT_BOX" || q.type === "SHORT_ANSWER";
                  const qTypeLabel = isText ? "Short Answer" : q.type === "MULTIPLE_CHOICE" ? "Multi Select" : "Single Choice";

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
            onSubmit={handleCreateQuestion}
            style={{
              border: "1.5px solid #ece6dd",
              padding: "1.25rem",
              borderRadius: 14,
              background: "#ffffff",
              boxShadow: "0 1px 4px rgba(20, 17, 15, 0.03)",
            }}
          >
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
                  onClick={() => handleSelectKind("SINGLE_CHOICE")}
                  style={{
                    padding: "0.3rem 0.65rem",
                    borderRadius: 6,
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    background: selectedKind === "SINGLE_CHOICE" ? "#ffffff" : "transparent",
                    color: selectedKind === "SINGLE_CHOICE" ? "var(--text-primary, #14110f)" : "var(--text-muted, #78716a)",
                    boxShadow: selectedKind === "SINGLE_CHOICE" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                  }}
                >
                  Single Choice
                </button>
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
                    background: selectedKind === "MULTIPLE_CHOICE" ? "#ffffff" : "transparent",
                    color: selectedKind === "MULTIPLE_CHOICE" ? "var(--text-primary, #14110f)" : "var(--text-muted, #78716a)",
                    boxShadow: selectedKind === "MULTIPLE_CHOICE" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                  }}
                >
                  Multiple Choice
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectKind("TEXT_BOX")}
                  style={{
                    padding: "0.3rem 0.65rem",
                    borderRadius: 6,
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    background: selectedKind === "TEXT_BOX" ? "#ffffff" : "transparent",
                    color: selectedKind === "TEXT_BOX" ? "var(--text-primary, #14110f)" : "var(--text-muted, #78716a)",
                    boxShadow: selectedKind === "TEXT_BOX" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                  }}
                >
                  Short Answer
                </button>
              </div>
            </div>
          </div>

            {feedbackMsg && (
              <div style={{ color: "#15803d", fontWeight: 600, fontSize: "0.82rem", marginBottom: "0.75rem" }}>
                {feedbackMsg}
              </div>
            )}

            {/* Prompt Input */}
            <div className={styles.formGroup} style={{ marginBottom: "0.85rem" }}>
              <label className={styles.formLabel}>
                <span>
                  Question <span style={{ color: "#dc2626" }}>*</span>
                </span>
              </label>
              <textarea
                rows={2}
                required={!newPromptImage}
                placeholder="Enter your question statement here..."
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                className={styles.formTextarea}
                style={{ minHeight: 65 }}
              />
            </div>

            {/* Optional Question Image */}
            <div style={{ marginBottom: "1.1rem" }}>
              {newPromptImage ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "0.6rem 0.9rem", background: "#fdfbf7", borderRadius: 8, border: "1px solid #e7decb" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <img
                      src={newPromptImage}
                      alt="Question illustration"
                      style={{ width: 64, height: 44, objectFit: "cover", borderRadius: 6, border: "1px solid #e5e7eb", cursor: "pointer" }}
                      onClick={() => setPreviewConfig({ isOpen: true, type: "IMAGE", title: "Question Image Preview", src: newPromptImage })}
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
                      onClick={() => setNewPromptImage("")}
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
                    disabled={newPromptUploading}
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
                    {newPromptUploading ? (
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
            {selectedKind !== "TEXT_BOX" ? (
              <div style={{ marginBottom: "1rem" }}>
                <label className={styles.formLabel} style={{ marginBottom: "0.45rem", fontSize: "0.82rem" }}>
                  <span>
                    {selectedKind === "MULTIPLE_CHOICE"
                      ? "Options (Check all correct answers) *"
                      : "Options (Select the single correct answer) *"}
                  </span>
                </label>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {newOptions.map((opt, idx) => (
                    <div key={idx} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      {selectedKind === "MULTIPLE_CHOICE" ? (
                        <input
                          type="checkbox"
                          checked={opt.isCorrect}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setNewOptions((prev) =>
                              prev.map((o, i) => (i === idx ? { ...o, isCorrect: checked } : o))
                            );
                          }}
                          style={{ accentColor: "#059669", cursor: "pointer", width: 16, height: 16 }}
                          title="Mark as correct answer"
                        />
                      ) : (
                        <input
                          type="radio"
                          name="quiz_builder_correct_opt"
                          checked={opt.isCorrect}
                          onChange={() => {
                            setNewOptions((prev) =>
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
                          setNewOptions((prev) =>
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
                              setNewOptions((prev) =>
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
                      {newOptions.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveChoice(idx)}
                          style={{ border: "none", background: "transparent", color: "var(--text-muted, #78716a)", cursor: "pointer", fontSize: "1rem", lineHeight: 1 }}
                          title="Remove option"
                        >
                          &times;
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {newOptions.length < 8 && (
                  <button
                    type="button"
                    onClick={handleAddChoice}
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
                  value={newMinCharacters}
                  onChange={(e) => setNewMinCharacters(Number(e.target.value))}
                  className={styles.formInput}
                  style={{ maxWidth: 120 }}
                />
              </div>
            )}

            {/* Explanation / Solution Guidance */}
            <div className={styles.formGroup} style={{ marginBottom: "1rem" }}>
              <label className={styles.formLabel} style={{ marginBottom: "0.3rem", fontSize: "0.8rem" }}>
                <span>Explanation & Answer Feedback (Optional)</span>
              </label>
              <input
                type="text"
                placeholder="Feedback shown to learner after submitting..."
                value={newExplanation}
                onChange={(e) => setNewExplanation(e.target.value)}
                className={styles.formInput}
                style={{ fontSize: "0.82rem" }}
              />
            </div>

            <button
              type="submit"
              disabled={isAddingQuestion}
              className={styles.btnPrimary}
              style={{ width: "100%", justifyContent: "center", padding: "0.6rem", fontSize: "0.85rem", fontWeight: 700 }}
            >
              {isAddingQuestion
                ? editingQuestionId
                  ? "Updating Question..."
                  : "Adding Question..."
                : editingQuestionId
                ? `Update Question ${editingQuestionNum}`
                : `+ Add Question ${nextQuestionNum} to Quiz`}
            </button>
          </form>
        </div>
      </div>

      {/* Bottom Action Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "2rem", paddingTop: "1.25rem", borderTop: "1px solid var(--border-light, #ece6dd)" }}>
        <button
          type="button"
          className={styles.secondaryActionBtn}
          onClick={onBackToModule}
        >
          Back to Steps &amp; Lessons
        </button>

        <button
          type="button"
          disabled={isSavingAll}
          className={styles.btnPrimary}
          onClick={handleSaveAll}
          style={{ padding: "0.6rem 1.4rem" }}
        >
          {isSavingAll ? "Saving Quiz..." : "Save Quiz & Return"}
        </button>
      </div>

      {/* Branded ConfirmDialog */}
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

      {/* Comprehensive Preview Modal */}
      <MediaPreviewModal
        config={previewConfig}
        onClose={() => setPreviewConfig(null)}
      />
    </section>
  );
}
