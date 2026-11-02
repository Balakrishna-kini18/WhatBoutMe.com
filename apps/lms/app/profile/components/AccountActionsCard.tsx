"use client";

import React from "react";
import styles from "../profile.module.css";

export interface AccountActionsCardProps {
  onSignOut: () => void;
  onSignOutEverywhere: () => void;
  isBusy: boolean;
}

export default function AccountActionsCard({
  onSignOut,
  onSignOutEverywhere,
  isBusy,
}: AccountActionsCardProps) {
  return (
    <section className={styles.signOutSectionCard} aria-labelledby="account-actions-heading">
      {/* Header */}
      <div className={styles.signOutHeaderRow}>
        <div className={styles.signOutTitleGroup}>
          <div className={styles.signOutHeaderIcon}>
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
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </div>
          <div>
            <h2 id="account-actions-heading" className={styles.sectionCardTitle}>
              Account Session &amp; Sign Out
            </h2>
            <p className={styles.sectionCardSubtitle}>
              Sign out of this browser or all devices.
            </p>
          </div>
        </div>
      </div>

      {/* Action Rows */}
      <div className={styles.signOutItemsList}>
        {/* Row 1: Sign Out Current Session */}
        <div className={styles.signOutItemRow}>
          <div className={styles.signOutItemInfo}>
            <div className={styles.signOutItemTitle}>
              <span>Sign Out of Current Session</span>
              <span className={styles.sessionBadgeThisDevice}>This Device</span>
            </div>
            <p className={styles.signOutItemDesc}>
              Sign out from this browser session.
            </p>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className={styles.signOutActionBtnPrimary}
            aria-label="Sign out of this browser"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Sign Out</span>
          </button>
        </div>

        {/* Row 2: Sign Out of All Devices */}
        <div className={styles.signOutItemRow}>
          <div className={styles.signOutItemInfo}>
            <div className={styles.signOutItemTitle}>
              <span>Sign Out of All Devices</span>
              <span className={styles.sessionBadgeAll}>All Devices</span>
            </div>
            <p className={styles.signOutItemDesc}>
              Sign out across all devices and browsers.
            </p>
          </div>
          <button
            type="button"
            onClick={onSignOutEverywhere}
            disabled={isBusy}
            className={styles.signOutActionBtnOutline}
            aria-label="Sign out of all devices"
          >
            {isBusy ? (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={styles.spinIcon}
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" strokeOpacity="0.25" stroke="currentColor" strokeWidth="3" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            ) : (
              <svg
                width="16"
                height="16"
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
            <span>{isBusy ? "Signing Out..." : "Sign Out of All Devices"}</span>
          </button>
        </div>
      </div>
    </section>
  );
}
