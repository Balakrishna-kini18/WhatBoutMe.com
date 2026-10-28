// apps/lms/app/notes/loading.tsx
import styles from "./notes.module.css";

export default function NotesLoading() {
  return (
    <div className={styles.pageNavContainer}>
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <div className="skeleton" style={{ width: 200, height: 32, borderRadius: 8, marginBottom: 8 }} />
          <div className="skeleton" style={{ width: 320, height: 16, borderRadius: 4 }} />
        </div>
        <div className="skeleton" style={{ width: 80, height: 28, borderRadius: 999 }} />
      </header>

      {/* Toolbar Skeleton */}
      <div className={styles.toolbar} style={{ height: 52 }}>
        <div className="skeleton" style={{ height: 32, width: 280, borderRadius: 8 }} />
        <div className="skeleton" style={{ height: 32, width: 360, borderRadius: 8 }} />
      </div>

      {/* Course Cards Grid Skeleton */}
      <div className={styles.courseCardsGrid} aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={styles.skeleton} style={{ height: 150, borderRadius: 16 }} />
        ))}
      </div>
    </div>
  );
}
