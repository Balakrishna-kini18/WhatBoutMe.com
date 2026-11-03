"use client";

import { useEffect, useState, useMemo, use, useCallback } from "react";
import styles from "../../../page.module.css";
import Link from "next/link";
import {
  API_URL,
  errorMessage,
  detectCalendarConflict,
  getBatchSessions,
  getBatchById,
  createSession,
  updateSession,
  cancelSession,
  deleteSession,
  apiGet,
} from "../../../lib/api";
import {
  getTimezoneOptions,
  getSystemTimezone,
  localWallTimeToUtc,
  utcToWallClock,
  formatWhenInTz,
  formatShortTimeInTz,
} from "../../../lib/timezone";
import {
  CustomSelect,
  ConfirmDialog,
  InputDialog,
  ActionMenu,
  useToast,
  TableSkeleton,
  EmptyState,
} from "../../../components";

interface Session {
  id: string;
  title: string;
  sessionType: "GROUP_COHORT" | "ONE_ON_ONE";
  capacity: number;
  minAttendanceMinutes?: number | null;
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

  const [batch, setBatch] = useState<any | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [allSessions, setAllSessions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Modal state (Create & Edit)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Cancel & Delete dialog state
  const [cancellingSessionId, setCancellingSessionId] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Timezone state
  const [displayTimezone, setDisplayTimezone] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("wbm_display_tz");
      if (saved) return saved;
    }
    return getSystemTimezone();
  });
  const timezoneOptions = useMemo(() => getTimezoneOptions(), []);

  // Form field state
  const [sessionType, setSessionType] = useState<"GROUP_COHORT" | "ONE_ON_ONE">("GROUP_COHORT");
  const [title, setTitle] = useState("");
  const [sessionDate, setSessionDate] = useState("");
  const [sessionStartTime, setSessionStartTime] = useState("10:00");
  const [sessionEndTime, setSessionEndTime] = useState("11:00");
  const [capacity, setCapacity] = useState<number>(50);
  const [minAttendanceMinutes, setMinAttendanceMinutes] = useState<number | "">("");
  const [joinUrl, setJoinUrl] = useState("");
  const [recordingUrl, setRecordingUrl] = useState("");
  const [quizId, setQuizId] = useState("");
  const [hostTrainerId, setHostTrainerId] = useState("");
  const [quizzes, setQuizzes] = useState<{ id: string; title: string }[]>([]);
  const [trainers, setTrainers] = useState<{ id: string; name: string }[]>([]);

  const loadInitialData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [batchData, sessionData] = await Promise.all([
        getBatchById(batchId).catch((err) => {
          console.warn("[BatchSessionsPage] Failed to fetch batch metadata:", err.message);
          return null;
        }),
        getBatchSessions(batchId),
      ]);

      if (batchData) {
        setBatch(batchData);
      }
      const sessionList = Array.isArray(sessionData)
        ? sessionData
        : (sessionData as any)?.sessions || (sessionData as any)?.data || [];
      setSessions(sessionList);
    } catch (err: any) {
      console.error("[BatchSessionsPage] Error loading batch sessions:", err);
      setLoadError(err?.message || "Failed to load sessions for this batch.");
    } finally {
      setIsLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    loadInitialData();

    const controller = new AbortController();
    fetchQuizzes(controller.signal);
    fetchTrainers(controller.signal);
    fetchAllSessions(controller.signal);

    return () => controller.abort();
  }, [loadInitialData]);

  const fetchAllSessions = async (signal?: AbortSignal) => {
    try {
      const data = await apiGet<any[]>('/sessions/all', { signal }).catch(() => []);
      setAllSessions(Array.isArray(data) ? data : []);
    } catch (e: any) {
      if (e?.name !== "AbortError") console.error("Failed to fetch all sessions", e);
    }
  };

  const fetchQuizzes = async (signal?: AbortSignal) => {
    try {
      const data = await apiGet<{ id: string; title: string }[]>('/quizzes', { signal }).catch(() => []);
      setQuizzes(Array.isArray(data) ? data : []);
    } catch (e: any) {
      if (e?.name !== "AbortError") console.error("Failed to fetch quizzes", e);
    }
  };

  const fetchTrainers = async (signal?: AbortSignal) => {
    try {
      const result = await apiGet<any>('/users?limit=1000', { signal }).catch(() => []);
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
    } catch (e: any) {
      if (e?.name !== "AbortError") console.error("Failed to fetch trainers", e);
    }
  };

  const fetchSessions = async () => {
    try {
      const data = await getBatchSessions(batchId);
      const sessionList = Array.isArray(data) ? data : (data as any)?.sessions || [];
      setSessions(sessionList);
    } catch (e: any) {
      console.error("[BatchSessionsPage] Failed to reload sessions:", e);
    }
  };

  const openCreateModal = () => {
    setEditingSessionId(null);
    setTitle("");
    setSessionType("GROUP_COHORT");
    setSessionDate(new Date().toISOString().split("T")[0] || "");
    setSessionStartTime("10:00");
    setSessionEndTime("11:00");
    setCapacity(batch?.capacity || 50);
    setMinAttendanceMinutes("");
    setHostTrainerId(batch?.managerId || "");
    setJoinUrl("");
    setRecordingUrl("");
    setQuizId("");
    setFormError("");
    setIsModalOpen(true);
  };

  const openEditModal = (s: Session) => {
    setEditingSessionId(s.id);
    setTitle(s.title);
    setSessionType(s.sessionType);
    const { date, time: startT } = utcToWallClock(s.startTime, displayTimezone);
    const { time: endT } = utcToWallClock(s.endTime, displayTimezone);
    setSessionDate(date);
    setSessionStartTime(startT);
    setSessionEndTime(endT);
    setCapacity(s.capacity);
    setMinAttendanceMinutes(s.minAttendanceMinutes ?? "");
    setHostTrainerId(s.hostTrainer?.id || "");
    setJoinUrl(s.joinUrl || "");
    setRecordingUrl(s.recordingUrl || "");
    setQuizId(s.quizId || "");
    setFormError("");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingSessionId(null);
    setFormError("");
  };

  const confirmCancelSession = async (reason: string) => {
    if (!cancellingSessionId) return;
    const targetId = cancellingSessionId;
    const previousSessions = sessions;

    // Optimistic UI update
    setSessions((prev) =>
      prev.map((s) => (s.id === targetId ? { ...s, status: "CANCELLED" as const } : s))
    );
    toastSuccess("Session cancelled successfully.");
    setCancellingSessionId(null);
    setIsCancelling(true);
    setCancelError(null);

    try {
      await cancelSession(targetId, reason.trim() || "Administrative cancellation");
      fetchSessions();
    } catch (e: any) {
      setSessions(previousSessions);
      console.error(e);
      const err = e?.message || "Failed to cancel session.";
      setCancelError(err);
      toastError(err);
    } finally {
      setIsCancelling(false);
    }
  };

  const confirmDeleteSession = async () => {
    if (!deletingSessionId) return;
    const targetId = deletingSessionId;
    const previousSessions = sessions;

    // Optimistic UI update
    setSessions((prev) => prev.filter((s) => s.id !== targetId));
    toastSuccess("Session deleted permanently.");
    setDeletingSessionId(null);
    setIsDeleting(true);
    setDeleteError(null);

    try {
      await deleteSession(targetId);
      fetchSessions();
    } catch (e: any) {
      setSessions(previousSessions);
      console.error(e);
      const err = e?.message || "Failed to delete session.";
      setDeleteError(err);
      toastError(err);
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
      setFormError("End time must be after start time.");
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
      editingSessionId || null
    );

    if (conflictCheck.hasConflict && conflictCheck.conflictingSession) {
      const c = conflictCheck.conflictingSession;
      setFormError(
        `Scheduling Conflict: Trainer already has "${c.title}" from ${formatShortTimeInTz(c.startTime, displayTimezone)} to ${formatShortTimeInTz(c.endTime, displayTimezone)} (${displayTimezone}). Please choose another slot.`
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
        minAttendanceMinutes: minAttendanceMinutes !== "" ? Number(minAttendanceMinutes) : undefined,
        joinUrl: joinUrl.trim() || undefined,
        recordingUrl: recordingUrl.trim() || undefined,
        quizId: quizId || undefined,
        hostTrainerId: hostTrainerId || undefined,
      };

      if (editingSessionId) {
        await updateSession(editingSessionId, payload);
        toastSuccess("Session updated successfully.");
      } else {
        if (!joinUrl.trim()) {
          payload.meetingProvider = "ZOOM";
        }
        await createSession(payload as any);
        toastSuccess("Session scheduled successfully.");
      }

      closeModal();
      fetchSessions();
      fetchAllSessions();
    } catch (error: any) {
      console.error(error);
      setFormError(error?.message || "Failed to save session.");
    } finally {
      setIsSaving(false);
    }
  };

  const getAttendanceCount = (s: Session) => {
    const recordCount = s._count?.attendances ?? 0;
    if (recordCount === 0) {
      // No attendance records at all — not yet taken
      return "Not taken";
    }
    // recordCount includes all statuses (PRESENT, ABSENT, EXCUSED, etc.)
    // We show the count as "N records" — the exact present/absent breakdown
    // is visible on the attendance detail page.
    const total = batch?.enrolledCount || s.capacity;
    if (typeof total === "number" && total > 0) {
      return `${recordCount}/${total} recorded`;
    }
    return `${recordCount} recorded`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "SCHEDULED":
        return {
          label: "Scheduled",
          bg: "rgba(16, 185, 129, 0.1)",
          color: "#059669",
          border: "rgba(16, 185, 129, 0.25)",
        };
      case "IN_PROGRESS":
        return {
          label: "In Progress",
          bg: "rgba(59, 130, 246, 0.1)",
          color: "#2563eb",
          border: "rgba(59, 130, 246, 0.25)",
        };
      case "COMPLETED":
        return {
          label: "Completed",
          bg: "rgba(100, 116, 139, 0.1)",
          color: "#475569",
          border: "rgba(100, 116, 139, 0.25)",
        };
      case "CANCELLED":
        return {
          label: "Cancelled",
          bg: "rgba(239, 68, 68, 0.1)",
          color: "#dc2626",
          border: "rgba(239, 68, 68, 0.25)",
        };
      case "RESCHEDULED":
        return {
          label: "Rescheduled",
          bg: "rgba(245, 158, 11, 0.1)",
          color: "#d97706",
          border: "rgba(245, 158, 11, 0.25)",
        };
      default:
        return {
          label: status,
          bg: "#f3f4f6",
          color: "#4b5563",
          border: "#e5e7eb",
        };
    }
  };

  return (
    <div className={styles.dashboard}>
      {/* SIMPLIFIED HEADER */}
      <header className={styles.header}>
        <div className={styles.headerText}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <Link
              href="/batches"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                color: "var(--accent-primary, #c97a1e)",
                textDecoration: "none",
                fontSize: "0.875rem",
                fontWeight: 600,
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Batches
            </Link>
            <span style={{ color: "var(--border-dark, #d1c7b7)", fontSize: "0.85rem" }}>/</span>
            <h1 className={styles.title} style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700 }}>
              Sessions &amp; Attendance
            </h1>
          </div>
          {batch?.name && (
            <p className={styles.subtitle} style={{ margin: 0, fontSize: "0.875rem" }}>
              <span>
                Cohort: <strong style={{ color: "var(--text-primary, #1c1917)" }}>{batch.name}</strong>
                {batch?.program?.title && ` · Program: ${batch.program.title}`}
                {typeof batch?.enrolledCount === "number" && ` · ${batch.enrolledCount} enrolled`}
              </span>
            </p>
          )}
          {/* {!batch?.name && (
            <p className={styles.subtitle} style={{ margin: 0, fontSize: "0.875rem" }}>
              Manage live sessions, record attendance, and reconcile participant data.
            </p>
          )} */}
        </div>

        <div className={styles.headerActions} style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          {/* Timezone Selector — uses CustomSelect for brand consistency */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }} title="Display timezone">
            <span style={{ width: "6px", height: "6px", background: "#16a34a", borderRadius: "50%", display: "inline-block", flexShrink: 0 }} />
            <CustomSelect
              ariaLabel="Display timezone"
              value={displayTimezone}
              onChange={(val) => {
                setDisplayTimezone(val);
                if (typeof window !== "undefined") {
                  localStorage.setItem("wbm_display_tz", val);
                }
              }}
              options={timezoneOptions}
              minWidth="190px"
              size="sm"
            />
          </div>

          {/* Calendar link */}
          <Link
            href="/meetings"
            className={styles.secondaryBtn}
            style={{
              textDecoration: "none",
              fontSize: "0.8125rem",
              padding: "0.45rem 0.85rem",
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Calendar
          </Link>

          {/* Prominent Primary Action */}
          <button
            className={styles.primaryBtn}
            onClick={openCreateModal}
            style={{ fontSize: "0.875rem", padding: "0.45rem 1rem" }}
          >
            + Schedule Session
          </button>
        </div>
      </header>

      {/* STREAMLINED TABLE */}
      <section className={styles.tableSection}>
        <div className={styles.tableWrapper} style={{ overflowX: "auto" }}>
          <table className={styles.adminTable} style={{ width: "100%", tableLayout: "auto" }}>
            <thead>
              <tr>
                <th style={{ minWidth: "200px" }}>Session</th>
                <th style={{ width: "210px", minWidth: "180px" }}>Date &amp; Time</th>
                <th style={{ width: "140px", minWidth: "120px" }}>Trainer</th>
                <th style={{ width: "120px", minWidth: "100px" }}>Meeting</th>
                <th style={{ width: "130px", minWidth: "110px" }}>Attendance</th>
                <th style={{ width: "110px", minWidth: "95px" }}>Status</th>
                <th style={{ width: "90px", minWidth: "80px" }} className={styles.alignRight}>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableSkeleton columns={7} rows={5} />
              ) : loadError ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "36px 24px", color: "#b91c1c" }}>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.45rem",
                        fontWeight: 600,
                        marginBottom: "0.5rem",
                      }}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ flexShrink: 0 }}
                        aria-hidden="true"
                      >
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                      <span>{loadError}</span>
                    </div>
                    <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
                      <button
                        type="button"
                        className={styles.secondaryBtn}
                        onClick={() => loadInitialData()}
                        style={{ fontSize: "0.8125rem", padding: "0.35rem 0.75rem" }}
                      >
                        Retry
                      </button>
                      <Link
                        href="/batches"
                        className={styles.secondaryBtn}
                        style={{ textDecoration: "none", fontSize: "0.8125rem", padding: "0.35rem 0.75rem" }}
                      >
                        Return to Batches
                      </Link>
                    </div>
                  </td>
                </tr>
              ) : sessions.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: "32px 16px" }}>
                    <EmptyState
                      icon="calendar"
                      title="No sessions scheduled yet"
                      description="Create the live curriculum schedule for this cohort batch."
                      actionLabel="Schedule First Session"
                      onAction={openCreateModal}
                    />
                  </td>
                </tr>
              ) : (
                sessions.map((s) => {
                  const badge = getStatusBadge(s.status);
                  const isCompleted = s.status === "COMPLETED";

                  return (
                    <tr key={s.id}>
                      {/* Session Topic & Format */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          <span className={styles.cellUserName} style={{ fontSize: "0.92rem", fontWeight: 600 }}>
                            {s.title}
                          </span>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                            {/* Format Pill */}
                            <span
                              style={{
                                display: "inline-block",
                                padding: "0.1rem 0.45rem",
                                borderRadius: "4px",
                                fontSize: "0.72rem",
                                fontWeight: 600,
                                background: s.sessionType === "ONE_ON_ONE" ? "#ede9fe" : "#e0f2fe",
                                color: s.sessionType === "ONE_ON_ONE" ? "#6d28d9" : "#0369a1",
                              }}
                            >
                              {s.sessionType === "ONE_ON_ONE" ? "1-on-1" : "Cohort"}
                            </span>

                            {/* Quiz Pill */}
                            {s.quizId && (
                              <span
                                style={{
                                  fontSize: "0.7rem",
                                  color: "var(--text-muted, #78716c)",
                                  background: "#f1f5f9",
                                  padding: "1px 5px",
                                  borderRadius: "3px",
                                }}
                              >
                                Quiz
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Date & Time */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--text-primary)" }}>
                            {formatWhenInTz(s.startTime, s.endTime, displayTimezone)}
                          </span>
                          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                            {displayTimezone}
                          </span>
                        </div>
                      </td>

                      {/* Trainer */}
                      <td>
                        <span className={styles.cellText} style={{ fontSize: "0.85rem" }}>
                          {s.hostTrainer?.name || <span className={styles.cellTextMuted}>Unassigned</span>}
                        </span>
                      </td>

                      {/* Meeting Link / Recording */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-start" }}>
                          {s.joinUrl ? (
                            <a
                              href={(s as any).hostUrl || s.joinUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "0.22rem 0.55rem",
                                borderRadius: "5px",
                                fontSize: "0.75rem",
                                fontWeight: 600,
                                color: "#0284c7",
                                background: "#f0f9ff",
                                border: "1px solid #bae6fd",
                                textDecoration: "none",
                              }}
                              title="Open meeting link"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <polygon points="23 7 16 12 23 17 23 7" />
                                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                              </svg>
                              Join ↗
                            </a>
                          ) : (
                            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>—</span>
                          )}

                          {s.recordingUrl && (
                            <a
                              href={s.recordingUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                fontSize: "0.72rem",
                                color: "var(--text-muted, #78716c)",
                                textDecoration: "none",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "3px",
                              }}
                              title="Watch session recording"
                            >
                              Recording ↗
                            </a>
                          )}
                        </div>
                      </td>

                      {/* Attendance (Concise count with direct jump link) */}
                      <td>
                        <Link
                          href={`/batches/${batchId}/sessions/${s.id}/attendance`}
                          style={{ textDecoration: "none" }}
                          title="Click to take or review attendance"
                        >
                          <span
                            style={{
                              display: "inline-block",
                              padding: "0.22rem 0.55rem",
                              borderRadius: "6px",
                              fontSize: "0.78rem",
                              fontWeight: 600,
                              background: (s._count?.attendances ?? 0) > 0 ? "#ecfdf5" : "#f8fafc",
                              color: (s._count?.attendances ?? 0) > 0 ? "#047857" : "#64748b",
                              border: `1px solid ${(s._count?.attendances ?? 0) > 0 ? "#a7f3d0" : "#e2e8f0"}`,
                              transition: "all 0.15s ease",
                              cursor: "pointer",
                            }}
                          >
                            {getAttendanceCount(s)}
                          </span>
                        </Link>
                      </td>

                      {/* Status */}
                      <td>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "0.2rem 0.55rem",
                            borderRadius: "6px",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            background: badge.bg,
                            color: badge.color,
                            border: `1px solid ${badge.border}`,
                          }}
                        >
                          {badge.label}
                        </span>
                      </td>

                      {/* Compact Manage Action Menu */}
                      <td className={styles.alignRight}>
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <ActionMenu
                            triggerText="Manage"
                            ariaLabel={`Manage session ${s.title}`}
                            items={[
                              {
                                label: isCompleted ? "Review Attendance" : "Take Attendance",
                                icon: (
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                    <circle cx="9" cy="7" r="4" />
                                    <polyline points="16 11 18 13 22 9" />
                                  </svg>
                                ),
                                href: `/batches/${batchId}/sessions/${s.id}/attendance`,
                              },
                              {
                                label: "Edit Session",
                                icon: (
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                  </svg>
                                ),
                                onClick: () => openEditModal(s),
                              },
                              {
                                label: "Reconcile Attendance",
                                icon: (
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <polyline points="23 4 23 10 17 10" />
                                    <polyline points="1 20 1 14 7 14" />
                                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                                  </svg>
                                ),
                                href: `/batches/${batchId}/sessions/${s.id}/reconciliation`,
                              },
                              ...(s.status !== "CANCELLED" && s.status !== "COMPLETED"
                                ? [
                                    {
                                      label: "Cancel Session",
                                      icon: (
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                          <circle cx="12" cy="12" r="10" />
                                          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                                        </svg>
                                      ),
                                      danger: true,
                                      dividerAbove: true,
                                      onClick: () => setCancellingSessionId(s.id),
                                    },
                                  ]
                                : []),
                              {
                                label: "Delete Session",
                                icon: (
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                  </svg>
                                ),
                                danger: true,
                                dividerAbove: s.status === "CANCELLED" || s.status === "COMPLETED",
                                onClick: () => setDeletingSessionId(s.id),
                              },
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* SCHEDULE / EDIT SESSION MODAL */}
      {isModalOpen && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div
            className={styles.modalContent}
            style={{ maxWidth: "560px", maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <h2>{editingSessionId ? "Edit Session" : "Schedule Live Session"}</h2>
                <p className={styles.modalIntro}>
                  {editingSessionId
                    ? "Update session timing, details, or trainer."
                    : "Stored in UTC with automated Zoom link generation."}
                </p>
              </div>
              <button className={styles.closeBtn} onClick={closeModal} aria-label="Close modal">
                ×
              </button>
            </div>

            <form className={styles.modalForm} onSubmit={handleSaveSession}>
              {/* Format selection */}
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
                        setCapacity(batch?.capacity || 50);
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

              {/* Title / Topic */}
              <div className={styles.formGroup}>
                <label>Session Title / Topic</label>
                <input
                  type="text"
                  placeholder="e.g. Week 1: Introduction to Framework"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              {/* Host Trainer */}
              <div className={styles.formGroup}>
                <label>Host Trainer</label>
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

              {/* Date, Start Time, End Time */}
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

              {/* Capacity */}
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

              {/* Meeting Link */}
              <div className={styles.formGroup}>
                <label>Meeting Link (Zoom)</label>
                <input
                  type="url"
                  placeholder={editingSessionId ? "e.g. https://zoom.us/j/..." : "Leave blank for automatic Zoom meeting creation"}
                  value={joinUrl}
                  onChange={(e) => setJoinUrl(e.target.value)}
                />
                {!editingSessionId && (
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
                )}
              </div>

              {/* Recording URL */}
              <div className={styles.formGroup}>
                <label>Recording URL (Optional)</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={recordingUrl}
                  onChange={(e) => setRecordingUrl(e.target.value)}
                />
              </div>

              {/* Minimum Attendance Minutes */}
              <div className={styles.formGroup}>
                <label>Minimum Attendance Minutes (Optional)</label>
                <input
                  type="number"
                  min={1}
                  placeholder="e.g. 45 (defaults to cohort % threshold)"
                  value={minAttendanceMinutes}
                  onChange={(e) =>
                    setMinAttendanceMinutes(
                      e.target.value === "" ? "" : parseInt(e.target.value, 10) || ""
                    )
                  }
                />
                <span
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    color: "var(--text-secondary)",
                    marginTop: "0.25rem",
                  }}
                >
                  * Custom minutes threshold required to satisfy session attendance (live + recorded).
                </span>
              </div>


              {/* Post-Session Quiz */}
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

              {/* Error Callout */}
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

              {/* Modal Footer */}
              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={closeModal}
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.primaryBtn} disabled={isSaving}>
                  {isSaving
                    ? editingSessionId
                      ? "Saving..."
                      : "Scheduling..."
                    : editingSessionId
                    ? "Save Changes"
                    : "Schedule Session"}
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
