"use client";

import { useEffect, useState, use, useCallback } from "react";
import styles from "./curriculum.module.css";
import Link from "next/link";
import { API_URL, errorMessage, uploadFile } from "../../lib/api";
import { parseCourseInfo, formatCourseInfo } from "../courseInfo";

// 9-Step Wizard Modular Subcomponents
import CurriculumStepper from "./components/CurriculumStepper";
import Step1CourseSetup from "./components/Step1CourseSetup";
import Step2ModuleList from "./components/Step2ModuleList";
import Step3CreateModuleModal from "./components/Step3CreateModuleModal";
import Step4ModuleDetails from "./components/Step4ModuleDetails";
import Step5AddLessonChooser, { LessonTypeChoice } from "./components/Step5AddLessonChooser";
import Step6AddVideoLesson from "./components/Step6AddVideoLesson";
import Step6AddPdfLesson from "./components/Step6AddPdfLesson";
import Step7QuizBuilder from "./components/Step7QuizBuilder";
import Step8ModulePreview from "./components/Step8ModulePreview";
import Step9ReviewPublish from "./components/Step9ReviewPublish";
import BackgroundUploadTray, { BackgroundUploadTask } from "./components/BackgroundUploadTray";

export type WizardStep =
  | "COURSE_SETUP"
  | "MODULE_LIST"
  | "MODULE_DETAILS"
  | "ADD_LESSON_CHOOSER"
  | "ADD_VIDEO_LESSON"
  | "ADD_PDF_LESSON"
  | "QUIZ_BUILDER"
  | "MODULE_PREVIEW"
  | "REVIEW_PUBLISH";

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

  // Active Wizard Progression State
  const [wizardStep, setWizardStep] = useState<WizardStep>("COURSE_SETUP");
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [isCreateModuleModalOpen, setIsCreateModuleModalOpen] = useState(false);
  const [isCreatingModule, setIsCreatingModule] = useState(false);
  const [backgroundTasks, setBackgroundTasks] = useState<BackgroundUploadTask[]>([]);

  // Fetch Program & Full Steps with Lessons
  const fetchProgramAndSteps = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Fetch Program details
      const progRes = await fetch(`${API_URL}/programs`);
      if (progRes.ok) {
        const progs = await progRes.json();
        const found = progs.find((p: any) => p.id === programId);
        if (found) setProgramData(found);
      }

      // 2. Fetch Steps List
      const stepsRes = await fetch(`${API_URL}/programs/${programId}/steps`);
      if (stepsRes.ok) {
        const stepsData: Step[] = await stepsRes.json();
        const sorted = [...stepsData].sort((a, b) => a.sequence - b.sequence);

        // Fetch detailed lessons and quiz for each step
        const detailedSteps = await Promise.all(
          sorted.map(async (s) => {
            try {
              const detailRes = await fetch(`${API_URL}/programs/steps/${s.id}`);
              if (detailRes.ok) return await detailRes.json();
            } catch (e) {}
            return s;
          })
        );

        setSteps(detailedSteps);
      }
    } catch (err) {
      console.error("Error loading curriculum wizard data:", err);
    } finally {
      setIsLoading(false);
    }
  }, [programId]);

  useEffect(() => {
    fetchProgramAndSteps();
  }, [fetchProgramAndSteps]);

  // Determine top stepper phase (1: Basic Details, 2: Modules, 3: Review & Publish)
  const currentPhase: 1 | 2 | 3 =
    wizardStep === "COURSE_SETUP" ? 1 : wizardStep === "REVIEW_PUBLISH" ? 3 : 2;

  const handleSelectPhase = (phase: 1 | 2 | 3) => {
    if (phase === 1) setWizardStep("COURSE_SETUP");
    if (phase === 2) setWizardStep("MODULE_LIST");
    if (phase === 3) setWizardStep("REVIEW_PUBLISH");
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
      });

      const payload: Record<string, any> = {
        title: updatedData.title,
        description: combinedDescription || updatedData.description,
        price: Number(updatedData.price) || 0,
        hasCertificate: Boolean(updatedData.hasCertificate),
        shortDescription: updatedData.shortDescription || "",
        thumbnailUrl: updatedData.thumbnailUrl || "",
        category: updatedData.category || "",
        level: updatedData.level || "",
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

        const res = await fetch(`${API_URL}/programs/steps/${taskInput.moduleId}/lessons`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

  // Delete Module Action
  const handleDeleteModule = async (stepId: string) => {
    if (!confirm("Are you sure you want to delete this module and all its attached lessons?")) return;
    try {
      const res = await fetch(`${API_URL}/programs/steps/${stepId}`, { method: "DELETE" });
      if (res.ok) {
        setSteps((prev) => prev.filter((s) => s.id !== stepId));
        if (activeModuleId === stepId) {
          setActiveModuleId(null);
          setWizardStep("MODULE_LIST");
        }
      } else {
        alert("Failed to delete module.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Delete Lesson Action
  const handleDeleteLesson = async (lessonId: string) => {
    if (!confirm("Delete this lesson from the module?")) return;
    try {
      const res = await fetch(`${API_URL}/programs/lessons/${lessonId}`, { method: "DELETE" });
      if (res.ok) {
        fetchProgramAndSteps();
      } else {
        alert("Failed to delete lesson.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Delete Quiz Action
  const handleDeleteQuiz = async () => {
    if (!activeModule?.quiz?.id || !confirm("Delete this knowledge check quiz completely?")) return;
    try {
      const res = await fetch(`${API_URL}/quizzes/${activeModule.quiz.id}`, { method: "DELETE" });
      if (res.ok) {
        fetchProgramAndSteps();
      }
    } catch (e) {
      console.error(e);
    }
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
          2. Three-Phase Stepper Progress Header
          =================================================================== */}
      <CurriculumStepper
        currentPhase={currentPhase}
        onSelectPhase={handleSelectPhase}
        isPhase1Done={Boolean(programData?.title) || currentPhase > 1}
        isPhase2Done={steps.length > 0 && wizardStep === "REVIEW_PUBLISH"}
      />

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

      {/* STEP 2: Modules List & Empty State */}
      {wizardStep === "MODULE_LIST" && (
        <Step2ModuleList
          steps={steps}
          programTitle={programData?.title}
          onOpenCreateModal={() => setIsCreateModuleModalOpen(true)}
          onManageModule={(mod) => {
            setActiveModuleId(mod.id);
            setWizardStep("MODULE_DETAILS");
          }}
          onPreviewModule={(mod) => {
            setActiveModuleId(mod.id);
            setWizardStep("MODULE_PREVIEW");
          }}
          onDeleteModule={handleDeleteModule}
          onBackToBasicDetails={() => setWizardStep("COURSE_SETUP")}
          onContinueToReview={() => setWizardStep("REVIEW_PUBLISH")}
        />
      )}

      {/* STEP 4: Module Details / Lessons inside Selected Module */}
      {wizardStep === "MODULE_DETAILS" && activeModule && (
        <Step4ModuleDetails
          module={activeModule}
          onBackToModulesList={() => setWizardStep("MODULE_LIST")}
          onOpenAddLessonChooser={() => setWizardStep("ADD_LESSON_CHOOSER")}
          onOpenQuizBuilder={() => setWizardStep("QUIZ_BUILDER")}
          onPreviewModule={() => setWizardStep("MODULE_PREVIEW")}
          onDeleteLesson={handleDeleteLesson}
          onDeleteQuiz={handleDeleteQuiz}
        />
      )}

      {/* STEP 5: Add Lesson (Content Type Chooser) */}
      {wizardStep === "ADD_LESSON_CHOOSER" && activeModule && (
        <Step5AddLessonChooser
          moduleSequence={activeModule.sequence}
          onCancel={() => setWizardStep("MODULE_DETAILS")}
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
            setWizardStep("MODULE_DETAILS");
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
            setWizardStep("MODULE_DETAILS");
          }}
        />
      )}

      {/* STEP 7: Quiz Builder */}
      {wizardStep === "QUIZ_BUILDER" && activeModule && (
        <Step7QuizBuilder
          moduleId={activeModule.id}
          moduleTitle={activeModule.title}
          existingQuiz={activeModule.quiz}
          onBackToModule={() => setWizardStep("MODULE_DETAILS")}
          onQuizSaved={() => {
            fetchProgramAndSteps();
            setWizardStep("MODULE_DETAILS");
          }}
        />
      )}

      {/* STEP 8: Student Module Preview */}
      {wizardStep === "MODULE_PREVIEW" && activeModule && (
        <Step8ModulePreview
          module={activeModule}
          onBackToEdit={() => setWizardStep("MODULE_DETAILS")}
          onContinueToReview={() => setWizardStep("REVIEW_PUBLISH")}
        />
      )}

      {/* STEP 9: Final Review & Publish */}
      {wizardStep === "REVIEW_PUBLISH" && (
        <Step9ReviewPublish
          programData={programData}
          steps={steps}
          onBackToModules={() => setWizardStep("MODULE_LIST")}
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
    </div>
  );
}
