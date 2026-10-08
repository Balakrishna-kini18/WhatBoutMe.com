"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import styles from "../page.module.css";
import { API_URL, errorMessage } from "../lib/api";

interface TrainerInfo {
  id: string;
  name?: string | null;
  email?: string | null;
}

interface Batch {
  id: string;
  name: string;
  capacity?: number;
  program: { id: string; title: string } | string;
  managerId?: string;
  manager?: TrainerInfo | null;
  trainers?: Array<{ trainerId?: string; trainer?: TrainerInfo | null }>;
  enrolments?: Array<{ user?: { id: string; name: string; email: string } }>;
  students?: number;
}

interface Meeting {
  id: string;
  title: string;
  sessionType: "GROUP_COHORT" | "ONE_ON_ONE";
  capacity: number;
  startTime: string;
  endTime: string;
  timezone?: string;
  status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "RESCHEDULED";
  joinUrl: string | null;
  hostTrainer?: TrainerInfo | null;
  learner?: { id: string; name: string; email: string } | null;
  batch?: { id: string; name: string; program: { id: string; title: string } | null } | null;
}

const ALL_COHORTS = "all";

const formatWhen = (start: string, end: string) => {
  const s = new Date(start);
  const e = new Date(end);
  return `${s.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}, ${s.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })} – ${e.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
};

const getProgramTitle = (batch: Batch): string => {
  if (typeof batch.program === "object" && batch.program !== null) {
    return batch.program.title;
  }
  return typeof batch.program === "string" ? batch.program : "Untitled Program";
};

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Filters
  const [filterType, setFilterType] = useState<"ALL" | "GROUP_COHORT" | "ONE_ON_ONE">("ALL");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "SCHEDULED" | "CANCELLED">("ALL");

  // Form State
  const [sessionType, setSessionType] = useState<"GROUP_COHORT" | "ONE_ON_ONE">("GROUP_COHORT");
  const [course, setCourse] = useState("");
  const [cohort, setCohort] = useState(ALL_COHORTS);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("11:00");
  const [capacity, setCapacity] = useState<number>(25);
  const [hostTrainerId, setHostTrainerId] = useState<string>("");
  const [learnerId, setLearnerId] = useState<string>("");
  const [joinUrl, setJoinUrl] = useState("");

  const localTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  }, []);

  const courses = useMemo(
    () => [...new Set(batches.map((b) => getProgramTitle(b)))],
    [batches],
  );

  const cohorts = useMemo(
    () => batches.filter((b) => getProgramTitle(b) === course),
    [batches, course],
  );

  const currentBatch = useMemo(
    () => batches.find((b) => b.id === cohort),
    [batches, cohort],
  );

  // Available trainers for selected cohort
  const availableTrainers = useMemo(() => {
    const list: Array<{ id: string; label: string }> = [];
    if (currentBatch) {
      if (currentBatch.manager) {
        list.push({
          id: currentBatch.manager.id,
          label: `${currentBatch.manager.name || currentBatch.manager.email} (Batch Manager)`,
        });
      }
      if (currentBatch.trainers) {
        currentBatch.trainers.forEach((t) => {
          if (t.trainer && !list.some((item) => item.id === t.trainer?.id)) {
            list.push({
              id: t.trainer.id,
              label: `${t.trainer.name || t.trainer.email} (Cohort Trainer)`,
            });
          }
        });
      }
    }
    return list;
  }, [currentBatch]);

  // Available learners for 1-on-1 session
  const enrolledLearners = useMemo(() => {
    if (!currentBatch || !currentBatch.enrolments) return [];
    return currentBatch.enrolments
      .filter((e) => e.user)
      .map((e) => ({
        id: e.user!.id,
        name: e.user!.name || e.user!.email,
        email: e.user!.email,
      }));
  }, [currentBatch]);

  const load = async () => {
    try {
      const [meetingsRes, batchesRes] = await Promise.all([
        fetch(`${API_URL}/sessions/all`),
        fetch(`${API_URL}/batches`),
      ]);
      if (meetingsRes.ok) setMeetings(await meetingsRes.json());
      if (batchesRes.ok) setBatches(await batchesRes.json());
    } catch (e) {
      console.error("Failed to load meetings", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Sync capacity when cohort or sessionType changes
  useEffect(() => {
    if (sessionType === "ONE_ON_ONE") {
      setCapacity(1);
    } else if (currentBatch?.capacity) {
      setCapacity(currentBatch.capacity);
    }
  }, [sessionType, currentBatch]);

  const openModal = () => {
    const defaultCourse = courses[0] || "";
    setSessionType("GROUP_COHORT");
    setCourse(defaultCourse);
    const initialCohorts = batches.filter((b) => getProgramTitle(b) === defaultCourse);
    const initialCohortId = initialCohorts[0]?.id || ALL_COHORTS;
    setCohort(initialCohortId);
    setTitle("");
    setDate("");
    setStartTime("10:00");
    setEndTime("11:00");
    setCapacity(initialCohorts[0]?.capacity || 25);
    setHostTrainerId("");
    setLearnerId("");
    setJoinUrl("");
    setFormError("");
    setIsModalOpen(true);
  };

  const handleSchedule = async (e: FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!date) {
      setFormError("Please select a session date.");
      return;
    }

    const start = new Date(`${date}T${startTime}`);
    const end = new Date(`${date}T${endTime}`);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      setFormError("Invalid date or time entered.");
      return;
    }

    if (end.getTime() <= start.getTime()) {
      setFormError("Session end time must be strictly after the start time.");
      return;
    }

    const durationMin = (end.getTime() - start.getTime()) / (1000 * 60);
    if (durationMin < 5) {
      setFormError("Session duration must be at least 5 minutes.");
      return;
    }

    if (sessionType === "ONE_ON_ONE" && capacity !== 1) {
      setFormError("1-on-1 coaching sessions must have a capacity of 1.");
      return;
    }

    if (sessionType === "GROUP_COHORT" && capacity < 1) {
      setFormError("Group session capacity must be at least 1.");
      return;
    }

    if (sessionType === "ONE_ON_ONE" && cohort === ALL_COHORTS) {
      setFormError("1-on-1 coaching sessions must be scheduled for a specific cohort.");
      return;
    }

    const targets = cohorts.filter((b) => cohort === ALL_COHORTS || b.id === cohort);
    if (targets.length === 0) {
      setFormError("No cohorts available for this course. Create an active batch first.");
      return;
    }

    setIsSaving(true);
    try {
      for (const target of targets) {
        const payload: Record<string, any> = {
          batchId: target.id,
          title: title.trim(),
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          sessionType,
          capacity: sessionType === "ONE_ON_ONE" ? 1 : Number(capacity),
          meetingProvider: joinUrl.trim() ? undefined : "ZOOM",
        };

        if (joinUrl.trim()) {
          payload.joinUrl = joinUrl.trim();
        }
        if (hostTrainerId) {
          payload.hostTrainerId = hostTrainerId;
        }
        if (sessionType === "ONE_ON_ONE" && learnerId) {
          payload.learnerId = learnerId;
        }

        const res = await fetch(`${API_URL}/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const msg = await errorMessage(
            res,
            `Could not schedule session for cohort ${target.name}`,
          );
          setFormError(msg);
          setIsSaving(false);
          return;
        }
      }

      setIsModalOpen(false);
      load();
    } catch (err) {
      console.error("Failed to schedule session", err);
      setFormError("Could not reach the server. Verify that the API is running.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = async (id: string) => {
    const reason = window.prompt("Reason for cancelling this session:");
    if (reason === null) return;

    try {
      const res = await fetch(`${API_URL}/sessions/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || "Administrative cancellation" }),
      });
      if (res.ok) {
        load();
      } else {
        alert(await errorMessage(res, "Could not cancel the session."));
      }
    } catch (e) {
      console.error(e);
      alert("Failed to communicate with the server.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Permanently delete this session record?")) return;
    try {
      const res = await fetch(`${API_URL}/sessions/${id}`, { method: "DELETE" });
      if (res.ok) {
        load();
      } else {
        alert(await errorMessage(res, "Could not delete session."));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const filteredMeetings = useMemo(() => {
    return meetings.filter((m) => {
      if (filterType !== "ALL" && m.sessionType !== filterType) return false;
      if (filterStatus === "SCHEDULED" && m.status !== "SCHEDULED") return false;
      if (filterStatus === "CANCELLED" && m.status !== "CANCELLED") return false;
      return true;
    });
  }, [meetings, filterType, filterStatus]);

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Live Sessions & Meetings</h1>
          <p className={styles.subtitle}>
            Schedule 1-on-1 coaching and cohort classes. Stored in UTC with automated Zoom link
            generation.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.primaryBtn} onClick={openModal}>
            + Schedule Session
          </button>
        </div>
      </header>

      {/* Filter Toolbar */}
      <div
        style={{
          display: "flex",
          gap: "1rem",
          alignItems: "center",
          marginBottom: "1.25rem",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600 }}>
            Type:
          </span>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            style={{
              padding: "0.4rem 0.75rem",
              borderRadius: "6px",
              border: "1px solid var(--border-light)",
              fontSize: "0.85rem",
            }}
          >
            <option value="ALL">All Types</option>
            <option value="GROUP_COHORT">Group / Cohort</option>
            <option value="ONE_ON_ONE">1-on-1 Coaching</option>
          </select>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600 }}>
            Status:
          </span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            style={{
              padding: "0.4rem 0.75rem",
              borderRadius: "6px",
              border: "1px solid var(--border-light)",
              fontSize: "0.85rem",
            }}
          >
            <option value="ALL">All Statuses</option>
            <option value="SCHEDULED">Scheduled Only</option>
            <option value="CANCELLED">Cancelled Only</option>
          </select>
        </div>

        <div style={{ marginLeft: "auto", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
          Local Timezone: <strong>{localTimezone}</strong> (Timestamps stored in UTC)
        </div>
      </div>

      <section className={styles.tableSection}>
        <div className={styles.sectionHeader}>
          <h2>Scheduled Sessions ({filteredMeetings.length})</h2>
        </div>
        <div className={styles.tableWrapper} style={{ overflowX: "auto" }}>
          <table className={styles.adminTable} style={{ tableLayout: "auto", minWidth: "1100px" }}>
            <thead>
              <tr>
                <th>Session</th>
                <th>Type</th>
                <th>Course & Cohort</th>
                <th>Host Trainer / Learner</th>
                <th>Capacity</th>
                <th>When (Local)</th>
                <th>Meeting Link</th>
                <th>Status</th>
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
              ) : filteredMeetings.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: "20px" }}>
                    No matching sessions found.
                  </td>
                </tr>
              ) : (
                filteredMeetings.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <span className={styles.cellUserName}>{m.title}</span>
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
                            m.sessionType === "ONE_ON_ONE" ? "#ede9fe" : "#e0f2fe",
                          color:
                            m.sessionType === "ONE_ON_ONE" ? "#6d28d9" : "#0369a1",
                        }}
                      >
                        {m.sessionType === "ONE_ON_ONE" ? "1-on-1" : "Cohort"}
                      </span>
                    </td>
                    <td>
                      <span className={styles.cellText}>
                        {m.batch?.program?.title || "—"}
                      </span>
                      <div className={styles.cellTextMuted}>{m.batch?.name || "—"}</div>
                    </td>
                    <td>
                      <span className={styles.cellText}>
                        {m.hostTrainer?.name || m.hostTrainer?.email || "Assigned Trainer"}
                      </span>
                      {m.sessionType === "ONE_ON_ONE" && m.learner && (
                        <div className={styles.cellTextMuted}>
                          Learner: {m.learner.name || m.learner.email}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={styles.cellText}>{m.capacity}</span>
                    </td>
                    <td>
                      <span className={styles.cellText}>{formatWhen(m.startTime, m.endTime)}</span>
                    </td>
                    <td>
                      {m.joinUrl ? (
                        <a
                          href={m.joinUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            color: "var(--accent-primary)",
                            fontWeight: 600,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          Join Meeting ↗
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
                            m.status === "SCHEDULED"
                              ? "#ecfdf5"
                              : m.status === "CANCELLED"
                              ? "#fef2f2"
                              : "#f3f4f6",
                          color:
                            m.status === "SCHEDULED"
                              ? "#047857"
                              : m.status === "CANCELLED"
                              ? "#b91c1c"
                              : "#4b5563",
                        }}
                      >
                        {m.status}
                      </span>
                    </td>
                    <td className={styles.alignRight}>
                      {m.status !== "CANCELLED" && (
                        <>
                          {m.hostUrl && (
                            <a
                              href={m.hostUrl}
                              target="_blank"
                              rel="noreferrer"
                              className={styles.dropdownItem}
                              style={{ width: "auto", display: "inline-block", marginRight: "6px", color: "var(--accent-primary)", fontWeight: 600, textDecoration: "none" }}
                              title="Start session as host"
                            >
                              Start
                            </a>
                          )}
                          <button
                            className={`${styles.dropdownItem} ${styles.textDanger}`}
                            style={{ width: "auto", display: "inline-block", marginRight: "6px" }}
                            onClick={() => handleCancel(m.id)}
                            title="Cancel session with reason"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      <button
                        className={styles.dropdownItem}
                        style={{ width: "auto", display: "inline-block", color: "#6b7280" }}
                        onClick={() => handleDelete(m.id)}
                        title="Delete session"
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

      {/* SCHEDULE SESSION MODAL */}
      {isModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsModalOpen(false)}>
          <div
            className={styles.modalContent}
            style={{ maxWidth: "600px", maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <h2>Schedule Live Session</h2>
                <p className={styles.modalIntro}>
                  Provision live coaching or cohort sessions with Zoom integration.
                </p>
              </div>
              <button className={styles.closeBtn} onClick={() => setIsModalOpen(false)}>
                ×
              </button>
            </div>

            <form className={styles.modalForm} onSubmit={handleSchedule}>
              {/* Session Type Selector */}
              <div className={styles.formGroup}>
                <label>Session Format</label>
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
                      onChange={() => setSessionType("GROUP_COHORT")}
                    />
                    Group Cohort Session
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
                      onChange={() => setSessionType("ONE_ON_ONE")}
                    />
                    1-on-1 Coaching Session
                  </label>
                </div>
              </div>

              {/* Course & Cohort */}
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Course / Program</label>
                  <select
                    required
                    value={course}
                    onChange={(e) => {
                      setCourse(e.target.value);
                      const matching = batches.filter(
                        (b) => getProgramTitle(b) === e.target.value,
                      );
                      setCohort(
                        sessionType === "ONE_ON_ONE"
                          ? matching[0]?.id || ""
                          : ALL_COHORTS,
                      );
                    }}
                  >
                    {courses.length === 0 && (
                      <option value="">No courses with active cohorts</option>
                    )}
                    {courses.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label>Cohort / Batch</label>
                  <select
                    required
                    value={cohort}
                    onChange={(e) => setCohort(e.target.value)}
                  >
                    {sessionType === "GROUP_COHORT" && (
                      <option value={ALL_COHORTS}>All cohorts of this course</option>
                    )}
                    {cohorts.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} (Cap: {b.capacity || 50})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Title */}
              <div className={styles.formGroup}>
                <label>Session Title / Topic</label>
                <input
                  type="text"
                  required
                  placeholder={
                    sessionType === "ONE_ON_ONE"
                      ? "e.g. 1:1 Executive Coaching Review"
                      : "e.g. Step 1 Live Orientation"
                  }
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              {/* Host Trainer & Dedicated Learner (for 1:1) */}
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Host Trainer (Optional)</label>
                  <select
                    value={hostTrainerId}
                    onChange={(e) => setHostTrainerId(e.target.value)}
                  >
                    <option value="">Default (Batch Manager / Signed-in)</option>
                    {availableTrainers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                {sessionType === "ONE_ON_ONE" ? (
                  <div className={styles.formGroup}>
                    <label>Dedicated Learner</label>
                    <select
                      value={learnerId}
                      onChange={(e) => setLearnerId(e.target.value)}
                    >
                      <option value="">Select Enrolled Learner (or open slot)</option>
                      {enrolledLearners.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name} ({l.email})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
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
                )}
              </div>

              {/* Date & Time */}
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Date</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Start Time ({localTimezone})</label>
                  <input
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>End Time ({localTimezone})</label>
                  <input
                    type="time"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>

              {/* Video Provider / Join Link */}
              <div className={styles.formGroup}>
                <label>Meeting Link (Optional)</label>
                <input
                  type="url"
                  placeholder="Leave blank to automatically provision a Zoom meeting via Zoom S2S OAuth"
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
                  * Video integration is enabled for <strong>Zoom</strong>. If left blank, a secure
                  Zoom room and start/join URLs are generated automatically.
                </span>
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
                  Close
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={isSaving}
                >
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
