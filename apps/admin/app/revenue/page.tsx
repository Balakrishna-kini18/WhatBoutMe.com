"use client";

import { useEffect, useState } from "react";
import styles from "../page.module.css";
import { API_URL } from "../lib/api";

const Icons = {
  Export: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  CreditCard: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  ),
  Refresh: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  ),
  Users: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
};

export default function RevenuePage() {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchRevenue(controller.signal);
    return () => controller.abort();
  }, []);

  const fetchRevenue = async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_URL}/revenue`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal,
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        const errJson = await res.json().catch(() => null);
        setError(errJson?.message || `Failed to load revenue data (HTTP ${res.status})`);
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        console.error("Failed to fetch revenue", e);
        setError(e?.message || "Unable to connect to the revenue service. Please check your connection.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (!data?.transactions?.length) return;
    const headers = ["Transaction ID", "Learner", "Amount", "Status", "Date"];
    const rows = data.transactions.map((t: any) => [
      t.description || t.id,
      t.user,
      t.amount,
      t.status,
      t.date,
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r: any[]) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `revenue_report_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Revenue &amp; Finance</h1>
          <p className={styles.subtitle}>
            Financial analytics, recurring income streams, and verified enrolment transactions.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={handleExportCSV}
            aria-label="Export transactions CSV"
          >
            <Icons.Export />
            <span>Export CSV</span>
          </button>
        </div>
      </header>

      {error && (
        <div style={{
          backgroundColor: "#fef2f2",
          border: "1px solid #fecaca",
          borderRadius: "8px",
          padding: "12px 16px",
          marginBottom: "1.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          color: "#991b1b",
          fontSize: "0.875rem"
        }}>
          <span>{error}</span>
          <button
            type="button"
            onClick={() => fetchRevenue()}
            style={{
              background: "#ef4444",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              padding: "4px 10px",
              cursor: "pointer",
              fontWeight: 500,
              fontSize: "0.8rem"
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* KPI Stats Cards */}
      <section className={styles.kpiGrid} style={{ gridTemplateColumns: "repeat(3, 1fr)", marginBottom: "1.75rem" }} aria-label="Revenue Metrics">
        <article className={styles.kpiCard}>
          <div className={styles.kpiTopRow}>
            <span className={styles.kpiLabel}>Total Revenue</span>
            <div className={styles.kpiIconBox}>
              <Icons.CreditCard />
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>
              {isLoading ? "—" : data?.totalRevenue ?? "$0"}
            </span>
          </div>
          <div className={styles.kpiFooter}>
            <span className={styles.kpiMeta}>All-time platform revenue</span>
          </div>
        </article>

        <article className={styles.kpiCard}>
          <div className={styles.kpiTopRow}>
            <span className={styles.kpiLabel}>Monthly Recurring (MRR)</span>
            <div className={styles.kpiIconBox}>
              <Icons.Refresh />
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>
              {isLoading ? "—" : data?.mrr ? `$${data.mrr}` : "N/A"}
            </span>
          </div>
          <div className={styles.kpiFooter}>
            <span className={styles.kpiMeta}>
              {data?.isRecurringBillingSupported
                ? "Active recurring revenue"
                : "Not supported (one-time cohort pricing)"}
            </span>
          </div>
        </article>

        <article className={styles.kpiCard}>
          <div className={styles.kpiTopRow}>
            <span className={styles.kpiLabel}>Paid Enrolments</span>
            <div className={styles.kpiIconBox}>
              <Icons.Users />
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>
              {isLoading ? "—" : (data?.paidTransactionsCount ?? data?.activeSubscribers ?? 0).toLocaleString()}
            </span>
          </div>
          <div className={styles.kpiFooter}>
            <span className={styles.kpiMeta}>Recognized paid transactions</span>
          </div>
        </article>
      </section>

      {/* Transactions Section */}
      <section className={styles.tableSection}>
        <div className={styles.sectionHeader}>
          <h2>Recent Transactions</h2>
        </div>
        
        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Transaction Reference</th>
                <th>Learner</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "28px", color: "var(--text-muted)" }}>
                    Loading transactions...
                  </td>
                </tr>
              ) : !data || !data.transactions || data.transactions.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "28px", color: "var(--text-muted)" }}>
                    No transactions recorded yet.
                  </td>
                </tr>
              ) : (
                data.transactions.map((tx: any) => (
                  <tr key={tx.id}>
                    <td>
                      <span className={styles.cellText}>{tx.description || tx.id}</span>
                    </td>
                    <td>
                      <span className={styles.cellUserName}>{tx.user}</span>
                    </td>
                    <td>
                      <span className={styles.cellText} style={{ fontWeight: 600 }}>{tx.amount}</span>
                    </td>
                    <td>
                      <span className={`${styles.statusChip} ${styles[tx.status?.toLowerCase()] || styles.active}`}>
                        {tx.status}
                      </span>
                    </td>
                    <td>
                      <span className={styles.cellTextMuted}>{tx.date}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
