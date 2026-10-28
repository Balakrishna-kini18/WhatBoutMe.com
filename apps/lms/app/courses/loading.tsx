import styles from "./courses.module.css";

export default function CoursesLoading() {
  return (
    <div className={styles.pageWrapper} aria-busy="true" aria-label="Loading your courses...">
      {/* 1. Warm Hero Banner Skeleton */}
      <div className={styles.heroBanner} style={{ pointerEvents: "none" }}>
        <div className={styles.bannerLeft}>
          <div className={styles.skeletonPulse} style={{ width: 82, height: 82, borderRadius: "50%", flexShrink: 0 }} />
          <div className={styles.bannerDivider} style={{ opacity: 0.5 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div className={styles.skeletonPulse} style={{ width: 170, height: 28, borderRadius: 6 }} />
            <div className={styles.skeletonPulse} style={{ width: 280, height: 15, borderRadius: 4, marginBottom: 4 }} />
            <div className={styles.skeletonPulse} style={{ width: 140, height: 14, borderRadius: 4 }} />
            <div className={styles.skeletonPulse} style={{ width: 95, height: 13, borderRadius: 4 }} />
          </div>
        </div>

        <div className={styles.bannerIllustrationWrap}>
          <div className={styles.skeletonPulse} style={{ width: 160, height: 90, borderRadius: 12 }} />
        </div>

        <div className={styles.bannerDivider} style={{ opacity: 0.5 }} />

        <div className={styles.bannerRight}>
          <div className={styles.skeletonPulse} style={{ width: 120, height: 22, borderRadius: 6, marginBottom: 6 }} />
          <div className={styles.skeletonPulse} style={{ width: 220, height: 14, borderRadius: 4, marginBottom: 4 }} />
          <div className={styles.skeletonPulse} style={{ width: 180, height: 14, borderRadius: 4 }} />
        </div>
      </div>

      {/* 3. 4 Summary Cards Skeleton */}
      <div className={styles.statsGrid}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={styles.statCard} style={{ pointerEvents: "none" }}>
            <div
              className={styles.skeletonPulse}
              style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0 }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
              <div className={styles.skeletonPulse} style={{ width: 36, height: 22, borderRadius: 4 }} />
              <div className={styles.skeletonPulse} style={{ width: 80, height: 15, borderRadius: 4 }} />
              <div className={styles.skeletonPulse} style={{ width: 100, height: 12, borderRadius: 3 }} />
            </div>
          </div>
        ))}
      </div>

      {/* 4. Enrolled Courses Section Skeleton */}
      <section className={styles.coursesSection} aria-label="Loading enrolled courses">
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitleGroup}>
            <div className={styles.skeletonPulse} style={{ width: 170, height: 24, borderRadius: 6 }} />
            <div className={styles.skeletonPulse} style={{ width: 240, height: 15, borderRadius: 4, marginTop: 3 }} />
          </div>

          <div className={styles.controlsGroup}>
            <div className={styles.skeletonPulse} style={{ width: 220, height: 36, borderRadius: 10 }} />
            <div className={styles.skeletonPulse} style={{ width: 76, height: 36, borderRadius: 8 }} />
            <div className={styles.skeletonPulse} style={{ width: 120, height: 36, borderRadius: 10 }} />
          </div>
        </div>

        <div className={styles.cardGrid} aria-hidden="true">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className={styles.courseCard} style={{ pointerEvents: "none" }}>
              <div
                className={styles.skeletonPulse}
                style={{ width: "100%", aspectRatio: "16 / 9" }}
              />
              <div className={styles.cardBody} style={{ gap: 8 }}>
                <div className={styles.skeletonPulse} style={{ width: "70%", height: 18, borderRadius: 4 }} />
                <div className={styles.skeletonPulse} style={{ width: "100%", height: 6, borderRadius: 999, margin: "2px 0" }} />
                <div className={styles.skeletonPulse} style={{ width: "85%", height: 13, borderRadius: 4 }} />
              </div>
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
