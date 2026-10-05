"use client";

import { useEffect, useState } from "react";
import styles from "../page.module.css";

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchInvoices();
  }, []);

  const fetchInvoices = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}`}`}/invoices`);
      if (res.ok) {
        const data = await res.json();
        setInvoices(data);
      }
    } catch (e) {
      console.error("Failed to fetch invoices", e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Invoices</h1>
          <p className={styles.subtitle}>Manage auto-generated and manual invoices.</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.primaryBtn}>+ Create Invoice</button>
        </div>
      </header>

      <section className={styles.tableSection}>
        <div className={styles.sectionHeader}>
          <h2>All Invoices</h2>
        </div>
        
        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Invoice No.</th>
                <th>Billed To</th>
                <th>Amount</th>
                <th>Date Issued</th>
                <th>Status</th>
                <th className={styles.alignRight}>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} style={{textAlign: "center", padding: "20px"}}>Loading invoices...</td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{textAlign: "center", padding: "20px"}}>No invoices found.</td>
                </tr>
              ) : invoices.map((inv) => (
                <tr key={inv.id}>
                  <td><span className={styles.cellText}>{inv.invoiceNumber}</span></td>
                  <td><span className={styles.cellUserName}>{inv.client}</span></td>
                  <td><span className={styles.cellText}>{inv.amount}</span></td>
                  <td><span className={styles.cellTextMuted}>{inv.date}</span></td>
                  <td>
                    <span className={`${styles.statusChip} ${inv.status === 'Paid' ? styles.completed : styles.pending}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className={styles.alignRight}>
                    <button className={styles.iconActionBtn} title="Download PDF">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{opacity: 0.6}}>
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
