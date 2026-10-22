"use client";

import { useEffect, useState, useMemo, use } from "react";
import styles from "../../../page.module.css";
import Link from "next/link";
import { API_URL, errorMessage, detectCalendarConflict } from "../../../lib/api";
import {
  getTimezoneOptions,
  getSystemTimezone,
  localWallTimeToUtc,
  formatWhenInTz,
  formatShortTimeInTz,
} from "../../../lib/timezone";
import { CustomSelect, ConfirmDialog, InputDialog, useToast, TableSkeleton, EmptyState } from "../../../components";

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
  _count?: { attendances?: number; bookings?: number };
}

export default function BatchSessionsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const batchId = resolvedParams.id;
  const { success: toastSuccess, error: toastError } = useToast();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [allSessions, setAllSessions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [cancellingSessionId, setCancellingSessionId] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Timezone state
  const [displayTimezone, setDisplayTimezone] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("wbm_display_tz");
      if (saved) return saved;
    }
    return getSystemTimezone();
  });
  const timezoneOptions = useMemo(() => getTimezoneOptions(), []);

  // Form state
  const [sessionType, setSessionType] = useState<"GROUP_COHORT" | "ONE_ON_ONE">("GROUP_COHORT");
  const [title, setTitle] = useState("");
  const [sessionDate, setSessionDate] = useState("");
  const [sessionStartTime, setSessionStartTime] = useState("10:00");
  const [sessionEndTime, setSessionEndTime] = useState("11:00");
  const [capacity, setCapacity] = useState<number>(50);
  const [joinUrl, setJoinUrl] = useState("");
  const [recordingUrl, setRecordingUrl] = useState("");
  const [quizId, setQuizId] = useState("");
  const [hostTrainerId, setHostTrainerId] = useState("");
  const [quizzes, setQuizzes] = useState<{ id: string; title: string }[]>([]);
  const [trainers, setTrainers] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    Promise.all([
      fetchSessions(controller.signal),
      fetchAllSessions(controller.signal),
      fetchQuizzes(controller.signal),
      fetchTrainers(controller.signal),
    ]).finally(() => {
      setIsLoading(false);
    });
    return () => controller.abort();
  }, [batchId]);

  const fetchAllSessions = async (signal?: AbortSignal) => {
    try {
      const res = await fetch(`${API_URL}/sessions/all`, { signal });
      if (res.ok) {
        const data = await res.json();
        setAllSessions(Array.isArray(data) ? data : []);
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") console.error("Failed to fetch all sessions", e);
    }
  };

  const fetchQuizzes = async (signal?: AbortSignal) => {
    try {
      const res = await fetch(`${API_URL}/quizzes`, { signal });
      if (res.ok) {
        const data = await res.json();
        setQuizzes(data);
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        console.error("Failed to fetch quizzes", e);
      }
    }
  };

  const fetchTrainers = async (signal?: AbortSignal) => {
    try {
      // D1-043: Load available trainers
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/users?limit=1000`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal,
      });
      if (res.ok) {
        const result = await res.json();
        const userList = Array.isArray(result.data)
          ? result.data
          : Array.isArray(result)
          ? result
          : (result.users || []);
        setTrainers(
          userList.filter((u: any) =>
            ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(u.role)
          )
        );
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        console.error("Failed to fetch trainers", e);
      }
    }
  };

  const fetchSessions = async (signal?: AbortSignal) => {
    try {
      const res = await fetch(`${API_URL}/sessions?batchId=${batchId}`, { signal });
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        console.error(e);
      }
    }
  };

  const confirmCancelSession = async (reason: string) => {
    if (!cancellingSessionId) return;
    const targetId = cancellingSessionId;
    const previousSessions = sessions;

    // Optimistic UI update: immediately mark session status as CANCELLED
    setSessions((prev) =>
      prev.map((s) => (s.id === targetId ? { ...s, status: "CANCELLED" as const } : s))
    );
    toastSuccess("Session cancelled successfully.");
    setCancellingSessionId(null);
    setIsCancelling(true);
    setCancelError(null);

    try {
      const res = await fetch(`${API_URL}/sessions/${targetId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || "Administrative cancellation" }),
      });
      if (!res.ok) {
        // Rollback on server error
        setSessions(previousSessions);
        const err = await errorMessage(res, "Failed to cancel session.");
        setCancelError(err);
        toastError(err);
      } else {
        fetchSessions();
      }
    } catch (e) {
      setSessions(previousSessions);
      console.error(e);
      setCancelError("Failed to communicate with server.");
      toastError("Failed to communicate with server.");
    } finally {
      setIsCancelling(false);
    }
  };

  const confirmDeleteSession = async () => {
    if (!deletingSessionId) return;
    const targetId = deletingSessionId;
    const previousSessions = sessions;

    // Optimistic UI update: immediately remove from sessions array
    setSessions((prev) => prev.filter((s) => s.id !== targetId));
    toastSuccess("Session record permanently deleted.");
    setDeletingSessionId(null);
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const res = await fetch(`${API_URL}/sessions/${targetId}`, { method: "DELETE" });
      if (!res.ok) {
        // Rollback on server error
        setSessions(previousSessions);
        const err = await errorMessage(res, "Failed to delete session.");
        setDeleteError(err);
        toastError(err);
      } else {
        fetchSessions();
      }
    } catch (e) {
      setSessions(previousSessions);
      console.error(e);
      setDeleteError("Failed to communicate with server.");
      toastError("Failed to communicate with server.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!sessionDate) {
      setFormError("Please select a session date.");
      return;
    }

    const start = localWallTimeToUtc(sessionDate, sessionStartTime, displayTimezone);
    const end = localWallTimeToUtc(sessionDate, sessionEndTime, displayTimezone);

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

    // Roweena's Unified Calendar Double-Booking Conflict Detection
    const conflictCheck = detectCalendarConflict(
      allSessions,
      start,
      end,
      hostTrainerId || null,
      null,
    );

    if (conflictCheck.hasConflict && conflictCheck.conflictingSession) {
      const c = conflictCheck.conflictingSession;
      setFormError(
        `Scheduling Conflict Detected: Coach/Trainer already has commitment "${c.title}" scheduled from ${formatShortTimeInTz(c.startTime, displayTimezone)} to ${formatShortTimeInTz(c.endTime, displayTimezone)} (${displayTimezone}). Please select another time slot.`
      );
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
        hostTrainerId: hostTrainerId || undefined,
      };

      const res = await fetch(`${API_URL}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toastSuccess("Session scheduled and synchronized with unified calendar.");
        setIsModalOpen(false);
        setTitle("");
        setSessionDate("");
        setSessionStartTime("10:00");
        setSessionEndTime("11:00");
        setCapacity(50);
        setJoinUrl("");
        setRecordingUrl("");
        setQuizId("");
        setHostTrainerId("");
        fetchSessions();
        fetchAllSessions();
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
        <div className={styles.headerActions} style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          {/* Timezone Selector */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.45rem",
              fontSize: "0.8125rem",
              color: "var(--text-secondary, #4a443d)",
              background: "var(--bg-card-muted, #fdfbf7)",
              padding: "0.4rem 0.75rem",
              borderRadius: "8px",
              border: "1px solid var(--border-light, #ece4d7)",
            }}
            title="Display timezone · Preserves underlying UTC instant"
          >
            <span style={{ width: "7px", height: "7px", background: "#16a34a", borderRadius: "50%", display: "inline-block" }} />
            <select
              aria-label="Display timezone"
              value={displayTimezone}
              onChange={(e) => {
                setDisplayTimezone(e.target.value);
                if (typeof window !== "undefined") {
                  localStorage.setItem("wbm_display_tz", e.target.value);
                }
              }}
              style={{
                background: "transparent",
                border: "none",
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: "var(--text-primary, #14110f)",
                cursor: "pointer",
                outline: "none",
              }}
            >
              {timezoneOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <Link href="/meetings" className={styles.secondaryBtn} style={{ textDecoration: "none" }}>
            View Full Calendar
          </Link>
          <button
            className={styles.primaryBtn}
            onClick={() => {
              setFormError("");
              setSessionDate(new Date().toISOString().split("T")[0] || "");
              setSessionStartTime("10:00");
              setSessionEndTime("11:00");
              setIsModalOpen(true);
            }}
          >
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
                <th>Host Trainer</th>
                <th>Capacity</th>
                <th>Attendance</th>
                <th>When ({displayTimezone.split("/").pop() || displayTimezone})</th>
                <th>Meeting Link</th>
                <th>Status</th>
                <th>Recording / Quiz</th>
                <th className={styles.alignRight}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableSkeleton columns={10} rows={5} />
              ) : sessions.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: "32px 16px" }}>
                    <EmptyState
                      icon="calendar"
                      title="No sessions scheduled yet"
                      description="Create the live curriculum schedule for this cohort batch."
                      actionLabel="Schedule First Session"
                      onAction={() => setIsModalOpen(true)}
                    />
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
                      <span className={styles.cellText}>{s.hostTrainer?.name || '—'}</span>
                    </td>
                    <td>
                      <span className={styles.cellText}>{s.capacity}</span>
                    </td>
                    <td>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "0.2rem 0.5rem",
                          borderRadius: "4px",
                          fontSize: "0.78rem",
                          fontWeight: 700,
                          background: (s._count?.attendances ?? 0) > 0 ? "#ecfdf5" : "#f1f5f9",
                          color: (s._count?.attendances ?? 0) > 0 ? "#047857" : "#64748b",
                        }}
                      >
                        {s._count?.attendances ?? 0} logged
                      </span>
                    </td>
                    <td>
                      <span className={styles.cellText} style={{ whiteSpace: "nowrap", fontSize: "0.82rem", fontWeight: 500 }}>
                        {formatWhenInTz(s.startTime, s.endTime, displayTimezone)}
                      </span>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                        {displayTimezone}
                      </div>
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
                          marginRight: "6px",
                          textDecoration: "none",
                          display: "inline-block",
                          padding: "0.35rem 0.65rem",
                          fontSize: "0.8rem",
                        }}
                      >
                        Attendance ({s._count?.attendances ?? 0})
                      </Link>
                      <Link
                        href={`/batches/${batchId}/sessions/${s.id}/reconciliation`}
                        className={styles.secondaryBtn}
                        style={{
                          marginRight: "6px",
                          textDecoration: "none",
                          display: "inline-block",
                          padding: "0.35rem 0.65rem",
                          fontSize: "0.8rem",
                        }}
                      >
                        Reconcile
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
                          onClick={() => setCancellingSessionId(s.id)}
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
                        onClick={() => setDeletingSessionId(s.id)}
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

              <div className={styles.formGroup}>
                <label>Host Trainer (D1-043)</label>
                <CustomSelect
                  value={hostTrainerId}
                  onChange={setHostTrainerId}
                  fullWidth
                  ariaLabel="Host Trainer"
                  placeholder="-- Select Trainer --"
                  options={[
                    { value: "", label: "-- Select Trainer --" },
                    ...trainers.map((t) => ({ value: t.id, label: t.name })),
                  ]}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
                <div className={styles.formGroup}>
                  <label>Session Date</label>
                  <input
                    type="date"
                    required
                    value={sessionDate}
                    onChange={(e) => setSessionDate(e.target.value)}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Start ({displayTimezone.split("/").pop()})</label>
                  <input
                    type="time"
                    required
                    value={sessionStartTime}
                    onChange={(e) => setSessionStartTime(e.target.value)}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>End ({displayTimezone.split("/").pop()})</label>
                  <input
                    type="time"
                    required
                    value={sessionEndTime}
                    onChange={(e) => setSessionEndTime(e.target.value)}
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
                <CustomSelect
                  value={quizId}
                  onChange={setQuizId}
                  fullWidth
                  ariaLabel="Post-Session Quiz"
                  placeholder="-- No Quiz --"
                  options={[
                    { value: "", label: "-- No Quiz --" },
                    ...quizzes.map((q) => ({
                      value: q.id,
                      label: q.title || `Quiz ${q.id.substring(0, 6)}`,
                    })),
                  ]}
                />
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

      {/* InputDialog for Cancellation */}
      <InputDialog
        isOpen={Boolean(cancellingSessionId)}
        onClose={() => {
          if (!isCancelling) setCancellingSessionId(null);
        }}
        onSubmit={confirmCancelSession}
        title="Cancel Live Session?"
        subtitle="Cohort session status will be updated"
        description="Provide a cancellation reason. Attendance records will note the cancellation."
        label="Cancellation Reason"
        placeholder="e.g., Scheduling conflict, national holiday, trainer ill"
        confirmText={isCancelling ? "Cancelling..." : "Cancel Session"}
        cancelText="Keep Session"
        tone="danger"
        isLoading={isCancelling}
        error={cancelError}
      />

      {/* ConfirmDialog for Deletion */}
      <ConfirmDialog
        isOpen={Boolean(deletingSessionId)}
        onClose={() => {
          if (!isDeleting) setDeletingSessionId(null);
        }}
        onConfirm={confirmDeleteSession}
        title="Permanently Delete Session?"
        description="Are you sure you want to permanently delete this session record? This action cannot be undone."
        tone="danger"
        confirmText={isDeleting ? "Deleting..." : "Delete Permanently"}
        cancelText="Cancel"
        isLoading={isDeleting}
        error={deleteError}
        callout={{
          tone: "warning",
          text: "All associated attendance records and Zoom links will be deleted.",
        }}
      />
    </div>
  );
}
