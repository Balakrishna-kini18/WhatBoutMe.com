"use client";

import { useEffect, useState, use } from "react";
import styles from "../../../page.module.css";
import Link from "next/link";
import { API_URL, errorMessage } from "../../../lib/api";

interface Session {
  id: string;
  title: string;
  sessionType: "GROUP_COHORT" | "ONE_ON_ONE";
  capacity: number;
  status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "RESCHEDULED";
  startTime: string;
  endTime: string;
  joinUrl: string | null;
  recordingUrl: string | null;
  quizId: string | null;
  hostTrainer?: { id: string; name: string; email: string } | null;
  learner?: { id: string; name: string; email: string } | null;
}

export default function BatchSessionsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const batchId = resolvedParams.id;

  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Form state
  const [sessionType, setSessionType] = useState<"GROUP_COHORT" | "ONE_ON_ONE">("GROUP_COHORT");
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [capacity, setCapacity] = useState<number>(50);
  const [joinUrl, setJoinUrl] = useState("");
  const [recordingUrl, setRecordingUrl] = useState("");
  const [quizId, setQuizId] = useState("");
  const [quizzes, setQuizzes] = useState<{ id: string; title: string }[]>([]);

  useEffect(() => {
    fetchSessions();
    fetchQuizzes();
  }, [batchId]);

  const fetchQuizzes = async () => {
    try {
      const res = await fetch(`${API_URL}/quizzes`);
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
      const res = await fetch(`${API_URL}/sessions?batchId=${batchId}`);
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

  const handleCancelSession = async (sessionId: string) => {
    const reason = window.prompt("Reason for cancelling this session:");
    if (reason === null) return;

    try {
      const res = await fetch(`${API_URL}/sessions/${sessionId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || "Administrative cancellation" }),
      });
      if (res.ok) {
        fetchSessions();
      } else {
        alert(await errorMessage(res, "Failed to cancel session."));
      }
    } catch (e) {
      console.error(e);
      alert("Failed to communicate with server.");
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm("Permanently delete this session record?")) return;
    try {
      const res = await fetch(`${API_URL}/sessions/${sessionId}`, { method: "DELETE" });
      if (res.ok) {
        fetchSessions();
      } else {
        alert(await errorMessage(res, "Failed to delete session."));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      setFormError("Please provide valid start and end times.");
      return;
    }

    if (end.getTime() <= start.getTime()) {
      setFormError("Session end time must be strictly after start time.");
      return;
    }

    const durationMin = (end.getTime() - start.getTime()) / (1000 * 60);
    if (durationMin < 5) {
      setFormError("Session duration must be at least 5 minutes.");
      return;
    }

    setIsSaving(true);
    try {
      const payload: Record<string, any> = {
        batchId,
        title: title.trim(),
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        sessionType,
        capacity: sessionType === "ONE_ON_ONE" ? 1 : Number(capacity),
        meetingProvider: joinUrl.trim() ? undefined : "ZOOM",
        joinUrl: joinUrl.trim() || undefined,
        recordingUrl: recordingUrl.trim() || undefined,
        quizId: quizId || undefined,
      };

      const res = await fetch(`${API_URL}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsModalOpen(false);
        setTitle("");
        setStartTime("");
        setEndTime("");
        setCapacity(50);
        setJoinUrl("");
        setRecordingUrl("");
        setQuizId("");
        fetchSessions();
      } else {
        setFormError(await errorMessage(res, "Failed to schedule session"));
      }
    } catch (error) {
      console.error(error);
      setFormError("Could not reach API server.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
            <Link
              href="/batches"
              style={{ textDecoration: "none", color: "var(--accent-primary)", fontSize: "1.2rem" }}
            >
              ← Back to Batches
            </Link>
            <h1 className={styles.title}>Manage Sessions & Attendance</h1>
          </div>
          <p className={styles.subtitle}>
            Schedule live cohort sessions or 1-on-1 coaching, track attendance, and link recordings.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.primaryBtn} onClick={() => { setFormError(""); setIsModalOpen(true); }}>
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
                <th>Format</th>
                <th>Capacity</th>
                <th>Start Time (UTC saved)</th>
                <th>End Time</th>
                <th>Meeting Link</th>
                <th>Status</th>
                <th>Recording / Quiz</th>
                <th className={styles.alignRight}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: "20px" }}>
                    Loading sessions...
                  </td>
                </tr>
              ) : sessions.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: "20px" }}>
                    No sessions scheduled yet for this batch.
                  </td>
                </tr>
              ) : (
                sessions.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <span className={styles.cellUserName}>{s.title}</span>
                    </td>
                    <td>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "0.2rem 0.5rem",
                          borderRadius: "4px",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          background: s.sessionType === "ONE_ON_ONE" ? "#ede9fe" : "#e0f2fe",
                          color: s.sessionType === "ONE_ON_ONE" ? "#6d28d9" : "#0369a1",
                        }}
                      >
                        {s.sessionType === "ONE_ON_ONE" ? "1-on-1" : "Cohort"}
                      </span>
                    </td>
                    <td>
                      <span className={styles.cellText}>{s.capacity}</span>
                    </td>
                    <td>
                      <span className={styles.cellTextMuted}>
                        {new Date(s.startTime).toLocaleString()}
                      </span>
                    </td>
                    <td>
                      <span className={styles.cellTextMuted}>
                        {new Date(s.endTime).toLocaleString()}
                      </span>
                    </td>
                    <td>
                      {s.joinUrl ? (
                        <a
                          href={s.joinUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "var(--accent-primary)", fontWeight: 600 }}
                        >
                          Join Link ↗
                        </a>
                      ) : (
                        <span className={styles.cellTextMuted}>None</span>
                      )}
                    </td>
                    <td>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "0.2rem 0.5rem",
                          borderRadius: "4px",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          background:
                            s.status === "SCHEDULED"
                              ? "#ecfdf5"
                              : s.status === "CANCELLED"
                              ? "#fef2f2"
                              : "#f3f4f6",
                          color:
                            s.status === "SCHEDULED"
                              ? "#047857"
                              : s.status === "CANCELLED"
                              ? "#b91c1c"
                              : "#4b5563",
                        }}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        {s.recordingUrl && (
                          <a
                            href={s.recordingUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              fontSize: "0.75rem",
                              color: "var(--accent-primary)",
                              fontWeight: 600,
                            }}
                          >
                            Watch
                          </a>
                        )}
                        {s.quizId && (
                          <span
                            style={{
                              fontSize: "0.75rem",
                              background: "#f1f5f9",
                              padding: "2px 6px",
                              borderRadius: "4px",
                            }}
                          >
                            Quiz Attached
                          </span>
                        )}
                        {!s.recordingUrl && !s.quizId && (
                          <span className={styles.cellTextMuted}>—</span>
                        )}
                      </div>
                    </td>
                    <td className={styles.alignRight}>
                      <Link
                        href={`/batches/${batchId}/sessions/${s.id}/attendance`}
                        className={styles.secondaryBtn}
                        style={{
                          marginRight: "8px",
                          textDecoration: "none",
                          display: "inline-block",
                          padding: "0.4rem 0.75rem",
                          fontSize: "0.8rem",
                        }}
                      >
                        Attendance
                      </Link>
                      {s.status !== "CANCELLED" && (
                        <button
                          className={styles.secondaryBtn}
                          style={{
                            color: "#b91c1c",
                            display: "inline-block",
                            marginRight: "6px",
                            padding: "0.4rem 0.75rem",
                            fontSize: "0.8rem",
                          }}
                          onClick={() => handleCancelSession(s.id)}
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        className={styles.secondaryBtn}
                        style={{
                          color: "#6b7280",
                          display: "inline-block",
                          padding: "0.4rem 0.75rem",
                          fontSize: "0.8rem",
                        }}
                        onClick={() => handleDeleteSession(s.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* CREATE SESSION MODAL */}
      {isModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsModalOpen(false)}>
          <div
            className={styles.modalContent}
            style={{ maxWidth: "560px", maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <h2>Schedule Live Session</h2>
                <p className={styles.modalIntro}>Stored in UTC with automated Zoom link generation.</p>
              </div>
              <button className={styles.closeBtn} onClick={() => setIsModalOpen(false)}>
                ×
              </button>
            </div>

            <form className={styles.modalForm} onSubmit={handleSaveSession}>
              <div className={styles.formGroup}>
                <label>Format</label>
                <div style={{ display: "flex", gap: "1rem", marginTop: "0.25rem" }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      cursor: "pointer",
                      fontWeight: sessionType === "GROUP_COHORT" ? 700 : 400,
                    }}
                  >
                    <input
                      type="radio"
                      name="sessionType"
                      checked={sessionType === "GROUP_COHORT"}
                      onChange={() => {
                        setSessionType("GROUP_COHORT");
                        setCapacity(50);
                      }}
                    />
                    Group Cohort
                  </label>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      cursor: "pointer",
                      fontWeight: sessionType === "ONE_ON_ONE" ? 700 : 400,
                    }}
                  >
                    <input
                      type="radio"
                      name="sessionType"
                      checked={sessionType === "ONE_ON_ONE"}
                      onChange={() => {
                        setSessionType("ONE_ON_ONE");
                        setCapacity(1);
                      }}
                    />
                    1-on-1 Coaching
                  </label>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Session Title/Topic</label>
                <input
                  type="text"
                  placeholder="e.g. Week 1: Introduction to Framework"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Start Time (Local)</label>
                  <input
                    type="datetime-local"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>End Time (Local)</label>
                  <input
                    type="datetime-local"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>

              {sessionType === "GROUP_COHORT" ? (
                <div className={styles.formGroup}>
                  <label>Capacity</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={capacity}
                    onChange={(e) => setCapacity(parseInt(e.target.value, 10) || 1)}
                  />
                </div>
              ) : (
                <div className={styles.formGroup}>
                  <label>Capacity</label>
                  <input type="number" disabled value={1} />
                  <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    1-on-1 coaching sessions are fixed to 1 participant.
                  </span>
                </div>
              )}

              <div className={styles.formGroup}>
                <label>Meeting Link (Zoom)</label>
                <input
                  type="url"
                  placeholder="Leave blank for automatic Zoom room creation"
                  value={joinUrl}
                  onChange={(e) => setJoinUrl(e.target.value)}
                />
                <span
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    color: "var(--text-secondary)",
                    marginTop: "0.25rem",
                  }}
                >
                  * Automated link generation uses the integrated <strong>Zoom</strong> provider.
                </span>
              </div>

              <div className={styles.formGroup}>
                <label>Recording URL (Optional)</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={recordingUrl}
                  onChange={(e) => setRecordingUrl(e.target.value)}
                />
              </div>

              <div className={styles.formGroup}>
                <label>Post-Session Quiz (Optional)</label>
                <select value={quizId} onChange={(e) => setQuizId(e.target.value)}>
                  <option value="">-- No Quiz --</option>
                  {quizzes.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.title || `Quiz ${q.id.substring(0, 6)}`}
                    </option>
                  ))}
                </select>
              </div>

              {formError && (
                <p
                  role="alert"
                  style={{
                    margin: 0,
                    padding: "0.75rem 1rem",
                    borderRadius: "8px",
                    background: "#fef2f2",
                    color: "#b91c1c",
                    fontSize: "0.85rem",
                    border: "1px solid #fecaca",
                  }}
                >
                  {formError}
                </p>
              )}

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.primaryBtn} disabled={isSaving}>
                  {isSaving ? "Scheduling..." : "Schedule Session"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
