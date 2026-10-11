"use client";

import React, { useState } from "react";
import Link from "next/link";
import styles from "../step.module.css";
import ProgressRing from "../../../components/ui/ProgressRing";

interface ClassroomTopBarProps {
  programId: string;
  programTitle: string;
  batchName?: string;
  stepSequence: number;
  stepTitle: string;
  currentLessonTitle?: string;
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
  batchName,
  stepSequence,
  stepTitle,
  currentLessonTitle,
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

  const cohortName = batchName || programTitle || "Sigma batch";
  const displayLesson = currentLessonTitle || stepTitle || "Quick Start";

  return (
    <>
      <header className={styles.topNav} role="banner">
        {/* Left: Curriculum Toggle & Batch Breadcrumb */}
        <div className={styles.topNavLeft}>
          <button
            type="button"
            className={styles.outlineToggleBtn}
            onClick={onToggleSidebar}
            title={isSidebarOpen ? "Collapse Curriculum" : "Expand Curriculum"}
            aria-label="Toggle Curriculum Sidebar"
          >
            <span>{isSidebarOpen ? "←" : "☰"}</span>
            <span>Curriculum</span>
          </button>

          <span className={styles.topNavCohort} title={cohortName}>
            <span>•</span>
            <span>{cohortName}</span>
          </span>
        </div>

        {/* Right: Path Breadcrumb, Lesson Switchers, Progress & Quick Actions */}
        <div className={styles.topNavRightCluster}>
          {/* Path Breadcrumb Card matching reference */}
          <div className={styles.topNavPathCard} title={`${cohortName} / Module ${stepSequence}: ${stepTitle} / ${displayLesson}`}>
            <span className={styles.topNavPathIcon} aria-hidden="true">🗂</span>
            <span>
              {cohortName} / Module {stepSequence}: {stepTitle} /{" "}
              <strong className={styles.topNavPathCurrent}>{displayLesson}</strong>
            </span>
          </div>

          {/* Previous / Next Lesson Switchers */}
          <button
            type="button"
            className={styles.topNavBtn}
            onClick={onNavigatePrev}
            disabled={!hasPrevLesson}
            title="Previous Lesson"
            aria-label="Previous Lesson"
          >
            <span>‹</span>
            <span>Previous</span>
          </button>

          <button
            type="button"
            className={styles.topNavBtn}
            onClick={onNavigateNext}
            disabled={!hasNextLesson}
            title="Next Lesson"
            aria-label="Next Lesson"
          >
            <span>Next</span>
            <span>›</span>
          </button>

          {/* Course Progress Ring */}
          <div
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 4px" }}
            title={`Overall Course Progress: ${Math.round(overallProgressPercent)}%`}
          >
            <ProgressRing progressPercent={overallProgressPercent} size={32} strokeWidth={3} />
            <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)" }}>
              {Math.round(overallProgressPercent)}%
            </span>
          </div>

          {/* Theme Toggle Icon */}
          <button
            type="button"
            className={styles.topNavIconBtn}
            onClick={() => {
              // Subtle theme toggle feedback
              const isDark = document.documentElement.classList.toggle("dark");
              localStorage.setItem("wbm_theme", isDark ? "dark" : "light");
            }}
            title="Toggle Light / Dark Mode"
            aria-label="Toggle Theme"
          >
            <span>☀️</span>
          </button>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            className={styles.topNavIconBtn}
            onClick={toggleFullscreen}
            title="Toggle Fullscreen (f)"
            aria-label="Toggle Fullscreen"
          >
            <span>⛶</span>
          </button>

          {/* AI Tutor Entry Button */}
          <button
            type="button"
            className={styles.topNavAITutorBtn}
            onClick={onToggleAITutor}
            title="AI Study Copilot"
            aria-label="Open AI Tutor"
          >
            <span>🤖</span>
            <span>AI Tutor</span>
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
                { key: "Curriculum", desc: "Toggle Curriculum Sidebar" },
                { key: "t", desc: "Focus AI Tutor Copilot" },
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
