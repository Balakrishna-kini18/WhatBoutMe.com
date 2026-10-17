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
  const [activeTab, setActiveTab] = useState<"transactions" | "byCourse" | "byBatch" | "byMonth">("transactions");

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
    const headers = ["Transaction ID", "Learner", "Course", "Batch", "Amount", "Currency", "Status", "Date"];
    const rows = data.transactions.map((t: any) => [
      `"${t.description || t.id}"`,
      `"${t.user || ""}"`,
      `"${t.courseTitle || ""}"`,
      `"${t.batchName || ""}"`,
      `"${t.amount}"`,
      `"${t.currency || "USD"}"`,
      `"${t.status}"`,
      `"${t.date}"`,
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

  const usdTotal = data?.byCurrency?.USD?.total ?? 0;
  const aedTotal = data?.byCurrency?.AED?.total ?? 0;
  const inrTotal = data?.byCurrency?.INR?.total ?? 0;
  const paidCount = data?.paidTransactionsCount ?? data?.paidEnrolmentsCount ?? 0;

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Revenue &amp; Finance</h1>
          <p className={styles.subtitle}>
            Multi-currency financial analytics across USD, AED, and INR cohorts and verified transactions.
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

      {/* Multi-Currency KPI Grid */}
      <section className={styles.kpiGrid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginBottom: "1.75rem" }} aria-label="Revenue Metrics">
        {/* USD Card */}
        <article className={styles.kpiCard}>
          <div className={styles.kpiTopRow}>
            <span className={styles.kpiLabel}>Revenue (USD)</span>
            <div className={styles.kpiIconBox}>
              <Icons.CreditCard />
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>
              {isLoading ? "—" : `$${Math.round(usdTotal).toLocaleString()}`}
            </span>
          </div>
          <div className={styles.kpiFooter}>
            <span className={styles.kpiMeta}>
              {data?.byCurrency?.USD?.count ?? 0} USD transaction{data?.byCurrency?.USD?.count === 1 ? "" : "s"}
            </span>
          </div>
        </article>

        {/* AED Card */}
        <article className={styles.kpiCard}>
          <div className={styles.kpiTopRow}>
            <span className={styles.kpiLabel}>Revenue (AED)</span>
            <div className={styles.kpiIconBox}>
              <Icons.CreditCard />
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>
              {isLoading ? "—" : `AED ${Math.round(aedTotal).toLocaleString()}`}
            </span>
          </div>
          <div className={styles.kpiFooter}>
            <span className={styles.kpiMeta}>
              {data?.byCurrency?.AED?.count ?? 0} UAE transaction{data?.byCurrency?.AED?.count === 1 ? "" : "s"} (VAT 5%)
            </span>
          </div>
        </article>

        {/* INR Card */}
        <article className={styles.kpiCard}>
          <div className={styles.kpiTopRow}>
            <span className={styles.kpiLabel}>Revenue (INR)</span>
            <div className={styles.kpiIconBox}>
              <Icons.CreditCard />
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>
              {isLoading ? "—" : `₹${Math.round(inrTotal).toLocaleString("en-IN")}`}
            </span>
          </div>
          <div className={styles.kpiFooter}>
            <span className={styles.kpiMeta}>
              {data?.byCurrency?.INR?.count ?? 0} India transaction{data?.byCurrency?.INR?.count === 1 ? "" : "s"} (GST 18%)
            </span>
          </div>
        </article>

        {/* Paid Volume */}
        <article className={styles.kpiCard}>
          <div className={styles.kpiTopRow}>
            <span className={styles.kpiLabel}>Total Paid Volume</span>
            <div className={styles.kpiIconBox}>
              <Icons.Users />
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>
              {isLoading ? "—" : paidCount.toLocaleString()}
            </span>
          </div>
          <div className={styles.kpiFooter}>
            <span className={styles.kpiMeta}>Verified paid enrolments &amp; bookings</span>
          </div>
        </article>
      </section>

      {/* Navigation Filter Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem", borderBottom: "1px solid var(--border-light, #e7e0d6)", paddingBottom: "0.75rem" }}>
        <button
          type="button"
          onClick={() => setActiveTab("transactions")}
          style={{
            background: activeTab === "transactions" ? "var(--accent-primary, #b86b11)" : "transparent",
            color: activeTab === "transactions" ? "#ffffff" : "var(--text-secondary, #78716a)",
            border: "1px solid",
            borderColor: activeTab === "transactions" ? "var(--accent-primary, #b86b11)" : "var(--border-light, #e7e0d6)",
            borderRadius: "8px",
            padding: "0.45rem 1rem",
            fontSize: "0.85rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Recent Transactions ({data?.transactions?.length ?? 0})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("byCourse")}
          style={{
            background: activeTab === "byCourse" ? "var(--accent-primary, #b86b11)" : "transparent",
            color: activeTab === "byCourse" ? "#ffffff" : "var(--text-secondary, #78716a)",
            border: "1px solid",
            borderColor: activeTab === "byCourse" ? "var(--accent-primary, #b86b11)" : "var(--border-light, #e7e0d6)",
            borderRadius: "8px",
            padding: "0.45rem 1rem",
            fontSize: "0.85rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          By Course ({data?.byCourse?.length ?? 0})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("byBatch")}
          style={{
            background: activeTab === "byBatch" ? "var(--accent-primary, #b86b11)" : "transparent",
            color: activeTab === "byBatch" ? "#ffffff" : "var(--text-secondary, #78716a)",
            border: "1px solid",
            borderColor: activeTab === "byBatch" ? "var(--accent-primary, #b86b11)" : "var(--border-light, #e7e0d6)",
            borderRadius: "8px",
            padding: "0.45rem 1rem",
            fontSize: "0.85rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          By Batch ({data?.byBatch?.length ?? 0})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("byMonth")}
          style={{
            background: activeTab === "byMonth" ? "var(--accent-primary, #b86b11)" : "transparent",
            color: activeTab === "byMonth" ? "#ffffff" : "var(--text-secondary, #78716a)",
            border: "1px solid",
            borderColor: activeTab === "byMonth" ? "var(--accent-primary, #b86b11)" : "var(--border-light, #e7e0d6)",
            borderRadius: "8px",
            padding: "0.45rem 1rem",
            fontSize: "0.85rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Monthly Summary ({data?.byMonth?.length ?? 0})
        </button>
      </div>

      {/* Tab 1: Recent Transactions */}
      {activeTab === "transactions" && (
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
                  <th>Course / Program</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "28px", color: "var(--text-muted)" }}>
                      Loading transactions...
                    </td>
                  </tr>
                ) : !data?.transactions || data.transactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "28px", color: "var(--text-muted)" }}>
                      No transactions recorded yet.
                    </td>
                  </tr>
                ) : (
                  data.transactions.map((tx: any) => (
                    <tr key={tx.id}>
                      <td>
                        <span className={styles.cellText} style={{ fontWeight: 600 }}>{tx.description || tx.id}</span>
                      </td>
                      <td>
                        <span className={styles.cellUserName}>{tx.user}</span>
                      </td>
                      <td>
                        <span className={styles.cellTextMuted}>{tx.courseTitle || "—"}</span>
                      </td>
                      <td>
                        <span className={styles.cellText} style={{ fontWeight: 600 }}>
                          {tx.amount}
                        </span>
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
      )}

      {/* Tab 2: By Course */}
      {activeTab === "byCourse" && (
        <section className={styles.tableSection}>
          <div className={styles.sectionHeader}>
            <h2>Revenue by Course Track</h2>
          </div>
          <div className={styles.tableWrapper}>
            <table className={styles.adminTable}>
              <thead>
                <tr>
                  <th>Course Track</th>
                  <th>USD Revenue</th>
                  <th>AED Revenue</th>
                  <th>INR Revenue</th>
                  <th className={styles.alignRight}>Paid Orders</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "28px", color: "var(--text-muted)" }}>
                      Loading course breakdown...
                    </td>
                  </tr>
                ) : !data?.byCourse || data.byCourse.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "28px", color: "var(--text-muted)" }}>
                      No course sales recorded yet.
                    </td>
                  </tr>
                ) : (
                  data.byCourse.map((c: any) => (
                    <tr key={c.courseId}>
                      <td><span className={styles.cellUserName}>{c.courseTitle}</span></td>
                      <td><span className={styles.cellText}>{c.USD > 0 ? `$${Math.round(c.USD).toLocaleString()}` : "—"}</span></td>
                      <td><span className={styles.cellText}>{c.AED > 0 ? `AED ${Math.round(c.AED).toLocaleString()}` : "—"}</span></td>
                      <td><span className={styles.cellText}>{c.INR > 0 ? `₹${Math.round(c.INR).toLocaleString("en-IN")}` : "—"}</span></td>
                      <td className={styles.alignRight}><span className={styles.cellText} style={{ fontWeight: 600 }}>{c.count}</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Tab 3: By Batch */}
      {activeTab === "byBatch" && (
        <section className={styles.tableSection}>
          <div className={styles.sectionHeader}>
            <h2>Revenue by Cohort Batch</h2>
          </div>
          <div className={styles.tableWrapper}>
            <table className={styles.adminTable}>
              <thead>
                <tr>
                  <th>Batch Name</th>
                  <th>Associated Course</th>
                  <th>USD Revenue</th>
                  <th>AED Revenue</th>
                  <th>INR Revenue</th>
                  <th className={styles.alignRight}>Paid Learners</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "28px", color: "var(--text-muted)" }}>
                      Loading batch breakdown...
                    </td>
                  </tr>
                ) : !data?.byBatch || data.byBatch.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "28px", color: "var(--text-muted)" }}>
                      No batch sales recorded yet.
                    </td>
                  </tr>
                ) : (
                  data.byBatch.map((b: any) => (
                    <tr key={b.batchId}>
                      <td><span className={styles.cellUserName}>{b.batchName}</span></td>
                      <td><span className={styles.cellTextMuted}>{b.courseTitle}</span></td>
                      <td><span className={styles.cellText}>{b.USD > 0 ? `$${Math.round(b.USD).toLocaleString()}` : "—"}</span></td>
                      <td><span className={styles.cellText}>{b.AED > 0 ? `AED ${Math.round(b.AED).toLocaleString()}` : "—"}</span></td>
                      <td><span className={styles.cellText}>{b.INR > 0 ? `₹${Math.round(b.INR).toLocaleString("en-IN")}` : "—"}</span></td>
                      <td className={styles.alignRight}><span className={styles.cellText} style={{ fontWeight: 600 }}>{b.count}</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Tab 4: Monthly Summary */}
      {activeTab === "byMonth" && (
        <section className={styles.tableSection}>
          <div className={styles.sectionHeader}>
            <h2>Monthly Financial Performance</h2>
          </div>
          <div className={styles.tableWrapper}>
            <table className={styles.adminTable}>
              <thead>
                <tr>
                  <th>Month &amp; Year</th>
                  <th>USD Total</th>
                  <th>AED Total</th>
                  <th>INR Total</th>
                  <th className={styles.alignRight}>Paid Volume</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "28px", color: "var(--text-muted)" }}>
                      Loading monthly breakdown...
                    </td>
                  </tr>
                ) : !data?.byMonth || data.byMonth.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "28px", color: "var(--text-muted)" }}>
                      No monthly records recorded yet.
                    </td>
                  </tr>
                ) : (
                  data.byMonth.map((m: any) => (
                    <tr key={m.sortKey}>
                      <td><span className={styles.cellUserName}>{m.month} {m.year}</span></td>
                      <td><span className={styles.cellText}>{m.USD > 0 ? `$${Math.round(m.USD).toLocaleString()}` : "—"}</span></td>
                      <td><span className={styles.cellText}>{m.AED > 0 ? `AED ${Math.round(m.AED).toLocaleString()}` : "—"}</span></td>
                      <td><span className={styles.cellText}>{m.INR > 0 ? `₹${Math.round(m.INR).toLocaleString("en-IN")}` : "—"}</span></td>
                      <td className={styles.alignRight}><span className={styles.cellText} style={{ fontWeight: 600 }}>{m.count}</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
