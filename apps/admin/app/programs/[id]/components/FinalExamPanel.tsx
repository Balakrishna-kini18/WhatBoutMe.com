"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  ExamConfig,
  ExamQuestionItem,
  ExamQuestionOption,
  fetchProgramExamQuestions,
  createExam,
  updateExam,
  publishExam,
  createExamQuestion,
  bulkCreateExamQuestions,
  updateExamQuestion,
  deleteExamQuestion,
} from "../../../lib/api";
import { useToast } from "../../../components/Toast";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import StatusBadge from "../../../components/StatusBadge";
import { validateQuestionInput } from "./finalExamLogic";
import MarkdownQuestionImportModal from "./MarkdownQuestionImportModal";
import {
  ParsedMarkdownQuestion,
  generateSampleQuestionsMarkdown,
} from "../../../lib/markdown-question-parser";

interface FinalExamPanelProps {
  programId: string;
  programTitle?: string;
  requireExam?: boolean;
  onToggleRequireExam?: (required: boolean) => Promise<void> | void;
}

const DEFAULT_OPTIONS: ExamQuestionOption[] = [
  { text: "", isCorrect: true, order: 1 },
  { text: "", isCorrect: false, order: 2 },
  { text: "", isCorrect: false, order: 3 },
  { text: "", isCorrect: false, order: 4 },
];

