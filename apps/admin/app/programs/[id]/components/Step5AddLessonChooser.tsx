"use client";

import React, { useState } from "react";
import styles from "../curriculum.module.css";

export type LessonTypeChoice = "VIDEO" | "PDF" | "QUIZ" | "TEXT" | "LIVE" | "LINK";

interface Step5AddLessonChooserProps {
  moduleSequence: number;
  onCancel: () => void;
  onSelectType: (type: LessonTypeChoice) => void;
}

interface LessonCardItem {
  type: LessonTypeChoice;
  title: string;
  desc: string;
  badgeBg: string;
  iconColor: string;
  renderIcon: () => React.ReactNode;
}

export default function Step5AddLessonChooser({
  moduleSequence,
  onCancel,
  onSelectType,
}: Step5AddLessonChooserProps) {
  const [selected, setSelected] = useState<LessonTypeChoice>("VIDEO");

  const cards: LessonCardItem[] = [
    {
      type: "VIDEO",
      title: "Video Lecture",
      desc: "Upload or stream video lecture with secure watermark optimization",
      badgeBg: "#ede9fe",
      iconColor: "#7c3aed",
      renderIcon: () => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      desc: "Upload study material, slide decks, or downloadable worksheets",
      badgeBg: "#ffe4e6",
      iconColor: "#e11d48",
      renderIcon: () => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#e11d48" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      desc: "Create interactive assessment with pass mark requirements",
      badgeBg: "#fce7f3",
      iconColor: "#c026d3",
      renderIcon: () => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#c026d3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-5.04z" />
          <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-5.04z" />
        </svg>
      ),
    },
    {
      type: "TEXT",
      title: "Text Content",
      desc: "Add comprehensive reading notes, takeaways, or guides",
      badgeBg: "#fef3c7",
      iconColor: "#d97706",
      renderIcon: () => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      ),
    },
    {
      type: "LIVE",
      title: "Live Session",
      desc: "Schedule interactive live Zoom or cohort webinar",
      badgeBg: "#ffedd5",
      iconColor: "#ea580c",
      renderIcon: () => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="23 7 16 12 23 17 23 7" />
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </svg>
      ),
    },
    {
      type: "LINK",
      title: "External Link",
      desc: "Add link to GitHub repository, Figma board, or external article",
      badgeBg: "#e0f2fe",
      iconColor: "#0284c7",
      renderIcon: () => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      ),
    },
  ];

  const calloutMap: Record<LessonTypeChoice, { title: string; desc: string }> = {
    VIDEO: {
      title: "About Video Lecture",
      desc: "You can upload a video file or provide a streaming URL. The video will be protected with secure watermark and optimized for all devices.",
    },
    PDF: {
      title: "About PDF Document",
      desc: "You can upload study material, slide decks, or downloadable worksheets. Files can be viewed online or downloaded by learners.",
    },
    QUIZ: {
      title: "About Knowledge Quiz",
      desc: "Create interactive assessments with pass mark requirements, automated grading, and instant feedback.",
    },
    TEXT: {
      title: "About Text Content",
      desc: "Add comprehensive reading notes, takeaways, or guides with formatted text, images, and code snippets.",
    },
    LIVE: {
      title: "About Live Session",
      desc: "Schedule interactive live Zoom or cohort webinars with custom calendar invites, agendas, and join links.",
    },
    LINK: {
      title: "About External Link",
      desc: "Add link to GitHub repository, Figma board, or external articles for learners to explore supplementary materials.",
    },
  };

  const currentCard: LessonCardItem = cards.find((c) => c.type === selected) ?? cards[0]!;
  const currentCallout = calloutMap[selected] ?? calloutMap.VIDEO;

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
      <div className={styles.chooserGrid} role="radiogroup" aria-label="Select Lesson Type">
        {cards.map((c) => {
          const isSelected = selected === c.type;
          return (
            <div
              key={c.type}
              className={`${styles.chooserCard} ${
                isSelected ? styles.chooserCardSelected : ""
              }`}
              onClick={() => setSelected(c.type)}
              role="radio"
              aria-checked={isSelected}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelected(c.type);
                }
              }}
            >
              <div className={styles.chooserCardHeader}>
                <div
                  className={styles.chooserBadge}
                  style={{ backgroundColor: c.badgeBg }}
                >
                  {c.renderIcon()}
                </div>

                {isSelected ? (
                  <div className={styles.chooserRadioActive} aria-hidden="true">
                    <div className={styles.chooserRadioActiveDot} />
                  </div>
                ) : (
                  <div className={styles.chooserRadioEmpty} aria-hidden="true" />
                )}
              </div>

              <h3 className={styles.chooserTitle}>{c.title}</h3>
              <p className={styles.chooserDesc}>{c.desc}</p>
            </div>
          );
        })}
      </div>

      {/* Info Callout Box */}
      <div className={styles.infoCallout}>
        <div className={styles.infoCalloutIcon} aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        </div>
        <div className={styles.infoCalloutContent}>
          <h4 className={styles.infoCalloutTitle}>{currentCallout.title}</h4>
          <p className={styles.infoCalloutDesc}>{currentCallout.desc}</p>
        </div>
      </div>

      {/* Footer Action Controls */}
      <div className={styles.chooserFooterRow}>
        <button
          type="button"
          className={styles.chooserCancelBtn}
          onClick={onCancel}
        >
          Cancel
        </button>

        <button
          type="button"
          className={styles.chooserPrimaryBtn}
          onClick={() => onSelectType(selected)}
        >
          <span>Continue with {currentCard.title}</span>
          <span aria-hidden="true">&rarr;</span>
        </button>
      </div>
    </section>
  );
}
