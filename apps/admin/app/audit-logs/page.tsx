"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import styles from "../page.module.css";
import { API_URL, errorMessage, cachedFetch } from "../lib/api";
import {
  CustomSelect,
  DatePicker,
  TableSkeleton,
  EmptyState,
  useToast,
  Pagination,
  Modal,
  StatusBadge,
} from "../components";
import {
  getAuditDetails,
  formatMetaKey,
  formatMetaValue,
  ACTION_FILTER_OPTIONS,
  PERIOD_FILTER_OPTIONS,
  calculatePeriodDates,
  ACTION_SHORT_NAMES,
  extractExecutiveMetadata,
  type AuditLogItem,
} from "./audit-utils";

type AuditLogEntry = AuditLogItem;

export default function AuditLogsPage() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Data states
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filter states
  const [search, setSearch] = useState("");
  const [selectedAction, setSelectedAction] = useState("ALL");
  const [selectedPeriod, setSelectedPeriod] = useState("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isFromPickerOpen, setIsFromPickerOpen] = useState(false);
  const [isToPickerOpen, setIsToPickerOpen] = useState(false);

  // Metadata inspector modal
  const [activeMetaEntry, setActiveMetaEntry] = useState<AuditLogEntry | null>(null);
  const [copiedLinkUrl, setCopiedLinkUrl] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyId = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    }).catch(() => {});
  };

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
    async (currentPage = page, currentLimit = pageSize) => {
      setIsLoading(true);
      setFetchError(null);
      try {
        const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
        const params = new URLSearchParams({
          page: String(currentPage),
          limit: String(currentLimit),
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
      } catch (err: any) {
        setFetchError(err.message || "Failed to load audit logs.");
      } finally {
        setIsLoading(false);
      }
    },
    [search, selectedAction, startDate, endDate, page, pageSize]
  );

  // Debounced auto-fetch on filter or search changes
  const isFirstRun = useRef(true);
  useEffect(() => {
    if (!mounted || !isSuperAdmin) return;

    if (isFirstRun.current) {
      isFirstRun.current = false;
      fetchLogs(page, pageSize);
      return;
    }

    const timer = setTimeout(() => {
      fetchLogs(page, pageSize);
    }, 250);

    return () => clearTimeout(timer);
  }, [mounted, isSuperAdmin, search, selectedAction, startDate, endDate, page, pageSize, fetchLogs]);

  const hasActiveFilters = Boolean(
    search.trim() || selectedAction !== "ALL" || selectedPeriod !== "ALL" || startDate || endDate
  );

  const resetAllFilters = () => {
    setSearch("");
    setSelectedAction("ALL");
    setSelectedPeriod("ALL");
    setStartDate("");
    setEndDate("");
    setIsFromPickerOpen(false);
    setIsToPickerOpen(false);
    setPage(1);
  };

  const handlePeriodChange = (period: string) => {
    setSelectedPeriod(period);
    if (period !== "CUSTOM") {
      setIsFromPickerOpen(false);
      setIsToPickerOpen(false);
      const { startDate: s, endDate: e } = calculatePeriodDates(period);
      setStartDate(s);
      setEndDate(e);
    } else {
      // Automatically pop open the From datepicker so user can pick their custom start date immediately
      setIsFromPickerOpen(true);
      setIsToPickerOpen(false);
    }
    setPage(1);
  };

  const handleExportCsv = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      let allRecords: AuditLogEntry[] = [];
      let currentPage = 1;
      let totalRecords = 0;

      // Exhaustively paginate through all matching records according to active filters (no arbitrary 100 row cap)
      do {
        const params = new URLSearchParams({
          page: String(currentPage),
          limit: "1000",
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
          throw new Error("Failed to export audit logs");
        }

        const json = await res.json();
        const chunk: AuditLogEntry[] = json.data || [];
        totalRecords = json.total || chunk.length;
        allRecords = allRecords.concat(chunk);
        currentPage++;

        if (chunk.length === 0 || allRecords.length >= totalRecords) {
          break;
        }
      } while (allRecords.length < totalRecords && currentPage <= 50);

      const exportData: AuditLogEntry[] = allRecords;

      if (exportData.length === 0) {
        toastError("No audit log records found for export.");
        return;
      }

      const headers = ["Timestamp (UTC)", "User", "Role", "Action", "Target Record", "Record ID", "Reason / Details", "IP Address"];
      const rows = exportData.map((l) => [
        `"${new Date(l.createdAt).toISOString()}"`,
        `"${l.actorName.replace(/"/g, '""')}"`,
        `"${l.actorRole}"`,
        `"${l.action}"`,
        `"${l.entity}"`,
        `"${l.entityId}"`,
        `"${getAuditDetails(l).replace(/"/g, '""')}"`,
        `"${l.ip || "N/A"}"`,
      ]);

      const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `whatboutme-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 2500);
      toastSuccess(`Exported ${exportData.length} audit records to CSV.`);
    } catch (err: any) {
      toastError(err.message || "Failed to export audit logs");
    } finally {
      setIsExporting(false);
    }
  };

  const formatActionName = (action: string) => {
    return action
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const formatActionPill = (action: string) => {
    let color = "#475569";
    let bg = "#f1f5f9";
    let border = "#e2e8f0";

    if (action.includes("UNUSUAL") || action.includes("SUSPICIOUS") || action.includes("SECURITY")) {
      color = "#c2410c";
      bg = "#fff7ed";
      border = "#fed7aa";
    } else if (action.includes("CONVERT") || action.includes("APPROVAL") || action.includes("APPROVED") || action.includes("COMPLETED")) {
      color = "#15803d";
      bg = "#f0fdf4";
      border = "#bbf7d0";
    } else if (action.includes("OVERRIDE") || action.includes("REVOCATION") || action.includes("REVOKED") || action.includes("REJECTION") || action.includes("REFUND") || action.includes("DELETED")) {
      color = "#b91c1c";
      bg = "#fef2f2";
      border = "#fecaca";
    } else if (action.includes("RECONCILED") || action.includes("CORRECTED") || action.includes("RESET") || action.includes("CHANGED") || action.includes("TRANSFERRED")) {
      color = "#b45309";
      bg = "#fffbeb";
      border = "#fde68a";
    } else if (action.includes("LIVE") || action.includes("ACTIVATED") || action.includes("UNLOCKED") || action.includes("LOGIN")) {
      color = "#0369a1";
      bg = "#f0f9ff";
      border = "#bae6fd";
    }

    const shortLabel = ACTION_SHORT_NAMES[action] || formatActionName(action);

    return (
      <span
        style={{
          display: "inline-block",
          maxWidth: "148px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          verticalAlign: "middle",
          padding: "3px 8px",
          borderRadius: "6px",
          fontSize: "0.75rem",
          fontWeight: 600,
          color,
          background: bg,
          border: `1px solid ${border}`,
          lineHeight: 1.2,
        }}
        title={action}
      >
        {shortLabel}
      </span>
    );
  };

  // If user is resolved on client and not Super Admin, show restricted screen
  if (mounted && !isSuperAdmin) {
    return (
      <div className={styles.dashboardContainer} style={{ padding: "2rem 1rem", maxWidth: "680px", margin: "2rem auto" }}>
        <div className={styles.tableSection}>
          <EmptyState
            icon="lock"
            title="Super Admin Access Required"
            description="System audit logs and compliance history are restricted to authorized Super Administrators."
            actionLabel="Return to Dashboard"
            actionHref="/"
          />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.dashboardContainer} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* ───────────────────────────────────────────────────────────────────────
          HEADER: CLEAN TITLE & TOTAL RECORDS BADGE (MATCHING REVENUE PAGE)
      ───────────────────────────────────────────────────────────────────────── */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)" }}>
            Audit Logs
          </h1>
        </div>

        {/* Polished Total Metric Card (Matching Revenue Page Metric Display) */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0.45rem 1.1rem",
            background: "var(--card-bg, #ffffff)",
            borderRadius: "8px",
            border: "1px solid var(--border-light, #e7e0d6)",
            boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
            flexShrink: 0,
            maxWidth: "100%",
            boxSizing: "border-box",
          }}
        >
          <span
            style={{
              fontSize: "0.68rem",
              color: "var(--text-muted, #78716a)",
              display: "block",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              fontWeight: 600,
              whiteSpace: "nowrap",
              marginBottom: "0.15rem",
            }}
          >
            Total Records
          </span>
          <span
            className="tabularNums"
            style={{
              fontSize: "1.15rem",
              fontWeight: 700,
              color: "var(--text-primary, #14110f)",
              lineHeight: 1.15,
              whiteSpace: "nowrap",
            }}
          >
            {isLoading && !mounted ? "..." : total.toLocaleString()}
          </span>
        </div>
      </header>

      {/* ───────────────────────────────────────────────────────────────────────
          UNIFIED FILTER TOOLBAR WITH INTEGRATED EXPORT ACTION (MATCHING REVENUE)
      ───────────────────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          columnGap: "1rem",
          rowGap: "0.75rem",
          background: "var(--card-bg, #ffffff)",
          padding: "0.75rem 1.15rem",
          borderRadius: "8px",
          border: "1px solid var(--border-light, #e7decb)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
        }}
      >
        {/* Filter Selectors Group */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            columnGap: "1rem",
            rowGap: "0.5rem",
            flex: "1 1 auto",
          }}
        >
          {/* Action Filter */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary, #78716a)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Action:
            </span>
            <CustomSelect
              options={ACTION_FILTER_OPTIONS}
              value={selectedAction}
              onChange={(v) => {
                setSelectedAction(v);
                setPage(1);
              }}
              minWidth="160px"
              ariaLabel="Filter audit records by action"
            />
          </div>

          {/* Period Preset Filter */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary, #78716a)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Period:
            </span>
            <CustomSelect
              options={PERIOD_FILTER_OPTIONS}
              value={selectedPeriod}
              onChange={handlePeriodChange}
              minWidth="140px"
              ariaLabel="Filter audit records by time period"
            />
          </div>

          {/* Date Range: From */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary, #78716a)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              From:
            </span>
            <DatePicker
              value={startDate}
              isOpen={isFromPickerOpen}
              onOpenChange={setIsFromPickerOpen}
              onChange={(val) => {
                setStartDate(val);
                setSelectedPeriod("CUSTOM");
                setPage(1);
                setIsFromPickerOpen(false);
                // If To date isn't selected yet, smoothly open the To calendar next
                if (val && !endDate) {
                  setTimeout(() => setIsToPickerOpen(true), 50);
                }
              }}
              placeholder="dd-mm-yyyy"
              minWidth="140px"
              ariaLabel="Filter audit records from date"
              maxDate={endDate || undefined}
            />
          </div>

          {/* Date Range: To */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary, #78716a)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              To:
            </span>
            <DatePicker
              value={endDate}
              isOpen={isToPickerOpen}
              onOpenChange={setIsToPickerOpen}
              onChange={(val) => {
                setEndDate(val);
                setSelectedPeriod("CUSTOM");
                setPage(1);
                setIsToPickerOpen(false);
              }}
              placeholder="dd-mm-yyyy"
              minWidth="140px"
              ariaLabel="Filter audit records to date"
              minDate={startDate || undefined}
            />
          </div>

          {/* Reset Filters */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetAllFilters}
              style={{
                background: "transparent",
                border: "1px dashed var(--border-light, #e7decb)",
                color: "var(--accent-primary, #c97a1e)",
                fontSize: "0.78rem",
                fontWeight: 600,
                cursor: "pointer",
                padding: "0.4rem 0.75rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                borderRadius: "6px",
              }}
              title="Reset all filters to default"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M23 4v6h-6" />
                <path d="M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              <span>Reset Filters</span>
            </button>
          )}
        </div>

        {/* Integrated Export CSV Button */}
        <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={handleExportCsv}
            disabled={isExporting || logs.length === 0}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.45rem",
              padding: "0 0.85rem",
              height: "36px",
              borderRadius: "6px",
              whiteSpace: "nowrap",
              fontSize: "0.8125rem",
              fontWeight: 600,
            }}
            aria-label="Export audit records to CSV"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>{isExporting ? "Exporting..." : exportSuccess ? "Exported" : "Export CSV"}</span>
          </button>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────────────────
          TABLE SECTION WITH SEARCH BAR & PAGINATION (MATCHING REVENUE)
      ───────────────────────────────────────────────────────────────────────── */}
      <section className={styles.tableSection}>
        <div
          className={styles.sectionHeader}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.75rem",
            marginBottom: "1rem",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>
              All Records ({total.toLocaleString()})
            </h2>
          </div>

          {/* Generous Search Box */}
          <div
            className={styles.searchContainer}
            style={{
              minWidth: "280px",
              maxWidth: "380px",
              flex: "1 1 280px",
              padding: "0.4rem 0.85rem",
            }}
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
              style={{ color: "var(--text-muted)", flexShrink: 0, marginRight: "0.4rem" }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search user, action, entity, reason..."
              className={styles.searchInput}
              style={{ width: "100%" }}
              aria-label="Search audit records"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setPage(1);
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-muted, #78716a)",
                  fontSize: "0.8rem",
                  padding: "0 2px",
                }}
                title="Clear search"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Table Content */}
        <div className={styles.tableWrapper} style={{ overflowX: "auto" }}>
          <table className={styles.adminTable} style={{ width: "100%", minWidth: "960px", tableLayout: "fixed" }}>
            <thead>
              <tr>
                <th style={{ width: "155px", minWidth: "155px", paddingRight: "0.5rem" }}>Date &amp; Time (UTC)</th>
                <th style={{ width: "185px", minWidth: "175px", paddingRight: "0.75rem" }}>User</th>
                <th style={{ width: "150px", minWidth: "145px", paddingRight: "0.75rem" }}>Role</th>
                <th style={{ width: "155px", minWidth: "150px", paddingRight: "0.75rem" }}>Action</th>
                <th style={{ minWidth: "200px" }}>Details / Reason</th>
                <th style={{ width: "95px", minWidth: "95px", textAlign: "center" }}>
                  Metadata
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading || !mounted ? (
                <TableSkeleton columns={6} rows={8} />
              ) : fetchError ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "3rem 1.5rem", color: "#b91c1c" }}>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.45rem",
                        fontWeight: 600,
                        marginBottom: "0.75rem",
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
                      <span>{fetchError}</span>
                    </div>
                    <button
                      type="button"
                      className={styles.secondaryBtn}
                      onClick={() => fetchLogs(page, pageSize)}
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
                      actionLabel={hasActiveFilters ? "Reset Filters" : undefined}
                      onAction={hasActiveFilters ? resetAllFilters : undefined}
                    />
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const detailText = getAuditDetails(log);

                  return (
                    <tr key={log.id}>
                      {/* Date & Time (UTC) */}
                      <td style={{ width: "155px", minWidth: "155px", whiteSpace: "nowrap", paddingRight: "0.5rem" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-primary)" }}>
                            {(() => {
                              const d = new Date(log.createdAt);
                              if (isNaN(d.getTime())) return "—";
                              const day = String(d.getUTCDate()).padStart(2, "0");
                              const month = String(d.getUTCMonth() + 1).padStart(2, "0");
                              const year = d.getUTCFullYear();
                              return `${day}/${month}/${year}`;
                            })()}
                          </span>
                          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                            {(() => {
                              const d = new Date(log.createdAt);
                              if (isNaN(d.getTime())) return "—";
                              const hr = String(d.getUTCHours()).padStart(2, "0");
                              const min = String(d.getUTCMinutes()).padStart(2, "0");
                              const sec = String(d.getUTCSeconds()).padStart(2, "0");
                              return `${hr}:${min}:${sec} UTC`;
                            })()}
                          </span>
                        </div>
                      </td>

                      {/* User (Actor) */}
                      <td style={{ width: "185px", minWidth: "175px", overflow: "hidden", paddingRight: "0.75rem" }}>
                        <div className={styles.cellUser} style={{ gap: "2px", overflow: "hidden" }}>
                          <span
                            className={styles.cellUserName}
                            style={{
                              fontSize: "0.84rem",
                              fontWeight: 600,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              display: "block",
                              color: "var(--text-primary, #2d261e)",
                            }}
                            title={log.actorName}
                          >
                            {log.actorName}
                          </span>
                          {log.actorEmail && (
                            <span
                              className={styles.cellUserEmail}
                              style={{
                                fontSize: "0.75rem",
                                color: "var(--text-muted, #78716a)",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                display: "block",
                              }}
                              title={log.actorEmail}
                            >
                              {log.actorEmail}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Role */}
                      <td style={{ width: "150px", minWidth: "145px", whiteSpace: "nowrap", paddingRight: "0.75rem" }}>
                        {log.actorRole === "SYSTEM" ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              fontSize: "0.72rem",
                              fontWeight: 600,
                              color: "#64748b",
                              background: "#f1f5f9",
                              border: "1px solid #e2e8f0",
                              padding: "2px 8px",
                              borderRadius: "6px",
                              lineHeight: 1.2,
                              whiteSpace: "nowrap",
                            }}
                          >
                            System
                          </span>
                        ) : (
                          <StatusBadge
                            status={
                              log.actorRole === "SUPER_ADMIN"
                                ? "Super Admin"
                                : log.actorRole === "ADMIN"
                                ? "Admin"
                                : log.actorRole === "MANAGER"
                                ? "Batch Manager"
                                : log.actorRole === "USER"
                                ? "Learner"
                                : log.actorRole
                            }
                          />
                        )}
                      </td>

                      {/* Action */}
                      <td style={{ width: "155px", minWidth: "150px", whiteSpace: "nowrap", paddingRight: "0.75rem" }}>
                        {formatActionPill(log.action)}
                      </td>

                      {/* Details / Reason (Clamped to 2 lines max with clean constrained width) */}
                      <td style={{ overflow: "hidden", paddingRight: "0.75rem" }}>
                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--text-secondary, #57534e)",
                            lineHeight: 1.35,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            wordBreak: "break-word",
                            maxWidth: "420px",
                          }}
                          title={detailText}
                        >
                          {detailText}
                        </div>
                      </td>

                      {/* Metadata / Details Action */}
                      <td style={{ width: "95px", minWidth: "95px", textAlign: "center", whiteSpace: "nowrap" }}>
                        <button
                          type="button"
                          className={styles.secondaryBtn}
                          onClick={() => setActiveMetaEntry(log)}
                          style={{ fontSize: "0.75rem", padding: "0.3rem 0.65rem", fontWeight: 600 }}
                          title="View complete record details and parameters"
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Standardized Shared Pagination Component */}
        {!isLoading && total > 0 && (
          <Pagination
            currentPage={page}
            totalItems={total}
            pageSize={pageSize}
            onPageChange={(newPage) => setPage(newPage)}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setPage(1);
            }}
            pageSizeOptions={[10, 20, 50]}
            itemLabel="records"
          />
        )}
      </section>

      {/* Standardized Metadata Detail Modal */}
      {activeMetaEntry && (() => {
        const { usefulProperties, actionLinks } = extractExecutiveMetadata(activeMetaEntry.meta);

        return (
          <Modal
            isOpen={Boolean(activeMetaEntry)}
            onClose={() => setActiveMetaEntry(null)}
            title="Audit Record Details"
            maxWidth="560px"
            footer={
              <div style={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setActiveMetaEntry(null)}
                  style={{ fontSize: "0.8125rem", padding: "0.45rem 1.25rem", fontWeight: 600 }}
                >
                  Close
                </button>
              </div>
            }
          >
            {/* Unified Polished Warm Brown Card with ONLY Useful Data */}
            <div
              style={{
                background: "#faf7f2",
                border: "1px solid #e7decb",
                borderRadius: "10px",
                padding: "1.15rem 1.25rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.95rem",
                width: "100%",
                maxWidth: "100%",
                boxSizing: "border-box",
                overflow: "hidden",
              }}
            >
              {/* Header: Action Badge & Formatted Timestamp */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                  paddingBottom: "0.75rem",
                  borderBottom: "1px solid #ebd9c4",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  {formatActionPill(activeMetaEntry.action)}
                  <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary, #78716a)" }}>
                    on <strong style={{ color: "var(--text-primary, #1c1917)" }}>{activeMetaEntry.entity}</strong>
                  </span>
                </div>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted, #78716a)" }}>
                  {new Date(activeMetaEntry.createdAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    timeZoneName: "short",
                  })}
                </span>
              </div>

              {/* Activity Details / What Happened */}
              <div style={{ borderLeft: "3px solid #c97a1e", paddingLeft: "0.75rem" }}>
                <span
                  style={{
                    display: "block",
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    color: "#c97a1e",
                    marginBottom: "0.2rem",
                  }}
                >
                  Activity Details
                </span>
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.92rem",
                    fontWeight: 600,
                    color: "var(--text-primary, #1c1917)",
                    lineHeight: 1.45,
                    overflowWrap: "anywhere",
                    wordBreak: "break-word",
                  }}
                >
                  {getAuditDetails(activeMetaEntry)}
                </p>
              </div>

              {/* Structured Key-Value Property Ledger (Zero Gaps, 100% Full Width) */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.55rem",
                  background: "#ffffff",
                  padding: "0.85rem 1.1rem",
                  borderRadius: "8px",
                  border: "1px solid #ebd9c4",
                  fontSize: "0.8125rem",
                  width: "100%",
                  boxSizing: "border-box",
                }}
              >
                {/* Performed By Row */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "0.25rem 0.75rem",
                    borderBottom: "1px solid #f4ede4",
                    paddingBottom: "0.5rem",
                  }}
                >
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted, #78716a)", fontWeight: 500 }}>
                    Performed By
                  </span>
                  <div style={{ textAlign: "right" }}>
                    <strong style={{ color: "var(--text-primary, #14110f)", fontSize: "0.82rem" }}>
                      {activeMetaEntry.actorName}
                    </strong>
                    {activeMetaEntry.actorEmail && (
                      <span style={{ display: "block", color: "var(--text-muted, #78716a)", fontSize: "0.72rem" }}>
                        {activeMetaEntry.actorEmail}
                      </span>
                    )}
                  </div>
                </div>

                {/* Role Row */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "0.25rem 0.75rem",
                    borderBottom: usefulProperties.length > 0 || (activeMetaEntry.ip && activeMetaEntry.ip !== "N/A") ? "1px solid #f4ede4" : "none",
                    paddingBottom: usefulProperties.length > 0 || (activeMetaEntry.ip && activeMetaEntry.ip !== "N/A") ? "0.5rem" : "0",
                  }}
                >
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted, #78716a)", fontWeight: 500 }}>
                    Role
                  </span>
                  <span style={{ fontWeight: 600, color: "var(--text-primary, #14110f)", fontSize: "0.8rem" }}>
                    {activeMetaEntry.actorRole === "SUPER_ADMIN"
                      ? "Super Admin"
                      : activeMetaEntry.actorRole === "ADMIN"
                      ? "Admin"
                      : activeMetaEntry.actorRole === "MANAGER"
                      ? "Batch Manager"
                      : activeMetaEntry.actorRole === "USER"
                      ? "Learner"
                      : activeMetaEntry.actorRole || "System"}
                  </span>
                </div>

                {/* Target Entity Row */}
                {activeMetaEntry.entity && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "0.25rem 0.75rem",
                      borderBottom: usefulProperties.length > 0 || (activeMetaEntry.ip && activeMetaEntry.ip !== "N/A") ? "1px solid #f4ede4" : "none",
                      paddingBottom: usefulProperties.length > 0 || (activeMetaEntry.ip && activeMetaEntry.ip !== "N/A") ? "0.5rem" : "0",
                    }}
                  >
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted, #78716a)", fontWeight: 500 }}>
                      Target Entity
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontWeight: 600, color: "var(--text-primary, #14110f)", fontSize: "0.8rem" }}>
                        {activeMetaEntry.targetLabel || activeMetaEntry.entity}
                      </span>
                      {activeMetaEntry.entityId && (
                        <button
                          type="button"
                          onClick={(e) => handleCopyId(activeMetaEntry.entityId, e)}
                          title={`Click to copy full ID: ${activeMetaEntry.entityId}`}
                          style={{
                            fontSize: "0.68rem",
                            fontFamily: "monospace",
                            background: copiedId === activeMetaEntry.entityId ? "#f0fdf4" : "#f8f6f2",
                            border: `1px solid ${copiedId === activeMetaEntry.entityId ? "#bbf7d0" : "#e7e2d8"}`,
                            color: copiedId === activeMetaEntry.entityId ? "#15803d" : "#78716c",
                            padding: "1px 6px",
                            borderRadius: "4px",
                            cursor: "pointer",
                          }}
                        >
                          {copiedId === activeMetaEntry.entityId ? "Copied!" : `${activeMetaEntry.entityId.slice(0, 8)}...`}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Useful Properties Rows */}
                {usefulProperties.map((prop, idx) => (
                  <div
                    key={prop.key}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "0.25rem 0.75rem",
                      borderBottom: idx < usefulProperties.length - 1 || (activeMetaEntry.ip && activeMetaEntry.ip !== "N/A") ? "1px solid #f4ede4" : "none",
                      paddingBottom: idx < usefulProperties.length - 1 || (activeMetaEntry.ip && activeMetaEntry.ip !== "N/A") ? "0.5rem" : "0",
                    }}
                  >
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted, #78716a)", fontWeight: 500 }}>
                      {prop.label}
                    </span>
                    <span
                      style={{
                        fontWeight: 600,
                        color: "var(--text-primary, #14110f)",
                        fontSize: "0.8rem",
                        textAlign: "right",
                        overflowWrap: "anywhere",
                        wordBreak: "break-word",
                      }}
                    >
                      {prop.value}
                    </span>
                  </div>
                ))}

                {/* IP Address Row */}
                {activeMetaEntry.ip && activeMetaEntry.ip !== "N/A" && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "0.25rem 0.75rem",
                    }}
                  >
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted, #78716a)", fontWeight: 500 }}>
                      IP Address
                    </span>
                    <span style={{ fontFamily: "monospace", color: "var(--text-secondary, #78716a)", fontSize: "0.78rem" }}>
                      {activeMetaEntry.ip}
                    </span>
                  </div>
                )}
              </div>

              {/* Associated Action Links (Checkout Links, URLs) with Preview and Copy */}
              {actionLinks.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                    marginTop: "0.2rem",
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      color: "var(--text-muted, #78716a)",
                    }}
                  >
                    Action Links &amp; Resources
                  </span>
                  {actionLinks.map((link) => (
                    <div
                      key={link.url}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.45rem",
                        background: "#ffffff",
                        border: "1px solid #ebd9c4",
                        borderRadius: "8px",
                        padding: "0.75rem 0.85rem",
                        width: "100%",
                        boxSizing: "border-box",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-primary, #14110f)" }}>
                          {link.label}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.3rem",
                              background: "#c97a1e",
                              color: "#ffffff",
                              padding: "0.3rem 0.65rem",
                              borderRadius: "6px",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              textDecoration: "none",
                              transition: "all 0.15s ease",
                            }}
                          >
                            <span>Open Link</span>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                              <polyline points="15 3 21 3 21 9" />
                            </svg>
                          </a>
                          <button
                            type="button"
                            onClick={() => {
                              if (typeof navigator !== "undefined" && navigator.clipboard) {
                                navigator.clipboard.writeText(link.url);
                                setCopiedLinkUrl(link.url);
                                setTimeout(() => setCopiedLinkUrl(null), 2500);
                              }
                            }}
                            title="Copy full link to clipboard"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.3rem",
                              background: "#faf7f2",
                              border: "1px solid #ebd9c4",
                              padding: "0.3rem 0.65rem",
                              borderRadius: "6px",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              color: copiedLinkUrl === link.url ? "#15803d" : "var(--text-secondary, #78716a)",
                              cursor: "pointer",
                            }}
                          >
                            {copiedLinkUrl === link.url ? "Copied" : "Copy"}
                          </button>
                        </div>
                      </div>

                      {/* Truncated Monospace Preview so operator can inspect URL without overflowing */}
                      <div
                        style={{
                          background: "#faf7f2",
                          border: "1px solid #ebd9c4",
                          borderRadius: "5px",
                          padding: "0.3rem 0.5rem",
                          fontSize: "0.72rem",
                          fontFamily: "monospace",
                          color: "var(--text-muted, #78716a)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          maxWidth: "100%",
                          boxSizing: "border-box",
                        }}
                        title={link.url}
                      >
                        {link.url}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Modal>
        );
      })()}

    </div>
  );
}
