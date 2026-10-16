"use client";

import React, { useEffect, useState, useRef } from "react";
import styles from "../page.module.css";
import resStyles from "./resources.module.css";
import { API_URL, cachedFetch } from "../lib/api";
import { Modal, CustomSelect, StatusBadge, ActionMenu, InputDialog, useToast } from "../components";

interface ResourceCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  order: number;
  itemCount?: number;
}

interface ResourceItem {
  id: string;
  title: string;
  description: string | null;
  type: "WORKSHEET" | "READING" | "GUIDED_AUDIO" | "VIDEO";
  categoryId: string;
  category: { id: string; name: string; slug: string };
  storageKey: string;
  mimeType: string;
  fileSizeBytes: number;
  durationSeconds: number | null;
  pageCount: number | null;
  stepTagNumber: number | null;
  accessScope: "ALL_ENROLLED" | "PROGRAM" | "BATCH" | "STEP_UNLOCKED";
  programId: string | null;
  program: { id: string; title: string; slug: string } | null;
  batchId: string | null;
  batch: { id: string; name: string } | null;
  requiredStepId: string | null;
  requiredStep: { id: string; title: string; sequence: number } | null;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

const Icons = {
  Upload: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  FileText: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  Headphones: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </svg>
  ),
  Video: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  ),
  BookOpen: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  ),
  Eye: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  Folder: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  Search: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
};

