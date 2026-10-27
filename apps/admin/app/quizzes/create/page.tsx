"use client";

import { useEffect, useState, useRef } from "react";
import styles from "../../page.module.css";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { API_URL, errorMessage, uploadFile } from "../../lib/api";
import { CustomSelect } from "../../components";
import MarkdownQuestionImportModal from "../../programs/[id]/components/MarkdownQuestionImportModal";
import { ParsedMarkdownQuestion } from "../../lib/markdown-question-parser";

interface OptionFormItem {
  text: string;
  imageUrl?: string;
  isCorrect: boolean;
}

interface QuestionFormItem {
  text: string;
  type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TEXT_BOX";
  imageUrl?: string;
  gradingMode: "SELF_REFLECTION_AUTO_PASS" | "MANUAL_REVIEW";
  minCharacters: number;
  options: OptionFormItem[];
}

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

  // Default 4 choices per question (expandable 2..8)
  const [questions, setQuestions] = useState<QuestionFormItem[]>([
    {
      text: "",
      type: "SINGLE_CHOICE",
      imageUrl: "",
      gradingMode: "SELF_REFLECTION_AUTO_PASS",
      minCharacters: 10,
      options: [
        { text: "", imageUrl: "", isCorrect: true },
        { text: "", imageUrl: "", isCorrect: false },
        { text: "", imageUrl: "", isCorrect: false },
        { text: "", imageUrl: "", isCorrect: false },
      ],
    },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isMarkdownModalOpen, setIsMarkdownModalOpen] = useState(false);

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
        type: "SINGLE_CHOICE",
        imageUrl: "",
        gradingMode: "SELF_REFLECTION_AUTO_PASS",
        minCharacters: 10,
        options: [
          { text: "", imageUrl: "", isCorrect: true },
          { text: "", imageUrl: "", isCorrect: false },
          { text: "", imageUrl: "", isCorrect: false },
          { text: "", imageUrl: "", isCorrect: false },
        ],
      },
    ]);
  };

  const removeQuestion = (qIndex: number) => {
    const newQ = [...questions];
    newQ.splice(qIndex, 1);
    setQuestions(newQ);
  };

  const updateQuestionText = (index: number, text: string) => {
    const newQ = [...questions];
    if (newQ[index]) newQ[index].text = text;
    setQuestions(newQ);
  };

  const updateQuestionType = (index: number, type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TEXT_BOX") => {
    const newQ = [...questions];
    const target = newQ[index];
    if (!target) return;
    target.type = type;

    // Ensure options array exists and has at least 4 options if choice type
    if (type !== "TEXT_BOX") {
      if (!target.options || target.options.length < 2) {
        target.options = [
          { text: "", imageUrl: "", isCorrect: true },
          { text: "", imageUrl: "", isCorrect: false },
          { text: "", imageUrl: "", isCorrect: false },
          { text: "", imageUrl: "", isCorrect: false },
        ];
      } else if (!target.options.some((o) => o.isCorrect)) {
        if (target.options[0]) target.options[0].isCorrect = true;
      }
      if (type === "SINGLE_CHOICE") {
        // Enforce only one correct
        let found = false;
        target.options.forEach((o) => {
          if (o.isCorrect && !found) {
            found = true;
          } else {
            o.isCorrect = false;
          }
        });
        if (!found && target.options[0]) target.options[0].isCorrect = true;
      }
    }
    setQuestions(newQ);
  };

  const handlePromptImageUpload = async (index: number, file: File) => {
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
      const newQ = [...questions];
      if (newQ[index]) newQ[index].imageUrl = url;
      setQuestions(newQ);
    } catch (err: any) {
      setFormError("Failed to upload prompt image: " + (err.message || "Unknown error"));
    }
  };

  const removePromptImage = (index: number) => {
    const newQ = [...questions];
    if (newQ[index]) newQ[index].imageUrl = "";
    setQuestions(newQ);
  };

  const addOption = (qIndex: number) => {
    const newQ = [...questions];
    if (newQ[qIndex] && newQ[qIndex].options.length < 8) {
      newQ[qIndex].options.push({ text: "", imageUrl: "", isCorrect: false });
      setQuestions(newQ);
    }
  };

  const removeOption = (qIndex: number, oIndex: number) => {
    const newQ = [...questions];
    if (newQ[qIndex] && newQ[qIndex].options.length > 2) {
      const removedWasCorrect = newQ[qIndex].options[oIndex]?.isCorrect;
      newQ[qIndex].options.splice(oIndex, 1);
      if (removedWasCorrect && !newQ[qIndex].options.some((o) => o.isCorrect)) {
        if (newQ[qIndex].options[0]) newQ[qIndex].options[0].isCorrect = true;
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

  const handleOptionImageUpload = async (qIndex: number, oIndex: number, file: File) => {
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
      const newQ = [...questions];
      if (newQ[qIndex] && newQ[qIndex].options[oIndex]) {
        newQ[qIndex].options[oIndex].imageUrl = url;
      }
      setQuestions(newQ);
    } catch (err: any) {
      setFormError("Failed to upload choice image: " + (err.message || "Unknown error"));
    }
  };

  const removeOptionImage = (qIndex: number, oIndex: number) => {
    const newQ = [...questions];
    if (newQ[qIndex] && newQ[qIndex].options[oIndex]) {
      newQ[qIndex].options[oIndex].imageUrl = "";
    }
    setQuestions(newQ);
  };

  const toggleOptionCorrect = (qIndex: number, oIndex: number) => {
    const newQ = [...questions];
    const q = newQ[qIndex];
    if (!q) return;

    if (q.type === "SINGLE_CHOICE") {
      q.options.forEach((o, i) => {
        o.isCorrect = i === oIndex;
      });
    } else if (q.type === "MULTIPLE_CHOICE") {
      if (q.options[oIndex]) {
        q.options[oIndex].isCorrect = !q.options[oIndex].isCorrect;
      }
    }
    setQuestions(newQ);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStepId) {
      setFormError("Please select a curriculum step.");
      return;
    }
    if (isSubmitting) return;

    // Validate each question
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q) continue;
      if (!q.text.trim()) {
        setFormError(`Question ${i + 1} is missing question prompt text.`);
        return;
      }
      if (q.type !== "TEXT_BOX") {
        const validOptions = q.options.filter((o) => o.text.trim().length > 0 || Boolean(o.imageUrl));
        if (validOptions.length < 2) {
          setFormError(`Question ${i + 1} (${q.type === "SINGLE_CHOICE" ? "Single Choice" : "Multiple Choice"}) requires at least 2 non-empty options.`);
          return;
        }
        if (!validOptions.some((o) => o.isCorrect)) {
          setFormError(`Question ${i + 1} must have at least one option designated as correct.`);
          return;
        }
      }
    }

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

        const isText = q.type === "TEXT_BOX";
        const backendType =
          q.type === "TEXT_BOX"
            ? "SHORT_ANSWER"
            : q.type === "MULTIPLE_CHOICE"
            ? "MULTI_SELECT"
            : "MULTIPLE_CHOICE";

        const validOptions = isText
          ? []
          : q.options
              .filter((o) => o.text.trim().length > 0 || Boolean(o.imageUrl))
              .map((o, idx) => ({
                text: o.text.trim() || `Option ${idx + 1}`,
                imageUrl: o.imageUrl?.trim() || undefined,
                isCorrect: o.isCorrect,
                order: idx + 1,
              }));

        const qPayload: any = {
          text: q.text.trim(),
          type: backendType,
          imageUrl: q.imageUrl?.trim() || undefined,
          points: 1,
          gradingMode: q.gradingMode,
          minCharacters: q.minCharacters,
          options: isText ? undefined : validOptions,
        };

        const qRes = await fetch(`${API_URL}/quizzes/${createdQuiz.id}/questions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(qPayload),
        });

        if (!qRes.ok) {
          throw new Error(await errorMessage(qRes, "Failed to add question to quiz"));
        }
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
          <h1 className={styles.title}>Create Visual Assessment (Quiz)</h1>
          {/* <p className={styles.subtitle}>
            Build Google-Forms-style visual quizzes with prompt and choice image uploads, 3 answer formats, and passing criteria.
          </p> */}
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.75rem" }}>
            <div>
              <h2 className={styles.quizSectionTitle} style={{ margin: 0 }}>Visual Question Bank</h2>
              <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", margin: "0.25rem 0 0 0" }}>
                Attach images to questions or choices, choose answer format, or bulk upload a <code>.md</code> question file.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsMarkdownModalOpen(true)}
              style={{
                padding: "0.55rem 1rem",
                borderRadius: 8,
                border: "1px solid #14110f",
                background: "#14110f",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: "0.82rem",
                cursor: "pointer",
              }}
            >
              📤 Upload .md Questions
            </button>
          </div>

          {questions.map((q, qIdx) => {
            const isText = q.type === "TEXT_BOX";
            const isMulti = q.type === "MULTIPLE_CHOICE";
            const hasOptionImages = !isText && q.options.some((opt) => Boolean(opt.imageUrl));

            return (
              <div key={qIdx} className={styles.questionCard} style={{ marginTop: "1rem", padding: "1.25rem" }}>
                <div className={styles.questionHeader} style={{ marginBottom: "1rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
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
                    <h3 style={{ margin: 0, fontSize: "1.05rem" }}>Question Card</h3>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    {/* Question Type Selector */}
                    <div style={{ display: "flex", alignItems: "center", gap: "4px", background: "#f8fafc", padding: "3px 6px", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                      <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>Type:</span>
                      <select
                        value={q.type}
                        onChange={(e) => updateQuestionType(qIdx, e.target.value as any)}
                        style={{
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          padding: "3px 6px",
                          borderRadius: 6,
                          border: "1px solid #cbd5e1",
                          background: "#ffffff",
                          cursor: "pointer",
                        }}
                      >
                        <option value="SINGLE_CHOICE">Single Choice (Radio)</option>
                        <option value="MULTIPLE_CHOICE">Multiple Choice (Checkboxes)</option>
                        <option value="TEXT_BOX">Text Box (Written Reflection)</option>
                      </select>
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
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Prompt Text Input */}
                <div className={styles.formGroup} style={{ marginBottom: "1rem" }}>
                  <input
                    type="text"
                    placeholder="Enter question prompt (e.g. Which tool fosters resilience in Step 3?)..."
                    value={q.text}
                    onChange={(e) => updateQuestionText(qIdx, e.target.value)}
                    required
                  />
                </div>

                {/* Prompt Image Upload & Preview */}
                <div style={{ marginBottom: "1.25rem", background: "#f8fafc", padding: "10px 14px", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                      Question Prompt Visual (PNG/JPEG)
                    </label>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp"
                        id={`q_prompt_img_${qIdx}`}
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handlePromptImageUpload(qIdx, file);
                        }}
                      />
                      <label
                        htmlFor={`q_prompt_img_${qIdx}`}
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          padding: "4px 10px",
                          borderRadius: 6,
                          background: "#ffffff",
                          border: "1px solid #cbd5e1",
                          cursor: "pointer",
                          color: "var(--accent-primary, #0284c7)",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        {q.imageUrl ? "Replace Image" : "+ Attach Image"}
                      </label>
                      {q.imageUrl && (
                        <button
                          type="button"
                          onClick={() => removePromptImage(qIdx)}
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            padding: "4px 8px",
                            borderRadius: 6,
                            background: "#fee2e2",
                            border: "1px solid #fca5a5",
                            color: "#b91c1c",
                            cursor: "pointer",
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>

                  {q.imageUrl && (
                    <div style={{ marginTop: 8, borderRadius: 6, overflow: "hidden", maxHeight: 180, background: "#ffffff", border: "1px solid #cbd5e1" }}>
                      <img
                        src={q.imageUrl}
                        alt="Question visual preview"
                        style={{ width: "100%", maxHeight: 180, objectFit: "contain", display: "block" }}
                      />
                    </div>
                  )}
                </div>

                {/* Question Type: TEXT_BOX Config */}
                {isText ? (
                  <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "14px", borderRadius: 8, marginBottom: "1rem" }}>
                    <h4 style={{ margin: "0 0 8px", fontSize: "0.88rem", color: "#166534" }}>
                      Open-Ended Written Reflection Configuration
                    </h4>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                      <div>
                        <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "#15803d", display: "block", marginBottom: 4 }}>
                          Grading Mode
                        </label>
                        <select
                          value={q.gradingMode}
                          onChange={(e) => {
                            const newQ = [...questions];
                            if (newQ[qIdx]) newQ[qIdx].gradingMode = e.target.value as any;
                            setQuestions(newQ);
                          }}
                          style={{
                            width: "100%",
                            padding: "6px 8px",
                            borderRadius: 6,
                            border: "1px solid #86efac",
                            fontSize: "0.85rem",
                            background: "#ffffff",
                          }}
                        >
                          <option value="SELF_REFLECTION_AUTO_PASS">
                            Mode A: Self-Reflection Auto-Pass (Recommended)
                          </option>
                          <option value="MANUAL_REVIEW">
                            Mode B: Manual Staff Review Queue
                          </option>
                        </select>
                      </div>

                      <div>
                        <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "#15803d", display: "block", marginBottom: 4 }}>
                          Minimum Characters Required
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={q.minCharacters}
                          onChange={(e) => {
                            const newQ = [...questions];
                            if (newQ[qIdx]) newQ[qIdx].minCharacters = parseInt(e.target.value, 10) || 10;
                            setQuestions(newQ);
                          }}
                          style={{
                            width: "100%",
                            padding: "6px 8px",
                            borderRadius: 6,
                            border: "1px solid #86efac",
                            fontSize: "0.85rem",
                            background: "#ffffff",
                          }}
                        />
                      </div>
                    </div>
                    <p style={{ margin: "8px 0 0", fontSize: "0.78rem", color: "#166534" }}>
                      Learners must write at least {q.minCharacters} characters. In Auto-Pass mode, learners receive immediate credit so step progression is not blocked.
                    </p>
                  </div>
                ) : (
                  /* Question Type: SINGLE_CHOICE or MULTIPLE_CHOICE Choices */
                  <div style={{ marginTop: "1.25rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                      <p
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          color: "var(--text-secondary)",
                          margin: 0,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {isMulti
                          ? "Answer Choices (Checkboxes mark all correct answers)"
                          : "Answer Choices (Radio marks the single correct answer)"}
                      </p>
                      <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                        {q.options.length} / 8 choices (min 2, default 4)
                      </span>
                    </div>

                    <div
                      style={
                        hasOptionImages
                          ? {
                              display: "grid",
                              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                              gap: "10px",
                              marginBottom: "10px",
                            }
                          : {
                              display: "flex",
                              flexDirection: "column",
                              gap: "8px",
                              marginBottom: "10px",
                            }
                      }
                    >
                      {q.options.map((opt, oIdx) => (
                        <div
                          key={oIdx}
                          style={{
                            border: opt.isCorrect ? "2px solid var(--accent-primary, #0284c7)" : "1px solid var(--border-light, #e2e8f0)",
                            borderRadius: 8,
                            padding: "8px 10px",
                            background: opt.isCorrect ? "rgba(2, 132, 199, 0.04)" : "#ffffff",
                            display: "flex",
                            flexDirection: hasOptionImages ? "column" : "row",
                            alignItems: hasOptionImages ? "stretch" : "center",
                            gap: 8,
                          }}
                        >
                          {/* Option Image Upload / Preview */}
                          {opt.imageUrl ? (
                            <div style={{ position: "relative", height: 110, borderRadius: 6, overflow: "hidden", background: "#f1f5f9", marginBottom: 6 }}>
                              <img
                                src={opt.imageUrl}
                                alt={`Option ${oIdx + 1} visual`}
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              />
                              <button
                                type="button"
                                onClick={() => removeOptionImage(qIdx, oIdx)}
                                style={{
                                  position: "absolute",
                                  top: 4,
                                  right: 4,
                                  background: "rgba(0,0,0,0.6)",
                                  color: "#ffffff",
                                  border: "none",
                                  borderRadius: 4,
                                  padding: "2px 6px",
                                  fontSize: "0.7rem",
                                  cursor: "pointer",
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: "flex", alignItems: "center" }}>
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/jpg,image/webp"
                                id={`opt_img_${qIdx}_${oIdx}`}
                                style={{ display: "none" }}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleOptionImageUpload(qIdx, oIdx, file);
                                }}
                              />
                              <label
                                htmlFor={`opt_img_${qIdx}_${oIdx}`}
                                title="Upload visual image for this option"
                                style={{
                                  fontSize: "0.72rem",
                                  padding: "3px 6px",
                                  borderRadius: 4,
                                  background: "#f1f5f9",
                                  border: "1px solid #cbd5e1",
                                  cursor: "pointer",
                                  color: "#475569",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                +Img
                              </label>
                            </div>
                          )}

                          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                            <input
                              type={isMulti ? "checkbox" : "radio"}
                              name={`correct_${qIdx}`}
                              checked={opt.isCorrect}
                              onChange={() => toggleOptionCorrect(qIdx, oIdx)}
                              className={styles.optionRadio}
                              title="Mark as correct answer"
                              aria-label={`Mark option ${oIdx + 1} as correct`}
                              style={{ cursor: "pointer" }}
                            />
                            <input
                              type="text"
                              placeholder={`Option ${oIdx + 1} text...`}
                              value={opt.text}
                              onChange={(e) => updateOptionText(qIdx, oIdx, e.target.value)}
                              className={styles.optionInput}
                              style={{ flex: 1 }}
                              required={!opt.imageUrl}
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
                        </div>
                      ))}
                    </div>

                    {q.options.length < 8 && (
                      <button
                        type="button"
                        onClick={() => addOption(qIdx)}
                        className={styles.addOptionBtn}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        <span>Add Option ({q.options.length}/8)</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <button type="button" onClick={addQuestion} className={styles.dashedAddBtn} style={{ marginTop: "1rem" }}>
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

      <MarkdownQuestionImportModal
        isOpen={isMarkdownModalOpen}
        onClose={() => setIsMarkdownModalOpen(false)}
        title="Upload Markdown (.md) Questions into New Quiz"
        programTitle="Step Quiz"
        existingQuestions={questions.filter((q) => q.text.trim().length > 0) as any}
        allowReplaceMode={true}
        defaultSampleCount={5}
        onImport={async (parsedQuestions: ParsedMarkdownQuestion[], replaceExisting: boolean) => {
          const mapped: QuestionFormItem[] = parsedQuestions.map((q) => ({
            text: q.text,
            type:
              q.type === "SHORT_ANSWER"
                ? "TEXT_BOX"
                : q.type === "MULTI_SELECT"
                  ? "MULTIPLE_CHOICE"
                  : "SINGLE_CHOICE",
            imageUrl: q.imageUrl || "",
            gradingMode: "SELF_REFLECTION_AUTO_PASS",
            minCharacters: q.minCharacters ?? 10,
            options:
              q.type === "SHORT_ANSWER"
                ? []
                : q.options.map((o) => ({
                    text: o.text,
                    imageUrl: o.imageUrl || "",
                    isCorrect: Boolean(o.isCorrect),
                  })),
          }));

          setQuestions((prev) => {
            const nonEmptyPrev = prev.filter((item) => item.text.trim().length > 0);
            return replaceExisting || nonEmptyPrev.length === 0
              ? mapped
              : [...nonEmptyPrev, ...mapped];
          });
        }}
      />
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
