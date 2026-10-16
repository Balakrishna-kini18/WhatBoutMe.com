"use client";

import React from "react";

export interface EnrollmentStepperProps {
  /** Current position in the canonical journey: Select Program → Review & Sign Agreement → Payment Confirmation → Course Access. */
  currentStep: 1 | 2 | 3 | 4;
}

const JOURNEY_STEPS: readonly string[] = [
  "Select Program",
  "Review & Sign Agreement",
  "Payment Confirmation",
  "Course Access",
];

/**
 * The single progress indicator for the enrollment journey. A step is derived
 * purely from its position relative to `currentStep` — completed before it,
 * active at it, upcoming after it.
 */
export default function EnrollmentStepper({ currentStep }: EnrollmentStepperProps) {
  return (
    <nav
      aria-label="Enrollment progress"
      style={{
        background: "#FFFFFF",
        border: "1px solid #E7E0D6",
        borderRadius: "14px",
        padding: "0.85rem 1.25rem",
        marginBottom: "1.75rem",
        boxShadow: "0 1px 3px rgba(20, 17, 15, 0.03)",
      }}
    >
      <ol
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          listStyle: "none",
          margin: 0,
          padding: 0,
          gap: "0.75rem",
          overflowX: "auto",
        }}
      >
        {JOURNEY_STEPS.map((label, idx) => {
          const number = idx + 1;
          const isCompleted = number < currentStep;
          const isActive = number === currentStep;

          const circleBg = isCompleted ? "#15803D" : isActive ? "#B86B11" : "#E7E0D6";
          const circleColor = isCompleted || isActive ? "#FFFFFF" : "#78716A";
          const labelColor = isCompleted ? "#15803D" : isActive ? "#1C1917" : "#78716A";
          const labelWeight = isCompleted ? 600 : isActive ? 700 : 500;

          return (
            <React.Fragment key={label}>
              <li
                aria-current={isActive ? "step" : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  flexShrink: 0,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: "22px",
                    height: "22px",
                    borderRadius: "50%",
                    background: circleBg,
                    color: circleColor,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {isCompleted ? (
                    <svg
                      width="12"
                      height="12"
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
                    number
                  )}
                </span>
                <span
                  style={{
                    fontSize: "0.82rem",
                    color: labelColor,
                    fontWeight: labelWeight,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {label}
                </span>
              </li>
              {idx < JOURNEY_STEPS.length - 1 && (
                <li
                  aria-hidden="true"
                  style={{
                    flex: 1,
                    height: "1px",
                    background: isCompleted ? "#86EFAC" : "#E7E0D6",
                    minWidth: "16px",
                    maxWidth: "48px",
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
