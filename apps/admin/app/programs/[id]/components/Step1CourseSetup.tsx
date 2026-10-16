"use client";

import React, { useState } from "react";
import Image from "next/image";
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
    hasCertificate?: boolean;
  }) => Promise<void>;
  isSaving: boolean;
}

export default function Step1CourseSetup({
  programData,
  onSaveAndContinue,
  isSaving,
}: Step1CourseSetupProps) {
  const courseInfo = parseCourseInfo(programData?.description);
  const rawInitialThumb = programData?.thumbnailUrl || courseInfo.image || "";
  const initialThumb =
    rawInitialThumb.startsWith("http://") || rawInitialThumb.startsWith("https://") || rawInitialThumb.startsWith("/")
      ? rawInitialThumb
      : rawInitialThumb ? `/${rawInitialThumb}` : "";

  const [title, setTitle] = useState(programData?.title || "");
  const [description, setDescription] = useState(programData?.description || "");
  const [shortDescription, setShortDescription] = useState(
    programData?.shortDescription || courseInfo.summary?.slice(0, 120) || programData?.description?.slice(0, 120) || ""
  );
  const [thumbnailUrl, setThumbnailUrl] = useState(initialThumb);
  const [category, setCategory] = useState(programData?.category || courseInfo.type || "Leadership & Mindset");
  const [level, setLevel] = useState(programData?.level || "Beginner");
  const [price, setPrice] = useState<number>(programData?.price ?? 1999);
  const [hasCertificate, setHasCertificate] = useState(programData?.hasCertificate ?? true);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    try {
      const url = await uploadFile(file);
      setThumbnailUrl(url);
    } catch (err: any) {
      console.warn("Could not upload cover image", err);
      // Fallback to local object URL for preview
      const localUrl = URL.createObjectURL(file);
      setThumbnailUrl(localUrl);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg("Course Title is required.");
      return;
    }
    setErrorMsg(null);

    await onSaveAndContinue({
      title: title.trim(),
      description: description.trim(),
      shortDescription: shortDescription.trim(),
      thumbnailUrl,
      category,
      level,
      price: Number(price) || 0,
      hasCertificate,
    });
  };

  return (
    <section className={styles.cardSurface}>
      {/* Header */}
      <div className={styles.cardHeaderArea}>
        <div className={styles.stepEyebrow}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span>STEP 1: COURSE SETUP</span>
        </div>
        <h2 className={styles.stepTitle}>Course Basic Details</h2>
        <p className={styles.stepSubtitle}>
          Enter the core title, cover imagery, classification, and credentials for your curriculum track.
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
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className={styles.twoColLayout}>
          {/* =========================================================
              Left Column: Form Fields
              ========================================================= */}
          <div>
            {/* Panel 1: General Course Info */}
            <div className={styles.formSectionPanel}>
              <h3 className={styles.sectionPanelTitle}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary, #c97a1e)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
                <span>General Course Information</span>
              </h3>
              <p className={styles.sectionPanelSubtitle}>
                Primary identifiers displayed across learner portals, searches, and enrollment catalogues.
              </p>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  <span>
                    Course Title <span style={{ color: "#dc2626" }}>*</span>
                  </span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. One-Day Corporate Workshop"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={styles.formInput}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.35rem" }}>
                <div>
                  <label className={styles.formLabel}>Category</label>
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
                      { value: "All Levels", label: "All Levels" },
                    ]}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  <span>Short Description</span>
                  <span className={styles.formLabelOptional}>{shortDescription.length}/140 chars</span>
                </label>
                <input
                  type="text"
                  placeholder="A concise summary of what this curriculum delivers..."
                  value={shortDescription}
                  onChange={(e) => setShortDescription(e.target.value)}
                  className={styles.formInput}
                  maxLength={160}
                />
                <p className={styles.formHelperText}>
                  Shown on course cards and catalog listings. Keep it punchy and engaging.
                </p>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  <span>Full Description &amp; Syllabus Overview</span>
                </label>
                <textarea
                  rows={5}
                  placeholder="Detail the curriculum structure, prerequisites, takeaways, and outcomes..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={styles.formTextarea}
                />
              </div>
            </div>

            {/* Panel 2: Pricing & Credentials */}
            <div className={styles.formSectionPanel}>
              <h3 className={styles.sectionPanelTitle}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary, #c97a1e)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="8" r="7" />
                  <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
                </svg>
                <span>Pricing &amp; Certification</span>
              </h3>
              <p className={styles.sectionPanelSubtitle}>
                Configure learner enrollment fees and accredited completion certificates.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.25rem" }}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Course Tuition (INR)</label>
                  <div className={styles.priceInputWrap}>
                    <span className={styles.currencyPrefix}>₹</span>
                    <input
                      type="number"
                      min={0}
                      value={price}
                      onChange={(e) => setPrice(Number(e.target.value))}
                      className={`${styles.formInput} ${styles.priceInput}`}
                      placeholder="1999"
                    />
                  </div>
                  <p className={styles.formHelperText}>
                    Set to 0 for complimentary community courses or onboarding workshops.
                  </p>
                </div>

                {/* Certificate Award Card */}
                <div
                  className={`${styles.certCard} ${hasCertificate ? styles.certCardActive : ""}`}
                  onClick={() => setHasCertificate(!hasCertificate)}
                  role="checkbox"
                  aria-checked={hasCertificate}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") {
                      e.preventDefault();
                      setHasCertificate(!hasCertificate);
                    }
                  }}
                >
                  <div className={styles.certCardLeft}>
                    <div className={styles.certIconBox}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="8" r="6" />
                        <path d="M15.4 13.8L18 22l-6-3-6 3 2.6-8.2" />
                      </svg>
                    </div>
                    <div className={styles.certTextCol}>
                      <span className={styles.certTitle}>Official Completion Certificate</span>
                      <span className={styles.certDesc}>
                        Automatically issues an accredited PDF certificate upon 100% curriculum completion.
                      </span>
                    </div>
                  </div>

                  <div className={styles.toggleSwitch}>
                    <input
                      type="checkbox"
                      checked={hasCertificate}
                      onChange={(e) => setHasCertificate(e.target.checked)}
                      tabIndex={-1}
                      aria-hidden="true"
                    />
                    <span className={styles.toggleSlider}></span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* =========================================================
              Right Column: Media & Live Card Preview
              ========================================================= */}
          <div className={styles.stickySidebar}>
            {/* 1. Cover Image Upload Box */}
            <div className={styles.sidebarCard}>
              <div className={styles.sidebarCardHeader}>
                <h4 className={styles.sidebarCardTitle}>Course Cover Image</h4>
                <span className={styles.sidebarBadge}>16:9 Ratio</span>
              </div>

              <label className={styles.coverUploadBox}>
                {thumbnailUrl ? (
                  <>
                    <Image
                      src={thumbnailUrl}
                      alt="Course Cover Preview"
                      width={320}
                      height={180}
                      quality={80}
                      loading="lazy"
                      unoptimized={!thumbnailUrl.startsWith("/")}
                      className={styles.coverPreviewImg}
                      onError={() => setThumbnailUrl("")}
                    />
                    <div className={styles.coverOverlay}>
                      <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>Cover Image Selected</span>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <span className={styles.coverActionBtn}>Change Image</span>
                        <button
                          type="button"
                          className={styles.coverActionBtn}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setThumbnailUrl("");
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className={styles.uploadIconWrap}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    </div>
                    <div className={styles.uploadTitle}>
                      {isUploadingImage ? "Uploading..." : "Click or drag to upload"}
                    </div>
                    <div className={styles.uploadHint}>PNG, JPG or WebP (max 5MB)</div>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  style={{ display: "none" }}
                />
              </label>
            </div>

            {/* 2. Live Student Catalog Preview */}
            <div className={styles.livePreviewWrap}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted, #78716a)" }}>
                  Learner Catalog Preview
                </span>
                <span className={styles.liveBadgePulse}>
                  <span className={styles.pulseDot}></span>
                  <span>Live</span>
                </span>
              </div>

              <div className={styles.mockCourseCard}>
                <div className={styles.mockCoverWrap}>
                  {thumbnailUrl ? (
                    <Image
                      src={thumbnailUrl}
                      alt="Catalog preview"
                      width={280}
                      height={150}
                      quality={80}
                      loading="lazy"
                      unoptimized={!thumbnailUrl.startsWith("/")}
                      className={styles.mockCoverImg}
                    />
                  ) : (
                    <div className={styles.mockCoverFallback}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: "6px" }} aria-hidden="true">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                      </svg>
                      <span>{title || "Course Cover"}</span>
                    </div>
                  )}
                </div>

                <div className={styles.mockCardBody}>
                  <div className={styles.mockTagRow}>
                    <span className={styles.mockCategoryPill}>{category}</span>
                    <span className={styles.mockLevelPill}>{level}</span>
                  </div>

                  <h5 className={styles.mockTitle}>
                    {title || "Course Title"}
                  </h5>

                  <p className={styles.mockSummary}>
                    {shortDescription || description?.slice(0, 100) || "No summary provided yet."}
                  </p>

                  <div className={styles.mockFooter}>
                    <span className={styles.mockPrice}>
                      {price > 0 ? `₹${price.toLocaleString("en-IN")}` : "Free"}
                    </span>
                    {hasCertificate && (
                      <span className={styles.mockCertTag}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span>Certificate</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Action Box */}
            <div className={styles.sidebarCard}>
              <button
                type="submit"
                disabled={isSaving}
                className={styles.btnPrimary}
              >
                {isSaving ? (
                  <span>Saving Changes...</span>
                ) : (
                  <>
                    <span>Save &amp; Continue to Modules</span>
                    <span aria-hidden="true">&rarr;</span>
                  </>
                )}
              </button>
              <div style={{ textAlign: "center", marginTop: "0.75rem", fontSize: "0.75rem", color: "var(--text-muted, #78716a)" }}>
                Changes are automatically synced to the cloud.
              </div>
            </div>
          </div>
        </div>
      </form>
    </section>
  );
}
