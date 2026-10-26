import styles from "./attendance.module.css";

export default function AttendanceLoading() {
  return (
    <div className={styles.container}>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Attendance &amp; Schedule</h1>
          <p className={styles.pageSubtitle}>
            Track your verified workshop attendance, cohort live session compliance, and daily portal engagement.
          </p>
        </div>
      </header>

      <div className={styles.mainLayout}>
        <div className={styles.calendarColumn}>
          <div className={styles.calendarCard}>
            {/* Top Toolbar Skeleton */}
            <div className={styles.calendarNav}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div className="skeleton" style={{ width: 140, height: 26, borderRadius: 6 }} />
                <div className="skeleton" style={{ width: 68, height: 28, borderRadius: 8 }} />
              </div>
              <div className="skeleton" style={{ width: 150, height: 32, borderRadius: 999 }} />
            </div>

            {/* Weekday Header Skeleton */}
            <div className={styles.weekdaysRow}>
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <div key={day} className={styles.weekdayName}>
                  {day}
                </div>
              ))}
            </div>

            {/* 35 Calendar Day Cells Skeleton */}
            <div className={styles.daysGrid} aria-hidden="true">
              {Array.from({ length: 35 }).map((_, idx) => (
                <div key={idx} className={styles.dayCell} style={{ pointerEvents: "none" }}>
                  <div className={styles.dayHeader}>
                    <div className="skeleton" style={{ width: 16, height: 16, borderRadius: 4 }} />
                  </div>
                  {idx % 5 === 0 && (
                    <div className="cellEvents" style={{ marginTop: 4 }}>
                      <div className="skeleton" style={{ width: "80%", height: 16, borderRadius: 4 }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Sidebar Column Skeleton */}
        <aside className={styles.sidebarColumn}>
          <div className={styles.statsCard}>
            <div className={styles.statsHeader}>
              <div className="skeleton" style={{ width: 130, height: 20, borderRadius: 4 }} />
            </div>
            <dl className={styles.statsSummaryGrid} aria-hidden="true">
              {[1, 2, 3, 4].map((i) => (
                <div key={i}>
                  <div className="skeleton" style={{ width: 44, height: 28, borderRadius: 4, margin: "0 auto 6px" }} />
                  <div className="skeleton" style={{ width: 70, height: 12, borderRadius: 3, margin: "0 auto" }} />
                </div>
              ))}
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}
