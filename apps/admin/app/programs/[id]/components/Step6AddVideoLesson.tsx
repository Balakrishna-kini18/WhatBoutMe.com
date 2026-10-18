"use client";

import React, { useState } from "react";
import styles from "../curriculum.module.css";
import { API_URL, uploadFile, errorMessage, cachedFetch } from "../../../lib/api";

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
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [isFreePreview, setIsFreePreview] = useState(false);
  const [videoUrlInput, setVideoUrlInput] = useState("");

  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    const localUrl = URL.createObjectURL(file);
    setVideoPreviewUrl(localUrl);

    if (!title.trim()) {
      setTitle(file.name.replace(/\.[^/.]+$/, ""));
    }
  };

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const dur = Math.round(e.currentTarget.duration || 0);
    setDurationSec(dur);
  };

  const handleBackgroundSubmit = () => {
    if (!title.trim()) {
      setErrorMsg("Lesson title is required.");
      return;
    }
    if (!selectedFile && !videoPreviewUrl && !videoUrlInput.trim()) {
      setErrorMsg("Please choose a video file to upload or enter a direct video URL.");
      return;
    }
    setErrorMsg(null);
    onStartBackgroundUpload?.({
      file: selectedFile || undefined,
      videoUrl: videoUrlInput.trim() || undefined,
      title: title.trim(),
      description: description.trim(),
      durationSec,
      moduleId,
      moduleTitle,
    });
    // Reset form so admin can immediately add another video
    setTitle("");
    setDescription("");
    setSelectedFile(null);
    setVideoPreviewUrl(null);
    setDurationSec(null);
    setVideoUrlInput("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg("Lesson title is required.");
      return;
    }
    if (!selectedFile && !videoPreviewUrl && !videoUrlInput.trim()) {
      setErrorMsg("Please choose a video file to upload or enter a direct video URL.");
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);

    try {
      let publicId = "";
      let finalDuration = durationSec;
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

      if (videoUrlInput.trim()) {
        publicId = videoUrlInput.trim();
      } else if (selectedFile) {
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
            formData.append("file", selectedFile);
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
                  setUploadStatus(`Uploading video asset (${Math.round((ev.loaded / ev.total) * 100)}%)...`);
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
          // Cloudinary direct upload failed or not configured, fallback to standard upload
        }

        if (!uploadedDirect) {
          setUploadStatus("Uploading video file to server...");
          setUploadProgress(50);
          const uploadedUrl = await uploadFile(selectedFile);
          publicId = uploadedUrl;
          setUploadProgress(100);
        }
      }

      setUploadStatus("Attaching video lesson to module...");

      const finalMediaUrl = videoUrlInput.trim()
        ? videoUrlInput.trim()
        : publicId
        ? (publicId.startsWith("http") || publicId.startsWith("/") ? publicId : `upload:${publicId}`)
        : (videoPreviewUrl && !videoPreviewUrl.startsWith("blob:") ? videoPreviewUrl : `upload:video-${Date.now()}`);

      const res = await cachedFetch(`${API_URL}/programs/steps/${moduleId}/lessons`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: title.trim(),
          type: "VIDEO",
          mediaUrl: finalMediaUrl,
          durationSec: finalDuration ?? 0,
          content: description.trim() || undefined,
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

  const formatDuration = (sec: number | null) => {
    if (!sec) return "00:00:00";
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <section className={styles.cardSurface}>
      {/* Header */}
      <div className={styles.cardHeaderArea}>
        <div className={styles.stepEyebrow}>STEP 6: ADD VIDEO LESSON</div>
        <h2 className={styles.stepTitle}>Video Lesson Details</h2>
        <p className={styles.stepSubtitle}>
          Upload and configure your video lesson for <strong>{moduleTitle}</strong>.
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

      <form onSubmit={handleSubmit}>
        <div className={styles.twoColLayout}>
          {/* Left Column: Video Dropzone & Preview */}
          <div>
            <label className={styles.uploadCardArea}>
              <div className={styles.uploadCloudIcon} style={{ color: "var(--accent-primary)" }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <h3 className={styles.uploadTitle}>
                {selectedFile ? selectedFile.name : "Upload Video Lecture"}
              </h3>
              <p className={styles.uploadHint}>Drag and drop your video file here (MP4, MOV, WebM - Max 2GB)</p>
              <input
                type="file"
                accept="video/*"
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
                {selectedFile ? "Change File" : "Choose File"}
              </span>
            </label>

            {/* Or Direct Video URL input */}
            <div style={{ marginTop: "0.85rem", marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>
                Or Direct Video / Cloudinary URL
              </label>
              <input
                type="url"
                value={videoUrlInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setVideoUrlInput(val);
                  if (val.trim().startsWith("http")) {
                    setVideoPreviewUrl(val.trim());
                  }
                }}
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

            {/* Video Preview Canvas */}
            {videoPreviewUrl && (
              <div style={{ background: "#000000", borderRadius: 14, overflow: "hidden", aspectRatio: "16 / 9", marginBottom: "1rem" }}>
                <video
                  controls
                  src={videoPreviewUrl}
                  onLoadedMetadata={handleLoadedMetadata}
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
              </div>
            )}
          </div>

          {/* Right Column: Metadata Details */}
          <div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                Lesson Title <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. What is HTML?"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={styles.formInput}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Lesson Description</label>
              <textarea
                rows={3}
                placeholder="Explain what this lesson covers..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={styles.formTextarea}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                Duration <span className={styles.formLabelOptional}>(Auto-detected)</span>
              </label>
              <input
                type="text"
                readOnly
                value={formatDuration(durationSec)}
                className={styles.formInput}
                style={{ background: "var(--bg-soft)", color: "var(--text-muted)" }}
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
                <strong>Is Free Preview?</strong>
                <span style={{ display: "block", color: "var(--text-muted)", fontSize: "0.75rem" }}>
                  Allow prospective learners to watch this lesson without enrolling
                </span>
              </label>
            </div>

            {/* Compulsory Video Player & Anti-Skip Policy */}
            <div
              style={{
                marginTop: "1.25rem",
                padding: "14px 16px",
                background: "linear-gradient(135deg, #f8fafc, #f1f5f9)",
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <span style={{ fontSize: "1rem" }}>🔒</span>
                <strong style={{ fontSize: "0.88rem", color: "#0f172a" }}>
                  Compulsory Playback &amp; Anti-Skip Security
                </strong>
              </div>
              <p style={{ margin: "0 0 10px", fontSize: "0.78rem", color: "#64748b", lineHeight: 1.45 }}>
                Enforced server-side for LMS compliance and course completion accreditation:
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.78rem", color: "#334155" }}>
                  <span style={{ color: "#16a34a", fontWeight: "bold" }}>✓</span>
                  <span><strong>Anti-Skip Lock:</strong> 10s skip buttons removed; timeline scrub bar is locked.</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.78rem", color: "#334155" }}>
                  <span style={{ color: "#16a34a", fontWeight: "bold" }}>✓</span>
                  <span><strong>Speed Lock:</strong> Playback rate strictly locked to 1.0x (no acceleration).</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.78rem", color: "#334155" }}>
                  <span style={{ color: "#16a34a", fontWeight: "bold" }}>✓</span>
                  <span><strong>Dynamic Watermark:</strong> Learner name &amp; email overlay deters screen recording.</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.78rem", color: "#334155" }}>
                  <span style={{ color: "#16a34a", fontWeight: "bold" }}>✓</span>
                  <span><strong>Server Validation:</strong> Step progression unlocks only upon &ge; 95% watch threshold.</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "2.5rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border-light)", flexWrap: "wrap", gap: "12px" }}>
          <button
            type="button"
            className={styles.btnBack}
            onClick={onBackToChooser}
            disabled={isSaving}
          >
            &larr; Back
          </button>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {onStartBackgroundUpload && (
              <button
                type="button"
                disabled={isSaving}
                onClick={handleBackgroundSubmit}
                style={{
                  padding: "10px 18px",
                  borderRadius: "8px",
                  border: "1px solid var(--accent-primary, #0284c7)",
                  background: "#f0f9ff",
                  color: "var(--accent-primary, #0284c7)",
                  fontWeight: 600,
                  fontSize: "0.88rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span>⚡ Upload in Background &amp; Add Another</span>
              </button>
            )}

            <button
              type="submit"
              disabled={isSaving}
              className={styles.btnPrimary}
            >
              {isSaving ? "Saving Lesson..." : "Save Lesson"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
