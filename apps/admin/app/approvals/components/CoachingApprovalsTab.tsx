"use client";

import { useEffect, useState, useMemo, FormEvent } from "react";
import Link from "next/link";
import styles from "../../page.module.css";
import {
  API_URL,
  errorMessage,
  fetchOneOnOneRequests,
  approveOneOnOneRequest,
  rejectOneOnOneRequest,
  type OneOnOneRequestItem,
} from "../../lib/api";
import { formatWhenInTz, localWallTimeToUtc, getSystemTimezone } from "../../lib/timezone";
import {
  Modal,
  StatusBadge,
  TableSkeleton,
  EmptyState,
  CustomSelect,
  Pagination,
  SortIndicator,
  DatePicker,
  TimePicker,
  useToast,
  type SortOrder,
} from "../../components";

interface BatchOption {
  id: string;
  name: string;
  programId?: string;
  program?: {
    id: string;
    title: string;
  };
}

interface CoachingApprovalsTabProps {
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
  onPendingCountChange?: (count: number) => void;
  onTotalCountChange?: (count: number) => void;
  batchId?: string;
  onBatchChange?: (batchId: string) => void;
  batches?: BatchOption[];
}

type CoachingSortField = "learner" | "program" | "requestedStart" | "status";

function formatSessionSlotParts(start: string, end: string, timeZone: string): { date: string; time: string } {
  if (!start) return { date: "TBD", time: "" };
  const s = new Date(start);
  if (isNaN(s.getTime())) return { date: "TBD", time: "" };
  const tz = timeZone || "UTC";
  try {
    const dateFormatted = s.toLocaleDateString(undefined, {
      timeZone: tz,
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const startTime = s.toLocaleTimeString(undefined, {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    let timeFormatted = startTime;
    if (end) {
      const e = new Date(end);
      if (!isNaN(e.getTime())) {
        const endTime = e.toLocaleTimeString(undefined, {
          timeZone: tz,
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });
        timeFormatted = startTime + " – " + endTime;
      }
    }
    return { date: dateFormatted, time: timeFormatted };
  } catch {
    return { date: s.toLocaleDateString(), time: s.toLocaleTimeString() };
  }
}

export default function CoachingApprovalsTab({
  onError,
  onSuccess,
  onPendingCountChange,
  onTotalCountChange,
  batchId = "",
  onBatchChange,
  batches = [],
}: CoachingApprovalsTabProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [requests, setRequests] = useState<OneOnOneRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");
  const [programFilter, setProgramFilter] = useState<string>("ALL");

  // Sorting & Pagination
  const [sortField, setSortField] = useState<CoachingSortField>("requestedStart");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Approve Modal State
  const displayTimezone = getSystemTimezone();
  const [approvingReq, setApprovingReq] = useState<OneOnOneRequestItem | null>(null);
  const [approvalDate, setApprovalDate] = useState("");
  const [approvalStartTime, setApprovalStartTime] = useState("10:00");
  const [approvalEndTime, setApprovalEndTime] = useState("10:45");
  const [approvalNotes, setApprovalNotes] = useState("");
  const [approvalMeetingLink, setApprovalMeetingLink] = useState("");
  const [submittingApproval, setSubmittingApproval] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  // Expired / Past-Due helpers for modal
  const isApprovingPast = useMemo(() => {
    if (!approvingReq?.requestedStart) return false;
    return new Date(approvingReq.requestedStart).getTime() < Date.now();
  }, [approvingReq]);

  const originalSlotText = useMemo(() => {
    if (!approvingReq?.requestedStart) return "";
    const { date, time } = formatSessionSlotParts(
      approvingReq.requestedStart,
      approvingReq.requestedEnd,
      displayTimezone
    );
    return date + (time ? " at " + time : "");
  }, [approvingReq, displayTimezone]);

  // Reject Modal State
  const [rejectingReq, setRejectingReq] = useState<OneOnOneRequestItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [submittingReject, setSubmittingReject] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  // Mark Completed Action State
  const [completingId, setCompletingId] = useState<string | null>(null);

  async function loadRequests() {
    setLoading(true);
    try {
      const data = await fetchOneOnOneRequests();
      const safeData = Array.isArray(data) ? data : [];
      setRequests(safeData);
      const pending = safeData.filter((r) => r.status === "PENDING_APPROVAL").length;
      if (onPendingCountChange) onPendingCountChange(pending);
      if (onTotalCountChange) onTotalCountChange(safeData.length);
    } catch (err: any) {
      console.error("Failed to load 1-on-1 requests:", err);
      onError(err.message || "Failed to load coaching requests");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRequests();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [filter, search, programFilter, batchId]);

  const handleSort = (field: CoachingSortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const programOptions = useMemo(() => {
    const titles = new Set<string>();
    for (const b of batches) {
      if (b.program?.title) titles.add(b.program.title);
    }
    for (const r of requests) {
      if (r.enrolment?.program?.title) titles.add(r.enrolment.program.title);
    }
    return [
      { value: "ALL", label: "All Programs" },
      ...Array.from(titles)
        .sort((a, b) => a.localeCompare(b))
        .map((t) => ({ value: t, label: t })),
    ];
  }, [batches, requests]);

  const batchOptions = useMemo(() => {
    return [
      { value: "", label: "All Batches" },
      { value: "UNASSIGNED", label: "Direct / No Batch" },
      ...batches.map((b) => ({
        value: b.id,
        label: b.name,
      })),
    ];
  }, [batches]);

  const contextFilteredRequests = useMemo(() => {
    return requests.filter((r) => {
      const reqBatchId = r.enrolment?.batch?.id || (r.enrolment as any)?.batchId || "";
      const reqBatchName = r.enrolment?.batch?.name || "";
      const reqProgramTitle = r.enrolment?.program?.title || "";

      if (batchId === "UNASSIGNED") {
        if (reqBatchId) return false;
      } else if (batchId) {
        if (reqBatchId !== batchId) return false;
      }

      if (programFilter !== "ALL") {
        if (reqProgramTitle.toLowerCase() !== programFilter.toLowerCase()) return false;
      }

      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchesName = r.user?.name?.toLowerCase().includes(q);
        const matchesEmail = r.user?.email?.toLowerCase().includes(q);
        const matchesProg = reqProgramTitle.toLowerCase().includes(q);
        const matchesBatch = reqBatchName.toLowerCase().includes(q);
        const matchesNotes = r.notes?.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesProg && !matchesBatch && !matchesNotes) {
          return false;
        }
      }

      return true;
    });
  }, [requests, batchId, programFilter, search]);

  const statusCounts = useMemo(() => {
    const counts = {
      ALL: contextFilteredRequests.length,
      PENDING_APPROVAL: 0,
      APPROVED: 0,
      COMPLETED: 0,
      REJECTED: 0,
    };
    for (const r of contextFilteredRequests) {
      const isCompleted = Boolean(r.session?.id && (r.session as any)?.status === "COMPLETED");
      if (r.status === "PENDING_APPROVAL") counts.PENDING_APPROVAL++;
      if (r.status === "APPROVED" && !isCompleted) counts.APPROVED++;
      if (isCompleted) counts.COMPLETED++;
      if (r.status === "REJECTED" || r.status === "CANCELLED") counts.REJECTED++;
    }
    return counts;
  }, [contextFilteredRequests]);

  const statusFilterOptions = useMemo(() => {
    return [
      { value: "ALL", label: `All Statuses (${statusCounts.ALL})` },
      { value: "PENDING_APPROVAL", label: `Pending (${statusCounts.PENDING_APPROVAL})` },
      { value: "APPROVED", label: `Scheduled (${statusCounts.APPROVED})` },
      { value: "COMPLETED", label: `Completed (${statusCounts.COMPLETED})` },
      { value: "REJECTED", label: `Rejected (${statusCounts.REJECTED})` },
    ];
  }, [statusCounts]);

  const filteredRequests = useMemo(() => {
    return contextFilteredRequests.filter((r) => {
      const isCompleted = Boolean(r.session?.id && (r.session as any)?.status === "COMPLETED");
      if (filter === "ALL") return true;
      if (filter === "PENDING_APPROVAL") return r.status === "PENDING_APPROVAL";
      if (filter === "APPROVED") return r.status === "APPROVED" && !isCompleted;
      if (filter === "COMPLETED") return isCompleted;
      if (filter === "REJECTED") return r.status === "REJECTED" || r.status === "CANCELLED";
      return true;
    });
  }, [contextFilteredRequests, filter]);

  const sortedRequests = useMemo(() => {
    return [...filteredRequests].sort((a, b) => {
      let cmp = 0;
      if (sortField === "learner") {
        cmp = (a.user?.name || a.user?.email || "").localeCompare(b.user?.name || b.user?.email || "");
      } else if (sortField === "program") {
        cmp = (a.enrolment?.program?.title || "").localeCompare(b.enrolment?.program?.title || "");
      } else if (sortField === "requestedStart") {
        const tA = a.requestedStart ? new Date(a.requestedStart).getTime() : 0;
        const tB = b.requestedStart ? new Date(b.requestedStart).getTime() : 0;
        cmp = tA - tB;
      } else if (sortField === "status") {
        cmp = (a.status || "").localeCompare(b.status || "");
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });
  }, [filteredRequests, sortField, sortOrder]);

  const paginatedRequests = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedRequests.slice(start, start + pageSize);
  }, [sortedRequests, page, pageSize]);

  const hasActiveFilters = Boolean(
    filter !== "ALL" || search.trim() || programFilter !== "ALL" || batchId !== ""
  );

  const resetAllFilters = () => {
    setFilter("ALL");
    setSearch("");
    setProgramFilter("ALL");
    if (onBatchChange) onBatchChange("");
    setPage(1);
  };

  function handleOpenApprove(req: OneOnOneRequestItem) {
    setApprovingReq(req);
    setApprovalError(null);
    const startD = new Date(req.requestedStart);
    const endD = new Date(req.requestedEnd);
    const isPast = startD.getTime() < Date.now();

    if (isPast) {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMin = now.getMinutes();
      const todayStr = now.toISOString().split("T")[0] || "";

      // Allow scheduling TODAY if earlier than 19:00, otherwise tomorrow
      if (currentHour < 19) {
        setApprovalDate(todayStr);
        const nextHour = currentMin >= 30 ? currentHour + 2 : currentHour + 1;
        const clampedH = Math.min(Math.max(nextHour, 10), 20);
        setApprovalStartTime(String(clampedH).padStart(2, '0') + ':00');
        setApprovalEndTime(String(clampedH).padStart(2, '0') + ':45');
      } else {
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
        setApprovalDate(tomorrow.toISOString().split("T")[0] || "");
        setApprovalStartTime("10:00");
        setApprovalEndTime("10:45");
      }
    } else {
      setApprovalDate(startD.toISOString().split("T")[0] || "");
      setApprovalStartTime(startD.toTimeString().slice(0, 5) || "10:00");
      setApprovalEndTime(endD.toTimeString().slice(0, 5) || "10:45");
    }
    setApprovalNotes(req.notes || "");
    setApprovalMeetingLink(req.session?.joinUrl || "");
  }

  async function handleSubmitApproval(e: FormEvent) {
    e.preventDefault();
    if (!approvingReq) return;
    setApprovalError(null);

    const start = localWallTimeToUtc(approvalDate, approvalStartTime, displayTimezone);
    const end = localWallTimeToUtc(approvalDate, approvalEndTime, displayTimezone);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      setApprovalError("Invalid date or time entered.");
      return;
    }

    if (end.getTime() <= start.getTime()) {
      setApprovalError("End time must be after start time.");
      return;
    }

    if (start.getTime() < Date.now() - 60 * 1000) {
      setApprovalError("Cannot accept or schedule a session in the past. Please select an upcoming date and time.");
      return;
    }

    setSubmittingApproval(true);
    try {
      await approveOneOnOneRequest(approvingReq.id, {
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        notes: approvalNotes,
        meetingLink: approvalMeetingLink.trim() || undefined,
      });
      const msg = `1:1 Call for ${approvingReq.user?.name || "learner"} approved and scheduled.`;
      onSuccess(msg);
      toastSuccess(msg);
      setApprovingReq(null);
      await loadRequests();
    } catch (err: any) {
      const msg = err.message || "Failed to approve coaching request";
      setApprovalError(msg);
      toastError(msg);
    } finally {
      setSubmittingApproval(false);
    }
  }

  async function handleSubmitReject(e: FormEvent) {
    e.preventDefault();
    if (!rejectingReq || !rejectReason.trim()) return;
    setRejectError(null);
    setSubmittingReject(true);
    try {
      await rejectOneOnOneRequest(rejectingReq.id, rejectReason.trim());
      const msg = `1:1 Call request declined and learner notified.`;
      onSuccess(msg);
      toastSuccess(msg);
      setRejectingReq(null);
      setRejectReason("");
      await loadRequests();
    } catch (err: any) {
      const msg = err.message || "Failed to reject coaching request";
      setRejectError(msg);
      toastError(msg);
    } finally {
      setSubmittingReject(false);
    }
  }

  async function handleMarkCompleted(sessionId: string, learnerName: string) {
    setCompletingId(sessionId);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_URL}/sessions/${sessionId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status: "COMPLETED" }),
      });
      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to complete session"));
      }
      const msg = `1:1 Call with ${learnerName} marked completed.`;
      onSuccess(msg);
      toastSuccess(msg);
      await loadRequests();
    } catch (err: any) {
      const msg = err.message || "Failed to mark session completed";
      onError(msg);
      toastError(msg);
    } finally {
      setCompletingId(null);
    }
  }

  return (
    <section className={styles.tableSection}>
      {/* Scope Clarification Banner */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "8px",
          padding: "8px 14px",
          marginBottom: "12px",
          background: "#fdf8ee",
          border: "1px solid #f2e3c6",
          borderRadius: "8px",
          fontSize: "0.82rem",
          color: "var(--text-secondary, #6b5844)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "0.95rem" }}>💡</span>
          <span>
            This tab is for <strong>Stage 4 Curriculum 1-on-1 Coaching Calls</strong> (enrolled students).
          </span>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <span>Looking for website 15-min discovery calls?</span>
          <Link
            href="/leads"
            style={{
              color: "var(--accent-primary, #b8860b)",
              fontWeight: 600,
              textDecoration: "underline",
            }}
          >
            Enquiries (Leads) &rarr;
          </Link>
          <span style={{ color: "#d6c2a8" }}>•</span>
          <Link
            href="/meetings"
            style={{
              color: "var(--accent-primary, #b8860b)",
              fontWeight: 600,
              textDecoration: "underline",
            }}
          >
            Calendar &amp; Sessions &rarr;
          </Link>
        </div>
      </div>

      {/* Search & Filters Header */}
      <div
        className={styles.sectionHeader}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        {/* Left: Search Input */}
        <div
          className={styles.searchContainer}
          style={{ minWidth: "240px", flex: "1 1 260px", maxWidth: "340px" }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{ color: "var(--text-muted)", flexShrink: 0, marginRight: "0.45rem" }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search learner, email, or batch..."
            className={styles.searchInput}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search 1:1 call requests"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                padding: "0 2px",
                fontSize: "0.85rem",
                lineHeight: 1,
              }}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Right: Status, Program & Batch Filters */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
          <CustomSelect
            value={filter}
            onChange={(val) => setFilter(val)}
            options={statusFilterOptions}
            minWidth="170px"
            ariaLabel="Filter by Status"
          />
          <CustomSelect
            value={programFilter}
            onChange={(val) => setProgramFilter(val)}
            options={programOptions}
            minWidth="175px"
            ariaLabel="Filter by Program"
          />
          {onBatchChange && (
            <CustomSelect
              value={batchId}
              onChange={(val) => onBatchChange(val)}
              options={batchOptions}
              minWidth="175px"
              ariaLabel="Filter by Batch"
            />
          )}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetAllFilters}
              className={styles.secondaryBtnSmall}
              style={{ height: "36px", padding: "0 0.85rem" }}
            >
              Reset
            </button>
          )}
        </div>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.adminTable}>
          <thead>
            <tr>
              <th
                onClick={() => handleSort("learner")}
                style={{ cursor: "pointer", userSelect: "none" }}
              >
                Learner
                <SortIndicator active={sortField === "learner"} order={sortOrder} />
              </th>
              <th
                onClick={() => handleSort("program")}
                style={{ cursor: "pointer", userSelect: "none" }}
              >
                Program &amp; Batch
                <SortIndicator active={sortField === "program"} order={sortOrder} />
              </th>
              <th
                onClick={() => handleSort("requestedStart")}
                style={{ cursor: "pointer", userSelect: "none" }}
              >
                Session Slot
                <SortIndicator active={sortField === "requestedStart"} order={sortOrder} />
              </th>
              <th>Notes</th>
              <th
                onClick={() => handleSort("status")}
                style={{ cursor: "pointer", userSelect: "none" }}
              >
                Status
                <SortIndicator active={sortField === "status"} order={sortOrder} />
              </th>
              <th className={styles.alignRight}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton rows={5} columns={6} />
            ) : paginatedRequests.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: "36px 16px" }}>
                  <EmptyState
                    icon="calendar"
                    title={hasActiveFilters ? "No 1:1 calls match your filters" : "No 1:1 call requests yet"}
                    description={
                      hasActiveFilters
                        ? "Try clearing your search or switching the active filter."
                        : "When learners reach Stage 4 and request their 1:1 call, their requests will appear here."
                    }
                    actionLabel={hasActiveFilters ? "Reset Filters" : undefined}
                    onAction={hasActiveFilters ? resetAllFilters : undefined}
                  />
                </td>
              </tr>
            ) : (
              paginatedRequests.map((req) => {
                const isPending = req.status === "PENDING_APPROVAL";
                const isApproved = req.status === "APPROVED";
                const isCompleted = Boolean(
                  req.session?.id && (req.session as any)?.status === "COMPLETED"
                );

                const slotStart = req.session?.startTime || req.requestedStart;
                const slotEnd = req.session?.endTime || req.requestedEnd;
                const isPastSlot = isPending && Boolean(req.requestedStart) && new Date(req.requestedStart).getTime() < Date.now();
                const { date: slotDate, time: slotTime } = formatSessionSlotParts(slotStart, slotEnd, displayTimezone);
                const hostMeetingUrl = (req.session as any)?.hostUrl || req.session?.joinUrl;

                return (
                  <tr key={req.id}>
                    {/* Learner */}
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        {req.user?.id ? (
                          <Link
                            href={`/users/${req.user.id}`}
                            className={styles.cohortLink}
                            style={{ fontSize: "0.875rem" }}
                          >
                            {req.user.name || "Learner"}
                          </Link>
                        ) : (
                          <span className={styles.cellUserName}>
                            {req.user?.name || "Learner"}
                          </span>
                        )}
                        {req.user?.email && (
                          <span className={styles.cellUserEmail}>{req.user.email}</span>
                        )}
                      </div>
                    </td>

                    {/* Program & Batch */}
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.85rem" }}>
                          {req.enrolment?.program?.title || "11 Steps Programme"}
                        </span>
                        <span className={styles.cellTextMuted}>
                          {req.enrolment?.batch?.name || "Direct Enrolment"}
                        </span>
                      </div>
                    </td>

                    {/* Session Slot */}
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        <span style={{ fontWeight: 600, color: isPastSlot ? "#b91c1c" : "var(--text-primary)", fontSize: "0.84rem" }}>
                          {slotDate}
                        </span>
                        {slotTime && (
                          <span style={{ fontSize: "0.76rem", color: isPastSlot ? "#b91c1c" : "var(--text-secondary)", whiteSpace: "nowrap" }}>
                            {slotTime}
                          </span>
                        )}
                        {isPastSlot && (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "3px",
                              fontSize: "0.7rem",
                              color: "#b91c1c",
                              fontWeight: 600,
                              background: "#fef2f2",
                              border: "1px solid #fecaca",
                              borderRadius: "4px",
                              padding: "1px 6px",
                              width: "fit-content",
                              marginTop: "2px",
                            }}
                          >
                            ⚠️ Slot passed
                          </span>
                        )}
                        {hostMeetingUrl && !isCompleted && (
                          <a
                            href={hostMeetingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: "0.76rem",
                              color: "var(--accent-primary, #c97a1e)",
                              fontWeight: 600,
                              textDecoration: "none",
                              marginTop: "2px",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "3px",
                            }}
                          >
                            Start Call (Host) &nearr;
                          </a>
                        )}
                      </div>
                    </td>

                    {/* Notes */}
                    <td>
                      {req.notes ? (
                        <div
                          style={{
                            fontSize: "0.8125rem",
                            color: "var(--text-secondary)",
                            maxWidth: 220,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={req.notes}
                        >
                          {req.notes}
                        </div>
                      ) : (
                        <span className={styles.cellTextMuted}>—</span>
                      )}
                    </td>

                    {/* Status */}
                    <td>
                      {isPastSlot ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px", alignItems: "flex-start" }}>
                          <StatusBadge status="EXPIRED" />
                          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Past due</span>
                        </div>
                      ) : (
                        <StatusBadge status={isCompleted ? "COMPLETED" : req.status} />
                      )}
                    </td>

                    {/* Actions */}
                    <td className={styles.alignRight}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "flex-end",
                          gap: "6px",
                          alignItems: "center",
                        }}
                      >
                        {isPending && (
                          <>
                            <button
                              type="button"
                              className={styles.primaryBtnSmall}
                              onClick={() => handleOpenApprove(req)}
                              title={isPastSlot ? "Slot has passed - reschedule for today or future" : "Approve and schedule session"}
                            >
                              {isPastSlot ? "Reschedule" : "Schedule"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRejectingReq(req);
                                setRejectReason("");
                                setRejectError(null);
                              }}
                              style={{
                                background: "#ffffff",
                                color: "#dc2626",
                                border: "1px solid #fca5a5",
                                padding: "0.35rem 0.65rem",
                                borderRadius: "6px",
                                fontWeight: 600,
                                fontSize: "0.78rem",
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                              }}
                              onMouseEnter={(e) => {
                                (e.currentTarget as HTMLElement).style.background = "#fef2f2";
                                (e.currentTarget as HTMLElement).style.borderColor = "#f87171";
                              }}
                              onMouseLeave={(e) => {
                                (e.currentTarget as HTMLElement).style.background = "#ffffff";
                                (e.currentTarget as HTMLElement).style.borderColor = "#fca5a5";
                              }}
                            >
                              Decline
                            </button>
                          </>
                        )}

                        {isApproved && req.sessionId && !isCompleted && (
                          <button
                            type="button"
                            className={styles.primaryBtnSmall}
                            disabled={completingId === req.sessionId}
                            onClick={() =>
                              handleMarkCompleted(req.sessionId!, req.user?.name || "Learner")
                            }
                          >
                            {completingId === req.sessionId ? "Saving..." : "Mark Completed"}
                          </button>
                        )}

                        {(!isPending && (!isApproved || isCompleted || !req.sessionId)) && (
                          <Link
                            href={req.user?.id ? `/users/${req.user.id}` : "#"}
                            className={styles.secondaryBtnSmall}
                          >
                            View
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        currentPage={page}
        totalItems={sortedRequests.length}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => {
          setPageSize(s);
          setPage(1);
        }}
        itemLabel="1:1 calls"
      />

      {/* Approve & Schedule Modal */}
      <Modal
        isOpen={Boolean(approvingReq)}
        onClose={() => setApprovingReq(null)}
        title={isApprovingPast ? "Reschedule 1:1 Call" : "Schedule 1:1 Call"}
        subtitle={
          approvingReq
            ? `Learner: ${approvingReq.user?.name || "Learner"} (${approvingReq.user?.email || ""})`
            : ""
        }
        maxWidth="560px"
      >
        {approvingReq && (
          <form onSubmit={handleSubmitApproval} className={styles.modalForm}>
            {approvalError && <div className={styles.alertError}>{approvalError}</div>}

            {isApprovingPast && (
              <div
                style={{
                  background: "#fffbeb",
                  border: "1px solid #fde68a",
                  color: "#92400e",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  fontSize: "0.82rem",
                  marginBottom: "14px",
                  lineHeight: 1.45,
                }}
              >
                <strong>⚠️ Original Requested Slot Expired:</strong>
                <div>
                  The learner requested a slot for <strong>{originalSlotText}</strong>, which has already passed.
                  Please select a new date and time for <strong>today (upcoming time)</strong> or a future date to confirm the session.
                </div>
              </div>
            )}

            <div className={styles.formGroup}>
              <label>Session Date *</label>
              <DatePicker
                value={approvalDate}
                onChange={(val) => setApprovalDate(val)}
                placeholder="Select session date"
                minDate={new Date().toISOString().split("T")[0]}
              />
            </div>

            <div className={styles.formRow} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div className={styles.formGroup}>
                <label>Start Time ({displayTimezone}) *</label>
                <TimePicker
                  value={approvalStartTime}
                  onChange={(val) => setApprovalStartTime(val)}
                />
              </div>

              <div className={styles.formGroup}>
                <label>End Time ({displayTimezone}) *</label>
                <TimePicker
                  value={approvalEndTime}
                  onChange={(val) => setApprovalEndTime(val)}
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="coaching-meeting-link">Custom Meeting Link (Optional)</label>
              <input
                id="coaching-meeting-link"
                type="url"
                value={approvalMeetingLink}
                onChange={(e) => setApprovalMeetingLink(e.target.value)}
                placeholder="e.g. https://meet.google.com/... (Leave blank to auto-generate Zoom)"
                className={styles.modalInput}
                style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border-light, #ece4d7)", borderRadius: "8px", fontSize: "0.85rem", boxSizing: "border-box" }}
              />
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "4px", display: "block" }}>
                Leave blank to automatically provision an official Zoom room with Host and Guest links.
              </span>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="coaching-notes">Agenda / Notes (Optional)</label>
              <textarea
                id="coaching-notes"
                rows={3}
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                placeholder="Session notes or focus areas..."
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "1.25rem" }}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setApprovingReq(null)}
                disabled={submittingApproval}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={styles.primaryBtn}
                disabled={submittingApproval}
              >
                {submittingApproval
                  ? "Scheduling..."
                  : isApprovingPast
                  ? "Confirm & Reschedule"
                  : "Confirm & Schedule"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Reject Request Modal */}
      <Modal
        isOpen={Boolean(rejectingReq)}
        onClose={() => setRejectingReq(null)}
        title="Decline 1:1 Call Request"
        subtitle={
          rejectingReq
            ? `Notify ${rejectingReq.user?.name || "learner"} to choose an alternative slot`
            : ""
        }
        maxWidth="480px"
      >
        {rejectingReq && (
          <form onSubmit={handleSubmitReject} className={styles.modalForm}>
            {rejectError && <div className={styles.alertError}>{rejectError}</div>}

            <div className={styles.formGroup}>
              <label htmlFor="reject-reason">Reason / Suggested Alternative Times *</label>
              <textarea
                id="reject-reason"
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Please request a slot on Thursday between 2:00 PM and 5:00 PM."
                required
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "1.25rem" }}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setRejectingReq(null)}
                disabled={submittingReject}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingReject || !rejectReason.trim()}
                style={{
                  background: "#dc2626",
                  border: "1px solid #dc2626",
                  color: "#ffffff",
                  padding: "0.55rem 1.15rem",
                  borderRadius: "8px",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  cursor: submittingReject || !rejectReason.trim() ? "not-allowed" : "pointer",
                  opacity: submittingReject || !rejectReason.trim() ? 0.65 : 1,
                  transition: "all 0.18s ease",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.45rem",
                }}
              >
                {submittingReject ? "Declining..." : "Decline Request"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </section>
  );
}
