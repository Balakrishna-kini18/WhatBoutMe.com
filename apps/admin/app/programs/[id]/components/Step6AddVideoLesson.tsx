"use client";

import React, { useState } from "react";
import styles from "../curriculum.module.css";
import { API_URL } from "../../../lib/api";

interface Step6AddVideoLessonProps {
  moduleTitle: string;
  moduleId: string;
  onBackToChooser: () => void;
  onLessonSaved: () => void;
}

export default function Step6AddVideoLesson({
  moduleTitle,
  moduleId,
  onBackToChooser,
  onLessonSaved,
}: Step6AddVideoLessonProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [isFreePreview, setIsFreePreview] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg("Lesson title is required.");
      return;
    }
    if (!selectedFile && !videoPreviewUrl) {
      setErrorMsg("Please choose a video file to upload.");
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);

    try {
      let publicId = "";
      let finalDuration = durationSec;

      if (selectedFile) {
        setUploadStatus("Preparing secure video streaming signature...");
        setUploadProgress(10);

        const sigRes = await fetch(`${API_URL}/media/upload-signature`, { method: "POST" });
        if (!sigRes.ok) throw new Error("Could not acquire video upload credentials");
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
      }

      setUploadStatus("Attaching video lesson to module...");

      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/programs/steps/${moduleId}/lessons`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title: title.trim(),
          type: "VIDEO",
          mediaUrl: publicId ? `upload:${publicId}` : videoPreviewUrl,
          durationSec: finalDuration,
          description: description.trim() || undefined,
          isFreePreview,
        }),
      });

      if (!res.ok) throw new Error("Failed to save lesson to module");

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
              <div className={styles.uploadCloudIcon}>☁</div>
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
            {isSaving ? "Saving Lesson..." : "Save Lesson ✓"}
          </button>
        </div>
      </form>
    </section>
  );
}
