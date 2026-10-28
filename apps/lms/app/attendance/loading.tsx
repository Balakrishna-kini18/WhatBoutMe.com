import styles from "./attendance.module.css";

export default function AttendanceLoading() {
  return (
    <div className={styles.container}>
      {/* Header skeleton */}
      <header className={styles.header}>
        <div style={{ width: 80, height: 36, borderRadius: 999, background: "#ede8e0", animation: "pulse 1.5s infinite" }} />
        <div className={styles.headerTitleGroup}>
          <div style={{ width: 180, height: 36, borderRadius: 8, background: "#ede8e0", animation: "pulse 1.5s infinite" }} />
          <div style={{ width: 340, height: 28, borderRadius: 999, background: "#ede8e0", animation: "pulse 1.5s infinite" }} />
        </div>
      </header>

      {/* 2-Column Dashboard Layout */}
      <div className={styles.mainLayout}>
        {/* Left Column: Calendar Skeleton */}
        <div className={styles.calendarColumn}>
          <div className={styles.calendarCard}>
            {/* Top Toolbar */}
            <div className={styles.calendarNav}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: "#ede8e0" }} />
                <div style={{ width: 140, height: 24, borderRadius: 6, background: "#ede8e0" }} />
                <div style={{ width: 34, height: 34, borderRadius: 10, background: "#ede8e0" }} />
                <div style={{ width: 68, height: 34, borderRadius: 10, background: "#ede8e0" }} />
              </div>
              <div style={{ width: 180, height: 34, borderRadius: 12, background: "#ede8e0" }} />
            </div>

            {/* Weekdays */}
            <div className={styles.weekHeader}>
              {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((d) => (
                <div key={d} className={styles.weekDayName}>
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar Grid 35 Cells */}
            <div className={styles.calendarGrid}>
              {Array.from({ length: 35 }).map((_, idx) => (
                <div key={idx} className={styles.dayCell} style={{ pointerEvents: "none" }}>
                  <div className={styles.dayHeader}>
                    <div style={{ width: 16, height: 16, borderRadius: 4, background: "#f0ebe2" }} />
                  </div>
                  {idx % 5 === 0 && (
                    <div className={styles.cellEvents} style={{ marginTop: 4 }}>
                      <div style={{ width: "75%", height: 18, borderRadius: 6, background: "#f0ebe2" }} />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Legend Skeleton */}
            <div className={styles.legend}>
              <div className={styles.legendItem}>
                <span className={styles.legendDotPresent} />
                <span>Attendance Logged (Present)</span>
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendDotCohort} />
                <span>Cohort Live Class</span>
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendDotCoaching} />
                <span>1-on-1 Coaching</span>
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendDotToday} />
                <span>Current Day</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar Column Skeleton */}
        <aside className={styles.sidebarColumn}>
          {/* Stats Card Skeleton */}
          <div className={styles.statsCard}>
            <div className={styles.statsHeader}>
              <div style={{ width: 140, height: 22, borderRadius: 6, background: "#ede8e0" }} />
            </div>
            <div className={styles.statsTilesRow}>
              {[1, 2, 3].map((i) => (
                <div key={i} className={styles.statTile}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: "#f0ebe2" }} />
                  <div style={{ width: 32, height: 24, borderRadius: 4, background: "#f0ebe2", margin: "4px auto" }} />
                  <div style={{ width: 56, height: 12, borderRadius: 3, background: "#f0ebe2" }} />
                </div>
              ))}
            </div>
          </div>

          {/* Today Activity Skeleton */}
          <div className={styles.activityCard}>
            <div className={styles.activityHeader}>
              <div style={{ width: 120, height: 22, borderRadius: 6, background: "#ede8e0" }} />
              <div style={{ width: 50, height: 20, borderRadius: 999, background: "#ede8e0" }} />
            </div>
            <div className={styles.activityBody}>
              <div style={{ width: "100%", height: 60, borderRadius: 10, background: "#faf8f5" }} />
              <div className={styles.activityDivider} />
              <div style={{ width: "100%", height: 110, borderRadius: 14, background: "#faf8f5" }} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
