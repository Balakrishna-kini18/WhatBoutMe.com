"use client";

import React from "react";
import styles from "./EnrollmentStepper.module.css";

export interface EnrollmentStepperProps {
  /** Current position in the canonical journey:
   * 1 = Select Program
   * 2 = Review & Sign Agreement
   * 3 = Payment Confirmation
   * 4 = Course Access
   */
  currentStep: 1 | 2 | 3 | 4;
}

interface StepItem {
  number: number;
  title: string;
  shortTitle: string;
}

const STEPS: readonly StepItem[] = [
  { number: 1, title: "Select Program", shortTitle: "Program" },
  { number: 2, title: "Review & Sign Agreement", shortTitle: "Review & Sign" },
  { number: 3, title: "Payment Confirmation", shortTitle: "Payment" },
  { number: 4, title: "Course Access", shortTitle: "Course Access" },
];

/**
 * Modern, responsive progress indicator for the 4-step enrollment journey.
 * Never overflows or shows horizontal scrollbars. Adapts smoothly across
 * compact cards and mobile viewports.
 */
export default function EnrollmentStepper({ currentStep }: EnrollmentStepperProps) {
  // Track fill percentage between node 1 (12.5%) and node 4 (87.5%):
  const progressRatio = Math.min(1, Math.max(0, (currentStep - 1) / 3));
  const fillWidthPercent = progressRatio * 75;

  return (
    <nav aria-label="Enrollment progress" className={styles.stepperNav}>
      <ol className={styles.stepperList}>
        {/* Background track line */}
        <div aria-hidden="true" className={styles.trackBackground} />
        {/* Completed track fill bar */}
        <div
          aria-hidden="true"
          className={styles.trackFill}
          style={{ width: `${fillWidthPercent}%` }}
        />

        {STEPS.map((step) => {
          const isCompleted = step.number < currentStep;
          const isActive = step.number === currentStep;

          const circleClass = isCompleted
            ? styles.circleCompleted
            : isActive
            ? styles.circleActive
            : styles.circleUpcoming;

          const labelClass = isCompleted
            ? styles.labelCompleted
            : isActive
            ? styles.labelActive
            : styles.labelUpcoming;

          return (
            <li
              key={step.number}
              aria-current={isActive ? "step" : undefined}
              className={styles.stepItem}
            >
              <span
                aria-hidden="true"
                className={`${styles.stepCircle} ${circleClass}`}
              >
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
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  step.number
                )}
              </span>

              <span className={`${styles.stepLabel} ${labelClass}`}>
                <span className={styles.fullLabel}>{step.title}</span>
                <span className={styles.shortLabel}>{step.shortTitle}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
