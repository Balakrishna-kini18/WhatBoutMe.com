import styles from "./path.module.css";

export default function ProgramStepsLoading() {
  return (
    <div className={styles.container}>
      {/* Page Header Skeleton */}
      <header className={styles.header}>
        <div
          className="skeleton"
          style={{ width: 76, height: 32, borderRadius: 999 }}
          aria-hidden="true"
        />
        <span className={styles.headerDivider} aria-hidden="true" />
        <div
          className="skeleton"
          style={{ width: 280, height: 28, borderRadius: 6 }}
          aria-hidden="true"
        />
      </header>

      {/* Main Two-Column Skeleton Grid */}
      <div className={styles.layoutGrid}>
        {/* Main Column: Timeline Steps Skeleton */}
        <main className={styles.mainCol}>
          <section className={styles.card} aria-label="Loading steps">
            <div className={styles.cardHead}>
              <div className="skeleton" style={{ width: 60, height: 20, borderRadius: 4 }} />
              <div className="skeleton" style={{ width: 130, height: 24, borderRadius: 999 }} />
            </div>

            <ol className={styles.timeline} aria-hidden="true">
              {[1, 2, 3, 4, 5, 6].map((idx) => (
                <li key={idx} className={styles.step} style={{ opacity: 1 }}>
                  {/* Step Marker Circle */}
                  <div
                    className="skeleton"
                    style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0 }}
                  />

                  {/* Step Body */}
                  <div className={styles.stepBody}>
                    <div
                      className="skeleton"
                      style={{ width: 52, height: 12, marginBottom: 8, borderRadius: 4 }}
                    />
                    <div
                      className="skeleton"
                      style={{
                        width: idx % 2 === 0 ? "55%" : "42%",
                        height: 18,
                        marginBottom: 8,
                        borderRadius: 5,
                      }}
                    />
                    <div
                      className="skeleton"
                      style={{
                        width: idx % 2 === 0 ? "75%" : "65%",
                        height: 13,
                        borderRadius: 4,
                      }}
                    />
                  </div>

                  {/* Step Action Button */}
                  <div className={styles.stepActionCol}>
                    <div
                      className="skeleton"
                      style={{ width: 92, height: 34, borderRadius: 8, flexShrink: 0 }}
                    />
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </main>

        {/* Aside Sidebar Skeleton */}
        <aside className={styles.sideCol}>
          {/* Progress Card Skeleton */}
          <section className={`${styles.card} ${styles.progressCard}`} aria-hidden="true">
            <div className={styles.cardHead} style={{ justifyContent: "flex-start" }}>
              <div className="skeleton" style={{ width: 120, height: 18, borderRadius: 4 }} />
            </div>
            <div className={styles.ringWrap} style={{ padding: "16px 0" }}>
              <div
                className="skeleton"
                style={{ width: 120, height: 120, borderRadius: "50%", margin: "0 auto 14px" }}
              />
              <div
                className="skeleton"
                style={{ width: 100, height: 14, borderRadius: 4, margin: "0 auto" }}
              />
            </div>
          </section>

          {/* Cohort Batch Card Skeleton */}
          <section className={styles.card} aria-hidden="true">
            <div className={styles.cardHead} style={{ justifyContent: "flex-start" }}>
              <div className="skeleton" style={{ width: 95, height: 18, borderRadius: 4 }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "4px 0" }}>
              <div className="skeleton" style={{ width: "85%", height: 15, borderRadius: 4 }} />
              <div className="skeleton" style={{ width: "60%", height: 13, borderRadius: 4 }} />
              <div className="skeleton" style={{ width: "70%", height: 13, borderRadius: 4 }} />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
