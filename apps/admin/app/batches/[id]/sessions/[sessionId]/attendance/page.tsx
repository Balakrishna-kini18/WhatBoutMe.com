"use client";

import { useEffect, useState, useMemo, use, useRef } from "react";
import styles from "../../../../../page.module.css";
import Link from "next/link";
import {
  Modal,
  ConfirmDialog,
  StatusBadge,
  CustomSelect,
  TableSkeleton,
  EmptyState,
  Pagination,
  SortIndicator,
  useToast,
  type SortOrder,
} from "../../../../../components";
import { API_URL } from "../../../../../lib/api";

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
  source: string | null;
  overrideReason: string | null;
}

interface UnmatchedParticipantItem {
  id: string;
  participantName: string;
  participantEmail: string | null;
  joinTimeUtc: string | null;
  leaveTimeUtc: string | null;
  minutesPresent: number;
}

interface UnlinkedLearnerItem {
  userId: string;
  enrolmentId: string;
  name: string;
  email: string;
}

interface AttendanceResponse {
  session: {
    id: string;
    title: string;
    type: string;
    status?: string;
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
  unmatched?: UnmatchedParticipantItem[];
  unlinkedLearners?: UnlinkedLearnerItem[];
}

type AttendanceSortField = "name" | "status" | "duration" | "joinTime" | "leaveTime" | "source";

export default function SessionAttendancePage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const resolvedParams = use(params);
  const { id: batchId, sessionId } = resolvedParams;
  const { success: toastSuccess, error: toastError } = useToast();

  const [data, setData] = useState<AttendanceResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  // Sorting & Pagination state
  const [sortField, setSortField] = useState<AttendanceSortField>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

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

  // Unmatched participant Link & Dismiss state (merged into Attendance page)
  const [linkModal, setLinkModal] = useState<{
    isOpen: boolean;
    unmatchedItem: UnmatchedParticipantItem | null;
    selectedUserId: string;
    reason: string;
    loading: boolean;
    error: string;
  }>({
    isOpen: false,
    unmatchedItem: null,
    selectedUserId: "",
    reason: "Participant joined Zoom under an alternate display name or device",
    loading: false,
    error: "",
  });

