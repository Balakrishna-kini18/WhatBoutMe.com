import styles from "../../page.module.css";
import Link from "next/link";

export default function CreateBatchPage() {
  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <Link href="/batches" className={styles.backLink}>← Back to Batches</Link>
          <h1 className={styles.title}>Create New Batch</h1>
          <p className={styles.subtitle}>Set up a new cohort and schedule their sessions.</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.primaryBtn}>Create Batch</button>
        </div>
      </header>

      <section className={styles.tableSection} style={{padding: '2rem', maxWidth: '800px'}}>
        <form style={{display: 'flex', flexDirection: 'column', gap: '1.5rem'}}>
          
          <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
            <label style={{fontSize: '0.9rem', fontWeight: 600}}>Batch Name</label>
            <input type="text" placeholder="e.g. November Cohort 2026" className={styles.searchInput} style={{width: '100%', background: 'var(--bg-main)', border: '1px solid var(--border-light)', padding: '0.8rem'}} />
          </div>

          <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
            <label style={{fontSize: '0.9rem', fontWeight: 600}}>Program</label>
            <select className={styles.searchInput} style={{width: '100%', background: 'var(--bg-main)', border: '1px solid var(--border-light)', padding: '0.8rem'}}>
              <option>11 Steps to U</option>
              <option>Resilience Workshop</option>
            </select>
          </div>

          <div style={{display: 'flex', gap: '1rem'}}>
            <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1}}>
              <label style={{fontSize: '0.9rem', fontWeight: 600}}>Start Date</label>
              <input type="date" className={styles.searchInput} style={{width: '100%', background: 'var(--bg-main)', border: '1px solid var(--border-light)', padding: '0.8rem'}} />
            </div>
            <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1}}>
              <label style={{fontSize: '0.9rem', fontWeight: 600}}>End Date</label>
              <input type="date" className={styles.searchInput} style={{width: '100%', background: 'var(--bg-main)', border: '1px solid var(--border-light)', padding: '0.8rem'}} />
            </div>
          </div>

          <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
            <label style={{fontSize: '0.9rem', fontWeight: 600}}>Assigned Manager</label>
            <select className={styles.searchInput} style={{width: '100%', background: 'var(--bg-main)', border: '1px solid var(--border-light)', padding: '0.8rem'}}>
              <option>Roweena Britto (Super Admin)</option>
              <option>Support Team</option>
            </select>
          </div>

          <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
            <label style={{fontSize: '0.9rem', fontWeight: 600}}>Capacity (Max Students)</label>
            <input type="number" defaultValue={50} className={styles.searchInput} style={{width: '100%', background: 'var(--bg-main)', border: '1px solid var(--border-light)', padding: '0.8rem'}} />
          </div>

        </form>
      </section>
    </div>
  );
}
