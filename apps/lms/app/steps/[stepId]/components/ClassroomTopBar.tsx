"use client";

import React, { useState } from "react";
import Link from "next/link";
import styles from "../step.module.css";
import ProgressRing from "../../../components/ui/ProgressRing";

interface ClassroomTopBarProps {
  programId: string;
  programTitle: string;
  stepSequence: number;
  stepTitle: string;
  activeActivity: "video" | "reading" | "notes" | "quiz" | "completion";
  hasPrevLesson: boolean;
  hasNextLesson: boolean;
  onNavigatePrev: () => void;
  onNavigateNext: () => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  onToggleAITutor: () => void;
  overallProgressPercent: number;
}

export default function ClassroomTopBar({
  programId,
  programTitle,
  stepSequence,
  stepTitle,
  activeActivity,
  hasPrevLesson,
  hasNextLesson,
  onNavigatePrev,
  onNavigateNext,
  isSidebarOpen,
  onToggleSidebar,
  onToggleAITutor,
  overallProgressPercent,
}: ClassroomTopBarProps) {
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const getActivityLabel = () => {
    switch (activeActivity) {
      case "video":
        return "🎬 Video Lesson";
      case "reading":
        return "📄 Reading Material";
      case "notes":
        return "📝 Personal Notes";
      case "quiz":
        return "🧠 Knowledge Check";
      case "completion":
        return "🎉 Step Mastered";
    }
  };

  return (
    <>
      <header className={styles.topNav}>
        {/* Left: Back & Course Breadcrumbs */}
        <div className={styles.topNavLeft}>
          <button
            type="button"
            className={styles.outlineToggleBtn}
            onClick={onToggleSidebar}
            title={isSidebarOpen ? "Collapse Curriculum (o)" : "Expand Curriculum (o)"}
            aria-label="Toggle Curriculum Sidebar"
          >
            <span>{isSidebarOpen ? "«" : "☰"}</span>
            <span>{isSidebarOpen ? "Curriculum" : "Curriculum"}</span>
          </button>

          <Link
            href={`/programs/${programId}/steps`}
            className={styles.backLink}
            title="Return to Course Overview"
          >
            <span>←</span>
            <span>Course Path</span>
          </Link>

          <div className={styles.breadcrumbGroup}>
            <span className={styles.breadcrumbCourse} title={programTitle}>
              {programTitle || "Program"}
            </span>
            <span className={styles.breadcrumbDivider}>/</span>
            <span className={styles.breadcrumbCurrent} title={stepTitle}>
              Step {stepSequence}: {stepTitle}
            </span>
            <span className={styles.breadcrumbActivity}>
              {getActivityLabel()}
            </span>
          </div>
        </div>

        {/* Right: Lesson Controls & Quick Tools */}
        <div className={styles.topNavRight}>
          {/* Previous / Next Lesson Quick Switches */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              type="button"
              className={styles.playerToolBtn}
              onClick={onNavigatePrev}
              disabled={!hasPrevLesson}
              title="Previous Lesson ([)"
              style={{ opacity: hasPrevLesson ? 1 : 0.4, cursor: hasPrevLesson ? "pointer" : "not-allowed" }}
            >
              <span>‹</span>
              <span>Prev</span>
            </button>
            <button
              type="button"
              className={styles.playerToolBtn}
              onClick={onNavigateNext}
              disabled={!hasNextLesson}
              title="Next Lesson (])"
              style={{ opacity: hasNextLesson ? 1 : 0.4, cursor: hasNextLesson ? "pointer" : "not-allowed" }}
            >
              <span>Next</span>
              <span>›</span>
            </button>
          </div>

          {/* Overall Course Progress Ring */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }} title="Course Completion Progress">
            <ProgressRing progressPercent={overallProgressPercent} size={36} strokeWidth={3} />
            <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)" }}>
              {Math.round(overallProgressPercent)}%
            </span>
          </div>

          {/* AI Tutor Trigger */}
          <button
            type="button"
            className={styles.playerToolBtn}
            onClick={onToggleAITutor}
            title="Open AI Tutor Copilot (t)"
            style={{
              background: "var(--accent-highlight, #f6edde)",
              color: "var(--accent-primary, #c97a1e)",
              border: "1px solid var(--accent-primary, #c97a1e)",
              fontWeight: 700,
            }}
          >
            <span>🤖</span>
            <span>AI Tutor</span>
          </button>

          {/* Keyboard Shortcuts Trigger */}
          <button
            type="button"
            className={styles.playerToolBtn}
            onClick={() => setShowShortcuts(true)}
            title="Keyboard Shortcuts (?)"
          >
            <span>⌨</span>
          </button>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            className={styles.playerToolBtn}
            onClick={toggleFullscreen}
            title="Toggle Fullscreen (f)"
          >
            <span>{isFullscreen ? "⛶" : "⛶"}</span>
          </button>
        </div>
      </header>

      {/* Keyboard Shortcuts Dialog Modal */}
      {showShortcuts && (
        <>
          <div className={styles.drawerBackdrop} onClick={() => setShowShortcuts(false)} />
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              background: "#ffffff",
              borderRadius: 16,
              padding: "2rem",
              width: "480px",
              maxWidth: "92vw",
              zIndex: 120,
              boxShadow: "0 20px 40px rgba(20, 17, 15, 0.2)",
              border: "1px solid var(--border-light)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <h3 style={{ fontFamily: "var(--font-serif)", fontSize: "1.3rem", margin: 0 }}>
                ⌨ Keyboard Shortcuts
              </h3>
              <button
                type="button"
                onClick={() => setShowShortcuts(false)}
                className={styles.drawerCloseBtn}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", fontSize: "0.88rem" }}>
              {[
                { key: "Space / k", desc: "Play or pause video" },
                { key: "j / l", desc: "Seek backward or forward 10s" },
                { key: "m", desc: "Mute or unmute audio" },
                { key: "f", desc: "Toggle fullscreen mode" },
                { key: "o", desc: "Toggle Curriculum Sidebar" },
                { key: "t", desc: "Open AI Tutor Copilot" },
                { key: "[ / ]", desc: "Previous / Next Lesson" },
                { key: "Esc", desc: "Close drawer or dialog" },
              ].map((item) => (
                <div
                  key={item.key}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "0.4rem 0.6rem",
                    background: "var(--bg-card-muted)",
                    borderRadius: 8,
                  }}
                >
                  <span style={{ color: "var(--text-secondary)" }}>{item.desc}</span>
                  <kbd
                    style={{
                      background: "#ffffff",
                      border: "1px solid var(--border-light)",
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontFamily: "monospace",
                      fontWeight: 700,
                      color: "var(--accent-primary)",
                    }}
                  >
                    {item.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
