"use client";

import React, { useState, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import styles from "../curriculum.module.css";
import { uploadFile } from "../../../lib/api";
import { CustomSelect } from "../../../components";
import { parseCourseInfo } from "../../courseInfo";

interface Step1CourseSetupProps {
  programData: any;
  onSaveAndContinue: (updatedData: {
    title: string;
    description: string;
    shortDescription?: string;
    thumbnailUrl?: string;
    category?: string;
    level?: string;
    price?: number;
    currency?: "USD" | "AED" | "INR";
    priceUSD?: number;
    priceAED?: number;
    priceINR?: number;
    earlyBirdPrice?: number | null;
    earlyBirdCurrency?: "USD" | "AED" | "INR" | null;
    earlyBirdDeadline?: string | null;
    hasCertificate?: boolean;
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

export default function Step1CourseSetup({
  programData,
  onSaveAndContinue,
  isSaving,
  onCancel,
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

  const [title, setTitle] = useState(programData?.title || "");
  const [description, setDescription] = useState(programData?.description || "");
  const [shortDescription, setShortDescription] = useState(
    programData?.shortDescription ||
      courseInfo.summary ||
      programData?.description ||
      ""
  );
  const [thumbnailUrl, setThumbnailUrl] = useState(initialThumb);
  const [category, setCategory] = useState(
    programData?.category || courseInfo.type || "Leadership & Mindset"
  );
  const [level, setLevel] = useState(programData?.level || "Beginner");

  // Keep existing pricing / certificate settings from programData so zero data is lost
  const currency = (programData?.currency as "USD" | "AED" | "INR") || "USD";
  const priceUSD = programData?.priceUSD;
  const priceAED = programData?.priceAED;
  const priceINR = programData?.priceINR;
  const earlyBirdPrice = programData?.earlyBirdPrice;
  const earlyBirdCurrency = programData?.earlyBirdCurrency;
  const earlyBirdDeadline = programData?.earlyBirdDeadline;
  const hasCertificate = programData?.hasCertificate ?? true;

  // Course-Specific FAQs State
  const initialFaqs = (() => {
    if (Array.isArray(programData?.faqs) && programData.faqs.length > 0) {
      return programData.faqs.map((f: any, idx: number) => ({
        id: f.id || `faq-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        question: f.question || f.q || "",
        answer: f.answer || f.a || "",
        sortOrder: typeof f.sortOrder === "number" ? f.sortOrder : idx,
      }));
    }
    if (Array.isArray(courseInfo.faqs) && courseInfo.faqs.length > 0) {
      return courseInfo.faqs.map((f: any, idx: number) => ({
        id: f.id || `faq-${idx}-${Math.random().toString(36).slice(2, 6)}`,
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
  const [isFaqsExpanded, setIsFaqsExpanded] = useState(initialFaqs.length > 0);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Text formatting toolbar insertion helper
  const applyFormat = (
    type: "bold" | "italic" | "underline" | "bullet" | "number" | "link" | "code"
  ) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = shortDescription.substring(start, end);
    let replacement = "";

    switch (type) {
      case "bold":
        replacement = `**${selected || "bold text"}**`;
        break;
      case "italic":
        replacement = `*${selected || "italic text"}*`;
        break;
      case "underline":
        replacement = `<u>${selected || "underlined text"}</u>`;
        break;
      case "bullet":
        replacement = `\n• ${selected || "List item"}`;
        break;
      case "number":
        replacement = `\n1. ${selected || "List item"}`;
        break;
      case "link":
        replacement = `[${selected || "Link text"}](https://...)`;
        break;
      case "code":
        replacement = `\`${selected || "code"}\``;
        break;
    }

    const nextText =
      shortDescription.substring(0, start) +
      replacement +
      shortDescription.substring(end);
    setShortDescription(nextText);

    setTimeout(() => {
      textarea.focus();
      const cursorOffset = start + replacement.length;
      textarea.setSelectionRange(cursorOffset, cursorOffset);
    }, 0);
  };

  const handleAddFaq = () => {
    setIsFaqsExpanded(true);
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

  const handleFaqChange = (
    index: number,
    field: "question" | "answer",
    value: string
  ) => {
    setFaqs((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, [field]: value } : item
      )
    );
  };

  const handleDeleteFaq = (index: number) => {
    setFaqs((prev) =>
      prev
        .filter((_, idx) => idx !== index)
        .map((item, idx) => ({ ...item, sortOrder: idx }))
    );
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg("Program Title is required.");
      return;
    }
    setErrorMsg(null);

    // Validate FAQs
    for (let i = 0; i < faqs.length; i++) {
      const item = faqs[i];
      if (!item) continue;
      const q = item.question.trim();
      const a = item.answer.trim();
      if (!q && !a) {
        setErrorMsg(
          `FAQ Item #${i + 1} has an empty question and answer. Please complete it or remove it.`
        );
        return;
      }
      if (!q) {
        setErrorMsg(`FAQ Item #${i + 1} is missing a question.`);
        return;
      }
      if (!a) {
        setErrorMsg(`FAQ Item #${i + 1} is missing an answer.`);
        return;
      }
    }

    const cleanedFaqs = faqs.map((f, idx) => ({
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
      level,
      price: programData?.price || 0,
      currency,
      priceUSD,
      priceAED,
      priceINR,
      earlyBirdPrice,
      earlyBirdCurrency,
      earlyBirdDeadline,
      hasCertificate,
      faqs: cleanedFaqs,
    });
  };

  return (
    <section className={styles.cardSurface}>
      {/* Screen 1 Header */}
      <div className={styles.cardHeaderArea}>
        <div style={{ marginBottom: "0.5rem" }}>
          <Link
            href="/programs"
            className={styles.backLink}
            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>Back to Programs</span>
          </Link>
        </div>

        <h2 className={styles.stepTitle}>
          {programData?.id ? "Edit Program Track" : "Create New Program Track"}
        </h2>
        <p className={styles.stepSubtitle}>
          Set up your program with basic information. You can add curriculum, pricing, and publish later.
        </p>
      </div>

      {errorMsg && (
        <div
          role="alert"
          style={{
            background: "#fef2f2",
            border: "1px solid #fecdd3",
            color: "#991b1b",
            padding: "12px 16px",
            borderRadius: 12,
            fontSize: "0.88rem",
            marginBottom: "1.5rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* 2-Column Layout (Left 65% Basic Information | Right 35% Cover Image) */}
        <div className={styles.studioBasicGrid}>
          {/* =========================================================
              Left Column (65%): Basic Information
              ========================================================= */}
          <div>
            <div className={styles.formSectionPanel} style={{ marginBottom: "1.5rem" }}>
              <h3 className={styles.sectionPanelTitle}>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#D97706"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
                <span>Basic Information</span>
              </h3>
              <p className={styles.sectionPanelSubtitle}>
                Primary identifiers and summary presented across learner catalog cards.
              </p>

              {/* Program Title */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  <span>
                    Program Title <span style={{ color: "#dc2626" }}>*</span>
                  </span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sigma 1 - Web Development"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={styles.formInput}
                />
              </div>

              {/* Short Description with Formatting Toolbar */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  <span>
                    Short Description <span style={{ color: "#dc2626" }}>*</span>
                  </span>
                </label>

                {/* Toolbar */}
                <div className={styles.editorToolbar}>
                  <button
                    type="button"
                    className={styles.editorToolbarBtn}
                    onClick={() => applyFormat("bold")}
                    title="Bold"
                    aria-label="Bold"
                  >
                    <strong>B</strong>
                  </button>
                  <button
                    type="button"
                    className={styles.editorToolbarBtn}
                    onClick={() => applyFormat("italic")}
                    title="Italic"
                    aria-label="Italic"
                  >
                    <em>I</em>
                  </button>
                  <button
                    type="button"
                    className={styles.editorToolbarBtn}
                    onClick={() => applyFormat("underline")}
                    title="Underline"
                    aria-label="Underline"
                  >
                    <u>U</u>
                  </button>
                  <div className={styles.editorToolbarSep} />
                  <button
                    type="button"
                    className={styles.editorToolbarBtn}
                    onClick={() => applyFormat("bullet")}
                    title="Bullet List"
                    aria-label="Bullet List"
                  >
                    • List
                  </button>
                  <button
                    type="button"
                    className={styles.editorToolbarBtn}
                    onClick={() => applyFormat("number")}
                    title="Numbered List"
                    aria-label="Numbered List"
                  >
                    1. List
                  </button>
                  <div className={styles.editorToolbarSep} />
                  <button
                    type="button"
                    className={styles.editorToolbarBtn}
                    onClick={() => applyFormat("link")}
                    title="Add Link"
                    aria-label="Add Link"
                  >
                    🔗 Link
                  </button>
                  <button
                    type="button"
                    className={styles.editorToolbarBtn}
                    onClick={() => applyFormat("code")}
                    title="Code"
                    aria-label="Code"
                  >
                    &lt;/&gt;
                  </button>
                </div>

                <textarea
                  ref={textareaRef}
                  required
                  rows={4}
                  placeholder="A short overview of the program, target outcomes, and core curriculum highlights..."
                  value={shortDescription}
                  onChange={(e) => setShortDescription(e.target.value)}
                  className={styles.editorTextarea}
                />
              </div>

              {/* 2-Column Row: Category | Skill Level */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "1rem",
                  marginTop: "1.25rem",
                }}
              >
                <div>
                  <label className={styles.formLabel}>
                    Category <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <CustomSelect
                    value={category}
                    onChange={setCategory}
                    fullWidth
                    ariaLabel="Select Category"
                    options={[
                      { value: "Leadership & Mindset", label: "Leadership & Mindset" },
                      { value: "Web Development", label: "Web Development" },
                      { value: "UI/UX & Product Design", label: "UI/UX & Product Design" },
                      { value: "Business Strategy", label: "Business Strategy" },
                      { value: "Personal Growth", label: "Personal Growth" },
                    ]}
                  />
                </div>

                <div>
                  <label className={styles.formLabel}>Skill Level</label>
                  <CustomSelect
                    value={level}
                    onChange={setLevel}
                    fullWidth
                    ariaLabel="Select Skill Level"
                    options={[
                      { value: "Beginner", label: "Beginner" },
                      { value: "Intermediate", label: "Intermediate" },
                      { value: "Advanced", label: "Advanced" },
                    ]}
                  />
                </div>
              </div>
            </div>

            {/* Collapsible Course FAQs Repeater */}
            <div className={styles.formSectionPanel}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                }}
                onClick={() => setIsFaqsExpanded((prev) => !prev)}
              >
                <div>
                  <h3 className={styles.sectionPanelTitle} style={{ margin: 0 }}>
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#D97706"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <span>Course FAQs ({faqs.length})</span>
                  </h3>
                  <p className={styles.sectionPanelSubtitle} style={{ margin: "2px 0 0" }}>
                    Frequently asked questions displayed in the public course accordion.
                  </p>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <button
                    type="button"
                    className={styles.secondaryActionBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddFaq();
                    }}
                    style={{ fontSize: "0.82rem", height: 32 }}
                  >
                    + Add FAQ
                  </button>
                  <span style={{ color: "#78716a", fontSize: "0.85rem" }}>
                    {isFaqsExpanded ? "▲" : "▼"}
                  </span>
                </div>
              </div>

              {isFaqsExpanded && (
                <div style={{ marginTop: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {faqs.length === 0 ? (
                    <div
                      style={{
                        padding: "1.5rem",
                        textAlign: "center",
                        background: "#faf7f2",
                        borderRadius: 10,
                        border: "1px dashed #ece6dd",
                        color: "#78716a",
                        fontSize: "0.88rem",
                      }}
                    >
                      No FAQs added yet. Click &ldquo;+ Add FAQ&rdquo; to address common learner questions.
                    </div>
                  ) : (
                    faqs.map((faq, idx) => (
                      <div
                        key={faq.id}
                        style={{
                          background: "#ffffff",
                          border: "1px solid #ece6dd",
                          borderRadius: 10,
                          padding: "1rem",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: "0.6rem",
                          }}
                        >
                          <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#d97706" }}>
                            Question #{idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteFaq(idx)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "#dc2626",
                              fontSize: "0.78rem",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Remove
                          </button>
                        </div>

                        <input
                          type="text"
                          placeholder="e.g. Do I get lifetime access to all course recordings?"
                          value={faq.question}
                          onChange={(e) => handleFaqChange(idx, "question", e.target.value)}
                          className={styles.formInput}
                          style={{ marginBottom: "0.6rem" }}
                        />

                        <textarea
                          rows={2}
                          placeholder="Answer details..."
                          value={faq.answer}
                          onChange={(e) => handleFaqChange(idx, "answer", e.target.value)}
                          className={styles.formTextarea}
                          style={{ minHeight: 70 }}
                        />
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* =========================================================
              Right Column (35%): Program Cover Image
              ========================================================= */}
          <div>
            <div className={styles.coverDropzoneCard}>
              <h3 className={styles.sectionPanelTitle} style={{ fontSize: "0.95rem", marginBottom: "0.25rem" }}>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#D97706"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span>Program Cover Image</span>
              </h3>
              <p className={styles.sectionPanelSubtitle} style={{ marginBottom: "0.75rem" }}>
                16:9 banner thumbnail displayed across catalogs and learner dashboards.
              </p>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png, image/jpeg, image/webp"
                style={{ display: "none" }}
                onChange={handleImageUpload}
              />

              {/* Dropzone Card */}
              <div
                className={styles.dropzoneArea}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    fileInputRef.current?.click();
                  }
                }}
              >
                {thumbnailUrl ? (
                  <>
                    <Image
                      src={thumbnailUrl}
                      alt="Program Cover Preview"
                      fill
                      style={{ objectFit: "cover" }}
                      unoptimized={!thumbnailUrl.startsWith("/")}
                    />
                    <div className={styles.coverOverlay}>
                      <span>Click to Change Image</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className={styles.uploadIconWrap}>
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    </div>
                    <span className={styles.uploadTitle}>
                      {isUploadingImage ? "Uploading Image..." : "Upload program image"}
                    </span>
                    <span className={styles.uploadHint}>PNG, JPG (Max 5MB)</span>
                  </>
                )}
              </div>

              <div style={{ marginTop: "1rem", display: "flex", justifyContent: "center" }}>
                <button
                  type="button"
                  className={styles.secondaryActionBtn}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingImage}
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  {isUploadingImage ? "Uploading..." : thumbnailUrl ? "Change Image" : "Choose Image"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar: Cancel on Left, Warm-Orange Save & Continue on Right */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: "2.5rem",
            paddingTop: "1.5rem",
            borderTop: "1px solid #ece6dd",
          }}
        >
          {onCancel ? (
            <button
              type="button"
              className={styles.secondaryActionBtn}
              onClick={onCancel}
              disabled={isSaving}
            >
              Cancel
            </button>
          ) : (
            <Link
              href="/programs"
              className={styles.secondaryActionBtn}
              style={{ textDecoration: "none" }}
            >
              Cancel
            </Link>
          )}

          <button
            type="submit"
            className={styles.btnPrimary}
            disabled={isSaving}
          >
            {isSaving ? "Saving Details..." : "Save & Continue ->"}
          </button>
        </div>
      </form>
    </section>
  );
}
