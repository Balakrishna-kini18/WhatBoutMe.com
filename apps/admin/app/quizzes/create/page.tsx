"use client";

import { useEffect, useState } from "react";
import styles from "../../page.module.css";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { API_URL, errorMessage } from "../../lib/api";
import { CustomSelect } from "../../components";

function QuizForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialProgramId = searchParams.get("programId") || "";
  const initialStepId = searchParams.get("stepId") || "";

  const [programs, setPrograms] = useState<any[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState(initialProgramId);
  const [steps, setSteps] = useState<any[]>([]);
  const [selectedStepId, setSelectedStepId] = useState(initialStepId);
  const [passMark, setPassMark] = useState(75);
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [cooldownHours, setCooldownHours] = useState(24);
  const [questionPoolSize, setQuestionPoolSize] = useState<number | "">("");
  const [questions, setQuestions] = useState([
    {
      text: "",
      options: [
        { text: "", isCorrect: true },
        { text: "", isCorrect: false },
      ],
    },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    fetchPrograms();
  }, []);

  const fetchPrograms = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/programs`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setPrograms(data);
      }
    } catch (e) {
      console.error("Failed to fetch programs", e);
    }
  };

  useEffect(() => {
    if (!selectedProgramId) {
      setSteps([]);
      setSelectedStepId("");
      return;
    }
    const fetchSteps = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_URL}/programs/${selectedProgramId}/steps`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          setSteps(data);
        }
      } catch (e) {
        console.error("Failed to fetch steps", e);
      }
    };
    fetchSteps();
  }, [selectedProgramId]);

  const addQuestion = () => {
    setQuestions([
      ...questions,
      {
        text: "",
        options: [
          { text: "", isCorrect: true },
          { text: "", isCorrect: false },
        ],
      },
    ]);
  };

  const updateQuestionText = (index: number, text: string) => {
    const newQ = [...questions];
    if (newQ[index]) newQ[index].text = text;
    setQuestions(newQ);
  };

  const addOption = (qIndex: number) => {
    const newQ = [...questions];
    if (newQ[qIndex]) newQ[qIndex].options.push({ text: "", isCorrect: false });
    setQuestions(newQ);
  };

  const removeOption = (qIndex: number, oIndex: number) => {
    const newQ = [...questions];
    if (newQ[qIndex] && newQ[qIndex].options.length > 2) {
      const removedWasCorrect = newQ[qIndex].options[oIndex]?.isCorrect;
      newQ[qIndex].options.splice(oIndex, 1);
      if (removedWasCorrect && newQ[qIndex].options[0]) {
        newQ[qIndex].options[0].isCorrect = true;
      }
      setQuestions(newQ);
    }
  };

  const updateOptionText = (qIndex: number, oIndex: number, text: string) => {
    const newQ = [...questions];
    if (newQ[qIndex] && newQ[qIndex].options[oIndex]) {
      newQ[qIndex].options[oIndex].text = text;
    }
    setQuestions(newQ);
  };

  const setCorrectOption = (qIndex: number, oIndex: number) => {
    const newQ = [...questions];
    if (newQ[qIndex]) {
      newQ[qIndex].options.forEach((o, i) => {
        o.isCorrect = i === oIndex;
      });
    }
    setQuestions(newQ);
  };

  const removeQuestion = (qIndex: number) => {
    const newQ = [...questions];
    newQ.splice(qIndex, 1);
    setQuestions(newQ);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStepId) {
      setFormError("Please select a curriculum step.");
      return;
    }
    if (isSubmitting) return;

    setFormError(null);
    setIsSubmitting(true);

    try {
      const token = localStorage.getItem("token");
      const quizPayload: any = {
        stepId: selectedStepId,
        passMark: Number(passMark),
        maxAttempts: Number(maxAttempts),
        cooldownHours: Number(cooldownHours),
      };
      if (questionPoolSize !== "") {
        quizPayload.questionCount = Number(questionPoolSize);
      }

      // 1. Create the Quiz entity
      const res = await fetch(`${API_URL}/quizzes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(quizPayload),
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to create quiz for this step"));
      }

      const createdQuiz = await res.json();

      // 2. Add authored questions to the quiz
      for (const q of questions) {
        if (!q.text.trim()) continue;
        const validOptions = q.options.filter((o) => o.text.trim().length > 0);
        if (validOptions.length < 2) continue;

        const qPayload = {
          text: q.text.trim(),
          points: 1,
          options: validOptions.map((o, idx) => ({
            text: o.text.trim(),
            isCorrect: o.isCorrect,
            order: idx + 1,
          })),
        };

        await fetch(`${API_URL}/quizzes/${createdQuiz.id}/questions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(qPayload),
        });
      }

      router.push(`/quizzes/${createdQuiz.id}/edit`);
    } catch (error: any) {
      setFormError(error.message || "Error creating quiz");
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.dashboard}>
      <div style={{ marginBottom: "0.25rem" }}>
        <Link href="/quizzes" className={styles.backLink}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>Back to Quizzes</span>
        </Link>
      </div>

      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Create Assessment (Quiz)</h1>
          <p className={styles.subtitle}>
            Build step knowledge checks with customizable passing criteria, cooldown timers, and question banks.
          </p>
        </div>
      </header>

      {formError && (
        <div className={styles.alertError}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{formError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className={styles.quizFormCard}>
        {/* SECTION 1: CURRICULUM TARGET */}
        <div style={{ marginBottom: "1.75rem" }}>
          <h2 className={styles.quizSectionTitle} style={{ marginBottom: "0.35rem" }}>Curriculum Target</h2>
          <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", margin: "0 0 1rem 0" }}>
            Assign this quiz to a specific program track and curriculum step.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
            <div className={styles.formGroup}>
              <label>Select Program <span style={{ color: "#ef4444" }}>*</span></label>
              <CustomSelect
                value={selectedProgramId}
                onChange={(val) => {
                  setSelectedProgramId(val);
                  setSelectedStepId("");
                }}
                fullWidth
                ariaLabel="Select Program"
                placeholder="Select a program..."
                options={programs.map((p) => ({
                  value: p.id,
                  label: p.title,
                }))}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Link to Step / Lesson <span style={{ color: "#ef4444" }}>*</span></label>
              <CustomSelect
                value={selectedStepId}
                onChange={setSelectedStepId}
                fullWidth
                ariaLabel="Link to Step or Lesson"
                placeholder={selectedProgramId ? "Select a step..." : "Select program first"}
                disabled={!selectedProgramId}
                options={steps.map((s) => ({
                  value: s.id,
                  label: `Step ${s.sequence}: ${s.title}`,
                }))}
              />
            </div>
          </div>
        </div>

        {/* SECTION 2: ASSESSMENT RULES */}
        <div style={{ marginBottom: "2rem", borderTop: "1px solid var(--border-light)", paddingTop: "1.5rem" }}>
          <h2 className={styles.quizSectionTitle} style={{ marginBottom: "0.35rem" }}>Assessment Rules</h2>
          <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", margin: "0 0 1rem 0" }}>
            Configure passing threshold, attempt limits, cooldown lockouts, and randomized pooling.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem" }}>
            <div className={styles.formGroup}>
              <label>Passing Score (%) <span style={{ color: "#ef4444" }}>*</span></label>
              <input
                type="number"
                min="1"
                max="100"
                value={passMark}
                onChange={(e) => setPassMark(parseInt(e.target.value, 10) || 75)}
                required
              />
            </div>
            <div className={styles.formGroup}>
              <label>Max Retries <span style={{ color: "#ef4444" }}>*</span></label>
              <input
                type="number"
                min="1"
                value={maxAttempts}
                onChange={(e) => setMaxAttempts(parseInt(e.target.value, 10) || 3)}
                required
              />
            </div>
            <div className={styles.formGroup}>
              <label>Cooldown (Hours) <span style={{ color: "#ef4444" }}>*</span></label>
              <input
                type="number"
                min="0"
                value={cooldownHours}
                onChange={(e) => setCooldownHours(parseInt(e.target.value, 10) || 0)}
                required
              />
            </div>
            <div className={styles.formGroup}>
              <label>Question Pool Size</label>
              <input
                type="number"
                min="1"
                placeholder="All questions"
                value={questionPoolSize}
                onChange={(e) => setQuestionPoolSize(e.target.value === "" ? "" : Number(e.target.value))}
              />
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
                Optional: Randomly sampled subset
              </span>
            </div>
          </div>
        </div>

        {/* SECTION 3: AUTHORED QUESTIONS */}
        <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <div>
              <h2 className={styles.quizSectionTitle} style={{ margin: 0 }}>Authored Questions</h2>
              <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", margin: "0.25rem 0 0 0" }}>
                Draft initial questions for the quiz pool. Radio buttons mark the correct answers.
              </p>
            </div>
          </div>

          {questions.map((q, qIdx) => (
            <div key={qIdx} className={styles.questionCard} style={{ marginTop: "1rem" }}>
              <div className={styles.questionHeader}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    background: "var(--accent-highlight)",
                    color: "var(--accent-primary)",
                    padding: "0.15rem 0.5rem",
                    borderRadius: "4px"
                  }}>
                    Q{qIdx + 1}
                  </span>
                  <h3 style={{ margin: 0 }}>Question Prompt</h3>
                </div>
                {questions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeQuestion(qIdx)}
                    className={styles.removeBtn}
                    aria-label={`Remove question ${qIdx + 1}`}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    <span>Remove Question</span>
                  </button>
                )}
              </div>

              <div className={styles.formGroup}>
                <input
                  type="text"
                  placeholder="Enter question prompt (e.g. Which tool fosters resilience in Step 3?)..."
                  value={q.text}
                  onChange={(e) => updateQuestionText(qIdx, e.target.value)}
                  required
                />
              </div>

              <div style={{ marginTop: "1.25rem" }}>
                <p
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: "var(--text-secondary)",
                    marginBottom: "0.5rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Answer Options (Select the correct option)
                </p>
                {q.options.map((opt, oIdx) => (
                  <div key={oIdx} className={styles.optionRow}>
                    <input
                      type="radio"
                      name={`correct_${qIdx}`}
                      checked={opt.isCorrect}
                      onChange={() => setCorrectOption(qIdx, oIdx)}
                      className={styles.optionRadio}
                      title="Mark as correct option"
                      aria-label={`Mark option ${oIdx + 1} as correct`}
                    />
                    <input
                      type="text"
                      placeholder={`Option ${oIdx + 1}`}
                      value={opt.text}
                      onChange={(e) => updateOptionText(qIdx, oIdx, e.target.value)}
                      className={styles.optionInput}
                      required
                    />
                    {q.options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeOption(qIdx, oIdx)}
                        className={styles.removeOptionBtn}
                        title="Remove option"
                        aria-label={`Remove option ${oIdx + 1}`}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addOption(qIdx)}
                  className={styles.addOptionBtn}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>Add Option</span>
                </button>
              </div>
            </div>
          ))}

          <button type="button" onClick={addQuestion} className={styles.dashedAddBtn}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Add New Question</span>
          </button>
        </div>

        <div className={styles.modalFooter} style={{ marginTop: "2.5rem", borderTop: "1px solid var(--border-light)", paddingTop: "1.25rem" }}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => router.push("/quizzes")}
          >
            Cancel
          </button>
          <button type="submit" className={styles.primaryBtn} disabled={isSubmitting}>
            {isSubmitting ? "Creating Quiz..." : "Save Assessment & Questions"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function CreateQuizPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <QuizForm />
    </Suspense>
  );
}
