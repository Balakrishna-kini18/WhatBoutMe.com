"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import styles from "../page.module.css";
import {
  API_URL,
  cachedFetch,
  generateLeadCheckoutPaymentLink,
  type SupportedCurrency,
} from "../lib/api";
import {
  CustomSelect,
  ActionMenu,
  ConfirmDialog,
  Modal,
  useToast,
  TableSkeleton,
  EmptyState,
  Pagination,
  SortIndicator,
  StatusBadge,
  type SortOrder,
} from "../components";
import { parseLeadMessage } from "../lib/lead-parser";

interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string | null;
  status: string;
  createdAt: string;
}

interface ProgramOption {
  id: string;
  title: string;
  price: number;
  priceUSD?: number | null;
  priceAED?: number | null;
  priceINR?: number | null;
  currency?: string | null;
  isActive?: boolean;
}

interface BatchOption {
  id: string;
  name: string;
  programId?: string;
  program?: { id: string; title: string } | string;
  status?: string;
}

const STATUSES = [
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "CONVERTED", label: "Converted" },
  { value: "CLOSED", label: "Closed" },
];

type LeadSortField = "name" | "category" | "createdAt" | "status";

export default function LeadsPage() {
  return (
    <Suspense fallback={null}>
      <LeadsContent />
    </Suspense>
  );
}

