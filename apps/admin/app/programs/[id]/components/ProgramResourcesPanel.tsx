"use client";

import React, { useEffect, useState } from "react";
import styles from "../curriculum.module.css";
import { API_URL, uploadFile, cachedFetch } from "../../../lib/api";
import { MediaPreviewModal, HelpTooltip, type MediaPreviewConfig } from "../../../components";

interface ResourceItem {
  id: string;
  title: string;
  description: string | null;
  type: "WORKSHEET" | "READING" | "GUIDED_AUDIO" | "VIDEO";
  storageKey: string;
  mimeType: string;
  fileSizeBytes: number;
  programId: string | null;
  createdAt: string;
}

interface ProgramResourcesPanelProps {
  programId: string;
  programTitle: string;
}

export default function ProgramResourcesPanel({
  programId,
  programTitle,
}: ProgramResourcesPanelProps) {
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // New resource modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<"WORKSHEET" | "READING" | "GUIDED_AUDIO">("WORKSHEET");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Media Preview modal state
  const [previewConfig, setPreviewConfig] = useState<MediaPreviewConfig | null>(null);

  useEffect(() => {
    fetchProgramResources();
  }, [programId]);

  const fetchProgramResources = async () => {
    setIsLoading(true);
    try {
      const res = await cachedFetch(`${API_URL}/resources?programId=${programId}`, { skipCache: true });
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : data.data || [];
        setResources(items.filter((r: ResourceItem) => !r.programId || r.programId === programId));
      }
    } catch (e) {
      console.warn("Failed to load program resources", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !selectedFile) {
      setUploadError("Title and file are required.");
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const fileUrl = await uploadFile(selectedFile);
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

      const res = await fetch(`${API_URL}/resources`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title: newTitle.trim(),
          type: newType,
          storageKey: fileUrl,
          mimeType: selectedFile.type || "application/pdf",
          fileSizeBytes: selectedFile.size,
          programId,
          accessScope: "PROGRAM",
        }),
      });

      if (res.ok) {
        setIsAddModalOpen(false);
        setNewTitle("");
        setSelectedFile(null);
        fetchProgramResources();
      } else {
        const err = await res.json().catch(() => null);
        setUploadError(err?.message || "Failed to save resource.");
      }
    } catch (err: any) {
      setUploadError(err.message || "Failed to upload file.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteResource = async (id: string) => {
    if (!confirm("Are you sure you want to remove this resource from the program?")) return;
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      await fetch(`${API_URL}/resources/${id}`, {
        method: "DELETE",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      setResources((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (!bytes) return "0 KB";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <section className={styles.cardSurface}>
      {/* Header */}
      <div className={styles.cardHeaderArea}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div className={styles.stepEyebrow}>LEARNING MATERIALS &amp; WORKBOOKS</div>
            <h2 className={styles.stepTitle}>Resource Library</h2>
            <p className={styles.stepSubtitle}>
              Worksheets, reading guides, and audio practices for <strong>{programTitle}</strong>.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className={styles.btnPrimary}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>+ Add Resource</span>
            </button>
            <HelpTooltip text="Attached materials are accessible to all enrolled learners in this program. PDFs can be previewed directly in the browser." />
          </div>
        </div>
      </div>

      {/* Resource Items List */}
      {isLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 60, borderRadius: 10 }} />
          ))}
        </div>
      ) : resources.length === 0 ? (
        <div className={styles.emptyStateCard} style={{ padding: "3rem 1.5rem" }}>
          <div className={styles.emptyStateIcon}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <h3 className={styles.emptyStateTitle}>No resources added yet</h3>
          <p className={styles.emptyStateDesc}>
            Upload PDF workbooks, reflective journaling worksheets, or guided audio meditations for learners.
          </p>
          <button type="button" className={styles.btnPrimary} onClick={() => setIsAddModalOpen(true)}>
            + Add First Resource
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {resources.map((item) => {
            const isPdf = item.mimeType?.includes("pdf") || item.type === "WORKSHEET" || item.type === "READING";
            const isAudio = item.type === "GUIDED_AUDIO" || item.mimeType?.includes("audio");

            return (
              <div
                key={item.id}
                style={{
                  background: "#ffffff",
                  border: "1px solid #e7decb",
                  borderRadius: 10,
                  padding: "0.85rem 1.15rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "1rem",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flex: "1 1 280px" }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: isAudio ? "#faf5ff" : "#fef2f2",
                      color: isAudio ? "#7e22ce" : "#b91c1c",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {isAudio ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 18V5l12-2v13" />
                        <circle cx="6" cy="18" r="3" />
                        <circle cx="18" cy="16" r="3" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    )}
                  </div>

                  <div>
                    <strong style={{ fontSize: "0.9rem", color: "#14110f", display: "block" }}>
                      {item.title}
                    </strong>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.75rem", color: "#78716a", marginTop: 2 }}>
                      <span style={{ textTransform: "uppercase", fontWeight: 700 }}>{item.type}</span>
                      <span>•</span>
                      <span>{formatFileSize(item.fileSizeBytes)}</span>
                    </div>
                  </div>
                </div>

                {/* Actions: Instant Preview, Download, Delete */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {item.storageKey && (
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewConfig({
                          isOpen: true,
                          type: isAudio ? "VIDEO" : "PDF",
                          title: item.title,
                          src: item.storageKey,
                        })
                      }
                      style={{
                        background: "#eff6ff",
                        border: "1px solid #bfdbfe",
                        color: "#1d4ed8",
                        padding: "0.35rem 0.75rem",
                        borderRadius: 6,
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                      title="Preview in browser"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                      <span>Preview</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDeleteResource(item.id)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#dc2626",
                      cursor: "pointer",
                      padding: "0.35rem 0.5rem",
                      borderRadius: 6,
                    }}
                    title="Remove resource"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Resource Modal */}
      {isAddModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsAddModalOpen(false)}>
          <div className={styles.modalContent} style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>Add Program Material</h3>
              <button type="button" className={styles.closeBtn} onClick={() => setIsAddModalOpen(false)}>
                ×
              </button>
            </div>

            <form onSubmit={handleUploadResource}>
              <div className={styles.modalBody}>
                {uploadError && (
                  <div style={{ background: "#fee2e2", border: "1px solid #f87171", color: "#991b1b", padding: "8px 12px", borderRadius: 8, fontSize: "0.82rem", marginBottom: 12 }}>
                    {uploadError}
                  </div>
                )}

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Document / Resource Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Core Values Reflection Worksheet"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className={styles.formInput}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Resource Type</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as any)}
                    className={styles.formInput}
                  >
                    <option value="WORKSHEET">Worksheet (PDF)</option>
                    <option value="READING">Reading Article / Syllabus (PDF)</option>
                    <option value="GUIDED_AUDIO">Guided Audio Meditation</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Upload File *</label>
                  <input
                    type="file"
                    required
                    accept={newType === "GUIDED_AUDIO" ? "audio/*" : "application/pdf"}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setSelectedFile(file);
                        if (!newTitle.trim()) {
                          setNewTitle(file.name.replace(/\.[^/.]+$/, ""));
                        }
                      }
                    }}
                    className={styles.formInput}
                  />
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button type="button" className={styles.secondaryBtn} onClick={() => setIsAddModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={isUploading} className={styles.btnPrimary}>
                  {isUploading ? "Uploading..." : "Save Material"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      <MediaPreviewModal
        config={previewConfig}
        onClose={() => setPreviewConfig(null)}
      />
    </section>
  );
}
