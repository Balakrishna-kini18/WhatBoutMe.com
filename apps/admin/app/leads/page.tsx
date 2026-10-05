"use client";

import { useEffect, useState } from "react";
import styles from "../page.module.css";
import { API_URL } from "../lib/api";

interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string | null;
  status: string;
  createdAt: string;
}

const STATUSES = [
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "CONVERTED", label: "Converted" },
  { value: "CLOSED", label: "Closed" },
];

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("ALL");

  const load = async () => {
    try {
      const res = await fetch(`${API_URL}/leads`);
      if (res.ok) setLeads(await res.json());
    } catch (e) {
      console.error("Failed to load enquiries", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const setStatus = async (id: string, status: string) => {
    const res = await fetch(`${API_URL}/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) setLeads((all) => all.map((l) => (l.id === id ? { ...l, status } : l)));
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this enquiry permanently?")) return;
    const res = await fetch(`${API_URL}/leads/${id}`, { method: "DELETE" });
    if (res.ok) setLeads((all) => all.filter((l) => l.id !== id));
  };

  const visible = filter === "ALL" ? leads : leads.filter((l) => l.status === filter);

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Enquiries (CRM)</h1>
          <p className={styles.subtitle}>Messages sent from the contact form on the public website.</p>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.formGroup} style={{ minWidth: "180px" }}>
            <select aria-label="Filter by status" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="ALL">All statuses</option>
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>
      </header>

      <section className={styles.tableSection}>
        <div className={styles.sectionHeader}>
          <h2>{visible.length} {visible.length === 1 ? "Enquiry" : "Enquiries"}</h2>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact</th>
                <th>Message</th>
                <th>Received</th>
                <th>Status</th>
                <th className={styles.alignRight}>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: "20px" }}>Loading enquiries...</td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: "20px" }}>No enquiries here yet.</td></tr>
              ) : visible.map((lead) => (
                <tr key={lead.id}>
                  <td><span className={styles.cellUserName}>{lead.name}</span></td>
                  <td>
                    <a href={`mailto:${lead.email}`} className={styles.cellText} style={{ display: "block" }}>{lead.email}</a>
                    {lead.phone && <span className={styles.cellTextMuted}>{lead.phone}</span>}
                  </td>
                  <td style={{ maxWidth: "340px", whiteSpace: "normal" }}><span className={styles.cellText}>{lead.message || "—"}</span></td>
                  <td><span className={styles.cellTextMuted}>{new Date(lead.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span></td>
                  <td>
                    <div className={styles.formGroup}>
                      <select aria-label={`Status for ${lead.name}`} value={lead.status} onChange={(e) => setStatus(lead.id, e.target.value)} style={{ padding: "0.4rem 0.6rem" }}>
                        {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </div>
                  </td>
                  <td className={styles.alignRight}>
                    <button className={`${styles.dropdownItem} ${styles.textDanger}`} style={{ width: "auto" }} onClick={() => remove(lead.id)}>Delete</button>
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
