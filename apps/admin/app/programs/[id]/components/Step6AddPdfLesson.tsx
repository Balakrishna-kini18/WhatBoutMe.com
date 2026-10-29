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
      setStatusMessage("Attaching PDF resource to module...");

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
        <h2 className={styles.stepTitle}>Add PDF Document</h2>
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
              <div className={styles.uploadCloudIcon} style={{ color: "var(--accent-primary)" }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
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

            {previewUrl && (
              <div style={{ marginTop: "0.85rem", display: "flex", gap: "8px" }}>
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
