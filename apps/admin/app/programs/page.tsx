"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "../page.module.css";
import pstyles from "./programs.module.css";
import { formatCourseInfo, parseCourseInfo, cleanCardSummary } from "./courseInfo";
import { cachedFetch, API_URL } from "../lib/api";
import {
  ActionMenu,
  ConfirmDialog,
  useToast,
  EmptyState,
  TableSkeleton,
  StatusBadge,
} from "../components";

interface Program {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  shortDescription?: string | null;
  price: number;
  currency?: string;
  isActive: boolean;
  status?: string;
  hasCertificate?: boolean;
  requireExam?: boolean;
  sequentialProgressionEnabled?: boolean;
  _count?: {
    steps?: number;
    batches?: number;
    enrolments?: number;
    resourceItems?: number;
    questionBanks?: number;
  };
}

const getCourseImageUrl = (rawUrl?: string | null): string => {
  if (!rawUrl) return "";
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("/")) {
    return trimmed;
  }
  return `/${trimmed}`;
};

export default function ProgramsPage() {
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { success: toastSuccess, error: toastError } = useToast();

  const [programs, setPrograms] = useState<Program[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  // Search & Filtering
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "HIDDEN">("ALL");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Actions in flight
  const [isCreatingDraft, setIsCreatingDraft] = useState(false);
  const [isDuplicatingId, setIsDuplicatingId] = useState<string | null>(null);

  // Deletion modal state
  const [programToDelete, setProgramToDelete] = useState<Program | null>(null);
  const [isDeletingProgram, setIsDeletingProgram] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const getAuthHeaders = (): Record<string, string> => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  useEffect(() => {
    fetchPrograms();

    const handleFocus = () => {
      fetchPrograms();
    };

    window.addEventListener("focus", handleFocus);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchPrograms();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const fetchPrograms = async () => {
    try {
      const res = await cachedFetch(`${API_URL}/programs`, {
        skipCache: true,
        headers: {
          ...getAuthHeaders(),
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });
      if (res.ok) {
        const data = await res.json();
        setPrograms(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.warn("Notice: could not retrieve programs list", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateProgram = async () => {
    if (isCreatingDraft) return;
    setIsCreatingDraft(true);
    try {
      const uniqueSuffix = Math.floor(1000 + Math.random() * 9000);
      const initialTitle = "Untitled Program";
      const slug = `untitled-program-${Date.now()}-${uniqueSuffix}`;
      const payload = {
        title: initialTitle,
        slug,
        isActive: false,
        status: "DRAFT",
        price: 0,
        currency: "USD",
        hasCertificate: true,
        description: formatCourseInfo({
          summary: "",
          short: "",
          type: "Certification",
          duration: "",
          audience: "",
          inPerson: "",
          online: "",
          image: "",
          points: [],
          faqs: [],
        }),
      };

      const res = await cachedFetch(`${API_URL}/programs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const saved = await res.json();
        toastSuccess("Draft program created. Opening curriculum studio...");
        router.push(`/programs/${saved.id}`);
      } else {
        const err = await res.json().catch(() => null);
        toastError(err?.message || "Failed to create draft program.");
      }
    } catch (e: any) {
      toastError(e?.message || "Could not reach server.");
    } finally {
      setIsCreatingDraft(false);
    }
  };

  const handleDeleteProgram = (prog: Program) => {
    setDeleteError(null);
    setProgramToDelete(prog);
  };

  const confirmDeleteProgram = async () => {
    if (!programToDelete) return;
    setIsDeletingProgram(true);
    setDeleteError(null);
    try {
      const res = await cachedFetch(`${API_URL}/programs/${programToDelete.id}?force=true`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        toastSuccess(`Program "${programToDelete.title}" removed permanently.`);
        setPrograms((prev) => prev.filter((p) => p.id !== programToDelete.id));
        setProgramToDelete(null);
      } else {
        const errorData = await res.json().catch(() => null);
        const errMsg = errorData?.error?.message ?? errorData?.message ?? "Failed to delete program";
        setDeleteError(errMsg);
        toastError(`Failed to delete program: ${errMsg}`);
      }
    } catch (e: any) {
      const errMsg = e?.message || "Could not reach server";
      setDeleteError(errMsg);
      toastError(`Failed to delete program: ${errMsg}`);
    } finally {
      setIsDeletingProgram(false);
    }
  };

  const handleDuplicateProgram = async (prog: Program) => {
    if (isDuplicatingId) return;
    setIsDuplicatingId(prog.id);
    try {
      const res = await cachedFetch(`${API_URL}/programs/${prog.id}/duplicate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
      });

      if (res.ok) {
        const cloned = await res.json();
        toastSuccess(`Program "${prog.title}" duplicated as "${cloned.title}".`);
        await fetchPrograms();
      } else {
        const err = await res.json().catch(() => null);
        toastError(err?.message || "Failed to duplicate program.");
      }
    } catch (e: any) {
      toastError(e.message || "Failed to duplicate program.");
    } finally {
      setIsDuplicatingId(null);
    }
  };

  // Status counts for tabs
  const statusCounts = useMemo(() => {
    const counts = { ALL: programs.length, ACTIVE: 0, HIDDEN: 0 };
    for (const p of programs) {
      const isDraft = !p.isActive || p.status === "DRAFT";
      if (isDraft) counts.HIDDEN++;
      else counts.ACTIVE++;
    }
    return counts;
  }, [programs]);

  // Filtered Programs
  const filteredPrograms = useMemo(() => {
    return programs.filter((p) => {
      const matchesSearch =
        !searchQuery.trim() ||
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()));

      const isDraft = !p.isActive || p.status === "DRAFT";
      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && !isDraft) ||
        (statusFilter === "HIDDEN" && isDraft);

      return matchesSearch && matchesStatus;
    });
  }, [programs, searchQuery, statusFilter]);

  return (
    <div className={styles.dashboardContainer} style={{ gap: "0.85rem" }}>
      {/* 1. Page Header */}
      <header
        className={styles.header}
        style={{
          marginBottom: 0,
          alignItems: "center",
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div className={styles.headerText}>
          <h1 className={styles.title} style={{ margin: 0 }}>
            Programs
          </h1>
        </div>

        <div className={styles.headerActions}>
          <button
            className={styles.primaryBtn}
            onClick={handleCreateProgram}
            disabled={isCreatingDraft}
            style={{
              opacity: isCreatingDraft ? 0.75 : 1,
              cursor: isCreatingDraft ? "not-allowed" : "pointer",
            }}
          >
            {isCreatingDraft ? (
              <>
                <div
                  style={{
                    width: 14,
                    height: 14,
                    border: "2px solid rgba(255, 255, 255, 0.4)",
                    borderTopColor: "#ffffff",
                    borderRadius: "50%",
                    animation: "uploaderSpin 0.75s linear infinite",
                  }}
                />
                <span>Creating Draft...</span>
              </>
            ) : (
              <>
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>Create Program</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* 2. Status Tab Navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
        <div className={styles.tabsContainer} role="tablist" aria-label="Program directory views" style={{ margin: 0 }}>
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === "ALL"}
            className={`${styles.tabBtn} ${statusFilter === "ALL" ? styles.tabBtnActive : ""}`}
            onClick={() => setStatusFilter("ALL")}
          >
            All Programs ({statusCounts.ALL})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === "ACTIVE"}
            className={`${styles.tabBtn} ${statusFilter === "ACTIVE" ? styles.tabBtnActive : ""}`}
            onClick={() => setStatusFilter("ACTIVE")}
          >
            Published ({statusCounts.ACTIVE})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === "HIDDEN"}
            className={`${styles.tabBtn} ${statusFilter === "HIDDEN" ? styles.tabBtnActive : ""}`}
            onClick={() => setStatusFilter("HIDDEN")}
          >
            Drafts ({statusCounts.HIDDEN})
          </button>
        </div>
      </div>

      {/* 3. Search & View Mode Toggle Bar (Aligned with Batches & Other Admin Pages) */}
      <div className={pstyles.controlBar}>
        <div
          className={styles.searchContainer}
          style={{ minWidth: "240px", flex: "1 1 280px", maxWidth: "380px" }}
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
            style={{
              color: "var(--text-muted)",
              flexShrink: 0,
              marginRight: "0.4rem",
            }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={searchInputRef}
            type="text"
            className={styles.searchInput}
            placeholder="Search programs by title or curriculum..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className={pstyles.viewModeToggle}>
          <button
            type="button"
            className={`${pstyles.viewModeBtn} ${viewMode === "grid" ? pstyles.viewModeBtnActive : ""}`}
            onClick={() => setViewMode("grid")}
            title="Grid cards view"
            aria-label="Grid cards view"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
          </button>
          <button
            type="button"
            className={`${pstyles.viewModeBtn} ${viewMode === "table" ? pstyles.viewModeBtnActive : ""}`}
            onClick={() => setViewMode("table")}
            title="Dense table view"
            aria-label="Dense table view"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* 4. Programs Content: Clean Cards Grid or Table View */}
      {isLoading ? (
        viewMode === "grid" ? (
          <div className={pstyles.programsGrid}>
            {[1, 2, 3, 4, 5, 6].map((idx) => (
              <div key={idx} className={pstyles.skeletonCard}>
                <div className={`skeleton ${pstyles.skeletonMedia}`} />
                <div className={pstyles.skeletonBody}>
                  <div className="skeleton" style={{ height: 20, width: "70%", borderRadius: 4 }} />
                  <div className="skeleton" style={{ height: 14, width: "95%", borderRadius: 4 }} />
                  <div className="skeleton" style={{ height: 14, width: "60%", borderRadius: 4 }} />
                  <div className="skeleton" style={{ height: 14, width: "85%", borderRadius: 4, marginTop: 4 }} />
                  <div className="skeleton" style={{ height: 36, width: "100%", borderRadius: 8, marginTop: 8 }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ background: "#ffffff", border: "1px solid #ece4d7", borderRadius: 12, overflow: "hidden" }}>
            <table className={pstyles.programsTable}>
              <thead>
                <tr>
                  <th>Program Title</th>
                  <th>Price</th>
                  <th>Modules</th>
                  <th>Batches</th>
                  <th>Enrolments</th>
                  <th>Certificate</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                <TableSkeleton columns={8} rows={5} />
              </tbody>
            </table>
          </div>
        )
      ) : filteredPrograms.length === 0 ? (
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #ece4d7",
            borderRadius: 14,
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(20, 17, 15, 0.03)",
          }}
        >
          <EmptyState
            icon={
              searchQuery ? (
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              ) : (
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
              )
            }
            title={
              searchQuery
                ? "No matching programs found"
                : statusFilter === "HIDDEN"
                ? "No draft programs"
                : statusFilter === "ACTIVE"
                ? "No published programs"
                : "No programs found"
            }
            description={
              searchQuery
                ? `No curriculum matches "${searchQuery}". Check your keywords or clear your search to see all programs.`
                : statusFilter === "HIDDEN"
                ? "All programs are currently published. New drafts or unpublished programs will appear here."
                : statusFilter === "ACTIVE"
                ? "No programs are published to the catalog yet. Publish an existing draft or create a new program."
                : "Get started by creating your first program curriculum with modules, lessons, and assessments."
            }
            actionLabel={
              searchQuery
                ? "Clear Search"
                : statusFilter === "HIDDEN"
                ? "Create Draft Program"
                : "Create Program"
            }
            onAction={
              searchQuery
                ? () => setSearchQuery("")
                : handleCreateProgram
            }
            secondaryActionLabel={searchQuery ? "Create Program" : undefined}
            onSecondaryAction={searchQuery ? handleCreateProgram : undefined}
          />
        </div>
      ) : viewMode === "grid" ? (
        /* GRID VIEW: Clean Executive Program Cards */
        <div className={pstyles.programsGrid}>
          {filteredPrograms.map((prog) => {
            const info = parseCourseInfo(prog.description);
            const imageUrl = getCourseImageUrl(info.image);
            const hasValidImage = imageUrl && !failedImages[prog.id];
            const stepsCount = prog._count?.steps ?? 0;
            const batchesCount = prog._count?.batches ?? 0;
            const enrolmentsCount = prog._count?.enrolments ?? 0;
            const hasCertificate = prog.hasCertificate !== false;
            const isDuplicatingThis = isDuplicatingId === prog.id;

            return (
              <div key={prog.id} className={pstyles.programCard}>
                {/* Media Banner */}
                <div className={pstyles.cardMediaHeader}>
                  {hasValidImage ? (
                    <Image
                      src={imageUrl}
                      alt={prog.title}
                      fill
                      sizes="(max-width: 768px) 100vw, 400px"
                      unoptimized={!imageUrl.startsWith("/")}
                      className={pstyles.cardMediaImage}
                      onError={() => setFailedImages((prev) => ({ ...prev, [prog.id]: true }))}
                    />
                  ) : (
                    <div className={pstyles.cardMediaFallback} aria-hidden="true">
                      <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                      </svg>
                    </div>
                  )}

                  <div className={pstyles.cardMediaOverlay} />

                  <div className={pstyles.cardHeaderBadges}>
                    <span className={pstyles.statusIndicator}>
                      <span className={prog.isActive ? pstyles.dotActive : pstyles.dotHidden} />
                      <span>{prog.isActive ? "Published" : "Draft"}</span>
                    </span>
                  </div>

                  <span className={pstyles.priceTag}>
                    {prog.price ? `$${prog.price.toLocaleString()}` : "Free"}
                  </span>
                </div>

                {/* Card Content Body */}
                <div className={pstyles.cardBody}>
                  <h3 className={pstyles.cardTitle}>
                    <Link href={`/programs/${prog.id}`} className={pstyles.cardTitleLink}>
                      {prog.title}
                    </Link>
                  </h3>

                  <p className={pstyles.cardSummary}>
                    {cleanCardSummary(prog.shortDescription || info.summary)}
                  </p>

                  {/* Clean Metadata Statistics Row */}
                  <div className={pstyles.cardMetaRow}>
                    <span className={pstyles.cardMetaStat}>
                      <strong>{stepsCount}</strong> {stepsCount === 1 ? "module" : "modules"}
                    </span>
                    <span className={pstyles.cardMetaDot}>•</span>
                    <span className={pstyles.cardMetaStat}>
                      <strong>{batchesCount}</strong> {batchesCount === 1 ? "batch" : "batches"}
                    </span>
                    <span className={pstyles.cardMetaDot}>•</span>
                    <span className={pstyles.cardMetaStat}>
                      <strong>{enrolmentsCount}</strong> {enrolmentsCount === 1 ? "learner" : "learners"}
                    </span>
                    {hasCertificate && (
                      <span className={pstyles.certBadge} title="Includes Certificate of Completion">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="8" r="6" />
                          <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
                        </svg>
                        Certificate
                      </span>
                    )}
                  </div>

                  {/* Card Bottom Actions: Focused Manage Program + Streamlined Menu */}
                  <div className={pstyles.cardActionsRow}>
                    <Link href={`/programs/${prog.id}`} className={pstyles.openHubBtn}>
                      <span>Manage Program</span>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                      </svg>
                    </Link>

                    <ActionMenu
                      ariaLabel={`Actions for ${prog.title}`}
                      items={[
                        {
                          label: isDuplicatingThis ? "Duplicating..." : "Duplicate Program",
                          onClick: () => {
                            if (!isDuplicatingThis) handleDuplicateProgram(prog);
                          },
                          icon: (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                          ),
                        },
                        {
                          label: "Delete Program",
                          danger: true,
                          dividerAbove: true,
                          onClick: () => handleDeleteProgram(prog),
                          icon: (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          ),
                        },
                      ]}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW: Dense, Scannable Ledger */
        <div style={{ background: "#ffffff", border: "1px solid #ece4d7", borderRadius: 12, overflow: "hidden" }}>
          <table className={pstyles.programsTable}>
            <thead>
              <tr>
                <th>Program Title</th>
                <th>Price</th>
                <th>Modules</th>
                <th>Batches</th>
                <th>Enrolments</th>
                <th>Certificate</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPrograms.map((prog) => {
                const info = parseCourseInfo(prog.description);
                const stepsCount = prog._count?.steps ?? 0;
                const batchesCount = prog._count?.batches ?? 0;
                const enrolmentsCount = prog._count?.enrolments ?? 0;
                const hasCertificate = prog.hasCertificate !== false;
                const isDuplicatingThis = isDuplicatingId === prog.id;

                return (
                  <tr key={prog.id} className={pstyles.programsTableRow}>
                    <td>
                      <div style={{ fontWeight: 700, color: "#14110f" }}>
                        <Link href={`/programs/${prog.id}`} className={pstyles.cardTitleLink}>
                          {prog.title}
                        </Link>
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "#78716a", marginTop: 2 }}>
                        {cleanCardSummary(prog.shortDescription || info.summary)}
                      </div>
                    </td>
                    <td>
                      <strong style={{ color: "#b45309" }}>
                        {prog.price ? `$${prog.price.toLocaleString()}` : "Free"}
                      </strong>
                    </td>
                    <td>
                      <strong>{stepsCount}</strong>
                    </td>
                    <td>{batchesCount}</td>
                    <td>{enrolmentsCount}</td>
                    <td>
                      {hasCertificate ? (
                        <span style={{ color: "#15803d", fontWeight: 600, fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          Enabled
                        </span>
                      ) : (
                        <span style={{ color: "#9ca3af", fontSize: "0.78rem" }}>None</span>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={prog.isActive ? "PUBLISHED" : "DRAFT"} />
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6 }}>
                        <Link
                          href={`/programs/${prog.id}`}
                          className={styles.primaryBtn}
                          style={{ padding: "0.32rem 0.65rem", fontSize: "0.75rem" }}
                        >
                          Manage
                        </Link>
                        <ActionMenu
                          ariaLabel={`Actions for ${prog.title}`}
                          items={[
                            {
                              label: isDuplicatingThis ? "Duplicating..." : "Duplicate Program",
                              onClick: () => {
                                if (!isDuplicatingThis) handleDuplicateProgram(prog);
                              },
                            },
                            {
                              label: "Delete Program",
                              danger: true,
                              dividerAbove: true,
                              onClick: () => handleDeleteProgram(prog),
                            },
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* CONFIRM DELETE DIALOG */}
      <ConfirmDialog
        isOpen={Boolean(programToDelete)}
        onClose={() => {
          if (!isDeletingProgram) setProgramToDelete(null);
        }}
        onConfirm={confirmDeleteProgram}
        title="Delete Program?"
        subtitle={programToDelete?.title}
        description="Are you sure you want to delete this program? All associated modules, lessons, and records will be deleted."
        tone="danger"
        confirmText={isDeletingProgram ? "Deleting..." : "Permanently Delete Program"}
        cancelText="Cancel"
        isLoading={isDeletingProgram}
        error={deleteError}
      />
    </div>
  );
}
