"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, Lock, AlertCircle, RotateCcw } from "lucide-react";

export interface CompulsoryVideoPlayerProps {
  lessonId: string;
  videoSrc: string;
  initialPositionSec?: number;
  userName?: string;
  userEmail?: string;
  durationSec?: number;
  onHeartbeat: (
    positionSec: number,
    isEnded?: boolean,
    videoDurationSec?: number,
    deltaSec?: number,
    fromSec?: number,
    toSec?: number,
  ) => void;
  onComplete: () => void;
  onRestart?: () => void;
  onTimeUpdate?: (currentSec: number) => void;
  seekToTime?: number | null;
}

import {
  formatTime,
  validateSeek,
  calculateRewindTarget,
  calculateTimelineSeekTime,
} from "./videoPlayerLogic";

export default function CompulsoryVideoPlayer({
  lessonId,
  videoSrc,
  initialPositionSec = 0,
  userName,
  userEmail,
  durationSec: initialDurationSec,
  onHeartbeat,
  onComplete,
  onRestart,
  onTimeUpdate,
  seekToTime,
}: CompulsoryVideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Resolve upload streaming key or direct Cloudinary/S3 URL with auth token
  const resolvedVideoSrc = React.useMemo(() => {
    if (!videoSrc) return "";
    if (videoSrc.startsWith("http://") || videoSrc.startsWith("https://") || videoSrc.startsWith("/")) {
      return videoSrc;
    }
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const isUpload = videoSrc.startsWith("upload:");
    const rawKey = isUpload ? videoSrc.replace("upload:", "") : videoSrc;
    const streamingKey = rawKey.includes(".") ? rawKey : `${rawKey}.mp4`;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    return `${apiUrl}/media/stream/${streamingKey}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
  }, [videoSrc]);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(initialDurationSec || 0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isBuffering, setIsBuffering] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [seekWarning, setSeekWarning] = useState<string | null>(null);
  const [resumedNotice, setResumedNotice] = useState<number | null>(null);
  const [hasEnded, setHasEnded] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState<boolean>(false);
  const speedMenuRef = useRef<HTMLDivElement | null>(null);

  // Close speed menu on outside click
  useEffect(() => {
    if (!showSpeedMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target as Node)) {
        setShowSpeedMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSpeedMenu]);

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
    setShowSpeedMenu(false);
  };

  // Reset error when lesson or video source changes
  useEffect(() => {
    setVideoError(null);
    setHasEnded(false);
  }, [lessonId, resolvedVideoSrc]);

  // Anti-skip enforcement refs
  const maxWatchedSecRef = useRef<number>(initialPositionSec || 0);
  const lastValidTimeRef = useRef<number>(initialPositionSec || 0);
  const lastHeartbeatTimeRef = useRef<number>(Date.now());
  const lastHeartbeatPositionRef = useRef<number>(initialPositionSec || 0);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasCompletedRef = useRef<boolean>(false);

  // Watermark text
  const watermarkLabel = [userName, userEmail].filter(Boolean).join(" • ") || "WhatBoutMe Compulsory LMS";

  // Trigger seek warning notification
  const triggerSeekWarning = useCallback((message = "Timeline scrubbing is locked on compulsory lessons.") => {
    setSeekWarning(message);
    if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
    warningTimeoutRef.current = setTimeout(() => {
      setSeekWarning(null);
    }, 2800);
  }, []);

  // Rewind helper: jump back by seconds (safe and non-destructive to watched progress)
  const handleRewind = useCallback((seconds = 10) => {
    const video = videoRef.current;
    if (!video) return;
    const target = calculateRewindTarget(video.currentTime, seconds);
    video.currentTime = target;
    setCurrentTime(target);
    lastValidTimeRef.current = target;
    setHasEnded(false);
  }, []);

  // Keyboard navigation: Allow rewinding (ArrowLeft, J, Home, 0), block forward skipping into unwatched content
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Rewind keys: ArrowLeft, KeyJ (10s back)
      if (e.code === "ArrowLeft" || e.code === "KeyJ" || e.key === "j" || e.key === "J") {
        e.preventDefault();
        e.stopPropagation();
        handleRewind(10);
        return;
      }

      // Rewatch from start: Home or 0
      if (e.code === "Home" || e.code === "Digit0") {
        e.preventDefault();
        e.stopPropagation();
        handleRestart();
        return;
      }

      // Fast-forward keys: ArrowRight, KeyL (10s forward)
      if (e.code === "ArrowRight" || e.code === "KeyL" || e.key === "l" || e.key === "L") {
        e.preventDefault();
        e.stopPropagation();
        const video = videoRef.current;
        if (video) {
          const effectiveDur = duration > 0 ? duration : (video.duration || 0);
          const target = Math.min(effectiveDur > 0 ? effectiveDur : video.currentTime + 10, video.currentTime + 10);
          const validation = validateSeek(
            target,
            lastValidTimeRef.current,
            maxWatchedSecRef.current,
            effectiveDur,
            hasCompletedRef.current
          );
          if (!validation.allowed) {
            triggerSeekWarning(validation.reason);
            video.currentTime = validation.effectiveTime;
            setCurrentTime(validation.effectiveTime);
            return;
          }
          video.currentTime = validation.effectiveTime;
          setCurrentTime(validation.effectiveTime);
          lastValidTimeRef.current = validation.effectiveTime;
        }
        return;
      }

      if (e.code === "Space" || e.key === " " || e.code === "KeyK") {
        e.preventDefault();
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      } else if (e.code === "KeyM" || e.key === "m") {
        e.preventDefault();
        setIsMuted((prev) => !prev);
      } else if (e.code === "KeyF" || e.key === "f") {
        e.preventDefault();
        handleToggleFullscreen();
      }
    },
    [triggerSeekWarning, handleRewind, duration]
  );

  // Synchronize mute with video element
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Synchronize volume
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
    }
  }, [volume]);

  // Synchronize external seekToTime from notes jump
  useEffect(() => {
    if (seekToTime != null && videoRef.current && Number.isFinite(seekToTime)) {
      const allowedMax = Math.max(maxWatchedSecRef.current, initialPositionSec || 0);
      if (seekToTime <= allowedMax || hasCompletedRef.current) {
        videoRef.current.currentTime = seekToTime;
        setCurrentTime(seekToTime);
      }
    }
  }, [seekToTime, initialPositionSec]);

  // Handle Fullscreen toggle
  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  // Loaded metadata: resume playback & sanitize duration
  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    setVideoError(null);
    const video = e.currentTarget;
    const rawDur = Math.floor(video.duration || 0);

    // Prevent NaN duration bug
    const effectiveDur = Number.isFinite(rawDur) && rawDur > 0 ? rawDur : (initialDurationSec || 0);
    setDuration(effectiveDur);

    // Resume from saved position if valid
    if (initialPositionSec && initialPositionSec > 5 && effectiveDur > 0 && initialPositionSec < effectiveDur - 5) {
      video.currentTime = initialPositionSec;
      lastValidTimeRef.current = initialPositionSec;
      maxWatchedSecRef.current = initialPositionSec;
      setCurrentTime(initialPositionSec);
      setResumedNotice(Math.floor(initialPositionSec));
    }
  };

  // Seeking handler: update current time and progress safely against anti-skip rules
  const handleSeeking = () => {
    const video = videoRef.current;
    if (!video) return;
    const validation = validateSeek(
      video.currentTime,
      lastValidTimeRef.current,
      maxWatchedSecRef.current,
      duration,
      hasCompletedRef.current
    );
    if (!validation.allowed) {
      triggerSeekWarning(validation.reason);
      video.currentTime = validation.effectiveTime;
      setCurrentTime(validation.effectiveTime);
      return;
    }
    lastValidTimeRef.current = video.currentTime;
    setCurrentTime(video.currentTime);
  };

  // Playback rate: ensure video adheres to selected speed
  const handleRateChange = () => {
    const video = videoRef.current;
    if (video && video.playbackRate !== playbackSpeed) {
      video.playbackRate = playbackSpeed;
    }
  };

  // Interactive timeline click handler: seek directly to clicked position with anti-skip validation
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || !duration || duration <= 0) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const targetTime = Math.max(0, Math.min(duration, (clickX / rect.width) * duration));

    const validation = validateSeek(
      targetTime,
      lastValidTimeRef.current,
      maxWatchedSecRef.current,
      duration,
      hasCompletedRef.current
    );

    if (!validation.allowed) {
      triggerSeekWarning(validation.reason);
      video.currentTime = validation.effectiveTime;
      setCurrentTime(validation.effectiveTime);
      return;
    }

    video.currentTime = validation.effectiveTime;
    setCurrentTime(validation.effectiveTime);
    lastValidTimeRef.current = validation.effectiveTime;
    setHasEnded(false);
  };

  // Time update loop & Heartbeats
  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    const current = video.currentTime;
    const dur = duration > 0 ? duration : Math.floor(video.duration || 0);

    setCurrentTime(current);
    if (onTimeUpdate) {
      onTimeUpdate(current);
    }

    // Maintain monotonic maxWatchedSec
    if (current > maxWatchedSecRef.current) {
      maxWatchedSecRef.current = current;
    }
    lastValidTimeRef.current = current;

    // Send 15-second periodic heartbeat with exact interval segments
    const now = Date.now();
    if (now - lastHeartbeatTimeRef.current >= 15000) {
      const fromSec = lastHeartbeatPositionRef.current;
      const toSec = current;
      const delta = Math.max(0, current - lastHeartbeatPositionRef.current);
      lastHeartbeatTimeRef.current = now;
      lastHeartbeatPositionRef.current = current;
      onHeartbeat(
        Math.floor(current),
        false,
        dur > 0 ? dur : undefined,
        Math.floor(delta),
        Math.floor(fromSec),
        Math.floor(toSec),
      );
    }

    // Server-enforced compulsory completion: watchedSeconds >= duration * 0.95
    if (dur > 0 && current >= dur * 0.95 && !hasCompletedRef.current) {
      hasCompletedRef.current = true;
      setHasEnded(true);
      onHeartbeat(dur, true, dur);
      onComplete();
    }
  };

  // onEnded event: triggers completion and enables full rewatch capability
  const handleEnded = () => {
    setIsPlaying(false);
    setHasEnded(true);
    const dur = duration > 0 ? duration : Math.floor(videoRef.current?.duration || 0);
    if (!hasCompletedRef.current) {
      hasCompletedRef.current = true;
      onHeartbeat(dur, true, dur);
      onComplete();
    }
  };

  // Auto-hide controls when playing and idle
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  };

  // Keepalive heartbeat on tab hide or close
  useEffect(() => {
    const handleKeepAlive = () => {
      const video = videoRef.current;
      if (video && (document.visibilityState === "hidden" || !document.hasFocus())) {
        const cur = Math.floor(video.currentTime);
        const dur = duration > 0 ? duration : Math.floor(video.duration || 0);
        if (cur > 0) {
          onHeartbeat(cur, false, dur > 0 ? dur : undefined);
        }
      }
    };

    window.addEventListener("pagehide", handleKeepAlive);
    document.addEventListener("visibilitychange", handleKeepAlive);
    return () => {
      window.removeEventListener("pagehide", handleKeepAlive);
      document.removeEventListener("visibilitychange", handleKeepAlive);
    };
  }, [duration, onHeartbeat]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  // Restart / Rewatch video from beginning (preserves maxWatched progress)
  const handleRestart = () => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = 0;
      lastValidTimeRef.current = 0;
      setCurrentTime(0);
      setHasEnded(false);
      setResumedNotice(null);
      video.play().catch(() => {});
    }
    onRestart?.();
  };

  // Compute progress percentages safely
  const watchedPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  const maxWatchedPercent = duration > 0 ? Math.min(100, Math.max(0, (maxWatchedSecRef.current / duration) * 100)) : 0;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "16 / 9",
        backgroundColor: "#000000",
        borderRadius: "14px",
        overflow: "hidden",
        outline: "none",
        userSelect: "none",
        boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
      }}
    >
      {/* 1. Main Video Element */}
      {videoError ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            color: "#f8fafc",
            textAlign: "center",
            background: "#090d16",
          }}
        >
          <AlertCircle size={44} color="#ef4444" style={{ marginBottom: "12px" }} />
          <h3 style={{ margin: "0 0 8px", fontSize: "1.1rem", fontWeight: 700 }}>Stream Loading Failed</h3>
          <p style={{ margin: "0 0 16px", color: "#94a3b8", fontSize: "0.9rem" }}>{videoError}</p>
          <button
            type="button"
            onClick={() => {
              setVideoError(null);
              if (videoRef.current) {
                videoRef.current.load();
                videoRef.current.play().catch(() => {});
              }
            }}
            style={{
              padding: "10px 20px",
              background: "#c97a1e",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Retry Stream
          </button>
        </div>
      ) : (
        <video
          ref={videoRef}
          key={`${lessonId}-${resolvedVideoSrc}`}
          src={resolvedVideoSrc}
          playsInline
          preload="metadata"
          controls={false}
          controlsList="nodownload noplaybackrate nofullscreen"
          disablePictureInPicture
          onContextMenu={(e) => e.preventDefault()}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onWaiting={() => setIsBuffering(true)}
          onPlaying={() => setIsBuffering(false)}
          onSeeking={handleSeeking}
          onRateChange={handleRateChange}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onError={() => {
            setVideoError("Video stream could not be loaded. Please click Retry Stream.");
          }}
          onClick={togglePlay}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            cursor: "pointer",
            display: "block",
          }}
        />
      )}

      {/* 2. Official Brand Logo Watermark */}
      <img
        src="/brand/logo-dark.png"
        alt="WhatBoutMe"
        style={{
          position: "absolute",
          top: "16px",
          right: "18px",
          height: "22px",
          opacity: 0.65,
          pointerEvents: "none",
          zIndex: 30,
        }}
        onError={(e) => {
          (e.currentTarget as HTMLElement).style.display = "none";
        }}
      />

      {/* 3. Dynamic Moving Watermark (Deter Screen Recording) */}
      <div
        style={{
          position: "absolute",
          pointerEvents: "none",
          fontSize: "0.95rem",
          fontWeight: 600,
          color: "rgba(255, 255, 255, 0.28)",
          textShadow: "0 1px 3px rgba(0, 0, 0, 0.75)",
          zIndex: 40,
          whiteSpace: "nowrap",
          animation: "compulsoryWatermarkAnim 180s steps(1, end) infinite",
        }}
      >
        {watermarkLabel}
      </div>

      {/* CSS Animation Keyframes for Watermark */}
      <style>{`
        @keyframes compulsoryWatermarkAnim {
          0%   { top: 12%; left: 8%; }
          25%  { top: 12%; left: 52%; }
          50%  { top: 72%; left: 48%; }
          75%  { top: 72%; left: 8%; }
          100% { top: 12%; left: 8%; }
        }
      `}</style>

      {/* 4. Seek Blocked Toast Warning (Apple HIG Accessibility Announcement) */}
      {seekWarning && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "absolute",
            top: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(15, 23, 42, 0.82)",
            border: "1px solid rgba(255, 255, 255, 0.2)",
            color: "#ffffff",
            padding: "8px 18px",
            borderRadius: "9999px",
            fontSize: "0.82rem",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            zIndex: 60,
            backdropFilter: "blur(20px) saturate(160%)",
            WebkitBackdropFilter: "blur(20px) saturate(160%)",
            pointerEvents: "none",
          }}
        >
          <Lock size={14} color="#f59e0b" />
          <span>{seekWarning}</span>
        </div>
      )}

      {/* 5. Center Big Play / Rewatch Overlay */}
      {hasEnded && !videoError ? (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "12px",
            zIndex: 36,
          }}
        >
          <button
            type="button"
            onClick={handleRestart}
            aria-label="Rewatch Lesson"
            style={{
              padding: "12px 26px",
              background: "linear-gradient(135deg, #c97a1e, #d97706)",
              color: "#ffffff",
              border: "none",
              borderRadius: "9999px",
              fontWeight: 700,
              fontSize: "0.95rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              boxShadow: "0 10px 25px rgba(201, 122, 30, 0.45)",
              transition: "transform 0.15s ease",
            }}
          >
            <RotateCcw size={18} />
            <span>Rewatch Lesson</span>
          </button>
        </div>
      ) : !isPlaying && !videoError ? (
        <button
          type="button"
          onClick={togglePlay}
          aria-label="Play Video"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "68px",
            height: "68px",
            borderRadius: "50%",
            background: "rgba(15, 23, 42, 0.75)",
            border: "2px solid rgba(255, 255, 255, 0.35)",
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(6px)",
            zIndex: 35,
            transition: "all 0.2s ease",
          }}
        >
          <Play size={28} fill="#ffffff" style={{ marginLeft: "4px" }} />
        </button>
      ) : null}

      {/* 6. Apple Liquid Glass Floating Player Transport Bar (HIG Playing Video & Liquid Glass) */}
      <div
        style={{
          position: "absolute",
          bottom: "12px",
          left: "14px",
          right: "14px",
          background: "rgba(15, 23, 42, 0.72)",
          backdropFilter: "blur(24px) saturate(160%)",
          WebkitBackdropFilter: "blur(24px) saturate(160%)",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          borderRadius: "14px",
          padding: "10px 16px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          opacity: showControls || !isPlaying ? 1 : 0,
          pointerEvents: showControls || !isPlaying ? "auto" : "none",
          transition: "opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
          boxShadow: "0 12px 36px rgba(0, 0, 0, 0.45)",
          zIndex: 50,
        }}
      >
        {/* Timeline Bar (Full-width YouTube style) */}
        <div style={{ display: "flex", alignItems: "center", width: "100%", padding: "4px 0" }}>
          <div
            onClick={handleTimelineClick}
            style={{
              position: "relative",
              flex: 1,
              height: "6px",
              background: "rgba(255, 255, 255, 0.22)",
              borderRadius: "4px",
              overflow: "hidden",
              cursor: "pointer",
              transition: "height 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.height = "8px";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.height = "6px";
            }}
          >
            {/* Active Current Time Progress Track */}
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: 0,
                width: `${watchedPercent}%`,
                background: "linear-gradient(90deg, #c97a1e, #f59e0b)",
                boxShadow: "0 0 8px rgba(245, 158, 11, 0.5)",
                borderRadius: "4px",
              }}
            />
          </div>
        </div>

        {/* Lower Control Actions */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {/* Play/Pause Button */}
            <button
              type="button"
              onClick={togglePlay}
              aria-label={isPlaying ? "Pause" : "Play"}
              style={{
                background: "none",
                border: "none",
                color: "#ffffff",
                cursor: "pointer",
                padding: "4px",
                display: "flex",
                alignItems: "center",
              }}
            >
              {isPlaying ? <Pause size={20} fill="#ffffff" /> : <Play size={20} fill="#ffffff" />}
            </button>

            {/* Rewind 10s Button */}
            <button
              type="button"
              onClick={() => handleRewind(10)}
              aria-label="Rewind 10 seconds"
              title="Rewind 10 seconds (Left Arrow or J)"
              style={{
                background: "none",
                border: "none",
                color: "#e2e8f0",
                cursor: "pointer",
                padding: "4px",
                display: "flex",
                alignItems: "center",
                gap: "2px",
                fontSize: "0.74rem",
                fontWeight: 700,
                transition: "color 0.15s ease",
              }}
            >
              <RotateCcw size={17} />
              <span>10s</span>
            </button>

            {/* Volume & Mute */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                type="button"
                onClick={() => setIsMuted(!isMuted)}
                aria-label={isMuted ? "Unmute" : "Mute"}
                style={{
                  background: "none",
                  border: "none",
                  color: "#ffffff",
                  cursor: "pointer",
                  padding: "4px",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setVolume(val);
                  setIsMuted(val === 0);
                }}
                style={{
                  width: "60px",
                  height: "4px",
                  accentColor: "#f59e0b",
                  cursor: "pointer",
                }}
              />
            </div>

            {/* Timestamp Readout */}
            <span style={{ fontSize: "0.82rem", color: "#e2e8f0", fontFamily: "monospace", letterSpacing: "0.04em" }}>
              {formatTime(currentTime)}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {/* Speed Selector (1, 1.5, 1.75, 2) */}
            <div ref={speedMenuRef} style={{ position: "relative" }}>
              {showSpeedMenu && (
                <div
                  style={{
                    position: "absolute",
                    bottom: "calc(100% + 10px)",
                    right: 0,
                    background: "rgba(15, 23, 42, 0.96)",
                    backdropFilter: "blur(10px)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    borderRadius: "8px",
                    padding: "6px 0",
                    minWidth: "120px",
                    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5)",
                    zIndex: 100,
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div
                    style={{
                      padding: "4px 12px 6px",
                      fontSize: "0.68rem",
                      fontWeight: 700,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                      marginBottom: "4px",
                    }}
                  >
                    Speed
                  </div>
                  {[1, 1.5, 1.75, 2].map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => handleSpeedChange(spd)}
                      style={{
                        background: playbackSpeed === spd ? "rgba(245, 158, 11, 0.2)" : "transparent",
                        color: playbackSpeed === spd ? "#fbbf24" : "#f1f5f9",
                        border: "none",
                        padding: "7px 14px",
                        textAlign: "left",
                        fontSize: "0.8rem",
                        fontWeight: playbackSpeed === spd ? 700 : 500,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        transition: "background 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        if (playbackSpeed !== spd) {
                          e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (playbackSpeed !== spd) {
                          e.currentTarget.style.background = "transparent";
                        }
                      }}
                    >
                      <span>{spd === 1 ? "1x (Normal)" : `${spd}x`}</span>
                      {playbackSpeed === spd && <span style={{ fontSize: "0.75rem" }}>✓</span>}
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowSpeedMenu((prev) => !prev)}
                aria-label="Playback speed"
                title="Playback speed"
                style={{
                  background: "rgba(255, 255, 255, 0.12)",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  color: "#ffffff",
                  padding: "3px 9px",
                  borderRadius: "5px",
                  fontSize: "0.76rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  fontFamily: "monospace",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.12)";
                }}
              >
                <span>{playbackSpeed === 1 ? "1x" : `${playbackSpeed}x`}</span>
              </button>
            </div>

            {/* Fullscreen Button */}
            <button
              type="button"
              onClick={handleToggleFullscreen}
              aria-label={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              style={{
                background: "none",
                border: "none",
                color: "#ffffff",
                cursor: "pointer",
                padding: "4px",
                display: "flex",
                alignItems: "center",
              }}
            >
              {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
          </div>
        </div>
      </div>

      {/* 7. Resume Notice Ribbon */}
      {resumedNotice !== null && (
        <div
          style={{
            position: "absolute",
            bottom: "64px",
            left: "18px",
            background: "rgba(15, 23, 42, 0.88)",
            border: "1px solid rgba(56, 189, 248, 0.4)",
            borderRadius: "6px",
            padding: "4px 10px",
            fontSize: "0.78rem",
            color: "#38bdf8",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            zIndex: 45,
            backdropFilter: "blur(4px)",
          }}
        >
          <span>Resumed from {formatTime(resumedNotice)}</span>
          <button
            type="button"
            onClick={handleRestart}
            style={{
              background: "none",
              border: "none",
              color: "#ffffff",
              textDecoration: "underline",
              fontSize: "0.75rem",
              cursor: "pointer",
              padding: 0,
            }}
          >
            Start Over
          </button>
        </div>
      )}
    </div>
  );
}
