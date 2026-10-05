import styles from "../../../page.module.css";
import Link from "next/link";

export default function EditProgramPage({ params }: { params: { id: string } }) {
  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <Link href="/programs" className={styles.backLink}>← Back to Programs</Link>
          <h1 className={styles.title}>Edit Curriculum: 11 Steps to U</h1>
          <p className={styles.subtitle}>Drag and drop steps and lessons to reorder them.</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.secondaryBtn}>Save Draft</button>
          <button className={styles.primaryBtn}>Publish Changes</button>
        </div>
      </header>

      <section className={styles.tableSection} style={{padding: '2rem'}}>
        <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem'}}>
          <h2 style={{margin: 0}}>Steps (Modules)</h2>
          <button className={styles.secondaryBtn} style={{padding: '0.4rem 0.8rem'}}>+ Add Step</button>
        </div>

        {/* Step 1 Block */}
        <div style={{background: 'var(--bg-main)', border: '1px solid var(--border-light)', borderRadius: '8px', marginBottom: '1rem', padding: '1rem'}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
            <h3 style={{margin: 0}}>Step 1: Introduction to U</h3>
            <div style={{display: 'flex', gap: '0.5rem'}}>
              <button className={styles.iconActionBtn}>Edit</button>
              <button className={styles.iconActionBtn}>↕</button>
            </div>
          </div>
          
          <div style={{paddingLeft: '2rem'}}>
            <div style={{background: 'var(--bg-card)', padding: '0.8rem', borderRadius: '6px', border: '1px solid var(--border-light)', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between'}}>
              <span>📹 Video: Welcome to the Journey (10:05)</span>
              <button className={styles.iconActionBtn}>↕</button>
            </div>
            <div style={{background: 'var(--bg-card)', padding: '0.8rem', borderRadius: '6px', border: '1px solid var(--border-light)', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between'}}>
              <span>📄 PDF: Reflection Workbook</span>
              <button className={styles.iconActionBtn}>↕</button>
            </div>
            <button className={styles.viewAllBtn} style={{marginTop: '0.5rem'}}>+ Add Lesson</button>
          </div>
        </div>

        {/* Step 2 Block */}
        <div style={{background: 'var(--bg-main)', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '1rem'}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
            <h3 style={{margin: 0}}>Step 2: Self Discovery</h3>
            <div style={{display: 'flex', gap: '0.5rem'}}>
              <button className={styles.iconActionBtn}>Edit</button>
              <button className={styles.iconActionBtn}>↕</button>
            </div>
          </div>
          
          <div style={{paddingLeft: '2rem'}}>
            <div style={{background: 'var(--bg-card)', padding: '0.8rem', borderRadius: '6px', border: '1px solid var(--border-light)', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between'}}>
              <span>📹 Video: Uncovering the Layers (15:20)</span>
              <button className={styles.iconActionBtn}>↕</button>
            </div>
            <button className={styles.viewAllBtn} style={{marginTop: '0.5rem'}}>+ Add Lesson</button>
          </div>
        </div>

      </section>
    </div>
  );
}
