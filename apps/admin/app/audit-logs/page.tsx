"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import styles from "../page.module.css";
import { API_URL, errorMessage, cachedFetch } from "../lib/api";
import { CustomSelect, TableSkeleton, EmptyState, useToast } from "../components";

interface AuditLogEntry {
  id: string;
  actorId: string | null;
  actorName: string;
  actorEmail: string | null;
  actorRole: string;
  action: string;
  entity: string;
  entityId: string;
  meta: Record<string, any> | null;
  ip: string | null;
  createdAt: string;
}

const ACTION_FILTER_OPTIONS = [
  { value: "ALL", label: "All Audit Actions" },
  { value: "UNUSUAL_LOGIN_DETECTED", label: "Unusual Security Activity (Page 13)" },
  { value: "LEAD_CONVERT", label: "Lead Conversion (LEAD_CONVERT)" },
  { value: "CERTIFICATE_APPROVAL", label: "Certificate Approvals" },
  { value: "CERTIFICATE_APPROVED", label: "Certificate Approved" },
  { value: "CERTIFICATE_STATUS_CHANGE", label: "Certificate Status Changes" },
  { value: "CERTIFICATE_REVOCATION", label: "Certificate Revocations" },
  { value: "ATTENDANCE_MANUAL_OVERRIDE", label: "Manual Attendance Overrides" },
  { value: "ATTENDANCE_OVERRIDE", label: "Attendance Overrides" },
  { value: "ATTENDANCE_RECONCILED", label: "Attendance Reconciliations" },
  { value: "STEP_MANUAL_UNLOCKED", label: "Step Manual Unlocks (Page 8)" },
  { value: "STEP_MANUAL_LOCKED", label: "Step Manual Locks" },
  { value: "STEP_UNLOCK_OVERRIDE", label: "Step Unlock Overrides" },
  { value: "QUIZ_OVERRIDE", label: "Quiz Overrides" },
  { value: "EXAM_ATTEMPTS_RESET", label: "Exam Attempts Reset" },
  { value: "CREATE_CREDIT_NOTE", label: "Credit Notes & Refunds" },
  { value: "REFUND_ISSUED", label: "Refunds Issued" },
  { value: "ENROLMENT_STATUS_OVERRIDE", label: "Enrolment Status Changes" },
  { value: "SESSION_COMPLETED", label: "Session Completed" },
  { value: "SESSION_ACTIVATED", label: "Session Live / Activated" },
  { value: "ANNOUNCEMENT_BROADCAST", label: "Announcement Broadcasts" },
];

