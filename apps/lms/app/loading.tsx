import styles from "./page.module.css";

export default function DashboardLoading() {
  return (
    <div className={styles.container}>
      {/* Welcome Banner Skeleton */}
      <section className={styles.welcomeBanner}>
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ width: 140, height: 16, marginBottom: 12, borderRadius: 4 }} />
          <div className="skeleton" style={{ width: "60%", height: 38, marginBottom: 12, borderRadius: 8 }} />
          <div className="skeleton" style={{ width: "45%", height: 16, borderRadius: 4 }} />
        </div>
      </section>

      {/* Stats Grid Skeleton */}
      <div className={styles.statsGrid}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={styles.statCard}>
            <div className="skeleton" style={{ width: 44, height: 44, borderRadius: 12, marginBottom: 16 }} />
            <div className="skeleton" style={{ width: 60, height: 28, marginBottom: 8, borderRadius: 6 }} />
            <div className="skeleton" style={{ width: 110, height: 14, borderRadius: 4 }} />
          </div>
        ))}
      </div>

      {/* Main Board Skeleton */}
      <div className={styles.board}>
        <div className={styles.boardMain}>
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div className="skeleton" style={{ width: 160, height: 22, borderRadius: 6 }} />
            </div>
            <div className="skeleton" style={{ width: "100%", height: 140, borderRadius: 14, marginBottom: 16 }} />
            <div className="skeleton" style={{ width: "100%", height: 140, borderRadius: 14 }} />
          </section>
        </div>

        <aside className={styles.boardSide}>
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div className="skeleton" style={{ width: 140, height: 22, borderRadius: 6 }} />
            </div>
            <div className="skeleton" style={{ width: "100%", height: 80, borderRadius: 12, marginBottom: 12 }} />
            <div className="skeleton" style={{ width: "100%", height: 80, borderRadius: 12 }} />
          </section>
        </aside>
      </div>
    </div>
  );
}
