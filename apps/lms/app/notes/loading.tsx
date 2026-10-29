// apps/lms/app/notes/loading.tsx
import styles from "./notes.module.css";

export default function NotesLoading() {
  return (
    <div className={styles.pageNavContainer} aria-busy="true" aria-label="Loading notes notebook">
      {/* Header Skeleton */}
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <div className={styles.skeletonPulse} style={{ width: 200, height: 32, borderRadius: 8, marginBottom: 8 }} />
          <div className={styles.skeletonPulse} style={{ width: 380, height: 16, borderRadius: 4 }} />
        </div>
        <div className={styles.skeletonPulse} style={{ width: 100, height: 36, borderRadius: 12 }} />
      </header>

      {/* Toolbar Strip Skeleton */}
      <div className={styles.toolbar} style={{ minHeight: 52 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className={styles.skeletonPulse} style={{ height: 38, width: 100, borderRadius: 10 }} />
          <div className={styles.skeletonPulse} style={{ height: 38, width: 90, borderRadius: 10 }} />
          <div className={styles.skeletonPulse} style={{ height: 38, width: 85, borderRadius: 10 }} />
          <div className={styles.skeletonPulse} style={{ height: 38, width: 95, borderRadius: 10 }} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className={styles.skeletonPulse} style={{ height: 38, width: 240, borderRadius: 10 }} />
          <div className={styles.skeletonPulse} style={{ height: 38, width: 130, borderRadius: 10 }} />
        </div>
      </div>

      {/* Section Title Skeleton */}
      <div style={{ marginTop: 14, marginBottom: 18 }}>
        <div className={styles.skeletonPulse} style={{ width: 170, height: 24, borderRadius: 6, marginBottom: 8 }} />
        <div className={styles.skeletonPulse} style={{ width: 360, height: 16, borderRadius: 4 }} />
      </div>

      {/* Course Cards 2x2 Grid Skeleton */}
      <div className={styles.courseCardsGrid} aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={styles.courseCardSkeleton}>
            <div className={styles.courseCardTop}>
              <div className={styles.skeletonPulse} style={{ width: 68, height: 68, borderRadius: 14, flexShrink: 0 }} />
              <div className={styles.courseCardContent}>
                <div className={styles.skeletonPulse} style={{ width: '60%', height: 18, marginBottom: 8, borderRadius: 6 }} />
                <div className={styles.skeletonPulse} style={{ width: '35%', height: 14, borderRadius: 4 }} />
              </div>
              <div className={styles.skeletonPulse} style={{ width: 78, height: 26, borderRadius: 999, flexShrink: 0 }} />
            </div>
            <div className={styles.courseCardFooter} style={{ borderTop: '1px solid #f1f5f9', marginTop: 18, paddingTop: 14 }}>
              <div className={styles.skeletonPulse} style={{ width: 150, height: 14, borderRadius: 4 }} />
              <div className={styles.skeletonPulse} style={{ width: 85, height: 14, borderRadius: 4 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
