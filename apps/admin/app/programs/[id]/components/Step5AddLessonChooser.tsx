"use client";

import React, { useState } from "react";
import styles from "../curriculum.module.css";

export type LessonTypeChoice = "VIDEO" | "PDF" | "QUIZ" | "TEXT" | "LIVE" | "LINK";

interface Step5AddLessonChooserProps {
  moduleSequence: number;
  onCancel: () => void;
  onSelectType: (type: LessonTypeChoice) => void;
}

export default function Step5AddLessonChooser({
  moduleSequence,
  onCancel,
  onSelectType,
}: Step5AddLessonChooserProps) {
  const [selected, setSelected] = useState<LessonTypeChoice>("VIDEO");

  const cards: Array<{
    type: LessonTypeChoice;
    icon: string;
    title: string;
    desc: string;
    badge?: string;
  }> = [
    {
      type: "VIDEO",
      icon: "🎬",
      title: "Video Lecture",
      desc: "Upload or stream video lecture with secure watermark optimization",
    },
    {
      type: "PDF",
      icon: "📄",
      title: "PDF Document",
      desc: "Upload study material, slide decks, or downloadable worksheets",
    },
    {
      type: "QUIZ",
      icon: "🧠",
      title: "Knowledge Quiz",
      desc: "Create interactive assessment with pass mark requirements",
    },
    {
      type: "TEXT",
      icon: "📝",
      title: "Text Content",
      desc: "Add comprehensive reading notes, takeaways, or guides",
    },
    {
      type: "LIVE",
      icon: "📹",
      title: "Live Session",
      desc: "Schedule interactive live Zoom or cohort webinar",
    },
    {
      type: "LINK",
      icon: "🔗",
      title: "External Link",
      desc: "Add link to GitHub repository, Figma board, or external article",
    },
  ];

  return (
    <section className={styles.cardSurface}>
      {/* Header */}
      <div className={styles.cardHeaderArea}>
        <div className={styles.stepEyebrow}>ADD CONTENT TO MODULE {moduleSequence}</div>
        <h2 className={styles.stepTitle}>Select Lesson Type</h2>
        <p className={styles.stepSubtitle}>
          Choose the format of learning material you would like to introduce to learners in this step.
        </p>
      </div>

      {/* 6-Card Grid Selector */}
      <div className={styles.chooserGrid}>
        {cards.map((c) => {
          const isSelected = selected === c.type;
          return (
            <div
              key={c.type}
              className={`${styles.chooserCard} ${
                isSelected ? styles.chooserCardSelected : ""
              }`}
              onClick={() => setSelected(c.type)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setSelected(c.type);
              }}
            >
              <span className={styles.chooserIcon}>{c.icon}</span>
              <h3 className={styles.chooserTitle}>{c.title}</h3>
              <p className={styles.chooserDesc}>{c.desc}</p>
            </div>
          );
        })}
      </div>

      {/* Action Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "2rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border-light)" }}>
        <button
          type="button"
          className={styles.secondaryActionBtn}
          onClick={onCancel}
        >
          Cancel
        </button>

        <button
          type="button"
          className={styles.btnPrimary}
          onClick={() => onSelectType(selected)}
        >
          Continue with {cards.find((c) => c.type === selected)?.title} &rarr;
        </button>
      </div>
    </section>
  );
}
