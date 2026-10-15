"use client";

import { useEffect, useState, use } from "react";
import Image from "next/image";
import styles from "../../../../../page.module.css";
import Link from "next/link";
import { Modal, StatusBadge, CustomSelect } from "../../../../../components";

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

  const getAuthHeaders = (): Record<string, string> => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
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
        (l) => l.status === "PRESENT" || l.status === "EXCUSED"
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
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <div style={{ display: "flex", alignItems: "center", gap: "15px", marginBottom: "8px" }}>
            <Link
              href={`/batches/${batchId}/sessions`}
              style={{ textDecoration: "none", color: "var(--accent-primary, #6366f1)", fontSize: "0.95rem", fontWeight: 600 }}
            >
              ← Back to Sessions
            </Link>
            <span style={{ color: "#94a3b8" }}>/</span>
            <Link
              href={`/batches/${batchId}/sessions/${sessionId}/reconciliation`}
              style={{ textDecoration: "none", color: "#0ea5e9", fontSize: "0.95rem", fontWeight: 600 }}
            >
              Go to Reconciliation →
            </Link>
          </div>
          <h1 className={styles.title}>
            Attendance: {data?.session.title || "Live Session"}
          </h1>
          <p className={styles.subtitle}>
            Compliance threshold: <strong>{data?.thresholdPercentage ?? 75}%</strong> of scheduled session duration (
            {data?.session.durationMinutes ?? 60} mins).
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button className={styles.secondaryBtn} onClick={handleShowQrModal}>
            📱 Show Check-In QR
          </button>
          <button className={styles.primaryBtn} onClick={handleExportCsv}>
            ⬇ Export Attendance (CSV)
          </button>
        </div>
      </header>

      {/* Metrics Row */}
      {data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "24px" }}>
          <div style={{ background: "#ffffff", padding: "16px 20px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
            <span style={{ fontSize: "0.85rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>Total Enrolled</span>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#0f172a", marginTop: "4px" }}>{data.totalLearners}</div>
          </div>
          <div style={{ background: "#ffffff", padding: "16px 20px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
            <span style={{ fontSize: "0.85rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>Present Learners</span>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#16a34a", marginTop: "4px" }}>{data.presentCount}</div>
          </div>
          <div style={{ background: "#ffffff", padding: "16px 20px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
            <span style={{ fontSize: "0.85rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>Absent Rate</span>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#dc2626", marginTop: "4px" }}>
              {data.totalLearners > 0
                ? `${Math.round(((data.totalLearners - data.presentCount) / data.totalLearners) * 100)}%`
                : "0%"}
            </div>
          </div>
          <div style={{ background: "#ffffff", padding: "16px 20px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
            <span style={{ fontSize: "0.85rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>Provider</span>
            <div style={{ fontSize: "1.2rem", fontWeight: 600, color: "#0284c7", marginTop: "8px" }}>
              {data.session.meetingProvider || "ZOOM"}
            </div>
          </div>
        </div>
      )}

      {errorMessage && (
        <div style={{ padding: "12px 16px", background: "#fef2f2", color: "#991b1b", borderRadius: "6px", marginBottom: "16px" }}>
          {errorMessage}
        </div>
      )}

      <section className={styles.tableSection}>
        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Learner</th>
                <th>Status</th>
                <th>Source</th>
                <th>Time Present</th>
                <th>Join (Local)</th>
                <th>Leave (Local)</th>
                <th>Audit / Override Reason</th>
                <th className={styles.alignRight}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: "30px" }}>
                    Loading attendance records...
                  </td>
                </tr>
              ) : !data || data.learners.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: "30px" }}>
                    No learners currently enrolled in this batch.
                  </td>
                </tr>
              ) : (
                data.learners.map((learner) => {
                  const isPresent =
                    learner.status === "PRESENT" ||
                    learner.status === "PRESENT_AUTO" ||
                    learner.status === "PRESENT_MANUAL" ||
                    learner.status === "CORRECTED";

                  return (
                    <tr key={learner.userId}>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span className={styles.cellUserName}>{learner.name}</span>
                          <span className={styles.cellTextMuted}>{learner.email}</span>
                        </div>
                      </td>
                      <td>
                        <StatusBadge
                          status={learner.status}
                          tone={
                            learner.status === "PRESENT" || learner.status === "PRESENT_AUTO" || learner.status === "PRESENT_MANUAL" || learner.status === "CORRECTED"
                              ? "active"
                              : learner.status === "EXCUSED"
                                ? "pending"
                                : "inactive"
                          }
                        />
                      </td>
                      <td>
                        <span
                          style={{
                            fontSize: "0.75rem",
                            padding: "3px 8px",
                            borderRadius: "12px",
                            fontWeight: 600,
                            background:
                              learner.source === "AUTO"
                                ? "#e0f2fe"
                                : learner.source === "QR_CHECKIN"
                                  ? "#fef3c7"
                                  : "#f3e8ff",
                            color:
                              learner.source === "AUTO"
                                ? "#0369a1"
                                : learner.source === "QR_CHECKIN"
                                  ? "#b45309"
                                  : "#7e22ce",
                          }}
                        >
                          {learner.source}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span style={{ fontWeight: 600 }}>{learner.minutesPresent} mins</span>
                          <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                            {Math.round(learner.attendancePercentage)}% of class
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={styles.cellTextMuted}>{formatLocalTime(learner.joinTimeUtc)}</span>
                      </td>
                      <td>
                        <span className={styles.cellTextMuted}>{formatLocalTime(learner.leaveTimeUtc)}</span>
                      </td>
                      <td>
                        <span
                          style={{
                            fontSize: "0.85rem",
                            color: learner.overrideReason ? "#334155" : "#94a3b8",
                            fontStyle: learner.overrideReason ? "normal" : "italic",
                          }}
                        >
                          {learner.overrideReason || "None"}
                        </span>
                      </td>
                      <td className={styles.alignRight}>
                        <button
                          className={styles.secondaryBtn}
                          onClick={() => handleOpenOverride(learner)}
                          style={{ padding: "6px 12px", fontSize: "0.85rem" }}
                        >
                          Edit / Override
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
          <form onSubmit={submitOverride} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: "6px" }}>
                Target Status
              </label>
              <select
                value={overrideModal.status}
                onChange={(e) => setOverrideModal((prev) => ({ ...prev, status: e.target.value }))}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
              >
                <option value="PRESENT">PRESENT (Full Attendance)</option>
                <option value="ABSENT">ABSENT</option>
                <option value="EXCUSED">EXCUSED (Medical / Approved)</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: "6px" }}>
                Minutes Present
              </label>
              <input
                type="number"
                min={0}
                max={data?.session.durationMinutes || 300}
                value={overrideModal.minutesPresent}
                onChange={(e) => setOverrideModal((prev) => ({ ...prev, minutesPresent: Number(e.target.value) }))}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: "6px" }}>
                Mandatory Audit Reason <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <textarea
                required
                rows={3}
                placeholder="Explain why this attendance record is being manually overridden (e.g., student joined on secondary phone device)"
                value={overrideModal.reason}
                onChange={(e) => setOverrideModal((prev) => ({ ...prev, reason: e.target.value }))}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
              />
            </div>

            {overrideModal.error && (
              <div style={{ color: "#dc2626", background: "#fef2f2", padding: "8px 12px", borderRadius: "6px", fontSize: "0.875rem" }}>
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
