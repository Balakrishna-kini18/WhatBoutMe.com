"use client";

import React from "react";
import styles from "../step.module.css";
import { StepIcons } from "./StepIcons";

interface PostVideoCelebrationProps {
  lessonTitle: string;
  nextTaskLabel: string;
  onContinue: () => void;
  onReplay: () => void;
  xpEarned?: number;
  streakDays?: number;
}

export default function PostVideoCelebration({
  lessonTitle,
  nextTaskLabel,
  onContinue,
  onReplay,
  xpEarned = 50,
  streakDays = 4,
}: PostVideoCelebrationProps) {
  return (
    <div
      style={{
        width: "100%",
        marginTop: "1.25rem",
        background: "linear-gradient(135deg, #ffffff 0%, #fdfbf7 100%)",
        border: "1.5px solid #86efac",
        borderRadius: 14,
        padding: "1.75rem",
        boxShadow: "0 10px 25px -5px rgba(22, 163, 74, 0.12)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        boxSizing: "border-box",
      }}
    >
      <div style={{ color: "#16a34a", marginBottom: "0.5rem" }}>
        <StepIcons.CheckCircle size={40} />
      </div>
      <h3 style={{ fontFamily: "var(--font-sans)", fontSize: "1.5rem", margin: "0 0 0.25rem", color: "#166534" }}>
        Lesson Video Completed!
      </h3>
      <p style={{ margin: "0 0 1.25rem", color: "var(--text-secondary)", fontSize: "0.92rem" }}>
        You've completed <strong>{lessonTitle}</strong>. Keep the momentum going!
      </p>

      {/* Gamification Pills (Clean outline icons) */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem", flexWrap: "wrap", justifyContent: "center" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            padding: "6px 14px",
            borderRadius: 9999,
            fontSize: "0.85rem",
            fontWeight: 700,
            color: "#15803d",
          }}
        >
          <StepIcons.Award size={14} />
          <span>+{xpEarned} Skill XP</span>
        </div>

        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "#fffbeb",
            border: "1px solid #fde68a",
            padding: "6px 14px",
            borderRadius: 9999,
            fontSize: "0.85rem",
            fontWeight: 700,
            color: "#b45309",
          }}
        >
          <StepIcons.Clock size={14} />
          <span>{streakDays}-Day Learning Streak</span>
        </div>
      </div>

      {/* Next Task Card */}
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: "var(--bg-soft)",
          border: "1px solid var(--border-light)",
          borderRadius: 10,
          padding: "1rem 1.25rem",
          marginBottom: "1.5rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          textAlign: "left",
        }}
      >
        <div>
          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--accent-primary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Up Next
          </span>
          <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)" }}>
            {nextTaskLabel}
          </div>
        </div>
        <span style={{ fontSize: "1.2rem", color: "var(--accent-primary)" }}>→</span>
      </div>

      {/* Action Buttons */}
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
        <button
          type="button"
          className={styles.continueActionBtn}
          onClick={onContinue}
          style={{ padding: "0.75rem 2rem", fontSize: "0.95rem" }}
        >
          <span>Continue to Next Activity</span>
          <span>&rarr;</span>
        </button>

        <button
          type="button"
          onClick={onReplay}
          style={{
            background: "transparent",
            border: "1px solid var(--border-light)",
            borderRadius: 8,
            padding: "0.7rem 1.25rem",
            fontSize: "0.85rem",
            fontWeight: 600,
            color: "var(--text-secondary)",
            cursor: "pointer",
          }}
        >
          Replay Video
        </button>
      </div>
    </div>
  );
}
