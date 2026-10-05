import styles from "../../../page.module.css";
import Link from "next/link";

export default function EditQuizPage({ params }: { params: { id: string } }) {
  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <Link href="/quizzes" className={styles.backLink}>← Back to Quizzes</Link>
          <h1 className={styles.title}>Edit Assessment: Step 1</h1>
          <p className={styles.subtitle}>Manage questions and pass marks for this step.</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.primaryBtn}>Save Questions</button>
        </div>
      </header>

      <div style={{display: 'flex', gap: '2rem'}}>
        <div style={{flex: 2}}>
          <section className={styles.tableSection} style={{padding: '2rem'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem'}}>
              <h2 style={{margin: 0}}>Questions (5)</h2>
              <button className={styles.secondaryBtn} style={{padding: '0.4rem 0.8rem'}}>+ Add Question</button>
            </div>

            {/* Question 1 */}
            <div style={{border: '1px solid var(--border-light)', borderRadius: '8px', padding: '1.5rem', marginBottom: '1rem'}}>
              <div style={{display: 'flex', justifyContent: 'space-between'}}>
                <strong>1. What is the primary goal of the 11 Steps to U?</strong>
                <button className={styles.iconActionBtn}>Edit</button>
              </div>
              <ul style={{listStyleType: 'none', padding: '1rem 0 0 0', margin: 0}}>
                <li style={{padding: '0.5rem', border: '1px solid var(--border-light)', borderRadius: '4px', marginBottom: '0.5rem'}}>A) Financial success</li>
                <li style={{padding: '0.5rem', border: '1px solid var(--status-success)', background: 'var(--status-success-bg)', borderRadius: '4px', marginBottom: '0.5rem'}}>B) Rebuilding resilience and discovering self-worth (Correct)</li>
                <li style={{padding: '0.5rem', border: '1px solid var(--border-light)', borderRadius: '4px', marginBottom: '0.5rem'}}>C) Time management</li>
              </ul>
            </div>

            {/* Question 2 */}
            <div style={{border: '1px solid var(--border-light)', borderRadius: '8px', padding: '1.5rem'}}>
              <div style={{display: 'flex', justifyContent: 'space-between'}}>
                <strong>2. True or False: Your past defines your future capabilities.</strong>
                <button className={styles.iconActionBtn}>Edit</button>
              </div>
              <ul style={{listStyleType: 'none', padding: '1rem 0 0 0', margin: 0}}>
                <li style={{padding: '0.5rem', border: '1px solid var(--border-light)', borderRadius: '4px', marginBottom: '0.5rem'}}>True</li>
                <li style={{padding: '0.5rem', border: '1px solid var(--status-success)', background: 'var(--status-success-bg)', borderRadius: '4px', marginBottom: '0.5rem'}}>False (Correct)</li>
              </ul>
            </div>

          </section>
        </div>

        <div style={{flex: 1}}>
          <section className={styles.tableSection} style={{padding: '1.5rem'}}>
            <h2 style={{margin: '0 0 1rem 0'}}>Settings</h2>
            
            <div style={{marginBottom: '1rem'}}>
              <label style={{display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem'}}>Passing Score (%)</label>
              <input type="number" defaultValue={75} className={styles.searchInput} style={{width: '100%', background: 'var(--bg-main)', border: '1px solid var(--border-light)'}} />
            </div>

            <div style={{marginBottom: '1rem'}}>
              <label style={{display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem'}}>Max Retries</label>
              <input type="number" defaultValue={3} className={styles.searchInput} style={{width: '100%', background: 'var(--bg-main)', border: '1px solid var(--border-light)'}} />
            </div>
            
            <div style={{marginBottom: '1rem'}}>
              <label style={{display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem'}}>Retry Wait Time (Hours)</label>
              <input type="number" defaultValue={24} className={styles.searchInput} style={{width: '100%', background: 'var(--bg-main)', border: '1px solid var(--border-light)'}} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
