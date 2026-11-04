"use client";

import React, { useState } from "react";
import styles from "../curriculum.module.css";
import { API_URL, uploadFile, errorMessage, cachedFetch } from "../../../lib/api";
import { MediaPreviewModal, type MediaPreviewConfig } from "../../../components";

interface Step6AddPdfLessonProps {
  moduleTitle: string;
  moduleId: string;
  editingLesson?: any | null;
  onBackToChooser: () => void;
  onLessonSaved: () => void;
}

export default function Step6AddPdfLesson({
  moduleTitle,
  moduleId,
  editingLesson,
  onBackToChooser,
  onLessonSaved,
}: Step6AddPdfLessonProps) {
  const [title, setTitle] = useState(editingLesson?.title || "");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(editingLesson?.mediaUrl || null);
  const [description, setDescription] = useState(editingLesson?.content || "");
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewConfig, setPreviewConfig] = useState<MediaPreviewConfig | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      setErrorMsg(`Document size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds the 50 MB limit. Please compress the PDF before uploading.`);
      return;
    }

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
    if (!selectedFile && !previewUrl && !editingLesson?.mediaUrl) {
      setErrorMsg("Please choose a PDF file to upload.");
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);
    setStatusMessage(selectedFile ? "Uploading PDF document to cloud storage..." : "Saving changes...");

    try {
      let finalMediaUrl = previewUrl || editingLesson?.mediaUrl || "";
      if (selectedFile) {
        finalMediaUrl = await uploadFile(selectedFile);
      }

      setStatusMessage("Saving PDF resource to step...");

      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      let res: Response;

      if (editingLesson?.id) {
        // Edit existing lesson
        res = await fetch(`${API_URL}/programs/lessons/${editingLesson.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            title: title.trim(),
            content: description.trim() || null,
            ...(finalMediaUrl ? { mediaUrl: finalMediaUrl } : {}),
          }),
        });
      } else {
        // Create new lesson
        res = await fetch(`${API_URL}/programs/steps/${moduleId}/lessons`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            title: title.trim(),
            type: "PDF",
            mediaUrl: finalMediaUrl,
            content: description.trim() || undefined,
            status: "PUBLISHED",
          }),
        });
      }

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to save PDF resource"));
      }

      onLessonSaved();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to save PDF document.");
    } finally {
      setIsSaving(false);
      setStatusMessage("");
    }
  };

  return (
    <section className={styles.cardSurface} style={{ paddingBottom: "1.75rem" }}>
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
          padding: "0.2rem 0",
          marginBottom: "0.5rem",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m15 18-6-6 6-6" />
        </svg>
        <span>Back to Steps &amp; Lessons</span>
      </button>

      {/* Header with Title and Top Preview Action */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.75rem",
          marginBottom: "1.25rem",
          paddingBottom: "0.75rem",
          borderBottom: "1px solid #f0eae1",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "#fef2f2",
              color: "#dc2626",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <div>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0, color: "var(--text-primary, #14110f)" }}>
              {editingLesson ? "Edit PDF Document" : "Add PDF Document"}
            </h2>
            <span style={{ fontSize: "0.76rem", color: "#78716a" }}>
              Target: {moduleTitle}
            </span>
          </div>
        </div>

        {/* Top Preview Button */}
        {previewUrl && (
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
              background: "#ffffff",
              border: "1px solid #fecaca",
              color: "#b91c1c",
              padding: "0.4rem 0.85rem",
              borderRadius: 8,
              fontSize: "0.8rem",
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
              transition: "all 0.15s ease",
            }}
            title="Preview PDF Document in Full Screen"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span>Preview Selected PDF</span>
          </button>
        )}
      </div>

      {errorMsg && (
        <div
          role="alert"
          style={{
            background: "#fee2e2",
            border: "1px solid #f87171",
            color: "#991b1b",
            padding: "8px 12px",
            borderRadius: 8,
            fontSize: "0.85rem",
            marginBottom: "1rem",
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
            padding: "8px 12px",
            borderRadius: 8,
            fontSize: "0.85rem",
            marginBottom: "1rem",
          }}
        >
          {statusMessage}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className={styles.twoColLayout} style={{ gap: "1.5rem", alignItems: "stretch" }}>
          {/* Left Column: Dropzone */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <label
              className={styles.uploadCardArea}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "1.5rem 1.25rem",
                borderRadius: 12,
                border: "2px dashed #ded6cb",
                background: selectedFile ? "#f0fdf4" : "#fdfbf7",
                cursor: "pointer",
                textAlign: "center",
                transition: "all 0.15s ease",
                flex: "1 1 auto",
                minHeight: 180,
              }}
            >
              <div style={{ color: "#e11d48", marginBottom: "0.5rem" }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
              <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "0 0 0.25rem", color: "var(--text-primary, #14110f)" }}>
                {selectedFile ? selectedFile.name : "Upload PDF Document"}
              </h3>
              <p style={{ fontSize: "0.78rem", color: "var(--text-muted, #78716a)", margin: 0 }}>
                Drag and drop PDF file here (up to 100MB)
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
                  marginTop: "0.65rem",
                  padding: "0.4rem 0.9rem",
                  background: "#ffffff",
                  border: "1px solid #d4c8b8",
                  borderRadius: 6,
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: "var(--text-primary, #14110f)",
                }}
              >
                {selectedFile ? "Change PDF" : "Choose PDF File"}
              </span>
            </label>

            
          </div>

          {/* Right Column: Metadata */}
          <div>
            <div className={styles.formGroup} style={{ marginBottom: "1rem" }}>
              <label className={styles.formLabel}>
                <span>
                  Document Title <span style={{ color: "#dc2626" }}>*</span>
                </span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Masterclass Lecture Summary &amp; Notes"
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
                style={{ minHeight: 90 }}
              />
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1.5rem", paddingTop: "1rem", borderTop: "1px solid var(--border-light, #ece6dd)" }}>
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
            style={{ padding: "0.55rem 1.35rem", display: "inline-flex", alignItems: "center", gap: "8px" }}
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
                <span>Saving PDF...</span>
              </>
            ) : (
              <span>{editingLesson ? "Save Changes" : "Save PDF Resource"}</span>
            )}
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