  const [itemToDismiss, setItemToDismiss] = useState<UnmatchedParticipantItem | null>(null);
  const [isDismissing, setIsDismissing] = useState(false);
  const [dismissError, setDismissError] = useState<string | null>(null);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const getAuthHeaders = (): Record<string, string> => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const handleSort = (field: AttendanceSortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
    setCurrentPage(1);
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
      await fetchAttendanceData();
      if (json.success === false) {
        setSyncNotice({
          type: "error",
          message: json.message || "No meeting attendance records were processed.",
        });
        return;
      }
      setSyncNotice({
        type: "success",
        message: `Zoom attendance synced (${json.participantCount || 0} participant records processed).`,
      });
    } catch (err: any) {
      setSyncNotice({
        type: "error",
        message: err.message || "Failed to synchronize Zoom attendance report.",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const dataRef = useRef<AttendanceResponse | null>(null);
  dataRef.current = data;

  useEffect(() => {
    const controller = new AbortController();
    fetchAttendanceData(controller.signal);

    // Smart background poll every 30s:
    // Only polls if:
    // 1. Browser tab is currently visible (stops completely when tab is minimized/hidden)
    // 2. Session is currently live (never polls past/completed sessions to eliminate wasted queries)
    const interval = setInterval(async () => {
      if (typeof document !== "undefined" && document.hidden) return;

      const sess = dataRef.current?.session;
      if (sess) {
        const isCompleted = sess.status === "COMPLETED" || sess.status === "CANCELLED";
        const endTime = sess.endTimeUtc ? new Date(sess.endTimeUtc).getTime() : 0;
        const hasEnded = endTime > 0 && Date.now() > endTime + 15 * 60 * 1000;
        if (isCompleted || hasEnded) {
          return;
        }
      }

      try {
        const res = await fetch(`${API_URL}/batches/${batchId}/sessions/${sessionId}/attendance`, {
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          const json: AttendanceResponse = await res.json();
          setData(json);
        }
      } catch {}
    }, 30000);

    // Refresh immediately when returning to tab from another window
    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        const sess = dataRef.current?.session;
        if (sess) {
          const isCompleted = sess.status === "COMPLETED" || sess.status === "CANCELLED";
          const endTime = sess.endTimeUtc ? new Date(sess.endTimeUtc).getTime() : 0;
          if (!isCompleted && (!endTime || Date.now() <= endTime + 15 * 60 * 1000)) {
            fetchAttendanceData();
          }
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      controller.abort();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [batchId, sessionId]);

  const isLearnerPresent = (status: string) =>
    status === "PRESENT" ||
    status === "PRESENT_AUTO" ||
    status === "PRESENT_MANUAL" ||
    status === "CORRECTED" ||
    status === "PRESENT_LIVE" ||
    status === "PRESENT_RECORDED";

  const handleOpenOverride = (learner: LearnerAttendanceItem) => {
    const sessionDur = data?.session.durationMinutes || 60;
    const initialStatus = isLearnerPresent(learner.status)
      ? "PRESENT"
      : learner.status === "EXCUSED"
      ? "EXCUSED"
      : "PRESENT";
    const initialMinutes =
      initialStatus === "PRESENT"
        ? learner.minutesPresent > 0
          ? learner.minutesPresent
          : sessionDur
        : learner.minutesPresent || 0;

    setOverrideModal({
      isOpen: true,
      learner,
      status: initialStatus,
      minutesPresent: initialMinutes,
      reason: learner.overrideReason || "",
      loading: false,
      error: "",
    });
  };

  const handleOverrideStatusChange = (val: string) => {
    const sessionDur = data?.session.durationMinutes || 60;
    setOverrideModal((prev) => ({
      ...prev,
      status: val,
      minutesPresent:
        val === "ABSENT"
          ? 0
          : val === "PRESENT" && prev.minutesPresent === 0
          ? sessionDur
          : prev.minutesPresent,
    }));
  };

  const submitOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideModal.learner || overrideModal.loading) return;

    if (!overrideModal.reason.trim() || overrideModal.reason.trim().length < 3) {
      setOverrideModal((prev) => ({
        ...prev,
        error: "Please enter a brief reason (at least 3 characters).",
      }));
      return;
    }

    const targetUserId = overrideModal.learner.userId;
    const newStatus = overrideModal.status;
    const newMinutes = newStatus === "ABSENT" ? 0 : Math.max(0, Number(overrideModal.minutesPresent) || 0);
    const newReason = overrideModal.reason.trim();
    const sessionDur = data?.session.durationMinutes || 60;
    const newPct = sessionDur > 0 ? Math.min(100, (newMinutes / sessionDur) * 100) : 0;
    const previousData = data;

    if (data) {
      const updatedLearners = data.learners.map((l) =>
        l.userId === targetUserId
          ? {
              ...l,
              status: newStatus,
              source: "MANUAL",
              minutesPresent: newMinutes,
              attendancePercentage: newPct,
              overrideReason: newReason,
            }
          : l
      );
      const newPresentCount = updatedLearners.filter((l) => isLearnerPresent(l.status)).length;

      setData({
        ...data,
        learners: updatedLearners,
        presentCount: newPresentCount,
      });
    }

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
        }
      );

      if (!res.ok) {
        setData(previousData);
        const err = await res.json().catch(() => null);
        const msg = err?.message || "Failed to update attendance on server";
        setErrorMessage(Array.isArray(msg) ? msg.join(", ") : msg);
        return;
      }

      toastSuccess("Attendance updated.");
      fetchAttendanceData();
    } catch (err: any) {
      setData(previousData);
      setErrorMessage(err.message || "Network error while saving attendance");
    }
  };

  // Unmatched participant linking handlers
  const handleOpenLinkModal = (item: UnmatchedParticipantItem) => {
    setLinkModal({
      isOpen: true,
      unmatchedItem: item,
      selectedUserId: data?.unlinkedLearners?.[0]?.userId || data?.learners?.[0]?.userId || "",
      reason: "Participant joined Zoom under an alternate display name or device",
      loading: false,
      error: "",
    });
  };

  const submitLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkModal.unmatchedItem || !linkModal.selectedUserId) {
      setLinkModal((prev) => ({ ...prev, error: "Please select a learner to link." }));
      return;
    }

