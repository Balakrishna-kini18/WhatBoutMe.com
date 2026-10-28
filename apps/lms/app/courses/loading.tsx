import styles from "./courses.module.css";

export default function CoursesLoading() {
  return (
    <div className={styles.pageWrapper} aria-busy="true" aria-label="Loading enrolled courses...">
      {/* Header Skeleton */}
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>My Courses</h1>
      </header>

      {/* 4 Stat Cards Skeleton */}
      <div className={styles.statsGrid}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={styles.statCard} style={{ pointerEvents: "none" }}>
            <div
              className={styles.skeletonPulse}
              style={{ width: 46, height: 46, borderRadius: 12, flexShrink: 0 }}
              aria-hidden="true"
            />
            <div className={styles.statContent} style={{ gap: 6, flex: 1 }}>
              <div
                className={styles.skeletonPulse}
                style={{ width: 36, height: 22, borderRadius: 4 }}
                aria-hidden="true"
              />
              <div
                className={styles.skeletonPulse}
                style={{ width: 80, height: 14, borderRadius: 4 }}
                aria-hidden="true"
              />
            </div>
          </div>
        ))}
      </div>

      {/* Enrolled Courses Section Skeleton */}
      <section className={styles.coursesSection} aria-label="Loading enrolled courses">
        <div className={styles.sectionHeader}>
          <div className={styles.skeletonPulse} style={{ width: 170, height: 26, borderRadius: 6 }} />
          <div className={styles.skeletonPulse} style={{ width: 120, height: 34, borderRadius: 10 }} />
        </div>

        <div className={styles.cardGrid} aria-hidden="true">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className={styles.courseCard} style={{ pointerEvents: "none" }}>
              {/* 16:10 Cover image skeleton */}
              <div
                className={styles.skeletonPulse}
                style={{ width: "100%", aspectRatio: "16 / 10" }}
              />
              <div className={styles.cardBody} style={{ gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div
                    className={styles.skeletonPulse}
                    style={{ width: "55%", height: 20, borderRadius: 4 }}
                  />
                  <div
                    className={styles.skeletonPulse}
                    style={{ width: 75, height: 20, borderRadius: 999 }}
                  />
                </div>
                {/* Progress Line */}
                <div
                  className={styles.skeletonPulse}
                  style={{ width: "100%", height: 7, borderRadius: 999, margin: "4px 0" }}
                />
                {/* Subtitle text */}
                <div
                  className={styles.skeletonPulse}
                  style={{ width: "70%", height: 14, borderRadius: 4 }}
                />
              </div>
              {/* Action buttons */}
              <div className={styles.cardFooter}>
                <div className={styles.skeletonPulse} style={{ flex: 1, height: 36, borderRadius: 8 }} />
                <div className={styles.skeletonPulse} style={{ flex: 1, height: 36, borderRadius: 8 }} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
