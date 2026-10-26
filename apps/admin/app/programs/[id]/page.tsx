"use client";

import { useEffect, useState, use, useCallback } from "react";
import styles from "./curriculum.module.css";
import Link from "next/link";
import { API_URL, errorMessage, uploadFile, cachedFetch } from "../../lib/api";
import { parseCourseInfo, formatCourseInfo } from "../courseInfo";
import { ConfirmDialog, useToast } from "../../components";

import dynamic from "next/dynamic";

// 9-Step Wizard Modular Subcomponents
import CurriculumStepper from "./components/CurriculumStepper";
import Step1CourseSetup from "./components/Step1CourseSetup";
import Step2ModuleList from "./components/Step2ModuleList";
import Step3PricingAccess from "./components/Step3PricingAccess";
import Step4ModuleDetails from "./components/Step4ModuleDetails";
import Step5AddLessonChooser, { LessonTypeChoice } from "./components/Step5AddLessonChooser";
import Step6AddVideoLesson from "./components/Step6AddVideoLesson";
import Step6AddPdfLesson from "./components/Step6AddPdfLesson";
import Step9ReviewPublish from "./components/Step9ReviewPublish";
import BackgroundUploadTray, { BackgroundUploadTask } from "./components/BackgroundUploadTray";

const Step3CreateModuleModal = dynamic(() => import("./components/Step3CreateModuleModal"), { ssr: false });
const Step7QuizBuilder = dynamic(() => import("./components/Step7QuizBuilder"), { ssr: false });
const Step8ModulePreview = dynamic(() => import("./components/Step8ModulePreview"), { ssr: false });
const FinalExamPanel = dynamic(() => import("./components/FinalExamPanel"), { ssr: false });

export type WizardStep =
  | "COURSE_SETUP"
  | "MODULE_LIST"
  | "MODULE_DETAILS"
  | "ADD_LESSON_CHOOSER"
  | "ADD_VIDEO_LESSON"
  | "ADD_PDF_LESSON"
  | "QUIZ_BUILDER"
  | "MODULE_PREVIEW"
  | "PRICING_ACCESS"
  | "REVIEW_PUBLISH";

export type ProgramTab = "MODULES" | "OVERVIEW" | "FINAL_EXAM" | "ENROLMENTS" | "ANALYTICS" | "SETTINGS";

interface Step {
  id: string;
  sequence: number;
  title: string;
  description: string;
  lessons?: any[];
  quiz?: any | null;
}

