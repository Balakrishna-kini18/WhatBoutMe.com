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

        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <span className={styles.moduleCountBadge}>
            {steps.length} {steps.length === 1 ? "Module" : "Modules"}
          </span>

          <button
            type="button"
            className={styles.btnPrimary}
            onClick={onOpenCreateModal}
            style={{ padding: "0.6rem 1.25rem", fontSize: "0.88rem" }}
          >
            <span>+</span>
            <span>Add Module</span>
          </button>
        </div>
      </div>

      {/* Empty State */}
      {steps.length === 0 ? (
        <div className={styles.emptyStateCard}>
          <div className={styles.emptyStateIcon}>📁</div>
          <h3 className={styles.emptyStateTitle}>No modules yet</h3>
          <p className={styles.emptyStateDesc}>
            Start by creating your first module. Modules help you organize your video lectures,
            study documents, and interactive quizzes for learners.
          </p>
          <button
            type="button"
            className={styles.btnPrimary}
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
                      <span>{lessonsCount} Lessons</span>
                      <span>&bull;</span>
                      <span>{hasQuiz ? "1 Quiz Attached" : "No Quiz"}</span>
                      {step.description && (
                        <>
                          <span>&bull;</span>
                          <span style={{ maxWidth: 300, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
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
                    <span>👁 Preview</span>
                  </button>

                  <button
                    type="button"
                    className={styles.manageContentBtn}
                    onClick={() => onManageModule(step)}
                  >
                    <span>Manage Lessons &rarr;</span>
                  </button>

                  <button
                    type="button"
                    className={styles.deleteItemBtn}
                    onClick={() => onDeleteModule(step.id)}
                    title="Delete Module"
                  >
                    🗑
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Wizard Bottom Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "2.5rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border-light)" }}>
        <button
          type="button"
          className={styles.btnBack}
          onClick={onBackToBasicDetails}
        >
          &larr; Back to Basic Details
        </button>

        <button
          type="button"
          className={styles.btnPrimary}
          onClick={onContinueToReview}
          disabled={steps.length === 0}
        >
          Save &amp; Next: Review Course &rarr;
        </button>
      </div>
    </section>
  );
}
