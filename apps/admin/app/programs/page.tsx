"use client";

import { useEffect, useState, FormEvent, useRef, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "../page.module.css";
import pstyles from "./programs.module.css";
import { formatCourseInfo, parseCourseInfo } from "./courseInfo";
import { uploadFile, cachedFetch } from "../lib/api";
import {
  CustomSelect,
  ActionMenu,
  ConfirmDialog,
  useToast,
  HelpTooltip,
  EmptyState,
  MediaPreviewModal,
  type MediaPreviewConfig,
} from "../components";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" && window.location.hostname.endsWith(".vercel.app")
    ? "https://what-bout-me-com.vercel.app"
    : "http://localhost:4000");

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

const slugify = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");

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

  // In-page Quick Overview Modal State
  const [quickViewProgram, setQuickViewProgram] = useState<Program | null>(null);

  // Media Preview Modal (for Certificate or Video previews)
  const [previewConfig, setPreviewConfig] = useState<MediaPreviewConfig | null>(null);

  // Modals & Menus
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);
  const [isCreatingDraft, setIsCreatingDraft] = useState(false);

  // Deletion modal state
  const [programToDelete, setProgramToDelete] = useState<Program | null>(null);
  const [isDeletingProgram, setIsDeletingProgram] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const getAuthHeaders = (): Record<string, string> => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  // Form states
  const [title, setTitle] = useState("");
  const [type, setType] = useState("Certification");
  const [price, setPrice] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [duration, setDuration] = useState("");
  const [audience, setAudience] = useState("");
  const [inPerson, setInPerson] = useState("");
  const [online, setOnline] = useState("");
  const [image, setImage] = useState("");
  const [points, setPoints] = useState("");
  const [hasCert, setHasCert] = useState(true);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [searchShortcut, setSearchShortcut] = useState("Ctrl K");

  useEffect(() => {
    fetchPrograms();

    const handleFocus = () => {
      fetchPrograms();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        fetchPrograms();
      }
    });

    if (typeof window !== "undefined") {
      const isMac =
        /Mac|iPod|iPhone|iPad/.test(navigator.platform) ||
        /Macintosh|Mac OS X/.test(navigator.userAgent);
      if (isMac) {
        setSearchShortcut("⌘K");
      }
    }

    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  // Keyboard shortcut listener for quick search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === "/" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const fetchPrograms = async () => {
    try {
      const res = await cachedFetch(`${API_URL}/programs`, {
        skipCache: true,
        headers: {
          ...getAuthHeaders(),
          "Cache-Control": "no-cache",
          "Pragma": "no-cache",
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

  const openEditModal = (prog: Program) => {
    const info = parseCourseInfo(prog.description);
    setEditingProgramId(prog.id);
    setTitle(prog.title);
    setType(info.type || "Certification");
    setPrice(prog.price ? prog.price.toString() : "");
    setShortDescription(prog.shortDescription || info.summary || "");
    setDescription(info.summary);
    setIsActive(prog.isActive);
    setDuration(info.duration);
    setAudience(info.audience);
    setInPerson(info.inPerson);
    setOnline(info.online);
    setImage(info.image);
    setPoints(info.points.join("\n"));
    setHasCert(prog.hasCertificate !== false);
    setFormError("");
    setIsModalOpen(true);
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
        toastSuccess("Draft program created. Opening details...");
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

  const openCreateModal = handleCreateProgram;

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
        if (quickViewProgram?.id === programToDelete.id) {
          setQuickViewProgram(null);
        }
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
        toastSuccess(`Course "${prog.title}" duplicated as "${cloned.title}".`);
        fetchPrograms();
      } else {
        const err = await res.json().catch(() => null);
        toastError(err?.message || "Failed to duplicate course.");
      }
    } catch (e: any) {
      toastError(e.message || "Failed to duplicate course.");
    }
  };

  const handleSaveProgram = async (e: FormEvent) => {
    e.preventDefault();
    setFormError("");
    setIsSaving(true);

    const payload = {
      title: title.trim(),
      description: formatCourseInfo({
        summary: description.trim() || shortDescription.trim(),
        short: shortDescription.trim(),
        type: type || "Certification",
        duration,
        audience,
        inPerson,
        online,
        image,
        points: points.split("\n").filter((p) => p.trim().length > 0),
      }),
      shortDescription: shortDescription.trim(),
      price: parseFloat(price) || 0,
      hasCertificate: hasCert,
      ...(editingProgramId
        ? { isActive, status: isActive ? "PUBLISHED" : "DRAFT" }
        : { slug: slugify(title), isActive: false, status: "DRAFT" }),
    };

    try {
      const res = await cachedFetch(
        editingProgramId ? `${API_URL}/programs/${editingProgramId}` : `${API_URL}/programs`,
        {
          method: editingProgramId ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(),
          },
          body: JSON.stringify(payload),
        },
      );

      if (res.ok) {
        const savedProgram = await res.json();
        setIsModalOpen(false);
        setEditingProgramId(null);
        toastSuccess(editingProgramId ? "Program settings updated." : "Draft program created.");
        if (editingProgramId) {
          fetchPrograms();
        } else {
          router.push(`/programs/${savedProgram.id}`);
        }
      } else {
        const data = await res.json().catch(() => null);
        const raw = data?.error?.message ?? data?.message;
        setFormError(Array.isArray(raw) ? raw.join(", ") : raw || "Could not save the program.");
      }
    } catch (e) {
      setFormError("Could not reach the server. Check that the API is running.");
    } finally {
      setIsSaving(false);
    }
  };

  // Status counts for the tabs
  const statusCounts = useMemo(() => {
    const counts = { ALL: programs.length, ACTIVE: 0, HIDDEN: 0 };
    for (const p of programs) {
      const isDraft = !p.isActive || p.status === "DRAFT";
      if (isDraft) counts.HIDDEN++;
      else counts.ACTIVE++;
    }
    return counts;
  }, [programs]);

  // Filtered Programs Logic
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
    <div className={styles.dashboardContainer} style={{ gap: "1rem" }}>
      {/* 1. Standard Header */}
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

      {/* 2. Status Tab Navigation (Matches Batches & Users) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
        <div className={styles.tabsContainer} role="tablist" aria-label="Program directory views">
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

      {/* 3. Search & View Mode Toggle Bar */}
      <div className={pstyles.controlBar}>
        <div className={pstyles.searchWrap}>
          <span className={pstyles.searchIcon} aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            ref={searchInputRef}
            type="text"
            className={pstyles.searchInput}
            placeholder="Search programs by title or topic..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <span className={pstyles.shortcutBadge}>{searchShortcut}</span>
        </div>

        <div className={pstyles.filtersGroup}>

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
      </div>

      {/* 4. Programs Content: Clean Cards Grid or Table View */}
      {isLoading ? (
        <div className={pstyles.programsGrid}>
          {[1, 2, 3, 4, 5, 6].map((idx) => (
            <div key={idx} className="skeleton" style={{ height: 340, borderRadius: 14 }} />
          ))}
        </div>
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
                : openCreateModal
            }
            secondaryActionLabel={searchQuery ? "Create Program" : undefined}
            onSecondaryAction={searchQuery ? openCreateModal : undefined}
          />
        </div>
      ) : viewMode === "grid" ? (
        /* GRID VIEW: Self-Contained Executive Program Cards */
        <div className={pstyles.programsGrid}>
          {filteredPrograms.map((prog) => {
            const info = parseCourseInfo(prog.description);
            const imageUrl = getCourseImageUrl(info.image);
            const hasValidImage = imageUrl && !failedImages[prog.id];
            const stepsCount = prog._count?.steps ?? 0;
            const batchesCount = prog._count?.batches ?? 0;
            const enrolmentsCount = prog._count?.enrolments ?? 0;
            const resourcesCount = prog._count?.resourceItems ?? 0;
            const hasCertificate = prog.hasCertificate !== false;

            return (
              <div key={prog.id} className={pstyles.programCard}>
                {/* 16:9 Banner Media */}
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
                      <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.65 }}>
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
                    {info.summary || "Complete program with modules, video lectures, and assessments."}
                  </p>

                  {/* Program Asset Pill Counters */}
                  <div className={pstyles.cardAssetPills}>
                    <span className={`${pstyles.assetPill} ${pstyles.assetPillPrimary}`}>
                      <strong>{stepsCount}</strong> {stepsCount === 1 ? "Module" : "Modules"}
                    </span>
                    <span className={pstyles.assetPill}>
                      <strong>{batchesCount}</strong> {batchesCount === 1 ? "Batch" : "Batches"}
                    </span>
                    <span className={pstyles.assetPill}>
                      <strong>{enrolmentsCount}</strong> {enrolmentsCount === 1 ? "Learner" : "Learners"}
                    </span>
                    {resourcesCount > 0 && (
                      <span className={pstyles.assetPill}>
                        <strong>{resourcesCount}</strong> Files
                      </span>
                    )}
                    {hasCertificate ? (
                      <span className={`${pstyles.assetPill} ${pstyles.assetPillSuccess}`} title="Certificate of Completion issued upon passing">
                        Certificate
                      </span>
                    ) : (
                      <span className={pstyles.assetPill} style={{ color: "#9ca3af" }}>
                        No Certificate
                      </span>
                    )}
                  </div>

                  {/* Card Bottom Actions */}
                  <div className={pstyles.cardActionsRow}>
                    <Link href={`/programs/${prog.id}`} className={pstyles.openHubBtn}>
                      <span>Manage Program</span>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                      </svg>
                    </Link>

                    <button
                      type="button"
                      className={pstyles.quickViewBtn}
                      onClick={() => setQuickViewProgram(prog)}
                      title="Quick summary view"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                      <span>Quick View</span>
                    </button>

                    <ActionMenu
                      ariaLabel={`Actions for ${prog.title}`}
                      items={[
                        {
                          label: "Manage Program",
                          href: `/programs/${prog.id}`,
                          icon: (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                              <polygon points="12 2 2 7 12 12 22 7 12 2" />
                              <polyline points="2 17 12 22 22 17" />
                              <polyline points="2 12 12 17 22 12" />
                            </svg>
                          ),
                        },
                        {
                          label: "Quick Overview",
                          onClick: () => setQuickViewProgram(prog),
                          icon: (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10" />
                              <line x1="12" y1="16" x2="12" y2="12" />
                              <line x1="12" y1="8" x2="12.01" y2="8" />
                            </svg>
                          ),
                        },
                        {
                          label: "Edit Setup",
                          onClick: () => openEditModal(prog),
                          icon: (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="3" />
                              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                            </svg>
                          ),
                        },
                        {
                          label: "Preview on LMS",
                          href: `http://localhost:3000/programs/${prog.id}/steps`,
                          icon: (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                              <polyline points="15 3 21 3 21 9" />
                              <line x1="10" y1="14" x2="21" y2="3" />
                            </svg>
                          ),
                        },
                        {
                          label: "Duplicate Program",
                          onClick: () => handleDuplicateProgram(prog),
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
        <div style={{ background: "#ffffff", border: "1px solid #ece4d7", borderRadius: 14, overflow: "hidden" }}>
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

                return (
                  <tr key={prog.id} className={pstyles.programsTableRow}>
                    <td>
                      <div style={{ fontWeight: 700, color: "#14110f" }}>
                        <Link href={`/programs/${prog.id}`} className={pstyles.cardTitleLink}>
                          {prog.title}
                        </Link>
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "#78716a", marginTop: 2 }}>
                        {info.summary || "Program"}
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
                        <span style={{ color: "#15803d", fontWeight: 600, fontSize: "0.78rem" }}>Yes</span>
                      ) : (
                        <span style={{ color: "#9ca3af", fontSize: "0.78rem" }}>None</span>
                      )}
                    </td>
                    <td>
                      <span className={prog.isActive ? pstyles.statusPillPublished : pstyles.statusPillDraft}>
                        <span className={prog.isActive ? pstyles.dotActive : pstyles.dotHidden} />
                        {prog.isActive ? "Published" : "Draft"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6 }}>
                        <Link
                          href={`/programs/${prog.id}`}
                          className={styles.primaryBtn}
                          style={{ padding: "0.3rem 0.65rem", fontSize: "0.75rem" }}
                        >
                          Manage
                        </Link>
                        <ActionMenu
                          ariaLabel={`Actions for ${prog.title}`}
                          items={[
                            { label: "Manage Program", href: `/programs/${prog.id}` },
                            { label: "Quick View", onClick: () => setQuickViewProgram(prog) },
                            { label: "Edit Setup", onClick: () => openEditModal(prog) },
                            { label: "Duplicate Program", onClick: () => handleDuplicateProgram(prog) },
                            { label: "Delete Program", danger: true, onClick: () => handleDeleteProgram(prog) },
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

      {/* QUICK OVERVIEW MODAL (Everything inside the program at a glance) */}
      {quickViewProgram && (
        <div className={pstyles.quickOverviewOverlay} onClick={() => setQuickViewProgram(null)}>
          <div className={pstyles.quickOverviewModal} onClick={(e) => e.stopPropagation()}>
            <div className={pstyles.quickOverviewHeader}>
              <div>
                <span
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    color: "#b45309",
                    letterSpacing: "0.06em",
                  }}
                >
                  PROGRAM 360° SNAPSHOT
                </span>
                <h2 style={{ fontSize: "1.35rem", fontWeight: 700, color: "#14110f", margin: "0.25rem 0 0" }}>
                  {quickViewProgram.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setQuickViewProgram(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#78716a",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className={pstyles.quickOverviewBody}>
              {/* Top Metrics Row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.75rem" }}>
                <div style={{ background: "#faf8f5", border: "1px solid #ebd9c4", borderRadius: 10, padding: "0.85rem" }}>
                  <span style={{ fontSize: "0.72rem", color: "#78716a", fontWeight: 600, textTransform: "uppercase" }}>Modules</span>
                  <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "#14110f" }}>
                    {quickViewProgram._count?.steps ?? 0}
                  </div>
                </div>

                <div style={{ background: "#faf8f5", border: "1px solid #ebd9c4", borderRadius: 10, padding: "0.85rem" }}>
                  <span style={{ fontSize: "0.72rem", color: "#78716a", fontWeight: 600, textTransform: "uppercase" }}>Batches</span>
                  <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "#14110f" }}>
                    {quickViewProgram._count?.batches ?? 0}
                  </div>
                </div>

                <div style={{ background: "#faf8f5", border: "1px solid #ebd9c4", borderRadius: 10, padding: "0.85rem" }}>
                  <span style={{ fontSize: "0.72rem", color: "#78716a", fontWeight: 600, textTransform: "uppercase" }}>Learners</span>
                  <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "#14110f" }}>
                    {quickViewProgram._count?.enrolments ?? 0}
                  </div>
                </div>

                <div style={{ background: "#faf8f5", border: "1px solid #ebd9c4", borderRadius: 10, padding: "0.85rem" }}>
                  <span style={{ fontSize: "0.72rem", color: "#78716a", fontWeight: 600, textTransform: "uppercase" }}>Price</span>
                  <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "#b45309" }}>
                    {quickViewProgram.price ? `$${quickViewProgram.price.toLocaleString()}` : "Free"}
                  </div>
                </div>
              </div>

              {/* Program Overview & Capabilities */}
              <div style={{ background: "#ffffff", border: "1px solid #ece4d7", borderRadius: 12, padding: "1.15rem" }}>
                <h4 style={{ fontSize: "0.9rem", fontWeight: 700, color: "#14110f", margin: "0 0 0.5rem" }}>
                  Curriculum &amp; Completion Policy
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.82rem", color: "#44403c" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span>Sequential Step Lock</span>
                    <strong style={{ color: "#15803d" }}>
                      {quickViewProgram.sequentialProgressionEnabled !== false ? "Enabled (Steps unlock in sequence)" : "Disabled"}
                    </strong>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span>Final Comprehensive Exam</span>
                    <strong>{quickViewProgram.requireExam !== false ? "Required" : "Optional"}</strong>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span>Certificate of Completion</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <strong style={{ color: quickViewProgram.hasCertificate !== false ? "#15803d" : "#78716a" }}>
                        {quickViewProgram.hasCertificate !== false ? "Active" : "Disabled"}
                      </strong>
                      {quickViewProgram.hasCertificate !== false && (
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewConfig({
                              isOpen: true,
                              type: "CERTIFICATE",
                              title: quickViewProgram.title,
                              certificateData: {
                                programTitle: quickViewProgram.title,
                                studentName: "Sample Student",
                                completionDate: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
                                certificateNumber: `WBM-${quickViewProgram.slug.substring(0, 4).toUpperCase()}-001`,
                              },
                            })
                          }
                          style={{
                            background: "#fffbeb",
                            border: "1px solid #fde68a",
                            color: "#b45309",
                            padding: "2px 8px",
                            borderRadius: 6,
                            fontSize: "0.74rem",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          Preview Certificate
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className={pstyles.quickOverviewFooter}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setQuickViewProgram(null)}
              >
                Close
              </button>

              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => router.push(`/programs/${quickViewProgram.id}`)}
              >
                <span>Launch Full Curriculum Studio →</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE & EDIT PROGRAM MODAL */}
      {isModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsModalOpen(false)}>
          <div
            className={styles.modalContent}
            style={{ maxWidth: editingProgramId ? "720px" : "460px", borderRadius: "14px" }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div
              className={styles.modalHeader}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.85rem 1.25rem",
                borderBottom: "1px solid var(--border-light, #e7decb)",
                background: "#ffffff",
                gap: "1rem",
              }}
            >
              <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, color: "var(--text-primary, #14110f)", lineHeight: 1.2 }}>
                {editingProgramId ? "Edit Program Setup" : "Create New Program"}
              </h2>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setIsModalOpen(false)}
                aria-label="Close dialog"
                style={{
                  width: "28px",
                  height: "28px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "8px",
                  background: "#f5ede4",
                  color: "#57534e",
                  border: "none",
                  fontSize: "1.2rem",
                  lineHeight: 1,
                  cursor: "pointer",
                  margin: 0,
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSaveProgram} style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", overflow: "hidden" }}>
              <div
                className={styles.modalBody}
                style={{
                  padding: editingProgramId ? "1.25rem 1.25rem" : "1rem 1.25rem 1.25rem 1.25rem",
                  gap: "0.85rem",
                }}
              >
                <div className={styles.formGroup}>
                  <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary, #78716a)", marginBottom: "4px" }}>
                    Program Title <span style={{ color: "var(--status-error, #dc2626)" }}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 11 Steps to U Certification"
                    required
                    autoFocus
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    style={{
                      padding: "0.65rem 0.85rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border-light, #e7decb)",
                      fontSize: "0.9rem",
                    }}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary, #78716a)", marginBottom: "4px" }}>
                    Price (USD)
                  </label>
                  <input
                    type="number"
                    placeholder="1999"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary, #78716a)", marginBottom: "4px" }}>
                    Short Description
                  </label>
                  <input
                    type="text"
                    placeholder="Brief 1-2 sentence overview for catalog cards..."
                    value={shortDescription}
                    onChange={(e) => setShortDescription(e.target.value)}
                    style={{
                      padding: "0.65rem 0.85rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border-light, #e7decb)",
                      fontSize: "0.9rem",
                    }}
                  />
                </div>


                {/* Course Cover Image with Instant Preview */}
                <div className={styles.formGroup}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <label style={{ margin: 0 }}>Cover Image</label>
                    <HelpTooltip text="16:9 ratio recommended. Upload from your device or paste a URL." />
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <input
                      type="text"
                      placeholder="https://... or click browse to upload"
                      value={image}
                      onChange={(e) => setImage(e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <label
                      className={styles.secondaryBtn}
                      style={{ cursor: "pointer", margin: 0, padding: "0.5rem 0.95rem", fontSize: "0.82rem" }}
                    >
                      {isUploading ? "Uploading..." : "Browse"}
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setIsUploading(true);
                          try {
                            const url = await uploadFile(file);
                            setImage(url);
                          } catch (err: any) {
                            toastError(err.message || "Failed to upload image");
                          } finally {
                            setIsUploading(false);
                          }
                        }}
                      />
                    </label>
                  </div>

                  {image && (
                    <div
                      style={{
                        marginTop: "8px",
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        padding: "8px 12px",
                        background: "#faf8f5",
                        borderRadius: "8px",
                        border: "1px solid #ebd9c4",
                      }}
                    >
                      <img
                        src={getCourseImageUrl(image)}
                        alt="Preview"
                        style={{ width: "64px", height: "36px", objectFit: "cover", borderRadius: "4px" }}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                      <span style={{ fontSize: "0.78rem", color: "#78716a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        Preview: {image}
                      </span>
                    </div>
                  )}
                </div>

                {/* Certificate & Publish Toggles */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.5rem" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={hasCert}
                      onChange={(e) => setHasCert(e.target.checked)}
                      style={{ accentColor: "var(--accent-primary)" }}
                    />
                    <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                      Issue Certificate of Completion upon course completion
                    </span>
                  </label>

                  {editingProgramId && (
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={isActive}
                        onChange={(e) => setIsActive(e.target.checked)}
                        style={{ accentColor: "var(--accent-primary)" }}
                      />
                      <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                        Publish immediately to public catalog
                      </span>
                    </label>
                  )}
                </div>

                {formError && <p className={styles.formError}>{formError}</p>}
              </div>

              <div
                className={styles.modalFooter}
                style={{
                  padding: "0.75rem 1.25rem",
                  display: "flex",
                  justifyContent: "flex-end",
                  alignItems: "center",
                  gap: "0.75rem",
                  borderTop: "1px solid var(--border-light, #e7decb)",
                  background: "#fdfbf7",
                }}
              >
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setIsModalOpen(false)}
                  style={{ padding: "0.45rem 0.95rem", fontSize: "0.85rem" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={isSaving || !title.trim()}
                  style={{ padding: "0.45rem 1.15rem", fontSize: "0.85rem" }}
                >
                  {isSaving ? "Saving..." : editingProgramId ? "Update Program" : "Create Program"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REUSABLE MEDIA PREVIEW MODAL */}
      <MediaPreviewModal
        config={previewConfig}
        onClose={() => setPreviewConfig(null)}
      />

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
