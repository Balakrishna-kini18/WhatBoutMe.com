"use client";

import React, { useState } from "react";
import styles from "../curriculum.module.css";
import { API_URL, uploadFile, errorMessage, cachedFetch } from "../../../lib/api";
import { MediaPreviewModal, type MediaPreviewConfig } from "../../../components";

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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewConfig, setPreviewConfig] = useState<MediaPreviewConfig | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);
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
      setStatusMessage("Attaching PDF resource to step...");

      const res = await cachedFetch(`${API_URL}/programs/steps/${moduleId}/lessons`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: title.trim(),
          type: "PDF",
          mediaUrl,
          content: description.trim() || undefined,
          status: "PUBLISHED",
        }),
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to save PDF resource to step"));
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
      {/* Top Back Navigation */}
      <button
        type="button"
        onClick={onBackToChooser}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.45rem",
          color: "var(--text-muted, #78716a)",
          fontSize: "0.82rem",
          fontWeight: 600,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: "0.3rem 0",
          marginBottom: "0.75rem",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m15 18-6-6 6-6" />
        </svg>
        <span>Back to Lesson Types</span>
      </button>

      {/* Header */}
      <div className={styles.cardHeaderArea} style={{ marginBottom: "1.25rem" }}>
        <h2 className={styles.stepTitle}>Add PDF Document</h2>
      </div>

      {errorMsg && (
        <div
          role="alert"
          style={{
            background: "#fee2e2",
            border: "1px solid #f87171",
            color: "#991b1b",
            padding: "10px 14px",
            borderRadius: 8,
            fontSize: "0.85rem",
            marginBottom: "1.25rem",
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
            padding: "10px 14px",
            borderRadius: 8,
            fontSize: "0.85rem",
            marginBottom: "1.25rem",
          }}
        >
          {statusMessage}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className={styles.twoColLayout} style={{ gap: "2rem" }}>
          {/* Left Column: Dropzone */}
          <div>
            <label
              className={styles.uploadCardArea}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "2rem 1.5rem",
                borderRadius: 12,
                border: "2px dashed #ded6cb",
                background: selectedFile ? "#f0fdf4" : "#fdfbf7",
                cursor: "pointer",
                textAlign: "center",
                transition: "all 0.15s ease",
              }}
            >
              <div style={{ color: "#e11d48", marginBottom: "0.75rem" }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 0.35rem", color: "var(--text-primary, #14110f)" }}>
                {selectedFile ? selectedFile.name : "Upload PDF Document"}
              </h3>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted, #78716a)", margin: 0 }}>
                Drag and drop PDF file here (up to 50MB)
              </p>
              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
              <span
                style={{
                  display: "inline-block",
                  marginTop: "0.85rem",
                  padding: "0.45rem 1rem",
                  background: "#ffffff",
                  border: "1px solid #d4c8b8",
                  borderRadius: 8,
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  color: "var(--text-primary, #14110f)",
                }}
              >
                {selectedFile ? "Change PDF" : "Choose PDF File"}
              </span>
            </label>

            {previewUrl && (
              <div style={{ marginTop: "0.85rem" }}>
                <button
                  type="button"
                  onClick={() =>
                    setPreviewConfig({
                      isOpen: true,
                      type: "PDF",
                      title: title || selectedFile?.name || "PDF Document",
                      src: previewUrl,
                    })
                  }
                  style={{
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    color: "#b91c1c",
                    padding: "0.45rem 0.95rem",
                    borderRadius: 8,
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  <span>Preview Selected PDF</span>
                </button>
              </div>
            )}
          </div>

          {/* Right Column: Metadata */}
          <div>
            <div className={styles.formGroup} style={{ marginBottom: "1.25rem" }}>
              <label className={styles.formLabel}>
                <span>
                  Document Title <span style={{ color: "#dc2626" }}>*</span>
                </span>
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

            <div className={styles.formGroup} style={{ marginBottom: 0 }}>
              <label className={styles.formLabel}>
                <span>Description &amp; Reading Instructions (Optional)</span>
              </label>
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "2rem", paddingTop: "1.25rem", borderTop: "1px solid var(--border-light, #ece6dd)" }}>
          <button
            type="button"
            className={styles.secondaryActionBtn}
            onClick={onBackToChooser}
            disabled={isSaving}
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={isSaving}
            className={styles.btnPrimary}
            style={{ padding: "0.6rem 1.4rem" }}
          >
            {isSaving ? "Saving..." : "Save PDF Resource"}
          </button>
        </div>
      </form>

      {/* PDF Document Preview Modal */}
      <MediaPreviewModal
        config={previewConfig}
        onClose={() => setPreviewConfig(null)}
      />
    </section>
  );
}
