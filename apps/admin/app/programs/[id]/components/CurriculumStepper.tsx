"use client";

import React from "react";
import styles from "../curriculum.module.css";

interface CurriculumStepperProps {
  currentPhase: 1 | 2 | 3;
  onSelectPhase: (phase: 1 | 2 | 3) => void;
  isPhase1Done: boolean;
  isPhase2Done: boolean;
}

export default function CurriculumStepper({
  currentPhase,
  onSelectPhase,
  isPhase1Done,
  isPhase2Done,
}: CurriculumStepperProps) {
  return (
    <nav className={styles.stepperContainer} aria-label="Curriculum Wizard Progress">
      {/* Phase 1: Basic Details */}
      <button
        type="button"
        className={`${styles.stepNode} ${
          currentPhase === 1
            ? styles.stepNodeActive
            : isPhase1Done
            ? styles.stepNodeCompleted
            : styles.stepNodeUpcoming
        }`}
        onClick={() => onSelectPhase(1)}
        title="Go to Course Basic Details"
      >
        <div className={styles.stepBadge}>
          {isPhase1Done && currentPhase !== 1 ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            "01"
          )}
        </div>
        <div className={styles.stepMeta}>
          <span className={styles.stepTabTitle}>Basic Details</span>
          <span className={styles.stepTabSub}>Title, cover &amp; info</span>
        </div>
      </button>

      {/* Phase 2: Modules & Lessons */}
      <button
        type="button"
        className={`${styles.stepNode} ${
          currentPhase === 2
            ? styles.stepNodeActive
            : isPhase2Done
            ? styles.stepNodeCompleted
            : styles.stepNodeUpcoming
        }`}
        onClick={() => onSelectPhase(2)}
        title="Go to Modules & Lessons Builder"
      >
        <div className={styles.stepBadge}>
          {isPhase2Done && currentPhase !== 2 ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            "02"
          )}
        </div>
        <div className={styles.stepMeta}>
          <span className={styles.stepTabTitle}>Curriculum</span>
          <span className={styles.stepTabSub}>Modules &amp; lessons</span>
        </div>
      </button>

      {/* Phase 3: Review & Publish */}
      <button
        type="button"
        className={`${styles.stepNode} ${
          currentPhase === 3 ? styles.stepNodeActive : styles.stepNodeUpcoming
        }`}
        onClick={() => onSelectPhase(3)}
        title="Go to Review & Publish"
      >
        <div className={styles.stepBadge}>03</div>
        <div className={styles.stepMeta}>
          <span className={styles.stepTabTitle}>Review &amp; Publish</span>
          <span className={styles.stepTabSub}>Pricing &amp; launch</span>
        </div>
      </button>
    </nav>
  );
}
