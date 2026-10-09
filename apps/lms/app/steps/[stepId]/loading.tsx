import styles from "./step.module.css";

export default function StepLoading() {
  return (
    <div className={styles.classroomContainer}>
      {/* Top Nav Skeleton */}
      <header className={styles.topNav}>
        <div className={styles.topNavLeft}>
          <div className={styles.skeleton} style={{ width: 110, height: 32, borderRadius: 8 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className={styles.skeleton} style={{ width: 140, height: 16, borderRadius: 4 }} />
            <span style={{ color: "var(--border-light)" }}>/</span>
            <div className={styles.skeleton} style={{ width: 180, height: 18, borderRadius: 4 }} />
          </div>
        </div>

        <div className={styles.topNavRight}>
          <div className={styles.skeleton} style={{ width: 120, height: 26, borderRadius: 20 }} />
          <div className={styles.skeleton} style={{ width: 100, height: 32, borderRadius: 8 }} />
        </div>
      </header>

      {/* Main Single-Task Focus Area Skeleton */}
      <main className={`${styles.taskWorkspace} ${styles.videoScope}`}>
        {/* Activity Header Skeleton */}
        <div style={{ width: "100%", marginBottom: 24 }}>
          <div className={styles.skeleton} style={{ width: 150, height: 14, marginBottom: 10, borderRadius: 4 }} />
          <div className={styles.skeleton} style={{ width: "65%", height: 34, marginBottom: 10, borderRadius: 6 }} />
          <div className={styles.skeleton} style={{ width: "85%", height: 16, borderRadius: 4 }} />
        </div>

        {/* 16:9 Video Canvas Skeleton */}
        <div
          className={styles.skeleton}
          style={{
            width: "100%",
            aspectRatio: "16 / 9",
            borderRadius: 14,
            marginBottom: 20,
          }}
        />

        {/* Meta Bar Skeleton */}
        <div
          style={{
            width: "100%",
            height: 52,
            background: "#ffffff",
            borderRadius: 10,
            border: "1px solid var(--border-light)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 1.25rem",
          }}
        >
          <div className={styles.skeleton} style={{ width: 200, height: 16, borderRadius: 4 }} />
          <div className={styles.skeleton} style={{ width: 100, height: 28, borderRadius: 6 }} />
        </div>
      </main>

      {/* Sticky Bottom Bar Skeleton */}
      <footer className={styles.stickyBottomBar}>
        <div className={styles.skeleton} style={{ width: 140, height: 38, borderRadius: 8 }} />
        <div className={styles.skeleton} style={{ width: 140, height: 16, borderRadius: 4 }} />
        <div className={styles.skeleton} style={{ width: 180, height: 42, borderRadius: 8 }} />
      </footer>
    </div>
  );
}