function LeadsContent() {
  const searchParams = useSearchParams();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters, Sorting & Pagination
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<LeadSortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const toast = useToast();
  const [leadToDelete, setLeadToDelete] = useState<Lead | null>(null);
  const [isDeletingLead, setIsDeletingLead] = useState(false);

  // Conversion Workflow State
  const [leadToConvert, setLeadToConvert] = useState<Lead | null>(null);
  const [targetProgramId, setTargetProgramId] = useState("");
  const [targetBatchId, setTargetBatchId] = useState("");
  const [targetCurrency, setTargetCurrency] = useState<SupportedCurrency>("USD");
  const [adminNote, setAdminNote] = useState("");
  const [isConverting, setIsConverting] = useState(false);
  const [conversionResult, setConversionResult] = useState<{
    checkoutUrl: string;
    emailSent: boolean;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const load = async () => {
    try {
      const [leadsRes, progsRes, batchesRes] = await Promise.all([
        cachedFetch(`${API_URL}/leads`),
        cachedFetch(`${API_URL}/programs`).catch(() => null),
        cachedFetch(`${API_URL}/batches`).catch(() => null),
      ]);
      if (leadsRes.ok) setLeads(await leadsRes.json());
      if (progsRes && progsRes.ok) {
        const pData = await progsRes.json();
        if (Array.isArray(pData)) setPrograms(pData);
      }
      if (batchesRes && batchesRes.ok) {
        const bData = await batchesRes.json();
        if (Array.isArray(bData)) setBatches(bData);
      }
    } catch (e) {
      console.error("Failed to load enquiries", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, categoryFilter, searchQuery]);

  // Auto-open convert modal if navigated with ?action=convert or ?leadId=
  useEffect(() => {
    const action = searchParams.get("action");
    const leadId = searchParams.get("leadId") || searchParams.get("convertLeadId");
    const email = searchParams.get("email");
    if ((action === "convert" || leadId) && leads.length > 0) {
      const match = leads.find(
        (l) =>
          (leadId && l.id === leadId) ||
          (email && l.email?.toLowerCase() === email.toLowerCase())
      );
      if (match && (!leadToConvert || leadToConvert.id !== match.id)) {
        handleOpenConvertModal(match);
      }
    }
  }, [searchParams, leads]);

  const handleOpenConvertModal = (lead: Lead) => {
    setLeadToConvert(lead);
    setConversionResult(null);
    setCopiedLink(false);
    setAdminNote("");

    let preselectedProgId = "";
    if (lead.message) {
      const match = lead.message.match(/ID:\s*([a-zA-Z0-9-]+)/i);
      if (match && match[1]) {
        preselectedProgId = match[1];
      } else {
        const found = programs.find((p) =>
          lead.message!.toLowerCase().includes(p.title.toLowerCase())
        );
        if (found) preselectedProgId = found.id;
      }
    }

    if (!preselectedProgId && programs.length > 0) {
      preselectedProgId = programs[0]!.id;
    }

    setTargetProgramId(preselectedProgId);

    const prog = programs.find((p) => p.id === preselectedProgId);
    if (
      prog?.currency &&
      (prog.currency === "USD" || prog.currency === "AED" || prog.currency === "INR")
    ) {
      setTargetCurrency(prog.currency as any);
    } else {
      setTargetCurrency("USD");
    }

    const progBatches = batches.filter((b) => {
      const pId =
        typeof b.program === "object" && b.program !== null ? b.program.id : b.programId;
      return pId === preselectedProgId;
    });
    setTargetBatchId(progBatches.length > 0 ? progBatches[0]!.id : "");
  };

  const handleProgramChange = (progId: string) => {
    setTargetProgramId(progId);
    const prog = programs.find((p) => p.id === progId);
    if (
      prog?.currency &&
      (prog.currency === "USD" || prog.currency === "AED" || prog.currency === "INR")
    ) {
      setTargetCurrency(prog.currency as any);
    }
    const progBatches = batches.filter((b) => {
      const pId =
        typeof b.program === "object" && b.program !== null ? b.program.id : b.programId;
      return pId === progId;
    });
    setTargetBatchId(progBatches.length > 0 ? progBatches[0]!.id : "");
  };

  const handleExecuteConversion = async () => {
    if (!leadToConvert) return;
    setIsConverting(true);

    try {
      const linkResult = await generateLeadCheckoutPaymentLink({
        leadId: leadToConvert.id,
        courseId: targetProgramId,
        batchId: targetBatchId || undefined,
        currency: targetCurrency,
        note: adminNote.trim() || undefined,
      });

      setConversionResult({
        checkoutUrl: linkResult.checkoutUrl,
        emailSent: linkResult.emailSent,
      });

      setLeads((all) =>
        all.map((l) => (l.id === leadToConvert.id ? { ...l, status: "CONVERTED" } : l))
      );

      load();

      if (linkResult.checkoutUrl && navigator.clipboard) {
        await navigator.clipboard.writeText(linkResult.checkoutUrl).catch(() => {});
      }

      toast.success(
        "Lead converted! Payment link copied to clipboard and emailed to prospect."
      );
    } catch (e: any) {
      toast.error(e?.message || "Failed to convert lead.");
    } finally {
      setIsConverting(false);
    }
  };

  const handleCopyCheckoutLink = async (url: string) => {
    if (!url) return;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      }
      toast.success("Checkout link copied to clipboard!");
    } catch {
      toast.error("Failed to copy link.");
    }
  };

  const setStatus = async (id: string, nextStatus: string) => {
    const previous = leads;
    setLeads((all) => all.map((l) => (l.id === id ? { ...l, status: nextStatus } : l)));
    try {
      const res = await cachedFetch(`${API_URL}/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        setLeads(previous);
        toast.error("Failed to update status.");
      } else {
        toast.success(`Status updated to ${nextStatus}.`);
      }
    } catch {
      setLeads(previous);
      toast.error("Failed to update status.");
    }
  };

  const confirmDeleteLead = async () => {
    if (!leadToDelete) return;
    const id = leadToDelete.id;
    setIsDeletingLead(true);
    const previous = leads;
    setLeads((all) => all.filter((l) => l.id !== id));
    toast.success("Enquiry removed.");
    setLeadToDelete(null);

    try {
      const res = await cachedFetch(`${API_URL}/leads/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setLeads(previous);
        toast.error("Failed to delete enquiry.");
      }
    } catch {
      setLeads(previous);
      toast.error("Failed to delete enquiry.");
    } finally {
      setIsDeletingLead(false);
    }
  };

  const handleSort = (field: LeadSortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  // Base filtered leads (by search & category, before status filter)
  const contextFilteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const parsed = parseLeadMessage(lead.message);
      if (categoryFilter === "COURSE" && !parsed.isCourseInquiry) return false;
      if (categoryFilter === "GENERAL" && parsed.isCourseInquiry) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const nameMatch = lead.name.toLowerCase().includes(q);
      const emailMatch = lead.email.toLowerCase().includes(q);
      const phoneMatch = lead.phone ? lead.phone.toLowerCase().includes(q) : false;
      const msgMatch = lead.message ? lead.message.toLowerCase().includes(q) : false;
      return nameMatch || emailMatch || phoneMatch || msgMatch;
    });
  }, [leads, categoryFilter, searchQuery]);

  const statusCounts = useMemo(() => {
    const counts = {
      ALL: contextFilteredLeads.length,
      NEW: 0,
      CONTACTED: 0,
      CONVERTED: 0,
      CLOSED: 0,
    };
    for (const l of contextFilteredLeads) {
      if (l.status === "NEW") counts.NEW++;
      else if (l.status === "CONTACTED") counts.CONTACTED++;
      else if (l.status === "CONVERTED") counts.CONVERTED++;
      else if (l.status === "CLOSED") counts.CLOSED++;
    }
    return counts;
  }, [contextFilteredLeads]);

  const statusFilterOptions = useMemo(() => {
    return [
      { value: "ALL", label: `All Statuses (${statusCounts.ALL})` },
      { value: "NEW", label: `New (${statusCounts.NEW})` },
      { value: "CONTACTED", label: `Contacted (${statusCounts.CONTACTED})` },
      { value: "CONVERTED", label: `Converted (${statusCounts.CONVERTED})` },
      { value: "CLOSED", label: `Closed (${statusCounts.CLOSED})` },
    ];
  }, [statusCounts]);

  const categoryFilterOptions = [
    { value: "ALL", label: "All Categories" },
    { value: "COURSE", label: "Course Inquiry" },
    { value: "GENERAL", label: "General Inquiry" },
  ];

  const filteredLeads = useMemo(() => {
    if (statusFilter === "ALL") return contextFilteredLeads;
    return contextFilteredLeads.filter((l) => l.status === statusFilter);
  }, [contextFilteredLeads, statusFilter]);

  const sortedLeads = useMemo(() => {
    return [...filteredLeads].sort((a, b) => {
      let cmp = 0;
      if (sortField === "name") {
        cmp = (a.name || "").localeCompare(b.name || "");
      } else if (sortField === "category") {
        const pA = parseLeadMessage(a.message).isCourseInquiry ? "Course" : "General";
        const pB = parseLeadMessage(b.message).isCourseInquiry ? "Course" : "General";
        cmp = pA.localeCompare(pB);
      } else if (sortField === "createdAt") {
        cmp = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      } else if (sortField === "status") {
        cmp = (a.status || "").localeCompare(b.status || "");
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });
  }, [filteredLeads, sortField, sortOrder]);

  const paginatedLeads = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedLeads.slice(start, start + pageSize);
  }, [sortedLeads, page, pageSize]);

  const hasActiveFilters = Boolean(
    statusFilter !== "ALL" || categoryFilter !== "ALL" || searchQuery.trim()
  );

  const resetFilters = () => {
    setStatusFilter("ALL");
    setCategoryFilter("ALL");
    setSearchQuery("");
    setPage(1);
  };

  return (
    <div className={styles.dashboardContainer}>
      <header className={styles.header} style={{ marginBottom: 0 }}>
        <div className={styles.headerText}>
          <h1 className={styles.title} style={{ margin: 0 }}>
            Enquiries
          </h1>
        </div>
      </header>

      <section className={styles.tableSection}>
        {/* Search & Filters Toolbar */}
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
          {/* Left: Search */}
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
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, email, phone, or message..."
              className={styles.searchInput}
              aria-label="Search enquiries"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
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

          {/* Right: Category & Status Dropdowns */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
            <CustomSelect
              ariaLabel="Filter enquiries by category"
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={categoryFilterOptions}
              minWidth="170px"
            />
            <CustomSelect
              ariaLabel="Filter enquiries by status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={statusFilterOptions}
              minWidth="170px"
            />
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className={styles.secondaryBtnSmall}
                style={{ height: "36px", padding: "0 0.85rem" }}
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Clean Canonical Table */}
        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th
                  onClick={() => handleSort("name")}
                  style={{ cursor: "pointer", userSelect: "none" }}
                >
                  Enquirer
                  <SortIndicator active={sortField === "name"} order={sortOrder} />
                </th>
                <th
                  onClick={() => handleSort("category")}
                  style={{ cursor: "pointer", userSelect: "none" }}
                >
                  Category &amp; Course
                  <SortIndicator active={sortField === "category"} order={sortOrder} />
                </th>
                <th>Message</th>
                <th
                  onClick={() => handleSort("createdAt")}
                  style={{ cursor: "pointer", userSelect: "none" }}
                >
                  Date
                  <SortIndicator active={sortField === "createdAt"} order={sortOrder} />
                </th>
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
              {isLoading ? (
                <TableSkeleton columns={6} rows={5} />
              ) : paginatedLeads.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: "36px 16px" }}>
                    <EmptyState
                      icon="users"
                      title={hasActiveFilters ? "No enquiries match your filters" : "No enquiries yet"}
                      description={
                        hasActiveFilters
                          ? "Try clearing your search or switching the active filter."
                          : "New enquiries from the public contact form will appear here."
                      }
                      actionLabel={hasActiveFilters ? "Reset Filters" : undefined}
                      onAction={hasActiveFilters ? resetFilters : undefined}
                    />
                  </td>
                </tr>
              ) : (
                paginatedLeads.map((lead) => {
                  const parsed = parseLeadMessage(lead.message);
                  const zoomMatch =
                    parsed.discovery?.zoomUrl ||
                    lead.message?.match(/https:\/\/zoom\.us\/[^\s\]]+/)?.[0];
                  const isConverted = lead.status === "CONVERTED" || Boolean(parsed.conversion);
                  const courseTitle =
                    parsed.conversion?.courseTitle || parsed.courseInquiry?.title;

                  return (
                    <tr key={lead.id}>
                      {/* Enquirer */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span className={styles.cellUserName}>{lead.name}</span>
                          <span className={styles.cellUserEmail}>{lead.email}</span>
                          {lead.phone && (
                            <span className={styles.cellTextMuted} style={{ fontSize: "0.76rem" }}>
                              {lead.phone}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Category & Course */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span
                            style={{
                              fontWeight: 600,
                              color: "var(--text-primary)",
                              fontSize: "0.85rem",
                            }}
                          >
                            {parsed.isCourseInquiry ? "Course Inquiry" : "General Inquiry"}
                          </span>
                          <span className={styles.cellTextMuted}>
                            {courseTitle || (parsed.isWhatsAppGeneral ? "WhatsApp" : "Website Contact")}
                          </span>
                        </div>
                      </td>

                      {/* Message */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxWidth: "340px" }}>
                          {parsed.originalMessage ? (
                            <div
                              style={{
                                fontSize: "0.84rem",
                                color: "var(--text-secondary)",
                                lineHeight: 1.4,
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                              title={parsed.originalMessage}
                            >
                              {parsed.originalMessage}
                            </div>
                          ) : (
                            <span className={styles.cellTextMuted}>—</span>
                          )}
                          {zoomMatch && (
                            <a
                              href={zoomMatch}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                fontSize: "0.76rem",
                                color: "var(--accent-primary, #c97a1e)",
                                fontWeight: 600,
                                textDecoration: "none",
                              }}
                            >
                              Join Discovery Call &nearr;
                            </a>
                          )}
                        </div>
                      </td>

                      {/* Date */}
                      <td>
                        <span className={styles.cellTextMuted}>
                          {new Date(lead.createdAt).toLocaleDateString(undefined, {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </td>

                      {/* Status (Single Clean StatusBadge) */}
                      <td>
                        <StatusBadge status={lead.status} />
                      </td>

                      {/* Actions */}
                      <td className={styles.alignRight}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "flex-end",
                            gap: "6px",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => handleOpenConvertModal(lead)}
                            className={
                              isConverted ? styles.secondaryBtnSmall : styles.primaryBtnSmall
                            }
                          >
                            {isConverted ? "Resend Link" : "Convert & Send"}
                          </button>

                          {(() => {
                            const actionItems = [
                              {
                                label: isConverted
                                  ? "Resend Payment Link"
                                  : "Convert & Send Payment Link",
                                onClick: () => handleOpenConvertModal(lead),
                              },
                              ...(parsed.conversion?.checkoutUrl
                                ? [
                                    {
                                      label: "Copy Checkout Link",
                                      onClick: () =>
                                        handleCopyCheckoutLink(parsed.conversion!.checkoutUrl),
                                    },
                                  ]
                                : []),
                              ...(zoomMatch
                                ? [
                                    {
                                      label: "Join Zoom Discovery Call",
                                      href: zoomMatch,
                                    },
                                  ]
                                : []),
                              ...STATUSES.filter((s) => s.value !== lead.status).map((s) => ({
                                label: `Mark as ${s.label}`,
                                onClick: () => setStatus(lead.id, s.value),
                              })),
                              {
                                label: "Delete Enquiry",
                                danger: true,
                                dividerAbove: true,
                                onClick: () => setLeadToDelete(lead),
                              },
                            ];

                            return (
                              <ActionMenu
                                ariaLabel={`Actions for ${lead.name}`}
                                items={actionItems}
                              />
                            );
                          })()}
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
          totalItems={sortedLeads.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setPage(1);
          }}
          itemLabel="enquiries"
        />
      </section>

      {/* Convert Lead & Send Course Payment Link Modal */}
      <Modal
        isOpen={Boolean(leadToConvert)}
        onClose={() => {
          if (!isConverting) {
            setLeadToConvert(null);
            setConversionResult(null);
            setCopiedLink(false);
          }
        }}
        title={
          leadToConvert?.status === "CONVERTED"
            ? "Resend Course Payment Link"
            : "Convert Lead & Send Course Payment Link"
        }
        maxWidth="580px"
      >
        {leadToConvert && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div
              style={{
                background: "#fbf9f5",
                border: "1px solid #e7e0d6",
                borderRadius: "10px",
                padding: "12px 16px",
              }}
            >
              <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-primary)" }}>
                {leadToConvert.name}
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                {leadToConvert.email} {leadToConvert.phone && `· ${leadToConvert.phone}`}
              </div>
            </div>

            {conversionResult ? (
              <div
                style={{
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: "12px",
                  padding: "20px",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "50%",
                    background: "#dcfce7",
                    color: "#16a34a",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 12px",
                    fontSize: "1.5rem",
                  }}
                >
                  ✓
                </div>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#166534", margin: "0 0 6px" }}>
                  Payment Link Generated &amp; Emailed!
                </h3>
                <p style={{ fontSize: "0.82rem", color: "#15803d", margin: "0 0 16px" }}>
                  An automated email with this pre-configured checkout link has been dispatched to{" "}
                  <strong>{leadToConvert.email}</strong>.
                </p>

                <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                  <input
                    readOnly
                    value={conversionResult.checkoutUrl}
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid #bbf7d0",
                      background: "#ffffff",
                      fontSize: "0.78rem",
                      fontFamily: "monospace",
                      color: "#166534",
                      outline: "none",
                    }}
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (navigator.clipboard) {
                        await navigator.clipboard.writeText(conversionResult.checkoutUrl);
                        setCopiedLink(true);
                        setTimeout(() => setCopiedLink(false), 2500);
                      }
                    }}
                    style={{
                      padding: "8px 14px",
                      borderRadius: "8px",
                      border: "1px solid #16a34a",
                      background: copiedLink ? "#15803d" : "#ffffff",
                      color: copiedLink ? "#ffffff" : "#16a34a",
                      fontWeight: 600,
                      fontSize: "0.78rem",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {copiedLink ? "✓ Copied!" : "Copy Link"}
                  </button>
                  <a
                    href={conversionResult.checkoutUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding: "8px 14px",
                      borderRadius: "8px",
                      background: "#166534",
                      color: "#ffffff",
                      fontWeight: 600,
                      fontSize: "0.78rem",
                      textDecoration: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Open Checkout ↗
                  </a>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setLeadToConvert(null);
                    setConversionResult(null);
                    setCopiedLink(false);
                  }}
                  className={styles.primaryBtn}
                >
                  Done
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      marginBottom: "4px",
                    }}
                  >
                    Target Course *
                  </label>
                  <CustomSelect
                    value={targetProgramId}
                    onChange={handleProgramChange}
                    options={programs.map((p) => ({ value: p.id, label: p.title }))}
                    ariaLabel="Select Course to Enrol Lead"
                    minWidth="100%"
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      marginBottom: "4px",
                    }}
                  >
                    Target Cohort / Batch
                  </label>
                  {(() => {
                    const progBatches = batches.filter((b) => {
                      const pId =
                        typeof b.program === "object" && b.program !== null
                          ? b.program.id
                          : b.programId;
                      return pId === targetProgramId;
                    });
                    const options = [
                      { value: "", label: "Auto (Next Available / Default Cohort)" },
                      ...progBatches.map((b) => ({ value: b.id, label: b.name })),
                    ];

                    return (
                      <CustomSelect
                        value={targetBatchId}
                        onChange={setTargetBatchId}
                        options={options}
                        ariaLabel="Select Cohort or Batch"
                        minWidth="100%"
                      />
                    );
                  })()}
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      marginBottom: "6px",
                    }}
                  >
                    Currency &amp; Tuition Amount *
                  </label>
                  {(() => {
                    const prog = programs.find((p) => p.id === targetProgramId);
                    const usdPrice = prog?.priceUSD ?? prog?.price ?? 0;
                    const aedPrice = prog?.priceAED ?? Math.round(Number(usdPrice) * 3.67);
                    const inrPrice = prog?.priceINR ?? Math.round(Number(usdPrice) * 83);

                    return (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                        <button
                          type="button"
                          onClick={() => setTargetCurrency("USD")}
                          style={{
                            padding: "10px",
                            borderRadius: "8px",
                            border:
                              targetCurrency === "USD"
                                ? "2px solid var(--accent-primary, #c97a1e)"
                                : "1px solid var(--border-light, #ece4d7)",
                            background:
                              targetCurrency === "USD" ? "rgba(201, 122, 30, 0.08)" : "#ffffff",
                            textAlign: "center",
                            cursor: "pointer",
                          }}
                        >
                          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                            USD
                          </div>
                          <div
                            style={{
                              fontSize: "0.95rem",
                              fontWeight: 800,
                              color: "var(--text-primary)",
                              marginTop: "2px",
                            }}
                          >
                            ${Number(usdPrice).toLocaleString()}
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setTargetCurrency("AED")}
                          style={{
                            padding: "10px",
                            borderRadius: "8px",
                            border:
                              targetCurrency === "AED"
                                ? "2px solid var(--accent-primary, #c97a1e)"
                                : "1px solid var(--border-light, #ece4d7)",
                            background:
                              targetCurrency === "AED" ? "rgba(201, 122, 30, 0.08)" : "#ffffff",
                            textAlign: "center",
                            cursor: "pointer",
                          }}
                        >
                          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                            AED
                          </div>
                          <div
                            style={{
                              fontSize: "0.95rem",
                              fontWeight: 800,
                              color: "var(--text-primary)",
                              marginTop: "2px",
                            }}
                          >
                            AED {Number(aedPrice).toLocaleString()}
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setTargetCurrency("INR")}
                          style={{
                            padding: "10px",
                            borderRadius: "8px",
                            border:
                              targetCurrency === "INR"
                                ? "2px solid var(--accent-primary, #c97a1e)"
                                : "1px solid var(--border-light, #ece4d7)",
                            background:
                              targetCurrency === "INR" ? "rgba(201, 122, 30, 0.08)" : "#ffffff",
                            textAlign: "center",
                            cursor: "pointer",
                          }}
                        >
                          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                            INR
                          </div>
                          <div
                            style={{
                              fontSize: "0.95rem",
                              fontWeight: 800,
                              color: "var(--text-primary)",
                              marginTop: "2px",
                            }}
                          >
                            ₹{Number(inrPrice).toLocaleString()}
                          </div>
                        </button>
                      </div>
                    );
                  })()}
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      marginBottom: "4px",
                    }}
                  >
                    Internal Note / Audit Reason (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    placeholder="e.g., Prospect confirmed interest during Discovery call; provisioned for upcoming cohort."
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-light, #ece4d7)",
                      background: "#ffffff",
                      fontSize: "0.82rem",
                      color: "var(--text-primary)",
                      outline: "none",
                      resize: "vertical",
                    }}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
                  <button
                    type="button"
                    onClick={() => setLeadToConvert(null)}
                    disabled={isConverting}
                    className={styles.secondaryBtn}
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={handleExecuteConversion}
                    disabled={isConverting || !targetProgramId}
                    className={styles.primaryBtn}
                  >
                    {isConverting
                      ? "Generating Link..."
                      : leadToConvert.status === "CONVERTED"
                      ? "Resend Payment Link"
                      : "Convert & Send Payment Link"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(leadToDelete)}
        onClose={() => {
          if (!isDeletingLead) setLeadToDelete(null);
        }}
        onConfirm={confirmDeleteLead}
        title="Delete Enquiry"
        subtitle={leadToDelete ? `${leadToDelete.name} (${leadToDelete.email})` : undefined}
        description={
          <>
            Are you sure you want to permanently delete the enquiry from{" "}
            <strong>{leadToDelete?.name}</strong>?
          </>
        }
        tone="danger"
        confirmText={isDeletingLead ? "Deleting..." : "Delete Enquiry"}
        cancelText="Cancel"
        isLoading={isDeletingLead}
      />
    </div>
  );
}
