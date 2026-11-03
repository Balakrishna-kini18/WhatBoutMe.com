"use client";

import React from "react";
import styles from "../profile.module.css";

export interface ProfileHeroCardProps {
  displayName: string;
  email: string;
  role: string;
  initials: string;
  accountType: string;
  onSignOut?: () => void;
  onSignOutEverywhere?: () => void;
  isBusy?: boolean;
}

export default function ProfileHeroCard({
  displayName,
  email,
  initials,
  accountType,
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
    </article>
  );
}
