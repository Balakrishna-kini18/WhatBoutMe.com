"use client";

import { useEffect, useState, useMemo, FormEvent } from "react";
import styles from "../page.module.css";
import Link from "next/link";
import { API_URL, errorMessage } from "../lib/api";
import {
  CustomSelect,
  StatusBadge,
  TableSkeleton,
  EmptyState,
  AgreementMarkdown,
  Pagination,
  SortIndicator,
  type SortOrder,
} from "../components";

interface AgreementTemplate {
  id: string;
  title: string;
  description: string | null;
  programId: string;
  program?: {
    id: string;
    title: string;
    slug: string;
  };
  versions?: Array<{
    id: string;
    version: string;
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    publishedAt: string | null;
  }>;
  _count?: {
    versions: number;
    signedAgreements: number;
  };
  createdAt: string;
  updatedAt: string;
}

interface ProgramOption {
  id: string;
  title: string;
  slug: string;
}

type AgreementSortField = "title" | "program" | "version" | "signed" | "updatedAt" | "status";

function getTemplateStatus(tpl: AgreementTemplate): "PUBLISHED" | "DRAFT" | "ARCHIVED" {
  const publishedVersion = tpl.versions?.find((v) => v.status === "PUBLISHED");
  const hasDraft = tpl.versions?.some((v) => v.status === "DRAFT");
  return publishedVersion ? "PUBLISHED" : hasDraft ? "DRAFT" : "ARCHIVED";
}

function isTemplateSharedDefault(tpl: AgreementTemplate): boolean {
  return (
    /\[Shared Default\]/.test(tpl.description ?? "") ||
    /standard|default|general|platform/i.test(tpl.title) ||
    /default|shared/i.test(tpl.description || "")
  );
}

