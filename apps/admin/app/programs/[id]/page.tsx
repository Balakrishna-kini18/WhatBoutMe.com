"use client";

import { useEffect, useState, use, useCallback } from "react";
import styles from "./curriculum.module.css";
import Link from "next/link";
import { API_URL, errorMessage, uploadFile, cachedFetch } from "../../lib/api";
import { parseCourseInfo, formatCourseInfo, sanitizeCleanSummary } from "../courseInfo";
import { ConfirmDialog, useToast, StatusBadge } from "../../components";

import dynamic from "next/dynamic";

// 9-Step Wizard Modular Subcomponents

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
const ProgramSettingsPanel = dynamic(() => import("./components/ProgramSettingsPanel"), { ssr: false });
const ProgramEnrolmentsPanel = dynamic(() => import("./components/ProgramEnrolmentsPanel"), { ssr: false });
const ProgramAnalyticsPanel = dynamic(() => import("./components/ProgramAnalyticsPanel"), { ssr: false });
const ProgramCertificatePanel = dynamic(() => import("./components/ProgramCertificatePanel"), { ssr: false });


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

export type ProgramTab =
  | "DETAILS"
  | "STEPS"
  | "FINAL_EXAM"

  | "CERTIFICATE"
  | "PUBLISH";

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
  const [activeProgramTab, setActiveProgramTab] = useState<ProgramTab>("DETAILS");

  // Active Wizard Progression State
  const [wizardStep, setWizardStep] = useState<WizardStep>("MODULE_LIST");
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [isCreateModuleModalOpen, setIsCreateModuleModalOpen] = useState(false);
  const [isCreatingModule, setIsCreatingModule] = useState(false);
  const [backgroundTasks, setBackgroundTasks] = useState<BackgroundUploadTask[]>([]);
  const [editingLesson, setEditingLesson] = useState<any | null>(null);
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
      // Kill Waterfall: Fetch program details and steps list simultaneously
      const [progRes, stepsRes] = await Promise.all([
        cachedFetch(`${API_URL}/programs/${programId}`, { skipCache: true }),
        cachedFetch(`${API_URL}/programs/${programId}/steps`, { skipCache: true }),
      ]);

      if (progRes.ok) {
        const prog = await progRes.json();
        setProgramData(prog);
      } else {
        const listRes = await cachedFetch(`${API_URL}/programs`, { skipCache: true });
        if (listRes.ok) {
          const progs = await listRes.json();
          const found = progs.find((p: any) => p.id === programId);
          if (found) setProgramData(found);
        }
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
      const parsed = parseCourseInfo(programData?.description);
      const cleanSummary = sanitizeCleanSummary(updatedData.description || updatedData.shortDescription || parsed.summary || "");
      const cleanShort = sanitizeCleanSummary(updatedData.shortDescription || parsed.short || "");
      const combinedDescription = formatCourseInfo({
        summary: cleanSummary,
        short: cleanShort,
        type: updatedData.category || parsed.type || "Certification",
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
        requireExam: updatedData.requireExam !== undefined ? Boolean(updatedData.requireExam) : undefined,
        requireCoaching: updatedData.requireCoaching !== undefined ? Boolean(updatedData.requireCoaching) : undefined,
        requireMissionStatement: updatedData.requireMissionStatement !== undefined ? Boolean(updatedData.requireMissionStatement) : undefined,
        sequentialProgressionEnabled: updatedData.sequentialProgressionEnabled !== undefined ? Boolean(updatedData.sequentialProgressionEnabled) : undefined,
        attendanceRequired: updatedData.attendanceRequired !== undefined ? Boolean(updatedData.attendanceRequired) : undefined,
        attendanceThreshold: updatedData.attendanceThreshold !== undefined ? Number(updatedData.attendanceThreshold) : undefined,
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
      setProgramData((prev: any) => ({ ...prev, ...updated }));
      toast.success(programData?.isActive ? "Program details updated." : "Program details saved to draft.");
      setActiveProgramTab("STEPS");
    } catch (err: any) {
      toast.error(err.message || "Failed to save course details");
    } finally {
      setIsSaving(false);
    }
  };

  // Dedicated Program Progression & Milestone Settings Handler
  const handleUpdateProgramSettings = async (updatedSettings: any) => {
    setIsSaving(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/programs/${programId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(updatedSettings),
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to update program progression settings"));
      }

      const updated = await res.json();
      setProgramData((prev: any) => ({ ...prev, ...updated, ...updatedSettings }));
    } catch (err: any) {
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  // Save Pricing & Access Settings
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
        deliveryMode: updatedPricingData.deliveryMode,
        sequentialProgressionEnabled: updatedPricingData.sequentialProgressionEnabled !== undefined ? Boolean(updatedPricingData.sequentialProgressionEnabled) : undefined,
        attendanceRequired: updatedPricingData.attendanceRequired !== undefined ? Boolean(updatedPricingData.attendanceRequired) : undefined,
        attendanceThreshold: updatedPricingData.attendanceThreshold !== undefined ? Number(updatedPricingData.attendanceThreshold) : undefined,
        requireExam: updatedPricingData.requireExam !== undefined ? Boolean(updatedPricingData.requireExam) : undefined,
        requireCoaching: updatedPricingData.requireCoaching !== undefined ? Boolean(updatedPricingData.requireCoaching) : undefined,
        requireMissionStatement: updatedPricingData.requireMissionStatement !== undefined ? Boolean(updatedPricingData.requireMissionStatement) : undefined,
        hasCertificate: updatedPricingData.hasCertificate !== undefined ? Boolean(updatedPricingData.hasCertificate) : undefined,
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
      setProgramData((prev: any) => ({ ...prev, ...updated, ...payload }));
      toast.success("Pricing and access settings saved.");
    } catch (err: any) {
      toast.error(err.message || "Failed to save pricing details");
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

  // Delete Lesson Action
  const handleDeleteLesson = async (lessonId: string) => {
    setIsConfirming(true);
    try {
      const res = await cachedFetch(`${API_URL}/programs/lessons/${lessonId}`, {
        method: "DELETE",
        timeoutMs: 30000,
      });
      if (res.ok) {
        setSteps((prev) =>
          prev.map((step) => ({
            ...step,
            lessons: (step.lessons || []).filter((l) => l.id !== lessonId),
          }))
        );
        toast.success("Lesson deleted successfully.");
        await fetchProgramAndSteps();
      } else {
        const errorData = await res.json().catch(() => null);
        toast.error(errorData?.message || errorData?.error?.message || "Failed to delete lesson.");
      }
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
        toast.error("Network connection error. Please verify the backend is running and try again.");
      } else {
        toast.error(msg || "Failed to delete lesson.");
      }
    } finally {
      setIsConfirming(false);
    }
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
      const isPublish = settings.status === "PUBLISHED";
      const res = await fetch(`${API_URL}/programs/${programId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          status: settings.status,
          isActive: isPublish,
        }),
      });

      if (!res.ok) throw new Error("Failed to update course publication status");

      const updated = await res.json();
      setProgramData((prev: any) => ({ ...prev, ...updated, isActive: isPublish, status: settings.status }));
      toast.success(isPublish ? "Program published successfully!" : "Program moved to drafts.");
    } catch (err: any) {
      toast.error(err.message || "Failed to update publication status");
    } finally {
      setIsSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Loading & Error States
  // ---------------------------------------------------------------------------
    // ---------------------------------------------------------------------------
  // Loading & Error States
  // ---------------------------------------------------------------------------
  if (isLoading && !programData) {
    return (
      <div className={styles.wizardContainer}>
        {/* Top Breadcrumb & Actions Bar Skeleton */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", marginBottom: "0.75rem" }}>
          <div className="skeleton" style={{ width: 150, height: 28, borderRadius: 6 }} />
          <div className="skeleton" style={{ width: 120, height: 32, borderRadius: 6 }} />
        </div>

        {/* Program Header Card Skeleton */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid var(--border-light, #e7decb)",
            borderRadius: "12px",
            boxShadow: "0 1px 3px rgba(20, 17, 15, 0.03)",
            padding: "1rem 1.25rem",
            marginBottom: "1rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div className="skeleton" style={{ width: 48, height: 48, borderRadius: 12, flexShrink: 0 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <div className="skeleton" style={{ height: 24, width: 260, borderRadius: 6 }} />
                <div className="skeleton" style={{ height: 20, width: 64, borderRadius: 6 }} />
              </div>
              <div className="skeleton" style={{ height: 14, width: 340, borderRadius: 4 }} />
            </div>
          </div>
        </div>

        {/* Horizontal Tab Bar Skeleton */}
        <div className={styles.programTabBar} style={{ borderBottom: "none", pointerEvents: "none", display: "flex", gap: "0.5rem" }}>
          {[140, 130, 110, 110, 140].map((w, idx) => (
            <div
              key={idx}
              className="skeleton"
              style={{
                height: 38,
                width: w,
                borderRadius: 8,
              }}
            />
          ))}
        </div>

        {/* Studio Content Card Skeleton */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid var(--border-light, #e7decb)",
            borderRadius: 14,
            padding: "1.75rem",
            boxShadow: "0 1px 3px rgba(20, 17, 15, 0.03)",
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)",
            gap: "1.75rem",
            minHeight: 460,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div className="skeleton" style={{ height: 24, width: 180, borderRadius: 6 }} />
            <div className="skeleton" style={{ height: 42, width: "100%", borderRadius: 8 }} />
            <div className="skeleton" style={{ height: 110, width: "100%", borderRadius: 8 }} />
            <div className="skeleton" style={{ height: 42, width: "100%", borderRadius: 8 }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div className="skeleton" style={{ height: 24, width: 160, borderRadius: 6 }} />
            <div className="skeleton" style={{ height: 160, width: "100%", borderRadius: 10 }} />
            <div className="skeleton" style={{ height: 42, width: "100%", borderRadius: 8 }} />
            <div className="skeleton" style={{ height: 42, width: 140, borderRadius: 8, alignSelf: "flex-end" }} />
          </div>
        </div>
      </div>
    );
  }

  if (!isLoading && !programData) {
    return (
      <div className={styles.wizardContainer}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", marginBottom: "0.75rem" }}>
          <Link
            href="/programs"
            className={styles.breadcrumbRootLink}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.45rem",
              color: "var(--text-muted, #78716a)",
              fontSize: "0.82rem",
              fontWeight: 600,
              textDecoration: "none",
              padding: "0.3rem 0.6rem",
              borderRadius: "6px",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
            <span>Back to All Programs</span>
          </Link>
        </div>

        <div
          style={{
            background: "#ffffff",
            border: "1px solid #ece4d7",
            borderRadius: 14,
            padding: "3.5rem 2rem",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            marginTop: "1.5rem",
          }}
        >
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginBottom: "1rem" }}>
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          <h2 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#14110f", margin: "0 0 0.5rem" }}>
            Program Not Found
          </h2>
          <p style={{ fontSize: "0.88rem", color: "#78716a", maxWidth: 420, margin: "0 0 1.5rem", lineHeight: 1.5 }}>
            The program you are trying to view does not exist or may have been deleted.
          </p>
          <Link
            href="/programs"
            className={styles.btnPrimary}
            style={{ textDecoration: "none", padding: "0.55rem 1.25rem", fontSize: "0.88rem" }}
          >
            Return to Programs List
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wizardContainer}>
      {/* ===================================================================
          1. Top Navigation: Back to All Programs
          =================================================================== */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", marginBottom: "0.75rem" }}>
        <Link
          href="/programs"
          className={styles.breadcrumbRootLink}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.45rem",
            color: "var(--text-muted, #78716a)",
            fontSize: "0.82rem",
            fontWeight: 600,
            textDecoration: "none",
            padding: "0.3rem 0.6rem",
            borderRadius: "6px",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span>Back to All Programs</span>
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {programData?.isActive ? (
            <button
              type="button"
              className={styles.secondaryActionBtn}
              onClick={async () => {
                await handlePublishCourse({ status: "DRAFT" });

              }}
              style={{
                fontSize: "0.82rem",
                padding: "0.42rem 0.85rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontWeight: 600,
                borderRadius: "6px",
                cursor: "pointer",
              }}
              title="Move program to Drafts"
            >
              <span>Move to Drafts</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={async () => {
                await handlePublishCourse({ status: "PUBLISHED" });

              }}
              style={{
                fontSize: "0.82rem",
                padding: "0.42rem 0.85rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontWeight: 600,
                borderRadius: "6px",
                background: "var(--accent-primary, #c97a1e)",
                color: "#ffffff",
                border: "none",
                cursor: "pointer",
              }}
              title="Publish program to catalog"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
              <span>Publish Program</span>
            </button>
          )}
        </div>
      </div>

      {/* ===================================================================
          2. Unified Program Header Card
          =================================================================== */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid var(--border-light, #e7decb)",
          borderRadius: "12px",
          boxShadow: "0 1px 3px rgba(20, 17, 15, 0.03)",
          padding: "1rem 1.25rem",
          marginBottom: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", minWidth: 0 }}>
            {/* Elegant Program Icon Squircle */}
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: "linear-gradient(135deg, #fdf8f0 0%, #f5ece1 100%)",
                border: "1.5px solid #e7decb",
                color: "var(--accent-primary, #c97a1e)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
              aria-hidden="true"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                <h1 style={{ fontSize: "1.35rem", fontWeight: 700, color: "var(--text-primary, #14110f)", margin: 0, lineHeight: 1.2 }}>
                  {programData?.title || "Untitled Program"}
                </h1>
                <StatusBadge status={programData?.isActive ? "PUBLISHED" : "DRAFT"} />
              </div>

              {/* Clean Sub-Metadata Row matching Batch detail style */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", fontSize: "0.8125rem", color: "var(--text-secondary, #78716a)", flexWrap: "wrap" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                  <span style={{ color: "#78716a", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase" }}>Price:</span>
                  <span style={{ fontWeight: 600, color: "#b45309" }}>{programData?.price ? `$${programData.price.toLocaleString()}` : "Free"}</span>
                </span>
                <span style={{ color: "#d1c7b8" }}>•</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                  <span style={{ color: "#78716a", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase" }}>Steps:</span>
                  <span style={{ fontWeight: 600, color: "#14110f" }}>{steps.length}</span>
                </span>
                <span style={{ color: "#d1c7b8" }}>•</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                  <span style={{ color: "#78716a", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase" }}>Lessons:</span>
                  <span style={{ fontWeight: 600, color: "#14110f" }}>{steps.reduce((acc, s) => acc + (s.lessons?.length || 0), 0)}</span>
                </span>
                <span style={{ color: "#d1c7b8" }}>•</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                  <span style={{ color: "#78716a", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase" }}>Certificate:</span>
                  <span style={{ fontWeight: 600, color: programData?.hasCertificate !== false ? "#15803d" : "#78716a" }}>
                    {programData?.hasCertificate !== false ? "Enabled" : "None"}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================================
          3. Top Horizontal Tab Bar
          =================================================================== */}
      <div className={styles.programTabBar} role="tablist" aria-label="Program Management Tabs">
        <button
          type="button"
          role="tab"
          aria-selected={activeProgramTab === "DETAILS"}
          className={`${styles.programTabBtn} ${activeProgramTab === "DETAILS" ? styles.programTabBtnActive : ""}`}
          onClick={() => setActiveProgramTab("DETAILS")}
        >
          Program Details
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeProgramTab === "STEPS"}
          className={`${styles.programTabBtn} ${activeProgramTab === "STEPS" ? styles.programTabBtnActive : ""}`}
          onClick={() => {
            setActiveProgramTab("STEPS");
            if (wizardStep === "MODULE_PREVIEW") setWizardStep("MODULE_LIST");
          }}
        >
          Steps &amp; Lessons
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
          aria-selected={activeProgramTab === "CERTIFICATE"}
          className={`${styles.programTabBtn} ${activeProgramTab === "CERTIFICATE" ? styles.programTabBtnActive : ""}`}
          onClick={() => setActiveProgramTab("CERTIFICATE")}
        >
          Certificate
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeProgramTab === "PUBLISH"}
          className={`${styles.programTabBtn} ${activeProgramTab === "PUBLISH" ? styles.programTabBtnActive : ""}`}
          onClick={() => setActiveProgramTab("PUBLISH")}
        >
          Review &amp; Publish
        </button>
      </div>

      {/* Tab Views */}
      {activeProgramTab === "DETAILS" && (
        <Step1CourseSetup
          programData={programData}
          onSaveAndContinue={handleSaveCourseSetup}
          isSaving={isSaving}
        />
      )}


      {/* Main Steps & Lessons Tab */}
      {activeProgramTab === "STEPS" && (
        <>
          {(wizardStep === "MODULE_LIST" || wizardStep === "MODULE_DETAILS") && (
            <Step2ModuleList
              steps={steps}
              activeModuleId={activeModuleId}
              onSelectModule={(id) => setActiveModuleId(id)}
              onOpenCreateModal={() => setIsCreateModuleModalOpen(true)}
              onOpenAddLessonChooser={() => setWizardStep("ADD_LESSON_CHOOSER")}
              onOpenAddVideoLesson={() => {
                setEditingLesson(null);
                setWizardStep("ADD_VIDEO_LESSON");
              }}
              onOpenAddPdfLesson={() => {
                setEditingLesson(null);
                setWizardStep("ADD_PDF_LESSON");
              }}
              onOpenQuizBuilder={() => setWizardStep("QUIZ_BUILDER")}
              onEditLesson={(lesson, step) => {
                setEditingLesson(lesson);
                setActiveModuleId(step.id);
                if (lesson.type === "VIDEO") {
                  setWizardStep("ADD_VIDEO_LESSON");
                } else if (lesson.type === "PDF") {
                  setWizardStep("ADD_PDF_LESSON");
                } else if (lesson.type === "QUIZ") {
                  setWizardStep("QUIZ_BUILDER");
                }
              }}
              onDeleteModule={handleDeleteModule}
              onDeleteLesson={handleDeleteLesson}
              onDeleteQuiz={handleDeleteQuiz}
              onUpdateModule={handleUpdateModule}
              onRefreshData={fetchProgramAndSteps}
            />
          )}

          {/* Add Lesson (Content Type Chooser) */}
          {wizardStep === "ADD_LESSON_CHOOSER" && activeModule && (
            <Step5AddLessonChooser
              moduleSequence={activeModule.sequence}
              onCancel={() => setWizardStep("MODULE_LIST")}
              onSelectType={handleSelectLessonType}
            />
          )}

          {/* Add / Edit Video Lesson */}
          {wizardStep === "ADD_VIDEO_LESSON" && activeModule && (
            <Step6AddVideoLesson
              moduleTitle={activeModule.title}
              moduleId={activeModule.id}
              editingLesson={editingLesson}
              onBackToChooser={() => {
                setEditingLesson(null);
                setWizardStep("MODULE_LIST");
              }}
              onLessonSaved={() => {
                setEditingLesson(null);
                fetchProgramAndSteps();
                setWizardStep("MODULE_LIST");
              }}
              onStartBackgroundUpload={handleStartBackgroundUpload}
            />
          )}

          {/* Add / Edit PDF Lesson */}
          {wizardStep === "ADD_PDF_LESSON" && activeModule && (
            <Step6AddPdfLesson
              moduleTitle={activeModule.title}
              moduleId={activeModule.id}
              editingLesson={editingLesson}
              onBackToChooser={() => {
                setEditingLesson(null);
                setWizardStep("MODULE_LIST");
              }}
              onLessonSaved={() => {
                setEditingLesson(null);
                fetchProgramAndSteps();
                setWizardStep("MODULE_LIST");
              }}
            />
          )}

          {/* Quiz Builder */}
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
        </>
      )}

      {activeProgramTab === "FINAL_EXAM" && (
        <FinalExamPanel
          programId={programId}
          programTitle={programData?.title}
          requireExam={programData?.requireExam !== false}
          onToggleRequireExam={async (required: boolean) => {
            await handleUpdateProgramSettings({ requireExam: required });
          }}
        />
      )}

      {activeProgramTab === "CERTIFICATE" && (
        <ProgramCertificatePanel
          programId={programId}
          programTitle={programData?.title}
          hasCertificate={programData?.hasCertificate !== false}
          certificateTemplate={programData?.certificateTemplate}
          onUpdateCertificate={handleUpdateProgramSettings}
        />
      )}

      {activeProgramTab === "PUBLISH" && (
        <Step9ReviewPublish
          programData={programData}
          steps={steps}
          onBackToModules={() => setActiveProgramTab("STEPS")}
          onPublish={handlePublishCourse}
          isPublishing={isSaving}
        />
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
