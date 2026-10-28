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
import { Modal, StatusBadge, TableSkeleton, EmptyState } from "../../components";

interface CoachingApprovalsTabProps {
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
  onPendingCountChange?: (count: number) => void;
}

export default function CoachingApprovalsTab({
  onError,
  onSuccess,
  onPendingCountChange,
}: CoachingApprovalsTabProps) {
  const [requests, setRequests] = useState<OneOnOneRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("ALL");

  // Approve Modal State
  const [approvingReq, setApprovingReq] = useState<OneOnOneRequestItem | null>(null);
  const [approvalDate, setApprovalDate] = useState("");
  const [approvalStartTime, setApprovalStartTime] = useState("10:00");
  const [approvalEndTime, setApprovalEndTime] = useState("10:45");
  const [approvalNotes, setApprovalNotes] = useState("");
  const [submittingApproval, setSubmittingApproval] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  // Reject Modal State
  const [rejectingReq, setRejectingReq] = useState<OneOnOneRequestItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [submittingReject, setSubmittingReject] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  // Mark Completed Action State
  const [completingId, setCompletingId] = useState<string | null>(null);

  const displayTimezone = getSystemTimezone();

  async function loadRequests() {
    setLoading(true);
    try {
      const data = await fetchOneOnOneRequests();
      setRequests(data);
      const pending = data.filter((r) => r.status === "PENDING_APPROVAL").length;
      if (onPendingCountChange) onPendingCountChange(pending);
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

  const pendingCount = useMemo(() => {
    return requests.filter((r) => r.status === "PENDING_APPROVAL").length;
  }, [requests]);

  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (filter === "ALL") return true;
      if (filter === "PENDING_APPROVAL") return r.status === "PENDING_APPROVAL";
      if (filter === "APPROVED") return r.status === "APPROVED";
      if (filter === "COMPLETED") return r.session?.id && (r.session as any)?.status === "COMPLETED";
      if (filter === "REJECTED") return r.status === "REJECTED" || r.status === "CANCELLED";
      return true;
    });
  }, [requests, filter]);

  function handleOpenApprove(req: OneOnOneRequestItem) {
    setApprovingReq(req);
    setApprovalError(null);
    const startD = new Date(req.requestedStart);
    const endD = new Date(req.requestedEnd);
    const isPast = startD.getTime() < Date.now();

    if (isPast) {
      // Slot in past! Cannot accept past time, default to tomorrow at 10:00 AM
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      setApprovalDate(tomorrow.toISOString().split("T")[0] || "");
      setApprovalStartTime("10:00");
      setApprovalEndTime("10:45");
    } else {
      setApprovalDate(startD.toISOString().split("T")[0] || "");
      setApprovalStartTime(startD.toTimeString().slice(0, 5) || "10:00");
      setApprovalEndTime(endD.toTimeString().slice(0, 5) || "10:45");
    }
    setApprovalNotes(req.notes || "");
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
      });
      onSuccess(
        `1-on-1 Coaching session for ${approvingReq.user?.name || "learner"} approved and scheduled on Admin Calendar!`
      );
      setApprovingReq(null);
      await loadRequests();
    } catch (err: any) {
      setApprovalError(err.message || "Failed to approve coaching request");
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
      onSuccess(`1-on-1 coaching request rejected.`);
      setRejectingReq(null);
      setRejectReason("");
      await loadRequests();
    } catch (err: any) {
      setRejectError(err.message || "Failed to reject coaching request");
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
      onSuccess(
        `1-on-1 Coaching session with ${learnerName} marked completed! Stage 5 (Mission Statement) unlocked.`
      );
      await loadRequests();
    } catch (err: any) {
      onError(err.message || "Failed to mark session completed");
    } finally {
      setCompletingId(null);
    }
  }

  return (
    <div>
      {/* Toolbar & Filters */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          marginBottom: "1.25rem",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {["ALL", "PENDING_APPROVAL", "APPROVED", "COMPLETED", "REJECTED"].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setFilter(st)}
              style={{
                padding: "6px 14px",
                borderRadius: "20px",
                border: "1px solid",
                borderColor: filter === st ? "#b8860b" : "var(--border-light)",
                background: filter === st ? "#b8860b" : "var(--bg-card)",
                color: filter === st ? "#ffffff" : "var(--text-secondary)",
                fontSize: "0.82rem",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {st === "ALL"
                ? `All (${requests.length})`
                : st === "PENDING_APPROVAL"
                ? `Pending Approval (${pendingCount})`
                : st === "APPROVED"
                ? `Scheduled (${requests.filter((r) => r.status === "APPROVED").length})`
                : st === "COMPLETED"
                ? `Completed (${requests.filter((r) => (r.session as any)?.status === "COMPLETED").length})`
                : `Rejected (${requests.filter((r) => r.status === "REJECTED" || r.status === "CANCELLED").length})`}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Link
            href="/meetings"
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              background: "#ffffff",
              border: "1px solid #e7e0d6",
              color: "#44403c",
              fontSize: "0.82rem",
              fontWeight: 600,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
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
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span>Open Admin Calendar &rarr;</span>
          </Link>
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            {filteredRequests.length} request{filteredRequests.length === 1 ? "" : "s"} shown
          </div>
        </div>
      </div>

      {/* Main Table */}
      <section className={styles.tableCard}>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Learner</th>
                <th>Program &amp; Batch</th>
                <th>Requested Slot</th>
                <th>Breakthroughs &amp; Reflections</th>
                <th>Status</th>
                <th>Calendar Meeting</th>
                <th className={styles.alignRight}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton rows={4} columns={7} />
              ) : filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={7} className={styles.emptyState}>
                    <EmptyState
                      title="No Coaching Requests"
                      description="No 1-on-1 coaching call requests found for this filter."
                    />
                  </td>
                </tr>
              ) : (
                filteredRequests.map((req) => {
                  const isPending = req.status === "PENDING_APPROVAL";
                  const isApproved = req.status === "APPROVED";
                  const isCompleted =
                    req.session?.id && (req.session as any)?.status === "COMPLETED";

                  const startFormatted = formatWhenInTz(
                    req.requestedStart,
                    req.requestedEnd,
                    displayTimezone
                  );

                  const sessionDate = req.session?.startTime
                    ? req.session.startTime.split("T")[0]
                    : req.requestedStart.split("T")[0];

                  return (
                    <tr key={req.id}>
                      {/* Learner */}
                      <td>
                        <strong className={styles.cellTextPrimary}>
                          {req.user?.name || "Learner"}
                        </strong>
                        <div className={styles.cellTextMuted}>{req.user?.email}</div>
                        {req.user?.phone && (
                          <div style={{ fontSize: "0.75rem", color: "#a8a29e" }}>
                            {req.user.phone}
                          </div>
                        )}
                      </td>

                      {/* Program & Batch */}
                      <td>
                        <span className={styles.cellText}>
                          {req.enrolment?.program?.title || "Program"}
                        </span>
                        {req.enrolment?.batch?.name && (
                          <div className={styles.cellTextMuted}>
                            Batch: {req.enrolment.batch.name}
                          </div>
                        )}
                      </td>

                      {/* Requested Slot */}
                      <td>
                        <div style={{ fontWeight: 600, color: "#1c1917", fontSize: "0.85rem" }}>
                          {startFormatted}
                        </div>
                        {isPending && new Date(req.requestedStart).getTime() < Date.now() && (
                          <div style={{ color: "#dc2626", fontSize: "0.74rem", fontWeight: 700, marginTop: 2, display: "inline-flex", alignItems: "center", gap: "3px" }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                              <line x1="12" y1="9" x2="12" y2="13" />
                              <line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                            <span>Slot Elapsed</span>
                          </div>
                        )}
                        <div style={{ fontSize: "0.75rem", color: "#78716a" }}>
                          TZ: {req.learnerTimezone || displayTimezone}
                        </div>
                      </td>

                      {/* Notes / Questions */}
                      <td>
                        {req.notes ? (
                          <div
                            style={{
                              fontSize: "0.82rem",
                              color: "#44403c",
                              maxWidth: 240,
                              whiteSpace: "pre-wrap",
                              lineHeight: 1.35,
                            }}
                          >
                            {req.notes}
                          </div>
                        ) : (
                          <span style={{ color: "#a8a29e", fontSize: "0.82rem" }}>
                            No notes provided
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td>
                        <StatusBadge
                          status={
                            isCompleted ? "COMPLETED" : req.status
                          }
                        />
                      </td>

                      {/* Meeting Session Info */}
                      <td>
                        {req.session ? (
                          <div>
                            <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "#14110f" }}>
                              {req.session.startTime
                                ? formatWhenInTz(
                                    req.session.startTime,
                                    req.session.endTime,
                                    displayTimezone
                                  )
                                : "Scheduled"}
                            </div>
                            {req.session.hostTrainer?.name && (
                              <div style={{ fontSize: "0.75rem", color: "#78716a" }}>
                                Host: {req.session.hostTrainer.name}
                              </div>
                            )}
                            {req.session.joinUrl && (
                              <div style={{ marginTop: 2 }}>
                                <a
                                  href={req.session.joinUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    fontSize: "0.75rem",
                                    color: "#0284c7",
                                    fontWeight: 600,
                                    textDecoration: "underline",
                                  }}
                                >
                                  Join Zoom Call &rarr;
                                </a>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: "#a8a29e", fontSize: "0.82rem" }}>
                            Awaiting confirmation
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className={styles.alignRight}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "flex-end",
                            gap: "8px",
                            flexWrap: "wrap",
                          }}
                        >
                          {isPending && (
                            <>
                              <button
                                type="button"
                                className={styles.primaryBtn}
                                style={{
                                  padding: "6px 12px",
                                  fontSize: "0.82rem",
                                  background: new Date(req.requestedStart).getTime() < Date.now() ? "#d97706" : undefined,
                                  borderColor: new Date(req.requestedStart).getTime() < Date.now() ? "#b45309" : undefined,
                                }}
                                onClick={() => handleOpenApprove(req)}
                              >
                                {new Date(req.requestedStart).getTime() < Date.now()
                                  ? "Reschedule & Approve"
                                  : "Approve & Schedule"}
                              </button>
                              <button
                                type="button"
                                className={styles.dangerBtnSmall}
                                style={{ padding: "6px 10px", fontSize: "0.82rem" }}
                                onClick={() => {
                                  setRejectingReq(req);
                                  setRejectReason("");
                                }}
                              >
                                Reject
                              </button>
                            </>
                          )}

                          {isApproved && (
                            <>
                              <Link
                                href={`/meetings?date=${sessionDate}&sessionId=${req.sessionId || ""}`}
                                className={styles.secondaryBtn}
                                style={{
                                  padding: "6px 12px",
                                  fontSize: "0.82rem",
                                  textDecoration: "none",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                }}
                              >
                                <span>View on Calendar</span>
                                <span aria-hidden="true">&rarr;</span>
                              </Link>

                              {req.sessionId && !isCompleted && (
                                <button
                                  type="button"
                                  className={styles.primaryBtn}
                                  style={{
                                    padding: "6px 12px",
                                    fontSize: "0.82rem",
                                    background: "#15803d",
                                    borderColor: "#15803d",
                                  }}
                                  onClick={() =>
                                    handleMarkCompleted(req.sessionId!, req.user?.name || "learner")
                                  }
                                  disabled={completingId === req.sessionId}
                                >
                                  {completingId === req.sessionId
                                    ? "Marking..."
                                    : "Mark Completed (Unlock Stage 5)"}
                                </button>
                              )}
                            </>
                          )}

                          {isCompleted && (
                            <span
                              style={{
                                color: "#166534",
                                background: "#dcfce7",
                                padding: "4px 8px",
                                borderRadius: 6,
                                fontSize: "0.78rem",
                                fontWeight: 700,
                              }}
                            >
                              Stage 5 Unlocked
                            </span>
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
      </section>

      {/* APPROVE & SCHEDULE MODAL */}
      {approvingReq && (
        <Modal
          isOpen={true}
          onClose={() => setApprovingReq(null)}
          title="Approve & Schedule 1-on-1 Coaching Slot"
          subtitle={`Confirm coaching time with ${approvingReq.user?.name || "the learner"}. This automatically generates a Zoom link and blocks the calendar.`}
        >
          <form onSubmit={handleSubmitApproval}>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "10px" }}>
              {approvalError && (
                <div
                  style={{
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    color: "#991b1b",
                    padding: "8px 12px",
                    borderRadius: 6,
                    fontSize: "0.85rem",
                  }}
                >
                  {approvalError}
                </div>
              )}

              <div
                style={{
                  background: "#fdfbf7",
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "1px solid #f0ebe4",
                  fontSize: "0.85rem",
                }}
              >
                <div>
                  <strong>Learner:</strong> {approvingReq.user?.name} ({approvingReq.user?.email})
                </div>
                <div>
                  <strong>Program:</strong> {approvingReq.enrolment?.program?.title}
                </div>
                <div>
                  <strong>Requested Slot:</strong>{" "}
                  {formatWhenInTz(approvingReq.requestedStart, approvingReq.requestedEnd, displayTimezone)}{" "}
                  ({approvingReq.learnerTimezone || displayTimezone})
                </div>
                {approvingReq.notes && (
                  <div style={{ marginTop: 4 }}>
                    <strong>Reflections / Questions:</strong> {approvingReq.notes}
                  </div>
                )}
                {new Date(approvingReq.requestedStart).getTime() < Date.now() && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: "8px 12px",
                      background: "#fef2f2",
                      border: "1px solid #fecaca",
                      borderRadius: 6,
                      color: "#991b1b",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "0.45rem",
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: "2px" }} aria-hidden="true">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <div>
                      The learner&apos;s requested slot has already passed! You cannot accept a past time.
                      Please select an upcoming date and time below to schedule this session.
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    marginBottom: 4,
                  }}
                >
                  Session Date <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <input
                  type="date"
                  value={approvalDate}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={(e) => setApprovalDate(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 6,
                    border: "1px solid var(--border-light)",
                    fontSize: "0.88rem",
                  }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      marginBottom: 4,
                    }}
                  >
                    Start Time <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input
                    type="time"
                    value={approvalStartTime}
                    onChange={(e) => setApprovalStartTime(e.target.value)}
                    required
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: "1px solid var(--border-light)",
                      fontSize: "0.88rem",
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      marginBottom: 4,
                    }}
                  >
                    End Time <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input
                    type="time"
                    value={approvalEndTime}
                    onChange={(e) => setApprovalEndTime(e.target.value)}
                    required
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: "1px solid var(--border-light)",
                      fontSize: "0.88rem",
                    }}
                  />
                </div>
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    marginBottom: 4,
                  }}
                >
                  Notes &amp; Agenda
                </label>
                <textarea
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  rows={3}
                  placeholder="Coaching focus: review core breakthroughs, mission statement preparation..."
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 6,
                    border: "1px solid var(--border-light)",
                    fontSize: "0.88rem",
                    resize: "vertical",
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
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
                  {submittingApproval ? "Scheduling..." : "Approve & Schedule on Calendar"}
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* REJECT MODAL */}
      {rejectingReq && (
        <Modal
          isOpen={true}
          onClose={() => setRejectingReq(null)}
          title="Decline 1-on-1 Coaching Request"
          subtitle={`Notify ${rejectingReq.user?.name || "the learner"} to choose an alternative time slot.`}
        >
          <form onSubmit={handleSubmitReject}>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "10px" }}>
              {rejectError && (
                <div
                  style={{
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    color: "#991b1b",
                    padding: "8px 12px",
                    borderRadius: 6,
                    fontSize: "0.85rem",
                  }}
                >
                  {rejectError}
                </div>
              )}

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    marginBottom: 4,
                  }}
                >
                  Reason for Declining <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={4}
                  required
                  placeholder="e.g., Roweena has a prior batch workshop commitment at this time. Please request a slot on Tuesday afternoon."
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 6,
                    border: "1px solid var(--border-light)",
                    fontSize: "0.88rem",
                    resize: "vertical",
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
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
                  className={styles.dangerBtnSmall}
                  style={{ padding: "8px 16px", fontSize: "0.88rem" }}
                  disabled={submittingReject || !rejectReason.trim()}
                >
                  {submittingReject ? "Declining..." : "Decline Request"}
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
