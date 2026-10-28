import styles from "./certificates.module.css";

export default function CertificatesLoading() {
  return (
    <div className={styles.container}>
      {/* 1. HERO BANNER SKELETON */}
      <section className={styles.heroBanner} aria-label="Loading Certificates Overview">
        <div className={styles.heroLeft}>
          <div className="skeleton" style={{ width: 58, height: 58, borderRadius: "50%", flexShrink: 0 }} />
          <div className={styles.heroTextGroup} style={{ gap: 8 }}>
            <div className="skeleton" style={{ width: 220, height: 28, borderRadius: 6 }} />
            <div className="skeleton" style={{ width: 360, height: 16, borderRadius: 4 }} />
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
                  style={{ width: 52, height: 52, borderRadius: 14, flexShrink: 0 }}
                  aria-hidden="true"
                />
                <div className={styles.summaryContent} style={{ gap: 6, flex: 1 }}>
                  <div className="skeleton" style={{ width: 44, height: 28, borderRadius: 4 }} />
                  <div className="skeleton" style={{ width: 80, height: 16, borderRadius: 4 }} />
                  <div className="skeleton" style={{ width: 120, height: 12, borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>

          {/* Courses Card Skeleton */}
          <section className={styles.coursesCard} aria-label="Loading courses">
            <div className={styles.cardHeader} style={{ marginBottom: 20 }}>
              <div className="skeleton" style={{ width: 160, height: 24, borderRadius: 6, marginBottom: 8 }} />
              <div className="skeleton" style={{ width: 320, height: 14, borderRadius: 4 }} />
            </div>

            <ul className={styles.coursesList} aria-hidden="true">
              {[1, 2, 3].map((i) => (
                <li key={i} className={styles.courseItem} style={{ pointerEvents: "none" }}>
                  <div
                    className="skeleton"
                    style={{ width: 104, height: 68, borderRadius: 10, flexShrink: 0 }}
                  />
                  <div className={styles.courseMain}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div className="skeleton" style={{ width: "42%", height: 18, borderRadius: 4 }} />
                      <div className="skeleton" style={{ width: 80, height: 22, borderRadius: 999 }} />
                    </div>
                    <div className="skeleton" style={{ width: "35%", height: 12, borderRadius: 4, marginBottom: 8 }} />
                    <div className="skeleton" style={{ width: "100%", height: 8, borderRadius: 999 }} />
                  </div>
                  <div className={styles.courseAction}>
                    <div className="skeleton" style={{ width: 140, height: 38, borderRadius: 12 }} />
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
              <div className={styles.howHeader} style={{ marginBottom: 16 }}>
                <div className="skeleton" style={{ width: 200, height: 24, borderRadius: 6, marginBottom: 8 }} />
                <div className="skeleton" style={{ width: 260, height: 14, borderRadius: 4 }} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <div className="skeleton" style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0 }} />
                    <div className="skeleton" style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0 }} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, paddingTop: 2 }}>
                      <div className="skeleton" style={{ width: "65%", height: 16, borderRadius: 4 }} />
                      <div className="skeleton" style={{ width: "85%", height: 12, borderRadius: 4 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.howIllustrationContainer}>
              <div className="skeleton" style={{ width: "100%", height: 90, borderRadius: 12 }} />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
