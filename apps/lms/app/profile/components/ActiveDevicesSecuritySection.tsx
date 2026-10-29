"use client";

import React from "react";
import styles from "../profile.module.css";

export interface DeviceSession {
  id: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceInfo?: {
    browser: string;
    os: string;
    deviceType: "desktop" | "mobile" | "tablet";
  };
  lastActive: string;
  createdAt: string;
  isCurrent: boolean;
}

export interface ActiveDevicesSecuritySectionProps {
  sessions: DeviceSession[];
  onSignOutEverywhere: () => void;
  onRevokeSession: (id: string) => void;
  isBusy: boolean;
}

export default function ActiveDevicesSecuritySection({
  sessions,
  onSignOutEverywhere,
  onRevokeSession,
  isBusy,
}: ActiveDevicesSecuritySectionProps) {
  return (
    <section className={styles.sectionCard} aria-labelledby="active-devices-heading">
      {/* Top Banner Row: Explanation + Security Illustration */}
      <div className={styles.deviceHeroRow}>
        <div className={styles.deviceHeroLeft}>
          <div className={styles.deviceHeaderTitleRow}>
            <div className={`${styles.sectionHeaderIcon} ${styles.statThemeOrange}`}>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <div className={styles.deviceTitleWithBadge}>
                <h2 id="active-devices-heading" className={styles.sectionCardTitle}>
                  Active Devices &amp; Security
                </h2>
                <span className={styles.singleDeviceBadge}>
                  Single Active Device Enforced (1 Device Max)
                </span>
              </div>
              <p className={styles.deviceExplanationText}>
                To protect your course materials and prevent unauthorized sharing, WhatBoutMe limits each account to <strong>1 active session</strong>. Signing in on another browser or device automatically signs out previous sessions.
              </p>
            </div>
          </div>
        </div>

        {/* Crisp Vector Device Illustration Matching Screenshot */}
        <div className={styles.deviceIllustrationWrap} aria-hidden="true">
          <svg
            width="140"
            height="85"
            viewBox="0 0 140 85"
            fill="none"
            className={styles.deviceSvg}
          >
            {/* Ambient warm glow */}
            <ellipse cx="70" cy="78" rx="60" ry="6" fill="rgba(234, 88, 12, 0.08)" />

            {/* Laptop Base */}
            <path
              d="M10 65 L95 65 C97 65 98 66 98 67 L96 71 C95 72 94 72 93 72 L12 72 C11 72 10 72 9 71 L7 67 C7 66 8 65 10 65 Z"
              fill="#f5efe6"
              stroke="#e2dcd4"
              strokeWidth="1.2"
            />
            {/* Laptop Screen */}
            <rect
              x="16"
              y="18"
              width="73"
              height="47"
              rx="4"
              fill="#ffffff"
              stroke="#e2dcd4"
              strokeWidth="1.2"
            />
            {/* Laptop Display Bezel */}
            <rect
              x="20"
              y="22"
              width="65"
              height="39"
              rx="2"
              fill="#fbf9f6"
            />
            {/* Laptop Screen Content Lines */}
            <line x1="28" y1="30" x2="60" y2="30" stroke="#fed7aa" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="28" y1="36" x2="50" y2="36" stroke="#fed7aa" strokeWidth="2" strokeLinecap="round" />
            <line x1="28" y1="42" x2="68" y2="42" stroke="#f3ebe1" strokeWidth="2" strokeLinecap="round" />
            <line x1="28" y1="48" x2="58" y2="48" stroke="#f3ebe1" strokeWidth="2" strokeLinecap="round" />

            {/* Smartphone standing next to laptop */}
            <rect
              x="92"
              y="32"
              width="24"
              height="40"
              rx="4"
              fill="#ffffff"
              stroke="#e2dcd4"
              strokeWidth="1.2"
            />
            <rect
              x="95"
              y="36"
              width="18"
              height="32"
              rx="2"
              fill="#fbf9f6"
            />
            {/* Smartphone speaker / camera */}
            <line x1="101" y1="34" x2="107" y2="34" stroke="#d6cfc5" strokeWidth="1" strokeLinecap="round" />

            {/* Security Shield Badge */}
            <g transform="translate(112, 52)">
              <circle cx="9" cy="11" r="13" fill="#ffffff" filter="drop-shadow(0 2px 4px rgba(234, 88, 12, 0.15))" />
              <path
                d="M9 2 L17 5 V11 C17 16 13.5 19 9 20 C4.5 19 1 16 1 11 V5 L9 2 Z"
                fill="#ea580c"
              />
              <path
                d="M6 11 L8 13 L12 8"
                stroke="#ffffff"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          </svg>
        </div>
      </div>

      {/* Active Device Sessions List (if sessions exist) */}
      {sessions.length > 0 && (
        <div className={styles.deviceSessionsContainer}>
          <div className={styles.deviceSessionsHeaderRow}>
            <span className={styles.deviceSessionsTitle}>
              Authenticated Sessions ({sessions.length})
            </span>
            {sessions.length > 1 && (
              <button
                type="button"
                onClick={onSignOutEverywhere}
                disabled={isBusy}
                className={styles.signOutOtherDevicesBtn}
              >
                Sign Out Other Devices
              </button>
            )}
          </div>

          <div className={styles.deviceGrid}>
            {sessions.map((sess) => (
              <div
                key={sess.id}
                className={`${styles.deviceCard} ${sess.isCurrent ? styles.deviceCardActive : ""}`}
              >
                <div className={styles.deviceIconWrap}>
                  {sess.deviceInfo?.deviceType === "mobile" ? (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                      <line x1="12" y1="18" x2="12.01" y2="18" />
                    </svg>
                  ) : sess.deviceInfo?.deviceType === "tablet" ? (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
                      <line x1="12" y1="18" x2="12.01" y2="18" />
                    </svg>
                  ) : (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                      <line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                  )}
                </div>

                <div className={styles.deviceDetails}>
                  <div className={styles.deviceTitleRow}>
                    <strong className={styles.deviceName}>
                      {sess.deviceInfo?.browser || "Web Browser"} on{" "}
                      {sess.deviceInfo?.os || "Desktop Device"}
                    </strong>
                    {sess.isCurrent && (
                      <span className={styles.thisDeviceBadge}>This Device</span>
                    )}
                  </div>
                  <div className={styles.deviceMetaRow}>
                    <span>IP: {sess.ipAddress || "127.0.0.1"}</span>
                    <span>&bull;</span>
                    <span>
                      {sess.isCurrent
                        ? "Active now"
                        : `Last active ${new Date(sess.lastActive).toLocaleDateString()}`}
                    </span>
                  </div>
                </div>

                {!sess.isCurrent && (
                  <button
                    type="button"
                    onClick={() => onRevokeSession(sess.id)}
                    className={styles.revokeSessionBtn}
                    title="Revoke session"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
