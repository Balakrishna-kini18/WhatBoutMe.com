"use client";

import { useEffect, useState, use } from "react";
import styles from "../../../../../page.module.css";
import Link from "next/link";
import { CustomSelect } from "../../../../../components";

export default function ReconciliationPage({ params }: { params: Promise<{ id: string, sessionId: string }> }) {
  const resolvedParams = use(params);
  const { id: batchId, sessionId } = resolvedParams;
  
  const [unmatched, setUnmatched] = useState<any[]>([]);
  const [enrolments, setEnrolments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<any>(null);

  const [resolveData, setResolveData] = useState<{
    isOpen: boolean;
    unmatchedId: string;
    enrolmentId: string;
    participantEmail: string;
    loading: boolean;
    error: string;
  }>({
    isOpen: false,
    unmatchedId: "",
    enrolmentId: "",
    participantEmail: "",
    loading: false,
    error: ""
  });

  useEffect(() => {
    fetchData();
  }, [batchId, sessionId]);

  function getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch session details
      const sessionRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/sessions?batchId=${batchId}`);
      if (sessionRes.ok) {
        const sessions = await sessionRes.json();
        const currentSession = sessions.find((s: any) => s.id === sessionId);
        setSession(currentSession);
      }

      // Fetch batch enrolments to know who SHOULD be here (for linking)
      const batchRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/batches/${batchId}`);
      if (batchRes.ok) {
        const currentBatch = await batchRes.json();
        if (currentBatch && currentBatch.enrolments) {
          setEnrolments(currentBatch.enrolments);
        }
      }

      // Fetch unmatched records
      const attRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/sessions/${sessionId}/unmatched-attendance`, {
        headers: getAuthHeaders()
      });
      if (attRes.ok) {
        const data = await attRes.json();
        setUnmatched(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResolveClick = (unmatchedId: string, participantEmail: string) => {
    setResolveData({
      isOpen: true,
      unmatchedId,
      enrolmentId: "",
      participantEmail: participantEmail || "Unknown",
      loading: false,
      error: ""
    });
  };

  const submitResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolveData.enrolmentId) {
      setResolveData(prev => ({ ...prev, error: "Please select a learner to link." }));
      return;
    }

    setResolveData(prev => ({ ...prev, loading: true, error: "" }));
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/sessions/${sessionId}/unmatched-attendance/${resolveData.unmatchedId}/resolve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ enrolmentId: resolveData.enrolmentId })
      });
      if (res.ok) {
        setResolveData(prev => ({ ...prev, isOpen: false, loading: false }));
        fetchData();
      } else {
        const err = await res.json();
        setResolveData(prev => ({ ...prev, loading: false, error: err.message || "Failed to resolve participant." }));
      }
    } catch (e: any) {
      setResolveData(prev => ({ ...prev, loading: false, error: e.message || "Network error" }));
    }
  };

  const handleDismiss = async (unmatchedId: string) => {
    if (!confirm("Are you sure you want to dismiss this unmatched participant? They will be ignored for attendance.")) return;
    
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/sessions/${sessionId}/unmatched-attendance/${unmatchedId}/dismiss`, {
        method: "PATCH",
        headers: getAuthHeaders()
      });
      if (res.ok) {
        fetchData();
      } else {
        alert("Failed to dismiss unmatched participant.");
      }
    } catch (e) {
      console.error(e);
      alert("Network error.");
    }
  };

  const pendingUnmatched = unmatched.filter(u => u.status === 'UNMATCHED');

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
            <Link href={`/batches/${batchId}/sessions`} style={{textDecoration: 'none', color: 'var(--accent-primary)', fontSize: '1.2rem'}}>← Back to Sessions</Link>
            <h1 className={styles.title}>Reconciliation: {session?.title || 'Session'}</h1>
          </div>
          <p className={styles.subtitle}>Review unmatched participants (e.g. from Zoom) and link them to enrolled learners.</p>
        </div>
      </header>

      <section className={styles.tableSection}>
        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Participant Identity</th>
                <th>Provider</th>
                <th>Status</th>
                <th className={styles.alignRight}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={4} style={{textAlign: "center", padding: "20px"}}>Loading unmatched participants...</td>
                </tr>
              ) : pendingUnmatched.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{textAlign: "center", padding: "20px"}}>No pending unmatched participants.</td>
                </tr>
              ) : pendingUnmatched.map((record) => (
                <tr key={record.id}>
                  <td>
                    <span className={styles.cellUserName}>{record.participantEmail || record.providerId || 'Unknown Identity'}</span>
                  </td>
                  <td><span className={styles.cellTextMuted}>{record.provider}</span></td>
                  <td>
                    <span className={`${styles.statusChip} ${styles.pending}`}>
                      Needs Review
                    </span>
                  </td>
                  <td className={styles.alignRight}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button className={styles.primaryBtn} onClick={() => handleResolveClick(record.id, record.participantEmail || record.providerId)} style={{ padding: '0.25rem 0.75rem', fontSize: '0.85rem' }}>Link to Learner</button>
                      <button className={styles.secondaryBtn} onClick={() => handleDismiss(record.id)} style={{ padding: '0.25rem 0.75rem', fontSize: '0.85rem' }}>Dismiss</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {resolveData.isOpen && (
        <div className={styles.modalOverlay} onClick={() => setResolveData(prev => ({ ...prev, isOpen: false }))}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Link Participant</h2>
              <button className={styles.closeBtn} onClick={() => setResolveData(prev => ({ ...prev, isOpen: false }))}>×</button>
            </div>
            <form onSubmit={submitResolve} className={styles.modalForm}>
              <div className={styles.formGroup}>
                <label>Unmatched Participant:</label>
                <div style={{ padding: '0.5rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', marginBottom: '1rem' }}>
                  {resolveData.participantEmail}
                </div>
                
                <label>Select Enrolled Learner</label>
                <CustomSelect
                  value={resolveData.enrolmentId}
                  onChange={(val) => setResolveData(prev => ({ ...prev, enrolmentId: val }))}
                  fullWidth
                  ariaLabel="Select Enrolled Learner"
                  placeholder="-- Choose Learner --"
                  options={enrolments.map(enrol => ({
                    value: enrol.id,
                    label: `${enrol.user?.name || "Learner"} (${enrol.user?.email || "No email"})`,
                  }))}
                />
              </div>
              {resolveData.error && (
                <p style={{ color: '#b91c1c', background: '#fef2f2', padding: '0.5rem', borderRadius: '4px' }}>
                  {resolveData.error}
                </p>
              )}
              <div className={styles.modalFooter}>
                <button type="button" className={styles.cancelBtn} onClick={() => setResolveData(prev => ({ ...prev, isOpen: false }))}>Cancel</button>
                <button type="submit" className={styles.primaryBtn} disabled={resolveData.loading}>
                  {resolveData.loading ? "Linking..." : "Confirm Link"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