    setLinkModal((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const res = await fetch(
        `${API_URL}/batches/${batchId}/sessions/${sessionId}/reconciliation/${linkModal.unmatchedItem.id}/link`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(),
          },
          body: JSON.stringify({
            userId: linkModal.selectedUserId,
            reason: linkModal.reason,
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        const msg = err?.message || "Failed to link participant";
        setLinkModal((prev) => ({
          ...prev,
          loading: false,
          error: Array.isArray(msg) ? msg.join(", ") : msg,
        }));
        return;
      }

      setLinkModal((prev) => ({ ...prev, isOpen: false, loading: false }));
      toastSuccess("Attendee linked to learner.");
      await fetchAttendanceData();
    } catch (err: any) {
      setLinkModal((prev) => ({
        ...prev,
        loading: false,
        error: err.message || "Network error",
      }));
    }
  };

  const confirmDismiss = async () => {
    if (!itemToDismiss) return;
    setIsDismissing(true);
    setDismissError(null);
    try {
      const res = await fetch(
        `${API_URL}/sessions/${sessionId}/unmatched-attendance/${itemToDismiss.id}/dismiss`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(),
          },
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || "Failed to dismiss attendee");
      }
      setItemToDismiss(null);
      toastSuccess("Unmatched attendee dismissed.");
      await fetchAttendanceData();
    } catch (err: any) {
      setDismissError(err.message || "Error dismissing attendee");
    } finally {
      setIsDismissing(false);
    }
  };

  const getSourceLabel = (learner: LearnerAttendanceItem): string => {
    if (!learner.source) return "—";
    if (learner.source === "MANUAL") return "Manual";
    if (learner.source === "QR_CHECKIN") return "QR Check-In";
    if (learner.source === "AUTO" || learner.source === "ZOOM_SYNC") {
      if (!isLearnerPresent(learner.status) && (learner.minutesPresent ?? 0) === 0 && !learner.joinTimeUtc) {
        return "—";
      }
      return "Zoom";
    }
    return learner.source;
  };

  const getCleanStatusDisplay = (learner: LearnerAttendanceItem): { label: string; tone: "active" | "pending" | "inactive" } => {
    if (isLearnerPresent(learner.status)) {
      return { label: "PRESENT", tone: "active" };
    }
    if (learner.status === "EXCUSED") {
      return { label: "EXCUSED", tone: "pending" };
    }
    if (learner.source !== "MANUAL" && ((learner.minutesPresent ?? 0) > 0 || (learner.attendancePercentage ?? 0) > 0)) {
      return { label: `PARTIAL (${Math.round(learner.attendancePercentage)}%)`, tone: "pending" };
    }
    return { label: "ABSENT", tone: "inactive" };
  };

  const formatLocalTime = (isoString: string | null) => {
    if (!isoString) return "—";
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "—";
    }
  };

  const handleExportCsv = () => {
    if (!data || data.learners.length === 0) {
      toastError("No attendance records to export.");
      return;
    }

    const headers = [
      "Attendee Name",
      "Attendee Email",
      "Status",
      "Time Present (Minutes)",
      "Attendance (%)",
      "Join Time (Local)",
      "Leave Time (Local)",
      "Source",
      "Note",
    ];
    const rows = data.learners.map((l) => {
      const statusObj = getCleanStatusDisplay(l);
      const sourceLabel = getSourceLabel(l);
      return [
        `"${(l.name || "").replace(/"/g, '""')}"`,
        `"${(l.email || "").replace(/"/g, '""')}"`,
        `"${statusObj.label}"`,
        `"${l.minutesPresent ?? 0}"`,
        `"${Math.round(l.attendancePercentage ?? 0)}%"`,
        `"${formatLocalTime(l.joinTimeUtc)}"`,
        `"${formatLocalTime(l.leaveTimeUtc)}"`,
        `"${sourceLabel}"`,
        `"${(l.overrideReason || "").replace(/"/g, '""')}"`,
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeTitle = (data.session.title || "session").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    link.setAttribute("href", url);
    link.setAttribute("download", `attendance-${safeTitle}-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toastSuccess(`Exported ${data.learners.length} attendance records to CSV.`);
  };

  const sortedLearners = useMemo(() => {
    if (!data?.learners) return [];
    const copy = [...data.learners];
    const dir = sortOrder === "asc" ? 1 : -1;

    copy.sort((a, b) => {
      if (sortField === "name") {
        return (a.name || "").localeCompare(b.name || "") * dir;
      }
      if (sortField === "status") {
        const sA = getCleanStatusDisplay(a).label;
        const sB = getCleanStatusDisplay(b).label;
        return sA.localeCompare(sB) * dir;
      }
      if (sortField === "duration") {
        return ((a.minutesPresent || 0) - (b.minutesPresent || 0)) * dir;
      }
      if (sortField === "joinTime") {
        const tA = a.joinTimeUtc ? new Date(a.joinTimeUtc).getTime() : 0;
        const tB = b.joinTimeUtc ? new Date(b.joinTimeUtc).getTime() : 0;
        return (tA - tB) * dir;
      }
      if (sortField === "leaveTime") {
        const tA = a.leaveTimeUtc ? new Date(a.leaveTimeUtc).getTime() : 0;
        const tB = b.leaveTimeUtc ? new Date(b.leaveTimeUtc).getTime() : 0;
        return (tA - tB) * dir;
      }
      if (sortField === "source") {
        return getSourceLabel(a).localeCompare(getSourceLabel(b)) * dir;
      }
      return 0;
    });

    return copy;
  }, [data?.learners, sortField, sortOrder]);

  const paginatedLearners = useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize;
    return sortedLearners.slice(startIdx, startIdx + pageSize);
  }, [sortedLearners, currentPage, pageSize]);

  return (
    <div className={styles.dashboardContainer} style={{ gap: "1.25rem" }}>
      {/* Top Back Navigation + Command Bar with Right-Aligned Actions */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", width: "100%" }}>
        <div>
          <Link
            href={`/batches/${batchId}?tab=sessions`}
            style={{
              textDecoration: "none",
              color: "var(--text-secondary, #57534e)",
              fontSize: "0.84rem",
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
            <span>Back to Live Sessions</span>
          </Link>
        </div>

        <header className={styles.welcomeBar} style={{ width: "100%" }}>
          <div className={styles.welcomeInfo}>
            <h1 className={styles.welcomeHeading}>
              {data?.session.title ? `${data.session.title} — Attendance` : "Session Attendance"}
            </h1>
          </div>

          <div className={styles.welcomeActions}>
            <button
              type="button"
              className={styles.exportBtn}
              onClick={() => fetchAttendanceData()}
              disabled={isLoading}
              title="Refresh attendance data"
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
                style={{ animation: isLoading ? "spin 1s linear infinite" : undefined }}
              >
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
              <span>{isLoading ? "Refreshing..." : "Refresh"}</span>
            </button>

            <button
              type="button"
              className={styles.exportBtn}
              onClick={handleSyncMeeting}
              disabled={isSyncing}
              title="Sync participant attendance from Zoom"
            >
              <svg
                width="15"
                height="15"
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
              <span>{isSyncing ? "Syncing..." : "Sync Zoom"}</span>
            </button>

            <button
              type="button"
              className={styles.exportBtn}
              onClick={handleExportCsv}
              disabled={!data || data.learners.length === 0}
              title="Export attendance table to CSV"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Export CSV</span>
            </button>
          </div>
        </header>
      </div>

      {syncNotice && (
        <div
          role="status"
          style={{
            padding: "0.75rem 1rem",
            borderRadius: "8px",
            fontSize: "0.84rem",
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
            backgroundColor: syncNotice.type === "success" ? "#f0fdf4" : "#fdf8f0",
            color: syncNotice.type === "success" ? "#166534" : "#8a5814",
            border: syncNotice.type === "success" ? "1px solid #bbf7d0" : "1px solid #ebdccb",
          }}
        >
          <span>{syncNotice.message}</span>
          <button
            type="button"
            onClick={() => setSyncNotice(null)}
            style={{
              background: "none",
              border: "none",
              color: "inherit",
              cursor: "pointer",
              fontSize: "1rem",
              lineHeight: 1,
              padding: "0 4px",
            }}
            aria-label="Dismiss notice"
          >
            ×
          </button>
        </div>
      )}

      {/* Dashboard-Themed KPI Cards */}
      <section className={styles.kpiGrid} aria-label="Attendance Summary Metrics">
        <div className={styles.kpiCard} style={{ cursor: "default" }}>
          <div className={styles.kpiTopRow}>
            <span className={styles.kpiLabel}>Total Enrolled</span>
            <div className={styles.kpiIconBox}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            {isLoading && !data ? (
              <div className="skeleton" style={{ width: 48, height: 28, borderRadius: 6 }} />
            ) : (
              <span className={styles.kpiValue}>{data?.totalLearners ?? 0}</span>
            )}
          </div>
        </div>

        <div className={styles.kpiCard} style={{ cursor: "default" }}>
          <div className={styles.kpiTopRow}>
            <span className={styles.kpiLabel}>Present</span>
            <div className={styles.kpiIconBox}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            {isLoading && !data ? (
              <div className="skeleton" style={{ width: 48, height: 28, borderRadius: 6 }} />
            ) : (
              <span className={styles.kpiValue}>{data?.presentCount ?? 0}</span>
            )}
          </div>
        </div>

        <div className={styles.kpiCard} style={{ cursor: "default" }}>
          <div className={styles.kpiTopRow}>
            <span className={styles.kpiLabel}>Absent</span>
            <div className={styles.kpiIconBox}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            {isLoading && !data ? (
              <div className="skeleton" style={{ width: 48, height: 28, borderRadius: 6 }} />
            ) : (
              <span className={styles.kpiValue}>
                {data ? Math.max(0, data.totalLearners - data.presentCount) : 0}
              </span>
            )}
          </div>
        </div>

        <div className={styles.kpiCard} style={{ cursor: "default" }}>
          <div className={styles.kpiTopRow}>
            <span className={styles.kpiLabel}>Attendance Rate</span>
            <div className={styles.kpiIconBox}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            {isLoading && !data ? (
              <div className="skeleton" style={{ width: 58, height: 28, borderRadius: 6 }} />
            ) : (
              <span className={styles.kpiValue}>
                {data && data.totalLearners > 0
                  ? `${Math.round((data.presentCount / data.totalLearners) * 100)}%`
                  : "0%"}
              </span>
            )}
          </div>
        </div>
      </section>

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
                <th
                  onClick={() => handleSort("name")}
                  style={{ minWidth: "210px", cursor: "pointer", userSelect: "none" }}
                  aria-sort={sortField === "name" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                >
                  <div style={{ display: "inline-flex", alignItems: "center" }}>
                    <span>Attendee</span>
                    <SortIndicator active={sortField === "name"} order={sortOrder} />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("status")}
                  style={{ width: "145px", cursor: "pointer", userSelect: "none" }}
                  aria-sort={sortField === "status" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                >
                  <div style={{ display: "inline-flex", alignItems: "center" }}>
                    <span>Status</span>
                    <SortIndicator active={sortField === "status"} order={sortOrder} />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("duration")}
                  style={{ width: "145px", cursor: "pointer", userSelect: "none" }}
                  aria-sort={sortField === "duration" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                >
                  <div style={{ display: "inline-flex", alignItems: "center" }}>
                    <span>Time Present</span>
                    <SortIndicator active={sortField === "duration"} order={sortOrder} />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("joinTime")}
                  style={{ width: "140px", cursor: "pointer", userSelect: "none" }}
                  aria-sort={sortField === "joinTime" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                >
                  <div style={{ display: "inline-flex", alignItems: "center" }}>
                    <span>Join Time (Local)</span>
                    <SortIndicator active={sortField === "joinTime"} order={sortOrder} />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("leaveTime")}
                  style={{ width: "145px", cursor: "pointer", userSelect: "none" }}
                  aria-sort={sortField === "leaveTime" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                >
                  <div style={{ display: "inline-flex", alignItems: "center" }}>
                    <span>Leave Time (Local)</span>
                    <SortIndicator active={sortField === "leaveTime"} order={sortOrder} />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("source")}
                  style={{ width: "110px", cursor: "pointer", userSelect: "none" }}
                  aria-sort={sortField === "source" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                >
                  <div style={{ display: "inline-flex", alignItems: "center" }}>
                    <span>Source</span>
                    <SortIndicator active={sortField === "source"} order={sortOrder} />
                  </div>
                </th>
                <th style={{ width: "100px", textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading || isSyncing ? (
                <TableSkeleton columns={7} rows={6} />
              ) : !data || sortedLearners.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: "3rem 1rem" }}>
                    <EmptyState
                      icon="users"
                      title="No learners enrolled"
                      description="No learners are currently assigned to this batch cohort."
                    />
                  </td>
                </tr>
              ) : (
                paginatedLearners.map((learner) => {
                  const statusDisplay = getCleanStatusDisplay(learner);
                  const sourceLabel = getSourceLabel(learner);

                  return (
                    <tr key={learner.userId}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div
                            style={{
                              width: "34px",
                              height: "34px",
                              borderRadius: "8px",
                              background: "rgba(201, 122, 30, 0.12)",
                              color: "var(--accent-primary)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 700,
                              fontSize: "0.84rem",
                              flexShrink: 0,
                            }}
                          >
                            {learner.name ? learner.name.charAt(0).toUpperCase() : "U"}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <Link
                              href={`/users/${learner.userId}?enrolmentId=${learner.enrolmentId}`}
                              style={{ textDecoration: "none", color: "inherit" }}
                              title="Open student profile"
                            >
                              <span style={{ fontWeight: 600, fontSize: "0.88rem", color: "var(--accent-primary)", cursor: "pointer" }}>
                                {learner.name}
                              </span>
                            </Link>
                            <span style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>
                              {learner.email}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-start" }}>
                          <StatusBadge status={statusDisplay.label} tone={statusDisplay.tone} />
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
                                maxWidth: "180px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                border: "1px solid var(--border-light)",
                              }}
                              title={`Reason: ${learner.overrideReason}`}
                            >
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{learner.overrideReason}</span>
                            </span>
                          )}
                        </div>
                      </td>

                      <td>
                        <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                          <span style={{ fontWeight: 600, fontSize: "0.86rem", color: "var(--text-primary)" }}>
                            {learner.minutesPresent} mins
                          </span>
                          <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                            ({Math.round(learner.attendancePercentage)}%)
                          </span>
                        </div>
                      </td>

                      <td>
                        <span style={{ fontSize: "0.84rem", color: learner.joinTimeUtc ? "var(--text-primary)" : "var(--text-muted)" }}>
                          {formatLocalTime(learner.joinTimeUtc)}
                        </span>
                      </td>

                      <td>
                        <span style={{ fontSize: "0.84rem", color: learner.leaveTimeUtc ? "var(--text-primary)" : "var(--text-muted)" }}>
                          {formatLocalTime(learner.leaveTimeUtc)}
                        </span>
                      </td>

                      <td>
                        {sourceLabel === "—" ? (
                          <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>—</span>
                        ) : (
                          <span
                            style={{
                              fontSize: "0.74rem",
                              padding: "2px 8px",
                              borderRadius: "6px",
                              fontWeight: 600,
                              background: sourceLabel === "Zoom" ? "#f0f9ff" : "#fdf8f0",
                              color: sourceLabel === "Zoom" ? "#0369a1" : "#9a5b13",
                              border: sourceLabel === "Zoom" ? "1px solid #bae6fd" : "1px solid #f3e5ce",
                            }}
                          >
                            {sourceLabel}
                          </span>
                        )}
                      </td>

                      <td style={{ textAlign: "right" }}>
                        <button
                          type="button"
                          className={styles.secondaryBtn}
                          onClick={() => handleOpenOverride(learner)}
                          style={{
                            padding: "4px 10px",
                            fontSize: "0.76rem",
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

        {sortedLearners.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalItems={sortedLearners.length}
            pageSize={pageSize}
            onPageChange={(p) => setCurrentPage(p)}
            onPageSizeChange={(sz) => {
              setPageSize(sz);
              setCurrentPage(1);
            }}
            pageSizeOptions={[10, 20, 50]}
            itemLabel="learners"
          />
        )}
      </section>

      {/* Unmatched Zoom Guests Section (Directly Integrated into Attendance Page) */}
      {data?.unmatched && data.unmatched.length > 0 && (
        <section className={styles.tableSection}>
          <div
            style={{
              padding: "14px 18px",
              borderBottom: "1px solid var(--border-light)",
              background: "#fdf8f0",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "8px",
            }}
          >
            <h2 style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
              Unmatched Zoom Guests ({data.unmatched.length})
            </h2>
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
              Link guests who joined with a device or guest name to an enrolled learner
            </span>
          </div>

          <div className={styles.tableWrapper} style={{ overflowX: "auto" }}>
            <table className={styles.adminTable} style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Attendee Name</th>
                  <th>Attendee Email</th>
                  <th>Time Present</th>
                  <th>Join Time (Local)</th>
                  <th>Leave Time (Local)</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.unmatched.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span style={{ fontWeight: 600, fontSize: "0.86rem", color: "var(--text-primary)" }}>
                        {item.participantName}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                        {item.participantEmail || "(Guest / No email)"}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, fontSize: "0.84rem" }}>{item.minutesPresent} mins</span>
                    </td>
                    <td>
                      <span style={{ fontSize: "0.84rem", color: "var(--text-secondary)" }}>
                        {formatLocalTime(item.joinTimeUtc)}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: "0.84rem", color: "var(--text-secondary)" }}>
                        {formatLocalTime(item.leaveTimeUtc)}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: "6px", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          className={styles.primaryBtn}
                          onClick={() => handleOpenLinkModal(item)}
                          style={{ padding: "4px 10px", fontSize: "0.76rem" }}
                        >
                          Link to Learner
                        </button>
                        <button
                          type="button"
                          className={styles.secondaryBtn}
                          onClick={() => {
                            setItemToDismiss(item);
                            setDismissError(null);
                          }}
                          style={{ padding: "4px 10px", fontSize: "0.76rem" }}
                        >
                          Dismiss
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Clean Edit Attendance Modal */}
      {overrideModal.isOpen && overrideModal.learner && (
        <Modal
          isOpen={overrideModal.isOpen}
          title={`Edit Attendance — ${overrideModal.learner.name}`}
          onClose={() => setOverrideModal((prev) => ({ ...prev, isOpen: false }))}
          maxWidth="440px"
        >
          <form onSubmit={submitOverride} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className={styles.formGroup}>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 600, marginBottom: "4px" }}>
                Status
              </label>
              <CustomSelect
                value={overrideModal.status}
                onChange={handleOverrideStatusChange}
                options={[
                  { value: "PRESENT", label: "Present" },
                  { value: "ABSENT", label: "Absent" },
                  { value: "EXCUSED", label: "Excused" },
                ]}
                fullWidth
                ariaLabel="Status"
              />
            </div>

            <div className={styles.formGroup}>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 600, marginBottom: "4px" }}>
                Duration (Minutes)
              </label>
              <input
                type="number"
                min={0}
                max={360}
                value={overrideModal.minutesPresent}
                disabled={overrideModal.status === "ABSENT"}
                onChange={(e) => setOverrideModal((prev) => ({ ...prev, minutesPresent: Number(e.target.value) }))}
                className={styles.formInput}
                style={{ width: "100%", opacity: overrideModal.status === "ABSENT" ? 0.6 : 1 }}
              />
            </div>

            <div className={styles.formGroup}>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 600, marginBottom: "4px" }}>
                Reason <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <textarea
                required
                rows={2}
                placeholder="Reason for manual update..."
                value={overrideModal.reason}
                onChange={(e) => setOverrideModal((prev) => ({ ...prev, reason: e.target.value, error: "" }))}
                className={styles.formInput}
                style={{ resize: "vertical", width: "100%" }}
              />
            </div>

            {overrideModal.error && (
              <div style={{ color: "#dc2626", background: "#fef2f2", padding: "8px 12px", borderRadius: "6px", fontSize: "0.8rem", border: "1px solid #fecaca" }}>
                {overrideModal.error}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "4px" }}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setOverrideModal((prev) => ({ ...prev, isOpen: false }))}
              >
                Cancel
              </button>
              <button type="submit" className={styles.primaryBtn} disabled={overrideModal.loading}>
                {overrideModal.loading ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Link Unmatched Guest to Learner Modal */}
      {linkModal.isOpen && linkModal.unmatchedItem && (
        <Modal
          isOpen={linkModal.isOpen}
          title={`Link Attendee — ${linkModal.unmatchedItem.participantName}`}
          onClose={() => setLinkModal((prev) => ({ ...prev, isOpen: false }))}
          maxWidth="440px"
        >
          <form onSubmit={submitLink} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ background: "#fdf8f0", border: "1px solid #ebdccb", padding: "0.75rem", borderRadius: "8px", fontSize: "0.82rem" }}>
              <div>
                <strong>Zoom Attendee:</strong> {linkModal.unmatchedItem.participantName} ({linkModal.unmatchedItem.participantEmail || "Guest"})
              </div>
              <div style={{ color: "var(--accent-primary)", marginTop: "2px", fontWeight: 600 }}>
                Time Present: {linkModal.unmatchedItem.minutesPresent} mins
              </div>
            </div>

            <div className={styles.formGroup}>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 600, marginBottom: "4px" }}>
                Select Enrolled Learner
              </label>
              <CustomSelect
                value={linkModal.selectedUserId}
                onChange={(val) => setLinkModal((prev) => ({ ...prev, selectedUserId: val }))}
                options={(data?.unlinkedLearners?.length ? data.unlinkedLearners : data?.learners || []).map((l) => ({
                  value: l.userId,
                  label: `${l.name} (${l.email})`,
                }))}
                fullWidth
                ariaLabel="Select Enrolled Learner"
              />
            </div>

            <div className={styles.formGroup}>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 600, marginBottom: "4px" }}>
                Reason <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <textarea
                required
                rows={2}
                value={linkModal.reason}
                onChange={(e) => setLinkModal((prev) => ({ ...prev, reason: e.target.value }))}
                className={styles.formInput}
                style={{ width: "100%", resize: "vertical" }}
              />
            </div>

            {linkModal.error && (
              <div style={{ color: "#dc2626", background: "#fef2f2", padding: "8px 12px", borderRadius: "6px", fontSize: "0.8rem", border: "1px solid #fecaca" }}>
                {linkModal.error}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "4px" }}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setLinkModal((prev) => ({ ...prev, isOpen: false }))}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={styles.primaryBtn}
                disabled={linkModal.loading || !linkModal.selectedUserId}
              >
                {linkModal.loading ? "Linking..." : "Link Attendee"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ConfirmDialog for Unmatched Attendee Dismissal */}
      <ConfirmDialog
        isOpen={Boolean(itemToDismiss)}
        onClose={() => {
          if (!isDismissing) {
            setItemToDismiss(null);
            setDismissError(null);
          }
        }}
        onConfirm={confirmDismiss}
        title="Dismiss Unmatched Attendee?"
        subtitle={itemToDismiss?.participantName}
        description="Are you sure you want to dismiss this unmatched attendee from attendance reconciliation?"
        tone="danger"
        confirmText={isDismissing ? "Dismissing..." : "Dismiss"}
        cancelText="Cancel"
        isLoading={isDismissing}
        error={dismissError}
        itemDetails={
          itemToDismiss
            ? [
                { label: "Attendee Name", value: itemToDismiss.participantName },
                { label: "Attendee Email", value: itemToDismiss.participantEmail || "(Guest / No email)" },
                { label: "Time Present", value: `${itemToDismiss.minutesPresent} mins` },
              ]
            : []
        }
      />
    </div>
  );
}
