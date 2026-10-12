import dash from "../../../page.module.css";
import styles from "./path.module.css";

export default function ProgramStepsLoading() {
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "1.5rem" }}>
      {/* Header Skeleton */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div className="skeleton" style={{ width: 140, height: 16, marginBottom: 12, borderRadius: 4 }} />
        <div className="skeleton" style={{ width: "50%", height: 36, marginBottom: 12, borderRadius: 8 }} />
        <div className="skeleton" style={{ width: "35%", height: 16, borderRadius: 4 }} />
      </div>

      {/* Main Roadmap Skeleton */}
      <div className={dash.board}>
        <div className={dash.boardMain}>
          <section className={`${dash.panel} ${dash.grow}`}>
            <div className={dash.panelHead}>
              <div className="skeleton" style={{ width: 100, height: 24, borderRadius: 6 }} />
              <div className="skeleton" style={{ width: 120, height: 16, borderRadius: 4 }} />
            </div>

            <ol className={styles.timeline}>
              {[1, 2, 3, 4, 5].map((idx) => (
                <li key={idx} className={`${styles.step}`} style={{ opacity: 1 }}>
                  <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 18, flexShrink: 0 }} />
                  <div className={styles.stepBody} style={{ flex: 1 }}>
                    <div className="skeleton" style={{ width: 80, height: 12, marginBottom: 8, borderRadius: 4 }} />
                    <div className="skeleton" style={{ width: "40%", height: 20, marginBottom: 8, borderRadius: 6 }} />
                    <div className="skeleton" style={{ width: "70%", height: 14, borderRadius: 4 }} />
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* Aside Sidebar Skeleton */}
        <aside className={dash.boardSide}>
          <section className={dash.panel}>
            <div className="skeleton" style={{ width: 130, height: 20, marginBottom: 16, borderRadius: 6 }} />
            <div className="skeleton" style={{ width: "100%", height: 100, borderRadius: 12, marginBottom: 16 }} />
            <div className="skeleton" style={{ width: "100%", height: 42, borderRadius: 8 }} />
          </section>
        </aside>
      </div>
    </div>
  );
}
