"use client";

import { ChangeEvent, FormEvent, useEffect, useState, useMemo } from "react";
import Image from "next/image";
import pageStyles from "../page.module.css";
import styles from "./website.module.css";
import {
  API_URL,
  errorMessage,
  uploadFile,
  getAdminGallery,
  uploadGalleryImage,
  createGalleryItem,
  updateGalleryItem,
  deleteGalleryItem,
  type GalleryItem,
  type CreateGalleryItemPayload,
} from "../lib/api";
import { Modal, ConfirmDialog, StatusBadge, useToast } from "../components";

type Faq = { q: string; a: string };
type Testimonial = { quote: string; name: string; role: string };

/** The document stored at /site-content. Anything left blank uses the website's built-in text. */
type SiteContent = {
  hero: { eyebrow: string; title: string; highlight: string; subtitle: string; image: string };
  about: { image: string };
  faqs: Faq[];
  testimonials: Testimonial[];
  contact: { email: string; social: string };
  promo: { enabled: boolean; text: string; linkLabel: string; linkUrl: string };
};

const EMPTY_CONTENT: SiteContent = {
  hero: { eyebrow: "", title: "", highlight: "", subtitle: "", image: "" },
  about: { image: "" },
  faqs: [],
  testimonials: [],
  contact: { email: "", social: "" },
  promo: { enabled: false, text: "", linkLabel: "", linkUrl: "" },
};

const BRAND_FALLBACK_IMG =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='600' height='450' viewBox='0 0 600 450' fill='%23f1f5f9'><rect width='600' height='450' fill='%23f8fafc'/><text x='50%25' y='48%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='18' font-weight='600' fill='%2394a3b8'>WhatBoutMe</text><text x='50%25' y='55%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='14' fill='%23cbd5e1'>Photo Unavailable</text></svg>";

const CATEGORY_OPTIONS = ["Course", "Conference", "Workshop", "Keynote", "Awards", "Other"];

