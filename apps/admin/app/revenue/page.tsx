"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import styles from "../page.module.css";
import { API_URL, cachedFetch } from "../lib/api";
import { TableSkeleton, EmptyState, CustomSelect, Pagination, DatePicker, SortIndicator, type CustomSelectOption } from "../components";
import { isDateInRange, calculateRevenuePeriodDates, type DateRangeFilter } from "./date-range";
import { formatRevenueMetric, formatCurrencyAmount, getCurrencyParts } from "./revenue-utils";


const DATE_FILTER_OPTIONS: CustomSelectOption[] = [
  { value: "ALL", label: "All Time" },
  { value: "THIS_MONTH", label: "This Month" },
  { value: "TODAY", label: "Today" },
  { value: "YESTERDAY", label: "Yesterday" },
  { value: "LAST_7_DAYS", label: "Last 7 Days" },
  { value: "LAST_30_DAYS", label: "Last 30 Days" },
  { value: "THIS_YEAR", label: "This Year" },
  { value: "CUSTOM", label: "Custom Range" },
];

const STATUS_FILTER_OPTIONS: CustomSelectOption[] = [
  { value: "all", label: "All Statuses" },
  { value: "PAID", label: "Paid" },
  { value: "FAILED", label: "Failed" },
  { value: "PENDING", label: "Pending" },
];

type SortField = "reference" | "learner" | "program" | "amount" | "status" | "date";
type SortDirection = "asc" | "desc";

const Icons = {
  Export: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  CreditCard: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  ),
  Refresh: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  ),
  Dollar: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  Search: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  AlertCircle: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
};

