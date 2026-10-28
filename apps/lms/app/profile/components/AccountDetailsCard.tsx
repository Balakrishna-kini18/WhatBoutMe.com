"use client";

import React, { useState } from "react";
import styles from "../profile.module.css";

export interface AccountDetailsCardProps {
  fullName: string;
  email: string;
  phone: string;
  accountType: string;
}

export default function AccountDetailsCard({
  fullName,
  email,
  phone,
  accountType,
}: AccountDetailsCardProps) {
  const [showEditInfo, setShowEditInfo] = useState(false);

  return (
    <section className={styles.sectionCard} aria-labelledby="account-details-heading">
      {/* Section Header */}
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
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <div>
            <h2 id="account-details-heading" className={styles.sectionCardTitle}>
              Account Details
            </h2>
            <p className={styles.sectionCardSubtitle}>
              Your personal information and account details.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowEditInfo((prev) => !prev)}
          className={styles.editPillBtn}
          aria-label="Edit account details"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          <span>Edit</span>
        </button>
      </div>

      {showEditInfo && (
        <div className={styles.editNoticeBanner} role="status">
          <span>
            Profile details are centrally managed for compliance. To update your name or registered email, please reach out to your programme administrator.
          </span>
          <button
            type="button"
            className={styles.noticeCloseBtn}
            onClick={() => setShowEditInfo(false)}
            aria-label="Dismiss notice"
          >
            &times;
          </button>
        </div>
      )}

      {/* Details Table Rows */}
      <div className={styles.detailsList}>
        {/* Full Name */}
        <div className={styles.detailRow}>
          <div className={styles.detailLabelWrap}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={styles.detailRowIcon}
              aria-hidden="true"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span className={styles.detailLabel}>Full Name</span>
          </div>
          <span className={styles.detailValue}>{fullName}</span>
        </div>

        {/* Email Address */}
        <div className={styles.detailRow}>
          <div className={styles.detailLabelWrap}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={styles.detailRowIcon}
              aria-hidden="true"
            >
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
            <span className={styles.detailLabel}>Email Address</span>
          </div>
          <span className={styles.detailValueEmail}>{email}</span>
        </div>

        {/* Mobile Number */}
        <div className={styles.detailRow}>
          <div className={styles.detailLabelWrap}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={styles.detailRowIcon}
              aria-hidden="true"
            >
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
              <line x1="12" y1="18" x2="12.01" y2="18" />
            </svg>
            <span className={styles.detailLabel}>Mobile Number</span>
          </div>
          <span className={phone === "Not set" ? styles.detailValueMuted : styles.detailValue}>
            {phone}
          </span>
        </div>

        {/* Account Type */}
        <div className={styles.detailRow}>
          <div className={styles.detailLabelWrap}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={styles.detailRowIcon}
              aria-hidden="true"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span className={styles.detailLabel}>Account Type</span>
          </div>
          <div className={styles.accountTypePill}>
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="#ea580c"
              stroke="#ea580c"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14" />
            </svg>
            <span>{accountType}</span>
          </div>
        </div>
      </div>

      {/* Info notice box at bottom */}
      <div className={styles.programManagerNotice}>
        <div className={styles.infoIconWrap} aria-hidden="true">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        </div>
        <p className={styles.programManagerNoticeText}>
          To change your name, email or password, contact your programme manager.
        </p>
      </div>
    </section>
  );
}
