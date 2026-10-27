import styles from "./notes.module.css";

export default function NotesLoading() {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className="skeleton" style={{ width: 240, height: 32, borderRadius: 6, marginBottom: 8 }} />
        <div className="skeleton" style={{ width: "65%", height: 16, borderRadius: 4 }} />
      </header>

      {/* Filter Controls Skeleton */}
      <div className={styles.filterControls} style={{ marginBottom: "1.5rem" }}>
        <div className="skeleton" style={{ height: 42, flex: 1, borderRadius: 8 }} />
        <div className="skeleton" style={{ height: 42, width: 160, borderRadius: 8 }} />
        <div className="skeleton" style={{ height: 42, width: 110, borderRadius: 8 }} />
      </div>

      {/* Notes List Skeleton */}
      <div className={styles.notesList} aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={styles.skeleton} />
        ))}
      </div>
    </div>
  );
}