export default function RevenuePage() {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const initialDates = calculateRevenuePeriodDates("ALL");
  const [dateFilter, setDateFilter] = useState<DateRangeFilter>("ALL");
  const [startDate, setStartDate] = useState<string>(initialDates.startDate);
  const [endDate, setEndDate] = useState<string>(initialDates.endDate);
  const [isFromPickerOpen, setIsFromPickerOpen] = useState(false);
  const [isToPickerOpen, setIsToPickerOpen] = useState(false);
  const [programFilter, setProgramFilter] = useState<string>("all");
  const [batchFilter, setBatchFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Column Sorting
  const [sortField, setSortField] = useState<SortField | null>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const activeFetchIdRef = useRef(0);

  const fetchRevenue = async () => {
    const fetchId = ++activeFetchIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const params = new URLSearchParams();
      params.set("period", String(dateFilter));
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const url = `${API_URL}/revenue?${params.toString()}`;
      const res = await cachedFetch(url, {
        skipCache: true,
        headers,
      });
      if (fetchId !== activeFetchIdRef.current) return;

      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        const errJson = await res.json().catch(() => null);
        setError(errJson?.message || `Failed to load revenue data (HTTP ${res.status})`);
      }
    } catch (e: any) {
      if (fetchId === activeFetchIdRef.current) {
        console.error("Failed to fetch revenue", e);
        setError(e?.message || "Unable to connect to the revenue service. Please check your connection.");
      }
    } finally {
      if (fetchId === activeFetchIdRef.current) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchRevenue();
  }, [dateFilter, startDate, endDate]);

  const handlePeriodChange = (period: string) => {
    const pf = period as DateRangeFilter;
    setDateFilter(pf);
    if (period !== "CUSTOM") {
      setIsFromPickerOpen(false);
      setIsToPickerOpen(false);
      const { startDate: s, endDate: e } = calculateRevenuePeriodDates(period);
      setStartDate(s);
      setEndDate(e);
    } else {
      setIsFromPickerOpen(true);
      setIsToPickerOpen(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // DYNAMIC FILTER DROPDOWNS (PROGRAMS & BATCHES)
  // ─────────────────────────────────────────────────────────────────────────────
  const programOptions: CustomSelectOption[] = useMemo(() => {
    const allTx: any[] = data?.transactions || [];
    const set = new Set<string>();
    for (const tx of allTx) {
      if (tx.courseTitle && typeof tx.courseTitle === "string" && tx.courseTitle.trim()) {
        set.add(tx.courseTitle.trim());
      }
    }
    const list = Array.from(set).sort();
    return [
      { value: "all", label: "All Programs" },
      ...list.map((p) => ({ value: p, label: p })),
    ];
  }, [data]);

  const batchOptions: CustomSelectOption[] = useMemo(() => {
    const allTx: any[] = data?.transactions || [];
    const set = new Set<string>();
    for (const tx of allTx) {
      if (programFilter !== "all" && tx.courseTitle !== programFilter && tx.programId !== programFilter) {
        continue;
      }
      if (tx.batchName && typeof tx.batchName === "string" && tx.batchName.trim()) {
        set.add(tx.batchName.trim());
      }
    }
    const list = Array.from(set).sort();
    return [
      { value: "all", label: "All Batches" },
      ...list.map((b) => ({ value: b, label: b })),
    ];
  }, [data, programFilter]);

  // When program changes, reset batch if current selection no longer belongs to that program
  useEffect(() => {
    if (batchFilter !== "all") {
      const isValid = batchOptions.some((b) => b.value === batchFilter);
      if (!isValid) {
        setBatchFilter("all");
      }
    }
  }, [programFilter, batchOptions, batchFilter]);

  // Reset page to 1 whenever any filter or search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [dateFilter, startDate, endDate, programFilter, batchFilter, statusFilter, searchQuery]);

  // ─────────────────────────────────────────────────────────────────────────────
  // FILTERING & COLUMN SORTING LOGIC
  // ─────────────────────────────────────────────────────────────────────────────
  const filteredAndSortedTransactions = useMemo(() => {
    const allTx: any[] = data?.transactions || [];
    const query = searchQuery.trim().toLowerCase();

    const filtered = allTx.filter((tx) => {
      // 1. Date Range
      if (!isDateInRange(tx.createdAt, dateFilter, new Date(), { startDate, endDate })) return false;

      // 2. Program Filter
      if (programFilter !== "all") {
        const matchesProgram =
          tx.courseTitle === programFilter || tx.programId === programFilter;
        if (!matchesProgram) return false;
      }

      // 3. Batch Filter
      if (batchFilter !== "all") {
        const matchesBatch =
          tx.batchName === batchFilter || tx.batchId === batchFilter;
        if (!matchesBatch) return false;
      }

      // 4. Status Filter
      if (statusFilter !== "all") {
        const txStatus = String(tx.status || "").toUpperCase();
        if (txStatus !== statusFilter) return false;
      }

      // 5. Search Query (learner, email, reference, program, batch)
      if (query) {
        const matchesSearch =
          (tx.user && String(tx.user).toLowerCase().includes(query)) ||
          (tx.userEmail && String(tx.userEmail).toLowerCase().includes(query)) ||
          (tx.description && String(tx.description).toLowerCase().includes(query)) ||
          (tx.id && String(tx.id).toLowerCase().includes(query)) ||
          (tx.courseTitle && String(tx.courseTitle).toLowerCase().includes(query)) ||
          (tx.batchName && String(tx.batchName).toLowerCase().includes(query));
        if (!matchesSearch) return false;
      }

      return true;
    });

    if (!sortField) return filtered;

    return [...filtered].sort((a, b) => {
      let valA: any = "";
      let valB: any = "";

      switch (sortField) {
        case "amount":
          valA = typeof a.numericAmount === "number" ? a.numericAmount : Number(a.amount) || 0;
          valB = typeof b.numericAmount === "number" ? b.numericAmount : Number(b.amount) || 0;
          break;
        case "date":
          valA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          valB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          break;
        case "learner":
          valA = (a.user || "").toLowerCase();
          valB = (b.user || "").toLowerCase();
          break;
        case "reference":
          valA = (a.description || a.id || "").toLowerCase();
          valB = (b.description || b.id || "").toLowerCase();
          break;
        case "program":
          valA = (a.courseTitle || "").toLowerCase();
          valB = (b.courseTitle || "").toLowerCase();
          break;
        case "status":
          valA = (a.status || "").toLowerCase();
          valB = (b.status || "").toLowerCase();
          break;
      }

      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [data, dateFilter, programFilter, batchFilter, statusFilter, searchQuery, sortField, sortDirection]);

  // Paginated View Slice
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedTransactions.slice(start, start + pageSize);
  }, [filteredAndSortedTransactions, currentPage, pageSize]);

  // Dynamic Metrics for Current Filtered Slice
  const { displayUsdTotal } = useMemo(() => {
    let usd = 0;
    for (const tx of filteredAndSortedTransactions) {
      const isPaid = tx.status === "PAID" || tx.status === "COMPLETED" || tx.status === "succeeded";
      if (isPaid) {
        const netAmt = typeof tx.netAmount === "number" ? tx.netAmount : Number(tx.numericAmount) || 0;
        if (tx.currency === "USD") {
          usd += netAmt;
        }
      }
    }

    const isUnfilteredAllTime =
      (dateFilter === "all" || dateFilter === "ALL") &&
      programFilter === "all" &&
      batchFilter === "all" &&
      statusFilter === "all" &&
      !searchQuery.trim();

    const finalUsd = isUnfilteredAllTime ? (data?.byCurrency?.USD?.total ?? usd) : usd;

    return {
      displayUsdTotal: finalUsd,
    };
  }, [filteredAndSortedTransactions, data, dateFilter, programFilter, batchFilter, statusFilter, searchQuery]);

  const revenueMetric = useMemo(() => {
    return formatRevenueMetric(displayUsdTotal);
  }, [displayUsdTotal]);

  // Sorting Handler
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else {
        setSortField(null);
        setSortDirection("asc");
      }
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const renderSortIcon = (field: SortField) => {
    return (
      <SortIndicator
        active={sortField === field}
        order={sortDirection}
      />
    );
  };

  // Active filters summary
  const hasActiveFilters =
    (dateFilter !== "ALL" && dateFilter !== "all") ||
    programFilter !== "all" ||
    batchFilter !== "all" ||
    statusFilter !== "all" ||
    searchQuery.trim() !== "";

  const resetAllFilters = () => {
    setDateFilter("ALL");
    const { startDate: s, endDate: e } = calculateRevenuePeriodDates("ALL");
    setStartDate(s);
    setEndDate(e);
    setIsFromPickerOpen(false);
    setIsToPickerOpen(false);
    setProgramFilter("all");
    setBatchFilter("all");
    setStatusFilter("all");
    setSearchQuery("");
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // CSV EXPORT (FULL FILTERED DATASET)
  // ─────────────────────────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    if (!filteredAndSortedTransactions.length) return;
    const dateStr = new Date().toISOString().split("T")[0];
    const filterParts = [
      dateFilter !== "all" && dateFilter !== "ALL" ? dateFilter : null,
      startDate ? `from_${startDate}` : null,
      endDate ? `to_${endDate}` : null,
      programFilter !== "all" ? programFilter.replace(/[^a-z0-9]+/gi, "_").toLowerCase() : null,
      batchFilter !== "all" ? batchFilter.replace(/[^a-z0-9]+/gi, "_").toLowerCase() : null,
      statusFilter !== "all" ? statusFilter.toLowerCase() : null,
    ].filter(Boolean);
    const filterSuffix = filterParts.length > 0 ? `_${filterParts.join("_")}` : "";
    const filename = `revenue_transactions${filterSuffix}_${dateStr}.csv`;

    const headers = ["Sl. No.", "Transaction Reference", "Learner Name", "Learner Email", "Program", "Batch", "Amount", "Currency", "Status", "Date"];

    const rows = filteredAndSortedTransactions.map((t: any, idx: number) => [
      `"${idx + 1}"`,
      `"${(t.description || t.id || "").replace(/"/g, '""')}"`,
      `"${(t.user || "").replace(/"/g, '""')}"`,
      `"${(t.userEmail || "").replace(/"/g, '""')}"`,
      `"${(t.courseTitle || "").replace(/"/g, '""')}"`,
      `"${(t.batchName || "").replace(/"/g, '""')}"`,
      `"${formatCurrencyAmount(typeof t.numericAmount === "number" ? t.numericAmount : t.amount, t.currency)}"`,
      `"${t.currency || "USD"}"`,
      `"${t.status || ""}"`,
      `"${t.date || ""}"`,
    ]);

    const csvString = [headers.join(","), ...rows.map((r: any[]) => r.join(","))].join("\r\n");
    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className={styles.container}>
      {/* ───────────────────────────────────────────────────────────────────────
          HEADER: TITLE, TOTAL REVENUE BADGE
      ───────────────────────────────────────────────────────────────────────── */}
      <header
        className={styles.pageHeader}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
          marginBottom: "1.25rem",
        }}
      >
        <div>
          <h1 className={styles.pageTitle} style={{ margin: 0 }}>Revenue</h1>
        </div>

        {/* Polished Single Total Revenue Metric (Responsive for Large Numbers) */}
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
            Total Revenue (USD)
          </span>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.35rem", flexWrap: "nowrap" }}>
              <span
                className="tabularNums"
                style={{
                  fontSize: revenueMetric.fontSize,
                  fontWeight: 700,
                  color: "var(--text-primary, #14110f)",
                  lineHeight: 1.15,
                  whiteSpace: "nowrap",
                }}
                title={`Exact USD Revenue: ${revenueMetric.fullValue}`}
              >
                {isLoading && !data ? "..." : revenueMetric.displayValue}
              </span>
              {revenueMetric.isCompact && (
                <span
                  style={{
                    fontSize: "0.68rem",
                    color: "var(--text-secondary, #78716a)",
                    fontWeight: 600,
                    cursor: "help",
                  }}
                  title={`Exact full amount: ${revenueMetric.fullValue}`}
                >
                  (Exact in tooltip)
                </span>
              )}
            </div>
        </div>
      </header>

      {/* ───────────────────────────────────────────────────────────────────────
          UNIFIED FILTER TOOLBAR WITH STRUCTURED RESPONSIVE TIERS & EXPORT ACTION
      ───────────────────────────────────────────────────────────────────────── */}
      <div
        style={{
          background: "var(--card-bg, #ffffff)",
          padding: "0.75rem 1.15rem",
          borderRadius: "8px",
          border: "1px solid var(--border-light, #e7decb)",
          marginBottom: "1.25rem",
          boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
          display: "flex",
          flexDirection: "column",
          gap: dateFilter === "CUSTOM" ? "0.75rem" : "0",
        }}
      >
        {dateFilter === "CUSTOM" ? (
          <>
            {/* Tier 1: Date Range Controls & Top-Right Export Action */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "0.75rem",
              }}
            >
              {/* Left: Period Selector & Inline Custom Range Pickers */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                }}
              >
                {/* Period Filter */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                  <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary, #78716a)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Period:
                  </span>
                  <CustomSelect
                    options={DATE_FILTER_OPTIONS}
                    value={dateFilter}
                    onChange={handlePeriodChange}
                    minWidth="140px"
                    menuMinWidth="165px"
                    menuMaxHeight="400px"
                    ariaLabel="Filter transactions by date period"
                  />
                </div>

                {/* Date Range: From & To */}
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "0.75rem",
                    background: "#faf7f2",
                    border: "1px solid #ebdccb",
                    padding: "0.25rem 0.65rem",
                    borderRadius: "8px",
                  }}
                >
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
                        setIsFromPickerOpen(false);
                        if (val && !endDate) {
                          setTimeout(() => setIsToPickerOpen(true), 50);
                        }
                      }}
                      placeholder="dd-mm-yyyy"
                      minWidth="135px"
                      ariaLabel="Filter revenue from date"
                      maxDate={endDate || undefined}
                    />
                  </div>

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
                        setIsToPickerOpen(false);
                      }}
                      placeholder="dd-mm-yyyy"
                      minWidth="135px"
                      ariaLabel="Filter revenue to date"
                      minDate={startDate || undefined}
                    />
                  </div>
                </div>
              </div>

              {/* Right: Export CSV Button (anchored to top-right) */}
              <div style={{ display: "flex", alignItems: "center", flexShrink: 0, marginLeft: "auto" }}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={handleExportCSV}
                  disabled={isLoading || !filteredAndSortedTransactions.length}
                  title={
                    filteredAndSortedTransactions.length > 0
                      ? `Export all ${filteredAndSortedTransactions.length} filtered transactions to CSV (full dataset)`
                      : "No matching transactions to export"
                  }
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.45rem",
                    padding: "0 0.95rem",
                    height: "36px",
                    borderRadius: "6px",
                    whiteSpace: "nowrap",
                    fontWeight: 600,
                    fontSize: "0.82rem",
                  }}
                  aria-label="Export all filtered transactions to CSV"
                >
                  <Icons.Export />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            {/* Tier 2: Categorical Entity Filters & Reset Action */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "1rem",
                paddingTop: "0.65rem",
                borderTop: "1px dashed #f0e9dc",
              }}
            >
              {/* Program Filter */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary, #78716a)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Program:
                </span>
                <CustomSelect
                  options={programOptions}
                  value={programFilter}
                  onChange={(v) => setProgramFilter(v)}
                  minWidth="160px"
                  menuMinWidth="260px"
                  ariaLabel="Filter transactions by program"
                />
              </div>

              {/* Batch Filter */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary, #78716a)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Batch:
                </span>
                <CustomSelect
                  options={batchOptions}
                  value={batchFilter}
                  onChange={(v) => setBatchFilter(v)}
                  minWidth="160px"
                  menuMinWidth="280px"
                  ariaLabel="Filter transactions by cohort batch"
                />
              </div>

              {/* Status Filter */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary, #78716a)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Status:
                </span>
                <CustomSelect
                  options={STATUS_FILTER_OPTIONS}
                  value={statusFilter}
                  onChange={(v) => setStatusFilter(v)}
                  minWidth="130px"
                  menuMinWidth="150px"
                  ariaLabel="Filter transactions by payment status"
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
                  <Icons.Refresh />
                  <span>Reset Filters</span>
                </button>
              )}
            </div>
          </>
        ) : (
          /* Single-line Standard Toolbar when Custom Range is not active */
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              columnGap: "1rem",
              rowGap: "0.65rem",
            }}
          >
            {/* Left Filter Group */}
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
              {/* Period Filter */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary, #78716a)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Period:
                </span>
                <CustomSelect
                  options={DATE_FILTER_OPTIONS}
                  value={dateFilter}
                  onChange={handlePeriodChange}
                  minWidth="140px"
                  menuMinWidth="165px"
                  menuMaxHeight="400px"
                  ariaLabel="Filter transactions by date period"
                />
              </div>

              {/* Program Filter */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary, #78716a)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Program:
                </span>
                <CustomSelect
                  options={programOptions}
                  value={programFilter}
                  onChange={(v) => setProgramFilter(v)}
                  minWidth="160px"
                  menuMinWidth="260px"
                  ariaLabel="Filter transactions by program"
                />
              </div>

              {/* Batch Filter */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary, #78716a)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Batch:
                </span>
                <CustomSelect
                  options={batchOptions}
                  value={batchFilter}
                  onChange={(v) => setBatchFilter(v)}
                  minWidth="160px"
                  menuMinWidth="280px"
                  ariaLabel="Filter transactions by cohort batch"
                />
              </div>

              {/* Status Filter */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary, #78716a)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Status:
                </span>
                <CustomSelect
                  options={STATUS_FILTER_OPTIONS}
                  value={statusFilter}
                  onChange={(v) => setStatusFilter(v)}
                  minWidth="130px"
                  menuMinWidth="150px"
                  ariaLabel="Filter transactions by payment status"
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
                  <Icons.Refresh />
                  <span>Reset Filters</span>
                </button>
              )}
            </div>

            {/* Right Export Action */}
            <div style={{ display: "flex", alignItems: "center", flexShrink: 0, marginLeft: "auto" }}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={handleExportCSV}
                disabled={isLoading || !filteredAndSortedTransactions.length}
                title={
                  filteredAndSortedTransactions.length > 0
                    ? `Export all ${filteredAndSortedTransactions.length} filtered transactions to CSV (full dataset)`
                    : "No matching transactions to export"
                }
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.45rem",
                  padding: "0 0.95rem",
                  height: "36px",
                  borderRadius: "6px",
                  whiteSpace: "nowrap",
                  fontWeight: 600,
                  fontSize: "0.82rem",
                }}
                aria-label="Export all filtered transactions to CSV"
              >
                <Icons.Export />
                <span>Export CSV</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Polished Error Banner */}
      {error && (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.85rem",
            padding: "0.85rem 1.15rem",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "8px",
            marginBottom: "1.25rem",
            boxShadow: "0 1px 3px rgba(239, 68, 68, 0.06)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                background: "#fee2e2",
                color: "#dc2626",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                border: "1px solid #fca5a5",
              }}
            >
              <Icons.AlertCircle />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "#991b1b" }}>
                  Unable to connect to revenue service
                </span>
                <span
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    padding: "1px 6px",
                    borderRadius: "4px",
                    background: "#fee2e2",
                    color: "#b91c1c",
                    fontFamily: "monospace",
                  }}
                >
                  {error === "Failed to fetch" ? "Network Error / Server Offline" : error}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "#b91c1c", lineHeight: 1.4 }}>
                {data?.transactions?.length
                  ? "Showing previously loaded records. Please ensure the backend service on port 4000 is running."
                  : "Could not retrieve transaction records. Please ensure the backend service on port 4000 is running and retry."}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => fetchRevenue()}
              disabled={isLoading}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.45rem 0.85rem",
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "#991b1b",
                background: "#ffffff",
                border: "1px solid #fca5a5",
                borderRadius: "6px",
                cursor: isLoading ? "wait" : "pointer",
                boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#fff5f5")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#ffffff")}
            >
              <Icons.Refresh />
              <span>{isLoading ? "Connecting…" : "Retry"}</span>
            </button>
            <button
              type="button"
              onClick={() => setError(null)}
              style={{
                border: "none",
                background: "transparent",
                color: "#b91c1c",
                cursor: "pointer",
                padding: "0.35rem 0.5rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "4px",
                fontSize: "1rem",
                lineHeight: 1,
              }}
              title="Dismiss alert"
              aria-label="Dismiss alert"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────────
          UNIFIED TRANSACTIONS TABLE SECTION
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
              All Transactions
            </h2>
          </div>

          {/* Search Box with generous width so helper text is fully visible */}
          <div
            className={styles.searchContainer}
            style={{
              minWidth: "300px",
              maxWidth: "420px",
              flex: "1 1 320px",
              padding: "0.4rem 0.85rem",
            }}
          >
            <Icons.Search />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search learner, ref, program, batch..."
              className={styles.searchInput}
              style={{ marginLeft: "0.5rem", width: "100%" }}
              aria-label="Search transactions"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
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
                ✕
              </button>
            )}
          </div>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                {/* Sl. No. Column */}
                <th style={{ width: "48px", textAlign: "center" }}>
                  #
                </th>

                {/* Transaction Reference (Click to Sort) */}
                <th
                  onClick={() => handleSort("reference")}
                  style={{ cursor: "pointer", userSelect: "none" }}
                  title="Click to sort by Transaction Reference"
                  aria-sort={sortField === "reference" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                >
                  <span style={{ display: "inline-flex", alignItems: "center" }}>
                    Transaction Reference {renderSortIcon("reference")}
                  </span>
                </th>

                {/* Learner (Click to Sort) */}
                <th
                  onClick={() => handleSort("learner")}
                  style={{ cursor: "pointer", userSelect: "none" }}
                  title="Click to sort by Learner"
                  aria-sort={sortField === "learner" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                >
                  <span style={{ display: "inline-flex", alignItems: "center" }}>
                    Learner {renderSortIcon("learner")}
                  </span>
                </th>

                {/* Program & Batch (Click to Sort) */}
                <th
                  onClick={() => handleSort("program")}
                  style={{ cursor: "pointer", userSelect: "none" }}
                  title="Click to sort by Program & Batch"
                  aria-sort={sortField === "program" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                >
                  <span style={{ display: "inline-flex", alignItems: "center" }}>
                    Program &amp; Batch {renderSortIcon("program")}
                  </span>
                </th>

                {/* Amount (Click to Sort) */}
                <th
                  onClick={() => handleSort("amount")}
                  style={{ cursor: "pointer", userSelect: "none" }}
                  title="Click to sort by Amount"
                  aria-sort={sortField === "amount" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                >
                  <span style={{ display: "inline-flex", alignItems: "center" }}>
                    Amount {renderSortIcon("amount")}
                  </span>
                </th>

                {/* Status (Click to Sort) */}
                <th
                  onClick={() => handleSort("status")}
                  style={{ cursor: "pointer", userSelect: "none" }}
                  title="Click to sort by Status"
                  aria-sort={sortField === "status" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                >
                  <span style={{ display: "inline-flex", alignItems: "center" }}>
                    Status {renderSortIcon("status")}
                  </span>
                </th>

                {/* Date (Click to Sort) */}
                <th
                  onClick={() => handleSort("date")}
                  style={{ cursor: "pointer", userSelect: "none" }}
                  title="Click to sort by Date"
                  aria-sort={sortField === "date" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                >
                  <span style={{ display: "inline-flex", alignItems: "center" }}>
                    Date {renderSortIcon("date")}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading && !data ? (
                <TableSkeleton columns={7} rows={6} />
              ) : filteredAndSortedTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: "40px 16px" }}>
                    <EmptyState
                      icon={error ? <Icons.AlertCircle /> : <Icons.Dollar />}
                      title={
                        error
                          ? "Unable to load revenue records"
                          : `No transactions recorded ${hasActiveFilters ? "matching your filters" : ""}`
                      }
                      description={
                        error
                          ? "The server could not be reached. Please ensure the backend service on port 4000 is active."
                          : hasActiveFilters
                          ? "Try clearing the search query or resetting filters to see all transactions."
                          : "Transaction settlements and invoice records will appear here."
                      }
                    />
                  </td>
                </tr>
              ) : (
                paginatedTransactions.map((tx: any, index: number) => {
                  const globalIndex = (currentPage - 1) * pageSize + index + 1;
                  return (
                    <tr key={tx.id || `tx-${globalIndex}`}>
                      {/* Sl. No. Cell */}
                      <td style={{ textAlign: "center", color: "var(--text-muted, #78716a)", fontWeight: 600, fontSize: "0.82rem" }}>
                        {globalIndex}
                      </td>

                      {/* Transaction Reference (Monospace & Prominent) */}
                      <td>
                        <span
                          style={{
                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                            fontWeight: 600,
                            fontSize: "0.85rem",
                            color: "var(--text-primary, #14110f)",
                            letterSpacing: "0.02em",
                          }}
                        >
                          {tx.description || tx.id}
                        </span>
                      </td>

                      {/* Learner */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span className={styles.cellUserName}>{tx.user}</span>
                          {tx.userEmail && (
                            <span style={{ fontSize: "0.74rem", color: "var(--text-muted, #78716a)" }}>
                              {tx.userEmail}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Program & Batch (Clean Logical Pairing) */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "3px", alignItems: "flex-start" }}>
                          <span className={styles.cellText} style={{ fontWeight: 600, color: "var(--text-primary, #14110f)" }}>
                            {tx.courseTitle || "Direct Enrolment"}
                          </span>
                          {tx.batchName && (
                            <span
                              style={{
                                fontSize: "0.72rem",
                                color: "var(--text-secondary, #78716a)",
                                background: "var(--bg-tag, #f5f2eb)",
                                border: "1px solid var(--border-light, #e7decb)",
                                padding: "1px 6px",
                                borderRadius: "4px",
                                display: "inline-block",
                                maxWidth: "260px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                              title={tx.batchName}
                            >
                              {tx.batchName}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Amount */}
                      <td>
                        <span
                          className={`${styles.cellAmount} tabularNums`}
                          style={{
                            fontWeight: 600,
                            display: "inline-flex",
                            alignItems: "center",
                            direction: "ltr",
                            unicodeBidi: "isolate",
                          }}
                        >
                          {(() => {
                            const { symbol, value, isRtlSymbol } = getCurrencyParts(
                              typeof tx.numericAmount === "number" ? tx.numericAmount : tx.amount,
                              tx.currency
                            );
                            return (
                              <>
                                <bdi dir={isRtlSymbol ? "rtl" : "ltr"}>{symbol}</bdi>
                                {isRtlSymbol && <span style={{ width: "0.28rem", display: "inline-block" }} />}
                                <span dir="ltr">{value}</span>
                              </>
                            );
                          })()}
                        </span>
                      </td>

                      {/* Status Badge */}
                      <td>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "2px 8px",
                            borderRadius: "9999px",
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                            background:
                              tx.status === "PAID" || tx.status === "COMPLETED" || tx.status === "succeeded"
                                ? "rgba(16, 185, 129, 0.12)"
                                : tx.status === "FAILED"
                                ? "rgba(239, 68, 68, 0.12)"
                                : "rgba(245, 158, 11, 0.14)",
                            color:
                              tx.status === "PAID" || tx.status === "COMPLETED" || tx.status === "succeeded"
                                ? "#059669"
                                : tx.status === "FAILED"
                                ? "#dc2626"
                                : "#d97706",
                          }}
                        >
                          {tx.status}
                        </span>
                      </td>

                      {/* Date */}
                      <td>
                        <span className={styles.cellTextMuted}>{tx.date}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ─────────────────────────────────────────────────────────────────────
            SHARED REUSABLE PAGINATION
        ─────────────────────────────────────────────────────────────────────── */}
        {!isLoading && filteredAndSortedTransactions.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalItems={filteredAndSortedTransactions.length}
            pageSize={pageSize}
            onPageChange={(page) => setCurrentPage(page)}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setCurrentPage(1);
            }}
            pageSizeOptions={[10, 20, 50]}
            itemLabel="transactions"
          />
        )}
      </section>
    </div>
  );
}
