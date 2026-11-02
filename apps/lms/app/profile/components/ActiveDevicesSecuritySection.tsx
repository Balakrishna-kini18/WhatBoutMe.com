"use client";

import React, { useMemo } from "react";
import styles from "../profile.module.css";

export interface DeviceSession {
  id: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceFingerprint?: string | null;
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

interface UniqueDevice {
  key: string;
  primarySessionId: string;
  allSessionIds: string[];
  browser: string;
  os: string;
  deviceType: "desktop" | "mobile" | "tablet";
  ipAddress: string;
  lastActive: string;
  isCurrent: boolean;
}

export default function ActiveDevicesSecuritySection({
  sessions,
  onSignOutEverywhere,
  onRevokeSession,
  isBusy,
}: ActiveDevicesSecuritySectionProps) {
  // Deduplicate sessions for the same physical device so identical sessions aren't listed one-by-one
  const devices = useMemo(() => {
    const map = new Map<string, UniqueDevice>();

    for (const sess of sessions) {
      const browser = sess.deviceInfo?.browser || "Web Browser";
      const os = sess.deviceInfo?.os || "";
      const deviceType = sess.deviceInfo?.deviceType || "desktop";
      const ip = sess.ipAddress || "127.0.0.1";

      // Group key: fingerprint if present, else ip + browser + os + deviceType
      const key = sess.deviceFingerprint
        ? `fp:${sess.deviceFingerprint}`
        : `${ip}|${browser}|${os}|${deviceType}`;

      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          primarySessionId: sess.id,
          allSessionIds: [sess.id],
          browser,
          os,
          deviceType,
          ipAddress: ip,
          lastActive: sess.lastActive,
          isCurrent: !!sess.isCurrent,
        });
      } else {
        existing.allSessionIds.push(sess.id);
        if (sess.isCurrent) {
          existing.isCurrent = true;
          existing.primarySessionId = sess.id;
        }
        if (new Date(sess.lastActive).getTime() > new Date(existing.lastActive).getTime()) {
          existing.lastActive = sess.lastActive;
          if (!existing.isCurrent) {
            existing.primarySessionId = sess.id;
          }
        }
      }
    }

    // Sort: Current device first, then newest lastActive
    return Array.from(map.values()).sort((a, b) => {
      if (a.isCurrent) return -1;
      if (b.isCurrent) return 1;
      return new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime();
    });
  }, [sessions]);

  const getDeviceDisplayName = (device: UniqueDevice) => {
    const hasBrowser = device.browser && device.browser !== "Web Browser";
    const hasOs = device.os && device.os !== "Unknown OS" && device.os !== "Desktop Device";

    if (hasBrowser && hasOs) {
      return `${device.browser} on ${device.os}`;
    }
    if (hasBrowser) {
      return device.browser;
    }
    if (hasOs) {
      return `${device.os} Device`;
    }
    return device.isCurrent ? "Current Browser" : "Web Browser";
  };

  const handleRevokeDevice = (device: UniqueDevice) => {
    // Revoke all session IDs registered under this physical device
    for (const id of device.allSessionIds) {
      onRevokeSession(id);
    }
  };

  return (
    <section className={styles.sectionCard} aria-labelledby="active-devices-heading">
      {/* Clean Header: No walls of text or bulky illustrations */}
      <div className={styles.sectionHeaderRow}>
        <div className={styles.sectionTitleGroup}>
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
            <h2 id="active-devices-heading" className={styles.sectionCardTitle}>
              Active Devices &amp; Security
            </h2>
            <p className={styles.sectionCardSubtitle}>
              Devices currently signed in to your account.
            </p>
          </div>
        </div>

        {devices.length > 1 && (
          <button
            type="button"
            onClick={onSignOutEverywhere}
            disabled={isBusy}
            className={styles.signOutOtherDevicesBtn}
          >
            {isBusy ? "Signing Out..." : "Sign Out Other Devices"}
          </button>
        )}
      </div>

      {/* Device List */}
      {devices.length > 0 && (
        <div className={styles.deviceSessionsContainer}>
          <div className={styles.deviceGrid}>
            {devices.map((device) => (
              <div
                key={device.key}
                className={`${styles.deviceCard} ${device.isCurrent ? styles.deviceCardActive : ""}`}
              >
                <div className={styles.deviceIconWrap}>
                  {device.deviceType === "mobile" ? (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                      <line x1="12" y1="18" x2="12.01" y2="18" />
                    </svg>
                  ) : device.deviceType === "tablet" ? (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
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
                      aria-hidden="true"
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
                      {getDeviceDisplayName(device)}
                    </strong>
                    {device.isCurrent && (
                      <span className={styles.thisDeviceBadge}>This Device</span>
                    )}
                  </div>
                  <div className={styles.deviceMetaRow}>
                    <span>IP: {device.ipAddress}</span>
                    <span>&bull;</span>
                    <span>
                      {device.isCurrent
                        ? "Active now"
                        : `Last active ${new Date(device.lastActive).toLocaleDateString()}`}
                    </span>
                  </div>
                </div>

                {!device.isCurrent && (
                  <button
                    type="button"
                    onClick={() => handleRevokeDevice(device)}
                    className={styles.revokeSessionBtn}
                    title="Revoke device access"
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
