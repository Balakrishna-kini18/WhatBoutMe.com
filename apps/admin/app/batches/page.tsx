"use client";

import { useEffect, useState, FormEvent } from "react";
import styles from "../page.module.css";
import { API_URL, errorMessage } from "../lib/api";
import Link from "next/link";

interface Batch {
  id: string;
  name: string;
  program: string;
  manager: string;
  students: number;
  status: string;
  startDate: string;
}

export default function BatchesPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [programs, setPrograms] = useState<{id: string, title: string}[]>([]);
  const [managers, setManagers] = useState<{id: string, name: string, email: string}[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // result of "Issue Certificates": what happened, and who was left out
  const [issueResult, setIssueResult] = useState<{ batchId: string; batchName: string; ok: boolean; text: string; notFinished: string[] } | null>(null);
  const [issuingId, setIssuingId] = useState<string | null>(null);
  // the batch waiting for the admin to confirm "Issue Certificates"
  const [confirmBatch, setConfirmBatch] = useState<Batch | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [programId, setProgramId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [capacity, setCapacity] = useState("");
  const [manager, setManager] = useState("");

  useEffect(() => {
    Promise.all([fetchBatches(), fetchPrograms(), fetchManagers()]).then(() => setIsLoading(false));
  }, []);

  const fetchManagers = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}`}`}/users`);
      if (res.ok) {
        const data = await res.json();
        setManagers(data.filter((u: any) => u.role === "MANAGER" || u.role === "SUPER_ADMIN"));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchPrograms = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}`}`}/programs`);
      if (res.ok) {
        const data = await res.json();
        setPrograms(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchBatches = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}`}`}/batches`);
      if (res.ok) {
        const data = await res.json();
        setBatches(data);
      }
    } catch (e) {
      console.error("Failed to fetch batches", e);
    }
  };

  const toggleDropdown = (id: string) => {
    setActiveDropdown(activeDropdown === id ? null : id);
  };

  const openEditModal = (batch: Batch) => {
    setEditingBatchId(batch.id);
    setName(batch.name);
    const p = programs.find(prog => prog.title === batch.program);
    setProgramId(p ? p.id : "");
    // Form date string yyyy-MM-dd
    const d = new Date(batch.startDate);
    if (!isNaN(d.getTime())) {
      setStartDate(d.toISOString().split('T')[0] || "");
    }
    setCapacity("50"); // We don't fetch capacity in list
    setIsModalOpen(true);
    setActiveDropdown(null);
  };

  const openCreateModal = () => {
    setEditingBatchId(null);
    setName("");
    setProgramId("");
    setStartDate("");
    setCapacity("");
    setIsModalOpen(true);
  };

  // Gives every learner in the batch their certificate; it then shows in
  // their portal. Learners who have not finished are left out unless
  // `includeUnfinished` is set by the follow-up button.
  const handleIssueCertificates = async (batchId: string, batchName: string, includeUnfinished = false) => {
    setIssuingId(batchId);
    try {
      const res = await fetch(`${API_URL}/certificates/batch/${batchId}/issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeUnfinished }),
      });
      if (!res.ok) {
        setIssueResult({ batchId, batchName, ok: false, text: await errorMessage(res, "Could not issue the certificates"), notFinished: [] });
        return;
      }
      const result: { learners: number; issued: number; alreadyIssued: number; notFinished: string[] } = await res.json();
      const parts = [
        result.learners === 0 ? `${batchName} has no enrolled learners yet.` : `${batchName}: ${result.issued} issued.`,
        result.alreadyIssued > 0 ? `${result.alreadyIssued} already had one.` : "",
        result.notFinished.length > 0 ? `${result.notFinished.length} not finished: ${result.notFinished.join(", ")}.` : "",
      ];
      setIssueResult({ batchId, batchName, ok: true, text: parts.filter(Boolean).join(" "), notFinished: result.notFinished });
    } catch {
      setIssueResult({ batchId, batchName, ok: false, text: "Could not reach the server. Check that the API is running.", notFinished: [] });
    } finally {
      setIssuingId(null);
    }
  };

  const handleDeleteBatch = async (id: string) => {
    if (!confirm("Are you sure you want to delete this batch?")) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}`}`}/batches/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchBatches();
      }
    } catch (e) {
      console.error("Failed to delete batch", e);
    }
    setActiveDropdown(null);
  };

  const handleSaveBatch = async (e: FormEvent) => {
    e.preventDefault();
    const payload = {
      name,
      programId: programId,
      startDate: new Date(startDate).toISOString(),
      capacity: parseInt(capacity) || 50,
      managerId: manager || null,
    };

    try {
      const url = editingBatchId 
        ? `${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}`}`}/batches/${editingBatchId}` 
        : `${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}`}`}/batches`;
      const method = editingBatchId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsModalOpen(false);
        setName("");
        setProgramId("");
        setStartDate("");
        setCapacity("");
        setEditingBatchId(null);
        fetchBatches(); // Refresh list
      }
    } catch (e) {
      console.error("Failed to save batch", e);
    }
  };

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Batches & Cohorts</h1>
          <p className={styles.subtitle}>Organize learners into groups and schedule live sessions.</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.primaryBtn} onClick={openCreateModal}>
            + Create Batch
          </button>
        </div>
      </header>

      {issueResult && (
        <div role="status" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem", margin: "0 0 1.5rem", padding: "0.75rem 1rem", borderRadius: "8px", fontSize: "0.9rem", background: issueResult.ok ? "var(--status-success-bg)" : "var(--status-error-bg)", color: issueResult.ok ? "var(--status-success)" : "var(--status-error)" }}>
          <span style={{ flex: 1, minWidth: "16rem" }}>{issueResult.text}</span>
          {issueResult.notFinished.length > 0 && (
            <button type="button" className={styles.secondaryBtn} style={{ padding: "0.4rem 0.8rem", fontSize: "0.8rem" }} disabled={issuingId !== null} onClick={() => handleIssueCertificates(issueResult.batchId, issueResult.batchName, true)}>
              Issue to them anyway
            </button>
          )}
        </div>
      )}

      <section className={styles.tableSection}>
        <div className={styles.sectionHeader}>
          <h2>All Batches</h2>
          <div className={styles.searchContainer}>
            <input type="text" placeholder="Search batches..." className={styles.searchInput} />
          </div>
        </div>
        
        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Batch Name</th>
                <th>Program</th>
                <th>Manager</th>
                <th>Start Date</th>
                <th>Students</th>
                <th>Status</th>
                <th className={styles.alignRight} style={{ width: '14rem' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} style={{textAlign: "center", padding: "20px"}}>Loading batches from database...</td>
                </tr>
              ) : batches.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{textAlign: "center", padding: "20px"}}>No batches found. Create one!</td>
                </tr>
              ) : batches.map((batch) => (
                <tr key={batch.id}>
                  <td>
                    <span className={styles.cellUserName}>{batch.name}</span>
                  </td>
                  <td><span className={styles.cellText}>{batch.program}</span></td>
                  <td><span className={styles.cellTextMuted}>{batch.manager}</span></td>
                  <td><span className={styles.cellTextMuted}>{batch.startDate}</span></td>
                  <td><span className={styles.cellText}>{batch.students}</span></td>
                  <td>
                    <span className={`${styles.statusChip} ${styles[batch.status.toLowerCase()]}`}>
                      {batch.status}
                    </span>
                  </td>
                  <td className={styles.alignRight} style={{ position: 'relative' }}>
                    {/* one row: the secondary button is a flex box, so without this the menu wraps below it */}
                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.rowActionBtn}
                        disabled={issuingId !== null}
                        onClick={() => setConfirmBatch(batch)}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="6"></circle><polyline points="8.5 13 7 22 12 19 17 22 15.5 13"></polyline></svg>
                        {issuingId === batch.id ? 'Issuing...' : 'Issue Certificates'}
                      </button>
                      <button
                        type="button"
                        className={styles.iconActionBtn}
                        title="More Actions"
                        aria-label={`More actions for ${batch.name}`}
                        aria-expanded={activeDropdown === batch.id}
                        onClick={() => toggleDropdown(batch.id)}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <circle cx="5" cy="12" r="2"></circle>
                          <circle cx="12" cy="12" r="2"></circle>
                          <circle cx="19" cy="12" r="2"></circle>
                        </svg>
                      </button>
                    </div>
                    {activeDropdown === batch.id && (
                      <div className={styles.actionDropdown}>
                        <button className={styles.dropdownItem} onClick={() => openEditModal(batch)}>Edit Schedule</button>
                        <Link href={`/batches/${batch.id}/sessions`} className={styles.dropdownItem} style={{ textDecoration: 'none' }}>Manage Sessions & Attendance</Link>
                        <button className={`${styles.dropdownItem} ${styles.textDanger}`} onClick={() => handleDeleteBatch(batch.id)}>Delete Batch</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* CREATE BATCH MODAL */}
      {confirmBatch && (
        <div className={styles.modalOverlay} onClick={() => setConfirmBatch(null)}>
          <div className={styles.modalContent} role="dialog" aria-modal="true" aria-labelledby="issue-title" onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 id="issue-title">Issue Certificates?</h2>
              <button type="button" className={styles.closeBtn} aria-label="Close" onClick={() => setConfirmBatch(null)}>×</button>
            </div>
            <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
              Every learner in <strong style={{ color: 'var(--text-primary)' }}>{confirmBatch.name}</strong> who has finished{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{confirmBatch.program}</strong> will get a certificate dated today.
              It appears in their portal straight away. Learners who have not finished are left out and listed afterwards.
            </p>
            <div className={styles.modalFooter}>
              <button type="button" className={styles.secondaryBtn} onClick={() => setConfirmBatch(null)}>Cancel</button>
              <button
                type="button"
                className={styles.primaryBtn}
                autoFocus
                onClick={() => {
                  const batch = confirmBatch;
                  setConfirmBatch(null);
                  handleIssueCertificates(batch.id, batch.name);
                }}
              >
                Approve &amp; Issue
              </button>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsModalOpen(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{editingBatchId ? "Edit Batch" : "Create New Batch"}</h2>
              <button className={styles.closeBtn} onClick={() => setIsModalOpen(false)}>×</button>
            </div>
            
            <form className={styles.modalForm} onSubmit={handleSaveBatch}>
              <div className={styles.formGroup}>
                <label>Batch Name</label>
                <input type="text" placeholder="e.g. Winter Cohort 2026" required value={name} onChange={e => setName(e.target.value)} />
              </div>
              
              <div className={styles.formGroup}>
                <label>Assign Program</label>
                <select required value={programId} onChange={e => setProgramId(e.target.value)}>
                  <option value="">Select a Program</option>
                  {programs.map(p => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Start Date</label>
                  <input type="date" required value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                <div className={styles.formGroup}>
                  <label>Max Capacity</label>
                  <input type="number" placeholder="50" required value={capacity} onChange={e => setCapacity(e.target.value)} />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Assign Manager</label>
                <select value={manager} onChange={e => setManager(e.target.value)}>
                  <option value="">Select a Manager</option>
                  {managers.map(m => (
                    <option key={m.id} value={m.id}>{m.name || m.email}</option>
                  ))}
                </select>
              </div>

              <div className={styles.modalFooter}>
                <button type="button" className={styles.secondaryBtn} onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className={styles.primaryBtn}>Save Batch</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
