"use client";

import React, { useState } from "react";
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
        <div className={styles.stepEyebrow}>STEP 1: COURSE SETUP</div>
        <h2 className={styles.stepTitle}>Course Basic Details</h2>
        <p className={styles.stepSubtitle}>
          Enter the core title, cover imagery, category, and learner objectives for your curriculum.
        </p>
      </div>

      {errorMsg && (
        <div
          style={{
            background: "#fee2e2",
            border: "1px solid #f87171",
            color: "#991b1b",
            padding: "10px 16px",
            borderRadius: 10,
            fontSize: "0.88rem",
            marginBottom: "1.5rem",
          }}
        >
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className={styles.twoColLayout}>
          {/* Left Column: Form Fields */}
          <div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                Course Title <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Sigma Web Development Batch"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={styles.formInput}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                Short Description <span className={styles.formLabelOptional}>(Summary)</span>
              </label>
              <input
                type="text"
                placeholder="A concise summary of what this course offers..."
                value={shortDescription}
                onChange={(e) => setShortDescription(e.target.value)}
                className={styles.formInput}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Full Description &amp; Syllabus Overview</label>
              <textarea
                rows={5}
                placeholder="Write a detailed description and learning outcomes for the course..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={styles.formTextarea}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Price (INR)</label>
                <input
                  type="number"
                  min={0}
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                  className={styles.formInput}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Award Certificate</label>
                <div className={styles.switchToggleWrap} style={{ margin: "6px 0 0" }}>
                  <input
                    type="checkbox"
                    checked={hasCertificate}
                    onChange={(e) => setHasCertificate(e.target.checked)}
                    className={styles.switchInput}
                    id="hasCertificateToggle"
                  />
                  <label htmlFor="hasCertificateToggle" style={{ fontSize: "0.85rem", cursor: "pointer", fontWeight: 600 }}>
                    {hasCertificate ? "Yes, issue upon completion" : "No certificate"}
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Course Cover Image & Classification */}
          <div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Course Cover Image</label>
              <label className={styles.coverUploadBox}>
                {thumbnailUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumbnailUrl}
                      alt="Course Cover Preview"
                      className={styles.coverPreviewImg}
                      onError={() => setThumbnailUrl("")}
                    />
                    <div className={styles.coverOverlay}>Click to Replace Image</div>
                  </>
                ) : (
                  <>
                    <div className={styles.uploadCloudIcon}>☁</div>
                    <div className={styles.uploadTitle}>
                      {isUploadingImage ? "Uploading..." : "Click to upload"}
                    </div>
                    <div className={styles.uploadHint}>PNG, JPG or WEBP (16:9 recommended)</div>
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

            <div className={styles.formGroup}>
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

            <div className={styles.formGroup}>
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
        </div>

        {/* Action Controls */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem", marginTop: "2.5rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border-light)" }}>
          <button
            type="submit"
            disabled={isSaving}
            className={styles.btnPrimary}
          >
            {isSaving ? "Saving..." : "Save & Continue to Modules →"}
          </button>
        </div>
      </form>
    </section>
  );
}
