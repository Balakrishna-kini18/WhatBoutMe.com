"use client";

import React, { useState, useRef } from "react";
import Image from "next/image";
import styles from "../curriculum.module.css";
import { uploadFile, cachedFetch, API_URL } from "../../../lib/api";
import { CustomSelect, AgreementMarkdown, InputDialog } from "../../../components";
import { parseCourseInfo, sanitizeCleanSummary } from "../../courseInfo";

interface Step1CourseSetupProps {
  programData: any;
  onSaveAndContinue: (updatedData: {
    title: string;
    description: string;
    shortDescription?: string;
    thumbnailUrl?: string;
    category?: string;
    price?: number;
    currency?: "USD" | "AED" | "INR";
    priceUSD?: number;
    priceAED?: number;
    priceINR?: number;
    earlyBirdPrice?: number | null;
    earlyBirdCurrency?: "USD" | "AED" | "INR" | null;
    earlyBirdDeadline?: string | null;
    hasCertificate?: boolean;
    requireExam?: boolean;
    requireCoaching?: boolean;
    requireMissionStatement?: boolean;
    sequentialProgressionEnabled?: boolean;
    attendanceRequired?: boolean;
    attendanceThreshold?: number;
    faqs?: Array<{
      id?: string;
      question: string;
      answer: string;
      sortOrder?: number;
    }>;
  }) => Promise<void>;
  isSaving: boolean;
  onCancel?: () => void;
}

const DEFAULT_CATEGORIES = [
  "Certification",
  "Leadership & Mindset",
  "Web Development",
  "UI/UX & Product Design",
  "Business Strategy",
  "Personal Growth",
  "Speaking & Workshops",
];

