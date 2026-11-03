"use client";

import React from "react";
import styles from "../curriculum.module.css";

export type LessonTypeChoice = "VIDEO" | "PDF" | "QUIZ";

interface Step5AddLessonChooserProps {
  moduleSequence: number;
  onCancel: () => void;
  onSelectType: (type: LessonTypeChoice) => void;
}

interface LessonCardItem {
  type: LessonTypeChoice;
  title: string;
  badgeBg: string;
  iconColor: string;
  renderIcon: () => React.ReactNode;
}

export default function Step5AddLessonChooser({
  moduleSequence,
  onCancel,
  onSelectType,
}: Step5AddLessonChooserProps) {
  const cards: LessonCardItem[] = [
    {
      type: "VIDEO",
      title: "Video Lesson",
      badgeBg: "#ede9fe",
      iconColor: "#7c3aed",
      renderIcon: () => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="20" height="15" x="2" y="5" rx="2" />
          <path d="m4 9 3-4" />
          <path d="m10 9 3-4" />
          <path d="m16 9 3-4" />
          <path d="M2 9h20" />
        </svg>
      ),
    },
    {
      type: "PDF",
      title: "PDF Document",
      badgeBg: "#ffe4e6",
      iconColor: "#e11d48",
      renderIcon: () => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#e11d48" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <line x1="10" y1="9" x2="8" y2="9" />
        </svg>
      ),
    },
    {
      type: "QUIZ",
      title: "Knowledge Quiz",
      badgeBg: "#fce7f3",
      iconColor: "#c026d3",
      renderIcon: () => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#c026d3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-5.04z" />
          <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-5.04z" />
        </svg>
      ),
    },
  ];

  return (
    <section className={styles.cardSurface}>
      {/* Top Back Navigation Button */}
      <button
        type="button"
        onClick={onCancel}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.45rem",
          color: "var(--text-muted, #78716a)",
          fontSize: "0.82rem",
          fontWeight: 600,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: "0.3rem 0",
          marginBottom: "0.75rem",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m15 18-6-6 6-6" />
        </svg>
        <span>Back to Steps &amp; Lessons</span>
      </button>

      {/* Header */}
      <div className={styles.cardHeaderArea} style={{ marginBottom: "1.25rem" }}>
        <h2 className={styles.stepTitle}>Select Lesson Type</h2>
      </div>

      {/* 3-Card Grid Selector - Click immediately navigates */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "1.25rem",
          maxWidth: "850px",
        }}
      >
        {cards.map((c) => (
          <div
            key={c.type}
            onClick={() => onSelectType(c.type)}
            style={{
              padding: "1.5rem 1.25rem",
              borderRadius: "14px",
              border: "1.5px solid #ece6dd",
              background: "#ffffff",
              cursor: "pointer",
              transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              gap: "0.85rem",
              boxShadow: "0 1px 3px rgba(20, 17, 15, 0.03)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--accent-primary, #c97a1e)";
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 8px 20px -4px rgba(201, 122, 30, 0.12)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#ece6dd";
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 1px 3px rgba(20, 17, 15, 0.03)";
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                backgroundColor: c.badgeBg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {c.renderIcon()}
            </div>

            <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0, color: "var(--text-primary, #14110f)" }}>
              {c.title}
            </h3>

            <span
              style={{
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "var(--accent-primary, #c97a1e)",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                marginTop: "0.25rem",
              }}
            >
              <span>Select</span>
              <span aria-hidden="true">&rarr;</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