export default function AuditLogsPage() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Data states
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filter states
  const [search, setSearch] = useState("");
  const [selectedAction, setSelectedAction] = useState("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Metadata inspector modal
  const [activeMetaEntry, setActiveMetaEntry] = useState<AuditLogEntry | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = JSON.parse(localStorage.getItem("user") || "{}");
      setCurrentUserRole(stored.role || "USER");
    } catch {
      setCurrentUserRole("USER");
    }
  }, []);

  const isSuperAdmin = currentUserRole === "SUPER_ADMIN";

  const fetchLogs = useCallback(
    async (currentPage = page) => {
      setIsLoading(true);
      setFetchError(null);
      try {
        const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
        const params = new URLSearchParams({
          page: String(currentPage),
          limit: String(limit),
        });

        if (search.trim()) params.set("search", search.trim());
        if (selectedAction && selectedAction !== "ALL") params.set("action", selectedAction);
        if (startDate) params.set("startDate", startDate);
        if (endDate) params.set("endDate", endDate);

        const res = await cachedFetch(`${API_URL}/admin/audit-logs?${params.toString()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          skipCache: true,
        });

        if (!res.ok) {
          throw new Error(await errorMessage(res, "Failed to load audit logs. Super Admin authorization required."));
        }

        const json = await res.json();
        setLogs(json.data || []);
        setTotal(json.total || 0);
        setPage(json.page || 1);
        setTotalPages(json.totalPages || 1);
      } catch (err: any) {
        setFetchError(err.message || "Failed to load audit logs.");
      } finally {
        setIsLoading(false);
      }
    },
    [page, limit, search, selectedAction, startDate, endDate]
  );

  useEffect(() => {
    if (mounted && isSuperAdmin) {
      fetchLogs(1);
    }
  }, [mounted, isSuperAdmin, selectedAction, startDate, endDate]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLogs(1);
  };

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const params = new URLSearchParams({
        page: "1",
        limit: "500", // Export up to 500 records
      });
      if (selectedAction && selectedAction !== "ALL") params.set("action", selectedAction);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const res = await cachedFetch(`${API_URL}/admin/audit-logs?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        skipCache: true,
      });

      if (!res.ok) {
        throw new Error("Failed to export audit logs");
      }

      const json = await res.json();
      const exportData: AuditLogEntry[] = json.data || [];

      if (exportData.length === 0) {
        toastError("No audit log records found for export.");
        return;
      }

      const headers = ["Timestamp (UTC)", "Actor", "Actor Role", "Action", "Entity", "Entity ID", "Reason / Notes", "IP Address"];
      const rows = exportData.map((l) => [
        `"${new Date(l.createdAt).toISOString()}"`,
        `"${l.actorName.replace(/"/g, '""')}"`,
        `"${l.actorRole}"`,
        `"${l.action}"`,
        `"${l.entity}"`,
        `"${l.entityId}"`,
        `"${(l.meta?.reason || l.meta?.title || "").replace(/"/g, '""')}"`,
        `"${l.ip || "N/A"}"`,
      ]);

      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `whatboutme_audit_logs_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toastSuccess(`Exported ${exportData.length} audit records to CSV.`);
    } catch (err: any) {
      toastError(err.message || "Failed to export audit logs");
    } finally {
      setIsExporting(false);
    }
  };

  const formatActionPill = (action: string) => {
    let color = "#475569";
    let bg = "#f1f5f9";
    let border = "#e2e8f0";

    if (action.includes("UNUSUAL") || action.includes("SUSPICIOUS") || action.includes("SECURITY")) {
      color = "#c2410c";
      bg = "#fff7ed";
      border = "#fed7aa";
    } else if (action.includes("CONVERT") || action.includes("APPROVAL") || action.includes("COMPLETED")) {
      color = "#15803d";
      bg = "#f0fdf4";
      border = "#bbf7d0";
    } else if (action.includes("OVERRIDE") || action.includes("REVOCATION") || action.includes("REJECTION") || action.includes("REFUND")) {
      color = "#b91c1c";
      bg = "#fef2f2";
      border = "#fecaca";
    } else if (action.includes("RECONCILED") || action.includes("CORRECTED") || action.includes("RESET")) {
      color = "#d97706";
      bg = "#fffbeb";
      border = "#fde68a";
    } else if (action.includes("LIVE") || action.includes("ACTIVATED")) {
      color = "#0284c7";
      bg = "#f0f9ff";
      border = "#bae6fd";
    }

    return (
      <span
        style={{
          display: "inline-block",
          padding: "2px 8px",
          borderRadius: "4px",
          fontSize: "0.72rem",
          fontWeight: 700,
          color,
          background: bg,
          border: `1px solid ${border}`,
          whiteSpace: "nowrap",
          fontFamily: "monospace",
        }}
      >
        {action}
      </span>
    );
  };

  if (!mounted) {
    return (
      <div className={styles.dashboardContainer} style={{ padding: "2rem" }}>
        <TableSkeleton rows={8} columns={6} />
      </div>
    );
  }

  if (mounted && !isSuperAdmin) {
    return (
      <div className={styles.dashboardContainer} style={{ padding: "3rem 1.5rem", maxWidth: "800px", margin: "0 auto", textAlign: "center" }}>
        <div style={{ background: "#ffffff", padding: "2.5rem", borderRadius: "12px", border: "1px solid var(--border-light)" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🔒</div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.5rem" }}>
            Access Restricted: Super Admin Only
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.5, marginBottom: "1.5rem" }}>
            The immutable audit log contains compliance records, administrative override histories, and security events. Access is strictly restricted to authorized Super Administrators.
          </p>
          <Link
            href="/"
            className={styles.primaryBtn}
            style={{ display: "inline-flex", textDecoration: "none", fontSize: "0.875rem", padding: "0.5rem 1.25rem" }}
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.dashboardContainer}>
      {/* Page Header */}
      <header className={styles.pageHeader}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Link href="/" style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "0.85rem" }}>
              Dashboard
            </Link>
            <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>/</span>
            <span style={{ color: "var(--text-primary)", fontSize: "0.85rem", fontWeight: 600 }}>Audit Logs</span>
          </div>
          <h1 className={styles.pageTitle} style={{ marginTop: "0.25rem", fontSize: "1.5rem" }}>
            Compliance &amp; System Audit Logs
          </h1>
          <p className={styles.subtitle} style={{ margin: "0.25rem 0 0", fontSize: "0.875rem" }}>
            Authoritative, immutable ledger of all administrative overrides, certificate approvals, and learner mutations (AGENTS.md Mandate #3).
          </p>
        </div>

        <div className={styles.headerActions} style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={handleExportCsv}
            disabled={isExporting || logs.length === 0}
            style={{ fontSize: "0.8125rem", padding: "0.45rem 0.9rem" }}
          >
            {isExporting ? "Exporting…" : "Export Audit CSV"}
          </button>
        </div>
      </header>

      {/* Filter and Search Bar */}
      <section
        style={{
          background: "#ffffff",
          padding: "1rem 1.25rem",
          borderRadius: "10px",
          border: "1px solid var(--border-light)",
          display: "flex",
          gap: "1rem",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {/* Search */}
        <form onSubmit={handleSearchSubmit} style={{ display: "flex", flex: 1, minWidth: "240px", gap: "0.5rem" }}>
          <input
            type="text"
            placeholder="Search by action, actor, entity ID, or reason…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              padding: "0.45rem 0.75rem",
              borderRadius: "6px",
              border: "1px solid var(--border-light)",
              fontSize: "0.84rem",
              background: "#faf7f2",
            }}
          />
          <button type="submit" className={styles.secondaryBtn} style={{ padding: "0.45rem 0.85rem", fontSize: "0.8125rem" }}>
            Search
          </button>
        </form>

        {/* Action Type Dropdown */}
        <div style={{ minWidth: "220px" }}>
          <CustomSelect
            ariaLabel="Filter by Action Type"
            value={selectedAction}
            onChange={(val) => setSelectedAction(val)}
            options={ACTION_FILTER_OPTIONS}
            size="sm"
          />
        </div>

        {/* Date Filters */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>From:</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{
              padding: "0.35rem 0.5rem",
              borderRadius: "6px",
              border: "1px solid var(--border-light)",
              fontSize: "0.8rem",
            }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>To:</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{
              padding: "0.35rem 0.5rem",
              borderRadius: "6px",
              border: "1px solid var(--border-light)",
              fontSize: "0.8rem",
            }}
          />
        </div>

        {(search || selectedAction !== "ALL" || startDate || endDate) && (
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => {
              setSearch("");
              setSelectedAction("ALL");
              setStartDate("");
              setEndDate("");
            }}
            style={{ fontSize: "0.78rem", padding: "0.35rem 0.65rem", color: "var(--accent-primary)" }}
          >
            Clear Filters
          </button>
        )}
      </section>

      {/* Main Audit Table */}
      <section className={styles.tableSection}>
        <div className={styles.tableWrapper} style={{ overflowX: "auto" }}>
          <table className={styles.adminTable} style={{ width: "100%", tableLayout: "auto" }}>
            <thead>
              <tr>
                <th style={{ width: "160px" }}>Timestamp (UTC)</th>
                <th style={{ width: "180px" }}>Actor</th>
                <th style={{ width: "190px" }}>Action</th>
                <th style={{ width: "140px" }}>Target Entity</th>
                <th style={{ minWidth: "220px" }}>Reason / Notes</th>
                <th style={{ width: "90px" }} className={styles.alignRight}>
                  Metadata
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableSkeleton columns={6} rows={8} />
              ) : fetchError ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "3rem 1.5rem", color: "#b91c1c" }}>
                    <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>⚠️ {fetchError}</div>
                    <button
                      type="button"
                      className={styles.secondaryBtn}
                      onClick={() => fetchLogs(page)}
                      style={{ fontSize: "0.8125rem", padding: "0.4rem 0.85rem" }}
                    >
                      Retry
                    </button>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: "3rem 1.5rem" }}>
                    <EmptyState
                      icon="search"
                      title="No audit records found"
                      description="Try adjusting your search query, action filter, or date range."
                    />
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const reason = log.meta?.reason || log.meta?.title || log.meta?.feedback || "—";
                  return (
                    <tr key={log.id}>
                      {/* Timestamp */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-primary)" }}>
                            {new Date(log.createdAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                            {new Date(log.createdAt).toLocaleTimeString("en-US", {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                              hour12: false,
                            })}{" "}
                            UTC
                          </span>
                        </div>
                      </td>

                      {/* Actor */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span style={{ fontSize: "0.84rem", fontWeight: 600, color: "var(--text-primary)" }}>
                            {log.actorName}
                          </span>
                          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                            {log.actorRole} {log.actorEmail ? `· ${log.actorEmail}` : ""}
                          </span>
                        </div>
                      </td>

                      {/* Action */}
                      <td>{formatActionPill(log.action)}</td>

                      {/* Entity */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                            {log.entity}
                          </span>
                          <span
                            style={{
                              fontSize: "0.7rem",
                              color: "var(--text-muted)",
                              fontFamily: "monospace",
                              maxWidth: "130px",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={log.entityId}
                          >
                            {log.entityId}
                          </span>
                        </div>
                      </td>

                      {/* Reason / Notes */}
                      <td>
                        <div
                          style={{
                            fontSize: "0.82rem",
                            color: "var(--text-primary)",
                            lineHeight: 1.4,
                            maxWidth: "400px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={typeof reason === "string" ? reason : JSON.stringify(reason)}
                        >
                          {typeof reason === "string" ? reason : JSON.stringify(reason)}
                        </div>
                      </td>

                      {/* Metadata Action */}
                      <td className={styles.alignRight}>
                        {log.meta && Object.keys(log.meta).length > 0 ? (
                          <button
                            type="button"
                            className={styles.secondaryBtn}
                            onClick={() => setActiveMetaEntry(log)}
                            style={{ fontSize: "0.72rem", padding: "0.25rem 0.55rem" }}
                            title="Inspect full JSON metadata"
                          >
                            Details
                          </button>
                        ) : (
                          <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {total > 0 && (
          <div
            style={{
              padding: "0.85rem 1.25rem",
              borderTop: "1px solid var(--border-light)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "#faf7f2",
            }}
          >
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Showing {Math.min(total, (page - 1) * limit + 1)}–{Math.min(total, page * limit)} of {total.toLocaleString()} audit records
            </span>

            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <button
                type="button"
                className={styles.secondaryBtn}
                disabled={page <= 1 || isLoading}
                onClick={() => fetchLogs(page - 1)}
                style={{ fontSize: "0.78rem", padding: "0.3rem 0.65rem" }}
              >
                ← Previous
              </button>
              <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-primary)" }}>
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className={styles.secondaryBtn}
                disabled={page >= totalPages || isLoading}
                onClick={() => fetchLogs(page + 1)}
                style={{ fontSize: "0.78rem", padding: "0.3rem 0.65rem" }}
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Metadata Detail Modal */}
      {activeMetaEntry && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(20, 17, 15, 0.45)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "1rem",
          }}
          onClick={() => setActiveMetaEntry(null)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              padding: "1.75rem",
              maxWidth: "600px",
              width: "100%",
              maxHeight: "85vh",
              overflowY: "auto",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
              border: "1px solid var(--border-light)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  Audit Metadata Inspector
                </h3>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  Action: <strong>{activeMetaEntry.action}</strong> · Target: <strong>{activeMetaEntry.entity}</strong> ({activeMetaEntry.entityId})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveMetaEntry(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "1.25rem",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ background: "#faf7f2", borderRadius: "8px", padding: "1rem", border: "1px solid #ebd9c4", marginBottom: "1.25rem" }}>
              <pre
                style={{
                  margin: 0,
                  fontSize: "0.8rem",
                  color: "var(--text-primary)",
                  fontFamily: "monospace",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {JSON.stringify(activeMetaEntry.meta, null, 2)}
              </pre>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setActiveMetaEntry(null)}
                style={{ fontSize: "0.8125rem", padding: "0.4rem 1rem" }}
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
