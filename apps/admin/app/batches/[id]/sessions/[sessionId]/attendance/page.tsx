"use client";

import { useEffect, useState, use } from "react";
import styles from "../../../../../page.module.css";
import Link from "next/link";

export default function SessionAttendancePage({ params }: { params: Promise<{ id: string, sessionId: string }> }) {
  const resolvedParams = use(params);
  const { id: batchId, sessionId } = resolvedParams;
  
  const [attendances, setAttendances] = useState<any[]>([]);
  const [enrolments, setEnrolments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    fetchData();
  }, [batchId, sessionId]);

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

      // Fetch batch enrolments to know who SHOULD be here
      const batchRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/batches/${batchId}`);
      if (batchRes.ok) {
        const currentBatch = await batchRes.json();
        if (currentBatch && currentBatch.enrolments) {
          setEnrolments(currentBatch.enrolments);
        }
      }

      // Fetch actual attendance records
      const attRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/sessions/${sessionId}/attendance`);
      if (attRes.ok) {
        setAttendances(await attRes.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const [overrideData, setOverrideData] = useState<{ isOpen: boolean, attendanceId: string, reason: string, loading: boolean, error: string }>({
    isOpen: false,
    attendanceId: "",
    reason: "",
    loading: false,
    error: ""
  });

  const handleOverrideClick = (attendanceId: string) => {
    setOverrideData({ isOpen: true, attendanceId, reason: "", loading: false, error: "" });
  };

  const submitOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideData.reason.trim()) {
      setOverrideData(prev => ({ ...prev, error: "A reason is required." }));
      return;
    }

    setOverrideData(prev => ({ ...prev, loading: true, error: "" }));
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/attendance/${overrideData.attendanceId}/override`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ status: "CORRECTED", correctionReason: overrideData.reason })
      });
      if (res.ok) {
        setOverrideData(prev => ({ ...prev, isOpen: false, loading: false }));
        fetchData();
      } else {
        const err = await res.json();
        setOverrideData(prev => ({ ...prev, loading: false, error: err.message || "Failed to override attendance." }));
      }
    } catch (e: any) {
      setOverrideData(prev => ({ ...prev, loading: false, error: e.message || "Network error" }));
    }
  };

  // Merge enrolments with attendance to show all students
  const mergedData = enrolments.map(enrolment => {
    const record = attendances.find(a => a.enrolmentId === enrolment.id);
    return {
      userId: enrolment.userId,
      userName: enrolment.user?.name || 'Unknown User',
      userEmail: enrolment.user?.email || '',
      isPresent: record && record.status !== 'ABSENT',
      joinTime: record?.joinTime || null,
      attendanceId: record?.id,
      status: record?.status || 'NO_RECORD'
    };
  });

  function getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
            <Link href={`/batches/${batchId}/sessions`} style={{textDecoration: 'none', color: 'var(--accent-primary)', fontSize: '1.2rem'}}>← Back to Sessions</Link>
            <h1 className={styles.title}>Attendance: {session?.title || 'Session'}</h1>
          </div>
          <p className={styles.subtitle}>View and manually override attendance for this live class.</p>
        </div>
      </header>

      <section className={styles.tableSection}>
        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Student Name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Join Time</th>
                <th className={styles.alignRight}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} style={{textAlign: "center", padding: "20px"}}>Loading attendance data...</td>
                </tr>
              ) : mergedData.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{textAlign: "center", padding: "20px"}}>No students enrolled in this batch.</td>
                </tr>
              ) : mergedData.map((student) => (
                <tr key={student.userId}>
                  <td><span className={styles.cellUserName}>{student.userName}</span></td>
                  <td><span className={styles.cellTextMuted}>{student.userEmail}</span></td>
                  <td>
                    <span className={`${styles.statusChip} ${student.isPresent ? styles.active : styles.expired}`}>
                      {student.status === 'CORRECTED' ? 'Corrected' : (student.isPresent ? 'Present' : 'Absent')}
                    </span>
                  </td>
                  <td>
                    <span className={styles.cellTextMuted}>
                      {student.joinTime ? new Date(student.joinTime).toLocaleTimeString() : '---'}
                    </span>
                  </td>
                  <td className={styles.alignRight}>
                    {student.attendanceId ? (
                      <button className={styles.secondaryBtn} onClick={() => handleOverrideClick(student.attendanceId)}>
                        Override
                      </button>
                    ) : (
                      <span className={styles.cellTextMuted} style={{ fontSize: '0.8rem' }}>Pending</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {overrideData.isOpen && (
        <div className={styles.modalOverlay} onClick={() => setOverrideData(prev => ({ ...prev, isOpen: false }))}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Override Attendance</h2>
              <button className={styles.closeBtn} onClick={() => setOverrideData(prev => ({ ...prev, isOpen: false }))}>×</button>
            </div>
            <form onSubmit={submitOverride} className={styles.modalForm}>
              <div className={styles.formGroup}>
                <label>Correction Reason (Required)</label>
                <textarea
                  required
                  value={overrideData.reason}
                  onChange={(e) => setOverrideData(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="e.g. Student joined via phone instead of Zoom"
                  style={{ width: '100%', minHeight: '80px', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
                />
              </div>
              {overrideData.error && (
                <p style={{ color: '#b91c1c', background: '#fef2f2', padding: '0.5rem', borderRadius: '4px' }}>
                  {overrideData.error}
                </p>
              )}
              <div className={styles.modalFooter}>
                <button type="button" className={styles.cancelBtn} onClick={() => setOverrideData(prev => ({ ...prev, isOpen: false }))}>Cancel</button>
                <button type="submit" className={styles.primaryBtn} disabled={overrideData.loading}>
                  {overrideData.loading ? "Saving..." : "Confirm Override"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
