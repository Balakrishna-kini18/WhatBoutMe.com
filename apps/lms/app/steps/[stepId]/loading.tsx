import styles from "./step.module.css";

const ArrowLeft = (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

export default function StepLoading() {
  return (
    <div className={styles.container} aria-busy="true" aria-label="Loading lesson workspace...">
      {/* =====================================================================
          TOP HEADER SKELETON (Pixel-perfect match with Step Page Header)
          ===================================================================== */}
      <header className={styles.header}>
        <div className={styles.headerNavRow}>
          <div className={styles.backLink} style={{ pointerEvents: "none", opacity: 0.85 }}>
            <span className={styles.backIconWrap}>{ArrowLeft}</span>
            <span className={styles.backText}>Back</span>
          </div>
          <span className={styles.headerDivider} aria-hidden="true" />
          <div className={styles.skeletonPulse} style={{ width: 180, height: 26, borderRadius: 6, minWidth: 0, flexShrink: 1 }} />
        </div>
        <div className={`${styles.skeletonPulse} ${styles.cardMetaBadgeSkeleton}`} style={{ width: 200, height: 20, borderRadius: 999 }} />
      </header>

      {/* =====================================================================
          TABS STRIP SKELETON
          ===================================================================== */}
      <div>
        <nav className={styles.lessonFlowStrip} aria-label="Lesson Workspace Tabs">
          <div className={`${styles.flowStepItem} ${styles.flowStepItemActive}`}>
            <span className={styles.flowStepBadge}>1</span>
            <div className={styles.flowStepText}>
              <span className={styles.flowStepLabel}>Part 1</span>
              <span className={styles.flowStepTitle}>Loading...</span>
            </div>
            <span className={styles.flowStepActiveIndicator} />
          </div>

          <div className={styles.flowStepItem} style={{ opacity: 0.7 }}>
            <span className={styles.flowStepBadge}>2</span>
            <div className={styles.flowStepText}>
              <span className={styles.flowStepLabel}>Part 2</span>
              <span className={styles.flowStepTitle}>...</span>
            </div>
          </div>

          <div className={styles.flowStepItem} style={{ opacity: 0.6 }}>
            <span className={styles.flowStepBadge}>📁</span>
            <div className={styles.flowStepText}>
              <span className={styles.flowStepLabel}>Materials</span>
              <span className={styles.flowStepTitle}>...</span>
            </div>
          </div>

          <div className={styles.flowStepItem} style={{ opacity: 0.6 }}>
            <span className={styles.flowStepBadge}>📝</span>
            <div className={styles.flowStepText}>
              <span className={styles.flowStepLabel}>Quiz</span>
              <span className={styles.flowStepTitle}>...</span>
            </div>
          </div>
        </nav>

        {/* =====================================================================
            2-COLUMN WORKSPACE GRID (Video Column + Notes Companion Column)
            ===================================================================== */}
        <div className={styles.lessonWorkspaceGrid}>
          {/* Left Column: 16:9 Player Viewport + Lesson Details + Playlist */}
          <div className={styles.videoLeftColumn}>
            <div className={styles.unifiedVideoCard}>
              {/* Dynamic Video Title Header Skeleton */}
              <div className={styles.videoPlayerHeader}>
                <div className={styles.videoHeaderLeft} style={{ gap: 8 }}>
                  <div className={styles.skeletonPulse} style={{ width: 85, height: 20, borderRadius: 999 }} />
                  <div className={styles.skeletonPulse} style={{ width: 260, height: 22, borderRadius: 6 }} />
                </div>
                <div className={styles.skeletonPulse} style={{ width: 110, height: 18, borderRadius: 4 }} />
              </div>

              {/* 16:9 Video Viewport (Dark modern canvas with play circle) */}
              <div
                className={styles.videoPlayerViewport}
                style={{
                  background: "#090d16",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: "50%",
                    background: "rgba(255, 255, 255, 0.12)",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#ffffff",
                    fontSize: "1.35rem",
                    backdropFilter: "blur(4px)",
                    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.3)",
                  }}
                >
                  ▶
                </div>
              </div>

              {/* Lesson Details Card Skeleton below video */}
              <div className={styles.lessonDetailsCard} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div className={styles.skeletonPulse} style={{ width: "92%", height: 16, borderRadius: 4 }} />
                <div className={styles.skeletonPulse} style={{ width: "70%", height: 16, borderRadius: 4 }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
                  <div className={styles.skeletonPulse} style={{ width: 130, height: 34, borderRadius: 8 }} />
                  <div className={styles.skeletonPulse} style={{ width: 140, height: 34, borderRadius: 8 }} />
                </div>
              </div>
            </div>

            {/* Multi-video Playlist Card Skeleton */}
            <div className={styles.multiVideoPlaylistCard} style={{ marginTop: "1rem" }}>
              <div className={styles.multiVideoPlaylistHeader}>
                <div className={styles.skeletonPulse} style={{ width: 200, height: 18, borderRadius: 4 }} />
                <div className={styles.skeletonPulse} style={{ width: 100, height: 16, borderRadius: 4 }} />
              </div>
              <div className={styles.multiVideoTrackList}>
                <div className={styles.skeletonPulse} style={{ width: "100%", height: 48, borderRadius: 8 }} />
                <div className={styles.skeletonPulse} style={{ width: "100%", height: 48, borderRadius: 8 }} />
              </div>
            </div>
          </div>

          {/* Right Column: Notes & Highlights Companion Skeleton */}
          <div className={styles.notesRightCol}>
            <div className={styles.notesCompanionCard} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Header */}
              <div className={styles.notesCompanionHeader}>
                <div>
                  <h4 className={styles.notesCompanionTitle}>My Notes &amp; Highlights</h4>
                  <span className={styles.notesCompanionMeta}>
                    Personal • Private to you
                  </span>
                </div>
                <div className={styles.skeletonPulse} style={{ width: 75, height: 22, borderRadius: 6 }} />
              </div>

              {/* Note Form Skeleton */}
              <div className={styles.noteFormContainer} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {/* Title + Star + Timestamp row */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div className={styles.skeletonPulse} style={{ flex: 1, height: 34, borderRadius: 8 }} />
                  <div className={styles.skeletonPulse} style={{ width: 34, height: 34, borderRadius: 8 }} />
                  <div className={styles.skeletonPulse} style={{ width: 68, height: 34, borderRadius: 6 }} />
                </div>

                {/* Toolbar bar */}
                <div className={styles.skeletonPulse} style={{ width: "100%", height: 30, borderRadius: "8px 8px 0 0" }} />

                {/* Textarea body */}
                <div className={styles.skeletonPulse} style={{ width: "100%", height: 80, borderRadius: "0 0 8px 8px" }} />

                {/* Save Note button row */}
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 2 }}>
                  <div className={styles.skeletonPulse} style={{ width: 95, height: 32, borderRadius: 8 }} />
                </div>
              </div>

              {/* Saved Notes Feed Skeleton */}
              <div className={styles.savedNotesFeed} style={{ marginTop: 8 }}>
                <div className={styles.skeletonPulse} style={{ width: "100%", height: 72, borderRadius: 10 }} />
                <div className={styles.skeletonPulse} style={{ width: "100%", height: 72, borderRadius: 10 }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
