"use client";

import React, { useState, useEffect } from "react";
import styles from "../curriculum.module.css";
import { API_URL } from "../../../lib/api";

interface Option {
  id?: string;
  text: string;
  isCorrect: boolean;
  order?: number;
}

interface Question {
  id: string;
  text: string;
  points?: number;
  explanation?: string | null;
  options: Option[];
}

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
  const [showExplanations, setShowExplanations] = useState(true);

  // Questions
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);

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

  // Load existing questions
  useEffect(() => {
    if (!quizId) return;

    const fetchQuestions = async () => {
      setIsLoadingQuestions(true);
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_URL}/quizzes/${quizId}/questions`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const qData = await res.json();
          setQuestions(qData);
        } else if (existingQuiz?.questions) {
          setQuestions(existingQuiz.questions);
        }
      } catch (err) {
        console.warn("Could not fetch quiz questions", err);
      } finally {
        setIsLoadingQuestions(false);
      }
    };

    fetchQuestions();
  }, [quizId, existingQuiz]);

  // Ensure quiz entity exists in backend
  const ensureQuizEntity = async (): Promise<string> => {
    if (quizId) return quizId;

    const token = localStorage.getItem("token");
    const res = await fetch(`${API_URL}/quizzes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        stepId: moduleId,
        title: quizTitle.trim() || `${moduleTitle} Knowledge Check`,
        passMark: Number(passMark) || 75,
        maxAttempts: Number(maxAttempts) || 3,
        cooldownHours: Number(cooldownHours) || 24,
      }),
    });

    if (!res.ok) throw new Error("Failed to initialize quiz in backend");
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
    if (newPrompt.trim().length < 3) return;

    const validOpts = newOptions.filter((o) => o.text.trim().length > 0);
    if (validOpts.length < 2) {
      alert("At least 2 choices are required.");
      return;
    }
    if (!validOpts.some((o) => o.isCorrect)) {
      alert("Please designate at least one option as the correct answer.");
      return;
    }

    setIsAddingQuestion(true);
    try {
      const activeQId = await ensureQuizEntity();
      const token = localStorage.getItem("token");

      const res = await fetch(`${API_URL}/quizzes/${activeQId}/questions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          text: newPrompt.trim(),
          points: Number(newPoints) || 1,
          explanation: newExplanation.trim() || undefined,
          options: validOpts.map((o, idx) => ({
            text: o.text.trim(),
            isCorrect: o.isCorrect,
            order: idx + 1,
          })),
        }),
      });

      if (!res.ok) throw new Error("Failed to add question");

      const createdQ = await res.json();
      setQuestions((prev) => [...prev, createdQ]);
      setNewPrompt("");
      setNewExplanation("");
      setNewOptions([
        { text: "", isCorrect: true },
        { text: "", isCorrect: false },
        { text: "", isCorrect: false },
      ]);
      setFeedbackMsg("Question added successfully");
      setTimeout(() => setFeedbackMsg(null), 2500);
    } catch (err: any) {
      alert(err.message || "Failed to append question");
    } finally {
      setIsAddingQuestion(false);
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!quizId || !confirm("Delete this question?")) return;
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/quizzes/${quizId}/questions/${questionId}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        setQuestions((prev) => prev.filter((q) => q.id !== questionId));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveAll = async () => {
    setIsSavingAll(true);
    try {
      const activeQId = await ensureQuizEntity();
      const token = localStorage.getItem("token");

      // Update quiz parameters
      await fetch(`${API_URL}/quizzes/${activeQId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title: quizTitle.trim(),
          passMark: Number(passMark),
          maxAttempts: Number(maxAttempts),
          cooldownHours: Number(cooldownHours),
        }),
      });

      onQuizSaved();
    } catch (err: any) {
      alert(err.message || "Failed to update quiz settings");
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

      {/* Question Types Pill Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0 }}>
          Questions ({questions.length})
        </h3>

        <div className={styles.questionTypePillBar} style={{ margin: 0 }}>
          <span className={styles.questionTypePill}>+ Multiple Choice</span>
          <span className={styles.questionTypePill}>+ Multiple Select</span>
          <span className={styles.questionTypePill}>+ True/False</span>
          <span className={styles.questionTypePill}>+ Code Question</span>
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
                  Question {idx + 1} &bull; {q.points || 1} Pt
                </span>
                <button
                  type="button"
                  onClick={() => handleDeleteQuestion(q.id)}
                  className={styles.deleteItemBtn}
                >
                  Delete
                </button>
              </div>

              <h4 style={{ margin: "0 0 1rem", fontSize: "1rem", fontWeight: 700 }}>{q.text}</h4>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "0.75rem" }}>
                {q.options?.map((opt, oIdx) => (
                  <div key={oIdx} className={styles.optionItemRow}>
                    <input
                      type="radio"
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
        <h4 style={{ margin: "0 0 1.25rem", fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>
          + Add New Question
        </h4>

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
            placeholder="e.g. Which hook is optimal for memoizing complex computational values in React?"
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            className={styles.formTextarea}
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Answer Options (Select the correct radio choice)</label>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {newOptions.map((opt, idx) => (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
                <input
                  type="text"
                  required
                  placeholder={`Choice ${idx + 1}`}
                  value={opt.text}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewOptions((prev) =>
                      prev.map((o, i) => (i === idx ? { ...o, text: val } : o))
                    );
                  }}
                  className={styles.formInput}
                  style={{ flex: 1 }}
                />
                {newOptions.length > 2 && (
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

          <button
            type="button"
            onClick={handleAddChoice}
            className={styles.secondaryActionBtn}
            style={{ marginTop: "0.75rem", fontSize: "0.8rem" }}
          >
            + Add Another Option
          </button>
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
    </section>
  );
}
