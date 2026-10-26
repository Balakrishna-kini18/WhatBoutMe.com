import styles from "./page.module.css";

export default function DashboardLoading() {
  return (
    <div className={styles.dashboard}>
      {/* 1. TOP GREETING BAR SKELETON */}
      <section className={styles.topGreetingBar} aria-label="Loading greeting">
        <div className={styles.greetingLeft}>
          <div
            className="skeleton"
            style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0 }}
            aria-hidden="true"
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div
              className="skeleton"
              style={{ width: 220, height: 28, borderRadius: 6 }}
              aria-hidden="true"
            />
            <div
              className="skeleton"
              style={{ width: 360, height: 16, borderRadius: 4 }}
              aria-hidden="true"
            />
          </div>
        </div>
      </section>

      {/* 2. MAIN 2-COLUMN DASHBOARD GRID */}
      <div className={styles.dashboardGrid}>
        {/* LEFT COLUMN: YOUR COURSES CONTAINER SKELETON */}
        <section className={styles.yourCoursesContainer} aria-label="Loading courses">
          <div className={styles.sectionHeaderRow}>
            <div className="skeleton" style={{ width: 140, height: 22, borderRadius: 6 }} />
            <div className="skeleton" style={{ width: 68, height: 16, borderRadius: 4 }} />
          </div>

          <div className={styles.coursesGrid2x2} aria-hidden="true">
            {[1, 2, 3, 4].map((i) => (
              <article key={i} className={styles.courseCard} style={{ pointerEvents: "none" }}>
                {/* 16:9 Cover Image Skeleton */}
                <div className={styles.courseCoverWrap}>
                  <div className="skeleton" style={{ width: "100%", height: "100%" }} />
                </div>

                {/* Card Body Skeleton */}
                <div className={styles.courseCardBody}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 10,
                    }}
                  >
                    <div className="skeleton" style={{ width: "65%", height: 18, borderRadius: 4 }} />
                    <div className="skeleton" style={{ width: 34, height: 16, borderRadius: 4 }} />
                  </div>

                  {/* Progress Bar Track Skeleton */}
                  <div
                    className="skeleton"
                    style={{ width: "100%", height: 6, borderRadius: 999, marginBottom: 14 }}
                  />

                  {/* Action Button Skeleton */}
                  <div
                    className="skeleton"
                    style={{ width: "100%", height: 38, borderRadius: 8 }}
                  />
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* RIGHT COLUMN: PROGRESS CARD SKELETON */}
        <aside className={styles.rightStack} aria-label="Loading progress">
          <section className={styles.yourProgressCard} aria-hidden="true">
            <div className="skeleton" style={{ width: 130, height: 22, borderRadius: 6, marginBottom: 20 }} />

            <div className={styles.donutsGrid}>
              {/* Donut 1 Skeleton */}
              <div className={`${styles.donutCol} ${styles.donutDivider}`}>
                <div
                  className="skeleton"
                  style={{ width: 116, height: 116, borderRadius: "50%", margin: "0 auto 12px" }}
                />
                <div
                  className="skeleton"
                  style={{ width: 90, height: 16, borderRadius: 4, margin: "0 auto 6px" }}
                />
                <div
                  className="skeleton"
                  style={{ width: 110, height: 13, borderRadius: 4, margin: "0 auto" }}
                />
              </div>

              {/* Donut 2 Skeleton */}
              <div className={styles.donutCol}>
                <div
                  className="skeleton"
                  style={{ width: 116, height: 116, borderRadius: "50%", margin: "0 auto 12px" }}
                />
                <div
                  className="skeleton"
                  style={{ width: 80, height: 16, borderRadius: 4, margin: "0 auto 6px" }}
                />
                <div
                  className="skeleton"
                  style={{ width: 100, height: 13, borderRadius: 4, margin: "0 auto" }}
                />
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
