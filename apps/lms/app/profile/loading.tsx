import styles from "./profile.module.css";

export default function ProfileLoading() {
  return (
    <div className={styles.frame}>
      <article className={styles.panel} aria-label="Loading profile">
        {/* Profile Header Skeleton */}
        <header className={styles.head}>
          <div
            className="skeleton"
            style={{ width: 92, height: 92, borderRadius: "50%", flexShrink: 0 }}
            aria-hidden="true"
          />
          <div className={styles.identity}>
            <div
              className="skeleton"
              style={{ width: 180, height: 28, borderRadius: 6, marginBottom: 8 }}
              aria-hidden="true"
            />
            <div
              className="skeleton"
              style={{ width: 220, height: 16, borderRadius: 4, marginBottom: 10 }}
              aria-hidden="true"
            />
            <div
              className="skeleton"
              style={{ width: 80, height: 22, borderRadius: 9999 }}
              aria-hidden="true"
            />
          </div>
        </header>

        {/* 3 Stats Columns Skeleton */}
        <div className={styles.stats} aria-hidden="true">
          {[1, 2, 3].map((i) => (
            <div key={i} className={styles.statCol}>
              <div
                className="skeleton"
                style={{ width: 44, height: 28, borderRadius: 4, margin: "0 auto 6px" }}
              />
              <div
                className="skeleton"
                style={{ width: 75, height: 14, borderRadius: 3, margin: "0 auto" }}
              />
            </div>
          ))}
        </div>

        {/* Details Section Skeleton */}
        <div className={styles.section} aria-hidden="true">
          <div
            className="skeleton"
            style={{ width: 140, height: 20, borderRadius: 4, marginBottom: 16 }}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i}>
                <div
                  className="skeleton"
                  style={{ width: 65, height: 12, borderRadius: 3, marginBottom: 6 }}
                />
                <div className="skeleton" style={{ width: "80%", height: 18, borderRadius: 4 }} />
              </div>
            ))}
          </div>
        </div>
      </article>
    </div>
  );
}
