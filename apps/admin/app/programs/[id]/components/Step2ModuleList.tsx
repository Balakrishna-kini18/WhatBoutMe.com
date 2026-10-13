"use client";

import React from "react";
import styles from "../curriculum.module.css";

interface Step {
  id: string;
  sequence: number;
  title: string;
  description: string;
  lessons?: any[];
  quiz?: any | null;
}

interface Step2ModuleListProps {
  steps: Step[];
  onOpenCreateModal: () => void;
  onManageModule: (step: Step) => void;
  onPreviewModule: (step: Step) => void;
  onDeleteModule: (stepId: string) => void;
  onBackToBasicDetails: () => void;
  onContinueToReview: () => void;
}

export default function Step2ModuleList({
  steps,
  onOpenCreateModal,
  onManageModule,
  onPreviewModule,
  onDeleteModule,
  onBackToBasicDetails,
  onContinueToReview,
}: Step2ModuleListProps) {
  return (
    <section className={styles.cardSurface}>
      {/* Header */}
      <div className={styles.moduleListHeader}>
        <div>
          <div className={styles.stepEyebrow}>STEP 2: COURSE MODULES</div>
          <h2 className={styles.stepTitle}>Course Modules</h2>
          <p className={styles.stepSubtitle}>
            Organize your course content into progressive modules and milestones.
          </p>
        </div>

        <div className={styles.moduleListHeaderActions}>
          <span className={styles.moduleCountBadge}>
            {steps.length} {steps.length === 1 ? "Module" : "Modules"}
          </span>

          <button
            type="button"
            className={styles.addModuleHeaderBtn}
            onClick={onOpenCreateModal}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Add Module</span>
          </button>
        </div>
      </div>

      {/* Empty State */}
      {steps.length === 0 ? (
        <div className={styles.emptyStateCard}>
          <div className={styles.emptyStateIcon}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <h3 className={styles.emptyStateTitle}>No modules yet</h3>
          <p className={styles.emptyStateDesc}>
            Start by creating your first module. Modules help you organize your video lectures,
            study documents, and interactive quizzes for learners.
          </p>
          <button
            type="button"
            className={styles.addModuleHeaderBtn}
            onClick={onOpenCreateModal}
          >
            + Add First Module
          </button>
        </div>
      ) : (
        /* Modules Stack */
        <div className={styles.modulesStack}>
          {steps.map((step) => {
            const lessonsCount = step.lessons?.length || 0;
            const hasQuiz = Boolean(step.quiz);

            return (
              <div key={step.id} className={styles.moduleItemCard}>
                <div className={styles.moduleLeftInfo}>
                  <div className={styles.moduleSeqCircle}>
                    {step.sequence.toString().padStart(2, "0")}
                  </div>

                  <div className={styles.moduleMetaCol}>
                    <h3 className={styles.moduleCardTitle}>
                      Module {step.sequence}: {step.title}
                    </h3>
                    <div className={styles.moduleStatsRow}>
                      <span>{lessonsCount} {lessonsCount === 1 ? "Lesson" : "Lessons"}</span>
                      <span>&bull;</span>
                      <span>{hasQuiz ? "1 Quiz Attached" : "No Quiz"}</span>
                      {step.description && (
                        <>
                          <span>&bull;</span>
                          <span style={{ maxWidth: 320, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {step.description}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className={styles.moduleRightActions}>
                  <button
                    type="button"
                    className={styles.secondaryActionBtn}
                    onClick={() => onPreviewModule(step)}
                    title="Preview student view for this module"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    <span>Preview</span>
                  </button>

                  <button
                    type="button"
                    className={styles.manageContentBtn}
                    onClick={() => onManageModule(step)}
                  >
                    <span>Manage Lessons</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    className={styles.deleteItemBtn}
                    onClick={() => onDeleteModule(step.id)}
                    title="Delete Module"
                    aria-label="Delete module"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Wizard Bottom Controls */}
      <div className={styles.wizardFooterControls}>
        <button
          type="button"
          className={styles.btnBack}
          onClick={onBackToBasicDetails}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          <span>Back to Basic Details</span>
        </button>

        <button
          type="button"
          className={styles.btnPrimary}
          onClick={onContinueToReview}
          disabled={steps.length === 0}
        >
          <span>Save &amp; Next: Review Course</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </div>
    </section>
  );
}
