"use client";

import { useEffect, useState, FormEvent, useRef } from "react";
import styles from "../page.module.css";
import pstyles from "./programs.module.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCourseInfo, parseCourseInfo } from "./courseInfo";
import { uploadFile } from "../lib/api";

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

export default function ProgramsPage() {
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [programs, setPrograms] = useState<Program[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Search & Filtering
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Modals & Menus
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

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

  useEffect(() => {
    fetchPrograms();
  }, []);

  // Keyboard shortcut listener for quick search (⌘K or /)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
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
      console.error("Failed to fetch programs", e);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleDropdown = (id: string) => {
    setActiveDropdown(activeDropdown === id ? null : id);
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
    setActiveDropdown(null);
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
    setActiveDropdown(null);
  };

  const handleDeleteProgram = async (id: string) => {
    if (!confirm("Are you sure you want to delete this program? This will remove all associated modules, lessons, and student progress.")) return;
    try {
      const res = await fetch(`${API_URL}/programs/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchPrograms();
      } else {
        const errorData = await res.json().catch(() => null);
        alert(`Failed to delete program: ${errorData?.message || res.statusText}`);
      }
    } catch (e) {
      console.error("Failed to delete program", e);
    }
    setActiveDropdown(null);
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
          headers: { "Content-Type": "application/json" },
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
          <button className={pstyles.primaryCreateBtn} onClick={openCreateModal}>
            <span>+</span>
            <span>New Course Track</span>
          </button>
        </div>
      </div>

      {/* 2. Quick Metrics Bar */}
      <div className={pstyles.metricsGrid}>
        <div className={pstyles.metricCard}>
          <div className={pstyles.metricIcon}>🎓</div>
          <div className={pstyles.metricInfo}>
            <span className={pstyles.metricValue}>{totalPrograms}</span>
            <span className={pstyles.metricLabel}>Total Courses</span>
          </div>
        </div>

        <div className={pstyles.metricCard}>
          <div className={pstyles.metricIcon}>✨</div>
          <div className={pstyles.metricInfo}>
            <span className={pstyles.metricValue}>{activeProgramsCount}</span>
            <span className={pstyles.metricLabel}>Active &amp; Published</span>
          </div>
        </div>

        <div className={pstyles.metricCard}>
          <div className={pstyles.metricIcon}>📑</div>
          <div className={pstyles.metricInfo}>
            <span className={pstyles.metricValue}>{totalStepsCount}</span>
            <span className={pstyles.metricLabel}>Total Modules</span>
          </div>
        </div>

        <div className={pstyles.metricCard}>
          <div className={pstyles.metricIcon}>🏷️</div>
          <div className={pstyles.metricInfo}>
            <span className={pstyles.metricValue}>${avgPrice}</span>
            <span className={pstyles.metricLabel}>Avg Course Price</span>
          </div>
        </div>
      </div>

      {/* 3. Search & Control Bar */}
      <div className={pstyles.controlBar}>
        <div className={pstyles.searchWrap}>
          <span className={pstyles.searchIcon}>🔍</span>
          <input
            ref={searchInputRef}
            type="text"
            className={pstyles.searchInput}
            placeholder="Search by title, syllabus, or topic..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <span className={pstyles.shortcutBadge}>⌘K</span>
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
            >
              ⊞
            </button>
            <button
              type="button"
              className={`${pstyles.viewModeBtn} ${viewMode === "table" ? pstyles.viewModeBtnActive : ""}`}
              onClick={() => setViewMode("table")}
              title="Dense table view"
            >
              ☰
            </button>
          </div>
        </div>
      </div>

      {/* 4. Content Area: Grid View or Dense Table View */}
      {isLoading ? (
        <div className={pstyles.cardsGrid}>
          {[1, 2, 3, 4, 5, 6].map((idx) => (
            <div key={idx} className="skeleton" style={{ height: 320, borderRadius: 20 }} />
          ))}
        </div>
      ) : filteredPrograms.length === 0 ? (
        <div className={pstyles.emptyState}>
          <div className={pstyles.emptyIcon}>📚</div>
          <h3 className={pstyles.emptyTitle}>No matching programs found</h3>
          <p className={pstyles.emptyDesc}>
            {searchQuery
              ? `No curriculum matches "${searchQuery}". Try adjusting your search query or filters.`
              : "Start by authoring your first luxury learning curriculum track."}
          </p>
          <button className={pstyles.primaryCreateBtn} onClick={openCreateModal}>
            + Create New Course
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
                  {info.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={info.image} alt={prog.title} className={pstyles.cardMediaImage} />
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
                      <span>&rarr;</span>
                    </Link>

                    <button
                      type="button"
                      className={pstyles.iconMenuBtn}
                      onClick={() => toggleDropdown(prog.id)}
                      title="More Actions"
                    >
                      •••
                    </button>
                  </div>

                  {/* Dropdown Menu */}
                  {activeDropdown === prog.id && (
                    <div className={pstyles.actionDropdown}>
                      <Link href={`/programs/${prog.id}`} className={pstyles.dropdownItem}>
                        <span>🛠 Open Studio</span>
                      </Link>
                      <button
                        type="button"
                        className={pstyles.dropdownItem}
                        onClick={() => openEditModal(prog)}
                      >
                        <span>⚙ Edit Settings</span>
                      </button>
                      <a
                        href={`http://localhost:3000/programs/${prog.id}/steps`}
                        target="_blank"
                        rel="noreferrer"
                        className={pstyles.dropdownItem}
                      >
                        <span>👁 Preview on LMS</span>
                      </a>
                      <button
                        type="button"
                        className={`${pstyles.dropdownItem} ${pstyles.dropdownItemDanger}`}
                        onClick={() => handleDeleteProgram(prog.id)}
                      >
                        <span>🗑 Delete Track</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Dense Table View */
        <div style={{ background: "#ffffff", border: "1px solid var(--border-light)", borderRadius: 16, overflow: "hidden" }}>
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
              {filteredPrograms.map((prog) => (
                <tr key={prog.id}>
                  <td>
                    <Link
                      href={`/programs/${prog.id}`}
                      style={{ fontWeight: 700, color: "var(--text-primary)", textDecoration: "none" }}
                    >
                      {prog.title}
                    </Link>
                  </td>
                  <td>{parseCourseInfo(prog.description).type || "Course"}</td>
                  <td>${prog.price}</td>
                  <td>{prog._count?.steps ?? 0} Steps</td>
                  <td>
                    <span className={`${styles.statusChip} ${prog.isActive ? styles.active : styles.locked}`}>
                      {prog.isActive ? "Published" : "Draft"}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: "6px" }}>
                      <Link href={`/programs/${prog.id}`} className={pstyles.builderBtn} style={{ padding: "0.4rem 0.8rem", fontSize: "0.8rem" }}>
                        Studio &rarr;
                      </Link>
                      <button
                        className={pstyles.iconMenuBtn}
                        style={{ width: 32, height: 32 }}
                        onClick={() => openEditModal(prog)}
                        title="Edit Settings"
                      >
                        ⚙
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* CREATE & EDIT PROGRAM MODAL */}
      {isModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsModalOpen(false)}>
          <div
            className={styles.modalContent}
            style={{ maxWidth: "680px", maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <h2>{editingProgramId ? "Edit Course Settings" : "Create New Program Track"}</h2>
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                  Step 1 captures catalog metadata. The Curriculum Studio allows authoring videos, PDFs, and quizzes inline.
                </p>
              </div>
              <button className={styles.closeBtn} onClick={() => setIsModalOpen(false)}>
                ×
              </button>
            </div>

            <form className={styles.modalForm} onSubmit={handleSaveProgram}>
              <div className={styles.formGroup}>
                <label>Program Title</label>
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
                  <label>Curriculum Type</label>
                  <select value={type} onChange={(e) => setType(e.target.value)}>
                    <option>Certification</option>
                    <option>Corporate</option>
                    <option>Single Session</option>
                  </select>
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
                <label>Course Cover Image URL</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    placeholder="https://... or upload an asset"
                    value={image}
                    onChange={(e) => setImage(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <label className={styles.secondaryBtn} style={{ cursor: "pointer", margin: 0 }}>
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
                          alert(err.message || "Failed to upload image");
                        } finally {
                          setIsUploading(false);
                        }
                      }}
                    />
                  </label>
                </div>
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
                  />
                  <span style={{ fontWeight: 600 }}>Publish to Learner Catalog immediately</span>
                </label>
              </div>

              {formError && <p className={styles.formError}>{formError}</p>}

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
    </div>
  );
}
