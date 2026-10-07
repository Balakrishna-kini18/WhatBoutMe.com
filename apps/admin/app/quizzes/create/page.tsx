"use client";

import { useEffect, useState } from "react";
import styles from "../../page.module.css";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { API_URL, errorMessage } from "../../lib/api";

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
      <header className={styles.header}>
        <div className={styles.headerText}>
          <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
            <Link href="/quizzes" style={{ textDecoration: "none", color: "var(--primary)", fontSize: "1.2rem" }}>
              ← Back
            </Link>
            <h1 className={styles.title}>Create Assessment (Quiz)</h1>
          </div>
          <p className={styles.subtitle}>
            Build step knowledge checks with customizable passing criteria, cooldown timers, and question banks.
          </p>
        </div>
      </header>

      {formError && (
        <div style={{ backgroundColor: "#fef2f2", border: "1px solid #f87171", color: "#991b1b", padding: "12px 16px", borderRadius: "8px", marginBottom: "1.5rem" }}>
          ⚠️ {formError}
        </div>
      )}

      <form onSubmit={handleSubmit} className={styles.quizFormCard}>
        <div className={styles.formRow}>
          <div className={styles.formGroup} style={{ flex: 1.5 }}>
            <label>Select Program</label>
            <select
              value={selectedProgramId}
              onChange={(e) => {
                setSelectedProgramId(e.target.value);
                setSelectedStepId("");
              }}
              required
            >
              <option value="">Select a program...</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.formGroup} style={{ flex: 1.5 }}>
            <label>Link to Step / Lesson</label>
            <select
              value={selectedStepId}
              onChange={(e) => setSelectedStepId(e.target.value)}
              required
              disabled={!selectedProgramId}
            >
              <option value="">
                {selectedProgramId ? "Select a step..." : "Select program first"}
              </option>
              {steps.map((s) => (
                <option key={s.id} value={s.id}>
                  Step {s.sequence}: {s.title}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.formGroup} style={{ maxWidth: "160px" }}>
            <label>Passing Score (%)</label>
            <input
              type="number"
              min="1"
              max="100"
              value={passMark}
              onChange={(e) => setPassMark(parseInt(e.target.value, 10) || 75)}
              required
            />
          </div>
          <div className={styles.formGroup} style={{ maxWidth: "140px" }}>
            <label>Max Retries</label>
            <input
              type="number"
              min="1"
              value={maxAttempts}
              onChange={(e) => setMaxAttempts(parseInt(e.target.value, 10) || 3)}
              required
            />
          </div>
          <div className={styles.formGroup} style={{ maxWidth: "150px" }}>
            <label>Cooldown (Hours)</label>
            <input
              type="number"
              min="0"
              value={cooldownHours}
              onChange={(e) => setCooldownHours(parseInt(e.target.value, 10) || 0)}
              required
            />
          </div>
        </div>

        <div style={{ marginTop: "2.5rem" }}>
          <h2 className={styles.quizSectionTitle}>Initial Questions</h2>

          {questions.map((q, qIdx) => (
            <div key={qIdx} className={styles.questionCard}>
              <div className={styles.questionHeader}>
                <h3>Question {qIdx + 1}</h3>
                {questions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeQuestion(qIdx)}
                    className={styles.removeBtn}
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className={styles.formGroup}>
                <input
                  type="text"
                  placeholder="Enter question prompt..."
                  value={q.text}
                  onChange={(e) => updateQuestionText(qIdx, e.target.value)}
                  required
                />
              </div>

              <div style={{ marginTop: "1.5rem" }}>
                <p
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: "var(--text-secondary)",
                    marginBottom: "0.75rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Options (Radio marks correct answer)
                </p>
                {q.options.map((opt, oIdx) => (
                  <div key={oIdx} className={styles.optionRow}>
                    <input
                      type="radio"
                      name={`correct_${qIdx}`}
                      checked={opt.isCorrect}
                      onChange={() => setCorrectOption(qIdx, oIdx)}
                      className={styles.optionRadio}
                      title="Correct option"
                    />
                    <input
                      type="text"
                      placeholder={`Option ${oIdx + 1}`}
                      value={opt.text}
                      onChange={(e) => updateOptionText(qIdx, oIdx, e.target.value)}
                      className={styles.optionInput}
                      required
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addOption(qIdx)}
                  className={styles.addOptionBtn}
                >
                  + Add Option
                </button>
              </div>
            </div>
          ))}

          <button type="button" onClick={addQuestion} className={styles.dashedAddBtn}>
            + Add New Question
          </button>
        </div>

        <div className={styles.modalFooter} style={{ marginTop: "3rem" }}>
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
