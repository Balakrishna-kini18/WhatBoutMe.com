"use client";

import { useEffect, useState, FormEvent, useRef } from "react";
import styles from "../page.module.css";
import pstyles from "./programs.module.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCourseInfo, parseCourseInfo } from "./courseInfo";
import { uploadFile } from "../lib/api";
import { CustomSelect, ActionMenu, ConfirmDialog, useToast } from "../components";

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
  price: number;
  isActive: boolean;
  status?: string;
  _count?: {
    steps: number;
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
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Modals & Menus
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);

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
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [duration, setDuration] = useState("");
  const [audience, setAudience] = useState("");
  const [inPerson, setInPerson] = useState("");
  const [online, setOnline] = useState("");
  const [image, setImage] = useState("");
  const [points, setPoints] = useState("");
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [searchShortcut, setSearchShortcut] = useState("Ctrl K");

  useEffect(() => {
    fetchPrograms();
    if (typeof window !== "undefined") {
      const isMac =
        /Mac|iPod|iPhone|iPad/.test(navigator.platform) ||
        /Macintosh|Mac OS X/.test(navigator.userAgent);
      if (isMac) {
        setSearchShortcut("⌘K");
      }
    }
  }, []);

  // Lock background scroll and listen for Escape key when modal is open
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

  // Keyboard shortcut listener for quick search (⌘K / Ctrl K or /)
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
      const res = await fetch(`${API_URL}/programs`);
      if (res.ok) {
        const data = await res.json();
        setPrograms(data);
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
    setDescription(info.summary);
    setIsActive(prog.isActive);
    setDuration(info.duration);
    setAudience(info.audience);
    setInPerson(info.inPerson);
    setOnline(info.online);
    setImage(info.image);
    setPoints(info.points.join("\n"));
    setFormError("");
    setIsModalOpen(true);
  };

  const openCreateModal = () => {
    setEditingProgramId(null);
    setTitle("");
    setType("Certification");
    setPrice("");
    setDescription("");
    setIsActive(true);
    setDuration("");
    setAudience("");
    setInPerson("");
    setOnline("");
    setImage("");
    setPoints("");
    setFormError("");
    setIsModalOpen(true);
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
      const res = await fetch(`${API_URL}/programs/${programToDelete.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const result = await res.json().catch(() => null);
        toastSuccess(
          result?.archived
            ? `Program "${programToDelete.title}" archived. Historical records preserved.`
            : `Program "${programToDelete.title}" removed successfully.`
        );
        setPrograms((prev) => prev.filter((p) => p.id !== programToDelete.id));
        setProgramToDelete(null);
        fetchPrograms();
      } else {
        const errorData = await res.json().catch(() => null);
        const errMsg = errorData?.error?.message ?? errorData?.message ?? res.statusText ?? "Failed to delete program";
        setDeleteError(errMsg);
        toastError(`Failed to delete program: ${errMsg}`);
      }
    } catch (e: any) {
      console.error("Failed to delete program", e);
      const errMsg = e?.message || "Could not reach server";
      setDeleteError(errMsg);
      toastError(`Failed to delete program: ${errMsg}`);
    } finally {
      setIsDeletingProgram(false);
    }
  };

  const handleSaveProgram = async (e: FormEvent) => {
    e.preventDefault();
    setFormError("");
    setIsSaving(true);

    const payload = {
      title: title.trim(),
      description: formatCourseInfo({
        summary: description,
        type,
        duration,
        audience,
        inPerson,
        online,
        image,
        points: points.split("\n"),
      }),
      price: parseFloat(price) || 0,
      ...(editingProgramId
        ? { isActive, status: isActive ? "PUBLISHED" : "DRAFT" }
        : { slug: slugify(title), isActive, status: isActive ? "PUBLISHED" : "DRAFT" }),
    };

    try {
      const res = await fetch(
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
        if (editingProgramId) {
          fetchPrograms();
        } else {
          // Immediately route to the new Curriculum Authoring Studio!
          router.push(`/programs/${savedProgram.id}`);
        }
      } else {
        const data = await res.json().catch(() => null);
        const raw = data?.error?.message ?? data?.message;
        const message = Array.isArray(raw) ? raw.join(", ") : raw;
        setFormError(message || `Could not save the program (error ${res.status}).`);
      }
    } catch (e) {
      console.error("Failed to save program", e);
      setFormError("Could not reach the server. Check that the API is running.");
    } finally {
      setIsSaving(false);
    }
  };

  // Filtered Programs Logic
  const filteredPrograms = programs.filter((p) => {
    const info = parseCourseInfo(p.description);
    const matchesSearch =
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory =
      categoryFilter === "ALL" || (info.type && info.type.toUpperCase() === categoryFilter.toUpperCase());

    const matchesStatus =
      statusFilter === "ALL" ||
      (statusFilter === "ACTIVE" && p.isActive) ||
      (statusFilter === "HIDDEN" && !p.isActive);

    return matchesSearch && matchesCategory && matchesStatus;
  });

  // Summary Metrics
  const totalPrograms = programs.length;
  const activeProgramsCount = programs.filter((p) => p.isActive).length;
  const totalStepsCount = programs.reduce((acc, p) => acc + (p._count?.steps || 0), 0);
  const avgPrice = totalPrograms > 0
    ? Math.round(programs.reduce((acc, p) => acc + (p.price || 0), 0) / totalPrograms)
    : 0;

  return (
    <div className={pstyles.container}>
      {/* 1. Header & Primary Studio Action */}
      <div className={pstyles.headerWrap}>
        <div className={pstyles.titleArea}>
          <h1>Programs &amp; Curriculum Studio</h1>
          <p>Design, organize, and publish high-performance learning tracks and certification paths</p>
        </div>

        <div className={pstyles.headerActions}>
          <button className={styles.primaryBtn} onClick={openCreateModal}>
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>New Course Track</span>
          </button>
        </div>
      </div>

      {/* 2. Quick Metrics Bar */}
      <div className={pstyles.metricsGrid}>
        <div className={pstyles.metricCard}>
          <div className={pstyles.metricIcon}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </div>
          <div className={pstyles.metricInfo}>
            <span className={pstyles.metricValue}>{totalPrograms}</span>
            <span className={pstyles.metricLabel}>Total Courses</span>
          </div>
        </div>

        <div className={pstyles.metricCard}>
          <div className={pstyles.metricIcon}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <div className={pstyles.metricInfo}>
            <span className={pstyles.metricValue}>{activeProgramsCount}</span>
            <span className={pstyles.metricLabel}>Active &amp; Published</span>
          </div>
        </div>

        <div className={pstyles.metricCard}>
          <div className={pstyles.metricIcon}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
          </div>
          <div className={pstyles.metricInfo}>
            <span className={pstyles.metricValue}>{totalStepsCount}</span>
            <span className={pstyles.metricLabel}>Total Modules</span>
          </div>
        </div>

        <div className={pstyles.metricCard}>
          <div className={pstyles.metricIcon}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <div className={pstyles.metricInfo}>
            <span className={pstyles.metricValue}>${avgPrice}</span>
            <span className={pstyles.metricLabel}>Avg Course Price</span>
          </div>
        </div>
      </div>

      {/* 3. Search & Control Bar */}
      <div className={pstyles.controlBar}>
        <div className={pstyles.searchWrap}>
          <span className={pstyles.searchIcon} aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            ref={searchInputRef}
            type="text"
            className={pstyles.searchInput}
            placeholder="Search by title, syllabus, or topic..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <span className={pstyles.shortcutBadge}>{searchShortcut}</span>
        </div>

        <div className={pstyles.filtersGroup}>
          <div className={pstyles.filterPills}>
            {["ALL", "CERTIFICATION", "CORPORATE", "SINGLE SESSION"].map((cat) => (
              <button
                key={cat}
                type="button"
                className={`${pstyles.filterPill} ${categoryFilter === cat ? pstyles.filterPillActive : ""}`}
                onClick={() => setCategoryFilter(cat)}
              >
                {cat === "ALL" ? "All Tracks" : cat.charAt(0) + cat.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          <div className={pstyles.filterPills}>
            <button
              type="button"
              className={`${pstyles.filterPill} ${statusFilter === "ALL" ? pstyles.filterPillActive : ""}`}
              onClick={() => setStatusFilter("ALL")}
            >
              All Status
            </button>
            <button
              type="button"
              className={`${pstyles.filterPill} ${statusFilter === "ACTIVE" ? pstyles.filterPillActive : ""}`}
              onClick={() => setStatusFilter("ACTIVE")}
            >
              Active
            </button>
            <button
              type="button"
              className={`${pstyles.filterPill} ${statusFilter === "HIDDEN" ? pstyles.filterPillActive : ""}`}
              onClick={() => setStatusFilter("HIDDEN")}
            >
              Hidden
            </button>
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
      </div>

      {/* 4. Content Area: Grid View or Dense Table View */}
      {isLoading ? (
        <div className={pstyles.cardsGrid}>
          {[1, 2, 3, 4, 5, 6].map((idx) => (
            <div key={idx} className="skeleton" style={{ height: 320, borderRadius: 12 }} />
          ))}
        </div>
      ) : filteredPrograms.length === 0 ? (
        <div className={pstyles.emptyState}>
          <div className={pstyles.emptyIcon}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </div>
          <h3 className={pstyles.emptyTitle}>No matching programs found</h3>
          <p className={pstyles.emptyDesc}>
            {searchQuery
              ? `No curriculum matches "${searchQuery}". Try adjusting your search query or filters.`
              : "Start by authoring your first luxury learning curriculum track."}
          </p>
          <button className={styles.primaryBtn} onClick={openCreateModal}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Create New Course</span>
          </button>
        </div>
      ) : viewMode === "grid" ? (
        <div className={pstyles.cardsGrid}>
          {filteredPrograms.map((prog) => {
            const info = parseCourseInfo(prog.description);
            return (
              <div key={prog.id} className={pstyles.programCard}>
                {/* Visual Banner Header */}
                <div className={pstyles.cardMediaHeader}>
                  {info.image && !failedImages[prog.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={getCourseImageUrl(info.image)}
                      alt={prog.title}
                      className={pstyles.cardMediaImage}
                      onError={() =>
                        setFailedImages((prev) => ({ ...prev, [prog.id]: true }))
                      }
                    />
                  ) : (
                    <div className={pstyles.cardMediaFallback} aria-hidden="true">
                      <svg
                        width="38"
                        height="38"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.25"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={pstyles.fallbackIcon}
                      >
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                      </svg>
                    </div>
                  )}
                  <div className={pstyles.cardMediaOverlay} />

                  <div className={pstyles.cardHeaderBadges}>
                    <span className={pstyles.typeBadge}>{info.type || "Certification"}</span>
                    <span className={pstyles.statusIndicator}>
                      <span className={prog.isActive ? pstyles.dotActive : pstyles.dotHidden} />
                      <span>{prog.isActive ? "Published" : "Draft"}</span>
                    </span>
                  </div>

                  <span className={pstyles.priceTag}>
                    {prog.price ? `$${prog.price}` : "Complimentary"}
                  </span>
                </div>

                {/* Card Body */}
                <div className={pstyles.cardBody}>
                  <h3 className={pstyles.cardTitle}>{prog.title}</h3>
                  <p className={pstyles.cardDescription}>
                    {info.summary || "No course summary provided yet."}
                  </p>

                  {/* Metadata Chips */}
                  <div className={pstyles.cardMetaGrid}>
                    <div className={pstyles.metaItem}>
                      <span className={pstyles.metaValue}>{prog._count?.steps ?? 0}</span>
                      <span className={pstyles.metaLabel}>Modules</span>
                    </div>
                    <div className={pstyles.metaItem}>
                      <span className={pstyles.metaValue}>{info.duration || "Self-Paced"}</span>
                      <span className={pstyles.metaLabel}>Duration</span>
                    </div>
                    <div className={pstyles.metaItem}>
                      <span className={pstyles.metaValue}>{info.audience || "All"}</span>
                      <span className={pstyles.metaLabel}>Audience</span>
                    </div>
                  </div>

                  {/* Direct Actions */}
                  <div className={pstyles.cardActions}>
                    <Link href={`/programs/${prog.id}`} className={pstyles.builderBtn}>
                      <span>Open Curriculum Studio</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                      </svg>
                    </Link>

                    <ActionMenu
                      ariaLabel={`More actions for ${prog.title}`}
                      items={[
                        {
                          label: "Open Studio",
                          href: `/programs/${prog.id}`,
                          icon: (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                            </svg>
                          ),
                        },
                        {
                          label: "Edit Settings",
                          onClick: () => openEditModal(prog),
                          icon: (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <circle cx="12" cy="12" r="3" />
                              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                            </svg>
                          ),
                        },
                        {
                          label: "Preview on LMS",
                          href: `http://localhost:3000/programs/${prog.id}/steps`,
                          icon: (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                              <polyline points="15 3 21 3 21 9" />
                              <line x1="10" y1="14" x2="21" y2="3" />
                            </svg>
                          ),
                        },
                        {
                          label: "Delete Track",
                          danger: true,
                          dividerAbove: true,
                          onClick: () => handleDeleteProgram(prog),
                          icon: (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
        /* Dense Table View */
        <div style={{ background: "#ffffff", border: "1px solid var(--border-light)", borderRadius: 12, overflow: "hidden" }}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Course Title</th>
                <th>Type</th>
                <th>Price</th>
                <th>Modules</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPrograms.map((prog) => {
                const info = parseCourseInfo(prog.description);
                const imageUrl = getCourseImageUrl(info.image);
                const hasValidImage = imageUrl && !failedImages[prog.id];
                return (
                  <tr key={prog.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div
                          style={{
                            width: "38px",
                            height: "38px",
                            borderRadius: "8px",
                            overflow: "hidden",
                            background: "linear-gradient(135deg, #f5ece1 0%, #ebe0d0 100%)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            border: "1px solid rgba(223, 208, 187, 0.6)",
                          }}
                        >
                          {hasValidImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={imageUrl}
                              alt={prog.title}
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              onError={() =>
                                setFailedImages((prev) => ({ ...prev, [prog.id]: true }))
                              }
                            />
                          ) : (
                            <svg
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              style={{ color: "var(--accent-primary, #c97a1e)", opacity: 0.6 }}
                            >
                              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                            </svg>
                          )}
                        </div>
                        <Link
                          href={`/programs/${prog.id}`}
                          style={{ fontWeight: 600, color: "var(--text-primary)", textDecoration: "none" }}
                        >
                          {prog.title}
                        </Link>
                      </div>
                    </td>
                    <td>{info.type || "Course"}</td>
                    <td>${prog.price}</td>
                    <td>{prog._count?.steps ?? 0} Steps</td>
                    <td>
                      <span className={`${styles.statusChip} ${prog.isActive ? styles.active : styles.locked}`}>
                        {prog.isActive ? "Published" : "Draft"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: "8px", alignItems: "center" }}>
                        <Link href={`/programs/${prog.id}`} className={pstyles.builderBtn} style={{ padding: "0.35rem 0.75rem", fontSize: "0.78rem" }}>
                          Studio &rarr;
                        </Link>
                        <ActionMenu
                          ariaLabel={`Actions for ${prog.title}`}
                          items={[
                            {
                              label: "Open Studio",
                              href: `/programs/${prog.id}`,
                              icon: (
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M12 20h9" />
                                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                </svg>
                              ),
                            },
                            {
                              label: "Edit Settings",
                              onClick: () => openEditModal(prog),
                              icon: (
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <circle cx="12" cy="12" r="3" />
                                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                                </svg>
                              ),
                            },
                            {
                              label: "Preview on LMS",
                              href: `http://localhost:3000/programs/${prog.id}/steps`,
                              icon: (
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                  <polyline points="15 3 21 3 21 9" />
                                  <line x1="10" y1="14" x2="21" y2="3" />
                                </svg>
                              ),
                            },
                            {
                              label: "Delete Track",
                              danger: true,
                              dividerAbove: true,
                              onClick: () => handleDeleteProgram(prog),
                              icon: (
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                              ),
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

      {/* CREATE & EDIT PROGRAM MODAL */}
      {isModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsModalOpen(false)}>
          <div
            className={styles.modalContent}
            style={{ maxWidth: "740px" }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="program-modal-title"
          >
            <div className={styles.modalHeader}>
              <div>
                <h2 id="program-modal-title">
                  {editingProgramId ? "Edit Course Settings" : "Create New Program Track"}
                </h2>
                <p className={styles.modalIntro}>
                  Step 1 captures catalog metadata. The Curriculum Studio allows authoring videos, PDFs, and quizzes inline.
                </p>
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
              onSubmit={handleSaveProgram}
              style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0, overflow: "hidden" }}
            >
              <div className={styles.modalBody}>
                <div className={styles.formGroup}>
                  <label>
                    Program Title <span style={{ color: "var(--status-error)" }}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 11 Steps to U Certification"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label>
                      Curriculum Type <span style={{ color: "var(--status-error)" }}>*</span>
                    </label>
                    <CustomSelect
                      value={type}
                      onChange={(val) => setType(val)}
                      options={[
                        { value: "Certification", label: "Certification" },
                        { value: "Corporate", label: "Corporate" },
                        { value: "Single Session", label: "Single Session" },
                      ]}
                      fullWidth
                      ariaLabel="Curriculum Type"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Tuition / Price (USD)</label>
                    <input
                      type="number"
                      placeholder="1999"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                    />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label>Course Overview &amp; Summary</label>
                  <textarea
                    rows={3}
                    placeholder="A transformative leadership journey designed for executives..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label>Estimated Duration</label>
                    <input
                      type="text"
                      placeholder="e.g. 12 Masterclasses"
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Target Audience</label>
                    <input
                      type="text"
                      placeholder="e.g. Leaders, Teams"
                      value={audience}
                      onChange={(e) => setAudience(e.target.value)}
                    />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label>Course Cover Image</label>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <input
                      type="text"
                      placeholder="https://... or upload an asset"
                      value={image}
                      onChange={(e) => setImage(e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <label
                      className={styles.secondaryBtn}
                      style={{ cursor: "pointer", margin: 0, padding: "0.55rem 1rem", fontSize: "0.85rem" }}
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
                        background: "var(--bg-soft)",
                        borderRadius: "8px",
                        border: "1px solid var(--border-light)",
                      }}
                    >
                      <img
                        src={getCourseImageUrl(image)}
                        alt="Preview"
                        style={{ width: "48px", height: "36px", objectFit: "cover", borderRadius: "4px" }}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                      <span
                        style={{
                          fontSize: "0.78rem",
                          color: "var(--text-secondary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Preview: {image}
                      </span>
                    </div>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label>Core Learning Objectives (one per line)</label>
                  <textarea
                    rows={3}
                    placeholder="Master strategic emotional regulation&#10;Lead with ethical resilience&#10;Build self-sustaining team trust"
                    value={points}
                    onChange={(e) => setPoints(e.target.value)}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      style={{ accentColor: "var(--accent-primary)" }}
                    />
                    <span style={{ fontWeight: 600, fontSize: "0.88rem" }}>
                      Publish to Learner Catalog immediately
                    </span>
                  </label>
                </div>

                {formError && <p className={styles.formError}>{formError}</p>}
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.primaryBtn} disabled={isSaving}>
                  {isSaving ? "Saving..." : editingProgramId ? "Update Settings" : "Create & Author Curriculum →"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Branded ConfirmDialog for Program Deletion / Archival */}
      <ConfirmDialog
        isOpen={Boolean(programToDelete)}
        onClose={() => {
          if (!isDeletingProgram) setProgramToDelete(null);
        }}
        onConfirm={confirmDeleteProgram}
        title="Remove Program Track?"
        subtitle={programToDelete?.title}
        description="Are you sure you want to remove this program? If active cohorts or enrolments exist, the program will be safely archived from the public catalog to preserve learner progress, certificates, and financial audit history. If no batches or enrolments exist, it will be permanently deleted along with associated media."
        tone="danger"
        confirmText={isDeletingProgram ? "Removing..." : "Remove Program"}
        cancelText="Cancel"
        isLoading={isDeletingProgram}
        error={deleteError}
        itemDetails={
          programToDelete
            ? [
                { label: "Course Title", value: programToDelete.title },
                { label: "Status", value: programToDelete.isActive ? "Published" : "Draft" },
                { label: "Modules", value: programToDelete._count?.steps ?? 0 },
                { label: "Price", value: programToDelete.price ? `$${programToDelete.price}` : "Free" },
              ]
            : []
        }
        callout={{
          tone: "info",
          text: "Student history safety: Archiving removes the course from the public catalog while keeping completed certificates and learner records fully intact.",
        }}
      />
    </div>
  );
}
