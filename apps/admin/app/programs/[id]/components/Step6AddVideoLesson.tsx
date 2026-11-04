"use client";

import React, { useState, useRef, useEffect } from "react";
import styles from "../curriculum.module.css";
import { API_URL, uploadFile, errorMessage, resolveMediaUrl } from "../../../lib/api";
import { MediaPreviewModal, type MediaPreviewConfig } from "../../../components";

interface Step6AddVideoLessonProps {
  moduleTitle: string;
  moduleId: string;
  editingLesson?: any | null;
  onBackToChooser: () => void;
  onLessonSaved: () => void;
  onStartBackgroundUpload?: (task: {
    file?: File;
    videoUrl?: string;
    title: string;
    description?: string;
    durationSec?: number | null;
    moduleId: string;
    moduleTitle: string;
  }) => void;
}

export default function Step6AddVideoLesson({
  moduleTitle,
  moduleId,
  editingLesson,
  onBackToChooser,
  onLessonSaved,
}: Step6AddVideoLessonProps) {
  // Mode toggle: file upload vs external stream URL
  const [sourceMode, setSourceMode] = useState<"FILE" | "URL">(
    editingLesson?.mediaUrl && !editingLesson.mediaUrl.startsWith("upload:") && !editingLesson.mediaUrl.includes("cloudinary")
      ? "URL"
      : "FILE"
  );

  // Single video fields
  const [title, setTitle] = useState(editingLesson?.title || "");
  const [description, setDescription] = useState(editingLesson?.content || "");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoUrlInput, setVideoUrlInput] = useState(
    editingLesson?.mediaUrl && (editingLesson.mediaUrl.startsWith("http://") || editingLesson.mediaUrl.startsWith("https://"))
      ? editingLesson.mediaUrl
      : ""
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(editingLesson?.mediaUrl || null);
  const [durationSec, setDurationSec] = useState<number | null>(editingLesson?.durationSec || null);
  const [fileSizeFormatted, setFileSizeFormatted] = useState<string | null>(null);

  // Upload & UI status
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Media preview modal state
  const [previewConfig, setPreviewConfig] = useState<MediaPreviewConfig | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDuration = (sec: number | null) => {
    if (!sec) return "--:--";
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit: 250MB
    const maxBytes = 250 * 1024 * 1024;
    if (file.size > maxBytes) {
      setErrorMsg(
        `The selected file (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds the 250MB browser upload limit. For large 1GB-3GB videos, please switch to the "Direct Video URL" tab to stream directly from Vimeo, Cloudinary, or YouTube.`
      );
      return;
    }

    setErrorMsg(null);
    setSelectedFile(file);
    setFileSizeFormatted(formatFileSize(file.size));

    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);

    if (!title.trim()) {
      const cleanName = file.name.replace(/\.[^/.]+$/, "");
      setTitle(cleanName);
    }

    // Probe duration via hidden video element
    const tempVideo = document.createElement("video");
    tempVideo.preload = "metadata";
    tempVideo.src = localUrl;
    tempVideo.onloadedmetadata = () => {
      const dur = Math.round(tempVideo.duration || 0);
      setDurationSec(dur);
    };
  };

  const handleOpenPreview = () => {
    const rawUrl = previewUrl || videoUrlInput || editingLesson?.mediaUrl;
    if (!rawUrl) return;

    setPreviewConfig({
      isOpen: true,
      type: "VIDEO",
      title: title || selectedFile?.name || "Video Lesson Preview",
      src: resolveMediaUrl(rawUrl),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setErrorMsg("Lesson title is required.");
      return;
    }

    if (sourceMode === "URL" && !videoUrlInput.trim()) {
      setErrorMsg("Please enter a valid video streaming URL.");
      return;
    }

    if (sourceMode === "FILE" && !selectedFile && !previewUrl && !editingLesson?.mediaUrl) {
      setErrorMsg("Please choose a video file to upload.");
      return;
    }

    setIsUploading(true);
    setErrorMsg(null);

    try {
      let finalMediaUrl = sourceMode === "URL" ? videoUrlInput.trim() : (previewUrl || editingLesson?.mediaUrl || "");

      // If a new file is chosen in FILE mode, upload it with in-form progress
      if (sourceMode === "FILE" && selectedFile) {
        setUploadStatus("Uploading video asset (0%)...");
        setUploadProgress(5);

        finalMediaUrl = await uploadFile(selectedFile, (percent) => {
          setUploadProgress(Math.min(95, Math.max(5, percent)));
          setUploadStatus(`Uploading video asset (${percent}%)...`);
        });
        setUploadProgress(95);
        setUploadStatus("Attaching lesson to module...");
      }

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
            durationSec: durationSec || editingLesson.durationSec || 0,
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
            type: "VIDEO",
            mediaUrl: finalMediaUrl,
            durationSec: durationSec || 0,
            content: description.trim() || undefined,
            status: "PUBLISHED",
          }),
        });
      }

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to save video lesson"));
      }

      setUploadProgress(100);
      onLessonSaved();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to save video lesson.");
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
      setUploadStatus("");
    }
  };

  return (
    <section className={styles.cardSurface} style={{ padding: "1.25rem 1.5rem" }}>
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

      {/* Header with Title and Mode Toggle */}
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
              background: "#eff6ff",
              color: "#2563eb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </div>
          <div>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0, color: "var(--text-primary, #14110f)" }}>
              {editingLesson ? "Edit Video Lesson" : "Add Video Lesson"}
            </h2>
            <span style={{ fontSize: "0.76rem", color: "#78716a" }}>
              Target: {moduleTitle}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
          {/* Preview Button if media is available */}
          {(previewUrl || videoUrlInput) && (
            <button
              type="button"
              onClick={handleOpenPreview}
              style={{
                background: "#ffffff",
                border: "1px solid #bfdbfe",
                color: "#1d4ed8",
                padding: "0.35rem 0.85rem",
                borderRadius: 8,
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
              }}
              title="Preview Video in Full Screen"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span>Preview Video</span>
            </button>
          )}

          {/* Source Mode Toggle: Upload File vs Stream URL */}
          <div style={{ display: "inline-flex", background: "#f0ece3", padding: "3px", borderRadius: 8 }}>
            <button
              type="button"
              onClick={() => setSourceMode("FILE")}
              style={{
                padding: "0.35rem 0.85rem",
                borderRadius: 6,
                fontSize: "0.8rem",
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                background: sourceMode === "FILE" ? "#ffffff" : "transparent",
                color: sourceMode === "FILE" ? "#14110f" : "#78716a",
                boxShadow: sourceMode === "FILE" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              Upload Video File
            </button>
            <button
              type="button"
              onClick={() => setSourceMode("URL")}
              style={{
                padding: "0.35rem 0.85rem",
                borderRadius: 6,
                fontSize: "0.8rem",
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                background: sourceMode === "URL" ? "#ffffff" : "transparent",
                color: sourceMode === "URL" ? "#14110f" : "#78716a",
                boxShadow: sourceMode === "URL" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              Direct Video URL
            </button>
          </div>
        </div>
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
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            style={{ background: "none", border: "none", color: "#991b1b", cursor: "pointer", fontWeight: 700 }}
          >
            ×
          </button>
        </div>
      )}

      {/* In-form Progress Bar */}
      {uploadProgress !== null && (
        <div style={{ marginBottom: "1.25rem", padding: "10px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>
            <span>{uploadStatus}</span>
            <span>{uploadProgress}%</span>
          </div>
          <div style={{ width: "100%", height: 7, background: "#e2e8f0", borderRadius: 9999, overflow: "hidden" }}>
            <div
              style={{
                width: `${uploadProgress}%`,
                height: "100%",
                background: "var(--accent-primary, #c97a1e)",
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className={styles.twoColLayout} style={{ gap: "1.5rem", alignItems: "stretch" }}>
          {/* Left Column: Media Source */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {sourceMode === "FILE" ? (
              <div>
                {previewUrl ? (
                  /* Active Video Player View */
                  <div
                    style={{
                      borderRadius: 12,
                      overflow: "hidden",
                      border: selectedFile ? "2px solid #22c55e" : "1.5px solid #e7decb",
                      background: "#000000",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                    }}
                  >
                    <div style={{ position: "relative", width: "100%", background: "#000000", display: "flex", justifyContent: "center", alignItems: "center", minHeight: 200 }}>
                      <video
                        key={resolveMediaUrl(previewUrl)}
                        src={resolveMediaUrl(previewUrl)}
                        controls
                        playsInline
                        preload="metadata"
                        style={{
                          width: "100%",
                          maxHeight: 280,
                          display: "block",
                          objectFit: "contain",
                        }}
                      />
                    </div>

                    {/* Video Player Meta & Replace Controls */}
                    <div
                      style={{
                        padding: "0.85rem 1rem",
                        background: "#ffffff",
                        borderTop: "1px solid #ece6dd",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "0.75rem",
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        <span
                          style={{
                            fontSize: "0.85rem",
                            fontWeight: 700,
                            color: "#14110f",
                            maxWidth: 240,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {selectedFile ? selectedFile.name : (title || "Uploaded Video")}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.75rem", color: "#78716a" }}>
                          {durationSec !== null && (
                            <span>Duration: <strong style={{ color: "#d97706" }}>{formatDuration(durationSec)}</strong></span>
                          )}
                          {fileSizeFormatted && (
                            <span>&bull; Size: <strong>{fileSizeFormatted}</strong></span>
                          )}
                          {selectedFile && (
                            <span style={{ color: "#16a34a", fontWeight: 600 }}>&bull; Staged for update</span>
                          )}
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="video/mp4,video/webm,video/quicktime"
                          onChange={handleFileChange}
                          style={{ display: "none" }}
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            padding: "0.4rem 0.85rem",
                            borderRadius: 6,
                            border: "1px solid #d4c8b8",
                            background: "#faf8f5",
                            color: "#14110f",
                            fontSize: "0.78rem",
                            fontWeight: 600,
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                          title="Replace current video with another file"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                          </svg>
                          <span>{selectedFile ? "Change Selection" : "Replace Video"}</span>
                        </button>

                        {selectedFile && editingLesson?.mediaUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedFile(null);
                              setPreviewUrl(editingLesson.mediaUrl || null);
                              setDurationSec(editingLesson.durationSec || null);
                              setFileSizeFormatted(null);
                            }}
                            style={{
                              padding: "0.4rem 0.65rem",
                              borderRadius: 6,
                              border: "1px solid #fecaca",
                              background: "#fef2f2",
                              color: "#dc2626",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                            title="Cancel replacement and keep existing video"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Empty Upload Dropzone View (when no video uploaded yet) */
                  <label
                    className={styles.uploadCardArea}
                    style={{
                      border: "2px dashed #ded6cb",
                      background: "#fdfbf7",
                      cursor: "pointer",
                      padding: "1.75rem 1.25rem",
                      borderRadius: 12,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      textAlign: "center",
                      transition: "all 0.15s ease",
                      minHeight: 180,
                      justifyContent: "center",
                    }}
                  >
                    <div style={{ color: "var(--accent-primary, #c97a1e)", marginBottom: "0.5rem" }}>
                      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    </div>
                    <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "0 0 0.25rem", color: "var(--text-primary, #14110f)" }}>
                      Choose Video File (MP4, WebM)
                    </h3>
                    <p style={{ fontSize: "0.78rem", color: "var(--text-muted, #78716a)", margin: 0 }}>
                      Direct browser upload up to 250MB
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="video/mp4,video/webm,video/quicktime"
                      onChange={handleFileChange}
                      style={{ display: "none" }}
                    />
                    <span
                      style={{
                        display: "inline-block",
                        marginTop: "0.75rem",
                        padding: "0.45rem 1.1rem",
                        background: "#ffffff",
                        border: "1px solid #d4c8b8",
                        borderRadius: 6,
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        color: "var(--text-primary, #14110f)",
                      }}
                    >
                      Browse Video
                    </span>
                  </label>
                )}
              </div>
            ) : (
              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#14110f", marginBottom: "5px" }}>
                  Direct Video Streaming URL <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <input
                  type="url"
                  required={sourceMode === "URL"}
                  placeholder="https://player.vimeo.com/... or https://res.cloudinary.com/..."
                  value={videoUrlInput}
                  onChange={(e) => {
                    setVideoUrlInput(e.target.value);
                    setPreviewUrl(e.target.value);
                  }}
                  className={styles.formInput}
                  style={{ width: "100%", padding: "0.65rem 0.85rem", borderRadius: 8 }}
                />
                <p style={{ fontSize: "0.76rem", color: "#78716a", margin: "6px 0 0" }}>
                  Supports HLS (.m3u8), Cloudinary, Vimeo Pro, Wistia, YouTube unlisted, or any direct MP4 link.
                </p>

                {videoUrlInput.trim() && (
                  <div
                    style={{
                      marginTop: "1rem",
                      borderRadius: 12,
                      overflow: "hidden",
                      border: "1.5px solid #e7decb",
                      background: "#000000",
                    }}
                  >
                    <video
                      key={resolveMediaUrl(videoUrlInput.trim())}
                      src={resolveMediaUrl(videoUrlInput.trim())}
                      controls
                      playsInline
                      preload="metadata"
                      style={{
                        width: "100%",
                        maxHeight: 260,
                        display: "block",
                        objectFit: "contain",
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Metadata */}
          <div>
            <div className={styles.formGroup} style={{ marginBottom: "1rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.82rem", fontWeight: 700, color: "#14110f", marginBottom: "5px" }}>
                <span>Lesson Title</span>
                <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Introduction &amp; Foundations"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={styles.formInput}
                style={{ width: "100%", padding: "0.65rem 0.85rem", borderRadius: 8 }}
              />
            </div>

            <div className={styles.formGroup} style={{ marginBottom: 0 }}>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#14110f", marginBottom: "5px" }}>
                Lesson Content / Study Notes (Optional)
              </label>
              <textarea
                rows={4}
                placeholder="Key takeaways, reading notes, or timestamps..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={styles.formTextarea}
                style={{ minHeight: 110, width: "100%", padding: "0.65rem 0.85rem", borderRadius: 8 }}
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
            disabled={isUploading}
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={isUploading}
            className={styles.btnPrimary}
            style={{ padding: "0.55rem 1.35rem", display: "inline-flex", alignItems: "center", gap: "8px" }}
          >
            {isUploading ? (
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
                <span>Saving Video Lesson...</span>
              </>
            ) : (
              <span>{editingLesson ? "Save Changes" : "Save Video Lesson"}</span>
            )}
          </button>
        </div>
      </form>

      {/* Video Preview Modal */}
      <MediaPreviewModal
        config={previewConfig}
        onClose={() => setPreviewConfig(null)}
      />
    </section>
  );
}