export default function FinalExamPanel({ programId, programTitle }: FinalExamPanelProps) {
  const { success, error, info } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [seedingPool, setSeedingPool] = useState(false);
  const [exam, setExam] = useState<ExamConfig | null>(null);
  const [questions, setQuestions] = useState<ExamQuestionItem[]>([]);
  const [fallbackStepPoolCount, setFallbackStepPoolCount] = useState<number>(0);
  const [activeSubTab, setActiveSubTab] = useState<"QUESTIONS" | "SETTINGS">("QUESTIONS");

  // Filter & Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");

  // Question Editor Modal / Drawer state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<ExamQuestionItem | null>(null);
  const [qText, setQText] = useState("");
  const [qType, setQType] = useState<"MULTIPLE_CHOICE" | "MULTI_SELECT" | "SHORT_ANSWER">("MULTIPLE_CHOICE");
  const [qPoints, setQPoints] = useState(1);
  const [qImageUrl, setQImageUrl] = useState("");
  const [qExplanation, setQExplanation] = useState("");
  const [qOptions, setQOptions] = useState<ExamQuestionOption[]>(DEFAULT_OPTIONS);
  const [savingQuestion, setSavingQuestion] = useState(false);

  // Delete confirmation state
  const [questionToDelete, setQuestionToDelete] = useState<ExamQuestionItem | null>(null);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [isMarkdownModalOpen, setIsMarkdownModalOpen] = useState(false);

  // Exam Settings Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [questionCount, setQuestionCount] = useState(50);
  const [passMark, setPassMark] = useState(75);
  const [timeLimitMin, setTimeLimitMin] = useState(90);
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [cooldownHours, setCooldownHours] = useState(24);
  const [shuffleQuestions, setShuffleQuestions] = useState(true);

  const loadExamData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchProgramExamQuestions(programId);
      if (data?.exam) {
        setExam(data.exam);
        setTitle(data.exam.title || `${programTitle || "Program"} — Final Comprehensive Examination`);
        setDescription(
          data.exam.description ||
            "50-Mark Final Certification Exam (50 questions randomly shuffled from a 70-question pool)."
        );
        setQuestionCount(data.exam.questionCount ?? 50);
        setPassMark(data.exam.passMark ?? 75);
        setTimeLimitMin(data.exam.timeLimitMin ?? 90);
        setMaxAttempts(data.exam.maxAttempts ?? 3);
        setCooldownHours(data.exam.cooldownHours ?? 24);
        setShuffleQuestions(data.exam.shuffleQuestions ?? true);
      }
      setQuestions(Array.isArray(data?.questions) ? data.questions : []);
      setFallbackStepPoolCount(data?.fallbackStepPoolCount ?? 0);
    } catch (err: any) {
      error(err.message || "Failed to load Final Exam data");
    } finally {
      setLoading(false);
    }
  }, [programId, programTitle, error]);

  useEffect(() => {
    loadExamData();
  }, [loadExamData]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      error("Exam title is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        questionCount: Number(questionCount) || 50,
        passMark: Number(passMark) || 75,
        timeLimitMin: Number(timeLimitMin) || 90,
        maxAttempts: Number(maxAttempts) || 3,
        cooldownHours: Number(cooldownHours) ?? 24,
        shuffleQuestions,
      };
      if (exam?.id) {
        const updated = await updateExam(exam.id, payload);
        setExam(updated);
        success("Final exam configuration saved");
      } else {
        const created = await createExam({
          programId,
          ...payload,
        });
        setExam(created);
        success("Final exam created");
      }
    } catch (err: any) {
      error(err.message || "Failed to save exam settings");
    } finally {
      setSaving(false);
    }
  };

  const openNewQuestionModal = () => {
    setEditingQuestion(null);
    setQText("");
    setQType("MULTIPLE_CHOICE");
    setQPoints(1);
    setQImageUrl("");
    setQExplanation("");
    setQOptions([
      { text: "", isCorrect: true, order: 1 },
      { text: "", isCorrect: false, order: 2 },
      { text: "", isCorrect: false, order: 3 },
      { text: "", isCorrect: false, order: 4 },
    ]);
    setIsEditorOpen(true);
  };

  const openEditQuestionModal = (q: ExamQuestionItem) => {
    setEditingQuestion(q);
    setQText(q.text || "");
    setQType(
      q.type === "MULTI_SELECT"
        ? "MULTI_SELECT"
        : q.type === "SHORT_ANSWER" || q.type === "TEXT_BOX"
          ? "SHORT_ANSWER"
          : "MULTIPLE_CHOICE"
    );
    setQPoints(q.points || 1);
    setQImageUrl(q.imageUrl || "");
    setQExplanation(q.explanation || "");
    setQOptions(
      q.options && q.options.length > 0
        ? q.options.map((o, idx) => ({
            id: o.id,
            text: o.text,
            imageUrl: o.imageUrl || null,
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
    setIsEditorOpen(true);
  };

  const handleOptionChange = (index: number, field: keyof ExamQuestionOption, value: any) => {
    setQOptions((prev) => {
      const next = [...prev];
      if (field === "isCorrect" && qType === "MULTIPLE_CHOICE") {
        return next.map((opt, idx) => ({
          ...opt,
          isCorrect: idx === index,
        }));
      }
      const current = next[index];
      if (!current) return next;
      const updated: ExamQuestionOption = {
        id: current.id,
        text: field === "text" ? String(value) : current.text,
        imageUrl: field === "imageUrl" ? (value || null) : (current.imageUrl || null),
        isCorrect: field === "isCorrect" ? Boolean(value) : Boolean(current.isCorrect),
        order: field === "order" ? Number(value) : current.order,
      };
      next[index] = updated;
      return next;
    });
  };

  const handleAddOption = () => {
    setQOptions((prev) => [
      ...prev,
      { text: "", isCorrect: false, order: prev.length + 1 },
    ]);
  };

  const handleRemoveOption = (index: number) => {
    if (qOptions.length <= 2) {
      error("At least 2 answer options are required");
      return;
    }
    setQOptions((prev) => {
      const filtered = prev.filter((_, idx) => idx !== index);
      if (!filtered.some((o) => o.isCorrect) && filtered.length > 0 && filtered[0]) {
        filtered[0].isCorrect = true;
      }
      return filtered.map((o, idx) => ({ ...o, order: idx + 1 }));
    });
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exam?.id) {
      error("Exam record not initialized yet");
      return;
    }
    const validation = validateQuestionInput({
      text: qText,
      type: qType,
      points: qPoints,
      options: qOptions.map((o, idx) => ({ ...o, order: o.order ?? idx })),
    });
    if (!validation.isValid) {
      error(validation.error || "Please check question details");
      return;
    }

    setSavingQuestion(true);
    try {
      const payload: Partial<ExamQuestionItem> = {
        text: qText.trim(),
        type: qType,
        points: Number(qPoints) || 1,
        imageUrl: qImageUrl.trim() || null,
        explanation: qExplanation.trim() || null,
        options:
          qType === "SHORT_ANSWER"
            ? []
            : qOptions
                .filter((o) => o.text.trim().length > 0)
                .map((o, idx) => ({
                  text: o.text.trim(),
                  imageUrl: o.imageUrl || null,
                  isCorrect: Boolean(o.isCorrect),
                  order: idx + 1,
                })),
      };

      if (editingQuestion) {
        const updated = await updateExamQuestion(exam.id, editingQuestion.id, payload);
        setQuestions((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
        success("Exam question updated");
      } else {
        const created = await createExamQuestion(exam.id, payload);
        setQuestions((prev) => [...prev, created]);
        success("Question added to Final Exam pool");
      }
      setIsEditorOpen(false);
    } catch (err: any) {
      error(err.message || "Failed to save exam question");
    } finally {
      setSavingQuestion(false);
    }
  };

  const handleConfirmDeleteQuestion = async () => {
    if (!exam?.id || !questionToDelete) return;
    try {
      await deleteExamQuestion(exam.id, questionToDelete.id);
      setQuestions((prev) => prev.filter((q) => q.id !== questionToDelete.id));
      success("Question removed from Final Exam pool");
    } catch (err: any) {
      error(err.message || "Failed to delete question");
    } finally {
      setQuestionToDelete(null);
    }
  };

  const handleSeedUpTo70Questions = async () => {
    if (!exam?.id) return;
    const needed = Math.max(0, 70 - questions.length);
    if (needed === 0) {
      success("Pool already has 70 or more questions!");
      return;
    }

    setSeedingPool(true);
    try {
      const topics = [
        "Self-Awareness & Core Identity Foundations",
        "Emotional Regulation & Trigger Mapping",
        "Limiting Beliefs & Cognitive Reframing",
        "Boundary Architecture & Assertive Communication",
        "Inner Child Healing & Forgiveness Practice",
        "Values Alignment & Decision Frameworks",
        "Resilience Under Pressure & Mindfulness",
        "Authentic Relationships & Empathy",
        "Purpose Discovery & Vision Crafting",
        "Habit Loops & Behavioral Transformation",
        "Personal Leadership & Mission Integration",
      ];

      const startIdx = questions.length + 1;
      const generatedBatch: Array<Partial<ExamQuestionItem>> = Array.from({ length: needed }, (_, i) => {
        const num = startIdx + i;
        const topic = topics[i % topics.length];
        return {
          text: `[Final Exam Q${num}] In the context of ${topic}, which practice best demonstrates mastery of the core principle taught in "${programTitle || "this program"}"?`,
          type: "MULTIPLE_CHOICE",
          points: 1,
          explanation: `Review the ${topic} module for the foundational framework behind this assessment item.`,
          options: [
            {
              text: `Consciously applying the structured reflection and action protocol for ${topic}`,
              isCorrect: true,
              order: 1,
            },
            {
              text: "Reacting automatically without pausing to evaluate underlying triggers",
              isCorrect: false,
              order: 2,
            },
            {
              text: "Avoiding self-reflection until external circumstances change on their own",
              isCorrect: false,
              order: 3,
            },
            {
              text: "Suppressing feedback and bypassing the daily integration exercises",
              isCorrect: false,
              order: 4,
            },
          ],
        };
      });

      const res = await bulkCreateExamQuestions(exam.id, generatedBatch);
      setQuestions((prev) => [...prev, ...(res.questions || [])]);
      success(
        `Added ${res.createdCount} exam questions! Pool now has ${questions.length + res.createdCount} questions (50 randomly shuffled per exam).`
      );
    } catch (err: any) {
      error(err.message || "Failed to populate 70-question pool");
    } finally {
      setSeedingPool(false);
    }
  };

  const handleMarkdownImport = async (
    parsedQuestions: ParsedMarkdownQuestion[],
    replaceExisting: boolean
  ) => {
    if (!exam?.id) {
      throw new Error("Exam record is not initialized yet.");
    }
    const batchPayload: Array<Partial<ExamQuestionItem>> = parsedQuestions.map((q) => ({
      text: q.text,
      type: q.type,
      points: q.points || 1,
      explanation: q.explanation || null,
      imageUrl: q.imageUrl || null,
      options: q.options,
    }));

    const res = await bulkCreateExamQuestions(exam.id, batchPayload, replaceExisting);
    if (replaceExisting) {
      setQuestions(res.questions || []);
      success(
        `Replaced pool with ${res.createdCount} questions from Markdown (.md)!`
      );
    } else {
      setQuestions((prev) => [...prev, ...(res.questions || [])]);
      success(
        `Imported ${res.createdCount} questions from Markdown (.md)! Pool now has ${questions.length + res.createdCount} questions.`
      );
    }
  };

  const handleDownloadQuickMdTemplate = () => {
    const safeSlug = (programTitle || "program")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const content = generateSampleQuestionsMarkdown(70, programTitle || "11 Steps to U");
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeSlug}-70-exam-questions-template.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    info("Downloaded 70-question Markdown (.md) template!");
  };

  const handlePublish = async () => {
    if (!exam?.id) return;
    setPublishing(true);
    setShowPublishConfirm(false);
    try {
      const published = await publishExam(exam.id);
      setExam(published);
      success("Final Exam published! Learners can now take the 50-mark shuffled exam.");
    } catch (err: any) {
      error(err.message || "Failed to publish exam");
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          padding: "2.5rem",
          background: "#ffffff",
          border: "1px solid #ece6dd",
          borderRadius: 16,
          textAlign: "center",
          color: "#78716a",
        }}
      >
        Loading Final Exam Configuration...
      </div>
    );
  }

  const canPublish = Boolean(exam?.id) && questions.length > 0;

  const filteredQuestions = questions.filter((q) => {
    const matchesSearch =
      !searchQuery.trim() ||
      q.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.options?.some((o) => o.text.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesType = typeFilter === "ALL" || q.type === typeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Top Hero Banner */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #ece6dd",
          borderRadius: 16,
          padding: "1.5rem 1.75rem",
          boxShadow: "0 2px 8px rgba(20, 17, 15, 0.04)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                fontSize: "0.75rem",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "#c97a1e",
                background: "#fef3c7",
                padding: "0.25rem 0.65rem",
                borderRadius: 999,
                marginBottom: "0.5rem",
              }}
            >
              FINAL EXAMINATION BUILDER
            </div>
            <h2 style={{ fontSize: "1.35rem", fontWeight: 800, margin: "0 0 0.35rem", color: "#14110f" }}>
              {title || "Final Comprehensive Examination"}
            </h2>
            <p style={{ margin: 0, fontSize: "0.9rem", color: "#6b655e", maxWidth: 680 }}>
              Create and manage examination questions for learners after completing curriculum steps.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flexWrap: "wrap" }}>
            <StatusBadge status={exam?.status || "DRAFT"} />
            {exam?.status !== "PUBLISHED" ? (
              <button
                type="button"
                disabled={!canPublish || publishing}
                onClick={() => setShowPublishConfirm(true)}
                style={{
                  padding: "0.6rem 1.15rem",
                  borderRadius: 10,
                  border: "none",
                  background: canPublish ? "#15803d" : "#d6d3d1",
                  color: "#ffffff",
                  fontWeight: 700,
                  fontSize: "0.86rem",
                  cursor: canPublish ? "pointer" : "not-allowed",
                }}
              >
                {publishing ? "Publishing..." : "Publish Final Exam"}
              </button>
            ) : (
              <span
                style={{
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  color: "#15803d",
                  background: "#dcfce7",
                  padding: "0.45rem 0.85rem",
                  borderRadius: 8,
                }}
              >
                ✓ Live in Learner Portal
              </span>
            )}
          </div>
        </div>

        {/* 70-Question Pool Progress & Action Bar */}
        <div
          style={{
            marginTop: "1.25rem",
            padding: "0.95rem 1.25rem",
            borderRadius: 12,
            background: "#faf6f0",
            border: "1px solid #ece4d7",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.85rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 800, fontSize: "0.92rem", color: "#14110f" }}>
              Dedicated Exam Pool: {questions.length} / 70 Questions
            </span>
            <span
              style={{
                fontSize: "0.78rem",
                fontWeight: 700,
                padding: "0.2rem 0.65rem",
                borderRadius: 999,
                background: questions.length >= 70 ? "#dcfce7" : questions.length >= questionCount ? "#fef3c7" : "#fee2e2",
                color: questions.length >= 70 ? "#166534" : questions.length >= questionCount ? "#92400e" : "#991b1b",
              }}
            >
              {questions.length >= 70
                ? `✓ 70-Question Target Reached (${questionCount} Shuffled per Attempt)`
                : questions.length >= questionCount
                ? `Ready (${questions.length} in pool · ${70 - questions.length} more for full 70-question bank)`
                : `Needs ${Math.max(0, questionCount - questions.length)} more for ${questionCount}-mark exam`}
            </span>
            <span style={{ fontSize: "0.8rem", color: "#78716a" }}>
              Pass Mark: <strong>{passMark}%</strong> · Time: <strong>{timeLimitMin}m</strong>
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={handleDownloadQuickMdTemplate}
              style={{
                padding: "0.48rem 0.9rem",
                borderRadius: 8,
                border: "1px solid #dcd5cb",
                background: "#ffffff",
                color: "#44403c",
                fontWeight: 700,
                fontSize: "0.8rem",
                cursor: "pointer",
              }}
            >
              ⬇ Download .md Template (70 Qs)
            </button>

            <button
              type="button"
              onClick={() => setIsMarkdownModalOpen(true)}
              style={{
                padding: "0.48rem 0.95rem",
                borderRadius: 8,
                border: "1px solid #14110f",
                background: "#14110f",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: "0.8rem",
                cursor: "pointer",
              }}
            >
              📤 Upload .md Questions
            </button>

            {questions.length < 70 && (
              <button
                type="button"
                disabled={seedingPool}
                onClick={handleSeedUpTo70Questions}
                style={{
                  padding: "0.48rem 0.95rem",
                  borderRadius: 8,
                  border: "1px solid #d97706",
                  background: "#fffbeb",
                  color: "#b45309",
                  fontWeight: 700,
                  fontSize: "0.8rem",
                  cursor: seedingPool ? "wait" : "pointer",
                }}
              >
                {seedingPool
                  ? "Generating Questions..."
                  : `⚡ Auto-Fill to 70 Questions (+${70 - questions.length})`}
              </button>
            )}

            <button
              type="button"
              onClick={openNewQuestionModal}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: 8,
                border: "none",
                background: "#c97a1e",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: "0.82rem",
                cursor: "pointer",
              }}
            >
              + Add Exam Question
            </button>
          </div>
        </div>

        {/* Sub-navigation Tabs */}
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            marginTop: "1.25rem",
            borderBottom: "1px solid #ece6dd",
            paddingBottom: "0.75rem",
          }}
        >
          <button
            type="button"
            onClick={() => setActiveSubTab("QUESTIONS")}
            style={{
              padding: "0.55rem 1.1rem",
              borderRadius: 9,
              border: activeSubTab === "QUESTIONS" ? "1px solid #c97a1e" : "1px solid transparent",
              background: activeSubTab === "QUESTIONS" ? "#fff8eb" : "transparent",
              color: activeSubTab === "QUESTIONS" ? "#9a5810" : "#57534e",
              fontWeight: 700,
              fontSize: "0.86rem",
              cursor: "pointer",
            }}
          >
            1. Exam Question Pool ({questions.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("SETTINGS")}
            style={{
              padding: "0.55rem 1.1rem",
              borderRadius: 9,
              border: activeSubTab === "SETTINGS" ? "1px solid #c97a1e" : "1px solid transparent",
              background: activeSubTab === "SETTINGS" ? "#fff8eb" : "transparent",
              color: activeSubTab === "SETTINGS" ? "#9a5810" : "#57534e",
              fontWeight: 700,
              fontSize: "0.86rem",
              cursor: "pointer",
            }}
          >
            2. Exam Rules &amp; Marks Configuration
          </button>
        </div>
      </div>

      {/* =========================================================
          SUB-TAB 1: QUESTION POOL MANAGER (70-QUESTION BANK)
          ========================================================= */}
      {activeSubTab === "QUESTIONS" && (
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #ece6dd",
            borderRadius: 16,
            padding: "1.5rem 1.75rem",
            boxShadow: "0 2px 8px rgba(20, 17, 15, 0.04)",
          }}
        >
          {/* Search & Filter Controls */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "1rem",
              flexWrap: "wrap",
              marginBottom: "1.25rem",
            }}
          >
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search exam questions or options..."
              style={{
                flex: "1 1 280px",
                padding: "0.6rem 0.9rem",
                borderRadius: 10,
                border: "1px solid #dcd5cb",
                fontSize: "0.88rem",
                background: "#faf7f2",
                color: "#14110f",
              }}
            />

            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              {(["ALL", "MULTIPLE_CHOICE", "MULTI_SELECT", "SHORT_ANSWER"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypeFilter(t)}
                  style={{
                    padding: "0.45rem 0.8rem",
                    borderRadius: 8,
                    border: typeFilter === t ? "1px solid #c97a1e" : "1px solid #e5dec9",
                    background: typeFilter === t ? "#fff8eb" : "#ffffff",
                    color: typeFilter === t ? "#9a5810" : "#6b655e",
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {t === "ALL"
                    ? `All (${questions.length})`
                    : t === "MULTIPLE_CHOICE"
                      ? "Single Choice"
                      : t === "MULTI_SELECT"
                        ? "Multi-Select"
                        : "Short Answer"}
                </button>
              ))}
            </div>
          </div>

          {/* Question List */}
          {filteredQuestions.length === 0 ? (
            <div
              style={{
                padding: "3rem 1.5rem",
                textAlign: "center",
                background: "#faf6f0",
                borderRadius: 14,
                border: "1px dashed #dcd5cb",
              }}
            >
              <h3 style={{ margin: "0 0 0.5rem", fontSize: "1.08rem", color: "#14110f" }}>
                {questions.length === 0
                  ? "No dedicated Final Exam questions added yet"
                  : "No questions match your search filter"}
              </h3>
              <p style={{ margin: "0 auto 1.25rem", maxWidth: 520, fontSize: "0.88rem", color: "#6b655e" }}>
                Build a pool of <strong>70 questions</strong> so each learner gets a unique, randomly shuffled{" "}
                <strong>50-question (50-mark)</strong> final exam paper.
              </p>
              <div style={{ display: "flex", justifyContent: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={openNewQuestionModal}
                  style={{
                    padding: "0.6rem 1.2rem",
                    borderRadius: 10,
                    border: "none",
                    background: "#c97a1e",
                    color: "#ffffff",
                    fontWeight: 700,
                    fontSize: "0.86rem",
                    cursor: "pointer",
                  }}
                >
                  + Add First Exam Question
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              {filteredQuestions.map((q, idx) => (
                <div
                  key={q.id}
                  style={{
                    border: "1px solid #ece6dd",
                    borderRadius: 12,
                    padding: "1.1rem 1.25rem",
                    background: "#fdfbf7",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: "1rem",
                    }}
                  >
                    <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start", flex: 1 }}>
                      <span
                        style={{
                          minWidth: 34,
                          height: 28,
                          borderRadius: 7,
                          background: "#fef3c7",
                          color: "#9a5810",
                          fontWeight: 800,
                          fontSize: "0.78rem",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "0 0.4rem",
                        }}
                      >
                        Q{idx + 1}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#14110f", lineHeight: 1.45 }}>
                          {q.text}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: "0.5rem",
                            alignItems: "center",
                            marginTop: "0.4rem",
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "0.72rem",
                              fontWeight: 700,
                              padding: "0.15rem 0.55rem",
                              borderRadius: 6,
                              background: "#f3efe8",
                              color: "#57534e",
                            }}
                          >
                            {q.type === "MULTI_SELECT"
                              ? "Multi-Select"
                              : q.type === "SHORT_ANSWER"
                                ? "Short Answer"
                                : "Multiple Choice"}
                          </span>
                          <span
                            style={{
                              fontSize: "0.72rem",
                              fontWeight: 700,
                              padding: "0.15rem 0.55rem",
                              borderRadius: 6,
                              background: "#ecfdf5",
                              color: "#047857",
                            }}
                          >
                            {q.points || 1} {q.points === 1 ? "Mark" : "Marks"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                      <button
                        type="button"
                        onClick={() => openEditQuestionModal(q)}
                        style={{
                          padding: "0.38rem 0.75rem",
                          borderRadius: 7,
                          border: "1px solid #dcd5cb",
                          background: "#ffffff",
                          color: "#14110f",
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuestionToDelete(q)}
                        style={{
                          padding: "0.38rem 0.75rem",
                          borderRadius: 7,
                          border: "1px solid #fecaca",
                          background: "#fef2f2",
                          color: "#dc2626",
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Options Preview */}
                  {q.options && q.options.length > 0 && (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                        gap: "0.5rem",
                        marginTop: "0.85rem",
                        paddingLeft: "2.6rem",
                      }}
                    >
                      {q.options.map((opt, oIdx) => (
                        <div
                          key={opt.id || oIdx}
                          style={{
                            padding: "0.45rem 0.7rem",
                            borderRadius: 8,
                            border: opt.isCorrect ? "1px solid #86efac" : "1px solid #ece6dd",
                            background: opt.isCorrect ? "#f0fdf4" : "#ffffff",
                            color: opt.isCorrect ? "#166534" : "#57534e",
                            fontSize: "0.82rem",
                            fontWeight: opt.isCorrect ? 700 : 500,
                            display: "flex",
                            alignItems: "center",
                            gap: "0.45rem",
                          }}
                        >
                          <span>{opt.isCorrect ? "✓" : `${String.fromCharCode(65 + oIdx)}.`}</span>
                          <span style={{ flex: 1 }}>{opt.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =========================================================
          SUB-TAB 2: EXAM CONFIGURATION & SCORING RULES
          ========================================================= */}
      {activeSubTab === "SETTINGS" && (
        <form
          onSubmit={handleSaveConfig}
          style={{
            background: "#ffffff",
            border: "1px solid #ece6dd",
            borderRadius: 16,
            padding: "1.5rem 1.75rem",
            boxShadow: "0 2px 8px rgba(20, 17, 15, 0.04)",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <label style={{ fontWeight: 700, fontSize: "0.86rem", color: "#14110f" }}>Exam Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              style={{
                padding: "0.65rem 0.9rem",
                borderRadius: 10,
                border: "1px solid #dcd5cb",
                fontSize: "0.92rem",
              }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <label style={{ fontWeight: 700, fontSize: "0.86rem", color: "#14110f" }}>
              Instructions &amp; Description
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{
                padding: "0.65rem 0.9rem",
                borderRadius: 10,
                border: "1px solid #dcd5cb",
                fontSize: "0.9rem",
              }}
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: "1rem",
            }}
          >
            <div>
              <label style={{ display: "block", fontWeight: 700, fontSize: "0.84rem", marginBottom: 6 }}>
                Questions per Attempt (Marks)
              </label>
              <input
                type="number"
                min={1}
                max={200}
                value={questionCount}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
                style={{
                  width: "100%",
                  padding: "0.6rem 0.8rem",
                  borderRadius: 10,
                  border: "1px solid #dcd5cb",
                }}
              />
              <span style={{ fontSize: "0.75rem", color: "#6b655e" }}>
                Default: 50 questions (50 marks) randomly shuffled from 70-question pool
              </span>
            </div>

            <div>
              <label style={{ display: "block", fontWeight: 700, fontSize: "0.84rem", marginBottom: 6 }}>
                Pass Mark (%)
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={passMark}
                onChange={(e) => setPassMark(Number(e.target.value))}
                style={{
                  width: "100%",
                  padding: "0.6rem 0.8rem",
                  borderRadius: 10,
                  border: "1px solid #dcd5cb",
                }}
              />
              <span style={{ fontSize: "0.75rem", color: "#6b655e" }}>
                Minimum score percentage required to pass (default: 75%)
              </span>
            </div>

            <div>
              <label style={{ display: "block", fontWeight: 700, fontSize: "0.84rem", marginBottom: 6 }}>
                Time Limit (Minutes)
              </label>
              <input
                type="number"
                min={5}
                max={300}
                value={timeLimitMin}
                onChange={(e) => setTimeLimitMin(Number(e.target.value))}
                style={{
                  width: "100%",
                  padding: "0.6rem 0.8rem",
                  borderRadius: 10,
                  border: "1px solid #dcd5cb",
                }}
              />
              <span style={{ fontSize: "0.75rem", color: "#6b655e" }}>Default: 90 minutes</span>
            </div>

            <div>
              <label style={{ display: "block", fontWeight: 700, fontSize: "0.84rem", marginBottom: 6 }}>
                Max Attempts
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={maxAttempts}
                onChange={(e) => setMaxAttempts(Number(e.target.value))}
                style={{
                  width: "100%",
                  padding: "0.6rem 0.8rem",
                  borderRadius: 10,
                  border: "1px solid #dcd5cb",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontWeight: 700, fontSize: "0.84rem", marginBottom: 6 }}>
                Retry Cooldown (Hours)
              </label>
              <input
                type="number"
                min={0}
                max={168}
                value={cooldownHours}
                onChange={(e) => setCooldownHours(Number(e.target.value))}
                style={{
                  width: "100%",
                  padding: "0.6rem 0.8rem",
                  borderRadius: 10,
                  border: "1px solid #dcd5cb",
                }}
              />
            </div>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={shuffleQuestions}
              onChange={(e) => setShuffleQuestions(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: "#c97a1e" }}
            />
            <span style={{ fontWeight: 600, fontSize: "0.88rem", color: "#14110f" }}>
              Randomly shuffle 50 questions from the 70-question pool &amp; shuffle answer options per learner attempt
            </span>
          </label>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: "0.65rem 1.35rem",
                borderRadius: 10,
                border: "none",
                background: "#c97a1e",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: "0.88rem",
                cursor: "pointer",
              }}
            >
              {saving ? "Saving..." : "Save Exam Configuration"}
            </button>
          </div>
        </form>
      )}

      {/* =========================================================
          MODAL: CREATE / EDIT EXAM QUESTION
          ========================================================= */}
      {isEditorOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(20, 17, 15, 0.55)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: 16,
              width: "100%",
              maxWidth: 680,
              maxHeight: "90vh",
              overflowY: "auto",
              padding: "1.5rem 1.75rem",
              border: "1px solid #ece6dd",
              boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1.1rem",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "#14110f" }}>
                {editingQuestion ? "Edit Final Exam Question" : "Add Question to Final Exam Pool"}
              </h3>
              <button
                type="button"
                onClick={() => setIsEditorOpen(false)}
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: "1.25rem",
                  cursor: "pointer",
                  color: "#6b655e",
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveQuestion} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0.85rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, marginBottom: 4 }}>
                    Question Type
                  </label>
                  <select
                    value={qType}
                    onChange={(e) => setQType(e.target.value as any)}
                    style={{
                      width: "100%",
                      padding: "0.55rem 0.75rem",
                      borderRadius: 9,
                      border: "1px solid #dcd5cb",
                      background: "#ffffff",
                    }}
                  >
                    <option value="MULTIPLE_CHOICE">Multiple Choice (Single Correct)</option>
                    <option value="MULTI_SELECT">Multi-Select (Multiple Correct)</option>
                    <option value="SHORT_ANSWER">Short Answer / Reflection</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, marginBottom: 4 }}>
                    Marks / Points
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={qPoints}
                    onChange={(e) => setQPoints(Number(e.target.value))}
                    style={{
                      width: "100%",
                      padding: "0.55rem 0.75rem",
                      borderRadius: 9,
                      border: "1px solid #dcd5cb",
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, marginBottom: 4 }}>
                  Question Prompt *
                </label>
                <textarea
                  rows={3}
                  value={qText}
                  onChange={(e) => setQText(e.target.value)}
                  required
                  placeholder="Enter the exam question..."
                  style={{
                    width: "100%",
                    padding: "0.65rem 0.85rem",
                    borderRadius: 10,
                    border: "1px solid #dcd5cb",
                    fontSize: "0.9rem",
                  }}
                />
              </div>

              {qType !== "SHORT_ANSWER" && (
                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "#14110f" }}>
                      Answer Options (Select correct {qType === "MULTI_SELECT" ? "answers" : "answer"})
                    </label>
                    <button
                      type="button"
                      onClick={handleAddOption}
                      style={{
                        border: "1px solid #c97a1e",
                        background: "#fff8eb",
                        color: "#9a5810",
                        borderRadius: 7,
                        padding: "0.25rem 0.65rem",
                        fontSize: "0.76rem",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      + Add Option
                    </button>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                    {qOptions.map((opt, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.55rem",
                          padding: "0.5rem 0.65rem",
                          borderRadius: 9,
                          border: opt.isCorrect ? "1px solid #86efac" : "1px solid #e5dec9",
                          background: opt.isCorrect ? "#f0fdf4" : "#faf7f2",
                        }}
                      >
                        <input
                          type={qType === "MULTI_SELECT" ? "checkbox" : "radio"}
                          name="correctOption"
                          checked={Boolean(opt.isCorrect)}
                          onChange={(e) => handleOptionChange(idx, "isCorrect", e.target.checked)}
                          style={{ width: 17, height: 17, accentColor: "#16a34a", cursor: "pointer" }}
                        />
                        <input
                          type="text"
                          value={opt.text}
                          onChange={(e) => handleOptionChange(idx, "text", e.target.value)}
                          placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                          style={{
                            flex: 1,
                            padding: "0.45rem 0.65rem",
                            borderRadius: 7,
                            border: "1px solid #dcd5cb",
                            background: "#ffffff",
                            fontSize: "0.86rem",
                          }}
                        />
                        {qOptions.length > 2 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveOption(idx)}
                            style={{
                              border: "none",
                              background: "transparent",
                              color: "#dc2626",
                              cursor: "pointer",
                              fontWeight: 700,
                            }}
                            title="Remove option"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, marginBottom: 4 }}>
                  Explanation / Feedback (Optional)
                </label>
                <input
                  type="text"
                  value={qExplanation}
                  onChange={(e) => setQExplanation(e.target.value)}
                  placeholder="Optional explanation or module reference..."
                  style={{
                    width: "100%",
                    padding: "0.55rem 0.75rem",
                    borderRadius: 9,
                    border: "1px solid #dcd5cb",
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.65rem", marginTop: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  style={{
                    padding: "0.55rem 1rem",
                    borderRadius: 9,
                    border: "1px solid #dcd5cb",
                    background: "#ffffff",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingQuestion}
                  style={{
                    padding: "0.55rem 1.2rem",
                    borderRadius: 9,
                    border: "none",
                    background: "#c97a1e",
                    color: "#ffffff",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {savingQuestion ? "Saving..." : editingQuestion ? "Update Question" : "Add Question"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Question ConfirmDialog */}
      <ConfirmDialog
        isOpen={Boolean(questionToDelete)}
        onClose={() => setQuestionToDelete(null)}
        onConfirm={handleConfirmDeleteQuestion}
        title="Delete Exam Question"
        description={`Are you sure you want to remove "${questionToDelete?.text?.slice(0, 80)}..." from the Final Exam question pool?`}
        confirmText="Delete Question"
        tone="danger"
      />

      {/* Publish Exam ConfirmDialog */}
      <ConfirmDialog
        isOpen={showPublishConfirm}
        onClose={() => setShowPublishConfirm(false)}
        onConfirm={handlePublish}
        title="Publish Final Exam"
        description={`Are you sure you want to publish "${title}"? Learners who complete all curriculum steps will immediately unlock this ${questionCount}-mark exam (randomly shuffled from ${questions.length} questions in pool).`}
        confirmText="Publish Now"
      />

      {/* Bulk Markdown (.md) Question Upload Modal */}
      <MarkdownQuestionImportModal
        isOpen={isMarkdownModalOpen}
        onClose={() => setIsMarkdownModalOpen(false)}
        title={`Upload Markdown (.md) Questions — ${title || "Final Exam Pool"}`}
        programTitle={programTitle || "11 Steps to U"}
        existingQuestions={questions}
        allowReplaceMode={true}
        defaultSampleCount={70}
        onImport={handleMarkdownImport}
      />
    </div>
  );
}
