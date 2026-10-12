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
    <nav className={styles.stepperContainer} aria-label="Course Creation Progress">
      {/* Phase 1: Basic Details */}
      <button
        type="button"
        className={styles.stepNode}
        onClick={() => onSelectPhase(1)}
        title="Go to Course Basic Details"
      >
        <div
          className={`${styles.stepCircle} ${
            currentPhase === 1
              ? styles.stepCircleActive
              : isPhase1Done
              ? styles.stepCircleCompleted
              : ""
          }`}
        >
          {isPhase1Done && currentPhase !== 1 ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            "1"
          )}
        </div>
        <span
          className={`${styles.stepLabel} ${
            currentPhase === 1
              ? styles.stepLabelActive
              : isPhase1Done
              ? styles.stepLabelCompleted
              : ""
          }`}
        >
          Basic Details
        </span>
      </button>

      {/* Track 1 */}
      <div
        className={`${styles.stepLine} ${
          isPhase1Done || currentPhase >= 2 ? styles.stepLineActive : ""
        }`}
      />

      {/* Phase 2: Modules & Lessons */}
      <button
        type="button"
        className={styles.stepNode}
        onClick={() => onSelectPhase(2)}
        title="Go to Modules & Lessons Builder"
      >
        <div
          className={`${styles.stepCircle} ${
            currentPhase === 2
              ? styles.stepCircleActive
              : isPhase2Done
              ? styles.stepCircleCompleted
              : ""
          }`}
        >
          {isPhase2Done && currentPhase !== 2 ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            "2"
          )}
        </div>
        <span
          className={`${styles.stepLabel} ${
            currentPhase === 2
              ? styles.stepLabelActive
              : isPhase2Done
              ? styles.stepLabelCompleted
              : ""
          }`}
        >
          Modules
        </span>
      </button>

      {/* Track 2 */}
      <div
        className={`${styles.stepLine} ${
          isPhase2Done || currentPhase === 3 ? styles.stepLineActive : ""
        }`}
      />

      {/* Phase 3: Review & Publish */}
      <button
        type="button"
        className={styles.stepNode}
        onClick={() => onSelectPhase(3)}
        title="Go to Review & Publish"
      >
        <div
          className={`${styles.stepCircle} ${
            currentPhase === 3 ? styles.stepCircleActive : ""
          }`}
        >
          3
        </div>
        <span
          className={`${styles.stepLabel} ${
            currentPhase === 3 ? styles.stepLabelActive : ""
          }`}
        >
          Review &amp; Publish
        </span>
      </button>
    </nav>
  );
}
