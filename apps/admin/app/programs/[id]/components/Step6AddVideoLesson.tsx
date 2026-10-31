"use client";

import React, { useState, useRef } from "react";
import styles from "../curriculum.module.css";
import { API_URL, uploadFile, errorMessage, cachedFetch } from "../../../lib/api";
import { MediaPreviewModal, HelpTooltip, type MediaPreviewConfig } from "../../../components";

interface QueuedVideo {
  id: string;
  file: File;
  title: string;
  description: string;
  previewUrl: string;
  durationSec: number | null;
  sizeFormatted: string;
}

interface Step6AddVideoLessonProps {
  moduleTitle: string;
  moduleId: string;
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
  onBackToChooser,
  onLessonSaved,
  onStartBackgroundUpload,
}: Step6AddVideoLessonProps) {
  // Single or multiple video queue
  const [videoQueue, setVideoQueue] = useState<QueuedVideo[]>([]);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);

  // Single video direct URL mode
  const [videoUrlInput, setVideoUrlInput] = useState("");
  const [singleTitle, setSingleTitle] = useState("");
  const [singleDescription, setSingleDescription] = useState("");
  const [isFreePreview, setIsFreePreview] = useState(false);

  // Upload & UI status
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

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

  // Handle multi-file selection
  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newQueueItems: QueuedVideo[] = [];

    Array.from(files).forEach((file, index) => {
      const localUrl = URL.createObjectURL(file);
      const cleanName = file.name.replace(/\.[^/.]+$/, "");
      const queueId = `vid-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 6)}`;

      // Probe duration asynchronously via hidden video element
      const tempVideo = document.createElement("video");
      tempVideo.preload = "metadata";
      tempVideo.src = localUrl;
      tempVideo.onloadedmetadata = () => {
        const dur = Math.round(tempVideo.duration || 0);
        setVideoQueue((prev) =>
          prev.map((item) => (item.id === queueId ? { ...item, durationSec: dur } : item))
        );
      };

      newQueueItems.push({
        id: queueId,
        file,
        title: cleanName,
        description: "",
        previewUrl: localUrl,
        durationSec: null,
        sizeFormatted: formatFileSize(file.size),
      });
    });

    setVideoQueue((prev) => [...prev, ...newQueueItems]);
    if (!activeVideoId && newQueueItems.length > 0) {
      setActiveVideoId(newQueueItems[0]?.id || null);
    }

    // Reset input value so same files can be chosen again if needed
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeQueueItem = (id: string) => {
    setVideoQueue((prev) => {
      const filtered = prev.filter((item) => item.id !== id);
      if (activeVideoId === id) {
        setActiveVideoId(filtered[0]?.id || null);
      }
      return filtered;
    });
  };

  const updateQueueItemTitle = (id: string, newTitle: string) => {
    setVideoQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, title: newTitle } : item))
    );
  };

  const updateQueueItemDescription = (id: string, newDesc: string) => {
    setVideoQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, description: newDesc } : item))
    );
  };

  // Preview video in modal
  const openVideoPreview = (title: string, src: string) => {
    setPreviewConfig({
      isOpen: true,
      type: "VIDEO",
      title,
      src,
    });
  };

  // Multi-video simultaneous background upload
  const handleUploadAllSimultaneously = () => {
    if (videoQueue.length === 0) {
      setErrorMsg("Please select at least one video file.");
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(
      `Dispatching ${videoQueue.length} video${videoQueue.length > 1 ? "s" : ""} to upload simultaneously in the background...`
    );

    // Concurrently trigger all background upload tasks
    videoQueue.forEach((item) => {
      onStartBackgroundUpload?.({
        file: item.file,
        title: item.title.trim() || item.file.name.replace(/\.[^/.]+$/, ""),
        description: item.description.trim(),
        durationSec: item.durationSec,
        moduleId,
        moduleTitle,
      });
    });

    // Clear queue and notify
    setTimeout(() => {
      setVideoQueue([]);
      onLessonSaved();
    }, 600);
  };

  // Single direct submit (synchronous / inline)
  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetItem = videoQueue[0];
    const finalTitle = targetItem ? targetItem.title.trim() : singleTitle.trim();
    const hasUrl = Boolean(videoUrlInput.trim());

    if (!finalTitle) {
      setErrorMsg("Lesson title is required.");
      return;
    }
    if (!targetItem && !hasUrl) {
      setErrorMsg("Please choose a video file or enter a direct video URL.");
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);

    try {
      let publicId = videoUrlInput.trim();
      let finalDuration = targetItem?.durationSec || null;
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

      if (targetItem?.file) {
        setUploadStatus("Uploading video asset...");
        setUploadProgress(15);

        let uploadedDirect = false;
        try {
          const sigRes = await fetch(`${API_URL}/media/upload-signature`, {
            method: "POST",
            headers: {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          });
          if (sigRes.ok) {
            const sigData = await sigRes.json();
            const formData = new FormData();
            formData.append("file", targetItem.file);
            formData.append("type", "authenticated");
            formData.append("signature", sigData.signature);
            formData.append("api_key", sigData.apiKey);
            formData.append("timestamp", sigData.timestamp);

            const xhr = new XMLHttpRequest();
            const uploadRes = await new Promise((resolve, reject) => {
              xhr.open("POST", sigData.uploadUrl);
              xhr.upload.onprogress = (ev) => {
                if (ev.lengthComputable) {
                  setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
                  setUploadStatus(`Uploading video (${Math.round((ev.loaded / ev.total) * 100)}%)...`);
                }
              };
              xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                  resolve(JSON.parse(xhr.responseText));
                } else {
                  reject(new Error("Video upload rejected by server"));
                }
              };
              xhr.onerror = () => reject(new Error("Network error during video upload"));
              xhr.send(formData);
            });

            publicId = (uploadRes as any).public_id;
            if ((uploadRes as any).duration) {
              finalDuration = Math.round((uploadRes as any).duration);
            }
            uploadedDirect = true;
          }
        } catch {
          // Cloudinary direct upload failed, fallback to server upload
        }

        if (!uploadedDirect) {
          setUploadStatus("Uploading video to server...");
          setUploadProgress(50);
          const uploadedUrl = await uploadFile(targetItem.file);
          publicId = uploadedUrl;
          setUploadProgress(100);
        }
      }

      setUploadStatus("Attaching video lesson to module...");

      const finalMediaUrl = videoUrlInput.trim()
        ? videoUrlInput.trim()
        : publicId
        ? (publicId.startsWith("http") || publicId.startsWith("/") ? publicId : `upload:${publicId}`)
        : (targetItem?.previewUrl && !targetItem.previewUrl.startsWith("blob:") ? targetItem.previewUrl : `upload:video-${Date.now()}`);

      const res = await cachedFetch(`${API_URL}/programs/steps/${moduleId}/lessons`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: finalTitle,
          type: "VIDEO",
          mediaUrl: finalMediaUrl,
          durationSec: finalDuration ?? 0,
          content: targetItem?.description?.trim() || singleDescription.trim() || undefined,
          status: "PUBLISHED",
        }),
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to save lesson to module"));
      }

      onLessonSaved();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to upload video lesson.");
    } finally {
      setIsSaving(false);
      setUploadProgress(null);
      setUploadStatus("");
    }
  };

  const activeItem = videoQueue.find((v) => v.id === activeVideoId) || videoQueue[0];

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
        <h2 className={styles.stepTitle}>Add Video Lesson</h2>
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
            marginBottom: "1.25rem",
          }}
        >
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div
          style={{
            background: "#ecfdf5",
            border: "1px solid #6ee7b7",
            color: "#065f46",
            padding: "10px 16px",
            borderRadius: 10,
            fontSize: "0.88rem",
            marginBottom: "1.25rem",
          }}
        >
          {successMsg}
        </div>
      )}

      {/* Progress Notification */}
      {uploadProgress !== null && (
        <div className={styles.progressBarContainer}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", fontWeight: 700 }}>
            <span>{uploadStatus}</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      )}

      {/* MULTI-FILE QUEUE DROPZONE */}
      <div style={{ marginBottom: "1.5rem" }}>
        <label
          className={styles.uploadCardArea}
          style={{
            border: videoQueue.length > 0 ? "2px dashed #c97a1e" : "2px dashed #e2e8f0",
            background: videoQueue.length > 0 ? "#fdfbf7" : "#fafafa",
            cursor: "pointer",
            padding: "2rem 1.5rem",
          }}
        >
          <div className={styles.uploadCloudIcon} style={{ color: "var(--accent-primary, #c97a1e)" }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <h3 className={styles.uploadTitle}>
            {videoQueue.length > 0
              ? `${videoQueue.length} Video${videoQueue.length > 1 ? "s" : ""} Selected in Queue`
              : "Select Videos (Multiple Files Allowed)"}
          </h3>
          <p className={styles.uploadHint}>
            Select 1, 2, 4 or more videos at once (MP4, MOV, WebM). All videos will upload simultaneously in parallel!
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            multiple
            onChange={handleFilesSelected}
            style={{ display: "none" }}
          />
          <span
            style={{
              display: "inline-block",
              marginTop: "0.75rem",
              padding: "0.5rem 1.25rem",
              background: "var(--accent-primary, #c97a1e)",
              color: "#ffffff",
              borderRadius: 8,
              fontSize: "0.85rem",
              fontWeight: 700,
              boxShadow: "0 2px 6px rgba(201, 122, 30, 0.25)",
            }}
          >
            {videoQueue.length > 0 ? "+ Add More Videos to Queue" : "Browse & Select Videos"}
          </span>
        </label>
      </div>

      {/* QUEUED VIDEOS LIST (IF MULTIPLE SELECTED) */}
      {videoQueue.length > 0 && (
        <div style={{ marginBottom: "2rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#14110f", margin: 0 }}>
              Staged Videos Queue ({videoQueue.length})
            </h3>
            <span style={{ fontSize: "0.78rem", color: "#78716a" }}>
              Total size: {formatFileSize(videoQueue.reduce((acc, v) => acc + v.file.size, 0))}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {videoQueue.map((item, index) => (
              <div
                key={item.id}
                style={{
                  background: activeVideoId === item.id ? "#fdf8f0" : "#ffffff",
                  border: activeVideoId === item.id ? "1.5px solid #d4a373" : "1px solid #e7decb",
                  borderRadius: 10,
                  padding: "0.85rem 1.15rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "1rem",
                  flexWrap: "wrap",
                  transition: "all 0.15s ease",
                }}
              >
                {/* Index & File details */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flex: "1 1 300px" }}>
                  <span
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      background: "#f0ece3",
                      color: "#78716a",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {index + 1}
                  </span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <input
                      type="text"
                      value={item.title}
                      onChange={(e) => updateQueueItemTitle(item.id, e.target.value)}
                      placeholder="Lesson title..."
                      style={{
                        width: "100%",
                        padding: "4px 8px",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        color: "#14110f",
                        borderRadius: 6,
                        border: "1px solid #d8cdbe",
                        boxSizing: "border-box",
                      }}
                    />
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px", fontSize: "0.75rem", color: "#78716a" }}>
                      <span>{item.file.name}</span>
                      <span>•</span>
                      <span>{item.sizeFormatted}</span>
                      <span>•</span>
                      <span>{formatDuration(item.durationSec)}</span>
                    </div>
                  </div>
                </div>

                {/* Video Actions: Preview & Remove */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => openVideoPreview(item.title, item.previewUrl)}
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
                      gap: "4px",
                    }}
                    title="Preview uploaded video in player"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    <span>Preview</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => removeQueueItem(item.id)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#ef4444",
                      padding: "0.35rem 0.5rem",
                      cursor: "pointer",
                      fontSize: "0.85rem",
                      borderRadius: 6,
                    }}
                    title="Remove from queue"
                  >
                    x
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* SIMULTANEOUS UPLOAD PRIMARY ACTION */}
          <div
            style={{
              marginTop: "1.25rem",
              padding: "1rem 1.25rem",
              background: "#faf6f0",
              border: "1px solid #ebd9c4",
              borderRadius: 12,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <div>
              <strong style={{ fontSize: "0.9rem", color: "#14110f", display: "block" }}>
                Ready to upload {videoQueue.length} video{videoQueue.length > 1 ? "s" : ""} simultaneously?
              </strong>
              <span style={{ fontSize: "0.78rem", color: "#78716a" }}>
                All videos will upload concurrently in the background. You don&apos;t have to wait for each one to finish.
              </span>
            </div>

            <button
              type="button"
              onClick={handleUploadAllSimultaneously}
              style={{
                background: "var(--accent-primary, #c97a1e)",
                color: "#ffffff",
                border: "none",
                padding: "0.65rem 1.35rem",
                borderRadius: 8,
                fontWeight: 700,
                fontSize: "0.88rem",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                boxShadow: "0 2px 8px rgba(201, 122, 30, 0.3)",
              }}
            >
              <span> Upload All {videoQueue.length} Videos Simultaneously in Background</span>
            </button>
          </div>
        </div>
      )}

      {/* SINGLE VIDEO DIRECT / URL OPTION (IF NO QUEUE) */}
      {videoQueue.length === 0 && (
        <form onSubmit={handleSingleSubmit}>
          <div className={styles.twoColLayout}>
            {/* Left: Direct URL input & Preview */}
            <div>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>
                  Direct Video / Cloudinary / S3 URL
                </label>
                <input
                  type="url"
                  value={videoUrlInput}
                  onChange={(e) => setVideoUrlInput(e.target.value)}
                  placeholder="https://res.cloudinary.com/... or https://..."
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-light)",
                    fontSize: "0.85rem",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {videoUrlInput && (
                <div style={{ marginBottom: "1rem" }}>
                  <button
                    type="button"
                    onClick={() => openVideoPreview("Video Preview", videoUrlInput)}
                    style={{
                      background: "#eff6ff",
                      border: "1px solid #bfdbfe",
                      color: "#1d4ed8",
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
                    <span>▶ Preview Video URL</span>
                  </button>
                </div>
              )}
            </div>

            {/* Right: Metadata */}
            <div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  <span>
                    Lesson Title <span style={{ color: "#dc2626" }}>*</span>
                  </span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Introduction to Leadership Principles"
                  value={singleTitle}
                  onChange={(e) => setSingleTitle(e.target.value)}
                  className={styles.formInput}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Lesson Description</label>
                <textarea
                  rows={3}
                  placeholder="Key concepts covered in this video..."
                  value={singleDescription}
                  onChange={(e) => setSingleDescription(e.target.value)}
                  className={styles.formTextarea}
                />
              </div>

              <div className={styles.switchToggleWrap}>
                <input
                  type="checkbox"
                  id="freePreviewSwitch"
                  checked={isFreePreview}
                  onChange={(e) => setIsFreePreview(e.target.checked)}
                  className={styles.switchInput}
                />
                <label htmlFor="freePreviewSwitch" style={{ fontSize: "0.85rem", cursor: "pointer" }}>
                  <strong>Free Preview Access</strong>
                  <span style={{ display: "block", color: "var(--text-muted)", fontSize: "0.75rem" }}>
                    Allow prospective learners to watch this lesson without enrolling
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "2rem", paddingTop: "1rem", borderTop: "1px solid var(--border-light)" }}>
            <button type="button" className={styles.btnBack} onClick={onBackToChooser}>
              &larr; Back
            </button>
            <button type="submit" disabled={isSaving} className={styles.btnPrimary}>
              {isSaving ? "Saving..." : "Save Lesson"}
            </button>
          </div>
        </form>
      )}

      {/* Bottom Back Button if Queue is present */}
      {videoQueue.length > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <button type="button" className={styles.btnBack} onClick={onBackToChooser}>
            &larr; Back to Chooser
          </button>
        </div>
      )}

      {/* REUSABLE MEDIA PREVIEW MODAL */}
      <MediaPreviewModal
        config={previewConfig}
        onClose={() => setPreviewConfig(null)}
      />
    </section>
  );
}
