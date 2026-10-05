import styles from "../../page.module.css";
import Link from "next/link";

export default function CreateProgramPage() {
  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <Link href="/programs" className={styles.backLink}>← Back to Programs</Link>
          <h1 className={styles.title}>Create New Program</h1>
          <p className={styles.subtitle}>Define the basic details before adding curriculum steps.</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.primaryBtn}>Save & Continue to Curriculum</button>
        </div>
      </header>

      <div style={{display: 'flex', gap: '2rem'}}>
        <div style={{flex: 2}}>
          <section className={styles.tableSection} style={{padding: '2rem'}}>
            <form style={{display: 'flex', flexDirection: 'column', gap: '1.5rem'}}>
              
              <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
                <label style={{fontSize: '0.9rem', fontWeight: 600}}>Program Name</label>
                <input type="text" placeholder="e.g. Vision Board Masterclass" className={styles.searchInput} style={{width: '100%', background: 'var(--bg-main)', border: '1px solid var(--border-light)', padding: '0.8rem'}} />
              </div>

              <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
                <label style={{fontSize: '0.9rem', fontWeight: 600}}>Short Description</label>
                <textarea rows={3} placeholder="A brief summary for the public website..." className={styles.searchInput} style={{width: '100%', background: 'var(--bg-main)', border: '1px solid var(--border-light)', padding: '0.8rem', resize: 'vertical'}} />
              </div>

              <div style={{display: 'flex', gap: '1rem'}}>
                <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1}}>
                  <label style={{fontSize: '0.9rem', fontWeight: 600}}>Category</label>
                  <select className={styles.searchInput} style={{width: '100%', background: 'var(--bg-main)', border: '1px solid var(--border-light)', padding: '0.8rem'}}>
                    <option>Certification</option>
                    <option>Workshop</option>
                    <option>Corporate Training</option>
                  </select>
                </div>
                <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1}}>
                  <label style={{fontSize: '0.9rem', fontWeight: 600}}>CPD Hours (Optional)</label>
                  <input type="number" placeholder="e.g. 25" className={styles.searchInput} style={{width: '100%', background: 'var(--bg-main)', border: '1px solid var(--border-light)', padding: '0.8rem'}} />
                </div>
              </div>

            </form>
          </section>
        </div>

        <div style={{flex: 1}}>
          <section className={styles.tableSection} style={{padding: '1.5rem', marginBottom: '1.5rem'}}>
            <h2 style={{margin: '0 0 1rem 0'}}>Pricing</h2>
            
            <div style={{marginBottom: '1rem'}}>
              <label style={{display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem'}}>Price (USD)</label>
              <input type="text" placeholder="$1,999" className={styles.searchInput} style={{width: '100%', background: 'var(--bg-main)', border: '1px solid var(--border-light)'}} />
            </div>
            
            <div style={{marginBottom: '1rem'}}>
              <label style={{display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem'}}>Price (AED)</label>
              <input type="text" placeholder="AED 7,340" className={styles.searchInput} style={{width: '100%', background: 'var(--bg-main)', border: '1px solid var(--border-light)'}} />
            </div>
          </section>

          <section className={styles.tableSection} style={{padding: '1.5rem'}}>
            <h2 style={{margin: '0 0 1rem 0'}}>Features</h2>
            
            <label style={{display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.8rem', fontSize: '0.85rem'}}>
              <input type="checkbox" defaultChecked /> Require Agreement Signature
            </label>
            <label style={{display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.8rem', fontSize: '0.85rem'}}>
              <input type="checkbox" defaultChecked /> Enable Step Quizzes
            </label>
            <label style={{display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.8rem', fontSize: '0.85rem'}}>
              <input type="checkbox" defaultChecked /> Require Final Exam
            </label>
            <label style={{display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem'}}>
              <input type="checkbox" defaultChecked /> Issue Certificate on Completion
            </label>
          </section>
        </div>
      </div>
    </div>
  );
}
