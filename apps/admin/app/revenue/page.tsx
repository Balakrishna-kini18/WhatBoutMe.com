"use client";

import { useEffect, useState } from "react";
import styles from "../page.module.css";
import Link from "next/link";

export default function RevenuePage() {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchRevenue();
  }, []);

  const fetchRevenue = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}`}`}/revenue`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error("Failed to fetch revenue", e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Revenue</h1>
          <p className={styles.subtitle}>Overview of sales, MRR, and recent transactions.</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.secondaryBtn}>Export CSV</button>
        </div>
      </header>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <h3>Total Revenue</h3>
            <span className={styles.statIcon}>💳</span>
          </div>
          <div className={styles.statBody}>
            <p className={styles.statValue}>{data ? data.totalRevenue : "..."}</p>
            <div className={styles.statTrendWrapper}>
              <span className={styles.statTrendPositive}>All Time</span>
            </div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <h3>Monthly Recurring (MRR)</h3>
            <span className={styles.statIcon}>🔄</span>
          </div>
          <div className={styles.statBody}>
            <p className={styles.statValue}>{data ? data.mrr : "..."}</p>
            <div className={styles.statTrendWrapper}>
              <span className={styles.statTrendNeutral}>Estimated</span>
            </div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <h3>Active Subscribers</h3>
            <span className={styles.statIcon}>👥</span>
          </div>
          <div className={styles.statBody}>
            <p className={styles.statValue}>{data ? data.activeSubscribers : "..."}</p>
            <div className={styles.statTrendWrapper}>
              <span className={styles.statTrendPositive}>Paid Users</span>
            </div>
          </div>
        </div>
      </div>

      <section className={styles.tableSection}>
        <div className={styles.sectionHeader}>
          <h2>Recent Transactions</h2>
        </div>
        
        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Transaction ID</th>
                <th>Learner</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} style={{textAlign: "center", padding: "20px"}}>Loading transactions...</td>
                </tr>
              ) : !data || data.transactions.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{textAlign: "center", padding: "20px"}}>No transactions found.</td>
                </tr>
              ) : data.transactions.map((tx: any) => (
                <tr key={tx.id}>
                  <td>
                    <span className={styles.cellText}>{tx.description}</span>
                  </td>
                  <td><span className={styles.cellUserName}>{tx.user}</span></td>
                  <td><span className={styles.cellText}>{tx.amount}</span></td>
                  <td>
                    <span className={`${styles.statusChip} ${styles[tx.status.toLowerCase()] || styles.active}`}>
                      {tx.status}
                    </span>
                  </td>
                  <td><span className={styles.cellTextMuted}>{tx.date}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
