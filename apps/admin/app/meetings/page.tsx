"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import styles from "../page.module.css";
import { API_URL, errorMessage } from "../lib/api";
import { CustomSelect } from "../components";

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
  hostUrl?: string | null;
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
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Schedule Session</span>
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
          <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)", fontWeight: 600 }}>
            Type:
          </span>
          <CustomSelect
            ariaLabel="Filter meetings by type"
            value={filterType}
            onChange={(val) => setFilterType(val as any)}
            minWidth="165px"
            options={[
              { value: "ALL", label: "All Types" },
              { value: "GROUP_COHORT", label: "Group / Cohort" },
              { value: "ONE_ON_ONE", label: "1-on-1 Coaching" },
            ]}
          />
        </div>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)", fontWeight: 600 }}>
            Status:
          </span>
          <CustomSelect
            ariaLabel="Filter meetings by status"
            value={filterStatus}
            onChange={(val) => setFilterStatus(val as any)}
            minWidth="165px"
            options={[
              { value: "ALL", label: "All Statuses" },
              { value: "SCHEDULED", label: "Scheduled Only" },
              { value: "CANCELLED", label: "Cancelled Only" },
            ]}
          />
        </div>

        <div style={{ marginLeft: "auto", fontSize: "0.8rem", color: "var(--text-muted)", background: "var(--bg-soft)", padding: "0.35rem 0.75rem", borderRadius: "6px", border: "1px solid var(--border-light)" }}>
          Local Timezone: <strong style={{ color: "var(--text-primary)" }}>{localTimezone}</strong> (Timestamps stored in UTC)
        </div>
      </div>

      <section className={styles.tableSection}>
        <div className={styles.sectionHeader}>
          <h2>Scheduled Sessions ({filteredMeetings.length})</h2>
        </div>
        <div className={styles.tableWrapper} style={{ overflowX: "auto" }}>
          <table className={styles.adminTable} style={{ tableLayout: "auto", minWidth: "1050px" }}>
            <thead>
              <tr>
                <th>Session</th>
                <th>Type</th>
                <th>Course &amp; Cohort</th>
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
                  <td colSpan={9} style={{ textAlign: "center", padding: "28px", color: "var(--text-muted)" }}>
                    Loading sessions...
                  </td>
                </tr>
              ) : filteredMeetings.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: "28px", color: "var(--text-muted)" }}>
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
                        className={styles.statusChip}
                        style={{
                          background: m.sessionType === "ONE_ON_ONE" ? "var(--accent-highlight)" : "var(--bg-soft)",
                          color: m.sessionType === "ONE_ON_ONE" ? "var(--accent-primary)" : "var(--text-secondary)",
                        }}
                      >
                        {m.sessionType === "ONE_ON_ONE" ? "1-on-1" : "Cohort"}
                      </span>
                    </td>
                    <td>
                      <span className={styles.cellText} style={{ fontWeight: 600 }}>
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
                            textDecoration: "none",
                            fontSize: "0.82rem",
                          }}
                        >
                          <span>Join Meeting</span>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                        </a>
                      ) : (
                        <span className={styles.cellTextMuted}>None</span>
                      )}
                    </td>
                    <td>
                      <span
                        className={`${styles.statusChip} ${
                          m.status === "SCHEDULED"
                            ? styles.active
                            : m.status === "CANCELLED"
                            ? styles.cancelled
                            : styles.draft
                        }`}
                      >
                        {m.status}
                      </span>
                    </td>
                    <td className={styles.alignRight}>
                      <div style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                        {m.status !== "CANCELLED" && (
                          <>
                            {m.hostUrl && (
                              <a
                                href={m.hostUrl}
                                target="_blank"
                                rel="noreferrer"
                                className={styles.primaryBtnSmall}
                                title="Start session as host"
                              >
                                Start
                              </a>
                            )}
                            <button
                              type="button"
                              className={styles.secondaryBtnSmall}
                              onClick={() => handleCancel(m.id)}
                              title="Cancel session with reason"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className={styles.dangerBtnSmall}
                          onClick={() => handleDelete(m.id)}
                          title="Delete session"
                        >
                          Delete
                        </button>
                      </div>
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
                  <CustomSelect
                    value={course}
                    onChange={(val) => {
                      setCourse(val);
                      const matching = batches.filter(
                        (b) => getProgramTitle(b) === val,
                      );
                      setCohort(
                        sessionType === "ONE_ON_ONE"
                          ? matching[0]?.id || ""
                          : ALL_COHORTS,
                      );
                    }}
                    fullWidth
                    ariaLabel="Course or Program"
                    placeholder="Select course..."
                    options={
                      courses.length === 0
                        ? [{ value: "", label: "No courses with active cohorts", disabled: true }]
                        : courses.map((c) => ({ value: c, label: c }))
                    }
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Cohort / Batch</label>
                  <CustomSelect
                    value={cohort}
                    onChange={(val) => setCohort(val)}
                    fullWidth
                    ariaLabel="Cohort or Batch"
                    options={[
                      ...(sessionType === "GROUP_COHORT"
                        ? [{ value: ALL_COHORTS, label: "All cohorts of this course" }]
                        : []),
                      ...cohorts.map((b) => ({
                        value: b.id,
                        label: `${b.name} (Cap: ${b.capacity || 50})`,
                      })),
                    ]}
                  />
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
                  <CustomSelect
                    value={hostTrainerId}
                    onChange={(val) => setHostTrainerId(val)}
                    fullWidth
                    ariaLabel="Host Trainer"
                    options={[
                      { value: "", label: "Default (Batch Manager / Signed-in)" },
                      ...availableTrainers.map((t) => ({ value: t.id, label: t.label })),
                    ]}
                  />
                </div>

                {sessionType === "ONE_ON_ONE" ? (
                  <div className={styles.formGroup}>
                    <label>Dedicated Learner</label>
                    <CustomSelect
                      value={learnerId}
                      onChange={(val) => setLearnerId(val)}
                      fullWidth
                      ariaLabel="Dedicated Learner"
                      options={[
                        { value: "", label: "Select Enrolled Learner (or open slot)" },
                        ...enrolledLearners.map((l) => ({
                          value: l.id,
                          label: `${l.name} (${l.email})`,
                        })),
                      ]}
                    />
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