export default function Step1CourseSetup({
  programData,
  onSaveAndContinue,
  isSaving,
}: Step1CourseSetupProps) {
  const courseInfo = parseCourseInfo(programData?.description);
  const rawInitialThumb = programData?.thumbnailUrl || courseInfo.image || "";
  const initialThumb =
    rawInitialThumb.startsWith("http://") ||
    rawInitialThumb.startsWith("https://") ||
    rawInitialThumb.startsWith("/")
      ? rawInitialThumb
      : rawInitialThumb
      ? `/${rawInitialThumb}`
      : "";

  // Clean initial descriptions so metadata headers never bleed into text inputs
  const initialCleanSummary = sanitizeCleanSummary(courseInfo.summary || programData?.description || "");
  const initialCleanShort = sanitizeCleanSummary(courseInfo.short || programData?.shortDescription || "");

  // Form States
  const [title, setTitle] = useState(programData?.title || "");
  const titleInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (programData?.title === "Untitled Program") {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [programData?.title]);
  const [price, setPrice] = useState<string>(
    programData?.price !== undefined && programData?.price !== null ? String(programData.price) : ""
  );
  const [shortDescription, setShortDescription] = useState(initialCleanShort);
  const [description, setDescription] = useState(initialCleanSummary);
  const [markdownTab, setMarkdownTab] = useState<"edit" | "preview">("edit");
  const [thumbnailUrl, setThumbnailUrl] = useState(initialThumb);

  const initialCategory = (programData?.category || courseInfo.type || "Certification").trim() || "Certification";
  const [category, setCategory] = useState(initialCategory);

  const [availableCategories, setAvailableCategories] = useState<string[]>(() => {
    const list = new Set<string>(DEFAULT_CATEGORIES);
    if (initialCategory) list.add(initialCategory);
    return Array.from(list);
  });
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);

  React.useEffect(() => {
    let isCancelled = false;
    const fetchExistingCategories = async () => {
      try {
        const res = await cachedFetch(`${API_URL}/programs`, { skipCache: true });
        if (res.ok && !isCancelled) {
          const progs = await res.json();
          if (Array.isArray(progs)) {
            setAvailableCategories((prev) => {
              const merged = new Set<string>(prev);
              for (const p of progs) {
                const info = parseCourseInfo(p.description);
                const cat = (p.category || info.type || "").trim();
                if (cat) merged.add(cat);
              }
              return Array.from(merged);
            });
          }
        }
      } catch {}
    };
    fetchExistingCategories();
    return () => {
      isCancelled = true;
    };
  }, []);

  const handleAddNewCategory = (newCat: string) => {
    const trimmed = newCat.trim();
    if (!trimmed) return;
    setAvailableCategories((prev) => {
      if (prev.includes(trimmed)) return prev;
      return [...prev, trimmed];
    });
    setCategory(trimmed);
    setIsAddCategoryOpen(false);
  };

  const [hasCertificate, setHasCertificate] = useState<boolean>(
    programData?.hasCertificate !== false
  );

  // Currency & Multi-pricing preservation
  const currency = (programData?.currency as "USD" | "AED" | "INR") || "USD";
  const priceUSD = programData?.priceUSD;
  const priceAED = programData?.priceAED;
  const priceINR = programData?.priceINR;
  const earlyBirdPrice = programData?.earlyBirdPrice;
  const earlyBirdCurrency = programData?.earlyBirdCurrency;
  const earlyBirdDeadline = programData?.earlyBirdDeadline;

  // Course FAQs
  const initialFaqs = (() => {
    if (Array.isArray(programData?.faqs) && programData.faqs.length > 0) {
      return programData.faqs.map((f: any, idx: number) => ({
        id: f.id || `faq-${idx}`,
        question: f.question || f.q || "",
        answer: f.answer || f.a || "",
        sortOrder: typeof f.sortOrder === "number" ? f.sortOrder : idx,
      }));
    }
    if (Array.isArray(courseInfo.faqs) && courseInfo.faqs.length > 0) {
      return courseInfo.faqs.map((f: any, idx: number) => ({
        id: f.id || `faq-${idx}`,
        question: f.question || f.q || "",
        answer: f.answer || f.a || "",
        sortOrder: typeof f.sortOrder === "number" ? f.sortOrder : idx,
      }));
    }
    return [];
  })();

  const [faqs, setFaqs] = useState<
    Array<{
      id: string;
      question: string;
      answer: string;
      sortOrder: number;
    }>
  >(initialFaqs);

  // Cover image states
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Markdown Quick Formatter
  const applyMarkdownFormat = (action: "bold" | "italic" | "h2" | "bullet" | "link") => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = description;
    const selection = text.substring(start, end);

    let replacement = "";
    let newCursorPos = start;

    switch (action) {
      case "bold":
        replacement = selection ? `**${selection}**` : "**bold text**";
        newCursorPos = selection ? end + 4 : start + 2;
        break;
      case "italic":
        replacement = selection ? `*${selection}*` : "*italic text*";
        newCursorPos = selection ? end + 2 : start + 1;
        break;
      case "h2":
        replacement = `\n## ${selection || "Heading"}\n`;
        newCursorPos = start + replacement.length;
        break;
      case "bullet":
        replacement = selection ? selection.split("\n").map((l: string) => `- ${l}`).join("\n") : "\n- Point\n";
        newCursorPos = start + replacement.length;
        break;
      case "link":
        replacement = selection ? `[${selection}](https://...)` : "[link text](https://example.com)";
        newCursorPos = start + replacement.length;
        break;
    }

    const nextText = text.substring(0, start) + replacement + text.substring(end);
    setDescription(nextText);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 10);
  };

  const handleAddFaq = () => {
    setFaqs((prev) => [
      ...prev,
      {
        id: `faq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        question: "",
        answer: "",
        sortOrder: prev.length,
      },
    ]);
  };

  const handleFaqChange = (index: number, field: "question" | "answer", value: string) => {
    setFaqs((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, [field]: value } : item))
    );
  };

  const handleDeleteFaq = (index: number) => {
    setFaqs((prev) =>
      prev.filter((_, idx) => idx !== index).map((item, idx) => ({ ...item, sortOrder: idx }))
    );
  };

  // Image upload processor
  const processImageFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setErrorMsg("Please upload a valid image file (PNG, JPG, WebP).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg("File size exceeds 5MB limit. Please upload a smaller image.");
      return;
    }

    setIsUploadingImage(true);
    setErrorMsg(null);
    try {
      const url = await uploadFile(file);
      setThumbnailUrl(url);
    } catch (err: any) {
      console.warn("Could not upload cover image", err);
      const localUrl = URL.createObjectURL(file);
      setThumbnailUrl(localUrl);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processImageFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processImageFile(file);
    }
  };

  const handleRemoveImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setThumbnailUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg("Program Title is required.");
      return;
    }
    setErrorMsg(null);

    // Validate FAQs if any
    for (let i = 0; i < faqs.length; i++) {
      const item = faqs[i];
      if (!item) continue;
      const q = item.question.trim();
      const a = item.answer.trim();
      if ((q && !a) || (!q && a)) {
        setErrorMsg(`FAQ #${i + 1} must have both question and answer completed, or be removed.`);
        return;
      }
    }

    const cleanedFaqs = faqs
      .filter((f) => f.question.trim() && f.answer.trim())
      .map((f, idx) => ({
        id: f.id,
        question: f.question.trim(),
        answer: f.answer.trim(),
        sortOrder: idx,
      }));

    await onSaveAndContinue({
      title: title.trim(),
      description: description.trim() || shortDescription.trim(),
      shortDescription: shortDescription.trim(),
      thumbnailUrl,
      category,
      price: parseFloat(price) || 0,
      currency,
      priceUSD: priceUSD !== undefined ? priceUSD : (currency === "USD" ? parseFloat(price) || 0 : undefined),
      priceAED,
      priceINR,
      earlyBirdPrice,
      earlyBirdCurrency,
      earlyBirdDeadline,
      hasCertificate,
      requireExam: programData?.requireExam !== false,
      requireCoaching: programData?.requireCoaching !== false,
      requireMissionStatement: programData?.requireMissionStatement !== false,
      sequentialProgressionEnabled: programData?.sequentialProgressionEnabled !== false,
      attendanceRequired: programData?.attendanceRequired !== false,
      attendanceThreshold: programData?.attendanceThreshold ?? 80,
      faqs: cleanedFaqs,
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", width: "100%" }}>
      {/* Keyframe animations for cover dropzone upload */}
      <style>{`
        @keyframes uploaderSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes uploaderShimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>

      {/* Top Error Alert */}
      {errorMsg && (
        <div
          role="alert"
          style={{
            background: "#fef2f2",
            border: "1px solid #fecdd3",
            color: "#991b1b",
            padding: "11px 16px",
            borderRadius: "10px",
            fontSize: "0.85rem",
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            boxShadow: "0 1px 2px rgba(153, 27, 27, 0.05)",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span style={{ fontWeight: 500 }}>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        {/* ===================================================================
            SECTION 1: Basic Information & Cover Image (Integrated 2-Column)
            =================================================================== */}
        <section
          style={{
            background: "#ffffff",
            border: "1px solid var(--border-light, #e7decb)",
            borderRadius: "14px",
            padding: "1.35rem 1.5rem",
            boxShadow: "0 1px 3px rgba(20, 17, 15, 0.02)",
          }}
        >
          {/* Section Header - Clean Title, No Subtitle */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", marginBottom: "1.25rem", borderBottom: "1px solid #f5ede4", paddingBottom: "0.75rem" }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                background: "#fdf8f0",
                border: "1px solid #ebd9c4",
                color: "var(--accent-primary, #c97a1e)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
              aria-hidden="true"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </div>
            <h2 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary, #14110f)", margin: 0, lineHeight: 1.2 }}>
              Basic Information
            </h2>
          </div>

          {/* 2-Column Grid: Left = Details, Right = 16:9 Cover Banner */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr minmax(240px, 320px)", gap: "1.5rem", alignItems: "start" }}>
            {/* Left: Fields */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Program Title */}
              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#44403c", marginBottom: "5px" }}>
                  Program Title <span style={{ color: "var(--status-error, #dc2626)" }}>*</span>
                </label>
                <input
                  ref={titleInputRef}
                  type="text"
                  required
                  placeholder="e.g. 11 Steps to U Certification"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={styles.formInput}
                  style={{
                    fontSize: "0.95rem",
                    padding: "0.65rem 0.85rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border-light, #e7decb)",
                    width: "100%",
                  }}
                />
              </div>

              {/* 2-Column: Price & Category (Skill Level removed) */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#44403c", marginBottom: "5px" }}>
                    Price (USD)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="1999"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className={styles.formInput}
                    style={{
                      padding: "0.65rem 0.85rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border-light, #e7decb)",
                      width: "100%",
                      fontSize: "0.9rem",
                    }}
                  />
                </div>

                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "5px" }}>
                    <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "#44403c" }}>
                      Category <span style={{ color: "var(--status-error, #dc2626)" }}>*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsAddCategoryOpen(true)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--accent-primary, #c97a1e)",
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        padding: "0 2px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                      title="Add a custom course category"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      <span>Add Category</span>
                    </button>
                  </div>
                  <CustomSelect
                    value={category}
                    onChange={setCategory}
                    fullWidth
                    searchable
                    ariaLabel="Select Category"
                    placeholder="Select or create category..."
                    searchPlaceholder="Search or type new category..."
                    onCreateOption={handleAddNewCategory}
                    createOptionLabel={(query) => `Add "${query}" as new category`}
                    options={availableCategories.map((cat) => ({
                      value: cat,
                      label: cat,
                    }))}
                  />
                </div>
              </div>

              {/* Certificate Checkbox */}
              <div
                style={{
                  background: hasCertificate ? "#fefaf4" : "#faf8f5",
                  border: hasCertificate ? "1.5px solid #ebd9c4" : "1px solid #e7decb",
                  borderRadius: "10px",
                  padding: "0.85rem 1rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                  transition: "all 0.15s ease",
                }}
              >
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.65rem",
                    cursor: "pointer",
                    fontSize: "0.84rem",
                    fontWeight: 600,
                    color: "var(--text-primary, #14110f)",
                    userSelect: "none",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={hasCertificate}
                    onChange={(e) => setHasCertificate(e.target.checked)}
                    style={{
                      accentColor: "var(--accent-primary, #c97a1e)",
                      width: 17,
                      height: 17,
                      cursor: "pointer",
                    }}
                  />
                  <span>Issue Certificate of Completion upon course completion</span>
                </label>

                <span
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    color: hasCertificate ? "#15803d" : "#78716a",
                    background: hasCertificate ? "#ecfdf5" : "#f5ece1",
                    border: `1px solid ${hasCertificate ? "#bbf7d0" : "#e7decb"}`,
                    padding: "2px 8px",
                    borderRadius: "9999px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {hasCertificate ? "Enabled" : "Disabled"}
                </span>
              </div>
            </div>

            {/* Right: Cover Banner Uploader (Neat, clean 16:9 box without redundant clutter) */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "5px" }}>
                <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "#44403c", margin: 0 }}>
                  Cover Banner
                </label>
                <span style={{ fontSize: "0.72rem", color: "#a8a29e" }}>16:9</span>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleImageUpload}
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{
                  position: "relative",
                  aspectRatio: "16 / 9",
                  borderRadius: "12px",
                  border: isDragging
                    ? "2px solid var(--accent-primary, #c97a1e)"
                    : "1.5px dashed #d6cbbe",
                  background: isDragging ? "#fdf6ed" : "#faf8f5",
                  overflow: "hidden",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
                  transform: isDragging ? "scale(1.02)" : "scale(1)",
                  boxShadow: isDragging ? "0 8px 24px -4px rgba(201, 122, 30, 0.25)" : "none",
                }}
                title="Click or drop image to upload"
              >
                {/* UPLOADING STATE WITH SMOOTH SPINNER & SHIMMER */}
                {isUploadingImage && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      background: "linear-gradient(90deg, #faf6f0 0%, #f5ece1 50%, #faf6f0 100%)",
                      backgroundSize: "200% 100%",
                      animation: "uploaderShimmer 1.8s infinite linear",
                      zIndex: 5,
                    }}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        border: "3px solid rgba(201, 122, 30, 0.2)",
                        borderTopColor: "var(--accent-primary, #c97a1e)",
                        borderRadius: "50%",
                        animation: "uploaderSpin 0.75s linear infinite",
                      }}
                    />
                    <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-primary, #14110f)" }}>
                      Uploading...
                    </span>
                  </div>
                )}

                {/* IMAGE PREVIEW OR CLEAN DROPZONE PLACEHOLDER */}
                {thumbnailUrl ? (
                  <>
                    <Image
                      src={thumbnailUrl}
                      alt="Course cover"
                      fill
                      style={{ objectFit: "cover" }}
                      unoptimized={!thumbnailUrl.startsWith("/")}
                    />

                    {/* Smooth Hover Overlay */}
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        background: "linear-gradient(180deg, rgba(20, 17, 15, 0.2) 0%, rgba(20, 17, 15, 0.75) 100%)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.5rem",
                        opacity: 0,
                        transition: "opacity 0.2s ease",
                        zIndex: 3,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                      onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          fileInputRef.current?.click();
                        }}
                        style={{
                          background: "#ffffff",
                          color: "#14110f",
                          border: "none",
                          padding: "0.35rem 0.75rem",
                          borderRadius: "6px",
                          fontSize: "0.76rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
                        }}
                      >
                        Change
                      </button>

                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        style={{
                          background: "rgba(220, 38, 38, 0.9)",
                          color: "#ffffff",
                          border: "none",
                          padding: "0.35rem 0.75rem",
                          borderRadius: "6px",
                          fontSize: "0.76rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", color: "#78716a", padding: "0.75rem", textAlign: "center" }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        background: "#f5ece1",
                        color: "var(--accent-primary, #c97a1e)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                    </div>
                    <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-primary, #14110f)" }}>
                      Upload banner
                    </span>
                    <span style={{ fontSize: "0.7rem", color: "#a8a29e" }}>
                      Drop or click (Max 5MB)
                    </span>
                  </div>
                )}
              </div>

              {/* Direct Image URL input for pasting links */}
              <div style={{ position: "relative", marginTop: "8px", width: "100%" }}>
                <div
                  style={{
                    position: "absolute",
                    left: "9px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#a8a29e",
                    display: "flex",
                    alignItems: "center",
                    pointerEvents: "none",
                  }}
                  aria-hidden="true"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="Or paste image URL (https://...)"
                  value={thumbnailUrl}
                  onChange={(e) => setThumbnailUrl(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.45rem 1.8rem 0.45rem 1.8rem",
                    fontSize: "0.78rem",
                    borderRadius: "7px",
                    border: "1px solid var(--border-light, #e7decb)",
                    background: "#faf8f5",
                    color: "var(--text-primary, #14110f)",
                    outline: "none",
                    fontFamily: "inherit",
                    boxSizing: "border-box",
                  }}
                />
                {thumbnailUrl && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setThumbnailUrl("");
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    title="Clear image URL"
                    style={{
                      position: "absolute",
                      right: "6px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "transparent",
                      border: "none",
                      color: "#a8a29e",
                      cursor: "pointer",
                      padding: "3px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ===================================================================
            SECTION 2: Descriptions (Short Note & Long Note)
            =================================================================== */}
        <section
          style={{
            background: "#ffffff",
            border: "1px solid var(--border-light, #e7decb)",
            borderRadius: "14px",
            padding: "1.35rem 1.5rem",
            boxShadow: "0 1px 3px rgba(20, 17, 15, 0.02)",
          }}
        >
          {/* Section Header - Clean Title, No Subtitle */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", marginBottom: "1.25rem", borderBottom: "1px solid #f5ede4", paddingBottom: "0.75rem" }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                background: "#fdf8f0",
                border: "1px solid #ebd9c4",
                color: "var(--accent-primary, #c97a1e)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
              aria-hidden="true"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <h2 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary, #14110f)", margin: 0, lineHeight: 1.2 }}>
              Course Descriptions
            </h2>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {/* Short Description */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "5px" }}>
                <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "#44403c", margin: 0 }}>
                  Short Description (Plain Text)
                </label>
                <span style={{ fontSize: "0.72rem", color: "#a8a29e", fontWeight: 500 }}>
                  {shortDescription.length} characters (shown on catalog cards)
                </span>
              </div>
              <textarea
                rows={2}
                placeholder="Brief 1-2 sentence overview for catalog cards and search previews..."
                value={shortDescription}
                onChange={(e) => setShortDescription(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.65rem 0.85rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border-light, #e7decb)",
                  fontSize: "0.88rem",
                  lineHeight: 1.45,
                  minHeight: "60px",
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
              />
            </div>

            {/* Full Description with Markdown & Preview Tabs */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px", flexWrap: "wrap", gap: "0.5rem" }}>
                <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "#44403c", margin: 0 }}>
                  Full Description &amp; Syllabus Details
                </label>

                {/* Edit / Preview Tabs */}
                <div style={{ display: "inline-flex", background: "#f5ede4", padding: "2px", borderRadius: "6px", border: "1px solid #e7decb" }}>
                  <button
                    type="button"
                    onClick={() => setMarkdownTab("edit")}
                    style={{
                      border: "none",
                      background: markdownTab === "edit" ? "#ffffff" : "transparent",
                      color: markdownTab === "edit" ? "#14110f" : "#78716a",
                      padding: "4px 10px",
                      borderRadius: "4px",
                      fontSize: "0.76rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      boxShadow: markdownTab === "edit" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                      transition: "all 0.15s ease",
                    }}
                  >
                    Edit Markdown
                  </button>
                  <button
                    type="button"
                    onClick={() => setMarkdownTab("preview")}
                    style={{
                      border: "none",
                      background: markdownTab === "preview" ? "#ffffff" : "transparent",
                      color: markdownTab === "preview" ? "#14110f" : "#78716a",
                      padding: "4px 10px",
                      borderRadius: "4px",
                      fontSize: "0.76rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      boxShadow: markdownTab === "preview" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                      transition: "all 0.15s ease",
                    }}
                  >
                    Live Preview
                  </button>
                </div>
              </div>

              {markdownTab === "edit" ? (
                <div>
                  {/* Markdown Quick Toolbar */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "5px 8px",
                      background: "#faf8f5",
                      border: "1px solid var(--border-light, #ece4d7)",
                      borderBottom: "none",
                      borderTopLeftRadius: "8px",
                      borderTopRightRadius: "8px",
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => applyMarkdownFormat("bold")}
                      style={{ padding: "3px 8px", fontSize: "0.75rem", fontWeight: 700, borderRadius: "4px", border: "1px solid #ebd9c4", background: "#ffffff", cursor: "pointer" }}
                      title="Bold (**text**)"
                    >
                      B
                    </button>
                    <button
                      type="button"
                      onClick={() => applyMarkdownFormat("italic")}
                      style={{ padding: "3px 8px", fontSize: "0.75rem", fontStyle: "italic", borderRadius: "4px", border: "1px solid #ebd9c4", background: "#ffffff", cursor: "pointer" }}
                      title="Italic (*text*)"
                    >
                      I
                    </button>
                    <button
                      type="button"
                      onClick={() => applyMarkdownFormat("h2")}
                      style={{ padding: "3px 8px", fontSize: "0.75rem", fontWeight: 600, borderRadius: "4px", border: "1px solid #ebd9c4", background: "#ffffff", cursor: "pointer" }}
                      title="Heading 2 (## Heading)"
                    >
                      H2
                    </button>
                    <button
                      type="button"
                      onClick={() => applyMarkdownFormat("bullet")}
                      style={{ padding: "3px 8px", fontSize: "0.75rem", fontWeight: 600, borderRadius: "4px", border: "1px solid #ebd9c4", background: "#ffffff", cursor: "pointer" }}
                      title="Bullet List (- item)"
                    >
                      • List
                    </button>
                    <button
                      type="button"
                      onClick={() => applyMarkdownFormat("link")}
                      style={{ padding: "3px 8px", fontSize: "0.75rem", fontWeight: 600, borderRadius: "4px", border: "1px solid #ebd9c4", background: "#ffffff", cursor: "pointer" }}
                      title="Insert Link ([label](url))"
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                        </svg>
                        Link
                      </span>
                    </button>
                  </div>

                  <textarea
                    ref={textareaRef}
                    rows={7}
                    placeholder="Comprehensive program overview in Markdown format (# Headings, **bold**, - points)..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.75rem 1rem",
                      border: "1px solid var(--border-light, #ece4d7)",
                      borderTopLeftRadius: 0,
                      borderTopRightRadius: 0,
                      borderBottomLeftRadius: "8px",
                      borderBottomRightRadius: "8px",
                      fontSize: "0.88rem",
                      lineHeight: 1.5,
                      fontFamily: "var(--font-mono, monospace)",
                      resize: "vertical",
                    }}
                  />
                </div>
              ) : (
                <div
                  style={{
                    background: "#fdfbf7",
                    border: "1px solid var(--border-light, #ece4d7)",
                    borderRadius: "10px",
                    padding: "1rem 1.25rem",
                    minHeight: "150px",
                    maxHeight: "350px",
                    overflowY: "auto",
                  }}
                >
                  {description.trim() ? (
                    <AgreementMarkdown content={description} />
                  ) : (
                    <span style={{ color: "#78716a", fontSize: "0.85rem", fontStyle: "italic" }}>
                      No full description entered yet. Switch back to &ldquo;Edit Markdown&rdquo; to add content.
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ===================================================================
            SECTION 3: Course FAQs (Accordion Style)
            =================================================================== */}
        <section
          style={{
            background: "#ffffff",
            border: "1px solid var(--border-light, #e7decb)",
            borderRadius: "14px",
            padding: "1.35rem 1.5rem",
            boxShadow: "0 1px 3px rgba(20, 17, 15, 0.02)",
          }}
        >
          {/* Section Header - Clean Title, No Subtitle */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", borderBottom: "1px solid #f5ede4", paddingBottom: "0.75rem", flexWrap: "wrap", gap: "0.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 7,
                  background: "#fdf8f0",
                  border: "1px solid #ebd9c4",
                  color: "var(--accent-primary, #c97a1e)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
                aria-hidden="true"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <h2 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary, #14110f)", margin: 0, lineHeight: 1.2 }}>
                Course FAQs ({faqs.length})
              </h2>
            </div>

            <button
              type="button"
              onClick={handleAddFaq}
              style={{
                fontSize: "0.82rem",
                fontWeight: 600,
                color: "var(--accent-primary, #c97a1e)",
                background: "#fdf8f0",
                border: "1px solid #ebd9c4",
                borderRadius: "8px",
                padding: "6px 14px",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                transition: "all 0.15s ease",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Add FAQ</span>
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.95rem" }}>
            {faqs.length === 0 ? (
              <div
                style={{
                  padding: "1.75rem 1.5rem",
                  textAlign: "center",
                  background: "#faf8f5",
                  borderRadius: "10px",
                  border: "1.5px dashed #e7decb",
                  color: "#78716a",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                }}
              >
                <span style={{ fontSize: "0.86rem", fontWeight: 600, color: "var(--text-primary, #14110f)" }}>
                  No FAQs added yet
                </span>
                <p style={{ fontSize: "0.78rem", color: "#78716a", margin: 0, maxWidth: 360 }}>
                  Add common questions about schedule, prerequisites, recordings, or policies.
                </p>
                <button
                  type="button"
                  onClick={handleAddFaq}
                  style={{
                    marginTop: "0.35rem",
                    padding: "5px 12px",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    color: "#ffffff",
                    background: "var(--accent-primary, #c97a1e)",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                  }}
                >
                  + Add First Question
                </button>
              </div>
            ) : (
              faqs.map((faq, idx) => (
                <div
                  key={faq.id}
                  style={{
                    background: "#faf8f5",
                    border: "1px solid #e7decb",
                    borderRadius: "10px",
                    padding: "1rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.65rem",
                    transition: "border-color 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span
                      style={{
                        fontSize: "0.74rem",
                        fontWeight: 700,
                        color: "var(--accent-primary, #c97a1e)",
                        background: "#fdf8f0",
                        border: "1px solid #ebd9c4",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      Question #{idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteFaq(idx)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--status-error, #dc2626)",
                        fontSize: "0.76rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                      <span>Remove</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. Do I get lifetime access to recordings and materials?"
                    value={faq.question}
                    onChange={(e) => handleFaqChange(idx, "question", e.target.value)}
                    style={{
                      background: "#ffffff",
                      padding: "0.6rem 0.85rem",
                      fontSize: "0.88rem",
                      borderRadius: "8px",
                      border: "1px solid #ebd9c4",
                      width: "100%",
                    }}
                  />
                  <textarea
                    rows={2}
                    placeholder="Provide a helpful, detailed answer for prospective learners..."
                    value={faq.answer}
                    onChange={(e) => handleFaqChange(idx, "answer", e.target.value)}
                    style={{
                      background: "#ffffff",
                      padding: "0.6rem 0.85rem",
                      fontSize: "0.88rem",
                      minHeight: "55px",
                      borderRadius: "8px",
                      border: "1px solid #ebd9c4",
                      width: "100%",
                      fontFamily: "inherit",
                      resize: "vertical",
                    }}
                  />
                </div>
              ))
            )}
          </div>
        </section>

        {/* ===================================================================
            BOTTOM ACTION BAR
            =================================================================== */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            padding: "0.75rem 0 2rem 0",
          }}
        >
          <button
            type="submit"
            disabled={isSaving}
            style={{
              padding: "0.65rem 1.75rem",
              fontSize: "0.88rem",
              fontWeight: 700,
              background: "var(--accent-primary, #c97a1e)",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              cursor: isSaving ? "not-allowed" : "pointer",
              boxShadow: "0 2px 6px rgba(201, 122, 30, 0.25)",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              transition: "all 0.15s ease",
              opacity: isSaving ? 0.75 : 1,
            }}
          >
            {isSaving ? (
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
                <span>Saving Details...</span>
              </>
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
                <span>Save Program Details</span>
              </>
            )}
          </button>
        </div>
      </form>

      <InputDialog
        isOpen={isAddCategoryOpen}
        onClose={() => setIsAddCategoryOpen(false)}
        onSubmit={handleAddNewCategory}
        title="Add New Course Category"
        label="Category Name"
        placeholder="e.g. Executive Coaching, Digital Marketing, AI..."
        required
        multiline={false}
        confirmText="Add Category"
        tone="info"
      />
    </div>
  );
}
