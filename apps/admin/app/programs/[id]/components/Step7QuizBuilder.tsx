"use client";

import React, { useState, useEffect } from "react";
import styles from "../curriculum.module.css";
import { API_URL, cachedFetch, errorMessage } from "../../../lib/api";
import { ConfirmDialog, useToast } from "../../../components";

interface Option {
  id?: string;
  text: string;
  isCorrect: boolean;
  order?: number;
}

interface Question {
  id: string;
  type?: string;
  text: string;
  points?: number;
  explanation?: string | null;
  options: Option[];
}

export type QuestionKind = 'MULTIPLE_CHOICE' | 'MULTI_SELECT' | 'TRUE_FALSE' | 'CODE';

interface Step7QuizBuilderProps {
  moduleId: string;
  moduleTitle: string;
  existingQuiz?: any | null;
  onBackToModule: () => void;
  onQuizSaved: () => void;
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
  const [showExplanations, setShowExplanations] = useState(true);
  const toast = useToast();

  // Questions
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionToDelete, setQuestionToDelete] = useState<Question | null>(null);
  const [isDeletingQuestion, setIsDeletingQuestion] = useState(false);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);

  // Question Type selection
  const [selectedKind, setSelectedKind] = useState<QuestionKind>('MULTIPLE_CHOICE');
  const [codeSnippet, setCodeSnippet] = useState("");

  // New Question Form State
  const [newPrompt, setNewPrompt] = useState("");
  const [newPoints, setNewPoints] = useState(1);
  const [newExplanation, setNewExplanation] = useState("");
  const [newOptions, setNewOptions] = useState<Option[]>([
    { text: "", isCorrect: true },
    { text: "", isCorrect: false },
    { text: "", isCorrect: false },
  ]);
  const [isAddingQuestion, setIsAddingQuestion] = useState(false);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const handleSelectKind = (kind: QuestionKind) => {
    setSelectedKind(kind);
    if (kind === 'TRUE_FALSE') {
      setNewOptions([
        { text: 'True', isCorrect: true },
        { text: 'False', isCorrect: false },
      ]);
    } else if (kind === 'CODE') {
      if (newOptions.length < 2) {
        setNewOptions([
          { text: '', isCorrect: true },
          { text: '', isCorrect: false },
        ]);
      }
    } else {
      if (newOptions.length < 3) {
        setNewOptions([
          { text: '', isCorrect: true },
          { text: '', isCorrect: false },
          { text: '', isCorrect: false },
        ]);
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

  const handleAddChoice = () => {
    setNewOptions((prev) => [...prev, { text: "", isCorrect: false }]);
  };

  const handleRemoveChoice = (idx: number) => {
    if (newOptions.length <= 2) return;
    setNewOptions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPrompt.trim().length < 3) {
      toast.error("Please enter a question prompt (at least 3 characters).");
      return;
    }

    if (selectedKind === 'CODE' && !codeSnippet.trim()) {
      toast.error("Please enter a code snippet for the code question.");
      return;
    }

    const validOpts = newOptions.filter((o) => o.text.trim().length > 0);
    if (validOpts.length < 2) {
      toast.error("At least 2 choices are required.");
      return;
    }
    if (!validOpts.some((o) => o.isCorrect)) {
      toast.error("Please designate at least one option as the correct answer.");
      return;
    }

    if (selectedKind !== 'MULTI_SELECT') {
      const correctCount = validOpts.filter((o) => o.isCorrect).length;
      if (correctCount > 1) {
        toast.error("Single choice questions must have only one correct answer.");
        return;
      }
    }

    setIsAddingQuestion(true);
    try {
      const activeQId = await ensureQuizEntity();

      let textToSend = newPrompt.trim();
      if (selectedKind === 'CODE' && codeSnippet.trim()) {
        textToSend = `${textToSend}\n\n\`\`\`javascript\n${codeSnippet.trim()}\n\`\`\``;
      }

      const qType = selectedKind === 'MULTI_SELECT' ? 'MULTI_SELECT' : 'MULTIPLE_CHOICE';

      const res = await cachedFetch(`${API_URL}/quizzes/${activeQId}/questions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: textToSend,
          type: qType,
          points: Number(newPoints) || 1,
          explanation: newExplanation.trim() || undefined,
          options: validOpts.map((o, idx) => ({
            text: o.text.trim(),
            isCorrect: o.isCorrect,
            order: idx + 1,
          })),
        }),
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to add question"));
      }

      const createdQ = await res.json();
      setQuestions((prev) => [...prev, createdQ]);
      setNewPrompt("");
      setCodeSnippet("");
      setNewExplanation("");
      if (selectedKind === 'TRUE_FALSE') {
        setNewOptions([
          { text: "True", isCorrect: true },
          { text: "False", isCorrect: false },
        ]);
      } else {
        setNewOptions([
          { text: "", isCorrect: true },
          { text: "", isCorrect: false },
          { text: "", isCorrect: false },
        ]);
      }
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
      setQuestions((prev) => prev.filter((q) => q.id !== qId));
      setQuestionToDelete(null);

      await cachedFetch(`${API_URL}/quizzes/questions/${qId}`, {
        method: "DELETE",
      });
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

      // Update quiz parameters
      const res = await cachedFetch(`${API_URL}/quizzes/${activeQId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: quizTitle.trim(),
          passMark: Number(passMark),
          maxAttempts: Number(maxAttempts),
          cooldownHours: Number(cooldownHours),
          quizPlacement,
        }),
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to update quiz settings"));
      }

      toast.success("Quiz settings updated.");
      onQuizSaved();
    } catch (err: any) {
      toast.error(err.message || "Failed to update quiz settings");
    } finally {
      setIsSavingAll(false);
    }
  };

  return (
    <section className={styles.cardSurface}>
      {/* Header */}
      <div className={styles.cardHeaderArea}>
        <div className={styles.stepEyebrow}>STEP 7: QUIZ BUILDER</div>
        <h2 className={styles.stepTitle}>Create Quiz for {moduleTitle}</h2>
        <p className={styles.stepSubtitle}>
          Configure pass criteria and build interactive questions to validate student comprehension.
        </p>
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
            onClick={() => handleSelectKind('MULTIPLE_CHOICE')}
            className={`${styles.questionTypePill} ${selectedKind === 'MULTIPLE_CHOICE' ? styles.questionTypePillActive : ''}`}
            aria-pressed={selectedKind === 'MULTIPLE_CHOICE'}
          >
            + Multiple Choice
          </button>
          <button
            type="button"
            onClick={() => handleSelectKind('MULTI_SELECT')}
            className={`${styles.questionTypePill} ${selectedKind === 'MULTI_SELECT' ? styles.questionTypePillActive : ''}`}
            aria-pressed={selectedKind === 'MULTI_SELECT'}
          >
            + Multiple Select
          </button>
          <button
            type="button"
            onClick={() => handleSelectKind('TRUE_FALSE')}
            className={`${styles.questionTypePill} ${selectedKind === 'TRUE_FALSE' ? styles.questionTypePillActive : ''}`}
            aria-pressed={selectedKind === 'TRUE_FALSE'}
          >
            + True/False
          </button>
          <button
            type="button"
            onClick={() => handleSelectKind('CODE')}
            className={`${styles.questionTypePill} ${selectedKind === 'CODE' ? styles.questionTypePillActive : ''}`}
            aria-pressed={selectedKind === 'CODE'}
          >
            + Code Question
          </button>
        </div>
      </div>

      {/* List of Created Questions */}
      {isLoadingQuestions ? (
        <div className="skeleton" style={{ height: 120, borderRadius: 12, marginBottom: "1.5rem" }} />
      ) : questions.length === 0 ? (
        <div style={{ textAlign: "center", padding: "2.5rem 1rem", background: "var(--bg-soft)", borderRadius: 12, marginBottom: "2rem" }}>
          <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.92rem" }}>
            No questions added yet. Use the question builder card below to create your first question!
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "2rem" }}>
          {questions.map((q, idx) => (
            <div key={q.id} className={styles.questionCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <span style={{ fontSize: "0.8rem", fontWeight: 800, color: "var(--accent-primary)", background: "var(--accent-highlight)", padding: "2px 8px", borderRadius: 4 }}>
                  Question {idx + 1} &bull; {q.points || 1} Pt {q.type === 'MULTI_SELECT' ? '• Multi-Select' : ''}
                </span>
                <button
                  type="button"
                  onClick={() => setQuestionToDelete(q)}
                  className={styles.deleteItemBtn}
                >
                  Delete
                </button>
              </div>

              <h4 style={{ margin: "0 0 1rem", fontSize: "1rem", fontWeight: 700, whiteSpace: "pre-wrap" }}>{q.text}</h4>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "0.75rem" }}>
                {q.options?.map((opt, oIdx) => (
                  <div key={oIdx} className={styles.optionItemRow}>
                    <input
                      type={q.type === 'MULTI_SELECT' ? 'checkbox' : 'radio'}
                      checked={opt.isCorrect}
                      readOnly
                      className={styles.correctRadio}
                    />
                    <span style={{ fontSize: "0.88rem", fontWeight: opt.isCorrect ? 700 : 400, color: opt.isCorrect ? "#15803d" : "inherit", display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <span>{opt.text}</span>
                      {opt.isCorrect && (
                        <span style={{ fontSize: "0.75rem", background: "#dcfce7", color: "#15803d", padding: "1px 6px", borderRadius: 4, display: "inline-flex", alignItems: "center", gap: 3 }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          Correct
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>

              {q.explanation && (
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", background: "var(--bg-soft)", padding: "6px 10px", borderRadius: 6 }}>
                  <strong>Explanation:</strong> {q.explanation}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Question Subform */}
      <form onSubmit={handleCreateQuestion} style={{ border: "2px dashed var(--border-light)", padding: "1.75rem", borderRadius: 16, background: "#ffffff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <h4 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>
            + Add New {selectedKind === 'MULTIPLE_CHOICE' ? 'Multiple Choice Question' : selectedKind === 'MULTI_SELECT' ? 'Multiple Select Question' : selectedKind === 'TRUE_FALSE' ? 'True / False Question' : 'Code Question'}
          </h4>
          <span style={{ fontSize: "0.8rem", color: "var(--accent-primary)", background: "var(--accent-highlight)", padding: "2px 8px", borderRadius: 4, fontWeight: 700 }}>
            {selectedKind === 'MULTIPLE_CHOICE' ? 'Single Answer' : selectedKind === 'MULTI_SELECT' ? 'Select All That Apply' : selectedKind === 'TRUE_FALSE' ? 'Binary Choice' : 'Code Snippet'}
          </span>
        </div>

        {feedbackMsg && (
          <div style={{ color: "#15803d", fontWeight: 700, fontSize: "0.85rem", marginBottom: "1rem" }}>
            {feedbackMsg}
          </div>
        )}

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Question Prompt</label>
          <textarea
            rows={2}
            required
            placeholder={
              selectedKind === 'MULTIPLE_CHOICE'
                ? "e.g. Which hook is optimal for memoizing complex computational values in React?"
                : selectedKind === 'MULTI_SELECT'
                ? "e.g. Which of the following are valid React 19 hooks? (Select all that apply)"
                : selectedKind === 'TRUE_FALSE'
                ? "e.g. In JavaScript, primitive values like numbers and strings are immutable."
                : "e.g. What will be the console output when this snippet is executed?"
            }
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            className={styles.formTextarea}
          />
        </div>

        {selectedKind === 'CODE' && (
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>
              <span>Code Snippet</span>
              <span className={styles.formLabelOptional}>Formatted monospaced block</span>
            </label>
            <textarea
              rows={4}
              required
              placeholder={`function checkScope() {\n  var a = 10;\n  let b = 20;\n  console.log(a + b);\n}\ncheckScope();`}
              value={codeSnippet}
              onChange={(e) => setCodeSnippet(e.target.value)}
              className={styles.codeSnippetInput}
            />
          </div>
        )}

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>
            <span>
              {selectedKind === 'MULTI_SELECT'
                ? "Answer Options (Check ALL choices that are correct)"
                : selectedKind === 'TRUE_FALSE'
                ? "Answer Options (Designate whether True or False is the correct answer)"
                : "Answer Options (Designate the single correct choice)"}
            </span>
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {newOptions.map((opt, idx) => (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {selectedKind === 'MULTI_SELECT' ? (
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
                    name="correct_choice_radio"
                    checked={opt.isCorrect}
                    onChange={() => {
                      setNewOptions((prev) =>
                        prev.map((o, i) => ({ ...o, isCorrect: i === idx }))
                      );
                    }}
                    className={styles.correctRadio}
                    title="Mark as correct answer"
                  />
                )}
                <input
                  type="text"
                  required
                  readOnly={selectedKind === 'TRUE_FALSE'}
                  placeholder={`Choice ${idx + 1}`}
                  value={opt.text}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewOptions((prev) =>
                      prev.map((o, i) => (i === idx ? { ...o, text: val } : o))
                    );
                  }}
                  className={styles.formInput}
                  style={{ flex: 1, ...(selectedKind === 'TRUE_FALSE' ? { background: '#f5f0e8', fontWeight: 600 } : {}) }}
                />
                {selectedKind !== 'TRUE_FALSE' && newOptions.length > 2 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveChoice(idx)}
                    className={styles.deleteItemBtn}
                    title="Remove choice"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>

          {selectedKind !== 'TRUE_FALSE' && (
            <button
              type="button"
              onClick={handleAddChoice}
              className={styles.secondaryActionBtn}
              style={{ marginTop: "0.75rem", fontSize: "0.8rem" }}
            >
              + Add Another Option
            </button>
          )}
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Explanation / Solution Guidance (Shown after submission)</label>
          <input
            type="text"
            placeholder="e.g. useMemo caches the result between re-renders until dependencies change."
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
    </section>
  );
}
