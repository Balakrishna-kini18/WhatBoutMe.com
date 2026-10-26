import styles from "./path.module.css";

export default function ProgramStepsLoading() {
  return (
    <div className={styles.container}>
      {/* Header Skeleton */}
      <div className={styles.header}>
        <div className="skeleton" style={{ width: 140, height: 16, marginBottom: 14, borderRadius: 4 }} />
        <div className="skeleton" style={{ width: "55%", height: 36, marginBottom: 12, borderRadius: 8 }} />
        <div className="skeleton" style={{ width: "38%", height: 16, borderRadius: 4 }} />
      </div>

      {/* Main Two-Column Skeleton Grid */}
      <div className={styles.layoutGrid}>
        <div className={styles.mainCol}>
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <div className="skeleton" style={{ width: 90, height: 22, borderRadius: 6 }} />
              <div className="skeleton" style={{ width: 110, height: 16, borderRadius: 4 }} />
            </div>

            <ol className={styles.timeline}>
              {[1, 2, 3, 4, 5].map((idx) => (
                <li key={idx} className={styles.step} style={{ opacity: 1 }}>
                  <div className="skeleton" style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0 }} />
                  <div className={styles.stepBody}>
                    <div className="skeleton" style={{ width: 70, height: 12, marginBottom: 8, borderRadius: 4 }} />
                    <div className="skeleton" style={{ width: "45%", height: 20, marginBottom: 8, borderRadius: 6 }} />
                    <div className="skeleton" style={{ width: "65%", height: 14, borderRadius: 4 }} />
                  </div>
                  <div className={styles.stepActionCol}>
                    <div className="skeleton" style={{ width: 88, height: 34, borderRadius: 8 }} />
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* Aside Sidebar Skeleton */}
        <aside className={styles.sideCol}>
          {/* Progress Card Skeleton */}
          <section className={`${styles.card} ${styles.progressCard}`}>
            <div className={styles.cardHead} style={{ justifyContent: "flex-start" }}>
              <div className="skeleton" style={{ width: 80, height: 20, borderRadius: 6 }} />
            </div>
            <div className={styles.ringWrap}>
              <div className="skeleton" style={{ width: 120, height: 120, borderRadius: "50%" }} />
              <div className="skeleton" style={{ width: 140, height: 14, borderRadius: 4 }} />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
