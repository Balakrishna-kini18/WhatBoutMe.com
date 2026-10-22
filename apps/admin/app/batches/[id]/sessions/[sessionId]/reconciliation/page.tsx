"use client";

import { useEffect, useState, use } from "react";
import styles from "../../../../../page.module.css";
import Link from "next/link";
import { Modal, CustomSelect, ConfirmDialog, useToast, TableSkeleton } from "../../../../../components";
import { errorMessage as extractErrorMessage } from "../../../../../lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface UnmatchedItem {
  id: string;
  participantName: string;
  participantEmail: string | null;
  joinTimeUtc: string | null;
  leaveTimeUtc: string | null;
  minutesPresent: number;
  rawPayload: any;
}

interface UnlinkedLearnerItem {
  userId: string;
  enrolmentId: string;
  name: string;
  email: string;
}

interface ReconciliationResponse {
  session: {
    id: string;
    title: string;
    durationMinutes: number;
  };
  unmatched: UnmatchedItem[];
  unlinkedLearners: UnlinkedLearnerItem[];
}

export default function ReconciliationPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const resolvedParams = use(params);
  const { id: batchId, sessionId } = resolvedParams;

  const { success: toastSuccess, error: toastError } = useToast();
  const [data, setData] = useState<ReconciliationResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  // Dismiss confirmation state
  const [itemToDismiss, setItemToDismiss] = useState<UnmatchedItem | null>(null);
  const [isDismissing, setIsDismissing] = useState(false);
  const [dismissError, setDismissError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  // Tracks whether sync-attendance was called at least once this page session.
  // Needed to distinguish "never synced" (empty = no data yet) from "synced with 0 unmatched".
  const [syncRanOnce, setSyncRanOnce] = useState(false);

  const [linkModal, setLinkModal] = useState<{
    isOpen: boolean;
    unmatchedItem: UnmatchedItem | null;
    selectedUserId: string;
    reason: string;
    loading: boolean;
    error: string;
  }>({
    isOpen: false,
    unmatchedItem: null,
    selectedUserId: "",
    reason: "",
    loading: false,
    error: "",
  });

  const getAuthHeaders = (): Record<string, string> => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchData = async (signal?: AbortSignal) => {
    setIsLoading(true);
    setErrorMessage("");
    try {
      const res = await fetch(`${API_URL}/batches/${batchId}/sessions/${sessionId}/reconciliation`, {
        headers: getAuthHeaders(),
        signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || `Failed to fetch reconciliation records (${res.status})`);
      }

      const json: ReconciliationResponse = await res.json();
      setData(json);
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        setErrorMessage(err.message || "Failed to load reconciliation records");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [batchId, sessionId]);

  const handleSyncMeeting = async () => {
    setIsSyncing(true);
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
        toastError(json.message || "No meeting attendance records were processed.", "Sync Notice");
        return;
      }
      setSyncRanOnce(true);
      toastSuccess(`Meeting synchronized (${json.participantCount || 0} participants processed).`, "Attendance Synced");
      await fetchData();
    } catch (err: any) {
      toastError(err.message || "Failed to synchronize meeting report.", "Sync Error");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleOpenLinkModal = (item: UnmatchedItem) => {
    setLinkModal({
      isOpen: true,
      unmatchedItem: item,
      selectedUserId: data?.unlinkedLearners[0]?.userId || "",
      reason: `Matched unmatched attendee (${item.participantEmail || item.participantName}) to enrolled learner.`,
      loading: false,
      error: "",
    });
  };

  const submitLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkModal.unmatchedItem || !linkModal.selectedUserId) {
      setLinkModal((prev) => ({ ...prev, error: "Please choose an enrolled learner to link." }));
      return;
    }

    const previousData = data;
    const targetUnmatchedId = linkModal.unmatchedItem.id;
    const targetUserId = linkModal.selectedUserId;
    const linkedName = linkModal.unmatchedItem?.participantName || "Attendee";

    // Optimistic UI update: immediately remove linked item from unmatched and unlinked lists
    if (data) {
      setData({
        ...data,
        unmatched: data.unmatched.filter((u) => u.id !== targetUnmatchedId),
        unlinkedLearners: data.unlinkedLearners.filter((l) => l.userId !== targetUserId),
      });
    }

    setLinkModal((prev) => ({ ...prev, isOpen: false, loading: false }));
    toastSuccess(`Attendee "${linkedName}" successfully linked to enrolled learner.`, "Participant Linked");

    try {
      const res = await fetch(
        `${API_URL}/batches/${batchId}/sessions/${sessionId}/reconciliation/${targetUnmatchedId}/link`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(),
          },
          body: JSON.stringify({
            userId: targetUserId,
            reason: linkModal.reason.trim(),
          }),
        },
      );

      if (!res.ok) {
        // Rollback on server error
        setData(previousData);
        const err = await res.json().catch(() => null);
        const msg = err?.message || "Failed to link participant";
        toastError(msg, "Linking Failed");
        return;
      }

      fetchData();
    } catch (err: any) {
      setData(previousData);
      const netErr = err?.message || "Network error";
      toastError(netErr, "Connection Error");
    }
  };

  const confirmDismiss = async () => {
    if (!itemToDismiss) return;
    const previousData = data;
    const targetId = itemToDismiss.id;
    const dismissedName = itemToDismiss.participantName;

    // Optimistic UI update: immediately remove dismissed attendee from unmatched list
    if (data) {
      setData({
        ...data,
        unmatched: data.unmatched.filter((u) => u.id !== targetId),
      });
    }

    toastSuccess(
      `Attendee "${dismissedName}" dismissed from reconciliation.`,
      "Attendee Dismissed"
    );
    setItemToDismiss(null);
    setIsDismissing(true);
    setDismissError(null);

    try {
      const res = await fetch(
        `${API_URL}/sessions/${sessionId}/unmatched-attendance/${targetId}/dismiss`,
        {
          method: "PATCH",
          headers: getAuthHeaders(),
        }
      );

      if (!res.ok) {
        // Rollback on server error
        setData(previousData);
        const err = await extractErrorMessage(res, "Failed to dismiss unmatched participant.");
        setDismissError(err);
        toastError(err, "Dismissal Failed");
      } else {
        fetchData();
      }
    } catch (e: any) {
      setData(previousData);
      console.error("Failed to dismiss unmatched attendee:", e);
      const netErr = "Network error: failed to communicate with the server.";
      setDismissError(netErr);
      toastError(netErr, "Connection Error");
    } finally {
      setIsDismissing(false);
    }
  };

  const formatLocalTime = (isoString: string | null) => {
    if (!isoString) return "---";
    try {
      return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "---";
    }
  };

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <div style={{ display: "flex", alignItems: "center", gap: "15px", marginBottom: "8px" }}>
            <Link
              href={`/batches/${batchId}/sessions/${sessionId}/attendance`}
              style={{ textDecoration: "none", color: "var(--accent-primary, #6366f1)", fontSize: "0.95rem", fontWeight: 600 }}
            >
              ← Back to Attendance
            </Link>
          </div>
          <h1 className={styles.title}>Participant Reconciliation: {data?.session.title || "Session"}</h1>
          {/* <p className={styles.subtitle}>
            Link unrecognized Zoom attendees to enrolled batch learners to update their attendance percentage.
          </p> */}
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={handleSyncMeeting}
            disabled={isSyncing}
            title="Pull latest attendance report from Zoom"
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
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
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            <span>{isSyncing ? "Syncing..." : "Sync Zoom Report"}</span>
          </button>
        </div>
      </header>

      {errorMessage && (
        <div style={{ padding: "12px 16px", background: "#fef2f2", color: "#991b1b", borderRadius: "6px", marginBottom: "16px" }}>
          {errorMessage}
        </div>
      )}

      <section className={styles.tableSection}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600, color: "#1e293b", margin: 0 }}>
            Unmatched Meeting Attendees ({data?.unmatched.length ?? 0})
          </h2>
          <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
            {data?.unlinkedLearners.length ?? 0} enrolled learners currently unlinked / absent
          </span>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Attendee Name</th>
                <th>Attendee Email</th>
                <th>Time Present</th>
                <th>Join Time (Local)</th>
                <th>Leave Time (Local)</th>
                <th className={styles.alignRight}>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableSkeleton columns={6} rows={4} />
              ) : !data || data.unmatched.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "40px" }}>
                    {syncRanOnce ? (
                      // Sync was run this session and the unmatched list is empty — genuinely reconciled
                      <>
                        <div style={{ color: "#16a34a", fontSize: "1.1rem", fontWeight: 600, marginBottom: "4px" }}>
                          ✓ All participants matched!
                        </div>
                        <span style={{ color: "#64748b", fontSize: "0.9rem" }}>
                          No unmatched meeting attendees remain after the last sync.
                        </span>
                      </>
                    ) : (
                      // Sync has not been run yet — empty list does not mean reconciled
                      <>
                        <div style={{ color: "#475569", fontSize: "1rem", fontWeight: 600, marginBottom: "6px" }}>
                          No unmatched attendees yet
                        </div>
                        <span style={{ color: "#64748b", fontSize: "0.9rem" }}>
                          Click <strong>Sync Zoom Report</strong> to import participant data from Zoom.
                          Unrecognized attendees will appear here for review.
                        </span>
                      </>
                    )}
                  </td>
                </tr>
              ) : (
                data.unmatched.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className={styles.cellUserName}>{item.participantName}</span>
                    </td>
                    <td>
                      <span className={styles.cellTextMuted}>{item.participantEmail || "(No email provided)"}</span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{item.minutesPresent} mins</span>
                    </td>
                    <td>
                      <span className={styles.cellTextMuted}>{formatLocalTime(item.joinTimeUtc)}</span>
                    </td>
                    <td>
                      <span className={styles.cellTextMuted}>{formatLocalTime(item.leaveTimeUtc)}</span>
                    </td>
                    <td className={styles.alignRight}>
                      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                        <button
                          className={styles.primaryBtn}
                          onClick={() => handleOpenLinkModal(item)}
                          style={{ padding: "6px 14px", fontSize: "0.85rem" }}
                        >
                          Link to Learner →
                        </button>
                        <button
                          type="button"
                          className={styles.secondaryBtn}
                          onClick={() => {
                            setItemToDismiss(item);
                            setDismissError(null);
                          }}
                          style={{ padding: "6px 14px", fontSize: "0.85rem" }}
                          title="Dismiss this attendee from attendance reconciliation"
                        >
                          Dismiss
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

      {/* Link Participant Modal */}
      {linkModal.isOpen && linkModal.unmatchedItem && (
        <Modal
          isOpen={linkModal.isOpen}
          title={`Link Attendee: ${linkModal.unmatchedItem.participantName}`}
          onClose={() => setLinkModal((prev) => ({ ...prev, isOpen: false }))}
        >
          <form onSubmit={submitLink} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ background: "#f1f5f9", padding: "12px", borderRadius: "6px" }}>
              <div style={{ fontSize: "0.85rem", color: "#64748b" }}>Raw Meeting Attendee:</div>
              <div style={{ fontWeight: 600, color: "#0f172a" }}>
                {linkModal.unmatchedItem.participantName} ({linkModal.unmatchedItem.participantEmail || "no email"})
              </div>
              <div style={{ fontSize: "0.85rem", color: "#0369a1", marginTop: "4px" }}>
                Logged duration: {linkModal.unmatchedItem.minutesPresent} minutes
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: "6px" }}>
                Select Enrolled Learner to Link
              </label>
              {data?.unlinkedLearners && data.unlinkedLearners.length > 0 ? (
                <CustomSelect
                  value={linkModal.selectedUserId}
                  onChange={(val) => setLinkModal((prev) => ({ ...prev, selectedUserId: val }))}
                  options={data.unlinkedLearners.map((l) => ({
                    value: l.userId,
                    label: `${l.name} (${l.email})`,
                  }))}
                />
              ) : (
                <p style={{ color: "#dc2626", fontSize: "0.85rem" }}>
                  No absent/unlinked learners found in this batch.
                </p>
              )}
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: "6px" }}>
                Reason for Linking (Logged in Audit Trail)
              </label>
              <textarea
                required
                rows={2}
                value={linkModal.reason}
                onChange={(e) => setLinkModal((prev) => ({ ...prev, reason: e.target.value }))}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
              />
            </div>

            {linkModal.error && (
              <div style={{ color: "#dc2626", background: "#fef2f2", padding: "8px 12px", borderRadius: "6px", fontSize: "0.875rem" }}>
                {linkModal.error}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
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
                {linkModal.loading ? "Linking..." : "Confirm & Link Participant"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Branded ConfirmDialog for Unmatched Attendee Dismissal */}
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
        description="Are you sure you want to dismiss this unmatched attendee? They will be marked as dismissed and ignored for cohort attendance calculations."
        tone="danger"
        confirmText={isDismissing ? "Dismissing..." : "Dismiss Attendee"}
        cancelText="Cancel"
        isLoading={isDismissing}
        error={dismissError}
        itemDetails={
          itemToDismiss
            ? [
                { label: "Attendee Name", value: itemToDismiss.participantName },
                { label: "Attendee Email", value: itemToDismiss.participantEmail || "(No email provided)" },
                { label: "Duration", value: `${itemToDismiss.minutesPresent} mins` },
              ]
            : []
        }
        callout={{
          tone: "warning",
          text: "Dismissed attendees will be marked as DISMISSED and removed from the active reconciliation queue.",
        }}
      />
    </div>
  );
}
