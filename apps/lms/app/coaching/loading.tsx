import styles from "./coaching.module.css";

export default function CoachingLoading() {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div
          className="skeleton"
          style={{ width: 110, height: 26, borderRadius: 9999, marginBottom: 4 }}
          aria-hidden="true"
        />
        <div
          className="skeleton"
          style={{ width: 280, height: 34, borderRadius: 6, marginBottom: 6 }}
          aria-hidden="true"
        />
        <div
          className="skeleton"
          style={{ width: "70%", height: 18, borderRadius: 4 }}
          aria-hidden="true"
        />
      </header>

      {/* Main Locked Card Skeleton */}
      <div className={styles.lockedCard} aria-label="Loading coaching status">
        <div
          className="skeleton"
          style={{ width: 60, height: 60, borderRadius: "50%", margin: "0 auto" }}
          aria-hidden="true"
        />
        <div
          className="skeleton"
          style={{ width: 260, height: 24, borderRadius: 6 }}
          aria-hidden="true"
        />
        <div
          className="skeleton"
          style={{ width: "80%", maxWidth: 500, height: 16, borderRadius: 4 }}
          aria-hidden="true"
        />

        <div className={styles.prerequisitesList} style={{ border: "1px solid var(--border-light)" }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                className="skeleton"
                style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0 }}
                aria-hidden="true"
              />
              <div
                className="skeleton"
                style={{ width: `${80 - i * 10}%`, height: 14, borderRadius: 4 }}
                aria-hidden="true"
              />
            </div>
          ))}
        </div>

        <div
          className="skeleton"
          style={{ width: 180, height: 42, borderRadius: 10, marginTop: 8 }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
