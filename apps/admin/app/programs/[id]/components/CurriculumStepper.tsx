"use client";

import React from "react";
import styles from "../curriculum.module.css";

interface CurriculumStepperProps {
  currentPhase: 1 | 2 | 3 | 4;
  onSelectPhase: (phase: 1 | 2 | 3 | 4) => void;
  isPhase1Done: boolean;
  isPhase2Done: boolean;
  isPhase3Done?: boolean;
}

export default function CurriculumStepper({
  currentPhase,
  onSelectPhase,
  isPhase1Done,
  isPhase2Done,
  isPhase3Done = false,
}: CurriculumStepperProps) {
  const steps = [
    {
      num: 1 as const,
      label: "Basic Details",
      sub: "Title, info & cover",
      isDone: isPhase1Done,
    },
    {
      num: 2 as const,
      label: "Curriculum",
      sub: "Modules & lessons",
      isDone: isPhase2Done,
    },
    {
      num: 3 as const,
      label: "Pricing",
      sub: "Rates & access rules",
      isDone: isPhase3Done,
    },
    {
      num: 4 as const,
      label: "Review & Publish",
      sub: "Launch readiness",
      isDone: false,
    },
  ];

  return (
    <nav className={styles.stepperContainer} aria-label="Curriculum Wizard Progress">
      {steps.map((step) => {
        const isActive = currentPhase === step.num;
        const isCompleted = step.isDone && currentPhase > step.num;

        return (
          <button
            key={step.num}
            type="button"
            className={`${styles.stepNode} ${
              isActive
                ? styles.stepNodeActive
                : isCompleted
                ? styles.stepNodeCompleted
                : styles.stepNodeUpcoming
            }`}
            onClick={() => onSelectPhase(step.num)}
            title={`Go to ${step.label}`}
          >
            <div className={styles.stepBadge}>
              {isCompleted ? (
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                `0${step.num}`
              )}
            </div>
            <div className={styles.stepMeta}>
              <span className={styles.stepTabTitle}>{step.label}</span>
              <span className={styles.stepTabSub}>
                {isCompleted ? "Completed" : step.sub}
              </span>
            </div>
          </button>
        );
      })}
    </nav>
  );
}