export default function AdminAgreementsPage() {
  const [templates, setTemplates] = useState<AgreementTemplate[]>([]);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filters, Sorting & Pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [programFilter, setProgramFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortField, setSortField] = useState<AgreementSortField>("updatedAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Create Template form states
  const [scopeType, setScopeType] = useState<"PROGRAM" | "SHARED_DEFAULT">("PROGRAM");
  const [selectedProgramId, setSelectedProgramId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [initialVersion, setInitialVersion] = useState("v1.0");
  const [initialContent, setInitialContent] = useState("");
  const [initialChangelog, setInitialChangelog] = useState("Initial terms and conditions release");
  const [publishImmediately, setPublishImmediately] = useState(false);
  const [contentTab, setContentTab] = useState<"edit" | "preview">("edit");

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, programFilter, statusFilter]);

  useEffect(() => {
    if (!isModalOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isModalOpen]);

  const fetchData = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const [templatesRes, programsRes] = await Promise.all([
        fetch(`${API_URL}/admin/agreement-templates`, { headers }),
        fetch(`${API_URL}/programs`, { headers }),
      ]);

      if (templatesRes.ok) {
        const templatesData = await templatesRes.json();
        setTemplates(Array.isArray(templatesData) ? templatesData : []);
      } else {
        const msg = await errorMessage(templatesRes, "Failed to load agreement templates");
        setErrorMsg(msg);
      }

      if (programsRes.ok) {
        const programsData = await programsRes.json();
        const rawPrograms = Array.isArray(programsData) ? programsData : [];
        const filteredPrograms = rawPrograms
          .filter((p: any) => !p.isArchived && !/test\s*program|placeholder|junk|foo\s*bar/i.test(p.title))
          .sort((a: any, b: any) => a.title.localeCompare(b.title));
        setPrograms(filteredPrograms);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateTemplate = async (e: FormEvent) => {
    e.preventDefault();

    if (scopeType === "PROGRAM" && !selectedProgramId) {
      setErrorMsg("Please select a target program for this agreement.");
      return;
    }

    if (!title.trim() || !initialContent.trim()) {
      setErrorMsg("Please enter an agreement title and terms content.");
      return;
    }

    const targetProgramId = scopeType === "PROGRAM" ? selectedProgramId : programs[0]?.id;
    if (!targetProgramId) {
      setErrorMsg("At least one active program is required in the system to establish an agreement template.");
      return;
    }

    const resolvedDescription =
      scopeType === "SHARED_DEFAULT"
        ? [description.trim(), "[Shared Default]"].filter(Boolean).join(" ")
        : description.trim() || undefined;

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_URL}/admin/agreement-templates`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          programId: targetProgramId,
          title: title.trim(),
          description: resolvedDescription,
          initialVersion: initialVersion.trim() || "v1.0",
          initialContent: initialContent.trim(),
          initialChangelog: initialChangelog.trim() || undefined,
          publishImmediately,
        }),
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to create agreement template"));
      }

      setIsModalOpen(false);
      resetForm();
      await fetchData();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to create template");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setScopeType("PROGRAM");
    setSelectedProgramId("");
    setTitle("");
    setDescription("");
    setInitialVersion("v1.0");
    setInitialContent("");
    setInitialChangelog("Initial terms and conditions release");
    setPublishImmediately(false);
    setContentTab("edit");
  };

  const handleSort = (field: AgreementSortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const programFilterOptions = useMemo(() => {
    const map = new Map<string, string>();
    programs.forEach((p) => map.set(p.id, p.title));
    templates.forEach((tpl) => {
      if (tpl.program?.id && tpl.program?.title && !isTemplateSharedDefault(tpl)) {
        map.set(tpl.program.id, tpl.program.title);
      }
    });
    return [
      { value: "ALL", label: "All Programs" },
      { value: "SHARED_DEFAULT", label: "Shared Default" },
      ...Array.from(map.entries()).map(([value, label]) => ({ value, label })),
    ];
  }, [programs, templates]);

  const contextFilteredTemplates = useMemo(() => {
    return templates.filter((tpl) => {
      const isShared = isTemplateSharedDefault(tpl);
      if (programFilter === "SHARED_DEFAULT" && !isShared) return false;
      if (programFilter !== "ALL" && programFilter !== "SHARED_DEFAULT") {
        if (isShared || tpl.programId !== programFilter) return false;
      }

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const titleMatch = tpl.title.toLowerCase().includes(q);
      const descMatch = (tpl.description || "").toLowerCase().includes(q);
      const progMatch = (tpl.program?.title || "").toLowerCase().includes(q);
      return titleMatch || descMatch || progMatch;
    });
  }, [templates, programFilter, searchQuery]);

  const statusFilterOptions = useMemo(() => {
    const counts = {
      ALL: contextFilteredTemplates.length,
      PUBLISHED: 0,
      DRAFT: 0,
      ARCHIVED: 0,
    };
    for (const tpl of contextFilteredTemplates) {
      const st = getTemplateStatus(tpl);
      counts[st]++;
    }
    return [
      { value: "ALL", label: `All Statuses (${counts.ALL})` },
      { value: "PUBLISHED", label: `Published (${counts.PUBLISHED})` },
      { value: "DRAFT", label: `Draft (${counts.DRAFT})` },
      { value: "ARCHIVED", label: `Archived (${counts.ARCHIVED})` },
    ];
  }, [contextFilteredTemplates]);

  const filteredTemplates = useMemo(() => {
    if (statusFilter === "ALL") return contextFilteredTemplates;
    return contextFilteredTemplates.filter((tpl) => getTemplateStatus(tpl) === statusFilter);
  }, [contextFilteredTemplates, statusFilter]);

  const sortedTemplates = useMemo(() => {
    return [...filteredTemplates].sort((a, b) => {
      let cmp = 0;
      if (sortField === "title") {
        cmp = (a.title || "").localeCompare(b.title || "");
      } else if (sortField === "program") {
        const pA = isTemplateSharedDefault(a) ? "All Programs" : a.program?.title || "";
        const pB = isTemplateSharedDefault(b) ? "All Programs" : b.program?.title || "";
        cmp = pA.localeCompare(pB);
      } else if (sortField === "version") {
        const vA = a.versions?.find((v) => v.status === "PUBLISHED")?.version || a.versions?.[0]?.version || "";
        const vB = b.versions?.find((v) => v.status === "PUBLISHED")?.version || b.versions?.[0]?.version || "";
        cmp = vA.localeCompare(vB);
      } else if (sortField === "signed") {
        cmp = (a._count?.signedAgreements ?? 0) - (b._count?.signedAgreements ?? 0);
      } else if (sortField === "updatedAt") {
        cmp = new Date(a.updatedAt || a.createdAt || 0).getTime() - new Date(b.updatedAt || b.createdAt || 0).getTime();
      } else if (sortField === "status") {
        cmp = getTemplateStatus(a).localeCompare(getTemplateStatus(b));
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });
  }, [filteredTemplates, sortField, sortOrder]);

  const paginatedTemplates = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedTemplates.slice(start, start + pageSize);
  }, [sortedTemplates, page, pageSize]);

  const hasActiveFilters = Boolean(
    searchQuery.trim() || programFilter !== "ALL" || statusFilter !== "ALL"
  );

  const resetFilters = () => {
    setSearchQuery("");
    setProgramFilter("ALL");
    setStatusFilter("ALL");
    setPage(1);
  };

  return (
    <div className={styles.dashboardContainer}>
      <header className={styles.header} style={{ marginBottom: 0 }}>
        <div className={styles.headerText}>
          <h1 className={styles.title} style={{ margin: 0 }}>
            Agreements
          </h1>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.primaryBtn}
            onClick={() => {
              resetForm();
              setIsModalOpen(true);
            }}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>Create Agreement</span>
          </button>
        </div>
      </header>

      {errorMsg && (
        <div className={styles.alertError}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>{errorMsg}</span>
        </div>
      )}

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
              placeholder="Search agreement or program..."
              className={styles.searchInput}
              aria-label="Search agreements"
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

          {/* Right: Program & Status Dropdowns */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
            <CustomSelect
              ariaLabel="Filter agreements by program"
              value={programFilter}
              onChange={setProgramFilter}
              options={programFilterOptions}
              minWidth="185px"
            />
            <CustomSelect
              ariaLabel="Filter agreements by status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={statusFilterOptions}
              minWidth="165px"
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

        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th
                  onClick={() => handleSort("title")}
                  style={{ cursor: "pointer", userSelect: "none" }}
                >
                  Agreement
                  <SortIndicator active={sortField === "title"} order={sortOrder} />
                </th>
                <th
                  onClick={() => handleSort("program")}
                  style={{ cursor: "pointer", userSelect: "none" }}
                >
                  Program
                  <SortIndicator active={sortField === "program"} order={sortOrder} />
                </th>
                <th
                  onClick={() => handleSort("version")}
                  style={{ cursor: "pointer", userSelect: "none" }}
                >
                  Version
                  <SortIndicator active={sortField === "version"} order={sortOrder} />
                </th>
                <th
                  onClick={() => handleSort("signed")}
                  style={{ cursor: "pointer", userSelect: "none" }}
                >
                  Signed
                  <SortIndicator active={sortField === "signed"} order={sortOrder} />
                </th>
                <th
                  onClick={() => handleSort("updatedAt")}
                  style={{ cursor: "pointer", userSelect: "none" }}
                >
                  Updated
                  <SortIndicator active={sortField === "updatedAt"} order={sortOrder} />
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
                <TableSkeleton columns={7} rows={5} />
              ) : sortedTemplates.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: "32px 16px" }}>
                    <EmptyState
                      icon="document"
                      title={hasActiveFilters ? "No matching agreements" : "No agreements configured yet"}
                      description={
                        hasActiveFilters
                          ? "Try adjusting your search or filter criteria."
                          : "Create an agreement template to manage program terms and learner signatures."
                      }
                      actionLabel={hasActiveFilters ? "Reset Filters" : "Create Agreement"}
                      onAction={hasActiveFilters ? resetFilters : () => setIsModalOpen(true)}
                    />
                  </td>
                </tr>
              ) : (
                paginatedTemplates.map((tpl) => {
                  const publishedVersion = tpl.versions?.find((v) => v.status === "PUBLISHED");
                  const status = getTemplateStatus(tpl);
                  const isSharedDefault = isTemplateSharedDefault(tpl);
                  const currentVersionText = publishedVersion?.version || tpl.versions?.[0]?.version || "—";
                  const signedCount = tpl._count?.signedAgreements ?? 0;
                  const updatedDate = new Date(tpl.updatedAt || tpl.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  });
                  const cleanDescription = (tpl.description ?? "").replace(/^\[Shared Default\]\s*/i, "").trim();

                  return (
                    <tr key={tpl.id}>
                      <td>
                        <div className={styles.cellUserName}>{tpl.title}</div>
                        {cleanDescription && (
                          <div
                            className={styles.cellUserEmail}
                            style={{
                              maxWidth: "300px",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={cleanDescription}
                          >
                            {cleanDescription}
                          </div>
                        )}
                      </td>
                      <td>
                        {isSharedDefault ? (
                          <div>
                            <div className={styles.cellUserName}>All Programs</div>
                            <div className={styles.cellUserEmail}>Shared Default</div>
                          </div>
                        ) : (
                          <div className={styles.cellUserName}>{tpl.program?.title || "—"}</div>
                        )}
                      </td>
                      <td>
                        <span className={styles.cellTextSecondary}>{currentVersionText}</span>
                      </td>
                      <td>
                        <span className={styles.cellTextSecondary}>{signedCount}</span>
                      </td>
                      <td>
                        <span className={styles.cellTextMuted}>{updatedDate}</span>
                      </td>
                      <td>
                        <StatusBadge status={status} />
                      </td>
                      <td className={styles.alignRight}>
                        <Link
                          href={`/agreements/${tpl.id}`}
                          className={styles.secondaryBtnSmall}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            textDecoration: "none",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Manage
                        </Link>
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
          pageSize={pageSize}
          totalItems={sortedTemplates.length}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          itemLabel="agreements"
        />
      </section>

      {/* CREATE TEMPLATE MODAL */}
      {isModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsModalOpen(false)}>
          <div
            className={styles.modalContent}
            style={{ maxWidth: "700px" }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="agreement-modal-title"
          >
            <div className={styles.modalHeader}>
              <div>
                <h2 id="agreement-modal-title">Create Agreement</h2>
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setIsModalOpen(false)}
                aria-label="Close dialog"
              >
                ×
              </button>
            </div>

            <form
              onSubmit={handleCreateTemplate}
              style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0, overflow: "hidden" }}
            >
              <div className={styles.modalBody}>
                {/* 1. Scope Selector */}
                <div className={styles.formGroup}>
                  <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.35rem" }}>
                    Scope <span style={{ color: "var(--status-error)" }}>*</span>
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                    <button
                      type="button"
                      onClick={() => setScopeType("PROGRAM")}
                      style={{
                        padding: "0.65rem 0.9rem",
                        borderRadius: "8px",
                        border: scopeType === "PROGRAM" ? "2px solid var(--accent-primary, #b86b11)" : "1px solid var(--border-light, #e7decb)",
                        background: scopeType === "PROGRAM" ? "var(--bg-soft, #f7f3ec)" : "#ffffff",
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: "0.84rem", color: "var(--text-primary)" }}>
                        Program-specific
                      </div>
                      <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: "2px" }}>
                        Assigned to a single program
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setScopeType("SHARED_DEFAULT")}
                      style={{
                        padding: "0.65rem 0.9rem",
                        borderRadius: "8px",
                        border: scopeType === "SHARED_DEFAULT" ? "2px solid var(--accent-primary, #b86b11)" : "1px solid var(--border-light, #e7decb)",
                        background: scopeType === "SHARED_DEFAULT" ? "var(--bg-soft, #f7f3ec)" : "#ffffff",
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: "0.84rem", color: "var(--text-primary)" }}>
                        Shared default
                      </div>
                      <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: "2px" }}>
                        Fallback for unassigned programs
                      </div>
                    </button>
                  </div>
                </div>

                {/* 2. Program Selector */}
                {scopeType === "PROGRAM" && (
                  <div className={styles.formGroup}>
                    <label>
                      Program <span style={{ color: "var(--status-error)" }}>*</span>
                    </label>
                    <CustomSelect
                      value={selectedProgramId}
                      onChange={setSelectedProgramId}
                      fullWidth
                      menuMaxHeight="220px"
                      ariaLabel="Select Program"
                      placeholder="-- Choose a program --"
                      options={programs.map((p) => ({
                        value: p.id,
                        label: p.title,
                      }))}
                    />
                  </div>
                )}

                {/* 3. Agreement Title */}
                <div className={styles.formGroup}>
                  <label>
                    Title <span style={{ color: "var(--status-error)" }}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Standard Program Agreement"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </div>

                {/* 4. Description */}
                <div className={styles.formGroup}>
                  <label>Description <span className={styles.optionalLabel}>(Optional)</span></label>
                  <input
                    type="text"
                    placeholder="Brief administrative summary"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                {/* 5. Versioning row */}
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label>
                      Initial Version <span style={{ color: "var(--status-error)" }}>*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="v1.0"
                      value={initialVersion}
                      onChange={(e) => setInitialVersion(e.target.value)}
                      required
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Changelog <span className={styles.optionalLabel}>(Optional)</span></label>
                    <input
                      type="text"
                      placeholder="e.g. Initial terms release"
                      value={initialChangelog}
                      onChange={(e) => setInitialChangelog(e.target.value)}
                    />
                  </div>
                </div>

                {/* 6. Agreement Terms */}
                <div className={styles.formGroup}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <label style={{ margin: 0 }}>
                      Terms &amp; Conditions <span style={{ color: "var(--status-error)" }}>*</span>
                    </label>
                    <div style={{ display: "inline-flex", background: "var(--bg-soft, #f7f3ec)", padding: "2px", borderRadius: "6px", border: "1px solid var(--border-light, #e7decb)" }}>
                      <button
                        type="button"
                        onClick={() => setContentTab("edit")}
                        style={{
                          border: "none",
                          background: contentTab === "edit" ? "#ffffff" : "transparent",
                          color: contentTab === "edit" ? "var(--text-primary)" : "var(--text-secondary)",
                          padding: "4px 10px",
                          borderRadius: "4px",
                          fontSize: "0.76rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setContentTab("preview")}
                        style={{
                          border: "none",
                          background: contentTab === "preview" ? "#ffffff" : "transparent",
                          color: contentTab === "preview" ? "var(--text-primary)" : "var(--text-secondary)",
                          padding: "4px 10px",
                          borderRadius: "4px",
                          fontSize: "0.76rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Preview
                      </button>
                    </div>
                  </div>

                  {contentTab === "edit" ? (
                    <textarea
                      rows={6}
                      placeholder="Enter agreement terms in Markdown format..."
                      value={initialContent}
                      onChange={(e) => setInitialContent(e.target.value)}
                      required
                      style={{
                        fontFamily: "monospace",
                        fontSize: "0.85rem",
                        lineHeight: "1.6",
                        padding: "0.75rem 1rem",
                        minHeight: "140px",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        background: "#ffffff",
                        border: "1px solid var(--border-light, #E7E0D6)",
                        borderRadius: "8px",
                        padding: "1rem 1.25rem",
                        minHeight: "140px",
                        maxHeight: "240px",
                        overflowY: "auto",
                        fontSize: "0.88rem",
                        lineHeight: 1.65,
                        color: "var(--text-primary)",
                      }}
                    >
                      {initialContent.trim() ? (
                        <AgreementMarkdown content={initialContent} />
                      ) : (
                        <p style={{ color: "var(--text-muted)", fontStyle: "italic", margin: 0 }}>
                          No content entered yet.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* 7. Publication Status */}
                <div className={styles.formGroup}>
                  <div style={{ display: "flex", gap: "1.5rem" }}>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.85rem", color: "var(--text-primary)" }}>
                      <input
                        type="radio"
                        name="lifecycle"
                        checked={!publishImmediately}
                        onChange={() => setPublishImmediately(false)}
                        style={{ accentColor: "var(--accent-primary)" }}
                      />
                      <span>Save as Draft</span>
                    </label>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.85rem", color: "var(--text-primary)" }}>
                      <input
                        type="radio"
                        name="lifecycle"
                        checked={publishImmediately}
                        onChange={() => setPublishImmediately(true)}
                        style={{ accentColor: "var(--accent-primary)" }}
                      />
                      <span>Publish Live</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Creating..." : "Create Agreement"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
