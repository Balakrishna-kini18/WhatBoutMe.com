import dash from "../page.module.css";
import styles from "./certificates.module.css";

export default function CertificatesLoading() {
  return (
    <div className={dash.dashboard}>
      <header className={dash.pageHeader}>
        <div>
          <h1 className={dash.pageTitle}>Certificates</h1>
        </div>
      </header>

      <div className={dash.board}>
        <div className={dash.boardMain}>
          {/* Summary stats skeleton */}
          <div className={styles.summaryGrid}>
            {[1, 2, 3].map((i) => (
              <div key={i} className={styles.summaryCard} style={{ pointerEvents: "none" }}>
                <div
                  className="skeleton"
                  style={{ width: 40, height: 28, borderRadius: 4, marginBottom: 6 }}
                  aria-hidden="true"
                />
                <div
                  className="skeleton"
                  style={{ width: 90, height: 14, borderRadius: 3 }}
                  aria-hidden="true"
                />
              </div>
            ))}
          </div>

          <section className={`${dash.panel} ${dash.grow}`} aria-label="Loading certificates">
            <div className={dash.panelHead}>
              <div className="skeleton" style={{ width: 140, height: 24, borderRadius: 6 }} />
            </div>

            <ul className={dash.list} aria-hidden="true">
              {[1, 2, 3].map((i) => (
                <li key={i} className={dash.course} style={{ pointerEvents: "none" }}>
                  <div
                    className="skeleton"
                    style={{ width: 104, height: 68, borderRadius: 8, flexShrink: 0 }}
                  />
                  <div className={dash.rowMain}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 8,
                      }}
                    >
                      <div className="skeleton" style={{ width: "45%", height: 18, borderRadius: 4 }} />
                      <div className="skeleton" style={{ width: 75, height: 20, borderRadius: 999 }} />
                    </div>
                    <div
                      className="skeleton"
                      style={{ width: "100%", height: 6, borderRadius: 999, marginBottom: 12 }}
                    />
                    <div
                      className="skeleton"
                      style={{ width: 120, height: 32, borderRadius: 8, marginLeft: "auto" }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