export default function ResourcesPage() {
  const [categories, setCategories] = useState<ResourceCategory[]>([]);
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [programs, setPrograms] = useState<{ id: string; title: string }[]>([]);
  const [batches, setBatches] = useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { success: toastSuccess, error: toastError } = useToast();
  const [resourceToDelete, setResourceToDelete] = useState<ResourceItem | null>(null);
  const [isDeletingResource, setIsDeletingResource] = useState(false);
  const [deleteResourceError, setDeleteResourceError] = useState<string | null>(null);

  // Tab & Filter States
  const [activeCategorySlug, setActiveCategorySlug] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterProgramId, setFilterProgramId] = useState("");
  const [filterBatchId, setFilterBatchId] = useState("");
  const [filterStepTag, setFilterStepTag] = useState("");
  const [filterAccessScope, setFilterAccessScope] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // Modals
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Form State
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formType, setFormType] = useState<"WORKSHEET" | "READING" | "GUIDED_AUDIO" | "VIDEO">("WORKSHEET");
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formStepTag, setFormStepTag] = useState<number | "">("");
  const [formAccessScope, setFormAccessScope] = useState<"ALL_ENROLLED" | "PROGRAM" | "BATCH" | "STEP_UNLOCKED">("ALL_ENROLLED");
  const [formProgramId, setFormProgramId] = useState("");
  const [formBatchId, setFormBatchId] = useState("");
  const [formRequiredStepId, setFormRequiredStepId] = useState("");
  const [formIsPublished, setFormIsPublished] = useState(true);
  const [formReason, setFormReason] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preview Modal
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewData, setPreviewData] = useState<{
    signedUrl: string;
    resource: any;
    watermark: { learnerName: string; learnerEmail: string; timestamp: string };
  } | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // Category Manager Modal
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatDesc, setNewCatDesc] = useState("");
  const [catError, setCatError] = useState<string | null>(null);

  const getAuthHeaders = (): Record<string, string> => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const loadData = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const [catRes, resRes, progRes, batchRes] = await Promise.all([
        fetch(`${API_URL}/admin/resources/categories`, { headers: getAuthHeaders() }),
        fetch(`${API_URL}/admin/resources`, { headers: getAuthHeaders() }),
        fetch(`${API_URL}/programs`, { headers: getAuthHeaders() }),
        fetch(`${API_URL}/batches`, { headers: getAuthHeaders() }),
      ]);

      if (catRes.ok) {
        const catJson = await catRes.json();
        setCategories(catJson);
        if (!formCategoryId && catJson.length > 0) {
          setFormCategoryId(catJson[0].id);
        }
      }
      if (resRes.ok) {
        const resJson = await resRes.json();
        setResources(resJson.items || []);
      }
      if (progRes.ok) {
        const progJson = await progRes.json();
        setPrograms(Array.isArray(progJson) ? progJson : progJson.programs || []);
      }
      if (batchRes.ok) {
        const batchJson = await batchRes.json();
        setBatches(Array.isArray(batchJson) ? batchJson : batchJson.batches || []);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load resource library data");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      handleSelectedFile(file);
    }
  };

  const handleSelectedFile = (file: File) => {
    setSelectedFile(file);
    if (!formTitle) {
      setFormTitle(file.name.replace(/\.[^/.]+$/, ""));
    }
    // Auto detect type
    if (file.type.includes("pdf")) {
      setFormType("WORKSHEET");
    } else if (file.type.startsWith("audio/")) {
      setFormType("GUIDED_AUDIO");
    } else if (file.type.startsWith("video/")) {
      setFormType("VIDEO");
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setUploadError("Please select a file to upload.");
      return;
    }
    if (!formTitle.trim()) {
      setUploadError("Resource title is required.");
      return;
    }
    if (!formCategoryId) {
      setUploadError("Please select a category.");
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadProgress(10);

    try {
      // 1. Request presigned upload URL
      setUploadProgress(25);
      const urlRes = await fetch(`${API_URL}/admin/resources/upload-url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          fileName: selectedFile.name,
          mimeType: selectedFile.type || "application/octet-stream",
          fileSizeBytes: selectedFile.size,
        }),
      });

      if (!urlRes.ok) {
        const err = await urlRes.json().catch(() => null);
        throw new Error(err?.message || "Failed to generate secure upload credentials");
      }

      const { uploadUrl, storageKey } = await urlRes.json();
      setUploadProgress(45);

      // 2. Upload directly to private storage
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": selectedFile.type || "application/octet-stream",
        },
        body: selectedFile,
      });

      if (!putRes.ok) {
        throw new Error(`Upload to storage provider failed (${putRes.status})`);
      }

      setUploadProgress(80);

      // 3. Register resource in NestJS API
      const createRes = await fetch(`${API_URL}/admin/resources`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          title: formTitle.trim(),
          description: formDescription.trim() || undefined,
          type: formType,
          categoryId: formCategoryId,
          storageKey,
          mimeType: selectedFile.type || "application/octet-stream",
          fileSizeBytes: selectedFile.size,
          stepTagNumber: formStepTag ? Number(formStepTag) : undefined,
          accessScope: formAccessScope,
          programId: formProgramId || undefined,
          batchId: formBatchId || undefined,
          requiredStepId: formRequiredStepId || undefined,
          isPublished: formIsPublished,
          reason: formReason.trim() || undefined,
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.json().catch(() => null);
        throw new Error(err?.message || "Failed to save resource record");
      }

      setUploadProgress(100);
      setUploadModalOpen(false);
      resetForm();
      await loadData();
    } catch (err: any) {
      setUploadError(err.message || "Failed to upload resource");
    } finally {
      setIsUploading(false);
    }
  };

  const resetForm = () => {
    setFormTitle("");
    setFormDescription("");
    setSelectedFile(null);
    setFormStepTag("");
    setFormAccessScope("ALL_ENROLLED");
    setFormProgramId("");
    setFormBatchId("");
    setFormRequiredStepId("");
    setFormReason("");
    setUploadProgress(0);
    setUploadError(null);
  };

  const handleOpenPreview = async (resource: ResourceItem) => {
    setIsPreviewLoading(true);
    setPreviewModalOpen(true);
    setPreviewData(null);
    try {
      const res = await fetch(`${API_URL}/admin/resources/${resource.id}/preview-token`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        throw new Error("Failed to load secure preview token");
      }
      const data = await res.json();
      setPreviewData(data);
    } catch (err: any) {
      alert(err.message || "Preview unavailable");
      setPreviewModalOpen(false);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const confirmDeleteResource = async (reason: string) => {
    if (!resourceToDelete) return;
    if (!reason.trim()) {
      setDeleteResourceError("A reason is required to delete a resource for audit compliance.");
      return;
    }
    setIsDeletingResource(true);
    setDeleteResourceError(null);

    try {
      const res = await cachedFetch(`${API_URL}/admin/resources/${resourceToDelete.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || "Failed to delete resource");
      }
      const targetId = resourceToDelete.id;
      setResources((prev) => prev.filter((r) => r.id !== targetId));
      toastSuccess("Resource deleted successfully.");
      setResourceToDelete(null);
    } catch (err: any) {
      const msg = err.message || "Failed to delete resource";
      setDeleteResourceError(msg);
      toastError(msg);
    } finally {
      setIsDeletingResource(false);
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setCatError(null);
    try {
      const res = await fetch(`${API_URL}/admin/resources/categories`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          name: newCatName.trim(),
          description: newCatDesc.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || "Failed to create category");
      }
      setNewCatName("");
      setNewCatDesc("");
      await loadData();
    } catch (err: any) {
      setCatError(err.message);
    }
  };

  // Filtered resources
  const filteredResources = resources.filter((item) => {
    if (activeCategorySlug !== "all" && item.category.slug !== activeCategorySlug) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        item.title.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q));
      if (!match) return false;
    }
    if (filterProgramId && item.programId !== filterProgramId) return false;
    if (filterBatchId && item.batchId !== filterBatchId) return false;
    if (filterStepTag && String(item.stepTagNumber) !== filterStepTag) return false;
    if (filterAccessScope && item.accessScope !== filterAccessScope) return false;
    if (filterStatus) {
      const pub = filterStatus === "published";
      if (item.isPublished !== pub) return false;
    }
    return true;
  });

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "WORKSHEET":
        return <Icons.FileText />;
      case "READING":
        return <Icons.BookOpen />;
      case "GUIDED_AUDIO":
        return <Icons.Headphones />;
      case "VIDEO":
        return <Icons.Video />;
      default:
        return <Icons.Folder />;
    }
  };

  return (
    <div className={styles.dashboardContainer}>
      {/* Header Bar */}
      <div className={styles.welcomeBar}>
        <div className={styles.welcomeInfo}>
          <div className={styles.welcomeMetaRow}>
            <span className={styles.welcomeDateBadge}>
              <Icons.Folder /> Standalone Learning Materials
            </span>
          </div>
          <h1 className={styles.welcomeHeading}>Resource Library</h1>
          <p className={styles.welcomeSubtext}>
            Upload worksheets, core readings, and guided audios with page-by-page watermarking and step-level access rules.
          </p>
        </div>
        <div className={styles.welcomeActions}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => setUploadModalOpen(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
          >
            <Icons.Upload />
            <span>Upload Resource</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <section className={styles.kpiGrid} style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <article className={styles.kpiCard}>
          <div className={styles.kpiTopRow}>
            <span className={styles.kpiLabel}>Total Materials</span>
            <div className={styles.kpiIconBox}><Icons.Folder /></div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>{resources.length}</span>
          </div>
          <div className={styles.kpiFooter}>
            <span className={styles.kpiMeta}>Across all categories</span>
          </div>
        </article>

        <article className={styles.kpiCard}>
          <div className={styles.kpiTopRow}>
            <span className={styles.kpiLabel}>Worksheets</span>
            <div className={styles.kpiIconBox}><Icons.FileText /></div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>
              {resources.filter((r) => r.type === "WORKSHEET").length}
            </span>
          </div>
          <div className={styles.kpiFooter}>
            <span className={styles.kpiMeta}>Reflective exercises</span>
          </div>
        </article>

        <article className={styles.kpiCard}>
          <div className={styles.kpiTopRow}>
            <span className={styles.kpiLabel}>Guided Audios</span>
            <div className={styles.kpiIconBox}><Icons.Headphones /></div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>
              {resources.filter((r) => r.type === "GUIDED_AUDIO").length}
            </span>
          </div>
          <div className={styles.kpiFooter}>
            <span className={styles.kpiMeta}>Audio meditations &amp; practices</span>
          </div>
        </article>

        <article className={styles.kpiCard}>
          <div className={styles.kpiTopRow}>
            <span className={styles.kpiLabel}>Published / Active</span>
            <div className={styles.kpiIconBox}><Icons.Eye /></div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>
              {resources.filter((r) => r.isPublished).length}
            </span>
          </div>
          <div className={styles.kpiFooter}>
            <span className={styles.kpiMeta}>Visible to enrolled learners</span>
          </div>
        </article>
      </section>

      {/* Category Tabs */}
      <div className={resStyles.categoryTabs}>
        <button
          type="button"
          className={`${resStyles.categoryTab} ${activeCategorySlug === "all" ? resStyles.categoryTabActive : ""}`}
          onClick={() => setActiveCategorySlug("all")}
        >
          <span>All Resources</span>
          <span className={resStyles.tabBadge}>{resources.length}</span>
        </button>

        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className={`${resStyles.categoryTab} ${activeCategorySlug === cat.slug ? resStyles.categoryTabActive : ""}`}
            onClick={() => setActiveCategorySlug(cat.slug)}
          >
            <span>{cat.name}</span>
            <span className={resStyles.tabBadge}>
              {resources.filter((r) => r.categoryId === cat.id).length}
            </span>
          </button>
        ))}

        <button
          type="button"
          className={resStyles.manageCategoriesBtn}
          onClick={() => setCategoryModalOpen(true)}
        >
          <span>⚙ Manage Categories</span>
        </button>
      </div>

      {/* Filter Controls Bar */}
      <div className={resStyles.filterBar}>
        <div className={resStyles.searchInputWrapper}>
          <span className={resStyles.searchIcon}><Icons.Search /></span>
          <input
            type="text"
            className={resStyles.searchInput}
            placeholder="Search by title, keywords..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <select
          className={resStyles.filterSelect}
          value={filterStepTag}
          onChange={(e) => setFilterStepTag(e.target.value)}
        >
          <option value="">All Steps (1–11)</option>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((s) => (
            <option key={s} value={String(s)}>Step {s}</option>
          ))}
        </select>

        <select
          className={resStyles.filterSelect}
          value={filterAccessScope}
          onChange={(e) => setFilterAccessScope(e.target.value)}
        >
          <option value="">All Access Scopes</option>
          <option value="ALL_ENROLLED">Global (All Enrolled)</option>
          <option value="PROGRAM">Program Specific</option>
          <option value="BATCH">Batch Specific</option>
          <option value="STEP_UNLOCKED">Step Unlocked</option>
        </select>

        <select
          className={resStyles.filterSelect}
          value={filterProgramId}
          onChange={(e) => setFilterProgramId(e.target.value)}
        >
          <option value="">All Programs</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </select>

        <select
          className={resStyles.filterSelect}
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
        </select>
      </div>

      {/* Resources Table Section */}
      <section className={styles.tableSection}>
        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>RESOURCE NAME</th>
                <th>TYPE</th>
                <th>STEP TAG</th>
                <th>ACCESS SCOPE</th>
                <th>FILE SIZE</th>
                <th>STATUS</th>
                <th style={{ textAlign: "right" }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "3rem", color: "#64748b" }}>
                    Loading resource library materials...
                  </td>
                </tr>
              ) : filteredResources.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "3rem", color: "#64748b" }}>
                    No resources found matching the current filters.
                  </td>
                </tr>
              ) : (
                filteredResources.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontWeight: 600, color: "var(--text-primary, #1e1915)" }}>
                          {item.title}
                        </span>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted, #9c9386)" }}>
                          {item.category.name}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.8125rem" }}>
                        {getTypeIcon(item.type)}
                        <span>{item.type.replace("_", " ")}</span>
                      </span>
                    </td>
                    <td>
                      {item.stepTagNumber ? (
                        <span className={resStyles.stepPill}>Step {item.stepTagNumber}</span>
                      ) : (
                        <span style={{ color: "#94a3b8", fontSize: "0.8125rem" }}>—</span>
                      )}
                    </td>
                    <td>
                      <span style={{ fontSize: "0.8125rem" }}>
                        {item.accessScope === "ALL_ENROLLED" && "Global (All Enrolled)"}
                        {item.accessScope === "PROGRAM" && `Program: ${item.program?.title || "Specified"}`}
                        {item.accessScope === "BATCH" && `Batch: ${item.batch?.name || "Specified"}`}
                        {item.accessScope === "STEP_UNLOCKED" && `Locked to Step ${item.stepTagNumber || ""}`}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: "0.8125rem", color: "#64748b" }}>
                        {formatFileSize(item.fileSizeBytes)}
                      </span>
                    </td>
                    <td>
                      <StatusBadge
                        tone={item.isPublished ? "active" : "neutral"}
                        status={item.isPublished ? "Published" : "Draft"}
                      />
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: "8px", alignItems: "center" }}>
                        <button
                          type="button"
                          className={styles.ghostBtn}
                          onClick={() => handleOpenPreview(item)}
                          style={{ padding: "4px 8px", fontSize: "0.8125rem" }}
                          title="Preview in-app with watermark"
                        >
                          <Icons.Eye />
                          <span>Preview</span>
                        </button>
                        <ActionMenu
                          items={[
                            {
                              label: "Delete Resource",
                              danger: true,
                              onClick: () => {
                                setDeleteResourceError(null);
                                setResourceToDelete(item);
                              },
                            },
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Upload Modal */}
      {uploadModalOpen && (
        <Modal
          isOpen={uploadModalOpen}
          title="Upload Learning Resource"
          onClose={() => {
            if (!isUploading) {
              setUploadModalOpen(false);
              resetForm();
            }
          }}
        >
          <form onSubmit={handleUploadSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {uploadError && (
              <div style={{ background: "#fee2e2", border: "1px solid #f87171", color: "#991b1b", padding: "10px", borderRadius: "6px", fontSize: "0.875rem" }}>
                {uploadError}
              </div>
            )}

            {/* Dropzone */}
            <div
              className={resStyles.dropzone}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                accept="application/pdf,audio/*,video/mp4"
                onChange={(e) => e.target.files?.[0] && handleSelectedFile(e.target.files[0])}
              />
              <div className={resStyles.dropzoneIcon}>
                <Icons.Upload />
              </div>
              <p className={resStyles.dropzoneTitle}>
                {selectedFile ? selectedFile.name : "Click or drag & drop learning material"}
              </p>
              <p className={resStyles.dropzoneSubtitle}>
                {selectedFile
                  ? `${formatFileSize(selectedFile.size)} · Ready to upload`
                  : "PDFs, MP3/WAV guided audios, or MP4 videos up to 100MB"}
              </p>
            </div>

            {isUploading && (
              <div className={resStyles.progressContainer}>
                <div className={resStyles.progressBar} style={{ width: `${uploadProgress}%` }} />
              </div>
            )}

            <div>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: "4px" }}>
                Title *
              </label>
              <input
                type="text"
                required
                className={resStyles.searchInput}
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="e.g. Core Values Reflection Worksheet"
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: "4px" }}>
                  Category *
                </label>
                <select
                  required
                  className={resStyles.filterSelect}
                  style={{ width: "100%" }}
                  value={formCategoryId}
                  onChange={(e) => setFormCategoryId(e.target.value)}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: "4px" }}>
                  Material Type *
                </label>
                <select
                  required
                  className={resStyles.filterSelect}
                  style={{ width: "100%" }}
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as any)}
                >
                  <option value="WORKSHEET">Worksheet (PDF)</option>
                  <option value="READING">Reading / Framework (PDF)</option>
                  <option value="GUIDED_AUDIO">Guided Audio (MP3/WAV)</option>
                  <option value="VIDEO">Video Deep Dive (MP4)</option>
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: "4px" }}>
                  Tag by Step (Steps 1–11)
                </label>
                <select
                  className={resStyles.filterSelect}
                  style={{ width: "100%" }}
                  value={formStepTag}
                  onChange={(e) => setFormStepTag(e.target.value ? Number(e.target.value) : "")}
                >
                  <option value="">No Step Tag</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((s) => (
                    <option key={s} value={s}>Step {s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: "4px" }}>
                  Access Scope *
                </label>
                <select
                  required
                  className={resStyles.filterSelect}
                  style={{ width: "100%" }}
                  value={formAccessScope}
                  onChange={(e) => setFormAccessScope(e.target.value as any)}
                >
                  <option value="ALL_ENROLLED">Global (All Enrolled Learners)</option>
                  <option value="PROGRAM">Specific Program</option>
                  <option value="BATCH">Specific Batch</option>
                  <option value="STEP_UNLOCKED">Locked Until Step is Unlocked</option>
                </select>
              </div>
            </div>

            {formAccessScope === "PROGRAM" && (
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: "4px" }}>
                  Target Program *
                </label>
                <select
                  required
                  className={resStyles.filterSelect}
                  style={{ width: "100%" }}
                  value={formProgramId}
                  onChange={(e) => setFormProgramId(e.target.value)}
                >
                  <option value="">Choose program...</option>
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>
            )}

            {formAccessScope === "BATCH" && (
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: "4px" }}>
                  Target Batch *
                </label>
                <select
                  required
                  className={resStyles.filterSelect}
                  style={{ width: "100%" }}
                  value={formBatchId}
                  onChange={(e) => setFormBatchId(e.target.value)}
                >
                  <option value="">Choose batch...</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: "4px" }}>
                Description &amp; Learner Instructions
              </label>
              <textarea
                rows={2}
                style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Optional instructions for completing this worksheet or listening to this audio..."
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => {
                  setUploadModalOpen(false);
                  resetForm();
                }}
                disabled={isUploading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={styles.primaryBtn}
                disabled={isUploading}
              >
                {isUploading ? `Uploading (${uploadProgress}%)...` : "Save & Publish"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* In-App Preview Modal with Diagonal Watermark & Print/Download Protection */}
      {previewModalOpen && (
        <Modal
          isOpen={previewModalOpen}
          title={`Secure Preview: ${previewData?.resource.title || "Loading..."}`}
          onClose={() => setPreviewModalOpen(false)}
        >
          {isPreviewLoading || !previewData ? (
            <div style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
              Generating secure signed preview with learner watermark...
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ fontSize: "0.8125rem", color: "#64748b" }}>
                Protected with light watermark overlay. Download and print buttons are disabled.
              </div>

              {previewData.resource.type === "GUIDED_AUDIO" ? (
                <div className={resStyles.audioPlayerCard}>
                  <Icons.Headphones />
                  <h3 style={{ margin: "0 0 4px 0", fontSize: "1.125rem", color: "#0f172a" }}>
                    {previewData.resource.title}
                  </h3>
                  <div className={resStyles.audioWaveformPlaceholder}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map((i) => (
                      <div
                        key={i}
                        className={resStyles.audioWaveBar}
                        style={{ animationDelay: `${i * 0.08}s` }}
                      />
                    ))}
                  </div>
                  <audio
                    controls
                    controlsList="nodownload"
                    onContextMenu={(e) => e.preventDefault()}
                    src={previewData.signedUrl}
                    style={{ width: "100%", marginTop: "8px" }}
                  />
                  <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                    Watermarked for: {previewData.watermark.learnerName} ({previewData.watermark.learnerEmail})
                  </span>
                </div>
              ) : (
                <div
                  className={resStyles.previewContainer}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  {/* Dynamic Watermark Overlay */}
                  <div className={resStyles.watermarkOverlay}>
                    {previewData.watermark.learnerName}
                    {"\n"}
                    {previewData.watermark.learnerEmail}
                    {"\n"}
                    {new Date(previewData.watermark.timestamp).toLocaleString()}
                    {"\n"}
                    Confidential &amp; Proprietary · WhatBoutMe
                  </div>

                  <iframe
                    src={`${previewData.signedUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                    className={resStyles.previewFrame}
                    title="Protected PDF Document"
                  />
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setPreviewModalOpen(false)}
                >
                  Close Preview
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Category Manager Modal */}
      {categoryModalOpen && (
        <Modal
          isOpen={categoryModalOpen}
          title="Manage Resource Categories"
          onClose={() => setCategoryModalOpen(false)}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {catError && (
              <div style={{ background: "#fee2e2", border: "1px solid #f87171", color: "#991b1b", padding: "10px", borderRadius: "6px", fontSize: "0.875rem" }}>
                {catError}
              </div>
            )}

            <div>
              <h4 style={{ margin: "0 0 8px 0", fontSize: "0.9375rem" }}>Existing Categories</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {categories.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      background: "#f8fafc",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600 }}>{c.name}</span>
                      <span style={{ fontSize: "0.75rem", color: "#64748b", marginLeft: "8px" }}>
                        ({c.itemCount ?? 0} resources)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <form onSubmit={handleCreateCategory} style={{ borderTop: "1px solid #e2e8f0", paddingTop: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <h4 style={{ margin: 0, fontSize: "0.9375rem" }}>Add New Category</h4>
              <input
                type="text"
                required
                className={resStyles.searchInput}
                placeholder="Category Name (e.g. Masterclass Toolkits)"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
              />
              <input
                type="text"
                className={resStyles.searchInput}
                placeholder="Description"
                value={newCatDesc}
                onChange={(e) => setNewCatDesc(e.target.value)}
              />
              <button type="submit" className={styles.primaryBtn} style={{ alignSelf: "flex-end" }}>
                Create Category
              </button>
            </form>
          </div>
        </Modal>
      )}

      {/* In-website branded InputDialog for Resource Deletion with Audit Log */}
      <InputDialog
        isOpen={Boolean(resourceToDelete)}
        onClose={() => {
          if (!isDeletingResource) {
            setResourceToDelete(null);
            setDeleteResourceError(null);
          }
        }}
        onSubmit={confirmDeleteResource}
        title="Delete Resource Document"
        subtitle={resourceToDelete?.title}
        description={
          <>
            Are you sure you want to permanently delete <strong>{resourceToDelete?.title}</strong>? A reason is required for compliance audit logging.
          </>
        }
        label="Reason for Deletion (Audit Log)"
        placeholder="e.g. Outdated syllabus content, replaced by v2..."
        required={true}
        confirmText={isDeletingResource ? "Deleting..." : "Delete Resource"}
        cancelText="Cancel"
        tone="danger"
        isLoading={isDeletingResource}
        error={deleteResourceError}
      />
    </div>
  );
}
