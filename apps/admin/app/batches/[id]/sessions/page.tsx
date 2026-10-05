"use client";

import { useEffect, useState, use } from "react";
import styles from "../../../page.module.css";
import Link from "next/link";

interface Session {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  joinUrl: string | null;
  recordingUrl: string | null;
  quizId: string | null;
}

export default function BatchSessionsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const batchId = resolvedParams.id;
  
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Form state
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [joinUrl, setJoinUrl] = useState("");
  const [recordingUrl, setRecordingUrl] = useState("");
  const [quizId, setQuizId] = useState("");
  const [quizzes, setQuizzes] = useState<{id: string, title: string}[]>([]);

  useEffect(() => {
    fetchSessions();
    fetchQuizzes();
  }, [batchId]);

  const fetchQuizzes = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/quizzes`);
      if (res.ok) {
        const data = await res.json();
        setQuizzes(data);
      }
    } catch (e) {
      console.error("Failed to fetch quizzes", e);
    }
  };

  const fetchSessions = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/sessions?batchId=${batchId}`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm("Delete this session?")) return;
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/sessions/${sessionId}`, { method: 'DELETE' });
      fetchSessions();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveSession = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId,
          title,
          startTime,
          endTime,
          joinUrl: joinUrl || undefined,
          recordingUrl: recordingUrl || undefined,
          quizId: quizId || undefined
        }),
      });
      if (res.ok) {
        setIsModalOpen(false);
        setTitle("");
        setStartTime("");
        setEndTime("");
        setJoinUrl("");
        setRecordingUrl("");
        setQuizId("");
        fetchSessions();
      }
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
            <Link href="/batches" style={{textDecoration: 'none', color: 'var(--accent-primary)', fontSize: '1.2rem'}}>← Back to Batches</Link>
            <h1 className={styles.title}>Manage Sessions & Attendance</h1>
          </div>
          <p className={styles.subtitle}>Schedule live classes and track student attendance.</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.primaryBtn} onClick={() => setIsModalOpen(true)}>
            + Schedule Session
          </button>
        </div>
      </header>

      <section className={styles.tableSection}>
        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Topic / Title</th>
                <th>Start Time</th>
                <th>End Time</th>
                <th>Meeting Link</th>
                <th>Recording URL</th>
                <th>Post-Session Quiz</th>
                <th className={styles.alignRight}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} style={{textAlign: "center", padding: "20px"}}>Loading sessions...</td>
                </tr>
              ) : sessions.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{textAlign: "center", padding: "20px"}}>No sessions scheduled yet.</td>
                </tr>
              ) : sessions.map((s) => (
                <tr key={s.id}>
                  <td><span className={styles.cellUserName}>{s.title}</span></td>
                  <td><span className={styles.cellTextMuted}>{new Date(s.startTime).toLocaleString()}</span></td>
                  <td><span className={styles.cellTextMuted}>{new Date(s.endTime).toLocaleString()}</span></td>
                  <td>
                    {s.joinUrl ? <a href={s.joinUrl} target="_blank" rel="noreferrer" style={{color: 'var(--accent-primary)'}}>Join Link</a> : <span className={styles.cellTextMuted}>N/A</span>}
                  </td>
                  <td>
                    {s.recordingUrl ? <a href={s.recordingUrl} target="_blank" rel="noreferrer" style={{color: 'var(--accent-primary)'}}>Watch</a> : <span className={styles.cellTextMuted}>N/A</span>}
                  </td>
                  <td>
                    <span className={styles.statusChip} style={{background: s.quizId ? 'var(--accent-primary)' : 'var(--bg-card)', color: s.quizId ? '#fff' : 'inherit'}}>
                      {s.quizId ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className={styles.alignRight}>
                    <Link href={`/batches/${batchId}/sessions/${s.id}/attendance`} className={styles.secondaryBtn} style={{marginRight: '10px', textDecoration: 'none'}}>View Attendance</Link>
                    <button className={styles.secondaryBtn} style={{color: 'red'}} onClick={() => handleDeleteSession(s.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* CREATE SESSION MODAL */}
      {isModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsModalOpen(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Schedule Live Session</h2>
              <button className={styles.closeBtn} onClick={() => setIsModalOpen(false)}>×</button>
            </div>
            
            <form className={styles.modalForm} onSubmit={handleSaveSession}>
              <div className={styles.formGroup}>
                <label>Session Title/Topic</label>
                <input type="text" placeholder="e.g. Week 1: Introduction" required value={title} onChange={e => setTitle(e.target.value)} />
              </div>
              
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Start Time</label>
                  <input type="datetime-local" required value={startTime} onChange={e => setStartTime(e.target.value)} />
                </div>
                <div className={styles.formGroup}>
                  <label>End Time</label>
                  <input type="datetime-local" required value={endTime} onChange={e => setEndTime(e.target.value)} />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Meeting Link (Zoom/Meet)</label>
                <input type="url" placeholder="https://zoom.us/j/..." value={joinUrl} onChange={e => setJoinUrl(e.target.value)} />
              </div>

              <div className={styles.formGroup}>
                <label>Recording URL (Post-Session)</label>
                <input type="url" placeholder="https://mux.com/..." value={recordingUrl} onChange={e => setRecordingUrl(e.target.value)} />
              </div>

              <div className={styles.formGroup}>
                <label>Post-Session Quiz (Optional)</label>
                <select value={quizId} onChange={(e) => setQuizId(e.target.value)}>
                  <option value="">-- No Quiz --</option>
                  {quizzes.map((q) => (
                    <option key={q.id} value={q.id}>{q.title || `Quiz ${q.id.substring(0,6)}`}</option>
                  ))}
                </select>
              </div>

              <div className={styles.modalActions}>
                <button type="button" className={styles.secondaryBtn} onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className={styles.primaryBtn}>Schedule</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
