"use client";

import React from "react";
import styles from "../profile.module.css";

export interface ProfileHeroCardProps {
  displayName: string;
  email: string;
  role: string;
  initials: string;
  accountType: string;
  onSignOut: () => void;
  onSignOutEverywhere: () => void;
  isBusy: boolean;
}

export default function ProfileHeroCard({
  displayName,
  email,
  initials,
  accountType,
  onSignOut,
  onSignOutEverywhere,
  isBusy,
}: ProfileHeroCardProps) {
  return (
    <article className={styles.heroCard} aria-label="Learner profile header">
      <div className={styles.heroLeft}>
        {/* Large Avatar with Warm Accent and Edit Pencil Indicator */}
        <div className={styles.heroAvatarWrap}>
          <div className={styles.heroAvatar} aria-label={displayName}>
            {initials}
          </div>
          <button
            type="button"
            className={styles.heroAvatarEditBadge}
            title="Profile photo"
            aria-label="Profile photo"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </button>
        </div>

        {/* Name, Email, and Role Badge */}
        <div className={styles.heroIdentity}>
          <h1 className={styles.heroName}>{displayName}</h1>
          <p className={styles.heroEmail}>{email}</p>
          <div className={styles.heroBadgesRow}>
            <span className={styles.heroRoleBadge}>{accountType}</span>
          </div>
        </div>
      </div>

      {/* Primary Action Buttons */}
      <div className={styles.heroActions}>
        <button
          type="button"
          onClick={onSignOut}
          className={styles.heroDarkBtn}
          aria-label="Sign out"
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

        <button
          type="button"
          onClick={onSignOutEverywhere}
          disabled={isBusy}
          className={styles.heroOutlineBtn}
          aria-label="Sign out of all devices"
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
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          <span>{isBusy ? "Signing Out..." : "Sign Out of All Devices"}</span>
        </button>
      </div>
    </article>
  );
}
