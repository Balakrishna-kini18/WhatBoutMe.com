"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import styles from "../page.module.css";
import { API_URL, errorMessage } from "../lib/api";

interface Batch {
  id: string;
  name: string;
  program: string;
  students: number;
}

interface Meeting {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  joinUrl: string | null;
  batch: { id: string; name: string; program: { id: string; title: string } | null };
}

const ALL_COHORTS = "all";

const formatWhen = (start: string, end: string) => {
  const s = new Date(start);
  const e = new Date(end);
  return `${s.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}, ${s.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} – ${e.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
};

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // form
  const [course, setCourse] = useState("");
  const [cohort, setCohort] = useState(ALL_COHORTS);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("11:00");
  const [joinUrl, setJoinUrl] = useState("");

  const courses = useMemo(() => [...new Set(batches.map((b) => b.program))], [batches]);
  const cohorts = useMemo(() => batches.filter((b) => b.program === course), [batches, course]);
  const learners = cohorts
    .filter((b) => cohort === ALL_COHORTS || b.id === cohort)
    .reduce((sum, b) => sum + b.students, 0);

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

  const openModal = () => {
    setCourse(courses[0] || "");
    setCohort(ALL_COHORTS);
    setTitle("");
    setDate("");
    setStartTime("10:00");
    setEndTime("11:00");
    setJoinUrl("");
    setFormError("");
    setIsModalOpen(true);
  };

  const handleSchedule = async (e: FormEvent) => {
    e.preventDefault();
    setFormError("");
    const start = new Date(`${date}T${startTime}`);
    const end = new Date(`${date}T${endTime}`);
    if (!(end > start)) {
      setFormError("The end time must be after the start time.");
      return;
    }
    const targets = cohorts.filter((b) => cohort === ALL_COHORTS || b.id === cohort);
    if (targets.length === 0) {
      setFormError("This course has no cohort yet. Create a batch for it first.");
      return;
    }

    setIsSaving(true);
    try {
      // one meeting per cohort; the API reminds each cohort's learners
      for (const target of targets) {
        const res = await fetch(`${API_URL}/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            batchId: target.id,
            title: title.trim(),
            startTime: start.toISOString(),
            endTime: end.toISOString(),
            ...(joinUrl.trim() ? { joinUrl: joinUrl.trim() } : {}),
          }),
        });
        if (!res.ok) {
          setFormError(await errorMessage(res, `Could not schedule the meeting for ${target.name}`));
          return;
        }
      }
      setIsModalOpen(false);
      load();
    } catch (err) {
      console.error("Failed to schedule meeting", err);
      setFormError("Could not reach the server. Check that the API is running.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Cancel this meeting? Learners will no longer see it.")) return;
    const res = await fetch(`${API_URL}/sessions/${id}`, { method: "DELETE" });
    if (res.ok) load();
  };

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Meetings</h1>
          <p className={styles.subtitle}>Schedule live sessions by course. Learners with access to the course get a reminder.</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.primaryBtn} onClick={openModal}>+ Schedule Meeting</button>
        </div>
      </header>

      <section className={styles.tableSection}>
        <div className={styles.sectionHeader}>
          <h2>All Meetings</h2>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Meeting</th>
                <th>Course</th>
                <th>Cohort</th>
                <th>When</th>
                <th>Join Link</th>
                <th className={styles.alignRight}>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: "20px" }}>Loading meetings...</td></tr>
              ) : meetings.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: "20px" }}>No meetings scheduled yet.</td></tr>
              ) : meetings.map((m) => (
                <tr key={m.id}>
                  <td><span className={styles.cellUserName}>{m.title}</span></td>
                  <td><span className={styles.cellText}>{m.batch.program?.title || "—"}</span></td>
                  <td><span className={styles.cellTextMuted}>{m.batch.name}</span></td>
                  <td><span className={styles.cellText}>{formatWhen(m.startTime, m.endTime)}</span></td>
                  <td>
                    {m.joinUrl ? (
                      <a href={m.joinUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent-primary)", fontWeight: 600 }}>Open link</a>
                    ) : (
                      <span className={styles.cellTextMuted}>None</span>
                    )}
                  </td>
                  <td className={styles.alignRight}>
                    <button className={`${styles.dropdownItem} ${styles.textDanger}`} style={{ width: "auto" }} onClick={() => handleDelete(m.id)}>Cancel</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {isModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsModalOpen(false)}>
          <div className={styles.modalContent} style={{ maxWidth: "560px", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Schedule Meeting</h2>
              <button className={styles.closeBtn} onClick={() => setIsModalOpen(false)}>×</button>
            </div>

            <form className={styles.modalForm} onSubmit={handleSchedule}>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Course</label>
                  <select required value={course} onChange={(e) => { setCourse(e.target.value); setCohort(ALL_COHORTS); }}>
                    {courses.length === 0 && <option value="">No courses with a cohort</option>}
                    {courses.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label>Cohort</label>
                  <select value={cohort} onChange={(e) => setCohort(e.target.value)}>
                    <option value={ALL_COHORTS}>All cohorts of this course</option>
                    {cohorts.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Meeting Title</label>
                <input type="text" required placeholder="e.g. Day 1 Live Session" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Date</label>
                  <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div className={styles.formGroup}>
                  <label>Start</label>
                  <input type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </div>
                <div className={styles.formGroup}>
                  <label>End</label>
                  <input type="time" required value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Join Link (optional)</label>
                <input type="url" placeholder="Leave blank to create a Zoom link automatically" value={joinUrl} onChange={(e) => setJoinUrl(e.target.value)} />
              </div>

              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                {learners} {learners === 1 ? "learner" : "learners"} with access will be reminded in the learner portal.
              </p>

              {formError && (
                <p role="alert" style={{ margin: 0, padding: "0.75rem 1rem", borderRadius: "8px", background: "#fef2f2", color: "#b91c1c", fontSize: "0.85rem" }}>{formError}</p>
              )}

              <div className={styles.modalFooter}>
                <button type="button" className={styles.secondaryBtn} onClick={() => setIsModalOpen(false)}>Close</button>
                <button type="submit" className={styles.primaryBtn} disabled={isSaving}>{isSaving ? "Scheduling..." : "Schedule Meeting"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
