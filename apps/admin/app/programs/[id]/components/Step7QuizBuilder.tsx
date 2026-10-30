"use client";

import React, { useState, useEffect, useRef } from "react";
import styles from "../curriculum.module.css";
import { API_URL, cachedFetch, errorMessage, uploadFile } from "../../../lib/api";
import { ConfirmDialog, useToast } from "../../../components";
import MarkdownQuestionImportModal from "./MarkdownQuestionImportModal";
import { ParsedMarkdownQuestion } from "../../../lib/markdown-question-parser";

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
    existingQuiz?.title || `${moduleTitle} Knowledge Check`
  );
  const [passMark, setPassMark] = useState(existingQuiz?.passMark ?? 75);
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
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [isMarkdownModalOpen, setIsMarkdownModalOpen] = useState(false);

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
      setQuizTitle(existingQuiz.title || `${moduleTitle} Knowledge Check`);
      setPassMark(existingQuiz.passMark ?? 75);
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
          setQuizTitle(data.title || `${moduleTitle} Knowledge Check`);
          setPassMark(data.passMark ?? 75);
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

  const ensureQuizEntity = async (): Promise<string> => {
    if (quizId) {
      await cachedFetch(`${API_URL}/quizzes/${quizId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: quizTitle.trim(),
          passMark: Number(passMark) || 75,
          maxAttempts: 999, // Unlimited retakes
          cooldownHours: 0,
          quizPlacement,
        }),
      });
      return quizId;
    }

    const res = await cachedFetch(`${API_URL}/programs/steps/${moduleId}/quiz`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: quizTitle.trim(),
        passMark: Number(passMark) || 75,
        maxAttempts: 999, // Unlimited retakes
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

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPrompt.trim().length < 3) {
      toast.error("Please enter a question prompt (at least 3 characters).");
      return;
    }

    let validOpts: Option[] = [];

    if (selectedKind !== "TEXT_BOX") {
      validOpts = newOptions.filter((o) => o.text.trim().length > 0 || Boolean(o.imageUrl));
      if (validOpts.length < 2) {
        toast.error("Choice questions require at least 2 non-empty choices.");
        return;
      }
      if (!validOpts.some((o) => o.isCorrect)) {
        toast.error("Please designate at least one option as the correct answer.");
        return;
      }

      if (selectedKind === "SINGLE_CHOICE") {
        const correctCount = validOpts.filter((o) => o.isCorrect).length;
        if (correctCount !== 1) {
          toast.error("Single choice questions must have exactly one correct answer.");
          return;
        }
      }
    }

    setIsAddingQuestion(true);
    try {
      const activeQId = await ensureQuizEntity();

      const payload: any = {
        text: newPrompt.trim(),
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
          text: o.text.trim(),
          imageUrl: o.imageUrl || undefined,
          isCorrect: Boolean(o.isCorrect),
          order: idx + 1,
        }));
      }

      const res = await cachedFetch(`${API_URL}/quizzes/${activeQId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to create question"));
      }

      const created = await res.json();
      setQuestions((prev) => [...prev, created]);

      // Reset form
      setNewPrompt("");
      setNewPromptImage("");
      setNewExplanation("");
      setNewOptions([
        { text: "", imageUrl: "", isCorrect: true },
        { text: "", imageUrl: "", isCorrect: false },
        { text: "", imageUrl: "", isCorrect: false },
        { text: "", imageUrl: "", isCorrect: false },
      ]);
      setFeedbackMsg("Question added successfully!");
      setTimeout(() => setFeedbackMsg(null), 3500);
      toast.success("Question added.");
    } catch (err: any) {
      toast.error(err.message || "Failed to add question");
    } finally {
      setIsAddingQuestion(false);
    }
  };

  const confirmDeleteQuestion = async () => {
    if (!quizId || !questionToDelete) return;
    setIsDeletingQuestion(true);
    try {
      const res = await cachedFetch(
        `${API_URL}/quizzes/${quizId}/questions/${questionToDelete.id}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setQuestions((prev) => prev.filter((q) => q.id !== questionToDelete.id));
        toast.success("Question deleted.");
      } else {
        toast.error("Failed to delete question.");
      }
    } catch {
      toast.error("Failed to delete question.");
    } finally {
      setIsDeletingQuestion(false);
      setQuestionToDelete(null);
    }
  };

  const handleSaveAll = async () => {
    setIsSavingAll(true);
    try {
      const activeQId = await ensureQuizEntity();
      toast.success("Quiz configuration saved.");
      onQuizSaved({
        id: activeQId,
        title: quizTitle.trim(),
        passMark: Number(passMark) || 75,
        quizPlacement,
        questions,
      });
      onBackToModule();
    } catch (err: any) {
      toast.error(err.message || "Failed to save quiz");
    } finally {
      setIsSavingAll(false);
    }
  };

  const handleMarkdownQuizImport = async (
    parsedQuestions: ParsedMarkdownQuestion[],
    replaceExisting: boolean
  ) => {
    const activeQId = await ensureQuizEntity();

    if (replaceExisting && questions.length > 0) {
      for (const q of questions) {
        await cachedFetch(`${API_URL}/quizzes/${activeQId}/questions/${q.id}`, {
          method: "DELETE",
        });
      }
    }

    const createdList: Question[] = [];
    for (const q of parsedQuestions) {
      const payload: any = {
        text: q.text,
        type: q.type,
        points: q.points || 1,
        explanation: q.explanation || undefined,
        imageUrl: q.imageUrl || undefined,
        minCharacters: q.minCharacters || undefined,
        options:
          q.type === "SHORT_ANSWER"
            ? []
            : q.options.map((o, idx) => ({
                text: o.text,
                isCorrect: Boolean(o.isCorrect),
                order: idx + 1,
              })),
      };

      const res = await cachedFetch(`${API_URL}/quizzes/${activeQId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const createdQ = await res.json();
        if (createdQ) createdList.push(createdQ);
      }
    }

    setQuestions((prev) => (replaceExisting ? createdList : [...prev, ...createdList]));
    toast.success(`Imported ${createdList.length} quiz questions from Markdown!`);
  };

  return (
    <section className={styles.cardSurface}>
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
          padding: "0.3rem 0",
          marginBottom: "0.75rem",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m15 18-6-6 6-6" />
        </svg>
        <span>Back to Steps &amp; Lessons</span>
      </button>

      {/* Header */}
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
        <h2 className={styles.stepTitle}>Quiz Builder</h2>

        <button
          type="button"
          onClick={() => setIsMarkdownModalOpen(true)}
          style={{
            padding: "0.45rem 0.95rem",
            borderRadius: 8,
            border: "1px solid #14110f",
            background: "#14110f",
            color: "#ffffff",
            fontWeight: 600,
            fontSize: "0.8rem",
            cursor: "pointer",
          }}
        >
          Upload .md Questions
        </button>
      </div>

      {/* Top Parameters (Quiz Title & Passing Score Only) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: "1.25rem", marginBottom: "1.5rem" }}>
        <div>
          <label className={styles.formLabel}>
            <span>Quiz Title</span>
          </label>
          <input
            type="text"
            value={quizTitle}
            onChange={(e) => setQuizTitle(e.target.value)}
            className={styles.formInput}
          />
        </div>

        <div>
          <label className={styles.formLabel}>
            <span>Passing Score (%)</span>
          </label>
          <input
            type="number"
            min={1}
            max={100}
            value={passMark}
            onChange={(e) => setPassMark(Number(e.target.value))}
            className={styles.formInput}
          />
        </div>
      </div>

      {/* Quiz Placement Selector (Simplified & Clean) */}
      <div
        style={{
          marginBottom: "1.75rem",
          padding: "1rem 1.25rem",
          borderRadius: "12px",
          background: "#faf7f2",
          border: "1px solid #ece6dd",
        }}
      >
        <label className={styles.formLabel} style={{ marginBottom: "0.75rem", fontSize: "0.9rem" }}>
          <span>Quiz Placement &amp; Unlock Rule</span>
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0.85rem" }}>
          {/* AFTER_VIDEO (Default) */}
          <div
            onClick={() => setQuizPlacement("AFTER_VIDEO")}
            style={{
              padding: "0.85rem 1rem",
              borderRadius: "10px",
              border: quizPlacement === "AFTER_VIDEO" ? "2px solid var(--accent-primary, #c97a1e)" : "1px solid #e7decb",
              background: quizPlacement === "AFTER_VIDEO" ? "#fffbf5" : "#ffffff",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <input
                type="radio"
                id="placement_after"
                name="quizPlacement"
                value="AFTER_VIDEO"
                checked={quizPlacement === "AFTER_VIDEO"}
                onChange={() => setQuizPlacement("AFTER_VIDEO")}
                style={{ accentColor: "var(--accent-primary, #c97a1e)", cursor: "pointer" }}
              />
              <label htmlFor="placement_after" style={{ fontWeight: 700, fontSize: "0.88rem", color: "#14110f", cursor: "pointer" }}>
                After Video (Standard)
              </label>
              <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: "#ecfdf5", color: "#065f46" }}>
                Default
              </span>
            </div>
            <p style={{ margin: "0 0 0 22px", fontSize: "0.78rem", color: "var(--text-muted, #78716a)", lineHeight: 1.4 }}>
              Video unlocks first. Quiz unlocks after video is completed.
            </p>
          </div>

          {/* BEFORE_VIDEO */}
          <div
            onClick={() => setQuizPlacement("BEFORE_VIDEO")}
            style={{
              padding: "0.85rem 1rem",
              borderRadius: "10px",
              border: quizPlacement === "BEFORE_VIDEO" ? "2px solid var(--accent-primary, #c97a1e)" : "1px solid #e7decb",
              background: quizPlacement === "BEFORE_VIDEO" ? "#fffbf5" : "#ffffff",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <input
                type="radio"
                id="placement_before"
                name="quizPlacement"
                value="BEFORE_VIDEO"
                checked={quizPlacement === "BEFORE_VIDEO"}
                onChange={() => setQuizPlacement("BEFORE_VIDEO")}
                style={{ accentColor: "var(--accent-primary, #c97a1e)", cursor: "pointer" }}
              />
              <label htmlFor="placement_before" style={{ fontWeight: 700, fontSize: "0.88rem", color: "#14110f", cursor: "pointer" }}>
                Before Video (Diagnostic)
              </label>
            </div>
            <p style={{ margin: "0 0 0 22px", fontSize: "0.78rem", color: "var(--text-muted, #78716a)", lineHeight: 1.4 }}>
              Quiz is presented first. Video unlocks upon passing the quiz.
            </p>
          </div>
        </div>
      </div>

      {/* Questions Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0, color: "var(--text-primary, #14110f)" }}>
          Questions ({questions.length})
        </h3>
      </div>

      {/* List of Created Questions */}
      {isLoadingQuestions ? (
        <div className="skeleton" style={{ height: 90, borderRadius: 10, marginBottom: "1.5rem" }} />
      ) : questions.length === 0 ? (
        <div style={{ textAlign: "center", padding: "1.75rem 1rem", background: "#faf7f2", borderRadius: 10, border: "1px dashed #ded6cb", marginBottom: "1.5rem" }}>
          <p style={{ margin: 0, color: "var(--text-muted, #78716a)", fontSize: "0.85rem" }}>
            No questions added yet. Build your first question below.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginBottom: "1.75rem" }}>
          {questions.map((q, idx) => {
            const isText = q.type === "TEXT_BOX" || q.type === "SHORT_ANSWER";

            return (
              <div
                key={q.id}
                style={{
                  background: "#ffffff",
                  border: "1px solid #ece6dd",
                  borderRadius: 10,
                  padding: "1rem 1.25rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem", gap: "0.5rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#d97706", background: "#fef3c7", padding: "1px 7px", borderRadius: 4 }}>
                      Q{idx + 1}
                    </span>
                    <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted, #78716a)" }}>
                      {q.points || 1} pt &bull; {isText ? "Short Answer" : q.type === "MULTIPLE_CHOICE" ? "Multiple Choice" : "Single Choice"}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setQuestionToDelete(q)}
                    className={styles.actionIconBtnDanger}
                    title="Delete Question"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>

                <div style={{ fontWeight: 600, fontSize: "0.92rem", color: "var(--text-primary, #14110f)", marginBottom: "0.5rem" }}>
                  {q.text}
                </div>

                {q.imageUrl && (
                  <div style={{ marginBottom: "0.75rem", maxWidth: 280, borderRadius: 6, overflow: "hidden", border: "1px solid #ece6dd" }}>
                    <img src={q.imageUrl} alt="" style={{ width: "100%", maxHeight: 150, objectFit: "cover", display: "block" }} />
                  </div>
                )}

                {/* Options List */}
                {!isText && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                    {q.options?.map((opt, oIdx) => (
                      <div
                        key={oIdx}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          padding: "0.35rem 0.65rem",
                          borderRadius: 6,
                          fontSize: "0.82rem",
                          background: opt.isCorrect ? "#ecfdf5" : "#fdfbf7",
                          border: opt.isCorrect ? "1px solid #a7f3d0" : "1px solid #f2ede4",
                          color: opt.isCorrect ? "#065f46" : "#44403c",
                          fontWeight: opt.isCorrect ? 600 : 400,
                        }}
                      >
                        <span style={{ color: opt.isCorrect ? "#059669" : "#a8a29e", fontSize: "0.75rem", fontWeight: 700 }}>
                          {String.fromCharCode(65 + oIdx)}.
                        </span>
                        <span>{opt.text}</span>
                        {opt.isCorrect && (
                          <span style={{ marginLeft: "auto", fontSize: "0.68rem", fontWeight: 700, color: "#059669", textTransform: "uppercase" }}>
                            Correct
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Google Forms-Style Question Builder Card */}
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
          <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary, #14110f)" }}>
            Add Question
          </h4>

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

        {feedbackMsg && (
          <div style={{ color: "#15803d", fontWeight: 600, fontSize: "0.82rem", marginBottom: "0.75rem" }}>
            {feedbackMsg}
          </div>
        )}

        {/* Prompt Input */}
        <div className={styles.formGroup} style={{ marginBottom: "0.85rem" }}>
          <label className={styles.formLabel}>
            <span>Question Prompt *</span>
          </label>
          <input
            type="text"
            required
            placeholder="e.g. Which of the following is a key foundation of this step?"
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            className={styles.formInput}
          />
        </div>

        {/* Optional Question Image */}
        <div style={{ marginBottom: "1rem" }}>
          {newPromptImage ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, background: "#faf7f2", borderRadius: 8, border: "1px solid #ece6dd" }}>
              <img src={newPromptImage} alt="" style={{ width: 60, height: 40, objectFit: "cover", borderRadius: 4 }} />
              <span style={{ fontSize: "0.78rem", color: "var(--text-muted, #78716a)", flex: 1 }}>Image attached to question</span>
              <button
                type="button"
                onClick={() => setNewPromptImage("")}
                style={{ padding: "2px 8px", fontSize: "0.75rem", color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, cursor: "pointer" }}
              >
                Remove
              </button>
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
                  background: "transparent",
                  border: "1px dashed #d4c8b8",
                  padding: "0.35rem 0.75rem",
                  borderRadius: 6,
                  fontSize: "0.78rem",
                  color: "var(--text-secondary, #78716a)",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                  <circle cx="9" cy="9" r="2" />
                  <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                </svg>
                <span>{newPromptUploading ? "Uploading..." : "Attach Image"}</span>
              </button>
            </div>
          )}
        </div>

        {/* Choice Questions: Clean Options List */}
        {selectedKind !== "TEXT_BOX" ? (
          <div style={{ marginBottom: "1rem" }}>
            <label className={styles.formLabel} style={{ marginBottom: "0.45rem", fontSize: "0.82rem" }}>
              <span>
                {selectedKind === "MULTIPLE_CHOICE" ? "Options (Check all correct answers)" : "Options (Select the single correct answer)"}
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
                  {opt.imageUrl ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <img src={opt.imageUrl} alt="" style={{ width: 28, height: 28, objectFit: "cover", borderRadius: 4 }} />
                      <button
                        type="button"
                        onClick={() => {
                          setNewOptions((prev) =>
                            prev.map((o, i) => (i === idx ? { ...o, imageUrl: "" } : o))
                          );
                        }}
                        style={{ border: "none", background: "transparent", color: "#b91c1c", cursor: "pointer", fontSize: "0.85rem" }}
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
            <span>Solution Guidance / Explanation (Optional)</span>
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
          style={{ width: "100%", justifyContent: "center", padding: "0.55rem" }}
        >
          {isAddingQuestion ? "Adding..." : "+ Add Question to Quiz"}
        </button>
      </form>

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

      <MarkdownQuestionImportModal
        isOpen={isMarkdownModalOpen}
        onClose={() => setIsMarkdownModalOpen(false)}
        title={`Upload Markdown (.md) Questions — ${quizTitle || moduleTitle}`}
        programTitle={moduleTitle}
        existingQuestions={questions as any}
        allowReplaceMode={true}
        defaultSampleCount={5}
        onImport={handleMarkdownQuizImport}
      />
    </section>
  );
}
