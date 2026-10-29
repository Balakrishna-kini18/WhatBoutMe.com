"use client";

import { useEffect, useState, use } from "react";
import Image from "next/image";
import styles from "../../../../../page.module.css";
import Link from "next/link";
import { Modal, StatusBadge, CustomSelect, TableSkeleton, EmptyState } from "../../../../../components";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface LearnerAttendanceItem {
  userId: string;
  enrolmentId: string;
  name: string;
  email: string;
  avatar: string | null;
  joinTimeUtc: string | null;
  leaveTimeUtc: string | null;
  minutesPresent: number;
  liveMinutes?: number | null;
  recordedMinutes?: number | null;
  attendancePercentage: number;
  status: string;
  source: string;
  overrideReason: string | null;
}

interface AttendanceResponse {
  session: {
    id: string;
    title: string;
    type: string;
    startTimeUtc: string;
    endTimeUtc: string;
    durationMinutes: number;
    minAttendanceMinutes?: number | null;
    meetingProvider: string;
    meetingLink: string | null;
    recordingLink: string | null;
  };
  thresholdPercentage: number;
  totalLearners: number;
  presentCount: number;
  learners: LearnerAttendanceItem[];
}

export default function SessionAttendancePage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const resolvedParams = use(params);
  const { id: batchId, sessionId } = resolvedParams;

  const [data, setData] = useState<AttendanceResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  // Override modal state
  const [overrideModal, setOverrideModal] = useState<{
    isOpen: boolean;
    learner: LearnerAttendanceItem | null;
    status: string;
    minutesPresent: number;
    reason: string;
    loading: boolean;
    error: string;
  }>({
    isOpen: false,
    learner: null,
    status: "PRESENT",
    minutesPresent: 60,
    reason: "",
    loading: false,
    error: "",
  });

  // QR Check-in Modal state
  const [qrModal, setQrModal] = useState<{
    isOpen: boolean;
    loading: boolean;
    token: string;
    checkInUrl: string;
    error: string;
  }>({
    isOpen: false,
    loading: false,
    token: "",
    checkInUrl: "",
    error: "",
  });

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const getAuthHeaders = (): Record<string, string> => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const handleSyncMeeting = async () => {
    setIsSyncing(true);
    setSyncNotice(null);
    try {
      const res = await fetch(`${API_URL}/batches/${batchId}/sessions/${sessionId}/sync-attendance`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || `Failed to sync meeting attendance (${res.status})`);
      }
      const json = await res.json();
      if (json.success === false) {
        setSyncNotice({
          type: "error",
          message: json.message || "No meeting attendance records were processed.",
        });
        return;
      }
      setSyncNotice({
        type: "success",
        message: `Meeting attendance synchronized successfully (${json.participantCount || 0} participant records processed).`,
      });
      await fetchAttendanceData();
    } catch (err: any) {
      setSyncNotice({
        type: "error",
        message: err.message || "Failed to synchronize meeting attendance report.",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const fetchAttendanceData = async (signal?: AbortSignal) => {
    setIsLoading(true);
    setErrorMessage("");
    try {
      const res = await fetch(`${API_URL}/batches/${batchId}/sessions/${sessionId}/attendance`, {
        headers: getAuthHeaders(),
        signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || `Failed to load attendance (status ${res.status})`);
      }

      const json: AttendanceResponse = await res.json();
      setData(json);
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        setErrorMessage(err.message || "Failed to load session attendance data");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchAttendanceData(controller.signal);
    return () => controller.abort();
  }, [batchId, sessionId]);

  const handleOpenOverride = (learner: LearnerAttendanceItem) => {
    setOverrideModal({
      isOpen: true,
      learner,
      status: learner.status === "ABSENT" ? "PRESENT" : learner.status,
      minutesPresent: learner.minutesPresent || data?.session.durationMinutes || 60,
      reason: "",
      loading: false,
      error: "",
    });
  };

  const submitOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideModal.learner) return;

    if (!overrideModal.reason.trim()) {
      setOverrideModal((prev) => ({ ...prev, error: "A mandatory non-empty reason is required for audit logs." }));
      return;
    }

    const targetUserId = overrideModal.learner.userId;
    const newStatus = overrideModal.status;
    const newMinutes = Number(overrideModal.minutesPresent) || 0;
    const newReason = overrideModal.reason.trim();
    const previousData = data;

    // Optimistic UI update: immediately reflect modified status and recompute presentCount
    if (data) {
      const updatedLearners = data.learners.map((l) =>
        l.userId === targetUserId
          ? {
              ...l,
              status: newStatus,
              minutesPresent: newMinutes,
              overrideReason: newReason,
            }
          : l
      );
      const newPresentCount = updatedLearners.filter(
        (l) =>
          l.status === "PRESENT" ||
          l.status === "PRESENT_AUTO" ||
          l.status === "PRESENT_MANUAL" ||
          l.status === "CORRECTED"
      ).length;

      setData({
        ...data,
        learners: updatedLearners,
        presentCount: newPresentCount,
      });
    }

    // Dismiss modal immediately for instant tactile responsiveness
    setOverrideModal((prev) => ({ ...prev, isOpen: false, loading: false, error: "" }));

    try {
      const res = await fetch(
        `${API_URL}/batches/${batchId}/sessions/${sessionId}/attendance/${targetUserId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(),
          },
          body: JSON.stringify({
            status: newStatus,
            minutesPresent: newMinutes,
            reason: newReason,
          }),
        },
      );

      if (!res.ok) {
        // Rollback on server failure
        setData(previousData);
        const err = await res.json().catch(() => null);
        setErrorMessage(err?.message || "Failed to update attendance on server");
        return;
      }

      // Background re-fetch to ensure synchronization
      fetchAttendanceData();
    } catch (err: any) {
      setData(previousData);
      setErrorMessage(err.message || "Network error while saving attendance");
    }
  };

  const handleShowQrModal = async () => {
    setQrModal({ isOpen: true, loading: true, token: "", checkInUrl: "", error: "" });
    try {
      const res = await fetch(`${API_URL}/sessions/${sessionId}/check-in/token`, {
        method: "POST",
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || "Failed to generate check-in token");
      }

      const json = await res.json();
      const origin = typeof window !== "undefined" ? window.location.origin.replace("3002", "3003") : "";
      setQrModal({
        isOpen: true,
        loading: false,
        token: json.token,
        checkInUrl: `${origin}${json.checkInUrl}`,
        error: "",
      });
    } catch (err: any) {
      setQrModal((prev) => ({ ...prev, loading: false, error: err.message }));
    }
  };

  const handleExportCsv = () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : "";
    window.open(`${API_URL}/admin/reports/batches/${batchId}/attendance/export?format=csv&token=${token}`, "_blank");
  };

  const formatLocalTime = (isoString: string | null) => {
    if (!isoString) return "---";
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "---";
    }
  };

  return (
    <div className={styles.dashboardContainer} style={{ gap: "1.25rem" }}>
      <header className={styles.header} style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: 0 }}>
        <div>
          <Link
            href={`/batches/${batchId}?tab=sessions`}
            style={{
              textDecoration: "none",
              color: "var(--accent-primary)",
              fontSize: "0.84rem",
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              marginBottom: "0.5rem",
            }}
          >
            ← Back to Batch Sessions
          </Link>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                <h1 className={styles.title} style={{ margin: 0, fontSize: "1.45rem", fontWeight: 700 }}>
                  Attendance: {data?.session.title || "Live Session"}
                </h1>
                <span
                  style={{
                    fontSize: "0.74rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    padding: "3px 8px",
                    borderRadius: "4px",
                    background: "rgba(201, 122, 30, 0.1)",
                    color: "var(--accent-primary)",
                    letterSpacing: "0.04em",
                  }}
                >
                  {data?.session.type || "GROUP_COHORT"}
                </span>
              </div>
              <p style={{ margin: "4px 0 0", fontSize: "0.84rem", color: "var(--text-muted)" }}>
                Compliance threshold: <strong>{data?.thresholdPercentage ?? 75}%</strong> of scheduled duration ({data?.session.durationMinutes ?? 60} mins · min {Math.round(((data?.session.durationMinutes ?? 60) * (data?.thresholdPercentage ?? 75)) / 100)}m).
              </p>
            </div>

            <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={handleShowQrModal}
                style={{ fontSize: "0.82rem", padding: "0.45rem 0.85rem", display: "inline-flex", alignItems: "center", gap: "5px" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                </svg>
                <span>QR Check-In</span>
              </button>

              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={handleSyncMeeting}
                disabled={isSyncing}
                title="Pull live attendance participant report from Zoom API"
                style={{ fontSize: "0.82rem", padding: "0.45rem 0.85rem", display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ animation: isSyncing ? "spin 1s linear infinite" : undefined }}
                >
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
                <span>{isSyncing ? "Syncing Zoom..." : "Sync Zoom Report"}</span>
              </button>

              <button
                type="button"
                className={styles.primaryBtn}
                onClick={handleExportCsv}
                style={{ fontSize: "0.82rem", padding: "0.45rem 0.95rem" }}
              >
                Export CSV
              </button>
            </div>
          </div>
        </div>
      </header>

      {syncNotice && (
        <div
          role="status"
          style={{
            padding: "0.85rem 1.15rem",
            borderRadius: "8px",
            fontSize: "0.86rem",
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
            backgroundColor: syncNotice.type === "success" ? "#f0fdf4" : "#fef2f2",
            color: syncNotice.type === "success" ? "#166534" : "#991b1b",
            border: syncNotice.type === "success" ? "1px solid #bbf7d0" : "1px solid #fecaca",
          }}
        >
          <span>{syncNotice.message}</span>
          <Link
            href={`/batches/${batchId}/sessions/${sessionId}/reconciliation`}
            style={{
              color: "#0369a1",
              fontWeight: 600,
              textDecoration: "underline",
              fontSize: "0.84rem",
              whiteSpace: "nowrap",
            }}
          >
            Review Reconciliation →
          </Link>
        </div>
      )}

      {/* Metrics Row: Warm Organic Cards */}
      {data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "1rem" }}>
          {/* Card 1: Total Enrolled */}
          <div style={{ background: "var(--surface)", padding: "1.1rem 1.25rem", borderRadius: "10px", border: "1px solid var(--border-light)", display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.04em" }}>
                Total Enrolled
              </span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent-primary)" }}>
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text-primary)" }}>{data.totalLearners}</div>
            <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>Active learners in cohort</span>
          </div>

          {/* Card 2: Present Learners */}
          <div style={{ background: "var(--surface)", padding: "1.1rem 1.25rem", borderRadius: "10px", border: "1px solid var(--border-light)", display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.04em" }}>
                Present Learners
              </span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#16a34a" }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#16a34a" }}>{data.presentCount}</div>
            <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
              {data.totalLearners > 0 ? `${Math.round((data.presentCount / data.totalLearners) * 100)}% attendance rate` : "0% attendance"}
            </span>
          </div>

          {/* Card 3: Absent Rate */}
          <div style={{ background: "var(--surface)", padding: "1.1rem 1.25rem", borderRadius: "10px", border: "1px solid var(--border-light)", display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.04em" }}>
                Absent Rate
              </span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#dc2626" }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#dc2626" }}>
              {data.totalLearners > 0
                ? `${Math.round(((data.totalLearners - data.presentCount) / data.totalLearners) * 100)}%`
                : "0%"}
            </div>
            <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
              {Math.max(0, data.totalLearners - data.presentCount)} absent learners
            </span>
          </div>

          {/* Card 4: Meeting Provider */}
          <div style={{ background: "var(--surface)", padding: "1.1rem 1.25rem", borderRadius: "10px", border: "1px solid var(--border-light)", display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.04em" }}>
                Meeting Provider
              </span>
              <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "2px 7px", borderRadius: "4px", background: "rgba(2, 132, 199, 0.1)", color: "#0284c7" }}>
                LIVE
              </span>
            </div>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text-primary)", marginTop: "4px" }}>
              {data.session.meetingProvider || "Zoom Cloud"}
            </div>
            <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
              Threshold: {data.thresholdPercentage}% ({Math.round(((data.session.durationMinutes || 60) * data.thresholdPercentage) / 100)}m)
            </span>
          </div>
        </div>
      )}

      {errorMessage && (
        <div style={{ padding: "12px 16px", background: "#fef2f2", color: "#991b1b", borderRadius: "8px", border: "1px solid #fecaca", fontSize: "0.85rem" }}>
          {errorMessage}
        </div>
      )}

      {/* Attendance Learners Table */}
      <section className={styles.tableSection}>
        <div className={styles.tableWrapper} style={{ overflowX: "auto" }}>
          <table className={styles.adminTable} style={{ width: "100%" }}>
            <thead>
              <tr>
                <th style={{ minWidth: "200px" }}>Learner</th>
                <th style={{ width: "160px" }}>Status</th>
                <th style={{ width: "120px" }}>Source</th>
                <th style={{ width: "180px" }}>Time Present</th>
                <th style={{ width: "130px", textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableSkeleton columns={5} rows={6} />
              ) : !data || data.learners.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "3rem 1rem" }}>
                    <EmptyState
                      icon="users"
                      title="No learners enrolled"
                      description="No learners are currently assigned to this batch cohort to record attendance for."
                    />
                  </td>
                </tr>
              ) : (
                data.learners.map((learner) => {
                  return (
                    <tr key={learner.userId}>
                      {/* Learner Info with Avatar Squircle & Jump Link */}
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div
                            style={{
                              width: "36px",
                              height: "36px",
                              borderRadius: "8px",
                              background: "rgba(201, 122, 30, 0.12)",
                              color: "var(--accent-primary)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 700,
                              fontSize: "0.85rem",
                              flexShrink: 0,
                            }}
                          >
                            {learner.name ? learner.name.charAt(0).toUpperCase() : "U"}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <Link
                              href={`/users/${learner.userId}?enrolmentId=${learner.enrolmentId}`}
                              style={{ textDecoration: "none", color: "inherit" }}
                              title="Open student profile and progression overview"
                            >
                              <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--accent-primary)", cursor: "pointer" }}>
                                {learner.name}
                              </span>
                            </Link>
                            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                              {learner.email}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Status & Audit Override Note */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-start" }}>
                          {(() => {
                            const isPresent =
                              learner.status === "PRESENT" ||
                              learner.status === "PRESENT_AUTO" ||
                              learner.status === "PRESENT_MANUAL" ||
                              learner.status === "CORRECTED" ||
                              learner.status === "PRESENT_LIVE" ||
                              learner.status === "PRESENT_RECORDED";
                            const isPartial = !isPresent && ((learner.minutesPresent ?? 0) > 0 || (learner.attendancePercentage ?? 0) > 0);

                            return (
                              <StatusBadge
                                status={
                                  isPartial
                                    ? `Partial (${Math.round(learner.attendancePercentage)}%)`
                                    : learner.status
                                }
                                tone={
                                  isPresent
                                    ? "active"
                                    : learner.status === "EXCUSED"
                                    ? "pending"
                                    : isPartial
                                    ? "pending"
                                    : "inactive"
                                }
                              />
                            );
                          })()}
                          {learner.overrideReason && (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                fontSize: "0.72rem",
                                color: "var(--text-secondary)",
                                background: "var(--background-subtle, #f8f6f0)",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                maxWidth: "200px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                border: "1px solid var(--border-light)",
                              }}
                              title={`Audit Override Reason: ${learner.overrideReason}`}
                            >
                              <span>📝</span>
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{learner.overrideReason}</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Attendance Source */}
                      <td>
                        <span
                          style={{
                            fontSize: "0.74rem",
                            padding: "3px 8px",
                            borderRadius: "6px",
                            fontWeight: 600,
                            background:
                              learner.source === "AUTO" || learner.source === "ZOOM_SYNC"
                                ? "#e0f2fe"
                                : learner.source === "QR_CHECKIN"
                                  ? "#fef3c7"
                                  : "#f3e8ff",
                            color:
                              learner.source === "AUTO" || learner.source === "ZOOM_SYNC"
                                ? "#0369a1"
                                : learner.source === "QR_CHECKIN"
                                  ? "#b45309"
                                  : "#7e22ce",
                            border:
                              learner.source === "AUTO" || learner.source === "ZOOM_SYNC"
                                ? "1px solid #bae6fd"
                                : learner.source === "QR_CHECKIN"
                                  ? "1px solid #fde68a"
                                  : "1px solid #e9d5ff",
                          }}
                        >
                          {learner.source === "ZOOM_SYNC" ? "Zoom Sync" : learner.source === "QR_CHECKIN" ? "QR Check-In" : learner.source}
                        </span>
                      </td>

                      {/* Time Present */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                            <span style={{ fontWeight: 600, fontSize: "0.88rem", color: "var(--text-primary)" }}>
                              {learner.minutesPresent} mins
                            </span>
                            <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                              ({Math.round(learner.attendancePercentage)}%)
                            </span>
                          </div>
                          {(learner.liveMinutes != null || learner.recordedMinutes != null) && (
                            <div style={{ display: "flex", gap: "6px", fontSize: "0.72rem", color: "var(--text-muted)" }}>
                              <span>Live: {Math.round((learner.liveMinutes ?? 0) * 10) / 10}m</span>
                              <span>•</span>
                              <span>Rec: {Math.round((learner.recordedMinutes ?? 0) * 10) / 10}m</span>
                            </div>
                          )}
                          {learner.joinTimeUtc && (
                            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                              {learner.leaveTimeUtc
                                ? `${formatLocalTime(learner.joinTimeUtc)} – ${formatLocalTime(learner.leaveTimeUtc)}`
                                : `Joined ${formatLocalTime(learner.joinTimeUtc)}`}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Action */}
                      <td style={{ textAlign: "right" }}>
                        <button
                          type="button"
                          className={styles.secondaryBtn}
                          onClick={() => handleOpenOverride(learner)}
                          style={{
                            padding: "4px 10px",
                            fontSize: "0.78rem",
                            whiteSpace: "nowrap",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <span>✎</span>
                          <span>Edit</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Manual Override Modal */}
      {overrideModal.isOpen && overrideModal.learner && (
        <Modal
          isOpen={overrideModal.isOpen}
          title={`Override Attendance: ${overrideModal.learner.name}`}
          onClose={() => setOverrideModal((prev) => ({ ...prev, isOpen: false }))}
        >
          <form onSubmit={submitOverride} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div className={styles.formGroup}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px" }}>
                Target Status
              </label>
              <CustomSelect
                value={overrideModal.status}
                onChange={(val) => setOverrideModal((prev) => ({ ...prev, status: val }))}
                options={[
                  { value: "PRESENT", label: "PRESENT (Full Attendance)" },
                  { value: "ABSENT", label: "ABSENT" },
                  { value: "EXCUSED", label: "EXCUSED (Medical / Approved)" },
                ]}
                fullWidth
                ariaLabel="Target Status"
              />
            </div>

            <div className={styles.formGroup}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px" }}>
                Minutes Present
              </label>
              <input
                type="number"
                min={0}
                max={data?.session.durationMinutes || 300}
                value={overrideModal.minutesPresent}
                onChange={(e) => setOverrideModal((prev) => ({ ...prev, minutesPresent: Number(e.target.value) }))}
                className={styles.formInput}
              />
            </div>

            <div className={styles.formGroup}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px" }}>
                Mandatory Audit Reason <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <textarea
                required
                rows={3}
                placeholder="Explain why this attendance record is being manually overridden (e.g., student joined on secondary device or verified via recording review)"
                value={overrideModal.reason}
                onChange={(e) => setOverrideModal((prev) => ({ ...prev, reason: e.target.value }))}
                className={styles.formInput}
                style={{ resize: "vertical" }}
              />
            </div>

            {overrideModal.error && (
              <div style={{ color: "#dc2626", background: "#fef2f2", padding: "8px 12px", borderRadius: "6px", fontSize: "0.82rem", border: "1px solid #fecaca" }}>
                {overrideModal.error}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setOverrideModal((prev) => ({ ...prev, isOpen: false }))}
              >
                Cancel
              </button>
              <button type="submit" className={styles.primaryBtn} disabled={overrideModal.loading}>
                {overrideModal.loading ? "Recording Override..." : "Save Override"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* QR Code Check-in Modal */}
      {qrModal.isOpen && (
        <Modal
          isOpen={qrModal.isOpen}
          title="In-Person Workshop QR Check-In"
          onClose={() => setQrModal((prev) => ({ ...prev, isOpen: false }))}
        >
          <div style={{ textAlign: "center", padding: "10px 0" }}>
            {qrModal.loading ? (
              <p>Generating secure check-in session...</p>
            ) : qrModal.error ? (
              <p style={{ color: "#dc2626" }}>{qrModal.error}</p>
            ) : (
              <div>
                <p style={{ color: "#475569", marginBottom: "16px", fontSize: "0.95rem" }}>
                  Learners can scan this QR code or click the check-in URL on their mobile phones to check in.
                </p>
                <div style={{ display: "inline-block", padding: "16px", background: "#ffffff", borderRadius: "12px", border: "2px dashed #cbd5e1", marginBottom: "16px" }}>
                  <Image
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrModal.checkInUrl)}`}
                    alt="Check-in QR code"
                    width={200}
                    height={200}
                    unoptimized
                    quality={80}
                    loading="lazy"
                    style={{ width: "200px", height: "200px" }}
                  />
                </div>
                <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                  <span style={{ fontSize: "0.8rem", color: "#64748b", display: "block", marginBottom: "4px" }}>Direct Check-In URL:</span>
                  <input
                    readOnly
                    value={qrModal.checkInUrl}
                    style={{ width: "100%", padding: "6px 10px", fontSize: "0.85rem", background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "4px" }}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
