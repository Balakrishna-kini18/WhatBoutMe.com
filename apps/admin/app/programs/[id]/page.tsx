"use client";

import { useEffect, useState, useRef, use, FormEvent } from "react";
import styles from "./curriculum.module.css";
import Link from "next/link";
import { API_URL, uploadFile, errorMessage } from "../../lib/api";

interface Lesson {
  id: string;
  title: string;
  type: "VIDEO" | "PDF" | "TEXT" | string;
  mediaUrl: string;
  durationSec?: number | null;
}

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

interface Quiz {
  id: string;
  title?: string;
  stepId: string;
  passMark: number;
  maxAttempts: number;
  cooldownHours: number;
  questions?: Question[];
}

interface Step {
  id: string;
  sequence: number;
  title: string;
  description: string;
  lessons?: Lesson[];
  quiz?: Quiz | null;
}

export default function CurriculumStudioPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const programId = resolvedParams.id;

  // Program & Curriculum Tree State
  const [programTitle, setProgramTitle] = useState("Loading Program...");
  const [programData, setProgramData] = useState<any>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [treeSearch, setTreeSearch] = useState("");
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});

  // Active Selection in Studio Canvas
  // type: "STEP" | "LESSON" | "QUIZ"
  const [selectedEntity, setSelectedEntity] = useState<{
    type: "STEP" | "LESSON" | "QUIZ";
    stepId: string;
    lessonId?: string;
  } | null>(null);

  // Active step full details cache
  const [activeStepDetails, setActiveStepDetails] = useState<Step | null>(null);
  const [activeQuizQuestions, setActiveQuizQuestions] = useState<Question[]>([]);
  const [isQuizLoading, setIsQuizLoading] = useState(false);

  // Modals & In-line Drawer States
  const [isAddStepModalOpen, setIsAddStepModalOpen] = useState(false);
  const [newStepTitle, setNewStepTitle] = useState("");
  const [newStepDesc, setNewStepDesc] = useState("");
  const [isSavingStep, setIsSavingStep] = useState(false);

  // Video Upload State
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [videoTitle, setVideoTitle] = useState("");
  const [videoUploadProgress, setVideoUploadProgress] = useState<number | null>(null);
  const [videoUploadStatus, setVideoUploadStatus] = useState<string>("");

  // PDF Upload State
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [pdfTitle, setPdfTitle] = useState("");
  const [pdfUploadStatus, setPdfUploadStatus] = useState<string>("");

  // In-line Quiz Form State
  const [quizPassMark, setQuizPassMark] = useState(75);
  const [quizMaxAttempts, setQuizMaxAttempts] = useState(3);
  const [quizCooldown, setQuizCooldown] = useState(24);
  const [isSavingQuizSettings, setIsSavingQuizSettings] = useState(false);
  const [quizFeedbackMessage, setQuizFeedbackMessage] = useState<string | null>(null);

  // In-line Question Builder State
  const [newQuestionText, setNewQuestionText] = useState("");
  const [newQuestionPoints, setNewQuestionPoints] = useState(1);
  const [newQuestionExplanation, setNewQuestionExplanation] = useState("");
  const [newQuestionOptions, setNewQuestionOptions] = useState<Option[]>([
    { text: "", isCorrect: true },
    { text: "", isCorrect: false },
    { text: "", isCorrect: false },
  ]);
  const [isAddingQuestion, setIsAddingQuestion] = useState(false);

  // Initial Data Fetch
  useEffect(() => {
    fetchProgramAndCurriculum();
  }, [programId]);

  const fetchProgramAndCurriculum = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch Program details
      const progRes = await fetch(`${API_URL}/programs`);
      if (progRes.ok) {
        const progs = await progRes.json();
        const found = progs.find((p: any) => p.id === programId);
        if (found) {
          setProgramTitle(found.title);
          setProgramData(found);
        }
      }

      // 2. Fetch Steps
      const stepsRes = await fetch(`${API_URL}/programs/${programId}/steps`);
      if (stepsRes.ok) {
        const stepsData: Step[] = await stepsRes.json();
        const sorted = [...stepsData].sort((a, b) => a.sequence - b.sequence);
        setSteps(sorted);

        // Auto-expand all steps by default
        const expandMap: Record<string, boolean> = {};
        sorted.forEach((s) => {
          expandMap[s.id] = true;
        });
        setExpandedSteps(expandMap);

        // Auto-select first step if none selected
        if (sorted[0] && !selectedEntity) {
          selectStep(sorted[0]);
        }
      }
    } catch (err) {
      console.error("Error loading curriculum studio data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const selectStep = async (step: Step) => {
    setSelectedEntity({ type: "STEP", stepId: step.id });
    setActiveStepDetails(step);
    // Fetch detailed step with lessons & quiz
    try {
      const res = await fetch(`${API_URL}/programs/steps/${step.id}`);
      if (res.ok) {
        const fullStep: Step = await res.json();
        setActiveStepDetails(fullStep);
        // Update in step list
        setSteps((prev) => prev.map((s) => (s.id === fullStep.id ? { ...s, ...fullStep } : s)));
      }
    } catch (e) {
      console.warn("Could not load full step details", e);
    }
  };

  const selectLesson = (stepId: string, lesson: Lesson) => {
    setSelectedEntity({ type: "LESSON", stepId, lessonId: lesson.id });
  };

  const selectQuiz = async (stepId: string, quiz: Quiz) => {
    setSelectedEntity({ type: "QUIZ", stepId });
    setQuizPassMark(quiz.passMark ?? 75);
    setQuizMaxAttempts(quiz.maxAttempts ?? 3);
    setQuizCooldown(quiz.cooldownHours ?? 24);

    setIsQuizLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/quizzes/${quiz.id}/questions`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const qData = await res.json();
        setActiveQuizQuestions(qData);
      } else if (quiz.questions) {
        setActiveQuizQuestions(quiz.questions);
      }
    } catch (e) {
      console.warn("Could not load quiz questions", e);
    } finally {
      setIsQuizLoading(false);
    }
  };

  const toggleExpand = (stepId: string) => {
    setExpandedSteps((prev) => ({ ...prev, [stepId]: !prev[stepId] }));
  };

  // =========================================================================
  // Module Creation & Deletion
  // =========================================================================
  const handleCreateStep = async (e: FormEvent) => {
    e.preventDefault();
    if (!newStepTitle.trim()) return;
    setIsSavingStep(true);

    try {
      const nextSequence = steps.reduce((highest, s) => Math.max(highest, s.sequence), 0) + 1;
      const res = await fetch(`${API_URL}/programs/${programId}/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newStepTitle.trim(),
          description: newStepDesc.trim(),
          sequence: nextSequence,
        }),
      });

      if (res.ok) {
        const createdStep: Step = await res.json();
        setSteps((prev) => [...prev, createdStep]);
        setExpandedSteps((prev) => ({ ...prev, [createdStep.id]: true }));
        setIsAddStepModalOpen(false);
        setNewStepTitle("");
        setNewStepDesc("");
        selectStep(createdStep);
      } else {
        alert("Failed to create module. Please try again.");
      }
    } catch (err) {
      console.error(err);
      alert("Error creating module.");
    } finally {
      setIsSavingStep(false);
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    if (!confirm("Are you sure you want to delete this entire module and all its attached lessons and quizzes?")) return;
    try {
      const res = await fetch(`${API_URL}/programs/steps/${stepId}`, { method: "DELETE" });
      if (res.ok) {
        setSteps((prev) => prev.filter((s) => s.id !== stepId));
        if (selectedEntity?.stepId === stepId) {
          const remaining = steps.filter((s) => s.id !== stepId);
          if (remaining[0]) {
            selectStep(remaining[0]);
          } else {
            setSelectedEntity(null);
            setActiveStepDetails(null);
          }
        }
      } else {
        alert("Failed to delete module.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  // =========================================================================
  // Video Lesson Upload
  // =========================================================================
  const handleUploadVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeStepDetails) return;

    setIsVideoModalOpen(false);
    setVideoUploadProgress(0);
    setVideoUploadStatus("Uploading video to secure stream storage...");

    try {
      const sigRes = await fetch(`${API_URL}/media/upload-signature`, { method: "POST" });
      if (!sigRes.ok) throw new Error("Failed to prepare secure upload");
      const sigData = await sigRes.json();

      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "authenticated");
      formData.append("signature", sigData.signature);
      formData.append("api_key", sigData.apiKey);
      formData.append("timestamp", sigData.timestamp);

      const xhr = new XMLHttpRequest();
      const uploadRes = await new Promise((resolve, reject) => {
        xhr.open("POST", sigData.uploadUrl);
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            setVideoUploadProgress(Math.round((ev.loaded / ev.total) * 100));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            reject(new Error("Video upload rejected by server"));
          }
        };
        xhr.onerror = () => reject(new Error("Network error during video upload"));
        xhr.send(formData);
      });

      const publicId = (uploadRes as any).public_id;
      const durationSec = (uploadRes as any).duration ? Math.round((uploadRes as any).duration) : undefined;

      const res = await fetch(`${API_URL}/programs/steps/${activeStepDetails.id}/lessons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: videoTitle || file.name.replace(/\.[^/.]+$/, ""),
          type: "VIDEO",
          mediaUrl: `upload:${publicId}`,
          durationSec,
        }),
      });

      if (!res.ok) throw new Error("Failed to link video lesson to module");

      setVideoUploadProgress(null);
      setVideoUploadStatus("");
      setVideoTitle("");
      selectStep(activeStepDetails);
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Video upload failed");
      setVideoUploadProgress(null);
      setVideoUploadStatus("");
    }
  };

  // =========================================================================
  // PDF Lesson Upload
  // =========================================================================
  const handleUploadPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeStepDetails) return;

    setPdfUploadStatus("Uploading PDF document...");
    try {
      const url = await uploadFile(file);
      const res = await fetch(`${API_URL}/programs/steps/${activeStepDetails.id}/lessons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: pdfTitle || file.name.replace(/\.pdf$/i, ""),
          type: "PDF",
          mediaUrl: url,
        }),
      });

      if (!res.ok) throw new Error(await errorMessage(res, "Could not add PDF to this module"));

      setPdfUploadStatus("");
      setPdfTitle("");
      setIsPdfModalOpen(false);
      selectStep(activeStepDetails);
    } catch (err: any) {
      alert(err.message || "Failed to upload PDF");
      setPdfUploadStatus("");
    }
  };

  // =========================================================================
  // Delete Lesson
  // =========================================================================
  const handleDeleteLesson = async (lessonId: string) => {
    if (!confirm("Delete this lesson from the module?")) return;
    try {
      const res = await fetch(`${API_URL}/programs/lessons/${lessonId}`, { method: "DELETE" });
      if (res.ok && activeStepDetails) {
        selectStep(activeStepDetails);
      } else {
        alert("Failed to delete lesson.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  // =========================================================================
  // In-line Quiz Creation & Question Management
  // =========================================================================
  const handleCreateStepQuiz = async () => {
    if (!activeStepDetails) return;
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/quizzes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          stepId: activeStepDetails.id,
          title: `${activeStepDetails.title} Knowledge Check`,
          passMark: 75,
          maxAttempts: 3,
          cooldownHours: 24,
        }),
      });

      if (res.ok) {
        const createdQuiz = await res.json();
        await selectStep(activeStepDetails);
        selectQuiz(activeStepDetails.id, createdQuiz);
      } else {
        alert("Failed to initialize quiz for this module.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveQuizSettings = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeStepDetails?.quiz) return;
    setIsSavingQuizSettings(true);
    setQuizFeedbackMessage(null);

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/quizzes/${activeStepDetails.quiz.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          passMark: Number(quizPassMark),
          maxAttempts: Number(quizMaxAttempts),
          cooldownHours: Number(quizCooldown),
        }),
      });

      if (res.ok) {
        setQuizFeedbackMessage("Quiz parameters saved successfully ✓");
        setTimeout(() => setQuizFeedbackMessage(null), 3000);
      } else {
        alert("Failed to save quiz settings.");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSavingQuizSettings(false);
    }
  };

  const handleAddQuestionOption = () => {
    setNewQuestionOptions((prev) => [...prev, { text: "", isCorrect: false }]);
  };

  const handleRemoveQuestionOption = (idx: number) => {
    if (newQuestionOptions.length <= 2) return;
    setNewQuestionOptions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleCreateQuestion = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeStepDetails?.quiz || newQuestionText.trim().length < 4) return;

    const validOptions = newQuestionOptions.filter((o) => o.text.trim().length > 0);
    if (validOptions.length < 2) {
      alert("At least 2 options are required.");
      return;
    }
    if (!validOptions.some((o) => o.isCorrect)) {
      alert("Please mark at least one option as the correct answer.");
      return;
    }

    setIsAddingQuestion(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/quizzes/${activeStepDetails.quiz.id}/questions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          text: newQuestionText.trim(),
          points: Number(newQuestionPoints) || 1,
          explanation: newQuestionExplanation.trim() || undefined,
          options: validOptions.map((o, idx) => ({
            text: o.text.trim(),
            isCorrect: o.isCorrect,
            order: idx + 1,
          })),
        }),
      });

      if (res.ok) {
        const createdQ = await res.json();
        setActiveQuizQuestions((prev) => [...prev, createdQ]);
        setNewQuestionText("");
        setNewQuestionExplanation("");
        setNewQuestionOptions([
          { text: "", isCorrect: true },
          { text: "", isCorrect: false },
          { text: "", isCorrect: false },
        ]);
      } else {
        alert("Failed to add question.");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsAddingQuestion(false);
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!activeStepDetails?.quiz || !confirm("Delete this question?")) return;
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/quizzes/${activeStepDetails.quiz.id}/questions/${questionId}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        setActiveQuizQuestions((prev) => prev.filter((q) => q.id !== questionId));
      } else {
        alert("Failed to delete question.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteQuiz = async () => {
    if (!activeStepDetails?.quiz || !confirm("Delete this knowledge check quiz completely?")) return;
    try {
      const res = await fetch(`${API_URL}/quizzes/${activeStepDetails.quiz.id}`, { method: "DELETE" });
      if (res.ok) {
        selectStep(activeStepDetails);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Filter tree items by search
  const filteredSteps = steps.filter((s) => {
    if (!treeSearch) return true;
    const matchStep = s.title.toLowerCase().includes(treeSearch.toLowerCase());
    const matchLessons = (s.lessons || []).some((l) => l.title.toLowerCase().includes(treeSearch.toLowerCase()));
    return matchStep || matchLessons;
  });

  const activeLesson = activeStepDetails?.lessons?.find((l) => l.id === selectedEntity?.lessonId);

  return (
    <div className={styles.studioLayout}>
      {/* ===================================================================
          1. Studio Top Navigation Bar
          =================================================================== */}
      <header className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <Link href="/programs" className={styles.backBtn}>
            <span>&larr;</span>
            <span>Programs</span>
          </Link>

          <div className={styles.breadcrumbs}>
            <span className={styles.breadcrumbRoot}>Curriculum Studio</span>
            <span className={styles.breadcrumbDivider}>/</span>
            <span className={styles.breadcrumbCurrent}>{programTitle}</span>
          </div>

          <span className={styles.saveBadge}>
            <span>✓</span>
            <span>Cloud Synced</span>
          </span>
        </div>

        <div className={styles.topBarRight}>
          <a
            href={`http://localhost:3000/programs/${programId}/steps`}
            target="_blank"
            rel="noreferrer"
            className={styles.previewLmsBtn}
            title="Preview as a learner in the LMS"
          >
            <span>👁</span>
            <span>Preview in LMS</span>
          </a>

          <button
            type="button"
            className={styles.primaryActionBtn}
            onClick={() => setIsAddStepModalOpen(true)}
          >
            <span>+</span>
            <span>Add Module</span>
          </button>
        </div>
      </header>

      {/* ===================================================================
          2. Three-Panel Studio Layout Frame
          =================================================================== */}
      <div className={styles.mainStudioFrame}>
        {/* =================================================================
            LEFT PANEL: Curriculum Tree Explorer (VS Code / Notion style)
            ================================================================= */}
        <aside className={styles.treePanel}>
          <div className={styles.treePanelHeader}>
            <span className={styles.treePanelTitle}>Curriculum Tree</span>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--accent-primary)" }}>
              {steps.length} {steps.length === 1 ? "Module" : "Modules"}
            </span>
          </div>

          <div className={styles.treeSearchWrap}>
            <input
              type="text"
              className={styles.treeSearchInput}
              placeholder="Filter modules or lessons..."
              value={treeSearch}
              onChange={(e) => setTreeSearch(e.target.value)}
            />
          </div>

          <div className={styles.treeItemsScroll}>
            {filteredSteps.map((step) => {
              const isSelected = selectedEntity?.stepId === step.id && selectedEntity?.type === "STEP";
              const isExpanded = expandedSteps[step.id] ?? true;
              const lessonCount = (step.lessons?.length || 0) + (step.quiz ? 1 : 0);

              return (
                <div
                  key={step.id}
                  className={`${styles.moduleAccordion} ${isSelected ? styles.moduleAccordionActive : ""}`}
                >
                  {/* Module Header Row */}
                  <div
                    className={styles.moduleHeaderRow}
                    onClick={() => selectStep(step)}
                  >
                    <div className={styles.moduleTitleBlock}>
                      <span
                        className={styles.chevronBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(step.id);
                        }}
                      >
                        {isExpanded ? "▼" : "▶"}
                      </span>
                      <span className={styles.moduleSeqBadge}>M{step.sequence}</span>
                      <span className={styles.moduleTitleText}>{step.title}</span>
                    </div>

                    <span className={styles.moduleCountBadge}>{lessonCount}</span>
                  </div>

                  {/* Nested Lessons (Expanded) */}
                  {isExpanded && (
                    <div className={styles.moduleLessonsList}>
                      {step.lessons?.map((lesson) => {
                        const isLessonSelected =
                          selectedEntity?.stepId === step.id &&
                          selectedEntity?.type === "LESSON" &&
                          selectedEntity?.lessonId === lesson.id;

                        const icon = lesson.type === "VIDEO" ? "🎬" : lesson.type === "PDF" ? "📄" : "📝";

                        return (
                          <div
                            key={lesson.id}
                            className={`${styles.lessonTreeItem} ${
                              isLessonSelected ? styles.lessonTreeItemActive : ""
                            }`}
                            onClick={() => selectLesson(step.id, lesson)}
                          >
                            <div className={styles.lessonTreeLeft}>
                              <span>{icon}</span>
                              <span className={styles.lessonTreeTitle}>{lesson.title}</span>
                            </div>
                            <span className={styles.lessonTreeMeta}>{lesson.type}</span>
                          </div>
                        );
                      })}

                      {/* Quiz Item in Tree */}
                      {step.quiz && (
                        <div
                          className={`${styles.lessonTreeItem} ${
                            selectedEntity?.stepId === step.id && selectedEntity?.type === "QUIZ"
                              ? styles.lessonTreeItemActive
                              : ""
                          }`}
                          onClick={() => selectQuiz(step.id, step.quiz!)}
                        >
                          <div className={styles.lessonTreeLeft}>
                            <span>🧠</span>
                            <span className={styles.lessonTreeTitle}>
                              {step.quiz.title || "Knowledge Check Quiz"}
                            </span>
                          </div>
                          <span className={styles.lessonTreeMeta}>QUIZ</span>
                        </div>
                      )}

                      {/* Quick Add In-Tree */}
                      <button
                        type="button"
                        className={styles.addLessonInTreeBtn}
                        onClick={() => selectStep(step)}
                      >
                        + Add Content to M{step.sequence}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className={styles.treePanelFooter}>
            <button
              type="button"
              className={styles.newModuleDashedBtn}
              onClick={() => setIsAddStepModalOpen(true)}
            >
              <span>+</span>
              <span>Create New Module</span>
            </button>
          </div>
        </aside>

        {/* =================================================================
            CENTER CANVAS: Interactive Content & Lesson Editor
            ================================================================= */}
        <main className={styles.canvasPanel}>
          {videoUploadProgress !== null && (
            <div className={styles.progressRow}>
              <span style={{ fontSize: "1.2rem" }}>🎬</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>{videoUploadStatus}</span>
                  <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>{videoUploadProgress}%</span>
                </div>
                <div className={styles.progressBarTrack}>
                  <div className={styles.progressBarFill} style={{ width: `${videoUploadProgress}%` }} />
                </div>
              </div>
            </div>
          )}

          {pdfUploadStatus && (
            <div className={styles.progressRow} style={{ background: "#fef3c7" }}>
              <span style={{ fontSize: "1.2rem" }}>📄</span>
              <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#92400e" }}>{pdfUploadStatus}</span>
            </div>
          )}

          {/* ===============================================================
              CANVAS VIEW 1: Module Selected (Overview & Launchpad)
              =============================================================== */}
          {selectedEntity?.type === "STEP" && activeStepDetails && (
            <div className={styles.canvasCard}>
              <div className={styles.canvasHeader}>
                <div className={styles.canvasHeaderTitleArea}>
                  <h2>Module {activeStepDetails.sequence}: {activeStepDetails.title}</h2>
                  <p>{activeStepDetails.description || "No module objective added yet."}</p>
                </div>
                <button
                  type="button"
                  style={{ background: "none", border: "1px solid #fee2e2", color: "#dc2626", borderRadius: 8, padding: "0.4rem 0.75rem", fontSize: "0.8rem", cursor: "pointer", fontWeight: 600 }}
                  onClick={() => handleDeleteStep(activeStepDetails.id)}
                >
                  Delete Module
                </button>
              </div>

              {/* Quick Content Launchpad */}
              <h4 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "0 0 0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Add Module Learning Material
              </h4>

              <div className={styles.launchpadGrid}>
                <div className={styles.launchpadCard} onClick={() => setIsVideoModalOpen(true)}>
                  <span className={styles.launchpadIcon}>🎬</span>
                  <span className={styles.launchpadTitle}>Video Lecture</span>
                  <span className={styles.launchpadDesc}>Upload MP4 or authenticated video lecture with stream optimization</span>
                </div>

                <div className={styles.launchpadCard} onClick={() => setIsPdfModalOpen(true)}>
                  <span className={styles.launchpadIcon}>📄</span>
                  <span className={styles.launchpadTitle}>PDF Document</span>
                  <span className={styles.launchpadDesc}>Attach downloadable worksheets, reading slides, or reference briefs</span>
                </div>

                <div
                  className={styles.launchpadCard}
                  onClick={() => {
                    if (activeStepDetails.quiz) {
                      selectQuiz(activeStepDetails.id, activeStepDetails.quiz);
                    } else {
                      handleCreateStepQuiz();
                    }
                  }}
                >
                  <span className={styles.launchpadIcon}>🧠</span>
                  <span className={styles.launchpadTitle}>Knowledge Check</span>
                  <span className={styles.launchpadDesc}>
                    {activeStepDetails.quiz ? "Edit questions & pass mark in Quiz Builder" : "Create step gate quiz with pass mark requirement"}
                  </span>
                </div>
              </div>

              {/* Lessons Table */}
              <h4 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "1.5rem 0 0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Content Attached to this Module ({activeStepDetails.lessons?.length || 0})
              </h4>

              {(!activeStepDetails.lessons || activeStepDetails.lessons.length === 0) && !activeStepDetails.quiz ? (
                <div style={{ textAlign: "center", padding: "2rem", background: "var(--bg-main)", borderRadius: 14 }}>
                  <p style={{ margin: 0, color: "var(--text-secondary)" }}>
                    No content added to this module yet. Click any launchpad card above to add videos, PDFs, or quizzes.
                  </p>
                </div>
              ) : (
                <div style={{ border: "1px solid var(--border-light)", borderRadius: 12, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
                    <thead>
                      <tr style={{ background: "var(--bg-sidebar)", textAlign: "left", borderBottom: "1px solid var(--border-light)" }}>
                        <th style={{ padding: "0.75rem 1rem" }}>Content Title</th>
                        <th style={{ padding: "0.75rem 1rem" }}>Type</th>
                        <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeStepDetails.lessons?.map((l) => (
                        <tr key={l.id} style={{ borderBottom: "1px solid var(--border-light)" }}>
                          <td style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>{l.title}</td>
                          <td style={{ padding: "0.75rem 1rem" }}>
                            <span style={{ fontSize: "0.75rem", fontWeight: 700, padding: "2px 8px", borderRadius: 9999, background: "var(--bg-soft)", color: "var(--accent-highlight-text)" }}>
                              {l.type}
                            </span>
                          </td>
                          <td style={{ padding: "0.75rem 1rem", textAlign: "right" }}>
                            <button
                              type="button"
                              onClick={() => selectLesson(activeStepDetails.id, l)}
                              style={{ background: "none", border: "none", color: "var(--accent-primary)", fontWeight: 700, cursor: "pointer", marginRight: "1rem" }}
                            >
                              Edit / Preview &rarr;
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteLesson(l.id)}
                              style={{ background: "none", border: "none", color: "#dc2626", fontWeight: 600, cursor: "pointer" }}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}

                      {activeStepDetails.quiz && (
                        <tr style={{ background: "var(--bg-sidebar)" }}>
                          <td style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>
                            🧠 {activeStepDetails.quiz.title || "Knowledge Check Quiz"}
                          </td>
                          <td style={{ padding: "0.75rem 1rem" }}>
                            <span style={{ fontSize: "0.75rem", fontWeight: 700, padding: "2px 8px", borderRadius: 9999, background: "#fef3c7", color: "#92400e" }}>
                              QUIZ
                            </span>
                          </td>
                          <td style={{ padding: "0.75rem 1rem", textAlign: "right" }}>
                            <button
                              type="button"
                              onClick={() => selectQuiz(activeStepDetails.id, activeStepDetails.quiz!)}
                              style={{ background: "none", border: "none", color: "var(--accent-primary)", fontWeight: 700, cursor: "pointer", marginRight: "1rem" }}
                            >
                              Open Quiz Builder &rarr;
                            </button>
                            <button
                              type="button"
                              onClick={handleDeleteQuiz}
                              style={{ background: "none", border: "none", color: "#dc2626", fontWeight: 600, cursor: "pointer" }}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ===============================================================
              CANVAS VIEW 2: Video Lesson Editor & Preview
              =============================================================== */}
          {selectedEntity?.type === "LESSON" && activeLesson?.type === "VIDEO" && (
            <div className={styles.canvasCard}>
              <div className={styles.canvasHeader}>
                <div className={styles.canvasHeaderTitleArea}>
                  <h2>Video Lesson: {activeLesson.title}</h2>
                  <p>Stream-optimized video lecture with learner security watermarking</p>
                </div>
                <button
                  type="button"
                  style={{ background: "none", border: "1px solid #fee2e2", color: "#dc2626", borderRadius: 8, padding: "0.4rem 0.75rem", fontSize: "0.8rem", cursor: "pointer", fontWeight: 600 }}
                  onClick={() => handleDeleteLesson(activeLesson.id)}
                >
                  Delete Video Lesson
                </button>
              </div>

              {/* Video Player Preview */}
              <div style={{ background: "#000000", borderRadius: 16, overflow: "hidden", aspectRatio: "16 / 9", marginBottom: "1.5rem" }}>
                {activeLesson.mediaUrl.startsWith("upload:") ? (
                  <video
                    controls
                    style={{ width: "100%", height: "100%" }}
                    src={`${API_URL}/media/stream/${activeLesson.mediaUrl.replace("upload:", "")}.mp4`}
                  />
                ) : (
                  <video controls style={{ width: "100%", height: "100%" }} src={activeLesson.mediaUrl} />
                )}
              </div>

              <div style={{ display: "flex", gap: "1rem" }}>
                <label className={styles.primaryActionBtn} style={{ cursor: "pointer" }}>
                  <span>🔄 Replace Video Asset</span>
                  <input type="file" accept="video/*" onChange={handleUploadVideo} style={{ display: "none" }} />
                </label>
              </div>
            </div>
          )}

          {/* ===============================================================
              CANVAS VIEW 3: PDF Document Editor & Preview
              =============================================================== */}
          {selectedEntity?.type === "LESSON" && activeLesson?.type === "PDF" && (
            <div className={styles.canvasCard}>
              <div className={styles.canvasHeader}>
                <div className={styles.canvasHeaderTitleArea}>
                  <h2>Reference Document: {activeLesson.title}</h2>
                  <p>PDF learning resource with completion tracking</p>
                </div>
                <button
                  type="button"
                  style={{ background: "none", border: "1px solid #fee2e2", color: "#dc2626", borderRadius: 8, padding: "0.4rem 0.75rem", fontSize: "0.8rem", cursor: "pointer", fontWeight: 600 }}
                  onClick={() => handleDeleteLesson(activeLesson.id)}
                >
                  Delete PDF
                </button>
              </div>

              <div style={{ background: "var(--bg-main)", padding: "2.5rem", borderRadius: 16, textAlign: "center", marginBottom: "1.5rem" }}>
                <span style={{ fontSize: "3rem", display: "block", marginBottom: "0.5rem" }}>📄</span>
                <h3 style={{ margin: "0 0 0.5rem", fontSize: "1.2rem" }}>{activeLesson.title}.pdf</h3>
                <a
                  href={activeLesson.mediaUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--accent-primary)", fontWeight: 700, fontSize: "0.9rem" }}
                >
                  Open PDF Asset in New Tab &rarr;
                </a>
              </div>

              <label className={styles.primaryActionBtn} style={{ cursor: "pointer", alignSelf: "flex-start" }}>
                <span>🔄 Replace PDF File</span>
                <input type="file" accept="application/pdf" onChange={handleUploadPdf} style={{ display: "none" }} />
              </label>
            </div>
          )}

          {/* ===============================================================
              CANVAS VIEW 4: IN-LINE GOOGLE-FORMS STYLE QUIZ BUILDER!
              =============================================================== */}
          {selectedEntity?.type === "QUIZ" && activeStepDetails?.quiz && (
            <div className={styles.canvasCard}>
              <div className={styles.canvasHeader}>
                <div className={styles.canvasHeaderTitleArea}>
                  <h2>Quiz Builder: {activeStepDetails.quiz.title || "Module Knowledge Check"}</h2>
                  <p>Build questions, choices, and pass criteria directly inline with zero page reloads</p>
                </div>

                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    style={{ background: "none", border: "1px solid #fee2e2", color: "#dc2626", borderRadius: 8, padding: "0.4rem 0.75rem", fontSize: "0.8rem", cursor: "pointer", fontWeight: 600 }}
                    onClick={handleDeleteQuiz}
                  >
                    Delete Quiz
                  </button>
                </div>
              </div>

              {/* Quiz Configuration Bar */}
              <form onSubmit={handleSaveQuizSettings} style={{ background: "var(--bg-sidebar)", padding: "1.25rem", borderRadius: 14, marginBottom: "1.75rem", border: "1px solid var(--border-light)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem", alignItems: "flex-end" }}>
                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                      Pass Mark (%)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={quizPassMark}
                      onChange={(e) => setQuizPassMark(Number(e.target.value))}
                      className={styles.propertyInput}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                      Max Attempts Allowed
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={quizMaxAttempts}
                      onChange={(e) => setQuizMaxAttempts(Number(e.target.value))}
                      className={styles.propertyInput}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                      Cooldown Window (Hours)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={72}
                      value={quizCooldown}
                      onChange={(e) => setQuizCooldown(Number(e.target.value))}
                      className={styles.propertyInput}
                    />
                  </div>

                  <div>
                    <button
                      type="submit"
                      disabled={isSavingQuizSettings}
                      className={styles.primaryActionBtn}
                      style={{ height: "38px", width: "100%", justifyContent: "center" }}
                    >
                      {isSavingQuizSettings ? "Saving..." : "Save Settings"}
                    </button>
                  </div>
                </div>

                {quizFeedbackMessage && (
                  <p style={{ margin: "0.75rem 0 0", color: "#15803d", fontSize: "0.85rem", fontWeight: 600 }}>
                    {quizFeedbackMessage}
                  </p>
                )}
              </form>

              {/* Questions List (Google Forms style cards) */}
              <h4 style={{ fontSize: "0.9rem", fontWeight: 800, margin: "0 0 1rem", color: "var(--text-primary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Quiz Questions ({activeQuizQuestions.length})
              </h4>

              {isQuizLoading ? (
                <div className="skeleton" style={{ height: 160, borderRadius: 16, marginBottom: 16 }} />
              ) : activeQuizQuestions.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem", background: "var(--bg-main)", borderRadius: 14, marginBottom: "1.5rem" }}>
                  <p style={{ margin: 0, color: "var(--text-secondary)" }}>
                    No questions added yet. Use the question authoring card below to add your first question!
                  </p>
                </div>
              ) : (
                <div className={styles.quizQuestionsList}>
                  {activeQuizQuestions.map((q, qIdx) => (
                    <div key={q.id} className={styles.questionCard}>
                      <div className={styles.questionTopBar}>
                        <span className={styles.questionNumberBadge}>Question {qIdx + 1}</span>
                        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{q.points || 1} Pt</span>
                      </div>

                      <p style={{ fontSize: "1rem", fontWeight: 700, margin: 0 }}>{q.text}</p>

                      <div className={styles.optionsList}>
                        {q.options?.map((opt, oIdx) => (
                          <div key={oIdx} className={styles.optionRow}>
                            <input
                              type="radio"
                              name={`q_${q.id}`}
                              checked={opt.isCorrect}
                              readOnly
                              className={styles.correctRadio}
                            />
                            <span style={{ fontSize: "0.9rem", fontWeight: opt.isCorrect ? 700 : 400, color: opt.isCorrect ? "#15803d" : "inherit" }}>
                              {opt.text} {opt.isCorrect && "✓ (Correct Answer)"}
                            </span>
                          </div>
                        ))}
                      </div>

                      {q.explanation && (
                        <div style={{ fontSize: "0.82rem", background: "var(--bg-soft)", padding: "0.5rem 0.75rem", borderRadius: 8, color: "var(--text-secondary)" }}>
                          <strong>Explanation:</strong> {q.explanation}
                        </div>
                      )}

                      <div className={styles.questionCardFooter}>
                        <button
                          type="button"
                          className={`${styles.cardFooterBtn} ${styles.cardFooterBtnDanger}`}
                          onClick={() => handleDeleteQuestion(q.id)}
                        >
                          Delete Question
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Question Authoring Form */}
              <form onSubmit={handleCreateQuestion} style={{ border: "2px dashed #ebd9c0", padding: "1.5rem", borderRadius: 18, background: "#ffffff" }}>
                <h4 style={{ margin: "0 0 1rem", fontSize: "1.05rem", fontWeight: 700 }}>
                  + Add New Question
                </h4>

                <div style={{ marginBottom: "1rem" }}>
                  <label style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                    Question Prompt
                  </label>
                  <textarea
                    rows={2}
                    required
                    placeholder="e.g. Which of the following best defines strategic emotional agility?"
                    className={styles.questionInput}
                    value={newQuestionText}
                    onChange={(e) => setNewQuestionText(e.target.value)}
                  />
                </div>

                <div style={{ marginBottom: "1rem" }}>
                  <label style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                    Answer Options (Select the correct radio choice)
                  </label>

                  <div className={styles.optionsList}>
                    {newQuestionOptions.map((opt, idx) => (
                      <div key={idx} className={styles.optionRow}>
                        <input
                          type="radio"
                          name="new_question_correct"
                          checked={opt.isCorrect}
                          onChange={() => {
                            setNewQuestionOptions((prev) =>
                              prev.map((o, i) => ({ ...o, isCorrect: i === idx }))
                            );
                          }}
                          className={styles.correctRadio}
                          title="Mark this option as correct"
                        />
                        <input
                          type="text"
                          required
                          placeholder={`Option ${idx + 1}`}
                          className={styles.optionInput}
                          value={opt.text}
                          onChange={(e) => {
                            const val = e.target.value;
                            setNewQuestionOptions((prev) =>
                              prev.map((o, i) => (i === idx ? { ...o, text: val } : o))
                            );
                          }}
                        />
                        {newQuestionOptions.length > 2 && (
                          <button
                            type="button"
                            className={styles.removeOptionBtn}
                            onClick={() => handleRemoveQuestionOption(idx)}
                            title="Remove Option"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    className={styles.addOptionBtn}
                    onClick={handleAddQuestionOption}
                  >
                    + Add Another Choice
                  </button>
                </div>

                <div style={{ marginBottom: "1.25rem" }}>
                  <label style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                    Explanation / Solution Guidance (Shown upon submission)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Emotional agility allows leaders to respond rather than react under stress."
                    className={styles.propertyInput}
                    value={newQuestionExplanation}
                    onChange={(e) => setNewQuestionExplanation(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isAddingQuestion}
                  className={styles.primaryActionBtn}
                  style={{ width: "100%", justifyContent: "center", padding: "0.75rem" }}
                >
                  {isAddingQuestion ? "Adding Question..." : "+ Append Question to Quiz"}
                </button>
              </form>
            </div>
          )}
        </main>

        {/* =================================================================
            RIGHT PANEL: Properties & Inspector
            ================================================================= */}
        <aside className={styles.inspectorPanel}>
          <div className={styles.inspectorHeader}>
            <h3 className={styles.inspectorTitle}>Inspector</h3>
            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>LIVE CONFIG</span>
          </div>

          {selectedEntity?.type === "STEP" && activeStepDetails && (
            <>
              <div className={styles.propertyGroup}>
                <label className={styles.propertyLabel}>Module Title</label>
                <input
                  type="text"
                  className={styles.propertyInput}
                  value={activeStepDetails.title}
                  readOnly
                />
              </div>

              <div className={styles.propertyGroup}>
                <label className={styles.propertyLabel}>Curriculum Sequence</label>
                <input
                  type="text"
                  className={styles.propertyInput}
                  value={`Step ${activeStepDetails.sequence}`}
                  readOnly
                />
              </div>

              <div className={styles.propertyGroup}>
                <label className={styles.propertyLabel}>Learner Objective</label>
                <textarea
                  rows={4}
                  className={styles.propertyInput}
                  value={activeStepDetails.description || "None specified"}
                  readOnly
                />
              </div>

              <div className={styles.propertyGroup}>
                <label className={styles.propertyLabel}>Release Schedule</label>
                <select className={styles.propertySelect} defaultValue="IMMEDIATE">
                  <option value="IMMEDIATE">Immediate Unlock</option>
                  <option value="COHORT_START_RELATIVE">Cohort Relative (Delay Days)</option>
                  <option value="SPECIFIC_DATE">Scheduled Date Release</option>
                </select>
              </div>

              <div className={styles.propertyGroup}>
                <label className={styles.propertyLabel}>Attached Units</label>
                <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>
                  {activeStepDetails.lessons?.length || 0} Lessons &bull; {activeStepDetails.quiz ? "1 Quiz" : "No Quiz"}
                </span>
              </div>
            </>
          )}

          {selectedEntity?.type === "LESSON" && activeLesson && (
            <>
              <div className={styles.propertyGroup}>
                <label className={styles.propertyLabel}>Lesson Title</label>
                <input
                  type="text"
                  className={styles.propertyInput}
                  value={activeLesson.title}
                  readOnly
                />
              </div>

              <div className={styles.propertyGroup}>
                <label className={styles.propertyLabel}>Content Format</label>
                <input
                  type="text"
                  className={styles.propertyInput}
                  value={activeLesson.type}
                  readOnly
                />
              </div>

              <div className={styles.propertyGroup}>
                <label className={styles.propertyLabel}>Storage Pointer</label>
                <input
                  type="text"
                  className={styles.propertyInput}
                  value={activeLesson.mediaUrl}
                  readOnly
                />
              </div>
            </>
          )}

          {selectedEntity?.type === "QUIZ" && activeStepDetails?.quiz && (
            <>
              <div className={styles.propertyGroup}>
                <label className={styles.propertyLabel}>Pass Requirement</label>
                <span style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--accent-primary)" }}>
                  {quizPassMark}%
                </span>
              </div>

              <div className={styles.propertyGroup}>
                <label className={styles.propertyLabel}>Attempts Allowed</label>
                <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                  {quizMaxAttempts} Attempt(s)
                </span>
              </div>

              <div className={styles.propertyGroup}>
                <label className={styles.propertyLabel}>Retake Cooldown</label>
                <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                  {quizCooldown} Hours
                </span>
              </div>
            </>
          )}

          <div style={{ marginTop: "auto", paddingTop: "1rem", borderTop: "1px solid var(--border-light)" }}>
            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
              Keyboard shortcuts:
              <br />
              <kbd style={{ background: "var(--bg-soft)", padding: "1px 4px", borderRadius: 4 }}>Ctrl + S</kbd> to save
            </span>
          </div>
        </aside>
      </div>

      {/* ===================================================================
          MODALS & SLIDE-OVER DRAWERS
          =================================================================== */}

      {/* CREATE MODULE MODAL */}
      {isAddStepModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsAddStepModalOpen(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Create Course Module</h3>
              <button
                className={styles.modalCloseBtn}
                onClick={() => setIsAddStepModalOpen(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateStep}>
              <div className={styles.modalBody}>
                <div className={styles.propertyGroup}>
                  <label className={styles.propertyLabel}>Module Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Module 1: Foundations of Ethical Leadership"
                    className={styles.propertyInput}
                    value={newStepTitle}
                    onChange={(e) => setNewStepTitle(e.target.value)}
                    autoFocus
                  />
                </div>

                <div className={styles.propertyGroup}>
                  <label className={styles.propertyLabel}>Module Overview &amp; Learning Objectives</label>
                  <textarea
                    rows={3}
                    placeholder="What competencies and insights will the learner acquire in this module?"
                    className={styles.propertyInput}
                    value={newStepDesc}
                    onChange={(e) => setNewStepDesc(e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  style={{ background: "none", border: "none", color: "var(--text-secondary)", fontWeight: 600, cursor: "pointer" }}
                  onClick={() => setIsAddStepModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingStep}
                  className={styles.primaryActionBtn}
                >
                  {isSavingStep ? "Creating..." : "Create Module →"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD VIDEO MODAL */}
      {isVideoModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsVideoModalOpen(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Add Video Lecture</h3>
              <button
                className={styles.modalCloseBtn}
                onClick={() => setIsVideoModalOpen(false)}
              >
                ×
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.propertyGroup}>
                <label className={styles.propertyLabel}>Lesson Title</label>
                <input
                  type="text"
                  placeholder="e.g. Masterclass Lecture 1: Core Framework"
                  className={styles.propertyInput}
                  value={videoTitle}
                  onChange={(e) => setVideoTitle(e.target.value)}
                />
              </div>

              <label className={styles.uploadDropzone}>
                <span className={styles.dropzoneIcon}>🎬</span>
                <span className={styles.dropzoneTitle}>Choose Video File to Upload</span>
                <span className={styles.dropzoneHint}>MP4, MOV, or WEBM up to 2GB</span>
                <input
                  type="file"
                  accept="video/*"
                  onChange={handleUploadVideo}
                  style={{ display: "none" }}
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* ADD PDF MODAL */}
      {isPdfModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsPdfModalOpen(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Add PDF Document</h3>
              <button
                className={styles.modalCloseBtn}
                onClick={() => setIsPdfModalOpen(false)}
              >
                ×
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.propertyGroup}>
                <label className={styles.propertyLabel}>Document Title</label>
                <input
                  type="text"
                  placeholder="e.g. Executive Resilience Field Guide"
                  className={styles.propertyInput}
                  value={pdfTitle}
                  onChange={(e) => setPdfTitle(e.target.value)}
                />
              </div>

              <label className={styles.uploadDropzone}>
                <span className={styles.dropzoneIcon}>📄</span>
                <span className={styles.dropzoneTitle}>Choose PDF Document</span>
                <span className={styles.dropzoneHint}>PDF format up to 50MB</span>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handleUploadPdf}
                  style={{ display: "none" }}
                />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
