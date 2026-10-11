"use client";

import React from "react";

interface ProgressRingProps {
  progressPercent: number; // 0 to 100
  size?: number;           // diameter in pixels
  strokeWidth?: number;    // stroke width in pixels
  trackColor?: string;     // background track color
  indicatorColor?: string; // progress stroke color
  showLabel?: boolean;     // show percentage number in center
  className?: string;
}

export default function ProgressRing({
  progressPercent,
  size = 46,
  strokeWidth = 3.5,
  trackColor = "var(--border-light, #ece4d7)",
  indicatorColor = "var(--accent-primary, #c97a1e)",
  showLabel = true,
  className = "",
}: ProgressRingProps) {
  const clampedPercent = Math.min(100, Math.max(0, Math.round(progressPercent)));
  const center = size / 2;
  const radius = center - strokeWidth;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clampedPercent / 100) * circumference;

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
      aria-label={`Progress: ${clampedPercent}%`}
      role="progressbar"
      aria-valuenow={clampedPercent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: "rotate(-90deg)" }}
      >
        {/* Background track circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="transparent"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        {/* Animated progress indicator circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="transparent"
          stroke={indicatorColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{
            transition: "stroke-dashoffset 0.5s ease-in-out",
          }}
        />
      </svg>
      {showLabel && (
        <span
          style={{
            position: "absolute",
            fontSize: size * 0.28,
            fontWeight: 700,
            color: "var(--text-primary, #14110f)",
            letterSpacing: "-0.02em",
          }}
        >
          {clampedPercent}%
        </span>
      )}
    </div>
  );
}
