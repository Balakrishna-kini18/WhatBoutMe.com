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

export type QuestionKind = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TEXT_BOX';

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
  const [maxAttempts, setMaxAttempts] = useState(existingQuiz?.maxAttempts ?? 3);
  const [cooldownHours, setCooldownHours] = useState(existingQuiz?.cooldownHours ?? 24);
  const [quizPlacement, setQuizPlacement] = useState<'BEFORE_VIDEO' | 'AFTER_VIDEO'>(
    existingQuiz?.quizPlacement || 'AFTER_VIDEO'
  );
  const toast = useToast();

  // Questions
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionToDelete, setQuestionToDelete] = useState<Question | null>(null);
  const [isDeletingQuestion, setIsDeletingQuestion] = useState(false);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);

  // Question Type selection
  const [selectedKind, setSelectedKind] = useState<QuestionKind>('SINGLE_CHOICE');

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
    if (kind === 'TEXT_BOX') {
      // Preserve prompt and prompt image
    } else {
      if (newOptions.length < 2) {
        setNewOptions([
          { text: "", imageUrl: "", isCorrect: true },
          { text: "", imageUrl: "", isCorrect: false },
          { text: "", imageUrl: "", isCorrect: false },
          { text: "", imageUrl: "", isCorrect: false },
        ]);
      } else if (!newOptions.some((o) => o.isCorrect)) {
        setNewOptions((prev) =>
          prev.map((o, idx) => (idx === 0 ? { ...o, isCorrect: true } : o))
        );
      }
      if (kind === 'SINGLE_CHOICE') {
        let found = false;
        setNewOptions((prev) =>
          prev.map((o) => {
            if (o.isCorrect && !found) {
              found = true;
              return o;
            }
            return { ...o, isCorrect: false };
          })
        );
      }
    }
  };

  // Load existing questions or auto-discover quiz for this step
  useEffect(() => {
    if (existingQuiz?.id) {
      setQuizId(existingQuiz.id);
      if (existingQuiz.title) setQuizTitle(existingQuiz.title);
      if (existingQuiz.passMark != null) setPassMark(existingQuiz.passMark);
      if (existingQuiz.maxAttempts != null) setMaxAttempts(existingQuiz.maxAttempts);
      if (existingQuiz.cooldownHours != null) setCooldownHours(existingQuiz.cooldownHours);
      if (existingQuiz.quizPlacement) setQuizPlacement(existingQuiz.quizPlacement);
      if (existingQuiz.questions && existingQuiz.questions.length > 0) {
        setQuestions(existingQuiz.questions);
        return;
      }
    }

    const loadStepQuizOrQuestions = async () => {
      setIsLoadingQuestions(true);
      try {
        let targetQuizId = quizId || existingQuiz?.id;

        // Auto-discover if step already has a quiz entity
        if (!targetQuizId && moduleId) {
          const stepRes = await cachedFetch(`${API_URL}/programs/steps/${moduleId}`);
          if (stepRes.ok) {
            const stepData = await stepRes.json();
            if (stepData?.quiz?.id) {
              targetQuizId = stepData.quiz.id;
              setQuizId(stepData.quiz.id);
              if (stepData.quiz.title) setQuizTitle(stepData.quiz.title);
              if (stepData.quiz.passMark != null) setPassMark(stepData.quiz.passMark);
              if (stepData.quiz.maxAttempts != null) setMaxAttempts(stepData.quiz.maxAttempts);
              if (stepData.quiz.cooldownHours != null) setCooldownHours(stepData.quiz.cooldownHours);
              if (stepData.quiz.quizPlacement) setQuizPlacement(stepData.quiz.quizPlacement);
              else if (stepData.quizPlacement) setQuizPlacement(stepData.quizPlacement);
              if (stepData.quiz.questions && stepData.quiz.questions.length > 0) {
                setQuestions(stepData.quiz.questions);
                setIsLoadingQuestions(false);
                return;
              }
            } else if (stepData?.quizPlacement) {
              setQuizPlacement(stepData.quizPlacement);
            }
          }
        }

        if (targetQuizId) {
          const qRes = await cachedFetch(`${API_URL}/quizzes/${targetQuizId}/questions`);
          if (qRes.ok) {
            const qData = await qRes.json();
            setQuestions(qData);
          } else if (existingQuiz?.questions) {
            setQuestions(existingQuiz.questions);
          }
        }
      } catch (err) {
        console.warn("Could not load quiz questions", err);
      } finally {
        setIsLoadingQuestions(false);
      }
    };

    loadStepQuizOrQuestions();
  }, [quizId, existingQuiz, moduleId]);

  // Ensure quiz entity exists in backend
  const ensureQuizEntity = async (): Promise<string> => {
    if (quizId) return quizId;

    const res = await cachedFetch(`${API_URL}/quizzes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        stepId: moduleId,
        title: quizTitle.trim() || `${moduleTitle} Knowledge Check`,
        passMark: Number(passMark) || 75,
        maxAttempts: Number(maxAttempts) || 3,
        cooldownHours: Number(cooldownHours) || 24,
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

    if (selectedKind !== 'TEXT_BOX') {
      validOpts = newOptions.filter((o) => o.text.trim().length > 0 || Boolean(o.imageUrl));
      if (validOpts.length < 2) {
        toast.error("Choice questions require at least 2 non-empty choices.");
        return;
      }
      if (!validOpts.some((o) => o.isCorrect)) {
        toast.error("Please designate at least one option as the correct answer.");
        return;
      }

      if (selectedKind === 'SINGLE_CHOICE') {
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

      if (selectedKind === 'TEXT_BOX') {
        payload.gradingMode = newGradingMode;
        payload.minCharacters = Number(newMinCharacters) || 10;
        payload.options = [];
      } else {
        payload.options = validOpts.map((o, idx) => ({
          text: o.text.trim(),
          imageUrl: o.imageUrl || undefined,
          isCorrect: o.isCorrect,
          order: idx + 1,
        }));
      }

      const res = await cachedFetch(`${API_URL}/quizzes/${activeQId}/questions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to add question"));
      }

      const createdQ = await res.json();
      setQuestions((prev) => [...prev, createdQ]);
      setNewPrompt("");
      setNewPromptImage("");
      setNewExplanation("");
      setNewOptions([
        { text: "", imageUrl: "", isCorrect: true },
        { text: "", imageUrl: "", isCorrect: false },
        { text: "", imageUrl: "", isCorrect: false },
        { text: "", imageUrl: "", isCorrect: false },
      ]);
      setFeedbackMsg("Question added successfully");
      toast.success("Question added successfully.");
      setTimeout(() => setFeedbackMsg(null), 2500);
    } catch (err: any) {
      toast.error(err.message || "Failed to append question");
    } finally {
      setIsAddingQuestion(false);
    }
  };

  const confirmDeleteQuestion = async () => {
    if (!questionToDelete) return;
    setIsDeletingQuestion(true);
    try {
      const qId = questionToDelete.id;
      const res = await cachedFetch(`${API_URL}/quizzes/questions/${qId}?force=true`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to delete question"));
      }

      setQuestions((prev) => prev.filter((q) => q.id !== qId));
      setQuestionToDelete(null);
      toast.success("Question removed.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete question");
    } finally {
      setIsDeletingQuestion(false);
    }
  };

  const handleSaveAll = async () => {
    setIsSavingAll(true);
    try {
      const activeQId = await ensureQuizEntity();

      const sanitizedMaxAttempts = Math.max(1, Number(maxAttempts) || 3);
      const sanitizedPassMark = Math.min(100, Math.max(1, Number(passMark) || 75));
      const sanitizedCooldown = Math.max(0, Number(cooldownHours) || 0);

      // Update quiz parameters
      const res = await cachedFetch(`${API_URL}/quizzes/${activeQId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: quizTitle.trim() || `${moduleTitle} Knowledge Check`,
          passMark: sanitizedPassMark,
          maxAttempts: sanitizedMaxAttempts,
          cooldownHours: sanitizedCooldown,
          quizPlacement,
        }),
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to update quiz settings"));
      }

      const updatedQuiz = await res.json().catch(() => ({
        id: activeQId,
        title: quizTitle.trim() || `${moduleTitle} Knowledge Check`,
        passMark: sanitizedPassMark,
        maxAttempts: sanitizedMaxAttempts,
        cooldownHours: sanitizedCooldown,
        quizPlacement,
      }));

      toast.success("Quiz settings updated.");
      onQuizSaved(updatedQuiz);
    } catch (err: any) {
      toast.error(err.message || "Failed to update quiz settings");
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
      for (const existingQ of questions) {
        await cachedFetch(`${API_URL}/quizzes/questions/${existingQ.id}?force=true`, {
          method: "DELETE",
        }).catch(() => null);
      }
      setQuestions([]);
    }

    const createdList: Question[] = [];
    for (const q of parsedQuestions) {
      const mappedType =
        q.type === "SHORT_ANSWER"
          ? "TEXT_BOX"
          : q.type === "MULTI_SELECT"
            ? "MULTIPLE_CHOICE"
            : "SINGLE_CHOICE";

      const payload: any = {
        text: q.text,
        type: mappedType,
        points: q.points || 1,
        explanation: q.explanation || undefined,
        imageUrl: q.imageUrl || undefined,
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
    toast.success(`Imported ${createdList.length} quiz questions from Markdown (.md)!`);
  };

  return (
    <section className={styles.cardSurface}>
      {/* Header */}
      <div
        className={styles.cardHeaderArea}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h2 className={styles.stepTitle}>Quiz Builder</h2>
        </div>
        <button
          type="button"
          onClick={() => setIsMarkdownModalOpen(true)}
          style={{
            padding: "0.55rem 1rem",
            borderRadius: 9,
            border: "1px solid #14110f",
            background: "#14110f",
            color: "#ffffff",
            fontWeight: 700,
            fontSize: "0.82rem",
            cursor: "pointer",
          }}
        >
           Upload .md Questions
        </button>
      </div>

      {/* Top Configuration Grid */}
      <div className={styles.quizParamsGrid}>
        <div>
          <label className={styles.formLabel}>Quiz Title</label>
          <input
            type="text"
            value={quizTitle}
            onChange={(e) => setQuizTitle(e.target.value)}
            className={styles.formInput}
          />
        </div>

        <div>
          <label className={styles.formLabel}>Passing Score (%)</label>
          <input
            type="number"
            min={1}
            max={100}
            value={passMark}
            onChange={(e) => setPassMark(Number(e.target.value))}
            className={styles.formInput}
          />
        </div>

        <div>
          <label className={styles.formLabel}>Max Attempts</label>
          <input
            type="number"
            min={1}
            max={10}
            value={maxAttempts}
            onChange={(e) => setMaxAttempts(Number(e.target.value))}
            className={styles.formInput}
          />
        </div>

        <div>
          <label className={styles.formLabel}>Cooldown Window (Hrs)</label>
          <input
            type="number"
            min={0}
            max={72}
            value={cooldownHours}
            onChange={(e) => setCooldownHours(Number(e.target.value))}
            className={styles.formInput}
          />
        </div>
      </div>

      {/* Quiz Placement Selector (First/Before Video vs. Last/After Video) */}
      <div style={{
        marginTop: "1.25rem",
        marginBottom: "1.75rem",
        padding: "1.25rem",
        borderRadius: "12px",
        background: "var(--bg-soft, #f8fafc)",
        border: "1px solid var(--border-light, #e2e8f0)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <label className={styles.formLabel} style={{ margin: 0, fontWeight: 700, fontSize: "0.95rem" }}>
            Quiz Execution Placement &amp; Unlock Rule
          </label>
          <span style={{
            fontSize: "0.75rem",
            fontWeight: 700,
            padding: "3px 10px",
            borderRadius: "6px",
            background: quizPlacement === "BEFORE_VIDEO" ? "#fef3c7" : "#eff6ff",
            color: quizPlacement === "BEFORE_VIDEO" ? "#b45309" : "#1d4ed8",
            border: `1px solid ${quizPlacement === "BEFORE_VIDEO" ? "#fde68a" : "#bfdbfe"}`,
          }}>
            {quizPlacement === "BEFORE_VIDEO" ? "Pre-Video Diagnostic Gate" : "Post-Video Comprehension Gate"}
          </span>
        </div>
        <p style={{ margin: "0 0 1rem", fontSize: "0.85rem", color: "var(--text-secondary, #64748b)" }}>
          Determine whether learners take this quiz BEFORE watching the compulsory video or AFTER 100% video completion.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
          {/* AFTER_VIDEO (Default) */}
          <div
            onClick={() => setQuizPlacement("AFTER_VIDEO")}
            style={{
              padding: "1rem",
              borderRadius: "10px",
              border: quizPlacement === "AFTER_VIDEO" ? "2px solid var(--accent-primary, #0284c7)" : "1px solid var(--border-light, #cbd5e1)",
              background: quizPlacement === "AFTER_VIDEO" ? "var(--accent-highlight, #f0f9ff)" : "var(--bg-card, #ffffff)",
              cursor: "pointer",
              transition: "all 0.2s ease",
              boxShadow: quizPlacement === "AFTER_VIDEO" ? "0 2px 8px rgba(2, 132, 199, 0.12)" : "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
              <input
                type="radio"
                id="placement_after"
                name="quizPlacement"
                value="AFTER_VIDEO"
                checked={quizPlacement === "AFTER_VIDEO"}
                onChange={() => setQuizPlacement("AFTER_VIDEO")}
                style={{ accentColor: "var(--accent-primary, #0284c7)", width: 16, height: 16, cursor: "pointer" }}
              />
              <label htmlFor="placement_after" style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--text-primary)", cursor: "pointer" }}>
                Last — After Video (Standard)
              </label>
              <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#ecfdf5", color: "#065f46" }}>
                Default
              </span>
            </div>
            <p style={{ margin: "0 0 0 26px", fontSize: "0.82rem", color: "var(--text-secondary, #64748b)", lineHeight: 1.45 }}>
              Video player unlocks first. Students must watch 100% of the compulsory video without skipping before this quiz is unlocked.
            </p>
          </div>

          {/* BEFORE_VIDEO */}
          <div
            onClick={() => setQuizPlacement("BEFORE_VIDEO")}
            style={{
              padding: "1rem",
              borderRadius: "10px",
              border: quizPlacement === "BEFORE_VIDEO" ? "2px solid var(--accent-primary, #0284c7)" : "1px solid var(--border-light, #cbd5e1)",
              background: quizPlacement === "BEFORE_VIDEO" ? "var(--accent-highlight, #f0f9ff)" : "var(--bg-card, #ffffff)",
              cursor: "pointer",
              transition: "all 0.2s ease",
              boxShadow: quizPlacement === "BEFORE_VIDEO" ? "0 2px 8px rgba(2, 132, 199, 0.12)" : "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
              <input
                type="radio"
                id="placement_before"
                name="quizPlacement"
                value="BEFORE_VIDEO"
                checked={quizPlacement === "BEFORE_VIDEO"}
                onChange={() => setQuizPlacement("BEFORE_VIDEO")}
                style={{ accentColor: "var(--accent-primary, #0284c7)", width: 16, height: 16, cursor: "pointer" }}
              />
              <label htmlFor="placement_before" style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--text-primary)", cursor: "pointer" }}>
                First — Before Video (Pre-Assessment)
              </label>
            </div>
            <p style={{ margin: "0 0 0 26px", fontSize: "0.82rem", color: "var(--text-secondary, #64748b)", lineHeight: 1.45 }}>
              Quiz is presented first. Video lesson player is locked with a prerequisite banner until the learner completes this assessment.
            </p>
          </div>
        </div>
      </div>

      {/* Question Types Pill Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0 }}>
          Questions ({questions.length})
        </h3>

        <div className={styles.questionTypePillBar} style={{ margin: 0 }}>
          <button
            type="button"
            onClick={() => handleSelectKind('SINGLE_CHOICE')}
            className={`${styles.questionTypePill} ${selectedKind === 'SINGLE_CHOICE' ? styles.questionTypePillActive : ''}`}
            aria-pressed={selectedKind === 'SINGLE_CHOICE'}
          >
            Single Choice (Radio)
          </button>
          <button
            type="button"
            onClick={() => handleSelectKind('MULTIPLE_CHOICE')}
            className={`${styles.questionTypePill} ${selectedKind === 'MULTIPLE_CHOICE' ? styles.questionTypePillActive : ''}`}
            aria-pressed={selectedKind === 'MULTIPLE_CHOICE'}
          >
            Multiple Choice (Checkboxes)
          </button>
          <button
            type="button"
            onClick={() => handleSelectKind('TEXT_BOX')}
            className={`${styles.questionTypePill} ${selectedKind === 'TEXT_BOX' ? styles.questionTypePillActive : ''}`}
            aria-pressed={selectedKind === 'TEXT_BOX'}
          >
            Written Reflection (Text Box)
          </button>
        </div>
      </div>

      {/* List of Created Questions */}
      {isLoadingQuestions ? (
        <div className="skeleton" style={{ height: 120, borderRadius: 12, marginBottom: "1.5rem" }} />
      ) : questions.length === 0 ? (
        <div style={{ textAlign: "center", padding: "2.5rem 1rem", background: "var(--bg-soft)", borderRadius: 12, marginBottom: "2rem" }}>
          <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.92rem" }}>
            No questions added yet. Use the visual question builder card below to add single choice, multiple choice, or reflection questions!
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", marginBottom: "2rem" }}>
          {questions.map((q, idx) => {
            const hasOptionImages = q.options?.some((o) => Boolean(o.imageUrl));
            const isText = q.type === 'TEXT_BOX' || q.type === 'SHORT_ANSWER';

            return (
              <div key={q.id} className={styles.questionCard}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: "0.8rem", fontWeight: 800, color: "var(--accent-primary)", background: "var(--accent-highlight)", padding: "2px 8px", borderRadius: 4 }}>
                      Question {idx + 1} &bull; {q.points || 1} Pt
                    </span>
                    <span style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 4,
                      background: isText ? "#fef3c7" : q.type === 'MULTIPLE_CHOICE' ? "#e0e7ff" : "#ecfdf5",
                      color: isText ? "#b45309" : q.type === 'MULTIPLE_CHOICE' ? "#3730a3" : "#065f46",
                    }}>
                      {isText
                        ? `Written Reflection • ${q.gradingMode === 'MANUAL_REVIEW' ? 'Manual Grading' : 'Auto-Pass'}`
                        : q.type === 'MULTIPLE_CHOICE'
                        ? 'Multiple Choice (Checkboxes)'
                        : 'Single Choice (Radio)'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setQuestionToDelete(q)}
                    className={styles.deleteItemBtn}
                  >
                    Delete
                  </button>
                </div>

                {/* Prompt Image Preview */}
                {q.imageUrl && (
                  <div style={{ marginBottom: "1rem", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border-light)", maxWidth: 360, background: "#f8fafc" }}>
                    <img
                      src={q.imageUrl}
                      alt={`Question ${idx + 1} Visual`}
                      style={{ width: "100%", maxHeight: 200, objectFit: "cover", display: "block" }}
                    />
                  </div>
                )}

                <h4 style={{ margin: "0 0 1rem", fontSize: "1rem", fontWeight: 700, whiteSpace: "pre-wrap" }}>{q.text}</h4>

                {/* Choices or Text Box preview */}
                {isText ? (
                  <div style={{ padding: "12px 14px", borderRadius: 8, background: "#f8fafc", border: "1px dashed #cbd5e1", marginBottom: "0.75rem" }}>
                    <div style={{ fontSize: "0.85rem", color: "#64748b", fontStyle: "italic", marginBottom: 4 }}>
                      Open-ended learner response (Minimum {q.minCharacters || 10} characters required)
                    </div>
                    <div style={{ fontSize: "0.78rem", color: q.gradingMode === 'MANUAL_REVIEW' ? '#b45309' : '#047857', fontWeight: 600 }}>
                      Evaluation Mode: {q.gradingMode === 'MANUAL_REVIEW' ? 'Manual Review Required (held in instructor queue)' : 'Self-Reflection Auto-Pass (awards credit on submit)'}
                    </div>
                  </div>
                ) : hasOptionImages ? (
                  /* 2x2 Visual Card Grid */
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem", marginBottom: "0.75rem" }}>
                    {q.options?.map((opt, oIdx) => (
                      <div
                        key={oIdx}
                        style={{
                          borderRadius: 8,
                          border: opt.isCorrect ? "2px solid #22c55e" : "1px solid #e2e8f0",
                          background: opt.isCorrect ? "#f0fdf4" : "#ffffff",
                          padding: "10px",
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        {opt.imageUrl && (
                          <img
                            src={opt.imageUrl}
                            alt={`Option ${oIdx + 1}`}
                            style={{ width: "100%", height: 110, objectFit: "cover", borderRadius: 6 }}
                          />
                        )}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginTop: 4 }}>
                          <span style={{ fontSize: "0.88rem", fontWeight: opt.isCorrect ? 700 : 500, color: opt.isCorrect ? "#15803d" : "inherit" }}>
                            {opt.text || `Option ${oIdx + 1}`}
                          </span>
                          {opt.isCorrect && (
                            <span style={{ fontSize: "0.72rem", background: "#22c55e", color: "#ffffff", padding: "1px 6px", borderRadius: 4, fontWeight: 700 }}>
                              ✓ Correct
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Standard List Row */
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "0.75rem" }}>
                    {q.options?.map((opt, oIdx) => (
                      <div key={oIdx} className={styles.optionItemRow}>
                        <input
                          type={q.type === 'MULTIPLE_CHOICE' ? 'checkbox' : 'radio'}
                          checked={opt.isCorrect}
                          readOnly
                          className={styles.correctRadio}
                        />
                        <span style={{ fontSize: "0.88rem", fontWeight: opt.isCorrect ? 700 : 400, color: opt.isCorrect ? "#15803d" : "inherit", display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <span>{opt.text}</span>
                          {opt.isCorrect && (
                            <span style={{ fontSize: "0.75rem", background: "#dcfce7", color: "#15803d", padding: "1px 6px", borderRadius: 4, display: "inline-flex", alignItems: "center", gap: 3 }}>
                              ✓ Correct
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {q.explanation && (
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", background: "var(--bg-soft)", padding: "6px 10px", borderRadius: 6 }}>
                    <strong>Explanation / Feedback:</strong> {q.explanation}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Question Subform */}
      <form onSubmit={handleCreateQuestion} style={{ border: "2px dashed var(--border-light)", padding: "1.75rem", borderRadius: 16, background: "#ffffff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <h4 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>
            + Add New {selectedKind === 'SINGLE_CHOICE' ? 'Single Choice Question' : selectedKind === 'MULTIPLE_CHOICE' ? 'Multiple Choice Question' : 'Written Reflection Question'}
          </h4>
          <span style={{
            fontSize: "0.8rem",
            color: selectedKind === 'TEXT_BOX' ? "#b45309" : "var(--accent-primary)",
            background: selectedKind === 'TEXT_BOX' ? "#fef3c7" : "var(--accent-highlight)",
            padding: "3px 10px",
            borderRadius: 6,
            fontWeight: 700
          }}>
            {selectedKind === 'SINGLE_CHOICE' ? 'Radio: Exactly 1 Correct' : selectedKind === 'MULTIPLE_CHOICE' ? 'Checkboxes: All That Apply' : 'Text Box: Open Reflection'}
          </span>
        </div>

        {feedbackMsg && (
          <div style={{ color: "#15803d", fontWeight: 700, fontSize: "0.85rem", marginBottom: "1rem" }}>
            {feedbackMsg}
          </div>
        )}

        {/* Prompt Text */}
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Question Prompt</label>
          <textarea
            rows={2}
            required
            placeholder={
              selectedKind === 'SINGLE_CHOICE'
                ? "e.g. Which of the following best represents the primary principle of this step?"
                : selectedKind === 'MULTIPLE_CHOICE'
                ? "e.g. Which of the following tools or frameworks are applicable? (Select all that apply)"
                : "e.g. In 2-3 sentences, reflect on how you plan to implement this strategy in your current role."
            }
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            className={styles.formTextarea}
          />
        </div>

        {/* Question Prompt Image Upload */}
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>
            <span>Question Prompt Image (PNG, JPG, JPEG)</span>
            <span className={styles.formLabelOptional}>Optional visual aid / diagram</span>
          </label>

          {newPromptImage ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 10, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
              <img
                src={newPromptImage}
                alt="Prompt Preview"
                style={{ width: 100, height: 60, objectFit: "cover", borderRadius: 6 }}
              />
              <div style={{ flex: 1, fontSize: "0.82rem", color: "#64748b" }}>
                Image attached to question prompt
              </div>
              <button
                type="button"
                onClick={() => setNewPromptImage("")}
                style={{ padding: "4px 10px", fontSize: "0.8rem", color: "#ef4444", background: "#fee2e2", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}
              >
                Remove Image
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                type="file"
                ref={promptFileInputRef}
                accept="image/png, image/jpeg, image/jpg"
                style={{ display: "none" }}
                onChange={handlePromptImageFile}
              />
              <button
                type="button"
                disabled={newPromptUploading}
                onClick={() => promptFileInputRef.current?.click()}
                className={styles.secondaryActionBtn}
                style={{ fontSize: "0.85rem" }}
              >
                {newPromptUploading ? "Uploading Image..." : "Attach Question Image"}
              </button>
              <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                Supports diagrams, formulas, and visual scenarios
              </span>
            </div>
          )}
        </div>

        {/* Text Box Configuration */}
        {selectedKind === 'TEXT_BOX' ? (
          <div style={{ padding: "1.25rem", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0", marginBottom: "1.5rem" }}>
            <h5 style={{ margin: "0 0 0.75rem", fontSize: "0.95rem", fontWeight: 700, color: "#1e293b" }}>
              Written Reflection Evaluation &amp; Safe Grading
            </h5>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
              {/* Mode A: Self-Reflection Auto Pass */}
              <div
                onClick={() => setNewGradingMode("SELF_REFLECTION_AUTO_PASS")}
                style={{
                  padding: "1rem",
                  borderRadius: 10,
                  border: newGradingMode === "SELF_REFLECTION_AUTO_PASS" ? "2px solid #0284c7" : "1px solid #cbd5e1",
                  background: newGradingMode === "SELF_REFLECTION_AUTO_PASS" ? "#f0f9ff" : "#ffffff",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <input
                    type="radio"
                    name="grading_mode_subform"
                    checked={newGradingMode === "SELF_REFLECTION_AUTO_PASS"}
                    onChange={() => setNewGradingMode("SELF_REFLECTION_AUTO_PASS")}
                    style={{ accentColor: "#0284c7" }}
                  />
                  <strong style={{ fontSize: "0.9rem" }}>Mode A: Self-Reflection Auto-Pass</strong>
                </div>
                <p style={{ margin: "4px 0 0 24px", fontSize: "0.8rem", color: "#64748b", lineHeight: 1.4 }}>
                  Awards full credit upon reaching minimum character count so learner can unlock the next step without waiting, while saving response for instructor review.
                </p>
              </div>

              {/* Mode B: Manual Review */}
              <div
                onClick={() => setNewGradingMode("MANUAL_REVIEW")}
                style={{
                  padding: "1rem",
                  borderRadius: 10,
                  border: newGradingMode === "MANUAL_REVIEW" ? "2px solid #0284c7" : "1px solid #cbd5e1",
                  background: newGradingMode === "MANUAL_REVIEW" ? "#f0f9ff" : "#ffffff",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <input
                    type="radio"
                    name="grading_mode_subform"
                    checked={newGradingMode === "MANUAL_REVIEW"}
                    onChange={() => setNewGradingMode("MANUAL_REVIEW")}
                    style={{ accentColor: "#0284c7" }}
                  />
                  <strong style={{ fontSize: "0.9rem" }}>Mode B: Manual Instructor Review</strong>
                </div>
                <p style={{ margin: "4px 0 0 24px", fontSize: "0.8rem", color: "#64748b", lineHeight: 1.4 }}>
                  Submission is held in the Admin Review Queue. Pass status is held until an instructor reviews and scores the answer.
                </p>
              </div>
            </div>

            <div style={{ maxWidth: 220 }}>
              <label className={styles.formLabel}>Minimum Character Count</label>
              <input
                type="number"
                min={5}
                max={500}
                value={newMinCharacters}
                onChange={(e) => setNewMinCharacters(Number(e.target.value))}
                className={styles.formInput}
              />
            </div>
          </div>
        ) : (
          /* Choice-based questions: Dynamic Choices & Visual Option Cards */
          <div className={styles.formGroup}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <label className={styles.formLabel} style={{ margin: 0 }}>
                <span>
                  {selectedKind === 'MULTIPLE_CHOICE'
                    ? "Answer Choices (Check ALL correct options • 2 to 8 choices)"
                    : "Answer Choices (Select the single correct option • 2 to 8 choices)"}
                </span>
              </label>
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                {newOptions.length} of 8 choices configured
              </span>
            </div>

            {/* 2x2 Visual Choice Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
              {newOptions.map((opt, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "1rem",
                    borderRadius: 12,
                    border: opt.isCorrect ? "2px solid #22c55e" : "1px solid #cbd5e1",
                    background: opt.isCorrect ? "#f0fdf4" : "#ffffff",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    position: "relative",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {selectedKind === 'MULTIPLE_CHOICE' ? (
                        <input
                          type="checkbox"
                          checked={opt.isCorrect}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setNewOptions((prev) =>
                              prev.map((o, i) => (i === idx ? { ...o, isCorrect: checked } : o))
                            );
                          }}
                          className={styles.correctRadio}
                          title="Check if correct answer"
                        />
                      ) : (
                        <input
                          type="radio"
                          name="subform_correct_radio"
                          checked={opt.isCorrect}
                          onChange={() => {
                            setNewOptions((prev) =>
                              prev.map((o, i) => ({ ...o, isCorrect: i === idx }))
                            );
                          }}
                          className={styles.correctRadio}
                          title="Mark as correct choice"
                        />
                      )}
                      <span style={{ fontSize: "0.85rem", fontWeight: 700, color: opt.isCorrect ? "#15803d" : "#475569" }}>
                        Choice {idx + 1} {opt.isCorrect ? "(Correct)" : ""}
                      </span>
                    </div>

                    {newOptions.length > 2 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveChoice(idx)}
                        className={styles.deleteItemBtn}
                        title="Remove choice"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  {/* Choice Image Preview or Upload */}
                  {opt.imageUrl ? (
                    <div style={{ position: "relative", borderRadius: 8, overflow: "hidden", border: "1px solid #e2e8f0" }}>
                      <img
                        src={opt.imageUrl}
                        alt={`Choice ${idx + 1}`}
                        style={{ width: "100%", height: 100, objectFit: "cover", display: "block" }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setNewOptions((prev) =>
                            prev.map((o, i) => (i === idx ? { ...o, imageUrl: "" } : o))
                          );
                        }}
                        style={{
                          position: "absolute",
                          top: 4,
                          right: 4,
                          background: "rgba(0,0,0,0.65)",
                          color: "#fff",
                          border: "none",
                          borderRadius: 4,
                          fontSize: "0.7rem",
                          padding: "2px 6px",
                          cursor: "pointer",
                        }}
                      >
                        Remove Img
                      </button>
                    </div>
                  ) : (
                    <div>
                      <label style={{ fontSize: "0.78rem", color: "#0284c7", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <span>Attach Option Image</span>
                        <input
                          type="file"
                          accept="image/png, image/jpeg, image/jpg"
                          style={{ display: "none" }}
                          onChange={(e) => handleOptionImageFile(idx, e)}
                        />
                      </label>
                    </div>
                  )}

                  <input
                    type="text"
                    required={!opt.imageUrl}
                    placeholder={`Option ${idx + 1} text`}
                    value={opt.text}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewOptions((prev) =>
                        prev.map((o, i) => (i === idx ? { ...o, text: val } : o))
                      );
                    }}
                    className={styles.formInput}
                    style={{ fontSize: "0.9rem", padding: "8px 10px" }}
                  />
                </div>
              ))}
            </div>

            {newOptions.length < 8 && (
              <button
                type="button"
                onClick={handleAddChoice}
                className={styles.secondaryActionBtn}
                style={{ marginTop: "1rem", fontSize: "0.85rem" }}
              >
                + Add Another Option ({newOptions.length}/8)
              </button>
            )}
          </div>
        )}

        <div className={styles.formGroup} style={{ marginTop: "1.25rem" }}>
          <label className={styles.formLabel}>Explanation / Solution Guidance (Shown to learner post-submission)</label>
          <input
            type="text"
            placeholder="e.g. This concept was demonstrated in step 4 under the practical module."
            value={newExplanation}
            onChange={(e) => setNewExplanation(e.target.value)}
            className={styles.formInput}
          />
        </div>

        <button
          type="submit"
          disabled={isAddingQuestion}
          className={styles.btnPrimary}
          style={{ width: "100%", justifyContent: "center", padding: "0.75rem" }}
        >
          {isAddingQuestion ? "Adding Question..." : "+ Append Question to Quiz"}
        </button>
      </form>

      {/* Action Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "2.5rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border-light)" }}>
        <button
          type="button"
          className={styles.btnBack}
          onClick={onBackToModule}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span>Back to Module</span>
        </button>

        <button
          type="button"
          disabled={isSavingAll}
          className={styles.btnPrimary}
          onClick={handleSaveAll}
        >
          <span>{isSavingAll ? "Saving Quiz..." : "Save Quiz & Return to Module"}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </button>
      </div>

      {/* In-website branded ConfirmDialog */}
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
            <div style={{ marginTop: "8px", padding: "10px", background: "#f8f5f0", borderRadius: "6px", fontStyle: "italic", fontSize: "0.88rem" }}>
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
