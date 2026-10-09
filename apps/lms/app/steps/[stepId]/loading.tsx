import styles from "./step.module.css";

export default function StepLoading() {
  return (
    <div className={styles.workspaceLayout}>
      {/* Top Nav Skeleton */}
      <header className={styles.topNav}>
        <div className={styles.topNavLeft}>
          <div className="skeleton" style={{ width: 110, height: 32, borderRadius: 8 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="skeleton" style={{ width: 140, height: 16, borderRadius: 4 }} />
            <span style={{ color: "var(--border-light)" }}>/</span>
            <div className="skeleton" style={{ width: 200, height: 18, borderRadius: 4 }} />
          </div>
        </div>

        <div className={styles.topNavRight}>
          <div className="skeleton" style={{ width: 180, height: 28, borderRadius: 20 }} />
          <div className="skeleton" style={{ width: 80, height: 32, borderRadius: 8 }} />
        </div>
      </header>

      {/* Main 3-Panel Frame */}
      <div className={styles.mainThreePanelFrame}>
        {/* Left Outline Skeleton */}
        <aside className={styles.leftSidebar} style={{ padding: "1.25rem" }}>
          <div className="skeleton" style={{ width: 160, height: 20, marginBottom: 12, borderRadius: 4 }} />
          <div className="skeleton" style={{ width: "100%", height: 6, borderRadius: 3, marginBottom: 20 }} />

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "0.75rem",
                  background: "#ffffff",
                  borderRadius: 12,
                  border: "1px solid var(--border-light)",
                }}
              >
                <div className="skeleton" style={{ width: 28, height: 28, borderRadius: 14, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div className="skeleton" style={{ width: "75%", height: 14, marginBottom: 6, borderRadius: 4 }} />
                  <div className="skeleton" style={{ width: "45%", height: 10, borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Center Workspace Skeleton */}
        <main className={styles.centerWorkspace} style={{ maxWidth: 960 }}>
          {/* Journey Tabs Skeleton */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            {["Video Lesson", "Resources & PDFs", "Personal Notes", "Knowledge Check"].map((label, idx) => (
              <div
                key={label}
                className="skeleton"
                style={{
                  width: idx === 0 ? 130 : 140,
                  height: 38,
                  borderRadius: 20,
                  opacity: idx === 0 ? 1 : 0.6,
                }}
              />
            ))}
          </div>

          {/* 16:9 Video Canvas Skeleton */}
          <div
            className="skeleton"
            style={{
              width: "100%",
              aspectRatio: "16 / 9",
              borderRadius: 16,
              marginBottom: 24,
            }}
          />

          {/* Title & Metadata Skeleton */}
          <div style={{ background: "#ffffff", padding: "1.5rem", borderRadius: 16, border: "1px solid var(--border-light)" }}>
            <div className="skeleton" style={{ width: 120, height: 12, borderRadius: 4, marginBottom: 10 }} />
            <div className="skeleton" style={{ width: "60%", height: 28, borderRadius: 6, marginBottom: 12 }} />
            <div className="skeleton" style={{ width: "90%", height: 14, borderRadius: 4, marginBottom: 8 }} />
            <div className="skeleton" style={{ width: "70%", height: 14, borderRadius: 4 }} />
          </div>
        </main>

        {/* Right Sidebar Skeleton */}
        <aside className={styles.rightSidebar} style={{ padding: "1.25rem" }}>
          <div style={{ background: "#ffffff", padding: "1rem", borderRadius: 14, border: "1px solid var(--border-light)", marginBottom: 16 }}>
            <div className="skeleton" style={{ width: 100, height: 14, marginBottom: 10, borderRadius: 4 }} />
            <div className="skeleton" style={{ width: 60, height: 32, marginBottom: 8, borderRadius: 6 }} />
            <div className="skeleton" style={{ width: "100%", height: 8, borderRadius: 4 }} />
          </div>

          <div style={{ background: "#ffffff", padding: "1rem", borderRadius: 14, border: "1px solid var(--border-light)", marginBottom: 16 }}>
            <div className="skeleton" style={{ width: 120, height: 14, marginBottom: 12, borderRadius: 4 }} />
            {[1, 2, 3, 4].map((j) => (
              <div key={j} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div className="skeleton" style={{ width: 18, height: 18, borderRadius: 9, flexShrink: 0 }} />
                <div className="skeleton" style={{ width: "65%", height: 12, borderRadius: 4 }} />
              </div>
            ))}
          </div>

          <div style={{ background: "#ffffff", padding: "1rem", borderRadius: 14, border: "1px solid var(--border-light)" }}>
            <div className="skeleton" style={{ width: 80, height: 14, marginBottom: 10, borderRadius: 4 }} />
            <div className="skeleton" style={{ width: "80%", height: 16, marginBottom: 6, borderRadius: 4 }} />
            <div className="skeleton" style={{ width: "50%", height: 10, borderRadius: 4 }} />
          </div>
        </aside>
      </div>

      {/* Sticky Bottom Bar Skeleton */}
      <footer className={styles.stickyBottomBar}>
        <div className="skeleton" style={{ width: 140, height: 36, borderRadius: 8 }} />
        <div className="skeleton" style={{ width: 180, height: 42, borderRadius: 10 }} />
      </footer>
    </div>
  );
}
