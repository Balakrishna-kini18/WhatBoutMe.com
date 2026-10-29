import styles from "./certificates.module.css";

export default function CertificatesLoading() {
  return (
    <div className={styles.container}>
      {/* 1. HERO BANNER SKELETON */}
      <section className={styles.heroBanner} aria-label="Loading Certificates Overview">
        <div className={styles.heroLeft}>
          <div className="skeleton" style={{ width: 52, height: 52, borderRadius: "50%", flexShrink: 0 }} />
          <div className={styles.heroTextGroup} style={{ gap: 6 }}>
            <div className="skeleton" style={{ width: 200, height: 26, borderRadius: 6 }} />
            <div className="skeleton" style={{ width: 340, height: 14, borderRadius: 4 }} />
          </div>
        </div>
      </section>

      {/* 2. MAIN TWO-COLUMN SKELETON */}
      <div className={styles.mainGrid}>
        {/* Left Column */}
        <div className={styles.leftCol}>
          {/* Summary Cards Skeleton */}
          <div className={styles.summaryRow} aria-label="Loading statistics">
            {[1, 2, 3].map((i) => (
              <div key={i} className={styles.summaryCard} style={{ pointerEvents: "none" }}>
                <div
                  className="skeleton"
                  style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0 }}
                  aria-hidden="true"
                />
                <div className={styles.summaryContent} style={{ gap: 4, flex: 1 }}>
                  <div className="skeleton" style={{ width: 40, height: 24, borderRadius: 4 }} />
                  <div className="skeleton" style={{ width: 75, height: 14, borderRadius: 4 }} />
                  <div className="skeleton" style={{ width: 110, height: 11, borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>

          {/* Courses Card Skeleton */}
          <section className={styles.coursesCard} aria-label="Loading courses">
            <div className={styles.cardHeader} style={{ marginBottom: 14 }}>
              <div className="skeleton" style={{ width: 150, height: 22, borderRadius: 6, marginBottom: 6 }} />
              <div className="skeleton" style={{ width: 300, height: 13, borderRadius: 4 }} />
            </div>

            <ul className={styles.coursesList} aria-hidden="true">
              {[1, 2, 3].map((i) => (
                <li key={i} className={styles.courseItem} style={{ pointerEvents: "none" }}>
                  <div
                    className="skeleton"
                    style={{ width: 92, height: 60, borderRadius: 8, flexShrink: 0 }}
                  />
                  <div className={styles.courseMain}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                      <div className="skeleton" style={{ width: "42%", height: 16, borderRadius: 4 }} />
                      <div className="skeleton" style={{ width: 72, height: 20, borderRadius: 999 }} />
                    </div>
                    <div className="skeleton" style={{ width: "35%", height: 11, borderRadius: 4, marginBottom: 6 }} />
                    <div className="skeleton" style={{ width: "100%", height: 7, borderRadius: 999 }} />
                  </div>
                  <div className={styles.courseAction}>
                    <div className="skeleton" style={{ width: 124, height: 34, borderRadius: 10 }} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Right Column */}
        <aside className={styles.rightCol} aria-label="Loading How Certification Works">
          <section className={styles.howCard}>
            <div>
              <div className={styles.howHeader} style={{ marginBottom: 12 }}>
                <div className="skeleton" style={{ width: 180, height: 22, borderRadius: 6, marginBottom: 6 }} />
                <div className="skeleton" style={{ width: 240, height: 13, borderRadius: 4 }} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div className="skeleton" style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0 }} />
                    <div className="skeleton" style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0 }} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, paddingTop: 1 }}>
                      <div className="skeleton" style={{ width: "65%", height: 14, borderRadius: 4 }} />
                      <div className="skeleton" style={{ width: "85%", height: 11, borderRadius: 4 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.howIllustrationContainer}>
              <div className="skeleton" style={{ width: "100%", height: 80, borderRadius: 12 }} />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