export default function CurriculumWizardPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const programId = resolvedParams.id;

  // Master Data State
  const [programData, setProgramData] = useState<any>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Program Studio Navigation Tabs (Overview, Modules & Lessons, Enrolments, Analytics, Settings)
  const [activeProgramTab, setActiveProgramTab] = useState<ProgramTab>("MODULES");

  // Active Wizard Progression State
  const [wizardStep, setWizardStep] = useState<WizardStep>("MODULE_LIST");
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [isCreateModuleModalOpen, setIsCreateModuleModalOpen] = useState(false);
  const [isCreatingModule, setIsCreatingModule] = useState(false);
  const [backgroundTasks, setBackgroundTasks] = useState<BackgroundUploadTask[]>([]);
  const toast = useToast();
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    subtitle?: string;
    description: React.ReactNode;
    confirmText?: string;
    onConfirm: () => Promise<void> | void;
  } | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  // Fetch Program & Full Steps with Lessons in parallel
  const fetchProgramAndSteps = useCallback(async () => {
    setIsLoading(true);
    try {
      // Kill Waterfall: Fetch program list and steps list simultaneously
      const [progRes, stepsRes] = await Promise.all([
        cachedFetch(`${API_URL}/programs`, { skipCache: true }),
        cachedFetch(`${API_URL}/programs/${programId}/steps`, { skipCache: true }),
      ]);

      if (progRes.ok) {
        const progs = await progRes.json();
        const found = progs.find((p: any) => p.id === programId);
        if (found) setProgramData(found);
      }

      if (stepsRes.ok) {
        const stepsData: Step[] = await stepsRes.json();
        const sorted = [...stepsData].sort((a, b) => a.sequence - b.sequence);
        setSteps(sorted);
        if (sorted.length > 0 && !activeModuleId) {
          setActiveModuleId(sorted[0]?.id ?? null);
        }
      }
    } catch (err) {
      console.error("Error loading curriculum wizard data:", err);
    } finally {
      setIsLoading(false);
    }
  }, [programId, activeModuleId]);

  useEffect(() => {
    fetchProgramAndSteps();
  }, [fetchProgramAndSteps]);

  // Determine top stepper phase (1: Basic Details, 2: Curriculum, 3: Pricing, 4: Review & Publish)
  const currentPhase: 1 | 2 | 3 | 4 =
    wizardStep === "COURSE_SETUP"
      ? 1
      : wizardStep === "PRICING_ACCESS"
      ? 3
      : wizardStep === "REVIEW_PUBLISH"
      ? 4
      : 2;

  const handleSelectPhase = (phase: 1 | 2 | 3 | 4) => {
    if (phase === 1) setWizardStep("COURSE_SETUP");
    if (phase === 2) setWizardStep("MODULE_LIST");
    if (phase === 3) setWizardStep("PRICING_ACCESS");
    if (phase === 4) setWizardStep("REVIEW_PUBLISH");
  };

  const isModuleScope =
    wizardStep === "MODULE_DETAILS" ||
    wizardStep === "MODULE_PREVIEW" ||
    wizardStep === "ADD_LESSON_CHOOSER" ||
    wizardStep === "ADD_VIDEO_LESSON" ||
    wizardStep === "ADD_PDF_LESSON" ||
    wizardStep === "QUIZ_BUILDER";

  const activeModule = steps.find((s) => s.id === activeModuleId) || (isModuleScope ? steps[0] : null);

  // ---------------------------------------------------------------------------
  // Action Handlers
  // ---------------------------------------------------------------------------

  // Save Step 1: Course Setup
  const handleSaveCourseSetup = async (updatedData: any) => {
    setIsSaving(true);
    try {
      const token = localStorage.getItem("token");

      // Format rich course metadata into structured description
      const parsed = parseCourseInfo(updatedData.description || programData?.description);
      const combinedDescription = formatCourseInfo({
        summary: updatedData.shortDescription || parsed.summary || updatedData.description || "",
        type: updatedData.category || parsed.type || "",
        duration: parsed.duration || "",
        audience: parsed.audience || "",
        inPerson: parsed.inPerson || "",
        online: parsed.online || "",
        image: updatedData.thumbnailUrl || parsed.image || "",
        points: parsed.points || [],
        faqs: updatedData.faqs || parsed.faqs || [],
      });

      const payload: Record<string, any> = {
        title: updatedData.title,
        description: combinedDescription || updatedData.description,
        price: Number(updatedData.price) || 0,
        currency: updatedData.currency || "USD",
        priceUSD: updatedData.priceUSD !== undefined ? Number(updatedData.priceUSD) : undefined,
        priceAED: updatedData.priceAED !== undefined ? Number(updatedData.priceAED) : undefined,
        priceINR: updatedData.priceINR !== undefined ? Number(updatedData.priceINR) : undefined,
        earlyBirdPrice: updatedData.earlyBirdPrice !== undefined ? Number(updatedData.earlyBirdPrice) : null,
        earlyBirdCurrency: updatedData.earlyBirdCurrency || null,
        earlyBirdDeadline: updatedData.earlyBirdDeadline ? new Date(updatedData.earlyBirdDeadline).toISOString() : null,
        hasCertificate: Boolean(updatedData.hasCertificate),
        shortDescription: updatedData.shortDescription || "",
        thumbnailUrl: updatedData.thumbnailUrl || "",
        category: updatedData.category || "",
        level: updatedData.level || "",
        faqs: updatedData.faqs || parsed.faqs || [],
      };

      const res = await fetch(`${API_URL}/programs/${programId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to update program details"));
      }

      const updated = await res.json();
      setProgramData(updated);
      setWizardStep("MODULE_LIST");
    } catch (err: any) {
      alert(err.message || "Failed to save course details");
    } finally {
      setIsSaving(false);
    }
  };

  // Save Step 3: Pricing & Access Settings
  const handleSavePricingAccess = async (updatedPricingData: any) => {
    setIsSaving(true);
    try {
      const token = localStorage.getItem("token");
      const payload: Record<string, any> = {
        price: Number(updatedPricingData.price) || 0,
        currency: updatedPricingData.currency || "USD",
        priceUSD: updatedPricingData.priceUSD !== undefined ? Number(updatedPricingData.priceUSD) : undefined,
        priceAED: updatedPricingData.priceAED !== undefined ? Number(updatedPricingData.priceAED) : undefined,
        priceINR: updatedPricingData.priceINR !== undefined ? Number(updatedPricingData.priceINR) : undefined,
        earlyBirdPrice: updatedPricingData.earlyBirdPrice !== undefined ? Number(updatedPricingData.earlyBirdPrice) : null,
        earlyBirdCurrency: updatedPricingData.earlyBirdCurrency || null,
        earlyBirdDeadline: updatedPricingData.earlyBirdDeadline ? new Date(updatedPricingData.earlyBirdDeadline).toISOString() : null,
      };

      const res = await fetch(`${API_URL}/programs/${programId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to update pricing details"));
      }

      const updated = await res.json();
      setProgramData((prev: any) => ({ ...prev, ...updated, ...updatedPricingData }));
      toast.success("Pricing and access settings saved.");
      setWizardStep("REVIEW_PUBLISH");
    } catch (err: any) {
      alert(err.message || "Failed to save pricing details");
    } finally {
      setIsSaving(false);
    }
  };

  // Update Module Title & Description
  const handleUpdateModule = async (stepId: string, updates: { title: string; description: string }) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/programs/steps/${stepId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(updates),
      });

      if (res.ok) {
        setSteps((prev) =>
          prev.map((s) => (s.id === stepId ? { ...s, ...updates } : s))
        );
        toast.success("Module updated.");
      }
    } catch (err) {
      console.error("Failed to update module:", err);
    }
  };

  // Step 3: Create Module Action
  const handleCreateModule = async (data: { title: string; description: string; sequence: number }) => {
    setIsCreatingModule(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/programs/${programId}/steps`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to create module"));
      }

      const createdStep: Step = await res.json();
      setSteps((prev) => [...prev, createdStep]);
      setIsCreateModuleModalOpen(false);
      setActiveModuleId(createdStep.id);
      setWizardStep("MODULE_DETAILS");
    } catch (err: any) {
      alert(err.message || "Failed to create module");
    } finally {
      setIsCreatingModule(false);
    }
  };

  // Background Video Upload Handler
  const handleStartBackgroundUpload = (taskInput: {
    file?: File;
    videoUrl?: string;
    title: string;
    description?: string;
    durationSec?: number | null;
    moduleId: string;
    moduleTitle: string;
  }) => {
    const taskId = `bg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newTask: BackgroundUploadTask = {
      id: taskId,
      title: taskInput.title,
      moduleTitle: taskInput.moduleTitle,
      moduleId: taskInput.moduleId,
      progress: 5,
      status: "UPLOADING",
      statusText: "Initiating upload...",
    };

    setBackgroundTasks((prev) => [newTask, ...prev]);

    (async () => {
      try {
        let publicId = taskInput.videoUrl || "";
        let finalDuration = taskInput.durationSec;
        const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

        if (taskInput.file) {
          const file = taskInput.file;
          let uploadedDirect = false;
          try {
            const sigRes = await fetch(`${API_URL}/media/upload-signature`, {
              method: "POST",
              headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            });
            if (sigRes.ok) {
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
                    const percent = Math.round((ev.loaded / ev.total) * 90);
                    setBackgroundTasks((prev) =>
                      prev.map((t) =>
                        t.id === taskId
                          ? { ...t, progress: percent, statusText: `Uploading (${percent}%)...` }
                          : t
                      )
                    );
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

              publicId = (uploadRes as any).public_id;
              if ((uploadRes as any).duration) {
                finalDuration = Math.round((uploadRes as any).duration);
              }
              uploadedDirect = true;
            }
          } catch {}

          if (!uploadedDirect) {
            setBackgroundTasks((prev) =>
              prev.map((t) =>
                t.id === taskId ? { ...t, progress: 45, statusText: "Uploading to server..." } : t
              )
            );
            const uploadedUrl = await uploadFile(file);
            publicId = uploadedUrl;
            setBackgroundTasks((prev) =>
              prev.map((t) =>
                t.id === taskId ? { ...t, progress: 90, statusText: "Processing file..." } : t
              )
            );
          }
        }

        setBackgroundTasks((prev) =>
          prev.map((t) =>
            t.id === taskId ? { ...t, progress: 95, status: "SAVING", statusText: "Attaching to module..." } : t
          )
        );

        const finalMediaUrl = taskInput.videoUrl?.trim()
          ? taskInput.videoUrl.trim()
          : publicId
          ? (publicId.startsWith("http") || publicId.startsWith("/") ? publicId : `upload:${publicId}`)
          : `upload:video-${Date.now()}`;

        const res = await cachedFetch(`${API_URL}/programs/steps/${taskInput.moduleId}/lessons`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: taskInput.title.trim(),
            type: "VIDEO",
            mediaUrl: finalMediaUrl,
            durationSec: finalDuration ?? 0,
            content: taskInput.description?.trim() || undefined,
            status: "PUBLISHED",
          }),
        });

        if (!res.ok) {
          throw new Error(await errorMessage(res, "Failed to save lesson"));
        }

        setBackgroundTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? { ...t, progress: 100, status: "COMPLETED", statusText: "Upload complete & attached!" }
              : t
          )
        );

        fetchProgramAndSteps();
      } catch (err: any) {
        setBackgroundTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? { ...t, status: "ERROR", statusText: "Upload failed", error: err.message || "Failed" }
              : t
          )
        );
      }
    })();
  };

  // Delete Module Action with in-website popup
  const handleDeleteModule = async (stepId: string) => {
    const step = steps.find((s) => s.id === stepId);
    setConfirmConfig({
      isOpen: true,
      title: "Delete Module",
      subtitle: step?.title,
      description: `Are you sure you want to delete module "${step?.title || "this module"}" and all its attached lessons? This cannot be undone.`,
      confirmText: "Delete Module",
      onConfirm: async () => {
        setIsConfirming(true);
        try {
          const res = await cachedFetch(`${API_URL}/programs/steps/${stepId}`, { method: "DELETE" });
          if (res.ok) {
            setSteps((prev) => prev.filter((s) => s.id !== stepId));
            if (activeModuleId === stepId) {
              setActiveModuleId(null);
              setWizardStep("MODULE_LIST");
            }
            toast.success("Module deleted successfully.");
          } else {
            toast.error("Failed to delete module.");
          }
        } finally {
          setIsConfirming(false);
          setConfirmConfig(null);
        }
      },
    });
  };

  // Delete Lesson Action with in-website popup
  const handleDeleteLesson = async (lessonId: string) => {
    setConfirmConfig({
      isOpen: true,
      title: "Delete Lesson",
      description: "Are you sure you want to delete this lesson from the module? This action cannot be undone.",
      confirmText: "Delete Lesson",
      onConfirm: async () => {
        setIsConfirming(true);
        try {
          const res = await cachedFetch(`${API_URL}/programs/lessons/${lessonId}`, { method: "DELETE" });
          if (res.ok) {
            toast.success("Lesson deleted successfully.");
            fetchProgramAndSteps();
          } else {
            toast.error("Failed to delete lesson.");
          }
        } finally {
          setIsConfirming(false);
          setConfirmConfig(null);
        }
      },
    });
  };

  // Delete Quiz Action with in-website popup
  const handleDeleteQuiz = async () => {
    if (!activeModule?.quiz?.id) return;
    const qId = activeModule.quiz.id;
    const targetModuleId = activeModule.id;
    setConfirmConfig({
      isOpen: true,
      title: "Delete Quiz",
      description: "Are you sure you want to delete this knowledge check quiz completely? Attached questions and learner progress will be removed.",
      confirmText: "Delete Quiz",
      onConfirm: async () => {
        setIsConfirming(true);
        try {
          const res = await cachedFetch(`${API_URL}/quizzes/${qId}`, { method: "DELETE" });
          if (res.ok) {
            setSteps((prev) =>
              prev.map((s) => (s.id === targetModuleId ? { ...s, quiz: null } : s))
            );
            toast.success("Quiz deleted successfully.");
            fetchProgramAndSteps();
          } else {
            const errData = await res.json().catch(() => ({}));
            toast.error(errData.message || "Failed to delete quiz.");
          }
        } finally {
          setIsConfirming(false);
          setConfirmConfig(null);
        }
      },
    });
  };

  // Content Type Chooser Selection
  const handleSelectLessonType = (type: LessonTypeChoice) => {
    if (type === "VIDEO") {
      setWizardStep("ADD_VIDEO_LESSON");
    } else if (type === "PDF") {
      setWizardStep("ADD_PDF_LESSON");
    } else if (type === "QUIZ") {
      setWizardStep("QUIZ_BUILDER");
    } else {
      // Default to video/text upload
      setWizardStep("ADD_VIDEO_LESSON");
    }
  };

  // Publish / Save Draft Action
  const handlePublishCourse = async (settings: {
    status: "PUBLISHED" | "DRAFT";
    startDate?: string;
    endDate?: string;
  }) => {
    setIsSaving(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/programs/${programId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          status: settings.status,
        }),
      });

      if (!res.ok) throw new Error("Failed to update course publication status");

      const updated = await res.json();
      setProgramData(updated);
    } catch (err: any) {
      alert(err.message || "Failed to update publication");
    } finally {
      setIsSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Loading & Error States
  // ---------------------------------------------------------------------------
  if (isLoading && !programData) {
    return (
      <div className={styles.wizardContainer}>
        <div style={{ maxWidth: 800, margin: "3rem auto", width: "100%" }}>
          <div className="skeleton" style={{ height: 28, width: 200, marginBottom: 16, borderRadius: 8 }} />
          <div className="skeleton" style={{ height: 48, width: "100%", marginBottom: 32, borderRadius: 12 }} />
          <div className="skeleton" style={{ height: 380, width: "100%", borderRadius: 18 }} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wizardContainer}>
      {/* ===================================================================
          1. Wizard Top Navigation & Breadcrumbs
          =================================================================== */}
      <header className={styles.wizardTopBar}>
        <nav className={styles.breadcrumbTrail} aria-label="Breadcrumbs">
          <Link href="/programs" className={styles.breadcrumbRootLink} title="Back to Programs Catalog">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
            <span>Programs</span>
          </Link>

          <span className={styles.breadcrumbChevron} aria-hidden="true">&rsaquo;</span>

          <span
            className={styles.breadcrumbCourseLink}
            onClick={() => setWizardStep("COURSE_SETUP")}
            role="button"
            tabIndex={0}
            title="Edit Course Details"
            onKeyDown={(e) => {
              if (e.key === "Enter") setWizardStep("COURSE_SETUP");
            }}
          >
            {programData?.title || "Program Details"}
          </span>

          <span className={styles.breadcrumbChevron} aria-hidden="true">&rsaquo;</span>

          {isModuleScope && activeModule && (
            <>
              <span
                className={styles.breadcrumbModuleLink}
                onClick={() => setWizardStep("MODULE_DETAILS")}
                role="button"
                tabIndex={0}
                title="View Module Lessons"
                onKeyDown={(e) => {
                  if (e.key === "Enter") setWizardStep("MODULE_DETAILS");
                }}
              >
                Module {activeModule.sequence}
              </span>
              <span className={styles.breadcrumbChevron} aria-hidden="true">&rsaquo;</span>
            </>
          )}

          <span className={styles.breadcrumbActive}>
            {wizardStep === "COURSE_SETUP"
              ? "Basic Details"
              : wizardStep === "MODULE_LIST"
              ? "Modules"
              : wizardStep === "MODULE_DETAILS"
              ? "Lessons"
              : wizardStep === "ADD_LESSON_CHOOSER"
              ? "Add Content"
              : wizardStep === "ADD_VIDEO_LESSON"
              ? "Upload Video"
              : wizardStep === "ADD_PDF_LESSON"
              ? "Upload PDF"
              : wizardStep === "QUIZ_BUILDER"
              ? "Quiz Builder"
              : wizardStep === "MODULE_PREVIEW"
              ? "Student Preview"
              : "Review & Publish"}
          </span>
        </nav>
      </header>

      {/* ===================================================================
          Screen 6: Top Horizontal Tab Bar
          =================================================================== */}
      <div className={styles.programTabBar} role="tablist" aria-label="Program Management Tabs">
        <button
          type="button"
          role="tab"
          aria-selected={activeProgramTab === "OVERVIEW"}
          className={`${styles.programTabBtn} ${activeProgramTab === "OVERVIEW" ? styles.programTabBtnActive : ""}`}
          onClick={() => setActiveProgramTab("OVERVIEW")}
        >
          Overview
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeProgramTab === "MODULES"}
          className={`${styles.programTabBtn} ${activeProgramTab === "MODULES" ? styles.programTabBtnActive : ""}`}
          onClick={() => {
            setActiveProgramTab("MODULES");
            if (wizardStep === "MODULE_PREVIEW") setWizardStep("MODULE_LIST");
          }}
        >
          Modules &amp; Lessons
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeProgramTab === "FINAL_EXAM"}
          className={`${styles.programTabBtn} ${activeProgramTab === "FINAL_EXAM" ? styles.programTabBtnActive : ""}`}
          onClick={() => setActiveProgramTab("FINAL_EXAM")}
        >
          Final Exam
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeProgramTab === "ENROLMENTS"}
          className={`${styles.programTabBtn} ${activeProgramTab === "ENROLMENTS" ? styles.programTabBtnActive : ""}`}
          onClick={() => setActiveProgramTab("ENROLMENTS")}
        >
          Enrolments
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeProgramTab === "ANALYTICS"}
          className={`${styles.programTabBtn} ${activeProgramTab === "ANALYTICS" ? styles.programTabBtnActive : ""}`}
          onClick={() => setActiveProgramTab("ANALYTICS")}
        >
          Analytics
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeProgramTab === "SETTINGS"}
          className={`${styles.programTabBtn} ${activeProgramTab === "SETTINGS" ? styles.programTabBtnActive : ""}`}
          onClick={() => {
            setActiveProgramTab("MODULES");
            setWizardStep("COURSE_SETUP");
          }}
        >
          Settings
        </button>

        <button
          type="button"
          className={styles.previewTabBtn}
          onClick={() => {
            setActiveProgramTab("MODULES");
            setWizardStep("MODULE_PREVIEW");
          }}
          title="Preview module as learner"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span>Learner Preview</span>
        </button>
      </div>

      {/* Alternate Tab Views */}
      {activeProgramTab === "FINAL_EXAM" && (
        <FinalExamPanel programId={programId} programTitle={programData?.title} />
      )}

      {activeProgramTab === "OVERVIEW" && (
        <section className={styles.cardSurface}>
          <div className={styles.cardHeaderArea}>
            <h2 className={styles.stepTitle}>Program Overview</h2>
            <p className={styles.stepSubtitle}>
              Executive snapshot of {programData?.title || "this curriculum track"}.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
            <div style={{ background: "#fdfbf7", border: "1px solid #ece6dd", borderRadius: 12, padding: "1.25rem" }}>
              <span style={{ fontSize: "0.8rem", color: "#78716a", fontWeight: 600 }}>Total Curriculum</span>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#14110f", marginTop: "4px" }}>
                {steps.length} Modules · {steps.reduce((acc, s) => acc + (s.lessons?.length || 0), 0)} Lessons
              </div>
            </div>
            <div style={{ background: "#fdfbf7", border: "1px solid #ece6dd", borderRadius: 12, padding: "1.25rem" }}>
              <span style={{ fontSize: "0.8rem", color: "#78716a", fontWeight: 600 }}>Tuition / Price</span>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#d97706", marginTop: "4px" }}>
                {programData?.currency || "USD"} ${programData?.price || 0}
              </div>
            </div>
            <div style={{ background: "#fdfbf7", border: "1px solid #ece6dd", borderRadius: 12, padding: "1.25rem" }}>
              <span style={{ fontSize: "0.8rem", color: "#78716a", fontWeight: 600 }}>Publication Status</span>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#15803d", marginTop: "4px" }}>
                {programData?.isActive ? "Live" : "Draft"}
              </div>
            </div>
          </div>

          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => setActiveProgramTab("MODULES")}
          >
            Manage Curriculum Modules -&gt;
          </button>
        </section>
      )}

      {activeProgramTab === "ENROLMENTS" && (
        <section className={styles.cardSurface}>
          <div className={styles.cardHeaderArea}>
            <h2 className={styles.stepTitle}>Active Enrolments</h2>
            <p className={styles.stepSubtitle}>
              Registered students actively advancing through this curriculum.
            </p>
          </div>
          <div style={{ padding: "2.5rem 1rem", textAlign: "center", background: "#fdfbf7", borderRadius: 12, border: "1px dashed #ece6dd", color: "#78716a" }}>
            <p style={{ margin: "0 0 0.5rem", fontWeight: 600, color: "#14110f" }}>Enrolment management active</p>
            <p style={{ margin: 0, fontSize: "0.88rem" }}>
              View learner progress, step unlocking overrides, and batch attendance.
            </p>
          </div>
        </section>
      )}

      {activeProgramTab === "ANALYTICS" && (
        <section className={styles.cardSurface}>
          <div className={styles.cardHeaderArea}>
            <h2 className={styles.stepTitle}>Learning Analytics</h2>
            <p className={styles.stepSubtitle}>
              Drop-off telemetry, compulsory video completion rates, and quiz scores.
            </p>
          </div>
          <div style={{ padding: "2.5rem 1rem", textAlign: "center", background: "#fdfbf7", borderRadius: 12, border: "1px dashed #ece6dd", color: "#78716a" }}>
            <p style={{ margin: "0 0 0.5rem", fontWeight: 600, color: "#14110f" }}>Telemetry active</p>
            <p style={{ margin: 0, fontSize: "0.88rem" }}>
              Watch heartbeat completion and quiz diagnostic scores are monitored in real time.
            </p>
          </div>
        </section>
      )}

      {/* Main Modules & Curriculum Tab */}
      {activeProgramTab === "MODULES" && (
        <>
          {/* ===================================================================
              2. Four-Phase Stepper Progress Header
              =================================================================== */}
          {wizardStep !== "MODULE_PREVIEW" && (
            <CurriculumStepper
              currentPhase={currentPhase}
              onSelectPhase={handleSelectPhase}
              isPhase1Done={Boolean(programData?.title) || currentPhase > 1}
              isPhase2Done={steps.length > 0 && currentPhase > 2}
              isPhase3Done={Boolean(programData?.price !== undefined) && currentPhase > 3}
            />
          )}

          {/* ===================================================================
              3. Guided Step Views (One Focused Screen at a Time)
              =================================================================== */}

          {/* STEP 1: Course Setup */}
          {wizardStep === "COURSE_SETUP" && (
            <Step1CourseSetup
              programData={programData}
              onSaveAndContinue={handleSaveCourseSetup}
              isSaving={isSaving}
            />
          )}

          {/* STEP 2: 2-Column Split Curriculum Builder */}
          {(wizardStep === "MODULE_LIST" || wizardStep === "MODULE_DETAILS") && (
            <Step2ModuleList
              steps={steps}
              activeModuleId={activeModuleId}
              onSelectModule={(id) => {
                setActiveModuleId(id);
              }}
              onOpenCreateModal={() => setIsCreateModuleModalOpen(true)}
              onOpenAddLessonChooser={() => setWizardStep("ADD_LESSON_CHOOSER")}
              onOpenQuizBuilder={() => setWizardStep("QUIZ_BUILDER")}
              onPreviewModule={(mod) => {
                setActiveModuleId(mod.id);
                setWizardStep("MODULE_PREVIEW");
              }}
              onDeleteModule={handleDeleteModule}
              onDeleteLesson={handleDeleteLesson}
              onDeleteQuiz={handleDeleteQuiz}
              onUpdateModule={handleUpdateModule}
              onBackToBasicDetails={() => setWizardStep("COURSE_SETUP")}
              onContinueToPricing={() => setWizardStep("PRICING_ACCESS")}
            />
          )}

          {/* STEP 3: Dedicated 2-Column Pricing & Access */}
          {wizardStep === "PRICING_ACCESS" && (
            <Step3PricingAccess
              programData={programData}
              onSaveAndContinue={handleSavePricingAccess}
              onPrevious={() => setWizardStep("MODULE_LIST")}
              isSaving={isSaving}
            />
          )}

          {/* STEP 5: Add Lesson (Content Type Chooser) */}
          {wizardStep === "ADD_LESSON_CHOOSER" && activeModule && (
            <Step5AddLessonChooser
              moduleSequence={activeModule.sequence}
              onCancel={() => setWizardStep("MODULE_LIST")}
              onSelectType={handleSelectLessonType}
            />
          )}

          {/* STEP 6: Add Video Lesson */}
          {wizardStep === "ADD_VIDEO_LESSON" && activeModule && (
            <Step6AddVideoLesson
              moduleTitle={activeModule.title}
              moduleId={activeModule.id}
              onBackToChooser={() => setWizardStep("ADD_LESSON_CHOOSER")}
              onLessonSaved={() => {
                fetchProgramAndSteps();
                setWizardStep("MODULE_LIST");
              }}
              onStartBackgroundUpload={handleStartBackgroundUpload}
            />
          )}

          {/* STEP 6 (Alt): Add PDF Lesson */}
          {wizardStep === "ADD_PDF_LESSON" && activeModule && (
            <Step6AddPdfLesson
              moduleTitle={activeModule.title}
              moduleId={activeModule.id}
              onBackToChooser={() => setWizardStep("ADD_LESSON_CHOOSER")}
              onLessonSaved={() => {
                fetchProgramAndSteps();
                setWizardStep("MODULE_LIST");
              }}
            />
          )}

          {/* STEP 7: Quiz Builder */}
          {wizardStep === "QUIZ_BUILDER" && activeModule && (
            <Step7QuizBuilder
              moduleId={activeModule.id}
              moduleTitle={activeModule.title}
              existingQuiz={activeModule.quiz}
              onBackToModule={() => setWizardStep("MODULE_LIST")}
              onQuizSaved={(updatedQuiz) => {
                if (updatedQuiz) {
                  setSteps((prev) =>
                    prev.map((s) =>
                      s.id === activeModule.id
                        ? {
                            ...s,
                            quiz: {
                              ...(s.quiz || {}),
                              ...updatedQuiz,
                              quizPlacement: updatedQuiz.quizPlacement || s.quiz?.quizPlacement,
                            },
                          }
                        : s
                    )
                  );
                }
                fetchProgramAndSteps();
                setWizardStep("MODULE_LIST");
              }}
            />
          )}

          {/* STEP 8: Student Module Preview (6-Screen Learner Flow) */}
          {wizardStep === "MODULE_PREVIEW" && activeModule && (
            <Step8ModulePreview
              module={activeModule}
              allModules={steps}
              courseTitle={programData?.title}
              onBackToEdit={() => setWizardStep("MODULE_LIST")}
              onContinueToReview={() => setWizardStep("REVIEW_PUBLISH")}
            />
          )}

          {/* STEP 4 / STEP 9: Final Review & Publish */}
          {wizardStep === "REVIEW_PUBLISH" && (
            <Step9ReviewPublish
              programData={programData}
              steps={steps}
              onBackToModules={() => setWizardStep("PRICING_ACCESS")}
              onPublish={handlePublishCourse}
              isPublishing={isSaving}
            />
          )}
        </>
      )}

      {/* ===================================================================
          STEP 3: Create Module Dialog Modal
          =================================================================== */}
      <Step3CreateModuleModal
        isOpen={isCreateModuleModalOpen}
        onClose={() => setIsCreateModuleModalOpen(false)}
        defaultSequence={steps.reduce((max, s) => Math.max(max, s.sequence), 0) + 1}
        onCreateModule={handleCreateModule}
        isCreating={isCreatingModule}
      />
      {/* Background Upload Floating Tray */}
      <BackgroundUploadTray
        tasks={backgroundTasks}
        onDismissTask={(id) => setBackgroundTasks((prev) => prev.filter((t) => t.id !== id))}
        onClearCompleted={() => setBackgroundTasks((prev) => prev.filter((t) => t.status !== "COMPLETED"))}
      />

      {/* In-website branded ConfirmDialog */}
      <ConfirmDialog
        isOpen={Boolean(confirmConfig?.isOpen)}
        onClose={() => {
          if (!isConfirming) setConfirmConfig(null);
        }}
        onConfirm={confirmConfig?.onConfirm || (() => {})}
        title={confirmConfig?.title || "Confirm Action"}
        subtitle={confirmConfig?.subtitle}
        description={confirmConfig?.description || "Are you sure you want to proceed?"}
        confirmText={isConfirming ? "Processing..." : confirmConfig?.confirmText || "Confirm"}
        cancelText="Cancel"
        tone="danger"
        isLoading={isConfirming}
      />
    </div>
  );
}
