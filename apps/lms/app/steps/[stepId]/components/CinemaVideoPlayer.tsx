"use client";

import React, { useRef } from "react";
import styles from "../step.module.css";
import { API_URL } from "../../../lib/api";

interface CinemaVideoPlayerProps {
  currentMedia: any;
  allMediaLessons: any[];
  userEmail: string;
  playbackSpeed: number;
  onChangeSpeed: () => void;
  resumedFrom: { lessonId: string; timeSec: number } | null;
  onClearResume: () => void;
  onHeartbeat: (lessonId: string, positionSec: number) => void;
  onVideoEnded: () => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isVideoDone: boolean;
  progressPercent: number;
  onSelectMedia: (id: string) => void;
}

export default function CinemaVideoPlayer({
  currentMedia,
  allMediaLessons,
  userEmail,
  playbackSpeed,
  onChangeSpeed,
  resumedFrom,
  onClearResume,
  onHeartbeat,
  onVideoEnded,
  videoRef,
  isVideoDone,
  progressPercent,
  onSelectMedia,
}: CinemaVideoPlayerProps) {
  const lastHeartbeatTimeRef = useRef<number>(0);

  if (!currentMedia) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px", background: "#ffffff", borderRadius: 14, border: "1px solid var(--border-light)" }}>
        <p style={{ color: "var(--text-secondary)" }}>No video lecture uploaded for this step.</p>
      </div>
    );
  }

  // Resolve upload streaming key or direct Cloudinary/S3 URL
  const isUpload = currentMedia.mediaUrl?.startsWith("upload:");
  let videoSrc = currentMedia.mediaUrl;
  if (isUpload) {
    const publicId = currentMedia.mediaUrl.replace("upload:", "");
    const streamingKey = publicId.includes(".") ? publicId : `${publicId}.mp4`;
    videoSrc = `${API_URL}/media/stream/${streamingKey}`;
  }

  return (
    <div style={{ width: "100%" }}>
      {/* Multi-video parts selector (if step contains >1 video) */}
      {allMediaLessons.length > 1 && (
        <div className={styles.multiVideoSelector}>
          {allMediaLessons.map((m: any, idx: number) => {
            const isSelected = currentMedia.id === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelectMedia(m.id)}
                className={`${styles.videoPill} ${isSelected ? styles.videoPillActive : ""}`}
              >
                <span>Part {idx + 1}: {m.title}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 16:9 Cinema Box */}
      <div className={styles.videoCinemaBox}>
        <video
          ref={videoRef}
          key={currentMedia.id}
          controls
          controlsList="nodownload"
          className={styles.videoElement}
          onLoadedMetadata={(e) => {
            if (playbackSpeed !== 1) {
              e.currentTarget.playbackRate = playbackSpeed;
            }
          }}
          onTimeUpdate={(e) => {
            const currentSec = Math.floor(e.currentTarget.currentTime);
            const now = Date.now();
            if (now - lastHeartbeatTimeRef.current > 15000) {
              lastHeartbeatTimeRef.current = now;
              onHeartbeat(currentMedia.id, currentSec);
            }
          }}
          onPause={(e) => {
            onHeartbeat(currentMedia.id, Math.floor(e.currentTarget.currentTime));
          }}
          onEnded={() => {
            const duration = Math.floor(videoRef.current?.duration || 0);
            onHeartbeat(currentMedia.id, duration);
            onVideoEnded();
          }}
          src={videoSrc}
        >
          Your browser does not support the video tag.
        </video>

        {/* Brand Logo & Dynamic Anti-Piracy Watermark */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/logo-dark.png"
          alt="WhatBoutMe"
          className={styles.brandLogoWatermark}
        />
        <div className={styles.videoWatermark}>{userEmail}</div>
      </div>

      {/* Resume Playback Notification Pill */}
      {resumedFrom && resumedFrom.lessonId === currentMedia.id && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", background: "#fef3c7", borderRadius: 10, fontSize: "0.85rem", color: "#92400e", marginTop: "0.75rem" }}>
          <span>
            Resumed at <strong>{Math.floor(resumedFrom.timeSec / 60)}:{(resumedFrom.timeSec % 60).toString().padStart(2, "0")}</strong>
          </span>
          <button
            type="button"
            onClick={() => {
              if (videoRef.current) videoRef.current.currentTime = 0;
              onClearResume();
            }}
            style={{ background: "none", border: "none", color: "#b45309", fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}
          >
            Start over
          </button>
        </div>
      )}

      {/* Modern Player Meta Bar */}
      <div className={styles.videoMetaBar}>
        <div className={styles.videoMetaInfo}>
          <span className={styles.videoLessonBadge}>{currentMedia.title}</span>
          <span className={styles.videoDurationChip}>
            {isVideoDone ? "✓ Watched" : `${Math.round(progressPercent)}% Completed`}
          </span>
        </div>

        <div className={styles.videoPlayerTools}>
          <button
            type="button"
            className={styles.playerToolBtn}
            onClick={onChangeSpeed}
            title="Cycle playback speed"
          >
            <span>⚡</span>
            <span>{playbackSpeed}x Speed</span>
          </button>

          {typeof document !== "undefined" && "pictureInPictureEnabled" in document && (
            <button
              type="button"
              className={styles.playerToolBtn}
              onClick={() => {
                if (videoRef.current) {
                  if (document.pictureInPictureElement) {
                    document.exitPictureInPicture().catch(() => {});
                  } else {
                    videoRef.current.requestPictureInPicture().catch(() => {});
                  }
                }
              }}
              title="Toggle Picture-in-Picture window"
            >
              <span>📺</span>
              <span>PiP</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
