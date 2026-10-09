"use client";

import React, { useState } from "react";
import styles from "../curriculum.module.css";
import { API_URL, uploadFile, errorMessage } from "../../../lib/api";

interface Step6AddPdfLessonProps {
  moduleTitle: string;
  moduleId: string;
  onBackToChooser: () => void;
  onLessonSaved: () => void;
}

export default function Step6AddPdfLesson({
  moduleTitle,
  moduleId,
  onBackToChooser,
  onLessonSaved,
}: Step6AddPdfLessonProps) {
  const [title, setTitle] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    if (!title.trim()) {
      setTitle(file.name.replace(/\.pdf$/i, ""));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg("Document title is required.");
      return;
    }
    if (!selectedFile) {
      setErrorMsg("Please choose a PDF file to upload.");
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);
    setStatusMessage("Uploading PDF document to cloud storage...");

    try {
      const mediaUrl = await uploadFile(selectedFile);
      setStatusMessage("Attaching PDF resource to module...");

      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_URL}/programs/steps/${moduleId}/lessons`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title: title.trim(),
          type: "PDF",
          mediaUrl,
          content: description.trim() || undefined,
        }),
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to save PDF resource to module"));
      }

      onLessonSaved();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to upload PDF document.");
    } finally {
      setIsSaving(false);
      setStatusMessage("");
    }
  };

  return (
    <section className={styles.cardSurface}>
      {/* Header */}
      <div className={styles.cardHeaderArea}>
        <div className={styles.stepEyebrow}>STEP 6: ADD STUDY MATERIAL</div>
        <h2 className={styles.stepTitle}>PDF Document Details</h2>
        <p className={styles.stepSubtitle}>
          Attach downloadable slide decks, cheat sheets, or reference guides to <strong>{moduleTitle}</strong>.
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

      {statusMessage && (
        <div
          style={{
            background: "#fef3c7",
            border: "1px solid #fde68a",
            color: "#92400e",
            padding: "10px 16px",
            borderRadius: 10,
            fontSize: "0.88rem",
            marginBottom: "1.5rem",
          }}
        >
          {statusMessage}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className={styles.twoColLayout}>
          {/* Left Column: Dropzone */}
          <div>
            <label className={styles.uploadCardArea}>
              <div className={styles.uploadCloudIcon} style={{ color: "#d97706" }}>📄</div>
              <h3 className={styles.uploadTitle}>
                {selectedFile ? selectedFile.name : "Upload PDF Document"}
              </h3>
              <p className={styles.uploadHint}>Drag and drop PDF file here (PDF format up to 50MB)</p>
              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
              <span
                style={{
                  display: "inline-block",
                  marginTop: "0.75rem",
                  padding: "0.45rem 1rem",
                  background: "#ffffff",
                  border: "1px solid var(--border-light)",
                  borderRadius: 8,
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  color: "var(--accent-primary)",
                }}
              >
                {selectedFile ? "Change PDF" : "Choose PDF File"}
              </span>
            </label>
          </div>

          {/* Right Column: Metadata */}
          <div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                Document Title <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Masterclass Lecture Summary & Notes"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={styles.formInput}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Description &amp; Reading Instructions</label>
              <textarea
                rows={4}
                placeholder="Brief instructions on how learners should use this reference guide..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={styles.formTextarea}
              />
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "2.5rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border-light)" }}>
          <button
            type="button"
            className={styles.btnBack}
            onClick={onBackToChooser}
            disabled={isSaving}
          >
            &larr; Back
          </button>

          <button
            type="submit"
            disabled={isSaving}
            className={styles.btnPrimary}
          >
            {isSaving ? "Saving..." : "Save PDF Resource ✓"}
          </button>
        </div>
      </form>
    </section>
  );
}
