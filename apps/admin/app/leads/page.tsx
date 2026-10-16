"use client";

import { useEffect, useState } from "react";
import styles from "../page.module.css";
import { API_URL, cachedFetch } from "../lib/api";
import { CustomSelect, ActionMenu, ConfirmDialog, useToast } from "../components";

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
  const toast = useToast();
  const [leadToDelete, setLeadToDelete] = useState<Lead | null>(null);
  const [isDeletingLead, setIsDeletingLead] = useState(false);

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

  const setStatus = async (id: string, nextStatus: string) => {
    const previous = leads;
    // Optimistic UI update: immediately reflect new lead status
    setLeads((all) => all.map((l) => (l.id === id ? { ...l, status: nextStatus } : l)));
    try {
      const res = await fetch(`${API_URL}/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        // Rollback on server error
        setLeads(previous);
      }
    } catch {
      setLeads(previous);
    }
  };

  const confirmDeleteLead = async () => {
    if (!leadToDelete) return;
    const id = leadToDelete.id;
    setIsDeletingLead(true);
    const previous = leads;
    setLeads((all) => all.filter((l) => l.id !== id));
    toast.success("Enquiry removed.");
    setLeadToDelete(null);

    try {
      const res = await cachedFetch(`${API_URL}/leads/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setLeads(previous);
        toast.error("Failed to delete enquiry.");
      }
    } catch {
      setLeads(previous);
      toast.error("Failed to delete enquiry.");
    } finally {
      setIsDeletingLead(false);
    }
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
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)" }}>Status:</span>
            <CustomSelect
              ariaLabel="Filter enquiries by status"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "ALL", label: "All statuses" },
                ...STATUSES.map((s) => ({ value: s.value, label: s.label })),
              ]}
              minWidth="150px"
            />
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
                <tr><td colSpan={6} style={{ textAlign: "center", padding: "28px", color: "var(--text-muted)" }}>Loading enquiries...</td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: "28px", color: "var(--text-muted)" }}>No enquiries found.</td></tr>
              ) : visible.map((lead) => (
                <tr key={lead.id}>
                  <td><span className={styles.cellUserName}>{lead.name}</span></td>
                  <td>
                    <a href={`mailto:${lead.email}`} className={styles.cellText} style={{ display: "block", color: "var(--accent-primary)", textDecoration: "none" }}>{lead.email}</a>
                    {lead.phone && <span className={styles.cellTextMuted}>{lead.phone}</span>}
                  </td>
                  <td style={{ maxWidth: "340px", whiteSpace: "normal" }}>
                    <span className={styles.cellText} style={{ lineHeight: 1.45 }}>{lead.message || "—"}</span>
                  </td>
                  <td><span className={styles.cellTextMuted}>{new Date(lead.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span></td>
                  <td>
                    <CustomSelect
                      size="sm"
                      ariaLabel={`Status for ${lead.name}`}
                      value={lead.status}
                      onChange={(val) => setStatus(lead.id, val)}
                      options={STATUSES.map((s) => ({ value: s.value, label: s.label }))}
                      minWidth="135px"
                    />
                  </td>
                  <td className={styles.alignRight}>
                    <ActionMenu
                      ariaLabel={`Actions for ${lead.name}`}
                      items={[
                        {
                          label: `Email ${lead.name}`,
                          href: `mailto:${lead.email}`,
                          icon: (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                              <polyline points="22,6 12,13 2,6" />
                            </svg>
                          ),
                        },
                        {
                          label: "Delete Enquiry",
                          danger: true,
                          dividerAbove: true,
                          onClick: () => setLeadToDelete(lead),
                          icon: (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          ),
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* In-website branded ConfirmDialog */}
      <ConfirmDialog
        isOpen={Boolean(leadToDelete)}
        onClose={() => {
          if (!isDeletingLead) setLeadToDelete(null);
        }}
        onConfirm={confirmDeleteLead}
        title="Delete CRM Enquiry"
        subtitle={leadToDelete ? `${leadToDelete.name} (${leadToDelete.email})` : undefined}
        description={
          <>
            Are you sure you want to permanently delete the enquiry from <strong>{leadToDelete?.name}</strong>?
            {leadToDelete?.message && (
              <div style={{ marginTop: "8px", padding: "10px", background: "#f8f5f0", borderRadius: "6px", fontStyle: "italic", fontSize: "0.85rem" }}>
                &ldquo;{leadToDelete.message}&rdquo;
              </div>
            )}
          </>
        }
        tone="danger"
        confirmText={isDeletingLead ? "Deleting..." : "Delete Enquiry"}
        cancelText="Cancel"
        isLoading={isDeletingLead}
      />
    </div>
  );
}
