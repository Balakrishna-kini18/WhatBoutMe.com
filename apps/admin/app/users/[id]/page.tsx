import styles from "../../page.module.css";
import Link from "next/link";

export default function UserDetailPage({ params }: { params: { id: string } }) {
  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <Link href="/users" className={styles.backLink}>← Back to Users</Link>
          <h1 className={styles.title}>John Doe</h1>
          <p className={styles.subtitle}>john@example.com • Alpha Cohort 2026</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.secondaryBtn}>Suspend</button>
          <button className={styles.primaryBtn}>Message Learner</button>
        </div>
      </header>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <h3>Overall Progress</h3>
          </div>
          <div className={styles.statBody}>
            <p className={styles.statValue}>18%</p>
            <div className={styles.progressBar} style={{width: '100%', marginTop: '0.5rem'}}>
              <div className={styles.progressFill} style={{ width: '18%' }}></div>
            </div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <h3>Live Attendance</h3>
          </div>
          <div className={styles.statBody}>
            <p className={styles.statValue}>1 / 1</p>
            <div className={styles.statTrendWrapper}>
              <span className={styles.statTrendPositive}>Perfect</span>
            </div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <h3>Payments</h3>
          </div>
          <div className={styles.statBody}>
            <p className={styles.statValue}>Paid</p>
            <div className={styles.statTrendWrapper}>
              <span className={styles.statTrendNeutral}>Stripe ID: ch_1N...</span>
            </div>
          </div>
        </div>
      </div>

      <section className={styles.tableSection}>
        <div className={styles.sectionHeader}>
          <h2>Quiz Scores (11 Steps)</h2>
        </div>
        
        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Step</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Best Score</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><span className={styles.cellText}>Step 1: Introduction to U</span></td>
                <td><span className={`${styles.statusChip} ${styles.completed}`}>Passed</span></td>
                <td><span className={styles.cellTextMuted}>1</span></td>
                <td><span className={styles.cellText}>100%</span></td>
              </tr>
              <tr>
                <td><span className={styles.cellText}>Step 2: Self Discovery</span></td>
                <td><span className={`${styles.statusChip} ${styles.active}`}>In Progress</span></td>
                <td><span className={styles.cellTextMuted}>0</span></td>
                <td><span className={styles.cellText}>-</span></td>
              </tr>
              <tr>
                <td><span className={styles.cellText}>Step 3: Resilience Building</span></td>
                <td><span className={`${styles.statusChip} ${styles.locked}`}>Locked</span></td>
                <td><span className={styles.cellTextMuted}>0</span></td>
                <td><span className={styles.cellText}>-</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