function ImageField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      onChange(await uploadFile(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload the image.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={pageStyles.formGroup}>
      <label>{label}</label>
      <div
        style={{
          display: "flex",
          gap: "1rem",
          alignItems: "center",
          flexWrap: "wrap",
          marginTop: "0.25rem",
        }}
      >
        {value && (
          <Image
            src={value}
            alt="Preview"
            width={72}
            height={72}
            quality={80}
            loading="lazy"
            unoptimized={!value.startsWith("/")}
            style={{
              width: "72px",
              height: "72px",
              objectFit: "cover",
              borderRadius: "10px",
              border: "1px solid var(--border-light)",
            }}
          />
        )}
        <label
          className={pageStyles.secondaryBtn}
          style={{
            cursor: "pointer",
            margin: 0,
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          <span>{busy ? "Uploading..." : value ? "Replace Image" : "Upload Image"}</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={onFile}
            disabled={busy}
            style={{ display: "none" }}
          />
        </label>
        {value && (
          <button
            type="button"
            className={pageStyles.dangerBtnSmall}
            onClick={() => onChange("")}
          >
            Remove
          </button>
        )}
      </div>
      {error && (
        <span style={{ color: "var(--status-error)", fontSize: "0.8rem", marginTop: "4px" }}>
          {error}
        </span>
      )}
    </div>
  );
}

export default function WebsiteAdminPage() {
  const toast = useToast();

  // Top tab: "content" | "gallery"
  const [activeTab, setActiveTab] = useState<"content" | "gallery">("gallery");

  // ==========================================
  // TAB 1: WEBSITE CONTENT STATE
  // ==========================================
  const [content, setContent] = useState<SiteContent>(EMPTY_CONTENT);
  const [isContentLoading, setIsContentLoading] = useState(true);
  const [isSavingContent, setIsSavingContent] = useState(false);
  const [contentMessage, setContentMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/site-content`);
        if (res.ok) {
          const saved = await res.json();
          setContent({
            hero: { ...EMPTY_CONTENT.hero, ...saved.hero },
            about: { ...EMPTY_CONTENT.about, ...saved.about },
            faqs: Array.isArray(saved.faqs) ? saved.faqs : [],
            testimonials: Array.isArray(saved.testimonials) ? saved.testimonials : [],
            contact: { ...EMPTY_CONTENT.contact, ...saved.contact },
            promo: {
              ...EMPTY_CONTENT.promo,
              ...saved.promo,
              enabled: saved.promo?.enabled === true,
            },
          });
        }
      } catch (e) {
        console.error("Failed to load website content", e);
      } finally {
        setIsContentLoading(false);
      }
    })();
  }, []);

  const setHero = (key: keyof SiteContent["hero"], value: string) =>
    setContent((c) => ({ ...c, hero: { ...c.hero, [key]: value } }));
  const setPromo = <K extends keyof SiteContent["promo"]>(key: K, value: SiteContent["promo"][K]) =>
    setContent((c) => ({ ...c, promo: { ...c.promo, [key]: value } }));
  const setContact = (key: keyof SiteContent["contact"], value: string) =>
    setContent((c) => ({ ...c, contact: { ...c.contact, [key]: value } }));
  const setFaq = (i: number, key: keyof Faq, value: string) =>
    setContent((c) => ({
      ...c,
      faqs: c.faqs.map((f, n) => (n === i ? { ...f, [key]: value } : f)),
    }));
  const setTestimonial = (i: number, key: keyof Testimonial, value: string) =>
    setContent((c) => ({
      ...c,
      testimonials: c.testimonials.map((t, n) => (n === i ? { ...t, [key]: value } : t)),
    }));

  const handleSaveContent = async (e: FormEvent) => {
    e.preventDefault();
    setContentMessage(null);
    setIsSavingContent(true);
    try {
      const payload: SiteContent = {
        ...content,
        faqs: content.faqs.filter((f) => f.q.trim() && f.a.trim()),
        testimonials: content.testimonials.filter((t) => t.quote.trim() && t.name.trim()),
      };
      const res = await fetch(`${API_URL}/site-content`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setContent(payload);
        setContentMessage({
          ok: true,
          text: "Saved. The website shows the changes within a minute.",
        });
        toast.success("Website content saved successfully");
      } else {
        const err = await errorMessage(res, "Could not save the website content");
        setContentMessage({ ok: false, text: err });
        toast.error(err);
      }
    } catch (err) {
      console.error("Failed to save website content", err);
      setContentMessage({
        ok: false,
        text: "Could not reach the server. Check that the API is running.",
      });
      toast.error("Could not reach the server.");
    } finally {
      setIsSavingContent(false);
    }
  };

  // ==========================================
  // TAB 2: PHOTO GALLERY STATE
  // ==========================================
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [isGalleryLoading, setIsGalleryLoading] = useState(true);
  const [gallerySearch, setGallerySearch] = useState("");
  const [galleryCategoryFilter, setGalleryCategoryFilter] = useState<string>("ALL");

  // Add / Edit Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<GalleryItem | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formImageUrl, setFormImageUrl] = useState("");
  const [formAltText, setFormAltText] = useState("");
  const [formCategory, setFormCategory] = useState("Course");
  const [formDisplayOrder, setFormDisplayOrder] = useState(0);
  const [formIsPublished, setFormIsPublished] = useState(true);

  // File upload state in modal
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string>("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState("");

  // Delete dialog state
  const [itemToDelete, setItemToDelete] = useState<GalleryItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load Gallery Items
  const loadGallery = async () => {
    setIsGalleryLoading(true);
    try {
      const data = await getAdminGallery();
      const items = Array.isArray(data) ? data : (data?.items || []);
      setGalleryItems([...items].sort((a, b) => a.displayOrder - b.displayOrder));
    } catch (err) {
      console.error("Failed to load gallery items", err);
      toast.error("Failed to load gallery items");
    } finally {
      setIsGalleryLoading(false);
    }
  };

  useEffect(() => {
    loadGallery();
  }, []);

  // Filtered gallery items
  const filteredGallery = useMemo(() => {
    return [...galleryItems]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .filter((item) => {
        const matchesSearch =
          gallerySearch === "" ||
          item.title.toLowerCase().includes(gallerySearch.toLowerCase()) ||
          (item.description && item.description.toLowerCase().includes(gallerySearch.toLowerCase())) ||
          (item.category && item.category.toLowerCase().includes(gallerySearch.toLowerCase()));

        const matchesCat =
          galleryCategoryFilter === "ALL" ||
          (item.category && item.category.toLowerCase() === galleryCategoryFilter.toLowerCase());

        return matchesSearch && matchesCat;
      });
  }, [galleryItems, gallerySearch, galleryCategoryFilter]);

  // Reorder gallery cards
  const handleMoveItem = async (item: GalleryItem, direction: "up" | "down") => {
    const sorted = [...galleryItems].sort((a, b) => a.displayOrder - b.displayOrder);
    const currentIndex = sorted.findIndex((i) => i.id === item.id);
    if (currentIndex === -1) return;

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    const targetItem = sorted[targetIndex];
    if (!targetItem) return;

    let currentOrder = targetItem.displayOrder;
    let targetOrder = item.displayOrder;
    if (currentOrder === targetOrder) {
      currentOrder = direction === "up" ? targetIndex : targetIndex + 1;
      targetOrder = direction === "up" ? targetIndex + 1 : targetIndex;
    }

    try {
      const updatedList = sorted
        .map((i) => {
          if (i.id === item.id) return { ...i, displayOrder: currentOrder };
          if (i.id === targetItem.id) return { ...i, displayOrder: targetOrder };
          return i;
        })
        .sort((a, b) => a.displayOrder - b.displayOrder);
      setGalleryItems(updatedList);

      await Promise.all([
        updateGalleryItem(item.id, { displayOrder: currentOrder }),
        updateGalleryItem(targetItem.id, { displayOrder: targetOrder }),
      ]);
      toast.success("Card order updated");
    } catch (err: any) {
      toast.error("Failed to reorder photo");
      loadGallery();
    }
  };

  // Gallery KPIs
  const galleryKpis = useMemo(() => {
    const total = galleryItems.length;
    const published = galleryItems.filter((i) => i.isPublished).length;
    const drafts = total - published;
    const categories = new Set(galleryItems.map((i) => i.category || "Uncategorized")).size;
    return { total, published, drafts, categories };
  }, [galleryItems]);

  // Open Modal for Add
  const handleOpenAddModal = () => {
    setEditingItem(null);
    setFormTitle("");
    setFormDescription("");
    setFormImageUrl("");
    setFormAltText("");
    setFormCategory("Course");
    setFormDisplayOrder(galleryItems.length > 0 ? Math.max(...galleryItems.map((i) => i.displayOrder)) + 1 : 0);
    setFormIsPublished(true);
    setSelectedFile(null);
    setLocalPreviewUrl("");
    setModalError("");
    setIsModalOpen(true);
  };

  // Open Modal for Edit
  const handleOpenEditModal = (item: GalleryItem) => {
    setEditingItem(item);
    setFormTitle(item.title);
    setFormDescription(item.description || "");
    setFormImageUrl(item.imageUrl);
    setFormAltText(item.altText || "");
    setFormCategory(item.category || "Course");
    setFormDisplayOrder(item.displayOrder);
    setFormIsPublished(item.isPublished);
    setSelectedFile(null);
    setLocalPreviewUrl("");
    setModalError("");
    setIsModalOpen(true);
  };

  // Handle local file selection with preview & 5MB validation
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/avif"];
    if (!allowed.includes(file.type)) {
      setModalError("Invalid image type. Allowed formats: PNG, JPEG, WEBP, AVIF.");
      return;
    }

    const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
    if (file.size > MAX_SIZE) {
      setModalError(`File size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds 5 MB limit.`);
      return;
    }

    setModalError("");
    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setLocalPreviewUrl(objectUrl);
  };

  // Handle Submit (Create / Edit) with double-submit protection
  const handleGallerySubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting || isUploadingImage) return;

    if (!formTitle.trim()) {
      setModalError("Title is required (e.g., 'Attended Research Course at US').");
      return;
    }

    if (!formImageUrl && !selectedFile) {
      setModalError("Please upload an image file or provide an image URL.");
      return;
    }

    setIsSubmitting(true);
    setModalError("");

    try {
      let finalImageUrl = formImageUrl;

      // Upload file if new file selected
      if (selectedFile) {
        setIsUploadingImage(true);
        try {
          const uploadRes = await uploadGalleryImage(selectedFile);
          finalImageUrl = uploadRes.imageUrl;
        } finally {
          setIsUploadingImage(false);
        }
      }

      if (editingItem) {
        // Update existing item
        const updated = await updateGalleryItem(editingItem.id, {
          title: formTitle.trim(),
          description: formDescription.trim() || undefined,
          imageUrl: finalImageUrl,
          altText: formAltText.trim() || formTitle.trim(),
          category: formCategory.trim() || undefined,
          displayOrder: Number(formDisplayOrder),
          isPublished: formIsPublished,
        });

        setGalleryItems((prev) =>
          prev.map((i) => (i.id === updated.id ? updated : i))
        );
        toast.success("Gallery photo updated successfully");
      } else {
        // Create new item
        const created = await createGalleryItem({
          title: formTitle.trim(),
          description: formDescription.trim() || undefined,
          imageUrl: finalImageUrl,
          altText: formAltText.trim() || formTitle.trim(),
          category: formCategory.trim() || undefined,
          displayOrder: Number(formDisplayOrder),
          isPublished: formIsPublished,
        });

        setGalleryItems((prev) => [created, ...prev]);
        toast.success("Gallery photo added successfully");
      }

      setIsModalOpen(false);
    } catch (err: any) {
      console.error("Gallery submit error", err);
      const msg = err instanceof Error ? err.message : "Failed to save gallery photo";
      setModalError(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick Toggle Published Status
  const handleTogglePublished = async (item: GalleryItem) => {
    const nextStatus = !item.isPublished;
    try {
      const updated = await updateGalleryItem(item.id, { isPublished: nextStatus });
      setGalleryItems((prev) =>
        prev.map((i) => (i.id === updated.id ? updated : i))
      );
      toast.success(nextStatus ? "Photo published on website" : "Photo hidden from website");
    } catch (err: any) {
      toast.error(err.message || "Failed to toggle status");
    }
  };

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    try {
      await deleteGalleryItem(itemToDelete.id);
      setGalleryItems((prev) => prev.filter((i) => i.id !== itemToDelete.id));
      toast.success("Gallery photo deleted");
      setItemToDelete(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete photo");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className={styles.pageContainer}>
      {/* Page Header */}
      <header className={styles.header}>
        <div>
          <h1 className={styles.headerTitle}>Website CMS &amp; Public Assets</h1>
          {/* <p className={styles.headerSubtitle}>
            Manage public website copy, hero banner, testimonials, and the visual credibility Photo Gallery.
          </p> */}
        </div>

        {/* Tab Switcher */}
        <div className={styles.mainTabs}>
          <button
            type="button"
            className={`${styles.mainTabBtn} ${activeTab === "gallery" ? styles.mainTabBtnActive : ""}`}
            onClick={() => setActiveTab("gallery")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span>Photo Gallery</span>
            <span className={styles.tabBadge}>{galleryItems.length}</span>
          </button>

          <button
            type="button"
            className={`${styles.mainTabBtn} ${activeTab === "content" ? styles.mainTabBtnActive : ""}`}
            onClick={() => setActiveTab("content")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <span>Website Copy</span>
          </button>
        </div>
      </header>

      {/* =========================================================================
          TAB 1: PHOTO GALLERY CMS
          ========================================================================= */}
      {activeTab === "gallery" && (
        <>
          {/* KPI Cards */}
          <div className={styles.kpiGrid}>
            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>Total Photos</span>
              <span className={styles.kpiValue}>{galleryKpis.total}</span>
              <span className={styles.kpiSub}>Conferences, courses &amp; moments</span>
            </div>
            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>Published</span>
              <span className={styles.kpiValue} style={{ color: "#16a34a" }}>
                {galleryKpis.published}
              </span>
              <span className={styles.kpiSub}>Visible on public website</span>
            </div>
            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>Drafts / Hidden</span>
              <span className={styles.kpiValue} style={{ color: "#d97706" }}>
                {galleryKpis.drafts}
              </span>
              <span className={styles.kpiSub}>Internal drafts</span>
            </div>
            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>Categories</span>
              <span className={styles.kpiValue}>{galleryKpis.categories}</span>
              <span className={styles.kpiSub}>Courses, conferences, etc.</span>
            </div>
          </div>

          {/* Gallery Toolbar */}
          <div className={styles.toolbar}>
            <div className={styles.toolbarLeft}>
              {/* Search */}
              <div className={styles.searchBox}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Search photo title, context..."
                  value={gallerySearch}
                  onChange={(e) => setGallerySearch(e.target.value)}
                />
              </div>

              {/* Category Filter Pills */}
              <div className={styles.categoryPills}>
                {["ALL", "Course", "Conference", "Workshop"].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`${styles.catPill} ${galleryCategoryFilter === cat ? styles.catPillActive : ""}`}
                    onClick={() => setGalleryCategoryFilter(cat)}
                  >
                    {cat === "ALL" ? "All Categories" : cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Add Photo Button */}
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={handleOpenAddModal}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Add Photo</span>
            </button>
          </div>

          {/* Gallery Items Grid */}
          {isGalleryLoading ? (
            <div style={{ textAlign: "center", padding: "4rem 2rem", color: "#64748b" }}>
              <p>Loading photo gallery...</p>
            </div>
          ) : filteredGallery.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </div>
              <h3 className={styles.emptyTitle}>
                {gallerySearch || galleryCategoryFilter !== "ALL"
                  ? "No matching photos found"
                  : "No gallery photos uploaded yet"}
              </h3>
              <p className={styles.emptySubtitle}>
                {gallerySearch || galleryCategoryFilter !== "ALL"
                  ? "Try clearing your search query or switching category filters."
                  : "Upload photos from research courses, workshops, and international conferences to build visual credibility on the public website."}
              </p>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={handleOpenAddModal}
              >
                Upload First Photo
              </button>
            </div>
          ) : (
            <div className={styles.galleryGrid}>
              {filteredGallery.map((item, index) => (
                <article key={item.id} className={styles.galleryCard}>
                  {/* Image Container with 4:3 Aspect Ratio and Zero CLS */}
                  <div className={styles.imageContainer}>
                    <img
                      src={item.imageUrl}
                      alt={item.altText || item.title}
                      loading="lazy"
                      className={styles.galleryImage}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = BRAND_FALLBACK_IMG;
                      }}
                    />
                    <div className={styles.cardOverlayTop}>
                      <span className={styles.orderBadge}>Order #{item.displayOrder}</span>
                      {item.category && (
                        <span className={styles.categoryTag}>{item.category}</span>
                      )}
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className={styles.cardBody}>
                    <div className={styles.cardHeaderRow}>
                      <h4 className={styles.cardTitle}>{item.title}</h4>
                      <StatusBadge
                        status={item.isPublished ? "Published" : "Hidden"}
                        tone={item.isPublished ? "active" : "neutral"}
                      />
                    </div>
                    {item.description ? (
                      <p className={styles.cardDescription}>{item.description}</p>
                    ) : (
                      <p className={styles.cardDescription} style={{ fontStyle: "italic", color: "#94a3b8" }}>
                        No context description provided.
                      </p>
                    )}
                  </div>

                  {/* Card Actions Footer */}
                  <div className={styles.cardFooter}>
                    <button
                      type="button"
                      className={styles.secondaryBtn}
                      style={{ padding: "0.35rem 0.75rem", fontSize: "0.8rem" }}
                      onClick={() => handleTogglePublished(item)}
                    >
                      {item.isPublished ? "Hide" : "Publish"}
                    </button>

                    <div className={styles.cardActions}>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        title="Move Earlier in Gallery"
                        disabled={index === 0}
                        onClick={() => handleMoveItem(item, "up")}
                        style={{ opacity: index === 0 ? 0.35 : 1, cursor: index === 0 ? "not-allowed" : "pointer" }}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="18 15 12 9 6 15" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        title="Move Later in Gallery"
                        disabled={index === filteredGallery.length - 1}
                        onClick={() => handleMoveItem(item, "down")}
                        style={{ opacity: index === filteredGallery.length - 1 ? 0.35 : 1, cursor: index === filteredGallery.length - 1 ? "not-allowed" : "pointer" }}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        title="Edit Photo Details"
                        onClick={() => handleOpenEditModal(item)}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                        title="Delete Photo"
                        onClick={() => setItemToDelete(item)}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {/* ADD / EDIT MODAL */}
          <Modal
            isOpen={isModalOpen}
            onClose={() => !isSubmitting && setIsModalOpen(false)}
            title={editingItem ? "Edit Gallery Photo" : "Add Photo to Gallery"}
            subtitle="Showcase moments from courses, workshops, and international conferences to prove visual credibility."
            maxWidth="640px"
            footer={
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", width: "100%" }}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  disabled={isSubmitting}
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="gallery-item-form"
                  className={styles.primaryBtn}
                  disabled={isSubmitting || isUploadingImage}
                >
                  {isSubmitting || isUploadingImage ? (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}>
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                      <span>{isUploadingImage ? "Uploading Photo..." : "Saving..."}</span>
                    </>
                  ) : (
                    <span>{editingItem ? "Update Photo" : "Save Photo"}</span>
                  )}
                </button>
              </div>
            }
          >
            <form id="gallery-item-form" onSubmit={handleGallerySubmit}>
              {modalError && (
                <div
                  style={{
                    padding: "0.75rem 1rem",
                    marginBottom: "1rem",
                    borderRadius: "8px",
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    color: "#dc2626",
                    fontSize: "0.85rem",
                  }}
                >
                  {modalError}
                </div>
              )}

              {/* Photo Upload Zone */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  Photo File <span style={{ color: "#ef4444" }}>*</span>
                </label>

                {localPreviewUrl || formImageUrl ? (
                  <div className={styles.uploadPreviewRow}>
                    <img
                      src={localPreviewUrl || formImageUrl}
                      alt="Preview"
                      className={styles.previewThumb}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = BRAND_FALLBACK_IMG;
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: "0.85rem", fontWeight: 600, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {selectedFile ? selectedFile.name : "Current Photo"}
                      </p>
                      <p style={{ margin: "2px 0 0", fontSize: "0.75rem", color: "#64748b" }}>
                        {selectedFile
                          ? `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB · Ready to upload`
                          : "Stored on CDN"}
                      </p>
                    </div>
                    <label
                      className={styles.secondaryBtn}
                      style={{ cursor: "pointer", fontSize: "0.78rem", padding: "0.4rem 0.75rem" }}
                    >
                      <span>Replace</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/avif"
                        onChange={handleFileChange}
                        style={{ display: "none" }}
                      />
                    </label>
                  </div>
                ) : (
                  <label className={styles.dropzone}>
                    <div className={styles.dropzoneIcon}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                    </div>
                    <span className={styles.dropzoneText}>Click to select photo or drag here</span>
                    <span className={styles.dropzoneHint}>PNG, JPEG, WEBP, or AVIF (Up to 5 MB)</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/avif"
                      onChange={handleFileChange}
                      style={{ display: "none" }}
                    />
                  </label>
                )}
              </div>

              {/* Or Direct Image URL Fallback */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  Or Image URL <span className={styles.formLabelOptional}>(Cloudinary / External link)</span>
                </label>
                <input
                  type="url"
                  className={styles.formInput}
                  placeholder="https://res.cloudinary.com/..."
                  value={formImageUrl}
                  onChange={(e) => {
                    setFormImageUrl(e.target.value);
                    if (e.target.value && !selectedFile) {
                      setLocalPreviewUrl("");
                    }
                  }}
                />
              </div>

              {/* Title (Required) */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  Photo Title <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={160}
                  className={styles.formInput}
                  placeholder="e.g., Attended Research Course at US"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                />
              </div>

              {/* Description / Context */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  Context / Description <span className={styles.formLabelOptional}>(Explains what the photo is about)</span>
                </label>
                <textarea
                  className={styles.formTextarea}
                  rows={3}
                  placeholder="Brief context about the conference, course, or workshop moment..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                />
              </div>

              {/* Category & Display Order Grid */}
              <div className={styles.formGridTwo}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Category</label>
                  <select
                    className={styles.formSelect}
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                  >
                    {CATEGORY_OPTIONS.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Display Order</label>
                  <input
                    type="number"
                    min={0}
                    className={styles.formInput}
                    value={formDisplayOrder}
                    onChange={(e) => setFormDisplayOrder(Number(e.target.value))}
                  />
                </div>
              </div>

              {/* Alt Text */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  Alt Text <span className={styles.formLabelOptional}>(Accessibility description, defaults to title)</span>
                </label>
                <input
                  type="text"
                  maxLength={200}
                  className={styles.formInput}
                  placeholder={formTitle || "Accessible description"}
                  value={formAltText}
                  onChange={(e) => setFormAltText(e.target.value)}
                />
              </div>

              {/* Published Toggle */}
              <div className={styles.formGroup} style={{ marginTop: "0.5rem" }}>
                <label className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={formIsPublished}
                    onChange={(e) => setFormIsPublished(e.target.checked)}
                  />
                  <span className={styles.checkboxLabel}>Published (Visible on public user-facing website)</span>
                </label>
              </div>
            </form>
          </Modal>

          {/* DELETE CONFIRM DIALOG */}
          <ConfirmDialog
            isOpen={itemToDelete !== null}
            onClose={() => !isDeleting && setItemToDelete(null)}
            onConfirm={handleConfirmDelete}
            title="Delete Gallery Photo?"
            subtitle="This action cannot be undone."
            description={
              <span>
                Are you sure you want to delete <strong>{itemToDelete?.title}</strong>? It will be permanently removed from the database and public gallery.
              </span>
            }
            tone="danger"
            confirmText={isDeleting ? "Deleting..." : "Delete Photo"}
            isLoading={isDeleting}
          />
        </>
      )}

      {/* =========================================================================
          TAB 2: WEBSITE COPY & PROMO BANNER CMS
          ========================================================================= */}
      {activeTab === "content" && (
        isContentLoading ? (
          <div style={{ textAlign: "center", padding: "4rem 2rem", color: "#64748b" }}>
            <p>Loading website content...</p>
          </div>
        ) : (
          <form onSubmit={handleSaveContent}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 700, color: "#0f172a" }}>
                  Website Content &amp; Copy
                </h2>
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#64748b" }}>
                  Text and images on the public website. Anything left blank keeps the built-in copy.
                </p>
              </div>
              <button
                type="submit"
                className={styles.primaryBtn}
                disabled={isSavingContent}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                  <polyline points="17 21 17 13 7 13 7 21"></polyline>
                  <polyline points="7 3 7 8 15 8"></polyline>
                </svg>
                <span>{isSavingContent ? "Saving..." : "Save Changes"}</span>
              </button>
            </div>

            {contentMessage && (
              <div
                role="status"
                style={{
                  margin: "0 0 1.5rem",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  fontSize: "0.88rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  background: contentMessage.ok ? "var(--status-success-bg)" : "var(--status-error-bg)",
                  color: contentMessage.ok ? "var(--status-success)" : "var(--status-error)",
                  border: `1px solid ${contentMessage.ok ? "#bbf7d0" : "#fecaca"}`,
                }}
              >
                <span>{contentMessage.text}</span>
              </div>
            )}

            {/* Home Page Banner */}
            <section className={pageStyles.tableSection} style={{ padding: "1.75rem", marginBottom: "1.5rem" }}>
              <h2 style={{ margin: "0 0 0.35rem 0", fontSize: "1.15rem", fontWeight: 700 }}>Home Page Banner</h2>
              <p style={{ margin: "0 0 1.25rem 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                The first screen visitors see.
              </p>
              <div className={pageStyles.modalForm}>
                <div className={pageStyles.formGroup}>
                  <label>Small Label</label>
                  <input
                    type="text"
                    placeholder="Brain health · Resilience · Purpose"
                    value={content.hero.eyebrow}
                    onChange={(e) => setHero("eyebrow", e.target.value)}
                  />
                </div>
                <div className={pageStyles.formRow}>
                  <div className={pageStyles.formGroup}>
                    <label>Headline, Line 1</label>
                    <input
                      type="text"
                      placeholder="Brain Matters."
                      value={content.hero.title}
                      onChange={(e) => setHero("title", e.target.value)}
                    />
                  </div>
                  <div className={pageStyles.formGroup}>
                    <label>Headline, Line 2 (gold)</label>
                    <input
                      type="text"
                      placeholder="So Do You."
                      value={content.hero.highlight}
                      onChange={(e) => setHero("highlight", e.target.value)}
                    />
                  </div>
                </div>
                <div className={pageStyles.formGroup}>
                  <label>Description</label>
                  <textarea
                    rows={2}
                    placeholder="For the people who hold everyone else together..."
                    value={content.hero.subtitle}
                    onChange={(e) => setHero("subtitle", e.target.value)}
                  />
                </div>
                <ImageField
                  label="Banner Photo (cut-out on a transparent background works best)"
                  value={content.hero.image}
                  onChange={(url) => setHero("image", url)}
                />
              </div>
            </section>

            {/* Promotional Banner */}
            <section className={pageStyles.tableSection} style={{ padding: "1.75rem", marginBottom: "1.5rem" }}>
              <h2 style={{ margin: "0 0 0.35rem 0", fontSize: "1.15rem", fontWeight: 700 }}>Promotional Banner</h2>
              <p style={{ margin: "0 0 1.25rem 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                A highlighted strip under the home page banner and on the courses page, for an offer or announcement.
              </p>
              <div className={pageStyles.modalForm}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.88rem", fontWeight: 600, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={content.promo.enabled}
                    onChange={(e) => setPromo("enabled", e.target.checked)}
                    style={{ width: "16px", height: "16px", accentColor: "var(--accent-primary)" }}
                  />
                  Show the banner on the website
                </label>
                <div className={pageStyles.formGroup}>
                  <label htmlFor="promo-text">Message</label>
                  <input
                    id="promo-text"
                    type="text"
                    maxLength={140}
                    placeholder="Early-bird pricing for the January cohort ends 15 December"
                    value={content.promo.text}
                    onChange={(e) => setPromo("text", e.target.value)}
                  />
                </div>
                <div className={pageStyles.formRow}>
                  <div className={pageStyles.formGroup}>
                    <label htmlFor="promo-label">Button Label (optional)</label>
                    <input
                      id="promo-label"
                      type="text"
                      maxLength={30}
                      placeholder="Enrol now"
                      value={content.promo.linkLabel}
                      onChange={(e) => setPromo("linkLabel", e.target.value)}
                    />
                  </div>
                  <div className={pageStyles.formGroup}>
                    <label htmlFor="promo-url">Button Link (optional)</label>
                    <input
                      id="promo-url"
                      type="text"
                      placeholder="/courses"
                      value={content.promo.linkUrl}
                      onChange={(e) => setPromo("linkUrl", e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* About Page */}
            <section className={pageStyles.tableSection} style={{ padding: "1.75rem", marginBottom: "1.5rem" }}>
              <h2 style={{ margin: "0 0 0.35rem 0", fontSize: "1.15rem", fontWeight: 700 }}>About Page</h2>
              <p style={{ margin: "0 0 1.25rem 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                The facilitator photo on the About page and the home page panel.
              </p>
              <div className={pageStyles.modalForm}>
                <ImageField
                  label="Facilitator Photo"
                  value={content.about.image}
                  onChange={(url) => setContent((c) => ({ ...c, about: { image: url } }))}
                />
              </div>
            </section>

            {/* Testimonials */}
            <section className={pageStyles.tableSection} style={{ padding: "1.75rem", marginBottom: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", marginBottom: "0.35rem" }}>
                <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>Testimonials</h2>
                <button
                  type="button"
                  className={pageStyles.secondaryBtnSmall}
                  onClick={() =>
                    setContent((c) => ({
                      ...c,
                      testimonials: [...c.testimonials, { quote: "", name: "", role: "" }],
                    }))
                  }
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  <span>Add Testimonial</span>
                </button>
              </div>
              <p style={{ margin: "0 0 1.25rem 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                Use real quotes only. With none added, the website hides the testimonials section.
              </p>
              <div className={pageStyles.modalForm}>
                {content.testimonials.map((t, i) => (
                  <div
                    key={i}
                    style={{
                      border: "1px solid var(--border-light)",
                      borderRadius: "10px",
                      padding: "1.25rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.75rem",
                      background: "var(--bg-main)",
                    }}
                  >
                    <div className={pageStyles.formGroup}>
                      <label>Quote</label>
                      <textarea rows={3} value={t.quote} onChange={(e) => setTestimonial(i, "quote", e.target.value)} />
                    </div>
                    <div className={pageStyles.formRow}>
                      <div className={pageStyles.formGroup}>
                        <label>Name</label>
                        <input type="text" value={t.name} onChange={(e) => setTestimonial(i, "name", e.target.value)} />
                      </div>
                      <div className={pageStyles.formGroup}>
                        <label>Role, Organisation</label>
                        <input type="text" value={t.role} onChange={(e) => setTestimonial(i, "role", e.target.value)} />
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className={pageStyles.dangerBtnSmall}
                        onClick={() =>
                          setContent((c) => ({
                            ...c,
                            testimonials: c.testimonials.filter((_, n) => n !== i),
                          }))
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Questions (FAQ) */}
            <section className={pageStyles.tableSection} style={{ padding: "1.75rem", marginBottom: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", marginBottom: "0.35rem" }}>
                <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>Questions (FAQ)</h2>
                <button
                  type="button"
                  className={pageStyles.secondaryBtnSmall}
                  onClick={() =>
                    setContent((c) => ({
                      ...c,
                      faqs: [...c.faqs, { q: "", a: "" }],
                    }))
                  }
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  <span>Add Question</span>
                </button>
              </div>
              <p style={{ margin: "0 0 1.25rem 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                With none added, the website shows its built-in questions.
              </p>
              <div className={pageStyles.modalForm}>
                {content.faqs.map((f, i) => (
                  <div
                    key={i}
                    style={{
                      border: "1px solid var(--border-light)",
                      borderRadius: "10px",
                      padding: "1.25rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.75rem",
                      background: "var(--bg-main)",
                    }}
                  >
                    <div className={pageStyles.formGroup}>
                      <label>Question</label>
                      <input type="text" value={f.q} onChange={(e) => setFaq(i, "q", e.target.value)} />
                    </div>
                    <div className={pageStyles.formGroup}>
                      <label>Answer</label>
                      <textarea rows={2} value={f.a} onChange={(e) => setFaq(i, "a", e.target.value)} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className={pageStyles.dangerBtnSmall}
                        onClick={() =>
                          setContent((c) => ({
                            ...c,
                            faqs: c.faqs.filter((_, n) => n !== i),
                          }))
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Contact Details */}
            <section className={pageStyles.tableSection} style={{ padding: "1.75rem" }}>
              <h2 style={{ margin: "0 0 0.35rem 0", fontSize: "1.15rem", fontWeight: 700 }}>Contact Details</h2>
              <p style={{ margin: "0 0 1.25rem 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                Shown in the website footer.
              </p>
              <div className={pageStyles.formRow}>
                <div className={pageStyles.formGroup}>
                  <label>Email</label>
                  <input
                    type="email"
                    placeholder="share@whatboutme.com"
                    value={content.contact.email}
                    onChange={(e) => setContact("email", e.target.value)}
                  />
                </div>
                <div className={pageStyles.formGroup}>
                  <label>Social Handle</label>
                  <input
                    type="text"
                    placeholder="@whatboutme11"
                    value={content.contact.social}
                    onChange={(e) => setContact("social", e.target.value)}
                  />
                </div>
              </div>
            </section>
          </form>
        )
      )}
    </div>
  );
}
