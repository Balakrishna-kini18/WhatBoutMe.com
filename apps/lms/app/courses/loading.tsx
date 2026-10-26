import dash from "../page.module.css";
import styles from "./courses.module.css";

export default function CoursesLoading() {
  return (
    <div className={dash.dashboard}>
      <header className={dash.pageHeader}>
        <div>
          <h1 className={dash.pageTitle}>My Courses</h1>
        </div>
      </header>

      <div className={dash.boardMain}>
        {/* 4 Stat Tiles Skeleton */}
        <div className={dash.stats}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className={dash.stat} style={{ pointerEvents: "none" }}>
              <div
                className="skeleton"
                style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0 }}
                aria-hidden="true"
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                <div
                  className="skeleton"
                  style={{ width: 36, height: 22, borderRadius: 4 }}
                  aria-hidden="true"
                />
                <div
                  className="skeleton"
                  style={{ width: 70, height: 13, borderRadius: 3 }}
                  aria-hidden="true"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Enrolled Courses Section Skeleton */}
        <section className={dash.panel} aria-label="Loading enrolled courses">
          <div className={dash.panelHead}>
            <div className="skeleton" style={{ width: 160, height: 24, borderRadius: 6 }} />
            <div className="skeleton" style={{ width: 110, height: 32, borderRadius: 8 }} />
          </div>

          <div className={styles.cardGrid} aria-hidden="true">
            {[1, 2, 3].map((i) => (
              <div key={i} className={styles.block} style={{ pointerEvents: "none" }}>
                <div className={styles.blockHead}>
                  {/* 16:10 Cover image skeleton */}
                  <div
                    className="skeleton"
                    style={{ width: "100%", aspectRatio: "16 / 10", borderRadius: 0 }}
                  />
                  <div className={dash.rowMain}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        margin: "0.65rem 0",
                      }}
                    >
                      <div
                        className="skeleton"
                        style={{ width: "50%", height: 18, borderRadius: 4 }}
                      />
                      <div
                        className="skeleton"
                        style={{ width: 85, height: 20, borderRadius: 999 }}
                      />
                    </div>
                    {/* Progress Line */}
                    <div
                      className="skeleton"
                      style={{ width: "100%", height: 8, borderRadius: 999, margin: "0.5rem 0 0.85rem" }}
                    />
                    {/* Subtitle text */}
                    <div
                      className="skeleton"
                      style={{ width: "70%", height: 14, borderRadius: 4, marginBottom: "1.25rem" }}
                    />
                    {/* Action buttons */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.65rem" }}>
                      <div className="skeleton" style={{ height: 38, borderRadius: 10 }} />
                      <div className="skeleton" style={{ height: 38, borderRadius: 10 }} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
